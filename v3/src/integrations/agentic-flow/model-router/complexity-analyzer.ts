/**
 * Agentic QE v3 - Task Complexity Analyzer
 * ADR-051: Multi-Model Router - Complexity Assessment
 *
 * Analyzes task complexity to determine optimal model tier routing.
 * Uses dependency injection for:
 * - Signal collection (ISignalCollector)
 * - Score calculation (IScoreCalculator)
 * - Tier recommendation (ITierRecommender)
 *
 * @module integrations/agentic-flow/model-router/complexity-analyzer
 */

import type {
  IComplexityAnalyzer,
  ComplexityScore,
  RoutingInput,
  ModelTier,
  ModelRouterConfig,
} from './types';
import { ComplexityAnalysisError } from './types';
import type { TransformType, IAgentBoosterAdapter } from '../agent-booster/types';
import type { ISignalCollector } from './signal-collector';
import type { IScoreCalculator } from './score-calculator';
import type { ITierRecommender } from './tier-recommender';
import { SignalCollector } from './signal-collector';
import { ScoreCalculator } from './score-calculator';
import { TierRecommender } from './tier-recommender';

// ============================================================================
// Complexity Analyzer Implementation
// ============================================================================

/**
 * Analyzes task complexity to recommend optimal model tier.
 * Uses dependency injection for testability and modularity.
 */
export class ComplexityAnalyzer implements IComplexityAnalyzer {
  private readonly config: ModelRouterConfig;
  private readonly signalCollector: ISignalCollector;
  private readonly scoreCalculator: IScoreCalculator;
  private readonly tierRecommender: ITierRecommender;

  constructor(
    config: ModelRouterConfig,
    signalCollector: ISignalCollector,
    scoreCalculator: IScoreCalculator,
    tierRecommender: ITierRecommender
  ) {
    this.config = config;
    this.signalCollector = signalCollector;
    this.scoreCalculator = scoreCalculator;
    this.tierRecommender = tierRecommender;
  }

  /**
   * Analyze task complexity
   */
  async analyze(input: RoutingInput): Promise<ComplexityScore> {
    try {
      // Collect complexity signals
      const signals = await this.signalCollector.collectSignals(input);

      // Calculate component scores
      const codeComplexity = this.scoreCalculator.calculateCodeComplexity(signals);
      const reasoningComplexity = this.scoreCalculator.calculateReasoningComplexity(signals);
      const scopeComplexity = this.scoreCalculator.calculateScopeComplexity(signals);

      // Calculate overall complexity (weighted average)
      const overall = this.scoreCalculator.calculateOverallComplexity(
        codeComplexity,
        reasoningComplexity,
        scopeComplexity,
        signals
      );

      // Determine recommended tier
      const recommendedTier = this.tierRecommender.getRecommendedTier(overall);

      // Find alternative tiers
      const alternateTiers = this.tierRecommender.findAlternateTiers(overall, recommendedTier);

      // Calculate confidence based on signal quality
      const confidence = this.scoreCalculator.calculateConfidence(signals, input);

      // Generate explanation
      const explanation = this.tierRecommender.generateExplanation(
        overall,
        recommendedTier,
        signals
      );

      return {
        overall,
        codeComplexity,
        reasoningComplexity,
        scopeComplexity,
        confidence,
        signals,
        recommendedTier,
        alternateTiers,
        explanation,
      };
    } catch (error) {
      throw new ComplexityAnalysisError(
        `Failed to analyze task complexity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if task is eligible for Agent Booster (Tier 0)
   */
  async checkAgentBoosterEligibility(
    input: RoutingInput
  ): Promise<{
    eligible: boolean;
    transformType?: TransformType;
    confidence: number;
    reason: string;
  }> {
    return this.signalCollector.checkAgentBoosterEligibility(input);
  }

  /**
   * Get recommended tier based on complexity score
   */
  getRecommendedTier(complexity: number): ModelTier {
    return this.tierRecommender.getRecommendedTier(complexity);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a complexity analyzer instance with default dependencies
 */
export function createComplexityAnalyzer(
  config: ModelRouterConfig,
  agentBoosterAdapter?: IAgentBoosterAdapter
): ComplexityAnalyzer {
  const signalCollector = new SignalCollector(config, agentBoosterAdapter);
  const scoreCalculator = new ScoreCalculator();
  const tierRecommender = new TierRecommender();

  return new ComplexityAnalyzer(
    config,
    signalCollector,
    scoreCalculator,
    tierRecommender
  );
}

/**
 * Create a complexity analyzer instance with custom dependencies (for testing)
 */
export function createComplexityAnalyzerWithDependencies(
  config: ModelRouterConfig,
  signalCollector: ISignalCollector,
  scoreCalculator: IScoreCalculator,
  tierRecommender: ITierRecommender
): ComplexityAnalyzer {
  return new ComplexityAnalyzer(
    config,
    signalCollector,
    scoreCalculator,
    tierRecommender
  );
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { SignalCollector, createSignalCollector } from './signal-collector';
export { ScoreCalculator, createScoreCalculator } from './score-calculator';
export { TierRecommender, createTierRecommender } from './tier-recommender';
export type { ISignalCollector } from './signal-collector';
export type { IScoreCalculator } from './score-calculator';
export type { ITierRecommender } from './tier-recommender';
