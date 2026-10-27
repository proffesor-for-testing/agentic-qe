/**
 * Agentic QE v3 - Retry Handler Service
 * Implements intelligent retry logic for failed tests
 */

import { LoggerFactory } from '../../../logging/index.js';
import { spawn } from 'node:child_process';
import { createVitestJsonReport, type VitestJsonReport } from '../../../shared/vitest-json-report.js';
import { jestExactPathPattern, nameFilterArg, runnerFilePath } from '../../../shared/test-runner-args.js';
import { runnerCwdFor } from '../../../shared/test-runner-project.js';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { Result, ok, err } from '../../../shared/types';
import { RetryResult, FailedTest } from '../interfaces';
import { MemoryBackend } from '../../../kernel/interfaces';
import { TEST_EXECUTION_CONSTANTS, RETRY_CONSTANTS } from '../../constants.js';
import { toError } from '../../../shared/error-utils.js';
import { safeJsonParse } from '../../../shared/safe-json.js';
import { secureRandom } from '../../../shared/utils/crypto-random.js';
import { terminateTestRunner, trackTestRunnerExit } from '../../../shared/test-runner-process.js';
import { redactFailureText } from './runner-test-cases.js';

/**
 * Whether a runner-reported test file and the requested target are the same
 * file. Runners report real paths, so a target given through a symlink must be
 * compared by realpath, falling back to the runner path when a file is missing.
 */
function sameTestFile(reported: string, target: string, cwd: string): boolean {
  const canonical = (file: string): string => {
    try {
      return realpathSync(resolvePath(cwd, file));
    } catch {
      return runnerFilePath(file, cwd);
    }
  };
  return canonical(reported) === canonical(target);
}


// ============================================================================
// Configuration
// ============================================================================

/**
 * Supported test runners for retry execution
 */
export type TestRunner = 'vitest' | 'jest' | 'mocha' | 'auto';

/**
 * Configuration for the retry handler service
 */
export interface RetryHandlerConfig {
  /**
   * When true, simulates test execution with random outcomes (for unit testing).
   * When false (default), executes actual tests using the configured test runner.
   */
  simulateForTesting: boolean;
  /**
   * Success rate for simulated retries (0-1) when simulateForTesting is true.
   * Defaults to 0.7 (70% chance of passing on retry).
   */
  simulatedRetrySuccessRate: number;
  /**
   * When true, adds random jitter to backoff delays.
   * When false (default), backoff delays are deterministic.
   */
  enableJitter: boolean;
  /**
   * Maximum jitter percentage (0-1) when enableJitter is true.
   * Defaults to 0.1 (10% variation).
   */
  maxJitterPercent: number;
  /**
   * Test runner to use for executing retries.
   * 'auto' will detect the runner based on project configuration.
   * Defaults to 'auto'.
   */
  testRunner: TestRunner;
  /**
   * Timeout for individual test execution in milliseconds.
   * Defaults to 60000 (60 seconds).
   */
  testTimeout: number;
  /**
   * Working directory for test execution.
   * Defaults to process.cwd().
   */
  cwd?: string;
  /**
   * Path to npx binary. Defaults to 'npx'.
   */
  npxPath: string;
}

const DEFAULT_RETRY_CONFIG: RetryHandlerConfig = {
  simulateForTesting: false,
  simulatedRetrySuccessRate: RETRY_CONSTANTS.DEFAULT_FLAKY_PASS_RATE,
  enableJitter: false,
  maxJitterPercent: RETRY_CONSTANTS.RETRY_PASS_RATE_VARIATION,
  testRunner: 'auto',
  testTimeout: TEST_EXECUTION_CONSTANTS.DEFAULT_TEST_TIMEOUT_MS,
  npxPath: 'npx',
};

// ============================================================================
// Interfaces
// ============================================================================

export interface IRetryHandler {
  /** Determine if a test should be retried */
  shouldRetry(testId: string, attempt: number, error: string): Promise<boolean>;

  /** Execute a test with retry logic */
  executeWithRetry(request: RetryExecutionRequest): Promise<Result<RetryResult, Error>>;

