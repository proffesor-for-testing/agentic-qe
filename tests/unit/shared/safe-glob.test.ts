/**
 * #1458: safeGlob replaces tinyglobby, whose picomatch dependency has a ReDoS
 * advisory with no fix (GHSA-fc5q-39xc-vjpf).
 *
 * The first block is the call-site contract that pinned tinyglobby's behaviour
 * for the scans in init, code intelligence and pretrain (#838); safeGlob keeps it.
 * The rest covers what safeGlob adds: patterns that come from a claim cannot use
 * extglobs, leave the search root, or make the matcher backtrack.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join, isAbsolute, relative } from 'node:path';
import { tmpdir } from 'node:os';
import {
  safeGlob, compileGlob, expandBraces, UnsafeGlobError, MAX_BRACE_EXPANSIONS,
} from '../../../src/shared/safe-glob.js';

const SOURCE_PATTERNS = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py'];
const canSymlink = process.platform !== 'win32';
let root: string;
let outside: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'aqe-glob-contract-'));
  outside = mkdtempSync(join(tmpdir(), 'aqe-glob-outside-'));
  writeFileSync(join(outside, 'secret.ts'), '');
  for (const dir of ['src/sub', 'node_modules/dep', 'dist', '.hidden', 'dir.ts']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  for (const file of [
    'src/a.ts', 'src/sub/b.tsx', 'src/c.py', 'node_modules/dep/n.ts',
    'dist/out.js', '.hidden/h.ts', '.dot.ts', 'root.json', 'dir.ts/inner.ts',
  ]) writeFileSync(join(root, file), '');
  if (canSymlink) {
    symlinkSync(join(root, 'src'), join(root, 'linked'), 'dir');
    symlinkSync(outside, join(root, 'escape'), 'dir');
    symlinkSync(root, join(root, 'src', 'loop'), 'dir');
    symlinkSync(join(outside, 'secret.ts'), join(root, 'src', 'secret-link.ts'));
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('call-site contract (kept from tinyglobby, #838)', () => {
  it('should_returnRelativePosixPathsSkipDotfilesAndHonourIgnore_when_scanningSources', async () => {
    const files = await safeGlob(SOURCE_PATTERNS, { cwd: root, ignore: ['node_modules/**', 'dist/**'] });
    expect(files).toEqual([
      'dir.ts/inner.ts',
      ...(canSymlink ? ['linked/a.ts', 'linked/c.py', 'linked/sub/b.tsx'] : []),
      'src/a.ts', 'src/c.py', 'src/sub/b.tsx',
    ]);
  });

  it('should_expandBraces_when_thePatternHasThem', async () => {
    const files = await safeGlob('**/*.{ts,tsx}', { cwd: root, ignore: ['**/node_modules/**', '**/linked/**'] });
    expect(files).toEqual(['dir.ts/inner.ts', 'src/a.ts', 'src/sub/b.tsx']);
  });

  it('should_returnAbsolutePaths_when_asked', async () => {
    const files = await safeGlob('src/**/*.ts', { cwd: root, absolute: true });
    expect(files).toHaveLength(1);
    expect(isAbsolute(files[0])).toBe(true);
  });

  it('should_notListADirectoryNamedLikeASourceFile_when_matchingEverything', async () => {
    const files = await safeGlob(['**/*'], { cwd: root, ignore: ['node_modules/**', 'linked/**'] });
    expect(files).not.toContain('dir.ts');
    expect(files).toContain('root.json');
  });

  it('should_matchTopLevelOnly_when_thePatternHasNoSlash', async () => {
    expect(await safeGlob(['*.ts', '*.json'], { cwd: root })).toEqual(['root.json']);
  });
});

