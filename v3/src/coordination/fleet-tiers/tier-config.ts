/**
 * Agentic QE v3 - Fleet Tier Configuration Defaults
 * ADR-064 Phase 1D: Tiered Fleet Activation Configuration
 *
 * Provides the default tier configurations for all four fleet tiers.
 * These defaults can be overridden by passing custom configs to the
 * TierSelector constructor.
 */

import type { DomainName } from '../../shared/types';
import type { FleetTier, TierConfig, TierCostLevel } from './types';

// ============================================================================
// Domain Constants
// ============================================================================

/**
 * All 13 user-facing domain names (excludes 'coordination' which is internal).
 * Used when a tier specifies `['all']` or needs the full domain list.
 */
export const ALL_USER_FACING_DOMAINS: readonly DomainName[] = [
  'test-generation',
  'test-execution',
  'coverage-analysis',
  'quality-assessment',
  'defect-intelligence',
  'requirements-validation',
  'code-intelligence',
  'security-compliance',
  'contract-testing',
  'visual-accessibility',
  'chaos-resilience',
  'learning-optimization',
  'enterprise-integration',
] as const;

/**
 * Core domains that receive priority allocation when agents are limited.
 * These domains cover the most critical quality engineering activities.
 */
export const CORE_PRIORITY_DOMAINS: readonly DomainName[] = [
  'test-generation',
  'coverage-analysis',
  'quality-assessment',
] as const;

// ============================================================================
// Domain-to-Agent-Type Mapping
// ============================================================================

/**
 * Maps each domain to the agent types that operate within it.
 * Used by the TierSelector when allocating agents to domains.
 */
export const DEFAULT_DOMAIN_AGENT_MAP: Readonly<Record<string, readonly string[]>> = {
  'test-generation': ['generator', 'specialist'],
  'test-execution': ['tester', 'coordinator'],
  'coverage-analysis': ['analyzer', 'specialist'],
  'quality-assessment': ['analyzer', 'validator'],
  'defect-intelligence': ['analyzer', 'specialist'],
  'requirements-validation': ['validator', 'reviewer'],
  'code-intelligence': ['analyzer', 'specialist'],
  'security-compliance': ['analyzer', 'validator'],
  'contract-testing': ['tester', 'validator'],
  'visual-accessibility': ['tester', 'validator'],
  'chaos-resilience': ['tester', 'specialist'],
  'learning-optimization': ['optimizer', 'specialist'],
  'enterprise-integration': ['coordinator', 'validator'],
} as const;

// ============================================================================
// Smoke Tier (every commit)
// ============================================================================

/** Smoke tier: lightweight validation on every commit */
const SMOKE_TIER_CONFIG: TierConfig = {
  tier: 'smoke',
  maxAgents: 3,
  agentTeamsEnabled: false,
  domains: ['test-execution', 'quality-assessment'],
  estimatedCost: 'minimal',
  description:
    'Lightweight smoke test on every commit. Runs core test execution and quality assessment with minimal agent count to catch obvious regressions quickly.',
  triggers: [
    { type: 'commit' },
    { type: 'schedule', conditions: { interval: 'hourly' } },
  ],
} as const;

// ============================================================================
// Standard Tier (PR opened)
// ============================================================================

/** Standard tier: comprehensive PR validation */
const STANDARD_TIER_CONFIG: TierConfig = {
  tier: 'standard',
  maxAgents: 7,
  agentTeamsEnabled: false,
  domains: [
    'test-generation',
    'test-execution',
    'coverage-analysis',
    'quality-assessment',
    'security-compliance',
  ],
  estimatedCost: 'moderate',
  description:
    'Standard validation for pull requests. Covers test generation, execution, coverage, quality, and security across up to 7 agents. Agent teams are optional.',
  triggers: [
    { type: 'pr' },
    { type: 'manual' },
  ],
} as const;

// ============================================================================
// Deep Tier (pre-release, critical path)
// ============================================================================

/** Deep tier: thorough pre-release validation across all domains */
const DEEP_TIER_CONFIG: TierConfig = {
  tier: 'deep',
  maxAgents: 15,
  agentTeamsEnabled: true,
  domains: [...ALL_USER_FACING_DOMAINS],
  estimatedCost: 'high',
  description:
    'Deep validation for pre-release and critical path changes. Activates all 13 domains with up to 15 agents and full agent team collaboration.',
  triggers: [
    { type: 'release' },
    { type: 'pr', conditions: { criticalPath: true } },
    { type: 'manual', conditions: { requestedTier: 'deep' } },
  ],
} as const;

// ============================================================================
// Crisis Tier (production incident)
// ============================================================================

