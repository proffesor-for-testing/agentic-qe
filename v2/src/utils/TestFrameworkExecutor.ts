/**
 * TestFrameworkExecutor - Real test execution via child_process
 *
 * Replaces mock test execution with actual framework integration.
 * Supports Jest, Mocha, Playwright with proper output parsing.
 *
 * @version 1.0.0
 * @priority P0
 */

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface TestFrameworkConfig {
  framework: 'jest' | 'mocha' | 'playwright' | 'cypress';
  testPattern?: string;
  workingDir: string;
  timeout?: number;
  coverage?: boolean;
  environment?: string;
  config?: string;
}

export interface TestExecutionResult {
  framework: string;
  status: 'passed' | 'failed' | 'timeout' | 'error';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
  tests: TestCaseResult[];
  coverage?: CoverageData;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

export interface TestCaseResult {
  name: string;
  fullName: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  failureMessages?: string[];
  ancestorTitles?: string[];
}

export interface CoverageData {
  lines: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  files: Record<string, FileCoverage>;
}

export interface FileCoverage {
  lines: { pct: number };
  statements: { pct: number };
  functions: { pct: number };
  branches: { pct: number };
}

/**
 * Error with optional code property (e.g., ENOENT)
 */
interface NodeError extends Error {
  code?: string;
}

/**
 * Jest test result structure
 */
interface JestTestResult {
  title: string;
  fullName?: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration?: number;
  failureMessages?: string[];
  ancestorTitles?: string[];
}

/**
 * Jest suite result structure
 */
interface JestSuiteResult {
  assertionResults?: JestTestResult[];
}

/**
 * Jest JSON output structure
 */
interface JestJsonResult {
  testResults?: JestSuiteResult[];
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  coverageMap?: Record<string, JestFileCoverage>;
}

/**
 * Jest coverage data for a file
 */
interface JestFileCoverage {
  l?: { pct?: number; total?: number; covered?: number };
  s?: { pct?: number; total?: number; covered?: number };
  f?: { pct?: number; total?: number; covered?: number };
  b?: { pct?: number; total?: number; covered?: number };
}

/**
 * Mocha test result structure
 */
interface MochaTestResult {
  title: string;
  fullTitle?: string;
  pass?: boolean;
  pending?: boolean;
  duration?: number;
  err?: { message?: string };
}

/**
 * Mocha JSON output structure
 */
interface MochaJsonResult {
  tests?: MochaTestResult[];
  stats?: {
    tests?: number;
    passes?: number;
    failures?: number;
    pending?: number;
    duration?: number;
  };
}

/**
 * Playwright test structure
 */
interface PlaywrightTest {
  status: string;
  results?: Array<{
    duration?: number;
    error?: { message?: string };
  }>;
}

/**
 * Playwright spec structure
 */
interface PlaywrightSpec {
  title: string;
  tests?: PlaywrightTest[];
}

/**
 * Playwright suite structure
 */
interface PlaywrightSuite {
  title: string;
  specs?: PlaywrightSpec[];
}

/**
 * Playwright JSON output structure
 */
interface PlaywrightJsonResult {
  suites?: PlaywrightSuite[];
}

/**
 * Cypress test structure
 */
interface CypressTest {
  title: string[];
  state: 'passed' | 'failed' | 'skipped' | 'pending';
  duration?: number;
  err?: { message?: string };
}

/**
 * Cypress run structure
 */
interface CypressRun {
  tests?: CypressTest[];
}

/**
 * Cypress JSON output structure
 */
interface CypressJsonResult {
  runs?: CypressRun[];
  totalTests?: number;
  totalPassed?: number;
  totalFailed?: number;
  totalSkipped?: number;
  totalDuration?: number;
}

/**
 * Real test framework executor using child_process
 */
export class TestFrameworkExecutor {
  private static readonly FRAMEWORK_COMMANDS = {
    jest: 'npx',
    mocha: 'npx',
    playwright: 'npx',
    cypress: 'npx'
  };

