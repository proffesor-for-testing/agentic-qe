/**
 * HNSW Health Monitor - Spectral Health Monitoring
 *
 * Monitors the structural health of HNSW indexes using spectral graph
 * theory metrics. Computes Fiedler value (algebraic connectivity),
 * spectral gap, effective resistance, and a combined coherence score.
 *
 * Uses TypeScript power iteration and sample-based estimation for
 * spectral computation. No native package exists for this — the
 * TypeScript implementation is the production implementation.
 *
 * @see Task 3.4: HNSW Health Monitoring
 * @module integrations/ruvector/hnsw-health-monitor
 */

import type { IHnswIndexProvider } from '../../kernel/hnsw-index-provider.js';
import { isHnswHealthMonitorEnabled } from './feature-flags.js';

// Re-export spectral math utilities for backward compatibility
export {
  buildLaplacian,
  laplacianMultiply,
  vectorNorm,
  normalizeInPlace,
  deflateVector,
  approximateFiedlerValue,
  approximateSpectralGap,
  estimateEffectiveResistance,
  computeCoherenceScore,
} from './spectral-math.js';

import {
  approximateFiedlerValue,
  approximateSpectralGap,
  estimateEffectiveResistance,
  computeCoherenceScore,
} from './spectral-math.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Alert types generated when health metrics exceed thresholds.
 */
export type HealthAlertType =
  | 'FragileIndex'
  | 'PoorExpansion'
  | 'HighResistance'
  | 'LowCoherence';

/**
 * A single health alert with context.
 */
export interface HealthAlert {
  /** Alert classification */
  readonly type: HealthAlertType;
  /** Human-readable description */
  readonly message: string;
  /** The metric value that triggered the alert */
  readonly value: number;
  /** The threshold that was exceeded */
  readonly threshold: number;
  /** When the alert was generated */
  readonly timestamp: Date;
}

/**
 * Spectral health metrics for an HNSW index.
 */
export interface SpectralMetrics {
  /** Second smallest eigenvalue of graph Laplacian (algebraic connectivity) */
  readonly fiedlerValue: number;
  /** Difference between 2nd and 1st eigenvalues (expansion quality) */
  readonly spectralGap: number;
  /** Average resistance distance between sampled node pairs */
  readonly effectiveResistance: number;
  /** Combined health metric (0-1, higher = healthier) */
  readonly coherenceScore: number;
}

/**
 * Full health report for an HNSW index.
 */
export interface HnswHealthReport {
  /** Whether the index is considered healthy */
  readonly healthy: boolean;
  /** Spectral health metrics */
  readonly metrics: SpectralMetrics;
  /** Active alerts (empty if healthy) */
  readonly alerts: HealthAlert[];
  /** Number of vectors in the index */
  readonly indexSize: number;
  /** Whether native ruvector-coherence was used */
  readonly usedNativeBackend: boolean;
  /** Whether adjacency was built from actual search or circular approximation */
  readonly adjacencySource: 'actual-search' | 'approximate';
  /** Time taken for the health check in ms */
  readonly checkDurationMs: number;
  /** When the check was performed */
  readonly checkedAt: Date;
}

/**
 * A timestamped health metric point for history tracking.
 */
export interface HealthMetricPoint {
  /** Coherence score at this point */
  readonly coherenceScore: number;
  /** Fiedler value at this point */
  readonly fiedlerValue: number;
  /** Index size at measurement time */
  readonly indexSize: number;
  /** Whether the index was healthy */
  readonly healthy: boolean;
  /** Timestamp of measurement */
  readonly timestamp: Date;
}

/**
 * Configuration for the HNSW health monitor.
 */
export interface HnswHealthMonitorConfig {
  /** Fiedler value threshold for FragileIndex alert (default: 0.01) */
  readonly fiedlerThreshold: number;
  /** Spectral gap threshold for PoorExpansion alert (default: 0.1) */
  readonly spectralGapThreshold: number;
  /** Effective resistance threshold for HighResistance alert (default: 10.0) */
  readonly resistanceThreshold: number;
  /** Coherence score threshold for LowCoherence alert (default: 0.3) */
  readonly coherenceThreshold: number;
  /** Maximum iterations for power iteration (default: 100) */
  readonly maxPowerIterations: number;
  /** Convergence tolerance for power iteration (default: 1e-6) */
  readonly convergenceTolerance: number;
  /** Number of node pairs to sample for resistance estimation (default: 50) */
  readonly resistanceSampleSize: number;
  /** Maximum history entries to retain (default: 200) */
  readonly maxHistoryEntries: number;
  /** Minimum index size for meaningful spectral analysis (default: 3) */
  readonly minIndexSize: number;
}

/**
 * Default health monitor configuration.
 */
