/**
 * #1075: `task_submit` accepted task types that no domain plugin executes.
 * Such a task fell through to the TaskAssigned event fallback, never reached
 * a terminal state and held a Queen concurrency slot for good (14 leaked slots
 * after 20 submissions across 10 types). Once `maxConcurrentTasks` slots had
 * leaked, every later submission was queued and never dispatched.
 *
 * Drives the built server over stdio: unhandled types must be rejected with a
 * visible reason and leave no running or queued task, and a handled type must
 * still run to completion exactly once.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
const UNHANDLED = [
  'assess-quality', 'index-code', 'scan-security', 'validate-requirements',
  'validate-contracts', 'test-accessibility', 'run-chaos',
] as const;

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP task_submit rejects task types no domain executes (#1075)', () => {
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
      }, 60000);
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
    root = mkdtempSync(join(tmpdir(), 'aqe-1075-'));
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'src'));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'aqe-1075-fixture', version: '1.0.0', type: 'module' }));
    writeFileSync(join(root, 'src/math.js'), 'export function add(a, b) { return a + b; }');
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
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'task-submit-1075', version: '1' } });
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

  it('rejects each unhandled type with the reason and leaves no running or queued task', async () => {
    for (const type of UNHANDLED) {
      for (let i = 0; i < 2; i++) {
        const result = await call('task_submit', { type, payload: { target: 'src/' } });
        expect(result.success, `${type}: ${JSON.stringify(result)}`).toBe(false);
        expect(result.error).toContain(`No handler for task type '${type}'`);
        expect(result.error).toContain('supported:');
      }
    }

    const status = await call('fleet_status', {});
    expect(status.success, JSON.stringify(status)).toBe(true);
    expect(status.data.tasks.running).toBe(0);
    expect(status.data.tasks.pending).toBe(0);

    const list = await call('task_list', {});
    const open = (list.data as Array<{ taskId: string; status: string }>)
      .filter(t => t.status === 'running' || t.status === 'queued' || t.status === 'assigned');
    expect(open, JSON.stringify(open)).toEqual([]);
  }, 120000);

  it('still runs a handled type to completion exactly once', async () => {
    const before = await call('fleet_status', {});
    const submitted = await call('task_submit', {
      type: 'index', targetDomains: ['code-intelligence'], payload: { paths: ['src/math.js'] },
    });
    expect(submitted.success, JSON.stringify(submitted)).toBe(true);
    const taskId = submitted.data.taskId as string;

    let state = submitted.data.status as string;
    const deadline = Date.now() + 60000;
    while (!['completed', 'failed', 'cancelled'].includes(state) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 250));
      const s = await call('task_status', { taskId });
      state = s.data.status;
    }
    expect(state).toBe('completed');

    const after = await call('fleet_status', {});
    expect(after.data.tasks.completed - before.data.tasks.completed).toBe(1);
    expect(after.data.tasks.running).toBe(0);
    expect(after.data.tasks.pending).toBe(0);
  }, 120000);
});
