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
  SwarmMemoryStore,
  setupFlakyDetection
} from '../../../src/learning/SwarmIntegration';
import { TestResult, FlakyTest } from '../../../src/learning/types';

describe('FlakyDetectionSwarmCoordinator', () => {
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
      { minRuns: 3, passRateThreshold: 0.8 },
      'test-namespace'
    );
  });

  describe('constructor', () => {
    it('should create coordinator instance with default namespace', () => {
      const defaultCoordinator = new FlakyDetectionSwarmCoordinator(mockMemoryStore);
      expect(defaultCoordinator).toBeInstanceOf(FlakyDetectionSwarmCoordinator);
    });

    it('should create coordinator instance with custom namespace', () => {
      expect(coordinator).toBeInstanceOf(FlakyDetectionSwarmCoordinator);
    });

    it('should create coordinator with custom options', () => {
      const customCoordinator = new FlakyDetectionSwarmCoordinator(
        mockMemoryStore,
        { minRuns: 5, passRateThreshold: 0.9, confidenceThreshold: 0.8 }
      );
      expect(customCoordinator).toBeInstanceOf(FlakyDetectionSwarmCoordinator);
    });
  });

  describe('detectAndStore', () => {
    it('should detect flaky tests from history', async () => {
      const history: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() - 5000 },
        { name: 'test1', passed: false, duration: 150, timestamp: Date.now() - 4000 },
        { name: 'test1', passed: true, duration: 120, timestamp: Date.now() - 3000 },
        { name: 'test1', passed: false, duration: 130, timestamp: Date.now() - 2000 },
        { name: 'test1', passed: true, duration: 110, timestamp: Date.now() - 1000 }
      ];

      const flakyTests = await coordinator.detectAndStore(history);

      expect(Array.isArray(flakyTests)).toBe(true);
      expect(mockMemoryStore.store).toHaveBeenCalled();
    });

    it('should store detection results in memory', async () => {
      const history: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() }
      ];

      await coordinator.detectAndStore(history);

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('flaky-tests'),
        expect.objectContaining({
          tests: expect.any(Array),
          statistics: expect.any(Object),
          timestamp: expect.any(Number)
        }),
        expect.objectContaining({ partition: 'coordination' })
      );
    });

    it('should handle empty history gracefully', async () => {
      const flakyTests = await coordinator.detectAndStore([]);
      expect(Array.isArray(flakyTests)).toBe(true);
    });
  });

  describe('retrieveResults', () => {
    it('should retrieve stored results from memory', async () => {
      const mockResults = {
        tests: [],
        statistics: { total: 0 },
        timestamp: Date.now()
      };

      mockMemoryStore.retrieve.mockResolvedValue(mockResults);

      const results = await coordinator.retrieveResults();

      expect(results).toEqual(mockResults);
      expect(mockMemoryStore.retrieve).toHaveBeenCalledWith(
        expect.stringContaining('flaky-tests'),
        expect.objectContaining({ partition: 'coordination' })
      );
    });

    it('should return null when no results are stored', async () => {
      mockMemoryStore.retrieve.mockResolvedValue(null);

      const results = await coordinator.retrieveResults();
      expect(results).toBeNull();
    });
  });

  describe('getAggregateStatistics', () => {
    it('should return default statistics when no results exist', async () => {
      mockMemoryStore.retrieve.mockResolvedValue(null);

      const stats = await coordinator.getAggregateStatistics();

      expect(stats).toEqual({
        totalFlaky: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        byPattern: { intermittent: 0, environmental: 0, timing: 0, resource: 0 },
        recentDetections: 0
      });
    });

    it('should calculate statistics from stored results', async () => {
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
            firstDetected: Date.now() - 1000,
            lastSeen: Date.now(),
            recommendation: {
              priority: 'high' as const,
              category: 'timing' as const,
              recommendation: 'Add explicit waits',
              estimatedEffort: 'medium' as const
            }
          }
        ],
        statistics: {
          total: 1,
          bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
          byPattern: { intermittent: 1, environmental: 0, timing: 0, resource: 0 }
        },
        timestamp: Date.now()
      };

      mockMemoryStore.retrieve.mockResolvedValue(mockResults);

      const stats = await coordinator.getAggregateStatistics();

      expect(stats.totalFlaky).toBe(1);
      expect(stats.bySeverity.high).toBe(1);
      expect(stats.byPattern.intermittent).toBe(1);
    });
  });

  describe('searchFlakyTests', () => {
    it('should search for tests by pattern', async () => {
      const mockSearchResults = [
        {
          key: 'test-namespace/test-analysis/test1',
          value: {
            name: 'test1',
            passRate: 0.5,
            variance: 1000,
            confidence: 0.7,
            totalRuns: 10,
            failurePattern: 'intermittent' as const,
            severity: 'medium' as const,
            firstDetected: Date.now(),
            lastSeen: Date.now(),
            recommendation: {
              priority: 'medium' as const,
              category: 'timing' as const,
              recommendation: 'Review test logic',
              estimatedEffort: 'low' as const
            }
          }
        }
      ];

      mockMemoryStore.search.mockResolvedValue(mockSearchResults);

      const results = await coordinator.searchFlakyTests('test*');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('test1');
      expect(mockMemoryStore.search).toHaveBeenCalledWith(
        expect.stringContaining('test-analysis/test*'),
        expect.objectContaining({ partition: 'coordination', limit: 100 })
      );
    });

    it('should return empty array when no matches found', async () => {
      mockMemoryStore.search.mockResolvedValue([]);

      const results = await coordinator.searchFlakyTests('nonexistent*');
      expect(results).toEqual([]);
    });
  });

  describe('exportMetrics', () => {
    it('should export metrics from memory', async () => {
      const mockMetrics = {
        detectionCount: 10,
        accuracy: 0.95,
        falsePositiveRate: 0.05,
        processingTime: 500
      };

      mockMemoryStore.retrieve.mockResolvedValue(mockMetrics);

      const metrics = await coordinator.exportMetrics();

      expect(metrics).toEqual(mockMetrics);
    });

    it('should return default metrics when none are stored', async () => {
      mockMemoryStore.retrieve.mockResolvedValue(null);

      const metrics = await coordinator.exportMetrics();

      expect(metrics).toEqual({
        detectionCount: 0,
        accuracy: 0,
        falsePositiveRate: 0,
        processingTime: 0
      });
    });
  });

  describe('storeMetrics', () => {
    it('should store metrics in memory', async () => {
      const metrics = {
        detectionCount: 15,
        accuracy: 0.92,
        falsePositiveRate: 0.08,
        processingTime: 750
      };

      await coordinator.storeMetrics(metrics);

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('metrics'),
        expect.objectContaining({
          ...metrics,
          timestamp: expect.any(Number)
        }),
        expect.objectContaining({ partition: 'coordination', ttl: 86400 })
      );
    });
  });

  describe('createCheckpoint', () => {
    it('should create checkpoint when results exist', async () => {
      const mockResults = {
        tests: [],
        statistics: { total: 0 },
        timestamp: Date.now()
      };

      mockMemoryStore.retrieve.mockResolvedValue(mockResults);

      await coordinator.createCheckpoint('session-123');

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('checkpoints/session-123'),
        expect.objectContaining({
          sessionId: 'session-123',
          timestamp: expect.any(Number)
        }),
        expect.objectContaining({ partition: 'coordination', ttl: 604800 })
      );
    });

    it('should not create checkpoint when no results exist', async () => {
      mockMemoryStore.retrieve.mockResolvedValue(null);

      await coordinator.createCheckpoint('session-123');

      // Should not call store for checkpoint if no results
      expect(mockMemoryStore.store).not.toHaveBeenCalledWith(
        expect.stringContaining('checkpoints'),
        expect.anything(),
        expect.anything()
      );
    });
  });
});

describe('setupFlakyDetection', () => {
  it('should create coordinator with default options', async () => {
    const mockMemoryStore: SwarmMemoryStore = {
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue([])
    };

    const coordinator = await setupFlakyDetection(mockMemoryStore);

    expect(coordinator).toBeInstanceOf(FlakyDetectionSwarmCoordinator);
    expect(mockMemoryStore.store).toHaveBeenCalled(); // Event subscription
  });
});
