/**
 * #1017 review B1 / round 2b: existing installs keep the pre-3.15.6 test-named
 * fixtures next to the renamed ones. retireShippedAssets:
 *  - removes a retired file only on an exact path AND shipped-content hash match;
 *  - retires the qe-court pair together (keeping budget.test.ts but deleting
 *    budget.ts would break the user's `vitest run` with "Cannot find module");
 *  - never touches anything whose resolved parent is outside the project root
 *    (a symlinked ancestor);
 *  - installs the renamed replacements and refreshes the README/yaml that still
 *    name the old files (only when those are AQE's unmodified shipped copies),
 *    so plain `init --auto` leaves a working skill.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { RETIRED_ASSET_GROUPS, retireShippedAssets, sha256Hex } from '../../../src/init/retired-assets.js';

const REPO = join(__dirname, '..', '..', '..');
const SOURCE = join(REPO, 'assets', 'skills');
const QC = '.claude/skills/qe-court/evals/fixtures/seeded-mutant-delivery';
const TS = '.claude/skills/testability-scoring/resources/templates';
/** The bytes 3.13.0–3.15.5 shipped under the retired names now ship under the new ones. */
const SHIPPED: Record<string, string> = {
  [`${QC}/budget.test.ts`]: 'qe-court/evals/fixtures/seeded-mutant-delivery/budget-tests.ts.fixture',
  [`${QC}/budget.ts`]: 'qe-court/evals/fixtures/seeded-mutant-delivery/budget.ts.fixture',
  [`${TS}/testability-scoring.spec.template.js`]: 'testability-scoring/resources/templates/testability-scoring-spec.template.js',
};
const shipped = (relPath: string) => readFileSync(join(SOURCE, SHIPPED[relPath]));
// Pre-3.15.6 README/yaml as shipped (pinned by sha256 in RETIRED_ASSET_GROUPS).
const OLD_README = '# Seeded-mutant delivery (qe-court acceptance fixture)\n';

