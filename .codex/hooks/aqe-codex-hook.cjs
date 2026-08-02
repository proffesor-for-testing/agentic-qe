#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

let input = {};
try {
  input = JSON.parse(require('node:fs').readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const root = input.cwd
  ? spawnSync('git', ['-C', input.cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      timeout: 1000,
    }).stdout.trim()
  : '';
if (!root) process.exit(0);

const subcommand = process.argv[2];
if (!subcommand) process.exit(0);

const codexShim = path.join(root, '.codex', 'hooks', 'aqe-runtime.cjs');
const shim = require('node:fs').existsSync(codexShim)
  ? codexShim
  : path.join(root, '.claude', 'hooks', 'aqe-hook.cjs');
const adapterTimeout = Number(process.env.AQE_CODEX_HOOK_TIMEOUT_MS) || 25000;
const runtimeTimeout = Number(process.env.AQE_HOOK_TIMEOUT_MS)
  || Math.max(1000, adapterTimeout - 3000);

function runAqe(command, extraArgs = []) {
  return spawnSync(process.execPath, [shim, command, ...extraArgs, '--json'], {
    cwd: root,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: root,
      AQE_HOOK_TIMEOUT_MS: String(runtimeTimeout),
    },
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: adapterTimeout,
    maxBuffer: 4 * 1024 * 1024,
  });
}

// Stop closes the current route-learning sentinel before session cleanup.
// Both AQE commands emit internal telemetry, so return no Codex JSON.
if (subcommand === 'stop') {
  runAqe('post-route', ['--success', 'true']);
  runAqe('session-end', ['--save-state']);
  process.exit(0);
}

const result = runAqe(subcommand);

// These commands produce AQE/Claude hook response shapes. Codex treats an
// empty successful response as continue, which preserves their side effects
// without forwarding unsupported permissionDecision or telemetry fields.
if (subcommand !== 'route') process.exit(0);

if (!result.stdout) process.exit(0);

let output;
try {
  output = JSON.parse(result.stdout);
} catch {
  process.exit(0);
}

// AQE route results are useful context but are not themselves a Codex hook
// response. Wrap them in the supported additional-context envelope.
if (!output.hookSpecificOutput) {
  const agent = output.recommendedAgent || 'unspecified';
  const confidence = Number.isFinite(output.confidence)
    ? ` (${Math.round(output.confidence * 100)}% confidence)`
    : '';
  const domains = Array.isArray(output.domains) && output.domains.length
    ? ` Domains: ${output.domains.join(', ')}.`
    : '';
  const guidance = Array.isArray(output.guidance) && output.guidance.length
    ? ` Guidance: ${output.guidance.join('; ')}.`
    : '';
  output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        `AQE routing recommends ${agent}${confidence}.${domains}${guidance}`,
    },
  };
}

process.stdout.write(`${JSON.stringify(output)}\n`);
