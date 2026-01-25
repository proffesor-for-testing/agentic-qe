/**
 * Hybrid Search Engine
 *
 * Combines BM25 keyword search with vector similarity search
 * using Reciprocal Rank Fusion (RRF) for optimal results.
 *
 * Benefits:
 * - BM25 excels at exact keyword matches and rare terms
 * - Vector search excels at semantic similarity
 * - RRF combines both without manual tuning
 */

import { BM25Search } from './BM25Search.js';
import { RRFFusion } from './RRFFusion.js';
import {
  HybridSearchConfig,
  SearchResult,
  SearchResponse,
  SearchStats,
  DEFAULT_HYBRID_SEARCH_CONFIG,
} from './types.js';

export interface VectorSearchProvider {
  search(query: string, topK: number): Promise<SearchResult[]>;
}

export class HybridSearchEngine {
  private config: HybridSearchConfig;
  private bm25: BM25Search;
  private rrfFusion: RRFFusion;
  private vectorProvider?: VectorSearchProvider;

  constructor(
    config: Partial<HybridSearchConfig> = {},
    vectorProvider?: VectorSearchProvider
  ) {
    this.config = { ...DEFAULT_HYBRID_SEARCH_CONFIG, ...config };
    this.bm25 = new BM25Search();
    this.rrfFusion = new RRFFusion({ k: this.config.rrfK });
    this.vectorProvider = vectorProvider;
  }

  /**
   * Add a document to the search index.
   */
  addDocument(doc: {
    id: string;
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    entityType?: string;
    entityName?: string;
  }): void {
    this.bm25.addDocument(doc);
  }

  /**
   * Add multiple documents.
   */
  addDocuments(docs: Array<{
    id: string;
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    entityType?: string;
    entityName?: string;
  }>): void {
    this.bm25.addDocuments(docs);
  }

  /**
   * Remove a document.
   */
  removeDocument(docId: string): boolean {
    return this.bm25.removeDocument(docId);
  }

  /**
   * Set the vector search provider.
   */
  setVectorProvider(provider: VectorSearchProvider): void {
    this.vectorProvider = provider;
  }

  /**
   * Perform hybrid search.
   */
  async search(
    query: string,
    configOverride?: Partial<HybridSearchConfig>
  ): Promise<SearchResponse> {
    const config = { ...this.config, ...configOverride };
    const startTime = Date.now();

    const candidateCount = config.topK * config.candidateMultiplier;
    let bm25TimeMs = 0;
    let vectorTimeMs = 0;
    let fusionTimeMs = 0;

    // BM25 search
    const bm25Start = Date.now();
    const bm25Results = this.bm25.search(query, candidateCount);
    bm25TimeMs = Date.now() - bm25Start;

    // Vector search (if provider available)
    let vectorResults: SearchResult[] = [];
    if (this.vectorProvider) {
      const vectorStart = Date.now();
      vectorResults = await this.vectorProvider.search(query, candidateCount);
      vectorTimeMs = Date.now() - vectorStart;
    }

    // Fusion
    const fusionStart = Date.now();
    let results: SearchResult[];

    if (vectorResults.length === 0) {
      // BM25 only
      results = bm25Results.slice(0, config.topK);
    } else if (config.useRRF) {
      // RRF fusion
      results = this.rrfFusion.fuse(
        [bm25Results, vectorResults],
        config.topK
      );
    } else {
      // Weighted score fusion
      results = this.rrfFusion.fuseScores(
        [bm25Results, vectorResults],
        [config.bm25Weight, config.vectorWeight],
        config.topK
      );
    }
    fusionTimeMs = Date.now() - fusionStart;

    // Filter by minimum score
    results = results.filter(r => r.score >= config.minScore);

    // Add highlights if enabled
    if (config.includeHighlights) {
      for (const result of results) {
        if (!result.highlights || result.highlights.length === 0) {
          result.highlights = this.bm25.getHighlights(
            result.content,
            this.tokenize(query)
          );
        }
      }
    }

    const stats: SearchStats = {
      bm25Candidates: bm25Results.length,
      vectorCandidates: vectorResults.length,
      fusedResults: results.length,
      bm25TimeMs,
      vectorTimeMs,
      fusionTimeMs,
    };

    return {
      results,
      query,
      totalMatches: bm25Results.length + vectorResults.length,
      searchTimeMs: Date.now() - startTime,
      stats,
    };
  }

  /**
   * BM25-only search (no vector).
   */
  searchKeyword(query: string, topK?: number): SearchResult[] {
    return this.bm25.search(query, topK || this.config.topK);
  }

  /**
   * Vector-only search.
   */
  async searchSemantic(query: string, topK?: number): Promise<SearchResult[]> {
    if (!this.vectorProvider) {
      throw new Error('Vector provider not configured');
    }
    return this.vectorProvider.search(query, topK || this.config.topK);
  }

  /**
   * Get index statistics.
   */
  getStats(): {
    bm25: { docCount: number; avgDocLength: number; uniqueTerms: number };
    hasVectorProvider: boolean;
  } {
    return {
      bm25: this.bm25.getStats(),
      hasVectorProvider: !!this.vectorProvider,
    };
  }

  /**
   * Clear all indexes.
   */
  clear(): void {
    this.bm25.clear();
  }

  /**
   * Get configuration.
   */
  getConfig(): HybridSearchConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<HybridSearchConfig>): void {
    this.config = { ...this.config, ...config };
    this.rrfFusion.updateConfig({ k: this.config.rrfK });
  }

  /**
   * Simple tokenization for highlighting.
   */
  private tokenize(text: string): string[] {
    return text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 2);
  }
}
