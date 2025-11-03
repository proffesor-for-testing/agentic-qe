/**
 * MemoryManager - Intelligent memory management for AQE Fleet
 *
 * Provides in-memory storage with TTL support, namespacing, and optional
 * SQLite persistence for cross-session memory and agent coordination.
 */

import { EventEmitter } from 'events';
import { Database } from '../utils/Database';
import { Logger } from '../utils/Logger';
import { MemoryRecord } from '../types';

export interface MemoryOptions {
  ttl?: number;
  namespace?: string;
  metadata?: Record<string, any>;
  persist?: boolean;
}

export interface MemorySearchOptions {
  namespace?: string;
  pattern?: string;
  limit?: number;
  includeExpired?: boolean;
}

export interface MemoryStats {
  totalKeys: number;
  totalSize: number;
  namespaces: string[];
  expiredKeys: number;
  persistentKeys: number;
}

export class MemoryManager extends EventEmitter {
  private readonly storage: Map<string, MemoryRecord> = new Map();
  private readonly database: Database;
  private readonly logger: Logger;
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly defaultTTL: number = 3600000; // 1 hour in milliseconds
  private initialized: boolean = false;

  constructor(database?: Database) {
    super();
    this.database = database || new Database();
    this.logger = Logger.getInstance();

    // Setup automatic cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);
  }

  /**
   * Initialize the memory manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize database if it has an initialize method (defensive programming for mocks)
      if (typeof this.database.initialize === 'function') {
        await this.database.initialize();
      }

      // Load persistent memory from database if available
      await this.loadPersistentMemory();

      this.initialized = true;
      this.logger.info('MemoryManager initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize MemoryManager:', error);
      throw error;
    }
  }

  /**
   * Store a value in memory
   */
  async store(
    key: string,
    value: any,
    options: MemoryOptions = {}
  ): Promise<void> {
    const namespace = options.namespace || 'default';
    const fullKey = this.createFullKey(key, namespace);
    const ttl = options.ttl || this.defaultTTL;
    const expiresAt = ttl > 0 ? Date.now() + ttl : undefined;

    const record: MemoryRecord = {
      key,
      value,
      namespace,
      ttl,
      metadata: options.metadata,
      timestamp: Date.now()
    };

    // Store in memory
    this.storage.set(fullKey, record);

    // Store in database if persistence is enabled
    if (options.persist && this.database) {
      try {
        // Use the database's run method to store the record
        const sql = `INSERT OR REPLACE INTO memory_store (key, value, namespace, ttl, metadata, created_at, expires_at)
                     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`;
        await this.database.run(sql, [
          key,
          JSON.stringify(record),
          namespace,
          ttl,
          JSON.stringify(options.metadata || {}),
          expiresAt ? new Date(expiresAt).toISOString() : null
        ]);
      } catch (error) {
        this.logger.warn('Failed to persist memory to database:', error);
      }
    }

    this.emit('store', { key, namespace, value, ttl });

    this.logger.debug(`Stored key ${fullKey}`, {
      namespace,
      ttl,
      persist: options.persist
    });
  }

  /**
   * Retrieve a value from memory
   */
  async retrieve(
    key: string,
    namespace: string = 'default'
  ): Promise<any> {
    const fullKey = this.createFullKey(key, namespace);
    const record = this.storage.get(fullKey);

    if (!record) {
      // Try loading from database if not in memory
      const persistentRecord = await this.loadFromDatabase(key, namespace);
      if (persistentRecord) {
        // Add back to memory
        this.storage.set(fullKey, persistentRecord);
        return persistentRecord.value;
      }
      return undefined;
    }

    // Check if expired
    if (this.isExpired(record)) {
      this.storage.delete(fullKey);
      this.emit('expired', { key, namespace });
      return undefined;
    }

    this.emit('retrieve', { key, namespace, value: record.value });
    return record.value;
  }

  /**
   * Set data in memory (alias for store, implements MemoryStore interface)
   */
  async set(key: string, value: any, namespace: string = 'default'): Promise<void> {
    await this.store(key, value, { namespace });
  }

  /**
   * Get data from memory (alias for retrieve, implements MemoryStore interface)
   */
  async get(key: string, namespace: string = 'default'): Promise<any> {
    return await this.retrieve(key, namespace);
  }

  /**
   * Delete a key from memory
   */
  async delete(
    key: string,
    namespace: string = 'default'
  ): Promise<boolean> {
    const fullKey = this.createFullKey(key, namespace);
    const existed = this.storage.delete(fullKey);

    // Also delete from database
    if (this.database) {
      try {
        const sql = `DELETE FROM memory_store WHERE key = ? AND namespace = ?`;
        await this.database.run(sql, [key, namespace]);
      } catch (error) {
        this.logger.warn('Failed to delete from database:', error);
      }
    }

    if (existed) {
      this.emit('delete', { key, namespace });
    }

    return existed;
  }

