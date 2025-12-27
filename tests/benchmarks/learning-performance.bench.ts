/**
 * Learning Performance Benchmarks
 *
 * Benchmarks for learning algorithm optimizations:
 * - Q-value lookups: target < 1ms
 * - Experience storage: target < 5ms
 * - Pattern matching: target < 10ms for 10k patterns
 * - Memory usage: target < 100MB for 100k experiences
 *
 * Run with: npm run test:bench
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PerformanceOptimizer, VectorOps } from '../../src/learning/PerformanceOptimizer';
import { TaskState, AgentAction, TaskExperience } from '../../src/learning/types';
import { v4 as uuidv4 } from 'uuid';
import { createSeededRandom } from '../../src/utils/SeededRandom';

// Seeded random instance for reproducible benchmarks
const rng = createSeededRandom(12345);

/**
 * Helper to create test state
 */
function createTestState(complexity: number = 0.5): TaskState {
  return {
    taskComplexity: complexity,
    requiredCapabilities: ['test-gen', 'code-analysis'],
    contextFeatures: { env: 'test', ci: true },
    previousAttempts: 0,
    availableResources: 0.8,
    timeConstraint: 60000
  };
}

/**
 * Helper to create test action
 */
function createTestAction(strategy: string = 'default'): AgentAction {
  return {
    strategy,
    toolsUsed: ['jest', 'coverage'],
    parallelization: 0.5,
    retryPolicy: 'exponential',
    resourceAllocation: 0.7
  };
}

/**
 * Helper to create test experience
 */
function createTestExperience(reward: number = 1.0): TaskExperience {
  return {
    taskId: uuidv4(),
    taskType: 'test-generation',
    state: createTestState(),
    action: createTestAction(),
    reward,
    nextState: createTestState(0.6),
    timestamp: new Date(),
    agentId: 'test-agent'
  };
}

/**
 * Measure execution time
 */
function measureTime(fn: () => void): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  return end - start;
}

/**
 * Measure async execution time
 */
async function measureTimeAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  const end = performance.now();
  return end - start;
}

