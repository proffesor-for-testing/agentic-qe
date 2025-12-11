/**
 * ExperienceCapture - Captures agent executions for learning
 *
 * Automatically captures agent execution data and stores it for later
 * pattern synthesis during sleep cycles.
 *
 * Part of the Nightly-Learner Phase 1 implementation.
 *
 * @version 1.0.0
 * @module src/learning/capture/ExperienceCapture
 */

import { EventEmitter } from 'events';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';

export interface CapturedExperience {
  id: string;
  agentId: string;
  agentType: string;
  taskType: string;
  execution: {
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    duration: number;
    success: boolean;
  };
  context: {
    patterns_used: string[];
    decisions_made: string[];
    errors_encountered: string[];
  };
  outcome: {
    quality_score: number;
    coverage_delta: number;
    user_feedback?: 'positive' | 'negative' | 'neutral';
  };
  timestamp: Date;
  embedding?: number[];
}

export interface AgentExecutionEvent {
  agentId: string;
  agentType: string;
  taskId: string;
  taskType: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  duration: number;
  success: boolean;
  error?: Error;
  metrics?: Record<string, number>;
  timestamp: Date;
}

export interface ExperienceCaptureConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Buffer size before automatic flush. Default: 100 */
  bufferSize?: number;
  /** Flush interval in ms. Default: 30000 (30 sec) */
  flushInterval?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface CaptureStats {
  totalCaptured: number;
  totalFlushed: number;
  bufferSize: number;
  lastFlush: Date | null;
  byAgentType: Record<string, number>;
  byTaskType: Record<string, number>;
  successRate: number;
}

/**
 * ExperienceCapture captures and stores agent execution experiences
 *
 * @example
 * ```typescript
 * const capture = new ExperienceCapture({ bufferSize: 50 });
 * await capture.start();
 *
 * // Capture an execution
 * await capture.captureExecution({
 *   agentId: 'agent-123',
 *   agentType: 'test-generator',
 *   taskType: 'unit-test-generation',
 *   // ...
 * });
 * ```
 */
export class ExperienceCapture extends EventEmitter {
  private static instance: ExperienceCapture | null = null;
  private static instancePromise: Promise<ExperienceCapture> | null = null;

  private config: Required<ExperienceCaptureConfig>;
  private db: BetterSqlite3.Database;
  private logger: Logger;
  private buffer: CapturedExperience[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  // Stats tracking
  private totalCaptured: number = 0;
  private totalFlushed: number = 0;
  private lastFlush: Date | null = null;
  private byAgentType: Record<string, number> = {};
  private byTaskType: Record<string, number> = {};
  private successCount: number = 0;

  /**
   * Get or create the shared ExperienceCapture instance
   * Uses singleton pattern to ensure all agents share the same capture buffer
   */
  static async getSharedInstance(config?: ExperienceCaptureConfig): Promise<ExperienceCapture> {
    if (ExperienceCapture.instance && ExperienceCapture.instance.isRunning) {
      return ExperienceCapture.instance;
    }

    // Handle concurrent initialization
    if (ExperienceCapture.instancePromise) {
      return ExperienceCapture.instancePromise;
    }

    ExperienceCapture.instancePromise = (async () => {
      if (!ExperienceCapture.instance) {
        ExperienceCapture.instance = new ExperienceCapture(config);
      }
      if (!ExperienceCapture.instance.isRunning) {
        await ExperienceCapture.instance.start();
      }
      return ExperienceCapture.instance;
    })();

    const instance = await ExperienceCapture.instancePromise;
    ExperienceCapture.instancePromise = null;
    return instance;
  }

  /**
   * Reset the shared instance (for testing)
   */
  static resetInstance(): void {
    if (ExperienceCapture.instance) {
      ExperienceCapture.instance.stop().catch(() => {});
      ExperienceCapture.instance = null;
    }
    ExperienceCapture.instancePromise = null;
  }

  constructor(config?: ExperienceCaptureConfig) {
    super();
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
      bufferSize: config?.bufferSize ?? 100,
      flushInterval: config?.flushInterval ?? 30000,
      debug: config?.debug ?? false,
    };

    this.db = new BetterSqlite3(this.config.dbPath);
    this.initializeSchema();
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
    `);
  }

  /**
   * Start capturing experiences
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('[ExperienceCapture] Already running');
      return;
    }

    this.isRunning = true;

    // Start periodic flush
    this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);

    this.logger.info('[ExperienceCapture] Started', {
      bufferSize: this.config.bufferSize,
      flushInterval: this.config.flushInterval,
    });

    this.emit('started');
  }

  /**
   * Stop capturing and flush remaining buffer
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flush();

    this.logger.info('[ExperienceCapture] Stopped', {
      totalCaptured: this.totalCaptured,
      totalFlushed: this.totalFlushed,
    });

    this.emit('stopped');
  }

  /**
   * Capture an agent execution event
   */
  async captureExecution(event: AgentExecutionEvent): Promise<string> {
    if (!this.isRunning) {
      throw new Error('ExperienceCapture not running');
    }

    const experience = await this.extractExperience(event);
    this.buffer.push(experience);

    // Update stats
    this.totalCaptured++;
    this.byAgentType[event.agentType] = (this.byAgentType[event.agentType] || 0) + 1;
    this.byTaskType[event.taskType] = (this.byTaskType[event.taskType] || 0) + 1;
    if (event.success) this.successCount++;

    if (this.config.debug) {
      this.logger.debug('[ExperienceCapture] Captured', {
        id: experience.id,
        agentType: event.agentType,
        taskType: event.taskType,
        bufferSize: this.buffer.length,
      });
    }

    this.emit('captured', experience);

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.config.bufferSize) {
      await this.flush();
    }

    return experience.id;
  }

  /**
   * Flush buffer to database
   */
  async flush(): Promise<number> {
    if (this.buffer.length === 0) return 0;

    const experiences = [...this.buffer];
    this.buffer = [];

    const stmt = this.db.prepare(`
      INSERT INTO captured_experiences
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

    const flushed = insertMany(experiences);
    this.totalFlushed += flushed;
    this.lastFlush = new Date();

    this.logger.info('[ExperienceCapture] Flushed', { count: flushed });
    this.emit('flushed', { count: flushed, experiences });

    return flushed;
  }

