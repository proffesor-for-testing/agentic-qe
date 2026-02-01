/**
 * TrajectoryTracker - Track learning trajectories for agentic-flow integration
 * ADR-051: ReasoningBank enhancement for 46% faster recurring tasks
 *
 * Trajectories capture the sequence of actions and decisions made during task execution,
 * enabling experience replay and pattern learning across sessions.
 *
 * Uses SQLite persistence via UnifiedMemoryManager for cross-session durability.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../../../kernel/unified-memory.js';
import type { QEDomain } from '../../../learning/qe-patterns.js';
import { CircularBuffer } from '../../../shared/utils/circular-buffer.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A single step in a trajectory
 */
export interface TrajectoryStep {
  /** Step identifier */
  readonly id: string;

  /** Action taken (e.g., 'generate-test', 'analyze-coverage', 'fix-bug') */
  readonly action: string;

  /** Result of the action */
  readonly result: TrajectoryStepResult;

  /** Quality score of this step (0-1) */
  readonly quality: number;

  /** Time spent on this step in milliseconds */
  readonly durationMs: number;

  /** Timestamp when step was recorded */
  readonly timestamp: Date;

  /** Additional context for the step */
  readonly context?: Record<string, unknown>;

  /** Tokens used in this step (for cost tracking) */
  readonly tokensUsed?: number;
}

/**
 * Result of a trajectory step
 */
export interface TrajectoryStepResult {
  /** Step outcome */
  readonly outcome: 'success' | 'failure' | 'partial' | 'skipped';

  /** Result data (e.g., generated code, analysis results) */
  readonly data?: unknown;

  /** Error message if failure */
  readonly error?: string;

  /** Metrics from this step */
  readonly metrics?: Record<string, number>;
}

/**
 * Metrics for a complete trajectory
 */
export interface TrajectoryMetrics {
  /** Total duration in milliseconds */
  readonly totalDurationMs: number;

  /** Number of successful steps */
  readonly successfulSteps: number;

  /** Number of failed steps */
  readonly failedSteps: number;

  /** Average step quality */
  readonly averageQuality: number;

  /** Total tokens used */
  readonly totalTokensUsed: number;

  /** Efficiency score (successful steps / total steps * avg quality) */
  readonly efficiencyScore: number;
}

/**
 * A complete trajectory from start to finish
 */
export interface Trajectory {
  /** Unique trajectory identifier */
  readonly id: string;

  /** Task description that initiated this trajectory */
  readonly task: string;

  /** Agent that executed this trajectory */
  readonly agent?: string;

  /** QE domain this trajectory belongs to */
  readonly domain?: QEDomain;

  /** All steps in execution order */
  readonly steps: TrajectoryStep[];

  /** Final outcome of the trajectory */
  readonly outcome: 'success' | 'failure' | 'partial';

  /** Aggregated metrics */
  readonly metrics: TrajectoryMetrics;

  /** When the trajectory started */
  readonly startedAt: Date;

  /** When the trajectory ended */
  readonly endedAt?: Date;

  /** Optional feedback from user/system */
  readonly feedback?: string;

  /** Embedding for similarity search */
  readonly embedding?: number[];

  /** Related pattern IDs */
  readonly relatedPatternIds?: string[];
}

/**
 * Options for creating a trajectory
 */
export interface TrajectoryOptions {
  /** Agent executing the trajectory */
  agent?: string;

  /** QE domain */
  domain?: QEDomain;

  /** Initial context */
  context?: Record<string, unknown>;
}

/**
 * Configuration for TrajectoryTracker
 */
export interface TrajectoryTrackerConfig {
  /** Maximum steps per trajectory (prevents runaway) */
  maxStepsPerTrajectory: number;

  /** Auto-end trajectory after this duration (ms) */
  autoEndTimeoutMs: number;

  /** Minimum quality threshold for successful trajectory */
  minQualityThreshold: number;

  /** Buffer size for recent trajectories */
  recentBufferSize: number;
}

const DEFAULT_CONFIG: TrajectoryTrackerConfig = {
  maxStepsPerTrajectory: 100,
  autoEndTimeoutMs: 30 * 60 * 1000, // 30 minutes
  minQualityThreshold: 0.5,
  recentBufferSize: 100,
};

/**
 * Database row structure for trajectory queries
 */
interface TrajectoryRow {
  id: string;
  task: string;
  agent?: string;
  domain?: string;
  success: number | null;
  started_at: string;
  ended_at?: string;
  feedback?: string;
  embedding?: Buffer;
  related_patterns?: string;
  steps_json?: string;
  metadata_json?: string;
}

/**
 * Database row structure for step queries
 */
