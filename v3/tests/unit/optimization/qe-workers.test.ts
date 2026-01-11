/**
 * Unit Tests for QE Optimization Workers
 * ADR-024: Self-Optimization Engine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PatternConsolidatorWorker,
  CoverageGapScannerWorker,
  FlakyTestDetectorWorker,
  RoutingAccuracyMonitorWorker,
  QE_OPTIMIZATION_WORKER_CONFIGS,
  createPatternConsolidatorWorker,
  createCoverageGapScannerWorker,
  createFlakyTestDetectorWorker,
  createRoutingAccuracyMonitorWorker,
} from '../../../src/optimization/index.js';
import type { WorkerContext } from '../../../src/workers/interfaces.js';

// Create mock context
function createMockContext(): WorkerContext {
  return {
    signal: new AbortController().signal,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    eventBus: {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    },
  };
}

describe('QE_OPTIMIZATION_WORKER_CONFIGS', () => {
  it('should have 4 worker configurations', () => {
    expect(Object.keys(QE_OPTIMIZATION_WORKER_CONFIGS)).toHaveLength(4);
  });

  it('should have pattern-consolidator config', () => {
    const config = QE_OPTIMIZATION_WORKER_CONFIGS['pattern-consolidator'];
    expect(config.name).toBe('Pattern Consolidator');
    expect(config.intervalMs).toBe(30 * 60 * 1000);
    expect(config.priority).toBe('normal');
  });

  it('should have coverage-gap-scanner config', () => {
    const config = QE_OPTIMIZATION_WORKER_CONFIGS['coverage-gap-scanner'];
    expect(config.name).toBe('Coverage Gap Scanner');
    expect(config.intervalMs).toBe(60 * 60 * 1000);
    expect(config.priority).toBe('high');
  });

  it('should have flaky-test-detector config', () => {
    const config = QE_OPTIMIZATION_WORKER_CONFIGS['flaky-test-detector'];
    expect(config.name).toBe('Flaky Test Detector');
    expect(config.intervalMs).toBe(2 * 60 * 60 * 1000);
    expect(config.priority).toBe('high');
  });

  it('should have routing-accuracy-monitor config', () => {
    const config = QE_OPTIMIZATION_WORKER_CONFIGS['routing-accuracy-monitor'];
    expect(config.name).toBe('Routing Accuracy Monitor');
    expect(config.intervalMs).toBe(15 * 60 * 1000);
    expect(config.priority).toBe('critical');
  });
});

describe('PatternConsolidatorWorker', () => {
  it('should execute and consolidate patterns', async () => {
    const deps = {
      consolidatePatterns: vi.fn().mockResolvedValue({
        merged: 5,
        pruned: 3,
        updated: 10,
      }),
      getPatternStats: vi.fn().mockResolvedValue({
        total: 100,
        duplicateGroups: 5,
        lowQuality: 10,
      }),
    };

    const worker = createPatternConsolidatorWorker(deps);
    const context = createMockContext();

    const result = await worker.execute(context);

    expect(result.success).toBe(true);
    expect(deps.consolidatePatterns).toHaveBeenCalled();
    expect(deps.getPatternStats).toHaveBeenCalled();
    expect(result.metrics.domainMetrics?.patternsMerged).toBe(5);
    expect(result.metrics.domainMetrics?.patternsPruned).toBe(3);
  });

  it('should generate findings for merged patterns', async () => {
    const deps = {
      consolidatePatterns: vi.fn().mockResolvedValue({
        merged: 10,
        pruned: 0,
        updated: 0,
      }),
      getPatternStats: vi.fn().mockResolvedValue({
        total: 100,
        duplicateGroups: 5,
        lowQuality: 5,
      }),
    };

    const worker = createPatternConsolidatorWorker(deps);
    const result = await worker.execute(createMockContext());

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some(f => f.title.includes('Merged'))).toBe(true);
  });

  it('should recommend review when many duplicates remain', async () => {
    const deps = {
      consolidatePatterns: vi.fn().mockResolvedValue({
        merged: 2,
        pruned: 0,
        updated: 0,
      }),
      getPatternStats: vi.fn().mockResolvedValue({
        total: 100,
        duplicateGroups: 15, // High count - above threshold of 10
        lowQuality: 5,
      }),
    };

    const worker = createPatternConsolidatorWorker(deps);
    const result = await worker.execute(createMockContext());

    // Check for recommendation about similar embeddings (which indicates duplicates)
    expect(result.recommendations.some(r =>
      r.action.includes('similar embeddings') || r.description.includes('duplicate')
    )).toBe(true);
  });
});

describe('CoverageGapScannerWorker', () => {
  it('should scan and prioritize coverage gaps', async () => {
    const deps = {
      findCoverageGaps: vi.fn().mockResolvedValue([
        { file: 'src/a.ts', type: 'uncovered-lines', startLine: 10, endLine: 20, riskScore: 0.8 },
        { file: 'src/b.ts', type: 'uncovered-branches', startLine: 5, endLine: 15, riskScore: 0.5 },
      ]),
      prioritizeGaps: vi.fn().mockResolvedValue([
        { file: 'src/a.ts', priority: 1, reason: 'High risk' },
        { file: 'src/b.ts', priority: 2, reason: 'Medium risk' },
      ]),
      queueCoverageTask: vi.fn().mockResolvedValue(undefined),
    };

    const worker = createCoverageGapScannerWorker(deps);
    const result = await worker.execute(createMockContext());

    expect(result.success).toBe(true);
    expect(deps.findCoverageGaps).toHaveBeenCalled();
    expect(deps.prioritizeGaps).toHaveBeenCalled();
    expect(result.metrics.domainMetrics?.totalGaps).toBe(2);
  });

  it('should queue tasks for high-priority gaps', async () => {
    const deps = {
      findCoverageGaps: vi.fn().mockResolvedValue([
        { file: 'src/critical.ts', type: 'uncovered-lines', startLine: 1, endLine: 50, riskScore: 0.95 },
      ]),
      prioritizeGaps: vi.fn().mockResolvedValue([
        { file: 'src/critical.ts', priority: 1, reason: 'Critical' },
      ]),
      queueCoverageTask: vi.fn().mockResolvedValue(undefined),
    };

    const worker = createCoverageGapScannerWorker(deps);
    await worker.execute(createMockContext());

    expect(deps.queueCoverageTask).toHaveBeenCalledWith({
      file: 'src/critical.ts',
      priority: 1,
    });
  });

  it('should generate critical recommendation for many high-risk gaps', async () => {
    const gaps = [];
    for (let i = 0; i < 25; i++) {
      gaps.push({
        file: `src/file${i}.ts`,
        type: 'uncovered-lines',
        startLine: 1,
        endLine: 10,
        riskScore: 0.75,
      });
    }

    const deps = {
      findCoverageGaps: vi.fn().mockResolvedValue(gaps),
      prioritizeGaps: vi.fn().mockResolvedValue(gaps.map((g, i) => ({
        file: g.file,
        priority: i + 1,
        reason: 'Risk',
      }))),
      queueCoverageTask: vi.fn().mockResolvedValue(undefined),
    };

    const worker = createCoverageGapScannerWorker(deps);
    const result = await worker.execute(createMockContext());

    // Check for high-priority recommendation about coverage gaps
    // Implementation uses priority 'p0' (not 'critical') and action about sprint time
    expect(result.recommendations.some(r =>
      r.priority === 'p0' && r.description.includes('high-risk')
    )).toBe(true);
  });
});

describe('FlakyTestDetectorWorker', () => {
  it('should detect flaky tests', async () => {
    const deps = {
      getTestHistory: vi.fn().mockResolvedValue([
        { testId: 't1', testName: 'Test 1', filePath: 'tests/a.test.ts', runs: 10, passes: 7, failures: 3, avgDuration: 100, durationVariance: 2500 },
        { testId: 't2', testName: 'Test 2', filePath: 'tests/b.test.ts', runs: 10, passes: 10, failures: 0, avgDuration: 50, durationVariance: 100 },
      ]),
      queueFlakyTestFix: vi.fn().mockResolvedValue(undefined),
    };

    const worker = createFlakyTestDetectorWorker(deps);
    const result = await worker.execute(createMockContext());

    expect(result.success).toBe(true);
    expect(result.metrics.domainMetrics?.flakyTests).toBeGreaterThanOrEqual(1);
  });

  it('should queue fix tasks for worst offenders', async () => {
    const deps = {
      getTestHistory: vi.fn().mockResolvedValue([
        { testId: 'flaky1', testName: 'Flaky Test 1', filePath: 'tests/flaky.test.ts', runs: 20, passes: 10, failures: 10, avgDuration: 100, durationVariance: 5000 },
      ]),
      queueFlakyTestFix: vi.fn().mockResolvedValue(undefined),
    };

    const worker = createFlakyTestDetectorWorker(deps);
    await worker.execute(createMockContext());

    expect(deps.queueFlakyTestFix).toHaveBeenCalled();
  });

  it('should skip tests with insufficient runs', async () => {
    const deps = {
      getTestHistory: vi.fn().mockResolvedValue([
        { testId: 't1', testName: 'New Test', filePath: 'tests/new.test.ts', runs: 2, passes: 1, failures: 1, avgDuration: 100, durationVariance: 1000 },
      ]),
      queueFlakyTestFix: vi.fn().mockResolvedValue(undefined),
    };

    const worker = createFlakyTestDetectorWorker(deps);
    const result = await worker.execute(createMockContext());

    // Should not flag test with only 2 runs
    expect(result.metrics.domainMetrics?.flakyTests).toBe(0);
  });

  it('should generate high-severity findings for high-flakiness tests', async () => {
    const deps = {
      getTestHistory: vi.fn().mockResolvedValue([
        { testId: 'very-flaky', testName: 'Very Flaky Test', filePath: 'tests/flaky.test.ts', runs: 100, passes: 50, failures: 50, avgDuration: 100, durationVariance: 10000 },
      ]),
      queueFlakyTestFix: vi.fn().mockResolvedValue(undefined),
    };

    const worker = createFlakyTestDetectorWorker(deps);
    const result = await worker.execute(createMockContext());

    expect(result.findings.some(f =>
      f.severity === 'high' && f.title.includes('Flaky Test')
    )).toBe(true);
  });
});

describe('RoutingAccuracyMonitorWorker', () => {
  it('should monitor routing accuracy', async () => {
    const deps = {
      getRoutingStats: vi.fn().mockResolvedValue({
        totalDecisions: 100,
        followedRecommendations: 80,
        successWhenFollowed: 70,
        successWhenOverridden: 15,
        avgConfidence: 0.85,
        confidenceCorrelation: 0.6,
      }),
      retrainRouter: vi.fn().mockResolvedValue({
        success: true,
        patternsUsed: 500,
        accuracy: 0.85,
      }),
    };

    const worker = createRoutingAccuracyMonitorWorker(deps);
    const result = await worker.execute(createMockContext());

    expect(result.success).toBe(true);
    expect(deps.getRoutingStats).toHaveBeenCalledWith(60 * 60 * 1000);
    expect(result.metrics.domainMetrics?.totalDecisions).toBe(100);
  });

  it('should trigger retrain when accuracy below threshold', async () => {
    const deps = {
      getRoutingStats: vi.fn().mockResolvedValue({
        totalDecisions: 50,
        followedRecommendations: 40,
        successWhenFollowed: 20, // 50% accuracy - below 80% threshold
        successWhenOverridden: 5,
        avgConfidence: 0.7,
        confidenceCorrelation: 0.4,
      }),
      retrainRouter: vi.fn().mockResolvedValue({
        success: true,
        patternsUsed: 300,
        accuracy: 0.82,
      }),
    };

    const worker = createRoutingAccuracyMonitorWorker(deps);
    const result = await worker.execute(createMockContext());

    expect(deps.retrainRouter).toHaveBeenCalled();
    expect(result.findings.some(f => f.title.includes('Retrained'))).toBe(true);
    // Implementation returns 1 for truthy, 0 for falsy
    expect(result.metrics.domainMetrics?.retrainTriggered).toBe(1);
  });

  it('should not retrain when accuracy is good', async () => {
    const deps = {
      getRoutingStats: vi.fn().mockResolvedValue({
        totalDecisions: 100,
        followedRecommendations: 90,
        successWhenFollowed: 85, // 94% accuracy - above threshold
        successWhenOverridden: 5,
        avgConfidence: 0.9,
        confidenceCorrelation: 0.8,
      }),
      retrainRouter: vi.fn().mockResolvedValue({
        success: true,
        patternsUsed: 500,
        accuracy: 0.95,
      }),
    };

    const worker = createRoutingAccuracyMonitorWorker(deps);
    await worker.execute(createMockContext());

    expect(deps.retrainRouter).not.toHaveBeenCalled();
  });

  it('should warn when follow rate is low', async () => {
    const deps = {
      getRoutingStats: vi.fn().mockResolvedValue({
        totalDecisions: 100,
        followedRecommendations: 30, // Only 30% follow rate
        successWhenFollowed: 25,
        successWhenOverridden: 50,
        avgConfidence: 0.7,
        confidenceCorrelation: 0.3,
      }),
      retrainRouter: vi.fn().mockResolvedValue({
        success: true,
        patternsUsed: 500,
        accuracy: 0.85,
      }),
    };

    const worker = createRoutingAccuracyMonitorWorker(deps);
    const result = await worker.execute(createMockContext());

    expect(result.findings.some(f =>
      f.severity === 'high' && f.title.includes('Follow Rate')
    )).toBe(true);
  });

  it('should flag critical issue when overrides perform better', async () => {
    const deps = {
      getRoutingStats: vi.fn().mockResolvedValue({
        totalDecisions: 100,
        followedRecommendations: 60,
        successWhenFollowed: 30, // 50% success when followed
        successWhenOverridden: 35, // 87.5% success when overridden (better!)
        avgConfidence: 0.75,
        confidenceCorrelation: -0.2,
      }),
      retrainRouter: vi.fn().mockResolvedValue({
        success: true,
        patternsUsed: 500,
        accuracy: 0.85,
      }),
    };

    const worker = createRoutingAccuracyMonitorWorker(deps);
    const result = await worker.execute(createMockContext());

    expect(result.findings.some(f =>
      f.severity === 'critical' && f.title.includes('Override')
    )).toBe(true);
  });
});
