/**
 * Agent Channel for High-Level Agent-to-Agent Communication
 *
 * Provides a high-level API for agent-to-agent communication including
 * request/response patterns with correlation IDs, event subscription/publication,
 * typed message handlers, channel lifecycle management, and metrics collection.
 *
 * @module edge/p2p/protocol/AgentChannel
 * @version 1.0.0
 */

import type { KeyPair, AgentIdentity } from '../crypto';
import type { PeerConnectionManager } from '../webrtc';
import type {
  ProtocolEnvelope,
  ChannelConfig,
  ChannelStats,
  RequestPayload,
  ResponsePayload,
  EventPayload,
  MessageHandler,
  EventHandler,
  ErrorHandler,
  StateChangeHandler,
  ProtocolStateTransition,
} from './types';
import {
  ProtocolState,
  ProtocolError,
  ProtocolErrorCode,
  MessageType,
  MessagePriority,
  ProtocolFeature,
  CloseCode,
  DEFAULT_REQUEST_TIMEOUT,
  generateMessageId,
} from './types';
import { MessageEncoder } from './MessageEncoder';
import { MessageRouter, type RoutablePeer, RouterEventType, type RouterEvent } from './MessageRouter';
import { ProtocolHandler, type ProtocolHandlerConfig, ProtocolEventType, type ProtocolEvent } from './ProtocolHandler';

// ============================================
// Types
// ============================================

/**
 * Pending request tracking
 */
interface PendingRequest<T = unknown> {
  correlationId: string;
  method: string;
  sentAt: number;
  timeout: number;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Event subscription
 */
interface EventSubscription {
  event: string;
  handler: EventHandler<unknown>;
  once: boolean;
}

/**
 * Channel options for creation
 */
export interface AgentChannelOptions {
  /** Local agent identity */
  localIdentity: AgentIdentity;
  /** Local key pair for signing */
  localKeyPair: KeyPair;
  /** Remote agent ID to connect to */
  remoteAgentId: string;
  /** Peer connection manager for WebRTC transport */
  connectionManager?: PeerConnectionManager;
  /** Channel configuration */
  config?: Partial<ChannelConfig>;
}

/**
 * Channel event types
 */
export enum ChannelEventType {
  OPENED = 'opened',
  CLOSED = 'closed',
  ERROR = 'error',
  RECONNECTING = 'reconnecting',
  RECONNECTED = 'reconnected',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_SENT = 'message_sent',
  STATE_CHANGED = 'state_changed',
}

/**
 * Channel event
 */
export interface ChannelEvent {
  type: ChannelEventType;
  timestamp: number;
  details?: unknown;
}

/**
 * Channel event handler
 */
export type ChannelEventHandler = (event: ChannelEvent) => void;

// ============================================
// AgentChannel Class
// ============================================

/**
 * High-level agent-to-agent communication channel
 *
 * @example
 * ```typescript
 * const channel = new AgentChannel({
 *   localIdentity: myIdentity,
 *   localKeyPair: myKeyPair,
 *   remoteAgentId: 'remote-agent-id',
 *   connectionManager: peerManager,
 * });
 *
 * // Open channel
 * await channel.open();
 *
 * // Register request handler
 * channel.onRequest('get-data', async (params) => {
 *   return { data: 'response' };
 * });
 *
 * // Send request
 * const result = await channel.request('process-task', { taskId: '123' });
 *
 * // Subscribe to events
 * channel.subscribe('task-completed', (data) => {
 *   console.log('Task completed:', data);
 * });
 *
 * // Publish event
 * await channel.publish('status-update', { status: 'active' });
 *
 * // Close channel
 * await channel.close();
 * ```
 */
export class AgentChannel {
  private localIdentity: AgentIdentity;
  private localKeyPair: KeyPair;
  private remoteAgentId: string;
  private connectionManager?: PeerConnectionManager;
  private config: ChannelConfig;

  // Protocol components
  private protocolHandler: ProtocolHandler;
  private encoder: MessageEncoder;
  private router: MessageRouter;

  // State
  private isOpen = false;
  private isClosing = false;
  private reconnectAttempts = 0;
  private openedAt: number | null = null;

