/**
 * Real Test Executor
 *
 * Executes tests using actual Jest/Vitest via child_process.spawn.
 * This replaces the fake "setTimeout + random pass/fail" mock
 * with real test execution.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { Logger } from '../../utils/Logger.js';

const logger = Logger.getInstance();

export interface TestExecutionResult {
  testFile: string;
  passed: boolean;
  failed: number;
  total: number;
  duration: number;
  error?: string;
  output?: string;
  workerIndex: number;
}

export interface BatchExecutionResult {
  results: TestExecutionResult[];
  totalDuration: number;
  passed: number;
  failed: number;
}

export interface ExecutorConfig {
  /** Test runner command (default: 'npx') */
  command: string;
  /** Test runner args (default: ['jest']) */
  runnerArgs: string[];
  /** Timeout per test file in ms (default: 30000) */
  timeout: number;
  /** Working directory */
  cwd: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Whether to collect coverage */
  collectCoverage: boolean;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  command: 'npx',
  runnerArgs: ['jest', '--json', '--testLocationInResults'],
  timeout: 30000,
  cwd: process.cwd(),
  collectCoverage: false,
};

/**
 * Executes real tests using Jest via child_process
 */
export class RealTestExecutor {
  private config: ExecutorConfig;
  private runningProcesses: Map<string, ChildProcess> = new Map();

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a single test file
   */
  public async executeTest(
    testFile: string,
    workerIndex: number = 0
  ): Promise<TestExecutionResult> {
    const startTime = performance.now();
    const absolutePath = path.resolve(testFile);

    return new Promise((resolve) => {
      const args = [
        ...this.config.runnerArgs,
        absolutePath,
        '--forceExit',
        '--runInBand',
        '--no-coverage',
        this.config.collectCoverage ? '--coverage' : '',
      ].filter(Boolean);

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn(this.config.command, args, {
        cwd: this.config.cwd,
        env: {
          ...process.env,
          ...this.config.env,
          NODE_OPTIONS: '--max-old-space-size=512',
          FORCE_COLOR: '0', // Disable colors for JSON parsing
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.runningProcesses.set(testFile, proc);

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 1000);
      }, this.config.timeout);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);
        this.runningProcesses.delete(testFile);

        const duration = performance.now() - startTime;

        if (timedOut) {
          resolve({
            testFile,
            passed: false,
            failed: 1,
            total: 1,
            duration,
            error: `Test timed out after ${this.config.timeout}ms`,
            workerIndex,
          });
          return;
        }

        // Try to parse Jest JSON output
        const result = this.parseJestOutput(stdout, testFile, workerIndex, duration);
        if (result) {
          resolve(result);
          return;
        }

        // Fallback: use exit code
        resolve({
          testFile,
          passed: code === 0,
          failed: code === 0 ? 0 : 1,
          total: 1,
          duration,
          error: code !== 0 ? stderr || 'Test failed' : undefined,
          output: stdout,
          workerIndex,
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutHandle);
        this.runningProcesses.delete(testFile);

        resolve({
          testFile,
          passed: false,
          failed: 1,
          total: 1,
          duration: performance.now() - startTime,
          error: error.message,
          workerIndex,
        });
      });
    });
  }

  /**
   * Execute a batch of test files sequentially on a single worker
   */
  public async executeBatch(
    testFiles: string[],
    workerIndex: number = 0
  ): Promise<BatchExecutionResult> {
    const startTime = performance.now();
    const results: TestExecutionResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const testFile of testFiles) {
      const result = await this.executeTest(testFile, workerIndex);
      results.push(result);

      if (result.passed) {
        passed++;
      } else {
        failed++;
      }

      logger.debug(`Worker ${workerIndex}: ${testFile} - ${result.passed ? 'PASS' : 'FAIL'} (${result.duration.toFixed(0)}ms)`);
    }

    return {
      results,
      totalDuration: performance.now() - startTime,
      passed,
      failed,
    };
  }

  /**
   * Execute multiple batches in parallel (one per worker)
   */
  public async executeParallel(
    batches: string[][],
    onProgress?: (workerIndex: number, result: TestExecutionResult) => void
  ): Promise<BatchExecutionResult[]> {
    const batchPromises = batches.map((batch, workerIndex) =>
      this.executeBatchWithProgress(batch, workerIndex, onProgress)
    );

    return Promise.all(batchPromises);
  }

  /**
   * Execute batch with progress callback
   */
  private async executeBatchWithProgress(
    testFiles: string[],
    workerIndex: number,
    onProgress?: (workerIndex: number, result: TestExecutionResult) => void
  ): Promise<BatchExecutionResult> {
    const startTime = performance.now();
    const results: TestExecutionResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const testFile of testFiles) {
      const result = await this.executeTest(testFile, workerIndex);
      results.push(result);

      if (result.passed) {
        passed++;
      } else {
        failed++;
      }

      if (onProgress) {
        onProgress(workerIndex, result);
      }
    }

    return {
      results,
      totalDuration: performance.now() - startTime,
      passed,
      failed,
    };
  }

  /**
   * Parse Jest JSON output to extract test results
   */
  private parseJestOutput(
    output: string,
    testFile: string,
    workerIndex: number,
    duration: number
  ): TestExecutionResult | null {
    try {
      // Jest outputs JSON on a single line, find it
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.startsWith('{') && line.includes('"numTotalTests"')) {
          const json = JSON.parse(line);

          return {
            testFile,
            passed: json.numFailedTests === 0,
            failed: json.numFailedTests || 0,
            total: json.numTotalTests || 1,
            duration: json.testResults?.[0]?.endTime
              ? json.testResults[0].endTime - json.testResults[0].startTime
              : duration,
            workerIndex,
          };
        }
      }
    } catch {
      // JSON parsing failed, fall through
    }

    return null;
  }

  /**
   * Kill all running test processes
   */
  public killAll(): void {
    for (const [testFile, proc] of this.runningProcesses) {
      logger.warn(`Killing running test: ${testFile}`);
      proc.kill('SIGTERM');
    }
    this.runningProcesses.clear();
  }

  /**
   * Get number of currently running tests
   */
  public getRunningCount(): number {
    return this.runningProcesses.size;
  }
}

/**
 * Aggregate results from multiple batch executions
 */
export function aggregateBatchResults(batches: BatchExecutionResult[]): {
  allResults: TestExecutionResult[];
  totalDuration: number;
  maxWorkerDuration: number;
  passed: number;
  failed: number;
  total: number;
  parallelSpeedup: number;
} {
  const allResults = batches.flatMap(b => b.results);
  const totalDuration = allResults.reduce((sum, r) => sum + r.duration, 0);
  const maxWorkerDuration = Math.max(...batches.map(b => b.totalDuration));
  const passed = batches.reduce((sum, b) => sum + b.passed, 0);
  const failed = batches.reduce((sum, b) => sum + b.failed, 0);

  return {
    allResults,
    totalDuration,
    maxWorkerDuration,
    passed,
    failed,
    total: passed + failed,
    parallelSpeedup: maxWorkerDuration > 0 ? totalDuration / maxWorkerDuration : 1,
  };
}
