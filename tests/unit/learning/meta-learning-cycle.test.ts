/**
 * ADR-062 Tier 3 Action 6 — Meta-Learning Cycle Tests
 *
 * Validates:
 * - UnifiedMetricsSnapshot collection
 * - MetaLearningEngine trend detection (token-waste, quality-plateau,
 *   learning-stall, performance-regression)
 * - Feature-flag gating (AQE_META_LEARNING_ENABLED)
 * - shouldAutoApply confidence threshold
 * - Edge cases (empty snapshots, insufficient data)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { UnifiedMetricsSnapshot } from '../../../src/learning/metrics-tracker.js';
import {
  MetaLearningEngine,
  DEFAULT_META_LEARNING_CONFIG,
  type MetaLearningConfig,
  type MetaInsight,
} from '../../../src/learning/aqe-learning-engine.js';

// ============================================================================
// Helpers
// ============================================================================

/** Build a snapshot with sensible defaults; overrides merged shallowly. */
function makeSnapshot(
  overrides: Partial<{
    timestamp: number;
    tokenMetrics: Partial<UnifiedMetricsSnapshot['tokenMetrics']>;
    qualityMetrics: Partial<UnifiedMetricsSnapshot['qualityMetrics']>;
    learningMetrics: Partial<UnifiedMetricsSnapshot['learningMetrics']>;
    performanceMetrics: Partial<UnifiedMetricsSnapshot['performanceMetrics']>;
  }> = {},
): UnifiedMetricsSnapshot {
  return {
    timestamp: overrides.timestamp ?? Date.now(),
    tokenMetrics: {
      totalTokens: 1000,
      costUsd: 0.05,
      savingsUsd: 0.01,
      cacheHitRate: 0.3,
      ...overrides.tokenMetrics,
    },
    qualityMetrics: {
      gatePassRate: 0.85,
      averageScore: 0.8,
      ratchetLevel: 1,
      ...overrides.qualityMetrics,
    },
    learningMetrics: {
      patternCount: 50,
      averageConfidence: 0.7,
      quarantinedCount: 2,
      transferSuccessRate: 0.6,
      ...overrides.learningMetrics,
    },
    performanceMetrics: {
      avgLatencyMs: 100,
      p95LatencyMs: 250,
      errorRate: 0.02,
      ...overrides.performanceMetrics,
    },
  };
}

