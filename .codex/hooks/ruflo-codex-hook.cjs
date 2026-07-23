#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let input = {};
let rawInput = '';
try {
  rawInput = fs.readFileSync(0, 'utf8');
  input = JSON.parse(rawInput || '{}');
} catch {
  process.exit(0);
}

const git = input.cwd
  ? spawnSync('git', ['-C', input.cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      timeout: 1000,
    })
  : null;
const root = git && git.status === 0 ? git.stdout.trim() : '';
if (!root) process.exit(0);

const requested = process.argv[2];
if (!requested) process.exit(0);

const toolInput = input.tool_input || {};
const toolResponse = input.tool_response || input.tool_result || {};
const args = [requested];

function add(flag, value) {
  if (value !== undefined && value !== null && String(value).length) {
    args.push(flag, String(value));
  }
}

switch (requested) {
  case 'route':
  case 'pre-task':
    add('--task', input.prompt || input.user_prompt || toolInput.prompt);
    break;
  case 'pre-command':
  case 'post-command':
    add('--command', toolInput.command);
    if (requested === 'post-command') {
      add('--success', toolResponse.success !== false);
    }
    break;
  case 'pre-edit':
  case 'post-edit':
    add(
      '--file',
      toolInput.file_path || toolInput.path || toolInput.target_file,
    );
    if (requested === 'post-edit') {
      add('--success', toolResponse.success !== false);
    }
    break;
  case 'session-restore':
  case 'session-end':
    add('--session-id', input.session_id);
    break;
  case 'post-task':
    add('--task-id', input.agent_id || input.subagent_id || input.turn_id);
    add('--success', true);
    break;
  default:
    break;
}

const codexHelper = path.join(root, '.codex', 'hooks', 'ruflo-runtime.cjs');
const helper = fs.existsSync(codexHelper)
  ? codexHelper
  : path.join(root, '.claude', 'helpers', 'ruflo-hook.cjs');
if (!fs.existsSync(helper)) process.exit(0);

// Ruflo is development-time coordination tooling. Keep this hook fail-open,
// avoid network installation during a lifecycle event, and suppress its
// provider-specific output rather than exposing unsupported Codex hook fields.
spawnSync(process.execPath, [helper, ...args], {
  cwd: root,
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: root,
    RUFLO_HOOK_NPX: '0',
  },
  input: rawInput,
  stdio: ['pipe', 'ignore', 'ignore'],
  timeout: Number(process.env.RUFLO_CODEX_HOOK_TIMEOUT_MS) || 15000,
});

process.exit(0);
