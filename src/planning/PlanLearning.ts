/**
 * PlanLearning - Learning from Plan Executions
 *
 * Implements reinforcement learning integration for GOAP planning:
 * - Updates action success rates based on execution outcomes
 * - Adjusts action costs based on actual execution times
 * - Provides GOAP state encoding for Q-Learning integration
 * - Tracks plan reuse and learning metrics
 *
 * Integrates with:
 * - PlanSimilarity for plan reuse
 * - QLearning for state-action value updates
 * - PlanExecutor for execution feedback
 *
 * @module planning/PlanLearning
 * @version 1.0.0
 */

import Database from 'better-sqlite3';
import { Logger } from '../utils/Logger';
import { WorldState, GOAPAction, GOAPPlan, ExecutedAction, StateConditions } from './types';
import { PlanSimilarity, SimilarPlan } from './PlanSimilarity';
import { QLearning } from '../learning/QLearning';
import { TaskState, AgentAction, TaskExperience } from '../learning/types';

/**
 * Learning configuration
 */
export interface PlanLearningConfig {
  learningRate: number;           // Alpha for EMA updates (0-1)
  costAdjustmentRate: number;     // Rate of cost updates (0-1)
  minExecutionsForUpdate: number; // Min executions before updating
  successRateDecay: number;       // Decay for old success data
  enableQLearning: boolean;       // Use Q-Learning for state-action values
  planReuseThreshold: number;     // Min similarity for plan reuse
}

const DEFAULT_CONFIG: PlanLearningConfig = {
  learningRate: 0.1,
  costAdjustmentRate: 0.05,
  minExecutionsForUpdate: 3,
  successRateDecay: 0.99,
  enableQLearning: true,
  planReuseThreshold: 0.7
};

/**
 * Action execution statistics
 */
export interface ActionStats {
  actionId: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgExecutionTimeMs: number;
  avgCost: number;
  lastExecuted: Date;
}

/**
 * Plan learning outcome
 */
export interface PlanLearningOutcome {
  planId: string;
  success: boolean;
  actionsUpdated: number;
  reusedFromPlan?: string;
  qValueUpdates: number;
  totalExecutionTimeMs: number;
  learningMetrics: {
    avgSuccessRateChange: number;
    avgCostChange: number;
    planSimilarityScore?: number;
  };
}

/**
 * GOAP state for Q-Learning encoding
 */
export interface GOAPState {
  coverageLevel: 'low' | 'medium' | 'high';
  qualityLevel: 'low' | 'medium' | 'high';
  securityLevel: 'low' | 'medium' | 'high';
  fleetCapacity: 'limited' | 'normal' | 'high';
  timeConstraint: 'tight' | 'normal' | 'relaxed';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * GOAP action for Q-Learning encoding
 */
export interface GOAPQLearningAction {
  category: string;
  agentType: string;
  costLevel: 'low' | 'medium' | 'high';
}

/**
 * PlanLearning - Reinforcement learning integration for GOAP
 */
export class PlanLearning {
  private db: Database.Database;
  private logger: Logger;
  private config: PlanLearningConfig;
  private similarity: PlanSimilarity;
  private qLearner?: QLearning;
  private actionStatsCache: Map<string, ActionStats> = new Map();
  private schemaInitialized = false;

  constructor(
    db: Database.Database,
    config: Partial<PlanLearningConfig> = {},
    qLearner?: QLearning
  ) {
    this.db = db;
    this.logger = Logger.getInstance();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.similarity = new PlanSimilarity(db);

    if (config.enableQLearning !== false) {
      this.qLearner = qLearner || new QLearning({
        learningRate: this.config.learningRate,
        discountFactor: 0.95,
        explorationRate: 0.2,
        explorationDecay: 0.995,
        minExplorationRate: 0.05,
        useExperienceReplay: true,
        replayBufferSize: 5000,
        batchSize: 32
      }, 'goap-plan-learner');
    }
  }

