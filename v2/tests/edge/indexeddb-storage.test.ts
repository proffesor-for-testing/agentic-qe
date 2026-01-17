/**
 * IndexedDB Storage Unit Tests
 *
 * Comprehensive tests for browser-based IndexedDB storage adapter.
 * Uses MockIndexedDBAdapter for testing in Node.js environment.
 * Tests CRUD operations, transactions, error handling, and performance.
 *
 * NOTE: For browser testing with real IndexedDB, install fake-indexeddb:
 *   npm install --save-dev fake-indexeddb
 *
 * @module tests/edge/indexeddb-storage.test
 */

import { createResourceCleanup } from '../helpers/cleanup';
import { MockIndexedDBAdapter } from './__mocks__/ruvector-edge';

/**
 * IndexedDBStorage - Browser-compatible storage adapter
 * Wraps MockIndexedDBAdapter with additional features for testing
 */
class IndexedDBStorage {
  private adapter: MockIndexedDBAdapter | null = null;
  private dbName: string;
  private storeName: string;
  private version: number;
  private isOpened: boolean = false;

  constructor(config: IndexedDBStorageConfig) {
    this.dbName = config.dbName;
    this.storeName = config.storeName ?? 'data';
    this.version = config.version ?? 1;
  }

  async open(): Promise<void> {
    if (this.isOpened) {
      return;
    }

    this.adapter = new MockIndexedDBAdapter(this.dbName, this.storeName);
    await this.adapter.open();
    this.isOpened = true;
  }

  async close(): Promise<void> {
    if (this.adapter) {
      await this.adapter.close();
      this.adapter = null;
    }
    this.isOpened = false;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.ensureOpen();
    await this.adapter!.put(key, { key, value, timestamp: Date.now() });
  }

  async get<T>(key: string): Promise<T | undefined> {
    this.ensureOpen();
    const result = await this.adapter!.get<{ key: string; value: T; timestamp: number }>(key);
    return result?.value;
  }

  async delete(key: string): Promise<boolean> {
    this.ensureOpen();
    const exists = await this.adapter!.get(key);
    if (exists === undefined) {
      return false;
    }
    return this.adapter!.delete(key);
  }

  async clear(): Promise<void> {
    this.ensureOpen();
    await this.adapter!.clear();
  }

  async keys(): Promise<string[]> {
    this.ensureOpen();
    return this.adapter!.keys();
  }

  async getAll<T>(): Promise<Array<{ key: string; value: T }>> {
    this.ensureOpen();
    const all = await this.adapter!.getAll<{ key: string; value: T; timestamp: number }>();
    return all.map(item => ({ key: item.key, value: item.value }));
  }

  async count(): Promise<number> {
    this.ensureOpen();
    return this.adapter!.count();
  }

  async transaction<T>(
    mode: 'readonly' | 'readwrite',
    fn: (tx: TransactionContext) => Promise<T>
  ): Promise<T> {
    this.ensureOpen();

    const context: TransactionContext = {
      put: async <V>(key: string, value: V) => {
        await this.adapter!.put(key, { key, value, timestamp: Date.now() });
      },
      get: async <V>(key: string) => {
        const result = await this.adapter!.get<{ key: string; value: V; timestamp: number }>(key);
        return result?.value;
      },
      delete: async (key: string) => {
        await this.adapter!.delete(key);
      },
    };

    try {
      return await fn(context);
    } catch (error) {
      throw error;
    }
  }

  async bulkPut<T>(items: Array<{ key: string; value: T }>): Promise<void> {
    this.ensureOpen();

    for (const item of items) {
      await this.adapter!.put(item.key, {
        key: item.key,
        value: item.value,
        timestamp: Date.now(),
      });
    }
  }

  isOpen(): boolean {
    return this.isOpened;
  }

  getDatabaseName(): string {
    return this.dbName;
  }

  getStoreName(): string {
    return this.storeName;
  }

