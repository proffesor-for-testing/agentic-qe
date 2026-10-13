/**
 * Issue #1012 — one project, one "line" figure; the right runner named.
 *
 * 1. istanbul `coverage-final.json` (the auto-run path and any on-disk report)
 *    reported STATEMENTS as "line". Line coverage is per source line, derived
 *    from `statementMap` start lines exactly as istanbul's own summary does,
 *    so it agrees with coverage-summary.json `lines` and with lcov.info.
 * 3. A package whose test runner is declared only at the workspace root ran
 *    (and blamed) the vitest default instead of the root's runner.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseCoverageJson, parseLcovInfo } from '../../../../src/coordination/handlers/handler-utils';
import {
  buildJsCoverageInvocation,
  describeRunFailure,
  runnerBinDirs,
  type JsCoverageRun,
} from '../../../../src/coordination/handlers/coverage-runner';
import { summarizeCoverage } from '../../../../src/cli/utils/coverage-data';

/** Two statements on line 1 (hit), three on line 2 (miss), one on line 3 (hit). */
function istanbulMultiStatement(file: string): Record<string, unknown> {
  const at = (line: number) => ({ start: { line, column: 0 }, end: { line, column: 9 } });
  return {
    [file]: {
      path: file,
      statementMap: { 0: at(1), 1: at(1), 2: at(2), 3: at(2), 4: at(2), 5: at(3) },
      s: { 0: 1, 1: 1, 2: 0, 3: 0, 4: 0, 5: 4 },
      branchMap: {}, b: {}, fnMap: {}, f: {},
    },
  };
}

describe('#1012.1 — istanbul line coverage is per line, not per statement', () => {
  it('derives line coverage from statementMap start lines', () => {
    const data = parseCoverageJson(JSON.stringify(istanbulMultiStatement('/p/src/a.ts')));
    const [file] = data.files;
    expect(file.lines).toEqual({ covered: 2, total: 3 });
    expect(file.statements).toEqual({ covered: 3, total: 6 });
    expect(data.summary.line).toBeCloseTo(66.67, 1);
    expect(data.summary.statement).toBe(50);
    expect(file.uncoveredLines).toEqual([2]);
  });

  it('counts a line as covered when ANY statement on it ran (istanbul max-count rule)', () => {
    const report = istanbulMultiStatement('/p/src/a.ts');
    (report['/p/src/a.ts'] as { s: Record<string, number> }).s = { 0: 0, 1: 3, 2: 0, 3: 1, 4: 0, 5: 0 };
    const [file] = parseCoverageJson(JSON.stringify(report)).files;
    expect(file.lines).toEqual({ covered: 2, total: 3 });
    expect(file.uncoveredLines).toEqual([3]);
  });

  it('agrees with the lcov.info the same run writes (DA per line)', () => {
    const json = parseCoverageJson(JSON.stringify(istanbulMultiStatement('/p/src/a.ts')));
    const lcov = parseLcovInfo('SF:/p/src/a.ts\nDA:1,2\nDA:2,0\nDA:3,4\nLF:3\nLH:2\nend_of_record\n');
    expect(json.summary.line).toBeCloseTo(lcov.summary.line, 6);
    expect(json.files[0].lines).toEqual(lcov.files[0].lines);
  });

  it('CLI summarizeCoverage reports statements as statements, not as lines', () => {
    const [file] = parseCoverageJson(JSON.stringify(istanbulMultiStatement('/p/src/a.ts'))).files;
    const summary = summarizeCoverage([file]);
    expect(summary.line).toBe(67);
    expect(summary.statement).toBe(50);
  });
});

describe('#1027 N4 — the auto-run asks vitest for coverage even when tests fail', () => {
  it('passes --coverage.reportOnFailure so a failing suite still yields its (measured) report', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1027-n4-')));
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'n4', devDependencies: { vitest: '^5' } }));
      expect(buildJsCoverageInvocation(root, '/tmp/r').args).toContain('--coverage.reportOnFailure=true');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('#1012.3 — runner detection in monorepos', () => {
  let ws: string;
  let pkg: string;

  function install(dir: string, name: string, bin: string): void {
    const pkgDir = path.join(dir, 'node_modules', name);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name, bin: { [name]: bin } }));
    fs.mkdirSync(path.dirname(path.join(pkgDir, bin)), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, bin), '');
  }

  beforeEach(() => {
    ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1012-ws-')));
    pkg = path.join(ws, 'packages', 'core');
    fs.mkdirSync(pkg, { recursive: true });
    fs.mkdirSync(path.join(ws, '.git'));
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'core' }));
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it('uses jest declared only at the workspace root, and finds its hoisted bin', () => {
    fs.writeFileSync(path.join(ws, 'package.json'),
      JSON.stringify({ name: 'ws', private: true, workspaces: ['packages/*'], devDependencies: { jest: '^29' } }));
    install(ws, 'jest', 'bin/jest.js');

    const inv = buildJsCoverageInvocation(pkg, '/tmp/r');
    expect(inv.runner).toBe('jest');
    expect(inv.args[0]).toBe(path.join(ws, 'node_modules', 'jest', 'bin', 'jest.js'));
  });

  it("names the root's runner when it is declared but not installed", () => {
    fs.writeFileSync(path.join(ws, 'package.json'),
      JSON.stringify({ name: 'ws', workspaces: ['packages/*'], devDependencies: { jest: '^29' } }));
    const inv = buildJsCoverageInvocation(pkg, '/tmp/r');
    expect(inv.runner).toBe('jest');
    expect(inv.command).toBeNull();
  });

  it("the package's own declaration wins over the workspace root's", () => {
    fs.writeFileSync(path.join(ws, 'package.json'),
      JSON.stringify({ name: 'ws', workspaces: ['packages/*'], devDependencies: { jest: '^29' } }));
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'core', devDependencies: { vitest: '^5' } }));
    expect(buildJsCoverageInvocation(pkg, '/tmp/r').runner).toBe('vitest');
  });

  it('puts every hoisted node_modules/.bin on PATH (nyc → mocha), nearest first', () => {
    fs.mkdirSync(path.join(ws, 'node_modules', '.bin'), { recursive: true });
    fs.mkdirSync(path.join(pkg, 'node_modules', '.bin'), { recursive: true });
    expect(runnerBinDirs(pkg)).toEqual([
      path.join(pkg, 'node_modules', '.bin'),
      path.join(ws, 'node_modules', '.bin'),
    ]);
  });

  it("does not say 'not installed' under Yarn Plug'n'Play", () => {
    fs.writeFileSync(path.join(ws, '.pnp.cjs'), '');
    const run: JsCoverageRun = {
      runner: 'vitest', missing: true, exitCode: null, exitedCleanly: false, timedOut: false,
      timeoutMs: 1, data: null, numTotalTests: null, stderrTail: '',
    };
    const msg = describeRunFailure(run, pkg);
    expect(msg).toMatch(/Plug'n'Play/);
    expect(msg).not.toMatch(/is not installed/);
  });
});
