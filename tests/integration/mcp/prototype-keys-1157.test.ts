/**
 * #1157: keys taken from caller data must not resolve through
 * Object.prototype. Over MCP stdio, a pipeline condition on
 * `input.constructor` ran a step that should be skipped, a step whose action
 * is `toString` did not fail as an unregistered action, and qe/code/c4 crashed
 * on a package.json that depends on a package named `constructor`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');

// In CI a missing bundle is a failure, never a silent skip.
it.runIf(!!process.env.CI)('has a built MCP bundle to test (#1157)', () => {
  expect(existsSync(bundle), `${bundle} is missing: run npm run build first`).toBe(true);
});

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP tools ignore inherited keys (#1157)', () => {
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

  /** Load and run a pipeline, then wait for its terminal status. */
  async function runPipeline(yaml: string, input: Record<string, unknown> = {}): Promise<any> {
    const loaded = await call('pipeline_load', { yaml });
    expect(loaded.success, JSON.stringify(loaded)).toBe(true);
    const run = await call('pipeline_run', { pipelineId: loaded.data.pipelineId, input });
    expect(run.success, JSON.stringify(run)).toBe(true);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const status = await call('pipeline_status', { executionId: run.data.executionId });
      if (['completed', 'failed', 'cancelled'].includes(status.data?.status)) return status.data;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('pipeline did not settle');
  }

  beforeAll(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1157-')));
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, '.home'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'aqe-1157',
      dependencies: { constructor: '1.0.0', toString: '1.0.0', hasOwnProperty: '1.0.0', redis: '4.0.0' },
    }));
    writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;\n');
    child = spawn(process.execPath, [bundle], {
      cwd: root,
      env: { ...process.env, HOME: join(root, '.home'), AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory',
        AQE_HTTP_PORT: '0', AQE_SESSION_CACHE: 'off', AQE_LOOP_DETECTION_ENABLED: 'false', AQE_LLM_ROUTER_DISABLED: '1' },
      stdio: 'pipe',
    });
    child.stderr.on('data', data => { stderr = (stderr + String(data)).slice(-20000); });
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
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'proto-1157', version: '1' } });
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

  it.each(['constructor', 'toString', '__proto__'])(
    'pipeline_run skips a step whose condition reads input.%s that the input does not have',
    async (key) => {
      const status = await runPipeline(`id: proto-cond-${key.replace(/_/g, 'u')}
name: Prototype condition
steps:
  - id: guarded
    name: Guarded
    domain: quality-assessment
    action: gate-check
    condition: { path: input.${key}, operator: exists, value: true }
`);
      expect(status.skippedSteps, JSON.stringify(status)).toContain('guarded');
    }, 60000);

  it.each(['toString', 'hasOwnProperty', 'valueOf'])(
    'pipeline_run reports an action named %s as not registered',
    async (action) => {
      const status = await runPipeline(`id: proto-act-${action}
name: Prototype action
steps:
  - id: s1
    name: s1
    domain: requirements-validation
    action: ${action}
`);
      expect(status.status, JSON.stringify(status)).toBe('failed');
      expect(status.error).toContain(`Action '${action}' not registered`);
    }, 60000);

  it('qe/code/c4 reads dependencies named after Object.prototype members as plain packages', async () => {
    const result = await call('qe/code/c4', { action: 'generate', projectPath: '.' });

    expect(result.success, JSON.stringify(result)).toBe(true);
    // Only redis is a known external system.
    expect(result.data.generateResult.externalSystemsDetected).toBe(1);
  }, 60000);
});
