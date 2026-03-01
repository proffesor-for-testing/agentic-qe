/**
 * Skill Tier Types for AQE-OpenCode Provider Routing
 *
 * Defines the model tier classification system used to match AQE skills
 * to provider capabilities. Each skill declares its minimum model tier
 * and degradation behavior when a lower-tier model is active.
 *
 * @module skill-tiers
 */

// Re-export ModelTier from the main types for convenience
export { ModelTier } from './index.js';

/**
 * Minimum model tier required for a skill to operate correctly.
 * - tier1-any: Any model works (simple mechanical tasks)
 * - tier2-good: Needs decent reasoning (test generation, analysis)
 * - tier3-best: Needs advanced reasoning (security, architecture, mutation testing)
 */
export type ModelTierString = 'tier1-any' | 'tier2-good' | 'tier3-best';

/**
 * What happens when a skill runs on a model below its minimum tier.
 * - warn: Execute but warn the user about potential quality issues
 * - skip-step: Skip optional steps that require higher reasoning
 * - use-fallback: Switch to a simpler alternative skill
 * - block: Refuse to execute (used for security-critical skills)
 */
export type DegradationBehavior = 'warn' | 'skip-step' | 'use-fallback' | 'block';

/**
 * Metadata describing a skill's model tier requirements and degradation strategy.
 */
export interface SkillTierMetadata {
  /** Skill name matching the directory name in .claude/skills/ */
  skillName: string;

  /** Minimum model tier required for acceptable output quality */
  minModelTier: ModelTierString;

  /** Human-readable reason for the tier assignment */
  reason: string;

  /** What to do when the active model is below the minimum tier */
  degradationBehavior: DegradationBehavior;

  /** Alternative skill to suggest when degradation behavior is 'use-fallback' */
  fallbackSkill?: string;

  /** Category for grouping in UI/reports */
  category?: string;

  /** Estimated token usage for a typical invocation */
  estimatedTokens?: number;
}

/**
 * Summary of tier distribution across all classified skills.
 */
export interface SkillTierSummary {
  total: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  blockedOnDegradation: number;
}
