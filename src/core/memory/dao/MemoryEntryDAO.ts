import { BaseDAO } from './BaseDAO';
import {
  MemoryEntry,
  StoreOptions,
  AccessLevel
} from '../SwarmMemoryManager';

/**
 * MemoryEntryDAO - Data Access Object for core memory entries (Table 1)
 *
 * Handles all database operations for the memory_entries table
 * Separates data access from business logic
 */
export class MemoryEntryDAO extends BaseDAO {
  async createTable(): Promise<void> {
    await this.run(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        key TEXT NOT NULL,
        partition TEXT NOT NULL DEFAULT 'default',
        value TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        owner TEXT,
        access_level TEXT DEFAULT 'private',
        team_id TEXT,
        swarm_id TEXT,
        PRIMARY KEY (key, partition)
      )
    `);
  }

  async createIndexes(): Promise<void> {
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_partition ON memory_entries(partition)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory_entries(expires_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_owner ON memory_entries(owner)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_access ON memory_entries(access_level)`);
  }

  /**
   * Insert or replace a memory entry
   */
  async insert(entry: MemoryEntry): Promise<void> {
    await this.run(
      `INSERT OR REPLACE INTO memory_entries
       (key, partition, value, metadata, created_at, expires_at, owner, access_level, team_id, swarm_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.key,
        entry.partition || 'default',
        JSON.stringify(entry.value),
        null, // metadata handled separately
        entry.createdAt,
        entry.expiresAt || null,
        entry.owner || 'system',
        entry.accessLevel || AccessLevel.PRIVATE,
        entry.teamId || null,
        entry.swarmId || null
      ]
    );
  }

  /**
   * Find a memory entry by key and partition
   */
  async findByKey(
    key: string,
    partition: string,
    includeExpired: boolean = false
  ): Promise<MemoryEntry | null> {
    const now = Date.now();
    let query = `SELECT * FROM memory_entries WHERE key = ? AND partition = ?`;
    const params: any[] = [key, partition];

    if (!includeExpired) {
      query += ` AND (expires_at IS NULL OR expires_at > ?)`;
      params.push(now);
    }

    const row = await this.queryOne<any>(query, params);
    return row ? this.mapToEntry(row) : null;
  }

  /**
   * Find memory entries by pattern match on key
   */
  async findByPattern(
    pattern: string,
    partition: string,
    includeExpired: boolean = false
  ): Promise<MemoryEntry[]> {
    const now = Date.now();
    let query = `SELECT * FROM memory_entries WHERE partition = ? AND key LIKE ?`;
    const params: any[] = [partition, pattern];

    if (!includeExpired) {
      query += ` AND (expires_at IS NULL OR expires_at > ?)`;
      params.push(now);
    }

    const rows = await this.queryAll<any>(query, params);
    return rows.map(row => this.mapToEntry(row));
  }

  /**
   * Delete a memory entry by key and partition
   */
  async deleteByKey(key: string, partition: string): Promise<void> {
    await this.run(
      `DELETE FROM memory_entries WHERE key = ? AND partition = ?`,
      [key, partition]
    );
  }

  /**
   * Delete all entries in a partition
   */
  async deleteByPartition(partition: string): Promise<void> {
    await this.run(`DELETE FROM memory_entries WHERE partition = ?`, [partition]);
  }

  /**
   * Delete all expired entries
   */
  async deleteExpired(): Promise<void> {
    const now = Date.now();
    await this.run(
      `DELETE FROM memory_entries WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );
  }

  /**
   * Count total memory entries
   */
  async count(): Promise<number> {
    const result = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM memory_entries`
    );
    return result?.count || 0;
  }

  /**
   * Get list of distinct partitions
   */
  async getPartitions(): Promise<string[]> {
    const rows = await this.queryAll<{ partition: string }>(
      `SELECT DISTINCT partition FROM memory_entries`
    );
    return rows.map(row => row.partition);
  }

  /**
   * Get count of entries by access level
   */
  async getAccessLevelCounts(): Promise<Record<string, number>> {
    const rows = await this.queryAll<{ access_level: string; count: number }>(
      `SELECT access_level, COUNT(*) as count FROM memory_entries GROUP BY access_level`
    );

    const counts: Record<string, number> = {};
    rows.forEach(row => {
      counts[row.access_level] = row.count;
    });
    return counts;
  }

  /**
   * Find entries modified since a timestamp (for QUIC sync)
   */
  async findModifiedSince(since: number, partition?: string): Promise<MemoryEntry[]> {
    let query = `SELECT * FROM memory_entries WHERE created_at > ?`;
    const params: any[] = [since];

    if (partition) {
      query += ` AND partition = ?`;
      params.push(partition);
    }

    query += ` ORDER BY created_at ASC`;

    const rows = await this.queryAll<any>(query, params);
    return rows.map(row => this.mapToEntry(row));
  }

  /**
   * Map database row to MemoryEntry object
   */
  private mapToEntry(row: any): MemoryEntry {
    return {
      key: row.key,
      value: JSON.parse(row.value),
      partition: row.partition,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      owner: row.owner,
      accessLevel: row.access_level as AccessLevel,
      teamId: row.team_id,
      swarmId: row.swarm_id
    };
  }
}
