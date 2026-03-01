/**
 * Unit Tests for QualityScoreCalculator
 * ADR-023: Quality Feedback Loop System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QualityScoreCalculator,
  createQualityScoreCalculator,
} from '../../../src/feedback/quality-score-calculator.js';
import type { TestOutcome } from '../../../src/feedback/types.js';

describe('QualityScoreCalculator', () => {
  let calculator: QualityScoreCalculator;

  beforeEach(() => {
    calculator = createQualityScoreCalculator();
  });

  describe('calculateFromOutcome', () => {
    it('should calculate high quality score for excellent test', () => {
      const outcome: TestOutcome = {
        testId: 'test-1',
        testName: 'excellent test',
        passed: true,
        executionTimeMs: 50, // Fast
        coverage: { lines: 95, branches: 90, functions: 98 },
        maintainabilityScore: 0.95,
        mutationScore: 0.9,
        timestamp: new Date(),
      };

      const score = calculator.calculateFromOutcome(outcome);

      expect(score.overall).toBeGreaterThan(0.8);
      expect(score.dimensions.effectiveness).toBe(1.0);
      expect(score.dimensions.stability).toBe(1.0);
      expect(score.dimensions.performance).toBe(1.0); // <100ms
      expect(score.dimensions.maintainability).toBe(0.95);
    });

    it('should calculate low quality score for failing test', () => {
      const outcome: TestOutcome = {
        testId: 'test-2',
        testName: 'failing test',
        passed: false,
        executionTimeMs: 5000,
        coverage: { lines: 40, branches: 30, functions: 35 },
        maintainabilityScore: 0.4,
        timestamp: new Date(),
      };

      const score = calculator.calculateFromOutcome(outcome);

      expect(score.overall).toBeLessThan(0.4);
      expect(score.dimensions.effectiveness).toBe(0);
    });

    it('should penalize flaky tests', () => {
      const stableOutcome: TestOutcome = {
        testId: 'test-stable',
        testName: 'stable test',
        passed: true,
        executionTimeMs: 100,
        coverage: { lines: 80, branches: 70, functions: 85 },
        maintainabilityScore: 0.8,
        timestamp: new Date(),
      };

      const flakyOutcome: TestOutcome = {
        testId: 'test-flaky',
        testName: 'flaky test',
        passed: true,
        flaky: true,
        flakinessScore: 0.5,
        executionTimeMs: 100,
        coverage: { lines: 80, branches: 70, functions: 85 },
        maintainabilityScore: 0.8,
        timestamp: new Date(),
      };

      const stableScore = calculator.calculateFromOutcome(stableOutcome);
      const flakyScore = calculator.calculateFromOutcome(flakyOutcome);

      expect(flakyScore.dimensions.effectiveness).toBeLessThan(stableScore.dimensions.effectiveness);
      expect(flakyScore.dimensions.stability).toBeLessThan(stableScore.dimensions.stability);
      expect(flakyScore.overall).toBeLessThan(stableScore.overall);
    });

    it('should calculate performance score based on execution time', () => {
      const testCases: Array<{ time: number; expected: number }> = [
        { time: 50, expected: 1.0 },   // Excellent <100ms
        { time: 300, expected: 0.8 },  // Good <500ms
        { time: 1500, expected: 0.6 }, // Acceptable <2s
        { time: 3000, expected: 0.4 }, // Slow <5s
        { time: 8000, expected: 0.2 }, // Very slow <10s
        { time: 15000, expected: 0.1 }, // Extremely slow
      ];

      for (const { time, expected } of testCases) {
        const outcome: TestOutcome = {
          testId: `perf-${time}`,
          testName: `performance test ${time}ms`,
          passed: true,
          executionTimeMs: time,
          coverage: { lines: 80, branches: 70, functions: 85 },
          maintainabilityScore: 0.8,
          timestamp: new Date(),
        };

        const score = calculator.calculateFromOutcome(outcome);
        expect(score.dimensions.performance).toBe(expected);
      }
    });
  });

  describe('calculateAggregate', () => {
    it('should aggregate scores from multiple outcomes', () => {
      const outcomes: TestOutcome[] = [
        {
          testId: 'agg-1',
          testName: 'test 1',
          passed: true,
          executionTimeMs: 50,
          coverage: { lines: 90, branches: 85, functions: 92 },
          maintainabilityScore: 0.9,
          timestamp: new Date(),
        },
        {
          testId: 'agg-2',
          testName: 'test 2',
          passed: true,
          executionTimeMs: 100,
          coverage: { lines: 80, branches: 70, functions: 85 },
          maintainabilityScore: 0.8,
          timestamp: new Date(),
        },
        {
          testId: 'agg-3',
          testName: 'test 3',
          passed: false,
          executionTimeMs: 200,
          coverage: { lines: 60, branches: 50, functions: 55 },
          maintainabilityScore: 0.5,
          timestamp: new Date(),
        },
      ];

      const aggregate = calculator.calculateAggregate(outcomes);

      // Effectiveness: (1 + 1 + 0) / 3 = 0.67
      expect(aggregate.dimensions.effectiveness).toBeCloseTo(2 / 3, 2);
      expect(aggregate.dimensions.maintainability).toBeCloseTo(0.733, 2);
      expect(aggregate.overall).toBeGreaterThan(0);
      expect(aggregate.overall).toBeLessThan(1);
    });

    it('should return zero scores for empty outcomes', () => {
      const aggregate = calculator.calculateAggregate([]);

      expect(aggregate.overall).toBe(0);
      expect(aggregate.dimensions.effectiveness).toBe(0);
      expect(aggregate.dimensions.coverage).toBe(0);
    });
  });

  describe('calculateDelta', () => {
    it('should calculate improvement between scores', () => {
      const before = calculator.calculateFromOutcome({
        testId: 'before',
        testName: 'before test',
        passed: true,
        executionTimeMs: 500,
        coverage: { lines: 60, branches: 50, functions: 55 },
        maintainabilityScore: 0.6,
        timestamp: new Date(),
      });

      const after = calculator.calculateFromOutcome({
        testId: 'after',
        testName: 'after test',
        passed: true,
        executionTimeMs: 100,
        coverage: { lines: 85, branches: 80, functions: 88 },
        maintainabilityScore: 0.85,
        timestamp: new Date(),
      });

      const delta = calculator.calculateDelta(before, after);

      expect(delta.improved).toBe(true);
      expect(delta.overallDelta).toBeGreaterThan(0);
      expect(delta.dimensionDeltas.coverage).toBeGreaterThan(0);
      expect(delta.dimensionDeltas.performance).toBeGreaterThan(0);
      expect(delta.dimensionDeltas.maintainability).toBeGreaterThan(0);
    });

    it('should detect decline in quality', () => {
      const before = calculator.calculateFromOutcome({
        testId: 'before',
        testName: 'before test',
        passed: true,
        executionTimeMs: 50,
        coverage: { lines: 90, branches: 85, functions: 92 },
        maintainabilityScore: 0.9,
        timestamp: new Date(),
      });

      const after = calculator.calculateFromOutcome({
        testId: 'after',
        testName: 'after test',
        passed: false,
        executionTimeMs: 5000,
        coverage: { lines: 50, branches: 40, functions: 45 },
        maintainabilityScore: 0.4,
        timestamp: new Date(),
      });

      const delta = calculator.calculateDelta(before, after);

      expect(delta.improved).toBe(false);
      expect(delta.overallDelta).toBeLessThan(0);
    });
  });

  describe('getRecommendations', () => {
    it('should provide recommendations for low effectiveness', () => {
      const score = calculator.calculateFromOutcome({
        testId: 'low-eff',
        testName: 'low effectiveness',
        passed: false,
        executionTimeMs: 100,
        coverage: { lines: 80, branches: 70, functions: 85 },
        maintainabilityScore: 0.8,
        timestamp: new Date(),
      });

      const recommendations = calculator.getRecommendations(score);

      expect(recommendations.some(r => r.includes('pass rate'))).toBe(true);
    });

    it('should provide recommendations for low coverage', () => {
      const score = calculator.calculateFromOutcome({
        testId: 'low-cov',
        testName: 'low coverage',
        passed: true,
        executionTimeMs: 100,
        coverage: { lines: 50, branches: 40, functions: 45 }, // Low coverage
        maintainabilityScore: 0.8,
        timestamp: new Date(),
      });

      const recommendations = calculator.getRecommendations(score);

      expect(recommendations.some(r => r.includes('coverage'))).toBe(true);
    });

    it('should congratulate excellent quality', () => {
      const score = calculator.calculateFromOutcome({
        testId: 'excellent',
        testName: 'excellent test',
        passed: true,
        executionTimeMs: 50,
        coverage: { lines: 95, branches: 92, functions: 98 },
        maintainabilityScore: 0.95,
        mutationScore: 0.9,
        timestamp: new Date(),
      });

      const recommendations = calculator.getRecommendations(score);

      expect(recommendations.some(r => r.includes('excellent'))).toBe(true);
    });
  });

  describe('trend calculation', () => {
    it('should detect improving trend', () => {
      // Add outcomes with improving scores
      for (let i = 0; i < 20; i++) {
        calculator.calculateFromOutcome({
          testId: `trend-${i}`,
          testName: `trend test ${i}`,
          passed: true,
          executionTimeMs: Math.max(50, 500 - i * 20), // Getting faster
          coverage: {
            lines: Math.min(95, 60 + i * 2),
            branches: Math.min(90, 50 + i * 2),
            functions: Math.min(98, 55 + i * 2),
          },
          maintainabilityScore: Math.min(0.95, 0.6 + i * 0.02),
          timestamp: new Date(),
        });
      }

      const stats = calculator.getStats();
      expect(stats.currentTrend).toBe('improving');
    });

    it('should detect stable trend', () => {
      // Add consistent outcomes
      for (let i = 0; i < 20; i++) {
        calculator.calculateFromOutcome({
          testId: `stable-${i}`,
          testName: `stable test ${i}`,
          passed: true,
          executionTimeMs: 100,
          coverage: { lines: 80, branches: 70, functions: 85 },
          maintainabilityScore: 0.8,
          timestamp: new Date(),
        });
      }

      const stats = calculator.getStats();
      expect(stats.currentTrend).toBe('stable');
    });
  });

  describe('weights', () => {
    it('should use custom weights', () => {
      const customCalculator = createQualityScoreCalculator({
        effectiveness: 0.5,
        coverage: 0.3,
        mutationKill: 0.05,
        stability: 0.05,
        maintainability: 0.05,
        performance: 0.05,
      });

      const weights = customCalculator.getWeights();

      expect(weights.effectiveness).toBe(0.5);
      expect(weights.coverage).toBe(0.3);
    });

    it('should allow updating weights', () => {
      calculator.updateWeights({ effectiveness: 0.4 });
      const weights = calculator.getWeights();

      expect(weights.effectiveness).toBe(0.4);
    });
  });

  describe('clearHistory', () => {
    it('should clear historical scores', () => {
      for (let i = 0; i < 20; i++) {
        calculator.calculateFromOutcome({
          testId: `clear-${i}`,
          testName: `clear test ${i}`,
          passed: true,
          executionTimeMs: 100,
          coverage: { lines: 80, branches: 70, functions: 85 },
          maintainabilityScore: 0.8,
          timestamp: new Date(),
        });
      }

      calculator.clearHistory();
      const stats = calculator.getStats();

      expect(stats.scoresTracked).toBe(0);
    });
  });
});
