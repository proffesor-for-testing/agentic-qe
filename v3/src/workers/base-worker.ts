/**
 * Agentic QE v3 - Base Worker Implementation
 * ADR-014: Background Workers for QE Monitoring
 *
 * Abstract base class for all QE background workers.
 * Provides common functionality for scheduling, retries, and health tracking.
 */

import { toError } from '../shared/error-utils.js';
import {
  Worker,
  WorkerConfig,
  WorkerStatus,
  WorkerResult,
  WorkerContext,
  WorkerHealth,
  WorkerMetrics,
  WorkerFinding,
  WorkerRecommendation,
} from './interfaces';

/**
 * Abstract base class for QE background workers
 */
export abstract class BaseWorker implements Worker {
  protected _status: WorkerStatus = 'idle';
  protected _lastResult?: WorkerResult;
  protected _lastRunAt?: Date;
  protected _nextRunAt?: Date;

  // Health tracking
  protected _totalExecutions = 0;
  protected _successfulExecutions = 0;
  protected _failedExecutions = 0;
  protected _executionDurations: number[] = [];
  protected _recentResults: Array<{
    timestamp: Date;
    success: boolean;
    durationMs: number;
  }> = [];

  constructor(public readonly config: WorkerConfig) {}

  get status(): WorkerStatus {
    return this._status;
  }

  get lastResult(): WorkerResult | undefined {
    return this._lastResult;
  }

  get lastRunAt(): Date | undefined {
    return this._lastRunAt;
  }

  get nextRunAt(): Date | undefined {
    return this._nextRunAt;
  }

  /**
   * Initialize the worker
   * Override in subclasses for custom initialization
   */
  async initialize(): Promise<void> {
    this._status = 'idle';
    this._nextRunAt = new Date(Date.now() + this.config.intervalMs);
  }

  /**
   * Execute the worker's main task with retry logic
   */
  async execute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    this._status = 'running';
    this._lastRunAt = new Date();
    this._totalExecutions++;

    let lastError: Error | undefined;
    let result: WorkerResult | undefined;

    // Retry loop
    for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
      try {
        // Check for abort
        if (context.signal.aborted) {
          throw new Error('Worker execution aborted');
        }

        // Execute with timeout
        result = await this.executeWithTimeout(
          () => this.doExecute(context),
          this.config.timeoutMs,
          context.signal
        );

        break; // Success, exit retry loop
      } catch (error) {
        lastError = toError(error);
        context.logger.warn(
          `Worker ${this.config.id} attempt ${attempt + 1} failed: ${lastError.message}`
        );

        if (attempt < this.config.retryCount) {
          await this.delay(this.config.retryDelayMs);
        }
      }
    }

    const durationMs = Date.now() - startTime;

    if (result) {
      this._successfulExecutions++;
      this._lastResult = result;
    } else {
      this._failedExecutions++;
      result = this.createErrorResult(lastError!, durationMs);
      this._lastResult = result;
    }

    // Track execution metrics
    this._executionDurations.push(durationMs);
    if (this._executionDurations.length > 100) {
      this._executionDurations.shift();
    }

    this._recentResults.push({
      timestamp: new Date(),
      success: result.success,
      durationMs,
    });
    if (this._recentResults.length > 5) {
      this._recentResults.shift();
    }

    // Schedule next run
    this._nextRunAt = new Date(Date.now() + this.config.intervalMs);
    this._status = result.success ? 'idle' : 'error';

    // Publish result event
    await context.eventBus.publish({
      type: 'worker.executed',
      workerId: this.config.id,
      timestamp: new Date(),
      payload: {
        success: result.success,
        durationMs,
        findingsCount: result.findings.length,
        healthScore: result.metrics.healthScore,
      },
    });

    return result;
  }

  /**
   * Abstract method - implement in subclasses
   * Contains the actual worker logic
   */
  protected abstract doExecute(context: WorkerContext): Promise<WorkerResult>;

  /**
   * Pause the worker
   */
  pause(): void {
    if (this._status !== 'stopped') {
      this._status = 'paused';
    }
  }

  /**
   * Resume the worker
   */
  resume(): void {
    if (this._status === 'paused') {
      this._status = 'idle';
    }
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    this._status = 'stopped';
  }

  /**
   * Get worker health status
   */
  getHealth(): WorkerHealth {
    const avgDurationMs =
      this._executionDurations.length > 0
        ? this._executionDurations.reduce((a, b) => a + b, 0) /
          this._executionDurations.length
        : 0;

    const successRate =
      this._totalExecutions > 0
        ? this._successfulExecutions / this._totalExecutions
        : 1;

    return {
      status: this._status,
      healthScore: Math.round(successRate * 100),
      totalExecutions: this._totalExecutions,
      successfulExecutions: this._successfulExecutions,
      failedExecutions: this._failedExecutions,
      avgDurationMs: Math.round(avgDurationMs),
      recentResults: [...this._recentResults],
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Execute a function with timeout
   */
  protected async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Worker execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new Error('Worker execution aborted'));
      };

      signal.addEventListener('abort', abortHandler, { once: true });

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          signal.removeEventListener('abort', abortHandler);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          signal.removeEventListener('abort', abortHandler);
          reject(error);
        });
    });
  }

  /**
   * Create an error result
   */
  protected createErrorResult(error: Error, durationMs: number): WorkerResult {
    return {
      workerId: this.config.id,
      timestamp: new Date(),
      durationMs,
      success: false,
      error: error.message,
      metrics: {
        itemsAnalyzed: 0,
        issuesFound: 0,
        healthScore: 0,
        trend: 'degrading',
        domainMetrics: {},
      },
      findings: [],
      recommendations: [],
    };
  }

  /**
   * Create a successful result
   */
  protected createResult(
    durationMs: number,
    metrics: WorkerMetrics,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): WorkerResult {
    return {
      workerId: this.config.id,
      timestamp: new Date(),
      durationMs,
      success: true,
      metrics,
      findings,
      recommendations,
    };
  }

  /**
   * Delay helper
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate a unique ID
   */
  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
