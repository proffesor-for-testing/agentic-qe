import { EventEmitter } from 'events';

/**
 * Priority levels for queue operations
 */
export enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4
}

/**
 * Queue operation interface
 */
export interface QueueOperation<T = any> {
  id: string;
  operation: () => Promise<T>;
  priority: Priority;
  timeout?: number;
  retries?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
  onTimeout?: () => void;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Queue operation result
 */
export interface OperationResult<T = any> {
  id: string;
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
  retryCount: number;
  completedAt: Date;
}

/**
 * Queue configuration options
 */
export interface QueueConfig {
  concurrency?: number;
  defaultTimeout?: number;
  defaultRetries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  retryBackoffFactor?: number;
  enableMetrics?: boolean;
  gracefulShutdownTimeout?: number;
}

/**
 * Queue metrics interface
 */
export interface QueueMetrics {
  processed: number;
  failures: number;
  timeouts: number;
  retries: number;
  avgProcessingTime: number;
  avgWaitTime: number;
  currentQueueLength: number;
  activeOperations: number;
  throughput: {
    perSecond: number;
    perMinute: number;
    perHour: number;
  };
  errorRate: number;
  retryRate: number;
  completionRate: number;
}

/**
 * Operation state interface
 */
interface OperationState<T = any> {
  operation: QueueOperation<T>;
  startTime?: Date;
  retryCount: number;
  timeoutHandle?: NodeJS.Timeout;
}

/**
 * Async Operation Queue with priority, timeout handling, automatic retry, and metrics
 * Based on Claude Flow's performance-optimizer.js pattern but adapted for QE framework
 */
export class AsyncOperationQueue extends EventEmitter {
  private readonly config: Required<QueueConfig>;
  private readonly queue: OperationState[] = [];
  private readonly activeOperations = new Map<string, OperationState>();
  private readonly results = new Map<string, OperationResult>();
  private readonly metrics: QueueMetrics;
  private metricsInterval?: NodeJS.Timeout;
  private shuttingDown = false;
  private processingPaused = false;

  constructor(config: QueueConfig = {}) {
    super();

    this.config = {
      concurrency: config.concurrency || 5,
      defaultTimeout: config.defaultTimeout || 30000, // 30 seconds
      defaultRetries: config.defaultRetries || 3,
      retryDelay: config.retryDelay || 1000, // 1 second
      maxRetryDelay: config.maxRetryDelay || 30000, // 30 seconds
      retryBackoffFactor: config.retryBackoffFactor || 2,
      enableMetrics: config.enableMetrics ?? true,
      gracefulShutdownTimeout: config.gracefulShutdownTimeout || 60000 // 1 minute
    };

    this.metrics = this.initializeMetrics();

    if (this.config.enableMetrics) {
      this.startMetricsCollection();
    }

    // Start processing
    this.processQueue();
  }

  /**
   * Add operation to queue
   */
  public async enqueue<T>(operation: Omit<QueueOperation<T>, 'id' | 'createdAt'>): Promise<string> {
    if (this.shuttingDown) {
      throw new Error('Queue is shutting down, cannot enqueue new operations');
    }

    const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queueOperation: QueueOperation<T> = {
      ...operation,
      id,
      createdAt: new Date(),
      priority: operation.priority || Priority.MEDIUM,
      timeout: operation.timeout || this.config.defaultTimeout,
      retries: operation.retries ?? this.config.defaultRetries
    };

    const state: OperationState<T> = {
      operation: queueOperation,
      retryCount: 0
    };

    // Insert operation in priority order
    this.insertByPriority(state);

    this.emit('operationEnqueued', { id, priority: queueOperation.priority });

    // Try to process immediately if we have capacity
    this.processQueue();

    return id;
  }

  /**
   * Get operation result
   */
  public getResult<T = any>(id: string): OperationResult<T> | undefined {
    return this.results.get(id) as OperationResult<T>;
  }

