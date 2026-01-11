/**
 * Agentic QE v3 - Real Test Runner Implementations
 * ADR-032: Time Crystal Scheduling
 *
 * Provides real test execution via Vitest and Jest subprocess calls.
 * Parses actual JSON test output - NO Math.random() fake results.
 *
 * IMPORTANT: These runners execute REAL tests and return REAL results.
 * For development/testing without real test execution, use createMockTestRunner()
 * from phase-executor.ts which is clearly marked as mock mode.
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  TestRunner,
  TestRunnerOptions,
  TestRunnerResult,
  TestDetail,
} from './phase-executor';

/**
 * Error thrown when test execution fails
 */
export class TestExecutionError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
    public readonly command: string
  ) {
    super(message);
    this.name = 'TestExecutionError';
  }
}

/**
 * Error thrown when test output cannot be parsed
 */
export class TestOutputParseError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: string,
    public readonly framework: string
  ) {
    super(message);
    this.name = 'TestOutputParseError';
  }
}

/**
 * Configuration for subprocess test runners
 */
export interface SubprocessTestRunnerConfig {
  /** Working directory for test execution */
  cwd: string;

  /** Path to node_modules/.bin or custom binary location */
  binPath?: string;

  /** Additional environment variables */
  env?: Record<string, string>;

  /** Path to write JSON output (default: temp file) */
  jsonOutputPath?: string;

  /** Whether to collect coverage data */
  collectCoverage?: boolean;

  /** Coverage output directory */
  coverageDir?: string;

  /** Test file patterns to match */
  testMatch?: string[];

  /** Files/patterns to exclude */
  testExclude?: string[];
}

/**
 * Vitest JSON reporter output structure
 */
interface VitestJsonOutput {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  startTime: number;
  success: boolean;
  testResults: VitestTestFileResult[];
}

interface VitestTestFileResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  startTime: number;
  endTime: number;
  assertionResults: VitestAssertionResult[];
}

interface VitestAssertionResult {
  ancestorTitles: string[];
  fullName: string;
  status: 'passed' | 'failed' | 'pending' | 'todo';
  title: string;
  duration: number;
  failureMessages: string[];
}

/**
 * Jest JSON reporter output structure
 */
interface JestJsonOutput {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  startTime: number;
  success: boolean;
  testResults: JestTestFileResult[];
  coverageMap?: JestCoverageMap;
}

interface JestTestFileResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  startTime: number;
  endTime: number;
  assertionResults: JestAssertionResult[];
}

interface JestAssertionResult {
  ancestorTitles: string[];
  fullName: string;
  status: 'passed' | 'failed' | 'pending' | 'todo';
  title: string;
  duration: number | null;
  failureMessages: string[];
}

interface JestCoverageMap {
  [filePath: string]: {
    s: Record<string, number>; // statements
    b: Record<string, number[]>; // branches
    f: Record<string, number>; // functions
  };
}

/**
 * Coverage summary structure (from Istanbul)
 */
interface CoverageSummary {
  lines: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
}

/**
 * Base class for subprocess-based test runners
 */
abstract class SubprocessTestRunner implements TestRunner {
  protected readonly config: SubprocessTestRunnerConfig;

  constructor(config: SubprocessTestRunnerConfig) {
    this.config = {
      ...config,
      cwd: resolve(config.cwd),
    };
  }

  /**
   * Run tests for specified types
   */
  abstract run(
    testTypes: string[],
    options: TestRunnerOptions
  ): Promise<TestRunnerResult>;

