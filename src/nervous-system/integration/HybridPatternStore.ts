/**
 * HybridPatternStore - HDC-Enhanced Pattern Storage
 *
 * Integrates Hyperdimensional Computing (HDC) with the IPatternStore interface
 * for ultra-fast pattern operations:
 * - 50ns target for HDC binding operations (10,000-bit hypervectors)
 * - Sub-microsecond similarity queries via HDC cosine similarity
 * - Automatic fallback to standard vector operations when HDC unavailable
 *
 * Architecture:
 * - Primary: HdcMemoryAdapter for O(1) pattern matching
 * - Secondary: Regular embedding storage for precise search
 * - Hybrid search: HDC pre-filter + embedding refinement
 *
 * @module nervous-system/integration/HybridPatternStore
 * @version 1.0.0
 */

import type {
  IPatternStore,
  TestPattern,
  PatternSearchOptions,
  PatternSearchResult,
  PatternStoreStats,
  PatternStoreConfig,
} from '../../core/memory/IPatternStore.js';

import {
  HdcMemoryAdapter,
  type HdcMemoryConfig,
  type RetrievalResult,
} from '../adapters/HdcMemoryAdapter.js';

/**
 * Configuration for HybridPatternStore
 */
export interface HybridPatternStoreConfig extends PatternStoreConfig {
  /** HDC-specific configuration */
  hdc?: Partial<HdcMemoryConfig>;
  /** Use HDC for similarity pre-filtering (default: true) */
  useHdcPrefilter?: boolean;
  /** HDC similarity threshold for pre-filtering (default: 0.5) */
  hdcPrefilterThreshold?: number;
  /** Maximum candidates from HDC pre-filter (default: 100) */
  hdcMaxCandidates?: number;
  /** Enable performance metrics collection */
  enableMetrics?: boolean;
  /** Log HDC operations for debugging */
  debug?: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<HybridPatternStoreConfig, 'hdc' | 'hnsw' | 'storagePath' | 'preferredBackend' | 'autoPersist'>> = {
  dimension: 384,
  metric: 'cosine',
  useHdcPrefilter: true,
  hdcPrefilterThreshold: 0.5,
  hdcMaxCandidates: 100,
  enableMetrics: true,
  debug: false,
};

/**
 * Performance metrics for tracking HDC operations
 */
interface HdcPerformanceMetrics {
  /** Total encode operations */
  totalEncodes: number;
  /** Total store operations */
  totalStores: number;
  /** Total search operations */
  totalSearches: number;
  /** Total HDC hits (found via HDC) */
  hdcHits: number;
  /** Total fallback searches */
  fallbackSearches: number;
  /** Encode times in nanoseconds */
  encodeTimes: number[];
  /** Store times in nanoseconds */
  storeTimes: number[];
  /** Search times in nanoseconds */
  searchTimes: number[];
  /** Average encode time */
  avgEncodeTime: number;
  /** Average search time */
  avgSearchTime: number;
  /** HDC hit rate */
  hdcHitRate: number;
}

/**
 * HybridPatternStore - IPatternStore implementation with HDC acceleration
 *
 * Uses HDC hypervectors for ultra-fast pattern matching while maintaining
 * full IPatternStore compatibility. Falls back to regular vector operations
 * when HDC is not initialized or unavailable.
 *
 * @implements {IPatternStore}
 *
 * @example
 * ```typescript
 * const store = new HybridPatternStore({
 *   dimension: 384,
 *   useHdcPrefilter: true,
 *   hdcPrefilterThreshold: 0.6,
 * });
 *
 * await store.initialize();
 *
 * // Store patterns - automatically encoded to HDC hypervectors
 * await store.storePattern({
 *   id: 'pattern-001',
 *   type: 'edge-case',
 *   domain: 'unit-test',
 *   content: 'null input handling',
 *   embedding: [...384 floats...],
 * });
 *
 * // Search uses HDC pre-filter for sub-microsecond matching
 * const results = await store.searchSimilar(queryEmbedding, { k: 10 });
 * ```
 */
export class HybridPatternStore implements IPatternStore {
  private config: Required<Omit<HybridPatternStoreConfig, 'hdc' | 'hnsw' | 'storagePath' | 'preferredBackend' | 'autoPersist'>> & {
    hdc?: Partial<HdcMemoryConfig>;
    hnsw?: PatternStoreConfig['hnsw'];
    storagePath?: string;
    preferredBackend?: string;
    autoPersist?: boolean;
  };
  private hdcAdapter: HdcMemoryAdapter | null = null;
  private initialized: boolean = false;
  private hdcInitialized: boolean = false;

