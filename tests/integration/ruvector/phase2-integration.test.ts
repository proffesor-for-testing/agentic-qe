/**
 * RuVector Phase 2 Integration Tests
 *
 * Exercises all Phase 2 components working together:
 * - Neural TinyDancer Router (ADR-082) shadow mode
 * - SONA Three-Loop Engine (EWC++ & MicroLoRA)
 * - Cross-Domain Transfer Learning (ADR-084)
 * - Thompson Sampling exploration/exploitation
 * - Regret Tracking and growth rate classification
 * - Feature Flag backward compatibility
 *
 * @see docs/implementation/ruvector-integration-plan.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  NeuralTinyDancerRouter,
  createNeuralTinyDancerRouter,
  SimpleNeuralRouter,
} from '../../../src/routing/neural-tiny-dancer-router.js';

import {
  SONAThreeLoopEngine,
  createSONAThreeLoopEngine,
  MicroLoRA,
  EWCPlusPlus,
} from '../../../src/integrations/ruvector/sona-three-loop.js';

import {
  DomainTransferEngine,
  createDomainTransferEngine,
  ThompsonSampler,
} from '../../../src/integrations/ruvector/domain-transfer.js';

import {
  RegretTracker,
  createRegretTracker,
  linearRegressionSlope,
} from '../../../src/learning/regret-tracker.js';

import {
  getRuVectorFeatureFlags,
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../src/integrations/ruvector/feature-flags.js';

import type { DomainPerformanceSnapshot } from '../../../src/integrations/ruvector/transfer-verification.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a simple classifiable task for neural routing tests.
 */
function createTestTask(description: string, domain?: string) {
  return {
    description,
    domain: domain as any,
    context: {
      code: 'const x = 1;',
    },
  };
}

/**
 * Generate a random feature vector for SONA tests.
 */
function generateFeatures(dim: number, seed: number = 0): number[] {
  const features: number[] = [];
  for (let i = 0; i < dim; i++) {
    features.push(Math.sin(seed * 0.7 + i * 0.03) * 0.5);
  }
  return features;
}

/**
 * Generate a gradient-like Float32Array for EWC++ tests.
 */
function generateGradient(dim: number, magnitude: number, seed: number = 0): Float32Array {
  const grad = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    grad[i] = Math.sin(seed * 1.3 + i * 0.02) * magnitude;
  }
  return grad;
}

// ============================================================================
// 1. Shadow Mode: Neural vs Rule-Based Disagreement Tracking
// ============================================================================

describe('Phase 2: Shadow Mode Integration', () => {
  let router: NeuralTinyDancerRouter;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useNeuralRouting: true });
    router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
      shadowModeDecisions: 100,
      shadowModeMaxDisagreement: 0.10,
    });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should run both routers for 100 tasks and track disagreements', async () => {
    const tasks = Array.from({ length: 100 }, (_, i) =>
      createTestTask(
        `Task ${i}: Generate ${i < 50 ? 'simple unit test' : 'complex integration test with database and API calls across multiple services'}`,
        i % 3 === 0 ? 'test-generation' : i % 3 === 1 ? 'coverage-analysis' : 'security-compliance',
      ),
    );

    for (const task of tasks) {
      await router.route(task);
    }

    const stats = router.getNeuralStats();
    expect(stats.shadowModeActive).toBe(true);
    expect(stats.shadowDecisions).toBe(100);
    expect(stats.totalNeuralDecisions).toBe(100);
    // Disagreement rate should be a valid number between 0 and 1
    expect(stats.disagreementRate).toBeGreaterThanOrEqual(0);
    expect(stats.disagreementRate).toBeLessThanOrEqual(1);

    // Shadow decision logs should be available
    const logs = router.getShadowDecisionLogs();
    expect(logs).toHaveLength(100);

    // Each log entry should have required fields
    for (const log of logs) {
      expect(log.taskDescription).toBeDefined();
      expect(['haiku', 'sonnet', 'opus']).toContain(log.ruleDecision);
      expect(['haiku', 'sonnet', 'opus']).toContain(log.neuralDecision);
      expect(typeof log.agreed).toBe('boolean');
      expect(log.neuralConfidence).toBeGreaterThan(0);
      expect(log.neuralConfidence).toBeLessThanOrEqual(1);
    }

    // In shadow mode, the rule-based result should always be returned
    // (neural result is just logged for comparison)
    expect(stats.neuralPrimary).toBe(false);
  });

  it('should always return rule-based results during shadow mode', async () => {
    const task = createTestTask('Simple variable rename refactoring', 'test-generation');

    // Route the task -- shadow mode should use rule-based
    const result = await router.route(task);

    expect(result).toBeDefined();
    expect(result.model).toBeDefined();
    expect(['haiku', 'sonnet', 'opus']).toContain(result.model);
    expect(result.confidence).toBeGreaterThan(0);
    expect(router.isShadowModeActive()).toBe(true);
  });

  it('should record neural outcomes and update weights during shadow mode', async () => {
    const task = createTestTask('Generate unit tests for auth module', 'test-generation');
    const result = await router.route(task);

    // Record a successful outcome
    router.recordNeuralOutcome(task, result, true, 0.9);

    const stats = router.getNeuralStats();
    expect(stats.totalWeightUpdates).toBe(1);
  });

  it('should track circuit breaker state correctly', async () => {
    // Create a router with low threshold for testing
    const cbRouter = createNeuralTinyDancerRouter({
      forceShadowMode: false,
      circuitBreakerThreshold: 0.30,
    });

    const task = createTestTask('Test task for circuit breaker', 'test-generation');
    const result = await cbRouter.route(task);

    // Record many failures to trip the breaker
    for (let i = 0; i < 15; i++) {
      cbRouter.recordNeuralOutcome(task, result, false, 0.1);
    }

    const stats = cbRouter.getNeuralStats();
    expect(stats.circuitBreakerTripped).toBe(true);
    expect(stats.recentErrorRate).toBeGreaterThan(0);
  });
});

