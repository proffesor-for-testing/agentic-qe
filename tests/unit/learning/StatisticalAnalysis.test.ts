// Mock Logger to prevent undefined errors
jest.mock('@utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    }))
  }
}));

import { StatisticalAnalysis } from '../../../src/learning/StatisticalAnalysis';
import { TestResult } from '../../../src/learning/types';

describe('StatisticalAnalysis', () => {
  describe('calculatePassRate', () => {
    it('should return 0 for empty results', () => {
      const passRate = StatisticalAnalysis.calculatePassRate([]);
      expect(passRate).toBe(0);
    });

    it('should calculate 100% pass rate for all passing tests', () => {
      const results: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() },
        { name: 'test2', passed: true, duration: 150, timestamp: Date.now() },
        { name: 'test3', passed: true, duration: 120, timestamp: Date.now() }
      ];

      const passRate = StatisticalAnalysis.calculatePassRate(results);
      expect(passRate).toBe(1);
    });

    it('should calculate 50% pass rate for half passing tests', () => {
      const results: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() },
        { name: 'test2', passed: false, duration: 150, timestamp: Date.now() }
      ];

      const passRate = StatisticalAnalysis.calculatePassRate(results);
      expect(passRate).toBe(0.5);
    });

    it('should calculate 0% pass rate for all failing tests', () => {
      const results: TestResult[] = [
        { name: 'test1', passed: false, duration: 100, timestamp: Date.now() },
        { name: 'test2', passed: false, duration: 150, timestamp: Date.now() }
      ];

      const passRate = StatisticalAnalysis.calculatePassRate(results);
      expect(passRate).toBe(0);
    });
  });

  describe('calculateVariance', () => {
    it('should return 0 for less than 2 results', () => {
      const results: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() }
      ];

      const variance = StatisticalAnalysis.calculateVariance(results);
      expect(variance).toBe(0);
    });

    it('should calculate variance correctly for uniform durations', () => {
      const results: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() },
        { name: 'test2', passed: true, duration: 100, timestamp: Date.now() },
        { name: 'test3', passed: true, duration: 100, timestamp: Date.now() }
      ];

      const variance = StatisticalAnalysis.calculateVariance(results);
      expect(variance).toBe(0);
    });

    it('should calculate variance correctly for varied durations', () => {
      const results: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() },
        { name: 'test2', passed: true, duration: 200, timestamp: Date.now() },
        { name: 'test3', passed: true, duration: 150, timestamp: Date.now() }
      ];

      const variance = StatisticalAnalysis.calculateVariance(results);
      expect(variance).toBeGreaterThan(0);
    });
  });

  describe('calculateConfidence', () => {
    it('should return 0 for empty results', () => {
      const confidence = StatisticalAnalysis.calculateConfidence([]);
      expect(confidence).toBe(0);
    });

    it('should return higher confidence for more samples with low variance', () => {
      const manyConsistentResults: TestResult[] = Array.from({ length: 100 }, (_, i) => ({
        name: `test${i}`,
        passed: true,
        duration: 100 + Math.random() * 5, // Low variance
        timestamp: Date.now()
      }));

      const fewResults: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() },
        { name: 'test2', passed: true, duration: 105, timestamp: Date.now() }
      ];

      const highConfidence = StatisticalAnalysis.calculateConfidence(manyConsistentResults);
      const lowConfidence = StatisticalAnalysis.calculateConfidence(fewResults);

      expect(highConfidence).toBeGreaterThan(lowConfidence);
    });

    it('should return confidence between 0 and 1', () => {
      const results: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() },
        { name: 'test2', passed: true, duration: 150, timestamp: Date.now() },
        { name: 'test3', passed: false, duration: 200, timestamp: Date.now() }
      ];

      const confidence = StatisticalAnalysis.calculateConfidence(results);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateMetrics', () => {
    it('should return zero metrics for empty values', () => {
      const metrics = StatisticalAnalysis.calculateMetrics([]);

      expect(metrics.mean).toBe(0);
      expect(metrics.median).toBe(0);
      expect(metrics.variance).toBe(0);
      expect(metrics.stdDev).toBe(0);
      expect(metrics.min).toBe(0);
      expect(metrics.max).toBe(0);
      expect(metrics.outliers).toEqual([]);
    });

    it('should calculate metrics correctly for simple dataset', () => {
      const values = [10, 20, 30, 40, 50];
      const metrics = StatisticalAnalysis.calculateMetrics(values);

      expect(metrics.mean).toBe(30);
      expect(metrics.median).toBe(30);
      expect(metrics.min).toBe(10);
      expect(metrics.max).toBe(50);
      expect(metrics.variance).toBeGreaterThan(0);
      expect(metrics.stdDev).toBeGreaterThan(0);
    });

    it('should identify outliers in dataset', () => {
      const values = [10, 12, 11, 13, 12, 100]; // 100 is an outlier
      const metrics = StatisticalAnalysis.calculateMetrics(values);

      expect(metrics.outliers.length).toBeGreaterThan(0);
      expect(metrics.outliers).toContain(100);
    });

    it('should calculate median correctly for even number of values', () => {
      const values = [10, 20, 30, 40];
      const metrics = StatisticalAnalysis.calculateMetrics(values);

      expect(metrics.median).toBe(25); // (20 + 30) / 2
    });

    it('should calculate median correctly for odd number of values', () => {
      const values = [10, 20, 30];
      const metrics = StatisticalAnalysis.calculateMetrics(values);

      expect(metrics.median).toBe(20);
    });
  });

  describe('isFlakyCandidate', () => {
    it('should identify flaky test with intermittent failures', () => {
      const passRate = 0.5; // 50% pass rate
      const variance = 500;

      const isFlaky = StatisticalAnalysis.isFlakyCandidate(passRate, variance);
      expect(isFlaky).toBe(true);
    });

    it('should not identify stable passing test as flaky', () => {
      const passRate = 0.99; // 99% pass rate
      const variance = 100; // Low variance

      const isFlaky = StatisticalAnalysis.isFlakyCandidate(passRate, variance);
      expect(isFlaky).toBe(false);
    });

    it('should identify test with low pass rate and high variance as flaky', () => {
      const passRate = 0.85; // 85% pass rate
      const variance = 2000; // High variance

      const isFlaky = StatisticalAnalysis.isFlakyCandidate(passRate, variance);
      expect(isFlaky).toBe(true);
    });

    it('should not identify consistently failing test as flaky', () => {
      const passRate = 0.0; // 0% pass rate
      const variance = 100;

      const isFlaky = StatisticalAnalysis.isFlakyCandidate(passRate, variance);
      expect(isFlaky).toBe(false);
    });

    it('should identify test with pass rate in flaky range', () => {
      const passRate = 0.3; // 30% pass rate (in 20-80% range)
      const variance = 500;

      const isFlaky = StatisticalAnalysis.isFlakyCandidate(passRate, variance);
      expect(isFlaky).toBe(true);
    });
  });

  describe('detectTrend', () => {
    it('should return 0 for insufficient data', () => {
      const results: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: Date.now() }
      ];

      const trend = StatisticalAnalysis.detectTrend(results);
      expect(trend).toBe(0);
    });

    it('should detect improving trend', () => {
      const now = Date.now();
      const results: TestResult[] = [
        { name: 'test1', passed: false, duration: 100, timestamp: now - 3000 },
        { name: 'test2', passed: false, duration: 100, timestamp: now - 2000 },
        { name: 'test3', passed: true, duration: 100, timestamp: now - 1000 },
        { name: 'test4', passed: true, duration: 100, timestamp: now }
      ];

      const trend = StatisticalAnalysis.detectTrend(results);
      expect(trend).toBeGreaterThan(0);
    });

    it('should detect degrading trend', () => {
      const now = Date.now();
      const results: TestResult[] = [
        { name: 'test1', passed: true, duration: 100, timestamp: now - 3000 },
        { name: 'test2', passed: true, duration: 100, timestamp: now - 2000 },
        { name: 'test3', passed: false, duration: 100, timestamp: now - 1000 },
        { name: 'test4', passed: false, duration: 100, timestamp: now }
      ];

      const trend = StatisticalAnalysis.detectTrend(results);
      expect(trend).toBeLessThan(0);
    });
  });

  describe('identifyOutliers', () => {
    it('should return empty array for insufficient data', () => {
      const outliers = StatisticalAnalysis.identifyOutliers([1, 2]);
      expect(outliers).toEqual([]);
    });

    it('should identify outliers using IQR method', () => {
      const values = [10, 12, 11, 13, 12, 11, 100, 10, 12]; // 100 is an outlier
      const outliers = StatisticalAnalysis.identifyOutliers(values);

      expect(outliers.length).toBeGreaterThan(0);
      expect(outliers).toContain(100);
    });

    it('should not identify outliers in uniform data', () => {
      const values = [10, 10, 10, 10, 10];
      const outliers = StatisticalAnalysis.identifyOutliers(values);

      expect(outliers).toEqual([]);
    });
  });

  describe('calculateCorrelation', () => {
    it('should return 0 for empty or mismatched arrays', () => {
      expect(StatisticalAnalysis.calculateCorrelation([], [])).toBe(0);
      expect(StatisticalAnalysis.calculateCorrelation([1, 2], [1])).toBe(0);
    });

    it('should calculate perfect positive correlation', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];

      const correlation = StatisticalAnalysis.calculateCorrelation(x, y);
      expect(correlation).toBeCloseTo(1, 5);
    });

    it('should calculate perfect negative correlation', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];

      const correlation = StatisticalAnalysis.calculateCorrelation(x, y);
      expect(correlation).toBeCloseTo(-1, 5);
    });

    it('should calculate no correlation', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [5, 3, 5, 3, 5]; // Random pattern

      const correlation = StatisticalAnalysis.calculateCorrelation(x, y);
      expect(Math.abs(correlation)).toBeLessThan(1);
    });
  });
});
