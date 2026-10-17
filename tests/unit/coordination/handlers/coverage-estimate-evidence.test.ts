/**
 * Regression tests for issue #1008 — `coverage_analyze_sublinear` stored a
 * static ESTIMATE as measured coverage evidence.
 *
 * With no instrumentation available the handler falls back to a labelled
 * estimate. That estimate used to be written to `coverage:latest` and to the
 * canonical `quality-evidence:coverage:latest` record, so `quality_assess`
 * (and its runGate) treated a guess as a measurement.
 *
 * These run the REAL analyze-coverage handler and the REAL
 * CoverageAnalyzerService against an in-memory store, then check what a
 * quality gate would load.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { createTaskExecutor } from '../../../../src/coordination/task-executor';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator';
import {
  QUALITY_EVIDENCE_NAMESPACE,
  writeQualityEvidence,
  loadQualityEvidence,
} from '../../../../src/domains/quality-assessment/quality-evidence';

// Side-effect import: registers the coverage-analysis domain service factory.
import '../../../../src/domains/coverage-analysis';
import { runJsCoverage, type JsCoverageRun } from '../../../../src/coordination/handlers/coverage-runner';

// The runner is real unless a test scripts its outcome (not installed, timeout, crash, ...).
vi.mock('../../../../src/coordination/handlers/coverage-runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/coordination/handlers/coverage-runner')>();
  return { ...actual, runJsCoverage: vi.fn(actual.runJsCoverage) };
});

function createKernel() {
  const store = new Map<string, unknown>();
  const key = (k: string, opts?: { namespace?: string }) => (opts?.namespace ? `${opts.namespace}::${k}` : k);
  const memory = {
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
    set: vi.fn(async (k: string, v: unknown, opts?: { namespace?: string }) => { store.set(key(k, opts), v); }),
    get: vi.fn(async (k: string, opts?: { namespace?: string }) => store.get(key(k, opts)) ?? null),
    delete: vi.fn(async (k: string, opts?: { namespace?: string }) => { store.delete(key(k, opts)); }),
    has: vi.fn(async (k: string, opts?: { namespace?: string }) => store.has(key(k, opts))),
    list: vi.fn(async () => [...store.keys()]),
    search: vi.fn(async () => []),
    storeVector: vi.fn(async () => {}),
    vectorSearch: vi.fn(async () => []),
    query: vi.fn(async () => []),
  };
  return {
    store,
    memory,
    eventBus: {
      publish: vi.fn(async () => {}),
      subscribe: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      subscribeToChannel: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      getHistory: vi.fn(async () => []),
      dispose: vi.fn(async () => {}),
    },
    agentCoordinator: { spawn: vi.fn(), list: vi.fn(async () => []), dispose: vi.fn(async () => {}) },
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
}

type Kernel = ReturnType<typeof createKernel>;

async function analyze(kernel: Kernel, target: string): Promise<Record<string, unknown>> {
  const executor = createTaskExecutor(kernel as never, {
    saveResults: false, resultsDir: target,
    defaultLanguage: 'typescript', defaultFramework: 'vitest',
  });
  const result = await executor.execute({
    id: `task-1008-${path.basename(target)}`, type: 'analyze-coverage', priority: 'p1', targetDomains: [],
    payload: { target, detectGaps: true }, timeout: 60000, createdAt: new Date(),
  } as unknown as QueenTask);
  expect(result.success).toBe(true);
  return result.data as Record<string, unknown>;
}

/** Every other canonical metric is fresh and passing; only coverage is in question. */
async function seedAllButCoverage(kernel: Kernel): Promise<void> {
  await writeQualityEvidence(kernel.memory as never, {
    testsPassing: 100, criticalBugs: 0, codeSmells: 0,
    securityVulnerabilities: 0, technicalDebt: 0, duplications: 0,
  }, { measuredAt: new Date().toISOString(), source: 'regression-fixture' });
}

const coverageEvidenceKey = `${QUALITY_EVIDENCE_NAMESPACE}::quality-evidence:coverage:latest`;

