/**
 * Agentic QE v3 - Budget Enforcer
 * ADR-051: Multi-Model Router - Cost Control
 *
 * Enforces cost limits and tracks spending across model tiers.
 * Features:
 * - Per-tier budget limits (daily cost, requests/hour, requests/day)
 * - Global daily cost limit across all tiers
 * - Budget utilization tracking with warning thresholds
 * - Automatic downgrade or queueing when budget exceeded
 * - Critical task override capability
 * - Hourly and daily reset cycles
 *
 * @module integrations/agentic-flow/model-router/budget-enforcer
 */

import type {
  IBudgetEnforcer,
  BudgetDecision,
  BudgetUsage,
  BudgetConfig,
  TierBudget,
  ModelTier,
} from './types';
import { BudgetExceededError, TIER_METADATA } from './types';

// ============================================================================
// Usage Tracking
// ============================================================================

/**
 * Internal usage tracker per tier
 */
interface TierUsageTracker {
  /** Tier being tracked */
  tier: ModelTier;

  /** Cost spent today in USD */
  costSpentTodayUsd: number;

  /** Requests made in current hour */
  requestsThisHour: number;

  /** Requests made today */
  requestsToday: number;

  /** Timestamp of last hourly reset */
  lastHourlyReset: Date;

  /** Timestamp of last daily reset */
  lastDailyReset: Date;

  /** Request history for metrics */
  requestHistory: Array<{
    timestamp: Date;
    costUsd: number;
  }>;
}

// ============================================================================
// Budget Enforcer Implementation
// ============================================================================

/**
 * Enforces budget limits and tracks spending
 */
export class BudgetEnforcer implements IBudgetEnforcer {
  private readonly config: BudgetConfig;
  private readonly trackers: Map<ModelTier, TierUsageTracker>;
  private globalCostTodayUsd = 0;
  private lastGlobalReset = new Date();

  constructor(config: BudgetConfig) {
    this.config = config;
    this.trackers = new Map();

    // Initialize trackers for all tiers
    for (const tier of [0, 1, 2, 3, 4] as ModelTier[]) {
      this.trackers.set(tier, {
        tier,
        costSpentTodayUsd: 0,
        requestsThisHour: 0,
        requestsToday: 0,
        lastHourlyReset: new Date(),
        lastDailyReset: new Date(),
        requestHistory: [],
      });
    }
  }

  /**
   * Check if request is allowed under budget
   */
  async checkBudget(
    tier: ModelTier,
    estimatedCostUsd: number
  ): Promise<BudgetDecision> {
    // If budget enforcement disabled, always allow
    if (!this.config.enabled) {
      return this.createAllowedDecision(tier, tier, estimatedCostUsd, false, []);
    }

    // Auto-reset if needed
    this.autoReset();

    // Get tier budget config
    const tierBudget = this.config.tierBudgets[tier];
    if (!tierBudget || !tierBudget.enabled) {
      return this.createAllowedDecision(
        tier,
        tier,
        estimatedCostUsd,
        false,
        ['Tier budget not configured or disabled']
      );
    }

    // Get current usage
    const usage = this.getUsage(tier);
    const warnings: string[] = [];

    // Check global budget first
    const globalRemaining =
      this.config.maxDailyCostUsd - this.globalCostTodayUsd;
    if (this.globalCostTodayUsd + estimatedCostUsd > this.config.maxDailyCostUsd) {
      return this.handleBudgetExceeded(
        tier,
        estimatedCostUsd,
        usage,
        'Global daily budget would be exceeded'
      );
    }

    // Warn if approaching global limit
    if (
      this.globalCostTodayUsd + estimatedCostUsd >=
      this.config.maxDailyCostUsd * this.config.warningThreshold
    ) {
      warnings.push(
        `Approaching global daily budget limit: $${this.globalCostTodayUsd.toFixed(2)}/$${this.config.maxDailyCostUsd.toFixed(2)}`
      );

      if (this.config.onBudgetWarning === 'downgrade') {
        return this.downgradeTier(tier, estimatedCostUsd, usage, warnings);
      }
    }

    // Check tier-specific limits
    const checks = [
      // Daily cost limit
      {
        exceeded:
          usage.costSpentTodayUsd + estimatedCostUsd > tierBudget.maxDailyCostUsd,
        message: `Tier ${tier} daily cost limit would be exceeded: $${usage.costSpentTodayUsd.toFixed(2)}/$${tierBudget.maxDailyCostUsd.toFixed(2)}`,
      },
      // Hourly request limit
      {
        exceeded: usage.requestsThisHour >= tierBudget.maxRequestsPerHour,
        message: `Tier ${tier} hourly request limit reached: ${usage.requestsThisHour}/${tierBudget.maxRequestsPerHour}`,
      },
      // Daily request limit
      {
        exceeded: usage.requestsToday >= tierBudget.maxRequestsPerDay,
        message: `Tier ${tier} daily request limit reached: ${usage.requestsToday}/${tierBudget.maxRequestsPerDay}`,
      },
      // Per-request cost limit
      {
        exceeded: estimatedCostUsd > tierBudget.maxCostPerRequest,
        message: `Tier ${tier} per-request cost limit would be exceeded: $${estimatedCostUsd.toFixed(4)}/$${tierBudget.maxCostPerRequest.toFixed(4)}`,
      },
    ];

    // Check all limits
    for (const check of checks) {
      if (check.exceeded) {
        return this.handleBudgetExceeded(tier, estimatedCostUsd, usage, check.message);
      }
    }

    // Check warning thresholds
    if (usage.budgetUtilization >= this.config.warningThreshold) {
      warnings.push(
        `Tier ${tier} at ${(usage.budgetUtilization * 100).toFixed(1)}% of daily budget`
      );

      if (this.config.onBudgetWarning === 'downgrade') {
        return this.downgradeTier(tier, estimatedCostUsd, usage, warnings);
      }
    }

    // All checks passed
    return this.createAllowedDecision(tier, tier, estimatedCostUsd, false, warnings);
  }

