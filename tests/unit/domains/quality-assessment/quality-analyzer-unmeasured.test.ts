/**
 * #1011 / #1002 (+ #1021 review): the static quality analyzer never invents values.
 *
 * - EXCLUDED files (binary, generated/minified, .d.ts, rejected by reader
 *   policy) are left out with a reason; metrics stay measured over the rest.
 * - FAILED files (unreadable, syntax errors) make a parsed metric PARTIAL
 *   (`coverageOfScope` = analysed / total). Below MIN_ANALYSED_SHARE, or when
 *   a failed file is an explicit target, the metric is UNMEASURED.
 * - Never the old fixed 10 / 70 / 70 / 0%.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MIN_ANALYSED_SHARE,
  QualityAnalyzerService,
} from '../../../../src/domains/quality-assessment/services/quality-analyzer';
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

const source = (n: number) => `export function f${n}(a: number, b: number): number {
  if (a > b) {
    return a + b;
  }
  return b - a + ${n};
}
`;
// Random-looking bytes with NULs: what a corrupted or binary blob named .ts looks like.
const GARBAGE = Buffer.from([0x00, 0xff, 0x13, 0x00, 0x7b, 0x9a, 0x00, 0x01, 0xde, 0xad, 0xbe, 0xef, 0x00, 0x7d]);
const BROKEN_SOURCE = 'export function ( {{{ ]]] => %%% class class {\n';

describe('static quality analysis never invents values (#1011, #1002, #1021)', () => {
  let dir: string;
  let cwd: ReturnType<typeof vi.spyOn>;
  let metricsAnalyzer: CodeMetricsAnalyzer;

  const write = (rel: string, content: string | Buffer) => {
    const file = join(dir, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
    return file;
  };
  const goodFiles = (count: number) => Array.from({ length: count }, (_, i) => write(`src/good${i}.ts`, source(i)));

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1011-')));
    // CodeMetricsAnalyzer contains reads under the working directory captured at construction.
    cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    metricsAnalyzer = new CodeMetricsAnalyzer();
  });

  afterEach(() => {
    cwd.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  const service = (memory: MemoryBackend = memoryStub()) =>
    new QualityAnalyzerService({ memory, metricsAnalyzer }, { enableTrendAnalysis: false, enableLLMInsights: false });

  const names = (report: QualityReport) => report.metrics.map((m) => m.name).sort();
  const unmeasuredNames = (report: QualityReport) => (report.unmeasured ?? []).map((u) => u.metric).sort();
  const STATIC = ['complexity', 'duplication', 'maintainability', 'testability'];

  describe('CodeMetricsAnalyzer.analyzeFileDetailed', () => {
    it('excludes binary content (NUL in the first 8 KB)', async () => {
      const outcome = await metricsAnalyzer.analyzeFileDetailed(write('src/garbage.ts', GARBAGE));
      expect(outcome).toMatchObject({ status: 'excluded', reason: expect.stringMatching(/binary/i) });
    });

    it('measures valid TypeScript with a raw NUL inside a string literal near the top', async () => {
      // Seen in real repos (e.g. separators in message framing): valid source, not binary.
      const file = write('src/framing.ts', `export const SEP = '\u0000';\nexport function frame(s: string) { return s + SEP; }\n`);
      const outcome = await metricsAnalyzer.analyzeFileDetailed(file);
      expect(outcome.status).toBe('measured');
    });

    it('excludes NUL-bearing non-TS/JS content as binary', async () => {
      const outcome = await metricsAnalyzer.analyzeFileDetailed(write('src/blob.py', Buffer.from([0x61, 0x00, 0x62])));
      expect(outcome).toMatchObject({ status: 'excluded', reason: expect.stringMatching(/binary/i) });
    });

    it('does not treat a NUL inside a string literal past 8 KB as binary', async () => {
      const padding = `// ${'x'.repeat(9000)}\n`;
      const file = write('src/nul-late.ts', `${padding}export const sep = '\u0000';\n`);
      const outcome = await metricsAnalyzer.analyzeFileDetailed(file);
      expect(outcome.status).toBe('measured');
    });

    it.each([
      ['a type declaration file', 'src/types.d.ts', 'export declare const x: number;\n', /declaration/i],
      ['a minified bundle', 'src/vendor.min.js', 'var a=1;\n', /minified/i],
      ['a generated file', 'src/schema.ts', '// @generated by protoc\nexport const x = 1;\n', /generated/i],
    ])('excludes %s', async (_label, rel, content, reason) => {
      const outcome = await metricsAnalyzer.analyzeFileDetailed(write(rel, content));
      expect(outcome).toMatchObject({ status: 'excluded', reason: expect.stringMatching(reason) });
    });

    it('fails a file with syntax errors', async () => {
      const outcome = await metricsAnalyzer.analyzeFileDetailed(write('src/broken.ts', BROKEN_SOURCE));
      expect(outcome).toMatchObject({ status: 'failed', reason: expect.stringMatching(/syntax error/i) });
    });

    it('fails an unreadable file', async () => {
      const outcome = await metricsAnalyzer.analyzeFileDetailed(join(dir, 'src/missing.ts'));
      expect(outcome).toMatchObject({ status: 'failed', metrics: null, reason: expect.stringMatching(/could not be read/i) });
    });

    it('excludes a file the reader refuses by policy', async () => {
      const outcome = await metricsAnalyzer.analyzeFileDetailed('/etc/hostname');
      expect(outcome).toMatchObject({ status: 'excluded', reason: expect.stringMatching(/refused by the file reader/i) });
    });

    it('measures a Next.js catch-all route inside the project root', async () => {
      const outcome = await metricsAnalyzer.analyzeFileDetailed(write('src/pages/[...slug].tsx', source(1)));
      expect(outcome.status).toBe('measured');
    });
  });

  describe('analyzeQuality', () => {
    it('keeps every metric measured when a binary file is excluded, and lists the exclusion', async () => {
      const files = [...goodFiles(2), write('src/garbage.ts', GARBAGE)];

      const result = await service().analyzeQuality({ sourceFiles: files, includeMetrics: STATIC });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(names(result.value)).toEqual(STATIC);
      expect(result.value.unmeasured ?? []).toEqual([]);
      expect(result.value.excluded).toEqual([
        { file: join(dir, 'src/garbage.ts'), reason: expect.stringMatching(/binary/i) },
      ]);
      expect(result.value.score.overall).toBeGreaterThanOrEqual(0);
    });

    it('reports a metric as partial when a few files fail above the threshold', async () => {
      const files = [...goodFiles(19), write('src/broken.ts', BROKEN_SOURCE)];

      const result = await service().analyzeQuality({ sourceFiles: files, includeMetrics: ['complexity'] });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(names(result.value)).toEqual(['complexity']);
      expect(result.value.partial).toEqual([{
        metric: 'complexity', analysedFiles: 19, totalFiles: 20, coverageOfScope: 0.95,
        failed: [{ file: join(dir, 'src/broken.ts'), reason: expect.stringMatching(/syntax error/i) }],
      }]);
      expect(result.value.unmeasured ?? []).toEqual([]);
    });

    it('never reports a partial scope as 100% (rounds down)', async () => {
      const files = [...goodFiles(40), write('src/broken.ts', BROKEN_SOURCE)];

      const result = await service().analyzeQuality({ sourceFiles: files, includeMetrics: ['complexity'] });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.partial?.[0]).toMatchObject({ analysedFiles: 40, totalFiles: 41, coverageOfScope: 0.975 });
    });

    it('marks the metric unmeasured when failures drop coverage below the threshold', async () => {
      const files = [...goodFiles(2), write('src/broken.ts', BROKEN_SOURCE)];

      const result = await service().analyzeQuality({ sourceFiles: files, includeMetrics: ['complexity', 'maintainability'] });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(names(result.value)).toEqual([]);
      expect(unmeasuredNames(result.value)).toEqual(['complexity', 'maintainability']);
      expect(result.value.unmeasured?.[0].reason).toMatch(/2 of 3 file\(s\) analysed \(66\.6%, below 95%\)/);
      expect(result.value.unmeasured?.[0].files).toEqual([join(dir, 'src/broken.ts')]);
      expect(result.value.score).toMatchObject({ overall: -1, complexity: -1, maintainability: -1 });
      expect(MIN_ANALYSED_SHARE).toBe(0.95);
    });

    it('marks the metric unmeasured when a failed file is an explicit target', async () => {
      const broken = write('src/broken.ts', BROKEN_SOURCE);
      const files = [...goodFiles(30), broken];

      const result = await service().analyzeQuality({
        sourceFiles: files, includeMetrics: ['complexity'], explicitFiles: [broken],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(unmeasuredNames(result.value)).toEqual(['complexity']);
      expect(result.value.unmeasured?.[0].reason).toMatch(/explicit target/);
    });

    it('does not fill in 10 / 70 / 70 for an unreadable single file', async () => {
      const result = await service().analyzeQuality({
        sourceFiles: [join(dir, 'src/missing.ts')],
        includeMetrics: ['complexity', 'maintainability', 'testability'],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.metrics).toEqual([]);
      expect(unmeasuredNames(result.value)).toEqual(['complexity', 'maintainability', 'testability']);
      expect(result.value.unmeasured?.[0].reason).toMatch(/could not be read/i);
      expect(result.value.score).toMatchObject({ overall: -1, complexity: -1, maintainability: -1 });
    });

    it('marks metrics unmeasured when every file is excluded', async () => {
      const result = await service().analyzeQuality({
        sourceFiles: [write('src/garbage.ts', GARBAGE)], includeMetrics: ['complexity'],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(unmeasuredNames(result.value)).toEqual(['complexity']);
      expect(result.value.unmeasured?.[0].reason).toMatch(/no analysable files: 1 file\(s\) excluded/);
    });

    it('still measures duplication when a file fails to parse (no parse needed)', async () => {
      const files = [...goodFiles(2), write('src/broken.ts', BROKEN_SOURCE)];

      const result = await service().analyzeQuality({ sourceFiles: files, includeMetrics: ['duplication', 'complexity'] });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(names(result.value)).toEqual(['duplication']);
      expect(unmeasuredNames(result.value)).toEqual(['complexity']);
    });

    it('reports duplication unmeasured, not 0%, when detection fails', async () => {
      vi.spyOn(metricsAnalyzer, 'detectDuplication').mockRejectedValue(new Error('detector exploded'));

      const result = await service().analyzeQuality({ sourceFiles: goodFiles(1), includeMetrics: ['duplication', 'complexity'] });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(names(result.value)).toEqual(['complexity']);
      expect(result.value.unmeasured).toEqual([
        expect.objectContaining({ metric: 'duplication', reason: expect.stringMatching(/detector exploded/) }),
      ]);
    });

    it('reports coverage unmeasured with a reason when no measured coverage is stored', async () => {
      const result = await service().analyzeQuality({ sourceFiles: goodFiles(1), includeMetrics: ['coverage', 'complexity'] });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(names(result.value)).toEqual(['complexity']);
      expect(result.value.unmeasured).toEqual([
        expect.objectContaining({ metric: 'coverage', reason: expect.stringMatching(/no measured coverage/i) }),
      ]);
      expect(result.value.score.coverage).toBe(-1);
    });

    it('measures every requested metric for well-formed source', async () => {
      const result = await service(memoryStub({ 'coverage:latest': { line: 91, measured: true } })).analyzeQuality({
        sourceFiles: goodFiles(2),
        includeMetrics: [],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.unmeasured ?? []).toEqual([]);
      expect(result.value.partial ?? []).toEqual([]);
      expect(names(result.value)).toEqual(['complexity', 'coverage', 'duplication', 'maintainability', 'testability']);
      expect(result.value.score.coverage).toBe(91);
      expect(result.value.score.overall).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeComplexity', () => {
    it('marks an unreadable file unmeasured instead of inventing 5 / 8 / 70 / 100 LOC', async () => {
      const result = await service().analyzeComplexity({ sourceFiles: [join(dir, 'src/missing.ts')], metrics: [] });

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
      const result = await service().analyzeComplexity({ sourceFiles: goodFiles(1), metrics: ['cyclomatic'] });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.files[0].maintainability).toBe(-1);
      expect(result.value.hotspots.filter((h) => /maintainability/i.test(h.recommendation))).toEqual([]);
      expect(result.value.summary.averageMaintainability).toBe(-1);
    });

    it('averages only measured files', async () => {
      const [good] = goodFiles(1);
      const result = await service().analyzeComplexity({ sourceFiles: [good, join(dir, 'src/missing.ts')], metrics: [] });

      expect(result.success).toBe(true);
      if (!result.success) return;
      const measured = result.value.files[0];
      expect(result.value.summary.averageCyclomatic).toBe(measured.cyclomatic);
      expect(result.value.summary.totalLinesOfCode).toBe(measured.linesOfCode);
    });
  });
});
