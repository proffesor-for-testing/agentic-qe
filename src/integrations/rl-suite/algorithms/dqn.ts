/**
 * Agentic QE v3 - DQN Algorithm (Neural)
 *
 * Deep Q-Network for Parallel Execution Scheduling
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
  MSELoss,
  ReplayBuffer,
} from '../neural';

interface DQNConfig {
  stateSize: number;
  actionSize: number;
  hiddenLayers: number[];
  targetUpdateFreq: number;
  minReplaySize: number;
  doubleDQN: boolean;
}

const DEFAULT_DQN_CONFIG: DQNConfig = {
  stateSize: 10,
  actionSize: 5,
  hiddenLayers: [128, 128],
  targetUpdateFreq: 100,
  minReplaySize: 100,
  doubleDQN: true,
};

export class DQNAlgorithm extends BaseRLAlgorithm {
  private qNetwork: NeuralNetwork;
  private targetNetwork: NeuralNetwork;
  private replayBufferClass: ReplayBuffer;
  private dqnConfig: DQNConfig;
  private updateCount = 0;
  private actions: RLAction[] = [];

  constructor(config: Partial<DQNConfig> = {}) {
    super('dqn', 'value-based');
    this.dqnConfig = { ...DEFAULT_DQN_CONFIG, ...config };
    this.initializeActions();

    this.qNetwork = new NeuralNetwork({
      layerSizes: [this.dqnConfig.stateSize, ...this.dqnConfig.hiddenLayers, this.dqnConfig.actionSize],
      activations: Array(this.dqnConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.targetNetwork = this.qNetwork.clone();
    this.replayBufferClass = new ReplayBuffer(this.config.replayBufferSize, false);
  }

  async predict(state: RLState): Promise<RLPrediction> {
    if (!this.initialized) await this.initialize();

    const stateFeatures = this.prepareState(state);
    const qValues = this.targetNetwork.forward(stateFeatures);
    const actionIndex = this.argmax(qValues);
    const action = this.actions[actionIndex];

    return {
      action,
      confidence: 0.7,
      value: qValues[actionIndex],
      reasoning: `DQN: ${action.type}`,
    };
  }

  protected async trainCore(experiences: RLExperience[]): Promise<RLTrainingStats> {
    for (const exp of experiences) {
      this.replayBufferClass.add(exp);
    }

    if (!this.replayBufferClass.isReady(this.dqnConfig.minReplaySize)) {
      return this.getStats();
    }

    const batch = this.replayBufferClass.sample(this.config.batchSize);
    let totalLoss = 0;

    for (const exp of batch) {
      const stateFeatures = this.prepareState(exp.state);
      const nextStateFeatures = this.prepareState(exp.nextState);
      const actionIndex = this.actionToIndex(exp.action);

      const currentQValues = this.qNetwork.forward(stateFeatures);
      let target: number;

      if (this.dqnConfig.doubleDQN && !exp.done) {
        const nextQValuesMain = this.qNetwork.forward(nextStateFeatures);
        const nextActionIndex = this.argmax(nextQValuesMain);
        const nextQValuesTarget = this.targetNetwork.forward(nextStateFeatures);
        target = exp.reward + this.config.discountFactor * nextQValuesTarget[nextActionIndex];
      } else {
        const nextQValues = this.targetNetwork.forward(nextStateFeatures);
        target = exp.reward + this.config.discountFactor * Math.max(...nextQValues) * (exp.done ? 0 : 1);
      }

      const targetArray = new Float32Array(currentQValues.length);
      for (let i = 0; i < targetArray.length; i++) {
        targetArray[i] = i === actionIndex ? target : currentQValues[i];
      }

      totalLoss += Math.abs(this.qNetwork.train(stateFeatures, targetArray, new MSELoss()));
    }

    this.updateCount++;
    if (this.updateCount % this.dqnConfig.targetUpdateFreq === 0) {
      this.targetNetwork = this.qNetwork.clone();
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

  protected getAlgorithmInfo(): RLAlgorithmInfo {
    return {
      type: this.type,
      category: this.category,
      version: '2.0.0',
      description: 'Neural DQN for Parallel Execution Scheduling',
      capabilities: ['Experience replay', 'Target network', 'Double DQN'],
      hyperparameters: {
        stateSize: this.dqnConfig.stateSize,
        actionSize: this.dqnConfig.actionSize,
        hiddenLayers: this.dqnConfig.hiddenLayers.join(','),
      },
      stats: this.stats,
    };
  }

  private prepareState(state: RLState): Float32Array {
    const features = state.features.slice(0, this.dqnConfig.stateSize);
    while (features.length < this.dqnConfig.stateSize) features.push(0);

    const max = Math.max(...features.map(Math.abs));
    if (max > 0) for (let i = 0; i < features.length; i++) features[i] /= max;

    return new Float32Array(features);
  }

  private initializeActions(): void {
    this.actions = [
      { type: 'parallelize', value: 2 },
      { type: 'parallelize', value: 4 },
      { type: 'parallelize', value: 8 },
      { type: 'sequential', value: 1 },
      { type: 'skip', value: 0 },
    ];

    this.dqnConfig.actionSize = this.actions.length;

    this.qNetwork = new NeuralNetwork({
      layerSizes: [this.dqnConfig.stateSize, ...this.dqnConfig.hiddenLayers, this.dqnConfig.actionSize],
      activations: Array(this.dqnConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.targetNetwork = this.qNetwork.clone();
  }

  private actionToIndex(action: RLAction): number {
    const key = `${action.type}:${JSON.stringify(action.value)}`;
    for (let i = 0; i < this.actions.length; i++) {
      if (`${this.actions[i].type}:${JSON.stringify(this.actions[i].value)}` === key) return i;
    }
    return 0;
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

  protected async exportCustomData(): Promise<Record<string, unknown>> {
    return {
      qNetwork: this.qNetwork.getParameters(),
      targetNetwork: this.targetNetwork.getParameters(),
      dqnConfig: this.dqnConfig,
      updateCount: this.updateCount,
    };
  }

  protected async importCustomData(data: Record<string, unknown>): Promise<void> {
    if (data.qNetwork) this.qNetwork.setParameters(data.qNetwork as { layers: Array<{ weights: number[]; biases: number[] }> });
    if (data.targetNetwork) this.targetNetwork.setParameters(data.targetNetwork as { layers: Array<{ weights: number[]; biases: number[] }> });
    if (data.dqnConfig) this.dqnConfig = { ...this.dqnConfig, ...data.dqnConfig as DQNConfig };
    if (typeof data.updateCount === 'number') this.updateCount = data.updateCount;
    this.initialized = true;
  }

  protected async resetAlgorithm(): Promise<void> {
    this.qNetwork = new NeuralNetwork({
      layerSizes: [this.dqnConfig.stateSize, ...this.dqnConfig.hiddenLayers, this.dqnConfig.actionSize],
      activations: Array(this.dqnConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });
    this.targetNetwork = this.qNetwork.clone();
    this.replayBufferClass.clear();
    this.updateCount = 0;
  }
}
