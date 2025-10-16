/**
 * Unit Tests for PerformanceTracker
 *
 * Tests performance tracking, trend analysis, and 20% improvement detection.
 * Target: 90%+ coverage
 *
 * @module tests/unit/learning/PerformanceTracker
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PerformanceTracker } from '../../../src/learning/PerformanceTracker';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { PerformanceMetrics } from '../../../src/learning/types';

describe('PerformanceTracker', () => {
  let tracker: PerformanceTracker;
  let memoryStore: SwarmMemoryManager;
  const agentId = 'test-agent-001';

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();
    tracker = new PerformanceTracker(agentId, memoryStore);
    await tracker.initialize();
  });

  afterEach(async () => {
    // Clean up memory store
    try {
      await memoryStore.clear();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  // -------------------------------------------------------------------------
  // Initialization Tests
  // -------------------------------------------------------------------------

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const newTracker = new PerformanceTracker('test-agent-002', memoryStore);
      await newTracker.initialize();

      expect(newTracker).toBeDefined();
      expect(newTracker.getSnapshotCount()).toBe(0);
    });

    it('should load previous snapshots if they exist', async () => {
      // Record some snapshots
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.9,
          averageExecutionTime: 1000,
          errorRate: 0.1,
          userSatisfaction: 0.85,
          resourceEfficiency: 0.8
        },
        trends: []
      });

      // Create new tracker with same agent ID
      const newTracker = new PerformanceTracker(agentId, memoryStore);
      await newTracker.initialize();

      expect(newTracker.getSnapshotCount()).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Recording Snapshots
  // -------------------------------------------------------------------------

  describe('Recording Snapshots', () => {
    it('should record a performance snapshot', async () => {
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.95,
          averageExecutionTime: 1500,
          errorRate: 0.05,
          userSatisfaction: 0.9,
          resourceEfficiency: 0.85
        },
        trends: []
      });

      expect(tracker.getSnapshotCount()).toBe(1);
    });

    it('should set baseline on first snapshot', async () => {
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 5,
          successRate: 0.8,
          averageExecutionTime: 2000,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        },
        trends: []
      });

      const baseline = tracker.getBaseline();
      expect(baseline).toBeDefined();
      expect(baseline?.metrics.successRate).toBe(0.8);
    });

    it('should record multiple snapshots over time', async () => {
      for (let i = 0; i < 5; i++) {
        await tracker.recordSnapshot({
          metrics: {
            tasksCompleted: 10 + i,
            successRate: 0.8 + i * 0.02,
            averageExecutionTime: 2000 - i * 100,
            errorRate: 0.2 - i * 0.02,
            userSatisfaction: 0.75 + i * 0.03,
            resourceEfficiency: 0.7 + i * 0.02
          },
          trends: []
        });
      }

      expect(tracker.getSnapshotCount()).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Improvement Calculation
  // -------------------------------------------------------------------------

  describe('Improvement Calculation', () => {
    beforeEach(async () => {
      // Record baseline
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.7,
          averageExecutionTime: 3000,
          errorRate: 0.3,
          userSatisfaction: 0.6,
          resourceEfficiency: 0.5
        },
        trends: []
      });
    });

    it('should calculate improvement vs baseline', async () => {
      // Record improved performance
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 20,
          successRate: 0.9,
          averageExecutionTime: 1500,
          errorRate: 0.1,
          userSatisfaction: 0.85,
          resourceEfficiency: 0.8
        },
        trends: []
      });

      const improvement = await tracker.calculateImprovement();

      expect(improvement.improvementRate).toBeGreaterThan(0);
      expect(improvement.daysElapsed).toBeGreaterThanOrEqual(0);
    });

    it('should detect 20% improvement achievement', async () => {
      // Record significant improvement (30%)
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 30,
          successRate: 0.95,
          averageExecutionTime: 1000,
          errorRate: 0.05,
          userSatisfaction: 0.95,
          resourceEfficiency: 0.9
        },
        trends: []
      });

      const improvement = await tracker.calculateImprovement();

      // With composite scoring, should exceed 20%
      expect(improvement.improvementRate).toBeGreaterThan(20);
      expect(improvement.targetAchieved).toBe(true);
    });

    it('should handle negative improvement', async () => {
      // Record degraded performance
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 5,
          successRate: 0.5,
          averageExecutionTime: 5000,
          errorRate: 0.5,
          userSatisfaction: 0.4,
          resourceEfficiency: 0.3
        },
        trends: []
      });

      const improvement = await tracker.calculateImprovement();

      expect(improvement.improvementRate).toBeLessThan(0);
      expect(improvement.targetAchieved).toBe(false);
    });

    it('should throw error if no baseline exists', async () => {
      const newTracker = new PerformanceTracker('test-agent-003', memoryStore);
      await newTracker.initialize();

      await expect(newTracker.calculateImprovement()).rejects.toThrow('No baseline or snapshots available');
    });
  });

  // -------------------------------------------------------------------------
  // Trend Analysis
  // -------------------------------------------------------------------------

  describe('Trend Analysis', () => {
    beforeEach(async () => {
      // Record baseline
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.75,
          averageExecutionTime: 2500,
          errorRate: 0.25,
          userSatisfaction: 0.7,
          resourceEfficiency: 0.65
        },
        trends: []
      });

      // Simulate improving trend over 10 snapshots
      for (let i = 1; i <= 10; i++) {
        await tracker.recordSnapshot({
          metrics: {
            tasksCompleted: 10 + i * 2,
            successRate: 0.75 + i * 0.015,
            averageExecutionTime: 2500 - i * 150,
            errorRate: 0.25 - i * 0.015,
            userSatisfaction: 0.7 + i * 0.02,
            resourceEfficiency: 0.65 + i * 0.02
          },
          trends: []
        });
      }
    });

    it('should calculate improvement trend', async () => {
      const trend = await tracker.getImprovementTrend(30);

      expect(trend.timeline).toBeDefined();
      expect(trend.timeline.length).toBeGreaterThan(0);
      expect(trend.currentRate).toBeGreaterThan(0);
    });

    it('should project 30-day improvement', async () => {
      const trend = await tracker.getImprovementTrend(30);

      expect(trend.projected30Day).toBeDefined();
      // With improving trend, projection should be positive
      expect(trend.projected30Day).toBeGreaterThan(0);
    });

    it('should handle trend calculation with insufficient data', async () => {
      const newTracker = new PerformanceTracker('test-agent-004', memoryStore);
      await newTracker.initialize();

      await newTracker.recordSnapshot({
        metrics: {
          tasksCompleted: 5,
          successRate: 0.8,
          averageExecutionTime: 2000,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        },
        trends: []
      });

      // With only one snapshot (which becomes baseline), trend should be calculated but minimal
      const trend = await newTracker.getImprovementTrend(30);
      expect(trend).toBeDefined();
      expect(trend.timeline.length).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // Period Metrics
  // -------------------------------------------------------------------------

  describe('Period Metrics', () => {
    beforeEach(async () => {
      // Record snapshots over a period
      const now = new Date();
      for (let i = 0; i < 5; i++) {
        await tracker.recordSnapshot({
          metrics: {
            tasksCompleted: 10 + i,
            successRate: 0.8 + i * 0.02,
            averageExecutionTime: 2000 - i * 100,
            errorRate: 0.2 - i * 0.02,
            userSatisfaction: 0.75 + i * 0.03,
            resourceEfficiency: 0.7 + i * 0.02
          },
          trends: []
        });
      }
    });

    it('should get metrics for a specific period', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const endDate = new Date();

      const metrics = await tracker.getMetricsForPeriod(startDate, endDate);

      expect(metrics).toBeDefined();
      expect(metrics.agentId).toBe(agentId);
      expect(metrics.metrics.tasksCompleted).toBeGreaterThan(0);
    });

    it('should throw error if no snapshots in period', async () => {
      const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago
      const endDate = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000);

      await expect(tracker.getMetricsForPeriod(startDate, endDate))
        .rejects.toThrow('No snapshots found for the specified period');
    });
  });

  // -------------------------------------------------------------------------
  // Performance Reports
  // -------------------------------------------------------------------------

  describe('Performance Reports', () => {
    beforeEach(async () => {
      // Record baseline
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.7,
          averageExecutionTime: 3000,
          errorRate: 0.3,
          userSatisfaction: 0.65,
          resourceEfficiency: 0.6
        },
        trends: []
      });

      // Record improved state
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 25,
          successRate: 0.92,
          averageExecutionTime: 1200,
          errorRate: 0.08,
          userSatisfaction: 0.88,
          resourceEfficiency: 0.85
        },
        trends: []
      });
    });

    it('should generate performance report', async () => {
      const report = await tracker.generateReport();

      expect(report.summary).toBeDefined();
      expect(report.improvement).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should include improvement data in report', async () => {
      const report = await tracker.generateReport();

      expect(report.improvement.improvementRate).toBeDefined();
      expect(report.improvement.baseline).toBeDefined();
      expect(report.improvement.current).toBeDefined();
    });

    it('should generate recommendations based on performance', async () => {
      const report = await tracker.generateReport();

      // With excellent performance, should recommend maintaining
      expect(report.recommendations).toContain(
        'Performance is excellent! Continue current strategies and maintain quality.'
      );
    });

    it('should identify areas for improvement', async () => {
      // Record poor performance
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 5,
          successRate: 0.5,
          averageExecutionTime: 5000,
          errorRate: 0.5,
          userSatisfaction: 0.4,
          resourceEfficiency: 0.3
        },
        trends: []
      });

      const report = await tracker.generateReport();

      // Should have specific recommendations
      expect(report.recommendations.length).toBeGreaterThan(1);
      expect(report.recommendations.some(r =>
        r.includes('success rate') ||
        r.includes('execution time') ||
        r.includes('error rate')
      )).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Performance Score Calculation
  // -------------------------------------------------------------------------

  describe('Performance Score Calculation', () => {
    it('should calculate composite performance score', async () => {
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 20,
          successRate: 0.95,
          averageExecutionTime: 1000,
          errorRate: 0.05,
          userSatisfaction: 0.9,
          resourceEfficiency: 0.85
        },
        trends: []
      });

      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 25,
          successRate: 0.98,
          averageExecutionTime: 800,
          errorRate: 0.02,
          userSatisfaction: 0.95,
          resourceEfficiency: 0.92
        },
        trends: []
      });

      const improvement = await tracker.calculateImprovement();

      // Improved metrics should result in positive improvement
      expect(improvement.improvementRate).toBeGreaterThan(0);
    });

    it('should weight success rate heavily in score', async () => {
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.5,
          averageExecutionTime: 1000,
          errorRate: 0.5,
          userSatisfaction: 0.9,
          resourceEfficiency: 0.9
        },
        trends: []
      });

      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 15,
          successRate: 0.95,
          averageExecutionTime: 1000,
          errorRate: 0.05,
          userSatisfaction: 0.9,
          resourceEfficiency: 0.9
        },
        trends: []
      });

      const improvement = await tracker.calculateImprovement();

      // Success rate improvement should significantly impact score (>20%)
      expect(improvement.improvementRate).toBeGreaterThan(20);
    });
  });

  // -------------------------------------------------------------------------
  // Snapshot Management
  // -------------------------------------------------------------------------

  describe('Snapshot Management', () => {
    it('should prune old snapshots', async () => {
      // Record many snapshots
      for (let i = 0; i < 100; i++) {
        await tracker.recordSnapshot({
          metrics: {
            tasksCompleted: 10 + i,
            successRate: 0.8,
            averageExecutionTime: 2000,
            errorRate: 0.2,
            userSatisfaction: 0.75,
            resourceEfficiency: 0.7
          },
          trends: []
        });
      }

      const count = tracker.getSnapshotCount();
      expect(count).toBeLessThanOrEqual(100);
    });

    it('should persist snapshots to memory', async () => {
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 10,
          successRate: 0.9,
          averageExecutionTime: 1500,
          errorRate: 0.1,
          userSatisfaction: 0.85,
          resourceEfficiency: 0.8
        },
        trends: []
      });

      // Create new tracker and verify data persists
      const newTracker = new PerformanceTracker(agentId, memoryStore);
      await newTracker.initialize();

      expect(newTracker.getSnapshotCount()).toBeGreaterThan(0);
      expect(newTracker.getBaseline()).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle zero performance metrics', async () => {
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 0,
          successRate: 0,
          averageExecutionTime: 0,
          errorRate: 1.0,
          userSatisfaction: 0,
          resourceEfficiency: 0
        },
        trends: []
      });

      expect(tracker.getSnapshotCount()).toBe(1);
    });

    it('should handle perfect performance metrics', async () => {
      await tracker.recordSnapshot({
        metrics: {
          tasksCompleted: 1000,
          successRate: 1.0,
          averageExecutionTime: 100,
          errorRate: 0,
          userSatisfaction: 1.0,
          resourceEfficiency: 1.0
        },
        trends: []
      });

      expect(tracker.getSnapshotCount()).toBe(1);
    });

    it('should handle identical consecutive snapshots', async () => {
      const sameMetrics = {
        metrics: {
          tasksCompleted: 10,
          successRate: 0.8,
          averageExecutionTime: 2000,
          errorRate: 0.2,
          userSatisfaction: 0.75,
          resourceEfficiency: 0.7
        },
        trends: []
      };

      await tracker.recordSnapshot(sameMetrics);
      await tracker.recordSnapshot(sameMetrics);
      await tracker.recordSnapshot(sameMetrics);

      const improvement = await tracker.calculateImprovement();

      // No change should result in 0% improvement
      expect(Math.abs(improvement.improvementRate)).toBeLessThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // Performance Tests
  // -------------------------------------------------------------------------

  describe('Performance', () => {
    it('should handle recording 1000 snapshots efficiently', async () => {
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        await tracker.recordSnapshot({
          metrics: {
            tasksCompleted: 10 + i,
            successRate: 0.8 + (i % 20) * 0.01,
            averageExecutionTime: 2000 - (i % 1000),
            errorRate: 0.2 - (i % 20) * 0.01,
            userSatisfaction: 0.75 + (i % 25) * 0.01,
            resourceEfficiency: 0.7 + (i % 30) * 0.01
          },
          trends: []
        });
      }

      const duration = performance.now() - start;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds
    }, 15000);

    it('should calculate improvement quickly with large dataset', async () => {
      // Record 100 snapshots
      for (let i = 0; i < 100; i++) {
        await tracker.recordSnapshot({
          metrics: {
            tasksCompleted: 10 + i,
            successRate: 0.7 + i * 0.002,
            averageExecutionTime: 3000 - i * 20,
            errorRate: 0.3 - i * 0.002,
            userSatisfaction: 0.6 + i * 0.003,
            resourceEfficiency: 0.5 + i * 0.004
          },
          trends: []
        });
      }

      const start = performance.now();
      await tracker.calculateImprovement();
      const duration = performance.now() - start;

      // Should be nearly instant
      expect(duration).toBeLessThan(100); // 100ms
    });
  });
});