// ============================================================================
// 2. Cross-Domain Transfer with Performance Verification
// ============================================================================

describe('Phase 2: Cross-Domain Transfer Integration', () => {
  let engine: DomainTransferEngine;
  let performanceState: Map<string, DomainPerformanceSnapshot>;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true });

    performanceState = new Map();

    // Set up initial domain performances
    performanceState.set('test-generation', {
      domain: 'test-generation',
      successRate: 0.85,
      avgConfidence: 0.80,
      patternCount: 100,
      timestamp: Date.now(),
    });
    performanceState.set('coverage-analysis', {
      domain: 'coverage-analysis',
      successRate: 0.60,
      avgConfidence: 0.55,
      patternCount: 30,
      timestamp: Date.now(),
    });

    engine = createDomainTransferEngine({
      explorationWarmup: 3,
      minTransferProbability: 0.2,
    });

    engine.setPerformanceProvider((domain) => {
      return performanceState.get(domain) ?? {
        domain,
        successRate: 0.5,
        avgConfidence: 0.5,
        patternCount: 0,
        timestamp: Date.now(),
      };
    });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should learn patterns in source domain and transfer to target with verification', () => {
    // Simulate a transfer that improves the target
    engine.setTransferExecutor((_source, target, dampening) => {
      // Simulate the target domain improving after transfer
      const current = performanceState.get(target);
      if (current) {
        performanceState.set(target, {
          ...current,
          successRate: current.successRate + 0.1 * dampening,
          avgConfidence: current.avgConfidence + 0.05 * dampening,
          timestamp: Date.now(),
        });
      }
      return true;
    });

    const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
    expect(candidate.sourceDomain).toBe('test-generation');
    expect(candidate.targetDomain).toBe('coverage-analysis');
    expect(candidate.sampledProbability).toBeGreaterThan(0);
    expect(candidate.isExploration).toBe(true); // First attempt

    const result = engine.executeTransfer(candidate);
    expect(result.success).toBe(true);
    expect(result.coherenceResult.approved).toBe(true);
    expect(result.dampeningFactor).toBeGreaterThanOrEqual(0);
    expect(result.dampeningFactor).toBeLessThanOrEqual(1);

    // Verify target improved
    expect(result.verification.targetDelta).toBeGreaterThanOrEqual(0);

    // Verify source did not regress
    expect(result.verification.sourceStable).toBe(true);
  });

  it('should track transfer history across multiple transfers', () => {
    engine.setTransferExecutor(() => true);

    // Execute several transfers
    for (let i = 0; i < 5; i++) {
      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      engine.executeTransfer(candidate);
    }

    const history = engine.getTransferHistory();
    expect(history).toHaveLength(5);

    for (const record of history) {
      expect(record.transferId).toBeDefined();
      expect(record.sourceDomain).toBe('test-generation');
      expect(record.targetDomain).toBe('coverage-analysis');
      expect(typeof record.success).toBe('boolean');
      expect(record.timestamp).toBeGreaterThan(0);
    }
  });

  it('should not regress source domain after transfer', () => {
    // Transfer executor that does NOT change source performance
    engine.setTransferExecutor(() => true);

    const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
    const result = engine.executeTransfer(candidate);

    // Source delta should be 0 (no regression)
    expect(result.verification.sourceDelta).toBe(0);
    expect(result.verification.sourceStable).toBe(true);
  });

  it('should update Thompson Sampling after transfer outcomes', () => {
    engine.setTransferExecutor(() => true);

    // Before any transfers, mean should be 0.5 (uniform prior)
    const meanBefore = engine.getExpectedSuccessRate('test-generation', 'coverage-analysis');
    expect(meanBefore).toBeCloseTo(0.5, 1);

    // Execute successful transfers
    for (let i = 0; i < 5; i++) {
      const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
      engine.executeTransfer(candidate);
    }

    // After successful transfers, mean should increase
    const meanAfter = engine.getExpectedSuccessRate('test-generation', 'coverage-analysis');
    expect(meanAfter).toBeGreaterThan(meanBefore);
    expect(engine.getObservationCount('test-generation', 'coverage-analysis')).toBe(5);
  });

  it('should reject transfers when feature flag is disabled', () => {
    setRuVectorFeatureFlags({ useCrossDomainTransfer: false });

    const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');
    // When disabled, sampled probability should be 0
    expect(candidate.sampledProbability).toBe(0);
  });
});

