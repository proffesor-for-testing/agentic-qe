/**
 * Agentic QE v3 - Multi-Model Router
 * ADR-051: Enhanced Model Routing with Budget Enforcement
 *
 * Main router that orchestrates:
 * 1. Complexity analysis to recommend optimal tier
 * 2. Budget enforcement to ensure cost limits
 * 3. Agent Booster integration for Tier 0 eligibility
 * 4. Metrics tracking for routing decisions
 * 5. Decision caching for performance
 *
 * @module integrations/agentic-flow/model-router/router
 */

import type {
  IModelRouter,
  RoutingInput,
  RoutingDecision,
  RouterMetrics,
  TierRoutingMetrics,
  ModelRouterConfig,
  ModelTier,
} from './types';
import {
  ModelRouterError,
  RoutingTimeoutError,
  DEFAULT_ROUTER_CONFIG,
} from './types';

import type { IComplexityAnalyzer } from './types';
import { ComplexityAnalyzer } from './complexity-analyzer';

import type { IBudgetEnforcer } from './types';
import { BudgetEnforcer } from './budget-enforcer';

import type {
  IAgentBoosterAdapter,
  AgentBoosterHealth,
} from '../agent-booster/types';

import type { MetricsTracker as PersistentMetricsTracker } from '../metrics/metrics-tracker';

// ============================================================================
// Decision Cache
// ============================================================================

interface CacheEntry {
  decision: RoutingDecision;
  expiresAt: number;
}

/**
 * Simple LRU cache for routing decisions
 */
class DecisionCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly enabled: boolean;

  constructor(enabled: boolean, maxSize: number, ttlMs: number) {
    this.enabled = enabled;
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Generate cache key from routing input
   */
  private generateKey(input: RoutingInput): string {
    // Simple hash based on task description and agent type
    const key = `${input.agentType || 'unknown'}:${input.domain || 'unknown'}:${input.task.slice(0, 100)}`;
    return key;
  }

  /**
   * Get cached decision if valid
   */
  get(input: RoutingInput): RoutingDecision | null {
    if (!this.enabled) return null;

    const key = this.generateKey(input);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Update metadata to indicate cache hit
    return {
      ...entry.decision,
      metadata: {
        ...entry.decision.metadata,
        fromCache: true,
        decisionTimeMs: 0, // Cached decisions are instant
      },
    };
  }

  /**
   * Store decision in cache
   */
  set(input: RoutingInput, decision: RoutingDecision): void {
    if (!this.enabled) return;

    const key = this.generateKey(input);

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      decision,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses
    };
  }
}

// ============================================================================
// Metrics Tracking
// ============================================================================

interface RoutingEvent {
  timestamp: Date;
  tier: ModelTier;
  complexity: number;
  costUsd: number;
  latencyMs: number;
  wasDowngraded: boolean;
  wasManualOverride: boolean;
  agentBoosterEligible: boolean;
  success: boolean;
}

/**
 * Tracks routing metrics in-memory (fast, non-persistent)
 * For persistent metrics, use PersistentMetricsTracker
 */
class InMemoryMetricsTracker {
  private events: RoutingEvent[] = [];
  private readonly enabled: boolean;
  private readonly maxEvents = 10000;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * Record a routing event
   */
  record(event: RoutingEvent): void {
    if (!this.enabled) return;

    this.events.push(event);

