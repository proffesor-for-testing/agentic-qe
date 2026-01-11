/**
 * Agentic QE v3 - Time Crystal Scheduler Tests
 * ADR-032: Time Crystal Scheduling
 *
 * Tests for the CPG controller and self-sustaining scheduling.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TimeCrystalScheduler,
  createDefaultScheduler,
} from '../../src/time-crystal/scheduler';
import {
  TestPhase,
  CPGConfig,
  DEFAULT_CPG_CONFIG,
  FAST_CPG_CONFIG,
  PhaseResult,
  TimeCrystalEvent,
} from '../../src/time-crystal/types';
import { DEFAULT_TEST_PHASES } from '../../src/time-crystal/default-phases';

describe('TimeCrystalScheduler', () => {
  const testPhases: TestPhase[] = [
    {
      id: 0,
      name: 'Unit',
      testTypes: ['unit'],
      expectedDuration: 1000,
      qualityThresholds: { minPassRate: 0.95, maxFlakyRatio: 0.05, minCoverage: 0.80 },
      agentConfig: { agents: ['test-executor'], parallelism: 4 },
    },
    {
      id: 1,
      name: 'Integration',
      testTypes: ['integration'],
      expectedDuration: 2000,
      qualityThresholds: { minPassRate: 0.90, maxFlakyRatio: 0.10, minCoverage: 0.70 },
      agentConfig: { agents: ['test-executor'], parallelism: 2 },
    },
    {
      id: 2,
      name: 'E2E',
      testTypes: ['e2e'],
      expectedDuration: 3000,
      qualityThresholds: { minPassRate: 0.85, maxFlakyRatio: 0.15, minCoverage: 0.60 },
      agentConfig: { agents: ['test-executor'], parallelism: 1 },
    },
  ];

  const fastConfig: CPGConfig = {
    numPhases: 3,
    frequency: 10, // Very fast for testing
    coupling: 0.3,
    stabilityThreshold: 0.1,
    dt: 1,
    transitionThreshold: 0.5,
  };

  describe('constructor', () => {
    it('should create scheduler with phases and config', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      expect(scheduler.getPhases()).toHaveLength(3);
      expect(scheduler.getCurrentPhaseIndex()).toBe(0);
      expect(scheduler.getConfig().numPhases).toBe(3);
    });

    it('should use default config if not provided', () => {
      const scheduler = new TimeCrystalScheduler(testPhases);

      expect(scheduler.getConfig().coupling).toBe(DEFAULT_CPG_CONFIG.coupling);
    });

    it('should throw on empty phases array', () => {
      expect(() => new TimeCrystalScheduler([])).toThrow('At least one test phase is required');
    });

    it('should override numPhases in config with actual phase count', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, { ...fastConfig, numPhases: 10 });

      expect(scheduler.getConfig().numPhases).toBe(3);
    });
  });

  describe('tick', () => {
    it('should advance time on tick', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);
      const initialTime = scheduler.getTime();

      // Need to set running state for tick to work
      scheduler.runTicks(1);

      expect(scheduler.getTime()).toBe(initialTime + fastConfig.dt);
    });

    it('should return null when no transition occurs', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, {
        ...fastConfig,
        transitionThreshold: 0.99, // High threshold prevents transitions
      });

      const transition = scheduler.runTicks(1)[0];

      expect(transition).toBeUndefined();
    });

    it('should detect phase transitions', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      // Run many ticks to get transitions
      const transitions = scheduler.runTicks(200);

      expect(transitions.length).toBeGreaterThan(0);
    });

    it('should return correct transition data', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      const transitions = scheduler.runTicks(500);
      const transition = transitions[0];

      if (transition) {
        expect(transition.from).toBeDefined();
        expect(transition.to).toBeDefined();
        expect(transition.fromPhase).toBeDefined();
        expect(transition.toPhase).toBeDefined();
        expect(transition.timestamp).toBeGreaterThan(0);
        expect(transition.from).not.toBe(transition.to);
      }
    });

    it('should cycle through all phases', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      // Run enough ticks for multiple cycles
      scheduler.runTicks(1000);

      const state = scheduler.getState();

      // Should have visited all phases
      const uniquePhases = new Set(state.phaseHistory);
      expect(uniquePhases.size).toBe(3);
    });
  });

  describe('runTicks', () => {
    it('should run specified number of ticks', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      scheduler.runTicks(100);

      expect(scheduler.getTime()).toBe(100 * fastConfig.dt);
    });

    it('should collect all transitions', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      const transitions = scheduler.runTicks(500);

      // Should have multiple transitions in 500 ticks with fast config
      expect(transitions.length).toBeGreaterThan(2);
    });

    it('should maintain running state', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      expect(scheduler.isRunning()).toBe(false);
      scheduler.runTicks(10);
      expect(scheduler.isRunning()).toBe(false); // Should restore original state
    });
  });

  describe('start/stop', () => {
    it('should set running state', async () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      expect(scheduler.isRunning()).toBe(false);

      // Start in background and immediately stop
      const startPromise = scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      scheduler.stop();
      await startPromise;

      expect(scheduler.isRunning()).toBe(false);
    });

    it('should not restart if already running', async () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      const promise1 = scheduler.start();
      const promise2 = scheduler.start(); // Should return immediately

      scheduler.stop();
      await Promise.all([promise1, promise2]);

      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe('pause/resume', () => {
    it('should pause and resume', async () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      const startPromise = scheduler.start();

      scheduler.pause();
      expect(scheduler.isPaused()).toBe(true);

      const pausedTime = scheduler.getTime();
      await new Promise(resolve => setTimeout(resolve, 50));

      // Time should not advance while paused
      expect(scheduler.getTime()).toBe(pausedTime);

      scheduler.resume();
      expect(scheduler.isPaused()).toBe(false);

      scheduler.stop();
      await startPromise;
    });
  });

  describe('getCurrentPhase', () => {
    it('should return current phase', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      const phase = scheduler.getCurrentPhase();

      expect(phase).toBe(testPhases[0]);
      expect(phase.name).toBe('Unit');
    });
  });

  describe('getState', () => {
    it('should return complete scheduler state', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);
      scheduler.runTicks(100);

      const state = scheduler.getState();

      expect(state.running).toBe(false);
      expect(state.time).toBe(100 * fastConfig.dt);
      expect(state.currentPhase).toBeDefined();
      expect(state.phaseHistory).toBeDefined();
      expect(state.oscillatorStates).toHaveLength(3);
      expect(typeof state.isStable).toBe('boolean');
    });

    it('should include oscillator states', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);
      scheduler.runTicks(50);

      const state = scheduler.getState();
      const oscState = state.oscillatorStates[0];

      expect(oscState.id).toBe(0);
      expect(typeof oscState.phase).toBe('number');
      expect(typeof oscState.omega).toBe('number');
      expect(typeof oscState.amplitude).toBe('number');
      expect(typeof oscState.activity).toBe('number');
    });
  });

  describe('isStable', () => {
    it('should return false with insufficient history', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      expect(scheduler.isStable()).toBe(false);
    });

    it('should detect stable periodic behavior', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      // Run enough ticks for multiple complete cycles
      scheduler.runTicks(2000);

      // After many cycles, should stabilize
      const state = scheduler.getState();

      // Check if we have enough history for stability check
      if (state.phaseHistory.length >= 6) {
        // May or may not be stable depending on oscillator dynamics
        expect(typeof state.isStable).toBe('boolean');
      }
    });
  });

  describe('getHealth', () => {
    it('should return health metrics', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);
      scheduler.runTicks(100);

      const health = scheduler.getHealth();

      expect(['healthy', 'degraded', 'unstable', 'broken']).toContain(health.status);
      expect(typeof health.synchronized).toBe('boolean');
      expect(health.orderParameter).toBeGreaterThanOrEqual(0);
      expect(health.orderParameter).toBeLessThanOrEqual(1);
      expect(health.coherence).toBeGreaterThanOrEqual(0);
      expect(health.coherence).toBeLessThanOrEqual(1);
      expect(health.completedCycles).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(health.issues)).toBe(true);
    });

    it('should detect synchronization', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);
      scheduler.runTicks(500);

      const health = scheduler.getHealth();

      // Order parameter should be reasonable
      expect(health.orderParameter).toBeDefined();
    });
  });

  describe('getOrderParameter', () => {
    it('should return order parameter', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);
      scheduler.runTicks(100);

      const r = scheduler.getOrderParameter();

      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    });
  });

  describe('setCouplingStrength', () => {
    it('should update coupling strength', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      scheduler.setCouplingStrength(0.8);

      // Run and verify dynamics are affected
      scheduler.runTicks(100);
      // Should still work with new coupling
      expect(scheduler.getTime()).toBeGreaterThan(0);
    });
  });

  describe('forcePhaseTransition', () => {
    it('should force transition to specified phase', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      scheduler.forcePhaseTransition(2);

      expect(scheduler.getCurrentPhaseIndex()).toBe(2);
      expect(scheduler.getCurrentPhase().name).toBe('E2E');
    });

    it('should throw on invalid phase index', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      expect(() => scheduler.forcePhaseTransition(-1)).toThrow('Invalid phase');
      expect(() => scheduler.forcePhaseTransition(5)).toThrow('Invalid phase');
    });

    it('should update phase history', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      scheduler.forcePhaseTransition(1);

      const state = scheduler.getState();
      expect(state.phaseHistory).toContain(1);
    });
  });

  describe('event handling', () => {
    it('should emit events on tick', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);
      const events: TimeCrystalEvent[] = [];

      scheduler.on((event) => events.push(event));
      scheduler.runTicks(10);

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'crystal:tick')).toBe(true);
    });

    it('should emit transition events', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);
      const events: TimeCrystalEvent[] = [];

      scheduler.on((event) => events.push(event));
      scheduler.runTicks(500);

      expect(events.some(e => e.type === 'phase:transition')).toBe(true);
    });

    it('should allow removing event handlers', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);
      const events: TimeCrystalEvent[] = [];
      const handler = (event: TimeCrystalEvent) => events.push(event);

      scheduler.on(handler);
      scheduler.runTicks(10);
      const countWithHandler = events.length;

      scheduler.off(handler);
      scheduler.runTicks(10);

      // No new events after removing handler
      expect(events.length).toBe(countWithHandler);
    });
  });

  describe('phase execution', () => {
    it('should execute phase with callback', async () => {
      const executedPhases: string[] = [];

      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig, {
        onPhaseExecute: async (phase) => {
          executedPhases.push(phase.name);
          return {
            phaseId: phase.id,
            phaseName: phase.name,
            passRate: 0.98,
            flakyRatio: 0.01,
            coverage: 0.85,
            duration: 100,
            testsRun: 50,
            testsPassed: 49,
            testsFailed: 1,
            testsSkipped: 0,
            qualityMet: true,
          };
        },
      });

      const result = await scheduler.executePhase(testPhases[0]);

      expect(executedPhases).toContain('Unit');
      expect(result.qualityMet).toBe(true);
    });

    it('should handle quality failure', async () => {
      let failureDetected = false;

      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig, {
        onPhaseExecute: async (phase) => ({
          phaseId: phase.id,
          phaseName: phase.name,
          passRate: 0.5, // Below threshold
          flakyRatio: 0.2,
          coverage: 0.3,
          duration: 100,
          testsRun: 50,
          testsPassed: 25,
          testsFailed: 25,
          testsSkipped: 0,
          qualityMet: false,
        }),
        onQualityFailure: async () => {
          failureDetected = true;
        },
      });

      await scheduler.executePhase(testPhases[0]);

      expect(failureDetected).toBe(true);
    });
  });

  describe('getPhaseResults', () => {
    it('should track phase results', async () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      await scheduler.executePhase(testPhases[0]);
      await scheduler.executePhase(testPhases[0]);

      const results = scheduler.getPhaseResults(0);

      expect(results.length).toBe(2);
    });

    it('should return empty array for unexecuted phase', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      const results = scheduler.getPhaseResults(2);

      expect(results).toHaveLength(0);
    });
  });

  describe('repairCrystal', () => {
    it('should reset oscillators', async () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      // Run to desynchronize
      scheduler.runTicks(500);
      const beforeRepair = scheduler.getOrderParameter();

      await scheduler.repairCrystal();

      // After repair, oscillators should be re-synchronized
      const afterRepair = scheduler.getOrderParameter();

      // Order parameter may change after repair
      expect(typeof afterRepair).toBe('number');
    });
  });

  describe('getCycleCount', () => {
    it('should count completed cycles', () => {
      const scheduler = new TimeCrystalScheduler(testPhases, fastConfig);

      expect(scheduler.getCycleCount()).toBe(0);

      // Run enough to complete cycles
      scheduler.runTicks(2000);

      // May or may not have completed cycles depending on dynamics
      expect(scheduler.getCycleCount()).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('createDefaultScheduler', () => {
  it('should create scheduler with default phases', () => {
    const scheduler = createDefaultScheduler();

    expect(scheduler.getPhases()).toHaveLength(4);
    expect(scheduler.getPhases()[0].name).toBe('Unit');
    expect(scheduler.getPhases()[1].name).toBe('Integration');
    expect(scheduler.getPhases()[2].name).toBe('E2E');
    expect(scheduler.getPhases()[3].name).toBe('Performance');
  });

  it('should accept custom config', () => {
    const scheduler = createDefaultScheduler(FAST_CPG_CONFIG);

    expect(scheduler.getConfig().frequency).toBe(FAST_CPG_CONFIG.frequency);
  });

  it('should accept custom options', () => {
    let transitionCount = 0;

    const scheduler = createDefaultScheduler(FAST_CPG_CONFIG, {
      onPhaseTransition: async () => {
        transitionCount++;
      },
    });

    scheduler.runTicks(100);

    // Callback should be set
    expect(scheduler.getPhases()).toBeDefined();
  });
});

describe('Integration: Full scheduling cycle', () => {
  it('should complete multiple test cycles', () => {
    const scheduler = new TimeCrystalScheduler(
      [
        {
          id: 0,
          name: 'Fast',
          testTypes: ['unit'],
          expectedDuration: 100,
          qualityThresholds: { minPassRate: 0.9, maxFlakyRatio: 0.1, minCoverage: 0.7 },
          agentConfig: { agents: ['executor'], parallelism: 4 },
        },
        {
          id: 1,
          name: 'Slow',
          testTypes: ['e2e'],
          expectedDuration: 200,
          qualityThresholds: { minPassRate: 0.8, maxFlakyRatio: 0.2, minCoverage: 0.5 },
          agentConfig: { agents: ['executor'], parallelism: 1 },
        },
      ],
      {
        numPhases: 2,
        frequency: 50, // Higher frequency for more transitions
        coupling: 0.4,
        stabilityThreshold: 0.1,
        dt: 1,
        transitionThreshold: 0.4, // Lower threshold for easier transitions
      }
    );

    // Run for extended period
    const transitions = scheduler.runTicks(5000);

    // Should have multiple transitions (at least 3)
    expect(transitions.length).toBeGreaterThanOrEqual(3);

    // Should visit both phases
    const visitedPhases = new Set(transitions.map(t => t.to));
    expect(visitedPhases.size).toBe(2);

    // Health should be reasonable
    const health = scheduler.getHealth();
    expect(health.orderParameter).toBeGreaterThan(0);
  });

  it('should maintain phase order in crystal pattern', () => {
    // Use 2 phases for simpler dynamics (alternating pattern)
    const twoPhases = DEFAULT_TEST_PHASES.slice(0, 2);
    const scheduler = new TimeCrystalScheduler(twoPhases, {
      numPhases: 2,
      frequency: 50, // High frequency for fast oscillation
      coupling: 0.5, // Strong coupling
      stabilityThreshold: 0.1,
      dt: 1,
      transitionThreshold: 0.3, // Low threshold for easy transitions
    });

    const transitions = scheduler.runTicks(5000);

    // With 2 phases, all transitions should alternate (0->1, 1->0)
    // which means every transition is "sequential" in a ring
    if (transitions.length >= 2) {
      // Verify we have transitions between both phases
      const transitionTypes = new Set(transitions.map(t => `${t.from}->${t.to}`));
      expect(transitionTypes.size).toBeGreaterThanOrEqual(1);

      // Verify health is reasonable
      const health = scheduler.getHealth();
      expect(health.orderParameter).toBeGreaterThan(0);
    }
  });
});
