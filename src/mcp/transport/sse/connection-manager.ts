/**
 * Agentic QE v3 - SSE Connection Manager
 * Manages SSE connection lifecycle, keep-alive, and cleanup
 */

import { v4 as uuid } from 'uuid';
import type {
  SSEConnection,
  ConnectionState,
  ConnectionMetrics,
  SSETransportMetrics,
  SSEResponse,
  AGUIEvent,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

export interface ConnectionManagerConfig {
  /**
   * Keep-alive interval in milliseconds (default: 15000)
   */
  keepAliveInterval?: number;

  /**
   * Connection timeout in milliseconds (default: 300000 = 5 minutes)
   */
  connectionTimeout?: number;

  /**
   * Maximum concurrent connections (default: 1000)
   */
  maxConnections?: number;

  /**
   * Enable connection metrics collection (default: true)
   */
  enableMetrics?: boolean;
}

const DEFAULT_CONFIG: Required<ConnectionManagerConfig> = {
  keepAliveInterval: 15000,
  connectionTimeout: 300000,
  maxConnections: 1000,
  enableMetrics: true,
};

// ============================================================================
// Connection Manager Implementation
// ============================================================================

export class ConnectionManager {
  private readonly config: Required<ConnectionManagerConfig>;
  private readonly connections: Map<string, SSEConnection> = new Map();
  private readonly threadIndex: Map<string, Set<string>> = new Map(); // threadId → connection IDs
  private readonly closedConnections: SSEConnection[] = []; // Keep closed connections for metrics
  private readonly keepAliveTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readonly timeoutTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private disposed = false;

  constructor(config: ConnectionManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new SSE connection
   */
  createConnection(
    threadId: string,
    runId: string,
    response: SSEResponse
  ): SSEConnection {
    if (this.disposed) {
      throw new Error('ConnectionManager has been disposed');
    }

    if (this.connections.size >= this.config.maxConnections) {
      throw new Error(`Maximum connections (${this.config.maxConnections}) exceeded`);
    }

    const id = uuid();
    const now = Date.now();

    const connection: SSEConnection = {
      id,
      threadId,
      runId,
      createdAt: now,
      lastActivity: now,
      response,
      abortController: new AbortController(),
      state: 'connecting',
      metrics: {
        eventsSent: 0,
        bytesSent: 0,
        keepAlivesSent: 0,
        errors: 0,
        startTime: now,
      },
    };

    this.connections.set(id, connection);

    // Maintain threadId index for O(1) lookup
    let threadConns = this.threadIndex.get(threadId);
    if (!threadConns) {
      threadConns = new Set();
      this.threadIndex.set(threadId, threadConns);
    }
    threadConns.add(id);

    this.startKeepAlive(id);
    this.startTimeout(id);

    return connection;
  }

  /**
   * Get connection by ID
   */
  getConnection(id: string): SSEConnection | undefined {
    return this.connections.get(id);
  }

  /**
   * Get connection by thread ID
   */
  getConnectionByThreadId(threadId: string): SSEConnection | undefined {
    const connIds = this.threadIndex.get(threadId);
    if (!connIds) return undefined;

    // Return first active connection for this thread
    for (const id of connIds) {
      const conn = this.connections.get(id);
      if (conn) return conn;
    }
    return undefined;
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): SSEConnection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.state === 'open' || conn.state === 'connecting'
    );
  }

  /**
   * Update connection state
   */
  updateState(id: string, state: ConnectionState): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.state = state;
      connection.lastActivity = Date.now();

      if (state === 'closed') {
        connection.metrics.endTime = Date.now();
      }
    }
  }

  /**
   * Record event sent
   */
  recordEventSent(id: string, bytes: number): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.metrics.eventsSent++;
      connection.metrics.bytesSent += bytes;
      connection.lastActivity = Date.now();
      this.resetTimeout(id);
    }
  }

  /**
   * Record error
   */
  recordError(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.metrics.errors++;
    }
  }

  /**
   * Close connection
   */
  closeConnection(id: string, reason?: string): void {
    const connection = this.connections.get(id);
    if (!connection) {
      return;
    }

    // Stop timers
    this.stopKeepAlive(id);
    this.stopTimeout(id);

    // Update state
    connection.state = 'closing';
    connection.metrics.endTime = Date.now();

    // Abort any ongoing operations
    connection.abortController.abort(reason || 'Connection closed');

    // End response if not already ended
    if (!connection.response.writableEnded) {
      try {
        connection.response.end();
      } catch {
        // Ignore errors when ending response
      }
    }

    connection.state = 'closed';

    // Store in closed connections for metrics tracking
    this.closedConnections.push(connection);

    // Limit closed connections history to prevent memory leak
    while (this.closedConnections.length > 1000) {
      this.closedConnections.shift();
    }

    // Remove from thread index
    const threadConns = this.threadIndex.get(connection.threadId);
    if (threadConns) {
      threadConns.delete(id);
      if (threadConns.size === 0) {
        this.threadIndex.delete(connection.threadId);
      }
    }

    this.connections.delete(id);
  }

  /**
   * Close all connections for a thread
   */
  closeThreadConnections(threadId: string, reason?: string): void {
    const connIds = this.threadIndex.get(threadId);
    if (!connIds) return;

    // Copy IDs since closeConnection modifies the index
    const ids = Array.from(connIds);
    for (const id of ids) {
      this.closeConnection(id, reason);
    }
  }

  /**
   * Get transport metrics
   */
  getMetrics(): SSETransportMetrics {
    const activeConnectionsList = Array.from(this.connections.values());
    const allConnections = [...activeConnectionsList, ...this.closedConnections];
    const activeConnections = activeConnectionsList.filter(
      (c) => c.state === 'open' || c.state === 'connecting'
    );

    const durations = allConnections
      .filter((c) => c.metrics.endTime)
      .map((c) => (c.metrics.endTime ?? 0) - c.metrics.startTime);

    const averageDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    return {
      totalConnections: allConnections.length,
      activeConnections: activeConnections.length,
      totalEventsSent: allConnections.reduce((sum, c) => sum + c.metrics.eventsSent, 0),
      totalBytesSent: allConnections.reduce((sum, c) => sum + c.metrics.bytesSent, 0),
      totalErrors: allConnections.reduce((sum, c) => sum + c.metrics.errors, 0),
      averageConnectionDuration: averageDuration,
    };
  }

  /**
   * Dispose of the manager and close all connections
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Close all connections
    const connectionIds = Array.from(this.connections.keys());
    for (const id of connectionIds) {
      this.closeConnection(id, 'Manager disposed');
    }

    // Clear all timers
    const keepAliveTimersList = Array.from(this.keepAliveTimers.values());
    for (const timer of keepAliveTimersList) {
      clearInterval(timer);
    }
    this.keepAliveTimers.clear();

    const timeoutTimersList = Array.from(this.timeoutTimers.values());
    for (const timer of timeoutTimersList) {
      clearTimeout(timer);
    }
    this.timeoutTimers.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private startKeepAlive(id: string): void {
    const timer = setInterval(() => {
      this.sendKeepAlive(id);
    }, this.config.keepAliveInterval);

    this.keepAliveTimers.set(id, timer);
  }

  private stopKeepAlive(id: string): void {
    const timer = this.keepAliveTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.keepAliveTimers.delete(id);
    }
  }

  private sendKeepAlive(id: string): void {
    const connection = this.connections.get(id);
    if (!connection || connection.state !== 'open') {
      return;
    }

    try {
      // SSE comment format for keep-alive
      const keepAlive = `: keep-alive\n\n`;
      connection.response.write(keepAlive);
      connection.metrics.keepAlivesSent++;
      connection.lastActivity = Date.now();

      // Flush if available (Express-style flush for compression middleware)
      const res = connection.response as SSEResponse;
      if (res.flush && typeof res.flush === 'function') {
        res.flush();
      }
    } catch {
      // Connection might be closed
      this.closeConnection(id, 'Keep-alive failed');
    }
  }

  private startTimeout(id: string): void {
    const timer = setTimeout(() => {
      this.closeConnection(id, 'Connection timeout');
    }, this.config.connectionTimeout);

    this.timeoutTimers.set(id, timer);
  }

  private stopTimeout(id: string): void {
    const timer = this.timeoutTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(id);
    }
  }

  private resetTimeout(id: string): void {
    this.stopTimeout(id);
    this.startTimeout(id);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createConnectionManager(config?: ConnectionManagerConfig): ConnectionManager {
  return new ConnectionManager(config);
}
