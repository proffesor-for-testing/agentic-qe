/**
 * @fileoverview WebSocket server for real-time event streaming
 * @module visualization/api/WebSocketServer
 */

import { EventEmitter } from 'events';
import { EventStore } from '../../persistence/event-store';
import { ReasoningStore } from '../../persistence/reasoning-store';
import { DataTransformer } from '../core/DataTransformer';
import { RealtimeEventMessage, SubscriptionOptions } from '../types';
import * as http from 'http';
import { WebSocket, WebSocketServer as WSServer } from 'ws';

/**
 * WebSocket client connection
 */
interface WebSocketClient {
  id: string;
  socket: WebSocket;
  subscriptions: SubscriptionOptions;
  lastHeartbeat: number;
}

/**
 * WebSocket server configuration
 */
export interface WebSocketServerConfig {
  /** HTTP server to attach to */
  server?: http.Server;
  /** Port to listen on (if no server provided) */
  port?: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
  /** Client timeout in milliseconds */
  clientTimeout?: number;
  /** Maximum backlog size per client */
  maxBacklogSize?: number;
  /** Enable message compression */
  compression?: boolean;
}

/**
 * WebSocket server for real-time visualization event streaming
 *
 * Features:
 * - Real-time event streaming with <500ms latency
 * - Client subscription management with filtering
 * - Backpressure handling for high-throughput scenarios
 * - Automatic heartbeat and connection management
 * - Message types: event, reasoning, metrics, heartbeat
 *
 * @example
 * ```typescript
 * const wsServer = new WebSocketServer(eventStore, reasoningStore, {
 *   port: 8080,
 *   heartbeatInterval: 30000,
 *   maxBacklogSize: 1000
 * });
 *
 * await wsServer.start();
 *
 * // Broadcast event to subscribed clients
 * wsServer.broadcastEvent({
 *   type: 'event',
 *   timestamp: new Date().toISOString(),
 *   data: { agent_id: 'test-gen', event_type: 'test_generated' }
 * });
 * ```
 */
export class WebSocketServer extends EventEmitter {
  private clients: Map<string, WebSocketClient>;
  private eventStore: EventStore;
  private reasoningStore: ReasoningStore;
  private transformer: DataTransformer;
  private config: Required<WebSocketServerConfig>;
  private heartbeatTimer?: NodeJS.Timeout;
  private isRunning: boolean;
  private messageQueue: Map<string, RealtimeEventMessage[]>;
  private wss?: WSServer;
  private httpServer?: http.Server;

  /**
   * Default configuration
   */
  private static readonly DEFAULT_CONFIG: Required<WebSocketServerConfig> = {
    server: undefined as unknown as http.Server,
    port: 8080,
    heartbeatInterval: 30000, // 30 seconds
    clientTimeout: 60000, // 60 seconds
    maxBacklogSize: 1000,
    compression: true,
  };

  constructor(
    eventStore: EventStore,
    reasoningStore: ReasoningStore,
    config: WebSocketServerConfig = {}
  ) {
    super();
    this.eventStore = eventStore;
    this.reasoningStore = reasoningStore;
    this.transformer = new DataTransformer(eventStore, reasoningStore);
    this.config = { ...WebSocketServer.DEFAULT_CONFIG, ...config };
    this.clients = new Map();
    this.messageQueue = new Map();
    this.isRunning = false;
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('WebSocket server is already running');
    }

    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server if not provided
        this.httpServer = this.config.server || http.createServer();

        // Create WebSocket server
        this.wss = new WSServer({
          server: this.httpServer,
          perMessageDeflate: this.config.compression,
        });

        // Handle WebSocket connections
        this.wss.on('connection', (socket: WebSocket, req: http.IncomingMessage) => {
          this.handleConnection(socket, req);
        });

        // Handle WebSocket server errors
        this.wss.on('error', (error: Error) => {
          this.emit('error', { error: error.message, source: 'wss' });
        });

