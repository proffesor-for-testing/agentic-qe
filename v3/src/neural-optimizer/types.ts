/**
 * Agentic QE v3 - Neural Topology Optimizer Types
 * ADR-034: RL-based swarm topology optimization
 *
 * Defines types for neural network-based topology optimization using
 * reinforcement learning with value networks and experience replay.
 */

// ============================================================================
// Topology Types
// ============================================================================

/**
 * Agent in the swarm topology
 */
export interface TopologyAgent {
  /** Unique agent identifier */
  readonly id: string;

  /** Agent type (coordinator, worker, specialist, etc.) */
  readonly type: string;

  /** Agent domain specialization */
  readonly domain?: string;

  /** Current agent status */
  readonly status: 'idle' | 'active' | 'busy' | 'offline';

  /** Agent capabilities */
  readonly capabilities?: string[];

  /** Performance metrics */
  readonly metrics?: AgentMetrics;
}

/**
 * Agent performance metrics
 */
export interface AgentMetrics {
  /** Tasks completed */
  tasksCompleted: number;

  /** Average task duration in ms */
  avgTaskDurationMs: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Current load (0-1) */
  currentLoad: number;
}

/**
 * Connection between agents in topology
 */
export interface TopologyConnection {
  /** Source agent ID */
  readonly from: string;

  /** Target agent ID */
  readonly to: string;

  /** Connection weight (strength) */
  weight: number;

  /** Connection latency in ms */
  latencyMs?: number;

  /** Connection capacity (messages/second) */
  capacity?: number;

  /** Whether connection is active */
  active: boolean;
}

/**
 * Swarm topology structure
 */
export interface SwarmTopology {
  /** All agents in the topology */
  readonly agents: TopologyAgent[];

  /** All connections between agents */
  readonly connections: TopologyConnection[];

  /** Topology type */
  readonly type: 'mesh' | 'hierarchical' | 'ring' | 'star' | 'custom';

  /** Topology metadata */
  readonly metadata?: Record<string, unknown>;

  /** Add a connection */
  addConnection(from: string, to: string, weight?: number): void;

  /** Remove a connection */
  removeConnection(from: string, to: string): boolean;

  /** Update connection weight */
  updateConnectionWeight(from: string, to: string, delta: number): void;

  /** Add an agent */
  addAgent(agent: TopologyAgent): void;

  /** Remove an agent */
  removeAgent(agentId: string): boolean;

  /** Get agent by ID */
  getAgent(agentId: string): TopologyAgent | undefined;

  /** Get connections for an agent */
  getAgentConnections(agentId: string): TopologyConnection[];
}

// ============================================================================
// Optimizer Configuration
// ============================================================================

/**
 * Neural topology optimizer configuration
 */
export interface TopologyOptimizerConfig {
  /** Number of input features for state representation */
  inputSize: number;

  /** Hidden layer size for value network */
  hiddenSize: number;

  /** Number of possible topology actions */
  numActions: number;

  /** Learning rate for value updates (alpha) */
  learningRate: number;

  /** Discount factor for future rewards (gamma) */
  gamma: number;

  /** Exploration rate for epsilon-greedy (epsilon) */
  epsilon: number;

  /** Minimum exploration rate */
  minEpsilon: number;

  /** Exploration decay rate */
  epsilonDecay: number;

  /** Weight for communication efficiency in reward */
  efficiencyWeight: number;

  /** Weight for load balancing in reward */
  loadBalanceWeight: number;

  /** Weight for latency in reward */
  latencyWeight: number;

  /** Experience replay buffer size */
  replayBufferSize: number;

  /** Batch size for training from replay buffer */
  batchSize: number;

  /** Time step for simulation */
  dt: number;

  /** Target network update frequency (steps) */
  targetUpdateFrequency: number;

  /** Minimum experiences before training */
  minExperiencesForTraining: number;
}

/**
 * Default optimizer configuration
 */
export const DEFAULT_OPTIMIZER_CONFIG: TopologyOptimizerConfig = {
  inputSize: 16,
  hiddenSize: 64,
  numActions: 5,
  learningRate: 0.001,
  gamma: 0.99,
  epsilon: 0.3,
  minEpsilon: 0.01,
  epsilonDecay: 0.995,
  efficiencyWeight: 0.3,
  loadBalanceWeight: 0.2,
  latencyWeight: 0.2,
  replayBufferSize: 10000,
  batchSize: 32,
  dt: 1.0,
  targetUpdateFrequency: 100,
  minExperiencesForTraining: 100,
};

// ============================================================================
// Topology Actions
// ============================================================================

/**
 * Actions that can be taken to modify topology
 */
export type TopologyAction =
  | { type: 'add_connection'; from: string; to: string; weight?: number }
  | { type: 'remove_connection'; from: string; to: string }
  | { type: 'strengthen_connection'; from: string; to: string; delta: number }
  | { type: 'weaken_connection'; from: string; to: string; delta: number }
  | { type: 'no_op' };

/**
 * Action type enumeration
 */
export type ActionType = TopologyAction['type'];

/**
 * All action types
 */
