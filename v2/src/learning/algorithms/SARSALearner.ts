/**
 * SARSALearner - On-policy TD(0) Reinforcement Learning
 *
 * Implements SARSA (State-Action-Reward-State-Action) algorithm.
 * Key differences from Q-Learning:
 * - On-policy: learns Q-values for the policy being followed (epsilon-greedy)
 * - Uses actual next action taken, not the max Q-value
 * - Update rule: Q(s,a) ← Q(s,a) + α[r + γQ(s',a') - Q(s,a)]
 * - More conservative than Q-Learning, safer for exploration
 */

import { AbstractRLLearner, RLConfig } from './AbstractRLLearner';
import { TaskExperience, AgentAction, TaskState } from '../types';

/**
 * SARSA configuration (same as base RL config)
 */
export type SARSAConfig = RLConfig;

/**
 * Default SARSA configuration
 */
const DEFAULT_SARSA_CONFIG: RLConfig = {
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
 * SARSALearner - On-policy Temporal Difference Learning
 *
 * SARSA is an on-policy TD control algorithm that learns the Q-values
 * for the policy being followed (typically epsilon-greedy).
 *
 * Key Characteristics:
 * - Updates based on (State, Action, Reward, next State, next Action)
 * - Learns Q-values for the actual policy (including exploration)
 * - More conservative than Q-Learning
 * - Better for tasks where exploration is risky
 * - Converges to optimal policy under certain conditions
 *
 * Update Rule:
 * Q(s,a) ← Q(s,a) + α[r + γQ(s',a') - Q(s,a)]
 * where a' is the action actually taken in state s' (not necessarily greedy)
 */
export class SARSALearner extends AbstractRLLearner {
  private readonly defaultConfig: RLConfig;
  private lastStateAction?: { state: string; action: string }; // For episode-based updates

  constructor(config: Partial<RLConfig> = {}) {
    const fullConfig = { ...DEFAULT_SARSA_CONFIG, ...config };
    super(fullConfig);
    this.defaultConfig = fullConfig;
    this.logger.info('SARSALearner initialized with on-policy TD(0)', { config: fullConfig });
  }

  /**
   * Update Q-value using SARSA on-policy update rule
   * Q(s,a) ← Q(s,a) + α[r + γQ(s',a') - Q(s,a)]
   *
   * @param experience The transition experience (s, a, r, s')
   * @param nextAction The actual action taken in next state (SARSA requires this!)
   *                   If not provided, selects action using current policy (epsilon-greedy)
   */
  update(experience: TaskExperience, nextAction?: AgentAction): void {
    const stateKey = this.encodeState(experience.state);
    const actionKey = this.encodeAction(experience.action);
    const nextStateKey = this.encodeState(experience.nextState);

    // Get current Q-value Q(s,a)
    const stateActions = this.qTable.get(stateKey);
    const currentQ = stateActions?.get(actionKey)?.value ?? 0;

    // SARSA: Get Q-value for next action that will actually be taken
    // This is the key difference from Q-Learning (which uses max Q-value)
    let nextQ = 0;

    if (nextAction) {
      // Use provided next action (typical in online learning)
      const nextActionKey = this.encodeAction(nextAction);
      const nextStateActions = this.qTable.get(nextStateKey);
      nextQ = nextStateActions?.get(nextActionKey)?.value ?? 0;
    } else {
      // If no next action provided, we need to select one using epsilon-greedy
      // This happens in batch updates from experience replay
      // We approximate by using a greedy action (conservative estimate)
      const nextStateActions = this.qTable.get(nextStateKey);
      if (nextStateActions && nextStateActions.size > 0) {
        // Use expected SARSA approximation: average over all actions weighted by policy
        nextQ = this.getExpectedValue(experience.nextState, nextStateActions);
      }
    }

    // SARSA update rule
    // Q(s,a) = Q(s,a) + α * [r + γ * Q(s',a') - Q(s,a)]
    const tdTarget = experience.reward + this.config.discountFactor * nextQ;
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
   * Calculate expected value for next state under current epsilon-greedy policy
   * This is used when we don't have the actual next action (e.g., in batch updates)
   *
   * Expected SARSA: E[Q(s',a')] = ε/|A| * Σ Q(s',a) + (1-ε) * max Q(s',a)
   */
  private getExpectedValue(nextState: TaskState, nextStateActions: Map<string, any>): number {
    if (nextStateActions.size === 0) {
      return 0;
    }

    const epsilon = this.config.explorationRate;
    const numActions = nextStateActions.size;

    // Calculate average Q-value (for random exploration)
    let sumQ = 0;
    let maxQ = -Infinity;

    for (const qValue of nextStateActions.values()) {
      sumQ += qValue.value;
      maxQ = Math.max(maxQ, qValue.value);
    }

    const avgQ = sumQ / numActions;

    // Expected value under epsilon-greedy policy
    // ε * (average of all actions) + (1-ε) * (max action)
    return epsilon * avgQ + (1 - epsilon) * maxQ;
  }

  /**
   * Select next action and update with SARSA
   * This is the typical SARSA flow: select action, observe reward, select next action, update
   *
   * @param currentState Current state
   * @param currentAction Action taken in current state
   * @param reward Reward received
   * @param nextState Next state observed
   * @param availableActions Actions available in next state
   * @returns Next action selected (for continued learning)
   */
  selectAndUpdate(
    currentState: TaskState,
    currentAction: AgentAction,
    reward: number,
    nextState: TaskState,
    availableActions: AgentAction[]
  ): AgentAction {
    // Select next action using epsilon-greedy policy
    const nextAction = this.selectAction(nextState, availableActions);

    // Create experience
    const experience: TaskExperience = {
      taskId: `sarsa-${Date.now()}`,
      taskType: 'online-learning',
      state: currentState,
      action: currentAction,
      reward,
      nextState,
      timestamp: new Date(),
      agentId: 'sarsa-learner'
    };

    // Update Q-value using SARSA rule with actual next action
    this.update(experience, nextAction);

    return nextAction;
  }

  /**
   * Learn from a complete episode trajectory
   * Updates all state-action pairs in the trajectory using SARSA
   *
   * @param trajectory Array of (state, action, reward) tuples
   */
  learnFromEpisode(
    trajectory: Array<{
      state: TaskState;
      action: AgentAction;
      reward: number;
    }>
  ): void {
    // SARSA updates each transition with the next action in the trajectory
    for (let i = 0; i < trajectory.length - 1; i++) {
      const current = trajectory[i];
      const next = trajectory[i + 1];

      const experience: TaskExperience = {
        taskId: `episode-${Date.now()}-${i}`,
        taskType: 'episode-learning',
        state: current.state,
        action: current.action,
        reward: current.reward,
        nextState: next.state,
        timestamp: new Date(),
        agentId: 'sarsa-learner'
      };

      // Update with the actual next action from trajectory
      this.update(experience, next.action);
    }

    // Handle terminal state (last transition)
    if (trajectory.length > 0) {
      const last = trajectory[trajectory.length - 1];
      const terminalExperience: TaskExperience = {
        taskId: `episode-${Date.now()}-terminal`,
        taskType: 'episode-learning',
        state: last.state,
        action: last.action,
        reward: last.reward,
        nextState: last.state, // Terminal state transitions to itself
        timestamp: new Date(),
        agentId: 'sarsa-learner'
      };

      // Terminal state has no next action, Q(terminal, any) = 0
      this.update(terminalExperience);
    }

    this.endEpisode();
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
    return 'SARSA';
  }

  /**
   * Get algorithm type (on-policy)
   */
  getAlgorithmType(): 'on-policy' | 'off-policy' {
    return 'on-policy';
  }

  /**
   * Get detailed statistics including SARSA-specific metrics
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

  /**
   * Compare performance with expected convergence
   * SARSA typically converges slower but more safely than Q-Learning
   */
  getConvergenceMetrics(): {
    isConverging: boolean;
    convergenceRate: number;
    stability: number;
  } {
    const stats = this.getStatistics();

    // Check if Q-values are stabilizing
    const avgQValue = stats.avgQValue;
    const qValueRange = stats.maxQValue - stats.minQValue;

    // Convergence indicators:
    // 1. Low exploration rate (mostly exploiting)
    // 2. Reasonable Q-value range (not diverging)
    // 3. Sufficient episodes for learning

    const isConverging =
      stats.explorationRate < 0.1 && // Low exploration
      qValueRange < 10 && // Bounded Q-values
      stats.episodes > 20; // Sufficient training

    const convergenceRate = stats.episodes > 0
      ? Math.min(1.0, stats.episodes / 100)
      : 0;

    const stability = qValueRange > 0
      ? 1.0 - Math.min(1.0, qValueRange / 20)
      : 0.5;

    return {
      isConverging,
      convergenceRate,
      stability
    };
  }
}
