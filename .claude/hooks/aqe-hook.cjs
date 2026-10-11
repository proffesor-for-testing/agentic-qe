#!/usr/bin/env node
/**
 * Resilient AQE hook shim (#510 item 5 — ports ruflo's hook-shim contract).
 *
 * Written in Node (CommonJS) so ONE file is cross-platform — Node is already a
 * hard dependency of AQE (the CLI is Node >= 22.13), so this runs identically on
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
 *   * resolve a PROJECT-LOCAL AQE bundle and run it via THIS node (no shell),
 *     or invoke an already-installed `aqe` binary without package-manager or
 *     network resolution (on Windows: the global install's bundle, never the
 *     `aqe.cmd` shim — see resolveAqeInvocation, #872);
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

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT = process.env.CLAUDE_PROJECT_DIR || '.';
const args = process.argv.slice(2); // hook subcommand + its args

const BUNDLE_IN_PACKAGE = ['node_modules', 'agentic-qe', 'dist', 'cli', 'bundle.js'];
// Script shims that Node cannot start without a shell (.ps1 is never directly
// executable at all). They are only ever READ to find the JS entry behind them.
// Windows ignores trailing dots/spaces in file names, so `aqe.cmd.` IS aqe.cmd.
const SCRIPT_SHIM = /\.(cmd|bat|ps1)[. ]*$/i;
const PREFIX_CACHE_TTL_MS = 5 * 60 * 1000;
const PREFIX_CACHE_MAX_BYTES = 4096;

function existsSafe(p) { try { return fs.existsSync(p); } catch { return false; } }
function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

/** Env lookup that is case-insensitive on Windows (PATH is usually `Path`). */
function envGet(env, name, platform) {
  if (platform !== 'win32') return env[name];
  const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : env[key];
}

/**
 * The target a package-manager `.cmd` shim launches, relative to its directory:
 *   npm:     "%_prog%"  "%dp0%\node_modules\agentic-qe\dist\cli\bundle.js" %*
 *   pnpm:    "%~dp0\global\5\node_modules\agentic-qe\dist\cli\bundle.js" %*
 *   yarn v1: @"%~dp0\..\Data\global\node_modules\.bin\aqe.cmd"   %*  (another .cmd)
 * Volta's `volta run %~n0 %*` names no file, so it yields null.
 */
function parseCmdShimTarget(shimPath, content, p) {
  const m = /"%~?dp0%?\\([^"%]+\.(?:[cm]?js|cmd|bat))"/i.exec(content || '');
  return m ? p.join(p.dirname(shimPath), ...m[1].split(/[\\/]+/)) : null;
}

/**
 * The JS bundle behind a shim: its parsed JS target, else npm's layout beside
 * it, else (yarn v1) ONE hop through the `.cmd` it delegates to. Files are only
 * read; the result is always run via node, never as a script.
 */
function shimBundle(shim, p, exists, readFile, hops) {
  if (!exists(shim)) return null;
  const target = parseCmdShimTarget(shim, readFile(shim), p);
  const direct = [target && /\.[cm]?js$/i.test(target) ? target : null,
    p.join(p.dirname(shim), ...BUNDLE_IN_PACKAGE)];
  for (const b of direct) if (b && exists(b)) return b;
  if (hops > 0 && target && /\.(cmd|bat)$/i.test(target)) {
    return shimBundle(target, p, exists, readFile, hops - 1);
  }
  return null;
}

/**
 * `npm prefix -g` costs a node spawn (up to 1.5s) and only runs when nothing
 * else resolved, i.e. on EVERY hook while AQE is unresolvable. Cache the answer
 * (including "none") per node binary for a few minutes in the project's
 * .agentic-qe/ (not a shared temp dir another user could pre-seed).
 */
function cachedNpmPrefix(lookup, execPath, p, exists, cacheFile, now) {
  if (!cacheFile) return lookup(execPath, p, exists);
  try {
    // Never follow a symlink/junction or read something huge: regular file only.
    const st = fs.lstatSync(cacheFile);
    if (st.isFile() && st.size <= PREFIX_CACHE_MAX_BYTES) {
      const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (c && c.execPath === execPath && now - c.at >= 0 && now - c.at < PREFIX_CACHE_TTL_MS) {
        return typeof c.prefix === 'string' ? c.prefix : null;
      }
    }
  } catch { /* no or unreadable cache: look it up */ }
  const prefix = lookup(execPath, p, exists) || null;
  writeFileAtomic(cacheFile, JSON.stringify({ execPath, prefix, at: now }));
  return prefix;
}

