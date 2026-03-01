/**
 * Queen Router Adapter - TD-005
 * ADR-026: Intelligent Model Routing
 *
 * Integrates TinyDancerRouter with Queen Coordinator for intelligent
 * task routing based on complexity classification. Maps task complexity
 * to agent pool tiers and handles fallback scenarios.
 */

import { performance } from 'perf_hooks';
import { TinyDancerRouter, type TinyDancerConfig, type RouteResult } from './tiny-dancer-router.js';
import {
  classifyTask,
  type ClassifiableTask,
  type TaskComplexity,
  type ClaudeModel,
} from './task-classifier.js';
import {
  type RoutingConfig,
  type AgentTier,
  type ConfidenceThresholds,
  DEFAULT_ROUTING_CONFIG,
  loadRoutingConfigFromEnv,
  mapComplexityToTier,
  getNextFallbackTier,
  tierToModel,
  estimateTaskCost,
  validateRoutingConfig,
} from './routing-config.js';
import type { QETask } from './types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Queen routing decision with tier recommendation
 */
export interface QueenRouteDecision {
  /** Recommended agent tier */
  readonly tier: AgentTier;
  /** Recommended Claude model */
  readonly model: ClaudeModel;
  /** Task complexity classification */
  readonly complexity: TaskComplexity;
  /** Confidence in routing decision (0-1) */
  readonly confidence: number;
  /** Whether to trigger multi-model verification */
  readonly triggerMultiModel: boolean;
  /** Whether to request human review */
  readonly triggerHumanReview: boolean;
  /** Fallback tiers to try on failure */
  readonly fallbackTiers: AgentTier[];
  /** Estimated cost in USD */
  readonly estimatedCost: number;
  /** Routing reasoning */
  readonly reasoning: string;
  /** Routing latency in ms */
  readonly latencyMs: number;
  /** Original TinyDancer result */
  readonly tinyDancerResult: RouteResult;
  /** Timestamp */
  readonly timestamp: Date;
}

/**
 * Task execution outcome for learning
 */
export interface TaskOutcome {
  /** Original task */
  readonly task: ClassifiableTask;
  /** Routing decision */
  readonly decision: QueenRouteDecision;
  /** Tier actually used (may differ from recommendation) */
  readonly usedTier: AgentTier;
  /** Whether the task succeeded */
  readonly success: boolean;
  /** Quality score (0-1) */
  readonly qualityScore: number;
  /** Execution duration in ms */
  readonly durationMs: number;
  /** Number of fallback attempts made */
  readonly fallbackAttempts: number;
  /** Error message if failed */
  readonly error?: string;
  /** Timestamp */
  readonly timestamp: Date;
}

/**
 * Cost tracking statistics
 */
export interface CostStats {
  /** Total cost in USD */
  readonly totalCost: number;
  /** Cost by model */
  readonly costByModel: Record<ClaudeModel, number>;
  /** Total tasks routed */
  readonly totalTasks: number;
  /** Average cost per task */
  readonly avgCostPerTask: number;
  /** Daily cost (resets at midnight UTC) */
  readonly dailyCost: number;
  /** Last reset timestamp */
  readonly lastReset: Date;
}

/**
 * Queen Router Adapter configuration
 */
export interface QueenRouterConfig {
  /** TinyDancer configuration */
  tinyDancer?: TinyDancerConfig;
  /** Routing configuration */
  routing?: RoutingConfig;
  /** Enable cost tracking (default: true) */
  enableCostTracking?: boolean;
  /** Estimated average input tokens per task (default: 2000) */
  avgInputTokens?: number;
  /** Estimated average output tokens per task (default: 500) */
  avgOutputTokens?: number;
}

// ============================================================================
// Queen Router Adapter Implementation
// ============================================================================

/**
 * Queen Router Adapter
 *
 * Wraps TinyDancerRouter and provides Queen Coordinator integration:
 * - Maps task complexity to agent pool tiers
 * - Supports fallback to higher tiers on failure
 * - Tracks cost and performance metrics
 * - Provides confidence-based escalation
 *
 * @example
 * ```typescript
 * const adapter = new QueenRouterAdapter();
 * const decision = await adapter.route(task);
 * console.log(`Route to ${decision.tier} with confidence ${decision.confidence}`);
 * ```
 */
export class QueenRouterAdapter {
  private readonly tinyDancer: TinyDancerRouter;
  private readonly routingConfig: RoutingConfig;
  private readonly enableCostTracking: boolean;
  private readonly avgInputTokens: number;
  private readonly avgOutputTokens: number;

