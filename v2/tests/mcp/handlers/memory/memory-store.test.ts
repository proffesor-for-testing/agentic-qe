/**
 * memory/memory-store Test Suite
 *
 * Tests for memory storage with TTL, namespacing, and metadata.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MemoryStoreHandler } from '@mcp/handlers/memory/memory-store';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services to prevent heavy initialization (database, EventBus, etc.)
jest.mock('../../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../../src/mcp/services/HookExecutor.js');

describe('MemoryStoreHandler', () => {
  let handler: MemoryStoreHandler;
  let mockRegistry: any;
  let mockHookExecutor: any;
  let memoryStore: Map<string, any>;

  beforeEach(() => {
    // Use lightweight mocks instead of real instances
    mockRegistry = {
      getAgent: jest.fn(),
      listAgents: jest.fn().mockReturnValue([]),
      getStatistics: jest.fn().mockReturnValue({ totalAgents: 0 })
    } as any;

    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined),
      executePostEdit: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined)
    } as any;

    memoryStore = new Map();
    handler = new MemoryStoreHandler(mockRegistry, mockHookExecutor, memoryStore);
  });

  afterEach(async () => {
    if (handler && typeof handler.cleanup === 'function') {
      await handler.cleanup();
    }
    memoryStore.clear();
  });

  describe('Happy Path', () => {
    it('should store simple value successfully', async () => {
      const response = await handler.handle({
        key: 'test-key',
        value: 'test-value',
        namespace: 'default'
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.stored).toBe(true);
      expect(response.data.key).toBe('default:test-key');
      expect(response.data.namespace).toBe('default');
    });

    it('should store complex object with metadata', async () => {
      const testData = {
        userId: 'user-123',
        roles: ['admin', 'developer'],
        settings: { theme: 'dark', language: 'en' }
      };

      const response = await handler.handle({
        key: 'user-profile',
        value: testData,
        namespace: 'users',
        metadata: {
          agentId: 'qe-test-generator',
          version: '1.0.0',
          source: 'authentication-service'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.stored).toBe(true);
      expect(response.data.key).toBe('users:user-profile');

      // Verify stored in memory
      const stored = memoryStore.get('users:user-profile');
      expect(stored).toBeDefined();
      expect(stored.value).toEqual(testData);
      expect(stored.metadata.agentId).toBe('qe-test-generator');
    });

    it('should store with TTL correctly', async () => {
      const response = await handler.handle({
        key: 'temp-data',
        value: { session: 'abc123' },
        namespace: 'sessions',
        ttl: 60 // 60 seconds
      });

      expect(response.success).toBe(true);
      expect(response.data.ttl).toBe(60);
      expect(response.data.timestamp).toBeDefined();
    });

    it('should store persistent data', async () => {
      const response = await handler.handle({
        key: 'config',
        value: { environment: 'production', apiUrl: 'https://api.example.com' },
        namespace: 'system',
        persist: true
      });

      expect(response.success).toBe(true);
      expect(response.data.persistent).toBe(true);

      const stored = memoryStore.get('system:config');
      expect(stored.persistent).toBe(true);
    });

    it('should handle multiple namespaces', async () => {
      const responses = await Promise.all([
        handler.handle({ key: 'data', value: 'value1', namespace: 'ns1' }),
        handler.handle({ key: 'data', value: 'value2', namespace: 'ns2' }),
        handler.handle({ key: 'data', value: 'value3', namespace: 'ns3' })
      ]);

      responses.forEach(r => expect(r.success).toBe(true));

      expect(memoryStore.get('ns1:data').value).toBe('value1');
      expect(memoryStore.get('ns2:data').value).toBe('value2');
      expect(memoryStore.get('ns3:data').value).toBe('value3');
    });
  });

  describe('Input Validation', () => {
    it('should reject missing key', async () => {
      const response = await handler.handle({
        value: 'test'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('key');
    });

    it('should reject missing value', async () => {
      const response = await handler.handle({
        key: 'test'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('value');
    });

    it('should use default namespace when not provided', async () => {
      const response = await handler.handle({
        key: 'test-key',
        value: 'test-value'
      });

      expect(response.success).toBe(true);
      expect(response.data.namespace).toBe('default');
      expect(response.data.key).toBe('default:test-key');
    });

    it('should validate TTL value', async () => {
      // Negative TTL
      const response = await handler.handle({
        key: 'test',
        value: 'data',
        ttl: -1
      });

      // Handler accepts any ttl, but won't set timer for <= 0
      expect(response.success).toBe(true);
      expect(response.data.ttl).toBe(-1);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      // Mock memoryStore to throw error
      const errorStore = {
        set: jest.fn(() => { throw new Error('Storage full'); })
      } as any;

      const errorHandler = new MemoryStoreHandler(mockRegistry, mockHookExecutor, errorStore);

      const response = await errorHandler.handle({
        key: 'test',
        value: 'data'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Storage full');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
      expect(typeof response.error).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should reject null values (required field)', async () => {
      // Handler treats null as missing for required fields
      const response = await handler.handle({
        key: 'null-value',
        value: null,
        namespace: 'test'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('value');
    });

    it('should handle undefined in metadata', async () => {
      const response = await handler.handle({
        key: 'test',
        value: 'data',
        metadata: { undefinedField: undefined }
      });

      expect(response.success).toBe(true);
    });

    it('should handle very large objects', async () => {
      const largeObject = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: `item-${i}`,
          metadata: { index: i, timestamp: Date.now() }
        }))
      };

      const response = await handler.handle({
        key: 'large-data',
        value: largeObject,
        namespace: 'bulk'
      });

      expect(response.success).toBe(true);
      expect(memoryStore.get('bulk:large-data').value.items).toHaveLength(1000);
    });

    it('should handle concurrent requests to same key', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        handler.handle({
          key: 'counter',
          value: i,
          namespace: 'test'
        })
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result.success).toBe(true);
      });

      // Last write wins
      expect(memoryStore.get('test:counter').value).toBeGreaterThanOrEqual(0);
      expect(memoryStore.get('test:counter').value).toBeLessThan(10);
    });

    it('should handle special characters in keys', async () => {
      const specialKeys = [
        'key:with:colons',
        'key/with/slashes',
        'key-with-dashes',
        'key_with_underscores',
        'key.with.dots'
      ];

      for (const key of specialKeys) {
        const response = await handler.handle({
          key,
          value: `value-for-${key}`,
          namespace: 'special'
        });

        expect(response.success).toBe(true);
        expect(response.data.key).toBe(`special:${key}`);
      }
    });
  });

  describe('TTL Functionality', () => {
    it('should expire data after TTL', async () => {
      jest.useFakeTimers();

      const response = await handler.handle({
        key: 'expires',
        value: 'temporary',
        namespace: 'temp',
        ttl: 2 // 2 seconds
      });

      expect(response.success).toBe(true);
      expect(memoryStore.has('temp:expires')).toBe(true);

      // Fast forward 3 seconds
      jest.advanceTimersByTime(3000);

      // Should be deleted
      expect(memoryStore.has('temp:expires')).toBe(false);

      jest.useRealTimers();
    });

    it('should not expire data with ttl=0', async () => {
      jest.useFakeTimers();

      const response = await handler.handle({
        key: 'permanent',
        value: 'never-expires',
        namespace: 'perm',
        ttl: 0
      });

      expect(response.success).toBe(true);
      expect(memoryStore.has('perm:permanent')).toBe(true);

      jest.advanceTimersByTime(10000);

      // Should still exist
      expect(memoryStore.has('perm:permanent')).toBe(true);

      jest.useRealTimers();
    });

    it('should handle overwriting with new TTL', async () => {
      jest.useFakeTimers();

      // Store with 5 second TTL
      await handler.handle({
        key: 'data',
        value: 'first',
        ttl: 5
      });

      // Overwrite with 10 second TTL
      await handler.handle({
        key: 'data',
        value: 'second',
        ttl: 10
      });

      jest.advanceTimersByTime(6000);

      // Should still exist (new TTL is 10s)
      expect(memoryStore.has('default:data')).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const startTime = Date.now();
      await handler.handle({
        key: 'perf-test',
        value: { data: 'test' },
        namespace: 'performance'
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle batch operations efficiently', async () => {
      const startTime = Date.now();

      const promises = Array.from({ length: 100 }, (_, i) =>
        handler.handle({
          key: `batch-${i}`,
          value: { index: i },
          namespace: 'batch'
        })
      );

      await Promise.all(promises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000);
      expect(memoryStore.size).toBe(100);
    });
  });

  describe('Namespace Management', () => {
    it('should isolate data by namespace', async () => {
      const testKey = 'shared-key';

      await handler.handle({ key: testKey, value: 'ns1-value', namespace: 'ns1' });
      await handler.handle({ key: testKey, value: 'ns2-value', namespace: 'ns2' });

      const ns1Data = memoryStore.get('ns1:shared-key');
      const ns2Data = memoryStore.get('ns2:shared-key');

      expect(ns1Data.value).toBe('ns1-value');
      expect(ns2Data.value).toBe('ns2-value');
      expect(ns1Data.value).not.toBe(ns2Data.value);
    });

    it('should support QE coordination namespaces', async () => {
      const qeNamespaces = [
        'aqe/test-plan',
        'aqe/coverage',
        'aqe/quality',
        'aqe/performance',
        'aqe/security',
        'aqe/swarm/coordination'
      ];

      for (const ns of qeNamespaces) {
        const response = await handler.handle({
          key: 'status',
          value: { ready: true },
          namespace: ns
        });

        expect(response.success).toBe(true);
        expect(response.data.namespace).toBe(ns);
      }

      expect(memoryStore.size).toBe(qeNamespaces.length);
    });
  });
});
