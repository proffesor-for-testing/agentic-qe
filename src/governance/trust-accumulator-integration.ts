/**
 * TrustAccumulator Integration for Agentic QE Fleet
 *
 * Wires @claude-flow/guidance TrustAccumulator to AQE's agent routing system.
 * Provides trust scoring, tier assignment, and intelligent agent selection.
 *
 * Trust tiers:
 * - low: Trust < 0.3 - Limited to simple tasks, no critical operations
 * - medium: Trust 0.3-0.5 - Standard tasks, some supervision
 * - high: Trust 0.5-0.7 - Complex tasks, minimal supervision
 * - critical: Trust >= 0.7 - Mission-critical tasks, autonomous operation
 *
 * @module governance/trust-accumulator-integration
 * @see ADR-058-guidance-governance-integration.md
 */

import { governanceFlags, isTrustAccumulatorEnabled, isStrictMode } from './feature-flags.js';

/**
 * Trust tier levels
 */
export type TrustTier = 'low' | 'medium' | 'high' | 'critical';

/**
 * Task outcome record for trust calculation
 */
export interface TaskOutcome {
  taskId: string;
  taskType: string;
  success: boolean;
  durationMs: number;
  qualityScore?: number;
  timestamp: number;
  errorType?: string;
}

/**
 * Agent trust metrics
 */
export interface AgentTrustMetrics {
  agentId: string;
  trustScore: number;
  trustTier: TrustTier;
  totalTasks: number;
  successfulTasks: number;
  successRate: number;
  avgDurationMs: number;
  errorRate: number;
  taskTypeExperience: Map<string, number>;
  lastUpdated: number;
  tierHistory: Array<{
    tier: TrustTier;
    timestamp: number;
    reason: string;
  }>;
}

/**
 * Agent selection result
 */
export interface AgentSelectionResult {
  selectedAgent: string | null;
  confidence: number;
  reason: string;
  alternatives: Array<{
    agentId: string;
    trustScore: number;
    reason: string;
  }>;
}

/**
 * Tier thresholds configuration
 */
export interface TierThresholds {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

/**
 * Default tier thresholds
 */
const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  low: 0,
  medium: 0.3,
  high: 0.5,
  critical: 0.7,
};

/**
 * TrustAccumulator integration for AQE agent routing
 */
export class TrustAccumulatorIntegration {
  private agentMetrics: Map<string, AgentTrustMetrics> = new Map();
  private taskHistory: Map<string, TaskOutcome[]> = new Map();
  private tierThresholds: TierThresholds = { ...DEFAULT_TIER_THRESHOLDS };
  private initialized = false;

  /**
   * Initialize the TrustAccumulator integration
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Use local implementation optimized for AQE agent routing
    // The guidance TrustAccumulator may have a different API
    this.initialized = true;
  }

  /**
   * Record a task outcome for an agent
   */
  recordTaskOutcome(
    agentId: string,
    taskType: string,
    success: boolean,
    durationMs: number,
    options: {
      qualityScore?: number;
      errorType?: string;
    } = {}
  ): void {
    if (!isTrustAccumulatorEnabled()) return;

    const outcome: TaskOutcome = {
      taskId: `${agentId}-${Date.now()}`,
      taskType,
      success,
      durationMs,
      qualityScore: options.qualityScore,
      timestamp: Date.now(),
      errorType: options.errorType,
    };

    // Store in task history
    const history = this.taskHistory.get(agentId) || [];
    history.push(outcome);

    // Keep only recent history (last 100 tasks)
    if (history.length > 100) {
      history.shift();
    }
    this.taskHistory.set(agentId, history);

    // Update agent metrics
    this.updateAgentMetrics(agentId, outcome);

    // Auto-adjust tier if enabled
    const flags = governanceFlags.getFlags().trustAccumulator;
    if (flags.autoTierAdjustment) {
      this.adjustTier(agentId);
    }
  }

  /**
   * Get the trust score for an agent (0-1 scale)
   */
  getTrustScore(agentId: string): number {
    if (!isTrustAccumulatorEnabled()) return 0.7; // Default trust

    const metrics = this.agentMetrics.get(agentId);
    if (!metrics) return 0.7; // Default trust for new agents

    return metrics.trustScore;
  }

  /**
   * Get the trust tier for an agent
   */
  getTrustTier(agentId: string): TrustTier {
    if (!isTrustAccumulatorEnabled()) return 'medium'; // Default tier

    const metrics = this.agentMetrics.get(agentId);
    if (!metrics) return 'medium'; // Default tier for new agents

    return metrics.trustTier;
  }

