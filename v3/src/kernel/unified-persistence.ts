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
import { toErrorMessage } from '../shared/error-utils.js';
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
  private static instancePromise: Promise<UnifiedPersistenceManager> | null = null;

  private unifiedMemory: UnifiedMemoryManager | null = null;
  private readonly config: UnifiedPersistenceConfig;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor(config?: Partial<UnifiedPersistenceConfig>) {
    this.config = { ...DEFAULT_UNIFIED_CONFIG, ...config };
  }

  /**
   * Get or create the singleton instance (synchronous).
   * Thread-safe: JS is single-threaded for synchronous code.
   */
  static getInstance(config?: Partial<UnifiedPersistenceConfig>): UnifiedPersistenceManager {
    // Synchronous return if already created
    if (UnifiedPersistenceManager.instance) {
      return UnifiedPersistenceManager.instance;
    }
    // Synchronous creation - JS single-threaded execution prevents race here
    UnifiedPersistenceManager.instance = new UnifiedPersistenceManager(config);
    return UnifiedPersistenceManager.instance;
  }

  /**
   * Get or create the singleton instance with async initialization.
   * Thread-safe: Uses Promise lock to prevent concurrent initialization races.
   */
  static async getInstanceAsync(config?: Partial<UnifiedPersistenceConfig>): Promise<UnifiedPersistenceManager> {
    // Fast path: already fully initialized
    if (UnifiedPersistenceManager.instance?.initialized) {
      return UnifiedPersistenceManager.instance;
    }

    // Use Promise lock to prevent concurrent initialization
    if (!UnifiedPersistenceManager.instancePromise) {
      UnifiedPersistenceManager.instancePromise = (async () => {
        const instance = UnifiedPersistenceManager.getInstance(config);
        await instance.initialize();
        return instance;
      })();
    }

    return UnifiedPersistenceManager.instancePromise;
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    if (UnifiedPersistenceManager.instance) {
      UnifiedPersistenceManager.instance.close();
      UnifiedPersistenceManager.instance = null;
    }
    UnifiedPersistenceManager.instancePromise = null;
    // Also reset the underlying unified memory
    resetUnifiedMemory();
  }

  /**
   * Initialize the database and create all schemas.
   * Thread-safe: Uses Promise lock to prevent concurrent initialization races.
   */
  async initialize(): Promise<void> {
    // Fast path: already initialized
    if (this.initialized) return;

    // Use Promise lock to prevent concurrent initialization
    if (!this.initPromise) {
      this.initPromise = this._doInitialize();
    }

    return this.initPromise;
  }

  /**
   * Internal initialization implementation
   */
  private async _doInitialize(): Promise<void> {
    // Double-check after acquiring promise lock
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
      // Allow retry on failure by clearing the promise
      this.initPromise = null;
      throw new Error(
        `Failed to initialize UnifiedPersistenceManager: ${toErrorMessage(error)}`
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

// ============================================================================
// Process Exit Handlers - Ensure cleanup on process exit
// ============================================================================

let exitHandlersRegistered = false;

function registerExitHandlers(): void {
  if (exitHandlersRegistered) return;
  exitHandlersRegistered = true;

  const cleanup = (): void => {
    try {
      const instance = UnifiedPersistenceManager['instance'];
      if (instance) {
        instance.close();
      }
    } catch (error) {
      // Non-critical: cleanup errors during shutdown
      console.debug('[UnifiedPersistence] Cleanup error:', error instanceof Error ? error.message : error);
    }
  };

  process.on('beforeExit', cleanup);

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
}

// Register exit handlers when module is loaded
registerExitHandlers();
