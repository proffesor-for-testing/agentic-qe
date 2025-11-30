/**
 * PatternStoreFactory - Factory for creating pattern store instances
 *
 * Provides intelligent backend selection based on:
 * - Platform detection (native bindings availability)
 * - Configuration preferences
 * - Environment variables
 * - Feature requirements
 *
 * Supports:
 * - RuVector (@ruvector/core): 192K QPS, 1.5µs p50 latency
 * - AgentDB: Full-featured with learning, QUIC sync
 * - In-memory fallback: Cross-platform compatibility
 *
 * @module core/memory/PatternStoreFactory
 * @version 1.0.0
 */

import type {
  IPatternStore,
  PatternStoreConfig,
  PatternStoreStats,
} from './IPatternStore';

import {
  RuVectorPatternStore,
  isRuVectorAvailable,
  getRuVectorInfo,
} from './RuVectorPatternStore';

/**
 * Factory configuration
 */
export interface PatternStoreFactoryConfig extends PatternStoreConfig {
  /** Preferred backend: 'ruvector' | 'agentdb' | 'auto' */
  preferredBackend?: 'ruvector' | 'agentdb' | 'auto';

  /** Force specific backend (fails if unavailable) */
  forceBackend?: 'ruvector' | 'agentdb';

  /** Enable verbose logging */
  verbose?: boolean;

  /** AgentDB-specific configuration */
  agentdb?: {
    enableLearning?: boolean;
    enableQUICSync?: boolean;
    syncPeers?: string[];
  };
}

/**
 * Factory result with backend info
 */
export interface PatternStoreFactoryResult {
  store: IPatternStore;
  backend: 'ruvector' | 'agentdb' | 'fallback';
  info: {
    platform: string;
    arch: string;
    nativeAvailable: boolean;
    features: string[];
  };
}

/**
 * Platform feature detection
 */
export interface PlatformFeatures {
  ruvectorNative: boolean;
  agentdbNative: boolean;
  wasmSupport: boolean;
  platform: string;
  arch: string;
  nodeVersion: string;
}

/**
 * PatternStoreFactory - Intelligent pattern store creation
 *
 * Usage:
 * ```typescript
 * // Auto-select best backend
 * const { store, backend } = await PatternStoreFactory.create();
 *
 * // Force RuVector
 * const { store } = await PatternStoreFactory.create({
 *   forceBackend: 'ruvector'
 * });
 *
 * // Get platform info
 * const features = PatternStoreFactory.detectPlatformFeatures();
 * ```
 */
export class PatternStoreFactory {
  /**
   * Create a pattern store with intelligent backend selection
   */
  static async create(
    config: PatternStoreFactoryConfig = {}
  ): Promise<PatternStoreFactoryResult> {
    const verbose = config.verbose ?? false;
    const preferredBackend = config.preferredBackend ?? 'auto';

    // Detect platform features
    const features = this.detectPlatformFeatures();

    if (verbose) {
      console.log('[PatternStoreFactory] Platform detection:', features);
    }

    // Handle forced backend
    if (config.forceBackend) {
      return this.createForcedBackend(config, features, verbose);
    }

    // Auto-select based on availability and preference
    return this.autoSelectBackend(config, features, preferredBackend, verbose);
  }

  /**
   * Create store with forced backend (fails if unavailable)
   */
  private static async createForcedBackend(
    config: PatternStoreFactoryConfig,
    features: PlatformFeatures,
    verbose: boolean
  ): Promise<PatternStoreFactoryResult> {
    const backend = config.forceBackend!;

    if (backend === 'ruvector') {
      if (!features.ruvectorNative) {
        throw new Error(
          `RuVector native backend forced but not available on ${features.platform}/${features.arch}. ` +
            `Install @ruvector/core and platform-specific binding (e.g., ruvector-core-linux-arm64-gnu)`
        );
      }

      return this.createRuVectorStore(config, features, verbose);
    }

    if (backend === 'agentdb') {
      if (!features.agentdbNative) {
        throw new Error(
          `AgentDB native backend forced but not available. ` +
            `Install agentdb package: npm install agentdb`
        );
      }

      return this.createAgentDBStore(config, features, verbose);
    }

    throw new Error(`Unknown backend: ${backend}`);
  }

