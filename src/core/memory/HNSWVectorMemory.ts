/**
 * HNSW Vector Memory - Hierarchical Navigable Small World Index
 *
 * High-performance vector similarity search for learning system pattern matching.
 * Integrates with AgentDB's vector capabilities and RuVector's HNSW implementation.
 *
 * Performance Characteristics:
 * - Search: O(log n) time complexity with HNSW
 * - Insert: O(log n) amortized
 * - Memory: ~100 bytes per vector + HNSW overhead
 *
 * HNSW Parameters:
 * - M: Number of connections per node (16-64, default: 32)
 *   Higher M = better recall, more memory
 * - efConstruction: Search depth during construction (100-200, default: 200)
 *   Higher = better quality index, slower build
 * - efSearch: Search depth during query (50-100, default: 100)
 *   Higher = better recall, slower search
 *
 * Distance Metrics:
 * - Cosine: Best for semantic similarity (default)
 * - Euclidean: Best for spatial distance
 * - Dot Product: Best for normalized vectors
 *
 * @module core/memory/HNSWVectorMemory
 * @version 1.0.0
 */

import type {
  IPatternStore,
  TestPattern,
  PatternSearchOptions,
  PatternSearchResult,
  PatternStoreStats,
  VectorEntry,
} from './IPatternStore';

/**
 * HNSW Configuration Parameters
 */
export interface HNSWConfig {
  /** Number of bi-directional links per node (16-64, default: 32) */
  M: number;

  /** Search depth during index construction (100-200, default: 200) */
  efConstruction: number;

  /** Search depth during queries (50-100, default: 100) */
  efSearch: number;

  /** Distance metric for similarity calculation */
  metric: 'cosine' | 'euclidean' | 'dot';

  /** Vector dimension */
  dimension: number;
}

/**
 * HNSW Vector Memory Configuration
 */
export interface HNSWVectorMemoryConfig extends Partial<HNSWConfig> {
  /** Path to persistent storage (optional) */
  storagePath?: string;

  /** Enable automatic persistence */
  autoPersist?: boolean;

  /** Enable performance metrics collection */
  enableMetrics?: boolean;

  /** Batch size for bulk operations */
  batchSize?: number;

  /** Enable index maintenance (rebalancing, cleanup) */
  enableMaintenance?: boolean;

  /** Maintenance interval in milliseconds */
  maintenanceInterval?: number;
}

/**
 * Search Performance Metrics
 */
export interface SearchMetrics {
  /** Total searches performed */
  totalSearches: number;

  /** Average search latency in microseconds */
  avgLatency: number;

  /** p50 latency in microseconds */
  p50Latency: number;

  /** p99 latency in microseconds */
  p99Latency: number;

  /** Queries per second */
  qps: number;

  /** Index recall (accuracy) */
  recall?: number;

  /** Memory usage in bytes */
  memoryUsage?: number;
}

/**
 * Index Maintenance Statistics
 */
export interface MaintenanceStats {
  /** Last maintenance timestamp */
  lastMaintenance: number;

  /** Number of rebalancing operations */
  rebalanceCount: number;

  /** Number of cleanup operations */
  cleanupCount: number;

  /** Deleted pattern count */
  deletedCount: number;

  /** Index fragmentation percentage (0-100) */
  fragmentation: number;
}

/**
 * Batch Operation Result
 */
export interface BatchResult {
  /** Number of successful operations */
  successful: number;

  /** Number of failed operations */
  failed: number;

  /** Duration in milliseconds */
  duration: number;

  /** Errors encountered */
  errors: Error[];
}

/**
 * HNSW Vector Memory Implementation
 *
 * Provides efficient vector similarity search with configurable HNSW parameters.
 * Integrates with both AgentDB and RuVector backends for flexibility.
 *
 * @implements {IPatternStore}
 */
export class HNSWVectorMemory implements IPatternStore {
  private config: Required<HNSWVectorMemoryConfig>;
  private initialized: boolean = false;
  private backend: IPatternStore | null = null;
  private hnswConfig: HNSWConfig;

  // Performance tracking
  private searchLatencies: number[] = [];
  private insertLatencies: number[] = [];
  private totalSearches: number = 0;
  private totalInserts: number = 0;

  // Maintenance tracking
  private maintenanceStats: MaintenanceStats = {
    lastMaintenance: Date.now(),
    rebalanceCount: 0,
    cleanupCount: 0,
    deletedCount: 0,
    fragmentation: 0,
  };

