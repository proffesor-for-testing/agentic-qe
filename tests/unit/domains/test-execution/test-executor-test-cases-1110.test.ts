/**
 * #1110 — per-test results are carried from the runner's JSON report, on both
 * the domain executor path and the Queen `execute-tests` path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { registerTestExecutionHandlers } from '../../../../src/coordination/handlers/test-execution-handlers.js';
import type { InstanceTaskHandler, TaskHandlerContext } from '../../../../src/coordination/handlers/handler-types.js';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator.js';

const { spawn, spawnSync } = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn, spawnSync }));
vi.mock('child_process', () => ({ spawn, spawnSync }));

describe('#1110 runner-reported test cases', () => {
  let fixture: string;
  let file: string;

  const reportFor = (assertions: Array<Record<string, unknown>>) => JSON.stringify({
    success: false, numTotalTests: assertions.length,
    numPassedTests: assertions.filter(a => a.status === 'passed').length,
    numFailedTests: assertions.filter(a => a.status === 'failed').length,
    testResults: [{ name: file, status: 'failed', assertionResults: assertions }],
  });
  const assertions = () => [
    { status: 'passed', fullName: 'math adds', duration: 2 },
    { status: 'failed', fullName: 'math fails', duration: 4, failureMessages: ['expected 1 to be 3'] },
    { status: 'skipped', fullName: 'math later' },
  ];

  function writeReport(args: string[], body: string): void {
    const argument = args.find(arg => arg.startsWith('--outputFile='));
    if (argument) writeFileSync(argument.slice('--outputFile='.length), body);
  }

  // Both paths spawn the runner asynchronously (#1074).
  function runnerExits(body: string, code: number): void {
    spawn.mockImplementation((_command: string, args: string[]) => {
      const stream = () => Object.assign(new EventEmitter(), { setEncoding() { return this; } });
      const proc = Object.assign(new EventEmitter(), {
        stdout: stream(), stderr: stream(), kill: vi.fn(() => true),
      });
      queueMicrotask(() => {
        writeReport(args, body);
        proc.stdout.emit('data', body);
        proc.emit('exit', code, null);
        proc.emit('close', code, null);
      });
      return proc;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    fixture = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1110-')));
    // #1126: the handler runs only test files inside the project root.
    vi.stubEnv('AQE_PROJECT_ROOT', fixture);
    file = join(fixture, 'math.test.ts');
    writeFileSync(file, '');
  });

  afterEach(() => { vi.unstubAllEnvs(); rmSync(fixture, { recursive: true, force: true }); });

  it('the executor returns each reported test case and does not persist them with the run record', async () => {
    const body = reportFor(assertions());
    runnerExits(body, 1);
    const set = vi.fn(async () => undefined);
    const executor = new TestExecutorService({ memory: { set, get: vi.fn(async () => undefined) } as never });

    const result = await executor.execute({ testFiles: [file], framework: 'vitest', timeout: 1000 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toMatchObject({ total: 3, passed: 1, failed: 1, skipped: 1 });
    expect(result.value.testCases).toEqual([
      { name: 'math adds', file, status: 'passed', duration: 2 },
      { name: 'math fails', file, status: 'failed', duration: 4, failureMessage: 'expected 1 to be 3' },
      { name: 'math later', file, status: 'skipped' },
    ]);
    const runRecord = set.mock.calls.find(([key]) => String(key).startsWith('test-run:'));
    expect(runRecord).toBeDefined();
    expect(runRecord![1]).not.toHaveProperty('testCases');
  });

  it('the Queen execute-tests handler returns the reported test cases', async () => {
    const body = reportFor(assertions());
    runnerExits(body, 1);
    let handler!: InstanceTaskHandler;
    registerTestExecutionHandlers({ registerHandler(name, value) {
      if (name === 'execute-tests') handler = value;
    } } as TaskHandlerContext);

    const result = await handler({ payload: { testFiles: [file] } } as QueenTask);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect((result.value as { testCases?: unknown[] }).testCases).toHaveLength(3);
  });

  it('leaves test cases out when the report does not list every counted test', async () => {
    const body = JSON.stringify({ success: true, numTotalTests: 2, numPassedTests: 2, numFailedTests: 0,
      testResults: [{ name: file, status: 'passed', assertionResults: [{ status: 'passed', fullName: 'only one' }] }] });
    runnerExits(body, 0);
    let handler!: InstanceTaskHandler;
    registerTestExecutionHandlers({ registerHandler(name, value) {
      if (name === 'execute-tests') handler = value;
    } } as TaskHandlerContext);

    const result = await handler({ payload: { testFiles: [file] } } as QueenTask);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).not.toHaveProperty('testCases');
  });
});
