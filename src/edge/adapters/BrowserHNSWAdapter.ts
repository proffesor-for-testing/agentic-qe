/**
 * Browser HNSW Adapter - Browser-Compatible Vector Memory
 *
 * Provides HNSW vector search in browser environments using:
 * - @ruvector/edge WasmHnswIndex for vector operations
 * - IndexedDB for persistent storage
 *
 * Implements the same IPatternStore interface as HNSWVectorMemory
 * for seamless interoperability between Node.js and browser.
 *
 * @module edge/adapters/BrowserHNSWAdapter
 * @version 1.1.0
 */

import type {
  IPatternStore,
  TestPattern,
  PatternSearchOptions,
  PatternSearchResult,
  PatternStoreStats,
} from '../../core/memory/IPatternStore';

import type {
  BrowserHNSWConfig,
  HNSWIndexConfig,
  StoredVectorEntry,
  BrowserStorageStats,
} from '../types/storage.types';

import {
  toFloat32Array,
  float32ToArrayBuffer,
  arrayBufferToFloat32,
  isBrowserEnvironment,
} from '../types/storage.types';

import { IndexedDBStorage } from './IndexedDBStorage';

// Import actual types from @ruvector/edge
import type { WasmHnswIndex as RuvectorHnswIndex } from '@ruvector/edge';

/**
 * Search result from HNSW (as returned by @ruvector/edge)
 */
interface HnswSearchResult {
  id: string;
  distance: number;
}

/**
 * Default configuration for browser HNSW
 */
const DEFAULT_CONFIG: BrowserHNSWConfig = {
  hnsw: {
    dimension: 384,
    m: 32,
    efConstruction: 200,
    efSearch: 100,
    metric: 'cosine',
  },
  storage: {
    dbName: 'agentic-qe-vectors',
    dbVersion: 1,
    vectorStoreName: 'vectors',
    indexStoreName: 'hnsw-index',
  },
  autoPersistIndex: true,
  persistAfterInserts: 100,
  enableMetrics: true,
  batchSize: 100,
};

/**
 * Search performance metrics
 */
interface BrowserSearchMetrics {
  totalSearches: number;
  avgLatency: number;
  p50Latency: number;
  p99Latency: number;
}

/**
 * Browser HNSW Adapter
 *
 * Implements IPatternStore interface for browser environments,
 * using the actual @ruvector/edge WasmHnswIndex.
 */
export class BrowserHNSWAdapter implements IPatternStore {
  private config: BrowserHNSWConfig;
  private storage: IndexedDBStorage;
  private index: RuvectorHnswIndex | null = null;
  private initialized: boolean = false;

  // Performance tracking
  private searchLatencies: number[] = [];
  private totalSearches: number = 0;
  private insertsSinceLastPersist: number = 0;

