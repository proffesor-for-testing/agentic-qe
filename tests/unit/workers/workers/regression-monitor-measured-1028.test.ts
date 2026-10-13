/**
 * Issue #1028 — the regression-monitor worker builds its baseline only from
 * measured evidence.
 *
 * It used to store a hardcoded snapshot (coverage 78.5/65.2, pass rate 98.2,
 * two invented failing tests, quality score 82) as `regression:baseline`, so
 * every real run was compared against figures nobody measured. Now the
 * snapshot comes from the stamped `coverage:latest` record and the latest
 * testsPassing quality evidence (plus that run's `test-run:<runId>` result),
 * read with the same validators the coverage tracker and the quality gate use.
 * Nothing measured → nothing stored, nothing compared. A baseline without the
 * measured stamp (written by <= 3.15.5) is ignored, never compared against.
 */
import { describe, it, expect, vi } from 'vitest';
import { RegressionMonitorWorker } from '../../../../src/workers/workers/regression-monitor';
import type { WorkerContext } from '../../../../src/workers/interfaces';
import { WorkerManagerImpl } from '../../../../src/workers/worker-manager';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import { writeTestRunEvidence } from '../../../../src/domains/quality-assessment/quality-evidence';

const DEFAULT_NS = 'qe-kernel';

/** A namespaced kv store shaped like the kernel memory the daemon hands workers. */
function namespacedStore() {
  const rows = new Map<string, unknown>();
  const k = (key: string, ns?: string) => `${ns ?? DEFAULT_NS}\u0000${key}`;
  const memory = {
    get: vi.fn(async (key: string, options?: { namespace?: string }) => rows.get(k(key, options?.namespace))),
    set: vi.fn(async (key: string, value: unknown, options?: { namespace?: string }) => {
      rows.set(k(key, options?.namespace), JSON.parse(JSON.stringify(value)));
    }),
    search: vi.fn().mockResolvedValue([]),
  };
  return { memory, read: (key: string, ns?: string) => rows.get(k(key, ns)) };
}

function contextFor(memory: ReturnType<typeof namespacedStore>['memory']): WorkerContext {
  return {
    eventBus: { publish: vi.fn().mockResolvedValue(undefined) },
    memory,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    domains: {
      getDomainAPI: vi.fn().mockReturnValue({}),
      getDomainHealth: vi.fn().mockReturnValue({ status: 'healthy', errors: [] }),
    },
    signal: new AbortController().signal,
  } as unknown as WorkerContext;
}

/** Record one measured test run the way test_execute_parallel does. */
async function measuredRun(
  store: ReturnType<typeof namespacedStore>,
  run: {
    runId: string; passed: number; failed: number; skipped?: number; duration?: number;
    failedTests?: string[];
    /** The test files the run executed, as test-execution records them (#1028 N1). */
    testFiles?: string[];
    coverage?: { line: number; branch: number | null; function?: number | null; statement?: number | null };
  },
): Promise<void> {
  const total = run.passed + run.failed + (run.skipped ?? 0);
  await store.memory.set(`test-run:${run.runId}`, {
    runId: run.runId,
    status: run.failed > 0 ? 'failed' : 'passed',
    total, passed: run.passed, failed: run.failed, skipped: run.skipped ?? 0,
    duration: run.duration ?? total * 10,
    ...(run.testFiles ? { testFiles: run.testFiles } : {}),
    failedTests: (run.failedTests ?? []).map((name, i) => ({
      testId: `t${i}`, testName: name, file: `tests/${name}.test.ts`, error: 'boom', duration: 5,
    })),
  }, { namespace: 'test-execution' });
  await writeTestRunEvidence(store.memory as unknown as MemoryBackend, {
    runId: run.runId, passed: run.passed, failed: run.failed, skipped: run.skipped,
  }, { source: 'test-execution', ...(run.coverage ? { coverage: run.coverage.line } : {}) });
  if (run.coverage) {
    await store.memory.set('coverage:latest', {
      line: run.coverage.line,
      branch: run.coverage.branch,
      function: run.coverage.function ?? null,
      statement: run.coverage.statement ?? null,
      files: 3,
      measured: true,
      runStatus: run.failed > 0 ? 'failed' : 'passed',
      runId: run.runId,
    });
  }
}

/** The exact snapshot <= 3.15.5 stored: invented, unstamped. */
const LEGACY_INVENTED_BASELINE = {
  timestamp: new Date('2026-09-01T00:00:00Z').toISOString(),
  testPassRate: 98.2,
  coverage: { line: 78.5, branch: 65.2 },
  avgTestDuration: 245,
  failedTests: [
    'test-execution/retry-handler.test.ts::should retry failed tests',
    'coordination/workflow.test.ts::should handle concurrent workflows',
  ],
  qualityScore: 82,
};

