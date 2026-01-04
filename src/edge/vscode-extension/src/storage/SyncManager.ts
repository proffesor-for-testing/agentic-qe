/**
 * SyncManager - Online/Offline Synchronization Handler
 *
 * Manages synchronization of offline data with a remote server
 * when network connectivity is available.
 *
 * Features:
 * - Detects online/offline status
 * - Queues operations when offline
 * - Syncs queued operations when online
 * - Handles partial sync failures
 * - Emits events for sync status changes
 *
 * Phase 1: P1-005 - Offline-First Storage Layer
 *
 * @module vscode-extension/storage/SyncManager
 * @version 0.1.0
 */

import type { OfflineStore, QueuedOperation } from './OfflineStore';
import type { ConflictResolver, ConflictResolution } from './ConflictResolver';
import type { StorageEntry, StorageNamespace } from './StorageAdapter';

/**
 * Sync status
 */
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

/**
 * Sync event types
 */
export type SyncEventType =
  | 'online'
  | 'offline'
  | 'sync-start'
  | 'sync-complete'
  | 'sync-error'
  | 'conflict'
  | 'operation-synced'
  | 'operation-failed';

/**
 * Sync event data
 */
export interface SyncEvent<T = unknown> {
  type: SyncEventType;
  timestamp: number;
  data?: T;
  error?: string;
}

/**
 * Sync event listener
 */
export type SyncEventListener<T = unknown> = (event: SyncEvent<T>) => void;

/**
 * Sync result for a single operation
 */
export interface SyncOperationResult {
  operationId: string;
  success: boolean;
  conflict?: boolean;
  resolution?: ConflictResolution;
  error?: string;
}

/**
 * Overall sync result
 */
export interface SyncResult {
  /** Whether sync completed successfully */
  success: boolean;
  /** Number of operations synced */
  syncedCount: number;
  /** Number of operations that failed */
  failedCount: number;
  /** Number of conflicts detected */
  conflictCount: number;
  /** Individual operation results */
  operations: SyncOperationResult[];
  /** Total sync duration in ms */
  duration: number;
  /** Error message if sync failed */
  error?: string;
}

/**
 * Remote sync handler function type
 */
export type RemoteSyncHandler = (
  operation: QueuedOperation
) => Promise<{
  success: boolean;
  remoteData?: StorageEntry;
  error?: string;
}>;

/**
 * Configuration for SyncManager
 */
export interface SyncManagerConfig {
  /** Offline store instance */
  store: OfflineStore;
  /** Conflict resolver instance */
  conflictResolver: ConflictResolver;
  /** Remote sync handler */
  remoteSyncHandler?: RemoteSyncHandler;
  /** Auto-sync when coming online */
  autoSync?: boolean;
  /** Sync interval when online (ms) */
  syncInterval?: number;
  /** Maximum concurrent sync operations */
  maxConcurrent?: number;
  /** Retry delay for failed operations (ms) */
  retryDelay?: number;
  /** Maximum retries before giving up */
  maxRetries?: number;
  /** Enable debug logging */
  debugMode?: boolean;
}

/**
 * SyncManager - Handles online/offline synchronization
 */
export class SyncManager {
  private readonly store: OfflineStore;
  private readonly conflictResolver: ConflictResolver;
  private remoteSyncHandler: RemoteSyncHandler | null;
  private readonly autoSync: boolean;
  private readonly syncInterval: number;
  private readonly maxConcurrent: number;
  private readonly retryDelay: number;
  private readonly maxRetries: number;
  private readonly debugMode: boolean;

  private listeners: Map<SyncEventType, Set<SyncEventListener>> = new Map();
  private syncTimer: NodeJS.Timeout | null = null;
  private isOnline: boolean = true;
  private status: SyncStatus = 'idle';
  private isSyncing: boolean = false;
  private initialized: boolean = false;

  constructor(config: SyncManagerConfig) {
    this.store = config.store;
    this.conflictResolver = config.conflictResolver;
    this.remoteSyncHandler = config.remoteSyncHandler ?? null;
    this.autoSync = config.autoSync ?? true;
    this.syncInterval = config.syncInterval ?? 30000; // 30 seconds
    this.maxConcurrent = config.maxConcurrent ?? 5;
    this.retryDelay = config.retryDelay ?? 5000; // 5 seconds
    this.maxRetries = config.maxRetries ?? 3;
    this.debugMode = config.debugMode ?? false;
  }