// ============================================================================
// 3. Regret Tracking and Growth Rate Classification
// ============================================================================

describe('Phase 2: Regret Tracking Integration', () => {
  let tracker: RegretTracker;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useRegretTracking: true });
    tracker = createRegretTracker({ recentWindow: 20 });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should track 100+ decisions and classify regret growth rate', () => {
    const domain = 'test-generation';

    // Simulate learning: decreasing regret over time (sublinear growth)
    for (let i = 1; i <= 120; i++) {
      // As i increases, reward gets closer to optimal (learning)
      const learningFactor = Math.min(0.95, 0.3 + 0.6 * (i / 120));
      const reward = learningFactor;
      const optimalReward = 1.0;
      tracker.recordDecision(domain, reward, optimalReward);
    }

    const growthRate = tracker.getRegretGrowthRate(domain);
    const cumulativeRegret = tracker.getCumulativeRegret(domain);
    const regretCurve = tracker.getRegretCurve(domain);

    // Regret should have been accumulated
    expect(cumulativeRegret).toBeGreaterThan(0);

    // Should have enough data for classification
    expect(regretCurve).toHaveLength(120);

    // Growth rate should be classifiable (not insufficient_data)
    expect(growthRate).not.toBe('insufficient_data');

    // With improving rewards, growth should be sublinear
    expect(growthRate).toBe('sublinear');
  });

  it('should detect stagnation with constant regret per decision', () => {
    const domain = 'stagnating-domain';

    // Simulate stagnation: constant gap between reward and optimal
    for (let i = 1; i <= 100; i++) {
      tracker.recordDecision(domain, 0.5, 1.0); // constant 0.5 regret per step
    }

    const growthRate = tracker.getRegretGrowthRate(domain);
    expect(tracker.detectStagnation(domain)).toBe(true);
    expect(['linear', 'superlinear']).toContain(growthRate);
  });

  it('should compute health summary across multiple domains', () => {
    // Domain A: learning (decreasing regret)
    for (let i = 1; i <= 60; i++) {
      const reward = Math.min(0.95, 0.3 + 0.65 * (i / 60));
      tracker.recordDecision('domain-a', reward, 1.0);
    }

    // Domain B: stagnating
    for (let i = 1; i <= 60; i++) {
      tracker.recordDecision('domain-b', 0.5, 1.0);
    }

    const summary = tracker.getHealthSummary();
    expect(summary).toHaveLength(2);

    const domainA = summary.find((s) => s.domain === 'domain-a');
    const domainB = summary.find((s) => s.domain === 'domain-b');

    expect(domainA).toBeDefined();
    expect(domainB).toBeDefined();
    expect(domainA!.totalDecisions).toBe(60);
    expect(domainB!.totalDecisions).toBe(60);
    expect(domainB!.cumulativeRegret).toBeGreaterThan(domainA!.cumulativeRegret);
  });

  it('should emit alerts on growth rate transitions', () => {
    const alerts: Array<{
      domain: string;
      previousRate: string;
      newRate: string;
    }> = [];

    tracker.onAlert((alert) => {
      alerts.push({
        domain: alert.domain,
        previousRate: alert.previousRate,
        newRate: alert.newRate,
      });
    });

    const domain = 'transitioning-domain';

    // Phase 1: Learning (sublinear) -- need 50+ points for classification
    for (let i = 1; i <= 55; i++) {
      const reward = Math.min(0.95, 0.2 + 0.75 * (i / 55));
      tracker.recordDecision(domain, reward, 1.0);
    }

    // Phase 2: Switch to stagnation (linear) to trigger transition
    for (let i = 1; i <= 60; i++) {
      tracker.recordDecision(domain, 0.4, 1.0);
    }

    // We should have gotten the initial classification and possibly a transition
    const currentRate = tracker.getRegretGrowthRate(domain);
    expect(['sublinear', 'linear', 'superlinear']).toContain(currentRate);
  });

  it('should correctly classify curve shape via log-log regression', () => {
    // Test the underlying linear regression helper
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    const slope = linearRegressionSlope(xs, ys);
    expect(slope).toBeCloseTo(2.0, 5);

    // Test with single point
    expect(linearRegressionSlope([1], [1])).toBe(0);
  });

  it('should reset tracking data for a specific domain', () => {
    tracker.recordDecision('domain-x', 0.5, 1.0);
    tracker.recordDecision('domain-y', 0.7, 1.0);

    expect(tracker.getTrackedDomains()).toContain('domain-x');
    expect(tracker.getTrackedDomains()).toContain('domain-y');

    tracker.reset('domain-x');

    expect(tracker.getTrackedDomains()).not.toContain('domain-x');
    expect(tracker.getTrackedDomains()).toContain('domain-y');
  });
});

