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
