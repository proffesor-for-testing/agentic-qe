/**
 * Agentic QE v3 - Phase Executor
 * ADR-032: Time Crystal Scheduling
 *
 * Executes test phases with quality-gated progression.
 * Integrates with the test-execution domain for actual test running.
 *
 * IMPORTANT: For REAL test execution, provide a TestRunner implementation:
 * - VitestTestRunner: Executes tests via Vitest subprocess
 * - JestTestRunner: Executes tests via Jest subprocess
 *
 * See test-runner.ts for real implementations.
 * The simulateRun() method is MOCK MODE ONLY for development/testing.
 */

import { TestPhase, PhaseResult, PhaseThresholds } from './types';

/**
 * Test runner interface - abstracts actual test execution
 */
export interface TestRunner {
  /**
   * Run tests for specified types
   *
   * @param testTypes - Types of tests to run
   * @param options - Execution options
   * @returns Test execution results
   */
  run(
    testTypes: string[],
    options: TestRunnerOptions
  ): Promise<TestRunnerResult>;
}

/**
 * Test runner options
 */
export interface TestRunnerOptions {
  /** Maximum parallelism */
  parallelism: number;

  /** Timeout in milliseconds */
  timeout: number;

  /** Whether to collect coverage */
  collectCoverage: boolean;

  /** Whether to retry failed tests */
  retryFailed: boolean;

  /** Maximum retries for failed tests */
  maxRetries: number;

  /** Filter pattern for test files */
  filter?: string;
}

/**
 * Test runner result
 */
export interface TestRunnerResult {
  /** Total tests discovered */
  total: number;

  /** Tests that passed */
  passed: number;

  /** Tests that failed */
  failed: number;

  /** Tests that were skipped */
  skipped: number;

  /** Tests flagged as flaky */
  flaky: number;

  /** Code coverage percentage (0-1) */
  coverage: number;

  /** Execution duration in milliseconds */
  duration: number;

  /** Detailed test results (optional) */
  details?: TestDetail[];
}

/**
 * Individual test detail
 */
export interface TestDetail {
  /** Test name */
  name: string;

  /** Test file */
  file: string;

  /** Test status */
  status: 'passed' | 'failed' | 'skipped' | 'flaky';

  /** Duration in milliseconds */
  duration: number;

  /** Error message if failed */
  error?: string;

  /** Number of retries */
  retries?: number;
}

/**
 * Phase Executor
 *
 * Executes a test phase and evaluates quality gates.
 *
 * USAGE:
 * - For REAL tests: Provide a TestRunner (VitestTestRunner or JestTestRunner)
 * - For MOCK mode: Omit the runner (uses simulateRun with fake data - dev only)
 *
 * Example with real execution:
 * ```typescript
 * import { VitestTestRunner } from './test-runner';
 *
 * const runner = new VitestTestRunner({ cwd: '/path/to/project' });
 * const executor = new PhaseExecutor(phase, runner);
 * const result = await executor.run(); // REAL test results
 * ```
 */
export class PhaseExecutor {
  private readonly phase: TestPhase;
  private readonly runner?: TestRunner;
  private readonly timeout: number;
  private readonly mockMode: boolean;

  /**
   * Create a phase executor
   *
   * @param phase - The test phase to execute
   * @param runner - Test runner for REAL execution. If omitted, uses MOCK MODE.
   * @param timeout - Execution timeout (defaults to phase.expectedDuration * 2)
   */
  constructor(phase: TestPhase, runner?: TestRunner, timeout?: number) {
    this.phase = phase;
    this.runner = runner;
    this.timeout = timeout ?? phase.expectedDuration * 2;
    this.mockMode = !runner;

    if (this.mockMode) {
      console.warn(
        `[PhaseExecutor] MOCK MODE: No TestRunner provided for phase "${phase.name}". ` +
          `Results will be simulated with fake data. ` +
          `For production, use VitestTestRunner or JestTestRunner from test-runner.ts`
      );
    }
  }