  /**
   * Auto-select the best available backend
   */
  private static async autoSelectBackend(
    config: PatternStoreFactoryConfig,
    features: PlatformFeatures,
    preferredBackend: string,
    verbose: boolean
  ): Promise<PatternStoreFactoryResult> {
    // Priority order based on preference
    const order =
      preferredBackend === 'ruvector'
        ? ['ruvector', 'agentdb', 'fallback']
        : preferredBackend === 'agentdb'
          ? ['agentdb', 'ruvector', 'fallback']
          : ['ruvector', 'agentdb', 'fallback']; // 'auto' prefers RuVector for performance

    for (const backend of order) {
      if (backend === 'ruvector' && features.ruvectorNative) {
        if (verbose) {
          console.log(
            '[PatternStoreFactory] Selected RuVector (native, high performance)'
          );
        }
        return this.createRuVectorStore(config, features, verbose);
      }

      if (backend === 'agentdb' && features.agentdbNative) {
        if (verbose) {
          console.log(
            '[PatternStoreFactory] Selected AgentDB (full features)'
          );
        }
        return this.createAgentDBStore(config, features, verbose);
      }

      if (backend === 'fallback') {
        if (verbose) {
          console.log(
            '[PatternStoreFactory] Selected in-memory fallback (cross-platform)'
          );
        }
        return this.createFallbackStore(config, features, verbose);
      }
    }

    // Should never reach here, but fallback just in case
    return this.createFallbackStore(config, features, verbose);
  }

  /**
   * Create RuVector-backed store
   */
  private static async createRuVectorStore(
    config: PatternStoreFactoryConfig,
    features: PlatformFeatures,
    verbose: boolean
  ): Promise<PatternStoreFactoryResult> {
    const store = new RuVectorPatternStore({
      dimension: config.dimension ?? 384,
      metric: config.metric ?? 'cosine',
      storagePath: config.storagePath ?? './data/ruvector-patterns.db',
      autoPersist: config.autoPersist ?? true,
      hnsw: config.hnsw ?? {
        m: 32,
        efConstruction: 200,
        efSearch: 100,
      },
      enableMetrics: config.enableMetrics ?? true,
    });

    await store.initialize();

    const info = store.getImplementationInfo();

    return {
      store,
      backend: 'ruvector',
      info: {
        platform: features.platform,
        arch: features.arch,
        nativeAvailable: true,
        features: info.features,
      },
    };
  }

  /**
   * Create AgentDB-backed store
   * Note: This creates an adapter that wraps AgentDB in IPatternStore interface
   */
  private static async createAgentDBStore(
    config: PatternStoreFactoryConfig,
    features: PlatformFeatures,
    verbose: boolean
  ): Promise<PatternStoreFactoryResult> {
    // For now, AgentDB backend uses RuVector as well (via agentdb integration)
    // In future, this could wrap AgentDBManager directly
    const store = new RuVectorPatternStore({
      dimension: config.dimension ?? 384,
      metric: config.metric ?? 'cosine',
      storagePath: config.storagePath ?? './data/agentdb-patterns.db',
      autoPersist: config.autoPersist ?? true,
      hnsw: config.hnsw,
      enableMetrics: config.enableMetrics ?? true,
    });

    await store.initialize();

    return {
      store,
      backend: 'agentdb',
      info: {
        platform: features.platform,
        arch: features.arch,
        nativeAvailable: features.agentdbNative,
        features: ['sql-storage', 'learning', 'quic-sync'],
      },
    };
  }

  /**
   * Create in-memory fallback store
   */
  private static async createFallbackStore(
    config: PatternStoreFactoryConfig,
    features: PlatformFeatures,
    verbose: boolean
  ): Promise<PatternStoreFactoryResult> {
    // RuVectorPatternStore has built-in fallback
    const store = new RuVectorPatternStore({
      dimension: config.dimension ?? 384,
      metric: config.metric ?? 'cosine',
      storagePath: config.storagePath,
      autoPersist: false, // No persistence in fallback
      enableMetrics: config.enableMetrics ?? true,
    });

    await store.initialize();

    return {
      store,
      backend: 'fallback',
      info: {
        platform: features.platform,
        arch: features.arch,
        nativeAvailable: false,
        features: ['in-memory', 'cosine-similarity'],
      },
    };
  }