  /** Get retry statistics */
  getRetryStats(runId?: string): Promise<Result<RetryStatistics, Error>>;

  /** Configure retry policy for a test */
  setRetryPolicy(testId: string, policy: RetryPolicy): Promise<void>;

  /** Get retry policy for a test */
  getRetryPolicy(testId: string): Promise<RetryPolicy>;
}

export interface RetryExecutionRequest {
  runId: string;
  failedTests: FailedTest[];
  maxRetries: number;
  backoff: 'linear' | 'exponential' | 'constant';
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (testId: string, attempt: number) => void;
  /** #1247: the run's explicit projectRoot; every retry runs from it. */
  projectRoot?: string;
}

export interface RetryStatistics {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  averageAttemptsToPass: number;
  retryRate: number;
  testStats: Map<string, TestRetryStats>;
}

export interface TestRetryStats {
  testId: string;
  attempts: number;
  lastResult: 'passed' | 'failed';
  errorPatterns: string[];
}

export interface RetryPolicy {
  maxRetries: number;
  backoff: 'linear' | 'exponential' | 'constant';
  baseDelay: number;
  maxDelay: number;
  retryOn: RetryCondition[];
  noRetryOn: RetryCondition[];
}

export type RetryCondition =
  | { type: 'error_pattern'; pattern: string }
  | { type: 'exit_code'; code: number }
  | { type: 'flakiness_score'; threshold: number }
  | { type: 'custom'; predicate: string };

// ============================================================================
// Retry Handler Service
// ============================================================================

const logger = LoggerFactory.create('test-execution/retry-handler');

export class RetryHandlerService implements IRetryHandler {
  private readonly retryHistory = new Map<string, RetryRecord[]>();
  private readonly retryPolicies = new Map<string, RetryPolicy>();
  private readonly runStats = new Map<string, RunRetryStats>();
  private readonly config: RetryHandlerConfig;

