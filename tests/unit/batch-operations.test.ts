/**
 * Unit Tests for Batch Operation Manager (QW-2)
 *
 * Tests coverage:
 * - Basic batch execution
 * - Concurrency limits
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Error propagation
 * - Progress tracking
 * - Sequential execution
 *
 * @module tests/unit/batch-operations
 */

import {
  BatchOperationManager,
  executeBatch,
  TimeoutError,
  BatchOperationError,
  type BatchOptions,
  type BatchResult,
} from '../../src/utils/batch-operations';
import { createSeededRandom } from '../../src/utils/SeededRandom';

describe('BatchOperationManager', () => {
  let batchManager: BatchOperationManager;

  beforeEach(() => {
    batchManager = new BatchOperationManager();
  });

  describe('Basic Batch Execution', () => {
    it('should execute all operations successfully', async () => {
      const operations = [1, 2, 3, 4, 5];
      const handler = jest.fn(async (n: number) => n * 2);

      const result = await batchManager.batchExecute(operations, handler);

      expect(result.results).toEqual([2, 4, 6, 8, 10]);
      expect(result.successRate).toBe(1.0);
      expect(result.errors).toHaveLength(0);
      expect(handler).toHaveBeenCalledTimes(5);
    });

    it('should maintain operation order in results', async () => {
      const rng = createSeededRandom(22000);
      const operations = ['a', 'b', 'c', 'd', 'e'];
      const handler = async (s: string) => {
        // Random delay to test ordering
        await new Promise((resolve) => setTimeout(resolve, rng.random() * 10));
        return s.toUpperCase();
      };

      const result = await batchManager.batchExecute(operations, handler);

      expect(result.results).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    it('should handle empty operations array', async () => {
      const result = await batchManager.batchExecute([], async () => 42);

      expect(result.results).toEqual([]);
      expect(result.successRate).toBe(0);
      expect(result.totalTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Concurrency Control', () => {
    it('should respect maxConcurrent limit', async () => {
      const operations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const handler = async (n: number) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentConcurrent--;
        return n;
      };

      await batchManager.batchExecute(operations, handler, {
        maxConcurrent: 3,
      });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should process operations in batches', async () => {
      const operations = Array.from({ length: 15 }, (_, i) => i);
      const batchStarts: number[] = [];
      let currentBatchCount = 0;

      const handler = async (n: number) => {
        currentBatchCount++;
        if (currentBatchCount === 1) {
          batchStarts.push(Date.now());
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        currentBatchCount--;
        if (currentBatchCount === 0) {
          currentBatchCount = 0;
        }
        return n;
      };

      await batchManager.batchExecute(operations, handler, {
        maxConcurrent: 5,
      });

      // Should have 3 batches: 5 + 5 + 5
      expect(batchStarts.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed operations with exponential backoff', async () => {
      const operations = [1, 2, 3];
      let attemptCount = 0;

      const handler = async (n: number) => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return n * 2;
      };

      const result = await batchManager.batchExecute(operations, handler, {
        retryOnError: true,
        maxRetries: 3,
        maxConcurrent: 1, // Sequential for predictable retry count
      });

      expect(result.results).toEqual([2, 4, 6]);
      expect(result.totalRetries).toBeGreaterThan(0);
      expect(attemptCount).toBeGreaterThan(operations.length);
    });

    it('should respect maxRetries limit', async () => {
      const operations = [1];
      let attemptCount = 0;

      const handler = async () => {
        attemptCount++;
        throw new Error('Always fails');
      };

      const result = await batchManager.batchExecute(operations, handler, {
        retryOnError: true,
        maxRetries: 3,
        failFast: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].retriesAttempted).toBe(3);
      expect(attemptCount).toBe(4); // 1 initial + 3 retries
    });

    it('should not retry when retryOnError is false', async () => {
      const operations = [1];
      let attemptCount = 0;

      const handler = async () => {
        attemptCount++;
        throw new Error('Fails');
      };

      const result = await batchManager.batchExecute(operations, handler, {
        retryOnError: false,
        failFast: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(attemptCount).toBe(1); // No retries
    });

    it('should apply exponential backoff between retries', async () => {
      const operations = [1];
      const timestamps: number[] = [];

      const handler = async () => {
        timestamps.push(Date.now());
        if (timestamps.length <= 2) {
          throw new Error('Retry me');
        }
        return 42;
      };

      await batchManager.batchExecute(operations, handler, {
        retryOnError: true,
        maxRetries: 3,
      });

      expect(timestamps.length).toBe(3);

      // Check backoff delays (approximately)
      // First retry: ~1000ms, second retry: ~2000ms
      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];

      expect(delay1).toBeGreaterThanOrEqual(900); // Allow 10% tolerance
      expect(delay2).toBeGreaterThanOrEqual(1800);
      expect(delay2).toBeGreaterThan(delay1); // Exponential growth
    }, 10000);
  });

  describe('Timeout Handling', () => {
    it('should timeout operations that exceed limit', async () => {
      const operations = [1];

      const handler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return 42;
      };

      const result = await batchManager.batchExecute(operations, handler, {
        timeout: 100,
        retryOnError: false,
        failFast: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBeInstanceOf(TimeoutError);
      expect((result.errors[0].error as TimeoutError).timeoutMs).toBe(100);
    });

    it('should complete operations within timeout', async () => {
      const operations = [1, 2, 3];

      const handler = async (n: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return n * 2;
      };

      const result = await batchManager.batchExecute(operations, handler, {
        timeout: 1000,
      });

      expect(result.results).toEqual([2, 4, 6]);
      expect(result.errors).toHaveLength(0);
    });

    it('should retry timed out operations if retryOnError is true', async () => {
      const operations = [1];
      let attemptCount = 0;

      const handler = async () => {
        attemptCount++;
        const delay = attemptCount === 1 ? 200 : 10; // First attempt times out
        await new Promise((resolve) => setTimeout(resolve, delay));
        return 42;
      };

      const result = await batchManager.batchExecute(operations, handler, {
        timeout: 100,
        retryOnError: true,
        maxRetries: 2,
      });

      expect(result.results).toEqual([42]);
      expect(result.totalRetries).toBeGreaterThan(0);
      expect(attemptCount).toBeGreaterThan(1);
    });
  });

  describe('Error Handling', () => {
    it('should collect all errors when failFast is false', async () => {
      const operations = [1, 2, 3, 4, 5];

      const handler = async (n: number) => {
        if (n % 2 === 0) {
          throw new Error(`Even number: ${n}`);
        }
        return n * 2;
      };

      const result = await batchManager.batchExecute(operations, handler, {
        retryOnError: false,
        failFast: false,
      });

      expect(result.results).toEqual([2, 6, 10]); // Odd numbers succeed
      expect(result.errors).toHaveLength(2); // Even numbers fail
      expect(result.successRate).toBe(0.6); // 3/5
    });

    it('should throw immediately when failFast is true', async () => {
      const operations = [1, 2, 3, 4, 5];

      const handler = async (n: number) => {
        if (n === 3) {
          throw new Error('Fail at 3');
        }
        return n;
      };

      await expect(
        batchManager.batchExecute(operations, handler, {
          retryOnError: false,
          failFast: true,
        })
      ).rejects.toThrow(BatchOperationError);
    });

    it('should include operation context in errors', async () => {
      const operations = [{ id: 1, value: 'a' }];

      const handler = async () => {
        throw new Error('Test error');
      };

      const result = await batchManager.batchExecute(operations, handler, {
        retryOnError: false,
        failFast: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].operation).toEqual({ id: 1, value: 'a' });
      expect(result.errors[0].index).toBe(0);
    });
  });

  describe('Progress Tracking', () => {
    it('should call onProgress callback with correct counts', async () => {
      const operations = [1, 2, 3, 4, 5];
      const progressUpdates: Array<{ completed: number; total: number }> = [];

      await batchManager.batchExecute(
        operations,
        async (n) => n * 2,
        {
          onProgress: (completed, total) => {
            progressUpdates.push({ completed, total });
          },
        }
      );

      expect(progressUpdates).toHaveLength(5);
      expect(progressUpdates[0]).toEqual({ completed: 1, total: 5 });
      expect(progressUpdates[4]).toEqual({ completed: 5, total: 5 });
    });

    it('should track progress even with failures', async () => {
      const operations = [1, 2, 3];
      const progressUpdates: number[] = [];

      const handler = async (n: number) => {
        if (n === 2) throw new Error('Fail');
        return n;
      };

      await batchManager.batchExecute(operations, handler, {
        retryOnError: false,
        failFast: false,
        onProgress: (completed) => {
          progressUpdates.push(completed);
        },
      });

      expect(progressUpdates).toEqual([1, 2, 3]);
    });
  });

  describe('Performance Metrics', () => {
    it('should track total execution time', async () => {
      const operations = [1, 2, 3];

      const handler = async (n: number) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return n;
      };

      const result = await batchManager.batchExecute(operations, handler);

      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.totalTime).toBeLessThan(500); // Should be much faster than sequential
    });

    it('should calculate success rate correctly', async () => {
      const operations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const handler = async (n: number) => {
        if (n > 7) throw new Error('Too high');
        return n;
      };

      const result = await batchManager.batchExecute(operations, handler, {
        retryOnError: false,
        failFast: false,
      });

      expect(result.successRate).toBe(0.7); // 7 out of 10
    });

    it('should be significantly faster than sequential execution', async () => {
      const operations = Array.from({ length: 10 }, (_, i) => i);

      const handler = async (n: number) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return n * 2;
      };

      // Parallel execution
      const startParallel = Date.now();
      await batchManager.batchExecute(operations, handler, {
        maxConcurrent: 5,
      });
      const parallelTime = Date.now() - startParallel;

      // Sequential execution
      const startSequential = Date.now();
      await batchManager.sequentialExecute(operations, handler);
      const sequentialTime = Date.now() - startSequential;

      // Parallel should be at least 2x faster
      expect(parallelTime).toBeLessThan(sequentialTime / 2);
    }, 10000);
  });

  describe('Sequential Execution', () => {
    it('should execute operations one at a time', async () => {
      const operations = [1, 2, 3, 4, 5];
      let currentlyExecuting = 0;
      let maxConcurrent = 0;

      const handler = async (n: number) => {
        currentlyExecuting++;
        maxConcurrent = Math.max(maxConcurrent, currentlyExecuting);
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentlyExecuting--;
        return n;
      };

      await batchManager.sequentialExecute(operations, handler);

      expect(maxConcurrent).toBe(1);
    });
  });

  describe('Convenience Function', () => {
    it('should work with executeBatch helper', async () => {
      const operations = [1, 2, 3];
      const handler = async (n: number) => n * 3;

      const result = await executeBatch(operations, handler, {
        maxConcurrent: 2,
      });

      expect(result.results).toEqual([3, 6, 9]);
      expect(result.successRate).toBe(1.0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle mixed success and failure with retries', async () => {
      const operations = [1, 2, 3];
      const attemptCounts = new Map<number, number>();

      const handler = async (n: number) => {
        const count = (attemptCounts.get(n) || 0) + 1;
        attemptCounts.set(n, count);

        // n=2 always fails, n=1 succeeds on retry 2, n=3 succeeds immediately
        if (n === 2) throw new Error('Always fails');
        if (n === 1 && count < 2) throw new Error('Retry me');
        return n * 10;
      };

      const result = await batchManager.batchExecute(operations, handler, {
        retryOnError: true,
        maxRetries: 2,
        failFast: false,
      });

      expect(result.results).toEqual([10, 30]); // 1 and 3 succeed
      expect(result.errors).toHaveLength(1); // 2 fails
      expect(result.successRate).toBeCloseTo(0.667, 2);
    });

    it('should handle operations that return falsy values', async () => {
      const operations = [0, false, null, undefined, ''];

      const handler = async (val: any) => val;

      const result = await batchManager.batchExecute(operations, handler);

      expect(result.results).toEqual([0, false, null, undefined, '']);
      expect(result.successRate).toBe(1.0);
    });

    it('should handle very large batch sizes', async () => {
      const operations = Array.from({ length: 1000 }, (_, i) => i);

      const handler = async (n: number) => n * 2;

      const result = await batchManager.batchExecute(operations, handler, {
        maxConcurrent: 10,
      });

      expect(result.results).toHaveLength(1000);
      expect(result.successRate).toBe(1.0);
    }, 30000);
  });

  describe('Type Safety', () => {
    it('should preserve types through execution', async () => {
      interface TestData {
        id: number;
        name: string;
      }

      interface TestResult {
        id: number;
        processed: boolean;
      }

      const operations: TestData[] = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ];

      const handler = async (data: TestData): Promise<TestResult> => ({
        id: data.id,
        processed: true,
      });

      const result: BatchResult<TestResult> = await batchManager.batchExecute(
        operations,
        handler
      );

      expect(result.results[0].processed).toBe(true);
      expect(result.results[1].id).toBe(2);
    });
  });
});
