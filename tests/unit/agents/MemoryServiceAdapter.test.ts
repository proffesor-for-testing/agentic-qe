/**
 * MemoryServiceAdapter Unit Tests
 *
 * Tests the adapter that bridges AgentMemoryService to AgentMemoryStrategy.
 * Includes tests for the new namespace functionality (storeLocal, retrieveLocal, storeSharedLocal)
 */

import { MemoryServiceAdapter, createMemoryAdapter } from '../../../src/agents/adapters';
import type { AgentId, MemoryStore, QEAgentType } from '../../../src/types';
import type { AgentMemoryService } from '../../../src/agents/memory/AgentMemoryService';

// Mock AgentMemoryService
const createMockService = () => ({
  storeTaskResult: jest.fn().mockResolvedValue(undefined),
  restoreState: jest.fn().mockResolvedValue(null),
});

// Mock MemoryStore
const createMockMemoryStore = () => {
  const store = new Map<string, any>();
  return {
    store: jest.fn().mockImplementation((key: string, value: any) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    retrieve: jest.fn().mockImplementation((key: string) => {
      return Promise.resolve(store.get(key));
    }),
    delete: jest.fn().mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    // Expose the internal store for testing
    _store: store,
  };
};

describe('MemoryServiceAdapter', () => {
  let mockService: ReturnType<typeof createMockService>;
  let mockStore: ReturnType<typeof createMockMemoryStore>;
  let adapter: MemoryServiceAdapter;
  let agentId: AgentId;

  beforeEach(() => {
    mockService = createMockService();
    mockStore = createMockMemoryStore();
    agentId = {
      id: 'test-agent-1',
      type: 'test-generator' as QEAgentType,
      created: new Date(),
    };
    adapter = new MemoryServiceAdapter(
      mockService as unknown as AgentMemoryService,
      mockStore as unknown as MemoryStore,
      agentId
    );
  });

  describe('initialization', () => {
    it('should create adapter with agentId', () => {
      expect(adapter).toBeDefined();
    });

    it('should create adapter without agentId', () => {
      const adapterNoAgent = new MemoryServiceAdapter(
        mockService as unknown as AgentMemoryService,
        mockStore as unknown as MemoryStore
      );
      expect(adapterNoAgent).toBeDefined();
    });

    it('should initialize and set initialized state', async () => {
      await adapter.initialize();
      const stats = await adapter.getStats();
      expect(stats.lastCleanup).toBeDefined();
    });
  });

  describe('basic store/retrieve', () => {
    it('should store and retrieve values', async () => {
      await adapter.store('key1', { data: 'test' });
      const result = await adapter.retrieve<{ data: string }>('key1');
      expect(result).toEqual({ data: 'test' });
    });

    it('should track hit rate on successful retrieval', async () => {
      await adapter.store('key1', 'value1');
      await adapter.retrieve('key1');

      const stats = await adapter.getStats();
      expect(stats.hitRate).toBeGreaterThan(0);
    });

    it('should track miss rate on unsuccessful retrieval', async () => {
      await adapter.retrieve('nonexistent');

      const stats = await adapter.getStats();
      expect(stats.missRate).toBeGreaterThan(0);
    });

    it('should delete values', async () => {
      await adapter.store('key1', 'value1');
      const deleted = await adapter.delete('key1');
      expect(deleted).toBe(true);

      const result = await adapter.retrieve('key1');
      expect(result).toBeUndefined();
    });

    it('should check if key exists', async () => {
      await adapter.store('key1', 'value1');
      expect(await adapter.exists('key1')).toBe(true);
      expect(await adapter.exists('nonexistent')).toBe(false);
    });
  });

  describe('storeLocal/retrieveLocal (agent-namespaced)', () => {
    it('should store with aqe/{agentType}/{key} namespace', async () => {
      await adapter.storeLocal('mykey', { data: 'local' });

      // Verify the key format
      const storedKey = mockStore.store.mock.calls[0][0];
      expect(storedKey).toBe('aqe/test-generator/mykey');
    });

    it('should retrieve with aqe/{agentType}/{key} namespace', async () => {
      // Store directly with namespaced key
      mockStore._store.set('aqe/test-generator/mykey', { data: 'local' });

      const result = await adapter.retrieveLocal('mykey');
      expect(result).toEqual({ data: 'local' });
    });

    it('should handle TTL in storeLocal', async () => {
      await adapter.storeLocal('mykey', { data: 'test' }, 5000);

      expect(mockStore.store).toHaveBeenCalledWith(
        'aqe/test-generator/mykey',
        { data: 'test' },
        5000
      );
    });

    it('should return undefined for non-existent local key', async () => {
      const result = await adapter.retrieveLocal('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('storeShared/retrieveShared', () => {
    it('should store with aqe/shared/{agentType}/{key} namespace', async () => {
      await adapter.storeShared('test-generator' as QEAgentType, 'sharedkey', { data: 'shared' });

      const storedKey = mockStore.store.mock.calls[0][0];
      expect(storedKey).toBe('aqe/shared/test-generator/sharedkey');
    });

    it('should retrieve from aqe/shared/{agentType}/{key} namespace', async () => {
      // Store directly with namespaced key
      mockStore._store.set('aqe/shared/coverage-analyzer/patterns', ['p1', 'p2']);

      const result = await adapter.retrieveShared<string[]>(
        'coverage-analyzer' as QEAgentType,
        'patterns'
      );
      expect(result).toEqual(['p1', 'p2']);
    });

    it('should allow cross-agent retrieval', async () => {
      // Agent A stores shared data
      mockStore._store.set('aqe/shared/test-generator/results', { count: 10 });

      // Agent B retrieves it
      const result = await adapter.retrieveShared<{ count: number }>(
        'test-generator' as QEAgentType,
        'results'
      );
      expect(result).toEqual({ count: 10 });
    });
  });

  describe('storeSharedLocal', () => {
    it('should store in shared namespace for this agent type', async () => {
      await adapter.storeSharedLocal('status', { ready: true });

      const storedKey = mockStore.store.mock.calls[0][0];
      expect(storedKey).toBe('aqe/shared/test-generator/status');
    });

    it('should throw if adapter has no agentId', async () => {
      const adapterNoAgent = new MemoryServiceAdapter(
        mockService as unknown as AgentMemoryService,
        mockStore as unknown as MemoryStore
      );

      await expect(
        adapterNoAgent.storeSharedLocal('key', 'value')
      ).rejects.toThrow('Cannot use storeSharedLocal without agentId');
    });

    it('should handle TTL in storeSharedLocal', async () => {
      await adapter.storeSharedLocal('status', { ready: true }, 10000);

      expect(mockStore.store).toHaveBeenCalledWith(
        'aqe/shared/test-generator/status',
        { ready: true },
        expect.any(Number)
      );
    });
  });

  describe('bulk operations', () => {
    it('should bulk store entries', async () => {
      await adapter.bulkStore([
        { key: 'k1', value: 'v1' },
        { key: 'k2', value: 'v2' },
        { key: 'k3', value: 'v3' },
      ]);

      expect(mockStore.store).toHaveBeenCalledTimes(3);
    });

    it('should bulk retrieve entries', async () => {
      mockStore._store.set('k1', 'v1');
      mockStore._store.set('k2', 'v2');

      const results = await adapter.bulkRetrieve<string>(['k1', 'k2', 'k3']);

      expect(results.get('k1')).toBe('v1');
      expect(results.get('k2')).toBe('v2');
      expect(results.has('k3')).toBe(false);
    });

    it('should bulk delete entries', async () => {
      mockStore._store.set('k1', 'v1');
      mockStore._store.set('k2', 'v2');

      const deleted = await adapter.bulkDelete(['k1', 'k2']);
      expect(deleted).toBe(2);
    });
  });

  describe('stats tracking', () => {
    it('should track totalEntries', async () => {
      await adapter.store('k1', 'v1');
      await adapter.store('k2', 'v2');

      const stats = await adapter.getStats();
      expect(stats.totalEntries).toBe(2);
    });

    it('should track entries on local storage', async () => {
      await adapter.storeLocal('k1', 'v1');

      const stats = await adapter.getStats();
      expect(stats.totalEntries).toBe(1);
    });
  });

  describe('lifecycle', () => {
    it('should close adapter', async () => {
      await adapter.initialize();
      await adapter.close();

      // No error thrown
    });

    it('should clear stats on clear()', async () => {
      await adapter.store('k1', 'v1');
      await adapter.clear();

      const stats = await adapter.getStats();
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('createMemoryAdapter factory', () => {
    it('should create adapter with agentId', () => {
      const factoryAdapter = createMemoryAdapter(
        mockService as unknown as AgentMemoryService,
        mockStore as unknown as MemoryStore,
        agentId
      );
      expect(factoryAdapter).toBeInstanceOf(MemoryServiceAdapter);
    });

    it('should create adapter without agentId', () => {
      const factoryAdapter = createMemoryAdapter(
        mockService as unknown as AgentMemoryService,
        mockStore as unknown as MemoryStore
      );
      expect(factoryAdapter).toBeInstanceOf(MemoryServiceAdapter);
    });
  });
});
