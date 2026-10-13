/**
 * Issue #1017: `aqe init` copies skills, agents and helpers into the user's
 * project. Any shipped file whose name matches a common test-runner glob is
 * collected by the user's own vitest / jest / playwright / pytest / go test
 * run (3.15.5: qe-court's `budget.test.ts` grew `vitest list` from 3 to 5).
 *
 * Every directory that init (or the npm package) copies into a project must
 * stay free of test-glob names. Fixtures that need test-shaped content use a
 * non-executable suffix such as `.fixture`.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..');

/** Source trees that init installers or the published package copy into a project. */
const SHIPPED_TREES = [
  'assets',
  '.claude/skills',
  '.claude/agents',
  '.claude/helpers',
  '.claude/commands',
  '.claude/hooks',
  '.agents/skills',
  '.opencode',
  '.codex',
];

/** File names collected by the default config of a common test runner. */
const TEST_GLOB_FILE_PATTERNS: Array<{ runner: string; pattern: RegExp }> = [
  // vitest **/*.{test,spec}.?(c|m)[jt]s?(x); jest/playwright equivalents; and
  // the literal `*.test.*` / `*.spec.*` convention many custom configs use.
  { runner: 'vitest/jest/playwright (*.test.* / *.spec.*)', pattern: /\.(test|spec)\./i },
  // pytest defaults
  { runner: 'pytest (test_*.py)', pattern: /^test_.*\.py$/i },
  { runner: 'pytest (*_test.py)', pattern: /_test\.py$/i },
  // go test
  { runner: 'go test (*_test.go)', pattern: /_test\.go$/i },
];

/** Directory names a runner treats as "everything inside is a test". */
const TEST_GLOB_DIR_NAMES = new Set(['__tests__']);

function findTestGlobMatches(root: string): string[] {
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        if (TEST_GLOB_DIR_NAMES.has(entry.name)) {
          offenders.push(`${relative(REPO_ROOT, full)}/ (jest __tests__ directory)`);
          continue;
        }
        walk(full);
      } else {
        const hit = TEST_GLOB_FILE_PATTERNS.find(({ pattern }) => pattern.test(entry.name));
        if (hit) offenders.push(`${relative(REPO_ROOT, full)} (${hit.runner})`);
      }
    }
  };
  walk(root);
  return offenders;
}

describe('shipped init assets contain no test-runner glob matches (#1017)', () => {
  it.each(SHIPPED_TREES.filter((tree) => existsSync(join(REPO_ROOT, tree))))(
    '%s has no file a user test runner would collect',
    (tree) => {
      expect(findTestGlobMatches(join(REPO_ROOT, tree))).toEqual([]);
    },
  );

  it('the qe-court seeded-mutant fixture ships under non-executable names', () => {
    for (const base of ['assets/skills', '.claude/skills']) {
      const dir = join(REPO_ROOT, base, 'qe-court/evals/fixtures/seeded-mutant-delivery');
      const names = readdirSync(dir).sort();
      expect(names).toEqual(['README.md', 'budget-tests.ts.fixture', 'budget.ts.fixture']);
    }
  });
});
