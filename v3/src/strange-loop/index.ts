/**
 * Strange Loop Self-Awareness Module
 * ADR-031: Strange Loop Self-Awareness
 *
 * Implements the self-observation -> self-modeling -> self-healing cycle
 * that enables autonomous QE systems with genuine self-awareness.
 *
 * The Strange Loop Pattern:
 * ```
 *    Observe -> Model -> Decide -> Act
 *       ^                          |
 *       └──────────────────────────┘
 *
 *    "I see I'm weak here, so I strengthen"
 * ```
 *
 * @module strange-loop
 */

// Types
export type {
  // Topology types
  TopologyType,
  AgentNode,
  CommunicationEdge,
  SwarmTopology,

  // Health metrics types
  AgentHealthMetrics,
  ConnectivityMetrics,
  SwarmVulnerability,

  // Observation types
  SwarmHealthObservation,
  SerializedSwarmHealthObservation,

  // Self-modeling types
  TrendDirection,
  TrendAnalysis,
  BottleneckInfo,
  BottleneckAnalysis,
  PredictedVulnerability,
  SwarmModelDelta,
  SwarmModelState,

  // Self-healing types
  SelfHealingActionType,
  ActionPriority,
  SelfHealingAction,
  ActionResult,
  ExecutedAction,

  // Self-diagnosis types
  SelfDiagnosis,

  // Configuration types
  StrangeLoopConfig,

  // Statistics types
  StrangeLoopStats,

  // Event types
  StrangeLoopEventType,
  StrangeLoopEvent,
  StrangeLoopEventListener,
} from './types.js';

export { DEFAULT_STRANGE_LOOP_CONFIG } from './types.js';

// Swarm Observer
export {
  SwarmObserver,
  createSwarmObserver,
  createInMemorySwarmObserver,
  InMemoryAgentProvider,
  type AgentProvider,
} from './swarm-observer.js';

// Topology Analyzer
export {
  TopologyAnalyzer,
  createTopologyAnalyzer,
} from './topology-analyzer.js';

// Self-Model
export {
  SwarmSelfModel,
  createSwarmSelfModel,
} from './self-model.js';

// Self-Healing Controller
export {
  SelfHealingController,
  createSelfHealingController,
  NoOpActionExecutor,
  type ActionExecutor,
} from './healing-controller.js';

// Strange Loop Orchestrator
export {
  StrangeLoopOrchestrator,
  createStrangeLoopOrchestrator,
  createInMemoryStrangeLoop,
} from './strange-loop.js';

// Belief Reconciler (ADR-052)
export {
  BeliefReconciler,
  createBeliefReconciler,
  DEFAULT_BELIEF_RECONCILER_CONFIG,
  type ReconciliationStrategy,
  type ReconciliationResult,
  type ReconciliationRecord,
  type BeliefReconcilerConfig,
  type IBeliefReconciler,
  type IVoteCollector,
  type IWitnessAdapter,
  type BeliefVote,
  type BeliefReconcilerEvent,
  type BeliefReconcilerEventType,
  type BeliefReconcilerEventListener,
} from './belief-reconciler.js';
