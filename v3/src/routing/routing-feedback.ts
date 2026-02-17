/**
 * Routing Feedback Collection
 * ADR-022: Adaptive QE Agent Routing
 *
 * Collects feedback from routing outcomes to improve future routing decisions.
 * Integrates with SQLite for persistence and supports ReasoningBank patterns.
 */

import type {
  RoutingOutcome,
  QETask,
  QERoutingDecision,
  AgentPerformanceMetrics,
} from './types.js';
import { QE_AGENT_REGISTRY, getAgentById } from './qe-agent-registry.js';
import type { QETaskRouter } from './qe-task-router.js';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../kernel/unified-memory.js';
import { safeJsonParse } from '../shared/safe-json.js';
import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Database Row Types
// ============================================================================

/** Database row structure for routing_outcomes table */
interface RoutingOutcomeRow {
  id: string;
  task_json: string;
  decision_json: string;
  used_agent: string;
  followed_recommendation: number;
  success: number;
  quality_score: number;
  duration_ms: number;
  error: string | null;
  created_at: string;
}

// ============================================================================
// In-Memory Storage (can be replaced with SQLite)
// ============================================================================

/**
 * In-memory store for routing outcomes
 * Can be persisted to SQLite for long-term learning
 */
class OutcomeStore {
  private outcomes: RoutingOutcome[] = [];
  private readonly maxOutcomes: number;

  constructor(maxOutcomes = 10000) {
    this.maxOutcomes = maxOutcomes;
  }

  add(outcome: RoutingOutcome): void {
    this.outcomes.push(outcome);

    // Evict oldest outcomes if over limit
    if (this.outcomes.length > this.maxOutcomes) {
      this.outcomes = this.outcomes.slice(-this.maxOutcomes);
    }
  }

  getByAgent(agentId: string, limit = 100): RoutingOutcome[] {
    return this.outcomes
      .filter(o => o.usedAgent === agentId)
      .slice(-limit);
  }

  getAll(limit = 1000): RoutingOutcome[] {
    return this.outcomes.slice(-limit);
  }

  getRecentOverrides(limit = 50): RoutingOutcome[] {
    return this.outcomes
      .filter(o => !o.followedRecommendation)
      .slice(-limit);
  }

  clear(): void {
    this.outcomes = [];
  }

  get size(): number {
    return this.outcomes.length;
  }
}

// ============================================================================
// Routing Feedback Collector
// ============================================================================

/**
 * Collects and processes routing feedback for continuous learning
 */
export class RoutingFeedbackCollector {
  private outcomeStore: OutcomeStore;
  private router: QETaskRouter | null = null;
  private db: UnifiedMemoryManager | null = null;
  private persistCount = 0;
  private readonly maxOutcomes: number;
  private static readonly RETENTION_CLEANUP_INTERVAL = 100;

  constructor(maxOutcomes = 10000) {
    this.maxOutcomes = maxOutcomes;
    this.outcomeStore = new OutcomeStore(maxOutcomes);
  }

  /**
   * Initialize DB persistence for routing outcomes.
   * Falls back to memory-only if DB is unavailable.
   */
  async initialize(): Promise<void> {
    try {
      this.db = getUnifiedMemory();
      if (!this.db.isInitialized()) {
        await this.db.initialize();
      }
      await this.loadFromDb();
    } catch (error) {
      console.warn('[RoutingFeedbackCollector] DB init failed, using memory-only:', toErrorMessage(error));
      this.db = null;
    }
  }

  /**
   * Load persisted outcomes from the database into memory
   */
  private async loadFromDb(): Promise<void> {
    if (!this.db) return;
    const database = this.db.getDatabase();
    const rows = database.prepare(`
      SELECT * FROM routing_outcomes ORDER BY created_at DESC LIMIT ?
    `).all(this.maxOutcomes) as RoutingOutcomeRow[];

    for (const row of rows.reverse()) {
      const outcome: RoutingOutcome = {
        id: row.id,
        task: safeJsonParse(row.task_json),
        decision: safeJsonParse(row.decision_json),
        usedAgent: row.used_agent,
        followedRecommendation: Boolean(row.followed_recommendation),
        outcome: {
          success: Boolean(row.success),
          qualityScore: row.quality_score,
          durationMs: row.duration_ms,
          error: row.error || undefined,
        },
        timestamp: new Date(row.created_at),
      };
      this.outcomeStore.add(outcome);
    }
    if (rows.length > 0) {
      console.log(`[RoutingFeedbackCollector] Loaded ${rows.length} outcomes from DB`);
    }
  }

