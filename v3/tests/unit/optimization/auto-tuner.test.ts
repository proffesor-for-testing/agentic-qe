/**
 * Unit Tests for Auto-Tuner
 * ADR-024: Self-Optimization Engine
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AQEAutoTuner,
  createAutoTuner,
  DEFAULT_TUNABLE_PARAMETERS,
  DEFAULT_TUNING_CONFIG,
} from '../../../src/optimization/index.js';
import type { TunableParameter, TuningConfig } from '../../../src/optimization/types.js';

describe('AQEAutoTuner', () => {
  let tuner: AQEAutoTuner;

  beforeEach(() => {
    tuner = createAutoTuner();
  });

  afterEach(() => {
    tuner.stop();
  });

  describe('Initialization', () => {
    it('should create with default parameters', () => {
      const state = tuner.getState();
      expect(state.status).toBe('idle');
      expect(Object.keys(state.currentParameters).length).toBeGreaterThan(0);
    });

    it('should create with custom parameters', () => {
      const customParams: TunableParameter[] = [
        {
          type: 'numeric',
          name: 'custom.param',
          description: 'Custom parameter',
          current: 50,
          min: 0,
          max: 100,
          metric: 'custom_metric',
          target: 80,
          higherIsBetter: true,
          weight: 1,
          enabled: true,
        },
      ];

      const customTuner = createAutoTuner(customParams);
      const state = customTuner.getState();
      expect(state.currentParameters['custom.param']).toBe(50);
      customTuner.stop();
    });

    it('should create with custom config', () => {
      const customConfig: Partial<TuningConfig> = {
        minSamplesBeforeTuning: 100,
        autoApply: true,
      };

      const customTuner = createAutoTuner(undefined, customConfig);
      const stats = customTuner.getStats();
      expect(stats.parametersTracked).toBeGreaterThan(0);
      customTuner.stop();
    });
  });

  describe('Parameter Management', () => {
    it('should get current parameter values', () => {
      const values = tuner.getCurrentParameterValues();
      expect(values['hnsw.efSearch']).toBeDefined();
      expect(values['routing.confidenceThreshold']).toBeDefined();
    });

    it('should get a specific parameter', () => {
      const param = tuner.getParameter('hnsw.efSearch');
      expect(param).toBeDefined();
      expect(param?.type).toBe('numeric');
      expect(param?.name).toBe('hnsw.efSearch');
    });

    it('should return undefined for unknown parameter', () => {
      const param = tuner.getParameter('unknown.param');
      expect(param).toBeUndefined();
    });

    it('should update numeric parameter value', () => {
      const success = tuner.setParameter('hnsw.efSearch', 200);
      expect(success).toBe(true);

      const param = tuner.getParameter('hnsw.efSearch');
      expect(param?.current).toBe(200);
    });

    it('should reject out-of-range numeric value', () => {
      const success = tuner.setParameter('hnsw.efSearch', 1000); // max is 500
      expect(success).toBe(false);
    });

    it('should update categorical parameter value', () => {
      const success = tuner.setParameter('testGen.complexityLimit', 'simple');
      expect(success).toBe(true);

      const param = tuner.getParameter('testGen.complexityLimit');
      expect(param?.current).toBe('simple');
    });

    it('should reject invalid categorical value', () => {
      const success = tuner.setParameter('testGen.complexityLimit', 'invalid');
      expect(success).toBe(false);
    });

    it('should add new parameter', () => {
      tuner.addParameter({
        type: 'numeric',
        name: 'new.param',
        description: 'New parameter',
        current: 10,
        min: 0,
        max: 20,
        metric: 'new_metric',
        target: 15,
        higherIsBetter: true,
        weight: 0.5,
        enabled: true,
      });

      const param = tuner.getParameter('new.param');
      expect(param).toBeDefined();
    });

    it('should remove parameter', () => {
      tuner.addParameter({
        type: 'numeric',
        name: 'temp.param',
        description: 'Temp parameter',
        current: 10,
        min: 0,
        max: 20,
        metric: 'temp_metric',
        target: 15,
        higherIsBetter: true,
        weight: 0.5,
        enabled: true,
      });

      const removed = tuner.removeParameter('temp.param');
      expect(removed).toBe(true);
      expect(tuner.getParameter('temp.param')).toBeUndefined();
    });

    it('should enable/disable parameter', () => {
      tuner.setParameterEnabled('hnsw.efSearch', false);
      const param = tuner.getParameter('hnsw.efSearch');
      expect(param?.enabled).toBe(false);

      tuner.setParameterEnabled('hnsw.efSearch', true);
      expect(tuner.getParameter('hnsw.efSearch')?.enabled).toBe(true);
    });

    it('should track parameter history on update', () => {
      tuner.setParameter('hnsw.efSearch', 150);
      tuner.setParameter('hnsw.efSearch', 200);

      const history = tuner.getParameterHistory();
      expect(history.length).toBe(2);
      expect(history[0].parameter).toBe('hnsw.efSearch');
      expect(history[0].reason).toBe('Manual update');
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop', () => {
      expect(tuner.isRunning()).toBe(false);

      tuner.start();
      expect(tuner.isRunning()).toBe(true);
      expect(tuner.getState().status).toBe('collecting');

      tuner.stop();
      expect(tuner.isRunning()).toBe(false);
      expect(tuner.getState().status).toBe('idle');
    });

    it('should not start twice', () => {
      tuner.start();
      tuner.start(); // Should be no-op
      expect(tuner.isRunning()).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should return initial stats', () => {
      const stats = tuner.getStats();

      expect(stats.totalCycles).toBe(0);
      expect(stats.successfulCycles).toBe(0);
      expect(stats.failedCycles).toBe(0);
      expect(stats.totalImprovements).toBe(0);
      expect(stats.parametersTracked).toBeGreaterThan(0);
      expect(stats.metricsCollected).toBeGreaterThan(0);
    });
  });

  describe('State Export/Import', () => {
    it('should export state', () => {
      tuner.setParameter('hnsw.efSearch', 150);

      const exported = tuner.exportState();

      expect(exported.parameters.length).toBeGreaterThan(0);
      expect(exported.parameterHistory.length).toBe(1);
    });

    it('should import state', () => {
      const exported = tuner.exportState();
      exported.parameters[0].current = 999; // Modify

      const newTuner = createAutoTuner();
      newTuner.importState(exported);

      expect(newTuner.getParameter(exported.parameters[0].name)?.current).toBe(999);
      newTuner.stop();
    });

    it('should clear history', () => {
      tuner.setParameter('hnsw.efSearch', 150);
      expect(tuner.getParameterHistory().length).toBe(1);

      tuner.clearHistory();

      expect(tuner.getParameterHistory().length).toBe(0);
      expect(tuner.getEvaluationHistory().length).toBe(0);
    });
  });

  describe('Event Handling', () => {
    it('should emit and receive events', async () => {
      const events: string[] = [];

      const unsubscribe = tuner.on((event) => {
        events.push(event.type);
      });

      tuner.setParameter('hnsw.efSearch', 150);

      // Trigger a cycle (will be skipped due to no data but events still emitted)
      await tuner.runTuningCycle();

      // At minimum, cycle-started should be emitted
      expect(events).toContain('cycle-started');
      // cycle-completed is also emitted even for skipped cycles
      expect(events.length).toBeGreaterThanOrEqual(1);

      unsubscribe();
    });

    it('should unsubscribe from events', () => {
      const events: string[] = [];

      const unsubscribe = tuner.on((event) => {
        events.push(event.type);
      });

      unsubscribe();

      tuner.setParameter('hnsw.efSearch', 150);

      // Events should not be captured after unsubscribe
      expect(events).toHaveLength(0);
    });
  });
});

describe('Default Configuration', () => {
  it('should have 4 default tunable parameters', () => {
    expect(DEFAULT_TUNABLE_PARAMETERS.length).toBe(4);
  });

  it('should have correct parameter names', () => {
    const names = DEFAULT_TUNABLE_PARAMETERS.map(p => p.name);
    expect(names).toContain('hnsw.efSearch');
    expect(names).toContain('routing.confidenceThreshold');
    expect(names).toContain('pattern.promotionThreshold');
    expect(names).toContain('testGen.complexityLimit');
  });

  it('should have valid numeric ranges', () => {
    for (const param of DEFAULT_TUNABLE_PARAMETERS) {
      if (param.type === 'numeric') {
        expect(param.min).toBeLessThan(param.max);
        expect(param.current).toBeGreaterThanOrEqual(param.min);
        expect(param.current).toBeLessThanOrEqual(param.max);
      }
    }
  });

  it('should have valid weights summing close to 1', () => {
    const totalWeight = DEFAULT_TUNABLE_PARAMETERS.reduce((sum, p) => sum + p.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 1);
  });

  it('should have valid default tuning config', () => {
    expect(DEFAULT_TUNING_CONFIG.minSamplesBeforeTuning).toBeGreaterThan(0);
    expect(DEFAULT_TUNING_CONFIG.tuningIntervalMs).toBeGreaterThan(0);
    expect(DEFAULT_TUNING_CONFIG.maxChangePerCycle).toBeGreaterThan(0);
    expect(DEFAULT_TUNING_CONFIG.maxChangePerCycle).toBeLessThanOrEqual(1);
    expect(DEFAULT_TUNING_CONFIG.explorationRate).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_TUNING_CONFIG.explorationRate).toBeLessThanOrEqual(1);
  });
});

describe('Parameter Applicator Registry', () => {
  let tuner: AQEAutoTuner;

  beforeEach(() => {
    tuner = createAutoTuner();
  });

  afterEach(() => {
    tuner.stop();
  });

  it('should register and retrieve applicators', () => {
    const mockApplicator = {
      parameterName: 'test.param',
      getCurrentValue: vi.fn().mockResolvedValue(100),
      setValue: vi.fn().mockResolvedValue(undefined),
    };

    tuner.registerApplicator(mockApplicator);

    const registry = tuner.getApplicatorRegistry();
    expect(registry.get('test.param')).toBe(mockApplicator);
  });

  it('should apply configuration through applicators', async () => {
    const mockApplicator = {
      parameterName: 'hnsw.efSearch',
      getCurrentValue: vi.fn().mockResolvedValue(100),
      setValue: vi.fn().mockResolvedValue(undefined),
    };

    tuner.registerApplicator(mockApplicator);

    const registry = tuner.getApplicatorRegistry();
    await registry.applyConfiguration({ 'hnsw.efSearch': 200 });

    expect(mockApplicator.setValue).toHaveBeenCalledWith(200);
  });

  it('should validate before applying if validator exists', async () => {
    const mockApplicator = {
      parameterName: 'hnsw.efSearch',
      getCurrentValue: vi.fn().mockResolvedValue(100),
      setValue: vi.fn().mockResolvedValue(undefined),
      validate: vi.fn().mockReturnValue(false), // Validation fails
    };

    tuner.registerApplicator(mockApplicator);

    const registry = tuner.getApplicatorRegistry();

    await expect(registry.applyConfiguration({ 'hnsw.efSearch': 200 }))
      .rejects.toThrow('Failed to apply');

    // setValue should NOT be called when validation fails
    expect(mockApplicator.setValue).not.toHaveBeenCalled();
  });
});

describe('Type-Safe Metric Recording', () => {
  let tuner: AQEAutoTuner;

  beforeEach(() => {
    tuner = createAutoTuner();
  });

  afterEach(() => {
    tuner.stop();
  });

  it('should record search latency', async () => {
    tuner.recordSearchLatency(5.5);
    tuner.recordSearchLatency(6.5);

    await tuner.collectMetrics();

    // Verify by collecting and checking (indirectly through tuning)
    const stats = tuner.getStats();
    expect(stats.metricsCollected).toBe(4);
  });

  it('should record routing outcomes with both flags', async () => {
    tuner.recordRoutingOutcome(true, true);  // Followed and succeeded
    tuner.recordRoutingOutcome(true, false); // Followed but failed
    tuner.recordRoutingOutcome(false, true); // Not followed but succeeded

    await tuner.collectMetrics();

    // The routing accuracy collector should have recorded these
    const stats = tuner.getStats();
    expect(stats.metricsCollected).toBe(4);
  });

  it('should record pattern quality', async () => {
    tuner.recordPatternQuality(0.85);
    tuner.recordPatternQuality(0.90);

    await tuner.collectMetrics();

    const stats = tuner.getStats();
    expect(stats.metricsCollected).toBe(4);
  });

  it('should record test maintainability', async () => {
    tuner.recordTestMaintainability(0.75);
    tuner.recordTestMaintainability(0.80);

    await tuner.collectMetrics();

    const stats = tuner.getStats();
    expect(stats.metricsCollected).toBe(4);
  });

  it('should warn when using recordMetric for routing_accuracy', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    tuner.recordMetric('routing_accuracy', 0.8);

    expect(warnSpy).toHaveBeenCalledWith(
      'Use recordRoutingOutcome(followed, success) for routing_accuracy metric'
    );

    warnSpy.mockRestore();
  });
});

describe('Real Evaluation with Applicators', () => {
  it('should apply configuration when applicators are registered', async () => {
    const appliedValues: Record<string, number | string> = {};

    const tuner = createAutoTuner(
      DEFAULT_TUNABLE_PARAMETERS,
      {
        minSamplesBeforeTuning: 1,
        evaluationsPerCycle: 1,
        evaluationPeriodMs: 10, // Short for testing
      }
    );

    // Register an applicator
    tuner.registerApplicator({
      parameterName: 'hnsw.efSearch',
      getCurrentValue: async () => 100,
      setValue: async (value) => {
        appliedValues['hnsw.efSearch'] = value;
      },
    });

    // Add some metric data
    for (let i = 0; i < 60; i++) {
      tuner.recordSearchLatency(5 + Math.random());
      tuner.recordPatternQuality(0.8 + Math.random() * 0.1);
      tuner.recordTestMaintainability(0.7 + Math.random() * 0.1);
      tuner.recordRoutingOutcome(true, Math.random() > 0.2);
      await tuner.collectMetrics();
    }

    // Run a tuning cycle
    await tuner.runTuningCycle();

    // The applicator should have been called with a new value
    expect(appliedValues['hnsw.efSearch']).toBeDefined();

    tuner.stop();
  });

  it('should fall back to simulation mode without applicators', async () => {
    const tuner = createAutoTuner(
      DEFAULT_TUNABLE_PARAMETERS,
      {
        minSamplesBeforeTuning: 1,
        evaluationsPerCycle: 1,
      }
    );

    // Add some metric data (no applicators registered)
    for (let i = 0; i < 60; i++) {
      tuner.recordSearchLatency(5 + Math.random());
      tuner.recordPatternQuality(0.8);
      tuner.recordTestMaintainability(0.7);
      tuner.recordRoutingOutcome(true, true);
      await tuner.collectMetrics();
    }

    // Should complete without error in simulation mode
    const result = await tuner.runTuningCycle();

    expect(result.evaluationsPerformed).toBe(1);
    expect(result.bestScore).toBeGreaterThan(0);

    tuner.stop();
  });
});
