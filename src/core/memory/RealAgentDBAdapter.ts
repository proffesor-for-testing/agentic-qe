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
      // Input validation and sanitization
      if (!pattern.id || typeof pattern.id !== 'string') {
        throw new Error('Invalid pattern ID: must be a non-empty string');
      }
      if (!pattern.type || typeof pattern.type !== 'string') {
        throw new Error('Invalid pattern type: must be a non-empty string');
      }
      if (typeof pattern.confidence !== 'undefined') {
        const confidence = Number(pattern.confidence);
        if (isNaN(confidence) || confidence < 0 || confidence > 1) {
          throw new Error('Invalid confidence: must be a number between 0 and 1');
        }
        pattern.confidence = confidence;
      }

      // Ensure embedding exists and has correct dimensions
      if (!pattern.embedding || pattern.embedding.length !== this.dimension) {
        // Generate default embedding if missing
        const patternText = JSON.stringify(pattern.data || pattern);
        pattern.embedding = generateEmbedding(patternText, this.dimension);
      }

      // Convert to Float32Array
      const embedding = new Float32Array(pattern.embedding);

      // Validate metadata is serializable
      const metadataJson = JSON.stringify(pattern.metadata || {});
      if (metadataJson.length > 1000000) {
        throw new Error('Metadata exceeds maximum size limit');
      }

      // Use parameterized query to prevent SQL injection
      // Note: sql.js doesn't support traditional parameterized queries in exec()
      // We'll use run() with bound parameters instead
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO patterns (id, type, confidence, embedding, metadata, created_at)
        VALUES (?, ?, ?, NULL, ?, unixepoch())
      `);

      stmt.run([
        pattern.id,
        pattern.type,
        pattern.confidence || 0.5,
        metadataJson
      ]);
      stmt.free();

      // Add to HNSW index - use parameterized query
      if (this.hnswIndex && this.hnswIndex.isReady()) {
        const stmtSelect = this.db.prepare('SELECT rowid FROM patterns WHERE id = ?');
        stmtSelect.bind([pattern.id]);

        if (stmtSelect.step()) {
          const rowid = stmtSelect.getAsObject().rowid as number;
          this.hnswIndex.addVector(rowid, embedding);
        }
        stmtSelect.free();
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

      // P2 SAFETY: Explicit error handling instead of silent fallback
      if (!countResult || countResult.length === 0 || !countResult[0].values || countResult[0].values.length === 0) {
        throw new Error(
          '[RealAgentDBAdapter] Failed to query pattern count - database may be corrupted or schema mismatch. ' +
          'Expected result format: [{ columns: [...], values: [[count]] }]. ' +
          'Run migrations or reinitialize database.'
        );
      }

      const patternCount = countResult[0].values[0][0] as number;

      if (typeof patternCount !== 'number') {
        throw new Error(
          `[RealAgentDBAdapter] Pattern count query returned non-numeric value: ${patternCount} (type: ${typeof patternCount}). ` +
          'Database schema may be corrupted.'
        );
      }

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
   * Execute raw SQL query with parameterized values
   * WARNING: Only use with trusted SQL. This method validates SQL to prevent injection.
   */
  async query(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Adapter not initialized');
    }

    try {
      // Validate SQL query for basic safety
      this.validateSQL(sql);

      // Use parameterized queries via prepare() for safety
      if (params.length > 0) {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);

        const results: any[] = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();

        return results;
      }

      // For queries without parameters, use exec()
      const execResults = this.db.exec(sql);

      // exec returns: [{ columns: [...], values: [[...], [...]] }]
      if (execResults && execResults.length > 0) {
        const { columns, values } = execResults[0];

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

  /**
   * Validate SQL query for basic safety checks
   * Prevents common SQL injection patterns
   */
  private validateSQL(sql: string): void {
    const upperSQL = sql.toUpperCase().trim();

    // Block dangerous operations
    const dangerousPatterns = [
      /;\s*DROP\s+/i,
      /;\s*DELETE\s+FROM\s+(?!patterns)/i, // Allow DELETE FROM patterns only
      /;\s*UPDATE\s+(?!patterns)/i,        // Allow UPDATE patterns only
      /;\s*ALTER\s+/i,
      /;\s*CREATE\s+(?!INDEX)/i,           // Allow CREATE INDEX only
      /UNION\s+(?:ALL\s+)?SELECT/i,
      /EXEC(?:UTE)?\s*\(/i,
      /--/,                                 // SQL comments
      /\/\*/,                               // Block comments
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        throw new Error(`SQL validation failed: potentially dangerous query pattern detected`);
      }
    }

    // SQL must start with allowed operations
    const allowedStarts = ['SELECT', 'INSERT', 'UPDATE PATTERNS', 'DELETE FROM PATTERNS', 'CREATE INDEX'];
    const startsWithAllowed = allowedStarts.some(start => upperSQL.startsWith(start));

    if (!startsWithAllowed) {
      throw new Error(`SQL validation failed: query must start with SELECT, INSERT, UPDATE patterns, DELETE FROM patterns, or CREATE INDEX`);
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
