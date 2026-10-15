/**
 * #925: test_generate_enhanced over the real stdio protocol server.
 * saveResults:false must write nothing under .agentic-qe/results/; the default
 * must keep writing the manifest, the report and the generated test sources
 * (under results/tests/generated/) and return their paths.
 *
 * Uses the file-backed memory backend on purpose: AQE_MEMORY_BACKEND=memory
 * disables the result saver entirely (#534), which would hide the bug.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
const SOURCE = 'export function add(a: number, b: number): number { return a + b; }';

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP test_generate_enhanced saveResults over stdio (#925)', () => {
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

  const resultsDir = () => join(root, '.agentic-qe', 'results');
  const testResults = () => {
    const dir = join(resultsDir(), 'tests');
    return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('_manifest.json') || f.endsWith('_report.md')) : [];
  };

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'aqe-925-save-results-'));
    const env: NodeJS.ProcessEnv = { ...process.env, AQE_PROJECT_ROOT: root, AQE_HTTP_PORT: '0',
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

  it('documents saveResults in tools/list', async () => {
    const list = await request('tools/list', {});
    const tool = list.result.tools.find((t: { name: string }) => t.name === 'test_generate_enhanced');
    expect(tool.description).toContain('.agentic-qe/results/tests/');
    expect(tool.inputSchema.properties.saveResults).toMatchObject({ type: 'boolean', default: true });
  }, 60000);

  it('saveResults:false writes nothing under .agentic-qe/results', async () => {
    expect(existsSync(resultsDir())).toBe(false);

    const result = await call('test_generate_enhanced', { sourceCode: SOURCE, filePath: 'math.ts', saveResults: false });

    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data).toMatchObject({ resultsSaved: false, savedFiles: [] });
    expect(result.data.resultsNote).toContain('no files were written under .agentic-qe/results/');
    expect(existsSync(resultsDir())).toBe(false);
  }, 120000);

  it('the default writes generated test code alongside the manifest and report', async () => {
    const result = await call('test_generate_enhanced', { sourceCode: SOURCE, filePath: 'math.ts' });

    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data.resultsSaved).toBe(true);
    const saved: string[] = result.data.savedFiles;
    expect(saved.some(f => f.endsWith('_manifest.json'))).toBe(true);
    expect(saved.some(f => f.endsWith('_report.md'))).toBe(true);
    const generated = saved.filter(f => f.endsWith('.test.ts'));
    expect(generated.length).toBeGreaterThan(0);
    expect(readFileSync(resolve(root, generated[0]), 'utf8')).toBe(result.data.tests[0].testCode);
    for (const file of saved) expect(existsSync(resolve(root, file)), file).toBe(true);
    expect(testResults()).toHaveLength(2);
  }, 120000);
});
