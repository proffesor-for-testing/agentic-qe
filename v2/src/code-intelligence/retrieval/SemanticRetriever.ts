/**
 * Semantic Code Retriever
 *
 * Performs similarity-based code search using embeddings.
 * Optimized for AST-chunked code with configurable top-k retrieval.
 *
 * Key Features:
 * - Top-k retrieval (default: 5 chunks)
 * - Similarity threshold filtering
 * - Per-file deduplication
 * - Context expansion
 */

import { NomicEmbedder } from '../embeddings/NomicEmbedder.js';
import {
  RetrievalConfig,
  RetrievalResult,
  RetrievalResponse,
  RetrievalStats,
  StoredChunk,
  DEFAULT_RETRIEVAL_CONFIG,
} from './types.js';

export class SemanticRetriever {
  private embedder: NomicEmbedder;
  private config: RetrievalConfig;
  private chunks: Map<string, StoredChunk> = new Map();

  constructor(
    embedder: NomicEmbedder,
    config: Partial<RetrievalConfig> = {}
  ) {
    this.embedder = embedder;
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
  }

  /**
   * Add chunks to the search index.
   */
  addChunks(chunks: StoredChunk[]): void {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
  }

  /**
   * Clear all indexed chunks.
   */
  clearIndex(): void {
    this.chunks.clear();
  }

  /**
   * Get current index size.
   */
  getIndexSize(): number {
    return this.chunks.size;
  }

  /**
   * Retrieve relevant code chunks for a query.
   *
   * @param query - Natural language or code query
   * @param configOverride - Optional config override for this query
   * @returns Retrieval response with ranked results
   */
  async retrieve(
    query: string,
    configOverride?: Partial<RetrievalConfig>
  ): Promise<RetrievalResponse> {
    const startTime = Date.now();
    const config = { ...this.config, ...configOverride };

    // Generate query embedding
    const queryEmbedding = await this.embedder.embed(query);

    // Calculate similarities for all chunks
    const similarities: Array<{ chunk: StoredChunk; similarity: number }> = [];

    for (const chunk of this.chunks.values()) {
      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      if (similarity >= config.minSimilarity) {
        similarities.push({ chunk, similarity });
      }
    }

    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Apply deduplication and limits
    const results = this.applyFilters(similarities, config);

    // Convert to results format
    const retrievalResults: RetrievalResult[] = results.map(({ chunk, similarity }) => ({
      chunkId: chunk.id,
      filePath: chunk.filePath,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      similarity,
      entityType: chunk.entityType,
      entityName: chunk.entityName,
      language: chunk.language,
      metadata: chunk.metadata,
    }));

    // Calculate statistics
    const uniqueFiles = new Set(retrievalResults.map(r => r.filePath)).size;
    const avgSimilarity = retrievalResults.length > 0
      ? retrievalResults.reduce((sum, r) => sum + r.similarity, 0) / retrievalResults.length
      : 0;

    const stats: RetrievalStats = {
      totalChunksSearched: this.chunks.size,
      chunksAboveThreshold: similarities.length,
      chunksReturned: retrievalResults.length,
      uniqueFiles,
      avgSimilarity,
    };

    return {
      results: retrievalResults,
      query,
      retrievalTimeMs: Date.now() - startTime,
      stats,
    };
  }

  /**
   * Retrieve and merge results into a single context string.
   * Useful for providing context to LLMs.
   */
  async retrieveAsContext(
    query: string,
    configOverride?: Partial<RetrievalConfig>
  ): Promise<string> {
    const response = await this.retrieve(query, configOverride);

    if (response.results.length === 0) {
      return '';
    }

    // Format results as context
    const contextParts = response.results.map((result, index) => {
      const header = `// [${index + 1}] ${result.filePath}:${result.startLine}-${result.endLine} (${result.entityType}${result.entityName ? `: ${result.entityName}` : ''})`;
      return `${header}\n${result.content}`;
    });

    return contextParts.join('\n\n');
  }

  /**
   * Get configuration.
   */
  getConfig(): RetrievalConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<RetrievalConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Calculate cosine similarity between two vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Apply filtering, deduplication, and limits.
   */
  private applyFilters(
    similarities: Array<{ chunk: StoredChunk; similarity: number }>,
    config: RetrievalConfig
  ): Array<{ chunk: StoredChunk; similarity: number }> {
    if (!config.deduplicateByFile) {
      // Simple case: just take top-k
      return similarities.slice(0, config.topK);
    }

    // Track chunks per file
    const fileChunkCounts = new Map<string, number>();
    const results: Array<{ chunk: StoredChunk; similarity: number }> = [];

    for (const item of similarities) {
      if (results.length >= config.topK) {
        break;
      }

      const filePath = item.chunk.filePath;
      const currentCount = fileChunkCounts.get(filePath) || 0;

      if (currentCount < config.maxChunksPerFile) {
        results.push(item);
        fileChunkCounts.set(filePath, currentCount + 1);
      }
    }

    return results;
  }
}
