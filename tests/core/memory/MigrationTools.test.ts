/**
 * MigrationTools Test Suite
 *
 * Comprehensive tests for AgentDB to RuVector migration utilities.
 *
 * @module tests/core/memory/MigrationTools.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  PatternMigrator,
  DualWriteProxy,
  checkMigrationStatus,
  type MigrationOptions,
  type MigrationResult,
} from '../../../src/core/memory/MigrationTools';
import {
  RuVectorPatternStore,
} from '../../../src/core/memory/RuVectorPatternStore';
import type { TestPattern } from '../../../src/core/memory/IPatternStore';

describe('MigrationTools', () => {
  const testDataDir = path.join(__dirname, '../../../data/test-migration');
  const testSourceDb = path.join(testDataDir, 'test-source.db');
  const testTargetPath = path.join(testDataDir, 'test-target.ruvector');

  beforeEach(async () => {
    // Create test data directory
    await fs.mkdir(testDataDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('PatternMigrator', () => {
    describe('validateSource', () => {
      it('should validate a valid SQLite database', async () => {
        // Create a minimal SQLite database
        const Database = require('better-sqlite3');
        const db = new Database(testSourceDb);
        db.exec(`
          CREATE TABLE IF NOT EXISTS patterns (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
          )
        `);
        db.close();

        const migrator = new PatternMigrator();
        const isValid = await migrator.validateSource(testSourceDb);

        expect(isValid).toBe(true);
      });

      it('should reject non-existent file', async () => {
        const migrator = new PatternMigrator();
        const isValid = await migrator.validateSource('/nonexistent/database.db');

        expect(isValid).toBe(false);
      });

      it('should reject non-SQLite file', async () => {
        const fakeDb = path.join(testDataDir, 'fake.db');
        await fs.writeFile(fakeDb, 'not a sqlite database');

        const migrator = new PatternMigrator();
        const isValid = await migrator.validateSource(fakeDb);

        expect(isValid).toBe(false);
      });
    });

    describe('migrate', () => {
      it('should perform dry-run migration without writing', async () => {
        // Create test database with sample patterns
        const Database = require('better-sqlite3');
        const db = new Database(testSourceDb);
        db.exec(`
          CREATE TABLE IF NOT EXISTS patterns (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL,
            framework TEXT NOT NULL,
            language TEXT NOT NULL,
            template TEXT NOT NULL,
            examples TEXT NOT NULL,
            confidence REAL NOT NULL,
            usage_count INTEGER NOT NULL,
            success_rate REAL NOT NULL,
            quality REAL,
            metadata TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
          )
        `);

        db.prepare(`
          INSERT INTO patterns VALUES (
            'test-pattern-1',
            'Sample Unit Test',
            'A sample unit test pattern',
            'unit',
            'jest',
            'typescript',
            'describe("{{name}}", () => { it("{{test}}", () => { expect(true).toBe(true); }); });',
            '["example1", "example2"]',
            0.95,
            100,
            0.98,
            0.9,
            '{"tag": "sample"}',
            '2025-01-01T00:00:00Z',
            '2025-01-02T00:00:00Z'
          )
        `).run();

        db.close();

        const migrator = new PatternMigrator();
        const result = await migrator.migrate({
          sourcePath: testSourceDb,
          targetPath: testTargetPath,
          dryRun: true,
          verbose: false,
        });

        expect(result.totalPatterns).toBe(1);
        expect(result.migratedCount).toBe(0); // Dry-run doesn't migrate
        expect(result.errors.length).toBe(0);
        expect(result.validation).toBeDefined();
        expect(result.validation?.sourceValid).toBe(true);

        // Verify target was not created
        await expect(fs.access(testTargetPath)).rejects.toThrow();
      });

      it('should migrate patterns to RuVector', async () => {
        // Create test database
        const Database = require('better-sqlite3');
        const db = new Database(testSourceDb);
        db.exec(`
          CREATE TABLE IF NOT EXISTS patterns (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL,
            framework TEXT NOT NULL,
            language TEXT NOT NULL,
            template TEXT NOT NULL,
            examples TEXT NOT NULL,
            confidence REAL NOT NULL,
            usage_count INTEGER NOT NULL,
            success_rate REAL NOT NULL,
            quality REAL,
            metadata TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
          )
        `);

        // Insert test patterns
        const stmt = db.prepare(`
          INSERT INTO patterns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (let i = 1; i <= 10; i++) {
          stmt.run(
            `test-pattern-${i}`,
            `Test Pattern ${i}`,
            `Description for pattern ${i}`,
            'unit',
            'jest',
            'typescript',
            'test template',
            JSON.stringify([`example${i}`]),
            0.9 + (i * 0.01),
            i * 10,
            0.95,
            0.85,
            JSON.stringify({ index: i }),
            '2025-01-01T00:00:00Z',
            '2025-01-02T00:00:00Z'
          );
        }

        db.close();

        const migrator = new PatternMigrator();
        const result = await migrator.migrate({
          sourcePath: testSourceDb,
          targetPath: testTargetPath,
          dryRun: false,
          batchSize: 5,
          verbose: false,
          createBackup: true,
        });

        expect(result.totalPatterns).toBe(10);
        expect(result.migratedCount).toBe(10);
        expect(result.skippedCount).toBe(0);
        expect(result.errors.length).toBe(0);
        expect(result.backupPath).toBeDefined();
        expect(result.validation?.targetValid).toBe(true);

        // Verify patterns can be retrieved
        const store = new RuVectorPatternStore({
          storagePath: testTargetPath,
          dimension: 384,
        });
        await store.initialize();
        const stats = await store.getStats();
        expect(stats.count).toBe(10);
        await store.shutdown();
      });

      it('should handle custom embedding generator', async () => {
        // Create test database with minimal pattern
        const Database = require('better-sqlite3');
        const db = new Database(testSourceDb);
        db.exec(`
          CREATE TABLE IF NOT EXISTS patterns (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL,
            framework TEXT NOT NULL,
            language TEXT NOT NULL,
            template TEXT NOT NULL,
            examples TEXT NOT NULL,
            confidence REAL NOT NULL,
            usage_count INTEGER NOT NULL,
            success_rate REAL NOT NULL,
            quality REAL,
            metadata TEXT NOT NULL
          )
        `);

        db.prepare(`
          INSERT INTO patterns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'custom-embed-test',
          'Custom Embedding Test',
          'Test custom embedding',
          'unit',
          'jest',
          'typescript',
          'test',
          '[]',
          0.9,
          10,
          0.95,
          0.8,
          '{}'
        );

        db.close();

        // Mock embedding generator
        const mockEmbedding = Array(384).fill(0.1);
        const generateEmbedding = vi.fn(async () => mockEmbedding);

        const migrator = new PatternMigrator();
        const result = await migrator.migrate({
          sourcePath: testSourceDb,
          targetPath: testTargetPath,
          generateEmbedding,
          verbose: false,
        });

        expect(result.totalPatterns).toBe(1);
        expect(generateEmbedding).toHaveBeenCalledTimes(1);
      });
    });

    describe('rollback', () => {
      it('should rollback from backup', async () => {
        // Create original database
        const Database = require('better-sqlite3');
        const db = new Database(testSourceDb);
        db.exec(`
          CREATE TABLE IF NOT EXISTS patterns (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
          )
        `);
        db.prepare('INSERT INTO patterns VALUES (?, ?)').run('original', 'Original Pattern');
        db.close();

        // Perform migration with backup
        const migrator = new PatternMigrator();
        const result = await migrator.migrate({
          sourcePath: testSourceDb,
          targetPath: testTargetPath,
          createBackup: true,
          verbose: false,
        });

        expect(result.backupPath).toBeDefined();

        // Modify database
        const db2 = new Database(testSourceDb);
        db2.prepare('DELETE FROM patterns WHERE id = ?').run('original');
        db2.prepare('INSERT INTO patterns VALUES (?, ?)').run('modified', 'Modified Pattern');
        db2.close();

        // Rollback
        await migrator.rollback();

        // Verify restoration
        const db3 = new Database(testSourceDb, { readonly: true });
        const row = db3.prepare('SELECT * FROM patterns WHERE id = ?').get('original');
        expect(row).toBeDefined();
        expect((row as any).name).toBe('Original Pattern');
        db3.close();
      });

      it('should throw error when no backup exists', async () => {
        const migrator = new PatternMigrator();
        await expect(migrator.rollback()).rejects.toThrow('No backup available');
      });
    });
  });

  describe('DualWriteProxy', () => {
    it('should write to both stores', async () => {
      const primaryStore = new RuVectorPatternStore({
        storagePath: path.join(testDataDir, 'primary.ruvector'),
        dimension: 384,
      });

      const secondaryStore = new RuVectorPatternStore({
        storagePath: path.join(testDataDir, 'secondary.ruvector'),
        dimension: 384,
      });

      const proxy = new DualWriteProxy(primaryStore, secondaryStore);
      await proxy.initialize();

      const testPattern: TestPattern = {
        id: 'dual-write-test',
        type: 'unit',
        domain: 'jest',
        embedding: Array(384).fill(0.1),
        content: 'Test pattern for dual write',
        framework: 'jest',
        coverage: 0.9,
      };

      await proxy.storePattern(testPattern);

      // Verify both stores have the pattern
      const primaryPattern = await primaryStore.getPattern('dual-write-test');
      const secondaryPattern = await secondaryStore.getPattern('dual-write-test');

      expect(primaryPattern).toBeDefined();
      expect(secondaryPattern).toBeDefined();
      expect(primaryPattern?.id).toBe('dual-write-test');
      expect(secondaryPattern?.id).toBe('dual-write-test');

      await proxy.shutdown();
    });

    it('should read from primary with fallback to secondary', async () => {
      const primaryStore = new RuVectorPatternStore({
        storagePath: path.join(testDataDir, 'primary.ruvector'),
        dimension: 384,
      });

      const secondaryStore = new RuVectorPatternStore({
        storagePath: path.join(testDataDir, 'secondary.ruvector'),
        dimension: 384,
      });

      await primaryStore.initialize();
      await secondaryStore.initialize();

      const testPattern: TestPattern = {
        id: 'fallback-test',
        type: 'unit',
        domain: 'jest',
        embedding: Array(384).fill(0.1),
        content: 'Test fallback',
        framework: 'jest',
      };

      // Store only in secondary
      await secondaryStore.storePattern(testPattern);

      const proxy = new DualWriteProxy(primaryStore, secondaryStore);
      await proxy.initialize();

      // Should fallback to secondary
      const pattern = await proxy.getPattern('fallback-test');
      expect(pattern).toBeDefined();
      expect(pattern?.id).toBe('fallback-test');

      await proxy.shutdown();
    });

    it('should delete from both stores', async () => {
      const primaryStore = new RuVectorPatternStore({
        storagePath: path.join(testDataDir, 'primary.ruvector'),
        dimension: 384,
      });

      const secondaryStore = new RuVectorPatternStore({
        storagePath: path.join(testDataDir, 'secondary.ruvector'),
        dimension: 384,
      });

      const proxy = new DualWriteProxy(primaryStore, secondaryStore);
      await proxy.initialize();

      const testPattern: TestPattern = {
        id: 'delete-test',
        type: 'unit',
        domain: 'jest',
        embedding: Array(384).fill(0.1),
        content: 'Test delete',
        framework: 'jest',
      };

      await proxy.storePattern(testPattern);

      // Delete
      const deleted = await proxy.deletePattern('delete-test');
      expect(deleted).toBe(true);

      // Verify both stores deleted
      const primaryPattern = await primaryStore.getPattern('delete-test');
      const secondaryPattern = await secondaryStore.getPattern('delete-test');

      expect(primaryPattern).toBeNull();
      expect(secondaryPattern).toBeNull();

      await proxy.shutdown();
    });
  });

  describe('checkMigrationStatus', () => {
    it('should check migration progress', async () => {
      // Create source database with patterns
      const Database = require('better-sqlite3');
      const db = new Database(testSourceDb);
      db.exec(`
        CREATE TABLE IF NOT EXISTS patterns (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT NOT NULL,
          framework TEXT NOT NULL,
          language TEXT NOT NULL,
          template TEXT NOT NULL,
          examples TEXT NOT NULL,
          confidence REAL NOT NULL,
          usage_count INTEGER NOT NULL,
          success_rate REAL NOT NULL,
          quality REAL,
          metadata TEXT NOT NULL
        )
      `);

      const stmt = db.prepare(`
        INSERT INTO patterns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 1; i <= 100; i++) {
        stmt.run(
          `pattern-${i}`,
          `Pattern ${i}`,
          'Description',
          'unit',
          'jest',
          'typescript',
          'template',
          '[]',
          0.9,
          10,
          0.95,
          0.8,
          '{}'
        );
      }

      db.close();

      // Migrate half the patterns
      const migrator = new PatternMigrator();
      await migrator.migrate({
        sourcePath: testSourceDb,
        targetPath: testTargetPath,
        batchSize: 50,
        verbose: false,
      });

      // Check status
      const status = await checkMigrationStatus(testSourceDb, testTargetPath);

      expect(status.sourceCount).toBe(100);
      expect(status.targetCount).toBe(100); // All should be migrated
      expect(status.migrationComplete).toBe(true);
      expect(status.coverage).toBeGreaterThan(0.99);
    });
  });
});
