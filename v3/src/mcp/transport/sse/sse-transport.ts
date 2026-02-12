/**
 * Agentic QE v3 - SSE Transport
 * Server-Sent Events transport implementation for AG-UI protocol
 */

import { v4 as uuid } from 'uuid';
import { safeJsonParse } from '../../../cli/helpers/safe-json.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { ConnectionManager, createConnectionManager } from './connection-manager.js';
import type {
  SSETransportConfig,
  SSEConnection,
  AGUIEvent,
  AgentRequest,
  AgentHandler,
  EventEmitter,
  SSERequest,
  SSEResponse,
  SSETransportMetrics,
  AGUIEventTypeValue,
} from './types.js';
import { AGUIEventType } from './types.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<SSETransportConfig> = {
  keepAliveInterval: 15000,
  maxBufferSize: 100,
  flushInterval: 50,
  parseBody: true,
  maxBodySize: 1024 * 1024, // 1MB
  connectionTimeout: 300000, // 5 minutes
  customHeaders: {},
};

// ============================================================================
// Event Buffer for Backpressure Handling
// ============================================================================

class EventBuffer {
  private buffer: AGUIEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushInterval: number;
  private readonly maxSize: number;
  private readonly onFlush: (events: AGUIEvent[]) => void;

  constructor(
    flushInterval: number,
    maxSize: number,
    onFlush: (events: AGUIEvent[]) => void
  ) {
    this.flushInterval = flushInterval;
    this.maxSize = maxSize;
    this.onFlush = onFlush;
  }

  add(event: AGUIEvent): void {
    this.buffer.push(event);

    // Immediate flush if buffer is full (backpressure)
    if (this.buffer.length >= this.maxSize) {
      this.flush();
      return;
    }

    // Schedule flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.flushInterval);
    }
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length > 0) {
      const events = this.buffer;
      this.buffer = [];
      this.onFlush(events);
    }
  }

  clear(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.buffer = [];
  }

  get size(): number {
    return this.buffer.length;
  }
}

// ============================================================================
// SSE Transport Implementation
// ============================================================================

export class SSETransport {
  private readonly config: Required<SSETransportConfig>;
  private readonly connectionManager: ConnectionManager;
  private agentHandler: AgentHandler | null = null;
  private disposed = false;

  constructor(config: SSETransportConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.connectionManager = createConnectionManager({
      keepAliveInterval: this.config.keepAliveInterval,
      connectionTimeout: this.config.connectionTimeout,
    });
  }

  /**
   * Set the agent handler for processing requests
   */
  setAgentHandler(handler: AgentHandler): void {
    this.agentHandler = handler;
  }

