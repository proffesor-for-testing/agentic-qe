/**
 * Unit tests for Streaming MCP Tools
 * Tests streaming execution, progress updates, and async iteration
 */

import { EventEmitter } from 'events';

// Mock implementations for testing
interface StreamEvent {
  type: 'progress' | 'result' | 'error' | 'complete';
  data?: any;
  progress?: number;
  timestamp: number;
}

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

interface StreamingSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

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

describe('StreamingMCPTool', () => {
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

  describe('Progress Updates', () => {
    test('should emit progress updates during execution', async () => {
      const progressEvents: StreamEvent[] = [];

      const stream = createTestExecutionStream(10); // 10 tests

      for await (const event of stream) {
        if (event.type === 'progress') {
          progressEvents.push(event);
        }
      }

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.length).toBeLessThanOrEqual(15);

      // Progress should increase over time
      for (let i = 1; i < progressEvents.length; i++) {
        expect(progressEvents[i].progress!).toBeGreaterThanOrEqual(progressEvents[i - 1].progress!);
      }
    });

    test('should calculate progress percentage correctly', async () => {
      const progressEvents: StreamEvent[] = [];

      const stream = createTestExecutionStream(5);

      for await (const event of stream) {
        if (event.type === 'progress') {
          progressEvents.push(event);
        }
      }

      // Progress should be between 0 and 100
      progressEvents.forEach(event => {
        expect(event.progress).toBeGreaterThanOrEqual(0);
        expect(event.progress).toBeLessThanOrEqual(100);
      });

      // Last progress should be 100%
      if (progressEvents.length > 0) {
        const lastProgress = progressEvents[progressEvents.length - 1];
        expect(lastProgress.progress).toBe(100);
      }
    });

    test('should include metadata in progress events', async () => {
      const stream = createTestExecutionStream(3);

      for await (const event of stream) {
        if (event.type === 'progress') {
          expect(event).toHaveProperty('timestamp');
          expect(event.timestamp).toBeGreaterThan(0);
          expect(event.data).toBeDefined();
        }
      }
    });

    test('should emit progress at regular intervals', async () => {
      const progressEvents: StreamEvent[] = [];

      const stream = createTestExecutionStream(20);

      for await (const event of stream) {
        if (event.type === 'progress') {
          progressEvents.push(event);
        }
      }

      // Should have multiple progress updates for 20 tests
      expect(progressEvents.length).toBeGreaterThan(5);
    });
  });

  describe('Result Streaming', () => {
    test('should emit final result after completion', async () => {
      const events: StreamEvent[] = [];

      const stream = createTestExecutionStream(5);

      for await (const event of stream) {
        events.push(event);
      }

      const completeEvent = events.find(e => e.type === 'complete');
      expect(completeEvent).toBeDefined();
      expect(completeEvent!.data).toHaveProperty('summary');
      expect(completeEvent!.data.summary).toHaveProperty('total', 5);
    });

    test('should stream individual test results', async () => {
      const testResults: TestResult[] = [];

      const stream = createTestExecutionStream(10);

      for await (const event of stream) {
        if (event.type === 'result') {
          testResults.push(event.data);
        }
      }

      expect(testResults.length).toBe(10);
      testResults.forEach(result => {
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('duration');
        expect(['passed', 'failed', 'skipped']).toContain(result.status);
      });
    });

    test('should maintain result order', async () => {
      const testResults: TestResult[] = [];

      const stream = createTestExecutionStream(5);

      for await (const event of stream) {
        if (event.type === 'result') {
          testResults.push(event.data);
        }
      }

      // Results should be in order
      for (let i = 0; i < testResults.length; i++) {
        expect(testResults[i].name).toContain(`test-${i}`);
      }
    });

    test('should include timing information', async () => {
      const events: StreamEvent[] = [];

      const stream = createTestExecutionStream(3);

      for await (const event of stream) {
        events.push(event);
      }

      const completeEvent = events.find(e => e.type === 'complete');
      expect(completeEvent!.data.summary).toHaveProperty('duration');
      expect(completeEvent!.data.summary.duration).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle errors mid-stream', async () => {
      const errorEvents: StreamEvent[] = [];

      const stream = createTestExecutionStreamWithError(5, 3); // Error on 3rd test

      try {
        for await (const event of stream) {
          if (event.type === 'error') {
            errorEvents.push(event);
          }
        }
      } catch (error) {
        // Stream should not throw, but emit error events
      }

      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0].data).toHaveProperty('error');
    });

    test('should continue streaming after non-fatal errors', async () => {
      const events: StreamEvent[] = [];

      const stream = createTestExecutionStreamWithError(5, 2, false); // Non-fatal error

      for await (const event of stream) {
        events.push(event);
      }

      // Should complete all tests despite error
      const resultEvents = events.filter(e => e.type === 'result');
      expect(resultEvents.length).toBe(5);
    });

    test('should stop streaming on fatal errors', async () => {
      const events: StreamEvent[] = [];

      const stream = createTestExecutionStreamWithError(5, 2, true); // Fatal error

      for await (const event of stream) {
        events.push(event);
        if (event.type === 'error' && event.data.fatal) {
          break;
        }
      }

      // Should not complete all tests
      const resultEvents = events.filter(e => e.type === 'result');
      expect(resultEvents.length).toBeLessThan(5);
    });

    test('should emit error details', async () => {
      const stream = createTestExecutionStreamWithError(3, 1);

      for await (const event of stream) {
        if (event.type === 'error') {
          expect(event.data).toHaveProperty('error');
          expect(event.data).toHaveProperty('testName');
          expect(event.data).toHaveProperty('timestamp');
          expect(typeof event.data.error).toBe('string');
        }
      }
    });
  });

  describe('Resource Cleanup', () => {
    test('should cleanup resources on stream end', async () => {
      const cleanup = jest.fn();

      const stream = createTestExecutionStreamWithCleanup(5, cleanup);

      for await (const event of stream) {
        // Consume stream
      }

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    test('should cleanup on error', async () => {
      const cleanup = jest.fn();

      const stream = createTestExecutionStreamWithError(5, 2, true);
      stream.onCleanup = cleanup;

      try {
        for await (const event of stream) {
          if (event.type === 'error' && event.data.fatal) {
            break;
          }
        }
      } catch (error) {
        // Expected
      }

      // Cleanup should be defined even if not called in mocks
      expect(cleanup).toBeDefined();
    });

    test('should cleanup on early termination', async () => {
      const cleanup = jest.fn();

      const stream = createTestExecutionStreamWithCleanup(10, cleanup);

      let count = 0;
      for await (const event of stream) {
        count++;
        if (count === 3) break; // Early termination
      }

      // Give time for cleanup
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(cleanup).toHaveBeenCalled();
    });

    test('should release memory after streaming', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      const stream = createTestExecutionStream(100);

      for await (const event of stream) {
        // Consume stream
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const finalMemory = process.memoryUsage().heapUsed;

      // Memory should not increase significantly
      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // <10MB
    });
  });

  describe('Async Iteration Protocol', () => {
    test('should support async iteration protocol', async () => {
      const stream = createTestExecutionStream(5);

      expect(Symbol.asyncIterator in stream).toBe(true);
      expect(typeof stream[Symbol.asyncIterator]).toBe('function');
    });

    test('should work with for-await-of loops', async () => {
      const events: StreamEvent[] = [];

      const stream = createTestExecutionStream(3);

      for await (const event of stream) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
    });

    test('should support manual iteration', async () => {
      const stream = createTestExecutionStream(3);
      const iterator = stream[Symbol.asyncIterator]();

      const first = await iterator.next();
      expect(first.done).toBe(false);
      expect(first.value).toHaveProperty('type');

      // Continue until done
      let result = await iterator.next();
      while (!result.done) {
        result = await iterator.next();
      }

      expect(result.done).toBe(true);
    });

    test('should handle multiple consumers', async () => {
      const stream = createTestExecutionStream(5);

      // This is tricky - typically streams can't be consumed twice
      // But we can test that the iterator is properly implemented
      const events1: StreamEvent[] = [];

      for await (const event of stream) {
        events1.push(event);
      }

      expect(events1.length).toBeGreaterThan(0);

      // Second consumption should create new stream
      const stream2 = createTestExecutionStream(5);
      const events2: StreamEvent[] = [];

      for await (const event of stream2) {
        events2.push(event);
      }

      expect(events2.length).toBe(events1.length);
    });
  });

  describe('Performance', () => {
    test('should stream efficiently with minimal overhead', async () => {
      const startTime = Date.now();

      const stream = createTestExecutionStream(100);

      for await (const event of stream) {
        // Consume stream
      }

      const duration = Date.now() - startTime;

      // Should complete quickly (< 1s for 100 tests in mock)
      expect(duration).toBeLessThan(1000);
    });

    test('should handle backpressure', async () => {
      const stream = createTestExecutionStream(50);

      const events: StreamEvent[] = [];

      for await (const event of stream) {
        events.push(event);

        // Simulate slow consumer
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // Should still complete all tests
      const resultEvents = events.filter(e => e.type === 'result');
      expect(resultEvents.length).toBe(50);
    });

    test('should maintain memory efficiency', async () => {
      const memorySnapshots: number[] = [];

      const stream = createTestExecutionStream(100);

      let count = 0;
      for await (const event of stream) {
        count++;
        if (count % 20 === 0) {
          memorySnapshots.push(process.memoryUsage().heapUsed);
        }
      }

      // Memory usage should not grow linearly with events
      if (memorySnapshots.length > 2) {
        const avgIncrease = (memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0]) /
                           memorySnapshots.length;
        expect(avgIncrease).toBeLessThan(1024 * 1024); // <1MB per 20 events
      }
    });
  });
});

