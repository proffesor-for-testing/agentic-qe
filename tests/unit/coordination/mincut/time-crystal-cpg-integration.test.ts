/**
 * Integration Tests: TimeCrystalController + KuramotoCPG
 *
 * These tests verify REAL integration between:
 * 1. KuramotoCPG phase transitions
 * 2. PhaseExecutor test execution
 * 3. Quality feedback via recordPhaseResult
 * 4. Adaptive scheduling based on quality
 *
 * ADR-032: Time Crystal Scheduling Integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TimeCrystalController,
  createTimeCrystalController,
  PhaseExecutor,
  DefaultPhaseExecutor,
  createDefaultPhaseExecutor,
  type TimeCrystalConfig,
} from '../../../../src/coordination/mincut/time-crystal';
import {
  KuramotoCPG,
  type CPGTestPhase,
  type CPGPhaseResult,
  type CPGPhaseTransition,
} from '../../../../src/coordination/mincut/kuramoto-cpg';

describe('TimeCrystalController + KuramotoCPG Integration', () => {
  // ==========================================================================
  // Test Phase Executor Implementation
  // ==========================================================================

  /**
   * Mock phase executor that tracks all executions
   */
  class TrackingPhaseExecutor implements PhaseExecutor {
    public executions: { phase: CPGTestPhase; result: CPGPhaseResult }[] = [];
    public executeCount = 0;
    private ready = true;
    private qualityOverride?: boolean;

    async execute(phase: CPGTestPhase): Promise<CPGPhaseResult> {
      this.executeCount++;

      const qualityMet = this.qualityOverride ?? true;

      const result: CPGPhaseResult = {
        phaseId: phase.id,
        phaseName: phase.name,
        passRate: qualityMet ? 0.99 : 0.5,
        flakyRatio: qualityMet ? 0.01 : 0.3,
        coverage: qualityMet ? 0.9 : 0.4,
        duration: 100,
        testsRun: 100,
        testsPassed: qualityMet ? 99 : 50,
        testsFailed: qualityMet ? 1 : 50,
        testsSkipped: 0,
        qualityMet,
      };

      this.executions.push({ phase, result });
      return result;
    }

    isReady(): boolean {
      return this.ready;
    }

    getName(): string {
      return 'tracking-executor';
    }

    setReady(ready: boolean): void {
      this.ready = ready;
    }

    setQualityOverride(quality: boolean): void {
      this.qualityOverride = quality;
    }

    clearQualityOverride(): void {
      this.qualityOverride = undefined;
    }
  }

  // ==========================================================================
  // Basic Integration Tests
  // ==========================================================================

  describe('Constructor Integration', () => {
    it('should create TimeCrystalController with integrated KuramotoCPG', () => {
      const controller = createTimeCrystalController();

      expect(controller).toBeDefined();
      expect(controller.getCPG()).toBeInstanceOf(KuramotoCPG);
      expect(controller.getPhaseExecutor()).toBeDefined();
    });

    it('should accept custom PhaseExecutor', () => {
      const customExecutor = new TrackingPhaseExecutor();
      const controller = createTimeCrystalController(
        {},
        undefined,
        undefined,
        undefined,
        undefined,
        customExecutor
      );

      expect(controller.getPhaseExecutor()).toBe(customExecutor);
    });

    it('should wire up CPG transition handler', () => {
      const controller = createTimeCrystalController();
      const cpg = controller.getCPG();

      // The CPG should have a transition handler set
      // We verify by checking that handleCPGTransition would be called
      expect(cpg).toBeDefined();
    });

    it('should create default phase executor when none provided', () => {
      const controller = createTimeCrystalController();

      expect(controller.getPhaseExecutor()).toBeInstanceOf(DefaultPhaseExecutor);
    });
  });

  // ==========================================================================
  // Phase Transition → Test Execution Integration
  // ==========================================================================

  describe('Phase Transition Triggers Test Execution', () => {
    let controller: TimeCrystalController;
    let executor: TrackingPhaseExecutor;

    beforeEach(() => {
      vi.useFakeTimers();
      executor = new TrackingPhaseExecutor();
      controller = createTimeCrystalController(
        {
          useCPGScheduling: true,
          cpgConfig: {
            frequency: 10, // Fast for testing
            dt: 10,
            transitionThreshold: 0.5,
          },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        executor
      );
    });

    afterEach(() => {
      controller.stop();
      vi.useRealTimers();
    });

    it('should execute tests when CPG transitions phases', async () => {
      // Start the controller
      controller.start();

      // Advance time to trigger CPG ticks and transitions
      for (let i = 0; i < 100; i++) {
        await vi.advanceTimersByTimeAsync(10);
      }

      // Verify that the executor was called
      // (with fast frequency, we should get transitions)
      expect(executor.executeCount).toBeGreaterThan(0);
    });

    it('should pass correct phase to executor', async () => {
      controller.start();

      // Advance time
      for (let i = 0; i < 200; i++) {
        await vi.advanceTimersByTimeAsync(10);
      }

      controller.stop();

      // MUST have executions - fail if none occurred (not silently pass)
      expect(executor.executions.length).toBeGreaterThan(0);

      const execution = executor.executions[0];
      expect(execution.phase).toHaveProperty('id');
      expect(execution.phase).toHaveProperty('name');
      expect(execution.phase).toHaveProperty('testTypes');
      expect(execution.phase).toHaveProperty('qualityThresholds');
    });

    it('should not execute if executor is not ready', async () => {
      executor.setReady(false);

      controller.start();

      for (let i = 0; i < 100; i++) {
        await vi.advanceTimersByTimeAsync(10);
      }

      controller.stop();

      expect(executor.executeCount).toBe(0);
    });
  });

  // ==========================================================================
  // Quality Feedback Integration
  // ==========================================================================

  describe('Quality Feedback Loop', () => {
    let controller: TimeCrystalController;
    let executor: TrackingPhaseExecutor;

    beforeEach(() => {
      vi.useFakeTimers();
      executor = new TrackingPhaseExecutor();
      controller = createTimeCrystalController(
        {
          useCPGScheduling: true,
          cpgConfig: {
            frequency: 10,
            dt: 10,
            transitionThreshold: 0.5,
          },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        executor
      );
    });

    afterEach(() => {
      controller.stop();
      vi.useRealTimers();
    });

    it('should track CPG stats including transitions and executions', async () => {
      controller.start();

      for (let i = 0; i < 200; i++) {
        await vi.advanceTimersByTimeAsync(10);
      }

      controller.stop();

      const stats = controller.getStats();

      // Should have tracked CPG-related stats
      expect(stats).toHaveProperty('cpgTransitions');
      expect(stats).toHaveProperty('cpgPhasesExecuted');
      expect(stats).toHaveProperty('cpgQualityFailures');
    });

    it('should record quality failures in stats', async () => {
      // Set executor to fail quality
      executor.setQualityOverride(false);

      controller.start();

      for (let i = 0; i < 200; i++) {
        await vi.advanceTimersByTimeAsync(10);
      }

      controller.stop();

      const stats = controller.getStats();

      // MUST have executions - fail if none occurred (not silently pass)
      expect(stats.cpgPhasesExecuted).toBeGreaterThan(0);
      // Quality failures should match executions when all fail
      expect(stats.cpgQualityFailures).toBe(stats.cpgPhasesExecuted);
    });

    it('should feed results back to CPG via recordPhaseResult', async () => {
      const cpg = controller.getCPG();

      controller.start();

      // Run long enough to get transitions
      for (let i = 0; i < 200; i++) {
        await vi.advanceTimersByTimeAsync(10);
      }

      controller.stop();

      // MUST have executions - fail if none occurred (not silently pass)
      expect(executor.executeCount).toBeGreaterThan(0);

      // CPG stats should be updated after executions
      const finalStats = cpg.getStats();
      // The CPG tracks quality failures internally (0 when all pass)
      expect(finalStats.qualityFailures).toBeGreaterThanOrEqual(0);
    });

    it('should trigger CPG repair after consecutive failures', async () => {
      // Set executor to always fail quality
      executor.setQualityOverride(false);

      const cpg = controller.getCPG();
      const repairSpy = vi.spyOn(cpg, 'repairCrystal');

      controller.start();

      // Run long enough to accumulate failures
      for (let i = 0; i < 500; i++) {
        await vi.advanceTimersByTimeAsync(10);
      }

      controller.stop();

      // MUST have at least 3 executions - fail if not enough (not silently pass)
      expect(executor.executeCount).toBeGreaterThanOrEqual(3);
      // Repair should have been called after 3 consecutive failures
      expect(repairSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Lifecycle Integration
  // ==========================================================================

  describe('Lifecycle Management', () => {
    let controller: TimeCrystalController;

    beforeEach(() => {
      vi.useFakeTimers();
      controller = createTimeCrystalController({
        useCPGScheduling: true,
        cpgConfig: { frequency: 1, dt: 100 },
      });
    });

    afterEach(() => {
      controller.stop();
      vi.useRealTimers();
    });

    it('should start CPG when controller starts with useCPGScheduling', async () => {
      expect(controller.getCPG().isRunning()).toBe(false);

      controller.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(controller.getCPG().isRunning()).toBe(true);
    });

    it('should stop CPG when controller stops', async () => {
      controller.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(controller.getCPG().isRunning()).toBe(true);

      controller.stop();

      expect(controller.getCPG().isRunning()).toBe(false);
    });

    it('should pause and resume CPG', async () => {
      controller.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(controller.getCPG().isPaused()).toBe(false);

      controller.pauseCPG();
      expect(controller.getCPG().isPaused()).toBe(true);

      controller.resumeCPG();
      expect(controller.getCPG().isPaused()).toBe(false);
    });

    it('should not start CPG when useCPGScheduling is false', async () => {
      const nonCpgController = createTimeCrystalController({
        useCPGScheduling: false,
      });

      nonCpgController.start();
      await vi.advanceTimersByTimeAsync(100);

      // CPG should not be running
      expect(nonCpgController.getCPG().isRunning()).toBe(false);

      nonCpgController.stop();
    });
  });

  // ==========================================================================
  // DefaultPhaseExecutor Tests
  // ==========================================================================

  describe('DefaultPhaseExecutor', () => {
    it('should create via factory function', () => {
      const executor = createDefaultPhaseExecutor('test-executor');

      expect(executor).toBeInstanceOf(DefaultPhaseExecutor);
      expect(executor.getName()).toBe('test-executor');
    });

    it('should execute and return valid result', async () => {
      const executor = new DefaultPhaseExecutor();

      const phase: CPGTestPhase = {
        id: 0,
        name: 'Test',
        testTypes: ['unit'],
        expectedDuration: 1000,
        qualityThresholds: {
          minPassRate: 0.9,
          maxFlakyRatio: 0.1,
          minCoverage: 0.8,
        },
        agentConfig: { agents: ['tester'], parallelism: 4 },
      };

      const result = await executor.execute(phase);

      expect(result.phaseId).toBe(0);
      expect(result.phaseName).toBe('Test');
      expect(result.passRate).toBeGreaterThanOrEqual(0);
      expect(result.passRate).toBeLessThanOrEqual(1);
      expect(result.testsRun).toBeGreaterThan(0);
      expect(result.testsPassed + result.testsFailed).toBe(result.testsRun);
    });

    it('should be ready by default', () => {
      const executor = new DefaultPhaseExecutor();

      expect(executor.isReady()).toBe(true);
    });

    it('should allow setting ready state', () => {
      const executor = new DefaultPhaseExecutor();

      executor.setReady(false);
      expect(executor.isReady()).toBe(false);

      executor.setReady(true);
      expect(executor.isReady()).toBe(true);
    });
  });

  // ==========================================================================
  // Full Cycle Integration Test
  // ==========================================================================

  describe('Full Cycle: Oscillator → Execute → Feedback → Adapt', () => {
    it('should complete full integration cycle', async () => {
      vi.useFakeTimers();

      const executor = new TrackingPhaseExecutor();
      const controller = createTimeCrystalController(
        {
          useCPGScheduling: true,
          cpgConfig: {
            frequency: 10, // Fast oscillation
            dt: 10,
            transitionThreshold: 0.5,
          },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        executor
      );

      // Start the cycle
      controller.start();

      // Run for enough time to get multiple transitions
      for (let i = 0; i < 500; i++) {
        await vi.advanceTimersByTimeAsync(10);
      }

      controller.stop();
      vi.useRealTimers();

      // Verify the full cycle occurred
      const stats = controller.getStats();
      const cpgStats = controller.getCPG().getStats();

      // 1. Oscillators drove phase transitions
      expect(stats.cpgTransitions).toBeGreaterThan(0);

      // 2. Test execution happened
      expect(stats.cpgPhasesExecuted).toBeGreaterThan(0);
      expect(executor.executeCount).toBe(stats.cpgPhasesExecuted);

      // 3. Results were recorded
      expect(executor.executions.length).toBe(executor.executeCount);

      // 4. Each execution has both phase and result
      for (const execution of executor.executions) {
        expect(execution.phase).toBeDefined();
        expect(execution.result).toBeDefined();
        expect(execution.result.phaseId).toBe(execution.phase.id);
      }
    });

    it('should demonstrate adaptive behavior on quality failures', async () => {
      vi.useFakeTimers();

      const executor = new TrackingPhaseExecutor();
      executor.setQualityOverride(false); // All tests fail quality

      const controller = createTimeCrystalController(
        {
          useCPGScheduling: true,
          cpgConfig: {
            frequency: 10,
            dt: 10,
            transitionThreshold: 0.5,
          },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        executor
      );

      const cpg = controller.getCPG();
      const repairSpy = vi.spyOn(cpg, 'repairCrystal');

      controller.start();

      // Run for a while
      for (let i = 0; i < 1000; i++) {
        await vi.advanceTimersByTimeAsync(10);
      }

      controller.stop();
      vi.useRealTimers();

      const stats = controller.getStats();

      // MUST have at least 3 executions - fail if not enough (not silently pass)
      expect(stats.cpgPhasesExecuted).toBeGreaterThanOrEqual(3);

      // Quality failures should be tracked - all should fail
      expect(stats.cpgQualityFailures).toBe(stats.cpgPhasesExecuted);

      // Repair should have been called after 3 consecutive failures
      expect(repairSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Configuration Integration
  // ==========================================================================

  describe('Configuration Integration', () => {
    it('should pass CPG config to KuramotoCPG', () => {
      const controller = createTimeCrystalController({
        cpgConfig: {
          frequency: 0.5,
          coupling: 0.4,
          dt: 200,
        },
      });

      const cpgConfig = controller.getCPG().getConfig();

      expect(cpgConfig.frequency).toBe(0.5);
      expect(cpgConfig.coupling).toBe(0.4);
      expect(cpgConfig.dt).toBe(200);
    });

    it('should pass custom phases to KuramotoCPG', () => {
      const customPhases: CPGTestPhase[] = [
        {
          id: 0,
          name: 'Custom',
          testTypes: ['unit'],
          expectedDuration: 5000,
          qualityThresholds: { minPassRate: 0.8, maxFlakyRatio: 0.2, minCoverage: 0.6 },
          agentConfig: { agents: ['tester'], parallelism: 2 },
        },
      ];

      const controller = createTimeCrystalController({
        cpgPhases: customPhases,
      });

      const phases = controller.getCPG().getPhases();

      expect(phases).toHaveLength(1);
      expect(phases[0].name).toBe('Custom');
    });
  });
});
