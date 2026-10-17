/** #1052: public MCP DAST failure has observed failed-engine provenance. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
import { createServer } from 'node:net';

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP DAST initial request failure over stdio (#1052)', () => {
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
    root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1052-dast-')));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'fake-home'));
    writeFileSync(join(root, 'src', 'owned.ts'), 'export const owned = 1;\n');
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

  it('reports a failed required DAST engine for an owned unreachable target', async () => {
    const reserved = createServer();
    await new Promise<void>(resolvePromise => reserved.listen(0, '127.0.0.1', resolvePromise));
    const address = reserved.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture port');
    const targetUrl = `http://127.0.0.1:${address.port}/`;
    await new Promise<void>(resolvePromise => reserved.close(() => resolvePromise()));
    const result = await call('security_scan_comprehensive', {
      target: 'src/', sast: false, dast: true, targetUrl, saveResults: false,
    });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data.evidence.completeness).toBe('none');
    expect(result.data.evidence.engines).toContainEqual(expect.objectContaining({
      id: 'dast', requested: true, required: true, target: targetUrl, status: 'failed',
      errors: expect.arrayContaining([expect.stringContaining('DAST_REQUEST_FAILED')]),
    }));
    expect(result.data.evidence.limitations.join(' ')).toContain('DAST_REQUEST_FAILED');
  }, 120000);
});
