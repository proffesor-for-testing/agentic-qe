/**
 * Issue #994: resolving the project root for `aqe code index` metrics.
 *
 * The old walker split the first path on '/', so absolute paths were walked as
 * relative paths against the cwd, the walk ran top-down (outermost marker won),
 * and the fallback was the first file's parent (e.g. proj/.agentic-qe/workers).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  resolveProjectRootFromPaths,
  PROJECT_ROOT_MARKERS,
} from '../../../../src/domains/code-intelligence/project-root-resolver';

function touch(file: string, content = ''): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

describe('resolveProjectRootFromPaths (#994)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-994-')));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns null for no paths', () => {
    expect(resolveProjectRootFromPaths([])).toBeNull();
  });

  it('exposes the documented marker set', () => {
    expect([...PROJECT_ROOT_MARKERS]).toEqual(
      expect.arrayContaining(['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', '.git']),
    );
  });

  it('resolves an absolute file path to the nearest marker directory', () => {
    const proj = path.join(tmp, 'proj');
    touch(path.join(proj, 'package.json'), '{}');
    const file = touch(path.join(proj, 'src', 'deep', 'math.ts'));

    expect(resolveProjectRootFromPaths([file])).toBe(proj);
  });

  it('resolves the files of a "." directory target (including .agentic-qe/workers) to the project', () => {
    const proj = path.join(tmp, 'proj');
    touch(path.join(proj, 'package.json'), '{}');
    // walkSourceFiles does not skip .agentic-qe, and readdir order put these first
    const files = [
      touch(path.join(proj, '.agentic-qe', 'workers', 'worker.js')),
      touch(path.join(proj, 'src', 'math.ts')),
      touch(path.join(proj, 'vitest.config.ts')),
    ];

    expect(resolveProjectRootFromPaths(files)).toBe(proj);
  });

  it('ignores a marker inside a subtree when the indexed set spans the project', () => {
    const proj = path.join(tmp, 'proj');
    touch(path.join(proj, 'package.json'), '{}');
    // A stray marker under one subtree must not capture the whole index
    touch(path.join(proj, '.agentic-qe', 'workers', 'package.json'), '{}');
    const files = [
      touch(path.join(proj, '.agentic-qe', 'workers', 'worker.js')),
      touch(path.join(proj, 'src', 'math.ts')),
    ];

    expect(resolveProjectRootFromPaths(files)).toBe(proj);
  });

  it('resolves the files of a "tests" directory target to the project, not proj/tests', () => {
    const proj = path.join(tmp, 'proj');
    touch(path.join(proj, 'package.json'), '{}');
    const files = [
      touch(path.join(proj, 'tests', 'math.test.ts')),
      touch(path.join(proj, 'tests', 'unit', 'other.test.ts')),
    ];

    expect(resolveProjectRootFromPaths(files)).toBe(proj);
  });

  it('accepts a directory path itself as the starting point', () => {
    const proj = path.join(tmp, 'proj');
    touch(path.join(proj, 'go.mod'), 'module x');
    fs.mkdirSync(path.join(proj, 'tests'), { recursive: true });

    expect(resolveProjectRootFromPaths([proj])).toBe(proj);
    expect(resolveProjectRootFromPaths([path.join(proj, 'tests')])).toBe(proj);
  });

  it('picks the NEAREST marker for a project nested inside an outer git repo', () => {
    const outer = path.join(tmp, 'outer');
    fs.mkdirSync(path.join(outer, '.git'), { recursive: true });
    touch(path.join(outer, 'package.json'), '{}');
    const inner = path.join(outer, 'packages', 'inner');
    touch(path.join(inner, 'pyproject.toml'), '');
    const file = touch(path.join(inner, 'src', 'mod.py'));

    expect(resolveProjectRootFromPaths([file])).toBe(inner);
  });

  it('falls back to the directory target when no marker exists anywhere up the tree', () => {
    const target = path.join(tmp, 'nomarker', 'target');
    fs.mkdirSync(target, { recursive: true });

    // Simulate a filesystem with no markers by bounding the check to the temp tree.
    const exists = (p: string): boolean => p.startsWith(tmp) && fs.existsSync(p);
    expect(resolveProjectRootFromPaths([target], { exists })).toBe(target);
  });

  it('falls back to the common directory of the files when no marker exists', () => {
    const target = path.join(tmp, 'nomarker', 'target');
    const files = [
      touch(path.join(target, 'a', 'one.ts')),
      touch(path.join(target, 'b', 'two.ts')),
    ];
    const exists = (p: string): boolean => p.startsWith(tmp) && fs.existsSync(p);

    expect(resolveProjectRootFromPaths(files, { exists })).toBe(target);
  });

  it('falls back to the file directory for a single file with no marker', () => {
    const file = touch(path.join(tmp, 'nomarker', 'lib', 'x.ts'));
    const exists = (p: string): boolean => p.startsWith(tmp) && fs.existsSync(p);

    expect(resolveProjectRootFromPaths([file], { exists })).toBe(path.dirname(file));
  });

  it('resolves relative inputs against the supplied cwd, not the process cwd', () => {
    const proj = path.join(tmp, 'proj');
    touch(path.join(proj, 'Cargo.toml'), '');
    touch(path.join(proj, 'src', 'lib.rs'));

    expect(resolveProjectRootFromPaths(['src/lib.rs'], { cwd: proj })).toBe(proj);
    expect(resolveProjectRootFromPaths(['.'], { cwd: path.join(proj, 'src') })).toBe(proj);
  });

  it('uses the outer repo when the target has no marker of its own', () => {
    const outer = path.join(tmp, 'outer');
    fs.mkdirSync(path.join(outer, '.git'), { recursive: true });
    const file = touch(path.join(outer, 'scripts', 'tool.ts'));

    expect(resolveProjectRootFromPaths([file])).toBe(outer);
  });

  describe('Windows paths (path.win32)', () => {
    const win = path.win32;

    it('walks bottom-up from a drive-letter path to the nearest marker', () => {
      const markers = new Set(['C:\\Users\\me\\.git', 'C:\\Users\\me\\work\\proj\\package.json']);
      const result = resolveProjectRootFromPaths(['C:\\Users\\me\\work\\proj\\tests\\a.test.ts'], {
        pathImpl: win,
        cwd: 'C:\\',
        exists: (p) => markers.has(p),
        isDirectory: () => false,
      });

      expect(result).toBe('C:\\Users\\me\\work\\proj');
    });

    it('stops at the drive root and falls back to the common directory', () => {
      const result = resolveProjectRootFromPaths(
        ['D:\\code\\lib\\a\\x.ts', 'D:\\code\\lib\\b\\y.ts'],
        { pathImpl: win, cwd: 'D:\\', exists: () => false, isDirectory: () => false },
      );

      expect(result).toBe('D:\\code\\lib');
    });

    it('uses the first path when inputs are on different drives', () => {
      const markers = new Set(['C:\\proj\\package.json', 'D:\\other\\package.json']);
      const result = resolveProjectRootFromPaths(['C:\\proj\\src\\a.ts', 'D:\\other\\b.ts'], {
        pathImpl: win,
        cwd: 'C:\\',
        exists: (p) => markers.has(p),
        isDirectory: () => false,
      });

      expect(result).toBe('C:\\proj');
    });
  });

  describe('explicit target (review B1)', () => {
    const makeMonorepo = (): { mono: string; pkgA: string; files: string[] } => {
      const mono = path.join(tmp, 'mono');
      touch(path.join(mono, 'package.json'), '{}');
      const pkgA = path.join(mono, 'packages', 'a');
      touch(path.join(pkgA, 'package.json'), '{}');
      const files = [touch(path.join(pkgA, 'src', 'add.ts')), touch(path.join(pkgA, 'tests', 'add.test.ts'))];
      return { mono, pkgA, files };
    };

    it('returns the target directory itself when it holds a marker', () => {
      const { mono, files } = makeMonorepo();

      expect(resolveProjectRootFromPaths(files, { target: mono })).toBe(mono);
    });

    it('returns the package when the package is the target', () => {
      const { pkgA, files } = makeMonorepo();

      expect(resolveProjectRootFromPaths(files, { target: pkgA })).toBe(pkgA);
    });

    it('walks up from a target without a marker (tests dir) to the nearest marker', () => {
      const { pkgA, files } = makeMonorepo();

      expect(resolveProjectRootFromPaths(files, { target: path.join(pkgA, 'tests') })).toBe(pkgA);
    });

    it("uses a file target's directory as the starting point", () => {
      const { pkgA, files } = makeMonorepo();

      expect(resolveProjectRootFromPaths([files[0]], { target: files[0] })).toBe(pkgA);
    });

    it('resolves a relative target against cwd', () => {
      const { mono, files } = makeMonorepo();

      expect(resolveProjectRootFromPaths(files, { target: '.', cwd: mono })).toBe(mono);
    });

    it('falls back to the target directory when no marker exists', () => {
      const target = path.join(tmp, 'nomarker', 'target');
      const files = [touch(path.join(target, 'deep', 'x.ts'))];
      const exists = (p: string): boolean => p.startsWith(tmp) && fs.existsSync(p);

      expect(resolveProjectRootFromPaths(files, { target, exists })).toBe(target);
    });
  });

  describe('filesystem root is never returned (review N1)', () => {
    it('returns null when the no-marker fallback would be "/"', () => {
      const result = resolveProjectRootFromPaths(['/a.ts', '/b.ts'], {
        pathImpl: path.posix,
        cwd: '/',
        exists: () => false,
        isDirectory: () => false,
      });

      expect(result).toBeNull();
    });

    it('returns null for files on different top-level dirs with no marker', () => {
      const result = resolveProjectRootFromPaths(['/srv/a.ts', '/opt/b.ts'], {
        pathImpl: path.posix,
        cwd: '/',
        exists: () => false,
        isDirectory: () => false,
      });

      expect(result).toBeNull();
    });

    it('returns null when "/" is the target and holds the only marker', () => {
      const result = resolveProjectRootFromPaths(['/srv/a.ts'], {
        pathImpl: path.posix,
        cwd: '/',
        target: '/',
        exists: (p) => p === '/.git',
        isDirectory: (p) => p === '/',
      });

      expect(result).toBeNull();
    });

    it('returns null for a Windows drive root fallback', () => {
      const result = resolveProjectRootFromPaths(['C:\\a.ts'], {
        pathImpl: path.win32,
        cwd: 'C:\\',
        exists: () => false,
        isDirectory: () => false,
      });

      expect(result).toBeNull();
    });
  });

  it('never returns a relative path', () => {
    const proj = path.join(tmp, 'proj');
    touch(path.join(proj, 'package.json'), '{}');
    const result = resolveProjectRootFromPaths(['src/a.ts'], { cwd: proj });

    expect(result).not.toBeNull();
    expect(path.isAbsolute(result as string)).toBe(true);
  });
});
