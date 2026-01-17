/**
 * Schema Version Tests
 * Tests database schema versioning, upgrades, and rollback compatibility
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';

describe('Schema Version Management', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    testDir = path.join(__dirname, '../.tmp/schema-version-test-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });
    dbPath = path.join(testDir, 'test.db');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Version Table', () => {
    it('should create schema_version table', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );
      `);

      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'
      `).all() as Array<{ name: string }>;

      db.close();

      expect(tables.length).toBe(1);
      expect(tables[0].name).toBe('schema_version');
    });

    it('should insert initial version', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        INSERT INTO schema_version (version, applied_at, description)
        VALUES (1, ${Date.now()}, 'Initial schema');
      `);

      const version = db.prepare('SELECT * FROM schema_version WHERE version = 1').get();
      db.close();

      expect(version).toBeDefined();
      expect((version as any).version).toBe(1);
      expect((version as any).description).toBe('Initial schema');
    });

    it('should track multiple schema versions', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        INSERT INTO schema_version VALUES
          (1, ${Date.now()}, 'Initial schema'),
          (2, ${Date.now() + 1000}, 'Add patterns table'),
          (3, ${Date.now() + 2000}, 'Add learning_experiences table');
      `);

      const versions = db.prepare('SELECT * FROM schema_version ORDER BY version').all();
      db.close();

      expect(versions.length).toBe(3);
      expect((versions[0] as any).description).toBe('Initial schema');
      expect((versions[2] as any).description).toBe('Add learning_experiences table');
    });
  });

  describe('Version Queries', () => {
    beforeEach(() => {
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        INSERT INTO schema_version VALUES
          (1, ${Date.now() - 10000}, 'Initial schema'),
          (2, ${Date.now() - 5000}, 'Add indexes'),
          (3, ${Date.now()}, 'Add metadata columns');
      `);
      db.close();
    });

    it('should get current schema version', () => {
      const db = new Database(dbPath, { readonly: true });

      const currentVersion = db.prepare(`
        SELECT version FROM schema_version ORDER BY version DESC LIMIT 1
      `).get() as { version: number };

      db.close();

      expect(currentVersion.version).toBe(3);
    });

    it('should check if version is applied', () => {
      const db = new Database(dbPath, { readonly: true });

      const version2 = db.prepare('SELECT * FROM schema_version WHERE version = 2').get();
      const version4 = db.prepare('SELECT * FROM schema_version WHERE version = 4').get();

      db.close();

      expect(version2).toBeDefined();
      expect(version4).toBeUndefined();
    });

    it('should get version history', () => {
      const db = new Database(dbPath, { readonly: true });

      const history = db.prepare(`
        SELECT version, description, applied_at
        FROM schema_version
        ORDER BY version
      `).all();

      db.close();

      expect(history.length).toBe(3);
      expect((history[0] as any).version).toBe(1);
      expect((history[1] as any).version).toBe(2);
      expect((history[2] as any).version).toBe(3);
    });
  });

  describe('Schema Upgrades', () => {
    it('should apply schema upgrade from v1 to v2', () => {
      const db = new Database(dbPath);

      // Create v1 schema
      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        CREATE TABLE episodes (
          id TEXT PRIMARY KEY,
          task TEXT,
          reward REAL
        );

        INSERT INTO schema_version VALUES (1, ${Date.now()}, 'Initial schema');
      `);

      // Upgrade to v2: add success column
      db.exec(`
        ALTER TABLE episodes ADD COLUMN success INTEGER DEFAULT 0;

        INSERT INTO schema_version VALUES (2, ${Date.now()}, 'Add success column');
      `);

      const columns = db.prepare('PRAGMA table_info(episodes)').all() as Array<{
        name: string;
        type: string;
      }>;

      const currentVersion = db.prepare(`
        SELECT version FROM schema_version ORDER BY version DESC LIMIT 1
      `).get() as { version: number };

      db.close();

      const columnNames = columns.map(col => col.name);
      expect(columnNames).toContain('success');
      expect(currentVersion.version).toBe(2);
    });

    it('should apply multiple sequential upgrades', () => {
      const db = new Database(dbPath);

      // v1
      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        CREATE TABLE episodes (id TEXT PRIMARY KEY);
        INSERT INTO schema_version VALUES (1, ${Date.now()}, 'v1');
      `);

      // v2
      db.exec(`
        ALTER TABLE episodes ADD COLUMN task TEXT;
        INSERT INTO schema_version VALUES (2, ${Date.now()}, 'v2');
      `);

      // v3
      db.exec(`
        ALTER TABLE episodes ADD COLUMN reward REAL;
        INSERT INTO schema_version VALUES (3, ${Date.now()}, 'v3');
      `);

      const currentVersion = db.prepare(`
        SELECT version FROM schema_version ORDER BY version DESC LIMIT 1
      `).get() as { version: number };

      const columns = db.prepare('PRAGMA table_info(episodes)').all() as Array<{ name: string }>;
      db.close();

      expect(currentVersion.version).toBe(3);
      expect(columns.map(c => c.name)).toEqual(['id', 'task', 'reward']);
    });

    it('should track upgrade timestamps', () => {
      const db = new Database(dbPath);
      const baseTime = Date.now();

      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        INSERT INTO schema_version VALUES
          (1, ${baseTime}, 'v1'),
          (2, ${baseTime + 1000}, 'v2'),
          (3, ${baseTime + 2000}, 'v3');
      `);

      const versions = db.prepare('SELECT * FROM schema_version ORDER BY version').all() as Array<{
        version: number;
        applied_at: number;
      }>;

      db.close();

      expect(versions[0].applied_at).toBeLessThan(versions[1].applied_at);
      expect(versions[1].applied_at).toBeLessThan(versions[2].applied_at);
    });
  });

  describe('Rollback Compatibility', () => {
    it('should identify schema version for rollback', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        INSERT INTO schema_version VALUES
          (1, ${Date.now()}, 'v1'),
          (2, ${Date.now()}, 'v2'),
          (3, ${Date.now()}, 'v3');
      `);

      // Simulate rollback to v2
      const targetVersion = 2;
      const version = db.prepare('SELECT * FROM schema_version WHERE version = ?').get(targetVersion);

      db.close();

      expect(version).toBeDefined();
      expect((version as any).version).toBe(2);
    });

    it('should validate rollback is possible', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        INSERT INTO schema_version VALUES
          (1, ${Date.now()}, 'v1'),
          (2, ${Date.now()}, 'v2');
      `);

      const currentVersion = db.prepare(`
        SELECT version FROM schema_version ORDER BY version DESC LIMIT 1
      `).get() as { version: number };

      const targetVersion = 1;
      const canRollback = targetVersion < currentVersion.version;

      db.close();

      expect(canRollback).toBe(true);
    });

    it('should prevent invalid rollback attempts', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        INSERT INTO schema_version VALUES (1, ${Date.now()}, 'v1');
      `);

      const currentVersion = db.prepare(`
        SELECT version FROM schema_version ORDER BY version DESC LIMIT 1
      `).get() as { version: number };

      const targetVersion = 2;
      const canRollback = targetVersion < currentVersion.version;

      db.close();

      expect(canRollback).toBe(false);
    });
  });

  describe('Migration Safety', () => {
    it('should prevent duplicate version application', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        INSERT INTO schema_version VALUES (1, ${Date.now()}, 'v1');
      `);

      // Try to insert duplicate version
      expect(() => {
        db.exec(`INSERT INTO schema_version VALUES (1, ${Date.now()}, 'duplicate')`);
      }).toThrow();

      db.close();
    });

    it('should require sequential version application', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        INSERT INTO schema_version VALUES (1, ${Date.now()}, 'v1');
      `);

      // Check if v2 is next
      const currentVersion = db.prepare(`
        SELECT version FROM schema_version ORDER BY version DESC LIMIT 1
      `).get() as { version: number };

      const nextVersion = 3;
      const isSequential = nextVersion === currentVersion.version + 1;

      db.close();

      expect(isSequential).toBe(false);
    });
  });

  describe('Version Metadata', () => {
    it('should store migration descriptions', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        INSERT INTO schema_version VALUES
          (1, ${Date.now()}, 'Initial schema with episodes table'),
          (2, ${Date.now()}, 'Add patterns table for learning'),
          (3, ${Date.now()}, 'Add indexes for performance');
      `);

      const versions = db.prepare('SELECT version, description FROM schema_version ORDER BY version').all();
      db.close();

      expect((versions[0] as any).description).toContain('Initial schema');
      expect((versions[1] as any).description).toContain('patterns table');
      expect((versions[2] as any).description).toContain('indexes');
    });

    it('should allow querying versions by description', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );

        INSERT INTO schema_version VALUES
          (1, ${Date.now()}, 'Add episodes table'),
          (2, ${Date.now()}, 'Add patterns table');
      `);

      const version = db.prepare(`
        SELECT * FROM schema_version WHERE description LIKE '%patterns%'
      `).get();

      db.close();

      expect(version).toBeDefined();
      expect((version as any).version).toBe(2);
    });
  });
});
