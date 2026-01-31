/**
 * Agentic QE v3 - HTTP Server
 * Express server for AG-UI SSE/WebSocket, A2A discovery, and A2UI surfaces
 *
 * This server runs alongside the stdio MCP server to provide:
 * - AG-UI Protocol: SSE streaming at /agent/stream (default, unidirectional)
 * - AG-UI Protocol: WebSocket streaming at /agent/ws (bidirectional, <100ms latency)
 * - A2A Protocol: Agent discovery at /.well-known/agent.json
 * - A2A Protocol: Task submission at /a2a/tasks
 *
 * @module mcp/http-server
 */

import { createServer, type Server } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// AG-UI imports
import {
  createEventAdapter,
  type EventAdapter,
} from '../adapters/ag-ui/index.js';

// A2A imports
import {
  createDiscoveryService,
  type DiscoveryService,
  getDiscoveryRouteDefinitions,
  type RouteDefinition,
  type HttpRequest,
  type HttpResponse,
  // Hot reload and health
  createHotReloadService,
  createAgentHealthChecker,
  createAgentFileWatcher,
  type HotReloadService,
  type AgentHealthChecker,
} from '../adapters/a2a/discovery/index.js';

import {
  createTaskManager,
  createTaskStore,
  type TaskManager,
  type TaskStore,
} from '../adapters/a2a/tasks/index.js';

import type { A2AMessage } from '../adapters/a2a/jsonrpc/methods.js';

// OAuth imports
import {
  createJWTMiddleware,
  type JWTVerifier,
  type JWTMiddlewareOptions,
  type JWTAuthenticatedRequest,
} from '../adapters/a2a/auth/middleware.js';

// Push Notifications imports
import {
  createWebhookService,
  createSubscriptionStore,
  type WebhookService,
  type SubscriptionStore,
  type WebhookConfig,
} from '../adapters/a2a/notifications/index.js';

import {
  createAgentCardGenerator,
  type AgentCardGenerator,
} from '../adapters/index.js';

// SSE Transport
import {
  createSSETransport,
  type SSETransport,
} from './transport/sse/index.js';

// WebSocket Transport
import {
  createWebSocketTransport,
  type WebSocketTransport,
  type WebSocketTransportConfig,
} from './transport/websocket/index.js';

import type {
  AgentRequest,
  AGUIEvent,
  EventEmitter as SSEEventEmitter,
} from './transport/sse/types.js';
import { AGUIEventType } from './transport/sse/types.js';

// Memory for CRDT
import { getUnifiedMemory } from '../kernel/unified-memory.js';

// ============================================================================
// Types
// ============================================================================

export interface HTTPServerConfig {
  /** Event adapter for AG-UI streaming */
  eventAdapter?: EventAdapter;
  /** Agent card generator for A2A discovery */
  agentCardGenerator?: AgentCardGenerator;
  /** Discovery service for A2A */
  discoveryService?: DiscoveryService;
  /** Task manager for A2A */
  taskManager?: TaskManager;
  /** SSE transport for streaming */
  sseTransport?: SSETransport;
  /** WebSocket transport for bidirectional streaming */
  webSocketTransport?: WebSocketTransport;
  /** WebSocket transport configuration */
  webSocketConfig?: WebSocketTransportConfig;
  /** Enable WebSocket transport (default: true) */
  enableWebSocket?: boolean;
  /** Enable CORS headers */
  enableCors?: boolean;
  /** Agent markdown directory for card generation */
  agentMarkdownDir?: string;
  /** Skip loading agent cards (for testing) */
  skipAgentCardLoading?: boolean;
  /** Skip CRDT initialization (for testing) */
  skipCRDTInit?: boolean;

  // ========================================
  // OAuth 2.0 Configuration (ADR-054)
  // ========================================
  /** JWT verifier for OAuth 2.0 authentication */
  jwtVerifier?: JWTVerifier;
  /** OAuth configuration */
  oauthConfig?: {
    issuer?: string;
    audience?: string;
    clockTolerance?: number;
  };
  /** Enable OAuth protection on A2A routes (default: false) */
  enableOAuth?: boolean;

