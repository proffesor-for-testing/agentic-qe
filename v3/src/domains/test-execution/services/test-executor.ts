/**
 * Agentic QE v3 - Test Executor Service
 * Implements ITestExecutionService for running test suites
 */

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
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
import type { HybridRouter, ChatResponse } from '../../../shared/llm';
import { TEST_EXECUTION_CONSTANTS, LLM_ANALYSIS_CONSTANTS } from '../../constants.js';
import { toErrorMessage, toError } from '../../../shared/error-utils.js';
import { safeJsonParse } from '../../../shared/safe-json.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the test executor service
 */
export interface TestExecutorConfig {
  /**
   * When true, simulates test execution with random outcomes (for unit testing).
   * When false (default), returns deterministic results or structured errors
   * indicating no real test runner is available.
   */
  simulateForTesting: boolean;
  /**
   * Base number of tests to report per file in simulation mode.
   * Defaults to 5.
   */
  simulatedTestsPerFile: number;
  /**
   * Simulated failure rate (0-1) when simulateForTesting is true.
   * Defaults to 0.2 (20% chance of failure per file).
   */
  simulatedFailureRate: number;
  /**
   * Simulated skip rate (0-1) when simulateForTesting is true.
   * Defaults to 0.1 (10% chance of skip per file).
   */
  simulatedSkipRate: number;
  /** ADR-051: Enable LLM-powered failure analysis */
  enableLLMAnalysis: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier: number;
  /** ADR-051: Max tokens for LLM responses */
  llmMaxTokens: number;
}

const DEFAULT_CONFIG: TestExecutorConfig = {
  simulateForTesting: false,
  simulatedTestsPerFile: 5,
  simulatedFailureRate: 0.2,
  simulatedSkipRate: 0.1,
  enableLLMAnalysis: true, // On by default - opt-out (ADR-051)
  llmModelTier: 2, // Sonnet for balanced analysis
  llmMaxTokens: LLM_ANALYSIS_CONSTANTS.MAX_TOKENS,
};

// ============================================================================
// Interfaces
// ============================================================================

