/**
 * Quality Score Calculator
 * ADR-023: Quality Feedback Loop System
 *
 * Calculates comprehensive quality scores from multiple dimensions.
 */

import type {
  QualityScore,
  QualityDimensions,
  QualityWeights,
  TestOutcome,
  CoverageMetrics,
} from './types.js';
import { DEFAULT_QUALITY_WEIGHTS } from './types.js';

// ============================================================================
// Quality Score Calculator
// ============================================================================

/**
 * Calculates quality scores from test outcomes and metrics
 */
export class QualityScoreCalculator {
  private weights: QualityWeights;
  private historicalScores: number[] = [];
  private readonly maxHistory: number;

  constructor(weights: Partial<QualityWeights> = {}, maxHistory = 100) {
    this.weights = { ...DEFAULT_QUALITY_WEIGHTS, ...weights };
    this.maxHistory = maxHistory;
  }

  /**
   * Calculate quality score from a test outcome
   */
  calculateFromOutcome(outcome: TestOutcome): QualityScore {
    const dimensions = this.calculateDimensions(outcome);
    const overall = this.calculateOverall(dimensions);

    // Track for trend analysis
    this.trackScore(overall);

    return {
      overall,
      dimensions,
      weights: this.weights,
      trend: this.calculateTrend(),
      calculatedAt: new Date(),
    };
  }

  /**
   * Calculate quality dimensions from outcome
   */
  private calculateDimensions(outcome: TestOutcome): QualityDimensions {
    return {
      effectiveness: this.calculateEffectiveness(outcome),
      coverage: this.calculateCoverageScore(outcome.coverage),
      mutationKill: outcome.mutationScore ?? 0.5,
      stability: this.calculateStability(outcome),
      maintainability: outcome.maintainabilityScore,
      performance: this.calculatePerformanceScore(outcome.executionTimeMs),
    };
  }

  /**
   * Calculate effectiveness (pass rate without flakiness)
   */
  private calculateEffectiveness(outcome: TestOutcome): number {
    if (!outcome.passed) return 0;
    if (outcome.flaky) return 0.3;
    return 1.0;
  }

  /**
   * Calculate coverage score (normalized 0-1)
   */
  private calculateCoverageScore(coverage: CoverageMetrics): number {
    // Weighted average of coverage metrics
    return (
      coverage.lines * 0.4 +
      coverage.branches * 0.35 +
      coverage.functions * 0.25
    ) / 100;
  }

  /**
   * Calculate stability score (inverse of flakiness)
   */
  private calculateStability(outcome: TestOutcome): number {
    if (outcome.flaky) return 0.2;
    if (outcome.flakinessScore !== undefined) {
      return 1 - outcome.flakinessScore;
    }
    return 1.0;
  }

  /**
   * Calculate performance score based on execution time
   */
  private calculatePerformanceScore(executionTimeMs: number): number {
    // Thresholds for performance scoring
    const EXCELLENT = 100;   // <100ms = 1.0
    const GOOD = 500;        // <500ms = 0.8
    const ACCEPTABLE = 2000; // <2s = 0.6
    const SLOW = 5000;       // <5s = 0.4
    const VERY_SLOW = 10000; // <10s = 0.2

    if (executionTimeMs < EXCELLENT) return 1.0;
    if (executionTimeMs < GOOD) return 0.8;
    if (executionTimeMs < ACCEPTABLE) return 0.6;
    if (executionTimeMs < SLOW) return 0.4;
    if (executionTimeMs < VERY_SLOW) return 0.2;
    return 0.1;
  }

  /**
   * Calculate overall quality score from dimensions
   */
  private calculateOverall(dimensions: QualityDimensions): number {
    return (
      this.weights.effectiveness * dimensions.effectiveness +
      this.weights.coverage * dimensions.coverage +
      this.weights.mutationKill * dimensions.mutationKill +
      this.weights.stability * dimensions.stability +
      this.weights.maintainability * dimensions.maintainability +
      this.weights.performance * dimensions.performance
    );
  }

  /**
   * Track score for trend analysis
   */
  private trackScore(score: number): void {
    this.historicalScores.push(score);
    if (this.historicalScores.length > this.maxHistory) {
      this.historicalScores = this.historicalScores.slice(-this.maxHistory);
    }
  }

  /**
   * Calculate quality trend
   */
  private calculateTrend(): 'improving' | 'stable' | 'declining' {
    if (this.historicalScores.length < 10) return 'stable';

    const recent = this.historicalScores.slice(-10);
    const older = this.historicalScores.slice(-20, -10);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const diff = recentAvg - olderAvg;

    if (diff > 0.05) return 'improving';
    if (diff < -0.05) return 'declining';
    return 'stable';
  }

