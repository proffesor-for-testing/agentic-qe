/**
 * Unit Tests for StatisticalAnalysis
 */

import { StatisticalAnalysis } from '../../../src/learning/StatisticalAnalysis';
import { TestResult } from '../../../src/learning/types';

describe('StatisticalAnalysis', () => {
  describe('calculatePassRate', () => {
    it('should calculate correct pass rate', () => {
      const results: TestResult[] = [
        createResult('passed'),
        createResult('passed'),
        createResult('failed'),
        createResult('passed'),
        createResult('failed')
      ];

      const passRate = StatisticalAnalysis.calculatePassRate(results);

      expect(passRate).toBeCloseTo(0.6);
    });

    it('should return 0 for empty array', () => {
      expect(StatisticalAnalysis.calculatePassRate([])).toBe(0);
    });

    it('should handle all passed', () => {
      const results = [createResult('passed'), createResult('passed')];
      expect(StatisticalAnalysis.calculatePassRate(results)).toBe(1);
    });

    it('should handle all failed', () => {
      const results = [createResult('failed'), createResult('failed')];
      expect(StatisticalAnalysis.calculatePassRate(results)).toBe(0);
    });
  });

  describe('calculateVariance', () => {
    it('should calculate variance correctly', () => {
      const results: TestResult[] = [
        { ...createResult('passed'), duration: 100 },
        { ...createResult('passed'), duration: 200 },
        { ...createResult('passed'), duration: 300 },
        { ...createResult('passed'), duration: 400 }
      ];

      const variance = StatisticalAnalysis.calculateVariance(results);

      expect(variance).toBeCloseTo(12500);
    });

    it('should return 0 for single result', () => {
      const results = [createResult('passed')];
      expect(StatisticalAnalysis.calculateVariance(results)).toBe(0);
    });

    it('should return 0 for identical durations', () => {
      const results = [
        { ...createResult('passed'), duration: 100 },
        { ...createResult('passed'), duration: 100 }
      ];
      expect(StatisticalAnalysis.calculateVariance(results)).toBe(0);
    });
  });

  describe('calculateConfidence', () => {
    it('should increase confidence with sample size', () => {
      const small = Array(10).fill(null).map(() => createResult('passed'));
      const large = Array(100).fill(null).map(() => createResult('passed'));

      const smallConfidence = StatisticalAnalysis.calculateConfidence(small);
      const largeConfidence = StatisticalAnalysis.calculateConfidence(large);

      expect(largeConfidence).toBeGreaterThan(smallConfidence);
    });

    it('should decrease confidence with high variance', () => {
      const lowVariance: TestResult[] = Array(50).fill(null).map((_, i) => ({
        ...createResult('passed'),
        duration: 100 + i
      }));

      const highVariance: TestResult[] = Array(50).fill(null).map((_, i) => ({
        ...createResult('passed'),
        duration: 100 + i * 100
      }));

      const lowVarConfidence = StatisticalAnalysis.calculateConfidence(lowVariance);
      const highVarConfidence = StatisticalAnalysis.calculateConfidence(highVariance);

      expect(lowVarConfidence).toBeGreaterThan(highVarConfidence);
    });

    it('should return 0 for empty array', () => {
      expect(StatisticalAnalysis.calculateConfidence([])).toBe(0);
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate comprehensive metrics', () => {
      const values = [10, 20, 30, 40, 50];

      const metrics = StatisticalAnalysis.calculateMetrics(values);

      expect(metrics.mean).toBeCloseTo(30);
      expect(metrics.median).toBe(30);
      expect(metrics.min).toBe(10);
      expect(metrics.max).toBe(50);
      expect(metrics.stdDev).toBeGreaterThan(0);
    });

    it('should identify outliers', () => {
      const values = [10, 12, 11, 13, 100]; // 100 is outlier

      const metrics = StatisticalAnalysis.calculateMetrics(values);

      expect(metrics.outliers.length).toBeGreaterThan(0);
      expect(metrics.outliers).toContain(100);
    });

    it('should handle empty array', () => {
      const metrics = StatisticalAnalysis.calculateMetrics([]);

      expect(metrics.mean).toBe(0);
      expect(metrics.median).toBe(0);
      expect(metrics.variance).toBe(0);
    });
  });

  describe('detectTrend', () => {
    it('should detect improving trend', () => {
      const results: TestResult[] = [
        { ...createResult('failed'), timestamp: 1000 },
        { ...createResult('failed'), timestamp: 2000 },
        { ...createResult('passed'), timestamp: 3000 },
        { ...createResult('passed'), timestamp: 4000 },
        { ...createResult('passed'), timestamp: 5000 }
      ];

      const trend = StatisticalAnalysis.detectTrend(results);

      expect(trend).toBeGreaterThan(0);
    });

    it('should detect degrading trend', () => {
      const results: TestResult[] = [
        { ...createResult('passed'), timestamp: 1000 },
        { ...createResult('passed'), timestamp: 2000 },
        { ...createResult('failed'), timestamp: 3000 },
        { ...createResult('failed'), timestamp: 4000 },
        { ...createResult('failed'), timestamp: 5000 }
      ];

      const trend = StatisticalAnalysis.detectTrend(results);

      expect(trend).toBeLessThan(0);
    });

    it('should return 0 for insufficient data', () => {
      const results = [createResult('passed'), createResult('failed')];
      expect(StatisticalAnalysis.detectTrend(results)).toBe(0);
    });
  });

  describe('calculateZScores', () => {
    it('should calculate z-scores correctly', () => {
      const results: TestResult[] = [
        { ...createResult('passed'), duration: 100 },
        { ...createResult('passed'), duration: 200 },
        { ...createResult('passed'), duration: 300 }
      ];

      const zScores = StatisticalAnalysis.calculateZScores(results);

      expect(zScores).toHaveLength(3);
      expect(Math.abs(zScores[0] + zScores[2])).toBeCloseTo(0, 1); // Symmetry
    });

    it('should return zeros for no variance', () => {
      const results: TestResult[] = [
        { ...createResult('passed'), duration: 100 },
        { ...createResult('passed'), duration: 100 }
      ];

      const zScores = StatisticalAnalysis.calculateZScores(results);

      expect(zScores.every(z => z === 0)).toBe(true);
    });
  });

  describe('identifyOutliers', () => {
    it('should identify outliers using IQR method', () => {
      const values = [10, 12, 11, 13, 14, 12, 13, 100]; // 100 is outlier

      const outliers = StatisticalAnalysis.identifyOutliers(values);

      expect(outliers).toContain(100);
    });

    it('should return empty for no outliers', () => {
      const values = [10, 11, 12, 13, 14];

      const outliers = StatisticalAnalysis.identifyOutliers(values);

      expect(outliers).toHaveLength(0);
    });

    it('should handle small arrays', () => {
      const values = [1, 2, 3];
      const outliers = StatisticalAnalysis.identifyOutliers(values);
      expect(outliers).toHaveLength(0);
    });
  });

  describe('isFlakyCandidate', () => {
    it('should identify flaky test with intermittent failures', () => {
      const isFlaky = StatisticalAnalysis.isFlakyCandidate(0.5, 500);
      expect(isFlaky).toBe(true);
    });

    it('should identify flaky test with high variance', () => {
      const isFlaky = StatisticalAnalysis.isFlakyCandidate(0.9, 2000);
      expect(isFlaky).toBe(true);
    });

    it('should not identify stable test', () => {
      const isFlaky = StatisticalAnalysis.isFlakyCandidate(1.0, 100);
      expect(isFlaky).toBe(false);
    });

    it('should not identify consistently failing test', () => {
      const isFlaky = StatisticalAnalysis.isFlakyCandidate(0.1, 100);
      expect(isFlaky).toBe(false);
    });
  });

  describe('calculateCorrelation', () => {
    it('should calculate perfect positive correlation', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];

      const correlation = StatisticalAnalysis.calculateCorrelation(x, y);

      expect(correlation).toBeCloseTo(1);
    });

    it('should calculate perfect negative correlation', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [5, 4, 3, 2, 1];

      const correlation = StatisticalAnalysis.calculateCorrelation(x, y);

      expect(correlation).toBeCloseTo(-1);
    });

    it('should return 0 for no correlation', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [3, 1, 4, 2, 5];

      const correlation = StatisticalAnalysis.calculateCorrelation(x, y);

      expect(Math.abs(correlation)).toBeLessThan(0.5);
    });

    it('should handle mismatched arrays', () => {
      const correlation = StatisticalAnalysis.calculateCorrelation([1, 2], [1, 2, 3]);
      expect(correlation).toBe(0);
    });
  });
});

// Helper function
function createResult(status: 'passed' | 'failed' | 'skipped'): TestResult {
  return {
    name: 'test',
    status,
    duration: 100,
    timestamp: Date.now()
  };
}
