import { BaseDAO } from './BaseDAO';
import { SecureRandom } from '../../../utils/SecureRandom';

/**
 * Hint interface for blackboard pattern
 */
export interface Hint {
  id?: string;
  topic: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  agentId: string;
  metadata?: Record<string, any>;
  createdAt: number;
  expiresAt?: number;
  consumed?: boolean;
}

/**
 * BlackboardDAO - Data Access Object for blackboard pattern hints (Table 2b)
 *
 * Handles all database operations for the blackboard_hints table
 * Implements the blackboard architectural pattern for agent coordination
 */
export class BlackboardDAO extends BaseDAO {
  async createTable(): Promise<void> {
    await this.run(`
      CREATE TABLE IF NOT EXISTS blackboard_hints (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        message TEXT NOT NULL,
        priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high', 'critical')),
        agent_id TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        consumed INTEGER DEFAULT 0
      )
    `);
  }

  async createIndexes(): Promise<void> {
    await this.run(`CREATE INDEX IF NOT EXISTS idx_hints_topic ON blackboard_hints(topic)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_hints_priority ON blackboard_hints(priority)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_hints_agent ON blackboard_hints(agent_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_hints_created ON blackboard_hints(created_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_hints_expires ON blackboard_hints(expires_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_hints_consumed ON blackboard_hints(consumed)`);
  }

  /**
   * Post a hint to the blackboard
   */
  async post(hint: Hint): Promise<string> {
    const id = hint.id || this.generateHintId();
    const expiresAt = hint.expiresAt || null;

    await this.run(
      `INSERT INTO blackboard_hints
       (id, topic, message, priority, agent_id, metadata, created_at, expires_at, consumed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        hint.topic,
        hint.message,
        hint.priority,
        hint.agentId,
        hint.metadata ? JSON.stringify(hint.metadata) : null,
        hint.createdAt,
        expiresAt
      ]
    );

    return id;
  }

  /**
   * Read hints from blackboard by topic
   */
  async findByTopic(
    topic: string,
    minPriority?: Hint['priority'],
    limit: number = 50
  ): Promise<Hint[]> {
    const now = Date.now();
    let query = `SELECT * FROM blackboard_hints
                 WHERE topic = ?
                 AND consumed = 0
                 AND (expires_at IS NULL OR expires_at > ?)`;
    const params: any[] = [topic, now];

    if (minPriority) {
      const priorityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
      const minPriorityValue = priorityOrder[minPriority];
      query += ` AND (
        (priority = 'critical' AND 4 >= ?) OR
        (priority = 'high' AND 3 >= ?) OR
        (priority = 'medium' AND 2 >= ?) OR
        (priority = 'low' AND 1 >= ?)
      )`;
      params.push(minPriorityValue, minPriorityValue, minPriorityValue, minPriorityValue);
    }

    query += ` ORDER BY
      CASE priority
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      created_at ASC
      LIMIT ?`;
    params.push(limit);

    const rows = await this.queryAll<any>(query, params);
    return rows.map(row => this.mapToHint(row));
  }

  /**
   * Find hints by agent
   */
  async findByAgent(agentId: string, limit: number = 50): Promise<Hint[]> {
    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT * FROM blackboard_hints
       WHERE agent_id = ?
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC
       LIMIT ?`,
      [agentId, now, limit]
    );
    return rows.map(row => this.mapToHint(row));
  }

  /**
   * Find hints since a timestamp
   */
  async findSince(
    topic: string,
    since: number,
    limit: number = 50
  ): Promise<Hint[]> {
    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT * FROM blackboard_hints
       WHERE topic = ?
       AND created_at > ?
       AND consumed = 0
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at ASC
       LIMIT ?`,
      [topic, since, now, limit]
    );
    return rows.map(row => this.mapToHint(row));
  }

  /**
   * Mark hint as consumed
   */
  async markConsumed(id: string): Promise<void> {
    await this.run(
      `UPDATE blackboard_hints SET consumed = 1 WHERE id = ?`,
      [id]
    );
  }

  /**
   * Mark multiple hints as consumed
   */
  async markManyConsumed(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    await this.run(
      `UPDATE blackboard_hints SET consumed = 1 WHERE id IN (${placeholders})`,
      ids
    );
  }

  /**
   * Delete a hint by ID
   */
  async deleteById(id: string): Promise<void> {
    await this.run(`DELETE FROM blackboard_hints WHERE id = ?`, [id]);
  }

  /**
   * Delete hints by topic
   */
  async deleteByTopic(topic: string): Promise<void> {
    await this.run(`DELETE FROM blackboard_hints WHERE topic = ?`, [topic]);
  }

  /**
   * Delete expired hints
   */
  async deleteExpired(): Promise<void> {
    const now = Date.now();
    await this.run(
      `DELETE FROM blackboard_hints WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );
  }

  /**
   * Delete old consumed hints
   */
  async deleteConsumedOlderThan(timestamp: number): Promise<void> {
    await this.run(
      `DELETE FROM blackboard_hints WHERE consumed = 1 AND created_at < ?`,
      [timestamp]
    );
  }

  /**
   * Count total hints
   */
  async count(): Promise<number> {
    const result = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM blackboard_hints`
    );
    return result?.count || 0;
  }

  /**
   * Count unconsumed hints by topic
   */
  async countByTopic(topic: string): Promise<number> {
    const now = Date.now();
    const result = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM blackboard_hints
       WHERE topic = ?
       AND consumed = 0
       AND (expires_at IS NULL OR expires_at > ?)`,
      [topic, now]
    );
    return result?.count || 0;
  }

  /**
   * Get hint statistics by priority
   */
  async getPriorityCounts(): Promise<Record<string, number>> {
    const rows = await this.queryAll<{ priority: string; count: number }>(
      `SELECT priority, COUNT(*) as count FROM blackboard_hints
       WHERE consumed = 0
       GROUP BY priority`
    );

    const counts: Record<string, number> = {};
    rows.forEach(row => {
      counts[row.priority] = row.count;
    });
    return counts;
  }

  /**
   * Get hint statistics by topic
   */
  async getTopicCounts(): Promise<Record<string, number>> {
    const rows = await this.queryAll<{ topic: string; count: number }>(
      `SELECT topic, COUNT(*) as count FROM blackboard_hints
       WHERE consumed = 0
       GROUP BY topic`
    );

    const counts: Record<string, number> = {};
    rows.forEach(row => {
      counts[row.topic] = row.count;
    });
    return counts;
  }

  /**
   * Generate a unique hint ID
   */
  private generateHintId(): string {
    return `hint_${Date.now()}_${SecureRandom.generateId(13)}`;
  }

  /**
   * Map database row to Hint object
   */
  private mapToHint(row: any): Hint {
    return {
      id: row.id,
      topic: row.topic,
      message: row.message,
      priority: row.priority as Hint['priority'],
      agentId: row.agent_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumed: row.consumed === 1
    };
  }
}
