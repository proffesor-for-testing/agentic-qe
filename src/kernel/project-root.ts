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
import * as path from 'path';

/** Module-level cache for findProjectRoot result. */
let _cachedProjectRoot: string | null = null;

/**
 * Clear the cached project root. Useful for testing or when the
 * environment changes at runtime.
 */
export function clearProjectRootCache(): void {
  _cachedProjectRoot = null;
}

/**
 * Find the project root by walking up the directory tree.
 *
 * Priority order:
 * 1. AQE_PROJECT_ROOT environment variable (set by MCP config or init)
 * 2. Walk up looking for the NEAREST .agentic-qe directory (existing AQE project)
 * 3. Walk up looking for .git directory (git repo root)
 * 4. Walk up looking for package.json WITHOUT node_modules sibling (monorepo root)
 * 5. Fallback to current working directory
 *
 * Optimized: single upward walk checks all markers in one pass,
 * and the result is cached at module level for subsequent calls.
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  if (_cachedProjectRoot) {
    return _cachedProjectRoot;
  }

  if (process.env.AQE_PROJECT_ROOT) {
    _cachedProjectRoot = process.env.AQE_PROJECT_ROOT;
    return _cachedProjectRoot;
  }

  const dir = startDir;
  const root = path.parse(dir).root;

  let checkDir = dir;
  let nearestAqeDir: string | null = null;
  let lowestGitDir: string | null = null;
  let topmostPackageJson: string | null = null;

  while (checkDir !== root) {
    // Issue #516: prefer the NEAREST (lowest) .agentic-qe, mirroring the
    // .git logic below. Keeping the topmost match let an ancestor store
    // (e.g. ~/.agentic-qe, created by any `aqe` run from $HOME) hijack
    // every descendant project and fragment its learning into $HOME.
    if (fs.existsSync(path.join(checkDir, '.agentic-qe'))) {
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
    _cachedProjectRoot = process.cwd();
  }

  return _cachedProjectRoot;
}
