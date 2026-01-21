/**
 * Agentic QE v3 - Policy Gradient Algorithm (Neural)
 *
 * Policy Gradient (REINFORCE) with Neural Network for Resource Allocation
 * Application: coordination domain
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
  Softmax,
} from '../neural';

// ============================================================================
// Policy Gradient Configuration
// ============================================================================

interface PGConfig {
  stateSize: number;
  actionSize: number;
  hiddenLayers: number[];
  learningRatePG: number;
  gammaPG: number;
  entropyCoeff: number;
}

const DEFAULT_PG_CONFIG: PGConfig = {
  stateSize: 10,
  actionSize: 5,
  hiddenLayers: [64, 64],
  learningRatePG: 0.01,
  gammaPG: 0.99,
  entropyCoeff: 0.01,
};

// ============================================================================
// Neural Policy Gradient Implementation
// ============================================================================

/**
 * Neural Policy Gradient (REINFORCE) for Resource Allocation
 */
export class PolicyGradientAlgorithm extends BaseRLAlgorithm {
  private policy: NeuralNetwork;
  private pgConfig: PGConfig;
  private actions: RLAction[] = [];
  private episodeLog: Array<{ state: RLState; action: RLAction; reward: number }> = [];

  constructor(config: Partial<PGConfig> = {}) {
    super('policy-gradient', 'policy-based');
    this.pgConfig = { ...DEFAULT_PG_CONFIG, ...config };

    this.initializeActions();

    // Initialize policy network
    this.policy = new NeuralNetwork({
      layerSizes: [this.pgConfig.stateSize, ...this.pgConfig.hiddenLayers, this.pgConfig.actionSize],
      activations: Array(this.pgConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.pgConfig.learningRatePG,
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
    const actionLogits = this.policy.forward(stateFeatures);
    const actionProbabilities = Softmax.forward(actionLogits);

    const actionIndex = this.sampleAction(actionProbabilities);
    const action = this.actions[actionIndex];

    const actionProb = actionProbabilities[actionIndex];
    const confidence = Math.max(0.3, Math.min(1, actionProb + 0.4));

    this.episodeLog.push({ state, action, reward: 0 });

    return {
      action,
      confidence,
      reasoning: this.generateReasoning(state, action, actionProb),
    };
  }

  // ========================================================================
  // Training Implementation
  // ========================================================================

  protected async trainCore(experiences: RLExperience[]): Promise<RLTrainingStats> {
    const episodes = this.groupIntoEpisodes(experiences);
    let totalLoss = 0;

    for (const episode of episodes) {
      const returns = this.calculateReturns(episode);

      for (let t = 0; t < episode.length; t++) {
        const { state, action } = episode[t];
        const G = returns[t];

        const stateFeatures = this.prepareState(state);
        const actionLogits = this.policy.forward(stateFeatures);
        const actionProbabilities = Softmax.forward(actionLogits);

        const actionIndex = this.actionToIndex(action);
        const actionLogProb = Math.log(actionProbabilities[actionIndex] + 1e-10);

        // Policy gradient update
        const loss = -actionLogProb * G;
        totalLoss += Math.abs(loss);

        // Compute gradients
        const gradients = new Float32Array(actionProbabilities.length);
        for (let i = 0; i < gradients.length; i++) {
          if (i === actionIndex) {
            gradients[i] = -G * (1 - actionProbabilities[i]);
          } else {
            gradients[i] = G * actionProbabilities[i];
          }
        }

        // Update policy
        this.policy.backward(gradients);
        for (const layer of this.policy.layers) {
          layer.update(this.pgConfig.learningRatePG);
        }
      }
    }

    this.episodeLog = [];

    return {
      episode: this.episodeCount,
      totalReward: this.totalReward,
      averageReward: this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length,
      loss: totalLoss / experiences.length,
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
      description: 'Neural Policy Gradient (REINFORCE) for Resource Allocation',
      capabilities: [
        'Neural policy optimization',
        'Monte Carlo return estimation',
        'Entropy regularization',
      ],
      hyperparameters: {
        stateSize: this.pgConfig.stateSize,
        actionSize: this.pgConfig.actionSize,
        learningRatePG: this.pgConfig.learningRatePG,
        gammaPG: this.pgConfig.gammaPG,
      },
      stats: this.stats,
    };
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  private prepareState(state: RLState): Float32Array {
    const features = state.features.slice(0, this.pgConfig.stateSize);
    while (features.length < this.pgConfig.stateSize) {
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

  private initializeActions(): void {
    this.actions = [
      { type: 'allocate', value: { agentType: 'tester', count: 1 } },
      { type: 'allocate', value: { agentType: 'analyzer', count: 1 } },
      { type: 'reallocate', value: { domain: 'test-execution' } },
      { type: 'scale-up', value: 1 },
      { type: 'scale-down', value: 1 },
    ];

    this.pgConfig.actionSize = this.actions.length;

    this.policy = new NeuralNetwork({
      layerSizes: [this.pgConfig.stateSize, ...this.pgConfig.hiddenLayers, this.pgConfig.actionSize],
      activations: Array(this.pgConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.pgConfig.learningRatePG,
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

  private sampleAction(probabilities: Float32Array): number {
    if (Math.random() < this.config.explorationRate) {
      return Math.floor(Math.random() * this.actions.length);
    }

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

  private calculateReturns(episode: RLExperience[]): number[] {
    const returns: number[] = [];
    let G = 0;

    for (let i = episode.length - 1; i >= 0; i--) {
      G = episode[i].reward + this.pgConfig.gammaPG * G;
      returns.unshift(G);
    }

    return returns;
  }

  private groupIntoEpisodes(experiences: RLExperience[]): RLExperience[][] {
    const episodes: RLExperience[][] = [];
    let currentEpisode: RLExperience[] = [];

    for (const exp of experiences) {
      currentEpisode.push(exp);

      if (exp.done) {
        episodes.push(currentEpisode);
        currentEpisode = [];
      }
    }

    if (currentEpisode.length > 0) {
      episodes.push(currentEpisode);
    }

    return episodes;
  }

  private generateReasoning(state: RLState, action: RLAction, prob: number): string {
    return `Neural Policy Gradient: ${action.type} (probability: ${prob.toFixed(3)})`;
  }

  // ========================================================================
  // Export/Import
  // ========================================================================

  protected async exportCustomData(): Promise<Record<string, unknown>> {
    return {
      policy: this.policy.getParameters(),
      pgConfig: this.pgConfig,
    };
  }

  protected async importCustomData(data: Record<string, unknown>): Promise<void> {
    if (data.policy) {
      this.policy.setParameters(data.policy as { layers: Array<{ weights: number[]; biases: number[] }> });
    }

    if (data.pgConfig) {
      this.pgConfig = { ...this.pgConfig, ...data.pgConfig as PGConfig };
    }

    this.initialized = true;
  }

  protected async resetAlgorithm(): Promise<void> {
    this.policy = new NeuralNetwork({
      layerSizes: [this.pgConfig.stateSize, ...this.pgConfig.hiddenLayers, this.pgConfig.actionSize],
      activations: Array(this.pgConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.pgConfig.learningRatePG,
    });

    this.episodeLog = [];
  }
}
