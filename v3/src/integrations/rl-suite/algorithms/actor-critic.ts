/**
 * Agentic QE v3 - Actor-Critic Algorithm (Neural)
 *
 * Actor-Critic with Neural Networks for Quality Gate Threshold Tuning
 * Application: quality-assessment domain
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
import {
  NeuralNetwork,
  ReLU,
  Linear,
  Sigmoid,
  Softmax,
  MSELoss,
  CrossEntropyLoss,
} from '../neural';

// ============================================================================
// Actor-Critic Configuration
// ============================================================================

interface ActorCriticConfig {
  /** State feature size */
  stateSize: number;
  /** Number of discrete actions */
  actionSize: number;
  /** Actor hidden layer sizes */
  actorHiddenLayers: number[];
  /** Critic hidden layer sizes */
  criticHiddenLayers: number[];
  /** Actor network learning rate */
  actorLR: number;
  /** Critic network learning rate */
  criticLR: number;
  /** Entropy regularization coefficient */
  entropyCoeff: number;
}

const DEFAULT_AC_CONFIG: ActorCriticConfig = {
  stateSize: 10,
  actionSize: 4,
  actorHiddenLayers: [64, 64],
  criticHiddenLayers: [64, 64],
  actorLR: 0.0001,
  criticLR: 0.001,
  entropyCoeff: 0.01,
};

// ============================================================================
// Neural Actor-Critic Implementation
// ============================================================================

/**
 * Neural Actor-Critic algorithm for Quality Gate Threshold Tuning
 *
 * Application: Dynamically adjust quality gate thresholds based on metrics
 * Domain: quality-assessment
 *
 * Key features:
 * - Neural Actor (policy network)
 * - Neural Critic (value network)
 * - Reduced variance compared to pure policy gradient
 * - Online learning with bootstrapping
 */
export class ActorCriticAlgorithm extends BaseRLAlgorithm {
  private actor: NeuralNetwork;
  private critic: NeuralNetwork;
  private acConfig: ActorCriticConfig;
  private actions: RLAction[] = [];

