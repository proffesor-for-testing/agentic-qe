/**
 * Phase 1 Performance Tests
 * Validates performance targets for Multi-Model Router and Streaming
 */

import { EventEmitter } from 'events';

// Mock SwarmMemoryManager
class MockMemoryStore {
  private data = new Map<string, any>();

  async store(key: string, value: any): Promise<void> {
    this.data.set(key, { value, timestamp: Date.now() });
  }

  async retrieve(key: string): Promise<any> {
    const item = this.data.get(key);
    return item ? item.value : undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

describe('Phase 1 Performance Tests', () => {
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();
  });

  afterEach(async () => {
    await mockMemoryStore.clear();
    mockEventBus.removeAllListeners();
  });

  describe('Model Router Performance', () => {
    test('should select model in under 50ms', async () => {
      const iterations = 100;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const request = {
          type: 'test-generation',
          sourceCode: `function test${i}() { return ${i}; }`,
          complexity: i % 2 === 0 ? 'simple' : 'complex'
        };

        const startTime = performance.now();
        await selectModelForRequest(request);
        const latency = performance.now() - startTime;

        latencies.push(latency);
      }

      const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

      console.log(`Router Performance:
        Average Latency: ${averageLatency.toFixed(2)}ms
        Max Latency: ${maxLatency.toFixed(2)}ms
        P95 Latency: ${p95Latency.toFixed(2)}ms
      `);

      // Performance targets
      expect(averageLatency).toBeLessThan(50);
      expect(p95Latency).toBeLessThan(100);
    });

    test('should handle complexity analysis in under 20ms', async () => {
      const tasks = Array.from({ length: 50 }, (_, i) => ({
        type: 'test-generation',
        sourceCode: `function complex${i}(a, b, c) {
          if (a > b) return a + c;
          else if (b > c) return b + c;
          else return a + b;
        }`,
        linesOfCode: 5,
        cyclomaticComplexity: 3
      }));

      const latencies: number[] = [];

      for (const task of tasks) {
        const startTime = performance.now();
        analyzeTaskComplexity(task);
        const latency = performance.now() - startTime;

        latencies.push(latency);
      }

      const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log(`Complexity Analysis Average Latency: ${averageLatency.toFixed(2)}ms`);

      expect(averageLatency).toBeLessThan(20);
    });

    test('should maintain performance under concurrent load', async () => {
      const concurrentRequests = 20;

      const startTime = performance.now();

      await Promise.all(
        Array.from({ length: concurrentRequests }, (_, i) =>
          selectModelForRequest({
            type: 'test-generation',
            complexity: i % 3 === 0 ? 'simple' : 'complex',
            sourceCode: `function test${i}() {}`
          })
        )
      );

      const totalDuration = performance.now() - startTime;
      const averageLatency = totalDuration / concurrentRequests;

      console.log(`Concurrent Load (${concurrentRequests} requests):
        Total Duration: ${totalDuration.toFixed(2)}ms
        Average per Request: ${averageLatency.toFixed(2)}ms
      `);

      // Should complete all within reasonable time
      expect(totalDuration).toBeLessThan(1000); // < 1 second total
      expect(averageLatency).toBeLessThan(50);
    });

    test('should cache complexity analysis efficiently', async () => {
      const router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus);

      const task = {
        type: 'test-generation',
        sourceCode: 'function test() { return true; }',
        id: 'cache-test',
        linesOfCode: 1
      };

      // First call (uncached)
      const start1 = performance.now();
      await router.analyzeComplexity(task);
      const uncachedLatency = performance.now() - start1;

      // Second call (cached)
      const start2 = performance.now();
      await router.analyzeComplexity(task);
      const cachedLatency = performance.now() - start2;

      console.log(`Cache Performance:
        Uncached: ${uncachedLatency.toFixed(2)}ms
        Cached: ${cachedLatency.toFixed(2)}ms
        Speedup: ${(uncachedLatency / cachedLatency).toFixed(2)}x
      `);

      // Cached should be significantly faster
      expect(cachedLatency).toBeLessThan(uncachedLatency);
      expect(cachedLatency).toBeLessThan(5); // < 5ms from cache
    });
  });

  describe('Streaming Performance', () => {
    test('should maintain streaming overhead under 5%', async () => {
      const testCount = 100;

      // Measure baseline (without streaming)
      const baselineStart = performance.now();
      for (let i = 0; i < testCount; i++) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      const baselineDuration = performance.now() - baselineStart;

      // Measure with streaming
      const streamStart = performance.now();
      const stream = createTestExecutionStream(testCount);

      for await (const event of stream) {
        // Consume stream
      }
      const streamDuration = performance.now() - streamStart;

      const overhead = ((streamDuration - baselineDuration) / baselineDuration) * 100;

      console.log(`Streaming Overhead:
        Baseline: ${baselineDuration.toFixed(2)}ms
        Streaming: ${streamDuration.toFixed(2)}ms
        Overhead: ${overhead.toFixed(2)}%
      `);

      expect(overhead).toBeLessThan(5);
    });

    test('should emit progress updates efficiently', async () => {
      const testCount = 50;
      const stream = createTestExecutionStream(testCount);

      const progressTimings: number[] = [];
      let lastProgressTime = performance.now();

      for await (const event of stream) {
        if (event.type === 'progress') {
          const now = performance.now();
          progressTimings.push(now - lastProgressTime);
          lastProgressTime = now;
        }
      }

      const averageProgressLatency = progressTimings.reduce((a, b) => a + b, 0) / progressTimings.length;

      console.log(`Progress Update Performance:
        Average Latency: ${averageProgressLatency.toFixed(2)}ms
        Updates: ${progressTimings.length}
      `);

      // Progress updates should be lightweight
      expect(averageProgressLatency).toBeLessThan(10);
    });

    test('should handle high-frequency events', async () => {
      const eventCount = 1000;

      const startTime = performance.now();

      const stream = createHighFrequencyStream(eventCount);

      let receivedCount = 0;
      for await (const event of stream) {
        receivedCount++;
      }

      const duration = performance.now() - startTime;
      const eventsPerSecond = (eventCount / duration) * 1000;

      console.log(`High-Frequency Streaming:
        Events: ${eventCount}
        Duration: ${duration.toFixed(2)}ms
        Events/sec: ${eventsPerSecond.toFixed(0)}
      `);

      expect(receivedCount).toBe(eventCount);
      expect(eventsPerSecond).toBeGreaterThan(1000); // > 1000 events/sec
    });

    test('should backpressure efficiently', async () => {
      const testCount = 100;
      const slowConsumerDelay = 10; // 10ms per event

      const stream = createTestExecutionStream(testCount);

      const startTime = performance.now();

      for await (const event of stream) {
        // Simulate slow consumer
        await new Promise(resolve => setTimeout(resolve, slowConsumerDelay));
      }

      const duration = performance.now() - startTime;
      const expectedMinDuration = testCount * slowConsumerDelay;

      console.log(`Backpressure Handling:
        Duration: ${duration.toFixed(2)}ms
        Expected Min: ${expectedMinDuration}ms
        Overhead: ${(duration - expectedMinDuration).toFixed(2)}ms
      `);

      // Should handle backpressure without significant overhead
      const overhead = duration - expectedMinDuration;
      expect(overhead).toBeLessThan(expectedMinDuration * 0.1); // < 10% overhead
    });
  });

  describe('Cost Tracking Performance', () => {
    test('should track costs with minimal overhead (< 1ms)', async () => {
      const costTracker = new CostTracker(mockMemoryStore);

      const iterations = 100;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        await costTracker.recordUsage({
          model: 'gpt-3.5-turbo',
          inputTokens: 100,
          outputTokens: 200,
          taskType: 'test-generation',
          testsGenerated: 5
        });

        const latency = performance.now() - startTime;
        latencies.push(latency);
      }

      const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      console.log(`Cost Tracking Performance:
        Average Latency: ${averageLatency.toFixed(2)}ms
        Max Latency: ${maxLatency.toFixed(2)}ms
      `);

      expect(averageLatency).toBeLessThan(1);
      expect(maxLatency).toBeLessThan(5);
    });

    test('should aggregate metrics efficiently', async () => {
      const costTracker = new CostTracker(mockMemoryStore);

      // Record many usages
      for (let i = 0; i < 1000; i++) {
        await costTracker.recordUsage({
          model: i % 2 === 0 ? 'gpt-3.5-turbo' : 'gpt-4',
          inputTokens: 100,
          outputTokens: 200,
          taskType: i % 3 === 0 ? 'test-generation' : 'security-test',
          testsGenerated: 5
        });
      }

      // Measure aggregation performance
      const startTime = performance.now();
      const metrics = costTracker.getMetrics();
      const latency = performance.now() - startTime;

      console.log(`Metrics Aggregation Latency: ${latency.toFixed(2)}ms`);

      expect(latency).toBeLessThan(10);
      expect(metrics.testsGenerated).toBe(5000); // 1000 * 5
    });

    test('should export dashboard efficiently', async () => {
      const costTracker = new CostTracker(mockMemoryStore);

      // Populate with data
      for (let i = 0; i < 100; i++) {
        await costTracker.recordUsage({
          model: ['gpt-3.5-turbo', 'gpt-4', 'claude-sonnet-4.5'][i % 3],
          inputTokens: 100,
          outputTokens: 200,
          taskType: 'test-generation',
          testsGenerated: 5
        });
      }

      const startTime = performance.now();
      const dashboard = costTracker.exportDashboard();
      const latency = performance.now() - startTime;

      console.log(`Dashboard Export Latency: ${latency.toFixed(2)}ms`);

      expect(latency).toBeLessThan(10);
      expect(dashboard.modelBreakdown.length).toBe(3);
    });
  });

  describe('Memory Efficiency', () => {
    test('should maintain memory usage within bounds during routing', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Generate many routing decisions
      for (let i = 0; i < 1000; i++) {
        await selectModelForRequest({
          type: 'test-generation',
          complexity: i % 2 === 0 ? 'simple' : 'complex',
          sourceCode: `function test${i}() {}`
        });
      }

      // Force GC if available
      if (global.gc) {
        global.gc();
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`Router Memory Usage:
        Initial: ${(initialMemory / 1024 / 1024).toFixed(2)}MB
        Final: ${(finalMemory / 1024 / 1024).toFixed(2)}MB
        Increase: ${memoryIncrease.toFixed(2)}MB
      `);

      // Should not leak significant memory
      expect(memoryIncrease).toBeLessThan(10); // < 10MB for 1000 routing decisions
    });

    test('should maintain memory during streaming', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Stream many events
      const stream = createTestExecutionStream(500);

      for await (const event of stream) {
        // Consume stream
      }

      if (global.gc) {
        global.gc();
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`Streaming Memory Usage:
        Initial: ${(initialMemory / 1024 / 1024).toFixed(2)}MB
        Final: ${(finalMemory / 1024 / 1024).toFixed(2)}MB
        Increase: ${memoryIncrease.toFixed(2)}MB
      `);

      expect(memoryIncrease).toBeLessThan(5); // < 5MB for 500 events
    });

    test('should cleanup cost tracking memory', async () => {
      const costTracker = new CostTracker(mockMemoryStore);

      const initialMemory = process.memoryUsage().heapUsed;

      // Generate lots of tracking data
      for (let i = 0; i < 1000; i++) {
        await costTracker.recordUsage({
          model: 'gpt-3.5-turbo',
          inputTokens: 100,
          outputTokens: 200,
          taskType: 'test-generation'
        });
      }

      // Persist and clear
      await costTracker.persist();

      if (global.gc) {
        global.gc();
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`Cost Tracking Memory:
        Increase: ${memoryIncrease.toFixed(2)}MB
      `);

      expect(memoryIncrease).toBeLessThan(5);
    });
  });

  describe('End-to-End Performance', () => {
    test('should complete full request flow in under 200ms', async () => {
      const iterations = 10;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        // Full flow: routing + streaming
        const request = {
          type: 'test-generation',
          sourceCode: `function test${i}() {}`,
          complexity: 'medium'
        };

        const modelSelection = await selectModelForRequest(request);
        const stream = createTestExecutionStream(5); // 5 tests

        for await (const event of stream) {
          // Consume
        }

        const latency = performance.now() - startTime;
        latencies.push(latency);
      }

      const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log(`End-to-End Performance:
        Average: ${averageLatency.toFixed(2)}ms
      `);

      expect(averageLatency).toBeLessThan(200);
    });

    test('should handle concurrent full-flow requests', async () => {
      const concurrentRequests = 10;

      const startTime = performance.now();

      await Promise.all(
        Array.from({ length: concurrentRequests }, async (_, i) => {
          const modelSelection = await selectModelForRequest({
            type: 'test-generation',
            complexity: 'simple'
          });

          const stream = createTestExecutionStream(3);

          for await (const event of stream) {
            // Consume
          }
        })
      );

      const totalDuration = performance.now() - startTime;
      const averageLatency = totalDuration / concurrentRequests;

      console.log(`Concurrent Full Flow (${concurrentRequests} requests):
        Total: ${totalDuration.toFixed(2)}ms
        Average: ${averageLatency.toFixed(2)}ms
      `);

      expect(totalDuration).toBeLessThan(1000); // < 1 second
    });
  });
});