  /**
   * Check if an agent can handle critical tasks
   */
  canHandleCriticalTask(agentId: string): boolean {
    if (!isTrustAccumulatorEnabled()) return true; // Allow if disabled

    const flags = governanceFlags.getFlags().trustAccumulator;
    const trustScore = this.getTrustScore(agentId);

    return trustScore >= flags.minTrustForCritical;
  }

  /**
   * Get detailed metrics for an agent
   */
  getAgentMetrics(agentId: string): AgentTrustMetrics | null {
    if (!isTrustAccumulatorEnabled()) return null;

    return this.agentMetrics.get(agentId) || null;
  }

  /**
   * Select the best agent for a task from available agents
   */
  selectBestAgent(
    taskType: string,
    availableAgents: string[],
    options: {
      requireCriticalTrust?: boolean;
      minTrustScore?: number;
    } = {}
  ): AgentSelectionResult {
    if (!isTrustAccumulatorEnabled() || availableAgents.length === 0) {
      return {
        selectedAgent: availableAgents[0] || null,
        confidence: 0.5,
        reason: 'TrustAccumulator disabled or no agents available',
        alternatives: [],
      };
    }

    const flags = governanceFlags.getFlags().trustAccumulator;
    const minTrust = options.requireCriticalTrust
      ? flags.minTrustForCritical
      : (options.minTrustScore ?? 0);

    // Score each agent
    const scoredAgents = availableAgents
      .map(agentId => {
        const metrics = this.agentMetrics.get(agentId);
        const score = this.calculateAgentScore(agentId, taskType, metrics);
        return {
          agentId,
          score,
          trustScore: metrics?.trustScore ?? 0.7,
          meetsMinTrust: (metrics?.trustScore ?? 0.7) >= minTrust,
        };
      })
      .filter(a => a.meetsMinTrust)
      .sort((a, b) => b.score - a.score);

    if (scoredAgents.length === 0) {
      // In strict mode, return null if no qualified agents
      if (isStrictMode()) {
        return {
          selectedAgent: null,
          confidence: 0,
          reason: `No agents meet minimum trust threshold (${minTrust})`,
          alternatives: availableAgents.map(id => ({
            agentId: id,
            trustScore: this.getTrustScore(id),
            reason: `Trust score below threshold`,
          })),
        };
      }

      // Non-strict mode: select best available even if below threshold
      const allScored = availableAgents
        .map(agentId => ({
          agentId,
          score: this.calculateAgentScore(agentId, taskType, this.agentMetrics.get(agentId)),
          trustScore: this.getTrustScore(agentId),
        }))
        .sort((a, b) => b.score - a.score);

      return {
        selectedAgent: allScored[0]?.agentId || null,
        confidence: 0.3,
        reason: 'No agents meet trust threshold, selected best available (non-strict mode)',
        alternatives: allScored.slice(1).map(a => ({
          agentId: a.agentId,
          trustScore: a.trustScore,
          reason: `Score: ${a.score.toFixed(3)}`,
        })),
      };
    }

    const best = scoredAgents[0];
    const confidence = Math.min(1, best.score * 1.2); // Normalize confidence

    return {
      selectedAgent: best.agentId,
      confidence,
      reason: `Selected based on combined score (trust: ${best.trustScore.toFixed(3)}, task fit: ${(best.score - best.trustScore * flags.performanceWeight).toFixed(3)})`,
      alternatives: scoredAgents.slice(1, 4).map(a => ({
        agentId: a.agentId,
        trustScore: a.trustScore,
        reason: `Score: ${a.score.toFixed(3)}`,
      })),
    };
  }

  /**
   * Manually adjust an agent's tier
   */
  adjustTier(agentId: string): void {
    if (!isTrustAccumulatorEnabled()) return;

    const metrics = this.agentMetrics.get(agentId);
    if (!metrics) return;

    const oldTier = metrics.trustTier;
    const newTier = this.calculateTier(metrics.trustScore);

    if (oldTier !== newTier) {
      metrics.trustTier = newTier;
      metrics.tierHistory.push({
        tier: newTier,
        timestamp: Date.now(),
        reason: `Trust score changed to ${metrics.trustScore.toFixed(3)}`,
      });

      // Keep tier history limited
      if (metrics.tierHistory.length > 20) {
        metrics.tierHistory.shift();
      }

      this.logTierChange(agentId, oldTier, newTier, metrics.trustScore);
    }
  }