export const DEFAULT_HNSW_HEALTH_CONFIG: HnswHealthMonitorConfig = {
  fiedlerThreshold: 0.01,
  spectralGapThreshold: 0.1,
  resistanceThreshold: 10.0,
  coherenceThreshold: 0.3,
  maxPowerIterations: 100,
  convergenceTolerance: 1e-6,
  resistanceSampleSize: 50,
  maxHistoryEntries: 200,
  minIndexSize: 3,
};

// ============================================================================
// Thresholds (exported for tests)
// ============================================================================

export const ALERT_THRESHOLDS = {
  FragileIndex: 0.01,
  PoorExpansion: 0.1,
  HighResistance: 10.0,
  LowCoherence: 0.3,
} as const;

// ============================================================================
// Native Backend Loader
// ============================================================================

/** ruvector-coherence native module interface */
interface RuvectorCoherenceModule {
  computeFiedlerValue(adjacency: number[][]): number;
  computeSpectralGap(adjacency: number[][]): number;
  computeEffectiveResistance(adjacency: number[][]): number;
}

let nativeCoherence: RuvectorCoherenceModule | null = null;
let nativeLoadAttempted = false;

/**
 * Check for native coherence module.
 * No native package exists — always returns null.
 * The TypeScript power iteration implementation is used.
 */
function loadNativeCoherence(): RuvectorCoherenceModule | null {
  if (nativeLoadAttempted) return nativeCoherence;
  nativeLoadAttempted = true;
  nativeCoherence = null;
  return null;
}

/** Reset native loader state (for testing) */
export function _resetNativeLoader(): void {
  nativeCoherence = null;
  nativeLoadAttempted = false;
}

// ============================================================================
// Adjacency Construction
// ============================================================================

/**
 * Result from building adjacency from an HNSW index.
 */
export interface AdjacencyResult {
  /** Adjacency list for the graph */
  adjacency: number[][];
  /** Number of nodes in the graph */
  nodeCount: number;
  /** Whether adjacency was built from actual search or circular approximation */
  adjacencySource: 'actual-search' | 'approximate';
}

/**
 * Build an adjacency list from an HNSW-like index by using similarity
 * between stored vectors. When stored vectors are provided, each vector
 * is searched against the index to discover real neighbors. Otherwise,
 * falls back to a circular approximation.
 *
 * @param index - The HNSW index provider
 * @param maxNeighbors - Maximum neighbors per node to consider
 * @param storedVectors - Optional map of id to vector for real neighbor discovery
 * @returns Adjacency list, node count, and adjacency source
 */
export function buildAdjacencyFromIndex(
  index: IHnswIndexProvider,
  maxNeighbors: number = 16,
  storedVectors?: Map<number, Float32Array>
): AdjacencyResult {
  const n = index.size();
  if (n === 0) return { adjacency: [], nodeCount: 0, adjacencySource: 'approximate' };

  const adjacency: number[][] = Array.from({ length: n }, () => []);
  const k = Math.min(maxNeighbors, n - 1);

  if (k === 0) return { adjacency, nodeCount: n, adjacencySource: 'approximate' };

  // If stored vectors are provided and non-empty, use real search
  if (storedVectors && storedVectors.size > 0) {
    // Build a mapping from vector IDs to adjacency indices (0..n-1)
    const ids = Array.from(storedVectors.keys()).slice(0, n);
    const idToIdx = new Map<number, number>();
    for (let i = 0; i < ids.length; i++) {
      idToIdx.set(ids[i], i);
    }

    for (let i = 0; i < ids.length; i++) {
      const vec = storedVectors.get(ids[i]);
      if (!vec) continue;

      // Search for k+1 neighbors (the query itself may be returned)
      const results = index.search(vec, k + 1);

      for (const result of results) {
        // Skip self
        if (result.id === ids[i]) continue;

        const neighborIdx = idToIdx.get(result.id);
        if (neighborIdx === undefined) continue;

        // Add bidirectional edge
        if (!adjacency[i].includes(neighborIdx)) {
          adjacency[i].push(neighborIdx);
        }
        if (!adjacency[neighborIdx].includes(i)) {
          adjacency[neighborIdx].push(i);
        }
      }
    }

    return { adjacency, nodeCount: n, adjacencySource: 'actual-search' };
  }

  // Fallback: circular approximation when no stored vectors available
  console.warn(
    '[HnswHealthMonitor] No stored vectors provided — using approximate circular adjacency. ' +
    'Pass stored vectors for accurate health metrics.'
  );

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      const neighbor = (i + j + 1) % n;
      if (!adjacency[i].includes(neighbor)) {
        adjacency[i].push(neighbor);
      }
      if (!adjacency[neighbor].includes(i)) {
        adjacency[neighbor].push(i);
      }
    }
  }

  return { adjacency, nodeCount: n, adjacencySource: 'approximate' };
}

