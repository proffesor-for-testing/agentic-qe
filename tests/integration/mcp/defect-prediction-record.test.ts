/** #1050: a real MCP call records a prediction the worker can consume. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
import Database from 'better-sqlite3';
import { DefectPredictorWorker } from '../../../src/workers/workers/defect-predictor';
import { contextFor, namespacedStore } from '../../unit/workers/workers/measured-worker-store';

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP defect_predict records predictions over stdio (#1050)', () => {
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
    root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1050-record-')));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'fake-home'));
    writeFileSync(join(root, 'src', 'risky.ts'), 'export function risky(x: number) {\n' + '                        if (x) x++; // TODO FIXME HACK XXX\n'.repeat(550) + '}\n');
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: join(root, 'fake-home'), AQE_PROJECT_ROOT: root, AQE_HTTP_PORT: '0',
      AQE_SESSION_CACHE: 'off', AQE_LOOP_DETECTION_ENABLED: 'false', AQE_LLM_ROUTER_DISABLED: '1' };
    delete env.AQE_MEMORY_BACKEND;
    child = spawn(process.execPath, [bundle], { cwd: root, env, stdio: 'pipe' });
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
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'save-results-925', version: '1' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const fleet = await call('fleet_init', { maxAgents: 2 });
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

  it('retains static provenance through MCP, canonical persistence and worker consumption', async () => {
    const result = await call('defect_predict', { target: 'src/', saveResults: false });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data).toMatchObject({ predictionMethod: 'static-code-indicators', estimated: true });
    const db = new Database(join(root, '.agentic-qe', 'memory.db'), { readonly: true });
    let rows: Array<{ key: string; value: string }>;
    try {
      rows = db.prepare("SELECT key, value FROM kv_store WHERE namespace = 'defect-intelligence' AND key LIKE 'defect-intelligence:predictor:prediction:%'").all() as typeof rows;
    } finally { db.close(); }
    expect(rows).toHaveLength(1);
    const record = JSON.parse(rows[0].value);
    expect(record.predictions).toContainEqual(expect.objectContaining({ file: join(root, 'src', 'risky.ts') }));
    const store = namespacedStore();
    await store.memory.set(rows[0].key, record, { namespace: 'defect-intelligence' });
    const oldRoot = process.env.AQE_PROJECT_ROOT;
    try {
      process.env.AQE_PROJECT_ROOT = root;
      const worker = await new DefectPredictorWorker().execute(contextFor(store.memory));
      expect(worker.metrics.itemsAnalyzed).toBe(1);
      expect(worker.findings[0].description).toContain('estimated code-risk score (static-code-indicators)');
    } finally {
      if (oldRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
      else process.env.AQE_PROJECT_ROOT = oldRoot;
    }
  }, 120000);
});
