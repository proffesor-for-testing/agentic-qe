/**
 * Memory Sync Adapter
 *
 * Wraps SwarmMemoryManager to provide automatic sync to cloud persistence.
 * Intercepts memory operations and queues them for background sync.
 *
 * @module persistence/adapters/MemorySyncAdapter
 */

import { EventEmitter } from 'events';
import type {
  IPersistenceProvider,
  MemoryEntry,
  MemoryAccessLevel,
} from '../IPersistenceProvider.js';
import type { SwarmMemoryManager, SerializableValue } from '../../core/memory/SwarmMemoryManager.js';

// ============================================
// Types
// ============================================

/**
 * Configuration for MemorySyncAdapter
 */
export interface MemorySyncAdapterConfig {
  /** The persistence provider to sync to */
  provider: IPersistenceProvider;
  /** The SwarmMemoryManager to wrap */
  memoryManager: SwarmMemoryManager;
  /** Default owner for synced entries */
  defaultOwner?: string;
  /** Default access level for synced entries */
  defaultAccessLevel?: MemoryAccessLevel;
  /** Partitions to sync (empty = all) */
  syncPartitions?: string[];
  /** Partitions to exclude from sync */
  excludePartitions?: string[];
  /** Minimum sync interval in ms */
  syncDebounceMs?: number;
  /** Enable auto-sync on write */
  autoSync?: boolean;
}

/**
 * Memory operation for sync queue
 */
interface MemoryOperation {
  type: 'set' | 'delete';
  key: string;
  partition: string;
  value?: string;
  timestamp: number;
}

// ============================================
// Adapter Implementation
// ============================================

/**
 * MemorySyncAdapter wraps SwarmMemoryManager to sync memory to cloud
 *
 * @example
 * ```typescript
 * const adapter = new MemorySyncAdapter({
 *   provider: hybridProvider,
 *   memoryManager: swarmMemory,
 *   defaultOwner: 'agent-1',
 *   autoSync: true,
 * });
 *
 * // Use adapter methods - they sync automatically
 * await adapter.set('config', { theme: 'dark' }, 'settings');
 *
 * // Or trigger manual sync
 * await adapter.sync();
 * ```
 */
export class MemorySyncAdapter extends EventEmitter {
  private readonly config: Required<MemorySyncAdapterConfig>;
  private syncQueue: MemoryOperation[] = [];
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  constructor(config: MemorySyncAdapterConfig) {
    super();

    this.config = {
      provider: config.provider,
      memoryManager: config.memoryManager,
      defaultOwner: config.defaultOwner ?? 'system',
      defaultAccessLevel: config.defaultAccessLevel ?? 'owner',
      syncPartitions: config.syncPartitions ?? [],
      excludePartitions: config.excludePartitions ?? ['_internal', '_system'],
      syncDebounceMs: config.syncDebounceMs ?? 1000,
      autoSync: config.autoSync ?? true,
    };
  }

  // ============================================
  // Memory Operations (with sync)
  // ============================================

  /**
   * Set a value in memory and queue for sync
   */
  async set(
    key: string,
    value: SerializableValue,
    partition = 'default',
    options?: {
      owner?: string;
      accessLevel?: MemoryAccessLevel;
      teamId?: string;
      swarmId?: string;
      ttl?: number;
    }
  ): Promise<void> {
    // Write to local memory first
    await this.config.memoryManager.set(key, value, partition);

    // Queue for sync if partition is not excluded
    if (this.shouldSync(partition)) {
      this.queueOperation({
        type: 'set',
        key,
        partition,
        value: JSON.stringify(value),
        timestamp: Date.now(),
      });

      // Prepare entry for sync
      const entry: MemoryEntry = {
        key,
        value: JSON.stringify(value),
        partition,
        owner: options?.owner ?? this.config.defaultOwner,
        accessLevel: options?.accessLevel ?? this.config.defaultAccessLevel,
        teamId: options?.teamId,
        swarmId: options?.swarmId,
        createdAt: new Date(),
        expiresAt: options?.ttl ? new Date(Date.now() + options.ttl) : null,
      };

      // Sync immediately if provider supports it
      if (this.config.autoSync && this.config.provider.storeMemoryEntry) {
        try {
          await this.config.provider.storeMemoryEntry(entry);
          this.emit('synced', { key, partition });
        } catch (error) {
          console.warn(`[MemorySyncAdapter] Failed to sync ${key}:`, error);
          // Will be retried in next batch sync
        }
      }
    }
  }

  /**
   * Get a value from memory (local first, then cloud)
   */
  async get(key: string, partition = 'default'): Promise<SerializableValue | null> {
    // Try local first
    const localValue = await this.config.memoryManager.get(key, partition);
    if (localValue !== null) {
      return localValue;
    }

    // Try cloud if available
    if (this.config.provider.getMemoryEntry) {
      try {
        const cloudEntry = await this.config.provider.getMemoryEntry(key, partition);
        if (cloudEntry) {
          const value = JSON.parse(cloudEntry.value) as SerializableValue;
          // Cache locally
          await this.config.memoryManager.set(key, value, partition);
          return value;
        }
      } catch (error) {
        console.warn(`[MemorySyncAdapter] Failed to get ${key} from cloud:`, error);
      }
    }

    return null;
  }

