/**
 * True Unified Memory Manager for AQE V3
 *
 * Single database file: .agentic-qe/memory.db
 *
 * Consolidates ALL persistence into one file:
 * - KV Store (v2 compatible)
 * - Vectors (BLOB storage, HNSW index built in-memory)
 * - Q-Values (RL algorithms)
 * - GOAP (planning)
 * - Dreams (concept graph)
 *
 * Benefits:
 * - Single file for backup/restore
 * - v2 backward compatibility (existing memory.db migrates seamlessly)
 * - Atomic cross-feature transactions
 * - No confusion about where data lives
 *
 * Module structure (extracted for maintainability):
 * - unified-memory-schemas.ts: SQL schema definitions
 * - unified-memory-hnsw.ts: HNSW index + BinaryHeap
 * - unified-memory.ts: UnifiedMemoryManager class (this file, facade)
 */

import Database, { type Database as DatabaseType, type Statement } from 'better-sqlite3';
import { safeJsonParse } from '../shared/safe-json.js';
import { toErrorMessage } from '../shared/error-utils.js';
import * as fs from 'fs';
import * as path from 'path';
import { MEMORY_CONSTANTS } from './constants.js';
import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('unified-memory');

// Re-export from shared module for backward compatibility
export { validateTableName, ALLOWED_TABLE_NAMES } from '../shared/sql-safety.js';
import { validateTableName } from '../shared/sql-safety.js';

// Re-export extracted modules for backward compatibility
export { BinaryHeap, InMemoryHNSWIndex } from './unified-memory-hnsw.js';
import { InMemoryHNSWIndex } from './unified-memory-hnsw.js';

// Import schemas
import {
  SCHEMA_VERSION,
  SCHEMA_VERSION_TABLE,
  KV_STORE_SCHEMA,
  VECTORS_SCHEMA,
  RL_QVALUES_SCHEMA,
  GOAP_SCHEMA,
  DREAM_SCHEMA,
  QE_PATTERNS_SCHEMA,
  MINCUT_SCHEMA,
  SONA_PATTERNS_SCHEMA,
  FEEDBACK_SCHEMA,
  HYPERGRAPH_SCHEMA,
  STATS_TABLES,
} from './unified-memory-schemas.js';

// CRDT imports for distributed state synchronization
import {
  createCRDTStore,
  type CRDTStore,
  type CRDTStoreState,
  type CRDTStoreDelta,
} from '../memory/crdt/index.js';

// ============================================================================
// Project Root Detection
// ============================================================================

/** Module-level cache for findProjectRoot result. */
let _cachedProjectRoot: string | null = null;

/**
 * Clear the cached project root. Useful for testing or when the
 * environment changes at runtime.
 */
export function clearProjectRootCache(): void {
  _cachedProjectRoot = null;
}

/**
 * Find the project root by walking up the directory tree.
 *
 * Priority order:
 * 1. AQE_PROJECT_ROOT environment variable (set by MCP config or init)
 * 2. Walk up looking for .agentic-qe directory (existing AQE project)
 * 3. Walk up looking for .git directory (git repo root)
 * 4. Walk up looking for package.json WITHOUT node_modules sibling (monorepo root)
 * 5. Fallback to current working directory
 *
 * Optimized: single upward walk checks all markers in one pass,
 * and the result is cached at module level for subsequent calls.
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  if (_cachedProjectRoot) {
    return _cachedProjectRoot;
  }

  if (process.env.AQE_PROJECT_ROOT) {
    _cachedProjectRoot = process.env.AQE_PROJECT_ROOT;
    return _cachedProjectRoot;
  }

  const dir = startDir;
  const root = path.parse(dir).root;

  let checkDir = dir;
  let topmostAqeDir: string | null = null;
  let lowestGitDir: string | null = null;
  let topmostPackageJson: string | null = null;

  while (checkDir !== root) {
    if (fs.existsSync(path.join(checkDir, '.agentic-qe'))) {
      topmostAqeDir = checkDir;
    }
    if (fs.existsSync(path.join(checkDir, '.git'))) {
      if (lowestGitDir === null) {
        lowestGitDir = checkDir;
      }
    }
    if (fs.existsSync(path.join(checkDir, 'package.json'))) {
      topmostPackageJson = checkDir;
    }
    checkDir = path.dirname(checkDir);
  }

  if (topmostAqeDir) {
    _cachedProjectRoot = topmostAqeDir;
  } else if (lowestGitDir) {
    _cachedProjectRoot = lowestGitDir;
  } else if (topmostPackageJson) {
    _cachedProjectRoot = topmostPackageJson;
  } else {
    _cachedProjectRoot = process.cwd();
  }

  return _cachedProjectRoot;
}

/**
 * Get the default database path using project root detection.
 * Always resolves to {project_root}/.agentic-qe/memory.db
 */
