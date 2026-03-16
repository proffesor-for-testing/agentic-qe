/**
 * Cross-Domain Transfer Learning Integration Tests
 *
 * Validates the full cross-domain transfer pipeline:
 * - Source domain learning and pattern quality
 * - Transfer execution with sqrt-dampening
 * - Target domain improvement verification
 * - Source domain non-regression verification
 * - Transfer history tracking
 * - Thompson Sampling affinity updates
 * - Coherence gate integration (stub)
 *
 * @see src/integrations/ruvector/domain-transfer.ts
 * @see docs/implementation/adrs/ADR-084-cross-domain-transfer-learning.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  DomainTransferEngine,
  createDomainTransferEngine,
  ThompsonSampler,
  type TransferCandidate,
  type TransferResult,
} from '../../../src/integrations/ruvector/domain-transfer.js';

import {
  TransferVerifier,
  createTransferVerifier,
  type DomainPerformanceSnapshot,
} from '../../../src/integrations/ruvector/transfer-verification.js';

import {
  TransferCoherenceStub,
  createTransferCoherenceGate,
} from '../../../src/integrations/ruvector/transfer-coherence-stub.js';

import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../src/integrations/ruvector/feature-flags.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a managed performance state that simulates domain performance
 * with controllable success rates.
 */
function createPerformanceState(): {
  state: Map<string, DomainPerformanceSnapshot>;
  provider: (domain: string) => DomainPerformanceSnapshot;
  setPerformance: (domain: string, successRate: number, confidence: number, patternCount: number) => void;
} {
  const state = new Map<string, DomainPerformanceSnapshot>();

  const provider = (domain: string): DomainPerformanceSnapshot => {
    return state.get(domain) ?? {
      domain,
      successRate: 0.5,
      avgConfidence: 0.5,
      patternCount: 0,
      timestamp: Date.now(),
    };
  };

  const setPerformance = (
    domain: string,
    successRate: number,
    confidence: number,
    patternCount: number,
  ) => {
    state.set(domain, {
      domain,
      successRate,
      avgConfidence: confidence,
      patternCount,
      timestamp: Date.now(),
    });
  };

  return { state, provider, setPerformance };
}

const SOURCE_DOMAIN = 'test-generation';
const TARGET_DOMAIN = 'coverage-analysis';
const THIRD_DOMAIN = 'defect-intelligence';

// ============================================================================
// 1. Source Domain Learning and Transfer Execution
// ============================================================================

