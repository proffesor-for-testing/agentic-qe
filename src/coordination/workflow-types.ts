/**
 * Workflow Orchestrator Types and Interfaces
 *
 * Contains all type definitions, interfaces, and event constants
 * for the workflow orchestrator system. Extracted from workflow-orchestrator.ts.
 */

import {
  Result,
  DomainName,
} from '../shared/types/index.js';

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * Step execution mode
 */
export type StepExecutionMode = 'sequential' | 'parallel';

/**
 * Step status
 */
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Workflow status
 */
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

/**
 * Condition operator
 */
export type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';

/**
 * Step condition for conditional branching
 */
export interface StepCondition {
  /** Path to the value in context (e.g., 'results.coverage.line') */
  path: string;
  /** Comparison operator */
  operator: ConditionOperator;
  /** Value to compare against */
  value: unknown;
}

/**
 * Workflow step definition
 */
export interface WorkflowStepDefinition {
  /** Unique step identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Target domain for execution */
  domain: DomainName;
  /** Action to invoke on the domain */
  action: string;
  /** Input mapping from context */
  inputMapping?: Record<string, string>;
  /** Output mapping to context */
  outputMapping?: Record<string, string>;
  /** Step dependencies (step IDs that must complete first) */
  dependsOn?: string[];
  /** Condition to execute this step */
  condition?: StepCondition;
  /** Skip condition (if true, step is skipped) */
  skipCondition?: StepCondition;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
    backoffMultiplier?: number;
  };
  /** Rollback action if step fails */
  rollback?: {
    domain: DomainName;
    action: string;
    input?: Record<string, unknown>;
  };
  /** Continue workflow on failure */
  continueOnFailure?: boolean;
}

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  /** Unique workflow identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Workflow version */
  version: string;
  /** Workflow steps */
  steps: WorkflowStepDefinition[];
  /** Default execution mode for steps without dependencies */
  defaultMode?: StepExecutionMode;
  /** Global timeout in milliseconds */
  timeout?: number;
  /** Event triggers */
  triggers?: WorkflowTrigger[];
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Workflow trigger definition
 */
export interface WorkflowTrigger {
  /** Event type to trigger on */
  eventType: string;
  /** Optional source domain filter */
  sourceDomain?: DomainName;
  /** Condition to evaluate on event payload */
  condition?: StepCondition;
  /** Input mapping from event payload to workflow context */
  inputMapping?: Record<string, string>;
}

/**
 * Step execution result
 */
export interface StepExecutionResult {
  stepId: string;
  status: StepStatus;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  output?: unknown;
  error?: string;
  retryCount?: number;
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  /** Input parameters */
  input: Record<string, unknown>;
  /** Accumulated results from steps */
  results: Record<string, unknown>;
  /** Metadata */
  metadata: {
    executionId: string;
    workflowId: string;
    correlationId?: string;
    startedAt: Date;
    triggeredBy?: string;
  };
}

/**
 * Workflow execution status
 */
export interface WorkflowExecutionStatus {
  executionId: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowStatus;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  progress: number;
  currentSteps: string[];
  completedSteps: string[];
  failedSteps: string[];
  skippedSteps: string[];
  context: WorkflowContext;
  stepResults: Map<string, StepExecutionResult>;
  error?: string;
}

/**
 * Workflow list item
 */
export interface WorkflowListItem {
  id: string;
  name: string;
  description: string;
  version: string;
  stepCount: number;
  tags?: string[];
  triggers?: string[];
}

// ============================================================================
// Workflow Events
// ============================================================================

export const WorkflowEvents = {
  WorkflowStarted: 'workflow.WorkflowStarted',
  WorkflowCompleted: 'workflow.WorkflowCompleted',
  WorkflowFailed: 'workflow.WorkflowFailed',
  WorkflowCancelled: 'workflow.WorkflowCancelled',
  StepStarted: 'workflow.StepStarted',
  StepCompleted: 'workflow.StepCompleted',
  StepFailed: 'workflow.StepFailed',
  StepSkipped: 'workflow.StepSkipped',
} as const;

export interface WorkflowStartedPayload {
  executionId: string;
  workflowId: string;
  workflowName: string;
  stepCount: number;
}

export interface WorkflowCompletedPayload {
  executionId: string;
  workflowId: string;
  workflowName: string;
  duration: number;
  completedSteps: number;
  skippedSteps: number;
}

export interface WorkflowFailedPayload {
  executionId: string;
  workflowId: string;
  workflowName: string;
  failedStep: string;
  error: string;
}

export interface StepEventPayload {
  executionId: string;
  workflowId: string;
  stepId: string;
  stepName: string;
  domain: DomainName;
}

// ============================================================================
// Workflow Orchestrator Interface
// ============================================================================

export interface IWorkflowOrchestrator {
  /** Initialize the orchestrator */
  initialize(): Promise<void>;
  /** Dispose resources */
  dispose(): Promise<void>;
  /** Register a workflow definition */
  registerWorkflow(definition: WorkflowDefinition): Result<void, Error>;
  /** Unregister a workflow */
  unregisterWorkflow(workflowId: string): Result<void, Error>;
  /** Execute a workflow */
  executeWorkflow(
    workflowId: string,
    input?: Record<string, unknown>,
    correlationId?: string
  ): Promise<Result<string, Error>>;
  /** Get workflow execution status */
  getWorkflowStatus(executionId: string): WorkflowExecutionStatus | undefined;
  /** Cancel a running workflow */
  cancelWorkflow(executionId: string): Promise<Result<void, Error>>;
  /** Pause a running workflow */
  pauseWorkflow(executionId: string): Promise<Result<void, Error>>;
  /** Resume a paused workflow */
  resumeWorkflow(executionId: string): Promise<Result<void, Error>>;
  /** List registered workflows */
  listWorkflows(): WorkflowListItem[];
  /** Get active executions */
  getActiveExecutions(): WorkflowExecutionStatus[];
  /** Get workflow definition */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined;
}

// ============================================================================
// Domain Action Registry Types
// ============================================================================

export type DomainAction = (
  input: Record<string, unknown>,
  context: WorkflowContext
) => Promise<Result<unknown, Error>>;

export interface DomainActionRegistry {
  [domain: string]: {
    [action: string]: DomainAction;
  };
}

// ============================================================================
// Orchestrator Config
// ============================================================================

export interface WorkflowOrchestratorConfig {
  maxConcurrentWorkflows: number;
  defaultStepTimeout: number;
  defaultWorkflowTimeout: number;
  enableEventTriggers: boolean;
  persistExecutions: boolean;
}

export const DEFAULT_WORKFLOW_CONFIG: WorkflowOrchestratorConfig = {
  maxConcurrentWorkflows: 10,
  defaultStepTimeout: 60000,
  defaultWorkflowTimeout: 600000,
  enableEventTriggers: true,
  persistExecutions: true,
};
