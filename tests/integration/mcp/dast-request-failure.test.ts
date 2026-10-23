/** #1052, #1135: public MCP DAST failures and partial scans have observed engine provenance. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
import { createServer as createHttpServer, type Server } from 'node:http';

const bundle = resolve('dist/mcp/bundle.js');
import { createServer } from 'node:net';

// #1135: no silent skip. Without a built bundle this suite fails and says why.
describe('MCP DAST initial request failure over stdio (#1052)', () => {
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

  let fixture: Server;
  let fixtureUrl: string;

  beforeAll(async () => {
    if (!existsSync(bundle)) throw new Error(`${bundle} is not built; run \`npm run build\` before this suite`);
    // Owned loopback target: `/` is rate limited under /limited, `/.env` is dropped (WAF 444).
    fixture = createHttpServer((request, response) => {
      if (request.url === '/limited/') { response.writeHead(429); return response.end('Too Many Requests'); }
      if (request.url === '/.env') return request.socket.destroy();
      response.writeHead(request.url === '/' ? 200 : 404, { 'Content-Type': 'text/html' });
      response.end(request.url === '/' ? '<html><body>owned</body></html>' : 'not found');
    });
    await new Promise<void>(resolvePromise => fixture.listen(0, '127.0.0.1', resolvePromise));
    const fixtureAddress = fixture.address();
    if (!fixtureAddress || typeof fixtureAddress === 'string') throw new Error('Missing fixture port');
    fixtureUrl = `http://127.0.0.1:${fixtureAddress.port}/`;
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
    fixture?.closeAllConnections();
    if (fixture) await new Promise<void>(resolvePromise => fixture.close(() => resolvePromise()));
  });

  async function dastEngine(targetUrl: string) {
    const result = await call('security_scan_comprehensive', { target: 'src/', sast: false, dast: true, targetUrl, saveResults: false });
    expect(result.success, JSON.stringify(result)).toBe(true);
    return { data: result.data, engine: result.data.evidence.engines.find((engine: { id: string }) => engine.id === 'dast') };
  }

  it('fails an initially rate-limited target instead of scoring the 429 page (#1135)', async () => {
    const { data, engine } = await dastEngine(`${fixtureUrl}limited/`);
    expect(engine).toMatchObject({ status: 'failed', errors: [expect.stringContaining('DAST_RATE_LIMITED')] });
    expect(data.findings).toEqual([]);
  }, 120000);

  it('fails an invalid target URL as a validation error, without a finding (#1135)', async () => {
    const { data, engine } = await dastEngine('not a url');
    expect(engine).toMatchObject({ status: 'failed', errors: [expect.stringContaining('DAST_INVALID_TARGET')] });
    expect(data.findings).toEqual([]);
  }, 120000);

  it('keeps the findings of a partially answered scan and lists the dropped probe (#1135)', async () => {
    const { data, engine } = await dastEngine(fixtureUrl);
    expect(engine).toMatchObject({ status: 'partial', errors: [expect.stringContaining('1 request(s) not answered (DAST_REQUEST_FAILED)')] });
    expect(engine.limitations).toEqual([expect.stringContaining(`${fixtureUrl}.env (DAST_REQUEST_FAILED`)]);
    expect(data.status).not.toBe('completed');
    expect(data.findings.map((finding: { title: string }) => finding.title)).toContain('Missing Content-Security-Policy');
  }, 120000);

  it('reports the security-audit DAST phase failed for an unreachable target (#1052)', async () => {
    const reserved = createServer();
    await new Promise<void>(resolvePromise => reserved.listen(0, '127.0.0.1', resolvePromise));
    const address = reserved.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture port');
    await new Promise<void>(resolvePromise => reserved.close(() => resolvePromise()));
    const submitted = await call('task_submit', { type: 'security-audit', payload: {
      targetUrl: `http://127.0.0.1:${address.port}/`, includeDAST: true, includeSAST: false, includeDependencies: false, includeSecrets: false,
    } });
    expect(submitted.success, JSON.stringify(submitted)).toBe(true);
    let status: any;
    for (let attempt = 0; attempt < 120; attempt++) {
      status = await call('task_status', { taskId: submitted.data.taskId, detailed: true });
      if (['completed', 'failed', 'cancelled'].includes(status.data?.status)) break;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
    }
    expect(status.data.status).toBe('completed');
    expect(status.data.result.dastResults).toMatchObject({ status: 'failed', vulnerabilities: [] });
    expect(status.data.result.incompleteChecks.join(' ')).toContain('DAST_REQUEST_FAILED');
    expect(status.data.result.recommendations.join(' ')).not.toContain('Security posture is good');
  }, 120000);

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
