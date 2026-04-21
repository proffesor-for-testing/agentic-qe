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
import * as os from 'node:os';
import * as fs from 'node:fs';
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
  /** Test seam — inject a platform probe for cross-OS diagnostic tests. */
  platformProbe?: PlatformProbe;
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
  /**
   * Platform diagnostic emitted after a successful install. Present when
   * the current host is one where Vibium's first-run Chrome auto-download
   * is known to fail (e.g. Linux aarch64 at v26.3.x) and we were able to
   * point at a system browser, or couldn't and are saying so explicitly.
   */
  platformHint?: PlatformHint;
}

export interface PlatformHint {
  /**
   * Short machine-readable tag for the condition being reported. Consumers
   * can assert on this in tests or suppress the hint in known-good envs.
   */
  code:
    | 'linux-arm64-system-chromium-found'
    | 'linux-arm64-no-system-chromium';
  /** Single-line human message suitable for `console.warn`. */
  message: string;
  /**
   * Optional filesystem path to a system browser binary the user can point
   * Vibium at via `VIBIUM_BROWSER_PATH`.
   */
  browserPath?: string;
}

/**
 * Injectable seam for `os.platform()` / `os.arch()`. Tests override this
 * to simulate running on a different host.
 */
export interface PlatformProbe {
  platform: () => NodeJS.Platform;
  arch: () => string;
  existsSync: (path: string) => boolean;
}

const defaultPlatformProbe: PlatformProbe = {
  platform: () => os.platform(),
  arch: () => os.arch(),
  existsSync: (p) => fs.existsSync(p),
};

/**
 * Candidate paths for a system chromium binary on Linux distributions that
 * package Chromium (Debian, Ubuntu, Fedora, Arch). Order matters: we return
 * the first match, so list the most common locations first.
 */
const LINUX_SYSTEM_CHROMIUM_PATHS: readonly string[] = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
];

/**
 * Build a platform hint for hosts where Vibium's first-run Chrome auto-
 * download is known to fail. Today that's just Linux aarch64 at the
 * pinned Vibium version (v26.3.x). Returns `undefined` when no hint
 * applies, so callers can cheaply check for presence.
 *
 * Intentionally conservative: we don't mutate the user's env or create
 * symlinks — we surface a diagnostic with an exact `VIBIUM_BROWSER_PATH`
 * export the user can add. Silent modifications to system state are out
 * of scope for an installer that runs during `aqe init`.
 */
export function diagnosePlatform(probe: PlatformProbe = defaultPlatformProbe): PlatformHint | undefined {
  if (probe.platform() !== 'linux') return undefined;
  if (probe.arch() !== 'arm64') return undefined;

  const browserPath = LINUX_SYSTEM_CHROMIUM_PATHS.find((p) => probe.existsSync(p));
  if (browserPath) {
    return {
      code: 'linux-arm64-system-chromium-found',
      browserPath,
      message:
        `Linux aarch64 detected. Vibium v26.3.x does not auto-download Chrome for Testing on ARM64. ` +
        `Found system browser at ${browserPath}. Export VIBIUM_BROWSER_PATH=${browserPath} before running vibium.`,
    };
  }
  return {
    code: 'linux-arm64-no-system-chromium',
    message:
      `Linux aarch64 detected. Vibium v26.3.x does not auto-download Chrome for Testing on ARM64, and no system ` +
      `chromium was found on PATH (checked: ${LINUX_SYSTEM_CHROMIUM_PATHS.join(', ')}). ` +
      `Install via \`apt-get install chromium\` (or your distro's equivalent), then export ` +
      `VIBIUM_BROWSER_PATH=/usr/bin/chromium before running vibium.`,
  };
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
  const platformProbe = options.platformProbe || defaultPlatformProbe;
  const platformHint = diagnosePlatform(platformProbe);

  const alreadyInstalled = detectVibium(spawner);
  if (alreadyInstalled) {
    return {
      status: 'already-installed',
      version: alreadyInstalled,
      packageSpec,
      platformHint,
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
  return { status: 'installed', version, packageSpec, platformHint };
}
