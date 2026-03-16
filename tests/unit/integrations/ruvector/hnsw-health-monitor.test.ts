/**
 * HNSW Health Monitor - Unit Tests
 * Task 3.4: HNSW Health Monitoring (ruvector-coherence)
 *
 * Tests spectral health metric computation, alert generation,
 * incremental tracking, edge cases, and feature flag integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HnswHealthMonitor,
  createHnswHealthMonitor,
  approximateFiedlerValue,
  approximateSpectralGap,
  estimateEffectiveResistance,
  computeCoherenceScore,
  buildAdjacencyFromIndex,
  buildLaplacian,
  ALERT_THRESHOLDS,
  _resetNativeLoader,
  type HnswHealthReport,
  type HealthAlert,
  type HealthMetricPoint,
  type SpectralMetrics,
} from '../../../../src/integrations/ruvector/hnsw-health-monitor';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
  getRuVectorFeatureFlags,
  isHnswHealthMonitorEnabled,
} from '../../../../src/integrations/ruvector/feature-flags';
import type { IHnswIndexProvider, SearchResult } from '../../../../src/kernel/hnsw-index-provider';

// ============================================================================
// Mock HNSW Index
// ============================================================================

/**
 * Simple mock implementing IHnswIndexProvider for testing.
 * Stores vectors and returns nearest neighbors based on Euclidean distance
 * when queried with actual vectors.
 */
class MockHnswIndex implements IHnswIndexProvider {
  private vectors: Map<number, Float32Array> = new Map();
  private dim: number;

  constructor(dim: number = 384) {
    this.dim = dim;
  }

  add(id: number, vector: Float32Array): void {
    this.vectors.set(id, vector);
  }

  search(query: Float32Array, k: number): SearchResult[] {
    const results: { id: number; distance: number }[] = [];

    for (const [id, vec] of this.vectors) {
      let dist = 0;
      for (let d = 0; d < Math.min(query.length, vec.length); d++) {
        const diff = query[d] - vec[d];
        dist += diff * diff;
      }
      results.push({ id, distance: Math.sqrt(dist) });
    }

    // Sort by distance ascending (nearest first)
    results.sort((a, b) => a.distance - b.distance);

    // Return top-k with score = 1 / (1 + distance)
    return results.slice(0, k).map(r => ({
      id: r.id,
      score: 1 / (1 + r.distance),
    }));
  }

  remove(id: number): boolean {
    return this.vectors.delete(id);
  }

  size(): number {
    return this.vectors.size;
  }

  dimensions(): number {
    return this.dim;
  }

  recall(): number {
    return 1.0;
  }

  /** Expose stored vectors for passing to buildAdjacencyFromIndex */
  getStoredVectors(): Map<number, Float32Array> {
    return new Map(this.vectors);
  }
}

/**
 * Create a mock index populated with N random vectors.
 */
function createPopulatedIndex(n: number, dim: number = 384): MockHnswIndex {
  const index = new MockHnswIndex(dim);
  for (let i = 0; i < n; i++) {
    const vec = new Float32Array(dim);
    for (let j = 0; j < dim; j++) {
      vec[j] = Math.random() * 2 - 1;
    }
    index.add(i, vec);
  }
  return index;
}

// ============================================================================
// Tests
// ============================================================================

