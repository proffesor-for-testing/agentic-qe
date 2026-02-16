/**
 * Agentic QE v3 - Q-Value Persistence Store
 *
 * SQLite-backed storage for Q-values used by reinforcement learning algorithms.
 * Provides persistent storage for Q-tables, enabling:
 * - Cross-session learning continuity
 * - Multi-agent Q-value sharing
 * - Algorithm state persistence
 *
 * Uses better-sqlite3 for synchronous, high-performance SQLite operations.
 */

import { type Database as DatabaseType, type Statement } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { RLAlgorithmType } from '../interfaces.js';
import { getUnifiedPersistence, type UnifiedPersistenceManager } from '../../../kernel/unified-persistence.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Q-value entry stored in the database
 */
export interface QValueEntry {
  id: string;
  algorithm: RLAlgorithmType;
  agentId: string;
  stateKey: string;
  actionKey: string;
  qValue: number;
  visits: number;
  lastReward: number | null;
  domain: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Statistics about the Q-value store
 */
export interface QValueStats {
  totalEntries: number;
  uniqueAgents: number;
  uniqueStates: number;
  byAlgorithm: Record<string, number>;
  byDomain: Record<string, number>;
  averageVisits: number;
  averageQValue: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

/**
 * Configuration for the Q-value store
 */
export interface QValueStoreConfig {
  /** Default algorithm if not specified */
  defaultAlgorithm: RLAlgorithmType;
}

export const DEFAULT_QVALUE_STORE_CONFIG: QValueStoreConfig = {
  defaultAlgorithm: 'q-learning',
};

/**
 * Database row structure for Q-value queries
 */
interface QValueRow {
  id: string;
  algorithm: string;
  agent_id: string;
  state_key: string;
  action_key: string;
  q_value: number;
  visits: number;
  last_reward: number | null;
  domain: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Q-Value Store Implementation
// ============================================================================

/**
 * SQLite-backed Q-value persistence store
 *
 * Stores Q-values for reinforcement learning algorithms with:
 * - Unique constraint on (algorithm, agent_id, state_key, action_key)
 * - Visit counting for exploration tracking
 * - Last reward for temporal analysis
 * - Domain tagging for multi-domain learning
 */
export class QValueStore {
  private db: DatabaseType | null = null;
  private readonly config: QValueStoreConfig;
  private prepared: Map<string, Statement> = new Map();
  private initialized = false;
  private persistence: UnifiedPersistenceManager | null = null;

