// Shared helpers for qe-browser scripts.
// Shells out to the `vibium` CLI and parses its --json output.
//
// Why shell-out instead of the vibium npm client:
//   - Keeps this wrapper language-agnostic and truly thin
//   - Matches how other AQE skills (a11y-ally, testability-scoring) invoke external tools
//   - Lets us upgrade Vibium independently without touching our code

'use strict';

const { spawnSync } = require('node:child_process');

const SKILL_NAME = 'qe-browser';
const SKILL_VERSION = '1.0.0';
const TRUST_TIER = 3;

// F1 (Phase 6): typed error so downstream skills can distinguish
// "vibium isn't installed" from "vibium ran but the test failed".
// The Fallback Policy in SKILL.md says scripts must surface this as a
// status: "skipped" envelope with reason: "browser-engine-unavailable"
// — see unavailableEnvelope() / runOrSkip() below.
class VibiumUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VibiumUnavailableError';
    // Stable contract field that downstream code can `instanceof`-check OR
    // duck-type via this property when crossing module boundaries (e.g.
    // when the helper is loaded from a different node_modules tree).
    this.code = 'BROWSER_ENGINE_UNAVAILABLE';
  }
}

// Inject `--headless` into every vibium call by default. The qe-browser
// helper scripts are designed for QE / CI use cases where there's no
// display server, and Vibium defaults to "visible by default" which fails
// in headless containers with "Missing X server or $DISPLAY". Users who
// want a visible browser for interactive debugging should call vibium
// directly, not through these helpers.
//
// Opt out by setting QE_BROWSER_HEADED=1 in the environment.
function injectHeadless(args) {
  if (process.env.QE_BROWSER_HEADED === '1') return args;
  if (args.includes('--headless') || args.includes('--headed')) return args;
  return ['--headless', ...args];
}

function vibium(args, { input, timeoutMs = 30000 } = {}) {
  const finalArgs = injectHeadless(args);
  const result = spawnSync('vibium', finalArgs, {
    encoding: 'utf8',
    input,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });

  // F1: throw a TYPED error so the per-script main() can catch instanceof
  // VibiumUnavailableError and emit the documented "skipped" envelope
  // instead of a generic "failed" with the reason buried in `actual`.
  if (result.error && result.error.code === 'ENOENT') {
    throw new VibiumUnavailableError(
      'vibium binary not found on PATH. Install via `npm install -g vibium` or run `aqe init`.'
    );
  }

  return {
    status: result.status,
    stdout: (result.stdout || '').toString(),
    stderr: (result.stderr || '').toString(),
  };
}

function vibiumJson(args, opts) {
  const withJson = args.includes('--json') ? args : [...args, '--json'];
  const res = vibium(withJson, opts);
  if (res.status !== 0) {
    const err = new Error(
      `vibium ${args[0] || ''} exited ${res.status}: ${res.stderr.trim() || res.stdout.trim()}`
    );
    err.stdout = res.stdout;
    err.stderr = res.stderr;
    err.exitCode = res.status;
    throw err;
  }
  const trimmed = res.stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_err) {
    // Some vibium commands emit non-JSON even with --json on error paths;
    // return raw text so callers can decide what to do.
    return { __raw: trimmed };
  }
}

// Vibium's `eval` (with or without --stdin) returns the LAST EXPRESSION's
// value, NOT console.log output. With --json the response shape is:
//   { ok: true, result: "<stringified value>" }
// where `result` is a STRING if the expression returned a string, or a
// Go-side serialization if it returned a non-string object. So our scripts
// MUST wrap their return value in JSON.stringify(...) and we parse the
// `result` field as JSON ourselves to get a real JS object back.
//
// Verified on Vibium v26.3.18 (2026-04-09).
function unwrapEvalResult(payload) {
  if (payload === null || payload === undefined) return null;
  // payload from vibiumJson is already a parsed object: { ok, result } or { __raw }
  if (payload && typeof payload === 'object' && 'ok' in payload && 'result' in payload) {
    if (payload.ok !== true) {
      throw new Error(`vibium eval failed: ${JSON.stringify(payload)}`);
    }
    const result = payload.result;
    if (typeof result === 'string') {
      // The script wrapped its return value in JSON.stringify so parse it.
      try {
        return JSON.parse(result);
      } catch (_e) {
        return result;
      }
    }
    return result;
  }
  return payload;
}

function vibiumEval(expression) {
  const raw = vibiumJson(['eval', '--json', expression]);
  return unwrapEvalResult(raw);
}

function vibiumEvalStdin(script) {
  const raw = vibiumJson(['eval', '--stdin', '--json'], { input: script });
  return unwrapEvalResult(raw);
}

function envelope({
  operation,
  summary,
  status = 'success',
  details = {},
  metadata = {},
  vibiumUnavailable = false,
  reason = undefined,
}) {
  const env = {
    skillName: SKILL_NAME,
    version: SKILL_VERSION,
    timestamp: new Date().toISOString(),
    status,
    trustTier: TRUST_TIER,
    output: {
      operation,
      summary,
      ...details,
    },
    metadata,
  };
  // Top-level flag so downstream skills can branch on the contract without
  // walking output.* sub-fields. Only set when true to keep the happy-path
  // envelope shape unchanged for the 99% case.
  if (vibiumUnavailable) env.vibiumUnavailable = true;
  if (reason !== undefined) env.output.reason = reason;
  return env;
}

