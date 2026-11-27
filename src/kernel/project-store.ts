/**
 * Project Store Detection
 *
 * Dependency-free checks for whether a project has an AQE store, kept apart
 * from the kernel and SQLite modules so CLI startup and read-only commands can
 * ask without opening (and thereby creating) anything.
 *
 * The `.agentic-qe` directory alone is not evidence of initialization: it can
 * be left behind by tools that write a single file into it, and older CLI
 * versions created it on startup in every directory (#1490).
 *
 * @module kernel/project-store
 */

import * as fs from 'fs';
import * as path from 'path';

/** The per-project AQE directory name. */
export const PROJECT_STORE_DIR = '.agentic-qe';

function isNonEmptyFile(filePath: string): boolean {
  try {
    // statSync follows a symlink; a dangling one throws and is not a store.
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

/**
 * An initialized project's store: a non-empty regular `memory.db` (a symlink
 * is followed; a dangling one, a directory or a 0-byte file is not a store,
 * and opening it would build a new one).
 */
export function hasEvidenceStore(projectRoot: string): boolean {
  return isNonEmptyFile(path.join(projectRoot, PROJECT_STORE_DIR, 'memory.db'));
}

/**
 * Whether `aqe init` has been run for this project (or the project already
 * holds a store): the `config.yaml` that `aqe init` writes, or a non-empty
 * `memory.db` (projects initialized before config.yaml, or whose store was
 * created by a fleet). An empty or partial `.agentic-qe` directory is not.
 */
export function isProjectInitialized(projectRoot: string): boolean {
  return isNonEmptyFile(path.join(projectRoot, PROJECT_STORE_DIR, 'config.yaml'))
    || hasEvidenceStore(projectRoot);
}

/**
 * For a project that is not initialized but has a `.agentic-qe` at its
 * resolved root, a line naming that directory: in a monorepo the root can be
 * an ancestor whose leftover `.agentic-qe` captured the lookup. Null when
 * there is no such directory (or the project is initialized).
 */
export function describeUninitializedStore(projectRoot: string): string | null {
  if (isProjectInitialized(projectRoot)) return null;
  const dir = path.join(projectRoot, PROJECT_STORE_DIR);
  try {
    if (!fs.statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  return `Found a ${PROJECT_STORE_DIR} at ${dir} that is not an initialized AQE store `
    + '(no config.yaml or memory.db). Run `aqe init` in '
    + `${projectRoot}, or remove that directory if it is a leftover.`;
}

/**
 * The real path of `p`, resolving symlinks in the longest existing prefix so
 * a path that does not exist yet still compares by its real location.
 */
function realPathLoose(p: string): string {
  const abs = path.resolve(p);
  const rest: string[] = [];
  let current = abs;
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...rest.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return abs;
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Whether `target` is the project's `.agentic-qe` or inside it, comparing real
 * paths so a symlinked spelling of the same location counts.
 */
export function isInProjectStore(projectRoot: string, target: string): boolean {
  const store = realPathLoose(path.join(projectRoot, PROJECT_STORE_DIR));
  const relative = path.relative(store, realPathLoose(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
