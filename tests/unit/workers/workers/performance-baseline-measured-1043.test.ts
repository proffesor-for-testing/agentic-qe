/**
 * Issue #1043 — the performance-baseline worker tracks only measured timings.
 *
 * It used to return hardcoded figures (45 s suite, 245 ms per test, 12 s
 * compile, 2500 KB bundle, 512 MB, 65 % CPU) and EMA-blend them into a
 * hardcoded default baseline (200·0.9 + 245·0.1 = 204.5 …), storing the
 * result as `performance:baseline` on every tick of every project. It now
 * reads the run behind the latest usable testsPassing evidence
 * (`test-run:<runId>` in `test-execution`), as the regression monitor does
 * (#1028). Nothing measured → nothing written; build and resource figures
 * have no measured source and are reported unmeasured. A baseline without the
 * measured stamp (written by <= 3.15.6) is ignored and replaced.
 */
import { describe, it, expect } from 'vitest';
import { PerformanceBaselineWorker } from '../../../../src/workers/workers/performance-baseline';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import { writeTestRunEvidence } from '../../../../src/domains/quality-assessment/quality-evidence';
import { namespacedStore, contextFor, type NamespacedStore } from './measured-worker-store';

/** The exact baseline <= 3.15.6 stored after one tick: invented and unstamped. */
const LEGACY_INVENTED_BASELINE = {
  testExecution: { avgDurationMs: 204.5, p95DurationMs: 710, threshold: 1.3 },
  build: { avgCompileMs: 10200, avgBundleSizeKb: 2410, threshold: 1.2 },
  resources: { avgMemoryMb: 456.2, avgCpuPercent: 60.5, threshold: 1.25 },
};

const INVENTED = /204\.5|10200|2410|456\.2|60\.5|workflow-orchestrator|45000|12000|2500KB|512MB/;

async function measuredRun(store: NamespacedStore, run: {
  runId: string; passed: number; failed?: number; duration: number; testFiles?: string[];
}): Promise<void> {
  const failed = run.failed ?? 0;
  const total = run.passed + failed;
  await store.memory.set(`test-run:${run.runId}`, {
    runId: run.runId, status: failed > 0 ? 'failed' : 'passed',
    total, passed: run.passed, failed, skipped: 0, duration: run.duration,
    ...(run.testFiles ? { testFiles: run.testFiles } : {}),
    failedTests: [],
  }, { namespace: 'test-execution' });
  await writeTestRunEvidence(store.memory as unknown as MemoryBackend, {
    runId: run.runId, passed: run.passed, failed,
  }, { source: 'test-execution' });
}

const FILES = ['tests/a.test.ts', 'tests/b.test.ts'];
const anomalyFindings = (findings: Array<{ type: string }>) => findings.filter((f) => f.type.startsWith('performance-anomaly'));

