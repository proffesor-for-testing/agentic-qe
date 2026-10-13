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

  it('DEFAULT_METRIC_CONFIG.excludeDirs lists .agentic-qe and .claude', () => {
    expect(DEFAULT_METRIC_CONFIG.excludeDirs).toEqual(expect.arrayContaining(['.agentic-qe', '.claude']));
  });

  it('pattern analysis (todo/console counts) skips .agentic-qe and .claude', async () => {
    write('src/log.cjs', 'console.log("project code");\n');
    const collector = createMetricCollector({ enableCache: false });
    const patterns = await collector.countPatterns(root, 'javascript');
    expect(Object.keys(patterns.byFile).map((f) => f.slice(root.length + 1))).toEqual(['src/log.cjs']);
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
    expect(cloc?.args.join(' ')).toMatch(/--exclude-dir=[^ ]*\.agentic-qe/);
    expect(cloc?.args.some((a) => a.startsWith('--not-match-f=') && new RegExp(a.slice('--not-match-f='.length)).test('package-lock.json'))).toBe(true);
    expect(tokei?.args).toEqual(expect.arrayContaining(['-e', 'package-lock.json', '-e', '.agentic-qe']));
  });
});
