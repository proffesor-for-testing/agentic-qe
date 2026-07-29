import { describe, expect, it } from 'vitest';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { RetryHandlerService } from '../../../../src/domains/test-execution/services/retry-handler.js';

describe('TestExecutorService runner command', () => {
  it('runs Vitest without per-file coverage thresholds contaminating test results', () => {
    const executor = new TestExecutorService({ memory: {} as never });
    const command = (
      executor as unknown as {
        buildTestCommand(file: string, framework: string): { command: string; args: string[] };
      }
    ).buildTestCommand('tests/unit/example.test.ts', 'vitest');

    expect(command).toEqual({
      command: 'npx',
      args: [
        'vitest',
        'run',
        'tests/unit/example.test.ts',
        '--reporter=json',
        '--no-color',
      ],
    });
    expect(command.args).not.toContain('--coverage');
  });

  it('runs each worker shard as one bounded runner batch', async () => {
    const executor = new TestExecutorService({ memory: {} as never });
    const internals = executor as unknown as {
      executeTestFiles(files: string[]): Promise<{
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        failedTests: [];
      }>;
      executeWorker(
        files: string[],
        workerIndex: number,
        isolation: 'process',
        request: { framework: string; timeout: number },
      ): Promise<unknown>;
    };
    const batches: string[][] = [];
    internals.executeTestFiles = async files => {
      batches.push(files);
      return { total: 3, passed: 3, failed: 0, skipped: 0, failedTests: [] };
    };

    await internals.executeWorker(
      ['one.test.ts', 'two.test.ts', 'three.test.ts'],
      0,
      'process',
      { framework: 'vitest', timeout: 1000 },
    );

    expect(batches).toEqual([['one.test.ts', 'two.test.ts', 'three.test.ts']]);
  });

  it('uses one outer process for Vitest because Vitest owns internal parallelism', async () => {
    const executor = new TestExecutorService({
      memory: { set: async () => undefined } as never,
    });
    const internals = executor as unknown as {
      executeWorker(files: string[]): Promise<{
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        failedTests: [];
      }>;
    };
    const batches: string[][] = [];
    internals.executeWorker = async files => {
      batches.push(files);
      return { total: files.length, passed: files.length, failed: 0, skipped: 0, failedTests: [] };
    };

    await executor.executeParallel({
      testFiles: ['one.test.ts', 'two.test.ts', 'three.test.ts'],
      framework: 'vitest',
      workers: 3,
    });

    expect(batches).toEqual([['one.test.ts', 'two.test.ts', 'three.test.ts']]);
  });
});

describe('RetryHandlerService runner command', () => {
  it('does not treat a file-level failure path as a Vitest test-name filter', () => {
    const retryHandler = new RetryHandlerService({} as never);
    const command = (
      retryHandler as unknown as {
        buildTestCommand(
          runner: 'vitest',
          file: string,
          testName?: string,
        ): { command: string; args: string[] };
      }
    ).buildTestCommand(
      'vitest',
      'tests/unit/example.test.ts',
      'tests/unit/example.test.ts',
    );

    expect(command.args).toEqual([
      'vitest',
      'run',
      '--reporter=json',
      'tests/unit/example.test.ts',
    ]);
  });
});
