/**
 * Code Intelligence Hybrid Router
 *
 * Extends HybridRouter with code-specific routing optimizations:
 * - Code-aware embedding generation with nomic-embed-text
 * - Automatic storage of code chunks and relationships
 * - Integration with CodeChunkStore for persistent vector storage
 *
 * @module code-intelligence/router/CodeIntelligenceHybridRouter
 */

import {
  HybridRouter,
  HybridRouterConfig,
  RoutingStrategy,
} from '../../providers/HybridRouter.js';
import { CodeChunkStore, CodeChunkStoreConfig } from '../storage/CodeChunkStore.js';
import type { CodeChunk } from '../chunking/types.js';
import type { CodeEntity } from '../parser/types.js';
import type { EdgeType } from '../graph/types.js';

/**
 * Configuration for code intelligence routing
 */
export interface CodeIntelligenceRouterConfig extends HybridRouterConfig {
  /** Database configuration for CodeChunkStore */
  database?: CodeChunkStoreConfig;

  /** Whether to auto-store chunks in database (default: true) */
  autoStoreChunks?: boolean;

  /** Whether to store entity relationships (default: true) */
  storeRelationships?: boolean;

  /** Embedding dimension (default: 768 for nomic-embed-text) */
  embeddingDimension?: number;

  /** Batch size for bulk embedding operations */
  embeddingBatchSize?: number;
}

/**
 * Code chunk with embedding
 */
export interface EmbeddedChunk {
  chunk: CodeChunk;
  embedding: number[];
}

/**
 * Default configuration
 */
export const DEFAULT_CODE_ROUTER_CONFIG: Partial<CodeIntelligenceRouterConfig> = {
  autoStoreChunks: true,
  storeRelationships: true,
  embeddingDimension: 768,
  embeddingBatchSize: 32,
  defaultStrategy: RoutingStrategy.BALANCED,
};

/**
 * CodeIntelligenceHybridRouter - Specialized router for code intelligence
 *
 * Extends HybridRouter with:
 * - CodeChunkStore integration for persistent vector storage
 * - Code-specific embedding generation
 * - Automatic storage of code chunks and relationships
 */
export class CodeIntelligenceHybridRouter extends HybridRouter {
  private codeConfig: CodeIntelligenceRouterConfig;
  private chunkStore: CodeChunkStore | null = null;
  private embeddingDimension: number;
  private isCodeRouterInitialized: boolean = false;

  constructor(config: CodeIntelligenceRouterConfig = {}) {
    // Merge with defaults
    const mergedConfig = { ...DEFAULT_CODE_ROUTER_CONFIG, ...config };
    super(mergedConfig);

    this.codeConfig = mergedConfig;
    this.embeddingDimension = mergedConfig.embeddingDimension ?? 768;

    // Initialize CodeChunkStore if database configured
    if (config.database) {
      this.chunkStore = new CodeChunkStore({
        ...config.database,
        embeddingDimension: this.embeddingDimension,
      });
    }
  }

  /**
   * Initialize the router and code chunk store
   */
  async initialize(): Promise<void> {
    // Initialize parent HybridRouter
    await super.initialize();

    // Initialize CodeChunkStore
    if (this.chunkStore) {
      await this.chunkStore.initialize();
    }

    this.isCodeRouterInitialized = true;
  }

  /**
   * Generate embedding for a code chunk
   */
  async embedChunk(chunk: CodeChunk): Promise<EmbeddedChunk> {
    // Format chunk for embedding
    const text = this.formatChunkForEmbedding(chunk);

    // Generate embedding using parent's embed method
    const response = await this.embed({
      text,
      model: 'nomic-embed-text',
    });

    return {
      chunk,
      embedding: response.embedding,
    };
  }

