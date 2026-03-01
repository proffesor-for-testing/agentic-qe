/**
 * Agentic QE v3 - Devil's Advocate Agent
 * ADR-064, Phase 2C: Barrel exports and factory
 *
 * The Devil's Advocate agent challenges other agents' outputs by reviewing
 * test completeness, questioning security scan results, and identifying
 * coverage gaps in claimed results.
 *
 * @module agents/devils-advocate
 *
 * @example
 * ```typescript
 * import {
 *   createDevilsAdvocate,
 *   type ChallengeTarget,
 *   type ChallengeResult,
 * } from './agents/devils-advocate';
 *
 * const da = createDevilsAdvocate({ minConfidence: 0.5 });
 *
 * const target: ChallengeTarget = {
 *   type: 'test-generation',
 *   agentId: 'test-gen-001',
 *   domain: 'test-generation',
 *   output: { testCount: 3, tests: [] },
 *   timestamp: Date.now(),
 * };
 *
 * const result: ChallengeResult = da.review(target);
 * console.log(result.summary);
 * ```
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  ChallengeTargetType,
  ChallengeTarget,
  ChallengeSeverity,
  Challenge,
  ChallengeResult,
  ChallengeStrategyType,
  ChallengeStrategy,
  DevilsAdvocateConfig,
  DevilsAdvocateStats,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

export {
  ALL_CHALLENGE_TARGET_TYPES,
  ALL_CHALLENGE_STRATEGY_TYPES,
  SEVERITY_ORDER,
  SEVERITY_WEIGHTS,
  DEFAULT_DEVILS_ADVOCATE_CONFIG,
} from './types.js';

// ============================================================================
// Type Guards
// ============================================================================

export {
  isChallengeTargetType,
  isChallengeStrategyType,
  isChallengeSeverity,
} from './types.js';

// ============================================================================
// Strategies
// ============================================================================

export {
  MissingEdgeCaseStrategy,
  FalsePositiveDetectionStrategy,
  CoverageGapCritiqueStrategy,
  SecurityBlindSpotStrategy,
  AssumptionQuestioningStrategy,
  BoundaryValueGapStrategy,
  ErrorHandlingGapStrategy,
  createAllStrategies,
  getApplicableStrategies,
} from './strategies.js';

// ============================================================================
// Agent
// ============================================================================

export { DevilsAdvocate } from './agent.js';

// ============================================================================
// Factory
// ============================================================================

import type { DevilsAdvocateConfig } from './types.js';
import { DevilsAdvocate } from './agent.js';

/**
 * Factory function to create a Devil's Advocate agent instance.
 *
 * @param config - Optional partial configuration (merged with defaults)
 * @returns A configured DevilsAdvocate instance
 *
 * @example
 * ```typescript
 * // With defaults
 * const da = createDevilsAdvocate();
 *
 * // With custom config
 * const strict = createDevilsAdvocate({
 *   minConfidence: 0.7,
 *   minSeverity: 'medium',
 *   maxChallengesPerReview: 10,
 * });
 * ```
 */
export function createDevilsAdvocate(
  config?: Partial<DevilsAdvocateConfig>,
): DevilsAdvocate {
  return new DevilsAdvocate(config);
}
