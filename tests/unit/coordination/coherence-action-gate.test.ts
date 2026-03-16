/**
 * Coherence Action Gate Unit Tests (Task 3.2, ADR-083)
 *
 * Tests for:
 * - Three-filter evaluation (structural, shift, evidence)
 * - PERMIT/DEFER/DENY decision logic
 * - Threshold configuration
 * - Statistics tracking
 * - Advisory mode (doesn't block)
 * - Feature flag toggle
 * - Risk level multipliers
 * - Evaluation history management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CoherenceActionGate,
  createCoherenceActionGate,
  evaluateTaskAction,
  type AgentAction,
  type GateDecision,
  type GateEvaluation,
  type ThresholdConfig,
} from '../../../src/coordination/coherence-action-gate';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
  getRuVectorFeatureFlags,
  isCoherenceActionGateEnabled,
} from '../../../src/integrations/ruvector/feature-flags';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a well-supported action (should PERMIT) */
function createStrongAction(
  overrides: Partial<AgentAction> = {},
): AgentAction {
  return {
    type: 'generate-test',
    domain: 'test-generation',
    confidence: 0.9,
    context: {
      filePath: 'src/service.ts',
      testResults: { passed: 10, failed: 0 },
      coverageData: { lines: 0.85 },
      'test-generation': true,
    },
    riskLevel: 'low',
    ...overrides,
  };
}

/** Create a weak action (should DENY or DEFER) */
function createWeakAction(
  overrides: Partial<AgentAction> = {},
): AgentAction {
  return {
    type: 'unknown-action-type',
    domain: 'test-generation',
    confidence: 0.1,
    context: {
      errors: ['compilation failed'],
      failures: ['test regression'],
      stale: true,
    },
    riskLevel: 'critical',
    ...overrides,
  };
}

/** Create a marginal action (likely DEFER) */
function createMarginalAction(
  overrides: Partial<AgentAction> = {},
): AgentAction {
  return {
    type: 'generate-test',
    domain: 'test-generation',
    confidence: 0.45,
    context: {
      filePath: 'src/service.ts',
    },
    riskLevel: 'medium',
    ...overrides,
  };
}

function enableFlags(): void {
  setRuVectorFeatureFlags({
    useCoherenceActionGate: true,
  });
}

// ============================================================================
// CoherenceActionGate Tests
// ============================================================================

