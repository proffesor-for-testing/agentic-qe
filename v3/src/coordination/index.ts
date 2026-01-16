/**
 * Agentic QE v3 - Coordination Layer
 * Multi-agent coordination protocols and workflows
 */

// ============================================================================
// Protocols (existing)
// ============================================================================

export * from './protocols';

// ============================================================================
// Claims (ADR-016: Collaborative Test Task Claims)
// ============================================================================

export * from './claims';

// ============================================================================
// Cross-Domain Integration Interfaces
// ============================================================================

export type {
  // Protocol Types
  Protocol,
  ProtocolSchedule,
  ProtocolAction,
  ProtocolExecution,
  ProtocolExecutionStatus,
  ActionExecutionResult,
  ActionExecutionStatus,
  ProtocolExecutor,

  // Workflow Types (interfaces)
  WorkflowDefinition as CrossDomainWorkflowDefinition,
  WorkflowStep as CrossDomainWorkflowStep,
  WorkflowCondition,
  WorkflowTrigger as CrossDomainWorkflowTrigger,
  WorkflowHandler,
  WorkflowContext as CrossDomainWorkflowContext,
  WorkflowExecution as CrossDomainWorkflowExecution,
  WorkflowExecutionStatus as CrossDomainWorkflowExecutionStatus,
  StepExecutionResult as CrossDomainStepExecutionResult,
  WorkflowExecutor,

  // Cross-Domain Handler Types
  CrossDomainHandler,
  CrossDomainHandlerConfig,
  DomainRoute,
  EventSubscription,
  EventCorrelation,
  EventAggregation,

  // Router Types
  CrossDomainRouter,
} from './interfaces';

// ============================================================================
// Task Audit Logger (SEC-003 Simplified)
// ============================================================================

export {
  TaskAuditLogger,
  createTaskAuditLogger,
} from './services';

export type {
  TaskAuditEntry,
  TaskAuditConfig,
  TaskOperation,
} from './services';

// ============================================================================
// Cross-Domain Router
// ============================================================================

export {
  CrossDomainEventRouter,
  createCrossDomainRouter,
} from './cross-domain-router';

// ============================================================================
// Protocol Executor
// ============================================================================

export {
  DefaultProtocolExecutor,
  createProtocolExecutor,
} from './protocol-executor';

// ============================================================================
// Workflow Orchestrator (existing)
// ============================================================================

export {
  WorkflowOrchestrator,
  createWorkflowOrchestrator,
  WorkflowEvents,
} from './workflow-orchestrator';

export type {
  WorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowTrigger,
  WorkflowContext,
  WorkflowExecutionStatus,
  StepExecutionResult,
  WorkflowListItem,
  IWorkflowOrchestrator,
  WorkflowOrchestratorConfig,
  StepExecutionMode,
  StepStatus,
  WorkflowStatus,
  ConditionOperator,
  StepCondition,
  WorkflowStartedPayload,
  WorkflowCompletedPayload,
  WorkflowFailedPayload,
  StepEventPayload,
} from './workflow-orchestrator';

// ============================================================================
// Queen Coordinator (Hierarchical Orchestration)
// ============================================================================

export {
  QueenCoordinator,
  createQueenCoordinator,
} from './queen-coordinator';

export type {
  IQueenCoordinator,
  QueenTask,
  TaskType,
  TaskExecution,
  TaskFilter,
  DomainGroup,
  WorkStealingConfig,
  QueenConfig,
  QueenMetrics,
  QueenHealth,
  HealthIssue,
} from './queen-coordinator';

// ============================================================================
// MinCut Self-Organizing Coordination (ADR-047)
// ============================================================================

