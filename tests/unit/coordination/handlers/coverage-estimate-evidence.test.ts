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
