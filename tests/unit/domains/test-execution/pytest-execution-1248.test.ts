/**
 * #1248: Python test files run with pytest on every execution path (the test
 * executor behind CLI `aqe test execute` and MCP `test_execute_parallel`, the
 * execute-tests task handler, and retries), never with Vitest, and a pytest
 * run is a measured outcome.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const { spawn, runTestRunnerProcess } = vi.hoisted(() => ({ spawn: vi.fn(), runTestRunnerProcess: vi.fn() }));
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<object>(), spawn }));
vi.mock('child_process', async importOriginal => ({ ...await importOriginal<object>(), spawn }));
vi.mock('../../../../src/shared/test-runner-process.js', async importOriginal => ({
  ...await importOriginal<object>(), runTestRunnerProcess,
}));

import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { RetryHandlerService } from '../../../../src/domains/test-execution/services/retry-handler.js';
import { TestExecutionCoordinator } from '../../../../src/domains/test-execution/coordinator';
import { registerTestExecutionHandlers } from '../../../../src/coordination/handlers/test-execution-handlers';
import { groupByRunnerProject, isPytestProject, isPytestProjectDir } from '../../../../src/shared/test-runner-project.js';
import { measureToolOutcome } from '../../../../src/learning/usage-outcome.js';
import { createCoordinatorTestContext, resetTestContext } from '../coordinator-test-utils';
import { ok, type Result } from '../../../../src/shared/types';

/** One passing and one failing test in tests/test_calc.py, as pytest writes it. */
const CALC_REPORT = '<?xml version="1.0" encoding="utf-8"?><testsuites name="pytest tests"><testsuite name="pytest" errors="0" failures="1" skipped="0" tests="2">'
  + '<testcase classname="tests.test_calc" name="test_add_passes" time="0.001" />'
  + '<testcase classname="tests.test_calc" name="test_add_fails" time="0.002"><failure message="assert 4 == 5">E       assert 4 == 5</failure></testcase>'
  + '</testsuite></testsuites>';

let root: string;
const originalCwd = process.cwd();

function write(file: string, text = ''): string {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

function junitPath(args: readonly string[]): string {
  const arg = args.find(a => a.startsWith('--junitxml='));
  expect(arg).toBeDefined();
  return arg!.slice('--junitxml='.length);
}

function child() {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => true), pid: undefined,
  });
}

/** A spawn that writes `report` (when given) to the run's JUnit path and exits with `code`. */
function pytestSpawn(report: string | undefined, code: number, stderr = '') {
  spawn.mockImplementation((_command: string, args: string[]) => {
    const path = junitPath(args);
    const proc = child();
    queueMicrotask(() => {
      if (report !== undefined) writeFileSync(path, report);
      if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
      proc.emit('close', code);
    });
    return proc;
  });
}