  /**
   * Execute a command and capture output
   */
  protected executeCommand(
    command: string,
    args: string[],
    timeout: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolvePromise, reject) => {
      const env = {
        ...process.env,
        ...this.config.env,
        // Force non-interactive mode
        CI: 'true',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      };

      const child: ChildProcess = spawn(command, args, {
        cwd: this.config.cwd,
        env,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Set timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        reject(
          new TestExecutionError(
            `Failed to spawn test process: ${error.message}`,
            null,
            stderr,
            `${command} ${args.join(' ')}`
          )
        );
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timeoutId);

        if (killed) {
          reject(
            new TestExecutionError(
              `Test execution timed out after ${timeout}ms`,
              code,
              stderr,
              `${command} ${args.join(' ')}`
            )
          );
          return;
        }

        resolvePromise({ stdout, stderr, exitCode: code });
      });
    });
  }

  /**
   * Get test file patterns for given test types
   */
  protected getTestPatterns(testTypes: string[]): string[] {
    const patterns: string[] = [];

    for (const type of testTypes) {
      switch (type) {
        case 'unit':
          patterns.push('**/*.unit.test.{ts,tsx,js,jsx}');
          patterns.push('**/*.spec.{ts,tsx,js,jsx}');
          patterns.push('**/unit/**/*.test.{ts,tsx,js,jsx}');
          break;
        case 'integration':
          patterns.push('**/*.integration.test.{ts,tsx,js,jsx}');
          patterns.push('**/integration/**/*.test.{ts,tsx,js,jsx}');
          break;
        case 'e2e':
          patterns.push('**/*.e2e.test.{ts,tsx,js,jsx}');
          patterns.push('**/e2e/**/*.test.{ts,tsx,js,jsx}');
          break;
        case 'performance':
          patterns.push('**/*.perf.test.{ts,tsx,js,jsx}');
          patterns.push('**/performance/**/*.test.{ts,tsx,js,jsx}');
          break;
        case 'security':
          patterns.push('**/*.security.test.{ts,tsx,js,jsx}');
          patterns.push('**/security/**/*.test.{ts,tsx,js,jsx}');
          break;
        case 'visual':
          patterns.push('**/*.visual.test.{ts,tsx,js,jsx}');
          patterns.push('**/visual/**/*.test.{ts,tsx,js,jsx}');
          break;
        case 'accessibility':
          patterns.push('**/*.a11y.test.{ts,tsx,js,jsx}');
          patterns.push('**/accessibility/**/*.test.{ts,tsx,js,jsx}');
          break;
        case 'contract':
          patterns.push('**/*.contract.test.{ts,tsx,js,jsx}');
          patterns.push('**/contract/**/*.test.{ts,tsx,js,jsx}');
          break;
        default:
          // Default: match by directory or file prefix
          patterns.push(`**/${type}/**/*.test.{ts,tsx,js,jsx}`);
          patterns.push(`**/*.${type}.test.{ts,tsx,js,jsx}`);
      }
    }

    // Add custom patterns if configured
    if (this.config.testMatch) {
      patterns.push(...this.config.testMatch);
    }

    // Dedupe patterns
    return Array.from(new Set(patterns));
  }

  /**
   * Read coverage summary from coverage-summary.json
   */
  protected readCoverageSummary(): number {
    const coverageDir = this.config.coverageDir || join(this.config.cwd, 'coverage');
    const summaryPath = join(coverageDir, 'coverage-summary.json');

    if (!existsSync(summaryPath)) {
      return 0;
    }

    try {
      const content = readFileSync(summaryPath, 'utf-8');
      const summary = JSON.parse(content) as { total?: CoverageSummary };

      if (summary.total) {
        // Average of lines, statements, functions, branches
        const { lines, statements, functions, branches } = summary.total;
        const avgPct =
          (lines.pct + statements.pct + functions.pct + branches.pct) / 4;
        return avgPct / 100; // Convert percentage to 0-1 scale
      }
    } catch {
      // Coverage parsing failed, return 0
    }

    return 0;
  }
}

/**
 * Vitest Test Runner
 *
 * Executes tests using Vitest and parses JSON reporter output.
 * Returns REAL test results - no fake data.
 */
export class VitestTestRunner extends SubprocessTestRunner {
  /**
   * Run tests using Vitest
   */
  async run(
    testTypes: string[],
    options: TestRunnerOptions
  ): Promise<TestRunnerResult> {
    const startTime = Date.now();

    // Build vitest command arguments
    const args: string[] = [
      'vitest',
      'run', // Non-watch mode
      '--reporter=json',
    ];

    // Add parallelism options
    if (options.parallelism > 1) {
      args.push(`--pool=threads`);
      args.push(`--poolOptions.threads.maxThreads=${options.parallelism}`);
    } else {
      args.push('--no-threads');
    }

    // Add coverage if requested
    if (options.collectCoverage) {
      args.push('--coverage');
      args.push('--coverage.reporter=json-summary');
      if (this.config.coverageDir) {
        args.push(`--coverage.reportsDirectory=${this.config.coverageDir}`);
      }
    }

    // Add retry for failed tests
    if (options.retryFailed && options.maxRetries > 0) {
      args.push(`--retry=${options.maxRetries}`);
    }

    // Add test file patterns
    if (options.filter) {
      args.push(options.filter);
    } else {
      const patterns = this.getTestPatterns(testTypes);
      if (patterns.length > 0) {
        // Vitest uses positional args for patterns
        args.push(...patterns);
      }
    }

    // Execute vitest
    const binPath = this.config.binPath || 'npx';
    const result = await this.executeCommand(binPath, args, options.timeout);

    // Parse JSON output
    return this.parseVitestOutput(result.stdout, startTime, options);
  }

