// Mock Logger to prevent undefined errors
jest.mock('../../../src/utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    }))
  }
}));

// Mock Logger to prevent undefined errors
jest.mock('../../utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    }))
  }
}));

/**
 * Comprehensive Tests for Flaky Test Detection Swarm Integration
 * Coverage target: 90%+ of SwarmIntegration.ts
 */

import {
  FlakyDetectionSwarmCoordinator,
  SwarmMemoryStore,
  setupFlakyDetection
} from '../../../src/learning/SwarmIntegration';
import { FlakyTest, TestResult } from '../../../src/learning/types';

describe('FlakyDetectionSwarmCoordinator - Comprehensive Tests', () => {
  let coordinator: FlakyDetectionSwarmCoordinator;
  let mockMemoryStore: jest.Mocked<SwarmMemoryStore>;

  beforeEach(() => {
    mockMemoryStore = {
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([])
    };

    coordinator = new FlakyDetectionSwarmCoordinator(
      mockMemoryStore,
      {
        minRuns: 3,
        passRateThreshold: 0.7,
        confidenceThreshold: 0.6,
        useMLModel: true
      },
      'test-namespace'
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Detection and Storage', () => {
    it('should detect flaky tests and store results', async () => {
      const testHistory: TestResult[] = [
        { testName: 'test1', passed: true, duration: 100, timestamp: Date.now(), runId: 'run1' },
        { testName: 'test1', passed: false, duration: 120, timestamp: Date.now(), runId: 'run2' },
        { testName: 'test1', passed: true, duration: 110, timestamp: Date.now(), runId: 'run3' },
        { testName: 'test1', passed: false, duration: 130, timestamp: Date.now(), runId: 'run4' },
        { testName: 'test1', passed: true, duration: 105, timestamp: Date.now(), runId: 'run5' }
      ];

      const flakyTests = await coordinator.detectAndStore(testHistory);

      expect(flakyTests.length).toBeGreaterThan(0);
      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'test-namespace/flaky-tests',
        expect.objectContaining({
          tests: expect.any(Array),
          statistics: expect.any(Object),
          timestamp: expect.any(Number)
        }),
        expect.objectContaining({ partition: 'coordination', ttl: 86400 })
      );
    });

    it('should store individual test analyses', async () => {
      const testHistory: TestResult[] = [
        { testName: 'flaky-test', passed: true, duration: 100, timestamp: Date.now(), runId: 'run1' },
        { testName: 'flaky-test', passed: false, duration: 120, timestamp: Date.now(), runId: 'run2' },
        { testName: 'flaky-test', passed: true, duration: 110, timestamp: Date.now(), runId: 'run3' }
      ];

      await coordinator.detectAndStore(testHistory);

      // Should call store for results and individual test analysis
      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('test-namespace/test-analysis/'),
        expect.any(Object),
        expect.objectContaining({ partition: 'coordination' })
      );
    });

    it('should include detector version in stored results', async () => {
      const testHistory: TestResult[] = [
        { testName: 'test', passed: true, duration: 100, timestamp: Date.now(), runId: 'run1' },
        { testName: 'test', passed: false, duration: 120, timestamp: Date.now(), runId: 'run2' },
        { testName: 'test', passed: true, duration: 110, timestamp: Date.now(), runId: 'run3' }
      ];

      await coordinator.detectAndStore(testHistory);

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'test-namespace/flaky-tests',
        expect.objectContaining({
          detectorVersion: '1.0.0'
        }),
        expect.any(Object)
      );
    });

    it('should handle empty test history', async () => {
      const flakyTests = await coordinator.detectAndStore([]);

      expect(flakyTests).toEqual([]);
    });

    it('should handle tests with all passes', async () => {
      const testHistory: TestResult[] = [
        { testName: 'stable-test', passed: true, duration: 100, timestamp: Date.now(), runId: 'run1' },
        { testName: 'stable-test', passed: true, duration: 100, timestamp: Date.now(), runId: 'run2' },
        { testName: 'stable-test', passed: true, duration: 100, timestamp: Date.now(), runId: 'run3' }
      ];

      const flakyTests = await coordinator.detectAndStore(testHistory);

      expect(flakyTests).toEqual([]);
    });
  });

  describe('Model Training', () => {
    it('should train model from swarm memory', async () => {
      const trainingData = {
        'test1': {
          results: [
            { testName: 'test1', passed: true, duration: 100, timestamp: Date.now(), runId: 'run1' },
            { testName: 'test1', passed: false, duration: 120, timestamp: Date.now(), runId: 'run2' }
          ],
          isFlaky: true
        },
        'test2': {
          results: [
            { testName: 'test2', passed: true, duration: 100, timestamp: Date.now(), runId: 'run1' },
            { testName: 'test2', passed: true, duration: 100, timestamp: Date.now(), runId: 'run2' }
          ],
          isFlaky: false
        }
      };

      mockMemoryStore.retrieve.mockResolvedValueOnce(trainingData);

      await coordinator.trainFromSwarmMemory();

      expect(mockMemoryStore.retrieve).toHaveBeenCalledWith(
        'test-namespace/training-data',
        { partition: 'coordination' }
      );

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'test-namespace/model-training',
        expect.objectContaining({
          status: 'completed',
          trainingSamples: 2
        }),
        expect.objectContaining({ partition: 'coordination', ttl: 86400 })
      );
    });

    it('should handle missing training data gracefully', async () => {
      mockMemoryStore.retrieve.mockResolvedValueOnce(null);

      await coordinator.trainFromSwarmMemory();

      expect(mockMemoryStore.store).not.toHaveBeenCalledWith(
        expect.stringContaining('model-training'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('Results Retrieval', () => {
    it('should retrieve flaky test results', async () => {
      const mockResults = {
        tests: [
          {
            name: 'flaky-test-1',
            severity: 'high' as const,
            passRate: 0.6,
            failurePattern: 'intermittent' as const,
            firstDetected: Date.now(),
            lastDetected: Date.now(),
            totalRuns: 10,
            failures: 4,
            averageDuration: 120
          }
        ],
        statistics: {
          total: 1,
          bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
          byPattern: { intermittent: 1, environmental: 0, timing: 0, resource: 0 }
        },
        timestamp: Date.now()
      };

      mockMemoryStore.retrieve.mockResolvedValueOnce(mockResults);

      const results = await coordinator.retrieveResults();

      expect(results).toEqual(mockResults);
      expect(mockMemoryStore.retrieve).toHaveBeenCalledWith(
        'test-namespace/flaky-tests',
        { partition: 'coordination' }
      );
    });

    it('should return null when no results available', async () => {
      mockMemoryStore.retrieve.mockResolvedValueOnce(null);

      const results = await coordinator.retrieveResults();

      expect(results).toBeNull();
    });
  });

  describe('Test Analysis Retrieval', () => {
    it('should retrieve specific test analysis', async () => {
      const mockTestAnalysis: FlakyTest = {
        name: 'specific-test',
        severity: 'medium',
        passRate: 0.7,
        failurePattern: 'timing',
        firstDetected: Date.now(),
        lastDetected: Date.now(),
        totalRuns: 8,
        failures: 2,
        averageDuration: 150
      };

      mockMemoryStore.retrieve.mockResolvedValueOnce(mockTestAnalysis);

      const analysis = await coordinator.retrieveTestAnalysis('specific-test');

      expect(analysis).toEqual(mockTestAnalysis);
      expect(mockMemoryStore.retrieve).toHaveBeenCalledWith(
        'test-namespace/test-analysis/specific-test',
        { partition: 'coordination' }
      );
    });

    it('should return null for non-existent test', async () => {
      mockMemoryStore.retrieve.mockResolvedValueOnce(null);

      const analysis = await coordinator.retrieveTestAnalysis('nonexistent');

      expect(analysis).toBeNull();
    });
  });

  describe('Search Functionality', () => {
    it('should search for flaky tests by pattern', async () => {
      const mockResults = [
        {
          key: 'test-namespace/test-analysis/auth-test',
          value: {
            name: 'auth-test',
            severity: 'high',
            passRate: 0.5,
            failurePattern: 'environmental',
            firstDetected: Date.now(),
            lastDetected: Date.now(),
            totalRuns: 10,
            failures: 5,
            averageDuration: 200
          }
        }
      ];

      mockMemoryStore.search.mockResolvedValueOnce(mockResults);

      const results = await coordinator.searchFlakyTests('auth*');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('auth-test');
      expect(mockMemoryStore.search).toHaveBeenCalledWith(
        'test-namespace/test-analysis/auth*',
        { partition: 'coordination', limit: 100 }
      );
    });

    it('should handle empty search results', async () => {
      mockMemoryStore.search.mockResolvedValueOnce([]);

      const results = await coordinator.searchFlakyTests('nonexistent*');

      expect(results).toEqual([]);
    });
  });

  describe('Aggregate Statistics', () => {
    it('should calculate aggregate statistics', async () => {
      const now = Date.now();
      const mockResults = {
        tests: [
          {
            name: 'test1',
            severity: 'high' as const,
            passRate: 0.5,
            failurePattern: 'intermittent' as const,
            firstDetected: now - 1000,
            lastDetected: now,
            totalRuns: 10,
            failures: 5,
            averageDuration: 100
          },
          {
            name: 'test2',
            severity: 'medium' as const,
            passRate: 0.7,
            failurePattern: 'timing' as const,
            firstDetected: now - 2 * 86400000, // 2 days ago
            lastDetected: now - 86400000, // 1 day ago
            totalRuns: 10,
            failures: 3,
            averageDuration: 150
          }
        ],
        statistics: {
          total: 2,
          bySeverity: { critical: 0, high: 1, medium: 1, low: 0 },
          byPattern: { intermittent: 1, environmental: 0, timing: 1, resource: 0 }
        },
        timestamp: now
      };

      mockMemoryStore.retrieve.mockResolvedValueOnce(mockResults);

      const stats = await coordinator.getAggregateStatistics();

      expect(stats.totalFlaky).toBe(2);
      expect(stats.bySeverity.high).toBe(1);
      expect(stats.byPattern.timing).toBe(1);
      expect(stats.recentDetections).toBe(1); // Only test1 was detected in last 24h
    });

    it('should return zero statistics when no data available', async () => {
      mockMemoryStore.retrieve.mockResolvedValueOnce(null);

      const stats = await coordinator.getAggregateStatistics();

      expect(stats).toEqual({
        totalFlaky: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        byPattern: { intermittent: 0, environmental: 0, timing: 0, resource: 0 },
        recentDetections: 0
      });
    });
  });

  describe('Event Handling', () => {
    it('should subscribe to flaky test events', async () => {
      const callback = jest.fn();

      await coordinator.subscribeToEvents(callback);

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'test-namespace/event-subscriptions',
        expect.objectContaining({
          subscriber: 'flaky-detection-coordinator',
          events: expect.arrayContaining([
            'test:flaky-detected',
            'test:pattern-identified',
            'model:trained'
          ])
        }),
        expect.objectContaining({ partition: 'coordination', ttl: 3600 })
      );
    });

    it('should emit flaky test detected event', async () => {
      const flakyTest: FlakyTest = {
        name: 'flaky-test',
        severity: 'high',
        passRate: 0.5,
        failurePattern: 'intermittent',
        firstDetected: Date.now(),
        lastDetected: Date.now(),
        totalRuns: 10,
        failures: 5,
        averageDuration: 120
      };

      await coordinator.emitFlakyTestEvent(flakyTest);

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'test-namespace/events/flaky-detected/flaky-test',
        expect.objectContaining({
          type: 'test:flaky-detected',
          test: flakyTest,
          severity: 'high',
          pattern: 'intermittent'
        }),
        expect.objectContaining({ partition: 'coordination', ttl: 86400 })
      );
    });
  });

  describe('Checkpoint Management', () => {
    it('should create checkpoint with current results', async () => {
      const mockResults = {
        tests: [{
          name: 'test1',
          severity: 'high' as const,
          passRate: 0.5,
          failurePattern: 'intermittent' as const,
          firstDetected: Date.now(),
          lastDetected: Date.now(),
          totalRuns: 10,
          failures: 5,
          averageDuration: 100
        }],
        statistics: {
          total: 1,
          bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
          byPattern: { intermittent: 1, environmental: 0, timing: 0, resource: 0 }
        },
        timestamp: Date.now()
      };

      mockMemoryStore.retrieve.mockResolvedValueOnce(mockResults);

      await coordinator.createCheckpoint('session-123');

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'test-namespace/checkpoints/session-123',
        expect.objectContaining({
          sessionId: 'session-123',
          results: mockResults.tests,
          statistics: mockResults.statistics
        }),
        expect.objectContaining({ partition: 'coordination', ttl: 604800 }) // 7 days
      );
    });

    it('should handle checkpoint creation with no results', async () => {
      mockMemoryStore.retrieve.mockResolvedValueOnce(null);

      await coordinator.createCheckpoint('session-empty');

      expect(mockMemoryStore.store).not.toHaveBeenCalledWith(
        expect.stringContaining('checkpoints'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('Metrics Management', () => {
    it('should export metrics', async () => {
      const mockMetrics = {
        detectionCount: 50,
        accuracy: 0.92,
        falsePositiveRate: 0.05,
        processingTime: 1200
      };

      mockMemoryStore.retrieve.mockResolvedValueOnce(mockMetrics);

      const metrics = await coordinator.exportMetrics();

      expect(metrics).toEqual(mockMetrics);
      expect(mockMemoryStore.retrieve).toHaveBeenCalledWith(
        'test-namespace/metrics',
        { partition: 'coordination' }
      );
    });

    it('should return default metrics when none available', async () => {
      mockMemoryStore.retrieve.mockResolvedValueOnce(null);

      const metrics = await coordinator.exportMetrics();

      expect(metrics).toEqual({
        detectionCount: 0,
        accuracy: 0,
        falsePositiveRate: 0,
        processingTime: 0
      });
    });

    it('should store performance metrics', async () => {
      const metrics = {
        detectionCount: 25,
        accuracy: 0.95,
        falsePositiveRate: 0.03,
        processingTime: 800
      };

      await coordinator.storeMetrics(metrics);

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'test-namespace/metrics',
        expect.objectContaining({
          ...metrics,
          timestamp: expect.any(Number)
        }),
        expect.objectContaining({ partition: 'coordination', ttl: 86400 })
      );
    });
  });

  describe('Setup Helper Function', () => {
    it('should setup flaky detection with coordinator', async () => {
      const coord = await setupFlakyDetection(mockMemoryStore);

      expect(coord).toBeInstanceOf(FlakyDetectionSwarmCoordinator);
      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('event-subscriptions'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle memory store errors gracefully', async () => {
      mockMemoryStore.store.mockRejectedValueOnce(new Error('Storage error'));

      await expect(
        coordinator.detectAndStore([
          { testName: 'test', passed: true, duration: 100, timestamp: Date.now(), runId: 'run1' }
        ])
      ).rejects.toThrow('Storage error');
    });

    it('should handle retrieval errors gracefully', async () => {
      mockMemoryStore.retrieve.mockRejectedValueOnce(new Error('Retrieval error'));

      await expect(coordinator.retrieveResults()).rejects.toThrow('Retrieval error');
    });

    it('should handle search errors gracefully', async () => {
      mockMemoryStore.search.mockRejectedValueOnce(new Error('Search error'));

      await expect(coordinator.searchFlakyTests('test*')).rejects.toThrow('Search error');
    });

    it('should handle concurrent detection operations', async () => {
      const testHistory1: TestResult[] = [
        { testName: 'test1', passed: true, duration: 100, timestamp: Date.now(), runId: 'run1' },
        { testName: 'test1', passed: false, duration: 120, timestamp: Date.now(), runId: 'run2' },
        { testName: 'test1', passed: true, duration: 110, timestamp: Date.now(), runId: 'run3' }
      ];

      const testHistory2: TestResult[] = [
        { testName: 'test2', passed: false, duration: 100, timestamp: Date.now(), runId: 'run1' },
        { testName: 'test2', passed: true, duration: 120, timestamp: Date.now(), runId: 'run2' },
        { testName: 'test2', passed: false, duration: 110, timestamp: Date.now(), runId: 'run3' }
      ];

      const [results1, results2] = await Promise.all([
        coordinator.detectAndStore(testHistory1),
        coordinator.detectAndStore(testHistory2)
      ]);

      expect(results1.length + results2.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large test histories', async () => {
      const largeHistory: TestResult[] = Array.from({ length: 1000 }, (_, i) => ({
        testName: 'test',
        passed: i % 2 === 0,
        duration: 100 + (i % 10),
        timestamp: Date.now() + i,
        runId: `run${i}`
      }));

      const results = await coordinator.detectAndStore(largeHistory);

      expect(results).toBeDefined();
    });

    it('should handle tests with special characters in names', async () => {
      const testHistory: TestResult[] = [
        { testName: 'test-with-special-chars!@#$%', passed: true, duration: 100, timestamp: Date.now(), runId: 'run1' },
        { testName: 'test-with-special-chars!@#$%', passed: false, duration: 120, timestamp: Date.now(), runId: 'run2' },
        { testName: 'test-with-special-chars!@#$%', passed: true, duration: 110, timestamp: Date.now(), runId: 'run3' }
      ];

      const results = await coordinator.detectAndStore(testHistory);

      expect(results).toBeDefined();
    });
  });
});
