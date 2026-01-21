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

import { PerformanceTracker } from '../../../src/learning/PerformanceTracker';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { PerformanceMetrics } from '../../../src/learning/types';

describe('PerformanceTracker', () => {
  let tracker: PerformanceTracker;
  let mockMemoryStore: jest.Mocked<SwarmMemoryManager>;

  beforeEach(() => {
    mockMemoryStore = {
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null),
      query: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined)
    } as any;

    tracker = new PerformanceTracker('test-agent', mockMemoryStore);
  });

  describe('constructor', () => {
    it('should create PerformanceTracker instance with valid agentId', () => {
      expect(tracker).toBeInstanceOf(PerformanceTracker);
      expect(tracker.getSnapshotCount()).toBe(0);
      expect(tracker.getBaseline()).toBeUndefined();
    });

    it('should initialize with empty snapshots', () => {
      expect(tracker.getSnapshotCount()).toBe(0);
    });
  });

  describe('recordSnapshot', () => {
    it('should record a performance snapshot successfully', async () => {
      const metrics = {
        metrics: {
          tasksCompleted: 10,
          successRate: 0.9,
          averageExecutionTime: 1000,
          errorRate: 0.1,
          userSatisfaction: 0.85,
          resourceEfficiency: 0.8
        }
      };

      await tracker.recordSnapshot(metrics);

      expect(tracker.getSnapshotCount()).toBe(1);
      expect(mockMemoryStore.store).toHaveBeenCalled();
    });

    it('should set baseline on first snapshot', async () => {
      const metrics = {
        metrics: {
          tasksCompleted: 5,
          successRate: 0.8,
          averageExecutionTime: 1500,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        }
      };

      await tracker.recordSnapshot(metrics);

      const baseline = tracker.getBaseline();
      expect(baseline).toBeDefined();
      expect(baseline?.agentId).toBe('test-agent');
      expect(baseline?.metrics.successRate).toBe(0.8);
    });

    it('should handle multiple snapshots', async () => {
      const metrics1 = {
        metrics: {
          tasksCompleted: 5,
          successRate: 0.8,
          averageExecutionTime: 1500,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        }
      };

      const metrics2 = {
        metrics: {
          tasksCompleted: 10,
          successRate: 0.9,
          averageExecutionTime: 1200,
          errorRate: 0.1,
          userSatisfaction: 0.85,
          resourceEfficiency: 0.8
        }
      };

      await tracker.recordSnapshot(metrics1);
      await tracker.recordSnapshot(metrics2);

      expect(tracker.getSnapshotCount()).toBe(2);
    });
  });

  describe('calculateImprovement', () => {
    it('should throw error when no baseline or snapshots available', async () => {
      await expect(tracker.calculateImprovement()).rejects.toThrow('No baseline or snapshots available');
    });

    it('should calculate improvement rate correctly', async () => {
      // Record baseline
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 5,
          successRate: 0.7,
          averageExecutionTime: 2000,
          errorRate: 0.3,
          userSatisfaction: 0.6,
          resourceEfficiency: 0.5
        }
      });

      // Record improved snapshot
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.9,
          averageExecutionTime: 1000,
          errorRate: 0.1,
          userSatisfaction: 0.9,
          resourceEfficiency: 0.9
        }
      });

      const improvement = await tracker.calculateImprovement();

      expect(improvement).toBeDefined();
      expect(improvement.agentId).toBe('test-agent');
      expect(improvement.improvementRate).toBeGreaterThan(0);
      expect(typeof improvement.daysElapsed).toBe('number');
    });

    it('should store improvement data in memory', async () => {
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 5,
          successRate: 0.8,
          averageExecutionTime: 1500,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        }
      });

      await tracker.calculateImprovement();

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringContaining('improvement'),
        expect.any(Object),
        expect.objectContaining({ partition: 'learning' })
      );
    });
  });

  describe('getSnapshotCount', () => {
    it('should return 0 for new tracker', () => {
      expect(tracker.getSnapshotCount()).toBe(0);
    });

    it('should return correct count after recording snapshots', async () => {
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 5,
          successRate: 0.8,
          averageExecutionTime: 1500,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        }
      });

      expect(tracker.getSnapshotCount()).toBe(1);
    });
  });

  describe('getBaseline', () => {
    it('should return undefined when no baseline set', () => {
      expect(tracker.getBaseline()).toBeUndefined();
    });

    it('should return baseline after first snapshot', async () => {
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 5,
          successRate: 0.8,
          averageExecutionTime: 1500,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        }
      });

      const baseline = tracker.getBaseline();
      expect(baseline).toBeDefined();
      expect(baseline?.metrics.tasksCompleted).toBe(5);
    });
  });

  describe('error handling', () => {
    it('should handle memory store errors gracefully during initialization', async () => {
      mockMemoryStore.retrieve.mockRejectedValue(new Error('Storage error'));

      await expect(tracker.initialize()).resolves.not.toThrow();
    });

    it('should handle snapshot storage errors', async () => {
      mockMemoryStore.store.mockRejectedValue(new Error('Storage error'));

      await expect(tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 5,
          successRate: 0.8,
          averageExecutionTime: 1500,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        }
      })).rejects.toThrow('Storage error');
    });
  });
});
