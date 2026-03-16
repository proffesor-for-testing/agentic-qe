/**
 * Cross-Domain Transfer Learning Unit Tests (Task 2.3)
 *
 * Tests for:
 * - Thompson Sampling exploration/exploitation
 * - Transfer verification gate (approve and reject)
 * - Sqrt-dampening prevents aggressive transfer
 * - Domain pair affinity tracking
 * - Transfer history persistence
 * - Coherence stub (always approves)
 * - Feature flag toggle
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DomainTransferEngine,
  ThompsonSampler,
  createDomainTransferEngine,
  DEFAULT_DOMAIN_TRANSFER_CONFIG,
  type TransferCandidate,
} from '../../../../src/integrations/ruvector/domain-transfer';
import {
  TransferVerifier,
  createTransferVerifier,
  DEFAULT_VERIFICATION_CONFIG,
  type DomainPerformanceSnapshot,
  type TransferResultForVerification,
} from '../../../../src/integrations/ruvector/transfer-verification';
import {
  TransferCoherenceStub,
  createTransferCoherenceGate,
  type ITransferCoherenceGate,
} from '../../../../src/integrations/ruvector/transfer-coherence-stub';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
  getRuVectorFeatureFlags,
  isCrossDomainTransferEnabled,
} from '../../../../src/integrations/ruvector/feature-flags';

// ============================================================================
// Test Helpers
// ============================================================================

function createSnapshot(
  domain: string,
  overrides: Partial<DomainPerformanceSnapshot> = {},
): DomainPerformanceSnapshot {
  return {
    domain,
    successRate: 0.7,
    avgConfidence: 0.6,
    patternCount: 10,
    timestamp: Date.now(),
    ...overrides,
  };
}

function enableTransferFlag(): void {
  setRuVectorFeatureFlags({ useCrossDomainTransfer: true });
}

// ============================================================================
// Thompson Sampler Tests
// ============================================================================

describe('ThompsonSampler', () => {
  let sampler: ThompsonSampler;

  beforeEach(() => {
    sampler = new ThompsonSampler();
  });

  it('should initialize with uniform prior Beta(1,1)', () => {
    expect(sampler.getAlpha('test-pair')).toBe(1);
    expect(sampler.getBeta('test-pair')).toBe(1);
    expect(sampler.getObservationCount('test-pair')).toBe(0);
  });

  it('should have mean of 0.5 for a new pair', () => {
    expect(sampler.getMean('new-pair')).toBe(0.5);
  });

  it('should sample a value between 0 and 1', () => {
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const s = sampler.sample('test-pair');
      samples.push(s);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('should increase alpha on success', () => {
    sampler.update('pair-a', true);
    expect(sampler.getAlpha('pair-a')).toBe(2);
    expect(sampler.getBeta('pair-a')).toBe(1);
    expect(sampler.getObservationCount('pair-a')).toBe(1);
  });

  it('should increase beta on failure', () => {
    sampler.update('pair-a', false);
    expect(sampler.getAlpha('pair-a')).toBe(1);
    expect(sampler.getBeta('pair-a')).toBe(2);
    expect(sampler.getObservationCount('pair-a')).toBe(1);
  });

  it('should shift mean toward 1 after many successes', () => {
    for (let i = 0; i < 50; i++) {
      sampler.update('good-pair', true);
    }
    // Mean = 51 / (51 + 1) = 0.981
    expect(sampler.getMean('good-pair')).toBeGreaterThan(0.9);
  });

  it('should shift mean toward 0 after many failures', () => {
    for (let i = 0; i < 50; i++) {
      sampler.update('bad-pair', false);
    }
    // Mean = 1 / (1 + 51) = 0.019
    expect(sampler.getMean('bad-pair')).toBeLessThan(0.1);
  });

  it('should produce higher samples for proven pairs than unproven', () => {
    // Create a proven pair
    for (let i = 0; i < 100; i++) {
      sampler.update('proven', true);
    }

    // Sample many times and check average
    let provenSum = 0;
    let newSum = 0;
    const n = 200;

    for (let i = 0; i < n; i++) {
      provenSum += sampler.sample('proven');
      newSum += sampler.sample('unknown');
    }

    const provenAvg = provenSum / n;
    const newAvg = newSum / n;

    // Proven pair should have significantly higher average sample
    expect(provenAvg).toBeGreaterThan(0.85);
    expect(newAvg).toBeGreaterThan(0.1);
    expect(newAvg).toBeLessThan(0.9);
    expect(provenAvg).toBeGreaterThan(newAvg);
  });

  it('should track independent pairs independently', () => {
    sampler.update('pair-x', true);
    sampler.update('pair-x', true);
    sampler.update('pair-y', false);
    sampler.update('pair-y', false);

    expect(sampler.getMean('pair-x')).toBeGreaterThan(0.6);
    expect(sampler.getMean('pair-y')).toBeLessThan(0.4);
    // pair-z is unobserved
    expect(sampler.getMean('pair-z')).toBe(0.5);
  });
});

// ============================================================================
// Transfer Coherence Stub Tests
// ============================================================================

describe('TransferCoherenceStub', () => {
  it('should always approve transfers', () => {
    const stub = new TransferCoherenceStub();
    const result = stub.validateTransfer(
      { id: 'p1', domain: 'test-generation', confidence: 0.9 },
      'coverage-analysis',
    );
    expect(result.approved).toBe(true);
    expect(result.energy).toBeUndefined();
    expect(result.rejectionReason).toBeUndefined();
  });

  it('should approve even with minimal pattern data', () => {
    const stub = new TransferCoherenceStub();
    const result = stub.validateTransfer({}, 'unknown-domain');
    expect(result.approved).toBe(true);
  });

  it('should implement ITransferCoherenceGate interface', () => {
    const gate: ITransferCoherenceGate = createTransferCoherenceGate();
    const result = gate.validateTransfer(
      { domain: 'test-execution' },
      'defect-intelligence',
    );
    expect(result.approved).toBe(true);
  });
});

// ============================================================================
// Transfer Verifier Tests
// ============================================================================

describe('TransferVerifier', () => {
  let verifier: TransferVerifier;

  beforeEach(() => {
    verifier = createTransferVerifier();
  });

  it('should approve transfer when source stable and target improved', () => {
    const result = verifier.verifyTransfer({
      transferId: 'test-1',
      sourceDomain: 'test-generation',
      targetDomain: 'coverage-analysis',
      sourcePerformanceBefore: createSnapshot('test-generation', { successRate: 0.8 }),
      sourcePerformanceAfter: createSnapshot('test-generation', { successRate: 0.8 }),
      targetPerformanceBefore: createSnapshot('coverage-analysis', { successRate: 0.6 }),
      targetPerformanceAfter: createSnapshot('coverage-analysis', { successRate: 0.7 }),
    });

    expect(result.passed).toBe(true);
    expect(result.sourceStable).toBe(true);
    expect(result.targetImproved).toBe(true);
    expect(result.sourceDelta).toBeCloseTo(0, 5);
    expect(result.targetDelta).toBeCloseTo(0.1, 5);
    expect(result.failureReason).toBeUndefined();
  });

  it('should reject transfer when source regresses beyond tolerance', () => {
    const result = verifier.verifyTransfer({
      transferId: 'test-2',
      sourceDomain: 'test-generation',
      targetDomain: 'coverage-analysis',
      sourcePerformanceBefore: createSnapshot('test-generation', { successRate: 0.8 }),
      sourcePerformanceAfter: createSnapshot('test-generation', { successRate: 0.7 }),
      targetPerformanceBefore: createSnapshot('coverage-analysis', { successRate: 0.6 }),
      targetPerformanceAfter: createSnapshot('coverage-analysis', { successRate: 0.7 }),
    });

    expect(result.passed).toBe(false);
    expect(result.sourceStable).toBe(false);
    expect(result.targetImproved).toBe(true);
    expect(result.failureReason).toContain('source domain regressed');
  });

  it('should reject transfer when target does not improve (with positive min requirement)', () => {
    const strictVerifier = createTransferVerifier({ minTargetImprovement: 0.05 });
    const result = strictVerifier.verifyTransfer({
      transferId: 'test-3',
      sourceDomain: 'test-generation',
      targetDomain: 'coverage-analysis',
      sourcePerformanceBefore: createSnapshot('test-generation', { successRate: 0.8 }),
      sourcePerformanceAfter: createSnapshot('test-generation', { successRate: 0.8 }),
      targetPerformanceBefore: createSnapshot('coverage-analysis', { successRate: 0.6 }),
      targetPerformanceAfter: createSnapshot('coverage-analysis', { successRate: 0.62 }),
    });

    expect(result.passed).toBe(false);
    expect(result.sourceStable).toBe(true);
    expect(result.targetImproved).toBe(false);
    expect(result.failureReason).toContain('target domain did not improve');
  });

  it('should allow small source regression within tolerance', () => {
    const result = verifier.verifyTransfer({
      transferId: 'test-4',
      sourceDomain: 'test-generation',
      targetDomain: 'coverage-analysis',
      sourcePerformanceBefore: createSnapshot('test-generation', {
        successRate: 0.8,
        avgConfidence: 0.7,
      }),
      sourcePerformanceAfter: createSnapshot('test-generation', {
        successRate: 0.76,
        avgConfidence: 0.65,
      }),
      targetPerformanceBefore: createSnapshot('coverage-analysis', { successRate: 0.6 }),
      targetPerformanceAfter: createSnapshot('coverage-analysis', { successRate: 0.65 }),
    });

    // -0.04 is within the 0.05 tolerance
    expect(result.passed).toBe(true);
    expect(result.sourceStable).toBe(true);
    expect(result.sourceDelta).toBeCloseTo(-0.04, 5);
  });

  it('should reject when both source regresses and target does not improve', () => {
    const result = verifier.verifyTransfer({
      transferId: 'test-5',
      sourceDomain: 'test-generation',
      targetDomain: 'coverage-analysis',
      sourcePerformanceBefore: createSnapshot('test-generation', { successRate: 0.8 }),
      sourcePerformanceAfter: createSnapshot('test-generation', { successRate: 0.6 }),
      targetPerformanceBefore: createSnapshot('coverage-analysis', { successRate: 0.6 }),
      targetPerformanceAfter: createSnapshot('coverage-analysis', { successRate: 0.55 }),
    });

    expect(result.passed).toBe(false);
    expect(result.sourceStable).toBe(false);
    expect(result.targetImproved).toBe(false);
    expect(result.failureReason).toContain('source domain regressed');
    expect(result.failureReason).toContain('target domain did not improve');
  });

  it('should expose configuration', () => {
    const config = verifier.getConfig();
    expect(config.maxSourceRegression).toBe(DEFAULT_VERIFICATION_CONFIG.maxSourceRegression);
    expect(config.minTargetImprovement).toBe(DEFAULT_VERIFICATION_CONFIG.minTargetImprovement);
  });
});

// ============================================================================
// Domain Transfer Engine Tests
// ============================================================================

describe('DomainTransferEngine', () => {
  let engine: DomainTransferEngine;

  beforeEach(() => {
    enableTransferFlag();
    engine = createDomainTransferEngine({ explorationWarmup: 5 });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  // --------------------------------------------------------------------------
  // Feature Flag Tests
  // --------------------------------------------------------------------------

  describe('feature flag toggle', () => {
    it('should return zero-probability candidate when feature is disabled', () => {
      resetRuVectorFeatureFlags(); // Resets to defaults (useCrossDomainTransfer: false)
      expect(isCrossDomainTransferEnabled()).toBe(false);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      expect(candidate.sampledProbability).toBe(0);
      expect(candidate.affinityScore).toBe(0);
      expect(candidate.isExploration).toBe(false);
    });

    it('should produce valid candidates when feature is enabled', () => {
      expect(isCrossDomainTransferEnabled()).toBe(true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      expect(candidate.sampledProbability).toBeGreaterThanOrEqual(0);
      expect(candidate.sampledProbability).toBeLessThanOrEqual(1);
      expect(candidate.pairKey).toBe('test-generation->coverage-analysis');
    });
  });

  // --------------------------------------------------------------------------
  // Thompson Sampling Tests
  // --------------------------------------------------------------------------

  describe('Thompson Sampling exploration/exploitation', () => {
    it('should mark candidates as exploration when below warmup threshold', () => {
      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      expect(candidate.isExploration).toBe(true);
    });

    it('should mark candidates as exploitation after warmup observations', () => {
      // Simulate warmup observations by executing transfers
      const sampler = engine.getSampler();
      const pairKey = 'test-generation->coverage-analysis';

      for (let i = 0; i < 5; i++) {
        sampler.update(pairKey, true);
      }

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      expect(candidate.isExploration).toBe(false);
    });

    it('should sample probabilities between 0 and 1', () => {
      for (let i = 0; i < 20; i++) {
        const candidate = engine.evaluateTransfer(
          `domain-${i % 3}`,
          `domain-${(i + 1) % 3}`,
        );
        expect(candidate.sampledProbability).toBeGreaterThanOrEqual(0);
        expect(candidate.sampledProbability).toBeLessThanOrEqual(1);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Sqrt-Dampening Tests
  // --------------------------------------------------------------------------

  describe('sqrt-dampening prevents aggressive transfer', () => {
    it('should produce low dampening for new pairs', () => {
      // Set up performance provider that shows improvement
      let callCount = 0;
      engine.setPerformanceProvider((domain) => {
        callCount++;
        return createSnapshot(domain, {
          successRate: callCount <= 2 ? 0.6 : 0.65,
        });
      });
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      const result = engine.executeTransfer(candidate);

      // With 0 observations and warmup=5: sqrt(0/5) = 0
      expect(result.dampeningFactor).toBe(0);
    });

    it('should increase dampening as observations accumulate', () => {
      const sampler = engine.getSampler();
      const pairKey = 'test-generation->coverage-analysis';

      // Simulate observations
      for (let i = 0; i < 5; i++) {
        sampler.update(pairKey, true);
      }

      let callCount = 0;
      engine.setPerformanceProvider((domain) => {
        callCount++;
        return createSnapshot(domain, {
          successRate: callCount <= 2 ? 0.6 : 0.65,
        });
      });
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      const result = engine.executeTransfer(candidate);

      // With 5 observations and warmup=5: sqrt(5/10) ~= 0.707
      expect(result.dampeningFactor).toBeCloseTo(Math.sqrt(5 / 10), 2);
      expect(result.dampeningFactor).toBeGreaterThan(0);
      expect(result.dampeningFactor).toBeLessThan(1);
    });

    it('should approach 1.0 dampening for proven pairs', () => {
      const sampler = engine.getSampler();
      const pairKey = 'test-generation->coverage-analysis';

      // Many observations
      for (let i = 0; i < 100; i++) {
        sampler.update(pairKey, true);
      }

      let callCount = 0;
      engine.setPerformanceProvider((domain) => {
        callCount++;
        return createSnapshot(domain, {
          successRate: callCount <= 2 ? 0.6 : 0.65,
        });
      });
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      const result = engine.executeTransfer(candidate);

      // sqrt(100/105) ~= 0.976
      expect(result.dampeningFactor).toBeGreaterThan(0.95);
    });
  });

  // --------------------------------------------------------------------------
  // Transfer Verification Gate Tests
  // --------------------------------------------------------------------------

  describe('transfer verification gate', () => {
    it('should succeed when target improves and source is stable', () => {
      let callCount = 0;
      engine.setPerformanceProvider((domain) => {
        callCount++;
        if (domain === 'test-generation') {
          return createSnapshot(domain, { successRate: 0.8, avgConfidence: 0.7 });
        }
        // Target improves on second call (after transfer)
        return createSnapshot(domain, {
          successRate: callCount > 2 ? 0.75 : 0.6,
          avgConfidence: callCount > 2 ? 0.65 : 0.5,
        });
      });
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      const result = engine.executeTransfer(candidate);

      expect(result.success).toBe(true);
      expect(result.verification.passed).toBe(true);
      expect(result.verification.sourceStable).toBe(true);
      expect(result.verification.targetImproved).toBe(true);
    });

    it('should fail when source regresses', () => {
      let callCount = 0;
      engine.setPerformanceProvider((domain) => {
        callCount++;
        if (domain === 'test-generation') {
          // Source regresses after transfer
          return createSnapshot(domain, {
            successRate: callCount > 2 ? 0.6 : 0.8,
            avgConfidence: callCount > 2 ? 0.4 : 0.7,
          });
        }
        return createSnapshot(domain, { successRate: 0.65 });
      });
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      const result = engine.executeTransfer(candidate);

      expect(result.success).toBe(false);
      expect(result.verification.passed).toBe(false);
      expect(result.verification.sourceStable).toBe(false);
    });

    it('should fail when transfer executor returns false', () => {
      engine.setPerformanceProvider((domain) =>
        createSnapshot(domain, { successRate: 0.7, avgConfidence: 0.6 }),
      );
      engine.setTransferExecutor(() => false);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      const result = engine.executeTransfer(candidate);

      // Executor returned false, so overall success is false even though verification may pass
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Domain Pair Affinity Tests
  // --------------------------------------------------------------------------

  describe('domain pair affinity tracking', () => {
    it('should start with neutral affinity of 0.5', () => {
      expect(engine.getAffinityScore('test-generation', 'coverage-analysis')).toBe(0.5);
    });

    it('should increase affinity after successful transfer', () => {
      engine.setPerformanceProvider((domain) =>
        createSnapshot(domain, { successRate: 0.7, avgConfidence: 0.6 }),
      );
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      engine.executeTransfer(candidate);

      const affinity = engine.getAffinityScore('test-generation', 'coverage-analysis');
      // EMA: 0.2 * 1.0 + 0.8 * 0.5 = 0.6
      expect(affinity).toBeGreaterThan(0.5);
    });

    it('should decrease affinity after failed transfer', () => {
      let callCount = 0;
      engine.setPerformanceProvider((domain) => {
        callCount++;
        if (domain === 'test-generation') {
          return createSnapshot(domain, {
            successRate: callCount > 2 ? 0.6 : 0.8,
            avgConfidence: callCount > 2 ? 0.4 : 0.7,
          });
        }
        return createSnapshot(domain, { successRate: 0.55 });
      });
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      engine.executeTransfer(candidate);

      const affinity = engine.getAffinityScore('test-generation', 'coverage-analysis');
      // EMA: 0.2 * 0.0 + 0.8 * 0.5 = 0.4
      expect(affinity).toBeLessThan(0.5);
    });

    it('should track affinity independently for different pairs', () => {
      engine.setPerformanceProvider((domain) =>
        createSnapshot(domain, { successRate: 0.7, avgConfidence: 0.6 }),
      );
      engine.setTransferExecutor(() => true);

      // Execute transfer for pair A
      const candidateA = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      engine.executeTransfer(candidateA);

      // Pair B should still be neutral
      expect(engine.getAffinityScore('test-generation', 'coverage-analysis')).toBeGreaterThan(0.5);
      expect(engine.getAffinityScore('defect-intelligence', 'security-compliance')).toBe(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Transfer History Tests
  // --------------------------------------------------------------------------

  describe('transfer history persistence', () => {
    it('should start with empty history', () => {
      expect(engine.getTransferHistory()).toHaveLength(0);
    });

    it('should record transfers in history', () => {
      engine.setPerformanceProvider((domain) =>
        createSnapshot(domain, { successRate: 0.7, avgConfidence: 0.6 }),
      );
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      engine.executeTransfer(candidate);

      const history = engine.getTransferHistory();
      expect(history).toHaveLength(1);
      expect(history[0].sourceDomain).toBe('test-generation');
      expect(history[0].targetDomain).toBe('coverage-analysis');
      expect(history[0].timestamp).toBeGreaterThan(0);
    });

    it('should enforce max history size', () => {
      const smallEngine = createDomainTransferEngine({
        maxHistorySize: 3,
        explorationWarmup: 5,
      });
      enableTransferFlag();

      smallEngine.setPerformanceProvider((domain) =>
        createSnapshot(domain, { successRate: 0.7, avgConfidence: 0.6 }),
      );
      smallEngine.setTransferExecutor(() => true);

      // Execute 5 transfers
      for (let i = 0; i < 5; i++) {
        const candidate = smallEngine.evaluateTransfer(`domain-${i}`, `domain-${i + 1}`);
        smallEngine.executeTransfer(candidate);
      }

      const history = smallEngine.getTransferHistory();
      expect(history).toHaveLength(3);
      // Oldest entries should have been dropped
      expect(history[0].sourceDomain).toBe('domain-2');
    });

    it('should include success/failure info in records', () => {
      engine.setPerformanceProvider((domain) =>
        createSnapshot(domain, { successRate: 0.7, avgConfidence: 0.6 }),
      );
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      engine.executeTransfer(candidate);

      const record = engine.getTransferHistory()[0];
      expect(record).toHaveProperty('success');
      expect(record).toHaveProperty('sampledProbability');
      expect(record).toHaveProperty('dampeningFactor');
      expect(record).toHaveProperty('sourceDelta');
      expect(record).toHaveProperty('targetDelta');
    });

    it('should return a copy of history (not a reference)', () => {
      engine.setPerformanceProvider((domain) =>
        createSnapshot(domain, { successRate: 0.7, avgConfidence: 0.6 }),
      );
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      engine.executeTransfer(candidate);

      const history1 = engine.getTransferHistory();
      const history2 = engine.getTransferHistory();
      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });
  });

  // --------------------------------------------------------------------------
  // Coherence Gate Integration Tests
  // --------------------------------------------------------------------------

  describe('coherence gate integration', () => {
    it('should use coherence stub that always approves', () => {
      engine.setPerformanceProvider((domain) =>
        createSnapshot(domain, { successRate: 0.7, avgConfidence: 0.6 }),
      );
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      const result = engine.executeTransfer(candidate);

      expect(result.coherenceResult.approved).toBe(true);
    });

    it('should expose the coherence gate', () => {
      const gate = engine.getCoherenceGate();
      expect(gate).toBeDefined();
      const validation = gate.validateTransfer({ domain: 'x' }, 'y');
      expect(validation.approved).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Default Behavior Tests
  // --------------------------------------------------------------------------

  describe('default configuration', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_DOMAIN_TRANSFER_CONFIG.minTransferProbability).toBe(0.3);
      expect(DEFAULT_DOMAIN_TRANSFER_CONFIG.explorationWarmup).toBe(5);
      expect(DEFAULT_DOMAIN_TRANSFER_CONFIG.maxHistorySize).toBe(1000);
    });

    it('should create engine with factory function', () => {
      const eng = createDomainTransferEngine();
      expect(eng).toBeInstanceOf(DomainTransferEngine);
    });

    it('should compute expected success rate from sampler', () => {
      const rate = engine.getExpectedSuccessRate('test-generation', 'coverage-analysis');
      expect(rate).toBe(0.5); // Uniform prior
    });

    it('should track observation count', () => {
      expect(engine.getObservationCount('test-generation', 'coverage-analysis')).toBe(0);

      engine.setPerformanceProvider((domain) =>
        createSnapshot(domain, { successRate: 0.7, avgConfidence: 0.6 }),
      );
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      engine.executeTransfer(candidate);

      expect(engine.getObservationCount('test-generation', 'coverage-analysis')).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Complete Pipeline Tests
  // --------------------------------------------------------------------------

  describe('end-to-end transfer pipeline', () => {
    it('should complete a full evaluate -> execute -> verify cycle', () => {
      let phase = 'before';
      engine.setPerformanceProvider((domain) => {
        if (domain === 'test-generation') {
          return createSnapshot(domain, { successRate: 0.8, avgConfidence: 0.75 });
        }
        // Target improves after transfer
        return createSnapshot(domain, {
          successRate: phase === 'before' ? 0.5 : 0.6,
          avgConfidence: phase === 'before' ? 0.4 : 0.55,
        });
      });

      engine.setTransferExecutor((source, target, dampening) => {
        phase = 'after';
        expect(dampening).toBeGreaterThanOrEqual(0);
        expect(dampening).toBeLessThanOrEqual(1);
        return true;
      });

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      expect(candidate.sourceDomain).toBe('test-generation');
      expect(candidate.targetDomain).toBe('coverage-analysis');

      const result = engine.executeTransfer(candidate);
      expect(result.transferId).toBeTruthy();
      expect(result.coherenceResult.approved).toBe(true);
      expect(result.verification).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should update sampler after successful transfer', () => {
      engine.setPerformanceProvider((domain) =>
        createSnapshot(domain, { successRate: 0.7, avgConfidence: 0.6 }),
      );
      engine.setTransferExecutor(() => true);

      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      const result = engine.executeTransfer(candidate);

      // After a successful transfer, the sampler should have recorded it
      if (result.success) {
        expect(engine.getExpectedSuccessRate('test-generation', 'coverage-analysis'))
          .toBeGreaterThan(0.5);
      } else {
        expect(engine.getExpectedSuccessRate('test-generation', 'coverage-analysis'))
          .toBeLessThan(0.5);
      }
    });
  });
});

// ============================================================================
// Feature Flags Integration Tests
// ============================================================================

describe('Feature Flag: useCrossDomainTransfer', () => {
  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should default to false', () => {
    resetRuVectorFeatureFlags();
    const flags = getRuVectorFeatureFlags();
    expect(flags.useCrossDomainTransfer).toBe(false);
    expect(isCrossDomainTransferEnabled()).toBe(false);
  });

  it('should be togglable at runtime', () => {
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true });
    expect(isCrossDomainTransferEnabled()).toBe(true);

    setRuVectorFeatureFlags({ useCrossDomainTransfer: false });
    expect(isCrossDomainTransferEnabled()).toBe(false);
  });

  it('should not affect other flags when toggled', () => {
    const flagsBefore = getRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true });
    const flagsAfter = getRuVectorFeatureFlags();

    expect(flagsAfter.useQESONA).toBe(flagsBefore.useQESONA);
    expect(flagsAfter.useQEFlashAttention).toBe(flagsBefore.useQEFlashAttention);
    expect(flagsAfter.useQEGNNIndex).toBe(flagsBefore.useQEGNNIndex);
    expect(flagsAfter.useSONAThreeLoop).toBe(flagsBefore.useSONAThreeLoop);
    expect(flagsAfter.useCrossDomainTransfer).toBe(true);
  });
});