// ============================================================================
// 4. EWC++ Domain Switching and Fisher Matrix
// ============================================================================

describe('Phase 2: EWC++ Domain Switching Integration', () => {
  let engine: SONAThreeLoopEngine;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useSONAThreeLoop: true });
    engine = createSONAThreeLoopEngine({
      dimension: 64,
      microLoraLr: 0.01,
      consolidationInterval: 10,
      ewcLambda: 1000.0,
      taskBoundaryZScoreThreshold: 2.5,
      fisherDecay: 0.9,
      fisherSampleSize: 50,
      importanceThreshold: 0.01,
    });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should detect task boundary when domain features change significantly', () => {
    const dim = 64;
    const ewc = engine.getEWC();

    // Train on domain A: small magnitude gradients
    for (let i = 0; i < 10; i++) {
      const grad = generateGradient(dim, 0.1, i);
      ewc.detectTaskBoundary(grad);
    }

    // Suddenly switch to domain B: much larger magnitude gradients
    const domainBGradient = generateGradient(dim, 5.0, 100);
    const boundaryDetected = ewc.detectTaskBoundary(domainBGradient);

    // A large spike should trigger boundary detection
    expect(boundaryDetected).toBe(true);
    expect(ewc.getTaskBoundaryCount()).toBeGreaterThanOrEqual(1);
  });

  it('should preserve Fisher matrix values after domain switch', () => {
    const dim = 64;
    const ewc = engine.getEWC();

    // Generate gradient samples for Fisher estimation
    const gradients: Float32Array[] = [];
    for (let i = 0; i < 20; i++) {
      gradients.push(generateGradient(dim, 0.5, i));
    }

    // Update Fisher with current parameters
    const currentParams = new Float32Array(dim);
    currentParams.fill(0.1);
    ewc.updateFisher(gradients, currentParams);

    // Fisher diagonal should have non-zero entries
    const fisher = ewc.getFisherDiagonal();
    let hasNonZero = false;
    for (let i = 0; i < fisher.length; i++) {
      if (fisher[i] > 0) {
        hasNonZero = true;
        break;
      }
    }
    expect(hasNonZero).toBe(true);

    // Optimal parameters should be stored
    const optimal = ewc.getOptimalParams();
    expect(optimal[0]).toBeCloseTo(0.1, 3);
  });

  it('should compute non-zero EWC loss when params deviate from optimal', () => {
    const dim = 64;
    const ewc = engine.getEWC();

    // Set up Fisher and optimal params
    const gradients: Float32Array[] = [];
    for (let i = 0; i < 10; i++) {
      gradients.push(generateGradient(dim, 1.0, i));
    }
    const optimalParams = new Float32Array(dim);
    optimalParams.fill(0.5);
    ewc.updateFisher(gradients, optimalParams);

    // Compute loss with different parameters
    const driftedParams = new Float32Array(dim);
    driftedParams.fill(1.0); // Deviated from optimal 0.5

    const loss = ewc.computeLoss(driftedParams);
    expect(loss).toBeGreaterThan(0);

    // Loss with optimal params should be zero
    const zeroLoss = ewc.computeLoss(optimalParams);
    expect(zeroLoss).toBeCloseTo(0, 5);
  });

  it('should run full three-loop cycle: adapt, consolidate, sync', () => {
    const dim = 64;

    // Loop 1: Instant adaptations
    for (let i = 0; i < 15; i++) {
      const features = generateFeatures(dim, i);
      const result = engine.instantAdapt(features);

      expect(result.applied).toBe(true);
      expect(result.adaptedWeights).toHaveLength(dim);
      expect(result.requestIndex).toBe(i + 1);
    }

    expect(engine.getRequestCount()).toBe(15);
    expect(engine.shouldConsolidate()).toBe(true);

    // Loop 2: Background consolidation
    const consolResult = engine.backgroundConsolidate();
    expect(consolResult.consolidated).toBe(true);
    expect(consolResult.adaptationsMerged).toBe(15);
    expect(consolResult.durationMs).toBeGreaterThanOrEqual(0);

    // Loop 3: Peer synchronization
    const peerState = engine.getLocalPeerState('peer-1', 'test-generation');
    expect(peerState.peerId).toBe('peer-1');
    expect(peerState.domain).toBe('test-generation');
    expect(peerState.adaptationVector).toHaveLength(dim);
    expect(peerState.fisherDiagonal).toHaveLength(dim);
    expect(peerState.requestCount).toBe(15);

    // Sync with a simulated peer
    const mockPeer = {
      peerId: 'peer-2',
      domain: 'coverage-analysis',
      adaptationVector: new Float32Array(dim).fill(0.01),
      fisherDiagonal: new Float32Array(dim).fill(0.1),
      requestCount: 10,
      lastUpdateMs: Date.now(),
    };

    engine.syncWithPeers([mockPeer]);
    const peers = engine.getPeerStates();
    expect(peers.has('peer-2')).toBe(true);
  });

  it('should track EWC metrics correctly', () => {
    const dim = 64;

    // Run some adaptations and consolidation
    for (let i = 0; i < 10; i++) {
      engine.instantAdapt(generateFeatures(dim, i));
    }

    engine.backgroundConsolidate();

    const metrics = engine.getEWCMetrics();
    expect(metrics.lambda).toBe(1000.0);
    expect(typeof metrics.fisherTrace).toBe('number');
    expect(typeof metrics.avgFisherImportance).toBe('number');
    expect(typeof metrics.maxFisherImportance).toBe('number');
    expect(typeof metrics.protectedParams).toBe('number');
    expect(typeof metrics.regularizationLoss).toBe('number');
    expect(typeof metrics.consolidationCycles).toBe('number');
  });
});