describe('Cross-Domain Transfer: Source Learning to Target Transfer', () => {
  let engine: DomainTransferEngine;
  let perfState: ReturnType<typeof createPerformanceState>;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true });

    perfState = createPerformanceState();

    // Source domain has strong performance (well-learned)
    perfState.setPerformance(SOURCE_DOMAIN, 0.90, 0.85, 200);
    // Target domain has weak performance (needs knowledge)
    perfState.setPerformance(TARGET_DOMAIN, 0.55, 0.50, 30);

    engine = createDomainTransferEngine({
      explorationWarmup: 3,
      minTransferProbability: 0.2,
    });
    engine.setPerformanceProvider(perfState.provider);
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should set up source domain with learned patterns and transfer to target', () => {
    // Transfer executor simulates the target improving
    engine.setTransferExecutor((_src, target, dampening) => {
      const current = perfState.state.get(target);
      if (current) {
        perfState.setPerformance(
          target,
          current.successRate + 0.15 * dampening,
          current.avgConfidence + 0.10 * dampening,
          current.patternCount + 20,
        );
      }
      return true;
    });

    // Evaluate transfer candidate
    const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
    expect(candidate.sourceDomain).toBe(SOURCE_DOMAIN);
    expect(candidate.targetDomain).toBe(TARGET_DOMAIN);
    expect(candidate.sampledProbability).toBeGreaterThan(0);

    // Execute transfer
    const result = engine.executeTransfer(candidate);

    expect(result.success).toBe(true);
    expect(result.verification.passed).toBe(true);
    expect(result.verification.targetImproved).toBe(true);
    expect(result.verification.sourceStable).toBe(true);
  });

  it('should verify target domain improved after transfer', () => {
    // Use a transfer executor that always improves the target regardless of dampening
    engine.setTransferExecutor((_src, target, _dampening) => {
      const current = perfState.state.get(target)!;
      perfState.setPerformance(
        target,
        current.successRate + 0.15,
        current.avgConfidence + 0.10,
        current.patternCount + 30,
      );
      return true;
    });

    const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
    const result = engine.executeTransfer(candidate);

    // Target should have improved
    expect(result.verification.targetDelta).toBeGreaterThan(0);
    expect(result.targetPerformanceAfter.successRate).toBeGreaterThan(
      result.targetPerformanceBefore.successRate,
    );
  });

  it('should verify source domain does not regress after transfer', () => {
    // Transfer executor does not change source performance
    engine.setTransferExecutor((_src, target, dampening) => {
      const current = perfState.state.get(target)!;
      perfState.setPerformance(
        target,
        current.successRate + 0.10 * dampening,
        current.avgConfidence,
        current.patternCount + 10,
      );
      return true;
    });

    const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
    const result = engine.executeTransfer(candidate);

    // Source should be stable (delta = 0)
    expect(result.verification.sourceDelta).toBe(0);
    expect(result.verification.sourceStable).toBe(true);
    expect(result.sourcePerformanceAfter.successRate).toBe(
      result.sourcePerformanceBefore.successRate,
    );
  });

  it('should apply sqrt-dampening that increases with observations', () => {
    engine.setTransferExecutor(() => true);

    const dampenings: number[] = [];

    // Execute multiple transfers to accumulate observations
    for (let i = 0; i < 8; i++) {
      const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
      const result = engine.executeTransfer(candidate);
      dampenings.push(result.dampeningFactor);
    }

    // First transfer should have lower dampening than later ones
    expect(dampenings[0]).toBeLessThan(dampenings[dampenings.length - 1]);

    // All dampening factors should be in [0, 1]
    for (const d of dampenings) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// 2. Transfer History Tracking
// ============================================================================

describe('Cross-Domain Transfer: History Tracking', () => {
  let engine: DomainTransferEngine;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true });

    engine = createDomainTransferEngine({
      explorationWarmup: 2,
      maxHistorySize: 100,
    });
    engine.setTransferExecutor(() => true);
    engine.setPerformanceProvider((domain) => ({
      domain,
      successRate: 0.7,
      avgConfidence: 0.6,
      patternCount: 50,
      timestamp: Date.now(),
    }));
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should track all transfer records in history', () => {
    const pairs = [
      [SOURCE_DOMAIN, TARGET_DOMAIN],
      [SOURCE_DOMAIN, THIRD_DOMAIN],
      [TARGET_DOMAIN, THIRD_DOMAIN],
    ];

    for (const [source, target] of pairs) {
      for (let i = 0; i < 3; i++) {
        const candidate = engine.evaluateTransfer(source, target);
        engine.executeTransfer(candidate);
      }
    }

    const history = engine.getTransferHistory();
    expect(history).toHaveLength(9);

    // Each record should have valid fields
    for (const record of history) {
      expect(record.transferId).toBeTruthy();
      expect(record.sourceDomain).toBeTruthy();
      expect(record.targetDomain).toBeTruthy();
      expect(typeof record.success).toBe('boolean');
      expect(record.dampeningFactor).toBeGreaterThanOrEqual(0);
      expect(record.timestamp).toBeGreaterThan(0);
    }
  });

  it('should enforce history size limit', () => {
    const smallHistoryEngine = createDomainTransferEngine({
      maxHistorySize: 5,
      explorationWarmup: 1,
    });
    smallHistoryEngine.setTransferExecutor(() => true);
    smallHistoryEngine.setPerformanceProvider((domain) => ({
      domain, successRate: 0.7, avgConfidence: 0.6, patternCount: 50, timestamp: Date.now(),
    }));

    // Add 10 transfers, but only 5 should be retained
    for (let i = 0; i < 10; i++) {
      const candidate = smallHistoryEngine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
      smallHistoryEngine.executeTransfer(candidate);
    }

    const history = smallHistoryEngine.getTransferHistory();
    expect(history).toHaveLength(5);

    // The oldest records should have been dropped
    // Last 5 records should have the most recent timestamps
    for (let i = 1; i < history.length; i++) {
      expect(history[i].timestamp).toBeGreaterThanOrEqual(history[i - 1].timestamp);
    }
  });

  it('should record both successful and failed transfers', () => {
    let callCount = 0;
    engine.setTransferExecutor(() => {
      callCount++;
      // Alternate success/failure
      return callCount % 2 === 0;
    });

    for (let i = 0; i < 6; i++) {
      const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
      engine.executeTransfer(candidate);
    }

    const history = engine.getTransferHistory();
    const successes = history.filter((r) => r.success).length;
    const failures = history.filter((r) => !r.success).length;

    // Both success and failure states should be recorded
    expect(successes + failures).toBe(6);
  });
});

