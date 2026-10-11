import { describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { RetryHandlerService } from '../../../../src/domains/test-execution/services/retry-handler.js';

describe('TestExecutorService runner command', () => {
  it('runs Vitest without per-file coverage thresholds contaminating test results', () => {
    const executor = new TestExecutorService({ memory: {} as never });
    const command = (
      executor as unknown as {
        buildTestCommand(file: string, framework: string): {
          command: string;
          args: string[];
          report?: { path: string; cleanup(): void };
          coverageDirectory?: string;
        };
      }
    ).buildTestCommand('tests/unit/example.test.ts', 'vitest');

    try {
      expect(command.command).toBe('npx');
      expect(command.args).toEqual([
        'vitest',
        'run',
        // #909: absolute, so a path that starts with '-' cannot be read as a flag.
        resolve('tests/unit/example.test.ts'),
        '--reporter=json',
        '--no-color',
        // Vitest 5 writes the JSON report to a file, not stdout (#700).
        `--outputFile=${command.report?.path}`,
        `--coverage.reportsDirectory=${command.coverageDirectory}`,
      ]);
      expect(command.args).not.toContain('--coverage');
    } finally {
      command.report?.cleanup();
      if ('coverageDirectory' in command && command.coverageDirectory) rmSync(command.coverageDirectory, { recursive: true, force: true });
    }
  });

  it('isolates Jest coverage output without turning coverage on', () => {
    const executor = new TestExecutorService({ memory: {} as never });
    const internals = executor as unknown as {
      buildTestCommand(files: string[], framework: string): { args: string[]; coverageDirectory: string };
    };
    const command = internals.buildTestCommand(['example.test.ts'], 'jest');
    try {
      expect(command.args).toContain(`--coverageDirectory=${command.coverageDirectory}`);
      expect(command.args).not.toContain('--coverage');
      expect(command.args).toContain('--json');
    } finally {
      rmSync(command.coverageDirectory, { recursive: true, force: true });
    }
  });

  it('passes a Node worker shard to one native test-runner process', () => {
    const executor = new TestExecutorService({ memory: {} as never });
    const command = (
      executor as unknown as {
        buildTestCommand(files: string[], framework: string): { command: string; args: string[] };
      }
    ).buildTestCommand(['one.test.cjs', 'two.test.cjs'], 'node');

    expect(command).toEqual({
      command: process.execPath,
      args: ['--test', resolve('one.test.cjs'), resolve('two.test.cjs')],
    });
  });

  // #909: a file name that starts with '-' or holds regex metacharacters must
  // select exactly that file and never be parsed as a runner flag.
  it.each(['vitest', 'jest', 'mocha', 'node'])('never passes %s a file argument that starts with "-"', framework => {
    const executor = new TestExecutorService({ memory: {} as never });
    const command = (executor as unknown as {
      buildTestCommand(files: string[], framework: string): {
        args: string[]; report?: { cleanup(): void }; coverageDirectory?: string;
      };
    }).buildTestCommand(['-dash.test.ts'], framework);
    try {
      const fileArg = command.args.find(arg => arg.includes('dash'));
      expect(fileArg).toBeDefined();
      expect(fileArg!.startsWith('-')).toBe(false);
    } finally {
      command.report?.cleanup();
      if (command.coverageDirectory) rmSync(command.coverageDirectory, { recursive: true, force: true });
    }
  });

  it('passes Jest an escaped, anchored pattern per file', () => {
    const executor = new TestExecutorService({ memory: {} as never });
    const command = (executor as unknown as {
      buildTestCommand(files: string[], framework: string): { args: string[]; coverageDirectory: string };
    }).buildTestCommand(['app/route[id](group)+v1.test.ts'], 'jest');
    try {
      const pattern = new RegExp(command.args[1]);
      expect(pattern.test(resolve('app/route[id](group)+v1.test.ts'))).toBe(true);
      expect(pattern.test(resolve('app/routeigroupv1xtest.ts'))).toBe(false);
      expect(pattern.test(resolve('app/route[id](group)+v1.test.tsx'))).toBe(false);
    } finally {
      rmSync(command.coverageDirectory, { recursive: true, force: true });
    }
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
        ): { command: string; args: string[]; report?: { path: string; cleanup(): void } };
      }
    ).buildTestCommand(
      'vitest',
      'tests/unit/example.test.ts',
      'tests/unit/example.test.ts',
    );

    try {
      expect(command.args).toEqual([
        'vitest',
        'run',
        '--reporter=json',
        resolve('tests/unit/example.test.ts'),
        `--outputFile=${command.report?.path}`,
      ]);
      expect(command.args).not.toContain('-t');
    } finally {
      command.report?.cleanup();
    }
  });
});
