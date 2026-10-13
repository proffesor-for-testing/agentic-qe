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

import { isSharedSystemDir } from '../../kernel/shared-dirs.js';
import { resolve } from 'node:path';

/** The explicit root is also the destination for all init-generated files. */
export function initProjectRoot(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  return resolve(cwd, env.AQE_PROJECT_ROOT || '.');
}

/** Error message when the selected root must not be initialized, otherwise null. */
export function sharedDirInitError(cwd: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const projectRoot = initProjectRoot(cwd, env);
  if (!isSharedSystemDir(projectRoot)) return null;
  return (
    `Refusing to initialize in "${projectRoot}": it is a shared temp/system directory, ` +
    'so a store here would be shared by every unrelated project below it and ' +
    'later commands would not use it. Create a project directory first ' +
    '(mkdir my-project && cd my-project) or set AQE_PROJECT_ROOT to a project directory.'
  );
}
