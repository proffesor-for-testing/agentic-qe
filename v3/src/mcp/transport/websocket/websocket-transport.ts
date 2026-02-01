/**
 * Agentic QE v3 - WebSocket Transport
 * Bidirectional WebSocket transport for AG-UI protocol with low latency streaming
 *
 * @module mcp/transport/websocket/websocket-transport
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import type { IncomingMessage, Server as HttpServer } from 'http';
import type { Socket } from 'net';
import type { WebSocket as WS, WebSocketServer as WSServer, RawData } from 'ws';
import {
  WebSocketConnectionManager,
  createWebSocketConnectionManager,
  type WebSocketConnectionManagerConfig,
} from './connection-manager.js';
import {
  AGUIEventType,
  WebSocketMessageType,
  WebSocketServerMessageType,
  type WebSocketTransportConfig,
  type WebSocketTransportMetrics,
  type WebSocketConnection,
  type WebSocketAgentHandler,
  type AGUIEvent,
  type WebSocketClientMessage,
  type WebSocketServerMessage,
  type ConnectMessage,
  type AgentRequestMessage,
  type RecoverStateMessage,
  type CancelMessage,
  type PingMessage,
  type ConnectedServerMessage,
  type ErrorServerMessage,
  type EventServerMessage,
  type PongServerMessage,
  type StateRecoveredServerMessage,
  type WebSocketUpgradeInfo,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<WebSocketTransportConfig> = {
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  connectionTimeout: 300000,
  maxMessageSize: 1024 * 1024, // 1MB
  maxConnections: 1000,
  compression: false,
  recoveryBufferSize: 1000,
  resumeTokenExpiration: 300000,
  enableMetrics: true,
  allowedOrigins: ['*'],
};

// ============================================================================
// WebSocket Transport Implementation
// ============================================================================

export class WebSocketTransport extends EventEmitter {
  private readonly config: Required<WebSocketTransportConfig>;
  private readonly connectionManager: WebSocketConnectionManager;
  private wsServer: WSServer | null = null;
  private agentHandler: WebSocketAgentHandler | null = null;
  private disposed = false;

  // Map WebSocket instances to connection IDs
  private readonly wsToConnectionId: Map<WS, string> = new Map();
  private readonly connectionIdToWs: Map<string, WS> = new Map();

  constructor(config: WebSocketTransportConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    const managerConfig: WebSocketConnectionManagerConfig = {
      heartbeatInterval: this.config.heartbeatInterval,
      heartbeatTimeout: this.config.heartbeatTimeout,
      connectionTimeout: this.config.connectionTimeout,
      maxConnections: this.config.maxConnections,
      recoveryBufferSize: this.config.recoveryBufferSize,
      resumeTokenExpiration: this.config.resumeTokenExpiration,
      enableMetrics: this.config.enableMetrics,
    };

    this.connectionManager = createWebSocketConnectionManager(managerConfig);
    this.setupConnectionManagerEvents();
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Set the agent handler for processing requests
   */
  setAgentHandler(handler: WebSocketAgentHandler): void {
    this.agentHandler = handler;
  }

  // ============================================================================
  // Server Attachment
  // ============================================================================

  /**
   * Attach to an HTTP server for WebSocket upgrade
   * This method should be called to enable WebSocket connections
   *
   * @param server - The HTTP server to attach to
   * @param path - The path for WebSocket upgrade (default: '/agent/ws')
   */
  async attach(server: HttpServer, path: string = '/agent/ws'): Promise<void> {
    if (this.disposed) {
      throw new Error('Transport has been disposed');
    }

    // Dynamically import ws module
    const { WebSocketServer } = await import('ws');

    this.wsServer = new WebSocketServer({
      noServer: true, // We handle upgrade ourselves
      maxPayload: this.config.maxMessageSize,
      perMessageDeflate: this.config.compression
        ? {
            zlibDeflateOptions: { level: 6 },
            threshold: 1024,
          }
        : false,
    });

    // Handle WebSocket connection
    this.wsServer.on('connection', (ws: WS, request: IncomingMessage, upgradeInfo: WebSocketUpgradeInfo) => {
      this.handleConnection(ws, request, upgradeInfo);
    });

    // Handle HTTP upgrade requests
    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

      // Only handle requests for our path
      if (url.pathname !== path) {
        return;
      }

      // Validate origin
      const origin = request.headers.origin;
      if (!this.validateOrigin(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // Extract upgrade info
      const upgradeInfo: WebSocketUpgradeInfo = {
        origin,
        protocol: request.headers['sec-websocket-protocol'],
        clientIp: this.getClientIp(request),
        query: Object.fromEntries(url.searchParams.entries()),
      };

      // Perform WebSocket upgrade
      this.wsServer!.handleUpgrade(request, socket, head, (ws) => {
        this.wsServer!.emit('connection', ws, request, upgradeInfo);
      });
    });

    this.emit('attached', { path });
  }

  /**
   * Handle a manual WebSocket upgrade (for testing or custom servers)
   */
  handleUpgrade(
    request: IncomingMessage,
    socket: Socket,
    head: Buffer
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (this.disposed) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        reject(new Error('Transport has been disposed'));
        return;
      }

      try {
        // Dynamically import ws if not already attached
        if (!this.wsServer) {
          const { WebSocketServer } = await import('ws');
          this.wsServer = new WebSocketServer({
            noServer: true,
            maxPayload: this.config.maxMessageSize,
            perMessageDeflate: this.config.compression,
          });

          this.wsServer.on('connection', (ws: WS, req: IncomingMessage, upgradeInfo: WebSocketUpgradeInfo) => {
            this.handleConnection(ws, req, upgradeInfo);
          });
        }

        const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
        const upgradeInfo: WebSocketUpgradeInfo = {
          origin: request.headers.origin,
          protocol: request.headers['sec-websocket-protocol'],
          clientIp: this.getClientIp(request),
          query: Object.fromEntries(url.searchParams.entries()),
        };

        this.wsServer.handleUpgrade(request, socket, head, (ws) => {
          this.wsServer!.emit('connection', ws, request, upgradeInfo);
          resolve();
        });
      } catch (error) {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
        reject(error);
      }
    });
  }

  // ============================================================================
  // Connection Handling
  // ============================================================================

  private handleConnection(
    ws: WS,
    _request: IncomingMessage,
    upgradeInfo: WebSocketUpgradeInfo
  ): void {
    // Create pending connection - will be fully initialized on CONNECT message
    const tempId = `pending_${uuid()}`;

    // Store temporary mapping
    this.wsToConnectionId.set(ws, tempId);

    // Set up message handler
    ws.on('message', (data: RawData) => {
      this.handleMessage(ws, data);
    });

    // Set up close handler
    ws.on('close', (code: number, reason: Buffer) => {
      this.handleClose(ws, code, reason.toString());
    });

    // Set up error handler
    ws.on('error', (error: Error) => {
      this.handleError(ws, error);
    });

    // Set up pong handler for heartbeat
    ws.on('pong', () => {
      const connectionId = this.wsToConnectionId.get(ws);
      if (connectionId && !connectionId.startsWith('pending_')) {
        this.connectionManager.recordHeartbeat(connectionId);
      }
    });

    this.emit('upgrade', { upgradeInfo });
  }

  private handleMessage(ws: WS, data: RawData): void {
    const connectionId = this.wsToConnectionId.get(ws);
    if (!connectionId) {
      return;
    }

    try {
      const messageStr = data.toString();
      const message: WebSocketClientMessage = JSON.parse(messageStr);

      // Record message received
      if (!connectionId.startsWith('pending_')) {
        this.connectionManager.recordMessageReceived(connectionId, Buffer.byteLength(messageStr));
      }

      // Route message by type
      switch (message.type) {
        case WebSocketMessageType.CONNECT:
          this.handleConnectMessage(ws, connectionId, message as ConnectMessage);
          break;
        case WebSocketMessageType.AGENT_REQUEST:
          this.handleAgentRequestMessage(ws, connectionId, message as AgentRequestMessage);
          break;
        case WebSocketMessageType.RECOVER_STATE:
          this.handleRecoverStateMessage(ws, connectionId, message as RecoverStateMessage);
          break;
        case WebSocketMessageType.CANCEL:
          this.handleCancelMessage(ws, connectionId, message as CancelMessage);
          break;
        case WebSocketMessageType.PING:
          this.handlePingMessage(ws, connectionId, message as PingMessage);
          break;
        case WebSocketMessageType.PONG:
          // Pong is handled via ws 'pong' event
          break;
        case WebSocketMessageType.DISCONNECT:
          ws.close(1000, 'Client requested disconnect');
          break;
        default:
          this.sendError(ws, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${(message as WebSocketClientMessage).type}`);
      }
    } catch (error) {
      this.sendError(ws, 'INVALID_MESSAGE', error instanceof Error ? error.message : 'Failed to parse message');
    }
  }

  private handleConnectMessage(
    ws: WS,
    tempConnectionId: string,
    message: ConnectMessage
  ): void {
    // Clean up temporary mapping
    this.wsToConnectionId.delete(ws);
    this.connectionIdToWs.delete(tempConnectionId);

    // Check for state recovery
    if (message.resumeToken) {
      const recoveryEntry = this.connectionManager.recoverState(message.resumeToken);
      if (recoveryEntry) {
        // Create connection with recovered state
        const connection = this.connectionManager.createConnection(
          recoveryEntry.threadId,
          recoveryEntry.runId
        );

        // Update mappings
        this.wsToConnectionId.set(ws, connection.id);
        this.connectionIdToWs.set(connection.id, ws);

        // Update state
        this.connectionManager.updateState(connection.id, 'connected');

        // Send recovery response
        const recoveryResponse: StateRecoveredServerMessage = {
          type: WebSocketServerMessageType.STATE_RECOVERED,
          id: uuid(),
          timestamp: Date.now(),
          state: recoveryEntry.state,
          missedEvents: recoveryEntry.events,
          newResumeToken: connection.resumeToken,
        };

        this.sendMessage(ws, connection.id, recoveryResponse);
        this.emit('recovered', { connectionId: connection.id, eventsRecovered: recoveryEntry.events.length });
        return;
      }
    }

    // Create new connection
    try {
      const connection = this.connectionManager.createConnection(
        message.threadId,
        message.runId
      );

      // Update mappings
      this.wsToConnectionId.set(ws, connection.id);
      this.connectionIdToWs.set(connection.id, ws);

      // Update state
      this.connectionManager.updateState(connection.id, 'connected');

      // Send connected response
      const connectedResponse: ConnectedServerMessage = {
        type: WebSocketServerMessageType.CONNECTED,
        id: uuid(),
        timestamp: Date.now(),
        connectionId: connection.id,
        resumeToken: connection.resumeToken,
        threadId: connection.threadId,
        runId: connection.runId,
      };

      this.sendMessage(ws, connection.id, connectedResponse);
      this.emit('connected', { connectionId: connection.id });
    } catch (error) {
      this.sendError(ws, 'CONNECTION_FAILED', error instanceof Error ? error.message : 'Failed to create connection');
      ws.close(1013, 'Connection failed');
    }
  }

  private async handleAgentRequestMessage(
    ws: WS,
    connectionId: string,
    message: AgentRequestMessage
  ): Promise<void> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection || connectionId.startsWith('pending_')) {
      this.sendError(ws, 'NOT_CONNECTED', 'Must send CONNECT message first');
      return;
    }

    if (!this.agentHandler) {
      this.sendError(ws, 'NO_HANDLER', 'No agent handler registered');
      return;
    }

    // Update state
    this.connectionManager.updateState(connectionId, 'streaming');

    // Create event emitter for AG-UI events
    const emit = (event: AGUIEvent): void => {
      if (connection.abortController.signal.aborted) {
        return;
      }

      // Add timestamp if not present
      if (!event.timestamp) {
        event.timestamp = Date.now();
      }

      // Record and wrap event
      const eventId = this.connectionManager.recordEventSent(connectionId);
      const eventMessage: EventServerMessage = {
        type: WebSocketServerMessageType.EVENT,
        id: uuid(),
        timestamp: Date.now(),
        eventId: eventId.toString(),
        event,
      };

      // Store for recovery
      this.connectionManager.storeEventForRecovery(connectionId, eventMessage);

      // Send event
      this.sendMessage(ws, connectionId, eventMessage);
    };

    // Emit RUN_STARTED
    emit({
      type: AGUIEventType.RUN_STARTED,
      threadId: connection.threadId,
      runId: connection.runId,
    });

    // Process request
    try {
      await this.agentHandler(
        message.request,
        emit,
        connection.abortController.signal
      );

      // Emit RUN_FINISHED on success
      if (!connection.abortController.signal.aborted) {
        emit({
          type: AGUIEventType.RUN_FINISHED,
          runId: connection.runId,
          outcome: 'success',
        });
      }
    } catch (error) {
      if (!connection.abortController.signal.aborted) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        emit({
          type: AGUIEventType.RUN_ERROR,
          runId: connection.runId,
          message: errorMessage,
          code: 'INTERNAL_ERROR',
        });
        this.connectionManager.recordError(connectionId);
      }
    } finally {
      // Return to connected state
      if (this.connectionManager.getConnection(connectionId)) {
        this.connectionManager.updateState(connectionId, 'connected');
      }
    }
  }

  private handleRecoverStateMessage(
    ws: WS,
    connectionId: string,
    message: RecoverStateMessage
  ): void {
    const recoveryEntry = this.connectionManager.recoverState(
      message.resumeToken,
      message.lastEventId
    );

    if (!recoveryEntry) {
      this.sendError(ws, 'RECOVERY_FAILED', 'Invalid or expired resume token');
      return;
    }

    // Get or create connection
    let connection = this.connectionManager.getConnection(connectionId);
    if (!connection || connectionId.startsWith('pending_')) {
      // Create new connection for recovered state
      try {
        connection = this.connectionManager.createConnection(
          recoveryEntry.threadId,
          recoveryEntry.runId
        );

        // Update mappings
        this.wsToConnectionId.delete(ws);
        this.wsToConnectionId.set(ws, connection.id);
        this.connectionIdToWs.set(connection.id, ws);
        this.connectionManager.updateState(connection.id, 'connected');
      } catch (error) {
        this.sendError(ws, 'CONNECTION_FAILED', error instanceof Error ? error.message : 'Failed to create connection');
        return;
      }
    }

    // Send recovered state
    const response: StateRecoveredServerMessage = {
      type: WebSocketServerMessageType.STATE_RECOVERED,
      id: uuid(),
      timestamp: Date.now(),
      state: recoveryEntry.state,
      missedEvents: recoveryEntry.events,
      newResumeToken: connection.resumeToken,
    };

    this.sendMessage(ws, connection.id, response);
  }

  private handleCancelMessage(
    ws: WS,
    connectionId: string,
    message: CancelMessage
  ): void {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) {
      this.sendError(ws, 'NOT_CONNECTED', 'Connection not found');
      return;
    }

    // Abort current operation
    connection.abortController.abort(message.reason || 'Cancelled by client');

    // Create new abort controller for future operations
    const newController = new AbortController();
    Object.assign(connection, { abortController: newController });

    // Send acknowledgment
    this.sendAck(ws, connectionId, message.id, true);
  }

  private handlePingMessage(
    ws: WS,
    connectionId: string,
    message: PingMessage
  ): void {
    // Record heartbeat
    if (!connectionId.startsWith('pending_')) {
      this.connectionManager.recordHeartbeat(connectionId);
    }

    // Send pong
    const pong: PongServerMessage = {
      type: WebSocketServerMessageType.PONG,
      id: uuid(),
      timestamp: Date.now(),
    };

    this.sendMessage(ws, connectionId, pong);
  }

  private handleClose(ws: WS, code: number, reason: string): void {
    const connectionId = this.wsToConnectionId.get(ws);
    if (!connectionId) {
      return;
    }

    // Clean up mappings
    this.wsToConnectionId.delete(ws);
    this.connectionIdToWs.delete(connectionId);

    // Close connection if not pending
    if (!connectionId.startsWith('pending_')) {
      this.connectionManager.closeConnection(connectionId, `WebSocket closed: ${code} ${reason}`);
    }

    this.emit('disconnected', { connectionId, code, reason });
  }

  private handleError(ws: WS, error: Error): void {
    const connectionId = this.wsToConnectionId.get(ws);
    if (connectionId && !connectionId.startsWith('pending_')) {
      this.connectionManager.recordError(connectionId);
    }

    this.emit('error', { connectionId, error });
  }

  // ============================================================================
  // Message Sending
  // ============================================================================

  private sendMessage(ws: WS, connectionId: string, message: WebSocketServerMessage): void {
    if (ws.readyState !== 1) { // WebSocket.OPEN = 1
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      ws.send(messageStr);
      this.connectionManager.recordMessageSent(connectionId, Buffer.byteLength(messageStr));
    } catch (error) {
      this.connectionManager.recordError(connectionId);
      this.emit('error', { connectionId, error });
    }
  }

  private sendError(ws: WS, code: string, message: string): void {
    if (ws.readyState !== 1) {
      return;
    }

    const errorMessage: ErrorServerMessage = {
      type: WebSocketServerMessageType.ERROR,
      id: uuid(),
      timestamp: Date.now(),
      code,
      message,
    };

    try {
      ws.send(JSON.stringify(errorMessage));
    } catch {
      // Ignore send errors when sending error
    }
  }

  private sendAck(ws: WS, connectionId: string, ackId: string, success: boolean, error?: string): void {
    const ack: WebSocketServerMessage = {
      type: WebSocketServerMessageType.ACK,
      id: uuid(),
      timestamp: Date.now(),
      ackId,
      success,
      error,
    };

    this.sendMessage(ws, connectionId, ack);
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private validateOrigin(origin?: string): boolean {
    if (!origin) {
      return true; // Allow requests without origin (same-origin or non-browser)
    }

    if (this.config.allowedOrigins.includes('*')) {
      return true;
    }

    return this.config.allowedOrigins.some((allowed) => {
      if (allowed.startsWith('*.')) {
        // Wildcard subdomain matching
        const domain = allowed.slice(2);
        const originHost = new URL(origin).hostname;
        return originHost === domain || originHost.endsWith(`.${domain}`);
      }
      return origin === allowed || new URL(origin).origin === allowed;
    });
  }

  private getClientIp(request: IncomingMessage): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ips.trim();
    }
    return request.socket.remoteAddress || 'unknown';
  }

  private setupConnectionManagerEvents(): void {
    // Forward heartbeat requests to send pings
    this.connectionManager.on('heartbeatRequired', ({ connectionId }) => {
      const ws = this.connectionIdToWs.get(connectionId);
      if (ws && ws.readyState === 1) {
        ws.ping();
      }
    });

    // Handle heartbeat timeout
    this.connectionManager.on('heartbeatTimeout', ({ connectionId }) => {
      const ws = this.connectionIdToWs.get(connectionId);
      if (ws) {
        ws.close(1001, 'Heartbeat timeout');
      }
    });

    // Handle connection timeout
    this.connectionManager.on('connectionTimeout', ({ connectionId }) => {
      const ws = this.connectionIdToWs.get(connectionId);
      if (ws) {
        ws.close(1001, 'Connection timeout');
      }
    });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get transport metrics
   */
  getMetrics(): WebSocketTransportMetrics {
    return this.connectionManager.getMetrics();
  }

  /**
   * Get active connections count
   */
  getActiveConnectionsCount(): number {
    return this.connectionManager.getActiveConnections().length;
  }

  /**
   * Close a specific connection
   */
  closeConnection(connectionId: string, reason?: string): void {
    const ws = this.connectionIdToWs.get(connectionId);
    if (ws) {
      ws.close(1000, reason || 'Connection closed');
    }
    this.connectionManager.closeConnection(connectionId, reason);
  }

  /**
   * Close all connections
   */
  closeAllConnections(reason?: string): void {
    for (const [connectionId, ws] of this.connectionIdToWs.entries()) {
      ws.close(1000, reason || 'Server closing');
      this.connectionManager.closeConnection(connectionId, reason);
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(event: AGUIEvent): void {
    for (const [connectionId, ws] of this.connectionIdToWs.entries()) {
      if (ws.readyState === 1) {
        const eventId = this.connectionManager.recordEventSent(connectionId);
        const eventMessage: EventServerMessage = {
          type: WebSocketServerMessageType.EVENT,
          id: uuid(),
          timestamp: Date.now(),
          eventId: eventId.toString(),
          event,
        };
        this.sendMessage(ws, connectionId, eventMessage);
      }
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

    // Close all connections
    this.closeAllConnections('Transport disposed');

    // Close WebSocket server
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }

    // Dispose connection manager
    this.connectionManager.dispose();

    // Clear maps
    this.wsToConnectionId.clear();
    this.connectionIdToWs.clear();

    this.removeAllListeners();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWebSocketTransport(config?: WebSocketTransportConfig): WebSocketTransport {
  return new WebSocketTransport(config);
}
