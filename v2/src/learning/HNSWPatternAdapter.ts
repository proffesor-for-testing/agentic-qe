/**
 * HNSWPatternAdapter - Integration layer between LearningEngine and HNSWPatternStore
 *
 * Phase 0 M0.3: Wires the 150x faster HNSW vector search into the learning pipeline
 *
 * This adapter:
 * - Converts LearnedPattern to QEPattern format
 * - Provides vector similarity search for pattern matching
 * - Maintains backward compatibility with SwarmMemoryManager
 * - Generates embeddings using RuvLLM when available
 */

import { HNSWPatternStore, QEPattern, PatternType, HNSWPatternStoreConfig } from '../memory/HNSWPatternStore';
import { LearnedPattern } from './types';
import { Logger } from '../utils/Logger';
import { loadRuvLLM, RuvLLMInstance } from '../utils/ruvllm-loader';
import { randomUUID } from 'crypto';

/**
 * Adapter configuration
 */
export interface HNSWPatternAdapterConfig {
  /** HNSW store configuration */
  hnswConfig?: HNSWPatternStoreConfig;
  /** Embedding dimension (default: 768) */
  embeddingDimension?: number;
  /** Enable RuvLLM for embedding generation */
  useRuvLLM?: boolean;
  /** Fallback to hash-based embeddings if RuvLLM unavailable */
  allowFallbackEmbeddings?: boolean;
}

/**
 * Pattern with embedding for HNSW storage
 */
export interface EmbeddedPattern extends LearnedPattern {
  embedding?: number[];
}

/**
 * Search result with similarity score
 */
export interface PatternSearchResult {
  pattern: LearnedPattern;
  similarity: number;
}

/**
 * HNSWPatternAdapter - Enables O(log n) pattern similarity search
 */
export class HNSWPatternAdapter {
  private readonly logger: Logger;
  private readonly store: HNSWPatternStore;
  private readonly config: Required<HNSWPatternAdapterConfig>;
  private ruvllm: RuvLLMInstance | null = null;
  private initialized = false;

  constructor(config: HNSWPatternAdapterConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      hnswConfig: config.hnswConfig ?? {},
      embeddingDimension: config.embeddingDimension ?? 768,
      useRuvLLM: config.useRuvLLM ?? true,
      allowFallbackEmbeddings: config.allowFallbackEmbeddings ?? true,
    };