/**
 * Write via a fresh temp file (O_EXCL: never opens an existing path or follows
 * a planted link) + rename. rename REPLACES a symlink at the destination rather
 * than writing through it, and readers never see a torn file. Best-effort.
 */
function writeFileAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, data, { flag: 'wx' });
    fs.renameSync(tmp, file);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* nothing to clean up */ }
  }
}

/** `npm prefix -g` via the npm CLI bundled next to node.exe: no shell, no .cmd. */
function npmGlobalPrefix(execPath, p, exists) {
  const npmCli = p.join(p.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!exists(npmCli)) return null;
  try {
    const r = childProcess.spawnSync(execPath, [npmCli, 'prefix', '-g'], {
      encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    });
    return r && r.status === 0 && r.stdout ? r.stdout.trim() || null : null;
  } catch { return null; }
}

/**
 * Resolve how to run `<runner> hooks <args>`, in priority order:
 *   1. AQE_HOOK_BUNDLE, the installed dependency bundle (node_modules/agentic-qe)
 *      or a local source build (./dist), run via process.execPath (this node):
 *      no shell, no node_modules/.bin/aqe(.cmd) wrapper.
 *   2. POSIX: the installed `aqe` binary (AQE_HOOK_BIN is a test/managed-install
 *      seam). No package manager is ever invoked from a lifecycle hook.
 *   3. Windows (#872): NEVER spawn `aqe.cmd`. Since the CVE-2024-27980 fix Node
 *      refuses to start .cmd/.bat without `shell: true` (EINVAL), and a shell
 *      would expose Claude Code-supplied arguments (--command, prompt text) to
 *      cmd.exe metacharacter injection. Instead find the bundle the global shim
 *      would have launched and run it via process.execPath: parse `aqe.cmd` on
 *      PATH (npm, pnpm, yarn v1), then npm's global layouts, then a cached
 *      `npm prefix -g` (bundled npm CLI). An AQE_HOOK_BIN naming a .cmd/.bat/
 *      .ps1 is resolved the same way, never spawned.
 *   4. Nothing resolved (e.g. Volta): { cmd: null, reason }. The caller logs it.
 *
 * Returns { cmd, args, source }; `args` are the runner args that precede
 * `hooks <subcommand ...>`. Every input is injectable for tests
 * (`prefixCacheFile: null` disables the npm-prefix cache).
 */