let root: string;
let outside: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aqe-retire-'));
  outside = mkdtempSync(join(tmpdir(), 'aqe-retire-outside-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function seed(relPath: string, content: Buffer | string, base = root): string {
  const full = join(base, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}
const seedAll = () => Object.keys(SHIPPED).map((rel) => seed(rel, shipped(rel)));
const retire = () => retireShippedAssets(root, { sourceSkillsDir: SOURCE });

describe('retired shipped assets (#1017)', () => {
  it('pins exactly the three retired files to the hash of what AQE shipped', () => {
    const retired = RETIRED_ASSET_GROUPS.flatMap((g) => g.retired);
    expect(retired.map((a) => a.relPath).sort()).toEqual(Object.keys(SHIPPED).sort());
    for (const asset of retired) expect(asset.shippedSha256).toContain(sha256Hex(shipped(asset.relPath)));
  });

  it('removes unmodified shipped copies and installs the renamed replacements (plain init leaves a working skill)', () => {
    const files = seedAll();
    const result = retire();

    expect(result.removed.sort()).toEqual(Object.keys(SHIPPED).sort());
    expect(result.kept).toEqual([]);
    for (const f of files) expect(existsSync(f)).toBe(false);
    for (const [rel, source] of Object.entries(SHIPPED)) {
      const replacement = join(root, dirname(rel), source.split('/').pop()!);
      expect(readFileSync(replacement)).toEqual(readFileSync(join(SOURCE, source)));
    }
    expect(result.installed).toHaveLength(3);
  });

  it('refreshes the README/yaml that name the old files only when they are AQE\'s unmodified copies', () => {
    seedAll();
    const readme = join(root, QC, 'README.md');
    const yaml = join(root, '.claude/skills/qe-court/evals/qe-court.yaml');
    const qcGroup = RETIRED_ASSET_GROUPS.find((g) => g.id === 'qe-court-seeded-mutant')!;
    // Unmodified 3.15.5 README: use a stand-in registered as "previously shipped" by hash.
    writeFileSync(readme, OLD_README);
    writeFileSync(yaml, 'user: edited\n');
    const groups = RETIRED_ASSET_GROUPS.map((g) => g !== qcGroup ? g : {
      ...g,
      refresh: g.refresh.map((r) => r.relPath.endsWith('README.md')
        ? { ...r, previousSha256: [...r.previousSha256, sha256Hex(Buffer.from(OLD_README))] }
        : r),
    });

    const result = retireShippedAssets(root, { sourceSkillsDir: SOURCE, groups });

    expect(readFileSync(readme, 'utf8')).toContain('budget-tests.ts.fixture');
    expect(readFileSync(yaml, 'utf8')).toBe('user: edited\n'); // user's edit kept
    expect(result.refreshed).toEqual([`${QC}/README.md`]);
  });

  it('keeps the qe-court PAIR when the test file was edited (no dangling ./budget import)', () => {
    const [test, src] = seedAll();
    writeFileSync(test, Buffer.concat([shipped(`${QC}/budget.test.ts`), Buffer.from('\n// my case\n')]));

    const result = retire();

    expect(existsSync(test)).toBe(true);
    expect(existsSync(src)).toBe(true); // pristine, but its pair is kept
    expect(existsSync(join(root, QC, 'budget.ts.fixture'))).toBe(false);
    expect(result.kept).toEqual([expect.objectContaining({
      group: 'qe-court-seeded-mutant',
      files: [`${QC}/budget.test.ts`, `${QC}/budget.ts`],
      why: expect.stringMatching(/budget\.test\.ts was modified/),
    })]);
    // The unrelated testability template is still retired.
    expect(result.removed).toEqual([`${TS}/testability-scoring.spec.template.js`]);
  });

  it('keeps the pair when the test file is a symlink', () => {
    seed(`${QC}/budget.ts`, shipped(`${QC}/budget.ts`));
    const target = seed('elsewhere.ts', shipped(`${QC}/budget.test.ts`));
    symlinkSync(target, join(root, QC, 'budget.test.ts'));

    const result = retire();

    expect(existsSync(join(root, QC, 'budget.ts'))).toBe(true);
    expect(existsSync(target)).toBe(true);
    expect(result.kept[0]).toMatchObject({ why: expect.stringMatching(/budget\.test\.ts is not a regular file/) });
  });

  it('never deletes or writes through a symlinked ancestor that leaves the project', () => {
    // seeded-mutant-delivery -> a directory OUTSIDE the project holding the shipped bytes
    const outsideFixture = join(outside, 'fixture');
    seed('budget.test.ts', shipped(`${QC}/budget.test.ts`), outsideFixture);
    seed('budget.ts', shipped(`${QC}/budget.ts`), outsideFixture);
    mkdirSync(dirname(join(root, QC)), { recursive: true });
    symlinkSync(outsideFixture, join(root, QC));

    const result = retire();

    expect(existsSync(join(outsideFixture, 'budget.test.ts'))).toBe(true);
    expect(existsSync(join(outsideFixture, 'budget.ts'))).toBe(true);
    expect(existsSync(join(outsideFixture, 'budget.ts.fixture'))).toBe(false);
    expect(result.removed).toEqual([]);
    expect(result.kept[0]).toMatchObject({ why: expect.stringMatching(/outside the project/) });
  });

  it('never writes a replacement through a dangling symlink that points outside the project', () => {
    seedAll();
    const escape = join(outside, 'escaped.ts');
    symlinkSync(escape, join(root, QC, 'budget.ts.fixture')); // dangling: target does not exist

    const result = retire();

    expect(existsSync(escape)).toBe(false); // nothing written outside the project
    expect(result.missingReplacements).toContain(`${QC}/budget.ts.fixture`);
    expect(result.installed).not.toContain(`${QC}/budget.ts.fixture`);
    expect(result.installed).toContain(`${QC}/budget-tests.ts.fixture`);
    expect(result.replacementWarnings.join('\n')).toMatch(/budget\.ts\.fixture.*not a regular file/);
  });

  it('warning text names the real reason per group (budget.ts is not called a test-glob match)', () => {
    const qc = RETIRED_ASSET_GROUPS.find((g) => g.id === 'qe-court-seeded-mutant')!;
    expect(qc.advice).toMatch(/budget\.test\.ts matches test-runner globs/);
    expect(qc.advice).not.toMatch(/budget\.ts matches/);
  });

  it('reports replacements it could not install when the package source is missing', () => {
    seedAll();
    const result = retireShippedAssets(root, { sourceSkillsDir: join(root, 'no-such-source') });
    expect(result.removed).toHaveLength(3);
    expect(result.missingReplacements.length).toBe(3);
  });

  it('does nothing when no retired file is present', () => {
    expect(retire()).toEqual({ removed: [], installed: [], refreshed: [], kept: [], missingReplacements: [], replacementWarnings: [] });
  });
});