describe('safety (#1458)', () => {
  it.each([
    ['+(a|b).ts'], ['**/*(a|aa)'], ['@(x).ts'], ['?(x)'], ['!(x).ts'],
  ])('should_rejectExtglobs_when_patternIs %s', async (pattern) => {
    await expect(safeGlob(pattern, { cwd: root })).rejects.toThrow(UnsafeGlobError);
  });

  it.each([['../*.ts'], ['src/../../x'], ['/etc/*'], ['C:/x/*'], ['src\\a.ts'], ['']])(
    'should_rejectPathsOutsideTheRoot_when_patternIs %j', async (pattern) => {
      await expect(safeGlob(pattern, { cwd: root })).rejects.toThrow(UnsafeGlobError);
    },
  );

  it('should_rejectUnsafeIgnorePatterns_when_given', async () => {
    await expect(safeGlob('**/*.ts', { cwd: root, ignore: ['+(x)'] })).rejects.toThrow(UnsafeGlobError);
  });

  it('should_capBraceExpansion_when_bracesMultiply', () => {
    expect(expandBraces('a{b,c{d,e}}')).toEqual(['ab', 'acd', 'ace']);
    expect(expandBraces('{x}')).toEqual(['{x}']);
    expect(() => expandBraces('{a,b}{c,d}{e,f}{g,h}{i,j}{k,l}{m,n}{o,p}{q,r}')).toThrow(
      new RegExp(`more than ${MAX_BRACE_EXPANSIONS}`),
    );
  });

  it('should_matchInLinearTime_when_givenTheAdvisoryStylePathologicalInput', () => {
    const match = compileGlob('**/*a*a*a*a*a*a*a*a*a*a*b');
    const start = Date.now();
    expect(match(`${'a'.repeat(5000)}/${'a'.repeat(5000)}`)).toBe(false);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('should_supportClassesAndQuestionMarks_when_matching', () => {
    const match = compileGlob('src/[a-c].?s');
    expect(match('src/a.ts')).toBe(true);
    expect(match('src/d.ts')).toBe(false);
    expect(compileGlob('src/[!a].ts')('src/b.ts')).toBe(true);
    expect(compileGlob('src/[!a].ts')('src/a.ts')).toBe(false);
  });

  it('should_matchDotfiles_onlyWhenThePatternNamesTheDot', async () => {
    expect(await safeGlob('**/*.ts', { cwd: root, ignore: ['**/node_modules/**', 'linked/**'] })).not.toContain('.dot.ts');
    expect(await safeGlob('.dot.ts', { cwd: root })).toEqual(['.dot.ts']);
    expect(await safeGlob('.hidden/*.ts', { cwd: root })).toEqual(['.hidden/h.ts']);
  });

  it.skipIf(!canSymlink)('should_notFollowLinksOutOfTheRootOrIntoALoop_when_walking', async () => {
    const files = await safeGlob('**/*.ts', { cwd: root, ignore: ['node_modules/**'] });
    expect(files.some((f) => f.includes('secret'))).toBe(false);
    expect(files.some((f) => f.startsWith('escape/'))).toBe(false);
    expect(files.some((f) => f.includes('loop/'))).toBe(false);
  });

  // Review of #1459
  it.skipIf(!canSymlink)('should_failClosedQuickly_when_linksPointAtEachOther', async () => {
    const d = mkdtempSync(join(tmpdir(), 'aqe-glob-diamond-'));
    try {
      const n = 9; // factorial fan-out before: 9 dirs ran out of memory
      for (let i = 0; i < n; i++) { mkdirSync(join(d, `d${i}`)); writeFileSync(join(d, `d${i}`, 'f.ts'), ''); }
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) symlinkSync(join(d, `d${j}`), join(d, `d${i}`, `l${j}`), 'dir');
      const start = Date.now();
      await expect(safeGlob('**/*.ts', { cwd: d })).rejects.toThrow(/entries reached through symbolic links/);
      expect(Date.now() - start).toBeLessThan(5000);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it.skipIf(!canSymlink)('should_listEveryLinkToTheSameDirectory_when_twoLinksShareATarget', async () => {
    // Re-review of #1459: a monorepo where two apps link one package lists it under both.
    const d = mkdtempSync(join(tmpdir(), 'aqe-glob-twolinks-'));
    try {
      mkdirSync(join(d, 'packages', 'p1'), { recursive: true });
      writeFileSync(join(d, 'packages', 'p1', 'x.ts'), '');
      for (const app of ['web', 'api']) {
        mkdirSync(join(d, 'apps', app), { recursive: true });
        symlinkSync(join(d, 'packages', 'p1'), join(d, 'apps', app, 'p1'), 'dir');
      }
      expect(await safeGlob('**/*.ts', { cwd: d })).toEqual(['apps/api/p1/x.ts', 'apps/web/p1/x.ts', 'packages/p1/x.ts']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('should_pruneADirectory_when_anIgnoreMatchesItsPathAsTinyglobbyDid', async () => {
    // A fake `dir/x` child used to make `**/*x`, `**/x` or `**/[a-z]` prune every directory.
    const all = await safeGlob('src/**/*.ts', { cwd: root });
    expect(await safeGlob('src/**/*.ts', { cwd: root, ignore: ['**/*x', '**/[a-z]'] })).toEqual(all);
    expect(await safeGlob('**/*.ts', { cwd: root, ignore: ['**/*.ts'] })).toEqual([]);
    expect(await safeGlob('**/*.py', { cwd: root, ignore: ['src/**'] })).not.toContain('src/c.py');
    // A bare name prunes the directory of that name.
    expect((await safeGlob('**/*.{ts,py}', { cwd: root, ignore: ['src', 'linked', 'node_modules'] }))).toEqual(['dir.ts/inner.ts']);
  });

  it.skipIf(!canSymlink)('should_failClosed_when_fewLinkedDirsHoldManyFiles', async () => {
    // Re-review of #1459: a directory budget let 6 mutually linked dirs of 1,000 files return ~2M paths.
    const d = mkdtempSync(join(tmpdir(), 'aqe-glob-wide-'));
    try {
      const n = 6;
      for (let i = 0; i < n; i++) {
        mkdirSync(join(d, `d${i}`));
        for (let f = 0; f < 1000; f++) writeFileSync(join(d, `d${i}`, `f${f}.ts`), '');
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) symlinkSync(join(d, `d${j}`), join(d, `d${i}`, `l${j}`), 'dir');
      await expect(safeGlob('**/*.ts', { cwd: d })).rejects.toThrow(/entries reached through symbolic links/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  }, 30_000);

  it('should_keepEmptyBraceAlternativesFromDroppingSegments_when_atTheEnd', () => {
    expect(compileGlob('**/{a,}')('x/y.ts')).toBe(false);
    expect(compileGlob('**/{a,}')('x/a')).toBe(true);
    expect(compileGlob('src//{a,}/**')('src/q/r.ts')).toBe(false);
    expect(compileGlob('src//{a,}/**')('src/a/r.ts')).toBe(true);
  });

  it('should_readALiteralDoubleSlashAsOneSeparator_when_written', async () => {
    expect(await safeGlob('src//a.ts', { cwd: root })).toEqual(['src/a.ts']);
  });

  it('should_normalizeDotSegments_when_patternsStartWithDotSlash', async () => {
    expect(await safeGlob('./src/*.ts', { cwd: root })).toEqual(['src/a.ts']);
    expect(await safeGlob('src/./a.ts', { cwd: root })).toEqual(['src/a.ts']);
    expect(await safeGlob('**/n.ts', { cwd: root, ignore: ['./node_modules/**'] })).toEqual([]);
  });

  it('should_dropAnEmptyBraceAlternative_when_itWouldJoinSegments', () => {
    expect(compileGlob('{src,}/**/*.ts')('lib/x.ts')).toBe(false);
    expect(compileGlob('{src,}/**/*.ts')('src/x.ts')).toBe(true);
  });

  it('should_treatALeadingBracketAsAMember_when_aClassStartsWithIt', () => {
    expect(compileGlob('a[!]]b.ts')('a,b.ts')).toBe(true);
    expect(compileGlob('a[!]]b.ts')('a]b.ts')).toBe(false);
    expect(compileGlob('a[]x]b.ts')('a]b.ts')).toBe(true);
  });

  it.skipIf(!canSymlink)('should_followALinkToAnInRootDirectoryNamedDotDotSomething', async () => {
    const d = mkdtempSync(join(tmpdir(), 'aqe-glob-dotdot-'));
    try {
      mkdirSync(join(d, '..foo'));
      writeFileSync(join(d, '..foo', 'a.ts'), '');
      symlinkSync(join(d, '..foo'), join(d, 'link'), 'dir');
      expect(await safeGlob('link/*.ts', { cwd: d })).toEqual(['link/a.ts']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('should_returnAbsolutePaths_when_cwdIsRelative', async () => {
    const files = await safeGlob('src/*.ts', { cwd: relative(process.cwd(), root), absolute: true });
    expect(files).toEqual([`${root}/src/a.ts`]);
  });

  it('should_returnNothing_when_theRootDoesNotExist', async () => {
    expect(await safeGlob('**/*', { cwd: join(root, 'missing') })).toEqual([]);
  });
});
