#!/usr/bin/env node
/**
 * MCP Protocol-Compliance Smoke Test
 * -----------------------------------
 * Ports ruflo's #1874 discipline: boot the REAL AQE MCP server (the same way
 * Claude Code launches it — `npx tsx src/mcp/entry.ts` over STDIO with
 * newline-delimited JSON-RPC) and validate the `initialize` + `tools/list`
 * handshake against the MCP *spec*, not the source code.
 *
 * Core guard (ruflo #1874): `result.protocolVersion` MUST be a plain string
 * matching /^\d{4}-\d{2}-\d{2}$/. Claude Code's Zod schema rejects an object
 * here. We assert the string form explicitly so a regression (e.g. someone
 * returning an object) fails loudly instead of silently breaking Claude Code.
 *
 * Transport notes:
 *  - src/mcp/transport/stdio.ts uses readline for input and writes `data + '\n'`
 *    (newline-delimited, NOT Content-Length framed).
 *  - entry.ts suppresses most stderr in MCP mode, but boot/daemon code may emit
 *    a few stdout lines. The client below tolerates any non-JSON / non-matching
 *    line and scans for the JSON-RPC response carrying the expected `id`.
 *
 * Exit codes: 0 = all assertions pass, 1 = any failure or timeout.
 *
 * Usage: node scripts/smoke-mcp-protocol.mjs
 */

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// Data-dir isolation (CLAUDE.md data-protection): run the server against a
// throwaway AQE_PROJECT_ROOT so the smoke never mutates the real
// .agentic-qe stores and never contends for the session daemons' memory.db lock
// (lock contention previously made the smoke time out).
const TMP_ROOT = mkdtempSync(join(tmpdir(), 'aqe-mcp-smoke-'));

// Prefer the local tsx binary over `npx tsx` — fewer wrapper processes (so the
// whole tree is reliably killed) and no dist-tag re-resolution latency.
const TSX_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const SERVER_CMD = existsSync(TSX_BIN) ? TSX_BIN : 'npx';
const SERVER_ARGS = existsSync(TSX_BIN) ? ['src/mcp/entry.ts'] : ['tsx', 'src/mcp/entry.ts'];

// Generous boot budget — the real server initializes daemons, HNSW, fleet, etc.
const BOOT_TIMEOUT_MS = 90_000;
// Per-request response budget once the server is up.
const REQUEST_TIMEOUT_MS = 45_000;

let child = null;
let cleanedUp = false;

function killTree(signal) {
  if (!child || child.pid == null) return;
  // The server is spawned `detached`, so it leads its own process group.
  // Killing the negative pid reaps the whole tree (tsx + any grandchildren),
  // preventing the leaked-server problem of a bare child.kill().
  try { process.kill(-child.pid, signal); } catch { /* ignore */ }
  try { if (!child.killed) child.kill(signal); } catch { /* ignore */ }
}

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  if (child && !child.killed) {
    killTree('SIGTERM');
    // Hard-kill shortly after if SIGTERM is ignored.
    setTimeout(() => killTree('SIGKILL'), 2000).unref?.();
  }
  try { if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
}

function fail(message, detail) {
  console.error('\n[FAIL] ' + message);
  if (detail !== undefined) {
    console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
  }
  cleanup();
  process.exitCode = 1;
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });

/**
 * Spawn the real MCP server and return a small client object that can send a
 * JSON-RPC request and resolve with the response carrying the matching id.
 */
function startServer() {
  child = spawn(SERVER_CMD, SERVER_ARGS, {
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true, // own process group so cleanup can kill the whole tree
    env: {
      ...process.env,
      AQE_HTTP_PORT: '0',
      AQE_PROJECT_ROOT: TMP_ROOT, // isolated throwaway data dir
    },
  });

  child.on('error', (err) => {
    fail(`Failed to spawn MCP server (${SERVER_CMD} ${SERVER_ARGS.join(' ')}): ` + err.message);
    process.exit(1);
  });

  // Drain stderr so the child never blocks on a full pipe; surface fatal lines.
  const errRl = readline.createInterface({ input: child.stderr });
  errRl.on('line', (line) => {
    if (/FATAL|Fatal error/i.test(line)) {
      console.error('[server stderr] ' + line);
    }
  });

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

  // Map of pending id -> { resolve, timer }. Lines are scanned as they arrive;
  // any line that doesn't JSON-parse to a matching response is treated as noise.
  const pending = new Map();

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== '{') return; // noise / boot log
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return; // non-JSON noise line — tolerate
    }
    if (msg == null || typeof msg !== 'object') return;
    if (msg.id === undefined || msg.id === null) return; // notification, ignore
    const waiter = pending.get(msg.id);
    if (waiter) {
      clearTimeout(waiter.timer);
      pending.delete(msg.id);
      waiter.resolve(msg);
    }
  });

  child.on('exit', (code, signal) => {
    if (cleanedUp) return;
    // Unexpected early exit — reject all pending requests.
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
        rejectPromise(new Error(`Timed out after ${timeoutMs}ms waiting for response id=${payload.id} (method=${payload.method})`));
      }, timeoutMs);
      pending.set(payload.id, { resolve: resolvePromise, reject: rejectPromise, timer });
      child.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  return { request };
}

