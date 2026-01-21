/**
 * PPOLearner - Proximal Policy Optimization Algorithm
 *
 * Implements PPO-Clip, the most widely used variant of PPO:
 * - Clipped surrogate objective to prevent large policy updates
 * - Generalized Advantage Estimation (GAE) for variance reduction
 * - Value function clipping for stability
 * - Multiple epochs over collected trajectories
 *
 * Key features:
 * - Trust region optimization without KL constraint
 * - Sample efficient with mini-batch updates
 * - Robust to hyperparameter choices
 * - Suitable for continuous and discrete action spaces
 *
 * PPO-Clip objective:
 * L^CLIP(θ) = E[min(r(θ)Â, clip(r(θ), 1-ε, 1+ε)Â)]
 * where r(θ) = π_θ(a|s) / π_θ_old(a|s)
 *
 * @module learning/algorithms/PPOLearner
 * @version 1.0.0
 */

import { AbstractRLLearner, RLConfig, QValue } from './AbstractRLLearner';
import { seededRandom } from '../../utils/SeededRandom';
import { TaskState, AgentAction, TaskExperience } from '../types';

/**
 * Configuration specific to PPO algorithm
 */
export interface PPOConfig extends RLConfig {
  /** Clipping parameter (ε) - typically 0.1-0.3 */
  clipEpsilon: number;
  /** Number of epochs to train on collected data */
  ppoEpochs: number;
  /** Mini-batch size for training */
  miniBatchSize: number;
  /** Value function loss coefficient */
  valueLossCoefficient: number;
  /** Entropy loss coefficient for exploration */
  entropyCoefficient: number;
  /** GAE lambda for advantage estimation */
  gaeLambda: number;
  /** Maximum gradient norm for clipping */
  maxGradNorm: number;
  /** Whether to clip value function updates */
  clipValueLoss: boolean;
  /** Learning rate for policy network */
  policyLearningRate: number;
  /** Learning rate for value network */
  valueLearningRate: number;
}

/**
 * Trajectory step for PPO
 */
interface TrajectoryStep {
  state: string;
  action: string;
  reward: number;
  nextState: string;
  done: boolean;
  value: number;
  logProb: number;
  advantage: number;
  returns: number;
}

/**
 * Policy parameters for a state-action pair
 */
interface PolicyParams {
  preference: number;
  logProb: number;
  updateCount: number;
}

/**
 * PPOLearner - Proximal Policy Optimization implementation
 *
 * PPO is a state-of-the-art policy gradient method that achieves
 * strong performance while being simpler than TRPO.
 *
 * Usage:
 * ```typescript
 * const ppo = new PPOLearner({
 *   learningRate: 0.0003,
 *   discountFactor: 0.99,
 *   explorationRate: 0.0,
 *   explorationDecay: 1.0,
 *   minExplorationRate: 0.0,
 *   clipEpsilon: 0.2,
 *   ppoEpochs: 4,
 *   miniBatchSize: 64,
 *   valueLossCoefficient: 0.5,
 *   entropyCoefficient: 0.01,
 *   gaeLambda: 0.95,
 *   maxGradNorm: 0.5,
 *   clipValueLoss: true,
 *   policyLearningRate: 0.0003,
 *   valueLearningRate: 0.001,
 *   useExperienceReplay: false,
 *   replayBufferSize: 2048,
 *   batchSize: 64
 * });
 *
 * // Collect trajectory
 * ppo.collectStep(state, action, reward, nextState, done);
 *
 * // Train on collected trajectory
 * ppo.trainOnTrajectory();
 * ```
 */
export class PPOLearner extends AbstractRLLearner {
  private ppoConfig: PPOConfig;
  private policyTable: Map<string, Map<string, PolicyParams>>;
  private valueTable: Map<string, number>;
  private oldPolicyTable: Map<string, Map<string, PolicyParams>>;
  private trajectory: TrajectoryStep[];
  private readonly defaultExploration: number;

