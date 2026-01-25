#!/usr/bin/env node
/**
 * Database Schema Migration for Learning Persistence
 *
 * This script migrates the database schema to fix learning/pattern persistence issues:
 * 1. Add missing columns to patterns table (agent_id, domain, success_rate)
 * 2. Add missing columns to learning_experiences table (metadata, created_at)
 * 3. Add missing columns to q_values table (metadata)
 *
 * Usage: npm run migrate:learning
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), '.agentic-qe', 'memory.db');

interface MigrationResult {
  success: boolean;
  message: string;
  details?: string;
}

class LearningSchemaMigration {
  private db: Database.Database;

  constructor() {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(`Database not found at: ${DB_PATH}`);
    }

    this.db = new Database(DB_PATH);
    console.log('✓ Connected to database:', DB_PATH);
  }

  /**
   * Check if a column exists in a table
   */
  private columnExists(tableName: string, columnName: string): boolean {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: any;
      pk: number;
    }>;

    return columns.some(col => col.name === columnName);
  }

  /**
   * Check if a table exists
   */
  private tableExists(tableName: string): boolean {
    const result = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name=?
    `).get(tableName);

    return !!result;
  }

  /**
   * Get current row count for a table
   */
  private getRowCount(tableName: string): number {
    const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
    return result.count;
  }

  /**
   * Migration 1: Add columns to patterns table
   */
  migratePatterns(): MigrationResult {
    console.log('\n=== Migration 1: patterns table ===');

    if (!this.tableExists('patterns')) {
      return {
        success: false,
        message: 'patterns table does not exist'
      };
    }

    const columnsToAdd = [
      { name: 'agent_id', type: 'TEXT', default: null },
      { name: 'domain', type: 'TEXT', default: "'general'" },
      { name: 'success_rate', type: 'REAL', default: '1.0' }
    ];

    const addedColumns: string[] = [];
    const skippedColumns: string[] = [];

    for (const col of columnsToAdd) {
      if (this.columnExists('patterns', col.name)) {
        console.log(`  ⊘ Column '${col.name}' already exists`);
        skippedColumns.push(col.name);
      } else {
        const defaultClause = col.default ? `DEFAULT ${col.default}` : '';
        const sql = `ALTER TABLE patterns ADD COLUMN ${col.name} ${col.type} ${defaultClause}`;

        try {
          this.db.prepare(sql).run();
          console.log(`  ✓ Added column '${col.name}' (${col.type})`);
          addedColumns.push(col.name);
        } catch (error) {
          console.error(`  ✗ Failed to add column '${col.name}':`, error);
          return {
            success: false,
            message: `Failed to add column '${col.name}' to patterns table`,
            details: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }

    const rowCount = this.getRowCount('patterns');

    return {
      success: true,
      message: `patterns table migration complete`,
      details: `Added: [${addedColumns.join(', ')}], Skipped: [${skippedColumns.join(', ')}], Rows: ${rowCount}`
    };
  }

  /**
   * Migration 2: Add columns to learning_experiences table
   */
  migrateLearningExperiences(): MigrationResult {
    console.log('\n=== Migration 2: learning_experiences table ===');

    if (!this.tableExists('learning_experiences')) {
      return {
        success: false,
        message: 'learning_experiences table does not exist'
      };
    }

    const columnsToAdd = [
      { name: 'metadata', type: 'TEXT', default: null },
      { name: 'created_at', type: 'INTEGER', default: null }
    ];

    const addedColumns: string[] = [];
    const skippedColumns: string[] = [];

    for (const col of columnsToAdd) {
      if (this.columnExists('learning_experiences', col.name)) {
        console.log(`  ⊘ Column '${col.name}' already exists`);
        skippedColumns.push(col.name);
      } else {
        const defaultClause = col.default ? `DEFAULT ${col.default}` : '';
        const sql = `ALTER TABLE learning_experiences ADD COLUMN ${col.name} ${col.type} ${defaultClause}`;

        try {
          this.db.prepare(sql).run();
          console.log(`  ✓ Added column '${col.name}' (${col.type})`);
          addedColumns.push(col.name);
        } catch (error) {
          console.error(`  ✗ Failed to add column '${col.name}':`, error);
          return {
            success: false,
            message: `Failed to add column '${col.name}' to learning_experiences table`,
            details: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }

    const rowCount = this.getRowCount('learning_experiences');

    return {
      success: true,
      message: `learning_experiences table migration complete`,
      details: `Added: [${addedColumns.join(', ')}], Skipped: [${skippedColumns.join(', ')}], Rows: ${rowCount}`
    };
  }

  /**
   * Migration 3: Add columns to q_values table
   */
  migrateQValues(): MigrationResult {
    console.log('\n=== Migration 3: q_values table ===');

    if (!this.tableExists('q_values')) {
      return {
        success: false,
        message: 'q_values table does not exist'
      };
    }

    const columnsToAdd = [
      { name: 'metadata', type: 'TEXT', default: null }
    ];

    const addedColumns: string[] = [];
    const skippedColumns: string[] = [];

    for (const col of columnsToAdd) {
      if (this.columnExists('q_values', col.name)) {
        console.log(`  ⊘ Column '${col.name}' already exists`);
        skippedColumns.push(col.name);
      } else {
        const defaultClause = col.default ? `DEFAULT ${col.default}` : '';
        const sql = `ALTER TABLE q_values ADD COLUMN ${col.name} ${col.type} ${defaultClause}`;

        try {
          this.db.prepare(sql).run();
          console.log(`  ✓ Added column '${col.name}' (${col.type})`);
          addedColumns.push(col.name);
        } catch (error) {
          console.error(`  ✗ Failed to add column '${col.name}':`, error);
          return {
            success: false,
            message: `Failed to add column '${col.name}' to q_values table`,
            details: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }

    const rowCount = this.getRowCount('q_values');

    return {
      success: true,
      message: `q_values table migration complete`,
      details: `Added: [${addedColumns.join(', ')}], Skipped: [${skippedColumns.join(', ')}], Rows: ${rowCount}`
    };
  }

  /**
   * Verify schema changes
   */
  verifySchema(): boolean {
    console.log('\n=== Schema Verification ===');

    const checks = [
      { table: 'patterns', columns: ['agent_id', 'domain', 'success_rate'] },
      { table: 'learning_experiences', columns: ['metadata', 'created_at'] },
      { table: 'q_values', columns: ['metadata'] }
    ];

    let allValid = true;

    for (const check of checks) {
      console.log(`\nChecking ${check.table}:`);

      const columns = this.db.prepare(`PRAGMA table_info(${check.table})`).all() as Array<{
        name: string;
        type: string;
      }>;

      for (const requiredCol of check.columns) {
        const exists = columns.some(col => col.name === requiredCol);
        if (exists) {
          const col = columns.find(c => c.name === requiredCol);
          console.log(`  ✓ ${requiredCol} (${col?.type})`);
        } else {
          console.log(`  ✗ ${requiredCol} MISSING`);
          allValid = false;
        }
      }
    }

    return allValid;
  }

  /**
   * Run all migrations
   */
  async runAll(): Promise<void> {
    console.log('\n🚀 Starting Learning Schema Migration');
    console.log('=====================================\n');

    const results: MigrationResult[] = [];

    // Run migrations
    results.push(this.migratePatterns());
    results.push(this.migrateLearningExperiences());
    results.push(this.migrateQValues());

    // Print summary
    console.log('\n=== Migration Summary ===');
    let successCount = 0;
    let failureCount = 0;

    results.forEach((result, index) => {
      if (result.success) {
        console.log(`✓ Migration ${index + 1}: ${result.message}`);
        if (result.details) {
          console.log(`  ${result.details}`);
        }
        successCount++;
      } else {
        console.log(`✗ Migration ${index + 1}: ${result.message}`);
        if (result.details) {
          console.log(`  Error: ${result.details}`);
        }
        failureCount++;
      }
    });

    console.log(`\nTotal: ${successCount} succeeded, ${failureCount} failed`);

    // Verify schema
    const isValid = this.verifySchema();

    if (isValid && failureCount === 0) {
      console.log('\n✅ All migrations completed successfully!');
      console.log('\nNext steps:');
      console.log('  1. Update handler code to use new columns');
      console.log('  2. Run tests: npm run test:integration');
      console.log('  3. Verify MCP tools work correctly');
    } else {
      console.log('\n⚠️  Some migrations failed or schema is incomplete');
      console.log('Please review the errors above and retry.');
      process.exit(1);
    }

    this.close();
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    console.log('\n✓ Database connection closed');
  }
}

// Main execution
if (require.main === module) {
  const migration = new LearningSchemaMigration();

  migration.runAll().catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
}

export { LearningSchemaMigration };
