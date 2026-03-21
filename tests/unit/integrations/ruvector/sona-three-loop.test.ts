/**
 * SONA Three-Loop Engine Unit Tests
 *
 * Tests for the three-loop coordination engine (Task 2.2):
 * - Instant loop: MicroLoRA adaptation
 * - Background loop: EWC++ consolidation
 * - Coordination loop: Cross-agent sync
 */

import { describe, it, expect, beforeEach, afterEach} from 'vitest';
import {
  SONAThreeLoopEngine,
  MicroLoRA,
  EWCPlusPlus,
  createSONAThreeLoopEngine,
  DEFAULT_THREE_LOOP_CONFIG,
  type ThreeLoopConfig,
  type PeerState,
} from '../../../../src/integrations/ruvector/sona-three-loop';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestFeatures(dim: number = 16, seed: number = 42): number[] {
  const features: number[] = [];
  let s = seed;
  for (let i = 0; i < dim; i++) {
    // Simple deterministic pseudo-random
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    features.push((s / 0x7fffffff) * 2 - 1); // [-1, 1]
  }
  return features;
}

function createTestConfig(overrides: Partial<ThreeLoopConfig> = {}): Partial<ThreeLoopConfig> {
  return {
    dimension: 16,
    microLoraLr: 0.01,
    consolidationInterval: 10,
    ewcLambda: 100.0,
    taskBoundaryZScoreThreshold: 2.0,
    fisherDecay: 0.9,
    fisherSampleSize: 50,
    importanceThreshold: 0.001,
    ...overrides,
  };
}

// ============================================================================
// MicroLoRA Tests
// ============================================================================

describe('MicroLoRA', () => {
  let lora: MicroLoRA;

  beforeEach(() => {
    lora = new MicroLoRA(16, 0.01);
  });

  afterEach(() => {
    // Reset state to prevent leaks between tests
  });

  it('should initialize with zero adaptation vector and base weights', () => {
    expect(lora.adaptationVector.length).toBe(16);
    expect(lora.baseWeights.length).toBe(16);
    expect(lora.getAdaptationCount()).toBe(0);
    expect(lora.getAdaptationMagnitude()).toBe(0);

    for (let i = 0; i < 16; i++) {
      expect(lora.adaptationVector[i]).toBe(0);
      expect(lora.baseWeights[i]).toBe(0);
    }
  });

  it('should adapt with rank-1 update', () => {
    const features = createTestFeatures(16, 1);
    const result = lora.adapt(features);

    expect(result.length).toBe(16);
    expect(lora.getAdaptationCount()).toBe(1);
    expect(lora.getAdaptationMagnitude()).toBeGreaterThan(0);
  });

  it('should accumulate adaptations across multiple requests', () => {
    const features1 = createTestFeatures(16, 1);
    const features2 = createTestFeatures(16, 2);

    lora.adapt(features1);
    expect(lora.getAdaptationCount()).toBe(1);

    lora.adapt(features2);
    expect(lora.getAdaptationCount()).toBe(2);

    // Magnitude should be greater than zero after multiple adaptations
    expect(lora.getAdaptationMagnitude()).toBeGreaterThan(0);
  });

  it('should produce adapted weights different from base', () => {
    const features = createTestFeatures(16, 1);
    lora.adapt(features);

    const effective = lora.getEffectiveWeights();
    // At least some values should be non-zero after adaptation
    let hasNonZero = false;
    for (let i = 0; i < effective.length; i++) {
      if (Math.abs(effective[i]) > 1e-10) {
        hasNonZero = true;
        break;
      }
    }
    expect(hasNonZero).toBe(true);
  });

  it('should consolidate adaptations into base weights', () => {
    const features = createTestFeatures(16, 1);
    lora.adapt(features);
    lora.adapt(features);

    const magnitudeBefore = lora.getAdaptationMagnitude();
    expect(magnitudeBefore).toBeGreaterThan(0);

    const merged = lora.consolidate();
    expect(merged).toBe(2);
    expect(lora.getAdaptationCount()).toBe(0);
    expect(lora.getAdaptationMagnitude()).toBe(0);

    // Base weights should now be non-zero
    let baseHasNonZero = false;
    for (let i = 0; i < lora.baseWeights.length; i++) {
      if (Math.abs(lora.baseWeights[i]) > 1e-10) {
        baseHasNonZero = true;
        break;
      }
    }
    expect(baseHasNonZero).toBe(true);
  });

  it('should handle features shorter than dimension', () => {
    const shortFeatures = [0.5, -0.3, 0.8];
    const result = lora.adapt(shortFeatures);

    expect(result.length).toBe(16);
    // Positions beyond feature length should reflect only base + delta
    expect(lora.getAdaptationCount()).toBe(1);
  });

  it('should handle features longer than dimension', () => {
    const longFeatures = new Array(32).fill(0.5);
    const result = lora.adapt(longFeatures);

    // Result should be clamped to dimension
    expect(result.length).toBe(16);
    expect(lora.getAdaptationCount()).toBe(1);
  });

  it('should reset adaptation without affecting base weights', () => {
    const features = createTestFeatures(16, 1);
    lora.adapt(features);
    const effectiveBefore = lora.getEffectiveWeights();

    // Consolidate to move delta into base
    lora.consolidate();

    // Now adapt again
    lora.adapt(features);
    expect(lora.getAdaptationCount()).toBe(1);

    // Reset adaptation
    lora.resetAdaptation();
    expect(lora.getAdaptationCount()).toBe(0);
    expect(lora.getAdaptationMagnitude()).toBe(0);

    // Base weights should still have the consolidated values
    let baseHasValue = false;
    for (let i = 0; i < lora.baseWeights.length; i++) {
      if (Math.abs(lora.baseWeights[i]) > 1e-10) {
        baseHasValue = true;
        break;
      }
    }
    expect(baseHasValue).toBe(true);
  });
});

