/**
 * Agentic QE v3 - SARSA Algorithm (Neural)
 *
 * SARSA with Deep Q-Network for Defect Prediction Sequencing
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

interface SARSAConfig {
  stateSize: number;
  actionSize: number;
  hiddenLayers: number[];
  minReplaySize: number;
}

const DEFAULT_SARSA_CONFIG: SARSAConfig = {
  stateSize: 10,
  actionSize: 4,
  hiddenLayers: [128, 128],
  minReplaySize: 100,
};

export class SARSAAlgorithm extends BaseRLAlgorithm {
  private qNetwork: NeuralNetwork;
  private replayBufferClass: ReplayBuffer;
  private sarsaConfig: SARSAConfig;
  private actions: RLAction[] = [];

  constructor(config: Partial<SARSAConfig> = {}) {
    super('sarsa', 'value-based');
    this.sarsaConfig = { ...DEFAULT_SARSA_CONFIG, ...config };
    this.initializeActions();

    this.qNetwork = new NeuralNetwork({
      layerSizes: [this.sarsaConfig.stateSize, ...this.sarsaConfig.hiddenLayers, this.sarsaConfig.actionSize],
      activations: Array(this.sarsaConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });

    this.replayBufferClass = new ReplayBuffer(this.config.replayBufferSize, false);
  }

  async predict(state: RLState): Promise<RLPrediction> {
    if (!this.initialized) await this.initialize();

    const stateFeatures = this.prepareState(state);
    const qValues = this.qNetwork.forward(stateFeatures);
    const actionIndex = this.argmax(qValues);
    const action = this.actions[actionIndex];

    return {
      action,
      confidence: 0.7,
      value: qValues[actionIndex],
      reasoning: `SARSA: ${action.type}`,
    };
  }

  protected async trainCore(experiences: RLExperience[]): Promise<RLTrainingStats> {
    for (const exp of experiences) {
      this.replayBufferClass.add(exp);
    }

    if (!this.replayBufferClass.isReady(this.sarsaConfig.minReplaySize)) {
      return this.getStats();
    }

    const batch = this.replayBufferClass.sample(this.config.batchSize);
    let totalLoss = 0;

    for (let i = 0; i < batch.length; i++) {
      const exp = batch[i];
      const nextExp = batch[i + 1];

      const stateFeatures = this.prepareState(exp.state);
      const actionIndex = this.actionToIndex(exp.action);

      const currentQValues = this.qNetwork.forward(stateFeatures);
      const currentQ = currentQValues[actionIndex];

      let nextQ = 0;
      if (nextExp && !exp.done) {
        const nextStateFeatures = this.prepareState(nextExp.state);
        const nextActionIndex = this.actionToIndex(nextExp.action);
        const nextQValues = this.qNetwork.forward(nextStateFeatures);
        nextQ = nextQValues[nextActionIndex];
      }

      const target = exp.reward + this.config.discountFactor * nextQ;
      const targetArray = new Float32Array(currentQValues.length);

      for (let j = 0; j < targetArray.length; j++) {
        targetArray[j] = j === actionIndex ? target : currentQValues[j];
      }

      totalLoss += Math.abs(this.qNetwork.train(stateFeatures, targetArray, new MSELoss()));
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
      description: 'Neural SARSA for Defect Prediction Sequencing',
      capabilities: ['On-policy learning', 'Neural Q-network'],
      hyperparameters: {
        stateSize: this.sarsaConfig.stateSize,
        actionSize: this.sarsaConfig.actionSize,
        hiddenLayers: this.sarsaConfig.hiddenLayers.join(','),
      },
      stats: this.stats,
    };
  }

  private prepareState(state: RLState): Float32Array {
    const features = state.features.slice(0, this.sarsaConfig.stateSize);
    while (features.length < this.sarsaConfig.stateSize) features.push(0);

    const max = Math.max(...features.map(Math.abs));
    if (max > 0) for (let i = 0; i < features.length; i++) features[i] /= max;

    return new Float32Array(features);
  }

  private initializeActions(): void {
    this.actions = [
      { type: 'predict-high', value: 1 },
      { type: 'predict-low', value: 0 },
      { type: 'sequence-early', value: 'high-risk' },
      { type: 'sequence-late', value: 'low-risk' },
    ];

    this.sarsaConfig.actionSize = this.actions.length;

    this.qNetwork = new NeuralNetwork({
      layerSizes: [this.sarsaConfig.stateSize, ...this.sarsaConfig.hiddenLayers, this.sarsaConfig.actionSize],
      activations: Array(this.sarsaConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
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
      sarsaConfig: this.sarsaConfig,
    };
  }

  protected async importCustomData(data: Record<string, unknown>): Promise<void> {
    if (data.qNetwork) this.qNetwork.setParameters(data.qNetwork as { layers: Array<{ weights: number[]; biases: number[] }> });
    if (data.sarsaConfig) this.sarsaConfig = { ...this.sarsaConfig, ...data.sarsaConfig as SARSAConfig };
    this.initialized = true;
  }

  protected async resetAlgorithm(): Promise<void> {
    this.qNetwork = new NeuralNetwork({
      layerSizes: [this.sarsaConfig.stateSize, ...this.sarsaConfig.hiddenLayers, this.sarsaConfig.actionSize],
      activations: Array(this.sarsaConfig.hiddenLayers.length).fill(new ReLU()).concat([new Linear()]),
      learningRate: this.config.learningRate,
    });
    this.replayBufferClass.clear();
  }
}
