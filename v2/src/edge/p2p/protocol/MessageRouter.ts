/**
 * Message Router for Agent-to-Agent Protocol
 *
 * Routes messages to correct peer connections with support for unicast,
 * broadcast, and multicast patterns. Includes message queuing with priority,
 * delivery confirmation tracking, timeout/retry logic, and dead letter handling.
 *
 * @module edge/p2p/protocol/MessageRouter
 * @version 1.0.0
 */

import type {
  ProtocolEnvelope,
  RoutingInfo,
  DeliveryInfo,
  DeadLetter,
  QueueStats,
  QueueConfig,
} from './types';
import {
  ProtocolError,
  ProtocolErrorCode,
  RoutingMode,
  MessagePriority,
  DeliveryStatus,
  DeliverySemantics,
  DEFAULT_QUEUE_CONFIG,
  DEFAULT_MESSAGE_TTL,
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAY_MULTIPLIER,
  INITIAL_RETRY_DELAY,
  generateMessageId,
} from './types';

// ============================================
// Types
// ============================================

/**
 * Peer connection interface for routing
 */
export interface RoutablePeer {
  /** Peer identifier */
  peerId: string;
  /** Whether peer is connected */
  isConnected: boolean;
  /** Send data to peer */
  send: (data: Uint8Array | string) => Promise<void>;
  /** Get peer metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Queued message entry
 */
interface QueueEntry {
  /** Unique queue entry ID */
  id: string;
  /** Protocol envelope */
  envelope: ProtocolEnvelope;
  /** Encoded message data */
  data: Uint8Array;
  /** Message priority */
  priority: MessagePriority;
  /** Target peer IDs */
  targets: string[];
  /** Timestamp when queued */
  queuedAt: number;
  /** Delivery info */
  deliveryInfo: DeliveryInfo;
  /** Resolve function for delivery promise */
  resolve: (value: boolean) => void;
  /** Reject function for delivery promise */
  reject: (error: Error) => void;
}

/**
 * Router event types
 */
export enum RouterEventType {
  MESSAGE_QUEUED = 'message_queued',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_DELIVERED = 'message_delivered',
  MESSAGE_FAILED = 'message_failed',
  MESSAGE_EXPIRED = 'message_expired',
  DEAD_LETTERED = 'dead_lettered',
  QUEUE_OVERFLOW = 'queue_overflow',
  PEER_UNAVAILABLE = 'peer_unavailable',
}

/**
 * Router event
 */
export interface RouterEvent {
  type: RouterEventType;
  messageId: string;
  timestamp: number;
  details?: unknown;
}

/**
 * Router event handler
 */
export type RouterEventHandler = (event: RouterEvent) => void;

/**
 * Router configuration
 */
export interface RouterConfig {
  /** Queue configuration */
  queue?: Partial<QueueConfig>;
  /** Enable dead letter queue */
  enableDeadLetter?: boolean;
  /** Maximum dead letter queue size */
  maxDeadLetterSize?: number;
  /** Enable automatic retry */
  enableRetry?: boolean;
  /** Custom retry delay calculator */
  retryDelayCalculator?: (attempt: number) => number;
}

// ============================================
// MessageRouter Class
// ============================================

/**
 * Message router for agent-to-agent communication
 *
 * @example
 * ```typescript
 * const router = new MessageRouter();
 *
 * // Register peer
 * router.registerPeer({
 *   peerId: 'peer-1',
 *   isConnected: true,
 *   send: async (data) => { ... }
 * });
 *
 * // Route message
 * await router.route(envelope, encodedData);
 * ```
 */
export class MessageRouter {
  private peers: Map<string, RoutablePeer> = new Map();
  private queue: QueueEntry[] = [];
  private deliveryTracking: Map<string, DeliveryInfo> = new Map();
  private deadLetterQueue: DeadLetter[] = [];
  private pendingAcks: Map<string, QueueEntry> = new Map();
  private eventHandlers: RouterEventHandler[] = [];
  private config: Required<RouterConfig>;
  private queueConfig: QueueConfig;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;
  private stats: QueueStats;