export function getDefaultDbPath(): string {
  const projectRoot = findProjectRoot();
  return path.join(projectRoot, '.agentic-qe', 'memory.db');
}

// ============================================================================
// Configuration
// ============================================================================

export interface UnifiedMemoryConfig {
  /** Database file path - defaults to .agentic-qe/memory.db */
  dbPath: string;
  /** Enable WAL mode for better concurrency */
  walMode: boolean;
  /** Memory-mapped I/O size in bytes */
  mmapSize: number;
  /** Cache size in pages (-ve = KB) */
  cacheSize: number;
  /** Busy timeout in milliseconds */
  busyTimeout: number;
  /** Vector dimensions (for HNSW) */
  vectorDimensions: number;
}

export const DEFAULT_UNIFIED_MEMORY_CONFIG: UnifiedMemoryConfig = {
  dbPath: '.agentic-qe/memory.db',
  walMode: true,
  mmapSize: MEMORY_CONSTANTS.MMAP_SIZE_BYTES,
  cacheSize: MEMORY_CONSTANTS.CACHE_SIZE_KB,
  busyTimeout: MEMORY_CONSTANTS.BUSY_TIMEOUT_MS,
  vectorDimensions: MEMORY_CONSTANTS.DEFAULT_VECTOR_DIMENSIONS,
};

export function getResolvedDefaultConfig(): UnifiedMemoryConfig {
  return {
    ...DEFAULT_UNIFIED_MEMORY_CONFIG,
    dbPath: getDefaultDbPath(),
  };
}

// ============================================================================
// Empty Tables Audit (Issue #260, 2026-02-14)
// ============================================================================
// The following 10 tables exist in the schema but have ZERO production writes.
// They are candidates for removal in a future schema migration:
//   - artifacts, baselines, consensus_state, learning_history,
//     memory_acl, nervous_system_state, pattern_versions,
//     sessions, transfer_test_results, transfer_validations
//
// Tables actively wired (DO NOT remove):
//   - embeddings, executed_steps, execution_results,
//     goap_goals, goap_plan_signatures,
//     hypergraph_edges, hypergraph_nodes
//
// Tables partially wired (in allowlist, need INSERT code):
//   - learning_metrics, ooda_cycles, performance_metrics,
//     workflow_state, experience_applications
// ============================================================================

// ============================================================================
// Unified Memory Manager
// ============================================================================

/**
 * Singleton manager for TRUE unified AQE persistence.
 *
 * Single file: .agentic-qe/memory.db
 *
 * Contains ALL data:
 * - KV store (v2 compatible)
 * - Vectors (persistent, with in-memory HNSW index)
 * - Q-Values
 * - GOAP
 * - Dreams
 */
export class UnifiedMemoryManager {
  private static instance: UnifiedMemoryManager | null = null;
  private static instancePromise: Promise<UnifiedMemoryManager> | null = null;

  private db: DatabaseType | null = null;
  private readonly config: UnifiedMemoryConfig;
  private initialized = false;
  private vectorsLoaded = false;
  private initPromise: Promise<void> | null = null;
  private preparedStatements: Map<string, Statement> = new Map();
  private vectorIndex: InMemoryHNSWIndex = new InMemoryHNSWIndex();

