#!/usr/bin/env node
/**
 * MCP Tool-Advertisement / Handler Parity Audit
 * ----------------------------------------------
 * AQE-equivalent of ruflo's CLI<->MCP parity audit (scripts/audit-cli-mcp-tools.mjs).
 *
 * Ruflo's audit walked every `callMCPTool('name')` string reference in the CLI
 * and asserted it resolved to a registered MCP tool (caught ~20 dangling refs).
 *
 * The AQE CLI does NOT use that `callMCPTool('name')` string pattern (verified:
 * `grep -rn "callMCPTool" src/` returns nothing). So the meaningful parity
 * surface here is *advertisement <-> handler parity* on the MCP server itself:
 *
 *   - ADVERTISED  = the set of tool names returned by `tools/list`.
 *   - HANDLED     = the set of tools that route to a real handler on `tools/call`.
 *
 * Architecture note (src/mcp/protocol-server.ts):
 *   Every tool is registered as a single `ToolEntry { definition, handler }` in
 *   one `this.tools` Map. `tools/list` enumerates `definition.name`, and
 *   `tools/call` looks up the SAME map (throws METHOD_NOT_FOUND "Unknown tool"
 *   otherwise). So advertisement and handler are structurally coupled: an
 *   advertised tool ALWAYS has a handler, and a handler is ALWAYS advertised.
 *   The parity regression to guard against is therefore the *advertised tool set
 *   drifting* (a tool silently disappearing, or an unexpected new one appearing),
 *   plus proof that the handler-resolution path correctly rejects unknown tools.
 *
 * Why drive via the spawned server (not in-process registry construction):
 *   Constructing the registry in-process runs registerAllTools() which, via
 *   entry.ts boot wiring, spins up daemons and writes to .agentic-qe/* stores
 *   (memory.db, *.rvf). Per CLAUDE.md data-protection that risks the real
 *   learning stores. So we read the advertised set purely from `tools/list`
 *   (read-only on the wire) and do ONE bogus-tool `tools/call` probe to confirm
 *   the routing layer rejects unknown tools. We never call a real tool handler.
 *
 * Monotone baseline (verification/mcp-tool-parity-baseline.json):
 *   Records the current known-good advertised tool set. The audit FAILS only on
 *   NEW discrepancies vs the baseline (removed tools = regression; added tools =
 *   reported as drift to be acknowledged). An existing backlog never blocks; a
 *   future regression always does. Run with --update-baseline to re-baseline
 *   after an intentional change.
 *
 * Exit codes: 0 = no new discrepancies, 1 = new discrepancies (or boot failure).
 *
 * Usage:
 *   node scripts/audit-mcp-tool-parity.mjs                 # audit against baseline
 *   node scripts/audit-mcp-tool-parity.mjs --update-baseline
 */

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const BASELINE_PATH = resolve(REPO_ROOT, 'verification', 'mcp-tool-parity-baseline.json');

const BOOT_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 45_000;

const UPDATE_BASELINE = process.argv.includes('--update-baseline');

// Isolated throwaway data dir (CLAUDE.md data-protection): the server must not
// mutate the real .agentic-qe stores nor contend for the session daemons' lock.
const TMP_ROOT = mkdtempSync(join(tmpdir(), 'aqe-mcp-parity-'));
const TSX_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const SERVER_CMD = existsSync(TSX_BIN) ? TSX_BIN : 'npx';
const SERVER_ARGS = existsSync(TSX_BIN) ? ['src/mcp/entry.ts'] : ['tsx', 'src/mcp/entry.ts'];

let child = null;
let cleanedUp = false;

function killTree(signal) {
  if (!child || child.pid == null) return;
  try { process.kill(-child.pid, signal); } catch { /* ignore */ }
  try { if (!child.killed) child.kill(signal); } catch { /* ignore */ }
}

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  if (child && !child.killed) {
    killTree('SIGTERM');
    setTimeout(() => killTree('SIGKILL'), 2000).unref?.();
  }
  try { if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });

