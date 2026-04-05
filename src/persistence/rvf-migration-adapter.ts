/**
 * RVF Migration Adapter (ADR-072)
 *
 * Extends RvfDualWriter concepts to all persistence operations (KV, Q-values,
 * GOAP state). Routes reads and writes based on the rvfMigrationStage config:
 *
 *   Stage 0: SQLite only (legacy)
 *   Stage 1: Hybrid (current — vectors in RVF, metadata in SQLite)
 *   Stage 2: Dual-write, read from SQLite (both engines receive writes)
 *   Stage 3: Dual-write, read from RVF (both engines receive writes)
 *   Stage 4: RVF primary, SQLite escape hatch
 *
 * Each stage is reversible by changing the config — no data is lost.
 *
 * @module persistence/rvf-migration-adapter
 */

import type { RvfStore, RvfStatus } from '../integrations/ruvector/rvf-dual-writer.js';

// ============================================================================
// Types
// ============================================================================

export type MigrationStage = 0 | 1 | 2 | 3 | 4;

export const STAGE_NAMES: Record<MigrationStage, string> = {
  0: 'sqlite-only',
  1: 'hybrid',
  2: 'dual-write-sqlite-primary',
  3: 'dual-write-rvf-primary',
  4: 'rvf-primary',
};

export interface MigrationAdapterConfig {
  /** Current migration stage */
  stage: MigrationStage;
  /** Path to RVF container */
  rvfPath: string;
  /** Vector dimensions (default: 384) */
  dimensions: number;
  /** Enable fallback on RVF read failure in stage 3+ */
  enableFallback: boolean;
}

export interface WriteResult {
  sqliteSuccess: boolean;
  rvfSuccess: boolean;
  stage: MigrationStage;
  fallbackUsed: boolean;
}

export interface ReadResult<T> {
  data: T | null;
  source: 'sqlite' | 'rvf' | 'fallback';
  latencyMs: number;
  stage: MigrationStage;
}

export interface MigrationMetrics {
  stage: MigrationStage;
  stageName: string;
  totalWrites: number;
  totalReads: number;
  rvfWriteFailures: number;
  rvfReadFailures: number;
  fallbacksUsed: number;
  sqliteReadLatencyAvgMs: number;
  rvfReadLatencyAvgMs: number;
  sqliteWriteLatencyAvgMs: number;
  rvfWriteLatencyAvgMs: number;
}

// ============================================================================
// SQLite minimal interface
// ============================================================================

interface SqliteDb {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

// ============================================================================
// RvfMigrationAdapter
// ============================================================================

export class RvfMigrationAdapter {
  private config: MigrationAdapterConfig;
  private db: SqliteDb | null = null;
  private rvfStore: RvfStore | null = null;

  // Metrics tracking
  private totalWrites = 0;
  private totalReads = 0;
  private rvfWriteFailures = 0;
  private rvfReadFailures = 0;
  private fallbacksUsed = 0;
  private sqliteLatencies: number[] = [];
  private rvfLatencies: number[] = [];
  private sqliteWriteLatencies: number[] = [];
  private rvfWriteLatencies: number[] = [];

  constructor(config: Partial<MigrationAdapterConfig> & { stage: MigrationStage }) {
    this.config = {
      rvfPath: '.agentic-qe/patterns.rvf',
      dimensions: 384,
      enableFallback: true,
      ...config,
    };
  }

  /** Attach a SQLite database handle */
  setSqliteDb(db: SqliteDb): void {
    this.db = db;
  }

  /** Attach an RVF store */
  setRvfStore(store: RvfStore): void {
    this.rvfStore = store;
  }

  /** Get current migration stage */
  get stage(): MigrationStage {
    return this.config.stage;
  }

  /** Update migration stage (called by coordinator on promotion) */
  setStage(stage: MigrationStage): void {
    this.config = { ...this.config, stage };
  }

  // --------------------------------------------------------------------------
  // Write Operations
  // --------------------------------------------------------------------------

