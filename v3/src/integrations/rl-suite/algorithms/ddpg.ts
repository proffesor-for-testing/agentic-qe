/**
 * Agentic QE v3 - Deep Deterministic Policy Gradient (DDPG) Algorithm
 *
 * DDPG for Continuous Resource Control
 * Application: coordination domain
 *
 * Off-policy algorithm for continuous action spaces.
 * Uses actor-critic with deterministic policy gradient.
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

// ============================================================================
// DDPG Configuration
// ============================================================================

interface DDPGConfig {
  /** Actor learning rate */
  actorLR: number;
  /** Critic learning rate */
  criticLR: number;
  /** Target network soft update coefficient (tau) */
  tau: number;
  /** Replay buffer size */
  replayBufferSize: number;
  /** Batch size */
  batchSize: number;
  /** Action noise for exploration */
  actionNoiseStd: number;
}

const DEFAULT_DDPG_CONFIG: DDPGConfig = {
  actorLR: 0.0001,
  criticLR: 0.001,
  tau: 0.001,
  replayBufferSize: 100000,
  batchSize: 64,
  actionNoiseStd: 0.1,
};

// ============================================================================
// DDPG Implementation
// ============================================================================

/**
 * Deep Deterministic Policy Gradient for Continuous Resource Control
 *
 * Application: Fine-grained resource allocation and scaling decisions
 * Domain: coordination
 *
 * Key features:
 * - Deterministic policy for continuous actions
 * - Off-policy learning with replay buffer
 * - Soft target network updates
 * - Action noise for exploration
 */
export class DDPGAlgorithm extends BaseRLAlgorithm {
  private actor: Map<string, number> = new Map(); // State -> continuous action value
  private critic: Map<string, number> = new Map(); // State-action -> value
  private targetActor: Map<string, number> = new Map();
  private targetCritic: Map<string, number> = new Map();
  private ddpgConfig: DDPGConfig;
  private ddpgReplayBuffer: RLExperience[] = [];

  constructor(config: Partial<DDPGConfig> = {}) {
    super('ddpg', 'deterministic-policy');
    this.ddpgConfig = { ...DEFAULT_DDPG_CONFIG, ...config };
  }

  // ========================================================================
  // Public Interface
  // ========================================================================

  async predict(state: RLState): Promise<RLPrediction> {
    if (!this.initialized) {
      await this.initialize();
    }

    const stateKey = this.stateToKey(state);

    // Actor: deterministic action
    const actionValue = this.actor.get(stateKey) || 0.5;

    // Add exploration noise
    const noisyValue = this.addNoise(actionValue);

    const action: RLAction = {
      type: 'allocate-continuous',
      value: noisyValue,
    };

    // Critic: state-action value
    const stateActionKey = `${stateKey}|${noisyValue.toFixed(3)}`;
    const value = this.critic.get(stateActionKey) || 0;

    const confidence = this.calculateConfidence(stateKey);

    return {
      action,
      confidence,
      value,
      reasoning: this.generateReasoning(state, action, value, actionValue, noisyValue),
    };
  }

  // ========================================================================
  // Training Implementation
  // ========================================================================

  protected async trainCore(experiences: RLExperience[]): Promise<RLTrainingStats> {
    // Add to replay buffer
    for (const exp of experiences) {
      this.ddpgReplayBuffer.push(exp);
    }

    // Maintain buffer size
    while (this.ddpgReplayBuffer.length > this.ddpgConfig.replayBufferSize) {
      this.ddpgReplayBuffer.shift();
    }

    // Wait until we have enough experiences
    if (this.ddpgReplayBuffer.length < this.ddpgConfig.batchSize) {
      return this.getEmptyStats();
    }

    // Sample random batch
    const batch = this.sampleBatch();

    let totalActorLoss = 0;
    let totalCriticLoss = 0;

    for (const exp of batch) {
      const stateKey = this.stateToKey(exp.state);
      const nextStateKey = this.stateToKey(exp.nextState);

      const actionValue = exp.action.value as number;
      const stateActionKey = `${stateKey}|${actionValue.toFixed(3)}`;

      // Critic update: Q(s,a) = r + gamma * Q_target(s', mu_target(s'))
      const targetActionValue = this.targetActor.get(nextStateKey) || 0.5;
      const targetStateActionKey = `${nextStateKey}|${targetActionValue.toFixed(3)}`;
      const targetQ = this.targetCritic.get(targetStateActionKey) || 0;

      const target = exp.reward + this.config.discountFactor * targetQ * (exp.done ? 0 : 1);
      const currentQ = this.critic.get(stateActionKey) || 0;

      const tdError = target - currentQ;
      const newQ = currentQ + this.ddpgConfig.criticLR * tdError;

      this.critic.set(stateActionKey, newQ);

      // Actor update: maximize Q(s, mu(s))
      // Gradient ascent: dQ/da * da/dtheta
      const qValue = this.critic.get(stateActionKey) || 0;
      const currentActionValue = this.actor.get(stateKey) || 0.5;

      // Policy gradient: increase action if Q is high, decrease if low
      const actionDelta = this.ddpgConfig.actorLR * (qValue > 0 ? 1 : -1) * Math.abs(qValue) * 0.1;
      const newActionValue = Math.max(0, Math.min(1, currentActionValue + actionDelta));

      this.actor.set(stateKey, newActionValue);

      // Soft update target networks
      this.softUpdateTarget(stateKey, newActionValue);
      this.softUpdateTargetCritic(stateActionKey, newQ);

      totalActorLoss += Math.abs(actionDelta);
      totalCriticLoss += Math.abs(tdError);
    }

    return {
      episode: this.episodeCount,
      totalReward: this.totalReward,
      averageReward: this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length,
      loss: (totalActorLoss + totalCriticLoss) / batch.length,
      explorationRate: this.config.explorationRate,
      trainingTimeMs: 0,
      timestamp: new Date(),
    };
  }