  private static readonly FRAMEWORK_ARGS = {
    jest: (config: TestFrameworkConfig): string[] => {
      const args = ['jest', '--json', '--testLocationInResults'];
      if (config.coverage) args.push('--coverage', '--coverageReporters=json');
      if (config.testPattern) args.push(config.testPattern);
      if (config.config) args.push('--config', config.config);
      args.push('--no-cache', '--runInBand'); // Deterministic execution
      return args;
    },
    mocha: (config: TestFrameworkConfig): string[] => {
      const args = ['mocha', '--reporter', 'json'];
      if (config.testPattern) args.push(config.testPattern);
      else args.push('**/*.test.js', '**/*.spec.js');
      if (config.config) args.push('--config', config.config);
      return args;
    },
    playwright: (config: TestFrameworkConfig): string[] => {
      const args = ['playwright', 'test', '--reporter=json'];
      if (config.testPattern) args.push(config.testPattern);
      if (config.config) args.push('--config', config.config);
      return args;
    },
    cypress: (config: TestFrameworkConfig): string[] => {
      const args = ['cypress', 'run', '--reporter', 'json'];
      if (config.testPattern) args.push('--spec', config.testPattern);
      if (config.config) args.push('--config-file', config.config);
      return args;
    }
  };

  /**
   * Execute tests with a specific framework
   */
  async execute(config: TestFrameworkConfig): Promise<TestExecutionResult> {
    const startTime = Date.now();
    const command = TestFrameworkExecutor.FRAMEWORK_COMMANDS[config.framework];
    const args = TestFrameworkExecutor.FRAMEWORK_ARGS[config.framework](config);

    console.log(`[TestExecutor] Running: ${command} ${args.join(' ')}`);
    console.log(`[TestExecutor] Working directory: ${config.workingDir}`);

    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;
    let timedOut = false;

    try {
      // Verify working directory exists
      await this.verifyWorkingDirectory(config.workingDir);

      // Check if framework is available
      await this.checkFrameworkAvailable(config.framework, config.workingDir);

      const child = spawn(command, args, {
        cwd: config.workingDir,
        env: {
          ...process.env,
          NODE_ENV: config.environment || 'test',
          CI: 'true', // Disable interactive prompts
          FORCE_COLOR: '0' // Disable color codes
        },
        shell: false
      });

      // Set timeout
      const timeout = config.timeout || 300000; // 5 minutes default
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000); // Force kill after 5s
      }, timeout);

