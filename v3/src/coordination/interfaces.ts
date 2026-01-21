/**
 * Agentic QE v3 - Cross-Domain Coordination Interfaces
 * Defines protocols, workflows, and cross-domain handlers for orchestration
 */

import { DomainName, DomainEvent, Result, Priority } from '../shared/types';

// ============================================================================
// Protocol Interfaces
// ============================================================================

/**
 * Schedule type for protocol execution
 */
export type ProtocolSchedule =
  | { type: 'immediate' }
  | { type: 'cron'; expression: string }
  | { type: 'interval'; intervalMs: number }
  | { type: 'event'; triggerEvents: string[] };

/**
 * Action to be executed within a protocol
 */
export interface ProtocolAction {
  /** Unique action identifier */
  readonly id: string;

  /** Action name */
  readonly name: string;

  /** Target domain for the action */
  readonly targetDomain: DomainName;

  /** Method to invoke on the domain API */
  readonly method: string;

  /** Parameters for the method */
  readonly params?: Record<string, unknown>;

  /** Timeout in milliseconds */
  readonly timeout?: number;

  /** Actions that must complete before this one */
  readonly dependsOn?: string[];

  /** Retry configuration */
  readonly retry?: {
    maxAttempts: number;
    backoffMs: number;
    backoffMultiplier?: number;
  };
}

/**
 * Protocol definition for cross-domain coordination
 */
export interface Protocol {
  /** Unique protocol identifier */
  readonly id: string;

  /** Protocol name */
  readonly name: string;

  /** Protocol description */
  readonly description?: string;

  /** Execution schedule */
  readonly schedule: ProtocolSchedule;

  /** Participating domains */
  readonly participants: DomainName[];

  /** Actions to execute */
  readonly actions: ProtocolAction[];

  /** Protocol priority */
  readonly priority: Priority;

  /** Whether protocol is enabled */
  readonly enabled: boolean;

  /** Protocol metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Status of a protocol action execution
 */
export type ActionExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

/**
 * Result of a single action execution
 */
export interface ActionExecutionResult {
  /** Action ID */
  readonly actionId: string;

  /** Execution status */
  readonly status: ActionExecutionStatus;

  /** Start time */
  readonly startedAt?: Date;

  /** End time */
  readonly completedAt?: Date;

  /** Duration in milliseconds */
  readonly duration?: number;

  /** Result data if successful */
  readonly result?: unknown;

  /** Error if failed */
  readonly error?: string;

  /** Number of retry attempts */
  readonly retryAttempts?: number;
}

/**
 * Status of protocol execution
 */
export type ProtocolExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

/**
 * Protocol execution state
 */
export interface ProtocolExecution {
  /** Execution ID */
  readonly executionId: string;

  /** Protocol being executed */
  readonly protocolId: string;

  /** Execution status */
  readonly status: ProtocolExecutionStatus;

  /** Participating domains */
  readonly participants: DomainName[];

  /** Action results */
  readonly results: Map<string, ActionExecutionResult>;

  /** Overall execution started at */
  readonly startedAt: Date;

  /** Overall execution completed at */
  readonly completedAt?: Date;

  /** Correlation ID for event tracking */
  readonly correlationId: string;

  /** Triggered by event (if event-driven) */
  readonly triggeredBy?: DomainEvent;
}

// ============================================================================
// Workflow Interfaces
// ============================================================================

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  /** Unique step identifier */
  readonly id: string;

  /** Step name */
  readonly name: string;

  /** Step description */
  readonly description?: string;

  /** Domain responsible for this step */
  readonly domain: DomainName;

  /** Action to execute */
  readonly action: string;

  /** Input parameters */
  readonly inputs?: Record<string, unknown>;

  /** Output mapping */
  readonly outputs?: string[];

  /** Steps that must complete before this one */
  readonly dependsOn?: string[];

  /** Condition for execution */
  readonly condition?: WorkflowCondition;

