import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { registerTestExecutionHandlers } from '../../../../src/coordination/handlers/test-execution-handlers.js';
import type { InstanceTaskHandler, TaskHandlerContext } from '../../../../src/coordination/handlers/handler-types.js';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator.js';
import type { Result } from '../../../../src/shared/types/index.js';

const { spawn, spawnSync } = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn, spawnSync }));
vi.mock('child_process', () => ({ spawn, spawnSync }));

const validReport = JSON.stringify({ success: true, numTotalTests: 1, numPassedTests: 1,
  numFailedTests: 0, testResults: [{ status: 'passed', assertionResults: [{ status: 'passed' }] }] });

describe('Vitest report process boundaries', () => {
  let fixture: string;
  let file: string;
  let handler: InstanceTaskHandler;
  let reportPaths: string[];
  let run: (timeout?: number) => Promise<Result<unknown, Error>>;

  beforeEach(() => {
    vi.clearAllMocks();
    fixture = mkdtempSync(join(tmpdir(), 'aqe-report-boundary-'));
    file = join(fixture, 'sample.test.js');
    writeFileSync(file, '');
    reportPaths = [];
    const executor = new TestExecutorService({ memory: {} as never });
    run = (timeout = 1000) => (executor as unknown as {
      spawnTestRunner(files: string[], framework: string, timeout: number): Promise<Result<unknown, Error>>;
    }).spawnTestRunner([file], 'vitest', timeout);
    registerTestExecutionHandlers({ registerHandler(name, value) {
      if (name === 'execute-tests') handler = value;
    } } as TaskHandlerContext);
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const path of reportPaths) rmSync(dirname(path), { recursive: true, force: true });
    rmSync(fixture, { recursive: true, force: true });
  });

  function reportPath(args: string[]): string {
    const argument = args.find(arg => arg.startsWith('--outputFile='));
    expect(argument).toBeDefined();
    const path = argument!.slice('--outputFile='.length);
    reportPaths.push(path);
    return path;
  }

  function child() {
    return Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => true),
    });
  }

  it.each([
    { name: 'missing report despite passing stdout JSON', body: undefined, code: 0 },
    { name: 'malformed report despite passing stdout JSON', body: '{', code: 0 },
    { name: 'nonzero exit despite passing report', body: validReport, code: 1 },
    { name: 'signal termination despite passing report', body: validReport, code: null },
  ])('rejects $name on both paths and cleans the reports', async ({ body, code }) => {
    spawn.mockImplementation((_command, args) => {
      const path = reportPath(args);
      const proc = child();
      queueMicrotask(() => {
        if (body !== undefined) writeFileSync(path, body);
        proc.stdout.emit('data', Buffer.from(validReport));
        proc.emit('close', code);
      });
      return proc;
    });
    spawnSync.mockImplementation((_command, args) => {
      const path = reportPath(args);
      if (body !== undefined) writeFileSync(path, body);
      return { status: code, signal: code === null ? 'SIGTERM' : null, stdout: validReport, stderr: '' };
    });

    expect((await run()).success).toBe(false);
    const taskResult = await handler({ payload: { testFiles: [file] } } as QueenTask);
    expect(taskResult.success).toBe(false);
    if (!taskResult.success && code === null) expect(taskResult.error.message).toContain('SIGTERM');
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(new Set(reportPaths).size).toBe(2);
    expect(reportPaths.every(path => !existsSync(dirname(path)))).toBe(true);
  });

  it('retains a timeout and cleans only after the asynchronous child closes', async () => {
    vi.useFakeTimers();
    const proc = child();
    spawn.mockImplementation((_command, args) => { reportPath(args); return proc; });
    const resultPromise = run(20);
    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('timed out');
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(existsSync(dirname(reportPaths[0]))).toBe(true);
    proc.emit('close', null);
    expect(existsSync(dirname(reportPaths[0]))).toBe(false);
  });

  it.each(['throw', 'error-event'])('cleans the report after a spawn %s', async mode => {
    spawn.mockImplementation((_command, args) => {
      reportPath(args);
      if (mode === 'throw') throw new Error('spawn fixture failure');
      const proc = child();
      queueMicrotask(() => proc.emit('error', new Error('spawn fixture failure')));
      return proc;
    });
    expect((await run()).success).toBe(false);
    expect(existsSync(dirname(reportPaths[0]))).toBe(false);
  });

  it('preserves synchronous timeout diagnostics without retrying Jest', async () => {
    spawnSync.mockImplementation((_command, args) => {
      writeFileSync(reportPath(args), '{');
      return { status: null, signal: 'SIGTERM', error: new Error('ETIMEDOUT fixture'), stdout: '', stderr: '' };
    });
    const result = await handler({ payload: { testFiles: [file] } } as QueenTask);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('ETIMEDOUT fixture');
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(existsSync(dirname(reportPaths[0]))).toBe(false);
  });

  it('retains Jest fallback only for an unsuccessful Vitest run without a report', async () => {
    spawnSync.mockImplementation((_command, args) => {
      if (args[0] === 'vitest') {
        reportPath(args);
        return { status: 1, signal: null, stdout: '', stderr: 'Vitest unavailable' };
      }
      expect(args).toEqual(['jest', file, '--json']);
      return { status: 0, signal: null, stdout: validReport, stderr: '' };
    });
    expect((await handler({ payload: { testFiles: [file] } } as QueenTask)).success).toBe(true);
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(existsSync(dirname(reportPaths[0]))).toBe(false);
  });
});
