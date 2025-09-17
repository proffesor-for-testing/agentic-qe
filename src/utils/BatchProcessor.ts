import { EventEmitter } from 'events';

/**
 * Batch processing configuration
 */
export interface BatchProcessorConfig {
  maxBatchSize?: number;
  flushInterval?: number;
  autoFlush?: boolean;
  enableMetrics?: boolean;
  concurrency?: number;
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;
    backoffFactor: number;
  };
}

/**
 * Batch item interface
 */
export interface BatchItem<T = any> {
  id: string;
  data: T;
  priority?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Batch processing result
 */
export interface BatchResult<T = any, R = any> {
  batchId: string;
  items: BatchItem<T>[];
  results: R[];
  errors: Error[];
  startTime: Date;
  endTime: Date;
  duration: number;
  successCount: number;
  errorCount: number;
}

/**
 * Batch processor metrics
 */
export interface BatchProcessorMetrics {
  totalBatches: number;
  totalItems: number;
  successfulBatches: number;
  failedBatches: number;
  avgBatchSize: number;
  avgProcessingTime: number;
  throughput: {
    itemsPerSecond: number;
    batchesPerMinute: number;
  };
  errorRate: number;
  currentQueueSize: number;
  lastFlushTime?: Date;
}

/**
 * Batch processing strategy interface
 */
export interface BatchProcessingStrategy<T, R> {
  name: string;
  processBatch: (items: BatchItem<T>[]) => Promise<R[]>;
  canProcess?: (item: BatchItem<T>) => boolean;
  shouldFlush?: (currentBatch: BatchItem<T>[], newItem: BatchItem<T>) => boolean;
}

/**
 * BatchProcessor for optimizing bulk test operations
 * Provides configurable batch size, flush intervals, event emission, and performance metrics
 */
export class BatchProcessor<T = any, R = any> extends EventEmitter {
  private readonly config: Required<BatchProcessorConfig>;
  private readonly queue: BatchItem<T>[] = [];
  private readonly processingStrategies = new Map<string, BatchProcessingStrategy<T, R>>();
  private readonly results = new Map<string, BatchResult<T, R>>();
  private readonly metrics: BatchProcessorMetrics;
  private flushTimer?: NodeJS.Timeout;
  private isProcessing = false;
  private isPaused = false;
  private shutdownRequested = false;
  private activeBatches = new Set<string>();

  constructor(config: BatchProcessorConfig = {}) {
    super();

    this.config = {
      maxBatchSize: config.maxBatchSize || 100,
      flushInterval: config.flushInterval || 5000, // 5 seconds
      autoFlush: config.autoFlush ?? true,
      enableMetrics: config.enableMetrics ?? true,
      concurrency: config.concurrency || 3,
      retryConfig: {
        maxRetries: config.retryConfig?.maxRetries || 3,
        retryDelay: config.retryConfig?.retryDelay || 1000,
        backoffFactor: config.retryConfig?.backoffFactor || 2,
        ...config.retryConfig
      }
    };

    this.metrics = this.initializeMetrics();

    if (this.config.autoFlush) {
      this.startFlushTimer();
    }

    // Set up default processing strategy
    this.addStrategy({
      name: 'default',
      processBatch: async (items: BatchItem<T>[]) => {
        // Default strategy - just return the data
        return items.map(item => item.data as unknown as R);
      }
    });
  }

  /**
   * Add item to batch queue
   */
  public async add(data: T, options: {
    id?: string;
    priority?: number;
    metadata?: Record<string, any>;
    strategy?: string;
  } = {}): Promise<string> {
    if (this.shutdownRequested) {
      throw new Error('BatchProcessor is shutting down');
    }

    const item: BatchItem<T> = {
      id: options.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      data,
      priority: options.priority || 0,
      timestamp: new Date(),
      metadata: {
        ...options.metadata,
        strategy: options.strategy || 'default'
      }
    };

    // Insert by priority (higher priority first)
    this.insertByPriority(item);

    this.emit('itemAdded', item);

    // Check if we should flush immediately
    if (this.shouldFlushNow(item)) {
      await this.flush();
    }

    return item.id;
  }

  /**
   * Add multiple items at once
   */
  public async addBatch(items: T[], options: {
    priority?: number;
    metadata?: Record<string, any>;
    strategy?: string;
  } = {}): Promise<string[]> {
    const ids: string[] = [];

    for (const data of items) {
      const id = await this.add(data, options);
      ids.push(id);
    }

    return ids;
  }

