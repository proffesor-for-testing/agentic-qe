/**
 * Agentic QE v3 - MCP Protocol Server
 * Full MCP 2025-11-25 protocol implementation with stdio transport
 * Based on claude-flow MCP implementation
 *
 * ADR-039: Integrated with connection pooling, load balancing, and performance monitoring
 */

import {
  StdioTransport,
  createStdioTransport,
  JSONRPCRequest,
  JSON_RPC_ERRORS,
} from './transport';
import { ToolRegistry, createToolRegistry } from './tool-registry';
import { ToolDefinition } from './types';
import { MiddlewareChain, type ToolCallContext, type ToolMiddleware } from './middleware/middleware-chain';
import { createMicrocompactMiddleware } from './middleware/microcompact';
import { SessionStore } from './services/session-store';
import { createSessionDurabilityMiddleware } from './services/session-durability-middleware';
import { withRetry } from '../shared/retry-engine';
import { CompactionPipeline } from '../context/compaction';
import { createLLMCompactCaller } from '../context/compaction/llm-caller-adapter';

// AG-UI EventAdapter for streaming events
import {
  createEventAdapter,
  type EventAdapter,
  type AQEToolProgress,
  type AQEToolResult,
} from '../adapters/ag-ui/index.js';

import {
  handleFleetInit,
  handleFleetStatus,
  handleFleetHealth,
  handleAQEHealth,
  disposeFleet,
  handleTaskSubmit,
  handleTaskList,
  handleTaskStatus,
  handleTaskCancel,
  handleTaskOrchestrate,
  // ADR-051: Model routing handlers
  handleModelRoute,
  handleRoutingMetrics,
  // Imp-18: Economic routing handler
  handleRoutingEconomics,
  handleAgentList,
  handleAgentSpawn,
  handleAgentMetrics,
  handleAgentStatus,
  handleTestGenerate,
  handleTestExecute,
  handleCoverageAnalyze,
  handleQualityAssess,
  handleSecurityScan,
  handleContractValidate,
  handleAccessibilityTest,
  handleChaosTest,
  handleDefectPredict,
  handleRequirementsValidate,
  handleCodeIndex,
  handleMemoryStore,
  handleMemoryRetrieve,
  handleMemoryQuery,
  handleMemoryDelete,
  handleMemoryUsage,
  handleMemoryShare,
  // ADR-057: Infrastructure self-healing handlers
  handleInfraHealingStatus,
  handleInfraHealingFeedOutput,
  handleInfraHealingRecover,
  // ADR-064: Team handlers
  handleTeamList,
  handleTeamHealth,
  handleTeamMessage,
  handleTeamBroadcast,
  handleTeamScale,
  handleTeamRebalance,
  // BMAD-003: Validation pipeline handler
  handleValidationPipeline,
  // Imp-9: YAML pipeline handlers
  handlePipelineLoad,
  handlePipelineRun,
  handlePipelineList,
  handlePipelineValidate,
  // Cross-phase handlers
  handleCrossPhaseStore,
  handleCrossPhaseQuery,
  handleAgentComplete,
  handlePhaseStart,
  handlePhaseEnd,
  handleCrossPhaseStats,
  handleFormatSignals,
  handleCrossPhaseCleanup,
  type StoreSignalParams,
  type QuerySignalsParams,
  type AgentCompleteParams,
  type PhaseEventParams,
  type FormatSignalsParams,
  // ADR-072: RVF Migration handlers
  handleMigrationStatus,
  handleMigrationCheck,
  handleMigrationPromote,
} from './handlers';

// ADR-039: Performance optimization imports
import { registerMissingQETools } from './qe-tool-bridge.js';
import {
  getConnectionPool,
  initializeConnectionPool,
  shutdownConnectionPool,
  type PoolStats,
} from './connection-pool';
import {
  getLoadBalancer,
  type LoadBalancingStrategy,
} from './load-balancer';
import {
  getPerformanceMonitor,
  type PerformanceReport,
} from './performance-monitor';

// ADR-062: Loop detection for MCP tool calls
import { ToolCallSignatureTracker } from '../kernel/anti-drift-middleware.js';

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const _pkg = _require('../../package.json') as { version: string };

// ============================================================================
// Types
// ============================================================================

export interface MCPServerConfig {
  name?: string;
  version?: string;
  transport?: 'stdio' | 'http' | 'websocket';
  maxRequestSize?: number;
}

export interface MCPCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
}

export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
}

interface ToolEntry {
  definition: ToolDefinition;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

// ============================================================================
// MCP Protocol Server
// ============================================================================

export class MCPProtocolServer {
  private readonly config: Required<MCPServerConfig>;
  private readonly transport: StdioTransport;
  private readonly registry: ToolRegistry;
  private readonly tools: Map<string, ToolEntry> = new Map();
  private initialized = false;
  private clientInfo: { name: string; version: string } | null = null;

  // ADR-039: Performance optimization components
  private readonly pool = getConnectionPool();
  private readonly balancer = getLoadBalancer();
  private readonly monitor = getPerformanceMonitor();

  // AG-UI EventAdapter for streaming events to HTTP clients
  private readonly eventAdapter: EventAdapter;

  // IMP-00: Middleware chain for pre/post tool-call hooks
  private readonly middlewareChain: MiddlewareChain;

  // IMP-04: Session durability store
  private readonly sessionStore: SessionStore;

  // IMP-08: 4-tier context compaction pipeline
  private readonly compactionPipeline: CompactionPipeline;

  // ADR-062: Loop detection tracker for MCP tool calls
  private readonly loopTracker: ToolCallSignatureTracker;

  // Connection recovery state
  private reconnecting = false;
  private pendingRequests: Array<{ resolve: (v: unknown) => void; reject: (e: Error) => void; request: JSONRPCRequest }> = [];

  constructor(config: MCPServerConfig = {}) {
    this.config = {
      name: config.name ?? 'agentic-qe-v3',
      version: config.version ?? _pkg.version,
      transport: config.transport ?? 'stdio',
      maxRequestSize: config.maxRequestSize ?? 10 * 1024 * 1024,
    };

    this.transport = createStdioTransport({
      maxMessageSize: this.config.maxRequestSize,
    });

    this.registry = createToolRegistry();

    // Initialize AG-UI EventAdapter for streaming
    this.eventAdapter = createEventAdapter();

    // IMP-00: Initialize middleware chain
    this.middlewareChain = new MiddlewareChain();

    // IMP-04: Initialize session store and register durability middleware
    this.sessionStore = new SessionStore();
    this.sessionStore.startSession();
    this.middlewareChain.register(createSessionDurabilityMiddleware(this.sessionStore));

    // IMP-01: Register microcompact middleware for stale result eviction
    // Extract the engine so it can be shared with IMP-08's Tier 1
    const microcompact = createMicrocompactMiddleware();
    this.middlewareChain.register(microcompact.middleware);

    // IMP-08: Initialize 4-tier compaction pipeline with shared microcompact engine
    // and LLM caller for Tier 3 (falls back to extractive if no API key)
    this.compactionPipeline = new CompactionPipeline({
      sharedMicrocompactEngine: microcompact.engine,
      llmCaller: createLLMCompactCaller(),
    });
    this.middlewareChain.register(this.compactionPipeline.createMiddleware());

    // ADR-062: Initialize loop detection tracker
    this.loopTracker = new ToolCallSignatureTracker();

    // Register all tools
    this.registerAllTools();
  }

