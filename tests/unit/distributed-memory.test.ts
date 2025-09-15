/**
 * Unit tests for DistributedMemorySystem
 */

import { DistributedMemorySystem } from '../../src/memory/distributed-memory';
import { MemoryEntry, MemoryQuery, AgentId } from '../../src/core/types';
import { MockLogger } from '../mocks/logger.mock';
import { MockEventBus } from '../mocks/event-bus.mock';
import { createTestAgentId, waitFor } from '../utils/test-helpers';

describe('DistributedMemorySystem', () => {
  let memory: DistributedMemorySystem;
  let logger: MockLogger;
  let eventBus: MockEventBus;
  let testAgentId: AgentId;

  beforeEach(() => {
    logger = new MockLogger();
    eventBus = new MockEventBus();
    memory = new DistributedMemorySystem(logger, eventBus);
    testAgentId = createTestAgentId();
  });

  afterEach(() => {
    logger.reset();
    eventBus.reset();
  });

  describe('Storage Operations', () => {
    it('should store and retrieve data successfully', async () => {
      const key = 'test-key';
      const value = { data: 'test-value', number: 42 };

      await memory.store(key, value);
      const retrieved = await memory.retrieve(key);

      expect(retrieved).toEqual(value);
    });

    it('should store data with metadata', async () => {
      const key = 'test-with-metadata';
      const value = { data: 'test' };
      const metadata = {
        type: 'knowledge' as const,
        tags: ['test', 'metadata'],
        partition: 'test-partition',
        consistency: 'strong' as const,
        replication: 3,
        encryption: true,
        compression: false
      };

      await memory.store(key, value, metadata);
      const retrieved = await memory.retrieve(key);

      expect(retrieved).toEqual(value);
      expect(eventBus.getEmittedEvents('memory:stored')).toHaveLength(1);

      const storedEvent = eventBus.getLastEmittedEvent('memory:stored');
      expect(storedEvent.data.key).toBe(key);
      expect(storedEvent.data.type).toBe('knowledge');
      expect(storedEvent.data.partition).toBe('test-partition');
    });

    it('should return null for non-existent keys', async () => {
      const retrieved = await memory.retrieve('non-existent-key');
      expect(retrieved).toBeNull();
    });

    it('should handle TTL expiration', async () => {
      const key = 'ttl-test';
      const value = { data: 'expires' };
      const ttl = 100; // 100ms

      await memory.store(key, value, { ttl });

      // Should exist immediately
      const retrieved1 = await memory.retrieve(key);
      expect(retrieved1).toEqual(value);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      const retrieved2 = await memory.retrieve(key);
      expect(retrieved2).toBeNull();
    });

    it('should generate unique IDs and versions for entries', async () => {
      const keys = ['entry1', 'entry2', 'entry3'];
      const promises = keys.map(key => memory.store(key, { data: key }));

      await Promise.all(promises);

      // Each entry should have been stored
      for (const key of keys) {
        const retrieved = await memory.retrieve(key);
        expect(retrieved.data).toBe(key);
      }

      expect(eventBus.getEmittedEvents('memory:stored')).toHaveLength(3);
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Setup test data
      await memory.store('item1', { type: 'user', role: 'admin' }, {
        type: 'state',
        tags: ['user', 'admin'],
        partition: 'users',
        owner: testAgentId
      });

      await memory.store('item2', { type: 'user', role: 'guest' }, {
        type: 'state',
        tags: ['user', 'guest'],
        partition: 'users',
        owner: testAgentId
      });

      await memory.store('item3', { type: 'task', status: 'pending' }, {
        type: 'artifact',
        tags: ['task', 'pending'],
        partition: 'tasks'
      });

      await memory.store('item4', { type: 'knowledge', domain: 'testing' }, {
        type: 'knowledge',
        tags: ['knowledge', 'testing'],
        partition: 'knowledge'
      });
    });

    it('should query by type', async () => {
      const query: MemoryQuery = { type: 'state' };
      const results = await memory.query(query);

      expect(results).toHaveLength(2);
      results.forEach(entry => {
        expect(entry.type).toBe('state');
      });
    });

    it('should query by tags', async () => {
      const query: MemoryQuery = { tags: ['admin'] };
      const results = await memory.query(query);

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('item1');
    });

    it('should query by multiple tags', async () => {
      const query: MemoryQuery = { tags: ['user', 'guest'] };
      const results = await memory.query(query);

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('item2');
    });

    it('should query by owner', async () => {
      const query: MemoryQuery = { owner: testAgentId };
      const results = await memory.query(query);

      expect(results).toHaveLength(2);
      results.forEach(entry => {
        expect(entry.owner).toEqual(testAgentId);
      });
    });

    it('should query by partition', async () => {
      const query: MemoryQuery = { partition: 'knowledge' };
      const results = await memory.query(query);

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('item4');
    });

    it('should combine multiple query filters', async () => {
      const query: MemoryQuery = {
        type: 'state',
        tags: ['user'],
        partition: 'users',
        owner: testAgentId
      };
      const results = await memory.query(query);

      expect(results).toHaveLength(2);
      results.forEach(entry => {
        expect(entry.type).toBe('state');
        expect(entry.metadata.tags).toContain('user');
        expect(entry.metadata.partition).toBe('users');
        expect(entry.owner).toEqual(testAgentId);
      });
    });

    it('should support pagination', async () => {
      const query1: MemoryQuery = { type: 'state', limit: 1, offset: 0 };
      const results1 = await memory.query(query1);
      expect(results1).toHaveLength(1);

      const query2: MemoryQuery = { type: 'state', limit: 1, offset: 1 };
      const results2 = await memory.query(query2);
      expect(results2).toHaveLength(1);

      // Should get different results
      expect(results1[0].key).not.toBe(results2[0].key);
    });

    it('should return empty array for no matches', async () => {
      const query: MemoryQuery = { tags: ['non-existent'] };
      const results = await memory.query(query);

      expect(results).toHaveLength(0);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Delete Operations', () => {
    it('should delete existing entries', async () => {
      const key = 'delete-test';
      const value = { data: 'to-be-deleted' };

      await memory.store(key, value);
      expect(await memory.retrieve(key)).toEqual(value);

      await memory.delete(key);
      expect(await memory.retrieve(key)).toBeNull();

      expect(eventBus.getEmittedEvents('memory:deleted')).toHaveLength(1);
    });

    it('should handle deletion of non-existent entries gracefully', async () => {
      await memory.delete('non-existent');
      // Should not throw error
      expect(eventBus.getEmittedEvents('memory:deleted')).toHaveLength(0);
    });
  });

  describe('Sharing Operations', () => {
    it('should share entries with target agents', async () => {
      const key = 'shareable-data';
      const value = { secret: 'shared-secret' };
      const targets = [
        createTestAgentId({ id: 'agent1' }),
        createTestAgentId({ id: 'agent2' })
      ];

      await memory.store(key, value, {
        permissions: {
          read: 'swarm',
          write: 'team',
          delete: 'private',
          share: 'team'
        }
      });

      await memory.share(key, targets);

      // Check shared copies exist
      const sharedKey1 = `shared:agent1:${key}`;
      const sharedKey2 = `shared:agent2:${key}`;

      const shared1 = await memory.retrieve(sharedKey1);
      const shared2 = await memory.retrieve(sharedKey2);

      expect(shared1).toEqual(value);
      expect(shared2).toEqual(value);

      expect(eventBus.getEmittedEvents('memory:shared')).toHaveLength(1);
    });

    it('should fail to share private entries', async () => {
      const key = 'private-data';
      const value = { secret: 'private' };
      const targets = [createTestAgentId({ id: 'agent1' })];

      await memory.store(key, value, {
        permissions: {
          read: 'private',
          write: 'private',
          delete: 'private',
          share: 'private'
        }
      });

      await expect(memory.share(key, targets)).rejects.toThrow('cannot be shared');
    });

    it('should fail to share non-existent entries', async () => {
      const targets = [createTestAgentId({ id: 'agent1' })];

      await expect(memory.share('non-existent', targets)).rejects.toThrow('not found');
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide memory statistics', async () => {
      await memory.store('stat1', { data: 1 });
      await memory.store('stat2', { data: 2 });
      await memory.store('stat3', { data: 3 });

      const stats = memory.getStatistics();

      expect(stats.totalEntries).toBe(3);
      expect(stats.partitionCount).toBeGreaterThan(0);
      expect(stats.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(stats.averageAccessTime).toBeGreaterThanOrEqual(0);
      expect(stats.replicationHealth).toBeGreaterThan(0);
    });

    it('should track cache hit rates', async () => {
      const key = 'cache-test';
      const value = { data: 'cached' };

      await memory.store(key, value);

      // First retrieval - should be cache miss or low hit rate
      await memory.retrieve(key);
      const stats1 = memory.getStatistics();

      // Second retrieval - should improve cache hit rate
      await memory.retrieve(key);
      const stats2 = memory.getStatistics();

      // Cache hit rate should not decrease (might stay same or improve)
      expect(stats2.cacheHitRate).toBeGreaterThanOrEqual(stats1.cacheHitRate);
    });
  });

  describe('Synchronization', () => {
    it('should emit synchronization events', async () => {
      await memory.store('sync-test', { data: 'sync' }, {
        partition: 'test-partition',
        consistency: 'strong'
      });

      await memory.synchronize();

      const syncEvents = eventBus.getEmittedEvents('memory:sync:partition');
      expect(syncEvents.length).toBeGreaterThan(0);
    });

    it('should handle eventual consistency partitions', async () => {
      await memory.store('eventual-test', { data: 'eventual' }, {
        partition: 'eventual-partition',
        consistency: 'eventual'
      });

      // Eventual consistency partitions should not require immediate sync
      await memory.synchronize();

      // Should still work normally
      const retrieved = await memory.retrieve('eventual-test');
      expect(retrieved.data).toBe('eventual');
    });
  });

  describe('Replication', () => {
    it('should emit replication events for replicated entries', async () => {
      await memory.store('replicated-data', { data: 'replicated' }, {
        replication: 3
      });

      const replicationEvents = eventBus.getEmittedEvents('memory:replicate');
      expect(replicationEvents).toHaveLength(1);
      expect(replicationEvents[0].data.replicationFactor).toBe(3);
    });

    it('should not replicate entries with replication factor 1', async () => {
      await memory.store('single-copy', { data: 'single' }, {
        replication: 1
      });

      const replicationEvents = eventBus.getEmittedEvents('memory:replicate');
      expect(replicationEvents).toHaveLength(0);
    });
  });

  describe('Cache Management', () => {
    it('should cache frequently accessed entries', async () => {
      const key = 'frequent-access';
      const value = { data: 'frequently accessed' };

      await memory.store(key, value);

      // Multiple accesses should improve cache performance
      for (let i = 0; i < 5; i++) {
        const retrieved = await memory.retrieve(key);
        expect(retrieved).toEqual(value);
      }

      const stats = memory.getStatistics();
      expect(stats.cacheHitRate).toBeGreaterThan(0);
    });

    it('should handle cache cleanup for expired entries', async () => {
      const key = 'cache-cleanup-test';
      const value = { data: 'cleanup' };

      await memory.store(key, value, { ttl: 50 }); // Very short TTL

      // Access to cache the entry
      await memory.retrieve(key);

      // Wait for TTL expiration and cache cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Entry should be cleaned up
      const retrieved = await memory.retrieve(key);
      expect(retrieved).toBeNull();
    });
  });

  describe('Partitioning', () => {
    it('should use default partitions for different data types', async () => {
      const entries = [
        { key: 'state-entry', value: { data: 'state' }, partition: 'state' },
        { key: 'knowledge-entry', value: { data: 'knowledge' }, partition: 'knowledge' },
        { key: 'decision-entry', value: { data: 'decision' }, partition: 'decisions' },
        { key: 'task-entry', value: { data: 'task' }, partition: 'tasks' }
      ];

      for (const entry of entries) {
        await memory.store(entry.key, entry.value, { partition: entry.partition });
      }

      // Query each partition
      for (const entry of entries) {
        const results = await memory.query({ partition: entry.partition });
        expect(results).toHaveLength(1);
        expect(results[0].key).toBe(entry.key);
      }
    });

    it('should use default partition when none specified', async () => {
      await memory.store('default-entry', { data: 'default' });

      const results = await memory.query({ partition: 'default' });
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('default-entry');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent store operations', async () => {
      const promises = [];
      const entryCount = 50;

      for (let i = 0; i < entryCount; i++) {
        promises.push(memory.store(`concurrent-${i}`, { data: i }));
      }

      await Promise.all(promises);

      // All entries should be stored
      for (let i = 0; i < entryCount; i++) {
        const retrieved = await memory.retrieve(`concurrent-${i}`);
        expect(retrieved.data).toBe(i);
      }

      expect(eventBus.getEmittedEvents('memory:stored')).toHaveLength(entryCount);
    });

    it('should handle concurrent read operations', async () => {
      const key = 'concurrent-read';
      const value = { data: 'concurrent' };

      await memory.store(key, value);

      const promises = [];
      const readCount = 20;

      for (let i = 0; i < readCount; i++) {
        promises.push(memory.retrieve(key));
      }

      const results = await Promise.all(promises);

      // All reads should return the same value
      results.forEach(result => {
        expect(result).toEqual(value);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      // Mock internal storage to throw error
      const originalStore = memory.store;
      jest.spyOn(memory, 'store').mockRejectedValueOnce(new Error('Storage failure'));

      await expect(memory.store('error-test', { data: 'error' })).rejects.toThrow('Storage failure');

      // Should log the error
      expect(logger.errorCalls).toHaveLength(1);
      expect(logger.errorCalls[0].message).toContain('Failed to store entry');
    });

    it('should handle retrieval errors gracefully', async () => {
      // Mock internal retrieval to throw error
      jest.spyOn(memory, 'retrieve').mockRejectedValueOnce(new Error('Retrieval failure'));

      await expect(memory.retrieve('error-key')).rejects.toThrow('Retrieval failure');

      expect(logger.errorCalls).toHaveLength(1);
      expect(logger.errorCalls[0].message).toContain('Failed to retrieve entry');
    });

    it('should handle query errors gracefully', async () => {
      jest.spyOn(memory, 'query').mockRejectedValueOnce(new Error('Query failure'));

      await expect(memory.query({ type: 'state' })).rejects.toThrow('Query failure');

      expect(logger.errorCalls).toHaveLength(1);
      expect(logger.errorCalls[0].message).toContain('Failed to query memory');
    });
  });
});