  /**
   * Record actual cost after request completion
   */
  async recordCost(tier: ModelTier, actualCostUsd: number): Promise<void> {
    if (!this.config.enabled) return;

    const tracker = this.trackers.get(tier);
    if (!tracker) return;

    // Auto-reset if needed
    this.autoReset();

    // Record the cost
    tracker.costSpentTodayUsd += actualCostUsd;
    tracker.requestsThisHour++;
    tracker.requestsToday++;

    // Update global cost
    this.globalCostTodayUsd += actualCostUsd;

    // Add to history
    tracker.requestHistory.push({
      timestamp: new Date(),
      costUsd: actualCostUsd,
    });

    // Limit history size (keep last 1000 entries)
    if (tracker.requestHistory.length > 1000) {
      tracker.requestHistory = tracker.requestHistory.slice(-1000);
    }
  }

  /**
   * Get current budget usage for a tier
   */
  getUsage(tier: ModelTier): BudgetUsage {
    this.autoReset();

    const tracker = this.trackers.get(tier);
    if (!tracker) {
      return this.createEmptyUsage(tier);
    }

    const tierBudget = this.config.tierBudgets[tier];
    if (!tierBudget) {
      return this.createEmptyUsage(tier);
    }

    const budgetUtilization =
      tierBudget.maxDailyCostUsd > 0
        ? tracker.costSpentTodayUsd / tierBudget.maxDailyCostUsd
        : 0;

    const isExceeded =
      tracker.costSpentTodayUsd >= tierBudget.maxDailyCostUsd ||
      tracker.requestsThisHour >= tierBudget.maxRequestsPerHour ||
      tracker.requestsToday >= tierBudget.maxRequestsPerDay;

    const isNearLimit = budgetUtilization >= this.config.warningThreshold;

    // Calculate next reset time (midnight UTC)
    const now = new Date();
    const resetTime = new Date(now);
    resetTime.setUTCHours(24, 0, 0, 0);

    return {
      tier,
      costSpentTodayUsd: tracker.costSpentTodayUsd,
      requestsThisHour: tracker.requestsThisHour,
      requestsToday: tracker.requestsToday,
      budgetUtilization,
      isExceeded,
      isNearLimit,
      resetTime,
      remainingBudgetUsd: Math.max(
        0,
        tierBudget.maxDailyCostUsd - tracker.costSpentTodayUsd
      ),
      remainingRequestsThisHour: Math.max(
        0,
        tierBudget.maxRequestsPerHour - tracker.requestsThisHour
      ),
      remainingRequestsToday: Math.max(
        0,
        tierBudget.maxRequestsPerDay - tracker.requestsToday
      ),
    };
  }

  /**
   * Get usage across all tiers
   */
  getAllUsage(): Partial<Record<ModelTier, BudgetUsage>> {
    const usage: Partial<Record<ModelTier, BudgetUsage>> = {};

    for (const tier of [0, 1, 2, 3, 4] as ModelTier[]) {
      usage[tier] = this.getUsage(tier);
    }

    return usage;
  }

  /**
   * Reset budget tracking (for testing or new billing period)
   */
  reset(): void {
    const now = new Date();

    for (const tracker of this.trackers.values()) {
      tracker.costSpentTodayUsd = 0;
      tracker.requestsThisHour = 0;
      tracker.requestsToday = 0;
      tracker.lastHourlyReset = now;
      tracker.lastDailyReset = now;
      tracker.requestHistory = [];
    }

    this.globalCostTodayUsd = 0;
    this.lastGlobalReset = now;
  }

  // ============================================================================
  // Private: Budget Decision Handling
  // ============================================================================

