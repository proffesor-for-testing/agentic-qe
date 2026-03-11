/**
 * Agentic QE v3 - Devil's Advocate Agent Types
 * ADR-064, Phase 2C: Type definitions for the Devil's Advocate agent
 *
 * The Devil's Advocate agent challenges other agents' outputs by reviewing
 * test completeness, questioning security scan results, and identifying
 * coverage gaps in claimed results.
 *
 * @module agents/devils-advocate
 */

// ============================================================================
// Challenge Target Types
// ============================================================================

/**
 * The kind of output being challenged by the Devil's Advocate.
 * Each target type maps to specific challenge strategies that know
 * how to inspect and critique that category of output.
 */
export type ChallengeTargetType =
  | 'test-generation'      // Generated tests
  | 'coverage-analysis'    // Coverage report
  | 'security-scan'        // Security findings
  | 'quality-assessment'   // Quality gate results
  | 'defect-prediction'    // Predicted defects
  | 'contract-validation'  // Contract test results
  | 'requirements';        // Requirements validation

/**
 * All valid challenge target types, for runtime validation.
 */
export const ALL_CHALLENGE_TARGET_TYPES: readonly ChallengeTargetType[] = [
  'test-generation',
  'coverage-analysis',
  'security-scan',
  'quality-assessment',
  'defect-prediction',
  'contract-validation',
  'requirements',
] as const;

/**
 * The output being challenged by the Devil's Advocate.
 * Represents the concrete artifact produced by another agent
 * that will be subjected to critical review.
 */
export interface ChallengeTarget {
  /** What kind of output is being challenged */
  readonly type: ChallengeTargetType;
  /** ID of the agent that produced this output */
  readonly agentId: string;
  /** Domain this output belongs to */
  readonly domain: string;
  /** The actual output data to be challenged */
  readonly output: Record<string, unknown>;
  /** When this output was produced (epoch ms) */
  readonly timestamp: number;
  /** Optional task ID for traceability */
  readonly taskId?: string;
}

// ============================================================================
// Challenge Severity
// ============================================================================

/**
 * Severity of a challenge finding. Determines the urgency
 * and impact assessment of a discovered gap or weakness.
 */
export type ChallengeSeverity =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'informational';

/**
 * All valid challenge severities in descending order of importance.
 * Used for filtering and sorting challenges.
 */
export const SEVERITY_ORDER: readonly ChallengeSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
] as const;

/**
 * Numeric weight for each severity level, used in score computation.
 * Higher weight means greater negative impact on the overall score.
 */
export const SEVERITY_WEIGHTS: Readonly<Record<ChallengeSeverity, number>> = {
  critical: 0.25,
  high: 0.15,
  medium: 0.08,
  low: 0.03,
  informational: 0.01,
} as const;

/**
 * Weights used for minimum finding threshold calculations.
 * Maps each severity to a point value for determining whether
 * a review meets its minimum finding requirements.
 */
export const MINIMUM_FINDING_WEIGHTS: Readonly<Record<ChallengeSeverity, number>> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0.5,
  informational: 0.25,
} as const;

// ============================================================================
// Challenge
// ============================================================================

/**
 * A specific challenge raised against an agent's output.
 * Each challenge documents a gap, weakness, or questionable aspect
 * found during the Devil's Advocate review.
 */
export interface Challenge {
  /** Unique identifier for this challenge */
  readonly id: string;
  /** How severe this gap or weakness is */
  readonly severity: ChallengeSeverity;
  /** Category of the challenge (e.g., 'missing-edge-case', 'false-positive') */
  readonly category: string;
  /** Short descriptive title */
  readonly title: string;
  /** Detailed description of the challenge */
  readonly description: string;
  /** Evidence supporting this challenge */
  readonly evidence: string;
  /** What should be done to address this challenge */
  readonly recommendation: string;
  /** Confidence in this challenge being valid (0-1) */
  readonly confidence: number;
}

// ============================================================================
// Clean Justification
// ============================================================================

/**
 * Justification provided when a review produces fewer findings than the
 * minimum threshold. Documents what was examined and why no issues were found.
 */
export interface CleanJustification {
  /** Whether the target was deemed genuinely clean */
  readonly isClean: boolean;
  /** Specific files that were examined during the review */
  readonly filesExamined: readonly string[];
  /** Patterns and anti-patterns that were checked */
  readonly patternsChecked: readonly string[];
  /** Tools and strategies that were run */
  readonly toolsRun: readonly string[];
  /** Detailed reasoning for why no issues were found */
  readonly reasoning: string;
}

// ============================================================================
// Challenge Result
// ============================================================================

/**
 * Result of a Devil's Advocate review of an agent's output.
 * Aggregates all challenges found and provides an overall assessment.
 */
export interface ChallengeResult {
  /** What type of output was reviewed */
  readonly targetType: ChallengeTargetType;
  /** ID of the agent whose output was reviewed */
  readonly targetAgentId: string;
  /** All challenges found during the review */
  readonly challenges: readonly Challenge[];
  /** Overall score (0-1), where 1 means no challenges found */
  readonly overallScore: number;
  /** Human-readable summary of the review */
  readonly summary: string;
  /** When the review was completed (epoch ms) */
  readonly timestamp: number;
  /** How long the review took (ms) */
  readonly reviewDuration: number;
  /** Clean justification when findings are below minimum threshold */
  readonly cleanJustification?: CleanJustification;
  /** Weighted finding score based on MINIMUM_FINDING_WEIGHTS */
  readonly weightedFindingScore?: number;
  /** Whether the minimum finding threshold was met */
  readonly minimumMet?: boolean;
}

