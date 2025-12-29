/**
 * DefaultLearningStrategy - Standard agent learning implementation
 *
 * Wraps LearningEngine and PerformanceTracker for backward compatibility.
 * Provides pattern learning, recommendations, and execution tracking.
 *
 * @module core/strategies/DefaultLearningStrategy
 * @version 1.0.0
 */

import type {
  AgentLearningStrategy,
  LearnedPattern,
  PatternQuery,
  StrategyRecommendation,
  ExecutionEvent,
  TrainingResult,
  LearningStatus,
  LearningMetrics,
} from './AgentLearningStrategy';
import { SecureRandom } from '../../utils/SecureRandom';

/**
 * DefaultLearningStrategy - Pattern-based learning with performance tracking
 */
export class DefaultLearningStrategy implements AgentLearningStrategy {
  private patterns: Map<string, LearnedPattern> = new Map();
  private executions: ExecutionEvent[] = [];
  private recommendations: Map<string, { recommendation: StrategyRecommendation; outcome?: boolean }> = new Map();
  private initialized = false;
  private trainingIterations = 0;
  private lastTraining?: Date;

  // Configuration
  private readonly maxPatterns: number;
  private readonly maxExecutions: number;
  private readonly minConfidenceThreshold: number;
  private readonly learningRate: number;

  constructor(config?: {
    maxPatterns?: number;
    maxExecutions?: number;
    minConfidenceThreshold?: number;
    learningRate?: number;
  }) {
    this.maxPatterns = config?.maxPatterns ?? 10000;
    this.maxExecutions = config?.maxExecutions ?? 1000;
    this.minConfidenceThreshold = config?.minConfidenceThreshold ?? 0.3;
    this.learningRate = config?.learningRate ?? 0.1;
  }

  /**
   * Initialize the learning strategy
   */
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  /**
   * Store a learned pattern
   */
  async storePattern(pattern: LearnedPattern): Promise<void> {
    // Enforce max patterns limit
    if (this.patterns.size >= this.maxPatterns) {
      // Remove lowest confidence pattern
      this.removeLowestConfidencePattern();
    }

    this.patterns.set(pattern.id, {
      ...pattern,
      updatedAt: new Date(),
    });
  }

