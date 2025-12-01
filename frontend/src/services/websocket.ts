/**
 * WebSocket Service with Auto-Reconnection
 * Phase 3 - Real-time Event Streaming
 */

import {
  WebSocketMessage,
  WebSocketMessageType,
  ConnectionStatus,
  SubscriptionFilter,
  MessageHandler,
  ConnectionHandler,
  ErrorHandler,
  WebSocketStats,
} from '../types/websocket';

const DEFAULT_URL = 'ws://localhost:8080';
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const MESSAGE_QUEUE_MAX_SIZE = 1000;
const PONG_TIMEOUT = 5000; // 5 seconds

export interface WebSocketServiceConfig {
  url?: string;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  messageQueueMaxSize?: number;
  debug?: boolean;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pongTimeoutTimer: NodeJS.Timeout | null = null;
  private messageQueueMaxSize: number;
  private debug: boolean;

  // Message queue for offline buffering
  private messageQueue: WebSocketMessage[] = [];

  // Subscription management
  private currentSubscriptions: SubscriptionFilter = {};

  // Message deduplication
  private processedMessageIds = new Set<string>();
  private maxProcessedIds = 1000;

  // Event handlers
  private messageHandlers = new Set<MessageHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private errorHandlers = new Set<ErrorHandler>();

  // Statistics
  private stats: WebSocketStats = {
    messagesSent: 0,
    messagesReceived: 0,
    reconnectAttempts: 0,
    lastConnected: null,
    lastDisconnected: null,
    uptime: 0,
    avgLatency: 0,
  };

  // Latency tracking
  private latencyMeasurements: number[] = [];
  private pingTimestamp: number | null = null;

  // Visibility change handling
  private visibilityChangeHandler: (() => void) | null = null;
  private networkChangeHandler: (() => void) | null = null;

  constructor(config: WebSocketServiceConfig = {}) {
    this.url = config.url || DEFAULT_URL;
    this.maxReconnectAttempts = config.maxReconnectAttempts || MAX_RECONNECT_ATTEMPTS;
    this.heartbeatInterval = config.heartbeatInterval || HEARTBEAT_INTERVAL;
    this.messageQueueMaxSize = config.messageQueueMaxSize || MESSAGE_QUEUE_MAX_SIZE;
    this.debug = config.debug || false;

    this.setupVisibilityHandler();
    this.setupNetworkHandler();
  }