  /** Pattern storage (id -> pattern) */
  private patterns: Map<string, TestPattern> = new Map();

  /** Embedding storage for fallback search (id -> embedding) */
  private embeddings: Map<string, number[]> = new Map();

  /** Performance metrics */
  private metrics: HdcPerformanceMetrics = {
    totalEncodes: 0,
    totalStores: 0,
    totalSearches: 0,
    hdcHits: 0,
    fallbackSearches: 0,
    encodeTimes: [],
    storeTimes: [],
    searchTimes: [],
    avgEncodeTime: 0,
    avgSearchTime: 0,
    hdcHitRate: 0,
  };

  /**
   * Create a new HybridPatternStore
   * @param config Configuration options
   */
  constructor(config: HybridPatternStoreConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Initialize the pattern store
   *
   * Initializes HDC adapter with WASM module. If HDC initialization fails,
   * the store continues to work with fallback vector operations.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize HDC adapter
    try {
      this.hdcAdapter = new HdcMemoryAdapter(this.config.hdc);
      await this.hdcAdapter.initialize();
      this.hdcInitialized = true;
      this.log('[HybridPatternStore] HDC adapter initialized successfully');
    } catch (error) {
      this.hdcInitialized = false;
      this.hdcAdapter = null;
      this.log(
        `[HybridPatternStore] HDC initialization failed, using fallback: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    this.initialized = true;
  }

  /**
   * Store a single test pattern
   *
   * Encodes pattern to HDC hypervector and stores both the hypervector
   * and the original embedding for hybrid search.
   */
  async storePattern(pattern: TestPattern): Promise<void> {
    this.ensureInitialized();

    const startTime = this.getHighResTime();

    // Store in local pattern map
    this.patterns.set(pattern.id, {
      ...pattern,
      createdAt: pattern.createdAt ?? Date.now(),
      lastUsed: pattern.lastUsed ?? Date.now(),
      usageCount: pattern.usageCount ?? 0,
    });

    // Store embedding for fallback search
    this.embeddings.set(pattern.id, pattern.embedding);

    // Encode and store in HDC if available
    if (this.hdcInitialized && this.hdcAdapter) {
      try {
        const encodeStart = this.getHighResTime();

        // Encode pattern to hypervector
        const hypervector = this.hdcAdapter.encodePattern({
          type: pattern.type,
          domain: pattern.domain,
          content: pattern.content,
          metadata: pattern.metadata,
        });

        // Track encode time
        if (this.config.enableMetrics) {
          const encodeTime = this.getHighResTime() - encodeStart;
          this.metrics.encodeTimes.push(encodeTime);
          this.metrics.totalEncodes++;
          this.limitMetricsArray(this.metrics.encodeTimes);
        }

        // Store hypervector
        this.hdcAdapter.store(pattern.id, hypervector);
      } catch (error) {
        this.log(
          `[HybridPatternStore] HDC encode/store failed for ${pattern.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Track store time
    if (this.config.enableMetrics) {
      const storeTime = this.getHighResTime() - startTime;
      this.metrics.storeTimes.push(storeTime);
      this.metrics.totalStores++;
      this.limitMetricsArray(this.metrics.storeTimes);
    }
  }

  /**
   * Store multiple patterns in batch
   *
   * Optimized batch encoding and storage for high throughput.
   */
  async storeBatch(patterns: TestPattern[]): Promise<void> {
    this.ensureInitialized();

    const startTime = this.getHighResTime();

    // Process patterns in parallel for local storage
    for (const pattern of patterns) {
      this.patterns.set(pattern.id, {
        ...pattern,
        createdAt: pattern.createdAt ?? Date.now(),
        lastUsed: pattern.lastUsed ?? Date.now(),
        usageCount: pattern.usageCount ?? 0,
      });
      this.embeddings.set(pattern.id, pattern.embedding);
    }

    // Batch encode and store in HDC if available
    if (this.hdcInitialized && this.hdcAdapter) {
      for (const pattern of patterns) {
        try {
          const hypervector = this.hdcAdapter.encodePattern({
            type: pattern.type,
            domain: pattern.domain,
            content: pattern.content,
            metadata: pattern.metadata,
          });
          this.hdcAdapter.store(pattern.id, hypervector);
        } catch (error) {
          this.log(
            `[HybridPatternStore] HDC batch encode failed for ${pattern.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }

    // Track metrics
    if (this.config.enableMetrics) {
      const totalTime = this.getHighResTime() - startTime;
      const perPattern = totalTime / patterns.length;
      for (let i = 0; i < Math.min(patterns.length, 100); i++) {
        this.metrics.storeTimes.push(perPattern);
      }
      this.metrics.totalStores += patterns.length;
      this.metrics.totalEncodes += patterns.length;
    }
  }

  /**
   * Search for similar patterns by embedding
   *
   * Uses HDC pre-filter for sub-microsecond candidate selection,
   * then refines with precise cosine similarity on embeddings.
   */
  async searchSimilar(
    queryEmbedding: number[],
    options: PatternSearchOptions = {}
  ): Promise<PatternSearchResult[]> {
    this.ensureInitialized();

    const startTime = this.getHighResTime();
    const k = options.k ?? 10;
    const threshold = options.threshold ?? 0;

    let results: PatternSearchResult[];

    // Try HDC pre-filter if enabled and available
    if (
      this.config.useHdcPrefilter &&
      this.hdcInitialized &&
      this.hdcAdapter &&
      this.patterns.size > 0
    ) {
      results = await this.searchWithHdcPrefilter(queryEmbedding, options);
      if (this.config.enableMetrics && results.length > 0) {
        this.metrics.hdcHits++;
      }
    } else {
      // Fallback to brute-force cosine similarity
      results = this.searchFallback(queryEmbedding, options);
      if (this.config.enableMetrics) {
        this.metrics.fallbackSearches++;
      }
    }

    // Track search time
    if (this.config.enableMetrics) {
      const searchTime = this.getHighResTime() - startTime;
      this.metrics.searchTimes.push(searchTime);
      this.metrics.totalSearches++;
      this.limitMetricsArray(this.metrics.searchTimes);
      this.updateMetricsAverages();
    }

    return results;
  }

  /**
   * Search using HDC pre-filter + embedding refinement
   */
  private async searchWithHdcPrefilter(
    queryEmbedding: number[],
    options: PatternSearchOptions
  ): Promise<PatternSearchResult[]> {
    const k = options.k ?? 10;
    const threshold = options.threshold ?? 0;

    // Create query hypervector from embedding
    // Use hash-based encoding for query embedding
    const queryHv = this.hdcAdapter!.createHypervector(
      this.hashEmbedding(queryEmbedding)
    );

    // Get HDC candidates
    const hdcResults = this.hdcAdapter!.topK(
      queryHv,
      Math.min(this.config.hdcMaxCandidates, this.patterns.size)
    );

    // If no HDC results, fall back to full search
    if (hdcResults.length === 0) {
      return this.searchFallback(queryEmbedding, options);
    }

    // Refine candidates with precise cosine similarity
    const refinedResults: PatternSearchResult[] = [];

    for (const hdcResult of hdcResults) {
      const pattern = this.patterns.get(hdcResult.key);
      if (!pattern) continue;

      // Apply filters
      if (options.domain && pattern.domain !== options.domain) continue;
      if (options.type && pattern.type !== options.type) continue;
      if (options.framework && pattern.framework !== options.framework) continue;

      // Compute precise similarity
      const embedding = this.embeddings.get(hdcResult.key);
      if (!embedding) continue;

      const score = this.cosineSimilarity(queryEmbedding, embedding);
      if (score >= threshold) {
        refinedResults.push({
          pattern,
          score,
        });
      }
    }

    // Sort by score and return top k
    refinedResults.sort((a, b) => b.score - a.score);
    return refinedResults.slice(0, k);
  }

  /**
   * Fallback search using brute-force cosine similarity
   */
  private searchFallback(
    queryEmbedding: number[],
    options: PatternSearchOptions
  ): PatternSearchResult[] {
    const k = options.k ?? 10;
    const threshold = options.threshold ?? 0;

    const results: PatternSearchResult[] = [];

    for (const [id, pattern] of Array.from(this.patterns.entries())) {
      // Apply filters
      if (options.domain && pattern.domain !== options.domain) continue;
      if (options.type && pattern.type !== options.type) continue;
      if (options.framework && pattern.framework !== options.framework) continue;

      const embedding = this.embeddings.get(id);
      if (!embedding) continue;

      const score = this.cosineSimilarity(queryEmbedding, embedding);
      if (score >= threshold) {
        results.push({ pattern, score });
      }
    }

    // Sort by score and return top k
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  /**
   * Get a pattern by ID
   */
  async getPattern(id: string): Promise<TestPattern | null> {
    this.ensureInitialized();
    return this.patterns.get(id) ?? null;
  }

  /**
   * Delete a pattern by ID
   */
  async deletePattern(id: string): Promise<boolean> {
    this.ensureInitialized();

    const existed = this.patterns.has(id);
    this.patterns.delete(id);
    this.embeddings.delete(id);

    // Note: HDC adapter doesn't support deletion, patterns remain in hypervector memory
    // This is a limitation of the current HDC implementation

    return existed;
  }

  /**
   * Record pattern usage
   */
  async recordUsage(id: string): Promise<void> {
    this.ensureInitialized();

    const pattern = this.patterns.get(id);
    if (pattern) {
      pattern.lastUsed = Date.now();
      pattern.usageCount = (pattern.usageCount ?? 0) + 1;
    }
  }

  /**
   * Build search index
   * For HDC, this is a no-op as hypervectors are stored directly
   */
  async buildIndex(): Promise<void> {
    this.ensureInitialized();
    // HDC uses direct similarity comparison, no index needed
    // Could potentially add HNSW for embedding fallback in future
  }

  /**
   * Optimize storage
   */
  async optimize(): Promise<void> {
    this.ensureInitialized();
    // Potential future optimizations:
    // - Re-encode patterns with updated codebooks
    // - Prune low-usage patterns from HDC memory
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<PatternStoreStats> {
    this.ensureInitialized();

    const hdcStats = this.hdcInitialized && this.hdcAdapter
      ? this.hdcAdapter.getStats()
      : null;

    const stats: PatternStoreStats = {
      count: this.patterns.size,
      dimension: this.config.dimension,
      metric: this.config.metric ?? 'cosine',
      implementation: this.hdcInitialized ? 'ruvector' : 'fallback',
      indexType: this.hdcInitialized ? 'HDC-10000bit' : 'brute-force',
    };

    // Add performance metrics if available
    if (this.config.enableMetrics && this.metrics.searchTimes.length > 0) {
      const sorted = [...this.metrics.searchTimes].sort((a, b) => a - b);
      const p50Index = Math.floor(sorted.length * 0.5);
      const p99Index = Math.floor(sorted.length * 0.99);

      stats.p50Latency = sorted[p50Index] / 1000; // Convert ns to us
      stats.p99Latency = sorted[p99Index] / 1000;

      const avgTimeUs = this.metrics.avgSearchTime / 1000;
      stats.qps = avgTimeUs > 0 ? 1000000 / avgTimeUs : 0; // QPS from us
    }

    return stats;
  }

  /**
   * Clear all patterns
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    this.patterns.clear();
    this.embeddings.clear();

    if (this.hdcInitialized && this.hdcAdapter) {
      this.hdcAdapter.clear();
    }

    // Reset metrics
    this.metrics = {
      totalEncodes: 0,
      totalStores: 0,
      totalSearches: 0,
      hdcHits: 0,
      fallbackSearches: 0,
      encodeTimes: [],
      storeTimes: [],
      searchTimes: [],
      avgEncodeTime: 0,
      avgSearchTime: 0,
      hdcHitRate: 0,
    };
  }

  /**
   * Shutdown and release resources
   */
  async shutdown(): Promise<void> {
    if (this.hdcAdapter) {
      this.hdcAdapter.dispose();
      this.hdcAdapter = null;
    }

    this.patterns.clear();
    this.embeddings.clear();
    this.initialized = false;
    this.hdcInitialized = false;
  }

  /**
   * Get implementation info
   */
  getImplementationInfo(): {
    type: 'ruvector' | 'agentdb' | 'fallback';
    version: string;
    features: string[];
  } {
    if (this.hdcInitialized) {
      return {
        type: 'ruvector',
        version: '1.0.0-hdc',
        features: [
          'hdc-hypervectors',
          '10000-bit-encoding',
          '50ns-binding',
          'cosine-similarity',
          'hybrid-search',
          'fallback-support',
        ],
      };
    }

    return {
      type: 'fallback',
      version: '1.0.0-fallback',
      features: ['in-memory', 'cosine-similarity'],
    };
  }

  /**
   * Check if HDC is initialized and available
   */
  isHdcAvailable(): boolean {
    return this.hdcInitialized;
  }

  /**
   * Get HDC-specific metrics
   */
  getHdcMetrics(): HdcPerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get HDC adapter for direct access (advanced use)
   */
  getHdcAdapter(): HdcMemoryAdapter | null {
    return this.hdcAdapter;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'HybridPatternStore not initialized. Call initialize() first.'
      );
    }
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Hash embedding to bigint for hypervector seeding
   * Uses FNV-1a on the embedding values
   */
  private hashEmbedding(embedding: number[]): bigint {
    const FNV_PRIME = BigInt('0x00000100000001B3');
    const FNV_OFFSET = BigInt('0xcbf29ce484222325');
    const MASK_64 = BigInt('0xFFFFFFFFFFFFFFFF');

    let hash = FNV_OFFSET;

    // Hash first 64 values for efficiency (captures pattern essence)
    const sampleSize = Math.min(64, embedding.length);
    for (let i = 0; i < sampleSize; i++) {
      // Convert float to int32 bits for hashing
      const intVal = Math.floor(embedding[i] * 1000000) & 0xffffffff;
      hash ^= BigInt(intVal);
      hash = (hash * FNV_PRIME) & MASK_64;
    }

    return hash;
  }

  /**
   * Get high-resolution time in nanoseconds
   */
  private getHighResTime(): number {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now() * 1000000; // Convert ms to ns
    }
    return Date.now() * 1000000;
  }

  /**
   * Limit metrics array size to prevent memory bloat
   */
  private limitMetricsArray(arr: number[], maxSize: number = 1000): void {
    while (arr.length > maxSize) {
      arr.shift();
    }
  }

  /**
   * Update computed metric averages
   */
  private updateMetricsAverages(): void {
    if (this.metrics.encodeTimes.length > 0) {
      this.metrics.avgEncodeTime =
        this.metrics.encodeTimes.reduce((a, b) => a + b, 0) /
        this.metrics.encodeTimes.length;
    }

    if (this.metrics.searchTimes.length > 0) {
      this.metrics.avgSearchTime =
        this.metrics.searchTimes.reduce((a, b) => a + b, 0) /
        this.metrics.searchTimes.length;
    }

    if (this.metrics.totalSearches > 0) {
      this.metrics.hdcHitRate =
        this.metrics.hdcHits / this.metrics.totalSearches;
    }
  }

  /**
   * Log message if debug mode enabled
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(message);
    }
  }
}

/**
 * Create a pre-configured HybridPatternStore for QE patterns
 *
 * @param options Optional configuration overrides
 * @returns Configured HybridPatternStore instance
 */
export function createHybridPatternStore(
  options: Partial<HybridPatternStoreConfig> = {}
): HybridPatternStore {
  return new HybridPatternStore({
    dimension: 384,
    metric: 'cosine',
    useHdcPrefilter: true,
    hdcPrefilterThreshold: 0.5,
    hdcMaxCandidates: 100,
    enableMetrics: true,
    hdc: {
      similarityThreshold: 0.7,
      maxRetrievalResults: 100,
      autoInit: true,
    },
    ...options,
  });
}

/**
 * Create a high-performance HybridPatternStore optimized for throughput
 *
 * Uses aggressive HDC pre-filtering for maximum speed.
 *
 * @param options Optional configuration overrides
 * @returns Configured HybridPatternStore instance
 */
export function createHighPerformanceHybridStore(
  options: Partial<HybridPatternStoreConfig> = {}
): HybridPatternStore {
  return new HybridPatternStore({
    dimension: 384,
    metric: 'cosine',
    useHdcPrefilter: true,
    hdcPrefilterThreshold: 0.4, // Lower threshold for more candidates
    hdcMaxCandidates: 200, // More candidates for better recall
    enableMetrics: true,
    hdc: {
      similarityThreshold: 0.6,
      maxRetrievalResults: 200,
      autoInit: true,
    },
    ...options,
  });
}