  /**
   * Boost an agent's trust score (e.g., after manual verification)
   */
  boostTrust(agentId: string, amount: number, reason: string): void {
    if (!isTrustAccumulatorEnabled()) return;

    const metrics = this.getOrCreateMetrics(agentId);
    const oldScore = metrics.trustScore;
    metrics.trustScore = Math.min(1, metrics.trustScore + amount);
    metrics.lastUpdated = Date.now();

    this.logTrustChange(agentId, oldScore, metrics.trustScore, `Boost: ${reason}`);

    const flags = governanceFlags.getFlags().trustAccumulator;
    if (flags.autoTierAdjustment) {
      this.adjustTier(agentId);
    }
  }

  /**
   * Penalize an agent's trust score
   */
  penalizeTrust(agentId: string, amount: number, reason: string): void {
    if (!isTrustAccumulatorEnabled()) return;

    const metrics = this.getOrCreateMetrics(agentId);
    const oldScore = metrics.trustScore;
    metrics.trustScore = Math.max(0, metrics.trustScore - amount);
    metrics.lastUpdated = Date.now();

    this.logTrustChange(agentId, oldScore, metrics.trustScore, `Penalty: ${reason}`);

    const flags = governanceFlags.getFlags().trustAccumulator;
    if (flags.autoTierAdjustment) {
      this.adjustTier(agentId);
    }
  }

  /**
   * Get all agent metrics
   */
  getAllAgentMetrics(): AgentTrustMetrics[] {
    return Array.from(this.agentMetrics.values());
  }

  /**
   * Get agents by tier
   */
  getAgentsByTier(tier: TrustTier): string[] {
    return Array.from(this.agentMetrics.entries())
      .filter(([_, metrics]) => metrics.trustTier === tier)
      .map(([agentId]) => agentId);
  }

  /**
   * Get task experience for an agent
   */
  getTaskExperience(agentId: string): Map<string, number> {
    const metrics = this.agentMetrics.get(agentId);
    return metrics?.taskTypeExperience ?? new Map();
  }

  /**
   * Update tier thresholds
   */
  setTierThresholds(thresholds: Partial<TierThresholds>): void {
    this.tierThresholds = { ...this.tierThresholds, ...thresholds };

    // Re-adjust all agent tiers
    for (const agentId of Array.from(this.agentMetrics.keys())) {
      this.adjustTier(agentId);
    }
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.agentMetrics.clear();
    this.taskHistory.clear();
    this.tierThresholds = { ...DEFAULT_TIER_THRESHOLDS };
  }