  /**
   * Check if executor is in mock mode (no real test execution)
   */
  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Execute the phase
   *
   * @returns Phase execution result with quality gate evaluation
   */
  async run(): Promise<PhaseResult> {
    const startTime = Date.now();

    let runnerResult: TestRunnerResult;

    if (this.runner) {
      // Use real test runner
      runnerResult = await this.runner.run(
        this.phase.testTypes,
        {
          parallelism: this.phase.agentConfig.parallelism,
          timeout: this.timeout,
          collectCoverage: true,
          retryFailed: true,
          maxRetries: 2,
        }
      );
    } else {
      // Simulate test execution
      runnerResult = await this.simulateRun();
    }

    const duration = Date.now() - startTime;

    // Calculate metrics
    const passRate = runnerResult.total > 0
      ? runnerResult.passed / runnerResult.total
      : 0;

    const flakyRatio = runnerResult.total > 0
      ? runnerResult.flaky / runnerResult.total
      : 0;

    // Evaluate quality gates
    const qualityMet = this.evaluateQualityGates({
      passRate,
      flakyRatio,
      coverage: runnerResult.coverage,
    });

    return {
      phaseId: this.phase.id,
      phaseName: this.phase.name,
      passRate,
      flakyRatio,
      coverage: runnerResult.coverage,
      duration,
      testsRun: runnerResult.total,
      testsPassed: runnerResult.passed,
      testsFailed: runnerResult.failed,
      testsSkipped: runnerResult.skipped,
      qualityMet,
    };
  }

  /**
   * MOCK MODE: Simulate test execution with deterministic fake data.
   *
   * WARNING: This method returns FAKE data for development/testing only.
   * For REAL test execution, provide a TestRunner (VitestTestRunner or JestTestRunner).
   *
   * The fake data is deterministic based on phase configuration to allow
   * predictable testing of the scheduler logic without requiring actual tests.
   */
  private async simulateRun(): Promise<TestRunnerResult> {
    // Simulate some execution time (shortened for fast iteration)
    const simulatedDuration = Math.min(this.phase.expectedDuration / 10, 1000);
    await new Promise(resolve => setTimeout(resolve, simulatedDuration));

    // MOCK DATA: Deterministic values based on phase configuration
    // No Math.random() - values are predictable for testing
    const baseTests = this.getBaseTestCount();

    // Deterministic "variance" based on phase ID to simulate different scenarios
    const deterministicOffset = (this.phase.id % 3) * 5; // 0, 5, or 10
    const total = baseTests + deterministicOffset;

    // Deterministic pass rate based on phase type
    const basePassRate = this.getBasePassRate();
    const passed = Math.floor(total * basePassRate);
    const failed = Math.floor((total - passed) * 0.8); // 80% of non-passed are failures
    const skipped = total - passed - failed;

    // Deterministic flaky count: 1 per 50 tests
    const flaky = Math.floor(total / 50);

    // Deterministic coverage based on phase type
    const baseCoverage = this.getBaseCoverage();

    return {
      total,
      passed,
      failed,
      skipped,
      flaky,
      coverage: baseCoverage, // No random variance - deterministic
      duration: simulatedDuration,
    };
  }

  /**
   * Get base test count based on phase type
   */
  private getBaseTestCount(): number {
    const typeCounts: Record<string, number> = {
      unit: 100,
      integration: 50,
      e2e: 20,
      performance: 10,
      security: 15,
      visual: 25,
      accessibility: 30,
      contract: 40,
    };

    return this.phase.testTypes.reduce(
      (sum, type) => sum + (typeCounts[type] || 30),
      0
    );
  }

  /**
   * Get base pass rate based on phase type
   */
  private getBasePassRate(): number {
    // Unit tests have highest pass rate, E2E lowest
    if (this.phase.testTypes.includes('unit')) {
      return 0.98;
    }
    if (this.phase.testTypes.includes('integration')) {
      return 0.95;
    }
    if (this.phase.testTypes.includes('e2e')) {
      return 0.90;
    }
    return 0.93;
  }

  /**
   * Get base coverage based on phase type
   */
  private getBaseCoverage(): number {
    if (this.phase.testTypes.includes('unit')) {
      return 0.85;
    }
    if (this.phase.testTypes.includes('integration')) {
      return 0.75;
    }
    if (this.phase.testTypes.includes('e2e')) {
      return 0.65;
    }
    return 0.60;
  }

