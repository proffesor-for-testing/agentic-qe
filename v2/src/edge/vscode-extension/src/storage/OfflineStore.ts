/**
 * OfflineStore - Main Offline Storage Manager
 *
 * Provides offline-first data storage with automatic syncing
 * when the network becomes available. Supports patterns, analysis
 * results, and test history storage.
 *
 * Features:
 * - CRUD operations with namespace support
 * - Automatic offline queue for pending changes
 * - Event emission for store changes
 * - Query operations with filtering
 * - Expiration and cleanup
 *
 * Phase 1: P1-005 - Offline-First Storage Layer
 *
 * @module vscode-extension/storage/OfflineStore
 * @version 0.1.0
 */

import type {
  IStorageAdapter,
  StorageNamespace,
  StorageEntry,
  StorageQueryOptions,
  StorageOperationResult,
  StorageStats,
  SetOptions,
} from './StorageAdapter';

/**
 * Store event types
 */
export type StoreEventType =
  | 'set'
  | 'delete'
  | 'clear'
  | 'sync-queued'
  | 'sync-complete'
  | 'error';

/**
 * Store event data
 */
export interface StoreEvent<T = unknown> {
  type: StoreEventType;
  namespace: StorageNamespace;
  key?: string;
  data?: T;
  timestamp: number;
  error?: string;
}

/**
 * Store event listener
 */
export type StoreEventListener<T = unknown> = (event: StoreEvent<T>) => void;

/**
 * Queued operation for offline sync
 */
export interface QueuedOperation {
  id: string;
  type: 'set' | 'delete';
  namespace: StorageNamespace;
  key: string;
  value?: unknown;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

/**
 * Configuration for OfflineStore
 */
export interface OfflineStoreConfig {
  /** Storage adapter to use */
  adapter: IStorageAdapter;
  /** Enable automatic expiration cleanup */
  enableAutoCleanup?: boolean;
  /** Cleanup interval in milliseconds */
  cleanupInterval?: number;
  /** Maximum retry count for failed operations */
  maxRetryCount?: number;
  /** Enable debug logging */
  debugMode?: boolean;
}

/**
 * OfflineStore - Main offline storage manager
 */
export class OfflineStore {
  private readonly adapter: IStorageAdapter;
  private readonly enableAutoCleanup: boolean;
  private readonly cleanupInterval: number;
  private readonly maxRetryCount: number;
  private readonly debugMode: boolean;

  private listeners: Map<StoreEventType, Set<StoreEventListener>> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  /**
   * Queue namespace for offline operations
   */
  private static readonly QUEUE_NAMESPACE: StorageNamespace = 'queue';

  constructor(config: OfflineStoreConfig) {
    this.adapter = config.adapter;
    this.enableAutoCleanup = config.enableAutoCleanup ?? true;
    this.cleanupInterval = config.cleanupInterval ?? 60000; // 1 minute
    this.maxRetryCount = config.maxRetryCount ?? 3;
    this.debugMode = config.debugMode ?? false;
  }

  /**
   * Initialize the store
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.adapter.initialize();

    // Start cleanup timer if enabled
    if (this.enableAutoCleanup) {
      this.startCleanupTimer();
    }

    this.initialized = true;
    this.log('OfflineStore initialized');
  }

  /**
   * Get a value by key and namespace
   *
   * @param namespace - Storage namespace
   * @param key - Entry key
   * @returns The value if found, null otherwise
   */
  async get<T>(namespace: StorageNamespace, key: string): Promise<T | null> {
    this.ensureInitialized();

    const entry = await this.adapter.get<T>(namespace, key);
    return entry?.value ?? null;
  }

  /**
   * Get a full entry with metadata
   *
   * @param namespace - Storage namespace
   * @param key - Entry key
   * @returns The entry if found, null otherwise
   */
  async getEntry<T>(namespace: StorageNamespace, key: string): Promise<StorageEntry<T> | null> {
    this.ensureInitialized();
    return this.adapter.get<T>(namespace, key);
  }

  /**
   * Set a value by key and namespace
   *
   * @param namespace - Storage namespace
   * @param key - Entry key
   * @param value - Value to store
   * @param options - Optional settings
   * @returns Operation result
   */
  async set<T>(
    namespace: StorageNamespace,
    key: string,
    value: T,
    options?: SetOptions
  ): Promise<StorageOperationResult<StorageEntry<T>>> {
    this.ensureInitialized();

    const result = await this.adapter.set(namespace, key, value, options);

    if (result.success) {
      this.emit({
        type: 'set',
        namespace,
        key,
        data: value,
        timestamp: Date.now(),
      });
    } else {
      this.emit({
        type: 'error',
        namespace,
        key,
        timestamp: Date.now(),
        error: result.error,
      });
    }

    return result;
  }