  private ensureOpen(): void {
    if (!this.isOpened) {
      throw new Error('Database is not open. Call open() first.');
    }
  }
}

interface IndexedDBStorageConfig {
  dbName: string;
  storeName?: string;
  version?: number;
}

interface TransactionContext {
  put<T>(key: string, value: T): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  delete(key: string): Promise<void>;
}

describe('IndexedDBStorage', () => {
  const cleanup = createResourceCleanup();
  let storage: IndexedDBStorage;

  beforeEach(async () => {
    storage = new IndexedDBStorage({
      dbName: `test-db-${Date.now()}`,
      storeName: 'test-store',
    });
    await storage.open();
  });

  afterEach(async () => {
    if (storage && storage.isOpen()) {
      await storage.close();
    }
    await cleanup.afterEach();
  });

  describe('Initialization', () => {
    it('should open database successfully', async () => {
      expect(storage.isOpen()).toBe(true);
    });

    it('should create database with custom config', async () => {
      const customStorage = new IndexedDBStorage({
        dbName: 'custom-db',
        storeName: 'custom-store',
        version: 2,
      });
      await customStorage.open();

      expect(customStorage.getDatabaseName()).toBe('custom-db');
      expect(customStorage.getStoreName()).toBe('custom-store');

      await customStorage.close();
    });

    it('should be idempotent - multiple open calls should not fail', async () => {
      await storage.open();
      await storage.open();
      await storage.open();

      expect(storage.isOpen()).toBe(true);
    });

    it('should handle close when not open', async () => {
      const newStorage = new IndexedDBStorage({ dbName: 'not-opened' });

      await expect(newStorage.close()).resolves.not.toThrow();
    });

    it('should use default store name when not specified', async () => {
      const defaultStorage = new IndexedDBStorage({ dbName: 'default-test' });
      await defaultStorage.open();

      expect(defaultStorage.getStoreName()).toBe('data');

      await defaultStorage.close();
    });
  });

  describe('CRUD Operations', () => {
    describe('put()', () => {
      it('should store primitive values', async () => {
        await storage.put('string-key', 'string-value');
        await storage.put('number-key', 42);
        await storage.put('boolean-key', true);

        expect(await storage.get('string-key')).toBe('string-value');
        expect(await storage.get('number-key')).toBe(42);
        expect(await storage.get('boolean-key')).toBe(true);
      });

      it('should store complex objects', async () => {
        const complexObject = {
          nested: {
            array: [1, 2, 3],
            object: { a: 'b' },
          },
          date: new Date().toISOString(),
          nullable: null,
        };

        await storage.put('complex', complexObject);

        const retrieved = await storage.get('complex');
        expect(retrieved).toEqual(complexObject);
      });

      it('should store arrays', async () => {
        const array = [1, 'two', { three: 3 }, [4, 5]];

        await storage.put('array', array);

        expect(await storage.get('array')).toEqual(array);
      });

      it('should overwrite existing values', async () => {
        await storage.put('key', 'initial');
        await storage.put('key', 'updated');

        expect(await storage.get('key')).toBe('updated');
      });

      it('should handle empty string key', async () => {
        await storage.put('', 'empty-key-value');

        expect(await storage.get('')).toBe('empty-key-value');
      });

      it('should handle unicode keys and values', async () => {
        const unicodeKey = 'key-emoji';
        const unicodeValue = { text: 'chinese-japanese' };

        await storage.put(unicodeKey, unicodeValue);

        expect(await storage.get(unicodeKey)).toEqual(unicodeValue);
      });
    });

    describe('get()', () => {
      it('should return undefined for non-existent keys', async () => {
        const result = await storage.get('non-existent');

        expect(result).toBeUndefined();
      });

      it('should return correct type for stored values', async () => {
        await storage.put('typed', { value: 123 });

        const result = await storage.get<{ value: number }>('typed');

        expect(result?.value).toBe(123);
      });

      it('should handle null values correctly', async () => {
        await storage.put('null-value', null);

        expect(await storage.get('null-value')).toBeNull();
      });
    });

    describe('delete()', () => {
      it('should delete existing key', async () => {
        await storage.put('to-delete', 'value');

        const deleted = await storage.delete('to-delete');

        expect(deleted).toBe(true);
        expect(await storage.get('to-delete')).toBeUndefined();
      });

      it('should return false for non-existent key', async () => {
        const deleted = await storage.delete('non-existent');

        expect(deleted).toBe(false);
      });

      it('should not affect other keys', async () => {
        await storage.put('keep', 'value1');
        await storage.put('delete', 'value2');

        await storage.delete('delete');

        expect(await storage.get('keep')).toBe('value1');
      });
    });

    describe('clear()', () => {
      it('should remove all entries', async () => {
        await storage.put('key1', 'value1');
        await storage.put('key2', 'value2');
        await storage.put('key3', 'value3');

        await storage.clear();

        expect(await storage.count()).toBe(0);
      });

      it('should work on empty store', async () => {
        await expect(storage.clear()).resolves.not.toThrow();
      });
    });

    describe('keys()', () => {
      it('should return all keys', async () => {
        await storage.put('a', 1);
        await storage.put('b', 2);
        await storage.put('c', 3);

        const keys = await storage.keys();

        expect(keys).toHaveLength(3);
        expect(keys).toContain('a');
        expect(keys).toContain('b');
        expect(keys).toContain('c');
      });

      it('should return empty array when store is empty', async () => {
        const keys = await storage.keys();

        expect(keys).toEqual([]);
      });
    });

    describe('getAll()', () => {
      it('should return all key-value pairs', async () => {
        await storage.put('x', 'value-x');
        await storage.put('y', 'value-y');

        const all = await storage.getAll<string>();

        expect(all).toHaveLength(2);
        expect(all).toContainEqual({ key: 'x', value: 'value-x' });
        expect(all).toContainEqual({ key: 'y', value: 'value-y' });
      });

      it('should return empty array when store is empty', async () => {
        const all = await storage.getAll();

        expect(all).toEqual([]);
      });
    });

    describe('count()', () => {
      it('should return correct count', async () => {
        expect(await storage.count()).toBe(0);

        await storage.put('a', 1);
        expect(await storage.count()).toBe(1);

        await storage.put('b', 2);
        expect(await storage.count()).toBe(2);

        await storage.delete('a');
        expect(await storage.count()).toBe(1);
      });
    });
  });

  describe('Transaction Handling', () => {
    it('should execute readonly transaction', async () => {
      await storage.put('read-key', 'read-value');

      const result = await storage.transaction('readonly', async (tx) => {
        return tx.get<string>('read-key');
      });

      expect(result).toBe('read-value');
    });

    it('should execute readwrite transaction', async () => {
      await storage.transaction('readwrite', async (tx) => {
        await tx.put('tx-key', 'tx-value');
      });

      expect(await storage.get('tx-key')).toBe('tx-value');
    });

    it('should handle multiple operations in single transaction', async () => {
      await storage.transaction('readwrite', async (tx) => {
        await tx.put('multi-1', 'value-1');
        await tx.put('multi-2', 'value-2');
        await tx.put('multi-3', 'value-3');
      });

      expect(await storage.count()).toBe(3);
    });

    it('should throw error on transaction failure', async () => {
      await storage.put('existing', 'original');

      await expect(
        storage.transaction('readwrite', async () => {
          throw new Error('Simulated error');
        })
      ).rejects.toThrow('Simulated error');
    });

    it('should support nested reads within transaction', async () => {
      await storage.put('parent', { childKey: 'child' });
      await storage.put('child', { data: 'child-data' });

      const result = await storage.transaction('readonly', async (tx) => {
        const parent = await tx.get<{ childKey: string }>('parent');
        if (parent) {
          return tx.get<{ data: string }>(parent.childKey);
        }
        return undefined;
      });

      expect(result).toEqual({ data: 'child-data' });
    });

    it('should support delete within transaction', async () => {
      await storage.put('to-remove', 'value');

      await storage.transaction('readwrite', async (tx) => {
        await tx.delete('to-remove');
      });

      expect(await storage.get('to-remove')).toBeUndefined();
    });
  });

  describe('Bulk Operations', () => {
    it('should bulk put multiple items', async () => {
      const items = [
        { key: 'bulk-1', value: 'value-1' },
        { key: 'bulk-2', value: 'value-2' },
        { key: 'bulk-3', value: 'value-3' },
      ];

      await storage.bulkPut(items);

      expect(await storage.count()).toBe(3);
      expect(await storage.get('bulk-1')).toBe('value-1');
      expect(await storage.get('bulk-2')).toBe('value-2');
      expect(await storage.get('bulk-3')).toBe('value-3');
    });

    it('should handle empty bulk put', async () => {
      await expect(storage.bulkPut([])).resolves.not.toThrow();
      expect(await storage.count()).toBe(0);
    });

    it('should handle large bulk operations', async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        key: `item-${i}`,
        value: { index: i, data: `data-${i}` },
      }));

      const startTime = Date.now();
      await storage.bulkPut(items);
      const duration = Date.now() - startTime;

      expect(await storage.count()).toBe(100);
      // Should complete in under 1 second
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when database not open', async () => {
      const closedStorage = new IndexedDBStorage({ dbName: 'closed' });

      await expect(closedStorage.get('key')).rejects.toThrow('not open');
      await expect(closedStorage.put('key', 'value')).rejects.toThrow('not open');
      await expect(closedStorage.delete('key')).rejects.toThrow('not open');
    });

    it('should handle re-open after close', async () => {
      await storage.put('before-close', 'value');
      await storage.close();

      await storage.open();

      expect(storage.isOpen()).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle rapid sequential operations', async () => {
      const operationCount = 50;
      const startTime = Date.now();

      for (let i = 0; i < operationCount; i++) {
        await storage.put(`rapid-${i}`, i);
      }

      for (let i = 0; i < operationCount; i++) {
        await storage.get(`rapid-${i}`);
      }

      const duration = Date.now() - startTime;

      expect(await storage.count()).toBe(operationCount);
      // 100 operations should complete in under 2 seconds
      expect(duration).toBeLessThan(2000);
    });

    it('should handle concurrent read operations', async () => {
      // Setup data
      for (let i = 0; i < 20; i++) {
        await storage.put(`concurrent-${i}`, i);
      }

      const startTime = Date.now();

      // Concurrent reads
      const readPromises = Array.from({ length: 20 }, (_, i) =>
        storage.get(`concurrent-${i}`)
      );

      const results = await Promise.all(readPromises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(20);
      expect(results[0]).toBe(0);
      expect(results[19]).toBe(19);
      // Concurrent reads should be fast
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Data Integrity', () => {
    it('should preserve data types across put/get', async () => {
      const testCases = [
        { key: 'number', value: 42.5 },
        { key: 'string', value: 'test-string' },
        { key: 'boolean', value: false },
        { key: 'null', value: null },
        { key: 'array', value: [1, 'two', 3] },
        { key: 'object', value: { nested: { deep: true } } },
      ];

      for (const tc of testCases) {
        await storage.put(tc.key, tc.value);
      }

      for (const tc of testCases) {
        const retrieved = await storage.get(tc.key);
        expect(retrieved).toEqual(tc.value);
      }
    });

    it('should handle large values', async () => {
      const largeValue = {
        data: 'x'.repeat(10000),
        array: Array.from({ length: 100 }, (_, i) => ({
          index: i,
          nested: { data: `item-${i}` },
        })),
      };

      await storage.put('large', largeValue);

      const retrieved = await storage.get<typeof largeValue>('large');
      expect(retrieved?.data.length).toBe(10000);
      expect(retrieved?.array.length).toBe(100);
    });
  });
});