  // Cost tracking
  private totalCost = 0;
  private costByModel: Record<ClaudeModel, number> = { haiku: 0, sonnet: 0, opus: 0 };
  private totalTasks = 0;
  private dailyCost = 0;
  private lastCostReset: Date = new Date();

  // Outcome tracking for learning
  private outcomes: TaskOutcome[] = [];
  private readonly maxOutcomes = 1000;

  constructor(config: QueenRouterConfig = {}) {
    // Initialize TinyDancer router
    this.tinyDancer = new TinyDancerRouter(config.tinyDancer);

    // Deep merge partial routing config with defaults, then apply env overrides
    const mergedConfig = this.mergeRoutingConfig(config.routing);
    this.routingConfig = loadRoutingConfigFromEnv(mergedConfig);
    validateRoutingConfig(this.routingConfig);

    // Cost tracking
    this.enableCostTracking = config.enableCostTracking ?? true;
    this.avgInputTokens = config.avgInputTokens ?? 2000;
    this.avgOutputTokens = config.avgOutputTokens ?? 500;
  }

  /**
   * Route a task to the optimal agent tier
   *
   * @param task - The task to route
   * @returns Routing decision with tier recommendation
   */
  async route(task: QETask | ClassifiableTask): Promise<QueenRouteDecision> {
    const startTime = performance.now();

    // Reset daily cost if needed
    this.checkDailyCostReset();

    // Use TinyDancer to classify and route
    const tinyDancerResult = await this.tinyDancer.route(task);

    // Map complexity to agent tiers
    const tiers = mapComplexityToTier(
      tinyDancerResult.complexity,
      tinyDancerResult.classification.score,
      this.routingConfig
    );

    const primaryTier = tiers[0];
    const model = tierToModel(primaryTier);

    // Build fallback chain
    const fallbackTiers = this.buildFallbackChain(primaryTier);

    // Estimate cost
    const estimatedCost = this.enableCostTracking
      ? estimateTaskCost(model, this.avgInputTokens, this.avgOutputTokens, this.routingConfig)
      : 0;

    // Check cost limits
    this.checkCostLimits(estimatedCost);

    // Build reasoning
    const reasoning = this.buildQueenReasoning(
      tinyDancerResult,
      primaryTier,
      fallbackTiers,
      estimatedCost
    );

    const latencyMs = performance.now() - startTime;

    const decision: QueenRouteDecision = {
      tier: primaryTier,
      model,
      complexity: tinyDancerResult.complexity,
      confidence: tinyDancerResult.confidence,
      triggerMultiModel: tinyDancerResult.triggerMultiModel,
      triggerHumanReview: tinyDancerResult.triggerHumanReview,
      fallbackTiers,
      estimatedCost,
      reasoning,
      latencyMs,
      tinyDancerResult,
      timestamp: new Date(),
    };

    // Update cost tracking
    if (this.enableCostTracking) {
      this.totalCost += estimatedCost;
      this.costByModel[model] += estimatedCost;
      this.dailyCost += estimatedCost;
    }

    this.totalTasks++;

    if (this.routingConfig.verbose) {
      console.log(`[QueenRouter] Route: ${primaryTier} (${model}) ` +
        `complexity=${tinyDancerResult.complexity}, ` +
        `confidence=${(tinyDancerResult.confidence * 100).toFixed(1)}%, ` +
        `cost=$${estimatedCost.toFixed(4)}`);
    }

    return decision;
  }

  /**
   * Record the outcome of a task for learning
   *
   * @param task - Original task
   * @param decision - Original routing decision
   * @param usedTier - Tier actually used (may differ from recommendation)
   * @param success - Whether the task succeeded
   * @param qualityScore - Quality score (0-1)
   * @param durationMs - Execution duration in ms
   * @param fallbackAttempts - Number of fallback attempts made
   * @param error - Error message if failed
   */
  recordOutcome(
    task: QETask | ClassifiableTask,
    decision: QueenRouteDecision,
    usedTier: AgentTier,
    success: boolean,
    qualityScore: number = success ? 1.0 : 0.0,
    durationMs: number = 0,
    fallbackAttempts: number = 0,
    error?: string
  ): void {
    const outcome: TaskOutcome = {
      task: task as ClassifiableTask,
      decision,
      usedTier,
      success,
      qualityScore,
      durationMs,
      fallbackAttempts,
      error,
      timestamp: new Date(),
    };

    this.outcomes.push(outcome);

    // Maintain max outcomes (LRU-style eviction)
    if (this.outcomes.length > this.maxOutcomes) {
      this.outcomes.shift();
    }

    // Also record outcome in TinyDancer for its learning
    this.tinyDancer.recordOutcome(
      task,
      decision.tinyDancerResult,
      success,
      qualityScore,
      tierToModel(usedTier),
      durationMs
    );

    if (this.routingConfig.verbose) {
      console.log(`[QueenRouter] Recorded outcome: tier=${usedTier}, ` +
        `success=${success}, quality=${(qualityScore * 100).toFixed(0)}%, ` +
        `fallbacks=${fallbackAttempts}`);
    }
  }

