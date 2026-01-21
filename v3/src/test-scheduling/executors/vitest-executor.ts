/**
 * Vitest Phase Executor
 *
 * A REAL test executor that actually runs tests using Vitest.
 * No simulation. No fake data. Real test execution.
 */

import { spawn, type ChildProcess } from 'child_process';
import type {
  TestPhase,
  PhaseResult,
  TestResult,
  PhaseExecutor,
} from '../interfaces';
import type { FlakyTestTracker } from '../flaky-tracking/flaky-tracker';

// ============================================================================
// Types
// ============================================================================

export interface VitestConfig {
  /** Path to vitest binary (default: npx vitest) */
  vitestPath?: string;

  /** Working directory for test execution */
  cwd?: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Coverage reporter (default: json) */
  coverageReporter?: 'json' | 'lcov' | 'text' | 'html';

  /** Output directory for coverage */
  coverageDir?: string;

  /** Extra CLI arguments */
  extraArgs?: string[];

  /**
   * FlakyTracker instance for historical flakiness detection.
   * NOTE: Vitest JSON reporter doesn't include retry data, so flakiness
   * is detected historically by tracking pass/fail patterns over time.
   */
  flakyTracker?: FlakyTestTracker;
}

interface VitestJsonResult {
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  success: boolean;
  startTime: number;
  testResults: VitestTestFile[];
}

interface VitestTestFile {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  startTime: number;
  endTime: number;
  assertionResults: VitestAssertion[];
}

interface VitestAssertion {
  ancestorTitles: string[];
  fullName: string;
  status: 'passed' | 'failed' | 'skipped';
  title: string;
  duration: number;
  failureMessages: string[];
}

// ============================================================================
// Vitest Executor Implementation
// ============================================================================

export class VitestPhaseExecutor implements PhaseExecutor {
  private currentProcess: ChildProcess | null = null;
  private isAborted = false;

  constructor(private readonly config: VitestConfig = {}) {}

  // --------------------------------------------------------------------------
  // PhaseExecutor Interface
  // --------------------------------------------------------------------------

  async execute(phase: TestPhase, testFiles?: string[]): Promise<PhaseResult> {
    this.isAborted = false;
    const startTime = Date.now();

    try {
      const args = this.buildArgs(phase, testFiles);
      const result = await this.runVitest(args, phase.timeoutMs);
      const endTime = Date.now();

      return this.parseResult(phase, result, endTime - startTime);
    } catch (error) {
      const endTime = Date.now();
      return this.createErrorResult(phase, error as Error, endTime - startTime);
    }
  }