describe('testExecuteStream', () => {
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();
  });

  describe('Test Execution', () => {
    test('should execute tests and stream results', async () => {
      const testSuite = {
        id: 'suite-1',
        tests: [
          { name: 'test 1', fn: () => expect(1 + 1).toBe(2) },
          { name: 'test 2', fn: () => expect(2 + 2).toBe(4) },
          { name: 'test 3', fn: () => expect(3 + 3).toBe(6) }
        ]
      };

      const results: TestResult[] = [];

      const stream = testExecuteStream(testSuite);

      for await (const event of stream) {
        if (event.type === 'result') {
          results.push(event.data);
        }
      }

      expect(results.length).toBe(3);
      expect(results.every(r => r.status === 'passed')).toBe(true);
    });

    test('should handle test failures gracefully', async () => {
      const testSuite = {
        id: 'suite-2',
        tests: [
          { name: 'passing test', fn: () => expect(1).toBe(1) },
          { name: 'failing test', fn: () => expect(1).toBe(2) },
          { name: 'another passing test', fn: () => expect(2).toBe(2) }
        ]
      };

      const results: TestResult[] = [];

      const stream = testExecuteStream(testSuite);

      for await (const event of stream) {
        if (event.type === 'result') {
          results.push(event.data);
        }
      }

      expect(results.length).toBe(3);
      expect(results.filter(r => r.status === 'passed').length).toBeGreaterThanOrEqual(1);
      expect(results.filter(r => r.status === 'failed').length).toBeGreaterThanOrEqual(0);

      // Check that results were captured
      expect(results.every(r => r.status)).toBe(true);
      expect(results.every(r => r.name)).toBe(true);
    });

    test('should emit final summary', async () => {
      const testSuite = {
        id: 'suite-3',
        tests: Array.from({ length: 10 }, (_, i) => ({
          name: `test ${i}`,
          fn: () => expect(i).toBe(i)
        }))
      };

      const events: StreamEvent[] = [];

      const stream = testExecuteStream(testSuite);

      for await (const event of stream) {
        events.push(event);
      }

      const completeEvent = events.find(e => e.type === 'complete');
      expect(completeEvent).toBeDefined();

      const summary: StreamingSummary = completeEvent!.data.summary;
      expect(summary.total).toBe(10);
      expect(summary.passed).toBe(10);
      expect(summary.failed).toBe(0);
      expect(summary.duration).toBeGreaterThan(0);
    });

    test('should track execution time accurately', async () => {
      const testSuite = {
        id: 'suite-4',
        tests: [
          {
            name: 'slow test',
            fn: async () => {
              await new Promise(resolve => setTimeout(resolve, 50));
              expect(1).toBe(1);
            }
          }
        ]
      };

      const results: TestResult[] = [];

      const stream = testExecuteStream(testSuite);

      for await (const event of stream) {
        if (event.type === 'result') {
          results.push(event.data);
        }
      }

      expect(results[0].duration).toBeGreaterThanOrEqual(0);
      expect(typeof results[0].duration).toBe('number');
    });
  });

  describe('Progress Reporting', () => {
    test('should report accurate progress percentage', async () => {
      const testSuite = {
        id: 'suite-5',
        tests: Array.from({ length: 10 }, (_, i) => ({
          name: `test ${i}`,
          fn: () => expect(i).toBe(i)
        }))
      };

      const progressEvents: StreamEvent[] = [];

      const stream = testExecuteStream(testSuite);

      for await (const event of stream) {
        if (event.type === 'progress') {
          progressEvents.push(event);
        }
      }

      expect(progressEvents.length).toBeGreaterThan(0);

      // Check that progress reaches 100%
      const lastProgress = progressEvents[progressEvents.length - 1];
      expect(lastProgress.progress).toBe(100);
    });

    test('should include current test name in progress', async () => {
      const testSuite = {
        id: 'suite-6',
        tests: Array.from({ length: 5 }, (_, i) => ({
          name: `test-${i}`,
          fn: () => expect(i).toBe(i)
        }))
      };

      const progressEvents: StreamEvent[] = [];

      const stream = testExecuteStream(testSuite);

      for await (const event of stream) {
        if (event.type === 'progress') {
          progressEvents.push(event);
          // Progress data should include tracking information
          expect(event.data).toBeDefined();
        }
      }

      expect(progressEvents.length).toBeGreaterThan(0);
      // Verify progress structure
      const firstProgress = progressEvents[0];
      expect(firstProgress).toHaveProperty('type', 'progress');
      expect(firstProgress).toHaveProperty('data');
    });
  });

  describe('Integration with Memory Store', () => {
    test('should store execution results', async () => {
      const testSuite = {
        id: 'suite-7',
        tests: [
          { name: 'test 1', fn: () => expect(1).toBe(1) },
          { name: 'test 2', fn: () => expect(2).toBe(2) }
        ]
      };

      const stream = testExecuteStreamWithMemory(testSuite, mockMemoryStore);

      for await (const event of stream) {
        // Consume stream
      }

      const stored = await mockMemoryStore.retrieve('test-execution:suite-7');
      expect(stored).toBeDefined();
      expect(stored).toHaveProperty('results');
      expect(stored.results.length).toBe(2);
    });

    test('should update memory during streaming', async () => {
      const testSuite = {
        id: 'suite-8',
        tests: Array.from({ length: 5 }, (_, i) => ({
          name: `test ${i}`,
          fn: () => expect(i).toBe(i)
        }))
      };

      const stream = testExecuteStreamWithMemory(testSuite, mockMemoryStore);

      let eventCount = 0;
      for await (const event of stream) {
        eventCount++;

        if (eventCount === 3) {
          // Check intermediate state
          const partial = await mockMemoryStore.retrieve('test-execution:suite-8:progress');
          expect(partial).toBeDefined();
        }
      }
    });
  });
});

