/**
 * Issue #999 (b, c): `aqe code index` indexed AQE's own `.agentic-qe/` state
 * (workers, helpers) as project source, and the project LOC metric counted
 * `package-lock.json` (1662 "LOC" for a 3-line project).
 *
 * Every walker that feeds code index / project metrics excludes `.agentic-qe`
 * (and the `.claude` assets init writes), and LOC counting skips lockfiles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const spawn = vi.hoisted(() => ({ calls: [] as Array<{ cmd: string; args: string[] }> }));
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawnSync: vi.fn((cmd: string, args: string[], opts: unknown) => {
      if (cmd === 'cloc' || cmd === 'tokei') {
        spawn.calls.push({ cmd, args });
        return { status: 1, stdout: '', stderr: '', error: new Error('not installed') };
      }
      return actual.spawnSync(cmd, args, opts as never);
    }),
  };
});

import { walkSourceFiles } from '../../../../src/cli/utils/file-discovery';
import { walkDirectory } from '../../../../src/cli/handlers/interfaces';
import { countLOC } from '../../../../src/domains/code-intelligence/services/metric-collector/loc-counter';
import {
  DEFAULT_METRIC_CONFIG,
  LOC_EXCLUDED_FILE_NAMES,
} from '../../../../src/domains/code-intelligence/services/metric-collector/interfaces';
import { createMetricCollector } from '../../../../src/domains/code-intelligence/services/metric-collector/index';
import { countTests } from '../../../../src/domains/code-intelligence/services/metric-collector/test-counter';
import { discoverSourceFiles } from '../../../../src/coordination/handlers/handler-utils';

let root: string;

function write(rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aqe-999-'));
  spawn.calls.length = 0;
  write('package.json', '{"name":"p"}\n');
  write('src/math.ts', 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
  // AQE state written by `aqe init` — never project source.
  write('.agentic-qe/workers/start-daemon.cjs', 'const a = 1;\nconst b = 2;\nmodule.exports = { a, b };\n');
  write('.claude/helpers/hook-handler.cjs', 'console.log("x");\n// TODO: x\n');
  // Lockfiles — generated, never LOC.
  write('package-lock.json', JSON.stringify({ lockfileVersion: 3, packages: Object.fromEntries(
    Array.from({ length: 200 }, (_, i) => [`node_modules/d${i}`, { version: `1.0.${i}` }]),
  ) }, null, 2));
  write('yarn.lock', '"d@^1":\n  version "1.0.0"\n');
  write('pnpm-lock.yaml', 'lockfileVersion: 9\npackages: {}\n');
  write('Cargo.lock', 'version = 3\n');
  write('poetry.lock', '[[package]]\nname = "x"\n');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('#999b walkers exclude .agentic-qe (and init-written .claude)', () => {
  it('walkSourceFiles (aqe code index / aqe ci) skips .agentic-qe and .claude', () => {
    expect(walkSourceFiles(root).map((f) => f.slice(root.length + 1))).toEqual(['src/math.ts']);
  });

  it('walkSourceFiles still indexes .agentic-qe when it is the explicit target', () => {
    expect(walkSourceFiles(join(root, '.agentic-qe'))).toHaveLength(1);
  });

  it('cli/handlers walkDirectory default excludes skip .agentic-qe and .claude', async () => {
    const files = await walkDirectory(root, { extensions: ['.ts', '.cjs'] });
    expect(files.map((f) => f.slice(root.length + 1))).toEqual(['src/math.ts']);
  });

  it('DEFAULT_METRIC_CONFIG excludes .agentic-qe and .claude at the project root only', () => {
    expect(DEFAULT_METRIC_CONFIG.excludeRootDirs).toEqual(['.agentic-qe', '.claude']);
    expect(DEFAULT_METRIC_CONFIG.excludeDirs).not.toContain('.claude');
  });

  it('pattern analysis (todo/console counts) skips .agentic-qe and .claude', async () => {
    write('src/log.cjs', 'console.log("project code");\n');
    const collector = createMetricCollector({ enableCache: false });
    const patterns = await collector.countPatterns(root, 'javascript');
    expect(Object.keys(patterns.byFile).map((f) => f.slice(root.length + 1))).toEqual(['src/log.cjs']);
  });
});

describe('#999 review N4: the .agentic-qe/.claude excludes are anchored at the project root', () => {
  beforeEach(() => {
    // A monorepo package whose own source lives in a nested `.claude/` dir.
    write('packages/plugin/.claude/hooks/on-save.ts', 'export const onSave = () => 1;\n');
    write('packages/plugin/.claude/hooks/on-save.test.ts', "import { it } from 'vitest';\nit('x', () => {});\n");
    write('packages/plugin/.agentic-qe/state.ts', 'export const s = 1;\n');
  });

  it('walkSourceFiles keeps nested .claude/.agentic-qe source', () => {
    expect(walkSourceFiles(root).map((f) => f.slice(root.length + 1)).sort()).toEqual([
      'packages/plugin/.agentic-qe/state.ts',
      'packages/plugin/.claude/hooks/on-save.ts',
      'src/math.ts',
    ]);
  });

  it('cli/handlers walkDirectory keeps nested .claude source', async () => {
    const files = await walkDirectory(root, { extensions: ['.ts', '.cjs'], maxDepth: 6 });
    expect(files.map((f) => f.slice(root.length + 1)).sort()).toEqual([
      'packages/plugin/.agentic-qe/state.ts',
      'packages/plugin/.claude/hooks/on-save.ts',
      'src/math.ts',
    ]);
  });

  it('MCP discoverSourceFiles keeps nested .claude source and skips the root one', async () => {
    const files = await discoverSourceFiles(root, { includeTests: false });
    expect(files.map((f) => f.slice(root.length + 1)).sort()).toEqual([
      'packages/plugin/.agentic-qe/state.ts',
      'packages/plugin/.claude/hooks/on-save.ts',
      'src/math.ts',
    ]);
  });

  it('pattern analysis keeps nested .claude source', async () => {
    write('packages/plugin/.claude/hooks/log.cjs', 'console.log("plugin");\n');
    write('src/log.cjs', 'console.log("project code");\n');
    const patterns = await createMetricCollector({ enableCache: false }).countPatterns(root, 'javascript');
    expect(Object.keys(patterns.byFile).map((f) => f.slice(root.length + 1)).sort())
      .toEqual(['packages/plugin/.claude/hooks/log.cjs', 'src/log.cjs']);
  });

  it('file-pattern test counting keeps nested .claude tests and skips root .claude', async () => {
    write('.claude/skills/x/budget.test.ts', "import { it } from 'vitest';\nit('aqe', () => {});\n");
    const tests = await countTests(root); // package.json names no runner → file-pattern counting
    expect(tests.total).toBe(1); // packages/plugin/.claude/hooks/on-save.test.ts only
  });

  it('cloc and tokei get root-anchored excludes, not bare names', async () => {
    await countLOC(root);
    const cloc = spawn.calls.find((c) => c.cmd === 'cloc' && c.args.includes('--json'))!;
    const tokei = spawn.calls.find((c) => c.cmd === 'tokei' && c.args.includes('--output'))!;

    expect(cloc.args.find((a) => a.startsWith('--exclude-dir='))).not.toMatch(/\.claude|\.agentic-qe/);
    expect(cloc.args).toContain('--fullpath');
    const notMatchD = new RegExp(cloc.args.find((a) => a.startsWith('--not-match-d='))!.slice('--not-match-d='.length));
    expect(notMatchD.test(`${root}/.claude`)).toBe(true);
    expect(notMatchD.test(`${root}/.agentic-qe/workers`)).toBe(true);
    expect(notMatchD.test(`${root}/packages/plugin/.claude`)).toBe(false);
    const notMatchF = new RegExp(cloc.args.find((a) => a.startsWith('--not-match-f='))!.slice('--not-match-f='.length));
    expect(notMatchF.test(`${root}/package-lock.json`)).toBe(true); // --fullpath applies to files too
    expect(notMatchF.test(`${root}/src/package-lock.json.ts`)).toBe(false);

    expect(tokei.args).toEqual(expect.arrayContaining(['-e', '/.claude', '-e', '/.agentic-qe']));
    expect(tokei.args).not.toContain('.claude');
  });
});

describe('#999c LOC excludes lockfiles', () => {
  it('node-native LOC counts only the 3 source lines plus package.json, not lockfiles', async () => {
    const loc = await countLOC(root);
    expect(loc.source).toBe('node-native');
    expect(loc.byLanguage).toEqual({ TypeScript: 3, JSON: 1 });
    expect(loc.total).toBe(4);
  });

  it('lists the common lockfiles', () => {
    expect(LOC_EXCLUDED_FILE_NAMES).toEqual(expect.arrayContaining([
      'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock',
      'Cargo.lock', 'poetry.lock', 'Pipfile.lock', 'composer.lock', 'Gemfile.lock', 'go.sum', 'uv.lock',
    ]));
  });

  it('cloc and tokei are told to skip lockfiles and .agentic-qe', async () => {
    await countLOC(root);
    const cloc = spawn.calls.find((c) => c.cmd === 'cloc' && c.args.includes('--json'));
    const tokei = spawn.calls.find((c) => c.cmd === 'tokei' && c.args.includes('--output'));
    expect(cloc?.args.some((a) => a.startsWith('--not-match-d=') && new RegExp(a.slice('--not-match-d='.length)).test(`${root}/.agentic-qe`))).toBe(true);
    expect(cloc?.args.some((a) => a.startsWith('--not-match-f=') && new RegExp(a.slice('--not-match-f='.length)).test('package-lock.json'))).toBe(true);
    expect(tokei?.args).toEqual(expect.arrayContaining(['-e', 'package-lock.json', '-e', '/.agentic-qe']));
  });
});
