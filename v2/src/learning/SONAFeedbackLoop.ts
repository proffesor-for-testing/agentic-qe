/**
 * SONA Feedback Loop - Continuous Improvement System
 *
 * Implements the Execute → Measure → Adapt loop for QE agents:
 * 1. Execute: Run agent tasks and capture results
 * 2. Measure: Evaluate quality, coverage, and performance
 * 3. Adapt: Update patterns and trigger learning
 *
 * Integrates with:
 * - SONALearningStrategy for adaptive learning
 * - QEReasoningBank for pattern storage
 * - TRMLearningStrategy for reasoning patterns
 *
 * @module learning/SONAFeedbackLoop
 * @version 1.0.0
 */

import { Logger } from '../utils/Logger';
import type {
  SONALearningStrategy,
  SONAMetrics,
} from '../core/strategies/SONALearningStrategy';
import type {
  LearnedPattern,
  ExecutionEvent,
} from '../core/strategies';
import type { QETask } from '../types';

/**
 * Feedback loop configuration
 */
export interface FeedbackLoopConfig {
  /** Enable automatic feedback processing */
  enabled?: boolean;
  /** Minimum executions before analysis (default: 10) */
  minExecutionsForAnalysis?: number;
  /** Feedback batch size (default: 20) */
  batchSize?: number;
  /** Learning rate adjustment based on performance */
  adaptiveLearningRate?: boolean;
  /** Threshold for triggering adaptation (default: 0.7) */
  adaptationThreshold?: number;
  /** Enable performance drift detection */
  enableDriftDetection?: boolean;
  /** Window size for drift detection (default: 50) */
  driftWindowSize?: number;
}

/**
 * Feedback event from task execution
 */
export interface FeedbackEvent {
  /** Task that was executed */
  task: QETask;
  /** Whether execution was successful */
  success: boolean;
  /** Execution duration in ms */
  duration: number;
  /** Quality score (0-1) if available */
  quality?: number;
  /** Result data */
  result?: unknown;
  /** Error if failed */
  error?: Error;
  /** Patterns used during execution */
  patternsUsed?: string[];
  /** Timestamp */
  timestamp: Date;
}

/**
 * Analysis result from feedback processing
 */
export interface FeedbackAnalysis {
  /** Overall success rate */
  successRate: number;
  /** Average quality score */
  avgQuality: number;
  /** Average duration */
  avgDuration: number;
  /** Performance trend (-1 to 1, negative = declining) */
  performanceTrend: number;
  /** Patterns that need reinforcement */
  patternsToReinforce: string[];
  /** Patterns that are underperforming */
  patternsToReview: string[];
  /** Recommended adaptations */
  recommendations: Adaptation[];
  /** Drift detected */
  driftDetected: boolean;
}

/**
 * Recommended adaptation action
 */
export interface Adaptation {
  /** Adaptation type */
  type: 'reinforce' | 'retrain' | 'prune' | 'consolidate';
  /** Target (pattern ID, model, etc.) */
  target: string;
  /** Reason for adaptation */
  reason: string;
  /** Priority (1-5, 5 being highest) */
  priority: number;
}

/**
 * SONA Feedback Loop implementation
 */
export class SONAFeedbackLoop {
  private readonly config: Required<FeedbackLoopConfig>;
  private readonly logger: Logger;
  private learningStrategy?: SONALearningStrategy;
  private feedbackBuffer: FeedbackEvent[] = [];
  private analysisHistory: FeedbackAnalysis[] = [];
  private patternPerformance: Map<string, { successes: number; failures: number }> = new Map();
  private isProcessing = false;

  constructor(config: FeedbackLoopConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      minExecutionsForAnalysis: config.minExecutionsForAnalysis ?? 10,
      batchSize: config.batchSize ?? 20,
      adaptiveLearningRate: config.adaptiveLearningRate ?? true,
      adaptationThreshold: config.adaptationThreshold ?? 0.7,
      enableDriftDetection: config.enableDriftDetection ?? true,
      driftWindowSize: config.driftWindowSize ?? 50,
    };

