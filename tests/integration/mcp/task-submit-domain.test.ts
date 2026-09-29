/**
 * MCP-CLI parity for #734 case D: `task_submit` over stdio must reject an
 * unknown target domain, as `aqe task submit --domain` does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP task_submit domain validation over stdio (#734)', () => {
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
      }, 30000);
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
    root = mkdtempSync(join(tmpdir(), 'aqe-task-domain-mcp-'));
    child = spawn(process.execPath, [bundle], {
      cwd: root,
      env: { ...process.env, AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory',
        AQE_HTTP_PORT: '0', AQE_SESSION_CACHE: 'off', AQE_LOOP_DETECTION_ENABLED: 'false' },
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
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'task-domain-test', version: '1' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const fleet = await call('fleet_init', { memoryBackend: 'memory', maxAgents: 2 });
    expect(fleet.success, JSON.stringify(fleet)).toBe(true);
  }, 60000);

  afterAll(async () => {
    if (child?.exitCode === null) {
      const exited = new Promise(resolvePromise => child.once('exit', resolvePromise));
      child.kill('SIGKILL');
      await exited;
    }
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('rejects an unknown target domain without creating a task', async () => {
    const result = await call('task_submit', { type: 'analyze-coverage', priority: 'p3', targetDomains: ['no-such-domain'] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown domain: no-such-domain');
    const list = await call('task_list', {});
    expect(list.success).toBe(true);
    expect(list.data).toHaveLength(0);
  }, 60000);

  it('still accepts a known target domain', async () => {
    const result = await call('task_submit', { type: 'analyze-coverage', priority: 'p3', targetDomains: ['coverage-analysis'] });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data.assignedDomain).toBe('coverage-analysis');
  }, 60000);
});