// ============================================================================
// 3. Affinity Score Tracking
// ============================================================================

describe('Cross-Domain Transfer: Affinity Scoring', () => {
  let engine: DomainTransferEngine;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true });

    engine = createDomainTransferEngine({ explorationWarmup: 2 });
    engine.setPerformanceProvider((domain) => ({
      domain, successRate: 0.7, avgConfidence: 0.6, patternCount: 50, timestamp: Date.now(),
    }));
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should start with default affinity of 0.5', () => {
    const affinity = engine.getAffinityScore(SOURCE_DOMAIN, TARGET_DOMAIN);
    expect(affinity).toBe(0.5);
  });

  it('should increase affinity after successful transfers', () => {
    engine.setTransferExecutor(() => true);

    const affinityBefore = engine.getAffinityScore(SOURCE_DOMAIN, TARGET_DOMAIN);

    for (let i = 0; i < 5; i++) {
      const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
      engine.executeTransfer(candidate);
    }

    const affinityAfter = engine.getAffinityScore(SOURCE_DOMAIN, TARGET_DOMAIN);
    expect(affinityAfter).toBeGreaterThan(affinityBefore);
  });

  it('should decrease affinity after failed transfers', () => {
    engine.setTransferExecutor(() => false);

    const affinityBefore = engine.getAffinityScore(SOURCE_DOMAIN, TARGET_DOMAIN);

    for (let i = 0; i < 5; i++) {
      const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
      engine.executeTransfer(candidate);
    }

    const affinityAfter = engine.getAffinityScore(SOURCE_DOMAIN, TARGET_DOMAIN);
    expect(affinityAfter).toBeLessThan(affinityBefore);
  });

  it('should track affinity per domain pair independently', () => {
    // Pair A->B: successful transfers
    engine.setTransferExecutor(() => true);
    for (let i = 0; i < 5; i++) {
      const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
      engine.executeTransfer(candidate);
    }

    // Pair A->C: failed transfers
    engine.setTransferExecutor(() => false);
    for (let i = 0; i < 5; i++) {
      const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, THIRD_DOMAIN);
      engine.executeTransfer(candidate);
    }

    const affinityAB = engine.getAffinityScore(SOURCE_DOMAIN, TARGET_DOMAIN);
    const affinityAC = engine.getAffinityScore(SOURCE_DOMAIN, THIRD_DOMAIN);

    expect(affinityAB).toBeGreaterThan(affinityAC);
  });
});

// ============================================================================
// 4. Transfer Verification Double-Gate
// ============================================================================