interface StepRow {
  id: string;
  action: string;
  outcome: string;
  result_data?: string;
  error_message?: string;
  metrics_json?: string;
  quality: number;
  duration_ms: number;
  timestamp: string;
  context_json?: string;
  tokens_used?: number;
}

// ============================================================================
// TrajectoryTracker Implementation
// ============================================================================

/**
 * TrajectoryTracker tracks learning trajectories for reinforcement learning
 * and experience replay. Persists to SQLite for cross-session learning.
 *
 * Usage:
 * ```typescript
 * const tracker = new TrajectoryTracker();
 * await tracker.initialize();
 *
 * const trajId = await tracker.startTrajectory('Fix authentication bug');
 * await tracker.recordStep(trajId, 'analyze-code', { outcome: 'success', data: {...} });
 * await tracker.recordStep(trajId, 'generate-fix', { outcome: 'success', data: {...} });
 * const trajectory = await tracker.endTrajectory(trajId, true);
 * ```
 */
export class TrajectoryTracker {
  private readonly config: TrajectoryTrackerConfig;
  private unifiedMemory: UnifiedMemoryManager | null = null;
  private db: DatabaseType | null = null;
  private prepared: Map<string, Statement> = new Map();
  private initialized = false;

  // In-memory tracking for active trajectories
  private activeTrajectories: Map<string, {
    id: string;
    task: string;
    agent?: string;
    domain?: QEDomain;
    steps: TrajectoryStep[];
    startedAt: Date;
    context?: Record<string, unknown>;
  }> = new Map();

  // Recent completed trajectories buffer (for quick access)
  private recentTrajectories: CircularBuffer<Trajectory>;

  // Statistics
  private stats = {
    trajectoriesStarted: 0,
    trajectoriesCompleted: 0,
    trajectoriesAbandoned: 0,
    totalStepsRecorded: 0,
    averageQuality: 0,
    totalQualitySum: 0,
  };

  constructor(config: Partial<TrajectoryTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.recentTrajectories = new CircularBuffer(this.config.recentBufferSize);
  }

  /**
   * Initialize the tracker with SQLite persistence
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.unifiedMemory = getUnifiedMemory();
    await this.unifiedMemory.initialize();
    this.db = this.unifiedMemory.getDatabase();

    // Ensure trajectory tables exist (should be created by unified-memory migration)
    this.ensureSchema();

    // Prepare statements
    this.prepareStatements();

    // Load recent trajectories into buffer
    await this.loadRecentTrajectories();

    this.initialized = true;
    console.log('[TrajectoryTracker] Initialized');
  }

  /**
   * Ensure required schema exists
   */
  private ensureSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // The qe_trajectories table is created by UnifiedMemoryManager migration
    // We add additional columns if needed for enhanced tracking

    // Check if enhanced columns exist, add if not
    const tableInfo = this.db.prepare("PRAGMA table_info(qe_trajectories)").all() as Array<{ name: string }>;
    const existingColumns = new Set(tableInfo.map(c => c.name));

    // Add embedding column if missing
    if (!existingColumns.has('embedding')) {
      this.db.exec(`ALTER TABLE qe_trajectories ADD COLUMN embedding BLOB`);
    }

    // Add feedback column if missing
    if (!existingColumns.has('feedback')) {
      this.db.exec(`ALTER TABLE qe_trajectories ADD COLUMN feedback TEXT`);
    }

    // Add related_patterns column if missing
    if (!existingColumns.has('related_patterns')) {
      this.db.exec(`ALTER TABLE qe_trajectories ADD COLUMN related_patterns TEXT`);
    }

    // Create trajectory_steps table for detailed step tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trajectory_steps (
        id TEXT PRIMARY KEY,
        trajectory_id TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        action TEXT NOT NULL,
        outcome TEXT NOT NULL,
        quality REAL DEFAULT 0.5,
        duration_ms INTEGER DEFAULT 0,
        tokens_used INTEGER,
        result_data TEXT,
        error_message TEXT,
        metrics_json TEXT,
        context_json TEXT,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (trajectory_id) REFERENCES qe_trajectories(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_trajectory_steps_traj ON trajectory_steps(trajectory_id);
      CREATE INDEX IF NOT EXISTS idx_trajectory_steps_action ON trajectory_steps(action);
    `);
  }

  /**
   * Prepare commonly used statements
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.prepared.set('insertTrajectory', this.db.prepare(`
      INSERT INTO qe_trajectories (id, task, agent, domain, started_at, steps_json, metadata_json)
      VALUES (?, ?, ?, ?, ?, '[]', ?)
    `));

    this.prepared.set('updateTrajectory', this.db.prepare(`
      UPDATE qe_trajectories SET
        ended_at = ?,
        success = ?,
        steps_json = ?,
        metadata_json = ?,
        embedding = ?,
        feedback = ?,
        related_patterns = ?
      WHERE id = ?
    `));

    this.prepared.set('getTrajectory', this.db.prepare(`
      SELECT * FROM qe_trajectories WHERE id = ?
    `));

    this.prepared.set('insertStep', this.db.prepare(`
      INSERT INTO trajectory_steps (
        id, trajectory_id, step_order, action, outcome, quality,
        duration_ms, tokens_used, result_data, error_message, metrics_json, context_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));

