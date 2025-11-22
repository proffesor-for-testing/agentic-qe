/**
 * Agent Instrumentation - OpenTelemetry spans for agent lifecycle
 *
 * Provides comprehensive tracing for all 18 QE agents with semantic attributes
 * following OpenTelemetry conventions. Automatically instruments agent lifecycle
 * events: spawn, execute, complete, error.
 *
 * @module telemetry/instrumentation/agent
 */

import { Span, SpanStatusCode, trace, context, Context } from '@opentelemetry/api';
import { getTracer } from '../bootstrap';
import { SPAN_NAMES, AgentAttributes, TaskAttributes, QEAttributes } from '../types';
import { AgentId, AgentStatus, QETask, AgentCapability } from '../../types';

/**
 * Agent span configuration
 */
export interface AgentSpanConfig {
  /** Agent identifier */
  agentId: AgentId;
  /** Agent capabilities */
  capabilities?: AgentCapability[];
  /** Fleet identifier */
  fleetId?: string;
  /** Fleet topology */
  topology?: string;
  /** Parent span context */
  parentContext?: Context;
}

/**
 * Task execution span configuration
 */
export interface TaskSpanConfig {
  /** Task to execute */
  task: QETask;
  /** Agent executing the task */
  agentId: AgentId;
  /** Parent span context */
  parentContext?: Context;
}

/**
 * Agent lifecycle span manager
 *
 * Manages OpenTelemetry spans for agent operations with automatic
 * context propagation and semantic attribute attachment.
 */
export class AgentSpanManager {
  private readonly tracer = getTracer();
  private activeSpans = new Map<string, Span>();
  private spanCleanupTimeouts?: Map<string, NodeJS.Timeout>;

  /**
   * Start agent spawn span
   *
   * Records agent creation with full metadata including capabilities,
   * fleet topology, and resource allocation.
   *
   * @param config - Agent span configuration
   * @returns Active span
   */
  startSpawnSpan(config: AgentSpanConfig): Span {
    const { agentId, capabilities, fleetId, topology, parentContext } = config;

    const spanContext = parentContext || context.active();
    const span = this.tracer.startSpan(
      SPAN_NAMES.FLEET_SPAWN_AGENT,
      {
        attributes: this.buildAgentAttributes(agentId, fleetId, topology) as any,
      },
      spanContext
    );

    // Add capability attributes
    if (capabilities && capabilities.length > 0) {
      span.setAttribute('agent.capabilities.count', capabilities.length);
      span.setAttribute(
        'agent.capabilities.names',
        capabilities.map(c => c.name).join(',')
      );
    }

    // Store span for lifecycle tracking
    this.activeSpans.set(`spawn:${agentId.id}`, span);

    span.addEvent('agent.spawn.started', {
      'agent.id': agentId.id,
      'agent.type': agentId.type,
    });

    return span;
  }

  /**
   * Complete agent spawn span
   *
   * @param agentId - Agent identifier
   * @param success - Whether spawn was successful
   * @param error - Error if spawn failed
   */
  completeSpawnSpan(
    agentId: AgentId,
    success: boolean,
    error?: Error
  ): void {
    const spanKey = `spawn:${agentId.id}`;
    const span = this.activeSpans.get(spanKey);

    if (!span) {
      console.warn(`[AgentSpanManager] No spawn span found for agent ${agentId.id}`);
      return;
    }

    if (success) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.addEvent('agent.spawn.completed', {
        'agent.id': agentId.id,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error?.message || 'Agent spawn failed',
      });
      if (error) {
        span.recordException(error);
      }
      span.addEvent('agent.spawn.failed', {
        'agent.id': agentId.id,
        'error.message': error?.message || 'Unknown error',
      });
    }

