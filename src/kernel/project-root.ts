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
import {
  ensureScratchRoot, isHardStopDir, isSharedSystemDir, isStickyWorldWritable,
} from './shared-dirs.js';

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

export { isSharedSystemDir, scratchRootPath } from './shared-dirs.js';

/** Scratch roots already announced in this process (one notice per directory). */
const announcedScratchRoots = new Set<string>();

/**
 * Stable private root used when AQE runs with no project marker from a shared
 * temp/system directory itself. Using that directory would create
 * `<tmp>/.agentic-qe`, which every marker-less run below it would adopt
 * (#1006). The root lives in the per-user cache dir, keyed by the directory,
 * so memory persists across runs and no directory is minted per process.
 */
function scratchRootFor(sharedDir: string): string {
  const scratch = ensureScratchRoot(sharedDir);
  if (!announcedScratchRoots.has(scratch)) {
    announcedScratchRoots.add(scratch);
    console.error(
      `[AQE] No project marker found and "${sharedDir}" is a shared temp/system ` +
      `directory; using the private scratch root "${scratch}" instead of creating ` +
      `a shared .agentic-qe store there. Set AQE_PROJECT_ROOT to choose a root.`,
    );
  }
  return scratch;
}

/**
 * Path of a file or directory inside the current project's `.agentic-qe`
 * store. Writers use this instead of a cwd-relative `.agentic-qe`, so a run
 * from a subdirectory or a shared temp dir writes to the resolved store.
 */
export function getProjectStorePath(...segments: string[]): string {
  return path.join(findProjectRoot(), '.agentic-qe', ...segments);
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
 * Shared directories (#1006):
 * - The walk stops at a hard-stop directory (the OS temp dir, a fixed system
 *   dir such as `/tmp`, `/`, `/home`, or a Windows drive root); markers in or
 *   above it are never adopted.
 * - In a sticky world-writable dir (mode 1777) markers are still read, so a
 *   repo whose root is 1777 keeps its root, but a `.agentic-qe` store there
 *   is adopted only when the same dir has `.git`.
 * - A shared dir is never returned as the root itself: a stable per-user
 *   scratch root is used instead (`ensureScratchRoot`).
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
    // #1006: a marker in the OS temp dir or a fixed system dir belongs to no
    // project, and nothing above one is this project's either. Stop before
    // adopting `/tmp/.agentic-qe`, `/tmp/.git` or a store above the temp dir.
    if (isHardStopDir(checkDir)) break;
    const hasGit = fs.existsSync(path.join(checkDir, '.git'));
    // A sticky world-writable dir is shared scratch space unless it is itself
    // a repo root; only then may a store in it be adopted (#1006, N4).
    const strayStoreDir = !hasGit && isStickyWorldWritable(checkDir);

    // Issue #516: prefer the NEAREST (lowest) .agentic-qe, mirroring the
    // .git logic below. Keeping the topmost match let an ancestor store
    // (e.g. ~/.agentic-qe, created by any `aqe` run from $HOME) hijack
    // every descendant project and fragment its learning into $HOME. Stop
    // considering stores above the nearest git boundary, even when the repo
    // has not been initialized with AQE yet.
    const isHomeStoreAboveStart = checkDir === home && checkDir !== dir
      && !isWithin(dir, path.join(checkDir, '.agentic-qe'));
    if (lowestGitDir === null && !isHomeStoreAboveStart && !strayStoreDir
      && fs.existsSync(path.join(checkDir, '.agentic-qe'))) {
      if (nearestAqeDir === null) {
        nearestAqeDir = checkDir;
      }
    }
    if (hasGit) {
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
    _cachedProjectRoot = scratchRootFor(dir);
  } else {
    _cachedProjectRoot = dir;
  }

  return _cachedProjectRoot;
}
