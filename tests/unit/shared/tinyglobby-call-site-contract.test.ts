/**
 * tinyglobby call-site contract.
 *
 * fast-glob was replaced by tinyglobby (#838: fast-glob -> micromatch ->
 * braces GHSA-vfj7-8cjw-p6xm). The six call sites rely on fast-glob's
 * semantics; these tests pin the ones they depend on so a tinyglobby
 * upgrade that changes them fails here instead of silently changing scans.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { glob } from 'tinyglobby';

const SOURCE_PATTERNS = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py'];
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'aqe-glob-contract-'));
  for (const dir of ['src/sub', 'node_modules/dep', 'dist', '.hidden', 'dir.ts']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  for (const file of [
    'src/a.ts', 'src/sub/b.tsx', 'src/c.py', 'node_modules/dep/n.ts',
    'dist/out.js', '.hidden/h.ts', '.dot.ts', 'root.json', 'dir.ts/inner.ts',
  ]) writeFileSync(join(root, file), '');
  symlinkSync(join(root, 'src'), join(root, 'linked'), 'dir');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('tinyglobby call-site contract', () => {
  it('returns relative POSIX paths, skips dotfiles and honours ignore', async () => {
    const files = await glob(SOURCE_PATTERNS, {
      cwd: root, ignore: ['node_modules/**', 'dist/**'], expandDirectories: false,
    });
    expect(files.sort()).toEqual([
      'dir.ts/inner.ts', 'linked/a.ts', 'linked/c.py', 'linked/sub/b.tsx',
      'src/a.ts', 'src/c.py', 'src/sub/b.tsx',
    ]);
  });

  it('expands brace patterns without a braces dependency', async () => {
    const files = await glob('**/*.{ts,tsx}', {
      cwd: root, ignore: ['**/node_modules/**', '**/linked/**'], expandDirectories: false,
    });
    expect(files.sort()).toEqual(['dir.ts/inner.ts', 'src/a.ts', 'src/sub/b.tsx']);
  });

  it('returns absolute paths when asked', async () => {
    const files = await glob('src/**/*.ts', { cwd: root, absolute: true, expandDirectories: false });
    expect(files).toHaveLength(1);
    expect(isAbsolute(files[0])).toBe(true);
  });

  it('does not treat a directory named like a source file as a match', async () => {
    const files = await glob(['**/*'], {
      cwd: root, ignore: ['node_modules/**', 'linked/**'], onlyFiles: true, expandDirectories: false,
    });
    expect(files).not.toContain('dir.ts');
    expect(files).toContain('root.json');
  });
});
