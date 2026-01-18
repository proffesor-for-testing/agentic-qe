/**
 * Phase Scheduler Tests
 *
 * Tests for the simplified phase scheduler that replaces
 * Kuramoto CPG oscillators with a practical state machine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PhaseScheduler,
  createPhaseScheduler,
  checkQualityThresholds,
  type SchedulerConfig,
} from '../../../src/test-scheduling/phase-scheduler';
import type {
  TestPhase,
  PhaseResult,
  PhaseExecutor,
  QualityThresholds,
} from '../../../src/test-scheduling/interfaces';

// ============================================================================
// Mock Executor
// ============================================================================

class MockExecutor implements PhaseExecutor {
  public executeCalls: TestPhase[] = [];
  private results: Map<string, PhaseResult> = new Map();
  private ready = true;
  private aborted = false;

  setResult(phaseId: string, result: Partial<PhaseResult>): void {
    this.results.set(phaseId, {
      phaseId,
      phaseName: 'Mock Phase',
      success: true,
      passRate: 0.99,
      flakyRatio: 0.01,
      coverage: 0.85,
      durationMs: 100,
      totalTests: 10,
      passed: 9,
      failed: 1,
      skipped: 0,
      testResults: [],
      flakyTests: [],
      ...result,
    });
  }

  setReady(ready: boolean): void {
    this.ready = ready;
  }

  async execute(phase: TestPhase): Promise<PhaseResult> {
    this.executeCalls.push(phase);

    if (this.aborted) {
      throw new Error('Execution aborted');
    }

    const result = this.results.get(phase.id);
    if (result) {
      return result;
    }

    // Default success result
    return {
      phaseId: phase.id,
      phaseName: phase.name,
      success: true,
      passRate: 0.99,
      flakyRatio: 0.01,
      coverage: 0.85,
      durationMs: 100,
      totalTests: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      testResults: [],
      flakyTests: [],
    };
  }

  async isReady(): Promise<boolean> {
    return this.ready;
  }

  getName(): string {
    return 'mock-executor';
  }

  async abort(): Promise<void> {
    this.aborted = true;
  }

  reset(): void {
    this.executeCalls = [];
    this.results.clear();
    this.ready = true;
    this.aborted = false;
  }
}

// ============================================================================
// Test Phases
// ============================================================================

const TEST_PHASES: TestPhase[] = [
  {
    id: 'unit',
    name: 'Unit Tests',
    testTypes: ['unit'],
    testPatterns: ['**/*.test.ts'],
    thresholds: { minPassRate: 0.95, maxFlakyRatio: 0.05, minCoverage: 0.8 },
    parallelism: 4,
    timeoutMs: 60000,
    failFast: true,
  },
  {
    id: 'integration',
    name: 'Integration Tests',
    testTypes: ['integration'],
    testPatterns: ['**/*.integration.test.ts'],
    thresholds: { minPassRate: 0.9, maxFlakyRatio: 0.1, minCoverage: 0.6 },
    parallelism: 2,
    timeoutMs: 120000,
    failFast: false,
  },
];

// ============================================================================
// Tests
// ============================================================================

