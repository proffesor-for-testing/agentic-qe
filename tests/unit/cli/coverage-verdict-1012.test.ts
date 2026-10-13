/**
 * Issue #1012.2 (and the shared CLI verdict reused by `aqe ci`, #1010).
 *
 * With no coverage report on disk the CLI falls back to a static estimate.
 * JSON consumers must be able to tell that from a measurement: the result is
 * labelled `measured:false, estimated:true, coverageMethod`, carries no
 * threshold verdict, and exits 3 (UNMEASURED) — an estimate is not evidence.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  EXIT_UNMEASURED,
  coverageExitCode,
  coverageJson,
  evaluateCliCoverage,
  type CoverageAnalyzeAPI,
} from '../../../src/cli/utils/coverage-verdict';
import { coverageToMarkdown } from '../../../src/cli/utils/ci-output';

function istanbulEntry(file: string, total: number, covered: number, branches = false): Record<string, unknown> {
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  for (let i = 0; i < total; i++) {
    statementMap[String(i)] = { start: { line: i + 1, column: 0 }, end: { line: i + 1, column: 5 } };
    s[String(i)] = i < covered ? 1 : 0;
  }
  return {
    path: file, statementMap, s,
    branchMap: branches ? { 0: { type: 'if', line: 1, locations: [{ start: { line: 1 } }, { start: { line: 1 } }] } } : {},
    b: branches ? { 0: [1, 0] } : {},
    fnMap: { 0: { name: 'f', loc: { start: { line: 1 } } } }, f: { 0: 1 },
  };
}

/** A stand-in for the coverage domain that echoes the summary it is given. */
function fakeAnalyzer(): CoverageAnalyzeAPI & { analyze: ReturnType<typeof vi.fn> } {
  return {
    analyze: vi.fn(async (req: { coverageData: { summary: Record<string, number> }; threshold: number }) => ({
      success: true,
      value: {
        summary: req.coverageData.summary,
        meetsThreshold: false,
        recommendations: ['Coverage is 99.0% below threshold. Focus on high-risk files first.',
          'Branch coverage is significantly lower than line coverage.'],
      },
    })),
  };
}

