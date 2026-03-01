/**
 * Agentic QE v3 - PPO Algorithm (Neural)
 *
 * Proximal Policy Optimization with Neural Networks for Adaptive Retry Strategies
 */

import { BaseRLAlgorithm } from '../base-algorithm';
import { secureRandom, secureRandomInt } from '../../../shared/utils/crypto-random.js';
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
  MSELoss,
} from '../neural';

interface PPOConfig {
  stateSize: number;
  actionSize: number;
  actorHiddenLayers: number[];
  criticHiddenLayers: number[];
  clipEpsilon: number;
  lambdaGAE: number;
  epochs: number;
  miniBatchSize: number;
  entropyCoeff: number;
}

const DEFAULT_PPO_CONFIG: PPOConfig = {
  stateSize: 10,
  actionSize: 5,
  actorHiddenLayers: [64, 64],
  criticHiddenLayers: [64, 64],
  clipEpsilon: 0.2,
  lambdaGAE: 0.95,
  epochs: 4,
  miniBatchSize: 64,
  entropyCoeff: 0.01,
};

export class PPOAlgorithm extends BaseRLAlgorithm {
  private actor: NeuralNetwork;
  private critic: NeuralNetwork;
  private oldActor: NeuralNetwork;
  private ppoConfig: PPOConfig;
  private actions: RLAction[] = [];