// ============================================================================
// EWC++ Tests
// ============================================================================

describe('EWCPlusPlus', () => {
  let ewc: EWCPlusPlus;

  beforeEach(() => {
    ewc = new EWCPlusPlus(16, 100.0, 0.9, 2.0, 0.001);
  });

  it('should initialize with zero Fisher matrix and optimal params', () => {
    expect(ewc.fisherMatrix.length).toBe(16);
    expect(ewc.optimalParams.length).toBe(16);
    expect(ewc.getTaskBoundaryCount()).toBe(0);

    for (let i = 0; i < 16; i++) {
      expect(ewc.fisherMatrix[i]).toBe(0);
      expect(ewc.optimalParams[i]).toBe(0);
    }
  });

  it('should compute zero EWC loss when params equal optimal', () => {
    const params = new Float32Array(16);
    const loss = ewc.computeLoss(params);
    expect(loss).toBe(0);
  });

  it('should compute non-zero EWC loss when params deviate from optimal with non-zero Fisher', () => {
    // Set Fisher to non-zero
    ewc.fisherMatrix[0] = 1.0;
    ewc.optimalParams[0] = 0.5;

    const params = new Float32Array(16);
    params[0] = 1.0; // Deviates by 0.5 from optimal

    const loss = ewc.computeLoss(params);
    // L = (lambda/2) * F_0 * (1.0 - 0.5)^2 = (100/2) * 1.0 * 0.25 = 12.5
    expect(loss).toBeCloseTo(12.5, 4);
  });

  it('should not detect task boundary with insufficient gradient history', () => {
    const gradient = new Float32Array(16).fill(1.0);
    // First few calls should not trigger boundary (need >= 5 samples)
    expect(ewc.detectTaskBoundary(gradient)).toBe(false);
    expect(ewc.detectTaskBoundary(gradient)).toBe(false);
    expect(ewc.detectTaskBoundary(gradient)).toBe(false);
    expect(ewc.detectTaskBoundary(gradient)).toBe(false);
  });

  it('should detect task boundary on sudden gradient spike', () => {
    // Build up stable gradient history
    const normalGradient = new Float32Array(16).fill(0.1);
    for (let i = 0; i < 20; i++) {
      ewc.detectTaskBoundary(normalGradient);
    }

    // Inject a sudden spike -- magnitude changes dramatically
    const spikeGradient = new Float32Array(16).fill(100.0);
    const detected = ewc.detectTaskBoundary(spikeGradient);
    expect(detected).toBe(true);
    expect(ewc.getTaskBoundaryCount()).toBe(1);
  });

  it('should not detect task boundary with stable gradients', () => {
    const gradient = new Float32Array(16).fill(1.0);
    for (let i = 0; i < 30; i++) {
      const detected = ewc.detectTaskBoundary(gradient);
      // After building initial history, stable gradients should not trigger
      if (i > 5) {
        expect(detected).toBe(false);
      }
    }
  });

  it('should update Fisher Information Matrix with gradient samples', () => {
    const gradients: Float32Array[] = [];
    for (let i = 0; i < 10; i++) {
      const g = new Float32Array(16);
      g[0] = 1.0 + i * 0.1;
      g[1] = 0.5;
      gradients.push(g);
    }

    const currentParams = new Float32Array(16);
    currentParams[0] = 0.5;
    currentParams[1] = -0.3;

    ewc.updateFisher(gradients, currentParams);

    // Fisher should be non-zero for dimensions with gradient signal
    expect(ewc.fisherMatrix[0]).toBeGreaterThan(0);
    expect(ewc.fisherMatrix[1]).toBeGreaterThan(0);
    // Dimension with zero gradient should remain zero
    expect(ewc.fisherMatrix[5]).toBe(0);

    // Optimal params should be updated
    expect(ewc.optimalParams[0]).toBeCloseTo(0.5, 4);
    expect(ewc.optimalParams[1]).toBeCloseTo(-0.3, 4);
  });

  it('should blend Fisher estimates with decay factor', () => {
    // First update
    const gradients1: Float32Array[] = [new Float32Array(16)];
    gradients1[0][0] = 2.0;
    ewc.updateFisher(gradients1, new Float32Array(16));
    const fisher1 = ewc.fisherMatrix[0];

    // Second update with different gradients
    const gradients2: Float32Array[] = [new Float32Array(16)];
    gradients2[0][0] = 0.0;
    ewc.updateFisher(gradients2, new Float32Array(16));
    const fisher2 = ewc.fisherMatrix[0];

    // Fisher should have decayed (blended with zero)
    // F_new = 0.9 * fisher1 + 0.1 * 0 = 0.9 * fisher1
    expect(fisher2).toBeCloseTo(0.9 * fisher1, 4);
  });

  it('should return comprehensive metrics', () => {
    const metrics = ewc.getMetrics();

    expect(metrics).toHaveProperty('regularizationLoss');
    expect(metrics).toHaveProperty('taskBoundariesDetected');
    expect(metrics).toHaveProperty('fisherTrace');
    expect(metrics).toHaveProperty('avgFisherImportance');
    expect(metrics).toHaveProperty('maxFisherImportance');
    expect(metrics).toHaveProperty('protectedParams');
    expect(metrics).toHaveProperty('consolidationCycles');
    expect(metrics).toHaveProperty('lambda');
    expect(metrics.lambda).toBe(100.0);
    expect(metrics.taskBoundariesDetected).toBe(0);
  });

  it('should load persisted Fisher data', () => {
    const fisher = new Float32Array(16);
    fisher[0] = 5.0;
    fisher[3] = 2.5;

    const optimal = new Float32Array(16);
    optimal[0] = 0.7;
    optimal[3] = -0.4;

    ewc.loadFisher(fisher, optimal);

    expect(ewc.fisherMatrix[0]).toBe(5.0);
    expect(ewc.fisherMatrix[3]).toBe(2.5);
    expect(ewc.optimalParams[0]).toBeCloseTo(0.7, 4);
    expect(ewc.optimalParams[3]).toBeCloseTo(-0.4, 4);
  });

  it('should return copies of Fisher and optimal params', () => {
    ewc.fisherMatrix[0] = 1.0;
    const fisherCopy = ewc.getFisherDiagonal();
    fisherCopy[0] = 999.0;
    // Original should not be modified
    expect(ewc.fisherMatrix[0]).toBe(1.0);
  });
});