  // ========================================
  // Push Notifications Configuration (ADR-054)
  // ========================================
  /** Webhook service for push notifications */
  webhookService?: WebhookService;
  /** Subscription store for managing webhook subscriptions */
  subscriptionStore?: SubscriptionStore;
  /** Enable push notifications (default: true if webhookService provided) */
  enablePushNotifications?: boolean;

  // ========================================
  // Hot Reload Configuration (ADR-054)
  // ========================================
  /** Hot reload service for dynamic agent discovery */
  hotReloadService?: HotReloadService;
  /** Agent health checker */
  healthChecker?: AgentHealthChecker;
  /** Enable hot reload (default: false) */
  enableHotReload?: boolean;
  /** Debounce time for hot reload (default: 1000ms) */
  hotReloadDebounceMs?: number;
}

export interface HTTPServer {
  /** Start the HTTP server */
  start(port: number): Promise<void>;
  /** Stop the HTTP server */
  stop(): Promise<void>;
  /** Get the event adapter */
  getEventAdapter(): EventAdapter;
  /** Get the discovery service */
  getDiscoveryService(): DiscoveryService;
  /** Get the task manager */
  getTaskManager(): TaskManager;
  /** Get underlying HTTP server */
  getServer(): Server | null;
  /** Get WebSocket transport */
  getWebSocketTransport(): WebSocketTransport | null;
  /** Check if server is running */
  isRunning(): boolean;
  /** Check if agent cards are loaded */
  hasLoadedAgentCards(): boolean;
  /** Check if WebSocket is enabled */
  isWebSocketEnabled(): boolean;
}

// ============================================================================
// Simple Router
// ============================================================================

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

class SimpleRouter {
  private routes: Route[] = [];

  add(method: string, path: string, handler: RouteHandler): void {
    // Convert Express-style path params to regex
    const paramNames: string[] = [];
    const patternStr = path.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const pattern = new RegExp(`^${patternStr}$`);
    this.routes.push({ method: method.toUpperCase(), pattern, paramNames, handler });
  }

  match(method: string, path: string): { handler: RouteHandler; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase() && route.method !== 'ALL') {
        continue;
      }
      const match = path.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });
        return { handler: route.handler, params };
      }
    }
    return null;
  }
}

// ============================================================================
// HTTP Server Implementation
// ============================================================================

class HTTPServerImpl implements HTTPServer {
  private readonly eventAdapter: EventAdapter;
  private readonly discoveryService: DiscoveryService;
  private readonly taskManager: TaskManager;
  private readonly taskStore: TaskStore;
  private readonly sseTransport: SSETransport;
  private readonly webSocketTransport: WebSocketTransport | null;
  private readonly enableWebSocket: boolean;
  private readonly router: SimpleRouter;
  private readonly agentMarkdownDir: string;
  private readonly skipAgentCardLoading: boolean;
  private readonly skipCRDTInit: boolean;
  private server: Server | null = null;
  private running = false;
  private agentCardsLoaded = false;
  private readonly enableCors: boolean;

  // OAuth 2.0 (ADR-054)
  private readonly jwtVerifier?: JWTVerifier;
  private readonly enableOAuth: boolean;
  private authMiddleware?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

  // Push Notifications (ADR-054)
  private readonly webhookService?: WebhookService;
  private readonly subscriptionStore?: SubscriptionStore;
  private readonly enablePushNotifications: boolean;

  // Hot Reload (ADR-054)
  private readonly hotReloadService?: HotReloadService;
  private readonly healthChecker?: AgentHealthChecker;
  private readonly enableHotReload: boolean;

