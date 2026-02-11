/**
 * Agentic QE v3 - Hybrid Memory Backend
 *
 * NOW UNIFIED: Uses single memory.db via UnifiedMemoryManager
 *
 * All data (KV, vectors, learning) stored in one file:
 * .agentic-qe/memory.db
 *
 * This is a facade over UnifiedMemoryManager that maintains
 * backward compatibility with existing MemoryBackend interface.
 */

import { MemoryBackend, StoreOptions, VectorSearchResult } from './interfaces';
import {
  UnifiedMemoryManager,
  getUnifiedMemory,
  UnifiedMemoryConfig,
  DEFAULT_UNIFIED_MEMORY_CONFIG
} from './unified-memory';
import { MEMORY_CONSTANTS } from './constants.js';

// ============================================================================
// Configuration Types (backward compatible)
// ============================================================================

/**
 * SQLite connection configuration (legacy - kept for API compatibility)
 */
export interface SQLiteConfig {
  /** Database file path */
  path: string;
  /** Enable WAL mode for better concurrency */
  walMode: boolean;
  /** Connection pool size */
  poolSize: number;
  /** Busy timeout in milliseconds */
  busyTimeout: number;
}

/**
 * AgentDB configuration (legacy - vectors now in unified DB)
 */
export interface AgentDBConfig {
  /** Database file path (ignored - uses unified memory.db) */
  path: string;
}

/**
 * Hybrid backend configuration
 */
export interface HybridBackendConfig {
  /** SQLite configuration for structured data */
  sqlite: Partial<SQLiteConfig>;
  /** AgentDB configuration (legacy - ignored) */
  agentdb: Partial<AgentDBConfig>;
  /** Whether to fallback to in-memory if backends fail */
  enableFallback: boolean;
  /** Default namespace for operations */
  defaultNamespace: string;
  /** Cleanup interval in milliseconds */
  cleanupInterval: number;
}

/**
 * Backend health status
 */
interface BackendHealth {
  sqlite: 'healthy' | 'degraded' | 'unavailable';
  sqlitePersistent: boolean;
  agentdb: 'healthy' | 'degraded' | 'unavailable';
  fallback: 'active' | 'inactive';
}

// ============================================================================
// Hybrid Backend Implementation (Facade over UnifiedMemoryManager)
// ============================================================================

/**
 * Hybrid Memory Backend
 *
 * NOW: Facade over UnifiedMemoryManager for backward compatibility.
 *
 * All operations delegate to the unified memory.db file.
 * No more separate vectors.db - everything in one place.
 */
export class HybridMemoryBackend implements MemoryBackend {
  private unifiedMemory: UnifiedMemoryManager | null = null;
  private config: HybridBackendConfig;
  private cleanupInterval?: ReturnType<typeof setInterval>;
  private initialized = false;

  constructor(config?: Partial<HybridBackendConfig>) {
    this.config = {
      sqlite: {
        path: config?.sqlite?.path ?? '.agentic-qe/memory.db',
        walMode: config?.sqlite?.walMode ?? true,
        poolSize: config?.sqlite?.poolSize ?? 5,
        busyTimeout: config?.sqlite?.busyTimeout ?? MEMORY_CONSTANTS.BUSY_TIMEOUT_MS,
        ...config?.sqlite,
      },
      agentdb: {
        // Ignored - vectors now in unified memory.db
        path: config?.agentdb?.path ?? '.agentic-qe/memory.db',
        ...config?.agentdb,
      },
      enableFallback: config?.enableFallback ?? true,
      defaultNamespace: config?.defaultNamespace ?? 'default',
      cleanupInterval: config?.cleanupInterval ?? MEMORY_CONSTANTS.CLEANUP_INTERVAL_MS,
    };
  }

  /**
   * Initialize the unified backend
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Get unified memory manager with our config
    const unifiedConfig: Partial<UnifiedMemoryConfig> = {
      dbPath: this.config.sqlite.path ?? DEFAULT_UNIFIED_MEMORY_CONFIG.dbPath,
      walMode: this.config.sqlite.walMode ?? true,
      busyTimeout: this.config.sqlite.busyTimeout ?? MEMORY_CONSTANTS.BUSY_TIMEOUT_MS,
    };

    this.unifiedMemory = getUnifiedMemory(unifiedConfig);
    await this.unifiedMemory.initialize();

    // Start cleanup interval (unref so it doesn't block process exit)
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      this.config.cleanupInterval
    );
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    this.initialized = true;
    console.log(`[HybridBackend] Initialized with unified memory: ${this.unifiedMemory.getDbPath()}`);
  }

  /**
   * Dispose of the backend
   */
  async dispose(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Note: We don't close UnifiedMemoryManager here because it's a singleton
    // that may be shared with other components. Let the app lifecycle manage it.

    this.initialized = false;
  }

  /**
   * Store a value
   */
  async set<T>(key: string, value: T, options?: StoreOptions): Promise<void> {
    this.ensureInitialized();
    const namespace = options?.namespace ?? this.config.defaultNamespace;
    await this.unifiedMemory!.kvSet(key, value, namespace, options?.ttl);
  }

