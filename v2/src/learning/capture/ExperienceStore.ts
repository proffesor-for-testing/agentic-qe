/**
 * ExperienceStore - Storage layer for captured agent experiences
 *
 * Provides efficient storage and retrieval of captured experiences using SQLite.
 * Supports batch operations, filtering, and automatic cleanup via TTL.
 *
 * Part of the Nightly-Learner Phase 1 implementation.
 *
 * @version 1.0.0
 * @module src/learning/capture/ExperienceStore
 */

import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../../utils/Logger';
import { CapturedExperience } from './ExperienceCapture';

export interface ExperienceStoreConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Enable debug logging */
  debug?: boolean;
}

export interface ExperienceQueryOptions {
  /** Maximum number of results */
  limit?: number;
  /** Skip first N results */
  offset?: number;
  /** Filter by processed status */
  processed?: boolean;
  /** Order by field (created_at, quality_score) */
  orderBy?: 'created_at' | 'quality_score';
  /** Sort direction */
  orderDir?: 'ASC' | 'DESC';
}

export interface ExperienceStats {
  total: number;
  processed: number;
  unprocessed: number;
  byAgentType: Record<string, number>;
  byTaskType: Record<string, number>;
  avgQualityScore: number;
  successRate: number;
}

/**
 * ExperienceStore manages persistent storage of captured experiences
 *
 * @example
 * ```typescript
 * const store = new ExperienceStore({ dbPath: '.agentic-qe/memory.db' });
 *
 * // Store experiences
 * await store.store(experience);
 * await store.storeBatch(experiences);
 *
 * // Query experiences
 * const recent = store.getRecent(24);
 * const unprocessed = store.getUnprocessed(100);
 *
 * // Mark as processed
 * store.markProcessed(['exp-1', 'exp-2']);
 *
 * // Cleanup old data
 * store.cleanup(30); // Remove experiences older than 30 days
 * ```
 */
export class ExperienceStore {
  private db: BetterSqlite3.Database;
  private logger: Logger;
  private config: Required<ExperienceStoreConfig>;

  /**
   * Create a new ExperienceStore
   *
   * @param config - Store configuration
   */
  constructor(config?: ExperienceStoreConfig) {
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
      debug: config?.debug ?? false,
    };

    // Ensure the directory exists before opening the database
    const dbDir = path.dirname(this.config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new BetterSqlite3(this.config.dbPath);
    this.initializeSchema();

    if (this.config.debug) {
      this.logger.debug('[ExperienceStore] Initialized', { dbPath: this.config.dbPath });
    }
  }

  /**
   * Initialize database schema for experience storage
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS captured_experiences (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        task_type TEXT NOT NULL,
        execution TEXT NOT NULL,
        context TEXT NOT NULL,
        outcome TEXT NOT NULL,
        embedding BLOB,
        created_at INTEGER NOT NULL,
        processed INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_exp_agent_type ON captured_experiences(agent_type);
      CREATE INDEX IF NOT EXISTS idx_exp_task_type ON captured_experiences(task_type);
      CREATE INDEX IF NOT EXISTS idx_exp_created_at ON captured_experiences(created_at);
      CREATE INDEX IF NOT EXISTS idx_exp_processed ON captured_experiences(processed);
      CREATE INDEX IF NOT EXISTS idx_exp_quality ON captured_experiences(json_extract(outcome, '$.quality_score'));
    `);
  }

  /**
   * Store a single experience
   *
   * @param experience - Experience to store
   * @returns Promise that resolves when stored
   */
  async store(experience: CapturedExperience): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO captured_experiences
      (id, agent_id, agent_type, task_type, execution, context, outcome, embedding, created_at, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    stmt.run(
      experience.id,
      experience.agentId,
      experience.agentType,
      experience.taskType,
      JSON.stringify(experience.execution),
      JSON.stringify(experience.context),
      JSON.stringify(experience.outcome),
      experience.embedding ? Buffer.from(new Float32Array(experience.embedding).buffer) : null,
      experience.timestamp.getTime()
    );

    if (this.config.debug) {
      this.logger.debug('[ExperienceStore] Stored experience', {
        id: experience.id,
        agentType: experience.agentType,
        taskType: experience.taskType,
      });
    }
  }