describe('#1008 — a static estimate is never persisted as coverage evidence', () => {
  let dir: string;
  const originalNoExec = process.env.AQE_COVERAGE_NO_EXEC;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1008-'));
    fs.mkdirSync(path.join(dir, '.git'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture-1008', version: '1.0.0' }));
    fs.writeFileSync(
      path.join(dir, 'src', 'math.ts'),
      'export function add(a: number, b: number) {\n  if (a < 0) { return b; }\n  return a + b;\n}\n',
    );
  });

  afterEach(() => {
    if (originalNoExec === undefined) delete process.env.AQE_COVERAGE_NO_EXEC;
    else process.env.AQE_COVERAGE_NO_EXEC = originalNoExec;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('estimate run: returns a labelled estimate but writes neither coverage:latest nor quality evidence', async () => {
    // No report on disk and test execution disabled → the static-estimate fallback.
    process.env.AQE_COVERAGE_NO_EXEC = '1';
    const kernel = createKernel();
    await seedAllButCoverage(kernel);

    const data = await analyze(kernel, dir);

    // The caller still gets the estimate, clearly labelled.
    expect(data.estimated).toBe(true);
    expect(data.measured).toBe(false);
    expect(data.coverageMethod).toBe('static-estimation');
    expect(typeof data.lineCoverage).toBe('number');

    // ...but nothing a quality reader consults was written.
    expect(kernel.store.has('coverage:latest')).toBe(false);
    expect(kernel.store.has('coverage:previous')).toBe(false);
    expect(kernel.store.has(coverageEvidenceKey)).toBe(false);
    expect([...kernel.store.keys()].filter(k => k.startsWith('coverage:file:'))).toEqual([]);

    // So a quality gate still reports coverage as unmeasured.
    await expect(loadQualityEvidence(kernel.memory as never))
      .rejects.toThrow('No measured quality evidence found for coverage.');
  }, 60000);

  it('estimate run does not overwrite an earlier measured coverage:latest', async () => {
    process.env.AQE_COVERAGE_NO_EXEC = '1';
    const kernel = createKernel();
    const measured = { line: 42, branch: 40, function: 50, statement: 42, files: 1 };
    kernel.store.set('coverage:latest', measured);

    const data = await analyze(kernel, dir);

    expect(data.estimated).toBe(true);
    expect(data.delta).toBeUndefined();
    expect(kernel.store.get('coverage:latest')).toEqual(measured);
  }, 60000);

  it('lcov target: measured → coverage:latest and quality evidence are written', async () => {
    const lcov = path.join(dir, 'coverage', 'lcov.info');
    fs.mkdirSync(path.dirname(lcov));
    fs.writeFileSync(lcov, [
      'TN:', `SF:${path.join(dir, 'src', 'math.ts')}`,
      'DA:1,1', 'DA:2,1', 'DA:3,0', 'DA:4,1', 'LF:4', 'LH:3', 'end_of_record', '',
    ].join('\n'));
    const kernel = createKernel();
    await seedAllButCoverage(kernel);

    const data = await analyze(kernel, lcov);

    expect(data.measured).toBe(true);
    expect(data.estimated).toBe(false);
    expect(data.coverageMethod).toBe('instrumented-report');
    expect(kernel.store.get('coverage:latest')).toMatchObject({ line: 75 });
    expect(kernel.store.get(coverageEvidenceKey)).toMatchObject({
      metric: 'coverage', value: 75, source: 'coverage-analysis',
    });
    await expect(loadQualityEvidence(kernel.memory as never)).resolves.toMatchObject({ coverage: 75 });
  }, 60000);
});

describe('#1008 — every non-measured outcome leaves coverage evidence untouched', () => {
  let dir: string;
  const originalNoExec = process.env.AQE_COVERAGE_NO_EXEC;
  const run = (over: Partial<JsCoverageRun>): JsCoverageRun => ({
    runner: 'vitest', missing: false, exitCode: 1, exitedCleanly: false, timedOut: false,
    timeoutMs: 120000, data: null, numTotalTests: null, stderrTail: '', ...over,
  });
  const measuredFile = (file: string) => ({
    path: file,
    lines: { covered: 3, total: 4 }, branches: { covered: 0, total: 0 },
    functions: { covered: 1, total: 1 }, statements: { covered: 3, total: 4 },
    uncoveredLines: [3], uncoveredBranches: [],
  });

  beforeEach(() => {
    delete process.env.AQE_COVERAGE_NO_EXEC;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1008-outcomes-'));
    fs.mkdirSync(path.join(dir, '.git'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture-1008', version: '1.0.0' }));
    fs.writeFileSync(path.join(dir, 'src', 'math.ts'), 'export function add(a: number, b: number) {\n  return a + b;\n}\n');
  });

  afterEach(() => {
    vi.mocked(runJsCoverage).mockReset();
    if (originalNoExec === undefined) delete process.env.AQE_COVERAGE_NO_EXEC;
    else process.env.AQE_COVERAGE_NO_EXEC = originalNoExec;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function expectNothingPersisted(kernel: Kernel): Promise<void> {
    expect(kernel.store.has('coverage:latest')).toBe(false);
    expect(kernel.store.has(coverageEvidenceKey)).toBe(false);
    await expect(loadQualityEvidence(kernel.memory as never))
      .rejects.toThrow('No measured quality evidence found for coverage.');
  }

  it.each([
    ['runner not installed (nothing ran)', run({ missing: true, exitCode: null }), /not installed.*nothing was run/],
    ['runner timed out', run({ timedOut: true, exitCode: null }), /timed out/],
    ['runner crashed', run({ exitCode: 1, stderrTail: 'SyntaxError: boom' }), /boom|exited/i],
  ])('%s → labelled estimate, nothing persisted', async (_label, outcome, warning) => {
    vi.mocked(runJsCoverage).mockResolvedValue(outcome);
    const kernel = createKernel();
    await seedAllButCoverage(kernel);

    const data = await analyze(kernel, path.join(dir, 'src'));

    // Never a "measured 0": the figure is a labelled static estimate.
    expect(data).toMatchObject({ estimated: true, measured: false, coverageMethod: 'static-estimation' });
    expect(String(data.warning)).toMatch(warning);
    expect(String(data.warning)).toMatch(/STATIC ESTIMATE/);
    await expectNothingPersisted(kernel);
  }, 60000);

  it.each([
    ['no tests ran', run({ exitCode: 0, exitedCleanly: true, numTotalTests: 0, data: { files: [], summary: { line: 0, branch: 0, function: 0, statement: 0, files: 0 } } })],
    ['target not covered by the run', run({ exitCode: 0, exitedCleanly: true, numTotalTests: 3, data: { files: [measuredFile('lib/other.ts')], summary: { line: 75, branch: 0, function: 100, statement: 75, files: 1 } } })],
  ])('%s → unmeasured (null figures), nothing persisted', async (_label, outcome) => {
    vi.mocked(runJsCoverage).mockResolvedValue(outcome);
    const kernel = createKernel();
    await seedAllButCoverage(kernel);

    const data = await analyze(kernel, path.join(dir, 'src'));

    expect(data).toMatchObject({ lineCoverage: null, measured: false, unmeasured: true, coverageMethod: 'none' });
    await expectNothingPersisted(kernel);
  }, 60000);

  it('unreadable report → no figures, nothing persisted', async () => {
    const lcov = path.join(dir, 'coverage', 'lcov.info');
    fs.mkdirSync(path.dirname(lcov));
    fs.writeFileSync(lcov, 'this is not an lcov report');
    const kernel = createKernel();
    await seedAllButCoverage(kernel);

    const data = await analyze(kernel, lcov);

    expect(data).toMatchObject({ lineCoverage: null, measured: false, coverageMethod: 'none' });
    expect(runJsCoverage).not.toHaveBeenCalled();
    await expectNothingPersisted(kernel);
  }, 60000);

  it('instrumented run that covers the target → measured and persisted', async () => {
    vi.mocked(runJsCoverage).mockResolvedValue(run({
      exitCode: 0, exitedCleanly: true, numTotalTests: 2,
      data: { files: [measuredFile(path.join(dir, 'src', 'math.ts'))], summary: { line: 75, branch: 0, function: 100, statement: 75, files: 1 } },
    }));
    const kernel = createKernel();
    await seedAllButCoverage(kernel);

    const data = await analyze(kernel, path.join(dir, 'src'));

    expect(data).toMatchObject({ measured: true, estimated: false, lineCoverage: 75 });
    expect(kernel.store.get(coverageEvidenceKey)).toMatchObject({ metric: 'coverage', value: 75 });
  }, 60000);
});


describe('#1036 — an adopted root that excludes package tests falls back to the package', () => {
  let root: string;
  let pkg: string;
  const run = (over: Partial<JsCoverageRun>): JsCoverageRun => ({
    runner: 'vitest', missing: false, exitCode: 0, exitedCleanly: true, timedOut: false,
    timeoutMs: 120000, data: null, numTotalTests: 0, stderrTail: '', ...over,
  });

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1036-fallback-')));
    pkg = path.join(root, 'packages', 'a');
    fs.mkdirSync(path.join(root, '.git'));
    fs.mkdirSync(path.join(pkg, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }));
    fs.writeFileSync(path.join(root, 'vitest.config.mjs'), "export default { test: { include: ['tests/**/*.test.js'] } };\n");
    fs.writeFileSync(path.join(pkg, 'package.json'), '{}');
    fs.writeFileSync(path.join(pkg, 'src', 'math.ts'), 'export const add = (a, b) => a + b;\n');
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    vi.stubEnv('AQE_COVERAGE_NO_EXEC', '0');
    vi.mocked(runJsCoverage).mockReset();
  });

  afterEach(() => {
    vi.mocked(runJsCoverage).mockReset();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(['zero tests', 'missing runner'])('%s at root: retries once from the package and persists only its measurement', async (reason) => {
    vi.mocked(runJsCoverage).mockResolvedValueOnce(run(reason === 'missing runner'
      ? { missing: true, numTotalTests: null } : {}));
    vi.mocked(runJsCoverage).mockResolvedValueOnce(run({ numTotalTests: 1, data: {
      files: [{ path: 'src/math.ts', lines: { covered: 3, total: 4 },
        branches: { covered: 0, total: 0 }, functions: { covered: 1, total: 1 },
        statements: { covered: 3, total: 4 }, uncoveredLines: [4], uncoveredBranches: [] }],
      summary: { line: 75, branch: 0, function: 100, statement: 75, files: 1 },
    } }));
    const kernel = createKernel();
    expect(await analyze(kernel, path.join(pkg, 'src'))).toMatchObject({ measured: true, lineCoverage: 75 });
    expect(runJsCoverage).toHaveBeenNthCalledWith(1, root, { timeoutMs: 120000, pathFilter: 'packages/a/' });
    expect(runJsCoverage).toHaveBeenNthCalledWith(2, pkg, { timeoutMs: 120000 });
    expect(kernel.store.get(coverageEvidenceKey)).toMatchObject({ value: 75 });
  });

  it('zero tests in both locations stays unmeasured and writes no coverage evidence', async () => {
    vi.mocked(runJsCoverage).mockResolvedValue(run({}));
    const kernel = createKernel();
    expect(await analyze(kernel, path.join(pkg, 'src'))).toMatchObject({ measured: false, unmeasured: true, lineCoverage: null });
    expect(runJsCoverage).toHaveBeenCalledTimes(2);
    expect(kernel.store.has('coverage:latest')).toBe(false);
    expect(kernel.store.has(coverageEvidenceKey)).toBe(false);
  });

  it.each([
    ['timeout', run({ timedOut: true, exitedCleanly: false, numTotalTests: null })],
    ['failed tests', run({ exitCode: 1, exitedCleanly: false, numTotalTests: 2, numFailedTests: 2 })],
    ['unreported counts', run({ numTotalTests: null })],
  ])('%s does not retry or hide the original failure', async (_label, outcome) => {
    vi.mocked(runJsCoverage).mockResolvedValue(outcome);
    await analyze(createKernel(), path.join(pkg, 'src'));
    expect(runJsCoverage).toHaveBeenCalledTimes(1);
  });
});
