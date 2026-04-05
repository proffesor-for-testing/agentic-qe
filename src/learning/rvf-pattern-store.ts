/**
 * RVF-Backed Pattern Store (ADR-066)
 *
 * Implements IPatternStore using @ruvector/rvf-node for persistent HNSW
 * vector indexing. Eliminates cold-start index rebuild (SQLite BLOB →
 * in-memory HNSW) by storing vectors in the RVF native format with
 * progressive 3-layer indexing.
 *
 * Pattern metadata remains in SQLite (via the existing SQLitePatternStore);
 * only vector storage and search moves to RVF.
 *
 * @module learning/rvf-pattern-store
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../shared/types/index.js';
import { ok, err } from '../shared/types/index.js';
import { toErrorMessage } from '../shared/error-utils.js';
import type {
  RvfNativeAdapter,
  RvfSearchResult,
} from '../integrations/ruvector/rvf-native-adapter.js';
import {
  type QEPattern,
  type QEPatternTemplate,
  type QEPatternType,
  type QEDomain,
  type CreateQEPatternOptions,
  calculateQualityScore,
  validateQEPattern,
  mapQEDomainToAQE,
  PROMOTION_THRESHOLD,
} from './qe-patterns.js';
import type {
  IPatternStore,
  PatternStoreConfig,
  PatternStoreStats,
  PatternSearchOptions,
  PatternSearchResult,
} from './pattern-store.js';
import { DEFAULT_PATTERN_STORE_CONFIG } from './pattern-store.js';

// ============================================================================
// RVF Pattern Store Configuration
// ============================================================================

export interface RvfPatternStoreConfig {
  /** Path to the .rvf file for vector storage */
  rvfPath: string;
  /** Base PatternStore config (for metadata, thresholds) */
  base: PatternStoreConfig;
}

// ============================================================================
// RVF Pattern Store Implementation
// ============================================================================

/**
 * Pattern store backed by @ruvector/rvf-node for persistent HNSW.
 *
 * Vectors live in a .rvf file (persistent HNSW, no cold-start rebuild).
 * Metadata (pattern fields, FTS5) lives in SQLite via sqliteStore delegate.
 */
export class RvfPatternStore implements IPatternStore {
  private readonly config: PatternStoreConfig;
  private readonly rvfPath: string;
  private adapter: RvfNativeAdapter | null = null;
  private sqliteStore: import('./sqlite-persistence.js').SQLitePatternStore | null = null;
  private initialized = false;
  private rvfInitError: string | null = null;
  private searchOps = 0;
  private totalSearchMs = 0;

  constructor(
    private readonly createAdapter: (path: string, dim: number) => RvfNativeAdapter,
    config?: Partial<RvfPatternStoreConfig>,
  ) {
    this.config = config?.base ?? DEFAULT_PATTERN_STORE_CONFIG;
    this.rvfPath = config?.rvfPath ?? '.agentic-qe/patterns.rvf';
  }

  /**
   * Attach SQLite persistence for metadata (pattern fields, FTS5).
   * Must be called before initialize() if SQLite metadata is desired.
   */
  setSqliteStore(store: import('./sqlite-persistence.js').SQLitePatternStore): void {
    this.sqliteStore = store;
  }

  /** Get the underlying RVF adapter (for COW branching, migration, etc.) */
  getAdapter(): RvfNativeAdapter | null {
    return this.adapter;
  }

