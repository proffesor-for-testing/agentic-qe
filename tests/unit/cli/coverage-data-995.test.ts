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
