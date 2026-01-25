/**
 * Tests for Sync Adapters
 *
 * Tests for MemorySyncAdapter and CodeIntelligenceSyncAdapter
 * that wrap existing stores to provide cloud sync capabilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MemorySyncAdapter,
  createMemorySyncAdapter,
  CodeIntelligenceSyncAdapter,
  createCodeIntelligenceSyncAdapter,
} from '../../src/persistence/adapters/index.js';
import type { IPersistenceProvider, MemoryEntry } from '../../src/persistence/IPersistenceProvider.js';
import type { SwarmMemoryManager, SerializableValue } from '../../src/core/memory/SwarmMemoryManager.js';
import type { CodeChunkStore } from '../../src/code-intelligence/storage/CodeChunkStore.js';

// ============================================
// Mock Implementations
// ============================================

/**
 * Mock SwarmMemoryManager
 */
function createMockMemoryManager(): SwarmMemoryManager {
  const store = new Map<string, SerializableValue>();

  return {
    set: vi.fn(async (key: string, value: SerializableValue, partition: string = 'default') => {
      store.set(`${partition}:${key}`, value);
    }),
    get: vi.fn(async (key: string, partition: string = 'default') => {
      return store.get(`${partition}:${key}`) ?? null;
    }),
    delete: vi.fn((key: string, partition: string = 'default') => {
      store.delete(`${partition}:${key}`);
    }),
  } as unknown as SwarmMemoryManager;
}

/**
 * Mock CodeChunkStore
 */
function createMockCodeStore(): CodeChunkStore {
  const chunks = new Map<string, unknown>();

  return {
    storeChunk: vi.fn(async (chunk: { id: string }) => {
      chunks.set(chunk.id, chunk);
    }),
    storeChunks: vi.fn(async (chunkList: Array<{ id: string }>) => {
      for (const chunk of chunkList) {
        chunks.set(chunk.id, chunk);
      }
    }),
    search: vi.fn(async () => []),
    hybridSearch: vi.fn(async () => []),
    deleteChunksForFile: vi.fn(async () => 0),
    getStats: vi.fn(async () => ({
      chunkCount: chunks.size,
      entityCount: 0,
      relationshipCount: 0,
    })),
    healthCheck: vi.fn(async () => ({
      healthy: true,
      chunkCount: chunks.size,
      entityCount: 0,
    })),
    close: vi.fn(async () => {}),
    storeEntity: vi.fn(async () => {}),
    storeRelationship: vi.fn(async () => {}),
    getRelationships: vi.fn(async () => []),
  } as unknown as CodeChunkStore;
}

/**
 * Mock PersistenceProvider
 */
function createMockProvider(): IPersistenceProvider {
  const storedEntries = new Map<string, MemoryEntry>();

  return {
    initialize: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
    storeMemoryEntry: vi.fn(async (entry: MemoryEntry) => {
      storedEntries.set(`${entry.partition}:${entry.key}`, entry);
    }),
    storeMemoryEntries: vi.fn(async (entries: MemoryEntry[]) => {
      for (const entry of entries) {
        storedEntries.set(`${entry.partition}:${entry.key}`, entry);
      }
    }),
    getMemoryEntry: vi.fn(async (key: string, partition?: string) => {
      return storedEntries.get(`${partition ?? 'default'}:${key}`) ?? null;
    }),
    deleteMemoryEntries: vi.fn(async () => 0),
    queryMemoryEntries: vi.fn(async () => []),
    storeCodeChunk: vi.fn(async () => {}),
    storeCodeChunks: vi.fn(async () => {}),
    queryCodeChunks: vi.fn(async () => []),
    deleteCodeChunksForFile: vi.fn(async () => 0),
    getProviderInfo: () => ({
      type: 'mock' as const,
      location: 'memory',
      features: ['memory-sync', 'code-sync'],
    }),
  } as unknown as IPersistenceProvider;
}

// ============================================
// MemorySyncAdapter Tests
// ============================================

