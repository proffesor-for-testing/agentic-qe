/**
 * Unit Tests for Tuning Algorithm
 * ADR-024: Self-Optimization Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CoordinateDescentTuner,
  createTuningAlgorithm,
  DEFAULT_TUNABLE_PARAMETERS,
  DEFAULT_TUNING_CONFIG,
} from '../../../src/optimization/index.js';
import type {
  TunableParameter,
  EvaluationResult,
  MetricStats,
} from '../../../src/optimization/types.js';

describe('CoordinateDescentTuner', () => {
  let tuner: CoordinateDescentTuner;
  let testParameters: TunableParameter[];

  beforeEach(() => {
    tuner = new CoordinateDescentTuner();
    testParameters = [
      {
        type: 'numeric',
        name: 'param1',
        description: 'Test parameter 1',
        current: 50,
        min: 0,
        max: 100,
        step: 10,
        metric: 'metric1',
        target: 80,
        higherIsBetter: true,
        weight: 0.5,
        enabled: true,
      },
      {
        type: 'numeric',
        name: 'param2',
        description: 'Test parameter 2',
        current: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
        metric: 'metric2',
        target: 0.1,
        higherIsBetter: false,
        weight: 0.5,
        enabled: true,
      },
    ];
  });

  describe('suggestNextConfiguration', () => {
    it('should return configuration with all parameters', () => {
      const config = tuner.suggestNextConfiguration(
        testParameters,
        [],
        DEFAULT_TUNING_CONFIG
      );

      expect(config['param1']).toBeDefined();
      expect(config['param2']).toBeDefined();
    });

    it('should keep values within bounds', () => {
      // Run multiple iterations
      for (let i = 0; i < 20; i++) {
        const config = tuner.suggestNextConfiguration(
          testParameters,
          [],
          DEFAULT_TUNING_CONFIG
        );

        const param1Value = config['param1'] as number;
        const param2Value = config['param2'] as number;

        expect(param1Value).toBeGreaterThanOrEqual(0);
        expect(param1Value).toBeLessThanOrEqual(100);
        expect(param2Value).toBeGreaterThanOrEqual(0);
        expect(param2Value).toBeLessThanOrEqual(1);
      }
    });

    it('should respect disabled parameters', () => {
      testParameters[0].enabled = false;

      const config = tuner.suggestNextConfiguration(
        testParameters,
        [],
        DEFAULT_TUNING_CONFIG
      );

      // Disabled parameter should stay at current value
      expect(config['param1']).toBe(50);
    });

    it('should vary configurations based on exploration rate', () => {
      const configs: Record<string, number | string>[] = [];

      // Run with high exploration rate
      for (let i = 0; i < 10; i++) {
        configs.push(
          tuner.suggestNextConfiguration(
            testParameters,
            [],
            { ...DEFAULT_TUNING_CONFIG, explorationRate: 0.9 }
          )
        );
      }

      // Should have some variation
      const uniqueParam1 = new Set(configs.map(c => c['param1']));
      expect(uniqueParam1.size).toBeGreaterThan(1);
    });
  });

  describe('calculateScore', () => {
    it('should return 1 when all targets met', () => {
      const metricValues = {
        metric1: 80, // Target is 80, higher is better
        metric2: 0.1, // Target is 0.1, lower is better
      };

      const score = tuner.calculateScore(testParameters, metricValues);
      expect(score).toBeCloseTo(1, 1);
    });

    it('should return lower score when targets not met', () => {
      const metricValues = {
        metric1: 40, // Half of target
        metric2: 0.5, // 5x target (worse)
      };

      const score = tuner.calculateScore(testParameters, metricValues);
      expect(score).toBeLessThan(0.5);
    });

    it('should weight parameters correctly', () => {
      // Make param1 more important
      testParameters[0].weight = 0.9;
      testParameters[1].weight = 0.1;

      // param1 meets target, param2 doesn't
      const metricValues1 = {
        metric1: 80,
        metric2: 0.5,
      };

      // param1 doesn't meet target, param2 does
      const metricValues2 = {
        metric1: 40,
        metric2: 0.1,
      };

      const score1 = tuner.calculateScore(testParameters, metricValues1);
      const score2 = tuner.calculateScore(testParameters, metricValues2);

      // Score1 should be higher because param1 (higher weight) meets target
      expect(score1).toBeGreaterThan(score2);
    });

    it('should handle missing metrics', () => {
      const metricValues = {
        metric1: 80,
        // metric2 missing
      };

      const score = tuner.calculateScore(testParameters, metricValues);
      expect(score).toBeGreaterThan(0);
    });

    it('should cap score at 1 when exceeding target', () => {
      const metricValues = {
        metric1: 100, // Exceeds target of 80
        metric2: 0.05, // Better than target of 0.1
      };

      const score = tuner.calculateScore(testParameters, metricValues);
      expect(score).toBeCloseTo(1, 1);
    });
  });

  describe('generateSuggestions', () => {
    it('should return empty for insufficient history', () => {
      const suggestions = tuner.generateSuggestions(
        testParameters,
        [], // No history
        new Map()
      );

      expect(suggestions).toHaveLength(0);
    });

    it('should generate suggestions when targets not met', () => {
      // Create history
      const history: EvaluationResult[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          parameterValues: { param1: 50, param2: 0.5 },
          metricValues: { metric1: 40, metric2: 0.5 }, // Not meeting targets
          overallScore: 0.5,
          timestamp: new Date(),
          durationMs: 100,
        });
      }

      // Create metric stats
      const metricStats = new Map<string, MetricStats>();
      metricStats.set('metric1', {
        name: 'metric1',
        count: 10,
        min: 35,
        max: 45,
        mean: 40,
        median: 40,
        stdDev: 3,
        p95: 44,
        p99: 45,
        trend: 'stable',
        periodStart: new Date(),
        periodEnd: new Date(),
      });
      metricStats.set('metric2', {
        name: 'metric2',
        count: 10,
        min: 0.4,
        max: 0.6,
        mean: 0.5,
        median: 0.5,
        stdDev: 0.05,
        p95: 0.58,
        p99: 0.59,
        trend: 'stable',
        periodStart: new Date(),
        periodEnd: new Date(),
      });

      const suggestions = tuner.generateSuggestions(
        testParameters,
        history,
        metricStats
      );

      expect(suggestions.length).toBeGreaterThan(0);

      // Suggestions should have required fields
      for (const suggestion of suggestions) {
        expect(suggestion.parameterName).toBeDefined();
        expect(suggestion.currentValue).toBeDefined();
        expect(suggestion.suggestedValue).toBeDefined();
        expect(suggestion.reasoning).toBeDefined();
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should not suggest changes when targets are met', () => {
      const history: EvaluationResult[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          parameterValues: { param1: 50, param2: 0.5 },
          metricValues: { metric1: 85, metric2: 0.08 }, // Meeting targets
          overallScore: 1.0,
          timestamp: new Date(),
          durationMs: 100,
        });
      }

      const metricStats = new Map<string, MetricStats>();
      metricStats.set('metric1', {
        name: 'metric1',
        count: 10,
        min: 80,
        max: 90,
        mean: 85,
        median: 85,
        stdDev: 3,
        p95: 89,
        p99: 90,
        trend: 'stable',
        periodStart: new Date(),
        periodEnd: new Date(),
      });
      metricStats.set('metric2', {
        name: 'metric2',
        count: 10,
        min: 0.05,
        max: 0.1,
        mean: 0.08,
        median: 0.08,
        stdDev: 0.01,
        p95: 0.09,
        p99: 0.1,
        trend: 'stable',
        periodStart: new Date(),
        periodEnd: new Date(),
      });

      const suggestions = tuner.generateSuggestions(
        testParameters,
        history,
        metricStats
      );

      // Should have no suggestions or very low-priority ones
      expect(suggestions.length).toBe(0);
    });

    it('should sort suggestions by expected improvement', () => {
      const history: EvaluationResult[] = [];
      for (let i = 0; i < 10; i++) {
        history.push({
          parameterValues: { param1: 50, param2: 0.5 },
          metricValues: { metric1: 20, metric2: 0.8 }, // Far from targets
          overallScore: 0.3,
          timestamp: new Date(),
          durationMs: 100,
        });
      }

      const metricStats = new Map<string, MetricStats>();
      metricStats.set('metric1', {
        name: 'metric1',
        count: 10,
        min: 15,
        max: 25,
        mean: 20,
        median: 20,
        stdDev: 3,
        p95: 24,
        p99: 25,
        trend: 'degrading',
        periodStart: new Date(),
        periodEnd: new Date(),
      });
      metricStats.set('metric2', {
        name: 'metric2',
        count: 10,
        min: 0.7,
        max: 0.9,
        mean: 0.8,
        median: 0.8,
        stdDev: 0.05,
        p95: 0.88,
        p99: 0.89,
        trend: 'degrading',
        periodStart: new Date(),
        periodEnd: new Date(),
      });

      const suggestions = tuner.generateSuggestions(
        testParameters,
        history,
        metricStats
      );

      // Should be sorted by expected improvement (descending)
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1].expectedImprovement)
          .toBeGreaterThanOrEqual(suggestions[i].expectedImprovement);
      }
    });
  });

  describe('reset', () => {
    it('should reset internal state', () => {
      // Run some iterations
      for (let i = 0; i < 5; i++) {
        tuner.suggestNextConfiguration(testParameters, [], DEFAULT_TUNING_CONFIG);
      }

      tuner.reset();

      // After reset, should start fresh
      const config = tuner.suggestNextConfiguration(
        testParameters,
        [],
        DEFAULT_TUNING_CONFIG
      );

      expect(config).toBeDefined();
    });
  });
});

describe('createTuningAlgorithm', () => {
  it('should create a CoordinateDescentTuner', () => {
    const algorithm = createTuningAlgorithm();
    expect(algorithm).toBeInstanceOf(CoordinateDescentTuner);
  });
});

describe('Categorical Parameter Handling', () => {
  let tuner: CoordinateDescentTuner;
  let categoricalParams: TunableParameter[];

  beforeEach(() => {
    tuner = new CoordinateDescentTuner();
    categoricalParams = [
      {
        type: 'categorical',
        name: 'complexity',
        description: 'Complexity level',
        current: 'medium',
        options: ['simple', 'medium', 'complex'],
        metric: 'maintainability',
        target: 0.8,
        higherIsBetter: true,
        weight: 1,
        enabled: true,
      },
    ];
  });

  it('should handle categorical parameters', () => {
    const config = tuner.suggestNextConfiguration(
      categoricalParams,
      [],
      DEFAULT_TUNING_CONFIG
    );

    expect(['simple', 'medium', 'complex']).toContain(config['complexity']);
  });

  it('should generate suggestions for categorical parameters', () => {
    const history: EvaluationResult[] = [];
    for (let i = 0; i < 10; i++) {
      history.push({
        parameterValues: { complexity: 'medium' },
        metricValues: { maintainability: 0.5 }, // Not meeting target
        overallScore: 0.625,
        timestamp: new Date(),
        durationMs: 100,
      });
    }

    const metricStats = new Map<string, MetricStats>();
    metricStats.set('maintainability', {
      name: 'maintainability',
      count: 10,
      min: 0.4,
      max: 0.6,
      mean: 0.5,
      median: 0.5,
      stdDev: 0.05,
      p95: 0.58,
      p99: 0.59,
      trend: 'stable',
      periodStart: new Date(),
      periodEnd: new Date(),
    });

    const suggestions = tuner.generateSuggestions(
      categoricalParams,
      history,
      metricStats
    );

    expect(suggestions.length).toBeGreaterThan(0);
    // Suggested value should be one of the options
    expect(['simple', 'medium', 'complex']).toContain(suggestions[0].suggestedValue);
  });
});
