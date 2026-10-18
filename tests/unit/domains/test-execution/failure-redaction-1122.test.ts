/**
 * #1122 — test failure text and runner diagnostics are returned over MCP and
 * saved under .agentic-qe/results/, so credential-shaped values are redacted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { redactFailedTests, testCasesFromRunnerReport } from '../../../../src/domains/test-execution/services/runner-test-cases.js';
import { registerTestExecutionHandlers } from '../../../../src/coordination/handlers/test-execution-handlers.js';
import { RetryHandlerService } from '../../../../src/domains/test-execution/services/retry-handler.js';
import { FlakyDetectorService } from '../../../../src/domains/test-execution/services/flaky-detector.js';
import { capDiagnostics, getTestRunnerExecutionError, TestRunnerExecutionError } from '../../../../src/shared/test-runner-verdict.js';
import type { InstanceTaskHandler, TaskHandlerContext } from '../../../../src/coordination/handlers/handler-types.js';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator.js';

const { spawn, spawnSync } = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn, spawnSync }));
vi.mock('child_process', () => ({ spawn, spawnSync }));

const SECRET_URL = 'postgres://user:pass@db.internal:5432/app';
const leaks = (value: unknown) => JSON.stringify(value).includes('user:pass');

describe('#1122 failure text redaction', () => {
  let fixture: string;
  let file: string;

  function runnerExits(body: string, code: number): void {
    spawn.mockImplementation((_command: string, args: string[]) => {
      const stream = () => Object.assign(new EventEmitter(), { setEncoding() { return this; } });
      const proc = Object.assign(new EventEmitter(), { stdout: stream(), stderr: stream(), kill: vi.fn(() => true) });
      queueMicrotask(() => {
        const argument = args.find(arg => arg.startsWith('--outputFile='));
        if (argument) writeFileSync(argument.slice('--outputFile='.length), body);
        proc.stdout.emit('data', body);
        proc.emit('exit', code, null);
        proc.emit('close', code, null);
      });
      return proc;
    });
  }

  function queenHandler(): InstanceTaskHandler {
    let handler!: InstanceTaskHandler;
    registerTestExecutionHandlers({ registerHandler(name, value) {
      if (name === 'execute-tests') handler = value;
    } } as TaskHandlerContext);
    return handler;
  }

  const failingReport = () => JSON.stringify({
    success: false, numTotalTests: 2, numPassedTests: 1, numFailedTests: 1,
    testResults: [{ name: file, status: 'failed', assertionResults: [
      { status: 'passed', fullName: 'db pings', duration: 1 },
      { status: 'failed', fullName: 'db connects', duration: 3,
        failureMessages: [`Error: connection refused for ${SECRET_URL}\n    at db.test.ts:5:11`] },
    ] }],
  });
  const suiteErrorReport = () => JSON.stringify({
    success: false, numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, numFailedTestSuites: 1,
    testResults: [{ name: file, status: 'failed', message: `cannot reach ${SECRET_URL}`, assertionResults: [] }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fixture = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1122-')));
    // #1126: the handler runs only test files inside the project root.
    vi.stubEnv('AQE_PROJECT_ROOT', fixture);
    file = join(fixture, 'db.test.ts');
    writeFileSync(file, '');
  });

  afterEach(() => { vi.unstubAllEnvs(); rmSync(fixture, { recursive: true, force: true }); });

  it('the executor redacts failedTests error/stack, testCases and the stored run record', async () => {
    runnerExits(failingReport(), 1);
    const set = vi.fn(async () => undefined);
    const executor = new TestExecutorService({ memory: { set, get: vi.fn(async () => undefined) } as never });

    const result = await executor.execute({ testFiles: [file], framework: 'vitest', timeout: 1000 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.failed).toBe(1);
    expect(result.value.failedTests[0].error).toContain('connection refused for <REDACTED:');
    expect(result.value.failedTests[0].stack).toContain('connection refused for <REDACTED:');
    expect(result.value.testCases?.find(c => c.status === 'failed')?.failureMessage)
      .toMatch(/^Error: connection refused for <REDACTED:[a-z_]+>\n {4}at db\.test\.ts:5:11$/);
    expect(leaks(result.value)).toBe(false);
    expect(leaks(set.mock.calls)).toBe(false);
  });

  it('the Queen execute-tests handler redacts reported test cases', async () => {
    runnerExits(failingReport(), 1);

    const result = await queenHandler()({ payload: { testFiles: [file] } } as QueenTask);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(leaks(result.value)).toBe(false);
    expect(JSON.stringify(result.value)).toContain('connection refused for <REDACTED:');
  });

  it.each([
    ['domain executor', async () => new TestExecutorService({ memory: { set: vi.fn(), get: vi.fn() } as never })
      .execute({ testFiles: [file], framework: 'vitest', timeout: 1000 })],
    ['Queen handler', async () => queenHandler()({ payload: { testFiles: [file] } } as QueenTask)],
  ])('the %s redacts runner-error diagnostics', async (_path, run) => {
    runnerExits(suiteErrorReport(), 1);

    const result = await run();

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeInstanceOf(TestRunnerExecutionError);
    expect(result.error.message).toContain('cannot reach <REDACTED:');
    expect(result.error.message).not.toContain('user:pass');
  });

  it('redacts before capping a long failure message, and keeps ordinary text intact', () => {
    const cases = testCasesFromRunnerReport({ testResults: [{ name: file, assertionResults: [
      { status: 'failed', fullName: 'long', failureMessages: [`${SECRET_URL} ${'x'.repeat(5000)}`] },
      { status: 'failed', fullName: 'plain', failureMessages: ['expected 1 to be 3'] },
    ] }] }, file)!;

    expect(cases[0].failureMessage).toMatch(/^<REDACTED:[a-z_]+> x+… \[truncated\]$/);
    expect(cases[1].failureMessage).toBe('expected 1 to be 3');
  });

  it('redactFailedTests leaves other fields and a missing stack alone', () => {
    const [redacted] = redactFailedTests([{ testId: 't', testName: 'n', file, error: `token=${'a'.repeat(12)} at ${SECRET_URL}`, duration: 2 }]);

    expect(redacted).toMatchObject({ testId: 't', testName: 'n', file, duration: 2 });
    expect(redacted).not.toHaveProperty('stack');
    expect(redacted.error).not.toContain('user:pass');
    expect(redacted.error).not.toContain('a'.repeat(12));
  });

  it('getTestRunnerExecutionError redacts the runner output it quotes', () => {
    const error = getTestRunnerExecutionError('jest', 'db.test.ts', 1, { passed: 0, failed: 0, skipped: 0 },
      `Authorization: Bearer abcdefghijklmnop\n${SECRET_URL}`);

    expect(error?.message).toContain('reported zero tests');
    expect(error?.message).not.toContain('abcdefghijklmnop');
    expect(error?.message).not.toContain('user:pass');
  });

  it('the retry handler stores a redacted error in retry-history for a test that still fails', async () => {
    // A top-level test, so the retry's name filter selects it.
    runnerExits(JSON.stringify({
      success: false, numTotalTests: 1, numPassedTests: 0, numFailedTests: 1,
      testResults: [{ name: file, status: 'failed', assertionResults: [
        { status: 'failed', fullName: 'connects', failureMessages: [`Error: retry refused ${SECRET_URL}`] },
      ] }],
    }), 1);
    const set = vi.fn(async () => undefined);
    const retry = new RetryHandlerService({ set, get: vi.fn(async () => undefined) } as never,
      { testRunner: 'vitest', cwd: fixture });

    const result = await retry.executeWithRetry({ runId: 'r1', maxRetries: 2, backoff: 'constant', baseDelay: 0,
      failedTests: [{ testId: 't1', testName: 'connects', file, error: `Error: first run ${SECRET_URL}`, duration: 1 }] });

    expect(result.success).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(2);
    const history = set.mock.calls.find(([key]) => key === 'retry-history:t1');
    expect(history).toBeDefined();
    expect((history![1] as Array<{ error?: string }>)[0].error).toContain('Error: retry refused <REDACTED:');
    expect(leaks(set.mock.calls)).toBe(false);
  });

  it('the flaky detector stores redacted failure text in test-history', async () => {
    const set = vi.fn(async () => undefined);
    const detector = new FlakyDetectorService({ set, get: vi.fn(async () => undefined) } as never);

    await detector.recordExecution('t1', { runId: 'r1', passed: false, duration: 1,
      error: `Error: ${SECRET_URL}`, timestamp: new Date(), context: { parallelRuns: 1, workerIndex: 0 } } as never);

    expect(set).toHaveBeenCalledWith('test-history:t1', expect.anything(), expect.anything());
    expect(leaks(set.mock.calls)).toBe(false);
  });

  it.each([3980, 3981, 3982])('redacts before cutting runner output when a secret straddles the 4000-character cut (offset %i)', offset => {
    const output = 'x'.repeat(offset) + SECRET_URL;

    const error = getTestRunnerExecutionError('vitest', 'a.test.ts', 1, { passed: 0, failed: 0, skipped: 0 }, output);

    // Cut first, the tail would be 'postgres://user:pas…' with no '@', which no pattern matches.
    expect(output.slice(0, 4000)).toMatch(/user:pa/);
    expect(error?.message).not.toContain('user:pa');
    expect(capDiagnostics(output)).not.toContain('user:pa');
    expect(capDiagnostics(output, 500)).toBe('x'.repeat(500));
  });

  it('the Queen handler redacts a runner start failure before cutting it', async () => {
    spawn.mockImplementation(() => {
      const stream = () => Object.assign(new EventEmitter(), { setEncoding() { return this; } });
      const proc = Object.assign(new EventEmitter(), { stdout: stream(), stderr: stream(), kill: vi.fn(() => true) });
      queueMicrotask(() => {
        proc.stderr.emit('data', 'y'.repeat(3963) + SECRET_URL);
        proc.emit('error', Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' }));
        proc.emit('close', null, null);
      });
      return proc;
    });

    const result = await queenHandler()({ payload: { testFiles: [file] } } as QueenTask);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toContain('could not complete');
    expect(result.error.message).not.toContain('user:pa');
  });
});
