/**
 * SQLite Persistence Layer for QE ReasoningBank
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Uses better-sqlite3 for real, performant SQLite persistence.
 * Features:
 * - ACID transactions
 * - Prepared statements for performance
 * - BLOB storage for embeddings
 * - JSON storage for pattern data
 */

import Database, { type Database as DatabaseType, type Statement } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { QEPattern, QEDomain, QEPatternType } from './qe-patterns.js';

/**
 * SQLite persistence configuration
 */
export interface SQLitePersistenceConfig {
  /** Database file path */
  dbPath: string;

  /** Enable WAL mode for better concurrency */
  walMode: boolean;

  /** Memory-mapped I/O size in bytes */
  mmapSize: number;

  /** Cache size in pages (-ve = KB) */
  cacheSize: number;

  /** Enable foreign keys */
  foreignKeys: boolean;
}

export const DEFAULT_SQLITE_CONFIG: SQLitePersistenceConfig = {
  dbPath: '.agentic-qe/qe-patterns.db',
  walMode: true,
  mmapSize: 256 * 1024 * 1024, // 256MB
  cacheSize: -64000, // 64MB
  foreignKeys: true,
};

/**
 * SQLite-based pattern persistence
 */
export class SQLitePatternStore {
  private db: DatabaseType | null = null;
  private readonly config: SQLitePersistenceConfig;
  private prepared: Map<string, Statement> = new Map();
  private initialized = false;

  constructor(config: Partial<SQLitePersistenceConfig> = {}) {
    this.config = { ...DEFAULT_SQLITE_CONFIG, ...config };
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure directory exists
      const path = await import('path');
      const fs = await import('fs');
      const dir = path.dirname(this.config.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Open database
      this.db = new Database(this.config.dbPath);

      // Configure for performance
      if (this.config.walMode) {
        this.db.pragma('journal_mode = WAL');
      }
      this.db.pragma(`mmap_size = ${this.config.mmapSize}`);
      this.db.pragma(`cache_size = ${this.config.cacheSize}`);
      if (this.config.foreignKeys) {
        this.db.pragma('foreign_keys = ON');
      }

      // Create schema
      this.createSchema();

      // Prepare statements
      this.prepareStatements();

      this.initialized = true;
      console.log(`[SQLitePatternStore] Initialized: ${this.config.dbPath}`);
    } catch (error) {
      throw new Error(`Failed to initialize SQLite: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create database schema
   */
  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      -- QE Patterns table
      CREATE TABLE IF NOT EXISTS qe_patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        qe_domain TEXT NOT NULL,
        domain TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        confidence REAL DEFAULT 0.5,
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0.0,
        quality_score REAL DEFAULT 0.0,
        tier TEXT DEFAULT 'short-term',
        template_json TEXT,
        context_json TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT,
        successful_uses INTEGER DEFAULT 0
      );

      -- Pattern embeddings table (BLOB storage for vectors)
      CREATE TABLE IF NOT EXISTS qe_pattern_embeddings (
        pattern_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        dimension INTEGER NOT NULL,
        model TEXT DEFAULT 'all-MiniLM-L6-v2',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
      );

      -- Pattern usage history
      CREATE TABLE IF NOT EXISTS qe_pattern_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        success INTEGER NOT NULL,
        metrics_json TEXT,
        feedback TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
      );

      -- Learning trajectories
      CREATE TABLE IF NOT EXISTS qe_trajectories (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        agent TEXT,
        domain TEXT,
        started_at TEXT DEFAULT (datetime('now')),
        ended_at TEXT,
        success INTEGER,
        steps_json TEXT,
        metadata_json TEXT
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_patterns_domain ON qe_patterns(qe_domain);
      CREATE INDEX IF NOT EXISTS idx_patterns_type ON qe_patterns(pattern_type);
      CREATE INDEX IF NOT EXISTS idx_patterns_tier ON qe_patterns(tier);
      CREATE INDEX IF NOT EXISTS idx_patterns_quality ON qe_patterns(quality_score DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_pattern ON qe_pattern_usage(pattern_id);
      CREATE INDEX IF NOT EXISTS idx_trajectories_domain ON qe_trajectories(domain);
    `);
  }

  /**
   * Prepare commonly used statements
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.prepared.set('insertPattern', this.db.prepare(`
      INSERT INTO qe_patterns (
        id, pattern_type, qe_domain, domain, name, description,
        confidence, tier, template_json, context_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));

    this.prepared.set('insertEmbedding', this.db.prepare(`
      INSERT OR REPLACE INTO qe_pattern_embeddings (pattern_id, embedding, dimension, model)
      VALUES (?, ?, ?, ?)
    `));

    this.prepared.set('getPattern', this.db.prepare(`
      SELECT * FROM qe_patterns WHERE id = ?
    `));

    this.prepared.set('getPatternWithEmbedding', this.db.prepare(`
      SELECT p.*, e.embedding, e.dimension
      FROM qe_patterns p
      LEFT JOIN qe_pattern_embeddings e ON p.id = e.pattern_id
      WHERE p.id = ?
    `));

    this.prepared.set('updatePattern', this.db.prepare(`
      UPDATE qe_patterns SET
        usage_count = usage_count + 1,
        successful_uses = successful_uses + ?,
        success_rate = CAST(successful_uses + ? AS REAL) / CAST(usage_count + 1 AS REAL),
        quality_score = ?,
        last_used_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `));

    this.prepared.set('promotePattern', this.db.prepare(`
      UPDATE qe_patterns SET tier = 'long-term', updated_at = datetime('now')
      WHERE id = ?
    `));

    this.prepared.set('insertUsage', this.db.prepare(`
      INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json, feedback)
      VALUES (?, ?, ?, ?)
    `));

    this.prepared.set('getAllPatterns', this.db.prepare(`
      SELECT * FROM qe_patterns ORDER BY quality_score DESC LIMIT ?
    `));

    this.prepared.set('getPatternsByDomain', this.db.prepare(`
      SELECT * FROM qe_patterns WHERE qe_domain = ? ORDER BY quality_score DESC LIMIT ?
    `));

    this.prepared.set('getAllEmbeddings', this.db.prepare(`
      SELECT pattern_id, embedding, dimension FROM qe_pattern_embeddings
    `));

    this.prepared.set('countPatterns', this.db.prepare(`
      SELECT COUNT(*) as count FROM qe_patterns
    `));

    this.prepared.set('countByDomain', this.db.prepare(`
      SELECT qe_domain, COUNT(*) as count FROM qe_patterns GROUP BY qe_domain
    `));
  }

  /**
   * Store a pattern
   */
  storePattern(pattern: QEPattern, embedding?: number[]): string {
    if (!this.db) throw new Error('Database not initialized');

    const id = pattern.id || uuidv4();
    const insertPattern = this.prepared.get('insertPattern');
    const insertEmbedding = this.prepared.get('insertEmbedding');

    if (!insertPattern || !insertEmbedding) {
      throw new Error('Prepared statements not ready');
    }

    // Use transaction for atomicity
    const transaction = this.db.transaction(() => {
      insertPattern.run(
        id,
        pattern.patternType,
        pattern.qeDomain,
        pattern.domain,
        pattern.name,
        pattern.description || '',
        pattern.confidence,
        pattern.tier || 'short-term',
        JSON.stringify(pattern.template),
        JSON.stringify(pattern.context)
      );

      if (embedding) {
        // Store embedding as BLOB (Float32Array)
        const buffer = Buffer.from(new Float32Array(embedding).buffer);
        insertEmbedding.run(id, buffer, embedding.length, 'all-MiniLM-L6-v2');
      }
    });

    transaction();
    return id;
  }

  /**
   * Get a pattern by ID
   */
  getPattern(id: string): QEPattern | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.prepared.get('getPatternWithEmbedding');
    if (!stmt) throw new Error('Prepared statement not ready');

    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.rowToPattern(row);
  }

