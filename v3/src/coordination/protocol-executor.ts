/**
 * Agentic QE v3 - Protocol Execution Engine
 * Executes cross-domain protocols on schedule or trigger
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DomainName,
  DomainEvent,
  Result,
  ok,
  err,
} from '../shared/types';
import { EventBus, MemoryBackend } from '../kernel/interfaces';
import { createEvent } from '../shared/events';
import {
  Protocol,
  ProtocolExecution,
  ProtocolExecutionStatus,
  ProtocolAction,
  ActionExecutionResult,
  ProtocolExecutor,
  ProtocolSchedule,
} from './interfaces';

// ============================================================================
// Types
// ============================================================================

interface ScheduledProtocol {
  protocolId: string;
  schedule: ProtocolSchedule;
  intervalId?: NodeJS.Timeout;
  nextRun?: Date;
}

interface ExecutionContext {
  execution: MutableProtocolExecution;
  protocol: Protocol;
  params?: Record<string, unknown>;
  actionResults: Map<string, ActionExecutionResult>;
  cancelled: boolean;
  paused: boolean;
}

interface MutableProtocolExecution {
  executionId: string;
  protocolId: string;
  status: ProtocolExecutionStatus;
  participants: DomainName[];
  results: Map<string, ActionExecutionResult>;
  startedAt: Date;
  completedAt?: Date;
  correlationId: string;
  triggeredBy?: DomainEvent;
}

// ============================================================================
// Protocol Events
// ============================================================================

const ProtocolEvents = {
  ProtocolStarted: 'coordination.ProtocolStarted',
  ProtocolCompleted: 'coordination.ProtocolCompleted',
  ProtocolFailed: 'coordination.ProtocolFailed',
  ProtocolCancelled: 'coordination.ProtocolCancelled',
  ActionStarted: 'coordination.ActionStarted',
  ActionCompleted: 'coordination.ActionCompleted',
  ActionFailed: 'coordination.ActionFailed',
} as const;

// ============================================================================
// Protocol Executor Implementation
// ============================================================================

export class DefaultProtocolExecutor implements ProtocolExecutor {
  private readonly protocols = new Map<string, Protocol>();
  private readonly executions = new Map<string, ExecutionContext>();
  private readonly scheduledProtocols = new Map<string, ScheduledProtocol>();

  private schedulerRunning = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly getDomainAPI: <T>(domain: DomainName) => T | undefined
  ) {}

  /**
   * Register a protocol
   */
  registerProtocol(protocol: Protocol): void {
    this.protocols.set(protocol.id, protocol);

    // Set up event-based triggers
    if (protocol.schedule.type === 'event' && protocol.enabled) {
      this.setupEventTriggers(protocol);
    }

    // Set up scheduled execution
    if (
      (protocol.schedule.type === 'cron' ||
        protocol.schedule.type === 'interval') &&
      protocol.enabled
    ) {
      this.scheduleProtocol(protocol);
    }
  }

  /**
   * Unregister a protocol
   */
  unregisterProtocol(protocolId: string): boolean {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) {
      return false;
    }

    // Clean up scheduled executions
    const scheduled = this.scheduledProtocols.get(protocolId);
    if (scheduled?.intervalId) {
      clearInterval(scheduled.intervalId);
    }
    this.scheduledProtocols.delete(protocolId);

    this.protocols.delete(protocolId);
    return true;
  }

  /**
   * Get registered protocol
   */
  getProtocol(protocolId: string): Protocol | undefined {
    return this.protocols.get(protocolId);
  }

  /**
   * List all registered protocols
   */
  listProtocols(): Protocol[] {
    return Array.from(this.protocols.values());
  }

  /**
   * Execute a protocol immediately
   */
  async execute(
    protocolId: string,
    params?: Record<string, unknown>
  ): Promise<Result<ProtocolExecution, Error>> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) {
      return err(new Error(`Protocol not found: ${protocolId}`));
    }

    if (!protocol.enabled) {
      return err(new Error(`Protocol is disabled: ${protocolId}`));
    }

    return this.executeProtocol(protocol, params);
  }

  /**
   * Execute a protocol triggered by an event
   */
  async executeOnEvent(
    protocolId: string,
    event: DomainEvent
  ): Promise<Result<ProtocolExecution, Error>> {
    const protocol = this.protocols.get(protocolId);
    if (!protocol) {
      return err(new Error(`Protocol not found: ${protocolId}`));
    }

    if (!protocol.enabled) {
      return err(new Error(`Protocol is disabled: ${protocolId}`));
    }

    return this.executeProtocol(protocol, undefined, event);
  }

  /**
   * Get execution status
   */
  getExecution(executionId: string): ProtocolExecution | undefined {
    const context = this.executions.get(executionId);
    if (!context) {
      return undefined;
    }

    return this.toImmutableExecution(context.execution);
  }

  /**
   * List active executions
   */
  listActiveExecutions(): ProtocolExecution[] {
    return Array.from(this.executions.values())
      .filter(
        (ctx) =>
          ctx.execution.status === 'running' ||
          ctx.execution.status === 'paused'
      )
      .map((ctx) => this.toImmutableExecution(ctx.execution));
  }

  /**
   * Cancel an execution
   */
  async cancelExecution(executionId: string): Promise<Result<void, Error>> {
    const context = this.executions.get(executionId);
    if (!context) {
      return err(new Error(`Execution not found: ${executionId}`));
    }

    if (
      context.execution.status !== 'running' &&
      context.execution.status !== 'paused'
    ) {
      return err(
        new Error(`Cannot cancel execution in status: ${context.execution.status}`)
      );
    }

    context.cancelled = true;
    context.execution.status = 'cancelled';
    context.execution.completedAt = new Date();

    await this.publishEvent(ProtocolEvents.ProtocolCancelled, {
      executionId,
      protocolId: context.protocol.id,
    });

    return ok(undefined);
  }

  /**
   * Pause an execution
   */
  async pauseExecution(executionId: string): Promise<Result<void, Error>> {
    const context = this.executions.get(executionId);
    if (!context) {
      return err(new Error(`Execution not found: ${executionId}`));
    }

    if (context.execution.status !== 'running') {
      return err(
        new Error(`Cannot pause execution in status: ${context.execution.status}`)
      );
    }

    context.paused = true;
    context.execution.status = 'paused';

    return ok(undefined);
  }

  /**
   * Resume a paused execution
   */
  async resumeExecution(executionId: string): Promise<Result<void, Error>> {
    const context = this.executions.get(executionId);
    if (!context) {
      return err(new Error(`Execution not found: ${executionId}`));
    }

    if (context.execution.status !== 'paused') {
      return err(
        new Error(`Cannot resume execution in status: ${context.execution.status}`)
      );
    }

    context.paused = false;
    context.execution.status = 'running';

    // Continue execution from where it left off
    // Note: In a real implementation, this would resume the execution loop
    return ok(undefined);
  }

  /**
   * Start the scheduler for periodic protocol execution
   */
  startScheduler(): void {
    if (this.schedulerRunning) {
      return;
    }

    this.schedulerRunning = true;

    // Set up intervals for scheduled protocols
    for (const protocol of this.protocols.values()) {
      if (protocol.enabled) {
        if (
          protocol.schedule.type === 'interval' ||
          protocol.schedule.type === 'cron'
        ) {
          this.scheduleProtocol(protocol);
        }
      }
    }
  }

  /**
   * Stop the scheduler
   */
  stopScheduler(): void {
    this.schedulerRunning = false;

    // Clear all intervals
    for (const scheduled of this.scheduledProtocols.values()) {
      if (scheduled.intervalId) {
        clearInterval(scheduled.intervalId);
        scheduled.intervalId = undefined;
      }
    }
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    this.stopScheduler();
    this.protocols.clear();
    this.executions.clear();
    this.scheduledProtocols.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Execute a protocol
   */
  private async executeProtocol(
    protocol: Protocol,
    params?: Record<string, unknown>,
    triggeringEvent?: DomainEvent
  ): Promise<Result<ProtocolExecution, Error>> {
    const executionId = uuidv4();
    const correlationId = triggeringEvent?.correlationId ?? executionId;

    // Create execution context
    const execution: MutableProtocolExecution = {
      executionId,
      protocolId: protocol.id,
      status: 'running',
      participants: [...protocol.participants],
      results: new Map(),
      startedAt: new Date(),
      correlationId,
      triggeredBy: triggeringEvent,
    };

    const context: ExecutionContext = {
      execution,
      protocol,
      params,
      actionResults: new Map(),
      cancelled: false,
      paused: false,
    };

    this.executions.set(executionId, context);

    // Publish start event
    await this.publishEvent(
      ProtocolEvents.ProtocolStarted,
      {
        executionId,
        protocolId: protocol.id,
        participants: protocol.participants,
      },
      correlationId
    );

    try {
      // Execute actions
      await this.executeActions(context);

      // Check for failures
      const hasFailures = Array.from(context.actionResults.values()).some(
        (r) => r.status === 'failed'
      );

      if (context.cancelled) {
        execution.status = 'cancelled';
      } else if (hasFailures) {
        execution.status = 'failed';
        await this.publishEvent(
          ProtocolEvents.ProtocolFailed,
          {
            executionId,
            protocolId: protocol.id,
            failedActions: Array.from(context.actionResults.values())
              .filter((r) => r.status === 'failed')
              .map((r) => r.actionId),
          },
          correlationId
        );
      } else {
        execution.status = 'completed';
        await this.publishEvent(
          ProtocolEvents.ProtocolCompleted,
          {
            executionId,
            protocolId: protocol.id,
            duration: Date.now() - execution.startedAt.getTime(),
          },
          correlationId
        );
      }

      execution.completedAt = new Date();
      execution.results = context.actionResults;

      // Store execution history
      await this.storeExecutionHistory(execution);

      return ok(this.toImmutableExecution(execution));
    } catch (error) {
      execution.status = 'failed';
      execution.completedAt = new Date();

      await this.publishEvent(
        ProtocolEvents.ProtocolFailed,
        {
          executionId,
          protocolId: protocol.id,
          error: error instanceof Error ? error.message : String(error),
        },
        correlationId
      );

      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Execute protocol actions respecting dependencies
   */
  private async executeActions(context: ExecutionContext): Promise<void> {
    const { protocol, actionResults } = context;
    const pending = new Set(protocol.actions.map((a) => a.id));
    const completed = new Set<string>();

    while (pending.size > 0 && !context.cancelled) {
      // Wait while paused
      while (context.paused && !context.cancelled) {
        await this.sleep(100);
      }

      if (context.cancelled) break;

      // Find actions that can be executed (dependencies satisfied)
      const readyActions = protocol.actions.filter(
        (action) =>
          pending.has(action.id) &&
          this.dependenciesSatisfied(action, completed)
      );

      if (readyActions.length === 0 && pending.size > 0) {
        // Deadlock - some actions can't be executed
        throw new Error(
          `Deadlock detected: actions ${Array.from(pending).join(', ')} cannot proceed`
        );
      }

      // Execute ready actions in parallel
      const results = await Promise.allSettled(
        readyActions.map((action) => this.executeAction(action, context))
      );

      // Process results
      for (let i = 0; i < readyActions.length; i++) {
        const action = readyActions[i];
        const result = results[i];

        let actionResult: ActionExecutionResult;

        if (result.status === 'fulfilled') {
          actionResult = result.value;
        } else {
          actionResult = {
            actionId: action.id,
            status: 'failed',
            error: result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          };
        }

        actionResults.set(action.id, actionResult);
        pending.delete(action.id);

        if (actionResult.status === 'completed') {
          completed.add(action.id);
        }
      }
    }

    // Mark remaining actions as cancelled or skipped
    for (const actionId of pending) {
      actionResults.set(actionId, {
        actionId,
        status: context.cancelled ? 'cancelled' : 'skipped',
      });
    }
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    action: ProtocolAction,
    context: ExecutionContext
  ): Promise<ActionExecutionResult> {
    const startedAt = new Date();

    await this.publishEvent(
      ProtocolEvents.ActionStarted,
      {
        executionId: context.execution.executionId,
        actionId: action.id,
        actionName: action.name,
        targetDomain: action.targetDomain,
      },
      context.execution.correlationId
    );

    let attempts = 0;
    const maxAttempts = action.retry?.maxAttempts ?? 1;
    let lastError: Error | undefined;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        // Get domain API
        const api = this.getDomainAPI(action.targetDomain);
        if (!api) {
          throw new Error(`Domain API not available: ${action.targetDomain}`);
        }

        // Invoke method
        const method = (api as Record<string, unknown>)[action.method];
        if (typeof method !== 'function') {
          throw new Error(
            `Method ${action.method} not found on domain ${action.targetDomain}`
          );
        }

        // Merge parameters
        const params = {
          ...action.params,
          ...context.params,
        };

        // Execute with timeout
        const result = await this.executeWithTimeout(
          method.bind(api)(params),
          action.timeout ?? 30000
        );

        const completedAt = new Date();

        await this.publishEvent(
          ProtocolEvents.ActionCompleted,
          {
            executionId: context.execution.executionId,
            actionId: action.id,
            duration: completedAt.getTime() - startedAt.getTime(),
          },
          context.execution.correlationId
        );

        return {
          actionId: action.id,
          status: 'completed',
          startedAt,
          completedAt,
          duration: completedAt.getTime() - startedAt.getTime(),
          result,
          retryAttempts: attempts > 1 ? attempts - 1 : undefined,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Retry if configured and not last attempt
        if (attempts < maxAttempts && action.retry) {
          const backoff = action.retry.backoffMs *
            Math.pow(action.retry.backoffMultiplier ?? 2, attempts - 1);
          await this.sleep(backoff);
        }
      }
    }

    // All retries failed
    const completedAt = new Date();

    await this.publishEvent(
      ProtocolEvents.ActionFailed,
      {
        executionId: context.execution.executionId,
        actionId: action.id,
        error: lastError?.message ?? 'Unknown error',
        attempts,
      },
      context.execution.correlationId
    );

    return {
      actionId: action.id,
      status: 'failed',
      startedAt,
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      error: lastError?.message ?? 'Unknown error',
      retryAttempts: attempts > 1 ? attempts - 1 : undefined,
    };
  }

  /**
   * Check if all dependencies of an action are satisfied
   */
  private dependenciesSatisfied(
    action: ProtocolAction,
    completed: Set<string>
  ): boolean {
    if (!action.dependsOn || action.dependsOn.length === 0) {
      return true;
    }
    return action.dependsOn.every((dep) => completed.has(dep));
  }

  /**
   * Execute a promise with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Action timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Set up event-based triggers for a protocol
   */
  private setupEventTriggers(protocol: Protocol): void {
    if (protocol.schedule.type !== 'event') return;

    for (const eventType of protocol.schedule.triggerEvents) {
      this.eventBus.subscribe(eventType, async (event) => {
        await this.executeOnEvent(protocol.id, event);
      });
    }
  }

  /**
   * Schedule a protocol for periodic execution
   */
  private scheduleProtocol(protocol: Protocol): void {
    if (protocol.schedule.type === 'interval') {
      const scheduled: ScheduledProtocol = {
        protocolId: protocol.id,
        schedule: protocol.schedule,
      };

      scheduled.intervalId = setInterval(async () => {
        if (this.schedulerRunning) {
          await this.execute(protocol.id);
        }
      }, protocol.schedule.intervalMs);

      this.scheduledProtocols.set(protocol.id, scheduled);
    }
    // Note: Cron support would require a cron parser library
  }

  /**
   * Store execution history in memory
   */
  private async storeExecutionHistory(
    execution: MutableProtocolExecution
  ): Promise<void> {
    const key = `protocol-execution:${execution.executionId}`;
    await this.memory.set(
      key,
      {
        ...execution,
        results: Object.fromEntries(execution.results),
      },
      {
        namespace: 'coordination',
        ttl: 86400000, // 24 hours
      }
    );
  }

  /**
   * Convert mutable execution to immutable
   */
  private toImmutableExecution(
    execution: MutableProtocolExecution
  ): ProtocolExecution {
    return {
      executionId: execution.executionId,
      protocolId: execution.protocolId,
      status: execution.status,
      participants: [...execution.participants],
      results: new Map(execution.results),
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      correlationId: execution.correlationId,
      triggeredBy: execution.triggeredBy,
    };
  }

  /**
   * Publish a coordination event
   */
  private async publishEvent<T>(
    type: string,
    payload: T,
    correlationId?: string
  ): Promise<void> {
    const event = createEvent(
      type,
      'learning-optimization', // Using learning-optimization as coordination domain
      payload,
      correlationId
    );
    await this.eventBus.publish(event);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createProtocolExecutor(
  eventBus: EventBus,
  memory: MemoryBackend,
  getDomainAPI: <T>(domain: DomainName) => T | undefined
): ProtocolExecutor {
  return new DefaultProtocolExecutor(eventBus, memory, getDomainAPI);
}