  /**
   * Write a vector to the appropriate store(s) based on migration stage.
   *
   * Stage 0-1: SQLite only (vectors as BLOBs or hybrid)
   * Stage 2-3: Both engines receive writes
   * Stage 4:   RVF only, SQLite escape hatch on failure
   */
  write(id: string, vector: Float32Array | number[]): WriteResult {
    this.totalWrites++;
    const result: WriteResult = {
      sqliteSuccess: false,
      rvfSuccess: false,
      stage: this.config.stage,
      fallbackUsed: false,
    };

    const shouldWriteSqlite = this.config.stage < 4;
    const shouldWriteRvf = this.config.stage >= 2;

    // Write to SQLite
    if (shouldWriteSqlite && this.db) {
      const start = performance.now();
      try {
        const blob = Buffer.from(
          vector instanceof Float32Array ? vector.buffer : new Float32Array(vector).buffer,
        );
        this.db.prepare(`
          INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension, model, created_at)
          VALUES (?, ?, ?, 'all-MiniLM-L6-v2', datetime('now'))
          ON CONFLICT(pattern_id) DO UPDATE SET
            embedding = excluded.embedding, dimension = excluded.dimension, created_at = datetime('now')
        `).run(id, blob, vector.length);
        result.sqliteSuccess = true;
        this.sqliteWriteLatencies.push(performance.now() - start);
      } catch (err) {
        result.sqliteSuccess = false;
        if (process.env.AQE_DEBUG_MIGRATION) {
          console.warn('[RVF-Migration] SQLite write failed:', (err as Error).message);
        }
      }
    }

    // Write to RVF
    if (shouldWriteRvf && this.rvfStore) {
      const start = performance.now();
      try {
        this.rvfStore.ingest([{ id, vector }]);
        result.rvfSuccess = true;
        this.rvfWriteLatencies.push(performance.now() - start);
      } catch {
        this.rvfWriteFailures++;
        result.rvfSuccess = false;
      }
    }

    // Stage 4: If RVF write failed, fall back to SQLite
    if (this.config.stage === 4 && !result.rvfSuccess && this.config.enableFallback && this.db) {
      try {
        const blob = Buffer.from(
          vector instanceof Float32Array ? vector.buffer : new Float32Array(vector).buffer,
        );
        this.db.prepare(`
          INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension, model, created_at)
          VALUES (?, ?, ?, 'all-MiniLM-L6-v2', datetime('now'))
          ON CONFLICT(pattern_id) DO UPDATE SET
            embedding = excluded.embedding, dimension = excluded.dimension, created_at = datetime('now')
        `).run(id, blob, vector.length);
        result.sqliteSuccess = true;
        result.fallbackUsed = true;
        this.fallbacksUsed++;
      } catch {
        // Both engines failed
      }
    }

    return result;
  }

