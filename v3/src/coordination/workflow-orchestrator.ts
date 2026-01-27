/**
 * Agentic QE v3 - Workflow Orchestrator
 * Coordinates complete QE workflows across all 12 domains
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Result,
  ok,
  err,
  DomainName,
  ALL_DOMAINS,
  DomainEvent,
} from '../shared/types/index.js';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  Subscription,
} from '../kernel/interfaces.js';
import { createEvent } from '../shared/events/domain-events.js';

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
// Domain Action Registry
// ============================================================================

type DomainAction = (
  input: Record<string, unknown>,
  context: WorkflowContext
) => Promise<Result<unknown, Error>>;

interface DomainActionRegistry {
  [domain: string]: {
    [action: string]: DomainAction;
  };
}

// ============================================================================
// Workflow Orchestrator Implementation
// ============================================================================

export interface WorkflowOrchestratorConfig {
  maxConcurrentWorkflows: number;
  defaultStepTimeout: number;
  defaultWorkflowTimeout: number;
  enableEventTriggers: boolean;
  persistExecutions: boolean;
}

const DEFAULT_CONFIG: WorkflowOrchestratorConfig = {
  maxConcurrentWorkflows: 10,
  defaultStepTimeout: 60000,
  defaultWorkflowTimeout: 600000,
  enableEventTriggers: true,
  persistExecutions: true,
};

export class WorkflowOrchestrator implements IWorkflowOrchestrator {
  private readonly config: WorkflowOrchestratorConfig;
  private readonly workflows: Map<string, WorkflowDefinition> = new Map();
  private readonly executions: Map<string, WorkflowExecutionStatus> = new Map();
  private readonly actionRegistry: DomainActionRegistry = {};
  private readonly eventSubscriptions: Subscription[] = [];
  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<WorkflowOrchestratorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Register built-in workflows
    this.registerBuiltInWorkflows();

    // Set up event triggers if enabled
    if (this.config.enableEventTriggers) {
      this.setupEventTriggers();
    }

    // Load persisted workflow definitions
    await this.loadPersistedWorkflows();

    this.initialized = true;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    // Cancel all active executions
    for (const execution of this.executions.values()) {
      if (execution.status === 'running') {
        await this.cancelWorkflow(execution.executionId);
      }
    }

    // Unsubscribe from events
    for (const subscription of this.eventSubscriptions) {
      subscription.unsubscribe();
    }

    // Persist workflow definitions
    await this.persistWorkflows();

    this.initialized = false;
  }

  /**
   * Register a workflow definition
   */
  registerWorkflow(definition: WorkflowDefinition): Result<void, Error> {
    try {
      // Validate workflow
      const validationResult = this.validateWorkflowDefinition(definition);
      if (!validationResult.success) {
        return validationResult;
      }

      // Store workflow
      this.workflows.set(definition.id, definition);

      // Set up triggers
      if (this.config.enableEventTriggers && definition.triggers) {
        this.registerWorkflowTriggers(definition);
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Unregister a workflow
   */
  unregisterWorkflow(workflowId: string): Result<void, Error> {
    if (!this.workflows.has(workflowId)) {
      return err(new Error(`Workflow not found: ${workflowId}`));
    }

    // Check for active executions
    const activeExecutions = Array.from(this.executions.values()).filter(
      (e) => e.workflowId === workflowId && e.status === 'running'
    );

    if (activeExecutions.length > 0) {
      return err(
        new Error(
          `Cannot unregister workflow with ${activeExecutions.length} active execution(s)`
        )
      );
    }

    this.workflows.delete(workflowId);
    return ok(undefined);
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowId: string,
    input: Record<string, unknown> = {},
    correlationId?: string
  ): Promise<Result<string, Error>> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return err(new Error(`Workflow not found: ${workflowId}`));
    }

    // Check concurrent execution limit
    const activeCount = Array.from(this.executions.values()).filter(
      (e) => e.status === 'running'
    ).length;

    if (activeCount >= this.config.maxConcurrentWorkflows) {
      return err(
        new Error(
          `Maximum concurrent workflows (${this.config.maxConcurrentWorkflows}) reached`
        )
      );
    }

    const executionId = uuidv4();
    const startedAt = new Date();

    // Initialize execution context
    const context: WorkflowContext = {
      input,
      results: {},
      metadata: {
        executionId,
        workflowId,
        correlationId: correlationId || executionId,
        startedAt,
      },
    };

    // Initialize execution status
    const execution: WorkflowExecutionStatus = {
      executionId,
      workflowId,
      workflowName: workflow.name,
      status: 'running',
      startedAt,
      progress: 0,
      currentSteps: [],
      completedSteps: [],
      failedSteps: [],
      skippedSteps: [],
      context,
      stepResults: new Map(),
    };

    this.executions.set(executionId, execution);

    // Publish workflow started event
    await this.publishWorkflowStarted(execution, workflow);

    // Execute workflow asynchronously
    this.runWorkflow(workflow, execution).catch(async (error) => {
      execution.status = 'failed';
      execution.error = String(error);
      execution.completedAt = new Date();
      execution.duration = execution.completedAt.getTime() - startedAt.getTime();

      await this.publishWorkflowFailed(execution, 'unknown', String(error));
    });

    return ok(executionId);
  }

  /**
   * Get workflow execution status
   */
  getWorkflowStatus(executionId: string): WorkflowExecutionStatus | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(executionId: string): Promise<Result<void, Error>> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return err(new Error(`Execution not found: ${executionId}`));
    }

    if (execution.status !== 'running' && execution.status !== 'paused') {
      return err(new Error(`Cannot cancel workflow in status: ${execution.status}`));
    }

    execution.status = 'cancelled';
    execution.completedAt = new Date();
    execution.duration =
      execution.completedAt.getTime() - execution.startedAt.getTime();

    // Publish cancellation event
    await this.publishEvent(
      WorkflowEvents.WorkflowCancelled,
      {
        executionId,
        workflowId: execution.workflowId,
        workflowName: execution.workflowName,
      },
      execution.context.metadata.correlationId
    );

    return ok(undefined);
  }

  /**
   * Pause a running workflow
   */
  async pauseWorkflow(executionId: string): Promise<Result<void, Error>> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return err(new Error(`Execution not found: ${executionId}`));
    }

    if (execution.status !== 'running') {
      return err(new Error(`Cannot pause workflow in status: ${execution.status}`));
    }

    execution.status = 'paused';
    return ok(undefined);
  }

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(executionId: string): Promise<Result<void, Error>> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return err(new Error(`Execution not found: ${executionId}`));
    }

    if (execution.status !== 'paused') {
      return err(new Error(`Cannot resume workflow in status: ${execution.status}`));
    }

    const workflow = this.workflows.get(execution.workflowId);
    if (!workflow) {
      return err(new Error(`Workflow definition not found: ${execution.workflowId}`));
    }

    execution.status = 'running';

    // Continue execution from where it was paused
    this.runWorkflow(workflow, execution).catch(async (error) => {
      execution.status = 'failed';
      execution.error = String(error);
    });

    return ok(undefined);
  }

  /**
   * List registered workflows
   */
  listWorkflows(): WorkflowListItem[] {
    return Array.from(this.workflows.values()).map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      version: w.version,
      stepCount: w.steps.length,
      tags: w.tags,
      triggers: w.triggers?.map((t) => t.eventType),
    }));
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): WorkflowExecutionStatus[] {
    return Array.from(this.executions.values()).filter(
      (e) => e.status === 'running' || e.status === 'paused'
    );
  }

  /**
   * Get workflow definition
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  // ============================================================================
  // Private Methods - Workflow Execution
  // ============================================================================

  private async runWorkflow(
    workflow: WorkflowDefinition,
    execution: WorkflowExecutionStatus
  ): Promise<void> {
    const timeout = workflow.timeout || this.config.defaultWorkflowTimeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Workflow timeout after ${timeout}ms`)),
        timeout
      );
    });

    try {
      await Promise.race([
        this.executeSteps(workflow, execution),
        timeoutPromise,
      ]);

      if (execution.status === 'running') {
        execution.status = 'completed';
        execution.completedAt = new Date();
        execution.duration =
          execution.completedAt.getTime() - execution.startedAt.getTime();
        execution.progress = 100;

        await this.publishWorkflowCompleted(execution);
      }
    } catch (error) {
      if (execution.status === 'running') {
        execution.status = 'failed';
        execution.error = String(error);
        execution.completedAt = new Date();
        execution.duration =
          execution.completedAt.getTime() - execution.startedAt.getTime();

        const failedStep = execution.currentSteps[0] || 'unknown';
        await this.publishWorkflowFailed(execution, failedStep, String(error));
      }
    }

    // Persist execution if configured
    if (this.config.persistExecutions) {
      await this.persistExecution(execution);
    }
  }

  private async executeSteps(
    workflow: WorkflowDefinition,
    execution: WorkflowExecutionStatus
  ): Promise<void> {
    const steps = workflow.steps;
    const completedSteps = new Set(execution.completedSteps);
    const skippedSteps = new Set(execution.skippedSteps);
    const failedSteps = new Set(execution.failedSteps);

    // Build dependency graph
    const pendingSteps = steps.filter(
      (s) =>
        !completedSteps.has(s.id) &&
        !skippedSteps.has(s.id) &&
        !failedSteps.has(s.id)
    );

    while (pendingSteps.length > 0 && execution.status === 'running') {
      // Find steps that are ready to execute (all dependencies satisfied)
      const readySteps = pendingSteps.filter((step) => {
        const deps = step.dependsOn || [];
        return deps.every(
          (depId) => completedSteps.has(depId) || skippedSteps.has(depId)
        );
      });

      if (readySteps.length === 0) {
        // Deadlock or all remaining steps have failed dependencies
        break;
      }

      // Determine execution mode
      const parallelSteps = readySteps.filter((s) => !s.dependsOn?.length);
      const sequentialSteps = readySteps.filter((s) => s.dependsOn?.length);

      // Execute parallel steps concurrently
      if (parallelSteps.length > 0) {
        execution.currentSteps = parallelSteps.map((s) => s.id);

        const results = await Promise.allSettled(
          parallelSteps.map((step) =>
            this.executeStep(step, execution, workflow)
          )
        );

        for (let i = 0; i < parallelSteps.length; i++) {
          const step = parallelSteps[i];
          const result = results[i];

          if (result.status === 'fulfilled') {
            const stepResult = result.value;
            if (stepResult.status === 'completed') {
              completedSteps.add(step.id);
              execution.completedSteps.push(step.id);
            } else if (stepResult.status === 'skipped') {
              skippedSteps.add(step.id);
              execution.skippedSteps.push(step.id);
            } else if (stepResult.status === 'failed') {
              failedSteps.add(step.id);
              execution.failedSteps.push(step.id);

              if (!step.continueOnFailure) {
                execution.status = 'failed';
                execution.error = stepResult.error;
                return;
              }
            }
          } else {
            failedSteps.add(step.id);
            execution.failedSteps.push(step.id);

            if (!step.continueOnFailure) {
              execution.status = 'failed';
              execution.error = result.reason?.message || 'Unknown error';
              return;
            }
          }

          // Remove from pending
          const pendingIndex = pendingSteps.indexOf(step);
          if (pendingIndex !== -1) {
            pendingSteps.splice(pendingIndex, 1);
          }
        }
      }

      // Execute sequential steps one at a time
      for (const step of sequentialSteps) {
        if (execution.status !== 'running') break;

        execution.currentSteps = [step.id];

        const stepResult = await this.executeStep(step, execution, workflow);

        if (stepResult.status === 'completed') {
          completedSteps.add(step.id);
          execution.completedSteps.push(step.id);
        } else if (stepResult.status === 'skipped') {
          skippedSteps.add(step.id);
          execution.skippedSteps.push(step.id);
        } else if (stepResult.status === 'failed') {
          failedSteps.add(step.id);
          execution.failedSteps.push(step.id);

          if (!step.continueOnFailure) {
            execution.status = 'failed';
            execution.error = stepResult.error;
            return;
          }
        }

        // Remove from pending
        const pendingIndex = pendingSteps.indexOf(step);
        if (pendingIndex !== -1) {
          pendingSteps.splice(pendingIndex, 1);
        }
      }

      // Update progress
      const totalSteps = steps.length;
      const processedSteps =
        completedSteps.size + skippedSteps.size + failedSteps.size;
      execution.progress = Math.round((processedSteps / totalSteps) * 100);
    }

    execution.currentSteps = [];
  }

  private async executeStep(
    step: WorkflowStepDefinition,
    execution: WorkflowExecutionStatus,
    _workflow: WorkflowDefinition
  ): Promise<StepExecutionResult> {
    const startedAt = new Date();
    const result: StepExecutionResult = {
      stepId: step.id,
      status: 'pending',
      startedAt,
    };

    try {
      // Check skip condition
      if (step.skipCondition && this.evaluateCondition(step.skipCondition, execution.context)) {
        result.status = 'skipped';
        result.completedAt = new Date();
        result.duration = result.completedAt.getTime() - startedAt.getTime();
        execution.stepResults.set(step.id, result);

        await this.publishStepSkipped(execution, step);
        return result;
      }

      // Check execution condition
      if (step.condition && !this.evaluateCondition(step.condition, execution.context)) {
        result.status = 'skipped';
        result.completedAt = new Date();
        result.duration = result.completedAt.getTime() - startedAt.getTime();
        execution.stepResults.set(step.id, result);

        await this.publishStepSkipped(execution, step);
        return result;
      }

      result.status = 'running';
      await this.publishStepStarted(execution, step);

      // Build input from mapping
      const input = this.buildStepInput(step, execution.context);

      // Execute with retry logic
      let lastError: Error | undefined;
      const maxAttempts = step.retry?.maxAttempts || 1;
      let backoffMs = step.retry?.backoffMs || 1000;
      const backoffMultiplier = step.retry?.backoffMultiplier || 2;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        result.retryCount = attempt - 1;

        try {
          const stepTimeout = step.timeout || this.config.defaultStepTimeout;
          const output = await this.executeStepAction(
            step,
            input,
            execution.context,
            stepTimeout
          );

          // Map output to context
          this.mapStepOutput(step, output, execution.context);

          result.status = 'completed';
          result.output = output;
          result.completedAt = new Date();
          result.duration = result.completedAt.getTime() - startedAt.getTime();
          execution.stepResults.set(step.id, result);

          await this.publishStepCompleted(execution, step, result);
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt < maxAttempts) {
            await this.delay(backoffMs);
            backoffMs *= backoffMultiplier;
          }
        }
      }

      // All retries failed
      result.status = 'failed';
      result.error = lastError?.message || 'Unknown error';
      result.completedAt = new Date();
      result.duration = result.completedAt.getTime() - startedAt.getTime();
      execution.stepResults.set(step.id, result);

      // Execute rollback if defined
      if (step.rollback) {
        await this.executeRollback(step.rollback, execution.context);
      }

      await this.publishStepFailed(execution, step, result.error);
      return result;
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      result.completedAt = new Date();
      result.duration = result.completedAt.getTime() - startedAt.getTime();
      execution.stepResults.set(step.id, result);

      await this.publishStepFailed(execution, step, result.error);
      return result;
    }
  }

  private async executeStepAction(
    step: WorkflowStepDefinition,
    input: Record<string, unknown>,
    context: WorkflowContext,
    timeout: number
  ): Promise<unknown> {
    // Check if action is registered
    const domainActions = this.actionRegistry[step.domain];
    if (domainActions?.[step.action]) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Step timeout after ${timeout}ms`)), timeout);
      });

      const actionResult = await Promise.race([
        domainActions[step.action](input, context),
        timeoutPromise,
      ]);

      if (!actionResult.success) {
        throw actionResult.error;
      }

      return actionResult.value;
    }

    // No action registered - throw error rather than fake success
    throw new Error(
      `Action '${step.action}' not registered for domain '${step.domain}'. ` +
      `Register it using orchestrator.registerAction('${step.domain}', '${step.action}', handler)`
    );
  }

  /**
   * Check if an action is registered for a domain
   */
  isActionRegistered(domain: DomainName, action: string): boolean {
    return !!this.actionRegistry[domain]?.[action];
  }

  /**
   * Get all registered actions for a domain
   */
  getRegisteredActions(domain: DomainName): string[] {
    return Object.keys(this.actionRegistry[domain] || {});
  }

  /**
   * Get all domains with registered actions
   */
  getDomainsWithActions(): DomainName[] {
    return Object.keys(this.actionRegistry) as DomainName[];
  }

  /**
   * Spawn a workflow agent for complex step execution
   * Used when steps require dedicated agent resources
   */
  async spawnWorkflowAgent(
    workflowId: string,
    stepId: string,
    domain: DomainName
  ): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) {
      return err(new Error('Agent limit reached'));
    }

    return this.agentCoordinator.spawn({
      name: `workflow-agent-${workflowId.slice(0, 8)}-${stepId}`,
      domain,
      type: 'coordinator',
      capabilities: ['workflow-execution', stepId],
      config: {
        workflowId,
        stepId,
      },
    });
  }

  /**
   * Stop a workflow agent after step completion
   */
  async stopWorkflowAgent(agentId: string): Promise<Result<void, Error>> {
    return this.agentCoordinator.stop(agentId);
  }

  /**
   * Get the number of agents available for workflow execution
   */
  getAvailableAgentCapacity(): number {
    return this.agentCoordinator.canSpawn()
      ? this.config.maxConcurrentWorkflows - this.getActiveExecutions().length
      : 0;
  }

  private async executeRollback(
    rollback: { domain: DomainName; action: string; input?: Record<string, unknown> },
    context: WorkflowContext
  ): Promise<void> {
    try {
      // Check if rollback action is registered
      const domainActions = this.actionRegistry[rollback.domain];
      if (!domainActions?.[rollback.action]) {
        console.warn(
          `Rollback action '${rollback.action}' not registered for domain '${rollback.domain}'. Skipping rollback.`
        );
        return;
      }

      // Execute rollback action
      const result = await domainActions[rollback.action](
        rollback.input || {},
        context
      );

      if (!result.success) {
        console.error(
          `Rollback failed for ${rollback.domain}.${rollback.action}:`,
          result.error
        );
      }
    } catch (error) {
      // Log but don't throw - rollback failures shouldn't cascade
      console.error(`Rollback failed for ${rollback.domain}.${rollback.action}:`, error);
    }
  }

  // ============================================================================
  // Private Methods - Input/Output Mapping
  // ============================================================================

  private buildStepInput(
    step: WorkflowStepDefinition,
    context: WorkflowContext
  ): Record<string, unknown> {
    const input: Record<string, unknown> = {};

    if (step.inputMapping) {
      for (const [targetKey, sourcePath] of Object.entries(step.inputMapping)) {
        const value = this.getValueByPath(context, sourcePath);
        if (value !== undefined) {
          input[targetKey] = value;
        }
      }
    }

    return input;
  }

  private mapStepOutput(
    step: WorkflowStepDefinition,
    output: unknown,
    context: WorkflowContext
  ): void {
    // Store raw output
    context.results[step.id] = output;

    // Apply output mapping
    if (step.outputMapping && typeof output === 'object' && output !== null) {
      for (const [sourcePath, targetPath] of Object.entries(step.outputMapping)) {
        const value = this.getValueByPath(output, sourcePath);
        if (value !== undefined) {
          this.setValueByPath(context.results, targetPath, value);
        }
      }
    }
  }

  private getValueByPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private setValueByPath(
    obj: Record<string, unknown>,
    path: string,
    value: unknown
  ): void {
    const parts = path.split('.');

    // Guard against prototype pollution - check ALL parts before any assignment
    const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
    for (const part of parts) {
      if (dangerousKeys.has(part)) {
        throw new Error(`Invalid path: contains dangerous prototype key`);
      }
    }

    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      // CodeQL fix: Immediate dangerous key check before property access
      if (dangerousKeys.has(part)) {
        throw new Error(`Invalid path segment: '${part}' is a dangerous prototype key`);
      }
      // Use Object.hasOwn for safe property check
      if (!Object.hasOwn(current, part)) {
        // Use Object.defineProperty for safe assignment
        Object.defineProperty(current, part, {
          value: Object.create(null),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      current = current[part] as Record<string, unknown>;
    }

    const finalKey = parts[parts.length - 1];
    // CodeQL fix: Immediate dangerous key check before Object.defineProperty
    if (dangerousKeys.has(finalKey)) {
      throw new Error(`Invalid final key: '${finalKey}' is a dangerous prototype key`);
    }
    // Use Object.defineProperty for safe final assignment
    // CodeQL: False positive - finalKey validated against dangerousKeys Set above
    // lgtm[js/prototype-pollution-utility]
    Object.defineProperty(current, finalKey, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  // ============================================================================
  // Private Methods - Condition Evaluation
  // ============================================================================

  private evaluateCondition(
    condition: StepCondition,
    context: WorkflowContext
  ): boolean {
    const value = this.getValueByPath(context, condition.path);

    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'neq':
        return value !== condition.value;
      case 'gt':
        return typeof value === 'number' && value > (condition.value as number);
      case 'gte':
        return typeof value === 'number' && value >= (condition.value as number);
      case 'lt':
        return typeof value === 'number' && value < (condition.value as number);
      case 'lte':
        return typeof value === 'number' && value <= (condition.value as number);
      case 'contains':
        if (Array.isArray(value)) {
          return value.includes(condition.value);
        }
        if (typeof value === 'string') {
          return value.includes(String(condition.value));
        }
        return false;
      case 'exists':
        return value !== undefined && value !== null;
      default:
        return false;
    }
  }

  // ============================================================================
  // Private Methods - Event Publishing
  // ============================================================================

  private async publishEvent<T>(
    type: string,
    payload: T,
    correlationId?: string
  ): Promise<void> {
    const event = createEvent(
      type,
      'learning-optimization' as DomainName, // Workflow orchestrator publishes as coordination
      payload,
      correlationId
    );
    await this.eventBus.publish(event);
  }

  private async publishWorkflowStarted(
    execution: WorkflowExecutionStatus,
    workflow: WorkflowDefinition
  ): Promise<void> {
    await this.publishEvent<WorkflowStartedPayload>(
      WorkflowEvents.WorkflowStarted,
      {
        executionId: execution.executionId,
        workflowId: execution.workflowId,
        workflowName: execution.workflowName,
        stepCount: workflow.steps.length,
      },
      execution.context.metadata.correlationId
    );
  }

  private async publishWorkflowCompleted(
    execution: WorkflowExecutionStatus
  ): Promise<void> {
    await this.publishEvent<WorkflowCompletedPayload>(
      WorkflowEvents.WorkflowCompleted,
      {
        executionId: execution.executionId,
        workflowId: execution.workflowId,
        workflowName: execution.workflowName,
        duration: execution.duration || 0,
        completedSteps: execution.completedSteps.length,
        skippedSteps: execution.skippedSteps.length,
      },
      execution.context.metadata.correlationId
    );
  }

  private async publishWorkflowFailed(
    execution: WorkflowExecutionStatus,
    failedStep: string,
    error: string
  ): Promise<void> {
    await this.publishEvent<WorkflowFailedPayload>(
      WorkflowEvents.WorkflowFailed,
      {
        executionId: execution.executionId,
        workflowId: execution.workflowId,
        workflowName: execution.workflowName,
        failedStep,
        error,
      },
      execution.context.metadata.correlationId
    );
  }

  private async publishStepStarted(
    execution: WorkflowExecutionStatus,
    step: WorkflowStepDefinition
  ): Promise<void> {
    await this.publishEvent<StepEventPayload>(
      WorkflowEvents.StepStarted,
      {
        executionId: execution.executionId,
        workflowId: execution.workflowId,
        stepId: step.id,
        stepName: step.name,
        domain: step.domain,
      },
      execution.context.metadata.correlationId
    );
  }

  private async publishStepCompleted(
    execution: WorkflowExecutionStatus,
    step: WorkflowStepDefinition,
    result: StepExecutionResult
  ): Promise<void> {
    await this.publishEvent(
      WorkflowEvents.StepCompleted,
      {
        executionId: execution.executionId,
        workflowId: execution.workflowId,
        stepId: step.id,
        stepName: step.name,
        domain: step.domain,
        duration: result.duration,
      },
      execution.context.metadata.correlationId
    );
  }

  private async publishStepFailed(
    execution: WorkflowExecutionStatus,
    step: WorkflowStepDefinition,
    error: string
  ): Promise<void> {
    await this.publishEvent(
      WorkflowEvents.StepFailed,
      {
        executionId: execution.executionId,
        workflowId: execution.workflowId,
        stepId: step.id,
        stepName: step.name,
        domain: step.domain,
        error,
      },
      execution.context.metadata.correlationId
    );
  }

  private async publishStepSkipped(
    execution: WorkflowExecutionStatus,
    step: WorkflowStepDefinition
  ): Promise<void> {
    await this.publishEvent<StepEventPayload>(
      WorkflowEvents.StepSkipped,
      {
        executionId: execution.executionId,
        workflowId: execution.workflowId,
        stepId: step.id,
        stepName: step.name,
        domain: step.domain,
      },
      execution.context.metadata.correlationId
    );
  }

  // ============================================================================
  // Private Methods - Workflow Validation
  // ============================================================================

  private validateWorkflowDefinition(
    definition: WorkflowDefinition
  ): Result<void, Error> {
    if (!definition.id) {
      return err(new Error('Workflow ID is required'));
    }

    if (!definition.name) {
      return err(new Error('Workflow name is required'));
    }

    if (!definition.steps || definition.steps.length === 0) {
      return err(new Error('Workflow must have at least one step'));
    }

    // Validate steps
    const stepIds = new Set<string>();
    for (const step of definition.steps) {
      if (!step.id) {
        return err(new Error('Step ID is required'));
      }

      if (stepIds.has(step.id)) {
        return err(new Error(`Duplicate step ID: ${step.id}`));
      }
      stepIds.add(step.id);

      if (!step.domain) {
        return err(new Error(`Step ${step.id} must have a domain`));
      }

      if (!ALL_DOMAINS.includes(step.domain)) {
        return err(new Error(`Invalid domain for step ${step.id}: ${step.domain}`));
      }

      if (!step.action) {
        return err(new Error(`Step ${step.id} must have an action`));
      }

      // Validate dependencies
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (!definition.steps.some((s) => s.id === dep)) {
            return err(
              new Error(`Step ${step.id} depends on unknown step: ${dep}`)
            );
          }
        }
      }
    }

    // Check for circular dependencies
    const circularCheck = this.detectCircularDependencies(definition.steps);
    if (circularCheck) {
      return err(new Error(`Circular dependency detected: ${circularCheck}`));
    }

    return ok(undefined);
  }

  private detectCircularDependencies(
    steps: WorkflowStepDefinition[]
  ): string | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const visit = (stepId: string, path: string[]): string | null => {
      if (recursionStack.has(stepId)) {
        return [...path, stepId].join(' -> ');
      }

      if (visited.has(stepId)) {
        return null;
      }

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = steps.find((s) => s.id === stepId);
      if (step?.dependsOn) {
        for (const dep of step.dependsOn) {
          const result = visit(dep, [...path, stepId]);
          if (result) return result;
        }
      }

      recursionStack.delete(stepId);
      return null;
    };

    for (const step of steps) {
      const result = visit(step.id, []);
      if (result) return result;
    }

    return null;
  }

  // ============================================================================
  // Private Methods - Event Triggers
  // ============================================================================

  private setupEventTriggers(): void {
    // Subscribe to all domain events for trigger matching
    const subscription = this.eventBus.subscribe('*', async (event: DomainEvent) => {
      await this.handleEventForTriggers(event);
    });

    this.eventSubscriptions.push(subscription);
  }

  private registerWorkflowTriggers(_workflow: WorkflowDefinition): void {
    // Triggers are evaluated when events arrive via the * subscription
    // No additional subscription needed, just store the workflow with triggers
  }

  private async handleEventForTriggers(event: DomainEvent): Promise<void> {
    for (const workflow of this.workflows.values()) {
      if (!workflow.triggers) continue;

      for (const trigger of workflow.triggers) {
        // Match event type
        if (trigger.eventType !== event.type) continue;

        // Match source domain
        if (trigger.sourceDomain && trigger.sourceDomain !== event.source) continue;

        // Evaluate condition if present
        if (trigger.condition) {
          const context: WorkflowContext = {
            input: { event: event.payload },
            results: {},
            metadata: {
              executionId: '',
              workflowId: workflow.id,
              startedAt: new Date(),
            },
          };

          if (!this.evaluateCondition(trigger.condition, context)) {
            continue;
          }
        }

        // Build input from trigger mapping
        const input: Record<string, unknown> = {};
        if (trigger.inputMapping) {
          for (const [targetKey, sourcePath] of Object.entries(trigger.inputMapping)) {
            const value = this.getValueByPath({ event: event.payload }, sourcePath);
            if (value !== undefined) {
              input[targetKey] = value;
            }
          }
        } else {
          // Default: pass entire payload as input
          input.triggerEvent = event.payload;
        }

        // Execute workflow
        await this.executeWorkflow(workflow.id, input, event.correlationId);
      }
    }
  }

  // ============================================================================
  // Private Methods - Built-in Workflows
  // ============================================================================

  private registerBuiltInWorkflows(): void {
    // 1. Comprehensive Testing Workflow
    this.registerWorkflow({
      id: 'comprehensive-testing',
      name: 'Comprehensive Testing Workflow',
      description:
        'test-generation -> test-execution -> coverage-analysis -> quality-assessment',
      version: '1.0.0',
      tags: ['testing', 'quality'],
      steps: [
        {
          id: 'generate-tests',
          name: 'Generate Tests',
          domain: 'test-generation',
          action: 'generateTests',
          inputMapping: {
            sourceFiles: 'input.sourceFiles',
            framework: 'input.framework',
          },
          outputMapping: {
            testFiles: 'generatedTests.files',
            testCount: 'generatedTests.count',
          },
          timeout: 120000,
          retry: { maxAttempts: 2, backoffMs: 1000 },
        },
        {
          id: 'execute-tests',
          name: 'Execute Tests',
          domain: 'test-execution',
          action: 'execute',
          dependsOn: ['generate-tests'],
          inputMapping: {
            testFiles: 'results.generatedTests.files',
          },
          outputMapping: {
            runId: 'execution.runId',
            passed: 'execution.passed',
            failed: 'execution.failed',
          },
          timeout: 300000,
        },
        {
          id: 'analyze-coverage',
          name: 'Analyze Coverage',
          domain: 'coverage-analysis',
          action: 'analyze',
          dependsOn: ['execute-tests'],
          inputMapping: {
            runId: 'results.execution.runId',
          },
          outputMapping: {
            line: 'coverage.line',
            branch: 'coverage.branch',
            overall: 'coverage.overall',
          },
        },
        {
          id: 'assess-quality',
          name: 'Assess Quality',
          domain: 'quality-assessment',
          action: 'evaluateGate',
          dependsOn: ['analyze-coverage'],
          inputMapping: {
            coverage: 'results.coverage',
            testResults: 'results.execution',
          },
          outputMapping: {
            passed: 'quality.gatePassed',
            score: 'quality.score',
          },
        },
        {
          id: 'generate-more-tests',
          name: 'Generate Additional Tests',
          domain: 'test-generation',
          action: 'generateTests',
          dependsOn: ['analyze-coverage'],
          condition: {
            path: 'results.coverage.overall',
            operator: 'lt',
            value: 80,
          },
          inputMapping: {
            sourceFiles: 'input.sourceFiles',
            targetCoverage: 'input.targetCoverage',
          },
          continueOnFailure: true,
        },
      ],
    });

    // 2. Defect Prevention Workflow
    this.registerWorkflow({
      id: 'defect-prevention',
      name: 'Defect Prevention Workflow',
      description:
        'code-intelligence (impact) -> defect-intelligence (predict) -> test-generation (for risky areas)',
      version: '1.0.0',
      tags: ['defect', 'prevention', 'ai'],
      steps: [
        {
          id: 'analyze-impact',
          name: 'Analyze Code Impact',
          domain: 'code-intelligence',
          action: 'analyzeImpact',
          inputMapping: {
            changedFiles: 'input.changedFiles',
          },
          outputMapping: {
            impactedFiles: 'impact.files',
            impactedTests: 'impact.tests',
            riskLevel: 'impact.riskLevel',
          },
          timeout: 60000,
        },
        {
          id: 'predict-defects',
          name: 'Predict Defects',
          domain: 'defect-intelligence',
          action: 'predictDefects',
          dependsOn: ['analyze-impact'],
          inputMapping: {
            files: 'results.impact.files',
          },
          outputMapping: {
            predictions: 'defects.predictions',
            highRiskFiles: 'defects.highRiskFiles',
          },
        },
        {
          id: 'generate-targeted-tests',
          name: 'Generate Targeted Tests',
          domain: 'test-generation',
          action: 'generateTests',
          dependsOn: ['predict-defects'],
          condition: {
            path: 'results.defects.highRiskFiles',
            operator: 'exists',
            value: true,
          },
          inputMapping: {
            sourceFiles: 'results.defects.highRiskFiles',
            priority: 'input.priority',
          },
        },
      ],
      triggers: [
        {
          eventType: 'code-intelligence.ImpactAnalysisCompleted',
          inputMapping: {
            changedFiles: 'event.changedFiles',
          },
        },
      ],
    });

    // 3. Pre-Release Workflow
    this.registerWorkflow({
      id: 'pre-release',
      name: 'Pre-Release Workflow',
      description: 'security-audit -> quality-gate -> deployment-advisor',
      version: '1.0.0',
      tags: ['release', 'security', 'deployment'],
      steps: [
        {
          id: 'security-audit',
          name: 'Security Audit',
          domain: 'security-compliance',
          action: 'runAudit',
          inputMapping: {
            targetFiles: 'input.targetFiles',
            includeDependencies: 'input.includeDependencies',
          },
          outputMapping: {
            vulnerabilities: 'security.vulnerabilities',
            riskScore: 'security.riskScore',
            passed: 'security.passed',
          },
          timeout: 180000,
        },
        {
          id: 'quality-gate',
          name: 'Quality Gate Evaluation',
          domain: 'quality-assessment',
          action: 'evaluateGate',
          dependsOn: ['security-audit'],
          inputMapping: {
            securityResults: 'results.security',
            releaseCandidate: 'input.releaseCandidate',
          },
          outputMapping: {
            passed: 'quality.gatePassed',
            checks: 'quality.checks',
          },
        },
        {
          id: 'deployment-advice',
          name: 'Get Deployment Advice',
          domain: 'quality-assessment',
          action: 'getDeploymentAdvice',
          dependsOn: ['quality-gate'],
          inputMapping: {
            releaseCandidate: 'input.releaseCandidate',
            qualityResults: 'results.quality',
            securityResults: 'results.security',
          },
          outputMapping: {
            decision: 'deployment.decision',
            recommendations: 'deployment.recommendations',
            riskScore: 'deployment.riskScore',
          },
        },
      ],
      triggers: [
        {
          eventType: 'quality-assessment.QualityGateEvaluated',
          condition: {
            path: 'event.passed',
            operator: 'eq',
            value: true,
          },
        },
      ],
    });

    // 4. Continuous Learning Workflow
    this.registerWorkflow({
      id: 'continuous-learning',
      name: 'Continuous Learning Workflow',
      description: 'Collect patterns -> consolidate -> transfer -> optimize',
      version: '1.0.0',
      tags: ['learning', 'optimization', 'ai'],
      steps: [
        {
          id: 'collect-patterns',
          name: 'Collect Patterns',
          domain: 'learning-optimization',
          action: 'runLearningCycle',
          inputMapping: {
            domain: 'input.targetDomain',
          },
          outputMapping: {
            patternsLearned: 'learning.patterns',
            experiencesProcessed: 'learning.experiences',
          },
        },
        {
          id: 'consolidate-patterns',
          name: 'Consolidate Patterns',
          domain: 'learning-optimization',
          action: 'shareCrossDomainLearnings',
          dependsOn: ['collect-patterns'],
          condition: {
            path: 'results.learning.patterns',
            operator: 'gt',
            value: 0,
          },
          outputMapping: {
            knowledgeShared: 'consolidation.shared',
            domainsUpdated: 'consolidation.domains',
          },
        },
        {
          id: 'transfer-knowledge',
          name: 'Transfer Knowledge',
          domain: 'learning-optimization',
          action: 'shareCrossDomainLearnings',
          dependsOn: ['consolidate-patterns'],
          outputMapping: {
            transferSuccessRate: 'transfer.successRate',
            newPatternsCreated: 'transfer.newPatterns',
          },
        },
        {
          id: 'optimize-strategies',
          name: 'Optimize Strategies',
          domain: 'learning-optimization',
          action: 'optimizeAllStrategies',
          dependsOn: ['transfer-knowledge'],
          outputMapping: {
            domainsOptimized: 'optimization.domains',
            avgImprovement: 'optimization.improvement',
          },
        },
      ],
    });

    // 5. Morning Sync Protocol Workflow
    this.registerWorkflow({
      id: 'morning-sync',
      name: 'Morning Sync Protocol',
      description: 'Daily quality synchronization across all domains',
      version: '1.0.0',
      tags: ['protocol', 'daily', 'sync'],
      steps: [
        {
          id: 'collect-metrics',
          name: 'Collect Quality Metrics',
          domain: 'quality-assessment',
          action: 'analyzeQuality',
          inputMapping: {
            sourceFiles: 'input.sourceFiles',
          },
          outputMapping: {
            score: 'metrics.qualityScore',
          },
        },
        {
          id: 'analyze-trends',
          name: 'Analyze Coverage Trends',
          domain: 'coverage-analysis',
          action: 'getTrend',
          inputMapping: {
            timeRange: 'input.timeRange',
            granularity: 'input.granularity',
          },
          outputMapping: {
            trend: 'trends.coverage',
            forecast: 'trends.forecast',
          },
        },
        {
          id: 'check-security',
          name: 'Check Security Posture',
          domain: 'security-compliance',
          action: 'getSecurityPosture',
          outputMapping: {
            overallScore: 'security.score',
            criticalIssues: 'security.critical',
            recommendations: 'security.recommendations',
          },
        },
        {
          id: 'get-defect-predictions',
          name: 'Get Defect Predictions',
          domain: 'defect-intelligence',
          action: 'predictDefects',
          inputMapping: {
            files: 'input.changedFiles',
          },
          outputMapping: {
            predictions: 'defects.predictions',
          },
        },
        {
          id: 'generate-learning-report',
          name: 'Generate Learning Dashboard',
          domain: 'learning-optimization',
          action: 'getLearningDashboard',
          dependsOn: ['collect-metrics', 'analyze-trends', 'check-security', 'get-defect-predictions'],
          outputMapping: {
            learningRate: 'learning.rate',
            topDomains: 'learning.topDomains',
          },
        },
      ],
    });

    // 6. QCSD Ideation Swarm Workflow
    // Per QCSD framework: Quality Criteria sessions during PI/Sprint Planning
    // Primary: qe-quality-criteria-recommender (HTSM v6.3 analysis)
    // Supporting: testability-scoring, qe-risk-assessor, qe-requirements-validator
    // Enhanced: Supports live URL input - extracts website content for analysis
    this.registerWorkflow({
      id: 'qcsd-ideation-swarm',
      name: 'QCSD Ideation Swarm',
      description:
        'Quality Conscious Software Delivery ideation phase: [url-extraction] -> [flag-detection] -> quality-criteria (HTSM) -> [testability, risk, requirements, security*, accessibility*, qx*] in parallel -> aggregated report. Supports live website URLs with conditional agent spawning based on HAS_UI, HAS_SECURITY, HAS_UX flags.',
      version: '3.0.0',
      tags: ['qcsd', 'ideation', 'quality-criteria', 'htsm', 'shift-left', 'url-analysis'],
      steps: [
        // Step 0: Optional - Website Content Extraction (for URL input)
        {
          id: 'website-content-extraction',
          name: 'Website Content Extraction',
          domain: 'requirements-validation',
          action: 'extractWebsiteContent',
          inputMapping: {
            url: 'input.url',
          },
          outputMapping: {
            extractedDescription: 'extraction.description',
            extractedFeatures: 'extraction.features',
            extractedAcceptanceCriteria: 'extraction.acceptanceCriteria',
            detectedFlags: 'extraction.flags',
            isWebsite: 'extraction.isWebsite',
          },
          timeout: 60000, // 1 minute for URL fetch
          continueOnFailure: true, // Continue even if URL fetch fails
        },
        // Step 1: Primary - Quality Criteria Analysis (HTSM v6.3)
        {
          id: 'quality-criteria-analysis',
          name: 'HTSM Quality Criteria Analysis',
          domain: 'requirements-validation',
          action: 'analyzeQualityCriteria',
          dependsOn: ['website-content-extraction'],
          inputMapping: {
            targetId: 'input.targetId',
            targetType: 'input.targetType',
            // Use extracted description if available, otherwise use input
            description: 'results.website-content-extraction.extractedDescription || input.description',
            acceptanceCriteria: 'results.website-content-extraction.extractedAcceptanceCriteria || input.acceptanceCriteria',
          },
          outputMapping: {
            qualityCriteria: 'qualityCriteria.criteria',
            qualityScore: 'qualityCriteria.score',
          },
          timeout: 180000, // 3 minutes for deep analysis
          retry: { maxAttempts: 2, backoffMs: 2000 },
        },
        // Step 2a: Parallel - Testability Scoring
        {
          id: 'testability-assessment',
          name: 'Testability Scoring (10 Principles)',
          domain: 'requirements-validation',
          action: 'assessTestability',
          dependsOn: ['quality-criteria-analysis'],
          inputMapping: {
            targetId: 'input.targetId',
            description: 'results.website-content-extraction.extractedDescription || input.description',
            acceptanceCriteria: 'results.website-content-extraction.extractedAcceptanceCriteria || input.acceptanceCriteria',
          },
          outputMapping: {
            overallScore: 'testability.overallScore',
            principles: 'testability.principles',
            blockers: 'testability.blockers',
            recommendations: 'testability.recommendations',
          },
          timeout: 120000,
          continueOnFailure: true, // Don't block other assessments
        },
        // Step 2b: Parallel - Risk Assessment
        {
          id: 'risk-assessment',
          name: 'Quality Risk Assessment',
          domain: 'requirements-validation',
          action: 'assessRisks',
          dependsOn: ['quality-criteria-analysis'],
          inputMapping: {
            targetId: 'input.targetId',
            targetType: 'input.targetType',
            description: 'results.website-content-extraction.extractedDescription || input.description',
          },
          outputMapping: {
            overallRisk: 'risks.overallRisk',
            riskScore: 'risks.riskScore',
            factors: 'risks.factors',
            mitigations: 'risks.mitigations',
          },
          timeout: 90000,
          continueOnFailure: true,
        },
        // Step 2c: Parallel - Requirements Validation
        {
          id: 'requirements-validation',
          name: 'Requirements & Acceptance Criteria Validation',
          domain: 'requirements-validation',
          action: 'validateRequirements',
          dependsOn: ['quality-criteria-analysis'],
          inputMapping: {
            targetId: 'input.targetId',
            description: 'results.website-content-extraction.extractedDescription || input.description',
            acceptanceCriteria: 'results.website-content-extraction.extractedAcceptanceCriteria || input.acceptanceCriteria',
          },
          outputMapping: {
            valid: 'requirements.valid',
            issues: 'requirements.issues',
            suggestions: 'requirements.suggestions',
          },
          timeout: 90000,
          continueOnFailure: true,
        },
        // Step 3a: Optional - Security Threat Modeling (if HAS_SECURITY flag is true)
        {
          id: 'security-threat-modeling',
          name: 'Early Security Threat Modeling (STRIDE)',
          domain: 'security-compliance',
          action: 'modelSecurityThreats',
          dependsOn: ['quality-criteria-analysis'],
          // Trigger if explicitly requested OR if website extraction detected security features
          condition: {
            path: 'results.website-content-extraction.detectedFlags.hasSecurity || input.securityCritical',
            operator: 'eq',
            value: true,
          },
          inputMapping: {
            targetId: 'input.targetId',
            description: 'results.website-content-extraction.extractedDescription || input.description',
            securityCritical: 'results.website-content-extraction.detectedFlags.hasSecurity || input.securityCritical',
          },
          outputMapping: {
            threats: 'security.threats',
            overallRisk: 'security.overallRisk',
            recommendations: 'security.recommendations',
          },
          timeout: 120000,
          continueOnFailure: true,
        },
        // Step 3b: Optional - Accessibility Audit (if HAS_UI flag is true)
        {
          id: 'accessibility-audit',
          name: 'Accessibility Audit (WCAG 2.2)',
          domain: 'visual-accessibility',
          action: 'auditAccessibility',
          dependsOn: ['quality-criteria-analysis'],
          // Trigger if website has UI components
          condition: {
            path: 'results.website-content-extraction.detectedFlags.hasUI || input.hasUI',
            operator: 'eq',
            value: true,
          },
          inputMapping: {
            targetId: 'input.targetId',
            url: 'input.url',
            description: 'results.website-content-extraction.extractedDescription || input.description',
            features: 'results.website-content-extraction.extractedFeatures',
          },
          outputMapping: {
            wcagLevel: 'accessibility.wcagLevel',
            violations: 'accessibility.violations',
            recommendations: 'accessibility.recommendations',
          },
          timeout: 180000, // 3 minutes for comprehensive audit
          continueOnFailure: true,
        },
        // Step 3c: Optional - Quality Experience Analysis (if HAS_UX flag is true)
        {
          id: 'quality-experience-analysis',
          name: 'Quality Experience Analysis (QX Partner)',
          domain: 'cross-domain',
          action: 'analyzeQualityExperience',
          dependsOn: ['quality-criteria-analysis'],
          // Trigger if website has UX concerns
          condition: {
            path: 'results.website-content-extraction.detectedFlags.hasUX || input.hasUX',
            operator: 'eq',
            value: true,
          },
          inputMapping: {
            targetId: 'input.targetId',
            url: 'input.url',
            description: 'results.website-content-extraction.extractedDescription || input.description',
            features: 'results.website-content-extraction.extractedFeatures',
          },
          outputMapping: {
            journeys: 'qx.journeys',
            frictionPoints: 'qx.frictionPoints',
            recommendations: 'qx.recommendations',
          },
          timeout: 150000,
          continueOnFailure: true,
        },
        // Step 4: Aggregate Ideation Report (waits for all parallel assessments)
        {
          id: 'aggregate-ideation-report',
          name: 'Generate Ideation Report',
          domain: 'requirements-validation',
          action: 'generateIdeationReport',
          dependsOn: [
            'quality-criteria-analysis',
            'testability-assessment',
            'risk-assessment',
            'requirements-validation',
            'security-threat-modeling', // Optional - may be skipped
            'accessibility-audit', // Optional - may be skipped
            'quality-experience-analysis', // Optional - may be skipped
          ],
          inputMapping: {
            targetId: 'input.targetId',
            targetType: 'input.targetType',
          },
          outputMapping: {
            report: 'ideation.report',
            readyForDevelopment: 'ideation.readyForDevelopment',
            blockers: 'ideation.blockers',
            recommendations: 'ideation.recommendations',
            testStrategy: 'ideation.testStrategy',
          },
          timeout: 60000,
        },
        // Step 5: Store learnings for cross-phase feedback
        {
          id: 'store-ideation-learnings',
          name: 'Store Ideation Learnings',
          domain: 'learning-optimization',
          action: 'storeIdeationLearnings',
          dependsOn: ['aggregate-ideation-report'],
          inputMapping: {
            targetId: 'input.targetId',
            report: 'results.ideation.report',
          },
          outputMapping: {
            stored: 'learning.stored',
            patternId: 'learning.patternId',
          },
          continueOnFailure: true,
        },
      ],
      triggers: [
        {
          eventType: 'requirements-validation.EpicCreated',
          inputMapping: {
            targetId: 'event.epicId',
            targetType: 'event.type',
            description: 'event.description',
            acceptanceCriteria: 'event.acceptanceCriteria',
          },
        },
        {
          eventType: 'requirements-validation.SprintPlanningStarted',
          inputMapping: {
            targetId: 'event.sprintId',
            targetType: 'event.type',
            description: 'event.description',
            acceptanceCriteria: 'event.acceptanceCriteria',
          },
        },
      ],
    });
  }

  // ============================================================================
  // Private Methods - Persistence
  // ============================================================================

  private async loadPersistedWorkflows(): Promise<void> {
    try {
      const keys = await this.memory.search('workflow:definition:*', 100);

      for (const key of keys) {
        const definition = await this.memory.get<WorkflowDefinition>(key);
        if (definition && !this.workflows.has(definition.id)) {
          this.workflows.set(definition.id, definition);
        }
      }
    } catch (error) {
      console.error('Failed to load persisted workflows:', error);
    }
  }

  private async persistWorkflows(): Promise<void> {
    try {
      for (const workflow of this.workflows.values()) {
        // Don't persist built-in workflows
        if (
          [
            'comprehensive-testing',
            'defect-prevention',
            'pre-release',
            'continuous-learning',
            'morning-sync',
          ].includes(workflow.id)
        ) {
          continue;
        }

        await this.memory.set(
          `workflow:definition:${workflow.id}`,
          workflow,
          { namespace: 'coordination', persist: true }
        );
      }
    } catch (error) {
      console.error('Failed to persist workflows:', error);
    }
  }

  private async persistExecution(execution: WorkflowExecutionStatus): Promise<void> {
    try {
      // Convert Map to object for serialization
      const serializable = {
        ...execution,
        stepResults: Object.fromEntries(execution.stepResults),
      };

      await this.memory.set(
        `workflow:execution:${execution.executionId}`,
        serializable,
        { namespace: 'coordination', ttl: 86400 * 7 } // 7 days
      );
    } catch (error) {
      console.error('Failed to persist execution:', error);
    }
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Register a domain action handler
   */
  registerAction(
    domain: DomainName,
    action: string,
    handler: DomainAction
  ): void {
    // Guard against prototype pollution
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    if (dangerousKeys.includes(domain) || dangerousKeys.includes(action)) {
      throw new Error('Invalid domain or action name: contains dangerous prototype key');
    }

    if (!this.actionRegistry[domain]) {
      this.actionRegistry[domain] = {};
    }
    this.actionRegistry[domain][action] = handler;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWorkflowOrchestrator(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: Partial<WorkflowOrchestratorConfig>
): IWorkflowOrchestrator {
  return new WorkflowOrchestrator(eventBus, memory, agentCoordinator, config);
}
