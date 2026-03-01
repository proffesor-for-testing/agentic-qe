/**
 * AG-UI Event Batcher
 *
 * Batches multiple AG-UI events into single payloads to reduce network overhead.
 * Supports configurable batch size, timeout, and priority events that bypass batching.
 *
 * @module adapters/ag-ui/event-batcher
 */

import { EventEmitter } from 'events';
import type { AGUIEvent, AGUIEventType } from './event-types.js';
import { getEventCategory } from './event-types.js';
import { safeJsonParse } from '../../shared/safe-json.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Event batcher configuration
 */
export interface EventBatcherConfig {
  /** Maximum events per batch (default: 10) */
  batchSize?: number;
  /** Maximum wait time before flush in milliseconds (default: 50ms) */
  batchTimeout?: number;
  /** Whether batching is enabled (default: true) */
  enabled?: boolean;
  /** Event types that bypass batching and are emitted immediately */
  priorityEvents?: AGUIEventType[];
  /** Callback invoked when a batch is flushed */
  onFlush?: (batch: EventBatch) => void;
  /** Whether to include batch metadata (default: true) */
  includeBatchMetadata?: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<EventBatcherConfig, 'onFlush'>> = {
  batchSize: 10,
  batchTimeout: 50,
  enabled: true,
  priorityEvents: [
    // Lifecycle events - critical for run state
    'RUN_STARTED' as AGUIEventType,
    'RUN_FINISHED' as AGUIEventType,
    'RUN_ERROR' as AGUIEventType,
    // State snapshots - needed for reconnection
    'STATE_SNAPSHOT' as AGUIEventType,
    'MESSAGES_SNAPSHOT' as AGUIEventType,
  ],
  includeBatchMetadata: true,
};

// ============================================================================
// Batch Types
// ============================================================================

/**
 * Batch metadata
 */
export interface BatchMetadata {
  /** Unique batch identifier */
  batchId: string;
  /** Number of events in the batch */
  count: number;
  /** Timestamp of first event in batch (ISO 8601) */
  firstEventTimestamp: string;
  /** Timestamp of last event in batch (ISO 8601) */
  lastEventTimestamp: string;
  /** Timestamp when batch was flushed (ISO 8601) */
  flushedAt: string;
  /** Reason for flush */
  flushReason: 'size' | 'timeout' | 'manual' | 'priority' | 'disabled';
  /** Total time events spent in batch (ms) */
  batchDurationMs: number;
}

/**
 * Event batch with metadata
 */
export interface EventBatch {
  /** Batch events in order */
  events: AGUIEvent[];
  /** Batch metadata */
  metadata: BatchMetadata;
}

/**
 * Batcher metrics
 */
export interface BatcherMetrics {
  /** Total events processed */
  totalEvents: number;
  /** Total batches emitted */
  totalBatches: number;
  /** Events that bypassed batching (priority events) */
  priorityEvents: number;
  /** Events that were batched */
  batchedEvents: number;
  /** Average batch size */
  averageBatchSize: number;
  /** Flushes by reason */
  flushReasons: Record<string, number>;
  /** Whether batcher is currently enabled */
  enabled: boolean;
  /** Current buffer size */
  currentBufferSize: number;
}

/**
 * Internal buffered event with metadata
 */
interface BufferedEvent {
  event: AGUIEvent;
  addedAt: number;
}

// ============================================================================
// Event Batcher Implementation
// ============================================================================

/**
 * AG-UI Event Batcher
 *
 * Batches events to reduce network overhead while maintaining ordering
 * and allowing priority events to bypass batching.
 */
export class EventBatcher extends EventEmitter {
  private readonly batchSize: number;
  private readonly batchTimeout: number;
  private enabled: boolean;
  private readonly priorityEvents: Set<AGUIEventType>;
  private readonly onFlushCallback?: (batch: EventBatch) => void;
  private readonly includeBatchMetadata: boolean;

  private buffer: BufferedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private batchCounter: number = 0;
  private metrics: BatcherMetrics;

  constructor(config: EventBatcherConfig = {}) {
    super();

    this.batchSize = config.batchSize ?? DEFAULT_CONFIG.batchSize;
    this.batchTimeout = config.batchTimeout ?? DEFAULT_CONFIG.batchTimeout;
    this.enabled = config.enabled ?? DEFAULT_CONFIG.enabled;
    this.priorityEvents = new Set(config.priorityEvents ?? DEFAULT_CONFIG.priorityEvents);
    this.onFlushCallback = config.onFlush;
    this.includeBatchMetadata = config.includeBatchMetadata ?? DEFAULT_CONFIG.includeBatchMetadata;

    this.metrics = this.initializeMetrics();
  }

  // ============================================================================
  // Main API
  // ============================================================================