export const ACTION_TYPES: readonly ActionType[] = [
  'add_connection',
  'remove_connection',
  'strengthen_connection',
  'weaken_connection',
  'no_op',
] as const;

/**
 * Convert action to index
 */
export function actionToIndex(action: TopologyAction): number {
  switch (action.type) {
    case 'add_connection': return 0;
    case 'remove_connection': return 1;
    case 'strengthen_connection': return 2;
    case 'weaken_connection': return 3;
    case 'no_op': return 4;
  }
}

/**
 * Convert index to action type
 */
export function indexToActionType(idx: number): ActionType {
  return ACTION_TYPES[idx % ACTION_TYPES.length];
}

// ============================================================================
// State Representation
// ============================================================================

/**
 * Topology state for RL
 */
export interface TopologyState {
  /** Number of agents */
  agentCount: number;

  /** Number of connections */
  connectionCount: number;

  /** Graph density (connections / max possible) */
  density: number;

  /** Average degree */
  avgDegree: number;

  /** Minimum degree (approximates min-cut) */
  minDegree: number;

  /** Average connection weight */
  avgWeight: number;

  /** Weight variance */
  weightVariance: number;

  /** Average agent load */
  avgLoad: number;

  /** Load variance (lower is better balanced) */
  loadVariance: number;

  /** Average latency */
  avgLatency: number;

  /** Number of idle agents */
  idleAgents: number;

  /** Number of overloaded agents (load > 0.8) */
  overloadedAgents: number;

  /** Clustering coefficient */
  clusteringCoefficient: number;

  /** Current simulation time */
  time: number;

  /** Additional feature slots */
  extra: number[];
}

// ============================================================================
// Experience Replay
// ============================================================================

/**
 * Experience tuple for replay buffer
 */
export interface Experience {
  /** State before action */
  state: number[];

  /** Action taken (index) */
  actionIdx: number;

  /** Reward received */
  reward: number;

  /** State after action */
  nextState: number[];

  /** Whether episode ended */
  done: boolean;

  /** TD error for prioritized replay */
  tdError: number;

  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// Optimization Results
// ============================================================================

/**
 * Result of a single optimization step
 */
export interface OptimizationResult {
  /** Action taken */
  action: TopologyAction;

  /** Reward received */
  reward: number;

  /** New estimated min-cut */
  newMinCut: number;

  /** Communication efficiency metric */
  communicationEfficiency: number;

  /** Load balance metric */
  loadBalance: number;

  /** TD error from value update */
  tdError: number;

  /** Current exploration rate */
  epsilon: number;

  /** Value estimate before action */
  valueBefore: number;

  /** Value estimate after action */
  valueAfter: number;
}

/**
 * Optimization statistics over multiple steps
 */
export interface OptimizationStats {
  /** Total optimization steps */
  totalSteps: number;

  /** Total episodes */
  episodes: number;

  /** Cumulative reward */
  cumulativeReward: number;

  /** Average reward per step */
  avgReward: number;

  /** Average TD error */
  avgTdError: number;

  /** Actions taken by type */
  actionCounts: Record<ActionType, number>;

  /** Min-cut improvement over time */
  minCutHistory: number[];

  /** Reward history */
  rewardHistory: number[];

  /** Current exploration rate */
  currentEpsilon: number;
}

// ============================================================================
// Model Export/Import
// ============================================================================

/**
 * Exported model format
 */
export interface ExportedModel {
  /** Model type identifier */
  type: 'neural-topology-optimizer';

  /** Model version */
  version: string;

  /** Configuration used */
  config: TopologyOptimizerConfig;

  /** Value network weights */
  valueNetwork: {
    wHidden: number[][];
    bHidden: number[];
    wOutput: number[];
    bOutput: number;
  };

  /** Target network weights (if using target network) */
  targetNetwork?: {
    wHidden: number[][];
    bHidden: number[];
    wOutput: number[];
    bOutput: number;
  };

  /** Training statistics */
  stats: OptimizationStats;

  /** Export timestamp */
  exportedAt: string;
}

// ============================================================================
// Value Network Interface
// ============================================================================

/**
 * Value network interface
 */
export interface IValueNetwork {
  /** Estimate value of a state */
  estimate(state: number[]): number;

  /** Update weights using TD error */
  update(state: number[], tdError: number, lr: number): void;

  /** Copy weights from another network */
  copyFrom(other: IValueNetwork): void;

  /** Export weights */
  export(): { wHidden: number[][]; bHidden: number[]; wOutput: number[]; bOutput: number };

  /** Import weights */
  import(weights: { wHidden: number[][]; bHidden: number[]; wOutput: number[]; bOutput: number }): void;
}

// ============================================================================
// Replay Buffer Interface
// ============================================================================

/**
 * Replay buffer interface
 */
export interface IReplayBuffer {
  /** Add experience to buffer */
  push(experience: Experience): void;

  /** Sample experiences for training */
  sample(batchSize: number): Experience[];

  /** Get buffer length */
  readonly length: number;

  /** Clear buffer */
  clear(): void;

  /** Update priorities (for prioritized replay) */
  updatePriorities(indices: number[], priorities: number[]): void;
}
