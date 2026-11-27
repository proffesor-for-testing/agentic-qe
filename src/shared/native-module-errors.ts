/**
 * Native module load-failure diagnostics (issue #1173).
 *
 * better-sqlite3 ships a native addon whose binary is fetched/compiled by its
 * `install` script. npm 12 blocks dependency install scripts unless they are
 * allowed (`allowScripts`), so a plain `npm install -g agentic-qe` leaves the
 * addon missing and the first `new Database()` throws "Could not locate the
 * bindings file". Other installs hit the same wall via a Node upgrade
 * (NODE_MODULE_VERSION mismatch) or an arch mismatch.
 *
 * These helpers recognise those failures and turn them into a message that
 * names the cause and the exact command that fixes it, instead of a 20-line
 * list of probed paths (or, in `aqe init`, nothing at all).
 */

import { createRequire } from 'module';
import { dirname } from 'path';
import { toErrorMessage } from './error-utils.js';
import { AQE_NATIVE_SCRIPT_PACKAGES } from './npx-launch.js';

export type NativeModuleFailureReason =
  | 'missing-binding'
  | 'abi-mismatch'
  | 'load-failed';

export interface NativeModuleFailure {
  /** npm package whose native addon failed to load */
  readonly moduleName: string;
  readonly reason: NativeModuleFailureReason;
  /** First line of the original error, without the probed-path list */
  readonly detail: string;
  /**
   * The npx cache directory (`.../_npx/<hash>`) AQE runs from, when it runs
   * through npx (the Claude Code plugin does). Global and project-local
   * remedies don't reach that directory (issue #1466).
   */
  readonly npxCacheDir?: string;
}

/** Marker present in every remedy we emit; used to avoid double-wrapping. */
export const NATIVE_MODULE_REMEDY_MARKER = 'native module could not be loaded';

/** Packages with install scripts that a global agentic-qe install needs allowed. */
export const AQE_INSTALL_SCRIPT_PACKAGES = 'agentic-qe,better-sqlite3,hnswlib-node';

const MISSING_BINDING_PATTERNS: readonly RegExp[] = [
  /Could not locate the bindings file/i,
];

const ABI_MISMATCH_PATTERNS: readonly RegExp[] = [
  /NODE_MODULE_VERSION/,
  /compiled against a different Node\.js version/i,
  /Module did not self-register/i,
];

const LOAD_FAILED_PATTERNS: readonly RegExp[] = [
  /ERR_DLOPEN_FAILED/,
  /invalid ELF header/i,
  /wrong ELF class/i,
  /incompatible architecture/i,
  /mach-o file, but is an incompatible architecture/i,
  /\.node: cannot open shared object file/i,
  /is not a valid Win32 application/i,
];

