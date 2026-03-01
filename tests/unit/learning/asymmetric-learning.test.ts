/**
 * Asymmetric Learning Engine Tests - ADR-061
 *
 * RED phase TDD tests for the Hebbian-inspired 10:1 asymmetric
 * confidence update engine. A single failure decreases confidence
 * 10x more than a success increases it. Patterns below a viability
 * threshold are quarantined until rehabilitated.
 *
 * Structure follows Given-When-Then for every test case.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AsymmetricLearningEngine,
  DEFAULT_ASYMMETRIC_CONFIG,
  type AsymmetricLearningConfig,
  type FailureContext,
} from '../../../src/learning/asymmetric-learning.js';

describe('AsymmetricLearningEngine', () => {
  let engine: AsymmetricLearningEngine;

  beforeEach(() => {
    engine = new AsymmetricLearningEngine();
  });

  // ==========================================================================
  // computeConfidenceUpdate
  // ==========================================================================

  describe('computeConfidenceUpdate', () => {
    it('should increase confidence by successRate (0.1) on a success', () => {
      // GIVEN: A pattern with 0.5 confidence and default config
      const initial = 0.5;

      // WHEN: A success outcome is recorded
      const updated = engine.computeConfidenceUpdate(initial, 'success');

      // THEN: Confidence increases by the default successRate of 0.1
      expect(updated).toBeCloseTo(0.6, 5);
    });

    it('should decrease confidence by failureRate (1.0) on a failure', () => {
      // GIVEN: A pattern with 0.5 confidence and default config
      const initial = 0.5;

      // WHEN: A failure outcome is recorded
      const updated = engine.computeConfidenceUpdate(initial, 'failure');

      // THEN: Confidence decreases by the default failureRate of 1.0, clamped to 0
      expect(updated).toBe(0.0);
    });

    it('should maintain a 10:1 asymmetry ratio between failure and success', () => {
      // GIVEN: Default config with failureRate=1.0 and successRate=0.1
      const failureDelta = DEFAULT_ASYMMETRIC_CONFIG.failureRate;
      const successDelta = DEFAULT_ASYMMETRIC_CONFIG.successRate;

      // WHEN: We compute the ratio
      const ratio = failureDelta / successDelta;

      // THEN: The ratio is exactly 10:1
      expect(ratio).toBe(10);
    });

    it('should accumulate multiple successes correctly', () => {
      // GIVEN: A pattern starting at 0.0 confidence
      let confidence = 0.0;

      // WHEN: 5 consecutive successes are recorded
      for (let i = 0; i < 5; i++) {
        confidence = engine.computeConfidenceUpdate(confidence, 'success');
      }

      // THEN: Confidence should be 0.5 (5 * 0.1)
      expect(confidence).toBeCloseTo(0.5, 5);
    });

    it('should drop confidence dramatically after a single failure following 9 successes', () => {
      // GIVEN: A pattern that has accumulated 9 successes from 0.0
      let confidence = 0.0;
      for (let i = 0; i < 9; i++) {
        confidence = engine.computeConfidenceUpdate(confidence, 'success');
      }
      // confidence is now 0.9

      // WHEN: A single failure occurs
      confidence = engine.computeConfidenceUpdate(confidence, 'failure');

      // THEN: Confidence drops to 0.0 (0.9 - 1.0, clamped to 0)
      expect(confidence).toBe(0.0);
    });

    it('should clamp confidence to a 0.0 floor', () => {
      // GIVEN: A pattern already at 0.0 confidence
      const initial = 0.0;

      // WHEN: A failure outcome is recorded
      const updated = engine.computeConfidenceUpdate(initial, 'failure');

      // THEN: Confidence does not go below 0.0
      expect(updated).toBe(0.0);
    });

    it('should clamp confidence to a 1.0 ceiling', () => {
      // GIVEN: A pattern already at 1.0 confidence
      const initial = 1.0;

      // WHEN: A success outcome is recorded
      const updated = engine.computeConfidenceUpdate(initial, 'success');

      // THEN: Confidence does not exceed 1.0
      expect(updated).toBe(1.0);
    });

    it('should converge downward when alternating success and failure from 0.5', () => {
      // GIVEN: A pattern starting at 0.5 with alternating outcomes
      let confidence = 0.5;

      // WHEN: We alternate success and failure 5 times
      //   success: +0.1 -> 0.6
      //   failure: -1.0 -> 0.0 (clamped)
      //   success: +0.1 -> 0.1
      //   failure: -1.0 -> 0.0 (clamped)
      //   success: +0.1 -> 0.1
      for (let i = 0; i < 5; i++) {
        const outcome = i % 2 === 0 ? 'success' : 'failure';
        confidence = engine.computeConfidenceUpdate(confidence, outcome as 'success' | 'failure');
      }

      // THEN: Confidence is much lower than 0.5 (asymmetry drives it down)
      expect(confidence).toBeLessThan(0.5);
    });

    it('requires 10 successes to recover from 1 failure', () => {
      // GIVEN: A pattern starting at 0.5 confidence
      let confidence = 0.5;

      // WHEN: One failure occurs (drops to 0.0, clamped)
      confidence = engine.computeConfidenceUpdate(confidence, 'failure');
      expect(confidence).toBe(0.0);

      // AND: 10 successes are recorded to recover
      for (let i = 0; i < 10; i++) {
        confidence = engine.computeConfidenceUpdate(confidence, 'success');
      }

      // THEN: Confidence is back to roughly where it started
      // 0.0 + (10 * 0.1) = 1.0, but we started at 0.5 and went to 0
      // After 10 successes from 0: 0 + 10*0.1 = 1.0
      // The point: 10 successes from zero gets you to 1.0 (max)
      // but the recovery from a single failure at 0.5 requires 5 successes
      // to get back to 0.5. The 10:1 ratio means from any starting point,
      // it takes 10x as many successes as failures to balance out.
      expect(confidence).toBeCloseTo(1.0, 1);
    });
  });

  // ==========================================================================
  // shouldQuarantine
  // ==========================================================================

  describe('shouldQuarantine', () => {
    it('should return false when confidence is above the viability threshold', () => {
      // GIVEN: Default viability threshold of 0.3 and confidence of 0.5
      const confidence = 0.5;

      // WHEN: Quarantine check is performed
      const decision = engine.shouldQuarantine(confidence);

      // THEN: Pattern should NOT be quarantined
      expect(decision.shouldQuarantine).toBe(false);
      expect(decision.confidence).toBe(0.5);
      expect(decision.viabilityThreshold).toBe(0.3);
    });

    it('should return true when confidence is below the viability threshold', () => {
      // GIVEN: Default viability threshold of 0.3 and confidence of 0.1
      const confidence = 0.1;

      // WHEN: Quarantine check is performed
      const decision = engine.shouldQuarantine(confidence);

      // THEN: Pattern SHOULD be quarantined
      expect(decision.shouldQuarantine).toBe(true);
    });

    it('should return false when confidence is exactly at the threshold (boundary)', () => {
      // GIVEN: Default viability threshold of 0.3 and confidence exactly at 0.3
      const confidence = 0.3;

      // WHEN: Quarantine check is performed
      const decision = engine.shouldQuarantine(confidence);

      // THEN: Pattern should NOT be quarantined (at threshold is viable)
      expect(decision.shouldQuarantine).toBe(false);
    });

    it('should return true when confidence is zero', () => {
      // GIVEN: Zero confidence
      const confidence = 0.0;

      // WHEN: Quarantine check is performed
      const decision = engine.shouldQuarantine(confidence);

      // THEN: Pattern SHOULD be quarantined
      expect(decision.shouldQuarantine).toBe(true);
    });

    it('should use domain override threshold when domain is specified', () => {
      // GIVEN: Security-compliance domain with viability threshold of 0.5
      const confidence = 0.4;

      // WHEN: Quarantine check is performed with security-compliance domain
      const decision = engine.shouldQuarantine(confidence, 'security-compliance');

      // THEN: Pattern SHOULD be quarantined (0.4 < 0.5 for security-compliance)
      expect(decision.shouldQuarantine).toBe(true);
      expect(decision.viabilityThreshold).toBe(0.5);
      expect(decision.domain).toBe('security-compliance');
    });
  });

  // ==========================================================================
  // classifyFailure
  // ==========================================================================

  describe('classifyFailure', () => {
    it('should recognize an explicit infrastructure flag', () => {
      // GIVEN: A failure context with infrastructureHealthy explicitly false
      const context: FailureContext = {
        infrastructureHealthy: false,
        errorMessage: 'Some unrelated error',
      };

      // WHEN: The failure is classified
      const classification = engine.classifyFailure(context);

      // THEN: It is classified as infrastructure
      expect(classification).toBe('infrastructure');
    });

    it('should classify timeout (>30s) as infrastructure', () => {
      // GIVEN: A failure that took over 30 seconds
      const context: FailureContext = {
        durationMs: 31_000,
        errorMessage: 'Operation timed out',
      };

      // WHEN: The failure is classified
      const classification = engine.classifyFailure(context);

      // THEN: It is classified as infrastructure
      expect(classification).toBe('infrastructure');
    });

    it('should classify ECONNREFUSED as infrastructure', () => {
      // GIVEN: An error message containing ECONNREFUSED
      const context: FailureContext = {
        errorMessage: 'connect ECONNREFUSED 127.0.0.1:5432',
      };

      // WHEN: The failure is classified
      const classification = engine.classifyFailure(context);

      // THEN: It is classified as infrastructure
      expect(classification).toBe('infrastructure');
    });

    it('should classify ETIMEOUT as infrastructure', () => {
      // GIVEN: An error message containing ETIMEOUT
      const context: FailureContext = {
        errorMessage: 'Error: ETIMEOUT - connection timed out',
      };

      // WHEN: The failure is classified
      const classification = engine.classifyFailure(context);

      // THEN: It is classified as infrastructure
      expect(classification).toBe('infrastructure');
    });

    it('should classify ENOMEM as infrastructure', () => {
      // GIVEN: An error message containing ENOMEM
      const context: FailureContext = {
        errorMessage: 'ENOMEM: not enough memory, cannot allocate',
      };

      // WHEN: The failure is classified
      const classification = engine.classifyFailure(context);

      // THEN: It is classified as infrastructure
      expect(classification).toBe('infrastructure');
    });

    it('should classify a normal assertion error as pattern failure', () => {
      // GIVEN: A normal test assertion failure with no infra signals
      const context: FailureContext = {
        errorMessage: 'AssertionError: expected true to be false',
        durationMs: 150,
        infrastructureHealthy: true,
      };

      // WHEN: The failure is classified
      const classification = engine.classifyFailure(context);

      // THEN: It is classified as a pattern failure
      expect(classification).toBe('pattern');
    });

    it('should default to pattern when context is empty or unknown', () => {
      // GIVEN: An empty failure context with no diagnostic information
      const context: FailureContext = {};

      // WHEN: The failure is classified
      const classification = engine.classifyFailure(context);

      // THEN: It defaults to pattern (blame the pattern)
      expect(classification).toBe('pattern');
    });
  });

  // ==========================================================================
  // checkRehabilitation
  // ==========================================================================

  describe('checkRehabilitation', () => {
    it('should return false when consecutive successes are below threshold', () => {
      // GIVEN: A quarantined pattern with only 5 consecutive successes
      const consecutiveSuccesses = 5;

      // WHEN: Rehabilitation check is performed
      const result = engine.checkRehabilitation(consecutiveSuccesses);

      // THEN: Cannot rehabilitate (5 < 10)
      expect(result.canRehabilitate).toBe(false);
      expect(result.consecutiveSuccesses).toBe(5);
      expect(result.requiredSuccesses).toBe(10);
    });

    it('should return true when consecutive successes are at the threshold', () => {
      // GIVEN: A quarantined pattern with exactly 10 consecutive successes
      const consecutiveSuccesses = 10;

      // WHEN: Rehabilitation check is performed
      const result = engine.checkRehabilitation(consecutiveSuccesses);

      // THEN: CAN rehabilitate (10 >= 10)
      expect(result.canRehabilitate).toBe(true);
      expect(result.consecutiveSuccesses).toBe(10);
    });

    it('should return true when consecutive successes exceed the threshold', () => {
      // GIVEN: A quarantined pattern with 15 consecutive successes
      const consecutiveSuccesses = 15;

      // WHEN: Rehabilitation check is performed
      const result = engine.checkRehabilitation(consecutiveSuccesses);

      // THEN: CAN rehabilitate (15 >= 10)
      expect(result.canRehabilitate).toBe(true);
    });

    it('should respect custom rehabilitation threshold via config', () => {
      // GIVEN: An engine with a custom rehabilitation threshold of 5
      const customEngine = new AsymmetricLearningEngine({
        rehabilitationThreshold: 5,
      });

      // WHEN: Rehabilitation check with 5 consecutive successes
      const result = customEngine.checkRehabilitation(5);

      // THEN: CAN rehabilitate (5 >= 5 with custom threshold)
      expect(result.canRehabilitate).toBe(true);
      expect(result.requiredSuccesses).toBe(5);
    });

    it('should return false when zero successes are recorded', () => {
      // GIVEN: A quarantined pattern with 0 consecutive successes
      const consecutiveSuccesses = 0;

      // WHEN: Rehabilitation check is performed
      const result = engine.checkRehabilitation(consecutiveSuccesses);

      // THEN: Cannot rehabilitate
      expect(result.canRehabilitate).toBe(false);
      expect(result.consecutiveSuccesses).toBe(0);
    });
  });

  // ==========================================================================
  // domain-specific config
  // ==========================================================================

  describe('domain-specific config', () => {
    it('should use 20:1 ratio for security-compliance domain', () => {
      // GIVEN: Default engine with security-compliance override
      // security-compliance: successRate=0.05, failureRate=1.0 -> 20:1

      // WHEN: We get the config for security-compliance
      const config = engine.getConfigForDomain('security-compliance');

      // THEN: The rates produce a 20:1 ratio
      expect(config.successRate).toBe(0.05);
      expect(config.failureRate).toBe(1.0);
      expect(config.failureRate / config.successRate).toBe(20);
    });

    it('should use ~7:1 ratio for test-generation domain', () => {
      // GIVEN: Default engine with test-generation override
      // test-generation: successRate=0.15, failureRate=1.0 -> ~6.67:1

      // WHEN: We get the config for test-generation
      const config = engine.getConfigForDomain('test-generation');

      // THEN: The rates produce approximately 7:1 ratio
      expect(config.successRate).toBe(0.15);
      expect(config.failureRate).toBe(1.0);
      const ratio = config.failureRate / config.successRate;
      expect(ratio).toBeCloseTo(6.67, 1);
    });

    it('should use default 10:1 for unknown domains', () => {
      // GIVEN: A domain name that has no override
      const unknownDomain = 'some-unknown-domain';

      // WHEN: We get the config for that domain
      const config = engine.getConfigForDomain(unknownDomain);

      // THEN: Falls back to defaults (10:1)
      expect(config.successRate).toBe(0.1);
      expect(config.failureRate).toBe(1.0);
      expect(config.viabilityThreshold).toBe(0.3);
    });
  });

  // ==========================================================================
  // getAsymmetryRatio
  // ==========================================================================

  describe('getAsymmetryRatio', () => {
    it('should return 10.0 as the default asymmetry ratio', () => {
      // GIVEN: Default engine configuration

      // WHEN: We query the asymmetry ratio without a domain
      const ratio = engine.getAsymmetryRatio();

      // THEN: The ratio is 10.0 (1.0 / 0.1)
      expect(ratio).toBe(10.0);
    });

    it('should return the correct ratio for a domain override', () => {
      // GIVEN: Default engine with security-compliance override (20:1)

      // WHEN: We query the asymmetry ratio for security-compliance
      const ratio = engine.getAsymmetryRatio('security-compliance');

      // THEN: The ratio is 20.0 (1.0 / 0.05)
      expect(ratio).toBe(20.0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle confidence updates from exactly 0.0', () => {
      // GIVEN: Confidence at the floor
      const confidence = 0.0;

      // WHEN: A success is recorded
      const updated = engine.computeConfidenceUpdate(confidence, 'success');

      // THEN: Confidence increases normally from 0
      expect(updated).toBeCloseTo(0.1, 5);
    });

    it('should handle confidence updates from exactly 1.0 with failure', () => {
      // GIVEN: Confidence at the ceiling
      const confidence = 1.0;

      // WHEN: A failure is recorded
      const updated = engine.computeConfidenceUpdate(confidence, 'failure');

      // THEN: Confidence drops by 1.0 to 0.0
      expect(updated).toBe(0.0);
    });

    it('should not go below 0 with multiple consecutive failures', () => {
      // GIVEN: Confidence at 0.2
      let confidence = 0.2;

      // WHEN: 3 consecutive failures are applied
      for (let i = 0; i < 3; i++) {
        confidence = engine.computeConfidenceUpdate(confidence, 'failure');
      }

      // THEN: Confidence is clamped at 0.0 (never negative)
      expect(confidence).toBe(0.0);
    });

    it('should not exceed 1.0 with many consecutive successes', () => {
      // GIVEN: Confidence at 0.95
      let confidence = 0.95;

      // WHEN: 3 consecutive successes are applied
      for (let i = 0; i < 3; i++) {
        confidence = engine.computeConfidenceUpdate(confidence, 'success');
      }

      // THEN: Confidence is clamped at 1.0 (never exceeds)
      expect(confidence).toBe(1.0);
    });

    it('should handle custom config with zero successRate gracefully', () => {
      // GIVEN: An engine with 0 successRate (impossible to recover)
      const customEngine = new AsymmetricLearningEngine({
        successRate: 0,
      });

      // WHEN: Computing the asymmetry ratio
      const ratio = customEngine.getAsymmetryRatio();

      // THEN: Ratio should be Infinity (division by zero handled)
      expect(ratio).toBe(Infinity);
    });

    it('should apply domain-specific viability when quarantine checking with domain', () => {
      // GIVEN: security-compliance domain has viabilityThreshold=0.5
      //        and confidence is 0.45 (above default 0.3, below security 0.5)
      const confidence = 0.45;

      // WHEN: Quarantine check with security-compliance domain
      const withDomain = engine.shouldQuarantine(confidence, 'security-compliance');
      const withoutDomain = engine.shouldQuarantine(confidence);

      // THEN: Quarantined under security-compliance, but NOT under default
      expect(withDomain.shouldQuarantine).toBe(true);
      expect(withoutDomain.shouldQuarantine).toBe(false);
    });

    it('should apply domain-specific rates in confidence update for security-compliance', () => {
      // GIVEN: Confidence at 0.5 with security-compliance domain (successRate=0.05)
      const initial = 0.5;

      // WHEN: A success is recorded under security-compliance
      const updated = engine.computeConfidenceUpdate(initial, 'success', 'security-compliance');

      // THEN: Increases by 0.05 instead of 0.1
      expect(updated).toBeCloseTo(0.55, 5);
    });

    it('should apply domain-specific rates in confidence update for test-generation', () => {
      // GIVEN: Confidence at 0.5 with test-generation domain (successRate=0.15)
      const initial = 0.5;

      // WHEN: A success is recorded under test-generation
      const updated = engine.computeConfidenceUpdate(initial, 'success', 'test-generation');

      // THEN: Increases by 0.15 instead of 0.1
      expect(updated).toBeCloseTo(0.65, 5);
    });

    it('should classify case-insensitive error signals correctly', () => {
      // GIVEN: An error message with lowercase econnrefused
      const context: FailureContext = {
        errorMessage: 'Error: connect econnrefused 10.0.0.1:3000',
      };

      // WHEN: The failure is classified
      const classification = engine.classifyFailure(context);

      // THEN: Still classified as infrastructure (case-insensitive match)
      expect(classification).toBe('infrastructure');
    });

    it('should construct with partial config merging correctly', () => {
      // GIVEN: A partial config that overrides only successRate
      const customEngine = new AsymmetricLearningEngine({
        successRate: 0.2,
      });

      // WHEN: We check the resulting config for default domain
      const config = customEngine.getConfigForDomain();

      // THEN: successRate is overridden, failureRate stays at default
      expect(config.successRate).toBe(0.2);
      expect(config.failureRate).toBe(1.0);
    });

    it('should preserve domain overrides when constructing with partial config', () => {
      // GIVEN: A custom engine with only base rates changed
      const customEngine = new AsymmetricLearningEngine({
        successRate: 0.2,
      });

      // WHEN: We query a domain override that was not explicitly set
      const secConfig = customEngine.getConfigForDomain('security-compliance');

      // THEN: The default domain overrides are preserved
      expect(secConfig.successRate).toBe(0.05);
      expect(secConfig.failureRate).toBe(1.0);
    });
  });
});
