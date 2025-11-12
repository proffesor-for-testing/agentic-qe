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
 * @version 2.0.0 - Updated for agentdb@1.6.1
 */

import {
  createDatabase,
  WASMVectorSearch,
  HNSWIndex,
  type HNSWConfig,
  type HNSWSearchResult
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

  /** Distance metric: 'cosine', 'l2' (euclidean), 'ip' (inner product) */
  metric?: 'cosine' | 'l2' | 'ip';

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
 * AgentDB Service - Core implementation (v2.0.0)
 * Updated for agentdb@1.6.1 with WASMVectorSearch and HNSWIndex
 */
export class AgentDBService {
  private db: any = null; // Database instance from createDatabase()
  private wasmSearch: WASMVectorSearch | null = null;
  private hnswIndex: HNSWIndex | null = null;
  private config: AgentDBServiceConfig;
  private isInitialized: boolean = false;
  private logger: Console;
  private queryCache: Map<string, { result: PatternSearchResult[]; timestamp: number }> = new Map();

  constructor(config: AgentDBServiceConfig) {
    this.config = {
      ...config,
      hnswConfig: config.hnswConfig || {
        M: 16,
        efConstruction: 200,
        efSearch: 100,
        metric: 'cosine' as const,
        dimension: config.embeddingDim,
        maxElements: 100000,
        persistIndex: true,
        rebuildThreshold: 0.1
      },
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

      // Create database with agentdb@1.6.1 API
      this.db = await createDatabase(this.config.dbPath);

      // Create patterns table
      await this.createPatternsTable();

      // Initialize WASM vector search
      this.wasmSearch = new WASMVectorSearch(this.db, {
        enableWASM: true,
        enableSIMD: true,
        batchSize: 100,
        indexThreshold: 1000
      });

      // Initialize HNSW index if enabled
      if (this.config.enableHNSW && this.config.hnswConfig) {
        this.hnswIndex = new HNSWIndex(this.db, this.config.hnswConfig);
        await this.hnswIndex.buildIndex('patterns');
        this.logger.log('[AgentDBService] HNSW index built successfully');
      }

      this.isInitialized = true;
      this.logger.log('[AgentDBService] Initialized successfully', {
        dbPath: this.config.dbPath,
        hnswEnabled: this.config.enableHNSW,
        embeddingDim: this.config.embeddingDim
      });
    } catch (error) {
      this.logger.error('[AgentDBService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create patterns table with vector embeddings
   */
  private async createPatternsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        domain TEXT NOT NULL,
        data TEXT NOT NULL,
        confidence REAL NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        embedding BLOB,
        created_at INTEGER NOT NULL,
        last_used INTEGER NOT NULL,
        metadata TEXT
      )
    `;

    await this.db.exec(sql);

    // Create indexes for fast filtering
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(type)');
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_patterns_domain ON patterns(domain)');
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence)');
  }

  /**
   * Store a pattern with vector embedding
   */
  async storePattern(pattern: QEPattern, embedding: Float32Array): Promise<void> {
    this.ensureInitialized();

    try {
      const sql = `
        INSERT OR REPLACE INTO patterns
        (id, type, domain, data, confidence, usage_count, success_count, embedding, created_at, last_used, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db.run(sql, [
        pattern.id,
        pattern.type,
        pattern.domain,
        JSON.stringify(pattern.data),
        pattern.confidence,
        pattern.usageCount,
        pattern.successCount,
        Buffer.from(embedding.buffer),
        pattern.createdAt,
        pattern.lastUsed,
        pattern.metadata ? JSON.stringify(pattern.metadata) : null
      ]);

      // Add to HNSW index if enabled
      if (this.hnswIndex && this.hnswIndex.isReady()) {
        // Get the row ID for the pattern
        const result = await this.db.get('SELECT rowid FROM patterns WHERE id = ?', [pattern.id]);
        if (result) {
          this.hnswIndex.addVector(result.rowid, embedding);
        }
      }

      // Clear cache
      if (this.config.enableCache) {
        this.queryCache.clear();
      }
    } catch (error) {
      this.logger.error('[AgentDBService] Failed to store pattern:', error);
      throw error;
    }
  }

  /**
   * Batch store patterns for better performance
   */
  async storePatternsInBatch(patterns: Array<{ pattern: QEPattern; embedding: Float32Array }>): Promise<BatchResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const insertedIds: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    try {
      // Begin transaction
      await this.db.exec('BEGIN TRANSACTION');

      for (let i = 0; i < patterns.length; i++) {
        try {
          await this.storePattern(patterns[i].pattern, patterns[i].embedding);
          insertedIds.push(patterns[i].pattern.id);
        } catch (error) {
          errors.push({
            index: i,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Commit transaction
      await this.db.exec('COMMIT');

      // Rebuild HNSW index if needed
      if (this.hnswIndex && this.hnswIndex.needsRebuild()) {
        await this.hnswIndex.buildIndex('patterns');
      }

      return {
        success: errors.length === 0,
        insertedIds,
        errors,
        duration: Date.now() - startTime
      };
    } catch (error) {
      // Rollback on error
      await this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Search for similar patterns using HNSW or WASM vector search
   */
  async searchPatterns(queryEmbedding: Float32Array, options: PatternSearchOptions = {}): Promise<PatternSearchResult[]> {
    this.ensureInitialized();

    const {
      k = 10,
      threshold = 0.7,
      metric = 'cosine',
      domain,
      type,
      minConfidence
    } = options;

    // Check cache
    const cacheKey = `${queryEmbedding.toString()}-${k}-${threshold}-${domain}-${type}-${minConfidence}`;
    if (this.config.enableCache) {
      const cached = this.queryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < (this.config.cacheTTL || 3600000)) {
        return cached.result;
      }
    }

    try {
      let searchResults: HNSWSearchResult[];

      // Use HNSW index if available and built
      if (this.hnswIndex && this.hnswIndex.isReady()) {
        searchResults = await this.hnswIndex.search(queryEmbedding, k, {
          threshold,
          filters: this.buildFilters(domain, type, minConfidence)
        });
      } else if (this.wasmSearch) {
        // Fallback to WASM vector search
        searchResults = await this.wasmSearch.findKNN(queryEmbedding, k, 'patterns', {
          threshold,
          filters: this.buildFilters(domain, type, minConfidence)
        });
      } else {
        throw new Error('No search backend available');
      }

      // Convert search results to PatternSearchResult
      const results: PatternSearchResult[] = [];
      for (const result of searchResults) {
        const pattern = await this.getPatternById(result.id);
        if (pattern) {
          results.push({
            pattern,
            similarity: result.similarity,
            distance: result.distance
          });
        }
      }

      // Cache results
      if (this.config.enableCache) {
        this.queryCache.set(cacheKey, {
          result: results,
          timestamp: Date.now()
        });

        // Evict old entries if cache is full
        if (this.queryCache.size > (this.config.cacheSize || 1000)) {
          const firstKey = this.queryCache.keys().next().value;
          if (firstKey !== undefined) {
            this.queryCache.delete(firstKey);
          }
        }
      }

      return results;
    } catch (error) {
      this.logger.error('[AgentDBService] Pattern search failed:', error);
      throw error;
    }
  }

  /**
   * Get pattern by ID
   */
  private async getPatternById(rowId: number): Promise<QEPattern | null> {
    const sql = 'SELECT * FROM patterns WHERE rowid = ?';
    const row = await this.db.get(sql, [rowId]);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      type: row.type,
      domain: row.domain,
      data: JSON.parse(row.data),
      confidence: row.confidence,
      usageCount: row.usage_count,
      successCount: row.success_count,
      createdAt: row.created_at,
      lastUsed: row.last_used,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  /**
   * Build SQL filters for pattern search
   */
  private buildFilters(domain?: string, type?: string, minConfidence?: number): Record<string, any> {
    const filters: Record<string, any> = {};

    if (domain) filters.domain = domain;
    if (type) filters.type = type;
    if (minConfidence !== undefined) filters.confidence_gte = minConfidence;

    return filters;
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<{
    totalPatterns: number;
    hnswEnabled: boolean;
    hnswStats?: any;
    wasmStats?: any;
    cacheSize: number;
  }> {
    this.ensureInitialized();

    const countResult = await this.db.get('SELECT COUNT(*) as count FROM patterns');
    const totalPatterns = countResult?.count || 0;

    return {
      totalPatterns,
      hnswEnabled: this.config.enableHNSW,
      hnswStats: this.hnswIndex?.getStats(),
      wasmStats: this.wasmSearch?.getStats(),
      cacheSize: this.queryCache.size
    };
  }

  /**
   * Clear query cache
   */
  clearCache(): void {
    this.queryCache.clear();
  }

  /**
   * Close database and cleanup
   */
  async close(): Promise<void> {
    if (this.hnswIndex) {
      this.hnswIndex.clear();
    }
    if (this.wasmSearch) {
      this.wasmSearch.clearIndex();
    }
    if (this.db) {
      await this.db.close();
    }
    this.isInitialized = false;
  }

  /**
   * Ensure service is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('AgentDBService not initialized. Call initialize() first.');
    }
  }
}

/**
 * Factory function to create and initialize AgentDBService
 */
export async function createAgentDBService(config: AgentDBServiceConfig): Promise<AgentDBService> {
  const service = new AgentDBService(config);
  await service.initialize();
  return service;
}
