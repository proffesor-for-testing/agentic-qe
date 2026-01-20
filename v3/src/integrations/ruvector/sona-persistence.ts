/**
 * Agentic QE v3 - SONA Pattern Persistence for RuVector Integration
 *
 * Wraps QESONA with SQLite persistence via unified memory.
 * Patterns survive across sessions, enabling continuous learning.
 *
 * Features:
 * - Loads patterns from SQLite on initialization
 * - Persists pattern updates after learning
 * - Cross-agent pattern sharing: all domains can read from same table
 * - Thread-safe singleton pattern
 *
 * @example
 * ```typescript
 * import { createPersistentSONAEngine } from '@agentic-qe/v3/integrations/ruvector';
 *
 * const engine = await createPersistentSONAEngine({
 *   domain: 'test-generation',
 * });
 *
 * // Patterns persist across sessions
 * const pattern = engine.createPattern(state, action, outcome, 'test-generation', 'test-generation');
 * engine.storePattern(pattern); // Saved to memory AND SQLite
 * ```
 */

import { type Database as DatabaseType, type Statement } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  QESONA,
  type QESONAConfig,
  type QESONAPattern,
  type QEPatternType,
  type QESONAAdaptationResult,
  type QESONAStats,
} from './sona-wrapper.js';
import type { RLState, RLAction, DomainName } from '../rl-suite/interfaces.js';
import { getUnifiedPersistence, type UnifiedPersistenceManager } from '../../kernel/unified-persistence.js';
import type { RuVectorServerClient } from './server-client.js';

// ============================================================================
// Schema (added to unified-memory.ts as part of migration)
// ============================================================================

/**
 * SONA patterns table schema - for documentation and migrations
 */
export const SONA_PATTERNS_SCHEMA = `
  -- SONA Patterns table (ADR-046: Pattern Persistence)
  CREATE TABLE IF NOT EXISTS sona_patterns (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    domain TEXT NOT NULL,
    state_embedding BLOB,
    action_embedding BLOB,
    action_type TEXT NOT NULL,
    action_value TEXT,
    outcome_reward REAL NOT NULL DEFAULT 0.0,
    outcome_success INTEGER NOT NULL DEFAULT 0,
    outcome_quality REAL NOT NULL DEFAULT 0.0,
    confidence REAL DEFAULT 0.5,
    usage_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sona_patterns_type ON sona_patterns(type);
  CREATE INDEX IF NOT EXISTS idx_sona_patterns_domain ON sona_patterns(domain);
  CREATE INDEX IF NOT EXISTS idx_sona_patterns_confidence ON sona_patterns(confidence DESC);
  CREATE INDEX IF NOT EXISTS idx_sona_patterns_updated ON sona_patterns(updated_at DESC);
`;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for persistent SONA engine
 */
export interface PersistentSONAConfig extends Partial<QESONAConfig> {
  /** Domain for this SONA instance */
  domain: DomainName;

  /** Whether to load patterns from SQLite on initialization */
  loadOnInit?: boolean;

  /** Auto-save interval in milliseconds (0 = save on every store) */
  autoSaveInterval?: number;

  /** Maximum patterns to load from database on init */
  maxPatternsToLoad?: number;

  /**
   * Optional RuVector server client for cross-process pattern sharing.
   *
   * When provided and the server supports vector operations, patterns
   * will be shared via the server for cross-agent discovery.
   *
   * The server client is OPTIONAL - the engine works without it.
   */
  serverClient?: RuVectorServerClient;

  /**
   * Whether to enable cross-process pattern sharing when server is available.
   * Default: true (patterns will be shared if serverClient is provided and supports it)
   */
  enableCrossProcessSharing?: boolean;
}

/**
 * Default persistent SONA configuration
 */
export const DEFAULT_PERSISTENT_SONA_CONFIG: Omit<PersistentSONAConfig, 'domain'> = {
  loadOnInit: true,
  autoSaveInterval: 0, // Save on every store
  maxPatternsToLoad: 10000,
  enableCrossProcessSharing: true,
};

// ============================================================================
// Database Row Types
// ============================================================================

