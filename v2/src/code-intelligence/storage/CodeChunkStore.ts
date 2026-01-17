/**
 * CodeChunkStore - RuVector-based storage for code intelligence chunks
 *
 * Extends RuVectorPostgresAdapter to provide specialized storage for:
 * - Code chunks with embeddings
 * - Entity relationships
 * - File-based filtering and search
 *
 * Uses the existing RuVector PostgreSQL infrastructure instead of
 * reinventing vector storage.
 *
 * @module code-intelligence/storage/CodeChunkStore
 */

import { Pool, PoolConfig } from 'pg';
import type { CodeChunk, CodeEntity, EntityRelationship, Language } from '../config/database-schema.js';

/**
 * Configuration for CodeChunkStore
 */
export interface CodeChunkStoreConfig {
  /** PostgreSQL connection string */
  connectionString?: string;
  /** PostgreSQL host (default: localhost) */
  host?: string;
  /** PostgreSQL port (default: 5432) */
  port?: number;
  /** PostgreSQL database name (default: ruvector_db) */
  database?: string;
  /** PostgreSQL user (default: ruvector) */
  user?: string;
  /** PostgreSQL password (default: ruvector) */
  password?: string;
  /** Embedding dimension (default: 768 for nomic-embed-text) */
  embeddingDimension?: number;
  /** Connection pool size (default: 10) */
  poolSize?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Search options for code chunks
 */
export interface CodeSearchOptions {
  /** Maximum number of results */
  topK?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Filter by language */
  language?: Language;
  /** Filter by file path pattern */
  filePattern?: string;
  /** Filter by entity type */
  entityType?: string;
  /** Include full content in results */
  includeContent?: boolean;
}

/**
 * Code search result
 */
export interface CodeSearchResult {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  score: number;
  chunkType?: string;
  name?: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

/**
 * CodeChunkStore - RuVector-backed code chunk storage
 *
 * Uses PostgreSQL with RuVector extension for:
 * - Semantic vector search via ruvector_cosine_distance()
 * - Full-text search via tsvector/GIN
 * - Hybrid search combining both
 */
export class CodeChunkStore {
  private pool: Pool;
  private readonly config: Required<CodeChunkStoreConfig>;
  private initialized = false;

  constructor(config: CodeChunkStoreConfig = {}) {
    this.config = {
      connectionString: config.connectionString ?? '',
      host: config.host ?? 'localhost',
      port: config.port ?? 5432,
      database: config.database ?? 'ruvector_db',
      user: config.user ?? 'ruvector',
      password: config.password ?? 'ruvector',
      embeddingDimension: config.embeddingDimension ?? 768,
      poolSize: config.poolSize ?? 10,
      debug: config.debug ?? false,
    };

    const poolConfig: PoolConfig = this.config.connectionString
      ? { connectionString: this.config.connectionString }
      : {
          host: this.config.host,
          port: this.config.port,
          database: this.config.database,
          user: this.config.user,
          password: this.config.password,
          max: this.config.poolSize,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        };

    this.pool = new Pool(poolConfig);

    this.log('CodeChunkStore initialized', {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
    });
  }

