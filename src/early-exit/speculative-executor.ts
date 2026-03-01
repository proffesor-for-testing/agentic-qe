/**
 * Agentic QE v3 - Speculative Test Executor
 * ADR-033: Lambda-stability decisions with speculative execution
 *
 * This module implements speculative prediction and verification for
 * test layers that are skipped due to early exit decisions.
 */

import {
  EarlyExitConfig,
  EarlyExitDecision,
  TestLayer,
  SpeculativeResult,
  SpeculativeBatch,
  PredictedOutcome,
  LayerResult,
  DEFAULT_EXIT_CONFIG,
} from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Historical data for a test layer used in prediction
 */
export interface LayerHistory {
  /** Layer index */
  layerIndex: number;
  /** Historical pass rate */
  avgPassRate: number;
  /** Historical pass rate variance */
  passRateVariance: number;
  /** Historical flaky rate */
  avgFlakyRate: number;
  /** Number of data points */
  dataPoints: number;
  /** Recent trend (positive = improving, negative = degrading) */
  trend: number;
}

/**
 * Prediction model interface for extensibility
 */
export interface IPredictionModel {
  predict(
    layer: TestLayer,
    decision: EarlyExitDecision,
    history?: LayerHistory
  ): Promise<SpeculativeResult>;
}

// ============================================================================
// Speculative Executor Class
// ============================================================================

/**
 * SpeculativeExecutor - Generates and verifies predictions for skipped test layers
 *
 * When early exit occurs, this executor:
 * 1. Predicts outcomes for skipped layers based on quality signals and history
 * 2. Optionally verifies predictions by running actual tests
 * 3. Tracks prediction accuracy for model improvement
 *
 * @example
 * ```typescript
 * const executor = new SpeculativeExecutor(config);
 *
 * // Generate predictions for skipped layers
 * const batch = await executor.speculate(exitDecision, skippedLayers);
 *
 * // Optionally verify some predictions
 * const verified = await executor.verify(batch.predictions, skippedLayers, runLayer);
 * ```
 */
export class SpeculativeExecutor {
  private readonly config: EarlyExitConfig;
  private readonly layerHistories: Map<number, LayerHistory> = new Map();
  private predictionResults: SpeculativeResult[] = [];

  constructor(config: Partial<EarlyExitConfig> = {}) {
    this.config = { ...DEFAULT_EXIT_CONFIG, ...config };
  }

  /**
   * Generate speculative predictions for skipped layers
   *
   * @param exitDecision - The early exit decision
   * @param skippedLayers - Layers that were skipped
   * @returns Batch of predictions
   */
  async speculate(
    exitDecision: EarlyExitDecision,
    skippedLayers: TestLayer[]
  ): Promise<SpeculativeBatch> {
    const predictions: SpeculativeResult[] = [];
    let totalConfidence = 0;

    for (const layer of skippedLayers) {
      const history = this.layerHistories.get(layer.index);
      const prediction = await this.predictLayerOutcome(layer, exitDecision, history);
      predictions.push(prediction);
      totalConfidence += prediction.confidence;
    }

    const batchConfidence = predictions.length > 0
      ? totalConfidence / predictions.length
      : 0;

    return {
      predictions,
      batchConfidence: Math.round(batchConfidence * 1000) / 1000,
      verifiedCount: 0,
      timestamp: new Date(),
    };
  }

  /**
   * Verify speculative predictions by running actual tests
   *
   * @param predictions - Original predictions
   * @param layers - Test layers to verify
   * @param runLayer - Function to execute a test layer
   * @returns Verified predictions with actual outcomes
   */
  async verify(
    predictions: SpeculativeResult[],
    layers: TestLayer[],
    runLayer: (layer: TestLayer) => Promise<LayerResult>
  ): Promise<SpeculativeResult[]> {
    const verified: SpeculativeResult[] = [];
    const verificationCount = Math.min(
      this.config.verificationLayers,
      predictions.length,
      layers.length
    );

    // Verify up to verificationLayers predictions
    for (let i = 0; i < verificationCount; i++) {
      const layer = layers[i];
      const prediction = predictions[i];

      try {
        // Run actual tests
        const actual = await runLayer(layer);
        const actualOutcome = this.determineOutcome(actual);

        const verifiedPrediction: SpeculativeResult = {
          ...prediction,
          verified: true,
          actual: actualOutcome,
          correct: prediction.predicted === actualOutcome,
        };

        verified.push(verifiedPrediction);

        // Update history with actual results
        this.updateLayerHistory(layer.index, actual);
      } catch (error) {
        // Verification failed - keep original prediction unverified
        verified.push({
          ...prediction,
          verified: false,
          reasoning: `${prediction.reasoning} (verification failed: ${error instanceof Error ? error.message : 'unknown error'})`,
        });
      }
    }

    // Add remaining unverified predictions
    for (let i = verificationCount; i < predictions.length; i++) {
      verified.push(predictions[i]);
    }

    // Store results for accuracy tracking
    this.predictionResults.push(...verified);

    return verified;
  }