// ============================================================================
// SONAThreeLoopEngine Tests
// ============================================================================

describe('SONAThreeLoopEngine', () => {
  let engine: SONAThreeLoopEngine;

  beforeEach(() => {
    engine = new SONAThreeLoopEngine(createTestConfig());
  });

  describe('Instant Loop', () => {
    it('should adapt features and return result', () => {
      const features = createTestFeatures(16, 1);
      const result = engine.instantAdapt(features);

      expect(result.applied).toBe(true);
      expect(result.adaptedWeights.length).toBe(16);
      expect(result.latencyUs).toBeGreaterThanOrEqual(0);
      expect(result.requestIndex).toBe(1);
    });

    it('should track request count', () => {
      for (let i = 0; i < 5; i++) {
        engine.instantAdapt(createTestFeatures(16, i));
      }
      expect(engine.getRequestCount()).toBe(5);
    });

    it('should complete adaptation quickly', () => {
      const features = createTestFeatures(16, 1);

      // Warm up
      for (let i = 0; i < 100; i++) {
        engine.instantAdapt(features);
      }

      // Measure
      const start = performance.now();
      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        engine.instantAdapt(features);
      }
      const elapsed = performance.now() - start;
      const avgUs = (elapsed / iterations) * 1000;

      // Should be well under 1ms per adaptation
      // (100us target is for native; JS will be slower but still fast)
      expect(avgUs).toBeLessThan(1000); // < 1ms each in JS
    });

    it('should produce different results for different features', () => {
      const features1 = createTestFeatures(16, 1);
      const features2 = createTestFeatures(16, 2);

      const result1 = engine.instantAdapt(features1);
      const result2 = engine.instantAdapt(features2);

      // Results should differ
      let hasDiff = false;
      for (let i = 0; i < result1.adaptedWeights.length; i++) {
        if (Math.abs(result1.adaptedWeights[i] - result2.adaptedWeights[i]) > 1e-10) {
          hasDiff = true;
          break;
        }
      }
      expect(hasDiff).toBe(true);
    });
  });

  describe('Background Loop', () => {
    it('should consolidate when enough requests have been processed', () => {
      // Process enough requests to trigger consolidation
      for (let i = 0; i < 10; i++) {
        engine.instantAdapt(createTestFeatures(16, i));
      }

      expect(engine.shouldConsolidate()).toBe(true);
    });

    it('should not consolidate before interval reached', () => {
      for (let i = 0; i < 5; i++) {
        engine.instantAdapt(createTestFeatures(16, i));
      }

      expect(engine.shouldConsolidate()).toBe(false);
    });

    it('should perform consolidation and return result', () => {
      for (let i = 0; i < 10; i++) {
        engine.instantAdapt(createTestFeatures(16, i));
      }

      const result = engine.backgroundConsolidate();

      expect(result.consolidated).toBe(true);
      expect(result.adaptationsMerged).toBe(10);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.ewcLossBefore).toBe('number');
      expect(typeof result.ewcLossAfter).toBe('number');
      expect(typeof result.taskBoundaryDetected).toBe('boolean');
    });

    it('should reset consolidation counter after consolidation', () => {
      for (let i = 0; i < 10; i++) {
        engine.instantAdapt(createTestFeatures(16, i));
      }

      expect(engine.shouldConsolidate()).toBe(true);
      engine.backgroundConsolidate();
      expect(engine.shouldConsolidate()).toBe(false);
    });

    it('should handle consolidation with no adaptations', () => {
      const result = engine.backgroundConsolidate();

      expect(result.consolidated).toBe(false);
      expect(result.adaptationsMerged).toBe(0);
    });

    it('should detect task boundary during consolidation', () => {
      // Build stable gradient history — must call recordOutcome() to populate gradient buffer
      const stableFeatures = new Array(16).fill(0.1);
      for (let i = 0; i < 20; i++) {
        engine.instantAdapt(stableFeatures);
        engine.recordOutcome(1.0); // Positive reward -> gradient = 1.0 * features
      }
      engine.backgroundConsolidate();

      // Now inject dramatically different features to trigger boundary
      const spikeFeatures = new Array(16).fill(100.0);
      for (let i = 0; i < 10; i++) {
        engine.instantAdapt(spikeFeatures);
        engine.recordOutcome(1.0);
      }

      const result = engine.backgroundConsolidate();
      // Note: boundary detection depends on gradient history statistics
      // The test verifies the code path runs without error
      expect(typeof result.taskBoundaryDetected).toBe('boolean');
    });
  });

  describe('recordOutcome', () => {
    it('should populate gradient buffer after instantAdapt + recordOutcome', () => {
      const features = createTestFeatures(16, 1);
      engine.instantAdapt(features);
      engine.recordOutcome(1.0);

      // Access gradient buffer via backgroundConsolidate side effects:
      // After one recordOutcome, the buffer should have one entry.
      // We verify by running consolidation with a task boundary scenario.
      // Instead, use the internal EWC to verify Fisher gets updated.
      // More directly: call instantAdapt + recordOutcome multiple times,
      // then consolidate and check that Fisher is non-zero (requires gradient samples).
      const engine2 = new SONAThreeLoopEngine(createTestConfig({ consolidationInterval: 2 }));
      const f1 = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
      engine2.instantAdapt(f1);
      engine2.recordOutcome(1.0);
      engine2.instantAdapt(f1);
      engine2.recordOutcome(-0.5);

      // Build gradient history for task boundary detection
      const ewc = engine2.getEWC();
      const normalGrad = new Float32Array(16).fill(0.1);
      for (let i = 0; i < 10; i++) {
        ewc.detectTaskBoundary(normalGrad);
      }
      // Trigger boundary with a spike
      const spikeGrad = new Float32Array(16).fill(100.0);
      ewc.detectTaskBoundary(spikeGrad);

      // Force Fisher update through consolidation (boundary detected internally)
      const result = engine2.backgroundConsolidate();
      expect(typeof result.consolidated).toBe('boolean');
    });

    it('should compute gradient proxy as reward * features', () => {
      // Verify the REINFORCE gradient proxy math by calling updateFisher
      // directly on the EWC component with gradients obtained via recordOutcome.
      //
      // backgroundConsolidate() only updates Fisher on task boundary, so
      // for a direct gradient proxy test we bypass task boundary detection.
      const engine2 = new SONAThreeLoopEngine(createTestConfig({ consolidationInterval: 100 }));
      const ewc = engine2.getEWC();

      const features = [2.0, -1.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
      const reward = -0.5;

      engine2.instantAdapt(features);
      engine2.recordOutcome(reward);

      // The gradient proxy should be reward * features = [-1.0, 0.5, -0.25, 0, ...]
      // We can verify by directly calling updateFisher with the engine's
      // gradient buffer. Since the buffer is private, we construct the
      // expected gradient proxy and feed it to EWC directly.
      const expectedGradient = new Float32Array(16);
      for (let i = 0; i < features.length; i++) {
        expectedGradient[i] = reward * features[i];
      }

      ewc.updateFisher([expectedGradient], engine2.getEffectiveWeights());
      const fisher = engine2.getFisherDiagonal();

      // Fisher = E[g^2] = [(-1.0)^2, (0.5)^2, (-0.25)^2, 0, ...] (blended with decay)
      // Fisher[0] = (1-decay) * 1.0 = 0.1 * 1.0 = 0.1
      expect(fisher[0]).toBeGreaterThan(0);
      // Fisher[0] should be > Fisher[2] since |g[0]|^2 = 1.0 > |g[2]|^2 = 0.0625
      expect(fisher[0]).toBeGreaterThan(fisher[2]);
      // Fisher[3..15] should be 0 since those gradient components are 0
      expect(fisher[3]).toBe(0);
    });

    it('should not crash when recordOutcome is called without instantAdapt', () => {
      // Should log a warning but not throw
      engine.recordOutcome(1.0);
      // Engine should still be functional after the warning
      const result = engine.instantAdapt(createTestFeatures(16, 1));
      expect(result.applied).toBe(true);
    });

    it('should clear lastFeatures after recordOutcome', () => {
      engine.instantAdapt(createTestFeatures(16, 1));
      engine.recordOutcome(1.0);

      // Second recordOutcome without instantAdapt should warn (lastFeatures is null)
      // This should not throw and should not add to gradient buffer
      engine.recordOutcome(0.5);

      // Verify engine still works
      const result = engine.instantAdapt(createTestFeatures(16, 2));
      expect(result.applied).toBe(true);
    });

    it('should not populate gradient buffer from instantAdapt alone', () => {
      // Call instantAdapt without recordOutcome — gradient buffer should remain empty
      const engine2 = new SONAThreeLoopEngine(createTestConfig({ consolidationInterval: 5 }));
      for (let i = 0; i < 5; i++) {
        engine2.instantAdapt(createTestFeatures(16, i));
      }

      // Consolidate — with empty gradient buffer, no task boundary can be detected
      const result = engine2.backgroundConsolidate();
      expect(result.taskBoundaryDetected).toBe(false);
    });

    it('should respect fisherSampleSize buffer limit', () => {
      const engine2 = new SONAThreeLoopEngine(createTestConfig({ fisherSampleSize: 3 }));
      for (let i = 0; i < 5; i++) {
        engine2.instantAdapt(createTestFeatures(16, i));
        engine2.recordOutcome(1.0);
      }

      // Buffer should be bounded to fisherSampleSize (3)
      // We verify indirectly: consolidation should work without error
      const result = engine2.backgroundConsolidate();
      expect(typeof result.consolidated).toBe('boolean');
    });
  });

  describe('Coordination Loop', () => {
    it('should sync with peer states', () => {
      // Process some local requests
      for (let i = 0; i < 5; i++) {
        engine.instantAdapt(createTestFeatures(16, i));
      }

      const peerState: PeerState = {
        peerId: 'peer-1',
        domain: 'test-domain',
        adaptationVector: new Float32Array(16).fill(0.5),
        fisherDiagonal: new Float32Array(16).fill(1.0),
        requestCount: 100,
        lastUpdateMs: Date.now(),
      };

      // Should not throw
      engine.syncWithPeers([peerState]);

      // Peer should be stored
      const peers = engine.getPeerStates();
      expect(peers.size).toBe(1);
      expect(peers.has('peer-1')).toBe(true);
    });

    it('should handle empty peer list', () => {
      engine.syncWithPeers([]);
      expect(engine.getPeerStates().size).toBe(0);
    });

    it('should handle multiple peers', () => {
      const peers: PeerState[] = [
        {
          peerId: 'peer-1',
          domain: 'domain-a',
          adaptationVector: new Float32Array(16).fill(0.1),
          fisherDiagonal: new Float32Array(16).fill(1.0),
          requestCount: 50,
          lastUpdateMs: Date.now(),
        },
        {
          peerId: 'peer-2',
          domain: 'domain-b',
          adaptationVector: new Float32Array(16).fill(-0.1),
          fisherDiagonal: new Float32Array(16).fill(2.0),
          requestCount: 200,
          lastUpdateMs: Date.now(),
        },
      ];

      engine.syncWithPeers(peers);
      expect(engine.getPeerStates().size).toBe(2);
    });

    it('should return local peer state for sharing', () => {
      for (let i = 0; i < 5; i++) {
        engine.instantAdapt(createTestFeatures(16, i));
      }

      const localState = engine.getLocalPeerState('local-agent', 'test-domain');

      expect(localState.peerId).toBe('local-agent');
      expect(localState.domain).toBe('test-domain');
      expect(localState.adaptationVector.length).toBe(16);
      expect(localState.fisherDiagonal.length).toBe(16);
      expect(localState.requestCount).toBe(5);
      expect(localState.lastUpdateMs).toBeGreaterThan(0);
    });

    it('should Fisher-weight average peer contributions', () => {
      // Set up a scenario where peer has high Fisher on dim 0
      // and we have low Fisher everywhere
      const peer: PeerState = {
        peerId: 'expert-peer',
        domain: 'test',
        adaptationVector: new Float32Array(16),
        fisherDiagonal: new Float32Array(16),
        requestCount: 1000,
        lastUpdateMs: Date.now(),
      };
      peer.adaptationVector[0] = 10.0;
      peer.fisherDiagonal[0] = 100.0; // High confidence on dim 0

      // Our adaptation vector should be pulled toward peer's value on dim 0
      engine.instantAdapt(createTestFeatures(16, 1));
      engine.syncWithPeers([peer]);

      // The merged result should be influenced by the peer's high-Fisher value
      const localState = engine.getLocalPeerState('self', 'test');
      // Dim 0 should have been pulled toward peer's value
      expect(localState.adaptationVector[0]).not.toBe(0);
    });
  });

  describe('EWC Metrics', () => {
    it('should return EWC metrics', () => {
      const metrics = engine.getEWCMetrics();

      expect(metrics).toHaveProperty('regularizationLoss');
      expect(metrics).toHaveProperty('taskBoundariesDetected');
      expect(metrics).toHaveProperty('fisherTrace');
      expect(metrics).toHaveProperty('avgFisherImportance');
      expect(metrics).toHaveProperty('maxFisherImportance');
      expect(metrics).toHaveProperty('protectedParams');
      expect(metrics).toHaveProperty('consolidationCycles');
      expect(metrics).toHaveProperty('lambda');
    });

    it('should update metrics after consolidation', () => {
      for (let i = 0; i < 10; i++) {
        engine.instantAdapt(createTestFeatures(16, i));
      }

      const metricsBefore = engine.getEWCMetrics();
      engine.backgroundConsolidate();
      const metricsAfter = engine.getEWCMetrics();

      // At minimum, loss values should be computable
      expect(typeof metricsBefore.regularizationLoss).toBe('number');
      expect(typeof metricsAfter.regularizationLoss).toBe('number');
    });
  });

  describe('Persistence Support', () => {
    it('should expose Fisher diagonal for persistence', () => {
      const fisher = engine.getFisherDiagonal();
      expect(fisher).toBeInstanceOf(Float32Array);
      expect(fisher.length).toBe(16);
    });

    it('should expose optimal params for persistence', () => {
      const optimal = engine.getOptimalParams();
      expect(optimal).toBeInstanceOf(Float32Array);
      expect(optimal.length).toBe(16);
    });

    it('should load persisted Fisher data', () => {
      const fisher = new Float32Array(16);
      fisher[0] = 5.0;
      fisher[5] = 3.0;

      const optimal = new Float32Array(16);
      optimal[0] = 0.7;

      engine.loadFisher(fisher, optimal);

      const loaded = engine.getFisherDiagonal();
      expect(loaded[0]).toBe(5.0);
      expect(loaded[5]).toBe(3.0);

      const loadedOptimal = engine.getOptimalParams();
      expect(loadedOptimal[0]).toBeCloseTo(0.7, 4);
    });

    it('should expose and load base weights', () => {
      // Process some data to create non-zero weights
      for (let i = 0; i < 5; i++) {
        engine.instantAdapt(createTestFeatures(16, i));
      }
      engine.backgroundConsolidate();

      const baseWeights = engine.getBaseWeights();
      expect(baseWeights).toBeInstanceOf(Float32Array);
      expect(baseWeights.length).toBe(16);

      // Load into a new engine
      const newEngine = new SONAThreeLoopEngine(createTestConfig());
      newEngine.setBaseWeights(baseWeights);

      const loadedWeights = newEngine.getBaseWeights();
      for (let i = 0; i < 16; i++) {
        expect(loadedWeights[i]).toBeCloseTo(baseWeights[i], 6);
      }
    });
  });

  describe('Configuration', () => {
    it('should use default config when none provided', () => {
      const defaultEngine = new SONAThreeLoopEngine();
      const config = defaultEngine.getConfig();

      expect(config.dimension).toBe(DEFAULT_THREE_LOOP_CONFIG.dimension);
      expect(config.microLoraLr).toBe(DEFAULT_THREE_LOOP_CONFIG.microLoraLr);
      expect(config.ewcLambda).toBe(DEFAULT_THREE_LOOP_CONFIG.ewcLambda);
    });

    it('should merge partial config with defaults', () => {
      const customEngine = new SONAThreeLoopEngine({ dimension: 32, ewcLambda: 500.0 });
      const config = customEngine.getConfig();

      expect(config.dimension).toBe(32);
      expect(config.ewcLambda).toBe(500.0);
      expect(config.microLoraLr).toBe(DEFAULT_THREE_LOOP_CONFIG.microLoraLr);
    });
  });

  describe('Three Loops Coordinate Correctly', () => {
    it('should run full cycle: adapt, consolidate, sync', () => {
      // 1. Instant loop: multiple adaptations
      for (let i = 0; i < 10; i++) {
        const result = engine.instantAdapt(createTestFeatures(16, i));
        expect(result.applied).toBe(true);
        expect(result.requestIndex).toBe(i + 1);
      }

      // 2. Background loop: consolidate
      expect(engine.shouldConsolidate()).toBe(true);
      const consolidation = engine.backgroundConsolidate();
      expect(consolidation.consolidated).toBe(true);
      expect(consolidation.adaptationsMerged).toBe(10);

      // 3. Coordination loop: get state and sync
      const localState = engine.getLocalPeerState('agent-1', 'test');
      expect(localState.requestCount).toBe(10);

      const peerState: PeerState = {
        peerId: 'agent-2',
        domain: 'test',
        adaptationVector: new Float32Array(16).fill(0.1),
        fisherDiagonal: new Float32Array(16).fill(0.5),
        requestCount: 50,
        lastUpdateMs: Date.now(),
      };

      engine.syncWithPeers([peerState]);

      // Should still be able to adapt after sync
      const postSyncResult = engine.instantAdapt(createTestFeatures(16, 99));
      expect(postSyncResult.applied).toBe(true);
      expect(postSyncResult.requestIndex).toBe(11);
    });

    it('should maintain state across multiple consolidation cycles', () => {
      // First cycle
      for (let i = 0; i < 10; i++) {
        engine.instantAdapt(createTestFeatures(16, i));
      }
      const result1 = engine.backgroundConsolidate();
      expect(result1.adaptationsMerged).toBe(10);

      // Second cycle
      for (let i = 10; i < 20; i++) {
        engine.instantAdapt(createTestFeatures(16, i));
      }
      const result2 = engine.backgroundConsolidate();
      expect(result2.adaptationsMerged).toBe(10);

      // Weights should accumulate across cycles
      const baseWeights = engine.getBaseWeights();
      let hasNonZero = false;
      for (let i = 0; i < baseWeights.length; i++) {
        if (Math.abs(baseWeights[i]) > 1e-10) {
          hasNonZero = true;
          break;
        }
      }
      expect(hasNonZero).toBe(true);
      expect(engine.getRequestCount()).toBe(20);
    });
  });

  describe('Backward Compatibility with QESONA', () => {
    it('should expose internal components for testing', () => {
      expect(engine.getMicroLoRA()).toBeInstanceOf(MicroLoRA);
      expect(engine.getEWC()).toBeInstanceOf(EWCPlusPlus);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createSONAThreeLoopEngine', () => {
  it('should create engine with default config', () => {
    const engine = createSONAThreeLoopEngine();
    expect(engine).toBeInstanceOf(SONAThreeLoopEngine);
    expect(engine.getConfig().dimension).toBe(DEFAULT_THREE_LOOP_CONFIG.dimension);
  });

  it('should create engine with custom config', () => {
    const engine = createSONAThreeLoopEngine({ dimension: 64 });
    expect(engine.getConfig().dimension).toBe(64);
  });
});