        // Start HTTP server if we created it
        if (!this.config.server) {
          this.httpServer.listen(this.config.port, () => {
            console.log(`WebSocket server listening on port ${this.config.port}`);
            this.startHeartbeat();
            this.isRunning = true;
            this.emit('started', { port: this.config.port });
            resolve();
          });

          this.httpServer.on('error', (error: Error) => {
            this.emit('error', { error: error.message, source: 'http' });
            reject(error);
          });
        } else {
          // Server already listening, just start heartbeat
          this.startHeartbeat();
          this.isRunning = true;
          this.emit('started', { port: this.config.port });
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.stopHeartbeat();

    // Close all client connections
    for (const client of this.clients.values()) {
      this.disconnectClient(client.id, 'Server shutting down');
    }

    // Close WebSocket server
    return new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          // Close HTTP server if we created it
          if (this.httpServer && !this.config.server) {
            this.httpServer.close(() => {
              this.isRunning = false;
              this.emit('stopped');
              resolve();
            });
          } else {
            this.isRunning = false;
            this.emit('stopped');
            resolve();
          }
        });
      } else {
        this.isRunning = false;
        this.emit('stopped');
        resolve();
      }
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: WebSocket, request: http.IncomingMessage): void {
    const clientId = this.generateClientId();
    const client: WebSocketClient = {
      id: clientId,
      socket,
      subscriptions: this.parseSubscriptionOptions(request.url),
      lastHeartbeat: Date.now(),
    };

    this.clients.set(clientId, client);
    this.messageQueue.set(clientId, []);

    // Setup WebSocket event handlers
    socket.on('message', (data: Buffer) => {
      try {
        this.handleMessage(clientId, data);
      } catch (error) {
        this.emit('error', { clientId, error, source: 'message_handler' });
      }
    });

    socket.on('close', () => {
      this.handleDisconnect(clientId);
    });

    socket.on('error', (error: Error) => {
      this.handleError(clientId, error);
    });

    socket.on('pong', () => {
      this.handlePong(clientId);
    });

    this.emit('client_connected', { clientId, subscriptions: client.subscriptions });

    // Send initial data based on subscriptions
    this.sendInitialData(client);
  }

  /**
   * Send initial data to newly connected client
   */
  private sendInitialData(client: WebSocketClient): void {
    const { session_id, agent_id, since } = client.subscriptions;

    // Send recent events
    if (session_id) {
      const events = this.eventStore.getEventsBySession(session_id);
      const filteredEvents = since
        ? events.filter(e => e.timestamp >= since)
        : events.slice(-50); // Last 50 events

      for (const event of filteredEvents) {
        this.sendMessage(client.id, {
          type: 'event',
          timestamp: event.timestamp,
          data: event,
        });
      }
    }

    // Send reasoning chains
    if (session_id) {
      const chains = this.reasoningStore.getChainsBySession(session_id, { limit: 10 });
      for (const chain of chains) {
        const tree = this.transformer.buildReasoningTree(chain.id);
        if (tree) {
          this.sendMessage(client.id, {
            type: 'reasoning',
            timestamp: chain.created_at,
            data: tree,
          });
        }
      }
    }
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(clientId: string, data: Buffer | string): void {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'subscribe') {
        this.updateSubscription(clientId, message.options);
      } else if (message.type === 'unsubscribe') {
        this.removeSubscription(clientId);
      } else if (message.type === 'ping') {
        this.sendMessage(clientId, {
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
          data: { status: 'pong' },
        });
      }
    } catch (error) {
      this.emit('error', { clientId, error });
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnect(clientId: string): void {
    this.disconnectClient(clientId, 'Client disconnected');
  }

  /**
   * Handle client error
   */
  private handleError(clientId: string, error: Error): void {
    this.emit('error', { clientId, error });
    this.disconnectClient(clientId, `Error: ${error.message}`);
  }

  /**
   * Handle pong response (heartbeat)
   */
  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = Date.now();
    }
  }

  /**
   * Disconnect a client
   */
  private disconnectClient(clientId: string, reason: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      // Close the WebSocket connection
      if (client.socket.readyState === WebSocket.OPEN || client.socket.readyState === WebSocket.CONNECTING) {
        client.socket.close(1000, reason);
      }
    } catch (error) {
      this.emit('error', { clientId, error, source: 'disconnect' });
    }

    this.clients.delete(clientId);
    this.messageQueue.delete(clientId);
    this.emit('client_disconnected', { clientId, reason });
  }

  /**
   * Update client subscription
   */
  private updateSubscription(clientId: string, options: SubscriptionOptions): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions = { ...client.subscriptions, ...options };
    this.emit('subscription_updated', { clientId, subscriptions: client.subscriptions });
  }

  /**
   * Remove client subscription
   */
  private removeSubscription(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions = {};
    this.emit('subscription_removed', { clientId });
  }

  /**
   * Broadcast event to all subscribed clients
   * @param message - Event message to broadcast
   */
  broadcastEvent(message: RealtimeEventMessage): void {
    const startTime = Date.now();

    for (const client of this.clients.values()) {
      if (this.shouldSendToClient(client, message)) {
        this.sendMessage(client.id, message);
      }
    }

    const latency = Date.now() - startTime;
    this.emit('broadcast_complete', { latency, clientCount: this.clients.size });

    // Emit warning if latency exceeds 500ms threshold
    if (latency > 500) {
      this.emit('latency_warning', { latency, threshold: 500 });
    }
  }

  /**
   * Send message to specific client with backpressure handling
   */
  private sendMessage(clientId: string, message: RealtimeEventMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const queue = this.messageQueue.get(clientId)!;

    // Check backlog size
    if (queue.length >= this.config.maxBacklogSize) {
      // Drop oldest message (FIFO)
      queue.shift();
      this.emit('backpressure', { clientId, queueSize: queue.length });
    }

    queue.push(message);

    // Attempt to flush queue
    this.flushMessageQueue(clientId);
  }

  /**
   * Flush message queue for a client
   */
  private flushMessageQueue(clientId: string): void {
    const client = this.clients.get(clientId);
    const queue = this.messageQueue.get(clientId);
    if (!client || !queue) return;

    while (queue.length > 0) {
      const message = queue[0];

      // Check if socket is open
      if (client.socket.readyState !== WebSocket.OPEN) {
        break;
      }

      // Check for backpressure (buffered data)
      if (client.socket.bufferedAmount > 0) {
        // Socket buffer is full, wait for next flush
        break;
      }

      // Send message
      try {
        client.socket.send(JSON.stringify(message));
        queue.shift();
      } catch (error) {
        this.emit('send_error', { clientId, error });
        break;
      }
    }
  }

  /**
   * Check if message should be sent to client based on subscriptions
   */
  private shouldSendToClient(client: WebSocketClient, message: RealtimeEventMessage): boolean {
    const { session_id, agent_id, event_types, since } = client.subscriptions;

    // Check timestamp filter
    if (since && message.timestamp < since) {
      return false;
    }

    // Check event-specific filters
    if (message.type === 'event') {
      const eventData = message.data as {
        session_id?: string;
        agent_id?: string;
        event_type?: string;
      };

      if (session_id && eventData.session_id !== session_id) {
        return false;
      }
      if (agent_id && eventData.agent_id !== agent_id) {
        return false;
      }
      if (event_types && eventData.event_type && !event_types.includes(eventData.event_type)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const client of this.clients.values()) {
        // Check for timeout
        if (now - client.lastHeartbeat > this.config.clientTimeout) {
          this.disconnectClient(client.id, 'Heartbeat timeout');
          continue;
        }

        // Send WebSocket ping frame
        try {
          if (client.socket.readyState === WebSocket.OPEN) {
            client.socket.ping();
          }
        } catch (error) {
          this.emit('error', { clientId: client.id, error, source: 'ping' });
        }

        // Send heartbeat message
        this.sendMessage(client.id, {
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
          data: {
            connected_clients: this.clients.size,
            uptime_ms: now - (client.lastHeartbeat - this.config.heartbeatInterval),
          },
        });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Parse subscription options from URL query parameters
   */
  private parseSubscriptionOptions(url?: string): SubscriptionOptions {
    if (!url) return {};

    const urlObj = new URL(url, 'http://localhost');
    const params = urlObj.searchParams;

    return {
      session_id: params.get('session_id') || undefined,
      agent_id: params.get('agent_id') || undefined,
      event_types: params.get('event_types')?.split(','),
      since: params.get('since') || undefined,
    };
  }

  /**
   * Get server statistics
   */
  getStatistics(): {
    isRunning: boolean;
    connectedClients: number;
    totalMessagesSent: number;
    averageQueueSize: number;
  } {
    let totalQueueSize = 0;
    for (const queue of this.messageQueue.values()) {
      totalQueueSize += queue.length;
    }

    return {
      isRunning: this.isRunning,
      connectedClients: this.clients.size,
      totalMessagesSent: 0, // Would track in real implementation
      averageQueueSize: this.clients.size > 0 ? totalQueueSize / this.clients.size : 0,
    };
  }

  /**
   * Get connected clients
   */
  getConnectedClients(): Array<{ id: string; subscriptions: SubscriptionOptions }> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      subscriptions: client.subscriptions,
    }));
  }
}
