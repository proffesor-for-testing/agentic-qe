/**
 * AG-UI Backpressure Handler
 *
 * Detects and handles backpressure when client consumes events slower than producer.
 * Provides configurable strategies for handling buffer overflow.
 *
 * @module adapters/ag-ui/backpressure-handler
 */

import { EventEmitter } from 'events';
import type { AGUIEvent, AGUIEventType } from './event-types.js';
import { getEventCategory, type AGUIEventCategory } from './event-types.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Backpressure strategy
 *
 * - `buffer`: Keep buffering up to maxBufferSize (default)
 * - `drop-non-critical`: Drop TEXT_MESSAGE_CONTENT, keep lifecycle events
 * - `pause-producer`: Signal producer to slow down
 */
export type BackpressureStrategy = 'buffer' | 'drop-non-critical' | 'pause-producer';

/**
 * Backpressure handler configuration
 */
export interface BackpressureHandlerConfig {
  /** Maximum buffer size before backpressure is applied (default: 100) */
  maxBufferSize?: number;
  /** Strategy for handling backpressure (default: 'buffer') */
  strategy?: BackpressureStrategy;
  /** Callback when backpressure is detected */
  onPressure?: (metrics: BackpressureMetrics) => void;
  /** Callback when backpressure is relieved */
  onRelieve?: (metrics: BackpressureMetrics) => void;
  /** High watermark percentage to trigger pressure (default: 80) */
  highWatermark?: number;
  /** Low watermark percentage to relieve pressure (default: 50) */
  lowWatermark?: number;
  /** Maximum memory in bytes for buffer (default: 10MB) */
  maxMemoryBytes?: number;
  /** Event priority configuration */
  eventPriority?: EventPriorityConfig;
}

/**
 * Event priority configuration for drop-non-critical strategy
 */
export interface EventPriorityConfig {
  /** Event types that are always kept (critical) */
  critical?: AGUIEventType[];
  /** Event types that can be dropped under pressure */
  droppable?: AGUIEventType[];
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<BackpressureHandlerConfig, 'onPressure' | 'onRelieve' | 'eventPriority'>> = {
  maxBufferSize: 100,
  strategy: 'buffer',
  highWatermark: 80,
  lowWatermark: 50,
  maxMemoryBytes: 10 * 1024 * 1024, // 10MB
};

/**
 * Default critical event types (never dropped)
 */
const DEFAULT_CRITICAL_EVENTS: AGUIEventType[] = [
  'RUN_STARTED' as AGUIEventType,
  'RUN_FINISHED' as AGUIEventType,
  'RUN_ERROR' as AGUIEventType,
  'STEP_STARTED' as AGUIEventType,
  'STEP_FINISHED' as AGUIEventType,
  'TOOL_CALL_START' as AGUIEventType,
  'TOOL_CALL_END' as AGUIEventType,
  'TOOL_CALL_RESULT' as AGUIEventType,
  'STATE_SNAPSHOT' as AGUIEventType,
  'MESSAGES_SNAPSHOT' as AGUIEventType,
];

/**
 * Default droppable event types (can be dropped under pressure)
 */
const DEFAULT_DROPPABLE_EVENTS: AGUIEventType[] = [
  'TEXT_MESSAGE_CONTENT' as AGUIEventType,
  'TOOL_CALL_ARGS' as AGUIEventType,
  'STATE_DELTA' as AGUIEventType,
  'ACTIVITY_DELTA' as AGUIEventType,
];

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Backpressure metrics
 */
export interface BackpressureMetrics {
  /** Current buffer size */
  bufferSize: number;
  /** Maximum buffer size */
  maxBufferSize: number;
  /** Buffer utilization percentage */
  utilizationPercent: number;
  /** Total events dropped */
  droppedCount: number;
  /** Total events processed */
  processedCount: number;
  /** Number of times producer was paused */
  pauseCount: number;
  /** Total time spent in paused state (ms) */
  totalPauseTimeMs: number;
  /** Whether currently under pressure */
  underPressure: boolean;
  /** Estimated buffer memory usage in bytes */
  memoryUsageBytes: number;
  /** Events dropped by type */
  droppedByType: Record<string, number>;
  /** Current strategy */
  strategy: BackpressureStrategy;
}

/**
 * Buffered event with metadata
 */
interface BufferedBackpressureEvent {
  event: AGUIEvent;
  size: number;
  timestamp: number;
}

// ============================================================================
// Backpressure Handler Implementation
// ============================================================================

/**
 * AG-UI Backpressure Handler
 *
 * Monitors event buffer and applies backpressure strategies when needed.
 */
export class BackpressureHandler extends EventEmitter {
  private readonly maxBufferSize: number;
  private readonly strategy: BackpressureStrategy;
  private readonly onPressureCallback?: (metrics: BackpressureMetrics) => void;
  private readonly onRelieveCallback?: (metrics: BackpressureMetrics) => void;
  private readonly highWatermark: number;
  private readonly lowWatermark: number;
  private readonly maxMemoryBytes: number;
  private readonly criticalEvents: Set<AGUIEventType>;
  private readonly droppableEvents: Set<AGUIEventType>;

