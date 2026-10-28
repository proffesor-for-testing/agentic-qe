/**
 * #1272: follow-ups to #1247. Without an explicit framework, each runner
 * project's own config chooses jest or vitest; the flaky detector runs each
 * file from its runner project; `aqe test execute --project-root` is checked
 * like MCP `projectRoot`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { spawn, runTestRunnerProcess } = vi.hoisted(() => ({ spawn: vi.fn(), runTestRunnerProcess: vi.fn() }));
vi.mock('child_process', async (importOriginal) => ({ ...(await importOriginal<object>()), spawn }));
vi.mock('../../../../src/shared/test-runner-process.js', () => ({ runTestRunnerProcess }));

import { requireRunProjectRoot, runnerFrameworkFor } from '../../../../src/shared/test-runner-project.js';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { FlakyDetectorService } from '../../../../src/domains/test-execution/services/flaky-detector.js';
import { TestExecutionCoordinator } from '../../../../src/domains/test-execution/coordinator';
import { createCoordinatorTestContext, resetTestContext } from '../coordinator-test-utils';
import { registerTestExecutionHandlers } from '../../../../src/coordination/handlers/test-execution-handlers';
import { createTestCommand } from '../../../../src/cli/commands/test.js';
import type { CLIContext } from '../../../../src/cli/handlers/interfaces.js';
import { ok } from '../../../../src/shared/types';

let root: string;
let outside: string;
const originalCwd = process.cwd();

function write(file: string, text = ''): string {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
  return file;
}

/** A runner report with one passing test, as Jest (and Vitest) print it. */
function report(file: string): string {
  return JSON.stringify({
    numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, success: true,
    testResults: [{ name: file, status: 'passed', assertionResults: [{ title: 'a', fullName: 'a', status: 'passed', duration: 1 }] }],
  });
}

/** Monorepo: apps/web is a Vitest project, apps/api a Jest project. */
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1272-')));
  outside = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1272-outside-')));
  write(join(root, 'package.json'), JSON.stringify({ name: 'mono', private: true }));
  write(join(root, 'apps/web/vitest.config.ts'), 'export default { test: {} };\n');
  write(join(root, 'apps/web/src/x.test.ts'));
  write(join(root, 'apps/api/jest.config.js'), "module.exports = { testEnvironment: 'node' };\n");
  write(join(root, 'apps/api/src/api.test.js'));
  vi.stubEnv('AQE_PROJECT_ROOT', root);
  spawn.mockReset();
  runTestRunnerProcess.mockReset();
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('#1272 the runner a project is configured for', () => {
  it.each([
    ['a jest.config file', 'jest.config.ts', '', 'jest'],
    ['a jest key in package.json', 'package.json', JSON.stringify({ jest: { testEnvironment: 'node' } }), 'jest'],
    ['a vitest.config file', 'vitest.config.mts', '', 'vitest'],
    ['a vitest.workspace file', 'vitest.workspace.json', '[]', 'vitest'],
    ['a vite.config that configures test', 'vite.config.ts', "export default { test: { environment: 'jsdom' } };", 'vitest'],
    ['a vitest key in package.json', 'package.json', JSON.stringify({ vitest: {} }), 'vitest'],
  ])('reads %s', (_label, name, text, expected) => {
    write(join(root, 'pkg', name), text);
    expect(runnerFrameworkFor(join(root, 'pkg'), root)).toBe(expected);
  });

  it('is undefined when a project configures both runners, or neither', () => {
    write(join(root, 'both/jest.config.js'));
    write(join(root, 'both/vitest.config.ts'));
    expect(runnerFrameworkFor(join(root, 'both'), root)).toBeUndefined();
    write(join(root, 'deps/package.json'), JSON.stringify({ devDependencies: { jest: '*' }, scripts: { test: 'jest' } }));
    expect(runnerFrameworkFor(join(root, 'deps'), root)).toBeUndefined();
  });

  it('reads the project a subdirectory belongs to, never above the boundary', () => {
    expect(runnerFrameworkFor(join(root, 'apps/api/src'), root)).toBe('jest');
    write(join(root, 'jest.config.js'));
    expect(runnerFrameworkFor(join(root, 'tests'), join(root, 'tests'))).toBeUndefined();
  });
});