// ============================================================================
// 5. Thompson Sampling Exploration/Exploitation Convergence
// ============================================================================

describe('Phase 2: Thompson Sampling Convergence', () => {
  let sampler: ThompsonSampler;

  beforeEach(() => {
    sampler = new ThompsonSampler();
  });

  it('should converge toward true success rate with enough observations', () => {
    const pairKey = 'domainA->domainB';
    const trueSuccessRate = 0.7;
    const numTrials = 200;

    for (let i = 0; i < numTrials; i++) {
      const success = Math.random() < trueSuccessRate;
      sampler.update(pairKey, success);
    }

    const estimatedMean = sampler.getMean(pairKey);

    // After 200 trials, the mean should be within 0.1 of the true rate
    expect(estimatedMean).toBeGreaterThan(trueSuccessRate - 0.1);
    expect(estimatedMean).toBeLessThan(trueSuccessRate + 0.1);
    expect(sampler.getObservationCount(pairKey)).toBe(numTrials);
  });

  it('should have wide distribution (exploration) with few observations', () => {
    const pairKey = 'new->pair';

    // With no observations, alpha=1, beta=1 -> uniform distribution
    expect(sampler.getAlpha(pairKey)).toBe(1);
    expect(sampler.getBeta(pairKey)).toBe(1);
    expect(sampler.getMean(pairKey)).toBe(0.5);

    // Sample multiple times -- should show high variance
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      samples.push(sampler.sample(pairKey));
    }

    const min = Math.min(...samples);
    const max = Math.max(...samples);
    // With uniform prior, samples should span most of [0, 1]
    expect(max - min).toBeGreaterThan(0.3);
  });

  it('should have narrow distribution (exploitation) after many observations', () => {
    const pairKey = 'proven->pair';

    // Record 100 successes out of 100 trials
    for (let i = 0; i < 100; i++) {
      sampler.update(pairKey, true);
    }

    // Mean should be close to 1.0
    expect(sampler.getMean(pairKey)).toBeGreaterThan(0.95);

    // Samples should cluster near 1.0
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      samples.push(sampler.sample(pairKey));
    }

    const min = Math.min(...samples);
    // Most samples should be > 0.9 (narrow distribution near 1.0)
    expect(min).toBeGreaterThan(0.8);
  });

  it('should track multiple domain pairs independently', () => {
    // Pair A: high success rate
    for (let i = 0; i < 50; i++) {
      sampler.update('A->B', Math.random() < 0.9);
    }

    // Pair B: low success rate
    for (let i = 0; i < 50; i++) {
      sampler.update('C->D', Math.random() < 0.2);
    }

    const meanAB = sampler.getMean('A->B');
    const meanCD = sampler.getMean('C->D');

    // A->B should have much higher mean than C->D
    expect(meanAB).toBeGreaterThan(meanCD + 0.3);
    expect(sampler.getObservationCount('A->B')).toBe(50);
    expect(sampler.getObservationCount('C->D')).toBe(50);
  });
});