  private maintenanceTimer?: NodeJS.Timeout;

  constructor(config: HNSWVectorMemoryConfig = {}) {
    // Default HNSW parameters optimized for learning system
    this.hnswConfig = {
      M: config.M ?? 32,
      efConstruction: config.efConstruction ?? 200,
      efSearch: config.efSearch ?? 100,
      metric: config.metric ?? 'cosine',
      dimension: config.dimension ?? 384,
    };

    this.config = {
      ...this.hnswConfig,
      storagePath: config.storagePath ?? '.agentic-qe/hnsw-patterns.db',
      autoPersist: config.autoPersist ?? true,
      enableMetrics: config.enableMetrics ?? true,
      batchSize: config.batchSize ?? 100,
      enableMaintenance: config.enableMaintenance ?? true,
      maintenanceInterval: config.maintenanceInterval ?? 3600000, // 1 hour
    };
  }

  /**
   * Initialize HNSW vector memory with backend selection
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Try to use RuVector as primary backend (best performance)
      const { RuVectorPatternStore, isRuVectorAvailable } = await import('./RuVectorPatternStore');

      if (isRuVectorAvailable()) {
        this.backend = new RuVectorPatternStore({
          dimension: this.hnswConfig.dimension,
          metric: this.hnswConfig.metric,
          storagePath: this.config.storagePath,
          autoPersist: this.config.autoPersist,
          enableMetrics: this.config.enableMetrics,
          hnsw: {
            m: this.hnswConfig.M,
            efConstruction: this.hnswConfig.efConstruction,
            efSearch: this.hnswConfig.efSearch,
          },
        });

        await this.backend.initialize();
        console.log('[HNSW] Using RuVector backend with HNSW indexing');
      } else {
        // Fallback to AgentDB
        await this.initializeAgentDBBackend();
      }
    } catch (error) {
      // If RuVector import fails, use AgentDB
      console.warn('[HNSW] RuVector unavailable, using AgentDB backend:', error);
      await this.initializeAgentDBBackend();
    }

    // Start maintenance if enabled
    if (this.config.enableMaintenance) {
      this.startMaintenance();
    }

    this.initialized = true;
    this.logConfiguration();
  }

  /**
   * Initialize AgentDB as fallback backend
   */
  private async initializeAgentDBBackend(): Promise<void> {
    // Import AgentDB service with HNSW support
    const { AgentDBService } = await import('./AgentDBService');

    // Create a wrapper that implements IPatternStore interface
    const agentDbService = new AgentDBService({
      dbPath: this.config.storagePath,
      embeddingDim: this.hnswConfig.dimension,
      enableHNSW: true,
      enableCache: true,
      hnswConfig: {
        M: this.hnswConfig.M,
        efConstruction: this.hnswConfig.efConstruction,
        efSearch: this.hnswConfig.efSearch,
      },
    });

    await agentDbService.initialize();

    // Create adapter to IPatternStore interface
    this.backend = this.createAgentDBAdapter(agentDbService);
    console.log('[HNSW] Using AgentDB backend with HNSW indexing');
  }