  constructor(config: HTTPServerConfig = {}) {
    // Initialize components with defaults
    this.eventAdapter = config.eventAdapter ?? createEventAdapter();
    this.enableCors = config.enableCors ?? true;
    this.skipAgentCardLoading = config.skipAgentCardLoading ?? false;
    this.skipCRDTInit = config.skipCRDTInit ?? false;
    this.enableWebSocket = config.enableWebSocket ?? true;

    // Resolve agent markdown directory
    const currentDir = dirname(fileURLToPath(import.meta.url));
    this.agentMarkdownDir = config.agentMarkdownDir ?? join(currentDir, '../../assets/agents/v3');

    // Initialize task store and manager
    this.taskStore = createTaskStore();
    this.taskManager = config.taskManager ?? createTaskManager({
      storeConfig: {},
    });

    // Initialize agent card generator and discovery service
    const baseUrl = 'http://localhost:' + (process.env.AQE_HTTP_PORT || '3000');
    const agentCardGenerator = config.agentCardGenerator ?? createAgentCardGenerator({
      baseUrl,
    });

    this.discoveryService = config.discoveryService ?? createDiscoveryService({
      generator: agentCardGenerator,
      baseUrl,
    });

    // Initialize SSE transport (default, unidirectional)
    this.sseTransport = config.sseTransport ?? createSSETransport();

    // CRITICAL: Wire the SSE agent handler to process requests
    this.sseTransport.setAgentHandler(this.handleAgentRequest.bind(this));

    // Initialize WebSocket transport (optional, bidirectional <100ms latency)
    if (this.enableWebSocket) {
      this.webSocketTransport = config.webSocketTransport ?? createWebSocketTransport(config.webSocketConfig);
      // Wire the WebSocket agent handler (same handler as SSE)
      this.webSocketTransport.setAgentHandler(this.handleAgentRequest.bind(this));
    } else {
      this.webSocketTransport = null;
    }

    // ========================================
    // OAuth 2.0 Initialization (ADR-054)
    // ========================================
    this.jwtVerifier = config.jwtVerifier;
    this.enableOAuth = config.enableOAuth ?? false;

    if (this.jwtVerifier && this.enableOAuth) {
      // Create auth middleware that returns true if auth passes
      this.authMiddleware = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          res.setHeader('WWW-Authenticate', 'Bearer');
          this.sendError(res, 401, 'Authentication required');
          return false;
        }
        const token = authHeader.substring(7);
        try {
          const claims = await this.jwtVerifier!.verify(token);
          (req as IncomingMessage & { user?: unknown }).user = claims;
          return true;
        } catch {
          res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
          this.sendError(res, 401, 'Invalid or expired token');
          return false;
        }
      };
    }

    // ========================================
    // Push Notifications Initialization (ADR-054)
    // ========================================
    this.subscriptionStore = config.subscriptionStore ?? createSubscriptionStore();
    this.webhookService = config.webhookService ?? createWebhookService();
    this.enablePushNotifications = config.enablePushNotifications ?? true;

    // Wire task events to webhook notifications
    if (this.enablePushNotifications && this.webhookService) {
      this.taskManager.on('stateChange', (event: { taskId: string; newStatus: string; previousStatus?: string; task?: unknown }) => {
        this.webhookService!.notifyStateChange(
          event.taskId,
          event.newStatus as 'submitted' | 'working' | 'completed' | 'failed' | 'canceled' | 'input_required' | 'auth_required' | 'rejected',
          event.previousStatus as 'submitted' | 'working' | 'completed' | 'failed' | 'canceled' | 'input_required' | 'auth_required' | 'rejected' | undefined
        ).catch((err: unknown) => console.error('[AQE] Webhook delivery failed:', err));
      });

      this.taskManager.on('artifactAdded', (event: { taskId: string; artifact: { id?: string; name?: string } }) => {
        this.webhookService!.notifyArtifactCreated(event.taskId, {
          id: event.artifact.id ?? 'unknown',
          name: event.artifact.name ?? 'artifact',
        }).catch((err: unknown) => console.error('[AQE] Artifact webhook delivery failed:', err));
      });
    }

    // ========================================
    // Hot Reload Initialization (ADR-054)
    // ========================================
    this.enableHotReload = config.enableHotReload ?? false;
    this.healthChecker = config.healthChecker;
    this.hotReloadService = config.hotReloadService;

    // Setup router
    this.router = new SimpleRouter();
    this.setupRoutes();
  }

  // ============================================================================
  // SSE Agent Handler - THE CRITICAL INTEGRATION POINT
  // ============================================================================

  /**
   * Handle AG-UI agent requests via SSE
   * This is the main integration point between AG-UI protocol and A2A task system
   */
  private async handleAgentRequest(
    request: AgentRequest,
    emit: SSEEventEmitter,
    signal: AbortSignal
  ): Promise<void> {
    // Extract message content from request
    const messageContent = request.messages?.map(m => m.content).join('\n') || '';

    if (!messageContent) {
      emit({
        type: AGUIEventType.RUN_ERROR,
        runId: request.runId || 'unknown',
        message: 'No message content provided',
        code: 'INVALID_REQUEST',
      });
      return;
    }

    // Create A2A task from AG-UI request
    const task = this.taskManager.createTask(
      {
        role: 'user',
        parts: [{ type: 'text', text: messageContent }],
      } as A2AMessage,
      { contextId: request.threadId }
    );

    // Emit STEP_STARTED for task creation
    emit({
      type: AGUIEventType.STEP_STARTED,
      stepId: task.id,
      name: 'Task Processing',
      runId: request.runId,
    });

    // Subscribe to task events and forward to SSE
    const taskEventHandler = (event: { taskId: string; newStatus?: string; task?: unknown }) => {
      if (event.taskId !== task.id || signal.aborted) return;

      // Emit appropriate AG-UI events based on task state changes
      if (event.newStatus === 'working') {
        emit({
          type: AGUIEventType.TEXT_MESSAGE_START,
          messageId: `msg-${task.id}`,
          role: 'assistant',
        });
      } else if (event.newStatus === 'completed') {
        emit({
          type: AGUIEventType.TEXT_MESSAGE_CONTENT,
          messageId: `msg-${task.id}`,
          delta: 'Task completed successfully',
        });
        emit({
          type: AGUIEventType.TEXT_MESSAGE_END,
          messageId: `msg-${task.id}`,
        });
        emit({
          type: AGUIEventType.STEP_FINISHED,
          stepId: task.id,
          result: event.task,
        });
      } else if (event.newStatus === 'failed') {
        emit({
          type: AGUIEventType.STEP_FINISHED,
          stepId: task.id,
          result: { error: 'Task failed' },
        });
      }
    };

    const artifactHandler = (event: { taskId: string; artifact?: { name?: string; parts?: Array<{ type: string; text?: string }> } }) => {
      if (event.taskId !== task.id || signal.aborted) return;

      // Emit artifact as text message content
      const textParts = event.artifact?.parts?.filter(p => p.type === 'text') || [];
      for (const part of textParts) {
        if (part.text) {
          emit({
            type: AGUIEventType.TEXT_MESSAGE_CONTENT,
            messageId: `msg-${task.id}`,
            delta: part.text,
          });
        }
      }
    };

    this.taskManager.on('stateChange', taskEventHandler);
    this.taskManager.on('artifactAdded', artifactHandler);

    // Handle abort signal
    signal.addEventListener('abort', () => {
      this.taskManager.off('stateChange', taskEventHandler);
      this.taskManager.off('artifactAdded', artifactHandler);
      try {
        this.taskManager.cancelTask(task.id);
      } catch {
        // Task may already be in terminal state
      }
    });

    // Start task processing
    try {
      this.taskManager.startTask(task.id);

      // Simulate task completion for now (in production, this would delegate to actual handlers)
      // TODO: Wire to actual MCP tool handlers
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!signal.aborted) {
        this.taskManager.completeTask(task.id, [
          this.taskManager.createTextArtifact(
            `result-${task.id}`,
            'Result',
            `Processed: ${messageContent}`
          ),
        ]);
      }
    } catch (error) {
      if (!signal.aborted) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.taskManager.failTask(task.id, {
          code: 'PROCESSING_ERROR',
          message: errorMessage,
        });
      }
    } finally {
      // Cleanup listeners
      this.taskManager.off('stateChange', taskEventHandler);
      this.taskManager.off('artifactAdded', artifactHandler);
    }
  }

  // ============================================================================
  // Route Setup
  // ============================================================================

  private setupRoutes(): void {
    // Get discovery route definitions
    const discoveryRoutes = getDiscoveryRouteDefinitions({
      discoveryService: this.discoveryService,
    });

    // Register discovery routes
    for (const route of discoveryRoutes) {
      const handler = this.createHandlerFromDefinition(route);
      this.router.add(route.method, route.path, handler);
    }

    // A2A Task routes
    this.router.add('POST', '/a2a/tasks', this.handleTaskSubmit.bind(this));
    this.router.add('GET', '/a2a/tasks/:taskId', this.handleTaskGet.bind(this));
    this.router.add('POST', '/a2a/tasks/:taskId/cancel', this.handleTaskCancel.bind(this));
    this.router.add('GET', '/a2a/tasks/:taskId/subscribe', this.handleTaskSubscribe.bind(this));
    this.router.add('GET', '/a2a/tasks', this.handleTaskList.bind(this));

    // Push Notification routes (ADR-054)
    if (this.enablePushNotifications) {
      this.router.add('POST', '/a2a/tasks/:taskId/pushNotification', this.handlePushNotificationSet.bind(this));
      this.router.add('GET', '/a2a/tasks/:taskId/pushNotification', this.handlePushNotificationGet.bind(this));
      this.router.add('DELETE', '/a2a/tasks/:taskId/pushNotification', this.handlePushNotificationDelete.bind(this));
    }

    // AG-UI SSE streaming endpoint
    this.router.add('POST', '/agent/stream', this.handleAgentStream.bind(this));
    this.router.add('OPTIONS', '/agent/stream', this.handleCorsPreFlight.bind(this));

    // Health check
    this.router.add('GET', '/health', this.handleHealth.bind(this));
  }

  private createHandlerFromDefinition(route: RouteDefinition): RouteHandler {
    return async (req: IncomingMessage, res: ServerResponse) => {
      // Create Express-compatible request/response wrappers
      const httpReq = this.wrapRequest(req);
      const httpRes = this.wrapResponse(res);

      // Execute all handlers in sequence
      for (const handler of route.handlers) {
        await handler(httpReq, httpRes);
        if (res.writableEnded) break;
      }
    };
  }

  // ============================================================================
  // Request/Response Wrappers
  // ============================================================================

  private wrapRequest(req: IncomingMessage & { params?: Record<string, string>; body?: unknown }): HttpRequest {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const query: Record<string, string | string[] | undefined> = {};

    url.searchParams.forEach((value, key) => {
      const existing = query[key];
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          query[key] = [existing, value];
        }
      } else {
        query[key] = value;
      }
    });

    return {
      params: req.params || {},
      query,
      headers: req.headers as Record<string, string | string[] | undefined>,
      header: (name: string) => {
        const value = req.headers[name.toLowerCase()];
        return Array.isArray(value) ? value[0] : value;
      },
    };
  }

  private wrapResponse(res: ServerResponse): HttpResponse {
    return {
      status: (code: number) => {
        res.statusCode = code;
        return this.wrapResponse(res);
      },
      json: (body: unknown) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(body));
      },
      setHeader: (name: string, value: string | number) => {
        res.setHeader(name, value);
      },
      end: () => {
        res.end();
      },
    };
  }

  // ============================================================================
  // Task Handlers
  // ============================================================================

  private async handleTaskSubmit(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.parseBody(req);
      const { message, contextId } = body as { message: { role: string; parts: unknown[] }; contextId?: string };

      if (!message) {
        this.sendError(res, 400, 'Missing required field: message');
        return;
      }

      // TaskManager.createTask expects (A2AMessage, CreateTaskOptions?)
      const task = this.taskManager.createTask(
        message as A2AMessage,
        { contextId },
      );

      this.setCorsHeaders(res);
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 201;
      res.end(JSON.stringify({ task }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit task';
      this.sendError(res, 500, message);
    }
  }

  private async handleTaskGet(req: IncomingMessage & { params?: Record<string, string> }, res: ServerResponse): Promise<void> {
    try {
      const taskId = req.params?.taskId;
      if (!taskId) {
        this.sendError(res, 400, 'Missing task ID');
        return;
      }

      const task = await this.taskStore.get(taskId);
      if (!task) {
        this.sendError(res, 404, 'Task not found');
        return;
      }

      this.setCorsHeaders(res);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ task }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get task';
      this.sendError(res, 500, message);
    }
  }

  private async handleTaskCancel(req: IncomingMessage & { params?: Record<string, string> }, res: ServerResponse): Promise<void> {
    try {
      const taskId = req.params?.taskId;
      if (!taskId) {
        this.sendError(res, 400, 'Missing task ID');
        return;
      }

      await this.taskManager.cancelTask(taskId);

      this.setCorsHeaders(res);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel task';
      this.sendError(res, 500, message);
    }
  }

  private async handleTaskSubscribe(req: IncomingMessage & { params?: Record<string, string> }, res: ServerResponse): Promise<void> {
    const taskId = req.params?.taskId;
    if (!taskId) {
      this.sendError(res, 400, 'Missing task ID');
      return;
    }

    const task = await this.taskStore.get(taskId);
    if (!task) {
      this.sendError(res, 404, 'Task not found');
      return;
    }

    // Set SSE headers
    this.setCorsHeaders(res);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial state
    res.write(`data: ${JSON.stringify({ type: 'task_state', task })}\n\n`);

    // Subscribe to task events using EventEmitter
    const onStateChange = (event: unknown) => {
      const e = event as { taskId: string };
      if (e.taskId === taskId && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    const onArtifact = (event: unknown) => {
      const e = event as { taskId: string };
      if (e.taskId === taskId && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    this.taskManager.on('stateChange', onStateChange);
    this.taskManager.on('artifactAdded', onArtifact);

    // Handle client disconnect
    req.on('close', () => {
      this.taskManager.off('stateChange', onStateChange);
      this.taskManager.off('artifactAdded', onArtifact);
    });
  }

  private async handleTaskList(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const status = url.searchParams.get('status') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);

      const result = await this.taskStore.query({ status: status as 'submitted' | 'working' | 'completed' | 'failed' | 'canceled', limit });

      this.setCorsHeaders(res);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list tasks';
      this.sendError(res, 500, message);
    }
  }

  // ============================================================================
  // Push Notification Handlers (ADR-054)
  // ============================================================================

  private async handlePushNotificationSet(
    req: IncomingMessage & { params?: Record<string, string> },
    res: ServerResponse
  ): Promise<void> {
    try {
      const taskId = req.params?.taskId;
      if (!taskId) {
        this.sendError(res, 400, 'Missing task ID');
        return;
      }

      const body = await this.parseBody(req);
      const { url, token, events } = body as {
        url: string;
        token?: string;
        events?: string[];
      };

      if (!url) {
        this.sendError(res, 400, 'Missing required field: url');
        return;
      }

      // Validate URL
      try {
        new URL(url);
      } catch {
        this.sendError(res, 400, 'Invalid webhook URL');
        return;
      }

      // Create subscription
      if (this.subscriptionStore) {
        const webhookEvents: Array<'task.submitted' | 'task.working' | 'task.completed' | 'task.failed' | 'task.canceled' | 'task.input_required' | 'task.auth_required' | 'task.rejected' | 'task.artifact_created'> =
          (events as Array<'task.completed' | 'task.failed'>) || ['task.completed', 'task.failed'];
        this.subscriptionStore.create(taskId, {
          url,
          secret: token || '',
          events: webhookEvents,
          timeout: 30000,
          maxRetries: 5,
        });
      }

      this.setCorsHeaders(res);
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set push notification';
      this.sendError(res, 500, message);
    }
  }

  private async handlePushNotificationGet(
    req: IncomingMessage & { params?: Record<string, string> },
    res: ServerResponse
  ): Promise<void> {
    try {
      const taskId = req.params?.taskId;
      if (!taskId) {
        this.sendError(res, 400, 'Missing task ID');
        return;
      }

      const subscriptions = this.subscriptionStore?.listByTask(taskId) || [];
      if (subscriptions.length === 0) {
        this.sendError(res, 404, 'No push notification configured for this task');
        return;
      }

      const subscription = subscriptions[0];
      this.setCorsHeaders(res);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        url: subscription.webhookConfig.url,
        events: subscription.webhookConfig.events,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get push notification';
      this.sendError(res, 500, message);
    }
  }

  private async handlePushNotificationDelete(
    req: IncomingMessage & { params?: Record<string, string> },
    res: ServerResponse
  ): Promise<void> {
    try {
      const taskId = req.params?.taskId;
      if (!taskId) {
        this.sendError(res, 400, 'Missing task ID');
        return;
      }

      // Remove all subscriptions for this task
      const subscriptions = this.subscriptionStore?.listByTask(taskId) || [];
      for (const sub of subscriptions) {
        this.subscriptionStore?.delete(sub.id);
      }

      this.setCorsHeaders(res);
      res.statusCode = 204;
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete push notification';
      this.sendError(res, 500, message);
    }
  }

  // ============================================================================
  // AG-UI Handler
  // ============================================================================

  private async handleAgentStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Delegate to SSE transport (which now has the handler wired)
    await this.sseTransport.handleRequest(req, res);
  }

  // ============================================================================
  // Utility Handlers
  // ============================================================================

  private handleCorsPreFlight(_req: IncomingMessage, res: ServerResponse): void {
    this.setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
  }

  private handleHealth(_req: IncomingMessage, res: ServerResponse): void {
    this.setCorsHeaders(res);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      status: 'ok',
      version: '3.0.0',
      protocols: ['ag-ui', 'a2a', 'a2ui'],
      agentCardsLoaded: this.agentCardsLoaded,
      agentCount: this.discoveryService.getAgentCount(),
      timestamp: new Date().toISOString(),
    }));
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const maxSize = 1024 * 1024; // 1MB

      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxSize) {
          reject(new Error('Request body too large'));
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          if (!body) {
            resolve({});
            return;
          }
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('Invalid JSON in request body'));
        }
      });

      req.on('error', reject);
    });
  }

  private setCorsHeaders(res: ServerResponse): void {
    if (this.enableCors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
  }

  private sendError(res: ServerResponse, code: number, message: string): void {
    this.setCorsHeaders(res);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = code;
    res.end(JSON.stringify({ error: { code, message } }));
  }

  // ============================================================================
  // Server Lifecycle
  // ============================================================================

  async start(port: number): Promise<void> {
    if (this.running) {
      throw new Error('Server already running');
    }

    // CRITICAL: Initialize CRDT for distributed state
    if (!this.skipCRDTInit) {
      try {
        const memory = getUnifiedMemory();
        if (!memory.isCRDTInitialized()) {
          memory.initializeCRDT(`aqe-http-${process.pid}-${Date.now()}`);
          console.error('[AQE] CRDT store initialized');
        }
      } catch (error) {
        console.error('[AQE] WARNING: Failed to initialize CRDT:', error);
        // Non-fatal, continue without CRDT
      }
    }

    // CRITICAL: Load agent cards before accepting connections
    if (!this.skipAgentCardLoading) {
      try {
        await this.discoveryService.loadCards(this.agentMarkdownDir);
        this.agentCardsLoaded = true;
        console.error(`[AQE] Loaded ${this.discoveryService.getAgentCount()} agent cards`);
      } catch (error) {
        console.error('[AQE] WARNING: Failed to load agent cards:', error);
        // Non-fatal, discovery will return empty results
      }
    }

    return new Promise(async (resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleHttpRequest(req, res).catch((error) => {
          console.error('[HTTP] Request error:', error);
          this.sendError(res, 500, 'Internal server error');
        });
      });

      this.server.on('error', (error) => {
        reject(error);
      });

      // Attach WebSocket transport for bidirectional streaming
      if (this.webSocketTransport && this.enableWebSocket) {
        try {
          await this.webSocketTransport.attach(this.server, '/agent/ws');
          console.error('[AQE] WebSocket transport attached at /agent/ws');
        } catch (error) {
          console.error('[AQE] WARNING: Failed to attach WebSocket transport:', error);
          // Non-fatal, SSE is still available as fallback
        }
      }

      // Start hot reload watcher if enabled (ADR-054)
      if (this.enableHotReload && this.hotReloadService) {
        this.hotReloadService.start().then(() => {
          console.error('[AQE] Hot reload enabled for agent cards');
        }).catch(err => {
          console.error('[AQE] WARNING: Failed to start hot reload:', err);
        });
      }

      this.server.listen(port, () => {
        this.running = true;
        console.error(`[AQE] HTTP server started on port ${port}`);
        console.error(`[AQE] Endpoints ready:`);
        console.error(`[AQE]   GET  /.well-known/agent.json - Platform discovery (${this.discoveryService.getAgentCount()} agents)`);
        console.error(`[AQE]   POST /agent/stream          - AG-UI SSE streaming (default)`);
        if (this.webSocketTransport) {
          console.error(`[AQE]   WS   /agent/ws              - AG-UI WebSocket streaming (<100ms latency)`);
        }
        console.error(`[AQE]   POST /a2a/tasks             - A2A task submission`);
        if (this.enablePushNotifications) {
          console.error(`[AQE]   POST /a2a/tasks/:id/pushNotification - Push notification subscription`);
        }
        if (this.enableOAuth) {
          console.error(`[AQE]   OAuth 2.0 protection enabled`);
        }
        if (this.enableHotReload) {
          console.error(`[AQE]   Hot reload enabled for agent cards`);
        }
        console.error(`[AQE]   GET  /health                - Health check`);
        resolve();
      });
    });
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    // Try to match route
    const match = this.router.match(method, path);

    if (match) {
      // Attach params to request
      (req as IncomingMessage & { params: Record<string, string> }).params = match.params;
      await match.handler(req, res);
    } else {
      // 404 Not Found
      this.sendError(res, 404, 'Not found');
    }
  }

  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false;
        this.server = null;
        console.error('[AQE] HTTP server stopped');
        resolve();
      });

      // Close SSE transport
      this.sseTransport.dispose();

      // Close WebSocket transport
      if (this.webSocketTransport) {
        this.webSocketTransport.dispose();
      }
    });
  }

  // ============================================================================
  // Accessors
  // ============================================================================

  getEventAdapter(): EventAdapter {
    return this.eventAdapter;
  }

  getDiscoveryService(): DiscoveryService {
    return this.discoveryService;
  }

  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  getServer(): Server | null {
    return this.server;
  }

  getWebSocketTransport(): WebSocketTransport | null {
    return this.webSocketTransport;
  }

  isRunning(): boolean {
    return this.running;
  }

  hasLoadedAgentCards(): boolean {
    return this.agentCardsLoaded;
  }

  isWebSocketEnabled(): boolean {
    return this.enableWebSocket && this.webSocketTransport !== null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createHTTPServer(config?: HTTPServerConfig): HTTPServer {
  return new HTTPServerImpl(config);
}
