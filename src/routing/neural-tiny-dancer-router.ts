/**
 * Neural TinyDancer Router - ADR-082
 * Neural Model Routing via FastGRNN-style Network
 *
 * Replaces rule-based complexity thresholds with a lightweight neural network
 * for routing decisions. Implements shadow mode for safe rollout, circuit
 * breaker for reliability, and online learning from outcome feedback.
 *
 * Design:
 * - Input features: [complexityScore, tokenEstimate, domainIndex, historicalSuccessRate]
 * - Hidden layer: 32 units with ReLU activation
 * - Output: softmax probability distribution over [Tier1/haiku, Tier2/sonnet, Tier3/opus]
 * - Shadow mode: first 1000 decisions run both routers, tracks disagreement
 * - Circuit breaker: falls back to rule-based if error rate exceeds threshold
 *
 * @module routing/neural-tiny-dancer-router
 */

import { performance } from 'perf_hooks';
import type { QETask } from './types.js';
import {
  classifyTask,
  type ClassifiableTask,
  type TaskComplexity,
  type ClaudeModel,
  type ClassificationResult,
} from './task-classifier.js';
import {
  TinyDancerRouter,
  type RouteResult,
  type TinyDancerConfig,
  type RoutingOutcome,
} from './tiny-dancer-router.js';
import type { QEDomain } from '../learning/qe-patterns.js';

// Re-export SimpleNeuralRouter from its own module for backward compatibility
export { SimpleNeuralRouter } from './simple-neural-router.js';
import { SimpleNeuralRouter } from './simple-neural-router.js';

// ============================================================================
// Constants
// ============================================================================

/** Decisions required before shadow mode can end */
const SHADOW_MODE_DECISIONS = 1000;

/** Maximum disagreement rate to exit shadow mode */
const SHADOW_MODE_MAX_DISAGREEMENT = 0.10;

/** Default circuit breaker error threshold */
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 0.20;

/** Window size for circuit breaker error rate calculation */
const CIRCUIT_BREAKER_WINDOW = 50;

/** Default learning rate for weight updates */
const DEFAULT_LEARNING_RATE = 0.01;

/** Map tier index to ClaudeModel */
const TIER_INDEX_TO_MODEL: readonly ClaudeModel[] = ['haiku', 'sonnet', 'opus'];

/** Map ClaudeModel to tier index */
const MODEL_TO_TIER_INDEX: Record<ClaudeModel, number> = {
  haiku: 0,
  sonnet: 1,
  opus: 2,
};

/** Map QEDomain to a normalized domain index (0-1) */
const DOMAIN_INDEX_MAP: Record<string, number> = {
  'test-generation': 0.1,
  'test-execution': 0.15,
  'coverage-analysis': 0.2,
  'quality-assessment': 0.3,
  'requirements-validation': 0.35,
  'code-intelligence': 0.4,
  'contract-testing': 0.45,
  'visual-accessibility': 0.5,
  'learning-optimization': 0.55,
  'defect-intelligence': 0.7,
  'chaos-resilience': 0.8,
  'security-compliance': 0.9,
};

// ============================================================================
// Types
// ============================================================================

/**
 * Neural router configuration extending TinyDancerConfig
 */
export interface NeuralTinyDancerConfig extends TinyDancerConfig {
  /** Circuit breaker error rate threshold (default: 0.20) */
  circuitBreakerThreshold?: number;
  /** Learning rate for weight updates (default: 0.01) */
  learningRate?: number;
  /** Force shadow mode on/off (undefined = auto) */
  forceShadowMode?: boolean;
  /** Number of decisions for shadow mode (default: 1000) */
  shadowModeDecisions?: number;
  /** Max disagreement rate to exit shadow mode (default: 0.10) */
  shadowModeMaxDisagreement?: number;
}

/**
 * Shadow mode decision log entry
 */
export interface ShadowDecisionLog {
  /** Task description (truncated) */
  readonly taskDescription: string;
  /** Rule-based router decision */
  readonly ruleDecision: ClaudeModel;
  /** Neural router decision */
  readonly neuralDecision: ClaudeModel;
  /** Whether both routers agreed */
  readonly agreed: boolean;
  /** Neural network confidence for chosen tier */
  readonly neuralConfidence: number;
  /** Timestamp */
  readonly timestamp: Date;
}

/**
 * Neural router statistics
 */