  /**
   * Initialize schema for learning tables
   */
  ensureSchema(): void {
    if (this.schemaInitialized) return;

    // Action statistics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goap_action_stats (
        action_id TEXT PRIMARY KEY,
        execution_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 1.0,
        avg_execution_time_ms REAL DEFAULT 0,
        avg_cost REAL DEFAULT 1.0,
        last_executed DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Learning history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goap_learning_history (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        state_before TEXT NOT NULL,
        state_after TEXT NOT NULL,
        success INTEGER NOT NULL,
        execution_time_ms INTEGER NOT NULL,
        reward REAL NOT NULL,
        q_value_update REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes
    try {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_action_stats_success ON goap_action_stats (success_rate DESC)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_learning_history_plan ON goap_learning_history (plan_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_learning_history_action ON goap_learning_history (action_id)');
    } catch {
      // Indexes may already exist
    }

    // Ensure similarity schema
    this.similarity.ensureSchema();

    this.schemaInitialized = true;
    this.logger.debug('[PlanLearning] Schema initialized');
  }

  /**
   * Encode WorldState to discretized GOAP state for Q-Learning
   */
  encodeWorldState(state: WorldState): GOAPState {
    return {
      coverageLevel: this.discretizeCoverage(state.coverage.line),
      qualityLevel: this.discretizeQuality(state.quality.testsPassing),
      securityLevel: this.discretizeSecurity(state.quality.securityScore),
      fleetCapacity: this.discretizeFleet(state.fleet.availableAgents.length),
      timeConstraint: this.discretizeTime(state.resources.timeRemaining),
      riskLevel: state.context.riskLevel
    };
  }

  /**
   * Encode GOAP action for Q-Learning
   */
  encodeGOAPAction(action: GOAPAction): GOAPQLearningAction {
    return {
      category: action.category,
      agentType: action.agentType,
      costLevel: this.discretizeCost(action.cost)
    };
  }

  /**
   * Convert GOAP state to Q-Learning TaskState
   */
  toTaskState(goapState: GOAPState): TaskState {
    const complexityMap = { low: 0.3, medium: 0.5, high: 0.8, critical: 1.0 };
    const resourceMap = { limited: 0.3, normal: 0.6, high: 0.9 };
    const timeMap = { tight: 60000, normal: 300000, relaxed: 600000 };

    return {
      taskComplexity: complexityMap[goapState.riskLevel] ?? 0.5,
      requiredCapabilities: [goapState.coverageLevel, goapState.qualityLevel, goapState.securityLevel],
      contextFeatures: {
        coverageLevel: goapState.coverageLevel,
        qualityLevel: goapState.qualityLevel,
        securityLevel: goapState.securityLevel,
        fleetCapacity: goapState.fleetCapacity,
        timeConstraint: goapState.timeConstraint,
        riskLevel: goapState.riskLevel
      },
      previousAttempts: 0,
      availableResources: resourceMap[goapState.fleetCapacity] ?? 0.6,
      timeConstraint: timeMap[goapState.timeConstraint] ?? 300000
    };
  }

  /**
   * Convert GOAP action to Q-Learning AgentAction
   */
  toAgentAction(goapAction: GOAPQLearningAction): AgentAction {
    return {
      strategy: goapAction.category,
      toolsUsed: [goapAction.agentType],
      parallelization: goapAction.costLevel === 'high' ? 0.3 : 0.7,
      retryPolicy: 'exponential',
      resourceAllocation: goapAction.costLevel === 'low' ? 0.3 : goapAction.costLevel === 'medium' ? 0.5 : 0.8
    };
  }

  // Discretization helpers
  private discretizeCoverage(coverage: number): 'low' | 'medium' | 'high' {
    if (coverage < 50) return 'low';
    if (coverage < 80) return 'medium';
    return 'high';
  }

  private discretizeQuality(quality: number): 'low' | 'medium' | 'high' {
    if (quality < 70) return 'low';
    if (quality < 90) return 'medium';
    return 'high';
  }

  private discretizeSecurity(score: number): 'low' | 'medium' | 'high' {
    if (score < 60) return 'low';
    if (score < 85) return 'medium';
    return 'high';
  }

  private discretizeFleet(agents: number): 'limited' | 'normal' | 'high' {
    if (agents < 3) return 'limited';
    if (agents < 7) return 'normal';
    return 'high';
  }

  private discretizeTime(seconds: number): 'tight' | 'normal' | 'relaxed' {
    if (seconds < 300) return 'tight';      // < 5 min
    if (seconds < 1800) return 'normal';    // < 30 min
    return 'relaxed';
  }

  private discretizeCost(cost: number): 'low' | 'medium' | 'high' {
    if (cost < 1.5) return 'low';
    if (cost < 3) return 'medium';
    return 'high';
  }

  /**
   * Calculate reward for an action execution
   */
  calculateReward(executed: ExecutedAction): number {
    let reward = 0;

    // Base reward for success/failure
    reward += executed.success ? 1.0 : -0.5;

    // Time efficiency bonus (faster = better)
    const expectedTime = executed.action.durationEstimate || 60000;
    const timeRatio = expectedTime / Math.max(executed.executionTimeMs, 1);
    reward += Math.min(timeRatio - 1, 0.5) * 0.3; // Max 0.15 bonus for being 50% faster

    // Cost efficiency
    reward -= executed.action.cost * 0.1; // Penalize high-cost actions slightly

    // Coverage improvement bonus
    const coverageBefore = executed.stateBefore.coverage.line;
    const coverageAfter = executed.stateAfter.coverage.line;
    reward += (coverageAfter - coverageBefore) * 0.02; // 0.02 per % improvement

    // Quality improvement bonus
    const qualityBefore = executed.stateBefore.quality.testsPassing;
    const qualityAfter = executed.stateAfter.quality.testsPassing;
    reward += (qualityAfter - qualityBefore) * 0.02;

    return Math.max(-1, Math.min(1, reward)); // Clamp to [-1, 1]
  }

  /**
   * Learn from a plan execution
   */
  async learnFromExecution(
    plan: GOAPPlan,
    executedActions: ExecutedAction[],
    success: boolean
  ): Promise<PlanLearningOutcome> {
    this.ensureSchema();
    const startTime = Date.now();

    let actionsUpdated = 0;
    let qValueUpdates = 0;
    let totalSuccessRateChange = 0;
    let totalCostChange = 0;

    // Process each executed action
    for (let i = 0; i < executedActions.length; i++) {
      const executed = executedActions[i];

      // Update action statistics
      const statsChange = await this.updateActionStats(executed);
      actionsUpdated++;
      totalSuccessRateChange += statsChange.successRateChange;
      totalCostChange += statsChange.costChange;

      // Q-Learning update if enabled
      if (this.qLearner) {
        const goapStateBefore = this.encodeWorldState(executed.stateBefore);
        const goapStateAfter = this.encodeWorldState(executed.stateAfter);
        const goapAction = this.encodeGOAPAction(executed.action);

        const experience: TaskExperience = {
          taskId: `${plan.id}-${i}`,
          taskType: executed.action.category,
          state: this.toTaskState(goapStateBefore),
          action: this.toAgentAction(goapAction),
          reward: this.calculateReward(executed),
          nextState: this.toTaskState(goapStateAfter),
          timestamp: new Date(),
          agentId: executed.agentId || 'goap-executor',
          done: i === executedActions.length - 1
        };

        this.qLearner.update(experience);
        qValueUpdates++;

        // Record learning history
        this.recordLearningHistory(plan.id, executed, experience.reward);
      }
    }

    // Store plan signature for future reuse
    if (success && plan.initialState) {
      this.similarity.storePlanSignature(
        plan.id,
        plan.goalConditions,
        plan.initialState,
        plan.actions,
        plan.totalCost
      );
    }

    const outcome: PlanLearningOutcome = {
      planId: plan.id,
      success,
      actionsUpdated,
      qValueUpdates,
      totalExecutionTimeMs: Date.now() - startTime,
      learningMetrics: {
        avgSuccessRateChange: actionsUpdated > 0 ? totalSuccessRateChange / actionsUpdated : 0,
        avgCostChange: actionsUpdated > 0 ? totalCostChange / actionsUpdated : 0
      }
    };

    this.logger.info('[PlanLearning] Learned from execution', {
      planId: plan.id,
      success,
      actionsUpdated,
      qValueUpdates,
      elapsed: outcome.totalExecutionTimeMs
    });

    return outcome;
  }

  /**
   * Update action statistics based on execution
   */
  private async updateActionStats(executed: ExecutedAction): Promise<{
    successRateChange: number;
    costChange: number;
  }> {
    const actionId = executed.action.id;

    // Get current stats
    let stats = this.actionStatsCache.get(actionId);
    if (!stats) {
      const row = this.db.prepare(`
        SELECT * FROM goap_action_stats WHERE action_id = ?
      `).get(actionId) as any;

      if (row) {
        stats = {
          actionId: row.action_id,
          executionCount: row.execution_count,
          successCount: row.success_count,
          failureCount: row.failure_count,
          successRate: row.success_rate,
          avgExecutionTimeMs: row.avg_execution_time_ms,
          avgCost: row.avg_cost,
          lastExecuted: new Date(row.last_executed)
        };
      } else {
        stats = {
          actionId,
          executionCount: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 1.0,
          avgExecutionTimeMs: executed.action.durationEstimate || 60000,
          avgCost: executed.action.cost,
          lastExecuted: new Date()
        };
      }
    }

    const oldSuccessRate = stats.successRate;
    const oldCost = stats.avgCost;

    // Update statistics
    stats.executionCount++;
    if (executed.success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
    }

    // Exponential moving average for success rate
    const alpha = this.config.learningRate;
    stats.successRate = stats.successRate * (1 - alpha) + (executed.success ? 1 : 0) * alpha;

    // Update average execution time
    const timeAlpha = this.config.costAdjustmentRate;
    stats.avgExecutionTimeMs = stats.avgExecutionTimeMs * (1 - timeAlpha) +
      executed.executionTimeMs * timeAlpha;

    // Adjust cost based on actual execution time vs estimate
    const expectedTime = executed.action.durationEstimate || 60000;
    const timeRatio = executed.executionTimeMs / expectedTime;
    const costAdjustment = (timeRatio - 1) * 0.1; // Adjust cost by 10% per time ratio deviation
    stats.avgCost = Math.max(0.1, stats.avgCost + costAdjustment);

    stats.lastExecuted = new Date();

    // Persist to database
    this.db.prepare(`
      INSERT INTO goap_action_stats (
        action_id, execution_count, success_count, failure_count,
        success_rate, avg_execution_time_ms, avg_cost, last_executed, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(action_id) DO UPDATE SET
        execution_count = excluded.execution_count,
        success_count = excluded.success_count,
        failure_count = excluded.failure_count,
        success_rate = excluded.success_rate,
        avg_execution_time_ms = excluded.avg_execution_time_ms,
        avg_cost = excluded.avg_cost,
        last_executed = excluded.last_executed,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      stats.actionId,
      stats.executionCount,
      stats.successCount,
      stats.failureCount,
      stats.successRate,
      stats.avgExecutionTimeMs,
      stats.avgCost,
      stats.lastExecuted.toISOString()
    );

    // Update cache
    this.actionStatsCache.set(actionId, stats);

    // Also update the goap_actions table success_rate if enough executions
    if (stats.executionCount >= this.config.minExecutionsForUpdate) {
      this.db.prepare(`
        UPDATE goap_actions
        SET success_rate = ?, execution_count = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(stats.successRate, stats.executionCount, actionId);
    }

    return {
      successRateChange: stats.successRate - oldSuccessRate,
      costChange: stats.avgCost - oldCost
    };
  }

  /**
   * Record learning history entry
   */
  private recordLearningHistory(
    planId: string,
    executed: ExecutedAction,
    reward: number
  ): void {
    const id = `lh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.db.prepare(`
      INSERT INTO goap_learning_history (
        id, plan_id, action_id, state_before, state_after,
        success, execution_time_ms, reward, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      id,
      planId,
      executed.action.id,
      JSON.stringify(executed.stateBefore),
      JSON.stringify(executed.stateAfter),
      executed.success ? 1 : 0,
      executed.executionTimeMs,
      reward
    );
  }

  /**
   * Try to find a reusable plan for the given goal and state
   */
  async findReusablePlan(
    goalConditions: StateConditions,
    currentState: WorldState
  ): Promise<SimilarPlan | null> {
    const similar = await this.similarity.findSimilarPlans(
      goalConditions,
      currentState,
      {
        maxCandidates: 1,
        minSimilarity: this.config.planReuseThreshold
      }
    );

    if (similar.length > 0 && similar[0].goalMatch && similar[0].similarityScore >= this.config.planReuseThreshold) {
      this.logger.info('[PlanLearning] Found reusable plan', {
        planId: similar[0].planId,
        similarity: similar[0].similarityScore,
        goalMatch: similar[0].goalMatch
      });
      return similar[0];
    }

    return null;
  }

  /**
   * Record plan reuse
   */
  recordPlanReuse(planId: string, success: boolean): void {
    this.similarity.recordPlanReuse(planId, success);
  }

  /**
   * Get action statistics
   */
  getActionStats(actionId: string): ActionStats | null {
    // Check cache first
    if (this.actionStatsCache.has(actionId)) {
      return this.actionStatsCache.get(actionId)!;
    }

    // Load from database
    const row = this.db.prepare(`
      SELECT * FROM goap_action_stats WHERE action_id = ?
    `).get(actionId) as any;

    if (!row) return null;

    const stats: ActionStats = {
      actionId: row.action_id,
      executionCount: row.execution_count,
      successCount: row.success_count,
      failureCount: row.failure_count,
      successRate: row.success_rate,
      avgExecutionTimeMs: row.avg_execution_time_ms,
      avgCost: row.avg_cost,
      lastExecuted: new Date(row.last_executed)
    };

    this.actionStatsCache.set(actionId, stats);
    return stats;
  }

  /**
   * Get all action statistics sorted by usage
   */
  getAllActionStats(): ActionStats[] {
    this.ensureSchema();

    const rows = this.db.prepare(`
      SELECT * FROM goap_action_stats
      ORDER BY execution_count DESC
    `).all() as any[];

    return rows.map(row => ({
      actionId: row.action_id,
      executionCount: row.execution_count,
      successCount: row.success_count,
      failureCount: row.failure_count,
      successRate: row.success_rate,
      avgExecutionTimeMs: row.avg_execution_time_ms,
      avgCost: row.avg_cost,
      lastExecuted: new Date(row.last_executed)
    }));
  }

  /**
   * Get plan reuse statistics
   */
  getPlanReuseStats() {
    return this.similarity.getReuseStats();
  }

  /**
   * Get Q-Learning statistics if enabled
   */
  getQLearningStats(): ReturnType<QLearning['getDetailedStatistics']> | null {
    if (!this.qLearner) return null;
    return this.qLearner.getDetailedStatistics();
  }

  /**
   * Get comprehensive learning metrics
   */
  getLearningMetrics(): {
    actionStats: { total: number; avgSuccessRate: number };
    planReuse: ReturnType<PlanSimilarity['getReuseStats']>;
    qLearning: ReturnType<QLearning['getDetailedStatistics']> | null;
    learningHistory: { totalEntries: number; recentReward: number };
  } {
    this.ensureSchema();

    // Action stats summary
    const actionRow = this.db.prepare(`
      SELECT COUNT(*) as total, AVG(success_rate) as avg_success
      FROM goap_action_stats
    `).get() as { total: number; avg_success: number | null };

    // Recent learning history
    const historyRow = this.db.prepare(`
      SELECT COUNT(*) as total, AVG(reward) as avg_reward
      FROM goap_learning_history
      WHERE created_at > datetime('now', '-24 hours')
    `).get() as { total: number; avg_reward: number | null };

    return {
      actionStats: {
        total: actionRow.total,
        avgSuccessRate: actionRow.avg_success ?? 1.0
      },
      planReuse: this.getPlanReuseStats(),
      qLearning: this.getQLearningStats(),
      learningHistory: {
        totalEntries: historyRow.total,
        recentReward: historyRow.avg_reward ?? 0
      }
    };
  }

  /**
   * Get the PlanSimilarity instance for direct access
   */
  getSimilarity(): PlanSimilarity {
    return this.similarity;
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.actionStatsCache.clear();
    this.similarity.clearCache();
    this.logger.debug('[PlanLearning] Caches cleared');
  }
}