describe('#1272 TestExecutorService runs each project with its own runner', () => {
  type Spawn = (files: string[], framework: string, timeout: number, cwd?: string) => Promise<unknown>;

  function executorWithSpy() {
    const memory = { get: vi.fn(), set: vi.fn(), storeVector: vi.fn() };
    const executor = new TestExecutorService({ memory: memory as never }, { enableLLMAnalysis: false });
    const spawnRunner = vi.spyOn(executor as unknown as { spawnTestRunner: Spawn }, 'spawnTestRunner')
      .mockImplementation(async (files: string[]) => ok({
        total: files.length, passed: files.length, failed: 0, skipped: 0, failedTests: [],
      }));
    const calls = () => spawnRunner.mock.calls.map(call => ({ files: call[0], framework: call[1], cwd: call[3] }));
    return { executor, calls };
  }

  it('runs a Jest package with jest and a Vitest package with vitest in one run (the issue reproduction)', async () => {
    process.chdir(root);
    const { executor, calls } = executorWithSpy();
    const result = await executor.executeParallel({
      testFiles: ['apps/api/src/api.test.js', 'apps/web/src/x.test.ts'],
      framework: 'vitest', frameworkFromConfig: true, workers: 4,
    });
    expect(result.success && result.value).toMatchObject({ total: 2, passed: 2 });
    expect(calls()).toEqual(expect.arrayContaining([
      { files: ['apps/api/src/api.test.js'], framework: 'jest', cwd: join(root, 'apps/api') },
      { files: ['apps/web/src/x.test.ts'], framework: 'vitest', cwd: join(root, 'apps/web') },
    ]));
  });

  it('uses the project config from a server started inside the package, and in sequential runs', async () => {
    process.chdir(join(root, 'apps/api'));
    const { executor, calls } = executorWithSpy();
    await executor.execute({ testFiles: ['src/api.test.js'], framework: 'vitest', frameworkFromConfig: true });
    expect(calls()).toEqual([{ files: ['src/api.test.js'], framework: 'jest', cwd: join(root, 'apps/api') }]);
  });

  it('reads the config of an explicit projectRoot', async () => {
    process.chdir(root);
    const { executor, calls } = executorWithSpy();
    await executor.executeParallel({
      testFiles: [join(root, 'apps/api/src/api.test.js')], framework: 'vitest', frameworkFromConfig: true,
      workers: 1, projectRoot: join(root, 'apps/api'),
    });
    expect(calls()[0]).toMatchObject({ framework: 'jest', cwd: join(root, 'apps/api') });
  });

  it('keeps an explicit framework, and the fallback where no config names a runner', async () => {
    write(join(root, 'tests/root.test.ts'));
    process.chdir(root);
    const { executor, calls } = executorWithSpy();
    await executor.executeParallel({
      testFiles: ['apps/api/src/api.test.js'], framework: 'vitest', workers: 1,
    });
    await executor.executeParallel({
      testFiles: ['tests/root.test.ts'], framework: 'mocha', frameworkFromConfig: true, workers: 1,
    });
    expect(calls().map(call => call.framework)).toEqual(['vitest', 'mocha']);
  });
});

describe('#1272 the coordinator lets the config decide only without a framework', () => {
  async function runWith(framework: string | undefined) {
    const ctx = createCoordinatorTestContext();
    const coordinator = new TestExecutionCoordinator(ctx.eventBus, ctx.memory, {
      simulateForTesting: true, enablePrioritization: false, enableMinCutAwareness: false, enableConsensus: false,
    });
    try {
      const executor = (coordinator as unknown as { executor: TestExecutorService }).executor;
      const run = { runId: 'r', status: 'passed' as const, total: 1, passed: 1, failed: 0, skipped: 0, duration: 1, failedTests: [] };
      const execute = vi.spyOn(executor, 'execute').mockResolvedValue(ok(run));
      await coordinator.runTests({ testFiles: ['apps/api/src/api.test.js'], framework });
      return execute.mock.calls[0][0];
    } finally {
      await coordinator.dispose();
      resetTestContext(ctx);
    }
  }

  it('marks a run without a framework for config detection', async () => {
    expect(await runWith(undefined)).toMatchObject({ framework: 'vitest', frameworkFromConfig: true });
  });

  it('keeps an explicit framework', async () => {
    expect(await runWith('vitest')).toMatchObject({ framework: 'vitest', frameworkFromConfig: false });
  });
});

describe('#1272 the execute-tests handler runs a Jest project with jest', () => {
  function handler() {
    const handlers = new Map<string, (task: unknown) => Promise<{ success: boolean; value?: unknown; error?: Error }>>();
    registerTestExecutionHandlers({ registerHandler: (type: string, h: never) => { handlers.set(type, h); } } as never);
    return handlers.get('execute-tests')!;
  }

  it('starts jest, not vitest, in a Jest project', async () => {
    process.chdir(root);
    runTestRunnerProcess.mockResolvedValue({ status: 0, stdout: report('api.test.js'), stderr: '' });
    const result = await handler()({ payload: { testFiles: ['apps/api/src/api.test.js'] } });
    expect(result.success && result.value).toMatchObject({ total: 1, passed: 1 });
    expect(runTestRunnerProcess).toHaveBeenCalledTimes(1);
    expect(runTestRunnerProcess.mock.calls[0][1][0]).toBe('jest');
    expect(runTestRunnerProcess.mock.calls[0][2]).toMatchObject({ cwd: join(root, 'apps/api') });
  });

  it('still starts vitest first in a Vitest project', async () => {
    process.chdir(root);
    runTestRunnerProcess.mockResolvedValue({ status: 1, stdout: '', stderr: 'boom' });
    await handler()({ payload: { testFiles: ['apps/web/src/x.test.ts'] } });
    expect(runTestRunnerProcess.mock.calls[0][1].slice(0, 2)).toEqual(['vitest', 'run']);
  });
});