    this.logger = Logger.getInstance();
  }

  /**
   * Connect to a learning strategy
   */
  connect(strategy: SONALearningStrategy): void {
    this.learningStrategy = strategy;
    this.logger.info('SONA Feedback Loop connected to learning strategy');
  }

  /**
   * Record feedback from task execution
   */
  async recordFeedback(event: FeedbackEvent): Promise<void> {
    if (!this.config.enabled) return;

    this.feedbackBuffer.push(event);

    // Track pattern performance
    if (event.patternsUsed) {
      for (const patternId of event.patternsUsed) {
        const perf = this.patternPerformance.get(patternId) || { successes: 0, failures: 0 };
        if (event.success) {
          perf.successes++;
        } else {
          perf.failures++;
        }
        this.patternPerformance.set(patternId, perf);
      }
    }

    // Forward to learning strategy
    if (this.learningStrategy) {
      await this.learningStrategy.recordExecution({
        task: event.task,
        success: event.success,
        duration: event.duration,
        result: event.result,
        error: event.error,
      });
    }

    // Process batch if buffer is full
    if (this.feedbackBuffer.length >= this.config.batchSize) {
      await this.processFeedbackBatch();
    }
  }

  /**
   * Process accumulated feedback and generate adaptations
   */
  async processFeedbackBatch(): Promise<FeedbackAnalysis | null> {
    if (this.isProcessing || this.feedbackBuffer.length < this.config.minExecutionsForAnalysis) {
      return null;
    }

    this.isProcessing = true;

    try {
      // Analyze feedback
      const analysis = this.analyzeFeedback(this.feedbackBuffer);
      this.analysisHistory.push(analysis);

      // Keep history bounded
      if (this.analysisHistory.length > 100) {
        this.analysisHistory.shift();
      }

      // Apply adaptations
      await this.applyAdaptations(analysis);

      // Clear processed feedback
      this.feedbackBuffer = [];

      this.logger.info('Feedback batch processed', {
        successRate: analysis.successRate.toFixed(2),
        adaptations: analysis.recommendations.length,
        driftDetected: analysis.driftDetected,
      });

      return analysis;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Analyze feedback batch
   */
  private analyzeFeedback(events: FeedbackEvent[]): FeedbackAnalysis {
    const successes = events.filter(e => e.success);
    const successRate = events.length > 0 ? successes.length / events.length : 0;

    const qualityEvents = events.filter(e => e.quality !== undefined);
    const avgQuality = qualityEvents.length > 0
      ? qualityEvents.reduce((sum, e) => sum + (e.quality ?? 0), 0) / qualityEvents.length
      : 0;

    const avgDuration = events.length > 0
      ? events.reduce((sum, e) => sum + e.duration, 0) / events.length
      : 0;

    // Calculate performance trend
    const performanceTrend = this.calculatePerformanceTrend(events);

    // Detect drift
    const driftDetected = this.detectDrift();

    // Identify patterns to reinforce or review
    const { patternsToReinforce, patternsToReview } = this.analyzePatternPerformance();

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      successRate,
      avgQuality,
      performanceTrend,
      driftDetected,
      patternsToReinforce,
      patternsToReview,
    });

    return {
      successRate,
      avgQuality,
      avgDuration,
      performanceTrend,
      patternsToReinforce,
      patternsToReview,
      recommendations,
      driftDetected,
    };
  }

  /**
   * Calculate performance trend
   */
  private calculatePerformanceTrend(events: FeedbackEvent[]): number {
    if (events.length < 10) return 0;

    const halfPoint = Math.floor(events.length / 2);
    const firstHalf = events.slice(0, halfPoint);
    const secondHalf = events.slice(halfPoint);

    const firstRate = firstHalf.filter(e => e.success).length / firstHalf.length;
    const secondRate = secondHalf.filter(e => e.success).length / secondHalf.length;

    return secondRate - firstRate; // Positive = improving, negative = declining
  }

  /**
   * Detect performance drift
   */
  private detectDrift(): boolean {
    if (!this.config.enableDriftDetection) return false;
    if (this.analysisHistory.length < 3) return false;

    const recentAnalyses = this.analysisHistory.slice(-3);
    const avgRecentSuccessRate = recentAnalyses.reduce((sum, a) => sum + a.successRate, 0) / recentAnalyses.length;

    // Check for significant decline
    const olderAnalyses = this.analysisHistory.slice(-6, -3);
    if (olderAnalyses.length === 0) return false;

    const avgOlderSuccessRate = olderAnalyses.reduce((sum, a) => sum + a.successRate, 0) / olderAnalyses.length;

    // Drift if success rate dropped by more than 15%
    return (avgOlderSuccessRate - avgRecentSuccessRate) > 0.15;
  }

  /**
   * Analyze pattern performance
   */
  private analyzePatternPerformance(): {
    patternsToReinforce: string[];
    patternsToReview: string[];
  } {
    const patternsToReinforce: string[] = [];
    const patternsToReview: string[] = [];

    for (const [patternId, perf] of this.patternPerformance.entries()) {
      const total = perf.successes + perf.failures;
      if (total < 5) continue; // Need sufficient data

      const successRate = perf.successes / total;

      if (successRate >= 0.8) {
        patternsToReinforce.push(patternId);
      } else if (successRate < 0.5) {
        patternsToReview.push(patternId);
      }
    }

    return { patternsToReinforce, patternsToReview };
  }

  /**
   * Generate adaptation recommendations
   */
  private generateRecommendations(data: {
    successRate: number;
    avgQuality: number;
    performanceTrend: number;
    driftDetected: boolean;
    patternsToReinforce: string[];
    patternsToReview: string[];
  }): Adaptation[] {
    const recommendations: Adaptation[] = [];

    // Drift detected - trigger retraining
    if (data.driftDetected) {
      recommendations.push({
        type: 'retrain',
        target: 'base-model',
        reason: 'Performance drift detected, model may need retraining',
        priority: 5,
      });
    }

    // Low success rate - consolidate learning
    if (data.successRate < this.config.adaptationThreshold) {
      recommendations.push({
        type: 'consolidate',
        target: 'patterns',
        reason: `Success rate (${(data.successRate * 100).toFixed(1)}%) below threshold`,
        priority: 4,
      });
    }

    // Reinforce high-performing patterns
    for (const patternId of data.patternsToReinforce.slice(0, 5)) {
      recommendations.push({
        type: 'reinforce',
        target: patternId,
        reason: 'High-performing pattern should be reinforced',
        priority: 3,
      });
    }

    // Review underperforming patterns
    for (const patternId of data.patternsToReview.slice(0, 5)) {
      recommendations.push({
        type: 'prune',
        target: patternId,
        reason: 'Underperforming pattern should be reviewed or pruned',
        priority: 2,
      });
    }

    // Declining performance trend
    if (data.performanceTrend < -0.1) {
      recommendations.push({
        type: 'retrain',
        target: 'micro-lora',
        reason: 'Declining performance trend detected',
        priority: 3,
      });
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Apply adaptations based on analysis
   */
  private async applyAdaptations(analysis: FeedbackAnalysis): Promise<void> {
    if (!this.learningStrategy) return;

    for (const adaptation of analysis.recommendations) {
      try {
        switch (adaptation.type) {
          case 'reinforce':
            await this.learningStrategy.updatePatternConfidence(adaptation.target, true);
            break;

          case 'prune':
            await this.learningStrategy.updatePatternConfidence(adaptation.target, false);
            break;

          case 'consolidate':
            await this.learningStrategy.train(5);
            break;

          case 'retrain':
            await this.learningStrategy.train(10);
            break;
        }

        this.logger.debug('Applied adaptation', {
          type: adaptation.type,
          target: adaptation.target,
        });
      } catch (error) {
        this.logger.warn('Failed to apply adaptation', {
          type: adaptation.type,
          target: adaptation.target,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Get current metrics
   */
  async getMetrics(): Promise<{
    feedbackPending: number;
    analysisCount: number;
    currentSuccessRate: number;
    performanceTrend: number;
    patternsTracked: number;
  }> {
    const recentAnalysis = this.analysisHistory.slice(-1)[0];

    return {
      feedbackPending: this.feedbackBuffer.length,
      analysisCount: this.analysisHistory.length,
      currentSuccessRate: recentAnalysis?.successRate ?? 0,
      performanceTrend: recentAnalysis?.performanceTrend ?? 0,
      patternsTracked: this.patternPerformance.size,
    };
  }

  /**
   * Force immediate analysis (for testing or manual triggers)
   */
  async forceAnalysis(): Promise<FeedbackAnalysis | null> {
    if (this.feedbackBuffer.length === 0) return null;

    const previousMin = this.config.minExecutionsForAnalysis;
    (this.config as { minExecutionsForAnalysis: number }).minExecutionsForAnalysis = 1;

    const result = await this.processFeedbackBatch();

    (this.config as { minExecutionsForAnalysis: number }).minExecutionsForAnalysis = previousMin;

    return result;
  }

  /**
   * Reset feedback loop state
   */
  reset(): void {
    this.feedbackBuffer = [];
    this.analysisHistory = [];
    this.patternPerformance.clear();
    this.isProcessing = false;
  }
}

/**
 * Create a feedback loop instance
 */
export function createFeedbackLoop(config?: FeedbackLoopConfig): SONAFeedbackLoop {
  return new SONAFeedbackLoop(config);
}

/**
 * Integration helper - create and connect feedback loop to strategy
 */
export function createConnectedFeedbackLoop(
  strategy: SONALearningStrategy,
  config?: FeedbackLoopConfig
): SONAFeedbackLoop {
  const loop = new SONAFeedbackLoop(config);
  loop.connect(strategy);
  return loop;
}
