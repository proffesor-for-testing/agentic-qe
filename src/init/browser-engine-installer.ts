/**
 * Browser Engine Installer
 *
 * Installs Vibium (https://github.com/VibiumDev/vibium) — the WebDriver BiDi
 * browser engine used by the `qe-browser` skill and all QE fleet skills that
 * need to drive a real browser (visual testing, a11y audits, pentest
 * validation, e2e flow verification).
 *
 * Design goals:
 *   - Graceful: never fail init if Vibium install fails; report and continue.
 *   - Idempotent: skip if Vibium is already on PATH.
 *   - Opt-out friendly: respect --minimal and --no-browser-engine flags.
 *   - No new runtime deps: shells out to `npm install -g vibium` via child_process.
 */

import { spawnSync as realSpawnSync, type SpawnSyncReturns } from 'node:child_process';
import { toErrorMessage } from '../shared/error-utils.js';

/**
 * Default Vibium npm spec. Pinned to the tested major.minor line (^26.3.18)
 * so `npm install -g` doesn't silently upgrade past a version we've verified
 * against qe-browser's 5 primitives + smoke tests.
 *
 * Bump procedure: update this constant, run scripts/smoke-test.sh against the
 * new version, then land the bump.
 */
export const DEFAULT_VIBIUM_SPEC = 'vibium@^26.3.18';

/**
 * Spawner injected into {@link installBrowserEngine} so tests can mock the
 * shell-out without monkey-patching the child_process module (ESM namespaces
 * are non-configurable). Signature matches {@link spawnSync}'s (bin, args, opts).
 */
export type Spawner = (
  bin: string,
  args: string[],
  options: { encoding: 'utf8'; timeout: number; maxBuffer: number }
) => SpawnSyncReturns<string>;

export interface BrowserEngineInstallerOptions {
  /** Skip installation entirely (for --minimal or --no-browser-engine). */
  skip?: boolean;
  /** Package name/version spec. Defaults to {@link DEFAULT_VIBIUM_SPEC}. */
  packageSpec?: string;
  /** Override the npm binary (default: "npm"). */
  npmBin?: string;
  /** Timeout for the install command in ms (default: 180_000). */
  timeoutMs?: number;
  /** Test seam — inject a spawner to avoid hitting real processes. */
  spawner?: Spawner;
}

export type BrowserEngineInstallStatus =
  | 'already-installed'
  | 'installed'
  | 'skipped'
  | 'install-failed'
  | 'npm-unavailable';

export interface BrowserEngineInstallResult {
  status: BrowserEngineInstallStatus;
  version?: string;
  message?: string;
  packageSpec: string;
}

function tryRun(
  spawner: Spawner,
  bin: string,
  args: string[],
  timeoutMs: number
): SpawnSyncReturns<string> {
  return spawner(bin, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

const defaultSpawner: Spawner = (bin, args, opts) =>
  realSpawnSync(bin, args, opts) as SpawnSyncReturns<string>;

/**
 * Detect whether `vibium` is already on PATH. Returns the version string
 * on success, `null` otherwise. Uses a short timeout because we don't want
 * to block init for tens of seconds on a misbehaving shim.
 *
 * Reads BOTH stdout and stderr because many Go CLIs (including some Vibium
 * versions) write `--version` output to stderr instead of stdout. Prefer
 * stdout when both are non-empty. Devil's-advocate review finding H1.
 */
export function detectVibium(spawner: Spawner = defaultSpawner, timeoutMs = 5_000): string | null {
  const result = tryRun(spawner, 'vibium', ['--version'], timeoutMs);
  if (result.status !== 0) return null;
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  // Prefer stdout, fall back to stderr. Strip leading "vibium" or "v" so the
  // returned version is consistent regardless of where the binary printed it.
  const raw = stdout || stderr;
  if (!raw) return 'unknown';
  // Extract first semver-looking token if present (e.g. "vibium version 26.3.18" → "26.3.18")
  const match = raw.match(/v?(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/);
  return match ? match[1] : raw.split(/\s+/)[0] || 'unknown';
}

/**
 * Install Vibium via `npm install -g`. Returns a structured result the
 * assets phase can log/summarize — never throws for expected failures.
 */
export function installBrowserEngine(
  options: BrowserEngineInstallerOptions = {}
): BrowserEngineInstallResult {
  const packageSpec = options.packageSpec || DEFAULT_VIBIUM_SPEC;
  if (options.skip) {
    return { status: 'skipped', packageSpec, message: 'install skipped by options' };
  }

  const spawner = options.spawner || defaultSpawner;
  const alreadyInstalled = detectVibium(spawner);
  if (alreadyInstalled) {
    return {
      status: 'already-installed',
      version: alreadyInstalled,
      packageSpec,
    };
  }

  const npmBin = options.npmBin || 'npm';
  // Sanity-check that npm is available before we attempt the install.
  const npmCheck = tryRun(spawner, npmBin, ['--version'], 5_000);
  if (npmCheck.error || npmCheck.status !== 0) {
    return {
      status: 'npm-unavailable',
      packageSpec,
      message: `npm is not available on PATH. Install Node.js + npm, then run \`npm install -g ${packageSpec}\`.`,
    };
  }

  const timeoutMs = options.timeoutMs || 180_000;
  const install = tryRun(spawner, npmBin, ['install', '-g', packageSpec], timeoutMs);
  if (install.status !== 0) {
    return {
      status: 'install-failed',
      packageSpec,
      message:
        install.stderr?.trim() ||
        install.stdout?.trim() ||
        toErrorMessage(install.error) ||
        'unknown npm install failure',
    };
  }

  const version = detectVibium(spawner) || 'unknown';
  return { status: 'installed', version, packageSpec };
}
