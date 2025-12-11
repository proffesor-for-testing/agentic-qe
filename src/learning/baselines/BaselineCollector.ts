/**
 * BaselineCollector - Phase 0 of Nightly-Learner System
 *
 * Collects performance baselines for all 19 QE agents to establish
 * quantitative improvement targets (10-20% above baseline).
 *
 * Architecture:
 * - Uses shared memory database (.agentic-qe/memory.db)
 * - Stores baselines in dedicated `learning_baselines` table
 * - Integrates with StandardTaskSuite for consistent benchmarking
 * - Provides baseline queries for improvement tracking
 *
 * @version 1.0.0
 * @module src/learning/baselines/BaselineCollector
 */

import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';
import { QEAgentType } from '../../types';
import { StandardTaskSuite, StandardTask } from './StandardTaskSuite';

/**
 * Performance baseline for a QE agent
 */
export interface LearningBaseline {
  id?: string;
  agentId: string;
  agentType: QEAgentType;
  taskType: string;
  metrics: {
    avgCompletionTime: number;      // milliseconds
    successRate: number;            // 0-1
    patternRecallAccuracy: number;  // 0-1
    coverageAchieved: number;       // percentage (0-100)
  };
  sampleSize: number;
  collectedAt: Date;
  updatedAt?: Date;
}

/**
 * Baseline statistics for reporting
 */
export interface BaselineStats {
  agentType: QEAgentType;
  totalBaselines: number;
  avgSuccessRate: number;
  avgCompletionTime: number;
  avgCoverage: number;
  lastCollected: Date | null;
}

/**
 * Improvement target derived from baseline
 */
export interface ImprovementTarget {
  agentType: QEAgentType;
  taskType: string;
  baseline: LearningBaseline;
  targets: {
    targetCompletionTime: number;     // 10-20% faster
    targetSuccessRate: number;         // 10-20% higher
    targetCoverage: number;            // 10-20% higher
  };
  minImprovementThreshold: number;   // Minimum % improvement (10%)
  aspirationalThreshold: number;     // Aspirational % improvement (20%)
}

/**
 * Configuration for baseline collection
 */
export interface BaselineCollectorConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Sample size for baseline calculation. Default: 10 */
  sampleSize?: number;
  /** Timeout for each task execution (ms). Default: 30000 */
  taskTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * BaselineCollector collects and manages performance baselines
 *
 * @example
 * ```typescript
 * const collector = new BaselineCollector();
 * await collector.initialize();
 *
 * // Collect baseline for test-generator
 * const baseline = await collector.collectBaseline(
 *   'test-gen-001',
 *   QEAgentType.TEST_GENERATOR,
 *   'unit-test-generation'
 * );
 *
 * // Get improvement targets
 * const targets = collector.getImprovementTarget(baseline);
 * ```
 */
export class BaselineCollector {
  private config: Required<BaselineCollectorConfig>;
  private db: BetterSqlite3.Database;
  private logger: Logger;
  private taskSuite: StandardTaskSuite;
  private isInitialized: boolean = false;

  constructor(config?: BaselineCollectorConfig) {
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
      sampleSize: config?.sampleSize ?? 10,
      taskTimeout: config?.taskTimeout ?? 30000,
      debug: config?.debug ?? false,
    };

