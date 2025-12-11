/**
 * TransferRegistry - Track pattern transfers between agents
 *
 * Records all transfer attempts (success and failure), queries transfer history,
 * and calculates success rates per agent pair.
 *
 * Part of the Nightly-Learner Phase 2 implementation.
 *
 * @version 1.0.0
 * @module src/learning/transfer/TransferRegistry
 */

import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';
import type { TransferResult } from './TransferProtocol';

/**
 * Transfer record stored in the registry
 */
export interface TransferRecord {
  /** Unique transfer record ID */
  id: string;
  /** Source agent identifier */
  sourceAgent: string;
  /** Target agent identifier */
  targetAgent: string;
  /** Pattern ID that was transferred */
  patternId: string;
  /** Transfer status */
  status: 'success' | 'failed' | 'skipped';
  /** Reason for failure or skip */
  reason?: string;
  /** Compatibility score calculated during transfer */
  compatibilityScore?: number;
  /** Timestamp when transfer was recorded */
  timestamp: Date;
}

/**
 * Registry configuration options
 */
export interface TransferRegistryConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
}

/**
 * Overall transfer statistics
 */
export interface TransferOverallStats {
  /** Total number of transfer attempts */
  totalTransfers: number;
  /** Overall success rate (0-1) */
  successRate: number;
  /** Statistics by agent pair */
  byAgentPair: Map<string, { success: number; fail: number }>;
}

/**
 * TransferRegistry tracks all pattern transfer attempts
 *
 * Records success/failure of transfers, provides historical queries,
 * and calculates success metrics per agent pair.
 *
 * @example
 * ```typescript
 * const registry = new TransferRegistry({ dbPath: './memory.db' });
 *
 * // Record a transfer result
 * await registry.record(transferResult);
 *
 * // Query transfer history
 * const history = registry.getTransferHistory('test-generator', 10);
 *
 * // Get success rate between two agents
 * const rate = registry.getSuccessRate('test-generator', 'coverage-analyzer');
 *
 * // Get overall statistics
 * const stats = registry.getOverallStats();
 * console.log(`Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
 *
 * registry.close();
 * ```
 */
export class TransferRegistry {
  private db: BetterSqlite3.Database;
  private logger: Logger;
  private config: Required<TransferRegistryConfig>;

  constructor(config?: TransferRegistryConfig) {
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
    };