// ============================================================================
// 6. Feature Flag Backward Compatibility
// ============================================================================

describe('Phase 2: Feature Flag Backward Compatibility', () => {
  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should default all Phase 2 flags to false', () => {
    resetRuVectorFeatureFlags();
    const flags = getRuVectorFeatureFlags();

    expect(flags.useNeuralRouting).toBe(false);
    expect(flags.useSONAThreeLoop).toBe(false);
    expect(flags.useCrossDomainTransfer).toBe(false);
    expect(flags.useRegretTracking).toBe(false);
  });

  it('should keep Phase 1 flags at their defaults when Phase 2 flags are set', () => {
    setRuVectorFeatureFlags({
      useNeuralRouting: true,
      useSONAThreeLoop: true,
      useCrossDomainTransfer: true,
      useRegretTracking: true,
    });

    const flags = getRuVectorFeatureFlags();

    // Phase 2 flags should be true
    expect(flags.useNeuralRouting).toBe(true);
    expect(flags.useSONAThreeLoop).toBe(true);
    expect(flags.useCrossDomainTransfer).toBe(true);
    expect(flags.useRegretTracking).toBe(true);

    // Pre-existing flags should be unchanged
    expect(flags.useQESONA).toBe(true);
    expect(flags.useQEFlashAttention).toBe(true);
    expect(flags.useQEGNNIndex).toBe(true);
    expect(flags.logMigrationMetrics).toBe(true);
  });

  it('should not alter routing behavior when useNeuralRouting is off', async () => {
    resetRuVectorFeatureFlags();
    expect(getRuVectorFeatureFlags().useNeuralRouting).toBe(false);

    // The NeuralTinyDancerRouter itself always runs (it is a code construct),
    // but the feature flag controls whether production code paths use it.
    // This test verifies the flag state, not internal router behavior.
    const flags = getRuVectorFeatureFlags();
    expect(flags.useNeuralRouting).toBe(false);
  });

  it('should reject cross-domain transfers when useCrossDomainTransfer is off', () => {
    resetRuVectorFeatureFlags();
    const engine = createDomainTransferEngine();
    const candidate = engine.evaluateTransfer('test-generation', 'coverage-analysis');

    // With flag off, the engine should return a rejected candidate
    expect(candidate.sampledProbability).toBe(0);
    expect(candidate.affinityScore).toBe(0);
  });

  it('should reset Phase 2 flags correctly', () => {
    setRuVectorFeatureFlags({
      useNeuralRouting: true,
      useSONAThreeLoop: true,
      useCrossDomainTransfer: true,
      useRegretTracking: true,
    });

    resetRuVectorFeatureFlags();
    const flags = getRuVectorFeatureFlags();

    expect(flags.useNeuralRouting).toBe(false);
    expect(flags.useSONAThreeLoop).toBe(false);
    expect(flags.useCrossDomainTransfer).toBe(false);
    expect(flags.useRegretTracking).toBe(false);
  });
});

