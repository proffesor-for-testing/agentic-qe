/**
 * Run npm / npx without a shell on every platform.
 *
 * On Windows `npm` and `npx` are `npm.cmd` / `npx.cmd` batch shims. Since the
 * CVE-2024-27980 fix (Node 18.20.2 / 20.12.2 / 21.7.3+), child_process refuses
 * to start a `.cmd`/`.bat` without `shell: true` and fails with EINVAL. Turning
 * the shell on would route caller-supplied arguments through cmd.exe, so we run
 * the JavaScript CLI that ships next to node.exe with process.execPath instead
 * (#812, #872).
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type NpmCliTool = 'npm' | 'npx';

/**
 * Resolve `[executable, leadingArgs]` for npm/npx.
 *
 * - POSIX: `[tool, []]` (the real executable on PATH; unchanged behaviour).
 * - Windows: `[execPath, ['<node dir>\\node_modules\\npm\\bin\\<tool>-cli.js']]`,
 *   or `null` when that layout is absent. Callers must then fail clearly rather
 *   than spawn `<tool>.cmd` without a shell.
 */
export function npmCliInvocation(
  tool: NpmCliTool,
  platform: NodeJS.Platform = process.platform,
  execPath: string = process.execPath,
  exists: (path: string) => boolean = existsSync,
): [string, string[]] | null {
  if (platform !== 'win32') return [tool, []];
  // Host path module: it is path.win32 whenever this branch runs for real.
  const cli = join(dirname(execPath), 'node_modules', 'npm', 'bin', `${tool}-cli.js`);
  return exists(cli) ? [execPath, [cli]] : null;
}
