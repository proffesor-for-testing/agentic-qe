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

import type { Trajectory } from './types.js';
import { detectClaudeFlow, resolveCliPackage } from './detect.js';

const cliPkg = resolveCliPackage();

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
        const args = ['--no-install', cliPkg, 'hooks', 'intelligence', 'trajectory-start', '--task', task];
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
        const args = ['--no-install', cliPkg, 'hooks', 'intelligence', 'trajectory-step', '--trajectory-id', trajectoryId, '--action', action];
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
        const args = ['--no-install', cliPkg, 'hooks', 'intelligence', 'trajectory-end', '--trajectory-id', trajectoryId, '--success', String(success)];
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
   * Persist trajectory to the unified memory DB (qe_trajectories).
   *
   * Previously opened a separate `.agentic-qe/trajectories.db` with its own
   * `trajectories` schema, violating the project's "one DB, one schema"
   * unified-memory rule. The canonical `qe_trajectories` table on memory.db
   * already covers every column we need (task/agent/domain/steps_json/
   * success/feedback) so the bridge now writes there directly.
   *
   * Started/completed timestamps are stored in memory.db as TEXT datetimes,
   * not epoch ms — convert on the way in. Feedback column is added lazily by
   * TrajectoryTracker.ensureSchema(); we add it here too in case this writer
   * runs before TrajectoryTracker initializes.
   */
  private async persistTrajectory(trajectory: Trajectory): Promise<void> {
    try {
      const { getUnifiedMemory } = await import('../../kernel/unified-memory.js');
      const um = getUnifiedMemory();
      if (!um.isInitialized()) {
        await um.initialize();
      }
      const db = um.getDatabase();

      // Ensure feedback column exists (TrajectoryTracker.ensureSchema may not
      // have run yet on a fresh install).
      try {
        const cols = db.prepare('PRAGMA table_info(qe_trajectories)').all() as Array<{ name: string }>;
        if (!cols.some(c => c.name === 'feedback')) {
          db.exec('ALTER TABLE qe_trajectories ADD COLUMN feedback TEXT');
        }
      } catch { /* fail-soft */ }

      const startedIso = new Date(trajectory.startedAt).toISOString();
      const endedIso = trajectory.completedAt ? new Date(trajectory.completedAt).toISOString() : null;

      db.prepare(`
        INSERT OR REPLACE INTO qe_trajectories
          (id, task, agent, domain, started_at, ended_at, success, steps_json, feedback)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        trajectory.id,
        trajectory.task,
        trajectory.agent || null,
        null, // domain unknown at this layer
        startedIso,
        endedIso,
        trajectory.success ? 1 : 0,
        JSON.stringify(trajectory.steps),
        trajectory.feedback || null,
      );
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
