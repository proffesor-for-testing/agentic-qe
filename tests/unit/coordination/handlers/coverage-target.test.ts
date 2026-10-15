/**
 * Regression tests for issue #995 — `coverage_analyze_sublinear` with a
 * subfolder or coverage-file target.
 *
 * Reported against a fresh vitest project:
 *   - target = project root  → correct numbers;
 *   - target = `src/`        → ran vitest FROM `src/`, wrote `src/coverage/`
 *                              (despite saveResults:false), reported 0%;
 *   - target = `coverage/lcov.info` → 'no data'.
 *
 * The handler tests below install a fake vitest in the fixture's node_modules. It records the
 * directory it was run from and writes a canned istanbul report into whatever
 * `--coverage.reportsDirectory` it was given (or `./coverage` when none) — the
 * same thing vitest does — so each assertion is about where the tool ran and
 * where it wrote, not about vitest itself.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  findCoverageProjectRoot,
  packageFilterForTarget,
  isCoverageReportFile,
  loadCoverageReportFile,
  scopeCoverageToTarget,
  evaluateCoverageForTarget,
  reconcileRecommendations,
  thresholdVerdict,
} from '../../../../src/coordination/handlers/coverage-target';
import { createTaskExecutor } from '../../../../src/coordination/task-executor';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator';
import type { CoverageData } from '../../../../src/domains/coverage-analysis/interfaces';

// Side-effect import: registers the coverage-analysis domain service factory.
import '../../../../src/domains/coverage-analysis';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MATH_TS = `export function add(a: number, b: number): number { return a + b; }
export function classify(n: number): string {
  if (n > 0) {
    return 'pos';
  }
  return 'non-pos';
}
`;

/** A fresh vitest project: package.json + .git at the root, code in src/, tests in tests/. */
function makeVitestProject(root: string): void {
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'r995', version: '1.0.0',
    devDependencies: { vitest: '3.2.4', '@vitest/coverage-v8': '3.2.4' },
  }));
  fs.writeFileSync(path.join(root, 'src', 'math.ts'), MATH_TS);
  fs.writeFileSync(path.join(root, 'tests', 'math.test.ts'), "import { add } from '../src/math';\n");
}

/** Istanbul coverage-final.json entry with `covered` of `total` one-line statements hit. */
function istanbulEntry(file: string, total: number, covered: number): Record<string, unknown> {
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  for (let i = 0; i < total; i++) {
    statementMap[String(i)] = { start: { line: i + 1, column: 0 }, end: { line: i + 1, column: 10 } };
    s[String(i)] = i < covered ? 1 : 0;
  }
  return {
    path: file, statementMap, s,
    fnMap: { '0': { name: 'f', loc: { start: { line: 1 }, end: { line: 1 } } } },
    f: { '0': covered > 0 ? 1 : 0 },
    branchMap: {}, b: {},
  };
}

function lcovRecord(file: string, total: number, covered: number): string {
  const da = Array.from({ length: total }, (_, i) => `DA:${i + 1},${i < covered ? 1 : 0}`).join('\n');
  return `TN:\nSF:${file}\nFNF:1\nFNH:${covered > 0 ? 1 : 0}\n${da}\nLF:${total}\nLH:${covered}\nBRF:2\nBRH:2\nend_of_record\n`;
}

// ---------------------------------------------------------------------------
// Unit: project-root resolution
// ---------------------------------------------------------------------------

