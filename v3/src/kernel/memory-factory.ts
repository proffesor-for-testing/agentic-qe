/**
 * Agentic QE v3 - Memory Backend Factory
 * Creates appropriate memory backend based on configuration
 *
 * NOTE: All backends now delegate to UnifiedMemoryManager for true unified storage.
 * The 'agentdb' type is kept for backward compatibility but maps to HybridMemoryBackend.
 */

import { MemoryBackend } from './interfaces';
import { InMemoryBackend } from './memory-backend';
import { HybridMemoryBackend, HybridBackendConfig, SQLiteConfig } from './hybrid-backend';
import { MEMORY_CONSTANTS, DATABASE_POOL_CONSTANTS } from './constants.js';

// ============================================================================
// Module Constants
// ============================================================================

/** Default cleanup interval for development mode (1 minute) */
const DEV_CLEANUP_INTERVAL_MS = MEMORY_CONSTANTS.CLEANUP_INTERVAL_MS;

/** Default database path for unified storage */
const DEFAULT_MEMORY_DB_PATH = '.agentic-qe/memory.db';

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Supported memory backend types
 *
 * NOTE: 'agentdb' is now an alias for 'hybrid' - all vector operations
 * are handled by the unified memory.db with built-in HNSW indexing.
 */
export type MemoryBackendType = 'memory' | 'sqlite' | 'agentdb' | 'hybrid';

/**
 * AgentDB configuration (legacy - for backward compatibility)
 * Now maps to HybridMemoryBackend which has HNSW built-in.
 */
export interface AgentDBConfig {
  /** Database file path (uses unified memory.db) */
  path?: string;
}

/**
 * Memory backend configuration union
 */
export interface MemoryBackendConfig {
  /** Backend type to create */
  type: MemoryBackendType;

  /** InMemory backend options (type: 'memory') */
  memory?: {
    cleanupInterval?: number;
  };

  /** SQLite backend options (type: 'sqlite') */
  sqlite?: Partial<SQLiteConfig>;

  /** AgentDB backend options (type: 'agentdb') - legacy, maps to hybrid */
  agentdb?: Partial<AgentDBConfig>;

  /** Hybrid backend options (type: 'hybrid') */
  hybrid?: Partial<HybridBackendConfig>;
}

/**
 * Result of backend creation
 */
export interface MemoryBackendResult {
  backend: MemoryBackend;
  type: MemoryBackendType;
  initialized: boolean;
}

// ============================================================================
// Factory Implementation
// ============================================================================

/**
 * Create a memory backend based on configuration
 *
 * @param config - Backend configuration
 * @param autoInitialize - Whether to automatically initialize the backend
 * @returns The created and optionally initialized memory backend
 *
 * @example
 * ```typescript
 * // Simple in-memory backend
 * const memory = await createMemoryBackend({ type: 'memory' });
 *
 * // Vector search via unified memory (agentdb is now alias for hybrid)
 * const vectorMemory = await createMemoryBackend({
 *   type: 'agentdb',
 *   agentdb: { path: './data/memory.db' }
 * });
 *
 * // Hybrid: SQLite with vector search built-in
 * const hybridMemory = await createMemoryBackend({
 *   type: 'hybrid',
 *   hybrid: {
 *     enableFallback: true,
 *     sqlite: { path: './data/memory.db' }
 *   }
 * });
 * ```
 */
export async function createMemoryBackend(
  config: MemoryBackendConfig,
  autoInitialize: boolean = true
): Promise<MemoryBackendResult> {
  let backend: MemoryBackend;

  switch (config.type) {
    case 'memory':
      backend = new InMemoryBackend();
      break;

    case 'sqlite':
      // SQLite-only mode uses hybrid backend
      backend = new HybridMemoryBackend({
        sqlite: config.sqlite,
        enableFallback: true,
      });
      break;

    case 'agentdb':
      // AgentDB now maps to HybridMemoryBackend which has HNSW built-in
      // This maintains backward compatibility while using unified storage
      backend = new HybridMemoryBackend({
        sqlite: { path: config.agentdb?.path ?? DEFAULT_MEMORY_DB_PATH },
        enableFallback: true,
      });
      break;

    case 'hybrid':
      backend = new HybridMemoryBackend(config.hybrid);
      break;

    default:
      throw new Error(`Unknown memory backend type: ${config.type}`);
  }

  if (autoInitialize) {
    await backend.initialize();
  }

  return {
    backend,
    type: config.type,
    initialized: autoInitialize,
  };
}

