/**
 * #933: the 10 other handler-factory domain tools advertise saveResults over
 * the real stdio protocol server, and code_index (one of the newly advertised
 * tools) honours saveResults:false end to end.
 *
 * Uses the file-backed memory backend on purpose: AQE_MEMORY_BACKEND=memory
 * disables the result saver entirely (#534), which would hide the behavior.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
const TOOLS = [
  'test_generate_enhanced', 'test_execute_parallel', 'coverage_analyze_sublinear', 'quality_assess',
  'security_scan_comprehensive', 'contract_validate', 'accessibility_test', 'chaos_test',
  'defect_predict', 'requirements_validate', 'code_index',
];

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP domain tools advertise and honour saveResults over stdio (#933)', () => {
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
  const indexResults = () => {
    const dir = join(resultsDir(), 'code-index');
    return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('_index.json')) : [];
  };

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'aqe-933-save-results-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'math.ts'), 'export function add(a: number, b: number): number { return a + b; }\n');
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
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'save-results-933', version: '1' } });
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

  it('lists saveResults in the schema and description of every result-saving tool', async () => {
    const list = await request('tools/list', {});
    for (const name of TOOLS) {
      const tool = list.result.tools.find((t: { name: string }) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool.inputSchema.properties.saveResults, name).toMatchObject({ type: 'boolean', default: true });
      expect(tool.inputSchema.properties.saveResults.description, name).toContain('Set false to');
      expect(tool.description, name).toContain('pass saveResults: false');
    }
  }, 60000);

  it('code_index with saveResults:false writes nothing under .agentic-qe/results', async () => {
    expect(existsSync(resultsDir())).toBe(false);

    const result = await call('code_index', { target: 'src', saveResults: false });

    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data).toMatchObject({ resultsSaved: false, savedFiles: [] });
    expect(result.data.resultsNote).toContain('no files were written under .agentic-qe/results/');
    expect(existsSync(resultsDir())).toBe(false);
  }, 120000);

  it('code_index by default writes its index and returns the path', async () => {
    const result = await call('code_index', { target: 'src' });

    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data.resultsSaved).toBe(true);
    const saved: string[] = result.data.savedFiles;
    expect(saved.some(f => f.endsWith('_index.json'))).toBe(true);
    for (const file of saved) expect(existsSync(resolve(root, file)), file).toBe(true);
    expect(indexResults()).toHaveLength(1);
  }, 120000);
});
