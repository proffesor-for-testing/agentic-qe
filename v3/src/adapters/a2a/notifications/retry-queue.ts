/**
 * A2A Webhook Retry Queue
 *
 * Implements exponential backoff retry logic for failed webhook deliveries.
 * Supports configurable retry strategies and queue persistence.
 *
 * @module adapters/a2a/notifications/retry-queue
 * @see https://a2a-protocol.org/latest/specification/
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay between retries in milliseconds */
  baseDelayMs: number;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd */
  jitterEnabled?: boolean;
  /** Maximum jitter as percentage of delay (0-1) */
  jitterRatio?: number;
}

/**
 * Pending delivery in the retry queue
 */
export interface PendingDelivery {
  /** Unique delivery ID */
  id: string;
  /** Subscription ID for this delivery */
  subscriptionId: string;
  /** Task ID associated with this delivery */
  taskId: string;
  /** Webhook URL */
  url: string;
  /** Webhook secret for signing */
  secret: string;
  /** Payload to deliver */
  payload: string;
  /** Original timestamp when first attempted */
  originalTimestamp: Date;
  /** Current attempt number (1-based) */
  attempt: number;
  /** Last error message */
  lastError?: string;
  /** Last HTTP status code */
  lastStatusCode?: number;
  /** Scheduled retry time */
  scheduledAt: Date;
  /** Retry configuration */
  retryConfig: RetryConfig;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Delivery result from the retry processor
 */
export interface DeliveryAttemptResult {
  /** Whether the delivery was successful */
  success: boolean;
  /** HTTP status code */
  statusCode?: number;
  /** Error message if failed */
  error?: string;
  /** Response time in milliseconds */
  responseTimeMs?: number;
  /** Whether to retry (false if max attempts reached or non-retryable error) */
  shouldRetry: boolean;
  /** Next attempt time if should retry */
  nextAttemptAt?: Date;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  /** Total items in queue */
  totalItems: number;
  /** Items by attempt count */
  byAttempt: Record<number, number>;
  /** Oldest item age in milliseconds */
  oldestItemAgeMs: number;
  /** Items ready to process (scheduled time passed) */
  readyToProcess: number;
  /** Items scheduled for future */
  scheduledForLater: number;
  /** Total processed items */
  totalProcessed: number;
  /** Total successful deliveries */
  totalSuccess: number;
  /** Total failed deliveries (gave up) */
  totalFailed: number;
}

/**
 * Queue configuration
 */
export interface RetryQueueConfig {
  /** Maximum queue size */
  maxQueueSize?: number;
  /** Processing interval in milliseconds */
  processingIntervalMs?: number;
  /** Maximum concurrent deliveries */
  maxConcurrent?: number;
  /** Default retry configuration */
  defaultRetryConfig?: Partial<RetryConfig>;
  /** Enable automatic processing */
  enableAutoProcessing?: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterEnabled: true,
  jitterRatio: 0.2,
};

export const DEFAULT_QUEUE_CONFIG: Required<RetryQueueConfig> = {
  maxQueueSize: 10000,
  processingIntervalMs: 1000,
  maxConcurrent: 10,
  defaultRetryConfig: DEFAULT_RETRY_CONFIG,
  enableAutoProcessing: true,
};

// ============================================================================
// Retry Queue Implementation
// ============================================================================

/**
 * Retry queue for failed webhook deliveries
 *
 * Implements exponential backoff with jitter for reliable delivery.
 */
export class RetryQueue extends EventEmitter {
  private readonly config: Required<RetryQueueConfig>;
  private readonly queue: Map<string, PendingDelivery> = new Map();
  private readonly scheduledIndex: Map<number, Set<string>> = new Map();
  private processingTimer?: ReturnType<typeof setInterval>;
  private isProcessing = false;
  private currentlyProcessing = new Set<string>();

  // Statistics
  private stats = {
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
  };

  // Delivery function to be provided externally
  private deliveryFn?: (delivery: PendingDelivery) => Promise<DeliveryAttemptResult>;

  constructor(config: RetryQueueConfig = {}) {
    super();
    this.config = {
      ...DEFAULT_QUEUE_CONFIG,
      ...config,
      defaultRetryConfig: {
        ...DEFAULT_RETRY_CONFIG,
        ...config.defaultRetryConfig,
      },
    };

    if (this.config.enableAutoProcessing) {
      this.startProcessing();
    }
  }

  // ============================================================================
  // Queue Operations
  // ============================================================================

  /**
   * Add a delivery to the retry queue
   */
  enqueue(delivery: PendingDelivery): void {
    if (this.queue.size >= this.config.maxQueueSize) {
      // Evict oldest item
      this.evictOldest();
    }

    // Ensure proper retry config
    delivery.retryConfig = {
      ...this.config.defaultRetryConfig as RetryConfig,
      ...delivery.retryConfig,
    };

    this.queue.set(delivery.id, delivery);
    this.addToScheduleIndex(delivery);

    this.emit('enqueued', { delivery });
  }

