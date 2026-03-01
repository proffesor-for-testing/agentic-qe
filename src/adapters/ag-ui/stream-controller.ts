/**
 * AG-UI Stream Controller
 *
 * Provides flow control and cancellation handling for AG-UI event streaming.
 * Wraps EventAdapter with AbortSignal support, token buffering, and graceful shutdown.
 *
 * @module adapters/ag-ui/stream-controller
 */

import { EventEmitter } from 'events';
import type { AGUIEvent, AGUIEventType, RunFinishedEvent } from './event-types.js';
import type { EventAdapter } from './event-adapter.js';
import type { BackpressureHandler, BackpressureMetrics } from './backpressure-handler.js';
import { LoggerFactory } from '../../logging/index.js';

const logger = LoggerFactory.create('ag-ui-stream-controller');

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Stream controller configuration
 */
export interface StreamControllerConfig {
  /** EventAdapter instance to wrap */
  adapter: EventAdapter;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Callback invoked when stream is cancelled */
  onCancel?: () => Promise<void> | void;
  /** Callback invoked when stream ends */
  onEnd?: (reason: 'success' | 'cancelled' | 'error') => Promise<void> | void;
  /** Callback invoked on stream error */
  onError?: (error: Error) => Promise<void> | void;
  /** Token buffering interval in milliseconds (default: 50ms for 20fps) */
  bufferInterval?: number;
  /** Maximum buffer size before flushing (default: 10) */
  maxBufferSize?: number;
  /** Optional backpressure handler */
  backpressureHandler?: BackpressureHandler;
  /** Whether to automatically emit RUN_FINISHED on cancel */
  emitFinishOnCancel?: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  bufferInterval: 50, // 50ms = 20fps
  maxBufferSize: 10,
  emitFinishOnCancel: true,
};

/**
 * Stream state
 */
export type StreamState = 'idle' | 'streaming' | 'paused' | 'cancelled' | 'ended' | 'error';

/**
 * Stream metrics
 */
export interface StreamMetrics {
  /** Total events processed */
  totalEvents: number;
  /** Events buffered and flushed */
  bufferedEvents: number;
  /** Events dropped (if backpressure applied) */
  droppedEvents: number;
  /** Average latency in milliseconds */
  averageLatencyMs: number;
  /** Peak latency in milliseconds */
  peakLatencyMs: number;
  /** Stream start time */
  startTime: number;
  /** Stream duration in milliseconds */
  durationMs: number;
  /** Buffer flush count */
  flushCount: number;
}

/**
 * Buffered event with metadata
 */
interface BufferedEvent {
  event: AGUIEvent;
  timestamp: number;
}

// ============================================================================
// Stream Controller Implementation
// ============================================================================

/**
 * AG-UI Stream Controller
 *
 * Wraps an EventAdapter to provide:
 * - AbortController/AbortSignal based cancellation
 * - Token buffering at configurable intervals
 * - Graceful shutdown on client disconnect
 * - Integration with backpressure handling
 */
export class StreamController extends EventEmitter {
  private readonly adapter: EventAdapter;
  private readonly signal?: AbortSignal;
  private readonly onCancelCallback?: () => Promise<void> | void;
  private readonly onEndCallback?: (reason: 'success' | 'cancelled' | 'error') => Promise<void> | void;
  private readonly onErrorCallback?: (error: Error) => Promise<void> | void;
  private readonly bufferInterval: number;
  private readonly maxBufferSize: number;
  private readonly backpressureHandler?: BackpressureHandler;
  private readonly emitFinishOnCancel: boolean;

  private state: StreamState = 'idle';
  private buffer: BufferedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private abortHandler: (() => void) | null = null;
  private metrics: StreamMetrics;

