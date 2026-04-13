/**
 * Routing Feedback Collection
 * ADR-022: Adaptive QE Agent Routing
 *
 * Collects feedback from routing outcomes to improve future routing decisions.
 * Integrates with SQLite for persistence and supports ReasoningBank patterns.
 */

import { randomUUID } from 'crypto';
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
import { EMACalibrator, type EMAConfig } from './calibration/index.js';
import { AutoEscalationTracker, type EscalationConfig, type EscalationState } from './escalation/index.js';
import type { RoutingConfig, AgentTier } from './routing-config.js';
import {
  EconomicRoutingModel,
  type EconomicRoutingConfig,
  type EconomicScore,
  type EconomicReport,
} from './economic-routing.js';
import { CostTracker, getGlobalCostTracker } from '../shared/llm/cost-tracker.js';

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
  advisor_consultation_json?: string | null;
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
  private static schemaMigrated = false;
  private outcomeStore: OutcomeStore;
  private router: QETaskRouter | null = null;
  private db: UnifiedMemoryManager | null = null;
  private calibrator: EMACalibrator | null = null;
  private escalationTracker: AutoEscalationTracker | null = null;
  private economicModel: EconomicRoutingModel | null = null;
  private economicPersistCounter = 0;
  private static readonly ECONOMIC_PERSIST_INTERVAL = 10;
  private persistCount = 0;
  private readonly maxOutcomes: number;
  private static readonly RETENTION_CLEANUP_INTERVAL = 100;

  constructor(maxOutcomes = 10000, routingConfig?: Partial<RoutingConfig>) {
    this.maxOutcomes = maxOutcomes;
    this.outcomeStore = new OutcomeStore(maxOutcomes);

    // Auto-enable from declarative config flags
    if (routingConfig?.enableEMACalibration) {
      this.enableCalibration();
    }
    if (routingConfig?.enableAutoEscalation) {
      this.enableAutoEscalation();
    }
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
      this.loadCalibratorState();
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
        advisorConsultation: row.advisor_consultation_json
          ? safeJsonParse(row.advisor_consultation_json)
          : undefined,
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

      // Ensure schema columns exist for databases created before ADR-092.
      // Runs once per process via the flag; new databases have columns from
      // unified-memory-schemas.ts CREATE TABLE.
      if (!RoutingFeedbackCollector.schemaMigrated) {
        for (const col of [
          'ALTER TABLE routing_outcomes ADD COLUMN model_tier TEXT',
          'ALTER TABLE routing_outcomes ADD COLUMN advisor_consultation_json TEXT',
        ]) {
          try { database.prepare(col).run(); } catch { /* column already exists */ }
        }
        RoutingFeedbackCollector.schemaMigrated = true;
      }

      const modelTier = this.inferTier(outcome.usedAgent);
      const advisorJson = outcome.advisorConsultation
        ? JSON.stringify(outcome.advisorConsultation)
        : null;

      database.prepare(`
        INSERT OR REPLACE INTO routing_outcomes (
          id, task_json, decision_json, used_agent,
          followed_recommendation, success, quality_score,
          duration_ms, error, model_tier, advisor_consultation_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        outcome.id,
        JSON.stringify(outcome.task),
        JSON.stringify(outcome.decision),
        outcome.usedAgent,
        outcome.followedRecommendation ? 1 : 0,
        outcome.outcome.success ? 1 : 0,
        outcome.outcome.qualityScore,
        outcome.outcome.durationMs,
        outcome.outcome.error || null,
        modelTier,
        advisorJson,
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
   * Infer model tier from agent name for analytics.
   * Maps known agent patterns to ADR-026 tiers.
   */
  /**
   * M1 fix: read advisor consultation sidecar file written by MultiModelExecutor.
   * Uses the task ID or a recent session file as a key.
   */
  private loadAdvisorConsultationSidecar(task: QETask): RoutingOutcome['advisorConsultation'] | undefined {
    try {
      const { readdirSync, readFileSync } = require('fs') as typeof import('fs');
      const { join } = require('path') as typeof import('path');
      const { homedir } = require('os') as typeof import('os');
      const dir = join(homedir(), '.agentic-qe', 'advisor', 'consultations');
      const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
      if (files.length === 0) return undefined;
      // Read the most recent consultation (within last 5 minutes)
      const newest = files[0];
      const data = JSON.parse(readFileSync(join(dir, newest), 'utf-8'));
      const age = Date.now() - new Date(data.timestamp).getTime();
      if (age > 5 * 60 * 1000) return undefined;
      return data;
    } catch {
      return undefined;
    }
  }

  private inferTier(agentName: string): string {
    const lower = agentName.toLowerCase();
    if (lower.includes('booster') || lower === 'tier-0') return 'booster';
    if (lower === 'tier-1' || lower.includes('haiku')) return 'haiku';
    if (lower === 'tier-2' || lower.includes('sonnet')) return 'sonnet';
    if (lower.includes('opus')) return 'opus';
    // Default: most qe-* agents run at sonnet tier
    return 'sonnet';
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
   * Load persisted EMA calibrator state from the database
   */
  private loadCalibratorState(): void {
    if (!this.db || !this.calibrator) return;
    try {
      const database = this.db.getDatabase();
      const row = database.prepare(
        `SELECT value FROM kv_store WHERE key = 'routing:ema_calibrator_state'`
      ).get() as { value: string } | undefined;
      if (row) {
        const data = safeJsonParse(row.value);
        if (data && typeof data === 'object') {
          this.calibrator.deserialize(data);
          console.log('[RoutingFeedbackCollector] Loaded EMA calibrator state from DB');
        }
      }
    } catch (error) {
      console.warn('[RoutingFeedbackCollector] Failed to load calibrator state:', toErrorMessage(error));
    }
  }

  /**
   * Persist EMA calibrator state to the database
   */
  private persistCalibratorState(): void {
    if (!this.db || !this.calibrator) return;
    try {
      const database = this.db.getDatabase();
      const serialized = JSON.stringify(this.calibrator.serialize());
      database.prepare(
        `INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime('now'))`
      ).run('routing:ema_calibrator_state', serialized);
    } catch (error) {
      console.warn('[RoutingFeedbackCollector] Failed to persist calibrator state:', toErrorMessage(error));
    }
  }

  /**
   * Load persisted economic routing state from the database
   */
  private loadEconomicState(): void {
    if (!this.db || !this.economicModel) return;
    try {
      const database = this.db.getDatabase();
      const row = database.prepare(
        `SELECT value FROM kv_store WHERE key = 'routing:economic_quality_estimates'`
      ).get() as { value: string } | undefined;
      if (row) {
        const data = safeJsonParse(row.value);
        if (data && typeof data === 'object') {
          this.economicModel.deserializeEstimates(data as Record<string, { quality: number; count: number }>);
          console.log('[RoutingFeedbackCollector] Loaded economic quality estimates from DB');
        }
      }
    } catch (error) {
      console.warn('[RoutingFeedbackCollector] Failed to load economic state:', toErrorMessage(error));
    }
  }

  /**
   * Persist economic routing state to the database
   */
  private persistEconomicState(): void {
    if (!this.db || !this.economicModel) return;
    try {
      const database = this.db.getDatabase();
      const serialized = JSON.stringify(this.economicModel.serializeEstimates());
      database.prepare(
        `INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime('now'))`
      ).run('routing:economic_quality_estimates', serialized);
    } catch (error) {
      console.warn('[RoutingFeedbackCollector] Failed to persist economic state:', toErrorMessage(error));
    }
  }

  /**
   * Connect to router for automatic performance updates
   */
  connectRouter(router: QETaskRouter): void {
    this.router = router;
  }

  /**
   * Enable EMA-based agent calibration for deriving voting weights.
   * Once enabled, every recorded outcome updates the agent's EMA calibration.
   */
  enableCalibration(config?: Partial<EMAConfig>): void {
    this.calibrator = new EMACalibrator(config);
  }

  /**
   * Get the EMA-calibrated voting weight for an agent.
   * Returns 1.0 (neutral) if calibration is not enabled or agent has insufficient data.
   */
  getCalibratedWeight(agentId: string): number {
    return this.calibrator?.getCalibratedWeight(agentId) ?? 1.0;
  }

  /**
   * Enable auto-escalation tracking for tier promotion/demotion.
   * Once enabled, every recorded outcome updates the agent's escalation state.
   */
  enableAutoEscalation(config?: Partial<EscalationConfig>): void {
    this.escalationTracker = new AutoEscalationTracker(config);
  }

  /**
   * Get the current escalation state for an agent.
   * Returns null if auto-escalation is not enabled or agent has no state.
   */
  getEscalationState(agentId: string): EscalationState | null {
    return this.escalationTracker?.getState(agentId) ?? null;
  }

  /**
   * Enable economic routing model for quality-weighted cost optimization.
   * Once enabled, every recorded outcome feeds economic quality estimates
   * and the neural router receives cost-adjusted rewards.
   */
  enableEconomicRouting(
    config?: Partial<EconomicRoutingConfig>,
    costTracker?: CostTracker,
  ): void {
    const tracker = costTracker ?? getGlobalCostTracker();
    this.economicModel = new EconomicRoutingModel(tracker, config);
    this.loadEconomicState();
  }

  /**
   * Get the economic routing report.
   * Returns null if economic routing is not enabled.
   */
  getEconomicReport(): EconomicReport | null {
    return this.economicModel?.getEconomicReport() ?? null;
  }

  /**
   * Get economic scores for a given task complexity.
   * Returns null if economic routing is not enabled.
   */
  getEconomicScore(taskComplexity: number): EconomicScore[] | null {
    return this.economicModel?.scoreTiers(taskComplexity) ?? null;
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
    },
    advisorConsultation?: RoutingOutcome['advisorConsultation'],
  ): RoutingOutcome {
    // M1 fix: if no explicit advisorConsultation passed, check sidecar file
    // written by MultiModelExecutor.persistConsultation()
    let resolvedAdvisor = advisorConsultation;
    if (!resolvedAdvisor) {
      resolvedAdvisor = this.loadAdvisorConsultationSidecar(task);
    }

    const routingOutcome: RoutingOutcome = {
      id: `outcome-${Date.now()}-${randomUUID().slice(0, 8)}`,
      task,
      decision,
      usedAgent,
      followedRecommendation: usedAgent === decision.recommended,
      outcome,
      timestamp: new Date(),
      advisorConsultation: resolvedAdvisor,
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

    // Update EMA calibration if enabled
    if (this.calibrator) {
      this.calibrator.recordOutcome(usedAgent, outcome.success, outcome.qualityScore);
      // Persist every 10 outcomes to avoid excessive writes
      if (this.persistCount % 10 === 0) {
        this.persistCalibratorState();
      }
    }

    // Update auto-escalation tracking if enabled
    if (this.escalationTracker) {
      const baseTier = decision.recommended === usedAgent ? 'sonnet' : 'haiku';
      const escalationAction = this.escalationTracker.recordOutcome(usedAgent, outcome.success, baseTier);

      // Apply escalation/de-escalation recommendation
      if (escalationAction.action !== 'none') {
        console.log(
          `[RoutingFeedbackCollector] Agent "${usedAgent}" ${escalationAction.action}d: ` +
          `${escalationAction.previousTier} → ${escalationAction.newTier}`
        );
      }
    }

    // Update economic model if enabled
    if (this.economicModel) {
      const tier = this.inferTier(usedAgent) as AgentTier;
      this.economicModel.updateFromOutcome(routingOutcome, tier);

      // Persist economic state periodically
      this.economicPersistCounter++;
      if (this.economicPersistCounter % RoutingFeedbackCollector.ECONOMIC_PERSIST_INTERVAL === 0) {
        this.persistEconomicState();
      }
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
export function createRoutingFeedbackCollector(
  maxOutcomes = 10000,
  routingConfig?: Partial<RoutingConfig>
): RoutingFeedbackCollector {
  return new RoutingFeedbackCollector(maxOutcomes, routingConfig);
}
