/**
 * RVF Dual-Writer Service
 *
 * Phase 3 Task 3.1: Writes learning data to both SQLite (existing) and
 * an RVF container (new native backend). Ensures SQLite writes are never
 * broken by RVF failures, and supports gradual promotion from SQLite-only
 * to dual-write to RVF-primary mode.
 *
 * The dual-writer sits between the QEReasoningBank and the storage layer,
 * intercepting pattern embedding writes/deletes/searches and routing them
 * to one or both backends depending on the configured mode.
 */

import type {
  RvfNativeAdapter,
  RvfStatus as NativeRvfStatus,
} from './rvf-native-adapter.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Simplified RVF store interface used internally by the dual-writer.
 * Abstracts over the native adapter so tests can provide mocks
 * without depending on the @ruvector/rvf-node native binding.
 */
export interface RvfStore {
  ingest(entries: Array<{ id: string; vector: number[] | Float32Array }>): void;
  search(query: number[] | Float32Array, k: number): Array<{ id: string; score: number }>;
  delete(ids: string[]): void;
  status(): RvfStatus;
  close(): void;
}

export interface RvfStatus {
  totalVectors: number;
  dimensions?: number;
  /** Fields from the native adapter, forwarded when available */
  totalSegments?: number;
  fileSizeBytes?: number;
  epoch?: number;
  witnessValid?: boolean;
  witnessEntries?: number;
}

export interface DualWriteConfig {
  /** Path to the RVF container file */
  rvfPath: string;
  /** Vector dimensions (default 384) */
  dimensions?: number;
  /** Write mode */
  mode: 'dual-write' | 'rvf-primary' | 'sqlite-only';
  /** Whether to verify witness chain on startup */
  verifyOnStartup?: boolean;
}

export interface DualWriteResult {
  sqliteSuccess: boolean;
  rvfSuccess: boolean;
  divergence?: string;
}

export interface DivergenceReport {
  totalChecked: number;
  divergences: number;
  details: Array<{
    patternId: string;
    issue: 'missing-in-rvf' | 'missing-in-sqlite' | 'count-mismatch';
  }>;
}

// ============================================================================
// SQLite helpers
// ============================================================================

/**
 * Minimal typed interface for the better-sqlite3 Database used here.
 * We accept `any` in the constructor to avoid coupling to better-sqlite3 types,
 * but internally we type the operations we actually call.
 */
interface SqliteDb {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  exec(sql: string): void;
}

/**
 * Wraps the real RvfNativeAdapter to conform to the simpler RvfStore interface.
 */
function wrapNativeAdapter(adapter: RvfNativeAdapter, dim: number): RvfStore {
  return {
    ingest(entries) {
      adapter.ingest(entries);
    },
    search(query, k) {
      return adapter.search(query, k).map((r) => ({ id: r.id, score: r.score }));
    },
    delete(ids) {
      adapter.delete(ids);
    },
    status(): RvfStatus {
      const s: NativeRvfStatus = adapter.status();
      return {
        totalVectors: s.totalVectors,
        dimensions: dim,
        totalSegments: s.totalSegments,
        fileSizeBytes: s.fileSizeBytes,
        epoch: s.epoch,
        witnessValid: s.witnessValid,
        witnessEntries: s.witnessEntries,
      };
    },
    close() {
      adapter.close();
    },
  };
}

function tableExists(db: SqliteDb, name: string): boolean {
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name) as { cnt: number } | undefined;
  return (row?.cnt ?? 0) > 0;
}

// ============================================================================
// RvfDualWriter
// ============================================================================

export class RvfDualWriter {
  private readonly db: SqliteDb;
  private readonly config: Required<Pick<DualWriteConfig, 'rvfPath' | 'dimensions' | 'mode'>> & DualWriteConfig;
  private rvfStore: RvfStore | null = null;
  private rvfAvailable = false;

  constructor(db: unknown, config: DualWriteConfig) {
    this.db = db as SqliteDb;
    this.config = {
      ...config,
      dimensions: config.dimensions ?? 384,
    };
  }

