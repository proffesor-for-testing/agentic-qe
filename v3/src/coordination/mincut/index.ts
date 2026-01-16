/**
 * Agentic QE v3 - MinCut Self-Organizing Coordination Module
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * This module provides graph-based analysis of swarm topology health using
 * minimum cut algorithms. It enables self-healing agent coordination by
 * detecting weak points in the agent communication topology.
 *
 * Key Components:
 * - SwarmGraph: Efficient graph data structure for topology representation
 * - MinCutCalculator: Algorithms for computing minimum cuts
 * - MinCutHealthMonitor: Real-time health monitoring and alerting
 *
 * Usage:
 * ```typescript
 * import {
 *   createSwarmGraph,
 *   createMinCutCalculator,
 *   createMinCutHealthMonitor,
 * } from './coordination/mincut';
 *
 * // Create graph representing agent topology
 * const graph = createSwarmGraph();
 * graph.addVertex({ id: 'agent-1', type: 'agent', domain: 'test-generation', weight: 1 });
 * graph.addVertex({ id: 'agent-2', type: 'agent', domain: 'test-execution', weight: 1 });
 * graph.addEdge({ source: 'agent-1', target: 'agent-2', weight: 1, type: 'coordination', bidirectional: true });
 *
 * // Calculate min-cut
 * const calculator = createMinCutCalculator();
 * const minCutValue = calculator.getMinCutValue(graph);
 * const weakVertices = calculator.findWeakVertices(graph);
 *
 * // Monitor health
 * const monitor = createMinCutHealthMonitor(graph);
 * monitor.start();
 * const health = monitor.getHealth();
 * ```
 */

// ============================================================================
// Interfaces & Types
// ============================================================================

export type {
  // Graph types
  SwarmVertex,
  SwarmEdge,
  SwarmGraphSnapshot,
  SwarmGraphStats,

  // MinCut analysis types
  MinCutResult,
  WeakVertex,
  StrengtheningAction,

  // Health monitoring types
  MinCutHealth,
  MinCutHealthConfig,
  MinCutHistoryEntry,
  MinCutAlert,

  // Self-healing types (P1 preview)
  SwarmObservation,
  SelfModelPrediction,
  ReorganizationAction,
  ReorganizationResult,

  // Event types
  MinCutEvent,
  MinCutEventType,
  MinCutPriority,
} from './interfaces';

export { DEFAULT_MINCUT_HEALTH_CONFIG } from './interfaces';

// ============================================================================
// Swarm Graph
// ============================================================================

export {
  SwarmGraph,
  createSwarmGraph,
  createSwarmGraphFrom,
} from './swarm-graph';

// ============================================================================
// Shared Singleton (for MCP tools + Queen integration)
// ============================================================================

export {
  getSharedMinCutGraph,
  getSharedMinCutMonitor,
  resetSharedMinCutState,
  isSharedMinCutGraphInitialized,
  isSharedMinCutMonitorInitialized,
} from './shared-singleton';

// ============================================================================
// MinCut Calculator
// ============================================================================

export {
  MinCutCalculator,
  createMinCutCalculator,
  calculateMinCut,
  findWeakVertices,
} from './mincut-calculator';

// ============================================================================
// Health Monitor
// ============================================================================

export {
  MinCutHealthMonitor,
  createMinCutHealthMonitor,
} from './mincut-health-monitor';

// ============================================================================
// Persistence Layer
// ============================================================================

export {
  MinCutPersistence,
  createMinCutPersistence,
} from './mincut-persistence';

// ============================================================================
// Queen Coordinator Integration
// ============================================================================

export {
  QueenMinCutBridge,
  createQueenMinCutBridge,
  DEFAULT_QUEEN_MINCUT_CONFIG,
} from './queen-integration';

export type { QueenMinCutConfig } from './queen-integration';

// ============================================================================
// Strange Loop Self-Healing (P1)
// ============================================================================

export {
  StrangeLoopController,
  createStrangeLoopController,
  DEFAULT_STRANGE_LOOP_CONFIG,
} from './strange-loop';

export type { StrangeLoopConfig } from './strange-loop';

// ============================================================================
// Causal Test Failure Discovery (P2)
// ============================================================================

export {
  // Primary exports (prefer these for new code)
  TestFailureCausalGraph,
  createTestFailureCausalGraph,
  createTestFailure,
  DEFAULT_CAUSAL_DISCOVERY_CONFIG,

  // Backward compatibility aliases (deprecated)
  CausalGraph,
  createCausalGraph,
} from './causal-discovery';

export type {
  TestFailure,
  CausalLink,
  RootCauseAnalysis,
  FixSuggestion,
  CausalGraphStats,
  CausalDiscoveryConfig,
} from './causal-discovery';

// ============================================================================
// Morphogenetic Test Generation (P3)
// ============================================================================

export {
  // Controller
  MorphogeneticController,
  createMorphogeneticController,

  // Field Manager
  MorphogeneticFieldManager,
  createMorphogeneticFieldManager,

  // Types
  type GrowthPattern,
  type TestSpecification,
  type MutationRule,
  type TestSeed,
  type FieldCell,
  type MorphogeneticField,
  type GrowthCycleResult,
  type HarvestResult,

  // Configuration
  type MorphogeneticConfig,
  DEFAULT_MORPHOGENETIC_CONFIG,
} from './morphogenetic-growth';

// ============================================================================
// Time Crystal CI/CD Coordination (P4)
// ============================================================================

export {
  // Controller
  TimeCrystalController,
  createTimeCrystalController,

  // Types
  type TemporalAttractor,
  type PhaseState,
  type ExecutionMetrics,
  type TimeCrystalPhase,
  type TemporalDependency,
  type CrystalLattice,
  type LatticeNode,
  type CrystalObservation,
  type CrystalAnomaly,
  type ScheduleOptimization,
  type StabilizationAction,
  type TimeCrystalEventType,

  // Configuration
  type TimeCrystalConfig,
  DEFAULT_TIME_CRYSTAL_CONFIG,
} from './time-crystal';

// ============================================================================
// Dream x Strange Loop Meta-Learning Integration (P6)
// ============================================================================

export {
  // Main Controller
  DreamMinCutController,
  createDreamMinCutController,

  // Bridge
  DreamMinCutBridge,
  createDreamMinCutBridge,

  // Meta-Learning Tracker
  MetaLearningTracker,
  createMetaLearningTracker,

  // Integration Layer
  StrangeLoopDreamIntegration,
  createStrangeLoopDreamIntegration,

  // Types
  type StrategyEffectiveness,
  type PatternConfidence,
  type AdaptationRecord,
  type MetaLearningState,

  // Configuration
  type DreamIntegrationConfig,
  DEFAULT_DREAM_INTEGRATION_CONFIG,
} from './dream-integration';

// ============================================================================
// Neural GOAP Optimizer (P5)
// ============================================================================

export {
  // Controller
  GOAPController,
  createGOAPController,

  // Planner
  NeuralPlanner,
  createNeuralPlanner,

  // State Types
  type GOAPState,
  createInitialState,

  // Goal Types
  type GOAPGoal,
  type GOAPGoalType,
  GOAPGoals,

  // Action Types
  type GOAPAction,
  type GOAPActionType,
  GOAPActions,
  createStandardActions,

  // Plan Types
  type GOAPPlan,
  type PlanExecutionResult,

  // Configuration
  type GOAPControllerConfig,
  DEFAULT_GOAP_CONTROLLER_CONFIG,
  type NeuralPlannerConfig,
  DEFAULT_NEURAL_PLANNER_CONFIG,
} from './neural-goap';