  constructor(config: RouterConfig = {}) {
    this.config = {
      queue: config.queue ?? {},
      enableDeadLetter: config.enableDeadLetter ?? true,
      maxDeadLetterSize: config.maxDeadLetterSize ?? 100,
      enableRetry: config.enableRetry ?? true,
      retryDelayCalculator: config.retryDelayCalculator ?? this.defaultRetryDelay,
    };

    this.queueConfig = {
      ...DEFAULT_QUEUE_CONFIG,
      ...this.config.queue,
    };

    this.stats = {
      size: 0,
      memory: 0,
      totalEnqueued: 0,
      totalDequeued: 0,
      totalDropped: 0,
      averageWaitTime: 0,
      byPriority: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
    };

    // Start queue processing
    this.startFlushTimer();
  }

  // ============================================
  // Peer Management
  // ============================================

  /**
   * Register a peer for routing
   */
  registerPeer(peer: RoutablePeer): void {
    this.peers.set(peer.peerId, peer);
  }

  /**
   * Unregister a peer
   */
  unregisterPeer(peerId: string): void {
    this.peers.delete(peerId);
  }

  /**
   * Get registered peer
   */
  getPeer(peerId: string): RoutablePeer | undefined {
    return this.peers.get(peerId);
  }

  /**
   * Get all connected peers
   */
  getConnectedPeers(): RoutablePeer[] {
    return Array.from(this.peers.values()).filter((p) => p.isConnected);
  }

  /**
   * Check if peer is available
   */
  isPeerAvailable(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    return peer !== undefined && peer.isConnected;
  }

  // ============================================
  // Routing Methods
  // ============================================

  /**
   * Route a message to its destination(s)
   *
   * @param envelope - Protocol envelope
   * @param data - Encoded message data
   * @returns Promise that resolves when delivery is confirmed
   */
  async route(envelope: ProtocolEnvelope, data: Uint8Array): Promise<boolean> {
    const routing = envelope.routing ?? {
      mode: envelope.header.routing,
      targets: [envelope.header.recipientId],
    };

    // Determine targets based on routing mode
    const targets = this.resolveTargets(routing, envelope.header.senderId);

    if (targets.length === 0) {
      throw new ProtocolError('No valid targets for message', ProtocolErrorCode.NO_ROUTE);
    }

    // Check if immediate delivery is possible
    const availableTargets = targets.filter((t) => this.isPeerAvailable(t));

    if (
      availableTargets.length === targets.length &&
      envelope.header.delivery === DeliverySemantics.AT_MOST_ONCE
    ) {
      // Attempt immediate delivery for fire-and-forget
      return this.deliverImmediate(envelope, data, targets);
    }

    // Queue for reliable delivery
    return this.queueForDelivery(envelope, data, targets);
  }

  /**
   * Route broadcast message to all peers
   */
  async broadcast(
    envelope: ProtocolEnvelope,
    data: Uint8Array,
    excludeSender: boolean = true
  ): Promise<boolean> {
    const targets = this.getConnectedPeers()
      .map((p) => p.peerId)
      .filter((id) => !excludeSender || id !== envelope.header.senderId);

    if (targets.length === 0) {
      return true; // No peers to broadcast to
    }

    return this.route(
      {
        ...envelope,
        routing: {
          mode: RoutingMode.BROADCAST,
          targets,
          excludeSender,
        },
      },
      data
    );
  }

  /**
   * Route multicast message to specific peers
   */
  async multicast(
    envelope: ProtocolEnvelope,
    data: Uint8Array,
    targets: string[]
  ): Promise<boolean> {
    return this.route(
      {
        ...envelope,
        routing: {
          mode: RoutingMode.MULTICAST,
          targets,
        },
      },
      data
    );
  }

  /**
   * Resolve target peer IDs based on routing info
   */
  private resolveTargets(routing: RoutingInfo, senderId: string): string[] {
    switch (routing.mode) {
      case RoutingMode.UNICAST:
        return routing.targets ?? [];

      case RoutingMode.BROADCAST: {
        const allPeers = Array.from(this.peers.keys());
        return routing.excludeSender ? allPeers.filter((p) => p !== senderId) : allPeers;
      }

      case RoutingMode.MULTICAST:
        return routing.targets ?? [];

      case RoutingMode.RELAY:
        // For relay, first target is the relay node
        return routing.relayNodes?.[0] ? [routing.relayNodes[0]] : routing.targets ?? [];

      default:
        return routing.targets ?? [];
    }
  }

  // ============================================
  // Delivery Methods
  // ============================================

