/**
 * Tests for MemoryManager
 *
 * Comprehensive test suite for intelligent memory management with TTL support,
 * namespacing, and database persistence for agent coordination.
 *
 * @group unit
 * @group core
 */

import { MemoryManager, MemoryOptions, MemorySearchOptions } from '@core/MemoryManager';
import { Database } from '@utils/Database';
import { Logger } from '@utils/Logger';
import { MemoryRecord } from '@types';

// Mock Database and Logger
jest.mock('@utils/Database');
jest.mock('@utils/Logger');

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  let mockDatabase: jest.Mocked<Database>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(async () => {
    // Setup mocks
    mockDatabase = {
      initialize: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      all: jest.fn().mockResolvedValue([]),
      exec: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    (Database as jest.Mock).mockImplementation(() => mockDatabase);
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    memoryManager = new MemoryManager(mockDatabase);
    await memoryManager.initialize();
  });

  afterEach(async () => {
    await memoryManager.shutdown();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(mockDatabase.initialize).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('initialized'));
    });

    it('should not reinitialize if already initialized', async () => {
      const initCalls = mockDatabase.initialize.mock.calls.length;
      await memoryManager.initialize();
      expect(mockDatabase.initialize).toHaveBeenCalledTimes(initCalls);
    });

    it('should throw error if database initialization fails', async () => {
      const failingDb = {
        initialize: jest.fn().mockRejectedValue(new Error('DB connection failed'))
      } as any;

      const failingManager = new MemoryManager(failingDb);

      try {
        await expect(failingManager.initialize()).rejects.toThrow('DB connection failed');
      } finally {
        // CRITICAL FIX: Clean up failingManager to prevent memory leak
        // Even though initialization failed, the setInterval was already created in constructor
        await failingManager.shutdown().catch(() => {
          // Ignore shutdown errors since initialization failed
        });
      }
    });
  });

  describe('Store and Retrieve', () => {
    it('should store and retrieve a value', async () => {
      await memoryManager.store('testKey', 'testValue');
      const result = await memoryManager.retrieve('testKey');
      expect(result).toBe('testValue');
    });

    it('should store complex objects', async () => {
      const complexObject = {
        nested: { data: [1, 2, 3] },
        boolean: true,
        number: 42
      };

      await memoryManager.store('complexKey', complexObject);
      const result = await memoryManager.retrieve('complexKey');
      expect(result).toEqual(complexObject);
    });

    it('should return undefined for non-existent key', async () => {
      const result = await memoryManager.retrieve('nonExistentKey');
      expect(result).toBeUndefined();
    });

    it('should support custom namespace', async () => {
      await memoryManager.store('key', 'value1', { namespace: 'namespace1' });
      await memoryManager.store('key', 'value2', { namespace: 'namespace2' });

      const result1 = await memoryManager.retrieve('key', 'namespace1');
      const result2 = await memoryManager.retrieve('key', 'namespace2');

      expect(result1).toBe('value1');
      expect(result2).toBe('value2');
    });

    it('should emit store event', async () => {
      const listener = jest.fn();
      memoryManager.on('store', listener);

      await memoryManager.store('key', 'value');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        key: 'key',
        value: 'value'
      }));
    });

    it('should emit retrieve event', async () => {
      await memoryManager.store('key', 'value');

      const listener = jest.fn();
      memoryManager.on('retrieve', listener);

      await memoryManager.retrieve('key');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        key: 'key',
        value: 'value'
      }));
    });
  });

  describe('TTL (Time To Live)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should expire key after TTL', async () => {
      await memoryManager.store('tempKey', 'tempValue', { ttl: 1000 }); // 1 second

      // Immediately retrieve - should exist
      let result = await memoryManager.retrieve('tempKey');
      expect(result).toBe('tempValue');

      // Advance time beyond TTL
      jest.advanceTimersByTime(1001);

      // Should be expired
      result = await memoryManager.retrieve('tempKey');
      expect(result).toBeUndefined();
    });

    it('should not expire persistent keys', async () => {
      await memoryManager.store('persistentKey', 'persistentValue', { ttl: 0 });

      // Advance time significantly
      jest.advanceTimersByTime(1000000);

      const result = await memoryManager.retrieve('persistentKey');
      expect(result).toBe('persistentValue');
    });

    it('should emit expired event', async () => {
      const listener = jest.fn();
      memoryManager.on('expired', listener);

      await memoryManager.store('expireKey', 'value', { ttl: 100 });
      jest.advanceTimersByTime(101);

      await memoryManager.retrieve('expireKey');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        key: 'expireKey'
      }));
    });

    it('should set and get TTL', async () => {
      await memoryManager.store('key', 'value', { ttl: 5000 });

      const ttl = await memoryManager.getTTL('key');
      expect(ttl).toBeLessThanOrEqual(5000);
      expect(ttl).toBeGreaterThan(4900); // Allow small timing variance
    });

    it('should update TTL', async () => {
      await memoryManager.store('key', 'value', { ttl: 1000 });
      const updated = await memoryManager.setTTL('key', 5000);

      expect(updated).toBe(true);

      const newTTL = await memoryManager.getTTL('key');
      expect(newTTL).toBeGreaterThan(4900);
    });

    it('should return -1 TTL for persistent keys', async () => {
      await memoryManager.store('persistentKey', 'value', { ttl: 0 });
      const ttl = await memoryManager.getTTL('persistentKey');
      expect(ttl).toBe(-1);
    });
  });

  describe('Delete Operations', () => {
    it('should delete existing key', async () => {
      await memoryManager.store('deleteMe', 'value');
      const deleted = await memoryManager.delete('deleteMe');

      expect(deleted).toBe(true);

      const result = await memoryManager.retrieve('deleteMe');
      expect(result).toBeUndefined();
    });

    it('should return false for non-existent key', async () => {
      const deleted = await memoryManager.delete('nonExistent');
      expect(deleted).toBe(false);
    });

    it('should emit delete event', async () => {
      await memoryManager.store('key', 'value');

      const listener = jest.fn();
      memoryManager.on('delete', listener);

      await memoryManager.delete('key');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        key: 'key'
      }));
    });

    it('should delete from database when persistent', async () => {
      await memoryManager.store('persistentKey', 'value', { persist: true });
      await memoryManager.delete('persistentKey');

      expect(mockDatabase.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM memory_store'),
        expect.any(Array)
      );
    });
  });

  describe('Namespace Operations', () => {
    beforeEach(async () => {
      await memoryManager.store('key1', 'value1', { namespace: 'ns1' });
      await memoryManager.store('key2', 'value2', { namespace: 'ns1' });
      await memoryManager.store('key3', 'value3', { namespace: 'ns2' });
    });

    it('should list keys in namespace', async () => {
      const keys = await memoryManager.list('ns1');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });

    it('should clear all keys in namespace', async () => {
      const cleared = await memoryManager.clear('ns1');

      expect(cleared).toBe(2);

      const keys = await memoryManager.list('ns1');
      expect(keys).toHaveLength(0);

      // ns2 should be unaffected
      const ns2Keys = await memoryManager.list('ns2');
      expect(ns2Keys).toHaveLength(1);
    });

    it('should emit clear event', async () => {
      const listener = jest.fn();
      memoryManager.on('clear', listener);

      await memoryManager.clear('ns1');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        namespace: 'ns1',
        count: 2
      }));
    });

    it('should check existence in namespace', async () => {
      const exists1 = await memoryManager.exists('key1', 'ns1');
      const exists2 = await memoryManager.exists('key1', 'ns2');

      expect(exists1).toBe(true);
      expect(exists2).toBe(false);
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      await memoryManager.store('user:1', { name: 'Alice', age: 30 });
      await memoryManager.store('user:2', { name: 'Bob', age: 25 });
      await memoryManager.store('product:1', { name: 'Widget', price: 10 });
      await memoryManager.store('product:2', { name: 'Gadget', price: 20 });
    });

    it('should search by key pattern', async () => {
      const results = await memoryManager.search({ pattern: 'user:' });

      expect(results.length).toBe(2);
      expect(results[0].key).toContain('user:');
    });

    it('should search by value content', async () => {
      const results = await memoryManager.search({ pattern: 'Alice' });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should respect search limit', async () => {
      const results = await memoryManager.search({ pattern: '.*', limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should filter by namespace', async () => {
      await memoryManager.store('test', 'value', { namespace: 'special' });

      const results = await memoryManager.search({
        namespace: 'special',
        pattern: '.*'
      });

      expect(results.every(r => r.namespace === 'special')).toBe(true);
    });

    it('should exclude expired by default', async () => {
      await memoryManager.store('expiring', 'value', { ttl: 100 });

      jest.useFakeTimers();
      jest.advanceTimersByTime(101);

      const results = await memoryManager.search({ pattern: 'expiring' });
      expect(results).toHaveLength(0);

      jest.useRealTimers();
    });

    it('should include expired when requested', async () => {
      await memoryManager.store('expiring', 'value', { ttl: 100 });

      jest.useFakeTimers();
      jest.advanceTimersByTime(101);

      const results = await memoryManager.search({
        pattern: 'expiring',
        includeExpired: true
      });

      expect(results.length).toBeGreaterThan(0);

      jest.useRealTimers();
    });
  });

  describe('Database Persistence', () => {
    it('should persist to database when enabled', async () => {
      await memoryManager.store('persistentKey', 'persistentValue', { persist: true });

      expect(mockDatabase.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO memory_store'),
        expect.any(Array)
      );
    });

    it('should not persist to database by default', async () => {
      mockDatabase.run.mockClear();

      await memoryManager.store('volatileKey', 'volatileValue');

      expect(mockDatabase.run).not.toHaveBeenCalled();
    });

    it('should load from database when not in memory', async () => {
      const dbRecord = {
        value: JSON.stringify({
          key: 'dbKey',
          value: 'dbValue',
          namespace: 'default',
          ttl: 0,
          timestamp: Date.now()
        })
      };

      mockDatabase.get.mockResolvedValue(dbRecord);

      const result = await memoryManager.retrieve('dbKey');

      expect(result).toBe('dbValue');
      expect(mockDatabase.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT value FROM memory_store'),
        expect.any(Array)
      );
    });

    it('should handle database errors gracefully', async () => {
      mockDatabase.run.mockRejectedValue(new Error('DB write failed'));

      // Should not throw, just log warning
      await expect(
        memoryManager.store('key', 'value', { persist: true })
      ).resolves.not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to persist'),
        expect.any(Error)
      );
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await memoryManager.store('key1', 'value1', { namespace: 'ns1' });
      await memoryManager.store('key2', 'value2', { namespace: 'ns1', ttl: 0 });
      await memoryManager.store('key3', 'value3', { namespace: 'ns2' });
    });

    it('should return accurate statistics', () => {
      const stats = memoryManager.getStats();

      expect(stats).toHaveProperty('totalKeys');
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('namespaces');
      expect(stats).toHaveProperty('expiredKeys');
      expect(stats).toHaveProperty('persistentKeys');

      expect(stats.totalKeys).toBeGreaterThanOrEqual(3);
      expect(stats.namespaces).toContain('ns1');
      expect(stats.namespaces).toContain('ns2');
    });

    it('should track persistent keys', () => {
      const stats = memoryManager.getStats();
      expect(stats.persistentKeys).toBeGreaterThanOrEqual(1);
    });

    it('should calculate total size', () => {
      const stats = memoryManager.getStats();
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });

  describe('Export and Import', () => {
    beforeEach(async () => {
      await memoryManager.store('export1', 'value1');
      await memoryManager.store('export2', 'value2', { namespace: 'special' });
      await memoryManager.store('export3', 'value3');
    });

    it('should export all records', async () => {
      const records = await memoryManager.export();

      expect(records.length).toBeGreaterThanOrEqual(3);
      records.forEach(record => {
        expect(record).toHaveProperty('key');
        expect(record).toHaveProperty('value');
        expect(record).toHaveProperty('namespace');
      });
    });

    it('should export specific namespace', async () => {
      const records = await memoryManager.export('special');

      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(records.every(r => r.namespace === 'special')).toBe(true);
    });

    it('should import records', async () => {
      const records: MemoryRecord[] = [
        {
          key: 'imported1',
          value: 'importedValue1',
          namespace: 'default',
          ttl: 0,
          timestamp: Date.now()
        },
        {
          key: 'imported2',
          value: 'importedValue2',
          namespace: 'default',
          ttl: 0,
          timestamp: Date.now()
        }
      ];

      const imported = await memoryManager.import(records);

      expect(imported).toBe(2);

      const value1 = await memoryManager.retrieve('imported1');
      const value2 = await memoryManager.retrieve('imported2');

      expect(value1).toBe('importedValue1');
      expect(value2).toBe('importedValue2');
    });

    it('should handle import errors gracefully', async () => {
      const invalidRecords: MemoryRecord[] = [
        {
          key: 'valid',
          value: 'value',
          namespace: 'default',
          ttl: 0,
          timestamp: Date.now()
        },
        null as any // Invalid record
      ];

      const imported = await memoryManager.import(invalidRecords);

      // Should import only valid records
      expect(imported).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should cleanup expired keys', async () => {
      await memoryManager.store('expire1', 'value1', { ttl: 100 });
      await memoryManager.store('expire2', 'value2', { ttl: 100 });
      await memoryManager.store('persist', 'value3', { ttl: 0 });

      // Expire keys
      jest.advanceTimersByTime(101);

      memoryManager.cleanupExpired();

      const persist = await memoryManager.retrieve('persist');
      const expire1 = await memoryManager.retrieve('expire1');
      const expire2 = await memoryManager.retrieve('expire2');

      expect(persist).toBe('value3');
      expect(expire1).toBeUndefined();
      expect(expire2).toBeUndefined();
    });

    it('should emit cleanup event', async () => {
      const listener = jest.fn();
      memoryManager.on('cleanup', listener);

      await memoryManager.store('expire', 'value', { ttl: 100 });
      jest.advanceTimersByTime(101);

      memoryManager.cleanupExpired();

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        expiredCount: expect.any(Number)
      }));
    });

    it('should automatically cleanup on interval', async () => {
      await memoryManager.store('autoExpire', 'value', { ttl: 100 });

      // Wait for cleanup interval (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000 + 101);

      const result = await memoryManager.retrieve('autoExpire');
      expect(result).toBeUndefined();
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await memoryManager.store('key', 'value');
      await memoryManager.shutdown();

      expect(mockDatabase.close).toHaveBeenCalled();
    });

    it('should save data to persistence before shutdown', async () => {
      await memoryManager.store('key', 'value');
      mockDatabase.run.mockClear();

      await memoryManager.shutdown();

      expect(mockDatabase.run).toHaveBeenCalled();
    });

    it('should clear all listeners', async () => {
      const listener = jest.fn();
      memoryManager.on('store', listener);

      await memoryManager.shutdown();

      await memoryManager.store('key', 'value');

      // Listener should not be called after shutdown
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Concurrency', () => {
    it('should handle concurrent store operations', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(memoryManager.store(`concurrent${i}`, `value${i}`));
      }

      await Promise.all(promises);

      // All values should be stored
      for (let i = 0; i < 10; i++) {
        const result = await memoryManager.retrieve(`concurrent${i}`);
        expect(result).toBe(`value${i}`);
      }
    });

    it('should handle concurrent retrieve operations', async () => {
      await memoryManager.store('sharedKey', 'sharedValue');

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(memoryManager.retrieve('sharedKey'));
      }

      const results = await Promise.all(promises);

      expect(results.every(r => r === 'sharedValue')).toBe(true);
    });

    it('should handle mixed concurrent operations', async () => {
      const operations = [
        memoryManager.store('key1', 'value1'),
        memoryManager.retrieve('key1'),
        memoryManager.delete('key1'),
        memoryManager.store('key2', 'value2'),
        memoryManager.list(),
        memoryManager.clear()
      ];

      await expect(Promise.all(operations)).resolves.not.toThrow();
    });
  });
});
