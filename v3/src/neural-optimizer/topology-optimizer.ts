/**
 * Agentic QE v3 - Neural Topology Optimizer
 * ADR-034: RL-based swarm topology optimization
 *
 * Implements reinforcement learning-based topology optimization:
 * - Q-learning with value network for state evaluation
 * - Experience replay for stable training
 * - Epsilon-greedy exploration
 * - Multi-objective reward (min-cut, efficiency, load balance)
 */

import type {
  SwarmTopology,
  TopologyOptimizerConfig,
  TopologyAction,
  TopologyState,
  Experience,
  OptimizationResult,
  OptimizationStats,
  ExportedModel,
  ActionType,
} from './types';
import { DEFAULT_OPTIMIZER_CONFIG, actionToIndex, indexToActionType, ACTION_TYPES } from './types';
import { ValueNetwork } from './value-network';
import { PrioritizedReplayBuffer } from './replay-buffer';

// ============================================================================
// Neural Topology Optimizer
// ============================================================================

/**
 * Neural Topology Optimizer using reinforcement learning
 *
 * Uses a value network to estimate state values and learns to select
 * topology modifications that improve overall swarm performance.
 */
export class NeuralTopologyOptimizer {
  /** Primary value network */
  private valueNetwork: ValueNetwork;

  /** Target network for stable learning */
  private targetNetwork: ValueNetwork;

  /** Experience replay buffer */
  private replayBuffer: PrioritizedReplayBuffer;

  /** Optimizer configuration */
  private config: TopologyOptimizerConfig;

  /** Reference to topology being optimized */
  private topology: SwarmTopology;

  /** Previous state for learning */
  private prevState: number[] | null = null;

  /** Previous min-cut estimate */
  private prevMinCut: number = 0;

  /** Current exploration rate */
  private epsilon: number;

  /** Simulation time */
  private time: number = 0;

  /** Total optimization steps */
  private totalSteps: number = 0;

  /** Episode count */
  private episodes: number = 0;

  /** Cumulative reward */
  private cumulativeReward: number = 0;

  /** Action counts */
  private actionCounts: Record<ActionType, number>;

  /** Min-cut history */
  private minCutHistory: number[] = [];

  /** Reward history */
  private rewardHistory: number[] = [];

  /** Last action taken (for feedback) */
  private lastAction: TopologyAction | null = null;