  /**
   * Add an event to the batcher
   *
   * Priority events are emitted immediately.
   * Other events are batched until size or timeout triggers flush.
   *
   * @param event - The AG-UI event to add
   * @returns true if event was batched, false if emitted immediately
   */
  add(event: AGUIEvent): boolean {
    this.metrics.totalEvents++;

    // If batching is disabled, emit immediately
    if (!this.enabled) {
      this.emitSingleEvent(event, 'disabled');
      return false;
    }

    // Check if this is a priority event
    if (this.isPriorityEvent(event)) {
      this.metrics.priorityEvents++;
      this.emitSingleEvent(event, 'priority');
      return false;
    }

    // Add to buffer
    this.buffer.push({
      event,
      addedAt: Date.now(),
    });
    this.metrics.batchedEvents++;

    // Check if we should flush due to batch size
    if (this.buffer.length >= this.batchSize) {
      this.flush('size');
      return true;
    }

    // Schedule timeout flush if not already scheduled
    this.scheduleFlush();

    return true;
  }

  /**
   * Add multiple events at once
   *
   * @param events - Array of events to add
   * @returns Number of events that were batched
   */
  addMany(events: AGUIEvent[]): number {
    let batched = 0;
    for (const event of events) {
      if (this.add(event)) {
        batched++;
      }
    }
    return batched;
  }

  /**
   * Manually flush the current batch
   */
  flush(reason: BatchMetadata['flushReason'] = 'manual'): void {
    this.clearFlushTimer();

    if (this.buffer.length === 0) {
      return;
    }

    const now = Date.now();
    const events = this.buffer.map((b) => b.event);
    const firstAddedAt = this.buffer[0].addedAt;
    const lastAddedAt = this.buffer[this.buffer.length - 1].addedAt;

    // Create batch
    const batch: EventBatch = {
      events,
      metadata: {
        batchId: this.generateBatchId(),
        count: events.length,
        firstEventTimestamp: this.buffer[0].event.timestamp,
        lastEventTimestamp: this.buffer[this.buffer.length - 1].event.timestamp,
        flushedAt: new Date(now).toISOString(),
        flushReason: reason,
        batchDurationMs: now - firstAddedAt,
      },
    };

    // Clear buffer
    this.buffer = [];

    // Update metrics
    this.metrics.totalBatches++;
    this.metrics.flushReasons[reason] = (this.metrics.flushReasons[reason] || 0) + 1;
    this.updateAverageBatchSize(events.length);

    // Emit batch
    this.emit('batch', batch);

    // Call callback if provided
    if (this.onFlushCallback) {
      this.onFlushCallback(batch);
    }
  }

  /**
   * Enable batching
   */
  enable(): void {
    this.enabled = true;
    this.metrics.enabled = true;
    this.emit('enabled');
  }

  /**
   * Disable batching
   * Flushes any pending events before disabling
   */
  disable(): void {
    // Flush pending events first
    if (this.buffer.length > 0) {
      this.flush('manual');
    }

    this.enabled = false;
    this.metrics.enabled = false;
    this.clearFlushTimer();
    this.emit('disabled');
  }

  /**
   * Check if batching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  // ============================================================================
  // Configuration Methods
  // ============================================================================

  /**
   * Add a priority event type
   */
  addPriorityEvent(eventType: AGUIEventType): void {
    this.priorityEvents.add(eventType);
  }

  /**
   * Remove a priority event type
   */
  removePriorityEvent(eventType: AGUIEventType): void {
    this.priorityEvents.delete(eventType);
  }

  /**
   * Check if an event type is a priority event
   */
  isPriorityEventType(eventType: AGUIEventType): boolean {
    return this.priorityEvents.has(eventType);
  }

  /**
   * Get all priority event types
   */
  getPriorityEventTypes(): AGUIEventType[] {
    return Array.from(this.priorityEvents);
  }

  // ============================================================================
  // State and Metrics
  // ============================================================================

