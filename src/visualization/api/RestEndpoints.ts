/**
 * @fileoverview REST API endpoints for visualization data
 * @module visualization/api/RestEndpoints
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as http from 'http';
import { EventStore } from '../../persistence/event-store';
import { ReasoningStore } from '../../persistence/reasoning-store';
import { DataTransformer } from '../core/DataTransformer';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

/**
 * API response wrapper
 */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    timestamp: string;
    request_id: string;
    pagination?: PaginationMetadata;
  };
}

/**
 * Pagination metadata
 */
interface PaginationMetadata {
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
  cursor?: string;
}

/**
 * Request context for instrumentation
 */
interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  query: Record<string, string>;
  startTime: number;
}

/**
 * REST API server configuration
 */
export interface RestApiConfig {
  /** Port to listen on */
  port?: number;
  /** Enable ETag caching */
  enableEtag?: boolean;
  /** Default page size */
  defaultLimit?: number;
  /** Maximum page size */
  maxLimit?: number;
  /** Enable CORS */
  enableCors?: boolean;
  /** CORS origins */
  corsOrigins?: string[];
}

/**
 * REST API server for visualization data
 *
 * Endpoints:
 * - GET /api/visualization/events - List events with pagination and filtering
 * - GET /api/visualization/reasoning/:taskId - Get reasoning chain details
 * - GET /api/visualization/metrics - Get aggregated metrics
 * - GET /api/visualization/agents/:agentId/history - Get agent activity history
 * - GET /api/visualization/sessions/:sessionId - Get complete session visualization
 * - GET /api/visualization/graph/:sessionId - Get visualization graph
 *
 * Features:
 * - Cursor-based pagination
 * - ETag response caching
 * - OpenTelemetry instrumentation
 * - Comprehensive error handling
 *
 * @example
 * ```typescript
 * const api = new RestApiServer(eventStore, reasoningStore, {
 *   port: 3000,
 *   enableEtag: true,
 *   enableCors: true
 * });
 *
 * await api.start();
 * ```
 */
export class RestApiServer {
  private app: Express;
  private eventStore: EventStore;
  private reasoningStore: ReasoningStore;
  private transformer: DataTransformer;
  private config: Required<RestApiConfig>;
  private server?: http.Server;
  private isRunning: boolean;
  private etagCache: Map<string, string>;
  private tracer = trace.getTracer('aqe-visualization-api');

  /**
   * Default configuration
   */
  private static readonly DEFAULT_CONFIG: Required<RestApiConfig> = {
    port: 3001,
    enableEtag: true,
    defaultLimit: 50,
    maxLimit: 1000,
    enableCors: true,
    corsOrigins: ['*'],
  };

