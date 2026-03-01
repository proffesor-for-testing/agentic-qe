/**
 * Agentic QE v3 - Fleet Tier Activation System
 * ADR-064 Phase 1D: Tiered Fleet Activation Configuration
 *
 * Controls how many agents activate based on task complexity, balancing
 * cost against validation thoroughness. Four tiers from lightweight smoke
 * runs (every commit) through full crisis mode (production incidents).
 *
 * @example
 * ```typescript
 * import {
 *   createTierSelector,
 *   getDefaultTierConfig,
 *   DEFAULT_TIER_CONFIGS,
 * } from './coordination/fleet-tiers';
 *
 * // Create a selector with default configs
 * const selector = createTierSelector();
 *
 * // Select tier based on context
 * const result = selector.selectTier({
 *   trigger: 'pr',
 *   changedFiles: 5,
 *   affectedDomains: ['test-generation', 'coverage-analysis'],
 * });
 *
 * console.log(result.selectedTier); // 'standard'
 * console.log(result.agentAllocation);
 *
 * // Escalate if needed
 * const escalated = selector.escalate('standard', 'Flaky test detected');
 * console.log(escalated.selectedTier); // 'deep'
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  FleetTier,
  TierCostLevel,
  TierTriggerType,
  TierTrigger,
  TierConfig,
  TierSelectionContext,
  AgentAllocation,
  TierSelectionResult,
  TierSelectionRecord,
  TierSelectionStats,
} from './types';

export { FLEET_TIER_ORDER } from './types';

// ============================================================================
// Configuration
// ============================================================================

export {
  ALL_USER_FACING_DOMAINS,
  CORE_PRIORITY_DOMAINS,
  DEFAULT_DOMAIN_AGENT_MAP,
  DEFAULT_TIER_CONFIGS,
  getDefaultTierConfig,
  validateTierConfig,
} from './tier-config';

// ============================================================================
// Selector
// ============================================================================

export { TierSelector, createTierSelector } from './tier-selector';