  private buffer: BufferedBackpressureEvent[] = [];
  private memoryUsage: number = 0;
  private underPressure: boolean = false;
  private producerPaused: boolean = false;
  private pauseStartTime: number = 0;
  private metrics: BackpressureMetrics;

  constructor(config: BackpressureHandlerConfig = {}) {
    super();

    this.maxBufferSize = config.maxBufferSize ?? DEFAULT_CONFIG.maxBufferSize;
    this.strategy = config.strategy ?? DEFAULT_CONFIG.strategy;
    this.onPressureCallback = config.onPressure;
    this.onRelieveCallback = config.onRelieve;
    this.highWatermark = config.highWatermark ?? DEFAULT_CONFIG.highWatermark;
    this.lowWatermark = config.lowWatermark ?? DEFAULT_CONFIG.lowWatermark;
    this.maxMemoryBytes = config.maxMemoryBytes ?? DEFAULT_CONFIG.maxMemoryBytes;

    this.criticalEvents = new Set(
      config.eventPriority?.critical ?? DEFAULT_CRITICAL_EVENTS
    );
    this.droppableEvents = new Set(
      config.eventPriority?.droppable ?? DEFAULT_DROPPABLE_EVENTS
    );

    this.metrics = this.initializeMetrics();
  }

  // ============================================================================
  // Main API
  // ============================================================================

  /**
   * Push an event to the handler
   *
   * @returns true if event was accepted, false if dropped or producer should pause
   */
  push(event: AGUIEvent): boolean {
    const eventSize = this.estimateEventSize(event);
    this.metrics.processedCount++;

    // Check memory limit
    if (this.memoryUsage + eventSize > this.maxMemoryBytes) {
      return this.handleMemoryPressure(event, eventSize);
    }

    // Check buffer size limit
    if (this.buffer.length >= this.maxBufferSize) {
      return this.handleBufferFull(event, eventSize);
    }

    // Add to buffer first
    this.addToBuffer(event, eventSize);

    // Check high watermark after adding (to accurately reflect new state)
    const utilization = (this.buffer.length / this.maxBufferSize) * 100;
    if (utilization >= this.highWatermark && !this.underPressure) {
      this.enterPressureState();
    }

    return true;
  }

  /**
   * Pull events from the buffer
   *
   * @param count - Number of events to pull (default: all)
   * @returns Array of events
   */
  pull(count?: number): AGUIEvent[] {
    const toPull = count ?? this.buffer.length;
    const events: AGUIEvent[] = [];

    for (let i = 0; i < toPull && this.buffer.length > 0; i++) {
      const buffered = this.buffer.shift()!;
      this.memoryUsage -= buffered.size;
      events.push(buffered.event);
    }

    // Check low watermark
    const utilization = (this.buffer.length / this.maxBufferSize) * 100;
    if (utilization <= this.lowWatermark && this.underPressure) {
      this.exitPressureState();
    }

    return events;
  }

  /**
   * Pull a single event from the buffer
   */
  pullOne(): AGUIEvent | undefined {
    const events = this.pull(1);
    return events[0];
  }

  /**
   * Check if buffer has events
   */
  hasEvents(): boolean {
    return this.buffer.length > 0;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = [];
    this.memoryUsage = 0;

    if (this.underPressure) {
      this.exitPressureState();
    }
  }

  // ============================================================================
  // State and Metrics
  // ============================================================================

  /**
   * Get current metrics
   */
  getMetrics(): Readonly<BackpressureMetrics> {
    return {
      ...this.metrics,
      bufferSize: this.buffer.length,
      utilizationPercent: (this.buffer.length / this.maxBufferSize) * 100,
      underPressure: this.underPressure,
      memoryUsageBytes: this.memoryUsage,
    };
  }

  /**
   * Check if under pressure
   */
  isUnderPressure(): boolean {
    return this.underPressure;
  }

  /**
   * Check if producer is paused
   */
  isProducerPaused(): boolean {
    return this.producerPaused;
  }

  /**
   * Get buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Get memory usage
   */
  getMemoryUsage(): number {
    return this.memoryUsage;
  }

