/**
 * Agentic QE v3 - Stdio Transport
 * JSON-RPC 2.0 over stdin/stdout for MCP protocol
 * Based on claude-flow MCP implementation
 */

import * as readline from 'readline';
import { Readable, Writable } from 'stream';
import { safeJsonParse } from '../../shared/safe-json.js';

// ============================================================================
// Types
// ============================================================================

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface TransportConfig {
  maxMessageSize?: number;
  inputStream?: Readable;
  outputStream?: Writable;
}

export interface TransportMetrics {
  messagesReceived: number;
  messagesSent: number;
  errors: number;
  bytesReceived: number;
  bytesSent: number;
}

export type RequestHandler = (request: JSONRPCRequest) => Promise<unknown>;
export type NotificationHandler = (notification: JSONRPCRequest) => Promise<void>;

// ============================================================================
// Error Codes (JSON-RPC 2.0 standard)
// ============================================================================

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
} as const;

// ============================================================================
// Stdio Transport Implementation
// ============================================================================

export class StdioTransport {
  private readonly inputStream: Readable;
  private readonly outputStream: Writable;
  private readonly maxMessageSize: number;
  private rl: readline.Interface | null = null;
  private requestHandler: RequestHandler | null = null;
  private notificationHandler: NotificationHandler | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private running = false;
  private metrics: TransportMetrics = {
    messagesReceived: 0,
    messagesSent: 0,
    errors: 0,
    bytesReceived: 0,
    bytesSent: 0,
  };

  constructor(config: TransportConfig = {}) {
    this.inputStream = config.inputStream ?? process.stdin;
    this.outputStream = config.outputStream ?? process.stdout;
    this.maxMessageSize = config.maxMessageSize ?? 10 * 1024 * 1024; // 10MB default
  }

  /**
   * Set handler for requests (messages with id)
   */
  onRequest(handler: RequestHandler): void {
    this.requestHandler = handler;
  }

  /**
   * Set handler for notifications (messages without id)
   */
  onNotification(handler: NotificationHandler): void {
    this.notificationHandler = handler;
  }

  /**
   * Start listening for messages
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.rl = readline.createInterface({
      input: this.inputStream,
      crlfDelay: Infinity,
    });

    this.rl.on('line', (line) => {
      this.handleLine(line).catch((err) => {
        this.metrics.errors++;
        console.error('[StdioTransport] Error handling line:', err);
      });
    });

    this.rl.on('close', () => {
      const wasRunning = this.running;
      this.running = false;
      // If we were running and didn't explicitly stop, this is an unexpected close
      if (wasRunning && this.errorHandler) {
        this.errorHandler(new Error('Transport connection closed unexpectedly'));
      }
    });

    this.rl.on('error', (err) => {
      this.metrics.errors++;
      console.error('[StdioTransport] Readline error:', err);
      if (this.errorHandler) {
        this.errorHandler(err);
      }
    });
  }

  /**
   * Stop listening
   */
  stop(): void {
    // Set running to false BEFORE closing to prevent the close handler
    // from triggering the error handler during explicit stop
    this.running = false;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * Send a response
   */
  async sendResponse(response: JSONRPCResponse): Promise<void> {
    await this.write(JSON.stringify(response));
  }

  /**
   * Send a notification (no id)
   */
  async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const notification: JSONRPCRequest = {
      jsonrpc: '2.0',
      method,
      params,
    };
    await this.write(JSON.stringify(notification));
  }

  /**
   * Set error handler for transport-level errors
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  /**
   * Reconnect the transport by re-attaching to stdin/stdout.
   * Closes the existing readline interface and creates a new one.
   */
  reconnect(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.running = false;
    this.start();
  }