  /**
   * Initialize the sync manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Set initial online status
    // In VS Code extension, we'd use vscode.env.remoteName or check network
    this.isOnline = true;

    // Start periodic sync if enabled
    if (this.autoSync && this.isOnline) {
      this.startPeriodicSync();
    }

    this.initialized = true;
    this.log('SyncManager initialized');
  }

  /**
   * Set the remote sync handler
   */
  setRemoteSyncHandler(handler: RemoteSyncHandler): void {
    this.remoteSyncHandler = handler;
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * Check if currently online
   */
  getIsOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Set online status manually
   */
  async setOnlineStatus(online: boolean): Promise<void> {
    const wasOnline = this.isOnline;
    this.isOnline = online;

    if (!wasOnline && online) {
      // Just came online
      this.emit({ type: 'online', timestamp: Date.now() });
      this.status = 'idle';

      if (this.autoSync) {
        this.startPeriodicSync();
        // Sync immediately when coming online
        await this.sync();
      }
    } else if (wasOnline && !online) {
      // Just went offline
      this.emit({ type: 'offline', timestamp: Date.now() });
      this.status = 'offline';
      this.stopPeriodicSync();
    }
  }

  /**
   * Sync all queued operations
   */
  async sync(): Promise<SyncResult> {
    if (!this.initialized) {
      throw new Error('SyncManager not initialized. Call initialize() first.');
    }

    if (!this.isOnline) {
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        conflictCount: 0,
        operations: [],
        duration: 0,
        error: 'Offline - sync not possible',
      };
    }

    if (this.isSyncing) {
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        conflictCount: 0,
        operations: [],
        duration: 0,
        error: 'Sync already in progress',
      };
    }

    this.isSyncing = true;
    this.status = 'syncing';
    this.emit({ type: 'sync-start', timestamp: Date.now() });

    const startTime = Date.now();
    const results: SyncOperationResult[] = [];
    let syncedCount = 0;
    let failedCount = 0;
    let conflictCount = 0;

    try {
      // Get all queued operations
      const operations = await this.store.getQueuedOperations();

      if (operations.length === 0) {
        this.log('No operations to sync');
        this.isSyncing = false;
        this.status = 'idle';

        const duration = Date.now() - startTime;
        this.emit({
          type: 'sync-complete',
          timestamp: Date.now(),
          data: { syncedCount: 0, failedCount: 0, duration },
        });

        return {
          success: true,
          syncedCount: 0,
          failedCount: 0,
          conflictCount: 0,
          operations: [],
          duration,
        };
      }

      this.log(`Syncing ${operations.length} operations`);

      // Process operations in batches
      const batches = this.batchOperations(operations, this.maxConcurrent);

      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map((op) => this.syncOperation(op))
        );