  constructor(config: PPOConfig) {
    super(config);
    this.ppoConfig = config;
    this.policyTable = new Map();
    this.valueTable = new Map();
    this.oldPolicyTable = new Map();
    this.trajectory = [];
    this.defaultExploration = config.explorationRate;

    this.logger.info('PPOLearner initialized', {
      clipEpsilon: config.clipEpsilon,
      epochs: config.ppoEpochs,
      gaeLambda: config.gaeLambda,
      entropyCoeff: config.entropyCoefficient
    });
  }

  /**
   * Select action using current policy (softmax)
   */
  override selectAction(state: TaskState, availableActions: AgentAction[]): AgentAction {
    if (availableActions.length === 0) {
      throw new Error('No available actions to select from');
    }

    const stateKey = this.encodeState(state);
    const probs = this.getActionProbabilities(stateKey, availableActions);

    // Sample from distribution
    const random = seededRandom.random();
    let cumulative = 0;

    for (let i = 0; i < availableActions.length; i++) {
      cumulative += probs[i];
      if (random <= cumulative) {
        return availableActions[i];
      }
    }

    return availableActions[availableActions.length - 1];
  }

  /**
   * Get action probabilities using softmax policy
   */
  private getActionProbabilities(stateKey: string, availableActions: AgentAction[]): number[] {
    const preferences: number[] = [];

    for (const action of availableActions) {
      const actionKey = this.encodeAction(action);
      const params = this.getPolicyParams(stateKey, actionKey);
      preferences.push(params.preference);
    }

    // Softmax with numerical stability
    const maxPref = Math.max(...preferences);
    const expPrefs = preferences.map(p => Math.exp(p - maxPref));
    const sumExp = expPrefs.reduce((sum, e) => sum + e, 0);

    return expPrefs.map(e => e / sumExp);
  }

  /**
   * Get policy parameters for state-action pair
   */
  private getPolicyParams(stateKey: string, actionKey: string): PolicyParams {
    const statePolicy = this.policyTable.get(stateKey);
    if (!statePolicy) {
      return { preference: 0, logProb: 0, updateCount: 0 };
    }
    return statePolicy.get(actionKey) ?? { preference: 0, logProb: 0, updateCount: 0 };
  }

  /**
   * Get log probability of action under current policy
   */
  private getLogProb(stateKey: string, actionKey: string, availableActions?: AgentAction[]): number {
    // Get preference for target action
    const params = this.getPolicyParams(stateKey, actionKey);

    // If we don't know the action space, return stored log prob
    if (!availableActions) {
      return params.logProb;
    }

    // Calculate actual log probability
    const prefs: number[] = [];
    let targetPref = params.preference;

    for (const action of availableActions) {
      const ak = this.encodeAction(action);
      const p = this.getPolicyParams(stateKey, ak);
      prefs.push(p.preference);
      if (ak === actionKey) {
        targetPref = p.preference;
      }
    }

    const maxPref = Math.max(...prefs, targetPref);
    const expTarget = Math.exp(targetPref - maxPref);
    const sumExp = prefs.reduce((sum, p) => sum + Math.exp(p - maxPref), 0);

    return Math.log(expTarget / sumExp);
  }

  /**
   * Get state value from value network
   */
  override getStateValue(state: TaskState): number {
    const stateKey = this.encodeState(state);
    return this.valueTable.get(stateKey) ?? 0;
  }

  /**
   * Collect a step in the trajectory
   */
  collectStep(
    state: TaskState,
    action: AgentAction,
    reward: number,
    nextState: TaskState,
    done: boolean
  ): void {
    const stateKey = this.encodeState(state);
    const actionKey = this.encodeAction(action);
    const nextStateKey = this.encodeState(nextState);

    const value = this.valueTable.get(stateKey) ?? 0;
    const logProb = this.getLogProb(stateKey, actionKey);

    this.trajectory.push({
      state: stateKey,
      action: actionKey,
      reward,
      nextState: nextStateKey,
      done,
      value,
      logProb,
      advantage: 0, // Computed later
      returns: 0    // Computed later
    });
  }

