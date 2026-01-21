/**
 * Agentic QE v3 - Multi-Model Router Type Definitions
 * ADR-051: Enhanced Model Routing with Budget Enforcement
 *
 * Extends ADR-026's 3-tier system to a 5-tier routing hierarchy:
 * - Tier 0: Agent Booster (<1ms, $0) - Mechanical transforms via Rust/WASM
 * - Tier 1: Haiku (~500ms, low cost) - Simple tasks, refactoring, bug fixes
 * - Tier 2: Sonnet (2-5s, medium cost) - Complex reasoning, feature implementation
 * - Tier 3: Sonnet Extended (5-10s) - Multi-step workflows, orchestration
 * - Tier 4: Opus (highest capability) - Architecture decisions, security analysis
 *
 * @module integrations/agentic-flow/model-router/types
 */

import type { Result } from '../../../shared/types';
import type { TransformType, AgentBoosterHealth } from '../agent-booster/types';

// ============================================================================
// Model Tier System (ADR-051)
// ============================================================================

/**
 * Model tier classification for routing decisions
 *
 * Each tier represents a capability/cost tradeoff:
 * - Tier 0: Zero-cost mechanical transforms
 * - Tier 1: Fast, cheap models for simple tasks
 * - Tier 2: Balanced capability/cost for most work
 * - Tier 3: Extended context for complex workflows
 * - Tier 4: Maximum capability for critical decisions
 */
export type ModelTier = 0 | 1 | 2 | 3 | 4;

/**
 * Model tier metadata
 */
export interface ModelTierMetadata {
  /** Tier number */
  readonly tier: ModelTier;

  /** Tier name */
  readonly name: string;

  /** Tier description */
  readonly description: string;

  /** Typical use cases */
  readonly useCases: string[];

  /** Typical latency in milliseconds */
  readonly typicalLatencyMs: number;

  /** Relative cost (0 = free, 4 = most expensive) */
  readonly relativeCost: number;

  /** Example models for this tier */
  readonly exampleModels: string[];

  /** Whether this tier requires network access */
  readonly requiresNetwork: boolean;

  /** Recommended complexity range */
  readonly complexityRange: readonly [number, number]; // [min, max] 0-100
}

/**
 * Metadata for all model tiers
 */
export const TIER_METADATA: Record<ModelTier, ModelTierMetadata> = {
  0: {
    tier: 0,
    name: 'Agent Booster',
    description: 'Mechanical code transforms via Rust/WASM',
    useCases: [
      'var-to-const conversion',
      'add-types',
      'remove-console statements',
      'promise-to-async',
      'cjs-to-esm',
      'func-to-arrow',
    ],
    typicalLatencyMs: 1,
    relativeCost: 0,
    exampleModels: ['agent-booster-wasm', 'agent-booster-typescript'],
    requiresNetwork: false,
    complexityRange: [0, 10] as const,
  },
  1: {
    tier: 1,
    name: 'Haiku',
    description: 'Fast, cost-effective for simple tasks',
    useCases: [
      'Simple bug fixes',
      'Code formatting',
      'Documentation updates',
      'Basic refactoring',
      'Test generation (simple)',
    ],
    typicalLatencyMs: 500,
    relativeCost: 1,
    exampleModels: ['claude-3-5-haiku-20241022', 'gpt-4o-mini', 'gemini-flash'],
    requiresNetwork: true,
    complexityRange: [10, 35] as const,
  },
  2: {
    tier: 2,
    name: 'Sonnet',
    description: 'Balanced capability for complex reasoning',
    useCases: [
      'Feature implementation',
      'Complex refactoring',
      'Security analysis',
      'Performance optimization',
      'Test generation (complex)',
    ],
    typicalLatencyMs: 3000,
    relativeCost: 2,
    exampleModels: ['claude-sonnet-4-20250514', 'gpt-4o', 'gemini-pro'],
    requiresNetwork: true,
    complexityRange: [35, 70] as const,
  },
  3: {
    tier: 3,
    name: 'Sonnet Extended',
    description: 'Extended context for multi-step workflows',
    useCases: [
      'Multi-file refactoring',
      'Workflow orchestration',
      'Cross-domain coordination',
      'Large codebase analysis',
    ],
    typicalLatencyMs: 7000,
    relativeCost: 3,
    exampleModels: ['claude-sonnet-4-20250514'],
    requiresNetwork: true,
    complexityRange: [60, 85] as const,
  },
  4: {
    tier: 4,
    name: 'Opus',
    description: 'Maximum capability for critical decisions',
    useCases: [
      'Architecture design',
      'Security audits',
      'Complex algorithm design',
      'Critical bug analysis',
      'System-wide refactoring',
    ],
    typicalLatencyMs: 5000,
    relativeCost: 4,
    exampleModels: ['claude-opus-4-5-20251101', 'gpt-4-turbo'],
    requiresNetwork: true,
    complexityRange: [75, 100] as const,
  },
} as const;