/** Python package with pytest config under a Vitest monorepo root. */
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1248-')));
  write(join(root, 'package.json'), JSON.stringify({ name: 'mono', private: true }));
  write(join(root, 'vitest.config.ts'), 'export default { test: {} };\n');
  write(join(root, 'web/x.test.ts'));
  write(join(root, 'py/pyproject.toml'), '[project]\nname = "calc"\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n');
  write(join(root, 'py/tests/conftest.py'));
  write(join(root, 'py/tests/test_calc.py'));
  vi.stubEnv('AQE_PROJECT_ROOT', root);
  vi.stubEnv('AQE_PYTHON', 'python-under-test');
  spawn.mockReset();
  runTestRunnerProcess.mockReset();
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('#1248 pytest project detection', () => {
  it.each([
    ['pytest.ini', '[pytest]\n'],
    ['pytest.ini', ''],
    ['pyproject.toml', '[tool.pytest.ini_options]\naddopts = "-q"\n'],
    ['pyproject.toml', '[tool.pytest]\n'],
    ['setup.cfg', '[metadata]\nname = x\n\n[tool:pytest]\ntestpaths = tests\n'],
    ['tox.ini', '[tox]\nenvlist = py312\n\n[pytest]\naddopts = -q\n'],
  ])('reads %s with %j as pytest configuration', (name, text) => {
    const dir = join(root, 'pkg');
    write(join(dir, name), text);
    expect(isPytestProjectDir(dir)).toBe(true);
  });

  it.each([
    ['pyproject.toml', '[project]\nname = "x"\n'],
    ['setup.cfg', '[metadata]\nname = x\n'],
    ['tox.ini', '[tox]\nenvlist = py312\n'],
  ])('does not read %s without a pytest section as pytest configuration', (name, text) => {
    const dir = join(root, 'pkg');
    write(join(dir, name), text);
    expect(isPytestProjectDir(dir)).toBe(false);
  });

  it('counts a conftest.py for detection, walking up to the project root', () => {
    const dir = join(root, 'plain/tests/unit');
    write(join(root, 'plain/conftest.py'));
    mkdirSync(dir, { recursive: true });
    expect(isPytestProjectDir(join(root, 'plain'))).toBe(false);
    expect(isPytestProjectDir(join(root, 'plain'), true)).toBe(true);
    expect(isPytestProject(dir, root)).toBe(true);
    expect(isPytestProject(join(root, 'web'), root)).toBe(false);
  });

  it('runs Python files from their pytest project and keeps them apart from JavaScript files', () => {
    const files = ['web/x.test.ts', 'py/tests/test_calc.py'];
    expect(groupByRunnerProject(files, { cwd: root, boundary: root })).toEqual([
      { cwd: root, files: ['web/x.test.ts'] },
      // tests/conftest.py does not move the run into tests/ (the package root stays on sys.path).
      { cwd: join(root, 'py'), files: ['py/tests/test_calc.py'] },
    ]);
  });

  it('keeps JavaScript files of a directory with pytest config with their own runner project', () => {
    write(join(root, 'py/js/a.test.ts'));
    expect(groupByRunnerProject(['py/js/a.test.ts'], { cwd: root, boundary: root }))
      .toEqual([{ cwd: root, files: ['py/js/a.test.ts'] }]);
  });
});

