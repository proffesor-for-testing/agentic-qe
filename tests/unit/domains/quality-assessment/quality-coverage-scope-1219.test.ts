/**
 * Issue #1219 (items 1 and 2) — quality_assess reports the coverage of the
 * files it was asked about, or says it has none.
 *
 *  1. A file with no per-file coverage record got the project-wide
 *     `coverage:latest` figure, reported as measured. It is unmeasured.
 *  2. Coverage over several files was the plain mean of their percentages
 *     ((83.33 + 20) / 2 = 51.67 for 5/6 and 1/5 lines). It is covered lines
 *     over total lines (6/11 = 54.55); per-file records carry the line counts.
 *     A record written without them cannot be weighted, so the scope's
 *     coverage is unmeasured instead of a mean.
 *
 * The defect predictor had the same project-wide fallback for a file's risk.
 */
import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { QualityAnalyzerService } from '../../../../src/domains/quality-assessment/services/quality-analyzer';
import { measuredFileCoverage } from '../../../../src/domains/quality-assessment/coverage-report-event';
import { CoverageAnalyzerService } from '../../../../src/domains/coverage-analysis/services/coverage-analyzer';
import { DefectPredictorService } from '../../../../src/domains/defect-intelligence/services/defect-predictor';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { findProjectRoot } from '../../../../src/kernel/project-root.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';

const key = (rel: string) => `coverage:file:${resolve(findProjectRoot(), rel)}`;
const LATEST = { line: 70, branch: null, function: null, statement: null, files: 2, measured: true };

function memory(seed: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed));
  return {
    store,
    backend: {
      initialize: async () => {}, dispose: async () => {},
      set: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
      get: vi.fn(async (k: string) => store.get(k)),
      delete: vi.fn(async (k: string) => store.delete(k)),
      has: async (k: string) => store.has(k),
      search: async () => [], vectorSearch: async () => [], storeVector: async () => {},
    } as unknown as MemoryBackend,
  };
}

const analyzer = (seed: Record<string, unknown>) =>
  new QualityAnalyzerService({ memory: memory(seed).backend }, { enableTrendAnalysis: false, enableLLMInsights: false });

async function coverageOf(seed: Record<string, unknown>, files: string[]) {
  const result = await analyzer(seed).analyzeQuality({ sourceFiles: files, includeMetrics: ['coverage'] });
  if (!result.success) throw result.error;
  return result.value;
}

describe('#1219.1 — no project-wide fallback for a file without its own record', () => {
  it('reports the file unmeasured, not the coverage:latest figure', async () => {
    const report = await coverageOf({ 'coverage:latest': LATEST }, ['src/a.ts']);

    expect(report.metrics.find((m) => m.name === 'coverage')).toBeUndefined();
    expect(report.score.coverage).toBe(-1);
    expect(report.unmeasured).toEqual([expect.objectContaining({
      metric: 'coverage',
      reason: expect.stringContaining('a project-wide coverage figure is not a measurement of these files'),
      files: ['src/a.ts'],
    })]);
  });

  it("still reads the file's own record", async () => {
    const report = await coverageOf({
      'coverage:latest': LATEST,
      [key('src/a.ts')]: { line: 80, branch: null, function: null, statement: null, measured: true },
    }, ['src/a.ts']);

    expect(report.score.coverage).toBe(80);
    expect(report.unmeasured).toEqual([]);
  });
});

describe('#1219.2 — coverage over several files is line-weighted', () => {
  const record = (covered: number, total: number) => ({
    line: Math.round((covered / total) * 10000) / 100, branch: null, function: null, statement: null,
    measured: true, lines: { covered, total },
  });

  it('is covered lines over total lines (the issue: 6/11, not the 51.67 mean)', async () => {
    const report = await coverageOf({
      [key('src/math.ts')]: record(5, 6),
      [key('src/text.ts')]: record(1, 5),
    }, ['src/math.ts', 'src/text.ts']);

    expect(report.metrics.find((m) => m.name === 'coverage')?.value).toBe(54.55);
    expect(report.score.coverage).toBe(54.55);
    expect(report.unmeasured).toEqual([]);
  });

  it('weights a 10-line file against a 100-line one', async () => {
    const report = await coverageOf({
      [key('src/a.ts')]: record(8, 10),
      [key('src/b.ts')]: record(50, 100),
    }, ['src/a.ts', 'src/b.ts']);

    expect(report.score.coverage).toBe(52.73);
  });

  it('is unmeasured when a record carries no line counts, instead of a mean of percentages', async () => {
    const report = await coverageOf({
      [key('src/a.ts')]: record(8, 10),
      [key('src/b.ts')]: { line: 50, branch: null, function: null, statement: null, measured: true },
    }, ['src/a.ts', 'src/b.ts']);

    expect(report.score.coverage).toBe(-1);
    expect(report.unmeasured).toEqual([expect.objectContaining({
      metric: 'coverage',
      reason: expect.stringContaining('1 of 2 per-file coverage record(s) carry no line counts'),
    })]);
  });

  it('a single record needs no weighting', async () => {
    const report = await coverageOf({
      [key('src/b.ts')]: { line: 50, branch: null, function: null, statement: null, measured: true },
    }, ['src/b.ts']);

    expect(report.score.coverage).toBe(50);
  });
});

