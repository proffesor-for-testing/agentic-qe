/**
 * ONNX Embeddings Adapter - Main Adapter
 *
 * Unified interface for ONNX embedding operations.
 * Bridges to agentic-flow MCP tools for production use.
 *
 * @module onnx-embeddings/adapter
 */

import { randomUUID } from 'crypto';
import type {
  Embedding,
  EmbeddingConfig,
  StoredEmbedding,
  SimilarityResult,
  SearchConfig,
  BatchEmbeddingRequest,
  BatchEmbeddingResult,
  EmbeddingStats,
  EmbeddingHealth,
  HyperbolicConfig
} from './types.js';
import { EmbeddingModel, EmbeddingError, EmbeddingErrorType, SimilarityMetric } from './types.js';
import { EmbeddingGenerator } from './embedding-generator.js';
import { SimilaritySearch } from './similarity-search.js';
import { HyperbolicOps } from './hyperbolic-ops.js';
import { getUnifiedMemory } from '../../../kernel/unified-memory.js';

/**
 * Configuration for the ONNX embeddings adapter
 */
export interface ONNXEmbeddingsAdapterConfig {
  /** Embedding generation configuration */
  embedding?: Partial<EmbeddingConfig>;
  /** Hyperbolic operations configuration */
  hyperbolic?: Partial<HyperbolicConfig>;
  /** Enable automatic initialization */
  autoInitialize?: boolean;
}

/**
 * Main adapter for ONNX embedding operations
 *
 * Provides a unified interface for:
 * - Generating embeddings (Euclidean and hyperbolic)
 * - Semantic similarity search
 * - Hyperbolic geometry operations
 * - Integration with agentic-flow MCP tools
 */
export class ONNXEmbeddingsAdapter {
  private generator: EmbeddingGenerator;
  private search: SimilaritySearch;
  private hyperbolic: HyperbolicOps;
  private isInitialized = false;

  constructor(config: ONNXEmbeddingsAdapterConfig = {}) {
    this.generator = new EmbeddingGenerator(config.embedding);
    this.search = new SimilaritySearch();
    this.hyperbolic = new HyperbolicOps(config.hyperbolic);

    if (config.autoInitialize !== false) {
      this.initialize().catch(err => {
        console.error('Failed to auto-initialize ONNX embeddings:', err);
      });
    }
  }

  /**
   * Initialize the adapter and ONNX runtime
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.generator.initialize();
      this.isInitialized = true;
    } catch (error) {
      throw new EmbeddingError(
        EmbeddingErrorType.RUNTIME_UNAVAILABLE,
        'Failed to initialize ONNX embeddings adapter',
        error
      );
    }
  }

  /**
   * Check health status of the embedding system
   */
  async getHealth(): Promise<EmbeddingHealth> {
    try {
      const isReady = this.generator.isReady();

      return {
        available: isReady,
        modelLoaded: isReady ? this.getStats().currentModel : null,
        system: {
          memory: process.memoryUsage().heapUsed,
          threads: 1 // ONNX runtime thread count would be detected here
        }
      };
    } catch (error) {
      return {
        available: false,
        modelLoaded: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        system: {
          memory: process.memoryUsage().heapUsed,
          threads: 0
        }
      };
    }
  }

