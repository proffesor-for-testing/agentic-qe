/**
 * Agentic QE v3 - Neural Topology Optimizer
 * ADR-034: RL-based swarm topology optimization
 *
 * Provides reinforcement learning-based optimization of swarm topologies
 * using value networks, experience replay, and multi-objective rewards.
 *
 * Key Components:
 * - NeuralTopologyOptimizer: Main optimizer using RL
 * - ValueNetwork: Neural network for state value estimation
 * - PrioritizedReplayBuffer: Experience replay with prioritization
 * - MutableSwarmTopology: Modifiable topology structure
 *
 * @example
 * ```typescript
 * import {
 *   createNeuralTopologyOptimizer,
 *   createTopology,
 *   createAgent,
 * } from 'agentic-qe/neural-optimizer';
 *
 * // Create topology with agents
 * const topology = createTopology('mesh');
 * topology.addAgent(createAgent('agent-1', 'coordinator'));
 * topology.addAgent(createAgent('agent-2', 'worker'));
 * topology.addAgent(createAgent('agent-3', 'worker'));
 *
 * // Add initial connections
 * topology.addConnection('agent-1', 'agent-2', 1.0);
 * topology.addConnection('agent-1', 'agent-3', 1.0);
 *
 * // Create optimizer
 * const optimizer = createNeuralTopologyOptimizer(topology, {
 *   learningRate: 0.001,
 *   epsilon: 0.3,
 * });
 *
 * // Run optimization steps
 * const results = optimizer.optimize(100);
 *
 * // Check results
 * console.log('Final min-cut:', results[results.length - 1].newMinCut);
 * console.log('Stats:', optimizer.getStats());
 *
 * // Export learned model
 * const model = optimizer.exportModel();
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Topology Types
  TopologyAgent,
  TopologyConnection,
  SwarmTopology,
  AgentMetrics,

  // Configuration
  TopologyOptimizerConfig,

  // Actions
  TopologyAction,
  ActionType,

  // State
  TopologyState,

  // Experience Replay
  Experience,

  // Results
  OptimizationResult,
  OptimizationStats,
  ExportedModel,

  // Interfaces
  IValueNetwork,
  IReplayBuffer,
} from './types';

export {
  DEFAULT_OPTIMIZER_CONFIG,
  ACTION_TYPES,
  actionToIndex,
  indexToActionType,
} from './types';

// ============================================================================
// Core Classes
// ============================================================================

export { NeuralTopologyOptimizer, createNeuralTopologyOptimizer } from './topology-optimizer';
export { ValueNetwork, createValueNetwork, createValueNetworkFromWeights } from './value-network';
export {
  PrioritizedReplayBuffer,
  UniformReplayBuffer,
  createPrioritizedReplayBuffer,
  createUniformReplayBuffer,
} from './replay-buffer';
export {
  MutableSwarmTopology,
  createTopology,
  createAgent,
  buildMeshTopology,
  buildRingTopology,
  buildStarTopology,
  buildHierarchicalTopology,
} from './swarm-topology';