  /**
   * Initialize the store and create tables if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const client = await this.pool.connect();
    try {
      // Verify RuVector extension
      try {
        const extCheck = await client.query("SELECT ruvector_version() as version");
        this.log('RuVector extension version', { version: extCheck.rows[0]?.version });
      } catch (e) {
        this.log('RuVector extension not available, using standard vector operations');
      }

      // Create code_chunks table
      await client.query(`
        CREATE TABLE IF NOT EXISTS code_chunks (
          id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          chunk_type VARCHAR(50),
          name TEXT,
          line_start INTEGER,
          line_end INTEGER,
          content TEXT NOT NULL,
          language VARCHAR(20),
          embedding ruvector(${this.config.embeddingDimension}),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Create indices
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chunks_file ON code_chunks(file_path);
        CREATE INDEX IF NOT EXISTS idx_chunks_type ON code_chunks(chunk_type);
        CREATE INDEX IF NOT EXISTS idx_chunks_language ON code_chunks(language);
      `);

      // Create code_entities table
      await client.query(`
        CREATE TABLE IF NOT EXISTS code_entities (
          id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          entity_type VARCHAR(50) NOT NULL,
          name TEXT NOT NULL,
          signature TEXT,
          line_start INTEGER,
          line_end INTEGER,
          language VARCHAR(20),
          parent_id TEXT REFERENCES code_entities(id) ON DELETE CASCADE,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Create entity_relationships table
      await client.query(`
        CREATE TABLE IF NOT EXISTS entity_relationships (
          id SERIAL PRIMARY KEY,
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          relationship_type VARCHAR(50) NOT NULL,
          confidence REAL DEFAULT 1.0,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(source_id, target_id, relationship_type)
        )
      `);

      // Create indices for relationships
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_rel_source ON entity_relationships(source_id);
        CREATE INDEX IF NOT EXISTS idx_rel_target ON entity_relationships(target_id);
        CREATE INDEX IF NOT EXISTS idx_rel_type ON entity_relationships(relationship_type);
      `);

      this.initialized = true;
      this.log('CodeChunkStore tables initialized');
    } finally {
      client.release();
    }
  }

  /**
   * Store a code chunk with its embedding
   */
  async storeChunk(chunk: {
    id: string;
    filePath: string;
    content: string;
    embedding: number[];
    chunkType?: string;
    name?: string;
    startLine?: number;
    endLine?: number;
    language?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.ensureInitialized();

    const embeddingStr = `[${chunk.embedding.join(',')}]`;

    await this.pool.query(
      `INSERT INTO code_chunks
        (id, file_path, content, embedding, chunk_type, name, line_start, line_end, language, metadata)
       VALUES ($1, $2, $3, $4::ruvector, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         content = EXCLUDED.content,
         embedding = EXCLUDED.embedding,
         chunk_type = EXCLUDED.chunk_type,
         name = EXCLUDED.name,
         line_start = EXCLUDED.line_start,
         line_end = EXCLUDED.line_end,
         language = EXCLUDED.language,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        chunk.id,
        chunk.filePath,
        chunk.content,
        embeddingStr,
        chunk.chunkType || null,
        chunk.name || null,
        chunk.startLine || null,
        chunk.endLine || null,
        chunk.language || null,
        JSON.stringify(chunk.metadata || {}),
      ]
    );

    this.log('Chunk stored', { id: chunk.id, filePath: chunk.filePath });
  }

  /**
   * Store multiple chunks in batch
   */
  async storeChunks(chunks: Array<{
    id: string;
    filePath: string;
    content: string;
    embedding: number[];
    chunkType?: string;
    name?: string;
    startLine?: number;
    endLine?: number;
    language?: string;
    metadata?: Record<string, unknown>;
  }>): Promise<void> {
    await this.ensureInitialized();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const chunk of chunks) {
        const embeddingStr = `[${chunk.embedding.join(',')}]`;
        await client.query(
          `INSERT INTO code_chunks
            (id, file_path, content, embedding, chunk_type, name, line_start, line_end, language, metadata)
           VALUES ($1, $2, $3, $4::ruvector, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             content = EXCLUDED.content,
             embedding = EXCLUDED.embedding,
             chunk_type = EXCLUDED.chunk_type,
             name = EXCLUDED.name,
             line_start = EXCLUDED.line_start,
             line_end = EXCLUDED.line_end,
             language = EXCLUDED.language,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()`,
          [
            chunk.id,
            chunk.filePath,
            chunk.content,
            embeddingStr,
            chunk.chunkType || null,
            chunk.name || null,
            chunk.startLine || null,
            chunk.endLine || null,
            chunk.language || null,
            JSON.stringify(chunk.metadata || {}),
          ]
        );
      }

      await client.query('COMMIT');
      this.log('Batch stored', { count: chunks.length });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Search for similar code chunks using vector similarity
   */
  async search(
    queryEmbedding: number[],
    options: CodeSearchOptions = {}
  ): Promise<CodeSearchResult[]> {
    await this.ensureInitialized();

    const {
      topK = 10,
      minScore = 0.0,
      language,
      filePattern,
      entityType,
      includeContent = true,
    } = options;

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Build filter clauses
    const filters: string[] = ['embedding IS NOT NULL'];
    const params: unknown[] = [embeddingStr, topK];
    let paramIndex = 3;

    if (language) {
      filters.push(`language = $${paramIndex++}`);
      params.push(language);
    }

    if (filePattern) {
      filters.push(`file_path LIKE $${paramIndex++}`);
      params.push(`%${filePattern}%`);
    }

    if (entityType) {
      filters.push(`chunk_type = $${paramIndex++}`);
      params.push(entityType);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const contentSelect = includeContent ? 'content,' : "'' as content,";

    const result = await this.pool.query<{
      id: string;
      file_path: string;
      content: string;
      line_start: number;
      line_end: number;
      chunk_type: string;
      name: string;
      language: string;
      metadata: Record<string, unknown>;
      distance: number;
    }>(
      `SELECT
        id,
        file_path,
        ${contentSelect}
        line_start,
        line_end,
        chunk_type,
        name,
        language,
        metadata,
        ruvector_cosine_distance(embedding, $1::ruvector) as distance
       FROM code_chunks
       ${whereClause}
       ORDER BY ruvector_cosine_distance(embedding, $1::ruvector)
       LIMIT $2`,
      params
    );

    return result.rows
      .map((row) => ({
        id: row.id,
        filePath: row.file_path,
        content: row.content,
        startLine: row.line_start || 0,
        endLine: row.line_end || 0,
        score: Math.max(0, 1 - row.distance), // Convert distance to similarity
        chunkType: row.chunk_type,
        name: row.name,
        language: row.language,
        metadata: row.metadata,
      }))
      .filter((r) => r.score >= minScore);
  }

  /**
   * Hybrid search combining vector similarity and keyword matching
   */
  async hybridSearch(
    queryEmbedding: number[],
    queryText: string,
    options: CodeSearchOptions & { semanticWeight?: number } = {}
  ): Promise<CodeSearchResult[]> {
    await this.ensureInitialized();

    const {
      topK = 10,
      minScore = 0.0,
      language,
      filePattern,
      semanticWeight = 0.7,
    } = options;

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Build filter clauses
    const filters: string[] = ['embedding IS NOT NULL'];
    const params: unknown[] = [embeddingStr, queryText, topK];
    let paramIndex = 4;

    if (language) {
      filters.push(`language = $${paramIndex++}`);
      params.push(language);
    }

    if (filePattern) {
      filters.push(`file_path LIKE $${paramIndex++}`);
      params.push(`%${filePattern}%`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const result = await this.pool.query<{
      id: string;
      file_path: string;
      content: string;
      line_start: number;
      line_end: number;
      chunk_type: string;
      name: string;
      language: string;
      metadata: Record<string, unknown>;
      semantic_score: number;
      keyword_score: number;
      hybrid_score: number;
    }>(
      `SELECT
        id,
        file_path,
        content,
        line_start,
        line_end,
        chunk_type,
        name,
        language,
        metadata,
        (1 - ruvector_cosine_distance(embedding, $1::ruvector)) as semantic_score,
        ts_rank(to_tsvector('english', content), plainto_tsquery('english', $2)) as keyword_score,
        (
          ${semanticWeight} * (1 - ruvector_cosine_distance(embedding, $1::ruvector)) +
          ${1 - semanticWeight} * ts_rank(to_tsvector('english', content), plainto_tsquery('english', $2))
        ) as hybrid_score
       FROM code_chunks
       ${whereClause}
       ORDER BY hybrid_score DESC
       LIMIT $3`,
      params
    );

    return result.rows
      .map((row) => ({
        id: row.id,
        filePath: row.file_path,
        content: row.content,
        startLine: row.line_start || 0,
        endLine: row.line_end || 0,
        score: row.hybrid_score,
        chunkType: row.chunk_type,
        name: row.name,
        language: row.language,
        metadata: {
          ...row.metadata,
          semanticScore: row.semantic_score,
          keywordScore: row.keyword_score,
        },
      }))
      .filter((r) => r.score >= minScore);
  }

  /**
   * Store a code entity
   */
  async storeEntity(entity: {
    id: string;
    filePath: string;
    entityType: string;
    name: string;
    signature?: string;
    startLine?: number;
    endLine?: number;
    language?: string;
    parentId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.ensureInitialized();

    await this.pool.query(
      `INSERT INTO code_entities
        (id, file_path, entity_type, name, signature, line_start, line_end, language, parent_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         file_path = EXCLUDED.file_path,
         entity_type = EXCLUDED.entity_type,
         name = EXCLUDED.name,
         signature = EXCLUDED.signature,
         line_start = EXCLUDED.line_start,
         line_end = EXCLUDED.line_end,
         language = EXCLUDED.language,
         parent_id = EXCLUDED.parent_id,
         metadata = EXCLUDED.metadata`,
      [
        entity.id,
        entity.filePath,
        entity.entityType,
        entity.name,
        entity.signature || null,
        entity.startLine || null,
        entity.endLine || null,
        entity.language || null,
        entity.parentId || null,
        JSON.stringify(entity.metadata || {}),
      ]
    );
  }

  /**
   * Store a relationship between entities
   */
  async storeRelationship(relationship: {
    sourceId: string;
    targetId: string;
    relationshipType: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.ensureInitialized();

    await this.pool.query(
      `INSERT INTO entity_relationships
        (source_id, target_id, relationship_type, confidence, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source_id, target_id, relationship_type) DO UPDATE SET
         confidence = EXCLUDED.confidence,
         metadata = EXCLUDED.metadata`,
      [
        relationship.sourceId,
        relationship.targetId,
        relationship.relationshipType,
        relationship.confidence ?? 1.0,
        JSON.stringify(relationship.metadata || {}),
      ]
    );
  }

  /**
   * Get relationships for an entity
   */
  async getRelationships(
    entityId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<EntityRelationship[]> {
    await this.ensureInitialized();

    let query: string;
    const params = [entityId];

    if (direction === 'outgoing') {
      query = 'SELECT * FROM entity_relationships WHERE source_id = $1';
    } else if (direction === 'incoming') {
      query = 'SELECT * FROM entity_relationships WHERE target_id = $1';
    } else {
      query = 'SELECT * FROM entity_relationships WHERE source_id = $1 OR target_id = $1';
    }

    const result = await this.pool.query<EntityRelationship>(query, params);
    return result.rows;
  }

  /**
   * Delete chunks for a file (for re-indexing)
   */
  async deleteChunksForFile(filePath: string): Promise<number> {
    await this.ensureInitialized();

    const result = await this.pool.query(
      'DELETE FROM code_chunks WHERE file_path = $1',
      [filePath]
    );

    return result.rowCount || 0;
  }

  /**
   * Delete entities for a file
   */
  async deleteEntitiesForFile(filePath: string): Promise<number> {
    await this.ensureInitialized();

    const result = await this.pool.query(
      'DELETE FROM code_entities WHERE file_path = $1',
      [filePath]
    );

    return result.rowCount || 0;
  }

  /**
   * Delete chunks by file path (alias for deleteChunksForFile)
   */
  async deleteByFilePath(filePath: string): Promise<number> {
    return this.deleteChunksForFile(filePath);
  }

  /**
   * Get statistics about stored data
   */
  async getStats(): Promise<{
    chunkCount: number;
    entityCount: number;
    relationshipCount: number;
  }> {
    await this.ensureInitialized();

    const [chunks, entities, relationships] = await Promise.all([
      this.pool.query<{ count: string }>('SELECT COUNT(*) as count FROM code_chunks'),
      this.pool.query<{ count: string }>('SELECT COUNT(*) as count FROM code_entities'),
      this.pool.query<{ count: string }>('SELECT COUNT(*) as count FROM entity_relationships'),
    ]);

    return {
      chunkCount: parseInt(chunks.rows[0]?.count ?? '0', 10),
      entityCount: parseInt(entities.rows[0]?.count ?? '0', 10),
      relationshipCount: parseInt(relationships.rows[0]?.count ?? '0', 10),
    };
  }

  /**
   * Get chunk count
   */
  async getChunkCount(): Promise<number> {
    await this.ensureInitialized();

    const result = await this.pool.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM code_chunks'
    );

    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Get entity count
   */
  async getEntityCount(): Promise<number> {
    await this.ensureInitialized();

    const result = await this.pool.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM code_entities'
    );

    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    chunkCount: number;
    entityCount: number;
    ruvectorVersion?: string;
    error?: string;
  }> {
    try {
      await this.ensureInitialized();

      const [chunkResult, entityResult, versionResult] = await Promise.all([
        this.pool.query<{ count: string }>('SELECT COUNT(*) as count FROM code_chunks'),
        this.pool.query<{ count: string }>('SELECT COUNT(*) as count FROM code_entities'),
        this.pool.query<{ version: string }>("SELECT ruvector_version() as version").catch(() => null),
      ]);

      return {
        healthy: true,
        chunkCount: parseInt(chunkResult.rows[0]?.count ?? '0', 10),
        entityCount: parseInt(entityResult.rows[0]?.count ?? '0', 10),
        ruvectorVersion: versionResult?.rows[0]?.version,
      };
    } catch (error) {
      return {
        healthy: false,
        chunkCount: 0,
        entityCount: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.initialized = false;
    this.log('Connection pool closed');
  }

  /**
   * Clear all data (use with caution)
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    await this.pool.query('TRUNCATE entity_relationships CASCADE');
    await this.pool.query('TRUNCATE code_entities CASCADE');
    await this.pool.query('TRUNCATE code_chunks CASCADE');

    this.log('All data cleared');
  }

  // Private helpers

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private log(message: string, data?: Record<string, unknown>): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[CodeChunkStore] ${timestamp} - ${message}`, data ?? '');
    }
  }
}

/**
 * Factory function to create CodeChunkStore with Docker defaults
 */
export function createDockerCodeChunkStore(
  options?: Partial<CodeChunkStoreConfig>
): CodeChunkStore {
  return new CodeChunkStore({
    host: 'localhost',
    port: 5432,
    database: 'ruvector_db',
    user: 'ruvector',
    password: 'ruvector',
    embeddingDimension: 768,
    ...options,
  });
}

/**
 * Factory function to create CodeChunkStore from environment
 */
export function createCodeChunkStoreFromEnv(): CodeChunkStore {
  return new CodeChunkStore({
    connectionString: process.env.RUVECTOR_DATABASE_URL,
    host: process.env.RUVECTOR_HOST || 'localhost',
    port: parseInt(process.env.RUVECTOR_PORT || '5432', 10),
    database: process.env.RUVECTOR_DATABASE || 'ruvector_db',
    user: process.env.RUVECTOR_USER || 'ruvector',
    password: process.env.RUVECTOR_PASSWORD || 'ruvector',
    debug: process.env.DEBUG === 'true',
  });
}