function assert(cond, message, detail) {
  if (!cond) {
    throw new SmokeAssertionError(message, detail);
  }
}

class SmokeAssertionError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'SmokeAssertionError';
    this.detail = detail;
  }
}

async function main() {
  console.error(`[smoke] Booting real MCP server: ${SERVER_CMD} ${SERVER_ARGS.join(' ')} (AQE_HTTP_PORT=0, AQE_PROJECT_ROOT=${TMP_ROOT})`);
  console.error(`[smoke] Boot budget ${BOOT_TIMEOUT_MS}ms, per-request ${REQUEST_TIMEOUT_MS}ms`);

  const server = startServer();

  // -- 1. initialize handshake -------------------------------------------------
  const initReq = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'aqe-smoke', version: '1.0.0' },
    },
  };

  console.error('[smoke] -> initialize (id=1)');
  const initResp = await server.request(initReq, BOOT_TIMEOUT_MS);

  assert(initResp.error === undefined, 'initialize returned a JSON-RPC error', initResp.error);
  const result = initResp.result;
  assert(result && typeof result === 'object', 'initialize result is not an object', result);

  // CORE GUARD (ruflo #1874): protocolVersion MUST be a YYYY-MM-DD *string*.
  // An object here is exactly the ruflo bug — Claude Code's Zod rejects it.
  assert(
    typeof result.protocolVersion === 'string',
    `initialize result.protocolVersion must be a STRING (Claude Code Zod would reject a non-string). Got type=${typeof result.protocolVersion}`,
    result.protocolVersion,
  );
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(result.protocolVersion),
    `initialize result.protocolVersion must match /^\\d{4}-\\d{2}-\\d{2}$/ (Claude Code Zod would accept this). Got: "${result.protocolVersion}"`,
  );

  assert(
    result.capabilities && typeof result.capabilities === 'object' && !Array.isArray(result.capabilities),
    'initialize result.capabilities must be an object',
    result.capabilities,
  );

  assert(result.serverInfo && typeof result.serverInfo === 'object', 'initialize result.serverInfo must be an object', result.serverInfo);
  assert(
    typeof result.serverInfo.name === 'string' && result.serverInfo.name.length > 0,
    'initialize result.serverInfo.name must be a non-empty string',
    result.serverInfo,
  );
  assert(
    typeof result.serverInfo.version === 'string' && result.serverInfo.version.length > 0,
    'initialize result.serverInfo.version must be a non-empty string',
    result.serverInfo,
  );

  console.error(`[smoke]    OK initialize: protocolVersion="${result.protocolVersion}" serverInfo=${result.serverInfo.name} v${result.serverInfo.version}`);

  // Per MCP lifecycle, send the `initialized` notification (no id, no response).
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }) + '\n');

  // -- 2. tools/list -----------------------------------------------------------
  console.error('[smoke] -> tools/list (id=2)');
  const listResp = await server.request(
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    REQUEST_TIMEOUT_MS,
  );

  assert(listResp.error === undefined, 'tools/list returned a JSON-RPC error', listResp.error);
  const listResult = listResp.result;
  assert(listResult && typeof listResult === 'object', 'tools/list result is not an object', listResult);
  assert(Array.isArray(listResult.tools), 'tools/list result.tools must be an array', listResult);
  assert(listResult.tools.length > 0, 'tools/list result.tools must be a non-empty array');

  for (const tool of listResult.tools) {
    assert(
      tool && typeof tool.name === 'string' && tool.name.length > 0,
      'every tools/list entry must have a non-empty string name',
      tool,
    );
    assert(
      tool.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema),
      `tool "${tool && tool.name}" inputSchema must be an object`,
      tool && tool.inputSchema,
    );
  }

  const toolCount = listResult.tools.length;
  console.error(`[smoke]    OK tools/list: ${toolCount} tools, each with name + object inputSchema`);

  // -- Summary -----------------------------------------------------------------
  console.error('\n========================================');
  console.error('[PASS] MCP protocol smoke succeeded');
  console.error(`  protocolVersion : ${result.protocolVersion}`);
  console.error(`  serverInfo      : ${result.serverInfo.name} v${result.serverInfo.version}`);
  console.error(`  tools advertised: ${toolCount}`);
  console.error('========================================');

  cleanup();
  process.exitCode = 0;
}

main().catch((err) => {
  if (err instanceof SmokeAssertionError) {
    fail(err.message, err.detail);
  } else {
    fail('Smoke test error: ' + (err && err.message ? err.message : String(err)));
  }
});