  /**
   * Delete a vector from the appropriate store(s).
   */
  delete(id: string): WriteResult {
    this.totalWrites++;
    const result: WriteResult = {
      sqliteSuccess: false,
      rvfSuccess: false,
      stage: this.config.stage,
      fallbackUsed: false,
    };

    if (this.config.stage < 4 && this.db) {
      try {
        this.db.prepare('DELETE FROM qe_pattern_embeddings WHERE pattern_id = ?').run(id);
        result.sqliteSuccess = true;
      } catch { /* best effort */ }
    }

    if (this.config.stage >= 2 && this.rvfStore) {
      try {
        this.rvfStore.delete([id]);
        result.rvfSuccess = true;
      } catch {
        this.rvfWriteFailures++;
      }
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Read Operations
  // --------------------------------------------------------------------------

  /**
   * Search for similar vectors, routing to the appropriate engine.
   *
   * Stage 0-2: Read from SQLite
   * Stage 3-4: Read from RVF, fallback to SQLite on error
   */
  search(query: Float32Array | number[], k: number): ReadResult<Array<{ id: string; score: number }>> {
    this.totalReads++;
    const useRvf = this.config.stage >= 3;

    if (useRvf && this.rvfStore) {
      const start = performance.now();
      try {
        const results = this.rvfStore.search(query, k);
        const latency = performance.now() - start;
        this.rvfLatencies.push(latency);
        return { data: results, source: 'rvf', latencyMs: latency, stage: this.config.stage };
      } catch {
        this.rvfReadFailures++;
        // Fall through to SQLite if fallback enabled
        if (!this.config.enableFallback) {
          return { data: null, source: 'rvf', latencyMs: 0, stage: this.config.stage };
        }
        this.fallbacksUsed++;
      }
    }

    // SQLite read (stages 0-2 or fallback)
    const start = performance.now();
    const results = this.searchSqlite(query, k);
    const latency = performance.now() - start;
    this.sqliteLatencies.push(latency);

    return {
      data: results,
      source: useRvf ? 'fallback' : 'sqlite',
      latencyMs: latency,
      stage: this.config.stage,
    };
  }

  // --------------------------------------------------------------------------
  // Status & Metrics
  // --------------------------------------------------------------------------

  /** Get combined status from both engines */
  status(): { sqlite: { vectorCount: number }; rvf: RvfStatus | null; stage: MigrationStage } {
    let sqliteCount = 0;
    if (this.db) {
      try {
        const row = this.db.prepare(
          'SELECT COUNT(*) as cnt FROM qe_pattern_embeddings',
        ).get() as { cnt: number } | undefined;
        sqliteCount = row?.cnt ?? 0;
      } catch { /* table may not exist */ }
    }

    let rvfStatus: RvfStatus | null = null;
    if (this.rvfStore) {
      try { rvfStatus = this.rvfStore.status(); } catch { /* best effort */ }
    }

    return { sqlite: { vectorCount: sqliteCount }, rvf: rvfStatus, stage: this.config.stage };
  }

  /** Get aggregated migration metrics */
  getMetrics(): MigrationMetrics {
    return {
      stage: this.config.stage,
      stageName: STAGE_NAMES[this.config.stage],
      totalWrites: this.totalWrites,
      totalReads: this.totalReads,
      rvfWriteFailures: this.rvfWriteFailures,
      rvfReadFailures: this.rvfReadFailures,
      fallbacksUsed: this.fallbacksUsed,
      sqliteReadLatencyAvgMs: avg(this.sqliteLatencies),
      rvfReadLatencyAvgMs: avg(this.rvfLatencies),
      sqliteWriteLatencyAvgMs: avg(this.sqliteWriteLatencies),
      rvfWriteLatencyAvgMs: avg(this.rvfWriteLatencies),
    };
  }

  /** Reset metrics counters */
  resetMetrics(): void {
    this.totalWrites = 0;
    this.totalReads = 0;
    this.rvfWriteFailures = 0;
    this.rvfReadFailures = 0;
    this.fallbacksUsed = 0;
    this.sqliteLatencies = [];
    this.rvfLatencies = [];
    this.sqliteWriteLatencies = [];
    this.rvfWriteLatencies = [];
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private searchSqlite(
    query: Float32Array | number[],
    k: number,
  ): Array<{ id: string; score: number }> {
    if (!this.db) return [];

    let rows: Array<{ pattern_id: string; embedding: Buffer; dimension: number }>;
    try {
      rows = this.db.prepare(
        'SELECT pattern_id, embedding, dimension FROM qe_pattern_embeddings',
      ).all() as typeof rows;
    } catch {
      return [];
    }

    const queryArr = query instanceof Float32Array ? Array.from(query) : query;
    const queryMag = Math.sqrt(queryArr.reduce((s, v) => s + v * v, 0));
    if (queryMag === 0) return [];

    const scored: Array<{ id: string; score: number }> = [];
    for (const row of rows) {
      if (row.dimension !== queryArr.length) continue;
      const stored = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.dimension);
      let dot = 0, storedMag = 0;
      for (let i = 0; i < row.dimension; i++) {
        dot += queryArr[i] * stored[i];
        storedMag += stored[i] * stored[i];
      }
      storedMag = Math.sqrt(storedMag);
      if (storedMag === 0) continue;
      scored.push({ id: row.pattern_id, score: dot / (queryMag * storedMag) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
