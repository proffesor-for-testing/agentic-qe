/**
 * #1125 review: sast-scan accepts plain path strings, and task_submit lets a
 * caller send any path. Over MCP stdio, an unconfined handler read files
 * outside the project (a finding snippet leaked an outside password),
 * followed a symlink out of the project, read /etc/hostname, and died with a
 * V8 out-of-memory crash on /dev/zero. The handler now scans only regular
 * files inside the project root, within a size limit, and refuses the rest
 * by name without reading them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
const SECRET = 'hunter2-outside-secret';

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP task_submit sast-scan reads only project files (#1125)', () => {
  let child: ChildProcessWithoutNullStreams;
  let root: string;
  let outside: string;
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

  /** Submit a sast-scan and wait for its terminal state. */
  async function scan(files: string[]): Promise<{ status: string; error?: string; result?: unknown }> {
    const submitted = await call('task_submit', { type: 'sast-scan', targetDomains: ['security-compliance'], payload: { files } });
    expect(submitted.success, JSON.stringify(submitted)).toBe(true);
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const s = await call('task_status', { taskId: submitted.data.taskId, detailed: true });
      if (['completed', 'failed', 'cancelled'].includes(s.data.status)) return s.data;
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('sast-scan did not settle');
  }

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'aqe-1125-sast-'));
    outside = mkdtempSync(join(tmpdir(), 'aqe-1125-outside-'));
    writeFileSync(join(outside, 'secret.js'), `const password = "${SECRET}";\neval(password);\n`);
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'src'));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'aqe-1125-sast', version: '1.0.0', type: 'module' }));
    writeFileSync(join(root, 'src/unsafe.js'), 'export function run(input) {\n  return eval(input);\n}\n');
    writeFileSync(join(root, 'src/big.js'), `// ${'x'.repeat(3 * 1024 * 1024)}\n`);
    symlinkSync(join(outside, 'secret.js'), join(root, 'src/link-out.js'));
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
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'sast-1125', version: '1' } });
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
    if (outside) rmSync(outside, { recursive: true, force: true });
  });

  it('scans a project file and reports its finding', async () => {
    const settled = await scan(['src/unsafe.js']);
    expect(settled.status, JSON.stringify(settled)).toBe('completed');
    expect(JSON.stringify(settled.result)).toContain('eval()');
  }, 120000);

  it.each([
    ['an absolute path outside the project', () => join(outside, 'secret.js'), 'outside-project-root'],
    ['a symlink that points out of the project', () => 'src/link-out.js', 'outside-project-root'],
    ['a system file', () => '/etc/hostname', 'outside-project-root'],
    ['a file over the size limit', () => 'src/big.js', 'too-large'],
  ])('refuses %s without reading it', async (_label, file, reason) => {
    const settled = await scan([file()]);
    expect(settled.status).toBe('failed');
    expect(settled.error).toContain(`(${reason})`);
    expect(JSON.stringify(settled)).not.toContain(SECRET);
  }, 120000);

  it('refuses /dev/zero and the server keeps running', async () => {
    const settled = await scan(['/dev/zero']);
    expect(settled.status).toBe('failed');
    expect(settled.error).toContain('cannot be scanned');

    const status = await call('fleet_status', {});
    expect(status.success).toBe(true);
    expect(child.exitCode).toBeNull();
  }, 120000);

  it('refuses the whole request when any file is not allowed', async () => {
    const settled = await scan(['src/unsafe.js', join(outside, 'secret.js')]);
    expect(settled.status).toBe('failed');
    expect(JSON.stringify(settled)).not.toContain(SECRET);
  }, 120000);
});