  /**
   * Create IPatternStore adapter for AgentDB
   */
  private createAgentDBAdapter(service: any): IPatternStore {
    return {
      initialize: async () => {
        // Already initialized
      },
      storePattern: async (pattern: TestPattern) => {
        await service.storePattern({
          id: pattern.id,
          type: pattern.type,
          domain: pattern.domain,
          pattern_data: JSON.stringify({
            embedding: pattern.embedding,
            content: pattern.content,
            framework: pattern.framework,
            coverage: pattern.coverage,
            flakinessScore: pattern.flakinessScore,
            verdict: pattern.verdict,
            metadata: pattern.metadata,
          }),
          confidence: 0.8,
          usage_count: pattern.usageCount ?? 0,
          success_count: 0,
          created_at: pattern.createdAt ?? Date.now(),
          last_used: pattern.lastUsed ?? Date.now(),
        });
      },
      searchSimilar: async (
        queryEmbedding: number[],
        options: PatternSearchOptions = {}
      ): Promise<PatternSearchResult[]> => {
        const results = await service.searchSimilar(queryEmbedding, {
          k: options.k ?? 10,
          threshold: options.threshold ?? 0,
          domain: options.domain,
        });

        return results.map((r: any) => {
          const data = JSON.parse(r.pattern_data);
          return {
            pattern: {
              id: r.id,
              embedding: data.embedding,
              type: r.type,
              domain: r.domain,
              content: data.content,
              framework: data.framework,
              coverage: data.coverage,
              flakinessScore: data.flakinessScore,
              verdict: data.verdict,
              createdAt: r.created_at,
              lastUsed: r.last_used,
              usageCount: r.usage_count,
              metadata: data.metadata,
            },
            score: r.similarity ?? r.score ?? 0,
          };
        });
      },
      getPattern: async (id: string): Promise<TestPattern | null> => {
        const pattern = await service.getPattern(id);
        if (!pattern) return null;

        const data = JSON.parse(pattern.pattern_data);
        return {
          id: pattern.id,
          embedding: data.embedding,
          type: pattern.type,
          domain: pattern.domain,
          content: data.content,
          framework: data.framework,
          coverage: data.coverage,
          flakinessScore: data.flakinessScore,
          verdict: data.verdict,
          createdAt: pattern.created_at,
          lastUsed: pattern.last_used,
          usageCount: pattern.usage_count,
          metadata: data.metadata,
        };
      },
      deletePattern: async (id: string): Promise<boolean> => {
        await service.deletePattern(id);
        return true;
      },
      getStats: async (): Promise<PatternStoreStats> => {
        const stats = await service.getStats();
        return {
          count: stats.totalPatterns ?? 0,
          dimension: this.hnswConfig.dimension,
          metric: this.hnswConfig.metric,
          implementation: 'agentdb',
          indexType: 'HNSW',
        };
      },
      clear: async (): Promise<void> => {
        // Not implemented for AgentDB adapter
      },
      shutdown: async (): Promise<void> => {
        await service.shutdown();
      },
      storeBatch: async (patterns: TestPattern[]): Promise<void> => {
        for (const pattern of patterns) {
          await this.backend?.storePattern(pattern);
        }
      },
      recordUsage: async (id: string): Promise<void> => {
        // Track usage in AgentDB
        await service.recordPatternUsage?.(id);
      },
      buildIndex: async (): Promise<void> => {
        // HNSW index is built automatically in AgentDB
      },
      optimize: async (): Promise<void> => {
        await service.optimize?.();
      },
      getImplementationInfo: () => ({
        type: 'agentdb' as const,
        version: '1.6.1',
        features: ['hnsw', 'vector-search', 'persistence'],
      }),
    };
  }

  /**
   * Store a pattern with performance tracking
   */
  async storePattern(pattern: TestPattern): Promise<void> {
    this.ensureInitialized();

    const startTime = performance.now();
    await this.backend!.storePattern(pattern);
    const duration = performance.now() - startTime;

    if (this.config.enableMetrics) {
      this.recordInsertLatency(duration);
    }
  }

  /**
   * Store multiple patterns in batch (optimized)
   * Returns void to match IPatternStore interface
   */
  async storeBatch(patterns: TestPattern[]): Promise<void> {
    this.ensureInitialized();

    const startTime = performance.now();
    const errors: Error[] = [];
    let successful = 0;
    let failed = 0;

    // Process in batches to avoid memory issues
    for (let i = 0; i < patterns.length; i += this.config.batchSize) {
      const batch = patterns.slice(i, i + this.config.batchSize);

      for (const pattern of batch) {
        try {
          await this.storePattern(pattern);
          successful++;
        } catch (error) {
          failed++;
          errors.push(error as Error);
        }
      }
    }

    const duration = performance.now() - startTime;

    // Log batch results for debugging (interface requires void return)
    if (failed > 0) {
      console.warn(`[HNSW] storeBatch completed with ${failed} failures out of ${patterns.length} patterns (${duration.toFixed(2)}ms)`);
    }
  }

  /**
   * Search for similar patterns with performance tracking
   */
  async searchSimilar(
    queryEmbedding: number[],
    options: PatternSearchOptions = {}
  ): Promise<PatternSearchResult[]> {
    this.ensureInitialized();

    const startTime = performance.now();
    const results = await this.backend!.searchSimilar(queryEmbedding, options);
    const duration = performance.now() - startTime;

    if (this.config.enableMetrics) {
      this.recordSearchLatency(duration);
    }

    return results;
  }