  constructor(config: Partial<ActorCriticConfig> = {}) {
    super('actor-critic', 'policy-based');
    this.acConfig = { ...DEFAULT_AC_CONFIG, ...config };

    // Initialize action space
    this.initializeActions();

    // Initialize Actor network (policy)
    this.actor = new NeuralNetwork({
      layerSizes: [this.acConfig.stateSize, ...this.acConfig.actorHiddenLayers, this.acConfig.actionSize],
      activations: Array(this.acConfig.actorHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.acConfig.actorLR,
    });

    // Initialize Critic network (value function)
    this.critic = new NeuralNetwork({
      layerSizes: [this.acConfig.stateSize, ...this.acConfig.criticHiddenLayers, 1],
      activations: Array(this.acConfig.criticHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.acConfig.criticLR,
    });
  }

  // ========================================================================
  // Public Interface
  // ========================================================================

  async predict(state: RLState): Promise<RLPrediction> {
    if (!this.initialized) {
      await this.initialize();
    }

    const stateFeatures = this.prepareState(state);

    // Actor: sample action from policy
    const actionProbabilities = Softmax.forward(this.actor.forward(stateFeatures));
    const actionIndex = this.sampleAction(actionProbabilities);
    const action = this.actions[actionIndex];

    // Critic: get state value
    const value = this.critic.forward(stateFeatures)[0];

    const confidence = Math.max(0.3, Math.min(1, actionProbabilities[actionIndex] + 0.3));

    return {
      action,
      confidence,
      value,
      reasoning: this.generateReasoning(state, action, value, actionProbabilities[actionIndex]),
    };
  }

  // ========================================================================
  // Training Implementation
  // ========================================================================

  protected async trainCore(experiences: RLExperience[]): Promise<RLTrainingStats> {
    let totalActorLoss = 0;
    let totalCriticLoss = 0;

    for (const exp of experiences) {
      const stateFeatures = this.prepareState(exp.state);
      const nextStateFeatures = this.prepareState(exp.nextState);
      const actionIndex = this.actionToIndex(exp.action);

      // Get current policy and values
      const actionLogits = this.actor.forward(stateFeatures);
      const actionProbabilities = Softmax.forward(actionLogits);
      const actionLogProb = Math.log(actionProbabilities[actionIndex] + 1e-10);

      const currentValue = this.critic.forward(stateFeatures)[0];
      const nextValue = exp.done ? 0 : this.critic.forward(nextStateFeatures)[0];

      // Calculate TD error
      const tdError = exp.reward + this.config.discountFactor * nextValue - currentValue;

      // Critic update: minimize TD error (MSE)
      const criticTarget = new Float32Array([exp.reward + this.config.discountFactor * nextValue]);
      const criticLoss = this.critic.train(stateFeatures, criticTarget, new MSELoss());

      // Actor update: maximize expected return
      const policyLoss = -actionLogProb * tdError;

      // Entropy bonus
      const entropy = this.calculateEntropy(actionProbabilities);
      const entropyBonus = this.acConfig.entropyCoeff * entropy;
      const totalActorLossValue = policyLoss - entropyBonus;

      // Update actor network with policy gradient
      const actorGradients = new Float32Array(actionProbabilities.length);
      for (let i = 0; i < actorGradients.length; i++) {
        const logProb = Math.log(actionProbabilities[i] + 1e-10);
        const grad = i === actionIndex ? -tdError : 0;
        actorGradients[i] = grad - this.acConfig.entropyCoeff * (actionProbabilities[i] * Math.log(actionProbabilities[i] + 1e-10));
      }

      // Apply policy gradient update manually
      this.actor.backward(actorGradients);
      for (const layer of this.actor.layers) {
        layer.update(this.acConfig.actorLR);
      }

      totalActorLoss += Math.abs(totalActorLossValue);
      totalCriticLoss += Math.abs(criticLoss);
    }

    return {
      episode: this.episodeCount,
      totalReward: this.totalReward,
      averageReward: this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length,
      loss: (totalActorLoss + totalCriticLoss) / experiences.length,
      explorationRate: this.config.explorationRate,
      trainingTimeMs: 0,
      timestamp: new Date(),
    };
  }

  protected getAlgorithmInfo(): RLAlgorithmInfo {
    return {
      type: this.type,
      category: this.category,
      version: '2.0.0',
      description: 'Neural Actor-Critic for Quality Gate Threshold Tuning',
      capabilities: [
        'Neural Actor learns optimal threshold policy',
        'Neural Critic provides value estimates',
        'Lower variance than REINFORCE',
        'Online learning with bootstrapping',
      ],
      hyperparameters: {
        stateSize: this.acConfig.stateSize,
        actionSize: this.acConfig.actionSize,
        actorLR: this.acConfig.actorLR,
        criticLR: this.acConfig.criticLR,
        entropyCoeff: this.acConfig.entropyCoeff,
      },
      stats: this.stats,
    };
  }

  // ========================================================================
  // Actor (Policy) Methods
  // ========================================================================

  private sampleAction(probabilities: Float32Array): number {
    // Epsilon-greedy with policy
    if (Math.random() < this.config.explorationRate) {
      return Math.floor(Math.random() * this.actions.length);
    }

    // Sample from policy
    const rand = Math.random();
    let cumProb = 0;

    for (let i = 0; i < probabilities.length; i++) {
      cumProb += probabilities[i];
      if (rand <= cumProb) {
        return i;
      }
    }

    return this.argmax(probabilities);
  }

  private calculateEntropy(probabilities: Float32Array): number {
    let entropy = 0;
    for (let i = 0; i < probabilities.length; i++) {
      if (probabilities[i] > 0) {
        entropy -= probabilities[i] * Math.log(probabilities[i]);
      }
    }
    return entropy;
  }

  // ========================================================================
  // State Preparation
  // ========================================================================

  private prepareState(state: RLState): Float32Array {
    const features = state.features.slice(0, this.acConfig.stateSize);

    while (features.length < this.acConfig.stateSize) {
      features.push(0);
    }

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
      { type: 'adjust-threshold', value: 0.1 },
      { type: 'adjust-threshold', value: -0.1 },
      { type: 'approve', value: 1 },
      { type: 'reject', value: 0 },
    ];

    this.acConfig.actionSize = this.actions.length;

    // Recreate actor with correct action size
    this.actor = new NeuralNetwork({
      layerSizes: [this.acConfig.stateSize, ...this.acConfig.actorHiddenLayers, this.acConfig.actionSize],
      activations: Array(this.acConfig.actorHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.acConfig.actorLR,
    });
  }

  private actionToIndex(action: RLAction): number {
    const key = this.actionToKey(action);
    for (let i = 0; i < this.actions.length; i++) {
      if (this.actionToKey(this.actions[i]) === key) {
        return i;
      }
    }
    return 0;
  }

  private actionToKey(action: RLAction): string {
    return `${action.type}:${JSON.stringify(action.value)}`;
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

  private generateReasoning(state: RLState, action: RLAction, value: number, prob: number): string {
    if (this.episodeCount < 10) {
      return `Neural Actor-Critic learning (episode ${this.episodeCount}): exploring actions`;
    }

    return `Neural Actor-Critic: ${action.type} (prob: ${prob.toFixed(3)}, state value: ${value.toFixed(3)})`;
  }

  // ========================================================================
  // Export/Import
  // ========================================================================

  protected async exportCustomData(): Promise<Record<string, unknown>> {
    return {
      actor: this.actor.getParameters(),
      critic: this.critic.getParameters(),
      acConfig: this.acConfig,
    };
  }

  protected async importCustomData(data: Record<string, unknown>): Promise<void> {
    if (data.actor) {
      this.actor.setParameters(data.actor as { layers: Array<{ weights: number[]; biases: number[] }> });
    }

    if (data.critic) {
      this.critic.setParameters(data.critic as { layers: Array<{ weights: number[]; biases: number[] }> });
    }

    if (data.acConfig) {
      this.acConfig = { ...this.acConfig, ...data.acConfig as ActorCriticConfig };
    }

    this.initialized = true;
  }

  protected async resetAlgorithm(): Promise<void> {
    // Recreate networks
    this.actor = new NeuralNetwork({
      layerSizes: [this.acConfig.stateSize, ...this.acConfig.actorHiddenLayers, this.acConfig.actionSize],
      activations: Array(this.acConfig.actorHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.acConfig.actorLR,
    });

    this.critic = new NeuralNetwork({
      layerSizes: [this.acConfig.stateSize, ...this.acConfig.criticHiddenLayers, 1],
      activations: Array(this.acConfig.criticHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.acConfig.criticLR,
    });
  }
}
