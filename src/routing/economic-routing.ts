/**
 * Economic Routing Model — Imp-18 (Issue #334)
 *
 * Quality-weighted cost optimization for the routing system.
 * Scores tiers by quality-per-dollar efficiency, respects budget limits,
 * and produces cost-adjusted rewards so the neural router learns to
 * prefer cost-efficient tiers.
 *
 * @module routing/economic-routing
 */

import { CostTracker } from '../shared/llm/cost-tracker.js';
import type { AgentTier } from './routing-config.js';
import type { RoutingOutcome } from './types.js';

// ============================================================================
// Constants & Types
// ============================================================================

/**
 * Tier cost estimates (per typical QE task, in USD).
 * Based on average token usage per task type.
 */
export const TIER_COST_ESTIMATES: Record<
  AgentTier,
  { avgInputTokens: number; avgOutputTokens: number; costPerTask: number }
> = {
  booster: { avgInputTokens: 0, avgOutputTokens: 0, costPerTask: 0 },
  haiku:   { avgInputTokens: 2000, avgOutputTokens: 1000, costPerTask: 0.0035 },
  sonnet:  { avgInputTokens: 2000, avgOutputTokens: 1000, costPerTask: 0.021 },
  opus:    { avgInputTokens: 2000, avgOutputTokens: 1000, costPerTask: 0.105 },
};

/** All tiers ordered cheapest to most expensive */
const TIER_ORDER: AgentTier[] = ['booster', 'haiku', 'sonnet', 'opus'];

/** Maximum cost per task across all tiers (used for normalization) */
const MAX_TIER_COST = TIER_COST_ESTIMATES.opus.costPerTask;

export interface EconomicScore {
  tier: AgentTier;
  /** Expected quality (0-1) */
  qualityScore: number;
  /** Estimated cost per task in USD */
  estimatedCostUsd: number;
  /** quality / cost (higher = more efficient). Infinity for zero-cost tiers. */
  qualityPerDollar: number;
  /** Combined score factoring quality + cost (higher = better) */
  economicScore: number;
}

export interface EconomicRoutingConfig {
  /** Weight for quality in combined score (0-1, default 0.6) */
  qualityWeight: number;
  /** Weight for cost efficiency in combined score (0-1, default 0.4) */
  costWeight: number;
  /** Budget limit per hour in USD (0 = unlimited) */
  budgetPerHourUsd: number;
  /** Budget limit per day in USD (0 = unlimited) */
  budgetPerDayUsd: number;
  /** Minimum quality threshold -- never route to cheaper tier below this (0-1) */
  minQualityThreshold: number;
  /** Enable economic routing (default: true) */
  enabled: boolean;
}

export const DEFAULT_ECONOMIC_CONFIG: EconomicRoutingConfig = {
  qualityWeight: 0.6,
  costWeight: 0.4,
  budgetPerHourUsd: 0,
  budgetPerDayUsd: 0,
  minQualityThreshold: 0.5,
  enabled: true,
};

export interface EconomicReport {
  tierEfficiency: EconomicScore[];
  currentHourlyCostUsd: number;
  currentDailyCostUsd: number;
  budgetRemaining: { hourly: number | null; daily: number | null };
  recommendation: string;
  savingsOpportunity: { usd: number; description: string } | null;
}

// ============================================================================
// EconomicRoutingModel
// ============================================================================

/** EMA smoothing factor for quality estimate updates */
const EMA_ALPHA = 0.15;

export class EconomicRoutingModel {
  private config: EconomicRoutingConfig;
  private costTracker: CostTracker;
  private tierQualityEstimates: Map<AgentTier, number> = new Map();
  private tierOutcomeCounts: Map<AgentTier, number> = new Map();

  constructor(costTracker: CostTracker, config?: Partial<EconomicRoutingConfig>) {
    const merged = { ...DEFAULT_ECONOMIC_CONFIG, ...config };

    // Validate and clamp config values to safe ranges
    merged.qualityWeight = Math.max(0, Math.min(1, merged.qualityWeight));
    merged.costWeight = Math.max(0, Math.min(1, merged.costWeight));
    merged.minQualityThreshold = Math.max(0, Math.min(1, merged.minQualityThreshold));
    merged.budgetPerHourUsd = Math.max(0, merged.budgetPerHourUsd);
    merged.budgetPerDayUsd = Math.max(0, merged.budgetPerDayUsd);

    // Normalize weights so they sum to 1.0
    const weightSum = merged.qualityWeight + merged.costWeight;
    if (weightSum > 0 && weightSum !== 1) {
      merged.qualityWeight /= weightSum;
      merged.costWeight /= weightSum;
    }

    this.config = merged;
    this.costTracker = costTracker;
    // Initialize with prior assumptions
    this.tierQualityEstimates.set('booster', 0.3);
    this.tierQualityEstimates.set('haiku', 0.55);
    this.tierQualityEstimates.set('sonnet', 0.75);
    this.tierQualityEstimates.set('opus', 0.90);
  }

