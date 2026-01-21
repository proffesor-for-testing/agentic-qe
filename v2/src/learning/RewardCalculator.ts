/**
 * RewardCalculator - Calculate rewards from task execution results
 *
 * Implements reward function for Q-learning based on:
 * - Task success/failure
 * - Execution time
 * - Resource usage
 * - Output quality
 * - Code coverage (for test generation)
 */

import { LearningFeedback } from './types';

export interface RewardConfig {
  // Weight factors for different reward components
  successWeight: number; // Success/failure importance
  timeWeight: number; // Execution time importance
  qualityWeight: number; // Output quality importance
  resourceWeight: number; // Resource efficiency importance
  feedbackWeight: number; // User feedback importance

  // Baseline values for normalization
  baselineTime: number; // Expected execution time (ms)
  baselineCoverage: number; // Expected code coverage (0-1)

  // Penalty factors
  errorPenalty: number; // Penalty per error
  timeoutPenalty: number; // Penalty for timeout
}

const DEFAULT_CONFIG: RewardConfig = {
  successWeight: 1.0,
  timeWeight: 0.5,
  qualityWeight: 0.7,
  resourceWeight: 0.3,
  feedbackWeight: 0.5,
  baselineTime: 30000, // 30 seconds
  baselineCoverage: 0.8, // 80%
  errorPenalty: 0.2,
  timeoutPenalty: 0.5
};

export interface TaskResult {
  success: boolean;
  executionTime?: number; // in milliseconds
  errors?: Array<{ message: string; type: string }>;
  coverage?: number; // 0-1
  quality?: number; // 0-1
  resourceUsage?: {
    cpu?: number; // 0-1
    memory?: number; // 0-1
  };
  timeout?: boolean;
  metadata?: Record<string, any>;
}

/**
 * RewardCalculator - Calculate rewards for reinforcement learning
 */
export class RewardCalculator {
  private readonly config: RewardConfig;

  constructor(config: Partial<RewardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate reward from task result and optional feedback
   * Returns normalized reward in range [-2, 2]
   */
  calculateReward(result: TaskResult, feedback?: LearningFeedback): number {
    let reward = 0;

    // Component 1: Success/failure (most important)
    const successReward = this.calculateSuccessReward(result);
    reward += successReward * this.config.successWeight;

    // Component 2: Execution time (faster is better)
    const timeReward = this.calculateTimeReward(result);
    reward += timeReward * this.config.timeWeight;

    // Component 3: Output quality
    const qualityReward = this.calculateQualityReward(result);
    reward += qualityReward * this.config.qualityWeight;

    // Component 4: Resource efficiency
    const resourceReward = this.calculateResourceReward(result);
    reward += resourceReward * this.config.resourceWeight;

    // Component 5: User feedback (if available)
    if (feedback) {
      const feedbackReward = this.calculateFeedbackReward(feedback);
      reward += feedbackReward * this.config.feedbackWeight;
    }

    // Penalties
    reward -= this.calculatePenalties(result);

    // Normalize to [-2, 2] range
    const maxPossibleReward =
      this.config.successWeight +
      this.config.timeWeight +
      this.config.qualityWeight +
      this.config.resourceWeight +
      this.config.feedbackWeight;

    const normalized = (reward / maxPossibleReward) * 2;

    return Math.max(-2, Math.min(2, normalized));
  }

  /**
   * Calculate success/failure reward component
   */
  private calculateSuccessReward(result: TaskResult): number {
    return result.success ? 1.0 : -1.0;
  }

  /**
   * Calculate execution time reward component
   * Faster than baseline = positive reward
   * Slower than baseline = negative reward
   */
  private calculateTimeReward(result: TaskResult): number {
    if (!result.executionTime) return 0;

    const ratio = result.executionTime / this.config.baselineTime;

    // Faster than baseline: positive reward (up to +1.0)
    if (ratio < 1.0) {
      return 1.0 - ratio; // 0.5x baseline = +0.5 reward
    }

    // Slower than baseline: negative reward (down to -1.0)
    return Math.max(-1.0, 1.0 - ratio); // 2x baseline = -1.0 reward
  }

  /**
   * Calculate quality reward component
   * Based on coverage, output correctness, etc.
   */
  private calculateQualityReward(result: TaskResult): number {
    let qualityScore = result.quality || 0;

    // For test generation tasks, coverage is a key quality metric
    if (result.coverage !== undefined) {
      const coverageScore = (result.coverage - this.config.baselineCoverage) * 2;
      qualityScore = Math.max(qualityScore, coverageScore);
    }

    return Math.max(-1.0, Math.min(1.0, qualityScore));
  }

  /**
   * Calculate resource efficiency reward component
   */
  private calculateResourceReward(result: TaskResult): number {
    if (!result.resourceUsage) return 0;

    const { cpu = 0.5, memory = 0.5 } = result.resourceUsage;

    // Lower resource usage = better reward
    const cpuScore = 1.0 - cpu;
    const memoryScore = 1.0 - memory;

    return (cpuScore + memoryScore) / 2;
  }

  /**
   * Calculate reward from user feedback
   */
  private calculateFeedbackReward(feedback: LearningFeedback): number {
    let reward = 0;

    // Rating component (0-1 → -1 to +1)
    reward += (feedback.rating - 0.5) * 2;

    // Issues penalty
    reward -= feedback.issues.length * 0.1;

    // Suggestions indicate room for improvement
    reward -= feedback.suggestions.length * 0.05;

    return Math.max(-1.0, Math.min(1.0, reward));
  }

  /**
   * Calculate penalties for errors and timeouts
   */
  private calculatePenalties(result: TaskResult): number {
    let penalty = 0;

    // Error penalty
    if (result.errors && result.errors.length > 0) {
      penalty += result.errors.length * this.config.errorPenalty;
    }

    // Timeout penalty
    if (result.timeout) {
      penalty += this.config.timeoutPenalty;
    }

    return penalty;
  }

  /**
   * Get reward breakdown for debugging
   */
  getRewardBreakdown(result: TaskResult, feedback?: LearningFeedback): {
    total: number;
    components: {
      success: number;
      time: number;
      quality: number;
      resource: number;
      feedback: number;
    };
    penalties: number;
  } {
    const components = {
      success: this.calculateSuccessReward(result) * this.config.successWeight,
      time: this.calculateTimeReward(result) * this.config.timeWeight,
      quality: this.calculateQualityReward(result) * this.config.qualityWeight,
      resource: this.calculateResourceReward(result) * this.config.resourceWeight,
      feedback: feedback
        ? this.calculateFeedbackReward(feedback) * this.config.feedbackWeight
        : 0
    };

    const penalties = this.calculatePenalties(result);
    const total = Object.values(components).reduce((a, b) => a + b, 0) - penalties;

    return {
      total: Math.max(-2, Math.min(2, total)),
      components,
      penalties
    };
  }

  /**
   * Update reward config dynamically
   */
  updateConfig(updates: Partial<RewardConfig>): void {
    Object.assign(this.config, updates);
  }

  /**
   * Get current config
   */
  getConfig(): RewardConfig {
    return { ...this.config };
  }
}