  /**
   * Predict outcome for a single layer
   */
  private async predictLayerOutcome(
    layer: TestLayer,
    decision: EarlyExitDecision,
    history?: LayerHistory
  ): Promise<SpeculativeResult> {
    // Base prediction on exit decision confidence and historical data
    const baseConfidence = decision.confidence;
    let predictedOutcome: PredictedOutcome;
    let adjustedConfidence: number;
    let reasoning: string;

    // Use historical data if available
    if (history && history.dataPoints >= 5) {
      const prediction = this.predictFromHistory(history, decision);
      predictedOutcome = prediction.outcome;
      adjustedConfidence = this.adjustConfidenceWithHistory(baseConfidence, history);
      reasoning = prediction.reasoning;
    } else {
      // Fall back to heuristic prediction based on confidence
      const prediction = this.predictFromConfidence(decision, layer);
      predictedOutcome = prediction.outcome;
      adjustedConfidence = prediction.confidence;
      reasoning = prediction.reasoning;
    }

    // Apply layer-specific adjustments
    if (layer.historicalPassRate !== undefined) {
      const historicalFactor = layer.historicalPassRate;
      adjustedConfidence = adjustedConfidence * 0.7 + historicalFactor * 0.3;

      if (historicalFactor < 0.8) {
        reasoning += ` Historical pass rate (${(historicalFactor * 100).toFixed(1)}%) suggests caution.`;
      }
    }

    return {
      predicted: predictedOutcome,
      confidence: Math.round(adjustedConfidence * 1000) / 1000,
      verified: false,
      layerIndex: layer.index,
      layerType: layer.type,
      reasoning,
    };
  }

  /**
   * Predict outcome based on historical data
   */
  private predictFromHistory(
    history: LayerHistory,
    decision: EarlyExitDecision
  ): { outcome: PredictedOutcome; reasoning: string } {
    const { avgPassRate, avgFlakyRate, trend, passRateVariance } = history;

    // High historical pass rate with positive trend
    if (avgPassRate >= 0.95 && trend >= 0) {
      return {
        outcome: 'pass',
        reasoning: `Historical pass rate ${(avgPassRate * 100).toFixed(1)}% with ${trend >= 0 ? 'positive' : 'negative'} trend.`,
      };
    }

    // High flaky rate
    if (avgFlakyRate > 0.1) {
      return {
        outcome: 'flaky',
        reasoning: `Historical flaky rate ${(avgFlakyRate * 100).toFixed(1)}% exceeds threshold.`,
      };
    }

    // Moderate pass rate with high variance
    if (avgPassRate >= 0.8 && passRateVariance > 0.05) {
      return {
        outcome: 'flaky',
        reasoning: `Pass rate ${(avgPassRate * 100).toFixed(1)}% but high variance (${(passRateVariance * 100).toFixed(1)}%).`,
      };
    }

    // Combine with exit decision confidence
    if (avgPassRate >= 0.9 && decision.confidence >= 0.85) {
      return {
        outcome: 'pass',
        reasoning: `Historical pass rate ${(avgPassRate * 100).toFixed(1)}% combined with ${(decision.confidence * 100).toFixed(1)}% exit confidence.`,
      };
    }

    // Lower pass rate
    if (avgPassRate < 0.7) {
      return {
        outcome: 'fail',
        reasoning: `Historical pass rate ${(avgPassRate * 100).toFixed(1)}% below acceptable threshold.`,
      };
    }

    // Default to flaky for uncertain cases
    return {
      outcome: 'flaky',
      reasoning: `Uncertain prediction - moderate historical pass rate ${(avgPassRate * 100).toFixed(1)}%.`,
    };
  }

  /**
   * Predict outcome based on exit decision confidence
   */
  private predictFromConfidence(
    decision: EarlyExitDecision,
    layer: TestLayer
  ): { outcome: PredictedOutcome; confidence: number; reasoning: string } {
    const confidence = decision.confidence;

    // Very high confidence
    if (confidence >= 0.9) {
      return {
        outcome: 'pass',
        confidence: confidence * 0.95, // Slight reduction for prediction uncertainty
        reasoning: `High exit confidence (${(confidence * 100).toFixed(1)}%) predicts pass for ${layer.type} layer.`,
      };
    }

    // High confidence
    if (confidence >= 0.8) {
      return {
        outcome: 'pass',
        confidence: confidence * 0.85,
        reasoning: `Good exit confidence (${(confidence * 100).toFixed(1)}%) suggests pass for ${layer.type} layer.`,
      };
    }

    // Moderate confidence
    if (confidence >= 0.7) {
      return {
        outcome: 'flaky',
        confidence: confidence * 0.75,
        reasoning: `Moderate exit confidence (${(confidence * 100).toFixed(1)}%) - ${layer.type} layer outcome uncertain.`,
      };
    }

    // Lower confidence
    return {
      outcome: 'fail',
      confidence: (1 - confidence) * 0.8,
      reasoning: `Low exit confidence (${(confidence * 100).toFixed(1)}%) predicts potential issues in ${layer.type} layer.`,
    };
  }