  /**
   * Wait for operation completion
   */
  public async waitForCompletion<T = any>(id: string, timeout?: number): Promise<OperationResult<T>> {
    return new Promise((resolve, reject) => {
      const result = this.results.get(id);
      if (result) {
        return resolve(result as OperationResult<T>);
      }

      let timeoutHandle: NodeJS.Timeout | undefined;

      const onComplete = (completedId: string) => {
        if (completedId === id) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          this.off('operationCompleted', onComplete);
          this.off('operationFailed', onFailed);

          const result = this.results.get(id);
          if (result) {
            resolve(result as OperationResult<T>);
          } else {
            reject(new Error(`Operation ${id} completed but no result found`));
          }
        }
      };

      const onFailed = (completedId: string) => {
        if (completedId === id) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          this.off('operationCompleted', onComplete);
          this.off('operationFailed', onFailed);

          const result = this.results.get(id);
          if (result) {
            resolve(result as OperationResult<T>);
          } else {
            reject(new Error(`Operation ${id} failed but no result found`));
          }
        }
      };

      this.on('operationCompleted', onComplete);
      this.on('operationFailed', onFailed);

      if (timeout) {
        timeoutHandle = setTimeout(() => {
          this.off('operationCompleted', onComplete);
          this.off('operationFailed', onFailed);
          reject(new Error(`Timeout waiting for operation ${id} after ${timeout}ms`));
        }, timeout);
      }
    });
  }

  /**
   * Cancel operation
   */
  public cancel(id: string): boolean {
    // Check if operation is in queue
    const queueIndex = this.queue.findIndex(state => state.operation.id === id);
    if (queueIndex !== -1) {
      const state = this.queue.splice(queueIndex, 1)[0];
      this.recordResult(state.operation, false, undefined, new Error('Operation cancelled'), 0);
      return true;
    }

    // Check if operation is active
    const activeState = this.activeOperations.get(id);
    if (activeState) {
      // Clear timeout if exists
      if (activeState.timeoutHandle) {
        clearTimeout(activeState.timeoutHandle);
      }

      this.activeOperations.delete(id);
      this.recordResult(activeState.operation, false, undefined, new Error('Operation cancelled'),
        activeState.startTime ? Date.now() - activeState.startTime.getTime() : 0);

      // Start processing next operations
      this.processQueue();
      return true;
    }

    return false;
  }

  /**
   * Clear all pending operations
   */
  public clearQueue(): number {
    const cleared = this.queue.length;

    // Cancel all queued operations
    this.queue.forEach(state => {
      this.recordResult(state.operation, false, undefined, new Error('Queue cleared'), 0);
    });

    this.queue.length = 0;
    this.emit('queueCleared', { cleared });

    return cleared;
  }

  /**
   * Pause queue processing
   */
  public pause(): void {
    this.processingPaused = true;
    this.emit('queuePaused');
  }

  /**
   * Resume queue processing
   */
  public resume(): void {
    this.processingPaused = false;
    this.emit('queueResumed');
    this.processQueue();
  }

  /**
   * Get current queue metrics
   */
  public getMetrics(): QueueMetrics {
    this.updateThroughputMetrics();
    return { ...this.metrics };
  }

  /**
   * Get queue status
   */
  public getStatus(): {
    queueLength: number;
    activeOperations: number;
    isPaused: boolean;
    isShuttingDown: boolean;
    totalProcessed: number;
    totalFailed: number;
  } {
    return {
      queueLength: this.queue.length,
      activeOperations: this.activeOperations.size,
      isPaused: this.processingPaused,
      isShuttingDown: this.shuttingDown,
      totalProcessed: this.metrics.processed,
      totalFailed: this.metrics.failures
    };
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.emit('shutdownStarted');

    // Stop accepting new operations
    this.clearQueue();

    // Wait for active operations to complete or timeout
    const startTime = Date.now();
    while (this.activeOperations.size > 0) {
      if (Date.now() - startTime > this.config.gracefulShutdownTimeout) {
        // Force cancel remaining operations
        for (const [id, state] of this.activeOperations.entries()) {
          if (state.timeoutHandle) {
            clearTimeout(state.timeoutHandle);
          }
          this.recordResult(state.operation, false, undefined,
            new Error('Shutdown timeout'),
            state.startTime ? Date.now() - state.startTime.getTime() : 0);
        }
        this.activeOperations.clear();
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Stop metrics collection
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Clear all listeners
    this.removeAllListeners();

    this.emit('shutdownCompleted');
  }

  /**
   * Process queue operations
   */
  private async processQueue(): Promise<void> {
    if (this.processingPaused || this.shuttingDown) {
      return;
    }

    // Start operations up to concurrency limit
    while (this.activeOperations.size < this.config.concurrency && this.queue.length > 0) {
      const state = this.queue.shift();
      if (!state) break;

      this.executeOperation(state);
    }
  }

  /**
   * Execute a single operation
   */
  private async executeOperation<T>(state: OperationState<T>): Promise<void> {
    const { operation } = state;
    state.startTime = new Date();

    this.activeOperations.set(operation.id, state);
    this.emit('operationStarted', { id: operation.id, priority: operation.priority });

    // Set up timeout
    if (operation.timeout && operation.timeout > 0) {
      state.timeoutHandle = setTimeout(() => {
        this.handleTimeout(state);
      }, operation.timeout);
    }

    try {
      // Execute the operation
      const result = await operation.operation();

      // Clear timeout
      if (state.timeoutHandle) {
        clearTimeout(state.timeoutHandle);
      }

      // Remove from active operations
      this.activeOperations.delete(operation.id);

      // Record success
      const duration = Date.now() - state.startTime!.getTime();
      this.recordResult(operation, true, result, undefined, duration);

      // Call success callback
      if (operation.onSuccess) {
        try {
          operation.onSuccess(result);
        } catch (callbackError) {
          this.emit('callbackError', { id: operation.id, error: callbackError });
        }
      }

      this.emit('operationCompleted', operation.id);

    } catch (error) {
      // Clear timeout
      if (state.timeoutHandle) {
        clearTimeout(state.timeoutHandle);
      }

      // Handle retry logic
      if (state.retryCount < (operation.retries || 0)) {
        await this.retryOperation(state, error as Error);
      } else {
        // Remove from active operations
        this.activeOperations.delete(operation.id);

        // Record failure
        const duration = state.startTime ? Date.now() - state.startTime.getTime() : 0;
        this.recordResult(operation, false, undefined, error as Error, duration);

        // Call error callback
        if (operation.onError) {
          try {
            operation.onError(error as Error);
          } catch (callbackError) {
            this.emit('callbackError', { id: operation.id, error: callbackError });
          }
        }

        this.emit('operationFailed', operation.id);
      }
    }

    // Continue processing queue
    this.processQueue();
  }

  /**
   * Handle operation timeout
   */
  private handleTimeout<T>(state: OperationState<T>): void {
    const { operation } = state;

    // Remove from active operations
    this.activeOperations.delete(operation.id);

    // Record timeout
    const duration = state.startTime ? Date.now() - state.startTime.getTime() : 0;
    const timeoutError = new Error(`Operation ${operation.id} timed out after ${operation.timeout}ms`);

    // Handle retry for timeout
    if (state.retryCount < (operation.retries || 0)) {
      this.retryOperation(state, timeoutError);
    } else {
      this.recordResult(operation, false, undefined, timeoutError, duration);
      this.metrics.timeouts++;

      // Call timeout callback
      if (operation.onTimeout) {
        try {
          operation.onTimeout();
        } catch (callbackError) {
          this.emit('callbackError', { id: operation.id, error: callbackError });
        }
      }

      this.emit('operationTimeout', operation.id);
      this.emit('operationFailed', operation.id);
    }

    // Continue processing queue
    this.processQueue();
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation<T>(state: OperationState<T>, error: Error): Promise<void> {
    state.retryCount++;
    this.metrics.retries++;

    // Calculate retry delay with exponential backoff
    const baseDelay = this.config.retryDelay;
    const backoffDelay = Math.min(
      baseDelay * Math.pow(this.config.retryBackoffFactor, state.retryCount - 1),
      this.config.maxRetryDelay
    );

    // Call retry callback
    if (state.operation.onRetry) {
      try {
        state.operation.onRetry(state.retryCount, error);
      } catch (callbackError) {
        this.emit('callbackError', { id: state.operation.id, error: callbackError });
      }
    }

    this.emit('operationRetry', {
      id: state.operation.id,
      attempt: state.retryCount,
      delay: backoffDelay,
      error: error.message
    });

    // Remove from active operations temporarily
    this.activeOperations.delete(state.operation.id);

    // Schedule retry
    setTimeout(() => {
      if (!this.shuttingDown) {
        this.executeOperation(state);
      }
    }, backoffDelay);
  }

  /**
   * Insert operation in queue based on priority
   */
  private insertByPriority<T>(state: OperationState<T>): void {
    const priority = state.operation.priority;

    // Find the correct position to insert based on priority
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].operation.priority < priority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, state);
  }

  /**
   * Record operation result
   */
  private recordResult<T>(
    operation: QueueOperation<T>,
    success: boolean,
    result?: T,
    error?: Error,
    duration: number = 0
  ): void {
    const operationResult: OperationResult<T> = {
      id: operation.id,
      success,
      result,
      error,
      duration,
      retryCount: this.activeOperations.get(operation.id)?.retryCount || 0,
      completedAt: new Date()
    };

    this.results.set(operation.id, operationResult);

    // Update metrics
    if (success) {
      this.metrics.processed++;
    } else {
      this.metrics.failures++;
    }

    // Update average processing time
    const totalOperations = this.metrics.processed + this.metrics.failures;
    this.metrics.avgProcessingTime =
      ((this.metrics.avgProcessingTime * (totalOperations - 1)) + duration) / totalOperations;

    // Calculate wait time
    const waitTime = operation.createdAt ?
      (operationResult.completedAt.getTime() - operation.createdAt.getTime() - duration) : 0;
    this.metrics.avgWaitTime =
      ((this.metrics.avgWaitTime * (totalOperations - 1)) + waitTime) / totalOperations;

    // Update current queue metrics
    this.metrics.currentQueueLength = this.queue.length;
    this.metrics.activeOperations = this.activeOperations.size;

    // Calculate rates
    this.metrics.errorRate = this.metrics.failures / totalOperations;
    this.metrics.retryRate = this.metrics.retries / totalOperations;
    this.metrics.completionRate = this.metrics.processed / totalOperations;

    this.emit('operationResult', operationResult);
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): QueueMetrics {
    return {
      processed: 0,
      failures: 0,
      timeouts: 0,
      retries: 0,
      avgProcessingTime: 0,
      avgWaitTime: 0,
      currentQueueLength: 0,
      activeOperations: 0,
      throughput: {
        perSecond: 0,
        perMinute: 0,
        perHour: 0
      },
      errorRate: 0,
      retryRate: 0,
      completionRate: 0
    };
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    let lastProcessed = 0;
    let lastTimestamp = Date.now();

    this.metricsInterval = setInterval(() => {
      this.updateThroughputMetrics();

      const currentProcessed = this.metrics.processed;
      const currentTime = Date.now();
      const timeDiff = (currentTime - lastTimestamp) / 1000; // Convert to seconds

      if (timeDiff > 0) {
        const processingDiff = currentProcessed - lastProcessed;
        this.metrics.throughput.perSecond = processingDiff / timeDiff;
        this.metrics.throughput.perMinute = this.metrics.throughput.perSecond * 60;
        this.metrics.throughput.perHour = this.metrics.throughput.perMinute * 60;
      }

      lastProcessed = currentProcessed;
      lastTimestamp = currentTime;

      this.emit('metricsUpdated', this.metrics);
    }, 5000); // Update every 5 seconds
  }

  /**
   * Update throughput metrics
   */
  private updateThroughputMetrics(): void {
    this.metrics.currentQueueLength = this.queue.length;
    this.metrics.activeOperations = this.activeOperations.size;
  }

  /**
   * Get operation by ID (for debugging)
   */
  public getOperation(id: string): QueueOperation | undefined {
    // Check active operations
    const activeState = this.activeOperations.get(id);
    if (activeState) {
      return activeState.operation;
    }

    // Check queue
    const queueState = this.queue.find(state => state.operation.id === id);
    if (queueState) {
      return queueState.operation;
    }

    return undefined;
  }

  /**
   * Get all pending operations
   */
  public getPendingOperations(): QueueOperation[] {
    return this.queue.map(state => state.operation);
  }

  /**
   * Get all active operations
   */
  public getActiveOperations(): QueueOperation[] {
    return Array.from(this.activeOperations.values()).map(state => state.operation);
  }
}

export default AsyncOperationQueue;