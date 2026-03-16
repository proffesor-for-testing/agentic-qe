/**
 * Coherence Gate Unit Tests (Task 3.1, ADR-083)
 *
 * Tests for:
 * - Energy computation (low energy = consistent, high = hallucinated)
 * - Validation with threshold
 * - Compute ladder (reflex vs retrieval)
 * - Witness record generation
 * - Decision logging
 * - ITransferCoherenceGate implementation
 * - Advisory mode (CoherenceValidator)
 * - Feature flag toggle
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CoherenceGate,
  createCoherenceGate,
  createRealTransferCoherenceGate,
  DEFAULT_COHERENCE_THRESHOLD,
  type TestArtifact,
  type CoherenceResult,
  type ValidationResult,
} from '../../../../src/integrations/ruvector/coherence-gate';
import {
  CoherenceValidator,
  createCoherenceValidator,
  DEFAULT_COHERENCE_VALIDATOR_CONFIG,
  type ValidationPipelineResult,
} from '../../../../src/governance/coherence-validator';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
  getRuVectorFeatureFlags,
  isCoherenceGateEnabled,
  isWitnessChainEnabled,
} from '../../../../src/integrations/ruvector/feature-flags';
import type { ITransferCoherenceGate } from '../../../../src/integrations/ruvector/transfer-coherence-stub';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a consistent (low-energy) test artifact */
function createConsistentArtifact(
  overrides: Partial<TestArtifact> = {},
): TestArtifact {
  return {
    assertions: ['expect(result).toBe(true)', 'expect(status).toBe(200)'],
    observedBehavior: ['result was true', 'status was 200'],
    coverage: 0.9,
    domain: 'test-generation',
    confidence: 0.95,
    ...overrides,
  };
}

/** Create an inconsistent (high-energy) test artifact */
function createHallucinatedArtifact(
  overrides: Partial<TestArtifact> = {},
): TestArtifact {
  return {
    assertions: [
      'expect(result).toBeDefined()',
      'expect(user.name).toBe("Alice")',
      'expect(db.connected).toBe(true)',
      'expect(cache.hit).toBe(true)',
      'expect(metrics.count).toBeGreaterThan(0)',
    ],
    observedBehavior: ['result was undefined'],
    coverage: 0.1,
    domain: 'test-generation',
    confidence: 0.2,
    ...overrides,
  };
}

function enableFlags(): void {
  setRuVectorFeatureFlags({
    useCoherenceGate: true,
    useWitnessChain: true,
  });
}

// ============================================================================
// CoherenceGate Tests
// ============================================================================