  /**
   * Attempt immediate delivery without queuing
   */
  private async deliverImmediate(
    envelope: ProtocolEnvelope,
    data: Uint8Array,
    targets: string[]
  ): Promise<boolean> {
    const results = await Promise.allSettled(
      targets.map(async (target) => {
        const peer = this.peers.get(target);
        if (!peer || !peer.isConnected) {
          throw new ProtocolError(
            `Peer ${target} not available`,
            ProtocolErrorCode.PEER_UNREACHABLE
          );
        }
        await peer.send(data);
        return true;
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    // Emit events
    if (successful > 0) {
      this.emit({
        type: RouterEventType.MESSAGE_SENT,
        messageId: envelope.header.messageId,
        timestamp: Date.now(),
        details: { successful, failed, targets },
      });
    }

    return failed === 0;
  }

  /**
   * Queue message for reliable delivery
   */
  private async queueForDelivery(
    envelope: ProtocolEnvelope,
    data: Uint8Array,
    targets: string[]
  ): Promise<boolean> {
    // Check queue limits
    if (this.queue.length >= this.queueConfig.maxSize) {
      // Try to make room by processing expired messages
      this.processExpired();

      if (this.queue.length >= this.queueConfig.maxSize) {
        this.emit({
          type: RouterEventType.QUEUE_OVERFLOW,
          messageId: envelope.header.messageId,
          timestamp: Date.now(),
        });
        throw new ProtocolError('Message queue full', ProtocolErrorCode.QUEUE_FULL);
      }
    }

    // Create delivery tracking
    const deliveryInfo: DeliveryInfo = {
      messageId: envelope.header.messageId,
      status: DeliveryStatus.PENDING,
      attempts: 0,
      firstAttemptAt: 0,
      lastAttemptAt: 0,
    };

    return new Promise((resolve, reject) => {
      const entry: QueueEntry = {
        id: generateMessageId(),
        envelope,
        data,
        priority: envelope.header.priority,
        targets,
        queuedAt: Date.now(),
        deliveryInfo,
        resolve,
        reject,
      };

      // Insert based on priority
      this.insertWithPriority(entry);

      // Update stats
      this.stats.size++;
      this.stats.memory += data.length;
      this.stats.totalEnqueued++;
      this.stats.byPriority[entry.priority]++;
      this.deliveryTracking.set(envelope.header.messageId, deliveryInfo);

      this.emit({
        type: RouterEventType.MESSAGE_QUEUED,
        messageId: envelope.header.messageId,
        timestamp: Date.now(),
        details: { priority: entry.priority, targets },
      });

      // Trigger immediate processing for critical messages
      if (entry.priority === MessagePriority.CRITICAL) {
        this.processQueue();
      }
    });
  }

  /**
   * Insert entry into queue maintaining priority order
   */
  private insertWithPriority(entry: QueueEntry): void {
    if (!this.queueConfig.enablePriority) {
      this.queue.push(entry);
      return;
    }

    // Find insertion point
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority > entry.priority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, entry);
  }

  // ============================================
  // Queue Processing
  // ============================================

  /**
   * Start the flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      this.processQueue();
    }, this.queueConfig.flushInterval);
  }

  /**
   * Stop the flush timer
   */
  stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Process queued messages
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    try {
      // Process expired messages first
      this.processExpired();

      // Process batch
      const batch = this.queue.splice(0, this.queueConfig.batchSize);

      for (const entry of batch) {
        await this.processEntry(entry);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single queue entry
   */
  private async processEntry(entry: QueueEntry): Promise<void> {
    const now = Date.now();

    // Check TTL
    if (now - entry.queuedAt > entry.envelope.header.ttl) {
      this.handleExpired(entry);
      return;
    }

    // Update delivery info
    entry.deliveryInfo.attempts++;
    if (entry.deliveryInfo.firstAttemptAt === 0) {
      entry.deliveryInfo.firstAttemptAt = now;
    }
    entry.deliveryInfo.lastAttemptAt = now;
    entry.deliveryInfo.status = DeliveryStatus.SENT;

    // Attempt delivery to each target
    const results = await Promise.allSettled(
      entry.targets.map(async (target) => {
        const peer = this.peers.get(target);
        if (!peer || !peer.isConnected) {
          this.emit({
            type: RouterEventType.PEER_UNAVAILABLE,
            messageId: entry.envelope.header.messageId,
            timestamp: now,
            details: { peerId: target },
          });
          throw new ProtocolError(
            `Peer ${target} not available`,
            ProtocolErrorCode.PEER_UNREACHABLE,
            true
          );
        }
        await peer.send(entry.data);
        return target;
      })
    );

    const successful = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<string>).value);
    const failed = results
      .filter((r) => r.status === 'rejected')
      .map((_, i) => entry.targets[i]);

    // Handle results
    if (failed.length === 0) {
      // All deliveries successful
      this.handleDelivered(entry, successful);
    } else if (successful.length > 0) {
      // Partial success - update targets and requeue failures
      if (this.config.enableRetry && entry.deliveryInfo.attempts < MAX_RETRY_ATTEMPTS) {
        entry.targets = failed;
        const retryDelay = this.config.retryDelayCalculator(entry.deliveryInfo.attempts);
        entry.deliveryInfo.nextRetryAt = now + retryDelay;
        this.scheduleRetry(entry, retryDelay);
      } else {
        this.handlePartialFailure(entry, successful, failed);
      }
    } else {
      // All deliveries failed
      if (this.config.enableRetry && entry.deliveryInfo.attempts < MAX_RETRY_ATTEMPTS) {
        const retryDelay = this.config.retryDelayCalculator(entry.deliveryInfo.attempts);
        entry.deliveryInfo.nextRetryAt = now + retryDelay;
        this.scheduleRetry(entry, retryDelay);
      } else {
        this.handleFailed(entry);
      }
    }
  }

  /**
   * Schedule a retry for a failed delivery
   */
  private scheduleRetry(entry: QueueEntry, delay: number): void {
    setTimeout(() => {
      // Re-insert into queue
      this.insertWithPriority(entry);
    }, delay);
  }

  /**
   * Process expired messages
   */
  private processExpired(): void {
    const now = Date.now();
    const expired: QueueEntry[] = [];

    this.queue = this.queue.filter((entry) => {
      if (now - entry.queuedAt > entry.envelope.header.ttl) {
        expired.push(entry);
        return false;
      }
      return true;
    });

    for (const entry of expired) {
      this.handleExpired(entry);
    }
  }

  /**
   * Default retry delay calculator (exponential backoff)
   */
  private defaultRetryDelay(attempt: number): number {
    return Math.min(INITIAL_RETRY_DELAY * Math.pow(RETRY_DELAY_MULTIPLIER, attempt), 30000);
  }

  // ============================================
  // Delivery Handlers
  // ============================================

  /**
   * Handle successful delivery
   */
  private handleDelivered(entry: QueueEntry, targets: string[]): void {
    entry.deliveryInfo.status = DeliveryStatus.DELIVERED;
    entry.deliveryInfo.deliveredAt = Date.now();

    // Update stats
    this.stats.size--;
    this.stats.memory -= entry.data.length;
    this.stats.totalDequeued++;
    this.stats.byPriority[entry.priority]--;
    this.updateAverageWaitTime(entry);

    this.emit({
      type: RouterEventType.MESSAGE_DELIVERED,
      messageId: entry.envelope.header.messageId,
      timestamp: Date.now(),
      details: { targets, attempts: entry.deliveryInfo.attempts },
    });

    entry.resolve(true);
  }

  /**
   * Handle delivery failure
   */
  private handleFailed(entry: QueueEntry): void {
    entry.deliveryInfo.status = DeliveryStatus.FAILED;
    entry.deliveryInfo.error = {
      code: ProtocolErrorCode.DELIVERY_FAILED,
      message: `Delivery failed after ${entry.deliveryInfo.attempts} attempts`,
      timestamp: Date.now(),
      retryable: false,
    };

    // Update stats
    this.stats.size--;
    this.stats.memory -= entry.data.length;
    this.stats.totalDropped++;
    this.stats.byPriority[entry.priority]--;

    this.emit({
      type: RouterEventType.MESSAGE_FAILED,
      messageId: entry.envelope.header.messageId,
      timestamp: Date.now(),
      details: { attempts: entry.deliveryInfo.attempts },
    });

    // Move to dead letter queue
    if (this.config.enableDeadLetter) {
      this.addToDeadLetter(entry, 'Delivery failed after max retries');
    }

    entry.reject(
      new ProtocolError(
        'Delivery failed after max retries',
        ProtocolErrorCode.DELIVERY_FAILED
      )
    );
  }

  /**
   * Handle partial delivery failure
   */
  private handlePartialFailure(
    entry: QueueEntry,
    successful: string[],
    failed: string[]
  ): void {
    // Consider partial success as delivered for the successful targets
    entry.deliveryInfo.status = DeliveryStatus.DELIVERED;
    entry.deliveryInfo.deliveredAt = Date.now();

    // Update stats
    this.stats.size--;
    this.stats.memory -= entry.data.length;
    this.stats.totalDequeued++;
    this.stats.byPriority[entry.priority]--;

    this.emit({
      type: RouterEventType.MESSAGE_DELIVERED,
      messageId: entry.envelope.header.messageId,
      timestamp: Date.now(),
      details: { successful, failed, partial: true },
    });

    // Resolve with partial success
    entry.resolve(true);
  }

  /**
   * Handle expired message
   */
  private handleExpired(entry: QueueEntry): void {
    entry.deliveryInfo.status = DeliveryStatus.EXPIRED;
    entry.deliveryInfo.error = {
      code: ProtocolErrorCode.TTL_EXPIRED,
      message: 'Message TTL expired',
      timestamp: Date.now(),
      retryable: false,
    };

    // Update stats
    this.stats.size--;
    this.stats.memory -= entry.data.length;
    this.stats.totalDropped++;
    this.stats.byPriority[entry.priority]--;

    this.emit({
      type: RouterEventType.MESSAGE_EXPIRED,
      messageId: entry.envelope.header.messageId,
      timestamp: Date.now(),
    });

    // Move to dead letter queue
    if (this.config.enableDeadLetter) {
      this.addToDeadLetter(entry, 'Message TTL expired');
    }

    entry.reject(new ProtocolError('Message expired', ProtocolErrorCode.TTL_EXPIRED));
  }

  /**
   * Update average wait time stat
   */
  private updateAverageWaitTime(entry: QueueEntry): void {
    const waitTime = Date.now() - entry.queuedAt;
    const totalDequeued = this.stats.totalDequeued;

    // Incremental average calculation
    this.stats.averageWaitTime =
      this.stats.averageWaitTime + (waitTime - this.stats.averageWaitTime) / totalDequeued;
  }

  // ============================================
  // Acknowledgment Handling
  // ============================================

  /**
   * Process acknowledgment for a message
   */
  processAck(messageId: string): void {
    const entry = this.pendingAcks.get(messageId);
    if (!entry) return;

    this.pendingAcks.delete(messageId);

    entry.deliveryInfo.status = DeliveryStatus.DELIVERED;
    entry.deliveryInfo.deliveredAt = Date.now();

    this.emit({
      type: RouterEventType.MESSAGE_DELIVERED,
      messageId,
      timestamp: Date.now(),
      details: { acknowledged: true },
    });

    entry.resolve(true);
  }

  /**
   * Process negative acknowledgment for a message
   */
  processNack(messageId: string, reason: string, retryable: boolean): void {
    const entry = this.pendingAcks.get(messageId);
    if (!entry) return;

    this.pendingAcks.delete(messageId);

    if (retryable && this.config.enableRetry) {
      if (entry.deliveryInfo.attempts < MAX_RETRY_ATTEMPTS) {
        const retryDelay = this.config.retryDelayCalculator(entry.deliveryInfo.attempts);
        this.scheduleRetry(entry, retryDelay);
        return;
      }
    }

    entry.deliveryInfo.status = DeliveryStatus.FAILED;
    entry.deliveryInfo.error = {
      code: ProtocolErrorCode.REJECTED,
      message: reason,
      timestamp: Date.now(),
      retryable: false,
    };

    this.emit({
      type: RouterEventType.MESSAGE_FAILED,
      messageId,
      timestamp: Date.now(),
      details: { reason, nack: true },
    });

    entry.reject(new ProtocolError(reason, ProtocolErrorCode.REJECTED));
  }

  // ============================================
  // Dead Letter Queue
  // ============================================

  /**
   * Add entry to dead letter queue
   */
  private addToDeadLetter(entry: QueueEntry, reason: string): void {
    // Enforce size limit
    while (this.deadLetterQueue.length >= this.config.maxDeadLetterSize) {
      this.deadLetterQueue.shift();
    }

    const deadLetter: DeadLetter = {
      envelope: entry.envelope,
      deliveryInfo: entry.deliveryInfo,
      deadLetteredAt: Date.now(),
      reason,
    };

    this.deadLetterQueue.push(deadLetter);

    this.emit({
      type: RouterEventType.DEAD_LETTERED,
      messageId: entry.envelope.header.messageId,
      timestamp: Date.now(),
      details: { reason },
    });
  }

  /**
   * Get dead letter queue
   */
  getDeadLetters(): DeadLetter[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetters(): void {
    this.deadLetterQueue = [];
  }

  /**
   * Requeue a dead letter
   */
  async requeueDeadLetter(messageId: string): Promise<boolean> {
    const index = this.deadLetterQueue.findIndex(
      (dl) => dl.envelope.header.messageId === messageId
    );

    if (index === -1) {
      return false;
    }

    const deadLetter = this.deadLetterQueue.splice(index, 1)[0];

    // Reset delivery info
    deadLetter.deliveryInfo.status = DeliveryStatus.PENDING;
    deadLetter.deliveryInfo.attempts = 0;
    deadLetter.deliveryInfo.error = undefined;
    deadLetter.deliveryInfo.firstAttemptAt = 0;
    deadLetter.deliveryInfo.lastAttemptAt = 0;
    deadLetter.deliveryInfo.nextRetryAt = undefined;

    // Reset TTL
    deadLetter.envelope.header.timestamp = Date.now();

    // Re-encode and queue (caller must provide encoded data)
    return true;
  }

  // ============================================
  // Delivery Tracking
  // ============================================

  /**
   * Get delivery info for a message
   */
  getDeliveryInfo(messageId: string): DeliveryInfo | undefined {
    return this.deliveryTracking.get(messageId);
  }

  /**
   * Get all pending deliveries
   */
  getPendingDeliveries(): DeliveryInfo[] {
    return Array.from(this.deliveryTracking.values()).filter(
      (d) => d.status === DeliveryStatus.PENDING || d.status === DeliveryStatus.SENT
    );
  }

  /**
   * Cancel pending delivery
   */
  cancelDelivery(messageId: string): boolean {
    const info = this.deliveryTracking.get(messageId);
    if (!info || info.status === DeliveryStatus.DELIVERED) {
      return false;
    }

    // Remove from queue
    const queueIndex = this.queue.findIndex(
      (e) => e.envelope.header.messageId === messageId
    );

    if (queueIndex !== -1) {
      const entry = this.queue.splice(queueIndex, 1)[0];
      entry.deliveryInfo.status = DeliveryStatus.CANCELLED;

      // Update stats
      this.stats.size--;
      this.stats.memory -= entry.data.length;
      this.stats.byPriority[entry.priority]--;

      entry.reject(new ProtocolError('Delivery cancelled', ProtocolErrorCode.REJECTED));
      return true;
    }

    // Check pending acks
    const pending = this.pendingAcks.get(messageId);
    if (pending) {
      this.pendingAcks.delete(messageId);
      pending.deliveryInfo.status = DeliveryStatus.CANCELLED;
      pending.reject(new ProtocolError('Delivery cancelled', ProtocolErrorCode.REJECTED));
      return true;
    }

    return false;
  }

  // ============================================
  // Statistics and Events
  // ============================================

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return { ...this.stats };
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Add event handler
   */
  on(handler: RouterEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove event handler
   */
  off(handler: RouterEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit event to handlers
   */
  private emit(event: RouterEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  // ============================================
  // Cleanup
  // ============================================

  /**
   * Clear all queues and state
   */
  clear(): void {
    // Reject all pending deliveries
    for (const entry of this.queue) {
      entry.reject(new ProtocolError('Router cleared', ProtocolErrorCode.CONNECTION_CLOSED));
    }

    for (const entry of Array.from(this.pendingAcks.values())) {
      entry.reject(new ProtocolError('Router cleared', ProtocolErrorCode.CONNECTION_CLOSED));
    }

    this.queue = [];
    this.pendingAcks.clear();
    this.deliveryTracking.clear();

    // Reset stats
    this.stats = {
      size: 0,
      memory: 0,
      totalEnqueued: 0,
      totalDequeued: 0,
      totalDropped: 0,
      averageWaitTime: 0,
      byPriority: {
        [MessagePriority.CRITICAL]: 0,
        [MessagePriority.HIGH]: 0,
        [MessagePriority.NORMAL]: 0,
        [MessagePriority.LOW]: 0,
      },
    };
  }

  /**
   * Destroy router and release resources
   */
  destroy(): void {
    this.stopFlushTimer();
    this.clear();
    this.peers.clear();
    this.deadLetterQueue = [];
    this.eventHandlers = [];
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new message router
 */
export function createMessageRouter(config?: RouterConfig): MessageRouter {
  return new MessageRouter(config);
}