// ============================================================================
// Task Complexity Analysis
// ============================================================================

/**
 * Complexity signals detected in task description or code context
 */
export interface ComplexitySignals {
  /** Lines of code being modified */
  readonly linesOfCode?: number;

  /** Number of files affected */
  readonly fileCount?: number;

  /** Whether task involves architecture decisions */
  readonly hasArchitectureScope: boolean;

  /** Whether task involves security analysis */
  readonly hasSecurityScope: boolean;

  /** Whether task requires multi-step reasoning */
  readonly requiresMultiStepReasoning: boolean;

  /** Whether task involves cross-domain coordination */
  readonly requiresCrossDomainCoordination: boolean;

  /** Whether task is a mechanical transform */
  readonly isMechanicalTransform: boolean;

  /** Detected programming language complexity */
  readonly languageComplexity?: 'low' | 'medium' | 'high';

  /** Cyclomatic complexity (if code context provided) */
  readonly cyclomaticComplexity?: number;

  /** Number of dependencies involved */
  readonly dependencyCount?: number;

  /** Whether task requires creative problem solving */
  readonly requiresCreativity: boolean;

  /** Detected transform type (if Agent Booster eligible) */
  readonly detectedTransformType?: TransformType;

  /** Task description keyword matches */
  readonly keywordMatches: {
    readonly simple: string[];
    readonly moderate: string[];
    readonly complex: string[];
    readonly critical: string[];
  };
}

/**
 * Complexity score breakdown
 */
export interface ComplexityScore {
  /** Overall complexity score (0-100) */
  readonly overall: number;

  /** Code complexity component (0-100) */
  readonly codeComplexity: number;

  /** Reasoning complexity component (0-100) */
  readonly reasoningComplexity: number;

  /** Scope complexity component (0-100) */
  readonly scopeComplexity: number;

  /** Confidence in the complexity assessment (0-1) */
  readonly confidence: number;

  /** Signals that contributed to this score */
  readonly signals: ComplexitySignals;

  /** Recommended tier based on complexity */
  readonly recommendedTier: ModelTier;

  /** Alternative tiers that could handle this task */
  readonly alternateTiers: ModelTier[];

  /** Explanation of the complexity assessment */
  readonly explanation: string;
}

// ============================================================================
// Budget Management
// ============================================================================

/**
 * Budget configuration per tier
 */
export interface TierBudget {
  /** Model tier */
  readonly tier: ModelTier;

  /** Maximum cost per request in USD */
  readonly maxCostPerRequest: number;

  /** Maximum requests per hour */
  readonly maxRequestsPerHour: number;

  /** Maximum requests per day */
  readonly maxRequestsPerDay: number;

  /** Maximum total cost per day in USD */
  readonly maxDailyCostUsd: number;

  /** Whether this tier is enabled */
  readonly enabled: boolean;
}

/**
 * Budget enforcement configuration
 */
export interface BudgetConfig {
  /** Whether budget enforcement is enabled */
  readonly enabled: boolean;

  /** Budget limits per tier */
  readonly tierBudgets: Partial<Record<ModelTier, TierBudget>>;

  /** Global maximum daily cost in USD (across all tiers) */
  readonly maxDailyCostUsd: number;

  /** Warning threshold (0-1, e.g., 0.8 = warn at 80% budget) */
  readonly warningThreshold: number;

  /** Action to take when budget exceeded */
  readonly onBudgetExceeded: 'error' | 'downgrade' | 'queue';

  /** Action to take when approaching budget limit */
  readonly onBudgetWarning: 'warn' | 'downgrade' | 'ignore';

  /** Whether to allow overrides for critical tasks */
  readonly allowCriticalOverrides: boolean;
}

/**
 * Budget usage tracking
 */
export interface BudgetUsage {
  /** Tier being tracked */
  readonly tier: ModelTier;

