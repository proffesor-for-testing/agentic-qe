/**
 * MemoryServiceAdapter - Adapts AgentMemoryService to AgentMemoryStrategy
 *
 * Provides backward compatibility during the B1.2 migration.
 * Wraps the existing AgentMemoryService to implement the strategy interface.
 *
 * Phase 2 Update: Added agentId support for automatic namespace prefixing
 * to maintain backward compatibility with BaseAgent's memory operations.
 *
 * @module agents/adapters/MemoryServiceAdapter
 * @version 1.1.0
 */

import type {
  AgentMemoryStrategy,
  MemoryOptions,
  MemoryEntry,
  MemoryQueryOptions,
  MemoryStats,
} from '../../core/strategies';
import type { QEAgentType, MemoryStore, AgentId } from '../../types';
import { AgentMemoryService } from '../memory/AgentMemoryService';
import { SwarmMemoryManager } from '../../core/memory/SwarmMemoryManager';

/**
 * Adapts AgentMemoryService to AgentMemoryStrategy interface
 *
 * Supports two namespace formats for backward compatibility:
 * - Agent-local: aqe/{agentType}/{key}
 * - Shared: aqe/shared/{agentType}/{key}
 */
export class MemoryServiceAdapter implements AgentMemoryStrategy {
  private readonly service: AgentMemoryService;
  private readonly memoryStore: MemoryStore;
  private readonly agentId?: AgentId;
  private initialized = false;
  private stats: MemoryStats = {
    totalEntries: 0,
    totalSize: 0,
    hitRate: 0,
    missRate: 0,
    evictionCount: 0,
    lastCleanup: new Date(),
  };

  constructor(service: AgentMemoryService, memoryStore: MemoryStore, agentId?: AgentId) {
    this.service = service;
    this.memoryStore = memoryStore;
    this.agentId = agentId;
  }

  // === Namespace Helpers ===

  /**
   * Create agent-local namespace key: aqe/{agentType}/{key}
   * Used for agent-private storage
   */
  private getLocalKey(key: string): string {
    if (!this.agentId) return key;
    return `aqe/${this.agentId.type}/${key}`;
  }

  /**
   * Create shared namespace key: aqe/shared/{agentType}/{key}
   * Used for cross-agent shared storage
   */
  private getSharedKey(agentType: QEAgentType, key: string): string {
    return `aqe/shared/${agentType}/${key}`;
  }

  // === Basic Operations ===

  async store(key: string, value: unknown, options?: MemoryOptions): Promise<void> {
    if (this.memoryStore instanceof SwarmMemoryManager) {
      await this.memoryStore.store(key, value, {
        partition: options?.namespace || 'default',
        ttl: options?.ttl,
        metadata: options?.metadata,
      });
    } else {
      // Basic MemoryStore interface uses ttl as number
      await this.memoryStore.store(key, value, options?.ttl);
    }
    this.stats.totalEntries++;
  }

  async retrieve<T = unknown>(key: string): Promise<T | undefined> {
    const result = await this.memoryStore.retrieve(key);
    if (result !== undefined) {
      this.stats.hitRate = (this.stats.hitRate * 0.9) + 0.1;
    } else {
      this.stats.missRate = (this.stats.missRate * 0.9) + 0.1;
    }
    return result as T | undefined;
  }

