/**
 * StorageAdapter - Abstract Storage Interface
 *
 * Defines the contract for storage adapters that can be used
 * with the offline-first storage layer. Implementations can
 * use VS Code storage, IndexedDB, localStorage, etc.
 *
 * Phase 1: P1-005 - Offline-First Storage Layer
 *
 * @module vscode-extension/storage/StorageAdapter
 * @version 0.1.0
 */

/**
 * Namespace for organizing storage keys
 */
export type StorageNamespace =
  | 'patterns'
  | 'analysis'
  | 'tests'
  | 'config'
  | 'sync'
  | 'queue'
  | 'metadata';

/**
 * Storage entry with metadata
 */
export interface StorageEntry<T = unknown> {
  /** Unique key within namespace */
  key: string;
  /** Stored value */
  value: T;
  /** Namespace for the entry */
  namespace: StorageNamespace;
  /** Timestamp when entry was created */
  createdAt: number;
  /** Timestamp when entry was last updated */
  updatedAt: number;
  /** Schema version for migration support */
  schemaVersion: number;
  /** Optional expiration timestamp */
  expiresAt?: number;
  /** Checksum for integrity verification */
  checksum?: string;
}

/**
 * Query options for listing/searching entries
 */
export interface StorageQueryOptions {
  /** Filter by namespace */
  namespace?: StorageNamespace;
  /** Filter keys by prefix */
  keyPrefix?: string;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order */
  sortBy?: 'key' | 'createdAt' | 'updatedAt';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Include expired entries */
  includeExpired?: boolean;
}

/**
 * Result of a storage operation
 */
export interface StorageOperationResult<T = unknown> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The data if operation succeeded */
  data?: T;
  /** Error message if operation failed */
  error?: string;
  /** Number of items affected */
  affected?: number;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  /** Total number of entries */
  totalEntries: number;
  /** Entries by namespace */
  entriesByNamespace: Record<StorageNamespace, number>;
  /** Approximate total size in bytes */
  totalSizeBytes: number;
  /** Number of expired entries */
  expiredEntries: number;
  /** Last sync timestamp */
  lastSyncAt?: number;
  /** Number of pending sync operations */
  pendingSyncCount: number;
}

/**
 * Migration definition for schema changes
 */
export interface StorageMigration {
  /** Version this migration upgrades from */
  fromVersion: number;
  /** Version this migration upgrades to */
  toVersion: number;
  /** Migration function */
  migrate: (entry: StorageEntry) => StorageEntry;
  /** Description of the migration */
  description: string;
}

/**
 * Abstract storage adapter interface
 *
 * All storage implementations must implement this interface
 * to be compatible with the offline-first storage layer.
 */
export interface IStorageAdapter {
  /**
   * Initialize the storage adapter
   * Should be called before any other operations
   */
  initialize(): Promise<void>;

  /**
   * Get a value by key and namespace
   *
   * @param namespace - Storage namespace
   * @param key - Entry key
   * @returns The entry if found, null otherwise
   */
  get<T>(namespace: StorageNamespace, key: string): Promise<StorageEntry<T> | null>;

  /**
   * Set a value by key and namespace
   *
   * @param namespace - Storage namespace
   * @param key - Entry key
   * @param value - Value to store
   * @param options - Optional settings (expiration, etc.)
   * @returns Operation result
   */
  set<T>(
    namespace: StorageNamespace,
    key: string,
    value: T,
    options?: SetOptions
  ): Promise<StorageOperationResult<StorageEntry<T>>>;

  /**
   * Delete a value by key and namespace
   *
   * @param namespace - Storage namespace
   * @param key - Entry key
   * @returns Operation result
   */
  delete(namespace: StorageNamespace, key: string): Promise<StorageOperationResult<void>>;

  /**
   * Check if a key exists in namespace
   *
   * @param namespace - Storage namespace
   * @param key - Entry key
   * @returns True if key exists
   */
  has(namespace: StorageNamespace, key: string): Promise<boolean>;

