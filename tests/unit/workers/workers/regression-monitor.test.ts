import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RegressionMonitorWorker } from '../../../../src/workers/workers/regression-monitor';
import type { WorkerContext } from '../../../../src/workers/interfaces';

const coverage = (line: number, branch: number | null = null) => ({
  line, branch, function: null, statement: null, files: 1, measured: true,
});
const tests = (value: number, measuredAt = new Date().toISOString()) => ({
  schemaVersion: 1, metric: 'testsPassing', value, measuredAt, source: 'test-execution',
});

function context(records: Record<string, unknown> = {}): WorkerContext {
  return {
    eventBus: { publish: vi.fn().mockResolvedValue(undefined) },
    memory: {
      get: vi.fn().mockImplementation((key: string, options?: { namespace?: string }) =>
        Promise.resolve(records[`${options?.namespace ?? 'default'}:${key}`])),
      set: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue([]),
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    domains: {
      getDomainAPI: vi.fn().mockReturnValue({}),
      getDomainHealth: vi.fn().mockReturnValue({ status: 'healthy', errors: [] }),
    },
    signal: new AbortController().signal,
  };
}

describe('RegressionMonitorWorker', () => {
  let worker: RegressionMonitorWorker;
  beforeEach(() => { worker = new RegressionMonitorWorker(); });

  it('keeps its scheduled worker contract', () => {
    expect(worker.config.id).toBe('regression-monitor');
    expect(worker.config.intervalMs).toBe(10 * 60 * 1000);
  });

  it('does not store a clean baseline when no measurements exist', async () => {
    const ctx = context();
    const result = await worker.execute(ctx);
    expect(result.success).toBe(true);
    expect(result.metrics.itemsAnalyzed).toBe(0);
    expect(result.metrics.healthScore).toBe(0);
    expect(result.metrics.domainMetrics.evidenceStatus).toBe('unmeasured');
    expect(result.findings).toEqual([expect.objectContaining({
      type: 'regression-evidence-unavailable', severity: 'info',
    })]);
    expect(ctx.memory.set).not.toHaveBeenCalled();
  });

  it('does not treat unstamped coverage or invalid test evidence as measured', async () => {
    const ctx = context({
      'default:coverage:latest': { line: 80, branch: 70 },
      'quality-assessment:quality-evidence:testsPassing:latest': tests(101),
    });
    const result = await worker.execute(ctx);
    expect(result.metrics.domainMetrics.evidenceStatus).toBe('unmeasured');
    expect(ctx.memory.set).not.toHaveBeenCalled();
  });

  it('stores only measured test and coverage metrics in a versioned baseline', async () => {
    const ctx = context({
      'default:coverage:latest': coverage(78, 65),
      'quality-assessment:quality-evidence:testsPassing:latest': tests(98),
    });
    const result = await worker.execute(ctx);
    expect(result.metrics.domainMetrics.evidenceStatus).toBe('baseline-pending');
    expect(ctx.memory.get).toHaveBeenCalledWith('quality-evidence:testsPassing:latest', {
      namespace: 'quality-assessment',
    });
    expect(ctx.memory.set).toHaveBeenCalledWith('regression:baseline', {
      schemaVersion: 2, measured: true, timestamp: expect.any(String),
      testPassRate: 98, coverage: { line: 78, branch: 65 },
    });
  });

  it('ignores an old fabricated baseline instead of reporting a regression', async () => {
    const ctx = context({
      'default:regression:baseline': {
        timestamp: new Date(), testPassRate: 98.2,
        coverage: { line: 78.5, branch: 65.2 },
        avgTestDuration: 245, failedTests: ['fake'], qualityScore: 82,
      },
      'default:coverage:latest': coverage(50),
    });
    const result = await worker.execute(ctx);
    expect(result.metrics.issuesFound).toBe(0);
    expect(result.metrics.domainMetrics.evidenceStatus).toBe('baseline-pending');
    expect(result.metrics.domainMetrics.branchCoverage).toBe('unmeasured');
  });

  it('compares only metrics measured on both sides', async () => {
    const ctx = context({
      'default:regression:baseline': {
        schemaVersion: 2, measured: true, timestamp: new Date(Date.now() - 60_000).toISOString(),
        testPassRate: 99, coverage: { line: 85, branch: 75 },
      },
      'default:coverage:latest': coverage(78),
      'quality-assessment:quality-evidence:testsPassing:latest': tests(90),
    });
    const result = await worker.execute(ctx);
    expect(result.metrics.itemsAnalyzed).toBe(2);
    expect(result.metrics.issuesFound).toBe(2);
    expect(result.metrics.domainMetrics.evidenceStatus).toBe('compared');
    expect(result.findings.map(f => f.title)).toEqual([
      'Test Pass Rate Regression Detected', 'Line Coverage Regression Detected',
    ]);
    expect(result.findings[0]?.description).toContain('percentage points');
  });

  it('rejects stale test evidence rather than inventing a pass rate', async () => {
    const ctx = context({
      'quality-assessment:quality-evidence:testsPassing:latest': tests(
        98, new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      ),
      'default:coverage:latest': coverage(82),
    });
    const result = await worker.execute(ctx);
    expect(result.metrics.domainMetrics.testPassRate).toBe('unmeasured');
    expect(ctx.memory.set).toHaveBeenCalledWith('regression:baseline',
      expect.not.objectContaining({ testPassRate: expect.any(Number) }));
  });
});