  /** Current cost spent today in USD */
  readonly costSpentTodayUsd: number;

  /** Requests made this hour */
  readonly requestsThisHour: number;

  /** Requests made today */
  readonly requestsToday: number;

  /** Percentage of daily budget used (0-1) */
  readonly budgetUtilization: number;

  /** Whether budget is exceeded */
  readonly isExceeded: boolean;

  /** Whether approaching budget warning threshold */
  readonly isNearLimit: boolean;

  /** Time when budget resets */
  readonly resetTime: Date;

  /** Remaining budget in USD */
  readonly remainingBudgetUsd: number;

  /** Remaining requests allowed this hour */
  readonly remainingRequestsThisHour: number;

  /** Remaining requests allowed today */
  readonly remainingRequestsToday: number;
}

/**
 * Budget enforcement decision
 */
export interface BudgetDecision {
  /** Whether request is allowed under budget */
  readonly allowed: boolean;

  /** Reason for decision */
  readonly reason: string;

  /** Original requested tier */
  readonly requestedTier: ModelTier;

  /** Approved tier (may be downgraded) */
  readonly approvedTier: ModelTier;

  /** Whether tier was downgraded */
  readonly wasDowngraded: boolean;

  /** Estimated cost for this request */
  readonly estimatedCostUsd: number;

  /** Budget usage before this request */
  readonly currentUsage: BudgetUsage;

  /** Warnings about budget status */
  readonly warnings: string[];
}

// ============================================================================
// Routing Configuration
// ============================================================================

/**
 * Model router configuration
 */
export interface ModelRouterConfig {
  /** Budget enforcement settings */
  readonly budgetConfig: BudgetConfig;

  /** Whether to enable Agent Booster for Tier 0 */
  readonly enableAgentBooster: boolean;

  /** Agent Booster confidence threshold (0-1) */
  readonly agentBoosterThreshold: number;

  /** Whether to enable complexity-based auto-routing */
  readonly enableAutoRouting: boolean;

  /** Complexity threshold adjustments per tier */
  readonly complexityThresholds: Partial<Record<ModelTier, number>>;

  /** Whether to allow manual tier overrides */
  readonly allowManualOverrides: boolean;

  /** Whether to cache routing decisions */
  readonly enableDecisionCache: boolean;

  /** Cache TTL in milliseconds */
  readonly decisionCacheTtlMs: number;

  /** Whether to collect routing metrics */
  readonly enableMetrics: boolean;

  /** Maximum decision time in milliseconds */
  readonly maxDecisionTimeMs: number;

  /** Fallback tier when routing fails */
  readonly fallbackTier: ModelTier;

  /** Model mappings per tier (tier -> model ID) */
  readonly tierModels: Partial<Record<ModelTier, string>>;
}

/**
 * Default budget configuration
 */
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  enabled: true,
  tierBudgets: {
    0: {
      tier: 0,
      maxCostPerRequest: 0,
      maxRequestsPerHour: 10000,
      maxRequestsPerDay: 100000,
      maxDailyCostUsd: 0,
      enabled: true,
    },
    1: {
      tier: 1,
      maxCostPerRequest: 0.01,
      maxRequestsPerHour: 100,
      maxRequestsPerDay: 1000,
      maxDailyCostUsd: 5.0,
      enabled: true,
    },
    2: {
      tier: 2,
      maxCostPerRequest: 0.1,
      maxRequestsPerHour: 50,
      maxRequestsPerDay: 500,
      maxDailyCostUsd: 20.0,
      enabled: true,
    },
    3: {
      tier: 3,
      maxCostPerRequest: 0.5,
      maxRequestsPerHour: 20,
      maxRequestsPerDay: 100,
      maxDailyCostUsd: 30.0,
      enabled: true,
    },
    4: {
      tier: 4,
      maxCostPerRequest: 2.0,
      maxRequestsPerHour: 10,
      maxRequestsPerDay: 50,
      maxDailyCostUsd: 50.0,
      enabled: true,
    },
  },
  maxDailyCostUsd: 100.0,
  warningThreshold: 0.8,
  onBudgetExceeded: 'downgrade',
  onBudgetWarning: 'warn',
  allowCriticalOverrides: true,
} as const;

/**
 * Default model router configuration
 */
