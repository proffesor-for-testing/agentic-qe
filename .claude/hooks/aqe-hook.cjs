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
 *     .bin/.cmd wrapper) — or fall back to `npx agentic-qe` for npx-only installs
 *     (disable that fallback with AQE_HOOK_NPX=0);
 *   * if nothing resolves, no-op (a hook must never block a turn);
 *   * keep stderr OUT of the transcript, but tee fatal native-init markers
 *     (e.g. better-sqlite3 `invalid ELF header`) to a throttled, durable
 *     .agentic-qe/hooks-health.log so a dead persistence layer is detectable
 *     instead of silently dropping all learning;
 *   * emit ONLY the top-level JSON object on stdout (drop leading init noise AND
 *     trailing async daemon logs) so the --json contract stays parseable;
 *   * ALWAYS exit 0.
 *
 * SCOPE: shipped in the npm package (`files` includes `.claude/hooks`) and
 * copied into each user project by `aqe init`, which generates settings.json
 * hooks of the form `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/aqe-hook.cjs"
 * <cmd> ...`. This repo's own .claude/settings.json dogfoods the same file.
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

// Resolve how to run `<runner> hooks <args>`, in priority order:
//   1. installed dependency bundle  (a user's project: node_modules/agentic-qe)
//   2. local source build           (this repo: ./dist)
//   -> run either directly via process.execPath (this node): no shell, no
//      node_modules/.bin/aqe(.cmd) wrapper, fully cross-platform.
//   3. npx fallback                  (npx-only installs with no project-local
//      bundle) — `npx -y --prefer-offline agentic-qe hooks ...`. Disable with
//      AQE_HOOK_NPX=0 (used by tests and by anyone who never wants a network
//      reach). When disabled and no local bundle exists, we no-op.
const candidates = [
  path.join(PROJECT, 'node_modules', 'agentic-qe', 'dist', 'cli', 'bundle.js'),
  path.join(PROJECT, 'dist', 'cli', 'bundle.js'),
];

let cmd;
let cmdArgs;
let bundle;
for (const p of candidates) {
  try { if (fs.existsSync(p)) { bundle = p; break; } } catch { /* ignore */ }
}
if (bundle) {
  cmd = process.execPath;
  cmdArgs = [bundle, 'hooks', ...args];
} else if (process.env.AQE_HOOK_NPX !== '0') {
  cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  cmdArgs = ['-y', '--prefer-offline', 'agentic-qe', 'hooks', ...args];
} else {
  process.exit(0); // no project-local AQE and npx disabled -> no-op, never block
}

// Fatal init markers that mean the hook ran but its persistence layer is dead
// (e.g. a host/container native-binary mismatch clobbering better-sqlite3 —
// `invalid ELF header`). These used to vanish into the swallowed stderr, so a
// broken binary silently stopped ALL learning for days with zero trace. We
// still keep stderr OUT of the transcript, but tee fatal markers to a durable,
// throttled health log so the failure is detectable instead of invisible.
const FATAL_MARKERS = [
  'invalid ELF header',
  'Failed to initialize UnifiedMemoryManager',
  'ERR_DLOPEN_FAILED',
  'was compiled against a different Node.js version',
];

function recordHookHealth(stderr) {
  try {
    if (!stderr) return;
    const hit = FATAL_MARKERS.find((m) => stderr.includes(m));
    if (!hit) return;
    const logPath = path.join(PROJECT, '.agentic-qe', 'hooks-health.log');
    // Throttle: skip if we logged within the last 5 min (avoid a line/turn).
    try {
      const st = fs.statSync(logPath);
      if (Date.now() - st.mtimeMs < 5 * 60 * 1000) return;
    } catch { /* no log yet — fall through and create it */ }
    const subcmd = args[0] || 'unknown';
    const line = `[${new Date().toISOString()}] FATAL hook persistence failure `
      + `(cmd=${subcmd}): "${hit}". Learning is NOT being captured. `
      + `Fix: \`npm rebuild better-sqlite3\` (host/container native-binary mismatch).\n`;
    fs.appendFileSync(logPath, line);
  } catch { /* health logging must never block a turn */ }
}

let out = '';
try {
  const res = spawnSync(cmd, cmdArgs, {
    stdio: ['ignore', 'pipe', 'pipe'], // swallow stdin; capture stderr to scan
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  out = (res && res.stdout) || '';
  recordHookHealth((res && res.stderr) || ''); // tee fatal markers to health log
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