  /**
   * Adjust confidence based on historical data
   */
  private adjustConfidenceWithHistory(baseConfidence: number, history: LayerHistory): number {
    let adjustment = 0;

    // High pass rate boosts confidence
    if (history.avgPassRate >= 0.95) {
      adjustment += 0.1;
    } else if (history.avgPassRate >= 0.9) {
      adjustment += 0.05;
    } else if (history.avgPassRate < 0.8) {
      adjustment -= 0.1;
    }

    // Positive trend boosts confidence
    if (history.trend > 0.05) {
      adjustment += 0.05;
    } else if (history.trend < -0.05) {
      adjustment -= 0.1;
    }

    // High variance reduces confidence
    if (history.passRateVariance > 0.1) {
      adjustment -= 0.15;
    } else if (history.passRateVariance > 0.05) {
      adjustment -= 0.05;
    }

    // More data points increase confidence in adjustment
    const dataConfidence = Math.min(history.dataPoints / 20, 1);
    const finalAdjustment = adjustment * dataConfidence;

    return Math.max(0, Math.min(1, baseConfidence + finalAdjustment));
  }

  /**
   * Determine outcome from layer result
   */
  private determineOutcome(result: LayerResult): PredictedOutcome {
    if (result.passRate >= 0.99 && result.flakyRatio < 0.01) {
      return 'pass';
    }
    if (result.flakyRatio >= 0.1) {
      return 'flaky';
    }
    if (result.passRate < 0.9) {
      return 'fail';
    }
    // Borderline cases
    if (result.flakyRatio >= 0.05) {
      return 'flaky';
    }
    return 'pass';
  }

  /**
   * Update layer history with new results
   */
  private updateLayerHistory(layerIndex: number, result: LayerResult): void {
    const existing = this.layerHistories.get(layerIndex);

    if (existing) {
      // Update running statistics
      const newDataPoints = existing.dataPoints + 1;
      const oldWeight = existing.dataPoints / newDataPoints;
      const newWeight = 1 / newDataPoints;

      const newAvgPassRate = existing.avgPassRate * oldWeight + result.passRate * newWeight;
      const newAvgFlakyRate = existing.avgFlakyRate * oldWeight + result.flakyRatio * newWeight;

      // Update variance (simplified running variance)
      const delta = result.passRate - existing.avgPassRate;
      const newVariance = existing.passRateVariance * oldWeight + (delta * delta) * newWeight;

      // Update trend (simple exponential moving average of changes)
      const change = result.passRate - existing.avgPassRate;
      const newTrend = existing.trend * 0.8 + change * 0.2;

      this.layerHistories.set(layerIndex, {
        layerIndex,
        avgPassRate: newAvgPassRate,
        passRateVariance: newVariance,
        avgFlakyRate: newAvgFlakyRate,
        dataPoints: newDataPoints,
        trend: newTrend,
      });
    } else {
      // Initialize new history
      this.layerHistories.set(layerIndex, {
        layerIndex,
        avgPassRate: result.passRate,
        passRateVariance: 0,
        avgFlakyRate: result.flakyRatio,
        dataPoints: 1,
        trend: 0,
      });
    }
  }

  /**
   * Get prediction accuracy statistics
   */
  getAccuracyStats(): {
    total: number;
    verified: number;
    correct: number;
    accuracy: number;
    outcomeBreakdown: Record<PredictedOutcome, { predicted: number; correct: number }>;
  } {
    const verified = this.predictionResults.filter(p => p.verified);
    const correct = verified.filter(p => p.correct);

    const outcomeBreakdown: Record<PredictedOutcome, { predicted: number; correct: number }> = {
      pass: { predicted: 0, correct: 0 },
      fail: { predicted: 0, correct: 0 },
      flaky: { predicted: 0, correct: 0 },
    };

    for (const result of this.predictionResults) {
      outcomeBreakdown[result.predicted].predicted++;
      if (result.verified && result.correct) {
        outcomeBreakdown[result.predicted].correct++;
      }
    }

    return {
      total: this.predictionResults.length,
      verified: verified.length,
      correct: correct.length,
      accuracy: verified.length > 0 ? correct.length / verified.length : 0,
      outcomeBreakdown,
    };
  }

  /**
   * Set historical data for a layer
   */
  setLayerHistory(history: LayerHistory): void {
    this.layerHistories.set(history.layerIndex, history);
  }

  /**
   * Get historical data for a layer
   */
  getLayerHistory(layerIndex: number): LayerHistory | undefined {
    return this.layerHistories.get(layerIndex);
  }

  /**
   * Reset executor state
   */
  reset(): void {
    this.predictionResults = [];
    // Keep layer histories as they are valuable for future predictions
  }

  /**
   * Clear all state including histories
   */
  clearAll(): void {
    this.predictionResults = [];
    this.layerHistories.clear();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a SpeculativeExecutor with default configuration
 */
export function createSpeculativeExecutor(
  config: Partial<EarlyExitConfig> = {}
): SpeculativeExecutor {
  return new SpeculativeExecutor(config);
}
