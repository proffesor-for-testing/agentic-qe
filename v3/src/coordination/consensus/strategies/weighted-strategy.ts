/**
 * Agentic QE v3 - Weighted Consensus Strategy
 * MM-008: Confidence-weighted voting for consensus verification
 *
 * Implements confidence-weighted voting where each vote is weighted
 * by the model's confidence level. This gives more influence to
 * models that are more certain about their assessment.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import { ModelVote, ConsensusVerdict } from '../interfaces';
import { ConsensusStrategyResult } from './majority-strategy';

/**
 * Configuration for weighted strategy
 */
export interface WeightedStrategyConfig {
  /** Minimum votes required to avoid 'insufficient' verdict */
  minVotes?: number;

  /** Confidence threshold below which human review is required */
  humanReviewThreshold?: number;

  /** Weighted agreement threshold (default 0.6 for confidence-weighted majority) */
  agreementThreshold?: number;

  /** Minimum confidence for a vote to be counted (filter out low-confidence votes) */
  minConfidence?: number;
}

/**
 * Confidence-weighted consensus strategy
 *
 * Weights each vote by its confidence level, giving more influence
 * to high-confidence assessments. Useful when model certainty varies.
 *
 * @example
 * ```typescript
 * const strategy = new WeightedStrategy({ agreementThreshold: 0.7 });
 * const result = strategy.apply(votes);
 * // Higher-confidence votes have more weight
 * ```
 */
export class WeightedStrategy {
  private readonly config: Required<WeightedStrategyConfig>;

  constructor(config: WeightedStrategyConfig = {}) {
    this.config = {
      minVotes: config.minVotes ?? 2,
      humanReviewThreshold: config.humanReviewThreshold ?? 0.6,
      agreementThreshold: config.agreementThreshold ?? 0.6,
      minConfidence: config.minConfidence ?? 0.3,
    };
  }

  /**
   * Apply weighted voting to model votes
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

    // Filter out error votes and low-confidence votes
    const validVotes = votes.filter(
      v => !v.error && v.confidence >= this.config.minConfidence
    );

    if (validVotes.length === 0) {
      return {
        verdict: 'error',
        confidence: 0,
        agreementRatio: 0,
        reasoning: 'No valid votes available (all errors or below confidence threshold)',
        requiresHumanReview: true,
      };
    }

    // Calculate weighted agreement
    const totalWeight = validVotes.reduce((sum, v) => sum + v.confidence, 0);
    const agreeWeight = validVotes
      .filter(v => v.agrees)
      .reduce((sum, v) => sum + v.confidence, 0);

    const weightedAgreementRatio = agreeWeight / totalWeight;

    // Calculate confidence-weighted average
    const weightedConfidence = validVotes.reduce(
      (sum, v) => sum + v.confidence * v.confidence,
      0
    ) / totalWeight;

    // Determine verdict based on weighted agreement
    let verdict: ConsensusVerdict;
    if (weightedAgreementRatio >= this.config.agreementThreshold) {
      verdict = 'verified';
    } else if (weightedAgreementRatio <= (1 - this.config.agreementThreshold)) {
      verdict = 'rejected';
    } else {
      verdict = 'disputed';
    }

    // Synthesize reasoning
    const reasoning = this.synthesizeReasoning(
      validVotes,
      agreeWeight,
      totalWeight,
      weightedAgreementRatio
    );

    // Determine if human review is needed
    const requiresHumanReview =
      weightedConfidence < this.config.humanReviewThreshold ||
      verdict === 'disputed' ||
      validVotes.length < votes.length; // Some votes were filtered

    return {
      verdict,
      confidence: weightedConfidence,
      agreementRatio: weightedAgreementRatio,
      reasoning,
      requiresHumanReview,
    };
  }

  /**
   * Synthesize reasoning from weighted votes
   */
  private synthesizeReasoning(
    votes: ModelVote[],
    agreeWeight: number,
    totalWeight: number,
    ratio: number
  ): string {
    const parts: string[] = [];

    // Summary with weights
    parts.push(
      `Weighted consensus: ${(ratio * 100).toFixed(1)}% agreement ` +
      `(${agreeWeight.toFixed(2)} agree weight / ${totalWeight.toFixed(2)} total weight)`
    );

    // Sort by confidence (highest first)
    const sortedVotes = [...votes].sort((a, b) => b.confidence - a.confidence);

    // High-confidence votes
    const highConfVotes = sortedVotes.filter(v => v.confidence >= 0.8);
    if (highConfVotes.length > 0) {
      parts.push('\nHigh-confidence assessments (≥80%):');
      highConfVotes.forEach(v => {
        parts.push(
          `- ${v.modelId} (${(v.confidence * 100).toFixed(0)}%, ` +
          `${v.agrees ? 'agrees' : 'disagrees'}): ${v.reasoning}`
        );
      });
    }

    // Medium-confidence votes
    const medConfVotes = sortedVotes.filter(
      v => v.confidence >= 0.5 && v.confidence < 0.8
    );
    if (medConfVotes.length > 0) {
      parts.push('\nMedium-confidence assessments (50-79%):');
      medConfVotes.forEach(v => {
        parts.push(
          `- ${v.modelId} (${(v.confidence * 100).toFixed(0)}%, ` +
          `${v.agrees ? 'agrees' : 'disagrees'}): ${v.reasoning.substring(0, 100)}...`
        );
      });
    }

    return parts.join('\n');
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<WeightedStrategyConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WeightedStrategyConfig>): void {
    Object.assign(this.config, config);
  }
}

/**
 * Create a weighted consensus strategy
 *
 * @param config - Optional strategy configuration
 * @returns Weighted strategy instance
 */
export function createWeightedStrategy(
  config?: WeightedStrategyConfig
): WeightedStrategy {
  return new WeightedStrategy(config);
}
