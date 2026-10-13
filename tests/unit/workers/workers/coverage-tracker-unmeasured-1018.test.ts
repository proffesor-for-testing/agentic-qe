/**
 * Issue #1018 — the coverage-tracker worker never writes a fake 0% record.
 *
 * With no measured `coverage:latest` it wrote `coverage:current` = all zeros,
 * raised "below threshold" findings about a figure nobody measured, and a later
 * real measurement then compared against those zeros. Now: no measurement →
 * nothing written to `coverage:current`, no threshold or trend findings, and
 * the metrics say "unmeasured". Legacy records (unstamped `coverage:latest`,
 * an all-zero `coverage:current` from older versions) are not measurements.
 */
import { describe, it, expect, vi } from 'vitest';
import { CoverageTrackerWorker } from '../../../../src/workers/workers/coverage-tracker';
import type { WorkerContext } from '../../../../src/workers/interfaces';

function context(records: Record<string, unknown>): WorkerContext {
  const store = new Map(Object.entries(records));
  return {
    eventBus: { publish: vi.fn().mockResolvedValue(undefined) },
    memory: {
      get: vi.fn(async (key: string) => store.get(key)),
      set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
      search: vi.fn().mockResolvedValue([]),
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    domains: {
      getDomainAPI: vi.fn().mockReturnValue({}),
      getDomainHealth: vi.fn().mockReturnValue({ status: 'healthy', errors: [] }),
    },
    signal: new AbortController().signal,
  } as unknown as WorkerContext;
}

const measured = { line: 78.5, branch: 65.2, function: 82.1, statement: 79.3, files: 5, measured: true };

describe('#1018 — coverage-tracker with no measured coverage', () => {
  it.each([
    ['no coverage:latest at all', {}],
    ['a legacy unstamped coverage:latest', { 'coverage:latest': { line: 0, branch: 0, function: 0, statement: 0, files: 0 } }],
    ['the {"files":0} bridge echo', { 'coverage:latest': { files: 0 } }],
    ['an estimate stamped measured:false', { 'coverage:latest': { ...measured, measured: false } }],
  ])('%s: writes no coverage:current and no threshold findings', async (_label, records) => {
    const ctx = context(records);
    const result = await new CoverageTrackerWorker().execute(ctx);

    expect(result.success).toBe(true);
    expect(ctx.memory.set).not.toHaveBeenCalledWith('coverage:current', expect.anything());
    expect(result.findings.some(f => /coverage/i.test(f.type) && /below|regression/i.test(f.title))).toBe(false);
    expect(result.metrics.domainMetrics).toMatchObject({ coverageMeasured: 'false', lineCoverage: 'unmeasured' });
    expect(JSON.stringify(result.metrics.domainMetrics)).not.toMatch(/(^|")0%/);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'coverage-unmeasured', severity: 'info' }));
  });

  it('a measured coverage:latest is tracked and stored stamped', async () => {
    const ctx = context({ 'coverage:latest': measured });
    const result = await new CoverageTrackerWorker().execute(ctx);

    expect(ctx.memory.set).toHaveBeenCalledWith('coverage:current', expect.objectContaining({ line: 78.5, measured: true }));
    expect(result.metrics.domainMetrics).toMatchObject({ lineCoverage: '78.5%', coverageMeasured: 'true' });
  });

  it('an old all-zero coverage:current is not a baseline: no false regression or improvement', async () => {
    const ctx = context({
      'coverage:latest': measured,
      'coverage:current': { line: 0, branch: 0, function: 0, statement: 0, timestamp: new Date() },
    });
    const result = await new CoverageTrackerWorker().execute(ctx);

    expect(result.metrics.trend).toBe('stable');
  });

  it('an uncollected branch metric is n/a, not a "below threshold" finding', async () => {
    const ctx = context({ 'coverage:latest': { ...measured, branch: null } });
    const result = await new CoverageTrackerWorker().execute(ctx);

    expect(result.findings.some(f => f.type === 'low-branch-coverage')).toBe(false);
    expect(result.metrics.domainMetrics).toMatchObject({ branchCoverage: 'n/a' });
  });
});