export interface TestExecutorDependencies {
  memory: MemoryBackend;
  llmRouter?: HybridRouter;
}

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
  private readonly config: TestExecutorConfig;
  private readonly memory: MemoryBackend;
  private readonly llmRouter?: HybridRouter;

  /** Maximum number of results to retain in memory */
  private readonly MAX_RESULTS = TEST_EXECUTION_CONSTANTS.MAX_RESULTS;
  /** Retention period for old results (24 hours) */
  private readonly RESULT_RETENTION_MS = TEST_EXECUTION_CONSTANTS.RESULT_RETENTION_MS;

  constructor(
    dependencies: TestExecutorDependencies,
    config: Partial<TestExecutorConfig> = {}
  ) {
    this.memory = dependencies.memory;
    this.llmRouter = dependencies.llmRouter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a test suite sequentially
   */
  async execute(request: ExecuteTestsRequest): Promise<Result<TestRunResult, Error>> {
    const runId = uuidv4();
    const startTime = new Date();

    try {
      // Validate request
      const validation = this.validateRequest(request);
      if (validation.success === false) {
        return err(validation.error);
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
      return err(toError(error));
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
      if (validation.success === false) {
        return err(validation.error);
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
      return err(toError(error));
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
  // Cleanup Methods
  // ============================================================================

  /**
   * Clean up old test results based on retention policy and size limits.
   * @returns Number of entries cleaned up
   */
  cleanupOldResults(): number {
    const now = Date.now();
    let cleaned = 0;

    // Remove results older than retention period
    for (const [runId, result] of this.runResults) {
      const resultTime = result.duration ? now - result.duration : now;
      if (now - resultTime > this.RESULT_RETENTION_MS) {
        this.runResults.delete(runId);
        this.runStats.delete(runId);
        cleaned++;
      }
    }

    // Enforce maximum size limit by removing oldest entries
    if (this.runResults.size > this.MAX_RESULTS) {
      const excess = this.runResults.size - this.MAX_RESULTS;
      const entries = Array.from(this.runResults.entries());

      for (let i = 0; i < excess && i < entries.length; i++) {
        this.runResults.delete(entries[i][0]);
        this.runStats.delete(entries[i][0]);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Dispose of all resources held by this service.
   * Call this when the service is no longer needed.
   */
  destroy(): void {
    this.runResults.clear();
    this.runStats.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * ADR-051: Check if LLM analysis is available
   */
  private isLLMAnalysisAvailable(): boolean {
    return this.config.enableLLMAnalysis && this.llmRouter !== undefined;
  }

  /**
   * ADR-051: Get model name for tier
   */
  private getModelForTier(tier: number): string {
    const models: Record<number, string> = {
      1: 'claude-3-haiku-20240307',
      2: 'claude-sonnet-4-20250514',
      3: 'claude-sonnet-4-20250514',
      4: 'claude-opus-4-20250514',
    };
    return models[tier] || models[2];
  }

  /**
   * ADR-051: LLM-powered test failure analysis
   */
  private async analyzeFailuresWithLLM(failures: FailedTest[]): Promise<string | null> {
    if (!this.isLLMAnalysisAvailable() || failures.length === 0) return null;

    try {
      const failureSummary = failures.slice(0, 5).map(f =>
        `- ${f.testName}: ${f.error?.substring(0, 200) || 'Unknown error'}`
      ).join('\n');

      const response = await this.llmRouter!.chat({
        model: this.getModelForTier(this.config.llmModelTier),
        messages: [{
          role: 'user',
          content: `Analyze these test failures and provide insights:
${failureSummary}

Provide:
1. Common failure patterns
2. Potential root causes
3. Recommended fixes`
        }],
        maxTokens: this.config.llmMaxTokens,
      });
      return response.content;
    } catch (error) {
      console.warn('[TestExecutorService] LLM analysis failed:', error);
      return null;
    }
  }

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
    framework: string,
    timeout: number
  ): Promise<TestExecutionResult> {
    // In simulation mode (for unit testing), use random behavior
    if (this.config.simulateForTesting) {
      return this.simulateTestExecution(file);
    }

    // Production mode: spawn actual test runner process
    const result = await this.spawnTestRunner(file, framework, timeout);
    if (result.success === false) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Spawn actual test runner process (vitest, jest, mocha)
   */
  private async spawnTestRunner(
    file: string,
    framework: string,
    timeout: number
  ): Promise<Result<TestExecutionResult, Error>> {
    // Verify test file exists
    if (!existsSync(file)) {
      return err(new Error(`Test file not found: ${file}`));
    }

    // Build command based on framework
    const { command, args } = this.buildTestCommand(file, framework);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Spawn the test runner process
      // Note: shell: false (default) to prevent command injection (CWE-78)
      // Arguments are passed as array to avoid shell interpretation
      const proc: ChildProcess = spawn(command, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FORCE_COLOR: '0', // Disable color codes for easier parsing
          CI: 'true', // Enable CI mode for consistent output
        },
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        resolve(err(new Error(`Test execution timed out after ${timeout}ms for file: ${file}`)));
      }, timeout);

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        clearTimeout(timeoutId);

        if (killed) {
          return; // Already handled by timeout
        }

        // Parse results based on framework
        const parseResult = this.parseTestOutput(stdout, stderr, file, framework, code);
        resolve(parseResult);
      });

      proc.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        resolve(err(new Error(`Failed to spawn test runner: ${error.message}. Is '${command}' installed?`)));
      });
    });
  }

  /**
   * Build test command based on framework
   */
  private buildTestCommand(file: string, framework: string): { command: string; args: string[] } {
    switch (framework.toLowerCase()) {
      case 'vitest':
        return {
          command: 'npx',
          args: ['vitest', 'run', file, '--reporter=json', '--no-color'],
        };
      case 'jest':
        return {
          command: 'npx',
          args: ['jest', file, '--json', '--no-colors', '--testLocationInResults'],
        };
      case 'mocha':
        return {
          command: 'npx',
          args: ['mocha', file, '--reporter=json'],
        };
      default:
        // Default to vitest
        return {
          command: 'npx',
          args: ['vitest', 'run', file, '--reporter=json', '--no-color'],
        };
    }
  }

  /**
   * Parse test runner output to extract results
   */
  private parseTestOutput(
    stdout: string,
    stderr: string,
    file: string,
    framework: string,
    exitCode: number | null
  ): Result<TestExecutionResult, Error> {
    try {
      switch (framework.toLowerCase()) {
        case 'vitest':
          return this.parseVitestOutput(stdout, stderr, file, exitCode);
        case 'jest':
          return this.parseJestOutput(stdout, stderr, file, exitCode);
        case 'mocha':
          return this.parseMochaOutput(stdout, stderr, file, exitCode);
        default:
          return this.parseVitestOutput(stdout, stderr, file, exitCode);
      }
    } catch (error) {
      return err(new Error(
        `Failed to parse test output for ${file}: ${toErrorMessage(error)}\n` +
        `stdout: ${stdout.slice(0, 500)}\nstderr: ${stderr.slice(0, 500)}`
      ));
    }
  }

  /**
   * Parse vitest JSON output
   */
  private parseVitestOutput(
    stdout: string,
    stderr: string,
    file: string,
    exitCode: number | null
  ): Result<TestExecutionResult, Error> {
    // Try to extract JSON from output
    const jsonMatch = stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const json = safeJsonParse(jsonMatch[0]);
        const testResults = json.testResults || [];

        let passed = 0;
        let failed = 0;
        let skipped = 0;
        const failedTests: FailedTest[] = [];

        for (const result of testResults) {
          for (const assertion of result.assertionResults || []) {
            if (assertion.status === 'passed') {
              passed++;
            } else if (assertion.status === 'failed') {
              failed++;
              failedTests.push({
                testId: uuidv4(),
                testName: assertion.fullName || assertion.title || 'Unknown test',
                file: result.name || file,
                error: assertion.failureMessages?.join('\n') || 'Test failed',
                stack: assertion.failureMessages?.join('\n') || '',
                duration: assertion.duration || 0,
              });
            } else if (assertion.status === 'skipped' || assertion.status === 'pending') {
              skipped++;
            }
          }
        }

        return ok({
          total: passed + failed + skipped,
          passed,
          failed,
          skipped,
          failedTests,
          coverage: undefined,
        });
      } catch {
        // JSON parse failed, fall through to line parsing
      }
    }

    // Fallback: parse summary line from vitest output
    // Example: "Tests  5 passed | 1 failed | 1 skipped (7)"
    return this.parseTestSummaryLine(stdout, stderr, file, exitCode);
  }

  /**
   * Parse jest JSON output
   */
  private parseJestOutput(
    stdout: string,
    stderr: string,
    file: string,
    exitCode: number | null
  ): Result<TestExecutionResult, Error> {
    try {
      // Jest outputs JSON to stdout when --json flag is used
      const json = safeJsonParse(stdout);

      let passed = 0;
      let failed = 0;
      let skipped = 0;
      const failedTests: FailedTest[] = [];

      for (const result of json.testResults || []) {
        for (const assertion of result.assertionResults || []) {
          if (assertion.status === 'passed') {
            passed++;
          } else if (assertion.status === 'failed') {
            failed++;
            failedTests.push({
              testId: uuidv4(),
              testName: assertion.fullName || assertion.title || 'Unknown test',
              file: result.name || file,
              error: assertion.failureMessages?.join('\n') || 'Test failed',
              stack: assertion.failureMessages?.join('\n') || '',
              duration: assertion.duration || 0,
            });
          } else if (assertion.status === 'skipped' || assertion.status === 'pending') {
            skipped++;
          }
        }
      }

      return ok({
        total: passed + failed + skipped,
        passed,
        failed,
        skipped,
        failedTests,
        coverage: undefined,
      });
    } catch {
      return this.parseTestSummaryLine(stdout, stderr, file, exitCode);
    }
  }

  /**
   * Parse mocha JSON output
   */
  private parseMochaOutput(
    stdout: string,
    stderr: string,
    file: string,
    exitCode: number | null
  ): Result<TestExecutionResult, Error> {
    try {
      const json = safeJsonParse(stdout);

      const passed = json.stats?.passes || 0;
      const failed = json.stats?.failures || 0;
      const skipped = json.stats?.pending || 0;
      const failedTests: FailedTest[] = [];

      for (const failure of json.failures || []) {
        failedTests.push({
          testId: uuidv4(),
          testName: failure.fullTitle || failure.title || 'Unknown test',
          file: failure.file || file,
          error: failure.err?.message || 'Test failed',
          stack: failure.err?.stack || '',
          duration: failure.duration || 0,
        });
      }

      return ok({
        total: passed + failed + skipped,
        passed,
        failed,
        skipped,
        failedTests,
        coverage: undefined,
      });
    } catch {
      return this.parseTestSummaryLine(stdout, stderr, file, exitCode);
    }
  }

  /**
   * Fallback: parse test summary line from text output
   */
  private parseTestSummaryLine(
    stdout: string,
    stderr: string,
    file: string,
    exitCode: number | null
  ): Result<TestExecutionResult, Error> {
    // Look for common patterns in test output
    // Vitest: "Tests  5 passed | 1 failed | 1 skipped (7)"
    // Jest: "Tests:       1 failed, 5 passed, 6 total"

    const combinedOutput = stdout + '\n' + stderr;

    // Vitest pattern
    const vitestMatch = combinedOutput.match(/Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?(?:\s*\|\s*(\d+)\s+skipped)?/i);
    if (vitestMatch) {
      const passed = parseInt(vitestMatch[1], 10) || 0;
      const failed = parseInt(vitestMatch[2], 10) || 0;
      const skipped = parseInt(vitestMatch[3], 10) || 0;

      return ok({
        total: passed + failed + skipped,
        passed,
        failed,
        skipped,
        failedTests: failed > 0 ? this.createGenericFailures(file, failed, combinedOutput) : [],
        coverage: undefined,
      });
    }

    // Jest pattern
    const jestMatch = combinedOutput.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(?:(\d+)\s+skipped,\s+)?(\d+)\s+passed,\s+(\d+)\s+total/i);
    if (jestMatch) {
      const failed = parseInt(jestMatch[1], 10) || 0;
      const skipped = parseInt(jestMatch[2], 10) || 0;
      const passed = parseInt(jestMatch[3], 10) || 0;

      return ok({
        total: passed + failed + skipped,
        passed,
        failed,
        skipped,
        failedTests: failed > 0 ? this.createGenericFailures(file, failed, combinedOutput) : [],
        coverage: undefined,
      });
    }

    // Check for common error indicators
    if (exitCode !== 0) {
      const errorMessages = [
        'Cannot find module',
        'SyntaxError',
        'Error:',
        'FAIL',
        'failed',
      ];

      for (const indicator of errorMessages) {
        if (combinedOutput.includes(indicator)) {
          return err(new Error(
            `Test execution failed for ${file} (exit code ${exitCode}):\n${combinedOutput.slice(0, 1000)}`
          ));
        }
      }
    }

    // If we got here with exit code 0 but no parseable output,
    // it might mean the file had no tests or an unsupported format
    if (exitCode === 0) {
      // Check if output indicates no tests
      if (combinedOutput.includes('No test') || combinedOutput.includes('0 tests')) {
        return err(new Error(`No tests found in file: ${file}`));
      }
    }

    // Could not parse output - return error with details
    return err(new Error(
      `Unable to parse test results for ${file}. Exit code: ${exitCode}\n` +
      `Output: ${combinedOutput.slice(0, 500)}`
    ));
  }

  /**
   * Create generic failure entries when we know tests failed but can't parse details
   */
  private createGenericFailures(file: string, count: number, output: string): FailedTest[] {
    const failures: FailedTest[] = [];

    // Try to extract failure details from output
    const failurePattern = /FAIL\s+(.+?)(?:\n|$)|AssertionError[:\s]+(.+?)(?:\n|$)|Error[:\s]+(.+?)(?:\n|$)/gi;
    const matches = Array.from(output.matchAll(failurePattern));

    for (const match of matches) {
      if (failures.length >= count) break;
      failures.push({
        testId: uuidv4(),
        testName: match[1] || match[2] || match[3] || `Test #${failures.length + 1}`,
        file,
        error: match[0].trim(),
        stack: '',
        duration: 0,
      });
    }

    // Fill remaining with generic entries
    while (failures.length < count) {
      failures.push({
        testId: uuidv4(),
        testName: `Failed test #${failures.length + 1}`,
        file,
        error: 'Test failed (details not available)',
        stack: '',
        duration: 0,
      });
    }

    return failures;
  }

  /**
   * Simulate test execution with random outcomes (for unit testing only)
   */
  private simulateTestExecution(file: string): TestExecutionResult {
    const testCount = Math.floor(Math.random() * 10) + 1;
    const failCount = Math.random() > (1 - this.config.simulatedFailureRate) ? 1 : 0;
    const skipCount = Math.random() > (1 - this.config.simulatedSkipRate) ? 1 : 0;

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
// Factory
// ============================================================================

/**
 * Create a TestExecutorService instance
 */
export function createTestExecutorService(
  dependencies: TestExecutorDependencies,
  config?: Partial<TestExecutorConfig>
): TestExecutorService {
  return new TestExecutorService(dependencies, config);
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