  /**
   * Handle incoming SSE request
   * This is the main entry point for the `/agent/stream` endpoint
   */
  async handleRequest(
    req: SSERequest | IncomingMessage,
    res: SSEResponse | ServerResponse
  ): Promise<void> {
    if (this.disposed) {
      this.sendError(res as SSEResponse, 503, 'Service Unavailable', 'Transport disposed');
      return;
    }

    // Only accept POST requests
    if (req.method !== 'POST') {
      this.sendError(res as SSEResponse, 405, 'Method Not Allowed', 'Only POST is supported');
      return;
    }

    // Parse request body if needed
    let agentRequest: AgentRequest;
    try {
      agentRequest = await this.parseRequestBody(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse request body';
      this.sendError(res as SSEResponse, 400, 'Bad Request', message);
      return;
    }

    // Validate required fields
    if (!agentRequest.threadId) {
      this.sendError(res as SSEResponse, 400, 'Bad Request', 'Missing required field: threadId');
      return;
    }

    // Generate run ID if not provided
    const runId = agentRequest.runId || uuid();

    // Set SSE headers
    this.setSSEHeaders(res as SSEResponse);

    // Create connection
    let connection: SSEConnection;
    try {
      connection = this.connectionManager.createConnection(
        agentRequest.threadId,
        runId,
        res as SSEResponse
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create connection';
      this.sendError(res as SSEResponse, 503, 'Service Unavailable', message);
      return;
    }

    // Mark connection as open
    this.connectionManager.updateState(connection.id, 'open');

    // Set up event buffer for backpressure handling
    const buffer = new EventBuffer(
      this.config.flushInterval,
      this.config.maxBufferSize,
      (events) => this.writeEvents(connection, events)
    );

    // Create event emitter function
    const emit: EventEmitter = (event: AGUIEvent) => {
      if (connection.state !== 'open') {
        return;
      }
      // Add timestamp if not present
      if (!event.timestamp) {
        event.timestamp = Date.now();
      }
      buffer.add(event);
    };

    // Handle client disconnect
    req.on('close', () => {
      buffer.clear();
      this.connectionManager.closeConnection(connection.id, 'Client disconnected');
    });

    req.on('error', () => {
      buffer.clear();
      this.connectionManager.recordError(connection.id);
      this.connectionManager.closeConnection(connection.id, 'Request error');
    });

    res.on('error', () => {
      buffer.clear();
      this.connectionManager.recordError(connection.id);
      this.connectionManager.closeConnection(connection.id, 'Response error');
    });

    // Emit RUN_STARTED event
    emit({
      type: AGUIEventType.RUN_STARTED,
      threadId: agentRequest.threadId,
      runId,
    });

    // Flush the RUN_STARTED event immediately
    buffer.flush();

    // Process agent request
    try {
      if (!this.agentHandler) {
        throw new Error('No agent handler registered');
      }

      await this.agentHandler(agentRequest, emit, connection.abortController.signal);

      // Flush any remaining buffered events
      buffer.flush();

      // Emit RUN_FINISHED event if connection is still open
      if (connection.state === 'open') {
        this.writeEvent(connection, {
          type: AGUIEventType.RUN_FINISHED,
          runId,
          outcome: 'success',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      // Flush buffer before error event
      buffer.flush();

      const message = error instanceof Error ? error.message : 'Unknown error';
      const isAborted = error instanceof Error && error.name === 'AbortError';

      if (!isAborted && connection.state === 'open') {
        this.writeEvent(connection, {
          type: AGUIEventType.RUN_ERROR,
          runId,
          message,
          code: 'INTERNAL_ERROR',
          timestamp: Date.now(),
        });
        this.connectionManager.recordError(connection.id);
      }
    } finally {
      // Close connection
      buffer.clear();
      this.connectionManager.closeConnection(connection.id, 'Request complete');
    }
  }

  /**
   * Get transport metrics
   */
  getMetrics(): SSETransportMetrics {
    return this.connectionManager.getMetrics();
  }

  /**
   * Get active connections count
   */
  getActiveConnectionsCount(): number {
    return this.connectionManager.getActiveConnections().length;
  }

  /**
   * Close all connections
   */
  closeAllConnections(reason?: string): void {
    const connections = this.connectionManager.getActiveConnections();
    for (const connection of connections) {
      this.connectionManager.closeConnection(connection.id, reason);
    }
  }

  /**
   * Dispose of the transport
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.connectionManager.dispose();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async parseRequestBody(req: SSERequest | IncomingMessage): Promise<AgentRequest> {
    // If body is already parsed (e.g., by express.json())
    if ((req as SSERequest).body) {
      return (req as SSERequest).body!;
    }

    if (!this.config.parseBody) {
      throw new Error('Request body parsing is disabled');
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;

      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > this.config.maxBodySize) {
          reject(new Error(`Request body exceeds maximum size of ${this.config.maxBodySize} bytes`));
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          if (!body) {
            reject(new Error('Empty request body'));
            return;
          }
          const parsed = safeJsonParse<AgentRequest>(body);
          resolve(parsed);
        } catch (error) {
          reject(new Error('Invalid JSON in request body'));
        }
      });

      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  private setSSEHeaders(res: SSEResponse): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Add custom headers
    for (const [key, value] of Object.entries(this.config.customHeaders)) {
      res.setHeader(key, value);
    }

    // Flush headers immediately
    res.flushHeaders();
  }

  private writeEvent(connection: SSEConnection, event: AGUIEvent): void {
    if (connection.state !== 'open' || connection.response.writableEnded) {
      return;
    }

    try {
      const data = this.formatSSEEvent(event);
      connection.response.write(data);
      this.connectionManager.recordEventSent(connection.id, Buffer.byteLength(data, 'utf-8'));

      // Flush if available (Express-style flush for compression middleware)
      const res = connection.response as SSEResponse;
      if (res.flush && typeof res.flush === 'function') {
        res.flush();
      }
    } catch {
      this.connectionManager.recordError(connection.id);
    }
  }

  private writeEvents(connection: SSEConnection, events: AGUIEvent[]): void {
    if (connection.state !== 'open' || connection.response.writableEnded) {
      return;
    }

    try {
      let totalBytes = 0;
      const chunks: string[] = [];

      for (const event of events) {
        const data = this.formatSSEEvent(event);
        chunks.push(data);
        totalBytes += Buffer.byteLength(data, 'utf-8');
      }

      const combined = chunks.join('');
      connection.response.write(combined);
      this.connectionManager.recordEventSent(connection.id, totalBytes);

      // Flush if available (Express-style flush for compression middleware)
      const res = connection.response as SSEResponse;
      if (res.flush && typeof res.flush === 'function') {
        res.flush();
      }
    } catch {
      this.connectionManager.recordError(connection.id);
    }
  }

  private formatSSEEvent(event: AGUIEvent): string {
    const eventType = event.type;
    const data = JSON.stringify(event);
    return `event: ${eventType}\ndata: ${data}\n\n`;
  }

  private sendError(
    res: SSEResponse,
    statusCode: number,
    statusMessage: string,
    errorMessage: string
  ): void {
    if (res.headersSent) {
      return;
    }

    res.statusCode = statusCode;
    res.statusMessage = statusMessage;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: errorMessage }));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSSETransport(config?: SSETransportConfig): SSETransport {
  return new SSETransport(config);
}

// ============================================================================
// Express Middleware Factory
// ============================================================================

export interface SSEMiddlewareOptions extends SSETransportConfig {
  /**
   * Path to mount the SSE endpoint (default: '/agent/stream')
   */
  path?: string;
}

/**
 * Create Express middleware for SSE transport
 */
export function createSSEMiddleware(
  agentHandler: AgentHandler,
  options: SSEMiddlewareOptions = {}
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  const { path = '/agent/stream', ...config } = options;
  const transport = createSSETransport(config);
  transport.setAgentHandler(agentHandler);

  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    // Check if this request matches our path
    const url = req.url || '';
    const requestPath = url.split('?')[0];

    if (requestPath !== path) {
      next();
      return;
    }

    // Handle SSE request
    transport.handleRequest(req, res).catch(() => {
      // Error already handled
    });
  };
}