      // Capture output
      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        console.log(`[TestExecutor] stdout: ${text.slice(0, 200)}`);
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        console.error(`[TestExecutor] stderr: ${text.slice(0, 200)}`);
      });

      // Wait for process to complete
      exitCode = await new Promise<number>((resolve, reject) => {
        child.on('close', (code) => {
          clearTimeout(timeoutHandle);
          resolve(code ?? 1);
        });

        child.on('error', (error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
      });

      const duration = Date.now() - startTime;

      if (timedOut) {
        return this.createTimeoutResult(config, stdout, stderr, duration);
      }

      // Parse results based on framework
      const result = await this.parseResults(
        config.framework,
        stdout,
        stderr,
        exitCode,
        duration,
        config
      );

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      return this.createErrorResult(
        config,
        error as Error,
        stdout,
        stderr,
        duration
      );
    }
  }

  /**
   * Detect test framework from package.json
   */
  async detectFramework(workingDir: string): Promise<'jest' | 'mocha' | 'playwright' | 'cypress' | null> {
    try {
      const packageJsonPath = path.join(workingDir, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Check in priority order
      if (allDeps['jest'] || allDeps['@jest/core']) return 'jest';
      if (allDeps['mocha']) return 'mocha';
      if (allDeps['playwright'] || allDeps['@playwright/test']) return 'playwright';
      if (allDeps['cypress']) return 'cypress';

      return null;
    } catch (error) {
      console.warn('[TestExecutor] Could not detect framework:', error);
      return null;
    }
  }

  /**
   * Verify working directory exists and is accessible
   */
  private async verifyWorkingDirectory(workingDir: string): Promise<void> {
    try {
      const stat = await fs.stat(workingDir);
      if (!stat.isDirectory()) {
        throw new Error(`Working directory is not a directory: ${workingDir}`);
      }
    } catch (error) {
      throw new Error(`Working directory does not exist or is not accessible: ${workingDir}`);
    }
  }

  /**
   * Check if test framework is available
   */
  private async checkFrameworkAvailable(
    framework: string,
    workingDir: string
  ): Promise<void> {
    try {
      const packageJsonPath = path.join(workingDir, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      const frameworkMappings: Record<string, string[]> = {
        jest: ['jest', '@jest/core'],
        mocha: ['mocha'],
        playwright: ['playwright', '@playwright/test'],
        cypress: ['cypress']
      };

      const requiredPackages = frameworkMappings[framework] || [framework];
      const hasFramework = requiredPackages.some(pkg => allDeps[pkg]);

      if (!hasFramework) {
        throw new Error(
          `Framework '${framework}' not found in package.json dependencies. ` +
          `Please install: ${requiredPackages.join(' or ')}`
        );
      }
    } catch (error) {
      if ((error as NodeError).code === 'ENOENT') {
        throw new Error(`package.json not found in ${workingDir}`);
      }
      throw error;
    }
  }

  /**
   * Parse test results based on framework
   */
  private async parseResults(
    framework: string,
    stdout: string,
    stderr: string,
    exitCode: number,
    duration: number,
    config: TestFrameworkConfig
  ): Promise<TestExecutionResult> {
    const parser = this.getParser(framework);
    return parser(stdout, stderr, exitCode, duration, config);
  }

  /**
   * Get parser function for framework
   */
  private getParser(framework: string): (
    stdout: string,
    stderr: string,
    exitCode: number,
    duration: number,
    config: TestFrameworkConfig
  ) => Promise<TestExecutionResult> {
    switch (framework) {
      case 'jest':
        return this.parseJestResults.bind(this);
      case 'mocha':
        return this.parseMochaResults.bind(this);
      case 'playwright':
        return this.parsePlaywrightResults.bind(this);
      case 'cypress':
        return this.parseCypressResults.bind(this);
      default:
        return this.parseGenericResults.bind(this);
    }
  }

  /**
   * Parse Jest JSON output
   */
  private async parseJestResults(
    stdout: string,
    stderr: string,
    exitCode: number,
    duration: number,
    config: TestFrameworkConfig
  ): Promise<TestExecutionResult> {
    try {
      // Jest outputs JSON to stdout
      const jsonOutput = this.extractJSON(stdout);
      if (!jsonOutput) {
        throw new Error('Could not find JSON output in Jest results');
      }

      const jestResult = JSON.parse(jsonOutput) as JestJsonResult;
      const tests: TestCaseResult[] = [];

      // Parse test results
      jestResult.testResults?.forEach((suiteResult: JestSuiteResult) => {
        suiteResult.assertionResults?.forEach((testResult: JestTestResult) => {
          tests.push({
            name: testResult.title,
            fullName: testResult.fullName || testResult.title,
            status: testResult.status,
            duration: testResult.duration || 0,
            failureMessages: testResult.failureMessages,
            ancestorTitles: testResult.ancestorTitles
          });
        });
      });

      // Parse coverage if available
      let coverage: CoverageData | undefined;
      if (config.coverage && jestResult.coverageMap) {
        coverage = this.parseJestCoverage(jestResult.coverageMap);
      }

      return {
        framework: 'jest',
        status: exitCode === 0 ? 'passed' : 'failed',
        totalTests: jestResult.numTotalTests || tests.length,
        passedTests: jestResult.numPassedTests || tests.filter(t => t.status === 'passed').length,
        failedTests: jestResult.numFailedTests || tests.filter(t => t.status === 'failed').length,
        skippedTests: jestResult.numPendingTests || tests.filter(t => t.status === 'skipped' || t.status === 'pending').length,
        duration,
        tests,
        coverage,
        stdout,
        stderr,
        exitCode
      };
    } catch (error) {
      console.error('[TestExecutor] Failed to parse Jest results:', error);
      return this.parseGenericResults(stdout, stderr, exitCode, duration, config);
    }
  }

  /**
   * Parse Mocha JSON output
   */
  private async parseMochaResults(
    stdout: string,
    stderr: string,
    exitCode: number,
    duration: number,
    config: TestFrameworkConfig
  ): Promise<TestExecutionResult> {
    try {
      const jsonOutput = this.extractJSON(stdout);
      if (!jsonOutput) {
        throw new Error('Could not find JSON output in Mocha results');
      }

      const mochaResult = JSON.parse(jsonOutput) as MochaJsonResult;
      const tests: TestCaseResult[] = [];

      // Parse test results
      mochaResult.tests?.forEach((testResult: MochaTestResult) => {
        tests.push({
          name: testResult.title,
          fullName: testResult.fullTitle || testResult.title,
          status: testResult.pass ? 'passed' : testResult.pending ? 'pending' : 'failed',
          duration: testResult.duration || 0,
          failureMessages: testResult.err?.message ? [testResult.err.message] : undefined
        });
      });

      const stats = mochaResult.stats || {};

      return {
        framework: 'mocha',
        status: exitCode === 0 ? 'passed' : 'failed',
        totalTests: stats.tests || tests.length,
        passedTests: stats.passes || tests.filter(t => t.status === 'passed').length,
        failedTests: stats.failures || tests.filter(t => t.status === 'failed').length,
        skippedTests: stats.pending || tests.filter(t => t.status === 'pending').length,
        duration: stats.duration || duration,
        tests,
        stdout,
        stderr,
        exitCode
      };
    } catch (error) {
      console.error('[TestExecutor] Failed to parse Mocha results:', error);
      return this.parseGenericResults(stdout, stderr, exitCode, duration, config);
    }
  }

  /**
   * Parse Playwright JSON output
   */
  private async parsePlaywrightResults(
    stdout: string,
    stderr: string,
    exitCode: number,
    duration: number,
    config: TestFrameworkConfig
  ): Promise<TestExecutionResult> {
    try {
      const jsonOutput = this.extractJSON(stdout);
      if (!jsonOutput) {
        throw new Error('Could not find JSON output in Playwright results');
      }

      const playwrightResult = JSON.parse(jsonOutput) as PlaywrightJsonResult;
      const tests: TestCaseResult[] = [];

      // Parse test results
      playwrightResult.suites?.forEach((suite: PlaywrightSuite) => {
        suite.specs?.forEach((spec: PlaywrightSpec) => {
          const test = spec.tests?.[0];
          if (test) {
            tests.push({
              name: spec.title,
              fullName: `${suite.title} > ${spec.title}`,
              status: test.status === 'expected' ? 'passed' :
                      test.status === 'skipped' ? 'skipped' : 'failed',
              duration: test.results?.[0]?.duration || 0,
              failureMessages: test.results?.[0]?.error?.message ? [test.results[0].error.message] : undefined
            });
          }
        });
      });

      return {
        framework: 'playwright',
        status: exitCode === 0 ? 'passed' : 'failed',
        totalTests: tests.length,
        passedTests: tests.filter(t => t.status === 'passed').length,
        failedTests: tests.filter(t => t.status === 'failed').length,
        skippedTests: tests.filter(t => t.status === 'skipped').length,
        duration,
        tests,
        stdout,
        stderr,
        exitCode
      };
    } catch (error) {
      console.error('[TestExecutor] Failed to parse Playwright results:', error);
      return this.parseGenericResults(stdout, stderr, exitCode, duration, config);
    }
  }

  /**
   * Parse Cypress JSON output
   */
  private async parseCypressResults(
    stdout: string,
    stderr: string,
    exitCode: number,
    duration: number,
    config: TestFrameworkConfig
  ): Promise<TestExecutionResult> {
    try {
      const jsonOutput = this.extractJSON(stdout);
      if (!jsonOutput) {
        throw new Error('Could not find JSON output in Cypress results');
      }

      const cypressResult = JSON.parse(jsonOutput) as CypressJsonResult;
      const tests: TestCaseResult[] = [];

      // Parse test results
      cypressResult.runs?.forEach((run: CypressRun) => {
        run.tests?.forEach((test: CypressTest) => {
          tests.push({
            name: test.title.join(' '),
            fullName: test.title.join(' > '),
            status: test.state,
            duration: test.duration || 0,
            failureMessages: test.err?.message ? [test.err.message] : undefined
          });
        });
      });

      const stats = cypressResult.totalTests ? {
        total: cypressResult.totalTests,
        passed: cypressResult.totalPassed,
        failed: cypressResult.totalFailed,
        skipped: cypressResult.totalSkipped
      } : null;

      return {
        framework: 'cypress',
        status: exitCode === 0 ? 'passed' : 'failed',
        totalTests: stats?.total || tests.length,
        passedTests: stats?.passed || tests.filter(t => t.status === 'passed').length,
        failedTests: stats?.failed || tests.filter(t => t.status === 'failed').length,
        skippedTests: stats?.skipped || tests.filter(t => t.status === 'skipped' || t.status === 'pending').length,
        duration: cypressResult.totalDuration || duration,
        tests,
        stdout,
        stderr,
        exitCode
      };
    } catch (error) {
      console.error('[TestExecutor] Failed to parse Cypress results:', error);
      return this.parseGenericResults(stdout, stderr, exitCode, duration, config);
    }
  }

  /**
   * Generic results parser (fallback)
   */
  private async parseGenericResults(
    stdout: string,
    stderr: string,
    exitCode: number,
    duration: number,
    config: TestFrameworkConfig
  ): Promise<TestExecutionResult> {
    // Attempt to extract basic test counts from output
    const passedMatch = stdout.match(/(\d+)\s+passing/);
    const failedMatch = stdout.match(/(\d+)\s+failing/);
    const skippedMatch = stdout.match(/(\d+)\s+pending/);

    const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
    const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;

    return {
      framework: config.framework,
      status: exitCode === 0 ? 'passed' : 'failed',
      totalTests: passed + failed + skipped,
      passedTests: passed,
      failedTests: failed,
      skippedTests: skipped,
      duration,
      tests: [],
      stdout,
      stderr,
      exitCode
    };
  }

  /**
   * Extract JSON from output (handles noise before/after JSON)
   */
  private extractJSON(output: string): string | null {
    // Find JSON start and end
    const jsonStart = output.indexOf('{');
    const jsonEnd = output.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
      return null;
    }

    return output.substring(jsonStart, jsonEnd + 1);
  }

  /**
   * Parse Jest coverage data
   */
  private parseJestCoverage(coverageMap: Record<string, JestFileCoverage>): CoverageData {
    const files: Record<string, FileCoverage> = {};
    let totalLines = 0, coveredLines = 0;
    let totalStatements = 0, coveredStatements = 0;
    let totalFunctions = 0, coveredFunctions = 0;
    let totalBranches = 0, coveredBranches = 0;

    Object.keys(coverageMap).forEach(filePath => {
      const fileCoverage = coverageMap[filePath];

      files[filePath] = {
        lines: { pct: fileCoverage.l?.pct || 0 },
        statements: { pct: fileCoverage.s?.pct || 0 },
        functions: { pct: fileCoverage.f?.pct || 0 },
        branches: { pct: fileCoverage.b?.pct || 0 }
      };

      totalLines += fileCoverage.l?.total || 0;
      coveredLines += fileCoverage.l?.covered || 0;
      totalStatements += fileCoverage.s?.total || 0;
      coveredStatements += fileCoverage.s?.covered || 0;
      totalFunctions += fileCoverage.f?.total || 0;
      coveredFunctions += fileCoverage.f?.covered || 0;
      totalBranches += fileCoverage.b?.total || 0;
      coveredBranches += fileCoverage.b?.covered || 0;
    });

    return {
      lines: {
        total: totalLines,
        covered: coveredLines,
        pct: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0
      },
      statements: {
        total: totalStatements,
        covered: coveredStatements,
        pct: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0
      },
      functions: {
        total: totalFunctions,
        covered: coveredFunctions,
        pct: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0
      },
      branches: {
        total: totalBranches,
        covered: coveredBranches,
        pct: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0
      },
      files
    };
  }

  /**
   * Create timeout result
   */
  private createTimeoutResult(
    config: TestFrameworkConfig,
    stdout: string,
    stderr: string,
    duration: number
  ): TestExecutionResult {
    return {
      framework: config.framework,
      status: 'timeout',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      duration,
      tests: [],
      stdout,
      stderr,
      exitCode: null,
      error: `Test execution timed out after ${config.timeout || 300000}ms`
    };
  }

  /**
   * Create error result
   */
  private createErrorResult(
    config: TestFrameworkConfig,
    error: Error,
    stdout: string,
    stderr: string,
    duration: number
  ): TestExecutionResult {
    return {
      framework: config.framework,
      status: 'error',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      duration,
      tests: [],
      stdout,
      stderr,
      exitCode: null,
      error: error.message
    };
  }
}