function resolveAqeInvocation(opts) {
  const o = opts || {};
  const platform = o.platform || process.platform;
  const env = o.env || process.env;
  const execPath = o.execPath || process.execPath;
  const exists = o.exists || existsSafe;
  const readFile = o.readFile || readSafe;
  const npmPrefix = o.npmPrefix || npmGlobalPrefix;
  // Host path module (=== path.win32 on real Windows); injectable for tests.
  const p = o.path || path;
  const project = o.project || env.CLAUDE_PROJECT_DIR || '.';
  // Always hand node an ABSOLUTE path: a relative one such as `--require=./x.js`
  // would be parsed by node as an option, not as the script to run.
  const viaNode = (bundle, source) => ({ cmd: execPath, args: [p.resolve(bundle)], source });

  const local = [
    env.AQE_HOOK_BUNDLE,
    p.join(project, ...BUNDLE_IN_PACKAGE),
    p.join(project, 'dist', 'cli', 'bundle.js'),
  ].filter(Boolean);
  for (const b of local) if (exists(b)) return viaNode(b, 'project-bundle');

  const bin = env.AQE_HOOK_BIN;
  if (platform !== 'win32') return { cmd: bin || 'aqe', args: [], source: 'bin' };
  // A real executable (aqe.exe, a test stub) can be spawned without a shell.
  if (bin && !SCRIPT_SHIM.test(bin)) return { cmd: bin, args: [], source: 'bin' };

  const shims = bin ? [bin] : [];
  for (const dir of (envGet(env, 'PATH', platform) || '').split(';')) {
    const d = dir.trim().replace(/^"(.*)"$/, '$1');
    // Relative PATH entries (`.`, `--require=.`) resolve against an arbitrary
    // cwd; Windows itself never searches them for a hook-launched process here.
    if (d && p.isAbsolute(d)) shims.push(p.join(d, 'aqe.cmd'));
  }
  for (const shim of shims) {
    const b = shimBundle(shim, p, exists, readFile, 1);
    if (b) return viaNode(b, `global-shim:${shim}`);
  }

  const appData = envGet(env, 'APPDATA', platform);
  const prefixes = [
    envGet(env, 'npm_config_prefix', platform),
    appData && p.join(appData, 'npm'), // npm's default global prefix on Windows
    p.dirname(execPath),               // nvm-windows: prefix = node install dir
  ].filter(Boolean);
  for (const prefix of prefixes) {
    const b = p.join(prefix, ...BUNDLE_IN_PACKAGE);
    if (exists(b)) return viaNode(b, `global-prefix:${prefix}`);
  }
  const cacheFile = o.prefixCacheFile === undefined
    ? p.join(project, '.agentic-qe', 'hook-npm-prefix.json') : o.prefixCacheFile;
  const queried = cachedNpmPrefix(npmPrefix, execPath, p, exists, cacheFile, o.now || Date.now());
  if (queried && exists(p.join(queried, ...BUNDLE_IN_PACKAGE))) {
    return viaNode(p.join(queried, ...BUNDLE_IN_PACKAGE), `npm-prefix:${queried}`);
  }

  const binNote = bin
    ? `AQE_HOOK_BIN=${bin} is a .cmd/.bat/.ps1 script, which is never started without `
      + 'a shell, and no agentic-qe bundle was found behind it; ' : '';
  return {
    cmd: null,
    args: [],
    source: 'none',
    reason: `${binNote}no agentic-qe bundle found (Windows cannot spawn aqe.cmd without a shell `
      + 'since CVE-2024-27980, and a shell is unsafe for hook arguments). Volta and other '
      + 'non-npm/pnpm/yarn-v1 shims cannot be followed. Fix: `npm install -D agentic-qe`, '
      + 'or set AQE_HOOK_BUNDLE to the global bundle, e.g. '
      + '<npm global prefix>\\node_modules\\agentic-qe\\dist\\cli\\bundle.js '
      + '(Volta: the agentic-qe dist\\cli\\bundle.js inside your Volta tools image directory)',
  };
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

// Internal timeout for the spawned bundle process. Kept BELOW the harness's
// own hook timeout (settings.json) so THIS script observes and logs a stall
// itself — if the harness timeout fires first, this whole process is killed
// too and never gets to write the log line. (2026-06-02 postmortem: a 5s
// harness timeout vs. this shim's own admitted ~30-60s cold start left
// routing_outcomes writes silently dropped for a month — nothing recorded
// the mismatch because nothing was watching for it.)
const FAST_HOOKS = new Set(['guard', 'pre-command']);
const SPAWN_TIMEOUT_MS = Number(process.env.AQE_HOOK_TIMEOUT_MS)
  || (FAST_HOOKS.has(args[0]) ? 2500 : 4500);

function recordHookHealth(line) {
  try {
    const logPath = path.join(PROJECT, '.agentic-qe', 'hooks-health.log');
    // Throttle: skip if we logged within the last 5 min (avoid a line/turn).
    try {
      const st = fs.statSync(logPath);
      if (Date.now() - st.mtimeMs < 5 * 60 * 1000) return;
    } catch { /* no log yet — fall through and create it */ }
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line);
  } catch { /* health logging must never block a turn */ }
}

/** Spawn the resolved runner; returns its stdout ('' on any failure). */
function runHook() {
  const ts = () => new Date().toISOString();
  const subcmd = args[0] || 'unknown';
  const inv = resolveAqeInvocation();
  if (!inv.cmd) {
    recordHookHealth(`[${ts()}] SPAWN-FAILED hook could not start `
      + `(cmd=${subcmd}): ${inv.reason}. Learning for this invocation was NOT captured.\n`);
    return '';
  }
  let out = '';
  try {
    out = superviseSpawn(inv.cmd, [...inv.args, 'hooks', ...args], subcmd, ts);
  } catch { /* never block a turn */ }
  return out;
}

