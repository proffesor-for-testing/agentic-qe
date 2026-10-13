/**
 * #1011 / #1002: the static quality analyzer must never invent values.
 *
 * A file it cannot read or parse, and a duplication detection that fails,
 * produce UNMEASURED metrics (omitted from `metrics`, -1 in the score, listed
 * with a reason in `unmeasured`) — never the old fixed 10 / 70 / 70 / 0%.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QualityAnalyzerService } from '../../../../src/domains/quality-assessment/services/quality-analyzer';
import { CodeMetricsAnalyzer } from '../../../../src/shared/metrics/code-metrics';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import type { QualityReport } from '../../../../src/domains/quality-assessment/interfaces';

function memoryStub(seed: Record<string, unknown> = {}): MemoryBackend {
  const store = new Map<string, unknown>(Object.entries(seed));
  return {
    initialize: async () => {},
    dispose: async () => {},
    set: async (key: string, value: unknown) => { store.set(key, value); },
    get: async (key: string) => store.get(key),
    delete: async (key: string) => store.delete(key),
    has: async (key: string) => store.has(key),
    search: async () => [],
    vectorSearch: async () => [],
    storeVector: async () => {},
  } as unknown as MemoryBackend;
}

const GOOD_SOURCE = `export function add(a: number, b: number): number {
  if (a > b) {
    return a + b;
  }
  return b + a;
}
`;
// Random-looking bytes with NULs: what a corrupted or binary blob named .ts looks like.
const GARBAGE = Buffer.from([0x00, 0xff, 0x13, 0x00, 0x7b, 0x9a, 0x00, 0x01, 0xde, 0xad, 0xbe, 0xef, 0x00, 0x7d]);
const BROKEN_SOURCE = 'export function ( {{{ ]]] => %%% class class {\n';

describe('static quality analysis never invents values (#1011, #1002)', () => {
  let dir: string;
  let cwd: ReturnType<typeof vi.spyOn>;
  let metricsAnalyzer: CodeMetricsAnalyzer;

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1011-')));
    writeFileSync(join(dir, 'good.ts'), GOOD_SOURCE);
    writeFileSync(join(dir, 'garbage.ts'), GARBAGE);
    writeFileSync(join(dir, 'broken.ts'), BROKEN_SOURCE);
    // FileReader confines reads to the working directory captured at construction.
    cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    metricsAnalyzer = new CodeMetricsAnalyzer();
  });

  afterEach(() => {
    cwd.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  const service = (memory: MemoryBackend = memoryStub()) =>
    new QualityAnalyzerService({ memory, metricsAnalyzer }, { enableTrendAnalysis: false, enableLLMInsights: false });

  const names = (report: QualityReport) => report.metrics.map((m) => m.name);
  const unmeasuredNames = (report: QualityReport) => (report.unmeasured ?? []).map((u) => u.metric);

  describe('CodeMetricsAnalyzer.analyzeFileDetailed', () => {
    it('reports binary content as unmeasured with a reason', async () => {
      const outcome = await metricsAnalyzer.analyzeFileDetailed(join(dir, 'garbage.ts'));
      expect(outcome.unmeasuredReason).toMatch(/binary/i);
    });

    it('reports syntax errors as unmeasured with a reason', async () => {
      const outcome = await metricsAnalyzer.analyzeFileDetailed(join(dir, 'broken.ts'));
      expect(outcome.unmeasuredReason).toMatch(/syntax error/i);
    });

    it('reports an unreadable file as unmeasured with a reason and no metrics', async () => {
      const outcome = await metricsAnalyzer.analyzeFileDetailed(join(dir, 'missing.ts'));
      expect(outcome.metrics).toBeNull();
      expect(outcome.unmeasuredReason).toMatch(/could not be read/i);
    });

    it('measures a well-formed file without a reason', async () => {
      const outcome = await metricsAnalyzer.analyzeFileDetailed(join(dir, 'good.ts'));
      expect(outcome.unmeasuredReason).toBeUndefined();
      expect(outcome.metrics?.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
    });
  });

  describe('analyzeQuality', () => {
    const STATIC = ['complexity', 'maintainability', 'testability', 'duplication'];

    it('marks every static metric unmeasured when one file is binary garbage', async () => {
      const result = await service().analyzeQuality({
        sourceFiles: [join(dir, 'good.ts'), join(dir, 'garbage.ts')],
        includeMetrics: STATIC,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      const report = result.value;
      expect(names(report)).toEqual([]);
      expect(unmeasuredNames(report).sort()).toEqual([...STATIC].sort());
      for (const entry of report.unmeasured ?? []) {
        expect(entry.reason).toMatch(/garbage\.ts/);
        expect(entry.files).toEqual([join(dir, 'garbage.ts')]);
      }
      expect(report.score.complexity).toBe(-1);
      expect(report.score.maintainability).toBe(-1);
      expect(report.score.overall).toBe(-1);
    });

    it('does not fill in 10 / 70 / 70 for a file that cannot be read', async () => {
      const result = await service().analyzeQuality({
        sourceFiles: [join(dir, 'missing.ts')],
        includeMetrics: ['complexity', 'maintainability', 'testability'],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.metrics).toEqual([]);
      expect(unmeasuredNames(result.value).sort()).toEqual(['complexity', 'maintainability', 'testability']);
      expect(result.value.unmeasured?.[0].reason).toMatch(/could not be read/i);
      expect(result.value.score).toMatchObject({ overall: -1, complexity: -1, maintainability: -1 });
    });

    it('marks syntax-error files unmeasured instead of scoring them', async () => {
      const result = await service().analyzeQuality({
        sourceFiles: [join(dir, 'broken.ts')],
        includeMetrics: ['complexity'],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(names(result.value)).toEqual([]);
      expect(result.value.unmeasured).toEqual([
        expect.objectContaining({ metric: 'complexity', reason: expect.stringMatching(/syntax error/i) }),
      ]);
    });

    it('reports duplication unmeasured, not 0%, when detection fails', async () => {
      vi.spyOn(metricsAnalyzer, 'detectDuplication').mockRejectedValue(new Error('detector exploded'));

      const result = await service().analyzeQuality({
        sourceFiles: [join(dir, 'good.ts')],
        includeMetrics: ['duplication', 'complexity'],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(names(result.value)).toEqual(['complexity']);
      expect(result.value.unmeasured).toEqual([
        expect.objectContaining({ metric: 'duplication', reason: expect.stringMatching(/detector exploded/) }),
      ]);
    });

    it('reports coverage unmeasured with a reason when no measured coverage is stored', async () => {
      const result = await service().analyzeQuality({
        sourceFiles: [join(dir, 'good.ts')],
        includeMetrics: ['coverage', 'complexity'],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(names(result.value)).toEqual(['complexity']);
      expect(result.value.unmeasured).toEqual([
        expect.objectContaining({ metric: 'coverage', reason: expect.stringMatching(/no measured coverage/i) }),
      ]);
      expect(result.value.score.coverage).toBe(-1);
    });

    it('measures every requested metric for well-formed source', async () => {
      const result = await service(memoryStub({ 'coverage:latest': { line: 91 } })).analyzeQuality({
        sourceFiles: [join(dir, 'good.ts')],
        includeMetrics: [],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.unmeasured ?? []).toEqual([]);
      expect(names(result.value).sort()).toEqual(
        ['complexity', 'coverage', 'duplication', 'maintainability', 'testability'],
      );
      expect(result.value.score.coverage).toBe(91);
      expect(result.value.score.overall).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeComplexity', () => {
    it('marks an unreadable file unmeasured instead of inventing 5 / 8 / 70 / 100 LOC', async () => {
      const result = await service().analyzeComplexity({
        sourceFiles: [join(dir, 'missing.ts')],
        metrics: [],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      const [file] = result.value.files;
      expect(file).toMatchObject({ cyclomatic: -1, cognitive: -1, maintainability: -1, linesOfCode: -1 });
      expect(file.unmeasuredReason).toMatch(/could not be read/i);
      expect(result.value.hotspots).toEqual([]);
      expect(result.value.summary).toEqual({
        averageCyclomatic: -1, averageCognitive: -1, averageMaintainability: -1, totalLinesOfCode: 0,
      });
    });

    it('does not report a maintainability hotspot for a metric that was not requested', async () => {
      const result = await service().analyzeComplexity({
        sourceFiles: [join(dir, 'good.ts')],
        metrics: ['cyclomatic'],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.files[0].maintainability).toBe(-1);
      expect(result.value.hotspots.filter((h) => /maintainability/i.test(h.recommendation))).toEqual([]);
      expect(result.value.summary.averageMaintainability).toBe(-1);
    });

    it('averages only measured files', async () => {
      const result = await service().analyzeComplexity({
        sourceFiles: [join(dir, 'good.ts'), join(dir, 'missing.ts')],
        metrics: [],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      const good = result.value.files[0];
      expect(result.value.summary.averageCyclomatic).toBe(good.cyclomatic);
      expect(result.value.summary.totalLinesOfCode).toBe(good.linesOfCode);
    });
  });
});