  // --------------------------------------------------------------------------
  // IPatternStore — Lifecycle
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.adapter = this.createAdapter(
        this.rvfPath,
        this.config.embeddingDimension,
      );
      this.initialized = true;
      console.log(
        `[RvfPatternStore] Initialized: ${this.rvfPath} (dim=${this.config.embeddingDimension})`,
      );
    } catch (error) {
      // Do NOT silently swallow — the user chose useRVFPatternStore=true,
      // so they need to know RVF is not working. Log a clear error, set
      // adapter to null, and mark nativeAvailable=false in stats.
      this.rvfInitError = toErrorMessage(error);
      console.error(
        `[RvfPatternStore] ERROR: RVF native init failed — vector search is DISABLED. ` +
        `Cause: ${this.rvfInitError}. ` +
        `Fix: install @ruvector/rvf-node native bindings, or set useRVFPatternStore=false to use SQLite HNSW.`,
      );
      this.adapter = null;
      this.initialized = true; // mark initialized to prevent retry loops
    }
  }

  async dispose(): Promise<void> {
    if (this.adapter) {
      try {
        this.adapter.close();
      } catch { /* best effort */ }
      this.adapter = null;
    }
    this.initialized = false;
  }

  // --------------------------------------------------------------------------
  // IPatternStore — Write operations
  // --------------------------------------------------------------------------

  async store(pattern: QEPattern): Promise<Result<string>> {
    await this.ensureInitialized();

    const validation = validateQEPattern(pattern);
    if (!validation.valid) {
      return err(new Error(`Invalid pattern: ${validation.errors.join(', ')}`));
    }

    if (pattern.confidence < this.config.minConfidence) {
      return err(
        new Error(
          `Pattern confidence ${pattern.confidence} below threshold ${this.config.minConfidence}`,
        ),
      );
    }

    // Persist metadata to SQLite
    if (this.sqliteStore) {
      try {
        this.sqliteStore.storePattern(pattern, pattern.embedding);
      } catch (error) {
        console.warn(
          `[RvfPatternStore] SQLite persist failed for ${pattern.id}:`,
          toErrorMessage(error),
        );
      }
    }

    // Ingest vector into RVF
    if (pattern.embedding && this.adapter) {
      try {
        const vec = pattern.embedding instanceof Float32Array
          ? pattern.embedding
          : new Float32Array(pattern.embedding);
        this.adapter.ingest([{ id: pattern.id, vector: vec }]);
      } catch (error) {
        console.warn(
          `[RvfPatternStore] RVF ingest failed for ${pattern.id}:`,
          toErrorMessage(error),
        );
      }
    }

    return ok(pattern.id);
  }

  async create(options: CreateQEPatternOptions): Promise<Result<QEPattern>> {
    const confidence = options.confidence ?? 0.5;
    const qeDomain = options.qeDomain ?? 'test-generation';
    const pattern: QEPattern = {
      id: uuidv4(),
      patternType: options.patternType,
      qeDomain,
      domain: mapQEDomainToAQE(qeDomain),
      name: options.name,
      description: options.description,
      confidence,
      usageCount: 0,
      successRate: 0,
      qualityScore: calculateQualityScore({ confidence, usageCount: 0, successRate: 0 }),
      context: { tags: [], ...options.context },
      template: { example: '', ...options.template } as QEPatternTemplate,
      embedding: options.embedding,
      tier: 'short-term',
      createdAt: new Date(),
      lastUsedAt: new Date(),
      successfulUses: 0,
      reusable: false,
      reuseCount: 0,
      averageTokenSavings: 0,
    };

    const result = await this.store(pattern);
    if (!result.success) {
      return err(result.error);
    }
    return ok(pattern);
  }

  // --------------------------------------------------------------------------
  // IPatternStore — Read operations
  // --------------------------------------------------------------------------

  async get(id: string): Promise<QEPattern | null> {
    if (this.sqliteStore) {
      try {
        return this.sqliteStore.getPattern(id) ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }

  async search(
    query: string | number[],
    options: PatternSearchOptions = {},
  ): Promise<Result<PatternSearchResult[]>> {
    await this.ensureInitialized();

    const startTime = performance.now();
    const limit = options.limit ?? 10;
    const results: PatternSearchResult[] = [];

    // Vector search via RVF native HNSW
    if (Array.isArray(query) && this.adapter) {
      try {
        const queryVec = query instanceof Float32Array
          ? query
          : new Float32Array(query);
        const rvfResults = this.adapter.search(queryVec, limit * 2);

        for (const hit of rvfResults) {
          const pattern = await this.get(hit.id);
          if (pattern && this.matchesFilters(pattern, options)) {
            const reuseInfo = this.calculateReuseInfo(pattern, hit.score);
            results.push({
              pattern,
              score: hit.score,
              matchType: 'vector',
              similarity: hit.score,
              canReuse: reuseInfo.canReuse,
              estimatedTokenSavings: reuseInfo.estimatedTokenSavings,
              reuseConfidence: reuseInfo.reuseConfidence,
            });
          }
        }
      } catch (error) {
        console.warn('[RvfPatternStore] RVF search failed:', toErrorMessage(error));
      }
    }

    // FTS5 text search fallback via SQLite
    if (typeof query === 'string' && query.trim() && this.sqliteStore) {
      try {
        const ftsResults = this.sqliteStore.searchFTS(query, limit * 2);
        const existingIds = new Set(results.map(r => r.pattern.id));

        for (const ftsResult of ftsResults) {
          if (existingIds.has(ftsResult.id)) continue;
          const pattern = await this.get(ftsResult.id);
          if (pattern && this.matchesFilters(pattern, options)) {
            const reuseInfo = this.calculateReuseInfo(pattern, ftsResult.ftsScore);
            results.push({
              pattern,
              score: 0.5 * ftsResult.ftsScore,
              matchType: 'exact',
              similarity: ftsResult.ftsScore,
              canReuse: reuseInfo.canReuse,
              estimatedTokenSavings: reuseInfo.estimatedTokenSavings,
              reuseConfidence: reuseInfo.reuseConfidence,
            });
          }
        }
      } catch { /* FTS5 unavailable */ }
    }

    // Sort by score descending, apply limit
    results.sort((a, b) => b.score - a.score);

    const elapsed = performance.now() - startTime;
    this.searchOps++;
    this.totalSearchMs += elapsed;

    return ok(results.slice(0, limit));
  }

  // --------------------------------------------------------------------------
  // IPatternStore — Mutation operations
  // --------------------------------------------------------------------------

  async recordUsage(id: string, success: boolean): Promise<Result<void>> {
    if (!this.sqliteStore) {
      return err(new Error('No SQLite store attached'));
    }
    try {
      this.sqliteStore.recordUsage(id, success);
      return ok(undefined);
    } catch (error) {
      return err(new Error(`recordUsage failed: ${toErrorMessage(error)}`));
    }
  }

  async promote(id: string): Promise<Result<void>> {
    if (!this.sqliteStore) {
      return err(new Error('No SQLite store attached'));
    }
    try {
      this.sqliteStore.promotePattern(id);
      return ok(undefined);
    } catch (error) {
      return err(new Error(`promote failed: ${toErrorMessage(error)}`));
    }
  }

  async delete(id: string): Promise<Result<void>> {
    // Delete from RVF
    if (this.adapter) {
      try {
        this.adapter.delete([id]);
      } catch (error) {
        console.warn(`[RvfPatternStore] RVF delete failed for ${id}:`, toErrorMessage(error));
      }
    }

    // Delete from SQLite
    if (this.sqliteStore) {
      try {
        this.sqliteStore.deletePattern(id);
      } catch (error) {
        return err(new Error(`SQLite delete failed: ${toErrorMessage(error)}`));
      }
    }

    return ok(undefined);
  }

  async getStats(): Promise<PatternStoreStats> {
    const rvfStatus = this.adapter?.status();

    // Get metadata stats from SQLite if available
    const totalPatterns = rvfStatus?.totalVectors ?? 0;

    return {
      totalPatterns,
      byTier: { shortTerm: 0, longTerm: 0 },
      byDomain: {} as Record<QEDomain, number>,
      byType: {} as Record<QEPatternType, number>,
      avgConfidence: 0,
      avgQualityScore: 0,
      avgSuccessRate: 0,
      searchOperations: this.searchOps,
      avgSearchLatencyMs: this.searchOps > 0
        ? this.totalSearchMs / this.searchOps
        : 0,
      hnswStats: {
        nativeAvailable: this.adapter !== null,
        vectorCount: rvfStatus?.totalVectors ?? 0,
        indexSizeBytes: rvfStatus?.fileSizeBytes ?? 0,
        ...(this.rvfInitError ? { rvfInitError: this.rvfInitError } : {}),
      },
    };
  }

  async cleanup(): Promise<{ removed: number; promoted: number }> {
    if (!this.sqliteStore) {
      return { removed: 0, promoted: 0 };
    }

    let removed = 0;
    let promoted = 0;

    try {
      // Scan patterns and remove low-quality, promote high-quality
      const patterns = this.sqliteStore.getPatterns({ limit: 10000 });
      for (const pattern of patterns) {
        if (pattern.confidence < this.config.minConfidence && pattern.usageCount > 3) {
          await this.delete(pattern.id);
          removed++;
        } else if (
          pattern.tier === 'short-term'
          && pattern.successfulUses >= PROMOTION_THRESHOLD
        ) {
          await this.promote(pattern.id);
          promoted++;
        }
      }
    } catch (error) {
      console.warn('[RvfPatternStore] Cleanup error:', toErrorMessage(error));
    }

    return { removed, promoted };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private matchesFilters(pattern: QEPattern, options: PatternSearchOptions): boolean {
    if (options.patternType && pattern.patternType !== options.patternType) return false;
    if (options.domain && pattern.qeDomain !== options.domain) return false;
    if (options.tier && pattern.tier !== options.tier) return false;
    if (options.minConfidence && pattern.confidence < options.minConfidence) return false;
    if (options.minQualityScore && pattern.qualityScore < options.minQualityScore) return false;
    return true;
  }

  private calculateReuseInfo(
    pattern: QEPattern,
    similarity: number,
  ): { canReuse: boolean; estimatedTokenSavings: number; reuseConfidence: number } {
    const reuseCfg = this.config.reuseOptimization;
    const canReuse = reuseCfg.enabled
      && similarity >= reuseCfg.minSimilarityForReuse
      && pattern.successRate >= reuseCfg.minSuccessRateForReuse;

    return {
      canReuse,
      estimatedTokenSavings: canReuse ? 500 : 0,
      reuseConfidence: canReuse ? similarity * pattern.successRate : 0,
    };
  }
}
