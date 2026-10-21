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

import { toErrorMessage } from './error-utils.js';

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

  if (MISSING_BINDING_PATTERNS.some((p) => p.test(text))) {
    return { moduleName, reason: 'missing-binding', detail };
  }
  if (ABI_MISMATCH_PATTERNS.some((p) => p.test(text))) {
    return { moduleName, reason: 'abi-mismatch', detail };
  }
  if (LOAD_FAILED_PATTERNS.some((p) => p.test(text))) {
    return { moduleName, reason: 'load-failed', detail };
  }
  return null;
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

/** Multi-line, actionable explanation for a diagnosed native-module failure. */
export function formatNativeModuleRemedy(failure: NativeModuleFailure): string {
  const { moduleName } = failure;
  return [
    `${moduleName} ${NATIVE_MODULE_REMEDY_MARKER}: ${CAUSE_TEXT[failure.reason]}`,
    '  Fix a global install (reinstall, naming the package):',
    `    npm install -g agentic-qe --allow-scripts=${AQE_INSTALL_SCRIPT_PACKAGES}`,
    '  Or rebuild just the native module in an existing global install:',
    `    npm rebuild -g ${moduleName} --allow-scripts=${moduleName}`,
    '  For a project-local install (devDependency), run in the project:',
    `    npm install-scripts approve ${moduleName} && npm rebuild ${moduleName}`,
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