  /**
   * Initialize the RVF store (create or open).
   *
   * If the native adapter is not available, the writer degrades gracefully
   * to sqlite-only regardless of the configured mode.
   */
  async initialize(): Promise<void> {
    if (this.config.mode === 'sqlite-only') {
      this.rvfAvailable = false;
      return;
    }

    try {
      // Dynamic import so the module is optional
      const adapter = await import('./rvf-native-adapter.js');

      if (!adapter.isRvfNativeAvailable()) {
        this.rvfAvailable = false;
        return;
      }

      // Try open first, create if it fails
      let nativeAdapter: RvfNativeAdapter;
      try {
        nativeAdapter = adapter.openRvfStore(this.config.rvfPath);
      } catch {
        nativeAdapter = adapter.createRvfStore(this.config.rvfPath, this.config.dimensions);
      }

      this.rvfStore = wrapNativeAdapter(nativeAdapter, this.config.dimensions);
      this.rvfAvailable = true;
    } catch {
      // Native adapter module not available at all
      this.rvfAvailable = false;
    }
  }

  /**
   * Allow injecting an RVF store directly (useful for testing).
   */
  setRvfStore(store: RvfStore): void {
    this.rvfStore = store;
    this.rvfAvailable = true;
  }

  // --------------------------------------------------------------------------
  // Write
  // --------------------------------------------------------------------------