  /**
   * Reset metrics for a specific agent
   */
  resetAgent(agentId: string): void {
    this.agentMetrics.delete(agentId);
    this.taskHistory.delete(agentId);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Update agent metrics based on a task outcome
   */
  private updateAgentMetrics(agentId: string, outcome: TaskOutcome): void {
    const metrics = this.getOrCreateMetrics(agentId);

    // Update task counts
    metrics.totalTasks++;
    if (outcome.success) {
      metrics.successfulTasks++;
    }

    // Update success rate
    metrics.successRate = metrics.successfulTasks / metrics.totalTasks;

    // Update error rate (exponential moving average)
    const alpha = 0.3;
    const errorContribution = outcome.success ? 0 : 1;
    const previousErrorRate = 1 - metrics.successRate;
    metrics.errorRate = alpha * errorContribution + (1 - alpha) * previousErrorRate;

    // Update average duration (exponential moving average)
    if (metrics.totalTasks === 1) {
      metrics.avgDurationMs = outcome.durationMs;
    } else {
      metrics.avgDurationMs = alpha * outcome.durationMs + (1 - alpha) * metrics.avgDurationMs;
    }

    // Update task type experience
    const currentExp = metrics.taskTypeExperience.get(outcome.taskType) || 0;
    metrics.taskTypeExperience.set(outcome.taskType, currentExp + 1);

    // Recalculate trust score
    this.recalculateTrustScore(metrics, outcome);

    metrics.lastUpdated = Date.now();
  }

  /**
   * Recalculate trust score based on metrics and outcome
   */
  private recalculateTrustScore(metrics: AgentTrustMetrics, latestOutcome: TaskOutcome): void {
    const flags = governanceFlags.getFlags().trustAccumulator;

    // Performance component: based on success rate
    const performanceScore = metrics.successRate;

    // Task similarity component: experience with this task type
    const taskExp = metrics.taskTypeExperience.get(latestOutcome.taskType) || 0;
    const maxExpForBonus = 20; // After 20 tasks, max experience bonus
    const similarityScore = Math.min(1, taskExp / maxExpForBonus);

    // Capability match component: based on quality score and consistent performance
    const qualityScore = latestOutcome.qualityScore ?? (latestOutcome.success ? 0.7 : 0.3);
    const consistencyScore = 1 - metrics.errorRate;
    const capabilityScore = (qualityScore + consistencyScore) / 2;

    // Weighted combination
    const newTrustScore =
      flags.performanceWeight * performanceScore +
      flags.taskSimilarityWeight * similarityScore +
      flags.capabilityMatchWeight * capabilityScore;

    // Apply exponential moving average for stability
    if (metrics.totalTasks === 1) {
      metrics.trustScore = newTrustScore;
    } else {
      const stabilityAlpha = 0.2; // Slow adjustment for trust
      metrics.trustScore = stabilityAlpha * newTrustScore + (1 - stabilityAlpha) * metrics.trustScore;
    }

    // Clamp to valid range
    metrics.trustScore = Math.max(0, Math.min(1, metrics.trustScore));
  }

  /**
   * Calculate agent score for task selection
   */
  private calculateAgentScore(
    agentId: string,
    taskType: string,
    metrics: AgentTrustMetrics | undefined
  ): number {
    const flags = governanceFlags.getFlags().trustAccumulator;

    if (!metrics) {
      // Default score for unknown agents
      return 0.7 * flags.performanceWeight;
    }

    // Performance component
    const performanceScore = metrics.trustScore * flags.performanceWeight;

    // Task experience component
    const taskExp = metrics.taskTypeExperience.get(taskType) || 0;
    const expBonus = Math.min(0.3, taskExp * 0.03); // Up to 0.3 bonus for experience
    const similarityScore = expBonus * flags.taskSimilarityWeight;

    // Capability/reliability component
    const capabilityScore = (1 - metrics.errorRate) * flags.capabilityMatchWeight;

    return performanceScore + similarityScore + capabilityScore;
  }

  /**
   * Calculate tier from trust score
   */
  private calculateTier(trustScore: number): TrustTier {
    if (trustScore >= this.tierThresholds.critical) return 'critical';
    if (trustScore >= this.tierThresholds.high) return 'high';
    if (trustScore >= this.tierThresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Get or create metrics for an agent
   */
  private getOrCreateMetrics(agentId: string): AgentTrustMetrics {
    let metrics = this.agentMetrics.get(agentId);

    if (!metrics) {
      metrics = {
        agentId,
        trustScore: 0.7, // Default trust
        trustTier: 'high', // Default tier
        totalTasks: 0,
        successfulTasks: 0,
        successRate: 0,
        avgDurationMs: 0,
        errorRate: 0,
        taskTypeExperience: new Map(),
        lastUpdated: Date.now(),
        tierHistory: [
          {
            tier: 'high',
            timestamp: Date.now(),
            reason: 'Initial tier assignment',
          },
        ],
      };
      this.agentMetrics.set(agentId, metrics);
    }

    return metrics;
  }

  /**
   * Log trust score change
   */
  private logTrustChange(
    agentId: string,
    oldScore: number,
    newScore: number,
    reason: string
  ): void {
    if (!governanceFlags.getFlags().global.logViolations) return;

    console.warn(`[TrustAccumulator] Trust change:`, {
      agentId,
      oldScore: oldScore.toFixed(3),
      newScore: newScore.toFixed(3),
      change: (newScore - oldScore).toFixed(3),
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log tier change
   */
  private logTierChange(
    agentId: string,
    oldTier: TrustTier,
    newTier: TrustTier,
    trustScore: number
  ): void {
    if (!governanceFlags.getFlags().global.logViolations) return;

    const direction = this.compareTiers(newTier, oldTier) > 0 ? 'PROMOTED' : 'DEMOTED';

    console.warn(`[TrustAccumulator] Tier change (${direction}):`, {
      agentId,
      oldTier,
      newTier,
      trustScore: trustScore.toFixed(3),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Compare tiers (-1, 0, 1)
   */
  private compareTiers(a: TrustTier, b: TrustTier): number {
    const order: Record<TrustTier, number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    };
    return order[a] - order[b];
  }
}

/**
 * Singleton instance
 */
export const trustAccumulatorIntegration = new TrustAccumulatorIntegration();

/**
 * Helper to create a task outcome record
 */
export function createTaskOutcome(
  agentId: string,
  taskType: string,
  success: boolean,
  durationMs: number,
  options: {
    qualityScore?: number;
    errorType?: string;
  } = {}
): TaskOutcome {
  return {
    taskId: `${agentId}-${Date.now()}`,
    taskType,
    success,
    durationMs,
    qualityScore: options.qualityScore,
    timestamp: Date.now(),
    errorType: options.errorType,
  };
}
