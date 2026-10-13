/**
 * AQE-managed directories that source walkers must not treat as project code
 * (#999, review N4 / round 2b).
 *
 *  - `.agentic-qe/` is AQE runtime state (workers, results, DBs) at ANY depth;
 *    it is never source.
 *  - `.claude/` holds the assets `aqe init` writes (helpers, skills, agents).
 *    It is AQE-managed at the walk root, and nested only when it sits next to
 *    a `.agentic-qe/` (a nested `aqe init` in a monorepo package). A nested
 *    `.claude/` with no AQE install beside it (e.g. a Claude Code plugin's own
 *    `.claude/hooks/*.ts`) is the package's source and is walked.
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export const AQE_STATE_DIR = '.agentic-qe';
export const AQE_CLAUDE_DIR = '.claude';

/** True when directory `name` inside `parentDir` is AQE-managed (never project source). */
export function isAqeManagedDir(parentDir: string, name: string, isWalkRoot: boolean): boolean {
  if (name === AQE_STATE_DIR) return true;
  if (name === AQE_CLAUDE_DIR) return isWalkRoot || existsSync(join(parentDir, AQE_STATE_DIR));
  return false;
}

/**
 * Root-relative ('/'-separated) paths of the AQE-managed `.claude` directories
 * under `projectRoot`: the root one (if present) and every `.claude` that has a
 * sibling `.agentic-qe`. Used to anchor cloc/tokei excludes. Bounded walk that
 * skips `skipDirs` and dot-directories.
 */
export function findAqeClaudeDirs(
  projectRoot: string,
  skipDirs: readonly string[] = [],
  maxDepth = 12,
): string[] {
  const skip = new Set(skipDirs);
  const found: string[] = [];
  const walk = (dir: string, rel: string, depth: number): void => {
    if (existsSync(join(dir, AQE_CLAUDE_DIR)) && (depth === 0 || existsSync(join(dir, AQE_STATE_DIR)))) {
      found.push(rel ? `${rel}/${AQE_CLAUDE_DIR}` : AQE_CLAUDE_DIR);
    }
    if (depth >= maxDepth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || skip.has(entry.name)) continue;
      walk(join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name, depth + 1);
    }
  };
  walk(projectRoot, '', 0);
  return found;
}
