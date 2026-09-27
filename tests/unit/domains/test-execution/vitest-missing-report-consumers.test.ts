import { EventEmitter } from 'node:events';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVitestJsonReport } from '../../../../src/shared/vitest-json-report.js';
import { RetryHandlerService } from '../../../../src/domains/test-execution/services/retry-handler.js';
import { FlakyDetectorService } from '../../../../src/domains/test-execution/services/flaky-detector.js';
import { VitestPhaseExecutor } from '../../../../src/test-scheduling/executors/vitest-executor.js';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));
vi.mock('child_process', () => ({ spawn }));

function successfulChild() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => true),
  });
  queueMicrotask(() => child.emit('close', 0));
  return child;
}

function testReport(failed = false) {
  return {
    success: !failed,
    numTotalTestSuites: 1,
    numPassedTestSuites: failed ? 0 : 1,
    numFailedTestSuites: failed ? 1 : 0,
    numTotalTests: 1,
    numPassedTests: failed ? 0 : 1,
    numFailedTests: failed ? 1 : 0,
    numPendingTests: 0,
    startTime: Date.now(),
    testResults: [{
      name: 'sample.test.ts', status: failed ? 'failed' : 'passed',
      assertionResults: [{
        ancestorTitles: [], fullName: 'sample', title: 'sample',
        status: failed ? 'failed' : 'passed', duration: 1,
        failureMessages: failed ? ['assertion failed'] : [],
      }],
    }],
  };
}

function reportedChild(exitCode: number) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => true),
  });
  queueMicrotask(() => child.emit('close', exitCode));
  return child;
}

describe('missing owned Vitest report cannot become a successful result', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a retry run even when its process exits zero', async () => {
    spawn.mockImplementation(() => successfulChild());
    const report = createVitestJsonReport();
    const service = new RetryHandlerService({} as never);
    const run = (service as unknown as {
      spawnTestProcess(command: string, args: string[], cwd: string, report: typeof report): Promise<unknown>;
    }).spawnTestProcess('npx', ['vitest', 'run', ...report.args], process.cwd(), report);
    await expect(run).rejects.toThrow(/report/i);
    expect(existsSync(dirname(report.path))).toBe(false);
  });

  it('rejects a flaky-detection run instead of fabricating a passing test', async () => {
    let reportPath = '';
    spawn.mockImplementation((_command, args: string[]) => {
      reportPath = args.find(arg => arg.startsWith('--outputFile='))!.slice('--outputFile='.length);
      return successfulChild();
    });
    const service = new FlakyDetectorService({} as never, {
      testRunner: 'vitest', testRunnerArgs: ['run', '--reporter=json'],
    });
    const run = (service as unknown as {
      executeTestFile(file: string, runIndex: number): Promise<unknown>;
    }).executeTestFile('sample.test.ts', 0);
    await expect(run).rejects.toThrow(/report/i);
    expect(existsSync(dirname(reportPath))).toBe(false);
  });

  it('rejects a scheduling run instead of deriving success from exit code zero', async () => {
    const service = new VitestPhaseExecutor();
    let reportPath = '';
    (service as unknown as {
      runCommand(command: string, args: string[], timeout: number): Promise<unknown>;
    }).runCommand = vi.fn(async (_command, args) => {
      reportPath = args.find(arg => arg.startsWith('--outputFile='))!.slice('--outputFile='.length);
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    const run = (service as unknown as {
      runVitest(args: string[], timeout: number): Promise<unknown>;
    }).runVitest([], 1000);
    await expect(run).rejects.toThrow(/report/i);
    expect(existsSync(dirname(reportPath))).toBe(false);
  });
});

describe('runner exit status remains authoritative after a valid report', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not classify a retry as passed when the report says passed but the runner exits one', () => {
    const service = new RetryHandlerService({} as never);
    const parse = (service as unknown as {
      parseTestResult(code: number, report: string, stderr: string): { passed: boolean; error?: string };
    }).parseTestResult.bind(service);
    expect(parse(1, JSON.stringify(testReport()), 'post-run crash').passed).toBe(false);
    expect(parse(0, JSON.stringify(testReport()), '').passed).toBe(true);
    expect(parse(1, JSON.stringify(testReport(true)), '').passed).toBe(false);
    expect(parse(0, JSON.stringify(testReport(true)), '').passed).toBe(false);
    expect(parse(1, JSON.stringify({ success: true, numFailedTests: 0 }), 'jest crash').passed).toBe(false);
    expect(parse(1, JSON.stringify({ stats: { failures: 0 }, failures: [] }), 'mocha crash').passed).toBe(false);
  });

  it('rejects a crashed flaky-detection run but accepts an ordinary failed assertion', async () => {
    for (const failed of [false, true]) {
      spawn.mockImplementation((_command, args: string[]) => {
        const reportPath = args.find(arg => arg.startsWith('--outputFile='))!.slice('--outputFile='.length);
        writeFileSync(reportPath, JSON.stringify(testReport(failed)));
        return reportedChild(1);
      });
      const service = new FlakyDetectorService({} as never, {
        testRunner: 'vitest', testRunnerArgs: ['run', '--reporter=json'],
      });
      const run = (service as unknown as {
        executeTestFile(file: string, runIndex: number): Promise<Map<string, Array<{ passed: boolean }>>>;
      }).executeTestFile('sample.test.ts', 0);
      if (failed) {
        const results = await run;
        expect([...results.values()][0][0].passed).toBe(false);
      } else {
        await expect(run).rejects.toThrow(/exit code 1/i);
      }
    }
  });

  it('rejects a crashed phase but retains assertion failures for threshold evaluation', async () => {
    for (const failed of [false, true]) {
      const service = new VitestPhaseExecutor();
      (service as unknown as {
        runCommand(command: string, args: string[], timeout: number): Promise<unknown>;
      }).runCommand = vi.fn(async (_command, args) => {
        const reportPath = args.find(arg => arg.startsWith('--outputFile='))!.slice('--outputFile='.length);
        writeFileSync(reportPath, JSON.stringify(testReport(failed)));
        return { stdout: '', stderr: 'post-run crash', exitCode: 1 };
      });
      const run = (service as unknown as {
        runVitest(args: string[], timeout: number): Promise<{ numFailedTests: number }>;
      }).runVitest([], 1000);
      if (failed) {
        await expect(run).resolves.toMatchObject({ numFailedTests: 1 });
      } else {
        await expect(run).rejects.toThrow(/exit code 1/i);
      }
    }
  });
});