describe('Cross-Domain Transfer: Verification Gates', () => {
  let verifier: TransferVerifier;

  beforeEach(() => {
    verifier = createTransferVerifier({
      maxSourceRegression: 0.05,
      minTargetImprovement: 0.0,
      maxSourceConfidenceRegression: 0.1,
    });
  });

  it('should pass when target improves and source is stable', () => {
    const result = verifier.verifyTransfer({
      transferId: 'test-1',
      sourceDomain: SOURCE_DOMAIN,
      targetDomain: TARGET_DOMAIN,
      sourcePerformanceBefore: {
        domain: SOURCE_DOMAIN, successRate: 0.85, avgConfidence: 0.80, patternCount: 100, timestamp: Date.now(),
      },
      sourcePerformanceAfter: {
        domain: SOURCE_DOMAIN, successRate: 0.85, avgConfidence: 0.80, patternCount: 100, timestamp: Date.now(),
      },
      targetPerformanceBefore: {
        domain: TARGET_DOMAIN, successRate: 0.55, avgConfidence: 0.50, patternCount: 30, timestamp: Date.now(),
      },
      targetPerformanceAfter: {
        domain: TARGET_DOMAIN, successRate: 0.65, avgConfidence: 0.60, patternCount: 50, timestamp: Date.now(),
      },
    });

    expect(result.passed).toBe(true);
    expect(result.sourceStable).toBe(true);
    expect(result.targetImproved).toBe(true);
    expect(result.sourceDelta).toBe(0);
    expect(result.targetDelta).toBeCloseTo(0.10, 5);
    expect(result.failureReason).toBeUndefined();
  });

  it('should fail when source domain regresses beyond tolerance', () => {
    const result = verifier.verifyTransfer({
      transferId: 'test-2',
      sourceDomain: SOURCE_DOMAIN,
      targetDomain: TARGET_DOMAIN,
      sourcePerformanceBefore: {
        domain: SOURCE_DOMAIN, successRate: 0.85, avgConfidence: 0.80, patternCount: 100, timestamp: Date.now(),
      },
      sourcePerformanceAfter: {
        // Regressed by 0.10 (exceeds max 0.05 threshold)
        domain: SOURCE_DOMAIN, successRate: 0.75, avgConfidence: 0.80, patternCount: 100, timestamp: Date.now(),
      },
      targetPerformanceBefore: {
        domain: TARGET_DOMAIN, successRate: 0.55, avgConfidence: 0.50, patternCount: 30, timestamp: Date.now(),
      },
      targetPerformanceAfter: {
        domain: TARGET_DOMAIN, successRate: 0.65, avgConfidence: 0.60, patternCount: 50, timestamp: Date.now(),
      },
    });

    expect(result.passed).toBe(false);
    expect(result.sourceStable).toBe(false);
    expect(result.failureReason).toContain('source domain regressed');
  });

  it('should fail when target does not improve (when minTargetImprovement > 0)', () => {
    const strictVerifier = createTransferVerifier({
      maxSourceRegression: 0.05,
      minTargetImprovement: 0.05, // Require at least 5% improvement
      maxSourceConfidenceRegression: 0.1,
    });

    const result = strictVerifier.verifyTransfer({
      transferId: 'test-3',
      sourceDomain: SOURCE_DOMAIN,
      targetDomain: TARGET_DOMAIN,
      sourcePerformanceBefore: {
        domain: SOURCE_DOMAIN, successRate: 0.85, avgConfidence: 0.80, patternCount: 100, timestamp: Date.now(),
      },
      sourcePerformanceAfter: {
        domain: SOURCE_DOMAIN, successRate: 0.85, avgConfidence: 0.80, patternCount: 100, timestamp: Date.now(),
      },
      targetPerformanceBefore: {
        domain: TARGET_DOMAIN, successRate: 0.55, avgConfidence: 0.50, patternCount: 30, timestamp: Date.now(),
      },
      targetPerformanceAfter: {
        // Only 2% improvement (below 5% threshold)
        domain: TARGET_DOMAIN, successRate: 0.57, avgConfidence: 0.51, patternCount: 32, timestamp: Date.now(),
      },
    });

    expect(result.passed).toBe(false);
    expect(result.targetImproved).toBe(false);
    expect(result.failureReason).toContain('target domain did not improve');
  });

  it('should fail when source confidence regresses beyond tolerance', () => {
    const result = verifier.verifyTransfer({
      transferId: 'test-4',
      sourceDomain: SOURCE_DOMAIN,
      targetDomain: TARGET_DOMAIN,
      sourcePerformanceBefore: {
        domain: SOURCE_DOMAIN, successRate: 0.85, avgConfidence: 0.80, patternCount: 100, timestamp: Date.now(),
      },
      sourcePerformanceAfter: {
        // Confidence dropped by 0.15 (exceeds max 0.1)
        domain: SOURCE_DOMAIN, successRate: 0.85, avgConfidence: 0.65, patternCount: 100, timestamp: Date.now(),
      },
      targetPerformanceBefore: {
        domain: TARGET_DOMAIN, successRate: 0.55, avgConfidence: 0.50, patternCount: 30, timestamp: Date.now(),
      },
      targetPerformanceAfter: {
        domain: TARGET_DOMAIN, successRate: 0.65, avgConfidence: 0.60, patternCount: 50, timestamp: Date.now(),
      },
    });

    expect(result.passed).toBe(false);
    expect(result.sourceStable).toBe(false);
    expect(result.failureReason).toContain('source domain regressed');
  });

  it('should pass neutral transfers (no improvement, no regression)', () => {
    const result = verifier.verifyTransfer({
      transferId: 'test-5',
      sourceDomain: SOURCE_DOMAIN,
      targetDomain: TARGET_DOMAIN,
      sourcePerformanceBefore: {
        domain: SOURCE_DOMAIN, successRate: 0.85, avgConfidence: 0.80, patternCount: 100, timestamp: Date.now(),
      },
      sourcePerformanceAfter: {
        domain: SOURCE_DOMAIN, successRate: 0.85, avgConfidence: 0.80, patternCount: 100, timestamp: Date.now(),
      },
      targetPerformanceBefore: {
        domain: TARGET_DOMAIN, successRate: 0.55, avgConfidence: 0.50, patternCount: 30, timestamp: Date.now(),
      },
      targetPerformanceAfter: {
        // Same as before (neutral)
        domain: TARGET_DOMAIN, successRate: 0.55, avgConfidence: 0.50, patternCount: 30, timestamp: Date.now(),
      },
    });

    // With minTargetImprovement = 0, a neutral transfer should pass
    expect(result.passed).toBe(true);
    expect(result.targetDelta).toBe(0);
  });
});

