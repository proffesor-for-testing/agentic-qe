/**
 * #1247: a test file runs from its nearest runner project (the directory with
 * its vitest/jest config), never from above the project root, and an explicit
 * projectRoot must stay inside the project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findRunnerProjectDir, groupByRunnerProject, requireTestRunTargets, runnerCwdFor,
} from '../../../../src/shared/test-runner-project.js';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { RetryHandlerService } from '../../../../src/domains/test-execution/services/retry-handler.js';
import { TestExecutionCoordinator } from '../../../../src/domains/test-execution/coordinator';
import { createCoordinatorTestContext, resetTestContext } from '../coordinator-test-utils';
import { registerTestExecutionHandlers } from '../../../../src/coordination/handlers/test-execution-handlers';
// Load order as in production (domain-handlers → configs) to resolve the module cycle.
import '../../../../src/mcp/handlers/domain-handlers';
import { testExecuteConfig } from '../../../../src/mcp/handlers/domain-handler-configs';
import { ok } from '../../../../src/shared/types';

const VITEST_CONFIG = "export default { test: { setupFiles: ['./setup.ts'] } };\n";

let root: string;
let outside: string;
const originalCwd = process.cwd();

function write(file: string, text = ''): string {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
  return file;
}

/** Monorepo: root package.json without a runner, two packages with their own vitest config. */
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1247-')));
  outside = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1247-outside-')));
  write(join(root, 'package.json'), JSON.stringify({ name: 'mono', private: true, workspaces: ['apps/*'] }));
  for (const app of ['webapp', 'api']) {
    write(join(root, 'apps', app, 'vitest.config.ts'), VITEST_CONFIG);
    write(join(root, 'apps', app, 'src', 'x.test.ts'));
  }
  write(join(root, 'tests', 'root.test.ts'));
  write(join(outside, 'vitest.config.ts'), VITEST_CONFIG);
  vi.stubEnv('AQE_PROJECT_ROOT', root);
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('#1247 runner project resolution', () => {
  it('resolves a nested package file to the package with its own config', () => {
    expect(runnerCwdFor(join(root, 'apps/webapp/src/x.test.ts'), { cwd: root, boundary: root }))
      .toBe(join(root, 'apps/webapp'));
  });

  it('keeps the current directory for a file of the root project (single-project repos unchanged)', () => {
    write(join(root, 'vitest.config.ts'), VITEST_CONFIG);
    expect(runnerCwdFor('tests/root.test.ts', { cwd: root, boundary: root })).toBe(root);
  });

  it('keeps the current directory when no runner config is found', () => {
    expect(runnerCwdFor(join(root, 'tests/root.test.ts'), { cwd: root, boundary: root })).toBe(root);
  });

  it('keeps the current directory when it is already inside the file\'s project', () => {
    const cwd = join(root, 'apps/webapp');
    expect(runnerCwdFor('src/x.test.ts', { cwd, boundary: root })).toBe(cwd);
  });

  it('never searches above the project root', () => {
    // A config in the parent of the boundary is not adopted.
    write(join(root, 'vitest.config.ts'), VITEST_CONFIG);
    const boundary = join(root, 'tests');
    expect(findRunnerProjectDir(join(boundary, 'root.test.ts'), boundary)).toBeUndefined();
    // A file outside the boundary is never resolved to a project.
    expect(findRunnerProjectDir(join(outside, 'a.test.ts'), root)).toBeUndefined();
  });

  it('counts a vite config only when it configures tests', () => {
    write(join(root, 'apps/web/vite.config.ts'), 'export default { plugins: [] };\n');
    write(join(root, 'apps/web/package.json'), JSON.stringify({ name: 'web', dependencies: { react: '*' } }));
    write(join(root, 'apps/web/src/a.test.ts'));
    expect(findRunnerProjectDir(join(root, 'apps/web/src/a.test.ts'), root)).toBeUndefined();

    write(join(root, 'apps/web/vite.config.ts'), "export default { test: { environment: 'jsdom' } };\n");
    expect(findRunnerProjectDir(join(root, 'apps/web/src/a.test.ts'), root)).toBe(join(root, 'apps/web'));
  });

  it('counts a package.json with a top-level jest config key as a project', () => {
    write(join(root, 'apps/jesty/package.json'), JSON.stringify({ name: 'jesty', jest: { testEnvironment: 'node' } }));
    write(join(root, 'apps/jesty/a.test.ts'));
    expect(findRunnerProjectDir(join(root, 'apps/jesty/a.test.ts'), root)).toBe(join(root, 'apps/jesty'));
  });

  it('does not count a package.json that only lists a runner as a dependency or test script', () => {
    write(join(root, 'apps/deps/package.json'), JSON.stringify({
      name: 'deps', devDependencies: { vitest: '*', jest: '*' }, scripts: { test: 'vitest run' },
    }));
    write(join(root, 'apps/deps/a.test.ts'));
    expect(findRunnerProjectDir(join(root, 'apps/deps/a.test.ts'), root)).toBeUndefined();
  });

  // Lead review: a Vitest workspace whose root config defines the projects,
  // with packages that only list vitest, must keep running from the root.
  it('runs a workspace package without its own config from the root that defines test.projects', () => {
    write(join(root, 'vitest.config.ts'),
      "export default { test: { projects: ['packages/*'], setupFiles: ['./setup.ts'] } };\n");
    write(join(root, 'packages/lib/package.json'), JSON.stringify({
      name: 'lib', devDependencies: { vitest: '*' }, scripts: { test: 'vitest' },
    }));
    write(join(root, 'packages/lib/src/a.test.ts'));
    expect(findRunnerProjectDir(join(root, 'packages/lib/src/a.test.ts'), root)).toBe(root);
    expect(runnerCwdFor('packages/lib/src/a.test.ts', { cwd: root, boundary: root })).toBe(root);
  });

  it('runs a workspace package from the root that has a vitest.workspace file', () => {
    write(join(root, 'vitest.workspace.ts'), "export default ['packages/*'];\n");
    write(join(root, 'packages/lib/package.json'), JSON.stringify({ name: 'lib', devDependencies: { vitest: '*' } }));
    write(join(root, 'packages/lib/src/a.test.ts'));
    expect(runnerCwdFor('packages/lib/src/a.test.ts', { cwd: root, boundary: root })).toBe(root);
  });

  it('groups mixed files from two packages and the root project, in first-seen order', () => {
    write(join(root, 'vitest.config.ts'), VITEST_CONFIG);
    const files = ['apps/webapp/src/x.test.ts', 'tests/root.test.ts', 'apps/api/src/x.test.ts'];
    expect(groupByRunnerProject(files, { cwd: root, boundary: root })).toEqual([
      { cwd: join(root, 'apps/webapp'), files: ['apps/webapp/src/x.test.ts'] },
      { cwd: root, files: ['tests/root.test.ts'] },
      { cwd: join(root, 'apps/api'), files: ['apps/api/src/x.test.ts'] },
    ]);
  });
});

