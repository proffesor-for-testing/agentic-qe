import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
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