// F1: produce the documented "skipped" envelope when vibium is missing.
// Contract per SKILL.md Fallback Policy:
//   status:                 "skipped"
//   output.reason:          "browser-engine-unavailable"
//   vibiumUnavailable:      true (top-level)
//   output.summary:         actionable install guidance
function unavailableEnvelope(operation, message) {
  return envelope({
    operation,
    summary: message,
    status: 'skipped',
    vibiumUnavailable: true,
    reason: 'browser-engine-unavailable',
    details: {
      error: message,
      remediation: [
        'Install vibium globally: `npm install -g vibium`',
        'Or re-run `aqe init` to install via the AQE bootstrap',
        'Set QE_BROWSER_HEADED=1 only for interactive debugging (not the cause here)',
      ],
    },
    metadata: { executionTimeMs: 0 },
  });
}

// Predicate so per-script catch blocks can decide whether to swallow an
// error (regular failure) or re-throw it so the outer runOrSkip can emit
// the skipped envelope. Cross-module-safe via the duck-typed `code` field.
function isVibiumUnavailable(err) {
  return Boolean(
    err &&
      (err instanceof VibiumUnavailableError ||
        err.code === 'BROWSER_ENGINE_UNAVAILABLE' ||
        // The error string from vibium() also matches as a final fallback
        // in case both the prototype and the code field were lost while
        // crossing some serialization boundary.
        (typeof err.message === 'string' &&
          err.message.includes('vibium binary not found on PATH')))
  );
}

// rethrowIfUnavailable: helper to use INSIDE per-script catch blocks so
// that the documented missing-vibium contract bubbles past lower-level
// "convert exception to failed envelope" handlers and reaches runOrSkip.
//
// Usage:
//   try { ... vibium calls ... }
//   catch (err) {
//     rethrowIfUnavailable(err);
//     return fail('myop', err.message);
//   }
function rethrowIfUnavailable(err) {
  if (isVibiumUnavailable(err)) {
    if (err instanceof VibiumUnavailableError) throw err;
    // Promote a duck-typed error to a real VibiumUnavailableError so
    // downstream code only has to handle one type.
    throw new VibiumUnavailableError(err.message || 'browser engine unavailable');
  }
}

// runOrSkip wraps a per-script main() so that any VibiumUnavailableError
// thrown anywhere inside the operation is converted to the documented
// skipped envelope. Each helper script's main() is `() => fn()` returning
// the exit code from emit(). On unavailable, we emit() the skipped envelope
// and return its exit code (2).
function runOrSkip(operation, fn) {
  try {
    return fn();
  } catch (err) {
    if (isVibiumUnavailable(err)) {
      return emit(unavailableEnvelope(operation, err.message));
    }
    throw err;
  }
}

// parseArgs supports both `--key value` and `--key=value` forms.
//
// M5 (devil's-advocate finding): the previous implementation only handled
// the space-separated form. A user typing `--threshold=0.5` got
// `args['threshold=0.5'] = true` and a separate `args.threshold` was never
// set, so the value silently defaulted. The equals form is the dominant
// idiom in npm/node CLIs (`node --inspect=9229`), so we accept both. When
// the next token is itself a flag (`--include-hidden --json`) we treat the
// current flag as boolean — the same behavior as before.
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const stripped = token.slice(2);
    // --key=value form: split on first '=' only so values containing '='
    // (URLs, regex with capture group names, base64) survive intact.
    const eqIdx = stripped.indexOf('=');
    if (eqIdx !== -1) {
      const key = stripped.slice(0, eqIdx);
      const value = stripped.slice(eqIdx + 1);
      args[key] = value;
      continue;
    }
    const key = stripped;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readInlineOrFile(value) {
  if (typeof value !== 'string') return value;
  if (value.startsWith('@')) {
    const fs = require('node:fs');
    return fs.readFileSync(value.slice(1), 'utf8');
  }
  return value;
}

// Exit code contract (F1):
//   0 — success: every assertion passed / operation completed cleanly
//   1 — failed:  genuine assertion failure or operation error
//   2 — skipped: vibium unavailable; environment problem, not a test result
//
// CI tooling can use this to distinguish "test legitimately failed" from
// "we couldn't run the test because the browser engine isn't installed."
function emit(env) {
  process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
  if (env.status === 'success') return 0;
  if (env.status === 'skipped') return 2;
  return 1;
}

function fail(operation, message, metadata = {}) {
  return emit(
    envelope({
      operation,
      summary: message,
      status: 'failed',
      details: { error: message },
      metadata,
    })
  );
}

module.exports = {
  SKILL_NAME,
  SKILL_VERSION,
  TRUST_TIER,
  VibiumUnavailableError,
  isVibiumUnavailable,
  rethrowIfUnavailable,
  vibium,
  vibiumJson,
  vibiumEval,
  vibiumEvalStdin,
  envelope,
  unavailableEnvelope,
  runOrSkip,
  parseArgs,
  readInlineOrFile,
  emit,
  fail,
};
