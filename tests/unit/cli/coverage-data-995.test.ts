/**
 * Issue #995 (CLI parity) — `aqe coverage <target>` must read the instrumented
 * report of the target's project root, and must not invent 0% for a source
 * file the report never measured.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCoverageData, summarizeCoverage } from '../../../src/cli/utils/coverage-data';
import { EXIT_UNMEASURED, resolveCliCoverageData } from '../../../src/cli/commands/coverage';

function istanbulEntry(file: string, total: number, covered: number): Record<string, unknown> {
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  for (let i = 0; i < total; i++) {
    statementMap[String(i)] = { start: { line: i + 1 }, end: { line: i + 1 } };
    s[String(i)] = i < covered ? 1 : 0;
  }
  return { path: file, statementMap, s, branchMap: {}, b: {}, fnMap: {}, f: {} };
}

describe('#995 — CLI buildCoverageData', () => {
  let root: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-cli-')));
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, 'coverage'));
    fs.writeFileSync(path.join(root, 'src', 'measured.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'src', 'excluded.ts'), 'export const b = 2;\n');
    const measured = path.join(root, 'src', 'measured.ts');
    fs.writeFileSync(
      path.join(root, 'coverage', 'coverage-final.json'),
      JSON.stringify({ [measured]: istanbulEntry(measured, 4, 2) })
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reads the report from the given project root, not the cwd', () => {
    const data = buildCoverageData([path.join(root, 'src', 'measured.ts')], root);
    expect(data.instrumented).toBe(true);
    expect(data.summary.line).toBe(50);
  });

  it('reports a file absent from the report as unmeasured instead of 0%', () => {
    const files = [path.join(root, 'src', 'measured.ts'), path.join(root, 'src', 'excluded.ts')];
    const data = buildCoverageData(files, root);

    expect(data.files.map(f => path.basename(f.path))).toEqual(['measured.ts']);
    expect(data.unmeasuredFiles).toEqual([path.join(root, 'src', 'excluded.ts')]);
    expect(data.summary.line).toBe(50);
  });

  it('summarizeCoverage yields 0 (not NaN) for an empty file list', () => {
    expect(summarizeCoverage([])).toEqual({ line: 0, branch: 0, function: 0, statement: 0, files: 0 });
  });
});

describe('#995 review B2 — CLI uses the same verdict as MCP', () => {
  let root: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-cli-b2-')));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"b2"}');
    fs.mkdirSync(path.join(root, 'src', 'zero'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.mkdirSync(path.join(root, 'coverage'));
    const zero = path.join(root, 'src', 'zero', 'z.ts');
    const hit = path.join(root, 'src', 'hit.ts');
    fs.writeFileSync(zero, 'export const z = 0;\n');
    fs.writeFileSync(hit, 'export const h = 1;\n');
    fs.writeFileSync(path.join(root, 'scripts', 'tool.ts'), 'export const t = 1;\n');
    fs.writeFileSync(path.join(root, 'coverage', 'coverage-final.json'), JSON.stringify({
      [zero]: istanbulEntry(zero, 4, 0),
      [hit]: istanbulEntry(hit, 4, 4),
    }));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports a zero-hit file in the report as a measured 0%, not UNMEASURED', async () => {
    const res = await resolveCliCoverageData(path.join(root, 'src', 'zero'));
    expect(res.kind).toBe('data');
    if (res.kind === 'data') {
      expect(res.data.instrumented).toBe(true);
      expect(res.data.summary.line).toBe(0);
    }
  });

  it('reports a folder absent from the report as unmeasured', async () => {
    const res = await resolveCliCoverageData(path.join(root, 'scripts'));
    expect(res).toMatchObject({ kind: 'no-data', reason: 'target-not-covered' });
  });

  it('says "target does not exist" for a missing target', async () => {
    const res = await resolveCliCoverageData(path.join(root, 'nope'));
    expect(res).toMatchObject({ kind: 'no-data', reason: 'target-missing' });
    if (res.kind === 'no-data') expect(res.message).toMatch(/Target does not exist/);
  });

  it('says "unreadable coverage report" for a raw V8 report target', async () => {
    const v8 = path.join(root, 'coverage', 'v8', 'coverage-final.json');
    fs.mkdirSync(path.dirname(v8));
    fs.writeFileSync(v8, JSON.stringify({ result: [] }));
    const res = await resolveCliCoverageData(v8);
    expect(res).toMatchObject({ kind: 'no-data', reason: 'unreadable-report' });
    if (res.kind === 'no-data') expect(res.message).toMatch(/Unreadable coverage report/);
  });

  it('documents the UNMEASURED exit code as 3', () => {
    expect(EXIT_UNMEASURED).toBe(3);
  });
});
