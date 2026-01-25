/**
 * Task Instrumentation - OpenTelemetry spans for task lifecycle
 *
 * Provides comprehensive tracing for task orchestration, distribution,
 * and execution across the agent fleet. Supports parent-child task
 * relationships and distributed tracing.
 *
 * @module telemetry/instrumentation/task
 */

import { Span, SpanStatusCode, trace, context, Context } from '@opentelemetry/api';
import { getTracer } from '../bootstrap';
import { SPAN_NAMES, TaskAttributes, QEAttributes } from '../types';
import { QETask } from '../../types';

/**
 * Task span configuration
 */
export interface TaskSpanConfig {
  /** Task to trace */
  task: QETask;
  /** Parent span context */
  parentContext?: Context;
  /** Additional QE-specific attributes */
  qeAttributes?: Partial<QEAttributes>;
}

/**
 * Task result metadata
 */
export interface TaskResult {
  /** Execution time in milliseconds */
  executionTime?: number;
  /** Tokens used by LLM */
  tokensUsed?: number;
  /** Cost in USD */
  cost?: number;
  /** Test framework used */
  framework?: string;
  /** Coverage percentage */
  coverage?: number;
  /** Quality score */
  qualityScore?: number;
  /** Additional metrics */
  metrics?: Record<string, number>;
}

/**
 * Task lifecycle span manager
 *
 * Manages OpenTelemetry spans for task orchestration and execution
 * with support for hierarchical task relationships and distributed tracing.
 */
export class TaskSpanManager {
  private readonly tracer = getTracer();
  private activeSpans = new Map<string, Span>();

  /**
   * Start task orchestration span
   *
   * Records task distribution and coordination across the fleet.
   *
   * @param task - Task being orchestrated
   * @param fleetId - Fleet identifier
   * @param agentCount - Number of agents involved
   * @returns Active span with context
   */
  startOrchestrationSpan(
    task: QETask,
    fleetId?: string,
    agentCount?: number
  ): { span: Span; context: Context } {
    const span = this.tracer.startSpan(SPAN_NAMES.FLEET_DISTRIBUTE_TASK, {
      attributes: {
        ...this.buildTaskAttributes(task),
        ...(fleetId && { 'fleet.id': fleetId }),
        ...(agentCount && { 'fleet.agent_count': agentCount }),
      },
    });

    this.activeSpans.set(`orchestrate:${task.id}`, span);

    span.addEvent('task.orchestration.started', {
      'task.id': task.id,
      'task.type': task.type,
    });

    const spanContext = trace.setSpan(context.active(), span);
    return { span, context: spanContext };
  }

  /**
   * Complete task orchestration span
   *
   * @param taskId - Task identifier
   * @param success - Whether orchestration was successful
   * @param agentsAssigned - Number of agents assigned
   * @param error - Error if orchestration failed
   */
  completeOrchestrationSpan(
    taskId: string,
    success: boolean,
    agentsAssigned?: number,
    error?: Error
  ): void {
    const span = this.activeSpans.get(`orchestrate:${taskId}`);
    if (!span) {
      console.warn(`[TaskSpanManager] No orchestration span found for task ${taskId}`);
      return;
    }

    if (agentsAssigned !== undefined) {
      span.setAttribute('task.agents_assigned', agentsAssigned);
    }

    if (success) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.addEvent('task.orchestration.completed', {
        'task.id': taskId,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error?.message || 'Task orchestration failed',
      });
      if (error) {
        span.recordException(error);
      }
    }

