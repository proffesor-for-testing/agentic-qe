/**
 * Project root resolution for code-intelligence metric collection (#994).
 *
 * `index()` receives an expanded list of files (the CLI walks the target
 * directory first). When the caller also passes the original `target`, the
 * walk starts at the target directory (its parent for a file target), so a `.`
 * at a monorepo root whose source all lives in one package resolves to the
 * root. Without a target we start from the deepest directory that contains
 * every indexed path. Either way we walk UP (bottom-up, using `path.dirname`,
 * so absolute paths and Windows drive roots are handled by the `path` module)
 * and return the NEAREST directory that holds a project marker.
 *
 * Starting from the common directory rather than the first file keeps a stray
 * marker inside one subtree (for example `.agentic-qe/workers/package.json`)
 * from capturing an index that spans the whole project.
 *
 * When no marker exists anywhere up to the filesystem root, the start
 * directory itself is returned (the target, the files' common directory, or a
 * single file's directory). A filesystem or drive root is never returned:
 * measuring `/` would walk the whole disk, so the result is null instead.
 *
 * @module domains/code-intelligence/project-root-resolver
 */

import { existsSync, statSync } from 'node:fs';
import * as path from 'node:path';

/** Files or directories whose presence marks a project root. */
export const PROJECT_ROOT_MARKERS: readonly string[] = Object.freeze([
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  '.git',
]);

export interface ResolveProjectRootOptions {
  /** Base directory for relative inputs. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Existence check, injectable for tests. Defaults to `fs.existsSync`. */
  exists?: (p: string) => boolean;
  /** Directory check, injectable for tests. Defaults to `fs.statSync(...).isDirectory()`. */
  isDirectory?: (p: string) => boolean;
  /** Path implementation. Defaults to the platform `path`; tests pass `path.win32`. */
  pathImpl?: path.PlatformPath;
  /**
   * The directory (or file) the caller asked to index, before expansion. When
   * set, the walk starts here instead of at the common directory of `paths`.
   */
  target?: string;
}

function defaultIsDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** True when `child` is `parent` or lies inside it. */
function isWithin(p: path.PlatformPath, child: string, parent: string): boolean {
  const rel = p.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !p.isAbsolute(rel));
}

/**
 * Deepest directory containing every input directory, or null when the inputs
 * share no ancestor (for example different Windows drives).
 */
function commonAncestor(p: path.PlatformPath, dirs: string[]): string | null {
  let common = dirs[0];
  for (const dir of dirs.slice(1)) {
    while (!isWithin(p, dir, common)) {
      const parent = p.dirname(common);
      if (parent === common) return null;
      common = parent;
    }
  }
  return common;
}

/** Walk from `startDir` up to the filesystem root; return the nearest marker directory. */
function findNearestMarkerDir(
  p: path.PlatformPath,
  startDir: string,
  exists: (candidate: string) => boolean,
): string | null {
  let current = startDir;
  for (;;) {
    for (const marker of PROJECT_ROOT_MARKERS) {
      try {
        if (exists(p.join(current, marker))) return current;
      } catch {
        // Unreadable entry: keep checking the remaining markers.
      }
    }
    const parent = p.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Resolve the project root for a set of indexed paths.
 *
 * @param paths - Files and/or directories, absolute or relative to `options.cwd`
 * @returns Absolute project root, or null when there is nothing to resolve or
 *   the result would be a filesystem/drive root
 */
export function resolveProjectRootFromPaths(
  paths: readonly string[],
  options: ResolveProjectRootOptions = {},
): string | null {
  const usable = paths.filter((p) => typeof p === 'string' && p.length > 0);
  const target = typeof options.target === 'string' && options.target.length > 0 ? options.target : undefined;
  if (usable.length === 0 && !target) return null;

  const p = options.pathImpl ?? path;
  const cwd = options.cwd ?? process.cwd();
  const exists = options.exists ?? existsSync;
  const isDirectory = options.isDirectory ?? defaultIsDirectory;

  // A directory contributes itself; a file contributes its parent directory.
  const dirOf = (input: string): string => {
    const abs = p.resolve(cwd, input);
    return isDirectory(abs) ? abs : p.dirname(abs);
  };

  let start: string;
  if (target) {
    // The caller's own target wins over the expanded file list: a `.` at a
    // monorepo root whose source all lives in packages/a is still the root.
    start = dirOf(target);
  } else {
    const dirs = usable.map(dirOf);
    // Inputs on different roots (Windows drives): use the first path's directory.
    start = commonAncestor(p, dirs) ?? dirs[0];
  }

  const root = findNearestMarkerDir(p, start, exists) ?? start;
  // Never measure a whole filesystem / drive root (review N1).
  return isFilesystemRoot(p, root) ? null : root;
}

function isFilesystemRoot(p: path.PlatformPath, dir: string): boolean {
  return p.parse(dir).root === dir || p.dirname(dir) === dir;
}