  /**
   * Connect to WebSocket server
   */
  public connect(): void {
    if (this.ws && (this.status === ConnectionStatus.CONNECTED || this.status === ConnectionStatus.CONNECTING)) {
      this.log('Already connected or connecting');
      return;
    }

    this.updateStatus(ConnectionStatus.CONNECTING);
    this.log(`Connecting to ${this.url}...`);

    try {
      this.ws = new WebSocket(this.url);
      this.setupWebSocketHandlers();
    } catch (error) {
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    this.log('Disconnecting...');
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();
    this.clearPongTimeoutTimer();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.updateStatus(ConnectionStatus.DISCONNECTED);
  }

  /**
   * Subscribe to events with filters
   */
  public subscribe(filter: SubscriptionFilter): void {
    this.currentSubscriptions = {
      ...this.currentSubscriptions,
      agents: [...(this.currentSubscriptions.agents || []), ...(filter.agents || [])],
      event_types: [...(this.currentSubscriptions.event_types || []), ...(filter.event_types || [])],
      sessions: [...(this.currentSubscriptions.sessions || []), ...(filter.sessions || [])],
      severity: [...(this.currentSubscriptions.severity || []), ...(filter.severity || [])],
    };

    const message: WebSocketMessage = {
      type: WebSocketMessageType.SUBSCRIBE,
      payload: filter,
      timestamp: Date.now(),
    };

    this.send(message);
    this.log('Subscribed to events', filter);
  }

  /**
   * Unsubscribe from events
   */
  public unsubscribe(filter?: SubscriptionFilter): void {
    if (!filter) {
      // Unsubscribe from all
      this.currentSubscriptions = {};
    } else {
      // Remove specific filters
      if (filter.agents) {
        this.currentSubscriptions.agents = this.currentSubscriptions.agents?.filter(
          (a) => !filter.agents!.includes(a)
        );
      }
      if (filter.event_types) {
        this.currentSubscriptions.event_types = this.currentSubscriptions.event_types?.filter(
          (t) => !filter.event_types!.includes(t)
        );
      }
      if (filter.sessions) {
        this.currentSubscriptions.sessions = this.currentSubscriptions.sessions?.filter(
          (s) => !filter.sessions!.includes(s)
        );
      }
    }

    const message: WebSocketMessage = {
      type: WebSocketMessageType.UNSUBSCRIBE,
      payload: filter,
      timestamp: Date.now(),
    };

    this.send(message);
    this.log('Unsubscribed from events', filter);
  }

  /**
   * Send message to server
   */
  private send(message: WebSocketMessage): void {
    if (this.status === ConnectionStatus.CONNECTED && this.ws) {
      try {
        this.ws.send(JSON.stringify(message));
        this.stats.messagesSent++;
        this.log('Sent message', message);
      } catch (error) {
        this.handleError(new Error(`Failed to send message: ${error}`));
        this.queueMessage(message);
      }
    } else {
      this.queueMessage(message);
    }
  }

  /**
   * Queue message for later delivery
   */
  private queueMessage(message: WebSocketMessage): void {
    if (this.messageQueue.length >= this.messageQueueMaxSize) {
      // Backpressure: drop oldest messages
      this.messageQueue.shift();
      this.log('Message queue full, dropped oldest message');
    }
    this.messageQueue.push(message);
    this.log('Queued message for offline delivery');
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    this.log(`Flushing ${this.messageQueue.length} queued messages`);
    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach((message) => this.send(message));
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.log('Connected');
      this.updateStatus(ConnectionStatus.CONNECTED);
      this.reconnectAttempts = 0;
      this.reconnectDelay = INITIAL_RECONNECT_DELAY;
      this.stats.lastConnected = Date.now();

      this.startHeartbeat();
      this.flushMessageQueue();

      // Re-subscribe to previous subscriptions
      if (Object.keys(this.currentSubscriptions).length > 0) {
        this.subscribe(this.currentSubscriptions);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        this.handleError(new Error(`Failed to parse message: ${error}`));
      }
    };

    this.ws.onerror = (error) => {
      this.log('WebSocket error', error);
      this.handleConnectionError(new Error('WebSocket error'));
    };

    this.ws.onclose = (event) => {
      this.log(`Disconnected: ${event.code} - ${event.reason}`);
      this.stats.lastDisconnected = Date.now();
      this.clearHeartbeatTimer();
      this.clearPongTimeoutTimer();

      if (event.code !== 1000) {
        // Abnormal closure, attempt reconnection
        this.attemptReconnect();
      } else {
        this.updateStatus(ConnectionStatus.DISCONNECTED);
      }
    };
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: WebSocketMessage): void {
    this.stats.messagesReceived++;

    // Message deduplication
    if (message.id && this.processedMessageIds.has(message.id)) {
      this.log('Duplicate message detected, ignoring', message.id);
      return;
    }

    if (message.id) {
      this.processedMessageIds.add(message.id);
      if (this.processedMessageIds.size > this.maxProcessedIds) {
        // Remove oldest entries
        const iterator = this.processedMessageIds.values();
        for (let i = 0; i < 100; i++) {
          const value = iterator.next().value;
          if (value) this.processedMessageIds.delete(value);
        }
      }
    }

    // Handle specific message types
    switch (message.type) {
      case WebSocketMessageType.PONG:
        this.handlePong();
        break;

      case WebSocketMessageType.ERROR:
        this.handleError(new Error(message.payload?.message || 'Server error'));
        break;

      case WebSocketMessageType.SUBSCRIBED:
        this.log('Subscription confirmed', message.payload);
        break;

      case WebSocketMessageType.UNSUBSCRIBED:
        this.log('Unsubscription confirmed', message.payload);
        break;

      case WebSocketMessageType.EVENT:
        this.log('Received event', message.payload);
        break;
    }

    // Broadcast to all message handlers
    this.messageHandlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        this.log('Message handler error', error);
      }
    });
  }

  /**
   * Handle pong response
   */
  private handlePong(): void {
    this.clearPongTimeoutTimer();

    if (this.pingTimestamp) {
      const latency = Date.now() - this.pingTimestamp;
      this.latencyMeasurements.push(latency);

      // Keep only last 100 measurements
      if (this.latencyMeasurements.length > 100) {
        this.latencyMeasurements.shift();
      }

      this.stats.avgLatency =
        this.latencyMeasurements.reduce((a, b) => a + b, 0) / this.latencyMeasurements.length;

      this.log(`Pong received, latency: ${latency}ms, avg: ${this.stats.avgLatency.toFixed(2)}ms`);
      this.pingTimestamp = null;
    }
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.clearHeartbeatTimer();

    this.heartbeatTimer = setInterval(() => {
      if (this.status === ConnectionStatus.CONNECTED) {
        this.pingTimestamp = Date.now();
        this.send({
          type: WebSocketMessageType.PING,
          timestamp: Date.now(),
        });

        // Set pong timeout
        this.pongTimeoutTimer = setTimeout(() => {
          this.log('Pong timeout, connection may be dead');
          this.disconnect();
          this.attemptReconnect();
        }, PONG_TIMEOUT);
      }
    }, this.heartbeatInterval);
  }

  /**
   * Clear heartbeat timer
   */
  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Clear pong timeout timer
   */
  private clearPongTimeoutTimer(): void {
    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('Max reconnect attempts reached, giving up');
      this.updateStatus(ConnectionStatus.ERROR);
      this.handleError(new Error('Max reconnect attempts reached'));
      return;
    }

    this.updateStatus(ConnectionStatus.RECONNECTING);
    this.reconnectAttempts++;
    this.stats.reconnectAttempts++;

    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY
    );

    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.connect();
    }, delay);
  }

  /**
   * Clear reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Handle connection error
   */
  private handleConnectionError(error: Error): void {
    this.log('Connection error', error);
    this.updateStatus(ConnectionStatus.ERROR);
    this.handleError(error);
    this.attemptReconnect();
  }

  /**
   * Handle error
   */
  private handleError(error: Error): void {
    this.errorHandlers.forEach((handler) => {
      try {
        handler(error);
      } catch (err) {
        this.log('Error handler failed', err);
      }
    });
  }

  /**
   * Update connection status
   */
  private updateStatus(status: ConnectionStatus): void {
    if (this.status === status) return;

    this.log(`Status changed: ${this.status} -> ${status}`);
    this.status = status;

    this.connectionHandlers.forEach((handler) => {
      try {
        handler(status);
      } catch (error) {
        this.log('Connection handler error', error);
      }
    });
  }

  /**
   * Setup visibility change handler (pause/resume on tab visibility)
   */
  private setupVisibilityHandler(): void {
    if (typeof document === 'undefined') return;

    this.visibilityChangeHandler = () => {
      if (document.hidden) {
        this.log('Tab hidden, pausing heartbeat');
        this.clearHeartbeatTimer();
      } else {
        this.log('Tab visible, resuming heartbeat');
        if (this.status === ConnectionStatus.CONNECTED) {
          this.startHeartbeat();
        } else if (this.status === ConnectionStatus.DISCONNECTED) {
          this.connect();
        }
      }
    };

    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  /**
   * Setup network change handler (reconnect on online)
   */
  private setupNetworkHandler(): void {
    if (typeof window === 'undefined') return;

    this.networkChangeHandler = () => {
      if (navigator.onLine) {
        this.log('Network online, attempting reconnect');
        if (this.status !== ConnectionStatus.CONNECTED) {
          this.connect();
        }
      } else {
        this.log('Network offline');
        this.disconnect();
      }
    };

    window.addEventListener('online', this.networkChangeHandler);
    window.addEventListener('offline', this.networkChangeHandler);
  }

  /**
   * Cleanup event listeners
   */
  private cleanup(): void {
    if (this.visibilityChangeHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    }

    if (this.networkChangeHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', this.networkChangeHandler);
      window.removeEventListener('offline', this.networkChangeHandler);
    }
  }

  /**
   * Register message handler
   */
  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Register connection status handler
   */
  public onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  /**
   * Register error handler
   */
  public onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Get current connection status
   */
  public getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Get statistics
   */
  public getStats(): WebSocketStats {
    return {
      ...this.stats,
      uptime: this.stats.lastConnected
        ? Date.now() - this.stats.lastConnected
        : 0,
    };
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED;
  }

  /**
   * Destroy service and cleanup
   */
  public destroy(): void {
    this.log('Destroying WebSocket service');
    this.disconnect();
    this.cleanup();
    this.messageHandlers.clear();
    this.connectionHandlers.clear();
    this.errorHandlers.clear();
    this.messageQueue = [];
    this.processedMessageIds.clear();
  }

  /**
   * Debug logging
   */
  private log(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[WebSocket] ${message}`, ...args);
    }
  }
}

/**
 * Factory function to create a WebSocket service instance
 */
export function createWebSocketService(config?: WebSocketServiceConfig): WebSocketService {
  return new WebSocketService(config);
}