describe('#1247 TestExecutorService starts each runner in its project', () => {
  type Spawn = (files: string[], framework: string, timeout: number, cwd?: string) => Promise<unknown>;

  function executorWithSpy() {
    const memory = { get: vi.fn(), set: vi.fn(), storeVector: vi.fn() };
    const executor = new TestExecutorService({ memory: memory as never }, { enableLLMAnalysis: false });
    const spawn = vi.spyOn(executor as unknown as { spawnTestRunner: Spawn }, 'spawnTestRunner')
      .mockImplementation(async (files: string[]) => ok({
        total: files.length, passed: files.length, failed: 0, skipped: 0, failedTests: [],
      }));
    return { executor, spawn };
  }

  it('runs a nested package file from that package (the issue reproduction)', async () => {
    process.chdir(root);
    const { executor, spawn } = executorWithSpy();
    const result = await executor.executeParallel({
      testFiles: ['apps/webapp/src/x.test.ts'], framework: 'vitest', workers: 4,
    });
    expect(result.success).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][0]).toEqual(['apps/webapp/src/x.test.ts']);
    expect(spawn.mock.calls[0][3]).toBe(join(root, 'apps/webapp'));
  });

  it('runs files from two packages and the root as separate runners and merges the run', async () => {
    write(join(root, 'vitest.config.ts'), VITEST_CONFIG);
    process.chdir(root);
    const { executor, spawn } = executorWithSpy();
    const result = await executor.executeParallel({
      testFiles: ['apps/webapp/src/x.test.ts', 'apps/api/src/x.test.ts', 'tests/root.test.ts'],
      framework: 'vitest', workers: 4,
    });
    expect(result.success && result.value).toMatchObject({ total: 3, passed: 3, failed: 0, status: 'passed' });
    const calls = spawn.mock.calls.map(call => ({ files: call[0], cwd: call[3] }));
    expect(calls).toEqual(expect.arrayContaining([
      { files: ['apps/webapp/src/x.test.ts'], cwd: join(root, 'apps/webapp') },
      { files: ['apps/api/src/x.test.ts'], cwd: join(root, 'apps/api') },
      { files: ['tests/root.test.ts'], cwd: root },
    ]));
    expect(calls).toHaveLength(3);
  });

  it('runs a root-project file from the current directory, as before', async () => {
    write(join(root, 'vitest.config.ts'), VITEST_CONFIG);
    process.chdir(root);
    const { executor, spawn } = executorWithSpy();
    await executor.execute({ testFiles: ['tests/root.test.ts'], framework: 'vitest' });
    expect(spawn.mock.calls[0][3]).toBe(process.cwd());
  });

  it('runs every file from an explicit projectRoot', async () => {
    process.chdir(root);
    const { executor, spawn } = executorWithSpy();
    const projectRoot = join(root, 'apps/webapp');
    await executor.executeParallel({
      testFiles: ['apps/webapp/src/x.test.ts', 'apps/api/src/x.test.ts'],
      framework: 'vitest', workers: 1, projectRoot,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][3]).toBe(projectRoot);
  });
});