describe('#1012.2 / #1010 — shared CLI coverage verdict', () => {
  let root: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1012-verdict-')));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"v"}');
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, 'lib'));
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n'.repeat(10));
    fs.writeFileSync(path.join(root, 'lib', 'b.ts'), 'export const b = 1;\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeReport(entries: Record<string, unknown>): void {
    fs.mkdirSync(path.join(root, 'coverage'), { recursive: true });
    fs.writeFileSync(path.join(root, 'coverage', 'coverage-final.json'), JSON.stringify(entries));
  }

  it('labels the no-report heuristic as an estimate, gives no verdict, exits UNMEASURED', async () => {
    const api = fakeAnalyzer();
    const outcome = await evaluateCliCoverage(api, root, 80);

    expect(outcome.kind).toBe('estimate');
    // The estimate is analyzed for display only, never as evidence.
    expect(api.analyze).toHaveBeenCalledWith(expect.objectContaining({ measured: false }));
    const json = coverageJson(outcome, 80, root) as Record<string, unknown>;
    expect(json).toMatchObject({
      measured: false, estimated: true, unmeasured: true,
      coverageMethod: 'static-estimation', meetsThreshold: null, threshold: 80,
    });
    expect((json.summary as Record<string, unknown>).line).toEqual(expect.any(Number));
    expect(coverageExitCode(outcome, 80)).toBe(EXIT_UNMEASURED);
  });

  it('a target the report does not cover is UNMEASURED (exit 3), not 0%', async () => {
    const a = path.join(root, 'src', 'a.ts');
    writeReport({ [a]: istanbulEntry(a, 10, 9) });
    const outcome = await evaluateCliCoverage(fakeAnalyzer(), path.join(root, 'lib'), 80);
    expect(outcome).toMatchObject({ kind: 'unmeasured', reason: 'target-not-covered' });
    expect(coverageJson(outcome, 80, path.join(root, 'lib'))).toMatchObject({
      summary: { line: null }, meetsThreshold: null, measured: false, unmeasured: true,
    });
    expect(coverageExitCode(outcome, 80)).toBe(EXIT_UNMEASURED);
  });

  it('judges a measured report on its collected metrics only, labelled measured', async () => {
    const a = path.join(root, 'src', 'a.ts');
    writeReport({ [a]: istanbulEntry(a, 10, 9) });  // no branch data
    const api = fakeAnalyzer();
    const outcome = await evaluateCliCoverage(api, path.join(root, 'src'), 80);

    expect(api.analyze).toHaveBeenCalledWith(expect.objectContaining({ measured: true }));
    expect(outcome.kind).toBe('measured');
    const json = coverageJson(outcome, 80, root) as Record<string, unknown>;
    expect(json).toMatchObject({
      measured: true, estimated: false, coverageMethod: 'instrumented-report',
      summary: { line: 90, branch: null, function: 100, statement: 90 },
      meetsThreshold: true,
    });
    // Advice about the uncollected metric and the 4-metric shortfall is dropped.
    expect((json.recommendations as string[]).join(' ')).not.toMatch(/branch|below threshold/i);
    expect(coverageExitCode(outcome, 80)).toBe(0);
    expect(coverageExitCode(outcome, 90)).toBe(2);
  });

  it('a measured shortfall exits 1', async () => {
    const a = path.join(root, 'src', 'a.ts');
    writeReport({ [a]: istanbulEntry(a, 10, 5, true) });
    const outcome = await evaluateCliCoverage(fakeAnalyzer(), path.join(root, 'src'), 80);
    expect(outcome.kind).toBe('measured');
    expect(coverageExitCode(outcome, 80)).toBe(1);
  });

  it('#1027 N7: an lcov report has no statement data — statement is null and out of the verdict', async () => {
    fs.mkdirSync(path.join(root, 'coverage'), { recursive: true });
    const da = Array.from({ length: 10 }, (_, i) => `DA:${i + 1},${i < 9 ? 1 : 0}`).join('\n');
    fs.writeFileSync(path.join(root, 'coverage', 'lcov.info'), `TN:\nSF:src/a.ts\n${da}\nLF:10\nLH:9\nend_of_record\n`);

    const api = fakeAnalyzer();
    const outcome = await evaluateCliCoverage(api, path.join(root, 'src'), 85);
    expect(outcome.kind).toBe('measured');
    if (outcome.kind !== 'measured') return;
    expect(outcome.summary).toMatchObject({ line: 90, branch: null, function: null, statement: null });
    // Judged on line alone (90 >= 85); an uncollected statement 0 would drag it to 45.
    expect(outcome.verdict).toMatchObject({ overall: 90, meetsThreshold: true });
    // Per-file records resolve the report's relative paths against the project root.
    expect(api.analyze).toHaveBeenCalledWith(expect.objectContaining({ projectRoot: root }));
  });

  it('#1027 N7: markdown rounds figures to one decimal', () => {
    const md = coverageToMarkdown({
      summary: { line: 33.33333333333333, branch: null, function: 66.66666666666667, statement: 33.33333333333333 },
      meetsThreshold: null, threshold: 80, estimated: true, warning: 'est',
    });
    expect(md).toContain('~33.3% (estimate)');
    expect(md).not.toMatch(/33\.333/);
  });

  it('a missing target is an error (exit 1)', async () => {
    const outcome = await evaluateCliCoverage(fakeAnalyzer(), path.join(root, 'nope'), 80);
    expect(outcome).toMatchObject({ kind: 'error', reason: 'target-missing' });
    expect(coverageExitCode(outcome, 80)).toBe(1);
  });
});
