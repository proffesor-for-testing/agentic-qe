/**
 * Unit Tests for Statistical Flaky Test Detection
 *
 * @version 1.0.0
 * @author Agentic QE Team - Phase 3
 * @date 2025-11-08
 */

import { describe, it, expect } from '@jest/globals';
import {
  detectFlakyTestsStatistical,
  calculatePassRate,
  calculateVariance,
  calculateConfidence,
  countStatusTransitions,
  calculateMetrics,
  identifyFailurePattern,
  analyzeRootCause,
  calculateSeverity
} from '../../../../../src/mcp/tools/qe/flaky-detection/detect-statistical.js';
import { TestResult } from '../../../../../src/mcp/tools/qe/shared/types.js';

describe('Statistical Flaky Test Detection', () => {
  // Helper to create test results
  const createTestResult = (overrides: Partial<TestResult> = {}): TestResult => ({
    testId: 'test-1',
    name: 'Example Test',
    status: 'passed',
    duration: 1000,
    timestamp: new Date().toISOString(),
    ...overrides
  });

  describe('calculatePassRate', () => {
    it('should return 1.0 for all passing tests', () => {
      const results = [
        createTestResult({ status: 'passed' }),
        createTestResult({ status: 'passed' }),
        createTestResult({ status: 'passed' })
      ];

      expect(calculatePassRate(results)).toBe(1.0);
    });

    it('should return 0.0 for all failing tests', () => {
      const results = [
        createTestResult({ status: 'failed' }),
        createTestResult({ status: 'failed' }),
        createTestResult({ status: 'failed' })
      ];

      expect(calculatePassRate(results)).toBe(0.0);
    });

    it('should return 0.5 for 50/50 pass/fail', () => {
      const results = [
        createTestResult({ status: 'passed' }),
        createTestResult({ status: 'failed' }),
        createTestResult({ status: 'passed' }),
        createTestResult({ status: 'failed' })
      ];

      expect(calculatePassRate(results)).toBe(0.5);
    });

    it('should return 1.0 for empty results', () => {
      expect(calculatePassRate([])).toBe(1.0);
    });
  });

  describe('calculateVariance', () => {
    it('should return 0 for constant durations', () => {
      const results = [
        createTestResult({ duration: 1000 }),
        createTestResult({ duration: 1000 }),
        createTestResult({ duration: 1000 })
      ];

      expect(calculateVariance(results)).toBe(0);
    });

    it('should return positive variance for varying durations', () => {
      const results = [
        createTestResult({ duration: 1000 }),
        createTestResult({ duration: 2000 }),
        createTestResult({ duration: 3000 })
      ];

      const variance = calculateVariance(results);
      expect(variance).toBeGreaterThan(0);
      expect(variance).toBeCloseTo(666666.67, 1); // Approx variance
    });

    it('should return 0 for empty results', () => {
      expect(calculateVariance([])).toBe(0);
    });
  });

  describe('calculateConfidence', () => {
    it('should return high confidence for many consistent runs', () => {
      const results = Array.from({ length: 20 }, () =>
        createTestResult({ duration: 1000 })
      );

      const confidence = calculateConfidence(results);
      expect(confidence).toBeGreaterThan(0.8);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('should return low confidence for few runs', () => {
      const results = [
        createTestResult({ duration: 1000 }),
        createTestResult({ duration: 1000 })
      ];

      const confidence = calculateConfidence(results);
      expect(confidence).toBeLessThan(0.3);
    });

    it('should return lower confidence for high variance', () => {
      const results = Array.from({ length: 20 }, (_, i) =>
        createTestResult({ duration: 1000 + i * 1000 })
      );

      const confidence = calculateConfidence(results);
      expect(confidence).toBeLessThan(0.7);
    });

    it('should return 0 for empty results', () => {
      expect(calculateConfidence([])).toBe(0);
    });
  });

  describe('countStatusTransitions', () => {
    it('should return 0 for stable passing tests', () => {
      const results = [
        createTestResult({ status: 'passed' }),
        createTestResult({ status: 'passed' }),
        createTestResult({ status: 'passed' })
      ];

      expect(countStatusTransitions(results)).toBe(0);
    });

    it('should count transitions correctly', () => {
      const results = [
        createTestResult({ status: 'passed' }),
        createTestResult({ status: 'failed' }),
        createTestResult({ status: 'passed' }),
        createTestResult({ status: 'failed' })
      ];

      expect(countStatusTransitions(results)).toBe(3);
    });

    it('should return 0 for single result', () => {
      const results = [createTestResult({ status: 'passed' })];
      expect(countStatusTransitions(results)).toBe(0);
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate metrics correctly', () => {
      const durations = [1000, 1500, 2000, 2500, 3000];
      const metrics = calculateMetrics(durations);

      expect(metrics.mean).toBe(2000);
      expect(metrics.median).toBe(2000);
      expect(metrics.min).toBe(1000);
      expect(metrics.max).toBe(3000);
      expect(metrics.stdDev).toBeGreaterThan(0);
    });

    it('should detect outliers', () => {
      const durations = [1000, 1000, 1000, 5000]; // 5000 is outlier
      const metrics = calculateMetrics(durations);

      expect(metrics.outliers.length).toBeGreaterThan(0);
      expect(metrics.outliers).toContain(5000);
    });

    it('should handle empty array', () => {
      const metrics = calculateMetrics([]);

      expect(metrics.mean).toBe(0);
      expect(metrics.median).toBe(0);
      expect(metrics.min).toBe(0);
      expect(metrics.max).toBe(0);
      expect(metrics.outliers).toEqual([]);
    });
  });

  describe('identifyFailurePattern', () => {
    it('should identify timing pattern for high variance', () => {
      const results = [
        createTestResult({ duration: 100 }),
        createTestResult({ duration: 5000 }),
        createTestResult({ duration: 200 }),
        createTestResult({ duration: 4000 })
      ];

      expect(identifyFailurePattern(results)).toBe('timing');
    });

    it('should identify intermittent for low variance', () => {
      const results = [
        createTestResult({ duration: 1000 }),
        createTestResult({ duration: 1100 }),
        createTestResult({ duration: 1050 })
      ];

      expect(identifyFailurePattern(results)).toBe('intermittent');
    });

    it('should identify resource pattern for outliers', () => {
      const results = [
        createTestResult({ duration: 1000 }),
        createTestResult({ duration: 1000 }),
        createTestResult({ duration: 1000 }),
        createTestResult({ duration: 10000 }), // Outlier
        createTestResult({ duration: 11000 })  // Outlier
      ];

      expect(identifyFailurePattern(results)).toBe('resource');
    });
  });

  describe('analyzeRootCause', () => {
    it('should detect timing root cause', () => {
      const results = [
        createTestResult({ duration: 100 }),
        createTestResult({ duration: 5000 })
      ];

      const rootCause = analyzeRootCause('test-1', results, 'timing');

      expect(rootCause.cause).toBe('timing');
      expect(rootCause.mlConfidence).toBeGreaterThan(0.7);
      expect(rootCause.evidence.length).toBeGreaterThan(0);
    });

    it('should detect race condition root cause', () => {
      const results = [
        createTestResult({ status: 'failed' }),
        createTestResult({ status: 'failed' }),
        createTestResult({ status: 'passed' })
      ];

      const rootCause = analyzeRootCause('test-1', results, 'intermittent');

      expect(rootCause.patterns).toContain('race-condition');
      expect(rootCause.mlConfidence).toBeGreaterThan(0.8);
    });

    it('should detect isolation root cause for retries', () => {
      const results = [
        createTestResult({ retryCount: 1 }),
        createTestResult({ retryCount: 2 }),
        createTestResult({ retryCount: 0 })
      ];

      const rootCause = analyzeRootCause('test-1', results, 'intermittent');

      expect(rootCause.patterns).toContain('intermittent-failure');
      expect(rootCause.cause).toBe('isolation');
    });
  });

  describe('calculateSeverity', () => {
    it('should return critical for low pass rate', () => {
      expect(calculateSeverity(0.2, 1000)).toBe('critical');
    });

    it('should return high for medium-low pass rate', () => {
      expect(calculateSeverity(0.4, 1000)).toBe('high');
    });

    it('should return medium for medium pass rate or high variance', () => {
      expect(calculateSeverity(0.6, 6000)).toBe('medium');
      expect(calculateSeverity(0.8, 1000)).toBe('low');
    });

    it('should return low for high pass rate and low variance', () => {
      expect(calculateSeverity(0.9, 500)).toBe('low');
    });
  });

  describe('detectFlakyTestsStatistical', () => {
    it('should detect flaky test with intermittent failures', async () => {
      const testResults: TestResult[] = [
        createTestResult({ testId: 'test-1', status: 'passed' }),
        createTestResult({ testId: 'test-1', status: 'failed' }),
        createTestResult({ testId: 'test-1', status: 'passed' }),
        createTestResult({ testId: 'test-1', status: 'failed' }),
        createTestResult({ testId: 'test-1', status: 'passed' }),
        createTestResult({ testId: 'test-1', status: 'failed' })
      ];

      const result = await detectFlakyTestsStatistical({
        testResults,
        minRuns: 3,
        timeWindow: 30,
        confidenceThreshold: 0.5,
        analysisConfig: {
          algorithm: 'statistical',
          features: [],
          autoStabilize: false
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.flakyTests.length).toBeGreaterThan(0);

      const flakyTest = result.data?.flakyTests[0];
      expect(flakyTest?.passRate).toBe(0.5);
      expect(flakyTest?.severity).toBe('high');
    });

    it('should not detect stable test as flaky', async () => {
      const testResults: TestResult[] = Array.from({ length: 10 }, () =>
        createTestResult({ testId: 'test-1', status: 'passed', duration: 1000 })
      );

      const result = await detectFlakyTestsStatistical({
        testResults,
        minRuns: 5,
        timeWindow: 30,
        confidenceThreshold: 0.7,
        analysisConfig: {
          algorithm: 'statistical',
          features: [],
          autoStabilize: false
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.flakyTests.length).toBe(0);
    });

    it('should skip tests with insufficient runs', async () => {
      const testResults: TestResult[] = [
        createTestResult({ testId: 'test-1', status: 'passed' }),
        createTestResult({ testId: 'test-1', status: 'failed' })
      ];

      const result = await detectFlakyTestsStatistical({
        testResults,
        minRuns: 5,
        timeWindow: 30,
        confidenceThreshold: 0.7,
        analysisConfig: {
          algorithm: 'statistical',
          features: [],
          autoStabilize: false
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.flakyTests.length).toBe(0);
    });

    it('should generate summary statistics', async () => {
      const testResults: TestResult[] = [
        createTestResult({ testId: 'test-1', status: 'passed' }),
        createTestResult({ testId: 'test-1', status: 'failed' }),
        createTestResult({ testId: 'test-1', status: 'passed' }),
        createTestResult({ testId: 'test-1', status: 'failed' }),
        createTestResult({ testId: 'test-1', status: 'passed' }),
        createTestResult({ testId: 'test-2', status: 'passed' }),
        createTestResult({ testId: 'test-2', status: 'passed' }),
        createTestResult({ testId: 'test-2', status: 'passed' })
      ];

      const result = await detectFlakyTestsStatistical({
        testResults,
        minRuns: 3,
        timeWindow: 30,
        confidenceThreshold: 0.5,
        analysisConfig: {
          algorithm: 'statistical',
          features: [],
          autoStabilize: false
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.summary.totalTests).toBe(2);
      expect(result.data?.summary.flakyCount).toBe(1);
      expect(result.data?.summary.detectionRate).toBe(0.5);
    });
  });
});