interface SONAPatternRow {
  id: string;
  type: string;
  domain: string;
  state_embedding: Buffer | null;
  action_embedding: Buffer | null;
  action_type: string;
  action_value: string | null;
  outcome_reward: number;
  outcome_success: number;
  outcome_quality: number;
  confidence: number;
  usage_count: number;
  success_count: number;
  failure_count: number;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

// ============================================================================
// Persistent SONA Engine Implementation
// ============================================================================

/**
 * SONA engine with SQLite persistence
 *
 * Wraps QESONA and persists patterns to SQLite via UnifiedPersistenceManager.
 * Patterns survive across sessions, enabling continuous learning.
 *
 * Optionally integrates with RuVector server for cross-process pattern sharing.
 */
export class PersistentSONAEngine {
  private readonly baseEngine: QESONA;
  private readonly config: Required<PersistentSONAConfig>;
  private persistence: UnifiedPersistenceManager | null = null;
  private db: DatabaseType | null = null;
  private prepared: Map<string, Statement> = new Map();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private pendingSaves: Map<string, QESONAPattern> = new Map();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private serverClient: RuVectorServerClient | null = null;

  constructor(config: PersistentSONAConfig) {
    this.config = {
      ...DEFAULT_PERSISTENT_SONA_CONFIG,
      ...config,
    } as Required<PersistentSONAConfig>;

    // Create base QESONA engine
    this.baseEngine = new QESONA(config);

    // Store server client reference if provided
    this.serverClient = config.serverClient ?? null;
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the engine and load patterns from SQLite
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Use Promise lock to prevent concurrent initialization
    if (!this.initPromise) {
      this.initPromise = this._doInitialize();
    }

    return this.initPromise;
  }

  /**
   * Internal initialization implementation
   */
  private async _doInitialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize persistence
      this.persistence = getUnifiedPersistence();
      if (!this.persistence.isInitialized()) {
        await this.persistence.initialize();
      }
      this.db = this.persistence.getDatabase();

      // Ensure schema exists
      this.ensureSchema();

      // Prepare statements
      this.prepareStatements();

      // Load existing patterns
      if (this.config.loadOnInit) {
        await this.loadPatterns();
      }

      this.initialized = true;
      console.log(`[PersistentSONAEngine] Initialized: domain=${this.config.domain}`);
    } catch (error) {
      this.initPromise = null;
      throw new Error(
        `Failed to initialize PersistentSONAEngine: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Ensure SONA patterns schema exists
   */
  private ensureSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Check if table exists
    const tableExists = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='sona_patterns'`
    ).get();

    if (!tableExists) {
      console.log('[PersistentSONAEngine] Creating sona_patterns table');
      this.db.exec(SONA_PATTERNS_SCHEMA);
    }
  }

