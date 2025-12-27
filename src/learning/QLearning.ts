/**
 * QLearning - Off-policy TD(0) Reinforcement Learning
 *
 * Implements standard Q-learning algorithm for reinforcement learning.
 * Key differences from SARSA:
 * - Off-policy: learns optimal Q-values regardless of policy being followed
 * - Uses max Q-value for next state, not actual next action
 * - Update rule: Q(s,a) ← Q(s,a) + α[r + γ·max(Q(s',a')) - Q(s,a)]
 * - More aggressive than SARSA, finds optimal policy faster
 */

import { AbstractRLLearner, RLConfig } from './algorithms/AbstractRLLearner';
import { TaskExperience, AgentAction } from './types';

/**
 * Q-learning configuration (same as base RL config)
 */
export type QLearningConfig = RLConfig;

/**
 * Default Q-learning configuration
 */
const DEFAULT_CONFIG: RLConfig = {
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
 * QLearning - Standard Q-learning implementation
 *
 * Implements the classic Q-learning algorithm with:
 * - Epsilon-greedy exploration policy
 * - Off-policy temporal difference (TD) learning
 * - Q-table for state-action values
 * - Optional experience replay for stability
 *
 * Update Rule:
 * Q(s,a) ← Q(s,a) + α[r + γ·max_a'(Q(s',a')) - Q(s,a)]
 *
 * Key characteristics:
 * - Off-policy: learns about optimal policy while following exploration policy
 * - Uses max Q-value (greedy) for bootstrapping
 * - Converges to optimal Q* under certain conditions
 * - More sample-efficient than on-policy methods
 */
export class QLearning extends AbstractRLLearner {
  private readonly defaultConfig: RLConfig;

  constructor(config: Partial<RLConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(fullConfig);
    this.defaultConfig = fullConfig;
    this.logger.info('QLearning initialized with off-policy TD(0)', { config: fullConfig });
  }

  /**
   * Update Q-value using Q-learning update rule
   * Q(s,a) ← Q(s,a) + α[r + γ·max(Q(s',a')) - Q(s,a)]
   *
   * @param experience The transition experience (s, a, r, s')
   * @param nextAction Ignored in Q-learning (uses max Q-value instead)
   */
  update(experience: TaskExperience, nextAction?: AgentAction): void {
    const stateKey = this.encodeState(experience.state);
    const actionKey = this.encodeAction(experience.action);
    const nextStateKey = this.encodeState(experience.nextState);

    // Get current Q-value Q(s,a)
    const stateActions = this.qTable.get(stateKey);
    const currentQ = stateActions?.get(actionKey)?.value ?? 0;

    // Q-Learning: Get max Q-value for next state (greedy)
    // This is the key difference from SARSA (which uses actual next action)
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
    this.setQValue(stateKey, actionKey, newQ);

    // Add to experience replay buffer if enabled
    if (this.replayBuffer) {
      this.replayBuffer.add(experience, Math.abs(tdError)); // Priority based on TD error
    }

    this.stepCount++;
  }

  /**
   * Get the default exploration rate for this algorithm
   */
  protected getDefaultExplorationRate(): number {
    return this.defaultConfig.explorationRate;
  }

  /**
   * Get algorithm name
   */
  getAlgorithmName(): string {
    return 'Q-Learning';
  }

  /**
   * Get algorithm type (off-policy)
   */
  getAlgorithmType(): 'on-policy' | 'off-policy' {
    return 'off-policy';
  }

  /**
   * Get detailed statistics including Q-learning-specific metrics
   */
  getDetailedStatistics(): {
    algorithm: string;
    type: 'on-policy' | 'off-policy';
    stats: ReturnType<AbstractRLLearner['getStatistics']>;
  } {
    return {
      algorithm: this.getAlgorithmName(),
      type: this.getAlgorithmType(),
      stats: this.getStatistics()
    };
  }
}
