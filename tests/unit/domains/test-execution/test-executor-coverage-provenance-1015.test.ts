/**
 * Issue #1015.2 — test execution persists coverage only as measured evidence.
 *
 *  - `coverage:latest` and `coverage:file:*` carry the `measured: true` stamp
 *    (#1008) that readers require;
 *  - a run that did not pass (`status !== 'passed'`) persists no coverage and
 *    no coverage quality evidence;
 *  - istanbul's 0/0 (no branches / no functions in the code) is "not
 *    collected" — null — not 100%;
 *  - "line" is line coverage (statementMap start lines, #1012), not statements.
 */
import { describe, it, expect, vi } from 'vitest';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';

type Internals = {
  storeResults(runId: string, result: Record<string, unknown>): Promise<void>;
  extractCoverageFromJson(json: unknown): {
    summary?: { line: number | null; branch: number | null; function: number | null; statement: number | null };
    perFile: Array<{ path: string; line: number | null; branch: number | null; function: number | null; statement: number | null }>;
  };
};

function service() {
  const store = new Map<string, unknown>();
  const memory = {
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    get: vi.fn(async (key: string) => store.get(key)),
  };
  const executor = new TestExecutorService({ memory: memory as never }, { enableLLMAnalysis: false });
  return { store, memory, internals: executor as unknown as Internals };
}

const run = (overrides: Record<string, unknown>) => ({
  runId: 'r1', status: 'passed', total: 2, passed: 2, failed: 0, skipped: 0, duration: 1, failedTests: [],
  coverage: { line: 75, branch: 50, function: 100, statement: 70 },
  fileCoverages: [{ path: '/p/src/a.ts', line: 75, branch: 50, function: 100, statement: 70 }],
  ...overrides,
});

describe('#1015.2 — TestExecutorService.storeResults', () => {
  it('stamps coverage:latest and per-file coverage as measured', async () => {
    const { store, internals } = service();
    await internals.storeResults('r1', run({}));

    expect(store.get('coverage:latest')).toMatchObject({ line: 75, branch: 50, function: 100, statement: 70, files: 1, measured: true, runStatus: 'passed' });
    expect(store.get('coverage:file:/p/src/a.ts')).toMatchObject({ line: 75, measured: true });
    expect(store.get('quality-evidence:coverage:latest')).toMatchObject({ value: 75 });
  });

  it('a runner ERROR persists no coverage and no coverage evidence (the test-run record is kept)', async () => {
    const { store, internals } = service();
    await internals.storeResults('r1', run({ status: 'error' }));

    expect(store.has('test-run:r1')).toBe(true);
    expect(store.has('coverage:latest')).toBe(false);
    expect(store.has('coverage:file:/p/src/a.ts')).toBe(false);
    expect(store.has('quality-evidence:coverage:latest')).toBe(false);
  });

  it('#1027 N4: a run whose tests FAILED still measured coverage — persisted, stamped runStatus:"failed"', async () => {
    const { store, internals } = service();
    await internals.storeResults('r1', run({ status: 'failed', failed: 1, passed: 1 }));

    expect(store.get('coverage:latest')).toMatchObject({ line: 75, measured: true, runStatus: 'failed' });
    expect(store.get('coverage:file:/p/src/a.ts')).toMatchObject({ line: 75, measured: true, runStatus: 'failed' });
    expect(store.get('quality-evidence:coverage:latest')).toMatchObject({ value: 75 });
  });

  it('#1027 NB1: a failing run writes ITS testsPassing next to its coverage, under one runId', async () => {
    const { store, internals } = service();
    await internals.storeResults('r1', run({ status: 'failed', failed: 1, passed: 1 }));

    expect(store.get('quality-evidence:testsPassing:latest')).toMatchObject({ value: 50, runId: 'r1', runStatus: 'failed' });
    expect(store.get('quality-evidence:coverage:latest')).toMatchObject({ value: 75, runId: 'r1', runStatus: 'failed' });
  });

  it('#1027 NB1: testsPassing is recorded even when the run collected no coverage', async () => {
    const { store, internals } = service();
    await internals.storeResults('r2', run({ runId: 'r2', coverage: undefined, fileCoverages: undefined }));
    expect(store.get('quality-evidence:testsPassing:latest')).toMatchObject({ value: 100, runId: 'r2', runStatus: 'passed' });
    expect(store.has('coverage:latest')).toBe(false);
  });

  it('#1027 N7: per-file keys are absolute, whatever form the runner reported', async () => {
    const { store, internals } = service();
    await internals.storeResults('r1', run({ fileCoverages: [{ path: 'src/rel.ts', line: 50, branch: null, function: null, statement: 50 }] }));
    expect(store.has(`coverage:file:${process.cwd()}/src/rel.ts`)).toBe(true);
    expect(store.has('coverage:file:src/rel.ts')).toBe(false);
  });

  it('keeps an uncollected metric null in coverage:latest instead of inventing a figure', async () => {
    const { store, internals } = service();
    await internals.storeResults('r1', run({
      coverage: { line: 75, branch: null, function: null, statement: 70 },
      fileCoverages: [{ path: '/p/src/a.ts', line: 75, branch: null, function: null, statement: 70 }],
    }));
    expect(store.get('coverage:latest')).toMatchObject({ line: 75, branch: null, function: null, measured: true });
  });
});

