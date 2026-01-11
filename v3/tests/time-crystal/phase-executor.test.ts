/**
 * Agentic QE v3 - Phase Executor Tests
 * ADR-032: Time Crystal Scheduling
 *
 * Tests for phase execution and quality gate evaluation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PhaseExecutor,
  QualityGateEvaluator,
  createMockTestRunner,
  createFailingTestRunner,
  TestRunner,
  TestRunnerOptions,
  TestRunnerResult,
} from '../../src/time-crystal/phase-executor';
import {
  TestPhase,
  PhaseResult,
} from '../../src/time-crystal/types';

describe('PhaseExecutor', () => {
  const testPhase: TestPhase = {
    id: 0,
    name: 'Unit',
    testTypes: ['unit'],
    expectedDuration: 30000,
    qualityThresholds: {
      minPassRate: 0.95,
      maxFlakyRatio: 0.05,
      minCoverage: 0.80,
    },
    agentConfig: {
      agents: ['qe-test-executor'],
      parallelism: 8,
    },
  };

  describe('constructor', () => {
    it('should create executor with phase', () => {
      const executor = new PhaseExecutor(testPhase);

      expect(executor.getPhase()).toBe(testPhase);
    });

    it('should accept custom test runner', () => {
      const runner = createMockTestRunner();
      const executor = new PhaseExecutor(testPhase, runner);

      expect(executor.getPhase()).toBe(testPhase);
    });

    it('should accept custom timeout', () => {
      const executor = new PhaseExecutor(testPhase, undefined, 60000);

      expect(executor.getPhase()).toBeDefined();
    });
  });

  describe('run', () => {
    it('should execute phase and return result', async () => {
      const executor = new PhaseExecutor(testPhase);

      const result = await executor.run();

      expect(result.phaseId).toBe(0);
      expect(result.phaseName).toBe('Unit');
      expect(typeof result.passRate).toBe('number');
      expect(typeof result.flakyRatio).toBe('number');
      expect(typeof result.coverage).toBe('number');
      expect(typeof result.duration).toBe('number');
      expect(typeof result.testsRun).toBe('number');
      expect(typeof result.testsPassed).toBe('number');
      expect(typeof result.testsFailed).toBe('number');
      expect(typeof result.qualityMet).toBe('boolean');
    });

    it('should use custom test runner', async () => {
      const runner = createMockTestRunner({
        total: 100,
        passed: 98,
        failed: 2,
        skipped: 0,
        flaky: 1,
        coverage: 0.90,
        duration: 5000,
      });

      const executor = new PhaseExecutor(testPhase, runner);
      const result = await executor.run();

      expect(result.testsRun).toBe(100);
      expect(result.testsPassed).toBe(98);
      expect(result.testsFailed).toBe(2);
      expect(result.coverage).toBe(0.90);
    });

    it('should evaluate quality gates', async () => {
      const runner = createMockTestRunner({
        total: 100,
        passed: 99,
        failed: 1,
        skipped: 0,
        flaky: 1,
        coverage: 0.85,
        duration: 1000,
      });

      const executor = new PhaseExecutor(testPhase, runner);
      const result = await executor.run();

      // 99% pass rate, 1% flaky, 85% coverage - should pass all gates
      expect(result.qualityMet).toBe(true);
    });

    it('should fail quality gate on low pass rate', async () => {
      const runner = createMockTestRunner({
        total: 100,
        passed: 80, // 80% pass rate, below 95% threshold
        failed: 20,
        skipped: 0,
        flaky: 2,
        coverage: 0.90,
        duration: 1000,
      });

      const executor = new PhaseExecutor(testPhase, runner);
      const result = await executor.run();

      expect(result.qualityMet).toBe(false);
    });

    it('should fail quality gate on high flaky ratio', async () => {
      const runner = createMockTestRunner({
        total: 100,
        passed: 97,
        failed: 3,
        skipped: 0,
        flaky: 10, // 10% flaky, above 5% threshold
        coverage: 0.90,
        duration: 1000,
      });

      const executor = new PhaseExecutor(testPhase, runner);
      const result = await executor.run();

      expect(result.qualityMet).toBe(false);
    });

    it('should fail quality gate on low coverage', async () => {
      const runner = createMockTestRunner({
        total: 100,
        passed: 99,
        failed: 1,
        skipped: 0,
        flaky: 1,
        coverage: 0.50, // 50% coverage, below 80% threshold
        duration: 1000,
      });

      const executor = new PhaseExecutor(testPhase, runner);
      const result = await executor.run();

      expect(result.qualityMet).toBe(false);
    });

    it('should handle zero tests', async () => {
      const runner = createMockTestRunner({
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flaky: 0,
        coverage: 0,
        duration: 100,
      });

      const executor = new PhaseExecutor(testPhase, runner);
      const result = await executor.run();

      expect(result.testsRun).toBe(0);
      expect(result.passRate).toBe(0);
    });
  });

  describe('simulated execution', () => {
    it('should produce realistic results for unit tests', async () => {
      const unitPhase: TestPhase = {
        ...testPhase,
        testTypes: ['unit'],
      };

      const executor = new PhaseExecutor(unitPhase);
      const result = await executor.run();

      // Unit tests should have higher pass rate and coverage
      expect(result.testsRun).toBeGreaterThan(50);
      expect(result.passRate).toBeGreaterThan(0.9);
      expect(result.coverage).toBeGreaterThan(0.7);
    });

    it('should produce realistic results for e2e tests', async () => {
      const e2ePhase: TestPhase = {
        ...testPhase,
        name: 'E2E',
        testTypes: ['e2e'],
        qualityThresholds: {
          minPassRate: 0.85,
          maxFlakyRatio: 0.15,
          minCoverage: 0.50,
        },
      };

      const executor = new PhaseExecutor(e2ePhase);
      const result = await executor.run();

      // E2E tests should have lower counts
      expect(result.testsRun).toBeGreaterThan(0);
      expect(typeof result.passRate).toBe('number');
    });

    it('should produce realistic results for integration tests', async () => {
      const integrationPhase: TestPhase = {
        ...testPhase,
        name: 'Integration',
        testTypes: ['integration', 'contract'],
      };

      const executor = new PhaseExecutor(integrationPhase);
      const result = await executor.run();

      expect(result.testsRun).toBeGreaterThan(30);
    });
  });
});

describe('QualityGateEvaluator', () => {
  const thresholds = {
    minPassRate: 0.95,
    maxFlakyRatio: 0.05,
    minCoverage: 0.80,
  };

  describe('evaluate', () => {
    it('should pass all gates when thresholds are met', () => {
      const evaluator = new QualityGateEvaluator(thresholds);

      const result: PhaseResult = {
        phaseId: 0,
        phaseName: 'Test',
        passRate: 0.98,
        flakyRatio: 0.02,
        coverage: 0.85,
        duration: 1000,
        testsRun: 100,
        testsPassed: 98,
        testsFailed: 2,
        testsSkipped: 0,
        qualityMet: true,
      };

      const evaluation = evaluator.evaluate(result);

      expect(evaluation.passed).toBe(true);
      expect(evaluation.failedGates).toHaveLength(0);
      expect(evaluation.gates).toHaveLength(3);
    });

    it('should fail on low pass rate', () => {
      const evaluator = new QualityGateEvaluator(thresholds);

      const result: PhaseResult = {
        phaseId: 0,
        phaseName: 'Test',
        passRate: 0.90, // Below 0.95
        flakyRatio: 0.02,
        coverage: 0.85,
        duration: 1000,
        testsRun: 100,
        testsPassed: 90,
        testsFailed: 10,
        testsSkipped: 0,
        qualityMet: false,
      };

      const evaluation = evaluator.evaluate(result);

      expect(evaluation.passed).toBe(false);
      expect(evaluation.failedGates).toHaveLength(1);
      expect(evaluation.failedGates[0].name).toBe('Pass Rate');
    });

    it('should fail on high flaky ratio', () => {
      const evaluator = new QualityGateEvaluator(thresholds);

      const result: PhaseResult = {
        phaseId: 0,
        phaseName: 'Test',
        passRate: 0.98,
        flakyRatio: 0.10, // Above 0.05
        coverage: 0.85,
        duration: 1000,
        testsRun: 100,
        testsPassed: 98,
        testsFailed: 2,
        testsSkipped: 0,
        qualityMet: false,
      };

      const evaluation = evaluator.evaluate(result);

      expect(evaluation.passed).toBe(false);
      expect(evaluation.failedGates.some(g => g.name === 'Flaky Ratio')).toBe(true);
    });

    it('should fail on low coverage', () => {
      const evaluator = new QualityGateEvaluator(thresholds);

      const result: PhaseResult = {
        phaseId: 0,
        phaseName: 'Test',
        passRate: 0.98,
        flakyRatio: 0.02,
        coverage: 0.70, // Below 0.80
        duration: 1000,
        testsRun: 100,
        testsPassed: 98,
        testsFailed: 2,
        testsSkipped: 0,
        qualityMet: false,
      };

      const evaluation = evaluator.evaluate(result);

      expect(evaluation.passed).toBe(false);
      expect(evaluation.failedGates.some(g => g.name === 'Coverage')).toBe(true);
    });

    it('should detect multiple failures', () => {
      const evaluator = new QualityGateEvaluator(thresholds);

      const result: PhaseResult = {
        phaseId: 0,
        phaseName: 'Test',
        passRate: 0.80, // Below 0.95
        flakyRatio: 0.15, // Above 0.05
        coverage: 0.50, // Below 0.80
        duration: 1000,
        testsRun: 100,
        testsPassed: 80,
        testsFailed: 20,
        testsSkipped: 0,
        qualityMet: false,
      };

      const evaluation = evaluator.evaluate(result);

      expect(evaluation.passed).toBe(false);
      expect(evaluation.failedGates).toHaveLength(3);
    });

    it('should provide correct gate details', () => {
      const evaluator = new QualityGateEvaluator(thresholds);

      const result: PhaseResult = {
        phaseId: 0,
        phaseName: 'Test',
        passRate: 0.92,
        flakyRatio: 0.03,
        coverage: 0.82,
        duration: 1000,
        testsRun: 100,
        testsPassed: 92,
        testsFailed: 8,
        testsSkipped: 0,
        qualityMet: false,
      };

      const evaluation = evaluator.evaluate(result);
      const passRateGate = evaluation.gates.find(g => g.name === 'Pass Rate');

      expect(passRateGate).toBeDefined();
      expect(passRateGate!.threshold).toBe(0.95);
      expect(passRateGate!.actual).toBe(0.92);
      expect(passRateGate!.passed).toBe(false);
      expect(passRateGate!.comparison).toBe('gte');
    });

    it('should generate correct summary', () => {
      const evaluator = new QualityGateEvaluator(thresholds);

      const passingResult: PhaseResult = {
        phaseId: 0,
        phaseName: 'Test',
        passRate: 0.98,
        flakyRatio: 0.02,
        coverage: 0.85,
        duration: 1000,
        testsRun: 100,
        testsPassed: 98,
        testsFailed: 2,
        testsSkipped: 0,
        qualityMet: true,
      };

      const failingResult: PhaseResult = {
        ...passingResult,
        passRate: 0.80,
        qualityMet: false,
      };

      const passingEval = evaluator.evaluate(passingResult);
      const failingEval = evaluator.evaluate(failingResult);

      expect(passingEval.summary).toBe('All quality gates passed');
      expect(failingEval.summary).toContain('quality gate(s) failed');
      expect(failingEval.summary).toContain('Pass Rate');
    });
  });

  describe('forPhase', () => {
    it('should create evaluator from phase', () => {
      const phase: TestPhase = {
        id: 0,
        name: 'Test',
        testTypes: ['unit'],
        expectedDuration: 1000,
        qualityThresholds: {
          minPassRate: 0.99,
          maxFlakyRatio: 0.01,
          minCoverage: 0.90,
        },
        agentConfig: { agents: [], parallelism: 1 },
      };

      const evaluator = QualityGateEvaluator.forPhase(phase);

      // Verify it uses the phase's thresholds
      const result: PhaseResult = {
        phaseId: 0,
        phaseName: 'Test',
        passRate: 0.98, // Below 0.99
        flakyRatio: 0,
        coverage: 0.95,
        duration: 1000,
        testsRun: 100,
        testsPassed: 98,
        testsFailed: 2,
        testsSkipped: 0,
        qualityMet: false,
      };

      const evaluation = evaluator.evaluate(result);

      expect(evaluation.passed).toBe(false);
    });
  });
});

describe('createMockTestRunner', () => {
  it('should create runner with default results', async () => {
    const runner = createMockTestRunner();

    const result = await runner.run(['unit'], {
      parallelism: 4,
      timeout: 10000,
      collectCoverage: true,
      retryFailed: true,
      maxRetries: 2,
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.passed).toBeLessThanOrEqual(result.total);
    expect(result.coverage).toBeGreaterThan(0);
  });

  it('should accept result overrides', async () => {
    const runner = createMockTestRunner({
      total: 200,
      passed: 195,
      failed: 5,
      coverage: 0.92,
    });

    const result = await runner.run(['unit', 'integration'], {
      parallelism: 4,
      timeout: 10000,
      collectCoverage: true,
      retryFailed: false,
      maxRetries: 0,
    });

    expect(result.total).toBe(200);
    expect(result.passed).toBe(195);
    expect(result.failed).toBe(5);
    expect(result.coverage).toBe(0.92);
  });
});

describe('createFailingTestRunner', () => {
  it('should create runner with low pass rate', async () => {
    const runner = createFailingTestRunner(0.5, 0.3);

    const result = await runner.run(['unit'], {
      parallelism: 4,
      timeout: 10000,
      collectCoverage: true,
      retryFailed: true,
      maxRetries: 2,
    });

    expect(result.passed / result.total).toBeCloseTo(0.5, 1);
    expect(result.coverage).toBe(0.3);
  });

  it('should use default values', async () => {
    const runner = createFailingTestRunner();

    const result = await runner.run(['unit'], {
      parallelism: 1,
      timeout: 5000,
      collectCoverage: false,
      retryFailed: false,
      maxRetries: 0,
    });

    expect(result.passed / result.total).toBeCloseTo(0.5, 1);
    expect(result.coverage).toBe(0.3);
  });
});

describe('Mock Mode Detection', () => {
  const testPhase: TestPhase = {
    id: 0,
    name: 'Unit',
    testTypes: ['unit'],
    expectedDuration: 30000,
    qualityThresholds: {
      minPassRate: 0.95,
      maxFlakyRatio: 0.05,
      minCoverage: 0.80,
    },
    agentConfig: {
      agents: ['qe-test-executor'],
      parallelism: 8,
    },
  };

  it('should be in mock mode when no runner is provided', () => {
    // Suppress the console warning for this test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const executor = new PhaseExecutor(testPhase);
    expect(executor.isMockMode()).toBe(true);

    warnSpy.mockRestore();
  });

  it('should not be in mock mode when runner is provided', () => {
    const runner = createMockTestRunner();
    const executor = new PhaseExecutor(testPhase, runner);
    expect(executor.isMockMode()).toBe(false);
  });

  it('should produce deterministic results in mock mode', async () => {
    // Suppress the console warning for this test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const executor1 = new PhaseExecutor(testPhase);
    const executor2 = new PhaseExecutor(testPhase);

    const result1 = await executor1.run();
    const result2 = await executor2.run();

    // Results should be identical (deterministic)
    expect(result1.testsRun).toBe(result2.testsRun);
    expect(result1.passRate).toBe(result2.passRate);
    expect(result1.coverage).toBe(result2.coverage);
    expect(result1.flakyRatio).toBe(result2.flakyRatio);

    warnSpy.mockRestore();
  });

  it('should not use Math.random in mock mode results', async () => {
    // Suppress the console warning for this test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Run multiple times and verify consistency
    const executor = new PhaseExecutor(testPhase);
    const results: number[] = [];

    for (let i = 0; i < 5; i++) {
      const result = await executor.run();
      results.push(result.testsRun);
    }

    // All results should be the same (no random variance)
    const allSame = results.every((r) => r === results[0]);
    expect(allSame).toBe(true);

    warnSpy.mockRestore();
  });
});

describe('TestRunner interface', () => {
  it('should support custom test runner implementations', async () => {
    let runCalled = false;
    let receivedTestTypes: string[] = [];
    let receivedOptions: TestRunnerOptions | null = null;

    const customRunner: TestRunner = {
      async run(testTypes: string[], options: TestRunnerOptions): Promise<TestRunnerResult> {
        runCalled = true;
        receivedTestTypes = testTypes;
        receivedOptions = options;

        return {
          total: 50,
          passed: 48,
          failed: 2,
          skipped: 0,
          flaky: 0,
          coverage: 0.88,
          duration: 2500,
          details: [
            { name: 'test1', file: 'test.ts', status: 'passed', duration: 100 },
            { name: 'test2', file: 'test.ts', status: 'failed', duration: 200, error: 'Assertion failed' },
          ],
        };
      },
    };

    const phase: TestPhase = {
      id: 0,
      name: 'Custom',
      testTypes: ['unit', 'integration'],
      expectedDuration: 5000,
      qualityThresholds: { minPassRate: 0.90, maxFlakyRatio: 0.05, minCoverage: 0.80 },
      agentConfig: { agents: ['custom'], parallelism: 2 },
    };

    const executor = new PhaseExecutor(phase, customRunner);
    const result = await executor.run();

    expect(runCalled).toBe(true);
    expect(receivedTestTypes).toEqual(['unit', 'integration']);
    expect(receivedOptions?.parallelism).toBe(2);
    expect(receivedOptions?.collectCoverage).toBe(true);
    expect(result.testsRun).toBe(50);
    expect(result.coverage).toBe(0.88);
  });
});