  /**
   * Get the EventAdapter for streaming events (AG-UI protocol)
   */
  getEventAdapter(): EventAdapter {
    return this.eventAdapter;
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    // Initialize ADR-039 components
    await initializeConnectionPool();

    // Set up request handler with safety wrapper to prevent crashes from killing the connection
    this.transport.onRequest(async (request) => {
      try {
        return await this.handleRequest(request);
      } catch (err) {
        // Last-resort safety net: catch anything that escapes handleToolsCall
        // to prevent MCP connection from being killed (-32000)
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[MCP] Unhandled error in request handler: ${message}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: false, error: `Internal error: ${message}` }),
          }],
        };
      }
    });

    // Set up notification handler
    this.transport.onNotification(async (notification) => {
      await this.handleNotification(notification);
    });

    // Set up connection recovery
    this.transport.onError(async (error) => {
      console.error(`[MCP] Transport error: ${error.message}`);
      await this.attemptReconnect();
    });

    // Start transport
    this.transport.start();

    // Log startup
    console.error(`[MCP] ${this.config.name} v${this.config.version} started`);
  }

  /**
   * Attempt to reconnect the transport with exponential backoff.
   * Buffers requests during the reconnection window and replays them after success.
   */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;

    try {
      // IMP-03: Use unified retry engine instead of hardcoded loop
      const { attempts } = await withRetry(
        async () => { this.transport.reconnect(); },
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          maxDelayMs: 8000,
          jitterFraction: 0.25,
          onRetry: (attempt, _error, delayMs) => {
            console.error(`[MCP] Reconnect attempt ${attempt + 1}/3 in ${Math.round(delayMs)}ms...`);
          },
        },
      );

      console.error(`[MCP] Reconnected after ${attempts} attempt(s)`);
      this.reconnecting = false;

      // Replay any buffered requests
      const buffered = [...this.pendingRequests];
      this.pendingRequests = [];
      for (const { resolve, request } of buffered) {
        try {
          const result = await this.handleRequest(request);
          resolve(result);
        } catch (err) {
          console.error(`[MCP] Failed to replay buffered request: ${request.method}`);
        }
      }
    } catch {
      this.reconnecting = false;
      console.error('[MCP] All reconnect attempts failed. Tools unavailable until transport is restored.');

      // Reject all buffered requests
      const buffered = [...this.pendingRequests];
      this.pendingRequests = [];
      for (const { reject } of buffered) {
        reject(new Error('MCP connection lost and reconnect failed'));
      }
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    this.sessionStore.close(); // IMP-04: Flush session before shutdown
    this.transport.stop();
    await disposeFleet();
    await shutdownConnectionPool();
    console.error('[MCP] Server stopped');
  }

  /** IMP-00: Register a middleware into the tool-call chain. */
  registerMiddleware(mw: ToolMiddleware): void {
    this.middlewareChain.register(mw);
  }

  /** IMP-00: Get registered middleware (for testing/introspection). */
  getMiddleware(): ReadonlyArray<{ name: string; priority: number }> {
    return this.middlewareChain.getRegistered();
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): MCPCapabilities {
    return {
      tools: { listChanged: true },
      logging: {},
    };
  }

  /**
   * Get registered tool definitions (for testing and introspection)
   */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(entry => entry.definition);
  }

  /**
   * Get server info
   */
  getServerInfo(): MCPServerInfo {
    return {
      name: this.config.name,
      version: this.config.version,
      protocolVersion: '2025-11-25', // MCP protocol version
    };
  }

  /**
   * Get performance stats (ADR-039)
   */
  getPerformanceStats(): {
    pool: import('./connection-pool').PoolStats;
    loadBalancer: ReturnType<import('./load-balancer').LoadBalancerImpl['getStats']>;
    monitor: {
      percentiles: ReturnType<typeof import('./performance-monitor').PerformanceMonitorImpl.prototype.getLatencyPercentiles>;
      toolMetrics: import('./performance-monitor').ToolExecutionMetric[];
    };
  } {
    const poolStats = this.pool.getStats();
    const balancerStats = this.balancer.getStats();
    const monitorPercentiles = this.monitor.getLatencyPercentiles();

    return {
      pool: poolStats,
      loadBalancer: balancerStats,
      monitor: {
        percentiles: monitorPercentiles,
        toolMetrics: Array.from(this.monitor.getAllToolMetrics().values()),
      },
    };
  }

  // ============================================================================
  // Request Handling
  // ============================================================================

  private async handleRequest(request: JSONRPCRequest): Promise<unknown> {
    const { method, params = {} } = request;

    switch (method) {
      // MCP Lifecycle
      case 'initialize':
        return this.handleInitialize(params as Record<string, unknown>);

      case 'shutdown':
        return this.handleShutdown();

      // Tools
      case 'tools/list':
        return this.handleToolsList();

      case 'tools/call':
        return this.handleToolsCall(params as { name: string; arguments?: Record<string, unknown> });

      // Ping
      case 'ping':
        return { pong: true };

      // Unknown method
      default:
        throw {
          code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
          message: `Unknown method: ${method}`,
        };
    }
  }

  private async handleNotification(notification: JSONRPCRequest): Promise<void> {
    const { method, params = {} } = notification;

    switch (method) {
      case 'initialized':
        // Client has finished initialization
        console.error('[MCP] Client initialized');
        break;

      case 'notifications/cancelled':
        // Request was cancelled
        console.error('[MCP] Request cancelled:', params);
        break;

      default:
        console.error(`[MCP] Unknown notification: ${method}`);
    }
  }

  // ============================================================================
  // MCP Protocol Methods
  // ============================================================================

  private async handleInitialize(
    params: Record<string, unknown>
  ): Promise<{ protocolVersion: string; capabilities: MCPCapabilities; serverInfo: MCPServerInfo }> {
    if (this.initialized) {
      throw {
        code: JSON_RPC_ERRORS.INVALID_REQUEST,
        message: 'Server already initialized',
      };
    }

    // Store client info
    if (params.clientInfo) {
      this.clientInfo = params.clientInfo as { name: string; version: string };
      console.error(`[MCP] Client: ${this.clientInfo.name} v${this.clientInfo.version}`);
    }

    this.initialized = true;

    return {
      protocolVersion: '2025-11-25',
      capabilities: this.getCapabilities(),
      serverInfo: this.getServerInfo(),
    };
  }

  private async handleShutdown(): Promise<Record<string, never>> {
    console.error('[MCP] Shutdown requested');
    // Graceful shutdown - stop accepting new requests
    setTimeout(() => {
      this.stop();
      process.exit(0);
    }, 100);
    return {};
  }

  private handleToolsList(): { tools: Array<{ name: string; description: string; inputSchema: unknown }> } {
    const tools = Array.from(this.tools.values()).map((entry) => ({
      name: entry.definition.name,
      description: entry.definition.description,
      inputSchema: this.buildInputSchema(entry.definition),
    }));

    return { tools };
  }

  private async handleToolsCall(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    const { name, arguments: args = {} } = params;

    const tool = this.tools.get(name);
    if (!tool) {
      throw {
        code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        message: `Unknown tool: ${name}`,
      };
    }

    // ADR-039: Track tool invocation with performance monitoring
    const startTime = performance.now();
    let success = false;

    // Emit AG-UI progress event for tool start
    const stepId = `${name}-${Date.now()}`;
    this.eventAdapter.adapt({
      type: 'progress',
      percent: 0,
      message: `Starting ${name}...`,
      stepId,
      toolName: name,
      timestamp: new Date().toISOString(),
    } as AQEToolProgress);

    // IMP-00: Build middleware context
    const ctx: ToolCallContext = {
      toolName: name,
      params: args,
      timestamp: Date.now(),
      metadata: { stepId },
    };

    // ADR-062: Loop detection — check for repeated identical tool calls
    let loopSteeringPrefix = '';
    if (process.env.AQE_LOOP_DETECTION_ENABLED !== 'false') {
      try {
        const loopResult = this.loopTracker.trackCall('mcp-client', name, args);
        if (loopResult.action === 'steer') {
          // BLOCK the tool call — return error with steering message to break the loop
          return {
            content: [{ type: 'text', text: loopResult.steeringMessage || 'Loop detected: repeated identical tool call blocked.' }],
            isError: true,
          };
        } else if (loopResult.action === 'warn' && loopResult.steeringMessage) {
          loopSteeringPrefix = loopResult.steeringMessage + '\n\n';
        }
      } catch {
        // Loop detection must not break tool execution
      }
    }

    try {
      // IMP-00: Execute pre-tool-call middleware
      const processedCtx = await this.middlewareChain.executePreHooks(ctx);

      const result = await tool.handler(processedCtx.params);
      success = true;

      // IMP-00: Execute post-tool-result middleware
      const processedResult = await this.middlewareChain.executePostHooks(processedCtx, result);

      // Emit AG-UI result event for tool completion
      this.eventAdapter.adapt({
        success: true,
        data: processedResult,
        metadata: {
          executionTime: performance.now() - startTime,
          requestId: stepId,
        },
      } as AQEToolResult);

      const resultText = JSON.stringify(processedResult, null, 2);
      return {
        content: [
          {
            type: 'text',
            text: loopSteeringPrefix ? loopSteeringPrefix + resultText : resultText,
          },
        ],
      };
    } catch (err) {
      const error = err as Error;

      // IMP-08: Detect context overflow (413) and trigger reactive compaction
      const errorMsg = error.message || '';
      const is413 = errorMsg.includes('413')
        || errorMsg.includes('context_length_exceeded')
        || errorMsg.includes('maximum context length')
        || errorMsg.includes('too many tokens');
      if (is413) {
        try {
          await this.compactionPipeline.handleOverflow('status_413');
        } catch {
          // Compaction failed — continue with error response
        }
      }

      // IMP-00: Execute error middleware
      await this.middlewareChain.executeErrorHooks(ctx, error);

      // Emit AG-UI result event for tool failure
      this.eventAdapter.adapt({
        success: false,
        error: error.message,
        metadata: {
          executionTime: performance.now() - startTime,
          requestId: stepId,
        },
      } as AQEToolResult);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: error.message || 'Tool execution failed' }),
          },
        ],
      };
    } finally {
      // Record actual MCP tool execution latency
      const latency = performance.now() - startTime;
      this.monitor.recordLatency(name, latency, success);
    }
  }

  // ============================================================================
  // Tool Registration
  // ============================================================================

  private registerAllTools(): void {
    // Core tools
    this.registerTool({
      definition: {
        name: 'fleet_init',
        description: 'Initialize the AQE v3 fleet with topology and domain configuration. Example: fleet_init({ topology: "hierarchical", maxAgents: 8 })',
        category: 'core',
        parameters: [
          { name: 'topology', type: 'string', description: 'Swarm topology type', enum: ['hierarchical', 'mesh', 'ring', 'adaptive'] },
          { name: 'maxAgents', type: 'number', description: 'Maximum number of agents', default: 15 },
          { name: 'enabledDomains', type: 'array', description: 'Domains to enable' },
          { name: 'lazyLoading', type: 'boolean', description: 'Enable lazy loading', default: true },
        ],
      },
      handler: (params) => handleFleetInit(params as unknown as Parameters<typeof handleFleetInit>[0]),
    });

    this.registerTool({
      definition: {
        name: 'fleet_status',
        description: 'Get fleet status: agents, tasks, health, and learning stats. Example: fleet_status({ verbose: true })',
        category: 'core',
        isConcurrencySafe: true,
        parameters: [
          { name: 'verbose', type: 'boolean', description: 'Include detailed information', default: false },
        ],
      },
      handler: (params) => handleFleetStatus(params as unknown as Parameters<typeof handleFleetStatus>[0]),
    });

    this.registerTool({
      definition: {
        name: 'fleet_health',
        description: 'Check fleet and per-domain health status with load metrics. Example: fleet_health({ domain: "test-generation" })',
        category: 'core',
        isConcurrencySafe: true,
        parameters: [
          { name: 'domain', type: 'string', description: 'Specific domain to check' },
        ],
      },
      handler: (params) => handleFleetHealth(params as unknown as Parameters<typeof handleFleetHealth>[0]),
    });

    // Task tools
    this.registerTool({
      definition: {
        name: 'task_submit',
        description: 'Submit a QE task to the Queen Coordinator for assignment. Example: task_submit({ type: "test-generation", priority: "p1" })',
        category: 'task',
        parameters: [
          { name: 'type', type: 'string', description: 'Task type', required: true },
          { name: 'priority', type: 'string', description: 'Task priority', enum: ['p0', 'p1', 'p2', 'p3'], default: 'p1' },
          { name: 'payload', type: 'object', description: 'Task payload data' },
        ],
      },
      handler: (params) => handleTaskSubmit(params as unknown as Parameters<typeof handleTaskSubmit>[0]),
    });

    this.registerTool({
      definition: {
        name: 'task_list',
        description: 'List tasks with optional status/limit filtering. Example: task_list({ status: "running", limit: 10 })',
        category: 'task',
        isConcurrencySafe: true,
        parameters: [
          { name: 'status', type: 'string', description: 'Filter by status' },
          { name: 'limit', type: 'number', description: 'Maximum results', default: 50 },
        ],
      },
      handler: (params) => handleTaskList(params as unknown as Parameters<typeof handleTaskList>[0]),
    });

    this.registerTool({
      definition: {
        name: 'task_status',
        description: 'Get detailed status, progress, and result of a specific task. Example: task_status({ taskId: "abc-123" })',
        category: 'task',
        isConcurrencySafe: true,
        parameters: [
          { name: 'taskId', type: 'string', description: 'Task ID', required: true },
        ],
      },
      handler: (params) => handleTaskStatus(params as unknown as Parameters<typeof handleTaskStatus>[0]),
    });

    this.registerTool({
      definition: {
        name: 'task_cancel',
        description: 'Cancel a running or pending task by ID. Example: task_cancel({ taskId: "abc-123" })',
        category: 'task',
        parameters: [
          { name: 'taskId', type: 'string', description: 'Task ID to cancel', required: true },
        ],
      },
      handler: (params) => handleTaskCancel(params as unknown as Parameters<typeof handleTaskCancel>[0]),
    });

    this.registerTool({
      definition: {
        name: 'task_orchestrate',
        description: 'Orchestrate a high-level QE task across multiple agents with parallel/sequential strategy. Example: task_orchestrate({ task: "full regression test", strategy: "parallel" })',
        category: 'task',
        parameters: [
          { name: 'task', type: 'string', description: 'Task description', required: true },
          { name: 'strategy', type: 'string', description: 'Execution strategy', enum: ['parallel', 'sequential', 'adaptive'] },
        ],
      },
      handler: (params) => handleTaskOrchestrate(params as unknown as Parameters<typeof handleTaskOrchestrate>[0]),
    });

    // Agent tools
    this.registerTool({
      definition: {
        name: 'agent_list',
        description: 'List all active agents, optionally filtered by domain. Example: agent_list({ domain: "test-generation" })',
        category: 'agent',
        isConcurrencySafe: true,
        parameters: [
          { name: 'domain', type: 'string', description: 'Filter by domain' },
        ],
      },
      handler: (params) => handleAgentList(params as unknown as Parameters<typeof handleAgentList>[0]),
    });

    this.registerTool({
      definition: {
        name: 'agent_spawn',
        description: 'Spawn a new QE agent in a specific domain. Example: agent_spawn({ domain: "test-generation", type: "worker" })',
        category: 'agent',
        parameters: [
          { name: 'domain', type: 'string', description: 'Domain for the agent', required: true },
          { name: 'type', type: 'string', description: 'Agent type', default: 'worker' },
        ],
      },
      handler: (params) => handleAgentSpawn(params as unknown as Parameters<typeof handleAgentSpawn>[0]),
    });

    this.registerTool({
      definition: {
        name: 'agent_metrics',
        description: 'Get CPU, memory, and task performance metrics for agents. Example: agent_metrics({ agentId: "agent-1" })',
        category: 'agent',
        isConcurrencySafe: true,
        parameters: [
          { name: 'agentId', type: 'string', description: 'Specific agent ID', required: true },
        ],
      },
      handler: (params) => handleAgentMetrics(params as unknown as Parameters<typeof handleAgentMetrics>[0]),
    });

    this.registerTool({
      definition: {
        name: 'agent_status',
        description: 'Get detailed status and current task of a specific agent. Example: agent_status({ agentId: "agent-1" })',
        category: 'agent',
        isConcurrencySafe: true,
        parameters: [
          { name: 'agentId', type: 'string', description: 'Agent ID', required: true },
        ],
      },
      handler: (params) => handleAgentStatus(params as unknown as Parameters<typeof handleAgentStatus>[0]),
    });

    // ADR-064: Agent Team tools
    this.registerTool({
      definition: {
        name: 'team_list',
        description: 'List all active domain teams and their agent counts. Example: team_list({ domain: "coverage-analysis" })',
        category: 'agent',
        isConcurrencySafe: true,
        parameters: [
          { name: 'domain', type: 'string', description: 'Filter by domain' },
        ],
      },
      handler: (params) => handleTeamList(params as unknown as Parameters<typeof handleTeamList>[0]),
    });

    this.registerTool({
      definition: {
        name: 'team_health',
        description: 'Get team health, agent utilization, and consensus status for a domain. Example: team_health({ domain: "security-compliance" })',
        category: 'agent',
        isConcurrencySafe: true,
        parameters: [
          { name: 'domain', type: 'string', description: 'Domain to check', required: true },
        ],
      },
      handler: (params) => handleTeamHealth(params as unknown as Parameters<typeof handleTeamHealth>[0]),
    });

    this.registerTool({
      definition: {
        name: 'team_message',
        description: 'Send a typed message between two agents (findings, challenges, alerts). Example: team_message({ from: "a1", to: "a2", type: "finding", payload: { issue: "flaky test" } })',
        category: 'agent',
        parameters: [
          { name: 'from', type: 'string', description: 'Sender agent ID', required: true },
          { name: 'to', type: 'string', description: 'Recipient agent ID', required: true },
          { name: 'type', type: 'string', description: 'Message type', required: true, enum: ['task-assignment', 'finding', 'challenge', 'consensus', 'alert', 'heartbeat', 'idle-notification', 'completion-report'] },
          { name: 'payload', type: 'object', description: 'Message payload', required: true },
          { name: 'domain', type: 'string', description: 'Override domain context' },
        ],
      },
      handler: (params) => handleTeamMessage(params as unknown as Parameters<typeof handleTeamMessage>[0]),
    });

    this.registerTool({
      definition: {
        name: 'team_broadcast',
        description: 'Broadcast a message to all agents in a domain. Example: team_broadcast({ domain: "test-execution", type: "alert", payload: { msg: "new build" } })',
        category: 'agent',
        parameters: [
          { name: 'domain', type: 'string', description: 'Domain to broadcast to', required: true },
          { name: 'type', type: 'string', description: 'Message type', required: true, enum: ['task-assignment', 'finding', 'challenge', 'consensus', 'alert', 'heartbeat', 'idle-notification', 'completion-report'] },
          { name: 'payload', type: 'object', description: 'Message payload', required: true },
        ],
      },
      handler: (params) => handleTeamBroadcast(params as unknown as Parameters<typeof handleTeamBroadcast>[0]),
    });

    this.registerTool({
      definition: {
        name: 'team_scale',
        description: 'Scale a domain team to a target agent count. Example: team_scale({ domain: "test-generation", targetSize: 4 })',
        category: 'agent',
        parameters: [
          { name: 'domain', type: 'string', description: 'Domain to scale', required: true },
          { name: 'targetSize', type: 'number', description: 'Target team size', required: true },
        ],
      },
      handler: (params) => handleTeamScale(params as unknown as Parameters<typeof handleTeamScale>[0]),
    });

    this.registerTool({
      definition: {
        name: 'team_rebalance',
        description: 'Rebalance agents across domain teams based on current load. Example: team_rebalance({})',
        category: 'agent',
        parameters: [],
      },
      handler: (params) => handleTeamRebalance(params as unknown as Parameters<typeof handleTeamRebalance>[0]),
    });

    // Domain tools - Test Generation
    this.registerTool({
      definition: {
        name: 'test_generate_enhanced',
        description: 'Generate unit/integration/e2e tests with AI pattern recognition and anti-pattern detection. Example: test_generate_enhanced({ sourceCode: "function add(a,b){return a+b}", testType: "unit" })',
        category: 'domain',
        parameters: [
          { name: 'sourceCode', type: 'string', description: 'Source code to generate tests for' },
          { name: 'language', type: 'string', description: 'Programming language' },
          { name: 'testType', type: 'string', description: 'Type of tests', enum: ['unit', 'integration', 'e2e'] },
        ],
      },
      handler: (params) => handleTestGenerate(params as unknown as Parameters<typeof handleTestGenerate>[0]),
    });

    // Domain tools - Test Execution
    this.registerTool({
      definition: {
        name: 'test_execute_parallel',
        description: 'Execute test files in parallel with automatic retry on flaky failures. Example: test_execute_parallel({ testFiles: ["tests/auth.test.ts"], parallel: true })',
        category: 'domain',
        parameters: [
          { name: 'testFiles', type: 'array', description: 'Test files to execute' },
          { name: 'parallel', type: 'boolean', description: 'Enable parallel execution', default: true },
        ],
      },
      handler: (params) => handleTestExecute(params as unknown as Parameters<typeof handleTestExecute>[0]),
    });

    // Domain tools - Coverage Analysis
    this.registerTool({
      definition: {
        name: 'coverage_analyze_sublinear',
        description: 'Analyze code coverage with O(log n) sublinear algorithm and ML-powered gap detection. Example: coverage_analyze_sublinear({ target: "src/", detectGaps: true })',
        category: 'domain',
        isConcurrencySafe: true,
        parameters: [
          { name: 'target', type: 'string', description: 'Target path to analyze', required: true },
          { name: 'detectGaps', type: 'boolean', description: 'Detect coverage gaps', default: true },
        ],
      },
      handler: (params) => handleCoverageAnalyze(params as unknown as Parameters<typeof handleCoverageAnalyze>[0]),
    });

    // Domain tools - Quality Assessment
    this.registerTool({
      definition: {
        name: 'quality_assess',
        description: 'Assess code quality metrics and optionally run a pass/fail quality gate. Example: quality_assess({ runGate: true })',
        category: 'domain',
        isConcurrencySafe: true,
        parameters: [
          { name: 'runGate', type: 'boolean', description: 'Run quality gate evaluation', default: false },
        ],
      },
      handler: (params) => handleQualityAssess(params as unknown as Parameters<typeof handleQualityAssess>[0]),
    });

    // Domain tools - Security
    this.registerTool({
      definition: {
        name: 'security_scan_comprehensive',
        description: 'Run SAST and/or DAST security scans with vulnerability classification. Example: security_scan_comprehensive({ target: "src/", sast: true })',
        category: 'domain',
        parameters: [
          { name: 'sast', type: 'boolean', description: 'Run SAST scan', default: true },
          { name: 'dast', type: 'boolean', description: 'Run DAST scan', default: false },
          { name: 'target', type: 'string', description: 'Target to scan' },
        ],
      },
      handler: (params) => handleSecurityScan(params as unknown as Parameters<typeof handleSecurityScan>[0]),
    });

    // Domain tools - Contract Testing
    this.registerTool({
      definition: {
        name: 'contract_validate',
        description: 'Validate API contracts for breaking changes against consumers. Example: contract_validate({ contractPath: "api/openapi.yaml" })',
        category: 'domain',
        parameters: [
          { name: 'contractPath', type: 'string', description: 'Path to contract file' },
        ],
      },
      handler: (params) => handleContractValidate(params as unknown as Parameters<typeof handleContractValidate>[0]),
    });

    // Domain tools - Accessibility
    this.registerTool({
      definition: {
        name: 'accessibility_test',
        description: 'Test accessibility against WCAG 2.1/2.2 and Section 508 standards. Example: accessibility_test({ url: "http://localhost:3000", standard: "wcag21-aa" })',
        category: 'domain',
        parameters: [
          { name: 'url', type: 'string', description: 'URL to test', required: true },
          { name: 'standard', type: 'string', description: 'Accessibility standard' },
        ],
      },
      handler: (params) => handleAccessibilityTest(params as unknown as Parameters<typeof handleAccessibilityTest>[0]),
    });

    // Domain tools - Chaos Engineering
    this.registerTool({
      definition: {
        name: 'chaos_test',
        description: 'Inject faults (latency, errors, CPU) for chaos engineering resilience testing. Example: chaos_test({ faultType: "latency", target: "api-service" })',
        category: 'domain',
        parameters: [
          { name: 'faultType', type: 'string', description: 'Type of fault to inject' },
          { name: 'target', type: 'string', description: 'Target service' },
        ],
      },
      handler: (params) => handleChaosTest(params as unknown as Parameters<typeof handleChaosTest>[0]),
    });

    // Domain tools - Defect Intelligence
    this.registerTool({
      definition: {
        name: 'defect_predict',
        description: 'Predict potential defects using AI analysis of code complexity and change history. Example: defect_predict({ target: "src/auth/" })',
        category: 'domain',
        isConcurrencySafe: true,
        parameters: [
          { name: 'target', type: 'string', description: 'Target path', required: true },
        ],
      },
      handler: (params) => handleDefectPredict(params as unknown as Parameters<typeof handleDefectPredict>[0]),
    });

    // Domain tools - Requirements
    this.registerTool({
      definition: {
        name: 'requirements_validate',
        description: 'Validate requirements for completeness and generate BDD scenarios. Example: requirements_validate({ requirementsPath: "docs/requirements.md" })',
        category: 'domain',
        isConcurrencySafe: true,
        parameters: [
          { name: 'requirementsPath', type: 'string', description: 'Path to requirements' },
        ],
      },
      handler: (params) => handleRequirementsValidate(params as unknown as Parameters<typeof handleRequirementsValidate>[0]),
    });

    // Domain tools - Code Intelligence
    this.registerTool({
      definition: {
        name: 'code_index',
        description: 'Index source code into the knowledge graph for dependency and impact analysis. Example: code_index({ target: "src/" })',
        category: 'domain',
        isConcurrencySafe: true,
        parameters: [
          { name: 'target', type: 'string', description: 'Target path', required: true },
        ],
      },
      handler: (params) => handleCodeIndex(params as unknown as Parameters<typeof handleCodeIndex>[0]),
    });

    // Memory tools
    this.registerTool({
      definition: {
        name: 'memory_store',
        description: 'Store a key-value pair in memory with optional namespace and TTL. Example: memory_store({ key: "pattern-auth", value: { type: "jwt" }, namespace: "patterns" })',
        category: 'memory',
        parameters: [
          { name: 'key', type: 'string', description: 'Memory key', required: true },
          { name: 'value', type: 'object', description: 'Value to store', required: true },
          { name: 'namespace', type: 'string', description: 'Memory namespace', default: 'default' },
        ],
      },
      handler: (params) => handleMemoryStore(params as unknown as Parameters<typeof handleMemoryStore>[0]),
    });

    this.registerTool({
      definition: {
        name: 'memory_retrieve',
        description: 'Retrieve a value by key from memory. Example: memory_retrieve({ key: "pattern-auth", namespace: "patterns" })',
        category: 'memory',
        isConcurrencySafe: true,
        parameters: [
          { name: 'key', type: 'string', description: 'Memory key', required: true },
          { name: 'namespace', type: 'string', description: 'Memory namespace', default: 'default' },
        ],
      },
      handler: (params) => handleMemoryRetrieve(params as unknown as Parameters<typeof handleMemoryRetrieve>[0]),
    });

    this.registerTool({
      definition: {
        name: 'memory_query',
        description: 'Query memory using glob patterns or HNSW semantic vector search. Example: memory_query({ pattern: "auth*", namespace: "patterns" }) or memory_query({ pattern: "authentication best practices", semantic: true })',
        category: 'memory',
        isConcurrencySafe: true,
        parameters: [
          { name: 'pattern', type: 'string', description: 'Key pattern (glob) or natural language query (for semantic search)' },
          { name: 'namespace', type: 'string', description: 'Memory namespace' },
          { name: 'semantic', type: 'boolean', description: 'Use HNSW vector search instead of pattern matching. Auto-detected when pattern contains spaces and no wildcards.' },
        ],
      },
      handler: (params) => handleMemoryQuery(params as unknown as Parameters<typeof handleMemoryQuery>[0]),
    });

    this.registerTool({
      definition: {
        name: 'memory_delete',
        description: 'Delete a memory entry by key. Example: memory_delete({ key: "temp-data", namespace: "scratch" })',
        category: 'memory',
        parameters: [
          { name: 'key', type: 'string', description: 'Memory key', required: true },
          { name: 'namespace', type: 'string', description: 'Memory namespace', default: 'default' },
        ],
      },
      handler: (params) => handleMemoryDelete(params as unknown as Parameters<typeof handleMemoryDelete>[0]),
    });

    this.registerTool({
      definition: {
        name: 'memory_usage',
        description: 'Get memory usage statistics: entry counts, namespaces, and storage size. Example: memory_usage({})',
        category: 'memory',
        isConcurrencySafe: true,
        parameters: [],
      },
      handler: () => handleMemoryUsage(),
    });

    this.registerTool({
      definition: {
        name: 'memory_share',
        description: 'Share knowledge from one agent to others within a domain. Example: memory_share({ sourceAgentId: "a1", targetAgentIds: ["a2","a3"], knowledgeDomain: "patterns" })',
        category: 'memory',
        parameters: [
          { name: 'sourceAgentId', type: 'string', description: 'Source agent ID', required: true },
          { name: 'targetAgentIds', type: 'array', description: 'Target agent IDs', required: true },
          { name: 'knowledgeDomain', type: 'string', description: 'Knowledge domain', required: true },
        ],
      },
      handler: (params) => handleMemoryShare(params as unknown as Parameters<typeof handleMemoryShare>[0]),
    });

    // =========================================================================
    // ADR-051: Model Routing Tools
    // =========================================================================

    this.registerTool({
      definition: {
        name: 'model_route',
        description: 'Route a task to the optimal model tier (0=Booster through 4=Opus) based on complexity analysis. Example: model_route({ task: "refactor auth module", domain: "code-intelligence" })',
        category: 'routing',
        parameters: [
          { name: 'task', type: 'string', description: 'Task description to analyze', required: true },
          { name: 'codeContext', type: 'string', description: 'Optional code context for complexity analysis' },
          { name: 'filePaths', type: 'array', description: 'Optional file paths involved' },
          { name: 'manualTier', type: 'number', description: 'Manual tier override (0-4)' },
          { name: 'isCritical', type: 'boolean', description: 'Mark as critical task (allows budget overrides)' },
          { name: 'agentType', type: 'string', description: 'Agent type making the request' },
          { name: 'domain', type: 'string', description: 'Domain context' },
        ],
      },
      handler: (params) => handleModelRoute(params as unknown as Parameters<typeof handleModelRoute>[0]),
    });

    this.registerTool({
      definition: {
        name: 'routing_metrics',
        description: 'Get model routing statistics: tier distribution, cost savings, and routing log. Example: routing_metrics({ includeLog: true, logLimit: 20 })',
        category: 'routing',
        isConcurrencySafe: true,
        parameters: [
          { name: 'includeLog', type: 'boolean', description: 'Include routing log entries', default: false },
          { name: 'logLimit', type: 'number', description: 'Max log entries to return', default: 100 },
        ],
      },
      handler: (params) => handleRoutingMetrics(params as unknown as Parameters<typeof handleRoutingMetrics>[0]),
    });

    this.registerTool({
      definition: {
        name: 'routing_economics',
        description: 'Get economic routing report: tier efficiency, budget status, cost-per-quality analysis, and savings opportunities. Example: routing_economics({ taskComplexity: 0.5 })',
        category: 'routing',
        isConcurrencySafe: true,
        parameters: [
          { name: 'taskComplexity', type: 'number', description: 'Task complexity score 0-1 for tier scoring (default: 0.5)', default: 0.5 },
        ],
      },
      handler: (params) => handleRoutingEconomics(params as unknown as Parameters<typeof handleRoutingEconomics>[0]),
    });

    // ADR-057: Infrastructure self-healing tools
    this.registerTool({
      definition: {
        name: 'infra_healing_status',
        description: 'Get infrastructure self-healing status: detected failures, recovery stats, and failing services. Example: infra_healing_status({ verbose: true })',
        category: 'infra-healing',
        isConcurrencySafe: true,
        parameters: [
          { name: 'verbose', type: 'boolean', description: 'Include detailed observation data', default: false },
        ],
      },
      handler: (params) => handleInfraHealingStatus(params as { verbose?: boolean }),
    });

    this.registerTool({
      definition: {
        name: 'infra_healing_feed_output',
        description: 'Feed test runner stdout/stderr for automatic infrastructure error detection. Example: infra_healing_feed_output({ output: "ECONNREFUSED 127.0.0.1:5432" })',
        category: 'infra-healing',
        parameters: [
          { name: 'output', type: 'string', description: 'Test runner stdout/stderr output' },
        ],
      },
      handler: (params) => handleInfraHealingFeedOutput(params as { output: string }),
    });

    this.registerTool({
      definition: {
        name: 'infra_healing_recover',
        description: 'Trigger infrastructure recovery for detected failures and optionally re-run affected tests. Example: infra_healing_recover({ services: ["postgres"], rerunTests: true })',
        category: 'infra-healing',
        parameters: [
          { name: 'services', type: 'array', description: 'Specific services to recover (empty = all failing)' },
          { name: 'rerunTests', type: 'boolean', description: 'Re-run affected tests after recovery', default: true },
        ],
      },
      handler: (params) => handleInfraHealingRecover(params as { services?: string[]; rerunTests?: boolean }),
    });

    // =========================================================================
    // Cross-Phase Handlers (QCSD Feedback Loops)
    // =========================================================================

    this.registerTool({
      definition: {
        name: 'cross_phase_store',
        description: 'Store a cross-phase signal for QCSD feedback loops (strategic, tactical, operational, quality-criteria)',
        category: 'cross-phase',
        parameters: [
          { name: 'loop', type: 'string', description: 'Feedback loop type', required: true, enum: ['strategic', 'tactical', 'operational', 'quality-criteria'] },
          { name: 'data', type: 'object', description: 'Signal data (riskWeights, factorWeights, flakyPatterns, etc.)', required: true },
        ],
      },
      handler: (params) => handleCrossPhaseStore(params as unknown as StoreSignalParams),
    });

    this.registerTool({
      definition: {
        name: 'cross_phase_query',
        description: 'Query cross-phase signals by loop type with optional filters',
        category: 'cross-phase',
        isConcurrencySafe: true,
        parameters: [
          { name: 'loop', type: 'string', description: 'Feedback loop type', required: true, enum: ['strategic', 'tactical', 'operational', 'quality-criteria'] },
          { name: 'maxAge', type: 'string', description: 'Maximum signal age (e.g., "30d", "24h")' },
          { name: 'filter', type: 'object', description: 'Additional filters' },
        ],
      },
      handler: (params) => handleCrossPhaseQuery(params as unknown as QuerySignalsParams),
    });

    this.registerTool({
      definition: {
        name: 'agent_complete',
        description: 'Trigger cross-phase hooks when an agent completes (auto-stores relevant signals)',
        category: 'cross-phase',
        parameters: [
          { name: 'agentName', type: 'string', description: 'Name of the completed agent', required: true },
          { name: 'result', type: 'object', description: 'Agent result data', required: true },
        ],
      },
      handler: (params) => handleAgentComplete(params as unknown as AgentCompleteParams),
    });

    this.registerTool({
      definition: {
        name: 'phase_start',
        description: 'Trigger phase start hooks to get injected cross-phase signals for agents',
        category: 'cross-phase',
        parameters: [
          { name: 'phase', type: 'string', description: 'QCSD phase name', required: true, enum: ['ideation', 'refinement', 'development', 'cicd', 'production'] },
          { name: 'context', type: 'object', description: 'Phase context data' },
        ],
      },
      handler: (params) => handlePhaseStart(params as unknown as PhaseEventParams),
    });

    this.registerTool({
      definition: {
        name: 'phase_end',
        description: 'Trigger phase end hooks to store accumulated signals',
        category: 'cross-phase',
        parameters: [
          { name: 'phase', type: 'string', description: 'QCSD phase name', required: true, enum: ['ideation', 'refinement', 'development', 'cicd', 'production'] },
          { name: 'context', type: 'object', description: 'Phase result data' },
        ],
      },
      handler: (params) => handlePhaseEnd(params as unknown as PhaseEventParams),
    });

    this.registerTool({
      definition: {
        name: 'cross_phase_stats',
        description: 'Get cross-phase memory statistics (total signals, by loop, by namespace)',
        category: 'cross-phase',
        isConcurrencySafe: true,
        parameters: [],
      },
      handler: () => handleCrossPhaseStats(),
    });

    this.registerTool({
      definition: {
        name: 'format_signals',
        description: 'Format cross-phase signals for injection into agent prompts',
        category: 'cross-phase',
        isConcurrencySafe: true,
        parameters: [
          { name: 'signals', type: 'array', description: 'Signals to format', required: true },
        ],
      },
      handler: (params) => handleFormatSignals(params as unknown as FormatSignalsParams),
    });

    this.registerTool({
      definition: {
        name: 'cross_phase_cleanup',
        description: 'Clean up expired cross-phase signals',
        category: 'cross-phase',
        parameters: [],
      },
      handler: () => handleCrossPhaseCleanup(),
    });

    // =========================================================================
    // BMAD-003: Validation Pipeline
    // =========================================================================

    this.registerTool({
      definition: {
        name: 'validation_pipeline',
        description: 'Run structured validation pipeline (13-step requirements validation with gate enforcement and scoring). Example: validation_pipeline({ content: "# Requirements\\n...", pipeline: "requirements" })',
        category: 'domain',
        parameters: [
          { name: 'filePath', type: 'string', description: 'Path to the document to validate' },
          { name: 'content', type: 'string', description: 'Inline content to validate (alternative to filePath)' },
          { name: 'pipeline', type: 'string', description: 'Pipeline type (default: requirements)', default: 'requirements' },
          { name: 'steps', type: 'array', description: 'Specific step IDs to run (default: all 13)' },
          { name: 'continueOnFailure', type: 'boolean', description: 'Continue past blocking failures', default: false },
          { name: 'format', type: 'string', description: 'Output format: markdown or json', default: 'json' },
        ],
      },
      handler: (params) => handleValidationPipeline(params as {
        filePath?: string; content?: string; pipeline?: string;
        steps?: string[]; continueOnFailure?: boolean; format?: string;
      }),
    });

    // =========================================================================
    // Imp-9: YAML Deterministic Pipelines
    // =========================================================================

    this.registerTool({
      definition: {
        name: 'pipeline_load',
        description: 'Load and register a YAML pipeline definition. Example: pipeline_load({ yaml: "name: my-pipeline\\nsteps: ..." })',
        category: 'coordination',
        parameters: [
          { name: 'yaml', type: 'string', description: 'YAML pipeline definition', required: true },
          { name: 'variables', type: 'object', description: 'Variable substitutions for the pipeline' },
        ],
      },
      handler: (params) => handlePipelineLoad(params as { yaml: string; variables?: Record<string, unknown> }),
    });

    this.registerTool({
      definition: {
        name: 'pipeline_run',
        description: 'Execute a previously loaded YAML pipeline. Example: pipeline_run({ pipelineId: "my-pipeline" })',
        category: 'coordination',
        parameters: [
          { name: 'pipelineId', type: 'string', description: 'ID of the loaded pipeline to run', required: true },
          { name: 'input', type: 'object', description: 'Input data for the pipeline' },
        ],
      },
      handler: (params) => handlePipelineRun(params as { pipelineId: string; input?: Record<string, unknown> }),
    });

    this.registerTool({
      definition: {
        name: 'pipeline_list',
        description: 'List all loaded YAML pipelines. Example: pipeline_list({})',
        category: 'coordination',
        isConcurrencySafe: true,
        parameters: [],
      },
      handler: (params) => handlePipelineList(params as Record<string, never>),
    });

    this.registerTool({
      definition: {
        name: 'pipeline_validate',
        description: 'Validate a YAML pipeline definition without loading it. Example: pipeline_validate({ yaml: "name: test\\nsteps: ..." })',
        category: 'coordination',
        isConcurrencySafe: true,
        parameters: [
          { name: 'yaml', type: 'string', description: 'YAML pipeline definition to validate', required: true },
          { name: 'variables', type: 'object', description: 'Variable substitutions for validation' },
        ],
      },
      handler: (params) => handlePipelineValidate(params as { yaml: string; variables?: Record<string, unknown> }),
    });

    // =========================================================================
    // Imp-15: Session Cache Stats
    // =========================================================================

    this.registerTool({
      definition: {
        name: 'session_cache_stats',
        description: 'Get session operation cache statistics: hit rate, cache size, tokens saved via O(1) fingerprint reuse. Example: session_cache_stats({})',
        category: 'learning',
        isConcurrencySafe: true,
        parameters: [],
      },
      handler: async () => {
        try {
          const { getSessionCache } = await import('../optimization/session-cache.js');
          const stats = getSessionCache().getStats();
          const compactionStats = this.compactionPipeline.getStats();
          return {
            success: true,
            data: {
              ...stats,
              hitRatePercent: `${(stats.hitRate * 100).toFixed(1)}%`,
              description: 'Session cache provides O(1) exact-match lookups before HNSW similarity search',
              compaction: compactionStats,
            },
          };
        } catch (err) {
          return {
            success: false,
            error: `Failed to get session cache stats: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    });

    // =========================================================================
    // OpenCode Integration: Health Endpoint
    // =========================================================================

    this.registerTool({
      definition: {
        name: 'aqe_health',
        description: 'Check AQE server health: returns status, loaded domains, memory stats, HNSW index status, and pattern count. Example: aqe_health({})',
        category: 'core',
        isConcurrencySafe: true,
        parameters: [],
      },
      handler: () => handleAQEHealth(),
    });

    // ADR-072 Phase 3: RVF Migration tools
    this.registerTool({
      definition: {
        name: 'migration_status',
        description: 'Get RVF migration status: current stage, metrics, consistency, and gate evaluation. Example: migration_status({})',
        category: 'persistence',
        isConcurrencySafe: true,
        parameters: [],
      },
      handler: () => handleMigrationStatus(),
    });

    this.registerTool({
      definition: {
        name: 'migration_check',
        description: 'Run a consistency check comparing SQLite and RVF search results. Samples random patterns and reports divergences. Example: migration_check({})',
        category: 'persistence',
        isConcurrencySafe: true,
        parameters: [],
      },
      handler: () => handleMigrationCheck(),
    });

    this.registerTool({
      definition: {
        name: 'migration_promote',
        description: 'Attempt to promote to the next RVF migration stage. Evaluates stage gate criteria. Example: migration_promote({ force: false })',
        category: 'persistence',
        parameters: [
          { name: 'force', type: 'boolean', description: 'Skip gate checks and force promotion', default: false },
        ],
      },
      handler: (params) => handleMigrationPromote(params as { force?: boolean }),
    });

    // ADR-092: Thin MCP wrapper for advisor consultation (Phase 6)
    this.registerTool({
      definition: {
        name: 'advisor_consult',
        description: 'Consult a stronger advisor model for strategic guidance. Forwards a task description and context to the advisor and returns enumerated action steps. Auto-detects the best available provider. Example: advisor_consult({ agent: "qe-test-architect", task: "Generate tests for auth module", context: "Found 4 classes with external deps" })',
        category: 'routing',
        parameters: [
          { name: 'agent', type: 'string', description: 'Agent name requesting advice (e.g., qe-test-architect)', required: true },
          { name: 'task', type: 'string', description: 'Task description', required: true },
          { name: 'context', type: 'string', description: 'What the executor has found so far' },
          { name: 'provider', type: 'string', description: 'Provider override (openrouter, claude, ollama)' },
          { name: 'model', type: 'string', description: 'Model override' },
        ],
      },
      handler: async (params) => {
        const { execFileSync } = await import('child_process');
        const { writeFileSync, unlinkSync, mkdirSync } = await import('fs');
        const { join } = await import('path');
        const { tmpdir } = await import('os');

        const p = params as { agent?: string; task?: string; context?: string; provider?: string; model?: string };

        // ADR-092 contract enforcement: reject empty/missing required fields early
        // instead of shelling out to `aqe llm advise` with placeholder values.
        const agent = typeof p.agent === 'string' ? p.agent.trim() : '';
        const task = typeof p.task === 'string' ? p.task.trim() : '';
        if (!agent) {
          return { error: "advisor_consult: 'agent' is required (non-empty string)" };
        }
        if (!task) {
          return { error: "advisor_consult: 'task' is required (non-empty string)" };
        }

        const transcriptDir = join(tmpdir(), 'aqe-advisor');
        mkdirSync(transcriptDir, { recursive: true });
        const transcriptPath = join(transcriptDir, `mcp-${Date.now()}.json`);

        const transcript = {
          taskDescription: task,
          messages: [
            { role: 'user', content: task },
            ...(p.context ? [{ role: 'assistant', content: p.context }] : []),
          ],
        };
        writeFileSync(transcriptPath, JSON.stringify(transcript));

        try {
          const cliArgs = [
            'llm', 'advise',
            '--transcript', transcriptPath,
            '--agent', agent,
            '--json',
          ];
          if (p.provider) cliArgs.push('--provider', p.provider);
          if (p.model) cliArgs.push('--model', p.model);

          // Resolve aqe binary with fallback to npx (MCP server may not have aqe on PATH)
          let aqeBin = 'aqe';
          try {
            execFileSync('which', ['aqe'], { encoding: 'utf-8' });
          } catch {
            aqeBin = 'npx';
            cliArgs.unshift('aqe');
          }

          const result = execFileSync(aqeBin, cliArgs, {
            encoding: 'utf-8',
            timeout: 60000,
            env: process.env,
          });

          try { unlinkSync(transcriptPath); } catch {}

          const lines = result.split('\n');
          let jsonStr = '';
          let depth = 0;
          let inJson = false;
          for (const line of lines) {
            const t = line.trim();
            if (!inJson && t.startsWith('{')) inJson = true;
            if (inJson) {
              jsonStr += line + '\n';
              depth += (t.match(/{/g) || []).length;
              depth -= (t.match(/}/g) || []).length;
              if (depth <= 0) break;
            }
          }
          return JSON.parse(jsonStr || '{}');
        } catch (err) {
          try { unlinkSync(transcriptPath); } catch {}
          return { error: (err as Error).message?.slice(0, 300) ?? 'Unknown error' };
        }
      },
    });

    // Register QE domain tools not already covered by hardcoded handlers above
    const bridgedCount = registerMissingQETools((entry) => this.registerTool(entry));
    console.error(`[MCP] Registered ${this.tools.size} tools (${bridgedCount} via QE bridge)`);
  }

  private registerTool(entry: ToolEntry): void {
    this.tools.set(entry.definition.name, entry);
    this.registry.register(entry.definition, entry.handler as Parameters<typeof this.registry.register>[1]);
  }

  private buildInputSchema(definition: ToolDefinition): {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  } {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of definition.parameters) {
      properties[param.name] = {
        type: param.type === 'array' ? 'array' : param.type,
        description: param.description,
      };

      if (param.enum) {
        properties[param.name] = {
          ...properties[param.name] as object,
          enum: param.enum,
        };
      }

      if (param.default !== undefined) {
        properties[param.name] = {
          ...properties[param.name] as object,
          default: param.default,
        };
      }

      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMCPProtocolServer(config?: MCPServerConfig): MCPProtocolServer {
  return new MCPProtocolServer(config);
}

// ============================================================================
// Quick Start Function (like claude-flow)
// ============================================================================

export async function quickStart(config?: MCPServerConfig): Promise<MCPProtocolServer> {
  const server = createMCPProtocolServer(config);
  await server.start();
  return server;
}
