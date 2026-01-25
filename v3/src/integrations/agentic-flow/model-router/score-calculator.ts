/**
 * Agentic QE v3 - Score Calculator
 * ADR-051: Multi-Model Router - Complexity Score Calculation
 *
 * Calculates complexity scores from collected signals.
 * Computes:
 * - Code complexity (lines, files, cyclomatic)
 * - Reasoning complexity (keywords, multi-step)
 * - Scope complexity (architecture, security)
 * - Overall weighted complexity
 * - Confidence assessment
 *
 * @module integrations/agentic-flow/model-router/score-calculator
 */

import type { ComplexitySignals, RoutingInput } from './types';

// ============================================================================
// Score Calculator Interface
// ============================================================================

/**
 * Interface for calculating complexity scores
 */
export interface IScoreCalculator {
  /**
   * Calculate code complexity component (0-100)
   */
  calculateCodeComplexity(signals: ComplexitySignals): number;

  /**
   * Calculate reasoning complexity component (0-100)
   */
  calculateReasoningComplexity(signals: ComplexitySignals): number;

  /**
   * Calculate scope complexity component (0-100)
   */
  calculateScopeComplexity(signals: ComplexitySignals): number;

  /**
   * Calculate overall complexity score (0-100)
   */
  calculateOverallComplexity(
    codeComplexity: number,
    reasoningComplexity: number,
    scopeComplexity: number,
    signals: ComplexitySignals
  ): number;

  /**
   * Calculate confidence in complexity assessment (0-1)
   */
  calculateConfidence(signals: ComplexitySignals, input: RoutingInput): number;
}

// ============================================================================
// Score Calculator Implementation
// ============================================================================

/**
 * Calculates complexity scores from signals
 */
export class ScoreCalculator implements IScoreCalculator {
  /**
   * Calculate code complexity component (0-100)
   */
  calculateCodeComplexity(signals: ComplexitySignals): number {
    let score = 0;

    score += this.calculateLinesOfCodeContribution(signals.linesOfCode);
    score += this.calculateFileCountContribution(signals.fileCount);
    score += this.calculateCyclomaticContribution(signals.cyclomaticComplexity);
    score += this.calculateLanguageContribution(signals.languageComplexity);

    return Math.min(score, 100);
  }

  /**
   * Calculate reasoning complexity component (0-100)
   */
  calculateReasoningComplexity(signals: ComplexitySignals): number {
    let score = 0;

    // Keyword-based scoring
    score += this.calculateKeywordScore(signals.keywordMatches);

    // Multi-step reasoning (0-20 points)
    if (signals.requiresMultiStepReasoning) score += 20;

    // Creativity requirements (0-20 points)
    if (signals.requiresCreativity) score += 20;

    return Math.min(score, 100);
  }

  /**
   * Calculate scope complexity component (0-100)
   */
  calculateScopeComplexity(signals: ComplexitySignals): number {
    let score = 0;

    // Architecture scope (0-40 points)
    if (signals.hasArchitectureScope) score += 40;

    // Security scope (0-30 points)
    if (signals.hasSecurityScope) score += 30;

    // Cross-domain coordination (0-20 points)
    if (signals.requiresCrossDomainCoordination) score += 20;

    // Dependency count (0-10 points)
    score += this.calculateDependencyContribution(signals.dependencyCount);

    return Math.min(score, 100);
  }

  /**
   * Calculate overall complexity score (0-100)
   */
  calculateOverallComplexity(
    codeComplexity: number,
    reasoningComplexity: number,
    scopeComplexity: number,
    signals: ComplexitySignals
  ): number {
    // Mechanical transforms always score 0-10
    if (signals.isMechanicalTransform) {
      return 5;
    }

    // Weighted average: code (30%), reasoning (40%), scope (30%)
    const weighted =
      codeComplexity * 0.3 + reasoningComplexity * 0.4 + scopeComplexity * 0.3;

    return Math.min(Math.round(weighted), 100);
  }

  /**
   * Calculate confidence in complexity assessment (0-1)
   */
  calculateConfidence(signals: ComplexitySignals, input: RoutingInput): number {
    let confidence = 0.5; // Base confidence

    // More confidence if code context provided
    if (input.codeContext) confidence += 0.2;

    // More confidence if file paths provided
    if (input.filePaths && input.filePaths.length > 0) confidence += 0.1;

    // More confidence if strong keyword matches
    confidence += this.calculateKeywordConfidenceBoost(signals.keywordMatches);

    // More confidence for Agent Booster detections
    if (signals.isMechanicalTransform) confidence += 0.15;

    return Math.min(confidence, 1);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Calculate lines of code contribution (0-30 points)
   */
  private calculateLinesOfCodeContribution(linesOfCode?: number): number {
    if (linesOfCode === undefined) return 0;
    if (linesOfCode < 10) return 0;
    if (linesOfCode < 50) return 10;
    if (linesOfCode < 200) return 20;
    return 30;
  }

  /**
   * Calculate file count contribution (0-20 points)
   */
  private calculateFileCountContribution(fileCount?: number): number {
    if (fileCount === undefined) return 0;
    if (fileCount === 1) return 0;
    if (fileCount < 5) return 10;
    return 20;
  }

  /**
   * Calculate cyclomatic complexity contribution (0-30 points)
   */
  private calculateCyclomaticContribution(cyclomaticComplexity?: number): number {
    if (cyclomaticComplexity === undefined) return 0;
    if (cyclomaticComplexity < 5) return 0;
    if (cyclomaticComplexity < 10) return 10;
    if (cyclomaticComplexity < 20) return 20;
    return 30;
  }

  /**
   * Calculate language complexity contribution (0-20 points)
   */
  private calculateLanguageContribution(
    languageComplexity?: 'low' | 'medium' | 'high'
  ): number {
    if (languageComplexity === 'low') return 0;
    if (languageComplexity === 'medium') return 10;
    if (languageComplexity === 'high') return 20;
    return 0;
  }

  /**
   * Calculate keyword score (0-60 points)
   */
  private calculateKeywordScore(keywordMatches: {
    readonly simple: string[];
    readonly moderate: string[];
    readonly complex: string[];
    readonly critical: string[];
  }): number {
    const keywordScore =
      keywordMatches.simple.length * 5 +
      keywordMatches.moderate.length * 15 +
      keywordMatches.complex.length * 25 +
      keywordMatches.critical.length * 35;

    return Math.min(keywordScore, 60);
  }

  /**
   * Calculate dependency count contribution (0-10 points)
   */
  private calculateDependencyContribution(dependencyCount?: number): number {
    if (dependencyCount === undefined) return 0;
    if (dependencyCount < 3) return 0;
    if (dependencyCount < 10) return 5;
    return 10;
  }

  /**
   * Calculate confidence boost from keyword matches (0-0.1)
   */
  private calculateKeywordConfidenceBoost(keywordMatches: {
    readonly simple: string[];
    readonly moderate: string[];
    readonly complex: string[];
    readonly critical: string[];
  }): number {
    const totalKeywords =
      keywordMatches.simple.length +
      keywordMatches.moderate.length +
      keywordMatches.complex.length +
      keywordMatches.critical.length;

    if (totalKeywords >= 3) return 0.1;
    if (totalKeywords >= 1) return 0.05;
    return 0;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a score calculator instance
 */
export function createScoreCalculator(): ScoreCalculator {
  return new ScoreCalculator();
}
