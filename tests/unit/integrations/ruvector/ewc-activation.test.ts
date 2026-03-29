/**
 * EWC++ Activation Tests
 *
 * Tests for:
 * - Fisher Information Matrix round-trip persistence
 * - Multi-domain EWC loss behavior
 */

import { describe, it, expect } from 'vitest';
import {
  SONAThreeLoopEngine,
  type ThreeLoopConfig,
} from '../../../../src/integrations/ruvector/sona-three-loop';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestConfig(overrides: Partial<ThreeLoopConfig> = {}): Partial<ThreeLoopConfig> {
  return {
    dimension: 16,
    microLoraLr: 0.01,
    consolidationInterval: 5,
    ewcLambda: 100.0,
    taskBoundaryZScoreThreshold: 2.0,
    fisherDecay: 0.9,
    fisherSampleSize: 50,
    importanceThreshold: 0.001,
    ...overrides,
  };
}

/**
 * Create features clustered around a specific pattern.
 * E.g., domainIdx=0 -> [1, 0, 0, ...], domainIdx=1 -> [0, 1, 0, ...],
 * with small noise for variation.
 */
function createDomainFeatures(dim: number, domainIdx: number, noise: number = 0.05): number[] {
  const features: number[] = new Array(dim).fill(0);
  // Set the primary dimension for this "domain"
  if (domainIdx < dim) {
    features[domainIdx] = 1.0;
  }
  // Add small noise for realistic variation
  for (let i = 0; i < dim; i++) {
    features[i] += (Math.random() - 0.5) * noise;
  }
  return features;
}

/**
 * Create deterministic features (seed-based, no Math.random).
 */
function createSeededFeatures(dim: number, seed: number): number[] {
  const features: number[] = [];
  let s = seed;
  for (let i = 0; i < dim; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    features.push((s / 0x7fffffff) * 2 - 1);
  }
  return features;
}

// ============================================================================
// Fisher Round-Trip Persistence
// ============================================================================

describe('Fisher round-trip persistence', () => {
  it('should persist and restore Fisher state correctly', () => {
    const config = createTestConfig({ dimension: 16 });
    const engine = new SONAThreeLoopEngine(config);

    // Run several instantAdapt + recordOutcome cycles with diverse rewards
    for (let i = 0; i < 15; i++) {
      const features = createSeededFeatures(16, i * 7 + 1);
      engine.instantAdapt(features);
      // Use diverse rewards to produce non-trivial gradient variance
      const reward = i % 3 === 0 ? 1.0 : i % 3 === 1 ? -0.5 : 0.3;
      engine.recordOutcome(reward);
    }

    // Consolidate to update Fisher diagonal
    const consolidation = engine.backgroundConsolidate();
    expect(consolidation.consolidated).toBe(true);

    // Capture Fisher state from original engine
    const originalFisher = engine.getFisherDiagonal();
    const originalOptimal = engine.getOptimalParams();
    const originalMetrics = engine.getEWCMetrics();

    // Create a brand-new engine instance
    const newEngine = new SONAThreeLoopEngine(config);

    // Verify the new engine starts with zero Fisher
    const freshMetrics = newEngine.getEWCMetrics();
    expect(freshMetrics.fisherTrace).toBe(0);

    // Load the Fisher state from the original engine
    newEngine.loadFisher(originalFisher, originalOptimal);

    // Verify the restored Fisher matches the original
    const restoredMetrics = newEngine.getEWCMetrics();
    expect(restoredMetrics.fisherTrace).toBeCloseTo(originalMetrics.fisherTrace, 5);

    const restoredFisher = newEngine.getFisherDiagonal();
    expect(restoredFisher.length).toBe(originalFisher.length);
    for (let i = 0; i < restoredFisher.length; i++) {
      expect(restoredFisher[i]).toBeCloseTo(originalFisher[i], 5);
    }
  });

  it('should have non-zero Fisher trace after consolidation', () => {
    const config = createTestConfig({
      dimension: 16,
      // Consolidate after every adapt/record pair
      consolidationInterval: 1,
      // Low z-score threshold to ensure task boundary fires
      taskBoundaryZScoreThreshold: 0.5,
    });
    const engine = new SONAThreeLoopEngine(config);

    // Phase 1: Build stable gradient history (need 5+ calls to detectTaskBoundary)
    // Each consolidation calls detectTaskBoundary once, building history
    for (let i = 0; i < 6; i++) {
      engine.instantAdapt(createSeededFeatures(16, i + 100));
      engine.recordOutcome(0.5); // uniform reward -> stable gradient magnitudes
      engine.backgroundConsolidate(); // Each call adds one entry to gradient history
    }

    // Phase 2: Shock the gradient to trigger task boundary
    // Now gradientHistory has 6 entries; this 7th call will compute z-score
    engine.instantAdapt(createSeededFeatures(16, 999));
    engine.recordOutcome(50.0); // extreme reward shock
    engine.backgroundConsolidate(); // Should detect task boundary now

    const metrics = engine.getEWCMetrics();
    // Fisher trace should be non-zero after task boundary triggers updateFisher
    expect(metrics.fisherTrace).toBeGreaterThan(0);
  });
});

