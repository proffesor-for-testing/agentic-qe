/**
 * #1081: task_orchestrate infers a task type from the description and
 * submitted it even when no domain plugin handles that type. The task fell
 * through to the TaskAssigned event fallback, stayed `running` and held a
 * Queen slot for good (reviewers saw running:3 after scan-security, run-chaos
 * and assess-quality).
 *
 * Drives the built server over stdio: such descriptions must be rejected with
 * the reason, and a handled description must reach a terminal state, so the
 * fleet ends with nothing running or pending.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
// Descriptions task_orchestrate maps to types no domain plugin handles.
const UNHANDLED = [
  ['scan for security vulnerabilities', 'scan-security'],
  ['run chaos fault injection', 'run-chaos'],
  ['assess code quality', 'assess-quality'],
  ['validate the api contract', 'validate-contracts'],
] as const;

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP task_orchestrate leaves no task running that nothing executes (#1081)', () => {
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
    root = mkdtempSync(join(tmpdir(), 'aqe-1081-'));
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'src'));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'aqe-1081-fixture', version: '1.0.0', type: 'module' }));
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
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'task-orchestrate-1081', version: '1' } });
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

  async function settle(taskId: string): Promise<string> {
    const deadline = Date.now() + 60000;
    let state = '';
    while (Date.now() < deadline) {
      const s = await call('task_status', { taskId });
      state = s.data.status;
      if (['completed', 'failed', 'cancelled'].includes(state)) return state;
      await new Promise(r => setTimeout(r, 250));
    }
    return state;
  }

  it('rejects each description whose inferred type no domain executes, with the reason', async () => {
    for (const [task, type] of UNHANDLED) {
      const result = await call('task_orchestrate', { task });
      expect(result.success, `${task}: ${JSON.stringify(result)}`).toBe(false);
      expect(result.error).toContain(`No handler for task type '${type}'`);
      expect(result.error).toContain('supported:');
    }

    const status = await call('fleet_status', {});
    expect(status.success, JSON.stringify(status)).toBe(true);
    expect(status.data.tasks.running).toBe(0);
    expect(status.data.tasks.pending).toBe(0);
  }, 120000);

  it('still runs a handled description to a terminal state and frees its slot', async () => {
    const submitted = await call('task_orchestrate', { task: 'analyze coverage gaps' });
    expect(submitted.success, JSON.stringify(submitted)).toBe(true);
    expect(submitted.data.type).toBe('analyze-coverage');

    expect(['completed', 'failed']).toContain(await settle(submitted.data.taskId));

    const after = await call('fleet_status', {});
    expect(after.data.tasks.running).toBe(0);
    expect(after.data.tasks.pending).toBe(0);
    const list = await call('task_list', {});
    const open = (list.data as Array<{ taskId: string; status: string }>)
      .filter(t => t.status === 'running' || t.status === 'queued' || t.status === 'assigned');
    expect(open, JSON.stringify(open)).toEqual([]);
  }, 120000);
});
