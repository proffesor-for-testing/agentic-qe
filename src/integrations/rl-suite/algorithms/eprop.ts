/**
 * Agentic QE v3 - E-prop Online Learning Algorithm (ADR-087 Milestone 4)
 *
 * RL algorithm #10: Eligibility propagation for online learning.
 * Uses 12 bytes/synapse with no backprop required.
 *
 * Application: Online adaptive test strategies — learns in real time
 * from test execution feedback without storing replay buffers.
 */

import { BaseRLAlgorithm } from '../base-algorithm';
import type {
  RLState,
  RLPrediction,
  RLTrainingStats,
  RLExperience,
  RLAlgorithmInfo,
  RLAlgorithmType,
  RLAlgorithmCategory,
  RewardSignal,
} from '../interfaces';
import { TEST_EXECUTION_REWARDS } from '../interfaces';
import {
  EpropNetwork,
  createEpropNetwork,
} from '../../ruvector/eprop-learner.js';
import type { EpropConfig } from '../../ruvector/eprop-learner.js';
import { getRuVectorFeatureFlags } from '../../ruvector/feature-flags.js';

// ============================================================================
// E-prop Algorithm Configuration
// ============================================================================

interface EpropAlgorithmConfig {
  /** Number of state features */
  stateSize: number;
  /** Hidden layer size for the E-prop network */
  hiddenSize: number;
  /** Number of discrete actions */
  actionSize: number;
  /** E-prop learning rate */
  epropLearningRate: number;
  /** Eligibility trace decay */
  eligibilityDecay: number;
  /** Use feedback alignment */
  feedbackAlignment: boolean;
}

const DEFAULT_EPROP_ALGORITHM_CONFIG: EpropAlgorithmConfig = {
  stateSize: 10,
  hiddenSize: 50,
  actionSize: 4,
  epropLearningRate: 0.01,
  eligibilityDecay: 0.95,
  feedbackAlignment: true,
};

// ============================================================================
// E-prop RL Algorithm
// ============================================================================

/**
 * E-prop online learning algorithm for adaptive test strategies.
 *
 * Unlike batch RL algorithms, E-prop learns from each experience
 * immediately using eligibility traces — no replay buffer needed.
 *
 * Key advantages:
 * - Online: updates weights after every step
 * - Memory-efficient: 12 bytes/synapse (vs kilobytes for replay-based)
 * - Biologically plausible: no weight transport (feedback alignment)
 * - Fast: no backward pass through the full network
 */
export class EpropAlgorithm extends BaseRLAlgorithm {
  private network: EpropNetwork;
  private epropConfig: EpropAlgorithmConfig;
  private actions: Array<{ type: string; value: string | number }>;

  constructor(
    config: Partial<EpropAlgorithmConfig> = {},
    rewardSignals: RewardSignal[] = TEST_EXECUTION_REWARDS
  ) {
    super(
      'eprop',
      'online-learning',
      {},
      rewardSignals
    );

    this.epropConfig = { ...DEFAULT_EPROP_ALGORITHM_CONFIG, ...config };

    // Create the underlying E-prop network
    this.network = createEpropNetwork({
      inputSize: this.epropConfig.stateSize,
      hiddenSize: this.epropConfig.hiddenSize,
      outputSize: this.epropConfig.actionSize,
      learningRate: this.epropConfig.epropLearningRate,
      eligibilityDecay: this.epropConfig.eligibilityDecay,
      feedbackAlignment: this.epropConfig.feedbackAlignment,
    });

    // Default action space for test execution
    this.actions = [
      { type: 'execute', value: 'standard' },
      { type: 'prioritize', value: 'high' },
      { type: 'retry', value: 'adaptive' },
      { type: 'skip', value: 0 },
    ];

    // Trim or pad action space to match config
    while (this.actions.length < this.epropConfig.actionSize) {
      this.actions.push({ type: 'explore', value: this.actions.length });
    }
    this.actions = this.actions.slice(0, this.epropConfig.actionSize);
  }

  // ==========================================================================
  // RLAlgorithm Interface
  // ==========================================================================

  /**
   * Predict best action for a given state.
   * Runs the E-prop network forward pass and selects the action
   * with highest output activation.
   */
  async predict(state: RLState): Promise<RLPrediction> {
    if (!getRuVectorFeatureFlags().useEpropOnlineLearning) {
      // Feature flag disabled — return default action with zero confidence
      return {
        action: { type: this.actions[0]?.type ?? 'test-action', value: this.actions[0]?.value ?? 'default' },
        confidence: 0,
      };
    }

    if (!this.initialized) {
      await this.initialize();
    }

    const stateFeatures = this.prepareState(state);
    const output = this.network.forward(stateFeatures);

    // Select action with highest activation
    const actionIndex = this.argmax(output);
    const action = this.actions[actionIndex];
    const confidence = this.calculateConfidence(output);

    return {
      action: { type: action.type, value: action.value },
      confidence,
      value: output[actionIndex],
      reasoning: this.generateReasoning(action, output[actionIndex], confidence),
    };
  }

  /**
   * Train with a single experience — the core online learning step.
   *
   * Unlike batch algorithms, E-prop processes each experience immediately:
   * 1. Forward pass (already done during predict)
   * 2. Online update: dw = eta * eligibility * reward
   */
  async train(experience: RLExperience): Promise<RLTrainingStats> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    // Run forward pass on the state to update eligibility traces
    const stateFeatures = this.prepareState(experience.state);
    this.network.forward(stateFeatures);

    // Apply online update with reward signal
    this.network.updateOnline(experience.reward);

    // Reset traces if episode ended
    if (experience.done) {
      this.network.resetTraces();
    }