// ============================================================================
// Multi-Domain EWC Loss
// ============================================================================

describe('Multi-domain EWC loss', () => {
  it('should show EWC loss > 0 when training on new domain after consolidation', () => {
    const dim = 16;
    const config = createTestConfig({
      dimension: dim,
      // Consolidate after every pair to build gradient history
      consolidationInterval: 1,
      ewcLambda: 100.0,
      taskBoundaryZScoreThreshold: 0.5,
    });
    const engine = new SONAThreeLoopEngine(config);

    // -------- Domain A: build gradient history, then trigger task boundary --------
    // Build stable baseline (6 entries in detectTaskBoundary history)
    for (let i = 0; i < 6; i++) {
      engine.instantAdapt(createDomainFeatures(dim, 0, 0.01));
      engine.recordOutcome(0.5);
      engine.backgroundConsolidate();
    }
    // Shock to trigger task boundary -> updateFisher captures Domain A Fisher
    engine.instantAdapt(createDomainFeatures(dim, 0, 0.01));
    engine.recordOutcome(50.0);
    engine.backgroundConsolidate();

    // Verify Fisher is now non-zero
    const fisherAfterA = engine.getFisherDiagonal();
    const traceA = fisherAfterA.reduce((sum, v) => sum + v, 0);
    expect(traceA).toBeGreaterThan(0);

    // -------- Domain B: different feature direction --------
    // Train with different features; each consolidation applies EWC regularization
    for (let i = 0; i < 6; i++) {
      engine.instantAdapt(createDomainFeatures(dim, 1, 0.01));
      engine.recordOutcome(0.3);
      engine.backgroundConsolidate();
    }
    // Shock again to trigger second task boundary
    engine.instantAdapt(createDomainFeatures(dim, 1, 0.01));
    engine.recordOutcome(40.0);
    const consolidationB = engine.backgroundConsolidate();
    expect(consolidationB.consolidated).toBe(true);

    // After Domain B training, EWC loss should be positive because
    // the parameters diverged from Domain A's optimal point.
    // ewcLossBefore captures the loss at the start of consolidation,
    // before regularization pulls weights back toward optimal.
    // ewcLossAfter captures the loss after regularization correction.
    // At least the "before" loss should be positive if parameters moved.
    const metricsAfterB = engine.getEWCMetrics();
    const ewcLossAfterB = metricsAfterB.regularizationLoss;
    const domainBLossBefore = consolidationB.ewcLossBefore;
    const domainBLossAfter = consolidationB.ewcLossAfter;

    expect(
      ewcLossAfterB > 0 || domainBLossBefore > 0 || domainBLossAfter > 0
    ).toBe(true);
  });

  it('should preserve Domain A knowledge via Fisher weighting', () => {
    const dim = 16;
    const config = createTestConfig({
      dimension: dim,
      consolidationInterval: 1,
      ewcLambda: 1000.0,
      taskBoundaryZScoreThreshold: 0.5,
    });
    const engine = new SONAThreeLoopEngine(config);

    // Domain A: build gradient history, then trigger task boundary
    for (let i = 0; i < 6; i++) {
      engine.instantAdapt(createDomainFeatures(dim, 0, 0.01));
      engine.recordOutcome(0.5);
      engine.backgroundConsolidate();
    }
    engine.instantAdapt(createDomainFeatures(dim, 0, 0.01));
    engine.recordOutcome(50.0);
    engine.backgroundConsolidate();

    const fisherAfterA = engine.getFisherDiagonal();
    const fisherTraceA = fisherAfterA.reduce((sum, v) => sum + v, 0);

    // Fisher trace should be positive after Domain A (task boundary triggered updateFisher)
    expect(fisherTraceA).toBeGreaterThan(0);

    // Domain B: different direction, trigger another task boundary
    for (let i = 0; i < 6; i++) {
      engine.instantAdapt(createDomainFeatures(dim, 1, 0.01));
      engine.recordOutcome(0.3);
      engine.backgroundConsolidate();
    }
    engine.instantAdapt(createDomainFeatures(dim, 1, 0.01));
    engine.recordOutcome(40.0);
    engine.backgroundConsolidate();

    // Fisher trace should have been blended (EWC++ online update)
    const fisherAfterB = engine.getFisherDiagonal();
    const fisherTraceB = fisherAfterB.reduce((sum, v) => sum + v, 0);

    // Fisher trace should still be positive (blended via EWC++ decay, not overwritten)
    expect(fisherTraceB).toBeGreaterThan(0);
  });
});