// ============================================================================
// Review Outcome
// ============================================================================

/**
 * Outcome of a Devil's Advocate review, used for learning feedback.
 * Captures which challenges were accepted or dismissed by the user.
 */
export interface ReviewOutcome {
  /** What type of output was reviewed */
  readonly targetType: ChallengeTargetType;
  /** ID of the agent whose output was reviewed */
  readonly targetAgentId: string;
  /** Total number of challenges raised */
  readonly challengeCount: number;
  /** Number of challenges accepted by the user */
  readonly acceptedCount: number;
  /** Number of challenges dismissed by the user */
  readonly dismissedCount: number;
  /** Breakdown of challenges by severity */
  readonly severityBreakdown: Readonly<Record<string, number>>;
  /** Whether the minimum finding threshold was met */
  readonly minimumMet: boolean;
  /** ISO timestamp of when the outcome was recorded */
  readonly timestamp: string;
}

// ============================================================================
// Challenge Strategy Types
// ============================================================================

/**
 * Types of challenge strategies the Devil's Advocate can employ.
 * Each strategy focuses on a specific category of potential weakness.
 */
export type ChallengeStrategyType =
  | 'missing-edge-cases'
  | 'false-positive-detection'
  | 'coverage-gap-critique'
  | 'security-blind-spots'
  | 'assumption-questioning'
  | 'boundary-value-gaps'
  | 'error-handling-gaps';

/**
 * All valid challenge strategy types, for runtime validation.
 */
export const ALL_CHALLENGE_STRATEGY_TYPES: readonly ChallengeStrategyType[] = [
  'missing-edge-cases',
  'false-positive-detection',
  'coverage-gap-critique',
  'security-blind-spots',
  'assumption-questioning',
  'boundary-value-gaps',
  'error-handling-gaps',
] as const;

/**
 * Interface that all challenge strategies must implement.
 * Each strategy inspects a target output and produces challenges.
 */
export interface ChallengeStrategy {
  /** Which strategy type this implements */
  readonly type: ChallengeStrategyType;
  /** Which target types this strategy can be applied to */
  readonly applicableTo: readonly ChallengeTargetType[];
  /**
   * Analyze the target output and produce challenges.
   *
   * @param target - The output being challenged
   * @returns Array of challenges found
   */
  challenge(target: ChallengeTarget): Challenge[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for Devil's Advocate behavior.
 * Controls which strategies run, how sensitive the review is,
 * and what gets included in the final result.
 */
export interface DevilsAdvocateConfig {
  /** Minimum confidence to report a challenge (0-1). @default 0.3 */
  readonly minConfidence: number;
  /** Maximum challenges to report per review. @default 20 */
  readonly maxChallengesPerReview: number;
  /** Which challenge strategies to enable */
  readonly enabledStrategies: readonly ChallengeStrategyType[];
  /** Only include challenges at or above this severity. @default 'informational' */
  readonly minSeverity: ChallengeSeverity;
  /** Minimum weighted finding score required for a review. @default 3 */
  readonly minimumFindings: number;
  /** How to evaluate minimum findings: 'weighted' uses severity weights, 'count' uses raw count. @default 'weighted' */
  readonly minimumFindingsMode: 'weighted' | 'count';
}

/**
 * Default configuration for the Devil's Advocate agent.
 */
export const DEFAULT_DEVILS_ADVOCATE_CONFIG: DevilsAdvocateConfig = {
  minConfidence: 0.3,
  maxChallengesPerReview: 20,
  enabledStrategies: ALL_CHALLENGE_STRATEGY_TYPES,
  minSeverity: 'informational',
  minimumFindings: 3,
  minimumFindingsMode: 'weighted',
} as const;

// ============================================================================
// Statistics
// ============================================================================

/**
 * Accumulated statistics from Devil's Advocate reviews.
 * Provides insight into the kinds of gaps being found across reviews.
 */
export interface DevilsAdvocateStats {
  /** Total number of reviews performed */
  readonly totalReviews: number;
  /** Total number of challenges raised across all reviews */
  readonly totalChallenges: number;
  /** Challenge count broken down by severity */
  readonly challengesBySeverity: Readonly<Record<ChallengeSeverity, number>>;
  /** Challenge count broken down by category */
  readonly challengesByCategory: Readonly<Record<string, number>>;
  /** Average number of challenges per review */
  readonly averageChallengesPerReview: number;
  /** Average overall score across all reviews */
  readonly averageScore: number;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a string is a valid ChallengeTargetType.
 *
 * @param value - String to check
 * @returns True if value is a valid ChallengeTargetType
 */
export function isChallengeTargetType(value: string): value is ChallengeTargetType {
  return (ALL_CHALLENGE_TARGET_TYPES as readonly string[]).includes(value);
}

/**
 * Check if a string is a valid ChallengeStrategyType.
 *
 * @param value - String to check
 * @returns True if value is a valid ChallengeStrategyType
 */
export function isChallengeStrategyType(value: string): value is ChallengeStrategyType {
  return (ALL_CHALLENGE_STRATEGY_TYPES as readonly string[]).includes(value);
}

/**
 * Check if a string is a valid ChallengeSeverity.
 *
 * @param value - String to check
 * @returns True if value is a valid ChallengeSeverity
 */
export function isChallengeSeverity(value: string): value is ChallengeSeverity {
  return (SEVERITY_ORDER as readonly string[]).includes(value);
}