  /**
   * Create and enqueue a new delivery
   */
  enqueueNew(params: {
    subscriptionId: string;
    taskId: string;
    url: string;
    secret: string;
    payload: string;
    retryConfig?: Partial<RetryConfig>;
    metadata?: Record<string, unknown>;
  }): PendingDelivery {
    const now = new Date();
    const id = `retry-${Date.now()}-${randomUUID().split('-')[0]}`;

    const delivery: PendingDelivery = {
      id,
      subscriptionId: params.subscriptionId,
      taskId: params.taskId,
      url: params.url,
      secret: params.secret,
      payload: params.payload,
      originalTimestamp: now,
      attempt: 1,
      scheduledAt: now,
      retryConfig: {
        ...this.config.defaultRetryConfig as RetryConfig,
        ...params.retryConfig,
      },
      metadata: params.metadata,
    };

    this.enqueue(delivery);
    return delivery;
  }

  /**
   * Get a delivery by ID
   */
  get(id: string): PendingDelivery | undefined {
    return this.queue.get(id);
  }

  /**
   * Check if a delivery is in the queue
   */
  has(id: string): boolean {
    return this.queue.has(id);
  }

  /**
   * Remove a delivery from the queue
   */
  remove(id: string): boolean {
    const delivery = this.queue.get(id);
    if (!delivery) {
      return false;
    }

    this.removeFromScheduleIndex(delivery);
    this.queue.delete(id);

    this.emit('removed', { id });
    return true;
  }

  /**
   * Remove all deliveries for a subscription
   */
  removeBySubscription(subscriptionId: string): number {
    const toRemove: string[] = [];

    for (const [id, delivery] of this.queue) {
      if (delivery.subscriptionId === subscriptionId) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.remove(id);
    }

    return toRemove.length;
  }

  /**
   * Remove all deliveries for a task
   */
  removeByTask(taskId: string): number {
    const toRemove: string[] = [];

    for (const [id, delivery] of this.queue) {
      if (delivery.taskId === taskId) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.remove(id);
    }

    return toRemove.length;
  }

  // ============================================================================
  // Processing
  // ============================================================================

  /**
   * Set the delivery function for processing
   */
  setDeliveryFunction(fn: (delivery: PendingDelivery) => Promise<DeliveryAttemptResult>): void {
    this.deliveryFn = fn;
  }

  /**
   * Process the queue (call pending deliveries)
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    if (!this.deliveryFn) {
      return;
    }

    this.isProcessing = true;

    try {
      const now = Date.now();
      const ready = this.getReadyDeliveries(now);

      // Limit concurrent processing
      const toProcess = ready.filter(
        (d) => !this.currentlyProcessing.has(d.id)
      ).slice(0, this.config.maxConcurrent - this.currentlyProcessing.size);

      if (toProcess.length === 0) {
        return;
      }

      // Process in parallel
      const promises = toProcess.map((delivery) => this.processDelivery(delivery));
      await Promise.allSettled(promises);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single delivery
   */
  private async processDelivery(delivery: PendingDelivery): Promise<void> {
    this.currentlyProcessing.add(delivery.id);

    try {
      this.emit('processing', { delivery });

      const result = await this.deliveryFn!(delivery);
      this.stats.totalProcessed++;

      if (result.success) {
        // Success - remove from queue
        this.stats.totalSuccess++;
        this.remove(delivery.id);
        this.emit('success', { delivery, result });
      } else if (result.shouldRetry && delivery.attempt < delivery.retryConfig.maxAttempts) {
        // Retry - update and reschedule
        this.rescheduleDelivery(delivery, result);
        this.emit('retrying', { delivery, result });
      } else {
        // Give up - remove from queue
        this.stats.totalFailed++;
        this.remove(delivery.id);
        this.emit('failed', { delivery, result });
      }
    } catch (error) {
      // Unexpected error - attempt retry
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (delivery.attempt < delivery.retryConfig.maxAttempts) {
        this.rescheduleDelivery(delivery, {
          success: false,
          shouldRetry: true,
          error: errorMessage,
        });
        this.emit('retrying', {
          delivery,
          result: { success: false, shouldRetry: true, error: errorMessage },
        });
      } else {
        this.stats.totalFailed++;
        this.remove(delivery.id);
        this.emit('failed', {
          delivery,
          result: { success: false, shouldRetry: false, error: errorMessage },
        });
      }
    } finally {
      this.currentlyProcessing.delete(delivery.id);
    }
  }

  /**
   * Reschedule a delivery for retry
   */
  private rescheduleDelivery(delivery: PendingDelivery, result: DeliveryAttemptResult): void {
    this.removeFromScheduleIndex(delivery);

    delivery.attempt++;
    delivery.lastError = result.error;
    delivery.lastStatusCode = result.statusCode;
    delivery.scheduledAt = this.calculateNextRetryTime(delivery);

    this.addToScheduleIndex(delivery);
  }