    span.end();
    this.activeSpans.delete(`orchestrate:${taskId}`);
  }

  /**
   * Start task execution span
   *
   * Records task execution with semantic attributes for task type,
   * priority, and QE-specific metadata.
   *
   * @param config - Task span configuration
   * @returns Active span with context
   */
  startExecutionSpan(config: TaskSpanConfig): { span: Span; context: Context } {
    const { task, parentContext, qeAttributes } = config;

    const spanContext = parentContext || context.active();
    const span = this.tracer.startSpan(
      this.getSpanNameForTaskType(task.type),
      {
        attributes: {
          ...this.buildTaskAttributes(task),
          ...qeAttributes,
        },
      },
      spanContext
    );

    this.activeSpans.set(`execute:${task.id}`, span);

    span.addEvent('task.execution.started', {
      'task.id': task.id,
      'task.type': task.type,
    });

    const execContext = trace.setSpan(context.active(), span);
    return { span, context: execContext };
  }

  /**
   * Complete task execution span
   *
   * @param taskId - Task identifier
   * @param success - Whether execution was successful
   * @param result - Task execution result
   * @param error - Error if execution failed
   */
  completeExecutionSpan(
    taskId: string,
    success: boolean,
    result?: TaskResult,
    error?: Error
  ): void {
    const span = this.activeSpans.get(`execute:${taskId}`);
    if (!span) {
      console.warn(`[TaskSpanManager] No execution span found for task ${taskId}`);
      return;
    }

    // Add result metrics
    if (result) {
      if (result.executionTime !== undefined) {
        span.setAttribute('task.execution_time_ms', result.executionTime);
      }
      if (result.tokensUsed !== undefined) {
        span.setAttribute('task.tokens_used', result.tokensUsed);
      }
      if (result.cost !== undefined) {
        span.setAttribute('task.cost_usd', result.cost);
      }
      if (result.framework) {
        span.setAttribute('qe.test_framework', result.framework);
      }
      if (result.coverage !== undefined) {
        span.setAttribute('qe.coverage_percent', result.coverage);
      }
      if (result.qualityScore !== undefined) {
        span.setAttribute('qe.quality_score', result.qualityScore);
      }
      if (result.metrics) {
        for (const [key, value] of Object.entries(result.metrics)) {
          span.setAttribute(`task.metric.${key}`, value);
        }
      }
    }

    if (success) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.addEvent('task.execution.completed', {
        'task.id': taskId,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error?.message || 'Task execution failed',
      });
      if (error) {
        span.recordException(error);
      }
      span.addEvent('task.execution.failed', {
        'task.id': taskId,
        'error.message': error?.message || 'Unknown error',
      });
    }

    span.end();
    this.activeSpans.delete(`execute:${taskId}`);
  }

  /**
   * Record task status change
   *
   * @param taskId - Task identifier
   * @param oldStatus - Previous status
   * @param newStatus - New status
   */
  recordStatusChange(
    taskId: string,
    oldStatus: string,
    newStatus: string
  ): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent('task.status.changed', {
        'task.id': taskId,
        'task.status.old': oldStatus,
        'task.status.new': newStatus,
      });
    }
  }

  /**
   * Record task retry
   *
   * @param taskId - Task identifier
   * @param attempt - Retry attempt number
   * @param reason - Reason for retry
   */
  recordRetry(taskId: string, attempt: number, reason?: string): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent('task.retry', {
        'task.id': taskId,
        'task.retry.attempt': attempt,
        ...(reason && { 'task.retry.reason': reason }),
      });
    }
  }

  /**
   * Record task cancellation
   *
   * @param taskId - Task identifier
   * @param reason - Cancellation reason
   */
  recordCancellation(taskId: string, reason?: string): void {
    const span = this.activeSpans.get(`execute:${taskId}`);
    if (span) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: reason || 'Task cancelled',
      });
      span.addEvent('task.cancelled', {
        'task.id': taskId,
        ...(reason && { 'task.cancellation.reason': reason }),
      });
      span.end();
      this.activeSpans.delete(`execute:${taskId}`);
    }
  }

  /**
   * Cleanup all active spans
   */
  cleanup(): void {
    for (const [key, span] of this.activeSpans.entries()) {
      console.warn(`[TaskSpanManager] Force-ending orphaned span: ${key}`);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'Span ended during cleanup',
      });
      span.end();
    }
    this.activeSpans.clear();
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

  /**
   * Get appropriate span name for task type
   */
  private getSpanNameForTaskType(taskType: string): string {
    const spanMap: Record<string, string> = {
      'unit-test': SPAN_NAMES.AGENT_GENERATE_TESTS,
      'integration-test': SPAN_NAMES.AGENT_GENERATE_TESTS,
      'coverage-analysis': SPAN_NAMES.AGENT_ANALYZE_COVERAGE,
      'quality-gate': SPAN_NAMES.AGENT_VALIDATE_QUALITY,
      'security-scan': SPAN_NAMES.AGENT_SCAN_SECURITY,
    };

    return spanMap[taskType] || SPAN_NAMES.AGENT_EXECUTE_TASK;
  }
}

/**
 * Global task span manager instance
 */
export const taskSpanManager = new TaskSpanManager();

/**
 * Execute function within task span context
 *
 * @param task - Task being executed
 * @param fn - Function to execute
 * @param qeAttributes - QE-specific attributes
 * @returns Function result
 */
export async function withTaskSpan<T>(
  task: QETask,
  fn: (context: Context) => Promise<T>,
  qeAttributes?: Partial<QEAttributes>
): Promise<T> {
  const { span, context: spanContext } = taskSpanManager.startExecutionSpan({
    task,
    qeAttributes,
  });

  const startTime = Date.now();

  try {
    const result = await fn(spanContext);
    const executionTime = Date.now() - startTime;

    taskSpanManager.completeExecutionSpan(task.id, true, {
      executionTime,
    });

    return result;
  } catch (error) {
    const executionTime = Date.now() - startTime;

    taskSpanManager.completeExecutionSpan(task.id, false, { executionTime }, error as Error);
    throw error;
  }
}