  /** Timeout in milliseconds */
  readonly timeout?: number;

  /** Error handling strategy */
  readonly onError?: 'fail' | 'skip' | 'retry' | 'fallback';

  /** Fallback step ID if onError is 'fallback' */
  readonly fallbackStep?: string;
}

/**
 * Condition for workflow step execution
 */
export interface WorkflowCondition {
  /** Type of condition */
  readonly type: 'expression' | 'stepResult' | 'event';

  /** Expression to evaluate (for type 'expression') */
  readonly expression?: string;

  /** Step ID to check result (for type 'stepResult') */
  readonly stepId?: string;

  /** Expected result status */
  readonly expectedStatus?: 'completed' | 'failed';

  /** Event type to wait for (for type 'event') */
  readonly eventType?: string;
}

/**
 * Workflow trigger configuration
 */
export interface WorkflowTrigger {
  /** Trigger type */
  readonly type: 'manual' | 'event' | 'schedule' | 'api';

  /** Event types that trigger the workflow (for type 'event') */
  readonly eventTypes?: string[];

  /** Source domains (for type 'event') */
  readonly sourceDomains?: DomainName[];

  /** Cron expression (for type 'schedule') */
  readonly cron?: string;

  /** Filter condition for events */
  readonly filter?: (event: DomainEvent) => boolean;
}

/**
 * Handler for workflow events
 */
export interface WorkflowHandler {
  /** Handler name */
  readonly name: string;

  /** Event types this handler processes */
  readonly handles: string[];

  /** Handler function */
  readonly handle: (event: DomainEvent, context: WorkflowContext) => Promise<void>;
}

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  /** Unique workflow identifier */
  readonly id: string;

  /** Workflow name */
  readonly name: string;

  /** Workflow description */
  readonly description?: string;

  /** Workflow version */
  readonly version: string;

  /** Workflow steps */
  readonly steps: WorkflowStep[];

  /** Workflow triggers */
  readonly triggers: WorkflowTrigger[];

  /** Event handlers */
  readonly handlers: WorkflowHandler[];

  /** Whether workflow is enabled */
  readonly enabled: boolean;

  /** Timeout for entire workflow in milliseconds */
  readonly timeout?: number;

  /** Maximum concurrent executions */
  readonly maxConcurrent?: number;

  /** Workflow metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Context available during workflow execution
 */
export interface WorkflowContext {
  /** Workflow execution ID */
  readonly executionId: string;

  /** Workflow definition */
  readonly workflow: WorkflowDefinition;

  /** Step results so far */
  readonly stepResults: Map<string, StepExecutionResult>;

  /** Variables available to steps */
  readonly variables: Map<string, unknown>;

  /** Triggering event (if event-triggered) */
  readonly triggerEvent?: DomainEvent;

  /** Start time */
  readonly startedAt: Date;
}

/**
 * Result of a workflow step execution
 */
export interface StepExecutionResult {
  /** Step ID */
  readonly stepId: string;

  /** Execution status */
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

  /** Start time */
  readonly startedAt?: Date;

  /** End time */
  readonly completedAt?: Date;

  /** Duration in milliseconds */
  readonly duration?: number;

  /** Output data */
  readonly output?: unknown;

  /** Error message if failed */
  readonly error?: string;
}

/**
 * Workflow execution status
 */
export type WorkflowExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

/**
 * Workflow execution state
 */
export interface WorkflowExecution {
  /** Execution ID */
  readonly executionId: string;

  /** Workflow being executed */
  readonly workflowId: string;

  /** Execution status */
  readonly status: WorkflowExecutionStatus;

  /** Current step being executed */
  readonly currentStep?: string;

  /** Step results */
  readonly results: Map<string, StepExecutionResult>;

  /** Execution started at */
  readonly startedAt: Date;

  /** Execution completed at */
  readonly completedAt?: Date;