  // --------------------------------------------------------------------------
  // Core Methods
  // --------------------------------------------------------------------------

  /**
   * Score each tier by quality-per-dollar efficiency.
   * Returns all tiers sorted by economicScore descending.
   */
  scoreTiers(taskComplexity: number): EconomicScore[] {
    const scores: EconomicScore[] = TIER_ORDER.map(tier => {
      const qualityScore = this.getQualityEstimate(tier, taskComplexity);
      const estimatedCostUsd = TIER_COST_ESTIMATES[tier].costPerTask;

      // quality / cost  (handle zero-cost booster)
      const qualityPerDollar = estimatedCostUsd > 0
        ? qualityScore / estimatedCostUsd
        : qualityScore > 0 ? Infinity : 0;

      // Normalized cost efficiency: 1 - (cost / maxCost)
      const costEfficiency = MAX_TIER_COST > 0
        ? 1 - estimatedCostUsd / MAX_TIER_COST
        : 1;

      const economicScore =
        this.config.qualityWeight * qualityScore +
        this.config.costWeight * costEfficiency;

      return { tier, qualityScore, estimatedCostUsd, qualityPerDollar, economicScore };
    });

    scores.sort((a, b) => b.economicScore - a.economicScore);
    return scores;
  }

  /**
   * Select the best tier considering quality AND cost.
   * Respects budget limits and minimum quality thresholds.
   */
  selectTier(
    taskComplexity: number,
  ): { tier: AgentTier; reason: string; scores: EconomicScore[] } {
    const scores = this.scoreTiers(taskComplexity);

    for (const score of scores) {
      // Skip tiers below minimum quality threshold
      if (score.qualityScore < this.config.minQualityThreshold) {
        continue;
      }
      // Skip tiers that would exceed budget
      if (this.wouldExceedBudget(score.tier)) {
        continue;
      }
      return {
        tier: score.tier,
        reason: `Best economic score (${score.economicScore.toFixed(3)}): ` +
          `quality=${score.qualityScore.toFixed(2)}, cost=$${score.estimatedCostUsd.toFixed(4)}`,
        scores,
      };
    }

    // Fallback: pick the cheapest tier that meets quality, ignoring budget
    // Use spread copies to avoid mutating the original scores array
    const qualityFiltered = scores.filter(
      s => s.qualityScore >= this.config.minQualityThreshold,
    );
    if (qualityFiltered.length > 0) {
      const cheapest = [...qualityFiltered].sort(
        (a, b) => a.estimatedCostUsd - b.estimatedCostUsd,
      )[0];
      return {
        tier: cheapest.tier,
        reason: `Budget constrained fallback to ${cheapest.tier}`,
        scores,
      };
    }

    // Final fallback: pick the best quality regardless
    const bestQuality = [...scores].sort((a, b) => b.qualityScore - a.qualityScore)[0];
    return {
      tier: bestQuality.tier,
      reason: `No tier meets quality threshold ${this.config.minQualityThreshold}; ` +
        `using best quality: ${bestQuality.tier}`,
      scores,
    };
  }

  /**
   * Check if a tier would exceed the budget.
   */
  wouldExceedBudget(tier: AgentTier): boolean {
    const cost = TIER_COST_ESTIMATES[tier].costPerTask;
    if (cost === 0) return false;

    const hourlyCost = this.costTracker.getCurrentCost('hour');
    const dailyCost = this.costTracker.getCurrentCost('day');

    if (this.config.budgetPerHourUsd > 0 &&
        hourlyCost + cost > this.config.budgetPerHourUsd) {
      return true;
    }
    if (this.config.budgetPerDayUsd > 0 &&
        dailyCost + cost > this.config.budgetPerDayUsd) {
      return true;
    }
    return false;
  }

  /**
   * Update quality estimates from observed outcomes.
   * Uses EMA to smooth estimates.
   */
  updateFromOutcome(outcome: RoutingOutcome, tier: AgentTier): void {
    const observedQuality = outcome.outcome.qualityScore;
    const current = this.tierQualityEstimates.get(tier) ?? 0.5;
    const count = this.tierOutcomeCounts.get(tier) ?? 0;

    // Use EMA; for the first few observations, use a higher alpha
    const alpha = count < 5 ? 0.4 : EMA_ALPHA;
    const updated = current * (1 - alpha) + observedQuality * alpha;
    this.tierQualityEstimates.set(tier, updated);
    this.tierOutcomeCounts.set(tier, count + 1);
  }

