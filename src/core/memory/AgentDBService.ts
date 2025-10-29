/**
 * AgentDB Service - Core wrapper for AgentDB operations
 *
 * Provides high-level API for:
 * - Pattern storage with vector embeddings
 * - HNSW-based similarity search (150x faster)
 * - Batch operations for performance
 * - Integration with QE agents
 *
 * Performance Targets:
 * - Vector Search: <100µs (HNSW indexing)
 * - Pattern Retrieval: <1ms (with cache)
 * - Batch Insert: 2ms for 100 patterns
 *
 * @module AgentDBService
 */

import {
  SQLiteVectorDB,
  createVectorDB,
  Vector,
  SearchResult,
  SimilarityMetric,
  Pattern as AgentDBPattern,
  ExtendedDatabaseConfig,
  HNSWConfig,
  DEFAULT_HNSW_CONFIG
} from 'agentdb';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Pattern data structure for QE agents
 */
export interface QEPattern {
  id: string;
  type: string; // Agent type (test-generator, coverage-analyzer, etc.)
  domain: string; // Domain/category (test-planning, coverage-analysis, etc.)
  data: any; // Pattern-specific data
  confidence: number; // 0-1 confidence score
  usageCount: number;
  successCount: number;
  createdAt: number;
  lastUsed: number;
  metadata?: Record<string, any>;
}

/**
 * Configuration for AgentDB service
 */
export interface AgentDBServiceConfig {
  /** Path to database file */
  dbPath: string;

  /** Embedding dimension (default: 384 for all-MiniLM-L6-v2) */
  embeddingDim: number;

  /** Enable HNSW indexing for fast search */
  enableHNSW: boolean;

  /** HNSW configuration */
  hnswConfig?: Partial<HNSWConfig>;

  /** Enable query caching */
  enableCache: boolean;

  /** Cache size (default: 1000) */
  cacheSize?: number;

  /** Cache TTL in milliseconds (default: 3600000 = 1 hour) */
  cacheTTL?: number;

  /** Enable quantization for memory efficiency */
  enableQuantization?: boolean;

  /** Quantization bits (4, 8, or 16) */
  quantizationBits?: number;
}

/**
 * Search options for pattern retrieval
 */
export interface PatternSearchOptions {
  /** Number of results to return */
  k?: number;

  /** Similarity metric */
  metric?: SimilarityMetric;

  /** Minimum similarity threshold (0-1) */
  threshold?: number;

  /** Domain filter */
  domain?: string;

  /** Type filter (agent type) */
  type?: string;

  /** Minimum confidence score */
  minConfidence?: number;
}

/**
 * Batch operation result
 */
export interface BatchResult {
  success: boolean;
  insertedIds: string[];
  errors: Array<{ index: number; error: string }>;
  duration: number;
}

/**
 * Search result with QE pattern
 */
export interface PatternSearchResult {
  pattern: QEPattern;
  similarity: number;
  distance: number;
}

/**
 * AgentDB Service - Core implementation
 */
export class AgentDBService {
  private db: SQLiteVectorDB | null = null;
  private config: AgentDBServiceConfig;
  private isInitialized: boolean = false;
  private logger: Console;

  constructor(config: AgentDBServiceConfig) {
    this.config = {
      ...config,
      hnswConfig: config.hnswConfig || DEFAULT_HNSW_CONFIG,
      cacheSize: config.cacheSize || 1000,
      cacheTTL: config.cacheTTL || 3600000,
      quantizationBits: config.quantizationBits || 8
    };
    this.logger = console;
  }

