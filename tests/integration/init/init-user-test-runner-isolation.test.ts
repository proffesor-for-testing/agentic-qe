/**
 * Issue #1017 — `aqe init` must not change what the user's own test runner
 * collects. 3.15.5 scaffolded qe-court's `budget.test.ts` into
 * `.claude/skills/...`, so `vitest list` went from 3 to 5 tests.
 *
 * A fresh git project with three tests is listed by REAL vitest (this repo's
 * install, reached through a node_modules symlink) and by jest's default
 * testMatch, before and after the init installers copy skills and agents into
 * it. Both counts must be unchanged.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { globSync } from 'glob';
import { createSkillsInstaller } from '../../../src/init/skills-installer.js';
import { createAgentsInstaller } from '../../../src/init/agents-installer.js';

const REPO = resolve(__dirname, '../../..');
const VITEST_BIN = join(REPO, 'node_modules', 'vitest', 'vitest.mjs');
const fixtures: string[] = [];

afterAll(() => {
  for (const f of fixtures) rmSync(f, { recursive: true, force: true });
});

function makeProject(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1017-')));
  fixtures.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'u', type: 'module', scripts: { test: 'vitest run' } }));
  writeFileSync(join(root, 'src', 'a.ts'), 'export const add = (a: number, b: number) => a + b;\n');
  writeFileSync(
    join(root, 'src', 'a.test.ts'),
    "import { it, expect } from 'vitest';\nimport { add } from './a';\n" +
      "it('1', () => expect(add(1, 1)).toBe(2));\nit('2', () => expect(add(1, 2)).toBe(3));\nit('3', () => expect(add(2, 2)).toBe(4));\n",
  );
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

/** Tests the user's vitest would run, as `vitest list` prints them. */
function vitestList(root: string): string[] {
  const r = spawnSync(process.execPath, [VITEST_BIN, 'list', '--root', root], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 120_000,
    env: { ...process.env, CI: '1', NO_COLOR: '1' },
  });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.split('\n').map((l) => l.trim()).filter((l) => l.includes(' > '));
}

/** Files jest's default testMatch would collect (testPathIgnorePatterns: /node_modules/). */
function jestDefaultTestFiles(root: string): string[] {
  return globSync(['**/__tests__/**/*.?([mc])[jt]s?(x)', '**/?(*.)+(spec|test).?([mc])[jt]s?(x)'], {
    cwd: root,
    dot: true,
    ignore: ['**/node_modules/**'],
  }).sort();
}

describe('#1017 init leaves the user test-runner inventory unchanged', () => {
  it('vitest list and jest --listTests counts are identical before and after skills + agents install', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const root = makeProject();
    const vitestBefore = vitestList(root);
    const jestBefore = jestDefaultTestFiles(root);
    expect(vitestBefore).toHaveLength(3);
    expect(jestBefore).toEqual(['src/a.test.ts']);

    const skills = await createSkillsInstaller({ projectRoot: root }).install();
    const agents = await createAgentsInstaller({ projectRoot: root }).install();
    // Guard against a vacuous pass: the installers really copied content.
    expect(skills.installed.length).toBeGreaterThan(10);
    expect(skills.installed.map((s) => s.name)).toContain('qe-court');
    expect(agents.installed.length).toBeGreaterThan(10);

    expect(jestDefaultTestFiles(root)).toEqual(jestBefore);
    expect(vitestList(root)).toEqual(vitestBefore);
  }, 240_000);
});
