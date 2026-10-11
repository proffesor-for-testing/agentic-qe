/**
 * #933: ten domain tools over the real stdio protocol server.
 * saveResults:false must write nothing under .agentic-qe/results/; the default
 * must keep writing the manifest and report and return their paths.
 *
 * Uses the file-backed memory backend on purpose: AQE_MEMORY_BACKEND=memory
 * disables the result saver entirely (#534), which would hide the bug.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
const SOURCE = 'export function add(a, b) { return a + b; }';
const cases = [
  ['test_execute_parallel',{testFiles:['tests/math.test.mjs']}],
  ['coverage_analyze_sublinear',{target:'src/'}],
  ['quality_assess',{runGate:false}],
  ['security_scan_comprehensive',{target:'src/',sast:true,dast:false}],
  ['contract_validate',{contractPath:'openapi.json'}],
  ['accessibility_test',{url:'http://127.0.0.1:1'}],
  ['chaos_test',{target:'owned-fixture',faultType:'latency'}],
  ['defect_predict',{target:'src/'}],
  ['requirements_validate',{requirementsPath:'requirements.md'}],
  ['code_index',{target:'src/'}],
] as const;

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP domain saveResults contracts over stdio (#933)', () => {
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
  const resultFiles = (): string[] => {
    const walk = (dir:string):string[] => existsSync(dir) ? readdirSync(dir,{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(join(dir,entry.name)) : [join(dir,entry.name)]) : [];
    return walk(resultsDir()).sort();
  };

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'aqe-933-save-results-'));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'tests'));
    // The production backend invokes npx vitest. Bind the owned project to the
    // already installed test runtime and prohibit network installation.
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'src/math.js'), SOURCE);
    writeFileSync(join(root, 'tests/math.test.mjs'), 'import { test, expect } from "vitest"; test("owned",()=>expect(2+2).toBe(4));');
    writeFileSync(join(root, 'requirements.md'), '# Requirements\nThe system shall add two numbers and return their sum.\n');
    writeFileSync(join(root, 'openapi.json'), JSON.stringify({openapi:'3.0.0',info:{title:'Owned fixture',version:'1'},paths:{}}));
    const env: NodeJS.ProcessEnv = { ...process.env, AQE_PROJECT_ROOT: root, AQE_HTTP_PORT: '0',
      AQE_SESSION_CACHE: 'off', AQE_LOOP_DETECTION_ENABLED: 'false', AQE_LLM_ROUTER_DISABLED: '1',
      npm_config_offline: 'true', npm_config_yes: 'false' };
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

  it('retains the existing test generation saving schema', async () => {
    const list = await request('tools/list', {});
    const tool = list.result.tools.find((t: { name: string }) => t.name === 'test_generate_enhanced');
    expect(tool.inputSchema.properties.saveResults).toMatchObject({ type: 'boolean', default: true });
  });

  it('retains existing test generation no-save reporting', async () => {
    const before = resultFiles();
    const result = await call('test_generate_enhanced', {
      sourceCode: SOURCE, filePath: 'src/math.js', language: 'javascript', saveResults: false,
    });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data).toMatchObject({ resultsSaved: false, savedFiles: [] });
    expect(resultFiles()).toEqual(before);
  }, 120000);

  it('refuses invalid saveResults before writing result files', async () => {
    const before = resultFiles();
    const response = await request('tools/call', {
      name: 'code_index', arguments: { target: 'src/', saveResults: 'false' },
    });
    const result = response.error ?? JSON.parse(response.result.content[0].text);
    expect(response.error !== undefined || result.success === false).toBe(true);
    expect(JSON.stringify(result)).toContain('saveResults');
    expect(resultFiles()).toEqual(before);
  }, 120000);

  for (const [name, args] of cases) {
    it(`${name} documents its saving contract`, async () => {
      const list = await request('tools/list', {});
      const tool = list.result.tools.find((t:{name:string})=>t.name===name);
      expect(tool.description).toContain('.agentic-qe/results/');
      expect(tool.description.length).toBeLessThanOrEqual(200);
      expect(tool.description).toContain('saveResults:false');
      expect(tool.inputSchema.properties.saveResults).toMatchObject({type:'boolean',default:true});
    },60000);
    it(`${name} supports no-save with an explicit report`, async () => {
      const before = resultFiles();
      const result = await call(name,{...args,saveResults:false});
      expect(result.success,JSON.stringify(result)).toBe(true);
      expect(resultFiles()).toEqual(before);
      expect(result.data).toMatchObject({resultsSaved:false,savedFiles:[]});
      expect(result.data.resultsNote).toContain('no files were written');
    },120000);
    it(`${name} preserves default saving and reports actual file paths`, async () => {
      const before = resultFiles();
      const result = await call(name,{...args});
      expect(result.success,JSON.stringify(result)).toBe(true);
      expect(result.data.savedFiles.length).toBeGreaterThan(0);
      for(const file of result.data.savedFiles) expect(existsSync(resolve(root,file)),file).toBe(true);
      expect(resultFiles().length).toBeGreaterThan(before.length);
      expect(result.data.resultsSaved).toBe(true);
      expect(result.data.resultsNote).toContain('Saved');
    },120000);
  }
});
