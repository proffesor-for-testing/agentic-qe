/**
 * Agentic QE v3 - Model routing MCP handlers (ADR-051)
 * Routing decisions, routing metrics and routing economics.
 */

import type { ToolResult } from '../types';
import {
  getTaskRouter,
  type RoutingLogEntry,
  type RoutingStats,
} from '../services/task-router';
import type { ModelTier } from '../../integrations/agentic-flow';
import { toErrorMessage } from '../../shared/error-utils.js';
import { inferDomainFromDescription } from './task-inference.js';

// ============================================================================
// Model Route Handler (ADR-051)
// Direct access to routing decisions without task submission
// ============================================================================

export interface ModelRouteParams {
  /** Task description to analyze */
  task: string;
  /** Optional code context for complexity analysis */
  codeContext?: string;
  /** Optional file paths */
  filePaths?: string[];
  /** Manual tier override */
  manualTier?: ModelTier;
  /** Mark as critical task */
  isCritical?: boolean;
  /** Agent type making the request */
  agentType?: string;
  /** Domain context */
  domain?: string;
}

export interface ModelRouteResult {
  tier: ModelTier;
  tierName: string;
  modelId: string;
  executionStrategy: string;
  useAgentBooster: boolean;
  agentBoosterTransform?: string;
  complexity: {
    overall: number;
    code: number;
    reasoning: number;
    scope: number;
  };
  confidence: number;
  rationale: string;
  warnings: string[];
  budget: {
    allowed: boolean;
    wasDowngraded: boolean;
    estimatedCostUsd: number;
  };
  decisionTimeMs: number;
}

/**
 * Handle model routing query - returns routing decision without submitting task
 */
export async function handleModelRoute(
  params: ModelRouteParams
): Promise<ToolResult<ModelRouteResult>> {
  try {
    const router = await getTaskRouter();

    // Enrich routing input: infer domain and metadata from task description
    // when the caller doesn't provide them explicitly
    const inferredDomain = params.domain || inferDomainFromDescription(params.task);
    const inferredIsCritical = params.isCritical ??
      /\b(security|vulnerability|cve|owasp|critical|production|exploit)\b/i.test(params.task);

    const result = await router.routeTask({
      task: params.task,
      codeContext: params.codeContext,
      filePaths: params.filePaths,
      manualTier: params.manualTier,
      isCritical: inferredIsCritical,
      agentType: params.agentType || `qe-${inferredDomain}`,
      domain: inferredDomain,
      // Pass metadata to help the complexity analyzer
      metadata: {
        inferredDomain,
        hasCodeContext: !!params.codeContext,
        fileCount: params.filePaths?.length,
      },
    });

    return {
      success: true,
      data: {
        tier: result.decision.tier,
        tierName: result.tierInfo.name,
        modelId: result.modelId,
        executionStrategy: result.executionStrategy,
        useAgentBooster: result.useAgentBooster,
        agentBoosterTransform: result.decision.agentBoosterTransform,
        complexity: {
          overall: result.decision.complexityAnalysis.overall,
          code: result.decision.complexityAnalysis.codeComplexity,
          reasoning: result.decision.complexityAnalysis.reasoningComplexity,
          scope: result.decision.complexityAnalysis.scopeComplexity,
        },
        confidence: result.decision.confidence,
        rationale: result.decision.rationale,
        warnings: result.decision.warnings,
        budget: {
          allowed: result.decision.budgetDecision.allowed,
          wasDowngraded: result.decision.budgetDecision.wasDowngraded,
          estimatedCostUsd: result.decision.budgetDecision.estimatedCostUsd,
        },
        decisionTimeMs: result.decision.metadata.decisionTimeMs,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to route task: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// Routing Metrics Handler (ADR-051)
// ============================================================================

export interface RoutingMetricsParams {
  /** Include routing log entries */
  includeLog?: boolean;
  /** Max log entries to return */
  logLimit?: number;
}

export interface RoutingMetricsResult {
  stats: RoutingStats;
  log?: RoutingLogEntry[];
  modelRouterMetrics: {
    totalDecisions: number;
    avgDecisionTimeMs: number;
    agentBoosterStats: {
      eligible: number;
      used: number;
      successRate: number;
    };
    budgetStats: {
      totalSpentUsd: number;
      budgetUtilization: number;
      downgradeCount: number;
    };
  };
}

/**
 * Handle routing metrics query
 */
export async function handleRoutingMetrics(
  params: RoutingMetricsParams
): Promise<ToolResult<RoutingMetricsResult>> {
  try {
    const router = await getTaskRouter();
    const stats = router.getRoutingStats();
    const metrics = router.getMetrics();

    const result: RoutingMetricsResult = {
      stats,
      modelRouterMetrics: {
        totalDecisions: metrics.totalDecisions,
        avgDecisionTimeMs: metrics.avgDecisionTimeMs,
        agentBoosterStats: metrics.agentBoosterStats,
        budgetStats: metrics.budgetStats,
      },
    };

    if (params.includeLog) {
      result.log = router.getRoutingLog(params.logLimit || 100);
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get routing metrics: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// Economic Routing Handler (Imp-18, Issue #334)
// ============================================================================

export interface RoutingEconomicsParams {
  /** Task complexity score 0-1 for tier scoring (default: 0.5) */
  taskComplexity?: number;
}

export interface RoutingEconomicsResult {
  tierEfficiency: Array<{
    tier: string;
    qualityScore: number;
    estimatedCostUsd: number;
    qualityPerDollar: number | string;
    economicScore: number;
  }>;
  currentHourlyCostUsd: number;
  currentDailyCostUsd: number;
  budgetRemaining: { hourly: number | null; daily: number | null };
  recommendation: string;
  savingsOpportunity: { usd: number; description: string } | null;
}

/**
 * Handle economic routing report query
 */
export async function handleRoutingEconomics(
  params: RoutingEconomicsParams,
): Promise<ToolResult<RoutingEconomicsResult>> {
  try {
    const { createRoutingFeedbackCollector } = await import('../../routing/routing-feedback.js');
    const { getGlobalCostTracker } = await import('../../shared/llm/cost-tracker.js');

    // Create collector, initialize to load persisted state from DB, then enable economic routing
    const collector = createRoutingFeedbackCollector(100);
    await collector.initialize();
    collector.enableEconomicRouting(
      { ...(params.taskComplexity != null ? {} : {}) },
      getGlobalCostTracker(),
    );

    const report = collector.getEconomicReport();
    if (!report) {
      return { success: false, error: 'Economic routing is not available' };
    }

    // Convert Infinity to string for JSON serialization
    const tierEfficiency = report.tierEfficiency.map(t => ({
      ...t,
      qualityPerDollar: isFinite(t.qualityPerDollar) ? t.qualityPerDollar : 'Infinity',
    }));

    return {
      success: true,
      data: {
        tierEfficiency,
        currentHourlyCostUsd: report.currentHourlyCostUsd,
        currentDailyCostUsd: report.currentDailyCostUsd,
        budgetRemaining: report.budgetRemaining,
        recommendation: report.recommendation,
        savingsOpportunity: report.savingsOpportunity,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get economic routing report: ${toErrorMessage(error)}`,
    };
  }
}
