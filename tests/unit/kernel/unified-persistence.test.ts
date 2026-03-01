/**
 * Agentic QE v3 - Unified Persistence Manager Unit Tests
 * Milestone 2.2: Test persistence facade over UnifiedMemoryManager
 *
 * Tests cover:
 * - Singleton pattern and instance management
 * - Initialization as facade over UnifiedMemoryManager
 * - Database access and statistics
 * - Prepared statement caching
 * - Transaction support
 * - Maintenance operations (vacuum, checkpoint)
 * - Disposal and cleanup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  UnifiedPersistenceManager,
  getUnifiedPersistence,
  initializeUnifiedPersistence,
  resetUnifiedPersistence,
  DEFAULT_UNIFIED_CONFIG,
} from '../../../src/kernel/unified-persistence';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_DB_DIR = '/tmp/aqe-persistence-test-' + Date.now();

function getTestDbPath(suffix = ''): string {
  return path.join(TEST_DB_DIR, `memory${suffix}.db`);
}

function cleanupTestDir(): void {
  try {
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Unified Persistence Manager Tests
// ============================================================================

describe('UnifiedPersistenceManager', () => {
  beforeEach(() => {
    resetUnifiedPersistence();
    resetUnifiedMemory();
    cleanupTestDir();
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(() => {
    resetUnifiedPersistence();
    resetUnifiedMemory();
    cleanupTestDir();
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return same instance from getInstance', () => {
      const instance1 = UnifiedPersistenceManager.getInstance({ dbPath: getTestDbPath() });
      const instance2 = UnifiedPersistenceManager.getInstance({ dbPath: getTestDbPath() });

      expect(instance1).toBe(instance2);
    });

    it('should return same instance from getInstanceAsync', async () => {
      const [instance1, instance2] = await Promise.all([
        UnifiedPersistenceManager.getInstanceAsync({ dbPath: getTestDbPath() }),
        UnifiedPersistenceManager.getInstanceAsync({ dbPath: getTestDbPath() }),
      ]);

      expect(instance1).toBe(instance2);
      expect(instance1.isInitialized()).toBe(true);
    });

    it('should reset instance with resetInstance', async () => {
      const instance1 = await UnifiedPersistenceManager.getInstanceAsync({ dbPath: getTestDbPath() });

      UnifiedPersistenceManager.resetInstance();

      const instance2 = UnifiedPersistenceManager.getInstance({ dbPath: getTestDbPath('-2') });

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // Convenience Functions Tests
  // ===========================================================================

  describe('Convenience Functions', () => {
    it('should get persistence via getUnifiedPersistence', () => {
      const instance = getUnifiedPersistence({ dbPath: getTestDbPath() });

      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(UnifiedPersistenceManager);
    });

    it('should initialize via initializeUnifiedPersistence', async () => {
      const instance = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

      expect(instance.isInitialized()).toBe(true);
    });

    it('should reset via resetUnifiedPersistence', async () => {
      await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

      resetUnifiedPersistence();

      const newInstance = getUnifiedPersistence({ dbPath: getTestDbPath('-new') });
      expect(newInstance.isInitialized()).toBe(false);
    });
  });

  // ===========================================================================
  // Default Configuration Tests
  // ===========================================================================

  describe('Default Configuration', () => {
    it('should use default config values', () => {
      expect(DEFAULT_UNIFIED_CONFIG.walMode).toBe(true);
      expect(DEFAULT_UNIFIED_CONFIG.mmapSize).toBe(64 * 1024 * 1024);
      expect(DEFAULT_UNIFIED_CONFIG.busyTimeout).toBe(5000);
    });

    it('should return db path', async () => {
      const dbPath = getTestDbPath();
      const manager = await initializeUnifiedPersistence({ dbPath });

      expect(manager.getDbPath()).toBe(dbPath);
    });
  });

  // ===========================================================================
  // Initialization Tests
  // ===========================================================================

  describe('Initialization', () => {
    it('should initialize and delegate to UnifiedMemoryManager', async () => {
      const manager = getUnifiedPersistence({ dbPath: getTestDbPath() });

      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(fs.existsSync(getTestDbPath())).toBe(true);
    });

    it('should be idempotent', async () => {
      const manager = getUnifiedPersistence({ dbPath: getTestDbPath() });

      await manager.initialize();
      await manager.initialize();
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
    });

    it('should handle concurrent initialization safely', async () => {
      const manager = getUnifiedPersistence({ dbPath: getTestDbPath() });

      const results = await Promise.allSettled([
        manager.initialize(),
        manager.initialize(),
        manager.initialize(),
      ]);

      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
      expect(manager.isInitialized()).toBe(true);
    });
  });

  // ===========================================================================
  // Database Access Tests
  // ===========================================================================

  describe('Database Access', () => {
    it('should provide raw database access', async () => {
      const manager = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

      const db = manager.getDatabase();

      expect(db).toBeDefined();
      const result = db.prepare('SELECT 1 as value').get() as { value: number };
      expect(result.value).toBe(1);
    });

    it('should throw when accessing database before init', () => {
      const manager = getUnifiedPersistence({ dbPath: getTestDbPath() });

      expect(() => manager.getDatabase()).toThrow(/not initialized/i);
    });

    it('should have access to all unified memory tables', async () => {
      const manager = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

      const db = manager.getDatabase();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all() as Array<{ name: string }>;

      const tableNames = tables.map(t => t.name);

      // Should have key tables from unified memory
      expect(tableNames).toContain('kv_store');
      expect(tableNames).toContain('vectors');
      expect(tableNames).toContain('schema_version');
    });
  });

  // ===========================================================================
  // Prepared Statement Tests
  // ===========================================================================

  describe('Prepared Statements', () => {
    it('should prepare and cache statements', async () => {
      const manager = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

      const stmt1 = manager.prepare('test-query', 'SELECT 1 as value');
      const stmt2 = manager.prepare('test-query', 'SELECT 1 as value');

      expect(stmt1).toBe(stmt2);
    });

    it('should throw when preparing before init', () => {
      const manager = getUnifiedPersistence({ dbPath: getTestDbPath() });

      expect(() => manager.prepare('test', 'SELECT 1')).toThrow(/not initialized/i);
    });
  });

  // ===========================================================================
  // Transaction Tests
  // ===========================================================================

  describe('Transactions', () => {
    it('should execute transaction', async () => {
      const manager = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

      const result = manager.transaction(() => {
        const db = manager.getDatabase();
        db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)").run('k1', 'ns', '"v1"');
        db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)").run('k2', 'ns', '"v2"');
        return 'done';
      });

      expect(result).toBe('done');

      // Verify data was inserted
      const db = manager.getDatabase();
      const row = db.prepare("SELECT value FROM kv_store WHERE key = ? AND namespace = ?").get('k1', 'ns') as { value: string } | undefined;
      expect(row?.value).toBe('"v1"');
    });

    it('should rollback on error', async () => {
      const manager = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

      try {
        manager.transaction(() => {
          const db = manager.getDatabase();
          db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)").run('k1', 'ns', '"v1"');
          throw new Error('Rollback test');
        });
      } catch {
        // Expected
      }

      // Data should not be present
      const db = manager.getDatabase();
      const row = db.prepare("SELECT value FROM kv_store WHERE key = ? AND namespace = ?").get('k1', 'ns');
      expect(row).toBeUndefined();
    });

    it('should throw when transaction called before init', () => {
      const manager = getUnifiedPersistence({ dbPath: getTestDbPath() });

      expect(() => manager.transaction(() => 'test')).toThrow(/not initialized/i);
    });
  });

  // ===========================================================================
  // Statistics Tests
  // ===========================================================================

  describe('Statistics', () => {
    it('should return database stats', async () => {
      const manager = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

      const stats = manager.getStats();

      expect(stats.tables).toBeDefined();
      expect(stats.fileSize).toBeGreaterThanOrEqual(0);
      expect(stats.walSize).toBeGreaterThanOrEqual(0);
    });

    it('should include table row counts', async () => {
      const manager = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

      // Insert some data
      const db = manager.getDatabase();
      db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)").run('k1', 'ns', '"v1"');
      db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)").run('k2', 'ns', '"v2"');

      const stats = manager.getStats();
      const kvTable = stats.tables.find(t => t.name === 'kv_store');

      expect(kvTable?.rowCount).toBe(2);
    });

    it('should throw when getting stats before init', () => {
      const manager = getUnifiedPersistence({ dbPath: getTestDbPath() });

      expect(() => manager.getStats()).toThrow(/not initialized/i);
    });
  });

  // ===========================================================================
  // Maintenance Operations Tests
  // ===========================================================================

  describe('Maintenance Operations', () => {
    describe('vacuum', () => {
      it('should vacuum database', async () => {
        const manager = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

        // Add and delete some data
        const db = manager.getDatabase();
        db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)").run('k1', 'ns', '"v1"');
        db.prepare("DELETE FROM kv_store WHERE key = ?").run('k1');

        // Should not throw
        manager.vacuum();
      });

      it('should throw when vacuuming before init', () => {
        const manager = getUnifiedPersistence({ dbPath: getTestDbPath() });

        expect(() => manager.vacuum()).toThrow(/not initialized/i);
      });
    });

    describe('checkpoint', () => {
      it('should checkpoint WAL', async () => {
        const manager = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

        // Add some data
        const db = manager.getDatabase();
        db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)").run('k1', 'ns', '"v1"');

        // Should not throw
        manager.checkpoint();
      });

      it('should throw when checkpointing before init', () => {
        const manager = getUnifiedPersistence({ dbPath: getTestDbPath() });

        expect(() => manager.checkpoint()).toThrow(/not initialized/i);
      });
    });
  });

  // ===========================================================================
  // Close Tests
  // ===========================================================================

  describe('Close', () => {
    it('should close the facade', async () => {
      const manager = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });
      expect(manager.isInitialized()).toBe(true);

      manager.close();

      expect(manager.isInitialized()).toBe(false);
    });

    it('should allow re-initialization after close', async () => {
      const manager = await initializeUnifiedPersistence({ dbPath: getTestDbPath() });

      manager.close();

      // Re-initialize with new instance
      resetUnifiedPersistence();
      resetUnifiedMemory();

      const newManager = await initializeUnifiedPersistence({ dbPath: getTestDbPath('-new') });
      expect(newManager.isInitialized()).toBe(true);
    });
  });

  // ===========================================================================
  // Integration with UnifiedMemoryManager Tests
  // ===========================================================================

  describe('Integration with UnifiedMemoryManager', () => {
    it('should share database with unified memory', async () => {
      const dbPath = getTestDbPath();
      const manager = await initializeUnifiedPersistence({ dbPath });

      // Insert via persistence manager
      const db = manager.getDatabase();
      db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)").run('shared-key', 'ns', '"shared-value"');

      // Should be visible in the same database
      const row = db.prepare("SELECT value FROM kv_store WHERE key = ?").get('shared-key') as { value: string } | undefined;
      expect(row?.value).toBe('"shared-value"');
    });

    it('should use same database file as unified memory', async () => {
      const dbPath = getTestDbPath();
      const manager = await initializeUnifiedPersistence({ dbPath });

      expect(manager.getDbPath()).toBe(dbPath);
      expect(fs.existsSync(dbPath)).toBe(true);
    });
  });
});