  /**
   * Prepare commonly used statements
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.prepared.set(
      'getById',
      this.db.prepare(`SELECT * FROM sona_patterns WHERE id = ?`)
    );

    this.prepared.set(
      'getByDomain',
      this.db.prepare(`
        SELECT * FROM sona_patterns
        WHERE domain = ?
        ORDER BY confidence DESC, updated_at DESC
        LIMIT ?
      `)
    );

    this.prepared.set(
      'getByType',
      this.db.prepare(`
        SELECT * FROM sona_patterns
        WHERE type = ?
        ORDER BY confidence DESC, updated_at DESC
        LIMIT ?
      `)
    );

    this.prepared.set(
      'getByTypeAndDomain',
      this.db.prepare(`
        SELECT * FROM sona_patterns
        WHERE type = ? AND domain = ?
        ORDER BY confidence DESC, updated_at DESC
        LIMIT ?
      `)
    );

    this.prepared.set(
      'upsert',
      this.db.prepare(`
        INSERT INTO sona_patterns (
          id, type, domain, state_embedding, action_embedding,
          action_type, action_value, outcome_reward, outcome_success, outcome_quality,
          confidence, usage_count, success_count, failure_count, metadata,
          created_at, updated_at, last_used_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
        ON CONFLICT(id) DO UPDATE SET
          confidence = excluded.confidence,
          usage_count = excluded.usage_count,
          success_count = excluded.success_count,
          failure_count = excluded.failure_count,
          metadata = excluded.metadata,
          updated_at = datetime('now'),
          last_used_at = excluded.last_used_at
      `)
    );

    this.prepared.set(
      'updateUsage',
      this.db.prepare(`
        UPDATE sona_patterns
        SET usage_count = usage_count + 1,
            last_used_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `)
    );

    this.prepared.set(
      'updateConfidence',
      this.db.prepare(`
        UPDATE sona_patterns
        SET confidence = ?,
            success_count = success_count + ?,
            failure_count = failure_count + ?,
            updated_at = datetime('now')
        WHERE id = ?
      `)
    );

    this.prepared.set(
      'delete',
      this.db.prepare(`DELETE FROM sona_patterns WHERE id = ?`)
    );

    this.prepared.set(
      'deleteByDomain',
      this.db.prepare(`DELETE FROM sona_patterns WHERE domain = ?`)
    );

    this.prepared.set(
      'getAll',
      this.db.prepare(`
        SELECT * FROM sona_patterns
        ORDER BY confidence DESC, updated_at DESC
        LIMIT ?
      `)
    );

    this.prepared.set(
      'getStats',
      this.db.prepare(`
        SELECT
          COUNT(*) as total_patterns,
          COUNT(DISTINCT type) as unique_types,
          COUNT(DISTINCT domain) as unique_domains,
          AVG(confidence) as avg_confidence,
          AVG(usage_count) as avg_usage,
          SUM(success_count) as total_successes,
          SUM(failure_count) as total_failures
        FROM sona_patterns
      `)
    );

    this.prepared.set(
      'countByType',
      this.db.prepare(`
        SELECT type, COUNT(*) as count FROM sona_patterns GROUP BY type
      `)
    );

    this.prepared.set(
      'countByDomain',
      this.db.prepare(`
        SELECT domain, COUNT(*) as count FROM sona_patterns GROUP BY domain
      `)
    );

    this.prepared.set(
      'pruneOld',
      this.db.prepare(`
        DELETE FROM sona_patterns
        WHERE updated_at < datetime('now', '-' || ? || ' days')
      `)
    );
  }

  /**
   * Load patterns from SQLite into base engine
   */
  private async loadPatterns(): Promise<void> {
    const stmt = this.prepared.get('getByDomain');
    if (!stmt) throw new Error('Statement not prepared');

    const rows = stmt.all(this.config.domain, this.config.maxPatternsToLoad) as SONAPatternRow[];

    if (rows.length > 0) {
      const patterns = rows.map((row) => this.rowToPattern(row));

      // Import patterns into base engine (clears existing first)
      this.baseEngine.importPatterns(patterns);

      console.log(`[PersistentSONAEngine] Loaded ${patterns.length} patterns for domain=${this.config.domain}`);
    }
  }

  // ==========================================================================
  // Pattern Operations (Delegates to base engine + persistence)
  // ==========================================================================

  /**
   * Adapt pattern based on context
   */
  async adaptPattern(
    state: RLState,
    patternType: QEPatternType,
    domain: DomainName
  ): Promise<QESONAAdaptationResult> {
    this.ensureInitialized();

    const result = await this.baseEngine.adaptPattern(state, patternType, domain);

    // If a pattern was used, update usage in SQLite
    if (result.success && result.pattern) {
      this.updatePatternUsage(result.pattern.id);
    }

    return result;
  }

  /**
   * Recall pattern for given context
   */
  recallPattern(
    context: RLState,
    patternType: QEPatternType,
    domain: DomainName
  ): QESONAPattern | null {
    this.ensureInitialized();
    return this.baseEngine.recallPattern(context, patternType, domain);
  }

  /**
   * Store pattern in memory AND SQLite
   *
   * If a server client is configured and supports vector operations,
   * the pattern will also be shared for cross-process discovery.
   */
  storePattern(pattern: QESONAPattern): void {
    this.ensureInitialized();

    // Store in base engine (in-memory)
    this.baseEngine.storePattern(pattern);

    // Persist to SQLite
    this.persistPattern(pattern);

    // Share via server if configured and supported
    this.sharePatternViaServer(pattern);
  }

  /**
   * Store multiple patterns in batch
   */
  storePatternsBatch(patterns: QESONAPattern[]): void {
    this.ensureInitialized();

    // Store in base engine
    this.baseEngine.storePatternsBatch(patterns);

    // Persist all to SQLite
    for (const pattern of patterns) {
      this.persistPattern(pattern);
    }

    // Share via server if configured and supported
    for (const pattern of patterns) {
      this.sharePatternViaServer(pattern);
    }
  }