/**
 * Create the default memory backend based on environment
 *
 * Uses environment variables to determine backend type:
 * - AQE_MEMORY_BACKEND: 'memory' | 'sqlite' | 'agentdb' | 'hybrid'
 * - AQE_MEMORY_PATH: Path for persistent storage
 * - AQE_VECTOR_DIMENSIONS: Vector embedding dimensions (used by UnifiedMemory)
 *
 * @param autoInitialize - Whether to automatically initialize
 * @returns Configured memory backend
 */
export async function createDefaultMemoryBackend(
  autoInitialize: boolean = true
): Promise<MemoryBackendResult> {
  const backendType = (process.env.AQE_MEMORY_BACKEND as MemoryBackendType) ?? 'memory';
  const storagePath = process.env.AQE_MEMORY_PATH ?? '.agentic-qe';

  const config: MemoryBackendConfig = {
    type: backendType,
    sqlite: {
      path: `${storagePath}/memory.db`,
      walMode: true,
    },
    agentdb: {
      // Now just uses unified memory.db
      path: `${storagePath}/memory.db`,
    },
    hybrid: {
      enableFallback: true,
      sqlite: {
        path: `${storagePath}/memory.db`,
      },
    },
  };

  return createMemoryBackend(config, autoInitialize);
}

// ============================================================================
// Backend Selection Helpers
// ============================================================================

/**
 * Determine the best backend type based on requirements
 *
 * @param requirements - Backend requirements
 * @returns Recommended backend type
 */
export function selectBackendType(requirements: {
  needsVectorSearch: boolean;
  needsPersistence: boolean;
  needsHighPerformance: boolean;
  maxMemoryMB?: number;
}): MemoryBackendType {
  // High-performance vector search -> hybrid (has HNSW built-in)
  if (requirements.needsVectorSearch && requirements.needsHighPerformance) {
    return 'hybrid';
  }

  // Need both persistence and vectors -> Hybrid
  if (requirements.needsPersistence && requirements.needsVectorSearch) {
    return 'hybrid';
  }

  // Only persistence needed -> SQLite (via hybrid)
  if (requirements.needsPersistence) {
    return 'sqlite';
  }

  // Memory constrained or ephemeral -> In-memory
  return 'memory';
}

/**
 * Get recommended configuration for a specific use case
 */
export function getRecommendedConfig(
  useCase: 'testing' | 'development' | 'production' | 'ci'
): MemoryBackendConfig {
  switch (useCase) {
    case 'testing':
      // Fast, ephemeral storage for tests
      return { type: 'memory' };

    case 'development':
      // Persistent with fallback for dev comfort
      return {
        type: 'hybrid',
        hybrid: {
          enableFallback: true,
          cleanupInterval: DEV_CLEANUP_INTERVAL_MS,
        },
      };

    case 'production':
      // Full hybrid with unified memory.db
      return {
        type: 'hybrid',
        hybrid: {
          enableFallback: false, // Fail fast in production
          sqlite: {
            walMode: true,
            poolSize: DATABASE_POOL_CONSTANTS.DEFAULT_POOL_SIZE,
            busyTimeout: DATABASE_POOL_CONSTANTS.POOL_BUSY_TIMEOUT_MS,
          },
        },
      };

    case 'ci':
      // SQLite only for CI reproducibility
      return {
        type: 'sqlite',
        sqlite: {
          path: ':memory:', // In-memory SQLite for CI
          walMode: false,
        },
      };

    default:
      return { type: 'memory' };
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  InMemoryBackend,
  HybridMemoryBackend,
  type HybridBackendConfig,
  type SQLiteConfig,
};