describe('#1247 retries run from the same project', () => {
  it('retries a nested package test from that package', async () => {
    process.chdir(root);
    const memory = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn() };
    const handler = new RetryHandlerService(memory as never, { testRunner: 'vitest' });
    const internals = handler as unknown as {
      spawnTestProcess: (command: string, args: string[], cwd: string) => Promise<unknown>;
      executeRealTest: (test: unknown) => Promise<unknown>;
    };
    const spawn = vi.spyOn(internals, 'spawnTestProcess').mockResolvedValue({ passed: true, output: '' });
    await internals.executeRealTest({
      testId: 't', testName: 'webapp setup loaded', file: 'apps/webapp/src/x.test.ts', error: 'x', duration: 0,
    });
    expect(spawn.mock.calls[0][2]).toBe(join(root, 'apps/webapp'));
    // The file argument stays absolute, so the different cwd cannot change it.
    expect(spawn.mock.calls[0][1]).toContain(join(root, 'apps/webapp/src/x.test.ts'));
  });
});

describe('#1247 retries honour an explicit projectRoot', () => {
  const failed = {
    testId: 't', testName: 'webapp setup loaded', file: join('apps', 'webapp', 'src', 'x.test.ts'), error: 'x', duration: 0,
  };

  it('the retry handler runs every retry from the request projectRoot, not the file lookup', async () => {
    process.chdir(root);
    const memory = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn() };
    const handler = new RetryHandlerService(memory as never, { testRunner: 'vitest' });
    const spawn = vi.spyOn(handler as unknown as {
      spawnTestProcess: (command: string, args: string[], cwd: string) => Promise<unknown>;
    }, 'spawnTestProcess').mockResolvedValue({ passed: true, output: '' });
    const projectRoot = join(root, 'apps/api');

    const result = await handler.executeWithRetry({
      runId: 'r', failedTests: [failed], maxRetries: 1, backoff: 'constant', baseDelay: 0, projectRoot,
    });

    expect(result.success && result.value.nowPassing).toBe(1);
    expect(spawn.mock.calls[0][2]).toBe(projectRoot);
  });

  it('the coordinator passes the run projectRoot to its retries', async () => {
    const ctx = createCoordinatorTestContext();
    const coordinator = new TestExecutionCoordinator(ctx.eventBus, ctx.memory, {
      simulateForTesting: true, enablePrioritization: false, enableMinCutAwareness: false, enableConsensus: false,
    });
    try {
      const executor = (coordinator as unknown as { executor: TestExecutorService }).executor;
      const run = {
        runId: 'r', status: 'failed' as const, total: 1, passed: 0, failed: 1, skipped: 0, duration: 1, failedTests: [failed],
      };
      vi.spyOn(executor, 'execute').mockResolvedValue(ok(run));
      vi.spyOn(executor, 'getResults').mockResolvedValue(ok(run));
      const retryHandler = (coordinator as unknown as { retryHandler: RetryHandlerService }).retryHandler;
      const executeWithRetry = vi.spyOn(retryHandler, 'executeWithRetry').mockResolvedValue(ok({
        originalFailed: 1, retried: 1, nowPassing: 1, stillFailing: 0, flakyDetected: ['t'],
        tests: [{ testId: 't', attempts: 1, passed: true }],
      }));
      const projectRoot = join(root, 'apps/api');

      await coordinator.runTests({ testFiles: [failed.file], retryCount: 1, projectRoot });

      expect(executeWithRetry).toHaveBeenCalledWith(expect.objectContaining({ projectRoot }));
    } finally {
      await coordinator.dispose();
      resetTestContext(ctx);
    }
  });
});

