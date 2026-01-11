/**
 * Agentic QE v3 - Early Exit Decision Engine
 * ADR-033: Lambda-stability decisions with speculative execution
 *
 * This module implements the CoherenceEarlyExit class that evaluates
 * whether to exit early from test pyramid execution based on quality signals.
 */

import {
  EarlyExitConfig,
  EarlyExitDecision,
  ExitReason,
  QualitySignal,
  QualityFlags,
  DEFAULT_EXIT_CONFIG,
} from './types';
import { calculateLambdaStability, calculateConfidence } from './quality-signal';

// ============================================================================
// Coherence Early Exit Class
// ============================================================================

/**
 * CoherenceEarlyExit - Main decision engine for early exit testing
 *
 * Uses lambda stability instead of learned classifiers:
 * - High lambda + stable lambda-delta = confident exit
 * - Low lambda or volatile lambda-delta = continue to deeper layers
 *
 * @example
 * ```typescript
 * const earlyExit = new CoherenceEarlyExit(DEFAULT_EXIT_CONFIG, 4);
 *
 * // After each layer execution
 * const signal = calculateQualitySignal(layerResult, previousSignal);
 * const decision = earlyExit.shouldExit(signal, currentLayer);
 *
 * if (decision.canExit) {
 *   console.log(`Early exit at layer ${decision.exitLayer}: ${decision.explanation}`);
 * }
 * ```
 */
export class CoherenceEarlyExit {
  private readonly config: EarlyExitConfig;
  private readonly totalLayers: number;
  private signalHistory: QualitySignal[] = [];
  private decisionHistory: EarlyExitDecision[] = [];

  constructor(config: Partial<EarlyExitConfig> = {}, totalLayers: number) {
    this.config = { ...DEFAULT_EXIT_CONFIG, ...config };
    this.totalLayers = totalLayers;
  }

  /**
   * Evaluate whether to exit early at the given layer
   *
   * @param signal - Quality signal from current layer
   * @param layer - Current layer index (0-indexed)
   * @returns Decision on whether to exit early
   */
  shouldExit(signal: QualitySignal, layer: number): EarlyExitDecision {
    // Store signal in history
    this.signalHistory.push(signal);

    // Get previous signal for stability calculation
    const previousSignal = this.signalHistory.length > 1
      ? this.signalHistory[this.signalHistory.length - 2]
      : undefined;

    // Calculate lambda stability
    const stability = calculateLambdaStability(signal, previousSignal);

    // Check for force continue flags
    if (signal.flags & QualityFlags.FORCE_CONTINUE) {
      const decision = this.createDecision(
        false,
        0,
        layer,
        'forced_continue',
        false,
        'Force continue flag set - critical condition detected',
        stability,
        signal.lambda
      );
      this.decisionHistory.push(decision);
      return decision;
    }

    // Determine target exit layer (adaptive or fixed)
    const targetExitLayer = this.config.adaptiveExitLayer
      ? this.calculateAdaptiveExitLayer(signal, stability)
      : this.config.exitLayer;

    // Not at target layer yet
    if (layer < targetExitLayer) {
      const decision = this.createDecision(
        false,
        0,
        targetExitLayer,
        'forced_continue',
        false,
        `Layer ${layer} < target ${targetExitLayer}, continuing to deeper layers`,
        stability,
        signal.lambda
      );
      this.decisionHistory.push(decision);
      return decision;
    }

    // At or past target layer - evaluate conditions
    const decision = this.evaluateExitConditions(signal, layer, stability);
    this.decisionHistory.push(decision);
    return decision;
  }

  /**
   * Calculate adaptive exit layer based on lambda stability
   *
   * Higher stability allows exiting earlier in the pyramid.
   */
  private calculateAdaptiveExitLayer(signal: QualitySignal, stability: number): number {
    // Very high stability + good lambda = exit very early
    if (stability >= 0.92 && signal.lambda >= this.config.minLambdaForExit) {
      return Math.max(this.config.exitLayer - 1, 0);
    }

    // Moderately stable = exit at configured layer
    if (stability >= 0.75 && signal.lambda >= this.config.minLambdaForExit * 0.9) {
      return this.config.exitLayer;
    }

    // Less stable or lower lambda = exit later
    if (stability >= 0.5) {
      return Math.min(this.config.exitLayer + 1, this.totalLayers - 1);
    }

    // Very unstable = run all layers
    return this.totalLayers - 1;
  }