  /**
   * Evaluate quality gates
   *
   * @param metrics - Current metrics to evaluate
   * @returns True if all quality gates pass
   */
  private evaluateQualityGates(metrics: {
    passRate: number;
    flakyRatio: number;
    coverage: number;
  }): boolean {
    const thresholds = this.phase.qualityThresholds;

    // Check pass rate
    if (metrics.passRate < thresholds.minPassRate) {
      return false;
    }

    // Check flaky ratio
    if (metrics.flakyRatio > thresholds.maxFlakyRatio) {
      return false;
    }

    // Check coverage
    if (metrics.coverage < thresholds.minCoverage) {
      return false;
    }

    return true;
  }

  /**
   * Get the phase being executed
   */
  getPhase(): TestPhase {
    return this.phase;
  }
}

/**
 * Quality Gate Evaluator
 *
 * Standalone utility for evaluating quality gates
 */
export class QualityGateEvaluator {
  private readonly thresholds: PhaseThresholds;

  constructor(thresholds: PhaseThresholds) {
    this.thresholds = thresholds;
  }

  /**
   * Evaluate a phase result against thresholds
   */
  evaluate(result: PhaseResult): QualityGateResult {
    const gates: GateEvaluation[] = [];

    // Pass rate gate
    gates.push({
      name: 'Pass Rate',
      threshold: this.thresholds.minPassRate,
      actual: result.passRate,
      passed: result.passRate >= this.thresholds.minPassRate,
      comparison: 'gte',
    });

    // Flaky ratio gate
    gates.push({
      name: 'Flaky Ratio',
      threshold: this.thresholds.maxFlakyRatio,
      actual: result.flakyRatio,
      passed: result.flakyRatio <= this.thresholds.maxFlakyRatio,
      comparison: 'lte',
    });

    // Coverage gate
    gates.push({
      name: 'Coverage',
      threshold: this.thresholds.minCoverage,
      actual: result.coverage,
      passed: result.coverage >= this.thresholds.minCoverage,
      comparison: 'gte',
    });

    const allPassed = gates.every(g => g.passed);
    const failedGates = gates.filter(g => !g.passed);

    return {
      passed: allPassed,
      gates,
      failedGates,
      summary: allPassed
        ? 'All quality gates passed'
        : `${failedGates.length} quality gate(s) failed: ${failedGates.map(g => g.name).join(', ')}`,
    };
  }

  /**
   * Create a default evaluator for a phase
   */
  static forPhase(phase: TestPhase): QualityGateEvaluator {
    return new QualityGateEvaluator(phase.qualityThresholds);
  }
}

/**
 * Quality gate evaluation result
 */
export interface QualityGateResult {
  /** Whether all gates passed */
  passed: boolean;

  /** Individual gate evaluations */
  gates: GateEvaluation[];

  /** Gates that failed */
  failedGates: GateEvaluation[];

  /** Human-readable summary */
  summary: string;
}

/**
 * Individual gate evaluation
 */
export interface GateEvaluation {
  /** Gate name */
  name: string;

  /** Threshold value */
  threshold: number;

  /** Actual value */
  actual: number;

  /** Whether gate passed */
  passed: boolean;

  /** Comparison type */
  comparison: 'gte' | 'lte' | 'eq';
}

/**
 * Create a mock test runner for testing
 */
export function createMockTestRunner(
  resultOverrides?: Partial<TestRunnerResult>
): TestRunner {
  return {
    async run(
      testTypes: string[],
      _options: TestRunnerOptions
    ): Promise<TestRunnerResult> {
      // Base results on test types
      const baseTotal = testTypes.length * 25;
      const defaultResult: TestRunnerResult = {
        total: baseTotal,
        passed: Math.floor(baseTotal * 0.95),
        failed: Math.floor(baseTotal * 0.03),
        skipped: Math.floor(baseTotal * 0.02),
        flaky: 1,
        coverage: 0.85,
        duration: 1000,
      };

      return {
        ...defaultResult,
        ...resultOverrides,
      };
    },
  };
}

/**
 * Create a failing test runner for testing error paths
 */
export function createFailingTestRunner(
  passRate: number = 0.5,
  coverage: number = 0.3
): TestRunner {
  return {
    async run(
      testTypes: string[],
      _options: TestRunnerOptions
    ): Promise<TestRunnerResult> {
      const total = testTypes.length * 25;
      const passed = Math.floor(total * passRate);

      return {
        total,
        passed,
        failed: total - passed,
        skipped: 0,
        flaky: 5,
        coverage,
        duration: 1000,
      };
    },
  };
}
