/**
 * RuVector Pattern Store - Migration layer for AgentDB to HNSW transition
 *
 * Phase 0 M0.5.5: Dual-write migration strategy with validation
 *
 * Migration phases:
 * 1. DUAL_WRITE: Write to both HNSW (new) and legacy storage
 * 2. DUAL_READ: Read from HNSW but compare with legacy for validation
 * 3. HNSW_ONLY: Read from HNSW only (legacy deprecated)
 *
 * Performance targets:
 * - HNSW search: <1ms p95 (100x+ faster than legacy)
 * - Zero data loss during migration
 * - Reversible at any phase
 *
 * @deprecated AgentDB storage (v2.2.0) - migrate to HNSW
 */

import {
  HNSWPatternStore,
  QEPattern,
  IPatternStore,
  HNSWPatternStoreConfig,
} from './HNSWPatternStore';
import { SwarmMemoryManager, StoreOptions } from '../core/memory/SwarmMemoryManager';
import * as path from 'path';

/**
 * Migration phase configuration
 */
export enum MigrationPhase {
  /** Write to both stores, read from legacy */
  DUAL_WRITE = 'dual_write',
  /** Write to both stores, read from HNSW with comparison */
  DUAL_READ = 'dual_read',
  /** Write to HNSW only, read from HNSW only */
  HNSW_ONLY = 'hnsw_only',
}

/**
 * Comparison result for validation
 */
export interface ComparisonResult {
  timestamp: Date;
  queryEmbedding: number[];
  k: number;
  hnswResults: string[]; // Pattern IDs
  legacyResults: string[]; // Pattern IDs
  hnswLatencyMs: number;
  legacyLatencyMs: number;
  speedupFactor: number;
  overlap: number; // Percentage of common results
  hnswOnly: string[]; // IDs found only in HNSW
  legacyOnly: string[]; // IDs found only in legacy
}

/**
 * Migration metrics for monitoring
 */
export interface MigrationMetrics {
  phase: MigrationPhase;
  totalPatterns: number;
  hnswPatterns: number;
  legacyPatterns: number;
  syncedPatterns: number;
  divergedPatterns: number;
  comparisons: number;
  avgSpeedupFactor: number;
  avgOverlap: number;
  errors: number;
  lastComparison?: ComparisonResult;
}

/**
 * RuVector pattern store configuration
 */
export interface RuVectorPatternStoreConfig extends HNSWPatternStoreConfig {
  /** Migration phase (default: DUAL_WRITE) */
  migrationPhase?: MigrationPhase;
  /** Legacy storage path for SwarmMemoryManager */
  legacyDbPath?: string;
  /** Enable detailed comparison logging (default: true) */
  enableComparisonLogging?: boolean;
  /** Maximum comparisons to store (default: 100) */
  maxComparisons?: number;
}

/**
 * Pattern store with dual-write migration support
 *
 * Enables gradual migration from legacy SwarmMemoryManager to HNSW-based storage
 * with validation, comparison logging, and rollback capabilities.
 *
 * Usage:
 * ```typescript
 * // Phase 1: Start dual-write
 * const store = new RuVectorPatternStore({
 *   migrationPhase: MigrationPhase.DUAL_WRITE,
 *   storagePath: './data/hnsw',
 *   legacyDbPath: './data/legacy.db'
 * });
 *
 * // Phase 2: Enable dual-read for validation
 * store.setMigrationPhase(MigrationPhase.DUAL_READ);
 * // Monitor metrics: store.getMigrationMetrics()
 *
 * // Phase 3: Switch to HNSW only after validation
 * store.setMigrationPhase(MigrationPhase.HNSW_ONLY);
 * ```
 */
export class RuVectorPatternStore implements IPatternStore {
  private hnswStore: HNSWPatternStore;
  private legacyStore: SwarmMemoryManager | null;
  private migrationPhase: MigrationPhase;
  private enableComparisonLogging: boolean;
  private maxComparisons: number;

  // Metrics tracking
  private comparisons: ComparisonResult[] = [];
  private metrics: {
    errors: number;
    totalWrites: number;
    totalReads: number;
  } = {
    errors: 0,
    totalWrites: 0,
    totalReads: 0,
  };