    this.prepared.set('getSteps', this.db.prepare(`
      SELECT * FROM trajectory_steps WHERE trajectory_id = ? ORDER BY step_order ASC
    `));

    this.prepared.set('getRecentTrajectories', this.db.prepare(`
      SELECT * FROM qe_trajectories
      WHERE success IS NOT NULL
      ORDER BY ended_at DESC
      LIMIT ?
    `));

    this.prepared.set('getTrajectoryCount', this.db.prepare(`
      SELECT COUNT(*) as count FROM qe_trajectories WHERE success IS NOT NULL
    `));

    this.prepared.set('getTrajectoryByDomain', this.db.prepare(`
      SELECT * FROM qe_trajectories
      WHERE domain = ? AND success = 1
      ORDER BY ended_at DESC
      LIMIT ?
    `));
  }

  /**
   * Load recent trajectories into memory buffer
   */
  private async loadRecentTrajectories(): Promise<void> {
    const stmt = this.prepared.get('getRecentTrajectories');
    if (!stmt) return;

    const rows = stmt.all(this.config.recentBufferSize) as any[];

    for (const row of rows) {
      const trajectory = await this.rowToTrajectory(row);
      if (trajectory) {
        this.recentTrajectories.push(trajectory);
      }
    }

    console.log(`[TrajectoryTracker] Loaded ${rows.length} recent trajectories`);
  }

  /**
   * Start a new trajectory
   *
   * @param task - Task description
   * @param options - Optional configuration
   * @returns Trajectory ID
   */
  async startTrajectory(task: string, options: TrajectoryOptions = {}): Promise<string> {
    this.ensureInitialized();

    const id = uuidv4();
    const startedAt = new Date();

    // Store in memory for active tracking
    this.activeTrajectories.set(id, {
      id,
      task,
      agent: options.agent,
      domain: options.domain,
      steps: [],
      startedAt,
      context: options.context,
    });

    // Persist to SQLite
    const insertStmt = this.prepared.get('insertTrajectory');
    if (insertStmt) {
      insertStmt.run(
        id,
        task,
        options.agent || null,
        options.domain || null,
        startedAt.toISOString(),
        options.context ? JSON.stringify(options.context) : null
      );
    }

    this.stats.trajectoriesStarted++;

    // Set auto-end timeout
    setTimeout(() => {
      if (this.activeTrajectories.has(id)) {
        console.warn(`[TrajectoryTracker] Auto-ending abandoned trajectory: ${id}`);
        this.endTrajectory(id, false, 'Abandoned - timeout').catch(console.error);
        this.stats.trajectoriesAbandoned++;
      }
    }, this.config.autoEndTimeoutMs);

    return id;
  }

  /**
   * Record a step in an active trajectory
   *
   * @param trajectoryId - Trajectory ID
   * @param action - Action name
   * @param result - Step result
   * @param options - Optional step data
   */
  async recordStep(
    trajectoryId: string,
    action: string,
    result: TrajectoryStepResult,
    options: {
      quality?: number;
      durationMs?: number;
      tokensUsed?: number;
      context?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    this.ensureInitialized();

    const active = this.activeTrajectories.get(trajectoryId);
    if (!active) {
      throw new Error(`Trajectory not found or already ended: ${trajectoryId}`);
    }

    // Check step limit
    if (active.steps.length >= this.config.maxStepsPerTrajectory) {
      throw new Error(`Maximum steps (${this.config.maxStepsPerTrajectory}) exceeded for trajectory`);
    }

    const stepId = uuidv4();
    const quality = options.quality ?? this.calculateStepQuality(result);

    const step: TrajectoryStep = {
      id: stepId,
      action,
      result,
      quality,
      durationMs: options.durationMs ?? 0,
      timestamp: new Date(),
      context: options.context,
      tokensUsed: options.tokensUsed,
    };

    // Add to in-memory tracking
    active.steps.push(step);

    // Persist to SQLite
    const insertStmt = this.prepared.get('insertStep');
    if (insertStmt) {
      insertStmt.run(
        stepId,
        trajectoryId,
        active.steps.length - 1,
        action,
        result.outcome,
        quality,
        options.durationMs ?? 0,
        options.tokensUsed ?? null,
        result.data ? JSON.stringify(result.data) : null,
        result.error ?? null,
        result.metrics ? JSON.stringify(result.metrics) : null,
        options.context ? JSON.stringify(options.context) : null
      );
    }

    this.stats.totalStepsRecorded++;
    this.stats.totalQualitySum += quality;
    this.stats.averageQuality = this.stats.totalQualitySum / this.stats.totalStepsRecorded;
  }

  /**
   * End a trajectory and calculate final metrics
   *
   * @param trajectoryId - Trajectory ID
   * @param success - Whether the overall trajectory was successful
   * @param feedback - Optional feedback
   * @returns The completed trajectory
   */
  async endTrajectory(
    trajectoryId: string,
    success: boolean,
    feedback?: string
  ): Promise<Trajectory> {
    this.ensureInitialized();

    const active = this.activeTrajectories.get(trajectoryId);
    if (!active) {
      throw new Error(`Trajectory not found or already ended: ${trajectoryId}`);
    }

    const endedAt = new Date();

    // Calculate metrics
    const metrics = this.calculateMetrics(active.steps);

    // Determine outcome
    let outcome: 'success' | 'failure' | 'partial';
    if (success && metrics.averageQuality >= this.config.minQualityThreshold) {
      outcome = 'success';
    } else if (success) {
      outcome = 'partial';
    } else {
      outcome = 'failure';
    }

    // Build trajectory object
    const trajectory: Trajectory = {
      id: trajectoryId,
      task: active.task,
      agent: active.agent,
      domain: active.domain,
      steps: active.steps,
      outcome,
      metrics,
      startedAt: active.startedAt,
      endedAt,
      feedback,
    };

    // Persist to SQLite
    const updateStmt = this.prepared.get('updateTrajectory');
    if (updateStmt) {
      updateStmt.run(
        endedAt.toISOString(),
        success ? 1 : 0,
        JSON.stringify(active.steps),
        JSON.stringify({ metrics, context: active.context }),
        null, // embedding - computed later if needed
        feedback ?? null,
        null, // related_patterns - computed later
        trajectoryId
      );
    }

    // Remove from active, add to recent buffer
    this.activeTrajectories.delete(trajectoryId);
    this.recentTrajectories.push(trajectory);

    this.stats.trajectoriesCompleted++;

    return trajectory;
  }

  /**
   * Get a trajectory by ID
   */
  async getTrajectory(id: string): Promise<Trajectory | null> {
    this.ensureInitialized();

    // Check active first
    const active = this.activeTrajectories.get(id);
    if (active) {
      return {
        id: active.id,
        task: active.task,
        agent: active.agent,
        domain: active.domain,
        steps: active.steps,
        outcome: 'partial', // Still in progress
        metrics: this.calculateMetrics(active.steps),
        startedAt: active.startedAt,
      };
    }

    // Check database
    const stmt = this.prepared.get('getTrajectory');
    if (!stmt) return null;

    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.rowToTrajectory(row);
  }

  /**
   * Get recent successful trajectories for a domain
   */
  async getSuccessfulTrajectories(
    domain: QEDomain,
    limit: number = 10
  ): Promise<Trajectory[]> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getTrajectoryByDomain');
    if (!stmt) return [];

    const rows = stmt.all(domain, limit) as any[];
    const trajectories: Trajectory[] = [];

    for (const row of rows) {
      const trajectory = await this.rowToTrajectory(row);
      if (trajectory) {
        trajectories.push(trajectory);
      }
    }

    return trajectories;
  }

  /**
   * Get trajectories similar to a task (by task description)
   */
  async findSimilarTrajectories(
    task: string,
    limit: number = 5
  ): Promise<Trajectory[]> {
    this.ensureInitialized();

    // For now, use simple keyword matching
    // In production, use embedding similarity via HNSW
    const keywords = task.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    const recent = this.recentTrajectories.toArray();
    const scored = recent.map(t => {
      const taskLower = t.task.toLowerCase();
      const matches = keywords.filter(k => taskLower.includes(k)).length;
      return { trajectory: t, score: matches / keywords.length };
    });

    return scored
      .filter(s => s.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.trajectory);
  }

  /**
   * Get statistics
   */
  getStats(): {
    trajectoriesStarted: number;
    trajectoriesCompleted: number;
    trajectoriesAbandoned: number;
    activeTrajectories: number;
    totalStepsRecorded: number;
    averageQuality: number;
    recentBufferSize: number;
  } {
    return {
      ...this.stats,
      activeTrajectories: this.activeTrajectories.size,
      recentBufferSize: this.recentTrajectories.length,
    };
  }

  /**
   * Clean up old trajectories
   */
  async cleanup(olderThanDays: number = 30): Promise<number> {
    this.ensureInitialized();
    if (!this.db) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = this.db.prepare(`
      DELETE FROM qe_trajectories WHERE ended_at < ?
    `).run(cutoff.toISOString());

    return result.changes;
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    this.activeTrajectories.clear();
    this.recentTrajectories.clear();
    this.prepared.clear();
    this.db = null;
    this.unifiedMemory = null;
    this.initialized = false;
    console.log('[TrajectoryTracker] Disposed');
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('TrajectoryTracker not initialized. Call initialize() first.');
    }
  }

  private calculateStepQuality(result: TrajectoryStepResult): number {
    switch (result.outcome) {
      case 'success':
        return 1.0;
      case 'partial':
        return 0.6;
      case 'skipped':
        return 0.5;
      case 'failure':
        return 0.0;
      default:
        return 0.5;
    }
  }

  private calculateMetrics(steps: TrajectoryStep[]): TrajectoryMetrics {
    if (steps.length === 0) {
      return {
        totalDurationMs: 0,
        successfulSteps: 0,
        failedSteps: 0,
        averageQuality: 0,
        totalTokensUsed: 0,
        efficiencyScore: 0,
      };
    }

    let totalDurationMs = 0;
    let successfulSteps = 0;
    let failedSteps = 0;
    let totalQuality = 0;
    let totalTokensUsed = 0;

    for (const step of steps) {
      totalDurationMs += step.durationMs;
      totalQuality += step.quality;
      totalTokensUsed += step.tokensUsed ?? 0;

      if (step.result.outcome === 'success') {
        successfulSteps++;
      } else if (step.result.outcome === 'failure') {
        failedSteps++;
      }
    }

    const averageQuality = totalQuality / steps.length;
    const successRate = successfulSteps / steps.length;
    const efficiencyScore = successRate * averageQuality;

    return {
      totalDurationMs,
      successfulSteps,
      failedSteps,
      averageQuality,
      totalTokensUsed,
      efficiencyScore,
    };
  }

  private async rowToTrajectory(row: TrajectoryRow | undefined): Promise<Trajectory | null> {
    if (!row) return null;

    // Get steps from trajectory_steps table
    const stepsStmt = this.prepared.get('getSteps');
    let steps: TrajectoryStep[] = [];

    if (stepsStmt) {
      const stepRows = stepsStmt.all(row.id) as StepRow[];
      steps = stepRows.map(s => ({
        id: s.id,
        action: s.action,
        result: {
          outcome: s.outcome as TrajectoryStepResult['outcome'],
          data: s.result_data ? JSON.parse(s.result_data) : undefined,
          error: s.error_message ?? undefined,
          metrics: s.metrics_json ? JSON.parse(s.metrics_json) : undefined,
        },
        quality: s.quality,
        durationMs: s.duration_ms,
        timestamp: new Date(s.timestamp),
        context: s.context_json ? JSON.parse(s.context_json) : undefined,
        tokensUsed: s.tokens_used ?? undefined,
      }));
    } else if (row.steps_json) {
      // Fallback to JSON blob
      try {
        steps = JSON.parse(row.steps_json);
      } catch {
        steps = [];
      }
    }

    const metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
    const metrics = metadata.metrics ?? this.calculateMetrics(steps);

    return {
      id: row.id,
      task: row.task,
      agent: row.agent ?? undefined,
      domain: row.domain as QEDomain | undefined,
      steps,
      outcome: row.success === 1 ? 'success' : row.success === 0 ? 'failure' : 'partial',
      metrics,
      startedAt: new Date(row.started_at),
      endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
      feedback: row.feedback ?? undefined,
      embedding: row.embedding ? this.bufferToFloatArray(row.embedding) : undefined,
      relatedPatternIds: row.related_patterns ? JSON.parse(row.related_patterns) : undefined,
    };
  }

  private bufferToFloatArray(buffer: Buffer): number[] {
    const dimension = buffer.length / 4;
    const arr: number[] = [];
    for (let i = 0; i < dimension; i++) {
      arr.push(buffer.readFloatLE(i * 4));
    }
    return arr;
  }
}

/**
 * Create a TrajectoryTracker instance
 */
export function createTrajectoryTracker(
  config: Partial<TrajectoryTrackerConfig> = {}
): TrajectoryTracker {
  return new TrajectoryTracker(config);
}
