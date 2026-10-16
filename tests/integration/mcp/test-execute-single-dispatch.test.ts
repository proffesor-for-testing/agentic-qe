/** Native protocol regression: one request must launch one runner, not two. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
describe('MCP test_execute_parallel single execution over stdio (#1059)', () => {
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
    root = mkdtempSync(join(tmpdir(), 'aqe-single-execute-mcp-'));
    mkdirSync(join(root, 'tests'));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'tests/counter.test.mjs'), `import {test,expect} from 'vitest'; import {appendFileSync,existsSync} from 'node:fs'; test('one invocation',()=>{appendFileSync(new URL('../invocations.jsonl',import.meta.url),JSON.stringify({pid:process.pid})+'\\n');expect(existsSync(new URL('../fail.flag',import.meta.url))).toBe(false);});`);
    child = spawn(process.execPath, [bundle], {
      cwd: root,
      env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8', NODE_OPTIONS: process.env.NODE_OPTIONS,
        AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_LLM_ROUTER_DISABLED: 'true',
        npm_config_offline: 'true', AQE_ROUTE_TIMEOUT_MS: '1', AQE_WORKERS_ENABLED: 'false',
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

  it('runs one actual test-runner invocation for one MCP call', async () => {
    const result = await call('test_execute_parallel', { testFiles: ['tests/counter.test.mjs'], parallel: true, retryCount: 0, saveResults: false });
    expect(result.success, JSON.stringify(result)).toBe(true);
    // The independently dispatched plugin can finish after the MCP result.
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1500));
    const invocations = readFileSync(join(root, 'invocations.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(invocations, JSON.stringify(invocations)).toHaveLength(1);
    const status = await call('task_status', { taskId: result.data.taskId });
    expect(status.data.status, JSON.stringify(status)).toBe('completed');
  }, 60000);
  it('ordinary Queen submission still executes the plugin once, ignoring a payload owner claim', async () => {
    const result = await call('task_submit', { type: 'execute-tests', targetDomains: ['test-execution'], payload: { testFiles: ['tests/counter.test.mjs'], parallel: true, retryCount: 0, executionOwner: 'caller' } });
    expect(result.success, JSON.stringify(result)).toBe(true);
    let status;
    for (let attempt = 0; attempt < 100; attempt++) {
      status = await call('task_status', { taskId: result.data.taskId });
      if (['completed', 'failed'].includes(status.data.status)) break;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    }
    expect(status.data.status, JSON.stringify(status)).toBe('completed');
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
    expect(readFileSync(join(root, 'invocations.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2);
  }, 30000);

  it('a caller-owned runner failure is terminal, with no duplicate or Queen retry', async () => {
    writeFileSync(join(root, 'vitest.config.mjs'), `import {appendFileSync} from 'node:fs'; appendFileSync(new URL('./invocations.jsonl',import.meta.url),JSON.stringify({pid:process.pid,phase:'config'})+'\\n'); throw new Error('owned runner configuration failure');`);
    const result = await call('test_execute_parallel', { testFiles: ['tests/counter.test.mjs'], parallel: true, retryCount: 0, saveResults: false });
    expect(result.success, JSON.stringify(result)).toBe(false);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1500));
    expect(readFileSync(join(root, 'invocations.jsonl'), 'utf8').trim().split('\n')).toHaveLength(3);
    const list = await call('task_list', {});
    expect(list.data.filter((task: {status:string}) => task.status === 'failed')).toHaveLength(1);
    expect(list.data.filter((task: {status:string}) => ['queued','assigned','running'].includes(task.status))).toEqual([]);
  }, 30000);
});
