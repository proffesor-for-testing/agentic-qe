import { BaseDAO } from './BaseDAO';

/**
 * Workflow state interface
 */
export interface WorkflowState {
  id: string;
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  checkpoint: any;
  sha: string;
  ttl?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * WorkflowDAO - Data Access Object for workflow state management (Table 4)
 *
 * Handles all database operations for the workflows table
 * Manages workflow execution state and checkpoints
 */
export class WorkflowDAO extends BaseDAO {
  async createTable(): Promise<void> {
    await this.run(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        step TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
        checkpoint TEXT NOT NULL,
        sha TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER
      )
    `);
  }

  async createIndexes(): Promise<void> {
    await this.run(`CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_workflows_step ON workflows(step)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_workflows_sha ON workflows(sha)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_workflows_created ON workflows(created_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_workflows_updated ON workflows(updated_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_workflows_expires ON workflows(expires_at)`);
  }

  /**
   * Insert or update a workflow state
   */
  async insert(workflow: WorkflowState): Promise<void> {
    const now = Date.now();
    const createdAt = workflow.createdAt || now;
    const updatedAt = workflow.updatedAt || now;
    const expiresAt = workflow.ttl ? now + (workflow.ttl * 1000) : null;

    await this.run(
      `INSERT OR REPLACE INTO workflows
       (id, step, status, checkpoint, sha, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workflow.id,
        workflow.step,
        workflow.status,
        JSON.stringify(workflow.checkpoint),
        workflow.sha,
        createdAt,
        updatedAt,
        expiresAt
      ]
    );
  }

  /**
   * Find a workflow by ID
   */
  async findById(id: string): Promise<WorkflowState | null> {
    const row = await this.queryOne<any>(
      `SELECT * FROM workflows WHERE id = ?`,
      [id]
    );
    return row ? this.mapToWorkflow(row) : null;
  }

  /**
   * Find workflows by status
   */
  async findByStatus(status: WorkflowState['status']): Promise<WorkflowState[]> {
    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT * FROM workflows
       WHERE status = ?
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY updated_at DESC`,
      [status, now]
    );
    return rows.map(row => this.mapToWorkflow(row));
  }

  /**
   * Find workflows by step
   */
  async findByStep(step: string): Promise<WorkflowState[]> {
    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT * FROM workflows
       WHERE step = ?
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY updated_at DESC`,
      [step, now]
    );
    return rows.map(row => this.mapToWorkflow(row));
  }

  /**
   * Find workflow by SHA checkpoint
   */
  async findBySHA(sha: string): Promise<WorkflowState | null> {
    const now = Date.now();
    const row = await this.queryOne<any>(
      `SELECT * FROM workflows
       WHERE sha = ?
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY updated_at DESC
       LIMIT 1`,
      [sha, now]
    );
    return row ? this.mapToWorkflow(row) : null;
  }

  /**
   * Update workflow status
   */
  async updateStatus(id: string, status: WorkflowState['status']): Promise<void> {
    const now = Date.now();
    await this.run(
      `UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?`,
      [status, now, id]
    );
  }

  /**
   * Update workflow checkpoint
   */
  async updateCheckpoint(id: string, checkpoint: any, sha: string): Promise<void> {
    const now = Date.now();
    await this.run(
      `UPDATE workflows SET checkpoint = ?, sha = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(checkpoint), sha, now, id]
    );
  }

  /**
   * Delete a workflow by ID
   */
  async deleteById(id: string): Promise<void> {
    await this.run(`DELETE FROM workflows WHERE id = ?`, [id]);
  }

  /**
   * Delete workflows by status
   */
  async deleteByStatus(status: WorkflowState['status']): Promise<void> {
    await this.run(`DELETE FROM workflows WHERE status = ?`, [status]);
  }

  /**
   * Delete expired workflows
   */
  async deleteExpired(): Promise<void> {
    const now = Date.now();
    await this.run(
      `DELETE FROM workflows WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );
  }

  /**
   * Count total workflows
   */
  async count(): Promise<number> {
    const result = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM workflows`
    );
    return result?.count || 0;
  }

  /**
   * Count workflows by status
   */
  async countByStatus(status: WorkflowState['status']): Promise<number> {
    const result = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM workflows WHERE status = ?`,
      [status]
    );
    return result?.count || 0;
  }

  /**
   * Get workflow statistics by status
   */
  async getStatusCounts(): Promise<Record<string, number>> {
    const rows = await this.queryAll<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM workflows GROUP BY status`
    );

    const counts: Record<string, number> = {};
    rows.forEach(row => {
      counts[row.status] = row.count;
    });
    return counts;
  }

  /**
   * Find active workflows (pending or in_progress)
   */
  async findActive(): Promise<WorkflowState[]> {
    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT * FROM workflows
       WHERE status IN ('pending', 'in_progress')
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY updated_at DESC`,
      [now]
    );
    return rows.map(row => this.mapToWorkflow(row));
  }

  /**
   * Map database row to WorkflowState object
   */
  private mapToWorkflow(row: any): WorkflowState {
    return {
      id: row.id,
      step: row.step,
      status: row.status as WorkflowState['status'],
      checkpoint: JSON.parse(row.checkpoint),
      sha: row.sha,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ttl: row.expires_at ? (row.expires_at - row.created_at) / 1000 : undefined
    };
  }
}