  // CRDT store for distributed state synchronization
  private crdtStore: CRDTStore | null = null;

  private constructor(config?: Partial<UnifiedMemoryConfig>) {
    const resolvedDefaults = getResolvedDefaultConfig();
    this.config = { ...resolvedDefaults, ...config };

    if (!path.isAbsolute(this.config.dbPath)) {
      const projectRoot = findProjectRoot();
      this.config.dbPath = path.join(projectRoot, this.config.dbPath);
    }
  }

  static getInstance(config?: Partial<UnifiedMemoryConfig>): UnifiedMemoryManager {
    if (UnifiedMemoryManager.instance) {
      return UnifiedMemoryManager.instance;
    }
    UnifiedMemoryManager.instance = new UnifiedMemoryManager(config);
    return UnifiedMemoryManager.instance;
  }

  static async getInstanceAsync(config?: Partial<UnifiedMemoryConfig>): Promise<UnifiedMemoryManager> {
    if (UnifiedMemoryManager.instance?.initialized) {
      return UnifiedMemoryManager.instance;
    }

    if (!UnifiedMemoryManager.instancePromise) {
      UnifiedMemoryManager.instancePromise = (async () => {
        const instance = UnifiedMemoryManager.getInstance(config);
        await instance.initialize();
        return instance;
      })();
    }

    return UnifiedMemoryManager.instancePromise;
  }

  static resetInstance(): void {
    if (UnifiedMemoryManager.instance) {
      UnifiedMemoryManager.instance.close();
      UnifiedMemoryManager.instance = null;
    }
    UnifiedMemoryManager.instancePromise = null;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.initPromise) {
      this.initPromise = this._doInitialize();
    }

    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const dir = path.dirname(this.config.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(this.config.dbPath);

      if (this.config.walMode) {
        this.db.pragma('journal_mode = WAL');
      }
      this.db.pragma(`mmap_size = ${this.config.mmapSize}`);
      this.db.pragma(`cache_size = ${this.config.cacheSize}`);
      this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);
      this.db.pragma('foreign_keys = ON');

      await this.runMigrations();

      this.vectorsLoaded = false;
      this.initialized = true;
      console.log(`[UnifiedMemory] Initialized: ${this.config.dbPath}`);