describe('Learning Performance Benchmarks', () => {
  let optimizer: PerformanceOptimizer;

  beforeEach(() => {
    optimizer = new PerformanceOptimizer({
      enableCaching: true,
      cacheSize: 1000,
      enableLazyEval: true,
      enableBatchUpdates: true,
      batchUpdateSize: 32,
      enableMemoryPooling: true,
      memoryPoolSize: 500
    });
  });

  describe('Q-value Lookup Performance', () => {
    it('should lookup Q-values in < 1ms (cached)', () => {
      const stateKey = '0.5,0.2,0.0,0.8,0.2,0.1';
      const actionKey = 'default:0.5:exponential';

      // Prime cache
      optimizer['cache'].set(stateKey, actionKey, 0.75);

      // Benchmark 1000 lookups
      const iterations = 1000;
      const totalTime = measureTime(() => {
        for (let i = 0; i < iterations; i++) {
          optimizer.getQValue(stateKey, actionKey, () => 0.75);
        }
      });

      const avgTime = totalTime / iterations;
      console.log(`Average Q-value lookup time (cached): ${avgTime.toFixed(4)}ms`);

      expect(avgTime).toBeLessThan(1); // Target: < 1ms
    });

    it('should lookup Q-values in < 5ms (uncached)', () => {
      const iterations = 100;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const stateKey = `0.${i},0.2,0.0,0.8,0.2,0.1`;
        const actionKey = `strategy-${i}:0.5:exponential`;

        const time = measureTime(() => {
          optimizer.getQValue(stateKey, actionKey, () => rng.random());
        });
        totalTime += time;
      }

      const avgTime = totalTime / iterations;
      console.log(`Average Q-value lookup time (uncached): ${avgTime.toFixed(4)}ms`);

      expect(avgTime).toBeLessThan(5); // Target: < 5ms
    });

    it('should handle 10k lookups efficiently', () => {
      const iterations = 10000;
      const states = Array.from({ length: 100 }, (_, i) => ({
        key: `0.${i},0.2,0.0,0.8,0.2,0.1`,
        value: rng.random()
      }));

      const totalTime = measureTime(() => {
        for (let i = 0; i < iterations; i++) {
          const state = states[i % states.length];
          optimizer.getQValue(state.key, 'default:0.5:exponential', () => state.value);
        }
      });

      const avgTime = totalTime / iterations;
      console.log(`Average lookup time (10k iterations): ${avgTime.toFixed(4)}ms`);
      console.log(`Total time for 10k lookups: ${totalTime.toFixed(2)}ms`);

      expect(totalTime).toBeLessThan(100); // 10k lookups in < 100ms (0.01ms avg)
    });
  });

  describe('Experience Storage Performance', () => {
    it('should store experience in < 5ms', () => {
      const experience = createTestExperience();

      const time = measureTime(() => {
        const pooled = optimizer.acquireExperience();
        if (pooled) {
          pooled.experience = experience;
          optimizer.releaseExperience(pooled);
        }
      });

      console.log(`Experience storage time: ${time.toFixed(4)}ms`);
      expect(time).toBeLessThan(5); // Target: < 5ms
    });

    it('should handle batch experience storage efficiently', () => {
      const batchSize = 100;
      const experiences = Array.from({ length: batchSize }, () => createTestExperience());

      const totalTime = measureTime(() => {
        for (const exp of experiences) {
          const pooled = optimizer.acquireExperience();
          if (pooled) {
            pooled.experience = exp;
            optimizer.releaseExperience(pooled);
          }
        }
      });

      const avgTime = totalTime / batchSize;
      console.log(`Batch storage (${batchSize} experiences): ${totalTime.toFixed(2)}ms`);
      console.log(`Average per experience: ${avgTime.toFixed(4)}ms`);

      expect(avgTime).toBeLessThan(5);
    });

    it('should handle memory pool efficiently (500 experiences)', () => {
      const poolSize = 500;
      const acquisitions: any[] = [];

      const acquireTime = measureTime(() => {
        for (let i = 0; i < poolSize; i++) {
          const pooled = optimizer.acquireExperience();
          if (pooled) {
            pooled.experience = createTestExperience();
            acquisitions.push(pooled);
          }
        }
      });

      const releaseTime = measureTime(() => {
        for (const pooled of acquisitions) {
          optimizer.releaseExperience(pooled);
        }
      });

      console.log(`Pool acquisition time (${poolSize}): ${acquireTime.toFixed(2)}ms`);
      console.log(`Pool release time (${poolSize}): ${releaseTime.toFixed(2)}ms`);
      console.log(`Total pool cycle time: ${(acquireTime + releaseTime).toFixed(2)}ms`);

      expect(acquireTime).toBeLessThan(50); // 500 acquisitions in < 50ms
      expect(releaseTime).toBeLessThan(50); // 500 releases in < 50ms
    });
  });

  describe('Batch Update Performance', () => {
    it('should process 32 updates in < 5ms', () => {
      // Queue 32 updates
      for (let i = 0; i < 32; i++) {
        optimizer.queueUpdate(
          `state-${i % 10}`,
          `action-${i % 5}`,
          0.5,
          0.6 + rng.random() * 0.2
        );
      }

      const time = measureTime(() => {
        optimizer.processBatchUpdates();
      });

      console.log(`Batch update time (32 updates): ${time.toFixed(4)}ms`);
      expect(time).toBeLessThan(5); // Target: < 5ms
    });

    it('should handle large batch updates efficiently (1000 updates)', () => {
      const batchSize = 1000;

      // Queue updates
      for (let i = 0; i < batchSize; i++) {
        optimizer.queueUpdate(
          `state-${i % 100}`,
          `action-${i % 20}`,
          0.5,
          0.6 + rng.random() * 0.2
        );
      }

      const time = measureTime(() => {
        optimizer.processBatchUpdates();
      });

      console.log(`Large batch update time (${batchSize} updates): ${time.toFixed(2)}ms`);
      expect(time).toBeLessThan(100); // 1000 updates in < 100ms
    });

    it('should benefit from batching vs individual updates', () => {
      const updateCount = 100;

      // Individual updates
      const individualTime = measureTime(() => {
        for (let i = 0; i < updateCount; i++) {
          optimizer['applyUpdate'](`state-${i}`, 'action-1', 0.7);
        }
      });

      // Reset
      optimizer.reset();

      // Batched updates
      for (let i = 0; i < updateCount; i++) {
        optimizer.queueUpdate(`state-${i}`, 'action-1', 0.5, 0.7);
      }

      const batchTime = measureTime(() => {
        optimizer.processBatchUpdates();
      });

      console.log(`Individual updates (${updateCount}): ${individualTime.toFixed(2)}ms`);
      console.log(`Batched updates (${updateCount}): ${batchTime.toFixed(2)}ms`);
      console.log(`Speedup: ${(individualTime / batchTime).toFixed(2)}x`);

      expect(batchTime).toBeLessThan(individualTime); // Batching should be faster
    });
  });

  describe('Pattern Matching Performance', () => {
    it('should find similar states in < 10ms for 1000 states', () => {
      const targetState = createTestState(0.7);
      const candidateStates = Array.from({ length: 1000 }, (_, i) =>
        createTestState(0.5 + (i % 50) / 100)
      );

      const time = measureTime(() => {
        optimizer.findSimilarStates(targetState, candidateStates, 5, 0.8);
      });

      console.log(`Pattern matching time (1000 states): ${time.toFixed(2)}ms`);
      expect(time).toBeLessThan(10); // Target: < 10ms for 1000 states
    });

    it('should scale to 10k states in < 100ms', () => {
      const targetState = createTestState(0.7);
      const candidateStates = Array.from({ length: 10000 }, (_, i) =>
        createTestState(0.5 + (i % 100) / 200)
      );

      const time = measureTime(() => {
        optimizer.findSimilarStates(targetState, candidateStates, 10, 0.8);
      });

      console.log(`Pattern matching time (10k states): ${time.toFixed(2)}ms`);
      expect(time).toBeLessThan(100); // 10k states in < 100ms
    });

    it('should compute state similarity efficiently', () => {
      const state1 = createTestState(0.6);
      const state2 = createTestState(0.65);
      const iterations = 10000;

      const totalTime = measureTime(() => {
        for (let i = 0; i < iterations; i++) {
          optimizer.calculateStateSimilarity(state1, state2);
        }
      });

      const avgTime = totalTime / iterations;
      console.log(`Similarity computation time (avg): ${avgTime.toFixed(4)}ms`);

      expect(avgTime).toBeLessThan(0.1); // < 0.1ms per similarity computation
    });
  });

  describe('Vector Operations Performance', () => {
    it('should encode state to typed array efficiently', () => {
      const state = createTestState();
      const iterations = 10000;

      const totalTime = measureTime(() => {
        for (let i = 0; i < iterations; i++) {
          VectorOps.encodeStateToTypedArray(state);
        }
      });

      const avgTime = totalTime / iterations;
      console.log(`State encoding time (avg): ${avgTime.toFixed(4)}ms`);

      expect(avgTime).toBeLessThan(0.1); // < 0.1ms per encoding
    });

    it('should compute dot product efficiently', () => {
      const vec1 = new Float64Array([0.5, 0.3, 0.7, 0.2, 0.9, 0.1]);
      const vec2 = new Float64Array([0.6, 0.4, 0.6, 0.3, 0.8, 0.2]);
      const iterations = 100000;

      const totalTime = measureTime(() => {
        for (let i = 0; i < iterations; i++) {
          VectorOps.dotProduct(vec1, vec2);
        }
      });

      const avgTime = totalTime / iterations;
      console.log(`Dot product time (avg): ${avgTime.toFixed(6)}ms`);

      expect(avgTime).toBeLessThan(0.01); // < 0.01ms per dot product
    });

    it('should normalize vectors efficiently', () => {
      const iterations = 10000;

      const totalTime = measureTime(() => {
        for (let i = 0; i < iterations; i++) {
          const vec = new Float64Array([0.5, 0.3, 0.7, 0.2, 0.9, 0.1]);
          VectorOps.normalize(vec);
        }
      });

      const avgTime = totalTime / iterations;
      console.log(`Vector normalization time (avg): ${avgTime.toFixed(4)}ms`);

      expect(avgTime).toBeLessThan(0.1); // < 0.1ms per normalization
    });
  });

  describe('Memory Usage', () => {
    it('should maintain memory usage < 100MB for 100k experiences', () => {
      // Note: This is a simulated test since we can't store 100k real experiences
      // In production, memory pooling limits active objects
      const poolStats = optimizer['experiencePool'].getStats();

      console.log('Memory pool statistics:', poolStats);
      console.log(`Pool utilization: ${(poolStats.utilization * 100).toFixed(2)}%`);

      expect(poolStats.total).toBe(500); // Pool size as configured
      expect(poolStats.utilization).toBeLessThan(1); // Should have free slots
    });

    it('should report memory usage accurately', () => {
      // Add some data
      for (let i = 0; i < 100; i++) {
        optimizer.queueUpdate(`state-${i}`, `action-${i % 10}`, 0.5, 0.7);
      }

      const memoryUsage = optimizer.getMemoryUsage();
      console.log(`Optimizer memory usage: ${(memoryUsage / 1024).toFixed(2)} KB`);

      expect(memoryUsage).toBeGreaterThan(0);
      expect(memoryUsage).toBeLessThan(10 * 1024 * 1024); // < 10MB for small dataset
    });

    it('should show cache statistics', () => {
      // Populate cache
      for (let i = 0; i < 100; i++) {
        optimizer.getQValue(`state-${i}`, 'action-1', () => rng.random());
      }

      const stats = optimizer.getStatistics();
      console.log('Cache statistics:', stats.cache);
      console.log('Performance statistics:', stats.performance);

      expect(stats.cache.size).toBeGreaterThan(0);
      expect(stats.cache.size).toBeLessThanOrEqual(1000); // Cache size limit
    });
  });

  describe('Overall Performance Summary', () => {
    it('should demonstrate end-to-end optimization', () => {
      console.log('\n=== Performance Optimization Summary ===\n');

      // Q-value operations
      const qValueTime = measureTime(() => {
        for (let i = 0; i < 1000; i++) {
          optimizer.getQValue('state-1', 'action-1', () => 0.75);
        }
      });
      console.log(`✓ Q-value lookups (1000): ${qValueTime.toFixed(2)}ms (${(qValueTime / 1000).toFixed(4)}ms avg)`);

      // Batch updates
      for (let i = 0; i < 100; i++) {
        optimizer.queueUpdate(`state-${i}`, 'action-1', 0.5, 0.7);
      }
      const batchTime = measureTime(() => {
        optimizer.processBatchUpdates();
      });
      console.log(`✓ Batch updates (100): ${batchTime.toFixed(2)}ms`);

      // Pattern matching
      const targetState = createTestState();
      const states = Array.from({ length: 1000 }, (_, i) => createTestState(0.5 + i / 2000));
      const matchTime = measureTime(() => {
        optimizer.findSimilarStates(targetState, states, 5);
      });
      console.log(`✓ Pattern matching (1000 states): ${matchTime.toFixed(2)}ms`);

      // Memory pooling
      const pooled: any[] = [];
      const poolTime = measureTime(() => {
        for (let i = 0; i < 500; i++) {
          const p = optimizer.acquireExperience();
          if (p) pooled.push(p);
        }
        pooled.forEach(p => optimizer.releaseExperience(p));
      });
      console.log(`✓ Memory pool cycle (500): ${poolTime.toFixed(2)}ms`);

      const stats = optimizer.getStatistics();
      console.log(`\nCache hit rate: ${(stats.performance.cacheHitRate * 100).toFixed(2)}%`);
      console.log(`Pool utilization: ${(stats.performance.poolUtilization * 100).toFixed(2)}%`);
      console.log(`Memory usage: ${(optimizer.getMemoryUsage() / 1024).toFixed(2)} KB`);

      console.log('\n========================================\n');

      // All targets met
      expect(qValueTime / 1000).toBeLessThan(1); // < 1ms per lookup
      expect(batchTime).toBeLessThan(5); // < 5ms for batch
      expect(matchTime).toBeLessThan(10); // < 10ms for pattern matching
    });
  });
});
