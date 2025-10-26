/**
 * Base Streaming Handler
 *
 * Provides AsyncGenerator-based streaming for real-time progress updates.
 * Supports for-await-of compatibility and incremental result emission.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

export interface StreamEvent {
  type: 'progress' | 'result' | 'error' | 'complete';
  timestamp: number;
  data?: any;
  percent?: number;
  message?: string;
  error?: Error;
  metadata?: Record<string, any>;
}

/**
 * Base class for all streaming handlers
 * Provides AsyncGenerator pattern for progressive result emission
 */
export abstract class BaseStreamHandler {
  protected startTime: number = 0;
  protected cancelled: boolean = false;

  /**
   * Execute task with real-time streaming updates
   * Returns AsyncGenerator for for-await-of compatibility
   *
   * @example
   * ```typescript
   * const handler = new TestExecuteStreamHandler();
   * for await (const event of handler.execute(params)) {
   *   if (event.type === 'progress') {
   *     console.log(`${event.percent}% - ${event.message}`);
   *   } else if (event.type === 'result') {
   *     console.log('Result:', event.data);
   *   }
   * }
   * ```
   */
  async *execute(params: any): AsyncGenerator<StreamEvent, void, unknown> {
    this.startTime = Date.now();
    this.cancelled = false;

    try {
      // Emit start event
      yield this.startEvent();

      // Process task (implemented by subclass)
      yield* this.processTask(params);

      // Emit completion event
      yield this.completeEvent();
    } catch (error) {
      // Emit error event
      yield this.errorEvent(error as Error);
      throw error;
    }
  }

  /**
   * Process task with incremental progress updates
   * Must be implemented by subclass
   */
  protected abstract processTask(params: any): AsyncGenerator<StreamEvent, void, unknown>;

  /**
   * Cancel streaming operation
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Check if operation was cancelled
   */
  protected isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Create start event
   */
  protected startEvent(message: string = 'Starting task...'): StreamEvent {
    return {
      type: 'progress',
      timestamp: Date.now(),
      percent: 0,
      message
    };
  }

  /**
   * Create progress event
   */
  protected progressEvent(
    percent: number,
    message: string,
    metadata?: Record<string, any>
  ): StreamEvent {
    return {
      type: 'progress',
      timestamp: Date.now(),
      percent: Math.min(100, Math.max(0, percent)),
      message,
      metadata
    };
  }

  /**
   * Create result event
   */
  protected resultEvent(data: any, metadata?: Record<string, any>): StreamEvent {
    return {
      type: 'result',
      timestamp: Date.now(),
      data,
      metadata
    };
  }

  /**
   * Create completion event
   */
  protected completeEvent(message: string = 'Task completed'): StreamEvent {
    const duration = Date.now() - this.startTime;
    return {
      type: 'complete',
      timestamp: Date.now(),
      percent: 100,
      message,
      metadata: {
        executionTime: duration,
        executionTimeFormatted: this.formatDuration(duration)
      }
    };
  }

  /**
   * Create error event
   */
  protected errorEvent(error: Error, message?: string): StreamEvent {
    return {
      type: 'error',
      timestamp: Date.now(),
      error,
      message: message || error.message,
      metadata: {
        errorType: error.constructor.name,
        stack: error.stack
      }
    };
  }

  /**
   * Calculate progress percentage
   */
  protected calculateProgress(current: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((current / total) * 100);
  }

  /**
   * Format duration in human-readable format
   */
  protected formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else if (seconds > 0) {
      return `${seconds}s`;
    } else {
      return `${ms}ms`;
    }
  }

  /**
   * Sleep utility for testing/throttling
   */
  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