function collectMessages(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  // Walk the cause chain: callers commonly re-wrap the original error.
  for (let depth = 0; current !== undefined && current !== null && depth < 5; depth++) {
    parts.push(toErrorMessage(current));
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') parts.push(code);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join('\n');
}

const NPX_CACHE_DIR = /^(.*?[\\/]_npx[\\/][^\\/]+)[\\/]node_modules(?:[\\/]|$)/;

/** The `.../_npx/<hash>` directory a file-system path lies in, or undefined. */
export function findNpxCacheDir(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return NPX_CACHE_DIR.exec(path.trim())?.[1];
}

/**
 * The npx cache directory named in an error's text: the bindings package lists
 * each probed path on its own line (` → /path/...`). Paths may contain spaces,
 * so each line is matched whole after dropping the leading arrow.
 */
export function findNpxCacheDirInText(text: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    // A quoted path (`The module '/x/.node'`) starts after the quote; an
    // unquoted one after a leading arrow or list dash.
    const quoted = /['"`]([^'"`]+)['"`]/.exec(line)?.[1];
    const dir = findNpxCacheDir(quoted ?? line.replace(/^[\s→>-]+/, ''));
    if (dir) return dir;
  }
  return undefined;
}

/** Directory `moduleName` resolves to from AQE's own code, or undefined. */
function locateModule(moduleName: string): string | undefined {
  try {
    return dirname(createRequire(import.meta.url).resolve(`${moduleName}/package.json`));
  } catch {
    return undefined;
  }
}

function firstLine(message: string): string {
  // Drop the dangling "Tried:" that introduces the bindings package's path list.
  const line = message.split('\n')[0].trim();
  return line.endsWith('Tried:') ? line.slice(0, -'Tried:'.length).trimEnd() : line;
}

/**
 * Classify `error` as a native-addon load failure, or return null when it is
 * something else (I/O error, corrupt DB, lock contention, ...).
 */
export function diagnoseNativeModuleError(
  error: unknown,
  moduleName = 'better-sqlite3',
): NativeModuleFailure | null {
  if (error === undefined || error === null) return null;
  const text = collectMessages(error);
  const detail = firstLine(toErrorMessage(error));

  let reason: NativeModuleFailureReason;
  if (MISSING_BINDING_PATTERNS.some((p) => p.test(text))) reason = 'missing-binding';
  else if (ABI_MISMATCH_PATTERNS.some((p) => p.test(text))) reason = 'abi-mismatch';
  else if (LOAD_FAILED_PATTERNS.some((p) => p.test(text))) reason = 'load-failed';
  else return null;

  // Where the module actually resolves from is authoritative; the probed paths
  // in the error text are the fallback when it can't be resolved.
  const moduleDir = locateModule(moduleName);
  const npxCacheDir = moduleDir ? findNpxCacheDir(`${moduleDir}/`) : findNpxCacheDirInText(text);
  return npxCacheDir ? { moduleName, reason, detail, npxCacheDir } : { moduleName, reason, detail };
}

const CAUSE_TEXT: Record<NativeModuleFailureReason, string> = {
  'missing-binding':
    'its compiled binary is missing. Its install script never ran — npm 12+ blocks ' +
    'dependency install scripts unless they are allowed (allowScripts).',
  'abi-mismatch':
    `it was built for a different Node.js version than the one running now (${process.version}). ` +
    'Rebuild it after switching Node versions.',
  'load-failed':
    'the binary exists but the OS refused to load it (wrong platform/architecture or a corrupt build).',
};

const RESTART_LINE =
  '  Then restart AQE: a running MCP server keeps the failed load (in Claude Code, reconnect it from /mcp).';

function npxRemedy(moduleName: string, dir: string, platform: NodeJS.Platform): string[] {
  // One command per line: PowerShell 5.1 has no `&&`, and cmd.exe needs /d to change drive.
  const cd = platform === 'win32' ? `cd /d "${dir}"   (PowerShell: cd "${dir}")` : `cd "${dir}"`;
  const lines = [
    '  AQE is running from the npx cache (the Claude Code plugin starts it this way):',
    `    ${dir}`,
    '  Allow the install scripts there and rebuild:',
    `    ${cd}`,
    `    npm install-scripts approve ${AQE_NATIVE_SCRIPT_PACKAGES.join(' ')}`,
    `    npm rebuild ${moduleName}`,
  ];
  const others = AQE_NATIVE_SCRIPT_PACKAGES.filter((name) => name !== moduleName);
  if (others.length > 0) {
    lines.push(`  Optionally also run \`npm rebuild ${others.join(' ')}\` there (it compiles from source and needs a C++ toolchain).`);
  }
  return lines;
}

/** Multi-line, actionable explanation for a diagnosed native-module failure. */
export function formatNativeModuleRemedy(
  failure: NativeModuleFailure,
  platform: NodeJS.Platform = process.platform,
): string {
  const { moduleName } = failure;
  const fixes = failure.npxCacheDir
    ? npxRemedy(moduleName, failure.npxCacheDir, platform)
    : [
        '  Fix a global install (reinstall, naming the package):',
        `    npm install -g agentic-qe --allow-scripts=${AQE_INSTALL_SCRIPT_PACKAGES}`,
        '  Or rebuild just the native module in an existing global install:',
        `    npm rebuild -g ${moduleName} --allow-scripts=${moduleName}`,
        '  For a project-local install (devDependency), run in the project:',
        `    npm install-scripts approve ${moduleName} && npm rebuild ${moduleName}`,
        '  If AQE runs through npx, run the project-local commands inside its npx cache directory (~/.npm/_npx/<hash>).',
      ];
  return [
    `${moduleName} ${NATIVE_MODULE_REMEDY_MARKER}: ${CAUSE_TEXT[failure.reason]}`,
    ...fixes,
    RESTART_LINE,
    `  Original error: ${failure.detail}`,
  ].join('\n');
}

/**
 * Error raised when a native addon cannot be loaded. The message carries the
 * remedy; the original error is preserved as `cause`.
 */
export class NativeModuleLoadError extends Error {
  readonly moduleName: string;
  readonly reason: NativeModuleFailureReason;

  constructor(failure: NativeModuleFailure, cause: unknown) {
    super(formatNativeModuleRemedy(failure), { cause });
    this.name = 'NativeModuleLoadError';
    this.moduleName = failure.moduleName;
    this.reason = failure.reason;
  }
}

/**
 * Return a NativeModuleLoadError for native-load failures, or the original
 * error unchanged otherwise. Idempotent: an error that already carries the
 * remedy is returned as-is.
 */
export function withNativeModuleRemedy(error: unknown, moduleName = 'better-sqlite3'): unknown {
  if (error instanceof NativeModuleLoadError) return error;
  if (toErrorMessage(error).includes(NATIVE_MODULE_REMEDY_MARKER)) return error;
  const failure = diagnoseNativeModuleError(error, moduleName);
  return failure ? new NativeModuleLoadError(failure, error) : error;
}

/** True when `error` (or its message, after re-wrapping) is a native-load failure. */
export function isNativeModuleLoadFailure(error: unknown): boolean {
  return error instanceof NativeModuleLoadError
    || toErrorMessage(error).includes(NATIVE_MODULE_REMEDY_MARKER)
    || diagnoseNativeModuleError(error) !== null;
}
