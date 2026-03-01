/**
 * Agentic QE v3 - WebSocket Connection Manager
 * Manages WebSocket connection lifecycle, heartbeat, and state recovery
 *
 * @module mcp/transport/websocket/connection-manager
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import type {
  WebSocketConnection,
  WebSocketConnectionState,
  WebSocketConnectionMetrics,
  WebSocketTransportMetrics,
  StateRecoveryEntry,
  EventServerMessage,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

export interface WebSocketConnectionManagerConfig {
  /**
   * Heartbeat interval in milliseconds (default: 30000)
   */
  heartbeatInterval?: number;

  /**
   * Heartbeat timeout in milliseconds (default: 10000)
   */
  heartbeatTimeout?: number;

  /**
   * Connection timeout in milliseconds (default: 300000 = 5 minutes)
   */
  connectionTimeout?: number;

  /**
   * Maximum concurrent connections (default: 1000)
   */
  maxConnections?: number;

  /**
   * State recovery buffer size (default: 1000 events)
   */
  recoveryBufferSize?: number;

  /**
   * Resume token expiration in milliseconds (default: 300000 = 5 minutes)
   */
  resumeTokenExpiration?: number;

  /**
   * Enable metrics collection (default: true)
   */
  enableMetrics?: boolean;
}

const DEFAULT_CONFIG: Required<WebSocketConnectionManagerConfig> = {
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  connectionTimeout: 300000,
  maxConnections: 1000,
  recoveryBufferSize: 1000,
  resumeTokenExpiration: 300000,
  enableMetrics: true,
};

// ============================================================================
// Connection Manager Implementation
// ============================================================================

export class WebSocketConnectionManager extends EventEmitter {
  private readonly config: Required<WebSocketConnectionManagerConfig>;
  private readonly connections: Map<string, WebSocketConnection> = new Map();
  private readonly connectionsByThread: Map<string, Set<string>> = new Map();
  private readonly recoveryStore: Map<string, StateRecoveryEntry> = new Map();
  private readonly closedConnections: WebSocketConnection[] = [];
  private readonly heartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readonly heartbeatTimeoutTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly timeoutTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(config: WebSocketConnectionManagerConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupTimer();
  }

  // ============================================================================
  // Connection Lifecycle
  // ============================================================================

  /**
   * Create a new WebSocket connection
   */
  createConnection(threadId: string, runId?: string): WebSocketConnection {
    if (this.disposed) {
      throw new Error('ConnectionManager has been disposed');
    }

    if (this.connections.size >= this.config.maxConnections) {
      throw new Error(`Maximum connections (${this.config.maxConnections}) exceeded`);
    }

    const id = uuid();
    const actualRunId = runId || uuid();
    const now = Date.now();
    const resumeToken = this.generateResumeToken();

    const connection: WebSocketConnection = {
      id,
      threadId,
      runId: actualRunId,
      state: 'connecting',
      resumeToken,
      createdAt: now,
      lastActivity: now,
      lastPing: now,
      lastEventId: 0,
      abortController: new AbortController(),
      metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        eventsSent: 0,
        bytesSent: 0,
        bytesReceived: 0,
        heartbeats: 0,
        errors: 0,
        startTime: now,
        averageLatencyMs: 0,
        peakLatencyMs: 0,
      },
    };

    this.connections.set(id, connection);
    this.addToThreadIndex(threadId, id);
    this.startTimeout(id);

    this.emit('connectionCreated', { connectionId: id, threadId, runId: actualRunId });