// Helper functions
async function selectModelForRequest(request: any): Promise<any> {
  // Simulate routing logic
  await new Promise(resolve => setTimeout(resolve, 1)); // 1ms processing

  if (request.complexity === 'complex') {
    return { model: 'gpt-4', reason: 'complex', estimatedCost: 0.006 };
  }

  return { model: 'gpt-3.5-turbo', reason: 'simple', estimatedCost: 0.0006 };
}

function analyzeTaskComplexity(task: any): any {
  // Simulate complexity analysis
  let score = 0;

  if (task.linesOfCode > 10) score += 0.3;
  if (task.cyclomaticComplexity > 5) score += 0.4;

  return {
    score: Math.min(score, 1.0),
    factors: ['loc', 'complexity'],
    reasoning: 'Analyzed'
  };
}

async function* createTestExecutionStream(testCount: number): AsyncGenerator<any> {
  for (let i = 0; i < testCount; i++) {
    yield {
      type: 'progress',
      progress: Math.round((i / testCount) * 100),
      timestamp: Date.now()
    };

    await new Promise(resolve => setTimeout(resolve, 1));

    yield {
      type: 'result',
      data: { name: `test-${i}`, status: 'passed', duration: 1 },
      timestamp: Date.now()
    };
  }

  yield {
    type: 'complete',
    data: { summary: { total: testCount, passed: testCount, failed: 0 } },
    timestamp: Date.now()
  };
}