  /**
   * Create and store a new pattern
   */
  createPattern(
    state: RLState,
    action: RLAction,
    outcome: QESONAPattern['outcome'],
    type: QEPatternType,
    domain: DomainName,
    metadata?: Record<string, unknown>
  ): QESONAPattern {
    this.ensureInitialized();

    // Create pattern via base engine
    const pattern = this.baseEngine.createPattern(state, action, outcome, type, domain, metadata);

    // Persist to SQLite
    this.persistPattern(pattern);

    // Share via server if configured and supported
    this.sharePatternViaServer(pattern);

    return pattern;
  }

  /**
   * Update pattern with feedback
   */
  updatePattern(patternId: string, success: boolean, quality: number): boolean {
    this.ensureInitialized();

    // Update in base engine
    const updated = this.baseEngine.updatePattern(patternId, success, quality);

    if (updated) {
      // Get updated pattern and persist confidence change
      const pattern = this.getPattern(patternId);
      if (pattern) {
        this.persistPatternConfidenceUpdate(
          patternId,
          pattern.confidence,
          success ? 1 : 0,
          success ? 0 : 1
        );
      }
    }

    return updated;
  }

  /**
   * Get a specific pattern by ID
   */
  getPattern(patternId: string): QESONAPattern | undefined {
    this.ensureInitialized();
    return this.baseEngine.getAllPatterns().find((p) => p.id === patternId);
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): QESONAPattern[] {
    this.ensureInitialized();
    return this.baseEngine.getAllPatterns();
  }

  /**
   * Get patterns by type
   */
  getPatternsByType(type: QEPatternType): QESONAPattern[] {
    this.ensureInitialized();
    return this.baseEngine.getPatternsByType(type);
  }

  /**
   * Get patterns by domain
   */
  getPatternsByDomain(domain: DomainName): QESONAPattern[] {
    this.ensureInitialized();
    return this.baseEngine.getPatternsByDomain(domain);
  }

  /**
   * Get patterns from SQLite by type (cross-agent access)
   */
  async getPersistedPatternsByType(type: QEPatternType, limit: number = 100): Promise<QESONAPattern[]> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getByType');
    if (!stmt) throw new Error('Statement not prepared');

