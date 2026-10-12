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
 * The handler tests below put a fake `npx` first on PATH. It records the
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
  isCoverageReportFile,
  loadCoverageReportFile,
  scopeCoverageToTarget,
  hasExecutedCode,
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

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-root-')));
    makeVitestProject(root);
  });

  afterEach(() => {
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

  it('stops at a .git boundary when there is no package.json', () => {
    fs.rmSync(path.join(root, 'package.json'));
    expect(findCoverageProjectRoot(path.join(root, 'src'))).toBe(root);
  });

  it('returns null for a target that does not exist', () => {
    expect(findCoverageProjectRoot(path.join(root, 'no-such-dir'))).toBeNull();
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

  it('hasExecutedCode is false only when no line or function was hit anywhere', () => {
    expect(hasExecutedCode(data.files)).toBe(true);
    expect(hasExecutedCode([file('/proj/src/a.ts', 0)])).toBe(false);
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
  const originalPath = process.env.PATH;

  /**
   * Fake `npx`: records its cwd, then writes the canned report where vitest
   * would — `--coverage.reportsDirectory=<dir>` when given, else `./coverage`.
   */
  function installFakeNpx(): void {
    fs.writeFileSync(path.join(binDir, 'npx'), `#!/bin/sh
pwd >> ${JSON.stringify(cwdMarker)}
out="coverage"
for a in "$@"; do
  case "$a" in
    --coverage.reportsDirectory=*) out="\${a#--coverage.reportsDirectory=}" ;;
  esac
done
mkdir -p "$out"
cp ${JSON.stringify(cannedReport)} "$out/coverage-final.json"
exit 0
`);
    fs.chmodSync(path.join(binDir, 'npx'), 0o755);
    process.env.PATH = `${binDir}:${originalPath}`;
  }

  function writeCannedReport(entries: Record<string, unknown>): void {
    fs.writeFileSync(cannedReport, JSON.stringify(entries));
  }

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-e2e-')));
    makeVitestProject(root);
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-bin-'));
    cwdMarker = path.join(binDir, 'cwd.log');
    cannedReport = path.join(binDir, 'canned.json');
    const mathPath = path.join(root, 'src', 'math.ts');
    writeCannedReport({ [mathPath]: istanbulEntry(mathPath, 6, 3) });
    installFakeNpx();
    delete process.env.AQE_COVERAGE_NO_EXEC;
  });

  afterEach(() => {
    process.env.PATH = originalPath;
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

  it('reports a run in which no code executed as unmeasured, not a measured 0%', async () => {
    // What vitest produces when it finds no tests (e.g. run from the wrong
    // directory): every file listed with zero hits.
    const mathPath = path.join(root, 'src', 'math.ts');
    writeCannedReport({ [mathPath]: istanbulEntry(mathPath, 6, 0) });

    const data = await analyze(path.join(root, 'src'), root);

    expect(data.lineCoverage).toBeNull();
    expect(data.measured).toBe(false);
    expect(data.unmeasured).toBe(true);
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
