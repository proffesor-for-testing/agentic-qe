/**
 * Real AgentDB Adapter
 * Uses actual agentdb package v1.6.1 for production operations
 * Updated to use createDatabase, WASMVectorSearch, and HNSWIndex
 */

import type { Pattern, RetrievalOptions, RetrievalResult } from './ReasoningBankAdapter';
import { generateEmbedding } from '../../utils/EmbeddingGenerator.js';
import { createDatabase, WASMVectorSearch, HNSWIndex, ReasoningBank, EmbeddingService } from 'agentdb';
import { getErrorMessage } from '../../utils/ErrorUtils';

// Type for AgentDB's SqlJs prepared statement
interface SqlJsStatement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): void;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  finalize?(): void;
  free?(): void;
}

// Type for AgentDB's SqlJs database interface
interface SqlJsDatabase {
  prepare(sql: string): SqlJsStatement;
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  run(sql: string, ...params: unknown[]): void;
  get(sql: string, ...params: unknown[]): Record<string, unknown> | undefined;
  close(): void;
}

export class RealAgentDBAdapter {
  private db: SqlJsDatabase | null = null;
  private wasmSearch: WASMVectorSearch | null = null;
  private hnswIndex: HNSWIndex | null = null;
  private reasoningBank: ReasoningBank | null = null;
  private embedder: EmbeddingService | null = null;
  private isInitialized = false;
  private dbPath: string;
  private dimension: number;

  constructor(config: { dbPath: string; dimension?: number }) {
    this.dbPath = config.dbPath;
    this.dimension = config.dimension || 384;
  }

  /**
   * Get database instance, throwing if not initialized
   */
  private getDb(): SqlJsDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Initialize with real AgentDB v1.6.1 (createDatabase + WASMVectorSearch + ReasoningBank)
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

      // Create QE-specific tables for learning system
      await this.createQELearningTables();

      // Initialize EmbeddingService for ReasoningBank
      this.embedder = new EmbeddingService({
        model: 'Xenova/all-MiniLM-L6-v2',
        dimension: this.dimension,
        provider: 'local'
      });
      await this.embedder.initialize();

