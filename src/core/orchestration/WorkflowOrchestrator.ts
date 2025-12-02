/**
 * WorkflowOrchestrator - Adaptive workflow execution for QE agent swarms
 *
 * Features:
 * - Adaptive strategy selection (parallel/sequential/hybrid)
 * - Priority-based task queue with dependency resolution
 * - Workflow checkpointing for recovery
 * - Integration with SwarmOptimizer and FleetManager
 */

import { Logger } from '../../utils/Logger';
import { SwarmMemoryManager } from '../memory/SwarmMemoryManager';
import { QEEventBus } from '../events/QEEventBus';
import { SwarmOptimizer, Task, Agent } from '../optimization/SwarmOptimizer';
import { PriorityQueue } from './PriorityQueue';
import {
  Workflow,
  WorkflowStep,
  WorkflowExecution,
  WorkflowCheckpoint,
  ExecutionMetrics,
  ExecutionContext,
  StepResult,
  ExecutionPlan,
  ExecutionPhase,
  QueuedTask,
  WorkloadProfile,
  ExecutionStrategy
} from './types';

export class WorkflowOrchestrator {
  private readonly logger: Logger;
  private readonly memoryStore: SwarmMemoryManager;
  private readonly eventBus: QEEventBus;
  private readonly optimizer?: SwarmOptimizer;

  private workflows: Map<string, Workflow>;
  private executions: Map<string, WorkflowExecution>;
  private taskQueue: PriorityQueue<QueuedTask>;
  private isShutdown: boolean = false;

  // Priority mapping for tasks
  private readonly PRIORITY_VALUES = {
    critical: 100,
    high: 75,
    medium: 50,
    low: 25
  };

  constructor(
    memoryStore: SwarmMemoryManager,
    eventBus: QEEventBus,
    optimizer?: SwarmOptimizer
  ) {
    this.logger = Logger.getInstance();
    this.memoryStore = memoryStore;
    this.eventBus = eventBus;
    this.optimizer = optimizer;

    this.workflows = new Map();
    this.executions = new Map();
    this.taskQueue = new PriorityQueue<QueuedTask>();
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing WorkflowOrchestrator');

    // Load workflows from memory
    await this.loadWorkflowsFromMemory();

    // Subscribe to events
    this.eventBus.subscribe('workflow:step:completed', this.handleStepCompleted.bind(this));
    this.eventBus.subscribe('workflow:step:failed', this.handleStepFailed.bind(this));
    this.eventBus.subscribe('agent:available', this.handleAgentAvailable.bind(this));

    this.logger.info('WorkflowOrchestrator initialized successfully');
  }

  // ============= WORKFLOW MANAGEMENT =============

  /**
   * Register a new workflow
   */
  registerWorkflow(workflow: Workflow): void {
    this.logger.info(`Registering workflow: ${workflow.id} - ${workflow.name}`);

    // Validate workflow
    this.validateWorkflow(workflow);

    this.workflows.set(workflow.id, workflow);

    // Persist to memory
    this.memoryStore.store(
      `workflows:registry:${workflow.id}`,
      workflow,
      { partition: 'workflows', ttl: 2592000 } // 30 days
    ).catch(err => this.logger.error('Failed to persist workflow:', err));

    this.eventBus.emitAsync('workflow:registered', { workflowId: workflow.id });
  }

