/**
 * Agentic QE v3 - Multi-Model Router
 * ADR-051: Enhanced Model Routing with Budget Enforcement
 *
 * Public API for the multi-model router system.
 * Provides 5-tier routing from Agent Booster (Tier 0) to Opus (Tier 4)
 * with complexity analysis and budget enforcement.
 *
 * @example Basic Usage
 * ```typescript
 * import { createModelRouter } from '@integrations/agentic-flow/model-router';
 *
 * const router = createModelRouter({
 *   enableAgentBooster: true,
 *   budgetConfig: {
 *     enabled: true,
 *     maxDailyCostUsd: 50.0,
 *   },
 * });
 *
 * const decision = await router.route({
 *   task: 'Convert var declarations to const',
 *   codeContext: 'var x = 1; var y = 2;',
 * });
 *
 * console.log(`Route to Tier ${decision.tier}: ${decision.modelId}`);
 * console.log(`Rationale: ${decision.rationale}`);
 * ```
 *
 * @example With Agent Booster
 * ```typescript
 * import { createModelRouterWithAgentBooster } from '@integrations/agentic-flow/model-router';
 *
 * const router = await createModelRouterWithAgentBooster({
 *   agentBoosterThreshold: 0.7,
 * });
 *
 * const decision = await router.route({
 *   task: 'Add TypeScript types to function parameters',
 *   codeContext: codeSnippet,
 * });
 *
 * if (decision.agentBoosterEligible) {
 *   console.log('Tier 0: Agent Booster can handle this!');
 *   console.log(`Transform: ${decision.agentBoosterTransform}`);
 * }
 * ```
 *
 * @example Manual Override
 * ```typescript
 * const decision = await router.route({
 *   task: 'Design authentication system architecture',
 *   manualTier: 4, // Force Opus for critical architecture
 *   isCritical: true, // Allow budget override
 * });
 * ```
 *
 * @example Metrics and Monitoring
 * ```typescript
 * const metrics = router.getMetrics();
 * console.log(`Total decisions: ${metrics.totalDecisions}`);
 * console.log(`Agent Booster usage: ${metrics.agentBoosterStats.used}`);
 * console.log(`Budget utilization: ${metrics.budgetStats.budgetUtilization}`);
 *
 * // Per-tier metrics
 * for (const [tier, stats] of Object.entries(metrics.byTier)) {
 *   console.log(`Tier ${tier}: ${stats.selectionCount} selections`);
 *   console.log(`  Avg complexity: ${stats.avgComplexity}`);
 *   console.log(`  Success rate: ${stats.successRate}`);
 * }
 * ```
 *
 * @module integrations/agentic-flow/model-router
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Model tier system
  ModelTier,
  ModelTierMetadata,

  // Complexity analysis
  ComplexitySignals,
  ComplexityScore,
  IComplexityAnalyzer,

  // Budget management
  BudgetConfig,
  TierBudget,
  BudgetUsage,
  BudgetDecision,
  IBudgetEnforcer,

  // Routing
  RoutingInput,
  RoutingDecision,
  ModelRouterConfig,
  IModelRouter,

  // Metrics
  TierRoutingMetrics,
  RouterMetrics,

  // Results
  RoutingResult,
  ComplexityResult,
  BudgetResult,
} from './types';

// ============================================================================
// Constants
// ============================================================================

export {
  // Tier metadata
  TIER_METADATA,

  // Default configurations
  DEFAULT_BUDGET_CONFIG,
  DEFAULT_ROUTER_CONFIG,
} from './types';

// ============================================================================
// Error Classes
// ============================================================================

export {
  ModelRouterError,
  BudgetExceededError,
  ComplexityAnalysisError,
  RoutingTimeoutError,
} from './types';

// ============================================================================
// Complexity Analyzer
// ============================================================================

export { ComplexityAnalyzer, createComplexityAnalyzer } from './complexity-analyzer';

// ============================================================================
// Budget Enforcer
// ============================================================================

export { BudgetEnforcer, createBudgetEnforcer } from './budget-enforcer';

// ============================================================================
// Model Router
// ============================================================================

export {
  ModelRouter,
  createModelRouter,
  createModelRouterWithAgentBooster,
} from './router';

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick route function for simple use cases
 *
 * @param task - Task description
 * @param options - Optional routing configuration
 * @returns Routing decision
 *
 * @example
 * ```typescript
 * import { quickRoute } from '@integrations/agentic-flow/model-router';
 *
 * const decision = await quickRoute('Fix authentication bug', {
 *   codeContext: buggyCode,
 *   isCritical: true,
 * });
 *
 * console.log(`Use ${decision.modelId} (Tier ${decision.tier})`);
 * ```
 */
