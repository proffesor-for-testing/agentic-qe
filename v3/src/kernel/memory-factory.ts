/**
 * Agentic QE v3 - Memory Backend Factory
 * Creates appropriate memory backend based on configuration
 */

import { MemoryBackend } from './interfaces';
import { InMemoryBackend } from './memory-backend';
import { AgentDBBackend, AgentDBConfig } from './agentdb-backend';
import { HybridMemoryBackend, HybridBackendConfig, SQLiteConfig } from './hybrid-backend';

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Supported memory backend types
 */
export type MemoryBackendType = 'memory' | 'sqlite' | 'agentdb' | 'hybrid';

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

  /** AgentDB backend options (type: 'agentdb') */
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
 * // AgentDB with HNSW for vector search
 * const vectorMemory = await createMemoryBackend({
 *   type: 'agentdb',
 *   agentdb: {
 *     path: './data/vectors.db',
 *     hnsw: { dimensions: 384, metric: 'cosine' }
 *   }
 * });
 *
 * // Hybrid: SQLite + AgentDB with fallback
 * const hybridMemory = await createMemoryBackend({
 *   type: 'hybrid',
 *   hybrid: {
 *     enableFallback: true,
 *     sqlite: { path: './data/memory.db' },
 *     agentdb: { path: './data/vectors.db' }
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
      // SQLite-only mode uses hybrid backend with AgentDB disabled
      backend = new HybridMemoryBackend({
        sqlite: config.sqlite,
        enableFallback: true,
        // Don't initialize AgentDB for SQLite-only mode
        agentdb: undefined,
      });
      break;

    case 'agentdb':
      backend = new AgentDBBackend(config.agentdb);
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
 * - AQE_VECTOR_DIMENSIONS: Vector embedding dimensions
 *
 * @param autoInitialize - Whether to automatically initialize
 * @returns Configured memory backend
 */
export async function createDefaultMemoryBackend(
  autoInitialize: boolean = true
): Promise<MemoryBackendResult> {
  const backendType = (process.env.AQE_MEMORY_BACKEND as MemoryBackendType) ?? 'memory';
  const storagePath = process.env.AQE_MEMORY_PATH ?? '.agentic-qe';
  const vectorDimensions = parseInt(process.env.AQE_VECTOR_DIMENSIONS ?? '384', 10);

  const config: MemoryBackendConfig = {
    type: backendType,
    sqlite: {
      path: `${storagePath}/memory.db`,
      walMode: true,
    },
    agentdb: {
      path: `${storagePath}/vectors.db`,
      hnsw: {
        dimensions: vectorDimensions,
        metric: 'cosine',
        M: 16,
        efConstruction: 200,
        efSearch: 100,
      },
    },
    hybrid: {
      enableFallback: true,
      sqlite: {
        path: `${storagePath}/memory.db`,
      },
      agentdb: {
        path: `${storagePath}/vectors.db`,
        hnsw: {
          dimensions: vectorDimensions,
          metric: 'cosine',
          M: 16,
          efConstruction: 200,
          efSearch: 100,
        },
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
  // High-performance vector search -> AgentDB with HNSW
  if (requirements.needsVectorSearch && requirements.needsHighPerformance) {
    return 'agentdb';
  }

  // Need both persistence and vectors -> Hybrid
  if (requirements.needsPersistence && requirements.needsVectorSearch) {
    return 'hybrid';
  }

  // Only persistence needed -> SQLite
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
          cleanupInterval: 60000,
        },
      };

    case 'production':
      // Full hybrid with all features
      return {
        type: 'hybrid',
        hybrid: {
          enableFallback: false, // Fail fast in production
          sqlite: {
            walMode: true,
            poolSize: 10,
            busyTimeout: 10000,
          },
          agentdb: {
            walEnabled: true,
            cacheSize: 256 * 1024 * 1024, // 256MB
            hnsw: {
              M: 32, // Higher connectivity for better recall
              efConstruction: 400,
              efSearch: 200,
              metric: 'cosine',
              dimensions: 384,
            },
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
  AgentDBBackend,
  HybridMemoryBackend,
  type AgentDBConfig,
  type HybridBackendConfig,
  type SQLiteConfig,
};
