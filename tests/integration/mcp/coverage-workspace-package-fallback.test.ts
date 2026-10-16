/** #1036: a root config with root-only test globs must not hide package coverage.
 * Uses installed real runners and the built stdio server. Optional Jest coverage
 * can be exercised with AQE_TEST_JEST_MODULES pointing at a Jest node_modules.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const repo = resolve('.');
const modules = join(repo, 'node_modules');
const bundle = join(repo, 'dist/mcp/bundle.js');
const cli = join(repo, 'dist/cli/bundle.js');
const runners: Array<{ runner: 'vitest' | 'jest'; modules: string }> = [{ runner: 'vitest', modules }];
if (process.env.AQE_TEST_JEST_MODULES) runners.push({ runner: 'jest', modules: resolve(process.env.AQE_TEST_JEST_MODULES) });

describe.each(runners)('workspace package fallback over real $runner and MCP stdio', ({ runner, modules: runnerModules }) => {
  let root: string;
  let child: ChildProcessWithoutNullStreams;
  let id = 0;
  let stderr = '';
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  function request(method: string, params: Record<string, unknown>): Promise<any> {
    const requestId = ++id;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(stderr.slice(-3000))); }, 60000);
      pending.set(requestId, { resolve: resolvePromise, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
    });
  }
  async function call(name: string, args: Record<string, unknown>) {
    const response = await request('tools/call', { name, arguments: args });
    expect(response.error).toBeUndefined();
    return JSON.parse(response.result.content[0].text);
  }
  const env = () => ({ ...process.env, AQE_PROJECT_ROOT: root, AQE_MEMORY_BACKEND: 'memory',
    AQE_SESSION_CACHE: 'off', AQE_LOOP_DETECTION_ENABLED: 'false', AQE_LLM_ROUTER_DISABLED: 'true',
    AQE_EMBEDDER_ENDPOINT: 'http://127.0.0.1:1', AQE_HTTP_PORT: '0', AQE_TRAJECTORY_JUDGE: '0' });

  beforeAll(async () => {
    expect(existsSync(bundle)).toBe(true);
    root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-ws-')));
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'], devDependencies: { [runner]: '*' } }));
    const marker = JSON.stringify(join(root, 'root-loaded'));
    writeFileSync(join(root, runner === 'vitest' ? 'vitest.config.mjs' : 'jest.config.cjs'), runner === 'vitest'
      ? `import { appendFileSync } from 'node:fs'; appendFileSync(${marker}, process.cwd()+'\\n'); export default {test:{include:['tests/**/*.test.js'],passWithNoTests:true}};`
      : `require('node:fs').appendFileSync(${marker}, process.cwd()+'\\n'); module.exports={roots:['<rootDir>/tests']};`);
    mkdirSync(join(root, 'tests'));
    symlinkSync(runnerModules, join(root, 'node_modules'), 'dir');
    child = spawn(process.execPath, [bundle], { cwd: root, env: env(), stdio: 'pipe' });
    child.stderr.on('data', data => { stderr += String(data); });
    createInterface({ input: child.stdout }).on('line', line => {
      let message: any;
      try { message = JSON.parse(line); } catch { return; }
      const waiter = pending.get(message.id);
      if (waiter) { pending.delete(message.id); clearTimeout(waiter.timer); waiter.resolve(message); }
    });
    child.on('exit', code => {
      for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(`exit ${code}: ${stderr.slice(-3000)}`)); }
      pending.clear();
    });
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'coverage-1036', version: '1' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    expect((await call('fleet_init', { memoryBackend: 'memory', maxAgents: 2 })).success).toBe(true);
  }, 60000);

  afterAll(async () => {
    if (child?.exitCode === null) {
      const exited = new Promise(resolvePromise => child.once('exit', resolvePromise));
      child.kill('SIGKILL');
      await exited;
    }
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function makePackage(name: string, declared: boolean, empty = false) {
    const pkg = join(root, 'packages', name);
    mkdirSync(join(pkg, 'src'), { recursive: true });
    mkdirSync(join(pkg, 'test'));
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name, devDependencies: declared ? { [runner]: '*' } : {} }));
    writeFileSync(join(pkg, 'src/math.js'), 'exports.add = (a, b) => a + b;\nexports.unused = a => a * 2;\n');
    const imports = runner === 'vitest' ? "import { it, expect, describe } from 'vitest'; import math from '../src/math.js';" : "const math = require('../src/math.js');";
    writeFileSync(join(pkg, 'test/math.test.js'), imports + (empty
      ? "describe.skip('empty', () => {});" : "it('adds', () => expect(math.add(1, 2)).toBe(3));"));
    return pkg;
  }

  it.each([true, false])('measures a package with runner dependency=%s, matching native runner and CLI report', async declared => {
    const pkg = makePackage(declared ? 'declared' : 'hoisted', declared);
    const result = await call('coverage_analyze_sublinear', { target: join(pkg, 'src'), saveResults: false });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data, JSON.stringify(result)).toMatchObject({ measured: true, estimated: false });
    expect(readFileSync(join(root, 'root-loaded'), 'utf8')).toContain(root);

    const output = join(pkg, '.ref');
    const runnerFile = join(runnerModules, runner === 'vitest' ? 'vitest/vitest.mjs' : 'jest/bin/jest.js');
    const args = runner === 'vitest'
      ? ['run', '--coverage', `--coverage.reportsDirectory=${output}`, '--coverage.reporter=json', '--coverage.reporter=json-summary']
      : ['--runInBand', '--coverage', `--coverageDirectory=${output}`, '--coverageReporters=json', '--coverageReporters=json-summary'];
    const native = spawnSync(process.execPath, [runnerFile, ...args], { cwd: pkg, env: env(), encoding: 'utf8', timeout: 60000 });
    expect(native.status, native.stderr).toBe(0);
    const summary = JSON.parse(readFileSync(join(output, 'coverage-summary.json'), 'utf8')).total;
    expect(result.data.lineCoverage).toBeCloseTo(summary.lines.pct, 0);
    expect(result.data.functionCoverage).toBeCloseTo(summary.functions.pct, 0);
    const command = spawnSync(process.execPath, [cli, 'coverage', join(output, 'coverage-final.json'), '-F', 'json'],
      { cwd: root, env: env(), encoding: 'utf8', timeout: 60000 });
    const doc = JSON.parse(command.stdout);
    expect(doc).toMatchObject({ measured: true, estimated: false });
    expect(doc.summary.line).toBeCloseTo(summary.lines.pct, 0);
    expect(doc.summary.function).toBeCloseTo(summary.functions.pct, 0);
  }, 180000);

  it('uses an isolated package install when the adopted root has no runner binary', async () => {
    const pkg = makePackage('isolated', true);
    symlinkSync(runnerModules, join(pkg, 'node_modules'), 'dir');
    unlinkSync(join(root, 'node_modules'));
    try {
      const result = await call('coverage_analyze_sublinear', { target: join(pkg, 'src'), saveResults: false });
      expect(result.success, JSON.stringify(result)).toBe(true);
      expect(result.data, JSON.stringify(result)).toMatchObject({ measured: true, estimated: false, functionCoverage: 50 });
    } finally {
      symlinkSync(runnerModules, join(root, 'node_modules'), 'dir');
    }
  }, 180000);

  it('keeps zero tests in both places unmeasured, including the CLI exit code', async () => {
    const pkg = makePackage('empty', true, true);
    const result = await call('coverage_analyze_sublinear', { target: join(pkg, 'src'), saveResults: false });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data).toMatchObject({ measured: false, unmeasured: true, lineCoverage: null });
    const command = spawnSync(process.execPath, [cli, 'coverage', join(pkg, 'src'), '-F', 'json'],
      { cwd: root, env: env(), encoding: 'utf8', timeout: 60000 });
    expect(command.status, command.stderr).toBe(3);
    expect(JSON.parse(command.stdout)).toMatchObject({ measured: false, unmeasured: true, meetsThreshold: null });
  }, 180000);
});