  /**
   * Get current metrics
   */
  getMetrics(): Readonly<BatcherMetrics> {
    return {
      ...this.metrics,
      currentBufferSize: this.buffer.length,
      enabled: this.enabled,
    };
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Get pending events (copy)
   */
  getPendingEvents(): AGUIEvent[] {
    return this.buffer.map((b) => b.event);
  }

  /**
   * Check if there are pending events
   */
  hasPendingEvents(): boolean {
    return this.buffer.length > 0;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose of the batcher
   * Flushes any pending events before disposal
   */
  dispose(): void {
    if (this.buffer.length > 0) {
      this.flush('manual');
    }
    this.clearFlushTimer();
    this.removeAllListeners();
    this.buffer = [];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private isPriorityEvent(event: AGUIEvent): boolean {
    return this.priorityEvents.has(event.type);
  }

  private emitSingleEvent(event: AGUIEvent, reason: BatchMetadata['flushReason']): void {
    const now = new Date();

    // Create single-event batch
    const batch: EventBatch = {
      events: [event],
      metadata: {
        batchId: this.generateBatchId(),
        count: 1,
        firstEventTimestamp: event.timestamp,
        lastEventTimestamp: event.timestamp,
        flushedAt: now.toISOString(),
        flushReason: reason,
        batchDurationMs: 0,
      },
    };

    // Update metrics
    this.metrics.totalBatches++;
    this.metrics.flushReasons[reason] = (this.metrics.flushReasons[reason] || 0) + 1;

    // Emit
    this.emit('batch', batch);

    if (this.onFlushCallback) {
      this.onFlushCallback(batch);
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.buffer.length > 0) {
        this.flush('timeout');
      }
    }, this.batchTimeout);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private generateBatchId(): string {
    return `batch_${++this.batchCounter}_${Date.now().toString(36)}`;
  }

  private initializeMetrics(): BatcherMetrics {
    return {
      totalEvents: 0,
      totalBatches: 0,
      priorityEvents: 0,
      batchedEvents: 0,
      averageBatchSize: 0,
      flushReasons: {},
      enabled: this.enabled,
      currentBufferSize: 0,
    };
  }

  private updateAverageBatchSize(newBatchSize: number): void {
    const totalBatches = this.metrics.totalBatches;
    if (totalBatches === 1) {
      this.metrics.averageBatchSize = newBatchSize;
    } else {
      // Rolling average
      this.metrics.averageBatchSize =
        (this.metrics.averageBatchSize * (totalBatches - 1) + newBatchSize) / totalBatches;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new EventBatcher instance
 *
 * @param config - Batcher configuration
 * @returns EventBatcher instance
 *
 * @example
 * ```typescript
 * const batcher = createEventBatcher({
 *   batchSize: 10,
 *   batchTimeout: 50,
 *   priorityEvents: [AGUIEventType.RUN_STARTED, AGUIEventType.RUN_ERROR],
 *   onFlush: (batch) => {
 *     // Send batch over network
 *     socket.send(JSON.stringify(batch));
 *   }
 * });
 *
 * // Add events - will be batched
 * batcher.add(textContentEvent);
 * batcher.add(toolArgsEvent);
 *
 * // Priority events bypass batching
 * batcher.add(runStartedEvent); // Emitted immediately
 *
 * // Listen for batches
 * batcher.on('batch', (batch) => {
 *   console.log(`Batch ${batch.metadata.batchId}: ${batch.events.length} events`);
 * });
 * ```
 */
export function createEventBatcher(config: EventBatcherConfig = {}): EventBatcher {
  return new EventBatcher(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a batching wrapper for an event emitter
 * Intercepts events and batches them before forwarding
 */
export function withBatching<T extends EventEmitter>(
  emitter: T,
  batcherConfig: EventBatcherConfig = {}
): {
  batcher: EventBatcher;
  emitter: T;
  dispose: () => void;
} {
  const batcher = createEventBatcher(batcherConfig);

  // Forward batches to original emitter
  batcher.on('batch', (batch: EventBatch) => {
    emitter.emit('batch', batch);
  });

  return {
    batcher,
    emitter,
    dispose: () => {
      batcher.dispose();
    },
  };
}

/**
 * Serialize a batch for network transmission
 */
export function serializeBatch(batch: EventBatch, includeMetadata = true): string {
  if (includeMetadata) {
    return JSON.stringify(batch);
  }
  return JSON.stringify({ events: batch.events });
}

/**
 * Deserialize a batch from network transmission
 */
export function deserializeBatch(data: string): EventBatch {
  const parsed = safeJsonParse(data);

  // Handle batch without metadata
  if (!parsed.metadata) {
    return {
      events: parsed.events,
      metadata: {
        batchId: 'deserialized',
        count: parsed.events.length,
        firstEventTimestamp: parsed.events[0]?.timestamp ?? new Date().toISOString(),
        lastEventTimestamp: parsed.events[parsed.events.length - 1]?.timestamp ?? new Date().toISOString(),
        flushedAt: new Date().toISOString(),
        flushReason: 'manual',
        batchDurationMs: 0,
      },
    };
  }

  return parsed as EventBatch;
}

/**
 * Calculate optimal batch configuration based on network conditions
 */
export function calculateOptimalBatchConfig(options: {
  /** Network round-trip time in ms */
  rttMs: number;
  /** Expected events per second */
  eventsPerSecond: number;
  /** Maximum acceptable latency in ms */
  maxLatencyMs: number;
}): EventBatcherConfig {
  const { rttMs, eventsPerSecond, maxLatencyMs } = options;

  // Target: fill batch in half the max latency to allow for network transmission
  const targetBatchTimeMs = Math.max(10, Math.min(maxLatencyMs / 2, 100));

  // Calculate batch size based on expected throughput
  const batchSize = Math.max(1, Math.min(50, Math.floor(eventsPerSecond * (targetBatchTimeMs / 1000))));

  // Timeout should be slightly less than target to account for processing
  const batchTimeout = Math.max(10, targetBatchTimeMs - 5);

  return {
    batchSize,
    batchTimeout,
    enabled: true,
  };
}

/**
 * Get default priority events for AG-UI protocol
 */
export function getDefaultPriorityEvents(): AGUIEventType[] {
  return [...DEFAULT_CONFIG.priorityEvents];
}
