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

function vibium(args, { input, timeoutMs = 30000 } = {}) {
  const result = spawnSync('vibium', args, {
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

function vibiumEval(expression) {
  return vibiumJson(['eval', '--json', expression]);
}

function vibiumEvalStdin(script) {
  return vibiumJson(['eval', '--stdin', '--json'], { input: script });
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