describe('#1248 TestExecutorService runs Python files with pytest', () => {
  type SpawnRunner = (files: string[], framework: string, timeout: number, cwd?: string) => Promise<unknown>;

  function executorWithSpy() {
    const executor = new TestExecutorService({ memory: { get: vi.fn(), set: vi.fn() } as never }, { enableLLMAnalysis: false });
    const spawnRunner = vi.spyOn(executor as unknown as { spawnTestRunner: SpawnRunner }, 'spawnTestRunner')
      .mockImplementation(async (files: string[]) => ok({ total: files.length, passed: files.length, failed: 0, skipped: 0, failedTests: [] }));
    return { executor, calls: () => spawnRunner.mock.calls.map(call => ({ files: call[0], framework: call[1], cwd: call[3] })) };
  }

  it('sends .py files to pytest and the rest to the configured runner when no framework was given', async () => {
    process.chdir(root);
    const { executor, calls } = executorWithSpy();
    const result = await executor.executeParallel({
      testFiles: ['web/x.test.ts', 'py/tests/test_calc.py'], framework: 'vitest', frameworkFromConfig: true, workers: 1,
    });
    expect(result.success && result.value).toMatchObject({ total: 2, passed: 2 });
    expect(calls()).toEqual(expect.arrayContaining([
      { files: ['web/x.test.ts'], framework: 'vitest', cwd: root },
      { files: ['py/tests/test_calc.py'], framework: 'pytest', cwd: join(root, 'py') },
    ]));
  });

  it('splits Python files from the others under an explicit projectRoot', async () => {
    process.chdir(root);
    const { executor, calls } = executorWithSpy();
    await executor.execute({
      testFiles: [join(root, 'web/x.test.ts'), join(root, 'py/tests/test_calc.py')],
      framework: 'vitest', frameworkFromConfig: true, projectRoot: root,
    });
    expect(calls().map(call => call.framework).sort()).toEqual(['pytest', 'vitest']);
  });

  it('refuses to run .py files with an explicitly requested JavaScript runner', async () => {
    process.chdir(root);
    const { executor, calls } = executorWithSpy();
    const result = await executor.execute({ testFiles: ['py/tests/test_calc.py'], framework: 'vitest' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.message).toMatch(/Python test files cannot run with vitest/);
    expect(calls()).toEqual([]);
  });

  it('builds a python -m pytest command with a JUnit report and no coverage directory', () => {
    const executor = new TestExecutorService({ memory: {} as never });
    const command = (executor as unknown as {
      buildTestCommand(files: string[], framework: string): { command: string; args: string[]; report?: { path: string; cleanup(): void }; coverageDirectory?: string };
    }).buildTestCommand(['-dash/test_a.py'], 'pytest');
    try {
      expect(command.command).toBe('python-under-test');
      expect(command.args).toEqual(['-m', 'pytest', join(process.cwd(), '-dash/test_a.py'), `--junitxml=${command.report?.path}`, '--color=no']);
      expect(command.coverageDirectory).toBeUndefined();
    } finally {
      command.report?.cleanup();
    }
  });

  it('reports pytest counts and per-test results from the JUnit report, and removes the report', async () => {
    process.chdir(join(root, 'py'));
    pytestSpawn(CALC_REPORT, 1);
    const executor = new TestExecutorService({ memory: { get: vi.fn(), set: vi.fn() } as never }, { enableLLMAnalysis: false });
    const result = await executor.execute({ testFiles: ['tests/test_calc.py'], framework: 'pytest', frameworkFromConfig: true });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][0]).toBe('python-under-test');
    expect(spawn.mock.calls[0][1].slice(0, 3)).toEqual(['-m', 'pytest', join(root, 'py/tests/test_calc.py')]);
    // FORCE_COLOR (set for every runner) would make pytest colour its report.
    expect(spawn.mock.calls[0][2].env).toMatchObject({ PY_COLORS: '0' });
    expect(existsSync(dirname(junitPath(spawn.mock.calls[0][1])))).toBe(false);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toMatchObject({ status: 'failed', total: 2, passed: 1, failed: 1, skipped: 0 });
    expect(result.value.testCases).toEqual([
      { name: 'test_add_passes', file: 'tests/test_calc.py', status: 'passed', duration: 1 },
      { name: 'test_add_fails', file: 'tests/test_calc.py', status: 'failed', duration: 2, failureMessage: 'assert 4 == 5\nE       assert 4 == 5' },
    ]);
    expect(result.value.failedTests).toEqual([expect.objectContaining({ testName: 'test_add_fails', file: 'tests/test_calc.py' })]);

    // #1129: the run is a measured outcome, and a failing one.
    expect(measureToolOutcome('execute-tests', result.value)).toEqual({ measured: true, success: false, basis: 'test-results' });
  });

  it.each([
    ['pytest is not installed', undefined, 1, '/usr/bin/python3: No module named pytest', /not installed for 'python-under-test'/],
    ['no tests were collected', '<testsuite tests="0" />', 5, '', /collected no tests/],
    ['a module fails to import', '<testsuite><testcase classname="" name="tests.test_calc"><error message="collection failure">E   ImportError</error></testcase></testsuite>', 2, '', /interrupted[\s\S]*ImportError/],
    ['pytest hits an internal error', '<testsuite tests="0" />', 3, 'INTERNALERROR>', /internal error/],
    ['the report is malformed', 'not a report', 0, '', /malformed/],
  ])('fails the run, never a pass, when %s', async (_label, report, code, stderr, message) => {
    process.chdir(join(root, 'py'));
    pytestSpawn(report, code, stderr);
    const executor = new TestExecutorService({ memory: { get: vi.fn(), set: vi.fn() } as never }, { enableLLMAnalysis: false });
    const result = await executor.execute({ testFiles: ['tests/test_calc.py'], framework: 'pytest' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.message).toMatch(message);
  });
});

describe('#1248 a missing Python interpreter', () => {
  it('fails the run with the interpreter named', async () => {
    process.chdir(join(root, 'py'));
    spawn.mockImplementation(() => {
      const proc = child();
      queueMicrotask(() => proc.emit('error', Object.assign(new Error('spawn python-under-test ENOENT'), { code: 'ENOENT' })));
      return proc;
    });
    const executor = new TestExecutorService({ memory: { get: vi.fn(), set: vi.fn() } as never }, { enableLLMAnalysis: false });
    const result = await executor.execute({ testFiles: ['tests/test_calc.py'], framework: 'pytest' });
    // A spawn failure is reported as a failed file, never as a passing run.
    expect(result.success && result.value).toMatchObject({ status: 'failed', passed: 0, failed: 1 });
    expect(result.success && result.value.failedTests[0].error).toMatch(/Is 'python-under-test' installed\?/);
  });
});

