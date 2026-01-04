/**
 * Storage Module Tests
 *
 * Tests for the offline-first storage layer including:
 * - StorageAdapter utilities
 * - OfflineStore operations
 * - SyncManager functionality
 * - ConflictResolver strategies
 *
 * Phase 1: P1-005 - Offline-First Storage Layer
 *
 * @module tests/edge/vscode-extension/storage.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // StorageAdapter utilities
  createStorageKey,
  parseStorageKey,
  generateChecksum,
  verifyChecksum,
  DEFAULT_SCHEMA_VERSION,
  type StorageNamespace,
  type StorageEntry,
  type IStorageAdapter,
  type StorageQueryOptions,
  type StorageOperationResult,
  type StorageStats,
  type StorageMigration,
  type SetOptions,
  type ImportOptions,
} from '../../../src/edge/vscode-extension/src/storage/StorageAdapter';

import {
  OfflineStore,
  type OfflineStoreConfig,
  type QueuedOperation,
} from '../../../src/edge/vscode-extension/src/storage/OfflineStore';

import {
  SyncManager,
  type SyncManagerConfig,
  type SyncResult,
} from '../../../src/edge/vscode-extension/src/storage/SyncManager';

import {
  ConflictResolver,
  type ConflictResolverConfig,
  type Conflict,
  type ConflictResolution,
  defaultPatternMergeFn,
  defaultTestHistoryMergeFn,
} from '../../../src/edge/vscode-extension/src/storage/ConflictResolver';

// ============================================================
// Mock Storage Adapter for Testing
// ============================================================

class MockStorageAdapter implements IStorageAdapter {
  private data: Map<string, StorageEntry> = new Map();
  private schemaVersion = DEFAULT_SCHEMA_VERSION;

  async initialize(): Promise<void> {
    // No-op for mock
  }

  async get<T>(namespace: StorageNamespace, key: string): Promise<StorageEntry<T> | null> {
    const fullKey = createStorageKey(namespace, key);
    const entry = this.data.get(fullKey);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) return null;
    return entry as StorageEntry<T>;
  }

  async set<T>(
    namespace: StorageNamespace,
    key: string,
    value: T,
    options?: SetOptions
  ): Promise<StorageOperationResult<StorageEntry<T>>> {
    const fullKey = createStorageKey(namespace, key);
    const now = Date.now();

    const entry: StorageEntry<T> = {
      key,
      value,
      namespace,
      createdAt: now,
      updatedAt: now,
      schemaVersion: options?.schemaVersion ?? this.schemaVersion,
      expiresAt: options?.ttl ? now + options.ttl : options?.expiresAt,
      checksum: generateChecksum(value),
    };

    this.data.set(fullKey, entry);

    return { success: true, data: entry, affected: 1 };
  }

  async delete(namespace: StorageNamespace, key: string): Promise<StorageOperationResult<void>> {
    const fullKey = createStorageKey(namespace, key);
    const existed = this.data.has(fullKey);
    this.data.delete(fullKey);
    return { success: true, affected: existed ? 1 : 0 };
  }

  async has(namespace: StorageNamespace, key: string): Promise<boolean> {
    const entry = await this.get(namespace, key);
    return entry !== null;
  }

  async keys(namespace: StorageNamespace, options?: StorageQueryOptions): Promise<string[]> {
    const prefix = `aqe:${namespace}:`;
    const keys: string[] = [];

    for (const fullKey of this.data.keys()) {
      if (fullKey.startsWith(prefix)) {
        const key = fullKey.substring(prefix.length);
        if (!options?.keyPrefix || key.startsWith(options.keyPrefix)) {
          keys.push(key);
        }
      }
    }

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? keys.length;
    return keys.slice(offset, offset + limit);
  }

  async query<T>(options: StorageQueryOptions): Promise<StorageEntry<T>[]> {
    const results: StorageEntry<T>[] = [];
    const namespaces = options.namespace
      ? [options.namespace]
      : ['patterns', 'analysis', 'tests', 'config', 'sync', 'queue', 'metadata'] as StorageNamespace[];

    for (const namespace of namespaces) {
      const keys = await this.keys(namespace, options);
      for (const key of keys) {
        const entry = await this.get<T>(namespace, key);
        if (entry) {
          results.push(entry);
        }
      }
    }

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async clear(namespace: StorageNamespace): Promise<StorageOperationResult<void>> {
    const prefix = `aqe:${namespace}:`;
    let count = 0;

    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) {
        this.data.delete(key);
        count++;
      }
    }

    return { success: true, affected: count };
  }

  async clearAll(): Promise<StorageOperationResult<void>> {
    const count = this.data.size;
    this.data.clear();
    return { success: true, affected: count };
  }

  async getStats(): Promise<StorageStats> {
    const entriesByNamespace: Record<StorageNamespace, number> = {
      patterns: 0,
      analysis: 0,
      tests: 0,
      config: 0,
      sync: 0,
      queue: 0,
      metadata: 0,
    };

    let expiredCount = 0;
    const now = Date.now();

    for (const [key, entry] of this.data.entries()) {
      const parsed = parseStorageKey(key);
      if (parsed) {
        entriesByNamespace[parsed.namespace]++;
      }
      if (entry.expiresAt && entry.expiresAt < now) {
        expiredCount++;
      }
    }

    return {
      totalEntries: this.data.size,
      entriesByNamespace,
      totalSizeBytes: JSON.stringify([...this.data.values()]).length,
      expiredEntries: expiredCount,
      pendingSyncCount: entriesByNamespace.queue,
    };
  }

  async migrate(migrations: StorageMigration[]): Promise<number> {
    let count = 0;
    const sorted = [...migrations].sort((a, b) => a.fromVersion - b.fromVersion);

    for (const [key, entry] of this.data.entries()) {
      let migrated = false;
      let currentEntry = entry;

      for (const migration of sorted) {
        if (currentEntry.schemaVersion === migration.fromVersion) {
          currentEntry = migration.migrate(currentEntry);
          migrated = true;
        }
      }

      if (migrated) {
        this.data.set(key, currentEntry);
        count++;
      }
    }

    return count;
  }

  async export(): Promise<Record<string, StorageEntry[]>> {
    const result: Record<string, StorageEntry[]> = {};

    for (const entry of this.data.values()) {
      if (!result[entry.namespace]) {
        result[entry.namespace] = [];
      }
      result[entry.namespace].push(entry);
    }

    return result;
  }

  async import(
    data: Record<string, StorageEntry[]>,
    options?: ImportOptions
  ): Promise<StorageOperationResult<void>> {
    if (options?.clearFirst) {
      await this.clearAll();
    }

    let count = 0;
    for (const [namespace, entries] of Object.entries(data)) {
      if (options?.namespaces && !options.namespaces.includes(namespace as StorageNamespace)) {
        continue;
      }

      for (const entry of entries) {
        const fullKey = createStorageKey(namespace as StorageNamespace, entry.key);
        if (!options?.overwrite && this.data.has(fullKey)) {
          continue;
        }
        this.data.set(fullKey, entry);
        count++;
      }
    }

    return { success: true, affected: count };
  }

  getSchemaVersion(): number {
    return this.schemaVersion;
  }

  async close(): Promise<void> {
    this.data.clear();
  }
}

// ============================================================
// StorageAdapter Utility Tests
// ============================================================

describe('StorageAdapter Utilities', () => {
  describe('createStorageKey', () => {
    it('should create a properly formatted key', () => {
      const key = createStorageKey('patterns', 'test-pattern-1');
      expect(key).toBe('aqe:patterns:test-pattern-1');
    });

    it('should handle different namespaces', () => {
      expect(createStorageKey('analysis', 'file.ts')).toBe('aqe:analysis:file.ts');
      expect(createStorageKey('config', 'settings')).toBe('aqe:config:settings');
    });
  });

  describe('parseStorageKey', () => {
    it('should parse a valid storage key', () => {
      const result = parseStorageKey('aqe:patterns:test-pattern-1');
      expect(result).toEqual({
        namespace: 'patterns',
        key: 'test-pattern-1',
      });
    });

    it('should return null for invalid keys', () => {
      expect(parseStorageKey('invalid')).toBeNull();
      expect(parseStorageKey('aqe:invalid-namespace:key')).toBeNull();
      expect(parseStorageKey('')).toBeNull();
    });

    it('should handle keys with colons', () => {
      const result = parseStorageKey('aqe:analysis:path/to/file:extra');
      expect(result).toEqual({
        namespace: 'analysis',
        key: 'path/to/file:extra',
      });
    });
  });

  describe('generateChecksum', () => {
    it('should generate consistent checksums', () => {
      const data = { name: 'test', value: 123 };
      const checksum1 = generateChecksum(data);
      const checksum2 = generateChecksum(data);
      expect(checksum1).toBe(checksum2);
    });

    it('should generate different checksums for different data', () => {
      const checksum1 = generateChecksum({ a: 1 });
      const checksum2 = generateChecksum({ a: 2 });
      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle various data types', () => {
      expect(generateChecksum('string')).toBeDefined();
      expect(generateChecksum(123)).toBeDefined();
      expect(generateChecksum([1, 2, 3])).toBeDefined();
      expect(generateChecksum(null)).toBeDefined();
    });
  });

  describe('verifyChecksum', () => {
    it('should verify matching checksums', () => {
      const data = { test: 'value' };
      const checksum = generateChecksum(data);
      expect(verifyChecksum(data, checksum)).toBe(true);
    });

    it('should reject mismatched checksums', () => {
      const data = { test: 'value' };
      expect(verifyChecksum(data, 'invalid')).toBe(false);
    });
  });
});

// ============================================================
// OfflineStore Tests
// ============================================================

describe('OfflineStore', () => {
  let adapter: MockStorageAdapter;
  let store: OfflineStore;

  beforeEach(async () => {
    adapter = new MockStorageAdapter();
    store = new OfflineStore({
      adapter,
      enableAutoCleanup: false, // Disable for testing
      debugMode: false,
    });
    await store.initialize();
  });

  afterEach(async () => {
    await store.shutdown();
  });

  describe('basic operations', () => {
    it('should set and get values', async () => {
      await store.set('patterns', 'p1', { name: 'test' });
      const value = await store.get('patterns', 'p1');
      expect(value).toEqual({ name: 'test' });
    });

    it('should return null for non-existent keys', async () => {
      const value = await store.get('patterns', 'non-existent');
      expect(value).toBeNull();
    });

    it('should delete values', async () => {
      await store.set('patterns', 'p1', { name: 'test' });
      await store.delete('patterns', 'p1');
      const value = await store.get('patterns', 'p1');
      expect(value).toBeNull();
    });

    it('should check existence with has()', async () => {
      await store.set('patterns', 'p1', { name: 'test' });
      expect(await store.has('patterns', 'p1')).toBe(true);
      expect(await store.has('patterns', 'p2')).toBe(false);
    });

    it('should list keys in namespace', async () => {
      await store.set('patterns', 'p1', { name: 'test1' });
      await store.set('patterns', 'p2', { name: 'test2' });
      await store.set('analysis', 'a1', { name: 'analysis1' });

      const patternKeys = await store.keys('patterns');
      expect(patternKeys).toHaveLength(2);
      expect(patternKeys).toContain('p1');
      expect(patternKeys).toContain('p2');
    });
  });

  describe('namespace-specific methods', () => {
    it('should store and retrieve patterns', async () => {
      await store.storePattern('p1', { type: 'unit-test', code: 'test()' });
      const pattern = await store.getPattern('p1');
      expect(pattern).toEqual({ type: 'unit-test', code: 'test()' });
    });

    it('should store and retrieve analysis results', async () => {
      await store.storeAnalysis('file.ts', { functions: 5, coverage: 80 });
      const analysis = await store.getAnalysis('file.ts');
      expect(analysis).toEqual({ functions: 5, coverage: 80 });
    });

    it('should store and retrieve test history', async () => {
      await store.storeTestHistory('run-1', { passed: 10, failed: 2 });
      const history = await store.getTestHistory('run-1');
      expect(history).toEqual({ passed: 10, failed: 2 });
    });

    it('should store and retrieve config', async () => {
      await store.setConfig('theme', 'dark');
      const theme = await store.getConfig('theme');
      expect(theme).toBe('dark');
    });

    it('should return default config value when not set', async () => {
      const value = await store.getConfig('unset', 'default');
      expect(value).toBe('default');
    });
  });

  describe('queue operations', () => {
    it('should queue operations', async () => {
      await store.queueOperation('set', 'patterns', 'p1', { data: 'test' });
      const queued = await store.getQueuedOperations();
      expect(queued).toHaveLength(1);
      expect(queued[0].type).toBe('set');
      expect(queued[0].namespace).toBe('patterns');
      expect(queued[0].key).toBe('p1');
    });

    it('should remove queued operations', async () => {
      await store.queueOperation('set', 'patterns', 'p1', { data: 'test' });
      const queued = await store.getQueuedOperations();
      await store.removeQueuedOperation(queued[0].id);
      const remaining = await store.getQueuedOperations();
      expect(remaining).toHaveLength(0);
    });
  });

  describe('events', () => {
    it('should emit set events', async () => {
      const listener = vi.fn();
      store.on('set', listener);

      await store.set('patterns', 'p1', { name: 'test' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'set',
          namespace: 'patterns',
          key: 'p1',
          data: { name: 'test' },
        })
      );
    });

    it('should emit delete events', async () => {
      const listener = vi.fn();
      await store.set('patterns', 'p1', { name: 'test' });
      store.on('delete', listener);

      await store.delete('patterns', 'p1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'delete',
          namespace: 'patterns',
          key: 'p1',
        })
      );
    });

    it('should remove event listeners', async () => {
      const listener = vi.fn();
      store.on('set', listener);
      store.off('set', listener);

      await store.set('patterns', 'p1', { name: 'test' });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('clear operations', () => {
    it('should clear a namespace', async () => {
      await store.set('patterns', 'p1', { name: 'test1' });
      await store.set('patterns', 'p2', { name: 'test2' });
      await store.set('analysis', 'a1', { name: 'analysis1' });

      await store.clear('patterns');

      expect(await store.get('patterns', 'p1')).toBeNull();
      expect(await store.get('patterns', 'p2')).toBeNull();
      expect(await store.get('analysis', 'a1')).not.toBeNull();
    });

    it('should clear all storage', async () => {
      await store.set('patterns', 'p1', { name: 'test1' });
      await store.set('analysis', 'a1', { name: 'analysis1' });

      await store.clearAll();

      expect(await store.get('patterns', 'p1')).toBeNull();
      expect(await store.get('analysis', 'a1')).toBeNull();
    });
  });

  describe('export and import', () => {
    it('should export all data', async () => {
      await store.set('patterns', 'p1', { name: 'pattern1' });
      await store.set('analysis', 'a1', { name: 'analysis1' });

      const exported = await store.export();

      expect(exported.patterns).toHaveLength(1);
      expect(exported.analysis).toHaveLength(1);
    });

    it('should import data', async () => {
      const importData = {
        patterns: [
          {
            key: 'p1',
            value: { name: 'imported' },
            namespace: 'patterns' as StorageNamespace,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            schemaVersion: 1,
          },
        ],
      };

      await store.import(importData);

      const value = await store.get('patterns', 'p1');
      expect(value).toEqual({ name: 'imported' });
    });
  });
});

// ============================================================
// ConflictResolver Tests
// ============================================================

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver({
      defaultStrategy: 'newest-wins',
      enableAuditLog: true,
      debugMode: false,
    });
  });

  const createEntry = (
    key: string,
    value: unknown,
    updatedAt: number
  ): StorageEntry => ({
    key,
    value,
    namespace: 'patterns',
    createdAt: updatedAt - 1000,
    updatedAt,
    schemaVersion: 1,
  });

  describe('resolution strategies', () => {
    it('should resolve with local-wins strategy', async () => {
      const local = createEntry('p1', { name: 'local' }, Date.now());
      const remote = createEntry('p1', { name: 'remote' }, Date.now() + 1000);

      const resolution = await resolver.resolve(local, remote, 'local-wins');

      expect(resolution.strategy).toBe('local-wins');
      expect(resolution.resolvedEntry?.value).toEqual({ name: 'local' });
    });

    it('should resolve with remote-wins strategy', async () => {
      const local = createEntry('p1', { name: 'local' }, Date.now());
      const remote = createEntry('p1', { name: 'remote' }, Date.now() + 1000);

      const resolution = await resolver.resolve(local, remote, 'remote-wins');

      expect(resolution.strategy).toBe('remote-wins');
      expect(resolution.resolvedEntry?.value).toEqual({ name: 'remote' });
    });

    it('should resolve with newest-wins strategy', async () => {
      const older = createEntry('p1', { name: 'older' }, Date.now());
      const newer = createEntry('p1', { name: 'newer' }, Date.now() + 10000);

      const resolution = await resolver.resolve(older, newer, 'newest-wins');

      expect(resolution.strategy).toBe('newest-wins');
      expect(resolution.resolvedEntry?.value).toEqual({ name: 'newer' });
    });

    it('should resolve with merge strategy for patterns namespace', async () => {
      // For patterns namespace, mergePatterns logic is used which keeps local values
      // unless remote has updatedAt that's newer
      const local = createEntry('p1', { a: 1, b: 2 }, Date.now());
      const remote = createEntry('p1', { b: 3, c: 4 }, Date.now() + 1000);

      const resolution = await resolver.resolve(local, remote, 'merge');

      expect(resolution.strategy).toBe('merge');
      // Patterns merge: local values preserved, remote values added for new keys
      // Keys without updatedAt in their values don't get overwritten
      expect(resolution.resolvedEntry?.value).toEqual({ a: 1, b: 2, c: 4 });
    });

    it('should resolve with merge strategy for non-patterns namespace', async () => {
      // For non-patterns namespaces, deepMerge is used - remote overwrites local
      const createConfigEntry = (key: string, value: unknown, updatedAt: number): StorageEntry => ({
        key,
        value,
        namespace: 'config', // Use config namespace for deepMerge behavior
        createdAt: updatedAt - 1000,
        updatedAt,
        schemaVersion: 1,
      });

      const local = createConfigEntry('c1', { a: 1, b: 2 }, Date.now());
      const remote = createConfigEntry('c1', { b: 3, c: 4 }, Date.now() + 1000);

      const resolution = await resolver.resolve(local, remote, 'merge');

      expect(resolution.strategy).toBe('merge');
      // Deep merge: remote values overwrite local for same keys, local-only keys preserved
      expect(resolution.resolvedEntry?.value).toEqual({ a: 1, b: 3, c: 4 });
    });
  });

  describe('audit logging', () => {
    it('should create audit log entries', async () => {
      const local = createEntry('p1', { name: 'local' }, Date.now());
      const remote = createEntry('p1', { name: 'remote' }, Date.now() + 1000);

      const resolution = await resolver.resolve(local, remote);

      // Audit log contains: conflict-detected, strategy-applied, conflict-resolved
      expect(resolution.auditLog.length).toBeGreaterThanOrEqual(2);
      expect(resolution.auditLog[0].action).toBe('conflict-detected');
      expect(resolution.auditLog[1].action).toBe('strategy-applied');
    });
  });

  describe('resolution history', () => {
    it('should track resolution history', async () => {
      const local = createEntry('p1', { name: 'local' }, Date.now());
      const remote = createEntry('p1', { name: 'remote' }, Date.now() + 1000);

      await resolver.resolve(local, remote);

      const history = resolver.getHistory();
      expect(history).toHaveLength(1);
    });

    it('should clear history', async () => {
      const local = createEntry('p1', { name: 'local' }, Date.now());
      const remote = createEntry('p1', { name: 'remote' }, Date.now() + 1000);

      await resolver.resolve(local, remote);
      resolver.clearHistory();

      expect(resolver.getHistory()).toHaveLength(0);
    });

    it('should provide statistics', async () => {
      const local = createEntry('p1', { name: 'local' }, Date.now());
      const remote = createEntry('p1', { name: 'remote' }, Date.now() + 1000);

      await resolver.resolve(local, remote, 'local-wins');
      await resolver.resolve(local, remote, 'remote-wins');

      const stats = resolver.getStats();
      expect(stats.totalResolutions).toBe(2);
      expect(stats.byStrategy['local-wins']).toBe(1);
      expect(stats.byStrategy['remote-wins']).toBe(1);
    });
  });

  describe('custom merge functions', () => {
    it('should use custom merge function', async () => {
      const customMerge = vi.fn().mockReturnValue({ merged: true });
      resolver.setMergeFunction('patterns', customMerge);

      const local = createEntry('p1', { name: 'local' }, Date.now());
      const remote = createEntry('p1', { name: 'remote' }, Date.now() + 1000);

      await resolver.resolve(local, remote, 'merge');

      expect(customMerge).toHaveBeenCalledWith(
        { name: 'local' },
        { name: 'remote' },
        expect.objectContaining({
          namespace: 'patterns',
          key: 'p1',
        })
      );
    });
  });

  describe('manual resolution', () => {
    it('should call manual resolution callback', async () => {
      const manualCallback = vi.fn().mockResolvedValue(
        createEntry('p1', { manual: true }, Date.now())
      );
      resolver.setManualResolutionCallback(manualCallback);

      const local = createEntry('p1', { name: 'local' }, Date.now());
      const remote = createEntry('p1', { name: 'remote' }, Date.now() + 1000);

      const resolution = await resolver.resolve(local, remote, 'manual');

      expect(manualCallback).toHaveBeenCalled();
      expect(resolution.resolvedEntry?.value).toEqual({ manual: true });
    });

    it('should fall back to newest-wins when no manual callback', async () => {
      const local = createEntry('p1', { name: 'local' }, Date.now());
      const remote = createEntry('p1', { name: 'remote' }, Date.now() + 10000);

      const resolution = await resolver.resolve(local, remote, 'manual');

      // Should fall back to newest-wins
      expect(resolution.resolvedEntry?.value).toEqual({ name: 'remote' });
    });
  });
});

// ============================================================
// SyncManager Tests
// ============================================================

describe('SyncManager', () => {
  let adapter: MockStorageAdapter;
  let store: OfflineStore;
  let conflictResolver: ConflictResolver;
  let syncManager: SyncManager;

  beforeEach(async () => {
    adapter = new MockStorageAdapter();
    store = new OfflineStore({
      adapter,
      enableAutoCleanup: false,
      debugMode: false,
    });
    await store.initialize();

    conflictResolver = new ConflictResolver({
      defaultStrategy: 'newest-wins',
      debugMode: false,
    });

    syncManager = new SyncManager({
      store,
      conflictResolver,
      autoSync: false, // Disable for testing
      debugMode: false,
    });
    await syncManager.initialize();
  });

  afterEach(async () => {
    await syncManager.shutdown();
    await store.shutdown();
  });

  describe('online/offline status', () => {
    it('should track online status', async () => {
      expect(syncManager.getIsOnline()).toBe(true);

      await syncManager.setOnlineStatus(false);
      expect(syncManager.getIsOnline()).toBe(false);
      expect(syncManager.getStatus()).toBe('offline');

      await syncManager.setOnlineStatus(true);
      expect(syncManager.getIsOnline()).toBe(true);
    });

    it('should emit online/offline events', async () => {
      const onlineListener = vi.fn();
      const offlineListener = vi.fn();

      syncManager.on('online', onlineListener);
      syncManager.on('offline', offlineListener);

      await syncManager.setOnlineStatus(false);
      expect(offlineListener).toHaveBeenCalled();

      await syncManager.setOnlineStatus(true);
      expect(onlineListener).toHaveBeenCalled();
    });
  });

  describe('sync operations', () => {
    it('should sync queued operations when online', async () => {
      // Queue some operations
      await store.queueOperation('set', 'patterns', 'p1', { name: 'test' });
      await store.queueOperation('set', 'patterns', 'p2', { name: 'test2' });

      const result = await syncManager.sync();

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it('should not sync when offline', async () => {
      await syncManager.setOnlineStatus(false);
      await store.queueOperation('set', 'patterns', 'p1', { name: 'test' });

      const result = await syncManager.sync();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Offline');
    });

    it('should handle empty queue', async () => {
      const result = await syncManager.sync();

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(0);
    });

    it('should emit sync events', async () => {
      const startListener = vi.fn();
      const completeListener = vi.fn();

      syncManager.on('sync-start', startListener);
      syncManager.on('sync-complete', completeListener);

      await store.queueOperation('set', 'patterns', 'p1', { name: 'test' });
      await syncManager.sync();

      expect(startListener).toHaveBeenCalled();
      expect(completeListener).toHaveBeenCalled();
    });
  });

  describe('remote sync handler', () => {
    it('should use custom remote sync handler', async () => {
      const remoteHandler = vi.fn().mockResolvedValue({ success: true });
      syncManager.setRemoteSyncHandler(remoteHandler);

      await store.queueOperation('set', 'patterns', 'p1', { name: 'test' });
      await syncManager.sync();

      expect(remoteHandler).toHaveBeenCalled();
    });

    it('should handle remote sync failures', async () => {
      const remoteHandler = vi.fn().mockResolvedValue({
        success: false,
        error: 'Network error',
      });
      syncManager.setRemoteSyncHandler(remoteHandler);

      await store.queueOperation('set', 'patterns', 'p1', { name: 'test' });
      const result = await syncManager.sync();

      expect(result.failedCount).toBeGreaterThan(0);
    });
  });

  describe('event listeners', () => {
    it('should add and remove listeners', async () => {
      const listener = vi.fn();
      syncManager.on('sync-start', listener);

      await syncManager.sync();
      expect(listener).toHaveBeenCalled();

      listener.mockClear();
      syncManager.off('sync-start', listener);

      await syncManager.sync();
      expect(listener).not.toHaveBeenCalled();
    });

    it('should remove all listeners', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      syncManager.on('sync-start', listener1);
      syncManager.on('sync-complete', listener2);
      syncManager.removeAllListeners();

      await syncManager.sync();

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('force sync', () => {
    it('should force sync immediately', async () => {
      await store.queueOperation('set', 'patterns', 'p1', { name: 'test' });

      const result = await syncManager.forceSync();

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(1);
    });
  });
});

// ============================================================
// Default Merge Function Tests
// ============================================================

describe('Default Merge Functions', () => {
  describe('defaultPatternMergeFn', () => {
    it('should merge patterns by timestamp', () => {
      const local = { id: 'p1', name: 'local', updatedAt: 1000 };
      const remote = { id: 'p1', name: 'remote', updatedAt: 2000 };
      const context = {
        namespace: 'patterns' as StorageNamespace,
        key: 'p1',
        localTimestamp: 1000,
        remoteTimestamp: 2000,
      };

      const result = defaultPatternMergeFn(local, remote, context);

      expect(result.name).toBe('remote');
    });

    it('should prefer local when newer', () => {
      const local = { id: 'p1', name: 'local', updatedAt: 3000 };
      const remote = { id: 'p1', name: 'remote', updatedAt: 2000 };
      const context = {
        namespace: 'patterns' as StorageNamespace,
        key: 'p1',
        localTimestamp: 3000,
        remoteTimestamp: 2000,
      };

      const result = defaultPatternMergeFn(local, remote, context);

      expect(result.name).toBe('local');
    });
  });

  describe('defaultTestHistoryMergeFn', () => {
    it('should merge test history arrays', () => {
      const local = [{ id: '1', result: 'pass' }];
      const remote = [{ id: '2', result: 'fail' }];
      const context = {
        namespace: 'tests' as StorageNamespace,
        key: 'history',
        localTimestamp: 1000,
        remoteTimestamp: 2000,
      };

      const result = defaultTestHistoryMergeFn(local, remote, context);

      expect(result).toHaveLength(2);
    });

    it('should not duplicate entries with same ID', () => {
      const local = [{ id: '1', result: 'pass' }];
      const remote = [{ id: '1', result: 'fail' }];
      const context = {
        namespace: 'tests' as StorageNamespace,
        key: 'history',
        localTimestamp: 1000,
        remoteTimestamp: 2000,
      };

      const result = defaultTestHistoryMergeFn(local, remote, context);

      expect(result).toHaveLength(1);
      expect(result[0].result).toBe('pass'); // Local kept
    });
  });
});
