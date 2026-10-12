/**
 * Project root resolution for code-intelligence metric collection (#994).
 *
 * `index()` receives an expanded list of files (the CLI and the MCP tool both
 * walk the target directory first), so the original target is not known here.
 * We therefore start from the deepest directory that contains every indexed
 * path, then walk UP (bottom-up, using `path.dirname`, so absolute paths and
 * Windows drive roots are handled by the `path` module) and return the NEAREST
 * directory that holds a project marker.
 *
 * Starting from the common directory rather than the first file keeps a stray
 * marker inside one subtree (for example `.agentic-qe/workers/package.json`)
 * from capturing an index that spans the whole project. For a single file it is
 * the file's own directory, which is the nearest-marker walk the issue asks for.
 *
 * When no marker exists anywhere up to the filesystem root, the common
 * directory itself is returned: for a directory target that is the target (or
 * the deepest directory under it holding every file), and for a single file it
 * is the file's directory.
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
 * @returns Absolute project root, or null when `paths` is empty
 */
export function resolveProjectRootFromPaths(
  paths: readonly string[],
  options: ResolveProjectRootOptions = {},
): string | null {
  const usable = paths.filter((p) => typeof p === 'string' && p.length > 0);
  if (usable.length === 0) return null;

  const p = options.pathImpl ?? path;
  const cwd = options.cwd ?? process.cwd();
  const exists = options.exists ?? existsSync;
  const isDirectory = options.isDirectory ?? defaultIsDirectory;

  // A directory contributes itself; a file contributes its parent directory.
  const dirs = usable.map((input) => {
    const abs = p.resolve(cwd, input);
    return isDirectory(abs) ? abs : p.dirname(abs);
  });
  // Inputs on different roots (Windows drives): use the first path's directory.
  const start = commonAncestor(p, dirs) ?? dirs[0];

  return findNearestMarkerDir(p, start, exists) ?? start;
}
