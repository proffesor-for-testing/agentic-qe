/**
 * QE Memory System Tests
 * Testing persistent memory and state management
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createTestMemory } from '../utils/test-builders';
import { createMockFileSystem, createMockLogger } from '../mocks';

// Mock QEMemory implementation for testing
class MockQEMemory {
  private store: Map<string, any>;
  private fileSystem: any;
  private logger: any;
  private ttlTimers: Map<string, NodeJS.Timeout>;

  constructor(fileSystem?: any, logger?: any) {
    this.store = new Map();
    this.fileSystem = fileSystem || createMockFileSystem();
    this.logger = logger || createMockLogger();
    this.ttlTimers = new Map();
  }

  async set(params: {
    key: string;
    value: any;
    type?: string;
    sessionId?: string;
    agentId?: string;
    ttl?: number;
    namespace?: string;
  }): Promise<void> {
    const fullKey = this.buildKey(params.namespace, params.key);

    const entry = {
      key: params.key,
      value: params.value,
      type: params.type || 'general',
      sessionId: params.sessionId,
      agentId: params.agentId,
      timestamp: new Date(),
      namespace: params.namespace || 'default'
    };

    this.store.set(fullKey, entry);

    // Handle TTL
    if (params.ttl) {
      this.setTTL(fullKey, params.ttl);
    }

    // Persist to file system if needed
    await this.persist(fullKey, entry);
  }

  async get(key: string, namespace?: string): Promise<any | null> {
    const fullKey = this.buildKey(namespace, key);
    const entry = this.store.get(fullKey);
    return entry ? entry.value : null;
  }

  async search(pattern: string, namespace?: string): Promise<any[]> {
    const results = [];
    const regex = new RegExp(pattern);

    for (const [key, entry] of this.store.entries()) {
      if (namespace && entry.namespace !== namespace) continue;
      if (regex.test(key) || regex.test(JSON.stringify(entry.value))) {
        results.push(entry);
      }
    }

    return results;
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const fullKey = this.buildKey(namespace, key);

    // Clear TTL timer if exists
    const timer = this.ttlTimers.get(fullKey);
    if (timer) {
      clearTimeout(timer);
      this.ttlTimers.delete(fullKey);
    }

    return this.store.delete(fullKey);
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      const keysToDelete = [];
      for (const [key, entry] of this.store.entries()) {
        if (entry.namespace === namespace) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.store.delete(key));
    } else {
      this.store.clear();
    }

    // Clear all TTL timers
    this.ttlTimers.forEach(timer => clearTimeout(timer));
    this.ttlTimers.clear();
  }

  async listKeys(namespace?: string): Promise<string[]> {
    const keys = [];
    for (const [key, entry] of this.store.entries()) {
      if (!namespace || entry.namespace === namespace) {
        keys.push(entry.key);
      }
    }
    return keys;
  }

  async getByPattern(pattern: string, namespace?: string): Promise<any[]> {
    const results = [];
    const regex = new RegExp(pattern);

    for (const [key, entry] of this.store.entries()) {
      if (namespace && entry.namespace !== namespace) continue;
      if (regex.test(entry.key)) {
        results.push(entry);
      }
    }

    return results;
  }

  async getStats(namespace?: string): Promise<any> {
    let totalEntries = 0;
    let totalSize = 0;
    let oldestEntry = null;
    let newestEntry = null;

    for (const [key, entry] of this.store.entries()) {
      if (namespace && entry.namespace !== namespace) continue;

      totalEntries++;
      totalSize += JSON.stringify(entry).length;

      if (!oldestEntry || entry.timestamp < oldestEntry.timestamp) {
        oldestEntry = entry;
      }
      if (!newestEntry || entry.timestamp > newestEntry.timestamp) {
        newestEntry = entry;
      }
    }

    return {
      totalEntries,
      totalSize,
      oldestEntry,
      newestEntry,
      namespaces: this.getNamespaces()
    };
  }

  private buildKey(namespace: string | undefined, key: string): string {
    return namespace ? `${namespace}:${key}` : `default:${key}`;
  }

  private setTTL(key: string, ttl: number): void {
    // Clear existing timer
    const existingTimer = this.ttlTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.store.delete(key);
      this.ttlTimers.delete(key);
    }, ttl);

    this.ttlTimers.set(key, timer);
  }

  private async persist(key: string, entry: any): Promise<void> {
    // Mock persistence to file system
    const filePath = `/memory/${key}.json`;
    await this.fileSystem.writeFile(filePath, JSON.stringify(entry));
  }

  private getNamespaces(): string[] {
    const namespaces = new Set<string>();
    for (const entry of this.store.values()) {
      namespaces.add(entry.namespace || 'default');
    }
    return Array.from(namespaces);
  }

  async backup(path: string): Promise<void> {
    const data = Array.from(this.store.entries());
    await this.fileSystem.writeFile(path, JSON.stringify(data));
  }

  async restore(path: string): Promise<void> {
    const data = await this.fileSystem.readFile(path);
    const entries = JSON.parse(data);

    this.store.clear();
    for (const [key, value] of entries) {
      this.store.set(key, value);
    }
  }

  size(): number {
    return this.store.size;
  }
}

describe('QEMemory System', () => {
  let memory: MockQEMemory;
  let mockFileSystem: any;
  let mockLogger: any;

  beforeEach(() => {
    mockFileSystem = createMockFileSystem();
    mockLogger = createMockLogger();
    memory = new MockQEMemory(mockFileSystem, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', async () => {
      const testData = { key: 'value', timestamp: new Date() };

      await memory.set({
        key: 'test-key',
        value: testData,
        type: 'test-data'
      });

      const retrieved = await memory.get('test-key');
      expect(retrieved).toEqual(testData);
    });

    it('should return null for non-existent keys', async () => {
      const result = await memory.get('non-existent');
      expect(result).toBeNull();
    });

    it('should delete entries', async () => {
      await memory.set({ key: 'to-delete', value: 'data' });
      const deleted = await memory.delete('to-delete');

      expect(deleted).toBe(true);
      expect(await memory.get('to-delete')).toBeNull();
    });

    it('should clear all entries', async () => {
      await memory.set({ key: 'key1', value: 'value1' });
      await memory.set({ key: 'key2', value: 'value2' });

      await memory.clear();

      expect(memory.size()).toBe(0);
    });
  });

  describe('Namespace Support', () => {
    it('should isolate data by namespace', async () => {
      await memory.set({
        key: 'shared-key',
        value: 'namespace1-value',
        namespace: 'namespace1'
      });

      await memory.set({
        key: 'shared-key',
        value: 'namespace2-value',
        namespace: 'namespace2'
      });

      const value1 = await memory.get('shared-key', 'namespace1');
      const value2 = await memory.get('shared-key', 'namespace2');

      expect(value1).toBe('namespace1-value');
      expect(value2).toBe('namespace2-value');
    });

    it('should clear specific namespace', async () => {
      await memory.set({ key: 'key1', value: 'value1', namespace: 'ns1' });
      await memory.set({ key: 'key2', value: 'value2', namespace: 'ns2' });

      await memory.clear('ns1');

      expect(await memory.get('key1', 'ns1')).toBeNull();
      expect(await memory.get('key2', 'ns2')).toBe('value2');
    });

    it('should list keys by namespace', async () => {
      await memory.set({ key: 'key1', value: 'v1', namespace: 'ns1' });
      await memory.set({ key: 'key2', value: 'v2', namespace: 'ns1' });
      await memory.set({ key: 'key3', value: 'v3', namespace: 'ns2' });

      const ns1Keys = await memory.listKeys('ns1');

      expect(ns1Keys).toContain('key1');
      expect(ns1Keys).toContain('key2');
      expect(ns1Keys).not.toContain('key3');
    });
  });

  describe('TTL Support', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should auto-delete entries after TTL expires', async () => {
      await memory.set({
        key: 'ttl-key',
        value: 'ttl-value',
        ttl: 1000 // 1 second
      });

      expect(await memory.get('ttl-key')).toBe('ttl-value');

      // Advance time by 1.1 seconds
      jest.advanceTimersByTime(1100);

      expect(await memory.get('ttl-key')).toBeNull();
    });

    it('should reset TTL when updating entry', async () => {
      await memory.set({
        key: 'ttl-key',
        value: 'initial',
        ttl: 1000
      });

      jest.advanceTimersByTime(500);

      await memory.set({
        key: 'ttl-key',
        value: 'updated',
        ttl: 1000
      });

      jest.advanceTimersByTime(700);

      // Should still exist as TTL was reset
      expect(await memory.get('ttl-key')).toBe('updated');
    });

    it('should clear TTL timer on delete', async () => {
      await memory.set({
        key: 'ttl-key',
        value: 'value',
        ttl: 1000
      });

      await memory.delete('ttl-key');

      jest.advanceTimersByTime(1100);

      // Should remain deleted, no errors from cleared timer
      expect(await memory.get('ttl-key')).toBeNull();
    });
  });

  describe('Search and Pattern Matching', () => {
    beforeEach(async () => {
      await memory.set({ key: 'user:123', value: { name: 'Alice' } });
      await memory.set({ key: 'user:456', value: { name: 'Bob' } });
      await memory.set({ key: 'session:abc', value: { active: true } });
    });

    it('should search by pattern', async () => {
      const results = await memory.search('user:');

      expect(results).toHaveLength(2);
      expect(results.every(r => r.key.startsWith('user:'))).toBe(true);
    });

    it('should search by value content', async () => {
      const results = await memory.search('Alice');

      expect(results).toHaveLength(1);
      expect(results[0].value.name).toBe('Alice');
    });

    it('should get entries by key pattern', async () => {
      const results = await memory.getByPattern('^user:.*');

      expect(results).toHaveLength(2);
      expect(results.every(r => r.key.startsWith('user:'))).toBe(true);
    });
  });

  describe('Agent State Management', () => {
    it('should store agent state with metadata', async () => {
      await memory.set({
        key: 'agent:risk-oracle:state',
        value: { status: 'idle', lastTask: 'analysis' },
        type: 'agent-state',
        agentId: 'risk-oracle',
        sessionId: 'session-123'
      });

      const state = await memory.get('agent:risk-oracle:state');
      expect(state).toMatchObject({
        status: 'idle',
        lastTask: 'analysis'
      });
    });

    it('should track multiple agent states', async () => {
      const agents = ['risk-oracle', 'tdd-pair-programmer', 'test-architect'];

      for (const agent of agents) {
        await memory.set({
          key: `agent:${agent}:state`,
          value: { status: 'active' },
          type: 'agent-state',
          agentId: agent
        });
      }

      const states = await memory.getByPattern('^agent:.*:state$');
      expect(states).toHaveLength(3);
    });
  });

  describe('Statistics and Metrics', () => {
    it('should provide memory statistics', async () => {
      await memory.set({ key: 'key1', value: 'value1' });
      await memory.set({ key: 'key2', value: 'value2' });
      await memory.set({ key: 'key3', value: 'value3', namespace: 'custom' });

      const stats = await memory.getStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBeDefined();
      expect(stats.newestEntry).toBeDefined();
      expect(stats.namespaces).toContain('default');
      expect(stats.namespaces).toContain('custom');
    });

    it('should provide namespace-specific stats', async () => {
      await memory.set({ key: 'k1', value: 'v1', namespace: 'ns1' });
      await memory.set({ key: 'k2', value: 'v2', namespace: 'ns1' });
      await memory.set({ key: 'k3', value: 'v3', namespace: 'ns2' });

      const stats = await memory.getStats('ns1');

      expect(stats.totalEntries).toBe(2);
    });
  });

  describe('Persistence', () => {
    it('should persist entries to file system', async () => {
      await memory.set({ key: 'persist-key', value: 'persist-value' });

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('persist-key'),
        expect.stringContaining('persist-value')
      );
    });

    it('should backup and restore memory state', async () => {
      await memory.set({ key: 'backup1', value: 'value1' });
      await memory.set({ key: 'backup2', value: 'value2' });

      await memory.backup('/backup/memory.json');

      await memory.clear();
      expect(memory.size()).toBe(0);

      mockFileSystem.readFile.mockResolvedValue(
        JSON.stringify([
          ['default:backup1', { key: 'backup1', value: 'value1' }],
          ['default:backup2', { key: 'backup2', value: 'value2' }]
        ])
      );

      await memory.restore('/backup/memory.json');

      expect(await memory.get('backup1')).toBe('value1');
      expect(await memory.get('backup2')).toBe('value2');
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent writes', async () => {
      const writes = [];
      for (let i = 0; i < 100; i++) {
        writes.push(
          memory.set({ key: `concurrent-${i}`, value: i })
        );
      }

      await Promise.all(writes);

      expect(memory.size()).toBe(100);
    });

    it('should handle concurrent reads', async () => {
      await memory.set({ key: 'shared', value: 'data' });

      const reads = [];
      for (let i = 0; i < 100; i++) {
        reads.push(memory.get('shared'));
      }

      const results = await Promise.all(reads);
      expect(results.every(r => r === 'data')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      mockFileSystem.writeFile.mockRejectedValue(new Error('FS error'));

      // Should not throw, just log error
      await expect(memory.set({ key: 'test', value: 'value' }))
        .resolves.not.toThrow();

      // Value should still be in memory
      expect(await memory.get('test')).toBe('value');
    });

    it('should handle corrupted backup data', async () => {
      mockFileSystem.readFile.mockResolvedValue('invalid json');

      await expect(memory.restore('/backup/corrupted.json'))
        .rejects.toThrow();
    });
  });
});