  /**
   * Get success rate by tier
   */
  getSuccessRateByTier(): Record<AgentTier, number> {
    const byTier: Record<AgentTier, { success: number; total: number }> = {
      booster: { success: 0, total: 0 },
      haiku: { success: 0, total: 0 },
      sonnet: { success: 0, total: 0 },
      opus: { success: 0, total: 0 },
    };

    for (const outcome of this.outcomes) {
      const tier = outcome.usedTier;
      byTier[tier].total++;
      if (outcome.success) {
        byTier[tier].success++;
      }
    }

    return {
      booster: byTier.booster.total > 0 ? byTier.booster.success / byTier.booster.total : 0,
      haiku: byTier.haiku.total > 0 ? byTier.haiku.success / byTier.haiku.total : 0,
      sonnet: byTier.sonnet.total > 0 ? byTier.sonnet.success / byTier.sonnet.total : 0,
      opus: byTier.opus.total > 0 ? byTier.opus.success / byTier.opus.total : 0,
    };
  }

  /**
   * Get fallback statistics
   */
  getFallbackStats(): {
    totalWithFallback: number;
    avgFallbackAttempts: number;
    fallbackSuccessRate: number;
  } {
    const withFallback = this.outcomes.filter(o => o.fallbackAttempts > 0);
    const successfulFallbacks = withFallback.filter(o => o.success);
    const totalAttempts = withFallback.reduce((sum, o) => sum + o.fallbackAttempts, 0);

    return {
      totalWithFallback: withFallback.length,
      avgFallbackAttempts: withFallback.length > 0 ? totalAttempts / withFallback.length : 0,
      fallbackSuccessRate: withFallback.length > 0
        ? successfulFallbacks.length / withFallback.length
        : 0,
    };
  }

  /**
   * Get cost statistics
   */
  getCostStats(): CostStats {
    return {
      totalCost: this.totalCost,
      costByModel: { ...this.costByModel },
      totalTasks: this.totalTasks,
      avgCostPerTask: this.totalTasks > 0 ? this.totalCost / this.totalTasks : 0,
      dailyCost: this.dailyCost,
      lastReset: this.lastCostReset,
    };
  }

  /**
   * Get all outcomes for analysis
   */
  getOutcomes(): readonly TaskOutcome[] {
    return this.outcomes;
  }

  /**
   * Get routing configuration
   */
  getConfig(): RoutingConfig {
    return this.routingConfig;
  }

  /**
   * Update confidence thresholds dynamically
   */
  updateConfidenceThresholds(thresholds: Partial<ConfidenceThresholds>): void {
    Object.assign(this.routingConfig.confidence, thresholds);
    validateRoutingConfig(this.routingConfig);

    if (this.routingConfig.verbose) {
      console.log('[QueenRouter] Updated confidence thresholds:', thresholds);
    }
  }