// ============================================================================
// HnswHealthMonitor
// ============================================================================

/**
 * HNSW Health Monitor
 *
 * Monitors the spectral health of HNSW indexes by computing graph-theoretic
 * metrics. Uses ruvector-coherence for native computation when available,
 * falling back to TypeScript approximations.
 *
 * Health checks are designed to be lightweight enough for periodic use
 * without blocking search operations.
 *
 * @example
 * ```typescript
 * const monitor = new HnswHealthMonitor();
 * const report = monitor.checkHealth(hnswIndex);
 * if (!report.healthy) {
 *   console.warn('HNSW index unhealthy:', report.alerts);
 * }
 * ```
 */
export class HnswHealthMonitor {
  private readonly config: HnswHealthMonitorConfig;
  private readonly alerts: HealthAlert[] = [];
  private readonly history: HealthMetricPoint[] = [];
  private lastReport: HnswHealthReport | null = null;
  private useNative: boolean = false;
  private nativeChecked: boolean = false;

  constructor(config?: Partial<HnswHealthMonitorConfig>) {
    this.config = { ...DEFAULT_HNSW_HEALTH_CONFIG, ...config };
  }

  /**
   * Perform a health check on an HNSW index.
   *
   * Computes spectral metrics and generates alerts if thresholds are
   * exceeded. Results are recorded in the metrics history.
   *
   * @param index - The HNSW index to check
   * @returns Health report with metrics and alerts
   */
  checkHealth(index: IHnswIndexProvider): HnswHealthReport {
    const start = performance.now();
    const indexSize = index.size();

    // Too small for meaningful spectral analysis
    if (indexSize < this.config.minIndexSize) {
      return this.createSmallIndexReport(indexSize, performance.now() - start);
    }

    // Try native backend on first call
    if (!this.nativeChecked) {
      this.nativeChecked = true;
      this.useNative = loadNativeCoherence() !== null;
    }

    // Build adjacency from index
    const { adjacency, nodeCount, adjacencySource } = buildAdjacencyFromIndex(index);

    // Compute spectral metrics
    const metrics = this.useNative
      ? this.computeNativeMetrics(adjacency)
      : this.computeApproximateMetrics(adjacency, nodeCount);

    // Generate alerts
    const newAlerts = this.generateAlerts(metrics);

    // Update persistent alerts list
    this.alerts.length = 0;
    this.alerts.push(...newAlerts);

    const elapsed = performance.now() - start;

    const report: HnswHealthReport = {
      healthy: newAlerts.length === 0,
      metrics,
      alerts: newAlerts,
      indexSize,
      usedNativeBackend: this.useNative,
      adjacencySource,
      checkDurationMs: elapsed,
      checkedAt: new Date(),
    };

    // Record in history
    this.addHistoryPoint({
      coherenceScore: metrics.coherenceScore,
      fiedlerValue: metrics.fiedlerValue,
      indexSize,
      healthy: report.healthy,
      timestamp: report.checkedAt,
    });

    this.lastReport = report;
    return report;
  }

  /**
   * Get current active alerts.
   *
   * @returns Array of active health alerts
   */
  getAlerts(): HealthAlert[] {
    return [...this.alerts];
  }

  /**
   * Get health metrics history.
   *
   * @param limit - Maximum entries to return (most recent)
   * @returns Array of metric points, most recent last
   */
  getMetricsHistory(limit?: number): HealthMetricPoint[] {
    const entries = [...this.history];
    if (limit !== undefined && limit < entries.length) {
      return entries.slice(-limit);
    }
    return entries;
  }

  /**
   * Check whether the index is currently healthy (no alerts).
   *
   * If no health check has been performed yet, returns true (optimistic).
   *
   * @returns true if the last health check found no alerts
   */
  isHealthy(): boolean {
    if (this.lastReport === null) return true;
    return this.lastReport.healthy;
  }

  /**
   * Get the last health report, or null if no check has been performed.
   */
  getLastReport(): HnswHealthReport | null {
    return this.lastReport;
  }

  /**
   * Clear all history and alerts.
   */
  clearHistory(): void {
    this.history.length = 0;
    this.alerts.length = 0;
    this.lastReport = null;
  }

  // ==========================================================================
  // Private: Metric Computation
  // ==========================================================================

  /**
   * Compute metrics using the native ruvector-coherence module.
   */
  private computeNativeMetrics(adjacency: number[][]): SpectralMetrics {
    const native = nativeCoherence!;
    const fiedlerValue = native.computeFiedlerValue(adjacency);
    const spectralGap = native.computeSpectralGap(adjacency);
    const effectiveResistance = native.computeEffectiveResistance(adjacency);
    const coherenceScore = computeCoherenceScore(
      fiedlerValue,
      spectralGap,
      effectiveResistance
    );

    return { fiedlerValue, spectralGap, effectiveResistance, coherenceScore };
  }

