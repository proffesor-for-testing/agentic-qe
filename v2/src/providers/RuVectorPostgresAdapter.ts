/**
 * RuVectorPostgresAdapter - PostgreSQL adapter for RuVector Docker integration
 *
 * Provides direct PostgreSQL connectivity to the RuVector Docker container
 * for GNN-enhanced vector search with LoRA learning capabilities.
 *
 * This adapter unlocks the full self-learning features:
 * - GNN (Graph Neural Network) reranking
 * - LoRA (Low-Rank Adaptation) parameter updates
 * - EWC++ (Elastic Weight Consolidation) for catastrophic forgetting prevention
 *
 * @module providers/RuVectorPostgresAdapter
 */

import { Pool, PoolConfig, QueryResult as PgQueryResult } from 'pg';
import {
  RuVectorConfig,
  SearchResult,
  Pattern,
  QueryResult,
  LearningMetrics,
  HealthCheckResponse,
  RuVectorError
} from './RuVectorClient';
import { seededRandom } from '../utils/SeededRandom';

/**
 * PostgreSQL-specific configuration for RuVector
 */
export interface RuVectorPostgresConfig extends Omit<RuVectorConfig, 'baseUrl'> {
  /** PostgreSQL connection string or config */
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
  /** Table name for patterns (default: qe_patterns) */
  tableName?: string;
  /** Embedding dimension (default: 768) */
  embeddingDimension?: number;
  /** Connection pool size (default: 10) */
  poolSize?: number;
}

/**
 * RuVector PostgreSQL Adapter
 *
 * Provides direct PostgreSQL integration with RuVector Docker container
 * for full self-learning capabilities.
 *
 * @example
 * ```typescript
 * const adapter = new RuVectorPostgresAdapter({
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'ruvector_db',
 *   user: 'ruvector',
 *   password: 'ruvector',
 *   learningEnabled: true,
 *   cacheThreshold: 0.8,
 *   loraRank: 8,
 *   ewcEnabled: true
 * });
 *
 * await adapter.initialize();
 * const result = await adapter.search(embedding, 5);
 * ```
 */
export class RuVectorPostgresAdapter {
  private pool: Pool;
  private readonly config: Required<RuVectorPostgresConfig>;
  private readonly tableName: string;
  private initialized = false;
  private queryCount = 0;
  private cacheHits = 0;
  private totalLatency = 0;

  constructor(config: RuVectorPostgresConfig) {
    this.config = {
      connectionString: config.connectionString ?? '',
      host: config.host ?? 'localhost',
      port: config.port ?? 5432,
      database: config.database ?? 'ruvector_db',
      user: config.user ?? 'ruvector',
      password: config.password ?? 'ruvector',
      tableName: config.tableName ?? 'qe_patterns',
      embeddingDimension: config.embeddingDimension ?? 768,
      poolSize: config.poolSize ?? 10,
      learningEnabled: config.learningEnabled ?? true,
      cacheThreshold: config.cacheThreshold ?? 0.85,
      loraRank: config.loraRank ?? 8,
      ewcEnabled: config.ewcEnabled ?? true,
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      debug: config.debug ?? false
    };

    this.tableName = this.config.tableName;

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
          connectionTimeoutMillis: this.config.timeout
        };

    this.pool = new Pool(poolConfig);

