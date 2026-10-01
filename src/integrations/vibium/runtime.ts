/** Resolve the opt-in Vibium runtime for both local and global AQE installs. */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

export const VIBIUM_SETUP = 'aqe init --browser-engine (or npm install vibium@^26.8.21)';
type Runtime = typeof import('vibium');
const requireFromHere = createRequire(import.meta.url);

/** Never install or download anything while probing availability. */
function resolveRuntime(): string {
  try {
    return requireFromHere.resolve('vibium');
  } catch {
    try {
      return createRequire(join(process.cwd(), 'package.json')).resolve('vibium');
    } catch { /* No project-local opt-in runtime. Try global setup below. */ }
    // A global CLI installation is not on Node's normal module search path.
    // npm root is read-only and honors the same npm prefix as explicit setup.
    const root = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
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
      entry = resolveRuntime();
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
export function isVibiumReady(): boolean {
  try {
    const cli = join(dirname(resolveRuntime()), '..', 'bin', 'cli.js');
    execFileSync(process.execPath, [cli, 'is-installed'], {
      timeout: 5000, stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}