    // Track stats
    this.episodeCount++;
    this.totalReward += experience.reward;
    this.rewardHistory.push(experience.reward);
    if (this.rewardHistory.length > 1000) {
      this.rewardHistory.shift();
    }

    const avgReward = this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length;

    this.stats = {
      episode: this.episodeCount,
      totalReward: this.totalReward,
      averageReward: avgReward,
      trainingTimeMs: Date.now() - startTime,
      timestamp: new Date(),
      explorationRate: this.config.explorationRate,
    };

    return this.stats;
  }

  /**
   * Core training logic for batch experiences.
   * E-prop processes each experience online (sequentially).
   */
  protected async trainCore(experiences: RLExperience[]): Promise<RLTrainingStats> {
    for (const exp of experiences) {
      const stateFeatures = this.prepareState(exp.state);
      this.network.forward(stateFeatures);
      this.network.updateOnline(exp.reward);

      if (exp.done) {
        this.network.resetTraces();
      }
    }

    const avgReward = this.rewardHistory.length > 0
      ? this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length
      : 0;

    return {
      episode: this.episodeCount,
      totalReward: this.totalReward,
      averageReward: avgReward,
      trainingTimeMs: 0,
      timestamp: new Date(),
    };
  }

  /**
   * Get algorithm-specific info.
   */
  protected getAlgorithmInfo(): RLAlgorithmInfo {
    const networkStats = this.network.getStats();

    return {
      type: 'eprop' as RLAlgorithmType,
      category: 'online-learning' as RLAlgorithmCategory,
      version: '1.0.0',
      description: 'E-prop Online Learning for Adaptive Test Strategies',
      capabilities: [
        'Online learning (no replay buffer)',
        'Eligibility trace propagation',
        'Feedback alignment (no weight transport)',
        '12 bytes/synapse memory budget',
        'Real-time adaptation to test results',
      ],
      hyperparameters: {
        stateSize: this.epropConfig.stateSize,
        hiddenSize: this.epropConfig.hiddenSize,
        actionSize: this.epropConfig.actionSize,
        learningRate: this.epropConfig.epropLearningRate,
        eligibilityDecay: this.epropConfig.eligibilityDecay,
        feedbackAlignment: String(this.epropConfig.feedbackAlignment),
        synapsCount: networkStats.synapsCount,
        memoryBytes: networkStats.memoryBytes,
      },
      stats: this.stats,
    };
  }

  // ==========================================================================
  // Export / Import
  // ==========================================================================

  protected async exportCustomData(): Promise<Record<string, unknown>> {
    const weights = this.network.exportWeights();
    return {
      inputHidden: Array.from(weights.inputHidden),
      hiddenOutput: Array.from(weights.hiddenOutput),
      epropConfig: this.epropConfig,
      networkStats: this.network.getStats(),
    };
  }

  protected async importCustomData(data: Record<string, unknown>): Promise<void> {
    if (data.epropConfig) {
      this.epropConfig = { ...this.epropConfig, ...data.epropConfig as EpropAlgorithmConfig };
    }

    if (data.inputHidden && data.hiddenOutput) {
      this.network.importWeights({
        inputHidden: new Float32Array(data.inputHidden as number[]),
        hiddenOutput: new Float32Array(data.hiddenOutput as number[]),
      });
    }

    this.initialized = true;
  }

  protected async resetAlgorithm(): Promise<void> {
    this.network = createEpropNetwork({
      inputSize: this.epropConfig.stateSize,
      hiddenSize: this.epropConfig.hiddenSize,
      outputSize: this.epropConfig.actionSize,
      learningRate: this.epropConfig.epropLearningRate,
      eligibilityDecay: this.epropConfig.eligibilityDecay,
      feedbackAlignment: this.epropConfig.feedbackAlignment,
    });
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private prepareState(state: RLState): Float32Array {
    const features = state.features.slice(0, this.epropConfig.stateSize);

    // Pad with zeros if needed
    while (features.length < this.epropConfig.stateSize) {
      features.push(0);
    }

    // Normalize to [-1, 1]
    const max = Math.max(...features.map(Math.abs));
    if (max > 0) {
      for (let i = 0; i < features.length; i++) {
        features[i] = features[i] / max;
      }
    }

    return new Float32Array(features);
  }

  private argmax(array: Float32Array): number {
    let maxIndex = 0;
    let maxValue = array[0];
    for (let i = 1; i < array.length; i++) {
      if (array[i] > maxValue) {
        maxValue = array[i];
        maxIndex = i;
      }
    }
    return maxIndex;
  }

  private calculateConfidence(output: Float32Array): number {
    const arr = Array.from(output);
    const max = Math.max(...arr);
    const min = Math.min(...arr);
    if (max === min) return 0.5;
    const spread = max - min;
    return Math.min(1, 0.3 + spread * 2);
  }

  private generateReasoning(
    action: { type: string; value: string | number },
    value: number,
    confidence: number
  ): string {
    const stats = this.network.getStats();

    if (stats.totalSteps < 10) {
      return `E-prop exploration phase (step ${stats.totalSteps}): ${action.type} action`;
    }

    if (confidence > 0.8) {
      return (
        `High-confidence E-prop decision (${confidence.toFixed(2)}): ${action.type} ` +
        `with value ${value.toFixed(3)} after ${stats.totalSteps} online updates`
      );
    }

    return `E-prop online learning: ${action.type} with confidence ${confidence.toFixed(2)}`;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new E-prop RL algorithm instance.
 */
export function createEpropAlgorithm(
  config?: Partial<EpropAlgorithmConfig>,
  rewardSignals?: RewardSignal[]
): EpropAlgorithm {
  return new EpropAlgorithm(config, rewardSignals);
}