  /**
   * Get economic efficiency report.
   */
  getEconomicReport(): EconomicReport {
    const tierEfficiency = this.scoreTiers(0.5); // mid-complexity as baseline
    const currentHourlyCostUsd = this.costTracker.getCurrentCost('hour');
    const currentDailyCostUsd = this.costTracker.getCurrentCost('day');

    const budgetRemaining = {
      hourly: this.config.budgetPerHourUsd > 0
        ? Math.max(0, this.config.budgetPerHourUsd - currentHourlyCostUsd)
        : null,
      daily: this.config.budgetPerDayUsd > 0
        ? Math.max(0, this.config.budgetPerDayUsd - currentDailyCostUsd)
        : null,
    };

    // Find savings opportunity: compare most-used expensive tier vs cheaper alternative
    let savingsOpportunity: EconomicReport['savingsOpportunity'] = null;
    const sorted = [...tierEfficiency].sort((a, b) => b.qualityPerDollar - a.qualityPerDollar);
    const mostEfficient = sorted.find(s => s.estimatedCostUsd > 0 && isFinite(s.qualityPerDollar));
    const leastEfficient = [...sorted].reverse().find(
      (s: EconomicScore) => s.estimatedCostUsd > 0 && isFinite(s.qualityPerDollar),
    );
    if (mostEfficient && leastEfficient && mostEfficient.tier !== leastEfficient.tier) {
      const potentialSavings = leastEfficient.estimatedCostUsd - mostEfficient.estimatedCostUsd;
      if (potentialSavings > 0) {
        savingsOpportunity = {
          usd: potentialSavings,
          description:
            `Switch from ${leastEfficient.tier} ($${leastEfficient.estimatedCostUsd.toFixed(4)}/task) ` +
            `to ${mostEfficient.tier} ($${mostEfficient.estimatedCostUsd.toFixed(4)}/task) ` +
            `for comparable tasks to save ~$${potentialSavings.toFixed(4)}/task`,
        };
      }
    }

    const recommendation = this.generateRecommendation(tierEfficiency, budgetRemaining);

    return {
      tierEfficiency,
      currentHourlyCostUsd,
      currentDailyCostUsd,
      budgetRemaining,
      recommendation,
      savingsOpportunity,
    };
  }

  /**
   * Compute cost-adjusted reward for the neural router.
   * Penalizes expensive tiers that don't deliver proportionally higher quality.
   */
  computeCostAdjustedReward(
    baseReward: number,
    tier: AgentTier,
    qualityScore: number,
  ): number {
    const tierCost = TIER_COST_ESTIMATES[tier].costPerTask;
    if (MAX_TIER_COST === 0) return baseReward;

    const costRatio = tierCost / MAX_TIER_COST; // 0-1, where opus=1.0
    const qualityGain = Math.max(0, qualityScore - this.config.minQualityThreshold);
    const costPenalty = costRatio * (1 - qualityGain);
    const adjusted = baseReward - costPenalty * this.config.costWeight;

    // Clamp to [-1, 1]
    return Math.max(-1, Math.min(1, adjusted));
  }

  // --------------------------------------------------------------------------
  // Persistence helpers
  // --------------------------------------------------------------------------

  /**
   * Serialize quality estimates for persistence.
   */
  serializeEstimates(): Record<string, { quality: number; count: number }> {
    const result: Record<string, { quality: number; count: number }> = {};
    for (const tier of TIER_ORDER) {
      result[tier] = {
        quality: this.tierQualityEstimates.get(tier) ?? 0.5,
        count: this.tierOutcomeCounts.get(tier) ?? 0,
      };
    }
    return result;
  }

  /**
   * Deserialize quality estimates from persistence.
   */
  deserializeEstimates(data: Record<string, { quality: number; count: number }>): void {
    for (const tier of TIER_ORDER) {
      if (data[tier]) {
        this.tierQualityEstimates.set(tier, data[tier].quality);
        this.tierOutcomeCounts.set(tier, data[tier].count);
      }
    }
  }

  /**
   * Get the current config (read-only copy).
   */
  getConfig(): Readonly<EconomicRoutingConfig> {
    return { ...this.config };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Get quality estimate for a tier, adjusted by task complexity.
   * Higher complexity tasks benefit more from higher-tier models.
   */
  private getQualityEstimate(tier: AgentTier, taskComplexity: number): number {
    const baseQuality = this.tierQualityEstimates.get(tier) ?? 0.5;
    // For complex tasks, cheaper tiers degrade more
    const complexityPenalty = tier === 'booster'
      ? taskComplexity * 0.4
      : tier === 'haiku'
        ? taskComplexity * 0.2
        : 0;
    return Math.max(0, Math.min(1, baseQuality - complexityPenalty));
  }

  private generateRecommendation(
    tierEfficiency: EconomicScore[],
    budgetRemaining: { hourly: number | null; daily: number | null },
  ): string {
    if (budgetRemaining.hourly !== null && budgetRemaining.hourly < 0.01) {
      return 'Hourly budget nearly exhausted. Consider increasing budget or routing to cheaper tiers.';
    }
    if (budgetRemaining.daily !== null && budgetRemaining.daily < 0.1) {
      return 'Daily budget nearly exhausted. Only critical tasks should use expensive tiers.';
    }
    const best = tierEfficiency[0];
    if (best) {
      return `Most cost-efficient tier: ${best.tier} ` +
        `(score=${best.economicScore.toFixed(3)}, quality=${best.qualityScore.toFixed(2)})`;
    }
    return 'No economic data available yet.';
  }
}