  /**
   * List all keys in a namespace
   *
   * @param namespace - Storage namespace
   * @param options - Query options
   * @returns List of keys
   */
  keys(namespace: StorageNamespace, options?: StorageQueryOptions): Promise<string[]>;

  /**
   * Query entries with options
   *
   * @param options - Query options
   * @returns List of matching entries
   */
  query<T>(options: StorageQueryOptions): Promise<StorageEntry<T>[]>;

  /**
   * Clear all entries in a namespace
   *
   * @param namespace - Storage namespace
   * @returns Operation result with count of deleted entries
   */
  clear(namespace: StorageNamespace): Promise<StorageOperationResult<void>>;

  /**
   * Clear all storage
   *
   * @returns Operation result with count of deleted entries
   */
  clearAll(): Promise<StorageOperationResult<void>>;

  /**
   * Get storage statistics
   *
   * @returns Storage stats
   */
  getStats(): Promise<StorageStats>;

  /**
   * Run migrations to update schema
   *
   * @param migrations - List of migrations to run
   * @returns Number of entries migrated
   */
  migrate(migrations: StorageMigration[]): Promise<number>;

  /**
   * Export all data for backup
   *
   * @returns All stored data
   */
  export(): Promise<Record<string, StorageEntry[]>>;

  /**
   * Import data from backup
   *
   * @param data - Data to import
   * @param options - Import options
   * @returns Operation result
   */
  import(
    data: Record<string, StorageEntry[]>,
    options?: ImportOptions
  ): Promise<StorageOperationResult<void>>;

  /**
   * Get the current schema version
   */
  getSchemaVersion(): number;

  /**
   * Close the storage adapter and release resources
   */
  close(): Promise<void>;
}

/**
 * Options for set operation
 */
export interface SetOptions {
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Explicit expiration timestamp */
  expiresAt?: number;
  /** Whether to overwrite existing entry */
  overwrite?: boolean;
  /** Custom schema version */
  schemaVersion?: number;
}

/**
 * Options for import operation
 */
export interface ImportOptions {
  /** Whether to overwrite existing entries */
  overwrite?: boolean;
  /** Whether to clear existing data before import */
  clearFirst?: boolean;
  /** Only import specific namespaces */
  namespaces?: StorageNamespace[];
}

/**
 * Generate a checksum for data integrity verification
 *
 * @param data - Data to checksum
 * @returns Checksum string
 */
export function generateChecksum(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Verify checksum matches data
 *
 * @param data - Data to verify
 * @param checksum - Expected checksum
 * @returns True if checksum matches
 */
export function verifyChecksum(data: unknown, checksum: string): boolean {
  return generateChecksum(data) === checksum;
}

/**
 * Create a storage key with namespace prefix
 *
 * @param namespace - Storage namespace
 * @param key - Entry key
 * @returns Prefixed key
 */
export function createStorageKey(namespace: StorageNamespace, key: string): string {
  return `aqe:${namespace}:${key}`;
}

/**
 * Parse a storage key to extract namespace and key
 *
 * @param fullKey - Full storage key
 * @returns Parsed namespace and key, or null if invalid
 */
export function parseStorageKey(
  fullKey: string
): { namespace: StorageNamespace; key: string } | null {
  const match = fullKey.match(/^aqe:(\w+):(.+)$/);
  if (!match) return null;

  const namespace = match[1] as StorageNamespace;
  const validNamespaces: StorageNamespace[] = [
    'patterns',
    'analysis',
    'tests',
    'config',
    'sync',
    'queue',
    'metadata',
  ];

  if (!validNamespaces.includes(namespace)) return null;

  return { namespace, key: match[2] };
}

/**
 * Default schema version for new entries
 */
export const DEFAULT_SCHEMA_VERSION = 1;

/**
 * Maximum storage size warning threshold (10MB)
 */
export const STORAGE_SIZE_WARNING_THRESHOLD = 10 * 1024 * 1024;

/**
 * Maximum number of entries per namespace
 */
export const MAX_ENTRIES_PER_NAMESPACE = 10000;
