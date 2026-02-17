/**
 * Unified Memory Migration Utility
 *
 * Migrates data from legacy databases to unified memory.db:
 * - aqe.db (v3 alpha) -> memory.db
 * - vectors.db (if any persisted) -> memory.db
 *
 * Preserves v2 memory.db data - just adds new tables.
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { LoggerFactory } from '../logging/index.js';
import type { Logger } from '../logging/index.js';
import { validateTableName } from '../shared/sql-safety.js';

const logger: Logger = LoggerFactory.create('UnifiedMemoryMigration');

export interface MigrationResult {
  success: boolean;
  backupsCreated: string[];
  tableseMigrated: string[];
  rowsMigrated: number;
  errors: string[];
}

export interface MigrationOptions {
  /** Base directory for databases */
  baseDir: string;
  /** Create backups before migration */
  createBackups: boolean;
  /** Delete source files after successful migration */
  deleteSourceAfterMigration: boolean;
  /** Dry run - show what would be done without doing it */
  dryRun: boolean;
}

const DEFAULT_OPTIONS: MigrationOptions = {
  baseDir: '.agentic-qe',
  createBackups: true,
  deleteSourceAfterMigration: false, // Safety first
  dryRun: false,
};

/**
 * Migrate from legacy database files to unified memory.db
 */
