import { BaseDAO } from './BaseDAO';
import { SecureRandom } from '../../../utils/SecureRandom';

/**
 * Event interface for event streaming
 */
export interface Event {
  id?: string;
  type: string;
  payload: any;
  timestamp?: number;
  source: string;
  ttl?: number;
}

/**
 * EventDAO - Data Access Object for event stream (Table 3)
 *
 * Handles all database operations for the events table
 * Manages event streaming and coordination between agents
 */
export class EventDAO extends BaseDAO {
  async createTable(): Promise<void> {
    await this.run(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        source TEXT NOT NULL,
        expires_at INTEGER,
        consumed INTEGER DEFAULT 0
      )
    `);
  }

  async createIndexes(): Promise<void> {
    await this.run(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_events_source ON events(source)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_events_expires ON events(expires_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_events_consumed ON events(consumed)`);
  }

  /**
   * Insert a new event
   */
  async insert(event: Event): Promise<string> {
    const id = event.id || SecureRandom.generateId();
    const timestamp = event.timestamp || Date.now();
    const expiresAt = event.ttl ? timestamp + (event.ttl * 1000) : null;

    await this.run(
      `INSERT INTO events (id, type, payload, timestamp, source, expires_at, consumed)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        event.type,
        JSON.stringify(event.payload),
        timestamp,
        event.source,
        expiresAt
      ]
    );

    return id;
  }

  /**
   * Find an event by ID
   */
  async findById(id: string): Promise<Event | null> {
    const row = await this.queryOne<any>(
      `SELECT * FROM events WHERE id = ?`,
      [id]
    );
    return row ? this.mapToEvent(row) : null;
  }

  /**
   * Find events by type
   */
  async findByType(type: string, limit: number = 100): Promise<Event[]> {
    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT * FROM events
       WHERE type = ?
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY timestamp DESC
       LIMIT ?`,
      [type, now, limit]
    );
    return rows.map(row => this.mapToEvent(row));
  }

  /**
   * Find events by source agent
   */
  async findBySource(source: string, limit: number = 100): Promise<Event[]> {
    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT * FROM events
       WHERE source = ?
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY timestamp DESC
       LIMIT ?`,
      [source, now, limit]
    );
    return rows.map(row => this.mapToEvent(row));
  }

  /**
   * Find events since a timestamp
   */
  async findSince(since: number, limit: number = 100): Promise<Event[]> {
    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT * FROM events
       WHERE timestamp > ?
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY timestamp ASC
       LIMIT ?`,
      [since, now, limit]
    );
    return rows.map(row => this.mapToEvent(row));
  }

  /**
   * Get unconsumed events
   */
  async findUnconsumed(limit: number = 100): Promise<Event[]> {
    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT * FROM events
       WHERE consumed = 0
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY timestamp ASC
       LIMIT ?`,
      [now, limit]
    );
    return rows.map(row => this.mapToEvent(row));
  }

  /**
   * Mark event as consumed
   */
  async markConsumed(id: string): Promise<void> {
    await this.run(
      `UPDATE events SET consumed = 1 WHERE id = ?`,
      [id]
    );
  }

  /**
   * Delete an event by ID
   */
  async deleteById(id: string): Promise<void> {
    await this.run(`DELETE FROM events WHERE id = ?`, [id]);
  }

  /**
   * Delete events by type
   */
  async deleteByType(type: string): Promise<void> {
    await this.run(`DELETE FROM events WHERE type = ?`, [type]);
  }

  /**
   * Delete expired events
   */
  async deleteExpired(): Promise<void> {
    const now = Date.now();
    await this.run(
      `DELETE FROM events WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );
  }

  /**
   * Delete old consumed events
   */
  async deleteConsumedOlderThan(timestamp: number): Promise<void> {
    await this.run(
      `DELETE FROM events WHERE consumed = 1 AND timestamp < ?`,
      [timestamp]
    );
  }

  /**
   * Count total events
   */
  async count(): Promise<number> {
    const result = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM events`
    );
    return result?.count || 0;
  }

  /**
   * Count events by type
   */
  async countByType(type: string): Promise<number> {
    const result = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM events WHERE type = ?`,
      [type]
    );
    return result?.count || 0;
  }

  /**
   * Get event statistics by type
   */
  async getTypeCounts(): Promise<Record<string, number>> {
    const rows = await this.queryAll<{ type: string; count: number }>(
      `SELECT type, COUNT(*) as count FROM events GROUP BY type`
    );

    const counts: Record<string, number> = {};
    rows.forEach(row => {
      counts[row.type] = row.count;
    });
    return counts;
  }

  /**
   * Map database row to Event object
   */
  private mapToEvent(row: any): Event {
    return {
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      timestamp: row.timestamp,
      source: row.source,
      ttl: row.expires_at ? (row.expires_at - row.timestamp) / 1000 : undefined
    };
  }
}