  /**
   * Signal that producer can resume (for pause-producer strategy)
   */
  resumeProducer(): void {
    if (!this.producerPaused) {
      return;
    }

    const pauseDuration = Date.now() - this.pauseStartTime;
    this.metrics.totalPauseTimeMs += pauseDuration;
    this.producerPaused = false;
    this.pauseStartTime = 0;

    this.emit('resume');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleMemoryPressure(event: AGUIEvent, eventSize: number): boolean {
    return this.applyBackpressureStrategy(event, eventSize, 'memory');
  }

  private handleBufferFull(event: AGUIEvent, eventSize: number): boolean {
    return this.applyBackpressureStrategy(event, eventSize, 'buffer');
  }

  private applyBackpressureStrategy(
    event: AGUIEvent,
    eventSize: number,
    reason: 'memory' | 'buffer'
  ): boolean {
    switch (this.strategy) {
      case 'buffer':
        // In buffer strategy, we still accept if it's a critical event
        if (this.isCriticalEvent(event)) {
          this.addToBuffer(event, eventSize);
          return true;
        }
        // Otherwise, reject
        this.recordDropped(event);
        return false;

      case 'drop-non-critical':
        // Drop droppable events, keep critical
        if (this.isDroppableEvent(event)) {
          this.recordDropped(event);
          return false;
        }
        // Critical events are kept even under pressure
        this.addToBuffer(event, eventSize);
        return true;

      case 'pause-producer':
        // Signal producer to pause
        if (!this.producerPaused) {
          this.producerPaused = true;
          this.pauseStartTime = Date.now();
          this.metrics.pauseCount++;
          this.emit('pause');
        }
        // Still reject the current event
        return false;

      default:
        return false;
    }
  }

  private addToBuffer(event: AGUIEvent, size: number): void {
    this.buffer.push({
      event,
      size,
      timestamp: Date.now(),
    });
    this.memoryUsage += size;
  }

  private recordDropped(event: AGUIEvent): void {
    this.metrics.droppedCount++;
    const eventType = event.type as string;
    this.metrics.droppedByType[eventType] = (this.metrics.droppedByType[eventType] || 0) + 1;
    this.emit('drop', event);
  }

  private isCriticalEvent(event: AGUIEvent): boolean {
    return this.criticalEvents.has(event.type);
  }

  private isDroppableEvent(event: AGUIEvent): boolean {
    return this.droppableEvents.has(event.type);
  }

  private enterPressureState(): void {
    this.underPressure = true;
    this.emit('pressure', this.getMetrics());

    if (this.onPressureCallback) {
      this.onPressureCallback(this.getMetrics());
    }
  }

  private exitPressureState(): void {
    this.underPressure = false;

    // Resume producer if paused
    if (this.producerPaused) {
      this.resumeProducer();
    }

    this.emit('relieve', this.getMetrics());

    if (this.onRelieveCallback) {
      this.onRelieveCallback(this.getMetrics());
    }
  }

  private estimateEventSize(event: AGUIEvent): number {
    // Estimate size based on JSON serialization
    try {
      return JSON.stringify(event).length * 2; // UTF-16 characters = 2 bytes
    } catch {
      return 1024; // Default estimate for non-serializable events
    }
  }

  private initializeMetrics(): BackpressureMetrics {
    return {
      bufferSize: 0,
      maxBufferSize: this.maxBufferSize,
      utilizationPercent: 0,
      droppedCount: 0,
      processedCount: 0,
      pauseCount: 0,
      totalPauseTimeMs: 0,
      underPressure: false,
      memoryUsageBytes: 0,
      droppedByType: {},
      strategy: this.strategy,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new BackpressureHandler instance
 *
 * @param config - Backpressure handler configuration
 * @returns BackpressureHandler instance
 *
 * @example
 * ```typescript
 * const handler = createBackpressureHandler({
 *   maxBufferSize: 100,
 *   strategy: 'drop-non-critical',
 *   onPressure: (metrics) => {
 *     console.log(`Buffer: ${metrics.bufferSize}, Dropped: ${metrics.droppedCount}`);
 *   }
 * });
 *
 * // Producer emits faster than consumer
 * const accepted = handler.push(event); // Returns false if buffer full
 * ```
 */
export function createBackpressureHandler(
  config: BackpressureHandlerConfig = {}
): BackpressureHandler {
  return new BackpressureHandler(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a backpressure-aware event consumer
 * Automatically pulls events at a specified rate
 */
export function createBackpressureConsumer(
  handler: BackpressureHandler,
  onEvent: (event: AGUIEvent) => void | Promise<void>,
  options: {
    pullInterval?: number; // Default: 10ms
    batchSize?: number; // Default: 10
  } = {}
): {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
} {
  const pullInterval = options.pullInterval ?? 10;
  const batchSize = options.batchSize ?? 10;
  let running = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const pull = async () => {
    if (!running) return;

    const events = handler.pull(batchSize);
    for (const event of events) {
      try {
        await onEvent(event);
      } catch {
        // Continue processing other events
      }
    }
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      timer = setInterval(pull, pullInterval);
    },
    stop: () => {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    isRunning: () => running,
  };
}

/**
 * Determine if an event is critical based on category
 */
export function isCriticalEventCategory(category: AGUIEventCategory): boolean {
  return category === 'lifecycle' || category === 'tool';
}

/**
 * Get recommended strategy based on use case
 */
export function getRecommendedStrategy(useCase: 'realtime' | 'reliable' | 'balanced'): BackpressureStrategy {
  switch (useCase) {
    case 'realtime':
      return 'drop-non-critical'; // Prioritize low latency
    case 'reliable':
      return 'pause-producer'; // Prioritize delivery
    case 'balanced':
    default:
      return 'buffer'; // Default balanced approach
  }
}
