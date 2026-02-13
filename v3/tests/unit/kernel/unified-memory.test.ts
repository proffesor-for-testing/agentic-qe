/**
 * Agentic QE v3 - Unified Memory Manager Unit Tests
 * Milestone 2.2: Test unified memory initialization, KV operations, and vector storage
 *
 * Tests cover:
 * - Singleton pattern and instance management
 * - Database initialization and schema migrations
 * - KV store operations (set, get, delete, search, cleanup)
 * - Vector operations (store, get, delete, search, count)
 * - Statistics and maintenance operations
 * - Thread safety (Promise locks)
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  UnifiedMemoryManager,
  getUnifiedMemory,
  initializeUnifiedMemory,
  resetUnifiedMemory,
  DEFAULT_UNIFIED_MEMORY_CONFIG,
} from '../../../src/kernel/unified-memory';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_DB_DIR = '/tmp/aqe-unified-memory-test-' + Date.now();

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
// Unified Memory Manager Tests
// ============================================================================

describe('UnifiedMemoryManager', () => {
  beforeEach(() => {
    resetUnifiedMemory();
    cleanupTestDir();
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(() => {
    resetUnifiedMemory();
    cleanupTestDir();
  });

  // ===========================================================================
  // Singleton Pattern Tests
  // ===========================================================================

  describe('Singleton Pattern', () => {
    it('should return same instance from getInstance', () => {
      const instance1 = UnifiedMemoryManager.getInstance({ dbPath: getTestDbPath() });
      const instance2 = UnifiedMemoryManager.getInstance({ dbPath: getTestDbPath() });

      expect(instance1).toBe(instance2);
    });

    it('should return same instance from getInstanceAsync', async () => {
      const [instance1, instance2] = await Promise.all([
        UnifiedMemoryManager.getInstanceAsync({ dbPath: getTestDbPath() }),
        UnifiedMemoryManager.getInstanceAsync({ dbPath: getTestDbPath() }),
      ]);

      expect(instance1).toBe(instance2);
    });

    it('should reset instance with resetInstance', async () => {
      const instance1 = await UnifiedMemoryManager.getInstanceAsync({ dbPath: getTestDbPath() });

      UnifiedMemoryManager.resetInstance();

      const instance2 = UnifiedMemoryManager.getInstance({ dbPath: getTestDbPath('-2') });

      expect(instance1).not.toBe(instance2);
    });

    it('should use default config values', () => {
      expect(DEFAULT_UNIFIED_MEMORY_CONFIG.dbPath).toBe('.agentic-qe/memory.db');
      expect(DEFAULT_UNIFIED_MEMORY_CONFIG.walMode).toBe(true);
      expect(DEFAULT_UNIFIED_MEMORY_CONFIG.vectorDimensions).toBe(768);
    });
  });

  // ===========================================================================
  // Convenience Functions Tests
  // ===========================================================================

  describe('Convenience Functions', () => {
    it('should get unified memory via getUnifiedMemory', () => {
      const instance = getUnifiedMemory({ dbPath: getTestDbPath() });

      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(UnifiedMemoryManager);
    });

    it('should initialize via initializeUnifiedMemory', async () => {
      const instance = await initializeUnifiedMemory({ dbPath: getTestDbPath() });

      expect(instance.isInitialized()).toBe(true);
    });

    it('should reset via resetUnifiedMemory', async () => {
      await initializeUnifiedMemory({ dbPath: getTestDbPath() });

      resetUnifiedMemory();

      const newInstance = getUnifiedMemory({ dbPath: getTestDbPath('-new') });
      expect(newInstance.isInitialized()).toBe(false);
    });
  });

  // ===========================================================================
  // Initialization Tests
  // ===========================================================================

  describe('Initialization', () => {
    it('should initialize database', async () => {
      const manager = getUnifiedMemory({ dbPath: getTestDbPath() });

      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(fs.existsSync(getTestDbPath())).toBe(true);
    });

    it('should create parent directory if missing', async () => {
      const nestedPath = path.join(TEST_DB_DIR, 'nested', 'deep', 'memory.db');
      const manager = getUnifiedMemory({ dbPath: nestedPath });

      await manager.initialize();

      expect(fs.existsSync(path.dirname(nestedPath))).toBe(true);
    });

    it('should be idempotent', async () => {
      const manager = getUnifiedMemory({ dbPath: getTestDbPath() });

      await manager.initialize();
      await manager.initialize();
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
    });

    it('should run schema migrations', async () => {
      const manager = getUnifiedMemory({ dbPath: getTestDbPath() });
      await manager.initialize();

      const db = manager.getDatabase();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all() as Array<{ name: string }>;

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('kv_store');
      expect(tableNames).toContain('vectors');
      expect(tableNames).toContain('schema_version');
    });
  });

  // ===========================================================================
  // KV Store Operations Tests
  // ===========================================================================

  describe('KV Store Operations', () => {
    let manager: UnifiedMemoryManager;

    beforeEach(async () => {
      manager = await initializeUnifiedMemory({ dbPath: getTestDbPath() });
    });

    describe('kvSet and kvGet', () => {
      it('should store and retrieve a string', async () => {
        await manager.kvSet('key1', 'value1');

        const value = await manager.kvGet<string>('key1');
        expect(value).toBe('value1');
      });

      it('should store and retrieve an object', async () => {
        const obj = { name: 'test', count: 42, nested: { a: 1 } };
        await manager.kvSet('key1', obj);

        const value = await manager.kvGet<typeof obj>('key1');
        expect(value).toEqual(obj);
      });

      it('should store and retrieve with namespace', async () => {
        await manager.kvSet('key1', 'value1', 'ns1');
        await manager.kvSet('key1', 'value2', 'ns2');

        expect(await manager.kvGet<string>('key1', 'ns1')).toBe('value1');
        expect(await manager.kvGet<string>('key1', 'ns2')).toBe('value2');
      });

      it('should return undefined for non-existent key', async () => {
        const value = await manager.kvGet<string>('nonexistent');
        expect(value).toBeUndefined();
      });

      it('should handle TTL expiration', async () => {
        await manager.kvSet('key1', 'value1', 'default', 1); // 1 second TTL

        expect(await manager.kvGet<string>('key1')).toBe('value1');

        await new Promise(resolve => setTimeout(resolve, 1100));

        expect(await manager.kvGet<string>('key1')).toBeUndefined();
      });
    });

    describe('kvDelete', () => {
      it('should delete existing key', async () => {
        await manager.kvSet('key1', 'value1');

        const deleted = await manager.kvDelete('key1');

        expect(deleted).toBe(true);
        expect(await manager.kvGet<string>('key1')).toBeUndefined();
      });

      it('should return false for non-existent key', async () => {
        const deleted = await manager.kvDelete('nonexistent');
        expect(deleted).toBe(false);
      });

      it('should delete from specific namespace', async () => {
        await manager.kvSet('key1', 'value1', 'ns1');
        await manager.kvSet('key1', 'value2', 'ns2');

        await manager.kvDelete('key1', 'ns1');

        expect(await manager.kvGet<string>('key1', 'ns1')).toBeUndefined();
        expect(await manager.kvGet<string>('key1', 'ns2')).toBe('value2');
      });
    });

    describe('kvExists', () => {
      it('should return true for existing key', async () => {
        await manager.kvSet('key1', 'value1');

        const exists = await manager.kvExists('key1');
        expect(exists).toBe(true);
      });

      it('should return false for non-existent key', async () => {
        const exists = await manager.kvExists('nonexistent');
        expect(exists).toBe(false);
      });

      it('should return false for expired key', async () => {
        await manager.kvSet('key1', 'value1', 'default', 1);

        await new Promise(resolve => setTimeout(resolve, 1100));

        const exists = await manager.kvExists('key1');
        expect(exists).toBe(false);
      });
    });

    describe('kvSearch', () => {
      beforeEach(async () => {
        await manager.kvSet('user:1', { name: 'Alice' }, 'users');
        await manager.kvSet('user:2', { name: 'Bob' }, 'users');
        await manager.kvSet('order:1', { item: 'Book' }, 'users');
      });

      it('should search keys by pattern', async () => {
        const keys = await manager.kvSearch('user:*', 'users');

        expect(keys).toContain('user:1');
        expect(keys).toContain('user:2');
        expect(keys).not.toContain('order:1');
      });

      it('should respect limit', async () => {
        const keys = await manager.kvSearch('*', 'users', 2);

        expect(keys).toHaveLength(2);
      });

      it('should return empty for no matches', async () => {
        const keys = await manager.kvSearch('product:*', 'users');

        expect(keys).toHaveLength(0);
      });
    });

    describe('kvCleanupExpired', () => {
      it('should remove expired entries', async () => {
        await manager.kvSet('key1', 'value1', 'default', 1);
        await manager.kvSet('key2', 'value2'); // No expiration

        await new Promise(resolve => setTimeout(resolve, 1100));

        const cleaned = await manager.kvCleanupExpired();

        expect(cleaned).toBe(1);
        expect(await manager.kvGet<string>('key1')).toBeUndefined();
        expect(await manager.kvGet<string>('key2')).toBe('value2');
      });
    });
  });

  // ===========================================================================
  // Vector Operations Tests
  // ===========================================================================

  describe('Vector Operations', () => {
    let manager: UnifiedMemoryManager;

    beforeEach(async () => {
      manager = await initializeUnifiedMemory({ dbPath: getTestDbPath() });
    });

    describe('vectorStore', () => {
      it('should store a vector', async () => {
        await manager.vectorStore('v1', [0.1, 0.2, 0.3]);

        const count = await manager.vectorCount();
        expect(count).toBe(1);
      });

      it('should store vector with metadata', async () => {
        await manager.vectorStore('v1', [0.1, 0.2, 0.3], 'default', { label: 'test' });

        const result = await manager.vectorGet('v1');
        expect(result?.metadata).toEqual({ label: 'test' });
      });

      it('should update existing vector', async () => {
        await manager.vectorStore('v1', [0.1, 0.2, 0.3]);
        await manager.vectorStore('v1', [0.4, 0.5, 0.6], 'default', { updated: true });

        const result = await manager.vectorGet('v1');
        // Use toBeCloseTo for floating point comparison due to float32 storage precision
        expect(result?.embedding).toHaveLength(3);
        expect(result!.embedding[0]).toBeCloseTo(0.4, 5);
        expect(result!.embedding[1]).toBeCloseTo(0.5, 5);
        expect(result!.embedding[2]).toBeCloseTo(0.6, 5);
        expect(result?.metadata).toEqual({ updated: true });
      });
    });

    describe('vectorGet', () => {
      it('should retrieve stored vector', async () => {
        await manager.vectorStore('v1', [0.1, 0.2, 0.3], 'default', { label: 'test' });

        const result = await manager.vectorGet('v1');

        expect(result).toBeDefined();
        expect(result?.embedding).toHaveLength(3);
        expect(result?.metadata).toEqual({ label: 'test' });
      });

      it('should return undefined for non-existent vector', async () => {
        const result = await manager.vectorGet('nonexistent');
        expect(result).toBeUndefined();
      });
    });

    describe('vectorDelete', () => {
      it('should delete existing vector', async () => {
        await manager.vectorStore('v1', [0.1, 0.2, 0.3]);

        const deleted = await manager.vectorDelete('v1');

        expect(deleted).toBe(true);
        expect(await manager.vectorGet('v1')).toBeUndefined();
      });

      it('should return false for non-existent vector', async () => {
        const deleted = await manager.vectorDelete('nonexistent');
        expect(deleted).toBe(false);
      });
    });

    describe('vectorSearch', () => {
      beforeEach(async () => {
        // Store orthogonal vectors
        await manager.vectorStore('v1', [1, 0, 0], 'default', { axis: 'x' });
        await manager.vectorStore('v2', [0, 1, 0], 'default', { axis: 'y' });
        await manager.vectorStore('v3', [0, 0, 1], 'default', { axis: 'z' });
        await manager.vectorStore('v4', [0.9, 0.1, 0], 'default', { axis: 'near-x' });
      });

      it('should find similar vectors', async () => {
        const results = await manager.vectorSearch([1, 0, 0], 2);

        expect(results).toHaveLength(2);
        expect(results[0].id).toBe('v1');
        expect(results[0].score).toBeCloseTo(1, 2); // Cosine similarity of 1
      });

      it('should include metadata in results', async () => {
        const results = await manager.vectorSearch([1, 0, 0], 1);

        expect(results[0].metadata).toEqual({ axis: 'x' });
      });

      it('should respect k limit', async () => {
        const results = await manager.vectorSearch([0.5, 0.5, 0], 2);

        expect(results).toHaveLength(2);
      });

      it('should return results sorted by similarity', async () => {
        const results = await manager.vectorSearch([1, 0, 0], 4);

        // v1 (x-axis) should be first, v4 (near-x) should be second
        expect(results[0].id).toBe('v1');
        expect(results[1].id).toBe('v4');
        expect(results[0].score).toBeGreaterThan(results[1].score);
      });
    });

    describe('vectorCount', () => {
      it('should count all vectors', async () => {
        await manager.vectorStore('v1', [1, 0, 0]);
        await manager.vectorStore('v2', [0, 1, 0]);
        await manager.vectorStore('v3', [0, 0, 1]);

        const count = await manager.vectorCount();
        expect(count).toBe(3);
      });

      it('should count vectors in namespace', async () => {
        await manager.vectorStore('v1', [1, 0, 0], 'ns1');
        await manager.vectorStore('v2', [0, 1, 0], 'ns1');
        await manager.vectorStore('v3', [0, 0, 1], 'ns2');

        expect(await manager.vectorCount('ns1')).toBe(2);
        expect(await manager.vectorCount('ns2')).toBe(1);
      });

      it('should return 0 for empty namespace', async () => {
        const count = await manager.vectorCount('empty');
        expect(count).toBe(0);
      });
    });
  });

  // ===========================================================================
  // Database Access Tests
  // ===========================================================================

  describe('Database Access', () => {
    it('should provide raw database access', async () => {
      const manager = await initializeUnifiedMemory({ dbPath: getTestDbPath() });

      const db = manager.getDatabase();

      expect(db).toBeDefined();
      // Should be able to run a query
      const result = db.prepare('SELECT 1 as value').get() as { value: number };
      expect(result.value).toBe(1);
    });

    it('should throw when accessing database before init', () => {
      const manager = getUnifiedMemory({ dbPath: getTestDbPath() });

      expect(() => manager.getDatabase()).toThrow(/not initialized/i);
    });

    it('should return db path', async () => {
      const dbPath = getTestDbPath();
      const manager = await initializeUnifiedMemory({ dbPath });

      expect(manager.getDbPath()).toBe(dbPath);
    });
  });

  // ===========================================================================
  // Prepared Statement Tests
  // ===========================================================================

  describe('Prepared Statements', () => {
    it('should prepare and cache statements', async () => {
      const manager = await initializeUnifiedMemory({ dbPath: getTestDbPath() });

      const stmt1 = manager.prepare('test-stmt', 'SELECT 1 as value');
      const stmt2 = manager.prepare('test-stmt', 'SELECT 1 as value');

      expect(stmt1).toBe(stmt2); // Same cached statement
    });
  });

  // ===========================================================================
  // Transaction Tests
  // ===========================================================================

  describe('Transactions', () => {
    it('should execute transaction', async () => {
      const manager = await initializeUnifiedMemory({ dbPath: getTestDbPath() });

      manager.transaction(() => {
        const db = manager.getDatabase();
        db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)").run('k1', 'ns', '"v1"');
        db.prepare("INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)").run('k2', 'ns', '"v2"');
      });

      const value1 = await manager.kvGet<string>('k1', 'ns');
      const value2 = await manager.kvGet<string>('k2', 'ns');

      expect(value1).toBe('v1');
      expect(value2).toBe('v2');
    });
  });

  // ===========================================================================
  // Statistics Tests
  // ===========================================================================

  describe('Statistics', () => {
    it('should return database stats', async () => {
      const manager = await initializeUnifiedMemory({ dbPath: getTestDbPath() });

      // Add some data
      await manager.kvSet('k1', 'v1');
      await manager.vectorStore('vec1', [1, 2, 3]);

      const stats = manager.getStats();

      expect(stats.tables).toBeDefined();
      expect(stats.fileSize).toBeGreaterThanOrEqual(0);
      expect(stats.vectorIndexSize).toBeGreaterThanOrEqual(0);
    });

    it('should include table row counts', async () => {
      const manager = await initializeUnifiedMemory({ dbPath: getTestDbPath() });

      await manager.kvSet('k1', 'v1');
      await manager.kvSet('k2', 'v2');

      const stats = manager.getStats();
      const kvTable = stats.tables.find(t => t.name === 'kv_store');

      expect(kvTable?.rowCount).toBe(2);
    });
  });

  // ===========================================================================
  // Maintenance Operations Tests
  // ===========================================================================

  describe('Maintenance Operations', () => {
    it('should vacuum database', async () => {
      const manager = await initializeUnifiedMemory({ dbPath: getTestDbPath() });

      // Add and delete some data to create fragmentation
      await manager.kvSet('k1', 'v1');
      await manager.kvDelete('k1');

      // Should not throw
      manager.vacuum();
    });

    it('should checkpoint WAL', async () => {
      const manager = await initializeUnifiedMemory({ dbPath: getTestDbPath() });

      await manager.kvSet('k1', 'v1');

      // Should not throw
      manager.checkpoint();
    });
  });

  // ===========================================================================
  // Close and Cleanup Tests
  // ===========================================================================

  describe('Close and Cleanup', () => {
    it('should close database connection', async () => {
      const manager = await initializeUnifiedMemory({ dbPath: getTestDbPath() });
      expect(manager.isInitialized()).toBe(true);

      manager.close();

      expect(manager.isInitialized()).toBe(false);
    });

    it('should clear caches on close', async () => {
      const manager = await initializeUnifiedMemory({ dbPath: getTestDbPath() });

      await manager.vectorStore('v1', [1, 2, 3]);
      expect(manager.getStats().vectorIndexSize).toBe(1);

      manager.close();

      // After close, vector index should be cleared
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('should throw when operating on uninitialized manager', async () => {
      const manager = getUnifiedMemory({ dbPath: getTestDbPath() });

      await expect(manager.kvSet('k1', 'v1')).rejects.toThrow(/not initialized/i);
      await expect(manager.kvGet('k1')).rejects.toThrow(/not initialized/i);
      await expect(manager.vectorStore('v1', [1, 2, 3])).rejects.toThrow(/not initialized/i);
    });

    it('should handle concurrent initialization safely', async () => {
      const manager = getUnifiedMemory({ dbPath: getTestDbPath() });

      // Start multiple initializations concurrently
      const results = await Promise.allSettled([
        manager.initialize(),
        manager.initialize(),
        manager.initialize(),
      ]);

      // All should succeed
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
      expect(manager.isInitialized()).toBe(true);
    });
  });
});