    // Limit history size
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /**
   * Get metrics
   */
  getMetrics(): RouterMetrics {
    if (this.events.length === 0) {
      return this.createEmptyMetrics();
    }

    const now = new Date();
    const byTier: Partial<Record<ModelTier, TierRoutingMetrics>> = {};

    // Calculate per-tier metrics
    for (const tier of [0, 1, 2, 3, 4] as ModelTier[]) {
      const tierEvents = this.events.filter((e) => e.tier === tier);

      if (tierEvents.length === 0) continue;

      const successful = tierEvents.filter((e) => e.success);
      const autoRouted = tierEvents.filter((e) => !e.wasManualOverride);
      const downgraded = tierEvents.filter((e) => e.wasDowngraded);

      const latencies = tierEvents.map((e) => e.latencyMs).sort((a, b) => a - b);
      const p95Index = Math.floor(latencies.length * 0.95);

      byTier[tier] = {
        tier,
        selectionCount: tierEvents.length,
        autoRouteCount: autoRouted.length,
        manualOverrideCount: tierEvents.length - autoRouted.length,
        budgetDowngradeCount: downgraded.length,
        successRate: successful.length / tierEvents.length,
        avgComplexity:
          tierEvents.reduce((sum, e) => sum + e.complexity, 0) /
          tierEvents.length,
        totalCostUsd: tierEvents.reduce((sum, e) => sum + e.costUsd, 0),
        avgLatencyMs:
          tierEvents.reduce((sum, e) => sum + e.latencyMs, 0) /
          tierEvents.length,
        p95LatencyMs: latencies[p95Index] || 0,
        budgetUtilization: 0, // Would need budget config to calculate
      };
    }

    // Calculate overall metrics
    const allLatencies = this.events.map((e) => e.latencyMs).sort((a, b) => a - b);
    const p95Index = Math.floor(allLatencies.length * 0.95);
    const p99Index = Math.floor(allLatencies.length * 0.99);

    const agentBoosterEligible = this.events.filter(
      (e) => e.agentBoosterEligible
    ).length;
    const agentBoosterUsed = this.events.filter(
      (e) => e.tier === 0
    ).length;
    const agentBoosterSuccess = this.events.filter(
      (e) => e.tier === 0 && e.success
    ).length;

    return {
      byTier,
      totalDecisions: this.events.length,
      avgDecisionTimeMs:
        this.events.reduce((sum, e) => sum + e.latencyMs, 0) /
        this.events.length,
      p95DecisionTimeMs: allLatencies[p95Index] || 0,
      p99DecisionTimeMs: allLatencies[p99Index] || 0,
      fallbackRate: this.events.filter((e) => e.wasDowngraded).length / this.events.length,
      ruleMatchRate: this.events.filter((e) => !e.wasManualOverride).length / this.events.length,
      estimatedCostSavings: 0, // Would need to compare with baseline
      agentBoosterStats: {
        eligible: agentBoosterEligible,
        used: agentBoosterUsed,
        fallbackToLLM: agentBoosterEligible - agentBoosterUsed,
        successRate: agentBoosterUsed > 0 ? agentBoosterSuccess / agentBoosterUsed : 0,
      },
      budgetStats: {
        totalSpentUsd: this.events.reduce((sum, e) => sum + e.costUsd, 0),
        budgetUtilization: 0, // Would need budget config
        downgradeCount: this.events.filter((e) => e.wasDowngraded).length,
        overrideCount: this.events.filter((e) => e.wasManualOverride).length,
      },
      period: {
        start: this.events[0]?.timestamp || now,
        end: this.events[this.events.length - 1]?.timestamp || now,
      },
    };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.events = [];
  }

  /**
   * Create empty metrics
   */
  private createEmptyMetrics(): RouterMetrics {
    const now = new Date();
    return {
      byTier: {},
      totalDecisions: 0,
      avgDecisionTimeMs: 0,
      p95DecisionTimeMs: 0,
      p99DecisionTimeMs: 0,
      fallbackRate: 0,
      ruleMatchRate: 0,
      estimatedCostSavings: 0,
      agentBoosterStats: {
        eligible: 0,
        used: 0,
        fallbackToLLM: 0,
        successRate: 0,
      },
      budgetStats: {
        totalSpentUsd: 0,
        budgetUtilization: 0,
        downgradeCount: 0,
        overrideCount: 0,
      },
      period: {
        start: now,
        end: now,
      },
    };
  }
}

// ============================================================================
// Model Router Implementation
// ============================================================================

/**
 * Multi-model router with complexity analysis and budget enforcement
 */
export class ModelRouter implements IModelRouter {
  private readonly config: ModelRouterConfig;
  private readonly complexityAnalyzer: IComplexityAnalyzer;
  private readonly budgetEnforcer: IBudgetEnforcer;
  private readonly agentBoosterAdapter?: IAgentBoosterAdapter;
  private readonly cache: DecisionCache;
  private readonly metrics: InMemoryMetricsTracker;
  private persistentMetricsTracker?: PersistentMetricsTracker;

  constructor(
    config: Partial<ModelRouterConfig> = {},
    agentBoosterAdapter?: IAgentBoosterAdapter,
    persistentMetricsTracker?: PersistentMetricsTracker
  ) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.agentBoosterAdapter = agentBoosterAdapter;
    this.persistentMetricsTracker = persistentMetricsTracker;

