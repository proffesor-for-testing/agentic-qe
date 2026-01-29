/**
 * Phase 04: Database
 * Initializes SQLite persistence database
 */

import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';

export interface DatabaseResult {
  dbPath: string;
  created: boolean;
  tablesCreated: string[];
}

/**
 * Database phase - initializes SQLite persistence
 */
export class DatabasePhase extends BasePhase<DatabaseResult> {
  readonly name = 'database';
  readonly description = 'Initialize persistence database';
  readonly order = 40;
  readonly critical = true;
  readonly requiresPhases = ['configuration'] as const;

  protected async run(context: InitContext): Promise<DatabaseResult> {
    const { projectRoot } = context;

    // Dynamic import for better-sqlite3
    // Type for dynamically imported better-sqlite3 constructor
    type DatabaseConstructor = new (filename: string) => import('better-sqlite3').Database;
    let Database: DatabaseConstructor;
    try {
      const mod = await import('better-sqlite3');
      Database = mod.default;
    } catch (error) {
      throw new Error(
        'SQLite persistence REQUIRED but better-sqlite3 is not installed.\n' +
        'Install it with: npm install better-sqlite3\n' +
        'If you see native compilation errors, ensure build tools are installed.'
      );
    }

    // Create .agentic-qe directory
    const dataDir = join(projectRoot, '.agentic-qe');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = join(dataDir, 'memory.db');
    const created = !existsSync(dbPath);

    try {
      const db = new Database(dbPath);

      // Configure for performance
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');

      // Create tables
      const tablesCreated: string[] = [];

      // kv_store table
      db.exec(`
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
      tablesCreated.push('kv_store');

      // Verify the table exists
      const tableCheck = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='kv_store'
      `).get();

      if (!tableCheck) {
        throw new Error('Failed to create kv_store table');
      }

      // Write init test entry
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO kv_store (key, namespace, value)
        VALUES (?, ?, ?)
      `);
      stmt.run('_init_test', '_system', JSON.stringify({ initialized: new Date().toISOString() }));

      db.close();

      context.services.log(`  Database: ${dbPath}`);
      context.services.log(`  Tables: ${tablesCreated.join(', ')}`);

      return {
        dbPath,
        created,
        tablesCreated,
      };
    } catch (error) {
      throw new Error(
        `SQLite persistence initialization FAILED: ${error}\n` +
        `Database path: ${dbPath}\n` +
        'Ensure the directory is writable and has sufficient disk space.'
      );
    }
  }
}

// Instance exported from index.ts