  /**
   * Check if a key exists
   */
  async exists(
    key: string,
    namespace: string = 'default'
  ): Promise<boolean> {
    const fullKey = this.createFullKey(key, namespace);
    const record = this.storage.get(fullKey);

    if (!record) {
      // Check database
      const persistentRecord = await this.loadFromDatabase(key, namespace);
      return !!persistentRecord;
    }

    // Check if expired
    if (this.isExpired(record)) {
      this.storage.delete(fullKey);
      return false;
    }

    return true;
  }

  /**
   * List all keys in a namespace
   */
  async list(namespace: string = 'default'): Promise<string[]> {
    const prefix = `${namespace}:`;
    const keys: string[] = [];

    // Get from memory
    for (const [fullKey, record] of this.storage.entries()) {
      if (fullKey.startsWith(prefix) && !this.isExpired(record)) {
        keys.push(record.key);
      }
    }

    // Get from database
    if (this.database) {
      try {
        const sql = `SELECT key FROM memory_store WHERE namespace = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`;
        const rows = await this.database.all(sql, [namespace]);
        const dbKeys = rows.map(row => row.key);
        // Merge and deduplicate
        const allKeys = new Set([...keys, ...dbKeys]);
        return Array.from(allKeys);
      } catch (error) {
        this.logger.warn('Failed to list keys from database:', error);
      }
    }

    return keys;
  }

  /**
   * Search for keys by pattern
   */
  async search(options: MemorySearchOptions = {}): Promise<MemoryRecord[]> {
    const {
      namespace = 'default',
      pattern = '.*',
      limit = 100,
      includeExpired = false
    } = options;

    const regex = new RegExp(pattern, 'i');
    const results: MemoryRecord[] = [];
    const prefix = `${namespace}:`;

    for (const [fullKey, record] of this.storage.entries()) {
      if (results.length >= limit) break;

      if (fullKey.startsWith(prefix)) {
        const isExpired = this.isExpired(record);

        if (!includeExpired && isExpired) {
          continue;
        }

        if (regex.test(record.key) || regex.test(JSON.stringify(record.value))) {
          results.push({ ...record });
        }
      }
    }

    return results;
  }

  /**
   * Clear all keys in a namespace
   */
  async clear(namespace: string = 'default'): Promise<number> {
    const prefix = `${namespace}:`;
    const keysToDelete: string[] = [];

    // Find keys to delete
    for (const fullKey of this.storage.keys()) {
      if (fullKey.startsWith(prefix)) {
        keysToDelete.push(fullKey);
      }
    }

    // Delete from memory
    for (const fullKey of keysToDelete) {
      this.storage.delete(fullKey);
    }

    // Clear from database
    if (this.database) {
      try {
        const sql = `DELETE FROM memory_store WHERE namespace = ?`;
        await this.database.run(sql, [namespace]);
      } catch (error) {
        this.logger.warn('Failed to clear namespace from database:', error);
      }
    }

    this.emit('clear', { namespace, count: keysToDelete.length });
    return keysToDelete.length;
  }

  /**
   * Get memory statistics
   */
  getStats(): MemoryStats {
    const namespaces = new Set<string>();
    let totalSize = 0;
    let expiredKeys = 0;
    let persistentKeys = 0;

    for (const [, record] of this.storage.entries()) {
      namespaces.add(record.namespace);
      totalSize += JSON.stringify(record).length;

      if (this.isExpired(record)) {
        expiredKeys++;
      }

      if (record.ttl === undefined || record.ttl <= 0) {
        persistentKeys++;
      }
    }

    return {
      totalKeys: this.storage.size,
      totalSize,
      namespaces: Array.from(namespaces),
      expiredKeys,
      persistentKeys
    };
  }

  /**
   * Set TTL for an existing key
   */
  async setTTL(
    key: string,
    ttl: number,
    namespace: string = 'default'
  ): Promise<boolean> {
    const fullKey = this.createFullKey(key, namespace);
    const record = this.storage.get(fullKey);

    if (!record) {
      return false;
    }

    record.ttl = ttl;
    record.timestamp = Date.now(); // Reset timestamp

    this.storage.set(fullKey, record);
    this.emit('ttl_updated', { key, namespace, ttl });

    return true;
  }

  /**
   * Get TTL for a key
   */
  async getTTL(
    key: string,
    namespace: string = 'default'
  ): Promise<number | undefined> {
    const fullKey = this.createFullKey(key, namespace);
    const record = this.storage.get(fullKey);

    if (!record) {
      return undefined;
    }

    if (record.ttl === undefined || record.ttl <= 0) {
      return -1; // Persistent key
    }

    const elapsed = Date.now() - record.timestamp;
    const remaining = record.ttl - elapsed;

    return remaining > 0 ? remaining : 0;
  }