  constructor(config?: Partial<QValueStoreConfig>) {
    this.config = { ...DEFAULT_QVALUE_STORE_CONFIG, ...config };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize using unified persistence
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.persistence = getUnifiedPersistence();
      if (!this.persistence.isInitialized()) {
        await this.persistence.initialize();
      }
      this.db = this.persistence.getDatabase();
      this.prepareStatements();
      this.initialized = true;
      console.log(`[QValueStore] Initialized: ${this.persistence.getDbPath()}`);
    } catch (error) {
      throw new Error(
        `Failed to initialize QValueStore: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Prepare commonly used statements
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.prepared.set(
      'getQValue',
      this.db.prepare(`
        SELECT q_value FROM rl_q_values
        WHERE agent_id = ? AND state_key = ? AND action_key = ? AND algorithm = ?
      `)
    );

    this.prepared.set(
      'upsertQValue',
      this.db.prepare(`
        INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value, visits, last_reward, domain)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(algorithm, agent_id, state_key, action_key) DO UPDATE SET
          q_value = excluded.q_value,
          last_reward = excluded.last_reward,
          updated_at = datetime('now')
      `)
    );

    this.prepared.set(
      'incrementVisits',
      this.db.prepare(`
        UPDATE rl_q_values
        SET visits = visits + 1, updated_at = datetime('now')
        WHERE agent_id = ? AND state_key = ? AND action_key = ? AND algorithm = ?
      `)
    );

    this.prepared.set(
      'getTopActions',
      this.db.prepare(`
        SELECT * FROM rl_q_values
        WHERE agent_id = ? AND state_key = ? AND algorithm = ?
        ORDER BY q_value DESC
        LIMIT ?
      `)
    );

    this.prepared.set(
      'getEntry',
      this.db.prepare(`
        SELECT * FROM rl_q_values
        WHERE agent_id = ? AND state_key = ? AND action_key = ? AND algorithm = ?
      `)
    );

    this.prepared.set(
      'getAllForAgent',
      this.db.prepare(`
        SELECT * FROM rl_q_values
        WHERE agent_id = ? AND algorithm = ?
      `)
    );

    this.prepared.set(
      'deleteEntry',
      this.db.prepare(`
        DELETE FROM rl_q_values
        WHERE agent_id = ? AND state_key = ? AND action_key = ? AND algorithm = ?
      `)
    );

    this.prepared.set(
      'pruneOld',
      this.db.prepare(`
        DELETE FROM rl_q_values
        WHERE updated_at < datetime('now', '-' || ? || ' days')
      `)
    );

    this.prepared.set(
      'countByAlgorithm',
      this.db.prepare(`
        SELECT algorithm, COUNT(*) as count FROM rl_q_values GROUP BY algorithm
      `)
    );

    this.prepared.set(
      'countByDomain',
      this.db.prepare(`
        SELECT domain, COUNT(*) as count FROM rl_q_values WHERE domain IS NOT NULL GROUP BY domain
      `)
    );

    this.prepared.set(
      'getStats',
      this.db.prepare(`
        SELECT
          COUNT(*) as total_entries,
          COUNT(DISTINCT agent_id) as unique_agents,
          COUNT(DISTINCT state_key) as unique_states,
          AVG(visits) as avg_visits,
          AVG(q_value) as avg_q_value,
          MIN(created_at) as oldest_entry,
          MAX(created_at) as newest_entry
        FROM rl_q_values
      `)
    );
  }

  // ==========================================================================
  // Core Methods
  // ==========================================================================

  /**
   * Get Q-value for a state-action pair
   */
  async getQValue(
    agentId: string,
    stateKey: string,
    actionKey: string,
    algorithm?: RLAlgorithmType
  ): Promise<number> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getQValue');
    if (!stmt) throw new Error('Statement not prepared');

    const alg = algorithm ?? this.config.defaultAlgorithm;
    const row = stmt.get(agentId, stateKey, actionKey, alg) as { q_value: number } | undefined;

    return row?.q_value ?? 0;
  }

  /**
   * Set Q-value for a state-action pair
   */
  async setQValue(
    agentId: string,
    stateKey: string,
    actionKey: string,
    value: number,
    reward?: number,
    options?: { algorithm?: RLAlgorithmType; domain?: string }
  ): Promise<void> {
    this.ensureInitialized();

    const stmt = this.prepared.get('upsertQValue');
    if (!stmt) throw new Error('Statement not prepared');

    const id = uuidv4();
    const alg = options?.algorithm ?? this.config.defaultAlgorithm;

    stmt.run(id, alg, agentId, stateKey, actionKey, value, reward ?? null, options?.domain ?? null);
  }

  /**
   * Increment visit count for a state-action pair
   */
  async incrementVisits(
    agentId: string,
    stateKey: string,
    actionKey: string,
    algorithm?: RLAlgorithmType
  ): Promise<void> {
    this.ensureInitialized();

    const stmt = this.prepared.get('incrementVisits');
    if (!stmt) throw new Error('Statement not prepared');

    const alg = algorithm ?? this.config.defaultAlgorithm;
    stmt.run(agentId, stateKey, actionKey, alg);
  }

  /**
   * Get top actions by Q-value for a state
   */
  async getTopActions(
    agentId: string,
    stateKey: string,
    limit: number = 10,
    algorithm?: RLAlgorithmType
  ): Promise<QValueEntry[]> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getTopActions');
    if (!stmt) throw new Error('Statement not prepared');

    const alg = algorithm ?? this.config.defaultAlgorithm;
    const rows = stmt.all(agentId, stateKey, alg, limit) as QValueRow[];

    return rows.map((row) => this.rowToEntry(row));
  }

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  /**
   * Export all Q-values for an agent as a nested Map
   */
  async exportForAgent(
    agentId: string,
    algorithm?: RLAlgorithmType
  ): Promise<Map<string, Map<string, number>>> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getAllForAgent');
    if (!stmt) throw new Error('Statement not prepared');

    const alg = algorithm ?? this.config.defaultAlgorithm;
    const rows = stmt.all(agentId, alg) as QValueRow[];

    const qTable = new Map<string, Map<string, number>>();

    for (const row of rows) {
      const stateKey = row.state_key;
      const actionKey = row.action_key;
      const qValue = row.q_value;

      if (!qTable.has(stateKey)) {
        qTable.set(stateKey, new Map<string, number>());
      }
      qTable.get(stateKey)!.set(actionKey, qValue);
    }

    return qTable;
  }

  /**
   * Import Q-values from a Map structure
   */
  async importFromMap(
    agentId: string,
    qTable: Map<string, Map<string, number>>,
    options?: { algorithm?: RLAlgorithmType; domain?: string }
  ): Promise<void> {
    this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.prepared.get('upsertQValue');
    if (!stmt) throw new Error('Statement not prepared');

    const alg = options?.algorithm ?? this.config.defaultAlgorithm;

    // Use transaction for atomicity
    const transaction = this.db.transaction(() => {
      for (const [stateKey, actions] of qTable) {
        for (const [actionKey, qValue] of actions) {
          const id = uuidv4();
          stmt.run(id, alg, agentId, stateKey, actionKey, qValue, null, options?.domain ?? null);
        }
      }
    });

    transaction();
  }

  // ==========================================================================
  // Maintenance
  // ==========================================================================

  /**
   * Prune entries older than specified days
   */
  async pruneOldEntries(olderThanDays: number): Promise<number> {
    this.ensureInitialized();

    const stmt = this.prepared.get('pruneOld');
    if (!stmt) throw new Error('Statement not prepared');

    const result = stmt.run(olderThanDays);
    return result.changes;
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<QValueStats> {
    this.ensureInitialized();

    const statsStmt = this.prepared.get('getStats');
    const algStmt = this.prepared.get('countByAlgorithm');
    const domainStmt = this.prepared.get('countByDomain');

    if (!statsStmt || !algStmt || !domainStmt) {
      throw new Error('Statements not prepared');
    }

    interface QValueStatsRow {
      total_entries: number;
      unique_agents: number;
      unique_states: number;
      avg_visits: number | null;
      avg_q_value: number | null;
      oldest_entry: string | null;
      newest_entry: string | null;
    }

    interface AlgorithmCountRow {
      algorithm: string;
      count: number;
    }

    interface DomainCountRow {
      domain: string | null;
      count: number;
    }

    const statsRow = statsStmt.get() as QValueStatsRow;
    const algRows = algStmt.all() as AlgorithmCountRow[];
    const domainRows = domainStmt.all() as DomainCountRow[];

    const byAlgorithm: Record<string, number> = {};
    for (const row of algRows) {
      byAlgorithm[row.algorithm] = row.count;
    }

    const byDomain: Record<string, number> = {};
    for (const row of domainRows) {
      if (row.domain) {
        byDomain[row.domain] = row.count;
      }
    }

    return {
      totalEntries: statsRow.total_entries,
      uniqueAgents: statsRow.unique_agents,
      uniqueStates: statsRow.unique_states,
      byAlgorithm,
      byDomain,
      averageVisits: statsRow.avg_visits ?? 0,
      averageQValue: statsRow.avg_q_value ?? 0,
      oldestEntry: statsRow.oldest_entry ? new Date(statsRow.oldest_entry) : null,
      newestEntry: statsRow.newest_entry ? new Date(statsRow.newest_entry) : null,
    };
  }

  /**
   * Release resources (does NOT close the shared database)
   */
  async close(): Promise<void> {
    this.prepared.clear();
    this.db = null;
    this.persistence = null;
    this.initialized = false;
  }

  // ==========================================================================
  // Advanced Operations
  // ==========================================================================

  /**
   * Get a specific entry
   */
  async getEntry(
    agentId: string,
    stateKey: string,
    actionKey: string,
    algorithm?: RLAlgorithmType
  ): Promise<QValueEntry | null> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getEntry');
    if (!stmt) throw new Error('Statement not prepared');

    const alg = algorithm ?? this.config.defaultAlgorithm;
    const row = stmt.get(agentId, stateKey, actionKey, alg) as QValueRow | undefined;

    return row ? this.rowToEntry(row) : null;
  }

  /**
   * Delete a specific entry
   */
  async deleteEntry(
    agentId: string,
    stateKey: string,
    actionKey: string,
    algorithm?: RLAlgorithmType
  ): Promise<boolean> {
    this.ensureInitialized();

    const stmt = this.prepared.get('deleteEntry');
    if (!stmt) throw new Error('Statement not prepared');

    const alg = algorithm ?? this.config.defaultAlgorithm;
    const result = stmt.run(agentId, stateKey, actionKey, alg);

    return result.changes > 0;
  }

  /**
   * Check if the store is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the database path
   */
  getDbPath(): string {
    return this.persistence?.getDbPath() ?? '';
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('QValueStore not initialized. Call initialize() first.');
    }
  }

  private rowToEntry(row: QValueRow): QValueEntry {
    return {
      id: row.id,
      algorithm: row.algorithm as RLAlgorithmType,
      agentId: row.agent_id,
      stateKey: row.state_key,
      actionKey: row.action_key,
      qValue: row.q_value,
      visits: row.visits,
      lastReward: row.last_reward,
      domain: row.domain,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Q-value store with optional configuration
 */
export function createQValueStore(config?: Partial<QValueStoreConfig>): QValueStore {
  return new QValueStore(config);
}