  constructor(config: Partial<PPOConfig> = {}) {
    super('ppo', 'actor-critic');
    this.ppoConfig = { ...DEFAULT_PPO_CONFIG, ...config };
    this.initializeActions();

    this.actor = new NeuralNetwork({
      layerSizes: [this.ppoConfig.stateSize, ...this.ppoConfig.actorHiddenLayers, this.ppoConfig.actionSize],
      activations: Array(this.ppoConfig.actorHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.critic = new NeuralNetwork({
      layerSizes: [this.ppoConfig.stateSize, ...this.ppoConfig.criticHiddenLayers, 1],
      activations: Array(this.ppoConfig.criticHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.oldActor = this.actor.clone();
  }

  async predict(state: RLState): Promise<RLPrediction> {
    if (!this.initialized) await this.initialize();

    const stateFeatures = this.prepareState(state);
    const actionLogits = this.actor.forward(stateFeatures);
    const actionProbabilities = Softmax.forward(actionLogits);

    const actionIndex = this.sampleAction(actionProbabilities);
    const action = this.actions[actionIndex];

    const value = this.critic.forward(stateFeatures)[0];
    const confidence = Math.max(0.3, Math.min(1, actionProbabilities[actionIndex] + 0.4));

    return {
      action,
      confidence,
      value,
      reasoning: `PPO: ${action.type}`,
    };
  }

  protected async trainCore(experiences: RLExperience[]): Promise<RLTrainingStats> {
    // Store old policy
    this.oldActor = this.actor.clone();

    // Calculate advantages using GAE
    const advantages = this.calculateAdvantages(experiences);

    let totalLoss = 0;

    // Multiple epochs
    for (let epoch = 0; epoch < this.ppoConfig.epochs; epoch++) {
      for (let i = 0; i < experiences.length; i += this.ppoConfig.miniBatchSize) {
        const batchEnd = Math.min(i + this.ppoConfig.miniBatchSize, experiences.length);

        for (let j = i; j < batchEnd; j++) {
          const exp = experiences[j];
          const stateFeatures = this.prepareState(exp.state);
          const actionIndex = this.actionToIndex(exp.action);
          const adv = advantages[j] || 0;

          // Get probability ratios
          const newLogits = this.actor.forward(stateFeatures);
          const newProbs = Softmax.forward(newLogits);
          const oldLogits = this.oldActor.forward(stateFeatures);
          const oldProbs = Softmax.forward(oldLogits);

          const ratio = (newProbs[actionIndex] + 1e-10) / (oldProbs[actionIndex] + 1e-10);

          // Clipped surrogate objective
          const clippedRatio = Math.max(1 - this.ppoConfig.clipEpsilon, Math.min(1 + this.ppoConfig.clipEpsilon, ratio));
          const surrogate1 = ratio * adv;
          const surrogate2 = clippedRatio * adv;
          const policyLoss = -Math.min(surrogate1, surrogate2);

          // Value function loss
          const value = this.critic.forward(stateFeatures)[0];
          const target = exp.reward + this.config.discountFactor * (this.critic.forward(this.prepareState(exp.nextState))[0] || 0);
          const valueLoss = (value - target) ** 2;

          // Entropy bonus
          const entropy = this.calculateEntropy(newProbs);
          const entropyLoss = -this.ppoConfig.entropyCoeff * entropy;

          totalLoss += Math.abs(policyLoss + 0.5 * valueLoss + entropyLoss);

          // Update networks
          const actorGradients = new Float32Array(newProbs.length);
          for (let k = 0; k < actorGradients.length; k++) {
            actorGradients[k] = k === actionIndex ? -adv : 0;
          }

          this.actor.backward(actorGradients);
          for (const layer of this.actor.layers) {
            layer.update(this.config.learningRate * 0.1);
          }

          const criticTarget = new Float32Array([target]);
          this.critic.train(stateFeatures, criticTarget, new MSELoss());
        }
      }
    }

    return {
      episode: this.episodeCount,
      totalReward: this.totalReward,
      averageReward: this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length,
      loss: totalLoss / (experiences.length * this.ppoConfig.epochs),
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
      description: 'Neural PPO for Adaptive Retry Strategies',
      capabilities: ['Clipped surrogate objective', 'GAE advantage estimation', 'Multiple epochs per batch'],
      hyperparameters: {
        stateSize: this.ppoConfig.stateSize,
        actionSize: this.ppoConfig.actionSize,
        clipEpsilon: this.ppoConfig.clipEpsilon,
        epochs: this.ppoConfig.epochs,
      },
      stats: this.stats,
    };
  }

  private calculateAdvantages(experiences: RLExperience[]): number[] {
    const advantages: number[] = [];
    let gae = 0;

    for (let i = experiences.length - 1; i >= 0; i--) {
      const exp = experiences[i];
      const stateFeatures = this.prepareState(exp.state);
      const nextStateFeatures = this.prepareState(exp.nextState);

      const value = this.critic.forward(stateFeatures)[0];
      const nextValue = exp.done ? 0 : this.critic.forward(nextStateFeatures)[0];

      const delta = exp.reward + this.config.discountFactor * nextValue - value;
      gae = delta + this.config.discountFactor * this.ppoConfig.lambdaGAE * gae;

      advantages.unshift(gae);
    }

    return advantages;
  }

  private prepareState(state: RLState): Float32Array {
    const features = state.features.slice(0, this.ppoConfig.stateSize);
    while (features.length < this.ppoConfig.stateSize) features.push(0);

    const max = Math.max(...features.map(Math.abs));
    if (max > 0) for (let i = 0; i < features.length; i++) features[i] /= max;

    return new Float32Array(features);
  }

  private initializeActions(): void {
    this.actions = [
      { type: 'retry', value: 1 },
      { type: 'retry', value: 2 },
      { type: 'retry', value: 3 },
      { type: 'skip-retry', value: 0 },
      { type: 'adjust-timeout', value: 1.5 },
    ];

    this.ppoConfig.actionSize = this.actions.length;

    this.actor = new NeuralNetwork({
      layerSizes: [this.ppoConfig.stateSize, ...this.ppoConfig.actorHiddenLayers, this.ppoConfig.actionSize],
      activations: Array(this.ppoConfig.actorHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.critic = new NeuralNetwork({
      layerSizes: [this.ppoConfig.stateSize, ...this.ppoConfig.criticHiddenLayers, 1],
      activations: Array(this.ppoConfig.criticHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.oldActor = this.actor.clone();
  }

  private actionToIndex(action: RLAction): number {
    const key = `${action.type}:${JSON.stringify(action.value)}`;
    for (let i = 0; i < this.actions.length; i++) {
      if (`${this.actions[i].type}:${JSON.stringify(this.actions[i].value)}` === key) return i;
    }
    return 0;
  }

  private sampleAction(probabilities: Float32Array): number {
    if (secureRandom() < this.config.explorationRate) {
      return secureRandomInt(0, this.actions.length);
    }

    const rand = secureRandom();
    let cumProb = 0;

    for (let i = 0; i < probabilities.length; i++) {
      cumProb += probabilities[i];
      if (rand <= cumProb) return i;
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

  private calculateEntropy(probabilities: Float32Array): number {
    let entropy = 0;
    for (let i = 0; i < probabilities.length; i++) {
      if (probabilities[i] > 0) {
        entropy -= probabilities[i] * Math.log(probabilities[i]);
      }
    }
    return entropy;
  }

  protected async exportCustomData(): Promise<Record<string, unknown>> {
    return {
      actor: this.actor.getParameters(),
      critic: this.critic.getParameters(),
      ppoConfig: this.ppoConfig,
    };
  }

  protected async importCustomData(data: Record<string, unknown>): Promise<void> {
    if (data.actor) this.actor.setParameters(data.actor as { layers: Array<{ weights: number[]; biases: number[] }> });
    if (data.critic) this.critic.setParameters(data.critic as { layers: Array<{ weights: number[]; biases: number[] }> });
    if (data.ppoConfig) this.ppoConfig = { ...this.ppoConfig, ...data.ppoConfig as PPOConfig };
    this.initialized = true;
  }

  protected async resetAlgorithm(): Promise<void> {
    this.actor = new NeuralNetwork({
      layerSizes: [this.ppoConfig.stateSize, ...this.ppoConfig.actorHiddenLayers, this.ppoConfig.actionSize],
      activations: Array(this.ppoConfig.actorHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.critic = new NeuralNetwork({
      layerSizes: [this.ppoConfig.stateSize, ...this.ppoConfig.criticHiddenLayers, 1],
      activations: Array(this.ppoConfig.criticHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.oldActor = this.actor.clone();
  }
}
