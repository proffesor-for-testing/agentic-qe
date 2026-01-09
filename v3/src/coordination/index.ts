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