  /**
   * Compute metrics using TypeScript approximations.
   */
  private computeApproximateMetrics(
    adjacency: number[][],
    n: number
  ): SpectralMetrics {
    const fiedlerValue = approximateFiedlerValue(
      adjacency,
      n,
      this.config.maxPowerIterations,
      this.config.convergenceTolerance
    );

    const spectralGap = approximateSpectralGap(
      adjacency,
      n,
      this.config.maxPowerIterations,
      this.config.convergenceTolerance
    );

    const effectiveResistance = estimateEffectiveResistance(
      adjacency,
      n,
      this.config.resistanceSampleSize,
      fiedlerValue
    );

    const coherenceScore = computeCoherenceScore(
      fiedlerValue,
      spectralGap,
      effectiveResistance
    );

    return { fiedlerValue, spectralGap, effectiveResistance, coherenceScore };
  }

  // ==========================================================================
  // Private: Alert Generation
  // ==========================================================================

  /**
   * Generate alerts based on metric thresholds.
   */
  private generateAlerts(metrics: SpectralMetrics): HealthAlert[] {
    const alerts: HealthAlert[] = [];
    const now = new Date();

    if (metrics.fiedlerValue < this.config.fiedlerThreshold) {
      alerts.push({
        type: 'FragileIndex',
        message:
          `Fiedler value ${metrics.fiedlerValue.toFixed(6)} is below ` +
          `threshold ${this.config.fiedlerThreshold}. ` +
          `The index graph has weak algebraic connectivity.`,
        value: metrics.fiedlerValue,
        threshold: this.config.fiedlerThreshold,
        timestamp: now,
      });
    }

    if (metrics.spectralGap < this.config.spectralGapThreshold) {
      alerts.push({
        type: 'PoorExpansion',
        message:
          `Spectral gap ${metrics.spectralGap.toFixed(6)} is below ` +
          `threshold ${this.config.spectralGapThreshold}. ` +
          `The index graph has poor expansion properties.`,
        value: metrics.spectralGap,
        threshold: this.config.spectralGapThreshold,
        timestamp: now,
      });
    }

    if (metrics.effectiveResistance > this.config.resistanceThreshold) {
      alerts.push({
        type: 'HighResistance',
        message:
          `Average effective resistance ${metrics.effectiveResistance.toFixed(4)} ` +
          `exceeds threshold ${this.config.resistanceThreshold}. ` +
          `Nodes are poorly connected.`,
        value: metrics.effectiveResistance,
        threshold: this.config.resistanceThreshold,
        timestamp: now,
      });
    }

    if (metrics.coherenceScore < this.config.coherenceThreshold) {
      alerts.push({
        type: 'LowCoherence',
        message:
          `Coherence score ${metrics.coherenceScore.toFixed(4)} is below ` +
          `threshold ${this.config.coherenceThreshold}. ` +
          `Overall index health is degraded.`,
        value: metrics.coherenceScore,
        threshold: this.config.coherenceThreshold,
        timestamp: now,
      });
    }

    return alerts;
  }

  // ==========================================================================
  // Private: Helpers
  // ==========================================================================

  /**
   * Create a report for indexes too small for spectral analysis.
   */
  private createSmallIndexReport(
    indexSize: number,
    durationMs: number
  ): HnswHealthReport {
    const metrics: SpectralMetrics = {
      fiedlerValue: indexSize > 0 ? 1.0 : 0,
      spectralGap: indexSize > 0 ? 1.0 : 0,
      effectiveResistance: indexSize > 0 ? 0.5 : 0,
      coherenceScore: indexSize > 0 ? 1.0 : 0,
    };

    const report: HnswHealthReport = {
      healthy: true,
      metrics,
      alerts: [],
      indexSize,
      usedNativeBackend: false,
      adjacencySource: 'approximate',
      checkDurationMs: durationMs,
      checkedAt: new Date(),
    };

    this.addHistoryPoint({
      coherenceScore: metrics.coherenceScore,
      fiedlerValue: metrics.fiedlerValue,
      indexSize,
      healthy: true,
      timestamp: report.checkedAt,
    });

    this.lastReport = report;
    return report;
  }

  /**
   * Add a history point, trimming if over limit.
   */
  private addHistoryPoint(point: HealthMetricPoint): void {
    this.history.push(point);
    if (this.history.length > this.config.maxHistoryEntries) {
      this.history.splice(
        0,
        this.history.length - this.config.maxHistoryEntries
      );
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an HnswHealthMonitor instance.
 *
 * @param config - Optional configuration overrides
 * @returns A new HnswHealthMonitor
 */
export function createHnswHealthMonitor(
  config?: Partial<HnswHealthMonitorConfig>
): HnswHealthMonitor {
  return new HnswHealthMonitor(config);
}
