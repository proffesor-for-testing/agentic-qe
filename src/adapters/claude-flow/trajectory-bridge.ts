import { randomUUID } from 'node:crypto';

/**
 * Trajectory Bridge
 * Connects AQE task execution to Claude Flow SONA trajectories
 *
 * When Claude Flow is available:
 * - Records task execution steps as SONA trajectories
 * - Enables reinforcement learning from task outcomes
 * - Syncs with Claude Flow's intelligence layer
 *
 * When not available:
 * - Stores trajectories locally in SQLite
 * - Uses local pattern promotion (3+ successful uses)
 */

import type { Trajectory, TrajectoryStep } from './types.js';
import { detectClaudeFlow } from './detect.js';

/**
 * Trajectory Bridge for SONA integration
 */
export class TrajectoryBridge {
  private claudeFlowAvailable = false;
  private localTrajectories: Map<string, Trajectory> = new Map();

  constructor(private options: { projectRoot: string }) {}

  /**
   * Initialize the bridge
   */
  async initialize(): Promise<void> {
    this.claudeFlowAvailable = await this.checkClaudeFlow();
  }

  /**
   * Check if Claude Flow is available (no npm auto-install)
   */
  private async checkClaudeFlow(): Promise<boolean> {
    return detectClaudeFlow(this.options.projectRoot).available;
  }

  /**
   * Start a new trajectory
   */
  async startTrajectory(task: string, agent?: string): Promise<string> {
    const id = `trajectory-${randomUUID()}`;

    if (this.claudeFlowAvailable) {
      try {
        const { execFileSync } = await import('child_process');
        const args = ['--no-install', '@claude-flow/cli', 'hooks', 'intelligence', 'trajectory-start', '--task', task];
        if (agent) { args.push('--agent', agent); }
        const result = execFileSync('npx', args,
          { encoding: 'utf-8', timeout: 10000, cwd: this.options.projectRoot }
        );

        // Parse trajectory ID from result
        const match = result.match(/trajectoryId[:\s]+["']?([^"'\s,}]+)/i);
        if (match?.[1]) {
          return match[1];
        }
      } catch (error) {
        // Non-critical: Claude Flow unavailable, using local storage
        console.debug('[TrajectoryBridge] Claude Flow trajectory start failed:', error instanceof Error ? error.message : error);
      }
    }

    // Store locally
    this.localTrajectories.set(id, {
      id,
      task,
      agent,
      steps: [],
      startedAt: Date.now(),
    });

    return id;
  }

  /**
   * Record a trajectory step
   */
  async recordStep(
    trajectoryId: string,
    action: string,
    result?: string,
    quality?: number
  ): Promise<void> {
    if (this.claudeFlowAvailable) {
      try {
        const { execFileSync } = await import('child_process');
        const args = ['--no-install', '@claude-flow/cli', 'hooks', 'intelligence', 'trajectory-step', '--trajectory-id', trajectoryId, '--action', action];
        if (result) { args.push('--result', result); }
        if (quality !== undefined) { args.push('--quality', String(quality)); }
        execFileSync('npx', args,
          { encoding: 'utf-8', timeout: 10000, cwd: this.options.projectRoot }
        );
        return;
      } catch (error) {
        // Non-critical: Claude Flow unavailable, using local storage
        console.debug('[TrajectoryBridge] Claude Flow trajectory step failed:', error instanceof Error ? error.message : error);
      }
    }

    // Store locally
    const trajectory = this.localTrajectories.get(trajectoryId);
    if (trajectory) {
      trajectory.steps.push({
        id: `step-${trajectory.steps.length + 1}`,
        action,
        result,
        quality,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * End a trajectory
   */
  async endTrajectory(
    trajectoryId: string,
    success: boolean,
    feedback?: string
  ): Promise<Trajectory | undefined> {
    if (this.claudeFlowAvailable) {
      try {
        const { execFileSync } = await import('child_process');
        const args = ['--no-install', '@claude-flow/cli', 'hooks', 'intelligence', 'trajectory-end', '--trajectory-id', trajectoryId, '--success', String(success)];
        if (feedback) { args.push('--feedback', feedback); }
        execFileSync('npx', args,
          { encoding: 'utf-8', timeout: 10000, cwd: this.options.projectRoot }
        );
      } catch {
        // Continue to return local trajectory
      }
    }

    // Complete local trajectory
    const trajectory = this.localTrajectories.get(trajectoryId);
    if (trajectory) {
      trajectory.success = success;
      trajectory.feedback = feedback;
      trajectory.completedAt = Date.now();

      // Persist to SQLite for local learning
      await this.persistTrajectory(trajectory);

      return trajectory;
    }

    return undefined;
  }

  /**
   * Get trajectory by ID
   */
  getTrajectory(trajectoryId: string): Trajectory | undefined {
    return this.localTrajectories.get(trajectoryId);
  }

  /**
   * Check if Claude Flow is available
   */
  isClaudeFlowAvailable(): boolean {
    return this.claudeFlowAvailable;
  }

  /**
   * Persist trajectory to local SQLite
   */
  private async persistTrajectory(trajectory: Trajectory): Promise<void> {
    try {
      const { join } = await import('path');
      const { existsSync, mkdirSync } = await import('fs');
      const { createRequire } = await import('module');

      const require = createRequire(import.meta.url);
      const { openDatabase } = require('../../shared/safe-db.js');

      const dbPath = join(this.options.projectRoot, '.agentic-qe', 'trajectories.db');
      const dir = join(this.options.projectRoot, '.agentic-qe');

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const db = openDatabase(dbPath);

      // Create table if needed
      db.exec(`
        CREATE TABLE IF NOT EXISTS trajectories (
          id TEXT PRIMARY KEY,
          task TEXT NOT NULL,
          agent TEXT,
          steps TEXT NOT NULL,
          success INTEGER,
          feedback TEXT,
          started_at INTEGER NOT NULL,
          completed_at INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        );
        CREATE INDEX IF NOT EXISTS idx_trajectories_success ON trajectories(success);
      `);

      // Insert trajectory
      db.prepare(`
        INSERT OR REPLACE INTO trajectories (id, task, agent, steps, success, feedback, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        trajectory.id,
        trajectory.task,
        trajectory.agent || null,
        JSON.stringify(trajectory.steps),
        trajectory.success ? 1 : 0,
        trajectory.feedback || null,
        trajectory.startedAt,
        trajectory.completedAt || null
      );

      db.close();
    } catch (error) {
      // Non-critical: persistence is optional
      console.debug('[TrajectoryBridge] Trajectory persistence failed:', error instanceof Error ? error.message : error);
    }
  }

}

/**
 * Create trajectory bridge
 */
export function createTrajectoryBridge(options: { projectRoot: string }): TrajectoryBridge {
  return new TrajectoryBridge(options);
}