describe('#1272 the flaky detector runs each file from its runner project', () => {
  /** A child process that prints a passing report (to --outputFile for Vitest). */
  function fakeRunner() {
    spawn.mockImplementation((_command: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(),
      });
      setImmediate(() => {
        const outputFile = args.find(arg => arg.startsWith('--outputFile='))?.slice('--outputFile='.length);
        if (outputFile) writeFileSync(outputFile, report('x'));
        else child.stdout.emit('data', Buffer.from(report('x')));
        child.emit('close', 0);
      });
      return child;
    });
  }

  function detector(config = {}) {
    const memory = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn(), search: vi.fn().mockResolvedValue([]) };
    return new FlakyDetectorService(memory as never, { runTimeout: 10000, ...config });
  }

  const runOnce = (service: FlakyDetectorService, file: string) =>
    (service as unknown as { executeTestFile: (file: string, run: number) => Promise<unknown> }).executeTestFile(file, 0);

  it('runs a Vitest package file from that package', async () => {
    process.chdir(root);
    fakeRunner();
    await runOnce(detector(), 'apps/web/src/x.test.ts');
    const [command, args, options] = spawn.mock.calls[0];
    expect(options.cwd).toBe(join(root, 'apps/web'));
    expect([command, ...args.slice(0, 2)]).toEqual(['npx', 'vitest', 'run']);
    // The file argument stays absolute, so the different cwd cannot change it.
    expect(args).toContain(join(root, 'apps/web/src/x.test.ts'));
  });

  it('runs a Jest package file with jest from that package', async () => {
    process.chdir(root);
    fakeRunner();
    await runOnce(detector(), 'apps/api/src/api.test.js');
    const [command, args, options] = spawn.mock.calls[0];
    expect(options.cwd).toBe(join(root, 'apps/api'));
    expect([command, args[0]]).toEqual(['npx', 'jest']);
  });

  it('keeps a configured cwd and runner command', async () => {
    process.chdir(root);
    fakeRunner();
    await runOnce(detector({ cwd: root, testRunner: 'npx', testRunnerArgs: ['jest', '--json'] }), 'apps/web/src/x.test.ts');
    const [, args, options] = spawn.mock.calls[0];
    expect(options.cwd).toBe(root);
    expect(args[0]).toBe('jest');
  });
});

describe('#1272 aqe test execute --project-root', () => {
  /** Refusals must stop at the exit call, so the exit stub throws for a nonzero code. */
  function cli() {
    const runTests = vi.fn().mockResolvedValue({ success: true, value: { passed: 1, failed: 0, skipped: 0, duration: 1 } });
    const context = {
      kernel: { getDomainAPIAsync: vi.fn().mockResolvedValue({ runTests }), memory: { set: vi.fn().mockResolvedValue(undefined) } },
    } as unknown as CLIContext;
    const exit = vi.fn(async (code: number): Promise<never> => {
      if (code !== 0) throw Object.assign(new Error('exit'), { exitCode: code });
      return undefined as never;
    });
    const command = createTestCommand(context, exit, vi.fn().mockResolvedValue(true));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    return { command, runTests, exit, error };
  }

  beforeEach(() => { process.chdir(root); });

  it('runs the target from the given package and leaves the framework to its config', async () => {
    const { command, runTests } = cli();
    await command.parseAsync(['execute', 'src', '--project-root', 'apps/api'], { from: 'user' });
    expect(runTests).toHaveBeenCalledWith(expect.objectContaining({
      testFiles: [join(root, 'apps/api/src/api.test.js')],
      projectRoot: join(root, 'apps/api'),
      framework: undefined,
    }));
  });

  it('passes an explicit --framework through', async () => {
    const { command, runTests } = cli();
    await command.parseAsync(['execute', 'apps/api', '--framework', 'vitest'], { from: 'user' });
    expect(runTests.mock.calls[0][0]).toMatchObject({ framework: 'vitest' });
    expect(runTests.mock.calls[0][0]).not.toHaveProperty('projectRoot');
  });

  it.each([
    ['a parent traversal', '../'],
    ['an absolute path outside the project', '<outside>'],
    ['a symlink pointing out of the project', 'escape'],
    ['a file rather than a directory', 'package.json'],
  ])('refuses %s before any runner starts', async (_label, value) => {
    write(join(outside, 'src/o.test.ts'));
    symlinkSync(outside, join(root, 'escape'));
    const { command, runTests, error } = cli();
    await expect(command.parseAsync(['execute', 'src', '--project-root', value === '<outside>' ? outside : value], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1 });
    expect(runTests).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toMatch(/projectRoot/);
  });

  it('refuses a target that leaves a valid project root', async () => {
    write(join(outside, 'o.test.ts'));
    const { command, runTests } = cli();
    await expect(command.parseAsync(['execute', outside, '--project-root', 'apps/api'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1 });
    expect(runTests).not.toHaveBeenCalled();
  });

  it('uses the same check as MCP projectRoot', async () => {
    expect((await requireRunProjectRoot('test execute', 'apps/api')).success).toBe(true);
    expect((await requireRunProjectRoot('test execute', '../')).success).toBe(false);
  });
});