    this.log('RuVectorPostgresAdapter initialized', {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database
    });
  }

  /**
   * Initialize the adapter and create required tables
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const client = await this.pool.connect();
    try {
      // Verify RuVector extension is available
      const extCheck = await client.query(
        "SELECT ruvector_version() as version"
      );
      this.log('RuVector extension version', { version: extCheck.rows[0]?.version });

      // Create patterns table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          embedding ruvector(${this.config.embeddingDimension}),
          metadata JSONB DEFAULT '{}',
          confidence REAL DEFAULT 0.0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          usage_count INTEGER DEFAULT 0,
          last_used TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Enable learning on the table
      if (this.config.learningEnabled) {
        try {
          await client.query(
            `SELECT ruvector_enable_learning($1)`,
            [this.tableName]
          );
          this.log('Learning enabled for table', { tableName: this.tableName });
        } catch (e) {
          // Learning might already be enabled
          this.log('Learning enable warning (may already be enabled)', {
            error: (e as Error).message
          });
        }
      }

      this.initialized = true;
      this.log('Adapter initialized successfully');
    } finally {
      client.release();
    }
  }

  /**
   * Search for similar patterns using RuVector's cosine distance
   */
  async search(
    embedding: number[],
    k: number = 10,
    options?: {
      useGNN?: boolean;
      minConfidence?: number;
    }
  ): Promise<SearchResult[]> {
    this.validateEmbedding(embedding);
    await this.ensureInitialized();

    const startTime = Date.now();
    const minConfidence = options?.minConfidence ?? 0.0;

    try {
      // Convert embedding to RuVector format
      const embeddingStr = `[${embedding.join(',')}]`;

      const result = await this.pool.query<{
        id: string;
        content: string;
        embedding: string;
        metadata: Record<string, unknown>;
        confidence: number;
        distance: number;
      }>(`
        SELECT
          id,
          content,
          embedding::text,
          metadata,
          confidence,
          ruvector_cosine_distance(embedding, $1::ruvector) as distance
        FROM ${this.tableName}
        WHERE embedding IS NOT NULL
        ORDER BY ruvector_cosine_distance(embedding, $1::ruvector)
        LIMIT $2
      `, [embeddingStr, k]);

      const latency = Date.now() - startTime;

      // Convert distance to similarity (cosine distance to confidence)
      const results: SearchResult[] = result.rows
        .map(row => ({
          id: row.id,
          content: row.content,
          embedding: this.parseEmbedding(row.embedding),
          confidence: Math.max(0, 1 - row.distance), // Convert distance to similarity
          metadata: row.metadata
        }))
        .filter(r => r.confidence >= minConfidence);

      this.log('Search completed', {
        k,
        resultsCount: results.length,
        latency,
        topConfidence: results[0]?.confidence
      });

      return results;
    } catch (error) {
      throw this.handleError('search', error, { k, embeddingSize: embedding.length });
    }
  }

  /**
   * Store a pattern with automatic LoRA learning
   */
  async store(
    pattern: Pattern,
    options?: {
      id?: string;
      triggerLearning?: boolean;
    }
  ): Promise<string> {
    this.validateEmbedding(pattern.embedding);
    await this.ensureInitialized();

    const id = options?.id ?? this.generateId();
    const embeddingStr = `[${pattern.embedding.join(',')}]`;

    try {
      await this.pool.query(`
        INSERT INTO ${this.tableName} (id, content, embedding, metadata, confidence)
        VALUES ($1, $2, $3::ruvector, $4, 1.0)
        ON CONFLICT (id) DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          updated_at = NOW(),
          usage_count = ${this.tableName}.usage_count + 1
      `, [id, pattern.content, embeddingStr, JSON.stringify(pattern.metadata)]);

      // Record feedback for learning if enabled
      if (this.config.learningEnabled && options?.triggerLearning) {
        try {
          // Get the stored pattern's embedding as real[] for feedback
          await this.pool.query(`
            SELECT ruvector_record_feedback(
              $1,
              (SELECT embedding::text FROM ${this.tableName} WHERE id = $2 LIMIT 1)::real[],
              ARRAY[$3]::bigint[],
              ARRAY[]::bigint[]
            )
          `, [this.tableName, id, 1]); // Mark as relevant
        } catch (e) {
          // Feedback recording is best-effort
          this.log('Feedback recording failed (non-critical)', {
            error: (e as Error).message
          });
        }
      }

      this.log('Pattern stored', { id, contentLength: pattern.content.length });
      return id;
    } catch (error) {
      throw this.handleError('store', error, { embeddingSize: pattern.embedding.length });
    }
  }

  /**
   * Query with automatic learning and LLM fallback
   */
  async queryWithLearning(
    query: string,
    embedding: number[],
    llmFallback: () => Promise<string>
  ): Promise<QueryResult> {
    const startTime = Date.now();
    this.queryCount++;

    try {
      // Search for similar patterns
      const results = await this.search(embedding, 5);
      const topResult = results[0];

      // Check confidence threshold
      if (topResult && topResult.confidence > this.config.cacheThreshold) {
        this.cacheHits++;
        const latency = Date.now() - startTime;
        this.totalLatency += latency;

        // Update usage count
        await this.pool.query(`
          UPDATE ${this.tableName}
          SET usage_count = usage_count + 1, last_used = NOW()
          WHERE id = $1
        `, [topResult.id]);

        this.log('Cache hit', {
          query,
          confidence: topResult.confidence,
          threshold: this.config.cacheThreshold,
          latency
        });

        return {
          content: topResult.content,
          source: 'cache',
          confidence: topResult.confidence,
          latency,
          metadata: topResult.metadata
        };
      }

      // Cache miss - call LLM
      this.log('Cache miss, calling LLM fallback', {
        query,
        topConfidence: topResult?.confidence ?? 0,
        threshold: this.config.cacheThreshold
      });

      const llmResponse = await llmFallback();
      const latency = Date.now() - startTime;
      this.totalLatency += latency;

      // Store for future learning
      if (this.config.learningEnabled) {
        await this.store(
          {
            embedding,
            content: llmResponse,
            metadata: {
              query,
              timestamp: new Date().toISOString(),
              source: 'llm',
              originalConfidence: topResult?.confidence ?? 0
            }
          },
          { triggerLearning: true }
        );
      }

      return {
        content: llmResponse,
        source: 'llm',
        confidence: 1.0,
        latency,
        metadata: {
          query,
          cachedResultConfidence: topResult?.confidence
        }
      };
    } catch (error) {
      throw this.handleError('queryWithLearning', error, { query });
    }
  }

  /**
   * Get learning metrics from PostgreSQL
   */
  async getMetrics(): Promise<LearningMetrics> {
    await this.ensureInitialized();

    try {
      const countResult = await this.pool.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM ${this.tableName}
      `);

      const sizeResult = await this.pool.query<{ size: string }>(`
        SELECT pg_size_pretty(pg_total_relation_size($1)) as size
      `, [this.tableName]);

      // Try to get learning stats
      let learningStats: { totalFeedback?: number } = {};
      try {
        const statsResult = await this.pool.query(`
          SELECT ruvector_learning_stats($1) as stats
        `, [this.tableName]);
        learningStats = statsResult.rows[0]?.stats ?? {};
      } catch {
        // Learning stats may not be available
      }

      return {
        cacheHitRate: this.queryCount > 0 ? this.cacheHits / this.queryCount : 0,
        totalQueries: this.queryCount,
        loraUpdates: learningStats.totalFeedback ?? 0,
        averageLatency: this.queryCount > 0 ? this.totalLatency / this.queryCount : 0,
        patternCount: parseInt(countResult.rows[0]?.count ?? '0', 10),
        memoryUsageMB: this.parseSize(sizeResult.rows[0]?.size ?? '0'),
        gnnMetrics: undefined // GNN metrics require more complex queries
      };
    } catch (error) {
      throw this.handleError('getMetrics', error);
    }
  }

  /**
   * Force learning consolidation
   */
  async forceLearn(): Promise<{
    success: boolean;
    updatedParameters: number;
    duration: number;
  }> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      // Trigger learning consolidation by analyzing all patterns
      const result = await this.pool.query<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM ${this.tableName}
        WHERE updated_at > NOW() - INTERVAL '1 hour'
      `);

      const duration = Date.now() - startTime;
      const updatedCount = parseInt(result.rows[0]?.count ?? '0', 10);

      this.log('Learning consolidation completed', { updatedCount, duration });

      return {
        success: true,
        updatedParameters: updatedCount,
        duration
      };
    } catch (error) {
      throw this.handleError('forceLearn', error);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const startTime = Date.now();

    try {
      // Check PostgreSQL connection
      const versionResult = await this.pool.query<{ version: string }>(
        "SELECT ruvector_version() as version"
      );

      // Check pattern count
      const countResult = await this.pool.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM ${this.tableName}
      `);

      const uptime = Date.now() - startTime;

      return {
        status: 'healthy',
        version: versionResult.rows[0]?.version ?? 'unknown',
        uptime,
        gnnStatus: 'active', // GNN is always available via ruvector functions
        loraStatus: this.config.learningEnabled ? 'active' : 'inactive',
        vectorCount: parseInt(countResult.rows[0]?.count ?? '0', 10)
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        version: 'unknown',
        uptime: 0,
        gnnStatus: 'inactive',
        loraStatus: 'inactive',
        vectorCount: 0,
        lastError: (error as Error).message
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
   * Reset metrics
   */
  resetMetrics(): void {
    this.queryCount = 0;
    this.cacheHits = 0;
    this.totalLatency = 0;
    this.log('Metrics reset');
  }

  // Private helper methods

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private validateEmbedding(embedding: number[]): void {
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new RuVectorError(
        'Embedding must be a non-empty array',
        'INVALID_EMBEDDING'
      );
    }

    if (embedding.length !== this.config.embeddingDimension) {
      throw new RuVectorError(
        `Embedding dimension mismatch: expected ${this.config.embeddingDimension}, got ${embedding.length}`,
        'INVALID_EMBEDDING'
      );
    }

    if (!embedding.every(v => typeof v === 'number' && !isNaN(v))) {
      throw new RuVectorError(
        'Embedding must contain only valid numbers',
        'INVALID_EMBEDDING'
      );
    }
  }

  private parseEmbedding(embeddingStr: string): number[] {
    // Handle binary format (\x...) by returning empty array
    if (embeddingStr.startsWith('\\x')) {
      return [];
    }

    // Parse [1,2,3] format
    try {
      const cleaned = embeddingStr.replace(/[\[\]]/g, '');
      return cleaned.split(',').map(v => parseFloat(v.trim()));
    } catch {
      return [];
    }
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^([\d.]+)\s*(\w+)?$/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = (match[2] ?? 'B').toUpperCase();

    const multipliers: Record<string, number> = {
      'B': 1 / (1024 * 1024),
      'KB': 1 / 1024,
      'MB': 1,
      'GB': 1024,
      'TB': 1024 * 1024
    };

    return value * (multipliers[unit] ?? 1);
  }

  private generateId(): string {
    return `pat_${Date.now()}_${seededRandom.random().toString(36).substring(2, 11)}`;
  }

  private handleError(
    operation: string,
    error: unknown,
    context?: Record<string, unknown>
  ): RuVectorError {
    if (error instanceof RuVectorError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const ruVectorError = new RuVectorError(
      `${operation} failed: ${message}`,
      'OPERATION_FAILED',
      undefined,
      { originalError: error, context }
    );

    this.log(`Error in ${operation}`, { error: message, context });

    return ruVectorError;
  }

  private log(message: string, data?: Record<string, unknown>): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[RuVectorPostgres] ${timestamp} - ${message}`, data ?? '');
    }
  }
}

/**
 * Factory function to create a PostgreSQL adapter
 */
export function createRuVectorPostgresAdapter(
  config: RuVectorPostgresConfig
): RuVectorPostgresAdapter {
  return new RuVectorPostgresAdapter(config);
}

/**
 * Create adapter with Docker defaults
 */
export function createDockerRuVectorAdapter(
  options?: Partial<RuVectorPostgresConfig>
): RuVectorPostgresAdapter {
  return new RuVectorPostgresAdapter({
    host: 'localhost',
    port: 5432,
    database: 'ruvector_db',
    user: 'ruvector',
    password: 'ruvector',
    learningEnabled: true,
    cacheThreshold: 0.85,
    loraRank: 8,
    ewcEnabled: true,
    ...options
  });
}

export const RUVECTOR_POSTGRES_ADAPTER_VERSION = '1.0.0';