export interface NeuralRouterStats {
  /** Whether shadow mode is active */
  readonly shadowModeActive: boolean;
  /** Total shadow mode decisions made */
  readonly shadowDecisions: number;
  /** Disagreement rate in shadow mode */
  readonly disagreementRate: number;
  /** Whether circuit breaker is tripped */
  readonly circuitBreakerTripped: boolean;
  /** Recent error rate (last N decisions) */
  readonly recentErrorRate: number;
  /** Total neural routing decisions */
  readonly totalNeuralDecisions: number;
  /** Total weight updates from feedback */
  readonly totalWeightUpdates: number;
  /** Whether neural routing is primary */
  readonly neuralPrimary: boolean;
}

/**
 * Empirical confidence bounds from historical calibration scores.
 *
 * Note: This is NOT proper conformal prediction (which requires exchangeability
 * guarantees and per-class nonconformity scoring). These are quantile-based
 * intervals from historical routing outcomes.
 */
export interface EmpiricalConfidenceBounds {
  /** Lower bound of prediction interval */
  readonly lower: number;
  /** Upper bound of prediction interval */
  readonly upper: number;
  /** Coverage level (e.g. 0.90 = 90% prediction interval) */
  readonly coverageLevel: number;
  /** Calibration score (1 - max probability) */
  readonly calibrationScore: number;
}

/** Backward-compatible alias */
export type ConformalBounds = EmpiricalConfidenceBounds;

// ============================================================================
// Neural TinyDancer Router
// ============================================================================

/**
 * Neural-enhanced TinyDancer Router
 *
 * Wraps the rule-based TinyDancerRouter with a lightweight neural network
 * that learns optimal routing decisions from outcomes. Operates in shadow
 * mode initially, then transitions to neural-primary when proven reliable.
 *
 * @example
 * ```typescript
 * const router = new NeuralTinyDancerRouter({ learningRate: 0.01 });
 * const result = await router.route(task);
 * // Later, record outcome for learning
 * router.recordNeuralOutcome(task, result, true, 0.95);
 * ```
 */
export class NeuralTinyDancerRouter {
  /** Rule-based fallback router (always available) */
  private readonly ruleRouter: TinyDancerRouter;

  /** Neural network for routing decisions */
  private readonly neuralNet: SimpleNeuralRouter;

  /** Configuration */
  private readonly circuitBreakerThreshold: number;
  private readonly shadowModeDecisionLimit: number;
  private readonly shadowModeMaxDisagreement: number;

  /** Shadow mode state */
  private shadowModeActive: boolean;
  private shadowDecisions: ShadowDecisionLog[] = [];
  private shadowDisagreements = 0;

  /** Circuit breaker state */
  private circuitBreakerTripped = false;
  private recentOutcomes: boolean[] = [];

  /** Tracking */
  private totalNeuralDecisions = 0;
  private totalWeightUpdates = 0;
  private neuralPrimary = false;

  /** Calibration scores for empirical confidence bounds */
  private calibrationScores: number[] = [];
  private readonly maxCalibrationScores = 500;

  /** Historical success rates by domain for feature extraction */
  private domainSuccessRates: Map<string, { success: number; total: number }> = new Map();

  /** Config passthrough */
  private readonly config: NeuralTinyDancerConfig;

  /** Whether native ruvector module is available */
  private nativeRouterAvailable = false;

  constructor(config: NeuralTinyDancerConfig = {}) {
    this.config = config;
    this.ruleRouter = new TinyDancerRouter(config);
    this.neuralNet = new SimpleNeuralRouter(config.learningRate ?? DEFAULT_LEARNING_RATE);
    this.circuitBreakerThreshold = config.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
    this.shadowModeDecisionLimit = config.shadowModeDecisions ?? SHADOW_MODE_DECISIONS;
    this.shadowModeMaxDisagreement = config.shadowModeMaxDisagreement ?? SHADOW_MODE_MAX_DISAGREEMENT;

    // Determine initial shadow mode state
    if (config.forceShadowMode !== undefined) {
      this.shadowModeActive = config.forceShadowMode;
      this.neuralPrimary = !config.forceShadowMode;
    } else {
      this.shadowModeActive = true;
      this.neuralPrimary = false;
    }

    // Attempt native ruvector import (non-blocking)
    this.tryLoadNativeRouter();
  }

  /**
   * Check for native router availability.
   *
   * The `@ruvector/tiny-dancer` NAPI package exists but the ARM64 binary
   * is missing from the published package (packaging bug upstream).
   * The TypeScript `SimpleNeuralRouter` IS the production implementation —
   * its 4→32→3 network is too small to benefit from native acceleration.
   */
  private tryLoadNativeRouter(): void {
    this.nativeRouterAvailable = false;
  }