describe('#1043 — performance-baseline worker uses measured timings only', () => {
  it('nothing measured: writes nothing, raises no anomaly, reports unmeasured', async () => {
    const store = namespacedStore();
    const result = await new PerformanceBaselineWorker().execute(contextFor(store.memory));

    expect(result.success).toBe(true);
    expect(store.memory.set).not.toHaveBeenCalled();
    expect(anomalyFindings(result.findings)).toEqual([]);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'performance-unmeasured', severity: 'info' }));
    expect(result.metrics.itemsAnalyzed).toBe(0);
    expect(result.metrics.domainMetrics).toMatchObject({
      avgTestDuration: 'unmeasured',
      compileDuration: 'unmeasured',
      bundleSize: 'unmeasured',
      peakMemory: 'unmeasured',
    });
    expect(JSON.stringify(result)).not.toMatch(INVENTED);
  });

  it('a first measured run is stored as a stamped baseline holding only measured figures', async () => {
    const store = namespacedStore();
    await measuredRun(store, { runId: 'run-1', passed: 20, duration: 4000, testFiles: FILES });

    const result = await new PerformanceBaselineWorker().execute(contextFor(store.memory));

    const baseline = store.read('performance:baseline') as Record<string, any>;
    expect(baseline).toMatchObject({
      measured: true,
      schemaVersion: 1,
      testExecution: { avgTestDurationMs: 200, totalDurationMs: 4000, samples: 1, lastRunId: 'run-1' },
    });
    expect(baseline).not.toHaveProperty('build');
    expect(baseline).not.toHaveProperty('resources');
    expect(anomalyFindings(result.findings)).toEqual([]);
    expect(result.metrics.domainMetrics).toMatchObject({
      avgTestDuration: '200ms',
      totalTestDuration: '4000ms',
      compileDuration: 'unmeasured',
      peakMemory: 'unmeasured',
    });
    const history = store.read('performance:history') as Array<Record<string, unknown>>;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ measured: true, runId: 'run-1', avgTestDurationMs: 200 });
  });

  it('a slower measured run of the same test set is an anomaly against the measured baseline', async () => {
    const store = namespacedStore();
    await measuredRun(store, { runId: 'run-1', passed: 20, duration: 4000, testFiles: FILES });
    await new PerformanceBaselineWorker().execute(contextFor(store.memory));
    await measuredRun(store, { runId: 'run-2', passed: 20, duration: 8000, testFiles: FILES });

    const result = await new PerformanceBaselineWorker().execute(contextFor(store.memory));

    expect(anomalyFindings(result.findings)).toContainEqual(expect.objectContaining({
      type: 'performance-anomaly-test',
      context: expect.objectContaining({ currentValue: 400, baselineValue: 200 }),
    }));
    expect(store.read('performance:baseline')).toMatchObject({
      measured: true, testExecution: { samples: 2, lastRunId: 'run-2', avgTestDurationMs: 220 },
    });
  });

  it('the same run is not blended twice: a re-tick neither compares nor rewrites the baseline', async () => {
    const store = namespacedStore();
    await measuredRun(store, { runId: 'run-1', passed: 20, duration: 4000, testFiles: FILES });
    const worker = new PerformanceBaselineWorker();
    await worker.execute(contextFor(store.memory));
    store.memory.set.mockClear();

    const result = await worker.execute(contextFor(store.memory));

    expect(store.memory.set).not.toHaveBeenCalled();
    expect(anomalyFindings(result.findings)).toEqual([]);
    expect(store.read('performance:baseline')).toMatchObject({ testExecution: { samples: 1, avgTestDurationMs: 200 } });
  });

  it('a run of a different test set is not compared; it starts a new baseline', async () => {
    const store = namespacedStore();
    await measuredRun(store, { runId: 'run-1', passed: 20, duration: 4000, testFiles: FILES });
    await new PerformanceBaselineWorker().execute(contextFor(store.memory));
    await measuredRun(store, { runId: 'run-2', passed: 2, duration: 4000, testFiles: ['tests/a.test.ts'] });

    const result = await new PerformanceBaselineWorker().execute(contextFor(store.memory));

    expect(anomalyFindings(result.findings)).toEqual([]);
    expect(store.read('performance:baseline')).toMatchObject({
      testExecution: { samples: 1, lastRunId: 'run-2', avgTestDurationMs: 2000 },
    });
  });

  it('a legacy unstamped baseline is ignored (left in place) and replaced by the next measured run', async () => {
    const store = namespacedStore();
    await store.memory.set('performance:baseline', LEGACY_INVENTED_BASELINE);
    store.memory.set.mockClear();

    const unmeasured = await new PerformanceBaselineWorker().execute(contextFor(store.memory));
    expect(store.memory.set).not.toHaveBeenCalled();
    expect(store.read('performance:baseline')).toEqual(LEGACY_INVENTED_BASELINE);
    expect(unmeasured.metrics.domainMetrics).toMatchObject({ baselineStatus: 'legacy-ignored' });
    expect(JSON.stringify(unmeasured)).not.toMatch(INVENTED);

    await measuredRun(store, { runId: 'run-1', passed: 10, duration: 5000, testFiles: FILES });
    const measured = await new PerformanceBaselineWorker().execute(contextFor(store.memory));
    // Never compared against the invented 204.5 ms.
    expect(anomalyFindings(measured.findings)).toEqual([]);
    expect(store.read('performance:baseline')).toMatchObject({
      measured: true, testExecution: { avgTestDurationMs: 500, samples: 1 },
    });
  });

  it('testsPassing evidence whose run result was not recorded is not a timing measurement', async () => {
    const store = namespacedStore();
    await writeTestRunEvidence(store.memory as unknown as MemoryBackend,
      { runId: 'run-x', passed: 5, failed: 0 }, { source: 'test-execution' });

    const result = await new PerformanceBaselineWorker().execute(contextFor(store.memory));

    expect(store.memory.set).not.toHaveBeenCalledWith('performance:baseline', expect.anything());
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'performance-unmeasured' }));
  });
});
