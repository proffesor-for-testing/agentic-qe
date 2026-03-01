/**
 * Routing Configuration - TD-004
 * ADR-026: Intelligent Model Routing
 *
 * Configurable thresholds and cost optimization settings for the
 * TinyDancer router and Queen Coordinator integration.
 */

import type { TaskComplexity, ClaudeModel } from './task-classifier.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent tier for task assignment
 */
export type AgentTier = 'booster' | 'haiku' | 'sonnet' | 'opus';

/**
 * Confidence thresholds for routing decisions
 */
export interface ConfidenceThresholds {
  /** Threshold for triggering multi-model verification (default: 0.80) */
  multiModel: number;
  /** Threshold for requesting human review (default: 0.20 uncertainty) */
  humanReview: number;
  /** Security tasks require higher confidence (default: 0.85) */
  security: number;
  /** Threshold for escalating to higher tier on failure (default: 0.60) */
  escalation: number;
}

/**
 * Complexity to agent tier mapping configuration
 */
export interface ComplexityTierMapping {
  /** TRIVIAL (score <= 0.2) - Agent Booster / Haiku */
  trivial: AgentTier[];
  /** SIMPLE (score 0.2-0.4) - Haiku */
  simple: AgentTier[];
  /** MODERATE (score 0.4-0.6) - Sonnet */
  moderate: AgentTier[];
  /** COMPLEX (score 0.6-0.8) - Sonnet with review */
  complex: AgentTier[];
  /** CRITICAL (score >= 0.8) - Opus */
  critical: AgentTier[];
}

/**
 * Cost tracking and optimization settings
 */
export interface CostOptimizationConfig {
  /** Enable cost tracking (default: true) */
  enabled: boolean;
  /** Prefer cheaper models when confidence is high (default: true) */
  preferCheaperModels: boolean;
  /** Cost per 1M tokens for each model (approximate) */
  costPerMillionTokens: Record<ClaudeModel, { input: number; output: number }>;
  /** Maximum cost per day in USD (0 = unlimited) */
  dailyCostLimit: number;
  /** Alert threshold as percentage of daily limit (default: 0.80) */
  costAlertThreshold: number;
}

/**
 * Fallback behavior configuration
 */
export interface FallbackConfig {
  /** Enable automatic fallback to higher tier on failure (default: true) */
  enabled: boolean;
  /** Maximum fallback attempts (default: 2) */
  maxAttempts: number;
  /** Delay between fallback attempts in ms (default: 1000) */
  retryDelayMs: number;
  /** Fallback chain: tier to try next on failure */
  chain: Record<AgentTier, AgentTier | null>;
}

/**
 * Complete routing configuration
 */
export interface RoutingConfig {
  /** Confidence thresholds */
  confidence: ConfidenceThresholds;
  /** Complexity to tier mapping */
  tierMapping: ComplexityTierMapping;
  /** Cost optimization settings */
  costOptimization: CostOptimizationConfig;
  /** Fallback behavior */
  fallback: FallbackConfig;
  /** Enable verbose logging (default: false) */
  verbose: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default confidence thresholds
 */
export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  multiModel: 0.80,
  humanReview: 0.20, // Uncertainty threshold (1 - confidence)
  security: 0.85,
  escalation: 0.60,
};

/**
 * Default complexity to tier mapping
 *
 * Maps TaskComplexity scores to agent tiers:
 * - TRIVIAL (<=0.2): Agent Booster (transformations) or Haiku (simple tasks)
 * - SIMPLE (0.2-0.4): Haiku (bug fixes, simple features)
 * - MODERATE (0.4-0.6): Sonnet (standard features)
 * - COMPLEX (0.6-0.8): Sonnet (complex features, may need review)
 * - CRITICAL (>=0.8): Opus (architecture, security, critical tasks)
 */
export const DEFAULT_TIER_MAPPING: ComplexityTierMapping = {
  trivial: ['booster', 'haiku'], // Try booster first, fallback to haiku
  simple: ['haiku'],
  moderate: ['sonnet'],
  complex: ['sonnet', 'opus'], // Sonnet with Opus fallback
  critical: ['opus'],
};

