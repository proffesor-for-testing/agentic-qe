/**
 * IndexedDB Storage Adapter for Browser HNSW Vector Memory
 *
 * Provides persistent vector storage in browsers using IndexedDB.
 * Handles transactions, CRUD operations, and index state persistence.
 *
 * Features:
 * - Transactional CRUD operations for vectors
 * - HNSW index state persistence and restoration
 * - Automatic schema migration
 * - Batch operations for performance
 * - Storage quota management
 *
 * @module edge/adapters/IndexedDBStorage
 * @version 1.0.0
 */

import type {
  IBrowserStorage,
  StoredVectorEntry,
  HNSWIndexState,
  IndexedDBStoreConfig,
} from '../types/storage.types';

/**
 * Default IndexedDB configuration
 */
const DEFAULT_CONFIG: IndexedDBStoreConfig = {
  dbName: 'agentic-qe-vectors',
  dbVersion: 1,
  vectorStoreName: 'vectors',
  indexStoreName: 'hnsw-index',
  maxEntries: 0, // Unlimited
  autoCompact: true,
};

/**
 * IndexedDB Storage Implementation
 *
 * Provides a clean abstraction over IndexedDB for storing vectors
 * and HNSW index state in the browser.
 */
export class IndexedDBStorage implements IBrowserStorage {
  private config: IndexedDBStoreConfig;
  private db: IDBDatabase | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<IndexedDBStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize IndexedDB connection and create object stores if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.db) {
      return;
    }

    if (!this.isAvailable()) {
      throw new Error('IndexedDB is not available in this environment');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, this.config.dbVersion);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;

        // Handle connection errors
        this.db.onerror = (event) => {
          console.error('[IndexedDB] Database error:', event);
        };

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createObjectStores(db);
      };
    });
  }

  /**
   * Create object stores for vectors and index state
   */
  private createObjectStores(db: IDBDatabase): void {
    // Vector store with indexes for querying
    if (!db.objectStoreNames.contains(this.config.vectorStoreName)) {
      const vectorStore = db.createObjectStore(this.config.vectorStoreName, {
        keyPath: 'id',
      });

      // Indexes for common queries
      vectorStore.createIndex('domain', 'metadata.domain', { unique: false });
      vectorStore.createIndex('type', 'metadata.type', { unique: false });
      vectorStore.createIndex('createdAt', 'createdAt', { unique: false });
      vectorStore.createIndex('lastUsed', 'lastUsed', { unique: false });
    }

    // HNSW index state store (single entry)
    if (!db.objectStoreNames.contains(this.config.indexStoreName)) {
      db.createObjectStore(this.config.indexStoreName, {
        keyPath: 'id',
      });
    }
  }

  /**
   * Store a single vector entry
   */
  async storeVector(entry: StoredVectorEntry): Promise<void> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.vectorStoreName,
        'readwrite'
      );
      const store = transaction.objectStore(this.config.vectorStoreName);

      const request = store.put(entry);

      request.onerror = () => {
        reject(new Error(`Failed to store vector: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error(`Transaction failed: ${transaction.error?.message}`));
      };
    });
  }

  /**
   * Store multiple vectors in a single transaction
   */
  async storeVectorBatch(entries: StoredVectorEntry[]): Promise<void> {
    this.ensureInitialized();

    if (entries.length === 0) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.vectorStoreName,
        'readwrite'
      );
      const store = transaction.objectStore(this.config.vectorStoreName);

      let completed = 0;
      let hasError = false;

      for (const entry of entries) {
        const request = store.put(entry);

        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(new Error(`Failed to store vector ${entry.id}: ${request.error?.message}`));
          }
        };

        request.onsuccess = () => {
          completed++;
          if (completed === entries.length && !hasError) {
            // All entries stored successfully
          }
        };
      }

      transaction.oncomplete = () => {
        if (!hasError) {
          resolve();
        }
      };

      transaction.onerror = () => {
        if (!hasError) {
          reject(new Error(`Batch transaction failed: ${transaction.error?.message}`));
        }
      };
    });
  }

  /**
   * Get a vector by ID
   */
  async getVector(id: string): Promise<StoredVectorEntry | null> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.vectorStoreName,
        'readonly'
      );
      const store = transaction.objectStore(this.config.vectorStoreName);
      const request = store.get(id);

      request.onerror = () => {
        reject(new Error(`Failed to get vector: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  /**
   * Get multiple vectors by IDs
   */
  async getVectorBatch(ids: string[]): Promise<(StoredVectorEntry | null)[]> {
    this.ensureInitialized();

    if (ids.length === 0) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.vectorStoreName,
        'readonly'
      );
      const store = transaction.objectStore(this.config.vectorStoreName);

      const results: (StoredVectorEntry | null)[] = new Array(ids.length).fill(null);
      let completed = 0;
      let hasError = false;

      ids.forEach((id, index) => {
        const request = store.get(id);

        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(new Error(`Failed to get vector ${id}: ${request.error?.message}`));
          }
        };

        request.onsuccess = () => {
          results[index] = request.result || null;
          completed++;

          if (completed === ids.length && !hasError) {
            resolve(results);
          }
        };
      });

      transaction.onerror = () => {
        if (!hasError) {
          reject(new Error(`Batch get failed: ${transaction.error?.message}`));
        }
      };
    });
  }

  /**
   * Get all vectors (for index rebuilding)
   */
  async getAllVectors(): Promise<StoredVectorEntry[]> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.vectorStoreName,
        'readonly'
      );
      const store = transaction.objectStore(this.config.vectorStoreName);
      const request = store.getAll();

      request.onerror = () => {
        reject(new Error(`Failed to get all vectors: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result || []);
      };
    });
  }

  /**
   * Delete a vector by ID
   */
  async deleteVector(id: string): Promise<boolean> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.vectorStoreName,
        'readwrite'
      );
      const store = transaction.objectStore(this.config.vectorStoreName);

      // First check if vector exists
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        if (!getRequest.result) {
          resolve(false);
          return;
        }

        const deleteRequest = store.delete(id);

        deleteRequest.onerror = () => {
          reject(new Error(`Failed to delete vector: ${deleteRequest.error?.message}`));
        };

        deleteRequest.onsuccess = () => {
          resolve(true);
        };
      };

      getRequest.onerror = () => {
        reject(new Error(`Failed to check vector existence: ${getRequest.error?.message}`));
      };
    });
  }

  /**
   * Update vector metadata (for recording usage)
   */
  async updateVectorMetadata(
    id: string,
    updates: Partial<Pick<StoredVectorEntry, 'lastUsed' | 'usageCount'>>
  ): Promise<void> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.vectorStoreName,
        'readwrite'
      );
      const store = transaction.objectStore(this.config.vectorStoreName);
      const getRequest = store.get(id);

      getRequest.onerror = () => {
        reject(new Error(`Failed to get vector for update: ${getRequest.error?.message}`));
      };

      getRequest.onsuccess = () => {
        const entry = getRequest.result as StoredVectorEntry | undefined;

        if (!entry) {
          // Vector not found, silently succeed
          resolve();
          return;
        }

        // Apply updates
        const updatedEntry: StoredVectorEntry = {
          ...entry,
          ...updates,
        };

        const putRequest = store.put(updatedEntry);

        putRequest.onerror = () => {
          reject(new Error(`Failed to update vector: ${putRequest.error?.message}`));
        };

        putRequest.onsuccess = () => {
          resolve();
        };
      };
    });
  }

  /**
   * Get vector count
   */
  async getCount(): Promise<number> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.vectorStoreName,
        'readonly'
      );
      const store = transaction.objectStore(this.config.vectorStoreName);
      const request = store.count();

      request.onerror = () => {
        reject(new Error(`Failed to count vectors: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };
    });
  }

  /**
   * Clear all vectors
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [this.config.vectorStoreName, this.config.indexStoreName],
        'readwrite'
      );

      const vectorStore = transaction.objectStore(this.config.vectorStoreName);
      const indexStore = transaction.objectStore(this.config.indexStoreName);

      const vectorClear = vectorStore.clear();
      const indexClear = indexStore.clear();

      let completed = 0;
      let hasError = false;

      const checkComplete = () => {
        completed++;
        if (completed === 2 && !hasError) {
          // Both stores cleared
        }
      };

      vectorClear.onerror = () => {
        if (!hasError) {
          hasError = true;
          reject(new Error(`Failed to clear vectors: ${vectorClear.error?.message}`));
        }
      };
      vectorClear.onsuccess = checkComplete;

      indexClear.onerror = () => {
        if (!hasError) {
          hasError = true;
          reject(new Error(`Failed to clear index: ${indexClear.error?.message}`));
        }
      };
      indexClear.onsuccess = checkComplete;

      transaction.oncomplete = () => {
        if (!hasError) {
          resolve();
        }
      };
    });
  }

  /**
   * Store HNSW index state for persistence
   */
  async storeIndexState(state: HNSWIndexState): Promise<void> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.indexStoreName,
        'readwrite'
      );
      const store = transaction.objectStore(this.config.indexStoreName);

      // Use fixed ID for single index state
      const stateWithId = { ...state, id: 'hnsw-state' };
      const request = store.put(stateWithId);

      request.onerror = () => {
        reject(new Error(`Failed to store index state: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Load HNSW index state
   */
  async loadIndexState(): Promise<HNSWIndexState | null> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.indexStoreName,
        'readonly'
      );
      const store = transaction.objectStore(this.config.indexStoreName);
      const request = store.get('hnsw-state');

      request.onerror = () => {
        reject(new Error(`Failed to load index state: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Remove the internal 'id' field before returning
          const { id: _id, ...state } = result;
          resolve(state as HNSWIndexState);
        } else {
          resolve(null);
        }
      };
    });
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  /**
   * Check if IndexedDB is available
   */
  isAvailable(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    vectorCount: number;
    hasIndexState: boolean;
    estimatedSize: number;
  }> {
    this.ensureInitialized();

    const vectorCount = await this.getCount();
    const indexState = await this.loadIndexState();

    // Estimate size (rough calculation)
    // Assume average vector is 384 floats * 4 bytes + ~500 bytes metadata
    const estimatedSize = vectorCount * (384 * 4 + 500);

    return {
      vectorCount,
      hasIndexState: indexState !== null,
      estimatedSize,
    };
  }

  /**
   * Get vectors by domain (using index)
   */
  async getVectorsByDomain(domain: string): Promise<StoredVectorEntry[]> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        this.config.vectorStoreName,
        'readonly'
      );
      const store = transaction.objectStore(this.config.vectorStoreName);
      const index = store.index('domain');
      const request = index.getAll(domain);

      request.onerror = () => {
        reject(new Error(`Failed to get vectors by domain: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result || []);
      };
    });
  }

  /**
   * Ensure database is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('IndexedDB not initialized. Call initialize() first.');
    }
  }

  /**
   * Delete the entire database (for testing/cleanup)
   */
  static async deleteDatabase(dbName: string = DEFAULT_CONFIG.dbName): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);

      request.onerror = () => {
        reject(new Error(`Failed to delete database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve();
      };

      request.onblocked = () => {
        console.warn('[IndexedDB] Delete blocked - close all connections first');
      };
    });
  }
}

/**
 * Create IndexedDB storage with default configuration
 */
export function createIndexedDBStorage(
  config?: Partial<IndexedDBStoreConfig>
): IndexedDBStorage {
  return new IndexedDBStorage(config);
}