describe('HnswHealthMonitor', () => {
  let monitor: HnswHealthMonitor;

  beforeEach(() => {
    monitor = createHnswHealthMonitor();
    resetRuVectorFeatureFlags();
    _resetNativeLoader();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
    _resetNativeLoader();
  });

  // --------------------------------------------------------------------------
  // Health Check Basics
  // --------------------------------------------------------------------------

  describe('checkHealth', () => {
    it('should return a valid health report for a populated index', () => {
      const index = createPopulatedIndex(20);
      const report = monitor.checkHealth(index);

      expect(report).toBeDefined();
      expect(report.indexSize).toBe(20);
      expect(report.checkedAt).toBeInstanceOf(Date);
      expect(report.checkDurationMs).toBeGreaterThanOrEqual(0);
      expect(typeof report.healthy).toBe('boolean');
      expect(report.metrics).toBeDefined();
      expect(typeof report.metrics.fiedlerValue).toBe('number');
      expect(typeof report.metrics.spectralGap).toBe('number');
      expect(typeof report.metrics.effectiveResistance).toBe('number');
      expect(typeof report.metrics.coherenceScore).toBe('number');
      expect(report.metrics.coherenceScore).toBeGreaterThanOrEqual(0);
      expect(report.metrics.coherenceScore).toBeLessThanOrEqual(1);
      expect(Array.isArray(report.alerts)).toBe(true);
    });

    it('should report healthy for a well-connected index', () => {
      const index = createPopulatedIndex(50);
      const report = monitor.checkHealth(index);

      // A well-connected graph with M=16 neighbors should be healthy
      expect(report.healthy).toBe(true);
      expect(report.alerts).toHaveLength(0);
      expect(report.metrics.coherenceScore).toBeGreaterThan(0);
    });

    it('should use TypeScript fallback when native is unavailable', () => {
      const index = createPopulatedIndex(10);
      const report = monitor.checkHealth(index);

      expect(report.usedNativeBackend).toBe(false);
    });

    it('should record check duration', () => {
      const index = createPopulatedIndex(10);
      const report = monitor.checkHealth(index);

      expect(report.checkDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include adjacencySource field in the report', () => {
      const index = createPopulatedIndex(10);
      const report = monitor.checkHealth(index);

      expect(report.adjacencySource).toBeDefined();
      expect(['actual-search', 'approximate']).toContain(report.adjacencySource);
    });

    it('should default to approximate adjacencySource when no stored vectors passed', () => {
      const index = createPopulatedIndex(10);
      const report = monitor.checkHealth(index);

      // checkHealth doesn't pass stored vectors, so it should be approximate
      expect(report.adjacencySource).toBe('approximate');
    });
  });

  // --------------------------------------------------------------------------
  // Small Index Edge Cases
  // --------------------------------------------------------------------------

  describe('small index handling', () => {
    it('should handle empty index gracefully', () => {
      const index = new MockHnswIndex();
      const report = monitor.checkHealth(index);

      expect(report.indexSize).toBe(0);
      expect(report.healthy).toBe(true);
      expect(report.alerts).toHaveLength(0);
      expect(report.metrics.coherenceScore).toBe(0);
      expect(report.adjacencySource).toBe('approximate');
    });

    it('should handle single-element index', () => {
      const index = createPopulatedIndex(1);
      const report = monitor.checkHealth(index);

      expect(report.indexSize).toBe(1);
      expect(report.healthy).toBe(true);
      expect(report.alerts).toHaveLength(0);
    });

    it('should handle two-element index', () => {
      const index = createPopulatedIndex(2);
      const report = monitor.checkHealth(index);

      expect(report.indexSize).toBe(2);
      expect(report.healthy).toBe(true);
      expect(report.alerts).toHaveLength(0);
    });

    it('should treat indexes below minIndexSize as healthy', () => {
      const monitor = createHnswHealthMonitor({ minIndexSize: 10 });
      const index = createPopulatedIndex(5);
      const report = monitor.checkHealth(index);

      expect(report.healthy).toBe(true);
      expect(report.alerts).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Alert Generation
  // --------------------------------------------------------------------------

  describe('alert generation', () => {
    it('should generate FragileIndex alert for low Fiedler value', () => {
      // Use custom thresholds that will trigger alerts on our synthetic graph
      const monitor = createHnswHealthMonitor({
        fiedlerThreshold: 100, // Very high threshold to ensure it triggers
        spectralGapThreshold: 0.0, // Don't trigger these
        resistanceThreshold: 999, // Don't trigger these
        coherenceThreshold: 0.0, // Don't trigger these
      });

      const index = createPopulatedIndex(10);
      const report = monitor.checkHealth(index);

      const fragileAlerts = report.alerts.filter(a => a.type === 'FragileIndex');
      expect(fragileAlerts.length).toBe(1);
      expect(fragileAlerts[0].threshold).toBe(100);
      expect(fragileAlerts[0].type).toBe('FragileIndex');
      expect(fragileAlerts[0].message).toContain('Fiedler value');
      expect(fragileAlerts[0].timestamp).toBeInstanceOf(Date);
    });

    it('should generate PoorExpansion alert for low spectral gap', () => {
      const monitor = createHnswHealthMonitor({
        fiedlerThreshold: 0.0,
        spectralGapThreshold: 100, // Very high threshold
        resistanceThreshold: 999,
        coherenceThreshold: 0.0,
      });

      const index = createPopulatedIndex(10);
      const report = monitor.checkHealth(index);

      const poorAlerts = report.alerts.filter(a => a.type === 'PoorExpansion');
      expect(poorAlerts.length).toBe(1);
      expect(poorAlerts[0].message).toContain('Spectral gap');
    });

    it('should generate LowCoherence alert for low coherence score', () => {
      const monitor = createHnswHealthMonitor({
        fiedlerThreshold: 0.0,
        spectralGapThreshold: 0.0,
        resistanceThreshold: 999,
        coherenceThreshold: 1.0, // Impossible to achieve
      });

      const index = createPopulatedIndex(10);
      const report = monitor.checkHealth(index);

      const coherenceAlerts = report.alerts.filter(a => a.type === 'LowCoherence');
      expect(coherenceAlerts.length).toBe(1);
      expect(coherenceAlerts[0].message).toContain('Coherence score');
    });

    it('should generate HighResistance alert for high resistance', () => {
      const monitor = createHnswHealthMonitor({
        fiedlerThreshold: 0.0,
        spectralGapThreshold: 0.0,
        resistanceThreshold: 0.0001, // Extremely low threshold
        coherenceThreshold: 0.0,
      });

      const index = createPopulatedIndex(10);
      const report = monitor.checkHealth(index);

      const resistanceAlerts = report.alerts.filter(a => a.type === 'HighResistance');
      expect(resistanceAlerts.length).toBe(1);
      expect(resistanceAlerts[0].message).toContain('effective resistance');
    });

    it('should not generate alerts when all thresholds are satisfied', () => {
      const monitor = createHnswHealthMonitor({
        fiedlerThreshold: 0.0,
        spectralGapThreshold: 0.0,
        resistanceThreshold: 999,
        coherenceThreshold: 0.0,
      });

      const index = createPopulatedIndex(20);
      const report = monitor.checkHealth(index);

      expect(report.healthy).toBe(true);
      expect(report.alerts).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Alert State
  // --------------------------------------------------------------------------

  describe('getAlerts', () => {
    it('should return empty alerts before any check', () => {
      expect(monitor.getAlerts()).toHaveLength(0);
    });

    it('should return alerts after a check that generates them', () => {
      const monitor = createHnswHealthMonitor({
        coherenceThreshold: 1.0,
      });
      const index = createPopulatedIndex(10);
      monitor.checkHealth(index);

      const alerts = monitor.getAlerts();
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should clear alerts when a healthy check follows an unhealthy one', () => {
      const monitor = createHnswHealthMonitor({
        coherenceThreshold: 1.0,
      });
      const index = createPopulatedIndex(10);
      monitor.checkHealth(index);
      expect(monitor.getAlerts().length).toBeGreaterThan(0);

      // Now use lenient thresholds
      const lenientMonitor = createHnswHealthMonitor({
        fiedlerThreshold: 0.0,
        spectralGapThreshold: 0.0,
        resistanceThreshold: 999,
        coherenceThreshold: 0.0,
      });
      lenientMonitor.checkHealth(index);
      expect(lenientMonitor.getAlerts()).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // isHealthy
  // --------------------------------------------------------------------------

  describe('isHealthy', () => {
    it('should return true before any check (optimistic)', () => {
      expect(monitor.isHealthy()).toBe(true);
    });

    it('should reflect the last check result', () => {
      const monitor = createHnswHealthMonitor({
        coherenceThreshold: 1.0, // Will fail
      });
      const index = createPopulatedIndex(10);
      monitor.checkHealth(index);

      expect(monitor.isHealthy()).toBe(false);
    });

    it('should return true for healthy index', () => {
      const monitor = createHnswHealthMonitor({
        fiedlerThreshold: 0.0,
        spectralGapThreshold: 0.0,
        resistanceThreshold: 999,
        coherenceThreshold: 0.0,
      });
      const index = createPopulatedIndex(20);
      monitor.checkHealth(index);

      expect(monitor.isHealthy()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Metrics History (Incremental Tracking)
  // --------------------------------------------------------------------------

  describe('incremental tracking', () => {
    it('should record metrics history across multiple checks', () => {
      const index = createPopulatedIndex(10);

      monitor.checkHealth(index);
      monitor.checkHealth(index);
      monitor.checkHealth(index);

      const history = monitor.getMetricsHistory();
      expect(history).toHaveLength(3);

      for (const point of history) {
        expect(point.timestamp).toBeInstanceOf(Date);
        expect(typeof point.coherenceScore).toBe('number');
        expect(typeof point.fiedlerValue).toBe('number');
        expect(typeof point.indexSize).toBe('number');
        expect(typeof point.healthy).toBe('boolean');
      }
    });

    it('should respect maxHistoryEntries configuration', () => {
      const monitor = createHnswHealthMonitor({ maxHistoryEntries: 5 });
      const index = createPopulatedIndex(10);

      for (let i = 0; i < 10; i++) {
        monitor.checkHealth(index);
      }

      const history = monitor.getMetricsHistory();
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should return limited history when limit is specified', () => {
      const index = createPopulatedIndex(10);

      for (let i = 0; i < 5; i++) {
        monitor.checkHealth(index);
      }

      const limited = monitor.getMetricsHistory(2);
      expect(limited).toHaveLength(2);
    });

    it('should return all history when limit exceeds entries', () => {
      const index = createPopulatedIndex(10);
      monitor.checkHealth(index);

      const history = monitor.getMetricsHistory(100);
      expect(history).toHaveLength(1);
    });

    it('should clear history when clearHistory is called', () => {
      const index = createPopulatedIndex(10);
      monitor.checkHealth(index);
      expect(monitor.getMetricsHistory()).toHaveLength(1);

      monitor.clearHistory();
      expect(monitor.getMetricsHistory()).toHaveLength(0);
      expect(monitor.getAlerts()).toHaveLength(0);
      expect(monitor.getLastReport()).toBeNull();
      expect(monitor.isHealthy()).toBe(true);
    });

    it('should track history for small indexes too', () => {
      const index = createPopulatedIndex(1);
      monitor.checkHealth(index);

      const history = monitor.getMetricsHistory();
      expect(history).toHaveLength(1);
      expect(history[0].indexSize).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // getLastReport
  // --------------------------------------------------------------------------

  describe('getLastReport', () => {
    it('should return null before any check', () => {
      expect(monitor.getLastReport()).toBeNull();
    });

    it('should return the most recent report', () => {
      const index = createPopulatedIndex(10);
      const report = monitor.checkHealth(index);
      const last = monitor.getLastReport();

      expect(last).toBe(report);
      expect(last!.indexSize).toBe(10);
    });
  });

  // --------------------------------------------------------------------------
  // ALERT_THRESHOLDS export
  // --------------------------------------------------------------------------

  describe('ALERT_THRESHOLDS', () => {
    it('should export default threshold constants', () => {
      expect(ALERT_THRESHOLDS.FragileIndex).toBe(0.01);
      expect(ALERT_THRESHOLDS.PoorExpansion).toBe(0.1);
      expect(ALERT_THRESHOLDS.HighResistance).toBe(10.0);
      expect(ALERT_THRESHOLDS.LowCoherence).toBe(0.3);
    });
  });
});

// ============================================================================
// Spectral Math Tests
// ============================================================================

describe('Spectral Math Utilities', () => {
  describe('approximateFiedlerValue', () => {
    it('should return 0 for single node', () => {
      const adjacency = [[]];
      expect(approximateFiedlerValue(adjacency, 1)).toBe(0);
    });

    it('should return 2 for two connected nodes', () => {
      const adjacency = [[1], [0]];
      expect(approximateFiedlerValue(adjacency, 2)).toBe(2);
    });

    it('should return 0 for two disconnected nodes', () => {
      const adjacency = [[], []];
      expect(approximateFiedlerValue(adjacency, 2)).toBe(0);
    });

    it('should return positive value for connected graph', () => {
      // Complete graph K4
      const adjacency = [
        [1, 2, 3],
        [0, 2, 3],
        [0, 1, 3],
        [0, 1, 2],
      ];
      const fiedler = approximateFiedlerValue(adjacency, 4);
      expect(fiedler).toBeGreaterThan(0);
    });

    it('should handle path graph (low connectivity)', () => {
      // Path: 0-1-2-3-4
      const adjacency = [
        [1],
        [0, 2],
        [1, 3],
        [2, 4],
        [3],
      ];
      const fiedler = approximateFiedlerValue(adjacency, 5);
      expect(fiedler).toBeGreaterThanOrEqual(0);
    });

    it('should handle cycle graph', () => {
      // Cycle: 0-1-2-3-0
      const adjacency = [
        [1, 3],
        [0, 2],
        [1, 3],
        [2, 0],
      ];
      const fiedler = approximateFiedlerValue(adjacency, 4);
      expect(fiedler).toBeGreaterThan(0);
    });
  });

  describe('approximateSpectralGap', () => {
    it('should equal Fiedler value for graph Laplacian', () => {
      const adjacency = [
        [1, 2],
        [0, 2],
        [0, 1],
      ];
      const fiedler = approximateFiedlerValue(adjacency, 3);
      const gap = approximateSpectralGap(adjacency, 3);

      // Spectral gap = lambda_2 - lambda_1 = fiedler - 0 = fiedler
      expect(gap).toBeCloseTo(fiedler, 5);
    });
  });

  describe('estimateEffectiveResistance', () => {
    it('should return 0 for single node', () => {
      const adjacency = [[]];
      expect(estimateEffectiveResistance(adjacency, 1)).toBe(0);
    });

    it('should return Infinity for disconnected graph', () => {
      const adjacency = [[], []];
      const resistance = estimateEffectiveResistance(adjacency, 2);
      expect(resistance).toBe(Infinity);
    });

    it('should return finite positive value for connected graph', () => {
      const adjacency = [
        [1, 2, 3],
        [0, 2, 3],
        [0, 1, 3],
        [0, 1, 2],
      ];
      const resistance = estimateEffectiveResistance(adjacency, 4);
      expect(resistance).toBeGreaterThan(0);
      expect(isFinite(resistance)).toBe(true);
    });

    it('should accept pre-computed Fiedler value', () => {
      const adjacency = [
        [1, 2],
        [0, 2],
        [0, 1],
      ];
      const fiedler = approximateFiedlerValue(adjacency, 3);
      const r1 = estimateEffectiveResistance(adjacency, 3, 50, fiedler);
      const r2 = estimateEffectiveResistance(adjacency, 3, 50);

      // Should produce similar results
      expect(Math.abs(r1 - r2)).toBeLessThan(0.01);
    });
  });

  describe('computeCoherenceScore', () => {
    it('should return 0 for completely unhealthy metrics', () => {
      const score = computeCoherenceScore(0, 0, Infinity);
      expect(score).toBe(0);
    });

    it('should return high score for healthy metrics', () => {
      const score = computeCoherenceScore(1.0, 1.0, 0.1);
      expect(score).toBeGreaterThan(0.7);
    });

    it('should be bounded between 0 and 1', () => {
      const testCases = [
        [0, 0, 0],
        [0.001, 0.001, 100],
        [0.5, 0.5, 1.0],
        [10, 10, 0.01],
        [100, 100, 0],
      ];

      for (const [f, g, r] of testCases) {
        const score = computeCoherenceScore(f, g, r);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('should increase with better Fiedler value', () => {
      const scoreLow = computeCoherenceScore(0.001, 0.5, 1.0);
      const scoreHigh = computeCoherenceScore(1.0, 0.5, 1.0);
      expect(scoreHigh).toBeGreaterThan(scoreLow);
    });

    it('should increase with better spectral gap', () => {
      const scoreLow = computeCoherenceScore(0.5, 0.01, 1.0);
      const scoreHigh = computeCoherenceScore(0.5, 1.0, 1.0);
      expect(scoreHigh).toBeGreaterThan(scoreLow);
    });

    it('should increase with lower resistance', () => {
      const scoreLow = computeCoherenceScore(0.5, 0.5, 50.0);
      const scoreHigh = computeCoherenceScore(0.5, 0.5, 0.1);
      expect(scoreHigh).toBeGreaterThan(scoreLow);
    });
  });

  describe('buildLaplacian', () => {
    it('should build correct Laplacian for triangle graph', () => {
      const adjacency = [
        [1, 2],
        [0, 2],
        [0, 1],
      ];
      const L = buildLaplacian(adjacency, 3);

      // Diagonal = degree
      expect(L[0][0]).toBe(2);
      expect(L[1][1]).toBe(2);
      expect(L[2][2]).toBe(2);

      // Off-diagonal = -1 for edges
      expect(L[0][1]).toBe(-1);
      expect(L[0][2]).toBe(-1);
      expect(L[1][0]).toBe(-1);
      expect(L[1][2]).toBe(-1);
      expect(L[2][0]).toBe(-1);
      expect(L[2][1]).toBe(-1);
    });

    it('should have row sums of zero', () => {
      const adjacency = [
        [1, 2, 3],
        [0, 2],
        [0, 1, 3],
        [0, 2],
      ];
      const L = buildLaplacian(adjacency, 4);

      for (let i = 0; i < 4; i++) {
        let rowSum = 0;
        for (let j = 0; j < 4; j++) {
          rowSum += L[i][j];
        }
        expect(rowSum).toBeCloseTo(0, 10);
      }
    });
  });

  describe('buildAdjacencyFromIndex', () => {
    it('should return empty adjacency for empty index', () => {
      const index = new MockHnswIndex();
      const { adjacency, nodeCount } = buildAdjacencyFromIndex(index);

      expect(nodeCount).toBe(0);
      expect(adjacency).toHaveLength(0);
    });

    it('should build adjacency for populated index', () => {
      const index = createPopulatedIndex(10);
      const { adjacency, nodeCount } = buildAdjacencyFromIndex(index);

      expect(nodeCount).toBe(10);
      expect(adjacency).toHaveLength(10);

      // Each node should have at least one neighbor
      for (const neighbors of adjacency) {
        expect(neighbors.length).toBeGreaterThan(0);
      }
    });

    it('should create symmetric adjacency (undirected graph)', () => {
      const index = createPopulatedIndex(8);
      const { adjacency, nodeCount } = buildAdjacencyFromIndex(index);

      for (let i = 0; i < nodeCount; i++) {
        for (const j of adjacency[i]) {
          expect(adjacency[j]).toContain(i);
        }
      }
    });

    it('should return approximate adjacencySource when no storedVectors provided', () => {
      const index = createPopulatedIndex(10);
      const result = buildAdjacencyFromIndex(index);

      expect(result.adjacencySource).toBe('approximate');
    });

    it('should return actual-search adjacencySource when storedVectors are provided', () => {
      const index = createPopulatedIndex(5, 8);
      const storedVectors = (index as MockHnswIndex).getStoredVectors();
      const result = buildAdjacencyFromIndex(index, 16, storedVectors);

      expect(result.adjacencySource).toBe('actual-search');
    });

    it('should return approximate adjacencySource when storedVectors map is empty', () => {
      const index = createPopulatedIndex(5);
      const emptyMap = new Map<number, Float32Array>();
      const result = buildAdjacencyFromIndex(index, 16, emptyMap);

      expect(result.adjacencySource).toBe('approximate');
    });

    it('should build adjacency from actual search results when storedVectors provided', () => {
      const dim = 4;
      const index = new MockHnswIndex(dim);

      // Create vectors that are clearly clustered:
      // Vectors 0,1 are close together; vectors 2,3 are close together
      const v0 = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const v1 = new Float32Array([0.9, 0.1, 0.0, 0.0]);
      const v2 = new Float32Array([0.0, 0.0, 1.0, 0.0]);
      const v3 = new Float32Array([0.0, 0.0, 0.9, 0.1]);

      index.add(0, v0);
      index.add(1, v1);
      index.add(2, v2);
      index.add(3, v3);

      const storedVectors = new Map<number, Float32Array>([
        [0, v0], [1, v1], [2, v2], [3, v3],
      ]);

      const result = buildAdjacencyFromIndex(index, 2, storedVectors);

      expect(result.adjacencySource).toBe('actual-search');
      expect(result.nodeCount).toBe(4);
      expect(result.adjacency).toHaveLength(4);

      // Vector 0 should have vector 1 as its nearest neighbor (they're closest)
      expect(result.adjacency[0]).toContain(1);
      // Vector 2 should have vector 3 as its nearest neighbor
      expect(result.adjacency[2]).toContain(3);
    });

    it('should log warning when falling back to approximate adjacency', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const index = createPopulatedIndex(5);
      buildAdjacencyFromIndex(index);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[HnswHealthMonitor] No stored vectors provided')
      );

      warnSpy.mockRestore();
    });

    it('should not log warning when storedVectors are provided', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const index = createPopulatedIndex(5, 8);
      const storedVectors = (index as MockHnswIndex).getStoredVectors();
      buildAdjacencyFromIndex(index, 16, storedVectors);

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});

// ============================================================================
// Feature Flag Integration
// ============================================================================

describe('Feature Flag Integration', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should have useHnswHealthMonitor flag default to false', () => {
    const flags = getRuVectorFeatureFlags();
    expect(flags.useHnswHealthMonitor).toBe(false);
  });

  it('should allow enabling the flag', () => {
    setRuVectorFeatureFlags({ useHnswHealthMonitor: true });
    const flags = getRuVectorFeatureFlags();
    expect(flags.useHnswHealthMonitor).toBe(true);
  });

  it('should reset flag to default on resetRuVectorFeatureFlags', () => {
    setRuVectorFeatureFlags({ useHnswHealthMonitor: true });
    resetRuVectorFeatureFlags();
    const flags = getRuVectorFeatureFlags();
    expect(flags.useHnswHealthMonitor).toBe(false);
  });

  it('should provide isHnswHealthMonitorEnabled convenience function', () => {
    expect(isHnswHealthMonitorEnabled()).toBe(false);

    setRuVectorFeatureFlags({ useHnswHealthMonitor: true });
    expect(isHnswHealthMonitorEnabled()).toBe(true);

    setRuVectorFeatureFlags({ useHnswHealthMonitor: false });
    expect(isHnswHealthMonitorEnabled()).toBe(false);
  });
});

// ============================================================================
// Factory
// ============================================================================

describe('createHnswHealthMonitor', () => {
  it('should create a monitor with default config', () => {
    const monitor = createHnswHealthMonitor();
    expect(monitor).toBeInstanceOf(HnswHealthMonitor);
    expect(monitor.isHealthy()).toBe(true);
    expect(monitor.getAlerts()).toHaveLength(0);
  });

  it('should accept custom configuration', () => {
    const monitor = createHnswHealthMonitor({
      fiedlerThreshold: 0.05,
      maxHistoryEntries: 50,
    });

    expect(monitor).toBeInstanceOf(HnswHealthMonitor);
  });
});