  constructor(
    topology: SwarmTopology,
    config: Partial<TopologyOptimizerConfig> = {}
  ) {
    this.topology = topology;
    this.config = { ...DEFAULT_OPTIMIZER_CONFIG, ...config };
    this.epsilon = this.config.epsilon;

    // Initialize value networks
    this.valueNetwork = new ValueNetwork(
      this.config.inputSize,
      this.config.hiddenSize
    );
    this.targetNetwork = new ValueNetwork(
      this.config.inputSize,
      this.config.hiddenSize
    );
    this.targetNetwork.copyFrom(this.valueNetwork);

    // Initialize replay buffer
    this.replayBuffer = new PrioritizedReplayBuffer(
      this.config.replayBufferSize,
      { alpha: 0.6, beta: 0.4 }
    );

    // Initialize action counts
    this.actionCounts = {} as Record<ActionType, number>;
    for (const actionType of ACTION_TYPES) {
      this.actionCounts[actionType] = 0;
    }

    // Initialize state
    this.prevState = this.extractFeatures();
    this.prevMinCut = this.estimateMinCut();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Run one optimization step
   */
  optimizeStep(): OptimizationResult {
    // 1. Encode current state
    const state = this.extractFeatures();
    const valueBefore = this.valueNetwork.estimate(state);

    // 2. Select action using epsilon-greedy
    const action = this.selectAction(state);
    this.lastAction = action;

    // 3. Execute action
    const oldMinCut = this.estimateMinCut();
    this.applyAction(action);
    const newMinCut = this.estimateMinCut();

    // 4. Calculate multi-objective reward
    const reward = this.calculateReward(oldMinCut, newMinCut);

    // 5. Get new state
    const nextState = this.extractFeatures();
    const valueAfter = this.valueNetwork.estimate(nextState);

    // 6. Calculate TD error
    const targetValue = reward + this.config.gamma * this.targetNetwork.estimate(nextState);
    const tdError = targetValue - valueBefore;

    // 7. Update value network
    this.valueNetwork.update(state, tdError, this.config.learningRate);

    // 8. Store experience
    if (this.prevState !== null) {
      const experience: Experience = {
        state: this.prevState,
        actionIdx: actionToIndex(action),
        reward,
        nextState,
        done: false,
        tdError: Math.abs(tdError),
        timestamp: Date.now(),
      };
      this.replayBuffer.push(experience);
    }

    // 9. Train from replay buffer
    if (this.replayBuffer.length >= this.config.minExperiencesForTraining) {
      this.trainFromReplay();
    }

    // 10. Update target network periodically
    this.totalSteps++;
    if (this.totalSteps % this.config.targetUpdateFrequency === 0) {
      this.targetNetwork.softUpdate(this.valueNetwork, 0.01);
    }

    // 11. Decay exploration rate
    this.epsilon = Math.max(
      this.config.minEpsilon,
      this.epsilon * this.config.epsilonDecay
    );

    // 12. Update tracking
    this.prevState = nextState;
    this.prevMinCut = newMinCut;
    this.time += this.config.dt;
    this.actionCounts[action.type]++;
    this.cumulativeReward += reward;
    this.minCutHistory.push(newMinCut);
    this.rewardHistory.push(reward);

    // Limit history size
    if (this.minCutHistory.length > 1000) {
      this.minCutHistory.shift();
      this.rewardHistory.shift();
    }

    // Calculate metrics
    const loadStats = this.getLoadStats();

    return {
      action,
      reward,
      newMinCut,
      communicationEfficiency: this.measureCommunicationEfficiency(),
      loadBalance: 1 - loadStats.variance,
      tdError,
      epsilon: this.epsilon,
      valueBefore,
      valueAfter,
    };
  }

  /**
   * Run multiple optimization steps
   */
  optimize(steps: number): OptimizationResult[] {
    const results: OptimizationResult[] = [];
    for (let i = 0; i < steps; i++) {
      results.push(this.optimizeStep());
    }
    this.episodes++;
    return results;
  }

  /**
   * Provide external feedback (e.g., from task completion)
   */
  provideFeedback(reward: number): void {
    if (this.prevState === null || this.lastAction === null) return;

    const state = this.extractFeatures();
    const experience: Experience = {
      state: this.prevState,
      actionIdx: actionToIndex(this.lastAction),
      reward,
      nextState: state,
      done: false,
      tdError: Math.abs(reward),
      timestamp: Date.now(),
    };
    this.replayBuffer.push(experience);

    // Immediate learning from feedback
    const currentValue = this.valueNetwork.estimate(this.prevState);
    const nextValue = this.targetNetwork.estimate(state);
    const tdError = reward + this.config.gamma * nextValue - currentValue;
    this.valueNetwork.update(this.prevState, tdError, this.config.learningRate);
  }

  /**
   * Get skip regions (low activity areas)
   */
  getSkipRegions(): string[] {
    return this.topology.agents
      .filter((agent) => {
        const degree = this.topology.connections.filter(
          (c) => c.from === agent.id || c.to === agent.id
        ).length;
        return degree < 2;
      })
      .map((agent) => agent.id);
  }

  /**
   * Get optimization statistics
   */
  getStats(): OptimizationStats {
    const avgReward =
      this.totalSteps > 0 ? this.cumulativeReward / this.totalSteps : 0;
    const avgTdError =
      this.rewardHistory.length > 0
        ? this.rewardHistory.reduce((sum, r) => sum + Math.abs(r), 0) /
          this.rewardHistory.length
        : 0;

    return {
      totalSteps: this.totalSteps,
      episodes: this.episodes,
      cumulativeReward: this.cumulativeReward,
      avgReward,
      avgTdError,
      actionCounts: { ...this.actionCounts },
      minCutHistory: [...this.minCutHistory],
      rewardHistory: [...this.rewardHistory],
      currentEpsilon: this.epsilon,
    };
  }

  /**
   * Reset optimizer state
   */
  reset(): void {
    this.prevState = this.extractFeatures();
    this.prevMinCut = this.estimateMinCut();
    this.time = 0;
    this.epsilon = this.config.epsilon;
    this.lastAction = null;
  }

  /**
   * Hard reset (clear learning)
   */
  hardReset(): void {
    this.reset();
    this.replayBuffer.clear();
    this.totalSteps = 0;
    this.episodes = 0;
    this.cumulativeReward = 0;
    this.minCutHistory = [];
    this.rewardHistory = [];
    for (const actionType of ACTION_TYPES) {
      this.actionCounts[actionType] = 0;
    }

    // Reinitialize networks
    this.valueNetwork = new ValueNetwork(
      this.config.inputSize,
      this.config.hiddenSize
    );
    this.targetNetwork = new ValueNetwork(
      this.config.inputSize,
      this.config.hiddenSize
    );
    this.targetNetwork.copyFrom(this.valueNetwork);
  }

  /**
   * Export learned model
   */
  exportModel(): ExportedModel {
    return {
      type: 'neural-topology-optimizer',
      version: '1.0.0',
      config: { ...this.config },
      valueNetwork: this.valueNetwork.export(),
      targetNetwork: this.targetNetwork.export(),
      stats: this.getStats(),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import learned model
   */
  importModel(model: ExportedModel): void {
    if (model.type !== 'neural-topology-optimizer') {
      throw new Error(`Invalid model type: ${model.type}`);
    }

    // Import config
    this.config = { ...DEFAULT_OPTIMIZER_CONFIG, ...model.config };
    this.epsilon = model.stats.currentEpsilon;

    // Import networks
    this.valueNetwork = new ValueNetwork(
      this.config.inputSize,
      this.config.hiddenSize
    );
    this.valueNetwork.import(model.valueNetwork);

    if (model.targetNetwork) {
      this.targetNetwork = new ValueNetwork(
        this.config.inputSize,
        this.config.hiddenSize
      );
      this.targetNetwork.import(model.targetNetwork);
    } else {
      this.targetNetwork.copyFrom(this.valueNetwork);
    }

    // Import stats
    this.totalSteps = model.stats.totalSteps;
    this.episodes = model.stats.episodes;
    this.cumulativeReward = model.stats.cumulativeReward;
    this.actionCounts = { ...model.stats.actionCounts };
    this.minCutHistory = [...model.stats.minCutHistory];
    this.rewardHistory = [...model.stats.rewardHistory];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract features from topology for state representation
   */
  private extractFeatures(): number[] {
    const n = this.topology.agents.length;
    const m = this.topology.connections.length;
    const loadStats = this.getLoadStats();

    const state: TopologyState = {
      agentCount: n,
      connectionCount: m,
      density: this.getDensity(),
      avgDegree: this.getAverageDegree(),
      minDegree: this.getMinDegree(),
      avgWeight: this.getAverageWeight(),
      weightVariance: this.getWeightVariance(),
      avgLoad: loadStats.avg,
      loadVariance: loadStats.variance,
      avgLatency: this.getAverageLatency(),
      idleAgents: loadStats.idle,
      overloadedAgents: loadStats.overloaded,
      clusteringCoefficient: this.getClusteringCoefficient(),
      time: this.time,
      extra: [],
    };

    // Convert to feature vector (normalized)
    const features = new Array(this.config.inputSize).fill(0);

    if (this.config.inputSize > 0) features[0] = n / 100;
    if (this.config.inputSize > 1) features[1] = m / 500;
    if (this.config.inputSize > 2) features[2] = state.density;
    if (this.config.inputSize > 3) features[3] = state.avgDegree / 10;
    if (this.config.inputSize > 4) features[4] = state.minDegree / 10;
    if (this.config.inputSize > 5) features[5] = state.avgWeight / 5;
    if (this.config.inputSize > 6) features[6] = Math.min(1, state.weightVariance);
    if (this.config.inputSize > 7) features[7] = state.avgLoad;
    if (this.config.inputSize > 8) features[8] = Math.min(1, state.loadVariance);
    if (this.config.inputSize > 9) features[9] = state.avgLatency / 100;
    if (this.config.inputSize > 10) features[10] = state.idleAgents / Math.max(1, n);
    if (this.config.inputSize > 11) features[11] = state.overloadedAgents / Math.max(1, n);
    if (this.config.inputSize > 12) features[12] = state.clusteringCoefficient;
    if (this.config.inputSize > 13) features[13] = Math.sin(state.time * 0.1);
    if (this.config.inputSize > 14) features[14] = Math.cos(state.time * 0.1);
    if (this.config.inputSize > 15) features[15] = this.prevMinCut / Math.max(1, m);

    return features;
  }

  /**
   * Select action using epsilon-greedy policy
   */
  private selectAction(state: number[]): TopologyAction {
    // Exploration: random action
    if (Math.random() < this.epsilon) {
      return this.randomAction();
    }

    // Exploitation: select action with highest estimated value
    let bestAction: TopologyAction = { type: 'no_op' };
    let bestValue = -Infinity;

    for (let i = 0; i < this.config.numActions; i++) {
      const action = this.indexToAction(i);
      const hypotheticalState = this.simulateAction(state, action);
      const value = this.valueNetwork.estimate(hypotheticalState);

      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * Convert index to action
   */
  private indexToAction(idx: number): TopologyAction {
    const agents = this.topology.agents;
    if (agents.length < 2) return { type: 'no_op' };

    const actionType = indexToActionType(idx);
    const from = agents[idx % agents.length].id;
    const to = agents[(idx + 1) % agents.length].id;

    switch (actionType) {
      case 'add_connection':
        if (!this.hasConnection(from, to)) {
          return { type: 'add_connection', from, to, weight: 1.0 };
        }
        return { type: 'no_op' };

      case 'remove_connection':
        if (this.hasConnection(from, to)) {
          return { type: 'remove_connection', from, to };
        }
        return { type: 'no_op' };

      case 'strengthen_connection':
        return { type: 'strengthen_connection', from, to, delta: 0.1 };

      case 'weaken_connection':
        return { type: 'weaken_connection', from, to, delta: 0.1 };

      default:
        return { type: 'no_op' };
    }
  }

  /**
   * Generate random action
   */
  private randomAction(): TopologyAction {
    const agents = this.topology.agents;
    if (agents.length < 2) return { type: 'no_op' };

    const actionTypeIdx = Math.floor(Math.random() * ACTION_TYPES.length);
    const actionType = ACTION_TYPES[actionTypeIdx];

    const fromIdx = Math.floor(Math.random() * agents.length);
    let toIdx = Math.floor(Math.random() * agents.length);
    while (toIdx === fromIdx && agents.length > 1) {
      toIdx = Math.floor(Math.random() * agents.length);
    }

    const from = agents[fromIdx].id;
    const to = agents[toIdx].id;

    switch (actionType) {
      case 'add_connection':
        if (!this.hasConnection(from, to)) {
          return { type: 'add_connection', from, to, weight: 1.0 };
        }
        return { type: 'no_op' };

      case 'remove_connection':
        if (this.hasConnection(from, to)) {
          return { type: 'remove_connection', from, to };
        }
        return { type: 'no_op' };

      case 'strengthen_connection':
        return { type: 'strengthen_connection', from, to, delta: 0.1 };

      case 'weaken_connection':
        return { type: 'weaken_connection', from, to, delta: 0.1 };

      default:
        return { type: 'no_op' };
    }
  }

  /**
   * Simulate action effect on state (for lookahead)
   */
  private simulateAction(state: number[], action: TopologyAction): number[] {
    const newState = [...state];

    switch (action.type) {
      case 'add_connection':
        if (this.config.inputSize > 1) newState[1] += 0.002; // connection count
        if (this.config.inputSize > 2) newState[2] += 0.01; // density
        if (this.config.inputSize > 3) newState[3] += 0.1; // avg degree
        break;

      case 'remove_connection':
        if (this.config.inputSize > 1) newState[1] -= 0.002;
        if (this.config.inputSize > 2) newState[2] -= 0.01;
        if (this.config.inputSize > 3) newState[3] -= 0.1;
        break;

      case 'strengthen_connection':
        if (this.config.inputSize > 5) newState[5] += 0.02; // avg weight
        break;

      case 'weaken_connection':
        if (this.config.inputSize > 5) newState[5] -= 0.02;
        break;
    }

    return newState;
  }

  /**
   * Apply action to topology
   */
  private applyAction(action: TopologyAction): void {
    switch (action.type) {
      case 'add_connection':
        this.topology.addConnection(action.from, action.to, action.weight || 1.0);
        break;

      case 'remove_connection':
        this.topology.removeConnection(action.from, action.to);
        break;

      case 'strengthen_connection':
        this.topology.updateConnectionWeight(action.from, action.to, action.delta);
        break;

      case 'weaken_connection':
        this.topology.updateConnectionWeight(action.from, action.to, -action.delta);
        break;

      case 'no_op':
        // Do nothing
        break;
    }
  }

  /**
   * Calculate multi-objective reward
   */
  private calculateReward(oldMinCut: number, newMinCut: number): number {
    // 1. Min-cut improvement (primary objective)
    const minCutReward =
      oldMinCut > 0 ? (newMinCut - oldMinCut) / oldMinCut : 0;

    // 2. Communication efficiency
    const efficiency = this.measureCommunicationEfficiency();

    // 3. Load balance
    const loadStats = this.getLoadStats();
    const loadBalance = 1 - loadStats.variance;

    // 4. Latency penalty
    const avgLatency = this.getAverageLatency();
    const latencyPenalty = avgLatency > 0 ? -avgLatency / 100 : 0;

    // Combine with weights
    const reward =
      minCutReward +
      this.config.efficiencyWeight * efficiency +
      this.config.loadBalanceWeight * loadBalance +
      this.config.latencyWeight * latencyPenalty;

    return Math.max(-1, Math.min(1, reward));
  }

  /**
   * Train from replay buffer
   */
  private trainFromReplay(): void {
    const { experiences, weights, indices } =
      this.replayBuffer.sampleWithWeights(this.config.batchSize);

    const newPriorities: number[] = [];

    for (let i = 0; i < experiences.length; i++) {
      const exp = experiences[i];
      const weight = weights[i];

      // Calculate TD error
      const currentValue = this.valueNetwork.estimate(exp.state);
      const nextValue = exp.done
        ? 0
        : this.targetNetwork.estimate(exp.nextState);
      const targetValue = exp.reward + this.config.gamma * nextValue;
      const tdError = targetValue - currentValue;

      // Weighted update
      this.valueNetwork.update(
        exp.state,
        tdError * weight,
        this.config.learningRate
      );

      newPriorities.push(Math.abs(tdError));
    }

    // Update priorities
    this.replayBuffer.updatePriorities(indices, newPriorities);
  }

  // ============================================================================
  // Topology Metric Helpers
  // ============================================================================

  private estimateMinCut(): number {
    if (this.topology.agents.length === 0) return 0;
    return this.getMinDegree();
  }

  private hasConnection(from: string, to: string): boolean {
    return this.topology.connections.some(
      (c) =>
        (c.from === from && c.to === to) || (c.from === to && c.to === from)
    );
  }

  private getDensity(): number {
    const n = this.topology.agents.length;
    if (n < 2) return 0;
    const maxConnections = (n * (n - 1)) / 2;
    return this.topology.connections.length / maxConnections;
  }

  private getAverageDegree(): number {
    const n = this.topology.agents.length;
    if (n === 0) return 0;

    const totalDegree = this.topology.agents.reduce((sum, agent) => {
      return (
        sum +
        this.topology.connections.filter(
          (c) => c.from === agent.id || c.to === agent.id
        ).length
      );
    }, 0);

    return totalDegree / n;
  }

  private getMinDegree(): number {
    if (this.topology.agents.length === 0) return 0;

    let minDegree = Infinity;
    for (const agent of this.topology.agents) {
      const degree = this.topology.connections.filter(
        (c) => c.from === agent.id || c.to === agent.id
      ).length;
      minDegree = Math.min(minDegree, degree);
    }

    return minDegree === Infinity ? 0 : minDegree;
  }

  private getAverageWeight(): number {
    if (this.topology.connections.length === 0) return 0;
    const total = this.topology.connections.reduce((sum, c) => sum + c.weight, 0);
    return total / this.topology.connections.length;
  }

  private getWeightVariance(): number {
    if (this.topology.connections.length === 0) return 0;

    const avg = this.getAverageWeight();
    const squaredDiffs = this.topology.connections.map(
      (c) => (c.weight - avg) ** 2
    );
    return squaredDiffs.reduce((sum, d) => sum + d, 0) / this.topology.connections.length;
  }

  private getAverageLatency(): number {
    const connectionsWithLatency = this.topology.connections.filter(
      (c) => c.latencyMs !== undefined
    );
    if (connectionsWithLatency.length === 0) return 0;

    const total = connectionsWithLatency.reduce(
      (sum, c) => sum + (c.latencyMs || 0),
      0
    );
    return total / connectionsWithLatency.length;
  }

  private measureCommunicationEfficiency(): number {
    const n = this.topology.agents.length;
    if (n < 2) return 0;

    const maxConnections = (n * (n - 1)) / 2;
    return this.topology.connections.length / maxConnections;
  }

  private getClusteringCoefficient(): number {
    if (this.topology.agents.length < 3) return 0;

    let totalCoeff = 0;
    for (const agent of this.topology.agents) {
      const neighbors = this.getNeighbors(agent.id);
      const k = neighbors.length;
      if (k < 2) continue;

      let triangles = 0;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          if (this.hasConnection(neighbors[i], neighbors[j])) {
            triangles++;
          }
        }
      }

      const possibleTriangles = (k * (k - 1)) / 2;
      totalCoeff += triangles / possibleTriangles;
    }

    return totalCoeff / this.topology.agents.length;
  }

  private getNeighbors(agentId: string): string[] {
    const neighbors: string[] = [];
    for (const conn of this.topology.connections) {
      if (conn.from === agentId) neighbors.push(conn.to);
      else if (conn.to === agentId) neighbors.push(conn.from);
    }
    return neighbors;
  }

  private getLoadStats(): {
    avg: number;
    variance: number;
    idle: number;
    overloaded: number;
  } {
    if (this.topology.agents.length === 0) {
      return { avg: 0, variance: 0, idle: 0, overloaded: 0 };
    }

    const loads = this.topology.agents.map(
      (a) => a.metrics?.currentLoad ?? 0
    );
    const avg = loads.reduce((sum, l) => sum + l, 0) / loads.length;
    const variance =
      loads.reduce((sum, l) => sum + (l - avg) ** 2, 0) / loads.length;

    const idle = this.topology.agents.filter((a) => a.status === 'idle').length;
    const overloaded = this.topology.agents.filter(
      (a) => (a.metrics?.currentLoad ?? 0) > 0.8
    ).length;

    return { avg, variance, idle, overloaded };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a neural topology optimizer
 */
export function createNeuralTopologyOptimizer(
  topology: SwarmTopology,
  config?: Partial<TopologyOptimizerConfig>
): NeuralTopologyOptimizer {
  return new NeuralTopologyOptimizer(topology, config);
}