  async isReady(): Promise<boolean> {
    try {
      // Check if vitest is available
      const result = await this.runCommand('npx', ['vitest', '--version'], 5000);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  getName(): string {
    return 'vitest-executor';
  }

  async abort(): Promise<void> {
    this.isAborted = true;
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private buildArgs(phase: TestPhase, testFiles?: string[]): string[] {
    const args = ['vitest', 'run', '--reporter=json'];

    // Add test patterns or specific files
    if (testFiles && testFiles.length > 0) {
      args.push(...testFiles);
    } else {
      // Use phase patterns
      for (const pattern of phase.testPatterns) {
        if (pattern.startsWith('!')) {
          args.push('--exclude', pattern.slice(1));
        } else {
          args.push(pattern);
        }
      }
    }

    // Parallelism
    if (phase.parallelism > 0) {
      args.push('--pool', 'threads');
      args.push('--poolOptions.threads.maxThreads', String(phase.parallelism));
    }

    // Fail fast
    if (phase.failFast) {
      args.push('--bail', '1');
    }

    // Coverage
    args.push('--coverage');
    args.push('--coverage.reporter', this.config.coverageReporter || 'json');
    if (this.config.coverageDir) {
      args.push('--coverage.reportsDirectory', this.config.coverageDir);
    }

    // Extra args
    if (this.config.extraArgs) {
      args.push(...this.config.extraArgs);
    }

    return args;
  }

  private async runVitest(args: string[], timeoutMs: number): Promise<VitestJsonResult> {
    const { stdout, exitCode } = await this.runCommand(
      this.config.vitestPath || 'npx',
      args,
      timeoutMs
    );

    // Parse JSON output from Vitest
    try {
      // Vitest outputs JSON to stdout when using --reporter=json
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON output from Vitest');
      }

      const jsonStr = stdout.slice(jsonStart, jsonEnd + 1);
      return JSON.parse(jsonStr);
    } catch (parseError) {
      // If JSON parsing fails, create a basic result from exit code
      return {
        numTotalTestSuites: 0,
        numPassedTestSuites: 0,
        numFailedTestSuites: 0,
        numTotalTests: 0,
        numPassedTests: 0,
        numFailedTests: 0,
        numPendingTests: 0,
        success: exitCode === 0,
        startTime: Date.now(),
        testResults: [],
      };
    }
  }

  private runCommand(
    command: string,
    args: string[],
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      this.currentProcess = spawn(command, args, {
        cwd: this.config.cwd || process.cwd(),
        env: { ...process.env, ...this.config.env },
        shell: true,
      });

      const timeout = setTimeout(() => {
        this.currentProcess?.kill('SIGTERM');
        reject(new Error(`Test execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.currentProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      this.currentProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      this.currentProcess.on('close', (code) => {
        clearTimeout(timeout);
        this.currentProcess = null;

        if (this.isAborted) {
          reject(new Error('Test execution aborted'));
        } else {
          resolve({ stdout, stderr, exitCode: code ?? 1 });
        }
      });

      this.currentProcess.on('error', (error) => {
        clearTimeout(timeout);
        this.currentProcess = null;
        reject(error);
      });
    });
  }

  private async parseResult(
    phase: TestPhase,
    vitestResult: VitestJsonResult,
    durationMs: number
  ): Promise<PhaseResult> {
    const testResults: TestResult[] = [];

    for (const file of vitestResult.testResults) {
      for (const assertion of file.assertionResults) {
        const testResult: TestResult = {
          file: file.name,
          name: assertion.title,
          suite: assertion.ancestorTitles.join(' > '),
          passed: assertion.status === 'passed',
          durationMs: assertion.duration || 0,
          // NOTE: Vitest JSON reporter doesn't include retry data.
          // Flakiness is detected historically via FlakyTracker.
          retries: 0,
          error: assertion.failureMessages.join('\n') || undefined,
        };
        testResults.push(testResult);
      }
    }

    // Record results in FlakyTracker for historical analysis
    // This builds up flakiness data over multiple runs
    const tracker = this.config.flakyTracker;
    if (tracker) {
      tracker.recordResults(testResults);
    }

    const totalTests = vitestResult.numTotalTests;
    const passed = vitestResult.numPassedTests;
    const failed = vitestResult.numFailedTests;
    const skipped = vitestResult.numPendingTests;

    const passRate = totalTests > 0 ? passed / totalTests : 0;

    // Get flaky tests and ratio from historical tracker data
    let flakyTests: string[] = [];
    let flakyRatio = 0;

    if (tracker) {
      const analysis = tracker.analyze();
      flakyTests = analysis.flakyTests.map((r) => r.testId);
      // Calculate ratio of tests in this run that are known to be flaky
      const runTestIds = new Set(
        testResults.map((r) => `${r.file}:${r.suite}:${r.name}`)
      );
      const flakyInRun = flakyTests.filter((id) => runTestIds.has(id));
      flakyRatio = totalTests > 0 ? flakyInRun.length / totalTests : 0;
    }

    // Get coverage from coverage report
    const coverage = await this.getCoverageFromReport();

    const success =
      passRate >= phase.thresholds.minPassRate &&
      flakyRatio <= phase.thresholds.maxFlakyRatio &&
      coverage >= phase.thresholds.minCoverage;

    return {
      phaseId: phase.id,
      phaseName: phase.name,
      success,
      passRate,
      flakyRatio,
      coverage,
      durationMs,
      totalTests,
      passed,
      failed,
      skipped,
      testResults,
      flakyTests,
    };
  }

  private async getCoverageFromReport(): Promise<number> {
    // Try to read coverage from JSON report
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const coverageDir = this.config.coverageDir || 'coverage';
      const coverageFile = path.join(
        this.config.cwd || process.cwd(),
        coverageDir,
        'coverage-summary.json'
      );

      const content = await fs.readFile(coverageFile, 'utf-8');
      const coverage = JSON.parse(content);

      // Return line coverage percentage
      return (coverage.total?.lines?.pct ?? 0) / 100;
    } catch {
      // Coverage file not available
      return 0;
    }
  }

  private createErrorResult(
    phase: TestPhase,
    error: Error,
    durationMs: number
  ): PhaseResult {
    return {
      phaseId: phase.id,
      phaseName: phase.name,
      success: false,
      passRate: 0,
      flakyRatio: 0,
      coverage: 0,
      durationMs,
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      testResults: [],
      flakyTests: [],
      error: error.message,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Vitest executor with configuration
 */
export function createVitestExecutor(config?: VitestConfig): VitestPhaseExecutor {
  return new VitestPhaseExecutor(config);
}