export const DEFAULT_ROUTER_CONFIG: ModelRouterConfig = {
  budgetConfig: DEFAULT_BUDGET_CONFIG,
  enableAgentBooster: true,
  agentBoosterThreshold: 0.7,
  enableAutoRouting: true,
  complexityThresholds: {
    0: 10,  // Agent Booster: 0-10 complexity
    1: 35,  // Haiku: 10-35 complexity
    2: 70,  // Sonnet: 35-70 complexity
    3: 85,  // Sonnet Extended: 60-85 complexity
    4: 100, // Opus: 75-100 complexity
  },
  allowManualOverrides: true,
  enableDecisionCache: true,
  decisionCacheTtlMs: 5 * 60 * 1000, // 5 minutes
  enableMetrics: true,
  maxDecisionTimeMs: 10,
  fallbackTier: 2, // Sonnet as fallback
  tierModels: {
    0: 'agent-booster',
    1: 'claude-3-5-haiku-20241022',
    2: 'claude-sonnet-4-20250514',
    3: 'claude-sonnet-4-20250514',
    4: 'claude-opus-4-5-20251101',
  },
} as const;

// ============================================================================
// Routing Input/Output Types
// ============================================================================

/**
 * Input for routing decision
 */
export interface RoutingInput {
  /** Task description */
  readonly task: string;

  /** Optional code context for analysis */
  readonly codeContext?: string;

  /** Optional file paths being modified */
  readonly filePaths?: string[];

  /** Manual tier override (if allowed) */
  readonly manualTier?: ModelTier;

  /** Whether this is a critical task (allows budget overrides) */
  readonly isCritical?: boolean;

  /** Agent type making the request */
  readonly agentType?: string;

  /** Domain of the requesting agent */
  readonly domain?: string;

  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Routing decision output
 */
export interface RoutingDecision {
  /** Selected model tier */
  readonly tier: ModelTier;

  /** Recommended model ID for this tier */
  readonly modelId: string;

  /** Complexity analysis that led to this decision */
  readonly complexityAnalysis: ComplexityScore;

  /** Budget enforcement decision */
  readonly budgetDecision: BudgetDecision;

  /** Confidence in routing decision (0-1) */
  readonly confidence: number;

  /** Rationale for this routing choice */
  readonly rationale: string;

  /** Whether Agent Booster can handle this (Tier 0) */
  readonly agentBoosterEligible: boolean;

  /** Detected Agent Booster transform type (if eligible) */
  readonly agentBoosterTransform?: TransformType;

  /** Alternative tiers that were considered */
  readonly alternativeTiers: Array<{
    tier: ModelTier;
    modelId: string;
    reason: string;
  }>;

  /** Decision metadata */
  readonly metadata: {
    /** Decision timestamp */
    readonly timestamp: Date;
    /** Time taken to make decision in ms */
    readonly decisionTimeMs: number;
    /** Whether decision came from cache */
    readonly fromCache: boolean;
    /** Correlation ID for tracing */
    readonly correlationId?: string;
  };

  /** Warnings about this routing decision */
  readonly warnings: string[];
}

// ============================================================================
// Routing Metrics
// ============================================================================

/**
 * Routing metrics per tier
 */
export interface TierRoutingMetrics {
  /** Model tier */
  readonly tier: ModelTier;

  /** Total times this tier was selected */
  readonly selectionCount: number;

  /** Times selected via auto-routing */
  readonly autoRouteCount: number;

  /** Times selected via manual override */
  readonly manualOverrideCount: number;

  /** Times downgraded due to budget */
  readonly budgetDowngradeCount: number;

  /** Success rate when using this tier (0-1) */
  readonly successRate: number;

  /** Average complexity of tasks routed to this tier */
  readonly avgComplexity: number;

  /** Total cost spent on this tier (USD) */
  readonly totalCostUsd: number;

  /** Average latency in milliseconds */
  readonly avgLatencyMs: number;

  /** P95 latency in milliseconds */
  readonly p95LatencyMs: number;

  /** Current budget utilization (0-1) */
  readonly budgetUtilization: number;
}

/**
 * Overall router metrics
 */
export interface RouterMetrics {
  /** Metrics per tier */
  readonly byTier: Partial<Record<ModelTier, TierRoutingMetrics>>;

  /** Total routing decisions made */
  readonly totalDecisions: number;

  /** Average decision time in milliseconds */
  readonly avgDecisionTimeMs: number;

  /** P95 decision time in milliseconds */
  readonly p95DecisionTimeMs: number;

