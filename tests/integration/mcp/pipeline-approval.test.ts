import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';

// Drive the same long-lived server that owns pipeline_run's orchestrator.
// CI must build first; local unbuilt checkouts follow the other stdio tests.
const bundle = resolve('dist/mcp/bundle.js');
describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP pipeline approval over stdio', () => {
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
    root = mkdtempSync(join(tmpdir(), 'aqe-approval-mcp-'));
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
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'approval-test', version: '1' } });
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

  it.each(['approve', 'reject'])('can %s the running pipeline without a second orchestrator', async (decision) => {
    const pipelineId = `approval-${decision}`;
    const yaml = `id: ${pipelineId}
name: Approval regression
steps:
  - id: gated
    name: Gated action
    domain: quality-assessment
    action: gate-check
    approval: { expiresAfter: 0 }
    inputMapping:
      currentCoverage: input.coverage
      currentTestsPassingRate: input.tests
      currentBugs: input.bugs
`;
    expect((await call('pipeline_load', { yaml })).success).toBe(true);
    const run = await call('pipeline_run', { pipelineId, input: { coverage: 95, tests: 100, bugs: 0 } });
    expect(run.success).toBe(true);
    const executionId = run.data.executionId;
    // pipeline_run must return while the action is still held at its gate.
    const key = `workflow:execution:${executionId}`;
    expect((await call('memory_retrieve', { key, namespace: 'coordination' })).data.found).toBe(false);
    const decisionResult = await call(`pipeline_${decision}`, { executionId, stepId: 'gated', reason: 'Not ready' });
    expect(decisionResult.success).toBe(true);
    expect(decisionResult.data).toMatchObject({ executionId, stepId: 'gated', decision });
    let persisted: any;
    for (let attempt = 0; attempt < 40; attempt++) {
      const read = await call('memory_retrieve', { key, namespace: 'coordination' });
      if (read.data.found) { persisted = read.data.value; break; }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
    }
    expect(persisted?.status).toBe(decision === 'approve' ? 'completed' : 'failed');
    if (decision === 'approve') expect(persisted.context.results.gated.passed).toBe(true);
    else {
      expect(persisted.stepResults.gated.error).toBe('Not ready');
      expect(persisted.context.results.gated).toBeUndefined();
    }
    expect((await call(`pipeline_${decision}`, { executionId, stepId: 'gated' })).success).toBe(false);
  }, 60000);
});