  /**
   * Initialize AgentDB with HNSW indexing
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('AgentDBService already initialized');
    }

    try {
      // Ensure database directory exists
      const dbDir = path.dirname(this.config.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Create database configuration
      const dbConfig: ExtendedDatabaseConfig = {
        path: this.config.dbPath,
        memoryMode: false,
        walMode: true,
        cacheSize: this.config.cacheSize,
        queryCache: {
          enabled: this.config.enableCache,
          maxSize: this.config.cacheSize,
          ttl: this.config.cacheTTL,
          enableStats: true
        },
        quantization: this.config.enableQuantization ? {
          enabled: true,
          dimensions: this.config.embeddingDim,
          subvectors: 8,
          bits: this.config.quantizationBits ?? 8, // Default to 8 bits if not specified
          trainOnInsert: true,
          minVectorsForTraining: 100
        } : undefined
      };

      // Create vector database
      this.db = await createVectorDB(dbConfig);

      // Initialize database schema
      await this.initializeSchema();

      this.isInitialized = true;
      this.logger.info('AgentDBService initialized successfully', {
        dbPath: this.config.dbPath,
        enableHNSW: this.config.enableHNSW,
        enableCache: this.config.enableCache,
        enableQuantization: this.config.enableQuantization
      });
    } catch (error: any) {
      throw new Error(`Failed to initialize AgentDBService: ${error.message}`);
    }
  }

  /**
   * Initialize database schema for patterns
   */
  private async initializeSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // The SQLiteVectorDB creates the vectors table automatically
      // We'll use the metadata field to store pattern information
      this.logger.info('Database schema initialized');
    } catch (error: any) {
      throw new Error(`Failed to initialize schema: ${error.message}`);
    }
  }

  /**
   * Store a pattern with its embedding
   */
  async storePattern(pattern: QEPattern, embedding: number[]): Promise<string> {
    this.ensureInitialized();

    try {
      const startTime = Date.now();

      // Validate embedding dimension
      if (embedding.length !== this.config.embeddingDim) {
        throw new Error(
          `Embedding dimension mismatch: expected ${this.config.embeddingDim}, got ${embedding.length}`
        );
      }

      // Create vector with metadata
      const vector: Vector = {
        id: pattern.id,
        embedding: embedding,
        metadata: {
          type: pattern.type,
          domain: pattern.domain,
          data: JSON.stringify(pattern.data),
          confidence: pattern.confidence,
          usageCount: pattern.usageCount,
          successCount: pattern.successCount,
          createdAt: pattern.createdAt,
          lastUsed: pattern.lastUsed,
          ...pattern.metadata
        },
        timestamp: pattern.createdAt
      };

      // Insert into AgentDB
      const insertedId = this.db!.insert(vector);

      const duration = Date.now() - startTime;
      this.logger.info('Pattern stored successfully', {
        id: insertedId,
        type: pattern.type,
        domain: pattern.domain,
        duration: `${duration}ms`
      });

      return insertedId;
    } catch (error: any) {
      this.logger.error('Failed to store pattern', { error: error.message });
      throw new Error(`Failed to store pattern: ${error.message}`);
    }
  }

  /**
   * Retrieve a pattern by ID
   */
  async retrievePattern(id: string): Promise<QEPattern | null> {
    this.ensureInitialized();

    try {
      const vector = this.db!.get(id);

      if (!vector || !vector.metadata) {
        return null;
      }

      return this.vectorToPattern(vector);
    } catch (error: any) {
      this.logger.error('Failed to retrieve pattern', { id, error: error.message });
      throw new Error(`Failed to retrieve pattern: ${error.message}`);
    }
  }

  /**
   * Search for similar patterns using HNSW
   */
  async searchSimilar(
    queryEmbedding: number[],
    options: PatternSearchOptions = {}
  ): Promise<PatternSearchResult[]> {
    this.ensureInitialized();

    try {
      const startTime = Date.now();

      // Validate embedding dimension
      if (queryEmbedding.length !== this.config.embeddingDim) {
        throw new Error(
          `Query embedding dimension mismatch: expected ${this.config.embeddingDim}, got ${queryEmbedding.length}`
        );
      }

      const {
        k = 10,
        metric = 'cosine',
        threshold = 0.0,
        domain,
        type,
        minConfidence
      } = options;

      // Perform vector search
      const results = this.db!.search(queryEmbedding, k, metric, threshold);

      // Convert to pattern results and apply filters
      let patternResults = results
        .map(result => {
          const pattern = this.vectorToPattern({
            id: result.id,
            embedding: result.embedding,
            metadata: result.metadata
          });

          return {
            pattern,
            similarity: result.score,
            distance: 1 - result.score // Convert similarity to distance
          };
        })
        .filter(result => {
          // Apply domain filter
          if (domain && result.pattern.domain !== domain) {
            return false;
          }

          // Apply type filter
          if (type && result.pattern.type !== type) {
            return false;
          }

          // Apply confidence filter
          if (minConfidence !== undefined && result.pattern.confidence < minConfidence) {
            return false;
          }

          return true;
        });

      const duration = Date.now() - startTime;
      this.logger.info('Pattern search completed', {
        resultsCount: patternResults.length,
        duration: `${duration}ms`,
        filters: { domain, type, minConfidence }
      });

      return patternResults;
    } catch (error: any) {
      this.logger.error('Failed to search patterns', { error: error.message });
      throw new Error(`Failed to search patterns: ${error.message}`);
    }
  }

  /**
   * Store multiple patterns in a batch (high performance)
   */
  async storeBatch(
    patterns: QEPattern[],
    embeddings: number[][]
  ): Promise<BatchResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const insertedIds: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    try {
      // Validate inputs
      if (patterns.length !== embeddings.length) {
        throw new Error('Patterns and embeddings arrays must have the same length');
      }

      // Create vectors for batch insert
      const vectors: Vector[] = patterns.map((pattern, index) => {
        // Validate embedding dimension
        if (embeddings[index].length !== this.config.embeddingDim) {
          errors.push({
            index,
            error: `Embedding dimension mismatch: expected ${this.config.embeddingDim}, got ${embeddings[index].length}`
          });
          return null;
        }

        return {
          id: pattern.id,
          embedding: embeddings[index],
          metadata: {
            type: pattern.type,
            domain: pattern.domain,
            data: JSON.stringify(pattern.data),
            confidence: pattern.confidence,
            usageCount: pattern.usageCount,
            successCount: pattern.successCount,
            createdAt: pattern.createdAt,
            lastUsed: pattern.lastUsed,
            ...pattern.metadata
          },
          timestamp: pattern.createdAt
        };
      }).filter(v => v !== null) as Vector[];

      // Batch insert
      const ids = this.db!.insertBatch(vectors);
      insertedIds.push(...ids);

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      this.logger.info('Batch insert completed', {
        totalPatterns: patterns.length,
        inserted: insertedIds.length,
        errors: errors.length,
        duration: `${duration}ms`,
        throughput: `${(patterns.length / (duration / 1000)).toFixed(0)} patterns/sec`
      });

      return {
        success,
        insertedIds,
        errors,
        duration
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error('Batch insert failed', { error: error.message });

      return {
        success: false,
        insertedIds,
        errors: [{ index: -1, error: error.message }],
        duration
      };
    }
  }

  /**
   * Delete a pattern by ID
   */
  async deletePattern(id: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const deleted = this.db!.delete(id);

      if (deleted) {
        this.logger.info('Pattern deleted', { id });
      }

      return deleted;
    } catch (error: any) {
      this.logger.error('Failed to delete pattern', { id, error: error.message });
      throw new Error(`Failed to delete pattern: ${error.message}`);
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    count: number;
    size: number;
    cacheStats?: any;
    compressionStats?: any;
  }> {
    this.ensureInitialized();

    try {
      const stats = this.db!.stats();
      const cacheStats = this.db!.getCacheStats();
      const compressionStats = this.db!.getCompressionStats();

      return {
        count: stats.count,
        size: stats.size,
        cacheStats,
        compressionStats
      };
    } catch (error: any) {
      this.logger.error('Failed to get stats', { error: error.message });
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }

  /**
   * Clear query cache
   */
  clearCache(): void {
    this.ensureInitialized();

    try {
      this.db!.clearCache();
      this.logger.info('Cache cleared');
    } catch (error: any) {
      this.logger.error('Failed to clear cache', { error: error.message });
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (!this.isInitialized || !this.db) {
      return;
    }

    try {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      this.logger.info('AgentDBService closed');
    } catch (error: any) {
      throw new Error(`Failed to close AgentDBService: ${error.message}`);
    }
  }

  /**
   * Convert AgentDB vector to QE pattern
   */
  private vectorToPattern(vector: Vector): QEPattern {
    const metadata = vector.metadata || {};

    return {
      id: vector.id!,
      type: metadata.type || 'unknown',
      domain: metadata.domain || 'unknown',
      data: metadata.data ? JSON.parse(metadata.data) : {},
      confidence: metadata.confidence || 0,
      usageCount: metadata.usageCount || 0,
      successCount: metadata.successCount || 0,
      createdAt: metadata.createdAt || vector.timestamp || Date.now(),
      lastUsed: metadata.lastUsed || vector.timestamp || Date.now(),
      metadata: {
        ...metadata,
        // Remove duplicates
        type: undefined,
        domain: undefined,
        data: undefined,
        confidence: undefined,
        usageCount: undefined,
        successCount: undefined,
        createdAt: undefined,
        lastUsed: undefined
      }
    };
  }

  /**
   * Ensure service is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.db) {
      throw new Error('AgentDBService not initialized. Call initialize() first.');
    }
  }
}

/**
 * Create AgentDB service with default configuration
 */
export function createAgentDBService(
  overrides: Partial<AgentDBServiceConfig> = {}
): AgentDBService {
  const defaultConfig: AgentDBServiceConfig = {
    dbPath: '.agentic-qe/agentdb/patterns.db',
    embeddingDim: 384, // all-MiniLM-L6-v2 dimension
    enableHNSW: true,
    enableCache: true,
    cacheSize: 1000,
    cacheTTL: 3600000, // 1 hour
    enableQuantization: false, // Disabled by default for accuracy
    quantizationBits: 8
  };

  const config = { ...defaultConfig, ...overrides };
  return new AgentDBService(config);
}