function superviseSpawn(cmd, cmdArgs, subcmd, ts) {
  // shell is deliberately NOT set: arguments go to CreateProcess/execve verbatim.
  const res = childProcess.spawnSync(cmd, cmdArgs, {
    windowsHide: true,
    // Claude Code delivers hook event data (prompt, tool_input, etc.) as JSON
    // on stdin — `$PROMPT`/`$TOOL_INPUT_*` env-var substitution is NOT
    // reliable on every hook surface (see hooks-shared.ts:readStdinJsonEvent's
    // own docstring). Discarding stdin here silently broke the CLI's
    // existing, already-safe stdin fallback (500ms internal timeout, never
    // hangs) — inherit it instead so that fallback can actually run.
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: SPAWN_TIMEOUT_MS,
  });
  const out = (res && res.stdout) || '';
  const stderr = (res && res.stderr) || '';
  const hit = FATAL_MARKERS.find((m) => stderr.includes(m));
  if (hit) {
    // The fix depends on WHICH failure hit. A native-binary marker (invalid ELF
    // header / ERR_DLOPEN_FAILED / wrong Node version) is a real rebuild case.
    // But "Failed to initialize UnifiedMemoryManager" is almost always LOCK
    // CONTENTION — another AQE process (MCP server, daemon, hooks) holding
    // memory.db, often amplified by a WAL-hostile bind mount — NOT a bad binary.
    // Suggesting `npm rebuild` there sends people down the wrong path (verified
    // 2026-07-08: better-sqlite3 loaded fine while this marker still fired).
    const nativeMismatch = /invalid ELF header|ERR_DLOPEN_FAILED|different Node\.js version/.test(hit);
    // Only claim lock contention when the child ACTUALLY reported a lock error.
    // "Failed to initialize UnifiedMemoryManager" also covers corruption, EACCES,
    // ENOSPC and schema faults; asserting "a process is holding the DB" for those
    // is the same over-confident guidance that cost six days, just pointing a new
    // wrong way (codex review r2 #2).
    const lockContention = /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(stderr);
    const fix = nativeMismatch
      ? '`npm rebuild better-sqlite3` (host/container native-binary mismatch).'
      : !lockContention
      ? 'persistence init failed for a reason that is NOT lock contention. Do not guess — '
        + 'read the actual error above, then check: disk space (`df -h`), permissions on '
        + '.agentic-qe/, and DB health (`sqlite3 .agentic-qe/memory.db "PRAGMA integrity_check;"` '
        + '— note quick_check does NOT verify indexes).'
      // 2026-07-23..29: this hint used to say "check for concurrent AQE processes
      // (MCP server / daemon / other hooks)". Operators checked exactly those,
      // found nothing, and capture stayed dead for SIX DAYS — because the holder
      // was `npm exec agentic-qe@latest mcp` from the npx cache, which matches
      // neither "aqe" nor the servers in .mcp.json. Never name a guessed culprit:
      // give the command that finds the ACTUAL holder, whatever it is.
      : 'a process is holding memory.db open (this blocks the journal_mode switch '
        + 'that AQE_DISABLE_WAL requires). Do NOT guess which process — list them:\n'
        + '  for p in /proc/[0-9]*; do for f in $p/fd/*; do readlink "$f" 2>/dev/null '
        + '| grep -q memory.db && echo "$(basename $p) $(tr \'\\0\' \' \' < $p/cmdline)"; '
        + 'done; done | sort -u\n'
        + '  (stale `npm exec agentic-qe mcp` from the npx cache is a known culprit '
        + 'and does NOT match a search for "aqe"). NOT a native-binary rebuild.';
    recordHookHealth(`[${ts()}] FATAL hook persistence failure `
      + `(cmd=${subcmd}): "${hit}". Learning is NOT being captured. `
      + `Fix: ${fix}\n`);
  } else if (res && res.signal) {
    // Killed by our own SPAWN_TIMEOUT_MS (or another signal) before finishing.
    // No output means no persistence happened for this invocation.
    recordHookHealth(`[${ts()}] TIMEOUT hook did not complete `
      + `(cmd=${subcmd}, signal=${res.signal}, budget=${SPAWN_TIMEOUT_MS}ms). `
      + `Learning for this invocation was NOT captured.\n`);
  } else if (res && res.error) {
    // spawnSync couldn't even launch the child (ENOENT/EACCES/etc).
    recordHookHealth(`[${ts()}] SPAWN-FAILED hook could not start `
      + `(cmd=${subcmd}): ${res.error.message || res.error}. `
      + `Learning for this invocation was NOT captured.\n`);
  } else if (res && res.status !== 0 && !out.includes('{')) {
    // Child exited non-zero with no JSON payload — e.g. an empty-task throw
    // when the harness didn't populate $PROMPT/$TOOL_INPUT_*.
    recordHookHealth(`[${ts()}] EMPTY-RESULT hook exited status=${res.status} `
      + `with no JSON output (cmd=${subcmd}). stderr: ${stderr.slice(0, 300)}\n`);
  }
  return out;
}

function main() {
  const out = runHook();
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
}

// Exported so brain-checkpoint.cjs and unit tests can reuse the resolver;
// requiring this file never spawns anything.
// brain-checkpoint.cjs checks for this export (and the require.main guard
// below) before requiring this file; keep both.
module.exports = { resolveAqeInvocation, parseCmdShimTarget };

if (require.main === module) main();