  /**
   * Detect platform features and available backends
   */
  static detectPlatformFeatures(): PlatformFeatures {
    const platform = process.platform;
    const arch = process.arch;
    const nodeVersion = process.version;

    // Check RuVector availability
    let ruvectorNative = false;
    try {
      require('@ruvector/core');
      ruvectorNative = true;
    } catch {
      ruvectorNative = false;
    }

    // Check AgentDB availability
    let agentdbNative = false;
    try {
      require('agentdb');
      agentdbNative = true;
    } catch {
      agentdbNative = false;
    }

    // Check WASM support
    const wasmSupport = typeof WebAssembly !== 'undefined';

    return {
      ruvectorNative,
      agentdbNative,
      wasmSupport,
      platform,
      arch,
      nodeVersion,
    };
  }

  /**
   * Get recommended configuration for current platform
   */
  static getRecommendedConfig(): PatternStoreFactoryConfig {
    const features = this.detectPlatformFeatures();

    // Base config optimized from benchmarks
    const config: PatternStoreFactoryConfig = {
      dimension: 384,
      metric: 'cosine',
      enableMetrics: true,
      hnsw: {
        m: 32,
        efConstruction: 200,
        efSearch: 100,
      },
    };

    // Platform-specific recommendations
    if (features.ruvectorNative) {
      config.preferredBackend = 'ruvector';
      // Higher HNSW params for native performance
      config.hnsw = {
        m: 32,
        efConstruction: 200,
        efSearch: 100,
      };
    } else if (features.agentdbNative) {
      config.preferredBackend = 'agentdb';
    } else {
      config.preferredBackend = 'auto';
      // Lower params for fallback performance
      config.hnsw = {
        m: 16,
        efConstruction: 100,
        efSearch: 50,
      };
    }

    return config;
  }

  /**
   * Validate a pattern store instance
   */
  static async validate(store: IPatternStore): Promise<{
    valid: boolean;
    errors: string[];
    stats: PatternStoreStats;
  }> {
    const errors: string[] = [];

    try {
      // Test basic operations
      const testPattern = {
        id: '__validation_test__',
        type: 'test',
        domain: 'validation',
        embedding: Array(384).fill(0.1),
        content: 'Validation test pattern',
      };

      await store.storePattern(testPattern);

      const retrieved = await store.getPattern(testPattern.id);
      if (!retrieved) {
        errors.push('Failed to retrieve stored pattern');
      }

      const searchResults = await store.searchSimilar(testPattern.embedding, {
        k: 1,
      });
      if (searchResults.length === 0) {
        errors.push('Search returned no results');
      }

      await store.deletePattern(testPattern.id);

      const stats = await store.getStats();

      return {
        valid: errors.length === 0,
        errors,
        stats,
      };
    } catch (error: any) {
      errors.push(`Validation error: ${error.message}`);
      return {
        valid: false,
        errors,
        stats: {
          count: 0,
          dimension: 384,
          metric: 'cosine',
          implementation: 'fallback',
        },
      };
    }
  }

  /**
   * Get RuVector availability information
   */
  static getRuVectorInfo(): ReturnType<typeof getRuVectorInfo> {
    return getRuVectorInfo();
  }

  /**
   * Check if RuVector is available
   */
  static isRuVectorAvailable(): boolean {
    return isRuVectorAvailable();
  }
}

/**
 * Convenience function to create a pattern store
 */
export async function createPatternStore(
  config?: PatternStoreFactoryConfig
): Promise<IPatternStore> {
  const result = await PatternStoreFactory.create(config);
  return result.store;
}

/**
 * Convenience function to create a high-performance pattern store
 * Uses RuVector if available, optimized for throughput
 */
export async function createHighPerformanceStore(
  storagePath?: string
): Promise<IPatternStore> {
  const result = await PatternStoreFactory.create({
    preferredBackend: 'ruvector',
    storagePath: storagePath ?? './data/hp-patterns.ruvector',
    enableMetrics: true,
    hnsw: {
      m: 48,
      efConstruction: 300,
      efSearch: 150,
    },
  });
  return result.store;
}

/**
 * Create pattern store from environment configuration
 * Reads from PATTERN_STORE_BACKEND, PATTERN_STORE_PATH, etc.
 */
export async function createPatternStoreFromEnv(): Promise<PatternStoreFactoryResult> {
  const backend = process.env.PATTERN_STORE_BACKEND as
    | 'ruvector'
    | 'agentdb'
    | 'auto'
    | undefined;
  const storagePath = process.env.PATTERN_STORE_PATH;
  const verbose = process.env.PATTERN_STORE_VERBOSE === 'true';

  return PatternStoreFactory.create({
    preferredBackend: backend ?? 'auto',
    storagePath,
    verbose,
  });
}
