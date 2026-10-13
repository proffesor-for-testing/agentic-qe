/**
 * #1017 review B1: existing installs keep the pre-3.15.6 test-named fixtures
 * next to the renamed ones. retireShippedAssets removes a retired file only on
 * an exact path AND shipped-content hash match; user-edited copies are kept.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { RETIRED_ASSETS, retireShippedAssets, sha256Hex } from '../../../src/init/retired-assets.js';

const REPO = join(__dirname, '..', '..', '..');
/** The bytes 3.13.0–3.15.5 shipped under the retired name now ship under the new one. */
const RENAMED_TO: Record<string, string> = {
  '.claude/skills/qe-court/evals/fixtures/seeded-mutant-delivery/budget.test.ts':
    'assets/skills/qe-court/evals/fixtures/seeded-mutant-delivery/budget-tests.ts.fixture',
  '.claude/skills/qe-court/evals/fixtures/seeded-mutant-delivery/budget.ts':
    'assets/skills/qe-court/evals/fixtures/seeded-mutant-delivery/budget.ts.fixture',
  '.claude/skills/testability-scoring/resources/templates/testability-scoring.spec.template.js':
    'assets/skills/testability-scoring/resources/templates/testability-scoring-spec.template.js',
};
const shipped = (relPath: string) => readFileSync(join(REPO, RENAMED_TO[relPath]));

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'aqe-retire-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

function seed(relPath: string, content: Buffer | string): string {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

describe('retired shipped assets (#1017)', () => {
  it('lists exactly the three retired files, each with the hash of what AQE shipped', () => {
    expect(RETIRED_ASSETS.map((a) => a.relPath).sort()).toEqual(Object.keys(RENAMED_TO).sort());
    for (const asset of RETIRED_ASSETS) {
      expect(asset.shippedSha256).toContain(sha256Hex(shipped(asset.relPath)));
    }
  });

  it('removes unmodified shipped copies and nothing else', () => {
    const files = Object.keys(RENAMED_TO).map((rel) => seed(rel, shipped(rel)));
    const neighbour = seed('.claude/skills/qe-court/evals/fixtures/seeded-mutant-delivery/README.md', 'keep me');

    const result = retireShippedAssets(root);

    expect(result.removed.sort()).toEqual(Object.keys(RENAMED_TO).sort());
    expect(result.kept).toEqual([]);
    for (const f of files) expect(existsSync(f)).toBe(false);
    expect(existsSync(neighbour)).toBe(true);
  });

  it('keeps a user-edited copy and reports why', () => {
    const rel = '.claude/skills/qe-court/evals/fixtures/seeded-mutant-delivery/budget.test.ts';
    const full = seed(rel, Buffer.concat([shipped(rel), Buffer.from('\n// my own extra case\n')]));

    const result = retireShippedAssets(root);

    expect(existsSync(full)).toBe(true);
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([{ relPath: rel, reason: expect.stringMatching(/modified.*#1017/) }]);
  });

  it('never follows or removes a symlink, even to identical content', () => {
    const rel = '.claude/skills/qe-court/evals/fixtures/seeded-mutant-delivery/budget.ts';
    const target = join(root, 'elsewhere.ts');
    writeFileSync(target, shipped(rel));
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    symlinkSync(target, join(root, rel));

    const result = retireShippedAssets(root);

    expect(result.removed).toEqual([]);
    expect(result.kept[0]).toMatchObject({ relPath: rel });
    expect(existsSync(target)).toBe(true);
  });

  it('does nothing when no retired file is present', () => {
    expect(retireShippedAssets(root)).toEqual({ removed: [], kept: [] });
  });
});