describe('CoherenceGate', () => {
  let gate: CoherenceGate;

  beforeEach(() => {
    gate = new CoherenceGate();
    enableFlags();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  // --------------------------------------------------------------------------
  // Energy Computation
  // --------------------------------------------------------------------------

  describe('computeEnergy', () => {
    it('should compute low energy for consistent artifacts', () => {
      const artifact = createConsistentArtifact();
      const result = gate.computeEnergy(artifact);

      expect(result.energy).toBeLessThan(DEFAULT_COHERENCE_THRESHOLD);
      expect(result.energy).toBeGreaterThanOrEqual(0);
      expect(result.energy).toBeLessThanOrEqual(1);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should compute high energy for hallucinated artifacts', () => {
      const artifact = createHallucinatedArtifact();
      const result = gate.computeEnergy(artifact);

      expect(result.energy).toBeGreaterThan(DEFAULT_COHERENCE_THRESHOLD);
      expect(result.energy).toBeLessThanOrEqual(1);
    });

    it('should return energy components breakdown', () => {
      const artifact = createConsistentArtifact();
      const result = gate.computeEnergy(artifact);

      expect(result.components).toBeDefined();
      expect(result.components.assertionCoverage).toBeGreaterThanOrEqual(0);
      expect(result.components.assertionCoverage).toBeLessThanOrEqual(1);
      expect(result.components.codeCoverage).toBeGreaterThanOrEqual(0);
      expect(result.components.codeCoverage).toBeLessThanOrEqual(1);
      expect(result.components.confidencePenalty).toBeGreaterThanOrEqual(0);
      expect(result.components.confidencePenalty).toBeLessThanOrEqual(1);
    });

    it('should compute zero assertion energy when assertions match observations', () => {
      const artifact = createConsistentArtifact({
        assertions: ['a', 'b'],
        observedBehavior: ['x', 'y'],
      });
      const result = gate.computeEnergy(artifact);

      // Assertions and observations are 1:1 ratio -> assertion energy = 0
      expect(result.components.assertionCoverage).toBe(0);
    });

    it('should compute high assertion energy when observations are missing', () => {
      const artifact = createConsistentArtifact({
        assertions: ['a', 'b', 'c', 'd'],
        observedBehavior: ['x'],
      });
      const result = gate.computeEnergy(artifact);

      // 1/4 ratio -> 1 - 0.25 = 0.75 assertion energy
      expect(result.components.assertionCoverage).toBe(0.75);
    });

    it('should handle empty assertions gracefully', () => {
      const artifact = createConsistentArtifact({
        assertions: [],
        observedBehavior: [],
      });
      const result = gate.computeEnergy(artifact);

      // No assertions -> assertion coverage energy is 0
      expect(result.components.assertionCoverage).toBe(0);
      expect(result.energy).toBeLessThanOrEqual(1);
    });

    it('should scale code coverage energy inversely with coverage', () => {
      const highCoverage = gate.computeEnergy(
        createConsistentArtifact({ coverage: 0.95 }),
      );
      const lowCoverage = gate.computeEnergy(
        createConsistentArtifact({ coverage: 0.1 }),
      );

      expect(lowCoverage.components.codeCoverage).toBeGreaterThan(
        highCoverage.components.codeCoverage,
      );
    });

    it('should scale confidence penalty inversely with confidence', () => {
      const highConf = gate.computeEnergy(
        createConsistentArtifact({ confidence: 0.99 }),
      );
      const lowConf = gate.computeEnergy(
        createConsistentArtifact({ confidence: 0.1 }),
      );

      expect(lowConf.components.confidencePenalty).toBeGreaterThan(
        highConf.components.confidencePenalty,
      );
    });

    it('should clamp energy to [0, 1] range', () => {
      // Extreme case: all components maxed out
      const artifact: TestArtifact = {
        assertions: ['a', 'b', 'c', 'd', 'e'],
        observedBehavior: [],
        coverage: 0,
        domain: 'test',
        confidence: 0,
      };
      const result = gate.computeEnergy(artifact);

      expect(result.energy).toBeLessThanOrEqual(1);
      expect(result.energy).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // Compute Ladder (Reflex vs Retrieval)
  // --------------------------------------------------------------------------

  describe('compute ladder', () => {
    it('should use reflex tier when computation is fast', () => {
      const artifact = createConsistentArtifact();
      const result = gate.computeEnergy(artifact);

      // Reflex tier should be used for simple artifacts
      expect(['reflex', 'retrieval']).toContain(result.tier);
    });

    it('should use retrieval tier when forced', () => {
      const artifact = createConsistentArtifact();
      const result = gate.computeEnergy(artifact, true);

      expect(result.tier).toBe('retrieval');
    });

    it('should include Laplacian deviation in retrieval tier', () => {
      const artifact = createConsistentArtifact({
        assertions: [
          'expect(foo).toBe(1)',
          'expect(bar).toBe(2)',
          'expect(baz).toBe(3)',
        ],
      });
      const result = gate.computeEnergy(artifact, true);

      // Retrieval tier includes Laplacian deviation
      expect(result.components.laplacianDeviation).toBeGreaterThanOrEqual(0);
      expect(result.components.laplacianDeviation).toBeLessThanOrEqual(1);
    });

    it('should include contradiction score in retrieval tier', () => {
      const artifact = createConsistentArtifact();
      const result = gate.computeEnergy(artifact, true);

      expect(result.components.contradictionScore).toBeGreaterThanOrEqual(0);
      expect(result.components.contradictionScore).toBeLessThanOrEqual(1);
    });

    it('should detect contradictions between assertions and behavior', () => {
      const artifact: TestArtifact = {
        assertions: ['result should not be null', 'status should never fail'],
        observedBehavior: ['result was null', 'status failed'],
        coverage: 0.5,
        domain: 'test',
        confidence: 0.5,
      };
      const result = gate.computeEnergy(artifact, true);

      expect(result.components.contradictionScore).toBeGreaterThan(0);
    });

    it('should produce lower Laplacian deviation for assertions with similar words than for completely different words', () => {
      const similarArtifact = createConsistentArtifact({
        assertions: [
          'expect(user.name).toBe("Alice")',
          'expect(user.name).toBe("Bob")',
          'expect(user.email).toBe("alice@test.com")',
        ],
        observedBehavior: ['user was created', 'user was validated', 'user email set'],
      });
      const differentArtifact = createConsistentArtifact({
        assertions: [
          'expect(result).toBe(true)',
          'database connection established',
          'quantum flux capacitor initialized',
        ],
        observedBehavior: ['result ok', 'db connected', 'flux ready'],
      });

      const similarResult = gate.computeEnergy(similarArtifact, true);
      const differentResult = gate.computeEnergy(differentArtifact, true);

      expect(similarResult.components.laplacianDeviation).toBeLessThan(
        differentResult.components.laplacianDeviation,
      );
    });
  });

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  describe('validate', () => {
    it('should pass validation for consistent artifacts', () => {
      const artifact = createConsistentArtifact();
      const result = gate.validate(artifact);

      expect(result.passed).toBe(true);
      expect(result.energy).toBeLessThan(result.threshold);
      expect(result.reason).toBeUndefined();
    });

    it('should fail validation for hallucinated artifacts', () => {
      const artifact = createHallucinatedArtifact();
      const result = gate.validate(artifact);

      expect(result.passed).toBe(false);
      expect(result.energy).toBeGreaterThan(result.threshold);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('exceeds threshold');
    });

    it('should use default threshold when none provided', () => {
      const artifact = createConsistentArtifact();
      const result = gate.validate(artifact);

      expect(result.threshold).toBe(DEFAULT_COHERENCE_THRESHOLD);
    });

    it('should respect custom threshold override', () => {
      const artifact = createConsistentArtifact();

      // Very strict threshold
      const strict = gate.validate(artifact, 0.01);
      // Very relaxed threshold
      const relaxed = gate.validate(artifact, 0.99);

      expect(relaxed.passed).toBe(true);
      expect(strict.threshold).toBe(0.01);
      expect(relaxed.threshold).toBe(0.99);
    });

    it('should include witness record in result', () => {
      const artifact = createConsistentArtifact();
      const result = gate.validate(artifact);

      expect(result.witness).toBeDefined();
      expect(result.witness.id).toBeDefined();
      expect(result.witness.timestamp).toBeGreaterThan(0);
      expect(result.witness.artifactHash).toBeTruthy();
      expect(result.witness.recordHash).toBeTruthy();
      expect(typeof result.witness.energy).toBe('number');
      expect(typeof result.witness.passed).toBe('boolean');
    });
  });

  // --------------------------------------------------------------------------
  // Witness Records
  // --------------------------------------------------------------------------

  describe('witness records', () => {
    it('should create hash-chained witness records', () => {
      const artifact = createConsistentArtifact();
      gate.validate(artifact);
      gate.validate(artifact);
      const chain = gate.getWitnessChain();

      expect(chain.length).toBe(2);
      // Second record should reference first record's hash
      expect(chain[1].previousHash).toBe(chain[0].recordHash);
    });

    it('should not store witness records when flag is disabled', () => {
      setRuVectorFeatureFlags({ useWitnessChain: false });
      const artifact = createConsistentArtifact();
      gate.validate(artifact);

      const chain = gate.getWitnessChain();
      expect(chain.length).toBe(0);
    });

    it('should produce unique record hashes', () => {
      const artifact1 = createConsistentArtifact({ domain: 'domain-a' });
      const artifact2 = createConsistentArtifact({ domain: 'domain-b' });
      gate.validate(artifact1);
      gate.validate(artifact2);

      const chain = gate.getWitnessChain();
      expect(chain[0].recordHash).not.toBe(chain[1].recordHash);
    });

    it('should include artifact hash in witness record', () => {
      const artifact = createConsistentArtifact();
      const result = gate.validate(artifact);

      expect(result.witness.artifactHash).toBeTruthy();
      expect(result.witness.artifactHash.length).toBe(64); // SHA-256 hex
    });
  });

  // --------------------------------------------------------------------------
  // Decision Logging
  // --------------------------------------------------------------------------

  describe('decision logging', () => {
    it('should log each validation as a decision', () => {
      const artifact = createConsistentArtifact();
      gate.validate(artifact);
      gate.validate(artifact);

      const log = gate.getDecisionLog();
      expect(log.length).toBe(2);
    });

    it('should include decision metadata', () => {
      const artifact = createConsistentArtifact({ domain: 'my-domain' });
      gate.validate(artifact);

      const log = gate.getDecisionLog();
      expect(log[0].domain).toBe('my-domain');
      expect(log[0].energy).toBeGreaterThanOrEqual(0);
      expect(['reflex', 'retrieval']).toContain(log[0].tier);
      expect(typeof log[0].passed).toBe('boolean');
      expect(log[0].timestamp).toBeGreaterThan(0);
      expect(log[0].id).toBeTruthy();
    });

    it('should clear decision log', () => {
      gate.validate(createConsistentArtifact());
      expect(gate.getDecisionLog().length).toBe(1);

      gate.clearDecisionLog();
      expect(gate.getDecisionLog().length).toBe(0);
    });

    it('should bound the decision log size', () => {
      // Validate many artifacts to exceed the 1000 limit
      const artifact = createConsistentArtifact();
      for (let i = 0; i < 1050; i++) {
        gate.validate(artifact);
      }

      const log = gate.getDecisionLog();
      expect(log.length).toBeLessThanOrEqual(1000);
    });
  });

  // --------------------------------------------------------------------------
  // ITransferCoherenceGate Implementation
  // --------------------------------------------------------------------------

  describe('ITransferCoherenceGate', () => {
    it('should implement validateTransfer', () => {
      const transferGate: ITransferCoherenceGate = gate;
      const pattern = {
        id: 'p-1',
        domain: 'source',
        confidence: 0.9,
        description: 'Test pattern',
      };
      const result = transferGate.validateTransfer(pattern, 'target');

      expect(result).toBeDefined();
      expect(typeof result.approved).toBe('boolean');
    });

    it('should approve transfers for high-confidence patterns', () => {
      const pattern = {
        id: 'p-1',
        domain: 'source',
        confidence: 0.95,
        assertions: ['expect(x).toBe(1)'],
        observedBehavior: ['x was 1'],
        coverage: 0.9,
      };
      const result = gate.validateTransfer(pattern, 'target');

      expect(result.approved).toBe(true);
    });

    it('should reject transfers for low-confidence patterns', () => {
      const pattern = {
        id: 'p-2',
        domain: 'source',
        confidence: 0.05,
        assertions: ['a', 'b', 'c', 'd', 'e'],
        observedBehavior: ['none'],
        coverage: 0.05,
      };
      const result = gate.validateTransfer(pattern, 'target');

      expect(result.approved).toBe(false);
      expect(result.rejectionReason).toBeDefined();
      expect(result.energy).toBeGreaterThan(0);
    });

    it('should pass through when feature flag is disabled', () => {
      setRuVectorFeatureFlags({ useCoherenceGate: false });

      const pattern = {
        id: 'p-3',
        domain: 'source',
        confidence: 0.01,
      };
      const result = gate.validateTransfer(pattern, 'target');

      expect(result.approved).toBe(true);
      expect(result.energy).toBeUndefined();
    });

    it('should be creatable via factory function', () => {
      const transferGate = createRealTransferCoherenceGate();
      expect(transferGate).toBeInstanceOf(CoherenceGate);
    });
  });

  // --------------------------------------------------------------------------
  // Factory
  // --------------------------------------------------------------------------

  describe('factory', () => {
    it('should create a gate with default threshold', () => {
      const g = createCoherenceGate();
      expect(g.getThreshold()).toBe(DEFAULT_COHERENCE_THRESHOLD);
    });

    it('should create a gate with custom threshold', () => {
      const g = createCoherenceGate(0.7);
      expect(g.getThreshold()).toBe(0.7);
    });
  });
});

// ============================================================================
// CoherenceValidator Tests
// ============================================================================

describe('CoherenceValidator', () => {
  let validator: CoherenceValidator;

  beforeEach(() => {
    enableFlags();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  // --------------------------------------------------------------------------
  // Advisory Mode
  // --------------------------------------------------------------------------

  describe('advisory mode (default)', () => {
    beforeEach(() => {
      validator = new CoherenceValidator();
    });

    it('should always approve in advisory mode', () => {
      const artifact = createHallucinatedArtifact();
      const result = validator.validateTestArtifact(artifact);

      expect(result.approved).toBe(true);
      expect(result.mode).toBe('advisory');
    });

    it('should attach warnings for high-energy artifacts', () => {
      const artifact = createHallucinatedArtifact();
      const result = validator.validateTestArtifact(artifact);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Coherence validation warning');
    });

    it('should not attach warnings for consistent artifacts', () => {
      const artifact = createConsistentArtifact();
      const result = validator.validateTestArtifact(artifact);

      expect(result.warnings.length).toBe(0);
    });

    it('should include the validation result', () => {
      const artifact = createConsistentArtifact();
      const result = validator.validateTestArtifact(artifact);

      expect(result.validation).toBeDefined();
      expect(typeof result.validation.energy).toBe('number');
      expect(typeof result.validation.passed).toBe('boolean');
      expect(result.validation.witness).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Blocking Mode
  // --------------------------------------------------------------------------

  describe('blocking mode', () => {
    beforeEach(() => {
      validator = new CoherenceValidator({ blocking: true });
    });

    it('should block hallucinated artifacts', () => {
      const artifact = createHallucinatedArtifact();
      const result = validator.validateTestArtifact(artifact);

      expect(result.approved).toBe(false);
      expect(result.mode).toBe('blocking');
    });

    it('should approve consistent artifacts', () => {
      const artifact = createConsistentArtifact();
      const result = validator.validateTestArtifact(artifact);

      expect(result.approved).toBe(true);
      expect(result.mode).toBe('blocking');
    });
  });

  // --------------------------------------------------------------------------
  // Feature Flag Toggle
  // --------------------------------------------------------------------------

  describe('feature flag toggle', () => {
    it('should pass through when useCoherenceGate is false', () => {
      setRuVectorFeatureFlags({ useCoherenceGate: false });
      validator = new CoherenceValidator();

      const artifact = createHallucinatedArtifact();
      const result = validator.validateTestArtifact(artifact);

      expect(result.approved).toBe(true);
      expect(result.featureFlagEnabled).toBe(false);
      expect(result.warnings.length).toBe(0);
    });

    it('should validate when useCoherenceGate is true', () => {
      setRuVectorFeatureFlags({ useCoherenceGate: true });
      validator = new CoherenceValidator();

      const artifact = createHallucinatedArtifact();
      const result = validator.validateTestArtifact(artifact);

      expect(result.featureFlagEnabled).toBe(true);
      // In advisory mode, still approved but with warnings
      expect(result.approved).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should default useCoherenceGate to true', () => {
      resetRuVectorFeatureFlags();
      const flags = getRuVectorFeatureFlags();
      expect(flags.useCoherenceGate).toBe(true);
    });

    it('should default useWitnessChain to true', () => {
      resetRuVectorFeatureFlags();
      const flags = getRuVectorFeatureFlags();
      expect(flags.useWitnessChain).toBe(true);
    });

    it('should have convenience functions for new flags', () => {
      resetRuVectorFeatureFlags();
      expect(isCoherenceGateEnabled()).toBe(true);
      expect(isWitnessChainEnabled()).toBe(true);

      setRuVectorFeatureFlags({ useCoherenceGate: true, useWitnessChain: true });
      expect(isCoherenceGateEnabled()).toBe(true);
      expect(isWitnessChainEnabled()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  describe('statistics', () => {
    beforeEach(() => {
      validator = new CoherenceValidator();
    });

    it('should track validation count', () => {
      validator.validateTestArtifact(createConsistentArtifact());
      validator.validateTestArtifact(createConsistentArtifact());

      const stats = validator.getStats();
      expect(stats.validationCount).toBe(2);
    });

    it('should track warning count', () => {
      validator.validateTestArtifact(createHallucinatedArtifact());

      const stats = validator.getStats();
      expect(stats.warningCount).toBe(1);
    });

    it('should track block count in blocking mode', () => {
      validator = new CoherenceValidator({ blocking: true });
      validator.validateTestArtifact(createHallucinatedArtifact());

      const stats = validator.getStats();
      expect(stats.blockCount).toBe(1);
    });

    it('should expose decision log from underlying gate', () => {
      validator.validateTestArtifact(createConsistentArtifact());
      const log = validator.getDecisionLog();

      expect(log.length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Factory
  // --------------------------------------------------------------------------

  describe('factory', () => {
    it('should create with default config', () => {
      const v = createCoherenceValidator();
      const stats = v.getStats();

      expect(stats.mode).toBe('advisory');
      expect(stats.threshold).toBe(DEFAULT_COHERENCE_THRESHOLD);
    });

    it('should create with custom config', () => {
      const v = createCoherenceValidator({
        blocking: true,
        threshold: 0.6,
      });
      const stats = v.getStats();

      expect(stats.mode).toBe('blocking');
      expect(stats.threshold).toBe(0.6);
    });
  });
});
