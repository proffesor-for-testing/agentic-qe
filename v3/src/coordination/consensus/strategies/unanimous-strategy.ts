/**
 * Agentic QE v3 - Unanimous Consensus Strategy
 * MM-009: Require full agreement for consensus verification
 *
 * Implements unanimous voting where 100% of models must agree
 * for a verdict to be reached. Most conservative strategy, useful
 * for critical security findings.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import { ModelVote, ConsensusVerdict } from '../interfaces';
import { ConsensusStrategyResult } from './majority-strategy';

/**
 * Configuration for unanimous strategy
 */
export interface UnanimousStrategyConfig {
  /** Minimum votes required to avoid 'insufficient' verdict */
  minVotes?: number;

  /** Confidence threshold below which human review is required */
  humanReviewThreshold?: number;

  /** Allow partial agreement (e.g., 'partial' votes count as agreement) */
  allowPartial?: boolean;
}

/**
 * Unanimous consensus strategy
 *
 * Requires 100% of models to agree for a 'verified' or 'rejected' verdict.
 * Any disagreement results in 'disputed' verdict. Most conservative approach.
 *
 * @example
 * ```typescript
 * const strategy = new UnanimousStrategy({ minVotes: 3 });
 * const result = strategy.apply(votes);
 * // Only returns 'verified' if ALL models agree
 * ```
 */
export class UnanimousStrategy {
  private readonly config: Required<UnanimousStrategyConfig>;

  constructor(config: UnanimousStrategyConfig = {}) {
    this.config = {
      minVotes: config.minVotes ?? 2,
      humanReviewThreshold: config.humanReviewThreshold ?? 0.6,
      allowPartial: config.allowPartial ?? false,
    };
  }

  /**
   * Apply unanimous voting to model votes
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

    // Check for unanimous agreement
    const agreeCount = validVotes.filter(v => this.countsAsAgreement(v)).length;
    const disagreeCount = validVotes.filter(v => !this.countsAsAgreement(v)).length;
    const totalCount = validVotes.length;
    const agreementRatio = agreeCount / totalCount;

    // Calculate average confidence
    const avgConfidence = validVotes.reduce((sum, v) => sum + v.confidence, 0) / totalCount;

    // Determine verdict - must be unanimous
    let verdict: ConsensusVerdict;
    if (agreeCount === totalCount) {
      verdict = 'verified';
    } else if (disagreeCount === totalCount) {
      verdict = 'rejected';
    } else {
      verdict = 'disputed';
    }

    // Synthesize reasoning
    const reasoning = this.synthesizeReasoning(
      validVotes,
      agreeCount,
      disagreeCount,
      totalCount
    );

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
   * Determine if a vote counts as agreement
   */
  private countsAsAgreement(vote: ModelVote): boolean {
    if (vote.agrees) {
      return true;
    }
    // Optionally count 'partial' assessments as agreement
    if (this.config.allowPartial && vote.assessment === 'partial') {
      return true;
    }
    return false;
  }

  /**
   * Synthesize reasoning from all votes
   */
  private synthesizeReasoning(
    votes: ModelVote[],
    agreeCount: number,
    disagreeCount: number,
    totalCount: number
  ): string {
    const parts: string[] = [];

    // Determine consensus type
    if (agreeCount === totalCount) {
      parts.push(`Unanimous agreement: all ${totalCount} models confirm the finding.`);
    } else if (disagreeCount === totalCount) {
      parts.push(`Unanimous rejection: all ${totalCount} models reject the finding.`);
    } else {
      parts.push(
        `No unanimous consensus: ${agreeCount} agree, ${disagreeCount} disagree out of ${totalCount} votes.`
      );
    }

    // List all assessments
    parts.push('\nIndividual assessments:');
    votes.forEach(v => {
      const status = this.countsAsAgreement(v) ? '✓ agrees' : '✗ disagrees';
      const confidence = `${(v.confidence * 100).toFixed(0)}%`;
      parts.push(`- ${v.modelId} (${confidence}, ${status}): ${v.reasoning}`);
    });

    // Add warning if not unanimous
    if (agreeCount !== totalCount && disagreeCount !== totalCount) {
      parts.push(
        '\n⚠️ Unanimous consensus required but not achieved. Human review recommended.'
      );
    }

    return parts.join('\n');
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<UnanimousStrategyConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<UnanimousStrategyConfig>): void {
    Object.assign(this.config, config);
  }
}

/**
 * Create a unanimous consensus strategy
 *
 * @param config - Optional strategy configuration
 * @returns Unanimous strategy instance
 */
export function createUnanimousStrategy(
  config?: UnanimousStrategyConfig
): UnanimousStrategy {
  return new UnanimousStrategy(config);
}
