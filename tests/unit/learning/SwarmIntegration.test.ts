/**
 * Unit Tests for SwarmIntegration
 */

import { FlakyDetectionSwarmCoordinator, SwarmMemoryStore } from '../../../src/learning/SwarmIntegration';
import { TestResult, FlakyTest } from '../../../src/learning/types';

// Mock SwarmMemoryStore
class MockSwarmMemoryStore implements SwarmMemoryStore {
  private storage = new Map<string, any>();

  async store(key: string, value: any, options?: { partition?: string; ttl?: number }): Promise<void> {
    this.storage.set(key, value);
  }

  async retrieve(key: string, options?: { partition?: string }): Promise<any> {
    return this.storage.get(key);
  }

  async delete(key: string, options?: { partition?: string }): Promise<void> {
    this.storage.delete(key);
  }

  async search(pattern: string, options?: { partition?: string; limit?: number }): Promise<Array<{ key: string; value: any }>> {
    const results: Array<{ key: string; value: any }> = [];
    const regex = new RegExp(pattern.replace('*', '.*'));

    for (const [key, value] of this.storage) {
      if (regex.test(key)) {
        results.push({ key, value });
        if (options?.limit && results.length >= options.limit) {
          break;
        }
      }
    }

    return results;
  }

  clear(): void {
    this.storage.clear();
  }
}