  // ============================================================================
  // Embedding Generation
  // ============================================================================

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<Embedding> {
    await this.ensureInitialized();
    return this.generator.generate(text);
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateBatch(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResult> {
    await this.ensureInitialized();
    return this.generator.generateBatch(request);
  }

  /**
   * Generate embedding and store it for later search
   */
  async generateAndStore(
    text: string,
    metadata?: {
      id?: string;
      namespace?: string;
      customData?: Record<string, unknown>;
    }
  ): Promise<StoredEmbedding> {
    const embedding = await this.generateEmbedding(text);

    const stored: StoredEmbedding = {
      id: metadata?.id ?? this.generateId(),
      text,
      embedding,
      namespace: metadata?.namespace,
      metadata: metadata?.customData,
      createdAt: Date.now()
    };

    this.search.store(stored);

    // Persist to unified vectors table
    try {
      const mem = getUnifiedMemory();
      await mem.initialize();
      await mem.vectorStore(
        stored.id,
        stored.embedding.vector,
        stored.namespace ?? 'onnx',
        { text: stored.text, customData: stored.metadata, createdAt: stored.createdAt }
      );
    } catch {
      // Non-fatal: in-memory search still works without DB persistence
    }

    return stored;
  }

  // ============================================================================
  // Similarity Search
  // ============================================================================

  /**
   * Search for similar embeddings using a query text
   */
  async searchByText(
    queryText: string,
    config?: Partial<SearchConfig>
  ): Promise<SimilarityResult[]> {
    const queryEmbedding = await this.generateEmbedding(queryText);
    return this.search.search(queryEmbedding, config);
  }

  /**
   * Search for similar embeddings using a query embedding
   */
  async searchByEmbedding(
    queryEmbedding: Embedding,
    config?: Partial<SearchConfig>
  ): Promise<SimilarityResult[]> {
    return this.search.search(queryEmbedding, config);
  }

  /**
   * Find the most similar embedding to a query text
   */
  async findMostSimilar(
    queryText: string,
    config?: Partial<SearchConfig>
  ): Promise<SimilarityResult | null> {
    const queryEmbedding = await this.generateEmbedding(queryText);
    return this.search.findMostSimilar(queryEmbedding, config);
  }

  /**
   * Calculate similarity between two texts
   */
  async compareSimilarity(
    text1: string,
    text2: string,
    metric: SearchConfig['metric'] = SimilarityMetric.COSINE
  ): Promise<number> {
    const [embedding1, embedding2] = await this.generateBatch({
      texts: [text1, text2]
    }).then(result => result.embeddings);

    return this.search.calculateSimilarity(
      embedding1.vector,
      embedding2.vector,
      metric
    );
  }

  /**
   * Store a pre-generated embedding
   */
  storeEmbedding(embedding: StoredEmbedding): void {
    this.search.store(embedding);
  }

  /**
   * Store multiple embeddings
   */
  storeBatch(embeddings: StoredEmbedding[]): void {
    this.search.storeBatch(embeddings);
  }

  /**
   * Remove stored embedding by ID
   */
  removeEmbedding(id: string): boolean {
    return this.search.remove(id);
  }

  /**
   * Get stored embedding by ID
   */
  getEmbedding(id: string): StoredEmbedding | undefined {
    return this.search.get(id);
  }

  /**
   * Get all stored embeddings (optionally filtered by namespace)
   */
  getAllEmbeddings(namespace?: string): StoredEmbedding[] {
    return this.search.getAll(namespace);
  }

  /**
   * Clear all stored embeddings
   */
  clearEmbeddings(): void {
    this.search.clear();
  }

  // ============================================================================
  // Hyperbolic Operations
  // ============================================================================

  /**
   * Convert embedding to hyperbolic space (Poincaré ball)
   */
  toHyperbolic(embedding: Embedding): Embedding {
    return this.hyperbolic.euclideanToPoincare(embedding);
  }

  /**
   * Convert hyperbolic embedding back to Euclidean space
   */
  toEuclidean(embedding: Embedding): Embedding {
    return this.hyperbolic.poincareToEuclidean(embedding);
  }

  /**
   * Calculate hyperbolic distance between two embeddings
   */
  hyperbolicDistance(embedding1: Embedding, embedding2: Embedding): number {
    return this.hyperbolic.distance(embedding1, embedding2);
  }

  /**
   * Calculate hyperbolic midpoint between two embeddings
   */
  hyperbolicMidpoint(embedding1: Embedding, embedding2: Embedding): Embedding {
    return this.hyperbolic.midpoint(embedding1, embedding2);
  }

  /**
   * Project vector onto Poincaré ball (ensure it's inside the unit ball)
   */
  projectToBall(vector: number[]): number[] {
    return this.hyperbolic.projectToBall(vector);
  }

  // ============================================================================
  // Configuration & Statistics
  // ============================================================================

  /**
   * Get comprehensive statistics
   */
  getStats(): EmbeddingStats {
    const generatorStats = this.generator.getStats();
    const searchStats = this.search.getStats();

    return {
      totalGenerated: generatorStats.totalGenerated ?? 0,
      cacheHits: generatorStats.cacheHits ?? 0,
      cacheMisses: generatorStats.cacheMisses ?? 0,
      totalSearches: searchStats.searchCount,
      avgGenerationTime: generatorStats.avgGenerationTime ?? 0,
      avgSearchTime: searchStats.avgSearchTime,
      currentModel: generatorStats.currentModel ?? EmbeddingModel.MINI_LM_L6,
      vectorsStored: searchStats.storedCount
    };
  }

  /**
   * Update embedding configuration
   */
  updateEmbeddingConfig(config: Partial<EmbeddingConfig>): void {
    this.generator.updateConfig(config);
  }

  /**
   * Update hyperbolic configuration
   */
  updateHyperbolicConfig(config: Partial<HyperbolicConfig>): void {
    this.hyperbolic.updateConfig(config);
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.generator.clearCache();
  }

  /**
   * Reset adapter state (clear caches and stored embeddings)
   */
  reset(): void {
    this.clearCaches();
    this.clearEmbeddings();
  }

  // ============================================================================
  // Integration with agentic-flow MCP
  // ============================================================================

  /**
   * Bridge to MCP embeddings_generate tool
   * In production, this would call: mcp__claude-flow__embeddings_generate
   */
  async bridgeToMCPGenerate(text: string, hyperbolic = false): Promise<Embedding> {
    // This is a bridge method - in production it would call the actual MCP tool
    // For now, it uses the local generator
    const embedding = await this.generateEmbedding(text);
    return hyperbolic ? this.toHyperbolic(embedding) : embedding;
  }

  /**
   * Bridge to MCP embeddings_search tool
   * In production, this would call: mcp__claude-flow__embeddings_search
   */
  async bridgeToMCPSearch(
    query: string,
    config?: Partial<SearchConfig>
  ): Promise<SimilarityResult[]> {
    // This is a bridge method - in production it would call the actual MCP tool
    return this.searchByText(query, config);
  }

  /**
   * Bridge to MCP embeddings_compare tool
   * In production, this would call: mcp__claude-flow__embeddings_compare
   */
  async bridgeToMCPCompare(
    text1: string,
    text2: string,
    metric: SearchConfig['metric'] = SimilarityMetric.COSINE
  ): Promise<number> {
    return this.compareSimilarity(text1, text2, metric);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Ensure adapter is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Generate unique ID for stored embeddings
   */
  private generateId(): string {
    return `emb_${Date.now()}_${randomUUID().slice(0, 9)}`;
  }

  /**
   * Check if adapter is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.generator.isReady();
  }
}

/**
 * Create a new ONNX embeddings adapter with default configuration
 */
export function createONNXEmbeddingsAdapter(
  config?: ONNXEmbeddingsAdapterConfig
): ONNXEmbeddingsAdapter {
  return new ONNXEmbeddingsAdapter(config);
}
