/**
 * Agentic QE v3 - CLI Log Gate
 *
 * Single place that decides how much internal diagnostic output a CLI
 * invocation prints. Two kinds of diagnostics exist in the codebase:
 *
 *   1. Structured logger output (LoggerFactory / ConsoleLogger), formatted as
 *      "[HH:MM:SS.mmm] [INFO ] [domain] message".
 *   2. Ad-hoc console calls with a bracketed tag, e.g.
 *      console.log('[UnifiedMemory] Initialized: ...').
 *
 * Both are routed to stderr (stdout stays clean for JSON/CI consumers) and
 * filtered against one threshold resolved from the environment:
 *
 *   AQE_LOG_LEVEL  debug | info | warn | error | silent   (highest precedence)
 *   LOG_LEVEL      same values
 *   AQE_VERBOSE    1 | true | yes | on  -> info
 *   (default)      warn
 *
 * Regular command output (anything without a bracketed tag) is never touched.
 */

import { format } from 'node:util';
import { LogLevel, LoggerFactory } from '../logging/index.js';

type ConsoleMethod = 'log' | 'info' | 'debug' | 'warn' | 'error';

type ConsoleLike = Pick<Console, ConsoleMethod>;

/** Default threshold for CLI commands when nothing is configured. */
export const DEFAULT_CLI_LOG_LEVEL = LogLevel.WARN;

const LEVEL_NAMES: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  warning: LogLevel.WARN,
  error: LogLevel.ERROR,
  silent: LogLevel.SILENT,
  none: LogLevel.SILENT,
  off: LogLevel.SILENT,
};

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** "[10:01:10.407] [INFO ] ..." or "[2026-09-28T10:01:10.407Z] [WARN ] ..." */
const STRUCTURED_RE =
  /^\[(?:\d{2}:\d{2}:\d{2}\.\d{3}|\d{4}-\d{2}-\d{2}T[^\]]+)\]\s+\[(DEBUG|INFO|WARN|ERROR)\s*\]/;

/**
 * "[UnifiedMemory] ...", "[sona-three-loop] ...", "[quality-assessment/rl] ...".
 * Requires a letter first and whitespace after the closing bracket so JSON
 * arrays such as '["a"]' or '[true]' are never mistaken for diagnostics.
 */
const TAGGED_RE = /^\[[A-Za-z][\w./:-]*\]\s/;

const TAG_METHOD_LEVEL: Record<ConsoleMethod, LogLevel> = {
  debug: LogLevel.DEBUG,
  log: LogLevel.INFO,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

let currentLevel: LogLevel = DEFAULT_CLI_LOG_LEVEL;

function parseLevel(value: string | undefined): LogLevel | undefined {
  if (!value) return undefined;
  return LEVEL_NAMES[value.trim().toLowerCase()];
}

/**
 * Resolve the effective CLI log level from the environment.
 * Unrecognised values are ignored rather than silently mapped to INFO.
 */
export function resolveCliLogLevel(
  env: NodeJS.ProcessEnv = process.env,
  defaultLevel: LogLevel = DEFAULT_CLI_LOG_LEVEL
): LogLevel {
  const explicit = parseLevel(env.AQE_LOG_LEVEL) ?? parseLevel(env.LOG_LEVEL);
  if (explicit !== undefined) return explicit;
  if (env.AQE_VERBOSE && TRUTHY.has(env.AQE_VERBOSE.trim().toLowerCase())) {
    return LogLevel.INFO;
  }
  return defaultLevel;
}

/**
 * Classify a console call. Returns the diagnostic level of the line, or null
 * when the line is regular command output that must pass through untouched.
 */
export function classifyConsoleLine(method: ConsoleMethod, firstArg: unknown): LogLevel | null {
  if (typeof firstArg !== 'string') return null;
  const text = firstArg.replace(ANSI_RE, '').trimStart();

  const structured = STRUCTURED_RE.exec(text);
  if (structured) {
    return LEVEL_NAMES[structured[1].toLowerCase()];
  }
  if (TAGGED_RE.test(text)) {
    return TAG_METHOD_LEVEL[method];
  }
  return null;
}

/** Current CLI log threshold. */
export function getCliLogLevel(): LogLevel {
  return currentLevel;
}

/** True when diagnostics at `level` should be printed. */
export function isCliLogLevelEnabled(level: LogLevel): boolean {
  return level >= currentLevel && currentLevel !== LogLevel.SILENT;
}

/**
 * Change the threshold at runtime. Also reconfigures LoggerFactory so loggers
 * created afterwards filter at the source instead of relying on the gate.
 */
export function setCliLogLevel(level: LogLevel): void {
  currentLevel = level;
  LoggerFactory.setLevel(level);
}

export interface InstallCliLogGateOptions {
  level?: LogLevel;
  target?: ConsoleLike;
  writeStderr?: (text: string) => void;
}

/**
 * Patch the console so internal diagnostics are routed to stderr and filtered
 * by the CLI log level. Returns a function that restores the original methods.
 */
export function installCliLogGate(options: InstallCliLogGateOptions = {}): () => void {
  const target = options.target ?? console;
  const writeStderr = options.writeStderr ?? ((text: string) => { process.stderr.write(text); });
  setCliLogLevel(options.level ?? resolveCliLogLevel());

  const original: ConsoleLike = {
    log: target.log.bind(target),
    info: target.info.bind(target),
    debug: target.debug.bind(target),
    warn: target.warn.bind(target),
    error: target.error.bind(target),
  };

  const toStderr = (args: unknown[]) => writeStderr(format(...args) + '\n');

  const gate = (method: ConsoleMethod, passthrough: (args: unknown[]) => void, emit: (args: unknown[]) => void) =>
    (...args: unknown[]) => {
      const level = classifyConsoleLine(method, args[0]);
      if (level === null) {
        passthrough(args);
      } else if (isCliLogLevelEnabled(level)) {
        emit(args);
      }
    };

  // log/debug output normally goes to stdout; diagnostics are moved to stderr.
  target.log = gate('log', args => original.log(...args), toStderr);
  target.debug = gate('debug', args => original.debug(...args), toStderr);
  // console.info has always been redirected to stderr by the CLI.
  target.info = gate('info', toStderr, toStderr);
  // warn/error already target stderr; keep their native formatting.
  target.warn = gate('warn', args => original.warn(...args), args => original.warn(...args));
  target.error = gate('error', args => original.error(...args), args => original.error(...args));

  return () => {
    target.log = original.log;
    target.info = original.info;
    target.debug = original.debug;
    target.warn = original.warn;
    target.error = original.error;
  };
}