  private readonly defaultPolicy: RetryPolicy = {
    maxRetries: 3,
    backoff: 'exponential',
    baseDelay: 1000,
    maxDelay: 30000,
    retryOn: [],
    noRetryOn: [
      { type: 'error_pattern', pattern: 'SyntaxError' },
      { type: 'error_pattern', pattern: 'TypeError' },
    ],
  };

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<RetryHandlerConfig> = {}
  ) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Determine if a test should be retried based on policy and history
   */
  async shouldRetry(testId: string, attempt: number, error: string): Promise<boolean> {
    const policy = await this.getRetryPolicy(testId);

    // Check max retries
    if (attempt >= policy.maxRetries) {
      return false;
    }

    // Check noRetryOn conditions
    for (const condition of policy.noRetryOn) {
      if (this.matchesCondition(condition, error)) {
        return false;
      }
    }

    // Check retryOn conditions (if specified, at least one must match)
    if (policy.retryOn.length > 0) {
      const shouldRetry = policy.retryOn.some(condition =>
        this.matchesCondition(condition, error)
      );
      return shouldRetry;
    }

    // Default: retry for any error not in noRetryOn
    return true;
  }

  /**
   * Execute failed tests with retry logic
   */
  async executeWithRetry(request: RetryExecutionRequest): Promise<Result<RetryResult, Error>> {
    const {
      runId,
      failedTests,
      maxRetries,
      backoff,
      baseDelay = 1000,
      maxDelay = 30000,
      onRetry,
      projectRoot,
    } = request;

    try {
      const stats: RunRetryStats = {
        runId,
        totalRetries: 0,
        successful: 0,
        failed: 0,
        flakyDetected: [],
        startTime: Date.now(),
      };

      const nowPassing: string[] = [];
      const stillFailing: string[] = [];
      const flakyDetected: string[] = [];
      const unmatched: string[] = [];
      const tests: NonNullable<RetryResult['tests']> = [];

      for (const test of failedTests) {
        const result = await this.retryTest(
          test,
          maxRetries,
          backoff,
          baseDelay,
          maxDelay,
          onRetry,
          projectRoot
        );

        stats.totalRetries += result.attempts;

        if (result.passed) {
          nowPassing.push(test.testId);
          stats.successful++;

          // If it passed on retry, it's likely flaky
          if (result.attempts > 0) {
            flakyDetected.push(test.testId);
          }
        } else {
          stillFailing.push(test.testId);
          stats.failed++;
          if (result.unmatched) unmatched.push(test.testId);
        }

        tests.push({
          testId: test.testId, attempts: result.attempts, passed: result.passed,
          ...(result.unmatched ? { unmatched: true } : {}),
        });

        // Record retry history
        await this.recordRetry(test.testId, result);
      }

      stats.flakyDetected = flakyDetected;
      stats.unmatched = unmatched;
      stats.endTime = Date.now();
      this.runStats.set(runId, stats);

      // Persist stats
      await this.memory.set(`retry-stats:${runId}`, stats, {
        namespace: 'test-execution',
        persist: true,
      });

      const retryResult: RetryResult = {
        originalFailed: failedTests.length,
        retried: stats.totalRetries,
        nowPassing: nowPassing.length,
        stillFailing: stillFailing.length,
        flakyDetected,
        unmatched,
        tests,
      };

      return ok(retryResult);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get retry statistics for a run or overall
   */
  async getRetryStats(runId?: string): Promise<Result<RetryStatistics, Error>> {
    try {
      if (runId) {
        const stats = this.runStats.get(runId);
        if (!stats) {
          const stored = await this.memory.get<RunRetryStats>(`retry-stats:${runId}`);
          if (!stored) {
            return err(new Error(`No retry stats found for run: ${runId}`));
          }
          return ok(this.convertToRetryStatistics([stored]));
        }
        return ok(this.convertToRetryStatistics([stats]));
      }

      // Aggregate all stats
      const allStats = Array.from(this.runStats.values());
      return ok(this.convertToRetryStatistics(allStats));
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Set retry policy for a specific test
   */
  async setRetryPolicy(testId: string, policy: RetryPolicy): Promise<void> {
    this.retryPolicies.set(testId, policy);
    await this.memory.set(`retry-policy:${testId}`, policy, {
      namespace: 'test-execution',
      persist: true,
    });
  }

  /**
   * Get retry policy for a test (or default)
   */
  async getRetryPolicy(testId: string): Promise<RetryPolicy> {
    // Check cache
    const cached = this.retryPolicies.get(testId);
    if (cached) {
      return cached;
    }

    // Check storage
    const stored = await this.memory.get<RetryPolicy>(`retry-policy:${testId}`);
    if (stored) {
      this.retryPolicies.set(testId, stored);
      return stored;
    }

    // Return default
    return this.defaultPolicy;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private matchesCondition(condition: RetryCondition, error: string): boolean {
    switch (condition.type) {
      case 'error_pattern':
        return error.includes(condition.pattern) ||
          new RegExp(condition.pattern, 'i').test(error);

      case 'exit_code':
        // Would need to parse exit code from error message
        return error.includes(`exit code ${condition.code}`);

      case 'flakiness_score':
        // Would need to check flakiness score from detector
        return false;

      case 'custom':
        // Custom predicates would need to be evaluated
        return false;

      default:
        return false;
    }
  }

  private async retryTest(
    test: FailedTest,
    maxRetries: number,
    backoff: 'linear' | 'exponential' | 'constant',
    baseDelay: number,
    maxDelay: number,
    onRetry?: (testId: string, attempt: number) => void,
    projectRoot?: string
  ): Promise<RetryTestResult> {
    let attempts = 0;
    // #1122: the final error is persisted in retry-history, so keep it redacted.
    let lastError = redactFailureText(test.error);

    while (attempts < maxRetries) {
      // Check if should retry
      const shouldRetry = await this.shouldRetry(test.testId, attempts, lastError);
      if (!shouldRetry) {
        break;
      }

      // Calculate delay
      const delay = this.calculateDelay(attempts, backoff, baseDelay, maxDelay);
      await this.sleep(delay);

      // Notify retry
      if (onRetry) {
        onRetry(test.testId, attempts + 1);
      }

      // Execute test (simulated - in real implementation, would run actual test)
      const result = await this.executeTest(test, projectRoot);

      // #1141: a filter that selected no test reran nothing. Report that
      // instead of counting it as a retry, and stop: another attempt would
      // select nothing again.
      if (result.unmatched) {
        logger.warn(`Retry of "${test.testName}" matched no test in ${test.file}; nothing was rerun.`);
        return { testId: test.testId, passed: false, attempts, finalError: lastError, unmatched: true };
      }

      attempts++;

      if (result.passed) {
        return {
          testId: test.testId,
          passed: true,
          attempts,
          finalError: undefined,
        };
      }

      lastError = result.error !== undefined ? redactFailureText(result.error) : lastError;
    }

    return {
      testId: test.testId,
      passed: false,
      attempts,
      finalError: lastError,
    };
  }

  private async executeTest(test: FailedTest, projectRoot?: string): Promise<RetryRunOutcome> {
    // In simulation mode (for unit testing), use random behavior
    if (this.config.simulateForTesting) {
      const passOnRetry = secureRandom() < this.config.simulatedRetrySuccessRate;
      return {
        passed: passOnRetry,
        error: passOnRetry ? undefined : test.error,
      };
    }

    // In production mode, actually execute the test
    return this.executeRealTest(test, projectRoot);
  }

  /**
   * Execute a real test using the configured test runner
   */
  private async executeRealTest(test: FailedTest, projectRoot?: string): Promise<RetryRunOutcome> {
    const testFile = test.file;
    const testName = test.testName;
    const cwd = this.config.cwd ?? process.cwd();

    // Validate test file exists
    if (!existsSync(testFile)) {
      throw new Error(`Test file not found: ${testFile}. Cannot retry non-existent test file.`);
    }

    // #1247: retry from the same directory as the first run: the caller's
    // projectRoot, else a configured directory, else the file's runner
    // project. The file path stays relative to `cwd`.
    const runCwd = projectRoot ?? this.config.cwd ?? runnerCwdFor(testFile);

    // Detect or use configured test runner
    const runner = await this.detectTestRunner(runCwd);
    if (!runner) {
      throw new Error(
        `No test runner detected or configured. Install vitest, jest, or mocha, ` +
        `or configure testRunner in RetryHandlerConfig. Cannot execute retry for: ${testFile}`
      );
    }

    // Build command based on runner
    const { command, args, report } = this.buildTestCommand(runner, testFile, testName, cwd);

    // Execute the test
    return this.spawnTestProcess(command, args, runCwd, report, runner === 'vitest' ? testFile : undefined);
  }

  /**
   * Detect which test runner is available in the project
   */
  private async detectTestRunner(cwd: string): Promise<TestRunner | null> {
    // If explicitly configured, use that
    if (this.config.testRunner !== 'auto') {
      return this.config.testRunner;
    }

    // Check for vitest config
    const vitestConfigs = [
      'vitest.config.ts',
      'vitest.config.js',
      'vitest.config.mts',
      'vitest.config.mjs',
      'vite.config.ts',
      'vite.config.js',
    ];
    for (const config of vitestConfigs) {
      if (existsSync(`${cwd}/${config}`)) {
        return 'vitest';
      }
    }

    // Check for jest config
    const jestConfigs = [
      'jest.config.ts',
      'jest.config.js',
      'jest.config.json',
      'jest.config.mjs',
    ];
    for (const config of jestConfigs) {
      if (existsSync(`${cwd}/${config}`)) {
        return 'jest';
      }
    }

    // Check package.json for test script hints
    try {
      const pkgPath = `${cwd}/package.json`;
      if (existsSync(pkgPath)) {
        const pkgContent = readFileSync(pkgPath, 'utf-8');
        const pkg = safeJsonParse(pkgContent);
        const testScript = pkg?.scripts?.test ?? '';
        if (testScript.includes('vitest')) return 'vitest';
        if (testScript.includes('jest')) return 'jest';
        if (testScript.includes('mocha')) return 'mocha';

        // Check devDependencies
        const devDeps = pkg?.devDependencies ?? {};
        if ('vitest' in devDeps) return 'vitest';
        if ('jest' in devDeps) return 'jest';
        if ('mocha' in devDeps) return 'mocha';
      }
    } catch {
      // Non-critical: package.json read errors during test runner detection
      logger.debug('package.json read failed:');
    }

    return null;
  }

  /**
   * Build the command and arguments for the test runner
   */
  private buildTestCommand(
    runner: TestRunner,
    testFile: string,
    testName?: string,
    cwd: string = this.config.cwd ?? process.cwd()
  ): { command: string; args: string[]; report?: VitestJsonReport } {
    const npx = this.config.npxPath;
    // A FailedTest holds the literal assertion name and path from the previous
    // run. Name filters are regex-escaped and passed as --flag=value; file
    // filters are absolute (Jest: escaped and anchored), so neither can be
    // misread as a regex or as a flag when it starts with '-' (#886, #909).
    const filterByName = Boolean(testName) && testName !== testFile;

    switch (runner) {
      case 'vitest':
        // vitest run --reporter=json <abs file> --testNamePattern=<name>
        // --outputFile: Vitest 5 no longer prints the JSON report to stdout.
        { const report = createVitestJsonReport();
        const vitestArgs = ['vitest', 'run', '--reporter=json', runnerFilePath(testFile, cwd)];
        if (filterByName) vitestArgs.push(nameFilterArg('vitest', testName!));
        vitestArgs.push(...report.args);
        return { command: npx, args: vitestArgs, report }; }

      case 'jest':
        // jest --json --testNamePattern=<name> ^<escaped abs file>$
        // Positional TestPathPatterns work on Jest 29 and 30 (Jest 30 rejects
        // the old --testPathPattern flag).
        { const jestArgs = ['jest', '--json'];
        if (filterByName) jestArgs.push(nameFilterArg('jest', testName!));
        jestArgs.push(jestExactPathPattern(testFile, cwd));
        return { command: npx, args: jestArgs }; }

      case 'mocha':
        // mocha --reporter json <abs file> --grep=<name>
        { const mochaArgs = ['mocha', '--reporter', 'json', runnerFilePath(testFile, cwd)];
        if (filterByName) mochaArgs.push(nameFilterArg('mocha', testName!));
        return { command: npx, args: mochaArgs }; }

      default:
        throw new Error(`Unsupported test runner: ${runner}`);
    }
  }

  /**
   * Spawn a test process and parse the result
   */
  private spawnTestProcess(
    command: string,
    args: string[],
    cwd: string,
    report?: VitestJsonReport,
    targetFile?: string
  ): Promise<RetryRunOutcome> {
    return new Promise((resolve, reject) => {
      const timeout = this.config.testTimeout;
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let termination: Promise<void> | undefined;
      const timeoutError = new Error(
        `Test execution timed out after ${timeout}ms for command: ${command} ${args.join(' ')}`
      );
      const settle = <T,>(fn: (value: T) => void, value: T): void => {
        report?.cleanup();
        fn(value);
      };

      // Note: shell: false (default) to prevent command injection (CWE-78)
      // Arguments are passed as array to avoid shell interpretation
      const proc = spawn(command, args, {
        cwd,
        detached: process.platform !== 'win32',
        env: { ...process.env, FORCE_COLOR: '0', CI: 'true' },
      });
      const untrackExit = trackTestRunnerExit(proc);

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        termination = terminateTestRunner(proc);
        termination.catch(error => {
          logger.warn(`Retry runner cleanup failed: ${toError(error).message}`);
          // A denied cleanup can leave the root alive: preserve the timeout
          // outcome immediately, keeping artifacts because settlement is unknown.
          reject(timeoutError);
        });
        termination.then(untrackExit, () => undefined);
      }, timeout);

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        clearTimeout(timeoutHandle);

        if (timedOut) {
          termination?.then(() => settle(reject, timeoutError), () => reject(timeoutError));
          return;
        }
        untrackExit();

        // Parse result based on exit code and output (Vitest writes the JSON
        // report to the --outputFile; read it back rather than trusting stdout).
        try {
          const reportText = report ? report.read(stdout) : stdout;
          if (reportText === undefined) {
            throw new Error('The current Vitest JSON report is missing for the retry run.');
          }
          settle(resolve, this.parseTestResult(code, reportText, stderr, targetFile));
        } catch (error) {
          settle(reject, toError(error));
        }
      });

      proc.on('error', (err: Error) => {
        clearTimeout(timeoutHandle);
        untrackExit();
        report?.cleanup();
        reject(new Error(
          `Failed to spawn test process: ${err.message}. ` +
          `Command: ${command} ${args.join(' ')}. ` +
          `Ensure the test runner is installed and accessible.`
        ));
      });
    });
  }

  /**
   * Parse test runner output to determine pass/fail status
   */
  private parseTestResult(
    exitCode: number | null,
    stdout: string,
    stderr: string,
    targetFile?: string
  ): RetryRunOutcome {
    // A retry can clear a prior failure only when the report proves a test
    // actually passed. Empty/fully skipped selections can also exit zero.
    try {
      // Vitest JSON output
      const vitestMatch = stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
      if (vitestMatch) {
        const result = safeJsonParse(vitestMatch[0]);
        // Vitest's positional file filter uses prefix matching. A passing
        // sibling must not clear a failure in the requested file (#972).
        const targetHas = (status: string): boolean => result.testResults?.some((file: {
          name?: string;
          assertionResults?: Array<{ status: string }>;
        }) => typeof file.name === 'string'
          && (!targetFile || sameTestFile(file.name, targetFile, this.config.cwd ?? process.cwd()))
          && file.assertionResults?.some(assertion => assertion.status === status)) === true;
        const targetPassed = !targetFile || targetHas('passed');
        const nothingRan = targetFile
          ? Array.isArray(result.testResults) && !targetPassed && !targetHas('failed')
          : result.numPassedTests === 0;
        if (nothingRan && result.numFailedTests === 0 && result.numFailedTestSuites === 0) {
          return UNMATCHED;
        }
        if (exitCode === 0 && result.success !== false
          && result.numFailedTests === 0 && result.numFailedTestSuites === 0
          && Number.isFinite(result.numPassedTests) && result.numPassedTests > 0
          && targetPassed) {
          return { passed: true };
        }
        const failedTest = result.testResults?.[0]?.assertionResults?.find(
          (r: { status: string }) => r.status === 'failed'
        );
        return {
          passed: false,
          error: failedTest?.failureMessages?.join('\n') || stderr
            || (exitCode === 0
              ? targetFile && !targetPassed
                ? `Retry runner did not report a passing test in ${targetFile}.`
                : 'Retry runner did not report any passing tests.'
              : `Test failed with exit code ${exitCode}`),
        };
      }

      // Jest JSON output
      const jestMatch = stdout.match(/\{[\s\S]*"numFailedTests"[\s\S]*\}/);
      if (jestMatch) {
        const result = safeJsonParse(jestMatch[0]);
        if (result.numPassedTests === 0 && result.numFailedTests === 0
          && result.numFailedTestSuites === 0) {
          return UNMATCHED;
        }
        if (exitCode === 0 && result.success !== false
          && result.numFailedTests === 0 && result.numFailedTestSuites === 0
          && Number.isFinite(result.numPassedTests) && result.numPassedTests > 0) {
          return { passed: true };
        }
        const failedTest = result.testResults?.[0]?.assertionResults?.find(
          (r: { status: string }) => r.status === 'failed'
        );
        return {
          passed: false,
          error: failedTest?.failureMessages?.join('\n') || stderr
            || (exitCode === 0 ? 'Retry runner did not report any passing tests.' : `Test failed with exit code ${exitCode}`),
        };
      }

      // Mocha JSON output
      const mochaMatch = stdout.match(/\{[\s\S]*"stats"[\s\S]*"failures"[\s\S]*\}/);
      if (mochaMatch) {
        const result = safeJsonParse(mochaMatch[0]);
        if (result.stats?.passes === 0 && result.stats?.failures === 0) return UNMATCHED;
        if (exitCode === 0 && result.stats?.failures === 0
          && Number.isFinite(result.stats?.passes) && result.stats.passes > 0) {
          return { passed: true };
        }
        const failure = result.failures?.[0];
        return {
          passed: false,
          error: failure?.err?.message || stderr
            || (exitCode === 0 ? 'Retry runner did not report any passing tests.' : `Test failed with exit code ${exitCode}`),
        };
      }
    } catch {
      // Unreadable output cannot prove that the retry executed a passing test.
    }

    if (exitCode === 0) return { passed: false, error: 'Retry runner did not report any passing tests.' };

    // Non-zero exit code means failure
    const errorOutput = stderr || stdout || `Test failed with exit code ${exitCode}`;
    return {
      passed: false,
      error: redactFailureText(errorOutput).substring(0, 1000), // Truncate long error messages
    };
  }

  private calculateDelay(
    attempt: number,
    backoff: 'linear' | 'exponential' | 'constant',
    baseDelay: number,
    maxDelay: number
  ): number {
    let delay: number;

    switch (backoff) {
      case 'constant':
        delay = baseDelay;
        break;

      case 'linear':
        delay = baseDelay * (attempt + 1);
        break;

      case 'exponential':
        delay = baseDelay * Math.pow(2, attempt);
        break;

      default:
        delay = baseDelay;
    }

    // Add jitter only when explicitly enabled
    if (this.config.enableJitter) {
      const jitter = delay * this.config.maxJitterPercent * secureRandom();
      delay += jitter;
    }

    return Math.min(delay, maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async recordRetry(testId: string, result: RetryTestResult): Promise<void> {
    const history = this.retryHistory.get(testId) ?? [];

    history.push({
      testId: result.testId,
      attempts: result.attempts,
      passed: result.passed,
      error: result.finalError,
      ...(result.unmatched ? { unmatched: true } : {}),
      timestamp: new Date(),
    });

    // Keep last 50 entries
    if (history.length > 50) {
      history.shift();
    }

    this.retryHistory.set(testId, history);

    await this.memory.set(`retry-history:${testId}`, history, {
      namespace: 'test-execution',
      persist: true,
    });
  }

  private convertToRetryStatistics(stats: RunRetryStats[]): RetryStatistics {
    const testStatsMap = new Map<string, TestRetryStats>();

    let totalRetries = 0;
    let successfulRetries = 0;
    let failedRetries = 0;
    let totalAttempts = 0;
    let passedCount = 0;

    for (const stat of stats) {
      totalRetries += stat.totalRetries;
      successfulRetries += stat.successful;
      failedRetries += stat.failed;
      totalAttempts += stat.totalRetries;

      if (stat.successful > 0) {
        passedCount += stat.successful;
      }
    }

    // Calculate retry rate (retries per test)
    const totalTests = successfulRetries + failedRetries;
    const retryRate = totalTests > 0 ? totalRetries / totalTests : 0;

    // Average attempts to pass (for tests that eventually passed)
    const averageAttemptsToPass = passedCount > 0 ? totalAttempts / passedCount : 0;

    return {
      totalRetries,
      successfulRetries,
      failedRetries,
      averageAttemptsToPass,
      retryRate,
      testStats: testStatsMap,
    };
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface RetryRecord {
  testId: string;
  attempts: number;
  passed: boolean;
  error?: string;
  /** The retry filter selected no test, so nothing was rerun (#1141). */
  unmatched?: boolean;
  timestamp: Date;
}

interface RetryTestResult {
  testId: string;
  passed: boolean;
  attempts: number;
  finalError?: string;
  unmatched?: boolean;
}

/** One retry run. `unmatched`: the runner reported that no test ran. */
interface RetryRunOutcome {
  passed: boolean;
  error?: string;
  unmatched?: boolean;
}

const UNMATCHED: RetryRunOutcome = {
  passed: false,
  unmatched: true,
  error: 'The retry filter matched no test, so nothing was rerun.',
};

interface RunRetryStats {
  runId: string;
  totalRetries: number;
  successful: number;
  failed: number;
  flakyDetected: string[];
  unmatched?: string[];
  startTime: number;
  endTime?: number;
}