  // Request/Response tracking
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestHandlers: Map<string, MessageHandler> = new Map();

  // Event subscriptions
  private eventSubscriptions: EventSubscription[] = [];

  // Event handlers
  private channelEventHandlers: ChannelEventHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private stateChangeHandlers: StateChangeHandler[] = [];

  // Stats
  private stats: ChannelStats;

  // Reconnection
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AgentChannelOptions) {
    this.localIdentity = options.localIdentity;
    this.localKeyPair = options.localKeyPair;
    this.remoteAgentId = options.remoteAgentId;
    this.connectionManager = options.connectionManager;

    this.config = {
      localAgentId: options.localIdentity.agentId,
      remoteAgentId: options.remoteAgentId,
      protocolVersion: options.config?.protocolVersion,
      features: options.config?.features ?? [
        ProtocolFeature.COMPRESSION,
        ProtocolFeature.REQUEST_RESPONSE,
        ProtocolFeature.PUB_SUB,
        ProtocolFeature.RELIABLE_DELIVERY,
      ],
      rateLimit: options.config?.rateLimit,
      queue: options.config?.queue,
      requestTimeout: options.config?.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT,
      heartbeatInterval: options.config?.heartbeatInterval,
      autoReconnect: options.config?.autoReconnect ?? true,
      maxReconnectAttempts: options.config?.maxReconnectAttempts ?? 5,
    };

    // Initialize protocol handler
    this.protocolHandler = new ProtocolHandler({
      identity: this.localIdentity,
      keyPair: this.localKeyPair,
      features: this.config.features,
      heartbeatInterval: this.config.heartbeatInterval,
      rateLimit: this.config.rateLimit,
    });

    // Initialize encoder
    this.encoder = new MessageEncoder();

    // Initialize router
    this.router = new MessageRouter({
      queue: this.config.queue,
      enableRetry: true,
      enableDeadLetter: true,
    });

    // Initialize stats
    this.stats = this.createInitialStats();

    // Setup event forwarding
    this.setupEventForwarding();
  }

  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Open the channel and establish connection
   */
  async open(): Promise<void> {
    if (this.isOpen) {
      throw new ProtocolError('Channel already open', ProtocolErrorCode.INVALID_STATE);
    }

    if (this.isClosing) {
      throw new ProtocolError('Channel is closing', ProtocolErrorCode.INVALID_STATE);
    }

    try {
      // Register with router
      this.registerWithRouter();

      // Create handshake
      const handshakeEnvelope = await this.protocolHandler.createHandshake();

      // Encode and send handshake
      await this.sendEnvelope(handshakeEnvelope);

      // Wait for handshake acknowledgment (handled in message processing)
      // For now, mark as open after handshake is sent
      // In production, this should wait for HANDSHAKE_ACK

      this.isOpen = true;
      this.openedAt = Date.now();
      this.stats.openedAt = this.openedAt;

      this.emitChannelEvent({
        type: ChannelEventType.OPENED,
        timestamp: Date.now(),
        details: { remoteAgentId: this.remoteAgentId },
      });
    } catch (error) {
      this.handleError(
        error instanceof ProtocolError
          ? error
          : new ProtocolError(
              error instanceof Error ? error.message : 'Failed to open channel',
              ProtocolErrorCode.PROTOCOL_ERROR
            )
      );
      throw error;
    }
  }

  /**
   * Close the channel gracefully
   */
  async close(reason: string = 'Channel closed'): Promise<void> {
    if (!this.isOpen || this.isClosing) return;

    this.isClosing = true;

    try {
      // Create and send close message
      const closeEnvelope = await this.protocolHandler.createClose(
        CloseCode.NORMAL,
        reason,
        false
      );
      await this.sendEnvelope(closeEnvelope);
    } catch {
      // Ignore send errors during close
    }

    this.cleanup();

    this.isOpen = false;
    this.isClosing = false;

    this.emitChannelEvent({
      type: ChannelEventType.CLOSED,
      timestamp: Date.now(),
      details: { reason },
    });
  }

  /**
   * Check if channel is open
   */
  isChannelOpen(): boolean {
    return this.isOpen && !this.isClosing;
  }

