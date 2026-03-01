/**
 * Unified Embedding Infrastructure - Main Entry Point
 *
 * Per ADR-040: Code deduplication strategy between QE and claude-flow.
 *
 * Shared base modules:
 * - EmbeddingGenerator: Base embedding generation
 * - EmbeddingCache: Shared cache with persistent storage
 * - HNSWIndex: Fast similarity search (150x-12,500x)
 *
 * QE-specific extensions:
 * - TestEmbedding: Test case embeddings and deduplication
 * - CoverageEmbedding: Coverage vector embeddings and gap detection
 * - DefectEmbedding: Defect pattern embeddings and prediction
 *
 * Performance targets:
 * - Test embedding: <15ms
 * - 75x faster with ONNX integration
 * - Memory reduction: 50-75% via quantization
 *
 * @module integrations/embeddings
 */

// ===== Base Types =====
export type {
  EmbeddingDimension,
  EmbeddingNamespace,
  QuantizationType,
  IEmbedding,
  IEmbeddingModelConfig,
  IEmbeddingOptions,
  IBatchEmbeddingResult,
  ISimilarityResult,
  ISearchOptions,
  EmbeddingModelType,
  IHNSWConfig,
  ICacheConfig,
  IEmbeddingStats,
} from './base/types.js';
import type { IHNSWConfig } from './base/types.js';

export { PERFORMANCE_TARGETS } from './base/types.js';

// ===== Base Embedding Generator =====
export { EmbeddingGenerator } from './base/EmbeddingGenerator.js';

// ===== Embedding Cache =====
export { EmbeddingCache } from './cache/EmbeddingCache.js';

// ===== HNSW Index =====
export {
  HNSWEmbeddingIndex,
  HNSWIndexFactory,
} from './index/HNSWIndex.js';

// ===== QE-Specific Extensions =====

// Test Embeddings
export type {
  TestCaseMetadata,
  ITestCaseEmbedding,
  ISimilarTestResult,
  ITestEmbeddingOptions,
} from './extensions/TestEmbedding.js';

export { TestEmbeddingGenerator } from './extensions/TestEmbedding.js';

// Coverage Embeddings
export type {
  ICoverageData,
  ICoverageGap,
  ICoverageEmbedding,
  ICoverageEmbeddingOptions,
} from './extensions/CoverageEmbedding.js';

export { CoverageEmbeddingGenerator } from './extensions/CoverageEmbedding.js';

// Defect Embeddings
export type {
  DefectSeverity,
  DefectType,
  IDefectMetadata,
  IDefectEmbedding,
  ISimilarDefectResult,
  IDefectPrediction,
  IDefectEmbeddingOptions,
} from './extensions/DefectEmbedding.js';

export { DefectEmbeddingGenerator } from './extensions/DefectEmbedding.js';

// ===== Unified Factory =====
import type { IEmbeddingModelConfig } from './base/types.js';
import { EmbeddingGenerator } from './base/EmbeddingGenerator.js';
import { TestEmbeddingGenerator } from './extensions/TestEmbedding.js';
import { CoverageEmbeddingGenerator } from './extensions/CoverageEmbedding.js';
import { DefectEmbeddingGenerator } from './extensions/DefectEmbedding.js';
import { EmbeddingCache } from './cache/EmbeddingCache.js';
import { HNSWIndexFactory, type HNSWEmbeddingIndex } from './index/HNSWIndex.js';

/**
 * Unified embedding factory
 *
 * Creates and manages embedding generators for different use cases.
 */
export class EmbeddingFactory {
  private static generators: Map<string, EmbeddingGenerator> = new Map();
  private static caches: Map<string, EmbeddingCache> = new Map();
  private static indexes: Map<string, HNSWEmbeddingIndex> = new Map();

  /**
   * Create or get a base embedding generator
   */
  static createGenerator(
    name: string,
    config?: Partial<IEmbeddingModelConfig>
  ): EmbeddingGenerator {
    if (!this.generators.has(name)) {
      this.generators.set(name, new EmbeddingGenerator(config));
    }
    return this.generators.get(name)!;
  }

  /**
   * Create or get a test embedding generator
   */
  static createTestGenerator(
    name: string,
    config?: Partial<IEmbeddingModelConfig>
  ): TestEmbeddingGenerator {
    const key = `test:${name}`;
    if (!this.generators.has(key)) {
      const generator = new TestEmbeddingGenerator(config);
      this.generators.set(key, generator);
      return generator;
    }
    return this.generators.get(key) as TestEmbeddingGenerator;
  }

  /**
   * Create or get a coverage embedding generator
   */
  static createCoverageGenerator(
    name: string,
    config?: Partial<IEmbeddingModelConfig>
  ): CoverageEmbeddingGenerator {
    const key = `coverage:${name}`;
    if (!this.generators.has(key)) {
      const generator = new CoverageEmbeddingGenerator(config);
      this.generators.set(key, generator);
      return generator;
    }
    return this.generators.get(key) as CoverageEmbeddingGenerator;
  }

  /**
   * Create or get a defect embedding generator
   */
  static createDefectGenerator(
    name: string,
    config?: Partial<IEmbeddingModelConfig>
  ): DefectEmbeddingGenerator {
    const key = `defect:${name}`;
    if (!this.generators.has(key)) {
      const generator = new DefectEmbeddingGenerator(config);
      this.generators.set(key, generator);
      return generator;
    }
    return this.generators.get(key) as DefectEmbeddingGenerator;
  }

  /**
   * Create or get an embedding cache
   */
  static createCache(
    name: string,
    config?: {
      maxSize?: number;
      ttl?: number;
      persistent?: boolean;
      storagePath?: string;
      compression?: boolean;
    }
  ): EmbeddingCache {
    if (!this.caches.has(name)) {
      this.caches.set(name, new EmbeddingCache(config));
    }
    return this.caches.get(name)!;
  }

  /**
   * Create or get an HNSW index
   */
  static createIndex(
    name: string,
    config?: Partial<IHNSWConfig>
  ): HNSWEmbeddingIndex {
    return HNSWIndexFactory.getInstance(name, config);
  }

  /**
   * Close all resources
   */
  static closeAll(): void {
    for (const generator of this.generators.values()) {
      generator.clear();
    }
    this.generators.clear();

    for (const cache of this.caches.values()) {
      cache.close();
    }
    this.caches.clear();

    HNSWIndexFactory.closeAll();
    this.indexes.clear();
  }

  /**
   * Get statistics for all generators
   */
  static getAllStats(): Map<string, unknown> {
    const stats = new Map<string, unknown>();

    for (const [name, generator] of this.generators.entries()) {
      stats.set(name, generator.getStats());
    }

    return stats;
  }
}