  /**
   * Batch query multiple vectors (optimized)
   */
  async searchBatch(
    queries: Array<{ embedding: number[]; options?: PatternSearchOptions }>
  ): Promise<PatternSearchResult[][]> {
    this.ensureInitialized();

    const results: PatternSearchResult[][] = [];

    for (const query of queries) {
      const queryResults = await this.searchSimilar(
        query.embedding,
        query.options ?? {}
      );
      results.push(queryResults);
    }

    return results;
  }

  /**
   * Get a pattern by ID
   */
  async getPattern(id: string): Promise<TestPattern | null> {
    this.ensureInitialized();
    return this.backend!.getPattern(id);
  }

  /**
   * Delete a pattern
   */
  async deletePattern(id: string): Promise<boolean> {
    this.ensureInitialized();
    const deleted = await this.backend!.deletePattern(id);

    if (deleted) {
      this.maintenanceStats.deletedCount++;
    }

    return deleted;
  }

  /**
   * Build or rebuild HNSW index
   */
  async buildIndex(): Promise<void> {
    this.ensureInitialized();

    if (typeof this.backend!.buildIndex === 'function') {
      await this.backend!.buildIndex();
      console.log('[HNSW] Index built successfully');
    }
  }

  /**
   * Optimize the index (rebalancing, cleanup)
   */
  async optimize(): Promise<void> {
    this.ensureInitialized();

    if (typeof this.backend!.optimize === 'function') {
      await this.backend!.optimize();
      this.maintenanceStats.rebalanceCount++;
      this.maintenanceStats.lastMaintenance = Date.now();
      console.log('[HNSW] Index optimized');
    }
  }

  /**
   * Get comprehensive statistics
   */
  async getStats(): Promise<PatternStoreStats> {
    this.ensureInitialized();

    const baseStats = await this.backend!.getStats();
    const metrics = this.getSearchMetrics();

    return {
      ...baseStats,
      p50Latency: metrics.p50Latency,
      p99Latency: metrics.p99Latency,
      qps: metrics.qps,
    };
  }

  /**
   * Get search performance metrics
   */
  getSearchMetrics(): SearchMetrics {
    if (this.searchLatencies.length === 0) {
      return {
        totalSearches: this.totalSearches,
        avgLatency: 0,
        p50Latency: 0,
        p99Latency: 0,
        qps: 0,
      };
    }

    const sorted = [...this.searchLatencies].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p99Index = Math.floor(sorted.length * 0.99);

    const avgLatency =
      this.searchLatencies.reduce((a, b) => a + b, 0) / this.searchLatencies.length;

    return {
      totalSearches: this.totalSearches,
      avgLatency,
      p50Latency: sorted[p50Index] || 0,
      p99Latency: sorted[p99Index] || 0,
      qps: avgLatency > 0 ? 1000 / avgLatency : 0,
    };
  }

  /**
   * Get maintenance statistics
   */
  getMaintenanceStats(): MaintenanceStats {
    return { ...this.maintenanceStats };
  }

  /**
   * Get HNSW configuration
   */
  getConfig(): HNSWConfig {
    return { ...this.hnswConfig };
  }

  /**
   * Update HNSW parameters (requires index rebuild)
   */
  async updateConfig(config: Partial<HNSWConfig>): Promise<void> {
    this.ensureInitialized();

    this.hnswConfig = {
      ...this.hnswConfig,
      ...config,
    };

    // Rebuild index with new parameters
    await this.buildIndex();
    console.log('[HNSW] Configuration updated, index rebuilt');
  }

  /**
   * Clear all patterns
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    if (typeof this.backend!.clear === 'function') {
      await this.backend!.clear();
    }

    // Reset metrics
    this.resetMetrics();
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    // Stop maintenance
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = undefined;
    }

    // Shutdown backend
    if (this.backend) {
      await this.backend.shutdown();
    }

    this.initialized = false;
  }

  /**
   * Record pattern usage (updates lastUsed and usageCount)
   */
  async recordUsage(id: string): Promise<void> {
    this.ensureInitialized();
    if (typeof this.backend!.recordUsage === 'function') {
      await this.backend!.recordUsage(id);
    }
  }

  /**
   * Get implementation info
   */
  getImplementationInfo(): {
    type: 'ruvector' | 'agentdb' | 'fallback';
    version: string;
    features: string[];
  } {
    return {
      type: 'agentdb',
      version: '2.3.5',
      features: ['hnsw', 'vector-search', 'persistence', 'batch-operations'],
    };
  }