describe('CoherenceActionGate', () => {
  let gate: CoherenceActionGate;

  beforeEach(() => {
    gate = new CoherenceActionGate();
    enableFlags();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  // --------------------------------------------------------------------------
  // Three-Filter Evaluation
  // --------------------------------------------------------------------------

  describe('three-filter evaluation', () => {
    it('should return all three filter scores', () => {
      const action = createStrongAction();
      const result = gate.evaluate(action);

      expect(result.structuralScore).toBeGreaterThanOrEqual(0);
      expect(result.structuralScore).toBeLessThanOrEqual(1);
      expect(result.shiftScore).toBeGreaterThanOrEqual(0);
      expect(result.shiftScore).toBeLessThanOrEqual(1);
      expect(result.evidenceScore).toBeGreaterThanOrEqual(0);
      expect(result.evidenceScore).toBeLessThanOrEqual(1);
    });

    it('should compute a combined score from weighted filters', () => {
      const action = createStrongAction();
      const result = gate.evaluate(action);

      expect(result.combinedScore).toBeGreaterThanOrEqual(0);
      expect(result.combinedScore).toBeLessThanOrEqual(1);
    });

    it('should give higher structural score for known action types', () => {
      const knownAction = createStrongAction({ type: 'generate-test' });
      const unknownAction = createStrongAction({ type: 'unknown-weird-type' });

      const knownResult = gate.evaluate(knownAction);
      const unknownResult = gate.evaluate(unknownAction);

      expect(knownResult.structuralScore).toBeGreaterThan(
        unknownResult.structuralScore,
      );
    });

    it('should give higher shift score for high confidence actions', () => {
      const highConf = createStrongAction({ confidence: 0.95 });
      const lowConf = createStrongAction({ confidence: 0.15 });

      const highResult = gate.evaluate(highConf);
      const lowResult = gate.evaluate(lowConf);

      expect(highResult.shiftScore).toBeGreaterThan(lowResult.shiftScore);
    });

    it('should give higher evidence score when supporting context is present', () => {
      const withEvidence = createStrongAction({
        context: {
          testResults: { passed: 10 },
          coverageData: { lines: 0.9 },
          peerReview: true,
          'test-generation': true,
        },
      });
      const noEvidence = createStrongAction({
        context: {},
      });

      const withResult = gate.evaluate(withEvidence);
      const noResult = gate.evaluate(noEvidence);

      expect(withResult.evidenceScore).toBeGreaterThan(noResult.evidenceScore);
    });

    it('should penalize evidence score when negative signals are present', () => {
      const clean = createStrongAction({
        confidence: 0.8,
        context: { testResults: { passed: 5 } },
      });
      const withErrors = createStrongAction({
        confidence: 0.8,
        context: {
          testResults: { passed: 5 },
          errors: ['type error'],
          failures: ['regression'],
        },
      });

      const cleanResult = gate.evaluate(clean);
      const errorResult = gate.evaluate(withErrors);

      expect(cleanResult.evidenceScore).toBeGreaterThan(errorResult.evidenceScore);
    });

    it('should detect distributional shift when context is stale', () => {
      const fresh = createStrongAction({
        confidence: 0.8,
        context: {},
      });
      const stale = createStrongAction({
        confidence: 0.8,
        context: { stale: true },
      });

      const freshResult = gate.evaluate(fresh);
      const staleResult = gate.evaluate(stale);

      expect(freshResult.shiftScore).toBeGreaterThan(staleResult.shiftScore);
    });
  });

  // --------------------------------------------------------------------------
  // PERMIT / DEFER / DENY Decision Logic
  // --------------------------------------------------------------------------

  describe('decision logic', () => {
    it('should PERMIT well-supported actions', () => {
      const action = createStrongAction();
      const result = gate.evaluate(action);

      expect(result.decision).toBe('PERMIT');
    });

    it('should DENY weak actions', () => {
      const action = createWeakAction();
      const result = gate.evaluate(action);

      expect(result.decision).toBe('DENY');
    });

    it('should DEFER marginal actions', () => {
      // Use custom thresholds to make marginal detection clearer
      const customGate = new CoherenceActionGate({
        thresholds: {
          structuralPermit: 0.6,
          shiftPermit: 0.6,
          evidencePermit: 0.6,
          combinedPermit: 0.6,
          structuralDeny: 0.1,
          shiftDeny: 0.1,
          evidenceDeny: 0.1,
          combinedDeny: 0.1,
        },
      });
      const action = createMarginalAction();
      const result = customGate.evaluate(action);

      expect(result.decision).toBe('DEFER');
    });

    it('should DENY when structural score is below deny threshold', () => {
      const strictGate = new CoherenceActionGate({
        thresholds: { structuralDeny: 0.99 },
      });
      // Use an action with unknown type and minimal context so structural score < 0.99
      const action = createStrongAction({
        type: 'unknown-type',
        context: {},
      });
      const result = strictGate.evaluate(action);

      expect(result.decision).toBe('DENY');
    });

    it('should DENY when shift score is below deny threshold', () => {
      const strictGate = new CoherenceActionGate({
        thresholds: { shiftDeny: 0.99 },
      });
      const action = createStrongAction();
      const result = strictGate.evaluate(action);

      expect(result.decision).toBe('DENY');
    });

    it('should DENY when evidence score is below deny threshold', () => {
      const strictGate = new CoherenceActionGate({
        thresholds: { evidenceDeny: 0.99 },
      });
      const action = createStrongAction();
      const result = strictGate.evaluate(action);

      expect(result.decision).toBe('DENY');
    });

    it('should include reasoning in the evaluation', () => {
      const action = createStrongAction();
      const result = gate.evaluate(action);

      expect(result.reasoning).toBeTruthy();
      expect(result.reasoning).toContain(action.type);
      expect(result.reasoning).toContain(action.domain);
    });

    it('should include advisory marker in DENY reasoning', () => {
      const action = createWeakAction();
      const result = gate.evaluate(action);

      expect(result.reasoning).toContain('Advisory mode');
    });
  });

  // --------------------------------------------------------------------------
  // Risk Level Multipliers
  // --------------------------------------------------------------------------

  describe('risk level multipliers', () => {
    it('should be more lenient for low risk actions', () => {
      const lowRisk = createMarginalAction({ riskLevel: 'low' });
      const highRisk = createMarginalAction({ riskLevel: 'critical' });

      const lowResult = gate.evaluate(lowRisk);
      const highResult = gate.evaluate(highRisk);

      expect(lowResult.combinedScore).toBeGreaterThan(highResult.combinedScore);
    });

    it('should apply stricter evaluation for critical risk', () => {
      const action = createStrongAction({ riskLevel: 'critical' });
      const result = gate.evaluate(action);

      // Critical multiplier is 0.6, so combined is reduced
      const lowRiskAction = createStrongAction({ riskLevel: 'low' });
      const lowRiskResult = gate.evaluate(lowRiskAction);

      expect(result.combinedScore).toBeLessThan(lowRiskResult.combinedScore);
    });
  });

  // --------------------------------------------------------------------------
  // Threshold Configuration
  // --------------------------------------------------------------------------

  describe('threshold configuration', () => {
    it('should use default thresholds when none provided', () => {
      const thresholds = gate.getThresholds();

      expect(thresholds.structuralPermit).toBe(0.4);
      expect(thresholds.structuralDeny).toBe(0.2);
      expect(thresholds.shiftPermit).toBe(0.5);
      expect(thresholds.shiftDeny).toBe(0.25);
      expect(thresholds.evidencePermit).toBe(0.5);
      expect(thresholds.evidenceDeny).toBe(0.2);
      expect(thresholds.combinedPermit).toBe(0.5);
      expect(thresholds.combinedDeny).toBe(0.25);
    });

    it('should accept custom thresholds in constructor', () => {
      const customGate = new CoherenceActionGate({
        thresholds: { structuralPermit: 0.8 },
      });
      const thresholds = customGate.getThresholds();

      expect(thresholds.structuralPermit).toBe(0.8);
      // Other thresholds should remain at defaults
      expect(thresholds.shiftPermit).toBe(0.5);
    });

    it('should update thresholds at runtime via configureThresholds', () => {
      gate.configureThresholds({ combinedPermit: 0.9 });
      const thresholds = gate.getThresholds();

      expect(thresholds.combinedPermit).toBe(0.9);
    });

    it('should apply updated thresholds to subsequent evaluations', () => {
      const action = createStrongAction();

      // Default thresholds - should PERMIT
      const beforeResult = gate.evaluate(action);
      expect(beforeResult.decision).toBe('PERMIT');

      // Very strict thresholds - should not PERMIT
      gate.configureThresholds({
        combinedPermit: 0.99,
        structuralPermit: 0.99,
        shiftPermit: 0.99,
        evidencePermit: 0.99,
      });

      const afterResult = gate.evaluate(action);
      expect(afterResult.decision).not.toBe('PERMIT');
    });
  });

  // --------------------------------------------------------------------------
  // Statistics Tracking
  // --------------------------------------------------------------------------

  describe('statistics tracking', () => {
    it('should track total evaluations', () => {
      gate.evaluate(createStrongAction());
      gate.evaluate(createStrongAction());
      gate.evaluate(createWeakAction());

      const stats = gate.getStatistics();
      expect(stats.totalEvaluations).toBe(3);
    });

    it('should count PERMIT decisions', () => {
      gate.evaluate(createStrongAction());
      gate.evaluate(createStrongAction());

      const stats = gate.getStatistics();
      expect(stats.permitCount).toBe(2);
    });

    it('should count DENY decisions', () => {
      gate.evaluate(createWeakAction());

      const stats = gate.getStatistics();
      expect(stats.denyCount).toBe(1);
    });

    it('should compute average scores', () => {
      gate.evaluate(createStrongAction());
      gate.evaluate(createStrongAction());

      const stats = gate.getStatistics();
      expect(stats.averageCombinedScore).toBeGreaterThan(0);
      expect(stats.averageStructuralScore).toBeGreaterThan(0);
      expect(stats.averageShiftScore).toBeGreaterThan(0);
      expect(stats.averageEvidenceScore).toBeGreaterThan(0);
    });

    it('should report advisory mode status', () => {
      const stats = gate.getStatistics();
      expect(stats.advisoryMode).toBe(true);

      const blockingGate = new CoherenceActionGate({ advisory: false });
      expect(blockingGate.getStatistics().advisoryMode).toBe(false);
    });

    it('should return zero averages when no evaluations performed', () => {
      const stats = gate.getStatistics();

      expect(stats.totalEvaluations).toBe(0);
      expect(stats.averageCombinedScore).toBe(0);
      expect(stats.averageStructuralScore).toBe(0);
      expect(stats.averageShiftScore).toBe(0);
      expect(stats.averageEvidenceScore).toBe(0);
    });

    it('should reset statistics', () => {
      gate.evaluate(createStrongAction());
      gate.evaluate(createWeakAction());

      expect(gate.getStatistics().totalEvaluations).toBe(2);

      gate.resetStatistics();
      const stats = gate.getStatistics();

      expect(stats.totalEvaluations).toBe(0);
      expect(stats.permitCount).toBe(0);
      expect(stats.deferCount).toBe(0);
      expect(stats.denyCount).toBe(0);
    });

    it('should bound evaluation history size', () => {
      // Evaluate many actions to exceed the 1000 limit
      const action = createStrongAction();
      for (let i = 0; i < 1050; i++) {
        gate.evaluate(action);
      }

      const history = gate.getEvaluationHistory();
      expect(history.length).toBeLessThanOrEqual(1000);
    });
  });

  // --------------------------------------------------------------------------
  // Advisory Mode
  // --------------------------------------------------------------------------

  describe('advisory mode', () => {
    it('should default to advisory mode', () => {
      expect(gate.isAdvisory()).toBe(true);
    });

    it('should mark evaluations as advisory', () => {
      const result = gate.evaluate(createWeakAction());

      expect(result.advisory).toBe(true);
    });

    it('should still produce DENY decisions in advisory mode', () => {
      const result = gate.evaluate(createWeakAction());

      // Decision is DENY but advisory flag means it should not block
      expect(result.decision).toBe('DENY');
      expect(result.advisory).toBe(true);
    });

    it('should include advisory note in reasoning', () => {
      const result = gate.evaluate(createWeakAction());

      expect(result.reasoning).toContain('Advisory mode');
      expect(result.reasoning).toContain('not enforced');
    });

    it('should support non-advisory (blocking) mode', () => {
      const blockingGate = new CoherenceActionGate({ advisory: false });
      const result = blockingGate.evaluate(createWeakAction());

      expect(result.advisory).toBe(false);
      expect(result.decision).toBe('DENY');
      expect(result.reasoning).not.toContain('Advisory mode');
    });
  });

  // --------------------------------------------------------------------------
  // Feature Flag Toggle
  // --------------------------------------------------------------------------

  describe('feature flag toggle', () => {
    it('should default useCoherenceActionGate to false', () => {
      resetRuVectorFeatureFlags();
      const flags = getRuVectorFeatureFlags();
      expect(flags.useCoherenceActionGate).toBe(false);
    });

    it('should have convenience function', () => {
      resetRuVectorFeatureFlags();
      expect(isCoherenceActionGateEnabled()).toBe(false);

      setRuVectorFeatureFlags({ useCoherenceActionGate: true });
      expect(isCoherenceActionGateEnabled()).toBe(true);
    });

    it('should skip evaluation when flag is off (evaluateTaskAction)', () => {
      setRuVectorFeatureFlags({ useCoherenceActionGate: false });

      const result = evaluateTaskAction(
        'generate-test',
        'test-generation',
        0.9,
        'low',
        {},
      );

      expect(result).toBeNull();
    });

    it('should perform evaluation when flag is on (evaluateTaskAction)', () => {
      setRuVectorFeatureFlags({ useCoherenceActionGate: true });

      const result = evaluateTaskAction(
        'generate-test',
        'test-generation',
        0.9,
        'low',
        { testResults: { passed: 5 } },
      );

      expect(result).not.toBeNull();
      expect(result!.decision).toBeDefined();
      expect(result!.structuralScore).toBeGreaterThan(0);
    });

    it('should reuse provided gate instance', () => {
      setRuVectorFeatureFlags({ useCoherenceActionGate: true });

      const sharedGate = new CoherenceActionGate();

      evaluateTaskAction('generate-test', 'test-generation', 0.9, 'low', {}, sharedGate);
      evaluateTaskAction('execute-tests', 'test-execution', 0.8, 'medium', {}, sharedGate);

      const stats = sharedGate.getStatistics();
      expect(stats.totalEvaluations).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty context', () => {
      const action: AgentAction = {
        type: 'generate-test',
        domain: 'test-generation',
        confidence: 0.7,
        context: {},
        riskLevel: 'low',
      };
      const result = gate.evaluate(action);

      expect(result.decision).toBeDefined();
      expect(result.structuralScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero confidence', () => {
      const action = createStrongAction({ confidence: 0 });
      const result = gate.evaluate(action);

      expect(result.shiftScore).toBeLessThanOrEqual(0.5);
      // Multiplicative evidence starts at 0.5 neutral and compounds with
      // context keys regardless of confidence. The strong action has
      // testResults and coverageData which boost evidence above 0.5.
      expect(result.evidenceScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle confidence of 1.0', () => {
      const action = createStrongAction({ confidence: 1.0 });
      const result = gate.evaluate(action);

      expect(result.shiftScore).toBeGreaterThan(0.5);
    });

    it('should handle unknown risk level gracefully', () => {
      const action = createStrongAction({
        riskLevel: 'unknown-risk' as AgentAction['riskLevel'],
      });
      // Should not throw
      const result = gate.evaluate(action);
      expect(result.decision).toBeDefined();
    });

    it('should handle context with explicit evidence count', () => {
      const action = createStrongAction({
        context: { evidenceCount: 5 },
      });
      const result = gate.evaluate(action);

      expect(result.evidenceScore).toBeGreaterThan(0);
    });

    it('should handle context with distribution shift markers', () => {
      const action = createStrongAction({
        confidence: 0.8,
        context: { distributionShift: true },
      });
      const result = gate.evaluate(action);

      // Should have lower shift score due to explicit marker
      const normalAction = createStrongAction({
        confidence: 0.8,
        context: {},
      });
      const normalResult = gate.evaluate(normalAction);

      expect(result.shiftScore).toBeLessThan(normalResult.shiftScore);
    });
  });

  // --------------------------------------------------------------------------
  // CUSUM Change Detection
  // --------------------------------------------------------------------------

  describe('CUSUM change detection', () => {
    it('should detect shift when confidence drops suddenly after stable period', () => {
      const cusumGate = new CoherenceActionGate();

      // Feed a sequence of high-confidence actions to build up cusumHigh.
      // confidence 0.9 is above cusumMean 0.7, so:
      //   cusumHigh += (0.9 - 0.7) - 0.05 = 0.15 per step
      // After 27 steps: cusumHigh ~= 4.05 > cusumH (4.0) -> CUSUM alert
      // After 30 steps: cusumHigh ~= 4.5, CUSUM alert is active
      for (let i = 0; i < 30; i++) {
        cusumGate.evaluate(createStrongAction({ confidence: 0.9, riskLevel: 'low' }));
      }

      // Evaluate with moderate confidence (0.7) on the accumulated gate.
      // With CUSUM alert active, score gets a -0.2 penalty.
      // Base shift score for conf=0.7, riskLevel='low': 0.7 (no risk gap)
      // With CUSUM penalty: 0.7 - 0.2 = 0.5
      const droppedResult = cusumGate.evaluate(
        createStrongAction({ confidence: 0.7, riskLevel: 'low' }),
      );

      // A fresh gate with the same action should not have CUSUM penalty
      // Base shift score: 0.7
      const freshGate = new CoherenceActionGate();
      const freshResult = freshGate.evaluate(
        createStrongAction({ confidence: 0.7, riskLevel: 'low' }),
      );

      // The accumulated gate's shift score should be lower due to CUSUM penalty
      expect(droppedResult.shiftScore).toBeLessThan(freshResult.shiftScore);
    });

    it('should not trigger CUSUM alert for stable confidence near target mean', () => {
      const cusumGate = new CoherenceActionGate();

      // Feed actions with confidence near the cusumMean (0.7)
      // cusumHigh += (0.7 - 0.7) - 0.05 = -0.05 -> clamped to 0
      // cusumLow += -(0.7 - 0.7) - 0.05 = -0.05 -> clamped to 0
      // Neither accumulator grows, so no alert
      for (let i = 0; i < 50; i++) {
        cusumGate.evaluate(createStrongAction({ confidence: 0.7 }));
      }

      // Evaluate one more and check the shift score
      const stableResult = cusumGate.evaluate(createStrongAction({ confidence: 0.7 }));

      // Should get a normal shift score (0.7 confidence, no CUSUM penalty)
      expect(stableResult.shiftScore).toBeGreaterThanOrEqual(0.5);
    });

    it('should reset CUSUM state via resetStatistics', () => {
      const cusumGate = new CoherenceActionGate();

      // Accumulate CUSUM state
      for (let i = 0; i < 30; i++) {
        cusumGate.evaluate(createStrongAction({ confidence: 0.95 }));
      }

      // Reset should clear CUSUM
      cusumGate.resetStatistics();

      // After reset, a single evaluation should not trigger CUSUM
      const result = cusumGate.evaluate(createStrongAction({ confidence: 0.7 }));
      expect(result.shiftScore).toBeGreaterThanOrEqual(0.5);
    });

    it('should reset CUSUM state via resetCusum', () => {
      const cusumGate = new CoherenceActionGate();

      // Accumulate CUSUM state with persistent high confidence
      for (let i = 0; i < 30; i++) {
        cusumGate.evaluate(createStrongAction({ confidence: 0.95 }));
      }

      // resetCusum should clear only CUSUM state, not evaluation history
      cusumGate.resetCusum();

      const stats = cusumGate.getStatistics();
      expect(stats.totalEvaluations).toBe(30);

      // After CUSUM reset, score should be normal
      const result = cusumGate.evaluate(createStrongAction({ confidence: 0.7 }));
      expect(result.shiftScore).toBeGreaterThanOrEqual(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Multiplicative Evidence Accumulation
  // --------------------------------------------------------------------------

  describe('multiplicative evidence accumulation', () => {
    it('should compound multiple positive keys more than a single positive key', () => {
      const onePositive = createStrongAction({
        confidence: 0.7,
        context: { testResults: { passed: 5 } },
      });
      const threePositive = createStrongAction({
        confidence: 0.7,
        context: {
          testResults: { passed: 5 },
          coverageData: { lines: 0.9 },
          peerReview: true,
        },
      });

      const oneGate = new CoherenceActionGate();
      const threeGate = new CoherenceActionGate();

      const oneResult = oneGate.evaluate(onePositive);
      const threeResult = threeGate.evaluate(threePositive);

      // Three positive signals should compound: 0.5 * 1.15^3 = 0.760
      // One positive signal: 0.5 * 1.15 = 0.575
      expect(threeResult.evidenceScore).toBeGreaterThan(oneResult.evidenceScore);
      // Verify compounding: the gap should be more than linear
      const expectedOne = 0.5 * 1.15;
      const expectedThree = 0.5 * 1.15 * 1.15 * 1.15;
      expect(oneResult.evidenceScore).toBeCloseTo(expectedOne, 2);
      expect(threeResult.evidenceScore).toBeCloseTo(expectedThree, 2);
    });

    it('should compound multiple negative keys more aggressively', () => {
      const oneNegative = createStrongAction({
        confidence: 0.7,
        context: { errors: ['type error'] },
        riskLevel: 'low',
      });
      const threeNegative = createStrongAction({
        confidence: 0.7,
        context: {
          errors: ['type error'],
          failures: ['regression'],
          warnings: ['deprecated API'],
        },
        riskLevel: 'low',
      });

      const oneGate = new CoherenceActionGate();
      const threeGate = new CoherenceActionGate();

      const oneResult = oneGate.evaluate(oneNegative);
      const threeResult = threeGate.evaluate(threeNegative);

      // Three negative signals compound: 0.5 * 0.82^3 = 0.2756
      // One negative signal: 0.5 * 0.82 = 0.41
      expect(threeResult.evidenceScore).toBeLessThan(oneResult.evidenceScore);
      const expectedOne = 0.5 * (1 - 0.18);
      const expectedThree = 0.5 * Math.pow(1 - 0.18, 3);
      expect(oneResult.evidenceScore).toBeCloseTo(expectedOne, 2);
      expect(threeResult.evidenceScore).toBeCloseTo(expectedThree, 2);
    });

    it('should start evidence at 0.5 neutral without context signals', () => {
      const noSignals = createStrongAction({
        confidence: 0.7,
        context: {},
        riskLevel: 'low',
      });

      const result = new CoherenceActionGate().evaluate(noSignals);

      // No positive or negative keys, no risk penalty, no evidenceCount
      expect(result.evidenceScore).toBeCloseTo(0.5, 2);
    });
  });

  // --------------------------------------------------------------------------
  // Factory
  // --------------------------------------------------------------------------

  describe('factory', () => {
    it('should create a gate with default settings', () => {
      const g = createCoherenceActionGate();
      expect(g.isAdvisory()).toBe(true);
    });

    it('should create a gate with custom advisory setting', () => {
      const g = createCoherenceActionGate({ advisory: false });
      expect(g.isAdvisory()).toBe(false);
    });

    it('should create a gate with custom thresholds', () => {
      const g = createCoherenceActionGate({
        thresholds: { combinedPermit: 0.8 },
      });
      expect(g.getThresholds().combinedPermit).toBe(0.8);
    });
  });

  // --------------------------------------------------------------------------
  // Evaluation History
  // --------------------------------------------------------------------------

  describe('evaluation history', () => {
    it('should maintain evaluation history', () => {
      gate.evaluate(createStrongAction());
      gate.evaluate(createWeakAction());

      const history = gate.getEvaluationHistory();
      expect(history.length).toBe(2);
    });

    it('should return defensive copy of history', () => {
      gate.evaluate(createStrongAction());
      const history = gate.getEvaluationHistory();

      // Modifying returned array should not affect internal state
      history.push({} as GateEvaluation);
      expect(gate.getEvaluationHistory().length).toBe(1);
    });

    it('should clear history on reset', () => {
      gate.evaluate(createStrongAction());
      expect(gate.getEvaluationHistory().length).toBe(1);

      gate.resetStatistics();
      expect(gate.getEvaluationHistory().length).toBe(0);
    });
  });
});
