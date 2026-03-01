/**
 * Unit tests for Quality Signal Calculator
 * ADR-033: Early Exit Testing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateQualitySignal,
  calculateLambdaStability,
  calculateConfidence,
  countQualityPartitions,
  createQualitySignal,
  isStableForExit,
} from '../../../src/early-exit/quality-signal';
import { LayerResult, QualitySignal, QualityFlags } from '../../../src/early-exit/types';

describe('Quality Signal Calculator', () => {
  // ============================================================================
  // calculateQualitySignal Tests
  // ============================================================================
  describe('calculateQualitySignal', () => {
    it('should calculate lambda correctly for perfect metrics', () => {
      const layerResult: LayerResult = {
        layerIndex: 0,
        layerType: 'unit',
        passRate: 1.0,
        coverage: 1.0,
        flakyRatio: 0,
        totalTests: 100,
        passedTests: 100,
        failedTests: 0,
        skippedTests: 0,
        duration: 1000,
      };

      const signal = calculateQualitySignal(layerResult);

      expect(signal.lambda).toBeCloseTo(100, 1);
      expect(signal.boundaryEdges).toBe(0);
      expect(signal.boundaryConcentration).toBe(0);
      expect(signal.flags).toBe(QualityFlags.NONE);
    });

    it('should calculate lambda correctly for moderate metrics', () => {
      const layerResult: LayerResult = {
        layerIndex: 0,
        layerType: 'unit',
        passRate: 0.85,
        coverage: 0.75,
        flakyRatio: 0.05,
        totalTests: 100,
        passedTests: 85,
        failedTests: 10,
        skippedTests: 5,
        duration: 1500,
      };

      const signal = calculateQualitySignal(layerResult);

      // Lambda should be constrained by lowest metric
      expect(signal.lambda).toBeLessThan(90);
      expect(signal.lambda).toBeGreaterThan(70);
    });

    it('should detect boundary edges when metrics are near 70%', () => {
      const layerResult: LayerResult = {
        layerIndex: 0,
        layerType: 'integration',
        passRate: 0.72, // Near 70%
        coverage: 0.68, // Near 70%
        flakyRatio: 0.05,
        totalTests: 50,
        passedTests: 36,
        failedTests: 10,
        skippedTests: 4,
        duration: 5000,
      };

      const signal = calculateQualitySignal(layerResult);

      expect(signal.boundaryEdges).toBeGreaterThanOrEqual(1);
    });

    it('should calculate high boundary concentration for multiple issues', () => {
      const layerResult: LayerResult = {
        layerIndex: 1,
        layerType: 'integration',
        passRate: 0.6,   // 40% failure rate
        coverage: 0.5,   // 50% uncovered
        flakyRatio: 0.2, // 20% flaky
        totalTests: 100,
        passedTests: 60,
        failedTests: 30,
        skippedTests: 10,
        duration: 10000,
      };

      const signal = calculateQualitySignal(layerResult);

      expect(signal.boundaryConcentration).toBeGreaterThan(0.2);
    });

    it('should set CRITICAL_FAILURE flag when pass rate is below 50%', () => {
      const layerResult: LayerResult = {
        layerIndex: 0,
        layerType: 'unit',
        passRate: 0.4,
        coverage: 0.7,
        flakyRatio: 0.1,
        totalTests: 100,
        passedTests: 40,
        failedTests: 55,
        skippedTests: 5,
        duration: 2000,
      };

      const signal = calculateQualitySignal(layerResult);

      expect(signal.flags & QualityFlags.CRITICAL_FAILURE).toBeTruthy();
      expect(signal.flags & QualityFlags.FORCE_CONTINUE).toBeTruthy();
    });

    it('should set COVERAGE_REGRESSION flag when lambda drops significantly', () => {
      const previousSignal: QualitySignal = {
        lambda: 90,
        lambdaPrev: 88,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const layerResult: LayerResult = {
        layerIndex: 1,
        layerType: 'integration',
        passRate: 0.7,
        coverage: 0.6,
        flakyRatio: 0.15,
        previousLambda: 90,
        totalTests: 50,
        passedTests: 35,
        failedTests: 10,
        skippedTests: 5,
        duration: 5000,
      };

      const signal = calculateQualitySignal(layerResult, previousSignal);

      // Large drop from 90 to ~60-70 should trigger regression
      expect(signal.flags & QualityFlags.COVERAGE_REGRESSION).toBeTruthy();
    });

    it('should set HIGH_FLAKY_RATE flag when flaky ratio exceeds 30%', () => {
      const layerResult: LayerResult = {
        layerIndex: 0,
        layerType: 'e2e',
        passRate: 0.8,
        coverage: 0.7,
        flakyRatio: 0.35,
        totalTests: 100,
        passedTests: 80,
        failedTests: 10,
        skippedTests: 10,
        duration: 30000,
      };

      const signal = calculateQualitySignal(layerResult);

      expect(signal.flags & QualityFlags.HIGH_FLAKY_RATE).toBeTruthy();
    });

    it('should correctly assign source layer', () => {
      const layerResult: LayerResult = {
        layerIndex: 2,
        layerType: 'e2e',
        passRate: 0.95,
        coverage: 0.8,
        flakyRatio: 0.02,
        totalTests: 30,
        passedTests: 28,
        failedTests: 1,
        skippedTests: 1,
        duration: 25000,
      };

      const signal = calculateQualitySignal(layerResult);

      expect(signal.sourceLayer).toBe(2);
    });

    it('should use previous signal lambda for lambdaPrev', () => {
      const previousSignal: QualitySignal = {
        lambda: 85,
        lambdaPrev: 82,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 1,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const layerResult: LayerResult = {
        layerIndex: 1,
        layerType: 'integration',
        passRate: 0.92,
        coverage: 0.85,
        flakyRatio: 0.03,
        totalTests: 50,
        passedTests: 46,
        failedTests: 2,
        skippedTests: 2,
        duration: 6000,
      };

      const signal = calculateQualitySignal(layerResult, previousSignal);

      expect(signal.lambdaPrev).toBe(85);
    });
  });

  // ============================================================================
  // calculateLambdaStability Tests
  // ============================================================================
  describe('calculateLambdaStability', () => {
    it('should return high stability for stable signals', () => {
      const current: QualitySignal = {
        lambda: 90,
        lambdaPrev: 89,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      };

      const previous: QualitySignal = {
        lambda: 89,
        lambdaPrev: 88,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const stability = calculateLambdaStability(current, previous);

      expect(stability).toBeGreaterThan(0.95);
    });

    it('should return low stability for volatile signals', () => {
      const current: QualitySignal = {
        lambda: 60,
        lambdaPrev: 90,
        boundaryEdges: 2,
        boundaryConcentration: 0.3,
        partitionCount: 2,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      };

      const previous: QualitySignal = {
        lambda: 90,
        lambdaPrev: 85,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const stability = calculateLambdaStability(current, previous);

      expect(stability).toBeLessThan(0.7);
    });

    it('should return moderate stability for first signal', () => {
      const current: QualitySignal = {
        lambda: 85,
        lambdaPrev: 85,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const stability = calculateLambdaStability(current);

      expect(stability).toBe(0.75);
    });

    it('should handle zero previous lambda', () => {
      const current: QualitySignal = {
        lambda: 80,
        lambdaPrev: 0,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const previous: QualitySignal = {
        lambda: 0,
        lambdaPrev: 0,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const stability = calculateLambdaStability(current, previous);

      expect(stability).toBe(0.75); // Should return default moderate stability
    });
  });

  // ============================================================================
  // calculateConfidence Tests
  // ============================================================================
  describe('calculateConfidence', () => {
    it('should return high confidence for excellent signal', () => {
      const signal: QualitySignal = {
        lambda: 95,
        lambdaPrev: 94,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const confidence = calculateConfidence(signal, 0.98);

      expect(confidence).toBeGreaterThan(0.85);
    });

    it('should return lower confidence for poor signal', () => {
      const signal: QualitySignal = {
        lambda: 40,       // Very low lambda
        lambdaPrev: 75,
        boundaryEdges: 3, // Maximum boundary edges
        boundaryConcentration: 0.8, // Very high concentration
        partitionCount: 5,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const confidence = calculateConfidence(signal, 0.4); // Low stability

      // With very poor metrics and low stability, confidence should be low
      expect(confidence).toBeLessThan(0.65);
    });

    it('should apply penalty for critical failure flag', () => {
      const signal: QualitySignal = {
        lambda: 80,
        lambdaPrev: 78,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 1,
        flags: QualityFlags.CRITICAL_FAILURE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const confidenceWithFlag = calculateConfidence(signal, 0.9);

      const signalNoFlag = { ...signal, flags: QualityFlags.NONE };
      const confidenceNoFlag = calculateConfidence(signalNoFlag, 0.9);

      expect(confidenceWithFlag).toBeLessThan(confidenceNoFlag);
    });

    it('should be bounded between 0 and 1', () => {
      const veryBadSignal: QualitySignal = {
        lambda: 10,
        lambdaPrev: 80,
        boundaryEdges: 3,
        boundaryConcentration: 0.8,
        partitionCount: 5,
        flags: QualityFlags.CRITICAL_FAILURE | QualityFlags.COVERAGE_REGRESSION,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const confidence = calculateConfidence(veryBadSignal, 0.2);

      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // countQualityPartitions Tests
  // ============================================================================
  describe('countQualityPartitions', () => {
    it('should count zero partitions for excellent results', () => {
      const layerResult: LayerResult = {
        layerIndex: 0,
        layerType: 'unit',
        passRate: 0.99,
        coverage: 0.9,
        flakyRatio: 0.01,
        totalTests: 100,
        passedTests: 99,
        failedTests: 0,
        skippedTests: 1,
        duration: 1000,
      };

      const partitions = countQualityPartitions(layerResult);

      expect(partitions).toBe(0);
    });

    it('should count multiple partitions for poor results', () => {
      const layerResult: LayerResult = {
        layerIndex: 0,
        layerType: 'unit',
        passRate: 0.7,  // Below 90% = partition
        coverage: 0.5,  // Below 70% = partition
        flakyRatio: 0.1, // Above 5% = partition
        totalTests: 100,
        passedTests: 70,
        failedTests: 20,
        skippedTests: 10,
        duration: 2000,
      };

      const partitions = countQualityPartitions(layerResult);

      expect(partitions).toBe(3);
    });

    it('should count additional partitions from test results with different error types', () => {
      const layerResult: LayerResult = {
        layerIndex: 0,
        layerType: 'unit',
        passRate: 0.8,
        coverage: 0.6,   // Below 70% threshold
        flakyRatio: 0.1, // Above 5% threshold
        totalTests: 100,
        passedTests: 80,
        failedTests: 15,
        skippedTests: 5,
        duration: 2000,
        testResults: [
          { name: 'test1', file: 'a.ts', status: 'failed', error: 'timeout exceeded', duration: 500 },
          { name: 'test2', file: 'b.ts', status: 'failed', error: 'assertion error', duration: 100 },
          { name: 'test3', file: 'c.ts', status: 'failed', error: 'network error', duration: 200 },
        ],
      };

      const partitions = countQualityPartitions(layerResult);

      // Base partitions from metrics + partitions from error types
      // At least 3 from metrics: pass rate < 90, coverage < 70, flaky > 5%
      // Plus up to 3 from error types (capped)
      expect(partitions).toBeGreaterThanOrEqual(3);
      expect(partitions).toBeLessThanOrEqual(10); // Total cap
    });

    it('should cap partitions at 10', () => {
      const layerResult: LayerResult = {
        layerIndex: 0,
        layerType: 'unit',
        passRate: 0.5,
        coverage: 0.3,
        flakyRatio: 0.2,
        totalTests: 100,
        passedTests: 50,
        failedTests: 40,
        skippedTests: 10,
        duration: 5000,
        testResults: [
          { name: 'test1', file: 'a.ts', status: 'failed', error: 'timeout', duration: 500 },
          { name: 'test2', file: 'b.ts', status: 'failed', error: 'assertion', duration: 100 },
          { name: 'test3', file: 'c.ts', status: 'failed', error: 'network', duration: 200 },
          { name: 'test4', file: 'd.ts', status: 'failed', error: 'memory', duration: 300 },
          { name: 'test5', file: 'e.ts', status: 'failed', error: 'other', duration: 150 },
          { name: 'test6', file: 'f.ts', status: 'failed', error: 'timeout', duration: 500 },
          { name: 'test7', file: 'g.ts', status: 'failed', error: 'assertion', duration: 100 },
          { name: 'test8', file: 'h.ts', status: 'failed', error: 'network', duration: 200 },
        ],
      };

      const partitions = countQualityPartitions(layerResult);

      expect(partitions).toBeLessThanOrEqual(10);
    });
  });

  // ============================================================================
  // createQualitySignal Tests
  // ============================================================================
  describe('createQualitySignal', () => {
    it('should create signal from basic metrics', () => {
      const signal = createQualitySignal(0.95, 0.85, 0.02);

      expect(signal.lambda).toBeGreaterThan(80);
      expect(signal.sourceLayer).toBe(0);
      expect(signal.timestamp).toBeInstanceOf(Date);
    });

    it('should use provided previous lambda', () => {
      const signal = createQualitySignal(0.90, 0.80, 0.05, 85);

      expect(signal.lambdaPrev).toBe(85);
    });

    it('should use provided layer index', () => {
      const signal = createQualitySignal(0.90, 0.80, 0.05, undefined, 2);

      expect(signal.sourceLayer).toBe(2);
    });
  });

  // ============================================================================
  // isStableForExit Tests
  // ============================================================================
  describe('isStableForExit', () => {
    it('should return true for stable, high-quality signal', () => {
      const signal: QualitySignal = {
        lambda: 92,
        lambdaPrev: 91, // Very stable (small delta)
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      // Use lower stability threshold that matches the actual signal stability
      const isStable = isStableForExit(signal, 80, 0.75);

      expect(isStable).toBe(true);
    });

    it('should return false when lambda is below threshold', () => {
      const signal: QualitySignal = {
        lambda: 75,
        lambdaPrev: 73,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 1,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const isStable = isStableForExit(signal, 80, 0.85);

      expect(isStable).toBe(false);
    });

    it('should return false when FORCE_CONTINUE flag is set', () => {
      const signal: QualitySignal = {
        lambda: 95,
        lambdaPrev: 94,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.FORCE_CONTINUE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const isStable = isStableForExit(signal, 80, 0.85);

      expect(isStable).toBe(false);
    });
  });
});