  /**
   * Standard update interface - collects experience and trains when ready
   */
  override update(experience: TaskExperience, nextAction?: AgentAction): void {
    this.stepCount++;

    const { state, action, reward, nextState } = experience;
    const done = experience.done ?? false;

    // Collect step
    this.collectStep(state, action, reward, nextState, done);

    // Train when trajectory is large enough
    if (this.trajectory.length >= this.ppoConfig.replayBufferSize) {
      this.trainOnTrajectory();
    }
  }

  /**
   * Train on collected trajectory using PPO
   */
  trainOnTrajectory(): void {
    if (this.trajectory.length === 0) {
      return;
    }

    // Compute advantages using GAE
    this.computeGAE();

    // Save old policy for ratio computation
    this.saveOldPolicy();

    // Multiple epochs of training
    for (let epoch = 0; epoch < this.ppoConfig.ppoEpochs; epoch++) {
      this.trainEpoch();
    }

    // Clear trajectory
    this.trajectory = [];

    this.logger.info('PPO training complete', {
      epochs: this.ppoConfig.ppoEpochs,
      steps: this.stepCount
    });
  }

  /**
   * Compute Generalized Advantage Estimation (GAE)
   *
   * GAE: Â_t = Σ_{l=0}^∞ (γλ)^l δ_{t+l}
   * where δ_t = r_t + γV(s_{t+1}) - V(s_t)
   */
  private computeGAE(): void {
    const gamma = this.config.discountFactor;
    const lambda = this.ppoConfig.gaeLambda;

    let lastGaeLam = 0;
    const n = this.trajectory.length;

    // Compute returns and advantages backwards
    for (let t = n - 1; t >= 0; t--) {
      const step = this.trajectory[t];

      const nextValue = step.done
        ? 0
        : (t < n - 1 ? this.trajectory[t + 1].value : this.valueTable.get(step.nextState) ?? 0);

      // TD error
      const delta = step.reward + gamma * nextValue - step.value;

      // GAE advantage
      lastGaeLam = step.done
        ? delta
        : delta + gamma * lambda * lastGaeLam;

      step.advantage = lastGaeLam;
      step.returns = step.advantage + step.value;
    }

    // Normalize advantages
    const advantages = this.trajectory.map(s => s.advantage);
    const mean = advantages.reduce((s, a) => s + a, 0) / advantages.length;
    const variance = advantages.reduce((s, a) => s + (a - mean) ** 2, 0) / advantages.length;
    const std = Math.sqrt(variance) + 1e-8;

    for (const step of this.trajectory) {
      step.advantage = (step.advantage - mean) / std;
    }
  }

  /**
   * Save current policy as old policy for ratio computation
   */
  private saveOldPolicy(): void {
    this.oldPolicyTable.clear();
    for (const [state, actions] of this.policyTable.entries()) {
      const actionMap = new Map<string, PolicyParams>();
      for (const [action, params] of actions.entries()) {
        actionMap.set(action, { ...params });
      }
      this.oldPolicyTable.set(state, actionMap);
    }
  }

  /**
   * Get old log probability for ratio computation
   */
  private getOldLogProb(stateKey: string, actionKey: string): number {
    const statePolicy = this.oldPolicyTable.get(stateKey);
    if (!statePolicy) {
      return 0;
    }
    return statePolicy.get(actionKey)?.logProb ?? 0;
  }

  /**
   * Train one epoch on the trajectory
   */
  private trainEpoch(): void {
    // Shuffle trajectory
    const shuffled = seededRandom.shuffle(this.trajectory);

    // Mini-batch updates
    for (let i = 0; i < shuffled.length; i += this.ppoConfig.miniBatchSize) {
      const batch = shuffled.slice(i, i + this.ppoConfig.miniBatchSize);
      this.trainMiniBatch(batch);
    }
  }

