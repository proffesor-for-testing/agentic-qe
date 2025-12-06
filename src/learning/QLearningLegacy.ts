/**
 * QLearning - Phase 2 (Milestone 2.2)
 *
 * Implements standard Q-learning algorithm for reinforcement learning.
 * Provides epsilon-greedy policy, Q-table updates, and value function estimation.
 */

import { Logger } from '../utils/Logger';
import { TaskState, AgentAction, TaskExperience } from './types';
import { ExperienceReplayBuffer } from './ExperienceReplayBuffer';

/**
 * Q-learning algorithm configuration
 */
export interface QLearningConfig {
  learningRate: number; // α (alpha) - step size for Q-value updates (0.0 - 1.0)
  discountFactor: number; // γ (gamma) - importance of future rewards (0.0 - 1.0)
  explorationRate: number; // ε (epsilon) - probability of random action (0.0 - 1.0)
  explorationDecay: number; // rate at which epsilon decreases
  minExplorationRate: number; // minimum value for epsilon
  useExperienceReplay: boolean; // enable experience replay buffer
  replayBufferSize: number; // size of experience replay buffer
  batchSize: number; // number of experiences to sample for batch updates
}

/**
 * Default Q-learning configuration
 */
const DEFAULT_CONFIG: QLearningConfig = {
  learningRate: 0.1,
  discountFactor: 0.95,
  explorationRate: 0.3,
  explorationDecay: 0.995,
  minExplorationRate: 0.01,
  useExperienceReplay: true,
  replayBufferSize: 10000,
  batchSize: 32
};

/**
 * Q-learning action-value pair
 */
interface QValue {
  state: string;
  action: string;
  value: number;
  updateCount: number;
  lastUpdated: number;
}

/**
 * QLearning - Standard Q-learning implementation
 *
 * Implements the classic Q-learning algorithm with:
 * - Epsilon-greedy exploration policy
 * - Temporal difference (TD) learning
 * - Q-table for state-action values
 * - Optional experience replay for stability
 */
export class QLearning {
  private readonly logger: Logger;
  private config: QLearningConfig;
  private qTable: Map<string, Map<string, QValue>>; // state -> (action -> Q-value)
  private replayBuffer?: ExperienceReplayBuffer;
  private stepCount: number;
  private episodeCount: number;

  constructor(config: Partial<QLearningConfig> = {}) {
    this.logger = Logger.getInstance();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.qTable = new Map();
    this.stepCount = 0;
    this.episodeCount = 0;

    // Initialize experience replay buffer if enabled
    if (this.config.useExperienceReplay) {
      this.replayBuffer = new ExperienceReplayBuffer({
        maxSize: this.config.replayBufferSize,
        minSize: this.config.batchSize,
        prioritized: false
      });
    }

    this.logger.info('QLearning initialized', { config: this.config });
  }

  /**
   * Select action using epsilon-greedy policy
   * With probability ε, select random action (exploration)
   * Otherwise, select action with highest Q-value (exploitation)
   */
  selectAction(state: TaskState, availableActions: AgentAction[]): AgentAction {
    if (availableActions.length === 0) {
      throw new Error('No available actions to select from');
    }

    // Exploration: random action
    if (Math.random() < this.config.explorationRate) {
      const randomIndex = Math.floor(Math.random() * availableActions.length);
      return availableActions[randomIndex];
    }

    // Exploitation: best action based on Q-values
    return this.getBestAction(state, availableActions);
  }

