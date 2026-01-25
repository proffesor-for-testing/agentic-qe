/**
 * Learning System Performance Benchmarks
 * Validates that learning overhead remains below 100ms per task
 *
 * Benchmarks:
 * 1. Baseline task execution (no learning)
 * 2. Task execution with learning enabled
 * 3. Memory storage overhead
 * 4. Q-table update performance
 * 5. Pattern recognition overhead
 * 6. Batch update performance
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { PerformanceTracker } from '@learning/PerformanceTracker';
import { LearningEngine } from '@learning/LearningEngine';
import { ImprovementLoop } from '@learning/ImprovementLoop';
import { createSeededRandom } from '../../src/utils/SeededRandom';

// Mock Logger before importing
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

jest.mock('@utils/Logger', () => ({
  Logger: {
    getInstance: () => mockLogger
  }
}));

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number;
  p95: number;
  p99: number;
}

function calculatePercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function runBenchmark(
  name: string,
  iterations: number,
  fn: () => Promise<void>
): Promise<BenchmarkResult> {
  return new Promise(async (resolve) => {
    const durations: number[] = [];
    let totalDuration = 0;

    const startTotal = performance.now();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const duration = performance.now() - start;
      durations.push(duration);
      totalDuration += duration;
    }

    const totalTime = performance.now() - startTotal;

    resolve({
      name,
      iterations,
      totalDuration: totalTime,
      avgDuration: totalDuration / iterations,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p50: calculatePercentile(durations, 50),
      p95: calculatePercentile(durations, 95),
      p99: calculatePercentile(durations, 99)
    });
  });
}

function printBenchmarkResult(result: BenchmarkResult): void {
  console.log(`\n${result.name}`);
  console.log(`  Iterations: ${result.iterations}`);
  console.log(`  Total time: ${result.totalDuration.toFixed(2)}ms`);
  console.log(`  Average: ${result.avgDuration.toFixed(3)}ms`);
  console.log(`  Min: ${result.minDuration.toFixed(3)}ms`);
  console.log(`  Max: ${result.maxDuration.toFixed(3)}ms`);
  console.log(`  p50: ${result.p50.toFixed(3)}ms`);
  console.log(`  p95: ${result.p95.toFixed(3)}ms`);
  console.log(`  p99: ${result.p99.toFixed(3)}ms`);
}

describe('Learning System Performance Benchmarks', () => {
  let memoryManager: SwarmMemoryManager;
  let performanceTracker: PerformanceTracker;
  let learningEngine: LearningEngine | null = null;
  let improvementLoop: ImprovementLoop;

  const TEST_AGENT_ID = 'perf-test-agent';
  const MAX_OVERHEAD_MS = 100;

  beforeEach(async () => {
    memoryManager = new SwarmMemoryManager();
    await memoryManager.initialize();

    performanceTracker = new PerformanceTracker(TEST_AGENT_ID, memoryManager);
    await performanceTracker.initialize();

    learningEngine = new LearningEngine(TEST_AGENT_ID, memoryManager, {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.3,
      batchSize: 32
    });
    await learningEngine.initialize();

    improvementLoop = new ImprovementLoop(
      TEST_AGENT_ID,
      memoryManager,
      learningEngine,
      performanceTracker
    );
    await improvementLoop.initialize();
  });

  afterEach(async () => {
    if (improvementLoop.isActive()) {
      await improvementLoop.stop();
    }
    if (learningEngine) {
      learningEngine.dispose();
      learningEngine = null;
    }
    await memoryManager.clear();
  });

  describe('Benchmark 1: Baseline Task Execution', () => {
    it('should measure baseline performance without learning', async () => {
      const ITERATIONS = 1000;

      const result = await runBenchmark(
        'Baseline Task Execution (No Learning)',
        ITERATIONS,
        async () => {
          // Simulate minimal task execution
          await new Promise(resolve => setImmediate(resolve));
        }
      );

      printBenchmarkResult(result);

      expect(result.avgDuration).toBeLessThan(10); // Should be very fast
      expect(result.p99).toBeLessThan(20);
    }, 60000);
  });

  describe('Benchmark 2: Learning Engine Overhead', () => {
    it('should measure learning overhead per task', async () => {
      const ITERATIONS = 1000;
      let taskId = 0;
      const rng = createSeededRandom(800001);

      const result = await runBenchmark(
        'Learning Engine - Full Learning Cycle',
        ITERATIONS,
        async () => {
          const task = {
            id: `bench-task-${taskId++}`,
            type: 'test-execution',
            previousAttempts: 0
          };

          const taskResult = {
            success: rng.random() > 0.2,
            executionTime: 100 + rng.random() * 100,
            strategy: 'default',
            toolsUsed: ['jest'],
            parallelization: 0.5,
            retryPolicy: 'exponential',
            resourceAllocation: 0.6
          };

          await learningEngine.learnFromExecution(task, taskResult);
        }
      );

      printBenchmarkResult(result);

      // Verify overhead is acceptable
      expect(result.avgDuration).toBeLessThan(MAX_OVERHEAD_MS);
      expect(result.p95).toBeLessThan(MAX_OVERHEAD_MS * 1.5);
      expect(result.p99).toBeLessThan(MAX_OVERHEAD_MS * 2);

      console.log(`\n✓ Learning overhead within acceptable limits (<${MAX_OVERHEAD_MS}ms)`);
      console.log(`  Average overhead: ${result.avgDuration.toFixed(2)}ms`);
      console.log(`  P95 overhead: ${result.p95.toFixed(2)}ms`);
      console.log(`  P99 overhead: ${result.p99.toFixed(2)}ms`);
    }, 120000);
  });

  describe('Benchmark 3: Performance Tracker Overhead', () => {
    it('should measure performance tracking overhead', async () => {
      const ITERATIONS = 500;

      const result = await runBenchmark(
        'Performance Tracker - Record Snapshot',
        ITERATIONS,
        async () => {
          await performanceTracker.recordSnapshot({
            tasksCompleted: 10,
            successRate: 0.8,
            averageExecutionTime: 3000,
            errorRate: 0.2,
            userSatisfaction: 0.85,
            resourceEfficiency: 0.7
          });
        }
      );

      printBenchmarkResult(result);

      expect(result.avgDuration).toBeLessThan(50); // Should be fast
      expect(result.p99).toBeLessThan(100);

      console.log('\n✓ Performance tracking overhead acceptable');
    }, 60000);
  });

  describe('Benchmark 4: Memory Storage Overhead', () => {
    it('should measure memory storage performance', async () => {
      const ITERATIONS = 500;
      let counter = 0;

      const result = await runBenchmark(
        'Memory Storage - Store/Retrieve',
        ITERATIONS,
        async () => {
          const key = `bench/test-${counter++}`;
          const data = {
            id: counter,
            timestamp: Date.now(),
            metrics: { success: true, duration: 100 }
          };

          await memoryManager.store(key, data, { partition: 'benchmark' });
          await memoryManager.retrieve(key, { partition: 'benchmark' });
        }
      );

      printBenchmarkResult(result);

      expect(result.avgDuration).toBeLessThan(30);
      expect(result.p99).toBeLessThan(60);

      console.log('\n✓ Memory storage overhead acceptable');
    }, 60000);
  });

  describe('Benchmark 5: Strategy Recommendation', () => {
    it('should measure strategy recommendation overhead', async () => {
      // Pre-populate learning engine with experiences
      const rng = createSeededRandom(800002);
      for (let i = 0; i < 100; i++) {
        await learningEngine.learnFromExecution(
          { id: `warmup-${i}`, type: 'test', previousAttempts: 0 },
          {
            success: rng.random() > 0.3,
            executionTime: 100,
            strategy: i % 2 === 0 ? 'parallel' : 'sequential',
            toolsUsed: ['jest'],
            parallelization: 0.5,
            retryPolicy: 'exponential',
            resourceAllocation: 0.6
          }
        );
      }

      const ITERATIONS = 200;

      const result = await runBenchmark(
        'Learning Engine - Strategy Recommendation',
        ITERATIONS,
        async () => {
          await learningEngine.recommendStrategy({
            taskComplexity: 0.6,
            requiredCapabilities: ['test-execution'],
            contextFeatures: {},
            previousAttempts: 0,
            availableResources: 0.8
          });
        }
      );

      printBenchmarkResult(result);

      expect(result.avgDuration).toBeLessThan(10);
      expect(result.p99).toBeLessThan(30);

      console.log('\n✓ Strategy recommendation overhead acceptable');
    }, 60000);
  });

  describe('Benchmark 6: Pattern Recognition', () => {
    it('should measure pattern recognition overhead', async () => {
      // Pre-populate with patterns
      for (let i = 0; i < 50; i++) {
        await learningEngine.learnFromExecution(
          { id: `pattern-${i}`, type: 'test-generation', previousAttempts: 0 },
          {
            success: true,
            executionTime: 100,
            strategy: 'parallel',
            toolsUsed: ['jest'],
            parallelization: 0.8,
            retryPolicy: 'exponential',
            resourceAllocation: 0.7
          }
        );
      }

      const ITERATIONS = 500;

      const result = await runBenchmark(
        'Learning Engine - Get Patterns',
        ITERATIONS,
        async () => {
          learningEngine.getPatterns();
          await new Promise(resolve => setImmediate(resolve));
        }
      );

      printBenchmarkResult(result);

      expect(result.avgDuration).toBeLessThan(5);
      expect(result.p99).toBeLessThan(15);

      console.log('\n✓ Pattern recognition overhead acceptable');
    }, 60000);
  });

  describe('Benchmark 7: Improvement Loop Cycle', () => {
    it('should measure improvement loop cycle time', async () => {
      // Setup baseline data
      await performanceTracker.recordSnapshot({
        tasksCompleted: 10,
        successRate: 0.7,
        averageExecutionTime: 5000,
        errorRate: 0.3,
        userSatisfaction: 0.7,
        resourceEfficiency: 0.6
      });

      const rng = createSeededRandom(800003);
      for (let i = 0; i < 50; i++) {
        await learningEngine.learnFromExecution(
          { id: `cycle-${i}`, type: 'test', previousAttempts: 0 },
          {
            success: rng.random() > 0.2,
            executionTime: 3000,
            strategy: 'adaptive',
            toolsUsed: ['jest'],
            parallelization: 0.6,
            retryPolicy: 'exponential',
            resourceAllocation: 0.7
          }
        );
      }

      await performanceTracker.recordSnapshot({
        tasksCompleted: 60,
        successRate: 0.85,
        averageExecutionTime: 3500,
        errorRate: 0.15,
        userSatisfaction: 0.85,
        resourceEfficiency: 0.75
      });

      const ITERATIONS = 10;

      const result = await runBenchmark(
        'Improvement Loop - Full Cycle',
        ITERATIONS,
        async () => {
          await improvementLoop.runImprovementCycle();
        }
      );

      printBenchmarkResult(result);

      // Improvement loop can be slower, but should still be reasonable
      expect(result.avgDuration).toBeLessThan(1000); // 1 second max
      expect(result.p99).toBeLessThan(2000);

      console.log('\n✓ Improvement loop cycle time acceptable');
    }, 60000);
  });

  describe('Performance Summary', () => {
    it('should generate comprehensive performance report', async () => {
      console.log('\n' + '='.repeat(80));
      console.log('LEARNING SYSTEM PERFORMANCE SUMMARY');
      console.log('='.repeat(80));

      const benchmarks: BenchmarkResult[] = [];

      // Run all benchmarks
      benchmarks.push(await runBenchmark('Baseline', 1000, async () => {
        await new Promise(resolve => setImmediate(resolve));
      }));

      benchmarks.push(await runBenchmark('Learning Engine', 500, async () => {
        await learningEngine.learnFromExecution(
          { id: 'test', type: 'test', previousAttempts: 0 },
          { success: true, executionTime: 100, strategy: 'default', toolsUsed: [], parallelization: 0.5, retryPolicy: 'exponential', resourceAllocation: 0.6 }
        );
      }));

      benchmarks.push(await runBenchmark('Performance Tracker', 500, async () => {
        await performanceTracker.recordSnapshot({
          tasksCompleted: 10, successRate: 0.8, averageExecutionTime: 3000,
          errorRate: 0.2, userSatisfaction: 0.8, resourceEfficiency: 0.7
        });
      }));

      // Print summary table
      console.log('\nPerformance Metrics:');
      console.log('-'.repeat(80));
      console.log(
        'Component'.padEnd(30) +
        'Avg (ms)'.padEnd(12) +
        'p50 (ms)'.padEnd(12) +
        'p95 (ms)'.padEnd(12) +
        'p99 (ms)'.padEnd(12)
      );
      console.log('-'.repeat(80));

      benchmarks.forEach(b => {
        console.log(
          b.name.padEnd(30) +
          b.avgDuration.toFixed(2).padEnd(12) +
          b.p50.toFixed(2).padEnd(12) +
          b.p95.toFixed(2).padEnd(12) +
          b.p99.toFixed(2).padEnd(12)
        );
      });

      console.log('-'.repeat(80));

      // Calculate overhead
      const baseline = benchmarks[0].avgDuration;
      const learning = benchmarks[1].avgDuration;
      const overhead = learning - baseline;
      const overheadPercent = (overhead / baseline) * 100;

      console.log(`\nOverhead Analysis:`);
      console.log(`  Baseline: ${baseline.toFixed(3)}ms`);
      console.log(`  With Learning: ${learning.toFixed(3)}ms`);
      console.log(`  Overhead: ${overhead.toFixed(3)}ms (${overheadPercent.toFixed(1)}%)`);
      console.log(`  Target: <${MAX_OVERHEAD_MS}ms`);
      console.log(`  Status: ${overhead < MAX_OVERHEAD_MS ? '✓ PASS' : '✗ FAIL'}`);

      console.log('\n' + '='.repeat(80));

      // Final assertion
      expect(overhead).toBeLessThan(MAX_OVERHEAD_MS);
    }, 180000);
  });
});
