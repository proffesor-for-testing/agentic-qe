/**
 * TinyDancer Router - TD-003
 * ADR-026: Intelligent Model Routing
 *
 * A lightweight router wrapper that provides intelligent model routing
 * based on task complexity classification. Named after the efficient,
 * graceful routing decisions it makes.
 *
 * Features:
 * - Task complexity classification
 * - Confidence-based routing
 * - Multi-model triggering for uncertain cases
 * - Human review flagging for high-uncertainty tasks
 * - Outcome learning for continuous improvement
 */

import { performance } from 'perf_hooks';
import type { QETask } from './types.js';
import {
  classifyTask,
  type ClassifiableTask,
  type TaskComplexity,
  type ClaudeModel,
  type ClassificationResult,
  COMPLEXITY_THRESHOLDS,
} from './task-classifier.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of routing a task through TinyDancer
 */
export interface RouteResult {
  /** Recommended Claude model */
  readonly model: ClaudeModel;
  /** Confidence in the routing decision (0-1) */
  readonly confidence: number;
  /** Uncertainty level (inverse of confidence) */
  readonly uncertainty: number;
  /** Whether to trigger multi-model verification */
  readonly triggerMultiModel: boolean;
  /** Whether to request human review */
  readonly triggerHumanReview: boolean;
  /** Determined task complexity */
  readonly complexity: TaskComplexity;
  /** Classification details */
  readonly classification: ClassificationResult;
  /** Routing latency in milliseconds */
  readonly latencyMs: number;
  /** Routing reasoning explanation */
  readonly reasoning: string;
}

/**
 * TinyDancer router configuration
 */
export interface TinyDancerConfig {
  /** Confidence threshold below which multi-model is triggered (default: 0.80) */
  confidenceThreshold?: number;
  /** Uncertainty threshold above which human review is triggered (default: 0.20) */
  uncertaintyThreshold?: number;
  /** Security tasks always trigger multi-model below this confidence (default: 0.85) */
  securityConfidenceThreshold?: number;
  /** Enable outcome learning (default: true) */
  enableLearning?: boolean;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
}

/**
 * Routing outcome for learning
 */
export interface RoutingOutcome {
  /** Original task */
  readonly task: ClassifiableTask;
  /** Route result */
  readonly routeResult: RouteResult;
  /** Whether the task succeeded */
  readonly success: boolean;
  /** Quality score of the result (0-1) */
  readonly qualityScore: number;
  /** Actual model used (may differ from recommendation) */
  readonly actualModelUsed: ClaudeModel;
  /** Duration of task execution in ms */
  readonly durationMs: number;
  /** Timestamp */
  readonly timestamp: Date;
}

/**
 * Router statistics for monitoring
 */
export interface RouterStats {
  /** Total tasks routed */
  readonly totalRouted: number;
  /** Routes by model */
  readonly routesByModel: Record<ClaudeModel, number>;
  /** Routes by complexity */
  readonly routesByComplexity: Record<TaskComplexity, number>;
  /** Multi-model triggers */
  readonly multiModelTriggers: number;
  /** Human review triggers */
  readonly humanReviewTriggers: number;
  /** Average confidence */
  readonly avgConfidence: number;
  /** Average routing latency in ms */
  readonly avgLatencyMs: number;
  /** Learning outcomes recorded */
  readonly outcomesRecorded: number;
}

// ============================================================================
// TinyDancer Router Implementation
// ============================================================================

/**
 * TinyDancer Router - Intelligent model routing based on task complexity
 *
 * @example
 * ```typescript
 * const router = new TinyDancerRouter({ confidenceThreshold: 0.85 });
 * const result = await router.route(task);
 * console.log(`Route to ${result.model} with confidence ${result.confidence}`);
 * ```
 */
export class TinyDancerRouter {
  private readonly confidenceThreshold: number;
  private readonly uncertaintyThreshold: number;
  private readonly securityConfidenceThreshold: number;
  private readonly enableLearning: boolean;
  private readonly verbose: boolean;

  // Statistics tracking
  private totalRouted = 0;
  private routesByModel: Record<ClaudeModel, number> = { haiku: 0, sonnet: 0, opus: 0 };
  private routesByComplexity: Record<TaskComplexity, number> = {
    simple: 0, moderate: 0, complex: 0, critical: 0
  };
  private multiModelTriggers = 0;
  private humanReviewTriggers = 0;
  private totalConfidence = 0;
  private totalLatencyMs = 0;

  // Learning storage
  private outcomes: RoutingOutcome[] = [];
  private readonly maxOutcomes = 1000;

  constructor(config: TinyDancerConfig = {}) {
    this.confidenceThreshold = config.confidenceThreshold ?? 0.80;
    this.uncertaintyThreshold = config.uncertaintyThreshold ?? 0.20;
    this.securityConfidenceThreshold = config.securityConfidenceThreshold ?? 0.85;
    this.enableLearning = config.enableLearning ?? true;
    this.verbose = config.verbose ?? false;
  }