    // Initialize components
    this.complexityAnalyzer = new ComplexityAnalyzer(
      this.config,
      agentBoosterAdapter
    );
    this.budgetEnforcer = new BudgetEnforcer(this.config.budgetConfig);
    this.cache = new DecisionCache(
      this.config.enableDecisionCache,
      1000,
      this.config.decisionCacheTtlMs
    );
    this.metrics = new InMemoryMetricsTracker(this.config.enableMetrics);
  }

  /**
   * Set the persistent metrics tracker (for dependency injection after construction)
   */
  setPersistentMetricsTracker(tracker: PersistentMetricsTracker): void {
    this.persistentMetricsTracker = tracker;
  }

  /**
   * Route a task to the optimal model tier
   */
  async route(input: RoutingInput): Promise<RoutingDecision> {
    const startTime = Date.now();
    const correlationId = input.metadata?.correlationId as string | undefined;

    try {
      // Check cache first
      const cached = this.cache.get(input);
      if (cached) {
        return cached;
      }

      // Apply timeout to routing decision
      const decision = await Promise.race([
        this.routeInternal(input, startTime, correlationId),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new RoutingTimeoutError(
                  'Routing decision timed out',
                  this.config.maxDecisionTimeMs
                )
              ),
            this.config.maxDecisionTimeMs
          )
        ),
      ]);

      // Cache decision
      this.cache.set(input, decision);

      // Record metrics
      this.recordMetrics(decision, true);

      return decision;
    } catch (error) {
      // On error, return fallback decision
      const fallbackDecision = await this.createFallbackDecision(
        input,
        startTime,
        correlationId,
        error instanceof Error ? error : new Error('Unknown error')
      );

      this.recordMetrics(fallbackDecision, false);

      return fallbackDecision;
    }
  }

  /**
   * Get routing metrics
   */
  getMetrics(): RouterMetrics {
    return this.metrics.getMetrics();
  }

  /**
   * Get Agent Booster health status
   */
  async getAgentBoosterHealth(): Promise<AgentBoosterHealth> {
    if (!this.agentBoosterAdapter) {
      throw new ModelRouterError(
        'Agent Booster adapter not available',
        'AGENT_BOOSTER_UNAVAILABLE'
      );
    }

    return this.agentBoosterAdapter.getHealth();
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics.reset();
  }

  /**
   * Dispose router and release resources
   */
  async dispose(): Promise<void> {
    this.cache.clear();
    this.metrics.reset();

    if (this.agentBoosterAdapter) {
      await this.agentBoosterAdapter.dispose();
    }
  }

  // ============================================================================
  // Private: Routing Logic
  // ============================================================================

  /**
   * Internal routing implementation
   */
  private async routeInternal(
    input: RoutingInput,
    startTime: number,
    correlationId?: string
  ): Promise<RoutingDecision> {
    const warnings: string[] = [];

    // Step 1: Check for manual override
    if (
      input.manualTier !== undefined &&
      this.config.allowManualOverrides
    ) {
      return this.handleManualOverride(
        input,
        input.manualTier,
        startTime,
        correlationId
      );
    }

    // Step 2: Analyze complexity
    const complexityAnalysis = await this.complexityAnalyzer.analyze(input);

    // Step 3: Get recommended tier from complexity
    let recommendedTier = complexityAnalysis.recommendedTier;

    // Step 4: Estimate cost for this tier
    const estimatedCostUsd = this.estimateCost(
      recommendedTier,
      input.task.length
    );

    // Step 5: Check budget
    const budgetDecision = await this.budgetEnforcer.checkBudget(
      recommendedTier,
      estimatedCostUsd
    );

    // Step 6: Use approved tier from budget enforcer
    const approvedTier = budgetDecision.approvedTier;
    warnings.push(...budgetDecision.warnings);

    // Step 7: Check Agent Booster eligibility for Tier 0
    const agentBoosterEligible =
      approvedTier === 0 && complexityAnalysis.signals.isMechanicalTransform;

    // Step 8: Get model ID for approved tier
    const modelId = this.getModelIdForTier(approvedTier);

    // Step 9: Build rationale
    const rationale = this.buildRationale(
      complexityAnalysis,
      budgetDecision,
      approvedTier
    );

    // Step 10: Find alternatives
    const alternativeTiers = this.buildAlternatives(
      complexityAnalysis,
      approvedTier
    );

    const decisionTimeMs = Date.now() - startTime;

    return {
      tier: approvedTier,
      modelId,
      complexityAnalysis,
      budgetDecision,
      confidence: complexityAnalysis.confidence,
      rationale,
      agentBoosterEligible,
      agentBoosterTransform: agentBoosterEligible
        ? complexityAnalysis.signals.detectedTransformType
        : undefined,
      alternativeTiers,
      metadata: {
        timestamp: new Date(),
        decisionTimeMs,
        fromCache: false,
        correlationId,
      },
      warnings,
    };
  }

  /**
   * Handle manual tier override
   */
  private async handleManualOverride(
    input: RoutingInput,
    manualTier: ModelTier,
    startTime: number,
    correlationId?: string
  ): Promise<RoutingDecision> {
    // Still run complexity analysis for metrics
    const complexityAnalysis = await this.complexityAnalyzer.analyze(input);

    // Check budget for manual tier
    const estimatedCostUsd = this.estimateCost(manualTier, input.task.length);
    let budgetDecision = await this.budgetEnforcer.checkBudget(
      manualTier,
      estimatedCostUsd
    );

    // Allow critical task override
    if (
      !budgetDecision.allowed &&
      input.isCritical &&
      this.config.budgetConfig.allowCriticalOverrides
    ) {
      budgetDecision = {
        ...budgetDecision,
        allowed: true,
        reason: 'Critical task override',
        warnings: [
          ...budgetDecision.warnings,
          'Budget exceeded but allowed due to critical task override',
        ],
      };
    }

    const approvedTier = budgetDecision.approvedTier;
    const modelId = this.getModelIdForTier(approvedTier);

    const decisionTimeMs = Date.now() - startTime;

    return {
      tier: approvedTier,
      modelId,
      complexityAnalysis,
      budgetDecision,
      confidence: 1.0, // Manual overrides have full confidence
      rationale: `Manual override to Tier ${approvedTier}${budgetDecision.wasDowngraded ? ' (downgraded due to budget)' : ''}`,
      agentBoosterEligible: approvedTier === 0,
      alternativeTiers: [],
      metadata: {
        timestamp: new Date(),
        decisionTimeMs,
        fromCache: false,
        correlationId,
      },
      warnings: budgetDecision.warnings,
    };
  }

  /**
   * Create fallback decision on error
   */
  private async createFallbackDecision(
    input: RoutingInput,
    startTime: number,
    correlationId: string | undefined,
    error: Error
  ): Promise<RoutingDecision> {
    const fallbackTier = this.config.fallbackTier;
    const modelId = this.getModelIdForTier(fallbackTier);

    // Create minimal complexity analysis
    const complexityAnalysis = {
      overall: 50,
      codeComplexity: 50,
      reasoningComplexity: 50,
      scopeComplexity: 50,
      confidence: 0.3,
      signals: {
        hasArchitectureScope: false,
        hasSecurityScope: false,
        requiresMultiStepReasoning: false,
        requiresCrossDomainCoordination: false,
        isMechanicalTransform: false,
        requiresCreativity: false,
        keywordMatches: { simple: [], moderate: [], complex: [], critical: [] },
      },
      recommendedTier: fallbackTier,
      alternateTiers: [],
      explanation: `Fallback to Tier ${fallbackTier} due to routing error`,
    };

    // Create minimal budget decision
    const budgetDecision = {
      allowed: true,
      reason: 'Fallback routing',
      requestedTier: fallbackTier,
      approvedTier: fallbackTier,
      wasDowngraded: false,
      estimatedCostUsd: 0,
      currentUsage: this.budgetEnforcer.getUsage(fallbackTier),
      warnings: [],
    };

    const decisionTimeMs = Date.now() - startTime;

    return {
      tier: fallbackTier,
      modelId,
      complexityAnalysis,
      budgetDecision,
      confidence: 0.3,
      rationale: `Fallback to Tier ${fallbackTier} due to error: ${error.message}`,
      agentBoosterEligible: false,
      alternativeTiers: [],
      metadata: {
        timestamp: new Date(),
        decisionTimeMs,
        fromCache: false,
        correlationId,
      },
      warnings: [`Routing error: ${error.message}`, 'Using fallback tier'],
    };
  }

  // ============================================================================
  // Private: Helper Methods
  // ============================================================================

  /**
   * Estimate cost for a tier and task
   */
  private estimateCost(tier: ModelTier, taskLength: number): number {
    // Simple estimation based on tier and task length
    const baseCosts = [0, 0.001, 0.01, 0.05, 0.2]; // Per tier
    const lengthMultiplier = Math.max(1, taskLength / 1000); // Scale with task length

    return baseCosts[tier] * lengthMultiplier;
  }

  /**
   * Get model ID for a tier
   */
  private getModelIdForTier(tier: ModelTier): string {
    return this.config.tierModels[tier] || `tier-${tier}-default`;
  }

  /**
   * Build rationale string
   */
  private buildRationale(
    complexity: { overall: number; explanation: string },
    budget: { wasDowngraded: boolean; reason: string },
    tier: ModelTier
  ): string {
    const parts: string[] = [];

    parts.push(`Complexity: ${complexity.overall}/100`);
    parts.push(`Tier ${tier} selected`);

    if (budget.wasDowngraded) {
      parts.push(`Downgraded due to budget: ${budget.reason}`);
    }

    parts.push(complexity.explanation);

    return parts.join('. ');
  }

  /**
   * Build alternative tiers list
   */
  private buildAlternatives(
    complexity: { alternateTiers: ModelTier[] },
    approvedTier: ModelTier
  ): Array<{ tier: ModelTier; modelId: string; reason: string }> {
    return complexity.alternateTiers
      .filter((t) => t !== approvedTier)
      .map((tier) => ({
        tier,
        modelId: this.getModelIdForTier(tier),
        reason: `Alternative tier ${tier}`,
      }));
  }

  /**
   * Record metrics for a routing decision
   */
  private recordMetrics(decision: RoutingDecision, success: boolean): void {
    // Record to in-memory metrics (fast)
    this.metrics.record({
      timestamp: decision.metadata.timestamp,
      tier: decision.tier,
      complexity: decision.complexityAnalysis.overall,
      costUsd: decision.budgetDecision.estimatedCostUsd,
      latencyMs: decision.metadata.decisionTimeMs,
      wasDowngraded: decision.budgetDecision.wasDowngraded,
      wasManualOverride: false, // Would need to track this
      agentBoosterEligible: decision.agentBoosterEligible,
      success,
    });

    // Also persist to SQLite if tracker is available
    this.recordPersistentMetrics(decision, success).catch(console.error);
  }

  /**
   * Record metrics to persistent storage
   */
  private async recordPersistentMetrics(
    decision: RoutingDecision,
    success: boolean
  ): Promise<void> {
    if (!this.persistentMetricsTracker) return;

    try {
      const taskId = `router-tier${decision.tier}-${Date.now()}`;
      await this.persistentMetricsTracker.recordOutcome(
        'router',
        taskId,
        success,
        decision.metadata.decisionTimeMs,
        {
          subType: `tier-${decision.tier}`,
          confidence: decision.confidence,
          usedFallback: decision.budgetDecision.wasDowngraded,
        }
      );
    } catch (error) {
      // Don't let metrics tracking failure affect routing operations
      console.warn('[ModelRouter] Failed to record persistent metrics:', error);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a model router instance
 *
 * @param config - Router configuration
 * @param agentBoosterAdapter - Optional Agent Booster adapter
 * @param persistentMetricsTracker - Optional persistent metrics tracker
 */
export function createModelRouter(
  config: Partial<ModelRouterConfig> = {},
  agentBoosterAdapter?: IAgentBoosterAdapter,
  persistentMetricsTracker?: PersistentMetricsTracker
): ModelRouter {
  return new ModelRouter(config, agentBoosterAdapter, persistentMetricsTracker);
}

/**
 * Create a model router with Agent Booster enabled
 *
 * @param config - Router configuration
 * @param persistentMetricsTracker - Optional persistent metrics tracker
 *
 * @example
 * ```typescript
 * import { getMetricsTracker } from '../metrics';
 *
 * const metricsTracker = await getMetricsTracker();
 * const router = await createModelRouterWithAgentBooster({}, metricsTracker);
 *
 * // Route a task
 * const decision = await router.route({
 *   task: 'Convert var to const',
 *   agentType: 'coder',
 * });
 *
 * // Check real success rate
 * const stats = await metricsTracker.getSuccessRate('router');
 * console.log(`Router success rate: ${(stats.rate * 100).toFixed(1)}%`);
 * ```
 */
export async function createModelRouterWithAgentBooster(
  config: Partial<ModelRouterConfig> = {},
  persistentMetricsTracker?: PersistentMetricsTracker
): Promise<ModelRouter> {
  // Dynamically import and initialize Agent Booster
  const { createAgentBoosterAdapter } = await import('../agent-booster/adapter');

  const agentBoosterAdapter = await createAgentBoosterAdapter({
    enabled: true,
  });

  return new ModelRouter(config, agentBoosterAdapter, persistentMetricsTracker);
}