  /**
   * Start automatic index maintenance
   */
  private startMaintenance(): void {
    this.maintenanceTimer = setInterval(async () => {
      try {
        await this.performMaintenance();
      } catch (error) {
        console.error('[HNSW] Maintenance error:', error);
      }
    }, this.config.maintenanceInterval);
  }

  /**
   * Perform index maintenance
   */
  private async performMaintenance(): Promise<void> {
    console.log('[HNSW] Starting scheduled maintenance...');

    // Optimize index
    await this.optimize();

    // Calculate fragmentation
    const stats = await this.getStats();
    const expectedSize = stats.count * this.hnswConfig.M;
    const actualSize = stats.count; // Simplified estimation
    this.maintenanceStats.fragmentation = Math.max(
      0,
      ((expectedSize - actualSize) / expectedSize) * 100
    );

    this.maintenanceStats.cleanupCount++;
    console.log(
      `[HNSW] Maintenance complete. Fragmentation: ${this.maintenanceStats.fragmentation.toFixed(2)}%`
    );
  }

  /**
   * Record search latency
   */
  private recordSearchLatency(latency: number): void {
    this.searchLatencies.push(latency);
    this.totalSearches++;

    // Keep only last 1000 measurements
    if (this.searchLatencies.length > 1000) {
      this.searchLatencies.shift();
    }
  }

  /**
   * Record insert latency
   */
  private recordInsertLatency(latency: number): void {
    this.insertLatencies.push(latency);
    this.totalInserts++;

    // Keep only last 1000 measurements
    if (this.insertLatencies.length > 1000) {
      this.insertLatencies.shift();
    }
  }

  /**
   * Reset performance metrics
   */
  private resetMetrics(): void {
    this.searchLatencies = [];
    this.insertLatencies = [];
    this.totalSearches = 0;
    this.totalInserts = 0;
    this.maintenanceStats = {
      lastMaintenance: Date.now(),
      rebalanceCount: 0,
      cleanupCount: 0,
      deletedCount: 0,
      fragmentation: 0,
    };
  }

  /**
   * Ensure initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.backend) {
      throw new Error(
        'HNSWVectorMemory not initialized. Call initialize() first.'
      );
    }
  }

  /**
   * Log configuration on startup
   */
  private logConfiguration(): void {
    console.log('[HNSW] Configuration:');
    console.log(`  M: ${this.hnswConfig.M} (connections per node)`);
    console.log(`  efConstruction: ${this.hnswConfig.efConstruction} (build quality)`);
    console.log(`  efSearch: ${this.hnswConfig.efSearch} (search quality)`);
    console.log(`  Metric: ${this.hnswConfig.metric}`);
    console.log(`  Dimension: ${this.hnswConfig.dimension}`);
    console.log(`  Maintenance: ${this.config.enableMaintenance ? 'enabled' : 'disabled'}`);
  }
}

/**
 * Create HNSW Vector Memory with default configuration
 */
export function createHNSWVectorMemory(
  config?: HNSWVectorMemoryConfig
): HNSWVectorMemory {
  return new HNSWVectorMemory(config);
}

/**
 * Create HNSW Vector Memory optimized for high precision
 */
export function createHighPrecisionHNSW(
  storagePath?: string
): HNSWVectorMemory {
  return new HNSWVectorMemory({
    M: 64,
    efConstruction: 300,
    efSearch: 150,
    storagePath,
    enableMetrics: true,
    enableMaintenance: true,
  });
}

/**
 * Create HNSW Vector Memory optimized for high throughput
 */
export function createHighThroughputHNSW(
  storagePath?: string
): HNSWVectorMemory {
  return new HNSWVectorMemory({
    M: 16,
    efConstruction: 100,
    efSearch: 50,
    storagePath,
    enableMetrics: true,
    enableMaintenance: false, // Disable for max speed
  });
}

/**
 * Create HNSW Vector Memory with balanced configuration
 */
export function createBalancedHNSW(storagePath?: string): HNSWVectorMemory {
  return new HNSWVectorMemory({
    M: 32,
    efConstruction: 200,
    efSearch: 100,
    storagePath,
    enableMetrics: true,
    enableMaintenance: true,
  });
}