  /**
   * Route a task to the optimal Claude model
   *
   * @param task - The task to route
   * @returns Routing result with model recommendation and confidence
   */
  async route(task: QETask | ClassifiableTask): Promise<RouteResult> {
    const startTime = performance.now();

    // Classify the task
    const classification = classifyTask(task as ClassifiableTask);

    // Calculate confidence based on classification clarity
    const confidence = this.calculateConfidence(classification);
    const uncertainty = 1 - confidence;

    // Determine if security-related
    const isSecurity = this.isSecurityTask(task);

    // Determine multi-model trigger conditions
    const triggerMultiModel =
      (isSecurity && confidence < this.securityConfidenceThreshold) ||
      (confidence < this.confidenceThreshold && classification.complexity !== 'simple');

    // Determine human review trigger conditions
    const triggerHumanReview =
      uncertainty > this.uncertaintyThreshold ||
      (isSecurity && classification.complexity === 'critical');

    const latencyMs = performance.now() - startTime;

    // Build reasoning explanation
    const reasoning = this.buildReasoning(
      classification,
      confidence,
      isSecurity,
      triggerMultiModel,
      triggerHumanReview
    );

    const result: RouteResult = {
      model: classification.recommendedModel,
      confidence,
      uncertainty,
      triggerMultiModel,
      triggerHumanReview,
      complexity: classification.complexity,
      classification,
      latencyMs,
      reasoning,
    };

    // Update statistics
    this.updateStats(result);

    if (this.verbose) {
      console.log(`[TinyDancer] Route: ${classification.recommendedModel} ` +
        `(complexity=${classification.complexity}, confidence=${(confidence * 100).toFixed(1)}%)`);
    }

    return result;
  }

