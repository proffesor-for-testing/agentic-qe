/**
 * Vector Search
 *
 * Provides semantic vector search using embeddings.
 * Delegates to CodeChunkStore for RuVector-backed persistence,
 * with in-memory fallback for testing.
 *
 * @module code-intelligence/search/VectorSearch
 */

import type { SearchResult } from './types.js';
import { CodeChunkStore, CodeChunkStoreConfig } from '../storage/CodeChunkStore.js';

export interface VectorSearchConfig {
  /**
   * Number of dimensions in embedding vectors.
   */
  dimensions: number;

  /**
   * Distance metric for similarity.
   */
  metric: 'cosine' | 'euclidean' | 'dot';

  /**
   * PostgreSQL connection configuration for RuVector.
   * If not provided, uses in-memory storage.
   */
  database?: CodeChunkStoreConfig;

  /**
   * Index type for pgvector (HNSW or IVFFlat).
   */
  indexType: 'hnsw' | 'ivfflat' | 'none';

  /**
   * HNSW M parameter (connections per layer).
   */
  hnswM: number;

  /**
   * HNSW ef_construction parameter.
   */
  hnswEfConstruction: number;

  /**
   * HNSW ef_search parameter (higher = more accurate but slower).
   */
  hnswEfSearch: number;
}

export interface VectorDocument {
  /** Document ID */
  id: string;

  /** Embedding vector */
  embedding: number[];

  /** Document metadata */
  metadata: {
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    entityType?: string;
    entityName?: string;
  };
}

export const DEFAULT_VECTOR_SEARCH_CONFIG: VectorSearchConfig = {
  dimensions: 768, // nomic-embed-text
  metric: 'cosine',
  indexType: 'hnsw',
  hnswM: 16,
  hnswEfConstruction: 64,
  hnswEfSearch: 40,
};

/**
 * VectorSearch - Unified interface for vector search
 *
 * Uses CodeChunkStore (RuVector PostgreSQL) when database is configured,
 * otherwise falls back to in-memory storage for testing.
 */
export class VectorSearch {
  private config: VectorSearchConfig;
  private documents: Map<string, VectorDocument> = new Map();
  private chunkStore: CodeChunkStore | null = null;
  private useDatabase: boolean;

  constructor(config: Partial<VectorSearchConfig> = {}) {
    this.config = { ...DEFAULT_VECTOR_SEARCH_CONFIG, ...config };
    this.useDatabase = !!config.database;

    if (config.database) {
      this.chunkStore = new CodeChunkStore({
        ...config.database,
        embeddingDimension: this.config.dimensions,
      });
    }
  }

  /**
   * Initialize the vector search (connect to database if configured).
   */
  async initialize(): Promise<void> {
    if (this.chunkStore) {
      await this.chunkStore.initialize();
    }
  }

  /**
   * Add a document with its embedding.
   */
  async addDocument(doc: VectorDocument): Promise<void> {
    if (doc.embedding.length !== this.config.dimensions) {
      throw new Error(
        `Expected ${this.config.dimensions} dimensions, got ${doc.embedding.length}`
      );
    }

    if (this.chunkStore) {
      await this.chunkStore.storeChunk({
        id: doc.id,
        filePath: doc.metadata.filePath,
        content: doc.metadata.content,
        embedding: doc.embedding,
        chunkType: doc.metadata.entityType,
        name: doc.metadata.entityName,
        startLine: doc.metadata.startLine,
        endLine: doc.metadata.endLine,
      });
    } else {
      this.documents.set(doc.id, doc);
    }
  }

  /**
   * Add multiple documents.
   */
  async addDocuments(docs: VectorDocument[]): Promise<void> {
    if (this.chunkStore) {
      await this.chunkStore.storeChunks(
        docs.map((doc) => ({
          id: doc.id,
          filePath: doc.metadata.filePath,
          content: doc.metadata.content,
          embedding: doc.embedding,
          chunkType: doc.metadata.entityType,
          name: doc.metadata.entityName,
          startLine: doc.metadata.startLine,
          endLine: doc.metadata.endLine,
        }))
      );
    } else {
      for (const doc of docs) {
        this.documents.set(doc.id, doc);
      }
    }
  }

  /**
   * Remove a document.
   */
  async removeDocument(docId: string): Promise<boolean> {
    if (this.chunkStore) {
      // For database, we need to get the file path first
      // This is a limitation - we'd need to store doc ID -> file path mapping
      // For now, return false as we can't delete by ID alone
      return false;
    }
    return this.documents.delete(docId);
  }

