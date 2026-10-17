/**
 * #1070: every domain tool call must leave its Queen task in a terminal state
 * and give its concurrency slot back. Before the fix, each quality_assess call
 * left one task `running` forever: its TaskCompleted carried a "metrics" key,
 * which the transformer embeds as a zero vector, and the anti-drift middleware
 * dropped the event as total drift. A long MCP session filled the Queen.
 *
 * Drives the built server over stdio and checks the Queen's running/pending
 * counters after N calls of each factory tool.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
const SOURCE = 'export function add(a, b) { return a + b; }';
const N = 3;
const cases = [
  ['quality_assess', { runGate: false }, 5],
  // #1080: a failing gate (no coverage evidence) must not leave its caller-owned
  // task retried and running. Two calls: the domain circuit breaker opens after that.
  ['quality_assess', { runGate: true }, 2],
  ['test_generate_enhanced', { sourceCode: SOURCE, filePath: 'src/math.js', language: 'javascript' }, N],
  ['test_execute_parallel', { testFiles: ['tests/math.test.mjs'] }, 1],
  ['coverage_analyze_sublinear', { target: 'src/' }, N],
  ['security_scan_comprehensive', { target: 'src/', sast: true, dast: false }, N],
  ['contract_validate', { contractPath: 'openapi.json' }, N],
  ['accessibility_test', { url: 'http://127.0.0.1:1' }, N],
  ['chaos_test', { target: 'owned-fixture', faultType: 'latency' }, N],
  ['defect_predict', { target: 'src/' }, N],
  ['requirements_validate', { requirementsPath: 'requirements.md' }, N],
  ['code_index', { target: 'src/' }, N],
] as const;

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP domain tools release their Queen task slot (#1070)', () => {
  let child: ChildProcessWithoutNullStreams;
  let root: string;
  let nextId = 0;
  let stderr = '';
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  function request(method: string, params: Record<string, unknown>): Promise<any> {
    const id = ++nextId;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}\n${stderr.slice(-2000)}`));
      }, 120000);
      pending.set(id, { resolve: resolvePromise, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async function call(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const response = await request('tools/call', { name, arguments: args });
    expect(response.error, `${name}: ${JSON.stringify(response.error)}`).toBeUndefined();
    return JSON.parse(response.result.content[0].text);
  }

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'aqe-1070-slots-'));
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'tests'));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'aqe-1070-fixture', version: '1.0.0', type: 'module' }));
    writeFileSync(join(root, 'src/math.js'), SOURCE);
    writeFileSync(join(root, 'tests/math.test.mjs'), 'import { test, expect } from "vitest"; test("owned",()=>expect(2+2).toBe(4));');
    writeFileSync(join(root, 'requirements.md'), '# Requirements\nThe system shall add two numbers and return their sum.\n');
    writeFileSync(join(root, 'openapi.json'), JSON.stringify({ openapi: '3.0.0', info: { title: 'Owned fixture', version: '1' }, paths: {} }));
    const home = join(root, '.home');
    mkdirSync(home);
    child = spawn(process.execPath, [bundle], {
      cwd: root,
      env: { ...process.env, HOME: home, AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_HTTP_PORT: '0',
        AQE_SESSION_CACHE: 'off', AQE_LOOP_DETECTION_ENABLED: 'false', AQE_LLM_ROUTER_DISABLED: '1',
        npm_config_offline: 'true', npm_config_yes: 'false' },
      stdio: 'pipe',
    });
    child.stderr.on('data', data => { stderr += String(data); });
    createInterface({ input: child.stdout }).on('line', line => {
      let message: any;
      try { message = JSON.parse(line); } catch { return; }
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    });
    child.on('exit', code => {
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`Server exited ${code}: ${stderr.slice(-2000)}`));
      }
      pending.clear();
    });
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'queen-slots-1070', version: '1' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const fleet = await call('fleet_init', { memoryBackend: 'memory', maxAgents: 2 });
    expect(fleet.success, JSON.stringify(fleet)).toBe(true);
  }, 120000);

  afterAll(async () => {
    if (child?.exitCode === null) {
      const exited = new Promise(resolvePromise => child.once('exit', resolvePromise));
      child.kill('SIGKILL');
      await exited;
    }
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it.each(cases)('%s: N calls leave no running or queued Queen task', async (tool, args, calls) => {
    const before = await call('fleet_status', {});
    for (let i = 0; i < calls; i++) {
      await call(tool, { ...args, saveResults: false });
    }

    const status = await call('fleet_status', {});
    expect(status.success, JSON.stringify(status)).toBe(true);
    expect(status.data.tasks.running, `${tool} running after ${calls} calls`).toBe(0);
    expect(status.data.tasks.pending, `${tool} pending after ${calls} calls`).toBe(0);
    const finished = status.data.tasks.completed + status.data.tasks.failed;
    const finishedBefore = before.data.tasks.completed + before.data.tasks.failed;
    expect(finished - finishedBefore).toBeGreaterThanOrEqual(calls);

    const list = await call('task_list', {});
    const open = (list.data as Array<{ taskId: string; status: string }>)
      .filter(t => t.status === 'running' || t.status === 'queued' || t.status === 'assigned');
    expect(open, JSON.stringify(open)).toEqual([]);
  }, 300000);
});