  /**
   * Get a workflow by ID
   */
  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  /**
   * List all registered workflows
   */
  listWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  // ============= EXECUTION =============

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowId: string,
    inputs: Record<string, any> = {}
  ): Promise<WorkflowExecution> {
    this.logger.info(`Executing workflow: ${workflowId}`);

    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Create execution
    const execution: WorkflowExecution = {
      id: this.generateExecutionId(),
      workflowId,
      status: 'running',
      startedAt: new Date(),
      completedSteps: [],
      failedSteps: [],
      results: new Map(),
      metrics: {
        totalDuration: 0,
        stepDurations: new Map(),
        retryCount: 0,
        parallelization: 0
      }
    };

    this.executions.set(execution.id, execution);

    // Emit start event
    await this.eventBus.emitAsync('workflow:started', {
      executionId: execution.id,
      workflowId
    });

    try {
      // Create execution context
      const context: ExecutionContext = {
        executionId: execution.id,
        workflowId,
        inputs,
        stepResults: new Map(),
        startTime: Date.now()
      };

      // Resolve dependencies and create execution plan
      const plan = this.resolveDependencies(workflow.steps);

      // Select execution strategy
      const strategy = workflow.strategy === 'adaptive'
        ? await this.selectStrategy(workflow, plan)
        : workflow.strategy;

      this.logger.info(`Using ${strategy} execution strategy`);

      // Execute based on strategy
      let results: Map<string, StepResult>;

      if (strategy === 'parallel') {
        results = await this.executeParallel(workflow.steps, context);
      } else if (strategy === 'sequential') {
        results = await this.executeSequential(workflow.steps, context);
      } else {
        // Hybrid: execute phases in sequence, steps within phases in parallel
        results = await this.executeHybrid(plan, context);
      }

      // Update execution with results
      execution.status = 'completed';
      execution.completedAt = new Date();
      execution.results = results;
      execution.metrics.totalDuration = Date.now() - context.startTime;

      // Calculate parallelization metric
      const totalStepTime = Array.from(results.values())
        .reduce((sum, r) => sum + r.duration, 0);
      execution.metrics.parallelization = totalStepTime / execution.metrics.totalDuration;

      // Emit completion event
      await this.eventBus.emitAsync('workflow:completed', {
        executionId: execution.id,
        workflowId,
        duration: execution.metrics.totalDuration
      });

      this.logger.info(`Workflow ${workflowId} completed in ${execution.metrics.totalDuration}ms`);

    } catch (error) {
      execution.status = 'failed';
      execution.completedAt = new Date();

      await this.eventBus.emitAsync('workflow:failed', {
        executionId: execution.id,
        workflowId,
        error: error instanceof Error ? error.message : String(error)
      });

      this.logger.error(`Workflow ${workflowId} failed:`, error);
    } finally {
      // Persist execution
      await this.persistExecution(execution);
    }

    return execution;
  }

  /**
   * Pause a running execution
   */
  async pauseExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status !== 'running') {
      throw new Error(`Cannot pause execution in ${execution.status} state`);
    }

    // Create checkpoint
    const checkpoint = await this.createCheckpoint(executionId);
    execution.checkpoint = checkpoint;
    execution.status = 'paused';

    await this.eventBus.emitAsync('workflow:paused', { executionId });
    await this.persistExecution(execution);

    this.logger.info(`Execution ${executionId} paused`);
  }

  /**
   * Resume a paused execution
   */
  async resumeExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status !== 'paused') {
      throw new Error(`Cannot resume execution in ${execution.status} state`);
    }

    if (!execution.checkpoint) {
      throw new Error(`No checkpoint found for execution ${executionId}`);
    }

    execution.status = 'running';
    await this.eventBus.emitAsync('workflow:resumed', { executionId });

    this.logger.info(`Execution ${executionId} resumed`);

    // Continue execution from checkpoint
    // This would be implemented based on specific requirements
  }

  /**
   * Cancel a running or paused execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status === 'completed' || execution.status === 'failed') {
      throw new Error(`Cannot cancel execution in ${execution.status} state`);
    }

    execution.status = 'failed';
    execution.completedAt = new Date();

    await this.eventBus.emitAsync('workflow:cancelled', { executionId });
    await this.persistExecution(execution);

    this.logger.info(`Execution ${executionId} cancelled`);
  }

  // ============= STRATEGY SELECTION =============

  /**
   * Select optimal execution strategy based on workflow characteristics
   */
  private async selectStrategy(
    workflow: Workflow,
    plan: ExecutionPlan
  ): Promise<ExecutionStrategy> {
    const workload = this.analyzeWorkloadCharacteristics(workflow.steps);

    // Decision logic:
    // - High parallelizability + low interdependencies → parallel
    // - Low parallelizability or high interdependencies → sequential
    // - Mixed characteristics → hybrid

    if (workload.parallelizability > 0.7 && workload.interdependencies < 0.3) {
      return 'parallel';
    }

    if (workload.parallelizability < 0.3 || workload.interdependencies > 0.7) {
      return 'sequential';
    }

    return 'hybrid';
  }

  /**
   * Analyze workload characteristics
   */
  private analyzeWorkloadCharacteristics(steps: WorkflowStep[]): WorkloadProfile {
    const totalSteps = steps.length;

    // Calculate average complexity (based on timeout as proxy)
    const avgComplexity = steps.reduce((sum, s) => sum + (s.timeout / 60000), 0) / totalSteps;

    // Calculate parallelizability (steps with no dependencies)
    const parallelSteps = steps.filter(s => s.dependencies.length === 0).length;
    const parallelizability = parallelSteps / totalSteps;

    // Calculate interdependencies
    const totalDependencies = steps.reduce((sum, s) => sum + s.dependencies.length, 0);
    const interdependencies = totalDependencies / (totalSteps * totalSteps);

    // Estimate resource intensity from timeout and priority
    const criticalSteps = steps.filter(s => s.priority === 'critical').length;
    const resourceIntensity = (criticalSteps / totalSteps + avgComplexity) / 2;

    return {
      stepCount: totalSteps,
      averageComplexity: Math.min(1, avgComplexity / 10), // normalize to 0-1
      parallelizability,
      resourceIntensity: Math.min(1, resourceIntensity),
      interdependencies: Math.min(1, interdependencies)
    };
  }

  // ============= DEPENDENCY RESOLUTION =============

  /**
   * Resolve dependencies and create execution plan
   */
  private resolveDependencies(steps: WorkflowStep[]): ExecutionPlan {
    // Check for cycles
    if (this.detectCycles(steps)) {
      throw new Error('Workflow contains circular dependencies');
    }

    // Perform topological sort
    const sortedStepIds = this.topologicalSort(steps);

    // Group steps into phases (steps that can run in parallel)
    const phases = this.groupIntoPhases(steps, sortedStepIds);

    // Calculate critical path (longest dependency chain)
    const criticalPath = this.calculateCriticalPath(steps);

    // Estimate total duration based on critical path
    const estimatedDuration = criticalPath
      .map(stepId => steps.find(s => s.id === stepId))
      .filter(s => s !== undefined)
      .reduce((sum, step) => sum + step!.timeout, 0);

    return {
      phases,
      criticalPath,
      estimatedDuration
    };
  }

  /**
   * Topological sort using Kahn's algorithm
   */
  private topologicalSort(steps: WorkflowStep[]): string[] {
    const sorted: string[] = [];
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Build adjacency list and in-degree map
    for (const step of steps) {
      inDegree.set(step.id, step.dependencies.length);
      adjList.set(step.id, []);
    }

    for (const step of steps) {
      for (const dep of step.dependencies) {
        const neighbors = adjList.get(dep) || [];
        neighbors.push(step.id);
        adjList.set(dep, neighbors);
      }
    }

    // Find all steps with no dependencies
    const queue: string[] = [];
    for (const [stepId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(stepId);
      }
    }

    // Process queue
    while (queue.length > 0) {
      const stepId = queue.shift()!;
      sorted.push(stepId);

      const neighbors = adjList.get(stepId) || [];
      for (const neighbor of neighbors) {
        const degree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, degree);

        if (degree === 0) {
          queue.push(neighbor);
        }
      }
    }

    return sorted;
  }

  /**
   * Detect circular dependencies using DFS
   */
  private detectCycles(steps: WorkflowStep[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (stepId: string): boolean => {
      visited.add(stepId);
      recursionStack.add(stepId);

      const step = steps.find(s => s.id === stepId);
      if (!step) return false;

      for (const dep of step.dependencies) {
        if (!visited.has(dep)) {
          if (hasCycle(dep)) {
            return true;
          }
        } else if (recursionStack.has(dep)) {
          return true;
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        if (hasCycle(step.id)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Group steps into parallel execution phases
   */
  private groupIntoPhases(steps: WorkflowStep[], sortedStepIds: string[]): ExecutionPhase[] {
    const phases: ExecutionPhase[] = [];
    const processedSteps = new Set<string>();
    let phaseId = 0;

    while (processedSteps.size < steps.length) {
      // Find steps whose dependencies are all processed
      const readySteps = steps.filter(step => {
        if (processedSteps.has(step.id)) return false;
        return step.dependencies.every(dep => processedSteps.has(dep));
      });

      if (readySteps.length === 0) break;

      phases.push({
        id: `phase-${phaseId++}`,
        steps: readySteps,
        isParallel: readySteps.length > 1,
        dependencies: readySteps.flatMap(s => s.dependencies).filter(d => !processedSteps.has(d))
      });

      readySteps.forEach(step => processedSteps.add(step.id));
    }

    return phases;
  }

  /**
   * Calculate critical path (longest dependency chain)
   */
  private calculateCriticalPath(steps: WorkflowStep[]): string[] {
    const memo = new Map<string, string[]>();

    const findLongestPath = (stepId: string): string[] => {
      if (memo.has(stepId)) {
        return memo.get(stepId)!;
      }

      const step = steps.find(s => s.id === stepId);
      if (!step || step.dependencies.length === 0) {
        memo.set(stepId, [stepId]);
        return [stepId];
      }

      let longestPath: string[] = [];
      for (const dep of step.dependencies) {
        const path = findLongestPath(dep);
        if (path.length > longestPath.length) {
          longestPath = path;
        }
      }

      const result = [...longestPath, stepId];
      memo.set(stepId, result);
      return result;
    };

    // Find longest path among all terminal steps
    const terminalSteps = steps.filter(step =>
      !steps.some(s => s.dependencies.includes(step.id))
    );

    let criticalPath: string[] = [];
    for (const step of terminalSteps) {
      const path = findLongestPath(step.id);
      if (path.length > criticalPath.length) {
        criticalPath = path;
      }
    }

    return criticalPath;
  }

  // ============= STEP EXECUTION =============

  /**
   * Execute a single step
   */
  private async executeStep(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    const startTime = Date.now();
    let retryCount = 0;
    let lastError: Error | undefined;

    this.logger.debug(`Executing step: ${step.id} - ${step.name}`);

    // Emit start event
    await this.eventBus.emitAsync('workflow:step:started', {
      executionId: context.executionId,
      stepId: step.id
    });

    while (retryCount <= step.retries) {
      try {
        // Resolve inputs from previous step results
        const resolvedInputs = this.resolveStepInputs(step, context);

        // Execute step with timeout
        const output = await this.executeStepWithTimeout(
          step,
          resolvedInputs,
          context
        );

        const duration = Date.now() - startTime;

        const result: StepResult = {
          stepId: step.id,
          status: 'success',
          output,
          duration,
          retryCount
        };

        // Update execution
        const execution = this.executions.get(context.executionId);
        if (execution) {
          execution.completedSteps.push(step.id);
          execution.metrics.stepDurations.set(step.id, duration);
        }

        // Emit success event
        await this.eventBus.emitAsync('workflow:step:completed', {
          executionId: context.executionId,
          stepId: step.id,
          duration
        });

        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;

        if (retryCount <= step.retries) {
          this.logger.warn(`Step ${step.id} failed, retrying (${retryCount}/${step.retries})`);
          await this.delay(1000 * retryCount); // Exponential backoff
        }
      }
    }

    // All retries exhausted
    const duration = Date.now() - startTime;

    const result: StepResult = {
      stepId: step.id,
      status: 'failed',
      output: null,
      error: lastError,
      duration,
      retryCount: retryCount - 1
    };

    // Update execution
    const execution = this.executions.get(context.executionId);
    if (execution) {
      execution.failedSteps.push(step.id);
      execution.metrics.retryCount += retryCount - 1;
    }

    // Emit failure event
    await this.eventBus.emitAsync('workflow:step:failed', {
      executionId: context.executionId,
      stepId: step.id,
      error: lastError?.message
    });

    return result;
  }

  /**
   * Execute step with timeout
   */
  private async executeStepWithTimeout(
    step: WorkflowStep,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Step ${step.id} timed out after ${step.timeout}ms`));
      }, step.timeout);

      // Simulate step execution (in real implementation, this would call agent)
      this.executeStepAction(step, inputs, context)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Execute step action (placeholder for agent invocation)
   */
  private async executeStepAction(
    step: WorkflowStep,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    // In real implementation, this would:
    // 1. Allocate agent using optimizer
    // 2. Invoke agent with step action and inputs
    // 3. Return agent's output

    this.logger.debug(`Executing action: ${step.action} with inputs:`, inputs);

    // Placeholder: return mock result
    return {
      stepId: step.id,
      agentType: step.agentType,
      action: step.action,
      inputs,
      timestamp: Date.now()
    };
  }

  /**
   * Resolve step inputs from previous results
   */
  private resolveStepInputs(
    step: WorkflowStep,
    context: ExecutionContext
  ): Record<string, any> {
    const resolved: Record<string, any> = { ...step.inputs };

    // Replace references to previous step outputs
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const ref = value.slice(2, -1);
        const [stepId, outputKey] = ref.split('.');

        const stepResult = context.stepResults.get(stepId);
        if (stepResult && stepResult.output) {
          resolved[key] = outputKey
            ? stepResult.output[outputKey]
            : stepResult.output;
        }
      }
    }

    return resolved;
  }

  /**
   * Execute steps in parallel
   */
  private async executeParallel(
    steps: WorkflowStep[],
    context: ExecutionContext
  ): Promise<Map<string, StepResult>> {
    this.logger.info(`Executing ${steps.length} steps in parallel`);

    const results = new Map<string, StepResult>();

    // Execute all steps concurrently
    const promises = steps.map(step => this.executeStep(step, context));
    const stepResults = await Promise.allSettled(promises);

    // Collect results
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const result = stepResults[i];

      if (result.status === 'fulfilled') {
        results.set(step.id, result.value);
        context.stepResults.set(step.id, result.value);
      } else {
        results.set(step.id, {
          stepId: step.id,
          status: 'failed',
          output: null,
          error: result.reason,
          duration: 0,
          retryCount: 0
        });
      }
    }

    return results;
  }

  /**
   * Execute steps sequentially
   */
  private async executeSequential(
    steps: WorkflowStep[],
    context: ExecutionContext
  ): Promise<Map<string, StepResult>> {
    this.logger.info(`Executing ${steps.length} steps sequentially`);

    const results = new Map<string, StepResult>();

    for (const step of steps) {
      const result = await this.executeStep(step, context);
      results.set(step.id, result);
      context.stepResults.set(step.id, result);

      // Stop on failure if step is critical
      if (result.status === 'failed' && step.priority === 'critical') {
        throw new Error(`Critical step ${step.id} failed`);
      }
    }

    return results;
  }

  /**
   * Execute in hybrid mode (phases sequential, steps within phase parallel)
   */
  private async executeHybrid(
    plan: ExecutionPlan,
    context: ExecutionContext
  ): Promise<Map<string, StepResult>> {
    this.logger.info(`Executing ${plan.phases.length} phases in hybrid mode`);

    const results = new Map<string, StepResult>();

    for (const phase of plan.phases) {
      this.logger.debug(`Executing phase ${phase.id} with ${phase.steps.length} steps`);

      if (phase.isParallel) {
        const phaseResults = await this.executeParallel(phase.steps, context);
        phaseResults.forEach((result, stepId) => results.set(stepId, result));
      } else {
        const phaseResults = await this.executeSequential(phase.steps, context);
        phaseResults.forEach((result, stepId) => results.set(stepId, result));
      }
    }

    return results;
  }

  // ============= CHECKPOINTING =============

  /**
   * Create a checkpoint for an execution
   */
  async createCheckpoint(executionId: string): Promise<WorkflowCheckpoint> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const checkpoint: WorkflowCheckpoint = {
      executionId,
      timestamp: new Date(),
      completedSteps: [...execution.completedSteps],
      stepResults: new Map(execution.results),
      state: {
        status: execution.status,
        currentStep: execution.currentStep
      }
    };

    // Persist checkpoint
    await this.memoryStore.store(
      `workflows:checkpoints:${executionId}:${Date.now()}`,
      this.serializeCheckpoint(checkpoint),
      { partition: 'workflows', ttl: 604800 } // 7 days
    );

    this.logger.info(`Created checkpoint for execution ${executionId}`);

    return checkpoint;
  }

  /**
   * Restore execution from checkpoint
   */
  async restoreFromCheckpoint(checkpoint: WorkflowCheckpoint): Promise<WorkflowExecution> {
    this.logger.info(`Restoring execution from checkpoint: ${checkpoint.executionId}`);

    const execution = this.executions.get(checkpoint.executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${checkpoint.executionId}`);
    }

    execution.completedSteps = [...checkpoint.completedSteps];
    execution.results = new Map(checkpoint.stepResults);
    execution.checkpoint = checkpoint;
    execution.status = checkpoint.state.status as any;

    return execution;
  }

  // ============= QUEUE MANAGEMENT =============

  /**
   * Enqueue a task with priority
   */
  private enqueueTask(task: QueuedTask): void {
    this.taskQueue.enqueue(task, task.priority);
  }

  /**
   * Dequeue highest priority task
   */
  private dequeueTask(): QueuedTask | undefined {
    return this.taskQueue.dequeue();
  }

  // ============= METRICS =============

  /**
   * Get execution metrics
   */
  getExecutionMetrics(executionId: string): ExecutionMetrics {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    return execution.metrics;
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * List all executions
   */
  listExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }

  // ============= HELPERS =============

  /**
   * Validate workflow structure
   */
  private validateWorkflow(workflow: Workflow): void {
    if (!workflow.id || !workflow.name) {
      throw new Error('Workflow must have id and name');
    }

    if (!workflow.steps || workflow.steps.length === 0) {
      throw new Error('Workflow must have at least one step');
    }

    // Validate step dependencies exist
    const stepIds = new Set(workflow.steps.map(s => s.id));
    for (const step of workflow.steps) {
      for (const dep of step.dependencies) {
        if (!stepIds.has(dep)) {
          throw new Error(`Step ${step.id} depends on non-existent step: ${dep}`);
        }
      }
    }
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Serialize checkpoint for storage
   */
  private serializeCheckpoint(checkpoint: WorkflowCheckpoint): any {
    return {
      ...checkpoint,
      stepResults: Array.from(checkpoint.stepResults.entries())
    };
  }

  /**
   * Persist execution to memory
   */
  private async persistExecution(execution: WorkflowExecution): Promise<void> {
    const serialized = {
      ...execution,
      results: Array.from(execution.results.entries()),
      metrics: {
        ...execution.metrics,
        stepDurations: Array.from(execution.metrics.stepDurations.entries())
      }
    };

    await this.memoryStore.store(
      `workflows:executions:${execution.id}`,
      serialized,
      { partition: 'workflows', ttl: 604800 } // 7 days
    );
  }

  /**
   * Load workflows from memory
   */
  private async loadWorkflowsFromMemory(): Promise<void> {
    try {
      const entries = await this.memoryStore.query('workflows:registry:%', {
        partition: 'workflows'
      });

      for (const entry of entries) {
        const workflow = entry.value as Workflow;
        this.workflows.set(workflow.id, workflow);
      }

      this.logger.info(`Loaded ${this.workflows.size} workflows from memory`);
    } catch (error) {
      this.logger.warn('Failed to load workflows from memory:', error);
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Event handlers
   */
  private async handleStepCompleted(data: any): Promise<void> {
    this.logger.debug(`Step completed: ${data.stepId}`);
  }

  private async handleStepFailed(data: any): Promise<void> {
    this.logger.error(`Step failed: ${data.stepId} - ${data.error}`);
  }

  private async handleAgentAvailable(data: any): Promise<void> {
    // Process queued tasks when agent becomes available
    if (!this.taskQueue.isEmpty()) {
      const task = this.dequeueTask();
      if (task) {
        this.logger.debug(`Assigning queued task ${task.id} to available agent`);
      }
    }
  }

  // ============= CLEANUP =============

  /**
   * Shutdown orchestrator
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down WorkflowOrchestrator');

    this.isShutdown = true;

    // Cancel all running executions
    for (const execution of this.executions.values()) {
      if (execution.status === 'running' || execution.status === 'paused') {
        await this.cancelExecution(execution.id);
      }
    }

    // Clear queue
    this.taskQueue.clear();

    this.logger.info('WorkflowOrchestrator shutdown complete');
  }
}
