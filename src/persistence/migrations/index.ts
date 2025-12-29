/**
 * Database Migration System
 *
 * Manages schema migrations for the Agentic QE database.
 * Migrations are versioned and tracked to ensure consistency
 * across all installations.
 *
 * @module persistence/migrations
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface Migration {
  version: number;
  name: string;
  description: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
}

export interface MigrationResult {
  version: number;
  name: string;
  success: boolean;
  error?: string;
  duration: number;
}

export interface MigrationStatus {
  currentVersion: number;
  latestVersion: number;
  pendingMigrations: number;
  appliedMigrations: Array<{
    version: number;
    name: string;
    applied_at: string;
  }>;
}

/**
 * Migration Runner
 *
 * Handles running database migrations in order with version tracking.
 */
export class MigrationRunner {
  private db: Database.Database;
  private migrations: Migration[] = [];

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureMigrationTable();
  }

  /**
   * Ensure the migrations tracking table exists
   */
  private ensureMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        applied_at TEXT NOT NULL,
        checksum TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_migrations_version ON schema_migrations(version);
    `);
  }

  /**
   * Register a migration
   */
  register(migration: Migration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * Register multiple migrations
   */
  registerAll(migrations: Migration[]): void {
    migrations.forEach(m => this.register(m));
  }

  /**
   * Get current schema version
   */
  getCurrentVersion(): number {
    const row = this.db.prepare(
      'SELECT MAX(version) as version FROM schema_migrations'
    ).get() as { version: number | null } | undefined;

    return row?.version ?? 0;
  }

  /**
   * Get latest available migration version
   */
  getLatestVersion(): number {
    if (this.migrations.length === 0) return 0;
    return Math.max(...this.migrations.map(m => m.version));
  }

  /**
   * Get pending migrations
   */
  getPendingMigrations(): Migration[] {
    const currentVersion = this.getCurrentVersion();
    return this.migrations.filter(m => m.version > currentVersion);
  }

  /**
   * Get migration status
   */
  getStatus(): MigrationStatus {
    const currentVersion = this.getCurrentVersion();
    const latestVersion = this.getLatestVersion();
    const pending = this.getPendingMigrations();

    const applied = this.db.prepare(
      'SELECT version, name, applied_at FROM schema_migrations ORDER BY version'
    ).all() as Array<{ version: number; name: string; applied_at: string }>;

    return {
      currentVersion,
      latestVersion,
      pendingMigrations: pending.length,
      appliedMigrations: applied
    };
  }

  /**
   * Run all pending migrations
   */
  runAll(): MigrationResult[] {
    const results: MigrationResult[] = [];
    const pending = this.getPendingMigrations();

    for (const migration of pending) {
      const result = this.runOne(migration);
      results.push(result);

      if (!result.success) {
        break; // Stop on first failure
      }
    }

    return results;
  }

  /**
   * Run a single migration
   */
  runOne(migration: Migration): MigrationResult {
    const startTime = Date.now();

    try {
      // Check if already applied
      const existing = this.db.prepare(
        'SELECT version FROM schema_migrations WHERE version = ?'
      ).get(migration.version);

      if (existing) {
        return {
          version: migration.version,
          name: migration.name,
          success: true,
          duration: 0
        };
      }

      // Run migration in transaction
      this.db.transaction(() => {
        migration.up(this.db);

        // Record migration
        this.db.prepare(`
          INSERT INTO schema_migrations (version, name, description, applied_at)
          VALUES (?, ?, ?, ?)
        `).run(
          migration.version,
          migration.name,
          migration.description,
          new Date().toISOString()
        );
      })();

      return {
        version: migration.version,
        name: migration.name,
        success: true,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        version: migration.version,
        name: migration.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Rollback the last migration
   */
  rollbackLast(): MigrationResult | null {
    const currentVersion = this.getCurrentVersion();
    if (currentVersion === 0) return null;

    const migration = this.migrations.find(m => m.version === currentVersion);
    if (!migration || !migration.down) {
      return {
        version: currentVersion,
        name: migration?.name ?? 'unknown',
        success: false,
        error: 'Migration does not support rollback',
        duration: 0
      };
    }

    const startTime = Date.now();

    try {
      this.db.transaction(() => {
        migration.down!(this.db);
        this.db.prepare('DELETE FROM schema_migrations WHERE version = ?')
          .run(currentVersion);
      })();

      return {
        version: currentVersion,
        name: migration.name,
        success: true,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        version: currentVersion,
        name: migration.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Check if a specific table exists
   */
  tableExists(tableName: string): boolean {
    const row = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);
    return !!row;
  }

  /**
   * Check if a column exists in a table
   */
  columnExists(tableName: string, columnName: string): boolean {
    try {
      const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
      return columns.some(c => c.name === columnName);
    } catch {
      return false;
    }
  }

  /**
   * Safe add column - only adds if it doesn't exist
   */
  safeAddColumn(tableName: string, columnName: string, columnDef: string): void {
    if (!this.columnExists(tableName, columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    }
  }

  /**
   * Safe create table - creates if doesn't exist
   */
  safeCreateTable(sql: string): void {
    this.db.exec(sql);
  }
}

/**
 * Get default database path
 */
export function getDefaultDbPath(): string {
  return path.join(process.cwd(), '.agentic-qe', 'memory.db');
}

/**
 * Run migrations on a database
 */
export async function runMigrations(
  dbPath: string = getDefaultDbPath(),
  verbose: boolean = false
): Promise<MigrationResult[]> {
  const db = new Database(dbPath);

  try {
    const runner = new MigrationRunner(db);

    // Register all migrations
    const { allMigrations } = await import('./all-migrations');
    runner.registerAll(allMigrations);

    if (verbose) {
      const status = runner.getStatus();
      console.log(`Current version: ${status.currentVersion}`);
      console.log(`Latest version: ${status.latestVersion}`);
      console.log(`Pending migrations: ${status.pendingMigrations}`);
    }

    const results = runner.runAll();

    if (verbose) {
      for (const result of results) {
        if (result.success) {
          console.log(`✓ Migration ${result.version}: ${result.name} (${result.duration}ms)`);
        } else {
          console.log(`✗ Migration ${result.version}: ${result.name} - ${result.error}`);
        }
      }
    }

    return results;
  } finally {
    db.close();
  }
}

export { MigrationRunner as default };