describe('MemorySyncAdapter', () => {
  let adapter: MemorySyncAdapter;
  let mockMemoryManager: SwarmMemoryManager;
  let mockProvider: IPersistenceProvider;

  beforeEach(() => {
    mockMemoryManager = createMockMemoryManager();
    mockProvider = createMockProvider();

    adapter = createMemorySyncAdapter({
      provider: mockProvider,
      memoryManager: mockMemoryManager,
      defaultOwner: 'test-agent',
      defaultAccessLevel: 'owner',
      autoSync: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('set()', () => {
    it('should write to local memory and sync to cloud', async () => {
      await adapter.set('test-key', { data: 'test-value' }, 'default');

      // Should write to local memory
      expect(mockMemoryManager.set).toHaveBeenCalledWith(
        'test-key',
        { data: 'test-value' },
        'default'
      );

      // Should sync to cloud
      expect(mockProvider.storeMemoryEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'test-key',
          partition: 'default',
          owner: 'test-agent',
          accessLevel: 'owner',
        })
      );
    });

    it('should not sync excluded partitions', async () => {
      adapter = createMemorySyncAdapter({
        provider: mockProvider,
        memoryManager: mockMemoryManager,
        excludePartitions: ['_internal'],
      });

      await adapter.set('test-key', 'value', '_internal');

      // Should write to local
      expect(mockMemoryManager.set).toHaveBeenCalled();

      // Should NOT sync to cloud
      expect(mockProvider.storeMemoryEntry).not.toHaveBeenCalled();
    });

    it('should emit synced event on successful sync', async () => {
      const syncedHandler = vi.fn();
      adapter.on('synced', syncedHandler);

      await adapter.set('test-key', 'value', 'default');

      expect(syncedHandler).toHaveBeenCalledWith({
        key: 'test-key',
        partition: 'default',
      });
    });
  });

  describe('get()', () => {
    it('should return local value when available', async () => {
      // Set up local value
      (mockMemoryManager.get as ReturnType<typeof vi.fn>).mockResolvedValue({ cached: true });

      const result = await adapter.get('test-key', 'default');

      expect(result).toEqual({ cached: true });
      expect(mockProvider.getMemoryEntry).not.toHaveBeenCalled();
    });

    it('should fall back to cloud when local is empty', async () => {
      // Local returns null
      (mockMemoryManager.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Cloud has the value
      (mockProvider.getMemoryEntry as ReturnType<typeof vi.fn>).mockResolvedValue({
        key: 'test-key',
        value: JSON.stringify({ fromCloud: true }),
        partition: 'default',
        owner: 'test',
        accessLevel: 'owner',
        createdAt: new Date(),
      });

      const result = await adapter.get('test-key', 'default');

      expect(result).toEqual({ fromCloud: true });

      // Should cache locally
      expect(mockMemoryManager.set).toHaveBeenCalledWith(
        'test-key',
        { fromCloud: true },
        'default'
      );
    });
  });

  describe('delete()', () => {
    it('should delete locally and sync deletion to cloud', async () => {
      await adapter.delete('test-key', 'default');

      expect(mockMemoryManager.delete).toHaveBeenCalledWith('test-key', 'default');
      expect(mockProvider.deleteMemoryEntries).toHaveBeenCalledWith('test-key', 'default');
    });
  });

  describe('has()', () => {
    it('should check if key exists in local memory', async () => {
      (mockMemoryManager.get as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: true });

      const result = await adapter.has('test-key', 'default');

      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      (mockMemoryManager.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await adapter.has('test-key', 'default');

      expect(result).toBe(false);
    });
  });

  describe('sync()', () => {
    it('should sync all pending operations', async () => {
      // Queue some operations by disabling auto-sync first
      adapter = createMemorySyncAdapter({
        provider: mockProvider,
        memoryManager: mockMemoryManager,
        autoSync: false,
      });

      // Manually add operations to queue via set
      await adapter.set('key1', 'value1', 'default');
      await adapter.set('key2', 'value2', 'default');

      // Force sync
      const result = await adapter.sync();

      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('getStats()', () => {
    it('should return sync statistics', () => {
      const stats = adapter.getStats();

      expect(stats).toEqual({
        pendingOperations: expect.any(Number),
        isSyncing: false,
        partitionsTracked: -1, // -1 = all partitions
      });
    });
  });
});

// ============================================
// CodeIntelligenceSyncAdapter Tests
// ============================================

describe('CodeIntelligenceSyncAdapter', () => {
  let adapter: CodeIntelligenceSyncAdapter;
  let mockCodeStore: CodeChunkStore;
  let mockProvider: IPersistenceProvider;

  beforeEach(() => {
    mockCodeStore = createMockCodeStore();
    mockProvider = createMockProvider();

    adapter = createCodeIntelligenceSyncAdapter({
      provider: mockProvider,
      codeStore: mockCodeStore,
      projectId: 'test-project',
      autoSync: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('storeChunk()', () => {
    it('should store locally and sync to cloud', async () => {
      const chunk = {
        id: 'chunk-1',
        filePath: 'src/index.ts',
        content: 'export function hello() {}',
        embedding: new Array(768).fill(0),
        chunkType: 'function',
        language: 'typescript',
        startLine: 1,
        endLine: 1,
      };

      await adapter.storeChunk(chunk);

      expect(mockCodeStore.storeChunk).toHaveBeenCalledWith(chunk);
      expect(mockProvider.storeCodeChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'chunk-1',
          projectId: 'test-project',
          filePath: 'src/index.ts',
        })
      );
    });
  });

  describe('storeChunks()', () => {
    it('should batch store locally and sync to cloud', async () => {
      const chunks = [
        {
          id: 'chunk-1',
          filePath: 'src/a.ts',
          content: 'const a = 1;',
          embedding: new Array(768).fill(0),
          language: 'typescript',
          startLine: 1,
          endLine: 1,
        },
        {
          id: 'chunk-2',
          filePath: 'src/b.ts',
          content: 'const b = 2;',
          embedding: new Array(768).fill(0),
          language: 'typescript',
          startLine: 1,
          endLine: 1,
        },
      ];

      await adapter.storeChunks(chunks);

      expect(mockCodeStore.storeChunks).toHaveBeenCalledWith(chunks);
      expect(mockProvider.storeCodeChunks).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'chunk-1', projectId: 'test-project' }),
          expect.objectContaining({ id: 'chunk-2', projectId: 'test-project' }),
        ])
      );
    });
  });

  describe('search()', () => {
    it('should search local store first', async () => {
      const embedding = new Array(768).fill(0.1);

      await adapter.search(embedding, { topK: 5 });

      expect(mockCodeStore.search).toHaveBeenCalledWith(
        embedding,
        expect.objectContaining({ topK: 5 })
      );
    });
  });

  describe('deleteChunksForFile()', () => {
    it('should delete locally and sync deletion to cloud', async () => {
      await adapter.deleteChunksForFile('src/test.ts');

      expect(mockCodeStore.deleteChunksForFile).toHaveBeenCalledWith('src/test.ts');
      expect(mockProvider.deleteCodeChunksForFile).toHaveBeenCalledWith(
        'test-project',
        'src/test.ts'
      );
    });
  });

  describe('getStats()', () => {
    it('should return stats including pending sync count', async () => {
      const stats = await adapter.getStats();

      expect(stats).toEqual({
        chunkCount: 0,
        entityCount: 0,
        relationshipCount: 0,
        pendingSync: expect.any(Number),
      });
    });
  });

  describe('getSyncStats()', () => {
    it('should return sync statistics', () => {
      const stats = adapter.getSyncStats();

      expect(stats).toEqual({
        pendingOperations: expect.any(Number),
        isSyncing: false,
        projectId: 'test-project',
      });
    });
  });

  describe('sync()', () => {
    it('should sync pending operations', async () => {
      const result = await adapter.sync();

      expect(result).toEqual({
        synced: expect.any(Number),
        failed: expect.any(Number),
      });
    });
  });

  describe('healthCheck()', () => {
    it('should return health status', async () => {
      const health = await adapter.healthCheck();

      expect(health).toEqual({
        localHealthy: true,
        cloudConfigured: true,
        pendingSync: expect.any(Number),
      });
    });
  });

  describe('close()', () => {
    it('should close underlying store', async () => {
      await adapter.close();

      expect(mockCodeStore.close).toHaveBeenCalled();
    });
  });
});

// ============================================
// Factory Function Tests
// ============================================

describe('Factory Functions', () => {
  it('createMemorySyncAdapter should create adapter instance', () => {
    const adapter = createMemorySyncAdapter({
      provider: createMockProvider(),
      memoryManager: createMockMemoryManager(),
    });

    expect(adapter).toBeInstanceOf(MemorySyncAdapter);
  });

  it('createCodeIntelligenceSyncAdapter should create adapter instance', () => {
    const adapter = createCodeIntelligenceSyncAdapter({
      provider: createMockProvider(),
      codeStore: createMockCodeStore(),
      projectId: 'test',
    });

    expect(adapter).toBeInstanceOf(CodeIntelligenceSyncAdapter);
  });
});