  /**
   * Export memory data for backup
   */
  async export(namespace?: string): Promise<MemoryRecord[]> {
    const records: MemoryRecord[] = [];

    for (const [, record] of this.storage.entries()) {
      if (!namespace || record.namespace === namespace) {
        if (!this.isExpired(record)) {
          records.push({ ...record });
        }
      }
    }

    return records;
  }

  /**
   * Import memory data from backup
   */
  async import(records: MemoryRecord[]): Promise<number> {
    let imported = 0;

    for (const record of records) {
      try {
        await this.store(record.key, record.value, {
          namespace: record.namespace,
          ttl: record.ttl,
          metadata: record.metadata,
          persist: true
        });
        imported++;
      } catch (error) {
        this.logger.warn(`Failed to import record ${record.key}:`, error);
      }
    }

    this.logger.info(`Imported ${imported} memory records`);
    return imported;
  }

  /**
   * Cleanup expired keys
   */
  cleanupExpired(): void {
    const expiredKeys: string[] = [];

    for (const [fullKey, record] of this.storage.entries()) {
      if (this.isExpired(record)) {
        expiredKeys.push(fullKey);
      }
    }

    for (const fullKey of expiredKeys) {
      this.storage.delete(fullKey);
    }

    if (expiredKeys.length > 0) {
      this.emit('cleanup', { expiredCount: expiredKeys.length });
      this.logger.debug(`Cleaned up ${expiredKeys.length} expired keys`);
    }
  }

  /**
   * Shutdown memory manager and clean up resources
   *
   * @remarks
   * CRITICAL: This method MUST be called to prevent memory leaks.
   * Clears the cleanup interval, saves data to persistence, and closes database.
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Save all non-expired data to database
    await this.saveToPersistence();

    await this.database.close();
    this.storage.clear();
    this.removeAllListeners();

    this.initialized = false;
    this.logger.info('MemoryManager shutdown complete');
  }

  /**
   * Alias for shutdown() - for consistency with other components
   *
   * @see shutdown
   */
  async close(): Promise<void> {
    await this.shutdown();
  }

  /**
   * Create full key with namespace
   */
  private createFullKey(key: string, namespace: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * Check if a record is expired
   */
  private isExpired(record: MemoryRecord): boolean {
    if (record.ttl === undefined || record.ttl <= 0) {
      return false; // Persistent key
    }

    const elapsed = Date.now() - record.timestamp;
    return elapsed > record.ttl;
  }

  /**
   * Load a record from database
   */
  private async loadFromDatabase(
    key: string,
    namespace: string
  ): Promise<MemoryRecord | undefined> {
    if (!this.database) {
      return undefined;
    }

    try {
      const sql = `SELECT value FROM memory_store WHERE key = ? AND namespace = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`;
      const row = await this.database.get(sql, [key, namespace]);
      if (row) {
        return JSON.parse(row.value) as MemoryRecord;
      }
    } catch (error) {
      this.logger.warn('Failed to load from database:', error);
    }

    return undefined;
  }

  /**
   * Load persistent memory from database
   */
  private async loadPersistentMemory(): Promise<void> {
    if (!this.database) {
      return;
    }

    try {
      // This is a simplified implementation
      // In a real implementation, you would iterate through all namespaces
      const namespaces = ['default', 'fleet', 'agents', 'tasks', 'coordination'];

      for (const namespace of namespaces) {
        try {
          const sql = `SELECT key FROM memory_store WHERE namespace = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`;
          const rows = await this.database.all(sql, [namespace]);

          for (const row of rows) {
            const record = await this.loadFromDatabase(row.key, namespace);
            if (record && !this.isExpired(record)) {
              const fullKey = this.createFullKey(row.key, namespace);
              this.storage.set(fullKey, record);
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to load keys for namespace ${namespace}:`, error);
        }
      }

      this.logger.info('Loaded persistent memory from database');

    } catch (error) {
      this.logger.warn('Failed to load persistent memory:', error);
    }
  }

  /**
   * Save memory to persistence
   */
  private async saveToPersistence(): Promise<void> {
    if (!this.database) {
      return;
    }

    try {
      let saved = 0;

      for (const [, record] of this.storage.entries()) {
        if (!this.isExpired(record)) {
          const sql = `INSERT OR REPLACE INTO memory_store (key, value, namespace, ttl, metadata, created_at, expires_at)
                       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`;
          const expiresAt = record.ttl && record.ttl > 0 ? new Date(record.timestamp + record.ttl).toISOString() : null;
          await this.database.run(sql, [
            record.key,
            JSON.stringify(record),
            record.namespace,
            record.ttl || 0,
            JSON.stringify(record.metadata || {}),
            expiresAt
          ]);
          saved++;
        }
      }

      this.logger.info(`Saved ${saved} memory records to persistence`);

    } catch (error) {
      this.logger.warn('Failed to save to persistence:', error);
    }
  }
}