// ============================================================================
// 5. Coherence Gate Integration (Stub)
// ============================================================================

describe('Cross-Domain Transfer: Coherence Gate', () => {
  it('should use the stub coherence gate that always approves', () => {
    const gate = createTransferCoherenceGate();

    const result = gate.validateTransfer(
      { domain: SOURCE_DOMAIN, confidence: 0.9 },
      TARGET_DOMAIN,
    );

    expect(result.approved).toBe(true);
    expect(result.energy).toBeUndefined(); // Stub does not compute energy
    expect(result.rejectionReason).toBeUndefined();
  });

  it('should approve any transfer pattern via the stub', () => {
    const gate = new TransferCoherenceStub();

    // Various pattern types should all be approved
    const patterns = [
      { domain: 'test-generation', confidence: 0.1 },
      { domain: 'security-compliance', confidence: 1.0, id: 'pattern-123' },
      { domain: undefined, confidence: undefined },
      {},
    ];

    for (const pattern of patterns) {
      const result = gate.validateTransfer(pattern, 'any-target');
      expect(result.approved).toBe(true);
    }
  });

  it('should be used by the DomainTransferEngine', () => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true });

    const engine = createDomainTransferEngine();
    const gate = engine.getCoherenceGate();

    expect(gate).toBeDefined();
    const validation = gate.validateTransfer(
      { domain: SOURCE_DOMAIN },
      TARGET_DOMAIN,
    );
    expect(validation.approved).toBe(true);

    resetRuVectorFeatureFlags();
  });
});

// ============================================================================
// 6. Multi-Domain Transfer Scenarios
// ============================================================================