  /**
   * Get unprocessed experiences for learning
   */
  getUnprocessedExperiences(limit: number = 100): CapturedExperience[] {
    const rows = this.db.prepare(`
      SELECT * FROM captured_experiences
      WHERE processed = 0
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => this.rowToExperience(row));
  }

  /**
   * Get experiences by agent type
   */
  getExperiencesByAgentType(agentType: string, limit: number = 100): CapturedExperience[] {
    const rows = this.db.prepare(`
      SELECT * FROM captured_experiences
      WHERE agent_type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(agentType, limit) as any[];

    return rows.map(row => this.rowToExperience(row));
  }

  /**
   * Get recent experiences
   */
  getRecentExperiences(hours: number = 24, limit: number = 100): CapturedExperience[] {
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
   * Mark experiences as processed
   */
  markAsProcessed(ids: string[]): void {
    const stmt = this.db.prepare(`
      UPDATE captured_experiences SET processed = 1 WHERE id = ?
    `);

    const updateMany = this.db.transaction((expIds: string[]) => {
      for (const id of expIds) {
        stmt.run(id);
      }
    });

    updateMany(ids);
  }

  /**
   * Get capture statistics
   */
  getStats(): CaptureStats {
    return {
      totalCaptured: this.totalCaptured,
      totalFlushed: this.totalFlushed,
      bufferSize: this.buffer.length,
      lastFlush: this.lastFlush,
      byAgentType: { ...this.byAgentType },
      byTaskType: { ...this.byTaskType },
      successRate: this.totalCaptured > 0 ? this.successCount / this.totalCaptured : 0,
    };
  }

  /**
   * Extract a CapturedExperience from an execution event
   */
  private async extractExperience(event: AgentExecutionEvent): Promise<CapturedExperience> {
    // Extract patterns and decisions from output
    const patternsUsed = this.extractPatterns(event.output);
    const decisionsMade = this.extractDecisions(event.output);
    const errorsEncountered = event.error ? [event.error.message] : [];

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(event);

    return {
      id: `exp-${Date.now()}-${SecureRandom.randomString(8, 'alphanumeric')}`,
      agentId: event.agentId,
      agentType: event.agentType,
      taskType: event.taskType,
      execution: {
        input: event.input,
        output: event.output,
        duration: event.duration,
        success: event.success,
      },
      context: {
        patterns_used: patternsUsed,
        decisions_made: decisionsMade,
        errors_encountered: errorsEncountered,
      },
      outcome: {
        quality_score: qualityScore,
        coverage_delta: event.metrics?.coverage_delta || 0,
      },
      timestamp: event.timestamp,
    };
  }

  /**
   * Extract pattern IDs from execution output
   */
  private extractPatterns(output: Record<string, unknown>): string[] {
    const patterns: string[] = [];

    // Look for pattern references in output
    if (output.patterns && Array.isArray(output.patterns)) {
      patterns.push(...output.patterns.map((p: any) => p.id || String(p)));
    }

    if (output.patternsApplied && Array.isArray(output.patternsApplied)) {
      patterns.push(...output.patternsApplied);
    }

    return patterns;
  }

  /**
   * Extract decision points from execution output
   */
  private extractDecisions(output: Record<string, unknown>): string[] {
    const decisions: string[] = [];

    // Look for decision references in output
    if (output.decisions && Array.isArray(output.decisions)) {
      decisions.push(...output.decisions.map(String));
    }

    if (output.strategy) {
      decisions.push(`strategy:${output.strategy}`);
    }

    if (output.framework) {
      decisions.push(`framework:${output.framework}`);
    }

    return decisions;
  }

  /**
   * Calculate a quality score for the execution
   */
  private calculateQualityScore(event: AgentExecutionEvent): number {
    let score = event.success ? 0.5 : 0.0;

    // Bonus for metrics
    if (event.metrics) {
      if (event.metrics.coverage && event.metrics.coverage > 70) {
        score += 0.2;
      }
      if (event.metrics.testsGenerated && event.metrics.testsGenerated > 5) {
        score += 0.1;
      }
      if (event.metrics.duration && event.metrics.duration < 5000) {
        score += 0.1; // Fast execution bonus
      }
    }

    // Penalty for errors
    if (event.error) {
      score -= 0.2;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Convert database row to CapturedExperience
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
      embedding: row.embedding ? Array.from(new Float32Array(row.embedding)) : undefined,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

export default ExperienceCapture;