  /**
   * Route a task to the optimal Claude model.
   *
   * Behavior depends on current mode:
   * - Shadow mode: uses rule-based result, logs neural decision alongside
   * - Neural primary: uses neural decision with rule-based as validation
   * - Circuit breaker tripped: uses rule-based only
   *
   * @param task - The task to route
   * @returns Routing result with model recommendation and confidence
   */
  async route(task: QETask | ClassifiableTask): Promise<RouteResult> {
    const startTime = performance.now();

    // Always get the rule-based result (fallback guarantee)
    const ruleResult = await this.ruleRouter.route(task);

    // If circuit breaker is tripped, use rule-based only
    if (this.circuitBreakerTripped) {
      return ruleResult;
    }

    // Get neural network decision
    const features = this.extractFeatures(task, ruleResult.classification);
    let neuralProbs: number[];

    try {
      neuralProbs = this.neuralNet.forward(features);
    } catch {
      // Neural network error - fall back to rule-based
      this.tripCircuitBreaker();
      return ruleResult;
    }

    const neuralTierIndex = this.argmax(neuralProbs);
    const neuralModel = TIER_INDEX_TO_MODEL[neuralTierIndex];
    const neuralConfidence = neuralProbs[neuralTierIndex];

    this.totalNeuralDecisions++;

    // Shadow mode: log both decisions, use rule-based result
    if (this.shadowModeActive) {
      const agreed = ruleResult.model === neuralModel;
      if (!agreed) {
        this.shadowDisagreements++;
      }

      this.shadowDecisions.push({
        taskDescription: task.description.slice(0, 100),
        ruleDecision: ruleResult.model,
        neuralDecision: neuralModel,
        agreed,
        neuralConfidence,
        timestamp: new Date(),
      });

      // Check if we should exit shadow mode
      this.evaluateShadowModeExit();

      // In shadow mode, always return the rule-based result
      return ruleResult;
    }

    // Neural-primary mode: use neural decision
    const latencyMs = performance.now() - startTime;

    // Build empirical confidence bounds from historical calibration scores
    const empiricalBounds = this.computeEmpiricalConfidenceBounds(neuralProbs);

    // Determine if we should override neural with rule-based
    // (when neural confidence is very low or calibration score is too high)
    if (neuralConfidence < 0.3 || empiricalBounds.calibrationScore > 0.8) {
      return ruleResult;
    }

    // Build neural route result
    const result: RouteResult = {
      model: neuralModel,
      confidence: neuralConfidence,
      uncertainty: 1 - neuralConfidence,
      triggerMultiModel: ruleResult.triggerMultiModel,
      triggerHumanReview: ruleResult.triggerHumanReview,
      complexity: ruleResult.complexity,
      classification: ruleResult.classification,
      latencyMs,
      reasoning: this.buildNeuralReasoning(
        neuralModel,
        neuralConfidence,
        neuralProbs,
        ruleResult,
        empiricalBounds
      ),
    };

    return result;
  }

  /**
   * Extract feature vector from a task for neural network input.
   *
   * Features:
   *   [0] complexityScore: normalized classification score (0-1)
   *   [1] tokenEstimate: estimated token count, normalized (0-1)
   *   [2] domainIndex: domain-based complexity signal (0-1)
   *   [3] historicalSuccessRate: domain success rate (0-1)
   */
  extractFeatures(
    task: QETask | ClassifiableTask,
    classification: ClassificationResult
  ): number[] {
    // Feature 1: Normalized complexity score (0-100 -> 0-1)
    const complexityScore = Math.min(1, classification.score / 100);

    // Feature 2: Token estimate (based on description length + context)
    const descLen = task.description.length;
    const contextLen = task.context?.code?.length ?? 0;
    const rawTokenEstimate = (descLen + contextLen) / 4; // rough char-to-token ratio
    const tokenEstimate = Math.min(1, rawTokenEstimate / 10000); // normalize to 0-1

    // Feature 3: Domain index
    const domain = task.domain ?? '';
    const domainIndex = DOMAIN_INDEX_MAP[domain] ?? 0.25;

    // Feature 4: Historical success rate for this domain
    const domainStats = this.domainSuccessRates.get(domain);
    const successRate = domainStats
      ? domainStats.success / Math.max(1, domainStats.total)
      : 0.7; // default assumption

    return [complexityScore, tokenEstimate, domainIndex, successRate];
  }