describe('Cross-Domain Transfer: Multi-Domain Scenarios', () => {
  let engine: DomainTransferEngine;
  let perfState: ReturnType<typeof createPerformanceState>;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true });

    perfState = createPerformanceState();
    perfState.setPerformance('domain-a', 0.90, 0.85, 200);
    perfState.setPerformance('domain-b', 0.70, 0.65, 100);
    perfState.setPerformance('domain-c', 0.50, 0.45, 30);
    perfState.setPerformance('domain-d', 0.40, 0.35, 10);

    engine = createDomainTransferEngine({
      explorationWarmup: 2,
    });
    engine.setPerformanceProvider(perfState.provider);
    engine.setTransferExecutor(() => true);
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should handle transfers across multiple domain pairs', () => {
    const pairs = [
      ['domain-a', 'domain-b'],
      ['domain-a', 'domain-c'],
      ['domain-b', 'domain-c'],
      ['domain-b', 'domain-d'],
    ];

    for (const [source, target] of pairs) {
      const candidate = engine.evaluateTransfer(source, target);
      const result = engine.executeTransfer(candidate);
      expect(result.transferId).toBeDefined();
    }

    const history = engine.getTransferHistory();
    expect(history).toHaveLength(4);

    // Each pair should have independent observation counts
    expect(engine.getObservationCount('domain-a', 'domain-b')).toBe(1);
    expect(engine.getObservationCount('domain-a', 'domain-c')).toBe(1);
    expect(engine.getObservationCount('domain-b', 'domain-c')).toBe(1);
    expect(engine.getObservationCount('domain-b', 'domain-d')).toBe(1);
  });

  it('should build chain transfers: A -> B -> C', () => {
    // Transfer executor that always applies a fixed improvement
    // (independent of dampening to avoid zero-dampening on first transfer)
    engine.setTransferExecutor((_src, target, _dampening) => {
      const current = perfState.state.get(target)!;
      perfState.setPerformance(
        target,
        Math.min(0.95, current.successRate + 0.10),
        current.avgConfidence + 0.05,
        current.patternCount + 20,
      );
      return true;
    });

    // A -> B transfer
    const candidateAB = engine.evaluateTransfer('domain-a', 'domain-b');
    const resultAB = engine.executeTransfer(candidateAB);
    expect(resultAB.success).toBe(true);

    // B -> C transfer (B is now improved)
    const candidateBC = engine.evaluateTransfer('domain-b', 'domain-c');
    const resultBC = engine.executeTransfer(candidateBC);
    expect(resultBC.success).toBe(true);

    // Domain C should have improved from its initial 0.50
    const cPerf = perfState.state.get('domain-c')!;
    expect(cPerf.successRate).toBeGreaterThan(0.50);
  });

  it('should not allow circular regression in transfer chains', () => {
    // Set up a scenario where transfer back might cause regression
    engine.setTransferExecutor((_src, target, dampening) => {
      const current = perfState.state.get(target)!;
      perfState.setPerformance(
        target,
        current.successRate + 0.05 * dampening,
        current.avgConfidence,
        current.patternCount,
      );
      return true;
    });

    // A -> C (should improve C)
    const candidateAC = engine.evaluateTransfer('domain-a', 'domain-c');
    const resultAC = engine.executeTransfer(candidateAC);

    // The source (A) should not have regressed
    expect(resultAC.verification.sourceStable).toBe(true);
    // The target (C) should have improved or stayed same
    expect(resultAC.verification.targetDelta).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// 7. Thompson Sampling within Transfer Engine
// ============================================================================

describe('Cross-Domain Transfer: Thompson Sampling Integration', () => {
  let engine: DomainTransferEngine;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true });

    engine = createDomainTransferEngine({
      explorationWarmup: 3,
    });
    engine.setPerformanceProvider((domain) => ({
      domain, successRate: 0.7, avgConfidence: 0.6, patternCount: 50, timestamp: Date.now(),
    }));
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should flag first transfers as exploration', () => {
    engine.setTransferExecutor(() => true);

    // First few transfers should be exploration (below warmup count)
    for (let i = 0; i < 3; i++) {
      const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
      expect(candidate.isExploration).toBe(true);
      engine.executeTransfer(candidate);
    }

    // After warmup, transfers should be exploitation
    const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
    expect(candidate.isExploration).toBe(false);
  });

  it('should update expected success rate based on transfer outcomes', () => {
    engine.setTransferExecutor(() => true);

    const meanBefore = engine.getExpectedSuccessRate(SOURCE_DOMAIN, TARGET_DOMAIN);
    expect(meanBefore).toBeCloseTo(0.5, 1); // Prior mean

    // Run successful transfers
    for (let i = 0; i < 10; i++) {
      const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
      engine.executeTransfer(candidate);
    }

    const meanAfter = engine.getExpectedSuccessRate(SOURCE_DOMAIN, TARGET_DOMAIN);
    expect(meanAfter).toBeGreaterThan(meanBefore);
  });

  it('should decrease expected success rate after failed transfers', () => {
    engine.setTransferExecutor(() => false);

    // Run failed transfers
    for (let i = 0; i < 10; i++) {
      const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
      engine.executeTransfer(candidate);
    }

    const mean = engine.getExpectedSuccessRate(SOURCE_DOMAIN, TARGET_DOMAIN);
    expect(mean).toBeLessThan(0.5); // Below prior
  });

  it('should provide access to the underlying sampler', () => {
    const sampler = engine.getSampler();
    expect(sampler).toBeInstanceOf(ThompsonSampler);

    // Verify sampler state matches engine state
    engine.setTransferExecutor(() => true);
    const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
    engine.executeTransfer(candidate);

    const pairKey = `${SOURCE_DOMAIN}->${TARGET_DOMAIN}`;
    expect(sampler.getObservationCount(pairKey)).toBe(1);
  });
});

