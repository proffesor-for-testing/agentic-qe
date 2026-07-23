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
const result = spawnSync(process.execPath, [shim, subcommand, '--json'], {
  cwd: root,
  env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  input: JSON.stringify(input),
  encoding: 'utf8',
  timeout: Number(process.env.AQE_CODEX_HOOK_TIMEOUT_MS) || 20000,
  maxBuffer: 4 * 1024 * 1024,
});

if (!result.stdout) process.exit(0);

let output;
try {
  output = JSON.parse(result.stdout);
} catch {
  process.exit(0);
}

// AQE route results are useful context but are not themselves a Codex hook
// response. Wrap them in the supported additional-context envelope.
if (subcommand === 'route' && !output.hookSpecificOutput) {
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
