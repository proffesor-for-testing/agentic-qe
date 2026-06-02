#!/usr/bin/env node
/**
 * Resilient AQE hook shim (#510 item 5 — ports ruflo's hook-shim contract).
 *
 * Written in Node (CommonJS) so ONE file is cross-platform — Node is already a
 * hard dependency of AQE (the CLI is Node >= 20), so this runs identically on
 * Windows / macOS / Linux with no POSIX `.sh` + `.cjs` twin. (It replaced an
 * earlier `aqe-hook.sh`, which forced a Windows twin and a `node_modules/.bin`
 * shell-wrapper spawn — see PR #512 discussion.)
 *
 * Claude Code runs project hooks every turn / tool use. Without this shim the
 * AQE hook commands print init diagnostics to STDOUT before the JSON (e.g.
 * `[hooks] CoherenceService initialized`, `[RVF] Migration adapter active`),
 * polluting the transcript, and a crash/slow init can surface a hook error.
 *
 * Contract:
 *   * resolve a PROJECT-LOCAL AQE bundle and run it via THIS node (no shell, no
 *     .bin/.cmd wrapper, no network/npx);
 *   * if none resolves, no-op (a hook must never block a turn);
 *   * SWALLOW stderr;
 *   * emit ONLY the top-level JSON object on stdout (drop leading init noise AND
 *     trailing async daemon logs) so the --json contract stays parseable;
 *   * ALWAYS exit 0.
 *
 * SCOPE: REPO-INTERNAL dev tool used by this repo's own .claude/settings.json.
 * It is NOT in the npm package `files` list and `aqe init` does NOT copy it —
 * user hooks are generated as `npx agentic-qe hooks <cmd>`. The resolution is
 * portable anyway (correct if ever copied into an installed project).
 *
 * Usage (from .claude/settings.json):
 *   node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/aqe-hook.cjs" <subcommand> [args...] --json
 */

'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT = process.env.CLAUDE_PROJECT_DIR || '.';
const args = process.argv.slice(2); // hook subcommand + its args

// Run `node <bundle> hooks <args>` against a PROJECT-LOCAL AQE, in priority
// order. Running the bundle directly via process.execPath (this node) is fully
// cross-platform — no shell, no node_modules/.bin/aqe(.cmd) wrapper.
//   1. installed dependency  (a user's project)
//   2. local source build    (this repo)
// Deliberately NO global-PATH / npx fallback (version drift + npx-per-fire cost).
const candidates = [
  path.join(PROJECT, 'node_modules', 'agentic-qe', 'dist', 'cli', 'bundle.js'),
  path.join(PROJECT, 'dist', 'cli', 'bundle.js'),
];

let bundle;
for (const p of candidates) {
  try { if (fs.existsSync(p)) { bundle = p; break; } } catch { /* ignore */ }
}
if (!bundle) process.exit(0); // no project-local AQE -> no-op, never block

let out = '';
try {
  const res = spawnSync(process.execPath, [bundle, 'hooks', ...args], {
    stdio: ['ignore', 'pipe', 'ignore'], // swallow stdin + stderr
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  out = res.stdout || '';
} catch { /* never block a turn */ }

// Emit only the top-level JSON object: the first line beginning with '{' through
// the first line beginning with '}' (pretty-printed JSON closes at column 0;
// nested closes are indented). Drops leading init-noise lines AND any async log
// lines printed after the JSON.
const lines = out.split('\n');
const start = lines.findIndex((l) => l.startsWith('{'));
if (start !== -1) {
  let end = lines.length - 1;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].startsWith('}')) { end = i; break; }
  }
  process.stdout.write(lines.slice(start, end + 1).join('\n') + '\n');
}

process.exit(0);