/** Crisis tier: full activation with competing hypotheses for incidents */
const CRISIS_TIER_CONFIG: TierConfig = {
  tier: 'crisis',
  maxAgents: 15,
  agentTeamsEnabled: true,
  domains: [...ALL_USER_FACING_DOMAINS],
  estimatedCost: 'unlimited',
  description:
    'Crisis response for production incidents. All domains active with competing hypotheses enabled. Unlimited cost budget to resolve incidents as fast as possible.',
  triggers: [
    { type: 'incident' },
    { type: 'manual', conditions: { requestedTier: 'crisis' } },
  ],
} as const;

// ============================================================================
// Default Tier Config Map
// ============================================================================

/**
 * Default configurations for all four fleet tiers.
 * Keyed by FleetTier for O(1) lookup.
 */
export const DEFAULT_TIER_CONFIGS: Readonly<Record<FleetTier, TierConfig>> = {
  smoke: SMOKE_TIER_CONFIG,
  standard: STANDARD_TIER_CONFIG,
  deep: DEEP_TIER_CONFIG,
  crisis: CRISIS_TIER_CONFIG,
} as const;

// ============================================================================
// Accessor Functions
// ============================================================================

/**
 * Retrieve the default configuration for a given fleet tier.
 *
 * @param tier - The fleet tier to look up
 * @returns The default TierConfig for the requested tier
 *
 * @example
 * ```typescript
 * const config = getDefaultTierConfig('standard');
 * console.log(config.maxAgents); // 7
 * ```
 */
export function getDefaultTierConfig(tier: FleetTier): TierConfig {
  return DEFAULT_TIER_CONFIGS[tier];
}

// ============================================================================
// Validation
// ============================================================================

/** Valid cost levels for validation */
const VALID_COST_LEVELS: readonly TierCostLevel[] = [
  'minimal',
  'moderate',
  'high',
  'unlimited',
] as const;

/** Valid trigger types for validation */
const VALID_TRIGGER_TYPES = new Set([
  'commit',
  'pr',
  'release',
  'incident',
  'manual',
  'schedule',
]);

/**
 * Validate a tier configuration and return a list of validation errors.
 * Returns an empty array if the configuration is valid.
 *
 * @param config - The TierConfig to validate
 * @returns Array of human-readable validation error strings
 *
 * @example
 * ```typescript
 * const errors = validateTierConfig(myConfig);
 * if (errors.length > 0) {
 *   console.error('Invalid tier config:', errors);
 * }
 * ```
 */
export function validateTierConfig(config: TierConfig): string[] {
  const errors: string[] = [];

  // Validate tier name
  const validTiers: readonly FleetTier[] = ['smoke', 'standard', 'deep', 'crisis'];
  if (!validTiers.includes(config.tier)) {
    errors.push(`Invalid tier name: "${config.tier}". Must be one of: ${validTiers.join(', ')}`);
  }

  // Validate maxAgents
  if (!Number.isInteger(config.maxAgents) || config.maxAgents < 1) {
    errors.push(`maxAgents must be a positive integer, got: ${config.maxAgents}`);
  }
  if (config.maxAgents > 15) {
    errors.push(`maxAgents exceeds fleet maximum of 15, got: ${config.maxAgents}`);
  }

  // Validate domains
  if (!Array.isArray(config.domains) || config.domains.length === 0) {
    errors.push('domains must be a non-empty array');
  }

  // Validate estimatedCost
  if (!VALID_COST_LEVELS.includes(config.estimatedCost)) {
    errors.push(
      `Invalid estimatedCost: "${config.estimatedCost}". Must be one of: ${VALID_COST_LEVELS.join(', ')}`
    );
  }

  // Validate description
  if (!config.description || config.description.trim().length === 0) {
    errors.push('description must be a non-empty string');
  }

  // Validate triggers
  if (!Array.isArray(config.triggers) || config.triggers.length === 0) {
    errors.push('triggers must be a non-empty array');
  } else {
    for (let i = 0; i < config.triggers.length; i++) {
      const trigger = config.triggers[i];
      if (!trigger || !VALID_TRIGGER_TYPES.has(trigger.type)) {
        errors.push(
          `triggers[${i}] has invalid type: "${trigger?.type}". Must be one of: ${[...VALID_TRIGGER_TYPES].join(', ')}`
        );
      }
    }
  }

  // Validate agentTeamsEnabled consistency
  if (config.agentTeamsEnabled && config.maxAgents < 3) {
    errors.push(
      'agentTeamsEnabled requires maxAgents >= 3 for meaningful team collaboration'
    );
  }

  return errors;
}
