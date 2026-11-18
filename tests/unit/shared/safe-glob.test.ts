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
import { join, isAbsolute } from 'node:path';
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

  it('should_returnNothing_when_theRootDoesNotExist', async () => {
    expect(await safeGlob('**/*', { cwd: join(root, 'missing') })).toEqual([]);
  });
});
