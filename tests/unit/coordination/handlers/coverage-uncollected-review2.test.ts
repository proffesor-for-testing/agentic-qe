/**
 * #1027 review round 2 — what the analyze-coverage path PERSISTS must agree
 * with what it REPORTS:
 *
 *  - B2: a metric the report never collected (no branch / function /
 *    statement data) is stored as null in coverage:latest, history and per-file
 *    KV — never 0 — so the tracker, the delta and quality readers treat it as
 *    "not collected" (no fake low-branch finding, no fake functionDelta).
 *  - N7: lcov / Cobertura carry no statement data: statement is null, not a copy
 *    of line; per-file KV uses one key form (absolute paths).
 *  - N4: coverage from a run whose tests failed is still a measurement: it is
 *    persisted, stamped runStatus:'failed'; testsPassing carries the failure.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createTaskExecutor } from '../../../../src/coordination/task-executor';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator';
import '../../../../src/domains/coverage-analysis';
import { runJsCoverage, type JsCoverageRun } from '../../../../src/coordination/handlers/coverage-runner';
import { CoverageTrackerWorker } from '../../../../src/workers/workers/coverage-tracker';
import { createCoverageAnalyzerService } from '../../../../src/domains/coverage-analysis/services/coverage-analyzer';

// #1126: the handlers read only targets inside the project root, and these
// fixtures live in the OS temp dir.
beforeEach(() => { vi.stubEnv('AQE_PROJECT_ROOT', fs.realpathSync(os.tmpdir())); });
afterEach(() => { vi.unstubAllEnvs(); });

vi.mock('../../../../src/coordination/handlers/coverage-runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/coordination/handlers/coverage-runner')>();
  return { ...actual, runJsCoverage: vi.fn(actual.runJsCoverage) };
});

function createKernel() {
  const store = new Map<string, unknown>();
  const key = (k: string, opts?: { namespace?: string }) => (opts?.namespace ? `${opts.namespace}::${k}` : k);
  const memory = {
    initialize: vi.fn(async () => {}), dispose: vi.fn(async () => {}),
    set: vi.fn(async (k: string, v: unknown, opts?: { namespace?: string }) => { store.set(key(k, opts), v); }),
    get: vi.fn(async (k: string, opts?: { namespace?: string }) => store.get(key(k, opts)) ?? null),
    delete: vi.fn(async (k: string, opts?: { namespace?: string }) => { store.delete(key(k, opts)); }),
    has: vi.fn(async (k: string, opts?: { namespace?: string }) => store.has(key(k, opts))),
    list: vi.fn(async () => [...store.keys()]), search: vi.fn(async () => []),
    storeVector: vi.fn(async () => {}), vectorSearch: vi.fn(async () => []), query: vi.fn(async () => []),
  };
  return {
    store, memory,
    eventBus: {
      publish: vi.fn(async () => {}), subscribe: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      subscribeToChannel: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      getHistory: vi.fn(async () => []), dispose: vi.fn(async () => {}),
    },
    agentCoordinator: { spawn: vi.fn(), list: vi.fn(async () => []), dispose: vi.fn(async () => {}) },
    initialize: vi.fn(async () => {}), dispose: vi.fn(async () => {}),
  };
}
type Kernel = ReturnType<typeof createKernel>;

async function analyze(kernel: Kernel, target: string, detectGaps = false): Promise<Record<string, unknown>> {
  const executor = createTaskExecutor(kernel as never, {
    saveResults: false, resultsDir: path.dirname(target), defaultLanguage: 'typescript', defaultFramework: 'vitest',
  });
  const result = await executor.execute({
    id: `task-r2-${path.basename(target)}`, type: 'analyze-coverage', priority: 'p1', targetDomains: [],
    payload: { target, detectGaps }, timeout: 60000, createdAt: new Date(),
  } as unknown as QueenTask);
  expect(result.success, String(result.error)).toBe(true);
  return result.data as Record<string, unknown>;
}

const fileKeys = (k: Kernel) => [...k.store.keys()].filter(key => key.startsWith('coverage:file:'));

describe('#1027 review 2 — uncollected metrics are persisted as null', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-r2-')));
    fs.mkdirSync(path.join(dir, '.git'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.mkdirSync(path.join(dir, 'coverage'));
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"r2"}');
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1;\n'.repeat(10));
  });

  afterEach(() => {
    vi.mocked(runJsCoverage).mockReset();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A line-only lcov at 90% (no branch, function or statement data). */
  function lineOnlyLcov(): string {
    const file = path.join(dir, 'coverage', 'lcov.info');
    const da = Array.from({ length: 10 }, (_, i) => `DA:${i + 1},${i < 9 ? 1 : 0}`).join('\n');
    fs.writeFileSync(file, `TN:\nSF:src/a.ts\n${da}\nLF:10\nLH:9\nend_of_record\n`);
    return file;
  }

  it('B2/N7: a line-only lcov reports and stores branch/function/statement as null', async () => {
    const kernel = createKernel();
    const data = await analyze(kernel, lineOnlyLcov());

    expect(data).toMatchObject({ lineCoverage: 90, branchCoverage: null, functionCoverage: null, statementCoverage: null });
    expect(kernel.store.get('coverage:latest')).toMatchObject({
      line: 90, branch: null, function: null, statement: null, measured: true,
    });
    const history = [...kernel.store.entries()].find(([k]) => k.includes('coverage:history:'));
    expect(history?.[1]).toMatchObject({ line: 90, branch: null, function: null, statement: null, measured: true });
  });

  it('N7: per-file KV uses ONE key form — the absolute path — whatever the report wrote', async () => {
    const kernel = createKernel();
    await analyze(kernel, lineOnlyLcov(), true);   // lcov: SF:src/a.ts (relative); per-file KV needs detectGaps
    expect(fileKeys(kernel)).toEqual([`coverage:file:${path.join(dir, 'src', 'a.ts')}`]);
  });

  it('B2: the tracker raises no low-branch/function finding from a branch-less measurement', async () => {
    const kernel = createKernel();
    await analyze(kernel, lineOnlyLcov());
    const ctx = {
      eventBus: { publish: vi.fn() }, memory: { get: kernel.memory.get, set: vi.fn(), search: vi.fn(async () => []) },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      domains: { getDomainAPI: vi.fn(), getDomainHealth: vi.fn() }, signal: new AbortController().signal,
    };
    const result = await new CoverageTrackerWorker().execute(ctx as never);
    expect(result.findings.map(f => f.type)).not.toContain('low-branch-coverage');
    expect(result.findings.map(f => f.type)).not.toContain('low-function-coverage');
    expect(result.metrics.domainMetrics).toMatchObject({ lineCoverage: '90%', branchCoverage: 'n/a', statementCoverage: 'n/a' });
  });

  it('N4: coverage from a run whose tests failed is persisted, stamped runStatus:"failed"', async () => {
    const report = path.join(os.tmpdir(), `aqe-r2-report-${process.pid}.json`);
    const a = path.join(dir, 'src', 'a.ts');
    const statementMap = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, { start: { line: i + 1 }, end: { line: i + 1 } }]));
    const s = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, i < 6 ? 1 : 0]));
    fs.writeFileSync(report, JSON.stringify({ [a]: { path: a, statementMap, s, branchMap: {}, b: {}, fnMap: {}, f: {} } }));
    const { loadCoverageReportFile } = await import('../../../../src/coordination/handlers/coverage-target');
    const data60 = await loadCoverageReportFile(report);
    fs.rmSync(report);
    fs.rmSync(path.join(dir, 'coverage'), { recursive: true });
    const base: JsCoverageRun = {
      runner: 'vitest', missing: false, exitCode: 1, exitedCleanly: false, timedOut: false, timeoutMs: 1,
      data: data60, numTotalTests: 3, stderrTail: '',
    };

    // NB1: the run's own testsPassing is written next to its coverage, under one runId.
    vi.mocked(runJsCoverage).mockResolvedValueOnce({ ...base, numPassedTests: 2, numFailedTests: 1, numFailedTestSuites: 1 });
    const kernel = createKernel();
    const data = await analyze(kernel, dir);

    expect(data).toMatchObject({ measured: true, lineCoverage: 60, runStatus: 'failed' });
    expect(kernel.store.get('coverage:latest')).toMatchObject({ line: 60, measured: true, runStatus: 'failed' });
    const ev = (m: string) => kernel.store.get(`quality-assessment::quality-evidence:${m}:latest`) as Record<string, unknown>;
    expect(ev('coverage')).toMatchObject({ value: 60, runStatus: 'failed' });
    expect(ev('testsPassing')).toMatchObject({ runStatus: 'failed', runId: ev('coverage').runId });
    expect(ev('testsPassing').value).toBeCloseTo(66.67, 1);

    // NB2: a non-zero exit with NO failing test (e.g. a coverage-threshold
    // failure) is not a failing suite.
    vi.mocked(runJsCoverage).mockResolvedValueOnce({ ...base, numPassedTests: 3, numFailedTests: 0, numFailedTestSuites: 0 });
    const kernel2 = createKernel();
    expect(await analyze(kernel2, dir)).toMatchObject({ measured: true, runStatus: 'passed' });
    expect(kernel2.store.get('quality-assessment::quality-evidence:testsPassing:latest')).toMatchObject({ value: 100, runStatus: 'passed' });
  });
});

describe('#1027 review 2 — delta against a baseline with an uncollected metric', () => {
  it('a metric missing on either side has delta 0, never a fake swing', async () => {
    const store = new Map<string, unknown>([['coverage:latest',
      { line: 70, branch: 50, function: 60, statement: 70, files: 1, measured: true }]]);
    const memory = {
      get: vi.fn(async (k: string) => store.get(k) ?? null), set: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
      delete: vi.fn(), storeVector: vi.fn(), vectorSearch: vi.fn(async () => []), list: vi.fn(async () => []),
    };
    const service = createCoverageAnalyzerService(memory as never);
    const result = await service.analyze({
      measured: true,
      coverageData: {
        files: [{ path: '/p/a.ts', lines: { covered: 8, total: 10 }, branches: { covered: 0, total: 0 },
          functions: { covered: 0, total: 0 }, statements: { covered: 8, total: 10 }, uncoveredLines: [9, 10], uncoveredBranches: [] }],
        summary: { line: 80, branch: 0, function: 0, statement: 80, files: 1 },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.delta).toMatchObject({ line: 10, branch: 0, function: 0, statement: 10, trend: 'improving' });
    expect(store.get('coverage:latest')).toMatchObject({ line: 80, branch: null, function: null, measured: true });
  });
});
