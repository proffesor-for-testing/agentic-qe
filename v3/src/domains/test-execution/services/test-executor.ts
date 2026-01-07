/**
 * Agentic QE v3 - Test Executor Service
 * Implements ITestExecutionService for running test suites
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types';
import {
  ExecuteTestsRequest,
  ParallelExecutionRequest,
  TestRunResult,
  FailedTest,
  ExecutionStats,
} from '../interfaces';
import { MemoryBackend } from '../../../kernel/interfaces';

// ============================================================================
// Interfaces
// ============================================================================

export interface ITestExecutionService {
  /** Execute test suite */
  execute(request: ExecuteTestsRequest): Promise<Result<TestRunResult, Error>>;

  /** Execute tests in parallel */
  executeParallel(request: ParallelExecutionRequest): Promise<Result<TestRunResult, Error>>;

  /** Get execution results by run ID */
  getResults(runId: string): Promise<Result<TestRunResult, Error>>;

  /** Get execution statistics */
  getStats(runId: string): Promise<Result<ExecutionStats, Error>>;
}

// ============================================================================
// Test Executor Service
// ============================================================================

export class TestExecutorService implements ITestExecutionService {
  private readonly runResults = new Map<string, TestRunResult>();
  private readonly runStats = new Map<string, ExecutionStats>();

  constructor(private readonly memory: MemoryBackend) {}

