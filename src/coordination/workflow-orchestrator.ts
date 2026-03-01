/**
 * Agentic QE v3 - Workflow Orchestrator
 * Coordinates complete QE workflows across all 12 domains
 *
 * Module structure (extracted for maintainability):
 * - workflow-types.ts: All types, interfaces, events, config
 * - workflow-builtin.ts: Built-in workflow definitions
 * - workflow-orchestrator.ts: WorkflowOrchestrator class (this file, facade)
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
import { toError, toErrorMessage } from '../shared/error-utils.js';

// Re-export all types for backward compatibility
export type {
  StepExecutionMode,
  StepStatus,
  WorkflowStatus,
  ConditionOperator,
  StepCondition,
  WorkflowStepDefinition,
  WorkflowDefinition,
  WorkflowTrigger,
  StepExecutionResult,
  WorkflowContext,
  WorkflowExecutionStatus,
  WorkflowListItem,
  WorkflowStartedPayload,
  WorkflowCompletedPayload,
  WorkflowFailedPayload,
  StepEventPayload,
  IWorkflowOrchestrator,
  DomainAction,
  DomainActionRegistry,
  WorkflowOrchestratorConfig,
} from './workflow-types.js';

export {
  WorkflowEvents,
  DEFAULT_WORKFLOW_CONFIG,
} from './workflow-types.js';

// Import types we use internally
import type {
  WorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowContext,
  WorkflowExecutionStatus,
  WorkflowListItem,
  StepExecutionResult,
  StepCondition,
  IWorkflowOrchestrator,
  DomainAction,
  DomainActionRegistry,
  WorkflowOrchestratorConfig,
  WorkflowStartedPayload,
  WorkflowCompletedPayload,
  WorkflowFailedPayload,
  StepEventPayload,
} from './workflow-types.js';

import { WorkflowEvents, DEFAULT_WORKFLOW_CONFIG } from './workflow-types.js';

// Import built-in workflows
import { getBuiltInWorkflows, BUILTIN_WORKFLOW_IDS } from './workflow-builtin.js';

// ============================================================================
// Workflow Orchestrator Implementation
// ============================================================================

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
    this.config = { ...DEFAULT_WORKFLOW_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.registerBuiltInWorkflows();

    if (this.config.enableEventTriggers) {
      this.setupEventTriggers();
    }

    await this.loadPersistedWorkflows();
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    for (const execution of this.executions.values()) {
      if (execution.status === 'running') {
        await this.cancelWorkflow(execution.executionId);
      }
    }

    for (const subscription of this.eventSubscriptions) {
      subscription.unsubscribe();
    }

    await this.persistWorkflows();
    this.initialized = false;
  }

  registerWorkflow(definition: WorkflowDefinition): Result<void, Error> {
    try {
      const validationResult = this.validateWorkflowDefinition(definition);
      if (!validationResult.success) return validationResult;

      this.workflows.set(definition.id, definition);

      if (this.config.enableEventTriggers && definition.triggers) {
        this.registerWorkflowTriggers(definition);
      }

      return ok(undefined);
    } catch (error) {
      return err(toError(error));
    }
  }

  unregisterWorkflow(workflowId: string): Result<void, Error> {
    if (!this.workflows.has(workflowId)) {
      return err(new Error(`Workflow not found: ${workflowId}`));
    }

    const activeExecutions = Array.from(this.executions.values()).filter(
      (e) => e.workflowId === workflowId && e.status === 'running'
    );

    if (activeExecutions.length > 0) {
      return err(new Error(`Cannot unregister workflow with ${activeExecutions.length} active execution(s)`));
    }

    this.workflows.delete(workflowId);
    return ok(undefined);
  }

  async executeWorkflow(
    workflowId: string,
    input: Record<string, unknown> = {},
    correlationId?: string
  ): Promise<Result<string, Error>> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return err(new Error(`Workflow not found: ${workflowId}`));

    const activeCount = Array.from(this.executions.values()).filter(
      (e) => e.status === 'running'
    ).length;

    if (activeCount >= this.config.maxConcurrentWorkflows) {
      return err(new Error(`Maximum concurrent workflows (${this.config.maxConcurrentWorkflows}) reached`));
    }

    const executionId = uuidv4();
    const startedAt = new Date();

    const context: WorkflowContext = {
      input,
      results: {},
      metadata: { executionId, workflowId, correlationId: correlationId || executionId, startedAt },
    };

    const execution: WorkflowExecutionStatus = {
      executionId, workflowId, workflowName: workflow.name,
      status: 'running', startedAt, progress: 0,
      currentSteps: [], completedSteps: [], failedSteps: [], skippedSteps: [],
      context, stepResults: new Map(),
    };

    this.executions.set(executionId, execution);
    await this.publishWorkflowStarted(execution, workflow);

    this.runWorkflow(workflow, execution).catch(async (error) => {
      execution.status = 'failed';
      execution.error = String(error);
      execution.completedAt = new Date();
      execution.duration = execution.completedAt.getTime() - startedAt.getTime();
      await this.publishWorkflowFailed(execution, 'unknown', String(error));
    });

    return ok(executionId);
  }

  getWorkflowStatus(executionId: string): WorkflowExecutionStatus | undefined {
    return this.executions.get(executionId);
  }

  async cancelWorkflow(executionId: string): Promise<Result<void, Error>> {
    const execution = this.executions.get(executionId);
    if (!execution) return err(new Error(`Execution not found: ${executionId}`));

    if (execution.status !== 'running' && execution.status !== 'paused') {
      return err(new Error(`Cannot cancel workflow in status: ${execution.status}`));
    }

    execution.status = 'cancelled';
    execution.completedAt = new Date();
    execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();

    await this.publishEvent(WorkflowEvents.WorkflowCancelled, {
      executionId, workflowId: execution.workflowId, workflowName: execution.workflowName,
    }, execution.context.metadata.correlationId);

    return ok(undefined);
  }

  async pauseWorkflow(executionId: string): Promise<Result<void, Error>> {
    const execution = this.executions.get(executionId);
    if (!execution) return err(new Error(`Execution not found: ${executionId}`));
    if (execution.status !== 'running') return err(new Error(`Cannot pause workflow in status: ${execution.status}`));

    execution.status = 'paused';
    return ok(undefined);
  }

  async resumeWorkflow(executionId: string): Promise<Result<void, Error>> {
    const execution = this.executions.get(executionId);
    if (!execution) return err(new Error(`Execution not found: ${executionId}`));
    if (execution.status !== 'paused') return err(new Error(`Cannot resume workflow in status: ${execution.status}`));

    const workflow = this.workflows.get(execution.workflowId);
    if (!workflow) return err(new Error(`Workflow definition not found: ${execution.workflowId}`));

    execution.status = 'running';

    this.runWorkflow(workflow, execution).catch(async (error) => {
      execution.status = 'failed';
      execution.error = String(error);
    });

    return ok(undefined);
  }

  listWorkflows(): WorkflowListItem[] {
    return Array.from(this.workflows.values()).map((w) => ({
      id: w.id, name: w.name, description: w.description, version: w.version,
      stepCount: w.steps.length, tags: w.tags,
      triggers: w.triggers?.map((t) => t.eventType),
    }));
  }

  getActiveExecutions(): WorkflowExecutionStatus[] {
    return Array.from(this.executions.values()).filter(
      (e) => e.status === 'running' || e.status === 'paused'
    );
  }

  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  // ============================================================================
  // Public Utility Methods
  // ============================================================================

  isActionRegistered(domain: DomainName, action: string): boolean {
    return !!this.actionRegistry[domain]?.[action];
  }

  getRegisteredActions(domain: DomainName): string[] {
    return Object.keys(this.actionRegistry[domain] || {});
  }

  getDomainsWithActions(): DomainName[] {
    return Object.keys(this.actionRegistry) as DomainName[];
  }

  async spawnWorkflowAgent(workflowId: string, stepId: string, domain: DomainName): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) return err(new Error('Agent limit reached'));

    return this.agentCoordinator.spawn({
      name: `workflow-agent-${workflowId.slice(0, 8)}-${stepId}`,
      domain, type: 'coordinator',
      capabilities: ['workflow-execution', stepId],
      config: { workflowId, stepId },
    });
  }

  async stopWorkflowAgent(agentId: string): Promise<Result<void, Error>> {
    return this.agentCoordinator.stop(agentId);
  }

  getAvailableAgentCapacity(): number {
    return this.agentCoordinator.canSpawn()
      ? this.config.maxConcurrentWorkflows - this.getActiveExecutions().length
      : 0;
  }

  registerAction(domain: DomainName, action: string, handler: DomainAction): void {
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    if (dangerousKeys.includes(domain) || dangerousKeys.includes(action)) {
      throw new Error('Invalid domain or action name: contains dangerous prototype key');
    }

    if (!this.actionRegistry[domain]) this.actionRegistry[domain] = {};
    this.actionRegistry[domain][action] = handler;
  }

  // ============================================================================
  // Private Methods - Workflow Execution
  // ============================================================================

  private async runWorkflow(workflow: WorkflowDefinition, execution: WorkflowExecutionStatus): Promise<void> {
    const timeout = workflow.timeout || this.config.defaultWorkflowTimeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Workflow timeout after ${timeout}ms`)), timeout);
    });

    try {
      await Promise.race([this.executeSteps(workflow, execution), timeoutPromise]);

      if (execution.status === 'running') {
        execution.status = 'completed';
        execution.completedAt = new Date();
        execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();
        execution.progress = 100;
        await this.publishWorkflowCompleted(execution);
      }
    } catch (error) {
      if (execution.status === 'running') {
        execution.status = 'failed';
        execution.error = String(error);
        execution.completedAt = new Date();
        execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();
        const failedStep = execution.currentSteps[0] || 'unknown';
        await this.publishWorkflowFailed(execution, failedStep, String(error));
      }
    }

    if (this.config.persistExecutions) await this.persistExecution(execution);
  }

  private async executeSteps(workflow: WorkflowDefinition, execution: WorkflowExecutionStatus): Promise<void> {
    const steps = workflow.steps;
    const completedSteps = new Set(execution.completedSteps);
    const skippedSteps = new Set(execution.skippedSteps);
    const failedSteps = new Set(execution.failedSteps);

    const pendingSteps = steps.filter(
      (s) => !completedSteps.has(s.id) && !skippedSteps.has(s.id) && !failedSteps.has(s.id)
    );

    while (pendingSteps.length > 0 && execution.status === 'running') {
      const readySteps = pendingSteps.filter((step) => {
        const deps = step.dependsOn || [];
        return deps.every((depId) => completedSteps.has(depId) || skippedSteps.has(depId));
      });

      if (readySteps.length === 0) break;

      const parallelSteps = readySteps.filter((s) => !s.dependsOn?.length);
      const sequentialSteps = readySteps.filter((s) => s.dependsOn?.length);

      if (parallelSteps.length > 0) {
        execution.currentSteps = parallelSteps.map((s) => s.id);
        const results = await Promise.allSettled(
          parallelSteps.map((step) => this.executeStep(step, execution, workflow))
        );

        for (let i = 0; i < parallelSteps.length; i++) {
          const step = parallelSteps[i];
          const result = results[i];

          if (result.status === 'fulfilled') {
            const stepResult = result.value;
            if (stepResult.status === 'completed') { completedSteps.add(step.id); execution.completedSteps.push(step.id); }
            else if (stepResult.status === 'skipped') { skippedSteps.add(step.id); execution.skippedSteps.push(step.id); }
            else if (stepResult.status === 'failed') {
              failedSteps.add(step.id); execution.failedSteps.push(step.id);
              if (!step.continueOnFailure) { execution.status = 'failed'; execution.error = stepResult.error; return; }
            }
          } else {
            failedSteps.add(step.id); execution.failedSteps.push(step.id);
            if (!step.continueOnFailure) { execution.status = 'failed'; execution.error = result.reason?.message || 'Unknown error'; return; }
          }

          const pendingIndex = pendingSteps.indexOf(step);
          if (pendingIndex !== -1) pendingSteps.splice(pendingIndex, 1);
        }
      }

      for (const step of sequentialSteps) {
        if (execution.status !== 'running') break;
        execution.currentSteps = [step.id];

        const stepResult = await this.executeStep(step, execution, workflow);

        if (stepResult.status === 'completed') { completedSteps.add(step.id); execution.completedSteps.push(step.id); }
        else if (stepResult.status === 'skipped') { skippedSteps.add(step.id); execution.skippedSteps.push(step.id); }
        else if (stepResult.status === 'failed') {
          failedSteps.add(step.id); execution.failedSteps.push(step.id);
          if (!step.continueOnFailure) { execution.status = 'failed'; execution.error = stepResult.error; return; }
        }

        const pendingIndex = pendingSteps.indexOf(step);
        if (pendingIndex !== -1) pendingSteps.splice(pendingIndex, 1);
      }

      const totalSteps = steps.length;
      const processedSteps = completedSteps.size + skippedSteps.size + failedSteps.size;
      execution.progress = Math.round((processedSteps / totalSteps) * 100);
    }

    execution.currentSteps = [];
  }

  private async executeStep(
    step: WorkflowStepDefinition, execution: WorkflowExecutionStatus, _workflow: WorkflowDefinition
  ): Promise<StepExecutionResult> {
    const startedAt = new Date();
    const result: StepExecutionResult = { stepId: step.id, status: 'pending', startedAt };

    try {
      if (step.skipCondition && this.evaluateCondition(step.skipCondition, execution.context)) {
        result.status = 'skipped'; result.completedAt = new Date(); result.duration = result.completedAt.getTime() - startedAt.getTime();
        execution.stepResults.set(step.id, result);
        await this.publishStepSkipped(execution, step);
        return result;
      }

      if (step.condition && !this.evaluateCondition(step.condition, execution.context)) {
        result.status = 'skipped'; result.completedAt = new Date(); result.duration = result.completedAt.getTime() - startedAt.getTime();
        execution.stepResults.set(step.id, result);
        await this.publishStepSkipped(execution, step);
        return result;
      }

      result.status = 'running';
      await this.publishStepStarted(execution, step);

      const input = this.buildStepInput(step, execution.context);

      let lastError: Error | undefined;
      const maxAttempts = step.retry?.maxAttempts || 1;
      let backoffMs = step.retry?.backoffMs || 1000;
      const backoffMultiplier = step.retry?.backoffMultiplier || 2;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        result.retryCount = attempt - 1;

        try {
          const stepTimeout = step.timeout || this.config.defaultStepTimeout;
          const output = await this.executeStepAction(step, input, execution.context, stepTimeout);

          this.mapStepOutput(step, output, execution.context);

          result.status = 'completed'; result.output = output; result.completedAt = new Date();
          result.duration = result.completedAt.getTime() - startedAt.getTime();
          execution.stepResults.set(step.id, result);

          await this.publishStepCompleted(execution, step, result);
          return result;
        } catch (error) {
          lastError = toError(error);
          if (attempt < maxAttempts) { await this.delay(backoffMs); backoffMs *= backoffMultiplier; }
        }
      }

      result.status = 'failed'; result.error = lastError?.message || 'Unknown error';
      result.completedAt = new Date(); result.duration = result.completedAt.getTime() - startedAt.getTime();
      execution.stepResults.set(step.id, result);

      if (step.rollback) await this.executeRollback(step.rollback, execution.context);

      await this.publishStepFailed(execution, step, result.error);
      return result;
    } catch (error) {
      result.status = 'failed'; result.error = toErrorMessage(error);
      result.completedAt = new Date(); result.duration = result.completedAt.getTime() - startedAt.getTime();
      execution.stepResults.set(step.id, result);

      await this.publishStepFailed(execution, step, result.error);
      return result;
    }
  }

  private async executeStepAction(
    step: WorkflowStepDefinition, input: Record<string, unknown>, context: WorkflowContext, timeout: number
  ): Promise<unknown> {
    const domainActions = this.actionRegistry[step.domain];
    if (domainActions?.[step.action]) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Step timeout after ${timeout}ms`)), timeout);
      });

      const actionResult = await Promise.race([domainActions[step.action](input, context), timeoutPromise]);
      if (!actionResult.success) throw actionResult.error;
      return actionResult.value;
    }

    throw new Error(
      `Action '${step.action}' not registered for domain '${step.domain}'. ` +
      `Register it using orchestrator.registerAction('${step.domain}', '${step.action}', handler)`
    );
  }

  private async executeRollback(
    rollback: { domain: DomainName; action: string; input?: Record<string, unknown> },
    context: WorkflowContext
  ): Promise<void> {
    try {
      const domainActions = this.actionRegistry[rollback.domain];
      if (!domainActions?.[rollback.action]) {
        console.warn(`Rollback action '${rollback.action}' not registered for domain '${rollback.domain}'. Skipping rollback.`);
        return;
      }

      const result = await domainActions[rollback.action](rollback.input || {}, context);
      if (!result.success) console.error(`Rollback failed for ${rollback.domain}.${rollback.action}:`, result.error);
    } catch (error) {
      console.error(`Rollback failed for ${rollback.domain}.${rollback.action}:`, error);
    }
  }

  // ============================================================================
  // Private Methods - Input/Output Mapping
  // ============================================================================

  private buildStepInput(step: WorkflowStepDefinition, context: WorkflowContext): Record<string, unknown> {
    const input: Record<string, unknown> = {};
    if (step.inputMapping) {
      for (const [targetKey, sourcePath] of Object.entries(step.inputMapping)) {
        const value = this.getValueByPath(context, sourcePath);
        if (value !== undefined) input[targetKey] = value;
      }
    }
    return input;
  }

  private mapStepOutput(step: WorkflowStepDefinition, output: unknown, context: WorkflowContext): void {
    context.results[step.id] = output;
    if (step.outputMapping && typeof output === 'object' && output !== null) {
      for (const [sourcePath, targetPath] of Object.entries(step.outputMapping)) {
        const value = this.getValueByPath(output, sourcePath);
        if (value !== undefined) this.setValueByPath(context.results, targetPath, value);
      }
    }
  }

  private getValueByPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === 'object') current = (current as Record<string, unknown>)[part];
      else return undefined;
    }
    return current;
  }

  private setValueByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
    for (const part of parts) {
      if (dangerousKeys.has(part)) throw new Error(`Invalid path: contains dangerous prototype key`);
    }

    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (dangerousKeys.has(part)) throw new Error(`Invalid path segment: '${part}' is a dangerous prototype key`);
      if (!Object.hasOwn(current, part)) {
        Object.defineProperty(current, part, { value: Object.create(null), writable: true, enumerable: true, configurable: true });
      }
      current = current[part] as Record<string, unknown>;
    }

    const finalKey = parts[parts.length - 1];
    if (dangerousKeys.has(finalKey)) throw new Error(`Invalid final key: '${finalKey}' is a dangerous prototype key`);
    // lgtm[js/prototype-pollution-utility]
    Object.defineProperty(current, finalKey, { value, writable: true, enumerable: true, configurable: true });
  }

  // ============================================================================
  // Private Methods - Condition Evaluation
  // ============================================================================

  private evaluateCondition(condition: StepCondition, context: WorkflowContext): boolean {
    const value = this.getValueByPath(context, condition.path);
    switch (condition.operator) {
      case 'eq': return value === condition.value;
      case 'neq': return value !== condition.value;
      case 'gt': return typeof value === 'number' && value > (condition.value as number);
      case 'gte': return typeof value === 'number' && value >= (condition.value as number);
      case 'lt': return typeof value === 'number' && value < (condition.value as number);
      case 'lte': return typeof value === 'number' && value <= (condition.value as number);
      case 'contains':
        if (Array.isArray(value)) return value.includes(condition.value);
        if (typeof value === 'string') return value.includes(String(condition.value));
        return false;
      case 'exists': return value !== undefined && value !== null;
      default: return false;
    }
  }

  // ============================================================================
  // Private Methods - Event Publishing
  // ============================================================================

  private async publishEvent<T>(type: string, payload: T, correlationId?: string): Promise<void> {
    const event = createEvent(type, 'learning-optimization' as DomainName, payload, correlationId);
    await this.eventBus.publish(event);
  }

  private async publishWorkflowStarted(execution: WorkflowExecutionStatus, workflow: WorkflowDefinition): Promise<void> {
    await this.publishEvent<WorkflowStartedPayload>(WorkflowEvents.WorkflowStarted, {
      executionId: execution.executionId, workflowId: execution.workflowId,
      workflowName: execution.workflowName, stepCount: workflow.steps.length,
    }, execution.context.metadata.correlationId);
  }

  private async publishWorkflowCompleted(execution: WorkflowExecutionStatus): Promise<void> {
    await this.publishEvent<WorkflowCompletedPayload>(WorkflowEvents.WorkflowCompleted, {
      executionId: execution.executionId, workflowId: execution.workflowId,
      workflowName: execution.workflowName, duration: execution.duration || 0,
      completedSteps: execution.completedSteps.length, skippedSteps: execution.skippedSteps.length,
    }, execution.context.metadata.correlationId);
  }

  private async publishWorkflowFailed(execution: WorkflowExecutionStatus, failedStep: string, error: string): Promise<void> {
    await this.publishEvent<WorkflowFailedPayload>(WorkflowEvents.WorkflowFailed, {
      executionId: execution.executionId, workflowId: execution.workflowId,
      workflowName: execution.workflowName, failedStep, error,
    }, execution.context.metadata.correlationId);
  }

  private async publishStepStarted(execution: WorkflowExecutionStatus, step: WorkflowStepDefinition): Promise<void> {
    await this.publishEvent<StepEventPayload>(WorkflowEvents.StepStarted, {
      executionId: execution.executionId, workflowId: execution.workflowId,
      stepId: step.id, stepName: step.name, domain: step.domain,
    }, execution.context.metadata.correlationId);
  }

  private async publishStepCompleted(execution: WorkflowExecutionStatus, step: WorkflowStepDefinition, result: StepExecutionResult): Promise<void> {
    await this.publishEvent(WorkflowEvents.StepCompleted, {
      executionId: execution.executionId, workflowId: execution.workflowId,
      stepId: step.id, stepName: step.name, domain: step.domain, duration: result.duration,
    }, execution.context.metadata.correlationId);
  }

  private async publishStepFailed(execution: WorkflowExecutionStatus, step: WorkflowStepDefinition, error: string): Promise<void> {
    await this.publishEvent(WorkflowEvents.StepFailed, {
      executionId: execution.executionId, workflowId: execution.workflowId,
      stepId: step.id, stepName: step.name, domain: step.domain, error,
    }, execution.context.metadata.correlationId);
  }

  private async publishStepSkipped(execution: WorkflowExecutionStatus, step: WorkflowStepDefinition): Promise<void> {
    await this.publishEvent<StepEventPayload>(WorkflowEvents.StepSkipped, {
      executionId: execution.executionId, workflowId: execution.workflowId,
      stepId: step.id, stepName: step.name, domain: step.domain,
    }, execution.context.metadata.correlationId);
  }

  // ============================================================================
  // Private Methods - Workflow Validation
  // ============================================================================

  private validateWorkflowDefinition(definition: WorkflowDefinition): Result<void, Error> {
    if (!definition.id) return err(new Error('Workflow ID is required'));
    if (!definition.name) return err(new Error('Workflow name is required'));
    if (!definition.steps || definition.steps.length === 0) return err(new Error('Workflow must have at least one step'));

    const stepIds = new Set<string>();
    for (const step of definition.steps) {
      if (!step.id) return err(new Error('Step ID is required'));
      if (stepIds.has(step.id)) return err(new Error(`Duplicate step ID: ${step.id}`));
      stepIds.add(step.id);
      if (!step.domain) return err(new Error(`Step ${step.id} must have a domain`));
      if (!ALL_DOMAINS.includes(step.domain)) return err(new Error(`Invalid domain for step ${step.id}: ${step.domain}`));
      if (!step.action) return err(new Error(`Step ${step.id} must have an action`));

      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (!definition.steps.some((s) => s.id === dep)) {
            return err(new Error(`Step ${step.id} depends on unknown step: ${dep}`));
          }
        }
      }
    }

    const circularCheck = this.detectCircularDependencies(definition.steps);
    if (circularCheck) return err(new Error(`Circular dependency detected: ${circularCheck}`));

    return ok(undefined);
  }

  private detectCircularDependencies(steps: WorkflowStepDefinition[]): string | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const visit = (stepId: string, path: string[]): string | null => {
      if (recursionStack.has(stepId)) return [...path, stepId].join(' -> ');
      if (visited.has(stepId)) return null;

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
    const subscription = this.eventBus.subscribe('*', async (event: DomainEvent) => {
      await this.handleEventForTriggers(event);
    });
    this.eventSubscriptions.push(subscription);
  }

  private registerWorkflowTriggers(_workflow: WorkflowDefinition): void {
    // Triggers are evaluated when events arrive via the * subscription
  }

  private async handleEventForTriggers(event: DomainEvent): Promise<void> {
    for (const workflow of this.workflows.values()) {
      if (!workflow.triggers) continue;

      for (const trigger of workflow.triggers) {
        if (trigger.eventType !== event.type) continue;
        if (trigger.sourceDomain && trigger.sourceDomain !== event.source) continue;

        if (trigger.condition) {
          const context: WorkflowContext = {
            input: { event: event.payload }, results: {},
            metadata: { executionId: '', workflowId: workflow.id, startedAt: new Date() },
          };
          if (!this.evaluateCondition(trigger.condition, context)) continue;
        }

        const input: Record<string, unknown> = {};
        if (trigger.inputMapping) {
          for (const [targetKey, sourcePath] of Object.entries(trigger.inputMapping)) {
            const value = this.getValueByPath({ event: event.payload }, sourcePath);
            if (value !== undefined) input[targetKey] = value;
          }
        } else {
          input.triggerEvent = event.payload;
        }

        await this.executeWorkflow(workflow.id, input, event.correlationId);
      }
    }
  }

  // ============================================================================
  // Private Methods - Built-in Workflows
  // ============================================================================

  private registerBuiltInWorkflows(): void {
    const builtInWorkflows = getBuiltInWorkflows();
    for (const workflow of builtInWorkflows) {
      this.registerWorkflow(workflow);
    }
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
        if ((BUILTIN_WORKFLOW_IDS as readonly string[]).includes(workflow.id)) continue;

        await this.memory.set(`workflow:definition:${workflow.id}`, workflow, { namespace: 'coordination', persist: true });
      }
    } catch (error) {
      console.error('Failed to persist workflows:', error);
    }
  }

  private async persistExecution(execution: WorkflowExecutionStatus): Promise<void> {
    try {
      const serializable = { ...execution, stepResults: Object.fromEntries(execution.stepResults) };
      await this.memory.set(`workflow:execution:${execution.executionId}`, serializable, { namespace: 'coordination', ttl: 86400 * 7 });
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