  /**
   * Get best action based on current Q-values
   */
  getBestAction(state: TaskState, availableActions: AgentAction[]): AgentAction {
    const stateKey = this.encodeState(state);
    const stateActions = this.qTable.get(stateKey);

    if (!stateActions || stateActions.size === 0) {
      // No Q-values yet, return random action
      const randomIndex = Math.floor(Math.random() * availableActions.length);
      return availableActions[randomIndex];
    }

    // Find action with highest Q-value
    let bestAction = availableActions[0];
    let bestValue = -Infinity;

    for (const action of availableActions) {
      const actionKey = this.encodeAction(action);
      const qValue = stateActions.get(actionKey);

      if (qValue && qValue.value > bestValue) {
        bestValue = qValue.value;
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * Update Q-value using Q-learning update rule
   * Q(s,a) ← Q(s,a) + α[r + γ·max(Q(s',a')) - Q(s,a)]
   */
  update(experience: TaskExperience): void {
    const stateKey = this.encodeState(experience.state);
    const actionKey = this.encodeAction(experience.action);
    const nextStateKey = this.encodeState(experience.nextState);

    // Get or initialize state-action map
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    const stateActions = this.qTable.get(stateKey)!;

    // Get current Q-value
    const currentQValue = stateActions.get(actionKey);
    const currentQ = currentQValue?.value ?? 0;

    // Get max Q-value for next state (for all possible actions)
    const nextStateActions = this.qTable.get(nextStateKey);
    const maxNextQ = nextStateActions && nextStateActions.size > 0
      ? Math.max(...Array.from(nextStateActions.values()).map(qv => qv.value))
      : 0;

    // Q-learning update rule
    // Q(s,a) = Q(s,a) + α * [r + γ * max(Q(s',a')) - Q(s,a)]
    const tdTarget = experience.reward + this.config.discountFactor * maxNextQ;
    const tdError = tdTarget - currentQ;
    const newQ = currentQ + this.config.learningRate * tdError;

    // Update Q-value
    stateActions.set(actionKey, {
      state: stateKey,
      action: actionKey,
      value: newQ,
      updateCount: (currentQValue?.updateCount ?? 0) + 1,
      lastUpdated: Date.now()
    });

    // Add to experience replay buffer
    if (this.replayBuffer) {
      this.replayBuffer.add(experience, Math.abs(tdError)); // Priority based on TD error
    }

    this.stepCount++;
  }

  /**
   * Perform batch update using experience replay
   * Samples random batch from replay buffer and updates Q-values
   */
  batchUpdate(): void {
    if (!this.replayBuffer || !this.replayBuffer.canSample(this.config.batchSize)) {
      return;
    }

    const batch = this.replayBuffer.sample(this.config.batchSize);

    for (const experience of batch) {
      this.update(experience);
    }

    this.logger.debug(`Performed batch update with ${batch.length} experiences`);
  }

  /**
   * Get Q-value for a state-action pair
   */
  getQValue(state: TaskState, action: AgentAction): number {
    const stateKey = this.encodeState(state);
    const actionKey = this.encodeAction(action);

    const stateActions = this.qTable.get(stateKey);
    if (!stateActions) {
      return 0;
    }

    const qValue = stateActions.get(actionKey);
    return qValue?.value ?? 0;
  }

  /**
   * Get all Q-values for a state
   */
  getStateValues(state: TaskState): Map<string, number> {
    const stateKey = this.encodeState(state);
    const stateActions = this.qTable.get(stateKey);

    if (!stateActions) {
      return new Map();
    }

    const values = new Map<string, number>();
    for (const [actionKey, qValue] of stateActions.entries()) {
      values.set(actionKey, qValue.value);
    }

    return values;
  }

  /**
   * Get value of a state (max Q-value over all actions)
   * V(s) = max_a Q(s,a)
   */
  getStateValue(state: TaskState): number {
    const stateKey = this.encodeState(state);
    const stateActions = this.qTable.get(stateKey);

    if (!stateActions || stateActions.size === 0) {
      return 0;
    }

    return Math.max(...Array.from(stateActions.values()).map(qv => qv.value));
  }

  /**
   * Decay exploration rate (epsilon)
   * Called after each episode to gradually reduce exploration
   */
  decayExploration(): void {
    this.config.explorationRate = Math.max(
      this.config.minExplorationRate,
      this.config.explorationRate * this.config.explorationDecay
    );
  }

  /**
   * Mark end of episode
   */
  endEpisode(): void {
    this.episodeCount++;
    this.decayExploration();

    // Perform batch update if using experience replay
    if (this.config.useExperienceReplay) {
      this.batchUpdate();
    }
  }

  /**
   * Encode state to string key for Q-table
   */
  private encodeState(state: TaskState): string {
    // Create normalized feature vector
    const features = [
      state.taskComplexity,
      state.requiredCapabilities.length / 10, // normalize
      state.previousAttempts / 5, // normalize
      state.availableResources,
      state.timeConstraint ? Math.min(state.timeConstraint / 300000, 1) : 1 // normalize to 5 min
    ];

    // Round to reduce state space (discretization)
    return features.map(f => Math.round(f * 10) / 10).join(',');
  }

  /**
   * Encode action to string key for Q-table
   */
  private encodeAction(action: AgentAction): string {
    return `${action.strategy}:${action.parallelization.toFixed(1)}:${action.retryPolicy}`;
  }

  /**
   * Get current exploration rate (epsilon)
   */
  getExplorationRate(): number {
    return this.config.explorationRate;
  }

  /**
   * Get total number of learning steps
   */
  getStepCount(): number {
    return this.stepCount;
  }

  /**
   * Get total number of episodes
   */
  getEpisodeCount(): number {
    return this.episodeCount;
  }

  /**
   * Get Q-table size (number of state-action pairs)
   */
  getTableSize(): number {
    let size = 0;
    for (const stateActions of this.qTable.values()) {
      size += stateActions.size;
    }
    return size;
  }

  /**
   * Get statistics about learning progress
   */
  getStatistics(): {
    steps: number;
    episodes: number;
    tableSize: number;
    explorationRate: number;
    avgQValue: number;
    maxQValue: number;
    minQValue: number;
  } {
    let totalQValue = 0;
    let count = 0;
    let maxQ = -Infinity;
    let minQ = Infinity;

    for (const stateActions of this.qTable.values()) {
      for (const qValue of stateActions.values()) {
        totalQValue += qValue.value;
        maxQ = Math.max(maxQ, qValue.value);
        minQ = Math.min(minQ, qValue.value);
        count++;
      }
    }

    return {
      steps: this.stepCount,
      episodes: this.episodeCount,
      tableSize: count,
      explorationRate: this.config.explorationRate,
      avgQValue: count > 0 ? totalQValue / count : 0,
      maxQValue: count > 0 ? maxQ : 0,
      minQValue: count > 0 ? minQ : 0
    };
  }

  /**
   * Reset Q-table and learning state
   */
  reset(): void {
    this.qTable.clear();
    this.stepCount = 0;
    this.episodeCount = 0;
    this.config.explorationRate = DEFAULT_CONFIG.explorationRate;

    if (this.replayBuffer) {
      this.replayBuffer.clear();
    }

    this.logger.info('QLearning reset to initial state');
  }

  /**
   * Export Q-table and state for persistence
   */
  export(): {
    qTable: Record<string, Record<string, QValue>>;
    config: QLearningConfig;
    stepCount: number;
    episodeCount: number;
  } {
    const serializedQTable: Record<string, Record<string, QValue>> = {};

    for (const [state, actions] of this.qTable.entries()) {
      serializedQTable[state] = {};
      for (const [action, qValue] of actions.entries()) {
        serializedQTable[state][action] = qValue;
      }
    }

    return {
      qTable: serializedQTable,
      config: { ...this.config },
      stepCount: this.stepCount,
      episodeCount: this.episodeCount
    };
  }

  /**
   * Import Q-table and state from persistence
   */
  import(state: {
    qTable: Record<string, Record<string, QValue>>;
    config: QLearningConfig;
    stepCount: number;
    episodeCount: number;
  }): void {
    this.qTable.clear();

    for (const [stateKey, actions] of Object.entries(state.qTable)) {
      const actionMap = new Map<string, QValue>();
      for (const [actionKey, qValue] of Object.entries(actions)) {
        actionMap.set(actionKey, qValue);
      }
      this.qTable.set(stateKey, actionMap);
    }

    this.config = { ...state.config };
    this.stepCount = state.stepCount;
    this.episodeCount = state.episodeCount;

    this.logger.info(`Imported Q-table with ${this.getTableSize()} state-action pairs`);
  }

  /**
   * Get memory usage estimate in bytes
   */
  getMemoryUsage(): number {
    const qTableSize = JSON.stringify(this.export().qTable).length;
    const bufferSize = this.replayBuffer?.getMemoryUsage() ?? 0;
    return qTableSize + bufferSize;
  }
}