/**
 * Default cost optimization configuration
 *
 * Pricing as of 2025-01 (approximate):
 * - Haiku: $0.25 input / $1.25 output per 1M tokens
 * - Sonnet: $3.00 input / $15.00 output per 1M tokens
 * - Opus: $15.00 input / $75.00 output per 1M tokens
 */
export const DEFAULT_COST_OPTIMIZATION: CostOptimizationConfig = {
  enabled: true,
  preferCheaperModels: true,
  costPerMillionTokens: {
    haiku: { input: 0.25, output: 1.25 },
    sonnet: { input: 3.0, output: 15.0 },
    opus: { input: 15.0, output: 75.0 },
  },
  dailyCostLimit: 0, // Unlimited by default
  costAlertThreshold: 0.80,
};

/**
 * Default fallback configuration
 *
 * Fallback chain:
 * - booster → haiku → sonnet → opus
 * - haiku → sonnet → opus
 * - sonnet → opus
 * - opus → (none)
 */
export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  enabled: true,
  maxAttempts: 2,
  retryDelayMs: 1000,
  chain: {
    booster: 'haiku',
    haiku: 'sonnet',
    sonnet: 'opus',
    opus: null, // No fallback from opus
  },
};

/**
 * Default routing configuration
 */
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  confidence: DEFAULT_CONFIDENCE_THRESHOLDS,
  tierMapping: DEFAULT_TIER_MAPPING,
  costOptimization: DEFAULT_COST_OPTIMIZATION,
  fallback: DEFAULT_FALLBACK_CONFIG,
  verbose: false,
};

// ============================================================================
// Environment Variable Overrides
// ============================================================================

/**
 * Load routing configuration from environment variables
 *
 * Supported environment variables:
 * - ROUTING_CONFIDENCE_MULTI_MODEL: Override multiModel threshold
 * - ROUTING_CONFIDENCE_HUMAN_REVIEW: Override humanReview threshold
 * - ROUTING_CONFIDENCE_SECURITY: Override security threshold
 * - ROUTING_CONFIDENCE_ESCALATION: Override escalation threshold
 * - ROUTING_COST_DAILY_LIMIT: Override daily cost limit
 * - ROUTING_COST_PREFER_CHEAPER: Override preferCheaperModels
 * - ROUTING_FALLBACK_ENABLED: Override fallback enabled
 * - ROUTING_FALLBACK_MAX_ATTEMPTS: Override max fallback attempts
 * - ROUTING_VERBOSE: Override verbose logging
 *
 * @param baseConfig - Base configuration to extend
 * @returns Configuration with environment overrides applied
 */
