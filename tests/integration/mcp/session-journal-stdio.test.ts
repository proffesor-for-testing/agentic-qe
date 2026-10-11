/**
 * Session journal over the real built MCP stdio server.
 *
 * The partial-write cases are ported from Rudy Celekli's #956 (closed) as a
 * regression guard for #965: a batch write that fails partway must resume from
 * the bytes already on disk, so the transcript holds every lifecycle row once,
 * in parent order, and stays resumable.
 *
 * The persistent-failure case covers #983 item 1 (found by Rudy's #959): while
 * the disk stays full, the 100 ms batch timer must not throw into
 * 'uncaughtException', which the MCP entry logs as "[AQE] FATAL" on every tick.
 *
 * Faults come from tests/fixtures/session-write-fault.cjs, preloaded with
 * --require into the child only, and limited to that child's own journal.
 */
import { describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { resumeSession } from '../../../src/mcp/services/session-resume';

const bundle = process.env.AQE_JOURNAL_TEST_BUNDLE ?? resolve('dist/mcp/bundle.js');
const fixture = resolve('tests/fixtures/session-write-fault.cjs');
type FaultMode = 'none' | 'partial' | 'persistent';

interface Server {
  root: string;
  child: ChildProcessWithoutNullStreams;
  stderr: () => string;
  request: (method: string, params: Record<string, unknown>) => Promise<any>;
  dispose: () => Promise<void>;
}

function startServer(mode: FaultMode): Server {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-journal-stdio-')));
  const env: NodeJS.ProcessEnv = { ...process.env, AQE_JOURNAL_FAULT_ROOT: root, AQE_PROJECT_ROOT: root, AQE_HTTP_PORT: '0',
    AQE_SESSION_CACHE: 'off', AQE_LOOP_DETECTION_ENABLED: 'false', AQE_LLM_ROUTER_DISABLED: '1', AQE_SESSION_DURABILITY: 'true' };
  delete env.AQE_MEMORY_BACKEND;
  if (mode !== 'none') env.AQE_JOURNAL_FAULT_MODE = mode;
  const preload = mode === 'none' ? [] : ['--require', fixture];
  const child = spawn(process.execPath, [...preload, bundle], { cwd: root, env, stdio: 'pipe' });
  let stderr = '';
  child.stderr.on('data', bytes => { stderr += bytes.toString(); });
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const reader = createInterface({ input: child.stdout });
  reader.on('line', line => {
    let value: any;
    try { value = JSON.parse(line); } catch { return; }
    const waiter = pending.get(value.id);
    if (!waiter) return;
    clearTimeout(waiter.timer); pending.delete(value.id); waiter.resolve(value);
  });
  child.on('exit', code => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(`MCP exit ${code}: ${stderr.slice(-2000)}`)); }
    pending.clear();
  });
  const request = (method: string, params: Record<string, unknown>) => new Promise<any>((resolvePromise, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP timeout ${method}: ${stderr.slice(-2000)}`)); }, 10000);
    pending.set(id, { resolve: resolvePromise, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const dispose = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolvePromise => child.once('exit', resolvePromise));
      child.kill('SIGKILL');
      await exited;
    }
    reader.close();
    for (const waiter of pending.values()) clearTimeout(waiter.timer);
    rmSync(root, { recursive: true, force: true });
  };
  return { root, child, stderr: () => stderr, request, dispose };
}

async function initialize(server: Server): Promise<void> {
  const initialized = await server.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'owned-journal-fixture', version: '1' } });
  expect(initialized.error).toBeUndefined();
  server.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  expect((await server.request('tools/list', {})).result.tools.some((tool: any) => tool.name === 'fleet_status')).toBe(true);
}

async function callFleetStatus(server: Server): Promise<void> {
  const result = await server.request('tools/call', { name: 'fleet_status', arguments: {} });
  expect(result.error).toBeUndefined();
  // The real tool response is journaled; no external model is called.
  expect(result.result.content[0].text).toBeTruthy();
}

async function waitFor(condition: () => boolean, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition() && Date.now() < deadline) await new Promise(r => setTimeout(r, 10));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe.skipIf(!existsSync(bundle) && !process.env.CI)('session journal over built MCP stdio', () => {
  it.each([false, true])('keeps every lifecycle row once with a partial batch write injected=%s (#965)', async inject => {
    const server = startServer(inject ? 'partial' : 'none');
    try {
      await initialize(server);
      for (let i = 0; i < 3; i++) await callFleetStatus(server);
      if (inject) {
        await waitFor(() => server.stderr().includes('TEST journal fault injected'), 2000);
        expect(server.stderr()).toContain('TEST journal fault injected (partial)');
        await callFleetStatus(server);
      }
      const exited = new Promise<void>(resolvePromise => server.child.once('exit', () => resolvePromise()));
      await server.request('shutdown', {});
      await Promise.race([exited, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Owned MCP shutdown timeout')), 5000).unref())]);
      expect(server.child.exitCode).toBe(0);

      const directory = join(server.root, '.agentic-qe', 'sessions');
      const files = readdirSync(directory);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/\.jsonl$/);
      const path = join(directory, files[0]);
      const rows = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      const calls = inject ? 4 : 3;
      expect(rows.map(row => row.type)).toEqual(Array.from({ length: calls }, () => ['tool_call', 'tool_result']).flat());
      expect(new Set(rows.map(row => row.uuid)).size).toBe(calls * 2);
      expect(rows.map(row => row.parentUuid)).toEqual([null, ...rows.slice(0, -1).map(row => row.uuid)]);
      expect(resumeSession(path, { sessionRoot: directory, allowLegacyUnverified: true }).canResume).toBe(true);
    } finally {
      await server.dispose();
    }
  }, 20000);

  it('logs no FATAL from the batch timer while the disk stays full (#983)', async () => {
    const server = startServer('persistent');
    try {
      await initialize(server);
      // Each call appends two rows, so each schedules a batch-timer flush that fails.
      for (let i = 0; i < 4; i++) {
        await callFleetStatus(server);
        await sleep(150);
      }
      await waitFor(() => server.stderr().includes('TEST journal fault injected'), 2000);
      expect(server.stderr()).toContain('TEST journal fault injected (persistent)');
      await sleep(300);

      expect(server.stderr()).not.toMatch(/FATAL uncaught exception: ENOSPC/);
      // The server keeps answering, and the one-time buffer WARN fires at most
      // once (the default cap is far above these few rows, so here not at all).
      await callFleetStatus(server);
      expect(server.stderr().match(/WARN session journal/g)?.length ?? 0).toBeLessThanOrEqual(1);

      // Shutdown's close() flush still fails on the full disk; the server's
      // best-effort shutdown absorbs it and exits cleanly.
      const exited = new Promise<void>(resolvePromise => server.child.once('exit', () => resolvePromise()));
      server.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 9999, method: 'shutdown', params: {} }) + '\n');
      await Promise.race([exited, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Owned MCP shutdown timeout')), 5000).unref())]);
      expect(server.child.exitCode).toBe(0);
      expect(server.stderr()).not.toMatch(/FATAL uncaught exception: ENOSPC/);
    } finally {
      await server.dispose();
    }
  }, 20000);
});
