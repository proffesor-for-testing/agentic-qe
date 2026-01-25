/**
 * VSCodeStorageAdapter - VS Code Storage Implementation
 *
 * Implements the IStorageAdapter interface using VS Code's
 * ExtensionContext.globalState and workspaceState APIs.
 *
 * Features:
 * - Persistent storage via globalState (survives VS Code restarts)
 * - Workspace-scoped storage via workspaceState
 * - Automatic schema migration support
 * - Storage size tracking and limits
 * - Graceful handling of storage quota exceeded
 *
 * Phase 1: P1-005 - Offline-First Storage Layer
 *
 * @module vscode-extension/storage/VSCodeStorageAdapter
 * @version 0.1.0
 */

import type * as vscode from 'vscode';
import {
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
  DEFAULT_SCHEMA_VERSION,
  STORAGE_SIZE_WARNING_THRESHOLD,
  MAX_ENTRIES_PER_NAMESPACE,
} from './StorageAdapter';

/**
 * Storage type - global (persists across workspaces) or workspace (scoped)
 */
export type VSCodeStorageType = 'global' | 'workspace';

/**
 * Configuration for VSCodeStorageAdapter
 */
export interface VSCodeStorageAdapterConfig {
  /** Extension context */
  context: vscode.ExtensionContext;
  /** Storage type to use */
  storageType: VSCodeStorageType;
  /** Enable debug logging */
  debugMode?: boolean;
  /** Maximum storage size in bytes (soft limit) */
  maxStorageSize?: number;
  /** Enable checksum verification */
  enableChecksums?: boolean;
}

/**
 * Index entry for fast key lookups
 */
interface StorageIndex {
  /** All keys by namespace */
  keysByNamespace: Record<StorageNamespace, string[]>;
  /** Total entry count */
  totalCount: number;
  /** Approximate size in bytes */
  approximateSize: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * VSCodeStorageAdapter
 *
 * Implements IStorageAdapter using VS Code's built-in storage APIs.
 */
export class VSCodeStorageAdapter implements IStorageAdapter {
  private readonly context: vscode.ExtensionContext;
  private readonly storageType: VSCodeStorageType;
  private readonly debugMode: boolean;
  private readonly maxStorageSize: number;
  private readonly enableChecksums: boolean;
  private readonly currentSchemaVersion: number = DEFAULT_SCHEMA_VERSION;

  private storage: vscode.Memento | null = null;
  private index: StorageIndex | null = null;
  private initialized: boolean = false;

  /**
   * Index storage key
   */
  private static readonly INDEX_KEY = 'aqe:__index__';

  constructor(config: VSCodeStorageAdapterConfig) {
    this.context = config.context;
    this.storageType = config.storageType;
    this.debugMode = config.debugMode ?? false;
    this.maxStorageSize = config.maxStorageSize ?? STORAGE_SIZE_WARNING_THRESHOLD;
    this.enableChecksums = config.enableChecksums ?? true;
  }

  /**
   * Initialize the storage adapter
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Select storage based on type
    this.storage =
      this.storageType === 'global'
        ? this.context.globalState
        : this.context.workspaceState;

    // Load or create index
    await this.loadOrCreateIndex();

    this.initialized = true;
    this.log('VSCodeStorageAdapter initialized');
  }

  /**
   * Get a value by key and namespace
   */
  async get<T>(namespace: StorageNamespace, key: string): Promise<StorageEntry<T> | null> {
    this.ensureInitialized();

    const fullKey = createStorageKey(namespace, key);
    const entry = this.storage!.get<StorageEntry<T>>(fullKey);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.log(`Entry expired: ${fullKey}`);
      return null;
    }

    // Verify checksum if enabled
    if (this.enableChecksums && entry.checksum) {
      const expectedChecksum = generateChecksum(entry.value);
      if (entry.checksum !== expectedChecksum) {
        this.log(`Checksum mismatch for ${fullKey}`, 'warn');
        // Return entry but mark as potentially corrupted
      }
    }

    return entry;
  }