describe('#1248 the coordinator picks pytest for Python files', () => {
  it('detects pytest when every file is a Python file, and keeps config detection on', async () => {
    const ctx = createCoordinatorTestContext();
    const coordinator = new TestExecutionCoordinator(ctx.eventBus, ctx.memory, {
      simulateForTesting: true, enablePrioritization: false, enableMinCutAwareness: false, enableConsensus: false,
    });
    try {
      const executor = (coordinator as unknown as { executor: TestExecutorService }).executor;
      const run = { runId: 'r', status: 'passed' as const, total: 1, passed: 1, failed: 0, skipped: 0, duration: 1, failedTests: [] };
      const execute = vi.spyOn(executor, 'execute').mockResolvedValue(ok(run));
      await coordinator.runTests({ testFiles: ['py/tests/test_calc.py'] });
      expect(execute.mock.calls[0][0]).toMatchObject({ framework: 'pytest', frameworkFromConfig: true });
    } finally {
      await coordinator.dispose();
      resetTestContext(ctx);
    }
  });
});

describe('#1248 the execute-tests handler runs Python files with pytest', () => {
  function handler() {
    const handlers = new Map<string, (task: unknown) => Promise<Result<unknown, Error>>>();
    registerTestExecutionHandlers({ registerHandler: (type: string, h: never) => { handlers.set(type, h); } } as never);
    return handlers.get('execute-tests')!;
  }

  it('starts pytest from the pytest project and returns its counts', async () => {
    process.chdir(root);
    runTestRunnerProcess.mockImplementation(async (_command: string, args: string[]) => {
      writeFileSync(junitPath(args), CALC_REPORT);
      return { status: 1, signal: null, stdout: '1 failed, 1 passed', stderr: '' };
    });
    const result = await handler()({ payload: { testFiles: ['py/tests/test_calc.py'] } });
    expect(result.success && result.value).toMatchObject({ total: 2, passed: 1, failed: 1, skipped: 0 });
    expect(runTestRunnerProcess).toHaveBeenCalledTimes(1);
    expect(runTestRunnerProcess.mock.calls[0][0]).toBe('python-under-test');
    expect(runTestRunnerProcess.mock.calls[0][1].slice(0, 2)).toEqual(['-m', 'pytest']);
    expect(runTestRunnerProcess.mock.calls[0][2]).toMatchObject({ cwd: join(root, 'py'), env: { PY_COLORS: '0' } });
  });

  it('reports a missing pytest as a runner error', async () => {
    process.chdir(root);
    runTestRunnerProcess.mockResolvedValue({ status: 1, signal: null, stdout: '', stderr: 'No module named pytest' });
    const result = await handler()({ payload: { testFiles: ['py/tests/test_calc.py'] } });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.message).toMatch(/pytest is not installed/);
  });
});

describe('#1248 retries rerun one pytest test by node id', () => {
  type Internals = {
    buildTestCommand(runner: string, file: string, name?: string, cwd?: string): { command: string; args: string[]; report?: { path: string; cleanup(): void } };
    parsePytestRetry(code: number | null, report: string | undefined, output: string): { passed: boolean; error?: string; unmatched?: boolean };
  };
  const internals = () => new RetryHandlerService({} as never, { simulateForTesting: false }) as unknown as Internals;

  it('selects the failed test as <file>::<name>', () => {
    const command = internals().buildTestCommand('pytest', 'tests/test_calc.py', 'TestCls::test_p[2]', root);
    try {
      expect(command.command).toBe('python-under-test');
      expect(command.args).toEqual(['-m', 'pytest', `${join(root, 'tests/test_calc.py')}::TestCls::test_p[2]`, `--junitxml=${command.report?.path}`, '--color=no']);
    } finally {
      command.report?.cleanup();
    }
  });

  it('passes only on a passing report, and treats an unknown node id as matching nothing', () => {
    const handler = internals();
    const pass = '<testsuite><testcase classname="tests.test_calc" name="test_add_fails"/></testsuite>';
    const fail = '<testsuite><testcase classname="tests.test_calc" name="test_add_fails"><failure message="assert 4 == 5">E</failure></testcase></testsuite>';
    expect(handler.parsePytestRetry(0, pass, '')).toEqual({ passed: true });
    expect(handler.parsePytestRetry(1, fail, '')).toEqual({ passed: false, error: 'assert 4 == 5\nE' });
    expect(handler.parsePytestRetry(4, undefined, 'ERROR: not found')).toMatchObject({ unmatched: true });
    expect(handler.parsePytestRetry(1, undefined, 'No module named pytest')).toEqual({ passed: false, error: 'No module named pytest' });
  });
});