        for (const result of batchResults) {
          results.push(result);
          if (result.success) {
            syncedCount++;
          } else {
            failedCount++;
          }
          if (result.conflict) {
            conflictCount++;
          }
        }
      }

      const duration = Date.now() - startTime;
      const success = failedCount === 0;

      this.status = success ? 'idle' : 'error';
      this.emit({
        type: 'sync-complete',
        timestamp: Date.now(),
        data: { syncedCount, failedCount, conflictCount, duration },
      });

      this.log(`Sync complete: ${syncedCount} synced, ${failedCount} failed, ${conflictCount} conflicts`);

      return {
        success,
        syncedCount,
        failedCount,
        conflictCount,
        operations: results,
        duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.status = 'error';

      this.emit({
        type: 'sync-error',
        timestamp: Date.now(),
        error: errorMessage,
      });

      this.log(`Sync error: ${errorMessage}`, 'error');

      return {
        success: false,
        syncedCount,
        failedCount,
        conflictCount,
        operations: results,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync a single operation
   */
  private async syncOperation(operation: QueuedOperation): Promise<SyncOperationResult> {
    if (!this.remoteSyncHandler) {
      // No remote handler, just remove from queue
      await this.store.removeQueuedOperation(operation.id);

      this.emit({
        type: 'operation-synced',
        timestamp: Date.now(),
        data: { operationId: operation.id, type: operation.type },
      });

      return {
        operationId: operation.id,
        success: true,
      };
    }

    try {
      // Call remote sync handler
      const remoteResult = await this.remoteSyncHandler(operation);

      if (!remoteResult.success) {
        // Sync failed
        operation.retryCount++;
        operation.lastError = remoteResult.error;

        if (operation.retryCount >= this.maxRetries) {
          // Max retries reached, remove from queue
          await this.store.removeQueuedOperation(operation.id);

          this.emit({
            type: 'operation-failed',
            timestamp: Date.now(),
            data: { operationId: operation.id, error: remoteResult.error },
          });

          return {
            operationId: operation.id,
            success: false,
            error: `Max retries exceeded: ${remoteResult.error}`,
          };
        }

        // Update retry count
        await this.store.updateQueuedOperation(operation);

        return {
          operationId: operation.id,
          success: false,
          error: remoteResult.error,
        };
      }

      // Check for conflicts
      if (remoteResult.remoteData && operation.type === 'set') {
        const localEntry = await this.store.getEntry(
          operation.namespace,
          operation.key
        );

        if (localEntry && remoteResult.remoteData) {
          // Check if there's a conflict
          const hasConflict = this.detectConflict(localEntry, remoteResult.remoteData);

          if (hasConflict) {
            const resolution = await this.conflictResolver.resolve(
              localEntry,
              remoteResult.remoteData
            );

            this.emit({
              type: 'conflict',
              timestamp: Date.now(),
              data: {
                operationId: operation.id,
                local: localEntry,
                remote: remoteResult.remoteData,
                resolution,
              },
            });

            // Apply resolution
            if (resolution.resolvedEntry) {
              await this.store.set(
                operation.namespace,
                operation.key,
                resolution.resolvedEntry.value
              );
            }

            // Remove from queue
            await this.store.removeQueuedOperation(operation.id);

            return {
              operationId: operation.id,
              success: true,
              conflict: true,
              resolution,
            };
          }
        }
      }

      // Success, remove from queue
      await this.store.removeQueuedOperation(operation.id);

      this.emit({
        type: 'operation-synced',
        timestamp: Date.now(),
        data: { operationId: operation.id, type: operation.type },
      });

      return {
        operationId: operation.id,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      operation.retryCount++;
      operation.lastError = errorMessage;
      await this.store.updateQueuedOperation(operation);

      return {
        operationId: operation.id,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Detect if there's a conflict between local and remote entries
   */
  private detectConflict(local: StorageEntry, remote: StorageEntry): boolean {
    // Conflict if both have been updated since last sync
    // and the values are different
    if (local.updatedAt !== remote.updatedAt) {
      const localJson = JSON.stringify(local.value);
      const remoteJson = JSON.stringify(remote.value);
      return localJson !== remoteJson;
    }
    return false;
  }

  /**
   * Add an event listener
   */
  on<T = unknown>(type: SyncEventType, listener: SyncEventListener<T>): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener as SyncEventListener);
  }

  /**
   * Remove an event listener
   */
  off<T = unknown>(type: SyncEventType, listener: SyncEventListener<T>): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(listener as SyncEventListener);
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(type?: SyncEventType): void {
    if (type) {
      this.listeners.delete(type);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Force sync now (ignores interval)
   */
  async forceSync(): Promise<SyncResult> {
    return this.sync();
  }

  /**
   * Pause periodic sync
   */
  pauseSync(): void {
    this.stopPeriodicSync();
    this.log('Sync paused');
  }

  /**
   * Resume periodic sync
   */
  resumeSync(): void {
    if (this.autoSync && this.isOnline) {
      this.startPeriodicSync();
      this.log('Sync resumed');
    }
  }

  /**
   * Shutdown the sync manager
   */
  async shutdown(): Promise<void> {
    this.stopPeriodicSync();
    this.listeners.clear();
    this.initialized = false;
    this.log('SyncManager shutdown');
  }

  /**
   * Start periodic sync timer
   */
  private startPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      if (this.isOnline && !this.isSyncing) {
        await this.sync();
      }
    }, this.syncInterval);
  }

  /**
   * Stop periodic sync timer
   */
  private stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Batch operations for concurrent processing
   */
  private batchOperations(operations: QueuedOperation[], batchSize: number): QueuedOperation[][] {
    const batches: QueuedOperation[][] = [];
    for (let i = 0; i < operations.length; i += batchSize) {
      batches.push(operations.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Emit an event to listeners
   */
  private emit<T>(event: SyncEvent<T>): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          this.log(`Error in sync event listener: ${error}`, 'error');
        }
      }
    }
  }

  /**
   * Log message for debugging
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (this.debugMode) {
      const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]';
      console.log(`[SyncManager] ${prefix} ${message}`);
    }
  }
}

/**
 * Create a SyncManager instance
 */
export function createSyncManager(config: SyncManagerConfig): SyncManager {
  return new SyncManager(config);
}