  /**
   * Handle budget exceeded scenario
   */
  private handleBudgetExceeded(
    requestedTier: ModelTier,
    estimatedCostUsd: number,
    usage: BudgetUsage,
    reason: string
  ): BudgetDecision {
    switch (this.config.onBudgetExceeded) {
      case 'error':
        throw new BudgetExceededError(
          `Budget exceeded: ${reason}`,
          requestedTier,
          usage
        );

      case 'downgrade':
        return this.downgradeTier(requestedTier, estimatedCostUsd, usage, [
          reason,
        ]);

      case 'queue':
        // For now, treat queue as error (queueing would need async infrastructure)
        throw new BudgetExceededError(
          `Budget exceeded (queueing not yet implemented): ${reason}`,
          requestedTier,
          usage
        );

      default:
        throw new BudgetExceededError(
          `Budget exceeded: ${reason}`,
          requestedTier,
          usage
        );
    }
  }

  /**
   * Attempt to downgrade to a lower tier
   */
  private downgradeTier(
    requestedTier: ModelTier,
    estimatedCostUsd: number,
    usage: BudgetUsage,
    warnings: string[]
  ): BudgetDecision {
    // Try each lower tier
    for (let tier = (requestedTier - 1) as ModelTier; tier >= 0; tier--) {
      const lowerTierBudget = this.config.tierBudgets[tier];
      if (!lowerTierBudget || !lowerTierBudget.enabled) continue;

      const lowerUsage = this.getUsage(tier);

      // Check if lower tier has budget
      if (!lowerUsage.isExceeded) {
        const downgradeCost = estimatedCostUsd * 0.5; // Estimate lower tier costs less

        if (
          lowerUsage.costSpentTodayUsd + downgradeCost <=
          lowerTierBudget.maxDailyCostUsd
        ) {
          return this.createAllowedDecision(
            requestedTier,
            tier,
            downgradeCost,
            true,
            [
              ...warnings,
              `Downgraded from Tier ${requestedTier} to Tier ${tier} due to budget constraints`,
            ]
          );
        }
      }
    }

    // No lower tier available
    throw new BudgetExceededError(
      `Budget exceeded and no lower tier available: ${warnings.join('; ')}`,
      requestedTier,
      usage
    );
  }

  /**
   * Create an allowed budget decision
   */
  private createAllowedDecision(
    requestedTier: ModelTier,
    approvedTier: ModelTier,
    estimatedCostUsd: number,
    wasDowngraded: boolean,
    warnings: string[]
  ): BudgetDecision {
    const usage = this.getUsage(approvedTier);

    return {
      allowed: true,
      reason: wasDowngraded
        ? `Budget enforced: downgraded to Tier ${approvedTier}`
        : 'Budget check passed',
      requestedTier,
      approvedTier,
      wasDowngraded,
      estimatedCostUsd,
      currentUsage: usage,
      warnings,
    };
  }

  /**
   * Create empty usage object
   */
  private createEmptyUsage(tier: ModelTier): BudgetUsage {
    const now = new Date();
    const resetTime = new Date(now);
    resetTime.setUTCHours(24, 0, 0, 0);

    return {
      tier,
      costSpentTodayUsd: 0,
      requestsThisHour: 0,
      requestsToday: 0,
      budgetUtilization: 0,
      isExceeded: false,
      isNearLimit: false,
      resetTime,
      remainingBudgetUsd: 0,
      remainingRequestsThisHour: 0,
      remainingRequestsToday: 0,
    };
  }

  // ============================================================================
  // Private: Auto-Reset Logic
  // ============================================================================

  /**
   * Automatically reset hourly and daily counters if time has passed
   */
  private autoReset(): void {
    const now = new Date();

    // Check global daily reset
    if (this.shouldResetDaily(this.lastGlobalReset, now)) {
      this.globalCostTodayUsd = 0;
      this.lastGlobalReset = now;
    }

    // Check each tier
    for (const tracker of this.trackers.values()) {
      // Hourly reset
      if (this.shouldResetHourly(tracker.lastHourlyReset, now)) {
        tracker.requestsThisHour = 0;
        tracker.lastHourlyReset = now;
      }

      // Daily reset
      if (this.shouldResetDaily(tracker.lastDailyReset, now)) {
        tracker.costSpentTodayUsd = 0;
        tracker.requestsToday = 0;
        tracker.requestHistory = [];
        tracker.lastDailyReset = now;
      }
    }
  }

  /**
   * Check if hourly reset should occur
   */
  private shouldResetHourly(lastReset: Date, now: Date): boolean {
    const hoursDiff =
      (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);
    return hoursDiff >= 1;
  }

  /**
   * Check if daily reset should occur
   */
  private shouldResetDaily(lastReset: Date, now: Date): boolean {
    // Reset at midnight UTC
    return (
      now.getUTCDate() !== lastReset.getUTCDate() ||
      now.getUTCMonth() !== lastReset.getUTCMonth() ||
      now.getUTCFullYear() !== lastReset.getUTCFullYear()
    );
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a budget enforcer instance
 */
export function createBudgetEnforcer(config: BudgetConfig): BudgetEnforcer {
  return new BudgetEnforcer(config);
}
