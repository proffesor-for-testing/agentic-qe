/**
 * #995 review NB3/NB4/NB5 — `aqe coverage -F json` through the real CLI entry.
 *
 * - stdout must be ONE JSON document (progress lines go to stderr);
 * - a metric the report never collected is `null`, not 0, and is left out of
 *   the threshold verdict;
 * - UNMEASURED exits 3 with the same JSON shape (nulls).
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures: string[] = [];

afterAll(() => {
  for (const f of fixtures) rmSync(f, { recursive: true, force: true });
});

function istanbulEntry(file: string, total: number, covered: number): Record<string, unknown> {
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  for (let i = 0; i < total; i++) {
    statementMap[String(i)] = { start: { line: i + 1, column: 0 }, end: { line: i + 1, column: 5 } };
    s[String(i)] = i < covered ? 1 : 0;
  }
  // No branchMap entries: this report carries NO branch data.
  return { path: file, statementMap, s, branchMap: {}, b: {},
    fnMap: { '0': { name: 'f', loc: { start: { line: 1 }, end: { line: 1 } } } }, f: { '0': 1 } };
}

function makeProject(): string {
  const fixture = mkdtempSync(join(tmpdir(), 'aqe-995-cli-json-'));
  fixtures.push(fixture);
  const project = join(fixture, 'project');
  mkdirSync(join(project, 'src'), { recursive: true });
  mkdirSync(join(project, 'scripts'));
  mkdirSync(join(project, 'coverage'));
  writeFileSync(join(project, 'package.json'), '{"name":"cli-json"}');
  const file = join(project, 'src', 'a.ts');
  writeFileSync(file, 'export const a = 1;\n'.repeat(10));
  writeFileSync(join(project, 'scripts', 't.ts'), 'export const t = 1;\n');
  writeFileSync(join(project, 'coverage', 'coverage-final.json'), JSON.stringify({ [file]: istanbulEntry(file, 10, 9) }));
  return project;
}

// The built CLI, like the other CLI integration tests (`npm run build` first):
// the full fleet initialization does not run from TS sources under tsx.
const CLI_PATH = join(repo, 'dist', 'cli', 'bundle.js');

beforeAll(() => {
  if (!existsSync(CLI_PATH)) {
    throw new Error(`CLI bundle not found at ${CLI_PATH}. Run \`npm run build\` before running integration tests.`);
  }
});

function coverageCli(project: string, args: string[]) {
  const temp = mkdtempSync(join(tmpdir(), 'aqe-995-cli-tmp-'));
  fixtures.push(temp);
  return spawnSync(process.execPath, [CLI_PATH, 'coverage', ...args], {
    // Run from OUTSIDE the project: the report must be found via the target.
    cwd: temp, encoding: 'utf8', timeout: 90_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: temp, AQE_PROJECT_ROOT: temp,
      AQE_MEMORY_BACKEND: 'sqlite', AQE_SESSION_CACHE: 'off' },
  });
}

describe('#995 review — aqe coverage -F json', () => {
  it('prints pure JSON on stdout, with branch null and a threshold verdict over collected metrics', () => {
    const project = makeProject();
    const run = coverageCli(project, [join(project, 'src'), '-F', 'json', '--threshold', '80']);

    const doc = JSON.parse(run.stdout) as {
      summary: { line: number; branch: number | null; function: number | null; statement: number };
      meetsThreshold: boolean;
    };
    expect(doc.summary.line).toBe(90);
    expect(doc.summary.branch).toBeNull();
    // (90 + 90 + 100) / 3 = 93.3 >= 80. Counting branch as 0 would give 70 — "not met".
    expect(doc.meetsThreshold).toBe(true);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).toMatch(/Analyzing coverage/);
    // NB-A: no "X% below threshold" next to a "met" verdict.
    expect(((doc as unknown as { recommendations?: string[] }).recommendations ?? [])
      .some(r => /below threshold/i.test(r))).toBe(false);
  }, 120_000);

  it('line-only lcov at 90% with threshold 80: met, exit 0, no shortfall advice; markdown shows n/a (NB-A)', () => {
    const project = makeProject();
    const lcov = join(project, 'coverage', 'lcov.info');
    const da = Array.from({ length: 10 }, (_, i) => `DA:${i + 1},${i < 9 ? 1 : 0}`).join('\n');
    writeFileSync(lcov, `TN:\nSF:src/a.ts\n${da}\nLF:10\nLH:9\nend_of_record\n`);

    const json = coverageCli(project, [lcov, '-F', 'json', '--threshold', '80']);
    const doc = JSON.parse(json.stdout) as { summary: Record<string, number | null>; meetsThreshold: boolean; recommendations: string[] };
    // #1027 N7: lcov has no statement data — n/a, not a copy of the line figure.
    expect(doc.summary).toMatchObject({ line: 90, branch: null, function: null, statement: null });
    expect(doc.meetsThreshold).toBe(true);
    expect(doc.recommendations.some(r => /below threshold/i.test(r))).toBe(false);
    expect(json.status, json.stderr).toBe(0);

    const md = coverageCli(project, [lcov, '-F', 'markdown', '--threshold', '80']);
    expect(md.stdout).toContain('| Branches | n/a (not collected) |');
    expect(md.stdout).not.toContain('null%');
    expect(md.stdout).not.toMatch(/below threshold/i);
    expect(md.status, md.stderr).toBe(0);
  }, 120_000);

  it('exits 3 for an UNMEASURED target, with the same JSON shape on stdout', () => {
    const project = makeProject();
    const run = coverageCli(project, [join(project, 'scripts'), '-F', 'json']);

    const doc = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(doc).toMatchObject({
      summary: { line: null, branch: null, function: null, statement: null },
      meetsThreshold: null, threshold: 80, unmeasured: true, reason: 'target-not-covered',
    });
    expect(run.status, run.stderr).toBe(3);
  }, 120_000);
});

describe('#1012.2 — aqe coverage -F json on the heuristic estimate path', () => {
  function noReportProject(): string {
    const project = makeProject();
    rmSync(join(project, 'coverage'), { recursive: true, force: true });
    return project;
  }

  it('labels the estimate (measured:false, estimated:true, coverageMethod), gives no verdict, exits 3', () => {
    const project = noReportProject();
    const run = coverageCli(project, [join(project, 'src'), '-F', 'json', '--threshold', '80']);

    const doc = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(doc).toMatchObject({
      measured: false, estimated: true, unmeasured: true, coverageMethod: 'static-estimation',
      meetsThreshold: null, threshold: 80, reason: 'no-coverage-report',
    });
    expect((doc.summary as Record<string, unknown>).line).toEqual(expect.any(Number));
    expect(run.status, run.stderr).toBe(3);
  }, 120_000);

  it('a folder no report can measure (scripts) is UNMEASURED with exit 3, never 0% with exit 1', () => {
    const project = noReportProject();
    const run = coverageCli(project, [join(project, 'scripts'), '-F', 'json']);

    const doc = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(doc).toMatchObject({ measured: false, estimated: true, unmeasured: true, meetsThreshold: null });
    expect(run.status, run.stderr).toBe(3);
  }, 120_000);

  it('a measured result is labelled measured too (same vocabulary as MCP)', () => {
    const project = makeProject();
    const run = coverageCli(project, [join(project, 'src'), '-F', 'json']);
    expect(JSON.parse(run.stdout)).toMatchObject({ measured: true, estimated: false, coverageMethod: 'instrumented-report' });
  }, 120_000);
});
