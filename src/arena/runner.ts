/**
 * Agentic QE v3 - Fixture Runner for qe-arena (ADR-104)
 *
 * Materializes a strategy's workspace (fixture sources — optionally with
 * one mutant applied — plus only the test groups the strategy selects)
 * in a temp directory and runs it with `node --test`. Real test runs,
 * real exit codes; nothing simulated.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';

export interface FixtureLayout {
  /** Absolute path of the fixture project */
  root: string;
  /** Source files, relative to root (mutation targets) */
  sourceFiles: string[];
  /** Test group name → test file relative path */
  testGroups: Record<string, string>;
}

export interface RunResult {
  ok: boolean;
  durationMs: number;
  /** Line-coverage percent parsed from --experimental-test-coverage, when requested */
  coveragePct: number | null;
}

/** Discover the conventional fixture layout: src/*.mjs + tests/<group>.test.mjs */
export function discoverFixture(root: string): FixtureLayout {
  const abs = path.resolve(root);
  const srcDir = path.join(abs, 'src');
  const testsDir = path.join(abs, 'tests');
  if (!fs.existsSync(srcDir) || !fs.existsSync(testsDir)) {
    throw new Error(`not an arena fixture (expected src/ and tests/): ${abs}`);
  }
  const sourceFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith('.mjs')).sort()
    .map((f) => path.join('src', f));
  const testGroups: Record<string, string> = {};
  for (const f of fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.mjs')).sort()) {
    testGroups[f.replace('.test.mjs', '')] = path.join('tests', f);
  }
  if (sourceFiles.length === 0 || Object.keys(testGroups).length === 0) {
    throw new Error(`fixture has no src/*.mjs or tests/*.test.mjs: ${abs}`);
  }
  return { root: abs, sourceFiles, testGroups };
}

export interface WorkspaceSpec {
  layout: FixtureLayout;
  groups: string[];
  /** When set, this source file's content replaces the original */
  mutatedFile?: { relPath: string; content: string };
}

/** Build a throwaway workspace for one (strategy, mutant?) evaluation. */
export function prepareWorkspace(spec: WorkspaceSpec, tmpRoot: string): string {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'arena-ws-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });

  for (const rel of spec.layout.sourceFiles) {
    const content =
      spec.mutatedFile && spec.mutatedFile.relPath === rel
        ? spec.mutatedFile.content
        : fs.readFileSync(path.join(spec.layout.root, rel), 'utf8');
    fs.writeFileSync(path.join(dir, rel), content);
  }
  for (const group of spec.groups) {
    const rel = spec.layout.testGroups[group];
    fs.copyFileSync(path.join(spec.layout.root, rel), path.join(dir, rel));
  }
  return dir;
}

/** Run `node --test` on the workspace's test files (explicit paths — a bare
 * directory argument is not portably supported by the node test runner). */
export function runNodeTest(dir: string, options: { coverage?: boolean; timeoutMs?: number } = {}): RunResult {
  const args = ['--test'];
  if (options.coverage) args.push('--experimental-test-coverage');
  const testFiles = fs.readdirSync(path.join(dir, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort()
    .map((f) => path.join('tests', f));
  args.push(...testFiles);

  const startedAt = process.hrtime.bigint();
  const proc = spawnSync(process.execPath, args, {
    cwd: dir,
    timeout: options.timeoutMs ?? 120_000,
    encoding: 'utf8',
  });
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  let coveragePct: number | null = null;
  if (options.coverage) {
    // node's coverage table summary row: "# all files | 91.43 | 84.21 | ..."
    const m = /all files\s*\|\s*([\d.]+)/.exec(proc.stdout ?? '');
    coveragePct = m ? Number(m[1]) : null;
  }

  return { ok: proc.status === 0, durationMs: Math.round(durationMs), coveragePct };
}

export function makeTmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qe-arena-'));
}

export function cleanupTmpRoot(tmpRoot: string): void {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