  /** Correlation ID for event tracking */
  readonly correlationId: string;

  /** Triggering event */
  readonly triggeredBy?: DomainEvent;

  /** Error message if failed */
  readonly error?: string;
}

// ============================================================================
// Cross-Domain Handler Interfaces
// ============================================================================

/**
 * Domain route for event handling
 */
export interface DomainRoute {
  /** Source domain(s) */
  readonly source: DomainName | DomainName[] | '*';

  /** Event type pattern (supports wildcards) */
  readonly eventPattern: string;

  /** Target domains to notify */
  readonly targets: DomainName[];

  /** Transform function for event payload */
  readonly transform?: (event: DomainEvent) => DomainEvent;

  /** Filter function to determine if event should be routed */
  readonly filter?: (event: DomainEvent) => boolean;

  /** Priority for route matching */
  readonly priority?: number;
}

/**
 * Event subscription configuration
 */
export interface EventSubscription {
  /** Subscription ID */
  readonly id: string;

  /** Event types to subscribe to */
  readonly eventTypes: string[];

  /** Source domains to listen to (empty for all) */
  readonly sourceDomains?: DomainName[];

  /** Handler function */
  readonly handler: (event: DomainEvent) => Promise<void>;

  /** Whether subscription is active */
  readonly active: boolean;
}

/**
 * Event correlation entry
 */
export interface EventCorrelation {
  /** Correlation ID */
  readonly correlationId: string;

  /** Events in this correlation */
  readonly events: DomainEvent[];

  /** Source domains involved */
  readonly domains: Set<DomainName>;

  /** First event timestamp */
  readonly startedAt: Date;

  /** Last event timestamp */
  readonly lastEventAt: Date;

  /** Whether correlation is complete */
  readonly complete: boolean;
}

/**
 * Aggregated event data
 */
export interface EventAggregation {
  /** Aggregation ID */
  readonly id: string;

  /** Aggregation window start */
  readonly windowStart: Date;

  /** Aggregation window end */
  readonly windowEnd: Date;

  /** Events in aggregation */
  readonly events: DomainEvent[];

  /** Event counts by type */
  readonly countByType: Map<string, number>;

  /** Event counts by domain */
  readonly countByDomain: Map<DomainName, number>;

  /** Computed metrics */
  readonly metrics: Record<string, number>;
}

/**
 * Cross-domain handler configuration
 */
export interface CrossDomainHandlerConfig {
  /** Event subscriptions */
  readonly subscriptions: EventSubscription[];

  /** Domain routes */
  readonly routes: DomainRoute[];

  /** Correlation timeout in milliseconds */
  readonly correlationTimeout?: number;

  /** Maximum events to track per correlation */
  readonly maxEventsPerCorrelation?: number;

  /** Event history retention in milliseconds */
  readonly historyRetention?: number;
}

/**
 * Cross-domain handler interface
 */
export interface CrossDomainHandler {
  /** Add an event subscription */
  subscribe(subscription: Omit<EventSubscription, 'id'>): string;

  /** Remove an event subscription */
  unsubscribe(subscriptionId: string): boolean;

  /** Add a domain route */
  addRoute(route: DomainRoute): void;

  /** Remove a domain route */
  removeRoute(eventPattern: string, source?: DomainName): boolean;

  /** Get event correlation */
  getCorrelation(correlationId: string): EventCorrelation | undefined;

  /** Get all active correlations */
  getActiveCorrelations(): EventCorrelation[];

  /** Get event aggregation for a time window */
  getAggregation(windowStart: Date, windowEnd: Date): EventAggregation;

  /** Process an incoming event */
  handleEvent(event: DomainEvent): Promise<void>;

  /** Dispose resources */
  dispose(): Promise<void>;
}

// ============================================================================
// Protocol Executor Interface
// ============================================================================

/**
 * Protocol executor interface
 */
export interface ProtocolExecutor {
  /** Register a protocol */
  registerProtocol(protocol: Protocol): void;