  constructor(
    eventStore: EventStore,
    reasoningStore: ReasoningStore,
    config: RestApiConfig = {}
  ) {
    this.eventStore = eventStore;
    this.reasoningStore = reasoningStore;
    this.transformer = new DataTransformer(eventStore, reasoningStore);
    this.config = { ...RestApiServer.DEFAULT_CONFIG, ...config };
    this.isRunning = false;
    this.etagCache = new Map();

    // Initialize Express app
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS configuration
    if (this.config.enableCors) {
      this.app.use(cors({
        origin: this.config.corsOrigins,
        methods: ['GET', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'If-None-Match'],
        maxAge: 86400,
      }));
    }

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const requestId = this.generateRequestId();
      (req as any).requestId = requestId;
      (req as any).startTime = Date.now();

      const span = this.tracer.startSpan(`HTTP ${req.method} ${req.path}`, {
        attributes: {
          'http.method': req.method,
          'http.url': req.path,
          'http.request_id': requestId,
        },
      });

      (req as any).span = span;
      next();
    });
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // GET /api/visualization/events
    this.app.get('/api/visualization/events', this.handleGetEvents.bind(this));

    // GET /api/visualization/reasoning/:chainId
    this.app.get('/api/visualization/reasoning/:chainId', this.handleGetReasoningRoute.bind(this));

    // GET /api/visualization/metrics
    this.app.get('/api/visualization/metrics', this.handleGetMetricsRoute.bind(this));

    // GET /api/visualization/agents/:agentId/history
    this.app.get('/api/visualization/agents/:agentId/history', this.handleGetAgentHistoryRoute.bind(this));

    // GET /api/visualization/sessions/:sessionId
    this.app.get('/api/visualization/sessions/:sessionId', this.handleGetSessionRoute.bind(this));

    // GET /api/visualization/graph/:sessionId
    this.app.get('/api/visualization/graph/:sessionId', this.handleGetGraphRoute.bind(this));

    // Error handling middleware
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      const span = (req as any).span;
      if (span) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        span.recordException(err);
        span.end();
      }

      const statusCode = err.message.startsWith('Not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: err.message,
        metadata: {
          timestamp: new Date().toISOString(),
          request_id: (req as any).requestId || 'unknown',
        },
      });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: `Not found: ${req.path}`,
        metadata: {
          timestamp: new Date().toISOString(),
          request_id: (req as any).requestId || 'unknown',
        },
      });
    });
  }

  /**
   * Start the REST API server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('REST API server is already running');
    }

    await new Promise<void>((resolve, reject) => {
      this.server = this.app.listen(this.config.port, () => {
        this.isRunning = true;
        console.log(`REST API server listening on port ${this.config.port}`);
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  /**
   * Stop the REST API server
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        resolve();
      });
    });
  }

  /**
   * GET /api/visualization/events?since=timestamp&limit=100&offset=0
   */
  private async handleGetEvents(req: Request, res: Response): Promise<void> {
    try {
      const { since, limit: limitStr, offset: offsetStr } = req.query;
      const limit = Math.min(
        parseInt((limitStr as string) || String(this.config.defaultLimit)),
        this.config.maxLimit
      );
      const offset = parseInt((offsetStr as string) || '0');

      let events;
      if (since) {
        events = this.eventStore.getEventsByTimeRange(
          { start: since as string, end: new Date().toISOString() },
          { limit, offset }
        );
      } else {
        events = this.eventStore.getRecentEvents(limit, offset);
      }

      // Get total count for pagination
      const stats = this.eventStore.getStatistics();
      const total = stats.totalEvents;

      this.sendSuccessResponse(res, req, events, {
        limit,
        offset,
        total,
        has_more: offset + events.length < total,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * GET /api/visualization/reasoning/:chainId
   */
  private async handleGetReasoningRoute(req: Request, res: Response): Promise<void> {
    try {
      const { chainId } = req.params;
      const tree = this.transformer.buildReasoningTree(chainId);
      if (!tree) {
        throw new Error(`Reasoning chain not found: ${chainId}`);
      }

      this.sendSuccessResponse(res, req, tree);
    } catch (error) {
      throw error;
    }
  }

  /**
   * GET /api/visualization/metrics?timeRange=1h|24h|7d
   */
  private async handleGetMetricsRoute(req: Request, res: Response): Promise<void> {
    try {
      const { timeRange } = req.query;

      // Calculate time range
      const now = new Date();
      let startTime: Date;
      switch (timeRange) {
        case '1h':
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      const events = this.eventStore.getEventsByTimeRange({
        start: startTime.toISOString(),
        end: now.toISOString(),
      });

      const eventStats = this.eventStore.getStatistics();
      const reasoningStats = this.reasoningStore.getStatistics();

      const metrics = {
        time_range: {
          start: startTime.toISOString(),
          end: now.toISOString(),
          duration_ms: now.getTime() - startTime.getTime(),
        },
        events: {
          total: events.length,
          by_type: this.groupByType(events),
          by_agent: this.groupByAgent(events),
        },
        reasoning: {
          total_chains: reasoningStats.totalChains,
          total_steps: reasoningStats.totalSteps,
          completed_chains: reasoningStats.completedChains,
          failed_chains: reasoningStats.failedChains,
          avg_steps_per_chain: reasoningStats.avgStepsPerChain,
          avg_confidence: reasoningStats.avgConfidence,
        },
        overall: {
          unique_agents: eventStats.uniqueAgents,
          unique_sessions: eventStats.uniqueSessions,
        },
      };

      this.sendSuccessResponse(res, req, metrics);
    } catch (error) {
      throw error;
    }
  }

  /**
   * GET /api/visualization/agents/:agentId/history?limit=100&offset=0
   */
  private async handleGetAgentHistoryRoute(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const { limit: limitStr, offset: offsetStr } = req.query;
      const limit = Math.min(
        parseInt((limitStr as string) || String(this.config.defaultLimit)),
        this.config.maxLimit
      );
      const offset = parseInt((offsetStr as string) || '0');

      const events = this.eventStore.getEventsByAgent(agentId, { limit, offset });
      const chains = this.reasoningStore.getChainsByAgent(agentId, { limit, offset });
      const total = this.eventStore.countEventsByAgent(agentId);

      const history = {
        agent_id: agentId,
        events,
        reasoning_chains: chains,
        total_events: total,
      };

      this.sendSuccessResponse(res, req, history, {
        limit,
        offset,
        total,
        has_more: offset + events.length < total,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * GET /api/visualization/sessions/:sessionId
   */
  private async handleGetSessionRoute(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const visualization = this.transformer.buildSessionVisualization(sessionId);
      this.sendSuccessResponse(res, req, visualization);
    } catch (error) {
      throw error;
    }
  }

  /**
   * GET /api/visualization/graph/:sessionId?algorithm=hierarchical&spacing=100
   */
  private async handleGetGraphRoute(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { algorithm, spacing } = req.query;

      const layoutOptions = {
        algorithm: (algorithm as 'force-directed' | 'hierarchical' | 'circular' | 'grid') || 'hierarchical',
        spacing: parseInt((spacing as string) || '100'),
        direction: 'TB' as const,
      };

      const graph = this.transformer.buildSessionGraph(sessionId, layoutOptions);
      this.sendSuccessResponse(res, req, graph);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Send success response
   */
  private sendSuccessResponse<T>(
    res: Response,
    req: Request,
    data: T,
    pagination?: PaginationMetadata
  ): void {
    const requestId = (req as any).requestId || 'unknown';
    const span = (req as any).span;

    const response: ApiResponse<T> = {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        request_id: requestId,
        pagination,
      },
    };

    // Calculate ETag if enabled
    if (this.config.enableEtag) {
      const etag = this.calculateEtag(data);
      res.setHeader('ETag', etag);

      // Check If-None-Match header
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch === etag) {
        if (span) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
        }
        res.status(304).end();
        return;
      }
    }

    // Set cache headers
    res.setHeader('Cache-Control', 'private, max-age=60');

    if (span) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }

    res.status(200).json(response);
  }

  /**
   * Calculate ETag for response caching
   */
  private calculateEtag(data: unknown): string {
    const hash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify(data))
      .digest('hex');
    return `"${hash}"`;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Group events by type
   */
  private groupByType(events: unknown[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const event of events) {
      const e = event as { event_type: string };
      groups[e.event_type] = (groups[e.event_type] || 0) + 1;
    }
    return groups;
  }

  /**
   * Group events by agent
   */
  private groupByAgent(events: unknown[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const event of events) {
      const e = event as { agent_id: string };
      groups[e.agent_id] = (groups[e.agent_id] || 0) + 1;
    }
    return groups;
  }

  /**
   * Get server status
   */
  getStatus(): { isRunning: boolean; port: number; etagCacheSize: number } {
    return {
      isRunning: this.isRunning,
      port: this.config.port,
      etagCacheSize: this.etagCache.size,
    };
  }
}
