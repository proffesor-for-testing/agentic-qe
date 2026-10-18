/**
 * Agentic QE v3 - Test Executor Service
 * Implements ITestExecutionService for running test suites
 */

import { LoggerFactory } from '../../../logging/index.js';
import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types';
import {
  ExecuteTestsRequest,
  ParallelExecutionRequest,
  TestRunResult,
  FailedTest,
  ITestCaseResult as TestCase,
  ExecutionStats,
} from '../interfaces';
import { MemoryBackend } from '../../../kernel/interfaces';
import type { HybridRouter } from '../../../shared/llm';
import { TEST_EXECUTION_CONSTANTS, LLM_ANALYSIS_CONSTANTS } from '../../constants.js';
import { toErrorMessage, toError } from '../../../shared/error-utils.js';
import { safeJsonParse } from '../../../shared/safe-json.js';
import { secureRandom, secureRandomInt } from '../../../shared/utils/crypto-random.js';
import { writeTestRunEvidence } from '../../quality-assessment/quality-evidence.js';
import { istanbulLineHits } from '../../../coordination/handlers/handler-utils.js';
import { fileCoverageKey } from '../../coverage-analysis/collected-metrics.js';
import { mergeTestCases, redactFailedTests, redactFailureText, testCasesFromRunnerReport } from './runner-test-cases.js';
import { capDiagnostics, getTestRunnerExecutionError, TestRunnerExecutionError } from '../../../shared/test-runner-verdict.js';
import { createVitestJsonReport, type VitestJsonReport } from '../../../shared/vitest-json-report.js';
import { jestExactPathPattern, runnerFilePath } from '../../../shared/test-runner-args.js';
import { getClaudeModelForTier } from '../../../shared/llm/model-registry.js';
import { terminateTestRunner, trackTestRunnerExit } from '../../../shared/test-runner-process.js';

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