  /**
   * Delete a value by key and namespace
   *
   * @param namespace - Storage namespace
   * @param key - Entry key
   * @returns Operation result
   */
  async delete(namespace: StorageNamespace, key: string): Promise<StorageOperationResult<void>> {
    this.ensureInitialized();

    const result = await this.adapter.delete(namespace, key);

    if (result.success) {
      this.emit({
        type: 'delete',
        namespace,
        key,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  /**
   * Check if a key exists
   *
   * @param namespace - Storage namespace
   * @param key - Entry key
   * @returns True if key exists
   */
  async has(namespace: StorageNamespace, key: string): Promise<boolean> {
    this.ensureInitialized();
    return this.adapter.has(namespace, key);
  }

  /**
   * List all keys in a namespace
   *
   * @param namespace - Storage namespace
   * @param options - Query options
   * @returns List of keys
   */
  async keys(namespace: StorageNamespace, options?: StorageQueryOptions): Promise<string[]> {
    this.ensureInitialized();
    return this.adapter.keys(namespace, options);
  }

  /**
   * Query entries with filtering
   *
   * @param options - Query options
   * @returns List of matching entries
   */
  async query<T>(options: StorageQueryOptions): Promise<StorageEntry<T>[]> {
    this.ensureInitialized();
    return this.adapter.query<T>(options);
  }

  /**
   * Get all values in a namespace
   *
   * @param namespace - Storage namespace
   * @returns Array of values
   */
  async getAll<T>(namespace: StorageNamespace): Promise<T[]> {
    this.ensureInitialized();

    const entries = await this.adapter.query<T>({ namespace });
    return entries.map((e) => e.value);
  }

  /**
   * Clear all entries in a namespace
   *
   * @param namespace - Storage namespace
   * @returns Operation result
   */
  async clear(namespace: StorageNamespace): Promise<StorageOperationResult<void>> {
    this.ensureInitialized();

    const result = await this.adapter.clear(namespace);

    if (result.success) {
      this.emit({
        type: 'clear',
        namespace,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  /**
   * Clear all storage
   *
   * @returns Operation result
   */
  async clearAll(): Promise<StorageOperationResult<void>> {
    this.ensureInitialized();
    return this.adapter.clearAll();
  }

  /**
   * Queue an operation for later sync
   *
   * @param operation - Operation to queue
   */
  async queueOperation(
    type: 'set' | 'delete',
    namespace: StorageNamespace,
    key: string,
    value?: unknown
  ): Promise<void> {
    this.ensureInitialized();

    const operation: QueuedOperation = {
      id: this.generateOperationId(),
      type,
      namespace,
      key,
      value,
      timestamp: Date.now(),
      retryCount: 0,
    };

    await this.adapter.set(OfflineStore.QUEUE_NAMESPACE, operation.id, operation);

    this.emit({
      type: 'sync-queued',
      namespace,
      key,
      data: operation,
      timestamp: Date.now(),
    });

    this.log(`Queued operation: ${type} ${namespace}/${key}`);
  }

  /**
   * Get all queued operations
   *
   * @returns List of queued operations
   */
  async getQueuedOperations(): Promise<QueuedOperation[]> {
    this.ensureInitialized();

    const entries = await this.adapter.query<QueuedOperation>({
      namespace: OfflineStore.QUEUE_NAMESPACE,
    });

    return entries
      .map((e) => e.value)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Remove a queued operation
   *
   * @param operationId - ID of operation to remove
   */
  async removeQueuedOperation(operationId: string): Promise<void> {
    this.ensureInitialized();
    await this.adapter.delete(OfflineStore.QUEUE_NAMESPACE, operationId);
  }

  /**
   * Update a queued operation (e.g., increment retry count)
   *
   * @param operation - Updated operation
   */
  async updateQueuedOperation(operation: QueuedOperation): Promise<void> {
    this.ensureInitialized();
    await this.adapter.set(OfflineStore.QUEUE_NAMESPACE, operation.id, operation);
  }

  /**
   * Get storage statistics
   *
   * @returns Storage stats
   */
  async getStats(): Promise<StorageStats> {
    this.ensureInitialized();
    return this.adapter.getStats();
  }

  /**
   * Add an event listener
   *
   * @param type - Event type to listen for
   * @param listener - Callback function
   */
  on<T = unknown>(type: StoreEventType, listener: StoreEventListener<T>): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener as StoreEventListener);
  }

  /**
   * Remove an event listener
   *
   * @param type - Event type
   * @param listener - Callback to remove
   */
  off<T = unknown>(type: StoreEventType, listener: StoreEventListener<T>): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(listener as StoreEventListener);
    }
  }

  /**
   * Remove all listeners for an event type
   *
   * @param type - Event type (optional, clears all if not provided)
   */
  removeAllListeners(type?: StoreEventType): void {
    if (type) {
      this.listeners.delete(type);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Clean up expired entries
   *
   * @returns Number of entries cleaned up
   */
  async cleanup(): Promise<number> {
    this.ensureInitialized();

    let cleanedCount = 0;
    const namespaces: StorageNamespace[] = [
      'patterns',
      'analysis',
      'tests',
      'config',
      'sync',
      'queue',
      'metadata',
    ];

    for (const namespace of namespaces) {
      const entries = await this.adapter.query<unknown>({
        namespace,
        includeExpired: true,
      });

      const now = Date.now();
      for (const entry of entries) {
        if (entry.expiresAt && entry.expiresAt < now) {
          await this.adapter.delete(namespace, entry.key);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      this.log(`Cleaned up ${cleanedCount} expired entries`);
    }

    return cleanedCount;
  }

  /**
   * Export all data
   *
   * @returns Exported data
   */
  async export(): Promise<Record<string, StorageEntry[]>> {
    this.ensureInitialized();
    return this.adapter.export();
  }

  /**
   * Import data
   *
   * @param data - Data to import
   * @param options - Import options
   * @returns Operation result
   */
  async import(
    data: Record<string, StorageEntry[]>,
    options?: { overwrite?: boolean; clearFirst?: boolean }
  ): Promise<StorageOperationResult<void>> {
    this.ensureInitialized();
    return this.adapter.import(data, options);
  }

  /**
   * Shutdown the store
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Remove all listeners
    this.listeners.clear();

    // Close adapter
    await this.adapter.close();

    this.initialized = false;
    this.log('OfflineStore shutdown');
  }

  // ==================== Pattern-specific methods ====================

  /**
   * Store a test pattern
   */
  async storePattern<T>(id: string, pattern: T, ttl?: number): Promise<StorageOperationResult<StorageEntry<T>>> {
    return this.set('patterns', id, pattern, ttl ? { ttl } : undefined);
  }

  /**
   * Get a test pattern
   */
  async getPattern<T>(id: string): Promise<T | null> {
    return this.get<T>('patterns', id);
  }

  /**
   * Get all patterns
   */
  async getAllPatterns<T>(): Promise<T[]> {
    return this.getAll<T>('patterns');
  }

  /**
   * Delete a pattern
   */
  async deletePattern(id: string): Promise<StorageOperationResult<void>> {
    return this.delete('patterns', id);
  }

  // ==================== Analysis-specific methods ====================

  /**
   * Store analysis result
   */
  async storeAnalysis<T>(fileKey: string, analysis: T, ttl?: number): Promise<StorageOperationResult<StorageEntry<T>>> {
    return this.set('analysis', fileKey, analysis, ttl ? { ttl } : undefined);
  }

  /**
   * Get analysis result
   */
  async getAnalysis<T>(fileKey: string): Promise<T | null> {
    return this.get<T>('analysis', fileKey);
  }

  /**
   * Get all analysis results
   */
  async getAllAnalyses<T>(): Promise<T[]> {
    return this.getAll<T>('analysis');
  }

  // ==================== Test history methods ====================

  /**
   * Store test history entry
   */
  async storeTestHistory<T>(id: string, entry: T, ttl?: number): Promise<StorageOperationResult<StorageEntry<T>>> {
    return this.set('tests', id, entry, ttl ? { ttl } : undefined);
  }

  /**
   * Get test history entry
   */
  async getTestHistory<T>(id: string): Promise<T | null> {
    return this.get<T>('tests', id);
  }

  /**
   * Get all test history
   */
  async getAllTestHistory<T>(): Promise<T[]> {
    return this.getAll<T>('tests');
  }

  // ==================== Config methods ====================

  /**
   * Store configuration
   */
  async setConfig<T>(key: string, value: T): Promise<StorageOperationResult<StorageEntry<T>>> {
    return this.set('config', key, value);
  }

  /**
   * Get configuration
   */
  async getConfig<T>(key: string, defaultValue?: T): Promise<T> {
    const value = await this.get<T>('config', key);
    return value ?? defaultValue!;
  }

  // ==================== Private methods ====================

  /**
   * Emit an event to listeners
   */
  private emit<T>(event: StoreEvent<T>): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          this.log(`Error in event listener: ${error}`, 'error');
        }
      }
    }
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        this.log(`Cleanup error: ${error}`, 'error');
      }
    }, this.cleanupInterval);
  }

  /**
   * Generate a unique operation ID
   */
  private generateOperationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `op-${timestamp}-${random}`;
  }

  /**
   * Ensure the store is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('OfflineStore not initialized. Call initialize() first.');
    }
  }

  /**
   * Log message for debugging
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (this.debugMode) {
      const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]';
      console.log(`[OfflineStore] ${prefix} ${message}`);
    }
  }
}

/**
 * Create an OfflineStore instance
 */
export function createOfflineStore(config: OfflineStoreConfig): OfflineStore {
  return new OfflineStore(config);
}