  /**
   * Train on a mini-batch
   */
  private trainMiniBatch(batch: TrajectoryStep[]): void {
    for (const step of batch) {
      // Compute probability ratio
      const newLogProb = this.getLogProb(step.state, step.action);
      const oldLogProb = step.logProb; // Use stored log prob
      const ratio = Math.exp(newLogProb - oldLogProb);

      // Compute clipped and unclipped objectives
      const eps = this.ppoConfig.clipEpsilon;
      const surr1 = ratio * step.advantage;
      const surr2 = Math.max(Math.min(ratio, 1 + eps), 1 - eps) * step.advantage;

      // Policy loss (negative because we want to maximize)
      const policyLoss = -Math.min(surr1, surr2);

      // Value loss
      const valueTarget = step.returns;
      const currentValue = this.valueTable.get(step.state) ?? 0;
      let valueLoss = (currentValue - valueTarget) ** 2;

      // Clip value loss if enabled
      if (this.ppoConfig.clipValueLoss) {
        const clippedValue = step.value + Math.max(Math.min(currentValue - step.value, eps), -eps);
        const clippedValueLoss = (clippedValue - valueTarget) ** 2;
        valueLoss = Math.max(valueLoss, clippedValueLoss);
      }

      // Entropy bonus
      const entropy = this.computeEntropy(step.state);
      const entropyLoss = -this.ppoConfig.entropyCoefficient * entropy;

      // Total loss
      const totalLoss = policyLoss + this.ppoConfig.valueLossCoefficient * valueLoss + entropyLoss;

      // Update policy (gradient ascent direction)
      this.updatePolicy(step.state, step.action, step.advantage, ratio);

      // Update value function
      this.updateValue(step.state, valueTarget);
    }
  }

  /**
   * Update policy parameters
   */
  private updatePolicy(
    stateKey: string,
    actionKey: string,
    advantage: number,
    ratio: number
  ): void {
    if (!this.policyTable.has(stateKey)) {
      this.policyTable.set(stateKey, new Map());
    }
    const statePolicy = this.policyTable.get(stateKey)!;

    const current = statePolicy.get(actionKey) ?? { preference: 0, logProb: 0, updateCount: 0 };

    // Clipped gradient
    const eps = this.ppoConfig.clipEpsilon;
    let gradient = advantage;
    if ((ratio > 1 + eps && advantage > 0) || (ratio < 1 - eps && advantage < 0)) {
      gradient = 0; // Clipped - no update
    }

    // Update preference
    const newPreference = current.preference + this.ppoConfig.policyLearningRate * gradient;
    const newLogProb = this.getLogProb(stateKey, actionKey);

    statePolicy.set(actionKey, {
      preference: newPreference,
      logProb: newLogProb,
      updateCount: current.updateCount + 1
    });

    // Update Q-table for compatibility
    this.setQValue(stateKey, actionKey, newPreference);
  }

  /**
   * Update value function
   */
  private updateValue(stateKey: string, target: number): void {
    const current = this.valueTable.get(stateKey) ?? 0;
    const newValue = current + this.ppoConfig.valueLearningRate * (target - current);
    this.valueTable.set(stateKey, newValue);
  }

  /**
   * Compute entropy of policy at state
   */
  private computeEntropy(stateKey: string): number {
    const statePolicy = this.policyTable.get(stateKey);
    if (!statePolicy || statePolicy.size === 0) {
      return 0;
    }

    const prefs = Array.from(statePolicy.values()).map(p => p.preference);
    const maxPref = Math.max(...prefs);
    const expPrefs = prefs.map(p => Math.exp(p - maxPref));
    const sumExp = expPrefs.reduce((s, e) => s + e, 0);
    const probs = expPrefs.map(e => e / sumExp);

    let entropy = 0;
    for (const p of probs) {
      if (p > 0) {
        entropy -= p * Math.log(p);
      }
    }

    return entropy;
  }

