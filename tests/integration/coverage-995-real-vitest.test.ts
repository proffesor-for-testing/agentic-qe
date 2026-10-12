/**
 * #995 review BL2/BL3 — the coverage runner against REAL vitest.
 *
 * Fixture projects reuse this repository's installed vitest and
 * @vitest/coverage-v8 through a `node_modules` symlink, so these tests run the
 * same binary a user's project would, with the user's config shapes:
 *
 *   BL2 — default config, tests import no src → coverage-final.json is `{}`:
 *         that is UNMEASURED (target not covered), never a static estimate.
 *         With `coverage.include`, the same run lists src at 0 hits: measured 0%.
 *   BL3 — `outputFile` in the user's config as a string, an object, or absent:
 *         our `--outputFile=` must win every time, so the test count is read
 *         and nothing is written into the project.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJsCoverage } from '../../src/coordination/handlers/coverage-runner';
import { evaluateCoverageForTarget } from '../../src/coordination/handlers/coverage-target';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures: string[] = [];

afterAll(() => {
  for (const f of fixtures) rmSync(f, { recursive: true, force: true });
});

const MATH = 'export function add(a: number, b: number): number { return a + b; }\n';

function project(opts: { config?: string; test?: string | null }): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-995-real-')));
  fixtures.push(root);
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'real', type: 'module', devDependencies: { vitest: '*' } }));
  writeFileSync(join(root, 'src', 'math.ts'), MATH);
  if (opts.test !== null) {
    writeFileSync(join(root, 'tests', 'x.test.ts'), opts.test ??
      "import { it, expect } from 'vitest';\nit('ok', () => { expect(1).toBe(1); });\n");
  }
  if (opts.config) writeFileSync(join(root, 'vitest.config.mjs'), opts.config);
  symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

const run = (root: string) => runJsCoverage(root, { timeoutMs: 90_000 });

describe('#995 review BL2 — a run that covered nothing is UNMEASURED, not an estimate', () => {
  it('default config, tests import no src: empty report → target-not-covered', async () => {
    const root = project({});
    const r = await run(root);

    expect(r.missing).toBe(false);
    expect(r.numTotalTests).toBe(1);
    expect(r.data).not.toBeNull();
    expect(r.data!.files.filter(f => f.path.includes(`${root}/src`))).toEqual([]);
    expect(evaluateCoverageForTarget(r.data!, root, join(root, 'src'), { numTotalTests: r.numTotalTests }))
      .toEqual({ status: 'no-data', reason: 'target-not-covered' });
  }, 120_000);

  it('coverage.include config, tests import no src: src listed at 0 hits → measured 0%', async () => {
    const root = project({ config: "export default { test: { coverage: { include: ['src/**'] } } };\n" });
    const r = await run(root);

    expect(r.numTotalTests).toBe(1);
    const verdict = evaluateCoverageForTarget(r.data!, root, join(root, 'src'), { numTotalTests: r.numTotalTests });
    expect(verdict.status).toBe('measured');
    if (verdict.status === 'measured') expect(verdict.files[0].lines.covered).toBe(0);
  }, 120_000);
});

describe('#995 review BL3 — our --outputFile wins over every user outputFile shape', () => {
  const shapes: Array<[string, string | undefined, string | null]> = [
    ['string', "export default { test: { reporters: ['json'], outputFile: './user-results.json' } };\n", 'user-results.json'],
    ['object', "export default { test: { reporters: ['json'], outputFile: { json: './user-results.json' } } };\n", 'user-results.json'],
    ['absent', undefined, null],
  ];

  it.each(shapes)('outputFile as %s: test count is read and nothing is written into the project', async (_shape, config, userFile) => {
    const root = project({ config });
    const before = readdirSync(root).sort();
    const r = await run(root);

    expect(r.numTotalTests).toBe(1);
    if (userFile) expect(existsSync(join(root, userFile))).toBe(false);
    expect(existsSync(join(root, '.vitest'))).toBe(false);
    expect(existsSync(join(root, 'coverage'))).toBe(false);
    expect(readdirSync(root).sort()).toEqual(before);
  }, 120_000);

  it('a project whose only test file has no tests is UNMEASURED (no-tests-ran), even with a string outputFile', async () => {
    const root = project({
      config: "export default { test: { reporters: ['json'], outputFile: './user-results.json', passWithNoTests: true } };\n",
      test: "import { describe } from 'vitest';\ndescribe.skip('nothing', () => {});\n",
    });
    const r = await run(root);

    expect(r.numTotalTests).toBe(0);
    expect(existsSync(join(root, 'user-results.json'))).toBe(false);
    const verdict = evaluateCoverageForTarget(r.data ?? { files: [], summary: { line: 0, branch: 0, function: 0, statement: 0, files: 0 } },
      root, join(root, 'src'), { numTotalTests: r.numTotalTests });
    expect(verdict).toEqual({ status: 'no-data', reason: 'no-tests-ran' });
  }, 120_000);
});