const regressionFindings = (findings: Array<{ type: string }>) =>
  findings.filter((f) => /-regression$/.test(f.type));

describe('#1028 — regression-monitor baseline from measured evidence only', () => {
  it('nothing measured: stores no baseline, raises no regression findings, reports unmeasured', async () => {
    const store = namespacedStore();
    const result = await new RegressionMonitorWorker().execute(contextFor(store.memory));

    expect(result.success).toBe(true);
    expect(store.memory.set).not.toHaveBeenCalledWith('regression:baseline', expect.anything());
    expect(store.read('regression:baseline')).toBeUndefined();
    expect(regressionFindings(result.findings)).toEqual([]);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'regression-unmeasured', severity: 'info' }));
    expect(result.metrics.domainMetrics).toMatchObject({
      regressionsDetected: 0,
      testPassRate: 'unmeasured',
      lineCoverage: 'unmeasured',
    });
    // None of the old invented figures may surface anywhere.
    expect(JSON.stringify(result)).not.toMatch(/78\.5|65\.2|98\.2|retry-handler|workflow\.test/);
  });

  it('a first measured run is stored as a stamped baseline holding only measured figures', async () => {
    const store = namespacedStore();
    await measuredRun(store, { runId: 'run-1', passed: 10, failed: 0, coverage: { line: 81.25, branch: 70 } });

    const result = await new RegressionMonitorWorker().execute(contextFor(store.memory));

    const baseline = store.read('regression:baseline') as Record<string, any>;
    expect(baseline).toMatchObject({
      measured: true,
      coverage: { line: 81.25, branch: 70, measured: true },
      tests: { passRate: 100, runId: 'run-1', failedTests: [] },
    });
    expect(baseline).not.toHaveProperty('qualityScore');
    expect(regressionFindings(result.findings)).toEqual([]);
    expect(result.metrics.domainMetrics).toMatchObject({ testPassRate: '100%', lineCoverage: '81.25%' });
  });

  it('measured → measured with a drop: reports the coverage and test regressions', async () => {
    const store = namespacedStore();
    const worker = new RegressionMonitorWorker();
    await measuredRun(store, { runId: 'run-1', passed: 10, failed: 0, coverage: { line: 85, branch: 75 } });
    await worker.execute(contextFor(store.memory));

    await measuredRun(store, {
      runId: 'run-2', passed: 8, failed: 2, failedTests: ['adds numbers', 'parses input'],
      coverage: { line: 70, branch: 60 },
    });
    const result = await worker.execute(contextFor(store.memory));

    const types = result.findings.map((f) => `${f.type}:${(f.context as any)?.metric ?? ''}`);
    expect(types).toEqual(expect.arrayContaining([
      'coverage-regression:lineCoverage',
      'coverage-regression:branchCoverage',
      'test-regression:testPassRate',
      'test-regression:newFailures',
    ]));
    const line = result.findings.find((f) => (f.context as any)?.metric === 'lineCoverage')!;
    expect(line.context).toMatchObject({ previousValue: 85, currentValue: 70 });
    const failures = result.findings.find((f) => (f.context as any)?.metric === 'newFailures')!;
    expect((failures.context as any).affectedTests).toEqual(['adds numbers', 'parses input']);
    expect(store.read('regression:baseline')).toMatchObject({ coverage: { line: 70 }, tests: { runId: 'run-2' } });
    const history = store.read('regression:history') as Array<Record<string, unknown>>;
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((h) => h.measured === true)).toBe(true);
  });

  it('measured → an estimate run: no comparison against the estimate, baseline unchanged', async () => {
    const store = namespacedStore();
    const worker = new RegressionMonitorWorker();
    await measuredRun(store, { runId: 'run-1', passed: 10, failed: 0, coverage: { line: 85, branch: 75 } });
    await worker.execute(contextFor(store.memory));
    const before = store.read('regression:baseline');
    expect(before).toMatchObject({ measured: true, coverage: { line: 85, branch: 75 } });

    // A static estimate (no measured stamp) lands in coverage:latest; no new test run.
    await store.memory.set('coverage:latest', { line: 12, branch: 3, function: 5, statement: 12, files: 40 });
    const result = await worker.execute(contextFor(store.memory));

    expect(regressionFindings(result.findings)).toEqual([]);
    // Same measured figures (only the snapshot timestamp may move).
    const after = store.read('regression:baseline') as Record<string, unknown>;
    const { timestamp: _b, ...figuresBefore } = before as Record<string, unknown>;
    const { timestamp: _a, ...figuresAfter } = after;
    expect(figuresAfter).toEqual(figuresBefore);
    expect(JSON.stringify(result.metrics.domainMetrics)).not.toMatch(/12%|3%/);
  });

  it('ignores a legacy unstamped baseline (the <= 3.15.5 invented figures) and replaces it with a measured one', async () => {
    const store = namespacedStore();
    await store.memory.set('regression:baseline', LEGACY_INVENTED_BASELINE);
    // Lower than the invented 78.5 / 98.2 — would have been "regressions" before.
    await measuredRun(store, { runId: 'run-1', passed: 9, failed: 1, failedTests: ['x'], coverage: { line: 50, branch: 40 } });

    const result = await new RegressionMonitorWorker().execute(contextFor(store.memory));

    expect(regressionFindings(result.findings)).toEqual([]);
    expect(result.metrics.domainMetrics).toMatchObject({ baselineStatus: 'legacy-ignored' });
    expect(store.read('regression:baseline')).toMatchObject({ measured: true, coverage: { line: 50 } });
  });

  it('a malformed stamped baseline is ignored and reported as invalid, not legacy (#1028 N2)', async () => {
    const store = namespacedStore();
    await store.memory.set('regression:baseline', { measured: true, schemaVersion: 2, coverage: { line: 'x' }, tests: null });
    await measuredRun(store, { runId: 'run-1', passed: 5, failed: 0, coverage: { line: 10, branch: null } });

    const result = await new RegressionMonitorWorker().execute(contextFor(store.memory));

    expect(regressionFindings(result.findings)).toEqual([]);
    expect(result.metrics.domainMetrics).toMatchObject({ baselineStatus: 'invalid-ignored' });
    expect(store.read('regression:baseline')).toMatchObject({ measured: true, coverage: { line: 10 } });
  });

  it('a legacy baseline with nothing measured is left in place, not compared and not overwritten', async () => {
    const store = namespacedStore();
    await store.memory.set('regression:baseline', LEGACY_INVENTED_BASELINE);
    store.memory.set.mockClear();

    const result = await new RegressionMonitorWorker().execute(contextFor(store.memory));

    expect(regressionFindings(result.findings)).toEqual([]);
    expect(store.memory.set).not.toHaveBeenCalledWith('regression:baseline', expect.anything());
    expect(store.read('regression:baseline')).toEqual(LEGACY_INVENTED_BASELINE);
  });

  it.each([
    ['baseline branch collected, current not', 75, null],
    ['baseline branch not collected, current collected', null, 10],
  ])('%s: branch coverage is not compared', async (_label, before, after) => {
    const store = namespacedStore();
    const worker = new RegressionMonitorWorker();
    await measuredRun(store, { runId: 'run-1', passed: 5, failed: 0, coverage: { line: 80, branch: before } });
    await worker.execute(contextFor(store.memory));
    await measuredRun(store, { runId: 'run-2', passed: 5, failed: 0, coverage: { line: 80, branch: after } });

    const result = await worker.execute(contextFor(store.memory));

    expect(regressionFindings(result.findings)).toEqual([]);
    expect(store.read('regression:baseline')).toMatchObject({ measured: true, coverage: { line: 80, branch: after } });
    if (after === null) expect(result.metrics.domainMetrics).toMatchObject({ branchCoverage: 'n/a' });
  });

  it('stale testsPassing evidence (older than the gate accepts) is not a measurement', async () => {
    const store = namespacedStore();
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await writeTestRunEvidence(store.memory as unknown as MemoryBackend, { runId: 'old', passed: 1, failed: 0 },
      { source: 'test-execution', measuredAt: old });

    const result = await new RegressionMonitorWorker().execute(contextFor(store.memory));

    expect(store.read('regression:baseline')).toBeUndefined();
    expect(result.metrics.domainMetrics).toMatchObject({ testPassRate: 'unmeasured' });
  });

  it('tests measured without coverage: tests are compared, coverage stays unmeasured', async () => {
    const store = namespacedStore();
    const worker = new RegressionMonitorWorker();
    await measuredRun(store, { runId: 'run-1', passed: 10, failed: 0 });
    await worker.execute(contextFor(store.memory));
    await measuredRun(store, { runId: 'run-2', passed: 5, failed: 5, failedTests: ['a', 'b', 'c', 'd', 'e'] });

    const result = await worker.execute(contextFor(store.memory));

    expect(result.findings.some((f) => (f.context as any)?.metric === 'testPassRate')).toBe(true);
    expect(result.findings.some((f) => f.type === 'coverage-regression')).toBe(false);
    expect(store.read('regression:baseline')).toMatchObject({ coverage: null, tests: { passRate: 50 } });
  });

  describe('per-test duration (#1028 N1): compared only between runs of the same test set', () => {
    const FILES_10 = Array.from({ length: 10 }, (_, i) => `tests/t${i}.test.ts`);

    it('the same test set 25% slower is a performance regression', async () => {
      const store = namespacedStore();
      const worker = new RegressionMonitorWorker();
      await measuredRun(store, { runId: 'run-1', passed: 10, failed: 0, duration: 1000, testFiles: FILES_10 });
      await worker.execute(contextFor(store.memory));
      await measuredRun(store, { runId: 'run-2', passed: 10, failed: 0, duration: 1250, testFiles: [...FILES_10].reverse() });

      const result = await worker.execute(contextFor(store.memory));

      const perf = result.findings.find((f) => f.type === 'performance-regression');
      expect(perf?.context).toMatchObject({ metric: 'avgTestDuration', previousValue: 100, currentValue: 125 });
    });

    it('10 tests then 2 of them at the same per-test speed: wall-time overhead is not a regression', async () => {
      const store = namespacedStore();
      const worker = new RegressionMonitorWorker();
      // Same per-test speed (50 ms) plus 500 ms runner start-up in both runs.
      await measuredRun(store, { runId: 'run-1', passed: 10, failed: 0, duration: 1000, testFiles: FILES_10 });
      await worker.execute(contextFor(store.memory));
      await measuredRun(store, { runId: 'run-2', passed: 2, failed: 0, duration: 600, testFiles: FILES_10.slice(0, 2) });

      const result = await worker.execute(contextFor(store.memory));

      expect(result.findings.some((f) => f.type === 'performance-regression')).toBe(false);
    });

    it('same count but different test files: not compared', async () => {
      const store = namespacedStore();
      const worker = new RegressionMonitorWorker();
      await measuredRun(store, { runId: 'run-1', passed: 2, failed: 0, duration: 100, testFiles: ['tests/a.test.ts'] });
      await worker.execute(contextFor(store.memory));
      await measuredRun(store, { runId: 'run-2', passed: 2, failed: 0, duration: 900, testFiles: ['tests/b.test.ts'] });

      const result = await worker.execute(contextFor(store.memory));

      expect(result.findings.some((f) => f.type === 'performance-regression')).toBe(false);
    });

    it('run records without their test files (older records): not compared', async () => {
      const store = namespacedStore();
      const worker = new RegressionMonitorWorker();
      await measuredRun(store, { runId: 'run-1', passed: 10, failed: 0, duration: 1000 });
      await worker.execute(contextFor(store.memory));
      await measuredRun(store, { runId: 'run-2', passed: 10, failed: 0, duration: 3000 });

      const result = await worker.execute(contextFor(store.memory));

      expect(result.findings.some((f) => f.type === 'performance-regression')).toBe(false);
    });
  });

  it('testsPassing without its recorded run result: pass rate compared, failures and duration not', async () => {
    const store = namespacedStore();
    const worker = new RegressionMonitorWorker();
    await writeTestRunEvidence(store.memory as unknown as MemoryBackend, { runId: 'r1', passed: 10, failed: 0 },
      { source: 'aqe test execute' });
    await worker.execute(contextFor(store.memory));
    await writeTestRunEvidence(store.memory as unknown as MemoryBackend, { runId: 'r2', passed: 10, failed: 0 },
      { source: 'aqe test execute' });

    const result = await worker.execute(contextFor(store.memory));

    expect(regressionFindings(result.findings)).toEqual([]);
    expect(store.read('regression:baseline')).toMatchObject({
      tests: { passRate: 100, runId: 'r2', failedTests: null, avgTestDurationMs: null },
    });
    expect(result.metrics.domainMetrics).toMatchObject({ avgTestDuration: 'unmeasured' });
  });

  it('through the daemon worker manager before fleet_init wiring (in-memory worker memory): unmeasured, nothing stored', async () => {
    const manager = new WorkerManagerImpl();
    manager.register(new RegressionMonitorWorker());

    const result = await manager.runNow('regression-monitor');

    expect(result.success).toBe(true);
    expect(result.metrics.domainMetrics).toMatchObject({ baselineStatus: 'none', testPassRate: 'unmeasured' });
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'regression-unmeasured' }));
  });
});