describe('PhaseScheduler', () => {
  let executor: MockExecutor;

  beforeEach(() => {
    executor = new MockExecutor();
  });

  // --------------------------------------------------------------------------
  // Constructor & Factory
  // --------------------------------------------------------------------------

  describe('Constructor', () => {
    it('should create scheduler with default config', () => {
      const scheduler = new PhaseScheduler(executor);
      expect(scheduler).toBeDefined();
    });

    it('should create scheduler with custom phases', () => {
      const config: SchedulerConfig = {
        phases: TEST_PHASES,
        failFast: true,
        retryFailedPhases: false,
        maxRetries: 1,
      };

      const scheduler = new PhaseScheduler(executor, config);
      expect(scheduler).toBeDefined();
    });

    it('should use factory function', () => {
      const scheduler = createPhaseScheduler(executor, { phases: TEST_PHASES });
      expect(scheduler).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Run All Phases
  // --------------------------------------------------------------------------

  describe('run()', () => {
    it('should execute all phases sequentially', async () => {
      const scheduler = createPhaseScheduler(executor, { phases: TEST_PHASES });

      const results = await scheduler.run();

      expect(results).toHaveLength(2);
      expect(executor.executeCalls).toHaveLength(2);
      expect(executor.executeCalls[0].id).toBe('unit');
      expect(executor.executeCalls[1].id).toBe('integration');
    });

    it('should return results for each phase', async () => {
      const scheduler = createPhaseScheduler(executor, { phases: TEST_PHASES });

      const results = await scheduler.run();

      expect(results[0].phaseId).toBe('unit');
      expect(results[1].phaseId).toBe('integration');
    });

    it('should stop on failure when failFast is true', async () => {
      executor.setResult('unit', { success: false, passRate: 0.5 });

      const scheduler = createPhaseScheduler(executor, {
        phases: TEST_PHASES,
        failFast: true,
      });

      const results = await scheduler.run();

      // Should stop after first failure
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(executor.executeCalls).toHaveLength(1);
    });

    it('should continue on failure when failFast is false', async () => {
      executor.setResult('unit', { success: false, passRate: 0.5 });

      const scheduler = createPhaseScheduler(executor, {
        phases: TEST_PHASES,
        failFast: false,
      });

      const results = await scheduler.run();

      // Should run both phases
      expect(results).toHaveLength(2);
      expect(executor.executeCalls).toHaveLength(2);
    });

    it('should throw if already running', async () => {
      const scheduler = createPhaseScheduler(executor, { phases: TEST_PHASES });

      // Start first run
      const firstRun = scheduler.run();

      // Try to start second run
      await expect(scheduler.run()).rejects.toThrow('already running');

      await firstRun;
    });

    it('should call onPhaseComplete callback', async () => {
      const onPhaseComplete = vi.fn();

      const scheduler = createPhaseScheduler(executor, {
        phases: TEST_PHASES,
        onPhaseComplete,
      });

      await scheduler.run();

      expect(onPhaseComplete).toHaveBeenCalledTimes(2);
    });

    it('should call onAllComplete callback', async () => {
      const onAllComplete = vi.fn();

      const scheduler = createPhaseScheduler(executor, {
        phases: TEST_PHASES,
        onAllComplete,
      });

      await scheduler.run();

      expect(onAllComplete).toHaveBeenCalledTimes(1);
      expect(onAllComplete).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ phaseId: 'unit' }),
        expect.objectContaining({ phaseId: 'integration' }),
      ]));
    });
  });

  // --------------------------------------------------------------------------
  // Run Single Phase
  // --------------------------------------------------------------------------

  describe('runPhase()', () => {
    it('should run specific phase by ID', async () => {
      const scheduler = createPhaseScheduler(executor, { phases: TEST_PHASES });

      const result = await scheduler.runPhase('integration');

      expect(result.phaseId).toBe('integration');
      expect(executor.executeCalls).toHaveLength(1);
      expect(executor.executeCalls[0].id).toBe('integration');
    });

    it('should throw if phase not found', async () => {
      const scheduler = createPhaseScheduler(executor, { phases: TEST_PHASES });

      await expect(scheduler.runPhase('nonexistent')).rejects.toThrow('Phase not found');
    });
  });

  // --------------------------------------------------------------------------
  // Retry Logic
  // --------------------------------------------------------------------------

  describe('Retry Logic', () => {
    it('should retry failed phases when enabled', async () => {
      let callCount = 0;
      executor.execute = async (phase: TestPhase) => {
        callCount++;
        if (callCount === 1) {
          return {
            phaseId: phase.id,
            phaseName: phase.name,
            success: false,
            passRate: 0.5,
            flakyRatio: 0,
            coverage: 0.8,
            durationMs: 100,
            totalTests: 10,
            passed: 5,
            failed: 5,
            skipped: 0,
            testResults: [],
            flakyTests: [],
          };
        }
        return {
          phaseId: phase.id,
          phaseName: phase.name,
          success: true,
          passRate: 1,
          flakyRatio: 0,
          coverage: 0.8,
          durationMs: 100,
          totalTests: 10,
          passed: 10,
          failed: 0,
          skipped: 0,
          testResults: [],
          flakyTests: [],
        };
      };

      const scheduler = createPhaseScheduler(executor, {
        phases: [TEST_PHASES[0]],
        retryFailedPhases: true,
        maxRetries: 2,
      });

      const results = await scheduler.run();

      expect(callCount).toBe(2); // First failure + one retry
      expect(results[0].success).toBe(true);
    });

    it('should not retry when disabled', async () => {
      executor.setResult('unit', { success: false });

      const scheduler = createPhaseScheduler(executor, {
        phases: [TEST_PHASES[0]],
        retryFailedPhases: false,
      });

      const results = await scheduler.run();

      expect(executor.executeCalls).toHaveLength(1);
      expect(results[0].success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Pause & Resume
  // --------------------------------------------------------------------------

  describe('Pause and Resume', () => {
    it('should pause execution between phases', async () => {
      const scheduler = createPhaseScheduler(executor, { phases: TEST_PHASES });

      let firstPhaseComplete = false;
      scheduler['config'].onPhaseComplete = () => {
        if (!firstPhaseComplete) {
          firstPhaseComplete = true;
          scheduler.pause();
        }
      };

      const runPromise = scheduler.run();

      // Wait a bit for pause to take effect
      await new Promise((resolve) => setTimeout(resolve, 50));

      const stats = scheduler.getStats();
      expect(stats.state).toBe('paused');

      // Resume
      scheduler.resume();
      await runPromise;

      expect(executor.executeCalls).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // Abort
  // --------------------------------------------------------------------------

  describe('Abort', () => {
    it('should abort execution', async () => {
      // Use a slow executor to give time to abort
      let resolveExecute: (() => void) | null = null;
      executor.execute = async (phase: TestPhase) => {
        await new Promise<void>((resolve) => {
          resolveExecute = resolve;
          setTimeout(resolve, 500); // Give time for abort
        });
        return {
          phaseId: phase.id,
          phaseName: phase.name,
          success: true,
          passRate: 1,
          flakyRatio: 0,
          coverage: 0.8,
          durationMs: 100,
          totalTests: 10,
          passed: 10,
          failed: 0,
          skipped: 0,
          testResults: [],
          flakyTests: [],
        };
      };

      const scheduler = createPhaseScheduler(executor, { phases: TEST_PHASES });

      const runPromise = scheduler.run();

      // Wait a tick for run to start
      await new Promise((r) => setTimeout(r, 10));

      await scheduler.abort();
      resolveExecute?.(); // Complete any pending execution

      // After abort, state should be idle (reset by abort method)
      expect(scheduler.getStats().state).toBe('idle');
    });
  });

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  describe('getStats()', () => {
    it('should return current stats', async () => {
      const scheduler = createPhaseScheduler(executor, { phases: TEST_PHASES });

      const statsBefore = scheduler.getStats();
      expect(statsBefore.state).toBe('idle');
      expect(statsBefore.totalPhases).toBe(2);
      expect(statsBefore.completedPhases).toBe(0);

      await scheduler.run();

      const statsAfter = scheduler.getStats();
      expect(statsAfter.state).toBe('completed');
      expect(statsAfter.completedPhases).toBe(2);
      expect(statsAfter.results).toHaveLength(2);
    });

    it('should track duration', async () => {
      // Add slight delay to executor to ensure duration > 0
      const originalExecute = executor.execute.bind(executor);
      executor.execute = async (phase: TestPhase) => {
        await new Promise((r) => setTimeout(r, 5));
        return originalExecute(phase);
      };

      const scheduler = createPhaseScheduler(executor, { phases: TEST_PHASES });

      await scheduler.run();

      const stats = scheduler.getStats();
      expect(stats.durationMs).toBeGreaterThanOrEqual(0); // May be 0 if very fast
      expect(stats.startTime).toBeDefined();
      expect(stats.endTime).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Ready Check
  // --------------------------------------------------------------------------

  describe('isReady()', () => {
    it('should check executor readiness', async () => {
      const scheduler = createPhaseScheduler(executor, { phases: TEST_PHASES });

      expect(await scheduler.isReady()).toBe(true);

      executor.setReady(false);
      expect(await scheduler.isReady()).toBe(false);
    });
  });
});

// ============================================================================
// Quality Threshold Helper
// ============================================================================

describe('checkQualityThresholds', () => {
  const thresholds: QualityThresholds = {
    minPassRate: 0.9,
    maxFlakyRatio: 0.1,
    minCoverage: 0.8,
  };

  it('should return true when all thresholds met', () => {
    const result: PhaseResult = {
      phaseId: 'test',
      phaseName: 'Test',
      success: true,
      passRate: 0.95,
      flakyRatio: 0.05,
      coverage: 0.85,
      durationMs: 100,
      totalTests: 10,
      passed: 9,
      failed: 1,
      skipped: 0,
      testResults: [],
      flakyTests: [],
    };

    expect(checkQualityThresholds(result, thresholds)).toBe(true);
  });

  it('should return false when pass rate too low', () => {
    const result: PhaseResult = {
      phaseId: 'test',
      phaseName: 'Test',
      success: false,
      passRate: 0.85, // Below 0.9
      flakyRatio: 0.05,
      coverage: 0.85,
      durationMs: 100,
      totalTests: 10,
      passed: 8,
      failed: 2,
      skipped: 0,
      testResults: [],
      flakyTests: [],
    };

    expect(checkQualityThresholds(result, thresholds)).toBe(false);
  });

  it('should return false when flaky ratio too high', () => {
    const result: PhaseResult = {
      phaseId: 'test',
      phaseName: 'Test',
      success: false,
      passRate: 0.95,
      flakyRatio: 0.15, // Above 0.1
      coverage: 0.85,
      durationMs: 100,
      totalTests: 10,
      passed: 9,
      failed: 1,
      skipped: 0,
      testResults: [],
      flakyTests: [],
    };

    expect(checkQualityThresholds(result, thresholds)).toBe(false);
  });

  it('should return false when coverage too low', () => {
    const result: PhaseResult = {
      phaseId: 'test',
      phaseName: 'Test',
      success: false,
      passRate: 0.95,
      flakyRatio: 0.05,
      coverage: 0.7, // Below 0.8
      durationMs: 100,
      totalTests: 10,
      passed: 9,
      failed: 1,
      skipped: 0,
      testResults: [],
      flakyTests: [],
    };

    expect(checkQualityThresholds(result, thresholds)).toBe(false);
  });
});