export async function quickRoute(
  task: string,
  options?: {
    codeContext?: string;
    filePaths?: string[];
    manualTier?: import('./types').ModelTier;
    isCritical?: boolean;
    agentType?: string;
    domain?: string;
  }
): Promise<import('./types').RoutingDecision> {
  const { createModelRouter } = await import('./router');
  const router = createModelRouter();

  return router.route({
    task,
    codeContext: options?.codeContext,
    filePaths: options?.filePaths,
    manualTier: options?.manualTier,
    isCritical: options?.isCritical,
    agentType: options?.agentType,
    domain: options?.domain,
  });
}

/**
 * Get tier recommendation without full routing
 *
 * @param task - Task description
 * @param codeContext - Optional code context
 * @returns Recommended tier and complexity score
 *
 * @example
 * ```typescript
 * import { getTierRecommendation } from '@integrations/agentic-flow/model-router';
 *
 * const { tier, complexity, explanation } = await getTierRecommendation(
 *   'Refactor authentication module',
 *   authModuleCode
 * );
 *
 * console.log(`Recommended: Tier ${tier} (complexity: ${complexity})`);
 * console.log(explanation);
 * ```
 */
export async function getTierRecommendation(
  task: string,
  codeContext?: string
): Promise<{
  tier: import('./types').ModelTier;
  complexity: number;
  explanation: string;
  confidence: number;
}> {
  const { createComplexityAnalyzer } = await import('./complexity-analyzer');
  const { DEFAULT_ROUTER_CONFIG } = await import('./types');

  const analyzer = createComplexityAnalyzer(DEFAULT_ROUTER_CONFIG);
  const analysis = await analyzer.analyze({ task, codeContext });

  return {
    tier: analysis.recommendedTier,
    complexity: analysis.overall,
    explanation: analysis.explanation,
    confidence: analysis.confidence,
  };
}

/**
 * Check if task is eligible for Agent Booster (Tier 0)
 *
 * @param task - Task description
 * @param codeContext - Optional code context
 * @returns Agent Booster eligibility result
 *
 * @example
 * ```typescript
 * import { checkAgentBoosterEligibility } from '@integrations/agentic-flow/model-router';
 *
 * const result = await checkAgentBoosterEligibility(
 *   'Convert var to const',
 *   codeSnippet
 * );
 *
 * if (result.eligible) {
 *   console.log(`Agent Booster can handle this: ${result.transformType}`);
 *   console.log(`Confidence: ${result.confidence}`);
 * }
 * ```
 */
export async function checkAgentBoosterEligibility(
  task: string,
  codeContext?: string
): Promise<{
  eligible: boolean;
  transformType?: import('../agent-booster/types').TransformType;
  confidence: number;
  reason: string;
}> {
  const { createModelRouterWithAgentBooster } = await import('./router');

  const router = await createModelRouterWithAgentBooster();
  const decision = await router.route({ task, codeContext });

  return {
    eligible: decision.agentBoosterEligible,
    transformType: decision.agentBoosterTransform,
    confidence: decision.confidence,
    reason: decision.rationale,
  };
}

/**
 * Estimate cost for a task
 *
 * @param task - Task description
 * @param preferredTier - Optional preferred tier
 * @returns Cost estimate with tier breakdown
 *
 * @example
 * ```typescript
 * import { estimateTaskCost } from '@integrations/agentic-flow/model-router';
 *
 * const estimate = await estimateTaskCost(
 *   'Implement OAuth2 authentication flow'
 * );
 *
 * console.log(`Estimated cost: $${estimate.recommendedCost.toFixed(4)}`);
 * console.log(`Using Tier ${estimate.recommendedTier}`);
 *
 * // See costs for all tiers
 * for (const [tier, cost] of Object.entries(estimate.costsByTier)) {
 *   console.log(`Tier ${tier}: $${cost.toFixed(4)}`);
 * }
 * ```
 */
export async function estimateTaskCost(
  task: string,
  preferredTier?: import('./types').ModelTier
): Promise<{
  recommendedTier: import('./types').ModelTier;
  recommendedCost: number;
  costsByTier: Partial<Record<import('./types').ModelTier, number>>;
}> {
  const { createModelRouter } = await import('./router');

  const router = createModelRouter();
  const decision = await router.route({
    task,
    manualTier: preferredTier,
  });

  // Estimate costs for all tiers (simple heuristic)
  const baseCosts = [0, 0.001, 0.01, 0.05, 0.2];
  const taskLengthMultiplier = Math.max(1, task.length / 1000);

  const costsByTier: Partial<Record<import('./types').ModelTier, number>> = {};
  for (const tier of [0, 1, 2, 3, 4] as import('./types').ModelTier[]) {
    costsByTier[tier] = baseCosts[tier] * taskLengthMultiplier;
  }

  return {
    recommendedTier: decision.tier,
    recommendedCost: decision.budgetDecision.estimatedCostUsd,
    costsByTier,
  };
}

// ============================================================================
// Re-export Agent Booster types for convenience
// ============================================================================

export type {
  TransformType,
  IAgentBoosterAdapter,
  AgentBoosterHealth,
} from '../agent-booster/types';
