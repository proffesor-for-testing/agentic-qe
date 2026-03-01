/**
 * Tests for Kuramoto CPG Self-Sustaining Scheduler
 * ADR-032: Time Crystal Scheduling Integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OscillatorNeuron,
  KuramotoCPG,
  computeOrderParameter,
  createEvenlySpacedOscillators,
  buildRingCouplingMatrix,
  createKuramotoCPG,
  createProductionKuramotoCPG,
  DEFAULT_CPG_CONFIG,
  PRODUCTION_CPG_CONFIG,
  DEFAULT_CPG_TEST_PHASES,
  type CPGTestPhase,
  type CPGConfig,
  type CPGPhaseResult,
} from '../../../../src/coordination/mincut/kuramoto-cpg';

describe('Kuramoto CPG', () => {
  // ==========================================================================
  // OscillatorNeuron Tests
  // ==========================================================================
  describe('OscillatorNeuron', () => {
    describe('constructor', () => {
      it('should create oscillator with correct initial state', () => {
        const oscillator = new OscillatorNeuron(0, 1.0, 0);

        expect(oscillator.getId()).toBe(0);
        expect(oscillator.getPhase()).toBeCloseTo(0, 5);
        expect(oscillator.getAmplitude()).toBe(1.0);
        expect(oscillator.getActivity()).toBeCloseTo(1.0, 5); // cos(0) = 1
      });

      it('should create oscillator with phase offset', () => {
        const oscillator = new OscillatorNeuron(1, 1.0, Math.PI);

        expect(oscillator.getPhase()).toBeCloseTo(Math.PI, 5);
        expect(oscillator.getActivity()).toBeCloseTo(-1.0, 5); // cos(π) = -1
      });

      it('should create oscillator with custom amplitude', () => {
        const oscillator = new OscillatorNeuron(2, 1.0, 0, 0.5);

        expect(oscillator.getAmplitude()).toBe(0.5);
        expect(oscillator.getActivity()).toBeCloseTo(0.5, 5);
      });

      it('should normalize phase offset to [0, 2π)', () => {
        const oscillator = new OscillatorNeuron(3, 1.0, 3 * Math.PI);

        expect(oscillator.getPhase()).toBeLessThan(2 * Math.PI);
        expect(oscillator.getPhase()).toBeGreaterThanOrEqual(0);
      });
    });

    describe('integrate', () => {
      it('should advance phase according to natural frequency', () => {
        const frequencyHz = 1.0; // 1 Hz
        const oscillator = new OscillatorNeuron(0, frequencyHz, 0);
        const dt = 100; // 100ms

        oscillator.integrate(dt, 0);

        // ω = 2π * 1 / 1000 = 0.00628... rad/ms
        // dPhase = ω * dt = 0.628... rad
        const expectedPhaseChange = (2 * Math.PI * frequencyHz * dt) / 1000;
        expect(oscillator.getPhase()).toBeCloseTo(expectedPhaseChange, 4);
      });

      it('should incorporate coupling input', () => {
        const oscillator = new OscillatorNeuron(0, 1.0, 0);
        const couplingInput = 0.01;
        const dt = 100;

        oscillator.integrate(dt, couplingInput);

        // Phase should advance more than natural frequency alone
        const naturalChange = (2 * Math.PI * 1.0 * dt) / 1000;
        const totalChange = naturalChange + couplingInput * dt;
        expect(oscillator.getPhase()).toBeCloseTo(totalChange, 4);
      });

      it('should update activity based on phase', () => {
        const oscillator = new OscillatorNeuron(0, 0, Math.PI / 2);

        // cos(π/2) = 0
        expect(oscillator.getActivity()).toBeCloseTo(0, 5);
      });
    });

    describe('integrateWithModulation', () => {
      it('should speed up with positive modulation', () => {
        const osc1 = new OscillatorNeuron(0, 1.0, 0);
        const osc2 = new OscillatorNeuron(1, 1.0, 0);
        const dt = 100;

        osc1.integrate(dt, 0);
        osc2.integrateWithModulation(dt, 0, 0.5);

        expect(osc2.getPhase()).toBeGreaterThan(osc1.getPhase());
      });

      it('should slow down with negative modulation', () => {
        const osc1 = new OscillatorNeuron(0, 1.0, 0);
        const osc2 = new OscillatorNeuron(1, 1.0, 0);
        const dt = 100;

        osc1.integrate(dt, 0);
        osc2.integrateWithModulation(dt, 0, -0.5);

        expect(osc2.getPhase()).toBeLessThan(osc1.getPhase());
      });
    });

    describe('computeCouplingFrom', () => {
      it('should compute Kuramoto coupling force', () => {
        const osc1 = new OscillatorNeuron(0, 1.0, 0);
        const osc2 = new OscillatorNeuron(1, 1.0, Math.PI / 2);
        const K = 0.3;

        const coupling = osc1.computeCouplingFrom(osc2, K);

        // K * sin(π/2 - 0) = 0.3 * 1 = 0.3
        expect(coupling).toBeCloseTo(K, 5);
      });

      it('should return zero for oscillators in phase', () => {
        const osc1 = new OscillatorNeuron(0, 1.0, 0);
        const osc2 = new OscillatorNeuron(1, 1.0, 0);

        const coupling = osc1.computeCouplingFrom(osc2, 0.3);

        expect(coupling).toBeCloseTo(0, 5);
      });
    });

    describe('isInPhaseWith', () => {
      it('should return true for oscillators with similar phases', () => {
        const osc1 = new OscillatorNeuron(0, 1.0, 0);
        const osc2 = new OscillatorNeuron(1, 1.0, 0.05);

        expect(osc1.isInPhaseWith(osc2, 0.1)).toBe(true);
      });

      it('should return false for oscillators with different phases', () => {
        const osc1 = new OscillatorNeuron(0, 1.0, 0);
        const osc2 = new OscillatorNeuron(1, 1.0, Math.PI);

        expect(osc1.isInPhaseWith(osc2, 0.1)).toBe(false);
      });
    });

    describe('reset', () => {
      it('should reset phase and update activity', () => {
        const oscillator = new OscillatorNeuron(0, 1.0, 0);
        oscillator.integrate(100, 0);

        oscillator.reset(Math.PI);

        expect(oscillator.getPhase()).toBeCloseTo(Math.PI, 5);
        expect(oscillator.getActivity()).toBeCloseTo(-1.0, 5);
      });
    });

    describe('state management', () => {
      it('should export and restore state', () => {
        const original = new OscillatorNeuron(0, 1.0, Math.PI / 4, 0.8);
        original.integrate(100, 0.1);

        const state = original.getState();
        const restored = new OscillatorNeuron(0, 0, 0, 0);
        restored.restoreState(state);

        expect(restored.getPhase()).toBeCloseTo(original.getPhase(), 10);
        expect(restored.getActivity()).toBeCloseTo(original.getActivity(), 10);
        expect(restored.getAmplitude()).toBe(original.getAmplitude());
      });

      it('should reject state from different oscillator', () => {
        const osc1 = new OscillatorNeuron(0, 1.0, 0);
        const osc2 = new OscillatorNeuron(1, 1.0, 0);

        const state = osc1.getState();

        expect(() => osc2.restoreState(state)).toThrow('State id mismatch');
      });
    });

    describe('clone', () => {
      it('should create independent copy', () => {
        const original = new OscillatorNeuron(0, 1.0, Math.PI / 4);
        const clone = original.clone();

        original.integrate(100, 0);

        expect(clone.getPhase()).not.toBe(original.getPhase());
        expect(clone.getId()).toBe(original.getId());
      });
    });
  });

  // ==========================================================================
  // Utility Function Tests
  // ==========================================================================
  describe('Utility Functions', () => {
    describe('computeOrderParameter', () => {
      it('should return r=1 for synchronized oscillators', () => {
        const oscillators = [
          new OscillatorNeuron(0, 1.0, 0),
          new OscillatorNeuron(1, 1.0, 0),
          new OscillatorNeuron(2, 1.0, 0),
          new OscillatorNeuron(3, 1.0, 0),
        ];

        const { r, psi } = computeOrderParameter(oscillators);

        expect(r).toBeCloseTo(1.0, 5);
        expect(psi).toBeCloseTo(0, 5);
      });

      it('should return r close to 0 for evenly distributed phases', () => {
        const oscillators = createEvenlySpacedOscillators(4, 1.0);

        const { r } = computeOrderParameter(oscillators);

        expect(r).toBeLessThan(0.1);
      });

      it('should handle empty array', () => {
        const { r, psi } = computeOrderParameter([]);

        expect(r).toBe(0);
        expect(psi).toBe(0);
      });
    });

    describe('createEvenlySpacedOscillators', () => {
      it('should create correct number of oscillators', () => {
        const oscillators = createEvenlySpacedOscillators(4, 1.0);

        expect(oscillators).toHaveLength(4);
      });

      it('should space phases evenly', () => {
        const oscillators = createEvenlySpacedOscillators(4, 1.0);

        for (let i = 0; i < 4; i++) {
          const expectedPhase = (2 * Math.PI * i) / 4;
          expect(oscillators[i].getPhase()).toBeCloseTo(expectedPhase, 5);
        }
      });

      it('should assign correct IDs', () => {
        const oscillators = createEvenlySpacedOscillators(4, 1.0);

        for (let i = 0; i < 4; i++) {
          expect(oscillators[i].getId()).toBe(i);
        }
      });
    });

    describe('buildRingCouplingMatrix', () => {
      it('should create NxN matrix', () => {
        const matrix = buildRingCouplingMatrix(4, 0.3);

        expect(matrix).toHaveLength(4);
        matrix.forEach((row) => expect(row).toHaveLength(4));
      });

      it('should couple nearest neighbors', () => {
        const K = 0.3;
        const matrix = buildRingCouplingMatrix(4, K);

        // Each oscillator should couple to prev and next
        for (let i = 0; i < 4; i++) {
          const prev = (i + 3) % 4;
          const next = (i + 1) % 4;
          expect(matrix[i][prev]).toBe(K);
          expect(matrix[i][next]).toBe(K);
        }
      });

      it('should not self-couple', () => {
        const matrix = buildRingCouplingMatrix(4, 0.3);

        for (let i = 0; i < 4; i++) {
          expect(matrix[i][i]).toBe(0);
        }
      });
    });
  });

  // ==========================================================================
  // KuramotoCPG Tests
  // ==========================================================================
  describe('KuramotoCPG', () => {
    describe('constructor', () => {
      it('should create with default phases and config', () => {
        const cpg = new KuramotoCPG();

        expect(cpg.getPhases()).toHaveLength(4);
        expect(cpg.getConfig().numPhases).toBe(4);
        expect(cpg.isRunning()).toBe(false);
      });

      it('should create with custom phases', () => {
        const customPhases: CPGTestPhase[] = [
          {
            id: 0,
            name: 'Custom1',
            testTypes: ['unit'],
            expectedDuration: 10000,
            qualityThresholds: { minPassRate: 0.9, maxFlakyRatio: 0.1, minCoverage: 0.7 },
            agentConfig: { agents: ['tester'], parallelism: 4 },
          },
          {
            id: 1,
            name: 'Custom2',
            testTypes: ['integration'],
            expectedDuration: 20000,
            qualityThresholds: { minPassRate: 0.85, maxFlakyRatio: 0.15, minCoverage: 0.6 },
            agentConfig: { agents: ['tester'], parallelism: 2 },
          },
        ];

        const cpg = new KuramotoCPG(customPhases);

        expect(cpg.getPhases()).toHaveLength(2);
        expect(cpg.getConfig().numPhases).toBe(2);
      });

      it('should throw for empty phases', () => {
        expect(() => new KuramotoCPG([])).toThrow('At least one test phase is required');
      });
    });

    describe('tick', () => {
      it('should not tick when not running', () => {
        const cpg = new KuramotoCPG();

        const transition = cpg.tick();

        expect(transition).toBeNull();
      });

      it('should advance time when running', async () => {
        const config: CPGConfig = { ...DEFAULT_CPG_CONFIG, dt: 10 };
        const cpg = new KuramotoCPG(DEFAULT_CPG_TEST_PHASES, config);

        // Manually set running state for testing
        (cpg as unknown as { running: boolean }).running = true;

        const initialTime = cpg.getTime();
        cpg.tick();
        const newTime = cpg.getTime();

        expect(newTime).toBeGreaterThan(initialTime);
      });

      it('should detect phase transitions', async () => {
        const config: CPGConfig = {
          numPhases: 4,
          frequency: 10, // Very fast for testing
          coupling: 0.3,
          stabilityThreshold: 0.1,
          dt: 10,
          transitionThreshold: 0.5,
        };
        const cpg = new KuramotoCPG(DEFAULT_CPG_TEST_PHASES, config);

        (cpg as unknown as { running: boolean }).running = true;

        // Tick many times to get through a full cycle
        let transitionCount = 0;
        for (let i = 0; i < 1000; i++) {
          const transition = cpg.tick();
          if (transition) {
            transitionCount++;
          }
        }

        // Should have had at least some transitions
        expect(transitionCount).toBeGreaterThan(0);
      });

      it('should call tick handler', () => {
        const config: CPGConfig = { ...DEFAULT_CPG_CONFIG, dt: 10 };
        const cpg = new KuramotoCPG(DEFAULT_CPG_TEST_PHASES, config);
        const handler = vi.fn();

        cpg.setTickHandler(handler);
        (cpg as unknown as { running: boolean }).running = true;

        cpg.tick();

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            time: expect.any(Number),
            currentPhase: expect.any(Number),
            orderParameter: expect.any(Number),
          })
        );
      });
    });

    describe('start/stop', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should set running state on start', async () => {
        const cpg = new KuramotoCPG();

        expect(cpg.isRunning()).toBe(false);

        const startPromise = cpg.start();

        // Let start run for a bit
        await vi.advanceTimersByTimeAsync(100);

        expect(cpg.isRunning()).toBe(true);

        cpg.stop();
        await vi.advanceTimersByTimeAsync(100);

        expect(cpg.isRunning()).toBe(false);
      });

      it('should not start twice', async () => {
        const cpg = new KuramotoCPG();

        cpg.start();
        await vi.advanceTimersByTimeAsync(100);

        const initialTime = cpg.getTime();
        cpg.start(); // Should be no-op
        await vi.advanceTimersByTimeAsync(100);

        // Should still be advancing normally
        expect(cpg.getTime()).toBeGreaterThan(initialTime);

        cpg.stop();
      });
    });

    describe('pause/resume', () => {
      it('should pause and resume', () => {
        const cpg = new KuramotoCPG();
        (cpg as unknown as { running: boolean }).running = true;

        expect(cpg.isPaused()).toBe(false);

        cpg.pause();
        expect(cpg.isPaused()).toBe(true);

        // Tick should return null when paused
        const transition = cpg.tick();
        expect(transition).toBeNull();

        cpg.resume();
        expect(cpg.isPaused()).toBe(false);
      });
    });

    describe('recordPhaseResult', () => {
      it('should track quality failures', () => {
        const cpg = new KuramotoCPG();

        const failingResult: CPGPhaseResult = {
          phaseId: 0,
          phaseName: 'Unit',
          passRate: 0.5,
          flakyRatio: 0.3,
          coverage: 0.6,
          duration: 30000,
          testsRun: 100,
          testsPassed: 50,
          testsFailed: 50,
          testsSkipped: 0,
          qualityMet: false,
        };

        cpg.recordPhaseResult(failingResult);
        cpg.recordPhaseResult(failingResult);

        const stats = cpg.getStats();
        expect(stats.qualityFailures).toBe(2);
      });

      it('should trigger repair after 3 consecutive failures', () => {
        const cpg = new KuramotoCPG();
        const repairSpy = vi.spyOn(cpg, 'repairCrystal');

        const failingResult: CPGPhaseResult = {
          phaseId: 0,
          phaseName: 'Unit',
          passRate: 0.5,
          flakyRatio: 0.3,
          coverage: 0.6,
          duration: 30000,
          testsRun: 100,
          testsPassed: 50,
          testsFailed: 50,
          testsSkipped: 0,
          qualityMet: false,
        };

        cpg.recordPhaseResult(failingResult);
        cpg.recordPhaseResult(failingResult);
        cpg.recordPhaseResult(failingResult);

        expect(repairSpy).toHaveBeenCalled();
      });

      it('should reset consecutive failures on success', () => {
        const cpg = new KuramotoCPG();

        const failingResult: CPGPhaseResult = {
          phaseId: 0,
          phaseName: 'Unit',
          passRate: 0.5,
          flakyRatio: 0.3,
          coverage: 0.6,
          duration: 30000,
          testsRun: 100,
          testsPassed: 50,
          testsFailed: 50,
          testsSkipped: 0,
          qualityMet: false,
        };

        const successResult: CPGPhaseResult = {
          ...failingResult,
          passRate: 0.99,
          flakyRatio: 0.01,
          testsPassed: 99,
          testsFailed: 1,
          qualityMet: true,
        };

        cpg.recordPhaseResult(failingResult);
        cpg.recordPhaseResult(failingResult);
        cpg.recordPhaseResult(successResult);
        cpg.recordPhaseResult(failingResult);
        cpg.recordPhaseResult(failingResult);

        // Should not trigger repair since success reset the counter
        const repairSpy = vi.spyOn(cpg, 'repairCrystal');
        cpg.recordPhaseResult(failingResult);

        expect(repairSpy).toHaveBeenCalled();
      });
    });

    describe('isStable', () => {
      it('should return false with insufficient history', () => {
        const cpg = new KuramotoCPG();

        expect(cpg.isStable()).toBe(false);
      });

      it('should detect stable periodic behavior', () => {
        const cpg = new KuramotoCPG();
        const history = (cpg as unknown as { phaseHistory: number[] }).phaseHistory;

        // Simulate stable cycling: 0,1,2,3,0,1,2,3
        history.push(0, 1, 2, 3, 0, 1, 2, 3);

        expect(cpg.isStable()).toBe(true);
      });

      it('should detect unstable behavior', () => {
        const cpg = new KuramotoCPG();
        const history = (cpg as unknown as { phaseHistory: number[] }).phaseHistory;

        // Simulate unstable cycling: 0,1,2,3,0,2,1,3
        history.push(0, 1, 2, 3, 0, 2, 1, 3);

        expect(cpg.isStable()).toBe(false);
      });
    });

    describe('getters', () => {
      it('should return current phase', () => {
        const cpg = new KuramotoCPG();

        const phase = cpg.getCurrentPhase();

        expect(phase).toBeDefined();
        expect(phase.id).toBe(0);
      });

      it('should return oscillator states', () => {
        const cpg = new KuramotoCPG();

        const states = cpg.getOscillatorStates();

        expect(states).toHaveLength(4);
        states.forEach((state, i) => {
          expect(state.id).toBe(i);
          expect(state.phase).toBeDefined();
          expect(state.activity).toBeDefined();
        });
      });

      it('should return order parameter', () => {
        const cpg = new KuramotoCPG();

        const { r, psi } = cpg.getOrderParameter();

        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
        expect(typeof psi).toBe('number');
      });

      it('should return stats', () => {
        const cpg = new KuramotoCPG();

        const stats = cpg.getStats();

        expect(stats.cycleCount).toBe(0);
        expect(stats.qualityFailures).toBe(0);
        expect(stats.isStable).toBe(false);
        expect(stats.orderParameter).toBeDefined();
        expect(stats.avgCycleDuration).toBe(0);
      });
    });
  });

  // ==========================================================================
  // Factory Function Tests
  // ==========================================================================
  describe('Factory Functions', () => {
    describe('createKuramotoCPG', () => {
      it('should create CPG with defaults', () => {
        const cpg = createKuramotoCPG();

        expect(cpg.getPhases()).toHaveLength(4);
        expect(cpg.getConfig().frequency).toBe(DEFAULT_CPG_CONFIG.frequency);
      });

      it('should merge partial config', () => {
        const cpg = createKuramotoCPG(undefined, { frequency: 0.5 });

        expect(cpg.getConfig().frequency).toBe(0.5);
        expect(cpg.getConfig().coupling).toBe(DEFAULT_CPG_CONFIG.coupling);
      });
    });

    describe('createProductionKuramotoCPG', () => {
      it('should create CPG with production config', () => {
        const cpg = createProductionKuramotoCPG();

        expect(cpg.getConfig().frequency).toBe(PRODUCTION_CPG_CONFIG.frequency);
        expect(cpg.getConfig().dt).toBe(PRODUCTION_CPG_CONFIG.dt);
      });
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================
  describe('Configuration', () => {
    describe('DEFAULT_CPG_CONFIG', () => {
      it('should have sensible defaults', () => {
        expect(DEFAULT_CPG_CONFIG.numPhases).toBe(4);
        expect(DEFAULT_CPG_CONFIG.frequency).toBe(0.1);
        expect(DEFAULT_CPG_CONFIG.coupling).toBe(0.3);
        expect(DEFAULT_CPG_CONFIG.dt).toBe(100);
        expect(DEFAULT_CPG_CONFIG.transitionThreshold).toBe(0.8);
      });
    });

    describe('PRODUCTION_CPG_CONFIG', () => {
      it('should have production values', () => {
        expect(PRODUCTION_CPG_CONFIG.frequency).toBe(0.001);
        expect(PRODUCTION_CPG_CONFIG.dt).toBe(1000);
      });
    });

    describe('DEFAULT_CPG_TEST_PHASES', () => {
      it('should have 4 phases', () => {
        expect(DEFAULT_CPG_TEST_PHASES).toHaveLength(4);
      });

      it('should have correct phase names', () => {
        const names = DEFAULT_CPG_TEST_PHASES.map((p) => p.name);
        expect(names).toEqual(['Unit', 'Integration', 'E2E', 'Performance']);
      });

      it('should have increasing durations', () => {
        for (let i = 1; i < DEFAULT_CPG_TEST_PHASES.length; i++) {
          expect(DEFAULT_CPG_TEST_PHASES[i].expectedDuration).toBeGreaterThanOrEqual(
            DEFAULT_CPG_TEST_PHASES[i - 1].expectedDuration
          );
        }
      });

      it('should have decreasing parallelism', () => {
        const parallelisms = DEFAULT_CPG_TEST_PHASES.map((p) => p.agentConfig.parallelism);
        expect(parallelisms).toEqual([8, 4, 2, 1]);
      });
    });
  });
});