  /**
   * Evaluate all exit conditions and make decision
   */
  private evaluateExitConditions(
    signal: QualitySignal,
    layer: number,
    stability: number
  ): EarlyExitDecision {
    // Check for critical flags that override normal decision
    if (signal.flags & QualityFlags.CRITICAL_FAILURE) {
      return this.createDecision(
        false,
        0,
        layer,
        'critical_failure',
        false,
        'Critical failure detected - cannot exit early',
        stability,
        signal.lambda
      );
    }

    if (signal.flags & QualityFlags.COVERAGE_REGRESSION) {
      return this.createDecision(
        false,
        0,
        layer,
        'coverage_regression',
        false,
        'Coverage regression detected - need deeper investigation',
        stability,
        signal.lambda
      );
    }

    // Check lambda minimum
    if (signal.lambda < this.config.minLambdaForExit) {
      return this.createDecision(
        false,
        signal.lambda / 100,
        layer,
        'lambda_too_low',
        false,
        `Lambda ${signal.lambda.toFixed(1)} < minimum ${this.config.minLambdaForExit}`,
        stability,
        signal.lambda
      );
    }

    // Check lambda stability
    if (stability < this.config.minLambdaStability) {
      return this.createDecision(
        false,
        stability,
        layer,
        'lambda_unstable',
        false,
        `Stability ${(stability * 100).toFixed(1)}% < minimum ${(this.config.minLambdaStability * 100).toFixed(1)}%`,
        stability,
        signal.lambda
      );
    }

    // Check boundary concentration
    if (signal.boundaryConcentration > this.config.maxBoundaryConcentration) {
      return this.createDecision(
        false,
        1 - signal.boundaryConcentration,
        layer,
        'boundaries_concentrated',
        false,
        `Boundary concentration ${(signal.boundaryConcentration * 100).toFixed(1)}% > max ${(this.config.maxBoundaryConcentration * 100).toFixed(1)}%`,
        stability,
        signal.lambda
      );
    }

    // Calculate combined confidence
    const confidence = calculateConfidence(signal, stability);

    // Check against minimum confidence
    if (confidence < this.config.minConfidence) {
      return this.createDecision(
        false,
        confidence,
        layer,
        'insufficient_confidence',
        false,
        `Confidence ${(confidence * 100).toFixed(1)}% < minimum ${(this.config.minConfidence * 100).toFixed(1)}%`,
        stability,
        signal.lambda
      );
    }

    // All conditions met - allow early exit
    return this.createDecision(
      true,
      confidence,
      layer,
      'confident_exit',
      this.config.speculativeTests > 0,
      `All conditions met with ${(confidence * 100).toFixed(1)}% confidence - early exit allowed`,
      stability,
      signal.lambda
    );
  }

  /**
   * Create an early exit decision object
   */
  private createDecision(
    canExit: boolean,
    confidence: number,
    exitLayer: number,
    reason: ExitReason,
    enableSpeculation: boolean,
    explanation: string,
    lambdaStability: number,
    lambdaValue: number
  ): EarlyExitDecision {
    return {
      canExit,
      confidence: Math.round(confidence * 1000) / 1000,
      exitLayer,
      reason,
      enableSpeculation: canExit && enableSpeculation,
      explanation,
      timestamp: new Date(),
      lambdaStability: Math.round(lambdaStability * 1000) / 1000,
      lambdaValue: Math.round(lambdaValue * 100) / 100,
    };
  }

  /**
   * Get the signal history for analysis
   */
  getSignalHistory(): ReadonlyArray<QualitySignal> {
    return [...this.signalHistory];
  }

  /**
   * Get the decision history for analysis
   */
  getDecisionHistory(): ReadonlyArray<EarlyExitDecision> {
    return [...this.decisionHistory];
  }

  /**
   * Reset the decision engine state
   */
  reset(): void {
    this.signalHistory = [];
    this.decisionHistory = [];
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<EarlyExitConfig> {
    return { ...this.config };
  }

  /**
   * Calculate compute savings estimate based on skipped layers
   *
   * @param exitLayer - Layer at which exit occurred
   * @param layerDurations - Historical average durations per layer
   * @returns Estimated compute savings in milliseconds
   */
  estimateComputeSavings(
    exitLayer: number,
    layerDurations: number[] = [1000, 5000, 30000, 60000]
  ): number {
    let savings = 0;
    for (let i = exitLayer + 1; i < this.totalLayers && i < layerDurations.length; i++) {
      savings += layerDurations[i];
    }
    return savings;
  }

  /**
   * Get statistics about early exit decisions
   */
  getStatistics(): {
    totalDecisions: number;
    earlyExits: number;
    exitRate: number;
    avgConfidence: number;
    exitReasonBreakdown: Record<ExitReason, number>;
  } {
    const totalDecisions = this.decisionHistory.length;
    const earlyExits = this.decisionHistory.filter(d => d.canExit).length;
    const exitRate = totalDecisions > 0 ? earlyExits / totalDecisions : 0;

    const avgConfidence = totalDecisions > 0
      ? this.decisionHistory.reduce((sum, d) => sum + d.confidence, 0) / totalDecisions
      : 0;

    const exitReasonBreakdown = this.decisionHistory.reduce((acc, d) => {
      acc[d.reason] = (acc[d.reason] || 0) + 1;
      return acc;
    }, {} as Record<ExitReason, number>);

    return {
      totalDecisions,
      earlyExits,
      exitRate: Math.round(exitRate * 1000) / 1000,
      avgConfidence: Math.round(avgConfidence * 1000) / 1000,
      exitReasonBreakdown,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a CoherenceEarlyExit instance with default configuration
 */
export function createEarlyExit(totalLayers = 4): CoherenceEarlyExit {
  return new CoherenceEarlyExit(DEFAULT_EXIT_CONFIG, totalLayers);
}

/**
 * Create a CoherenceEarlyExit instance with aggressive configuration
 * For fast feedback in development environments
 */
export function createAggressiveEarlyExit(totalLayers = 4): CoherenceEarlyExit {
  const { AGGRESSIVE_EXIT_CONFIG } = require('./types');
  return new CoherenceEarlyExit(AGGRESSIVE_EXIT_CONFIG, totalLayers);
}

/**
 * Create a CoherenceEarlyExit instance with conservative configuration
 * For high-risk changes requiring thorough validation
 */
export function createConservativeEarlyExit(totalLayers = 4): CoherenceEarlyExit {
  const { CONSERVATIVE_EXIT_CONFIG } = require('./types');
  return new CoherenceEarlyExit(CONSERVATIVE_EXIT_CONFIG, totalLayers);
}

/**
 * Create a CoherenceEarlyExit instance with custom configuration
 */
export function createCustomEarlyExit(
  config: Partial<EarlyExitConfig>,
  totalLayers = 4
): CoherenceEarlyExit {
  return new CoherenceEarlyExit(config, totalLayers);
}