    const rows = stmt.all(type, limit) as SONAPatternRow[];
    return rows.map((row) => this.rowToPattern(row));
  }

  /**
   * Get patterns from SQLite by domain (cross-agent access)
   */
  async getPersistedPatternsByDomain(domain: DomainName, limit: number = 100): Promise<QESONAPattern[]> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getByDomain');
    if (!stmt) throw new Error('Statement not prepared');

    const rows = stmt.all(domain, limit) as SONAPatternRow[];
    return rows.map((row) => this.rowToPattern(row));
  }

  /**
   * Get all persisted patterns (cross-agent access)
   */
  async getAllPersistedPatterns(limit: number = 1000): Promise<QESONAPattern[]> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getAll');
    if (!stmt) throw new Error('Statement not prepared');

    const rows = stmt.all(limit) as SONAPatternRow[];
    return rows.map((row) => this.rowToPattern(row));
  }

  /**
   * Import patterns from another domain (cross-agent pattern sharing)
   */
  async importPatternsFromDomain(sourceDomain: DomainName, limit: number = 100): Promise<number> {
    this.ensureInitialized();

    const patterns = await this.getPersistedPatternsByDomain(sourceDomain, limit);

    // Filter out patterns that are already in this domain
    const newPatterns = patterns.filter((p) => p.domain !== this.config.domain);

    // Import into base engine
    for (const pattern of newPatterns) {
      // Clone pattern with new ID for this domain
      const clonedPattern: QESONAPattern = {
        ...pattern,
        id: `${this.config.domain}-${uuidv4().slice(0, 8)}`,
        domain: this.config.domain,
        createdAt: new Date(),
        usageCount: 0,
      };

      this.storePattern(clonedPattern);
    }

    return newPatterns.length;
  }

  /**
   * Export all patterns
   */
  exportPatterns(): QESONAPattern[] {
    this.ensureInitialized();
    return this.baseEngine.exportPatterns();
  }

  /**
   * Import patterns (clears existing first)
   */
  importPatterns(patterns: QESONAPattern[]): void {
    this.ensureInitialized();

    // Import into base engine
    this.baseEngine.importPatterns(patterns);

    // Persist all to SQLite
    for (const pattern of patterns) {
      this.persistPattern(pattern);
    }
  }

  /**
   * Delete a pattern
   */
  deletePattern(patternId: string): boolean {
    this.ensureInitialized();

    const stmt = this.prepared.get('delete');
    if (!stmt) throw new Error('Statement not prepared');

    const result = stmt.run(patternId);
    return result.changes > 0;
  }

  /**
   * Clear all patterns for this domain
   */
  clearDomainPatterns(): void {
    this.ensureInitialized();

    // Clear in base engine
    this.baseEngine.clear();

    // Clear in SQLite for this domain
    const stmt = this.prepared.get('deleteByDomain');
    if (stmt) {
      stmt.run(this.config.domain);
    }
  }

  /**
   * Clear all in-memory patterns (does not affect SQLite)
   */
  clearMemory(): void {
    this.ensureInitialized();
    this.baseEngine.clear();
  }

  // ==========================================================================
  // Learning Operations (Delegates to base engine)
  // ==========================================================================

  /**
   * Apply Micro-LoRA transformation
   */
  applyMicroLora(input: number[]): number[] {
    this.ensureInitialized();
    return this.baseEngine.applyMicroLora(input);
  }

  /**
   * Apply Base-LoRA transformation
   */
  applyBaseLora(layerIdx: number, input: number[]): number[] {
    this.ensureInitialized();
    return this.baseEngine.applyBaseLora(layerIdx, input);
  }

  /**
   * Force background learning cycle
   */
  forceLearn(): string {
    this.ensureInitialized();
    return this.baseEngine.forceLearn();
  }

  /**
   * Run background learning cycle if due
   */
  tick(): string | null {
    this.ensureInitialized();
    return this.baseEngine.tick();
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get combined statistics (in-memory + SQLite)
   */
  getStats(): QESONAStats {
    this.ensureInitialized();
    return this.baseEngine.getStats();
  }

  /**
   * Get persisted statistics from SQLite
   */
  async getPersistedStats(): Promise<{
    totalPatterns: number;
    uniqueTypes: number;
    uniqueDomains: number;
    avgConfidence: number;
    avgUsage: number;
    totalSuccesses: number;
    totalFailures: number;
    byType: Record<string, number>;
    byDomain: Record<string, number>;
  }> {
    this.ensureInitialized();

    const statsStmt = this.prepared.get('getStats');
    const typeStmt = this.prepared.get('countByType');
    const domainStmt = this.prepared.get('countByDomain');

    if (!statsStmt || !typeStmt || !domainStmt) {
      throw new Error('Statements not prepared');
    }

    const statsRow = statsStmt.get() as {
      total_patterns: number;
      unique_types: number;
      unique_domains: number;
      avg_confidence: number | null;
      avg_usage: number | null;
      total_successes: number | null;
      total_failures: number | null;
    };

    const typeRows = typeStmt.all() as Array<{ type: string; count: number }>;
    const domainRows = domainStmt.all() as Array<{ domain: string; count: number }>;

    const byType: Record<string, number> = {};
    for (const row of typeRows) {
      byType[row.type] = row.count;
    }

    const byDomain: Record<string, number> = {};
    for (const row of domainRows) {
      byDomain[row.domain] = row.count;
    }

    return {
      totalPatterns: statsRow.total_patterns,
      uniqueTypes: statsRow.unique_types,
      uniqueDomains: statsRow.unique_domains,
      avgConfidence: statsRow.avg_confidence ?? 0,
      avgUsage: statsRow.avg_usage ?? 0,
      totalSuccesses: statsRow.total_successes ?? 0,
      totalFailures: statsRow.total_failures ?? 0,
      byType,
      byDomain,
    };
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Get configuration
   */
  getConfig(): QESONAConfig {
    return this.baseEngine.getConfig();
  }

  /**
   * Get domain
   */
  getDomain(): DomainName {
    return this.config.domain;
  }

  /**
   * Enable/disable the engine
   */
  setEnabled(enabled: boolean): void {
    this.baseEngine.setEnabled(enabled);
  }

  /**
   * Check if engine is enabled
   */
  isEnabled(): boolean {
    return this.baseEngine.isEnabled();
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Verify performance target (delegates to base engine)
   */
  async verifyPerformance(iterations: number = 100): Promise<{
    targetMet: boolean;
    avgTimeMs: number;
    minTimeMs: number;
    maxTimeMs: number;
    details: Array<{ iteration: number; timeMs: number }>;
  }> {
    this.ensureInitialized();
    return this.baseEngine.verifyPerformance(iterations);
  }

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  /**
   * Prune old patterns from SQLite
   */
  async pruneOldPatterns(olderThanDays: number): Promise<number> {
    this.ensureInitialized();

    const stmt = this.prepared.get('pruneOld');
    if (!stmt) throw new Error('Statement not prepared');

    const result = stmt.run(olderThanDays);
    return result.changes;
  }

  /**
   * Sync in-memory patterns to SQLite
   */
  async sync(): Promise<void> {
    this.ensureInitialized();

    const patterns = this.baseEngine.exportPatterns();
    for (const pattern of patterns) {
      this.persistPattern(pattern);
    }
  }

  /**
   * Reload patterns from SQLite
   */
  async reload(): Promise<void> {
    this.ensureInitialized();
    await this.loadPatterns();
  }

  /**
   * Close the engine
   */
  async close(): Promise<void> {
    // Flush pending saves
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.pendingSaves.size > 0) {
      for (const pattern of this.pendingSaves.values()) {
        this.savePatternToDb(pattern);
      }
      this.pendingSaves.clear();
    }

    this.prepared.clear();
    this.db = null;
    this.persistence = null;
    this.initialized = false;

    console.log(`[PersistentSONAEngine] Closed: domain=${this.config.domain}`);
  }

  // ==========================================================================
  // Server Integration
  // ==========================================================================

  /**
   * Set or update the server client for cross-process pattern sharing
   */
  setServerClient(client: RuVectorServerClient | null): void {
    this.serverClient = client;
  }

  /**
   * Get the current server client
   */
  getServerClient(): RuVectorServerClient | null {
    return this.serverClient;
  }

  /**
   * Check if cross-process pattern sharing is available
   */
  isCrossProcessSharingAvailable(): boolean {
    return (
      this.config.enableCrossProcessSharing &&
      this.serverClient !== null &&
      this.serverClient.supportsVectorOperations()
    );
  }

  /**
   * Search for similar patterns via server (cross-process search)
   *
   * This searches patterns that were shared by other agents/processes.
   * Returns empty array if server is not available or doesn't support vector ops.
   */
  async searchSimilarPatternsViaServer(
    pattern: QESONAPattern,
    topK = 10
  ): Promise<QESONAPattern[]> {
    if (!this.serverClient || !this.config.enableCrossProcessSharing) {
      return [];
    }

    try {
      return await this.serverClient.findSimilarPatterns(pattern, topK);
    } catch (error) {
      // Log but don't throw - graceful degradation
      console.warn(
        '[PersistentSONAEngine] Cross-process pattern search failed:',
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Share pattern via server (fire-and-forget, non-blocking)
   */
  private sharePatternViaServer(pattern: QESONAPattern): void {
    if (!this.serverClient || !this.config.enableCrossProcessSharing) {
      return;
    }

    // Fire-and-forget - don't await, don't block
    this.serverClient.sharePattern(pattern).catch((error) => {
      // Log but don't propagate error - sharing is optional
      if (process.env.RUVECTOR_DEBUG === 'true') {
        console.warn(
          '[PersistentSONAEngine] Pattern sharing failed:',
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('PersistentSONAEngine not initialized. Call initialize() first.');
    }
  }

  /**
   * Persist a pattern to SQLite
   */
  private persistPattern(pattern: QESONAPattern): void {
    if (this.config.autoSaveInterval === 0) {
      // Immediate save
      this.savePatternToDb(pattern);
    } else {
      // Batch saves
      this.pendingSaves.set(pattern.id, pattern);
      this.scheduleSave();
    }
  }

  /**
   * Save pattern directly to database
   */
  private savePatternToDb(pattern: QESONAPattern): void {
    const stmt = this.prepared.get('upsert');
    if (!stmt) throw new Error('Statement not prepared');

    const stateEmbedding = pattern.stateEmbedding?.length
      ? this.floatArrayToBuffer(pattern.stateEmbedding)
      : null;

    const actionEmbedding = pattern.action?.value && Array.isArray(pattern.action.value)
      ? this.floatArrayToBuffer(pattern.action.value as number[])
      : null;

    const actionValue = typeof pattern.action?.value === 'string'
      ? pattern.action.value
      : pattern.action?.value !== undefined
        ? JSON.stringify(pattern.action.value)
        : null;

    stmt.run(
      pattern.id,
      pattern.type,
      pattern.domain,
      stateEmbedding,
      actionEmbedding,
      pattern.action?.type ?? 'unknown',
      actionValue,
      pattern.outcome?.reward ?? 0,
      pattern.outcome?.success ? 1 : 0,
      pattern.outcome?.quality ?? 0,
      pattern.confidence,
      pattern.usageCount,
      0, // success_count (tracked separately from usageCount)
      0, // failure_count
      pattern.metadata ? JSON.stringify(pattern.metadata) : null,
      pattern.createdAt?.toISOString() ?? new Date().toISOString(),
      pattern.lastUsedAt?.toISOString() ?? null
    );
  }

  /**
   * Schedule batched save
   */
  private scheduleSave(): void {
    if (this.saveTimer) return;

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const patterns = Array.from(this.pendingSaves.values());
      this.pendingSaves.clear();

      for (const pattern of patterns) {
        this.savePatternToDb(pattern);
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * Update pattern usage in SQLite
   */
  private updatePatternUsage(patternId: string): void {
    const stmt = this.prepared.get('updateUsage');
    if (!stmt) return;

    try {
      stmt.run(patternId);
    } catch {
      // Ignore errors - pattern may not be persisted yet
    }
  }

  /**
   * Update pattern confidence in SQLite
   */
  private persistPatternConfidenceUpdate(
    patternId: string,
    confidence: number,
    successIncrement: number,
    failureIncrement: number
  ): void {
    const stmt = this.prepared.get('updateConfidence');
    if (!stmt) return;

    try {
      stmt.run(confidence, successIncrement, failureIncrement, patternId);
    } catch {
      // Ignore errors - pattern may not be persisted yet
    }
  }

  /**
   * Convert database row to QESONAPattern
   */
  private rowToPattern(row: SONAPatternRow): QESONAPattern {
    const stateEmbedding = row.state_embedding
      ? this.bufferToFloatArray(row.state_embedding)
      : [];

    let actionValue: number | string | object = row.action_value ?? '';
    if (row.action_value) {
      try {
        actionValue = JSON.parse(row.action_value) as number | string | object;
      } catch {
        // Keep as string
        actionValue = row.action_value;
      }
    }

    return {
      id: row.id,
      type: row.type as QEPatternType,
      domain: row.domain as DomainName,
      stateEmbedding,
      action: {
        type: row.action_type,
        value: actionValue,
      },
      outcome: {
        reward: row.outcome_reward,
        success: row.outcome_success === 1,
        quality: row.outcome_quality,
      },
      confidence: row.confidence,
      usageCount: row.usage_count,
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  /**
   * Convert float array to buffer
   */
  private floatArrayToBuffer(arr: number[]): Buffer {
    const buffer = Buffer.alloc(arr.length * 4);
    for (let i = 0; i < arr.length; i++) {
      buffer.writeFloatLE(arr[i], i * 4);
    }
    return buffer;
  }

  /**
   * Convert buffer to float array
   */
  private bufferToFloatArray(buffer: Buffer): number[] {
    const arr: number[] = [];
    const count = buffer.length / 4;
    for (let i = 0; i < count; i++) {
      arr.push(buffer.readFloatLE(i * 4));
    }
    return arr;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a persistent SONA engine
 *
 * @example
 * ```typescript
 * const engine = await createPersistentSONAEngine({
 *   domain: 'test-generation',
 * });
 *
 * // Patterns persist across sessions
 * const pattern = engine.createPattern(state, action, outcome, 'test-generation', 'test-generation');
 * engine.storePattern(pattern);
 * ```
 */
export async function createPersistentSONAEngine(
  config: PersistentSONAConfig
): Promise<PersistentSONAEngine> {
  const engine = new PersistentSONAEngine(config);
  await engine.initialize();
  return engine;
}

/**
 * Create a persistent SONA engine synchronously (must call initialize() manually)
 */
export function createPersistentSONAEngineSync(
  config: PersistentSONAConfig
): PersistentSONAEngine {
  return new PersistentSONAEngine(config);
}