  /**
   * Query learned patterns
   */
  async getPatterns(query: PatternQuery): Promise<LearnedPattern[]> {
    let results = Array.from(this.patterns.values());

    // Apply filters
    if (query.type) {
      results = results.filter((p) => p.type === query.type);
    }
    if (query.domain) {
      results = results.filter((p) => p.domain === query.domain);
    }
    if (query.minConfidence !== undefined) {
      results = results.filter((p) => p.confidence >= query.minConfidence!);
    }

    // Sort by confidence (descending)
    results.sort((a, b) => b.confidence - a.confidence);

    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Find similar patterns using vector similarity
   */
  async findSimilarPatterns(embedding: number[], limit = 10): Promise<LearnedPattern[]> {
    const results: Array<{ pattern: LearnedPattern; similarity: number }> = [];

    for (const pattern of this.patterns.values()) {
      if (pattern.embedding) {
        const similarity = this.cosineSimilarity(embedding, pattern.embedding);
        results.push({ pattern, similarity });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((r) => r.pattern);
  }

  /**
   * Update pattern confidence based on feedback
   */
  async updatePatternConfidence(patternId: string, success: boolean): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    // Exponential moving average for confidence
    const adjustment = success ? this.learningRate : -this.learningRate;
    pattern.confidence = Math.max(0, Math.min(1, pattern.confidence + adjustment));
    pattern.usageCount++;

    // Update success rate
    const totalUses = pattern.usageCount;
    const successRate = success
      ? (pattern.successRate * (totalUses - 1) + 1) / totalUses
      : (pattern.successRate * (totalUses - 1)) / totalUses;
    pattern.successRate = successRate;
    pattern.updatedAt = new Date();

    this.patterns.set(patternId, pattern);
  }

  /**
   * Recommend a strategy based on task state
   */
  async recommendStrategy(taskState: unknown): Promise<StrategyRecommendation | null> {
    // Simple heuristic: find patterns matching the task state
    const patterns = await this.getPatterns({
      minConfidence: this.minConfidenceThreshold,
      limit: 5,
    });

    if (patterns.length === 0) {
      return null;
    }

    // Use highest confidence pattern
    const bestPattern = patterns[0];

    const recommendation: StrategyRecommendation = {
      strategy: bestPattern.type,
      confidence: bestPattern.confidence,
      reasoning: `Based on pattern '${bestPattern.id}' with ${(bestPattern.successRate * 100).toFixed(1)}% success rate`,
      alternatives: patterns.slice(1, 4).map((p) => ({
        strategy: p.type,
        confidence: p.confidence,
      })),
      metadata: {
        patternId: bestPattern.id,
        patternDomain: bestPattern.domain,
      },
    };

    // Track recommendation for outcome recording
    const trackingId = `${Date.now()}-${SecureRandom.generateId(10)}`;
    this.recommendations.set(trackingId, { recommendation });

    return recommendation;
  }

  /**
   * Record recommendation outcome
   */
  async recordRecommendationOutcome(
    recommendation: StrategyRecommendation,
    success: boolean
  ): Promise<void> {
    // Find the pattern and update its confidence
    const patternId = recommendation.metadata?.patternId as string;
    if (patternId) {
      await this.updatePatternConfidence(patternId, success);
    }
  }

  /**
   * Record a task execution for learning
   */
  async recordExecution(event: ExecutionEvent): Promise<void> {
    // Enforce max executions limit (FIFO)
    if (this.executions.length >= this.maxExecutions) {
      this.executions.shift();
    }

    this.executions.push({
      ...event,
      duration: event.duration ?? 0,
    });
  }

  /**
   * Get execution history
   */
  async getExecutionHistory(limit = 100): Promise<ExecutionEvent[]> {
    return this.executions.slice(-limit);
  }

  /**
   * Train the learning model
   */
  async train(iterations = 10): Promise<TrainingResult> {
    const startTime = performance.now();
    let improvement = 0;
    let patternsLearned = 0;

    for (let i = 0; i < iterations; i++) {
      // Simple training: adjust pattern confidence based on execution history
      for (const execution of this.executions) {
        // Create or update pattern based on execution
        const patternId = this.generatePatternId(execution);
        let pattern = this.patterns.get(patternId);

        if (!pattern) {
          pattern = {
            id: patternId,
            type: execution.task.type || 'unknown',
            domain: 'execution',
            content: JSON.stringify(execution.task),
            confidence: 0.5,
            usageCount: 0,
            successRate: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          patternsLearned++;
        }

        await this.updatePatternConfidence(patternId, execution.success);
      }

      this.trainingIterations++;
    }

    this.lastTraining = new Date();
    const duration = performance.now() - startTime;

    // Calculate improvement (simple heuristic)
    const avgConfidence = this.calculateAverageConfidence();
    improvement = avgConfidence - 0.5; // Improvement over baseline

    return {
      iterations,
      improvement,
      patternsLearned,
      duration,
      metrics: {
        accuracy: avgConfidence,
        loss: 1 - avgConfidence,
        recall: patternsLearned / Math.max(1, this.executions.length),
      },
    };
  }

  /**
   * Export learned patterns
   */
  async exportPatterns(): Promise<LearnedPattern[]> {
    return Array.from(this.patterns.values());
  }

  /**
   * Import patterns from another agent
   */
  async importPatterns(patterns: LearnedPattern[]): Promise<number> {
    let imported = 0;

    for (const pattern of patterns) {
      if (!this.patterns.has(pattern.id)) {
        await this.storePattern(pattern);
        imported++;
      }
    }

    return imported;
  }

  /**
   * Get learning status
   */
  getStatus(): LearningStatus {
    return {
      enabled: true,
      initialized: this.initialized,
      patternsCount: this.patterns.size,
      executionsRecorded: this.executions.length,
      lastTraining: this.lastTraining,
      accuracy: this.calculateAverageConfidence(),
    };
  }

  /**
   * Get learning metrics
   */
  async getMetrics(): Promise<LearningMetrics> {
    const successful = this.executions.filter((e) => e.success).length;
    const failed = this.executions.length - successful;

    return {
      totalExecutions: this.executions.length,
      successfulExecutions: successful,
      failedExecutions: failed,
      patternsStored: this.patterns.size,
      recommendationsGiven: this.recommendations.size,
      recommendationAccuracy: this.calculateRecommendationAccuracy(),
      averageConfidence: this.calculateAverageConfidence(),
      trainingIterations: this.trainingIterations,
      lastActivity: this.lastTraining ?? new Date(),
    };
  }

  /**
   * Reset learning state
   */
  async reset(): Promise<void> {
    this.patterns.clear();
    this.executions = [];
    this.recommendations.clear();
    this.trainingIterations = 0;
    this.lastTraining = undefined;
  }

  // === Private Helpers ===

  private removeLowestConfidencePattern(): void {
    let lowestId: string | null = null;
    let lowestConfidence = Infinity;

    for (const [id, pattern] of this.patterns) {
      if (pattern.confidence < lowestConfidence) {
        lowestConfidence = pattern.confidence;
        lowestId = id;
      }
    }

    if (lowestId) {
      this.patterns.delete(lowestId);
    }
  }

  private generatePatternId(execution: ExecutionEvent): string {
    const taskType = execution.task.type || 'unknown';
    return `pattern-${taskType}-${Buffer.from(JSON.stringify(execution.task)).toString('base64').slice(0, 16)}`;
  }

  private calculateAverageConfidence(): number {
    if (this.patterns.size === 0) return 0;

    const sum = Array.from(this.patterns.values()).reduce(
      (acc, p) => acc + p.confidence,
      0
    );
    return sum / this.patterns.size;
  }

  private calculateRecommendationAccuracy(): number {
    const withOutcome = Array.from(this.recommendations.values()).filter(
      (r) => r.outcome !== undefined
    );
    if (withOutcome.length === 0) return 0;

    const successful = withOutcome.filter((r) => r.outcome === true).length;
    return successful / withOutcome.length;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
}

/**
 * DisabledLearningStrategy - No-op for benchmarks/testing
 */
export class DisabledLearningStrategy implements AgentLearningStrategy {
  async initialize(): Promise<void> {}
  async storePattern(): Promise<void> {}
  async getPatterns(): Promise<LearnedPattern[]> { return []; }
  async findSimilarPatterns(): Promise<LearnedPattern[]> { return []; }
  async updatePatternConfidence(): Promise<void> {}
  async recommendStrategy(): Promise<StrategyRecommendation | null> { return null; }
  async recordRecommendationOutcome(): Promise<void> {}
  async recordExecution(): Promise<void> {}
  async getExecutionHistory(): Promise<ExecutionEvent[]> { return []; }
  async train(): Promise<TrainingResult> {
    return { iterations: 0, improvement: 0, patternsLearned: 0, duration: 0, metrics: { accuracy: 0, loss: 0, recall: 0 } };
  }
  async exportPatterns(): Promise<LearnedPattern[]> { return []; }
  async importPatterns(): Promise<number> { return 0; }
  getStatus(): LearningStatus {
    return { enabled: false, initialized: true, patternsCount: 0, executionsRecorded: 0, accuracy: 0 };
  }
  async getMetrics(): Promise<LearningMetrics> {
    return {
      totalExecutions: 0, successfulExecutions: 0, failedExecutions: 0,
      patternsStored: 0, recommendationsGiven: 0, recommendationAccuracy: 0,
      averageConfidence: 0, trainingIterations: 0, lastActivity: new Date(),
    };
  }
}

/**
 * Factory function for creating learning strategies
 */
export function createLearningStrategy(
  type: 'default' | 'disabled' = 'default',
  config?: Record<string, unknown>
): AgentLearningStrategy {
  switch (type) {
    case 'disabled':
      return new DisabledLearningStrategy();
    default:
      return new DefaultLearningStrategy(config as {
        maxPatterns?: number;
        maxExecutions?: number;
        minConfidenceThreshold?: number;
        learningRate?: number;
      });
  }
}
