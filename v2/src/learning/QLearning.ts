/**
 * QLearning - Off-policy TD(0) Reinforcement Learning
 *
 * Implements standard Q-learning algorithm for reinforcement learning.
 * Key differences from SARSA:
 * - Off-policy: learns optimal Q-values regardless of policy being followed
 * - Uses max Q-value for next state, not actual next action
 * - Update rule: Q(s,a) ← Q(s,a) + α[r + γ·max(Q(s',a')) - Q(s,a)]
 * - More aggressive than SARSA, finds optimal policy faster
 *
 * GOAP Integration (Phase 5):
 * - Static methods for encoding WorldState to discrete state representation
 * - GOAP action encoding for planning integration
 * - Factory method for GOAP-configured learner
 */

import { AbstractRLLearner, RLConfig } from './algorithms/AbstractRLLearner';
import { TaskExperience, AgentAction, TaskState } from './types';
import { LearningMetrics } from './metrics/LearningMetrics';

/**
 * GOAP WorldState interface (imported type to avoid circular dependency)
 */
interface GOAPWorldState {
  coverage: { line: number; branch: number; function: number; measured?: boolean };
  quality: { testsPassing: number; securityScore: number; performanceScore: number };
  fleet: { activeAgents: number; availableAgents: string[] };
  resources: { timeRemaining: number; memoryAvailable: number; parallelSlots: number };
  context: { environment: string; changeSize: string; riskLevel: string };
}

/**
 * GOAP Action interface (imported type to avoid circular dependency)
 */
interface GOAPAction {
  id: string;
  category: string;
  agentType: string;
  cost: number;
}

/**
 * Discretized GOAP state for Q-table
 */