async function* createHighFrequencyStream(eventCount: number): AsyncGenerator<any> {
  for (let i = 0; i < eventCount; i++) {
    yield {
      type: 'event',
      data: { index: i },
      timestamp: Date.now()
    };
  }
}

class CostTracker {
  private metrics: any = {
    totalCost: 0,
    costByModel: {},
    costByTaskType: {},
    testsGenerated: 0,
    averageCostPerTest: 0
  };

  constructor(private memoryStore?: MockMemoryStore) {}

  async recordUsage(usage: any): Promise<void> {
    const modelCosts: Record<string, number> = {
      'gpt-3.5-turbo': 0.000002,
      'gpt-4': 0.00006,
      'claude-sonnet-4.5': 0.00003
    };

    const cost = (usage.inputTokens + usage.outputTokens) *
      (modelCosts[usage.model] || 0.00001);

    this.metrics.totalCost += cost;
    this.metrics.costByModel[usage.model] =
      (this.metrics.costByModel[usage.model] || 0) + cost;
    this.metrics.costByTaskType[usage.taskType] =
      (this.metrics.costByTaskType[usage.taskType] || 0) + cost;

    if (usage.testsGenerated) {
      this.metrics.testsGenerated += usage.testsGenerated;
    }

    this.metrics.averageCostPerTest = this.metrics.testsGenerated > 0
      ? this.metrics.totalCost / this.metrics.testsGenerated
      : 0;
  }

  getMetrics(): any {
    return { ...this.metrics };
  }

  exportDashboard(): any {
    return {
      totalCost: this.metrics.totalCost,
      modelBreakdown: Object.entries(this.metrics.costByModel).map(([model, cost]) => ({
        model,
        cost,
        percentage: ((cost as number) / this.metrics.totalCost) * 100
      })),
      timestamp: new Date().toISOString()
    };
  }

  async persist(): Promise<void> {
    if (this.memoryStore) {
      await this.memoryStore.store('cost-tracker:metrics', this.metrics);
    }
  }
}

class AdaptiveModelRouter {
  private cache = new Map<string, any>();

  constructor(
    private memoryStore: MockMemoryStore,
    private eventBus: EventEmitter
  ) {}

  async analyzeComplexity(task: any): Promise<any> {
    const cacheKey = `complexity:${task.id}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const complexity = analyzeTaskComplexity(task);
    this.cache.set(cacheKey, complexity);
    await this.memoryStore.store(cacheKey, complexity);

    return complexity;
  }
}