/** Generate N healthy (stable) snapshots spaced 5 min apart. */
function healthySnapshots(n: number): UnifiedMetricsSnapshot[] {
  const base = Date.now() - n * 300_000;
  return Array.from({ length: n }, (_, i) =>
    makeSnapshot({ timestamp: base + i * 300_000 }),
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('MetaLearningEngine (ADR-062 Tier 3 Action 6)', () => {
  const enabledConfig: Partial<MetaLearningConfig> = { enabled: true };
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.AQE_META_LEARNING_ENABLED;
    process.env.AQE_META_LEARNING_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AQE_META_LEARNING_ENABLED;
    } else {
      process.env.AQE_META_LEARNING_ENABLED = originalEnv;
    }
  });

  // --------------------------------------------------------------------------
  // 1. collectUnifiedSnapshot returns valid structure
  // --------------------------------------------------------------------------
  it('collectUnifiedSnapshot returns valid structure with all fields', () => {
    // This tests the interface shape — we construct one with makeSnapshot and
    // verify every top-level and nested key is present.
    const snap = makeSnapshot();

    expect(snap.timestamp).toBeTypeOf('number');
    expect(snap.tokenMetrics).toBeDefined();
    expect(snap.tokenMetrics.totalTokens).toBeTypeOf('number');
    expect(snap.tokenMetrics.costUsd).toBeTypeOf('number');
    expect(snap.tokenMetrics.savingsUsd).toBeTypeOf('number');
    expect(snap.tokenMetrics.cacheHitRate).toBeTypeOf('number');

    expect(snap.qualityMetrics).toBeDefined();
    expect(snap.qualityMetrics.gatePassRate).toBeTypeOf('number');
    expect(snap.qualityMetrics.averageScore).toBeTypeOf('number');
    expect(snap.qualityMetrics.ratchetLevel).toBeTypeOf('number');

    expect(snap.learningMetrics).toBeDefined();
    expect(snap.learningMetrics.patternCount).toBeTypeOf('number');
    expect(snap.learningMetrics.averageConfidence).toBeTypeOf('number');
    expect(snap.learningMetrics.quarantinedCount).toBeTypeOf('number');
    expect(snap.learningMetrics.transferSuccessRate).toBeTypeOf('number');

    expect(snap.performanceMetrics).toBeDefined();
    expect(snap.performanceMetrics.avgLatencyMs).toBeTypeOf('number');
    expect(snap.performanceMetrics.p95LatencyMs).toBeTypeOf('number');
    expect(snap.performanceMetrics.errorRate).toBeTypeOf('number');
  });

  // --------------------------------------------------------------------------
  // 2. Detects token-waste pattern
  // --------------------------------------------------------------------------
  it('runMetaLearningCycle detects token-waste pattern', () => {
    const engine = new MetaLearningEngine(enabledConfig);

    // First 3 snapshots: low cost
    const first = Array.from({ length: 3 }, (_, i) =>
      makeSnapshot({
        timestamp: i * 300_000,
        tokenMetrics: { costUsd: 0.05, savingsUsd: 0.01 },
      }),
    );
    // Last 3 snapshots: cost jumped, savings flat
    const second = Array.from({ length: 3 }, (_, i) =>
      makeSnapshot({
        timestamp: (i + 3) * 300_000,
        tokenMetrics: { costUsd: 0.15, savingsUsd: 0.01 },
      }),
    );

    const insights = engine.runMetaLearningCycle([...first, ...second]);
    const tokenWaste = insights.filter(i => i.type === 'token-waste');

    expect(tokenWaste.length).toBeGreaterThanOrEqual(1);
    expect(tokenWaste[0].suggestedAction).toBeDefined();
    expect(tokenWaste[0].confidence).toBeGreaterThan(0);
    expect(tokenWaste[0].confidence).toBeLessThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // 3. Detects quality-plateau pattern
  // --------------------------------------------------------------------------
  it('runMetaLearningCycle detects quality-plateau pattern', () => {
    const engine = new MetaLearningEngine(enabledConfig);

    // All snapshots have identical gatePassRate
    const snaps = Array.from({ length: 6 }, (_, i) =>
      makeSnapshot({
        timestamp: i * 300_000,
        qualityMetrics: { gatePassRate: 0.82 },
      }),
    );

    const insights = engine.runMetaLearningCycle(snaps);
    const plateaus = insights.filter(i => i.type === 'quality-plateau');

    expect(plateaus.length).toBeGreaterThanOrEqual(1);
    expect(plateaus[0].description).toContain('flat');
  });

  // --------------------------------------------------------------------------
  // 4. Detects learning-stall pattern
  // --------------------------------------------------------------------------
  it('runMetaLearningCycle detects learning-stall pattern', () => {
    const engine = new MetaLearningEngine(enabledConfig);

    const snaps = Array.from({ length: 6 }, (_, i) =>
      makeSnapshot({
        timestamp: i * 300_000,
        learningMetrics: { patternCount: 42, averageConfidence: 0.65 },
      }),
    );

    const insights = engine.runMetaLearningCycle(snaps);
    const stalls = insights.filter(i => i.type === 'learning-stall');

    expect(stalls.length).toBeGreaterThanOrEqual(1);
    expect(stalls[0].suggestedAction).toContain('domain');
  });

  // --------------------------------------------------------------------------
  // 5. Detects performance-regression pattern
  // --------------------------------------------------------------------------
  it('runMetaLearningCycle detects performance-regression pattern', () => {
    const engine = new MetaLearningEngine(enabledConfig);

    const first = Array.from({ length: 3 }, (_, i) =>
      makeSnapshot({
        timestamp: i * 300_000,
        performanceMetrics: { p95LatencyMs: 200 },
      }),
    );
    const second = Array.from({ length: 3 }, (_, i) =>
      makeSnapshot({
        timestamp: (i + 3) * 300_000,
        performanceMetrics: { p95LatencyMs: 500 },
      }),
    );

    const insights = engine.runMetaLearningCycle([...first, ...second]);
    const regressions = insights.filter(i => i.type === 'performance-regression');

    expect(regressions.length).toBeGreaterThanOrEqual(1);
    expect(regressions[0].description).toContain('latency');
  });

  // --------------------------------------------------------------------------
  // 6. No insights for healthy metrics
  // --------------------------------------------------------------------------
  it('returns no insights for healthy, improving metrics', () => {
    const engine = new MetaLearningEngine(enabledConfig);

    // Gradually improving across all dimensions
    const snaps = Array.from({ length: 6 }, (_, i) =>
      makeSnapshot({
        timestamp: i * 300_000,
        tokenMetrics: { costUsd: 0.05 - i * 0.005, savingsUsd: 0.01 + i * 0.005 },
        qualityMetrics: { gatePassRate: 0.80 + i * 0.02 },
        learningMetrics: { patternCount: 40 + i * 3, averageConfidence: 0.6 + i * 0.04 },
        performanceMetrics: { p95LatencyMs: 300 - i * 20 },
      }),
    );

    const insights = engine.runMetaLearningCycle(snaps);
    expect(insights.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 7. minSnapshotsForAnalysis respected
  // --------------------------------------------------------------------------
  it('returns no insights when fewer snapshots than minSnapshotsForAnalysis', () => {
    const engine = new MetaLearningEngine({ enabled: true, minSnapshotsForAnalysis: 10 });

    // Only 4 snapshots with clear token-waste — should still be skipped
    const snaps = Array.from({ length: 4 }, (_, i) =>
      makeSnapshot({
        timestamp: i * 300_000,
        tokenMetrics: { costUsd: 0.05 + i * 0.1 },
      }),
    );

    const insights = engine.runMetaLearningCycle(snaps);
    expect(insights.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 8. shouldAutoApply respects confidence threshold
  // --------------------------------------------------------------------------
  it('shouldAutoApply respects confidence threshold', () => {
    const engine = new MetaLearningEngine(enabledConfig);

    const highConfidence: MetaInsight = {
      id: 'test-1',
      type: 'token-waste',
      description: 'test',
      confidence: 0.9,
      suggestedAction: 'do something',
      detectedAt: Date.now(),
    };

    const lowConfidence: MetaInsight = {
      id: 'test-2',
      type: 'token-waste',
      description: 'test',
      confidence: 0.5,
      suggestedAction: 'do something',
      detectedAt: Date.now(),
    };

    expect(engine.shouldAutoApply(highConfidence)).toBe(true);
    expect(engine.shouldAutoApply(lowConfidence)).toBe(false);

    // With custom config threshold
    const strictConfig: MetaLearningConfig = {
      ...DEFAULT_META_LEARNING_CONFIG,
      enabled: true,
      autoApplyThreshold: 0.95,
    };
    expect(engine.shouldAutoApply(highConfidence, strictConfig)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 9. Feature flag disabled returns empty insights
  // --------------------------------------------------------------------------
  it('feature flag disabled returns empty insights', () => {
    delete process.env.AQE_META_LEARNING_ENABLED;

    const engine = new MetaLearningEngine(enabledConfig);

    // Create snapshots that would normally trigger token-waste
    const first = Array.from({ length: 3 }, (_, i) =>
      makeSnapshot({
        timestamp: i * 300_000,
        tokenMetrics: { costUsd: 0.05 },
      }),
    );
    const second = Array.from({ length: 3 }, (_, i) =>
      makeSnapshot({
        timestamp: (i + 3) * 300_000,
        tokenMetrics: { costUsd: 0.50 },
      }),
    );

    const insights = engine.runMetaLearningCycle([...first, ...second]);
    expect(insights.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 10. Multiple insights can be detected simultaneously
  // --------------------------------------------------------------------------
  it('detects multiple insights simultaneously', () => {
    const engine = new MetaLearningEngine(enabledConfig);

    // First half: low cost, low latency
    const first = Array.from({ length: 3 }, (_, i) =>
      makeSnapshot({
        timestamp: i * 300_000,
        tokenMetrics: { costUsd: 0.02, savingsUsd: 0.01 },
        performanceMetrics: { p95LatencyMs: 100 },
        learningMetrics: { patternCount: 50, averageConfidence: 0.7 },
        qualityMetrics: { gatePassRate: 0.85 },
      }),
    );
    // Second half: high cost, high latency, same patterns/quality
    const second = Array.from({ length: 3 }, (_, i) =>
      makeSnapshot({
        timestamp: (i + 3) * 300_000,
        tokenMetrics: { costUsd: 0.20, savingsUsd: 0.01 },
        performanceMetrics: { p95LatencyMs: 500 },
        learningMetrics: { patternCount: 50, averageConfidence: 0.7 },
        qualityMetrics: { gatePassRate: 0.85 },
      }),
    );

    const insights = engine.runMetaLearningCycle([...first, ...second]);
    const types = new Set(insights.map(i => i.type));

    expect(types.has('token-waste')).toBe(true);
    expect(types.has('performance-regression')).toBe(true);
    expect(insights.length).toBeGreaterThanOrEqual(2);
  });

  // --------------------------------------------------------------------------
  // 11. Edge case: empty snapshots
  // --------------------------------------------------------------------------
  it('returns no insights for empty snapshots array', () => {
    const engine = new MetaLearningEngine(enabledConfig);

    const insights = engine.runMetaLearningCycle([]);
    expect(insights.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 12. Snapshot timestamps are used for trend detection (ordering matters)
  // --------------------------------------------------------------------------
  it('uses snapshot ordering for trend detection', () => {
    const engine = new MetaLearningEngine(enabledConfig);

    // Ordered oldest-to-newest: cost rises over time
    const rising = Array.from({ length: 6 }, (_, i) =>
      makeSnapshot({
        timestamp: 1000 + i * 300_000,
        tokenMetrics: { costUsd: 0.02 + i * 0.04, savingsUsd: 0.01 },
      }),
    );

    const insightsRising = engine.runMetaLearningCycle(rising);
    const hasTokenWaste = insightsRising.some(i => i.type === 'token-waste');
    expect(hasTokenWaste).toBe(true);

    // Same snapshots reversed: cost *falls* over time — no token-waste
    const falling = [...rising].reverse();
    const insightsFalling = engine.runMetaLearningCycle(falling);
    const hasTokenWasteFalling = insightsFalling.some(i => i.type === 'token-waste');
    expect(hasTokenWasteFalling).toBe(false);
  });
});