export interface DiscreteGOAPState {
  coverageLevel: 'low' | 'medium' | 'high';
  qualityLevel: 'low' | 'medium' | 'high';
  securityLevel: 'low' | 'medium' | 'high';
  fleetCapacity: 'limited' | 'normal' | 'high';
  timeConstraint: 'tight' | 'normal' | 'relaxed';
  riskLevel: string;
}

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
  private metricsRecorder?: LearningMetrics;
  private metricsRecordingInterval: number = 10; // Record every N updates
  private agentId: string;

  constructor(config: Partial<RLConfig> = {}, agentId?: string) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(fullConfig);
    this.defaultConfig = fullConfig;
    this.agentId = agentId || `qlearning-${Date.now()}`;

    // Initialize metrics recorder (optional - fails gracefully)
    try {
      this.metricsRecorder = new LearningMetrics();
    } catch (error) {
      this.logger.debug('LearningMetrics not available for QLearning', { error });
    }

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

    // Record metrics periodically (every N updates) for database persistence
    if (this.metricsRecorder && this.stepCount % this.metricsRecordingInterval === 0) {
      this.recordMetricsToDb(stateKey, actionKey, experience.reward, newQ, tdError);
    }
  }

  /**
   * Record learning metrics and history to database
   * Called periodically to avoid performance overhead
   */
  private recordMetricsToDb(
    stateKey: string,
    actionKey: string,
    reward: number,
    qValue: number,
    tdError: number
  ): void {
    if (!this.metricsRecorder) return;

    try {
      // Record Q-value metric
      this.metricsRecorder.recordMetric({
        agentId: this.agentId,
        metricType: 'q_value',
        metricValue: qValue
      });

      // Record exploration rate metric
      this.metricsRecorder.recordMetric({
        agentId: this.agentId,
        metricType: 'exploration_rate',
        metricValue: this.config.explorationRate
      });

      // Record learning history
      this.metricsRecorder.recordLearningHistory({
        agentId: this.agentId,
        stateRepresentation: stateKey,
        action: actionKey,
        reward: reward,
        qValue: qValue,
        episode: this.episodeCount
      });
    } catch (error) {
      // Silently ignore metric recording errors
      this.logger.debug('Failed to record learning metrics', { error });
    }
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

  // ============================================================================
  // GOAP Integration Methods (Phase 5)
  // ============================================================================

  /**
   * Create a Q-Learner configured for GOAP planning
   * Uses optimized hyperparameters for plan learning
   */
  static createForGOAP(agentId?: string): QLearning {
    return new QLearning({
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.2,        // Lower exploration for planning
      explorationDecay: 0.995,
      minExplorationRate: 0.05,
      useExperienceReplay: true,
      replayBufferSize: 5000,      // Smaller buffer for plans
      batchSize: 32
    }, agentId || 'goap-qlearner');
  }

  /**
   * Discretize WorldState for Q-table lookup
   * Reduces continuous state space to discrete buckets
   */
  static discretizeWorldState(state: GOAPWorldState): DiscreteGOAPState {
    return {
      coverageLevel: QLearning.discretizeCoverage(state.coverage.line),
      qualityLevel: QLearning.discretizeQuality(state.quality.testsPassing),
      securityLevel: QLearning.discretizeSecurity(state.quality.securityScore),
      fleetCapacity: QLearning.discretizeFleet(state.fleet.availableAgents.length),
      timeConstraint: QLearning.discretizeTime(state.resources.timeRemaining),
      riskLevel: state.context.riskLevel
    };
  }

  /**
   * Encode discretized GOAP state to string key
   */
  static encodeGOAPState(discrete: DiscreteGOAPState): string {
    return `${discrete.coverageLevel}:${discrete.qualityLevel}:${discrete.securityLevel}:` +
           `${discrete.fleetCapacity}:${discrete.timeConstraint}:${discrete.riskLevel}`;
  }

  /**
   * Encode GOAP action to string key
   */
  static encodeGOAPAction(action: GOAPAction): string {
    const costLevel = action.cost < 1.5 ? 'L' : action.cost < 3 ? 'M' : 'H';
    return `${action.category}:${action.agentType}:${costLevel}`;
  }

  /**
   * Convert WorldState to TaskState for Q-learning
   */
  static worldStateToTaskState(state: GOAPWorldState): TaskState {
    const discrete = QLearning.discretizeWorldState(state);
    const complexityMap: Record<string, number> = {
      low: 0.3, medium: 0.5, high: 0.8, critical: 1.0
    };
    const resourceMap: Record<string, number> = {
      limited: 0.3, normal: 0.6, high: 0.9
    };

    return {
      taskComplexity: complexityMap[discrete.riskLevel] ?? 0.5,
      requiredCapabilities: [discrete.coverageLevel, discrete.qualityLevel, discrete.securityLevel],
      contextFeatures: {
        coverageLevel: discrete.coverageLevel,
        qualityLevel: discrete.qualityLevel,
        securityLevel: discrete.securityLevel,
        fleetCapacity: discrete.fleetCapacity,
        timeConstraint: discrete.timeConstraint,
        riskLevel: discrete.riskLevel
      },
      previousAttempts: 0,
      availableResources: resourceMap[discrete.fleetCapacity] ?? 0.6,
      timeConstraint: state.resources.timeRemaining * 1000 // Convert to ms
    };
  }

  /**
   * Convert GOAP action to AgentAction for Q-learning
   */
  static goapActionToAgentAction(action: GOAPAction): AgentAction {
    const costLevel = action.cost < 1.5 ? 'low' : action.cost < 3 ? 'medium' : 'high';
    return {
      strategy: action.category,
      toolsUsed: [action.agentType],
      parallelization: costLevel === 'high' ? 0.3 : costLevel === 'medium' ? 0.5 : 0.8,
      retryPolicy: 'exponential',
      resourceAllocation: costLevel === 'low' ? 0.3 : costLevel === 'medium' ? 0.5 : 0.8
    };
  }

  // Discretization helper methods

  private static discretizeCoverage(coverage: number): 'low' | 'medium' | 'high' {
    if (coverage < 50) return 'low';
    if (coverage < 80) return 'medium';
    return 'high';
  }

  private static discretizeQuality(quality: number): 'low' | 'medium' | 'high' {
    if (quality < 70) return 'low';
    if (quality < 90) return 'medium';
    return 'high';
  }

  private static discretizeSecurity(score: number): 'low' | 'medium' | 'high' {
    if (score < 60) return 'low';
    if (score < 85) return 'medium';
    return 'high';
  }

  private static discretizeFleet(agents: number): 'limited' | 'normal' | 'high' {
    if (agents < 3) return 'limited';
    if (agents < 7) return 'normal';
    return 'high';
  }

  private static discretizeTime(seconds: number): 'tight' | 'normal' | 'relaxed' {
    if (seconds < 300) return 'tight';      // < 5 min
    if (seconds < 1800) return 'normal';    // < 30 min
    return 'relaxed';
  }

  /**
   * Calculate reward for GOAP action execution
   * Used by PlanLearning for experience generation
   */
  static calculateGOAPReward(
    success: boolean,
    executionTimeMs: number,
    expectedTimeMs: number,
    actionCost: number,
    coverageImprovement: number,
    qualityImprovement: number
  ): number {
    let reward = 0;

    // Base reward for success/failure
    reward += success ? 1.0 : -0.5;

    // Time efficiency bonus (faster = better)
    const timeRatio = expectedTimeMs / Math.max(executionTimeMs, 1);
    reward += Math.min(timeRatio - 1, 0.5) * 0.3;

    // Cost efficiency (penalize high-cost actions)
    reward -= actionCost * 0.1;

    // Improvement bonuses
    reward += coverageImprovement * 0.02;
    reward += qualityImprovement * 0.02;

    // Clamp to [-1, 1]
    return Math.max(-1, Math.min(1, reward));
  }

  /**
   * Get Q-value for a GOAP state-action pair
   */
  getGOAPQValue(state: GOAPWorldState, action: GOAPAction): number {
    const taskState = QLearning.worldStateToTaskState(state);
    const agentAction = QLearning.goapActionToAgentAction(action);
    return this.getQValue(taskState, agentAction);
  }

  /**
   * Get best GOAP action from available actions
   */
  getBestGOAPAction(state: GOAPWorldState, availableActions: GOAPAction[]): GOAPAction | null {
    if (availableActions.length === 0) return null;

    const taskState = QLearning.worldStateToTaskState(state);
    const agentActions = availableActions.map(a => QLearning.goapActionToAgentAction(a));

    const bestAgentAction = this.getBestAction(taskState, agentActions);
    const bestIndex = agentActions.findIndex(
      a => a.strategy === bestAgentAction.strategy &&
           a.toolsUsed[0] === bestAgentAction.toolsUsed[0]
    );

    return bestIndex >= 0 ? availableActions[bestIndex] : availableActions[0];
  }
}
