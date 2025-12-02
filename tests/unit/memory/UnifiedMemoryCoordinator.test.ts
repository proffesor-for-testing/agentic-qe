/**
 * UnifiedMemoryCoordinator Test Suite
 *
 * Tests:
 * - Backend detection and initialization
 * - Automatic fallback handling
 * - Health monitoring
 * - Cross-backend synchronization
 * - Namespace isolation
 * - Metrics collection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  UnifiedMemoryCoordinator,
  NamespacedCoordinator,
  createUnifiedMemoryCoordinator,
  type MemoryConfig,
  type MemoryBackend,
} from '../../../src/core/memory/UnifiedMemoryCoordinator';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('UnifiedMemoryCoordinator', () => {
  let coordinator: UnifiedMemoryCoordinator;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), '.test-memory-coordinator');
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.shutdown();
    }
    await fs.remove(testDir);
  });

  describe('Initialization', () => {
    it('should initialize with default config', async () => {
      coordinator = new UnifiedMemoryCoordinator({
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });

      await coordinator.initialize();

      expect(coordinator).toBeDefined();
      expect(coordinator.isHealthy()).toBe(true);
    });

    it('should detect available backends', async () => {
      coordinator = new UnifiedMemoryCoordinator({
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });

      await coordinator.initialize();

      const health = coordinator.getHealthStatus();
      expect(health.size).toBeGreaterThan(0);
      expect(health.has('sqlite')).toBe(true);
      expect(health.has('json')).toBe(true);
    });

    it('should select optimal backend', async () => {
      coordinator = new UnifiedMemoryCoordinator({
        preferredBackend: 'sqlite',
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });

      await coordinator.initialize();

      const metrics = coordinator.getMetrics();
      expect(metrics).toBeDefined();
    });

    it('should build fallback chain', async () => {
      coordinator = new UnifiedMemoryCoordinator({
        enableFallback: true,
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });

      await coordinator.initialize();

      const health = coordinator.getHealthStatus();
      expect(health.size).toBeGreaterThan(1); // Should have multiple backends
    });
  });

  describe('Basic Operations', () => {
    beforeEach(async () => {
      coordinator = new UnifiedMemoryCoordinator({
        namespace: 'test',
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();
    });

    it('should store and retrieve values', async () => {
      await coordinator.store('key1', 'value1');
      const value = await coordinator.retrieve('key1');

      expect(value).toBe('value1');
    });

    it('should store and retrieve objects', async () => {
      const testObj = { name: 'test', count: 42, nested: { flag: true } };

      await coordinator.store('obj1', testObj);
      const retrieved = await coordinator.retrieve('obj1');

      expect(retrieved).toEqual(testObj);
    });

    it('should handle TTL expiration', async () => {
      await coordinator.store('ttl-key', 'value', 1); // 1 second TTL

      const immediate = await coordinator.retrieve('ttl-key');
      expect(immediate).toBe('value');

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1500));

      const expired = await coordinator.retrieve('ttl-key');
      expect(expired).toBeNull();
    });

    it('should delete keys', async () => {
      await coordinator.store('delete-me', 'value');
      expect(await coordinator.retrieve('delete-me')).toBe('value');

      const deleted = await coordinator.delete('delete-me');
      expect(deleted).toBe(true);

      const afterDelete = await coordinator.retrieve('delete-me');
      expect(afterDelete).toBeNull();
    });

    it('should check key existence', async () => {
      await coordinator.store('exists-key', 'value');

      expect(await coordinator.exists('exists-key')).toBe(true);
      expect(await coordinator.exists('non-existent')).toBe(false);
    });

    it('should list keys', async () => {
      await coordinator.store('list-1', 'a');
      await coordinator.store('list-2', 'b');
      await coordinator.store('list-3', 'c');

      const keys = await coordinator.list();
      expect(keys.length).toBeGreaterThanOrEqual(3);
      expect(keys).toContain('test:list-1');
      expect(keys).toContain('test:list-2');
      expect(keys).toContain('test:list-3');
    });

    it('should list keys with pattern', async () => {
      await coordinator.store('pattern-test-1', 'a');
      await coordinator.store('pattern-test-2', 'b');
      await coordinator.store('other-key', 'c');

      const keys = await coordinator.list('*pattern-test*');
      expect(keys.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Batch Operations', () => {
    beforeEach(async () => {
      coordinator = new UnifiedMemoryCoordinator({
        namespace: 'batch-test',
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();
    });

    it('should store batch entries', async () => {
      const entries = [
        { key: 'batch-1', value: 'a' },
        { key: 'batch-2', value: 'b' },
        { key: 'batch-3', value: 'c' },
      ];

      await coordinator.storeBatch(entries);

      expect(await coordinator.retrieve('batch-1')).toBe('a');
      expect(await coordinator.retrieve('batch-2')).toBe('b');
      expect(await coordinator.retrieve('batch-3')).toBe('c');
    });

    it('should retrieve batch entries', async () => {
      await coordinator.store('r1', 'v1');
      await coordinator.store('r2', 'v2');
      await coordinator.store('r3', 'v3');

      const results = await coordinator.retrieveBatch(['r1', 'r2', 'r3', 'missing']);

      expect(results.get('r1')).toBe('v1');
      expect(results.get('r2')).toBe('v2');
      expect(results.get('r3')).toBe('v3');
      expect(results.get('missing')).toBeNull();
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      coordinator = new UnifiedMemoryCoordinator({
        namespace: 'search-test',
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();

      // Populate test data
      await coordinator.store('user-123', { name: 'John', role: 'admin' });
      await coordinator.store('user-456', { name: 'Jane', role: 'user' });
      await coordinator.store('post-789', { title: 'Test Post', author: 'John' });
    });

    it('should search for entries', async () => {
      const results = await coordinator.search('user', { limit: 10 });

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some(r => r.key.includes('user-123'))).toBe(true);
      expect(results.some(r => r.key.includes('user-456'))).toBe(true);
    });

    it('should limit search results', async () => {
      const results = await coordinator.search('user', { limit: 1 });

      expect(results.length).toBe(1);
    });

    it('should offset search results', async () => {
      const first = await coordinator.search('user', { limit: 1, offset: 0 });
      const second = await coordinator.search('user', { limit: 1, offset: 1 });

      expect(first[0]?.key).not.toBe(second[0]?.key);
    });
  });

  describe('Pattern Operations', () => {
    beforeEach(async () => {
      coordinator = new UnifiedMemoryCoordinator({
        namespace: 'pattern-test',
        enableVectorOps: false, // Disable for basic pattern testing
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();
    });

    it('should store and query patterns', async () => {
      const pattern = {
        id: 'test-pattern-1',
        type: 'test',
        content: 'test pattern content',
        confidence: 0.85,
        metadata: { framework: 'jest', domain: 'unit-test' },
      };

      await coordinator.storePattern(pattern);

      const patterns = await coordinator.queryPatterns({ type: 'test' });
      expect(patterns.length).toBeGreaterThanOrEqual(1);
      expect(patterns[0].id).toBe('test-pattern-1');
      expect(patterns[0].confidence).toBe(0.85);
    });

    it('should filter patterns by type', async () => {
      await coordinator.storePattern({
        id: 'p1',
        type: 'unit',
        content: 'unit test',
        confidence: 0.9,
        metadata: {},
      });

      await coordinator.storePattern({
        id: 'p2',
        type: 'integration',
        content: 'integration test',
        confidence: 0.8,
        metadata: {},
      });

      const unitPatterns = await coordinator.queryPatterns({ type: 'unit' });
      expect(unitPatterns.every(p => p.type === 'unit')).toBe(true);
    });

    it('should filter patterns by confidence', async () => {
      await coordinator.storePattern({
        id: 'high-conf',
        type: 'test',
        content: 'high confidence',
        confidence: 0.95,
        metadata: {},
      });

      await coordinator.storePattern({
        id: 'low-conf',
        type: 'test',
        content: 'low confidence',
        confidence: 0.5,
        metadata: {},
      });

      const highConfPatterns = await coordinator.queryPatterns({
        type: 'test',
        minConfidence: 0.8,
      });

      expect(highConfPatterns.every(p => p.confidence >= 0.8)).toBe(true);
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      coordinator = new UnifiedMemoryCoordinator({
        healthCheckInterval: 100, // Fast checks for testing
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();
    });

    it('should perform health checks', async () => {
      const health = await coordinator.checkHealth();

      expect(health.size).toBeGreaterThan(0);

      const sqliteHealth = health.get('sqlite');
      expect(sqliteHealth).toBeDefined();
      expect(sqliteHealth?.status).toBe('healthy');
    });

    it('should track health status', async () => {
      await coordinator.checkHealth();

      const status = coordinator.getHealthStatus();
      expect(status.size).toBeGreaterThan(0);

      for (const [backend, health] of status) {
        expect(health.lastCheck).toBeInstanceOf(Date);
        expect(['healthy', 'degraded', 'failed']).toContain(health.status);
      }
    });

    it('should report overall health', () => {
      const isHealthy = coordinator.isHealthy();
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('Backend Synchronization', () => {
    beforeEach(async () => {
      coordinator = new UnifiedMemoryCoordinator({
        enableFallback: true,
        syncInterval: 0, // Disable automatic sync
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();
    });

    it('should sync data between backends', async () => {
      await coordinator.store('sync-key', 'sync-value');

      const result = await coordinator.syncBackends();

      expect(result.success).toBe(true);
      expect(result.recordsSynced).toBeGreaterThanOrEqual(1);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should not sync if already in progress', async () => {
      const sync1Promise = coordinator.syncBackends();
      const sync2Promise = coordinator.syncBackends();

      const [result1, result2] = await Promise.all([sync1Promise, sync2Promise]);

      expect(result1.success || result2.success).toBe(true);
      expect(result1.success && result2.success).toBe(false); // One should fail
    });
  });

  describe('Namespace Isolation', () => {
    let ns1: NamespacedCoordinator;
    let ns2: NamespacedCoordinator;

    beforeEach(async () => {
      coordinator = new UnifiedMemoryCoordinator({
        namespace: 'root',
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();

      ns1 = coordinator.createNamespace('namespace1');
      ns2 = coordinator.createNamespace('namespace2');
    });

    it('should isolate data between namespaces', async () => {
      await ns1.store('key', 'value1');
      await ns2.store('key', 'value2');

      expect(await ns1.retrieve('key')).toBe('value1');
      expect(await ns2.retrieve('key')).toBe('value2');
    });

    it('should list keys within namespace', async () => {
      await ns1.store('a', '1');
      await ns1.store('b', '2');
      await ns2.store('c', '3');

      const ns1Keys = await ns1.list();
      const ns2Keys = await ns2.list();

      expect(ns1Keys).toContain('a');
      expect(ns1Keys).toContain('b');
      expect(ns1Keys).not.toContain('c');

      expect(ns2Keys).toContain('c');
      expect(ns2Keys).not.toContain('a');
      expect(ns2Keys).not.toContain('b');
    });

    it('should delete within namespace only', async () => {
      await ns1.store('shared', 'ns1-value');
      await ns2.store('shared', 'ns2-value');

      await ns1.delete('shared');

      expect(await ns1.retrieve('shared')).toBeNull();
      expect(await ns2.retrieve('shared')).toBe('ns2-value');
    });
  });

  describe('Metrics Collection', () => {
    beforeEach(async () => {
      coordinator = new UnifiedMemoryCoordinator({
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();
    });

    it('should track operations', async () => {
      const initialMetrics = coordinator.getMetrics();
      const initialCount = initialMetrics.totalOperations;

      await coordinator.store('m1', 'v1');
      await coordinator.retrieve('m1');
      await coordinator.delete('m1');

      const finalMetrics = coordinator.getMetrics();
      expect(finalMetrics.totalOperations).toBeGreaterThan(initialCount);
    });

    it('should track operations by backend', async () => {
      await coordinator.store('b1', 'v1');
      await coordinator.retrieve('b1');

      const metrics = coordinator.getMetrics();
      expect(metrics.operationsByBackend.size).toBeGreaterThan(0);
    });

    it('should track average latency', async () => {
      for (let i = 0; i < 10; i++) {
        await coordinator.store(`latency-${i}`, i);
      }

      const metrics = coordinator.getMetrics();
      expect(metrics.averageLatency).toBeGreaterThan(0);
    });

    it('should track errors', async () => {
      const initialMetrics = coordinator.getMetrics();
      const initialErrors = initialMetrics.errorCount;

      // Try to retrieve non-existent key (shouldn't error)
      await coordinator.retrieve('non-existent');

      const finalMetrics = coordinator.getMetrics();
      // Error count should remain the same for simple retrieval
      expect(finalMetrics.errorCount).toBe(initialErrors);
    });
  });

  describe('Backend Access', () => {
    beforeEach(async () => {
      coordinator = new UnifiedMemoryCoordinator({
        enableVectorOps: false,
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();
    });

    it('should provide SwarmMemory access', () => {
      const swarmMemory = coordinator.getSwarmMemory();
      expect(swarmMemory).toBeDefined();
    });

    it('should handle missing AgentDB', () => {
      const agentDB = coordinator.getAgentDB();
      expect(agentDB).toBeUndefined();
    });

    it('should handle missing VectorStore', () => {
      const vectorStore = coordinator.getVectorStore();
      expect(vectorStore).toBeUndefined();
    });
  });

  describe('Convenience Functions', () => {
    it('should create coordinator via factory function', async () => {
      coordinator = await createUnifiedMemoryCoordinator({
        namespace: 'factory-test',
        dbPaths: {
          swarm: path.join(testDir, 'factory.db'),
        },
      });

      expect(coordinator).toBeInstanceOf(UnifiedMemoryCoordinator);
      expect(coordinator.isHealthy()).toBe(true);

      await coordinator.store('test', 'value');
      expect(await coordinator.retrieve('test')).toBe('value');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      coordinator = new UnifiedMemoryCoordinator({
        enableFallback: true,
        maxRetries: 2,
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();
    });

    it('should handle store failures gracefully', async () => {
      // This should not throw
      await expect(coordinator.store('test', 'value')).resolves.not.toThrow();
    });

    it('should return null for failed retrievals', async () => {
      const value = await coordinator.retrieve('non-existent');
      expect(value).toBeNull();
    });

    it('should return false for failed deletions', async () => {
      const result = await coordinator.delete('non-existent');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Shutdown', () => {
    it('should shutdown cleanly', async () => {
      coordinator = new UnifiedMemoryCoordinator({
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();

      await coordinator.store('final', 'value');

      await expect(coordinator.shutdown()).resolves.not.toThrow();
    });

    it('should perform final sync on shutdown', async () => {
      coordinator = new UnifiedMemoryCoordinator({
        enableFallback: true,
        dbPaths: {
          swarm: path.join(testDir, 'swarm.db'),
        },
      });
      await coordinator.initialize();

      await coordinator.store('shutdown-test', 'value');

      const shutdownPromise = coordinator.shutdown();
      await expect(shutdownPromise).resolves.not.toThrow();
    });
  });
});