  /**
   * Parse Vitest JSON output into TestRunnerResult
   */
  private parseVitestOutput(
    stdout: string,
    startTime: number,
    options: TestRunnerOptions
  ): TestRunnerResult {
    // Extract JSON from output (vitest outputs JSON to stdout with --reporter=json)
    let jsonOutput: VitestJsonOutput;

    try {
      // Find JSON object in output (may have other text before/after)
      const jsonMatch = stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON output found in vitest output');
      }
      jsonOutput = JSON.parse(jsonMatch[0]) as VitestJsonOutput;
    } catch (error) {
      throw new TestOutputParseError(
        `Failed to parse Vitest JSON output: ${(error as Error).message}`,
        stdout,
        'vitest'
      );
    }

    // Count flaky tests (tests that passed after retry)
    let flakyCount = 0;
    const details: TestDetail[] = [];

    for (const file of jsonOutput.testResults) {
      for (const assertion of file.assertionResults) {
        const testDetail: TestDetail = {
          name: assertion.fullName || assertion.title,
          file: file.name,
          status: this.mapVitestStatus(assertion.status),
          duration: assertion.duration || 0,
          error:
            assertion.failureMessages.length > 0
              ? assertion.failureMessages.join('\n')
              : undefined,
        };

        // Check for flaky (would need retry info from vitest)
        // Vitest marks retried tests differently - for now, count tests that have
        // failure messages but eventually passed
        if (
          assertion.status === 'passed' &&
          assertion.failureMessages.length > 0
        ) {
          flakyCount++;
          testDetail.status = 'flaky';
        }

        details.push(testDetail);
      }
    }

    // Get coverage if collected
    let coverage = 0;
    if (options.collectCoverage) {
      coverage = this.readCoverageSummary();
    }

    const duration = Date.now() - startTime;

    return {
      total: jsonOutput.numTotalTests,
      passed: jsonOutput.numPassedTests,
      failed: jsonOutput.numFailedTests,
      skipped: jsonOutput.numPendingTests + jsonOutput.numTodoTests,
      flaky: flakyCount,
      coverage,
      duration,
      details,
    };
  }

  /**
   * Map Vitest status to our status type
   */
  private mapVitestStatus(
    status: 'passed' | 'failed' | 'pending' | 'todo'
  ): 'passed' | 'failed' | 'skipped' | 'flaky' {
    switch (status) {
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'pending':
      case 'todo':
        return 'skipped';
    }
  }
}

/**
 * Jest Test Runner
 *
 * Executes tests using Jest and parses JSON output.
 * Returns REAL test results - no fake data.
 */