  /**
   * Set a value by key and namespace
   */
  async set<T>(
    namespace: StorageNamespace,
    key: string,
    value: T,
    options?: SetOptions
  ): Promise<StorageOperationResult<StorageEntry<T>>> {
    this.ensureInitialized();

    const fullKey = createStorageKey(namespace, key);

    // Check if we should overwrite
    if (options?.overwrite === false) {
      const existing = this.storage!.get(fullKey);
      if (existing) {
        return {
          success: false,
          error: `Entry already exists: ${fullKey}`,
        };
      }
    }

    // Check namespace entry limit
    const namespaceKeys = this.index!.keysByNamespace[namespace] || [];
    if (namespaceKeys.length >= MAX_ENTRIES_PER_NAMESPACE && !namespaceKeys.includes(key)) {
      return {
        success: false,
        error: `Namespace ${namespace} has reached maximum entries (${MAX_ENTRIES_PER_NAMESPACE})`,
      };
    }

    // Calculate expiration
    let expiresAt: number | undefined;
    if (options?.ttl) {
      expiresAt = Date.now() + options.ttl;
    } else if (options?.expiresAt) {
      expiresAt = options.expiresAt;
    }

    // Create entry
    const now = Date.now();
    const entry: StorageEntry<T> = {
      key,
      value,
      namespace,
      createdAt: now,
      updatedAt: now,
      schemaVersion: options?.schemaVersion ?? this.currentSchemaVersion,
      expiresAt,
      checksum: this.enableChecksums ? generateChecksum(value) : undefined,
    };

    try {
      // Store entry
      await this.storage!.update(fullKey, entry);

      // Update index
      await this.updateIndex(namespace, key, 'add');

      this.log(`Set entry: ${fullKey}`);

      return {
        success: true,
        data: entry,
        affected: 1,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for quota exceeded
      if (errorMessage.includes('quota') || errorMessage.includes('storage')) {
        return {
          success: false,
          error: `Storage quota exceeded. Try clearing old entries.`,
        };
      }

      return {
        success: false,
        error: `Failed to set entry: ${errorMessage}`,
      };
    }
  }

  /**
   * Delete a value by key and namespace
   */
  async delete(namespace: StorageNamespace, key: string): Promise<StorageOperationResult<void>> {
    this.ensureInitialized();

    const fullKey = createStorageKey(namespace, key);

    // Check if entry exists
    const existing = this.storage!.get(fullKey);
    if (!existing) {
      return {
        success: false,
        error: `Entry not found: ${fullKey}`,
        affected: 0,
      };
    }

    try {
      // Delete entry (set to undefined)
      await this.storage!.update(fullKey, undefined);

      // Update index
      await this.updateIndex(namespace, key, 'remove');

      this.log(`Deleted entry: ${fullKey}`);

      return {
        success: true,
        affected: 1,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to delete entry: ${errorMessage}`,
      };
    }
  }

  /**
   * Check if a key exists in namespace
   */
  async has(namespace: StorageNamespace, key: string): Promise<boolean> {
    this.ensureInitialized();

    const fullKey = createStorageKey(namespace, key);
    const entry = this.storage!.get<StorageEntry>(fullKey);

    if (!entry) {
      return false;
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      return false;
    }

    return true;
  }

  /**
   * List all keys in a namespace
   */
  async keys(namespace: StorageNamespace, options?: StorageQueryOptions): Promise<string[]> {
    this.ensureInitialized();

    let keys = this.index!.keysByNamespace[namespace] || [];

    // Apply prefix filter
    if (options?.keyPrefix) {
      keys = keys.filter((k) => k.startsWith(options.keyPrefix!));
    }

    // Filter expired entries if not included
    if (!options?.includeExpired) {
      const validKeys: string[] = [];
      for (const key of keys) {
        const entry = await this.get(namespace, key);
        if (entry) {
          validKeys.push(key);
        }
      }
      keys = validKeys;
    }

    // Apply sorting
    if (options?.sortBy === 'key') {
      keys.sort();
      if (options.sortOrder === 'desc') {
        keys.reverse();
      }
    }

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? keys.length;
    keys = keys.slice(offset, offset + limit);

    return keys;
  }

  /**
   * Query entries with options
   */
  async query<T>(options: StorageQueryOptions): Promise<StorageEntry<T>[]> {
    this.ensureInitialized();

    const results: StorageEntry<T>[] = [];
    const namespaces: StorageNamespace[] = options.namespace
      ? [options.namespace]
      : (Object.keys(this.index!.keysByNamespace) as StorageNamespace[]);

    for (const namespace of namespaces) {
      const keys = await this.keys(namespace, { ...options, limit: undefined, offset: undefined });

      for (const key of keys) {
        const entry = await this.get<T>(namespace, key);
        if (entry) {
          results.push(entry);
        }
      }
    }

    // Apply sorting by timestamp if requested
    if (options.sortBy === 'createdAt' || options.sortBy === 'updatedAt') {
      results.sort((a, b) => {
        const aTime = options.sortBy === 'createdAt' ? a.createdAt : a.updatedAt;
        const bTime = options.sortBy === 'createdAt' ? b.createdAt : b.updatedAt;
        return options.sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      });
    }

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  /**
   * Clear all entries in a namespace
   */
  async clear(namespace: StorageNamespace): Promise<StorageOperationResult<void>> {
    this.ensureInitialized();

    const keys = this.index!.keysByNamespace[namespace] || [];
    let deletedCount = 0;

    for (const key of keys) {
      const fullKey = createStorageKey(namespace, key);
      await this.storage!.update(fullKey, undefined);
      deletedCount++;
    }

    // Update index
    this.index!.keysByNamespace[namespace] = [];
    this.index!.totalCount -= deletedCount;
    await this.saveIndex();

    this.log(`Cleared namespace ${namespace}: ${deletedCount} entries`);

    return {
      success: true,
      affected: deletedCount,
    };
  }

  /**
   * Clear all storage
   */
  async clearAll(): Promise<StorageOperationResult<void>> {
    this.ensureInitialized();

    const namespaces = Object.keys(this.index!.keysByNamespace) as StorageNamespace[];
    let totalDeleted = 0;

    for (const namespace of namespaces) {
      const result = await this.clear(namespace);
      totalDeleted += result.affected ?? 0;
    }

    // Reset index
    await this.loadOrCreateIndex(true);

    this.log(`Cleared all storage: ${totalDeleted} entries`);

    return {
      success: true,
      affected: totalDeleted,
    };
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    this.ensureInitialized();

    // Count expired entries
    let expiredCount = 0;
    const now = Date.now();

    for (const namespace of Object.keys(this.index!.keysByNamespace) as StorageNamespace[]) {
      for (const key of this.index!.keysByNamespace[namespace]) {
        const entry = this.storage!.get<StorageEntry>(createStorageKey(namespace, key));
        if (entry?.expiresAt && entry.expiresAt < now) {
          expiredCount++;
        }
      }
    }

    // Get pending sync count from sync namespace
    const pendingSyncKeys = this.index!.keysByNamespace.queue || [];

    // Convert key arrays to counts for stats
    const entriesByNamespace: Record<StorageNamespace, number> = {
      patterns: (this.index!.keysByNamespace.patterns || []).length,
      analysis: (this.index!.keysByNamespace.analysis || []).length,
      tests: (this.index!.keysByNamespace.tests || []).length,
      config: (this.index!.keysByNamespace.config || []).length,
      sync: (this.index!.keysByNamespace.sync || []).length,
      queue: (this.index!.keysByNamespace.queue || []).length,
      metadata: (this.index!.keysByNamespace.metadata || []).length,
    };

    return {
      totalEntries: this.index!.totalCount,
      entriesByNamespace,
      totalSizeBytes: this.index!.approximateSize,
      expiredEntries: expiredCount,
      pendingSyncCount: pendingSyncKeys.length,
    };
  }

  /**
   * Run migrations to update schema
   */
  async migrate(migrations: StorageMigration[]): Promise<number> {
    this.ensureInitialized();

    // Sort migrations by version
    const sortedMigrations = [...migrations].sort((a, b) => a.fromVersion - b.fromVersion);
    let migratedCount = 0;

    for (const namespace of Object.keys(this.index!.keysByNamespace) as StorageNamespace[]) {
      for (const key of this.index!.keysByNamespace[namespace]) {
        const fullKey = createStorageKey(namespace, key);
        const entry = this.storage!.get<StorageEntry>(fullKey);

        if (!entry) continue;

        let currentEntry = entry;
        let migrated = false;

        // Apply applicable migrations
        for (const migration of sortedMigrations) {
          if (currentEntry.schemaVersion === migration.fromVersion) {
            this.log(`Migrating ${fullKey} from v${migration.fromVersion} to v${migration.toVersion}`);
            currentEntry = migration.migrate(currentEntry);
            migrated = true;
          }
        }

        if (migrated) {
          await this.storage!.update(fullKey, currentEntry);
          migratedCount++;
        }
      }
    }

    this.log(`Migration complete: ${migratedCount} entries migrated`);

    return migratedCount;
  }

  /**
   * Export all data for backup
   */
  async export(): Promise<Record<string, StorageEntry[]>> {
    this.ensureInitialized();

    const exportData: Record<string, StorageEntry[]> = {};

    for (const namespace of Object.keys(this.index!.keysByNamespace) as StorageNamespace[]) {
      exportData[namespace] = [];

      for (const key of this.index!.keysByNamespace[namespace]) {
        const entry = await this.get(namespace, key);
        if (entry) {
          exportData[namespace].push(entry);
        }
      }
    }

    return exportData;
  }

  /**
   * Import data from backup
   */
  async import(
    data: Record<string, StorageEntry[]>,
    options?: ImportOptions
  ): Promise<StorageOperationResult<void>> {
    this.ensureInitialized();

    if (options?.clearFirst) {
      await this.clearAll();
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const [namespace, entries] of Object.entries(data)) {
      // Check if namespace should be imported
      if (options?.namespaces && !options.namespaces.includes(namespace as StorageNamespace)) {
        continue;
      }

      for (const entry of entries) {
        const result = await this.set(
          namespace as StorageNamespace,
          entry.key,
          entry.value,
          {
            overwrite: options?.overwrite ?? true,
            schemaVersion: entry.schemaVersion,
          }
        );

        if (result.success) {
          importedCount++;
        } else {
          skippedCount++;
        }
      }
    }

    this.log(`Import complete: ${importedCount} imported, ${skippedCount} skipped`);

    return {
      success: true,
      affected: importedCount,
    };
  }

  /**
   * Get the current schema version
   */
  getSchemaVersion(): number {
    return this.currentSchemaVersion;
  }

  /**
   * Close the storage adapter
   */
  async close(): Promise<void> {
    if (this.index) {
      await this.saveIndex();
    }

    this.storage = null;
    this.index = null;
    this.initialized = false;

    this.log('VSCodeStorageAdapter closed');
  }

  /**
   * Load or create the storage index
   */
  private async loadOrCreateIndex(forceCreate: boolean = false): Promise<void> {
    if (!forceCreate) {
      const existingIndex = this.storage!.get<StorageIndex>(VSCodeStorageAdapter.INDEX_KEY);
      if (existingIndex) {
        this.index = existingIndex;
        return;
      }
    }

    // Create new index
    this.index = {
      keysByNamespace: {
        patterns: [],
        analysis: [],
        tests: [],
        config: [],
        sync: [],
        queue: [],
        metadata: [],
      },
      totalCount: 0,
      approximateSize: 0,
      lastUpdated: Date.now(),
    };

    await this.saveIndex();
  }

  /**
   * Save the index to storage
   */
  private async saveIndex(): Promise<void> {
    if (!this.index) return;

    this.index.lastUpdated = Date.now();
    await this.storage!.update(VSCodeStorageAdapter.INDEX_KEY, this.index);
  }

  /**
   * Update the index when entries change
   */
  private async updateIndex(
    namespace: StorageNamespace,
    key: string,
    operation: 'add' | 'remove'
  ): Promise<void> {
    if (!this.index) return;

    const keys = this.index.keysByNamespace[namespace] || [];
    const keyIndex = keys.indexOf(key);

    if (operation === 'add') {
      if (keyIndex === -1) {
        keys.push(key);
        this.index.totalCount++;
        // Rough size estimate
        this.index.approximateSize += key.length * 10;
      }
    } else if (operation === 'remove') {
      if (keyIndex !== -1) {
        keys.splice(keyIndex, 1);
        this.index.totalCount--;
        this.index.approximateSize -= key.length * 10;
      }
    }

    this.index.keysByNamespace[namespace] = keys;
    await this.saveIndex();
  }

  /**
   * Ensure the adapter is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('VSCodeStorageAdapter not initialized. Call initialize() first.');
    }
  }

  /**
   * Log message for debugging
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (this.debugMode) {
      const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]';
      console.log(`[VSCodeStorageAdapter] ${prefix} ${message}`);
    }
  }
}

/**
 * Create a VSCodeStorageAdapter with global storage
 */
export function createGlobalStorageAdapter(
  context: vscode.ExtensionContext,
  options?: Partial<VSCodeStorageAdapterConfig>
): VSCodeStorageAdapter {
  return new VSCodeStorageAdapter({
    context,
    storageType: 'global',
    ...options,
  });
}

/**
 * Create a VSCodeStorageAdapter with workspace storage
 */
export function createWorkspaceStorageAdapter(
  context: vscode.ExtensionContext,
  options?: Partial<VSCodeStorageAdapterConfig>
): VSCodeStorageAdapter {
  return new VSCodeStorageAdapter({
    context,
    storageType: 'workspace',
    ...options,
  });
}