  /**
   * Store multiple experiences in a batch
   *
   * @param experiences - Experiences to store
   * @returns Number of experiences stored
   */
  async storeBatch(experiences: CapturedExperience[]): Promise<number> {
    if (experiences.length === 0) return 0;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO captured_experiences
      (id, agent_id, agent_type, task_type, execution, context, outcome, embedding, created_at, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const insertMany = this.db.transaction((exps: CapturedExperience[]) => {
      for (const exp of exps) {
        stmt.run(
          exp.id,
          exp.agentId,
          exp.agentType,
          exp.taskType,
          JSON.stringify(exp.execution),
          JSON.stringify(exp.context),
          JSON.stringify(exp.outcome),
          exp.embedding ? Buffer.from(new Float32Array(exp.embedding).buffer) : null,
          exp.timestamp.getTime()
        );
      }
      return exps.length;
    });

    const count = insertMany(experiences);

    this.logger.info('[ExperienceStore] Batch stored', { count });

    return count;
  }

  /**
   * Get experiences by agent type
   *
   * @param agentType - Agent type to filter by
   * @param limit - Maximum number of results (default: 100)
   * @returns Array of experiences
   */
  getByAgentType(agentType: string, limit: number = 100): CapturedExperience[] {
    const rows = this.db.prepare(`
      SELECT * FROM captured_experiences
      WHERE agent_type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(agentType, limit) as any[];

    return rows.map(row => this.rowToExperience(row));
  }

  /**
   * Get experiences by task type
   *
   * @param taskType - Task type to filter by
   * @param limit - Maximum number of results (default: 100)
   * @returns Array of experiences
   */
  getByTaskType(taskType: string, limit: number = 100): CapturedExperience[] {
    const rows = this.db.prepare(`
      SELECT * FROM captured_experiences
      WHERE task_type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(taskType, limit) as any[];

    return rows.map(row => this.rowToExperience(row));
  }

  /**
   * Get unprocessed experiences
   *
   * @param limit - Maximum number of results (default: 100)
   * @returns Array of unprocessed experiences
   */
  getUnprocessed(limit: number = 100): CapturedExperience[] {
    const rows = this.db.prepare(`
      SELECT * FROM captured_experiences
      WHERE processed = 0
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => this.rowToExperience(row));
  }

  /**
   * Mark experiences as processed
   *
   * @param ids - Experience IDs to mark as processed
   */
  markProcessed(ids: string[]): void {
    if (ids.length === 0) return;

    const stmt = this.db.prepare(`
      UPDATE captured_experiences SET processed = 1 WHERE id = ?
    `);

    const updateMany = this.db.transaction((expIds: string[]) => {
      for (const id of expIds) {
        stmt.run(id);
      }
    });

    updateMany(ids);

    this.logger.info('[ExperienceStore] Marked processed', { count: ids.length });
  }

  /**
   * Get recent experiences within a time window
   *
   * @param hours - Number of hours to look back (default: 24)
   * @param limit - Maximum number of results (default: 100)
   * @returns Array of recent experiences
   */
  getRecent(hours: number = 24, limit: number = 100): CapturedExperience[] {
    const since = Date.now() - hours * 60 * 60 * 1000;

    const rows = this.db.prepare(`
      SELECT * FROM captured_experiences
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(since, limit) as any[];

    return rows.map(row => this.rowToExperience(row));
  }

  /**
   * Get experiences within a date range
   *
   * @param startDate - Start of date range
   * @param endDate - End of date range
   * @param options - Query options
   * @returns Array of experiences
   */
  getByDateRange(
    startDate: Date,
    endDate: Date,
    options?: ExperienceQueryOptions
  ): CapturedExperience[] {
    const {
      limit = 100,
      offset = 0,
      processed,
      orderBy = 'created_at',
      orderDir = 'DESC',
    } = options || {};

    let query = `
      SELECT * FROM captured_experiences
      WHERE created_at >= ? AND created_at <= ?
    `;

    const params: any[] = [startDate.getTime(), endDate.getTime()];

    if (processed !== undefined) {
      query += ` AND processed = ?`;
      params.push(processed ? 1 : 0);
    }

    query += ` ORDER BY ${orderBy} ${orderDir}`;
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map(row => this.rowToExperience(row));
  }

  /**
   * Get top performing experiences by quality score
   *
   * @param limit - Maximum number of results (default: 10)
   * @returns Array of high-quality experiences
   */
  getTopPerforming(limit: number = 10): CapturedExperience[] {
    const rows = this.db.prepare(`
      SELECT * FROM captured_experiences
      WHERE json_extract(outcome, '$.quality_score') >= 0.7
      ORDER BY json_extract(outcome, '$.quality_score') DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => this.rowToExperience(row));
  }

  /**
   * Get experiences by ID
   *
   * @param ids - Experience IDs to retrieve
   * @returns Array of experiences
   */
  getByIds(ids: string[]): CapturedExperience[] {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT * FROM captured_experiences
      WHERE id IN (${placeholders})
    `).all(...ids) as any[];

    return rows.map(row => this.rowToExperience(row));
  }

  /**
   * Get storage statistics
   *
   * @returns Storage statistics
   */
  getStats(): ExperienceStats {
    const totalRow = this.db.prepare('SELECT COUNT(*) as count FROM captured_experiences').get() as any;
    const processedRow = this.db.prepare('SELECT COUNT(*) as count FROM captured_experiences WHERE processed = 1').get() as any;

    const total = totalRow.count;
    const processed = processedRow.count;
    const unprocessed = total - processed;

    // By agent type
    const agentTypeRows = this.db.prepare(`
      SELECT agent_type, COUNT(*) as count
      FROM captured_experiences
      GROUP BY agent_type
    `).all() as any[];

    const byAgentType: Record<string, number> = {};
    for (const row of agentTypeRows) {
      byAgentType[row.agent_type] = row.count;
    }

    // By task type
    const taskTypeRows = this.db.prepare(`
      SELECT task_type, COUNT(*) as count
      FROM captured_experiences
      GROUP BY task_type
    `).all() as any[];

    const byTaskType: Record<string, number> = {};
    for (const row of taskTypeRows) {
      byTaskType[row.task_type] = row.count;
    }

    // Average quality score
    const qualityRow = this.db.prepare(`
      SELECT AVG(json_extract(outcome, '$.quality_score')) as avg_score
      FROM captured_experiences
    `).get() as any;

    const avgQualityScore = qualityRow.avg_score || 0;

    // Success rate
    const successRow = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM captured_experiences
      WHERE json_extract(execution, '$.success') = 1
    `).get() as any;

    const successRate = total > 0 ? successRow.count / total : 0;

    return {
      total,
      processed,
      unprocessed,
      byAgentType,
      byTaskType,
      avgQualityScore,
      successRate,
    };
  }

  /**
   * Count experiences matching criteria
   *
   * @param agentType - Optional agent type filter
   * @param taskType - Optional task type filter
   * @param processed - Optional processed status filter
   * @returns Count of matching experiences
   */
  count(agentType?: string, taskType?: string, processed?: boolean): number {
    let query = 'SELECT COUNT(*) as count FROM captured_experiences WHERE 1=1';
    const params: any[] = [];

    if (agentType) {
      query += ' AND agent_type = ?';
      params.push(agentType);
    }

    if (taskType) {
      query += ' AND task_type = ?';
      params.push(taskType);
    }

    if (processed !== undefined) {
      query += ' AND processed = ?';
      params.push(processed ? 1 : 0);
    }

    const row = this.db.prepare(query).get(...params) as any;
    return row.count;
  }

  /**
   * Delete experiences older than specified days (TTL cleanup)
   *
   * @param days - Delete experiences older than this many days
   * @returns Number of experiences deleted
   */
  cleanup(days: number = 30): number {
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const result = this.db.prepare(`
      DELETE FROM captured_experiences
      WHERE created_at < ?
    `).run(cutoffTime);

    this.logger.info('[ExperienceStore] Cleanup completed', {
      days,
      deleted: result.changes,
    });

    return result.changes;
  }

  /**
   * Delete all experiences (for testing)
   */
  clear(): void {
    this.db.prepare('DELETE FROM captured_experiences').run();
    this.logger.warn('[ExperienceStore] All experiences cleared');
  }

  /**
   * Convert database row to CapturedExperience
   *
   * @param row - Database row
   * @returns CapturedExperience object
   */
  private rowToExperience(row: any): CapturedExperience {
    return {
      id: row.id,
      agentId: row.agent_id,
      agentType: row.agent_type,
      taskType: row.task_type,
      execution: JSON.parse(row.execution),
      context: JSON.parse(row.context),
      outcome: JSON.parse(row.outcome),
      timestamp: new Date(row.created_at),
      embedding: row.embedding ? Array.from(new Float32Array(row.embedding.buffer)) : undefined,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    if (this.config.debug) {
      this.logger.debug('[ExperienceStore] Closed');
    }
  }

  /**
   * Get database instance (for advanced queries)
   *
   * @returns Database instance
   */
  getDatabase(): BetterSqlite3.Database {
    return this.db;
  }
}

export default ExperienceStore;
