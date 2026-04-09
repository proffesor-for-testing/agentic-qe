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

  if (result.error && result.error.code === 'ENOENT') {
    throw new Error(
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

function envelope({ operation, summary, status = 'success', details = {}, metadata = {} }) {
  return {
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
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
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

function emit(env) {
  process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
  return env.status === 'success' ? 0 : 1;
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
  vibium,
  vibiumJson,
  vibiumEval,
  vibiumEvalStdin,
  envelope,
  parseArgs,
  readInlineOrFile,
  emit,
  fail,
};