  /**
   * Generate embeddings for multiple chunks in batch
   */
  async embedChunks(chunks: CodeChunk[]): Promise<EmbeddedChunk[]> {
    const batchSize = this.codeConfig.embeddingBatchSize ?? 32;
    const results: EmbeddedChunk[] = [];

    // Process in batches
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      // Generate embeddings in parallel within batch
      const batchResults = await Promise.all(
        batch.map((chunk) => this.embedChunk(chunk))
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Store a chunk with its embedding
   */
  async storeChunk(chunk: CodeChunk, embedding: number[]): Promise<void> {
    if (!this.chunkStore) {
      throw new Error('CodeChunkStore not configured. Provide database config.');
    }

    await this.chunkStore.storeChunk({
      id: chunk.id,
      filePath: chunk.filePath,
      content: chunk.content,
      embedding,
      chunkType: chunk.entityType,
      name: chunk.parentEntity, // Use parentEntity as name
      startLine: chunk.lineStart,
      endLine: chunk.lineEnd,
      language: chunk.language,
      metadata: chunk.metadata,
    });
  }

  /**
   * Embed and store a chunk in one operation
   */
  async embedAndStoreChunk(chunk: CodeChunk): Promise<EmbeddedChunk> {
    const embedded = await this.embedChunk(chunk);

    if (this.chunkStore && this.codeConfig.autoStoreChunks) {
      await this.storeChunk(chunk, embedded.embedding);
    }

    return embedded;
  }

  /**
   * Embed and store multiple chunks
   */
  async embedAndStoreChunks(chunks: CodeChunk[]): Promise<EmbeddedChunk[]> {
    const embedded = await this.embedChunks(chunks);

    if (this.chunkStore && this.codeConfig.autoStoreChunks) {
      // Store all chunks in batch
      await this.chunkStore.storeChunks(
        embedded.map((e) => ({
          id: e.chunk.id,
          filePath: e.chunk.filePath,
          content: e.chunk.content,
          embedding: e.embedding,
          chunkType: e.chunk.entityType,
          name: e.chunk.parentEntity,
          startLine: e.chunk.lineStart,
          endLine: e.chunk.lineEnd,
          language: e.chunk.language,
          metadata: e.chunk.metadata,
        }))
      );
    }

    return embedded;
  }

  /**
   * Store a code entity
   */
  async storeEntity(entity: CodeEntity, filePath: string): Promise<void> {
    if (!this.chunkStore) {
      throw new Error('CodeChunkStore not configured');
    }

    await this.chunkStore.storeEntity({
      id: `${filePath}:${entity.name}`,
      name: entity.name,
      entityType: entity.type,
      filePath,
      startLine: entity.lineStart,
      endLine: entity.lineEnd,
      signature: entity.signature,
    });
  }

  /**
   * Store a relationship between entities
   */
  async storeRelationship(
    sourceId: string,
    targetId: string,
    type: EdgeType,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.chunkStore || !this.codeConfig.storeRelationships) {
      return;
    }

    await this.chunkStore.storeRelationship({
      sourceId,
      targetId,
      relationshipType: type,
      metadata,
    });
  }

  /**
   * Search for similar code chunks
   */
  async searchCode(
    query: string,
    options: {
      topK?: number;
      language?: string;
      entityType?: string;
      filePattern?: string;
    } = {}
  ): Promise<Array<{
    id: string;
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    score: number;
    entityType?: string;
    entityName?: string;
  }>> {
    if (!this.chunkStore) {
      throw new Error('CodeChunkStore not configured');
    }

    // Generate query embedding
    const response = await this.embed({
      text: query,
      model: 'nomic-embed-text',
    });

    // Search in CodeChunkStore
    const results = await this.chunkStore.search(response.embedding, {
      topK: options.topK ?? 10,
      language: options.language as any,
      entityType: options.entityType,
      filePattern: options.filePattern,
    });

    return results.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      content: r.content,
      startLine: r.startLine,
      endLine: r.endLine,
      score: r.score,
      entityType: r.chunkType,
      entityName: r.name,
    }));
  }

  /**
   * Hybrid search combining vector and keyword search
   */
  async hybridSearchCode(
    query: string,
    options: {
      topK?: number;
      vectorWeight?: number;
      keywordWeight?: number;
    } = {}
  ): Promise<Array<{
    id: string;
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    score: number;
    vectorScore?: number;
    keywordScore?: number;
  }>> {
    if (!this.chunkStore) {
      throw new Error('CodeChunkStore not configured');
    }

    // Generate query embedding
    const response = await this.embed({
      text: query,
      model: 'nomic-embed-text',
    });

    // Perform hybrid search with correct signature
    const semanticWeight = options.vectorWeight ?? 0.7;
    const results = await this.chunkStore.hybridSearch(
      response.embedding,
      query,
      {
        topK: options.topK ?? 10,
        semanticWeight,
      }
    );

    return results.map((r) => ({
      id: r.id,
      filePath: r.filePath,
      content: r.content,
      startLine: r.startLine,
      endLine: r.endLine,
      score: r.score,
      vectorScore: (r.metadata as any)?.semanticScore,
      keywordScore: (r.metadata as any)?.keywordScore,
    }));
  }

  /**
   * Get the underlying CodeChunkStore
   */
  getChunkStore(): CodeChunkStore | null {
    return this.chunkStore;
  }

  /**
   * Check if router is using database storage
   */
  isUsingDatabase(): boolean {
    return this.chunkStore !== null;
  }

  /**
   * Get router statistics
   */
  async getCodeRouterStats(): Promise<{
    embeddingDimension: number;
    chunkCount: number;
    entityCount: number;
    relationshipCount: number;
    databaseHealthy: boolean;
    routerHealthy: boolean;
  }> {
    const routerHealth = await this.healthCheck();

    if (this.chunkStore) {
      const dbHealth = await this.chunkStore.healthCheck();
      const stats = await this.chunkStore.getStats();

      return {
        embeddingDimension: this.embeddingDimension,
        chunkCount: stats.chunkCount,
        entityCount: stats.entityCount,
        relationshipCount: stats.relationshipCount,
        databaseHealthy: dbHealth.healthy,
        routerHealthy: routerHealth.healthy,
      };
    }

    return {
      embeddingDimension: this.embeddingDimension,
      chunkCount: 0,
      entityCount: 0,
      relationshipCount: 0,
      databaseHealthy: false,
      routerHealthy: routerHealth.healthy,
    };
  }

  /**
   * Remove chunks for a file
   */
  async removeFile(filePath: string): Promise<number> {
    if (!this.chunkStore) {
      return 0;
    }
    return this.chunkStore.deleteByFilePath(filePath);
  }

  /**
   * Clear all stored data
   */
  async clearStorage(): Promise<void> {
    if (this.chunkStore) {
      await this.chunkStore.clear();
    }
  }

  /**
   * Shutdown router and close connections
   */
  async shutdown(): Promise<void> {
    // Shutdown parent
    await super.shutdown();

    // Close CodeChunkStore connection
    if (this.chunkStore) {
      await this.chunkStore.close();
      this.chunkStore = null;
    }

    this.isCodeRouterInitialized = false;
  }

  /**
   * Format a code chunk for embedding
   */
  private formatChunkForEmbedding(chunk: CodeChunk): string {
    const parts: string[] = [];

    // Add metadata context for better semantic understanding
    if (chunk.language) {
      parts.push(`Language: ${chunk.language}`);
    }
    if (chunk.entityType) {
      parts.push(`Type: ${chunk.entityType}`);
    }
    if (chunk.parentEntity) {
      parts.push(`Name: ${chunk.parentEntity}`);
    }

    parts.push('');
    parts.push(chunk.content);

    return parts.join('\n');
  }
}