    // Initialize HNSW store with configured dimension
    this.store = new HNSWPatternStore({
      ...this.config.hnswConfig,
      dimension: this.config.embeddingDimension,
    });
  }

  /**
   * Initialize the adapter (load RuvLLM for embeddings)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.useRuvLLM) {
      try {
        const ruvllmModule = loadRuvLLM();
        if (ruvllmModule) {
          this.ruvllm = new ruvllmModule.RuvLLM();
          this.logger.info('HNSWPatternAdapter: RuvLLM initialized for embeddings');
        }
      } catch (error) {
        this.logger.warn('HNSWPatternAdapter: RuvLLM not available, using fallback embeddings', {
          error: (error as Error).message,
        });
      }
    }

    if (!this.ruvllm && !this.config.allowFallbackEmbeddings) {
      throw new Error('RuvLLM required but not available, and fallback embeddings disabled');
    }

    this.initialized = true;
    this.logger.info('HNSWPatternAdapter initialized', {
      useRuvLLM: !!this.ruvllm,
      dimension: this.config.embeddingDimension,
    });
  }

  /**
   * Store a learned pattern with vector embedding
   */
  async storePattern(pattern: LearnedPattern): Promise<void> {
    await this.ensureInitialized();

    // Generate embedding from pattern content
    const embedding = await this.generateEmbedding(pattern.pattern);

    // Map LearnedPattern to QEPattern
    const qePattern: QEPattern = {
      id: pattern.id,
      embedding,
      content: pattern.pattern,
      type: this.mapPatternType(pattern),
      quality: pattern.confidence,
      metadata: {
        agentId: pattern.agentId,
        usageCount: pattern.usageCount,
        successRate: pattern.successRate,
        averageReward: pattern.averageReward,
        originalPattern: pattern,
      },
      createdAt: pattern.createdAt,
    };

    await this.store.store(qePattern);

    this.logger.debug('Stored pattern in HNSW', {
      patternId: pattern.id,
      confidence: pattern.confidence,
    });
  }

  /**
   * Search for similar patterns using vector similarity
   * O(log n) complexity with <1ms p95 latency
   */
  async searchSimilar(query: string, k: number = 5): Promise<PatternSearchResult[]> {
    await this.ensureInitialized();

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Execute HNSW search
    const results = await this.store.search(queryEmbedding, k);

    // Convert back to LearnedPattern with similarity scores
    return results.map((qePattern, index) => {
      const originalPattern = qePattern.metadata.originalPattern as LearnedPattern;

      // Calculate approximate similarity from result ordering
      // (HNSW returns results sorted by distance, so first result is most similar)
      const similarity = 1 - (index / k);

      return {
        pattern: originalPattern || this.convertToLearnedPattern(qePattern),
        similarity,
      };
    });
  }

  /**
   * Search by embedding directly (for pre-computed embeddings)
   */
  async searchByEmbedding(embedding: number[], k: number = 5): Promise<PatternSearchResult[]> {
    await this.ensureInitialized();

    const results = await this.store.search(embedding, k);

    return results.map((qePattern, index) => {
      const originalPattern = qePattern.metadata.originalPattern as LearnedPattern;
      const similarity = 1 - (index / k);

      return {
        pattern: originalPattern || this.convertToLearnedPattern(qePattern),
        similarity,
      };
    });
  }

  /**
   * Delete a pattern by ID
   */
  async deletePattern(id: string): Promise<void> {
    await this.store.delete(id);
  }

  /**
   * Get pattern count
   */
  async count(): Promise<number> {
    return this.store.count();
  }

  /**
   * Clear all patterns
   */
  async clear(): Promise<void> {
    await this.store.clear();
  }

  /**
   * Generate embedding for text using RuvLLM or fallback
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (this.ruvllm) {
      try {
        const embedding = this.ruvllm.embed(text);
        // Convert Float32Array to number[] if needed
        return Array.from(embedding);
      } catch (error) {
        this.logger.warn('RuvLLM embedding failed, using fallback', {
          error: (error as Error).message,
        });
      }
    }

    // Fallback: Generate deterministic hash-based embedding
    return this.generateFallbackEmbedding(text);
  }

  /**
   * Generate a deterministic hash-based embedding (fallback when RuvLLM unavailable)
   *
   * This is NOT semantically meaningful but provides:
   * - Deterministic outputs for same inputs
   * - Proper dimensionality
   * - Normalized vectors
   */
  private generateFallbackEmbedding(text: string): number[] {
    const dimension = this.config.embeddingDimension;
    const embedding = new Array(dimension).fill(0);

    // Use multiple hash seeds for better distribution
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      for (let j = 0; j < dimension; j++) {
        // Combine character position, value, and dimension for variety
        const hash = Math.sin(charCode * (i + 1) * (j + 1) * 0.0001) * 10000;
        embedding[j] += hash - Math.floor(hash);
      }
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimension; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  /**
   * Map LearnedPattern to PatternType
   */
  private mapPatternType(pattern: LearnedPattern): PatternType {
    const patternLower = pattern.pattern.toLowerCase();

    if (patternLower.includes('test') || patternLower.includes('generation')) {
      return 'test-generation';
    }
    if (patternLower.includes('coverage')) {
      return 'coverage-analysis';
    }
    if (patternLower.includes('flaky') || patternLower.includes('retry')) {
      return 'flaky-detection';
    }
    if (patternLower.includes('review') || patternLower.includes('quality')) {
      return 'code-review';
    }

    return 'test-generation'; // Default
  }

  /**
   * Convert QEPattern back to LearnedPattern
   */
  private convertToLearnedPattern(qePattern: QEPattern): LearnedPattern {
    return {
      id: qePattern.id,
      pattern: qePattern.content,
      confidence: qePattern.quality,
      usageCount: (qePattern.metadata.usageCount as number) ?? 0,
      successRate: (qePattern.metadata.successRate as number) ?? 0,
      contexts: (qePattern.metadata.contexts as string[]) ?? [qePattern.type],
      averageReward: (qePattern.metadata.averageReward as number) ?? 0,
      agentId: (qePattern.metadata.agentId as string) ?? 'unknown',
      createdAt: qePattern.createdAt,
      lastUsedAt: qePattern.createdAt,
    };
  }

  /**
   * Ensure adapter is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get adapter statistics
   */
  async getStats(): Promise<{
    patternCount: number;
    useRuvLLM: boolean;
    embeddingDimension: number;
  }> {
    return {
      patternCount: await this.count(),
      useRuvLLM: !!this.ruvllm,
      embeddingDimension: this.config.embeddingDimension,
    };
  }
}

/**
 * Create an HNSW pattern adapter with default configuration
 */
export function createHNSWPatternAdapter(
  config?: HNSWPatternAdapterConfig
): HNSWPatternAdapter {
  return new HNSWPatternAdapter(config);
}