  /**
   * Delete a value from memory and sync
   */
  async delete(key: string, partition = 'default'): Promise<void> {
    // Delete from local
    this.config.memoryManager.delete(key, partition);

    // Queue for sync
    if (this.shouldSync(partition)) {
      this.queueOperation({
        type: 'delete',
        key,
        partition,
        timestamp: Date.now(),
      });

      // Sync immediately if provider supports it
      if (this.config.autoSync && this.config.provider.deleteMemoryEntries) {
        try {
          await this.config.provider.deleteMemoryEntries(key, partition);
        } catch (error) {
          console.warn(`[MemorySyncAdapter] Failed to delete ${key}:`, error);
        }
      }
    }
  }

  /**
   * Check if a key exists (checks local memory only)
   */
  async has(key: string, partition = 'default'): Promise<boolean> {
    const value = await this.config.memoryManager.get(key, partition);
    return value !== null;
  }

  // ============================================
  // Sync Operations
  // ============================================

  /**
   * Force sync all pending operations
   */
  async sync(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) {
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    let synced = 0;
    let failed = 0;

    try {
      const queue = [...this.syncQueue];
      this.syncQueue = [];

      for (const op of queue) {
        try {
          if (op.type === 'set' && op.value && this.config.provider.storeMemoryEntry) {
            const entry: MemoryEntry = {
              key: op.key,
              value: op.value,
              partition: op.partition,
              owner: this.config.defaultOwner,
              accessLevel: this.config.defaultAccessLevel,
              createdAt: new Date(op.timestamp),
              expiresAt: null,
            };
            await this.config.provider.storeMemoryEntry(entry);
            synced++;
          } else if (op.type === 'delete' && this.config.provider.deleteMemoryEntries) {
            await this.config.provider.deleteMemoryEntries(op.key, op.partition);
            synced++;
          }
        } catch (error) {
          console.warn(`[MemorySyncAdapter] Sync failed for ${op.key}:`, error);
          // Re-queue for retry
          this.syncQueue.push(op);
          failed++;
        }
      }

      this.emit('sync:completed', { synced, failed });
    } finally {
      this.isSyncing = false;
    }

    return { synced, failed };
  }

  /**
   * Import all memory from cloud to local
   */
  async importFromCloud(partition?: string): Promise<number> {
    if (!this.config.provider.queryMemoryEntries) {
      return 0;
    }

    const entries = await this.config.provider.queryMemoryEntries({
      partition,
      limit: 1000,
    });

    for (const entry of entries) {
      try {
        const value = JSON.parse(entry.value) as SerializableValue;
        await this.config.memoryManager.set(entry.key, value, entry.partition);
      } catch (error) {
        console.warn(`[MemorySyncAdapter] Failed to import ${entry.key}:`, error);
      }
    }

    this.emit('import:completed', { count: entries.length });
    return entries.length;
  }

  /**
   * Export memory entries to cloud
   * Note: Exports entries from the sync queue, call sync() for full export
   */
  async exportToCloud(): Promise<number> {
    // Flush all pending operations to cloud
    const result = await this.sync();
    this.emit('export:completed', { count: result.synced });
    return result.synced;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get sync statistics
   */
  getStats(): {
    pendingOperations: number;
    isSyncing: boolean;
    partitionsTracked: number;
  } {
    return {
      pendingOperations: this.syncQueue.length,
      isSyncing: this.isSyncing,
      partitionsTracked: this.config.syncPartitions.length || -1, // -1 = all
    };
  }

  /**
   * Clear sync queue
   */
  clearQueue(): void {
    this.syncQueue = [];
  }

  // ============================================
  // Private Methods
  // ============================================

  private shouldSync(partition: string): boolean {
    // Check exclusions
    if (this.config.excludePartitions.includes(partition)) {
      return false;
    }

    // If syncPartitions is empty, sync all (except excluded)
    if (this.config.syncPartitions.length === 0) {
      return true;
    }

    // Only sync specified partitions
    return this.config.syncPartitions.includes(partition);
  }

  private queueOperation(op: MemoryOperation): void {
    // Remove any existing operation for same key/partition
    this.syncQueue = this.syncQueue.filter(
      (existing) => !(existing.key === op.key && existing.partition === op.partition)
    );

    this.syncQueue.push(op);

    // Schedule debounced sync
    if (this.config.autoSync && !this.syncTimer) {
      this.syncTimer = setTimeout(() => {
        this.syncTimer = null;
        this.sync().catch((err) =>
          console.warn('[MemorySyncAdapter] Background sync failed:', err)
        );
      }, this.config.syncDebounceMs);
    }
  }
}

/**
 * Factory function to create a MemorySyncAdapter
 */
export function createMemorySyncAdapter(
  config: MemorySyncAdapterConfig
): MemorySyncAdapter {
  return new MemorySyncAdapter(config);
}
