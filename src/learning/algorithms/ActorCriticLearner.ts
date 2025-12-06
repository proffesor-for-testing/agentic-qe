/**
 * ActorCriticLearner - Actor-Critic Reinforcement Learning Algorithm
 *
 * Implements Advantage Actor-Critic (A2C) combining:
 * - Actor: Policy network that selects actions using softmax policy
 * - Critic: Value network that estimates state values for advantage calculation
 *
 * Key features:
 * - Continuous action probabilities via softmax
 * - Advantage-based updates to reduce variance
 * - Entropy bonus for exploration
 * - Policy gradient with baseline
 *
 * Update rules:
 * - Critic (Value): V(s) += α_c * δ where δ = r + γV(s') - V(s)
 * - Actor (Policy): π(a|s) += α_a * δ * ∇log(π(a|s)) + β * H(π)
 *
 * @module learning/algorithms/ActorCriticLearner
 * @version 1.0.0
 */

import { AbstractRLLearner, RLConfig, QValue } from './AbstractRLLearner';
import { TaskState, AgentAction, TaskExperience } from '../types';

/**
 * Configuration specific to Actor-Critic algorithm
 */
export interface ActorCriticConfig extends RLConfig {
  /** Actor learning rate (α_a) - typically smaller than critic */
  actorLearningRate: number;
  /** Critic learning rate (α_c) */
  criticLearningRate: number;
  /** Entropy coefficient (β) for exploration bonus */
  entropyCoefficient: number;
  /** Temperature for softmax action selection */
  temperature: number;
  /** Whether to use advantage normalization */
  normalizeAdvantage: boolean;
  /** Target network update frequency (for stability) */
  targetUpdateFrequency: number;
}

/**
 * Policy entry storing action probabilities
 */
interface PolicyEntry {
  action: string;
  probability: number;
  logProbability: number;
  updateCount: number;
  lastUpdated: number;
}

/**
 * State value entry for critic
 */
interface StateValueEntry {
  state: string;
  value: number;
  updateCount: number;
  lastUpdated: number;
}

/**
 * ActorCriticLearner - Advantage Actor-Critic implementation
 *
 * Combines policy gradient (actor) with value function approximation (critic)
 * for more stable and efficient learning than pure Q-learning.
 *
 * Usage:
 * ```typescript
 * const ac = new ActorCriticLearner({
 *   learningRate: 0.1,
 *   actorLearningRate: 0.01,
 *   criticLearningRate: 0.1,
 *   discountFactor: 0.95,
 *   explorationRate: 0.3,
 *   explorationDecay: 0.995,
 *   minExplorationRate: 0.01,
 *   entropyCoefficient: 0.01,
 *   temperature: 1.0,
 *   normalizeAdvantage: true,
 *   targetUpdateFrequency: 100,
 *   useExperienceReplay: true,
 *   replayBufferSize: 10000,
 *   batchSize: 32
 * });
 *
 * const action = ac.selectAction(state, availableActions);
 * ac.update(experience);
 * ```
 */
export class ActorCriticLearner extends AbstractRLLearner {
  private actorConfig: ActorCriticConfig;
  private policyTable: Map<string, Map<string, PolicyEntry>>; // state -> (action -> policy)
  private valueTable: Map<string, StateValueEntry>; // state -> value
  private targetValueTable: Map<string, StateValueEntry>; // target network values
  private updatesSinceTargetSync: number;
  private advantageHistory: number[]; // for normalization
  private readonly defaultExploration: number;

  constructor(config: ActorCriticConfig) {
    super(config);
    this.actorConfig = config;
    this.policyTable = new Map();
    this.valueTable = new Map();
    this.targetValueTable = new Map();
    this.updatesSinceTargetSync = 0;
    this.advantageHistory = [];
    this.defaultExploration = config.explorationRate;

    this.logger.info('ActorCriticLearner initialized', {
      actorLR: config.actorLearningRate,
      criticLR: config.criticLearningRate,
      entropy: config.entropyCoefficient,
      temperature: config.temperature
    });
  }

  /**
   * Select action using softmax policy with exploration
   * π(a|s) = exp(Q(s,a)/τ) / Σ_a' exp(Q(s,a')/τ)
   */
  override selectAction(state: TaskState, availableActions: AgentAction[]): AgentAction {
    if (availableActions.length === 0) {
      throw new Error('No available actions to select from');
    }

    // With probability ε, use random action (exploration fallback)
    if (Math.random() < this.config.explorationRate) {
      const randomIndex = Math.floor(Math.random() * availableActions.length);
      return availableActions[randomIndex];
    }

    // Use softmax policy
    return this.sampleFromPolicy(state, availableActions);
  }

