/**
 * WebSocket Client Service
 * Handles real-time event streaming with reconnection logic
 */

import type {
  WebSocketMessage,
  EventMessage,
  ReasoningMessage,
  MetricsMessage,
  HeartbeatMessage,
  ClientMessage,
  SubscriptionOptions,
} from '../types/api';

// ============================================================================
// Configuration
// ============================================================================

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8080';
const RECONNECT_INTERVAL = 3000; // 3 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_TIMEOUT = 35000; // 35 seconds (server sends every 30s)

// ============================================================================
// Event Types
// ============================================================================

type MessageHandler = (message: WebSocketMessage) => void;
type ConnectionHandler = () => void;
type ErrorHandler = (error: Event | Error) => void;

interface WebSocketClientOptions {
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  subscriptionOptions?: SubscriptionOptions;
}

// ============================================================================
// WebSocket Client Class
// ============================================================================

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private options: Required<WebSocketClientOptions>;
  private reconnectAttempts = 0;
  private reconnectTimeout: number | null = null;
  private heartbeatTimeout: number | null = null;
  private isIntentionallyClosed = false;

  // Event handlers
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private disconnectionHandlers: Set<ConnectionHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();

  constructor(baseUrl: string = WS_BASE_URL, options: WebSocketClientOptions = {}) {
    this.url = baseUrl;
    this.options = {
      autoReconnect: options.autoReconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? MAX_RECONNECT_ATTEMPTS,
      reconnectInterval: options.reconnectInterval ?? RECONNECT_INTERVAL,
      subscriptionOptions: options.subscriptionOptions ?? {},
    };
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      console.warn('[WebSocket] Already connected or connecting');
      return;
    }

    this.isIntentionallyClosed = false;

    try {
      // Build URL with subscription options
      const url = this.buildUrl(this.url, this.options.subscriptionOptions);
      this.ws = new WebSocket(url);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);

      console.log('[WebSocket] Connecting to:', url);
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.handleError(error as Error);
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    this.clearReconnectTimeout();
    this.clearHeartbeatTimeout();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }

    console.log('[WebSocket] Disconnected');
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ==========================================================================
  // Message Sending
  // ==========================================================================

  /**
   * Send message to server
   */
  send(message: ClientMessage): void {
    if (!this.isConnected()) {
      console.error('[WebSocket] Cannot send message: not connected');
      return;
    }

    try {
      this.ws!.send(JSON.stringify(message));
    } catch (error) {
      console.error('[WebSocket] Failed to send message:', error);
    }
  }

  /**
   * Subscribe to specific events
   */
  subscribe(options: SubscriptionOptions): void {
    this.send({
      type: 'subscribe',
      options,
    });
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(): void {
    this.send({
      type: 'unsubscribe',
    });
  }

  /**
   * Send ping to check connection
   */
  ping(): void {
    this.send({
      type: 'ping',
    });
  }

  // ==========================================================================
  // Event Handlers Registration
  // ==========================================================================

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectionHandlers.add(handler);
    return () => this.disconnectionHandlers.delete(handler);
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  // ==========================================================================
  // Internal Event Handlers
  // ==========================================================================

  private handleOpen(): void {
    console.log('[WebSocket] Connected');
    this.reconnectAttempts = 0;
    this.startHeartbeat();

    this.connectionHandlers.forEach((handler) => handler());
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as WebSocketMessage;

      // Reset heartbeat timeout on any message
      this.resetHeartbeat();

      // Handle heartbeat
      if (message.type === 'heartbeat') {
        console.debug('[WebSocket] Heartbeat received');
        return;
      }

      // Notify all message handlers
      this.messageHandlers.forEach((handler) => handler(message));
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  private handleError(error: Event | Error): void {
    console.error('[WebSocket] Error:', error);
    this.errorHandlers.forEach((handler) => handler(error));
  }

  private handleClose(event: CloseEvent): void {
    console.log('[WebSocket] Closed:', event.code, event.reason);
    this.clearHeartbeatTimeout();

    this.disconnectionHandlers.forEach((handler) => handler());

    // Attempt reconnection if not intentionally closed
    if (!this.isIntentionallyClosed && this.options.autoReconnect) {
      this.attemptReconnect();
    }
  }

  // ==========================================================================
  // Reconnection Logic
  // ==========================================================================

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `[WebSocket] Reconnecting (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})...`
    );

    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
    }, this.options.reconnectInterval);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // ==========================================================================
  // Heartbeat Management
  // ==========================================================================

  private startHeartbeat(): void {
    this.resetHeartbeat();
  }

  private resetHeartbeat(): void {
    this.clearHeartbeatTimeout();

    this.heartbeatTimeout = window.setTimeout(() => {
      console.warn('[WebSocket] Heartbeat timeout - connection may be dead');
      this.ws?.close();
    }, HEARTBEAT_TIMEOUT);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private buildUrl(baseUrl: string, options: SubscriptionOptions): string {
    const params = new URLSearchParams();

    if (options.session_id) params.append('session_id', options.session_id);
    if (options.agent_id) params.append('agent_id', options.agent_id);
    if (options.event_types) params.append('event_types', options.event_types.join(','));
    if (options.since) params.append('since', options.since);

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }
}

// ============================================================================
// Typed Message Handlers
// ============================================================================

export function isEventMessage(message: WebSocketMessage): message is EventMessage {
  return message.type === 'event';
}

export function isReasoningMessage(message: WebSocketMessage): message is ReasoningMessage {
  return message.type === 'reasoning';
}

export function isMetricsMessage(message: WebSocketMessage): message is MetricsMessage {
  return message.type === 'metrics';
}

export function isHeartbeatMessage(message: WebSocketMessage): message is HeartbeatMessage {
  return message.type === 'heartbeat';
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const wsClient = new WebSocketClient();
