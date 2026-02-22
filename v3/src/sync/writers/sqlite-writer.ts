/**
 * SQLite Local Writer
 *
 * Writes records into local SQLite database with upsert (INSERT OR REPLACE) semantics.
 * Used by PullSyncAgent for cloud → local data flow.
 */

import { type Database as DatabaseType } from 'better-sqlite3';
import { openDatabase } from '../../shared/safe-db.js';
import { validateTableName, validateIdentifier } from '../../shared/sql-safety.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { LoggerFactory } from '../../logging/index.js';
import * as fs from 'fs';

const logger = LoggerFactory.create('sqlite-writer');

/**
 * SQLite writer configuration
 */
export interface SQLiteWriterConfig {
  /** Path to the SQLite database */
  dbPath: string;

  /** Batch size for inserts */
  batchSize?: number;
}

/**
 * SQLite writer for local database
 */
export class SQLiteWriter {
  private db: DatabaseType | null = null;
  private readonly dbPath: string;
  private readonly batchSize: number;

  constructor(config: SQLiteWriterConfig) {
    this.dbPath = config.dbPath;
    this.batchSize = config.batchSize || 500;
  }

  /**
   * Connect to (open) the local SQLite database
   */
  async connect(): Promise<void> {
    if (this.db) return;

    if (!fs.existsSync(this.dbPath)) {
      throw new Error(`SQLite database not found: ${this.dbPath}. Run 'aqe init' to create it.`);
    }

    try {
      this.db = openDatabase(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      logger.debug(`Opened SQLite database: ${this.dbPath}`);
    } catch (error) {
      throw new Error(`Failed to open SQLite database ${this.dbPath}: ${toErrorMessage(error)}`);
    }
  }

  /**
   * Upsert records into a local table using INSERT OR REPLACE.
   * Returns the number of records written.
   */
  async upsert(table: string, records: Record<string, unknown>[]): Promise<number> {
    if (!this.db) throw new Error('Not connected');
    if (records.length === 0) return 0;

    const safeTable = validateTableName(table);

    // Verify table exists — warn loudly so callers know data was dropped
    if (!this.tableExists(table)) {
      console.warn(`[SQLiteWriter] Table '${table}' does not exist in local database — ${records.length} records skipped. Run 'aqe init' to create schema.`);
      return 0;
    }

    // Get actual local columns to filter records
    const localColumns = this.getTableColumns(table);
    if (localColumns.length === 0) {
      logger.debug(`No columns found for table ${table}`);
      return 0;
    }

    const localColumnSet = new Set(localColumns);

    let totalWritten = 0;

    // Process in batches
    for (let i = 0; i < records.length; i += this.batchSize) {
      const batch = records.slice(i, i + this.batchSize);
      try {
        const written = this.upsertBatch(safeTable, batch, localColumnSet);
        totalWritten += written;
      } catch (error) {
        // Retry individually on batch failure
        const batchNum = Math.floor(i / this.batchSize) + 1;
        logger.debug(`Batch ${batchNum} failed for ${table}, retrying individually`, {
          error: toErrorMessage(error),
        });
        let recovered = 0;
        for (const record of batch) {
          try {
            recovered += this.upsertBatch(safeTable, [record], localColumnSet);
          } catch (retryError) {
            const recordId = record['id'] || record['key'] || '?';
            logger.debug(`Skipped record ${String(recordId).slice(0, 50)} in ${table}`, {
              error: toErrorMessage(retryError),
            });
          }
        }
        totalWritten += recovered;
      }
    }

    return totalWritten;
  }

  /**
   * Get the record count for a table
   */
  async count(table: string): Promise<number> {
    if (!this.db) throw new Error('Not connected');
    if (!this.tableExists(table)) return 0;

    try {
      const safeTable = validateTableName(table);
      const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${safeTable}`).get() as { count: number };
      return row.count;
    } catch {
      return 0;
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.debug('SQLite writer closed');
    }
  }

  /**
   * Check if a table exists
   */
  private tableExists(table: string): boolean {
    if (!this.db) return false;
    try {
      const result = this.db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).get(table);
      return !!result;
    } catch {
      return false;
    }
  }

  /**
   * Get column names for a table
   */
  private getTableColumns(table: string): string[] {
    if (!this.db) return [];
    try {
      const safeTable = validateTableName(table);
      const columns = this.db.prepare(`PRAGMA table_info(${safeTable})`).all() as { name: string }[];
      return columns.map(c => c.name);
    } catch {
      return [];
    }
  }

  /**
   * Get the primary key column(s) for a table
   */
  private getPrimaryKeyColumns(table: string): string[] {
    if (!this.db) return [];
    try {
      const safeTable = validateTableName(table);
      const columns = this.db.prepare(`PRAGMA table_info(${safeTable})`).all() as { name: string; pk: number }[];
      const pkCols = columns.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
      return pkCols;
    } catch {
      return [];
    }
  }

  /**
   * Upsert a batch of records.
   * Uses INSERT ... ON CONFLICT(pk) DO UPDATE SET for mapped columns only,
   * preserving any local columns not present in the cloud record.
   * Falls back to INSERT OR IGNORE when no primary key is found (append-mode tables).
   */
  private upsertBatch(
    safeTable: string,
    records: Record<string, unknown>[],
    localColumnSet: Set<string>,
  ): number {
    if (!this.db || records.length === 0) return 0;

    // Filter record keys to only include columns that exist in the local table
    const firstRecord = records[0];
    const columns = Object.keys(firstRecord).filter(k => localColumnSet.has(k));

    if (columns.length === 0) return 0;

    const safeColumns = columns.map(validateIdentifier);
    const placeholders = columns.map(() => '?').join(', ');

    // Determine primary key for ON CONFLICT clause
    // Extract raw table name from potentially validated identifier
    const rawTable = safeTable.replace(/"/g, '');
    const pkColumns = this.getPrimaryKeyColumns(rawTable);

    let sql: string;
    if (pkColumns.length > 0) {
      const safePkColumns = pkColumns.map(validateIdentifier);
      // ON CONFLICT: only update the columns we're providing, leave others intact
      const updateColumns = columns.filter(c => !pkColumns.includes(c));
      if (updateColumns.length > 0) {
        const updateSet = updateColumns.map(c => `${validateIdentifier(c)} = excluded.${validateIdentifier(c)}`).join(', ');
        sql = `INSERT INTO ${safeTable} (${safeColumns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${safePkColumns.join(', ')}) DO UPDATE SET ${updateSet}`;
      } else {
        // All columns are PK columns — just ignore duplicates
        sql = `INSERT OR IGNORE INTO ${safeTable} (${safeColumns.join(', ')}) VALUES (${placeholders})`;
      }
    } else {
      // No primary key found — use INSERT OR IGNORE to avoid duplicates
      sql = `INSERT OR IGNORE INTO ${safeTable} (${safeColumns.join(', ')}) VALUES (${placeholders})`;
    }

    const stmt = this.db.prepare(sql);

    const insertMany = this.db.transaction((recs: Record<string, unknown>[]) => {
      let count = 0;
      for (const record of recs) {
        const values = columns.map(col => this.serializeValue(record[col]));
        stmt.run(...values);
        count++;
      }
      return count;
    });

    return insertMany(records);
  }

  /**
   * Serialize a value for SQLite insertion
   */
  private serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;

    // Objects/arrays → JSON string
    if (typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Date)) {
      return JSON.stringify(value);
    }

    // Date → ISO string
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Boolean → integer
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    // Buffer (BLOB) stays as-is
    if (Buffer.isBuffer(value)) {
      return value;
    }

    return value;
  }
}

/**
 * Create a SQLite writer
 */
export function createSQLiteWriter(config: SQLiteWriterConfig): SQLiteWriter {
  return new SQLiteWriter(config);
}
