/**
 * DefaultMemoryStrategy - Standard agent memory implementation
 *
 * Wraps SwarmMemoryManager for backward compatibility.
 * Provides local and shared memory operations.
 *
 * @module core/strategies/DefaultMemoryStrategy
 * @version 1.0.0
 */

import type { QEAgentType, MemoryStore } from '../../types';
import type { SwarmMemoryManager, StoreOptions } from '../memory/SwarmMemoryManager';
import type {
  AgentMemoryStrategy,
  MemoryOptions,
  MemoryEntry,
  MemoryQueryOptions,
  MemoryStats,
} from './AgentMemoryStrategy';

/**
 * DefaultMemoryStrategy - SQLite-backed storage via SwarmMemoryManager
 */
export class DefaultMemoryStrategy implements AgentMemoryStrategy {
  private memoryStore: MemoryStore | SwarmMemoryManager;
  private agentId?: string;
  private stats: MemoryStats = {
    totalEntries: 0,
    totalSize: 0,
    hitRate: 0,
    missRate: 0,
    evictionCount: 0,
    lastCleanup: new Date(),
  };
  private hits = 0;
  private misses = 0;

  constructor(memoryStore: MemoryStore | SwarmMemoryManager, agentId?: string) {
    this.memoryStore = memoryStore;
    this.agentId = agentId;
  }

  /**
   * Initialize the memory strategy
   */
  async initialize(): Promise<void> {
    // SwarmMemoryManager may already be initialized
    if (this.isSwarmMemoryManager(this.memoryStore)) {
      // SwarmMemoryManager initializes in constructor or has initialize method
      if ('initialize' in this.memoryStore && typeof this.memoryStore.initialize === 'function') {
        try {
          await this.memoryStore.initialize();
        } catch {
          // May already be initialized
        }
      }
    }
  }

  /**
   * Store a value in agent memory
   */
  async store(key: string, value: unknown, options?: MemoryOptions): Promise<void> {
    const prefixedKey = this.prefixKey(key, options?.namespace);

    if (this.isSwarmMemoryManager(this.memoryStore)) {
      const storeOpts: StoreOptions = {
        partition: options?.namespace ?? 'agent',
        ttl: options?.ttl ?? 0,
        metadata: options?.metadata,
      };
      await this.memoryStore.store(prefixedKey, value, storeOpts);
    } else {
      // Fallback for basic MemoryStore interface
      await this.memoryStore.store(prefixedKey, value, options?.ttl ?? 0);
    }

    this.stats.totalEntries++;
  }

  /**
   * Retrieve a value from agent memory
   */
  async retrieve<T = unknown>(key: string): Promise<T | undefined> {
    const prefixedKey = this.prefixKey(key);

    try {
      const result = await this.memoryStore.retrieve(prefixedKey);
      if (result !== undefined && result !== null) {
        this.hits++;
        this.updateHitRate();
        return result as T;
      }
      this.misses++;
      this.updateHitRate();
      return undefined;
    } catch {
      this.misses++;
      this.updateHitRate();
      return undefined;
    }
  }

  /**
   * Delete a value from agent memory
   */
  async delete(key: string): Promise<boolean> {
    const prefixedKey = this.prefixKey(key);

    if (this.isSwarmMemoryManager(this.memoryStore)) {
      try {
        await this.memoryStore.delete(prefixedKey);
        this.stats.totalEntries = Math.max(0, this.stats.totalEntries - 1);
        return true;
      } catch {
        return false;
      }
    }

    // Fallback: try to delete by storing null (not ideal)
    try {
      await this.memoryStore.store(prefixedKey, null, 1);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const value = await this.retrieve(key);
    return value !== undefined;
  }

  /**
   * Store in shared memory (accessible by other agents)
   */
  async storeShared(
    agentType: QEAgentType,
    key: string,
    value: unknown,
    options?: MemoryOptions
  ): Promise<void> {
    const sharedKey = `shared:${agentType}:${key}`;
    await this.store(sharedKey, value, {
      ...options,
      namespace: 'shared',
    });
  }

  /**
   * Retrieve from another agent's shared memory
   */
  async retrieveShared<T = unknown>(
    agentType: QEAgentType,
    key: string
  ): Promise<T | undefined> {
    const sharedKey = `shared:${agentType}:${key}`;
    return this.retrieve<T>(sharedKey);
  }

  /**
   * Bulk store multiple entries
   */
  async bulkStore(entries: MemoryEntry[]): Promise<void> {
    // Process in parallel with concurrency limit
    const batchSize = 10;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      await Promise.all(
        batch.map((entry) => this.store(entry.key, entry.value, entry.options))
      );
    }
  }