  /**
   * Calculate the next retry time using exponential backoff
   */
  private calculateNextRetryTime(delivery: PendingDelivery): Date {
    const { baseDelayMs, maxDelayMs, backoffMultiplier, jitterEnabled, jitterRatio } =
      delivery.retryConfig;

    // Exponential backoff: delay = base * multiplier^(attempt-1)
    let delay = baseDelayMs * Math.pow(backoffMultiplier, delivery.attempt - 1);

    // Cap at max delay
    delay = Math.min(delay, maxDelayMs);

    // Add jitter
    if (jitterEnabled && jitterRatio && jitterRatio > 0) {
      const jitter = delay * jitterRatio * (Math.random() * 2 - 1);
      delay = Math.max(baseDelayMs, delay + jitter);
    }

    return new Date(Date.now() + delay);
  }

  /**
   * Get deliveries ready to process
   */
  private getReadyDeliveries(now: number): PendingDelivery[] {
    const ready: PendingDelivery[] = [];

    for (const delivery of this.queue.values()) {
      if (delivery.scheduledAt.getTime() <= now) {
        ready.push(delivery);
      }
    }

    // Sort by scheduled time (oldest first)
    ready.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    return ready;
  }

  // ============================================================================
  // Timer Management
  // ============================================================================

  /**
   * Start automatic processing
   */
  startProcessing(): void {
    if (this.processingTimer) {
      return;
    }

    this.processingTimer = setInterval(() => {
      this.processQueue().catch((error) => {
        this.emit('error', { error });
      });
    }, this.config.processingIntervalMs);

    if (typeof this.processingTimer.unref === 'function') {
      this.processingTimer.unref();
    }
  }

  /**
   * Stop automatic processing
   */
  stopProcessing(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const now = Date.now();
    const byAttempt: Record<number, number> = {};
    let oldestItemAgeMs = 0;
    let readyToProcess = 0;
    let scheduledForLater = 0;

    for (const delivery of this.queue.values()) {
      // Count by attempt
      byAttempt[delivery.attempt] = (byAttempt[delivery.attempt] ?? 0) + 1;

      // Track oldest
      const age = now - delivery.originalTimestamp.getTime();
      if (age > oldestItemAgeMs) {
        oldestItemAgeMs = age;
      }

      // Count ready vs scheduled
      if (delivery.scheduledAt.getTime() <= now) {
        readyToProcess++;
      } else {
        scheduledForLater++;
      }
    }

    return {
      totalItems: this.queue.size,
      byAttempt,
      oldestItemAgeMs,
      readyToProcess,
      scheduledForLater,
      totalProcessed: this.stats.totalProcessed,
      totalSuccess: this.stats.totalSuccess,
      totalFailed: this.stats.totalFailed,
    };
  }

  /**
   * Get queue size
   */
  get size(): number {
    return this.queue.size;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clear all failed retries (items that have reached max attempts)
   */
  clearFailed(): number {
    const toRemove: string[] = [];

    for (const [id, delivery] of this.queue) {
      if (delivery.attempt >= delivery.retryConfig.maxAttempts) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.remove(id);
    }

    return toRemove.length;
  }

  /**
   * Clear all items in the queue
   */
  clear(): void {
    this.queue.clear();
    this.scheduledIndex.clear();
    this.emit('cleared', {});
  }

  /**
   * Destroy the queue
   */
  destroy(): void {
    this.stopProcessing();
    this.clear();
    this.removeAllListeners();
  }

  // ============================================================================
  // Index Management
  // ============================================================================

  private addToScheduleIndex(delivery: PendingDelivery): void {
    // Use minute-level buckets for scheduling index
    const bucket = Math.floor(delivery.scheduledAt.getTime() / 60000);
    let items = this.scheduledIndex.get(bucket);
    if (!items) {
      items = new Set();
      this.scheduledIndex.set(bucket, items);
    }
    items.add(delivery.id);
  }

  private removeFromScheduleIndex(delivery: PendingDelivery): void {
    const bucket = Math.floor(delivery.scheduledAt.getTime() / 60000);
    const items = this.scheduledIndex.get(bucket);
    if (items) {
      items.delete(delivery.id);
      if (items.size === 0) {
        this.scheduledIndex.delete(bucket);
      }
    }
  }

  private evictOldest(): void {
    let oldest: PendingDelivery | undefined;

    for (const delivery of this.queue.values()) {
      if (!oldest || delivery.originalTimestamp < oldest.originalTimestamp) {
        oldest = delivery;
      }
    }

    if (oldest) {
      this.remove(oldest.id);
      this.emit('evicted', { delivery: oldest });
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new retry queue
 */
export function createRetryQueue(config: RetryQueueConfig = {}): RetryQueue {
  return new RetryQueue(config);
}