  /**
   * Search for similar documents.
   */
  async search(
    queryEmbedding: number[],
    topK: number = 10,
    filter?: {
      language?: string;
      entityType?: string;
      filePattern?: string;
    }
  ): Promise<SearchResult[]> {
    if (queryEmbedding.length !== this.config.dimensions) {
      throw new Error(
        `Expected ${this.config.dimensions} dimensions, got ${queryEmbedding.length}`
      );
    }

    if (this.chunkStore) {
      const results = await this.chunkStore.search(queryEmbedding, {
        topK,
        language: filter?.language as any,
        filePattern: filter?.filePattern,
        entityType: filter?.entityType,
      });

      return results.map((r) => ({
        id: r.id,
        filePath: r.filePath,
        content: r.content,
        startLine: r.startLine,
        endLine: r.endLine,
        score: r.score,
        vectorScore: r.score,
        entityType: r.chunkType,
        entityName: r.name,
      }));
    }

    return this.searchInMemory(queryEmbedding, topK, filter);
  }

  /**
   * Get a document by ID.
   */
  async getDocument(docId: string): Promise<VectorDocument | null> {
    if (this.chunkStore) {
      // Database doesn't support single doc retrieval by ID efficiently
      // Would need to add a method to CodeChunkStore
      return null;
    }
    return this.documents.get(docId) || null;
  }

  /**
   * Get all document IDs.
   */
  getDocumentIds(): string[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Get document count.
   */
  getDocumentCount(): number {
    return this.documents.size;
  }

  /**
   * Clear all documents.
   */
  async clear(): Promise<void> {
    if (this.chunkStore) {
      await this.chunkStore.clear();
    } else {
      this.documents.clear();
    }
  }

  /**
   * Get configuration.
   */
  getConfig(): VectorSearchConfig {
    return { ...this.config };
  }

  /**
   * Close database connection.
   */
  async close(): Promise<void> {
    if (this.chunkStore) {
      await this.chunkStore.close();
      this.chunkStore = null;
    }
  }

  /**
   * Check if using database storage.
   */
  isUsingDatabase(): boolean {
    return this.useDatabase && this.chunkStore !== null;
  }

  /**
   * Get the underlying CodeChunkStore (for advanced operations).
   */
  getChunkStore(): CodeChunkStore | null {
    return this.chunkStore;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    mode: 'database' | 'memory';
    documentCount: number;
    error?: string;
  }> {
    if (this.chunkStore) {
      const health = await this.chunkStore.healthCheck();
      return {
        healthy: health.healthy,
        mode: 'database',
        documentCount: health.chunkCount,
        error: health.error,
      };
    }

    return {
      healthy: true,
      mode: 'memory',
      documentCount: this.documents.size,
    };
  }

  // === In-Memory Search Implementation ===

  /**
   * Search in memory using brute force.
   */
  private searchInMemory(
    queryEmbedding: number[],
    topK: number,
    filter?: {
      language?: string;
      entityType?: string;
      filePattern?: string;
    }
  ): SearchResult[] {
    const scores: Array<{ doc: VectorDocument; score: number }> = [];

    for (const doc of this.documents.values()) {
      // Apply filters
      if (filter) {
        if (filter.entityType && doc.metadata.entityType !== filter.entityType) {
          continue;
        }
        if (filter.filePattern && !doc.metadata.filePath.includes(filter.filePattern)) {
          continue;
        }
      }

      const score = this.calculateSimilarity(queryEmbedding, doc.embedding);
      scores.push({ doc, score });
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Return top K
    return scores.slice(0, topK).map(({ doc, score }) => ({
      id: doc.id,
      filePath: doc.metadata.filePath,
      content: doc.metadata.content,
      startLine: doc.metadata.startLine,
      endLine: doc.metadata.endLine,
      score,
      vectorScore: score,
      entityType: doc.metadata.entityType,
      entityName: doc.metadata.entityName,
    }));
  }

  /**
   * Calculate similarity between two vectors.
   */
  private calculateSimilarity(a: number[], b: number[]): number {
    switch (this.config.metric) {
      case 'cosine':
        return this.cosineSimilarity(a, b);
      case 'euclidean':
        return 1 / (1 + this.euclideanDistance(a, b));
      case 'dot':
        return this.dotProduct(a, b);
      default:
        return this.cosineSimilarity(a, b);
    }
  }

  /**
   * Cosine similarity.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Euclidean distance.
   */
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Dot product.
   */
  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }
}
