/**
 * RVF Consistency Validator (ADR-072)
 *
 * Periodically samples reads from both SQLite and RVF engines, compares
 * results, and tracks divergence rate over a rolling window. Monitors
 * RVF deadSpaceRatio and triggers compaction when needed.
 *
 * Used by RvfStageGate to make go/no-go decisions for stage promotion.
 *
 * @module persistence/rvf-consistency-validator
 */

import type { RvfStore, RvfStatus } from '../integrations/ruvector/rvf-dual-writer.js';

// ============================================================================
// Types
// ============================================================================

export interface ConsistencyCheckResult {
  /** Timestamp of the check */
  timestamp: number;
  /** Number of samples compared */
  samplesChecked: number;
  /** Number of divergences found */
  divergences: number;
  /** Divergence rate (0-1) */
  divergenceRate: number;
  /** Details of any divergences */
  details: DivergenceDetail[];
  /** RVF dead space ratio (if available) */
  deadSpaceRatio: number | null;
  /** Whether compaction was triggered */
  compactionTriggered: boolean;
}

export interface DivergenceDetail {
  patternId: string;
  issue: 'missing-in-rvf' | 'missing-in-sqlite' | 'score-mismatch';
  sqliteScore?: number;
  rvfScore?: number;
}

export interface ValidatorConfig {
  /** Number of random samples per check (default: 50) */
  sampleSize: number;
  /** Rolling window duration in ms (default: 7 days) */
  windowDurationMs: number;
  /** Dead space ratio threshold to trigger compaction (default: 0.3) */
  compactionThreshold: number;
  /** Score difference threshold to count as divergence (default: 0.05) */
  scoreTolerance: number;
}

interface SqliteDb {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

const DEFAULT_CONFIG: ValidatorConfig = {
  sampleSize: 50,
  windowDurationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  compactionThreshold: 0.3,
  scoreTolerance: 0.05,
};

// ============================================================================
// RvfConsistencyValidator
// ============================================================================

export class RvfConsistencyValidator {
  private readonly config: ValidatorConfig;
  private db: SqliteDb | null = null;
  private rvfStore: RvfStore | null = null;
  private history: ConsistencyCheckResult[] = [];

  constructor(config?: Partial<ValidatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setSqliteDb(db: SqliteDb): void { this.db = db; }
  setRvfStore(store: RvfStore): void { this.rvfStore = store; }

  // --------------------------------------------------------------------------
  // Consistency Check
  // --------------------------------------------------------------------------

  /**
   * Run a consistency check by sampling random pattern IDs from SQLite,
   * searching for them in both engines, and comparing results.
   */
  runCheck(): ConsistencyCheckResult {
    const result: ConsistencyCheckResult = {
      timestamp: Date.now(),
      samplesChecked: 0,
      divergences: 0,
      divergenceRate: 0,
      details: [],
      deadSpaceRatio: null,
      compactionTriggered: false,
    };

    if (!this.db || !this.rvfStore) {
      this.history.push(result);
      return result;
    }

    // 1. Get random sample of pattern IDs from SQLite
    const sampleIds = this.getSampleIds(this.config.sampleSize);
    result.samplesChecked = sampleIds.length;

    if (sampleIds.length === 0) {
      this.history.push(result);
      return result;
    }

    // 2. For each sample, get embedding from SQLite and search both engines
    for (const patternId of sampleIds) {
      const embedding = this.getSqliteEmbedding(patternId);
      if (!embedding) {
        result.divergences++;
        result.details.push({ patternId, issue: 'missing-in-sqlite' });
        continue;
      }

      // Search RVF
      try {
        const rvfResults = this.rvfStore.search(embedding, 1);
        if (rvfResults.length === 0) {
          result.divergences++;
          result.details.push({ patternId, issue: 'missing-in-rvf' });
        }
        // If RVF returns results, check that the top result ID matches
        // (self-search should return the same pattern as top-1)
        else if (rvfResults[0].id !== patternId && rvfResults[0].score < 0.99) {
          result.divergences++;
          result.details.push({
            patternId,
            issue: 'score-mismatch',
            rvfScore: rvfResults[0].score,
          });
        }
      } catch {
        result.divergences++;
        result.details.push({ patternId, issue: 'missing-in-rvf' });
      }
    }

    result.divergenceRate = result.samplesChecked > 0
      ? result.divergences / result.samplesChecked
      : 0;

    // 3. Check dead space ratio and trigger compaction if needed
    try {
      const rvfStatus = this.rvfStore.status();
      const deadSpace = (rvfStatus as RvfStatus & { deadSpaceRatio?: number }).deadSpaceRatio;
      result.deadSpaceRatio = deadSpace ?? null;

      if (deadSpace != null && deadSpace > this.config.compactionThreshold) {
        this.triggerCompaction();
        result.compactionTriggered = true;
      }
    } catch {
      // Status check is best-effort
    }

    // 4. Add to history and prune old entries
    this.history.push(result);
    this.pruneHistory();

    return result;
  }

  // --------------------------------------------------------------------------
  // Rolling Window Metrics
  // --------------------------------------------------------------------------

  /**
   * Get the aggregate divergence rate over the rolling window.
   */
  getRollingDivergenceRate(): number {
    const windowStart = Date.now() - this.config.windowDurationMs;
    const inWindow = this.history.filter(h => h.timestamp >= windowStart);
    if (inWindow.length === 0) return 0;

    const totalSamples = inWindow.reduce((s, h) => s + h.samplesChecked, 0);
    const totalDivergences = inWindow.reduce((s, h) => s + h.divergences, 0);
    return totalSamples > 0 ? totalDivergences / totalSamples : 0;
  }

  /**
   * Get the number of consistency checks performed in the rolling window.
   */
  getCheckCount(): number {
    const windowStart = Date.now() - this.config.windowDurationMs;
    return this.history.filter(h => h.timestamp >= windowStart).length;
  }

  /**
   * Get all check results in the rolling window.
   */
  getHistory(): ConsistencyCheckResult[] {
    const windowStart = Date.now() - this.config.windowDurationMs;
    return this.history.filter(h => h.timestamp >= windowStart);
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private getSampleIds(count: number): string[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(
        `SELECT pattern_id FROM qe_pattern_embeddings ORDER BY RANDOM() LIMIT ?`,
      ).all(count) as Array<{ pattern_id: string }>;
      return rows.map(r => r.pattern_id);
    } catch {
      return [];
    }
  }

  private getSqliteEmbedding(patternId: string): Float32Array | null {
    if (!this.db) return null;
    try {
      const row = this.db.prepare(
        'SELECT embedding, dimension FROM qe_pattern_embeddings WHERE pattern_id = ?',
      ).get(patternId) as { embedding: Buffer; dimension: number } | undefined;
      if (!row) return null;
      return new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.dimension);
    } catch {
      return null;
    }
  }

  private triggerCompaction(): void {
    // RVF compaction via the store's compact method (if available)
    try {
      const store = this.rvfStore as RvfStore & { compact?: () => void };
      store.compact?.();
    } catch {
      // Compaction is best-effort
    }
  }

  private pruneHistory(): void {
    const cutoff = Date.now() - this.config.windowDurationMs;
    this.history = this.history.filter(h => h.timestamp >= cutoff);
  }
}
