/**
 * SQLite Storage Backend for Embedding Cache
 *
 * Persistent local storage with efficient binary embedding storage.
 * Best for single-server deployments requiring persistence.
 *
 * @module code-intelligence/embeddings/backends/SQLiteBackend
 * @see Issue #146 - Security Hardening: SP-2 Dedicated Embedding Cache
 */

import Database from 'better-sqlite3';
import type { EmbeddingCacheEntry } from '../types.js';
import type {
  EmbeddingStorageBackend,
  SQLiteBackendConfig,
  BackendStats,
} from './types.js';
import { DEFAULT_TTL_MS, BYTES_PER_ENTRY } from './types.js';

/**
 * Default SQLite configuration
 */
const DEFAULT_SQLITE_CONFIG: Partial<SQLiteBackendConfig> = {
  tableName: 'embedding_cache',
  walMode: true,
  busyTimeoutMs: 5000,
  vacuumOnClose: false,
};

/**
 * SQLite-based embedding storage backend
 *
 * Features:
 * - Persistent storage across restarts
 * - Efficient binary BLOB storage for embeddings
 * - WAL mode for concurrent access
 * - Indexed timestamp for fast TTL queries
 */
export class SQLiteStorageBackend implements EmbeddingStorageBackend {
  readonly name = 'sqlite';
  readonly type = 'sqlite' as const;

  private db: Database.Database | null = null;
  private config: Required<SQLiteBackendConfig>;
  private initialized: boolean = false;

  // Prepared statements for performance
  private stmtGet: Database.Statement | null = null;
  private stmtSet: Database.Statement | null = null;
  private stmtHas: Database.Statement | null = null;
  private stmtDelete: Database.Statement | null = null;
  private stmtSize: Database.Statement | null = null;
  private stmtPrune: Database.Statement | null = null;