describe('#1247 explicit projectRoot is confined to the project', () => {
  beforeEach(() => { process.chdir(root); });

  it('accepts a package directory and reads relative test files from it', async () => {
    const result = await requireTestRunTargets('execute-tests', ['src/x.test.ts'], 'apps/webapp');
    expect(result.success && result.value).toEqual({
      projectRoot: join(root, 'apps/webapp'),
      testFiles: [join(root, 'apps/webapp/src/x.test.ts')],
    });
  });

  it('leaves the request unchanged when no projectRoot is given', async () => {
    const result = await requireTestRunTargets('execute-tests', ['apps/webapp/src/x.test.ts'], undefined);
    expect(result.success && result.value).toEqual({ testFiles: ['apps/webapp/src/x.test.ts'] });
  });

  it.each([
    ['a parent traversal', '../'],
    ['a traversal through a package', 'apps/../../'],
    ['an absolute path outside the project', '<outside>'],
    ['a symlink pointing out of the project', 'escape'],
    ['a file rather than a directory', 'package.json'],
    ['a missing directory', 'apps/missing'],
    ['an empty string', ''],
    ['a non-string', 42],
  ])('rejects %s', async (_label, value) => {
    symlinkSync(outside, join(root, 'escape'));
    const projectRoot = value === '<outside>' ? outside : value;
    const result = await requireTestRunTargets('execute-tests', ['src/x.test.ts'], projectRoot);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toMatch(/projectRoot/);
  });

  it('still confines test files relative to a valid projectRoot', async () => {
    const result = await requireTestRunTargets('execute-tests', ['../../../outside.test.ts'], 'apps/webapp');
    expect(result.success).toBe(false);
  });

  it('the execute-tests handler refuses an escaping projectRoot before any runner starts', async () => {
    const runTests = vi.fn();
    const handlers = new Map<string, (task: unknown) => Promise<{ success: boolean; error?: Error }>>();
    registerTestExecutionHandlers({
      registerHandler: (type: string, h: never) => { handlers.set(type, h); },
      getTestExecutionAPI: async () => ({ runTests }),
    } as never);
    const result = await handlers.get('execute-tests')!({
      executionOwner: 'caller', payload: { testFiles: ['src/x.test.ts'], projectRoot: outside },
    });
    expect(result.success).toBe(false);
    expect(runTests).not.toHaveBeenCalled();
  });

  it('the execute-tests handler passes a confined projectRoot to the domain', async () => {
    const runTests = vi.fn(async () => ({ success: true, value: { runId: 'r', total: 1, passed: 1, failed: 0 } }));
    const handlers = new Map<string, (task: unknown) => Promise<{ success: boolean }>>();
    registerTestExecutionHandlers({
      registerHandler: (type: string, h: never) => { handlers.set(type, h); },
      getTestExecutionAPI: async () => ({ runTests }),
    } as never);
    const result = await handlers.get('execute-tests')!({
      executionOwner: 'caller', payload: { testFiles: ['src/x.test.ts'], projectRoot: 'apps/webapp' },
    });
    expect(result.success).toBe(true);
    expect(runTests).toHaveBeenCalledWith(expect.objectContaining({
      testFiles: [join(root, 'apps/webapp/src/x.test.ts')],
      projectRoot: join(root, 'apps/webapp'),
    }));
  });

  it('the MCP payload carries projectRoot only when the caller gave one', () => {
    expect(testExecuteConfig.mapToPayload({ testFiles: ['a.test.ts'], projectRoot: 'apps/webapp' } as never, undefined))
      .toMatchObject({ projectRoot: 'apps/webapp' });
    expect(testExecuteConfig.mapToPayload({ testFiles: ['a.test.ts'] } as never, undefined))
      .not.toHaveProperty('projectRoot');
  });
});
