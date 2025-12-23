/**
 * HNSW Pattern Store - Direct vector pattern storage using @ruvector/core
 *
 * Phase 0 M0.3: AQE LLM Independence - 150x faster pattern matching
 *
 * Performance targets:
 * - Search latency: <1ms p95
 * - Insert latency: <5ms
 * - Memory: <100MB for 100k patterns
 */

import { VectorDB, type SearchQuery, type VectorEntry } from '@ruvector/core';

/**
 * Database options for VectorDB initialization
 * Defined locally since @ruvector/core doesn't export this type
 */
interface DbOptions {
  dimensions: number;
  distanceMetric: unknown;
  storagePath?: string;
  hnswConfig?: {
    m: number;
    efConstruction: number;
    efSearch: number;
    maxElements: number;
  };
}
// Import JsDistanceMetric for runtime usage
const ruvectorCore = require('@ruvector/core');
const JsDistanceMetric = ruvectorCore.JsDistanceMetric;
// Runtime uses VectorDb (lowercase) - alias for consistency
const VectorDbRuntime = ruvectorCore.VectorDb;

import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Distance metric for similarity calculation
 * Matches JsDistanceMetric from @ruvector/core
 */
export enum DistanceMetric {
  Euclidean = 'Euclidean',
  Cosine = 'Cosine',
  DotProduct = 'DotProduct',
  Manhattan = 'Manhattan'
}

/**
 * QE Pattern types
 */
export type PatternType = 'test-generation' | 'coverage-analysis' | 'flaky-detection' | 'code-review';

/**
 * QE Pattern interface
 */
export interface QEPattern {
  id: string;
  embedding: number[];
  content: string;
  type: PatternType;
  quality: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Pattern store interface
 */
export interface IPatternStore {
  store(pattern: QEPattern): Promise<void>;
  search(embedding: number[], k: number): Promise<QEPattern[]>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

/**
 * HNSW configuration
 */
export interface HNSWPatternStoreConfig {
  /** Vector dimension (default: 768 for most embedding models) */
  dimension?: number;
  /** Number of connections per layer (default: 32) */
  m?: number;
  /** Construction-time dynamic candidate list size (default: 200) */
  efConstruction?: number;
  /** Search-time dynamic candidate list size (default: 100) */
  efSearch?: number;
  /** Storage path for persistence */
  storagePath?: string;
  /** Distance metric (default: Cosine) */
  distanceMetric?: DistanceMetric;
}

/**
 * Pattern metadata stored alongside vectors
 */
interface StoredPatternMetadata {
  content: string;
  type: PatternType;
  quality: number;
  metadata: Record<string, unknown>;
  createdAt: string; // ISO date string
}

/**
 * HNSW-based pattern store for O(log n) similarity search
 *
 * Uses @ruvector/core for high-performance vector operations with SIMD optimization
 */
export class HNSWPatternStore implements IPatternStore {
  private vectorDB: VectorDB;
  private metadataStore: Map<string, StoredPatternMetadata>;
  private storagePath: string | undefined;
  private readonly dimension: number;
  private readonly distanceMetric: DistanceMetric;

  constructor(config: HNSWPatternStoreConfig = {}) {
    const {
      dimension = 768,
      m = 32,
      efConstruction = 200,
      efSearch = 100,
      storagePath,
      distanceMetric = DistanceMetric.Cosine,
    } = config;

    this.dimension = dimension;
    this.distanceMetric = distanceMetric;
    this.storagePath = storagePath;
    this.metadataStore = new Map();

    // Initialize VectorDB with HNSW configuration
    // Convert our DistanceMetric to JsDistanceMetric enum
    const jsDistanceMetric = JsDistanceMetric[distanceMetric];

    // storagePath should be a file path, not a directory
    const vectorDbPath = storagePath ? path.join(storagePath, 'vectors.db') : undefined;

    const dbOptions: DbOptions = {
      dimensions: dimension,
      distanceMetric: jsDistanceMetric,
      storagePath: vectorDbPath,
      hnswConfig: {
        m,
        efConstruction,
        efSearch,
        maxElements: 1000000, // Support up to 1M patterns
      },
    };

    // Use runtime VectorDb (the TypeScript type is VectorDB but runtime export is VectorDb)
    this.vectorDB = new VectorDbRuntime(dbOptions) as VectorDB;
  }

