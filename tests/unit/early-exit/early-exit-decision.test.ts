/**
 * Unit tests for Early Exit Decision Engine
 * ADR-033: Early Exit Testing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CoherenceEarlyExit,
  createEarlyExit,
  createCustomEarlyExit,
} from '../../../src/early-exit/early-exit-decision';
import {
  QualitySignal,
  QualityFlags,
  EarlyExitConfig,
  DEFAULT_EXIT_CONFIG,
  AGGRESSIVE_EXIT_CONFIG,
  CONSERVATIVE_EXIT_CONFIG,
} from '../../../src/early-exit/types';

describe('Coherence Early Exit Decision Engine', () => {
  let earlyExit: CoherenceEarlyExit;

  beforeEach(() => {
    earlyExit = new CoherenceEarlyExit(DEFAULT_EXIT_CONFIG, 4);
  });

  // ============================================================================
  // Basic Decision Tests
  // ============================================================================
  describe('shouldExit', () => {
    it('should not exit before target layer', () => {
      const signal: QualitySignal = {
        lambda: 95,
        lambdaPrev: 93,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      // Layer 0, target is 1 (default config)
      const decision = earlyExit.shouldExit(signal, 0);

      expect(decision.canExit).toBe(false);
      expect(decision.reason).toBe('forced_continue');
    });

    it('should allow exit at target layer with good metrics', () => {
      // First signal at layer 0
      const signal0: QualitySignal = {
        lambda: 92,
        lambdaPrev: 90,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };
      earlyExit.shouldExit(signal0, 0);

      // Second signal at layer 1 (target layer)
      const signal1: QualitySignal = {
        lambda: 91,
        lambdaPrev: 92,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      };
      const decision = earlyExit.shouldExit(signal1, 1);

      expect(decision.canExit).toBe(true);
      expect(decision.reason).toBe('confident_exit');
      expect(decision.confidence).toBeGreaterThan(0.8);
    });

    it('should not exit when lambda is too low', () => {
      // Use non-adaptive config for predictable behavior
      const fixedEarlyExit = new CoherenceEarlyExit({
        ...DEFAULT_EXIT_CONFIG,
        adaptiveExitLayer: false,
        exitLayer: 1,
      }, 4);

      // First need to process layer 0 to build stability history
      fixedEarlyExit.shouldExit({
        lambda: 65,
        lambdaPrev: 65,
        boundaryEdges: 1,
        boundaryConcentration: 0.2,
        partitionCount: 1,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      }, 0);

      // Now test layer 1 with similar low lambda (stable but below threshold)
      const signal: QualitySignal = {
        lambda: 65,
        lambdaPrev: 65,
        boundaryEdges: 1,
        boundaryConcentration: 0.2,
        partitionCount: 1,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      };

      const decision = fixedEarlyExit.shouldExit(signal, 1);

      expect(decision.canExit).toBe(false);
      expect(decision.reason).toBe('lambda_too_low');
    });

    it('should not exit when lambda is unstable', () => {
      // Use non-adaptive config for predictable behavior
      const fixedEarlyExit = new CoherenceEarlyExit({
        ...DEFAULT_EXIT_CONFIG,
        adaptiveExitLayer: false,
        exitLayer: 1,
        minLambdaForExit: 60,  // Lower threshold so we can test stability
      }, 4);

      // First signal with high lambda
      const signal0: QualitySignal = {
        lambda: 95,
        lambdaPrev: 90,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };
      fixedEarlyExit.shouldExit(signal0, 0);

      // Second signal with LARGE drop (very unstable - >26% change)
      const signal1: QualitySignal = {
        lambda: 70,  // 26% drop from 95 (large instability)
        lambdaPrev: 95,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 1,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      };
      const decision = fixedEarlyExit.shouldExit(signal1, 1);

      expect(decision.canExit).toBe(false);
      expect(decision.reason).toBe('lambda_unstable');
    });

    it('should not exit when boundaries are concentrated', () => {
      // Stable signals with high boundary concentration
      const signal0: QualitySignal = {
        lambda: 88,
        lambdaPrev: 87,
        boundaryEdges: 0,
        boundaryConcentration: 0.6,
        partitionCount: 2,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };
      earlyExit.shouldExit(signal0, 0);

      const signal1: QualitySignal = {
        lambda: 87,
        lambdaPrev: 88,
        boundaryEdges: 0,
        boundaryConcentration: 0.6,
        partitionCount: 2,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      };
      const decision = earlyExit.shouldExit(signal1, 1);

      expect(decision.canExit).toBe(false);
      expect(decision.reason).toBe('boundaries_concentrated');
    });

    it('should not exit when FORCE_CONTINUE flag is set', () => {
      const signal: QualitySignal = {
        lambda: 95,
        lambdaPrev: 94,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.FORCE_CONTINUE,
        timestamp: new Date(),
        sourceLayer: 1,
      };

      const decision = earlyExit.shouldExit(signal, 1);

      expect(decision.canExit).toBe(false);
      expect(decision.reason).toBe('forced_continue');
    });

    it('should not exit when CRITICAL_FAILURE flag is set', () => {
      // First signal
      earlyExit.shouldExit({
        lambda: 90,
        lambdaPrev: 88,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      }, 0);

      const signal: QualitySignal = {
        lambda: 85,
        lambdaPrev: 90,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 1,
        flags: QualityFlags.CRITICAL_FAILURE,
        timestamp: new Date(),
        sourceLayer: 1,
      };

      const decision = earlyExit.shouldExit(signal, 1);

      expect(decision.canExit).toBe(false);
      expect(decision.reason).toBe('critical_failure');
    });

    it('should not exit when COVERAGE_REGRESSION flag is set', () => {
      // First signal
      earlyExit.shouldExit({
        lambda: 90,
        lambdaPrev: 88,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      }, 0);

      const signal: QualitySignal = {
        lambda: 85,
        lambdaPrev: 90,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 1,
        flags: QualityFlags.COVERAGE_REGRESSION,
        timestamp: new Date(),
        sourceLayer: 1,
      };

      const decision = earlyExit.shouldExit(signal, 1);

      expect(decision.canExit).toBe(false);
      expect(decision.reason).toBe('coverage_regression');
    });
  });

  // ============================================================================
  // Adaptive Exit Layer Tests
  // ============================================================================
  describe('adaptive exit layer', () => {
    it('should allow adaptive exit layer calculation', () => {
      const adaptiveEarlyExit = new CoherenceEarlyExit({
        ...DEFAULT_EXIT_CONFIG,
        adaptiveExitLayer: true,
        exitLayer: 1,
        minLambdaForExit: 80,  // Lower threshold
        minLambdaStability: 0.85,
        minConfidence: 0.75,
      }, 4);

      // Very stable signal at layer 0
      const signal0: QualitySignal = {
        lambda: 95,
        lambdaPrev: 94.5,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const decision0 = adaptiveEarlyExit.shouldExit(signal0, 0);

      // At layer 0, even with high stability, may still need to continue
      // because adaptive mode adjusts target layer
      // The key is that the decision logic is exercised
      expect(decision0).toBeDefined();
      expect(decision0.lambdaStability).toBeGreaterThan(0);
    });

    it('should delay exit with unstable lambda', () => {
      const adaptiveEarlyExit = new CoherenceEarlyExit({
        ...DEFAULT_EXIT_CONFIG,
        adaptiveExitLayer: true,
        exitLayer: 1,
      }, 4);

      // Less stable signal
      const signal: QualitySignal = {
        lambda: 85,
        lambdaPrev: 92,
        boundaryEdges: 1,
        boundaryConcentration: 0.2,
        partitionCount: 1,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      };

      const decision = adaptiveEarlyExit.shouldExit(signal, 1);

      // Should not exit due to instability
      expect(decision.canExit).toBe(false);
    });

    it('should use fixed exit layer when adaptive is disabled', () => {
      const fixedEarlyExit = new CoherenceEarlyExit({
        ...DEFAULT_EXIT_CONFIG,
        adaptiveExitLayer: false,
        exitLayer: 2,
      }, 4);

      // Very stable signal at layer 1
      const signal: QualitySignal = {
        lambda: 95,
        lambdaPrev: 94.5,
        boundaryEdges: 0,
        boundaryConcentration: 0,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      };

      const decision = fixedEarlyExit.shouldExit(signal, 1);

      // Should not exit at layer 1, must wait for layer 2
      expect(decision.canExit).toBe(false);
      expect(decision.reason).toBe('forced_continue');
    });
  });

  // ============================================================================
  // Speculation Configuration Tests
  // ============================================================================
  describe('speculation configuration', () => {
    it('should enable speculation when configured', () => {
      const withSpeculation = new CoherenceEarlyExit({
        ...DEFAULT_EXIT_CONFIG,
        speculativeTests: 4,
      }, 4);

      // First signal
      withSpeculation.shouldExit({
        lambda: 92,
        lambdaPrev: 90,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      }, 0);

      // Stable signal at target layer
      const decision = withSpeculation.shouldExit({
        lambda: 91,
        lambdaPrev: 92,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      }, 1);

      expect(decision.canExit).toBe(true);
      expect(decision.enableSpeculation).toBe(true);
    });

    it('should disable speculation when speculativeTests is 0', () => {
      const noSpeculation = new CoherenceEarlyExit({
        ...DEFAULT_EXIT_CONFIG,
        speculativeTests: 0,
      }, 4);

      // First signal
      noSpeculation.shouldExit({
        lambda: 92,
        lambdaPrev: 90,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      }, 0);

      // Stable signal at target layer
      const decision = noSpeculation.shouldExit({
        lambda: 91,
        lambdaPrev: 92,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      }, 1);

      expect(decision.canExit).toBe(true);
      expect(decision.enableSpeculation).toBe(false);
    });
  });

  // ============================================================================
  // History and Statistics Tests
  // ============================================================================
  describe('history and statistics', () => {
    it('should track signal history', () => {
      const signal0: QualitySignal = {
        lambda: 90,
        lambdaPrev: 88,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      };

      const signal1: QualitySignal = {
        lambda: 89,
        lambdaPrev: 90,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      };

      earlyExit.shouldExit(signal0, 0);
      earlyExit.shouldExit(signal1, 1);

      const history = earlyExit.getSignalHistory();

      expect(history.length).toBe(2);
      expect(history[0].sourceLayer).toBe(0);
      expect(history[1].sourceLayer).toBe(1);
    });

    it('should track decision history', () => {
      earlyExit.shouldExit({
        lambda: 90,
        lambdaPrev: 88,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      }, 0);

      earlyExit.shouldExit({
        lambda: 89,
        lambdaPrev: 90,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      }, 1);

      const history = earlyExit.getDecisionHistory();

      expect(history.length).toBe(2);
    });

    it('should calculate statistics correctly', () => {
      // Signal that allows exit
      earlyExit.shouldExit({
        lambda: 92,
        lambdaPrev: 90,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      }, 0);

      earlyExit.shouldExit({
        lambda: 91,
        lambdaPrev: 92,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 1,
      }, 1);

      const stats = earlyExit.getStatistics();

      expect(stats.totalDecisions).toBe(2);
      expect(stats.earlyExits).toBe(1);
      expect(stats.exitRate).toBeCloseTo(0.5, 1);
      expect(stats.avgConfidence).toBeGreaterThan(0);
      expect(stats.exitReasonBreakdown).toBeDefined();
    });

    it('should reset state correctly', () => {
      earlyExit.shouldExit({
        lambda: 90,
        lambdaPrev: 88,
        boundaryEdges: 0,
        boundaryConcentration: 0.1,
        partitionCount: 0,
        flags: QualityFlags.NONE,
        timestamp: new Date(),
        sourceLayer: 0,
      }, 0);

      earlyExit.reset();

      expect(earlyExit.getSignalHistory().length).toBe(0);
      expect(earlyExit.getDecisionHistory().length).toBe(0);
    });
  });

  // ============================================================================
  // Compute Savings Estimation Tests
  // ============================================================================
  describe('estimateComputeSavings', () => {
    it('should estimate savings correctly', () => {
      const savings = earlyExit.estimateComputeSavings(1, [1000, 5000, 30000, 60000]);

      // Skipped layers 2 and 3: 30000 + 60000 = 90000ms
      expect(savings).toBe(90000);
    });

    it('should return 0 for last layer', () => {
      const savings = earlyExit.estimateComputeSavings(3, [1000, 5000, 30000, 60000]);

      expect(savings).toBe(0);
    });

    it('should use default estimates when durations not provided', () => {
      const savings = earlyExit.estimateComputeSavings(0);

      // Default estimates for remaining layers
      expect(savings).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================
  describe('factory functions', () => {
    it('should create default early exit', () => {
      const instance = createEarlyExit(4);

      expect(instance).toBeInstanceOf(CoherenceEarlyExit);
      expect(instance.getConfig()).toMatchObject(DEFAULT_EXIT_CONFIG);
    });

    it('should create custom early exit', () => {
      const customConfig: Partial<EarlyExitConfig> = {
        exitLayer: 2,
        minLambdaForExit: 90,
        minConfidence: 0.85,
      };

      const instance = createCustomEarlyExit(customConfig, 4);

      expect(instance.getConfig().exitLayer).toBe(2);
      expect(instance.getConfig().minLambdaForExit).toBe(90);
      expect(instance.getConfig().minConfidence).toBe(0.85);
    });
  });

  // ============================================================================
  // Configuration Preset Tests
  // ============================================================================
  describe('configuration presets', () => {
    it('should use aggressive config for fast feedback', () => {
      const aggressive = new CoherenceEarlyExit(AGGRESSIVE_EXIT_CONFIG, 4);

      expect(aggressive.getConfig().exitLayer).toBe(0);
      expect(aggressive.getConfig().minLambdaForExit).toBe(60);
      expect(aggressive.getConfig().minConfidence).toBe(0.70);
    });

    it('should use conservative config for high-risk changes', () => {
      const conservative = new CoherenceEarlyExit(CONSERVATIVE_EXIT_CONFIG, 4);

      expect(conservative.getConfig().exitLayer).toBe(2);
      expect(conservative.getConfig().minLambdaForExit).toBe(95);
      expect(conservative.getConfig().minConfidence).toBe(0.90);
    });
  });
});
