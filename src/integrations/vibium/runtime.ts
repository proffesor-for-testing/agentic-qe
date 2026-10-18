/** Resolve the opt-in Vibium runtime for both local and global AQE installs. */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { npmCliInvocation } from '../../shared/npm-cli-invocation.js';
import { runProcessText } from '../../shared/test-runner-process.js';

export const VIBIUM_SETUP = 'aqe init --browser-engine (or npm install vibium@^26.8.21)';
type Runtime = typeof import('vibium');
const requireFromHere = createRequire(import.meta.url);

/**
 * Async probe (#1115): a slow npm or Vibium CLI must not block the MCP server,
 * and a timeout stops its whole process group.
 */
function execFileText(file: string, args: string[]): Promise<string> {
  return runProcessText(file, args, { cwd: process.cwd(), timeout: 5000 });
}

/**
 * How to run npm without a shell. On Windows `npm` is an `npm.cmd` shim, which
 * execFile cannot start without `shell: true` (EINVAL/ENOENT since the
 * CVE-2024-27980 fix), so run the npm CLI bundled next to node.exe instead.
 * Falls back to plain `npm` when that layout is absent.
 */
export function npmInvocation(
  platform: NodeJS.Platform = process.platform,
  execPath: string = process.execPath,
  exists: (path: string) => boolean = existsSync,
): [string, string[]] {
  return npmCliInvocation('npm', platform, execPath, exists) ?? ['npm', []];
}

/** Never install or download anything while probing availability. */
async function resolveRuntime(): Promise<string> {
  try {
    return requireFromHere.resolve('vibium');
  } catch {
    try {
      return createRequire(join(process.cwd(), 'package.json')).resolve('vibium');
    } catch { /* No project-local opt-in runtime. Try global setup below. */ }
    // A global CLI installation is not on Node's normal module search path.
    // npm root is read-only and honors the same npm prefix as explicit setup.
    const [npmBin, npmPrefixArgs] = npmInvocation();
    const root = (await execFileText(npmBin, [...npmPrefixArgs, 'root', '-g'])).trim();
    return requireFromHere.resolve(join(root, 'vibium'));
  }
}

/** A module namespace as seen through ESM import, CJS interop, or a bundler shim. */
type LoadedModule = { browser?: { start?: unknown }; default?: { browser?: { start?: unknown } } };

/**
 * Accept the modern API from the namespace itself or from its `default`
 * export. CJS interop and bundler createRequire shims expose the package
 * object only as `default`, so checking the namespace alone rejects a
 * correctly installed runtime.
 */
function selectBrowserApi(loaded: LoadedModule | null | undefined): Runtime | null {
  if (typeof loaded?.browser?.start === 'function') return loaded as unknown as Runtime;
  if (typeof loaded?.default?.browser?.start === 'function') return loaded.default as unknown as Runtime;
  return null;
}

export async function loadVibium(): Promise<Runtime> {
  let loaded: LoadedModule;
  try {
    loaded = await import('vibium');
  } catch (error) {
    // Only a missing local package permits global resolution. A broken local
    // installation must not be silently replaced by an unrelated runtime.
    if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND' &&
        (error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error;
    let entry: string;
    try {
      entry = await resolveRuntime();
    } catch (cause) {
      throw new Error(`Vibium is not installed; run ${VIBIUM_SETUP}`, { cause });
    }
    loaded = requireFromHere(entry) as LoadedModule;
  }
  const runtime = selectBrowserApi(loaded);
  if (!runtime) {
    throw new Error(
      'Unsupported Vibium API: the installed package exposes no browser.start() ' +
      `(neither as a named nor a default export); run ${VIBIUM_SETUP}`,
    );
  }
  return runtime;
}

/** Check the payload belonging to the resolved library, not a different PATH CLI. */
export async function isVibiumReady(): Promise<boolean> {
  try {
    const cli = join(dirname(await resolveRuntime()), '..', 'bin', 'cli.js');
    await execFileText(process.execPath, [cli, 'is-installed']);
    return true;
  } catch {
    return false;
  }
}