  /**
   * Write a pattern embedding to both stores.
   *
   * SQLite is always written first. RVF failures never propagate to SQLite.
   */
  writePattern(patternId: string, embedding: number[] | Float32Array): DualWriteResult {
    const result: DualWriteResult = {
      sqliteSuccess: false,
      rvfSuccess: false,
    };

    // 1. Always write to SQLite qe_pattern_embeddings
    try {
      this.writeSqliteEmbedding(patternId, embedding);
      result.sqliteSuccess = true;
    } catch {
      result.sqliteSuccess = false;
    }

    // 2. Write to RVF if mode requires it and adapter is available
    if (this.shouldWriteRvf()) {
      try {
        this.rvfStore!.ingest([{
          id: patternId,
          vector: embedding instanceof Float32Array ? Array.from(embedding) : embedding,
        }]);
        result.rvfSuccess = true;
      } catch {
        result.rvfSuccess = false;
        result.divergence = 'rvf-write-failed';
      }
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Delete
  // --------------------------------------------------------------------------

  /**
   * Delete a pattern embedding from both stores.
   */
  deletePattern(patternId: string): DualWriteResult {
    const result: DualWriteResult = {
      sqliteSuccess: false,
      rvfSuccess: false,
    };

    // 1. Always delete from SQLite
    try {
      this.deleteSqliteEmbedding(patternId);
      result.sqliteSuccess = true;
    } catch {
      result.sqliteSuccess = false;
    }

    // 2. Delete from RVF if applicable
    if (this.shouldWriteRvf()) {
      try {
        this.rvfStore!.delete([patternId]);
        result.rvfSuccess = true;
      } catch {
        result.rvfSuccess = false;
        result.divergence = 'rvf-delete-failed';
      }
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  /**
   * Search for similar vectors. In rvf-primary mode, tries RVF first and
   * falls back to SQLite on error. Otherwise uses SQLite.
   */
  search(query: number[] | Float32Array, k: number): Array<{ id: string; score: number }> {
    if (this.config.mode === 'rvf-primary' && this.rvfAvailable && this.rvfStore) {
      try {
        return this.rvfStore.search(query, k);
      } catch {
        // Fall back to SQLite
      }
    }

    // SQLite-based search (brute-force cosine similarity)
    return this.searchSqlite(query, k);
  }

  // --------------------------------------------------------------------------
  // Divergence
  // --------------------------------------------------------------------------

  /**
   * Generate a divergence report between SQLite embeddings and RVF vectors.
   */
  getDivergenceReport(): DivergenceReport {
    const report: DivergenceReport = {
      totalChecked: 0,
      divergences: 0,
      details: [],
    };

    // Get SQLite embedding count
    const sqliteCount = this.getSqliteEmbeddingCount();
    report.totalChecked = sqliteCount;

    if (!this.rvfAvailable || !this.rvfStore) {
      // If RVF is not available, every SQLite embedding is "missing in RVF"
      if (this.config.mode !== 'sqlite-only' && sqliteCount > 0) {
        report.divergences = 1;
        report.details.push({
          patternId: '*',
          issue: 'count-mismatch',
        });
      }
      return report;
    }

    // Get RVF vector count
    const rvfStatus = this.rvfStore.status();
    const rvfCount = rvfStatus.totalVectors;

    if (sqliteCount !== rvfCount) {
      report.divergences = 1;
      report.details.push({
        patternId: '*',
        issue: 'count-mismatch',
      });
    }

    return report;
  }

  /**
   * Returns true when promotion from dual-write to rvf-primary is safe
   * (zero divergences between the two stores).
   */
  isPromotionSafe(): boolean {
    const report = this.getDivergenceReport();
    return report.divergences === 0;
  }

  // --------------------------------------------------------------------------
  // Status
  // --------------------------------------------------------------------------

  /**
   * Combined status from both backends.
   */
  status(): {
    sqlite: { patternCount: number; vectorCount: number };
    rvf: RvfStatus | null;
    mode: string;
  } {
    const sqlitePatternCount = this.getSqlitePatternCount();
    const sqliteVectorCount = this.getSqliteEmbeddingCount();

    let rvfStatus: RvfStatus | null = null;
    if (this.rvfAvailable && this.rvfStore) {
      try {
        rvfStatus = this.rvfStore.status();
      } catch {
        rvfStatus = null;
      }
    }

    return {
      sqlite: {
        patternCount: sqlitePatternCount,
        vectorCount: sqliteVectorCount,
      },
      rvf: rvfStatus,
      mode: this.config.mode,
    };
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Close the RVF store. SQLite is managed externally.
   */
  close(): void {
    if (this.rvfStore) {
      try {
        this.rvfStore.close();
      } catch {
        // Ignore close errors
      }
      this.rvfStore = null;
      this.rvfAvailable = false;
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private shouldWriteRvf(): boolean {
    return (
      (this.config.mode === 'dual-write' || this.config.mode === 'rvf-primary') &&
      this.rvfAvailable &&
      this.rvfStore !== null
    );
  }

  private writeSqliteEmbedding(patternId: string, embedding: number[] | Float32Array): void {
    const blob = Buffer.from(
      embedding instanceof Float32Array
        ? embedding.buffer
        : new Float32Array(embedding).buffer
    );
    const dimension = embedding.length;

    // Upsert into qe_pattern_embeddings
    if (tableExists(this.db, 'qe_pattern_embeddings')) {
      this.db.prepare(`
        INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension, model, created_at)
        VALUES (?, ?, ?, 'all-MiniLM-L6-v2', datetime('now'))
        ON CONFLICT(pattern_id) DO UPDATE SET
          embedding = excluded.embedding,
          dimension = excluded.dimension,
          created_at = datetime('now')
      `).run(patternId, blob, dimension);
    }
  }

  private deleteSqliteEmbedding(patternId: string): void {
    if (tableExists(this.db, 'qe_pattern_embeddings')) {
      this.db.prepare('DELETE FROM qe_pattern_embeddings WHERE pattern_id = ?').run(patternId);
    }
  }

  private getSqliteEmbeddingCount(): number {
    if (!tableExists(this.db, 'qe_pattern_embeddings')) return 0;
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM qe_pattern_embeddings').get() as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }

  private getSqlitePatternCount(): number {
    if (!tableExists(this.db, 'qe_patterns')) return 0;
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }

  /**
   * Brute-force cosine similarity search over SQLite embeddings.
   * This is the fallback when RVF is unavailable.
   */
  private searchSqlite(query: number[] | Float32Array, k: number): Array<{ id: string; score: number }> {
    if (!tableExists(this.db, 'qe_pattern_embeddings')) return [];

    const rows = this.db.prepare(
      'SELECT pattern_id, embedding, dimension FROM qe_pattern_embeddings'
    ).all() as Array<{ pattern_id: string; embedding: Buffer; dimension: number }>;

    const queryArr = query instanceof Float32Array ? Array.from(query) : query;
    const queryMag = Math.sqrt(queryArr.reduce((s, v) => s + v * v, 0));
    if (queryMag === 0) return [];

    const scored: Array<{ id: string; score: number }> = [];

    for (const row of rows) {
      const float32 = new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        row.dimension
      );
      const vec = Array.from(float32);

      let dot = 0;
      let mag = 0;
      for (let i = 0; i < vec.length && i < queryArr.length; i++) {
        dot += vec[i] * queryArr[i];
        mag += vec[i] * vec[i];
      }
      mag = Math.sqrt(mag);

      const score = mag > 0 ? dot / (queryMag * mag) : 0;
      scored.push({ id: row.pattern_id, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new RvfDualWriter instance.
 *
 * @param db - better-sqlite3 Database instance
 * @param config - Dual-write configuration
 */
export function createDualWriter(db: unknown, config: DualWriteConfig): RvfDualWriter {
  return new RvfDualWriter(db, config);
}
