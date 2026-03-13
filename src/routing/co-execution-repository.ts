/**
 * Co-Execution Repository (Issue #342, Item 3)
 *
 * Tracks which agent combinations succeed together on similar tasks.
 * Behavioral confidence ramps linearly: min(1.0, success_count / 20).
 * A single co-execution registers at 0.05; twenty successes reach full confidence.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

/** A record of two agents executing together on a task */
export interface CoExecutionRecord {
  /** First agent ID */
  readonly agentA: string;
  /** Second agent ID */
  readonly agentB: string;
  /** Task domain */
  readonly domain: string;
  /** Whether the co-execution was successful */
  readonly success: boolean;
  /** Optional task description (truncated) */
  readonly taskDescription?: string;
}

/** Co-execution statistics for an agent pair */
export interface CoExecutionStats {
  /** First agent */
  readonly agentA: string;
  /** Second agent */
  readonly agentB: string;
  /** Total co-executions */
  readonly totalExecutions: number;
  /** Successful co-executions */
  readonly successCount: number;
  /** Success rate */
  readonly successRate: number;
  /** Behavioral confidence: min(1.0, successCount / 20) */
  readonly behavioralConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Number of successes needed for full behavioral confidence */
const CONFIDENCE_RAMP_THRESHOLD = 20;

// ============================================================================
// Repository
// ============================================================================

export class CoExecutionRepository {
  private db: DatabaseType | null = null;
  private initialized = false;

  /**
   * Initialize with a database connection.
   * Creates the co-execution table if it doesn't exist.
   */
  initialize(db: DatabaseType): void {
    if (this.initialized) return;
    this.db = db;

    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS qe_agent_co_execution (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_a TEXT NOT NULL,
          agent_b TEXT NOT NULL,
          domain TEXT NOT NULL,
          success INTEGER NOT NULL DEFAULT 0,
          task_description TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_co_exec_agents
          ON qe_agent_co_execution(agent_a, agent_b);
        CREATE INDEX IF NOT EXISTS idx_co_exec_domain
          ON qe_agent_co_execution(domain);
      `);
      this.initialized = true;
    } catch (error) {
      console.error(`[CoExecutionRepository] Init error: ${toErrorMessage(error)}`);
    }
  }

  /**
   * Record a co-execution event between two agents.
   * Agent order is normalized (sorted) so A-B and B-A are the same pair.
   */
  recordCoExecution(record: CoExecutionRecord): void {
    if (!this.db) return;

    const [a, b] = [record.agentA, record.agentB].sort();

    try {
      this.db.prepare(`
        INSERT INTO qe_agent_co_execution (agent_a, agent_b, domain, success, task_description)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        a,
        b,
        record.domain,
        record.success ? 1 : 0,
        record.taskDescription?.slice(0, 500) || null,
      );
    } catch (error) {
      console.debug(`[CoExecutionRepository] Record error: ${toErrorMessage(error)}`);
    }
  }

  /**
   * Get co-execution stats for a specific agent pair.
   * Returns behavioral confidence using linear ramp: min(1.0, successCount / 20).
   */
  getCoExecutionStats(agentA: string, agentB: string): CoExecutionStats | null {
    if (!this.db) return null;

    const [a, b] = [agentA, agentB].sort();

    try {
      const row = this.db.prepare(`
        SELECT
          agent_a,
          agent_b,
          COUNT(*) as total_executions,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count
        FROM qe_agent_co_execution
        WHERE agent_a = ? AND agent_b = ?
        GROUP BY agent_a, agent_b
      `).get(a, b) as {
        agent_a: string;
        agent_b: string;
        total_executions: number;
        success_count: number;
      } | undefined;

      if (!row) return null;

      const successRate = row.total_executions > 0
        ? row.success_count / row.total_executions
        : 0;

      // Linear ramp: min(1.0, successCount / 20)
      const behavioralConfidence = Math.min(1.0, row.success_count / CONFIDENCE_RAMP_THRESHOLD);

      return {
        agentA: row.agent_a,
        agentB: row.agent_b,
        totalExecutions: row.total_executions,
        successCount: row.success_count,
        successRate,
        behavioralConfidence,
      };
    } catch (error) {
      console.debug(`[CoExecutionRepository] Stats error: ${toErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * Get all agents that have successfully co-executed with the given agent.
   * Returns them sorted by behavioral confidence (descending).
   */
  getCoExecutionPartners(agentId: string, limit: number = 10): CoExecutionStats[] {
    if (!this.db) return [];

    try {
      const rows = this.db.prepare(`
        SELECT
          agent_a,
          agent_b,
          COUNT(*) as total_executions,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count
        FROM qe_agent_co_execution
        WHERE agent_a = ? OR agent_b = ?
        GROUP BY agent_a, agent_b
        ORDER BY success_count DESC
        LIMIT ?
      `).all(agentId, agentId, limit) as Array<{
        agent_a: string;
        agent_b: string;
        total_executions: number;
        success_count: number;
      }>;

      return rows.map(row => {
        const successRate = row.total_executions > 0
          ? row.success_count / row.total_executions
          : 0;

        return {
          agentA: row.agent_a,
          agentB: row.agent_b,
          totalExecutions: row.total_executions,
          successCount: row.success_count,
          successRate,
          behavioralConfidence: Math.min(1.0, row.success_count / CONFIDENCE_RAMP_THRESHOLD),
        };
      });
    } catch (error) {
      console.debug(`[CoExecutionRepository] Partners error: ${toErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * Record a batch of co-executions from a swarm task.
   * Given a list of agents that participated in a task together,
   * records co-execution for every unique pair.
   */
  recordSwarmCoExecution(
    agentIds: string[],
    domain: string,
    success: boolean,
    taskDescription?: string,
  ): void {
    if (!this.db || agentIds.length < 2) return;

    try {
      const insert = this.db.prepare(`
        INSERT INTO qe_agent_co_execution (agent_a, agent_b, domain, success, task_description)
        VALUES (?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction(() => {
        for (let i = 0; i < agentIds.length; i++) {
          for (let j = i + 1; j < agentIds.length; j++) {
            const [a, b] = [agentIds[i], agentIds[j]].sort();
            insert.run(a, b, domain, success ? 1 : 0, taskDescription?.slice(0, 500) || null);
          }
        }
      });

      transaction();
    } catch (error) {
      console.debug(`[CoExecutionRepository] Swarm record error: ${toErrorMessage(error)}`);
    }
  }
}

/** Singleton instance */
let _instance: CoExecutionRepository | null = null;

export function getCoExecutionRepository(): CoExecutionRepository {
  if (!_instance) {
    _instance = new CoExecutionRepository();
  }
  return _instance;
}