  /**
   * Retrieve a value
   */
  async get<T>(key: string): Promise<T | undefined> {
    this.ensureInitialized();
    return this.unifiedMemory!.kvGet<T>(key, this.config.defaultNamespace);
  }

  /**
   * Delete a value
   */
  async delete(key: string): Promise<boolean> {
    this.ensureInitialized();

    // Delete from KV store
    const kvDeleted = await this.unifiedMemory!.kvDelete(key, this.config.defaultNamespace);

    // Also try to delete from vectors (in case it's a vector key)
    const vectorDeleted = await this.unifiedMemory!.vectorDelete(key);

    return kvDeleted || vectorDeleted;
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    this.ensureInitialized();
    return this.unifiedMemory!.kvExists(key, this.config.defaultNamespace);
  }

  /**
   * Search for keys matching pattern
   */
  async search(pattern: string, limit: number = 100): Promise<string[]> {
    this.ensureInitialized();
    return this.unifiedMemory!.kvSearch(pattern, this.config.defaultNamespace, limit);
  }

  /**
   * Vector similarity search
   * Now uses unified memory's persistent vector storage
   */
  async vectorSearch(embedding: number[], k: number): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    const results = await this.unifiedMemory!.vectorSearch(embedding, k);

    // Convert to VectorSearchResult format
    return results.map(r => ({
      key: r.id,
      score: r.score,
      metadata: r.metadata,
    }));
  }

  /**
   * Store vector embedding
   * Now persists to unified memory.db
   */
  async storeVector(
    key: string,
    embedding: number[],
    metadata?: unknown
  ): Promise<void> {
    this.ensureInitialized();
    await this.unifiedMemory!.vectorStore(key, embedding, this.config.defaultNamespace, metadata);
  }

  // ============================================================================
  // Hybrid-specific Methods (backward compatible)
  // ============================================================================

  /**
   * Get health status
   */
  getHealth(): BackendHealth {
    return {
      sqlite: this.unifiedMemory?.isInitialized() ? 'healthy' : 'unavailable',
      sqlitePersistent: true, // Always persistent now
      agentdb: this.unifiedMemory?.isInitialized() ? 'healthy' : 'unavailable', // Unified
      fallback: 'inactive', // No fallback needed
    };
  }

  /**
   * Check if using real file-based persistence
   */
  isPersistent(): boolean {
    return this.unifiedMemory?.isInitialized() ?? false;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<HybridBackendConfig> {
    return { ...this.config };
  }

  /**
   * Store with explicit backend selection (legacy API)
   */
  async setWithBackend<T>(
    key: string,
    value: T,
    backend: 'sqlite' | 'memory',
    options?: StoreOptions
  ): Promise<void> {
    // All backends now route to unified memory
    await this.set(key, value, options);
  }

  /**
   * Get vector statistics
   */
  async getVectorStats(): Promise<{ vectorCount: number; indexSize: number } | null> {
    if (!this.unifiedMemory?.isInitialized()) {
      return null;
    }

    const count = await this.unifiedMemory.vectorCount();
    const stats = this.unifiedMemory.getStats();

    return {
      vectorCount: count,
      indexSize: stats.vectorIndexSize,
    };
  }

  /**
   * Get unified memory manager (for advanced operations)
   */
  getUnifiedMemory(): UnifiedMemoryManager | null {
    return this.unifiedMemory;
  }

  // ============================================================================
  // Count Operations (CI-001, CI-002)
  // ============================================================================

  /**
   * Count entries in a namespace
   * Counts all KV store entries that match the given namespace prefix.
   * @param namespace - The namespace to count entries for
   * @returns The number of entries in the namespace
   */
  async count(namespace: string): Promise<number> {
    this.ensureInitialized();

    const db = this.unifiedMemory!.getDatabase();

    // Use SQL LIKE to match namespace prefix
    // This handles hierarchical namespaces like 'code-intelligence:kg'
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM kv_store
      WHERE namespace LIKE ?
        AND (expires_at IS NULL OR expires_at > ?)
    `).get(`${namespace}%`, Date.now()) as { count: number };

    return row.count;
  }

  /**
   * Check if code intelligence index exists
   * Returns true if code-intelligence:kg namespace has entries.
   * This is used to determine if a project has been indexed and can
   * leverage semantic search for improved accuracy.
   * @returns True if the code intelligence knowledge graph has been indexed
   */
  async hasCodeIntelligenceIndex(): Promise<boolean> {
    this.ensureInitialized();

    const db = this.unifiedMemory!.getDatabase();

    // Check if any entries exist in the code-intelligence:kg namespace
    // Using LIMIT 1 for efficiency - we only need to know if ANY exist
    const row = db.prepare(`
      SELECT 1 FROM kv_store
      WHERE namespace = 'code-intelligence:kg'
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1
    `).get(Date.now());

    return row !== undefined;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.unifiedMemory) {
      throw new Error('HybridMemoryBackend not initialized. Call initialize() first.');
    }
  }

  private async cleanup(): Promise<void> {
    if (this.unifiedMemory?.isInitialized()) {
      try {
        await this.unifiedMemory.kvCleanupExpired();
      } catch (error) {
        console.warn('[HybridBackend] Cleanup failed:', error);
      }
    }
  }
}
