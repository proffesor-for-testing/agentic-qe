/**
 * Idempotent init writers (#778) — real filesystem, temp directories only.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  copyFileIfChanged,
  jsonEquivalent,
  stabilizeVolatileFields,
  writeFileIfChanged,
  writeJsonIfChanged,
  writeTextIfChangedIgnoring,
} from '../../../src/init/idempotent-write.js';
import { createProjectAnalyzer } from '../../../src/init/project-analyzer.js';
import { createAgentsInstaller } from '../../../src/init/agents-installer.js';

const roots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aqe-idempotent-write-'));
  roots.push(dir);
  return dir;
}
function aged(path: string): number {
  const past = new Date(Date.now() - 60_000);
  utimesSync(path, past, past);
  return statSync(path).mtimeMs;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('writeFileIfChanged / copyFileIfChanged', () => {
  it('writes a missing file, skips identical bytes, rewrites different bytes', () => {
    const file = join(tempDir(), 'a.txt');
    expect(writeFileIfChanged(file, 'one')).toBe(true);
    const mtime = aged(file);
    expect(writeFileIfChanged(file, 'one')).toBe(false);
    expect(statSync(file).mtimeMs).toBe(mtime);
    expect(writeFileIfChanged(file, 'two')).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe('two');
  });

  it('copies only when the destination is missing or differs', () => {
    const dir = tempDir();
    const src = join(dir, 'src.cjs');
    const dest = join(dir, 'dest.cjs');
    writeFileSync(src, 'module.exports = 1;');
    expect(copyFileIfChanged(src, dest)).toBe(true);
    const mtime = aged(dest);
    expect(copyFileIfChanged(src, dest)).toBe(false);
    expect(statSync(dest).mtimeMs).toBe(mtime);
    writeFileSync(src, 'module.exports = 2;');
    expect(copyFileIfChanged(src, dest)).toBe(true);
    expect(readFileSync(dest, 'utf-8')).toBe('module.exports = 2;');
  });
});

describe('writeTextIfChangedIgnoring', () => {
  it('ignores only the volatile line when comparing', () => {
    const file = join(tempDir(), 'config.yaml');
    const stamp = /^# \d{4}-/;
    writeTextIfChangedIgnoring(file, '# 2026-01-01\nkey: 1\n', stamp);
    const mtime = aged(file);
    expect(writeTextIfChangedIgnoring(file, '# 2026-09-29\nkey: 1\n', stamp)).toBe(false);
    expect(statSync(file).mtimeMs).toBe(mtime);
    expect(readFileSync(file, 'utf-8')).toContain('# 2026-01-01');
    expect(writeTextIfChangedIgnoring(file, '# 2026-09-29\nkey: 2\n', stamp)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe('# 2026-09-29\nkey: 2\n');
  });
});

describe('stabilizeVolatileFields / writeJsonIfChanged', () => {
  it('treats key order as irrelevant', () => {
    expect(jsonEquivalent({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    expect(jsonEquivalent({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });

  it('keeps the previous timestamp when nothing else changed', () => {
    const previous = { aqe: { version: '1', initialized: 'old' }, x: 1 };
    const next = { aqe: { version: '1', initialized: 'new' }, x: 1 };
    expect(stabilizeVolatileFields(previous, next, [['aqe', 'initialized']])).toBe(false);
    expect(next.aqe.initialized).toBe('old');
  });

  it('keeps the fresh timestamp when something else changed', () => {
    const previous = { aqe: { version: '1', initialized: 'old' } };
    const next = { aqe: { version: '2', initialized: 'new' } };
    expect(stabilizeVolatileFields(previous, next, [['aqe', 'initialized']])).toBe(true);
    expect(next.aqe.initialized).toBe('new');
  });

  it('reports a change when there is no previous document', () => {
    expect(stabilizeVolatileFields(undefined, { a: 1 }, [])).toBe(true);
  });

  it('writeJsonIfChanged preserves createdAt and mtime for an equivalent document', () => {
    const file = join(tempDir(), 'registry.json');
    expect(writeJsonIfChanged(file, { v: 1, createdAt: 't1' }, [['createdAt']])).toBe(true);
    const mtime = aged(file);
    expect(writeJsonIfChanged(file, { v: 1, createdAt: 't2' }, [['createdAt']])).toBe(false);
    expect(statSync(file).mtimeMs).toBe(mtime);
    expect(JSON.parse(readFileSync(file, 'utf-8')).createdAt).toBe('t1');
    expect(writeJsonIfChanged(file, { v: 2, createdAt: 't3' }, [['createdAt']])).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ v: 2, createdAt: 't3' });
  });
});

describe('ProjectAnalyzer ignores init-generated trees (#778)', () => {
  it('does not count AQE / agent-platform output as project code or tests', async () => {
    const root = tempDir();
    writeFileSync(join(root, 'package.json'), '{"name":"demo"}');
    const generated = [
      '.claude/skills/x/scripts/tool.ts',
      '.claude/skills/x/evals/fixture.test.ts',
      '.claude/helpers/statusline-v3.cjs',
      '.claude/hooks/aqe-hook.cjs',
      '.agentic-qe/workers/start-daemon.cjs',
      '.codex/hooks/aqe-codex-hook.cjs',
      '.agents/skills/y/run.js',
    ];
    for (const rel of generated) {
      mkdirSync(join(root, rel, '..'), { recursive: true });
      writeFileSync(join(root, rel), 'export function f(a) { if (a) { return 1; } return 2; }\n');
    }

    const analyzer = createProjectAnalyzer(root);
    const languages = await analyzer.detectLanguages();
    const tests = await analyzer.detectExistingTests();
    const complexity = await analyzer.analyzeComplexity();

    expect(languages).toEqual([]);
    expect(tests.totalCount).toBe(0);
    expect(complexity.totalFiles).toBe(0);

    // Real project sources are still analysed.
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'index.ts'), 'export const x = 1;\n');
    expect((await analyzer.detectLanguages()).map((l) => l.name)).toEqual(['typescript']);
  });
});

describe('AgentsInstaller index on a repeat install (#778)', () => {
  it('lists already-installed agents instead of rewriting the index as empty', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const projectRoot = tempDir();
    const indexPath = join(projectRoot, '.claude', 'docs', 'v3-agents-index.md');

    const first = await createAgentsInstaller({ projectRoot }).install();
    expect(first.installed.length).toBeGreaterThan(0);
    const firstIndex = readFileSync(indexPath, 'utf-8');
    const mtime = aged(indexPath);

    const second = await createAgentsInstaller({ projectRoot }).install();
    expect(second.installed).toHaveLength(0);
    expect(second.skipped.length).toBe(first.installed.length);
    expect(existsSync(indexPath)).toBe(true);
    expect(readFileSync(indexPath, 'utf-8')).toBe(firstIndex);
    expect(statSync(indexPath).mtimeMs).toBe(mtime);
    expect(firstIndex).toContain(`**Total Agents**: ${first.installed.length}`);
  });
});
