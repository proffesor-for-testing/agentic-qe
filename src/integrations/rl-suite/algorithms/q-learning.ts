/**
 * Agentic QE v3 - Q-Learning Algorithm (Neural)
 *
 * Q-Learning with Deep Q-Network (DQN) for Coverage Path Optimization
 * Application: coverage-analysis domain
 */

import { BaseRLAlgorithm } from '../base-algorithm';
import type {
  RLState,
  RLAction,
  RLPrediction,
  RLTrainingStats,
  RLExperience,
  RLAlgorithmInfo,
} from '../interfaces';
import { TEST_EXECUTION_REWARDS } from '../interfaces';
import {
  NeuralNetwork,
  ReLU,
  Linear,
  MSELoss,
  ReplayBuffer,
} from '../neural';

// ============================================================================
// Q-Learning Configuration
// ============================================================================

interface QLearningConfig {
  /** State feature size */
  stateSize: number;
  /** Number of discrete actions */
  actionSize: number;
  /** Hidden layer sizes */
  hiddenLayers: number[];
  /** Target network update frequency */
  targetUpdateFreq: number;
  /** Minimum replay buffer size for training */
  minReplaySize: number;
  /** Whether to use double DQN */
  doubleDQN: boolean;
  /** Gradient clipping */
  maxGradNorm: number;
}

const DEFAULT_QLEARNING_CONFIG: QLearningConfig = {
  stateSize: 10,
  actionSize: 4,
  hiddenLayers: [128, 128],
  targetUpdateFreq: 100,
  minReplaySize: 100,
  doubleDQN: true,
  maxGradNorm: 1.0,
};

// ============================================================================
// Neural Q-Learning Implementation
// ============================================================================

/**
 * Neural Q-Learning algorithm for Coverage Path Optimization
 *
 * Application: Optimize the order and type of tests to maximize coverage gain
 * Domain: coverage-analysis
 *
 * Key features:
 * - Deep Q-Network for function approximation
 * - Experience replay for stable learning
 * - Target network for consistent targets
 * - Optional Double DQN
 */
export class QLearningAlgorithm extends BaseRLAlgorithm {
  private qNetwork: NeuralNetwork;
  private targetNetwork: NeuralNetwork;
  private replayBufferClass: ReplayBuffer;
  private qConfig: QLearningConfig;
  private updateCount = 0;
  private actions: RLAction[] = [];

