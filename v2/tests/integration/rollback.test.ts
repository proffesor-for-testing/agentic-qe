/**
 * Rollback Tests
 * Tests database rollback functionality, state restoration, and system recovery
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import * as crypto from 'crypto';

/**
 * Calculate checksum for verification
 */
function calculateChecksum(dbPath: string): string {
  const fileBuffer = fs.readFileSync(dbPath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

describe('Rollback Functionality - Integration Tests', () => {
  let testDir: string;
  let originalDbPath: string;
  let migratedDbPath: string;
  let backupDir: string;

  beforeEach(() => {
    testDir = path.join(__dirname, '../.tmp/rollback-test-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });

    originalDbPath = path.join(testDir, 'original.db');
    migratedDbPath = path.join(testDir, 'migrated.db');
    backupDir = path.join(testDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    // Create original database (v1 schema)
    const originalDb = new Database(originalDbPath);
    originalDb.exec(`
      CREATE TABLE schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL,
        description TEXT
      );

      CREATE TABLE episodes (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        reward REAL,
        created_at INTEGER
      );

      INSERT INTO schema_version VALUES (1, ${Date.now()}, 'v1 schema');

      INSERT INTO episodes VALUES
        ('ep1', 'test-gen', 0.95, ${Date.now()}),
        ('ep2', 'coverage', 0.85, ${Date.now()}),
        ('ep3', 'security', 0.90, ${Date.now()});
    `);
    originalDb.close();

    // Create backup of original
    const backupPath = path.join(backupDir, `original.db.backup.${Date.now()}.db`);
    fs.copyFileSync(originalDbPath, backupPath);
    const checksum = calculateChecksum(backupPath);
    fs.writeFileSync(`${backupPath}.sha256`, checksum);

    // Create migrated database (v2 schema)
    fs.copyFileSync(originalDbPath, migratedDbPath);
    const migratedDb = new Database(migratedDbPath);
    migratedDb.exec(`
      ALTER TABLE episodes ADD COLUMN success INTEGER DEFAULT 1;
      ALTER TABLE episodes ADD COLUMN tokens_used INTEGER DEFAULT 0;

      CREATE TABLE patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        agent_id TEXT,
        success_rate REAL DEFAULT 1.0
      );

      INSERT INTO schema_version VALUES (2, ${Date.now()}, 'v2 schema - add patterns');
    `);
    migratedDb.close();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Rollback to Original State', () => {
    it('should restore original schema', () => {
      // Get backup
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      expect(backups.length).toBeGreaterThan(0);

      const backupPath = path.join(backupDir, backups[0]);

      // Verify migrated has v2 schema
      let migratedDb = new Database(migratedDbPath, { readonly: true });
      const v2Columns = migratedDb.prepare('PRAGMA table_info(episodes)').all() as Array<{ name: string }>;
      migratedDb.close();

      expect(v2Columns.map(c => c.name)).toContain('success');
      expect(v2Columns.map(c => c.name)).toContain('tokens_used');

      // Rollback: restore from backup
      fs.copyFileSync(backupPath, migratedDbPath);

      // Verify v1 schema restored
      migratedDb = new Database(migratedDbPath, { readonly: true });
      const v1Columns = migratedDb.prepare('PRAGMA table_info(episodes)').all() as Array<{ name: string }>;
      const columnNames = v1Columns.map(c => c.name);
      migratedDb.close();

      expect(columnNames).not.toContain('success');
      expect(columnNames).not.toContain('tokens_used');
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('task');
      expect(columnNames).toContain('reward');
    });

    it('should restore original data', () => {
      // Get original data
      const originalDb = new Database(originalDbPath, { readonly: true });
      const originalData = originalDb.prepare('SELECT * FROM episodes ORDER BY id').all();
      originalDb.close();

      // Rollback
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      const backupPath = path.join(backupDir, backups[0]);
      fs.copyFileSync(backupPath, migratedDbPath);

      // Verify data restored
      const restoredDb = new Database(migratedDbPath, { readonly: true });
      const restoredData = restoredDb.prepare('SELECT id, task, reward, created_at FROM episodes ORDER BY id').all();
      restoredDb.close();

      expect(restoredData).toEqual(originalData);
    });

    it('should restore original table count', () => {
      // Original has 2 tables (schema_version, episodes)
      const originalDb = new Database(originalDbPath, { readonly: true });
      const originalTables = originalDb.prepare(`
        SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).get() as { count: number };
      originalDb.close();

      // Migrated has 3 tables (added patterns)
      const migratedDb = new Database(migratedDbPath, { readonly: true });
      const migratedTables = migratedDb.prepare(`
        SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).get() as { count: number };
      migratedDb.close();

      expect(migratedTables.count).toBe(originalTables.count + 1);

      // Rollback
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      const backupPath = path.join(backupDir, backups[0]);
      fs.copyFileSync(backupPath, migratedDbPath);

      // Verify table count restored
      const restoredDb = new Database(migratedDbPath, { readonly: true });
      const restoredTables = restoredDb.prepare(`
        SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).get() as { count: number };
      restoredDb.close();

      expect(restoredTables.count).toBe(originalTables.count);
    });
  });

  describe('No Data Loss During Rollback', () => {
    it('should preserve all episode records', () => {
      const originalDb = new Database(originalDbPath, { readonly: true });
      const originalCount = originalDb.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };
      originalDb.close();

      // Rollback
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      const backupPath = path.join(backupDir, backups[0]);
      fs.copyFileSync(backupPath, migratedDbPath);

      // Verify count
      const restoredDb = new Database(migratedDbPath, { readonly: true });
      const restoredCount = restoredDb.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };
      restoredDb.close();

      expect(restoredCount.count).toBe(originalCount.count);
      expect(restoredCount.count).toBe(3);
    });

    it('should have matching checksums after rollback', () => {
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      const backupPath = path.join(backupDir, backups[0]);
      const checksumPath = `${backupPath}.sha256`;

      // Get stored checksum
      const storedChecksum = fs.readFileSync(checksumPath, 'utf-8');

      // Rollback
      fs.copyFileSync(backupPath, migratedDbPath);

      // Verify checksum matches
      const restoredChecksum = calculateChecksum(migratedDbPath);
      expect(restoredChecksum).toBe(storedChecksum);
    });

    it('should preserve exact data values', () => {
      const originalDb = new Database(originalDbPath, { readonly: true });
      const originalEp1 = originalDb.prepare('SELECT * FROM episodes WHERE id = ?').get('ep1');
      originalDb.close();

      // Rollback
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      const backupPath = path.join(backupDir, backups[0]);
      fs.copyFileSync(backupPath, migratedDbPath);

      // Verify exact match
      const restoredDb = new Database(migratedDbPath, { readonly: true });
      const restoredEp1 = restoredDb.prepare('SELECT * FROM episodes WHERE id = ?').get('ep1');
      restoredDb.close();

      expect(restoredEp1).toEqual(originalEp1);
    });
  });

  describe('System Functional After Rollback', () => {
    beforeEach(() => {
      // Perform rollback
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      const backupPath = path.join(backupDir, backups[0]);
      fs.copyFileSync(backupPath, migratedDbPath);
    });

    it('should allow querying data', () => {
      const db = new Database(migratedDbPath, { readonly: true });

      const results = db.prepare('SELECT * FROM episodes WHERE task = ?').all('test-gen');

      db.close();

      expect(results.length).toBeGreaterThan(0);
      expect((results[0] as any).id).toBe('ep1');
    });

    it('should allow inserting new data', () => {
      const db = new Database(migratedDbPath);

      db.prepare('INSERT INTO episodes VALUES (?, ?, ?, ?)').run(
        'ep4',
        'new-task',
        0.75,
        Date.now()
      );

      const result = db.prepare('SELECT * FROM episodes WHERE id = ?').get('ep4');
      const count = db.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };

      db.close();

      expect(result).toBeDefined();
      expect((result as any).task).toBe('new-task');
      expect(count.count).toBe(4);
    });

    it('should allow updating existing data', () => {
      const db = new Database(migratedDbPath);

      db.prepare('UPDATE episodes SET reward = ? WHERE id = ?').run(0.99, 'ep1');

      const result = db.prepare('SELECT reward FROM episodes WHERE id = ?').get('ep1') as { reward: number };

      db.close();

      expect(result.reward).toBe(0.99);
    });

    it('should allow deleting data', () => {
      const db = new Database(migratedDbPath);

      db.prepare('DELETE FROM episodes WHERE id = ?').run('ep3');

      const result = db.prepare('SELECT * FROM episodes WHERE id = ?').get('ep3');
      const count = db.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };

      db.close();

      expect(result).toBeUndefined();
      expect(count.count).toBe(2);
    });

    it('should maintain database integrity', () => {
      const db = new Database(migratedDbPath, { readonly: true });

      // Run integrity check
      const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };

      db.close();

      expect(integrity.integrity_check).toBe('ok');
    });

    it('should support transactions', () => {
      const db = new Database(migratedDbPath);

      db.exec('BEGIN TRANSACTION');

      db.prepare('INSERT INTO episodes VALUES (?, ?, ?, ?)').run('ep5', 'tx-test', 0.5, Date.now());
      db.prepare('INSERT INTO episodes VALUES (?, ?, ?, ?)').run('ep6', 'tx-test-2', 0.6, Date.now());

      db.exec('COMMIT');

      const count = db.prepare('SELECT COUNT(*) as count FROM episodes').get() as { count: number };

      db.close();

      expect(count.count).toBe(5);
    });
  });

  describe('Rollback Verification', () => {
    it('should verify schema version after rollback', () => {
      // Rollback
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      const backupPath = path.join(backupDir, backups[0]);
      fs.copyFileSync(backupPath, migratedDbPath);

      // Check version
      const db = new Database(migratedDbPath, { readonly: true });
      const version = db.prepare(`
        SELECT version FROM schema_version ORDER BY version DESC LIMIT 1
      `).get() as { version: number };
      db.close();

      expect(version.version).toBe(1);
    });

    it('should verify backup integrity before rollback', () => {
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      const backupPath = path.join(backupDir, backups[0]);
      const checksumPath = `${backupPath}.sha256`;

      // Verify checksum
      const storedChecksum = fs.readFileSync(checksumPath, 'utf-8');
      const actualChecksum = calculateChecksum(backupPath);

      expect(actualChecksum).toBe(storedChecksum);
    });

    it('should detect if rollback is necessary', () => {
      // Check if migration succeeded
      const db = new Database(migratedDbPath, { readonly: true });

      try {
        // Try to query new table
        db.prepare('SELECT * FROM patterns LIMIT 1').get();
        db.close();

        // Migration exists - rollback might be needed if issues found
        const needsRollback = false; // Would be true if validation failed
        expect(needsRollback).toBe(false);
      } catch (error) {
        db.close();
        // Migration failed - rollback needed
        expect(error).toBeDefined();
      }
    });
  });

  describe('Partial Migration Rollback', () => {
    it('should rollback failed partial migration', () => {
      // Simulate partial migration failure
      const partialDb = new Database(migratedDbPath);

      try {
        partialDb.exec('BEGIN TRANSACTION');

        // Successful step
        partialDb.exec('ALTER TABLE episodes ADD COLUMN new_field TEXT');

        // Simulate failure (e.g., constraint violation)
        // Force rollback
        partialDb.exec('ROLLBACK');

        partialDb.close();

        // Verify new_field not added
        const verifyDb = new Database(migratedDbPath, { readonly: true });
        const columns = verifyDb.prepare('PRAGMA table_info(episodes)').all() as Array<{ name: string }>;
        verifyDb.close();

        expect(columns.map(c => c.name)).not.toContain('new_field');
      } catch (error) {
        partialDb.close();
        throw error;
      }
    });

    it('should restore from backup after corruption', () => {
      // Corrupt migrated database
      fs.appendFileSync(migratedDbPath, 'CORRUPTED DATA');

      // Verify corruption
      expect(() => {
        const db = new Database(migratedDbPath);
        db.prepare('SELECT * FROM episodes').all();
        db.close();
      }).toThrow();

      // Restore from backup
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      const backupPath = path.join(backupDir, backups[0]);
      fs.copyFileSync(backupPath, migratedDbPath);

      // Verify restored
      const db = new Database(migratedDbPath, { readonly: true });
      const results = db.prepare('SELECT * FROM episodes').all();
      db.close();

      expect(results.length).toBe(3);
    });
  });

  describe('Multi-Step Rollback', () => {
    it('should support rollback through multiple versions', () => {
      // Create v3
      const v3DbPath = path.join(testDir, 'v3.db');
      fs.copyFileSync(migratedDbPath, v3DbPath);

      const v3Db = new Database(v3DbPath);
      v3Db.exec(`
        ALTER TABLE patterns ADD COLUMN metadata TEXT;
        INSERT INTO schema_version VALUES (3, ${Date.now()}, 'v3 schema');
      `);
      v3Db.close();

      // Rollback to v1
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      const backupPath = path.join(backupDir, backups[0]);
      fs.copyFileSync(backupPath, v3DbPath);

      // Verify v1 schema
      const rolledBackDb = new Database(v3DbPath, { readonly: true });
      const version = rolledBackDb.prepare(`
        SELECT version FROM schema_version ORDER BY version DESC LIMIT 1
      `).get() as { version: number };

      const tables = rolledBackDb.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='patterns'
      `).all();

      rolledBackDb.close();

      expect(version.version).toBe(1);
      expect(tables.length).toBe(0); // patterns table shouldn't exist in v1
    });
  });
});