// Re-export mincut types explicitly to avoid TestFailure name conflict with protocols
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

  // Self-healing types (P1)
  SwarmObservation,
  SelfModelPrediction,
  ReorganizationAction,
  ReorganizationResult,

  // Event types
  MinCutEvent,
  MinCutEventType,
  MinCutPriority,

  // Queen integration
  QueenMinCutConfig,

  // Strange Loop
  StrangeLoopConfig,

  // Causal Discovery (rename TestFailure to avoid conflict)
  TestFailure as CausalTestFailure,
  CausalLink,
  RootCauseAnalysis as CausalRootCauseAnalysis,
  FixSuggestion,
  CausalGraphStats,
  CausalDiscoveryConfig,

  // Morphogenetic Growth
  GrowthPattern,
  TestSpecification,
  MutationRule,
  TestSeed,
  FieldCell,
  MorphogeneticField,
  GrowthCycleResult,
  HarvestResult,
  MorphogeneticConfig,

  // Time Crystal
  TemporalAttractor,
  PhaseState,
  ExecutionMetrics,
  TimeCrystalPhase,
  TemporalDependency,
  CrystalLattice,
  LatticeNode,
  CrystalObservation,
  CrystalAnomaly,
  ScheduleOptimization,
  StabilizationAction,
  TimeCrystalEventType,
  TimeCrystalConfig,

  // Dream Integration
  StrategyEffectiveness,
  PatternConfidence,
  AdaptationRecord,
  MetaLearningState,
  DreamIntegrationConfig,

  // Neural GOAP
  GOAPState,
  GOAPGoal,
  GOAPGoalType,
  GOAPAction,
  GOAPActionType,
  GOAPPlan,
  PlanExecutionResult,
  GOAPControllerConfig,
  NeuralPlannerConfig,
} from './mincut';

// Re-export mincut values
export {
  // Constants
  DEFAULT_MINCUT_HEALTH_CONFIG,
  DEFAULT_QUEEN_MINCUT_CONFIG,
  DEFAULT_STRANGE_LOOP_CONFIG,
  DEFAULT_CAUSAL_DISCOVERY_CONFIG,
  DEFAULT_MORPHOGENETIC_CONFIG,
  DEFAULT_TIME_CRYSTAL_CONFIG,
  DEFAULT_DREAM_INTEGRATION_CONFIG,
  DEFAULT_GOAP_CONTROLLER_CONFIG,
  DEFAULT_NEURAL_PLANNER_CONFIG,

  // Swarm Graph
  SwarmGraph,
  createSwarmGraph,
  createSwarmGraphFrom,

  // MinCut Calculator
  MinCutCalculator,
  createMinCutCalculator,
  calculateMinCut,
  findWeakVertices,

  // Health Monitor
  MinCutHealthMonitor,
  createMinCutHealthMonitor,

  // Persistence
  MinCutPersistence,
  createMinCutPersistence,

  // Queen Integration
  QueenMinCutBridge,
  createQueenMinCutBridge,

  // Strange Loop (P1)
  StrangeLoopController,
  createStrangeLoopController,

  // Causal Discovery (P2) - primary exports
  TestFailureCausalGraph,
  createTestFailureCausalGraph,
  createTestFailure,

  // Causal Discovery (P2) - backward compatibility aliases
  CausalGraph,
  createCausalGraph,

  // Morphogenetic Growth (P3)
  MorphogeneticController,
  createMorphogeneticController,
  MorphogeneticFieldManager,
  createMorphogeneticFieldManager,

  // Time Crystal (P4)
  TimeCrystalController,
  createTimeCrystalController,

  // Neural GOAP (P5)
  GOAPController,
  createGOAPController,
  NeuralPlanner,
  createNeuralPlanner,
  createInitialState,
  GOAPGoals,
  GOAPActions,
  createStandardActions,

  // Dream Integration (P6)
  DreamMinCutController,
  createDreamMinCutController,
  DreamMinCutBridge,
  createDreamMinCutBridge,
  MetaLearningTracker,
  createMetaLearningTracker,
  StrangeLoopDreamIntegration,
  createStrangeLoopDreamIntegration,
} from './mincut';