  constructor(
    config: Partial<QLearningConfig> = {},
    rewardSignals = TEST_EXECUTION_REWARDS
  ) {
    super('q-learning', 'value-based', {}, rewardSignals);
    this.qConfig = { ...DEFAULT_QLEARNING_CONFIG, ...config };

    // Initialize Q-network
    this.qNetwork = new NeuralNetwork({
      layerSizes: [this.qConfig.stateSize, ...this.qConfig.hiddenLayers, this.qConfig.actionSize],
      activations: Array(this.qConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    // Initialize target network (copy of Q-network)
    this.targetNetwork = this.qNetwork.clone();

    // Initialize replay buffer
    this.replayBufferClass = new ReplayBuffer(this.config.replayBufferSize, false);

    // Initialize action space
    this.initializeActions();
  }

  // ========================================================================
  // Public Interface
  // ========================================================================

  /**
   * Predict best action for state using Q-values
   */
  async predict(state: RLState): Promise<RLPrediction> {
    if (!this.initialized) {
      await this.initialize();
    }

    const stateFeatures = this.prepareState(state);
    const qValues = this.targetNetwork.forward(stateFeatures);

    // Get best action
    const actionIndex = this.argmax(qValues);
    const action = this.actions[actionIndex];

    const qValue = qValues[actionIndex];
    const confidence = this.calculateConfidence(qValues);

    return {
      action,
      confidence,
      value: qValue,
      reasoning: this.generateReasoning(state, action, qValue, confidence),
    };
  }

  // ========================================================================
  // Protected Implementation
  // ========================================================================

  /**
   * Core Q-Learning training logic
   */
  protected async trainCore(experiences: RLExperience[]): Promise<RLTrainingStats> {
    // Add experiences to replay buffer
    for (const exp of experiences) {
      this.replayBufferClass.add(exp);
    }

    // Check if we have enough experiences
    if (!this.replayBufferClass.isReady(this.qConfig.minReplaySize)) {
      return this.getStats();
    }

    // Sample batch
    const batch = this.replayBufferClass.sample(this.config.batchSize);
    if (batch.length === 0) {
      return this.getStats();
    }

    let totalLoss = 0;

    // Train on batch
    for (const exp of batch) {
      const stateFeatures = this.prepareState(exp.state);
      const nextStateFeatures = this.prepareState(exp.nextState);

      // Calculate target
      let target: number;
      const currentQValues = this.qNetwork.forward(stateFeatures);
      const actionIndex = this.actionToIndex(exp.action);

      if (this.qConfig.doubleDQN && !exp.done) {
        // Double DQN: use main network to select action, target network to evaluate
        const nextQValuesMain = this.qNetwork.forward(nextStateFeatures);
        const nextActionIndex = this.argmax(nextQValuesMain);
        const nextQValuesTarget = this.targetNetwork.forward(nextStateFeatures);
        const nextQ = nextQValuesTarget[nextActionIndex];
        target = exp.reward + this.config.discountFactor * nextQ;
      } else {
        // Standard DQN
        const nextQValues = this.targetNetwork.forward(nextStateFeatures);
        const maxNextQ = Math.max(...nextQValues);
        target = exp.reward + this.config.discountFactor * maxNextQ * (exp.done ? 0 : 1);
      }

      // Create target array
      const targetArray = new Float32Array(currentQValues.length);
      for (let i = 0; i < targetArray.length; i++) {
        targetArray[i] = i === actionIndex ? target : currentQValues[i];
      }

      // Train network
      const loss = this.qNetwork.train(stateFeatures, targetArray, new MSELoss());
      totalLoss += Math.abs(loss);
    }

    // Update target network periodically
    this.updateCount++;
    if (this.updateCount % this.qConfig.targetUpdateFreq === 0) {
      this.updateTargetNetwork();
    }

    return {
      episode: this.episodeCount,
      totalReward: this.totalReward,
      averageReward: this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length,
      loss: totalLoss / batch.length,
      explorationRate: this.config.explorationRate,
      trainingTimeMs: 0,
      timestamp: new Date(),
    };
  }

  /**
   * Get algorithm-specific info
   */
  protected getAlgorithmInfo(): RLAlgorithmInfo {
    return {
      type: this.type,
      category: this.category,
      version: '2.0.0',
      description: 'Neural Q-Learning (DQN) for Coverage Path Optimization',
      capabilities: [
        'Deep Q-Network for function approximation',
        'Experience replay for stable learning',
        'Target network for consistent targets',
        'Double DQN for reduced overestimation',
        'Coverage-aware test prioritization',
      ],
      hyperparameters: {
        stateSize: this.qConfig.stateSize,
        actionSize: this.qConfig.actionSize,
        hiddenLayers: this.qConfig.hiddenLayers.join(','),
        targetUpdateFreq: this.qConfig.targetUpdateFreq,
        doubleDQN: String(this.qConfig.doubleDQN),
      },
      stats: this.stats,
    };
  }

  // ========================================================================
  // Neural Network Management
  // ========================================================================

  private updateTargetNetwork(): void {
    this.targetNetwork = this.qNetwork.clone();
  }

  // ========================================================================
  // State Preparation
  // ========================================================================

  private prepareState(state: RLState): Float32Array {
    // Normalize and pad/crop features to fixed size
    const features = state.features.slice(0, this.qConfig.stateSize);

    // Pad with zeros if needed
    while (features.length < this.qConfig.stateSize) {
      features.push(0);
    }

    // Normalize to [0, 1]
    const max = Math.max(...features.map(Math.abs));
    if (max > 0) {
      for (let i = 0; i < features.length; i++) {
        features[i] = features[i] / max;
      }
    }

    return new Float32Array(features);
  }

  // ========================================================================
  // Action Management
  // ========================================================================

  private initializeActions(): void {
    this.actions = [
      { type: 'generate-unit', value: 'standard' },
      { type: 'generate-integration', value: 'standard' },
      { type: 'prioritize', value: 'high' },
      { type: 'skip', value: 0 },
    ];

    // Update action size
    this.qConfig.actionSize = this.actions.length;

    // Recreate networks with correct action size
    this.qNetwork = new NeuralNetwork({
      layerSizes: [this.qConfig.stateSize, ...this.qConfig.hiddenLayers, this.qConfig.actionSize],
      activations: Array(this.qConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });
    this.targetNetwork = this.qNetwork.clone();
  }

  private actionToIndex(action: RLAction): number {
    const key = this.actionToKey(action);
    for (let i = 0; i < this.actions.length; i++) {
      if (this.actionToKey(this.actions[i]) === key) {
        return i;
      }
    }
    return 0; // Default to first action
  }

  private indexToAction(index: number): RLAction {
    return this.actions[Math.min(index, this.actions.length - 1)];
  }

  // ========================================================================
  // Helpers
  // ========================================================================

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

  private actionToKey(action: RLAction): string {
    return `${action.type}:${JSON.stringify(action.value)}`;
  }

  private calculateConfidence(qValues: Float32Array): number {
    const maxQ = Math.max(...qValues);
    const minQ = Math.min(...qValues);

    if (maxQ === minQ) return 0.5;

    // Confidence based on Q-value spread
    const spread = maxQ - minQ;
    return Math.min(1, 0.3 + spread * 2);
  }

  private generateReasoning(state: RLState, action: RLAction, qValue: number, confidence: number): string {
    if (this.episodeCount < 10) {
      return `Neural Q-Learning exploration phase (episode ${this.episodeCount}): ${action.type} action`;
    }

    if (confidence > 0.8) {
      return `High-confidence Neural Q-Learning decision (${confidence.toFixed(2)}): ${action.type} ` +
        `with Q-value ${qValue.toFixed(3)} based on ${this.updateCount} network updates`;
    }

    if (qValue > 0.5) {
      return `Positive Q-value (${qValue.toFixed(3)}) suggests ${action.type} is effective ` +
        `for current coverage state`;
    }

    return `Exploratory Neural Q-Learning action: ${action.type} with confidence ${confidence.toFixed(2)}`;
  }

  // ========================================================================
  // Export/Import Override
  // ========================================================================

  protected async exportCustomData(): Promise<Record<string, unknown>> {
    return {
      qNetwork: this.qNetwork.getParameters(),
      targetNetwork: this.targetNetwork.getParameters(),
      qConfig: this.qConfig,
      updateCount: this.updateCount,
      replayBufferSize: this.replayBufferClass.size(),
    };
  }

  protected async importCustomData(data: Record<string, unknown>): Promise<void> {
    if (data.qNetwork) {
      this.qNetwork.setParameters(data.qNetwork as { layers: Array<{ weights: number[]; biases: number[] }> });
    }

    if (data.targetNetwork) {
      this.targetNetwork.setParameters(data.targetNetwork as { layers: Array<{ weights: number[]; biases: number[] }> });
    }

    if (data.qConfig) {
      this.qConfig = { ...this.qConfig, ...data.qConfig as QLearningConfig };
    }

    if (typeof data.updateCount === 'number') {
      this.updateCount = data.updateCount;
    }

    this.initialized = true;
  }

  protected async resetAlgorithm(): Promise<void> {
    // Recreate networks
    this.qNetwork = new NeuralNetwork({
      layerSizes: [this.qConfig.stateSize, ...this.qConfig.hiddenLayers, this.qConfig.actionSize],
      activations: Array(this.qConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });
    this.targetNetwork = this.qNetwork.clone();

    // Clear replay buffer
    this.replayBufferClass.clear();

    this.updateCount = 0;
  }
}
