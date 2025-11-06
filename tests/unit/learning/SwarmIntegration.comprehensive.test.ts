// Mock Logger to prevent undefined errors
jest.mock('@utils/Logger', () => ({
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

import {
  FlakyDetectionSwarmCoordinator,
  SwarmMemoryStore
} from '../../../src/learning/SwarmIntegration';
import { TestResult, FlakyTest } from '../../../src/learning/types';

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
        minRuns: 5,
        passRateThreshold: 0.8,
        confidenceThreshold: 0.7,
        useMLModel: true
      },
      'phase2'
    );
  });

  describe('Memory Integration', () => {
    it('should store individual test analyses', async () => {
      const history: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() - 5000 },
        { name: 'test1', passed: false, duration: 150, timestamp: Date.now() - 4000 },
        { name: 'test1', passed: true, duration: 120, timestamp: Date.now() - 3000 },
        { name: 'test1', passed: false, duration: 130, timestamp: Date.now() - 2000 },
        { name: 'test1', passed: true, duration: 110, timestamp: Date.now() - 1000 }
      ];

      await coordinator.detectAndStore(history);

      // Verify both aggregate and individual test storage
      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('flaky-tests'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle memory store errors gracefully', async () => {
      mockMemoryStore.store.mockRejectedValue(new Error('Storage failed'));

      const history: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() }
      ];

      await expect(coordinator.detectAndStore(history)).rejects.toThrow('Storage failed');
    });

    it('should handle memory retrieval errors', async () => {
      mockMemoryStore.retrieve.mockRejectedValue(new Error('Retrieval failed'));

      await expect(coordinator.retrieveResults()).rejects.toThrow('Retrieval failed');
    });
  });

  describe('Event System Integration', () => {
    it('should subscribe to events', async () => {
      const callback = jest.fn();
      await coordinator.subscribeToEvents(callback);

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('event-subscriptions'),
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

    it('should emit flaky test events', async () => {
      const flakyTest: FlakyTest = {
        name: 'test1',
        passRate: 0.6,
        variance: 800,
        confidence: 0.75,
        totalRuns: 10,
        failurePattern: 'intermittent',
        severity: 'high',
        firstDetected: Date.now(),
        lastSeen: Date.now(),
        recommendation: {
          priority: 'high',
          category: 'timing',
          recommendation: 'Add explicit waits',
          estimatedEffort: 'medium'
        }
      };

      await coordinator.emitFlakyTestEvent(flakyTest);

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('events/flaky-detected/test1'),
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

  describe('Training and Learning', () => {
    it('should train model from swarm memory', async () => {
      const now = Date.now();
      const mockTrainingData = {
        'test1': {
          results: [
            { name: 'test1', passed: true, duration: 100, timestamp: now - 5000 },
            { name: 'test1', passed: false, duration: 150, timestamp: now - 4000 },
            { name: 'test1', passed: true, duration: 120, timestamp: now - 3000 },
            { name: 'test1', passed: false, duration: 130, timestamp: now - 2000 },
            { name: 'test1', passed: true, duration: 110, timestamp: now - 1000 }
          ],
          isFlaky: true
        },
        'test2': {
          results: [
            { name: 'test2', passed: true, duration: 100, timestamp: now - 5000 },
            { name: 'test2', passed: true, duration: 105, timestamp: now - 4000 },
            { name: 'test2', passed: true, duration: 102, timestamp: now - 3000 },
            { name: 'test2', passed: true, duration: 98, timestamp: now - 2000 },
            { name: 'test2', passed: true, duration: 103, timestamp: now - 1000 }
          ],
          isFlaky: false
        }
      };

      mockMemoryStore.retrieve.mockResolvedValue(mockTrainingData);

      await coordinator.trainFromSwarmMemory();

      expect(mockMemoryStore.retrieve).toHaveBeenCalledWith(
        expect.stringContaining('training-data'),
        expect.objectContaining({ partition: 'coordination' })
      );

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('model-training'),
        expect.objectContaining({
          status: 'completed',
          trainingSamples: 2
        }),
        expect.any(Object)
      );
    });

    it('should handle training with no data', async () => {
      mockMemoryStore.retrieve.mockResolvedValue(null);

      await coordinator.trainFromSwarmMemory();

      // Should not throw error, just skip training
      expect(mockMemoryStore.store).not.toHaveBeenCalledWith(
        expect.stringContaining('model-training'),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('Checkpoint Management', () => {
    it('should create checkpoints with session ID', async () => {
      const mockResults = {
        tests: [
          {
            name: 'test1',
            passRate: 0.7,
            variance: 600,
            confidence: 0.8,
            totalRuns: 10,
            failurePattern: 'timing' as const,
            severity: 'medium' as const,
            firstDetected: Date.now(),
            lastSeen: Date.now(),
            recommendation: {
              priority: 'medium' as const,
              category: 'timing' as const,
              recommendation: 'Review timing',
              estimatedEffort: 'low' as const
            }
          }
        ],
        statistics: { total: 1 },
        timestamp: Date.now()
      };

      mockMemoryStore.retrieve.mockResolvedValue(mockResults);

      await coordinator.createCheckpoint('session-abc123');

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('checkpoints/session-abc123'),
        expect.objectContaining({
          sessionId: 'session-abc123',
          results: expect.any(Array),
          statistics: expect.any(Object)
        }),
        expect.objectContaining({ partition: 'coordination', ttl: 604800 })
      );
    });
  });

  describe('Statistics Aggregation', () => {
    it('should aggregate statistics across multiple tests', async () => {
      const mockResults = {
        tests: [
          {
            name: 'test1',
            passRate: 0.6,
            variance: 500,
            confidence: 0.8,
            totalRuns: 10,
            failurePattern: 'intermittent' as const,
            severity: 'high' as const,
            firstDetected: Date.now() - 2000,
            lastSeen: Date.now(),
            recommendation: {
              priority: 'high' as const,
              category: 'timing' as const,
              recommendation: 'Fix timing',
              estimatedEffort: 'medium' as const
            }
          },
          {
            name: 'test2',
            passRate: 0.5,
            variance: 700,
            confidence: 0.75,
            totalRuns: 8,
            failurePattern: 'environmental' as const,
            severity: 'critical' as const,
            firstDetected: Date.now() - 1000,
            lastSeen: Date.now(),
            recommendation: {
              priority: 'critical' as const,
              category: 'environmental' as const,
              recommendation: 'Fix environment',
              estimatedEffort: 'high' as const
            }
          }
        ],
        statistics: {
          total: 2,
          bySeverity: { critical: 1, high: 1, medium: 0, low: 0 },
          byPattern: { intermittent: 1, environmental: 1, timing: 0, resource: 0 }
        },
        timestamp: Date.now()
      };

      mockMemoryStore.retrieve.mockResolvedValue(mockResults);

      const stats = await coordinator.getAggregateStatistics();

      expect(stats.totalFlaky).toBe(2);
      expect(stats.bySeverity.critical).toBe(1);
      expect(stats.bySeverity.high).toBe(1);
      expect(stats.byPattern.intermittent).toBe(1);
      expect(stats.byPattern.environmental).toBe(1);
      expect(stats.recentDetections).toBe(2);
    });

    it('should calculate recent detections correctly', async () => {
      const now = Date.now();
      const oneDayAgo = now - 86400000;
      const twoDaysAgo = now - 172800000;

      const mockResults = {
        tests: [
          {
            name: 'test1',
            passRate: 0.6,
            variance: 500,
            confidence: 0.8,
            totalRuns: 10,
            failurePattern: 'intermittent' as const,
            severity: 'high' as const,
            firstDetected: now - 1000, // Recent
            lastSeen: now,
            recommendation: {
              priority: 'high' as const,
              category: 'timing' as const,
              recommendation: 'Fix timing',
              estimatedEffort: 'medium' as const
            }
          },
          {
            name: 'test2',
            passRate: 0.5,
            variance: 700,
            confidence: 0.75,
            totalRuns: 8,
            failurePattern: 'environmental' as const,
            severity: 'medium' as const,
            firstDetected: twoDaysAgo, // Old
            lastSeen: now,
            recommendation: {
              priority: 'medium' as const,
              category: 'environmental' as const,
              recommendation: 'Fix environment',
              estimatedEffort: 'low' as const
            }
          }
        ],
        statistics: {
          total: 2,
          bySeverity: { critical: 0, high: 1, medium: 1, low: 0 },
          byPattern: { intermittent: 1, environmental: 1, timing: 0, resource: 0 }
        },
        timestamp: now
      };

      mockMemoryStore.retrieve.mockResolvedValue(mockResults);

      const stats = await coordinator.getAggregateStatistics();

      expect(stats.recentDetections).toBe(1); // Only test1 is recent
    });
  });

  describe('Search and Retrieval', () => {
    it('should retrieve specific test analysis', async () => {
      const mockTest: FlakyTest = {
        name: 'test1',
        passRate: 0.6,
        variance: 500,
        confidence: 0.8,
        totalRuns: 10,
        failurePattern: 'intermittent',
        severity: 'high',
        firstDetected: Date.now(),
        lastSeen: Date.now(),
        recommendation: {
          priority: 'high',
          category: 'timing',
          recommendation: 'Fix timing',
          estimatedEffort: 'medium'
        }
      };

      mockMemoryStore.retrieve.mockResolvedValue(mockTest);

      const result = await coordinator.retrieveTestAnalysis('test1');

      expect(result).toEqual(mockTest);
      expect(mockMemoryStore.retrieve).toHaveBeenCalledWith(
        expect.stringContaining('test-analysis/test1'),
        expect.objectContaining({ partition: 'coordination' })
      );
    });

    it('should return null for non-existent test analysis', async () => {
      mockMemoryStore.retrieve.mockResolvedValue(null);

      const result = await coordinator.retrieveTestAnalysis('nonexistent');
      expect(result).toBeNull();
    });

    it('should search tests with wildcards', async () => {
      const mockSearchResults = [
        {
          key: 'phase2/test-analysis/test1',
          value: {
            name: 'test1',
            passRate: 0.6,
            variance: 500,
            confidence: 0.8,
            totalRuns: 10,
            failurePattern: 'intermittent' as const,
            severity: 'high' as const,
            firstDetected: Date.now(),
            lastSeen: Date.now(),
            recommendation: {
              priority: 'high' as const,
              category: 'timing' as const,
              recommendation: 'Fix',
              estimatedEffort: 'medium' as const
            }
          }
        },
        {
          key: 'phase2/test-analysis/test2',
          value: {
            name: 'test2',
            passRate: 0.5,
            variance: 700,
            confidence: 0.75,
            totalRuns: 8,
            failurePattern: 'environmental' as const,
            severity: 'medium' as const,
            firstDetected: Date.now(),
            lastSeen: Date.now(),
            recommendation: {
              priority: 'medium' as const,
              category: 'environmental' as const,
              recommendation: 'Fix env',
              estimatedEffort: 'low' as const
            }
          }
        }
      ];

      mockMemoryStore.search.mockResolvedValue(mockSearchResults);

      const results = await coordinator.searchFlakyTests('test*');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('test1');
      expect(results[1].name).toBe('test2');
    });
  });
});