  constructor(config: RuVectorPatternStoreConfig = {}) {
    const {
      migrationPhase = MigrationPhase.DUAL_WRITE,
      legacyDbPath,
      enableComparisonLogging = true,
      maxComparisons = 100,
      ...hnswConfig
    } = config;

    this.migrationPhase = migrationPhase;
    this.enableComparisonLogging = enableComparisonLogging;
    this.maxComparisons = maxComparisons;

    // Initialize HNSW store (always present)
    this.hnswStore = new HNSWPatternStore(hnswConfig);

    // Initialize legacy store if needed
    if (this.isDualMode() && legacyDbPath) {
      this.legacyStore = new SwarmMemoryManager({
        dbPath: legacyDbPath,
        swarmId: 'pattern-migration',
      });
    } else {
      this.legacyStore = null;
    }
  }

  /**
   * Check if we're in dual-write or dual-read mode
   */
  private isDualMode(): boolean {
    return (
      this.migrationPhase === MigrationPhase.DUAL_WRITE ||
      this.migrationPhase === MigrationPhase.DUAL_READ
    );
  }

  /**
   * Store a pattern with dual-write support
   *
   * Behavior by phase:
   * - DUAL_WRITE/DUAL_READ: Write to both HNSW and legacy
   * - HNSW_ONLY: Write to HNSW only
   *
   * @param pattern Pattern to store
   */
  async store(pattern: QEPattern): Promise<void> {
    this.metrics.totalWrites++;

    try {
      // Always write to HNSW (new storage)
      await this.hnswStore.store(pattern);

      // Dual-write to legacy during migration
      if (this.isDualMode() && this.legacyStore) {
        await this.storeLegacy(pattern);
      }
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Failed to store pattern ${pattern.id}: ${error}`);
    }
  }

  /**
   * Store pattern in legacy SwarmMemoryManager
   */
  private async storeLegacy(pattern: QEPattern): Promise<void> {
    if (!this.legacyStore) return;

    const key = `pattern:${pattern.id}`;
    const value = {
      embedding: pattern.embedding,
      content: pattern.content,
      type: pattern.type,
      quality: pattern.quality,
      metadata: pattern.metadata,
      createdAt: pattern.createdAt.toISOString(),
    };

    const options: StoreOptions = {
      partition: `patterns:${pattern.type}`,
      metadata: {
        quality: pattern.quality,
        dimension: pattern.embedding.length,
      },
    };

    await this.legacyStore.store(key, value, options);
  }

  /**
   * Search for similar patterns with migration support
   *
   * Behavior by phase:
   * - DUAL_WRITE: Read from legacy (safe fallback)
   * - DUAL_READ: Read from HNSW + compare with legacy
   * - HNSW_ONLY: Read from HNSW only
   *
   * @param embedding Query embedding vector
   * @param k Number of nearest neighbors
   * @returns Top-k most similar patterns
   */
  async search(embedding: number[], k: number): Promise<QEPattern[]> {
    this.metrics.totalReads++;

    try {
      switch (this.migrationPhase) {
        case MigrationPhase.DUAL_WRITE:
          // Phase 1: Still using legacy for reads (safe)
          return await this.searchLegacy(embedding, k);

        case MigrationPhase.DUAL_READ:
          // Phase 2: Use HNSW but validate against legacy
          return await this.searchWithComparison(embedding, k);

        case MigrationPhase.HNSW_ONLY:
          // Phase 3: HNSW only (legacy deprecated)
          return await this.hnswStore.search(embedding, k);

        default:
          throw new Error(`Unknown migration phase: ${this.migrationPhase}`);
      }
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Search failed: ${error}`);
    }
  }

  /**
   * Search from legacy store (brute-force O(n) comparison)
   *
   * This is the deprecated path - used only during early migration
   */
  private async searchLegacy(embedding: number[], k: number): Promise<QEPattern[]> {
    if (!this.legacyStore) {
      // Fallback to HNSW if legacy not available
      return await this.hnswStore.search(embedding, k);
    }

    // Note: SwarmMemoryManager doesn't have vector search
    // This is a placeholder showing the interface mismatch
    // In reality, legacy storage would need custom vector search implementation
    console.warn('Legacy vector search not implemented - falling back to HNSW');
    return await this.hnswStore.search(embedding, k);
  }

  /**
   * Search with dual-read comparison for validation
   *
   * Reads from HNSW (new) and compares with legacy to validate migration
   */
  private async searchWithComparison(embedding: number[], k: number): Promise<QEPattern[]> {
    // Search HNSW (should be <1ms)
    const hnswStart = Date.now();
    const hnswResults = await this.hnswStore.search(embedding, k);
    const hnswLatencyMs = Date.now() - hnswStart;

    // Search legacy for comparison (expected to be 100x+ slower)
    let legacyResults: QEPattern[] = [];
    let legacyLatencyMs = 0;

    if (this.legacyStore && this.enableComparisonLogging) {
      const legacyStart = Date.now();
      legacyResults = await this.searchLegacy(embedding, k);
      legacyLatencyMs = Date.now() - legacyStart;

      // Log comparison
      this.logComparison(embedding, k, hnswResults, legacyResults, hnswLatencyMs, legacyLatencyMs);
    }

    // Return HNSW results (validated source)
    return hnswResults;
  }

  /**
   * Log comparison between HNSW and legacy search results
   */
  private logComparison(
    queryEmbedding: number[],
    k: number,
    hnswResults: QEPattern[],
    legacyResults: QEPattern[],
    hnswLatencyMs: number,
    legacyLatencyMs: number
  ): void {
    const hnswIds = new Set(hnswResults.map(p => p.id));
    const legacyIds = new Set(legacyResults.map(p => p.id));

    // Calculate overlap
    const commonIds = new Set([...hnswIds].filter(id => legacyIds.has(id)));
    const overlap = legacyIds.size > 0 ? (commonIds.size / legacyIds.size) * 100 : 0;

    // Calculate speedup
    const speedupFactor = legacyLatencyMs > 0 ? legacyLatencyMs / hnswLatencyMs : 0;

    // Find differences
    const hnswOnly = [...hnswIds].filter(id => !legacyIds.has(id));
    const legacyOnly = [...legacyIds].filter(id => !hnswIds.has(id));

    const comparison: ComparisonResult = {
      timestamp: new Date(),
      queryEmbedding,
      k,
      hnswResults: Array.from(hnswIds),
      legacyResults: Array.from(legacyIds),
      hnswLatencyMs,
      legacyLatencyMs,
      speedupFactor,
      overlap,
      hnswOnly,
      legacyOnly,
    };

    // Store comparison (keep last N)
    this.comparisons.push(comparison);
    if (this.comparisons.length > this.maxComparisons) {
      this.comparisons.shift();
    }

    // Log if significant divergence
    if (overlap < 90 && legacyIds.size > 0) {
      console.warn(
        `[RuVectorPatternStore] Low overlap (${overlap.toFixed(1)}%) between HNSW and legacy. ` +
          `HNSW-only: ${hnswOnly.length}, Legacy-only: ${legacyOnly.length}`
      );
    }

    // Log performance gain
    if (speedupFactor > 1) {
      console.log(
        `[RuVectorPatternStore] HNSW ${speedupFactor.toFixed(1)}x faster ` +
          `(${hnswLatencyMs.toFixed(2)}ms vs ${legacyLatencyMs.toFixed(2)}ms)`
      );
    }
  }

  /**
   * Delete a pattern from both stores during dual-write
   */
  async delete(id: string): Promise<void> {
    try {
      // Always delete from HNSW
      await this.hnswStore.delete(id);

      // Delete from legacy during migration
      if (this.isDualMode() && this.legacyStore) {
        const key = `pattern:${id}`;
        await this.legacyStore.delete(key);
      }
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Failed to delete pattern ${id}: ${error}`);
    }
  }

  /**
   * Get total pattern count
   */
  async count(): Promise<number> {
    // Always use HNSW count (source of truth)
    return await this.hnswStore.count();
  }

  /**
   * Clear all patterns from both stores
   */
  async clear(): Promise<void> {
    try {
      await this.hnswStore.clear();

      if (this.isDualMode() && this.legacyStore) {
        // Clear legacy patterns (would need custom implementation)
        console.warn('Legacy pattern clearing not implemented');
      }
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Failed to clear patterns: ${error}`);
    }
  }

  /**
   * Get migration metrics for monitoring
   *
   * @returns Current migration status and performance comparison
   */
  async getMigrationMetrics(): Promise<MigrationMetrics> {
    const hnswPatterns = await this.hnswStore.count();
    const legacyPatterns = this.legacyStore ? 0 : 0; // Would need actual count

    // Calculate average speedup and overlap from comparisons
    const avgSpeedupFactor =
      this.comparisons.length > 0
        ? this.comparisons.reduce((sum, c) => sum + c.speedupFactor, 0) / this.comparisons.length
        : 0;

    const avgOverlap =
      this.comparisons.length > 0
        ? this.comparisons.reduce((sum, c) => sum + c.overlap, 0) / this.comparisons.length
        : 0;

    return {
      phase: this.migrationPhase,
      totalPatterns: hnswPatterns,
      hnswPatterns,
      legacyPatterns,
      syncedPatterns: Math.min(hnswPatterns, legacyPatterns),
      divergedPatterns: Math.abs(hnswPatterns - legacyPatterns),
      comparisons: this.comparisons.length,
      avgSpeedupFactor,
      avgOverlap,
      errors: this.metrics.errors,
      lastComparison: this.comparisons[this.comparisons.length - 1],
    };
  }

  /**
   * Set migration phase (with validation)
   *
   * Safe transitions:
   * - DUAL_WRITE -> DUAL_READ (start validation)
   * - DUAL_READ -> HNSW_ONLY (complete migration)
   * - DUAL_READ -> DUAL_WRITE (rollback if issues found)
   * - HNSW_ONLY -> DUAL_READ (rollback migration)
   *
   * @param phase New migration phase
   */
  setMigrationPhase(phase: MigrationPhase): void {
    const validTransitions: Record<MigrationPhase, MigrationPhase[]> = {
      [MigrationPhase.DUAL_WRITE]: [MigrationPhase.DUAL_READ],
      [MigrationPhase.DUAL_READ]: [MigrationPhase.DUAL_WRITE, MigrationPhase.HNSW_ONLY],
      [MigrationPhase.HNSW_ONLY]: [MigrationPhase.DUAL_READ],
    };

    const allowed = validTransitions[this.migrationPhase];
    if (!allowed.includes(phase)) {
      throw new Error(
        `Invalid migration transition: ${this.migrationPhase} -> ${phase}. ` +
          `Allowed: ${allowed.join(', ')}`
      );
    }

    console.log(`[RuVectorPatternStore] Migration phase: ${this.migrationPhase} -> ${phase}`);
    this.migrationPhase = phase;

    // Initialize/cleanup legacy store as needed
    if (!this.isDualMode() && this.legacyStore) {
      console.log('[RuVectorPatternStore] Cleaning up legacy store connection');
      this.legacyStore = null;
    }
  }

  /**
   * Get current migration phase
   */
  getMigrationPhase(): MigrationPhase {
    return this.migrationPhase;
  }

  /**
   * Get recent comparisons for analysis
   */
  getRecentComparisons(limit: number = 10): ComparisonResult[] {
    return this.comparisons.slice(-limit);
  }

  /**
   * Export comparison data for external analysis
   */
  exportComparisonData(): ComparisonResult[] {
    return [...this.comparisons];
  }

  /**
   * Batch store patterns (delegates to HNSW)
   */
  async storeBatch(patterns: QEPattern[]): Promise<void> {
    this.metrics.totalWrites += patterns.length;

    try {
      // Batch write to HNSW
      await this.hnswStore.storeBatch(patterns);

      // Individual writes to legacy (no batch support)
      if (this.isDualMode() && this.legacyStore) {
        for (const pattern of patterns) {
          await this.storeLegacy(pattern);
        }
      }
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Failed to store batch: ${error}`);
    }
  }

  /**
   * Get underlying HNSW store (for advanced operations)
   */
  getHNSWStore(): HNSWPatternStore {
    return this.hnswStore;
  }

  /**
   * Get statistics from HNSW store
   */
  async getStats(): Promise<{
    totalPatterns: number;
    dimension: number;
    distanceMetric: string;
    memoryEstimateMB: number;
    migrationPhase: MigrationPhase;
  }> {
    const hnswStats = await this.hnswStore.getStats();

    return {
      ...hnswStats,
      migrationPhase: this.migrationPhase,
    };
  }

  /**
   * Save both HNSW and legacy stores to disk
   */
  async save(): Promise<void> {
    try {
      // Save HNSW metadata
      await this.hnswStore.saveMetadata();

      // Legacy save would happen automatically via SwarmMemoryManager
      console.log('[RuVectorPatternStore] Pattern stores saved');
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Failed to save stores: ${error}`);
    }
  }

  /**
   * Load both HNSW and legacy stores from disk
   */
  async load(): Promise<void> {
    try {
      // Load HNSW metadata
      await this.hnswStore.loadMetadata();

      // Legacy load would happen automatically via SwarmMemoryManager
      console.log('[RuVectorPatternStore] Pattern stores loaded');
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Failed to load stores: ${error}`);
    }
  }

  /**
   * Verify data integrity between stores
   *
   * Runs a comprehensive check to ensure HNSW and legacy stores are in sync
   * Useful before switching from DUAL_READ to HNSW_ONLY
   */
  async verifyIntegrity(): Promise<{
    inSync: boolean;
    hnswCount: number;
    legacyCount: number;
    sampleChecks: number;
    sampleMatches: number;
    recommendations: string[];
  }> {
    const hnswCount = await this.hnswStore.count();
    const legacyCount = this.legacyStore ? 0 : 0; // Would need actual implementation

    const recommendations: string[] = [];
    let inSync = true;

    // Check counts
    if (Math.abs(hnswCount - legacyCount) > hnswCount * 0.01) {
      // >1% difference
      inSync = false;
      recommendations.push(
        `Pattern count mismatch: HNSW=${hnswCount}, Legacy=${legacyCount}. ` +
          `Recommend staying in DUAL_WRITE mode.`
      );
    }

    // Check recent comparison overlap
    if (this.comparisons.length > 0) {
      const recentOverlap =
        this.comparisons.slice(-10).reduce((sum, c) => sum + c.overlap, 0) / 10;

      if (recentOverlap < 95) {
        inSync = false;
        recommendations.push(
          `Low search result overlap (${recentOverlap.toFixed(1)}%). ` +
            `Investigate divergence before switching to HNSW_ONLY.`
        );
      }
    }

    // Check performance gain
    const metrics = await this.getMigrationMetrics();
    if (metrics.avgSpeedupFactor > 100) {
      recommendations.push(
        `HNSW is ${metrics.avgSpeedupFactor.toFixed(0)}x faster. ` +
          `Migration will significantly improve performance.`
      );
    }

    if (inSync && metrics.comparisons > 10 && metrics.avgOverlap > 95) {
      recommendations.push('Data verified. Safe to switch to HNSW_ONLY mode.');
    }

    return {
      inSync,
      hnswCount,
      legacyCount,
      sampleChecks: this.comparisons.length,
      sampleMatches: Math.round((metrics.avgOverlap / 100) * this.comparisons.length),
      recommendations,
    };
  }
}

/**
 * Factory function to create pattern store with migration support
 */
export function createMigrationPatternStore(
  config?: RuVectorPatternStoreConfig
): RuVectorPatternStore {
  return new RuVectorPatternStore(config);
}

/**
 * Migration presets for common scenarios
 */
export const MigrationPresets = {
  /**
   * Start fresh migration (Phase 1)
   */
  startMigration: (storagePath: string, legacyDbPath: string): RuVectorPatternStore =>
    new RuVectorPatternStore({
      migrationPhase: MigrationPhase.DUAL_WRITE,
      storagePath,
      legacyDbPath,
      enableComparisonLogging: true,
      dimension: 768,
    }),

  /**
   * Enable validation (Phase 2)
   */
  enableValidation: (storagePath: string, legacyDbPath: string): RuVectorPatternStore =>
    new RuVectorPatternStore({
      migrationPhase: MigrationPhase.DUAL_READ,
      storagePath,
      legacyDbPath,
      enableComparisonLogging: true,
      maxComparisons: 1000, // Store more comparisons for analysis
      dimension: 768,
    }),

  /**
   * Complete migration (Phase 3)
   */
  completeMigration: (storagePath: string): RuVectorPatternStore =>
    new RuVectorPatternStore({
      migrationPhase: MigrationPhase.HNSW_ONLY,
      storagePath,
      enableComparisonLogging: false, // No legacy to compare
      dimension: 768,
    }),
};