  /**
   * Record the outcome of a routing decision for neural learning.
   *
   * Updates both the rule-based router (for stats) and the neural network
   * weights (via policy gradient).
   */
  recordNeuralOutcome(
    task: QETask | ClassifiableTask,
    routeResult: RouteResult,
    success: boolean,
    qualityScore: number = success ? 1.0 : 0.0,
    actualModelUsed: ClaudeModel = routeResult.model,
    durationMs: number = 0
  ): void {
    // Forward to rule-based router for stats
    this.ruleRouter.recordOutcome(
      task, routeResult, success, qualityScore, actualModelUsed, durationMs
    );

    // Update domain success rates
    const domain = task.domain ?? 'unknown';
    const stats = this.domainSuccessRates.get(domain) ?? { success: 0, total: 0 };
    stats.total++;
    if (success) stats.success++;
    this.domainSuccessRates.set(domain, stats);

    // Track recent outcomes for circuit breaker
    this.recentOutcomes.push(success);
    if (this.recentOutcomes.length > CIRCUIT_BREAKER_WINDOW) {
      this.recentOutcomes.shift();
    }

    // Check circuit breaker
    this.checkCircuitBreaker();

    // Update neural network weights
    const features = this.extractFeatures(task, routeResult.classification);
    const tierIndex = MODEL_TO_TIER_INDEX[actualModelUsed];
    const reward = (qualityScore - 0.5) * 2; // Scale to -1..1

    try {
      this.neuralNet.updateWeights(features, tierIndex, reward);
      this.totalWeightUpdates++;
    } catch {
      // Weight update failure is non-fatal
    }

    // Update calibration scores for empirical confidence bounds
    const probs = this.neuralNet.forward(features);
    const predictedTier = this.argmax(probs);
    const calibrationScore = 1 - probs[tierIndex];
    this.calibrationScores.push(calibrationScore);
    if (this.calibrationScores.length > this.maxCalibrationScores) {
      this.calibrationScores.shift();
    }
  }

  /**
   * Compute empirical confidence bounds from historical calibration scores.
   *
   * Note: This is NOT proper conformal prediction (which requires exchangeability
   * guarantees and per-class nonconformity scoring). These are quantile-based
   * intervals from historical routing outcomes.
   */
  computeEmpiricalConfidenceBounds(probs: number[]): EmpiricalConfidenceBounds {
    const coverageLevel = 0.90;
    const maxProb = Math.max(...probs);
    const calibrationScore = 1 - maxProb;

    if (this.calibrationScores.length < 10) {
      // Insufficient calibration data - return wide bounds
      return {
        lower: 0,
        upper: 1,
        coverageLevel,
        calibrationScore,
      };
    }

    // Compute quantile of calibration scores
    const sorted = [...this.calibrationScores].sort((a, b) => a - b);
    const quantileIndex = Math.ceil(coverageLevel * sorted.length) - 1;
    const threshold = sorted[Math.min(quantileIndex, sorted.length - 1)];

    return {
      lower: Math.max(0, maxProb - threshold),
      upper: Math.min(1, maxProb + threshold),
      coverageLevel,
      calibrationScore,
    };
  }

  /**
   * Backward-compatible alias for computeEmpiricalConfidenceBounds.
   * @deprecated Use computeEmpiricalConfidenceBounds instead.
   */
  computeConformalBounds(probs: number[]): EmpiricalConfidenceBounds {
    return this.computeEmpiricalConfidenceBounds(probs);
  }

  /**
   * Check whether shadow mode should end.
   * Exits when enough decisions made AND disagreement rate is acceptable.
   */
  private evaluateShadowModeExit(): void {
    if (!this.shadowModeActive) return;
    if (this.config.forceShadowMode === true) return; // Forced on

    const totalShadow = this.shadowDecisions.length;
    if (totalShadow < this.shadowModeDecisionLimit) return;

    const disagreementRate = this.shadowDisagreements / totalShadow;
    if (disagreementRate <= this.shadowModeMaxDisagreement) {
      this.shadowModeActive = false;
      this.neuralPrimary = true;
    }
  }

  /**
   * Check circuit breaker and trip if error rate exceeds threshold.
   */
  private checkCircuitBreaker(): void {
    if (this.recentOutcomes.length < 10) return;

    const failures = this.recentOutcomes.filter(s => !s).length;
    const errorRate = failures / this.recentOutcomes.length;

    if (errorRate > this.circuitBreakerThreshold) {
      this.tripCircuitBreaker();
    } else if (this.circuitBreakerTripped && errorRate < this.circuitBreakerThreshold * 0.5) {
      // Auto-reset circuit breaker when error rate drops significantly
      this.circuitBreakerTripped = false;
    }
  }

  /**
   * Trip the circuit breaker, falling back to rule-based routing.
   */
  private tripCircuitBreaker(): void {
    this.circuitBreakerTripped = true;
    this.neuralPrimary = false;
  }