describe('#1015.2 / #1012 — coverage extracted from runner JSON', () => {
  const at = (line: number) => ({ start: { line, column: 0 }, end: { line, column: 5 } });

  it("treats istanbul's 0/0 branches and functions as not collected (null), not 100%", () => {
    const { internals } = service();
    const cov = internals.extractCoverageFromJson({
      coverageMap: {
        '/p/src/consts.ts': { path: '/p/src/consts.ts', statementMap: { 0: at(1) }, s: { 0: 1 }, branchMap: {}, b: {}, fnMap: {}, f: {} },
      },
    });
    expect(cov.perFile[0]).toMatchObject({ line: 100, branch: null, function: null });
    expect(cov.summary).toMatchObject({ line: 100, branch: null, function: null });
  });

  it('averages a metric only over files that have it', () => {
    const { internals } = service();
    const cov = internals.extractCoverageFromJson({
      coverageMap: {
        '/p/src/consts.ts': { path: '/p/src/consts.ts', statementMap: { 0: at(1) }, s: { 0: 1 }, branchMap: {}, b: {}, fnMap: {}, f: {} },
        '/p/src/a.ts': { path: '/p/src/a.ts', statementMap: { 0: at(1) }, s: { 0: 1 }, branchMap: {}, b: { 0: [1, 0] },
          fnMap: {}, f: { 0: 0 } },
      },
    });
    // Branch locations are counted like istanbul (1 of 2 hit); the
    // branch-free file contributes nothing instead of a phantom 100%.
    expect(cov.summary).toMatchObject({ branch: 50, function: 0 });
  });

  it('reports line coverage per source line, not per statement', () => {
    const { internals } = service();
    const cov = internals.extractCoverageFromJson({
      coverageMap: {
        '/p/src/a.ts': {
          path: '/p/src/a.ts',
          statementMap: { 0: at(1), 1: at(1), 2: at(2), 3: at(2), 4: at(2), 5: at(3) },
          s: { 0: 1, 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 },
          branchMap: {}, b: {}, fnMap: {}, f: {},
        },
      },
    });
    expect(cov.perFile[0].line).toBeCloseTo(66.67, 1);
    expect(cov.perFile[0].statement).toBe(50);
  });

  it('a coverage summary metric with total 0 is null, not its 100 pct', () => {
    const { internals } = service();
    const cov = internals.extractCoverageFromJson({
      coverageSummary: { total: {
        lines: { total: 4, covered: 3, pct: 75 }, statements: { total: 4, covered: 3, pct: 75 },
        branches: { total: 0, covered: 0, pct: 100 }, functions: { total: 0, covered: 0, pct: 100 },
      } },
    });
    expect(cov.summary).toEqual({ line: 75, branch: null, function: null, statement: 75 });
  });
});
