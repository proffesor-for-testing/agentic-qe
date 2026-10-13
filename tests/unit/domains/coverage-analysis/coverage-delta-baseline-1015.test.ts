/**
 * Issue #1015.1 — `calculateDelta` trusts only a measured baseline.
 *
 * Upgraded DBs still hold legacy unstamped records in `coverage:latest`
 * (e.g. the `{"files":0}` left by the old bridge echo fixed in #1013). Before,
 * the delta against such a record was NaN and reported as "stable", and
 * `storeCoverageSnapshot` rotated the junk into `coverage:previous`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCoverageAnalyzerService } from '../../../../src/domains/coverage-analysis/services/coverage-analyzer';
import type { CoverageData } from '../../../../src/domains/coverage-analysis/interfaces';

function memoryWith(latest: unknown) {
  const store = new Map<string, unknown>([['coverage:latest', latest]]);
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    delete: vi.fn(), storeVector: vi.fn(), vectorSearch: vi.fn().mockResolvedValue([]), list: vi.fn().mockResolvedValue([]),
  };
}

const data: CoverageData = {
  files: [{
    path: 'src/a.ts',
    lines: { covered: 80, total: 100 }, branches: { covered: 15, total: 20 },
    functions: { covered: 9, total: 10 }, statements: { covered: 85, total: 100 },
    uncoveredLines: [], uncoveredBranches: [],
  }],
  summary: { line: 80, branch: 75, function: 90, statement: 85, files: 1 },
};

describe('#1015.1 — coverage delta baselines', () => {
  let memory: ReturnType<typeof memoryWith>;

  beforeEach(() => { memory = memoryWith(undefined); });

  it.each([
    ['the legacy {"files":0} echo', { files: 0 }],
    ['an unstamped legacy summary', { line: 70, branch: 65, function: 80, statement: 75, files: 1 }],
    ['a record with NaN figures', { line: Number.NaN, branch: 1, function: 1, statement: 1, files: 1, measured: true }],
    ['an estimate stamped measured:false', { line: 70, branch: 65, function: 80, statement: 75, files: 1, measured: false }],
  ])('ignores %s: no delta, and it is not rotated into coverage:previous', async (_label, legacy) => {
    memory = memoryWith(legacy);
    const service = createCoverageAnalyzerService(memory as never);

    const result = await service.analyze({ coverageData: data, measured: true });

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.delta).toBeUndefined();
    expect(memory.set).not.toHaveBeenCalledWith('coverage:previous', expect.anything(), expect.anything());
    expect(memory.store.get('coverage:latest')).toMatchObject({ line: 80, measured: true });
  });

  it('computes a finite delta against a measured baseline and rotates it', async () => {
    const baseline = { line: 70, branch: 65, function: 80, statement: 75, files: 1, measured: true };
    memory = memoryWith(baseline);
    const service = createCoverageAnalyzerService(memory as never);

    const result = await service.analyze({ coverageData: data, measured: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.delta).toMatchObject({ line: 10, branch: 10, function: 10, statement: 10, trend: 'improving' });
    }
    expect(memory.store.get('coverage:previous')).toEqual(baseline);
  });

  it('stamps the coverage history snapshot as measured', async () => {
    const service = createCoverageAnalyzerService(memory as never);
    await service.analyze({ coverageData: data, measured: true });
    const history = [...memory.store.entries()].find(([k]) => k.startsWith('coverage:history:'));
    expect(history?.[1]).toMatchObject({ line: 80, measured: true });
  });
});