  /** P99 decision time in milliseconds */
  readonly p99DecisionTimeMs: number;

  /** Rate of fallback routing (tier downgrade) */
  readonly fallbackRate: number;

  /** Rate of successful rule-based routing */
  readonly ruleMatchRate: number;

  /** Estimated cost savings from routing optimization */
  readonly estimatedCostSavings: number;

  /** Agent Booster usage stats */
  readonly agentBoosterStats: {
    readonly eligible: number;
    readonly used: number;
    readonly fallbackToLLM: number;
    readonly successRate: number;
  };

  /** Budget enforcement stats */
  readonly budgetStats: {
    readonly totalSpentUsd: number;
    readonly budgetUtilization: number;
    readonly downgradeCount: number;
    readonly overrideCount: number;
  };

  /** Complexity assessment accuracy (if feedback provided) */
  readonly complexityAccuracy?: {
    readonly correctPredictions: number;
    readonly totalPredictions: number;
    readonly accuracy: number;
  };

  /** Collection period */
  readonly period: {
    readonly start: Date;
    readonly end: Date;
  };
}

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Complexity analyzer interface
 * Analyzes task complexity to determine optimal tier
 */
export interface IComplexityAnalyzer {
  /**
   * Analyze task complexity
   */
  analyze(input: RoutingInput): Promise<ComplexityScore>;

  /**
   * Check if task is eligible for Agent Booster (Tier 0)
   */
  checkAgentBoosterEligibility(input: RoutingInput): Promise<{
    eligible: boolean;
    transformType?: TransformType;
    confidence: number;
    reason: string;
  }>;

  /**
   * Get recommended tier based on complexity score
   */
  getRecommendedTier(complexity: number): ModelTier;
}

/**
 * Budget enforcer interface
 * Enforces cost limits and tracks spending
 */
export interface IBudgetEnforcer {
  /**
   * Check if request is allowed under budget
   */
  checkBudget(tier: ModelTier, estimatedCostUsd: number): Promise<BudgetDecision>;

  /**
   * Record actual cost after request completion
   */
  recordCost(tier: ModelTier, actualCostUsd: number): Promise<void>;

  /**
   * Get current budget usage for a tier
   */
  getUsage(tier: ModelTier): BudgetUsage;

  /**
   * Get usage across all tiers
   */
  getAllUsage(): Partial<Record<ModelTier, BudgetUsage>>;

  /**
   * Reset budget tracking (for testing or new billing period)
   */
  reset(): void;
}

/**
 * Model router interface
 * Main routing logic that selects optimal model tier
 */
export interface IModelRouter {
  /**
   * Route a task to the optimal model tier
   */
  route(input: RoutingInput): Promise<RoutingDecision>;

  /**
   * Get routing metrics
   */
  getMetrics(): RouterMetrics;

  /**
   * Get Agent Booster health status
   */
  getAgentBoosterHealth(): Promise<AgentBoosterHealth>;

  /**
   * Reset metrics
   */
  resetMetrics(): void;

  /**
   * Dispose router and release resources
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error for model router operations
 */
export class ModelRouterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ModelRouterError';
  }
}

/**
 * Error when budget is exceeded
 */
export class BudgetExceededError extends ModelRouterError {
  constructor(
    message: string,
    public readonly tier: ModelTier,
    public readonly usage: BudgetUsage
  ) {
    super(message, 'BUDGET_EXCEEDED');
    this.name = 'BudgetExceededError';
  }
}

/**
 * Error when complexity analysis fails
 */
export class ComplexityAnalysisError extends ModelRouterError {
  constructor(message: string, cause?: Error) {
    super(message, 'COMPLEXITY_ANALYSIS_ERROR', cause);
    this.name = 'ComplexityAnalysisError';
  }
}

/**
 * Error when routing decision times out
 */
export class RoutingTimeoutError extends ModelRouterError {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message, 'ROUTING_TIMEOUT');
    this.name = 'RoutingTimeoutError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Routing decision wrapped in Result type
 */
export type RoutingResult = Result<RoutingDecision, ModelRouterError>;

/**
 * Complexity analysis result wrapped in Result type
 */
export type ComplexityResult = Result<ComplexityScore, ComplexityAnalysisError>;

/**
 * Budget decision result wrapped in Result type
 */
export type BudgetResult = Result<BudgetDecision, BudgetExceededError>;
