/**
 * Storage Module Exports
 *
 * Provides offline-first storage capabilities for the VS Code extension.
 * Includes storage adapters, offline store, sync management, and conflict resolution.
 *
 * Phase 1: P1-005 - Offline-First Storage Layer
 *
 * @module vscode-extension/storage
 * @version 0.1.0
 */

// Import classes for use in factory function
import { VSCodeStorageAdapter as VSCodeStorageAdapterClass } from './VSCodeStorageAdapter';
import { OfflineStore as OfflineStoreClass } from './OfflineStore';
import { SyncManager as SyncManagerClass } from './SyncManager';
import { ConflictResolver as ConflictResolverClass } from './ConflictResolver';

// Storage Adapter - Abstract interface and utilities
export {
  type IStorageAdapter,
  type StorageNamespace,
  type StorageEntry,
  type StorageQueryOptions,
  type StorageOperationResult,
  type StorageStats,
  type StorageMigration,
  type SetOptions,
  type ImportOptions,
  createStorageKey,
  parseStorageKey,
  generateChecksum,
  verifyChecksum,
  DEFAULT_SCHEMA_VERSION,
  STORAGE_SIZE_WARNING_THRESHOLD,
  MAX_ENTRIES_PER_NAMESPACE,
} from './StorageAdapter';

// VS Code Storage Adapter - Implementation for VS Code extension
export {
  VSCodeStorageAdapter,
  type VSCodeStorageType,
  type VSCodeStorageAdapterConfig,
  createGlobalStorageAdapter,
  createWorkspaceStorageAdapter,
} from './VSCodeStorageAdapter';

// Offline Store - Main storage manager
export {
  OfflineStore,
  type StoreEventType,
  type StoreEvent,
  type StoreEventListener,
  type QueuedOperation,
  type OfflineStoreConfig,
  createOfflineStore,
} from './OfflineStore';

// Sync Manager - Online/offline synchronization
export {
  SyncManager,
  type SyncStatus,
  type SyncEventType,
  type SyncEvent,
  type SyncEventListener,
  type SyncOperationResult,
  type SyncResult,
  type RemoteSyncHandler,
  type SyncManagerConfig,
  createSyncManager,
} from './SyncManager';

// Conflict Resolver - Sync conflict resolution
export {
  ConflictResolver,
  type ResolutionStrategy,
  type ConflictType,
  type Conflict,
  type ConflictResolution,
  type ResolutionAuditEntry,
  type ManualResolutionCallback,
  type MergeFunction,
  type MergeContext,
  type ConflictResolverConfig,
  createConflictResolver,
  defaultPatternMergeFn,
  defaultTestHistoryMergeFn,
} from './ConflictResolver';

/**
 * Create a complete storage system with all components
 *
 * @param context - VS Code extension context
 * @param options - Configuration options
 * @returns Object with store, syncManager, and conflictResolver
 */
export function createStorageSystem(
  context: import('vscode').ExtensionContext,
  options?: {
    storageType?: 'global' | 'workspace';
    autoSync?: boolean;
    debugMode?: boolean;
    defaultResolutionStrategy?: 'local-wins' | 'remote-wins' | 'merge' | 'newest-wins' | 'manual';
  }
): {
  adapter: VSCodeStorageAdapterClass;
  store: OfflineStoreClass;
  syncManager: SyncManagerClass;
  conflictResolver: ConflictResolverClass;
  initialize: () => Promise<void>;
  shutdown: () => Promise<void>;
} {
  // Create adapter
  const adapter = new VSCodeStorageAdapterClass({
    context,
    storageType: options?.storageType ?? 'global',
    debugMode: options?.debugMode ?? false,
  });

  // Create conflict resolver
  const conflictResolver = new ConflictResolverClass({
    defaultStrategy: options?.defaultResolutionStrategy ?? 'newest-wins',
    debugMode: options?.debugMode ?? false,
  });

  // Create store
  const store = new OfflineStoreClass({
    adapter,
    debugMode: options?.debugMode ?? false,
  });

  // Create sync manager
  const syncManager = new SyncManagerClass({
    store,
    conflictResolver,
    autoSync: options?.autoSync ?? true,
    debugMode: options?.debugMode ?? false,
  });

  return {
    adapter,
    store,
    syncManager,
    conflictResolver,
    initialize: async () => {
      await store.initialize();
      await syncManager.initialize();
    },
    shutdown: async () => {
      await syncManager.shutdown();
      await store.shutdown();
    },
  };
}