    this.db = new BetterSqlite3(this.config.dbPath);
    this.initializeSchema();
  }

  /**
   * Initialize database schema for transfer registry
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transfer_registry (
        id TEXT PRIMARY KEY,
        source_agent TEXT NOT NULL,
        target_agent TEXT NOT NULL,
        pattern_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'skipped')),
        reason TEXT,
        compatibility_score REAL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_transfer_reg_source ON transfer_registry(source_agent);
      CREATE INDEX IF NOT EXISTS idx_transfer_reg_target ON transfer_registry(target_agent);
      CREATE INDEX IF NOT EXISTS idx_transfer_reg_pattern ON transfer_registry(pattern_id);
      CREATE INDEX IF NOT EXISTS idx_transfer_reg_timestamp ON transfer_registry(timestamp);
      CREATE INDEX IF NOT EXISTS idx_transfer_reg_status ON transfer_registry(status);
      CREATE INDEX IF NOT EXISTS idx_transfer_reg_pair ON transfer_registry(source_agent, target_agent);
    `);

    this.logger.debug('[TransferRegistry] Schema initialized');
  }

  /**
   * Record a transfer result
   *
   * Extracts individual transfer details from TransferResult and stores each
   * pattern transfer as a separate record.
   *
   * @param result - Transfer result from TransferProtocol
   * @returns Promise that resolves when all records are stored
   *
   * @example
   * ```typescript
   * const result = await protocol.executeTransfer(request);
   * await registry.record(result);
   * ```
   */
  async record(result: TransferResult): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO transfer_registry
      (id, source_agent, target_agent, pattern_id, status, reason, compatibility_score, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();

    // Record each pattern transfer from the result
    for (const detail of result.details) {
      const id = `reg-${now}-${SecureRandom.randomString(8, 'alphanumeric')}`;

      // Map TransferDetail status to TransferRecord status
      const status: 'success' | 'failed' | 'skipped' =
        detail.status === 'transferred' ? 'success' :
        detail.status === 'skipped' ? 'skipped' : 'failed';

      stmt.run(
        id,
        result.sourceAgent,
        result.targetAgent,
        detail.patternId,
        status,
        detail.reason || null,
        detail.compatibilityScore || null,
        now
      );
    }

    this.logger.debug('[TransferRegistry] Recorded transfer', {
      requestId: result.requestId,
      source: result.sourceAgent,
      target: result.targetAgent,
      records: result.details.length,
    });
  }

  /**
   * Get transfer history for a specific agent
   *
   * Returns records where the agent was either source or target.
   *
   * @param agentId - Agent identifier
   * @param limit - Maximum number of records to return (default: 50)
   * @returns Array of transfer records, sorted by timestamp (newest first)
   *
   * @example
   * ```typescript
   * const recent = registry.getTransferHistory('test-generator', 20);
   * console.log(`Found ${recent.length} recent transfers`);
   * ```
   */
  getTransferHistory(agentId: string, limit: number = 50): TransferRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM transfer_registry
      WHERE source_agent = ? OR target_agent = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(agentId, agentId, limit) as Array<{
      id: string;
      source_agent: string;
      target_agent: string;
      pattern_id: string;
      status: 'success' | 'failed' | 'skipped';
      reason: string | null;
      compatibility_score: number | null;
      timestamp: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      sourceAgent: row.source_agent,
      targetAgent: row.target_agent,
      patternId: row.pattern_id,
      status: row.status,
      reason: row.reason || undefined,
      compatibilityScore: row.compatibility_score || undefined,
      timestamp: new Date(row.timestamp),
    }));
  }

  /**
   * Get success rate between two specific agents
   *
   * Calculates the ratio of successful transfers to total attempts.
   *
   * @param sourceAgent - Source agent identifier
   * @param targetAgent - Target agent identifier
   * @returns Success rate as a decimal (0-1), or 0 if no transfers exist
   *
   * @example
   * ```typescript
   * const rate = registry.getSuccessRate('test-generator', 'coverage-analyzer');
   * console.log(`Success rate: ${(rate * 100).toFixed(1)}%`);
   * ```
   */
  getSuccessRate(sourceAgent: string, targetAgent: string): number {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes
      FROM transfer_registry
      WHERE source_agent = ? AND target_agent = ?
    `).get(sourceAgent, targetAgent) as { total: number; successes: number };

    if (!stats || stats.total === 0) {
      return 0;
    }

    return stats.successes / stats.total;
  }

  /**
   * Get overall transfer statistics
   *
   * Aggregates all transfer records to provide:
   * - Total transfer count
   * - Overall success rate
   * - Per-agent-pair success/failure counts
   *
   * @returns Overall statistics object
   *
   * @example
   * ```typescript
   * const stats = registry.getOverallStats();
   * console.log(`Total transfers: ${stats.totalTransfers}`);
   * console.log(`Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
   *
   * for (const [pair, counts] of stats.byAgentPair) {
   *   console.log(`${pair}: ${counts.success} success, ${counts.fail} fail`);
   * }
   * ```
   */
  getOverallStats(): TransferOverallStats {
    // Get overall counts
    const overall = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes
      FROM transfer_registry
    `).get() as { total: number; successes: number };

    // Get per-agent-pair counts
    const pairRows = this.db.prepare(`
      SELECT
        source_agent,
        target_agent,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status IN ('failed', 'skipped') THEN 1 ELSE 0 END) as fail
      FROM transfer_registry
      GROUP BY source_agent, target_agent
    `).all() as Array<{
      source_agent: string;
      target_agent: string;
      success: number;
      fail: number;
    }>;

    const byAgentPair = new Map<string, { success: number; fail: number }>();

    for (const row of pairRows) {
      const key = `${row.source_agent}->${row.target_agent}`;
      byAgentPair.set(key, {
        success: row.success,
        fail: row.fail,
      });
    }

    return {
      totalTransfers: overall.total || 0,
      successRate: overall.total > 0 ? (overall.successes || 0) / overall.total : 0,
      byAgentPair,
    };
  }

  /**
   * Get recent transfers within a time window
   *
   * @param hours - Number of hours to look back (default: 24)
   * @returns Array of transfer records within the time window
   *
   * @example
   * ```typescript
   * // Get transfers from last 12 hours
   * const recent = registry.getRecentTransfers(12);
   * console.log(`${recent.length} transfers in last 12 hours`);
   * ```
   */
  getRecentTransfers(hours: number = 24): TransferRecord[] {
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);

    const rows = this.db.prepare(`
      SELECT * FROM transfer_registry
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
    `).all(cutoffTime) as Array<{
      id: string;
      source_agent: string;
      target_agent: string;
      pattern_id: string;
      status: 'success' | 'failed' | 'skipped';
      reason: string | null;
      compatibility_score: number | null;
      timestamp: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      sourceAgent: row.source_agent,
      targetAgent: row.target_agent,
      patternId: row.pattern_id,
      status: row.status,
      reason: row.reason || undefined,
      compatibilityScore: row.compatibility_score || undefined,
      timestamp: new Date(row.timestamp),
    }));
  }

  /**
   * Get transfer statistics for a specific pattern
   *
   * Useful for tracking how well a specific pattern transfers across agents.
   *
   * @param patternId - Pattern identifier
   * @returns Statistics for the pattern's transfer history
   *
   * @example
   * ```typescript
   * const stats = registry.getPatternStats('pattern-123');
   * console.log(`Pattern transferred ${stats.total} times with ${stats.successRate * 100}% success`);
   * ```
   */
  getPatternStats(patternId: string): { total: number; successRate: number; agents: string[] } {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes
      FROM transfer_registry
      WHERE pattern_id = ?
    `).get(patternId) as { total: number; successes: number };

    const agents = this.db.prepare(`
      SELECT DISTINCT target_agent FROM transfer_registry
      WHERE pattern_id = ? AND status = 'success'
    `).all(patternId).map((row: any) => row.target_agent);

    return {
      total: stats.total || 0,
      successRate: stats.total > 0 ? (stats.successes || 0) / stats.total : 0,
      agents,
    };
  }

  /**
   * Get most successful transfer pairs
   *
   * Identifies agent pairs with the highest transfer success rates.
   *
   * @param limit - Maximum number of pairs to return (default: 10)
   * @param minTransfers - Minimum number of transfers required (default: 5)
   * @returns Array of agent pairs sorted by success rate
   *
   * @example
   * ```typescript
   * const topPairs = registry.getTopTransferPairs(5, 10);
   * topPairs.forEach(pair => {
   *   console.log(`${pair.sourceAgent} -> ${pair.targetAgent}: ${(pair.successRate * 100).toFixed(1)}%`);
   * });
   * ```
   */
  getTopTransferPairs(limit: number = 10, minTransfers: number = 5): Array<{
    sourceAgent: string;
    targetAgent: string;
    successRate: number;
    totalTransfers: number;
  }> {
    const rows = this.db.prepare(`
      SELECT
        source_agent,
        target_agent,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes
      FROM transfer_registry
      GROUP BY source_agent, target_agent
      HAVING total >= ?
      ORDER BY (1.0 * successes / total) DESC, total DESC
      LIMIT ?
    `).all(minTransfers, limit) as Array<{
      source_agent: string;
      target_agent: string;
      total: number;
      successes: number;
    }>;

    return rows.map(row => ({
      sourceAgent: row.source_agent,
      targetAgent: row.target_agent,
      successRate: row.successes / row.total,
      totalTransfers: row.total,
    }));
  }

  /**
   * Clear old transfer records
   *
   * Removes records older than the specified number of days.
   * Useful for maintaining database size.
   *
   * @param daysToKeep - Number of days of history to retain (default: 90)
   * @returns Number of records deleted
   *
   * @example
   * ```typescript
   * const deleted = registry.clearOldRecords(30);
   * console.log(`Deleted ${deleted} records older than 30 days`);
   * ```
   */
  clearOldRecords(daysToKeep: number = 90): number {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    const result = this.db.prepare(`
      DELETE FROM transfer_registry
      WHERE timestamp < ?
    `).run(cutoffTime);

    this.logger.info('[TransferRegistry] Cleared old records', {
      deleted: result.changes,
      daysToKeep,
    });

    return result.changes;
  }

  /**
   * Close database connection
   *
   * Should be called when registry is no longer needed to release resources.
   *
   * @example
   * ```typescript
   * registry.close();
   * ```
   */
  close(): void {
    this.db.close();
    this.logger.debug('[TransferRegistry] Database closed');
  }
}

export default TransferRegistry;
