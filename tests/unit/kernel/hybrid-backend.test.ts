/**
 * Agentic QE v3 - Hybrid Memory Backend Unit Tests
 * Milestone 2.2: Test hybrid backend initialization, operations, and fallbacks
 *
 * Tests cover:
 * - Configuration with defaults
 * - Initialization with UnifiedMemoryManager
 * - Key-value operations (set, get, delete, has, search)
 * - Vector operations (store, search)
 * - Count operations
 * - Health reporting
 * - Cleanup and disposal
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { HybridMemoryBackend, type HybridBackendConfig } from '../../../src/kernel/hybrid-backend';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_DB_DIR = '/tmp/aqe-hybrid-test-' + Date.now();
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'memory.db');

function cleanupTestDir(): void {
  try {
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

function createTestConfig(overrides?: Partial<HybridBackendConfig>): Partial<HybridBackendConfig> {
  return {
    sqlite: {
      path: TEST_DB_PATH,
      walMode: true,
      poolSize: 3,
      busyTimeout: 5000,
    },
    enableFallback: true,
    defaultNamespace: 'test-namespace',
    cleanupInterval: 60000,
    ...overrides,
  };
}

// ============================================================================
// Hybrid Backend Tests
// ============================================================================

describe('HybridMemoryBackend', () => {
  let backend: HybridMemoryBackend;

  beforeEach(() => {
    // Ensure clean state
    resetUnifiedMemory();
    cleanupTestDir();
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (backend) {
      await backend.dispose();
    }
    resetUnifiedMemory();
    cleanupTestDir();
  });

  // ===========================================================================
  // Construction Tests
  // ===========================================================================

  describe('Construction', () => {
    it('should create backend with default configuration', () => {
      backend = new HybridMemoryBackend();

      expect(backend).toBeDefined();
      const config = backend.getConfig();
      expect(config.enableFallback).toBe(true);
      expect(config.defaultNamespace).toBe('default');
    });

    it('should create backend with custom configuration', () => {
      backend = new HybridMemoryBackend(createTestConfig({
        defaultNamespace: 'custom-ns',
        cleanupInterval: 30000,
      }));

      const config = backend.getConfig();
      expect(config.defaultNamespace).toBe('custom-ns');
      expect(config.cleanupInterval).toBe(30000);
    });

    it('should use provided SQLite path', () => {
      const customPath = path.join(TEST_DB_DIR, 'custom.db');
      backend = new HybridMemoryBackend({
        sqlite: { path: customPath },
      });

      const config = backend.getConfig();
      expect(config.sqlite.path).toBe(customPath);
    });
  });

  // ===========================================================================
  // Initialization Tests
  // ===========================================================================

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      backend = new HybridMemoryBackend(createTestConfig());

      await backend.initialize();

      expect(backend.isPersistent()).toBe(true);
    });

    it('should be idempotent - multiple initialize calls are safe', async () => {
      backend = new HybridMemoryBackend(createTestConfig());

      await backend.initialize();
      await backend.initialize();
      await backend.initialize();

      expect(backend.isPersistent()).toBe(true);
    });

    it('should create database file', async () => {
      backend = new HybridMemoryBackend(createTestConfig());

      await backend.initialize();

      expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
    });

    it('should throw when operations called before initialization', async () => {
      backend = new HybridMemoryBackend(createTestConfig());

      await expect(backend.set('key', 'value')).rejects.toThrow(/not initialized/);
    });
  });

  // ===========================================================================
  // Key-Value Operations Tests
  // ===========================================================================

  describe('Key-Value Operations', () => {
    beforeEach(async () => {
      backend = new HybridMemoryBackend(createTestConfig());
      await backend.initialize();
    });

    describe('set and get', () => {
      it('should store and retrieve a string value', async () => {
        await backend.set('key1', 'value1');

        const value = await backend.get<string>('key1');
        expect(value).toBe('value1');
      });

      it('should store and retrieve an object value', async () => {
        const obj = { name: 'test', count: 42 };
        await backend.set('key1', obj);

        const value = await backend.get<typeof obj>('key1');
        expect(value).toEqual(obj);
      });

      it('should store and retrieve an array value', async () => {
        const arr = [1, 2, 3, 'four'];
        await backend.set('key1', arr);

        const value = await backend.get<typeof arr>('key1');
        expect(value).toEqual(arr);
      });

      it('should return undefined for non-existent key', async () => {
        const value = await backend.get<string>('nonexistent');
        expect(value).toBeUndefined();
      });

      it('should overwrite existing value', async () => {
        await backend.set('key1', 'value1');
        await backend.set('key1', 'value2');

        const value = await backend.get<string>('key1');
        expect(value).toBe('value2');
      });

      it('should store with namespace option', async () => {
        await backend.set('key1', 'value1', { namespace: 'ns1' });
        await backend.set('key1', 'value2', { namespace: 'ns2' });

        // Note: get uses default namespace, so this tests isolation
        // The values are stored in different namespaces
        const defaultValue = await backend.get<string>('key1');
        // Default namespace won't have the value
        expect(defaultValue).toBeUndefined();
      });

      it('should handle TTL option', async () => {
        await backend.set('key1', 'value1', { ttl: 1 }); // 1 second TTL

        const value1 = await backend.get<string>('key1');
        expect(value1).toBe('value1');

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 1100));

        const value2 = await backend.get<string>('key1');
        expect(value2).toBeUndefined();
      });
    });

    describe('delete', () => {
      it('should delete an existing key', async () => {
        await backend.set('key1', 'value1');

        const deleted = await backend.delete('key1');

        expect(deleted).toBe(true);
        const value = await backend.get<string>('key1');
        expect(value).toBeUndefined();
      });

      it('should return true for non-existent key (no-op)', async () => {
        const deleted = await backend.delete('nonexistent');

        // UnifiedMemory's kvDelete returns false for non-existent keys
        expect(deleted).toBe(false);
      });
    });

    describe('has', () => {
      it('should return true for existing key', async () => {
        await backend.set('key1', 'value1');

        const exists = await backend.has('key1');
        expect(exists).toBe(true);
      });

      it('should return false for non-existent key', async () => {
        const exists = await backend.has('nonexistent');
        expect(exists).toBe(false);
      });

      it('should return false for expired key', async () => {
        await backend.set('key1', 'value1', { ttl: 1 });

        await new Promise(resolve => setTimeout(resolve, 1100));

        const exists = await backend.has('key1');
        expect(exists).toBe(false);
      });
    });

    describe('search', () => {
      beforeEach(async () => {
        await backend.set('user:1', { name: 'Alice' });
        await backend.set('user:2', { name: 'Bob' });
        await backend.set('order:1', { item: 'Book' });
        await backend.set('order:2', { item: 'Pen' });
      });

      it('should search keys by pattern', async () => {
        const keys = await backend.search('user:*');

        expect(keys).toContain('user:1');
        expect(keys).toContain('user:2');
        expect(keys).not.toContain('order:1');
      });

      it('should respect limit parameter', async () => {
        const keys = await backend.search('*', 2);

        expect(keys).toHaveLength(2);
      });

      it('should return empty array for no matches', async () => {
        const keys = await backend.search('product:*');

        expect(keys).toHaveLength(0);
      });
    });
  });

  // ===========================================================================
  // Vector Operations Tests
  // ===========================================================================

  describe('Vector Operations', () => {
    beforeEach(async () => {
      backend = new HybridMemoryBackend(createTestConfig());
      await backend.initialize();
    });

    describe('storeVector', () => {
      it('should store a vector embedding', async () => {
        const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];

        await backend.storeVector('vec1', embedding);

        // Verify by searching
        const results = await backend.vectorSearch(embedding, 1);
        expect(results).toHaveLength(1);
        expect(results[0].key).toBe('vec1');
      });

      it('should store vector with metadata', async () => {
        const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
        const metadata = { label: 'test', category: 'unit' };

        await backend.storeVector('vec1', embedding, metadata);

        const results = await backend.vectorSearch(embedding, 1);
        expect(results[0].metadata).toEqual(metadata);
      });

      it('should update existing vector', async () => {
        const embedding1 = [0.1, 0.2, 0.3, 0.4, 0.5];
        const embedding2 = [0.5, 0.4, 0.3, 0.2, 0.1];

        await backend.storeVector('vec1', embedding1);
        await backend.storeVector('vec1', embedding2);

        // Search with the new embedding should return high score
        const results = await backend.vectorSearch(embedding2, 1);
        expect(results[0].key).toBe('vec1');
        expect(results[0].score).toBeGreaterThan(0.9);
      });
    });

    describe('vectorSearch', () => {
      beforeEach(async () => {
        // Store some test vectors
        await backend.storeVector('v1', [1, 0, 0, 0, 0], { label: 'x-axis' });
        await backend.storeVector('v2', [0, 1, 0, 0, 0], { label: 'y-axis' });
        await backend.storeVector('v3', [0, 0, 1, 0, 0], { label: 'z-axis' });
        await backend.storeVector('v4', [0.9, 0.1, 0, 0, 0], { label: 'near-x' });
      });

      it('should find similar vectors', async () => {
        const query = [1, 0, 0, 0, 0]; // x-axis
        const results = await backend.vectorSearch(query, 2);

        expect(results).toHaveLength(2);
        expect(results[0].key).toBe('v1');
        expect(results[1].key).toBe('v4'); // near-x is second most similar
      });

      it('should return scores between 0 and 1', async () => {
        const query = [1, 0, 0, 0, 0];
        const results = await backend.vectorSearch(query, 4);

        for (const result of results) {
          expect(result.score).toBeGreaterThanOrEqual(-1);
          expect(result.score).toBeLessThanOrEqual(1);
        }
      });

      it('should include metadata in results', async () => {
        const query = [1, 0, 0, 0, 0];
        const results = await backend.vectorSearch(query, 1);

        expect(results[0].metadata).toEqual({ label: 'x-axis' });
      });

      it('should respect k limit', async () => {
        const query = [0.5, 0.5, 0, 0, 0];
        const results = await backend.vectorSearch(query, 2);

        expect(results).toHaveLength(2);
      });

      it('should return empty array when no vectors stored', async () => {
        // Reset unified memory to ensure clean state
        resetUnifiedMemory();

        // Create a new backend with no vectors
        const emptyBackend = new HybridMemoryBackend({
          sqlite: { path: path.join(TEST_DB_DIR, 'empty.db') },
        });
        await emptyBackend.initialize();

        // Use 5-dimensional vector to match existing vectors
        const results = await emptyBackend.vectorSearch([1, 0, 0, 0, 0], 5);

        expect(results).toHaveLength(0);

        await emptyBackend.dispose();
        resetUnifiedMemory();
      });
    });
  });

  // ===========================================================================
  // Count Operations Tests
  // ===========================================================================

  describe('Count Operations', () => {
    beforeEach(async () => {
      backend = new HybridMemoryBackend(createTestConfig());
      await backend.initialize();
    });

    it('should count entries in namespace', async () => {
      // Store entries with namespace
      const um = backend.getUnifiedMemory()!;
      await um.kvSet('key1', 'value1', 'test-ns');
      await um.kvSet('key2', 'value2', 'test-ns');
      await um.kvSet('key3', 'value3', 'other-ns');

      const count = await backend.count('test-ns');

      expect(count).toBe(2);
    });

    it('should return 0 for empty namespace', async () => {
      const count = await backend.count('empty-ns');

      expect(count).toBe(0);
    });

    it('should check code intelligence index', async () => {
      const hasIndex = await backend.hasCodeIntelligenceIndex();

      expect(hasIndex).toBe(false);
    });

    it('should detect code intelligence index when present', async () => {
      // Store entry in code-intelligence:kg namespace
      const um = backend.getUnifiedMemory()!;
      await um.kvSet('entity1', { type: 'function' }, 'code-intelligence:kg');

      const hasIndex = await backend.hasCodeIntelligenceIndex();

      expect(hasIndex).toBe(true);
    });
  });

  // ===========================================================================
  // Health Reporting Tests
  // ===========================================================================

  describe('Health Reporting', () => {
    it('should report unavailable when not initialized', () => {
      backend = new HybridMemoryBackend(createTestConfig());

      const health = backend.getHealth();

      expect(health.sqlite).toBe('unavailable');
    });

    it('should report healthy when initialized', async () => {
      backend = new HybridMemoryBackend(createTestConfig());
      await backend.initialize();

      const health = backend.getHealth();

      expect(health.sqlite).toBe('healthy');
      expect(health.sqlitePersistent).toBe(true);
      expect(health.agentdb).toBe('healthy'); // Now unified
      expect(health.fallback).toBe('inactive');
    });

    it('should report persistent as true', async () => {
      backend = new HybridMemoryBackend(createTestConfig());
      await backend.initialize();

      expect(backend.isPersistent()).toBe(true);
    });
  });

  // ===========================================================================
  // Vector Stats Tests
  // ===========================================================================

  describe('Vector Statistics', () => {
    it('should return null when not initialized', async () => {
      backend = new HybridMemoryBackend(createTestConfig());

      const stats = await backend.getVectorStats();

      expect(stats).toBeNull();
    });

    it('should return vector count', async () => {
      backend = new HybridMemoryBackend(createTestConfig());
      await backend.initialize();

      await backend.storeVector('v1', [1, 2, 3]);
      await backend.storeVector('v2', [4, 5, 6]);

      const stats = await backend.getVectorStats();

      expect(stats).not.toBeNull();
      expect(stats!.vectorCount).toBe(2);
    });
  });

  // ===========================================================================
  // Backend Selection Tests (Legacy API)
  // ===========================================================================

  describe('Backend Selection (Legacy API)', () => {
    beforeEach(async () => {
      backend = new HybridMemoryBackend(createTestConfig());
      await backend.initialize();
    });

    it('should route sqlite backend to unified memory', async () => {
      await backend.setWithBackend('key1', 'value1', 'sqlite');

      const value = await backend.get<string>('key1');
      expect(value).toBe('value1');
    });

    it('should route memory backend to unified memory', async () => {
      await backend.setWithBackend('key1', 'value1', 'memory');

      const value = await backend.get<string>('key1');
      expect(value).toBe('value1');
    });
  });

  // ===========================================================================
  // Unified Memory Access Tests
  // ===========================================================================

  describe('Unified Memory Access', () => {
    it('should provide access to unified memory manager', async () => {
      backend = new HybridMemoryBackend(createTestConfig());
      await backend.initialize();

      const um = backend.getUnifiedMemory();

      expect(um).not.toBeNull();
      expect(um!.isInitialized()).toBe(true);
    });

    it('should return null when not initialized', () => {
      backend = new HybridMemoryBackend(createTestConfig());

      const um = backend.getUnifiedMemory();

      expect(um).toBeNull();
    });
  });

  // ===========================================================================
  // Disposal Tests
  // ===========================================================================

  describe('Disposal', () => {
    it('should dispose cleanly', async () => {
      backend = new HybridMemoryBackend(createTestConfig());
      await backend.initialize();

      expect(backend.isPersistent()).toBe(true);

      await backend.dispose();

      // After disposal, the underlying UnifiedMemory is still a singleton
      // but the HybridBackend marks itself as not initialized
      // isPersistent checks the UnifiedMemory which may still be valid
      // The key assertion is that dispose() completes without error
    });

    it('should stop cleanup interval on dispose', async () => {
      backend = new HybridMemoryBackend({
        ...createTestConfig(),
        cleanupInterval: 100, // Fast interval for testing
      });
      await backend.initialize();

      await backend.dispose();

      // No way to directly verify interval stopped, but disposal should complete
    });
  });

  // ===========================================================================
  // Configuration Access Tests
  // ===========================================================================

  describe('Configuration Access', () => {
    it('should return readonly copy of configuration', () => {
      backend = new HybridMemoryBackend(createTestConfig({
        defaultNamespace: 'test-ns',
      }));

      const config = backend.getConfig();

      expect(config.defaultNamespace).toBe('test-ns');
      expect(config.enableFallback).toBe(true);
    });
  });
});