  /**
   * Sample action from softmax policy distribution
   */
  private sampleFromPolicy(state: TaskState, availableActions: AgentAction[]): AgentAction {
    const stateKey = this.encodeState(state);
    const probabilities = this.getActionProbabilities(stateKey, availableActions);

    // Sample from categorical distribution
    const random = Math.random();
    let cumulative = 0;

    for (let i = 0; i < availableActions.length; i++) {
      cumulative += probabilities[i];
      if (random <= cumulative) {
        return availableActions[i];
      }
    }

    // Fallback (shouldn't reach here due to normalization)
    return availableActions[availableActions.length - 1];
  }

  /**
   * Get softmax action probabilities
   * π(a|s) = exp(preference(s,a)/τ) / Σ_a' exp(preference(s,a')/τ)
   */
  private getActionProbabilities(stateKey: string, availableActions: AgentAction[]): number[] {
    const temperature = this.actorConfig.temperature;
    const preferences: number[] = [];

    // Get preferences (Q-values or policy table values)
    for (const action of availableActions) {
      const actionKey = this.encodeAction(action);
      const preference = this.getPreference(stateKey, actionKey);
      preferences.push(preference / temperature);
    }

    // Softmax with numerical stability
    const maxPref = Math.max(...preferences);
    const expPrefs = preferences.map(p => Math.exp(p - maxPref));
    const sumExp = expPrefs.reduce((sum, e) => sum + e, 0);

    return expPrefs.map(e => e / sumExp);
  }

  /**
   * Get preference for state-action pair from policy table
   */
  private getPreference(stateKey: string, actionKey: string): number {
    const statePolicy = this.policyTable.get(stateKey);
    if (!statePolicy) {
      return 0; // uniform preference initially
    }

    const entry = statePolicy.get(actionKey);
    return entry ? entry.probability : 0;
  }

  /**
   * Update actor and critic using temporal difference
   *
   * TD Error (advantage): δ = r + γV(s') - V(s)
   * Critic update: V(s) += α_c * δ
   * Actor update: preference(s,a) += α_a * δ * (1 - π(a|s))
   */
  override update(experience: TaskExperience, nextAction?: AgentAction): void {
    this.stepCount++;

    const { state, action, reward, nextState, done } = this.extractExperience(experience);
    const stateKey = this.encodeState(state);
    const actionKey = this.encodeAction(action);

    // Get current and next state values from critic
    const currentV = this.getStateValue(state);
    const nextV = done ? 0 : this.getTargetStateValue(nextState);

    // Calculate TD error (advantage)
    let advantage = reward + this.config.discountFactor * nextV - currentV;

    // Normalize advantage if enabled
    if (this.actorConfig.normalizeAdvantage) {
      advantage = this.normalizeAdvantage(advantage);
    }

    // Update critic (value function)
    this.updateCritic(stateKey, currentV, advantage);

    // Update actor (policy)
    this.updateActor(stateKey, actionKey, advantage);

    // Store in replay buffer if enabled
    if (this.replayBuffer) {
      this.replayBuffer.add(experience);
    }

    // Sync target network periodically
    this.updatesSinceTargetSync++;
    if (this.updatesSinceTargetSync >= this.actorConfig.targetUpdateFrequency) {
      this.syncTargetNetwork();
      this.updatesSinceTargetSync = 0;
    }

    this.logger.debug('Actor-Critic update', {
      state: stateKey,
      action: actionKey,
      reward,
      advantage,
      valueUpdate: currentV + this.actorConfig.criticLearningRate * advantage
    });
  }

  /**
   * Update critic (value function)
   * V(s) += α_c * δ
   */
  private updateCritic(stateKey: string, currentV: number, advantage: number): void {
    const newValue = currentV + this.actorConfig.criticLearningRate * advantage;

    const existingEntry = this.valueTable.get(stateKey);
    this.valueTable.set(stateKey, {
      state: stateKey,
      value: newValue,
      updateCount: (existingEntry?.updateCount ?? 0) + 1,
      lastUpdated: Date.now()
    });
  }

