/**
 * Project Root Detection
 *
 * Lightweight, dependency-free resolution of the AQE project root. Kept in its
 * own module (no SQLite / kernel imports) so hot paths — e.g. the RVF pattern
 * store factory — can import it statically without dragging in the sqlite-heavy
 * unified-memory graph, and so it resolves cleanly under the test runner.
 *
 * `unified-memory` re-exports `findProjectRoot` / `clearProjectRootCache` for
 * backward compatibility, so existing import sites keep working.
 *
 * @module kernel/project-root
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Module-level cache for findProjectRoot result. */
let _cachedProjectRoot: string | null = null;
let _cachedStartDir: string | null = null;

/**
 * Clear the cached project root. Useful for testing or when the
 * environment changes at runtime.
 */
export function clearProjectRootCache(): void {
  _cachedProjectRoot = null;
  _cachedStartDir = null;
}

/**
 * Fixed system directories that are never a project root. A `.agentic-qe`,
 * `.git` or `package.json` found in one of these is a stray left by some other
 * run, not a project marker (#1006).
 */
const POSIX_SYSTEM_DIRS = [
  '/', '/tmp', '/var/tmp', '/usr/tmp', '/dev/shm', '/run/shm',
  '/private', '/private/tmp', '/private/var', '/private/var/tmp',
  '/var', '/usr', '/etc', '/opt', '/srv', '/mnt', '/media', '/run',
  '/home', '/Users', '/Volumes',
];

function safeRealpath(p: string): string {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

/**
 * True when `dir` is a shared temp or system directory: the OS temp dir,
 * `/tmp`, `/var/tmp`, a top-level system dir, or a sticky world-writable
 * directory (mode 1777-style, the shape of a shared temp dir). A plain o+w
 * directory without the sticky bit is not treated as shared, since container
 * workspaces are often chmod 777 and are real projects. AQE must never adopt or create
 * a learning store in such a directory, because every unrelated run below it
 * would then share and pollute one store (#1006).
 */
export function isSharedSystemDir(dir: string): boolean {
  const resolved = path.resolve(dir);
  const real = safeRealpath(resolved);
  const candidates = new Set<string>();
  const add = (p: string): void => {
    candidates.add(path.resolve(p));
    candidates.add(safeRealpath(p));
  };
  try { add(os.tmpdir()); } catch { /* no temp dir configured */ }
  if (process.platform === 'win32') {
    if (resolved === path.parse(resolved).root) return true;
  } else {
    for (const sys of POSIX_SYSTEM_DIRS) add(sys);
  }
  if (candidates.has(resolved) || candidates.has(real)) return true;
  if (process.platform === 'win32') return false;
  try {
    const mode = fs.statSync(resolved).mode;
    return (mode & 0o1002) === 0o1002;
  } catch {
    return false;
  }
}

/**
 * Private, per-process fallback root used when AQE runs with no project marker
 * from a shared temp/system directory itself. Using that directory as the root
 * would create `<tmp>/.agentic-qe`, which every marker-less run below it would
 * then adopt (#1006). The fallback is created with mode 0700 by mkdtemp and is
 * a sibling of every other temp project, so no other walk can reach it.
 */
function createScratchRoot(sharedDir: string): string {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-scratch-root-'));
  console.error(
    `[AQE] No project marker found and "${sharedDir}" is a shared temp/system ` +
    `directory; using a private scratch root "${scratch}" instead of creating ` +
    `a shared .agentic-qe store there. Set AQE_PROJECT_ROOT to choose a root.`,
  );
  return scratch;
}

/** True when `dir` is `parent` or inside it. */
function isWithin(dir: string, parent: string): boolean {
  const rel = path.relative(parent, dir);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Find the project root by walking up the directory tree.
 *
 * Priority order:
 * 1. AQE_PROJECT_ROOT environment variable (set by MCP config or init)
 * 2. Nearest .agentic-qe at or below the nearest .git boundary
 * 3. Walk up looking for .git directory (git repo root)
 * 4. Walk up looking for package.json WITHOUT node_modules sibling (monorepo root)
 * 5. Fallback to current working directory
 *
 * The walk stops at a shared temp or system directory (`isSharedSystemDir`):
 * markers at or above the OS temp dir, `/tmp`, `/var/tmp`, a top-level system
 * dir or any world-writable dir are never adopted, and such a directory is
 * never returned as the root — a private scratch root is used instead (#1006).
 *
 * Optimized: single upward walk checks all markers in one pass,
 * and the result is cached at module level for subsequent calls.
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  // Environment overrides may change between SDK calls. Do not let a cached
  // discovery hide a new explicit root or leak it after the override is unset.
  if (process.env.AQE_PROJECT_ROOT) return process.env.AQE_PROJECT_ROOT;

  const dir = path.resolve(startDir);
  if (_cachedProjectRoot && _cachedStartDir === dir) return _cachedProjectRoot;
  _cachedStartDir = dir;
  const root = path.parse(dir).root;

  // A store directly in $HOME is almost always a stray from an `aqe` run in
  // the home directory. Outside any git repository there is no boundary to
  // stop at, so never let it claim a descendant directory (#735/#516); an
  // `aqe` run from $HOME itself still uses it, and AQE_PROJECT_ROOT overrides.
  let home: string | null = null;
  try { home = path.resolve(os.homedir()); } catch { home = null; }

  let checkDir = dir;
  let nearestAqeDir: string | null = null;
  let lowestGitDir: string | null = null;
  let topmostPackageJson: string | null = null;

  while (checkDir !== root) {
    // #1006: a marker in a shared temp/system dir belongs to no project, and
    // nothing above one is this project's either. Stop before adopting
    // `/tmp/.agentic-qe`, `/tmp/.git` or a store above the temp dir.
    if (isSharedSystemDir(checkDir)) break;

    // Issue #516: prefer the NEAREST (lowest) .agentic-qe, mirroring the
    // .git logic below. Keeping the topmost match let an ancestor store
    // (e.g. ~/.agentic-qe, created by any `aqe` run from $HOME) hijack
    // every descendant project and fragment its learning into $HOME. Stop
    // considering stores above the nearest git boundary, even when the repo
    // has not been initialized with AQE yet.
    const isHomeStoreAboveStart = checkDir === home && checkDir !== dir
      && !isWithin(dir, path.join(checkDir, '.agentic-qe'));
    if (lowestGitDir === null && !isHomeStoreAboveStart && fs.existsSync(path.join(checkDir, '.agentic-qe'))) {
      if (nearestAqeDir === null) {
        nearestAqeDir = checkDir;
      }
    }
    if (fs.existsSync(path.join(checkDir, '.git'))) {
      if (lowestGitDir === null) {
        lowestGitDir = checkDir;
      }
    }
    if (fs.existsSync(path.join(checkDir, 'package.json'))) {
      topmostPackageJson = checkDir;
    }
    checkDir = path.dirname(checkDir);
  }

  if (nearestAqeDir) {
    _cachedProjectRoot = nearestAqeDir;
  } else if (lowestGitDir) {
    _cachedProjectRoot = lowestGitDir;
  } else if (topmostPackageJson) {
    _cachedProjectRoot = topmostPackageJson;
  } else if (isSharedSystemDir(dir)) {
    _cachedProjectRoot = createScratchRoot(dir);
  } else {
    _cachedProjectRoot = dir;
  }

  return _cachedProjectRoot;
}