      // Initialize ReasoningBank (creates 16 learning tables)
      this.reasoningBank = new ReasoningBank(this.db, this.embedder);
      console.log('[RealAgentDBAdapter] ReasoningBank initialized with 16 learning tables');

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
      console.log('[RealAgentDBAdapter] Initialized with AgentDB v1.6.1 + ReasoningBank at', this.dbPath);
    } catch (error: unknown) {
      throw new Error(`Failed to initialize real AgentDB: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Create patterns table (base AgentDB table for vector embeddings)
   * Note: pattern_id column is required for agentdb's HNSWIndex compatibility
   */
  private async createPatternsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        pattern_id TEXT GENERATED ALWAYS AS (id) STORED,
        type TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        embedding BLOB,
        metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `;

    this.getDb().exec(sql);
    this.getDb().exec('CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(type)');
    this.getDb().exec('CREATE INDEX IF NOT EXISTS idx_patterns_pattern_id ON patterns(pattern_id)');
  }

  /**
   * Create QE Learning System Tables
   *
   * Creates the comprehensive schema for the Agentic QE Fleet learning system.
   * This schema supports:
   * - Test pattern storage and deduplication
   * - Cross-project pattern usage tracking
   * - Framework-agnostic pattern sharing
   * - Pattern similarity indexing
   * - Full-text search capabilities
   *
   * Tables Created:
   * 1. test_patterns - Core pattern storage with code signatures
   * 2. pattern_usage - Track pattern usage and quality metrics per project
   * 3. cross_project_mappings - Enable pattern sharing across frameworks
   * 4. pattern_similarity_index - Pre-computed similarity scores
   * 5. pattern_fts - Full-text search index
   * 6. schema_version - Track schema migrations
   *
   * @throws {Error} If table creation fails
   * @private
   */
  private async createQELearningTables(): Promise<void> {
    try {
      // Enable WAL mode for better concurrent access
      this.getDb().exec('PRAGMA journal_mode = WAL');
      this.getDb().exec('PRAGMA synchronous = NORMAL');

      // 1. Core Pattern Storage
      await this.createTestPatternsTable();

      // 2. Pattern Usage Tracking
      await this.createPatternUsageTable();

      // 3. Cross-Project Pattern Sharing
      await this.createCrossProjectMappingsTable();

      // 4. Pattern Similarity Index
      await this.createPatternSimilarityIndexTable();

      // 5. Full-Text Search
      await this.createPatternFTSTable();

      // 6. Schema Version Tracking
      await this.createSchemaVersionTable();

      console.log('[RealAgentDBAdapter] QE Learning tables initialized successfully');
    } catch (error: unknown) {
      throw new Error(`Failed to create QE learning tables: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Create test_patterns table - Core pattern storage
   *
   * Stores test patterns with code signatures for deduplication.
   * Supports multiple testing frameworks and pattern types.
   */
  private async createTestPatternsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS test_patterns (
        id TEXT PRIMARY KEY NOT NULL,
        pattern_type TEXT NOT NULL,
        framework TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'typescript',
        code_signature_hash TEXT NOT NULL,
        code_signature TEXT NOT NULL,
        test_template TEXT NOT NULL,
        metadata TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        CHECK(pattern_type IN ('edge-case', 'integration', 'boundary', 'error-handling', 'unit', 'e2e', 'performance', 'security')),
        CHECK(framework IN ('jest', 'mocha', 'cypress', 'vitest', 'playwright', 'ava', 'jasmine'))
      )
    `;

    this.getDb().exec(sql);

    // Create indexes for efficient querying
    this.getDb().exec('CREATE INDEX IF NOT EXISTS idx_patterns_framework_type ON test_patterns(framework, pattern_type)');
    this.getDb().exec('CREATE INDEX IF NOT EXISTS idx_patterns_signature_hash ON test_patterns(code_signature_hash)');
    this.getDb().exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_dedup ON test_patterns(code_signature_hash, framework)');
  }

  /**
   * Create pattern_usage table - Track pattern usage and quality metrics
   *
   * Tracks how patterns are used across different projects with
   * success rates, execution time, coverage gains, and quality scores.
   */
  private async createPatternUsageTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS pattern_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        avg_execution_time REAL NOT NULL DEFAULT 0.0,
        avg_coverage_gain REAL NOT NULL DEFAULT 0.0,
        flaky_count INTEGER NOT NULL DEFAULT 0,
        quality_score REAL NOT NULL DEFAULT 0.0,
        first_used INTEGER NOT NULL DEFAULT (unixepoch()),
        last_used INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
        UNIQUE(pattern_id, project_id)
      )
    `;

    await this.getDb().exec(sql);

    // Create indexes for efficient querying
    await this.getDb().exec('CREATE INDEX IF NOT EXISTS idx_usage_pattern ON pattern_usage(pattern_id)');
    await this.getDb().exec('CREATE INDEX IF NOT EXISTS idx_usage_quality ON pattern_usage(quality_score DESC)');
  }

  /**
   * Create cross_project_mappings table - Enable pattern sharing across frameworks
   *
   * Stores transformation rules for adapting patterns between different
   * testing frameworks (e.g., Jest to Vitest, Cypress to Playwright).
   */
  private async createCrossProjectMappingsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS cross_project_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        source_framework TEXT NOT NULL,
        target_framework TEXT NOT NULL,
        transformation_rules TEXT NOT NULL,
        compatibility_score REAL NOT NULL DEFAULT 1.0,
        project_count INTEGER NOT NULL DEFAULT 0,
        success_rate REAL NOT NULL DEFAULT 0.0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
        UNIQUE(pattern_id, source_framework, target_framework)
      )
    `;

    await this.getDb().exec(sql);
  }

  /**
   * Create pattern_similarity_index table - Pre-computed similarity scores
   *
   * Stores pre-computed similarity scores between patterns to enable
   * fast similarity-based pattern retrieval without runtime computation.
   */
  private async createPatternSimilarityIndexTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS pattern_similarity_index (
        pattern_a TEXT NOT NULL,
        pattern_b TEXT NOT NULL,
        similarity_score REAL NOT NULL,
        structure_similarity REAL NOT NULL,
        identifier_similarity REAL NOT NULL,
        metadata_similarity REAL NOT NULL,
        algorithm TEXT NOT NULL DEFAULT 'hybrid-tfidf',
        last_computed INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (pattern_a, pattern_b),
        FOREIGN KEY (pattern_a) REFERENCES test_patterns(id) ON DELETE CASCADE,
        FOREIGN KEY (pattern_b) REFERENCES test_patterns(id) ON DELETE CASCADE
      )
    `;

    await this.getDb().exec(sql);

    // Create index for efficient similarity queries
    await this.getDb().exec('CREATE INDEX IF NOT EXISTS idx_similarity_score ON pattern_similarity_index(similarity_score DESC)');
  }

  /**
   * Create pattern_fts table - Full-text search capabilities
   *
   * FTS5 virtual table for fast full-text search across pattern names,
   * descriptions, tags, and other textual content.
   *
   * Note: FTS5 is not available in all SQLite builds (e.g., sql.js WASM).
   * This method gracefully handles missing FTS5 support.
   */
  private async createPatternFTSTable(): Promise<void> {
    try {
      const sql = `
        CREATE VIRTUAL TABLE IF NOT EXISTS pattern_fts USING fts5(
          pattern_id UNINDEXED,
          pattern_name,
          description,
          tags,
          framework,
          pattern_type,
          content='',
          tokenize='porter ascii'
        )
      `;

      await this.getDb().exec(sql);
      console.log('[RealAgentDBAdapter] FTS5 full-text search enabled');
    } catch (error: unknown) {
      // FTS5 not available in this SQLite build (e.g., sql.js WASM)
      // Fall back to creating a regular table for pattern metadata
      if (getErrorMessage(error)?.includes('no such module: fts5')) {
        console.warn('[RealAgentDBAdapter] FTS5 not available, using regular table for pattern search');

        const fallbackSql = `
          CREATE TABLE IF NOT EXISTS pattern_fts (
            pattern_id TEXT PRIMARY KEY,
            pattern_name TEXT,
            description TEXT,
            tags TEXT,
            framework TEXT,
            pattern_type TEXT
          )
        `;

        await this.getDb().exec(fallbackSql);

        // Create indexes for text search fallback
        await this.getDb().exec('CREATE INDEX IF NOT EXISTS idx_fts_pattern_name ON pattern_fts(pattern_name)');
        await this.getDb().exec('CREATE INDEX IF NOT EXISTS idx_fts_framework ON pattern_fts(framework)');
        await this.getDb().exec('CREATE INDEX IF NOT EXISTS idx_fts_pattern_type ON pattern_fts(pattern_type)');
      } else {
        throw error;
      }
    }
  }

  /**
   * Create schema_version table - Track schema migrations
   *
   * Maintains a record of applied schema versions to support
   * safe database migrations and version compatibility checks.
   */
  private async createSchemaVersionTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS schema_version (
        version TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL DEFAULT (unixepoch()),
        description TEXT
      )
    `;

    await this.getDb().exec(sql);

    // Insert initial schema version
    const insertVersion = `
      INSERT OR IGNORE INTO schema_version (version, description)
      VALUES ('1.1.0', 'Initial QE ReasoningBank schema')
    `;

    await this.getDb().exec(insertVersion);
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
      // Convert embedding to buffer for storage
      const embeddingBuffer = Buffer.from(embedding.buffer);

      const stmt = this.getDb().prepare(`
        INSERT OR REPLACE INTO patterns (id, type, confidence, embedding, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, unixepoch())
      `);

      // AgentDB's SqlJsDatabase uses spread params, not array
      stmt.run(
        pattern.id,
        pattern.type,
        pattern.confidence || 0.5,
        embeddingBuffer,
        metadataJson
      );
      if (typeof stmt.free === 'function') stmt.free();
      else if (typeof stmt.finalize === 'function') stmt.finalize();

      // Add to HNSW index - use parameterized query
      // AgentDB's SqlJsDatabase uses get() with spread params
      if (this.hnswIndex && this.hnswIndex.isReady()) {
        const stmtSelect = this.getDb().prepare('SELECT rowid FROM patterns WHERE id = ?');
        const row = stmtSelect.get(pattern.id);

        if (row && row.rowid) {
          this.hnswIndex.addVector(row.rowid as number, embedding);
        }
        if (typeof stmtSelect.finalize === 'function') stmtSelect.finalize();
      }

      return pattern.id;
    } catch (error: unknown) {
      throw new Error(`Failed to store pattern: ${getErrorMessage(error)}`);
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
      await this.getDb().exec('BEGIN TRANSACTION');

      const ids: string[] = [];
      for (const pattern of patterns) {
        const id = await this.store(pattern);
        ids.push(id);
      }

      await this.getDb().exec('COMMIT');

      // Rebuild HNSW index if needed
      if (this.hnswIndex && this.hnswIndex.needsRebuild()) {
        await this.hnswIndex.buildIndex('patterns');
      }

      console.log(`[RealAgentDBAdapter] Inserted ${ids.length} patterns`);
      return ids;
    } catch (error: unknown) {
      await this.getDb().exec('ROLLBACK');
      throw new Error(`Failed to store batch: ${getErrorMessage(error)}`);
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
      const countResult = this.getDb().exec('SELECT COUNT(*) as count FROM patterns');

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
        const row = this.getDb().get('SELECT * FROM patterns WHERE rowid = ?', result.id);
        if (row) {
          // Decode embedding from stored buffer if available
          let storedEmbedding = queryEmbedding;
          const embedding = row.embedding as Uint8Array | undefined;
          if (embedding && embedding instanceof Uint8Array) {
            storedEmbedding = Array.from(new Float32Array(embedding.buffer));
          }

          const id = row.id as string;
          const type = row.type as string;
          const metadata = row.metadata as string | undefined;
          const confidence = row.confidence as number | undefined;

          patterns.push({
            id,
            type,
            data: metadata ? JSON.parse(metadata) : {},
            embedding: storedEmbedding,
            confidence,
            metadata: {
              ...JSON.parse(metadata || '{}'),
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
    } catch (error: unknown) {
      throw new Error(`Failed to retrieve: ${getErrorMessage(error)}`);
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
      const result = this.getDb().exec('SELECT COUNT(*) as count FROM patterns');
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
    } catch (error: unknown) {
      throw new Error(`Failed to get stats: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Close the adapter
   */
  async close(): Promise<void> {
    if (this.reasoningBank) {
      this.reasoningBank.clearCache();
    }
    if (this.embedder) {
      this.embedder.clearCache();
    }
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
   * Get ReasoningBank instance for advanced pattern operations
   */
  getReasoningBank(): ReasoningBank | null {
    return this.reasoningBank;
  }

  /**
   * Insert a pattern (alias for store)
   */
  async insertPattern(pattern: Pattern): Promise<string> {
    return this.store(pattern);
  }

  /**
   * Execute raw SQL query with parameterized values
   * WARNING: Only use with trusted SQL. This method validates SQL to prevent injection.
   */
  async query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    if (!this.isInitialized || !this.db) {
      throw new Error('Adapter not initialized');
    }

    try {
      // Validate SQL query for basic safety
      this.validateSQL(sql);

      // Use parameterized queries via prepare() for safety
      // AgentDB's SqlJsDatabase uses all() with spread params
      if (params.length > 0) {
        const stmt = this.getDb().prepare(sql);
        const results = stmt.all(...params) as Record<string, unknown>[];
        if (typeof stmt.finalize === 'function') stmt.finalize();
        return results;
      }

      // For queries without parameters, use exec()
      const execResults = this.getDb().exec(sql);

      // exec returns: [{ columns: [...], values: [[...], [...]] }]
      if (execResults && execResults.length > 0) {
        const { columns, values } = execResults[0];

        // Convert to array of objects
        return values.map((row: unknown[]) => {
          const obj: Record<string, unknown> = {};
          columns.forEach((col: string, i: number) => {
            obj[col] = row[i];
          });
          return obj;
        });
      }

      return [];
    } catch (error: unknown) {
      throw new Error(`Query failed: ${getErrorMessage(error)}`);
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
