/** Native protocol regression: one request must launch one runner, not two. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
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

  it.each([false, true])('one MCP call preserves evidence and domain records (assertion fails: %s)', async (fails) => {
    if (fails) writeFileSync(join(root, 'fail.flag'), 'fail');
    const result = await call('test_execute_parallel', { testFiles: ['tests/counter.test.mjs'], parallel: true, retryCount: 0, saveResults: false });
    expect(result.success, JSON.stringify(result)).toBe(true);
    // The independently dispatched plugin can finish after the MCP result.
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1500));
    const invocations = readFileSync(join(root, 'invocations.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(invocations, JSON.stringify(invocations)).toHaveLength(fails ? 2 : 1);
    const status = await call('task_status', { taskId: result.data.taskId });
    expect(status.data.status, JSON.stringify(status)).toBe('completed');
    const evidence = await call('memory_retrieve', { namespace: 'quality-assessment', key: 'quality-evidence:testsPassing:latest' });
    expect(evidence.data, JSON.stringify(evidence)).toMatchObject({ found: true, value: { value: fails ? 0 : 100, source: 'test-execution', runStatus: fails ? 'failed' : 'passed' } });
    const runId = evidence.data.value.runId;
    const run = await call('memory_retrieve', { namespace: 'test-execution', key: `test-run:${runId}` });
    expect(run.data, JSON.stringify(run)).toMatchObject({ found: true, value: { passed: fails ? 0 : 1, failed: fails ? 1 : 0, testFiles: ['tests/counter.test.mjs'] } });
    for (const [namespace, prefix] of [['chaos-resilience', 'test-baseline'], ['code-intelligence', 'test-correlation'], ['quality-assessment', 'test-results']]) {
      const record = await call('memory_retrieve', { namespace, key: `${namespace}:${prefix}:${runId}` });
      expect(record.data.found, `${namespace}: ${JSON.stringify(record)}`).toBe(true);
    }
    const gate = await call('quality_assess', { runGate: true, saveResults: false });
    expect(gate.data?.unmeasured, JSON.stringify(gate)).toBeInstanceOf(Array);
    expect(gate.data.unmeasured).not.toContain('testsPassing');
    rmSync(join(root, 'fail.flag'), { force: true });
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
    expect(readFileSync(join(root, 'invocations.jsonl'), 'utf8').trim().split('\n')).toHaveLength(3);
  }, 30000);

  it('serves fleet status while the actual runner is held open (#1074)', async () => {
    writeFileSync(join(root, 'tests/slow.test.mjs'), `import {test} from 'vitest'; import {writeFileSync,existsSync} from 'node:fs'; test('held runner',async()=>{writeFileSync('runner-started','yes');while(!existsSync('release-runner'))await new Promise(r=>setTimeout(r,20));},20000);`);
    const running = call('test_execute_parallel', { testFiles: ['tests/slow.test.mjs'], retryCount: 0, saveResults: false });
    for (let i = 0; i < 100 && !existsSync(join(root, 'runner-started')); i++) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    }
    expect(existsSync(join(root, 'runner-started'))).toBe(true);
    let timer: ReturnType<typeof setTimeout>;
    const statusPromise = call('fleet_status');
    let responsive: boolean;
    try {
      responsive = await Promise.race([
        statusPromise.then(() => true),
        new Promise<boolean>(resolvePromise => { timer = setTimeout(() => resolvePromise(false), 2000); }),
      ]);
    } finally {
      clearTimeout(timer!);
      writeFileSync(join(root, 'release-runner'), 'release');
    }
    expect((await running).success).toBe(true);
    expect((await statusPromise).success).toBe(true);
    expect(responsive!, 'status must respond before the client releases the runner').toBe(true);
  }, 30000);

  it('a caller-owned runner failure is terminal, with no duplicate or Queen retry', async () => {
    writeFileSync(join(root, 'vitest.config.mjs'), `import {appendFileSync} from 'node:fs'; appendFileSync(new URL('./invocations.jsonl',import.meta.url),JSON.stringify({pid:process.pid,phase:'config'})+'\\n'); throw new Error('owned runner configuration failure');`);
    const result = await call('test_execute_parallel', { testFiles: ['tests/counter.test.mjs'], parallel: true, retryCount: 0, saveResults: false });
    expect(result.success, JSON.stringify(result)).toBe(false);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1500));
    expect(readFileSync(join(root, 'invocations.jsonl'), 'utf8').trim().split('\n')).toHaveLength(4);
    const list = await call('task_list', {});
    expect(list.data.filter((task: {type:string;status:string}) => task.type === 'execute-tests' && task.status === 'failed')).toHaveLength(1);
    expect(list.data.filter((task: {status:string}) => ['queued','assigned','running'].includes(task.status))).toEqual([]);
    const evidence = await call('memory_retrieve', { namespace: 'quality-assessment', key: 'quality-evidence:testsPassing:latest' });
    // The preceding ordinary submission passed; a runner error cannot replace it
    // with a fabricated failed-assertion measurement.
    expect(evidence.data.value).toMatchObject({ value: 100, runStatus: 'passed' });
  }, 30000);
});
