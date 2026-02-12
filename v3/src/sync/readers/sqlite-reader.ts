/**
 * SQLite Data Reader
 *
 * Reads data from local SQLite databases for cloud sync.
 * Handles: memory.db (consolidated database)
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { DataReader, SyncSource } from '../interfaces.js';
import { validateTableName } from '../../shared/sql-safety.js';

/**
 * SQLite reader configuration
 */
export interface SQLiteReaderConfig {
  /** Source configuration */
  source: SyncSource;

  /** Base directory for resolving paths */
  baseDir: string;

  /** Environment identifier */
  environment: string;
}

/**
 * Generic record type from SQLite
 */
export interface SQLiteRecord {
  [key: string]: unknown;
}

/**
 * SQLite data reader implementation
 */
export class SQLiteReader implements DataReader<SQLiteRecord> {
  readonly name: string;
  readonly type = 'sqlite' as const;

  private db: DatabaseType | null = null;
  private readonly config: SQLiteReaderConfig;
  private readonly dbPath: string;

  constructor(config: SQLiteReaderConfig) {
    this.config = config;
    this.name = config.source.name;
    this.dbPath = path.resolve(config.baseDir, config.source.path);
  }

  /**
   * Initialize the reader
   */
  async initialize(): Promise<void> {
    if (this.db) return;

    // Check if file exists
    if (!fs.existsSync(this.dbPath)) {
      throw new Error(`SQLite database not found: ${this.dbPath}`);
    }

    try {
      // Open read-only
      this.db = new Database(this.dbPath, { readonly: true });

      // Enable performance settings for reads
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');

      console.log(`[SQLiteReader:${this.name}] Initialized: ${this.dbPath}`);
    } catch (error) {
      throw new Error(
        `Failed to open SQLite database ${this.dbPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Read all records
   */
  async readAll(): Promise<SQLiteRecord[]> {
    if (!this.db) {
      throw new Error('Reader not initialized');
    }

    const query = this.config.source.query || `SELECT * FROM ${validateTableName(this.getTableName())}`;

    try {
      // Check if table exists
      if (!this.tableExists(this.getTableName())) {
        console.warn(`[SQLiteReader:${this.name}] Table not found, returning empty`);
        return [];
      }

      const stmt = this.db.prepare(query);
      const rows = stmt.all() as SQLiteRecord[];

      // Add environment and transform data
      return rows.map(row => this.transformRecord(row));
    } catch (error) {
      throw new Error(
        `Failed to read from ${this.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Read records changed since a timestamp
   */
  async readChanged(since: Date): Promise<SQLiteRecord[]> {
    if (!this.db) {
      throw new Error('Reader not initialized');
    }

    // Try to find a timestamp column
    const timestampCol = this.findTimestampColumn();
    if (!timestampCol) {
      console.warn(`[SQLiteReader:${this.name}] No timestamp column found, falling back to readAll`);
      return this.readAll();
    }

    const tableName = this.getTableName();
    if (!this.tableExists(tableName)) {
      return [];
    }

    const sinceStr = since.toISOString();
    const query = `SELECT * FROM ${validateTableName(tableName)} WHERE ${timestampCol} > ?`;

    try {
      const stmt = this.db.prepare(query);
      const rows = stmt.all(sinceStr) as SQLiteRecord[];
      return rows.map(row => this.transformRecord(row));
    } catch (error) {
      // If the column doesn't exist or query fails, fall back to readAll
      console.warn(`[SQLiteReader:${this.name}] Changed query failed, falling back to readAll`);
      return this.readAll();
    }
  }

  /**
   * Get record count
   */
  async count(): Promise<number> {
    if (!this.db) {
      throw new Error('Reader not initialized');
    }

    const tableName = this.getTableName();
    if (!this.tableExists(tableName)) {
      return 0;
    }

    try {
      const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${validateTableName(tableName)}`);
      const result = stmt.get() as { count: number };
      return result.count;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Close the reader
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log(`[SQLiteReader:${this.name}] Closed`);
    }
  }

  /**
   * Get table name from source config
   */
  private getTableName(): string {
    // Extract table name from query if present
    const query = this.config.source.query;
    if (query) {
      const match = query.match(/FROM\s+(\w+)/i);
      if (match) {
        return match[1];
      }
    }

    // Extract from target table (e.g., 'aqe.qe_patterns' -> 'qe_patterns')
    const targetTable = this.config.source.targetTable;
    const parts = targetTable.split('.');
    return parts[parts.length - 1];
  }

  /**
   * Check if a table exists
   */
  private tableExists(tableName: string): boolean {
    if (!this.db) return false;

    try {
      const stmt = this.db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      );
      const result = stmt.get(tableName);
      return !!result;
    } catch {
      return false;
    }
  }

  /**
   * Find a timestamp column in the table
   */
  private findTimestampColumn(): string | null {
    if (!this.db) return null;

    const tableName = this.getTableName();
    const candidates = ['updated_at', 'created_at', 'timestamp', 'last_used_at', 'modified_at'];

    try {
      const stmt = this.db.prepare(`PRAGMA table_info(${validateTableName(tableName)})`);
      const columns = stmt.all() as { name: string }[];
      const columnNames = columns.map(c => c.name.toLowerCase());

      for (const candidate of candidates) {
        if (columnNames.includes(candidate)) {
          return candidate;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Transform a record for cloud sync
   */
  private transformRecord(row: SQLiteRecord): SQLiteRecord {
    const transformed: SQLiteRecord = {
      ...row,
      source_env: this.config.environment,
    };

    // Convert SQLite JSON strings to objects for JSONB columns
    for (const [key, value] of Object.entries(transformed)) {
      if (typeof value === 'string' && this.looksLikeJson(value)) {
        try {
          transformed[key] = JSON.parse(value);
        } catch {
          // Keep as string if not valid JSON
        }
      }

      // Convert Unix timestamps to ISO strings
      if (key.endsWith('_at') && typeof value === 'number') {
        transformed[key] = new Date(value).toISOString();
      }

      // Handle BLOB data (embeddings)
      if (value instanceof Buffer) {
        // Convert to array for embedding columns
        if (key.includes('embedding')) {
          const dimension = row.dimension || 384;
          transformed[key] = Array.from(
            new Float32Array(value.buffer, value.byteOffset, dimension as number)
          );
        } else {
          // Keep as base64 for other BLOBs
          transformed[key] = value.toString('base64');
        }
      }
    }

    return transformed;
  }

  /**
   * Check if a string looks like JSON
   */
  private looksLikeJson(value: string): boolean {
    if (!value) return false;
    const trimmed = value.trim();
    return (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    );
  }

  /**
   * Get database info for debugging
   */
  getInfo(): { path: string; exists: boolean; tables: string[] } {
    const exists = fs.existsSync(this.dbPath);
    let tables: string[] = [];

    if (exists && this.db) {
      try {
        const stmt = this.db.prepare(
          `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
        );
        tables = (stmt.all() as { name: string }[]).map(r => r.name);
      } catch (error) {
        // Non-critical: table listing errors during database info
        console.debug('[SQLiteReader] Table listing error:', error instanceof Error ? error.message : error);
      }
    }

    return { path: this.dbPath, exists, tables };
  }
}

/**
 * Create a SQLite reader
 */
export function createSQLiteReader(config: SQLiteReaderConfig): SQLiteReader {
  return new SQLiteReader(config);
}