/**
 * Factory function to create router with Docker defaults
 */
export function createDockerCodeIntelligenceRouter(
  config?: Partial<CodeIntelligenceRouterConfig>
): CodeIntelligenceHybridRouter {
  return new CodeIntelligenceHybridRouter({
    database: {
      host: process.env.RUVECTOR_HOST ?? 'localhost',
      port: parseInt(process.env.RUVECTOR_PORT ?? '5432'),
      database: process.env.RUVECTOR_DATABASE ?? 'ruvector',
      user: process.env.RUVECTOR_USER ?? 'ruvector',
      password: process.env.RUVECTOR_PASSWORD ?? 'ruvector',
      embeddingDimension: 768,
    },
    ruvllm: {
      port: parseInt(process.env.RUVLLM_PORT ?? '11434'),
    },
    ruvector: {
      enabled: true,
      baseUrl: process.env.RUVECTOR_URL ?? 'http://localhost:8080',
    },
    ...config,
  });
}

/**
 * Factory function to create router from environment
 */
export function createCodeIntelligenceRouterFromEnv(): CodeIntelligenceHybridRouter {
  const connectionString = process.env.RUVECTOR_CONNECTION_STRING;

  if (connectionString) {
    return new CodeIntelligenceHybridRouter({
      database: {
        connectionString,
        embeddingDimension: parseInt(process.env.EMBEDDING_DIMENSION ?? '768'),
      },
    });
  }

  return createDockerCodeIntelligenceRouter();
}