  /** Unregister a protocol */
  unregisterProtocol(protocolId: string): boolean;

  /** Get registered protocol */
  getProtocol(protocolId: string): Protocol | undefined;

  /** List all registered protocols */
  listProtocols(): Protocol[];

  /** Execute a protocol immediately */
  execute(protocolId: string, params?: Record<string, unknown>): Promise<Result<ProtocolExecution, Error>>;

  /** Execute a protocol triggered by an event */
  executeOnEvent(protocolId: string, event: DomainEvent): Promise<Result<ProtocolExecution, Error>>;

  /** Get execution status */
  getExecution(executionId: string): ProtocolExecution | undefined;

  /** List active executions */
  listActiveExecutions(): ProtocolExecution[];

  /** Cancel an execution */
  cancelExecution(executionId: string): Promise<Result<void, Error>>;

  /** Pause an execution */
  pauseExecution(executionId: string): Promise<Result<void, Error>>;

  /** Resume a paused execution */
  resumeExecution(executionId: string): Promise<Result<void, Error>>;

  /** Start scheduled protocol execution */
  startScheduler(): void;

  /** Stop scheduled protocol execution */
  stopScheduler(): void;

  /** Dispose resources */
  dispose(): Promise<void>;
}

// ============================================================================
// Workflow Executor Interface
// ============================================================================

/**
 * Workflow executor interface
 */
export interface WorkflowExecutor {
  /** Register a workflow */
  registerWorkflow(workflow: WorkflowDefinition): void;

  /** Unregister a workflow */
  unregisterWorkflow(workflowId: string): boolean;

  /** Get registered workflow */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined;

  /** List all registered workflows */
  listWorkflows(): WorkflowDefinition[];

  /** Execute a workflow */
  execute(
    workflowId: string,
    params?: Record<string, unknown>
  ): Promise<Result<WorkflowExecution, Error>>;

  /** Execute a workflow triggered by an event */
  executeOnEvent(event: DomainEvent): Promise<Result<WorkflowExecution[], Error>>;

  /** Get execution status */
  getExecution(executionId: string): WorkflowExecution | undefined;

  /** List active executions */
  listActiveExecutions(): WorkflowExecution[];

  /** Cancel an execution */
  cancelExecution(executionId: string): Promise<Result<void, Error>>;

  /** Pause an execution */
  pauseExecution(executionId: string): Promise<Result<void, Error>>;

  /** Resume a paused execution */
  resumeExecution(executionId: string): Promise<Result<void, Error>>;

  /** Dispose resources */
  dispose(): Promise<void>;
}

// ============================================================================
// Cross-Domain Router Interface
// ============================================================================

/**
 * Cross-domain event router interface
 */
export interface CrossDomainRouter {
  /** Initialize the router */
  initialize(): Promise<void>;

  /** Subscribe to events from a domain */
  subscribeToDoamin(domain: DomainName, handler: (event: DomainEvent) => Promise<void>): string;

  /** Subscribe to specific event types */
  subscribeToEventType(eventType: string, handler: (event: DomainEvent) => Promise<void>): string;

  /** Unsubscribe */
  unsubscribe(subscriptionId: string): boolean;

  /** Route an event to appropriate handlers */
  route(event: DomainEvent): Promise<void>;

  /** Get correlation by ID */
  getCorrelation(correlationId: string): EventCorrelation | undefined;

  /** Track event for correlation */
  trackCorrelation(event: DomainEvent): void;

  /** Get aggregated events for a time window */
  aggregate(windowStart: Date, windowEnd: Date): EventAggregation;

  /** Get event history */
  getHistory(filter?: {
    eventTypes?: string[];
    domains?: DomainName[];
    fromTimestamp?: Date;
    toTimestamp?: Date;
    limit?: number;
  }): DomainEvent[];

  /** Dispose resources */
  dispose(): Promise<void>;
}