  /**
   * Persist a single outcome to the database
   */
  private persistOutcome(outcome: RoutingOutcome): void {
    if (!this.db) return;
    try {
      const database = this.db.getDatabase();
      database.prepare(`
        INSERT OR REPLACE INTO routing_outcomes (
          id, task_json, decision_json, used_agent,
          followed_recommendation, success, quality_score,
          duration_ms, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        outcome.id,
        JSON.stringify(outcome.task),
        JSON.stringify(outcome.decision),
        outcome.usedAgent,
        outcome.followedRecommendation ? 1 : 0,
        outcome.outcome.success ? 1 : 0,
        outcome.outcome.qualityScore,
        outcome.outcome.durationMs,
        outcome.outcome.error || null
      );
      this.persistCount++;
      if (this.persistCount % RoutingFeedbackCollector.RETENTION_CLEANUP_INTERVAL === 0) {
        this.enforceRetention(database);
      }
    } catch (error) {
      console.warn('[RoutingFeedbackCollector] Failed to persist outcome:', toErrorMessage(error));
    }
  }

  /**
   * Delete oldest rows beyond retention limit
   */
  private enforceRetention(database: ReturnType<UnifiedMemoryManager['getDatabase']>): void {
    try {
      const maxRows = this.maxOutcomes * 2;
      database.prepare(`
        DELETE FROM routing_outcomes WHERE id NOT IN (
          SELECT id FROM routing_outcomes ORDER BY created_at DESC LIMIT ?
        )
      `).run(maxRows);
    } catch (error) {
      console.warn('[RoutingFeedbackCollector] Retention cleanup failed:', toErrorMessage(error));
    }
  }

  /**
   * Connect to router for automatic performance updates
   */
  connectRouter(router: QETaskRouter): void {
    this.router = router;
  }

  /**
   * Record a routing outcome
   */
  recordOutcome(
    task: QETask,
    decision: QERoutingDecision,
    usedAgent: string,
    outcome: {
      success: boolean;
      qualityScore: number;
      durationMs: number;
      error?: string;
    }
  ): RoutingOutcome {
    const routingOutcome: RoutingOutcome = {
      id: `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      task,
      decision,
      usedAgent,
      followedRecommendation: usedAgent === decision.recommended,
      outcome,
      timestamp: new Date(),
    };

    // Store outcome
    this.outcomeStore.add(routingOutcome);
    this.persistOutcome(routingOutcome);

    // Update router's performance tracking
    if (this.router) {
      this.router.updateAgentPerformance(
        usedAgent,
        outcome.success,
        outcome.qualityScore,
        outcome.durationMs
      );
    }

    return routingOutcome;
  }

  /**
   * Get aggregated performance metrics for an agent
   */
  getAgentMetrics(agentId: string): AgentPerformanceMetrics | null {
    const outcomes = this.outcomeStore.getByAgent(agentId);
    if (outcomes.length === 0) return null;

    const successfulTasks = outcomes.filter(o => o.outcome.success).length;
    const totalDuration = outcomes.reduce((sum, o) => sum + o.outcome.durationMs, 0);
    const totalQuality = outcomes.reduce((sum, o) => sum + o.outcome.qualityScore, 0);

    // Count overrides
    const overriddenCount = outcomes.filter(
      o => o.decision.recommended !== o.usedAgent && o.decision.recommended === agentId
    ).length;
    const selectedOverOthersCount = outcomes.filter(
      o => o.decision.recommended !== o.usedAgent && o.usedAgent === agentId
    ).length;

    // Calculate trend based on recent outcomes
    const recentOutcomes = outcomes.slice(-10);
    const recentSuccessRate = recentOutcomes.filter(o => o.outcome.success).length / recentOutcomes.length;
    const overallSuccessRate = successfulTasks / outcomes.length;

    let trend: 'improving' | 'stable' | 'declining';
    if (recentSuccessRate > overallSuccessRate + 0.1) {
      trend = 'improving';
    } else if (recentSuccessRate < overallSuccessRate - 0.1) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    return {
      agentId,
      totalTasks: outcomes.length,
      successfulTasks,
      successRate: successfulTasks / outcomes.length,
      avgQualityScore: totalQuality / outcomes.length,
      avgDurationMs: totalDuration / outcomes.length,
      overriddenCount,
      selectedOverOthersCount,
      trend,
      updatedAt: new Date(),
    };
  }

  /**
   * Get metrics for all agents
   */
  getAllAgentMetrics(): AgentPerformanceMetrics[] {
    const metrics: AgentPerformanceMetrics[] = [];

    for (const agent of QE_AGENT_REGISTRY) {
      const agentMetrics = this.getAgentMetrics(agent.id);
      if (agentMetrics) {
        metrics.push(agentMetrics);
      }
    }

    return metrics.sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Analyze routing accuracy
   */
  analyzeRoutingAccuracy(): {
    totalOutcomes: number;
    followedRecommendations: number;
    overrideRate: number;
    recommendationSuccessRate: number;
    overrideSuccessRate: number;
    confidenceCorrelation: number;
  } {
    const outcomes = this.outcomeStore.getAll();
    if (outcomes.length === 0) {
      return {
        totalOutcomes: 0,
        followedRecommendations: 0,
        overrideRate: 0,
        recommendationSuccessRate: 0,
        overrideSuccessRate: 0,
        confidenceCorrelation: 0,
      };
    }

    const followed = outcomes.filter(o => o.followedRecommendation);
    const overridden = outcomes.filter(o => !o.followedRecommendation);

    const followedSuccess = followed.filter(o => o.outcome.success).length;
    const overriddenSuccess = overridden.filter(o => o.outcome.success).length;

    // Calculate confidence correlation (higher confidence should correlate with success)
    const confidenceCorrelation = this.calculateConfidenceCorrelation(outcomes);

    return {
      totalOutcomes: outcomes.length,
      followedRecommendations: followed.length,
      overrideRate: overridden.length / outcomes.length,
      recommendationSuccessRate: followed.length > 0 ? followedSuccess / followed.length : 0,
      overrideSuccessRate: overridden.length > 0 ? overriddenSuccess / overridden.length : 0,
      confidenceCorrelation,
    };
  }

  /**
   * Calculate correlation between confidence and success
   */
  private calculateConfidenceCorrelation(outcomes: RoutingOutcome[]): number {
    if (outcomes.length < 2) return 0;

    // Pearson correlation between confidence and success (binary 0/1)
    const confidences = outcomes.map(o => o.decision.confidence);
    const successes: number[] = outcomes.map(o => o.outcome.success ? 1 : 0);

    const meanConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const meanSuccess = successes.reduce((a, b) => a + b, 0) / successes.length;

    let numerator = 0;
    let denomConf = 0;
    let denomSuccess = 0;

    for (let i = 0; i < outcomes.length; i++) {
      const confDiff = confidences[i] - meanConf;
      const successDiff = successes[i] - meanSuccess;
      numerator += confDiff * successDiff;
      denomConf += confDiff * confDiff;
      denomSuccess += successDiff * successDiff;
    }

    const denom = Math.sqrt(denomConf * denomSuccess);
    return denom === 0 ? 0 : numerator / denom;
  }

  /**
   * Get recommendations for improving routing
   */
  getImprovementRecommendations(): string[] {
    const recommendations: string[] = [];
    const accuracy = this.analyzeRoutingAccuracy();

    if (accuracy.totalOutcomes < 50) {
      recommendations.push('Collect more routing outcomes for reliable analysis (at least 50)');
      return recommendations;
    }

    // Check override success rate
    if (accuracy.overrideRate > 0.3 && accuracy.overrideSuccessRate > accuracy.recommendationSuccessRate) {
      recommendations.push(
        'Users are frequently overriding recommendations with better results. ' +
        'Consider adjusting routing weights or updating agent capabilities.'
      );
    }

    // Check confidence correlation
    if (accuracy.confidenceCorrelation < 0.3) {
      recommendations.push(
        'Low correlation between confidence and success. ' +
        'Consider improving semantic matching or adjusting weight distribution.'
      );
    }

    // Check for struggling agents
    const metrics = this.getAllAgentMetrics();
    const strugglingAgents = metrics.filter(m => m.successRate < 0.5 && m.totalTasks >= 10);
    if (strugglingAgents.length > 0) {
      recommendations.push(
        `Agents with low success rates: ${strugglingAgents.map(m => m.agentId).join(', ')}. ` +
        'Consider reviewing their capability mappings.'
      );
    }

    // Check for declining agents
    const decliningAgents = metrics.filter(m => m.trend === 'declining' && m.totalTasks >= 10);
    if (decliningAgents.length > 0) {
      recommendations.push(
        `Agents with declining performance: ${decliningAgents.map(m => m.agentId).join(', ')}. ` +
        'Monitor for potential issues.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Routing performance is healthy. Continue collecting feedback.');
    }

    return recommendations;
  }

  /**
   * Export outcomes for persistence
   */
  exportOutcomes(): RoutingOutcome[] {
    return this.outcomeStore.getAll();
  }

  /**
   * Import outcomes from persistence
   */
  importOutcomes(outcomes: RoutingOutcome[]): void {
    for (const outcome of outcomes) {
      this.outcomeStore.add(outcome);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalOutcomes: number;
    uniqueAgentsUsed: number;
    recentOverrides: number;
  } {
    const outcomes = this.outcomeStore.getAll();
    const uniqueAgents = new Set(outcomes.map(o => o.usedAgent));

    return {
      totalOutcomes: this.outcomeStore.size,
      uniqueAgentsUsed: uniqueAgents.size,
      recentOverrides: this.outcomeStore.getRecentOverrides().length,
    };
  }

  /**
   * Clear all stored outcomes
   */
  clear(): void {
    this.outcomeStore.clear();
  }
}

/**
 * Create a new routing feedback collector
 */
export function createRoutingFeedbackCollector(maxOutcomes = 10000): RoutingFeedbackCollector {
  return new RoutingFeedbackCollector(maxOutcomes);
}
