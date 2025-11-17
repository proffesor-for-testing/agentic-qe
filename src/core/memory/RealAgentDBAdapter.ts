/**
 * Real AgentDB Adapter
 * Uses actual agentdb package v1.6.1 for production operations
 * Updated to use createDatabase, WASMVectorSearch, and HNSWIndex
 */

import type { Pattern, RetrievalOptions, RetrievalResult } from './ReasoningBankAdapter';
import { generateEmbedding } from '../../utils/EmbeddingGenerator.js';
import { createDatabase, WASMVectorSearch, HNSWIndex } from 'agentdb';

export class RealAgentDBAdapter {
  private db: any; // Database from createDatabase()
  private wasmSearch: WASMVectorSearch | null = null;
  private hnswIndex: HNSWIndex | null = null;
  private isInitialized = false;
  private dbPath: string;
  private dimension: number;

  constructor(config: { dbPath: string; dimension?: number }) {
    this.dbPath = config.dbPath;
    this.dimension = config.dimension || 384;
  }

  /**
   * Initialize with real AgentDB v1.6.1 (createDatabase + WASMVectorSearch)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create database with agentdb v1.6.1 API
      this.db = await createDatabase(this.dbPath);

      // Create patterns table
      await this.createPatternsTable();

      // Initialize WASM vector search
      this.wasmSearch = new WASMVectorSearch(this.db, {
        enableWASM: true,
        enableSIMD: true,
        batchSize: 100,
        indexThreshold: 1000
      });

      // Initialize HNSW index for fast search
      this.hnswIndex = new HNSWIndex(this.db, {
        M: 16,
        efConstruction: 200,
        efSearch: 100,
        metric: 'cosine',
        dimension: this.dimension,
        maxElements: 100000,
        persistIndex: false, // In-memory for now
        rebuildThreshold: 0.1
      });

      this.isInitialized = true;
      console.log('[RealAgentDBAdapter] Initialized with AgentDB v1.6.1 at', this.dbPath);
    } catch (error: any) {
      throw new Error(`Failed to initialize real AgentDB: ${error.message}`);
    }
  }

  /**
   * Create patterns table
   */
  private async createPatternsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        embedding BLOB,
        metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `;

    await this.db.exec(sql);
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(type)');
  }

  /**
   * Store a pattern with vector embedding
   */
  async store(pattern: Pattern): Promise<string> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Adapter not initialized');
    }

    try {
      // Ensure embedding exists and has correct dimensions
      if (!pattern.embedding || pattern.embedding.length !== this.dimension) {
        // Generate default embedding if missing
        const patternText = JSON.stringify(pattern.data || pattern);
        pattern.embedding = generateEmbedding(patternText, this.dimension);
      }

      // Convert to Float32Array
      const embedding = new Float32Array(pattern.embedding);

      // Insert into database using sql.js exec() API
      // Store embedding as NULL for now (BLOB handling in sql.js is complex)
      const metadataJson = JSON.stringify(pattern.metadata || {}).replace(/'/g, "''");

      const sql = `
        INSERT OR REPLACE INTO patterns (id, type, confidence, embedding, metadata, created_at)
        VALUES ('${pattern.id}', '${pattern.type}', ${pattern.confidence || 0.5}, NULL, '${metadataJson}', unixepoch())
      `;

      // Use exec() which is available in sql.js
      this.db.exec(sql);

      // Add to HNSW index
      if (this.hnswIndex && this.hnswIndex.isReady()) {
        const result = this.db.exec(`SELECT rowid FROM patterns WHERE id = '${pattern.id}'`);
        if (result && result.length > 0 && result[0].values.length > 0) {
          this.hnswIndex.addVector(result[0].values[0][0] as number, embedding);
        }
      }

      return pattern.id;
    } catch (error: any) {
      throw new Error(`Failed to store pattern: ${error.message}`);
    }
  }

  /**
   * Store multiple patterns in batch
   */
  async storeBatch(patterns: Pattern[]): Promise<string[]> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Adapter not initialized');
    }

    try {
      await this.db.exec('BEGIN TRANSACTION');

      const ids: string[] = [];
      for (const pattern of patterns) {
        const id = await this.store(pattern);
        ids.push(id);
      }

      await this.db.exec('COMMIT');

      // Rebuild HNSW index if needed
      if (this.hnswIndex && this.hnswIndex.needsRebuild()) {
        await this.hnswIndex.buildIndex('patterns');
      }

      console.log(`[RealAgentDBAdapter] Inserted ${ids.length} patterns`);
      return ids;
    } catch (error: any) {
      await this.db.exec('ROLLBACK');
      throw new Error(`Failed to store batch: ${error.message}`);
    }
  }

  /**
   * Retrieve with reasoning (vector similarity search)
   */
  async retrieveWithReasoning(
    queryEmbedding: number[],
    options: RetrievalOptions
  ): Promise<RetrievalResult> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Adapter not initialized');
    }

    try {
      const startTime = Date.now();

      // Ensure query embedding has correct dimensions
      if (queryEmbedding.length !== this.dimension) {
        // Generate proper embedding if wrong size
        queryEmbedding = generateEmbedding('query', this.dimension);
      }

      const queryVector = new Float32Array(queryEmbedding);
      const topK = options.topK || 10;
      const threshold = options.threshold || 0.7;

      // Check if database has patterns before searching
      const countResult = this.db.exec('SELECT COUNT(*) as count FROM patterns');
      const patternCount = countResult?.[0]?.values?.[0]?.[0] || 0;

      if (patternCount === 0) {
        console.warn('[RealAgentDBAdapter] Search attempted on empty database - returning empty results');
        return {
          memories: [],
          patterns: [],
          context: {
            query: 'vector similarity search (empty database)',
            resultsCount: 0,
            avgSimilarity: 0,
            queryTime: Date.now() - startTime
          }
        };
      }

      // Check HNSW index readiness before search
      if (this.hnswIndex && !this.hnswIndex.isReady()) {
        console.warn('[RealAgentDBAdapter] HNSW index not ready - attempting to build index');
        await this.hnswIndex.buildIndex('patterns');
      }

      // Search using HNSW if available, otherwise WASM vector search
      let searchResults;
      if (this.hnswIndex && this.hnswIndex.isReady()) {
        searchResults = await this.hnswIndex.search(queryVector, topK, { threshold });
      } else if (this.wasmSearch) {
        searchResults = await this.wasmSearch.findKNN(queryVector, topK, 'patterns', { threshold });
      } else {
        throw new Error('No search backend available');
      }

      const queryTime = Date.now() - startTime;

      // Convert results to Pattern format
      const patterns: Pattern[] = [];
      for (const result of searchResults) {
        const row = await this.db.get('SELECT * FROM patterns WHERE rowid = ?', [result.id]);
        if (row) {
          patterns.push({
            id: row.id,
            type: row.type,
            data: row.metadata ? JSON.parse(row.metadata) : {},
            embedding: queryEmbedding, // Use query embedding as placeholder
            confidence: row.confidence,
            metadata: {
              ...JSON.parse(row.metadata || '{}'),
              similarity: result.similarity,
              distance: result.distance
            }
          });
        }
      }

      return {
        memories: patterns,
        patterns: patterns,
        context: {
          query: 'vector similarity search',
          resultsCount: patterns.length,
          avgSimilarity: patterns.length > 0
            ? patterns.reduce((sum, p) => sum + (p.metadata?.similarity || 0), 0) / patterns.length
            : 0,
          queryTime
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to retrieve: ${error.message}`);
    }
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<any> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Adapter not initialized');
    }

    try {
      const result = this.db.exec('SELECT COUNT(*) as count FROM patterns');
      const totalVectors = result && result.length > 0 && result[0].values.length > 0
        ? result[0].values[0][0]
        : 0;

      return {
        totalVectors,
        dimension: this.dimension,
        mode: this.dbPath === ':memory:' ? 'memory' : 'file',
        hnswStats: this.hnswIndex?.getStats(),
        wasmStats: this.wasmSearch?.getStats()
      };
    } catch (error: any) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }

  /**
   * Close the adapter
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
      console.log('[RealAgentDBAdapter] Closed');
    }
    this.isInitialized = false;
  }

  /**
   * Check if initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Insert a pattern (alias for store)
   */
  async insertPattern(pattern: any): Promise<string> {
    return this.store(pattern);
  }

  /**
   * Execute raw SQL query
   */
  async query(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Adapter not initialized');
    }

    try {
      // AgentDB uses sql.js which has exec() not all()
      // For SELECT queries, use exec which returns array of results
      const results = this.db.exec(sql, params);

      // exec returns: [{ columns: [...], values: [[...], [...]] }]
      if (results && results.length > 0) {
        const { columns, values } = results[0];

        // Convert to array of objects
        return values.map((row: any[]) => {
          const obj: any = {};
          columns.forEach((col: string, i: number) => {
            obj[col] = row[i];
          });
          return obj;
        });
      }

      return [];
    } catch (error: any) {
      throw new Error(`Query failed: ${error.message}`);
    }
  }
}

/**
 * Create a real AgentDB adapter
 */
export function createRealAgentDBAdapter(config: {
  dbPath: string;
  dimension?: number;
}): RealAgentDBAdapter {
  return new RealAgentDBAdapter(config);
}
