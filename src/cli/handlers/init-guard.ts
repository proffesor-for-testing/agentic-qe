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

/** Error message when `cwd` must not be initialized, otherwise null. */
export function sharedDirInitError(cwd: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.AQE_PROJECT_ROOT) return null;
  if (!isSharedSystemDir(cwd)) return null;
  return (
    `Refusing to initialize in "${cwd}": it is a shared temp/system directory, ` +
    'so a store here would be shared by every unrelated project below it and ' +
    'later commands would not use it. Create a project directory first ' +
    '(mkdir my-project && cd my-project) or set AQE_PROJECT_ROOT to choose a root.'
  );
}