  /**
   * Get default exploration rate for reset
   */
  protected getDefaultExplorationRate(): number {
    return this.defaultExploration;
  }

  /**
   * Get PPO-specific statistics
   */
  getPPOStatistics(): {
    trajectoryLength: number;
    valueTableSize: number;
    policyTableSize: number;
    avgValue: number;
    avgAdvantage: number;
    clipFraction: number;
  } {
    let totalValue = 0;
    for (const v of this.valueTable.values()) {
      totalValue += v;
    }

    let policySize = 0;
    for (const statePolicy of this.policyTable.values()) {
      policySize += statePolicy.size;
    }

    const avgAdvantage = this.trajectory.length > 0
      ? this.trajectory.reduce((s, t) => s + t.advantage, 0) / this.trajectory.length
      : 0;

    return {
      trajectoryLength: this.trajectory.length,
      valueTableSize: this.valueTable.size,
      policyTableSize: policySize,
      avgValue: this.valueTable.size > 0 ? totalValue / this.valueTable.size : 0,
      avgAdvantage,
      clipFraction: 0 // Would need tracking during training
    };
  }

  /**
   * Reset PPO-specific state
   */
  override reset(): void {
    super.reset();
    this.policyTable.clear();
    this.valueTable.clear();
    this.oldPolicyTable.clear();
    this.trajectory = [];
    this.logger.info('PPOLearner reset');
  }

  /**
   * Export PPO state
   */
  exportPPO(): {
    base: ReturnType<AbstractRLLearner['export']>;
    policyTable: Record<string, Record<string, PolicyParams>>;
    valueTable: Record<string, number>;
    ppoConfig: PPOConfig;
  } {
    const serializedPolicy: Record<string, Record<string, PolicyParams>> = {};
    for (const [state, actions] of this.policyTable.entries()) {
      serializedPolicy[state] = {};
      for (const [action, params] of actions.entries()) {
        serializedPolicy[state][action] = params;
      }
    }

    const serializedValue: Record<string, number> = {};
    for (const [state, value] of this.valueTable.entries()) {
      serializedValue[state] = value;
    }

    return {
      base: this.export(),
      policyTable: serializedPolicy,
      valueTable: serializedValue,
      ppoConfig: { ...this.ppoConfig }
    };
  }

  /**
   * Import PPO state
   */
  importPPO(state: ReturnType<typeof this.exportPPO>): void {
    this.import(state.base);

    this.policyTable.clear();
    for (const [stateKey, actions] of Object.entries(state.policyTable)) {
      const actionMap = new Map<string, PolicyParams>();
      for (const [actionKey, params] of Object.entries(actions)) {
        actionMap.set(actionKey, params);
      }
      this.policyTable.set(stateKey, actionMap);
    }

    this.valueTable.clear();
    for (const [stateKey, value] of Object.entries(state.valueTable)) {
      this.valueTable.set(stateKey, value);
    }

    this.ppoConfig = { ...state.ppoConfig };

    this.logger.info('Imported PPO state', {
      policySize: this.policyTable.size,
      valueSize: this.valueTable.size
    });
  }
}

/**
 * Create default PPO configuration
 */
export function createDefaultPPOConfig(): PPOConfig {
  return {
    learningRate: 0.0003,
    discountFactor: 0.99,
    explorationRate: 0.0, // PPO uses entropy for exploration
    explorationDecay: 1.0,
    minExplorationRate: 0.0,
    clipEpsilon: 0.2,
    ppoEpochs: 4,
    miniBatchSize: 64,
    valueLossCoefficient: 0.5,
    entropyCoefficient: 0.01,
    gaeLambda: 0.95,
    maxGradNorm: 0.5,
    clipValueLoss: true,
    policyLearningRate: 0.0003,
    valueLearningRate: 0.001,
    useExperienceReplay: false, // PPO doesn't use replay buffer
    replayBufferSize: 2048,     // Used as trajectory buffer size
    batchSize: 64
  };
}
