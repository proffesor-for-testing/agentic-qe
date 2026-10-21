/**
 * #1126: handlers that read a caller-named path from a task payload. Over MCP
 * stdio, generate-tests read an outside file, followed a symlink out of the
 * project, read /etc/hostname and /proc/self/environ, and the server died on
 * /dev/zero. The domain tools behind the same task payloads read outside
 * files (security_scan_comprehensive reported an outside eval() finding,
 * validation_pipeline read /etc/hostname) and named the files of an outside
 * directory (code_index, coverage_analyze_sublinear). Each handler now reads
 * only project files and refuses the rest by name without reading them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
const SECRET = 'hunter2_outside_secret';

// In CI a missing bundle is a failure, never a silent skip.
it.runIf(!!process.env.CI)('has a built MCP bundle to test (#1126)', () => {
  expect(existsSync(bundle), `${bundle} is missing: run npm run build first`).toBe(true);
});

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP handlers read only project paths (#1126)', () => {
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

  /** Submit a task and wait for its terminal state. */
  async function submit(type: string, domain: string, payload: Record<string, unknown>): Promise<{ status: string; error?: string }> {
    const submitted = await call('task_submit', { type, targetDomains: [domain], payload });
    expect(submitted.success, JSON.stringify(submitted)).toBe(true);
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const s = await call('task_status', { taskId: submitted.data.taskId, detailed: true });
      if (['completed', 'failed', 'cancelled'].includes(s.data.status)) return s.data;
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`${type} did not settle`);
  }

  const outsideFile = () => join(outside, 'secret.ts');

  beforeAll(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1126-root-')));
    outside = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1126-outside-')));
    writeFileSync(outsideFile(), `export function leak(a: number) {\n  return eval("${SECRET}" + a);\n}\n`);
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'src'));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'aqe-1126', version: '1.0.0', type: 'module' }));
    writeFileSync(join(root, 'src/ok.ts'), 'export function add(a: number, b: number) {\n  return a + b;\n}\n');
    symlinkSync(outsideFile(), join(root, 'src/link-out.ts'));
    // Review of #1162: the kernel follows src/l before applying `..`, so
    // src/l/../secret.ts opens <outside>/secret.ts, not the decoy beside it.
    mkdirSync(join(outside, 'a'));
    symlinkSync(join(outside, 'a'), join(root, 'src/l'));
    writeFileSync(join(root, 'src/secret.ts'), 'export const decoy = 1;\n');
    symlinkSync('/dev/shm', join(root, 'src/devl'));
    writeFileSync(join(outside, 'lcov.info'), `SF:${outsideFile()}\nDA:1,0\nend_of_record\n`);
    writeFileSync(join(outside, 'package.json'), JSON.stringify({ name: 'OUTSIDE_PKG_SECRET' }));
    // #1161: fixed names read inside an accepted directory, linked out of it.
    mkdirSync(join(root, 'sub'));
    symlinkSync(join(outside, 'package.json'), join(root, 'sub/package.json'));
    mkdirSync(join(root, 'sub2/coverage'), { recursive: true });
    symlinkSync('/dev/zero', join(root, 'sub2/coverage/lcov.info'));
    mkdirSync(join(root, 'sub3'));
    writeFileSync(join(root, 'sub3/app.py'), 'print("ok")\n');
    writeFileSync(join(outside, 'requirements.txt'), 'python-jose==3.0.0\n');
    symlinkSync(join(outside, 'requirements.txt'), join(root, 'sub3/requirements.txt'));
    // Review of #1179: the project-root coverage report, linked out.
    mkdirSync(join(root, 'coverage'));
    symlinkSync(join(outside, 'lcov.info'), join(root, 'coverage/lcov.info'));
    const home = join(root, '.home');
    mkdirSync(home);
    child = spawn(process.execPath, [bundle], {
      cwd: root,
      env: { ...process.env, HOME: home, AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory', AQE_HTTP_PORT: '0',
        AQE_SESSION_CACHE: 'off', AQE_LOOP_DETECTION_ENABLED: 'false', AQE_LLM_ROUTER_DISABLED: '1',
        AQE_COVERAGE_NO_EXEC: '1', npm_config_offline: 'true', npm_config_yes: 'false' },
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
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'paths-1126', version: '1' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const fleet = await call('fleet_init', { memoryBackend: 'memory', maxAgents: 4 });
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

  const refusedPaths: Array<[string, () => string]> = [
    ['an outside absolute path', outsideFile],
    ['a symlink pointing out', () => 'src/link-out.ts'],
    ['a .. path', () => `../${outside.split('/').pop()}/secret.ts`],
    ['/etc/hostname', () => '/etc/hostname'],
    ['/proc/self/environ', () => '/proc/self/environ'],
    ['.. after a symlinked directory', () => 'src/l/../secret.ts'],
    ['/dev/zero through a symlinked directory', () => 'src/devl/../zero'],
  ];

  describe('task_submit', () => {
    it.each([
      ['generate-tests', 'test-generation', (p: string) => ({ sourceFiles: [p], aiEnhancement: false })],
      ['execute-tests', 'test-execution', (p: string) => ({ testFiles: [p] })],
      ['detect-flaky', 'test-execution', (p: string) => ({ testFiles: [p], runs: 2 })],
      ['predict-defects', 'defect-intelligence', (p: string) => ({ files: [p] })],
      ['analyze-regression-risk', 'defect-intelligence', (p: string) => ({ changedFiles: [p] })],
    ])('%s refuses every path outside the project by name', async (type, domain, payload) => {
      for (const [label, requested] of refusedPaths) {
        const settled = await submit(type, domain, payload(requested()));
        expect(settled.status, `${label}: ${JSON.stringify(settled)}`).toBe('failed');
        expect(settled.error, label).toContain(`${requested()} (outside-project-root)`);
        expect(JSON.stringify(settled), label).not.toContain(SECRET);
      }
    }, 300000);

    it.each([
      ['analyze-regression-risk', 'defect-intelligence', (p: string) => ({ changedFiles: [p] })],
      ['execute-tests', 'test-execution', (p: string) => ({ testFiles: [p] })],
    ])('%s refuses a missing name reached as <dir-symlink>/../<name>', async (type, domain, payload) => {
      const settled = await submit(type, domain, payload('src/l/../new.ts'));
      expect(settled.status).toBe('failed');
      expect(settled.error).toContain('src/l/../new.ts (not-found)');
    }, 120000);

    it('execute-tests accepts a test directory inside the project (#909)', async () => {
      const settled = await submit('execute-tests', 'test-execution', { testFiles: ['src'] });
      expect(settled.error ?? '').not.toContain('Invalid execute-tests payload');
    }, 120000);

    it('generate-tests still reads a project file', async () => {
      const settled = await submit('generate-tests', 'test-generation', { sourceFiles: ['src/ok.ts'], aiEnhancement: false });
      expect(settled.status, JSON.stringify(settled)).toBe('completed');
    }, 120000);

    it('generate-tests refuses /dev/zero and a directory, and the server keeps running', async () => {
      const zero = await submit('generate-tests', 'test-generation', { sourceFiles: ['/dev/zero'] });
      expect(zero.status).toBe('failed');
      expect(zero.error).toContain('/dev/zero (outside-project-root)');
      const dir = await submit('generate-tests', 'test-generation', { sourceFiles: ['src'] });
      expect(dir.error).toContain('src (not-a-file)');

      expect((await call('fleet_status', {})).success).toBe(true);
      expect(child.exitCode).toBeNull();
    }, 120000);
  });

  describe('domain tools', () => {
    it.each([
      ['test_generate_enhanced', (p: string) => ({ filePath: p, aiEnhancement: false })],
      ['coverage_analyze_sublinear', (p: string) => ({ target: p })],
      ['security_scan_comprehensive', (p: string) => ({ target: p })],
      ['contract_validate', (p: string) => ({ contractPath: p })],
      ['defect_predict', (p: string) => ({ target: p })],
      ['code_index', (p: string) => ({ target: p })],
      ['validation_pipeline', (p: string) => ({ filePath: p })],
      ['qe/requirements/quality-criteria', (p: string) => ({ action: 'analyze', assessmentName: 'probe', epicPath: p })],
      ['qe/coverage/gaps (coverageFile)', (p: string) => ({ coverageFile: p })],
      ['qe/coverage/gaps (target)', (p: string) => ({ target: p })],
      ['qe/code/c4', (p: string) => ({ action: 'generate', projectPath: p })],
      ['qe/quality/gate', (p: string) => ({ checklistId: 'x', artifact: 'x', anchorPath: p })],
    ])('%s refuses outside files and directories without reading or listing them', async (tool, args) => {
      for (const [label, requested] of [...refusedPaths, ['an outside directory', () => outside] as [string, () => string]]) {
        const result = await call(tool.replace(/ \(.*\)$/, ''), args(requested()));
        expect(result.success, `${label}: ${JSON.stringify(result)}`).toBe(false);
        expect(result.error, label).toContain(`${requested()} (outside-project-root)`);
        // The outside directory's file name and content never appear.
        expect(JSON.stringify(result).replaceAll(requested(), ''), label).not.toMatch(/secret\.ts|hunter2|OUTSIDE_PKG_SECRET/);
      }
    }, 300000);

    it('a refused path does not open the domain circuit breaker', async () => {
      const result = await call('security_scan_comprehensive', { target: 'src' });
      expect(result.success, JSON.stringify(result)).toBe(true);
    }, 120000);
  });

  describe('fixed names inside an accepted directory (#1161)', () => {
    it('qe/code/c4 does not read a package.json linked out of the project', async () => {
      const result = await call('qe/code/c4', { action: 'generate', projectPath: 'sub' });
      expect(JSON.stringify(result)).not.toContain('OUTSIDE_PKG_SECRET');
    }, 120000);

    it('qe/coverage/gaps does not read a coverage file linked to /dev/zero, and the server keeps running', async () => {
      const result = await call('qe/coverage/gaps', { target: 'sub2' });
      expect(JSON.stringify(result)).not.toContain('Invalid string length');
      expect((await call('fleet_status', {})).success).toBe(true);
      expect(child.exitCode).toBeNull();
    }, 120000);

    it('coverage_analyze_sublinear does not read a project-root coverage report linked out of the project', async () => {
      const result = await call('coverage_analyze_sublinear', { target: '.' });
      const text = JSON.stringify(result);
      expect(text).not.toContain(outside);
    }, 120000);

    it('security_scan_comprehensive does not read a dependency manifest linked out of the project', async () => {
      const result = await call('security_scan_comprehensive', { target: 'sub3' });
      const text = JSON.stringify(result);
      expect(result.success, text).toBe(true);
      expect(text).not.toContain('python-jose');
      expect(text).not.toContain('CVE-2024-33663');
    }, 120000);
  });
});