  /**
   * Get all patterns with optional domain filter
   */
  getPatterns(options: { domain?: QEDomain; limit?: number } = {}): QEPattern[] {
    if (!this.db) throw new Error('Database not initialized');

    const limit = options.limit || 1000;
    let stmt: Statement;
    let rows: any[];

    if (options.domain) {
      stmt = this.prepared.get('getPatternsByDomain')!;
      rows = stmt.all(options.domain, limit) as any[];
    } else {
      stmt = this.prepared.get('getAllPatterns')!;
      rows = stmt.all(limit) as any[];
    }

    return rows.map(row => this.rowToPattern(row));
  }

  /**
   * Get all embeddings for HNSW indexing
   */
  getAllEmbeddings(): Array<{ patternId: string; embedding: number[] }> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.prepared.get('getAllEmbeddings');
    if (!stmt) throw new Error('Prepared statement not ready');

    const rows = stmt.all() as any[];
    return rows.map(row => ({
      patternId: row.pattern_id,
      embedding: Array.from(new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.dimension)),
    }));
  }

  /**
   * Record pattern usage
   */
  recordUsage(
    patternId: string,
    success: boolean,
    metrics?: Record<string, any>,
    feedback?: string
  ): void {
    if (!this.db) throw new Error('Database not initialized');

    const insertUsage = this.prepared.get('insertUsage');
    const updatePattern = this.prepared.get('updatePattern');

    if (!insertUsage || !updatePattern) {
      throw new Error('Prepared statements not ready');
    }

    // Get current pattern for quality score calculation
    const pattern = this.getPattern(patternId);
    if (!pattern) {
      throw new Error(`Pattern not found: ${patternId}`);
    }

    const newUsageCount = pattern.usageCount + 1;
    const newSuccessfulUses = pattern.successfulUses + (success ? 1 : 0);
    const newSuccessRate = newSuccessfulUses / newUsageCount;

    // Quality score: confidence * 0.3 + usage * 0.2 + success_rate * 0.5
    const usageScore = Math.min(1, newUsageCount / 100);
    const qualityScore = pattern.confidence * 0.3 + usageScore * 0.2 + newSuccessRate * 0.5;

    const transaction = this.db.transaction(() => {
      insertUsage.run(
        patternId,
        success ? 1 : 0,
        metrics ? JSON.stringify(metrics) : null,
        feedback || null
      );

      updatePattern.run(
        success ? 1 : 0,
        success ? 1 : 0,
        qualityScore,
        patternId
      );
    });

    transaction();
  }

  /**
   * Promote pattern to long-term tier
   */
  promotePattern(patternId: string): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.prepared.get('promotePattern');
    if (!stmt) throw new Error('Prepared statement not ready');

    stmt.run(patternId);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPatterns: number;
    byDomain: Record<string, number>;
    byTier: Record<string, number>;
  } {
    if (!this.db) throw new Error('Database not initialized');

    const countStmt = this.prepared.get('countPatterns');
    const domainStmt = this.prepared.get('countByDomain');

    if (!countStmt || !domainStmt) {
      throw new Error('Prepared statements not ready');
    }

    const total = (countStmt.get() as any).count;
    const domainRows = domainStmt.all() as any[];

    const byDomain: Record<string, number> = {};
    for (const row of domainRows) {
      byDomain[row.qe_domain] = row.count;
    }

    // Get tier counts
    const tierRows = this.db.prepare(`
      SELECT tier, COUNT(*) as count FROM qe_patterns GROUP BY tier
    `).all() as any[];

    const byTier: Record<string, number> = {};
    for (const row of tierRows) {
      byTier[row.tier] = row.count;
    }

    return { totalPatterns: total, byDomain, byTier };
  }

  /**
   * Convert database row to QEPattern
   */
  private rowToPattern(row: any): QEPattern {
    let embedding: number[] | undefined;
    if (row.embedding) {
      embedding = Array.from(
        new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.dimension)
      );
    }

    return {
      id: row.id,
      patternType: row.pattern_type as QEPatternType,
      qeDomain: row.qe_domain as QEDomain,
      domain: row.domain,
      name: row.name,
      description: row.description,
      confidence: row.confidence,
      usageCount: row.usage_count,
      successRate: row.success_rate,
      qualityScore: row.quality_score,
      tier: row.tier as 'short-term' | 'long-term',
      template: JSON.parse(row.template_json || '{}'),
      context: JSON.parse(row.context_json || '{}'),
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : new Date(row.created_at),
      successfulUses: row.successful_uses,
      embedding,
      // Token tracking fields (ADR-042)
      tokensUsed: row.tokens_used,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      latencyMs: row.latency_ms,
      reusable: row.reusable === 1,
      reuseCount: row.reuse_count || 0,
      averageTokenSavings: row.average_token_savings || 0,
      totalTokensSaved: row.total_tokens_saved,
    };
  }

  /**
   * Update pattern fields (for feedback loop)
   */
  updatePattern(patternId: string, updates: Partial<{
    usageCount: number;
    successfulUses: number;
    successRate: number;
    qualityScore: number;
    confidence: number;
    tier: 'short-term' | 'working' | 'long-term';
  }>): void {
    if (!this.db) throw new Error('Database not initialized');

    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.usageCount !== undefined) {
      setClauses.push('usage_count = ?');
      values.push(updates.usageCount);
    }
    if (updates.successfulUses !== undefined) {
      setClauses.push('successful_uses = ?');
      values.push(updates.successfulUses);
    }
    if (updates.successRate !== undefined) {
      setClauses.push('success_rate = ?');
      values.push(updates.successRate);
    }
    if (updates.qualityScore !== undefined) {
      setClauses.push('quality_score = ?');
      values.push(updates.qualityScore);
    }
    if (updates.confidence !== undefined) {
      setClauses.push('confidence = ?');
      values.push(updates.confidence);
    }
    if (updates.tier !== undefined) {
      setClauses.push('tier = ?');
      values.push(updates.tier);
    }

    if (setClauses.length === 0) return;

    setClauses.push("updated_at = datetime('now')");
    values.push(patternId);

    const sql = `UPDATE qe_patterns SET ${setClauses.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  /**
   * Store embedding for an existing pattern
   */
  storePatternEmbedding(patternId: string, embedding: number[]): void {
    if (!this.db) throw new Error('Database not initialized');

    const insertEmbedding = this.prepared.get('insertEmbedding');
    if (!insertEmbedding) {
      throw new Error('Prepared statements not ready');
    }

    // Convert embedding to Buffer for storage
    const buffer = Buffer.from(new Float32Array(embedding).buffer);

    insertEmbedding.run(
      patternId,
      buffer,
      embedding.length,
      'all-MiniLM-L6-v2'
    );
  }

  /**
   * Close the database
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      this.prepared.clear();
      console.log('[SQLitePatternStore] Database closed');
    }
  }

  /**
   * Run raw SQL (for migrations, testing)
   */
  exec(sql: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec(sql);
  }

  /**
   * Get the underlying database (for advanced operations)
   */
  getDb(): DatabaseType {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }
}

/**
 * Create a SQLite pattern store
 */
export function createSQLitePatternStore(
  config: Partial<SQLitePersistenceConfig> = {}
): SQLitePatternStore {
  return new SQLitePatternStore(config);
}