export class JestTestRunner extends SubprocessTestRunner {
  /**
   * Run tests using Jest
   */
  async run(
    testTypes: string[],
    options: TestRunnerOptions
  ): Promise<TestRunnerResult> {
    const startTime = Date.now();

    // Build jest command arguments
    const args: string[] = [
      'jest',
      '--json',
      '--forceExit',
      '--detectOpenHandles',
    ];

    // Add parallelism options
    if (options.parallelism > 1) {
      args.push(`--maxWorkers=${options.parallelism}`);
    } else {
      args.push('--runInBand');
    }

    // Add coverage if requested
    if (options.collectCoverage) {
      args.push('--coverage');
      args.push('--coverageReporters=json-summary');
      if (this.config.coverageDir) {
        args.push(`--coverageDirectory=${this.config.coverageDir}`);
      }
    }

    // Add test file patterns
    if (options.filter) {
      args.push(options.filter);
    } else {
      const patterns = this.getTestPatterns(testTypes);
      if (patterns.length > 0) {
        // Jest uses --testPathPattern for filtering
        const regexPattern = patterns
          .map((p) => p.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'))
          .join('|');
        args.push(`--testPathPattern=${regexPattern}`);
      }
    }

    // Execute jest
    const binPath = this.config.binPath || 'npx';
    const result = await this.executeCommand(binPath, args, options.timeout);

    // Parse JSON output
    return this.parseJestOutput(
      result.stdout,
      result.stderr,
      startTime,
      options
    );
  }

  /**
   * Parse Jest JSON output into TestRunnerResult
   */
  private parseJestOutput(
    stdout: string,
    stderr: string,
    startTime: number,
    options: TestRunnerOptions
  ): TestRunnerResult {
    let jsonOutput: JestJsonOutput;

    try {
      // Jest outputs JSON to stdout with --json flag
      // Sometimes the JSON is mixed with other output
      const combinedOutput = stdout || stderr;
      const jsonMatch = combinedOutput.match(
        /\{[\s\S]*"numTotalTests"[\s\S]*\}/
      );
      if (!jsonMatch) {
        throw new Error('No JSON output found in jest output');
      }
      jsonOutput = JSON.parse(jsonMatch[0]) as JestJsonOutput;
    } catch (error) {
      throw new TestOutputParseError(
        `Failed to parse Jest JSON output: ${(error as Error).message}`,
        stdout + stderr,
        'jest'
      );
    }

    // Build test details and count flaky tests
    let flakyCount = 0;
    const details: TestDetail[] = [];

    for (const file of jsonOutput.testResults) {
      for (const assertion of file.assertionResults) {
        const testDetail: TestDetail = {
          name: assertion.fullName || assertion.title,
          file: file.name,
          status: this.mapJestStatus(assertion.status),
          duration: assertion.duration || 0,
          error:
            assertion.failureMessages.length > 0
              ? assertion.failureMessages.join('\n')
              : undefined,
        };

        details.push(testDetail);
      }
    }

    // Get coverage if collected
    let coverage = 0;
    if (options.collectCoverage) {
      coverage = this.readCoverageSummary();
    }

    const duration = Date.now() - startTime;

    return {
      total: jsonOutput.numTotalTests,
      passed: jsonOutput.numPassedTests,
      failed: jsonOutput.numFailedTests,
      skipped: jsonOutput.numPendingTests + jsonOutput.numTodoTests,
      flaky: flakyCount,
      coverage,
      duration,
      details,
    };
  }

  /**
   * Map Jest status to our status type
   */
  private mapJestStatus(
    status: 'passed' | 'failed' | 'pending' | 'todo'
  ): 'passed' | 'failed' | 'skipped' | 'flaky' {
    switch (status) {
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'pending':
      case 'todo':
        return 'skipped';
    }
  }
}

/**
 * Auto-detect which test runner is available in the project
 */
export function detectTestRunner(
  cwd: string
): 'vitest' | 'jest' | null {
  const resolvedCwd = resolve(cwd);

  // Check for vitest config files
  const vitestConfigs = [
    'vitest.config.ts',
    'vitest.config.js',
    'vitest.config.mts',
    'vitest.config.mjs',
  ];

  for (const config of vitestConfigs) {
    if (existsSync(join(resolvedCwd, config))) {
      return 'vitest';
    }
  }

  // Check for jest config files
  const jestConfigs = [
    'jest.config.ts',
    'jest.config.js',
    'jest.config.json',
    'jest.config.mjs',
  ];

  for (const config of jestConfigs) {
    if (existsSync(join(resolvedCwd, config))) {
      return 'jest';
    }
  }

  // Check package.json for test runner dependencies
  const packageJsonPath = join(resolvedCwd, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const content = readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content) as {
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      };

      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      if (allDeps['vitest']) {
        return 'vitest';
      }
      if (allDeps['jest']) {
        return 'jest';
      }
    } catch {
      // Failed to parse package.json
    }
  }

  return null;
}

/**
 * Create a test runner based on auto-detection or explicit framework choice
 *
 * @param config - Subprocess test runner configuration
 * @param framework - Optional: force a specific framework ('vitest' | 'jest')
 * @returns A configured TestRunner instance
 * @throws Error if no test runner can be detected
 */
export function createTestRunner(
  config: SubprocessTestRunnerConfig,
  framework?: 'vitest' | 'jest'
): TestRunner {
  const detectedFramework = framework || detectTestRunner(config.cwd);

  if (!detectedFramework) {
    throw new Error(
      `No test runner detected in ${config.cwd}. ` +
        `Please install vitest or jest, or specify the framework explicitly.`
    );
  }

  switch (detectedFramework) {
    case 'vitest':
      return new VitestTestRunner(config);
    case 'jest':
      return new JestTestRunner(config);
    default:
      throw new Error(`Unsupported test framework: ${detectedFramework}`);
  }
}

/**
 * Convenience function to run tests with auto-detected framework
 *
 * @param cwd - Working directory containing tests
 * @param testTypes - Types of tests to run
 * @param options - Test runner options (optional, uses defaults)
 * @returns Test execution results
 */
export async function runTests(
  cwd: string,
  testTypes: string[],
  options?: Partial<TestRunnerOptions>
): Promise<TestRunnerResult> {
  const runner = createTestRunner({ cwd });

  const fullOptions: TestRunnerOptions = {
    parallelism: 4,
    timeout: 300000, // 5 minutes default
    collectCoverage: true,
    retryFailed: true,
    maxRetries: 2,
    ...options,
  };

  return runner.run(testTypes, fullOptions);
}