function startServer() {
  child = spawn(SERVER_CMD, SERVER_ARGS, {
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, AQE_HTTP_PORT: '0', AQE_PROJECT_ROOT: TMP_ROOT },
  });

  child.on('error', (err) => {
    console.error('[FAIL] Failed to spawn MCP server: ' + err.message);
    cleanup();
    process.exit(1);
  });

  const errRl = readline.createInterface({ input: child.stderr });
  errRl.on('line', (line) => {
    if (/FATAL|Fatal error/i.test(line)) console.error('[server stderr] ' + line);
  });

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map();

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== '{') return;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { return; }
    if (msg == null || typeof msg !== 'object') return;
    if (msg.id === undefined || msg.id === null) return;
    const waiter = pending.get(msg.id);
    if (waiter) {
      clearTimeout(waiter.timer);
      pending.delete(msg.id);
      waiter.resolve(msg);
    }
  });

  child.on('exit', (code, signal) => {
    if (cleanedUp) return;
    for (const [, waiter] of pending) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`Server exited early (code=${code}, signal=${signal})`));
    }
    pending.clear();
  });

  function request(payload, timeoutMs) {
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        pending.delete(payload.id);
        rejectPromise(new Error(`Timed out after ${timeoutMs}ms waiting for id=${payload.id} (method=${payload.method})`));
      }, timeoutMs);
      pending.set(payload.id, { resolve: resolvePromise, reject: rejectPromise, timer });
      child.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  return { request };
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  } catch (err) {
    console.error('[WARN] Could not parse baseline, treating as absent: ' + err.message);
    return null;
  }
}

