/** Real bundled MCP lifecycle regression for #801. All stores are owned fixtures. */
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRvfStore, isRvfNativeAvailable } from '../../../src/integrations/ruvector/rvf-native-adapter.js';
import { readLockOwnerPid } from '../../../src/integrations/ruvector/rvf-store-integrity.js';

const bundle = resolve('dist/mcp/bundle.js');
const cliBundle = resolve('dist/cli/bundle.js');
const nativeAvailable = isRvfNativeAvailable();
const built = existsSync(bundle) && existsSync(cliBundle);

/**
 * How the client ends the session. `eof` closes stdin; signals are delivered
 * to the server process; `shutdown` is the JSON-RPC shutdown method with stdin
 * left open so EOF cannot be what stops the server.
 */
type Trigger = 'eof' | 'SIGTERM' | 'SIGINT' | 'shutdown';
const signalsSupported = process.platform !== 'win32';
const triggers: Trigger[] = signalsSupported ? ['eof', 'SIGTERM', 'SIGINT', 'shutdown'] : ['eof', 'shutdown'];

async function driveMcp(
  root: string,
  checkOwner: (pid: number) => void,
  memoryOnly = false,
  args = [bundle],
  trigger: Trigger = 'eof',
  afterExit: () => void = () => {},
  storeRows = 0,
) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: join(root, 'home'), AQE_PROJECT_ROOT: root };
  for (const key of Object.keys(env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key)) delete env[key];
  }
  delete env.AQE_MEMORY_BACKEND;
  if (memoryOnly) env.AQE_MEMORY_BACKEND = 'memory';
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', data => { stderr += data.toString(); });
  const closed = new Promise<{ code: number | null; signal: string | null }>((resolveClose, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveClose({ code, signal }));
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 45000);
  try {
    await new Promise<void>((resolveReady, reject) => {
      child.once('error', reject);
      child.once('close', () => reject(new Error(`MCP closed before tools/list: ${stderr}`)));
      // Ready once tools/list (id 2) and every memory_store call (ids 100+) answered.
      let pending = storeRows + 1;
      child.stdout.on('data', data => {
        stdout += data.toString();
        let newline: number;
        while ((newline = stdout.indexOf('\n')) >= 0) {
          const line = stdout.slice(0, newline); stdout = stdout.slice(newline + 1);
          let message;
          try { message = JSON.parse(line); } catch { continue; }
          if (message.id === 2) {
            if (!message.result?.tools?.length) { reject(new Error('No MCP tools returned')); return; }
            for (let i = 0; i < storeRows; i++) {
              child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 100 + i, method: 'tools/call', params: {
                name: 'memory_store', arguments: { key: `shutdown-row-${i}`, value: { i }, namespace: 'shutdown-durability' },
              } }) + '\n');
            }
          } else if (typeof message.id !== 'number' || message.id < 100) {
            continue;
          } else if (message.error || message.result?.isError) {
            reject(new Error(`memory_store ${message.id} failed: ${line}`)); return;
          }
          if (--pending === 0) resolveReady();
        }
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'rvf-shutdown-test', version: '1' },
      } }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
    });
    checkOwner(child.pid!);
    if (trigger === 'eof') {
      child.stdin.end();
    } else if (trigger === 'shutdown') {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'shutdown' }) + '\n');
    } else {
      child.kill(trigger);
    }
    const result = await closed;
    expect(result).toEqual({ code: 0, signal: null });
    // Store-level assertions first so a failure names the leaked marker itself.
    afterExit();
    // The shared graceful shutdown ran to completion (not a bare process.exit
    // from another signal handler) and did not need the watchdog.
    expect(stderr).toContain('[MCP] Server stopped');
    expect(stderr).not.toContain('Shutdown watchdog fired');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
    clearTimeout(timer);
  }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aqe-mcp-shutdown-'));
  mkdirSync(join(root, 'home'));
  mkdirSync(join(root, '.agentic-qe'));
  writeFileSync(join(root, 'package.json'), '{"name":"shutdown-fixture","private":true}');
  return root;
}

// Missing bundles fail in CI; native-unavailable environments explicitly skip only native cases.
describe.skipIf(!built && !process.env.CI)('bundled MCP graceful RVF shutdown', () => {
  const routes: Array<[string, string[]]> = [['aqe-mcp', [bundle]], ['aqe mcp', [cliBundle, 'mcp']]];
  const cases = routes.flatMap(([name, args]) => triggers.map(trigger => [name, trigger, args] as const));

  it.skipIf(!nativeAvailable).each(cases)(
    '%s releases its native patterns lock on %s across repeated starts', async (_name, trigger, args) => {
    const root = fixture();
    const path = join(root, '.agentic-qe', 'patterns.rvf');
    try {
      const store = createRvfStore(path, 384); store.close();
      for (let i = 0; i < 2; i++) {
        await driveMcp(root, pid => expect(readLockOwnerPid(path)).toBe(pid), false, [...args], trigger,
          () => expect(existsSync(`${path}.lock`), `patterns.rvf.lock left behind after ${trigger}`).toBe(false));
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 120000);

  it.skipIf(!nativeAvailable).each(triggers)(
    'preserves a different live owner and its store bytes on %s', async (trigger) => {
    const root = fixture();
    const path = join(root, '.agentic-qe', 'patterns.rvf');
    const store = createRvfStore(path, 384);
    try {
      const bytes = readFileSync(path);
      const marker = readFileSync(`${path}.lock`);
      await driveMcp(root, () => expect(readLockOwnerPid(path)).toBe(process.pid), false, [bundle], trigger, () => {
        expect(readFileSync(path)).toEqual(bytes);
        expect(readFileSync(`${path}.lock`)).toEqual(marker);
      });
    } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
  }, 60000);

  // F2: every graceful path, not just signals, must close memory.db so SQLite
  // checkpoints the WAL into the main file (WAL left behind on a bind mount is
  // how memory.db has been corrupted before). Rows must stay durable.
  it.each(cases)('%s closes memory.db cleanly (WAL checkpointed) on %s', async (_name, trigger, args) => {
    const root = fixture();
    const db = join(root, '.agentic-qe', 'memory.db');
    const rows = 5;
    try {
      await driveMcp(root, () => {}, false, [...args], trigger, () => {
        const wal = `${db}-wal`;
        const walBytes = existsSync(wal) ? statSync(wal).size : 0;
        expect(walBytes, `memory.db-wal left un-checkpointed after ${trigger}`).toBe(0);
        const reader = new Database(db, { readonly: true, fileMustExist: true });
        try {
          // memory_store keeps its namespace as a `<namespace>:` key prefix.
          const { n } = reader.prepare(
            "SELECT COUNT(*) AS n FROM kv_store WHERE key LIKE 'shutdown-durability:%'",
          ).get() as { n: number };
          expect(n, `rows stored before ${trigger} must survive it`).toBe(rows);
        } finally { reader.close(); }
      }, rows);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60000);

  it('shuts down normally when database-free startup opens no native adapter', async () => {
    const root = fixture();
    try {
      await driveMcp(root, () => {}, true);
      expect(existsSync(join(root, '.agentic-qe', 'patterns.rvf.lock'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60000);
});
