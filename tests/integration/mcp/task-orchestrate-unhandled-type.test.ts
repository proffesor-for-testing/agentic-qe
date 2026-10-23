/**
 * #1081: task_orchestrate infers a task type from the description and
 * submitted it even when no domain plugin handles that type. The task fell
 * through to the TaskAssigned event fallback, stayed `running` and held a
 * Queen slot for good (reviewers saw running:3 after scan-security, run-chaos
 * and assess-quality).
 *
 * Drives the built server over stdio: such descriptions must be rejected with
 * the reason, and a handled description must reach a terminal state, so the
 * fleet ends with nothing running or pending.
 *
 * #1125: inferred types whose domain runs a concrete handler (sast-scan,
 * analyze-quality) are routed there with input from the request; the others
 * are refused with the input they need.
 *
 * #1200: an inferred coverage task runs the coverage_analyze_sublinear handler
 * on its target and reports the same figures and evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const bundle = resolve('dist/mcp/bundle.js');
// Descriptions whose inferred type needs input a description does not carry
// (#1125). Each is refused with what to supply instead of being submitted.
const NEEDS_INPUT = [
  ['scan for security vulnerabilities', 'scan-security', 'Pass filePaths'],
  ['run chaos fault injection', 'run-chaos', 'Use chaos_test'],
  // #1130: this wording used to be inferred as execute-tests.
  ['Run chaos resilience testing with fault injection', 'run-chaos', 'Use chaos_test'],
  ['assess code quality', 'assess-quality', 'Pass filePaths'],
  ['validate the api contract', 'validate-contracts', 'Use contract_validate'],
  ['validate requirements for login', 'validate-requirements', 'Use requirements_validate'],
  ['test accessibility of https://example.com', 'test-accessibility', 'Use accessibility_test'],
  // #1125 review: a description must not overwrite learned strategies.
  // #1146: only learning wording infers it; "improve ..." alone no longer does.
  ['optimize the learning strategies', 'optimize-learning', 'Use task_submit with type optimize-strategies'],
  // #1146: a search is refused as a search, not for lacking files to index.
  ['semantic search for auth code', 'index-code', 'the description asks for a code search'],
  // #1225: generate-tests without source files was accepted, then failed with "missing sourceFiles".
  ['improve the login page performance', 'generate-tests', 'no task type could be inferred from the description'],
  ['generate unit tests for the user service', 'generate-tests', 'Pass filePaths with the source files to generate tests for'],
] as const;

describe.skipIf(!existsSync(bundle) && !process.env.CI)('MCP task_orchestrate leaves no task running that nothing executes (#1081)', () => {
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
    root = mkdtempSync(join(tmpdir(), 'aqe-1081-'));
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'src'));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'aqe-1081-fixture', version: '1.0.0', type: 'module' }));
    writeFileSync(join(root, 'src/math.js'), 'export function add(a, b) { return a + b; }');
    writeFileSync(join(root, 'src/unsafe.js'), 'export function run(input) {\n  return eval(input);\n}\n');
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
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'task-orchestrate-1081', version: '1' } });
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
  });

  async function settle(taskId: string): Promise<string> {
    const deadline = Date.now() + 60000;
    let state = '';
    while (Date.now() < deadline) {
      const s = await call('task_status', { taskId });
      state = s.data.status;
      if (['completed', 'failed', 'cancelled'].includes(state)) return state;
      await new Promise(r => setTimeout(r, 250));
    }
    return state;
  }

  it('refuses each description whose handler input the request does not carry, saying what to supply', async () => {
    for (const [task, type, hint] of NEEDS_INPUT) {
      const result = await call('task_orchestrate', { task });
      expect(result.success, `${task}: ${JSON.stringify(result)}`).toBe(false);
      expect(result.error).toContain(`task_orchestrate inferred '${type}' from the description`);
      expect(result.error).toContain(hint);
    }

    const status = await call('fleet_status', {});
    expect(status.success, JSON.stringify(status)).toBe(true);
    expect(status.data.tasks.running).toBe(0);
    expect(status.data.tasks.pending).toBe(0);
  }, 120000);

  // #1125: these inferred types run the domain's concrete handler.
  it.each([
    ['scan for security vulnerabilities', { filePaths: ['src/unsafe.js'] }, 'scan-security', 'sast-scan'],
    ['assess code quality', { filePaths: ['src/math.js'] }, 'assess-quality', 'analyze-quality'],
  ])('routes "%s" to a real handler that completes', async (task, extra, inferredType, type) => {
    const submitted = await call('task_orchestrate', { task, ...extra });
    expect(submitted.success, JSON.stringify(submitted)).toBe(true);
    expect(submitted.data).toMatchObject({ type, inferredType, status: 'submitted' });

    expect(await settle(submitted.data.taskId)).toBe('completed');
    if (type === 'sast-scan') {
      const detail = await call('task_status', { taskId: submitted.data.taskId, detailed: true });
      expect(JSON.stringify(detail.data.result)).toContain('eval()');
    }
  }, 120000);

  // #1225: a test generation request that names its source file runs on it.
  it('generates tests for the source file a description names', async () => {
    const submitted = await call('task_orchestrate', { task: 'generate unit tests for src/math.js' });
    expect(submitted.success, JSON.stringify(submitted)).toBe(true);
    expect(submitted.data).toMatchObject({ type: 'generate-tests', status: 'submitted' });
    expect(await settle(submitted.data.taskId)).toBe('completed');
  }, 120000);

  it('refuses scan filePaths outside the project', async () => {
    const result = await call('task_orchestrate', { task: 'scan for security vulnerabilities', filePaths: ['../outside.js'] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('these filePaths cannot be read: ../outside.js (outside-project-root)');
  }, 120000);

  it('still runs a handled description to a terminal state and frees its slot', async () => {
    const submitted = await call('task_orchestrate', { task: 'analyze coverage gaps' });
    expect(submitted.success, JSON.stringify(submitted)).toBe(true);
    expect(submitted.data.type).toBe('analyze-coverage');

    expect(['completed', 'failed']).toContain(await settle(submitted.data.taskId));

    const after = await call('fleet_status', {});
    expect(after.data.tasks.running).toBe(0);
    expect(after.data.tasks.pending).toBe(0);
    const list = await call('task_list', {});
    const open = (list.data as Array<{ taskId: string; status: string }>)
      .filter(t => t.status === 'running' || t.status === 'queued' || t.status === 'assigned');
    expect(open, JSON.stringify(open)).toEqual([]);
  }, 120000);

  it('runs an orchestrated coverage task on its filePath, as coverage_analyze_sublinear does (#1200)', async () => {
    mkdirSync(join(root, 'coverage'), { recursive: true });
    writeFileSync(join(root, 'coverage/lcov.info'),
      'TN:\nSF:src/math.js\nFN:1,add\nFNDA:1,add\nFNF:1\nFNH:1\nDA:1,1\nLF:1\nLH:1\nend_of_record\n');
    try {
      const submitted = await call('task_orchestrate', { task: 'analyze coverage for src', filePaths: ['src/math.js'] });
      expect(submitted.success, JSON.stringify(submitted)).toBe(true);
      expect(submitted.data.type).toBe('analyze-coverage');
      expect(await settle(submitted.data.taskId)).toBe('completed');
      const { data: { result } } = await call('task_status', { taskId: submitted.data.taskId, detailed: true });

      const reference = await call('coverage_analyze_sublinear', { target: 'src/math.js', saveResults: false });
      expect(reference.success, JSON.stringify(reference)).toBe(true);
      expect(result).toMatchObject({
        lineCoverage: reference.data.lineCoverage,
        functionCoverage: reference.data.functionCoverage,
        totalFiles: 1,
        measured: true,
        coverageMethod: 'instrumented-report',
        evidenceStatus: reference.data.evidenceStatus,
      });
      expect(result.lineCoverage).toBe(100);

      // A file the report does not list is UNMEASURED, not 0%.
      const outside = await call('task_orchestrate', { task: 'analyze coverage', filePaths: ['src/unsafe.js'] });
      expect(await settle(outside.data.taskId)).toBe('completed');
      const unmeasured = await call('task_status', { taskId: outside.data.taskId, detailed: true });
      expect(unmeasured.data.result).toMatchObject({ lineCoverage: null, measured: false, unmeasured: true });
    } finally {
      rmSync(join(root, 'coverage'), { recursive: true, force: true });
    }
  }, 120000);
});