const logger = LoggerFactory.create('test-execution/test-executor');

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
        failedTests: redactFailedTests(results.failedTests),
        ...(results.testCases ? { testCases: results.testCases } : {}),
        coverage: results.coverage,
        fileCoverages: results.fileCoverages,
      };

      // Store results
      this.runResults.set(runId, runResult);
      await this.storeResults(runId, runResult, request.testFiles);

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
      const runnerOwnsParallelism = ['vitest', 'jest'].includes(request.framework.toLowerCase());
      const processWorkers = runnerOwnsParallelism ? 1 : workers;

      // Shard tests across workers
      const shards = this.shardTests(request.testFiles, processWorkers, sharding);

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
        failedTests: redactFailedTests(aggregated.failedTests),
        ...(aggregated.testCases ? { testCases: aggregated.testCases } : {}),
        coverage: aggregated.coverage,
        fileCoverages: aggregated.fileCoverages,
      };

      // Store results
      this.runResults.set(runId, runResult);
      await this.storeResults(runId, runResult, request.testFiles);

      // Create and store stats
      const stats: ExecutionStats = {
        runId,
        startTime,
        endTime,
        duration,
        testsPerSecond: aggregated.total / (duration / 1000),
        workers: processWorkers,
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
    return getClaudeModelForTier(tier);
  }

  /**
   * ADR-051: LLM-powered test failure analysis
   */
  private async analyzeFailuresWithLLM(failures: FailedTest[]): Promise<string | null> {
    if (!this.isLLMAnalysisAvailable() || failures.length === 0) return null;

    try {
      const failureSummary = failures.slice(0, 5).map(f =>
        `- ${f.testName}: ${f.error ? redactFailureText(f.error).substring(0, 200) : 'Unknown error'}`
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
    } catch {
      logger.warn('LLM analysis failed:');
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
    const coverages: CoverageFigures[] = [];
    const allFileCoverages: FileCoverageFigures[] = [];
    const executionResults: TestExecutionResult[] = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const file of testFiles) {
      const result = await this.executeTestFile(file, framework, timeout);
      executionResults.push(result);
      passed += result.passed;
      failed += result.failed;
      skipped += result.skipped;
      failedTests.push(...result.failedTests);
      if (result.coverage) {
        coverages.push(result.coverage);
      }
      if (result.fileCoverages) {
        allFileCoverages.push(...result.fileCoverages);
      }
    }

    // Separate runner invocations each have their own coverage map. Averaging
    // percentages double-counts source files and misses disjoint hits (#1030).
    // If any run lacks raw counters, there is no honest combined measurement.
    const merged = testFiles.length > 1 && !this.config.simulateForTesting
      ? this.mergeSequentialCoverage(executionResults)
      : undefined;
    const separateRuns = testFiles.length > 1 && !this.config.simulateForTesting;
    const testCases = mergeTestCases(executionResults);
    return {
      total: passed + failed + skipped,
      passed,
      failed,
      skipped,
      failedTests,
      ...(testCases ? { testCases } : {}),
      coverage: separateRuns ? merged?.summary : this.aggregateCoverage(coverages),
      fileCoverages: separateRuns ? merged?.perFile
        : allFileCoverages.length > 0 ? allFileCoverages : undefined,
    };
  }

  private mergeSequentialCoverage(results: TestExecutionResult[]): {
    summary: CoverageFigures;
    perFile: FileCoverageFigures[];
  } | undefined {
    if (results.some(result => !result.rawCoverageMap)) return undefined;
    const merged: Record<string, Record<string, unknown>> = {};
    for (const result of results) {
      for (const [rawPath, entry] of Object.entries(result.rawCoverageMap!)) {
        if (!isRecord(entry) || !isRecord(entry.statementMap) || !isRecord(entry.fnMap)
          || !isRecord(entry.branchMap) || !isRecord(entry.s) || !isRecord(entry.f)
          || !isRecord(entry.b)) return undefined;
        const file = fileCoverageKey(rawPath);
        const prior = merged[file];
        if (prior) {
          if (!isDeepStrictEqual(prior.statementMap, entry.statementMap)
            || !isDeepStrictEqual(prior.fnMap, entry.fnMap)
            || !isDeepStrictEqual(prior.branchMap, entry.branchMap)) return undefined;
          for (const counter of ['s', 'f', 'b'] as const) {
            const hits = mergeHitCounts(prior[counter], entry[counter]);
            if (!hits) return undefined;
            prior[counter] = hits;
          }
        } else {
          const s = mergeHitCounts(entry.s, entry.s);
          const f = mergeHitCounts(entry.f, entry.f);
          const b = mergeHitCounts(entry.b, entry.b);
          if (!s || !f || !b) return undefined;
          merged[file] = { ...entry, path: file, s, f, b };
        }
      }
    }
    const coverage = this.extractCoverageFromJson({ coverageMap: merged });
    return coverage.summary ? { summary: coverage.summary, perFile: coverage.perFile } : undefined;
  }

  private async executeTestFile(
    file: string,
    framework: string,
    timeout: number
  ): Promise<TestExecutionResult> {
    return this.executeTestFiles([file], framework, timeout);
  }

  private async executeTestFiles(
    files: string[],
    framework: string,
    timeout: number
  ): Promise<TestExecutionResult> {
    // In simulation mode (for unit testing), use random behavior
    if (this.config.simulateForTesting) {
      return this.aggregateResults(files.map(file => this.simulateTestExecution(file)));
    }

    // Production mode: spawn actual test runner process
    const result = await this.spawnTestRunner(files, framework, timeout);
    if (result.success === false) {
      // Runner/suite errors have no trustworthy assertion receipt to aggregate.
      if (result.error instanceof TestRunnerExecutionError) throw result.error;
      // Return as a failed test rather than throwing — allows other files to still run
      return {
        total: files.length,
        passed: 0,
        failed: files.length,
        skipped: 0,
        failedTests: files.map(file => ({
          testId: file,
          testName: file,
          file,
          error: result.error.message,
          duration: 0,
        })),
        coverage: this.aggregateCoverage([]),
      };
    }
    return result.value;
  }

  /**
   * Spawn actual test runner process (vitest, jest, mocha)
   */
  private async spawnTestRunner(
    files: string[],
    framework: string,
    timeout: number
  ): Promise<Result<TestExecutionResult, Error>> {
    // Verify test file exists
    const missingFile = files.find(file => !existsSync(file));
    if (missingFile) {
      return err(new Error(`Test file not found: ${missingFile}`));
    }

    // Build command based on framework
    const { command, args, report, coverageDirectory } = this.buildTestCommand(files, framework);
    const fileLabel = files.join(', ');

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;
      let termination: Promise<void> | undefined;
      let settled = false;
      const cleanupArtifacts = (): void => {
        report?.cleanup();
        if (coverageDirectory) {
          try { rmSync(coverageDirectory, { recursive: true, force: true }); } catch { /* Best effort. */ }
        }
      };
      const finish = (result: Result<TestExecutionResult, Error>, cleanup = true): void => {
        if (settled) return;
        settled = true;
        if (cleanup) cleanupArtifacts();
        resolve(result);
      };

      // Spawn the test runner process
      // Note: shell: false (default) to prevent command injection (CWE-78)
      // Arguments are passed as array to avoid shell interpretation
      let proc: ChildProcess;
      try {
        proc = spawn(command, args, {
          cwd: process.cwd(),
          detached: process.platform !== 'win32',
          env: {
            ...process.env,
            FORCE_COLOR: '0', // Disable color codes for easier parsing
            CI: 'true', // Enable CI mode for consistent output
          },
        });
      } catch (error) {
        finish(err(new Error(`Failed to spawn test runner: ${toErrorMessage(error)}. Is '${command}' installed?`)));
        return;
      }

      const untrackExit = trackTestRunnerExit(proc);

      // Set timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        termination = terminateTestRunner(proc);
        // Keep the timeout outcome immediate; cleanup waits for the owned
        // group, rather than treating the root's close as descendant exit.
        termination.catch(error => logger.warn(`Test runner cleanup failed: ${toErrorMessage(error)}`));
        termination.then(untrackExit, () => undefined);
        finish(err(new Error(`Test execution timed out after ${timeout}ms for files: ${fileLabel}`)), false);
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
          // Coverage and JSON reports belong to this run; clean both only
          // after the entire owned process group has stopped.
          termination?.then(() => cleanupArtifacts(), () => undefined);
          return; // The timeout result has already been returned.
        }
        untrackExit();

        // Parse results based on framework. Vitest 5 writes the JSON report to
        // a file instead of stdout, so read it back through the report handle.
        let reportText: string | undefined;
        try {
          reportText = report ? report.read(stdout) : stdout;
        } catch (error) {
          finish(err(toError(error)));
          return;
        }
        if (reportText === undefined) {
          finish(err(new TestRunnerExecutionError(`The current Vitest JSON report is missing for ${fileLabel}.`)));
          return;
        }
        const parseResult = this.parseTestOutput(reportText, stderr, fileLabel, framework, code);

        // Read only this invocation's coverage artifacts. A previous or
        // concurrent run's project coverage directory is not evidence.
        if (parseResult.success && coverageDirectory) {
          const diskCoverage = this.readCoverageFromDisk(coverageDirectory);
          if (diskCoverage) {
            parseResult.value.coverage ??= diskCoverage.summary;
            if (!parseResult.value.fileCoverages && diskCoverage.perFile.length > 0) {
              parseResult.value.fileCoverages = diskCoverage.perFile;
            }
            parseResult.value.rawCoverageMap ??= diskCoverage.rawMap;
          }
        }

        finish(parseResult);
      });

      proc.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        if (killed) return;
        untrackExit();
        finish(err(new Error(`Failed to spawn test runner: ${error.message}. Is '${command}' installed?`)));
      });
    });
  }

  /**
   * Build test command based on framework
   */
  private buildTestCommand(
    fileOrFiles: string | string[],
    framework: string
  ): { command: string; args: string[]; report?: VitestJsonReport; coverageDirectory?: string } {
    // #909: absolute paths never start with '-', so a file cannot be read as a
    // flag; Jest's positional patterns are regexes, so escape and anchor them.
    const files = (Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]).map(file => runnerFilePath(file));
    const createCoverageDirectory = (): string => mkdtempSync(join(tmpdir(), 'aqe-test-coverage-'));
    switch (framework.toLowerCase()) {
      case 'vitest': {
        // --outputFile makes Vitest 4 and 5 both write the JSON report to a
        // file we own; Vitest 5 no longer prints it to stdout.
        const coverageDirectory = createCoverageDirectory();
        let report: VitestJsonReport;
        try { report = createVitestJsonReport(); } catch (error) {
          rmSync(coverageDirectory, { recursive: true, force: true });
          throw error;
        }
        return {
          command: 'npx',
          args: ['vitest', 'run', ...files, '--reporter=json', '--no-color', ...report.args, `--coverage.reportsDirectory=${coverageDirectory}`],
          report,
          coverageDirectory,
        };
      }
      case 'jest': {
        const coverageDirectory = createCoverageDirectory();
        return {
          command: 'npx',
          args: ['jest', ...files.map(file => jestExactPathPattern(file)), '--json', '--no-colors', '--testLocationInResults', `--coverageDirectory=${coverageDirectory}`],
          coverageDirectory,
        };
      }
      case 'mocha':
        // Note: mocha has no built-in coverage — requires external nyc/c8 wrapper.
        // Coverage data will be unavailable for mocha-based test runs.
        return {
          command: 'npx',
          args: ['mocha', ...files, '--reporter=json'],
        };
      case 'node':
      case 'node-test':
        return {
          command: process.execPath,
          args: ['--test', ...files],
        };
      default: {
        // Default to vitest
        const coverageDirectory = createCoverageDirectory();
        let report: VitestJsonReport;
        try { report = createVitestJsonReport(); } catch (error) {
          rmSync(coverageDirectory, { recursive: true, force: true });
          throw error;
        }
        return {
          command: 'npx',
          args: ['vitest', 'run', ...files, '--reporter=json', '--no-color', ...report.args, `--coverage.reportsDirectory=${coverageDirectory}`],
          report,
          coverageDirectory,
        };
      }
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
        case 'node':
        case 'node-test':
          return this.parseNodeTestOutput(stdout, stderr, file, exitCode);
        default:
          return this.parseVitestOutput(stdout, stderr, file, exitCode);
      }
    } catch (error) {
      return err(new Error(
        `Failed to parse test output for ${file}: ${toErrorMessage(error)}\n` +
        `stdout: ${capDiagnostics(stdout, 500)}\nstderr: ${capDiagnostics(stderr, 500)}`
      ));
    }
  }

  /**
   * Parse the TAP or spec summary emitted by Node's built-in test runner.
   */
  private parseNodeTestOutput(
    stdout: string,
    stderr: string,
    file: string,
    exitCode: number | null
  ): Result<TestExecutionResult, Error> {
    const output = `${stdout}\n${stderr}`;
    const summary = new Map<string, number>();
    for (const match of output.matchAll(/^(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)) {
      summary.set(match[1], Number(match[2]));
    }

    const total = summary.get('tests') ?? 0;
    if (total === 0) {
      return err(new Error(`node:test reported zero tests for ${file}`));
    }

    const passed = summary.get('pass') ?? 0;
    const failed = summary.get('fail') ?? 0;
    const skipped = (summary.get('skipped') ?? 0) +
      (summary.get('cancelled') ?? 0) +
      (summary.get('todo') ?? 0);
    if (exitCode !== 0 && failed === 0) {
      return err(new Error(`node:test exited with code ${exitCode ?? 'unknown'} for ${file}`));
    }

    const failedNames = [
      ...Array.from(output.matchAll(/^not ok \d+ - (.+)$/gm), match => match[1].trim()),
      ...Array.from(output.matchAll(/^✖ (.+?)(?: \(|$)/gm), match => match[1].trim()),
    ];
    const failedTests: FailedTest[] = Array.from({ length: failed }, (_, index) => ({
      testId: uuidv4(),
      testName: failedNames[index] ?? `node:test failure ${index + 1}`,
      file,
      error: stderr.trim() || failedNames[index] || 'Test failed',
      duration: 0,
    }));

    return ok({
      total,
      passed,
      failed,
      skipped,
      failedTests,
      coverage: undefined,
    });
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
            } else if (assertion.status === 'skipped' || assertion.status === 'pending' || assertion.status === 'todo') {
              skipped++;
            }
          }
        }

        const executionError = getTestRunnerExecutionError('vitest', file, exitCode,
          { passed, failed, skipped }, stderr + '\n' + stdout, json);
        if (executionError) return err(executionError);

        const covData = this.extractCoverageFromJson(json);
        const testCases = this.reportedTestCases(json, file, passed + failed + skipped);
        return ok({
          total: passed + failed + skipped,
          passed,
          failed,
          skipped,
          failedTests,
          ...(testCases ? { testCases } : {}),
          coverage: covData.summary,
          fileCoverages: covData.perFile.length > 0 ? covData.perFile : undefined,
          rawCoverageMap: isRecord(json.coverageMap) && !json.coverageMap.total ? json.coverageMap : undefined,
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
   * #1110: the report's per-test entries, kept only when they account for
   * every counted test; a partial list would misstate the run.
   */
  private reportedTestCases(json: Record<string, unknown>, file: string, total: number): TestCase[] | undefined {
    const cases = testCasesFromRunnerReport(json, file);
    return cases && cases.length === total ? cases : undefined;
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
          } else if (assertion.status === 'skipped' || assertion.status === 'pending' || assertion.status === 'todo') {
            skipped++;
          }
        }
      }

      const executionError = getTestRunnerExecutionError('jest', file, exitCode,
        { passed, failed, skipped }, stderr + '\n' + stdout, json);
      if (executionError) return err(executionError);

      const covData = this.extractCoverageFromJson(json);
      const testCases = this.reportedTestCases(json, file, passed + failed + skipped);
      return ok({
        total: passed + failed + skipped,
        passed,
        failed,
        skipped,
        failedTests,
        ...(testCases ? { testCases } : {}),
        coverage: covData.summary,
        fileCoverages: covData.perFile.length > 0 ? covData.perFile : undefined,
        rawCoverageMap: isRecord(json.coverageMap) && !json.coverageMap.total ? json.coverageMap : undefined,
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

      const executionError = getTestRunnerExecutionError('mocha', file, exitCode,
        { passed, failed, skipped }, stderr + '\n' + stdout);
      if (executionError) return err(executionError);

      return ok({
        total: passed + failed + skipped,
        passed,
        failed,
        skipped,
        failedTests,
        coverage: undefined, // mocha has no built-in coverage
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

      const executionError = getTestRunnerExecutionError('Test runner', file, exitCode,
        { passed, failed, skipped }, combinedOutput);
      if (executionError) return err(executionError);

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

      const executionError = getTestRunnerExecutionError('Test runner', file, exitCode,
        { passed, failed, skipped }, combinedOutput);
      if (executionError) return err(executionError);

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
            `Test execution failed for ${file} (exit code ${exitCode}):\n${capDiagnostics(combinedOutput, 1000)}`
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
      `Output: ${capDiagnostics(combinedOutput, 500)}`
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
    const testCount = secureRandomInt(0, 10) + 1;
    const failCount = secureRandom() > (1 - this.config.simulatedFailureRate) ? 1 : 0;
    const skipCount = secureRandom() > (1 - this.config.simulatedSkipRate) ? 1 : 0;

    const failedTests: FailedTest[] = [];
    if (failCount > 0) {
      failedTests.push({
        testId: uuidv4(),
        testName: `test in ${file}`,
        file,
        error: 'Assertion failed',
        stack: `Error: Assertion failed\n    at ${file}:10:5`,
        duration: secureRandom() * 1000,
      });
    }

    const fileCov = {
      line: Math.round(secureRandom() * 4000 + 6000) / 100,   // 60-100%
      branch: Math.round(secureRandom() * 5000 + 4000) / 100,  // 40-90%
      function: Math.round(secureRandom() * 3000 + 7000) / 100, // 70-100%
      statement: Math.round(secureRandom() * 4000 + 6000) / 100, // 60-100%
    };

    return {
      total: testCount,
      passed: testCount - failCount - skipCount,
      failed: failCount,
      skipped: skipCount,
      failedTests,
      coverage: fileCov,
      fileCoverages: [{ path: file, ...fileCov }],
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
    return this.executeTestFiles(files, request.framework, request.timeout ?? 30000);
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

    const testCases = mergeTestCases(results);
    if (testCases) aggregated.testCases = testCases;

    aggregated.coverage = this.aggregateCoverage(
      results.map(r => r.coverage).filter((c): c is NonNullable<typeof c> => c !== undefined)
    );

    // Collect per-file coverages from all worker results
    const allFileCoverages = results.flatMap(r => r.fileCoverages ?? []);
    if (allFileCoverages.length > 0) {
      aggregated.fileCoverages = allFileCoverages;
    }

    return aggregated;
  }

  /**
   * Aggregate coverage from multiple test file results.
   *
   * Note: uses unweighted average across entries. When coverage comes from
   * readCoverageFromDisk() the runner's own weighted total is used directly
   * (bypassing this method), so the unweighted average only applies when
   * individual file JSON outputs each report their own summary.
   */
  private aggregateCoverage(coverages: CoverageFigures[]): CoverageFigures | undefined {
    if (coverages.length === 0) {
      return undefined;
    }

    // #1015: average each metric over the entries that collected it; a
    // metric nobody collected stays null.
    const mean = (values: Array<number | null>): number | null => {
      const present = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      return present.length > 0
        ? Math.round((present.reduce((a, v) => a + v, 0) / present.length) * 100) / 100
        : null;
    };
    const line = mean(coverages.map(c => c.line));
    if (line === null) return undefined;
    return {
      line,
      branch: mean(coverages.map(c => c.branch)),
      function: mean(coverages.map(c => c.function)),
      statement: mean(coverages.map(c => c.statement)),
    };
  }

  /**
   * Extract coverage percentages from vitest/jest JSON output.
   *
   * Both runners include a `coverageMap` (or `coverageSummary`) object when
   * --coverage is passed. The shape varies, so we handle the common cases:
   *   - Jest/vitest v8: json.coverageMap with per-file entries
   *   - Jest coverageSummary: json.coverageSummary.total with pct fields
   *
   * Returns both aggregate and per-file coverage data.
   */
  private extractCoverageFromJson(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json: any
  ): { summary?: CoverageFigures; perFile: FileCoverageFigures[] } {
    const perFile: FileCoverageFigures[] = [];
    try {
      // Jest shape: { coverageSummary: { total: { lines: { pct }, branches: { pct }, ... } } }
      const total = json?.coverageSummary?.total ?? json?.coverageMap?.total;
      if (total?.lines?.pct !== undefined) {
        const line = summaryPct(total.lines);
        return {
          summary: line === null ? undefined : {
            line,
            branch: summaryPct(total.branches),
            function: summaryPct(total.functions),
            statement: summaryPct(total.statements),
          },
          perFile,
        };
      }

      // Vitest v8 shape: coverageMap is keyed by file path (istanbul entries)
      const coverageMap = json?.coverageMap;
      if (coverageMap && typeof coverageMap === 'object') {
        const files = Object.keys(coverageMap).filter(k => k !== 'total');
        const totals = { line: [0, 0], branch: [0, 0], function: [0, 0], statement: [0, 0] };
        for (const filePath of files) {
          const entry = coverageMap[filePath];
          const s: Record<string, number> = entry?.s ?? {};
          const f: Record<string, number> = entry?.f ?? {};
          const b: Record<string, number[] | number> = entry?.b ?? {};

          // #1012: line coverage per SOURCE LINE (istanbul's own rule), not per statement.
          const lineHits = istanbulLineHits({ statementMap: entry?.statementMap ?? {}, s });
          const lines = [[...lineHits.values()].filter(v => v > 0).length, lineHits.size];
          const statements = [Object.values(s).filter(v => v > 0).length, Object.keys(s).length];
          const fns = [Object.values(f).filter(v => v > 0).length, Object.keys(f).length];
          const branchCounts = Object.values(b).flatMap(v => (Array.isArray(v) ? v : [v]));
          const branches = [branchCounts.filter(c => c > 0).length, branchCounts.length];
          if (lines[1] === 0) continue;

          // #1015: istanbul's 0/0 (no branches / no functions) is "not
          // collected" — null — not 100%.
          perFile.push({
            path: filePath,
            line: ratio(lines)!,
            branch: ratio(branches),
            function: ratio(fns),
            statement: ratio(statements),
          });
          for (const [key, [covered, count]] of [['line', lines], ['branch', branches], ['function', fns], ['statement', statements]] as const) {
            totals[key][0] += covered;
            totals[key][1] += count;
          }
        }

        if (perFile.length > 0) {
          return {
            summary: {
              line: ratio(totals.line)!,
              branch: ratio(totals.branch),
              function: ratio(totals.function),
              statement: ratio(totals.statement),
            },
            perFile,
          };
        }
      }
    } catch {
      // Coverage parsing is best-effort — never break test results for it
    }
    return { perFile };
  }

  /**
   * Read coverage from the private output directory of a completed runner.
   * Setting the directory does not enable coverage; project configuration
   * still decides whether coverage is collected.
   */
  private readCoverageFromDisk(coverageDirectory: string): {
    summary: CoverageFigures;
    perFile: FileCoverageFigures[];
    rawMap?: Record<string, unknown>;
  } | undefined {
    try {
      // Check common coverage output paths
      const candidates = [
        join(coverageDirectory, 'coverage-final.json'),
        join(coverageDirectory, 'coverage-summary.json'),
      ];

      for (const filePath of candidates) {
        if (!existsSync(filePath)) continue;

        const raw = readFileSync(filePath, 'utf-8');
        const json = safeJsonParse(raw);

        // coverage-summary.json shape: { total: { lines: { pct }, ... }, "/path": { lines: { pct }, ... } }
        if (json?.total?.lines?.pct !== undefined) {
          const perFile: FileCoverageFigures[] = [];
          for (const [key, value] of Object.entries(json)) {
            if (key === 'total') continue;
            // Normalize path: strip cwd prefix, reject traversal sequences
            // Reject traversal; keep the key absolute (#1027 N7: one key form).
            const relative = key.replace(process.cwd() + '/', '').replace(process.cwd() + '\\', '');
            if (relative.includes('..')) continue;
            const normalizedPath = fileCoverageKey(key);
            const entry = value as Record<string, SummaryMetric | undefined>;
            const line = summaryPct(entry?.lines);
            if (line !== null) {
              // #1015: a metric with total 0 is not collected (null), not its 100 pct.
              perFile.push({
                path: normalizedPath,
                line,
                branch: summaryPct(entry.branches),
                function: summaryPct(entry.functions),
                statement: summaryPct(entry.statements),
              });
            }
          }
          const line = summaryPct(json.total.lines);
          if (line === null) continue;
          return {
            summary: {
              line,
              branch: summaryPct(json.total.branches),
              function: summaryPct(json.total.functions),
              statement: summaryPct(json.total.statements),
            },
            perFile,
          };
        }

        // coverage-final.json shape: Istanbul raw map — extract from extractCoverageFromJson
        if (typeof json === 'object' && !json.total) {
          const result = this.extractCoverageFromJson({ coverageMap: json });
          if (result.summary) {
            return { summary: result.summary, perFile: result.perFile, rawMap: json };
          }
        }
      }
    } catch {
      // Coverage from disk is best-effort
    }
    return undefined;
  }

  private async storeResults(runId: string, result: TestRunResult, testFiles?: readonly string[]): Promise<void> {
    // #1028 N1: the record names the test files it ran, so per-test duration
    // is compared only between runs of the same test set.
    const files = testFiles && testFiles.length > 0 ? [...new Set(testFiles)].sort() : undefined;
    // Per-test entries are returned to the caller, not persisted with the run record.
    const { testCases: _testCases, ...record } = result;
    await this.memory.set(`test-run:${runId}`, files ? { ...record, testFiles: files } : record, {
      namespace: 'test-execution',
      persist: true,
    });

    // A runner ERROR has no trustworthy result: it persists no evidence.
    if (result.status === 'error') return;
    const runStatus: 'passed' | 'failed' = result.failed > 0 || result.status !== 'passed' ? 'failed' : 'passed';
    const coverage = result.coverage && Number.isFinite(result.coverage.line) ? result.coverage : undefined;

    try {
      // #1027 NB1: this run's testsPassing and (when measured) its coverage,
      // written together under this runId — the same writer as
      // `aqe test execute`. Coverage from a run whose tests FAILED (N4) is
      // then never read next to a stale testsPassing from an earlier run.
      await writeTestRunEvidence(this.memory, {
        runId, passed: result.passed, failed: result.failed, skipped: result.skipped,
      }, { source: 'test-execution', ...(coverage ? { coverage: coverage.line } : {}) });
    } catch {
      // Non-critical — don't break test storage if evidence storage fails
    }

    // Store coverage data so quality-assess and quality-gate can read it.
    // Note: coverage:previous rotation is owned by coverage-analyzer (the
    // canonical coverage service) to avoid double-rotation race conditions.
    if (!coverage) return;
    try {
      // Same CoverageSummary shape as coverage-analyzer, stamped with its
      // provenance (#1008/#1015) so readers can trust it. An uncollected
      // metric stays null — never 0, never istanbul's 0/0 = 100%.
      await this.memory.set('coverage:latest', {
        line: coverage.line,
        branch: coverage.branch ?? null,
        function: coverage.function ?? null,
        statement: coverage.statement ?? null,
        files: result.fileCoverages?.length ?? 0,
        measured: true,
        runStatus,
        runId,
      }, { persist: true });

      // Store per-file coverage via memory.set() (not storeVector) so that
      // quality-analyzer's getStoredCoverage() can read it with memory.get()
      for (const fc of result.fileCoverages ?? []) {
        if (!Number.isFinite(fc.line)) continue;
        // #1027 N7: one key form — the absolute path.
        await this.memory.set(`coverage:file:${fileCoverageKey(fc.path)}`, {
          line: fc.line,
          branch: fc.branch ?? null,
          function: fc.function ?? null,
          statement: fc.statement ?? null,
          measured: true,
          runStatus,
        }, { persist: true });
      }
    } catch {
      // Non-critical — don't break test storage if coverage store fails
    }
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

/** Coverage percentages; `null` = metric not collected (#1015). */
interface CoverageFigures {
  line: number;
  branch: number | null;
  function: number | null;
  statement: number | null;
}

interface FileCoverageFigures extends CoverageFigures {
  path: string;
}

interface SummaryMetric { total?: number; covered?: number; pct?: number }

/** covered/total as a 2-decimal percentage, or null when there is nothing to cover. */
function ratio([covered, total]: readonly number[]): number | null {
  return total > 0 ? Math.round((covered / total) * 10000) / 100 : null;
}

/**
 * A coverage-summary metric's percentage. istanbul writes `pct: 100` for a
 * metric with `total: 0`; that is "not collected" — null (#1015).
 */
function summaryPct(metric: SummaryMetric | undefined): number | null {
  if (!metric || typeof metric.pct !== 'number' || !Number.isFinite(metric.pct)) return null;
  if (typeof metric.total === 'number' && metric.total === 0) return null;
  return metric.pct;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A test covers a counter if any invocation hit it. Reject incompatible maps. */
function mergeHitCounts(left: unknown, right: unknown): Record<string, number | number[]> | undefined {
  if (!isRecord(left) || !isRecord(right)) return undefined;
  const keys = Object.keys(left);
  if (!isDeepStrictEqual(keys.sort(), Object.keys(right).sort())) return undefined;
  const merged: Record<string, number | number[]> = {};
  for (const key of keys) {
    const a = left[key];
    const b = right[key];
    if (typeof a === 'number' && Number.isFinite(a) && a >= 0
      && typeof b === 'number' && Number.isFinite(b) && b >= 0) {
      merged[key] = Math.max(a, b);
    } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)
      && b.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
      merged[key] = a.map((v: number, i: number) => Math.max(v, b[i]));
    } else {
      return undefined;
    }
  }
  return merged;
}

interface TestExecutionResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  failedTests: FailedTest[];
  /** #1110: per-test entries from the runner report, when it listed every test. */
  testCases?: TestCase[];
  coverage?: CoverageFigures;
  /** Per-file coverage entries for granular storage */
  fileCoverages?: FileCoverageFigures[];
  /** Istanbul hit counters from this invocation; never persisted as a run result. */
  rawCoverageMap?: Record<string, unknown>;
}