// ============================================================================
// 8. Edge Cases and Error Handling
// ============================================================================

describe('Cross-Domain Transfer: Edge Cases', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should handle transfer to unknown domain with default performance', () => {
    const engine = createDomainTransferEngine();
    engine.setTransferExecutor(() => true);

    const candidate = engine.evaluateTransfer('known-domain', 'completely-unknown-domain');
    const result = engine.executeTransfer(candidate);

    // Should complete without error using default performance snapshot
    expect(result.transferId).toBeDefined();
    expect(result.targetPerformanceBefore.domain).toBe('completely-unknown-domain');
    expect(result.targetPerformanceBefore.successRate).toBe(0.5); // Default
  });

  it('should handle transfer executor failure gracefully', () => {
    const engine = createDomainTransferEngine();

    // Executor that returns false (transfer failed)
    engine.setTransferExecutor(() => false);
    engine.setPerformanceProvider((domain) => ({
      domain, successRate: 0.7, avgConfidence: 0.6, patternCount: 50, timestamp: Date.now(),
    }));

    const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
    const result = engine.executeTransfer(candidate);

    // Transfer should be recorded as failed
    expect(result.success).toBe(false);
  });

  it('should work without a custom performance provider', () => {
    const engine = createDomainTransferEngine();
    engine.setTransferExecutor(() => true);

    const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
    const result = engine.executeTransfer(candidate);

    // Should use default snapshot values
    expect(result.sourcePerformanceBefore.successRate).toBe(0.5);
    expect(result.targetPerformanceBefore.successRate).toBe(0.5);
  });

  it('should work without a custom transfer executor', () => {
    const engine = createDomainTransferEngine();
    engine.setPerformanceProvider((domain) => ({
      domain, successRate: 0.7, avgConfidence: 0.6, patternCount: 50, timestamp: Date.now(),
    }));

    // Default executor returns true
    const candidate = engine.evaluateTransfer(SOURCE_DOMAIN, TARGET_DOMAIN);
    const result = engine.executeTransfer(candidate);

    expect(result.transferId).toBeDefined();
  });
});