  /**
   * Bulk retrieve multiple values
   */
  async bulkRetrieve<T = unknown>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();

    await Promise.all(
      keys.map(async (key) => {
        const value = await this.retrieve<T>(key);
        if (value !== undefined) {
          results.set(key, value);
        }
      })
    );

    return results;
  }

  /**
   * Bulk delete multiple keys
   */
  async bulkDelete(keys: string[]): Promise<number> {
    let deleted = 0;

    await Promise.all(
      keys.map(async (key) => {
        if (await this.delete(key)) {
          deleted++;
        }
      })
    );

    return deleted;
  }

  /**
   * Query memory entries
   */
  async query<T = unknown>(options: MemoryQueryOptions): Promise<MemoryEntry[]> {
    if (this.isSwarmMemoryManager(this.memoryStore)) {
      const pattern = options.pattern ?? '*';
      const results = await this.memoryStore.query(pattern, {
        partition: options.namespace ?? 'agent',
      });

      return results.slice(0, options.limit ?? 100).map((r) => ({
        key: r.key,
        value: r.value as T,
        options: r.partition ? { namespace: r.partition } : undefined,
      }));
    }

    // Fallback: empty results
    return [];
  }

  /**
   * List all keys matching a pattern
   */
  async listKeys(pattern?: string): Promise<string[]> {
    if (this.isSwarmMemoryManager(this.memoryStore)) {
      const results = await this.memoryStore.query(pattern ?? '*');
      return results.map((r) => r.key);
    }
    return [];
  }

  /**
   * Close connections and cleanup
   */
  async close(): Promise<void> {
    if (this.isSwarmMemoryManager(this.memoryStore)) {
      await this.memoryStore.close();
    }
  }

  /**
   * Clear all agent memory
   */
  async clear(): Promise<void> {
    // Query all keys and delete them
    const keys = await this.listKeys();
    await this.bulkDelete(keys);
    this.stats.totalEntries = 0;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<MemoryStats> {
    return {
      totalEntries: this.stats.totalEntries,
      totalSize: 0,
      hitRate: this.stats.hitRate,
      missRate: this.stats.missRate,
      evictionCount: 0,
      lastCleanup: this.stats.lastCleanup,
    };
  }

  // === Private Helpers ===

  private prefixKey(key: string, namespace?: string): string {
    const ns = namespace ?? 'agent';
    return this.agentId ? `${ns}:${this.agentId}:${key}` : `${ns}:${key}`;
  }

  private updateHitRate(): void {
    const total = this.hits + this.misses;
    if (total > 0) {
      this.stats.hitRate = this.hits / total;
      this.stats.missRate = this.misses / total;
    }
  }

  private isSwarmMemoryManager(
    store: MemoryStore | SwarmMemoryManager
  ): store is SwarmMemoryManager {
    return 'query' in store && typeof (store as SwarmMemoryManager).query === 'function';
  }
}

/**
 * Factory function for creating memory strategies
 */
export function createMemoryStrategy(
  memoryStore: MemoryStore | SwarmMemoryManager,
  agentId?: string
): AgentMemoryStrategy {
  return new DefaultMemoryStrategy(memoryStore, agentId);
}