  /**
   * Build reasoning string for neural routing decision
   */
  private buildNeuralReasoning(
    model: ClaudeModel,
    confidence: number,
    probs: number[],
    ruleResult: RouteResult,
    bounds: EmpiricalConfidenceBounds
  ): string {
    const parts: string[] = [];

    parts.push(`[Neural] Routing to ${model.toUpperCase()}`);
    parts.push(`with ${(confidence * 100).toFixed(0)}% neural confidence.`);
    parts.push(`Tier probabilities: haiku=${(probs[0] * 100).toFixed(0)}%,`);
    parts.push(`sonnet=${(probs[1] * 100).toFixed(0)}%,`);
    parts.push(`opus=${(probs[2] * 100).toFixed(0)}%.`);

    if (model !== ruleResult.model) {
      parts.push(`Rule-based would choose ${ruleResult.model.toUpperCase()}.`);
    }

    parts.push(`Empirical bounds: [${bounds.lower.toFixed(2)}, ${bounds.upper.toFixed(2)}]`);
    parts.push(`at ${(bounds.coverageLevel * 100).toFixed(0)}% coverage.`);

    return parts.join(' ');
  }

  /**
   * Get the index of the maximum value in an array.
   */
  private argmax(arr: number[]): number {
    let maxIdx = 0;
    let maxVal = arr[0];
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > maxVal) {
        maxVal = arr[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  // ============================================================================
  // Public Accessors
  // ============================================================================

  /**
   * Get neural router statistics
   */
  getNeuralStats(): NeuralRouterStats {
    const totalShadow = this.shadowDecisions.length;
    const disagreementRate = totalShadow > 0
      ? this.shadowDisagreements / totalShadow
      : 0;

    const failures = this.recentOutcomes.filter(s => !s).length;
    const recentErrorRate = this.recentOutcomes.length > 0
      ? failures / this.recentOutcomes.length
      : 0;

    return {
      shadowModeActive: this.shadowModeActive,
      shadowDecisions: totalShadow,
      disagreementRate,
      circuitBreakerTripped: this.circuitBreakerTripped,
      recentErrorRate,
      totalNeuralDecisions: this.totalNeuralDecisions,
      totalWeightUpdates: this.totalWeightUpdates,
      neuralPrimary: this.neuralPrimary,
    };
  }

  /**
   * Get shadow mode decision logs
   */
  getShadowDecisionLogs(): readonly ShadowDecisionLog[] {
    return this.shadowDecisions;
  }

  /**
   * Get the underlying rule-based router (for direct access if needed)
   */
  getRuleRouter(): TinyDancerRouter {
    return this.ruleRouter;
  }

  /**
   * Get the underlying neural network (for serialization/deserialization)
   */
  getNeuralNet(): SimpleNeuralRouter {
    return this.neuralNet;
  }

  /**
   * Check if native ruvector router is available
   */
  isNativeRouterAvailable(): boolean {
    return this.nativeRouterAvailable;
  }

  /**
   * Check if shadow mode is active
   */
  isShadowModeActive(): boolean {
    return this.shadowModeActive;
  }

  /**
   * Check if neural routing is primary
   */
  isNeuralPrimary(): boolean {
    return this.neuralPrimary;
  }

  /**
   * Check if circuit breaker is tripped
   */
  isCircuitBreakerTripped(): boolean {
    return this.circuitBreakerTripped;
  }

  /**
   * Manually reset the circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerTripped = false;
    this.recentOutcomes = [];
  }

  /**
   * Get the rule-based router's stats (delegates)
   */
  getStats() {
    return this.ruleRouter.getStats();
  }

  /**
   * Get the rule-based router's config (delegates)
   */
  getConfig(): TinyDancerConfig {
    return this.ruleRouter.getConfig();
  }

  /**
   * Reset all state (both rule-based and neural)
   */
  reset(): void {
    this.ruleRouter.reset();
    this.shadowDecisions = [];
    this.shadowDisagreements = 0;
    this.circuitBreakerTripped = false;
    this.recentOutcomes = [];
    this.totalNeuralDecisions = 0;
    this.totalWeightUpdates = 0;
    this.calibrationScores = [];
    this.domainSuccessRates.clear();

    if (this.config.forceShadowMode !== undefined) {
      this.shadowModeActive = this.config.forceShadowMode;
      this.neuralPrimary = !this.config.forceShadowMode;
    } else {
      this.shadowModeActive = true;
      this.neuralPrimary = false;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Neural TinyDancer router instance
 *
 * @param config - Neural router configuration
 * @returns Configured Neural TinyDancer router
 */
export function createNeuralTinyDancerRouter(
  config?: NeuralTinyDancerConfig
): NeuralTinyDancerRouter {
  return new NeuralTinyDancerRouter(config);
}
