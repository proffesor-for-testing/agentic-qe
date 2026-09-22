/** Real runner receipts must retain suite and process failures on both execution paths. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestExecutorService } from '../../src/domains/test-execution/services/test-executor.js';
import type { InMemoryBackend } from '../../src/kernel/memory-backend.js';
import type { InstanceTaskHandler, TaskHandlerContext } from '../../src/coordination/handlers/handler-types.js';
import type { QueenTask } from '../../src/coordination/queen-coordinator.js';

describe('Real test runner outcome integrity', () => {
  const originalCwd = process.cwd();
  let fixture: string;
  let memory: InMemoryBackend;
  let executor: TestExecutorService;
  let executeTask: InstanceTaskHandler;

  beforeAll(async () => {
    fixture = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-runner-outcomes-')));
    const dependencies = resolve(dirname(fileURLToPath(import.meta.url)), '../../node_modules');
    symlinkSync(dependencies, join(fixture, 'node_modules'), 'dir');
    writeFileSync(join(fixture, 'package.json'), '{"type":"module","private":true}');
    writeFileSync(join(fixture, 'vitest.config.mjs'), 'export default {test:{maxWorkers:1,minWorkers:1,fileParallelism:false}};');
    const sources: Record<string, string> = {
      'pass.test.js': "import {it,expect} from 'vitest'; it('healthy',()=>expect(2+2).toBe(4));",
      'assertion.test.js': "import {it,expect,describe} from 'vitest'; describe('outer',()=>{describe('inner',()=>{it('assertion fails',()=>expect(2+2).toBe(5));});});",
      'import.test.js': "import './missing-application-module.js'; import {it} from 'vitest'; it('never reached',()=>{});",
      'teardown.test.js': "import {it,afterAll} from 'vitest'; it('healthy',()=>{}); afterAll(()=>{throw new Error('teardown fixture failure')});",
      'unhandled.test.js': "import {it} from 'vitest'; it('healthy',async()=>{Promise.reject(new Error('background rejection fixture')); await new Promise(r=>setTimeout(r,20));});",
      'todo.test.js': "import {it} from 'vitest'; it.todo('future work');",
      'empty.test.js': 'export const noTests = true;',
      'must-not-run.test.js': "import {writeFileSync} from 'node:fs'; import {it} from 'vitest'; writeFileSync('unexpected-execution.txt', 'ran'); it('must not run for a rejected request',()=>{});",
      'skipped.test.js': "import {it} from 'vitest'; it.skip('intentionally skipped',()=>{});",
    };
    for (const [name, content] of Object.entries(sources)) writeFileSync(join(fixture, name), content);
    vi.stubEnv('AQE_PROJECT_ROOT', fixture);
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    vi.stubEnv('npm_config_offline', 'true');
    process.chdir(fixture);
    const { InMemoryBackend: Backend } = await import('../../src/kernel/memory-backend.js');
    const { TestExecutorService: Executor } = await import('../../src/domains/test-execution/services/test-executor.js');
    const { registerTestExecutionHandlers } = await import('../../src/coordination/handlers/test-execution-handlers.js');
    memory = new Backend();
    await memory.initialize();
    executor = new Executor({ memory });
    // Only capture registration; the real handler starts the real runner.
    registerTestExecutionHandlers({
      registerHandler(name, handler) { if (name === 'execute-tests') executeTask = handler; },
    } as TaskHandlerContext);
  });

  afterAll(async () => {
    await memory?.dispose();
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  });

  it.each([
    { files: [], diagnostic: 'No test files specified' },
    { files: ['invalid path.test.js'], diagnostic: 'invalid characters' },
    { files: ['*.test.js'], diagnostic: 'expand glob patterns before calling' },
    { files: ['must-not-run.test.js', '*.test.js'], diagnostic: 'expand glob patterns before calling' },
  ])('rejects a task that cannot execute its requested files: $files', async ({ files, diagnostic }) => {
    const result = await executeTask({ payload: { testFiles: files } } as QueenTask);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('No execution produced a successful task receipt');
    expect(result.error.message).toContain(diagnostic);
    expect(existsSync(join(fixture, 'unexpected-execution.txt'))).toBe(false);
  });

  it.each([
    { name: 'healthy', files: ['pass.test.js'], failed: 0, passed: 1, skipped: 0 },
    { name: 'ordinary assertion failure', files: ['assertion.test.js'], failed: 1, passed: 0, skipped: 0 },
    { name: 'intentional todo', files: ['todo.test.js'], failed: 0, passed: 0, skipped: 1 },
    { name: 'intentional skip', files: ['skipped.test.js'], failed: 0, passed: 0, skipped: 1 },
  ])('preserves $name receipts', async ({ files, failed, passed, skipped }) => {
    const result = await executor.execute({ testFiles: files, framework: 'vitest' });
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;
    expect(result.value).toMatchObject({ status: failed ? 'failed' : 'passed', failed, passed, skipped });
    const handlerResult = await executeTask({ payload: { testFiles: files } } as QueenTask);
    expect(handlerResult.success).toBe(true);
    if (!handlerResult.success) throw handlerResult.error;
    expect(handlerResult.value).toMatchObject({ failed, passed, skipped });
  }, 20000);

  it.each([
    { name: 'suite import error', files: ['import.test.js'], diagnostic: 'missing-application-module' },
    { name: 'mixed healthy and broken suites', files: ['pass.test.js', 'import.test.js'], diagnostic: 'missing-application-module' },
    { name: 'teardown error after a passing assertion', files: ['teardown.test.js'], diagnostic: 'teardown fixture failure' },
    { name: 'unhandled rejection with passing assertions', files: ['unhandled.test.js'], diagnostic: /exit code 1/ },
    { name: 'no tests', files: ['empty.test.js'], diagnostic: /No test|zero tests/i },
  ])('rejects $name on the service and MCP task paths', async ({ files, diagnostic, name }) => {
    // Control: the raw runner really reports this failure class. Vitest 5 only
    // writes the JSON report to --outputFile (stdout carries a one-line notice).
    const rawReport = join(fixture, `raw-${name.replace(/\W+/g, '-')}.json`);
    const raw = spawnSync('npx', ['vitest', 'run', ...files, '--reporter=json', '--no-color', `--outputFile=${rawReport}`], {
      cwd: fixture, env: { ...process.env, CI: 'true', FORCE_COLOR: '0' }, encoding: 'utf8', timeout: 15000,
    });
    expect(raw.status).toBe(1);
    const receipt = JSON.parse(readFileSync(rawReport, 'utf8'));
    if (!name.startsWith('unhandled')) expect(receipt.success).toBe(false);
    expect(receipt.numFailedTests).toBe(0);
    if (name.startsWith('unhandled')) expect(receipt.numFailedTestSuites).toBe(0);

    const result = files.length > 1
      ? await executor.executeParallel({ testFiles: files, framework: 'vitest', workers: 2 })
      : await executor.execute({ testFiles: files, framework: 'vitest' });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Runner error became a successful test receipt');
    expect(result.error.message).toMatch(diagnostic);
    const handlerResult = await executeTask({ payload: { testFiles: files } } as QueenTask);
    expect(handlerResult.success).toBe(false);
    if (handlerResult.success) throw new Error('Runner error became a successful task receipt');
    expect(handlerResult.error.message).toMatch(diagnostic);
  }, 30000);
});