  /**
   * Calculate aggregate quality score from multiple outcomes
   */
  calculateAggregate(outcomes: TestOutcome[]): QualityScore {
    if (outcomes.length === 0) {
      return {
        overall: 0,
        dimensions: {
          effectiveness: 0,
          coverage: 0,
          mutationKill: 0,
          stability: 0,
          maintainability: 0,
          performance: 0,
        },
        weights: this.weights,
        trend: 'stable',
        calculatedAt: new Date(),
      };
    }

    // Calculate average dimensions
    const dimensionSums: QualityDimensions = {
      effectiveness: 0,
      coverage: 0,
      mutationKill: 0,
      stability: 0,
      maintainability: 0,
      performance: 0,
    };

    for (const outcome of outcomes) {
      const dims = this.calculateDimensions(outcome);
      dimensionSums.effectiveness += dims.effectiveness;
      dimensionSums.coverage += dims.coverage;
      dimensionSums.mutationKill += dims.mutationKill;
      dimensionSums.stability += dims.stability;
      dimensionSums.maintainability += dims.maintainability;
      dimensionSums.performance += dims.performance;
    }

    const count = outcomes.length;
    const avgDimensions: QualityDimensions = {
      effectiveness: dimensionSums.effectiveness / count,
      coverage: dimensionSums.coverage / count,
      mutationKill: dimensionSums.mutationKill / count,
      stability: dimensionSums.stability / count,
      maintainability: dimensionSums.maintainability / count,
      performance: dimensionSums.performance / count,
    };

    const overall = this.calculateOverall(avgDimensions);

    return {
      overall,
      dimensions: avgDimensions,
      weights: this.weights,
      trend: this.calculateTrend(),
      calculatedAt: new Date(),
    };
  }

  /**
   * Calculate delta between two quality scores
   */
  calculateDelta(before: QualityScore, after: QualityScore): {
    overallDelta: number;
    dimensionDeltas: Record<keyof QualityDimensions, number>;
    improved: boolean;
  } {
    const dimensionDeltas: Record<keyof QualityDimensions, number> = {
      effectiveness: after.dimensions.effectiveness - before.dimensions.effectiveness,
      coverage: after.dimensions.coverage - before.dimensions.coverage,
      mutationKill: after.dimensions.mutationKill - before.dimensions.mutationKill,
      stability: after.dimensions.stability - before.dimensions.stability,
      maintainability: after.dimensions.maintainability - before.dimensions.maintainability,
      performance: after.dimensions.performance - before.dimensions.performance,
    };

    const overallDelta = after.overall - before.overall;

    return {
      overallDelta,
      dimensionDeltas,
      improved: overallDelta > 0,
    };
  }

  /**
   * Get recommendations based on quality score
   */
  getRecommendations(score: QualityScore): string[] {
    const recommendations: string[] = [];
    const dims = score.dimensions;

    if (dims.effectiveness < 0.8) {
      recommendations.push('Improve test pass rate - investigate failing tests');
    }
    if (dims.coverage < 0.7) {
      recommendations.push('Increase code coverage - target uncovered paths');
    }
    if (dims.mutationKill < 0.6) {
      recommendations.push('Strengthen assertions - tests may be too weak');
    }
    if (dims.stability < 0.9) {
      recommendations.push('Address test flakiness - stabilize intermittent tests');
    }
    if (dims.maintainability < 0.7) {
      recommendations.push('Improve test maintainability - reduce complexity');
    }
    if (dims.performance < 0.6) {
      recommendations.push('Optimize test performance - reduce execution time');
    }

    if (recommendations.length === 0) {
      recommendations.push('Quality is excellent - maintain current practices');
    }

    return recommendations;
  }

  /**
   * Update weights
   */
  updateWeights(newWeights: Partial<QualityWeights>): void {
    this.weights = { ...this.weights, ...newWeights };
  }

  /**
   * Get current weights
   */
  getWeights(): QualityWeights {
    return { ...this.weights };
  }

  /**
   * Get statistics
   */
  getStats(): {
    scoresTracked: number;
    currentTrend: 'improving' | 'stable' | 'declining';
    avgRecentScore: number;
  } {
    const recent = this.historicalScores.slice(-10);
    const avgRecentScore = recent.length > 0
      ? recent.reduce((a, b) => a + b, 0) / recent.length
      : 0;

    return {
      scoresTracked: this.historicalScores.length,
      currentTrend: this.calculateTrend(),
      avgRecentScore,
    };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.historicalScores = [];
  }
}

/**
 * Create a new quality score calculator
 */
export function createQualityScoreCalculator(
  weights?: Partial<QualityWeights>,
  maxHistory?: number
): QualityScoreCalculator {
  return new QualityScoreCalculator(weights, maxHistory);
}