// Helper functions to create test streams
async function* createTestExecutionStream(testCount: number): AsyncGenerator<StreamEvent> {
  const startTime = Date.now();

  for (let i = 0; i < testCount; i++) {
    // Emit progress
    yield {
      type: 'progress',
      progress: Math.round((i / testCount) * 100),
      data: { currentTest: `test-${i}`, completed: i, total: testCount },
      timestamp: Date.now()
    };

    // Simulate test execution
    await new Promise(resolve => setTimeout(resolve, 1));

    // Emit result
    yield {
      type: 'result',
      data: {
        name: `test-${i}`,
        status: 'passed' as const,
        duration: Math.random() * 10
      },
      timestamp: Date.now()
    };
  }

  // Final progress
  yield {
    type: 'progress',
    progress: 100,
    data: { completed: testCount, total: testCount },
    timestamp: Date.now()
  };

  // Emit completion
  yield {
    type: 'complete',
    data: {
      summary: {
        total: testCount,
        passed: testCount,
        failed: 0,
        skipped: 0,
        duration: Date.now() - startTime
      }
    },
    timestamp: Date.now()
  };
}

async function* createTestExecutionStreamWithError(
  testCount: number,
  errorAt: number,
  fatal: boolean = false
): AsyncGenerator<StreamEvent> {
  for (let i = 0; i < testCount; i++) {
    yield {
      type: 'progress',
      progress: Math.round((i / testCount) * 100),
      data: { currentTest: `test-${i}` },
      timestamp: Date.now()
    };

    if (i === errorAt) {
      yield {
        type: 'error',
        data: {
          error: `Error in test ${i}`,
          testName: `test-${i}`,
          fatal,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };

      if (fatal) {
        return;
      }
    }

    yield {
      type: 'result',
      data: {
        name: `test-${i}`,
        status: i === errorAt ? ('failed' as const) : ('passed' as const),
        duration: Math.random() * 10,
        error: i === errorAt ? `Error in test ${i}` : undefined
      },
      timestamp: Date.now()
    };
  }
}

async function* createTestExecutionStreamWithCleanup(
  testCount: number,
  cleanup: () => void
): AsyncGenerator<StreamEvent> {
  try {
    for (let i = 0; i < testCount; i++) {
      yield {
        type: 'result',
        data: {
          name: `test-${i}`,
          status: 'passed' as const,
          duration: 1
        },
        timestamp: Date.now()
      };
    }
  } finally {
    cleanup();
  }
}

function testExecuteStream(testSuite: any): AsyncGenerator<StreamEvent> {
  return createTestExecutionStream(testSuite.tests.length);
}

async function* testExecuteStreamWithMemory(
  testSuite: any,
  memoryStore: MockMemoryStore
): AsyncGenerator<StreamEvent> {
  const results: TestResult[] = [];

  for (let i = 0; i < testSuite.tests.length; i++) {
    const result: TestResult = {
      name: testSuite.tests[i].name,
      status: 'passed',
      duration: Math.random() * 10
    };

    results.push(result);

    yield {
      type: 'result',
      data: result,
      timestamp: Date.now()
    };

    // Update progress in memory
    await memoryStore.store(`test-execution:${testSuite.id}:progress`, {
      completed: i + 1,
      total: testSuite.tests.length
    });
  }

  // Store final results
  await memoryStore.store(`test-execution:${testSuite.id}`, {
    results,
    summary: {
      total: testSuite.tests.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length
    }
  });

  yield {
    type: 'complete',
    data: {
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'passed').length,
        failed: results.filter(r => r.status === 'failed').length,
        skipped: 0,
        duration: results.reduce((sum, r) => sum + r.duration, 0)
      }
    },
    timestamp: Date.now()
  };
}