      this.warnIfDuplicateDatabases();
    } catch (error) {
      this.initPromise = null;
      throw new Error(
        `Failed to initialize UnifiedMemoryManager: ${toErrorMessage(error)}`
      );
    }
  }

  private warnIfDuplicateDatabases(): void {
    try {
      const projectRoot = findProjectRoot();
      const canonicalDb = path.resolve(this.config.dbPath);
      const candidates = [
        path.join(projectRoot, '.agentic-qe', 'memory.db'),
        path.join(projectRoot, 'v3', '.agentic-qe', 'memory.db'),
      ];

      const duplicates = candidates
        .map(p => path.resolve(p))
        .filter(p => p !== canonicalDb && fs.existsSync(p));

      if (duplicates.length > 0) {
        console.warn(
          `[UnifiedMemory] WARNING: Duplicate database(s) detected!\n` +
          `  Canonical: ${canonicalDb}\n` +
          `  Duplicates: ${duplicates.join(', ')}\n` +
          `  This can cause data splits. Remove duplicates or set AQE_PROJECT_ROOT.`
        );
      }
    } catch (e) {
      // Non-critical
      logger.debug('Duplicate database check failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  private columnExists(tableName: string, columnName: string): boolean {
    if (!this.db) return false;
    try {
      const safeName = validateTableName(tableName);
      const info = this.db.prepare(`PRAGMA table_info(${safeName})`).all() as Array<{ name: string }>;
      return info.some(col => col.name === columnName);
    } catch (e) {
      logger.debug('Column existence check failed', { table: tableName, column: columnName, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  private handleV2SchemaIncompatibilities(): void {
    if (!this.db) return;

    const v2IncompatibleTables = [
      { table: 'goap_plans', requiredColumn: 'status' },
      { table: 'goap_actions', requiredColumn: 'agent_type' },
      { table: 'concept_nodes', requiredColumn: 'concept_type' },
      { table: 'concept_edges', requiredColumn: 'edge_type' },
      { table: 'dream_insights', requiredColumn: 'cycle_id' },
      { table: 'rl_q_values', requiredColumn: 'algorithm' },
    ];

    for (const { table, requiredColumn } of v2IncompatibleTables) {
      const tableExists = this.db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).get(table);

      if (tableExists && !this.columnExists(table, requiredColumn)) {
        console.log(`[UnifiedMemory] Upgrading v2 table: ${table} (missing ${requiredColumn})`);
        this.db.exec(`DROP TABLE IF EXISTS ${validateTableName(table)}`);
      }
    }
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(SCHEMA_VERSION_TABLE);
    this.handleV2SchemaIncompatibilities();

    const versionRow = this.db.prepare(
      'SELECT version FROM schema_version WHERE id = 1'
    ).get() as { version: number } | undefined;

    const currentVersion = versionRow?.version ?? 0;

    if (currentVersion < SCHEMA_VERSION) {
      console.log(`[UnifiedMemory] Migrating from v${currentVersion} to v${SCHEMA_VERSION}`);

      const migrate = this.db.transaction(() => {
        if (currentVersion < 1) this.db!.exec(KV_STORE_SCHEMA);
        if (currentVersion < 2) this.db!.exec(VECTORS_SCHEMA);
        if (currentVersion < 3) {
          this.db!.exec(RL_QVALUES_SCHEMA);
          this.db!.exec(GOAP_SCHEMA);
          this.db!.exec(DREAM_SCHEMA);
        }
        if (currentVersion < 4) this.db!.exec(QE_PATTERNS_SCHEMA);
        if (currentVersion < 5) this.db!.exec(MINCUT_SCHEMA);
        if (currentVersion < 6) this.db!.exec(HYPERGRAPH_SCHEMA);
        if (currentVersion < 7) this.db!.exec(SONA_PATTERNS_SCHEMA);
        if (currentVersion < 8) this.db!.exec(FEEDBACK_SCHEMA);

        this.db!.prepare(`
          INSERT OR REPLACE INTO schema_version (id, version, migrated_at)
          VALUES (1, ?, datetime('now'))
        `).run(SCHEMA_VERSION);
      });

      migrate();
      console.log(`[UnifiedMemory] Migration complete`);
    }
  }

  private async loadVectorIndex(): Promise<void> {
    if (this.vectorsLoaded) return;
    if (!this.db) throw new Error('Database not initialized');

    this.vectorIndex.clear();

    const rows = this.db.prepare(
      'SELECT id, embedding, dimensions FROM vectors'
    ).all() as Array<{ id: string; embedding: Buffer; dimensions: number }>;

    for (const row of rows) {
      const embedding = this.bufferToFloatArray(row.embedding, row.dimensions);
      this.vectorIndex.add(row.id, embedding);
    }

    this.vectorsLoaded = true;
    console.log(`[UnifiedMemory] Loaded ${rows.length} vectors into HNSW index`);
  }

  // ============================================================================
  // KV Store Operations (v2 compatible)
  // ============================================================================

  async kvSet(key: string, value: unknown, namespace: string = 'default', ttl?: number): Promise<void> {
    this.ensureInitialized();
    const expiresAt = ttl ? Date.now() + ttl * 1000 : null;
    const serialized = JSON.stringify(value);
    this.db!.prepare(`
      INSERT OR REPLACE INTO kv_store (key, namespace, value, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(key, namespace, serialized, expiresAt);
  }

  async kvGet<T>(key: string, namespace: string = 'default'): Promise<T | undefined> {
    this.ensureInitialized();
    const row = this.db!.prepare(`
      SELECT value, expires_at FROM kv_store
      WHERE key = ? AND namespace = ?
    `).get(key, namespace) as { value: string; expires_at: number | null } | undefined;

    if (!row) return undefined;

    if (row.expires_at && Date.now() > row.expires_at) {
      this.db!.prepare('DELETE FROM kv_store WHERE key = ? AND namespace = ?').run(key, namespace);
      return undefined;
    }

    return safeJsonParse<T>(row.value);
  }

  async kvDelete(key: string, namespace: string = 'default'): Promise<boolean> {
    this.ensureInitialized();
    const result = this.db!.prepare(
      'DELETE FROM kv_store WHERE key = ? AND namespace = ?'
    ).run(key, namespace);
    return result.changes > 0;
  }

  async kvExists(key: string, namespace: string = 'default'): Promise<boolean> {
    this.ensureInitialized();
    const row = this.db!.prepare(`
      SELECT 1 FROM kv_store
      WHERE key = ? AND namespace = ? AND (expires_at IS NULL OR expires_at > ?)
    `).get(key, namespace, Date.now());
    return row !== undefined;
  }

  async kvSearch(pattern: string, namespace: string = 'default', limit: number = 100): Promise<string[]> {
    this.ensureInitialized();
    const sqlPattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
    const rows = this.db!.prepare(`
      SELECT key FROM kv_store
      WHERE namespace = ? AND key LIKE ?
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT ?
    `).all(namespace, sqlPattern, Date.now(), limit) as Array<{ key: string }>;
    return rows.map(r => r.key);
  }

  async kvCleanupExpired(): Promise<number> {
    this.ensureInitialized();
    const result = this.db!.prepare(
      'DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at < ?'
    ).run(Date.now());
    return result.changes;
  }

  // ============================================================================
  // Vector Operations
  // ============================================================================

  async vectorStore(id: string, embedding: number[], namespace: string = 'default', metadata?: unknown): Promise<void> {
    this.ensureInitialized();
    const buffer = this.floatArrayToBuffer(embedding);
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    this.db!.prepare(`
      INSERT OR REPLACE INTO vectors (id, namespace, embedding, dimensions, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(id, namespace, buffer, embedding.length, metadataJson);
    this.vectorIndex.add(id, embedding);
  }

  async vectorGet(id: string): Promise<{ embedding: number[]; metadata?: unknown } | undefined> {
    this.ensureInitialized();
    const row = this.db!.prepare(`
      SELECT embedding, dimensions, metadata FROM vectors WHERE id = ?
    `).get(id) as { embedding: Buffer; dimensions: number; metadata: string | null } | undefined;

    if (!row) return undefined;
    return {
      embedding: this.bufferToFloatArray(row.embedding, row.dimensions),
      metadata: row.metadata ? safeJsonParse(row.metadata) : undefined,
    };
  }

  async vectorDelete(id: string): Promise<boolean> {
    this.ensureInitialized();
    const result = this.db!.prepare('DELETE FROM vectors WHERE id = ?').run(id);
    this.vectorIndex.remove(id);
    return result.changes > 0;
  }

  async vectorSearch(
    query: number[], k: number = 10, namespace?: string
  ): Promise<Array<{ id: string; score: number; metadata?: unknown }>> {
    this.ensureInitialized();

    if (!this.vectorsLoaded) {
      await this.loadVectorIndex();
    }

    const results = this.vectorIndex.search(query, k * 2);
    if (results.length === 0) return [];

    const ids = results.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db!.prepare(
      `SELECT id, namespace, metadata FROM vectors WHERE id IN (${placeholders})`
    ).all(...ids) as Array<{ id: string; namespace: string; metadata: string | null }>;

    const metadataMap = new Map(rows.map(row => [row.id, row]));

    if (namespace) {
      const filteredResults: Array<{ id: string; score: number; metadata?: unknown }> = [];
      for (const result of results) {
        const row = metadataMap.get(result.id);
        if (row && row.namespace === namespace) {
          filteredResults.push({
            id: result.id, score: result.score,
            metadata: row.metadata ? safeJsonParse(row.metadata) : undefined,
          });
          if (filteredResults.length >= k) break;
        }
      }
      return filteredResults;
    }

    return results.slice(0, k).map(result => {
      const row = metadataMap.get(result.id);
      return {
        id: result.id, score: result.score,
        metadata: row?.metadata ? safeJsonParse(row.metadata) : undefined,
      };
    });
  }

  async vectorCount(namespace?: string): Promise<number> {
    this.ensureInitialized();
    if (namespace) {
      const row = this.db!.prepare(
        'SELECT COUNT(*) as count FROM vectors WHERE namespace = ?'
      ).get(namespace) as { count: number };
      return row.count;
    }
    const row = this.db!.prepare('SELECT COUNT(*) as count FROM vectors').get() as { count: number };
    return row.count;
  }

  // ============================================================================
  // CRDT Operations
  // ============================================================================

  initializeCRDT(nodeId: string): void {
    if (this.crdtStore) {
      console.warn('[UnifiedMemory] CRDT store already initialized');
      return;
    }
    this.crdtStore = createCRDTStore({ nodeId });
    console.log(`[UnifiedMemory] CRDT store initialized for node: ${nodeId}`);
  }

  getCRDTStore(): CRDTStore | null { return this.crdtStore; }
  isCRDTInitialized(): boolean { return this.crdtStore !== null; }

  async crdtSet<T>(key: string, value: T, namespace: string = 'crdt'): Promise<void> {
    this.ensureInitialized();
    if (this.crdtStore) this.crdtStore.setRegister(key, value);
    await this.kvSet(key, value, namespace);
  }

  async crdtGet<T>(key: string, namespace: string = 'crdt'): Promise<T | undefined> {
    if (this.crdtStore) {
      const register = this.crdtStore.getRegister<T>(key);
      if (register) return register.get();
    }
    return this.kvGet<T>(key, namespace);
  }

  crdtIncrement(key: string, amount: number = 1): void {
    if (!this.crdtStore) throw new Error('CRDT store not initialized. Call initializeCRDT first.');
    let counter = this.crdtStore.getCounter(key);
    if (!counter) {
      this.crdtStore.incrementCounter(key, 0);
      counter = this.crdtStore.getCounter(key);
    }
    for (let i = 0; i < amount; i++) this.crdtStore.incrementCounter(key);
  }

  crdtGetCounter(key: string): number {
    if (!this.crdtStore) return 0;
    const counter = this.crdtStore.getCounter(key);
    return counter?.get() ?? 0;
  }

  crdtAddToSet<T>(key: string, item: T): void {
    if (!this.crdtStore) throw new Error('CRDT store not initialized. Call initializeCRDT first.');
    this.crdtStore.addToSet(key, item);
  }

  crdtRemoveFromSet<T>(key: string, item: T): void {
    if (!this.crdtStore) throw new Error('CRDT store not initialized. Call initializeCRDT first.');
    this.crdtStore.removeFromSet(key, item);
  }

  crdtGetSet<T>(key: string): Set<T> {
    if (!this.crdtStore) return new Set();
    const orSet = this.crdtStore.getSet<T>(key);
    return new Set(orSet.values());
  }

  crdtGetState(): CRDTStoreState | null {
    if (!this.crdtStore) return null;
    return this.crdtStore.getState();
  }

  crdtGetDelta(sinceVersion?: number): CRDTStoreDelta | null {
    if (!this.crdtStore) return null;
    return this.crdtStore.getDelta(sinceVersion ?? 0);
  }

  crdtMerge(remoteState: CRDTStoreState): void {
    if (!this.crdtStore) throw new Error('CRDT store not initialized. Call initializeCRDT first.');
    this.crdtStore.applyState(remoteState);
  }

  crdtApplyDelta(delta: CRDTStoreDelta): void {
    if (!this.crdtStore) throw new Error('CRDT store not initialized. Call initializeCRDT first.');
    this.crdtStore.applyDelta(delta);
  }

  async crdtPersist(): Promise<void> {
    if (!this.crdtStore) return;
    const state = this.crdtStore.getState();
    await this.kvSet('__crdt_state__', state, 'crdt-internal');
  }

  async crdtRestore(): Promise<boolean> {
    if (!this.crdtStore) return false;
    const state = await this.kvGet<CRDTStoreState>('__crdt_state__', 'crdt-internal');
    if (state) {
      this.crdtStore.applyState(state);
      return true;
    }
    return false;
  }

  // ============================================================================
  // Raw Database Access
  // ============================================================================

  getDatabase(): DatabaseType {
    if (!this.db || !this.initialized) throw new Error('UnifiedMemoryManager not initialized');
    return this.db;
  }

  isInitialized(): boolean { return this.initialized; }
  getDbPath(): string { return this.config.dbPath; }

  prepare(name: string, sql: string): Statement {
    if (!this.db) throw new Error('Database not initialized');
    let stmt = this.preparedStatements.get(name);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.preparedStatements.set(name, stmt);
    }
    return stmt;
  }

  transaction<T>(fn: () => T): T {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.transaction(fn)();
  }

  getStats(): {
    tables: { name: string; rowCount: number }[];
    fileSize: number;
    walSize: number;
    vectorIndexSize: number;
  } {
    if (!this.db) throw new Error('Database not initialized');

    const tableStats = STATS_TABLES.map(name => {
      try {
        const row = this.db!.prepare(`SELECT COUNT(*) as count FROM ${name}`).get() as { count: number };
        return { name, rowCount: row.count };
      } catch (e) {
        logger.debug('Table row count query failed', { table: name, error: e instanceof Error ? e.message : String(e) });
        return { name, rowCount: 0 };
      }
    });

    let fileSize = 0;
    let walSize = 0;
    try {
      if (fs.existsSync(this.config.dbPath)) fileSize = fs.statSync(this.config.dbPath).size;
      const walPath = this.config.dbPath + '-wal';
      if (fs.existsSync(walPath)) walSize = fs.statSync(walPath).size;
    } catch (error) {
      console.debug('[UnifiedMemory] File stat error:', error instanceof Error ? error.message : error);
    }

    return { tables: tableStats, fileSize, walSize, vectorIndexSize: this.vectorIndex.size() };
  }

  vacuum(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec('VACUUM');
  }

  checkpoint(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.pragma('wal_checkpoint(TRUNCATE)');
  }

  close(): void {
    if (this.db) {
      this.preparedStatements.clear();
      this.vectorIndex.clear();
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('[UnifiedMemory] Database closed');
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('UnifiedMemoryManager not initialized. Call initialize() first.');
    }
  }

  private floatArrayToBuffer(arr: number[]): Buffer {
    const buffer = Buffer.alloc(arr.length * 4);
    for (let i = 0; i < arr.length; i++) buffer.writeFloatLE(arr[i], i * 4);
    return buffer;
  }

  private bufferToFloatArray(buffer: Buffer, dimensions: number): number[] {
    const arr: number[] = [];
    for (let i = 0; i < dimensions; i++) arr.push(buffer.readFloatLE(i * 4));
    return arr;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function getUnifiedMemory(config?: Partial<UnifiedMemoryConfig>): UnifiedMemoryManager {
  return UnifiedMemoryManager.getInstance(config);
}

export async function initializeUnifiedMemory(
  config?: Partial<UnifiedMemoryConfig>
): Promise<UnifiedMemoryManager> {
  const manager = getUnifiedMemory(config);
  await manager.initialize();
  return manager;
}

export function resetUnifiedMemory(): void {
  UnifiedMemoryManager.resetInstance();
}

// ============================================================================
// Process Exit Handlers
// ============================================================================

let exitHandlersRegistered = false;

function registerExitHandlers(): void {
  if (exitHandlersRegistered) return;
  exitHandlersRegistered = true;

  const cleanup = (): void => {
    try {
      const instance = UnifiedMemoryManager['instance'];
      if (instance) instance.close();
    } catch (error) {
      console.debug('[UnifiedMemory] Cleanup error:', error instanceof Error ? error.message : error);
    }
  };

  process.on('beforeExit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
}

registerExitHandlers();