  /**
   * Store a pattern in the HNSW index
   * O(log n) insertion complexity
   */
  async store(pattern: QEPattern): Promise<void> {
    if (pattern.embedding.length !== this.dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimension}, got ${pattern.embedding.length}`
      );
    }

    // Validate quality score
    if (pattern.quality < 0 || pattern.quality > 1) {
      throw new Error('Quality must be between 0 and 1');
    }

    // Convert to Float32Array for optimal performance
    const vector = new Float32Array(pattern.embedding);

    // Store vector in HNSW index
    const vectorEntry: VectorEntry = {
      id: pattern.id,
      vector,
    };

    await this.vectorDB.insert(vectorEntry);

    // Store metadata separately
    const metadata: StoredPatternMetadata = {
      content: pattern.content,
      type: pattern.type,
      quality: pattern.quality,
      metadata: pattern.metadata,
      createdAt: pattern.createdAt.toISOString(),
    };

    this.metadataStore.set(pattern.id, metadata);
  }

  /**
   * Search for similar patterns using HNSW
   * O(log n) search complexity with <1ms p95 latency
   *
   * @param embedding Query embedding vector
   * @param k Number of nearest neighbors to return
   * @returns Top-k most similar patterns sorted by similarity
   */
  async search(embedding: number[], k: number): Promise<QEPattern[]> {
    if (embedding.length !== this.dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`
      );
    }

    // Convert to Float32Array for optimal performance
    const vector = new Float32Array(embedding);

    // Execute HNSW search
    const query: SearchQuery = {
      vector,
      k,
    };

    const results = await this.vectorDB.search(query);

    // Reconstruct QEPattern objects from results
    const patterns: QEPattern[] = [];

    for (const result of results) {
      const metadata = this.metadataStore.get(result.id);

      if (!metadata) {
        // Skip if metadata is missing (shouldn't happen in normal operation)
        console.warn(`Missing metadata for pattern ${result.id}`);
        continue;
      }

      // Get the original vector
      const vectorEntry = await this.vectorDB.get(result.id);

      if (!vectorEntry) {
        console.warn(`Missing vector for pattern ${result.id}`);
        continue;
      }

      const pattern: QEPattern = {
        id: result.id,
        embedding: Array.from(vectorEntry.vector as Float32Array),
        content: metadata.content,
        type: metadata.type,
        quality: metadata.quality,
        metadata: metadata.metadata,
        createdAt: new Date(metadata.createdAt),
      };

      patterns.push(pattern);
    }

    return patterns;
  }

  /**
   * Delete a pattern by ID
   *
   * @param id Pattern ID to delete
   */
  async delete(id: string): Promise<void> {
    const deleted = await this.vectorDB.delete(id);

    if (deleted) {
      this.metadataStore.delete(id);
    } else {
      throw new Error(`Pattern ${id} not found`);
    }
  }

  /**
   * Get the total number of patterns stored
   *
   * @returns Pattern count
   */
  async count(): Promise<number> {
    return this.vectorDB.len();
  }

  /**
   * Check if the store is empty
   */
  async isEmpty(): Promise<boolean> {
    return this.vectorDB.isEmpty();
  }

  /**
   * Clear all patterns from the store
   */
  async clear(): Promise<void> {
    // Unfortunately, @ruvector/core doesn't expose a clear() method
    // We need to delete all patterns individually
    const ids = Array.from(this.metadataStore.keys());

    for (const id of ids) {
      await this.vectorDB.delete(id);
    }

    this.metadataStore.clear();
  }

  /**
   * Save metadata to disk for persistence
   * Vector data is automatically persisted by @ruvector/core if storagePath is set
   */
  async saveMetadata(): Promise<void> {
    if (!this.storagePath) {
      throw new Error('Storage path not configured');
    }

    const metadataPath = this.getMetadataPath();
    const metadataObj = Object.fromEntries(this.metadataStore);

    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(
      metadataPath,
      JSON.stringify(metadataObj, null, 2),
      'utf-8'
    );
  }