  constructor(config: SQLiteBackendConfig) {
    this.config = {
      dbPath: config.dbPath,
      tableName: config.tableName ?? DEFAULT_SQLITE_CONFIG.tableName!,
      walMode: config.walMode ?? DEFAULT_SQLITE_CONFIG.walMode!,
      busyTimeoutMs: config.busyTimeoutMs ?? DEFAULT_SQLITE_CONFIG.busyTimeoutMs!,
      vacuumOnClose: config.vacuumOnClose ?? DEFAULT_SQLITE_CONFIG.vacuumOnClose!,
      maxSize: config.maxSize ?? 0,
      defaultTtlMs: config.defaultTtlMs ?? DEFAULT_TTL_MS,
      debug: config.debug ?? false,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.db = new Database(this.config.dbPath);

      // Configure database
      this.db.pragma(`busy_timeout = ${this.config.busyTimeoutMs}`);

      if (this.config.walMode) {
        this.db.pragma('journal_mode = WAL');
      }

      // Create table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
          key TEXT PRIMARY KEY,
          embedding BLOB NOT NULL,
          model TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE INDEX IF NOT EXISTS idx_${this.config.tableName}_timestamp
          ON ${this.config.tableName}(timestamp);
      `);

      // Prepare statements
      this.prepareStatements();

      this.initialized = true;
      this.log('SQLite backend initialized');
    } catch (error) {
      throw new Error(`Failed to initialize SQLite backend: ${(error as Error).message}`);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      if (this.config.vacuumOnClose) {
        this.db.exec('VACUUM');
      }
      this.db.close();
      this.db = null;
    }

    // Clear prepared statements
    this.stmtGet = null;
    this.stmtSet = null;
    this.stmtHas = null;
    this.stmtDelete = null;
    this.stmtSize = null;
    this.stmtPrune = null;

    this.initialized = false;
    this.log('SQLite backend closed');
  }

  async isHealthy(): Promise<boolean> {
    if (!this.db || !this.initialized) return false;

    try {
      this.db.exec('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<EmbeddingCacheEntry | null> {
    this.ensureDb();

    try {
      const row = this.stmtGet!.get(key) as {
        embedding: Buffer;
        model: string;
        timestamp: number;
      } | undefined;

      if (!row) return null;

      // Check if expired
      if (this.isExpired(row.timestamp)) {
        await this.delete(key);
        return null;
      }

      return {
        embedding: this.deserializeEmbedding(row.embedding),
        model: row.model,
        timestamp: row.timestamp,
      };
    } catch (error) {
      this.log(`Get error: ${(error as Error).message}`);
      return null;
    }
  }

  async set(key: string, entry: EmbeddingCacheEntry): Promise<void> {
    this.ensureDb();

    try {
      const embeddingBlob = this.serializeEmbedding(entry.embedding);
      this.stmtSet!.run(key, embeddingBlob, entry.model, entry.timestamp);
    } catch (error) {
      this.log(`Set error: ${(error as Error).message}`);
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    this.ensureDb();

    try {
      const row = this.stmtHas!.get(key) as { count: number } | undefined;
      if (!row || row.count === 0) return false;

      // Also check expiration
      const entry = await this.get(key);
      return entry !== null;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    this.ensureDb();

    try {
      const result = this.stmtDelete!.run(key);
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    this.ensureDb();

    try {
      this.db!.exec(`DELETE FROM ${this.config.tableName}`);
      this.log('Cache cleared');
    } catch (error) {
      this.log(`Clear error: ${(error as Error).message}`);
      throw error;
    }
  }

  async size(): Promise<number> {
    this.ensureDb();

    try {
      const row = this.stmtSize!.get() as { count: number } | undefined;
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  }

  async *keys(): AsyncIterable<string> {
    this.ensureDb();

    const stmt = this.db!.prepare(`SELECT key FROM ${this.config.tableName}`);

    for (const row of stmt.iterate()) {
      yield (row as { key: string }).key;
    }
  }

  async pruneExpired(maxAgeMs: number): Promise<number> {
    this.ensureDb();

    try {
      const threshold = Date.now() - maxAgeMs;
      const result = this.stmtPrune!.run(threshold);

      if (result.changes > 0) {
        this.log(`Pruned ${result.changes} expired entries`);
      }

      return result.changes;
    } catch (error) {
      this.log(`Prune error: ${(error as Error).message}`);
      return 0;
    }
  }

  /**
   * Get backend statistics
   */
  async getStats(): Promise<BackendStats> {
    const size = await this.size();

    let dbSizeBytes = 0;
    if (this.db) {
      try {
        const row = this.db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get() as { size: number } | undefined;
        dbSizeBytes = row?.size ?? 0;
      } catch {
        dbSizeBytes = size * BYTES_PER_ENTRY;
      }
    }

    return {
      name: this.name,
      type: this.type,
      size,
      memoryUsageBytes: dbSizeBytes,
      healthy: this.initialized,
      lastHealthCheck: new Date(),
      metrics: {
        walMode: this.config.walMode ? 1 : 0,
        defaultTtlMs: this.config.defaultTtlMs,
      },
    };
  }

  /**
   * Run VACUUM to reclaim space
   */
  async vacuum(): Promise<void> {
    this.ensureDb();
    this.db!.exec('VACUUM');
    this.log('VACUUM completed');
  }

  /**
   * Get database file size in bytes
   */
  async getDatabaseSize(): Promise<number> {
    this.ensureDb();

    try {
      const row = this.db!.prepare(
        'SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()'
      ).get() as { size: number } | undefined;
      return row?.size ?? 0;
    } catch {
      return 0;
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  private prepareStatements(): void {
    const table = this.config.tableName;

    this.stmtGet = this.db!.prepare(
      `SELECT embedding, model, timestamp FROM ${table} WHERE key = ?`
    );

    this.stmtSet = this.db!.prepare(
      `INSERT OR REPLACE INTO ${table} (key, embedding, model, timestamp) VALUES (?, ?, ?, ?)`
    );

    this.stmtHas = this.db!.prepare(
      `SELECT COUNT(*) as count FROM ${table} WHERE key = ?`
    );

    this.stmtDelete = this.db!.prepare(
      `DELETE FROM ${table} WHERE key = ?`
    );

    this.stmtSize = this.db!.prepare(
      `SELECT COUNT(*) as count FROM ${table}`
    );

    this.stmtPrune = this.db!.prepare(
      `DELETE FROM ${table} WHERE timestamp < ?`
    );
  }

  private serializeEmbedding(embedding: number[]): Buffer {
    // Store as Float64Array for precision
    const buffer = Buffer.alloc(embedding.length * 8);
    for (let i = 0; i < embedding.length; i++) {
      buffer.writeDoubleLE(embedding[i], i * 8);
    }
    return buffer;
  }

  private deserializeEmbedding(buffer: Buffer): number[] {
    const embedding: number[] = [];
    for (let i = 0; i < buffer.length; i += 8) {
      embedding.push(buffer.readDoubleLE(i));
    }
    return embedding;
  }

  private isExpired(timestamp: number): boolean {
    if (this.config.defaultTtlMs === 0) return false;
    return Date.now() - timestamp > this.config.defaultTtlMs;
  }

  private ensureDb(): void {
    if (!this.db || !this.initialized) {
      throw new Error('SQLite database not initialized. Call initialize() first.');
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[SQLiteBackend] ${message}`);
    }
  }
}
