/**
 * Agentic QE v3 - Tier Recommender
 * ADR-051: Multi-Model Router - Tier Recommendation
 *
 * Recommends optimal model tier based on complexity scores.
 * Provides:
 * - Primary tier recommendation
 * - Alternative tier suggestions
 * - Human-readable explanations
 *
 * @module integrations/agentic-flow/model-router/tier-recommender
 */

import type { ModelTier, ComplexitySignals } from './types';
import { TIER_METADATA } from './types';

// ============================================================================
// Tier Recommender Interface
// ============================================================================

/**
 * Interface for tier recommendation
 */
export interface ITierRecommender {
  /**
   * Get recommended tier based on complexity score
   */
  getRecommendedTier(complexity: number): ModelTier;

  /**
   * Find alternative tiers that could handle this task
   */
  findAlternateTiers(complexity: number, recommendedTier: ModelTier): ModelTier[];

  /**
   * Generate human-readable explanation
   */
  generateExplanation(
    overall: number,
    tier: ModelTier,
    signals: ComplexitySignals
  ): string;
}

// ============================================================================
// Tier Recommender Implementation
// ============================================================================

/**
 * Recommends optimal model tier based on complexity
 */
export class TierRecommender implements ITierRecommender {
  /**
   * Get recommended tier based on complexity score
   */
  getRecommendedTier(complexity: number): ModelTier {
    // Check each tier's complexity range
    for (const tier of [0, 1, 2, 3, 4] as ModelTier[]) {
      const [min, max] = TIER_METADATA[tier].complexityRange;
      if (complexity >= min && complexity <= max) {
        return tier;
      }
    }

    // Default to Tier 2 (Sonnet) if no match
    return 2;
  }

  /**
   * Find alternative tiers that could handle this task
   */
  findAlternateTiers(complexity: number, recommendedTier: ModelTier): ModelTier[] {
    const alternatives: ModelTier[] = [];

    // Add adjacent tiers
    if (recommendedTier > 0) {
      alternatives.push((recommendedTier - 1) as ModelTier);
    }
    if (recommendedTier < 4) {
      alternatives.push((recommendedTier + 1) as ModelTier);
    }

    // Add tier that can definitely handle it (higher tier)
    if (recommendedTier < 3 && !alternatives.includes(4)) {
      alternatives.push(4);
    }

    return alternatives;
  }

  /**
   * Generate human-readable explanation
   */
  generateExplanation(
    overall: number,
    tier: ModelTier,
    signals: ComplexitySignals
  ): string {
    const parts: string[] = [];

    parts.push(`Complexity score: ${overall}/100 (Tier ${tier})`);

    // Add mechanical transform info
    if (signals.isMechanicalTransform) {
      parts.push(this.formatMechanicalTransformInfo(signals.detectedTransformType));
    }

    // Add scope-related explanations
    parts.push(...this.formatScopeExplanations(signals));

    // Add code metrics if significant
    parts.push(...this.formatCodeMetricsExplanations(signals));

    return parts.join('. ');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Format mechanical transform information
   */
  private formatMechanicalTransformInfo(transformType?: string): string {
    return `Detected mechanical transform: ${transformType}`;
  }

  /**
   * Format scope-related explanations
   */
  private formatScopeExplanations(signals: ComplexitySignals): string[] {
    const explanations: string[] = [];

    if (signals.hasArchitectureScope) {
      explanations.push('Architecture scope detected');
    }

    if (signals.hasSecurityScope) {
      explanations.push('Security scope detected');
    }

    if (signals.requiresMultiStepReasoning) {
      explanations.push('Multi-step reasoning required');
    }

    if (signals.requiresCrossDomainCoordination) {
      explanations.push('Cross-domain coordination required');
    }

    return explanations;
  }

  /**
   * Format code metrics explanations
   */
  private formatCodeMetricsExplanations(signals: ComplexitySignals): string[] {
    const explanations: string[] = [];

    if (signals.linesOfCode !== undefined && signals.linesOfCode > 100) {
      explanations.push(`Large code change: ${signals.linesOfCode} lines`);
    }

    if (signals.fileCount !== undefined && signals.fileCount > 3) {
      explanations.push(`Multi-file change: ${signals.fileCount} files`);
    }

    return explanations;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a tier recommender instance
 */
export function createTierRecommender(): TierRecommender {
  return new TierRecommender();
}