  constructor(config: StreamControllerConfig) {
    super();

    this.adapter = config.adapter;
    this.signal = config.signal;
    this.onCancelCallback = config.onCancel;
    this.onEndCallback = config.onEnd;
    this.onErrorCallback = config.onError;
    this.bufferInterval = config.bufferInterval ?? DEFAULT_CONFIG.bufferInterval;
    this.maxBufferSize = config.maxBufferSize ?? DEFAULT_CONFIG.maxBufferSize;
    this.backpressureHandler = config.backpressureHandler;
    this.emitFinishOnCancel = config.emitFinishOnCancel ?? DEFAULT_CONFIG.emitFinishOnCancel;

    this.metrics = this.initializeMetrics();

    this.setupSignalHandler();
    this.setupAdapterListeners();
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Start the stream
   */
  start(): void {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start stream in state: ${this.state}`);
    }

    this.state = 'streaming';
    this.metrics.startTime = Date.now();
    this.emit('start');
  }

  /**
   * Pause the stream (buffers events but doesn't emit)
   */
  pause(): void {
    if (this.state !== 'streaming') {
      return;
    }

    this.state = 'paused';
    this.emit('pause');
  }

  /**
   * Resume the stream
   */
  resume(): void {
    if (this.state !== 'paused') {
      return;
    }

    this.state = 'streaming';
    this.emit('resume');

    // Flush any buffered events
    this.flush();
  }

  /**
   * Cancel the stream
   */
  async cancel(): Promise<void> {
    if (this.state === 'cancelled' || this.state === 'ended' || this.state === 'error') {
      return;
    }

    this.state = 'cancelled';
    this.clearFlushTimer();

    // Call cancel callback
    if (this.onCancelCallback) {
      try {
        await this.onCancelCallback();
      } catch (error) {
        this.emit('error', error);
      }
    }

    // Emit RUN_FINISHED with cancelled outcome
    if (this.emitFinishOnCancel) {
      const runId = this.adapter.getCurrentRunId();
      if (runId) {
        const finishEvent = this.adapter.emitRunFinished(runId, 'cancelled');
        this.emit('event', finishEvent);
      }
    }

    // Flush remaining buffer
    this.flush();

    this.emit('cancel');

    // Call end callback
    if (this.onEndCallback) {
      try {
        await this.onEndCallback('cancelled');
      } catch (error) {
        this.emit('error', error);
      }
    }
  }

  /**
   * End the stream gracefully
   */
  async end(reason: 'success' | 'error' = 'success'): Promise<void> {
    if (this.state === 'cancelled' || this.state === 'ended' || this.state === 'error') {
      return;
    }

    this.state = reason === 'error' ? 'error' : 'ended';
    this.clearFlushTimer();

    // Flush remaining buffer
    this.flush();

    this.metrics.durationMs = Date.now() - this.metrics.startTime;
    this.emit('end', reason);

    // Call end callback
    if (this.onEndCallback) {
      try {
        await this.onEndCallback(reason);
      } catch (error) {
        this.emit('error', error);
      }
    }
  }

  /**
   * Handle error in stream
   */
  async handleError(error: Error): Promise<void> {
    if (this.state === 'cancelled' || this.state === 'ended' || this.state === 'error') {
      return;
    }

    this.state = 'error';
    this.clearFlushTimer();

    // Call error callback
    if (this.onErrorCallback) {
      try {
        await this.onErrorCallback(error);
      } catch (callbackError) {
        // Emit original error, not callback error
        logger.debug('Error callback threw during error handling', { error: callbackError instanceof Error ? callbackError.message : String(callbackError) });
      }
    }

    this.emit('error', error);
    await this.end('error');
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * Push an event to the stream
   * Returns false if backpressure is applied and event should not be produced
   */
  push(event: AGUIEvent): boolean {
    if (this.state !== 'streaming' && this.state !== 'paused') {
      return false;
    }

    // Check backpressure
    if (this.backpressureHandler) {
      const accepted = this.backpressureHandler.push(event);
      if (!accepted) {
        this.metrics.droppedEvents++;
        return false;
      }
    }

    const bufferedEvent: BufferedEvent = {
      event,
      timestamp: Date.now(),
    };

    this.buffer.push(bufferedEvent);
    this.metrics.bufferedEvents++;
    this.metrics.totalEvents++;

    // Schedule flush if not already scheduled
    if (!this.flushTimer && this.state === 'streaming') {
      this.scheduleFlush();
    }

    // Force flush if buffer exceeds max size
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }

    return true;
  }

  /**
   * Flush the event buffer
   */
  flush(): void {
    this.clearFlushTimer();

    if (this.buffer.length === 0) {
      return;
    }

    const now = Date.now();
    const eventsToFlush = [...this.buffer];
    this.buffer = [];
    this.metrics.flushCount++;

    // Calculate latency metrics
    for (const { event, timestamp } of eventsToFlush) {
      const latency = now - timestamp;
      this.updateLatencyMetrics(latency);

      // Emit event
      if (this.state === 'streaming' || this.state === 'cancelled' || this.state === 'ended') {
        this.emit('event', event);
      }
    }

    this.emit('flush', eventsToFlush.length);
  }

  // ============================================================================
  // State and Metrics
  // ============================================================================

  /**
   * Get current stream state
   */
  getState(): StreamState {
    return this.state;
  }

  /**
   * Check if stream is active
   */
  isActive(): boolean {
    return this.state === 'streaming' || this.state === 'paused';
  }

  /**
   * Check if stream is cancelled
   */
  isCancelled(): boolean {
    return this.state === 'cancelled';
  }

  /**
   * Get stream metrics
   */
  getMetrics(): Readonly<StreamMetrics> {
    return {
      ...this.metrics,
      durationMs: this.state === 'streaming' || this.state === 'paused'
        ? Date.now() - this.metrics.startTime
        : this.metrics.durationMs,
    };
  }

  /**
   * Get buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Get the wrapped adapter
   */
  getAdapter(): EventAdapter {
    return this.adapter;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose of the stream controller
   */
  dispose(): void {
    this.clearFlushTimer();
    this.removeAbortHandler();
    this.removeAllListeners();
    this.buffer = [];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setupSignalHandler(): void {
    if (!this.signal) {
      return;
    }

    // Check if already aborted
    if (this.signal.aborted) {
      // Use setImmediate to allow constructor to complete
      setImmediate(() => this.cancel());
      return;
    }

    // Setup abort handler
    this.abortHandler = () => {
      this.cancel();
    };

    this.signal.addEventListener('abort', this.abortHandler);
  }

  private removeAbortHandler(): void {
    if (this.signal && this.abortHandler) {
      this.signal.removeEventListener('abort', this.abortHandler);
      this.abortHandler = null;
    }
  }

  private setupAdapterListeners(): void {
    // Forward events from adapter to stream
    this.adapter.on('event', (event: AGUIEvent) => {
      this.push(event);
    });

    // Forward errors
    this.adapter.on('error', (error: Error) => {
      this.handleError(error);
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.state === 'streaming') {
        this.flush();
      }
    }, this.bufferInterval);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private initializeMetrics(): StreamMetrics {
    return {
      totalEvents: 0,
      bufferedEvents: 0,
      droppedEvents: 0,
      averageLatencyMs: 0,
      peakLatencyMs: 0,
      startTime: 0,
      durationMs: 0,
      flushCount: 0,
    };
  }

  private updateLatencyMetrics(latency: number): void {
    // Update peak
    if (latency > this.metrics.peakLatencyMs) {
      this.metrics.peakLatencyMs = latency;
    }

    // Update rolling average
    const totalSamples = this.metrics.flushCount || 1;
    this.metrics.averageLatencyMs =
      (this.metrics.averageLatencyMs * (totalSamples - 1) + latency) / totalSamples;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new StreamController instance
 *
 * @param config - Stream controller configuration
 * @returns StreamController instance
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 * const stream = createStreamController({
 *   adapter: eventAdapter,
 *   signal: controller.signal,
 *   onCancel: async () => {
 *     await agent.abort();
 *   }
 * });
 *
 * stream.start();
 *
 * // Later, to cancel:
 * controller.abort();
 * // -> onCancel called
 * // -> RUN_FINISHED emitted with reason: 'cancelled'
 * // -> Stream closed gracefully
 * ```
 */
export function createStreamController(config: StreamControllerConfig): StreamController {
  return new StreamController(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create an async iterator from a stream controller
 * Allows using for-await-of syntax to consume events
 */
export async function* streamEvents(
  controller: StreamController
): AsyncGenerator<AGUIEvent, void, unknown> {
  const events: AGUIEvent[] = [];
  let resolveNext: ((value: void) => void) | null = null;
  let done = false;

  const eventHandler = (event: AGUIEvent) => {
    events.push(event);
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  };

  const endHandler = () => {
    done = true;
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  };

  controller.on('event', eventHandler);
  controller.on('end', endHandler);
  controller.on('cancel', endHandler);

  try {
    while (!done || events.length > 0) {
      if (events.length > 0) {
        yield events.shift()!;
      } else if (!done) {
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    }
  } finally {
    controller.off('event', eventHandler);
    controller.off('end', endHandler);
    controller.off('cancel', endHandler);
  }
}

/**
 * Create a transform stream from a stream controller
 * For integration with Node.js streams API
 */
export function createEventTransform(
  controller: StreamController
): {
  readable: ReadableStream<AGUIEvent>;
  writable: WritableStream<AGUIEvent>;
} {
  const readable = new ReadableStream<AGUIEvent>({
    start(streamController) {
      controller.on('event', (event: AGUIEvent) => {
        streamController.enqueue(event);
      });

      controller.on('end', () => {
        streamController.close();
      });

      controller.on('cancel', () => {
        streamController.close();
      });

      controller.on('error', (error: Error) => {
        streamController.error(error);
      });
    },
  });

  const writable = new WritableStream<AGUIEvent>({
    write(event) {
      controller.push(event);
    },
    close() {
      controller.end();
    },
    abort(reason) {
      controller.cancel();
    },
  });

  return { readable, writable };
}