function writeBaseline(toolNames) {
  const dir = dirname(BASELINE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const payload = {
    description:
      'Monotone baseline of MCP advertised tool names (tools/list). The parity ' +
      'audit fails on NEW discrepancies vs this set: removed tools = regression. ' +
      'Regenerate with: node scripts/audit-mcp-tool-parity.mjs --update-baseline',
    generatedAt: new Date().toISOString(),
    toolCount: toolNames.length,
    // Known gaps: in this architecture advertised tools are always handler-backed
    // (single ToolEntry map), so there are no advertised-but-unhandled gaps.
    knownGaps: [],
    advertisedTools: [...toolNames].sort(),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}

async function main() {
  console.error(`[parity] Booting real MCP server: ${SERVER_CMD} ${SERVER_ARGS.join(" ")} (AQE_HTTP_PORT=0, AQE_PROJECT_ROOT=${TMP_ROOT})`);
  const server = startServer();

  // 1. initialize (required before tools/list per MCP lifecycle).
  const initResp = await server.request(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'aqe-parity', version: '1.0.0' } },
    },
    BOOT_TIMEOUT_MS,
  );
  if (initResp.error) {
    console.error('[FAIL] initialize errored: ' + JSON.stringify(initResp.error));
    cleanup();
    process.exit(1);
  }
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }) + '\n');

  // 2. tools/list -> advertised set (this is also the handler set; same map).
  const listResp = await server.request(
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    REQUEST_TIMEOUT_MS,
  );
  if (listResp.error || !listResp.result || !Array.isArray(listResp.result.tools)) {
    console.error('[FAIL] tools/list did not return a tools array: ' + JSON.stringify(listResp.error || listResp.result));
    cleanup();
    process.exit(1);
  }
  const advertised = listResp.result.tools.map((t) => t.name).filter((n) => typeof n === 'string');
  const advertisedSet = new Set(advertised);
  console.error(`[parity] Advertised tools (tools/list): ${advertisedSet.size}`);

  // 3. Handler-resolution probe: a BOGUS tool MUST be rejected (not executed as
  //    a normal tool). This proves the tools/call routing path is wired to the
  //    same registry that backs tools/list — without invoking any real handler.
  //
  //    Rejection can surface two ways in this server:
  //      (a) a JSON-RPC error (code -32601 / "Unknown tool"), or
  //      (b) a result whose content text decodes to { success:false, error: ... }.
  //    handleToolsCall throws a plain {code,message} object for unknown tools;
  //    the request-handler safety net (protocol-server.ts ~L291) catches it and
  //    wraps it as content `{"success":false,"error":"Internal error: ..."}`.
  //    Either shape proves the unknown tool was rejected, not run.
  const bogusName = '__aqe_parity_nonexistent_tool__';
  const probeResp = await server.request(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: bogusName, arguments: {} } },
    REQUEST_TIMEOUT_MS,
  );

  let rejectedUnknown = false;
  let how = '';
  if (probeResp.error !== undefined) {
    rejectedUnknown = probeResp.error.code === -32601 || /unknown tool/i.test(probeResp.error.message || '');
    how = `JSON-RPC error code=${probeResp.error.code}`;
  } else if (probeResp.result && Array.isArray(probeResp.result.content)) {
    if (probeResp.result.isError === true) {
      rejectedUnknown = true;
      how = 'result.isError=true';
    } else {
      // Inspect the wrapped content text for an explicit failure/rejection.
      const text = probeResp.result.content.map((c) => (c && c.text) || '').join('\n');
      let decoded = null;
      try { decoded = JSON.parse(text); } catch { /* not JSON */ }
      if (decoded && decoded.success === false) {
        rejectedUnknown = true;
        how = `content success:false ("${String(decoded.error).slice(0, 80)}")`;
      } else if (/unknown tool|internal error|not found/i.test(text)) {
        rejectedUnknown = true;
        how = 'content text indicates rejection';
      }
    }
  }

  if (!rejectedUnknown) {
    console.error('[FAIL] tools/call did NOT reject an unknown tool — handler routing is broken.');
    console.error('       Response: ' + JSON.stringify(probeResp.error || probeResp.result));
    cleanup();
    process.exit(1);
  }
  console.error(`[parity] Handler routing probe OK: unknown tool "${bogusName}" correctly rejected (${how}).`);

  cleanup();

  // 4. Baseline diff.
  if (UPDATE_BASELINE) {
    writeBaseline(advertised);
    console.error(`\n[OK] Baseline written: ${BASELINE_PATH} (${advertisedSet.size} tools)`);
    process.exitCode = 0;
    return;
  }

  const baseline = loadBaseline();
  if (!baseline) {
    // No baseline yet: establish it. Zero discrepancies by definition.
    writeBaseline(advertised);
    console.error('\n========================================');
    console.error('[OK] No baseline existed — created one (monotone seed).');
    console.error(`  Advertised tools : ${advertisedSet.size}`);
    console.error(`  Baseline         : ${BASELINE_PATH}`);
    console.error('  Future runs fail on any NEW discrepancy.');
    console.error('========================================');
    process.exitCode = 0;
    return;
  }

  const baselineSet = new Set(baseline.advertisedTools || []);
  const removed = [...baselineSet].filter((n) => !advertisedSet.has(n)).sort();
  const added = [...advertisedSet].filter((n) => !baselineSet.has(n)).sort();

  console.error('\n========================================');
  console.error('[parity] Advertisement <-> handler parity audit');
  console.error(`  Baseline tools   : ${baselineSet.size}`);
  console.error(`  Advertised now   : ${advertisedSet.size}`);
  console.error(`  Removed (NEW gap): ${removed.length}`);
  console.error(`  Added (drift)    : ${added.length}`);

  if (added.length > 0) {
    console.error('\n  + New tools (advertised, handler-backed) since baseline:');
    for (const n of added) console.error('      + ' + n);
    console.error('    These are not failures (every advertised tool has a handler),');
    console.error('    but re-baseline to acknowledge: --update-baseline');
  }

  if (removed.length > 0) {
    console.error('\n  - REGRESSION: tools in baseline no longer advertised/handled:');
    for (const n of removed) console.error('      - ' + n);
    console.error('========================================');
    console.error('\n[FAIL] Parity regression: ' + removed.length + ' tool(s) disappeared from tools/list.');
    process.exitCode = 1;
    return;
  }

  console.error('========================================');
  console.error('\n[PASS] No parity regressions. ' + (added.length ? `(${added.length} new tool(s) — consider re-baselining.)` : 'Advertised set matches baseline.'));
  process.exitCode = 0;
}

main().catch((err) => {
  console.error('\n[FAIL] Parity audit error: ' + (err && err.message ? err.message : String(err)));
  cleanup();
  process.exitCode = 1;
});