export function loadRoutingConfigFromEnv(
  baseConfig: RoutingConfig = DEFAULT_ROUTING_CONFIG
): RoutingConfig {
  const config = structuredClone(baseConfig);

  // Confidence thresholds
  if (process.env.ROUTING_CONFIDENCE_MULTI_MODEL) {
    config.confidence.multiModel = parseFloat(process.env.ROUTING_CONFIDENCE_MULTI_MODEL);
  }
  if (process.env.ROUTING_CONFIDENCE_HUMAN_REVIEW) {
    config.confidence.humanReview = parseFloat(process.env.ROUTING_CONFIDENCE_HUMAN_REVIEW);
  }
  if (process.env.ROUTING_CONFIDENCE_SECURITY) {
    config.confidence.security = parseFloat(process.env.ROUTING_CONFIDENCE_SECURITY);
  }
  if (process.env.ROUTING_CONFIDENCE_ESCALATION) {
    config.confidence.escalation = parseFloat(process.env.ROUTING_CONFIDENCE_ESCALATION);
  }

  // Cost optimization
  if (process.env.ROUTING_COST_DAILY_LIMIT) {
    config.costOptimization.dailyCostLimit = parseFloat(process.env.ROUTING_COST_DAILY_LIMIT);
  }
  if (process.env.ROUTING_COST_PREFER_CHEAPER) {
    config.costOptimization.preferCheaperModels =
      process.env.ROUTING_COST_PREFER_CHEAPER.toLowerCase() === 'true';
  }

  // Fallback
  if (process.env.ROUTING_FALLBACK_ENABLED) {
    config.fallback.enabled = process.env.ROUTING_FALLBACK_ENABLED.toLowerCase() === 'true';
  }
  if (process.env.ROUTING_FALLBACK_MAX_ATTEMPTS) {
    config.fallback.maxAttempts = parseInt(process.env.ROUTING_FALLBACK_MAX_ATTEMPTS, 10);
  }

  // Verbose
  if (process.env.ROUTING_VERBOSE) {
    config.verbose = process.env.ROUTING_VERBOSE.toLowerCase() === 'true';
  }

  return config;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map TaskComplexity to AgentTier
 *
 * @param complexity - Task complexity level
 * @param score - Complexity score (0-100)
 * @param config - Routing configuration
 * @returns Recommended agent tier(s)
 */
export function mapComplexityToTier(
  complexity: TaskComplexity,
  score: number,
  config: RoutingConfig = DEFAULT_ROUTING_CONFIG
): AgentTier[] {
  // Normalize score to 0-1 range
  const normalizedScore = score / 100;

  // Check for trivial tasks (very low score)
  if (normalizedScore <= 0.2) {
    return config.tierMapping.trivial;
  }

  // Map based on complexity level
  switch (complexity) {
    case 'simple':
      return config.tierMapping.simple;
    case 'moderate':
      return config.tierMapping.moderate;
    case 'complex':
      return config.tierMapping.complex;
    case 'critical':
      return config.tierMapping.critical;
  }
}

/**
 * Get the next fallback tier
 *
 * @param currentTier - Current tier that failed
 * @param config - Routing configuration
 * @returns Next tier to try, or null if no fallback available
 */
export function getNextFallbackTier(
  currentTier: AgentTier,
  config: RoutingConfig = DEFAULT_ROUTING_CONFIG
): AgentTier | null {
  if (!config.fallback.enabled) {
    return null;
  }

  return config.fallback.chain[currentTier] ?? null;
}

/**
 * Map AgentTier to ClaudeModel for API calls
 *
 * @param tier - Agent tier
 * @returns Corresponding Claude model
 */
export function tierToModel(tier: AgentTier): ClaudeModel {
  switch (tier) {
    case 'booster':
    case 'haiku':
      return 'haiku';
    case 'sonnet':
      return 'sonnet';
    case 'opus':
      return 'opus';
  }
}

/**
 * Calculate estimated cost for a task
 *
 * @param model - Claude model
 * @param inputTokens - Estimated input tokens
 * @param outputTokens - Estimated output tokens
 * @param config - Routing configuration
 * @returns Estimated cost in USD
 */
export function estimateTaskCost(
  model: ClaudeModel,
  inputTokens: number,
  outputTokens: number,
  config: RoutingConfig = DEFAULT_ROUTING_CONFIG
): number {
  const pricing = config.costOptimization.costPerMillionTokens[model];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Validate routing configuration
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateRoutingConfig(config: RoutingConfig): void {
  // Validate confidence thresholds
  const { confidence } = config;
  if (confidence.multiModel < 0 || confidence.multiModel > 1) {
    throw new Error('multiModel confidence must be between 0 and 1');
  }
  if (confidence.humanReview < 0 || confidence.humanReview > 1) {
    throw new Error('humanReview confidence must be between 0 and 1');
  }
  if (confidence.security < 0 || confidence.security > 1) {
    throw new Error('security confidence must be between 0 and 1');
  }
  if (confidence.escalation < 0 || confidence.escalation > 1) {
    throw new Error('escalation confidence must be between 0 and 1');
  }

  // Validate cost optimization
  if (config.costOptimization.dailyCostLimit < 0) {
    throw new Error('dailyCostLimit must be non-negative');
  }
  if (
    config.costOptimization.costAlertThreshold < 0 ||
    config.costOptimization.costAlertThreshold > 1
  ) {
    throw new Error('costAlertThreshold must be between 0 and 1');
  }

  // Validate fallback
  if (config.fallback.maxAttempts < 0) {
    throw new Error('maxAttempts must be non-negative');
  }
  if (config.fallback.retryDelayMs < 0) {
    throw new Error('retryDelayMs must be non-negative');
  }
}