    span.end();
    this.activeSpans.delete(spanKey);
  }

  /**
   * Start agent execution span
   *
   * Records agent task execution with semantic attributes for task type,
   * priority, and execution strategy.
   *
   * @param config - Task span configuration
   * @returns Active span with context
   */
  startExecutionSpan(config: TaskSpanConfig): { span: Span; context: Context } {
    const { task, agentId, parentContext } = config;

    const spanContext = parentContext || context.active();
    const span = this.tracer.startSpan(
      SPAN_NAMES.AGENT_EXECUTE_TASK,
      {
        attributes: {
          ...this.buildAgentAttributes(agentId),
          ...this.buildTaskAttributes(task),
        },
      },
      spanContext
    );

    // Store span for lifecycle tracking
    const spanKey = `execute:${agentId.id}:${task.id}`;
    this.activeSpans.set(spanKey, span);

    // Auto-cleanup orphaned span after 5 minutes
    const cleanupTimeout = setTimeout(() => {
      if (this.activeSpans.has(spanKey)) {
        console.warn(`[AgentSpanManager] Auto-cleaning orphaned span: ${spanKey}`);
        this.completeExecutionSpan(agentId, task.id, false, undefined, new Error('Span timeout - auto-cleanup after 5 minutes'));
      }
    }, 300_000); // 5 minutes

    // Store cleanup timeout for cancellation
    if (!this.spanCleanupTimeouts) {
      this.spanCleanupTimeouts = new Map();
    }
    this.spanCleanupTimeouts.set(spanKey, cleanupTimeout);

    span.addEvent('agent.task.started', {
      'task.id': task.id,
      'task.type': task.type,
      'agent.id': agentId.id,
    });

    // Create context with active span
    const spanContext2 = trace.setSpan(context.active(), span);

    return { span, context: spanContext2 };
  }

  /**
   * Complete agent execution span
   *
   * @param agentId - Agent identifier
   * @param taskId - Task identifier
   * @param success - Whether execution was successful
   * @param result - Task execution result
   * @param error - Error if execution failed
   */
  completeExecutionSpan(
    agentId: AgentId,
    taskId: string,
    success: boolean,
    result?: any,
    error?: Error
  ): void {
    const spanKey = `execute:${agentId.id}:${taskId}`;
    const span = this.activeSpans.get(spanKey);

    if (!span) {
      console.warn(`[AgentSpanManager] No execution span found for task ${taskId}`);
      return;
    }

    // Cancel auto-cleanup timeout
    if (this.spanCleanupTimeouts?.has(spanKey)) {
      clearTimeout(this.spanCleanupTimeouts.get(spanKey)!);
      this.spanCleanupTimeouts.delete(spanKey);
    }

    // Add result metrics if available
    if (result) {
      if (typeof result.executionTime === 'number') {
        span.setAttribute('task.execution_time_ms', result.executionTime);
      }
      if (typeof result.tokensUsed === 'number') {
        span.setAttribute('task.tokens_used', result.tokensUsed);
      }
      if (typeof result.cost === 'number') {
        span.setAttribute('task.cost_usd', result.cost);
      }
    }

    if (success) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.addEvent('agent.task.completed', {
        'task.id': taskId,
        'agent.id': agentId.id,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error?.message || 'Task execution failed',
      });
      if (error) {
        span.recordException(error);
      }
      span.addEvent('agent.task.failed', {
        'task.id': taskId,
        'agent.id': agentId.id,
        'error.message': error?.message || 'Unknown error',
      });
    }

    span.end();
    this.activeSpans.delete(spanKey);
  }

  /**
   * Record agent status change
   *
   * @param agentId - Agent identifier
   * @param oldStatus - Previous status
   * @param newStatus - New status
   */
  recordStatusChange(
    agentId: AgentId,
    oldStatus: AgentStatus,
    newStatus: AgentStatus
  ): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent('agent.status.changed', {
        'agent.id': agentId.id,
        'agent.status.old': oldStatus,
        'agent.status.new': newStatus,
      });
    }
  }

  /**
   * Record agent error
   *
   * @param agentId - Agent identifier
   * @param error - Error that occurred
   * @param context - Additional context
   */
  recordError(
    agentId: AgentId,
    error: Error,
    context?: Record<string, any>
  ): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.addEvent('agent.error', {
        'agent.id': agentId.id,
        'error.message': error.message,
        'error.stack': error.stack,
        ...context,
      });
    }
  }

  /**
   * Start specialized agent operation span
   *
   * For agent-specific operations like test generation, coverage analysis, etc.
   *
   * @param operationName - Operation name (e.g., 'generate_tests', 'analyze_coverage')
   * @param agentId - Agent identifier
   * @param attributes - Additional attributes
   * @returns Active span
   */
  startOperationSpan(
    operationName: string,
    agentId: AgentId,
    attributes?: Record<string, any>
  ): Span {
    const spanName = `aqe.agent.${operationName}`;
    const span = this.tracer.startSpan(spanName, {
      attributes: {
        ...this.buildAgentAttributes(agentId),
        ...attributes,
      },
    });

    this.activeSpans.set(`operation:${agentId.id}:${operationName}`, span);

    return span;
  }

  /**
   * Complete specialized operation span
   *
   * @param operationName - Operation name
   * @param agentId - Agent identifier
   * @param success - Whether operation was successful
   * @param error - Error if operation failed
   */
  completeOperationSpan(
    operationName: string,
    agentId: AgentId,
    success: boolean,
    error?: Error
  ): void {
    const spanKey = `operation:${agentId.id}:${operationName}`;
    const span = this.activeSpans.get(spanKey);

    if (!span) {
      return;
    }

    if (success) {
      span.setStatus({ code: SpanStatusCode.OK });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error?.message || 'Operation failed',
      });
      if (error) {
        span.recordException(error);
      }
    }

    span.end();
    this.activeSpans.delete(spanKey);
  }

  /**
   * Cleanup all active spans (for graceful shutdown)
   */
  cleanup(): void {
    for (const [key, span] of this.activeSpans.entries()) {
      console.warn(`[AgentSpanManager] Force-ending orphaned span: ${key}`);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'Span ended during cleanup',
      });
      span.end();
    }
    this.activeSpans.clear();
  }

  /**
   * Build agent semantic attributes
   */
  private buildAgentAttributes(
    agentId: AgentId,
    fleetId?: string,
    topology?: string
  ): AgentAttributes {
    const attrs: AgentAttributes = {
      'agent.id': agentId.id,
      'agent.type': agentId.type,
      'agent.name': agentId.id,
    };

    if (fleetId) {
      attrs['fleet.id'] = fleetId;
    }

    if (topology) {
      attrs['fleet.topology'] = topology;
    }

    return attrs;
  }

  /**
   * Build task semantic attributes
   */
  private buildTaskAttributes(task: QETask): TaskAttributes {
    return {
      'task.id': task.id,
      'task.type': task.type,
      'task.status': task.status,
      'task.priority': task.priority as number,
      'task.parent_id': (task as any).parentId || '',
    };
  }
}