describe('#1219.2 — per-file records carry their line counts', () => {
  it('measuredFileCoverage keeps consistent counts and drops counts that do not match the percentage', () => {
    expect(measuredFileCoverage({ line: 80, measured: true, lines: { covered: 8, total: 10 } })?.lines)
      .toEqual({ covered: 8, total: 10 });
    expect(measuredFileCoverage({ line: 80, measured: true, lines: { covered: 1, total: 10 } })?.lines).toBeUndefined();
    expect(measuredFileCoverage({ line: 80, measured: true, lines: { covered: 8.5, total: 10 } })?.lines).toBeUndefined();
    expect(measuredFileCoverage({ line: 0, measured: true, lines: { covered: 0, total: 0 } })?.lines).toBeUndefined();
    expect(measuredFileCoverage({ line: 80, measured: true })?.lines).toBeUndefined();
  });

  it('the coverage analyzer stores the line counts with each per-file record', async () => {
    const { store, backend } = memory();
    const service = new CoverageAnalyzerService(backend);
    const file = (path: string, covered: number, total: number) => ({
      path, lines: { covered, total }, branches: { covered: 0, total: 0 }, functions: { covered: 0, total: 0 },
      statements: { covered: 0, total: 0 }, uncoveredLines: [], uncoveredBranches: [],
    });

    const result = await service.analyze({
      coverageData: {
        files: [file('src/a.ts', 8, 10), file('src/b.ts', 50, 100)],
        summary: { line: 52.73, branch: 0, function: 0, statement: 0, files: 2 },
      },
      includeFileDetails: true,
      measured: true,
      projectRoot: findProjectRoot(),
    });

    expect(result.success).toBe(true);
    expect(store.get(key('src/a.ts'))).toMatchObject({ line: 80, lines: { covered: 8, total: 10 }, measured: true });
    expect(store.get(key('src/b.ts'))).toMatchObject({ line: 50, lines: { covered: 50, total: 100 }, measured: true });
  });

  it('test execution keeps the line counts from the istanbul map and stores them', async () => {
    const { store, backend } = memory();
    const executor = new TestExecutorService({ memory: backend }, { enableLLMAnalysis: false });
    const internals = executor as unknown as {
      extractCoverageFromJson(json: unknown): { perFile: Array<{ path: string; line: number; lines?: unknown }> };
      storeResults(runId: string, result: Record<string, unknown>): Promise<void>;
    };
    const at = (line: number) => ({ start: { line, column: 0 }, end: { line, column: 5 } });
    const path = resolve(findProjectRoot(), 'src/math.ts');

    const { perFile } = internals.extractCoverageFromJson({
      coverageMap: {
        [path]: {
          path, statementMap: { 0: at(1), 1: at(2), 2: at(3), 3: at(4), 4: at(5), 5: at(6) },
          s: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 0 }, branchMap: {}, b: {}, fnMap: {}, f: {},
        },
      },
    });
    expect(perFile[0]).toMatchObject({ line: 83.33, lines: { covered: 5, total: 6 } });

    await internals.storeResults('r1', {
      runId: 'r1', status: 'passed', total: 1, passed: 1, failed: 0, skipped: 0, duration: 1, failedTests: [],
      coverage: { line: 83.33, branch: null, function: null, statement: 83.33 }, fileCoverages: perFile,
    });
    expect(store.get(`coverage:file:${path}`)).toMatchObject({ line: 83.33, lines: { covered: 5, total: 6 } });
  });
});

describe('#1219 — the defect predictor has no project-wide fallback either', () => {
  it("uses its neutral prior for a file without its own record, not coverage:latest", async () => {
    const predictor = new DefectPredictorService(memory({ 'coverage:latest': { ...LATEST, line: 20 } }).backend as never);
    const read = (predictor as unknown as { getTestCoverage(f: string): Promise<number> }).getTestCoverage.bind(predictor);

    expect(await read('src/a.ts')).toBe(0.4);
  });
});