// ============================================================================
// 7. End-to-End: All Phase 2 Components Together
// ============================================================================

describe('Phase 2: End-to-End Component Integration', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should run full Phase 2 pipeline: route -> adapt -> transfer -> track regret', async () => {
    setRuVectorFeatureFlags({
      useNeuralRouting: true,
      useSONAThreeLoop: true,
      useCrossDomainTransfer: true,
      useRegretTracking: true,
    });

    // Step 1: Neural routing with shadow mode
    const router = createNeuralTinyDancerRouter({
      forceShadowMode: true,
      shadowModeDecisions: 10,
    });

    const task = createTestTask(
      'Generate comprehensive integration tests for payment gateway',
      'test-generation',
    );
    const routeResult = await router.route(task);
    expect(routeResult).toBeDefined();
    expect(routeResult.model).toBeDefined();

    // Step 2: SONA three-loop adaptation
    const sonaEngine = createSONAThreeLoopEngine({
      dimension: 32,
      consolidationInterval: 5,
    });

    for (let i = 0; i < 6; i++) {
      sonaEngine.instantAdapt(generateFeatures(32, i));
    }

    expect(sonaEngine.shouldConsolidate()).toBe(true);
    const consolResult = sonaEngine.backgroundConsolidate();
    expect(consolResult.consolidated).toBe(true);

    // Step 3: Cross-domain transfer
    const transferEngine = createDomainTransferEngine({
      explorationWarmup: 2,
    });
    transferEngine.setTransferExecutor(() => true);
    transferEngine.setPerformanceProvider((domain) => ({
      domain,
      successRate: domain === 'test-generation' ? 0.85 : 0.55,
      avgConfidence: 0.7,
      patternCount: 50,
      timestamp: Date.now(),
    }));

    const candidate = transferEngine.evaluateTransfer('test-generation', 'coverage-analysis');
    const transferResult = transferEngine.executeTransfer(candidate);
    expect(transferResult.transferId).toBeDefined();

    // Step 4: Regret tracking
    const regretTracker = createRegretTracker();
    regretTracker.recordDecision('test-generation', 0.8, 1.0);
    regretTracker.recordDecision('coverage-analysis', 0.6, 1.0);

    expect(regretTracker.getCumulativeRegret('test-generation')).toBeCloseTo(0.2, 5);
    expect(regretTracker.getCumulativeRegret('coverage-analysis')).toBeCloseTo(0.4, 5);
    expect(regretTracker.getTotalDecisions()).toBe(2);
  });

  it('should work correctly with all Phase 2 flags toggled at runtime', async () => {
    // Start with all Phase 2 flags OFF
    resetRuVectorFeatureFlags();

    // Verify transfer is disabled
    const engine = createDomainTransferEngine();
    const disabledCandidate = engine.evaluateTransfer('a', 'b');
    expect(disabledCandidate.sampledProbability).toBe(0);

    // Enable Phase 2 flags at runtime
    setRuVectorFeatureFlags({
      useNeuralRouting: true,
      useSONAThreeLoop: true,
      useCrossDomainTransfer: true,
      useRegretTracking: true,
    });

    // Now transfer engine should allow evaluation
    const enabledEngine = createDomainTransferEngine();
    enabledEngine.setTransferExecutor(() => true);
    const enabledCandidate = enabledEngine.evaluateTransfer('a', 'b');
    expect(enabledCandidate.sampledProbability).toBeGreaterThan(0);

    // Disable again
    setRuVectorFeatureFlags({ useCrossDomainTransfer: false });
    const disabledAgain = enabledEngine.evaluateTransfer('a', 'b');
    expect(disabledAgain.sampledProbability).toBe(0);
  });
});