  /**
   * Load metadata from disk
   */
  async loadMetadata(): Promise<void> {
    if (!this.storagePath) {
      throw new Error('Storage path not configured');
    }

    const metadataPath = this.getMetadataPath();

    try {
      const data = await fs.readFile(metadataPath, 'utf-8');
      const metadataObj = JSON.parse(data);

      this.metadataStore = new Map(Object.entries(metadataObj));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet, start with empty store
        this.metadataStore = new Map();
      } else {
        throw error;
      }
    }
  }

  /**
   * Get metadata file path
   */
  private getMetadataPath(): string {
    if (!this.storagePath) {
      throw new Error('Storage path not configured');
    }

    return path.join(this.storagePath, 'metadata.json');
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<{
    totalPatterns: number;
    dimension: number;
    distanceMetric: string;
    memoryEstimateMB: number;
  }> {
    const totalPatterns = await this.count();

    // Estimate memory: vectors + metadata
    // Each vector: dimension * 4 bytes (float32) + HNSW overhead (~2x)
    // Metadata: rough estimate ~500 bytes per pattern
    const vectorMemoryMB = (totalPatterns * this.dimension * 4 * 3) / (1024 * 1024);
    const metadataMemoryMB = (totalPatterns * 500) / (1024 * 1024);
    const memoryEstimateMB = vectorMemoryMB + metadataMemoryMB;

    return {
      totalPatterns,
      dimension: this.dimension,
      distanceMetric: this.distanceMetric,
      memoryEstimateMB: Math.round(memoryEstimateMB * 100) / 100,
    };
  }

  /**
   * Batch store multiple patterns efficiently
   * Uses insertBatch for better performance
   */
  async storeBatch(patterns: QEPattern[]): Promise<void> {
    // Validate all patterns first
    for (const pattern of patterns) {
      if (pattern.embedding.length !== this.dimension) {
        throw new Error(
          `Embedding dimension mismatch for pattern ${pattern.id}: expected ${this.dimension}, got ${pattern.embedding.length}`
        );
      }

      if (pattern.quality < 0 || pattern.quality > 1) {
        throw new Error(`Invalid quality for pattern ${pattern.id}: must be between 0 and 1`);
      }
    }

    // Prepare vector entries
    const vectorEntries: VectorEntry[] = patterns.map(pattern => ({
      id: pattern.id,
      vector: new Float32Array(pattern.embedding),
    }));

    // Batch insert vectors
    await this.vectorDB.insertBatch(vectorEntries);

    // Store all metadata
    for (const pattern of patterns) {
      const metadata: StoredPatternMetadata = {
        content: pattern.content,
        type: pattern.type,
        quality: pattern.quality,
        metadata: pattern.metadata,
        createdAt: pattern.createdAt.toISOString(),
      };

      this.metadataStore.set(pattern.id, metadata);
    }
  }

  /**
   * Search with filtering by pattern type and quality threshold
   *
   * @param embedding Query embedding
   * @param k Number of results
   * @param type Optional pattern type filter
   * @param minQuality Optional minimum quality threshold
   */
  async searchFiltered(
    embedding: number[],
    k: number,
    type?: PatternType,
    minQuality?: number
  ): Promise<QEPattern[]> {
    // Get more results than needed for filtering
    const searchK = type || minQuality ? k * 3 : k;

    const results = await this.search(embedding, searchK);

    // Apply filters
    let filtered = results;

    if (type) {
      filtered = filtered.filter(p => p.type === type);
    }

    if (minQuality !== undefined) {
      filtered = filtered.filter(p => p.quality >= minQuality);
    }

    // Return top k after filtering
    return filtered.slice(0, k);
  }
}

/**
 * Factory function to create a pattern store with common configurations
 */
export function createPatternStore(config?: HNSWPatternStoreConfig): HNSWPatternStore {
  return new HNSWPatternStore(config);
}

/**
 * Create a pattern store optimized for specific use cases
 */
export const PatternStorePresets = {
  /**
   * Fast search, moderate memory (default)
   */
  default: (): HNSWPatternStore => createPatternStore({
    dimension: 768,
    m: 32,
    efConstruction: 200,
    efSearch: 100,
  }),

  /**
   * Ultra-fast search, higher memory usage
   */
  highPerformance: (): HNSWPatternStore => createPatternStore({
    dimension: 768,
    m: 64,
    efConstruction: 400,
    efSearch: 200,
  }),

  /**
   * Memory-efficient, slightly slower search
   */
  lowMemory: (): HNSWPatternStore => createPatternStore({
    dimension: 768,
    m: 16,
    efConstruction: 100,
    efSearch: 50,
  }),

  /**
   * Small embeddings (e.g., 384-dim models)
   */
  smallEmbeddings: (): HNSWPatternStore => createPatternStore({
    dimension: 384,
    m: 32,
    efConstruction: 200,
    efSearch: 100,
  }),

  /**
   * Large embeddings (e.g., 1536-dim models like OpenAI)
   */
  largeEmbeddings: (): HNSWPatternStore => createPatternStore({
    dimension: 1536,
    m: 48,
    efConstruction: 300,
    efSearch: 150,
  }),
};