export async function migrateToUnifiedMemory(
  options?: Partial<MigrationOptions>
): Promise<MigrationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: MigrationResult = {
    success: false,
    backupsCreated: [],
    tableseMigrated: [],
    rowsMigrated: 0,
    errors: [],
  };

  const memoryDbPath = path.join(opts.baseDir, 'memory.db');
  const aqeDbPath = path.join(opts.baseDir, 'aqe.db');

  logger.info('Starting unified memory migration', { target: memoryDbPath, source: aqeDbPath });

  // Check if source exists
  if (!fs.existsSync(aqeDbPath)) {
    logger.info('No aqe.db found - nothing to migrate');
    result.success = true;
    return result;
  }

  // Create backups
  if (opts.createBackups && !opts.dryRun) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Backup memory.db if it exists
    if (fs.existsSync(memoryDbPath)) {
      const backupPath = `${memoryDbPath}.backup-${timestamp}`;
      fs.copyFileSync(memoryDbPath, backupPath);
      result.backupsCreated.push(backupPath);
      logger.info('Created backup', { path: backupPath });
    }

    // Backup aqe.db
    const aqeBackupPath = `${aqeDbPath}.backup-${timestamp}`;
    fs.copyFileSync(aqeDbPath, aqeBackupPath);
    result.backupsCreated.push(aqeBackupPath);
    logger.info('Created backup', { path: aqeBackupPath });
  }

  if (opts.dryRun) {
    logger.info('DRY RUN - showing what would be migrated');
  }

  let sourceDb: DatabaseType | null = null;
  let targetDb: DatabaseType | null = null;

  try {
    // Open source database (aqe.db)
    sourceDb = new Database(aqeDbPath, { readonly: true });

    // Open target database (memory.db)
    if (!opts.dryRun) {
      // Ensure directory exists
      if (!fs.existsSync(opts.baseDir)) {
        fs.mkdirSync(opts.baseDir, { recursive: true });
      }
      targetDb = new Database(memoryDbPath);
      targetDb.pragma('journal_mode = WAL');
    }

    // Get list of tables to migrate
    const tablesToMigrate = [
      'rl_q_values',
      'goap_goals',
      'goap_actions',
      'goap_plans',
      'goap_plan_signatures',
      'concept_nodes',
      'concept_edges',
      'dream_cycles',
      'dream_insights',
    ];

    for (const tableName of tablesToMigrate) {
      try {
        // Check if table exists in source
        const tableExists = sourceDb.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name=?
        `).get(tableName);

        if (!tableExists) {
          continue;
        }

        // Count rows
        const countRow = sourceDb.prepare(`SELECT COUNT(*) as count FROM ${validateTableName(tableName)}`).get() as { count: number };
        const rowCount = countRow.count;

        if (rowCount === 0) {
          continue;
        }

        logger.info('Table migration', { table: tableName, rows: rowCount });

        if (opts.dryRun) {
          result.tableseMigrated.push(tableName);
          result.rowsMigrated += rowCount;
          continue;
        }

        // Create table in target if not exists (get schema from source)
        const schemaRow = sourceDb.prepare(`
          SELECT sql FROM sqlite_master WHERE type='table' AND name=?
        `).get(tableName) as { sql: string };

        targetDb!.exec(schemaRow.sql);

        // Copy data
        const rows = sourceDb.prepare(`SELECT * FROM ${validateTableName(tableName)}`).all();

        if (rows.length > 0) {
          const columns = Object.keys(rows[0] as object);
          const placeholders = columns.map(() => '?').join(', ');
          const insertStmt = targetDb!.prepare(`
            INSERT OR REPLACE INTO ${validateTableName(tableName)} (${columns.join(', ')})
            VALUES (${placeholders})
          `);

          const insertMany = targetDb!.transaction((items: unknown[]) => {
            for (const item of items) {
              const values = columns.map(col => (item as Record<string, unknown>)[col]);
              insertStmt.run(...values);
            }
          });

          insertMany(rows);
        }

        result.tableseMigrated.push(tableName);
        result.rowsMigrated += rowCount;

      } catch (tableError) {
        const errMsg = `Failed to migrate ${tableName}: ${tableError}`;
        logger.error(errMsg);
        result.errors.push(errMsg);
      }
    }

    // Also migrate kv_store if it has unique data
    try {
      const kvExists = sourceDb.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='kv_store'
      `).get();

      if (kvExists) {
        const kvRows = sourceDb.prepare('SELECT * FROM kv_store').all();

        if (kvRows.length > 0 && !opts.dryRun) {
          // Create table in target
          targetDb!.exec(`
            CREATE TABLE IF NOT EXISTS kv_store (
              key TEXT NOT NULL,
              namespace TEXT NOT NULL,
              value TEXT NOT NULL,
              expires_at INTEGER,
              created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
              PRIMARY KEY (namespace, key)
            );
            CREATE INDEX IF NOT EXISTS idx_kv_namespace ON kv_store(namespace);
            CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv_store(expires_at) WHERE expires_at IS NOT NULL;
          `);

          // Insert, but don't overwrite existing
          const insertStmt = targetDb!.prepare(`
            INSERT OR IGNORE INTO kv_store (key, namespace, value, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?)
          `);

          for (const row of kvRows) {
            const r = row as { key: string; namespace: string; value: string; expires_at: number | null; created_at: number };
            insertStmt.run(r.key, r.namespace, r.value, r.expires_at, r.created_at);
          }
        }

        logger.info('KV store migration', { entries: kvRows.length, mode: 'no overwrites' });
      }
    } catch (kvError) {
      logger.warn('KV migration skipped', { error: kvError });
    }

    // Close databases
    sourceDb.close();
    sourceDb = null;

    if (targetDb) {
      targetDb.close();
      targetDb = null;
    }

    // Delete source after successful migration (if requested)
    if (opts.deleteSourceAfterMigration && !opts.dryRun && result.errors.length === 0) {
      fs.unlinkSync(aqeDbPath);
      // Also clean up WAL/SHM files
      const walPath = `${aqeDbPath}-wal`;
      const shmPath = `${aqeDbPath}-shm`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      logger.info('Deleted source', { path: aqeDbPath });
    }

    result.success = result.errors.length === 0;

    logger.info('Migration complete', { tables: result.tableseMigrated.length, rows: result.rowsMigrated });

  } catch (error) {
    result.errors.push(`Migration failed: ${error}`);
    logger.error('Fatal migration error', error instanceof Error ? error : undefined);

  } finally {
    if (sourceDb) sourceDb.close();
    if (targetDb) targetDb.close();
  }

  return result;
}

/**
 * Check if migration is needed
 */
export function migrationNeeded(baseDir: string = '.agentic-qe'): boolean {
  const aqeDbPath = path.join(baseDir, 'aqe.db');
  return fs.existsSync(aqeDbPath);
}

/**
 * Get migration status
 */
export function getMigrationStatus(baseDir: string = '.agentic-qe'): {
  needsMigration: boolean;
  sources: string[];
  target: string;
  targetExists: boolean;
} {
  const memoryDbPath = path.join(baseDir, 'memory.db');
  const aqeDbPath = path.join(baseDir, 'aqe.db');

  const sources: string[] = [];
  if (fs.existsSync(aqeDbPath)) sources.push(aqeDbPath);

  return {
    needsMigration: sources.length > 0,
    sources,
    target: memoryDbPath,
    targetExists: fs.existsSync(memoryDbPath),
  };
}