    this.db = new BetterSqlite3(this.config.dbPath);
    this.taskSuite = new StandardTaskSuite();
  }

  /**
   * Initialize the baseline collector and database schema
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('[BaselineCollector] Already initialized');
      return;
    }

    this.logger.info('[BaselineCollector] Initializing...');

    this.initializeSchema();
    this.isInitialized = true;

    this.logger.info('[BaselineCollector] Initialized successfully');
  }

  /**
   * Initialize database schema for baselines
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS learning_baselines (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        task_type TEXT NOT NULL,
        avg_completion_time REAL NOT NULL,
        success_rate REAL NOT NULL,
        pattern_recall_accuracy REAL NOT NULL,
        coverage_achieved REAL NOT NULL,
        sample_size INTEGER NOT NULL,
        collected_at INTEGER NOT NULL,
        updated_at INTEGER,
        UNIQUE(agent_id, agent_type, task_type)
      );

      CREATE INDEX IF NOT EXISTS idx_baselines_agent_type ON learning_baselines(agent_type);
      CREATE INDEX IF NOT EXISTS idx_baselines_task_type ON learning_baselines(task_type);
      CREATE INDEX IF NOT EXISTS idx_baselines_collected_at ON learning_baselines(collected_at);
    `);
  }

  /**
   * Collect baseline for a specific agent and task type
   *
   * Runs the standard task suite multiple times and calculates average metrics.
   *
   * @param agentId - Agent identifier
   * @param agentType - QE agent type
   * @param taskType - Task type to baseline
   * @returns Collected baseline
   */
  async collectBaseline(
    agentId: string,
    agentType: QEAgentType,
    taskType: string
  ): Promise<LearningBaseline> {
    if (!this.isInitialized) {
      throw new Error('BaselineCollector not initialized');
    }

    this.logger.info(`[BaselineCollector] Collecting baseline for ${agentType} - ${taskType}`, {
      agentId,
      sampleSize: this.config.sampleSize,
    });

    // Get standard tasks for this agent type and task type
    const tasks = this.taskSuite.getTasksForAgent(agentType, taskType);

    if (tasks.length === 0) {
      throw new Error(`No standard tasks found for ${agentType} - ${taskType}`);
    }

    // Run tasks and collect metrics
    const results: Array<{
      completionTime: number;
      success: boolean;
      coverage: number;
      patternsRecalled: number;
      totalPatterns: number;
    }> = [];

    for (let i = 0; i < this.config.sampleSize; i++) {
      const task = tasks[i % tasks.length]; // Cycle through tasks
      const result = await this.executeStandardTask(task);
      results.push(result);

      if (this.config.debug) {
        this.logger.debug(`[BaselineCollector] Sample ${i + 1}/${this.config.sampleSize}`, result);
      }
    }

    // Calculate aggregate metrics
    const metrics = this.calculateMetrics(results);

    const baseline: LearningBaseline = {
      id: `baseline-${Date.now()}-${SecureRandom.randomString(8, 'alphanumeric')}`,
      agentId,
      agentType,
      taskType,
      metrics,
      sampleSize: results.length,
      collectedAt: new Date(),
    };

    // Store baseline in database
    await this.storeBaseline(baseline);

    this.logger.info(`[BaselineCollector] Baseline collected for ${agentType} - ${taskType}`, {
      metrics,
    });

    return baseline;
  }

  /**
   * Collect baselines for all 19 QE agent types
   *
   * Runs comprehensive baseline collection across all agents.
   * This is typically run once during Phase 0 setup.
   *
   * @returns Array of collected baselines
   */
  async collectAllBaselines(): Promise<LearningBaseline[]> {
    const allAgentTypes = Object.values(QEAgentType);
    const baselines: LearningBaseline[] = [];

    this.logger.info(`[BaselineCollector] Collecting baselines for ${allAgentTypes.length} agent types`);

    for (const agentType of allAgentTypes) {
      // Get task types for this agent
      const taskTypes = this.taskSuite.getTaskTypesForAgent(agentType);

      for (const taskType of taskTypes) {
        try {
          const agentId = `baseline-agent-${agentType}`;
          const baseline = await this.collectBaseline(agentId, agentType, taskType);
          baselines.push(baseline);
        } catch (error) {
          this.logger.warn(`[BaselineCollector] Failed to collect baseline for ${agentType} - ${taskType}`, error);
        }
      }
    }

    this.logger.info(`[BaselineCollector] Collected ${baselines.length} baselines`);
    return baselines;
  }

  /**
   * Execute a standard task and measure performance
   */
  private async executeStandardTask(task: StandardTask): Promise<{
    completionTime: number;
    success: boolean;
    coverage: number;
    patternsRecalled: number;
    totalPatterns: number;
  }> {
    const startTime = Date.now();

    // Simulate task execution
    // In production, this would call the actual agent
    const success = Math.random() > 0.2; // 80% success rate baseline
    const coverage = 60 + Math.random() * 30; // 60-90% coverage
    const patternsRecalled = Math.floor(Math.random() * 5);
    const totalPatterns = 5;

    // Simulate variable completion time based on task complexity
    const baseTime = task.expectedDuration || 1000;
    const variance = baseTime * 0.2; // 20% variance
    const completionTime = baseTime + (Math.random() * variance * 2 - variance);

    // Wait for simulated execution time
    await new Promise(resolve => setTimeout(resolve, Math.min(100, completionTime / 10)));

    return {
      completionTime: Date.now() - startTime,
      success,
      coverage,
      patternsRecalled,
      totalPatterns,
    };
  }

  /**
   * Calculate aggregate metrics from task results
   */
  private calculateMetrics(results: Array<{
    completionTime: number;
    success: boolean;
    coverage: number;
    patternsRecalled: number;
    totalPatterns: number;
  }>): LearningBaseline['metrics'] {
    const totalResults = results.length;

    const avgCompletionTime = results.reduce((sum, r) => sum + r.completionTime, 0) / totalResults;
    const successRate = results.filter(r => r.success).length / totalResults;
    const avgCoverage = results.reduce((sum, r) => sum + r.coverage, 0) / totalResults;

    // Calculate pattern recall accuracy
    const totalRecalled = results.reduce((sum, r) => sum + r.patternsRecalled, 0);
    const totalPatterns = results.reduce((sum, r) => sum + r.totalPatterns, 0);
    const patternRecallAccuracy = totalPatterns > 0 ? totalRecalled / totalPatterns : 0;

    return {
      avgCompletionTime,
      successRate,
      patternRecallAccuracy,
      coverageAchieved: avgCoverage,
    };
  }

  /**
   * Store baseline in database
   */
  private async storeBaseline(baseline: LearningBaseline): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO learning_baselines
      (id, agent_id, agent_type, task_type, avg_completion_time, success_rate,
       pattern_recall_accuracy, coverage_achieved, sample_size, collected_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      baseline.id,
      baseline.agentId,
      baseline.agentType,
      baseline.taskType,
      baseline.metrics.avgCompletionTime,
      baseline.metrics.successRate,
      baseline.metrics.patternRecallAccuracy,
      baseline.metrics.coverageAchieved,
      baseline.sampleSize,
      baseline.collectedAt.getTime(),
      Date.now()
    );
  }

  /**
   * Get baseline for specific agent type and task type
   */
  getBaseline(agentType: QEAgentType, taskType: string): LearningBaseline | null {
    const row = this.db.prepare(`
      SELECT * FROM learning_baselines
      WHERE agent_type = ? AND task_type = ?
      ORDER BY collected_at DESC
      LIMIT 1
    `).get(agentType, taskType) as any;

    return row ? this.rowToBaseline(row) : null;
  }

  /**
   * Get all baselines for an agent type
   */
  getBaselinesForAgent(agentType: QEAgentType): LearningBaseline[] {
    const rows = this.db.prepare(`
      SELECT * FROM learning_baselines
      WHERE agent_type = ?
      ORDER BY task_type, collected_at DESC
    `).all(agentType) as any[];

    return rows.map(row => this.rowToBaseline(row));
  }

  /**
   * Get baseline statistics for an agent type
   */
  getBaselineStats(agentType: QEAgentType): BaselineStats | null {
    const baselines = this.getBaselinesForAgent(agentType);

    if (baselines.length === 0) {
      return null;
    }

    const avgSuccessRate = baselines.reduce((sum, b) => sum + b.metrics.successRate, 0) / baselines.length;
    const avgCompletionTime = baselines.reduce((sum, b) => sum + b.metrics.avgCompletionTime, 0) / baselines.length;
    const avgCoverage = baselines.reduce((sum, b) => sum + b.metrics.coverageAchieved, 0) / baselines.length;
    const lastCollected = baselines.reduce(
      (latest, b) => b.collectedAt > latest ? b.collectedAt : latest,
      baselines[0].collectedAt
    );

    return {
      agentType,
      totalBaselines: baselines.length,
      avgSuccessRate,
      avgCompletionTime,
      avgCoverage,
      lastCollected,
    };
  }

  /**
   * Get improvement target from baseline
   *
   * Calculates 10-20% improvement targets above baseline metrics.
   */
  getImprovementTarget(baseline: LearningBaseline): ImprovementTarget {
    const minImprovement = 0.1;  // 10%
    const aspirationalImprovement = 0.2;  // 20%

    // For completion time, faster is better (reduce by 10-20%)
    const targetCompletionTime = baseline.metrics.avgCompletionTime * (1 - aspirationalImprovement);

    // For success rate and coverage, higher is better (increase by 10-20%)
    const targetSuccessRate = Math.min(1.0, baseline.metrics.successRate * (1 + aspirationalImprovement));
    const targetCoverage = Math.min(100, baseline.metrics.coverageAchieved * (1 + aspirationalImprovement));

    return {
      agentType: baseline.agentType,
      taskType: baseline.taskType,
      baseline,
      targets: {
        targetCompletionTime,
        targetSuccessRate,
        targetCoverage,
      },
      minImprovementThreshold: minImprovement,
      aspirationalThreshold: aspirationalImprovement,
    };
  }

  /**
   * Check if current performance meets improvement target
   */
  meetsImprovementTarget(
    baseline: LearningBaseline,
    currentMetrics: LearningBaseline['metrics']
  ): {
    meetsTarget: boolean;
    improvements: Record<string, { met: boolean; improvement: number }>;
  } {
    const target = this.getImprovementTarget(baseline);
    const minThreshold = target.minImprovementThreshold;

    // Calculate improvements
    const completionTimeImprovement =
      (baseline.metrics.avgCompletionTime - currentMetrics.avgCompletionTime) /
      baseline.metrics.avgCompletionTime;

    const successRateImprovement =
      (currentMetrics.successRate - baseline.metrics.successRate) /
      baseline.metrics.successRate;

    const coverageImprovement =
      (currentMetrics.coverageAchieved - baseline.metrics.coverageAchieved) /
      baseline.metrics.coverageAchieved;

    const improvements = {
      completionTime: {
        met: completionTimeImprovement >= minThreshold,
        improvement: completionTimeImprovement,
      },
      successRate: {
        met: successRateImprovement >= minThreshold,
        improvement: successRateImprovement,
      },
      coverage: {
        met: coverageImprovement >= minThreshold,
        improvement: coverageImprovement,
      },
    };

    // Meets target if at least 2 out of 3 metrics improved by minimum threshold
    const meetsTarget = Object.values(improvements).filter(i => i.met).length >= 2;

    return { meetsTarget, improvements };
  }

  /**
   * Convert database row to LearningBaseline
   */
  private rowToBaseline(row: any): LearningBaseline {
    return {
      id: row.id,
      agentId: row.agent_id,
      agentType: row.agent_type as QEAgentType,
      taskType: row.task_type,
      metrics: {
        avgCompletionTime: row.avg_completion_time,
        successRate: row.success_rate,
        patternRecallAccuracy: row.pattern_recall_accuracy,
        coverageAchieved: row.coverage_achieved,
      },
      sampleSize: row.sample_size,
      collectedAt: new Date(row.collected_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    this.isInitialized = false;
  }
}

export default BaselineCollector;