  /**
   * Add a processing strategy
   */
  public addStrategy(strategy: BatchProcessingStrategy<T, R>): void {
    this.processingStrategies.set(strategy.name, strategy);
    this.emit('strategyAdded', strategy.name);
  }

  /**
   * Remove a processing strategy
   */
  public removeStrategy(name: string): boolean {
    if (name === 'default') {
      throw new Error('Cannot remove default strategy');
    }

    const removed = this.processingStrategies.delete(name);
    if (removed) {
      this.emit('strategyRemoved', name);
    }
    return removed;
  }

  /**
   * Manually flush the queue
   */
  public async flush(strategyName?: string): Promise<BatchResult<T, R>[]> {
    if (this.isPaused || this.shutdownRequested) {
      return [];
    }

    const results: BatchResult<T, R>[] = [];

    // Group items by strategy
    const itemsByStrategy = this.groupByStrategy();

    for (const [strategy, items] of itemsByStrategy.entries()) {
      if (strategyName && strategy !== strategyName) {
        continue;
      }

      if (items.length === 0) {
        continue;
      }

      // Split into batches if needed
      const batches = this.splitIntoBatches(items);

      for (const batch of batches) {
        const result = await this.processBatch(batch, strategy);
        results.push(result);
      }
    }

    this.resetFlushTimer();
    this.emit('flushed', { count: results.length, timestamp: new Date() });

    return results;
  }

  /**
   * Pause processing
   */
  public pause(): void {
    this.isPaused = true;
    this.stopFlushTimer();
    this.emit('paused');
  }

  /**
   * Resume processing
   */
  public resume(): void {
    this.isPaused = false;
    if (this.config.autoFlush) {
      this.startFlushTimer();
    }
    this.emit('resumed');
  }

  /**
   * Get current metrics
   */
  public getMetrics(): BatchProcessorMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get queue status
   */
  public getStatus(): {
    queueSize: number;
    activeBatches: number;
    isPaused: boolean;
    isProcessing: boolean;
    strategies: string[];
  } {
    return {
      queueSize: this.queue.length,
      activeBatches: this.activeBatches.size,
      isPaused: this.isPaused,
      isProcessing: this.isProcessing,
      strategies: Array.from(this.processingStrategies.keys())
    };
  }

  /**
   * Get result by batch ID
   */
  public getResult(batchId: string): BatchResult<T, R> | undefined {
    return this.results.get(batchId);
  }

  /**
   * Get all results
   */
  public getAllResults(): BatchResult<T, R>[] {
    return Array.from(this.results.values());
  }

  /**
   * Clear processed results
   */
  public clearResults(olderThan?: Date): number {
    let cleared = 0;

    for (const [id, result] of this.results.entries()) {
      if (!olderThan || result.endTime < olderThan) {
        this.results.delete(id);
        cleared++;
      }
    }

    this.emit('resultsCleared', { cleared });
    return cleared;
  }

  /**
   * Remove items from queue
   */
  public removeItems(predicate: (item: BatchItem<T>) => boolean): number {
    const initialLength = this.queue.length;

    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (predicate(this.queue[i])) {
        const removed = this.queue.splice(i, 1)[0];
        this.emit('itemRemoved', removed);
      }
    }

    const removed = initialLength - this.queue.length;
    if (removed > 0) {
      this.updateMetrics();
    }

    return removed;
  }

