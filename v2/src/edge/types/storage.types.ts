/**
 * Browser Storage Types for Edge HNSW Vector Memory
 *
 * Defines interfaces for browser-compatible storage operations using IndexedDB.
 * Designed to match the IPatternStore contract while adapting to browser APIs.
 *
 * @module edge/types/storage.types
 * @version 1.0.0
 */

/**
 * Vector entry stored in IndexedDB
 */
export interface StoredVectorEntry {
  /** Unique identifier */
  id: string;

  /** Vector data as Float32Array (stored as ArrayBuffer in IndexedDB) */
  vector: ArrayBuffer;

  /** Pattern metadata */
  metadata: StoredPatternMetadata;

  /** Creation timestamp */
  createdAt: number;

  /** Last access timestamp */
  lastUsed: number;

  /** Usage count for LRU-style eviction */
  usageCount: number;
}

/**
 * Pattern metadata stored alongside vectors
 */
export interface StoredPatternMetadata {
  type: string;
  domain: string;
  content: string;
  framework?: string;
  coverage?: number;
  flakinessScore?: number;
  verdict?: 'success' | 'failure' | 'flaky';
  custom?: Record<string, unknown>;
}

/**
 * IndexedDB store configuration
 */
export interface IndexedDBStoreConfig {
  /** Database name */
  dbName: string;

  /** Database version */
  dbVersion: number;

  /** Object store name for vectors */
  vectorStoreName: string;

  /** Object store name for HNSW index state */
  indexStoreName: string;

  /** Maximum entries before eviction (0 = unlimited) */
  maxEntries?: number;

  /** Enable automatic compaction */
  autoCompact?: boolean;
}

/**
 * HNSW index state for persistence
 */
export interface HNSWIndexState {
  /** Serialized index data */
  indexData: ArrayBuffer;

  /** Configuration used to build the index */
  config: HNSWIndexConfig;

  /** Number of vectors in index */
  vectorCount: number;

  /** Build timestamp */
  builtAt: number;

  /** Version for migration support */
  version: string;
}

/**
 * HNSW index configuration for browser
 */
export interface HNSWIndexConfig {
  /** Vector dimension */
  dimension: number;

  /** Number of bi-directional links per node (M parameter) */
  m: number;

  /** Search depth during construction (efConstruction) */
  efConstruction: number;

  /** Search depth during queries (efSearch) */
  efSearch: number;

  /** Distance metric */
  metric: 'cosine' | 'euclidean' | 'dot';
}

/**
 * Browser storage adapter interface
 */
export interface IBrowserStorage {
  /**
   * Initialize the storage backend
   */
  initialize(): Promise<void>;

  /**
   * Store a vector entry
   */
  storeVector(entry: StoredVectorEntry): Promise<void>;

  /**
   * Store multiple vectors in a transaction
   */
  storeVectorBatch(entries: StoredVectorEntry[]): Promise<void>;

  /**
   * Get a vector by ID
   */
  getVector(id: string): Promise<StoredVectorEntry | null>;

  /**
   * Get multiple vectors by IDs
   */
  getVectorBatch(ids: string[]): Promise<(StoredVectorEntry | null)[]>;

  /**
   * Get all vectors (for index rebuilding)
   */
  getAllVectors(): Promise<StoredVectorEntry[]>;

  /**
   * Delete a vector by ID
   */
  deleteVector(id: string): Promise<boolean>;

  /**
   * Update vector metadata (lastUsed, usageCount)
   */
  updateVectorMetadata(
    id: string,
    updates: Partial<Pick<StoredVectorEntry, 'lastUsed' | 'usageCount'>>
  ): Promise<void>;

  /**
   * Get vector count
   */
  getCount(): Promise<number>;

  /**
   * Clear all vectors
   */
  clear(): Promise<void>;

  /**
   * Store HNSW index state for persistence
   */
  storeIndexState(state: HNSWIndexState): Promise<void>;

  /**
   * Load HNSW index state
   */
  loadIndexState(): Promise<HNSWIndexState | null>;

  /**
   * Close the storage connection
   */
  close(): Promise<void>;

  /**
   * Check if storage is available
   */
  isAvailable(): boolean;
}

/**
 * Search result from HNSW index
 */
export interface BrowserSearchResult {
  /** Vector ID */
  id: string;

  /** Similarity score (0-1 for cosine, distance for euclidean) */
  score: number;
}

/**
 * Browser HNSW adapter configuration
 */
export interface BrowserHNSWConfig {
  /** HNSW index parameters */
  hnsw: HNSWIndexConfig;

  /** IndexedDB storage configuration */
  storage: Partial<IndexedDBStoreConfig>;

  /** Enable automatic index persistence */
  autoPersistIndex?: boolean;

  /** Persist index after N insertions (0 = never auto-persist) */
  persistAfterInserts?: number;

  /** Enable performance metrics */
  enableMetrics?: boolean;

  /** Batch size for bulk operations */
  batchSize?: number;
}

/**
 * Browser storage statistics
 */
export interface BrowserStorageStats {
  /** Total vectors stored */
  vectorCount: number;

  /** Estimated storage size in bytes */
  storageSize: number;

  /** IndexedDB quota usage percentage */
  quotaUsage?: number;

  /** Index state info */
  indexInfo: {
    isBuilt: boolean;
    builtAt?: number;
    vectorsIndexed: number;
  };
}

/**
 * Type guard to check if running in browser environment
 */
export function isBrowserEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.indexedDB !== 'undefined'
  );
}

/**
 * Convert Float32Array to ArrayBuffer for storage
 */
export function float32ToArrayBuffer(arr: Float32Array): ArrayBuffer {
  // Create a new ArrayBuffer and copy the data to avoid SharedArrayBuffer issues
  const buffer = new ArrayBuffer(arr.byteLength);
  new Float32Array(buffer).set(arr);
  return buffer;
}

/**
 * Convert ArrayBuffer back to Float32Array
 */
export function arrayBufferToFloat32(buffer: ArrayBuffer): Float32Array {
  return new Float32Array(buffer);
}

/**
 * Convert number array to Float32Array
 */
export function toFloat32Array(arr: number[] | Float32Array): Float32Array {
  if (arr instanceof Float32Array) {
    return arr;
  }
  return new Float32Array(arr);
}
