/**
 * AsyncOperationQueue Integration Tests
 * Tests concurrent operation processing, priority-based scheduling,
 * timeout handling, retry mechanisms, and metrics collection
 */

import { TaskExecutor, TaskDefinition, ExecutionResult, ResourceRequirements } from '../../src/advanced/task-executor';
import { Logger } from '../../src/utils/Logger';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// Extended AsyncOperationQueue implementation for testing
class AsyncOperationQueue {
  private queue: Array<{
    operation: () => Promise<any>;
    priority: number;
    timeout: number;
    retries: number;
    id: string;
    metadata: any;
  }> = [];
  private running = false;
  private concurrency: number;
  private activeOperations = new Map<string, Promise<any>>();
  private metrics = {
    processed: 0,
    failed: 0,
    timeouts: 0,
    retries: 0,
    avgProcessingTime: 0
  };
  private logger: Logger;

  constructor(concurrency = 5, logger?: Logger) {
    this.concurrency = concurrency;
    this.logger = logger || new Logger('AsyncQueue');
  }

  async add<T>(
    operation: () => Promise<T>,
    options: {
      priority?: number;
      timeout?: number;
      retries?: number;
      id?: string;
      metadata?: any;
    } = {}
  ): Promise<string> {
    const id = options.id || `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.queue.push({
      operation,
      priority: options.priority || 5,
      timeout: options.timeout || 30000,
      retries: options.retries || 3,
      id,
      metadata: options.metadata || {}
    });

    // Sort by priority (higher priority first)
    this.queue.sort((a, b) => b.priority - a.priority);
    
    if (!this.running) {
      this.start();
    }

    return id;
  }

  private async start(): Promise<void> {
    this.running = true;
    
    while (this.queue.length > 0 || this.activeOperations.size > 0) {
      // Fill active operations up to concurrency limit
      while (this.queue.length > 0 && this.activeOperations.size < this.concurrency) {
        const operation = this.queue.shift()!;
        const promise = this.executeOperation(operation);
        this.activeOperations.set(operation.id, promise);
      }

      // Wait for at least one operation to complete
      if (this.activeOperations.size > 0) {
        await Promise.race(Array.from(this.activeOperations.values()));
      } else {
        break;
      }
    }

    this.running = false;
  }

  private async executeOperation(operation: {
    operation: () => Promise<any>;
    priority: number;
    timeout: number;
    retries: number;
    id: string;
    metadata: any;
  }): Promise<any> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts <= operation.retries) {
      try {
        const result = await this.executeWithTimeout(operation.operation, operation.timeout);
        
        // Update metrics
        this.metrics.processed++;
        const processingTime = Date.now() - startTime;
        this.metrics.avgProcessingTime = 
          (this.metrics.avgProcessingTime * (this.metrics.processed - 1) + processingTime) / this.metrics.processed;
        
        this.activeOperations.delete(operation.id);
        return result;
        
      } catch (error: any) {
        lastError = error;
        attempts++;
        
        if (error.message.includes('timeout')) {
          this.metrics.timeouts++;
        }
        
        if (attempts <= operation.retries) {
          this.metrics.retries++;
          await this.backoff(attempts);
        }
      }
    }

    this.metrics.failed++;
    this.activeOperations.delete(operation.id);
    throw lastError || new Error('Operation failed after all retries');
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async backoff(attempt: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getQueueStatus() {
    return {
      queued: this.queue.length,
      active: this.activeOperations.size,
      running: this.running,
      concurrency: this.concurrency
    };
  }

  async drain(): Promise<void> {
    while (this.running || this.queue.length > 0 || this.activeOperations.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  clear(): void {
    this.queue = [];
  }
}

describe('AsyncOperationQueue Integration', () => {
  let queue: AsyncOperationQueue;
  let taskExecutor: TaskExecutor;
  let testDir: string;
  let logger: Logger;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'async-queue-test', Date.now().toString());
    await fs.ensureDir(testDir);
    logger = new Logger('QueueTest', { level: 'debug' });
  });

  afterAll(async () => {
    if (taskExecutor) {
      await taskExecutor.shutdown();
    }
    await fs.remove(testDir);
  });

  beforeEach(async () => {
    queue = new AsyncOperationQueue(5, logger);
    taskExecutor = new TaskExecutor({ maxConcurrent: 10 });
  });

  afterEach(async () => {
    queue.clear();
    if (taskExecutor) {
      await taskExecutor.shutdown();
    }
  });

  describe('Concurrent Operation Processing', () => {
    it('should process multiple operations concurrently', async () => {
      const concurrency = 5;
      const operations = [];
      const startTime = Date.now();
      const operationDuration = 200; // 200ms per operation

      // Create operations that take some time
      for (let i = 0; i < 10; i++) {
        operations.push(queue.add(async () => {
          await new Promise(resolve => setTimeout(resolve, operationDuration));
          return `result-${i}`;
        }, { id: `op-${i}` }));
      }

      // Wait for all operations to complete
      await queue.drain();
      const totalTime = Date.now() - startTime;

      // With concurrency=5, 10 operations should complete in ~2 batches
      // Total time should be less than sequential execution (10 * 200ms = 2000ms)
      expect(totalTime).toBeLessThan(1000); // Should be around 400-600ms
      
      const metrics = queue.getMetrics();
      expect(metrics.processed).toBe(10);
      expect(metrics.failed).toBe(0);
    });

    it('should respect concurrency limits', async () => {
      const concurrency = 3;
      queue = new AsyncOperationQueue(concurrency, logger);
      
      let activeOperations = 0;
      let maxConcurrent = 0;
      const operations = [];

      // Create operations that track concurrency
      for (let i = 0; i < 10; i++) {
        operations.push(queue.add(async () => {
          activeOperations++;
          maxConcurrent = Math.max(maxConcurrent, activeOperations);
          
          await new Promise(resolve => setTimeout(resolve, 100));
          
          activeOperations--;
          return `result-${i}`;
        }, { id: `concurrent-${i}` }));
      }

      await queue.drain();
      
      // Should never exceed concurrency limit
      expect(maxConcurrent).toBeLessThanOrEqual(concurrency);
      expect(maxConcurrent).toBeGreaterThan(1); // Should use parallelism
    });

    it('should handle mixed fast and slow operations efficiently', async () => {
      const results: string[] = [];
      const startTimes: Record<string, number> = {};
      const endTimes: Record<string, number> = {};

      // Mix of fast and slow operations
      const fastOps = [];
      const slowOps = [];

      // Add fast operations
      for (let i = 0; i < 5; i++) {
        const id = `fast-${i}`;
        startTimes[id] = Date.now();
        fastOps.push(queue.add(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          endTimes[id] = Date.now();
          results.push(id);
          return id;
        }, { id, priority: 5 }));
      }

      // Add slow operations
      for (let i = 0; i < 3; i++) {
        const id = `slow-${i}`;
        startTimes[id] = Date.now();
        slowOps.push(queue.add(async () => {
          await new Promise(resolve => setTimeout(resolve, 300));
          endTimes[id] = Date.now();
          results.push(id);
          return id;
        }, { id, priority: 5 }));
      }

      await queue.drain();
      
      expect(results).toHaveLength(8);
      
      // Fast operations should complete before some slow operations
      const fastCompletionTimes = fastOps.map(id => endTimes[`fast-${fastOps.indexOf(id)}`]);
      const slowCompletionTimes = slowOps.map(id => endTimes[`slow-${slowOps.indexOf(id)}`]);
      
      const fastestFastOp = Math.min(...fastCompletionTimes);
      const slowestSlowOp = Math.max(...slowCompletionTimes);
      
      expect(fastestFastOp).toBeLessThan(slowestSlowOp);
    });
  });

  describe('Priority-Based Scheduling', () => {
    it('should process high-priority operations first', async () => {
      const results: string[] = [];
      const operations = [];

      // Add operations with different priorities
      // Lower priority operations first
      for (let i = 0; i < 3; i++) {
        operations.push(queue.add(async () => {
          results.push(`low-${i}`);
          return `low-${i}`;
        }, { id: `low-${i}`, priority: 1 }));
      }

      // High priority operations
      for (let i = 0; i < 3; i++) {
        operations.push(queue.add(async () => {
          results.push(`high-${i}`);
          return `high-${i}`;
        }, { id: `high-${i}`, priority: 10 }));
      }

      // Medium priority operations
      for (let i = 0; i < 3; i++) {
        operations.push(queue.add(async () => {
          results.push(`medium-${i}`);
          return `medium-${i}`;
        }, { id: `medium-${i}`, priority: 5 }));
      }

      await queue.drain();
      
      // High priority should come first, then medium, then low
      const highIndices = results.map((r, i) => r.startsWith('high') ? i : -1).filter(i => i >= 0);
      const mediumIndices = results.map((r, i) => r.startsWith('medium') ? i : -1).filter(i => i >= 0);
      const lowIndices = results.map((r, i) => r.startsWith('low') ? i : -1).filter(i => i >= 0);
      
      expect(Math.max(...highIndices)).toBeLessThan(Math.min(...mediumIndices));
      expect(Math.max(...mediumIndices)).toBeLessThan(Math.min(...lowIndices));
    });

    it('should handle dynamic priority operations', async () => {
      queue = new AsyncOperationQueue(1, logger); // Single threaded for predictable order
      const results: string[] = [];

      // Start with medium priority operation that takes time
      const mediumOp = queue.add(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        results.push('medium-long');
        return 'medium-long';
      }, { id: 'medium-long', priority: 5 });

      // Add high priority operation while medium is running
      setTimeout(() => {
        queue.add(async () => {
          results.push('high-urgent');
          return 'high-urgent';
        }, { id: 'high-urgent', priority: 10 });
      }, 50);

      // Add low priority operation
      setTimeout(() => {
        queue.add(async () => {
          results.push('low-background');
          return 'low-background';
        }, { id: 'low-background', priority: 1 });
      }, 100);

      await queue.drain();
      
      expect(results).toEqual(['medium-long', 'high-urgent', 'low-background']);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout operations that exceed their time limit', async () => {
      const results: Array<{ success: boolean; error?: string }> = [];

      // Operation that will timeout
      try {
        await queue.add(async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return 'should-timeout';
        }, { timeout: 500, retries: 0 });
        results.push({ success: true });
      } catch (error: any) {
        results.push({ success: false, error: error.message });
      }

      // Operation that will complete in time
      try {
        await queue.add(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'should-complete';
        }, { timeout: 500, retries: 0 });
        results.push({ success: true });
      } catch (error: any) {
        results.push({ success: false, error: error.message });
      }

      await queue.drain();
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('timeout');
      expect(results[1].success).toBe(true);
      
      const metrics = queue.getMetrics();
      expect(metrics.timeouts).toBe(1);
    });

    it('should handle different timeout values for different operations', async () => {
      const operations = [
        { duration: 100, timeout: 200, shouldSucceed: true },
        { duration: 300, timeout: 200, shouldSucceed: false },
        { duration: 150, timeout: 300, shouldSucceed: true },
        { duration: 500, timeout: 400, shouldSucceed: false }
      ];

      const results = await Promise.allSettled(
        operations.map((op, index) => 
          queue.add(async () => {
            await new Promise(resolve => setTimeout(resolve, op.duration));
            return `op-${index}`;
          }, { timeout: op.timeout, retries: 0, id: `timeout-test-${index}` })
        )
      );

      await queue.drain();
      
      operations.forEach((op, index) => {
        const result = results[index];
        if (op.shouldSucceed) {
          expect(result.status).toBe('fulfilled');
        } else {
          expect(result.status).toBe('rejected');
          expect((result as PromiseRejectedResult).reason.message).toContain('timeout');
        }
      });
    });
  });

  describe('Retry Mechanisms', () => {
    it('should retry failed operations according to retry policy', async () => {
      let attemptCount = 0;
      const maxRetries = 3;

      try {
        await queue.add(async () => {
          attemptCount++;
          if (attemptCount <= maxRetries) {
            throw new Error(`Attempt ${attemptCount} failed`);
          }
          return 'success-after-retries';
        }, { retries: maxRetries, id: 'retry-test' });
      } catch (error) {
        // Operation should fail after all retries
      }

      await queue.drain();
      
      expect(attemptCount).toBe(maxRetries + 1); // Initial attempt + retries
      
      const metrics = queue.getMetrics();
      expect(metrics.retries).toBe(maxRetries);
      expect(metrics.failed).toBe(1);
    });

    it('should use exponential backoff for retries', async () => {
      const attemptTimes: number[] = [];
      const maxRetries = 3;

      try {
        await queue.add(async () => {
          attemptTimes.push(Date.now());
          throw new Error('Always fails');
        }, { retries: maxRetries, id: 'backoff-test' });
      } catch (error) {
        // Expected to fail
      }

      await queue.drain();
      
      expect(attemptTimes).toHaveLength(maxRetries + 1);
      
      // Check backoff timing (approximately exponential)
      for (let i = 1; i < attemptTimes.length; i++) {
        const delay = attemptTimes[i] - attemptTimes[i - 1];
        const expectedMinDelay = Math.min(1000 * Math.pow(2, i - 1), 10000) * 0.8; // 80% tolerance
        expect(delay).toBeGreaterThan(expectedMinDelay);
      }
    });

    it('should succeed on retry if operation becomes successful', async () => {
      let attemptCount = 0;
      
      const result = await queue.add(async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return 'success-on-retry';
      }, { retries: 3, id: 'eventual-success' });

      await queue.drain();
      
      expect(result).toBe('success-on-retry');
      expect(attemptCount).toBe(3);
      
      const metrics = queue.getMetrics();
      expect(metrics.retries).toBe(2);
      expect(metrics.failed).toBe(0);
      expect(metrics.processed).toBe(1);
    });
  });

  describe('Metrics Collection', () => {
    it('should collect comprehensive execution metrics', async () => {
      const operations = [
        // Successful operations
        { shouldFail: false, duration: 100 },
        { shouldFail: false, duration: 200 },
        { shouldFail: false, duration: 150 },
        
        // Failed operations
        { shouldFail: true, duration: 50 },
        { shouldFail: true, duration: 75 },
        
        // Timeout operations
        { shouldFail: false, duration: 600, timeout: 300 },
      ];

      const results = await Promise.allSettled(
        operations.map((op, index) => 
          queue.add(async () => {
            await new Promise(resolve => setTimeout(resolve, op.duration));
            if (op.shouldFail) {
              throw new Error('Intentional failure');
            }
            return `result-${index}`;
          }, { 
            timeout: op.timeout || 1000, 
            retries: 1, 
            id: `metrics-${index}` 
          })
        )
      );

      await queue.drain();
      
      const metrics = queue.getMetrics();
      
      expect(metrics.processed).toBe(3); // 3 successful operations
      expect(metrics.failed).toBe(3); // 2 failed + 1 timeout
      expect(metrics.timeouts).toBe(1);
      expect(metrics.retries).toBeGreaterThan(0);
      expect(metrics.avgProcessingTime).toBeGreaterThan(0);
      
      // Verify average processing time makes sense
      expect(metrics.avgProcessingTime).toBeGreaterThan(100);
      expect(metrics.avgProcessingTime).toBeLessThan(300);
    });

    it('should track queue status accurately', async () => {
      // Start several long-running operations
      const promises = [];
      for (let i = 0; i < 8; i++) {
        promises.push(queue.add(async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return `long-${i}`;
        }, { id: `long-${i}` }));
      }

      // Check status while operations are running
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const status = queue.getQueueStatus();
      expect(status.running).toBe(true);
      expect(status.active + status.queued).toBe(8);
      expect(status.active).toBeLessThanOrEqual(status.concurrency);
      expect(status.queued).toBeGreaterThanOrEqual(0);

      await queue.drain();
      
      const finalStatus = queue.getQueueStatus();
      expect(finalStatus.running).toBe(false);
      expect(finalStatus.active).toBe(0);
      expect(finalStatus.queued).toBe(0);
    });

    it('should provide detailed timing metrics', async () => {
      const operationDurations = [50, 100, 150, 200, 250];
      const startTime = Date.now();

      await Promise.all(
        operationDurations.map((duration, index) => 
          queue.add(async () => {
            await new Promise(resolve => setTimeout(resolve, duration));
            return `timed-${index}`;
          }, { id: `timed-${index}` })
        )
      );

      await queue.drain();
      const totalTime = Date.now() - startTime;
      
      const metrics = queue.getMetrics();
      
      // Average should be reasonable given concurrency
      const expectedAvg = operationDurations.reduce((sum, d) => sum + d, 0) / operationDurations.length;
      expect(metrics.avgProcessingTime).toBeGreaterThan(expectedAvg * 0.8);
      expect(metrics.avgProcessingTime).toBeLessThan(expectedAvg * 1.5);
      
      // Total time should be less than sequential execution due to concurrency
      const sequentialTime = operationDurations.reduce((sum, d) => sum + d, 0);
      expect(totalTime).toBeLessThan(sequentialTime);
    });
  });

  describe('Integration with TaskExecutor', () => {
    it('should integrate with TaskExecutor for complex workflows', async () => {
      const tasks: TaskDefinition[] = [
        {
          id: 'task-1',
          name: 'Analysis Task',
          type: 'analysis',
          priority: 8,
          dependencies: [],
          timeout: 5000,
          retryCount: 2,
          resources: {
            maxMemory: 100 * 1024 * 1024,
            maxCpuPercent: 50,
            maxDiskSpace: 10 * 1024 * 1024,
            maxNetworkBandwidth: 1024 * 1024,
            requiredAgents: 1
          },
          metadata: { complexity: 'medium' }
        },
        {
          id: 'task-2',
          name: 'Development Task',
          type: 'development',
          priority: 6,
          dependencies: ['task-1'],
          timeout: 10000,
          retryCount: 1,
          resources: {
            maxMemory: 200 * 1024 * 1024,
            maxCpuPercent: 70,
            maxDiskSpace: 20 * 1024 * 1024,
            maxNetworkBandwidth: 2 * 1024 * 1024,
            requiredAgents: 2
          },
          metadata: { complexity: 'high' }
        },
        {
          id: 'task-3',
          name: 'Testing Task',
          type: 'testing',
          priority: 7,
          dependencies: ['task-2'],
          timeout: 8000,
          retryCount: 3,
          resources: {
            maxMemory: 150 * 1024 * 1024,
            maxCpuPercent: 60,
            maxDiskSpace: 15 * 1024 * 1024,
            maxNetworkBandwidth: 1.5 * 1024 * 1024,
            requiredAgents: 1
          },
          metadata: { complexity: 'medium' }
        }
      ];

      // Execute tasks through queue with different priorities
      const executionPromises = tasks.map(task => 
        queue.add(
          () => taskExecutor.executeTask(task, `agent-${task.type}`),
          {
            priority: task.priority,
            timeout: task.timeout + 1000, // Extra buffer for queue timeout
            retries: 1,
            id: task.id,
            metadata: { taskType: task.type }
          }
        )
      );

      const results = await Promise.all(executionPromises);
      await queue.drain();
      
      // Verify all tasks completed successfully
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.duration).toBeGreaterThan(0);
        expect(result.resourcesUsed).toBeDefined();
      });
      
      const metrics = queue.getMetrics();
      expect(metrics.processed).toBe(3);
      expect(metrics.failed).toBe(0);
    });

    it('should handle resource-intensive operations with proper queuing', async () => {
      // Create multiple resource-intensive tasks
      const resourceIntensiveTasks = Array.from({ length: 6 }, (_, i) => ({
        id: `resource-task-${i}`,
        name: `Resource Task ${i}`,
        type: 'optimization' as const,
        priority: Math.floor(Math.random() * 10) + 1,
        dependencies: [],
        timeout: 15000,
        retryCount: 2,
        resources: {
          maxMemory: 500 * 1024 * 1024, // 500MB
          maxCpuPercent: 80,
          maxDiskSpace: 100 * 1024 * 1024,
          maxNetworkBandwidth: 10 * 1024 * 1024,
          requiredAgents: 3
        },
        metadata: { resourceIntensive: true }
      }));

      const startTime = Date.now();
      
      // Execute with limited concurrency
      queue = new AsyncOperationQueue(2, logger); // Limit to 2 concurrent operations
      
      const executionPromises = resourceIntensiveTasks.map(task => 
        queue.add(
          () => taskExecutor.executeTask(task, `optimizer-${task.id}`),
          {
            priority: task.priority,
            timeout: task.timeout,
            retries: 1,
            id: task.id
          }
        )
      );

      const results = await Promise.all(executionPromises);
      await queue.drain();
      
      const totalTime = Date.now() - startTime;
      
      // All tasks should succeed
      expect(results.every(r => r.success)).toBe(true);
      
      // Should take longer than single task but less than sequential
      expect(totalTime).toBeGreaterThan(1000); // At least 1 second
      expect(totalTime).toBeLessThan(20000); // Less than sequential execution
      
      const metrics = queue.getMetrics();
      expect(metrics.processed).toBe(6);
      expect(metrics.failed).toBe(0);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover gracefully from operation failures', async () => {
      const operations = [
        { id: 'success-1', shouldFail: false },
        { id: 'failure-1', shouldFail: true },
        { id: 'success-2', shouldFail: false },
        { id: 'failure-2', shouldFail: true },
        { id: 'success-3', shouldFail: false }
      ];

      const results = await Promise.allSettled(
        operations.map(op => 
          queue.add(async () => {
            if (op.shouldFail) {
              throw new Error(`Operation ${op.id} failed`);
            }
            return `Result for ${op.id}`;
          }, { id: op.id, retries: 0 })
        )
      );

      await queue.drain();
      
      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');
      
      expect(successful).toHaveLength(3);
      expect(failed).toHaveLength(2);
      
      const metrics = queue.getMetrics();
      expect(metrics.processed).toBe(3);
      expect(metrics.failed).toBe(2);
    });

    it('should handle queue overflow gracefully', async () => {
      // Simulate a scenario where many operations are queued
      const manyOperations = Array.from({ length: 100 }, (_, i) => 
        queue.add(async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return `op-${i}`;
        }, { id: `overflow-${i}` })
      );

      // Check that queue handles the load
      const status = queue.getQueueStatus();
      expect(status.queued + status.active).toBe(100);
      
      const results = await Promise.all(manyOperations);
      await queue.drain();
      
      expect(results).toHaveLength(100);
      expect(results.every(r => typeof r === 'string')).toBe(true);
      
      const metrics = queue.getMetrics();
      expect(metrics.processed).toBe(100);
      expect(metrics.failed).toBe(0);
    });
  });
});