  protected getAlgorithmInfo(): RLAlgorithmInfo {
    return {
      type: this.type,
      category: this.category,
      version: '1.0.0',
      description: 'DDPG for Continuous Resource Control',
      capabilities: [
        'Deterministic policy for continuous actions',
        'Off-policy learning with replay buffer',
        'Soft target network updates',
        'Gaussian action noise for exploration',
      ],
      hyperparameters: {
        actorLR: this.ddpgConfig.actorLR,
        criticLR: this.ddpgConfig.criticLR,
        tau: this.ddpgConfig.tau,
        replayBufferSize: this.ddpgConfig.replayBufferSize,
        batchSize: this.ddpgConfig.batchSize,
        actionNoiseStd: this.ddpgConfig.actionNoiseStd,
      },
      stats: this.stats,
    };
  }

  // ========================================================================
  // Network Methods
  // ========================================================================

  private softUpdateTarget(stateKey: string, actionValue: number): void {
    const targetValue = this.targetActor.get(stateKey) || 0.5;
    const newValue = this.ddpgConfig.tau * actionValue + (1 - this.ddpgConfig.tau) * targetValue;
    this.targetActor.set(stateKey, newValue);
  }

  private softUpdateTargetCritic(stateActionKey: string, qValue: number): void {
    const targetQ = this.targetCritic.get(stateActionKey) || 0;
    const newQ = this.ddpgConfig.tau * qValue + (1 - this.ddpgConfig.tau) * targetQ;
    this.targetCritic.set(stateActionKey, newQ);
  }

  private addNoise(value: number): number {
    // Gaussian noise
    const noise = this.gaussianRandom() * this.ddpgConfig.actionNoiseStd;
    return Math.max(0, Math.min(1, value + noise));
  }

  private gaussianRandom(): number {
    // Box-Muller transform
    let u = 0;
    let v = 0;

    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();

    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // ========================================================================
  // Sampling
  // ========================================================================

  protected sampleBatch(): RLExperience[] {
    const batch: RLExperience[] = [];
    const indices = new Set<number>();

    while (indices.size < this.ddpgConfig.batchSize && indices.size < this.ddpgReplayBuffer.length) {
      indices.add(Math.floor(Math.random() * this.ddpgReplayBuffer.length));
    }

    for (const index of indices) {
      batch.push(this.ddpgReplayBuffer[index]);
    }

    return batch;
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  protected stateToKey(state: RLState): string {
    const featuresStr = state.features
      .map((f, i) => `${i}:${Math.round(f * 100) / 100}`)
      .join(',');
    return `${state.id}|${featuresStr}`;
  }

  private calculateConfidence(stateKey: string): number {
    const hasValue = this.actor.has(stateKey);
    const visits = this.ddpgReplayBuffer.filter((exp) => this.stateToKey(exp.state) === stateKey).length;

    if (!hasValue) return 0.3;
    if (visits < 10) return 0.5;

    return Math.min(1, 0.5 + visits * 0.05);
  }

  private generateReasoning(state: RLState, action: RLAction, value: number, original: number, noisy: number): string {
    const bufferPct = (this.ddpgReplayBuffer.length / this.ddpgConfig.replayBufferSize * 100).toFixed(0);

    return `DDPG: ${action.type}=${noisy.toFixed(3)} (original: ${original.toFixed(3)}, noise added, Q: ${value.toFixed(3)}, buffer: ${bufferPct}%)`;
  }

  private getEmptyStats(): RLTrainingStats {
    return {
      episode: this.episodeCount,
      totalReward: this.totalReward,
      averageReward: 0,
      loss: 0,
      explorationRate: this.config.explorationRate,
      trainingTimeMs: 0,
      timestamp: new Date(),
    };
  }

  // ========================================================================
  // Export/Import
  // ========================================================================

  protected async exportCustomData(): Promise<Record<string, unknown>> {
    return {
      actor: Object.fromEntries(this.actor),
      critic: Object.fromEntries(this.critic),
      targetActor: Object.fromEntries(this.targetActor),
      targetCritic: Object.fromEntries(this.targetCritic),
      ddpgConfig: this.ddpgConfig,
      replayBufferSize: this.ddpgReplayBuffer.length,
    };
  }

  protected async importCustomData(data: Record<string, unknown>): Promise<void> {
    if (data.actor) {
      this.actor = new Map(Object.entries(data.actor as Record<string, number>));
    }

    if (data.critic) {
      this.critic = new Map(Object.entries(data.critic as Record<string, number>));
    }

    if (data.targetActor) {
      this.targetActor = new Map(Object.entries(data.targetActor as Record<string, number>));
    }

    if (data.targetCritic) {
      this.targetCritic = new Map(Object.entries(data.targetCritic as Record<string, number>));
    }

    if (data.ddpgConfig) {
      this.ddpgConfig = { ...this.ddpgConfig, ...data.ddpgConfig as DDPGConfig };
    }
  }

  protected async resetAlgorithm(): Promise<void> {
    this.actor.clear();
    this.critic.clear();
    this.targetActor.clear();
    this.targetCritic.clear();
    this.ddpgReplayBuffer = [];
  }
}