  /**
   * Get transport metrics
   */
  getMetrics(): TransportMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if transport is running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async handleLine(line: string): Promise<void> {
    if (!line.trim()) {
      return;
    }

    this.metrics.bytesReceived += Buffer.byteLength(line, 'utf-8');

    // Check message size
    if (Buffer.byteLength(line, 'utf-8') > this.maxMessageSize) {
      this.metrics.errors++;
      await this.sendError(null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Message too large');
      return;
    }

    // Parse JSON
    let message: JSONRPCRequest;
    try {
      message = safeJsonParse<JSONRPCRequest>(line);
    } catch {
      this.metrics.errors++;
      await this.sendError(null, JSON_RPC_ERRORS.PARSE_ERROR, 'Parse error');
      return;
    }

    // Validate JSON-RPC 2.0
    if (message.jsonrpc !== '2.0') {
      this.metrics.errors++;
      await this.sendError(
        message.id ?? null,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        'Invalid JSON-RPC version'
      );
      return;
    }

    if (!message.method || typeof message.method !== 'string') {
      this.metrics.errors++;
      await this.sendError(
        message.id ?? null,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        'Missing or invalid method'
      );
      return;
    }

    this.metrics.messagesReceived++;

    // Route to appropriate handler
    if (message.id !== undefined) {
      // Request - needs response
      await this.handleRequest(message);
    } else {
      // Notification - no response
      await this.handleNotification(message);
    }
  }

  private async handleRequest(request: JSONRPCRequest): Promise<void> {
    if (!this.requestHandler) {
      await this.sendError(
        request.id!,
        JSON_RPC_ERRORS.INTERNAL_ERROR,
        'No request handler registered'
      );
      return;
    }

    try {
      const result = await this.requestHandler(request);
      await this.sendResponse({
        jsonrpc: '2.0',
        id: request.id!,
        result,
      });
    } catch (err) {
      const error = err as Error;
      await this.sendError(
        request.id!,
        JSON_RPC_ERRORS.INTERNAL_ERROR,
        error.message || 'Internal error'
      );
    }
  }

  private async handleNotification(notification: JSONRPCRequest): Promise<void> {
    if (!this.notificationHandler) {
      // Notifications don't require a response, so just ignore
      return;
    }

    try {
      await this.notificationHandler(notification);
    } catch (err) {
      this.metrics.errors++;
      console.error('[StdioTransport] Notification handler error:', err);
    }
  }

  private async sendError(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): Promise<void> {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
    await this.sendResponse(response);
  }

  /**
   * Write with retry and backpressure handling.
   * Retries up to 3 times with exponential backoff before rejecting.
   */
  private async write(data: string): Promise<void> {
    const maxAttempts = 3;
    const backoffDelays = [0, 500, 1000];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.writeOnce(data);
        return;
      } catch (err) {
        if (attempt < maxAttempts - 1) {
          console.error(
            `[StdioTransport] Write attempt ${attempt + 1} failed, retrying in ${backoffDelays[attempt + 1]}ms...`
          );
          await new Promise(r => setTimeout(r, backoffDelays[attempt + 1]));
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Single write attempt with 120s timeout and backpressure (drain) handling.
   */
  private async writeOnce(data: string): Promise<void> {
    const message = data + '\n';

    // Wait for drain if the stream has backpressure
    if (this.outputStream.writableNeedDrain) {
      await new Promise<void>((resolve, reject) => {
        const drainTimeout = setTimeout(() => {
          reject(new Error('Transport drain timeout after 30 seconds'));
        }, 30000);
        this.outputStream.once('drain', () => {
          clearTimeout(drainTimeout);
          resolve();
        });
      });
    }

    return new Promise((resolve, reject) => {
      const writeTimeout = setTimeout(() => {
        this.metrics.errors++;
        reject(new Error('Transport write timeout after 120 seconds'));
      }, 120000);

      this.outputStream.write(message, 'utf-8', (error) => {
        clearTimeout(writeTimeout);
        if (error) {
          this.metrics.errors++;
          reject(error);
        } else {
          this.metrics.messagesSent++;
          this.metrics.bytesSent += Buffer.byteLength(message, 'utf-8');
          resolve();
        }
      });
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createStdioTransport(config?: TransportConfig): StdioTransport {
  return new StdioTransport(config);
}