  /**
   * Shutdown processor
   */
  public async shutdown(timeout: number = 30000): Promise<void> {
    this.shutdownRequested = true;
    this.stopFlushTimer();

    // Process remaining items
    if (this.queue.length > 0) {
      await this.flush();
    }

    // Wait for active batches to complete
    const startTime = Date.now();
    while (this.activeBatches.size > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.removeAllListeners();
    this.emit('shutdown');
  }

  /**
   * Process a batch with a specific strategy
   */
  private async processBatch(items: BatchItem<T>[], strategyName: string): Promise<BatchResult<T, R>> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();

    this.activeBatches.add(batchId);
    this.isProcessing = true;

    this.emit('batchStarted', { batchId, items: items.length, strategy: strategyName });

    const strategy = this.processingStrategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown strategy: ${strategyName}`);
    }

    let results: R[] = [];
    let errors: Error[] = [];
    let retryCount = 0;

    while (retryCount <= this.config.retryConfig.maxRetries) {
      try {
        results = await strategy.processBatch(items);
        break; // Success, exit retry loop
      } catch (error) {
        errors.push(error as Error);
        retryCount++;

        if (retryCount <= this.config.retryConfig.maxRetries) {
          const delay = this.config.retryConfig.retryDelay *
            Math.pow(this.config.retryConfig.backoffFactor, retryCount - 1);

          this.emit('batchRetry', {
            batchId,
            attempt: retryCount,
            error: error as Error,
            delay
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    // Remove processed items from queue
    items.forEach(item => {
      const index = this.queue.findIndex(qItem => qItem.id === item.id);
      if (index !== -1) {
        this.queue.splice(index, 1);
      }
    });

    const result: BatchResult<T, R> = {
      batchId,
      items,
      results,
      errors,
      startTime,
      endTime,
      duration,
      successCount: results.length,
      errorCount: errors.length
    };

    // Store result
    this.results.set(batchId, result);

    // Update metrics
    this.updateBatchMetrics(result);

    this.activeBatches.delete(batchId);
    this.isProcessing = this.activeBatches.size > 0;

    this.emit('batchCompleted', result);

    return result;
  }

  /**
   * Group items by strategy
   */
  private groupByStrategy(): Map<string, BatchItem<T>[]> {
    const groups = new Map<string, BatchItem<T>[]>();

    for (const item of this.queue) {
      const strategy = item.metadata?.strategy || 'default';

      if (!groups.has(strategy)) {
        groups.set(strategy, []);
      }

      groups.get(strategy)!.push(item);
    }

    return groups;
  }

  /**
   * Split items into batches based on max batch size
   */
  private splitIntoBatches(items: BatchItem<T>[]): BatchItem<T>[][] {
    const batches: BatchItem<T>[][] = [];

    for (let i = 0; i < items.length; i += this.config.maxBatchSize) {
      batches.push(items.slice(i, i + this.config.maxBatchSize));
    }

    return batches;
  }

  /**
   * Insert item by priority
   */
  private insertByPriority(item: BatchItem<T>): void {
    let insertIndex = this.queue.length;

    for (let i = 0; i < this.queue.length; i++) {
      if ((this.queue[i].priority || 0) < (item.priority || 0)) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, item);
  }

  /**
   * Check if should flush immediately
   */
  private shouldFlushNow(newItem: BatchItem<T>): boolean {
    // Check if queue is at max capacity
    if (this.queue.length >= this.config.maxBatchSize) {
      return true;
    }

    // Check strategy-specific flush conditions
    const strategy = this.processingStrategies.get(newItem.metadata?.strategy || 'default');
    if (strategy?.shouldFlush) {
      const otherItems = this.queue.filter(item =>
        (item.metadata?.strategy || 'default') === (newItem.metadata?.strategy || 'default')
      );
      return strategy.shouldFlush(otherItems, newItem);
    }

    return false;
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (!this.isPaused && this.queue.length > 0) {
        this.flush().catch(error => {
          this.emit('error', error);
        });
      }
    }, this.config.flushInterval);
  }

  /**
   * Stop flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Reset flush timer
   */
  private resetFlushTimer(): void {
    if (this.config.autoFlush) {
      this.stopFlushTimer();
      this.startFlushTimer();
    }
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): BatchProcessorMetrics {
    return {
      totalBatches: 0,
      totalItems: 0,
      successfulBatches: 0,
      failedBatches: 0,
      avgBatchSize: 0,
      avgProcessingTime: 0,
      throughput: {
        itemsPerSecond: 0,
        batchesPerMinute: 0
      },
      errorRate: 0,
      currentQueueSize: 0
    };
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    this.metrics.currentQueueSize = this.queue.length;

    if (this.metrics.totalBatches > 0) {
      this.metrics.avgBatchSize = this.metrics.totalItems / this.metrics.totalBatches;
      this.metrics.errorRate = this.metrics.failedBatches / this.metrics.totalBatches;
    }
  }

  /**
   * Update batch-specific metrics
   */
  private updateBatchMetrics(result: BatchResult<T, R>): void {
    this.metrics.totalBatches++;
    this.metrics.totalItems += result.items.length;

    if (result.errorCount === 0) {
      this.metrics.successfulBatches++;
    } else {
      this.metrics.failedBatches++;
    }

    // Update average processing time
    const totalBatches = this.metrics.totalBatches;
    this.metrics.avgProcessingTime =
      ((this.metrics.avgProcessingTime * (totalBatches - 1)) + result.duration) / totalBatches;

    // Update throughput (simplified calculation)
    const durationInSeconds = result.duration / 1000;
    if (durationInSeconds > 0) {
      this.metrics.throughput.itemsPerSecond = result.items.length / durationInSeconds;
      this.metrics.throughput.batchesPerMinute = (1 / durationInSeconds) * 60;
    }

    this.metrics.lastFlushTime = new Date();
    this.updateMetrics();
  }
}

export default BatchProcessor;