  /**
   * Calculate confidence based on how clearly the task falls into a complexity category
   *
   * Confidence is higher when the score is far from category boundaries.
   * Score near boundaries (20, 45, 70) means less certainty about the correct model.
   */
  private calculateConfidence(classification: ClassificationResult): number {
    const { score, complexity } = classification;

    // Special case: very simple tasks (score < 10) are highly confident
    // These are clearly simple tasks with no complexity factors
    if (complexity === 'simple' && score < 10) {
      // High confidence for clearly simple tasks
      return 0.90;
    }

    // Special case: very critical tasks (score > 85) are highly confident
    if (complexity === 'critical' && score > 85) {
      return 0.92;
    }

    // Calculate distance from nearest boundary for boundary cases
    const boundaries = [
      COMPLEXITY_THRESHOLDS.moderate,  // 20
      COMPLEXITY_THRESHOLDS.complex,   // 45
      COMPLEXITY_THRESHOLDS.critical,  // 70
    ];

    // Find minimum distance to any boundary
    let minDistance = Infinity;
    for (const boundary of boundaries) {
      const distance = Math.abs(score - boundary);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    // Convert distance to confidence
    // Max distance from any boundary is ~25 (midpoint between boundaries)
    // Scale: 0 distance = 0.55 confidence, 25+ distance = 0.90 confidence
    const baseConfidence = 0.55;
    const maxBonus = 0.35;
    const normalizedDistance = Math.min(minDistance / 25, 1);
    const confidence = baseConfidence + (normalizedDistance * maxBonus);

    // Additional boost based on factor count (more factors = more confident in complex classification)
    const factorBoost = complexity !== 'simple'
      ? Math.min(0.05, classification.factors.length * 0.01)
      : 0;

    return Math.min(0.95, confidence + factorBoost);
  }

  /**
   * Check if a task is security-related
   */
  private isSecurityTask(task: QETask | ClassifiableTask): boolean {
    const classifiable = task as ClassifiableTask;

    // Check type
    if (classifiable.type === 'security-scan' ||
        classifiable.type === 'vulnerability-assessment') {
      return true;
    }

    // Check domain
    if (task.domain === 'security-compliance') {
      return true;
    }

    // Check capabilities
    const securityCapabilities = ['sast', 'dast', 'vulnerability', 'owasp', 'security-scanning'];
    if (task.requiredCapabilities?.some(cap =>
      securityCapabilities.includes(cap)
    )) {
      return true;
    }

    // Check description keywords
    const securityKeywords = ['security', 'vulnerability', 'cve', 'owasp', 'exploit', 'injection'];
    const description = task.description.toLowerCase();
    if (securityKeywords.some(kw => description.includes(kw))) {
      return true;
    }

    return false;
  }

  /**
   * Build human-readable reasoning for the routing decision
   */
  private buildReasoning(
    classification: ClassificationResult,
    confidence: number,
    isSecurity: boolean,
    triggerMultiModel: boolean,
    triggerHumanReview: boolean
  ): string {
    const parts: string[] = [];

    // Model recommendation
    parts.push(`Routing to ${classification.recommendedModel.toUpperCase()}`);
    parts.push(`(complexity: ${classification.complexity}, score: ${classification.score})`);

    // Confidence
    parts.push(`with ${(confidence * 100).toFixed(0)}% confidence.`);

    // Factors
    if (classification.factors.length > 0) {
      const topFactors = classification.factors
        .slice(0, 3)
        .map(f => f.name)
        .join(', ');
      parts.push(`Key factors: ${topFactors}.`);
    }

    // Security flag
    if (isSecurity) {
      parts.push('Security-sensitive task detected.');
    }

    // Multi-model trigger
    if (triggerMultiModel) {
      parts.push('Multi-model verification recommended due to uncertainty.');
    }

    // Human review trigger
    if (triggerHumanReview) {
      parts.push('Human review flagged due to high uncertainty or criticality.');
    }

    return parts.join(' ');
  }

  /**
   * Update internal statistics
   */
  private updateStats(result: RouteResult): void {
    this.totalRouted++;
    this.routesByModel[result.model]++;
    this.routesByComplexity[result.complexity]++;
    this.totalConfidence += result.confidence;
    this.totalLatencyMs += result.latencyMs;

    if (result.triggerMultiModel) {
      this.multiModelTriggers++;
    }

    if (result.triggerHumanReview) {
      this.humanReviewTriggers++;
    }
  }

  /**
   * Record the outcome of a routing decision for learning
   *
   * @param task - Original task
   * @param routeResult - Original routing result
   * @param success - Whether the task succeeded
   * @param qualityScore - Quality score of the result (0-1)
   * @param actualModelUsed - Model actually used (may differ from recommendation)
   * @param durationMs - Task execution duration
   */
  recordOutcome(
    task: QETask | ClassifiableTask,
    routeResult: RouteResult,
    success: boolean,
    qualityScore: number = success ? 1.0 : 0.0,
    actualModelUsed: ClaudeModel = routeResult.model,
    durationMs: number = 0
  ): void {
    if (!this.enableLearning) return;

    const outcome: RoutingOutcome = {
      task: task as ClassifiableTask,
      routeResult,
      success,
      qualityScore,
      actualModelUsed,
      durationMs,
      timestamp: new Date(),
    };

    this.outcomes.push(outcome);

    // Maintain max outcomes (LRU-style eviction)
    if (this.outcomes.length > this.maxOutcomes) {
      this.outcomes.shift();
    }

    if (this.verbose) {
      console.log(`[TinyDancer] Recorded outcome: success=${success}, ` +
        `quality=${(qualityScore * 100).toFixed(0)}%, ` +
        `model=${actualModelUsed}`);
    }
  }

  /**
   * Get router statistics
   */
  getStats(): RouterStats {
    return {
      totalRouted: this.totalRouted,
      routesByModel: { ...this.routesByModel },
      routesByComplexity: { ...this.routesByComplexity },
      multiModelTriggers: this.multiModelTriggers,
      humanReviewTriggers: this.humanReviewTriggers,
      avgConfidence: this.totalRouted > 0
        ? this.totalConfidence / this.totalRouted
        : 0,
      avgLatencyMs: this.totalRouted > 0
        ? this.totalLatencyMs / this.totalRouted
        : 0,
      outcomesRecorded: this.outcomes.length,
    };
  }

  /**
   * Get learning outcomes for analysis
   */
  getOutcomes(): readonly RoutingOutcome[] {
    return this.outcomes;
  }

  /**
   * Get success rate by model
   */
  getSuccessRateByModel(): Record<ClaudeModel, number> {
    const byModel: Record<ClaudeModel, { success: number; total: number }> = {
      haiku: { success: 0, total: 0 },
      sonnet: { success: 0, total: 0 },
      opus: { success: 0, total: 0 },
    };

    for (const outcome of this.outcomes) {
      const model = outcome.actualModelUsed;
      byModel[model].total++;
      if (outcome.success) {
        byModel[model].success++;
      }
    }

    return {
      haiku: byModel.haiku.total > 0
        ? byModel.haiku.success / byModel.haiku.total
        : 0,
      sonnet: byModel.sonnet.total > 0
        ? byModel.sonnet.success / byModel.sonnet.total
        : 0,
      opus: byModel.opus.total > 0
        ? byModel.opus.success / byModel.opus.total
        : 0,
    };
  }

  /**
   * Reset statistics and learning data
   */
  reset(): void {
    this.totalRouted = 0;
    this.routesByModel = { haiku: 0, sonnet: 0, opus: 0 };
    this.routesByComplexity = { simple: 0, moderate: 0, complex: 0, critical: 0 };
    this.multiModelTriggers = 0;
    this.humanReviewTriggers = 0;
    this.totalConfidence = 0;
    this.totalLatencyMs = 0;
    this.outcomes = [];
  }

  /**
   * Get configuration
   */
  getConfig(): TinyDancerConfig {
    return {
      confidenceThreshold: this.confidenceThreshold,
      uncertaintyThreshold: this.uncertaintyThreshold,
      securityConfidenceThreshold: this.securityConfidenceThreshold,
      enableLearning: this.enableLearning,
      verbose: this.verbose,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TinyDancer router instance
 *
 * @param config - Router configuration
 * @returns Configured TinyDancer router
 */
export function createTinyDancerRouter(config?: TinyDancerConfig): TinyDancerRouter {
  return new TinyDancerRouter(config);
}