  constructor(config: Partial<BrowserHNSWConfig> = {}) {
    this.config = this.mergeConfig(config);
    this.storage = new IndexedDBStorage(this.config.storage);
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(config: Partial<BrowserHNSWConfig>): BrowserHNSWConfig {
    return {
      hnsw: { ...DEFAULT_CONFIG.hnsw, ...config.hnsw },
      storage: { ...DEFAULT_CONFIG.storage, ...config.storage },
      autoPersistIndex: config.autoPersistIndex ?? DEFAULT_CONFIG.autoPersistIndex,
      persistAfterInserts: config.persistAfterInserts ?? DEFAULT_CONFIG.persistAfterInserts,
      enableMetrics: config.enableMetrics ?? DEFAULT_CONFIG.enableMetrics,
      batchSize: config.batchSize ?? DEFAULT_CONFIG.batchSize,
    };
  }

  /**
   * Initialize the browser HNSW adapter
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!isBrowserEnvironment()) {
      throw new Error('BrowserHNSWAdapter requires a browser environment with IndexedDB');
    }

    // Initialize IndexedDB storage
    await this.storage.initialize();

    // Load WasmHnswIndex from @ruvector/edge
    await this.loadWasmModule();

    this.initialized = true;
    console.log('[BrowserHNSW] Initialized with @ruvector/edge');
  }

  /**
   * Load the WASM HNSW module from @ruvector/edge
   */
  private async loadWasmModule(): Promise<void> {
    try {
      // Dynamic import of @ruvector/edge
      const ruvectorEdge = await import('@ruvector/edge');

      // Create index with custom parameters
      const { m, efConstruction } = this.config.hnsw;
      this.index = ruvectorEdge.WasmHnswIndex.withParams(m, efConstruction);

      console.log(`[BrowserHNSW] WasmHnswIndex created (m=${m}, ef=${efConstruction})`);
    } catch (error) {
      throw new Error(
        `Failed to load @ruvector/edge: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        'Ensure @ruvector/edge is installed: npm install @ruvector/edge'
      );
    }
  }

  /**
   * Store a pattern with its embedding
   */
  async storePattern(pattern: TestPattern): Promise<void> {
    this.ensureInitialized();

    const startTime = performance.now();

    // Convert embedding to Float32Array
    const vector = toFloat32Array(pattern.embedding);

    // Store in IndexedDB for persistence
    const entry: StoredVectorEntry = {
      id: pattern.id,
      vector: float32ToArrayBuffer(vector),
      metadata: {
        type: pattern.type,
        domain: pattern.domain,
        content: pattern.content,
        framework: pattern.framework,
        coverage: pattern.coverage,
        flakinessScore: pattern.flakinessScore,
        verdict: pattern.verdict,
        custom: pattern.metadata,
      },
      createdAt: pattern.createdAt ?? Date.now(),
      lastUsed: pattern.lastUsed ?? Date.now(),
      usageCount: pattern.usageCount ?? 0,
    };

    await this.storage.storeVector(entry);

    // Insert into HNSW index (uses string ID directly)
    this.index!.insert(pattern.id, vector);

    this.insertsSinceLastPersist++;

    if (this.config.enableMetrics) {
      const duration = performance.now() - startTime;
      console.log(`[BrowserHNSW] Stored pattern ${pattern.id} in ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Store multiple patterns in batch
   */
  async storeBatch(patterns: TestPattern[]): Promise<void> {
    this.ensureInitialized();

    // Process in batches
    for (let i = 0; i < patterns.length; i += this.config.batchSize!) {
      const batch = patterns.slice(i, i + this.config.batchSize!);

      // Store vectors in IndexedDB
      const entries: StoredVectorEntry[] = batch.map((pattern) => {
        const vector = toFloat32Array(pattern.embedding);
        return {
          id: pattern.id,
          vector: float32ToArrayBuffer(vector),
          metadata: {
            type: pattern.type,
            domain: pattern.domain,
            content: pattern.content,
            framework: pattern.framework,
            coverage: pattern.coverage,
            flakinessScore: pattern.flakinessScore,
            verdict: pattern.verdict,
            custom: pattern.metadata,
          },
          createdAt: pattern.createdAt ?? Date.now(),
          lastUsed: pattern.lastUsed ?? Date.now(),
          usageCount: pattern.usageCount ?? 0,
        };
      });

      await this.storage.storeVectorBatch(entries);

      // Insert into HNSW index
      for (const pattern of batch) {
        const vector = toFloat32Array(pattern.embedding);
        this.index!.insert(pattern.id, vector);
      }
    }

    console.log(`[BrowserHNSW] Stored ${patterns.length} patterns in batch`);
  }

  /**
   * Search for similar patterns
   */
  async searchSimilar(
    queryEmbedding: number[],
    options: PatternSearchOptions = {}
  ): Promise<PatternSearchResult[]> {
    this.ensureInitialized();

    const startTime = performance.now();

    const k = options.k ?? 10;
    const threshold = options.threshold ?? 0;

    // Convert query to Float32Array
    const queryVector = toFloat32Array(queryEmbedding);

    // Search HNSW index - returns JSON array
    const searchResultsJson = this.index!.search(queryVector, k * 2);
    const searchResults: HnswSearchResult[] = typeof searchResultsJson === 'string'
      ? JSON.parse(searchResultsJson)
      : searchResultsJson;

    // Map results to patterns
    const results: PatternSearchResult[] = [];

    for (const result of searchResults) {
      // Convert distance to similarity score
      // For cosine distance: similarity = 1 - distance/2 (distance range [0, 2])
      const score = this.config.hnsw.metric === 'cosine'
        ? 1 - result.distance / 2
        : 1 / (1 + result.distance);

      if (score < threshold) continue;

      // Get full pattern from storage
      const entry = await this.storage.getVector(result.id);
      if (!entry) continue;

      // Apply domain/type filters
      if (options.domain && entry.metadata.domain !== options.domain) continue;
      if (options.type && entry.metadata.type !== options.type) continue;
      if (options.framework && entry.metadata.framework !== options.framework) continue;

      const pattern: TestPattern = {
        id: entry.id,
        type: entry.metadata.type,
        domain: entry.metadata.domain,
        embedding: Array.from(arrayBufferToFloat32(entry.vector)),
        content: entry.metadata.content,
        framework: entry.metadata.framework,
        coverage: entry.metadata.coverage,
        flakinessScore: entry.metadata.flakinessScore,
        verdict: entry.metadata.verdict,
        createdAt: entry.createdAt,
        lastUsed: entry.lastUsed,
        usageCount: entry.usageCount,
        metadata: entry.metadata.custom,
      };

      results.push({ pattern, score });

      if (results.length >= k) break;
    }

    if (this.config.enableMetrics) {
      this.recordSearchLatency(performance.now() - startTime);
    }

    return results;
  }

  /**
   * Get a pattern by ID
   */
  async getPattern(id: string): Promise<TestPattern | null> {
    this.ensureInitialized();

    const entry = await this.storage.getVector(id);
    if (!entry) return null;

    return {
      id: entry.id,
      type: entry.metadata.type,
      domain: entry.metadata.domain,
      embedding: Array.from(arrayBufferToFloat32(entry.vector)),
      content: entry.metadata.content,
      framework: entry.metadata.framework,
      coverage: entry.metadata.coverage,
      flakinessScore: entry.metadata.flakinessScore,
      verdict: entry.metadata.verdict,
      createdAt: entry.createdAt,
      lastUsed: entry.lastUsed,
      usageCount: entry.usageCount,
      metadata: entry.metadata.custom,
    };
  }

  /**
   * Delete a pattern by ID
   */
  async deletePattern(id: string): Promise<boolean> {
    this.ensureInitialized();
    // Note: @ruvector/edge WasmHnswIndex doesn't support deletion
    // We only delete from storage, pattern remains in index until rebuild
    return this.storage.deleteVector(id);
  }

  /**
   * Record pattern usage
   */
  async recordUsage(id: string): Promise<void> {
    this.ensureInitialized();

    const entry = await this.storage.getVector(id);
    if (entry) {
      await this.storage.updateVectorMetadata(id, {
        lastUsed: Date.now(),
        usageCount: entry.usageCount + 1,
      });
    }
  }

  /**
   * Build or rebuild the HNSW index from stored vectors
   */
  async buildIndex(): Promise<void> {
    this.ensureInitialized();

    // Create fresh index
    const ruvectorEdge = await import('@ruvector/edge');
    const { m, efConstruction } = this.config.hnsw;
    this.index = ruvectorEdge.WasmHnswIndex.withParams(m, efConstruction);

    // Load all vectors from storage and insert
    const vectors = await this.storage.getAllVectors();
    for (const entry of vectors) {
      const vector = arrayBufferToFloat32(entry.vector);
      this.index.insert(entry.id, vector);
    }

    console.log(`[BrowserHNSW] Index rebuilt with ${vectors.length} vectors`);
  }

  /**
   * Optimize the index
   */
  async optimize(): Promise<void> {
    // @ruvector/edge doesn't require explicit optimization
    console.log('[BrowserHNSW] Index optimized');
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<PatternStoreStats> {
    this.ensureInitialized();

    const count = this.index?.len() ?? 0;
    const metrics = this.getSearchMetrics();

    return {
      count,
      dimension: this.config.hnsw.dimension,
      metric: this.config.hnsw.metric,
      implementation: 'ruvector' as const,
      indexType: 'HNSW',
      qps: metrics.avgLatency > 0 ? 1000 / metrics.avgLatency : 0,
      p50Latency: metrics.p50Latency,
      p99Latency: metrics.p99Latency,
    };
  }

  /**
   * Clear all patterns
   */
  async clear(): Promise<void> {
    this.ensureInitialized();

    await this.storage.clear();

    // Create fresh index
    const ruvectorEdge = await import('@ruvector/edge');
    const { m, efConstruction } = this.config.hnsw;
    this.index = ruvectorEdge.WasmHnswIndex.withParams(m, efConstruction);

    this.searchLatencies = [];
    this.totalSearches = 0;
    this.insertsSinceLastPersist = 0;
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    await this.storage.close();

    // Free WASM resources
    if (this.index) {
      this.index.free();
      this.index = null;
    }

    this.initialized = false;
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
      type: 'ruvector',
      version: '1.1.0-edge',
      features: [
        'hnsw',
        'vector-search',
        'browser',
        'indexeddb',
        'wasm',
        '@ruvector/edge',
      ],
    };
  }

  /**
   * Get browser storage statistics
   */
  async getStorageStats(): Promise<BrowserStorageStats> {
    this.ensureInitialized();

    const storageStats = await this.storage.getStorageStats();

    return {
      vectorCount: storageStats.vectorCount,
      storageSize: storageStats.estimatedSize,
      indexInfo: {
        isBuilt: this.index !== null && !this.index.isEmpty(),
        builtAt: Date.now(),
        vectorsIndexed: this.index?.len() ?? 0,
      },
    };
  }

  /**
   * Get HNSW configuration
   */
  getConfig(): HNSWIndexConfig {
    return { ...this.config.hnsw };
  }

  /**
   * Get search performance metrics
   */
  getSearchMetrics(): BrowserSearchMetrics {
    if (this.searchLatencies.length === 0) {
      return {
        totalSearches: this.totalSearches,
        avgLatency: 0,
        p50Latency: 0,
        p99Latency: 0,
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
    };
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
   * Ensure adapter is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('BrowserHNSWAdapter not initialized. Call initialize() first.');
    }
  }
}

/**
 * Create BrowserHNSWAdapter with default configuration
 */
export function createBrowserHNSWAdapter(
  config?: Partial<BrowserHNSWConfig>
): BrowserHNSWAdapter {
  return new BrowserHNSWAdapter(config);
}

/**
 * Check if browser environment supports HNSW adapter
 */
export function isBrowserHNSWSupported(): boolean {
  return isBrowserEnvironment();
}