    return connection;
  }

  /**
   * Get connection by ID
   */
  getConnection(id: string): WebSocketConnection | undefined {
    return this.connections.get(id);
  }

  /**
   * Get connection by thread ID (returns most recent)
   */
  getConnectionByThreadId(threadId: string): WebSocketConnection | undefined {
    const connectionIds = this.connectionsByThread.get(threadId);
    if (!connectionIds || connectionIds.size === 0) {
      return undefined;
    }

    // Find most recently active connection
    let mostRecent: WebSocketConnection | undefined;
    for (const id of connectionIds) {
      const conn = this.connections.get(id);
      if (conn && (!mostRecent || conn.lastActivity > mostRecent.lastActivity)) {
        mostRecent = conn;
      }
    }

    return mostRecent;
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter(
      (conn) =>
        conn.state === 'connected' ||
        conn.state === 'authenticated' ||
        conn.state === 'streaming'
    );
  }

  /**
   * Update connection state
   */
  updateState(id: string, state: WebSocketConnectionState): void {
    const connection = this.connections.get(id);
    if (!connection) {
      return;
    }

    const previousState = connection.state;
    connection.state = state;
    connection.lastActivity = Date.now();

    if (state === 'connected' || state === 'authenticated') {
      this.startHeartbeat(id);
    }

    if (state === 'closed' || state === 'error') {
      connection.metrics.endTime = Date.now();
      this.stopHeartbeat(id);
      this.stopTimeout(id);
    }

    this.emit('stateChange', {
      connectionId: id,
      previousState,
      newState: state,
    });
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
    this.stopHeartbeat(id);
    this.stopTimeout(id);

    // Update state
    connection.state = 'closing';
    connection.metrics.endTime = Date.now();

    // Abort any ongoing operations
    connection.abortController.abort(reason || 'Connection closed');

    // Save state for recovery
    this.saveRecoveryState(connection);

    // Move to closed connections for metrics
    connection.state = 'closed';
    this.closedConnections.push(connection);
    while (this.closedConnections.length > 1000) {
      this.closedConnections.shift();
    }

    // Remove from indexes
    this.removeFromThreadIndex(connection.threadId, id);
    this.connections.delete(id);

    this.emit('connectionClosed', {
      connectionId: id,
      threadId: connection.threadId,
      reason,
    });
  }

  /**
   * Close all connections for a thread
   */
  closeThreadConnections(threadId: string, reason?: string): void {
    const connectionIds = this.connectionsByThread.get(threadId);
    if (!connectionIds) {
      return;
    }

    for (const id of Array.from(connectionIds)) {
      this.closeConnection(id, reason);
    }
  }

  // ============================================================================
  // Metrics Recording
  // ============================================================================

  /**
   * Record message sent
   */
  recordMessageSent(id: string, bytes: number): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.metrics.messagesSent++;
      connection.metrics.bytesSent += bytes;
      connection.lastActivity = Date.now();
      this.resetTimeout(id);
    }
  }

  /**
   * Record message received
   */
  recordMessageReceived(id: string, bytes: number): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.metrics.messagesReceived++;
      connection.metrics.bytesReceived += bytes;
      connection.lastActivity = Date.now();
      this.resetTimeout(id);
    }
  }

  /**
   * Record event sent
   */
  recordEventSent(id: string): number {
    const connection = this.connections.get(id);
    if (connection) {
      connection.metrics.eventsSent++;
      connection.lastEventId++;
      return connection.lastEventId;
    }
    return 0;
  }

  /**
   * Record heartbeat
   */
  recordHeartbeat(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.metrics.heartbeats++;
      connection.lastPing = Date.now();
      this.clearHeartbeatTimeout(id);
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
   * Record latency sample
   */
  recordLatency(id: string, latencyMs: number): void {
    const connection = this.connections.get(id);
    if (connection) {
      // Update peak
      if (latencyMs > connection.metrics.peakLatencyMs) {
        connection.metrics.peakLatencyMs = latencyMs;
      }

      // Update rolling average
      const samples = connection.metrics.heartbeats || 1;
      connection.metrics.averageLatencyMs =
        (connection.metrics.averageLatencyMs * (samples - 1) + latencyMs) / samples;
    }
  }

  // ============================================================================
  // State Recovery
  // ============================================================================

  /**
   * Store event for recovery
   */
  storeEventForRecovery(
    connectionId: string,
    event: EventServerMessage
  ): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    let entry = this.recoveryStore.get(connection.resumeToken);
    if (!entry) {
      entry = this.createRecoveryEntry(connection);
      this.recoveryStore.set(connection.resumeToken, entry);
    }

    entry.events.push(event);

    // Trim buffer if needed
    while (entry.events.length > this.config.recoveryBufferSize) {
      entry.events.shift();
    }
  }

  /**
   * Update state snapshot for recovery
   */
  updateRecoveryState(connectionId: string, state: Record<string, unknown>): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    const entry = this.recoveryStore.get(connection.resumeToken);
    if (entry) {
      entry.state = structuredClone(state);
    }
  }

  /**
   * Recover state from resume token
   */
  recoverState(
    resumeToken: string,
    lastEventId?: string
  ): StateRecoveryEntry | null {
    const entry = this.recoveryStore.get(resumeToken);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.recoveryStore.delete(resumeToken);
      return null;
    }

    // Filter events if lastEventId provided
    if (lastEventId) {
      const eventIdNum = parseInt(lastEventId, 10);
      if (!isNaN(eventIdNum)) {
        entry.events = entry.events.filter((e) => {
          const id = parseInt(e.eventId, 10);
          return !isNaN(id) && id > eventIdNum;
        });
      }
    }

    return entry;
  }

  /**
   * Validate resume token
   */
  validateResumeToken(resumeToken: string): boolean {
    const entry = this.recoveryStore.get(resumeToken);
    return entry !== null && entry !== undefined && Date.now() <= entry.expiresAt;
  }

  // ============================================================================
  // Transport Metrics
  // ============================================================================

  /**
   * Get transport metrics
   */
  getMetrics(): WebSocketTransportMetrics {
    const activeConnectionsList = this.getActiveConnections();
    const allConnections = [
      ...Array.from(this.connections.values()),
      ...this.closedConnections,
    ];

    const durations = allConnections
      .filter((c) => c.metrics.endTime)
      .map((c) => (c.metrics.endTime ?? 0) - c.metrics.startTime);

    const averageDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    // Calculate upgrade success rate (connections that made it to connected state)
    const successfulConnections = allConnections.filter(
      (c) =>
        c.state === 'connected' ||
        c.state === 'authenticated' ||
        c.state === 'streaming' ||
        (c.state === 'closed' && c.metrics.messagesSent > 0)
    );
    const upgradeSuccessRate =
      allConnections.length > 0
        ? successfulConnections.length / allConnections.length
        : 1;

    return {
      totalConnections: allConnections.length,
      activeConnections: activeConnectionsList.length,
      totalMessagesSent: allConnections.reduce((sum, c) => sum + c.metrics.messagesSent, 0),
      totalMessagesReceived: allConnections.reduce((sum, c) => sum + c.metrics.messagesReceived, 0),
      totalBytesSent: allConnections.reduce((sum, c) => sum + c.metrics.bytesSent, 0),
      totalBytesReceived: allConnections.reduce((sum, c) => sum + c.metrics.bytesReceived, 0),
      totalErrors: allConnections.reduce((sum, c) => sum + c.metrics.errors, 0),
      totalReconnections: 0, // TODO: track reconnections
      averageConnectionDuration: averageDuration,
      upgradeSuccessRate,
    };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose of the manager and close all connections
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close all connections
    const connectionIds = Array.from(this.connections.keys());
    for (const id of connectionIds) {
      this.closeConnection(id, 'Manager disposed');
    }

    // Clear all timers
    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();

    for (const timer of this.heartbeatTimeoutTimers.values()) {
      clearTimeout(timer);
    }
    this.heartbeatTimeoutTimers.clear();

    for (const timer of this.timeoutTimers.values()) {
      clearTimeout(timer);
    }
    this.timeoutTimers.clear();

    // Clear recovery store
    this.recoveryStore.clear();

    this.removeAllListeners();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private addToThreadIndex(threadId: string, connectionId: string): void {
    let connections = this.connectionsByThread.get(threadId);
    if (!connections) {
      connections = new Set();
      this.connectionsByThread.set(threadId, connections);
    }
    connections.add(connectionId);
  }

  private removeFromThreadIndex(threadId: string, connectionId: string): void {
    const connections = this.connectionsByThread.get(threadId);
    if (connections) {
      connections.delete(connectionId);
      if (connections.size === 0) {
        this.connectionsByThread.delete(threadId);
      }
    }
  }

  private generateResumeToken(): string {
    return `rt_${uuid()}_${Date.now().toString(36)}`;
  }

  private createRecoveryEntry(connection: WebSocketConnection): StateRecoveryEntry {
    return {
      resumeToken: connection.resumeToken,
      threadId: connection.threadId,
      runId: connection.runId,
      state: {},
      events: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.resumeTokenExpiration,
    };
  }

  private saveRecoveryState(connection: WebSocketConnection): void {
    const existingEntry = this.recoveryStore.get(connection.resumeToken);
    if (existingEntry) {
      // Update expiration
      existingEntry.expiresAt = Date.now() + this.config.resumeTokenExpiration;
    } else {
      // Create new entry
      this.recoveryStore.set(
        connection.resumeToken,
        this.createRecoveryEntry(connection)
      );
    }
  }

  private startHeartbeat(id: string): void {
    if (this.heartbeatTimers.has(id)) {
      return;
    }

    const timer = setInterval(() => {
      this.emit('heartbeatRequired', { connectionId: id });
      this.startHeartbeatTimeout(id);
    }, this.config.heartbeatInterval);

    this.heartbeatTimers.set(id, timer);
  }

  private stopHeartbeat(id: string): void {
    const timer = this.heartbeatTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(id);
    }
    this.clearHeartbeatTimeout(id);
  }

  private startHeartbeatTimeout(id: string): void {
    this.clearHeartbeatTimeout(id);

    const timer = setTimeout(() => {
      this.emit('heartbeatTimeout', { connectionId: id });
      this.closeConnection(id, 'Heartbeat timeout');
    }, this.config.heartbeatTimeout);

    this.heartbeatTimeoutTimers.set(id, timer);
  }

  private clearHeartbeatTimeout(id: string): void {
    const timer = this.heartbeatTimeoutTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.heartbeatTimeoutTimers.delete(id);
    }
  }

  private startTimeout(id: string): void {
    const timer = setTimeout(() => {
      this.emit('connectionTimeout', { connectionId: id });
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

  private startCleanupTimer(): void {
    // Clean up expired recovery entries every minute
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredRecoveryEntries();
    }, 60000);
  }

  private cleanupExpiredRecoveryEntries(): void {
    const now = Date.now();
    for (const [token, entry] of this.recoveryStore.entries()) {
      if (now > entry.expiresAt) {
        this.recoveryStore.delete(token);
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWebSocketConnectionManager(
  config?: WebSocketConnectionManagerConfig
): WebSocketConnectionManager {
  return new WebSocketConnectionManager(config);
}