  async delete(key: string): Promise<boolean> {
    try {
      await this.memoryStore.delete(key);
      this.stats.totalEntries = Math.max(0, this.stats.totalEntries - 1);
      return true;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.retrieve(key);
    return value !== undefined;
  }

  // === Shared Memory ===

  /**
   * Store in shared memory using aqe/shared/{agentType}/{key} namespace
   * Makes data accessible to other agents of the specified type
   */
  async storeShared(
    agentType: QEAgentType,
    key: string,
    value: unknown,
    options?: MemoryOptions
  ): Promise<void> {
    const sharedKey = this.getSharedKey(agentType, key);
    // Use raw store to avoid double-prefixing
    if (this.memoryStore instanceof SwarmMemoryManager) {
      await this.memoryStore.store(sharedKey, value, {
        partition: options?.namespace || 'shared',
        ttl: options?.ttl,
        metadata: options?.metadata,
      });
    } else {
      await this.memoryStore.store(sharedKey, value, options?.ttl);
    }
    this.stats.totalEntries++;
  }

  /**
   * Retrieve from shared memory using aqe/shared/{agentType}/{key} namespace
   * Shared memory uses partition: 'shared'
   */
  async retrieveShared<T = unknown>(
    agentType: QEAgentType,
    key: string
  ): Promise<T | undefined> {
    const sharedKey = this.getSharedKey(agentType, key);
    // Use partition: 'shared' to match storeShared behavior
    let result: unknown;
    if (this.memoryStore instanceof SwarmMemoryManager) {
      result = await this.memoryStore.retrieve(sharedKey, { partition: 'shared' });
    } else {
      result = await this.memoryStore.retrieve(sharedKey);
    }
    if (result !== undefined) {
      this.stats.hitRate = (this.stats.hitRate * 0.9) + 0.1;
    } else {
      this.stats.missRate = (this.stats.missRate * 0.9) + 0.1;
    }
    return result as T | undefined;
  }

  // === Agent-Local Memory (BaseAgent compatibility) ===

  /**
   * Store in agent-local memory using aqe/{agentType}/{key} namespace
   * Maintains backward compatibility with BaseAgent.storeMemory()
   */
  async storeLocal(key: string, value: unknown, ttl?: number): Promise<void> {
    const localKey = this.getLocalKey(key);
    if (this.memoryStore instanceof SwarmMemoryManager) {
      await this.memoryStore.store(localKey, value, {
        partition: this.agentId?.type || 'default',
        ttl,
      });
    } else {
      await this.memoryStore.store(localKey, value, ttl);
    }
    this.stats.totalEntries++;
  }

  /**
   * Retrieve from agent-local memory using aqe/{agentType}/{key} namespace
   * Maintains backward compatibility with BaseAgent.retrieveMemory()
   */
  async retrieveLocal<T = unknown>(key: string): Promise<T | undefined> {
    const localKey = this.getLocalKey(key);
    const result = await this.memoryStore.retrieve(localKey);
    if (result !== undefined) {
      this.stats.hitRate = (this.stats.hitRate * 0.9) + 0.1;
    } else {
      this.stats.missRate = (this.stats.missRate * 0.9) + 0.1;
    }
    return result as T | undefined;
  }

  /**
   * Store in shared memory for this agent's type
   * Convenience method matching BaseAgent.storeSharedMemory()
   */
  async storeSharedLocal(key: string, value: unknown, ttl?: number): Promise<void> {
    if (!this.agentId) {
      throw new Error('Cannot use storeSharedLocal without agentId');
    }
    await this.storeShared(this.agentId.type, key, value, { ttl });
  }

  // === Bulk Operations ===

  async bulkStore(entries: MemoryEntry[]): Promise<void> {
    await Promise.all(
      entries.map(entry => this.store(entry.key, entry.value, entry.options))
    );
  }

  async bulkRetrieve<T = unknown>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    await Promise.all(
      keys.map(async key => {
        const value = await this.retrieve<T>(key);
        if (value !== undefined) {
          results.set(key, value);
        }
      })
    );
    return results;
  }

  async bulkDelete(keys: string[]): Promise<number> {
    let deleted = 0;
    await Promise.all(
      keys.map(async key => {
        const success = await this.delete(key);
        if (success) deleted++;
      })
    );
    return deleted;
  }

  // === Query Operations ===

  async query<T = unknown>(options: MemoryQueryOptions): Promise<MemoryEntry[]> {
    // Basic implementation - full query support requires SwarmMemoryManager
    if (this.memoryStore instanceof SwarmMemoryManager) {
      const keys = await this.listKeys(options.pattern);
      const limitedKeys = keys.slice(0, options.limit || 100);
      const entries: MemoryEntry[] = [];

      for (const key of limitedKeys) {
        const value = await this.retrieve<T>(key);
        if (value !== undefined) {
          entries.push({ key, value });
        }
      }

      return entries;
    }

    return [];
  }

  async listKeys(_pattern?: string): Promise<string[]> {
    // This would require exposing a key listing method from the memory store
    // For now, return empty array - implementations can override
    // Full implementation requires adding a listKeys method to SwarmMemoryManager
    return [];
  }

  // === Lifecycle ===

  async initialize(): Promise<void> {
    this.initialized = true;
    this.stats.lastCleanup = new Date();
  }

  async close(): Promise<void> {
    this.initialized = false;
  }

  async clear(): Promise<void> {
    // Would need to clear all keys - delegate to store if supported
    if (this.memoryStore instanceof SwarmMemoryManager) {
      // SwarmMemoryManager doesn't have a clear method exposed
      // This is a limitation of the current interface
    }
    this.stats = {
      totalEntries: 0,
      totalSize: 0,
      hitRate: 0,
      missRate: 0,
      evictionCount: 0,
      lastCleanup: new Date(),
    };
  }

  // === Metrics ===

  async getStats(): Promise<MemoryStats> {
    return { ...this.stats };
  }
}

/**
 * Create a memory strategy adapter from an existing service
 *
 * @param service - AgentMemoryService instance
 * @param memoryStore - MemoryStore (typically SwarmMemoryManager)
 * @param agentId - Optional agent ID for namespace prefixing
 */
export function createMemoryAdapter(
  service: AgentMemoryService,
  memoryStore: MemoryStore,
  agentId?: AgentId
): MemoryServiceAdapter {
  return new MemoryServiceAdapter(service, memoryStore, agentId);
}

/**
 * Extended interface for agent-local memory operations
 * Used internally by BaseAgent for backward compatibility
 */
export interface AgentLocalMemoryStrategy extends AgentMemoryStrategy {
  storeLocal(key: string, value: unknown, ttl?: number): Promise<void>;
  retrieveLocal<T = unknown>(key: string): Promise<T | undefined>;
  storeSharedLocal(key: string, value: unknown, ttl?: number): Promise<void>;
}
