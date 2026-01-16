/**
 * Unified Persistence Manager for AQE V3
 *
 * FACADE: Delegates to UnifiedMemoryManager for true unified storage.
 *
 * All data is stored in a single database file: .agentic-qe/memory.db
 *
 * This module maintains backward compatibility with existing consumers:
 * - Q-Values (RL algorithms)
 * - GOAP (planning)
 * - Dreams (pattern discovery)
 * - Concepts (knowledge graph)
 *
 * Benefits:
 * - Single database file (.agentic-qe/memory.db)
 * - Shared connection pool
 * - Unified WAL mode
 * - Atomic cross-feature transactions
 * - Simplified backup/restore
 */

import { type Database as DatabaseType } from 'better-sqlite3';
import {
  UnifiedMemoryManager,
  getUnifiedMemory,
  resetUnifiedMemory,
  UnifiedMemoryConfig,
  DEFAULT_UNIFIED_MEMORY_CONFIG,
} from './unified-memory';

// ============================================================================
// Configuration (delegates to unified-memory)
// ============================================================================

export interface UnifiedPersistenceConfig {
  /** Database file path */
  dbPath: string;
  /** Enable WAL mode for better concurrency */
  walMode: boolean;
  /** Memory-mapped I/O size in bytes */
  mmapSize: number;
  /** Cache size in pages (-ve = KB) */
  cacheSize: number;
  /** Busy timeout in milliseconds */
  busyTimeout: number;
}

// Use same path as unified-memory for true unification
export const DEFAULT_UNIFIED_CONFIG: UnifiedPersistenceConfig = {
  dbPath: DEFAULT_UNIFIED_MEMORY_CONFIG.dbPath, // '.agentic-qe/memory.db'
  walMode: true,
  mmapSize: 64 * 1024 * 1024, // 64MB
  cacheSize: -32000, // 32MB
  busyTimeout: 5000,
};

// ============================================================================
// Unified Persistence Manager (Facade over UnifiedMemoryManager)
// ============================================================================

/**
 * Facade over UnifiedMemoryManager for backward compatibility.
 *
 * Existing consumers (q-value-store, goap-planner, etc.) can continue
 * using this API while all data flows through the unified memory.db.
 */
export class UnifiedPersistenceManager {
  private static instance: UnifiedPersistenceManager | null = null;

  private unifiedMemory: UnifiedMemoryManager | null = null;
  private readonly config: UnifiedPersistenceConfig;
  private initialized = false;

  private constructor(config?: Partial<UnifiedPersistenceConfig>) {
    this.config = { ...DEFAULT_UNIFIED_CONFIG, ...config };
  }

  /**
   * Get or create the singleton instance
   */
  static getInstance(config?: Partial<UnifiedPersistenceConfig>): UnifiedPersistenceManager {
    if (!UnifiedPersistenceManager.instance) {
      UnifiedPersistenceManager.instance = new UnifiedPersistenceManager(config);
    }
    return UnifiedPersistenceManager.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    if (UnifiedPersistenceManager.instance) {
      UnifiedPersistenceManager.instance.close();
      UnifiedPersistenceManager.instance = null;
    }
    // Also reset the underlying unified memory
    resetUnifiedMemory();
  }

  /**
   * Initialize the database and create all schemas
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Convert config to UnifiedMemoryConfig
      const memoryConfig: Partial<UnifiedMemoryConfig> = {
        dbPath: this.config.dbPath,
        walMode: this.config.walMode,
        busyTimeout: this.config.busyTimeout,
        mmapSize: this.config.mmapSize,
        cacheSize: this.config.cacheSize,
      };

      // Get and initialize the unified memory manager
      this.unifiedMemory = getUnifiedMemory(memoryConfig);
      await this.unifiedMemory.initialize();

      this.initialized = true;
      console.log(`[UnifiedPersistence] Initialized via UnifiedMemoryManager: ${this.config.dbPath}`);
    } catch (error) {
      throw new Error(
        `Failed to initialize UnifiedPersistenceManager: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the raw database connection for advanced operations
   */
  getDatabase(): DatabaseType {
    if (!this.unifiedMemory || !this.initialized) {
      throw new Error('UnifiedPersistenceManager not initialized');
    }
    return this.unifiedMemory.getDatabase();
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the database path
   */
  getDbPath(): string {
    return this.config.dbPath;
  }

  /**
   * Prepare and cache a statement
   */
  prepare(name: string, sql: string): ReturnType<DatabaseType['prepare']> {
    if (!this.unifiedMemory) throw new Error('Database not initialized');
    return this.unifiedMemory.prepare(name, sql);
  }

  /**
   * Execute a transaction
   */
  transaction<T>(fn: () => T): T {
    if (!this.unifiedMemory) throw new Error('Database not initialized');
    return this.unifiedMemory.transaction(fn);
  }

  /**
   * Get database statistics
   */
  getStats(): {
    tables: { name: string; rowCount: number }[];
    fileSize: number;
    walSize: number;
  } {
    if (!this.unifiedMemory) throw new Error('Database not initialized');

    const memStats = this.unifiedMemory.getStats();

    // Use the tables from unified memory stats directly
    // UnifiedMemoryManager.getStats() already returns properly formatted table stats
    return {
      tables: memStats.tables,
      fileSize: memStats.fileSize,
      walSize: memStats.walSize,
    };
  }

  /**
   * Vacuum the database to reclaim space
   */
  vacuum(): void {
    const db = this.getDatabase();
    db.exec('VACUUM');
  }

  /**
   * Checkpoint WAL to main database
   */
  checkpoint(): void {
    const db = this.getDatabase();
    db.pragma('wal_checkpoint(TRUNCATE)');
  }

  /**
   * Close the database connection
   */
  close(): void {
    // Don't close the underlying UnifiedMemoryManager as it's a singleton
    // shared with other components. Just mark ourselves as not initialized.
    this.initialized = false;
    console.log('[UnifiedPersistence] Facade closed');
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the shared persistence manager instance
 */
export function getUnifiedPersistence(
  config?: Partial<UnifiedPersistenceConfig>
): UnifiedPersistenceManager {
  return UnifiedPersistenceManager.getInstance(config);
}

/**
 * Initialize the shared persistence manager
 */
export async function initializeUnifiedPersistence(
  config?: Partial<UnifiedPersistenceConfig>
): Promise<UnifiedPersistenceManager> {
  const manager = getUnifiedPersistence(config);
  await manager.initialize();
  return manager;
}

/**
 * Reset the shared persistence manager (for testing)
 */
export function resetUnifiedPersistence(): void {
  UnifiedPersistenceManager.resetInstance();
}