describe('FlakyDetectionSwarmCoordinator', () => {
  let coordinator: FlakyDetectionSwarmCoordinator;
  let mockMemory: MockSwarmMemoryStore;

  beforeEach(() => {
    mockMemory = new MockSwarmMemoryStore();
    coordinator = new FlakyDetectionSwarmCoordinator(mockMemory, {
      minRuns: 5,
      passRateThreshold: 0.8,
      confidenceThreshold: 0.7
    });
  });

  describe('detectAndStore', () => {
    it('should detect flaky tests and store in memory', async () => {
      const history = generateTestHistory();

      const flakyTests = await coordinator.detectAndStore(history);

      expect(flakyTests.length).toBeGreaterThan(0);

      // Verify stored in memory
      const stored = await coordinator.retrieveResults();
      expect(stored).toBeDefined();
      expect(stored!.tests).toEqual(flakyTests);
    });

    it('should store individual test analyses', async () => {
      const history = generateTestHistory();

      const flakyTests = await coordinator.detectAndStore(history);

      // Verify individual analyses stored
      for (const test of flakyTests) {
        const analysis = await coordinator.retrieveTestAnalysis(test.name);
        expect(analysis).toEqual(test);
      }
    });
  });

  describe('trainFromSwarmMemory', () => {
    it('should train model from stored training data', async () => {
      // Store training data
      const trainingData = {
        'flaky1': {
          results: generateIntermittentResults('flaky1', 10, 0.5),
          isFlaky: true
        },
        'stable1': {
          results: generateStableResults('stable1', 10),
          isFlaky: false
        }
      };

      await mockMemory.store('phase2/training-data', trainingData, {
        partition: 'coordination'
      });

      // Train from memory
      await coordinator.trainFromSwarmMemory();

      // Verify training completion stored
      const trainingStatus = await mockMemory.retrieve('phase2/model-training');
      expect(trainingStatus.status).toBe('completed');
    });
  });

  describe('retrieveResults', () => {
    it('should retrieve stored flaky test results', async () => {
      const history = generateTestHistory();
      await coordinator.detectAndStore(history);

      const results = await coordinator.retrieveResults();

      expect(results).toBeDefined();
      expect(results!.tests).toBeDefined();
      expect(results!.statistics).toBeDefined();
      expect(results!.timestamp).toBeDefined();
    });

    it('should return null when no results stored', async () => {
      const results = await coordinator.retrieveResults();
      expect(results).toBeUndefined();
    });
  });

  describe('searchFlakyTests', () => {
    it('should search for flaky tests by pattern', async () => {
      const history = [
        ...generateIntermittentResults('api.test1', 10, 0.5),
        ...generateIntermittentResults('api.test2', 10, 0.6),
        ...generateIntermittentResults('ui.test1', 10, 0.4)
      ];

      await coordinator.detectAndStore(history);

      const apiTests = await coordinator.searchFlakyTests('api.*');

      expect(apiTests.length).toBeGreaterThanOrEqual(2);
      expect(apiTests.every(t => t.name.startsWith('api.'))).toBe(true);
    });
  });

  describe('getAggregateStatistics', () => {
    it('should calculate aggregate statistics', async () => {
      const history = generateTestHistory();
      await coordinator.detectAndStore(history);

      const stats = await coordinator.getAggregateStatistics();

      expect(stats.totalFlaky).toBeGreaterThan(0);
      expect(stats.bySeverity).toBeDefined();
      expect(stats.byPattern).toBeDefined();
      expect(stats.recentDetections).toBeDefined();
    });

    it('should return zero statistics when no data', async () => {
      const stats = await coordinator.getAggregateStatistics();

      expect(stats.totalFlaky).toBe(0);
      expect(stats.bySeverity.critical).toBe(0);
    });
  });

  describe('event handling', () => {
    it('should subscribe to events', async () => {
      await coordinator.subscribeToEvents(async (event) => {
        console.log('Event received:', event);
      });

      const subscriptions = await mockMemory.retrieve('phase2/event-subscriptions');
      expect(subscriptions).toBeDefined();
      expect(subscriptions.events).toContain('test:flaky-detected');
    });

    it('should emit flaky test events', async () => {
      const flakyTest: FlakyTest = {
        name: 'test1',
        passRate: 0.5,
        variance: 2000,
        confidence: 0.8,
        totalRuns: 10,
        failurePattern: 'timing',
        recommendation: {
          type: 'timing',
          priority: 'high',
          description: 'Test description',
          suggestedFix: 'Fix suggestion',
          confidence: 0.8
        },
        severity: 'high',
        firstDetected: Date.now(),
        lastSeen: Date.now()
      };

      await coordinator.emitFlakyTestEvent(flakyTest);

      const event = await mockMemory.retrieve(`phase2/events/flaky-detected/${flakyTest.name}`);
      expect(event).toBeDefined();
      expect(event.type).toBe('test:flaky-detected');
      expect(event.test).toEqual(flakyTest);
    });
  });

  describe('checkpoints', () => {
    it('should create checkpoint', async () => {
      const history = generateTestHistory();
      await coordinator.detectAndStore(history);

      const sessionId = 'session-123';
      await coordinator.createCheckpoint(sessionId);

      const checkpoint = await mockMemory.retrieve(`phase2/checkpoints/${sessionId}`);
      expect(checkpoint).toBeDefined();
      expect(checkpoint.sessionId).toBe(sessionId);
      expect(checkpoint.results).toBeDefined();
    });
  });

  describe('metrics', () => {
    it('should store and retrieve metrics', async () => {
      const metrics = {
        detectionCount: 10,
        accuracy: 0.92,
        falsePositiveRate: 0.03,
        processingTime: 1500
      };

      await coordinator.storeMetrics(metrics);

      const retrieved = await coordinator.exportMetrics();
      expect(retrieved.detectionCount).toBe(metrics.detectionCount);
      expect(retrieved.accuracy).toBe(metrics.accuracy);
    });

    it('should return default metrics when none stored', async () => {
      const metrics = await coordinator.exportMetrics();

      expect(metrics.detectionCount).toBe(0);
      expect(metrics.accuracy).toBe(0);
    });
  });
});

// Helper functions
function generateTestHistory(): TestResult[] {
  return [
    ...generateIntermittentResults('flaky1', 10, 0.5),
    ...generateIntermittentResults('flaky2', 10, 0.6),
    ...generateStableResults('stable1', 10),
    ...generateStableResults('stable2', 10)
  ];
}

function generateIntermittentResults(
  testName: string,
  count: number,
  passRate: number
): TestResult[] {
  const results: TestResult[] = [];
  const baseTime = Date.now();

  for (let i = 0; i < count; i++) {
    const passed = Math.random() < passRate;
    results.push({
      name: testName,
      status: passed ? 'passed' : 'failed',
      duration: 100 + Math.random() * 50,
      timestamp: baseTime + i * 60000,
      error: passed ? undefined : 'Intermittent failure'
    });
  }

  return results;
}

function generateStableResults(testName: string, count: number): TestResult[] {
  const results: TestResult[] = [];
  const baseTime = Date.now();

  for (let i = 0; i < count; i++) {
    results.push({
      name: testName,
      status: 'passed',
      duration: 100 + Math.random() * 10,
      timestamp: baseTime + i * 60000
    });
  }

  return results;
}
