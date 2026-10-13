/**
 * Issue #1007: ResultSaver named files by timestamp to the second, so two
 * saves in the same second overwrote each other (an insufficient-evidence
 * quality report was replaced by a later approve report).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ResultSaver } from '../../../src/coordination/result-saver';
import type { TaskType } from '../../../src/coordination/queen-coordinator';

const FIXED_NOW = new Date('2026-10-13T10:11:12.345Z');

const quality = (n: number) => ({ qualityScore: n, passed: n % 2 === 0, metrics: {}, recommendations: [] });

const RESULTS: Array<[TaskType, (n: number) => unknown]> = [
  ['assess-quality', n => ({ qualityScore: n, passed: n % 2 === 0, metrics: {}, recommendations: [] })],
  ['analyze-coverage', n => ({
    lineCoverage: n, branchCoverage: n, functionCoverage: n, statementCoverage: n,
    totalFiles: 1, measured: true, estimated: false, coverageMethod: 'instrumented-report', gaps: [],
  })],
  ['scan-security', n => ({
    vulnerabilities: n, critical: 0, high: 0, medium: 0, low: n, topVulnerabilities: [], recommendations: [],
  })],
  ['generate-tests', n => ({
    testsGenerated: 1, coverageEstimate: null, patternsUsed: [],
    tests: [{ name: 'same name', file: 'src/a.ts', type: 'unit', code: `// run ${n}` }],
  })],
  ['index-code', n => ({ filesIndexed: n, nodesCreated: n, edgesCreated: n, duration: n })],
  ['predict-defects', n => ({ run: n })],
  ['validate-contracts', n => ({ run: n })],
  ['test-accessibility', n => ({ run: n })],
  ['run-chaos', n => ({ run: n })],
  ['execute-tests' as TaskType, n => ({ run: n })],
];

describe('ResultSaver unique file names (#1007)', () => {
  let baseDir: string;
  let saver: ResultSaver;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1007-'));
    saver = new ResultSaver(path.join(baseDir, '.agentic-qe'));
    vi.stubEnv('AQE_MEMORY_BACKEND', '');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it.each(RESULTS)('%s: two saves at the same instant keep both results', async (type, make) => {
    const first = await saver.save('task-first', type, make(1));
    const second = await saver.save('task-second', type, make(2));

    // Generated test files keep overwrite semantics (review N7); reports do not.
    const firstPaths = first.files.filter(f => f.format !== 'source').map(f => f.path);
    const secondPaths = second.files.filter(f => f.format !== 'source').map(f => f.path);
    for (const p of secondPaths) expect(firstPaths).not.toContain(p);
    for (const f of [...first.files, ...second.files]) {
      expect(fs.existsSync(f.path)).toBe(true);
    }
    const firstJson = first.files.find(f => f.format === 'json')!;
    expect(fs.readFileSync(firstJson.path, 'utf8')).toMatch(/1/);
  });

  it('keeps every result when saves run concurrently', async () => {
    const saved = await Promise.all(
      Array.from({ length: 6 }, (_, i) => saver.save(`task-${i}`, 'assess-quality', quality(i))),
    );
    const paths = saved.flatMap(s => s.files.map(f => f.path));
    expect(new Set(paths).size).toBe(paths.length);

    const index = JSON.parse(fs.readFileSync(
      path.join(baseDir, '.agentic-qe', 'results', 'index.json'), 'utf8'));
    expect(index.results.map((r: { id: string }) => r.id).sort())
      .toEqual(['task-0', 'task-1', 'task-2', 'task-3', 'task-4', 'task-5']);
  });

  it('names files with millisecond precision and a unique suffix', async () => {
    const result = await saver.save('task_abc', 'assess-quality', quality(1));
    const name = path.basename(result.files[0].path);
    expect(name).toMatch(/^2026-10-13T10-11-12-345_[a-z0-9_-]+_assessment\.json$/);
  });

  it('does not overwrite an earlier save that used the same custom prefix', async () => {
    const first = await saver.save('t1', 'assess-quality', quality(1), { filenamePrefix: 'fixed' });
    const second = await saver.save('t2', 'assess-quality', quality(2), { filenamePrefix: 'fixed' });

    expect(second.files[0].path).not.toBe(first.files[0].path);
    expect(path.basename(second.files[0].path)).toContain('fixed');
    expect(JSON.parse(fs.readFileSync(first.files[0].path, 'utf8')).qualityScore).toBe(1);
    expect(JSON.parse(fs.readFileSync(second.files[0].path, 'utf8')).qualityScore).toBe(2);
  });

  // Review of #1026 N7: numbered copies (add_unit-1.test.ts, -2, ...) piled up
  // in results/tests/generated/ and vitest's default include collected them.
  it('overwrites a generated test file with the same name instead of numbering it', async () => {
    const first = await saver.save('t1', 'generate-tests', RESULTS[3][1](1));
    const second = await saver.save('t2', 'generate-tests', RESULTS[3][1](2));

    const firstSource = first.files.find(f => f.format === 'source')!;
    const secondSource = second.files.find(f => f.format === 'source')!;
    expect(secondSource.path).toBe(firstSource.path);
    expect(fs.readFileSync(secondSource.path, 'utf8')).toBe('// run 2');
    const generated = fs.readdirSync(path.dirname(secondSource.path));
    expect(generated).toEqual([path.basename(secondSource.path)]);
  });
});
