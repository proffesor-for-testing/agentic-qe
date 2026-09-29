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
  } else {
    _cachedProjectRoot = dir;
  }

  return _cachedProjectRoot;
}