  /**
   * Get channel state
   */
  getState(): ProtocolState {
    return this.protocolHandler.getState();
  }

  // ============================================
  // Request/Response Pattern
  // ============================================

  /**
   * Send a request and wait for response
   *
   * @param method - Method name to call
   * @param params - Request parameters
   * @param timeout - Optional timeout override
   * @returns Promise resolving to response data
   */
  async request<T = unknown, R = unknown>(
    method: string,
    params: T,
    timeout?: number
  ): Promise<R> {
    if (!this.isChannelOpen()) {
      throw new ProtocolError('Channel not open', ProtocolErrorCode.INVALID_STATE);
    }

    const correlationId = generateMessageId();
    const requestTimeout = timeout ?? this.config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;

    return new Promise<R>((resolve, reject) => {
      // Create timeout
      const timer = setTimeout(() => {
        const pending = this.pendingRequests.get(correlationId);
        if (pending) {
          this.pendingRequests.delete(correlationId);
          reject(new ProtocolError(`Request timed out: ${method}`, ProtocolErrorCode.TIMEOUT));
        }
      }, requestTimeout);

      // Track pending request
      const pending: PendingRequest<R> = {
        correlationId,
        method,
        sentAt: Date.now(),
        timeout: requestTimeout,
        resolve: resolve as (result: R) => void,
        reject,
        timer,
      };
      this.pendingRequests.set(correlationId, pending as PendingRequest);

      // Send request
      this.sendRequest(method, params, correlationId).catch((error) => {
        this.pendingRequests.delete(correlationId);
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * Register a request handler
   */
  onRequest<T = unknown, R = unknown>(method: string, handler: MessageHandler<T, R>): void {
    this.requestHandlers.set(method, handler as MessageHandler);
  }

  /**
   * Remove a request handler
   */
  offRequest(method: string): void {
    this.requestHandlers.delete(method);
  }

  /**
   * Send a request (internal)
   */
  private async sendRequest<T>(
    method: string,
    params: T,
    correlationId: string
  ): Promise<void> {
    const envelope = await this.protocolHandler.createRequest(
      method,
      params,
      this.remoteAgentId,
      this.config.requestTimeout
    );

    // Override correlation ID
    envelope.header.correlationId = correlationId;

    await this.sendEnvelope(envelope);
    this.stats.requestsSent++;
  }

  /**
   * Handle incoming request
   */
  private async handleRequest(envelope: ProtocolEnvelope<RequestPayload>): Promise<void> {
    const { method, params } = envelope.payload;
    const correlationId = envelope.header.messageId;

    const handler = this.requestHandlers.get(method);
    if (!handler) {
      // Send error response
      const errorEnvelope = await this.protocolHandler.createErrorResponse(
        correlationId,
        new ProtocolError(`Unknown method: ${method}`, ProtocolErrorCode.INVALID_MESSAGE),
        envelope.header.senderId
      );
      await this.sendEnvelope(errorEnvelope);
      return;
    }

    try {
      const result = await handler(params, envelope);
      const responseEnvelope = await this.protocolHandler.createResponse(
        correlationId,
        result,
        envelope.header.senderId
      );
      await this.sendEnvelope(responseEnvelope);
    } catch (error) {
      const protocolError =
        error instanceof ProtocolError
          ? error
          : new ProtocolError(
              error instanceof Error ? error.message : 'Request handler failed',
              ProtocolErrorCode.PROTOCOL_ERROR
            );

      const errorEnvelope = await this.protocolHandler.createErrorResponse(
        correlationId,
        protocolError,
        envelope.header.senderId
      );
      await this.sendEnvelope(errorEnvelope);
    }
  }

  /**
   * Handle incoming response
   */
  private handleResponse(envelope: ProtocolEnvelope<ResponsePayload>): void {
    const correlationId = envelope.header.correlationId;
    if (!correlationId) return;

    const pending = this.pendingRequests.get(correlationId);
    if (!pending) return;

    this.pendingRequests.delete(correlationId);
    clearTimeout(pending.timer);

    // Update latency stats
    const latency = Date.now() - pending.sentAt;
    this.updateLatencyStats(latency);

    const { success, result, error } = envelope.payload;

    if (success) {
      this.stats.responsesReceived++;
      pending.resolve(result);
    } else {
      pending.reject(
        error
          ? ProtocolError.fromInfo(error)
          : new ProtocolError('Request failed', ProtocolErrorCode.PROTOCOL_ERROR)
      );
    }
  }

  // ============================================
  // Event Pub/Sub Pattern
  // ============================================

  /**
   * Subscribe to an event
   *
   * @param event - Event name to subscribe to
   * @param handler - Event handler function
   */
  subscribe<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.eventSubscriptions.push({
      event,
      handler: handler as EventHandler<unknown>,
      once: false,
    });
  }

  /**
   * Subscribe to an event (one time)
   */
  subscribeOnce<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.eventSubscriptions.push({
      event,
      handler: handler as EventHandler<unknown>,
      once: true,
    });
  }

  /**
   * Unsubscribe from an event
   */
  unsubscribe<T = unknown>(event: string, handler?: EventHandler<T>): void {
    if (handler) {
      this.eventSubscriptions = this.eventSubscriptions.filter(
        (sub) => !(sub.event === event && sub.handler === handler)
      );
    } else {
      this.eventSubscriptions = this.eventSubscriptions.filter((sub) => sub.event !== event);
    }
  }

  /**
   * Publish an event
   */
  async publish<T = unknown>(event: string, data: T, requiresAck: boolean = false): Promise<void> {
    if (!this.isChannelOpen()) {
      throw new ProtocolError('Channel not open', ProtocolErrorCode.INVALID_STATE);
    }

    const envelope = await this.protocolHandler.createEvent(
      event,
      data,
      this.remoteAgentId,
      requiresAck
    );

    await this.sendEnvelope(envelope);
    this.stats.eventsPublished++;
  }

  /**
   * Broadcast an event to all connected peers
   */
  async broadcast<T = unknown>(event: string, data: T): Promise<void> {
    if (!this.isChannelOpen()) {
      throw new ProtocolError('Channel not open', ProtocolErrorCode.INVALID_STATE);
    }

    const envelope = await this.protocolHandler.createEvent(event, data, '*', false);

    const encodedData = await this.encoder.encode(envelope);
    await this.router.broadcast(envelope, encodedData);
    this.stats.eventsPublished++;
  }

  /**
   * Handle incoming event
   */
  private handleEvent(envelope: ProtocolEnvelope<EventPayload>): void {
    const { event, data, requiresAck } = envelope.payload;

    // Find matching subscriptions
    const matchingSubscriptions = this.eventSubscriptions.filter((sub) => sub.event === event);

    // Remove one-time subscriptions
    this.eventSubscriptions = this.eventSubscriptions.filter(
      (sub) => !(sub.event === event && sub.once)
    );

    // Invoke handlers
    for (const subscription of matchingSubscriptions) {
      try {
        subscription.handler(data, envelope as ProtocolEnvelope<EventPayload<unknown>>);
      } catch (error) {
        // Emit error but don't stop other handlers
        this.handleError(
          new ProtocolError(
            `Event handler error: ${error instanceof Error ? error.message : 'Unknown'}`,
            ProtocolErrorCode.PROTOCOL_ERROR
          )
        );
      }
    }

    this.stats.eventsReceived++;

    // Send acknowledgment if required
    if (requiresAck) {
      this.sendAck(envelope.header.messageId, envelope.header.senderId).catch(() => {
        // Ignore ack send errors
      });
    }
  }

  // ============================================
  // Message Handling
  // ============================================

  /**
   * Process incoming message data
   */
  async processIncomingData(data: Uint8Array | string): Promise<void> {
    try {
      // Decode message
      const dataBuffer =
        typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const envelope = await this.encoder.decode(dataBuffer);

      // Verify message
      const verified = await this.protocolHandler.verifyMessage(envelope);
      if (!verified) {
        throw new ProtocolError('Message verification failed', ProtocolErrorCode.INVALID_SIGNATURE);
      }

      // Update stats
      this.stats.messagesReceived++;
      this.stats.bytesReceived += dataBuffer.length;
      this.stats.lastActivityAt = Date.now();

      // Route to appropriate handler
      await this.routeIncomingMessage(envelope);

      this.emitChannelEvent({
        type: ChannelEventType.MESSAGE_RECEIVED,
        timestamp: Date.now(),
        details: {
          type: envelope.header.type,
          messageId: envelope.header.messageId,
        },
      });
    } catch (error) {
      this.handleError(
        error instanceof ProtocolError
          ? error
          : new ProtocolError(
              `Failed to process message: ${error instanceof Error ? error.message : 'Unknown'}`,
              ProtocolErrorCode.DESERIALIZATION_ERROR
            )
      );
    }
  }

  /**
   * Route incoming message to handler
   */
  private async routeIncomingMessage(envelope: ProtocolEnvelope): Promise<void> {
    switch (envelope.header.type) {
      case MessageType.REQUEST:
        await this.handleRequest(envelope as ProtocolEnvelope<RequestPayload>);
        break;

      case MessageType.RESPONSE:
        this.handleResponse(envelope as ProtocolEnvelope<ResponsePayload>);
        break;

      case MessageType.EVENT:
        this.handleEvent(envelope as ProtocolEnvelope<EventPayload>);
        break;

      case MessageType.HEARTBEAT:
        await this.handleHeartbeat(envelope);
        break;

      case MessageType.HANDSHAKE:
        await this.handleIncomingHandshake(envelope);
        break;

      case MessageType.HANDSHAKE_ACK:
        await this.handleHandshakeAck(envelope);
        break;

      case MessageType.ACK:
        this.handleAck(envelope);
        break;

      case MessageType.NACK:
        this.handleNack(envelope);
        break;

      case MessageType.CLOSE:
        this.handleClose(envelope);
        break;

      case MessageType.ERROR:
        this.handleErrorMessage(envelope);
        break;

      default:
        // Unknown message type
        break;
    }
  }

  /**
   * Handle incoming handshake
   */
  private async handleIncomingHandshake(envelope: ProtocolEnvelope): Promise<void> {
    const result = await this.protocolHandler.processHandshake(
      envelope as ProtocolEnvelope<import('./types').HandshakePayload>
    );

    if (result.success) {
      const ackEnvelope = await this.protocolHandler.createHandshakeAck(result);
      await this.sendEnvelope(ackEnvelope);

      this.isOpen = true;
      this.openedAt = Date.now();
      this.stats.openedAt = this.openedAt;
    }
  }

  /**
   * Handle handshake acknowledgment
   */
  private async handleHandshakeAck(envelope: ProtocolEnvelope): Promise<void> {
    await this.protocolHandler.processHandshakeAck(
      envelope as ProtocolEnvelope<import('./types').HandshakeAckPayload>
    );
  }

  /**
   * Handle heartbeat
   */
  private async handleHeartbeat(envelope: ProtocolEnvelope): Promise<void> {
    const response = await this.protocolHandler.processHeartbeat(
      envelope as ProtocolEnvelope<import('./types').HeartbeatPayload>
    );

    if (response) {
      await this.sendEnvelope(response);
    }
  }

  /**
   * Handle acknowledgment
   */
  private handleAck(envelope: ProtocolEnvelope): void {
    const payload = envelope.payload as import('./types').AckPayload;
    this.router.processAck(payload.messageId);
  }

  /**
   * Handle negative acknowledgment
   */
  private handleNack(envelope: ProtocolEnvelope): void {
    const payload = envelope.payload as import('./types').NackPayload;
    this.router.processNack(payload.messageId, payload.reason, payload.retryable);
  }

  /**
   * Handle close message
   */
  private handleClose(envelope: ProtocolEnvelope): void {
    const payload = this.protocolHandler.processClose(
      envelope as ProtocolEnvelope<import('./types').ClosePayload>
    );

    this.cleanup();
    this.isOpen = false;

    if (payload.reconnect && this.config.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle error message
   */
  private handleErrorMessage(envelope: ProtocolEnvelope): void {
    const payload = envelope.payload as import('./types').ProtocolErrorInfo;
    this.handleError(ProtocolError.fromInfo(payload));
  }

  // ============================================
  // Sending
  // ============================================

  /**
   * Send an envelope over the channel
   */
  private async sendEnvelope(envelope: ProtocolEnvelope): Promise<void> {
    const encodedData = await this.encoder.encode(envelope);

    // Update stats
    this.stats.messagesSent++;
    this.stats.bytesSent += encodedData.length;
    this.stats.lastActivityAt = Date.now();

    // Route through router for delivery tracking
    await this.router.route(envelope, encodedData);

    this.emitChannelEvent({
      type: ChannelEventType.MESSAGE_SENT,
      timestamp: Date.now(),
      details: {
        type: envelope.header.type,
        messageId: envelope.header.messageId,
      },
    });
  }

  /**
   * Send acknowledgment
   */
  private async sendAck(messageId: string, recipientId: string): Promise<void> {
    const ackEnvelope = await this.protocolHandler.createAck(messageId, recipientId);
    await this.sendEnvelope(ackEnvelope);
  }

  // ============================================
  // Router Integration
  // ============================================

  /**
   * Register this channel with the router
   */
  private registerWithRouter(): void {
    const peer: RoutablePeer = {
      peerId: this.remoteAgentId,
      isConnected: true,
      send: async (data: Uint8Array | string) => {
        // Send through WebRTC connection manager if available
        if (this.connectionManager) {
          const dataToSend = typeof data === 'string' ? data : data;
          this.connectionManager.send(this.remoteAgentId, 'reliable', {
            type: 'protocol-message',
            data: typeof dataToSend === 'string' ? dataToSend : Array.from(dataToSend),
            timestamp: Date.now(),
          });
        }
      },
    };

    this.router.registerPeer(peer);
  }

  // ============================================
  // Error Handling
  // ============================================

  /**
   * Register error handler
   */
  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Remove error handler
   */
  offError(handler: ErrorHandler): void {
    const index = this.errorHandlers.indexOf(handler);
    if (index !== -1) {
      this.errorHandlers.splice(index, 1);
    }
  }

  /**
   * Handle error
   */
  private handleError(error: ProtocolError, envelope?: ProtocolEnvelope): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error, envelope);
      } catch {
        // Ignore handler errors
      }
    }

    this.emitChannelEvent({
      type: ChannelEventType.ERROR,
      timestamp: Date.now(),
      details: { error: error.message, code: error.code },
    });
  }

  // ============================================
  // State Change Handling
  // ============================================

  /**
   * Register state change handler
   */
  onStateChange(handler: StateChangeHandler): void {
    this.stateChangeHandlers.push(handler);
  }

  /**
   * Remove state change handler
   */
  offStateChange(handler: StateChangeHandler): void {
    const index = this.stateChangeHandlers.indexOf(handler);
    if (index !== -1) {
      this.stateChangeHandlers.splice(index, 1);
    }
  }

  // ============================================
  // Reconnection
  // ============================================

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (!this.config.autoReconnect) return;
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts ?? 5)) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    this.reconnectTimer = setTimeout(() => {
      this.attemptReconnect();
    }, delay);

    this.emitChannelEvent({
      type: ChannelEventType.RECONNECTING,
      timestamp: Date.now(),
      details: { attempt: this.reconnectAttempts + 1, delay },
    });
  }

  /**
   * Attempt to reconnect
   */
  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    this.stats.reconnectionCount++;

    try {
      this.protocolHandler.reset();
      await this.open();

      this.reconnectAttempts = 0;

      this.emitChannelEvent({
        type: ChannelEventType.RECONNECTED,
        timestamp: Date.now(),
        details: { attempts: this.stats.reconnectionCount },
      });
    } catch {
      if (this.reconnectAttempts < (this.config.maxReconnectAttempts ?? 5)) {
        this.scheduleReconnect();
      }
    }
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get channel statistics
   */
  getStats(): ChannelStats {
    return {
      ...this.stats,
      state: this.protocolHandler.getState(),
    };
  }

  /**
   * Create initial stats object
   */
  private createInitialStats(): ChannelStats {
    return {
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      requestsSent: 0,
      responsesReceived: 0,
      eventsPublished: 0,
      eventsReceived: 0,
      averageLatency: 0,
      state: ProtocolState.IDLE,
      lastActivityAt: 0,
      openedAt: 0,
      reconnectionCount: 0,
    };
  }

  /**
   * Update latency statistics
   */
  private updateLatencyStats(latency: number): void {
    const count = this.stats.responsesReceived;
    this.stats.averageLatency =
      this.stats.averageLatency + (latency - this.stats.averageLatency) / count;
  }

  // ============================================
  // Events
  // ============================================

  /**
   * Add channel event handler
   */
  on(handler: ChannelEventHandler): void {
    this.channelEventHandlers.push(handler);
  }

  /**
   * Remove channel event handler
   */
  off(handler: ChannelEventHandler): void {
    const index = this.channelEventHandlers.indexOf(handler);
    if (index !== -1) {
      this.channelEventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit channel event
   */
  private emitChannelEvent(event: ChannelEvent): void {
    for (const handler of this.channelEventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  /**
   * Setup event forwarding from protocol handler and router
   */
  private setupEventForwarding(): void {
    // Forward protocol handler events
    this.protocolHandler.on((event: ProtocolEvent) => {
      if (event.type === ProtocolEventType.STATE_CHANGED) {
        const transition = event.details as ProtocolStateTransition;
        for (const handler of this.stateChangeHandlers) {
          try {
            handler(transition);
          } catch {
            // Ignore
          }
        }
        this.emitChannelEvent({
          type: ChannelEventType.STATE_CHANGED,
          timestamp: event.timestamp,
          details: transition,
        });
      }
    });

    // Forward router events
    this.router.on((event: RouterEvent) => {
      if (event.type === RouterEventType.MESSAGE_FAILED) {
        this.emitChannelEvent({
          type: ChannelEventType.ERROR,
          timestamp: event.timestamp,
          details: { messageId: event.messageId, ...(event.details as object || {}) },
        });
      }
    });
  }

  // ============================================
  // Cleanup
  // ============================================

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Cancel reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Reject pending requests
    for (const [, pending] of Array.from(this.pendingRequests.entries())) {
      clearTimeout(pending.timer);
      pending.reject(new ProtocolError('Channel closed', ProtocolErrorCode.CONNECTION_CLOSED));
    }
    this.pendingRequests.clear();

    // Clear subscriptions
    this.eventSubscriptions = [];

    // Stop protocol handler
    this.protocolHandler.close();

    // Clear router
    this.router.destroy();
  }

  /**
   * Destroy the channel and release all resources
   */
  destroy(): void {
    this.cleanup();
    this.channelEventHandlers = [];
    this.errorHandlers = [];
    this.stateChangeHandlers = [];
    this.requestHandlers.clear();
  }

  // ============================================
  // Getters
  // ============================================

  /**
   * Get local agent ID
   */
  getLocalAgentId(): string {
    return this.localIdentity.agentId;
  }

  /**
   * Get remote agent ID
   */
  getRemoteAgentId(): string {
    return this.remoteAgentId;
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.protocolHandler.getSessionId();
  }

  /**
   * Get agreed features
   */
  getAgreedFeatures(): ProtocolFeature[] {
    return this.protocolHandler.getAgreedFeatures();
  }

  /**
   * Check if a feature is enabled
   */
  hasFeature(feature: ProtocolFeature): boolean {
    return this.protocolHandler.hasFeature(feature);
  }

  /**
   * Get heartbeat latency
   */
  getHeartbeatLatency(): number | null {
    return this.protocolHandler.getHeartbeatLatency();
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return this.protocolHandler.getRateLimitStatus();
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new agent channel
 */
export function createAgentChannel(options: AgentChannelOptions): AgentChannel {
  return new AgentChannel(options);
}

/**
 * Create multiple channels for an agent
 */
export function createAgentChannels(
  localIdentity: AgentIdentity,
  localKeyPair: KeyPair,
  remoteAgentIds: string[],
  connectionManager?: PeerConnectionManager,
  config?: Partial<ChannelConfig>
): Map<string, AgentChannel> {
  const channels = new Map<string, AgentChannel>();

  for (const remoteAgentId of remoteAgentIds) {
    const channel = new AgentChannel({
      localIdentity,
      localKeyPair,
      remoteAgentId,
      connectionManager,
      config,
    });
    channels.set(remoteAgentId, channel);
  }

  return channels;
}
