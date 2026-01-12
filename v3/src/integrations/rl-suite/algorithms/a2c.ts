/**
 * Agentic QE v3 - A2C Algorithm (Neural)
 *
 * Advantage Actor-Critic with Neural Networks for Fleet Coordination
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
  MSELoss,
} from '../neural';

interface A2CConfig {
  stateSize: number;
  actionSize: number;
  actorHiddenLayers: number[];
  criticHiddenLayers: number[];
  numWorkers: number;
  nSteps: number;
  entropyCoeff: number;
  valueLossCoeff: number;
}

const DEFAULT_A2C_CONFIG: A2CConfig = {
  stateSize: 10,
  actionSize: 5,
  actorHiddenLayers: [64, 64],
  criticHiddenLayers: [64, 64],
  numWorkers: 4,
  nSteps: 5,
  entropyCoeff: 0.01,
  valueLossCoeff: 0.5,
};

export class A2CAlgorithm extends BaseRLAlgorithm {
  private actor: NeuralNetwork;
  private critic: NeuralNetwork;
  private a2cConfig: A2CConfig;
  private actions: RLAction[] = [];

  constructor(config: Partial<A2CConfig> = {}) {
    super('a2c', 'actor-critic');
    this.a2cConfig = { ...DEFAULT_A2C_CONFIG, ...config };
    this.initializeActions();

    this.actor = new NeuralNetwork({
      layerSizes: [this.a2cConfig.stateSize, ...this.a2cConfig.actorHiddenLayers, this.a2cConfig.actionSize],
      activations: Array(this.a2cConfig.actorHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.critic = new NeuralNetwork({
      layerSizes: [this.a2cConfig.stateSize, ...this.a2cConfig.criticHiddenLayers, 1],
      activations: Array(this.a2cConfig.criticHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });
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
      reasoning: `A2C (${this.a2cConfig.numWorkers} workers): ${action.type}`,
    };
  }

  protected async trainCore(experiences: RLExperience[]): Promise<RLTrainingStats> {
    const workerExperiences = this.distributeToWorkers(experiences);

    let totalPolicyLoss = 0;
    let totalValueLoss = 0;

    for (const [_, workerExps] of Object.entries(workerExperiences)) {
      if (workerExps.length === 0) continue;

      const returns = this.calculateReturns(workerExps);
      const advantages = this.calculateAdvantages(workerExps, returns);

      for (let i = 0; i < workerExps.length; i++) {
        const exp = workerExps[i];
        const stateFeatures = this.prepareState(exp.state);
        const actionIndex = this.actionToIndex(exp.action);
        const advantage = advantages[i];

        const actionLogits = this.actor.forward(stateFeatures);
        const actionProbabilities = Softmax.forward(actionLogits);
        const actionLogProb = Math.log(actionProbabilities[actionIndex] + 1e-10);

        const policyLoss = -actionLogProb * advantage;
        const entropy = this.calculateEntropy(actionProbabilities);
        const entropyBonus = this.a2cConfig.entropyCoeff * entropy;

        const actorGradients = new Float32Array(actionProbabilities.length);
        for (let j = 0; j < actorGradients.length; j++) {
          if (j === actionIndex) {
            actorGradients[j] = -advantage * (1 - actionProbabilities[j]);
          } else {
            actorGradients[j] = advantage * actionProbabilities[j];
          }
        }

        this.actor.backward(actorGradients);
        for (const layer of this.actor.layers) {
          layer.update(this.config.learningRate * 0.1);
        }

        const value = this.critic.forward(stateFeatures)[0];
        const target = returns[i];
        const valueLoss = (value - target) ** 2;

        const criticTarget = new Float32Array([target]);
        this.critic.train(stateFeatures, criticTarget, new MSELoss());

        totalPolicyLoss += Math.abs(policyLoss - entropyBonus);
        totalValueLoss += valueLoss;
      }
    }

    return {
      episode: this.episodeCount,
      totalReward: this.totalReward,
      averageReward: this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length,
      loss: (totalPolicyLoss + totalValueLoss) / experiences.length,
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
      description: 'Neural A2C for Fleet Coordination',
      capabilities: ['Multi-worker parallel training', 'Advantage estimation', 'Combined policy and value learning'],
      hyperparameters: {
        stateSize: this.a2cConfig.stateSize,
        actionSize: this.a2cConfig.actionSize,
        numWorkers: this.a2cConfig.numWorkers,
        entropyCoeff: this.a2cConfig.entropyCoeff,
      },
      stats: this.stats,
    };
  }

  private distributeToWorkers(experiences: RLExperience[]): Record<number, RLExperience[]> {
    const result: Record<number, RLExperience[]> = {};

    for (let i = 0; i < this.a2cConfig.numWorkers; i++) {
      result[i] = [];
    }

    experiences.forEach((exp, i) => {
      const workerId = i % this.a2cConfig.numWorkers;
      result[workerId].push(exp);
    });

    return result;
  }

  private calculateReturns(experiences: RLExperience[]): number[] {
    const returns: number[] = [];
    let G = 0;

    for (let i = experiences.length - 1; i >= 0; i--) {
      G = experiences[i].reward + this.config.discountFactor * G;
      returns.unshift(G);
    }

    return returns;
  }

  private calculateAdvantages(experiences: RLExperience[], returns: number[]): number[] {
    return experiences.map((exp, i) => {
      const stateFeatures = this.prepareState(exp.state);
      const value = this.critic.forward(stateFeatures)[0];
      return returns[i] - value;
    });
  }

  private prepareState(state: RLState): Float32Array {
    const features = state.features.slice(0, this.a2cConfig.stateSize);
    while (features.length < this.a2cConfig.stateSize) features.push(0);

    const max = Math.max(...features.map(Math.abs));
    if (max > 0) for (let i = 0; i < features.length; i++) features[i] /= max;

    return new Float32Array(features);
  }

  private initializeActions(): void {
    this.actions = [
      { type: 'coordinate', value: 'parallel' },
      { type: 'coordinate', value: 'sequential' },
      { type: 'coordinate', value: 'distributed' },
      { type: 'allocate', value: { agents: 2 } },
      { type: 'rebalance', value: 1 },
    ];

    this.a2cConfig.actionSize = this.actions.length;

    this.actor = new NeuralNetwork({
      layerSizes: [this.a2cConfig.stateSize, ...this.a2cConfig.actorHiddenLayers, this.a2cConfig.actionSize],
      activations: Array(this.a2cConfig.actorHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.critic = new NeuralNetwork({
      layerSizes: [this.a2cConfig.stateSize, ...this.a2cConfig.criticHiddenLayers, 1],
      activations: Array(this.a2cConfig.criticHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });
  }

  private actionToIndex(action: RLAction): number {
    const key = `${action.type}:${JSON.stringify(action.value)}`;
    for (let i = 0; i < this.actions.length; i++) {
      if (`${this.actions[i].type}:${JSON.stringify(this.actions[i].value)}` === key) return i;
    }
    return 0;
  }

  private sampleAction(probabilities: Float32Array): number {
    if (Math.random() < this.config.explorationRate) {
      return Math.floor(Math.random() * this.actions.length);
    }

    const rand = Math.random();
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
      a2cConfig: this.a2cConfig,
    };
  }

  protected async importCustomData(data: Record<string, unknown>): Promise<void> {
    if (data.actor) this.actor.setParameters(data.actor as { layers: Array<{ weights: number[]; biases: number[] }> });
    if (data.critic) this.critic.setParameters(data.critic as { layers: Array<{ weights: number[]; biases: number[] }> });
    if (data.a2cConfig) this.a2cConfig = { ...this.a2cConfig, ...data.a2cConfig as A2CConfig };
    this.initialized = true;
  }

  protected async resetAlgorithm(): Promise<void> {
    this.actor = new NeuralNetwork({
      layerSizes: [this.a2cConfig.stateSize, ...this.a2cConfig.actorHiddenLayers, this.a2cConfig.actionSize],
      activations: Array(this.a2cConfig.actorHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.critic = new NeuralNetwork({
      layerSizes: [this.a2cConfig.stateSize, ...this.a2cConfig.criticHiddenLayers, 1],
      activations: Array(this.a2cConfig.criticHiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });
  }
}