/**
 * Global agent span manager instance
 */
export const agentSpanManager = new AgentSpanManager();

/**
 * Decorator for automatically instrumenting agent methods
 *
 * @param operationName - Operation name for the span
 */
export function InstrumentAgent(operationName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: any, ...args: any[]) {
      const agentId = this.agentId as AgentId;
      const span = agentSpanManager.startOperationSpan(operationName, agentId);

      try {
        const result = await originalMethod.apply(this, args);
        agentSpanManager.completeOperationSpan(operationName, agentId, true);
        return result;
      } catch (error) {
        agentSpanManager.completeOperationSpan(
          operationName,
          agentId,
          false,
          error as Error
        );
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Execute function within agent span context
 *
 * @param operationName - Operation name
 * @param agentId - Agent identifier
 * @param fn - Function to execute
 * @param attributes - Additional span attributes
 * @returns Function result
 */
export async function withAgentSpan<T>(
  operationName: string,
  agentId: AgentId,
  fn: () => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const span = agentSpanManager.startOperationSpan(
    operationName,
    agentId,
    attributes
  );

  try {
    const result = await fn();
    agentSpanManager.completeOperationSpan(operationName, agentId, true);
    return result;
  } catch (error) {
    agentSpanManager.completeOperationSpan(
      operationName,
      agentId,
      false,
      error as Error
    );
    throw error;
  }
}