  /**
   * Update actor (policy)
   * For softmax policy: preference(s,a) += α_a * δ * (1 - π(a|s))
   * This increases preference for actions with positive advantage
   */
  private updateActor(stateKey: string, actionKey: string, advantage: number): void {
    if (!this.policyTable.has(stateKey)) {
      this.policyTable.set(stateKey, new Map());
    }
    const statePolicy = this.policyTable.get(stateKey)!;

    // Get current preference and probability
    const currentEntry = statePolicy.get(actionKey);
    const currentPref = currentEntry?.probability ?? 0;

    // Approximate gradient: increase preference proportional to advantage
    // Also add entropy bonus to encourage exploration
    const entropyBonus = this.calculateEntropyBonus(stateKey);
    const newPref = currentPref + this.actorConfig.actorLearningRate * (advantage + entropyBonus);

    statePolicy.set(actionKey, {
      action: actionKey,
      probability: newPref,
      logProbability: Math.log(Math.max(0.001, this.softmaxProb(stateKey, actionKey))),
      updateCount: (currentEntry?.updateCount ?? 0) + 1,
      lastUpdated: Date.now()
    });

    // Also update Q-table for getBestAction compatibility
    this.setQValue(stateKey, actionKey, newPref);
  }

  /**
   * Calculate entropy bonus for a state
   * H(π(·|s)) = -Σ_a π(a|s) log(π(a|s))
   */
  private calculateEntropyBonus(stateKey: string): number {
    const statePolicy = this.policyTable.get(stateKey);
    if (!statePolicy || statePolicy.size === 0) {
      return 0;
    }

    // Calculate entropy over stored actions
    const prefs = Array.from(statePolicy.values()).map(e => e.probability);
    const maxPref = Math.max(...prefs);
    const expPrefs = prefs.map(p => Math.exp((p - maxPref) / this.actorConfig.temperature));
    const sumExp = expPrefs.reduce((sum, e) => sum + e, 0);
    const probs = expPrefs.map(e => e / sumExp);

    let entropy = 0;
    for (const p of probs) {
      if (p > 0) {
        entropy -= p * Math.log(p);
      }
    }

    return this.actorConfig.entropyCoefficient * entropy;
  }

  /**
   * Get softmax probability for a specific action
   */
  private softmaxProb(stateKey: string, actionKey: string): number {
    const statePolicy = this.policyTable.get(stateKey);
    if (!statePolicy || statePolicy.size === 0) {
      return 1.0 / Math.max(1, statePolicy?.size ?? 1);
    }

    const prefs = Array.from(statePolicy.entries());
    const temp = this.actorConfig.temperature;

    const maxPref = Math.max(...prefs.map(([, e]) => e.probability));
    let sumExp = 0;
    let targetExp = 0;

    for (const [key, entry] of prefs) {
      const exp = Math.exp((entry.probability - maxPref) / temp);
      sumExp += exp;
      if (key === actionKey) {
        targetExp = exp;
      }
    }

    return targetExp / sumExp;
  }

  /**
   * Normalize advantage using running statistics
   */
  private normalizeAdvantage(advantage: number): number {
    this.advantageHistory.push(advantage);

    // Keep limited history
    if (this.advantageHistory.length > 1000) {
      this.advantageHistory.shift();
    }

    if (this.advantageHistory.length < 10) {
      return advantage;
    }

    const mean = this.advantageHistory.reduce((s, a) => s + a, 0) / this.advantageHistory.length;
    const variance = this.advantageHistory.reduce((s, a) => s + (a - mean) ** 2, 0) / this.advantageHistory.length;
    const std = Math.sqrt(variance) + 1e-8;

    return (advantage - mean) / std;
  }

  /**
   * Get state value from value table
   */
  override getStateValue(state: TaskState): number {
    const stateKey = this.encodeState(state);
    const entry = this.valueTable.get(stateKey);
    return entry?.value ?? 0;
  }

  /**
   * Get state value from target network (for stability)
   */
  private getTargetStateValue(state: TaskState): number {
    const stateKey = this.encodeState(state);
    const entry = this.targetValueTable.get(stateKey);
    return entry?.value ?? this.getStateValue(state);
  }

  /**
   * Sync target network with main network
   */
  private syncTargetNetwork(): void {
    this.targetValueTable.clear();
    for (const [key, value] of this.valueTable.entries()) {
      this.targetValueTable.set(key, { ...value });
    }
    this.logger.debug('Target network synchronized');
  }

  /**
   * Extract experience components
   */
  private extractExperience(experience: TaskExperience): {
    state: TaskState;
    action: AgentAction;
    reward: number;
    nextState: TaskState;
    done: boolean;
  } {
    return {
      state: experience.state,
      action: experience.action,
      reward: experience.reward,
      nextState: experience.nextState,
      done: experience.done ?? false
    };
  }

  /**
   * Get default exploration rate for reset
   */
  protected getDefaultExplorationRate(): number {
    return this.defaultExploration;
  }