  /**
   * Execute a test suite sequentially
   */
  async execute(request: ExecuteTestsRequest): Promise<Result<TestRunResult, Error>> {
    const runId = uuidv4();
    const startTime = new Date();

    try {
      // Validate request
      const validation = this.validateRequest(request);
      if (!validation.success) {
        return validation;
      }

      // Execute tests
      const results = await this.runTests(request);

      // Create run result
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      const runResult: TestRunResult = {
        runId,
        status: results.failed > 0 ? 'failed' : 'passed',
        total: results.total,
        passed: results.passed,
        failed: results.failed,
        skipped: results.skipped,
        duration,
        failedTests: results.failedTests,
        coverage: results.coverage,
      };

      // Store results
      this.runResults.set(runId, runResult);
      await this.storeResults(runId, runResult);

      // Create and store stats
      const stats: ExecutionStats = {
        runId,
        startTime,
        endTime,
        duration,
        testsPerSecond: results.total / (duration / 1000),
        workers: 1,
        memoryUsage: process.memoryUsage?.().heapUsed ?? 0,
      };
      this.runStats.set(runId, stats);

      return ok(runResult);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Execute tests in parallel across multiple workers
   */
  async executeParallel(request: ParallelExecutionRequest): Promise<Result<TestRunResult, Error>> {
    const runId = uuidv4();
    const startTime = new Date();

    try {
      // Validate request
      const validation = this.validateParallelRequest(request);
      if (!validation.success) {
        return validation;
      }

      const { workers, sharding = 'file', isolation = 'process' } = request;

      // Shard tests across workers
      const shards = this.shardTests(request.testFiles, workers, sharding);

      // Execute shards in parallel
      const shardResults = await Promise.all(
        shards.map((shard, index) =>
          this.executeWorker(shard, index, isolation, request)
        )
      );

      // Aggregate results
      const aggregated = this.aggregateResults(shardResults);

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      const runResult: TestRunResult = {
        runId,
        status: aggregated.failed > 0 ? 'failed' : 'passed',
        total: aggregated.total,
        passed: aggregated.passed,
        failed: aggregated.failed,
        skipped: aggregated.skipped,
        duration,
        failedTests: aggregated.failedTests,
        coverage: aggregated.coverage,
      };

      // Store results
      this.runResults.set(runId, runResult);
      await this.storeResults(runId, runResult);

      // Create and store stats
      const stats: ExecutionStats = {
        runId,
        startTime,
        endTime,
        duration,
        testsPerSecond: aggregated.total / (duration / 1000),
        workers,
        memoryUsage: process.memoryUsage?.().heapUsed ?? 0,
      };
      this.runStats.set(runId, stats);

      return ok(runResult);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get results for a specific run
   */
  async getResults(runId: string): Promise<Result<TestRunResult, Error>> {
    // Check in-memory cache first
    const cached = this.runResults.get(runId);
    if (cached) {
      return ok(cached);
    }

    // Check persistent storage
    try {
      const stored = await this.memory.get<TestRunResult>(`test-run:${runId}`);
      if (stored) {
        this.runResults.set(runId, stored);
        return ok(stored);
      }
    } catch {
      // Continue to error
    }

    return err(new Error(`Test run not found: ${runId}`));
  }

  /**
   * Get execution statistics for a run
   */
  async getStats(runId: string): Promise<Result<ExecutionStats, Error>> {
    const cached = this.runStats.get(runId);
    if (cached) {
      return ok(cached);
    }

    try {
      const stored = await this.memory.get<ExecutionStats>(`test-stats:${runId}`);
      if (stored) {
        this.runStats.set(runId, stored);
        return ok(stored);
      }
    } catch {
      // Continue to error
    }

    return err(new Error(`Test stats not found: ${runId}`));
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private validateRequest(request: ExecuteTestsRequest): Result<void, Error> {
    if (!request.testFiles || request.testFiles.length === 0) {
      return err(new Error('No test files specified'));
    }
    if (!request.framework) {
      return err(new Error('Framework not specified'));
    }
    return ok(undefined);
  }

  private validateParallelRequest(request: ParallelExecutionRequest): Result<void, Error> {
    const baseValidation = this.validateRequest(request);
    if (!baseValidation.success) {
      return baseValidation;
    }
    if (request.workers < 1) {
      return err(new Error('Workers must be at least 1'));
    }
    if (request.workers > 32) {
      return err(new Error('Workers cannot exceed 32'));
    }
    return ok(undefined);
  }

  private async runTests(request: ExecuteTestsRequest): Promise<TestExecutionResult> {
    const { testFiles, framework, timeout = 30000 } = request;

    const failedTests: FailedTest[] = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const file of testFiles) {
      const result = await this.executeTestFile(file, framework, timeout);
      passed += result.passed;
      failed += result.failed;
      skipped += result.skipped;
      failedTests.push(...result.failedTests);
    }

    return {
      total: passed + failed + skipped,
      passed,
      failed,
      skipped,
      failedTests,
      coverage: this.aggregateCoverage([]),
    };
  }

  private async executeTestFile(
    file: string,
    _framework: string,
    _timeout: number
  ): Promise<TestExecutionResult> {
    // In a real implementation, this would spawn a test runner process
    // For now, we simulate test execution
    const testCount = Math.floor(Math.random() * 10) + 1;
    const failCount = Math.random() > 0.8 ? 1 : 0;
    const skipCount = Math.random() > 0.9 ? 1 : 0;

    const failedTests: FailedTest[] = [];
    if (failCount > 0) {
      failedTests.push({
        testId: uuidv4(),
        testName: `test in ${file}`,
        file,
        error: 'Assertion failed',
        stack: `Error: Assertion failed\n    at ${file}:10:5`,
        duration: Math.random() * 1000,
      });
    }

    return {
      total: testCount,
      passed: testCount - failCount - skipCount,
      failed: failCount,
      skipped: skipCount,
      failedTests,
      coverage: undefined,
    };
  }

  private shardTests(
    testFiles: string[],
    workers: number,
    strategy: 'file' | 'test' | 'time-balanced'
  ): string[][] {
    const shards: string[][] = Array.from({ length: workers }, () => []);

    switch (strategy) {
      case 'file':
        // Simple round-robin distribution
        testFiles.forEach((file, index) => {
          shards[index % workers].push(file);
        });
        break;

      case 'test':
        // For test-level sharding, we'd need to parse test files
        // Fall back to file sharding for now
        testFiles.forEach((file, index) => {
          shards[index % workers].push(file);
        });
        break;

      case 'time-balanced':
        // Would need historical timing data
        // Fall back to file sharding for now
        testFiles.forEach((file, index) => {
          shards[index % workers].push(file);
        });
        break;
    }

    return shards;
  }

  private async executeWorker(
    files: string[],
    _workerIndex: number,
    _isolation: 'process' | 'worker' | 'none',
    request: ParallelExecutionRequest
  ): Promise<TestExecutionResult> {
    const results = await Promise.all(
      files.map(file =>
        this.executeTestFile(file, request.framework, request.timeout ?? 30000)
      )
    );

    return this.aggregateResults(results);
  }

  private aggregateResults(results: TestExecutionResult[]): TestExecutionResult {
    const aggregated: TestExecutionResult = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      failedTests: [],
      coverage: undefined,
    };

    for (const result of results) {
      aggregated.total += result.total;
      aggregated.passed += result.passed;
      aggregated.failed += result.failed;
      aggregated.skipped += result.skipped;
      aggregated.failedTests.push(...result.failedTests);
    }

    aggregated.coverage = this.aggregateCoverage(
      results.map(r => r.coverage).filter((c): c is NonNullable<typeof c> => c !== undefined)
    );

    return aggregated;
  }

  private aggregateCoverage(coverages: Array<{
    line: number;
    branch: number;
    function: number;
    statement: number;
  }>): { line: number; branch: number; function: number; statement: number } | undefined {
    if (coverages.length === 0) {
      return undefined;
    }

    const sum = coverages.reduce(
      (acc, cov) => ({
        line: acc.line + cov.line,
        branch: acc.branch + cov.branch,
        function: acc.function + cov.function,
        statement: acc.statement + cov.statement,
      }),
      { line: 0, branch: 0, function: 0, statement: 0 }
    );

    return {
      line: sum.line / coverages.length,
      branch: sum.branch / coverages.length,
      function: sum.function / coverages.length,
      statement: sum.statement / coverages.length,
    };
  }

  private async storeResults(runId: string, result: TestRunResult): Promise<void> {
    await this.memory.set(`test-run:${runId}`, result, {
      namespace: 'test-execution',
      persist: true,
    });
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface TestExecutionResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  failedTests: FailedTest[];
  coverage?: {
    line: number;
    branch: number;
    function: number;
    statement: number;
  };
}