describe('#995 — findCoverageProjectRoot', () => {
  let root: string;

  const savedAqeRoot = process.env.AQE_PROJECT_ROOT;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-root-')));
    makeVitestProject(root);
    // Workspace-root adoption is bounded by the AQE project root (#1036 review).
    process.env.AQE_PROJECT_ROOT = root;
  });

  afterEach(() => {
    if (savedAqeRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = savedAqeRoot;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves a subfolder target to the directory holding package.json', () => {
    expect(findCoverageProjectRoot(path.join(root, 'src'))).toBe(root);
  });

  it('resolves the project root to itself', () => {
    expect(findCoverageProjectRoot(root)).toBe(root);
  });

  it('resolves a file target to its project root', () => {
    expect(findCoverageProjectRoot(path.join(root, 'src', 'math.ts'))).toBe(root);
  });

  it('prefers the NEAREST package.json, so a monorepo package is its own root', () => {
    const pkg = path.join(root, 'packages', 'core');
    fs.mkdirSync(path.join(pkg, 'src'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"core"}');
    expect(findCoverageProjectRoot(path.join(pkg, 'src'))).toBe(pkg);
  });

  it('uses the workspace runner config when a nested package has no config', () => {
    const pkg = path.join(root, 'packages', 'core');
    fs.mkdirSync(path.join(pkg, 'src'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"core"}');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"workspace","workspaces":["packages/*"]}');
    fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}');

    expect(findCoverageProjectRoot(path.join(pkg, 'src'))).toBe(root);
  });

  describe('workspace root adoption is bounded and membership-checked (#1036 review)', () => {
    const makePkg = (dir: string, manifest = '{"name":"p"}') => {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), manifest);
    };
    it('never adopts a workspace root above AQE_PROJECT_ROOT (no .git in the project)', () => {
      // outer has a workspaces manifest + runner config; proj has neither .git nor a runner config.
      const outer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1036-outer-')));
      try {
        fs.writeFileSync(path.join(outer, 'package.json'), '{"workspaces":["whatever/*"]}');
        fs.writeFileSync(path.join(outer, 'vitest.config.cjs'), 'module.exports = {}');
        const proj = path.join(outer, 'proj');
        makePkg(proj);
        process.env.AQE_PROJECT_ROOT = proj;

        expect(findCoverageProjectRoot(path.join(proj, 'src'))).toBe(proj);
      } finally {
        fs.rmSync(outer, { recursive: true, force: true });
      }
    });

    it('does not climb from a workspace-root target to an enclosing workspace outside the project', () => {
      const outer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1036-outer2-')));
      try {
        fs.writeFileSync(path.join(outer, 'package.json'), '{"workspaces":["inner"]}');
        fs.writeFileSync(path.join(outer, 'vitest.config.ts'), 'export default {}');
        const inner = path.join(outer, 'inner');
        makePkg(inner, '{"workspaces":["pkgs/*"]}');
        process.env.AQE_PROJECT_ROOT = inner;

        expect(findCoverageProjectRoot(path.join(inner, 'src'))).toBe(inner);
      } finally {
        fs.rmSync(outer, { recursive: true, force: true });
      }
    });

    it('does not adopt a root whose workspaces do not list the package (non-member)', () => {
      fs.writeFileSync(path.join(root, 'package.json'), '{"workspaces":["packages/*"]}');
      fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}');
      const stray = path.join(root, 'tools', 'foo');
      makePkg(stray);
      expect(findCoverageProjectRoot(path.join(stray, 'src'))).toBe(stray);
    });

    it('ignores workspace patterns that escape the root (".." or absolute)', () => {
      fs.writeFileSync(path.join(root, 'package.json'),
        JSON.stringify({ workspaces: ['../*', path.join(root, 'tools', '*'), 'tools/../tools/*'] }));
      fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}');
      const stray = path.join(root, 'tools', 'foo');
      makePkg(stray);
      expect(findCoverageProjectRoot(path.join(stray, 'src'))).toBe(stray);
    });

    it('keeps a package that declares a different runner (jest under a vitest root) at the package', () => {
      fs.writeFileSync(path.join(root, 'package.json'),
        JSON.stringify({ workspaces: ['packages/*'], devDependencies: { vitest: '*' } }));
      fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}');
      const jestPkg = path.join(root, 'packages', 'j');
      makePkg(jestPkg, JSON.stringify({ name: 'j', devDependencies: { jest: '^29.7.0' } }));
      expect(findCoverageProjectRoot(path.join(jestPkg, 'src'))).toBe(jestPkg);
    });

    it('keeps a mocha package (.mocharc) at the package under a vitest root', () => {
      fs.writeFileSync(path.join(root, 'package.json'),
        JSON.stringify({ workspaces: ['packages/*'], devDependencies: { vitest: '*' } }));
      fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}');
      const mochaPkg = path.join(root, 'packages', 'm');
      makePkg(mochaPkg);
      fs.writeFileSync(path.join(mochaPkg, '.mocharc.json'), '{}');
      expect(findCoverageProjectRoot(path.join(mochaPkg, 'src'))).toBe(mochaPkg);
    });

    it('still adopts the root for a package declaring the same runner as the root', () => {
      fs.writeFileSync(path.join(root, 'package.json'),
        JSON.stringify({ workspaces: ['packages/*'], devDependencies: { vitest: '*' } }));
      fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}');
      const same = path.join(root, 'packages', 's');
      makePkg(same, JSON.stringify({ name: 's', devDependencies: { vitest: '*' } }));
      expect(findCoverageProjectRoot(path.join(same, 'src'))).toBe(root);
    });

    it('honours negated workspace patterns', () => {
      fs.writeFileSync(path.join(root, 'package.json'), '{"workspaces":["packages/*","!packages/skip"]}');
      fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}');
      const skip = path.join(root, 'packages', 'skip');
      const keep = path.join(root, 'packages', 'keep');
      makePkg(skip);
      makePkg(keep);
      expect(findCoverageProjectRoot(path.join(skip, 'src'))).toBe(skip);
      expect(findCoverageProjectRoot(path.join(keep, 'src'))).toBe(root);
    });

    it('resolves pnpm-workspace.yaml packages and the { packages: [] } workspaces form', () => {
      fs.writeFileSync(path.join(root, 'package.json'), '{"name":"ws"}');
      fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'libs/**'\n  - \"apps/*\" # comment\n");
      fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}');
      const deep = path.join(root, 'libs', 'a', 'b');
      const app = path.join(root, 'apps', 'web');
      const other = path.join(root, 'other', 'x');
      makePkg(deep); makePkg(app); makePkg(other);
      expect(findCoverageProjectRoot(path.join(deep, 'src'))).toBe(root);
      expect(findCoverageProjectRoot(path.join(app, 'src'))).toBe(root);
      expect(findCoverageProjectRoot(path.join(other, 'src'))).toBe(other);

      fs.rmSync(path.join(root, 'pnpm-workspace.yaml'));
      fs.writeFileSync(path.join(root, 'package.json'), '{"workspaces":{"packages":["apps/*"]}}');
      expect(findCoverageProjectRoot(path.join(app, 'src'))).toBe(root);
    });

    it('treats an inline "jest" key in the package manifest as its own runner config', () => {
      fs.writeFileSync(path.join(root, 'package.json'), '{"workspaces":["packages/*"]}');
      fs.writeFileSync(path.join(root, 'jest.config.js'), 'module.exports = {}');
      const pkg = path.join(root, 'packages', 'p');
      makePkg(pkg, '{"name":"p","jest":{"testEnvironment":"node"}}');
      expect(findCoverageProjectRoot(path.join(pkg, 'src'))).toBe(pkg);
    });

    it('packageFilterForTarget names the nested package so only its tests run', () => {
      const pkg = path.join(root, 'packages', 'a');
      makePkg(pkg);
      expect(packageFilterForTarget(path.join(pkg, 'src'), root)).toBe('packages/a/');
      fs.writeFileSync(path.join(pkg, 'src', 'x.ts'), '');
      expect(packageFilterForTarget(path.join(pkg, 'src', 'x.ts'), root)).toBe('packages/a/');
      expect(packageFilterForTarget(root, root)).toBeNull();
      expect(packageFilterForTarget(path.join(root, 'src'), root)).toBeNull();
    });
  });

  it('keeps a nested package with its own runner config', () => {
    const pkg = path.join(root, 'packages', 'core');
    fs.mkdirSync(path.join(pkg, 'src'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"core"}');
    fs.writeFileSync(path.join(pkg, 'vitest.config.ts'), 'export default {}');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"workspace","workspaces":["packages/*"]}');
    fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}');

    expect(findCoverageProjectRoot(path.join(pkg, 'src'))).toBe(pkg);
  });

  it('stops at a .git boundary when there is no package.json', () => {
    fs.rmSync(path.join(root, 'package.json'));
    expect(findCoverageProjectRoot(path.join(root, 'src'))).toBe(root);
  });

  it('returns null for a target that does not exist', () => {
    expect(findCoverageProjectRoot(path.join(root, 'no-such-dir'))).toBeNull();
  });

  it('does not let a stray package.json in $HOME claim a directory beneath it', () => {
    // os.homedir() honours $HOME, so a temp dir stands in for the real home.
    const fakeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-home-')));
    const originalHome = process.env.HOME;
    try {
      fs.writeFileSync(path.join(fakeHome, 'package.json'), '{"name":"stray"}');
      const loose = path.join(fakeHome, 'scratch', 'notes');
      fs.mkdirSync(loose, { recursive: true });
      process.env.HOME = fakeHome;

      expect(findCoverageProjectRoot(loose)).toBeNull();
      // ...while $HOME itself, when targeted directly, is still its own root.
      expect(findCoverageProjectRoot(fakeHome)).toBe(fakeHome);
    } finally {
      if (originalHome === undefined) delete process.env.HOME; else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Unit: coverage-file targets
// ---------------------------------------------------------------------------

describe('#995 — coverage report files as targets', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-report-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('recognises the standard coverage report file names', () => {
    for (const name of ['lcov.info', 'coverage-final.json', 'coverage-summary.json', 'coverage.xml', 'cobertura-coverage.xml']) {
      expect(isCoverageReportFile(path.join(dir, 'coverage', name)), name).toBe(true);
    }
    expect(isCoverageReportFile(path.join(dir, 'src', 'math.ts'))).toBe(false);
    expect(isCoverageReportFile(path.join(dir, 'package.json'))).toBe(false);
  });

  it('parses an lcov.info file', async () => {
    const file = path.join(dir, 'lcov.info');
    fs.writeFileSync(file, lcovRecord('src/math.ts', 6, 3));
    const data = await loadCoverageReportFile(file);
    expect(data?.files.map(f => f.path)).toEqual(['src/math.ts']);
    expect(data?.files[0].lines).toEqual({ covered: 3, total: 6 });
    expect(data?.files[0].uncoveredLines).toEqual([4, 5, 6]);
  });

  it('parses a coverage-final.json file', async () => {
    const file = path.join(dir, 'coverage-final.json');
    fs.writeFileSync(file, JSON.stringify({ '/p/src/math.ts': istanbulEntry('/p/src/math.ts', 4, 1) }));
    const data = await loadCoverageReportFile(file);
    expect(data?.files[0].path).toBe('/p/src/math.ts');
    expect(data?.files[0].lines).toEqual({ covered: 1, total: 4 });
  });

  it('parses a coverage-summary.json file (per-file totals, no line detail)', async () => {
    const file = path.join(dir, 'coverage-summary.json');
    const pct = (covered: number, total: number) => ({ total, covered, skipped: 0, pct: (covered / total) * 100 });
    fs.writeFileSync(file, JSON.stringify({
      total: { lines: pct(3, 6), statements: pct(3, 6), functions: pct(1, 3), branches: pct(2, 2) },
      '/p/src/math.ts': { lines: pct(3, 6), statements: pct(3, 6), functions: pct(1, 3), branches: pct(2, 2) },
    }));
    const data = await loadCoverageReportFile(file);
    expect(data?.files.map(f => f.path)).toEqual(['/p/src/math.ts']);
    expect(data?.files[0].functions).toEqual({ covered: 1, total: 3 });
    expect(data?.files[0].branches).toEqual({ covered: 2, total: 2 });
  });

  it('returns null for an unreadable or empty report', async () => {
    expect(await loadCoverageReportFile(path.join(dir, 'missing', 'lcov.info'))).toBeNull();
    const empty = path.join(dir, 'lcov.info');
    fs.writeFileSync(empty, '');
    expect(await loadCoverageReportFile(empty)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit: scoping a project-wide report to the requested target
// ---------------------------------------------------------------------------

describe('#995 — scopeCoverageToTarget', () => {
  const root = '/proj';
  const file = (p: string, covered = 1) => ({
    path: p,
    lines: { covered, total: 2 }, branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 }, statements: { covered, total: 2 },
    uncoveredLines: [], uncoveredBranches: [],
  });
  const data: CoverageData = {
    files: [file('/proj/src/a.ts'), file('src/b.ts'), file('/proj/lib/c.ts'), file('/proj/srcx/d.ts')],
    summary: { line: 0, branch: 0, function: 0, statement: 0, files: 4 },
  };

  it('keeps absolute and root-relative entries under the target only', () => {
    const scoped = scopeCoverageToTarget(data, root, '/proj/src');
    expect(scoped.map(f => f.path)).toEqual(['/proj/src/a.ts', 'src/b.ts']);
  });

  it('does not treat a sibling with a shared prefix (srcx/) as inside src/', () => {
    const scoped = scopeCoverageToTarget(data, root, '/proj/src');
    expect(scoped.some(f => f.path.includes('srcx'))).toBe(false);
  });

  it('scopes to a single file target', () => {
    expect(scopeCoverageToTarget(data, root, '/proj/src/b.ts').map(f => f.path)).toEqual(['src/b.ts']);
  });

  it('keeps everything when the target is the root', () => {
    expect(scopeCoverageToTarget(data, root, root)).toHaveLength(4);
  });

});

describe('#995 review NB-A — verdict and shortfall advice agree', () => {
  const analyzerShortfall = 'Coverage is 35.0% below threshold. Focus on high-risk files first.';

  it('drops the analyzer shortfall line for a line-only report that MEETS the threshold', () => {
    // lcov with line data only: line=statement=90, branch=function=0 (uncollected).
    const collected = { branch: false, function: false };
    const verdict = thresholdVerdict({ line: 90, branch: 0, function: 0, statement: 90 }, 80, collected);
    expect(verdict.meetsThreshold).toBe(true);
    const recs = reconcileRecommendations(
      [analyzerShortfall, 'Branch coverage is significantly lower than line coverage.', 'Add tests for src/a.ts'],
      verdict, 80, collected);
    expect(recs).toEqual(['Add tests for src/a.ts']);
  });

  it('drops the shortfall line for an istanbul report with no branches that MEETS the threshold', () => {
    const collected = { branch: false, function: true };
    const verdict = thresholdVerdict({ line: 90, branch: 0, function: 100, statement: 90 }, 80, collected);
    expect(verdict.meetsThreshold).toBe(true);
    expect(reconcileRecommendations(['Coverage is 5.0% below threshold. Focus on high-risk files first.'], verdict, 80, collected))
      .toEqual([]);
  });

  it('recomputes the shortfall from the collected metrics when the threshold is NOT met', () => {
    const collected = { branch: false, function: false };
    const verdict = thresholdVerdict({ line: 60, branch: 0, function: 0, statement: 60 }, 80, collected);
    expect(reconcileRecommendations([analyzerShortfall], verdict, 80, collected))
      .toEqual(['Coverage is 20.0% below threshold. Focus on high-risk files first.']);
  });
});

describe('#995 review — evaluateCoverageForTarget (the one verdict MCP and CLI share)', () => {
  const root = '/proj';
  const file = (p: string, covered: number) => ({
    path: p,
    lines: { covered, total: 4 }, branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 }, statements: { covered, total: 4 },
    uncoveredLines: [], uncoveredBranches: [],
  });
  const report = (files: ReturnType<typeof file>[]): CoverageData => ({
    files, summary: { line: 0, branch: 0, function: 0, statement: 0, files: files.length },
  });

  it('a file listed with 0 hits is a MEASURED 0%, not unmeasured (B2/B3)', () => {
    const verdict = evaluateCoverageForTarget(
      report([file('/proj/src/zero.ts', 0), file('/proj/lib/hit.ts', 4)]), root, '/proj/src/zero.ts'
    );
    expect(verdict).toEqual({ status: 'measured', files: [file('/proj/src/zero.ts', 0)] });
  });

  it('an all-zero report is still a measurement when the runner says tests ran', () => {
    const verdict = evaluateCoverageForTarget(report([file('/proj/src/a.ts', 0)]), root, '/proj/src', { numTotalTests: 3 });
    expect(verdict.status).toBe('measured');
  });

  it('is unmeasured when the runner itself reports 0 tests', () => {
    const verdict = evaluateCoverageForTarget(report([file('/proj/src/a.ts', 0)]), root, '/proj/src', { numTotalTests: 0 });
    expect(verdict).toEqual({ status: 'no-data', reason: 'no-tests-ran' });
  });

  it('is unmeasured when the report has no entry under the target', () => {
    const verdict = evaluateCoverageForTarget(report([file('/proj/lib/hit.ts', 4)]), root, '/proj/src');
    expect(verdict).toEqual({ status: 'no-data', reason: 'target-not-covered' });
  });

  it('reports a test-only scope as test-only, never as the test files\' coverage', () => {
    const verdict = evaluateCoverageForTarget(report([file('/proj/tests/a.test.ts', 4)]), root, root);
    expect(verdict).toEqual({ status: 'no-data', reason: 'test-only-report' });
  });
});

describe('#995 review N5 — unreadable reports', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-n5-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('rejects raw V8 output instead of inventing a file called "result"', async () => {
    const file = path.join(dir, 'coverage-final.json');
    fs.writeFileSync(file, JSON.stringify({ result: [{ scriptId: '1', url: 'file:///a.js', functions: [] }] }));
    expect(await loadCoverageReportFile(file)).toBeNull();
  });

  it('rejects malformed JSON and arbitrary objects', async () => {
    const bad = path.join(dir, 'coverage-final.json');
    fs.writeFileSync(bad, '{ not json');
    expect(await loadCoverageReportFile(bad)).toBeNull();
    fs.writeFileSync(bad, JSON.stringify({ hello: 'world' }));
    expect(await loadCoverageReportFile(bad)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// End-to-end through the analyze-coverage handler
// ---------------------------------------------------------------------------

function createKernel() {
  const store = new Map<string, unknown>();
  return {
    memory: {
      initialize: vi.fn(async () => {}), dispose: vi.fn(async () => {}),
      store: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
      set: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
      retrieve: vi.fn(async (k: string) => store.get(k) ?? null),
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      delete: vi.fn(async (k: string) => { store.delete(k); }),
      list: vi.fn(async () => [...store.keys()]),
      search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), query: vi.fn(async () => []),
    },
    eventBus: {
      publish: vi.fn(async () => {}),
      subscribe: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      subscribeToChannel: vi.fn(() => ({ unsubscribe: () => {}, active: true })),
      getHistory: vi.fn(async () => []), dispose: vi.fn(async () => {}),
    },
    agentCoordinator: { spawn: vi.fn(), list: vi.fn(async () => []), dispose: vi.fn(async () => {}) },
    initialize: vi.fn(async () => {}), dispose: vi.fn(async () => {}),
  };
}

async function analyze(target: string, resultsDir: string): Promise<Record<string, unknown>> {
  const executor = createTaskExecutor(createKernel() as never, {
    saveResults: false, resultsDir,
    defaultLanguage: 'typescript', defaultFramework: 'vitest',
  });
  const result = await executor.execute({
    id: `task-995-${Date.now()}`, type: 'analyze-coverage', priority: 'p1', targetDomains: [],
    payload: { target, detectGaps: true, saveResults: false }, timeout: 60000, createdAt: new Date(),
  } as unknown as QueenTask);
  expect(result.success).toBe(true);
  return result.data as Record<string, unknown>;
}

/** Every file path under `dir`, relative to it. */
function listTree(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return out.sort();
}

describe('#995 — analyze-coverage on subfolder and coverage-file targets', () => {
  let root: string;
  let binDir: string;
  let cwdMarker: string;
  let cannedReport: string;
  let numTestsFile: string;
  let behaviourFile: string;
  /**
   * Fake vitest installed in the fixture's node_modules (the runner resolves
   * `node_modules/vitest` and starts its bin with `process.execPath` — no npx,
   * no shell). It records its cwd, then writes the canned report and a
   * runner result where it was told to: `--coverage.reportsDirectory=` and
   * `--outputFile=`. `behaviour` lets a test make it crash or hang.
   */
  function installFakeVitest(): void {
    const pkgDir = path.join(root, 'node_modules', 'vitest');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'vitest', bin: { vitest: './vitest.mjs' } }));
    fs.writeFileSync(path.join(pkgDir, 'vitest.mjs'), `import fs from 'node:fs';
import path from 'node:path';
fs.appendFileSync(${JSON.stringify(cwdMarker)}, process.cwd() + '\\n');
const behaviour = fs.existsSync(${JSON.stringify(behaviourFile)}) ? fs.readFileSync(${JSON.stringify(behaviourFile)}, 'utf-8').trim() : 'ok';
if (behaviour === 'crash') { process.stderr.write('Error: Cannot find module ./setup.ts\\n'); process.exit(1); }
let out = 'coverage';
let results = '';
for (const a of process.argv.slice(2)) {
  const eq = a.indexOf('=');
  if (eq === -1) continue;
  const key = a.slice(0, eq);
  if (key === '--coverage.reportsDirectory') out = a.slice(eq + 1);
  else if (key === '--outputFile') results = a.slice(eq + 1);
}
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(${JSON.stringify(cannedReport)}, path.join(out, 'coverage-final.json'));
if (results) {
  const n = fs.existsSync(${JSON.stringify(numTestsFile)}) ? Number(fs.readFileSync(${JSON.stringify(numTestsFile)}, 'utf-8')) : 1;
  fs.writeFileSync(results, JSON.stringify({ numTotalTests: n, success: true }));
}
`);
  }

  function writeCannedReport(entries: Record<string, unknown>): void {
    fs.writeFileSync(cannedReport, JSON.stringify(entries));
  }

  let savedAqeRoot: string | undefined;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-e2e-')));
    makeVitestProject(root);
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-bin-'));
    cwdMarker = path.join(binDir, 'cwd.log');
    cannedReport = path.join(binDir, 'canned.json');
    numTestsFile = path.join(binDir, 'num-tests');
    behaviourFile = path.join(binDir, 'behaviour');
    const mathPath = path.join(root, 'src', 'math.ts');
    writeCannedReport({ [mathPath]: istanbulEntry(mathPath, 6, 3) });
    installFakeVitest();
    delete process.env.AQE_COVERAGE_NO_EXEC;
    savedAqeRoot = process.env.AQE_PROJECT_ROOT;
    process.env.AQE_PROJECT_ROOT = root;
  });

  afterEach(() => {
    if (savedAqeRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = savedAqeRoot;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  });

  it('runs the coverage tool from the project root when the target is src/', async () => {
    const data = await analyze(path.join(root, 'src'), root);

    expect(fs.readFileSync(cwdMarker, 'utf-8').trim()).toBe(root);
    expect(data.measured).toBe(true);
    expect(data.lineCoverage).toBe(50);
    expect((data.coverageByFile as Array<{ file: string }>).map(f => f.file))
      .toEqual([path.join(root, 'src', 'math.ts')]);
  }, 60000);

  it('runs from a root-only workspace config for a nested package target', async () => {
    const pkg = path.join(root, 'packages', 'core');
    const source = path.join(pkg, 'src', 'math.ts');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, MATH_TS);
    fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"core"}');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"workspace","workspaces":["packages/*"]}');
    fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}');
    writeCannedReport({ [source]: istanbulEntry(source, 6, 4) });

    const data = await analyze(path.join(pkg, 'src'), root);

    expect(fs.readFileSync(cwdMarker, 'utf-8').trim()).toBe(root);
    expect(data.measured).toBe(true);
    expect(data.lineCoverage).toBeCloseTo(66.67, 1);
  }, 60000);

  it('reads an existing workspace report for a nested package target', async () => {
    const pkg = path.join(root, 'packages', 'core');
    const source = path.join(pkg, 'src', 'math.ts');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, MATH_TS);
    fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"core"}');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"workspace","workspaces":["packages/*"]}');
    fs.writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {}');
    fs.mkdirSync(path.join(root, 'coverage'));
    fs.writeFileSync(path.join(root, 'coverage', 'lcov.info'),
      lcovRecord('packages/core/src/math.ts', 6, 4));

    const data = await analyze(path.join(pkg, 'src'), root);

    expect(fs.existsSync(cwdMarker), 'existing workspace report should avoid a test run').toBe(false);
    expect(data.measured).toBe(true);
    expect(data.lineCoverage).toBeCloseTo(66.67, 1);
  }, 60000);

  it('writes nothing into the source tree — no src/coverage, no root coverage/', async () => {
    const before = listTree(root);
    await analyze(path.join(root, 'src'), root);

    expect(fs.existsSync(path.join(root, 'src', 'coverage'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'coverage'))).toBe(false);
    expect(listTree(root)).toEqual(before);
  }, 60000);

  it('still analyses the project root target correctly', async () => {
    const data = await analyze(root, root);

    expect(fs.readFileSync(cwdMarker, 'utf-8').trim()).toBe(root);
    expect(data.measured).toBe(true);
    expect(data.lineCoverage).toBe(50);
    const gaps = data.gaps as Array<{ lines: number[] }>;
    expect(gaps.flatMap(g => g.lines)).toEqual([4, 5, 6]);
  }, 60000);

  it('scopes a project-wide run to the files under the subfolder target', async () => {
    const other = path.join(root, 'lib', 'other.ts');
    const mathPath = path.join(root, 'src', 'math.ts');
    writeCannedReport({
      [mathPath]: istanbulEntry(mathPath, 6, 3),
      [other]: istanbulEntry(other, 10, 10),
    });

    const data = await analyze(path.join(root, 'src'), root);

    expect((data.coverageByFile as Array<{ file: string }>).map(f => f.file)).toEqual([mathPath]);
    expect(data.lineCoverage).toBe(50);
    expect(data.totalFiles).toBe(1);
  }, 60000);

  it('accepts an existing coverage/lcov.info file as the target, without running tests', async () => {
    fs.mkdirSync(path.join(root, 'coverage'));
    const lcov = path.join(root, 'coverage', 'lcov.info');
    fs.writeFileSync(lcov, lcovRecord('src/math.ts', 6, 3));

    const data = await analyze(lcov, root);

    expect(fs.existsSync(cwdMarker), 'tests were run for a coverage-file target').toBe(false);
    expect(data.measured).toBe(true);
    expect(data.coverageMethod).toBe('instrumented-report');
    expect(data.lineCoverage).toBe(50);
    expect(data.branchCoverage).toBe(100);
    expect((data.coverageByFile as Array<{ file: string }>).map(f => f.file)).toEqual(['src/math.ts']);
  }, 60000);

  it('accepts a coverage-final.json file as the target', async () => {
    fs.mkdirSync(path.join(root, 'coverage'));
    const report = path.join(root, 'coverage', 'coverage-final.json');
    fs.copyFileSync(cannedReport, report);

    const data = await analyze(report, root);

    expect(fs.existsSync(cwdMarker)).toBe(false);
    expect(data.measured).toBe(true);
    expect(data.lineCoverage).toBe(50);
  }, 60000);

  it('reports a subfolder the run did not cover as unmeasured, not 0%', async () => {
    const other = path.join(root, 'lib', 'other.ts');
    writeCannedReport({ [other]: istanbulEntry(other, 10, 10) });

    const data = await analyze(path.join(root, 'src'), root);

    expect(data.lineCoverage).toBeNull();
    expect(data.measured).toBe(false);
    expect(data.estimated).toBe(false);
    expect(data.unmeasured).toBe(true);
    expect(String(data.warning)).toMatch(/unmeasured|did not cover/i);
  }, 60000);

  it('reports a zero-hit file from a run that DID run tests as a measured 0% (review B3)', async () => {
    // A passing test that never imports src/: vitest lists math.ts at 0%.
    const mathPath = path.join(root, 'src', 'math.ts');
    writeCannedReport({ [mathPath]: istanbulEntry(mathPath, 6, 0) });
    fs.writeFileSync(numTestsFile, '1');

    const data = await analyze(path.join(root, 'src'), root);

    expect(data.measured).toBe(true);
    expect(data.lineCoverage).toBe(0);
    expect(data.unmeasured).toBeUndefined();
  }, 60000);

  it('reports unmeasured when the runner itself says it ran 0 tests', async () => {
    const mathPath = path.join(root, 'src', 'math.ts');
    writeCannedReport({ [mathPath]: istanbulEntry(mathPath, 6, 0) });
    fs.writeFileSync(numTestsFile, '0');

    const data = await analyze(path.join(root, 'src'), root);

    expect(data.lineCoverage).toBeNull();
    expect(data.unmeasured).toBe(true);
    expect(String(data.warning)).toMatch(/0 tests/);
  }, 60000);

  it('treats an all-zero lcov.info passed as the target as a measured 0% (review B3)', async () => {
    fs.mkdirSync(path.join(root, 'coverage'));
    const lcov = path.join(root, 'coverage', 'lcov.info');
    fs.writeFileSync(lcov, lcovRecord('src/math.ts', 6, 0));

    const data = await analyze(lcov, root);

    expect(data.measured).toBe(true);
    expect(data.lineCoverage).toBe(0);
  }, 60000);

  it('says "unreadable coverage report" for a raw V8 report target (review N5)', async () => {
    fs.mkdirSync(path.join(root, 'coverage'));
    const v8 = path.join(root, 'coverage', 'coverage-final.json');
    fs.writeFileSync(v8, JSON.stringify({ result: [{ scriptId: '1', url: 'file:///x.js', functions: [] }] }));

    const data = await analyze(v8, root);

    expect(data.measured).toBe(false);
    expect(String(data.warning)).toMatch(/Unreadable coverage report/);
  }, 60000);

  it('fails with "target does not exist" for a missing target (review N5)', async () => {
    const executor = createTaskExecutor(createKernel() as never, {
      saveResults: false, resultsDir: root, defaultLanguage: 'typescript', defaultFramework: 'vitest',
    });
    const result = await executor.execute({
      id: 'task-995-missing', type: 'analyze-coverage', priority: 'p1', targetDomains: [],
      payload: { target: path.join(root, 'no-such-dir'), detectGaps: true }, timeout: 60000, createdAt: new Date(),
    } as unknown as QueenTask);

    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/Target does not exist/);
    expect(fs.existsSync(cwdMarker)).toBe(false);
  }, 60000);

  it('passes a $(...) in TMPDIR to the runner as data, never to a shell (review N3)', async () => {
    const hostileTmp = path.join(binDir, 'tmp-$(touch pwned)');
    fs.mkdirSync(hostileTmp);
    const originalTmp = process.env.TMPDIR;
    process.env.TMPDIR = hostileTmp;
    try {
      const data = await analyze(path.join(root, 'src'), root);
      expect(data.measured).toBe(true);
    } finally {
      if (originalTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = originalTmp;
    }
    expect(fs.existsSync(path.join(root, 'pwned'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src', 'pwned'))).toBe(false);
    // ...and the private report dir was removed.
    expect(fs.readdirSync(hostileTmp)).toEqual([]);
  }, 60000);

  it('reports an EMPTY report from a run that ran tests as UNMEASURED, not an estimate (review BL2)', async () => {
    // vitest default config, tests that import no src: coverage-final.json is {}.
    writeCannedReport({});
    fs.writeFileSync(numTestsFile, '1');

    const data = await analyze(path.join(root, 'src'), root);

    expect(data.estimated).toBe(false);
    expect(data.coverageMethod).toBe('none');
    expect(data.unmeasured).toBe(true);
    expect(String(data.warning)).not.toMatch(/No instrumentation ran/);
  }, 60000);

  it('names the crash and its stderr instead of "No instrumentation ran" (review NB4)', async () => {
    fs.writeFileSync(behaviourFile, 'crash');

    const data = await analyze(path.join(root, 'src'), root);

    expect(data.estimated).toBe(true);
    expect(String(data.warning)).toMatch(/exited with code 1.*Cannot find module \.\/setup\.ts/);
    expect(String(data.warning)).not.toMatch(/No instrumentation ran/);
  }, 60000);

  it('reports a runner that is not installed and never downloads one (review NB6)', async () => {
    fs.rmSync(path.join(root, 'node_modules'), { recursive: true, force: true });
    // An npx on PATH would download vitest; it must not be called at all.
    const npxMarker = path.join(binDir, 'npx-called');
    fs.writeFileSync(path.join(binDir, 'npx'), `#!/bin/sh\necho called > ${JSON.stringify(npxMarker)}\n`);
    fs.chmodSync(path.join(binDir, 'npx'), 0o755);
    const originalPath = process.env.PATH;
    process.env.PATH = `${binDir}:${originalPath}`;
    try {
      const data = await analyze(path.join(root, 'src'), root);
      expect(String(data.warning)).toMatch(/vitest is not installed/);
    } finally {
      process.env.PATH = originalPath;
    }
    expect(fs.existsSync(npxMarker)).toBe(false);
    expect(fs.existsSync(cwdMarker)).toBe(false);
  }, 60000);

  it('MCP: a line-only lcov at 90% meets an 80% threshold with no contradicting advice (NB-A)', async () => {
    fs.mkdirSync(path.join(root, 'coverage'));
    const lcov = path.join(root, 'coverage', 'lcov.info');
    const da = Array.from({ length: 10 }, (_, i) => `DA:${i + 1},${i < 9 ? 1 : 0}`).join('\n');
    fs.writeFileSync(lcov, `TN:\nSF:src/math.ts\n${da}\nLF:10\nLH:9\nend_of_record\n`);

    const data = await analyze(lcov, root);

    expect(data.lineCoverage).toBe(90);
    expect(data.branchCoverage).toBeNull();
    expect(data.functionCoverage).toBeNull();
    expect(data.meetsThreshold).toBe(true);
    expect((data.recommendations as string[]).some(r => /below threshold/i.test(r))).toBe(false);
  }, 60000);

  it('reads an existing root report for a subfolder target instead of re-running', async () => {
    fs.mkdirSync(path.join(root, 'coverage'));
    fs.writeFileSync(path.join(root, 'coverage', 'lcov.info'), lcovRecord('src/math.ts', 6, 3));

    const data = await analyze(path.join(root, 'src'), root);

    expect(fs.existsSync(cwdMarker)).toBe(false);
    expect(data.measured).toBe(true);
    expect(data.lineCoverage).toBe(50);
  }, 60000);
});