  /**
   * Get actor-critic specific statistics
   */
  getActorCriticStatistics(): {
    valueTableSize: number;
    policyTableSize: number;
    avgStateValue: number;
    avgEntropy: number;
    advantageMean: number;
    advantageStd: number;
  } {
    // Calculate average state value
    let totalValue = 0;
    for (const entry of this.valueTable.values()) {
      totalValue += entry.value;
    }
    const avgStateValue = this.valueTable.size > 0 ? totalValue / this.valueTable.size : 0;

    // Calculate policy table size
    let policySize = 0;
    for (const statePolicy of this.policyTable.values()) {
      policySize += statePolicy.size;
    }

    // Calculate average entropy
    let totalEntropy = 0;
    let entropyCount = 0;
    for (const stateKey of this.policyTable.keys()) {
      const entropy = this.calculateEntropyBonus(stateKey) / this.actorConfig.entropyCoefficient;
      totalEntropy += entropy;
      entropyCount++;
    }
    const avgEntropy = entropyCount > 0 ? totalEntropy / entropyCount : 0;

    // Calculate advantage statistics
    const advMean = this.advantageHistory.length > 0
      ? this.advantageHistory.reduce((s, a) => s + a, 0) / this.advantageHistory.length
      : 0;
    const advVariance = this.advantageHistory.length > 0
      ? this.advantageHistory.reduce((s, a) => s + (a - advMean) ** 2, 0) / this.advantageHistory.length
      : 0;

    return {
      valueTableSize: this.valueTable.size,
      policyTableSize: policySize,
      avgStateValue,
      avgEntropy,
      advantageMean: advMean,
      advantageStd: Math.sqrt(advVariance)
    };
  }

  /**
   * Reset actor-critic specific state
   */
  override reset(): void {
    super.reset();
    this.policyTable.clear();
    this.valueTable.clear();
    this.targetValueTable.clear();
    this.advantageHistory = [];
    this.updatesSinceTargetSync = 0;
    this.logger.info('ActorCriticLearner reset');
  }

  /**
   * Export complete actor-critic state
   */
  exportActorCritic(): {
    base: ReturnType<AbstractRLLearner['export']>;
    valueTable: Record<string, StateValueEntry>;
    policyTable: Record<string, Record<string, PolicyEntry>>;
    actorConfig: ActorCriticConfig;
  } {
    const serializedPolicy: Record<string, Record<string, PolicyEntry>> = {};
    for (const [state, actions] of this.policyTable.entries()) {
      serializedPolicy[state] = {};
      for (const [action, entry] of actions.entries()) {
        serializedPolicy[state][action] = entry;
      }
    }

    const serializedValue: Record<string, StateValueEntry> = {};
    for (const [state, entry] of this.valueTable.entries()) {
      serializedValue[state] = entry;
    }

    return {
      base: this.export(),
      valueTable: serializedValue,
      policyTable: serializedPolicy,
      actorConfig: { ...this.actorConfig }
    };
  }

  /**
   * Import complete actor-critic state
   */
  importActorCritic(state: ReturnType<typeof this.exportActorCritic>): void {
    this.import(state.base);

    this.valueTable.clear();
    for (const [stateKey, entry] of Object.entries(state.valueTable)) {
      this.valueTable.set(stateKey, entry);
    }

    this.policyTable.clear();
    for (const [stateKey, actions] of Object.entries(state.policyTable)) {
      const actionMap = new Map<string, PolicyEntry>();
      for (const [actionKey, entry] of Object.entries(actions)) {
        actionMap.set(actionKey, entry);
      }
      this.policyTable.set(stateKey, actionMap);
    }

    this.actorConfig = { ...state.actorConfig };
    this.syncTargetNetwork();

    this.logger.info('Imported Actor-Critic state', {
      valueTableSize: this.valueTable.size,
      policyTableSize: this.policyTable.size
    });
  }
}

/**
 * Create default Actor-Critic configuration
 */
export function createDefaultActorCriticConfig(): ActorCriticConfig {
  return {
    learningRate: 0.1,
    actorLearningRate: 0.01,
    criticLearningRate: 0.1,
    discountFactor: 0.95,
    explorationRate: 0.3,
    explorationDecay: 0.995,
    minExplorationRate: 0.01,
    entropyCoefficient: 0.01,
    temperature: 1.0,
    normalizeAdvantage: true,
    targetUpdateFrequency: 100,
    useExperienceReplay: true,
    replayBufferSize: 10000,
    batchSize: 32
  };
}