  /**
   * Reset statistics and learning data
   */
  reset(): void {
    this.totalCost = 0;
    this.costByModel = { haiku: 0, sonnet: 0, opus: 0 };
    this.totalTasks = 0;
    this.dailyCost = 0;
    this.lastCostReset = new Date();
    this.outcomes = [];
    this.tinyDancer.reset();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Build fallback chain for a tier
   */
  private buildFallbackChain(primaryTier: AgentTier): AgentTier[] {
    const chain: AgentTier[] = [];

    if (!this.routingConfig.fallback.enabled) {
      return chain;
    }

    let current: AgentTier | null = primaryTier;
    let attempts = 0;

    // Build chain up to maxAttempts
    while (current && attempts < this.routingConfig.fallback.maxAttempts) {
      const next = getNextFallbackTier(current, this.routingConfig);
      if (next) {
        chain.push(next);
        current = next;
      } else {
        break;
      }
      attempts++;
    }

    return chain;
  }

  /**
   * Build human-readable reasoning for Queen routing
   */
  private buildQueenReasoning(
    tinyDancerResult: RouteResult,
    tier: AgentTier,
    fallbackTiers: AgentTier[],
    cost: number
  ): string {
    const parts: string[] = [];

    // Base TinyDancer reasoning
    parts.push(tinyDancerResult.reasoning);

    // Tier assignment
    parts.push(`Assigned to ${tier.toUpperCase()} tier.`);

    // Fallback chain
    if (fallbackTiers.length > 0) {
      parts.push(`Fallback chain: ${fallbackTiers.map(t => t.toUpperCase()).join(' → ')}.`);
    }

    // Cost
    if (this.enableCostTracking && cost > 0) {
      parts.push(`Estimated cost: $${cost.toFixed(4)}.`);
    }

    return parts.join(' ');
  }

  /**
   * Check if daily cost needs to be reset
   */
  private checkDailyCostReset(): void {
    const now = new Date();
    const lastReset = this.lastCostReset;

    // Check if we've crossed midnight UTC
    if (
      now.getUTCDate() !== lastReset.getUTCDate() ||
      now.getUTCMonth() !== lastReset.getUTCMonth() ||
      now.getUTCFullYear() !== lastReset.getUTCFullYear()
    ) {
      this.dailyCost = 0;
      this.lastCostReset = now;

      if (this.routingConfig.verbose) {
        console.log('[QueenRouter] Reset daily cost tracking');
      }
    }
  }

  /**
   * Check cost limits and emit warnings
   */
  private checkCostLimits(additionalCost: number): void {
    if (!this.routingConfig.costOptimization.enabled) {
      return;
    }

    const { dailyCostLimit, costAlertThreshold } = this.routingConfig.costOptimization;

    if (dailyCostLimit > 0) {
      const projectedDailyCost = this.dailyCost + additionalCost;
      const percentOfLimit = projectedDailyCost / dailyCostLimit;

      if (projectedDailyCost > dailyCostLimit) {
        console.warn(
          `[QueenRouter] COST LIMIT EXCEEDED: Daily cost $${projectedDailyCost.toFixed(2)} ` +
          `exceeds limit of $${dailyCostLimit.toFixed(2)}`
        );
      } else if (percentOfLimit >= costAlertThreshold) {
        console.warn(
          `[QueenRouter] Cost alert: ${(percentOfLimit * 100).toFixed(0)}% of daily limit ` +
          `($${projectedDailyCost.toFixed(2)} / $${dailyCostLimit.toFixed(2)})`
        );
      }
    }
  }

  /**
   * Deep merge partial routing config with defaults
   * Ensures all required nested fields are present
   */
  private mergeRoutingConfig(partial?: Partial<RoutingConfig>): RoutingConfig {
    if (!partial) {
      return structuredClone(DEFAULT_ROUTING_CONFIG);
    }

    // Start with a clone of defaults
    const merged = structuredClone(DEFAULT_ROUTING_CONFIG);

    // Merge confidence thresholds
    if (partial.confidence) {
      merged.confidence = { ...merged.confidence, ...partial.confidence };
    }

    // Merge tier mapping
    if (partial.tierMapping) {
      merged.tierMapping = { ...merged.tierMapping, ...partial.tierMapping };
    }

    // Merge cost optimization
    if (partial.costOptimization) {
      merged.costOptimization = {
        ...merged.costOptimization,
        ...partial.costOptimization,
        // Deep merge costPerMillionTokens if provided
        costPerMillionTokens: partial.costOptimization.costPerMillionTokens
          ? { ...merged.costOptimization.costPerMillionTokens, ...partial.costOptimization.costPerMillionTokens }
          : merged.costOptimization.costPerMillionTokens,
      };
    }

    // Merge fallback config
    if (partial.fallback) {
      merged.fallback = {
        ...merged.fallback,
        ...partial.fallback,
        // Deep merge chain if provided
        chain: partial.fallback.chain
          ? { ...merged.fallback.chain, ...partial.fallback.chain }
          : merged.fallback.chain,
      };
    }

    // Merge verbose flag
    if (partial.verbose !== undefined) {
      merged.verbose = partial.verbose;
    }

    return merged;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Queen Router Adapter instance
 *
 * @param config - Router configuration
 * @returns Configured Queen Router Adapter
 */
export function createQueenRouterAdapter(config?: QueenRouterConfig): QueenRouterAdapter {
  return new QueenRouterAdapter(config);
}
