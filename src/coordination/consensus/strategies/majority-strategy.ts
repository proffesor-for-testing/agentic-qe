/**
 * Agentic QE v3 - Majority Consensus Strategy
 * MM-007: Simple majority voting for consensus verification
 *
 * Implements a simple majority voting strategy where >50% of models
 * must agree for a verdict to be reached.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import { ModelVote, ConsensusVerdict } from '../interfaces';

/**
 * Result of applying consensus strategy
 */
export interface ConsensusStrategyResult {
  /** Final verdict */
  verdict: ConsensusVerdict;

  /** Overall confidence (0-1) */
  confidence: number;

  /** Agreement ratio (votes agreeing / total votes) */
  agreementRatio: number;

  /** Synthesized reasoning */
  reasoning: string;

  /** Whether human review is required */
  requiresHumanReview: boolean;
}

/**
 * Configuration for majority strategy
 */
export interface MajorityStrategyConfig {
  /** Minimum votes required to avoid 'insufficient' verdict */
  minVotes?: number;

  /** Confidence threshold below which human review is required */
  humanReviewThreshold?: number;

  /** Threshold for agreement ratio (default 0.5 for majority) */
  agreementThreshold?: number;
}

/**
 * Simple majority consensus strategy
 *
 * Requires >50% of models to agree for a 'verified' verdict.
 * If votes are split, verdict is 'disputed'.
 *
 * @example
 * ```typescript
 * const strategy = new MajorityStrategy({ minVotes: 2 });
 * const result = strategy.apply(votes);
 * if (result.verdict === 'verified') {
 *   // Finding is confirmed by majority
 * }
 * ```
 */
export class MajorityStrategy {
  private readonly config: Required<MajorityStrategyConfig>;

  constructor(config: MajorityStrategyConfig = {}) {
    this.config = {
      minVotes: config.minVotes ?? 2,
      humanReviewThreshold: config.humanReviewThreshold ?? 0.6,
      agreementThreshold: config.agreementThreshold ?? 0.5,
    };
  }

  /**
   * Apply majority voting to model votes
   *
   * @param votes - Array of model votes
   * @returns Consensus result
   */
  apply(votes: ModelVote[]): ConsensusStrategyResult {
    // Check if we have enough votes
    if (votes.length < this.config.minVotes) {
      return {
        verdict: 'insufficient',
        confidence: 0,
        agreementRatio: 0,
        reasoning: `Insufficient votes: ${votes.length} received, ${this.config.minVotes} required`,
        requiresHumanReview: true,
      };
    }

    // Filter out error votes
    const validVotes = votes.filter(v => !v.error);

    if (validVotes.length === 0) {
      return {
        verdict: 'error',
        confidence: 0,
        agreementRatio: 0,
        reasoning: 'All model votes resulted in errors',
        requiresHumanReview: true,
      };
    }

    // Count agreements and disagreements
    const agreeCount = validVotes.filter(v => v.agrees).length;
    const totalCount = validVotes.length;
    const agreementRatio = agreeCount / totalCount;

    // Calculate average confidence
    const avgConfidence = validVotes.reduce((sum, v) => sum + v.confidence, 0) / totalCount;

    // Determine verdict based on majority
    let verdict: ConsensusVerdict;
    if (agreementRatio > this.config.agreementThreshold) {
      verdict = 'verified';
    } else if (agreementRatio < (1 - this.config.agreementThreshold)) {
      verdict = 'rejected';
    } else {
      verdict = 'disputed';
    }

    // Synthesize reasoning
    const reasoning = this.synthesizeReasoning(validVotes, agreeCount, totalCount);

    // Determine if human review is needed
    const requiresHumanReview =
      avgConfidence < this.config.humanReviewThreshold ||
      verdict === 'disputed';

    return {
      verdict,
      confidence: avgConfidence,
      agreementRatio,
      reasoning,
      requiresHumanReview,
    };
  }

  /**
   * Synthesize reasoning from all votes
   */
  private synthesizeReasoning(
    votes: ModelVote[],
    agreeCount: number,
    totalCount: number
  ): string {
    const parts: string[] = [];

    // Summary
    parts.push(`Majority consensus reached: ${agreeCount}/${totalCount} models agree.`);

    // Group reasoning by agreement
    const agreeReasons = votes
      .filter(v => v.agrees)
      .map(v => `- ${v.modelId}: ${v.reasoning}`);

    const disagreeReasons = votes
      .filter(v => !v.agrees)
      .map(v => `- ${v.modelId}: ${v.reasoning}`);

    if (agreeReasons.length > 0) {
      parts.push('\nSupporting votes:');
      parts.push(agreeReasons.join('\n'));
    }

    if (disagreeReasons.length > 0) {
      parts.push('\nOpposing votes:');
      parts.push(disagreeReasons.join('\n'));
    }

    return parts.join('\n');
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<MajorityStrategyConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MajorityStrategyConfig>): void {
    Object.assign(this.config, config);
  }
}

/**
 * Create a majority consensus strategy
 *
 * @param config - Optional strategy configuration
 * @returns Majority strategy instance
 */
export function createMajorityStrategy(
  config?: MajorityStrategyConfig
): MajorityStrategy {
  return new MajorityStrategy(config);
}
