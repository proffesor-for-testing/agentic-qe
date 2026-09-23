/**
 * Vitest Phase Executor
 *
 * A REAL test executor that actually runs tests using Vitest.
 * No simulation. No fake data. Real test execution.
 */

import { execFile, spawn, type ChildProcess } from 'child_process';
import type {
  TestPhase,
  PhaseResult,
  TestResult,
  PhaseExecutor,
} from '../interfaces';
import type { FlakyTestTracker } from '../flaky-tracking/flaky-tracker';
import { safeJsonParse } from '../../shared/safe-json.js';
import { createVitestJsonReport } from '../../shared/vitest-json-report.js';

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

  /** Grace period before forcefully stopping a test process tree. */
  terminationGraceMs?: number;
}

interface ActiveCommand {
  terminate(reason: Error): Promise<void>;
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
  private currentCommand: ActiveCommand | null = null;

  constructor(private readonly config: VitestConfig = {}) {}

  // --------------------------------------------------------------------------
  // PhaseExecutor Interface
  // --------------------------------------------------------------------------

  async execute(phase: TestPhase, testFiles?: string[]): Promise<PhaseResult> {
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
    await this.currentCommand?.terminate(new Error('Test execution aborted'));
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
    // Vitest 5 writes --reporter=json output to a file instead of stdout; an
    // explicit --outputFile gives Vitest 4 and 5 the same contract.
    const report = createVitestJsonReport();
    let document: string;
    let exitCode: number;
    try {
      const run = await this.runCommand(
        this.config.vitestPath || 'npx',
        [...args, ...report.args],
        timeoutMs
      );
      exitCode = run.exitCode;
      document = report.read(run.stdout);
    } finally {
      report.cleanup();
    }

    // Parse JSON report from Vitest
    try {
      const jsonStart = document.indexOf('{');
      const jsonEnd = document.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON output from Vitest');
      }

      const jsonStr = document.slice(jsonStart, jsonEnd + 1);
      return safeJsonParse(jsonStr);
    } catch {
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
    if (this.currentCommand) {
      return Promise.reject(new Error('Test executor already has an active process'));
    }

    // shell: false prevents argument injection. A fresh POSIX process group
    // lets cancellation reach npx, Vitest, and the workers it started.
    const executable = process.platform === 'win32' && command === 'npx' ? 'npx.cmd' : command;
    const child = spawn(executable, args, {
      cwd: this.config.cwd || process.cwd(),
      env: { ...process.env, ...this.config.env },
      shell: false,
      detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    let exitCode = 1;
    let terminalError: Error | undefined;
    let terminationError: unknown;
    let termination: Promise<void> | undefined;
    let rejectTermination!: (error: unknown) => void;
    const terminationFailed = new Promise<never>((_, reject) => { rejectTermination = reject; });
    child.stdout?.on('data', data => { stdout += data.toString(); });
    child.stderr?.on('data', data => { stderr += data.toString(); });

    const closed = new Promise<void>((resolve, reject) => {
      child.once('close', code => { exitCode = code ?? 1; resolve(); });
      child.once('error', reject);
    });
    const active: ActiveCommand = {
      terminate: (reason) => {
        terminalError ??= reason;
        termination ??= this.terminateProcessTree(child, closed).catch(error => {
          terminationError = error;
          rejectTermination(error);
          throw error;
        });
        return termination;
      },
    };
    this.currentCommand = active;
    const timeout = setTimeout(() => {
      void active.terminate(new Error(`Test execution timed out after ${timeoutMs}ms`)).catch(() => {});
    }, timeoutMs);

    return (async () => {
      try {
        // A failed kill must settle the phase even if the child never closes.
        await Promise.race([closed, terminationFailed]);
        if (termination) await termination;
        if (terminalError) throw terminalError;
        return { stdout, stderr, exitCode };
      } finally {
        clearTimeout(timeout);
        // A failed kill leaves an unknown survivor. Keep this executor closed
        // to new work rather than replacing the only handle to that tree.
        if (this.currentCommand === active && !terminationError) this.currentCommand = null;
      }
    })();
  }

  private async terminateProcessTree(child: ChildProcess, closed: Promise<void>): Promise<void> {
    const pid = child.pid;
    if (!pid) {
      await closed;
      return;
    }

    if (process.platform === 'win32') {
      // taskkill /T follows the descendant tree; killing only npx.cmd leaves
      // its Vitest child running. There is no POSIX-style process group here.
      await new Promise<void>((resolve, reject) => {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: 2000 }, error => {
          if (error) reject(error);
          else resolve();
        });
      });
      await this.waitForClose(closed, 2000);
      return;
    }

    this.signalGroup(pid, 'SIGTERM');
    const requestedGrace = this.config.terminationGraceMs;
    const graceMs = requestedGrace !== undefined && Number.isFinite(requestedGrace)
      ? Math.max(0, Math.min(requestedGrace, 30_000))
      : 1000;
    if (!await this.waitForGroupExit(pid, graceMs)) {
      this.signalGroup(pid, 'SIGKILL');
      if (!await this.waitForGroupExit(pid, 2000)) {
        throw new Error(`Test process group ${pid} survived SIGKILL`);
      }
    }
    await this.waitForClose(closed, 2000);
  }

  private signalGroup(pid: number, signal: NodeJS.Signals): void {
    try {
      if (!process.kill(-pid, signal)) throw new Error(`Failed to send ${signal} to test process group ${pid}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }

  private async waitForGroupExit(pid: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        process.kill(-pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true;
        throw error;
      }
      if (Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }

  private async waitForClose(closed: Promise<void>, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Test process did not close after termination')), timeoutMs);
      closed.then(() => { clearTimeout(timer); resolve(); }, error => { clearTimeout(timer); reject(error); });
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
      const coverage = safeJsonParse(content);

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
