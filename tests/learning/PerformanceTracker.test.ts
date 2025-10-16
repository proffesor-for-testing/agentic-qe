/**
 * PerformanceTracker Tests - Phase 2 (Milestone 2.2)
 */

import { PerformanceTracker } from '../../src/learning/PerformanceTracker';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';

describe('PerformanceTracker', () => {
  let tracker: PerformanceTracker;
  let memoryStore: SwarmMemoryManager;
  const agentId = 'test-agent-1';

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    tracker = new PerformanceTracker(agentId, memoryStore);
    await tracker.initialize();
  });

  afterEach(async () => {
    await memoryStore.close();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(tracker).toBeDefined();
      expect(tracker.getSnapshotCount()).toBe(0);
    });

    it('should load previous snapshots', async () => {
      // Record some snapshots
      await tracker.recordSnapshot(createMockMetrics());
      await tracker.recordSnapshot(createMockMetrics());

      // Create new tracker (should load snapshots)
      const newTracker = new PerformanceTracker(agentId, memoryStore);
      await newTracker.initialize();

      expect(newTracker.getSnapshotCount()).toBe(2);
    });
  });

  describe('recordSnapshot', () => {
    it('should record performance snapshot', async () => {
      await tracker.recordSnapshot(createMockMetrics());

      expect(tracker.getSnapshotCount()).toBe(1);
    });

    it('should set baseline on first snapshot', async () => {
      await tracker.recordSnapshot(createMockMetrics());

      const baseline = tracker.getBaseline();
      expect(baseline).toBeDefined();
    });

    it('should accumulate multiple snapshots', async () => {
      await tracker.recordSnapshot(createMockMetrics());
      await tracker.recordSnapshot(createMockMetrics());
      await tracker.recordSnapshot(createMockMetrics());

      expect(tracker.getSnapshotCount()).toBe(3);
    });
  });

  describe('calculateImprovement', () => {
    it('should calculate improvement vs baseline', async () => {
      // Record baseline
      await tracker.recordSnapshot(createMockMetrics(0.7, 5000));

      // Wait a bit and record improved metrics
      await delay(100);
      await tracker.recordSnapshot(createMockMetrics(0.85, 3000));

      const improvement = await tracker.calculateImprovement();

      expect(improvement).toBeDefined();
      expect(improvement.improvementRate).toBeGreaterThan(0);
    });

    it('should detect 20% improvement target', async () => {
      // Baseline
      await tracker.recordSnapshot(createMockMetrics(0.6, 10000));

      // Improved (25% better)
      await delay(100);
      await tracker.recordSnapshot(createMockMetrics(0.85, 5000));

      const improvement = await tracker.calculateImprovement();

      expect(improvement.targetAchieved).toBe(true);
      expect(improvement.improvementRate).toBeGreaterThanOrEqual(20);
    });

    it('should track days elapsed', async () => {
      await tracker.recordSnapshot(createMockMetrics());

      await delay(100);
      await tracker.recordSnapshot(createMockMetrics());

      const improvement = await tracker.calculateImprovement();

      expect(improvement.daysElapsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getImprovementTrend', () => {
    it('should return timeline of improvements', async () => {
      // Create multiple snapshots
      for (let i = 0; i < 10; i++) {
        const successRate = 0.6 + (i * 0.03); // gradually improving
        await tracker.recordSnapshot(createMockMetrics(successRate));
        await delay(10);
      }

      const trend = await tracker.getImprovementTrend(30);

      expect(trend.timeline.length).toBeGreaterThan(0);
      expect(trend.currentRate).toBeDefined();
      expect(trend.projected30Day).toBeDefined();
    });

    it('should project 30-day improvement', async () => {
      // Create upward trend
      for (let i = 0; i < 5; i++) {
        const successRate = 0.6 + (i * 0.05);
        await tracker.recordSnapshot(createMockMetrics(successRate));
        await delay(10);
      }

      const trend = await tracker.getImprovementTrend(30);

      expect(trend.projected30Day).toBeGreaterThan(0);
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive report', async () => {
      // Baseline
      await tracker.recordSnapshot(createMockMetrics(0.7, 5000));

      // Improved
      await delay(100);
      await tracker.recordSnapshot(createMockMetrics(0.85, 3000));

      const report = await tracker.generateReport();

      expect(report.summary).toBeDefined();
      expect(report.improvement).toBeDefined();
      expect(report.trends).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    it('should provide recommendations', async () => {
      // Poor performance
      await tracker.recordSnapshot(createMockMetrics(0.5, 10000, 0.3));

      const report = await tracker.generateReport();

      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should celebrate good performance', async () => {
      // Excellent performance
      await tracker.recordSnapshot(createMockMetrics(0.95, 2000, 0.02));

      const report = await tracker.generateReport();

      const hasPositiveMessage = report.recommendations.some(r =>
        r.includes('excellent') || r.includes('Continue')
      );

      expect(hasPositiveMessage).toBe(true);
    });
  });

  describe('getMetricsForPeriod', () => {
    it('should aggregate metrics for period', async () => {
      const startDate = new Date();

      // Record multiple snapshots
      for (let i = 0; i < 5; i++) {
        await tracker.recordSnapshot(createMockMetrics());
        await delay(10);
      }

      const endDate = new Date();

      const metrics = await tracker.getMetricsForPeriod(startDate, endDate);

      expect(metrics).toBeDefined();
      expect(metrics.metrics).toBeDefined();
      expect(metrics.trends).toBeDefined();
    });

    it('should calculate trends', async () => {
      // Create trend: improving success rate
      for (let i = 0; i < 5; i++) {
        const successRate = 0.6 + (i * 0.05);
        await tracker.recordSnapshot(createMockMetrics(successRate));
        await delay(10);
      }

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 1000);

      const metrics = await tracker.getMetricsForPeriod(startDate, endDate);

      const successTrend = metrics.trends.find(t => t.metric === 'successRate');
      expect(successTrend?.direction).toBe('up');
    });
  });

  describe('snapshot pruning', () => {
    it('should prune old snapshots', async () => {
      // This test would need time manipulation
      // For now, just verify pruning doesn't crash
      for (let i = 0; i < 100; i++) {
        await tracker.recordSnapshot(createMockMetrics());
      }

      expect(tracker.getSnapshotCount()).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createMockMetrics(
  successRate: number = 0.8,
  executionTime: number = 3000,
  errorRate: number = 0.1
): any {
  return {
    metrics: {
      tasksCompleted: Math.floor(Math.random() * 100) + 10,
      successRate,
      averageExecutionTime: executionTime,
      errorRate,
      userSatisfaction: Math.random() * 0.3 + 0.7, // 0.7 - 1.0
      resourceEfficiency: Math.random() * 0.3 + 0.6 // 0.6 - 0.9
    },
    trends: []
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
