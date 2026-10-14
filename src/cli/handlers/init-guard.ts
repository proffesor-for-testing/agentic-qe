/**
 * `aqe init` guard for shared directories (#1006, review of #1026 N3).
 *
 * Initializing in the OS temp dir or a system dir wrote `<tmp>/.agentic-qe`
 * and `.mcp.json` there, but every later command resolves such a dir to a
 * private scratch root, so the initialized store was never used. Refusing
 * with a clear next step is less surprising than initializing a hidden root.
 *
 * @module cli/handlers/init-guard
 */

import { isHardStopDir, isSharedSystemDir, isStickyWorldWritable } from '../../kernel/shared-dirs.js';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The explicit root is also the destination for all init-generated files. */
export function initProjectRoot(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  return resolve(cwd, env.AQE_PROJECT_ROOT || '.');
}

/**
 * Error message when `projectRoot` must not be initialized, otherwise null.
 *
 * An explicit root (`AQE_PROJECT_ROOT`) is refused only when it is a hard-stop
 * directory (OS temp dir, `/`, `/home`, ...), or a sticky world-writable
 * directory WITHOUT `.git`. This mirrors `findProjectRoot`, which keeps a
 * sticky (mode 1777) directory that is itself a repo root as its own root, so
 * the explicit root stays the escape hatch for such a repository. A derived
 * root (the cwd) keeps the stricter rule: any shared directory is refused.
 */
export function sharedRootInitError(projectRoot: string, explicit: boolean): string | null {
  const shared = explicit
    ? isHardStopDir(projectRoot)
      || (isStickyWorldWritable(projectRoot) && !existsSync(join(projectRoot, '.git')))
    : isSharedSystemDir(projectRoot);
  if (!shared) return null;
  return (
    `Refusing to initialize in "${projectRoot}": it is a shared temp/system directory, ` +
    'so a store here would be shared by every unrelated project below it and ' +
    'later commands would not use it. Create a project directory first ' +
    '(mkdir my-project && cd my-project) or set AQE_PROJECT_ROOT to a project directory.'
  );
}

/** Error message when the selected root must not be initialized, otherwise null. */
export function sharedDirInitError(cwd: string, env: NodeJS.ProcessEnv = process.env): string | null {
  return sharedRootInitError(initProjectRoot(cwd, env), Boolean(env.AQE_PROJECT_ROOT));
}

/**
 * Error message when an explicit `AQE_PROJECT_ROOT` is not an existing
 * directory, otherwise null. A typo must not silently create and initialize a
 * new project somewhere else. Must run before anything creates the root (the
 * CLI's token bootstrap does `mkdir -p <root>/.agentic-qe` at startup).
 */
export function explicitRootError(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): string | null {
  if (!env.AQE_PROJECT_ROOT) return null;
  const root = initProjectRoot(cwd, env);
  let isDir = false;
  try { isDir = statSync(root).isDirectory(); } catch { isDir = false; }
  if (isDir) return null;
  return (
    `AQE_PROJECT_ROOT "${root}" is not an existing directory. ` +
    'Create it first (mkdir -p) or correct the path; aqe init does not create the project root.'
  );
}
