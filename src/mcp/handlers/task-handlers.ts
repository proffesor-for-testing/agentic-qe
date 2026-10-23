/**
 * Agentic QE v3 - Task MCP Handlers
 * Task submission, status, and management handlers
 *
 * ADR-051: Integrated with Model Router for intelligent tier selection
 * Issue #206: Workflow auto-execution for task types with associated workflows
 */

import { getFleetState, isFleetInitialized } from './core-handlers';
import {
  ToolResult,
  TaskSubmitParams,
  TaskSubmitResult,
  TaskListParams,
  TaskStatusParams,
  TaskStatusResult,
  TaskCancelParams,
} from '../types';
import { TaskType } from '../../coordination/queen-coordinator';
import { toErrorMessage } from '../../shared/error-utils.js';
import { ALL_DOMAINS, invalidPriorityMessage, isDomainName, isPriority } from '../../shared/types/index.js';
import { validateIndexTaskPayload } from '../../domains/code-intelligence/index-path-guard.js';

// #1146: task_orchestrate, model routing and the learning handlers live in
// their own modules; they are re-exported so existing imports keep working.
export * from './task-orchestrate-handler.js';
export * from './model-route-handlers.js';
export * from './task-learning-handlers.js';

// ============================================================================
// Task Submit Handler
// ============================================================================

export async function handleTaskSubmit(
  params: TaskSubmitParams
): Promise<ToolResult<TaskSubmitResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  // #734 D: reject unknown domains instead of accepting work no domain runs.
  // Parity with `aqe task submit --domain`.
  const targetDomains: unknown = params.targetDomains ?? [];
  if (!Array.isArray(targetDomains) || !targetDomains.every(isDomainName)) {
    const unknown = Array.isArray(targetDomains)
      ? targetDomains.filter((d) => !isDomainName(d)).map(String)
      : [String(targetDomains)];
    return {
      success: false,
      error: `Unknown domain: ${unknown.join(', ')}. Valid domains: ${ALL_DOMAINS.join(', ')}`,
    };
  }

  // #1108: reject a priority outside the allowed set. Parity with
  // `aqe task submit --priority`.
  if (params.priority !== undefined && !isPriority(params.priority)) {
    return { success: false, error: invalidPriorityMessage(params.priority) };
  }

  const { queen } = getFleetState();

  // #1075: reject a type that no domain plugin executes. Accepting it would
  // leave the task running forever and hold one of the Queen's slots.
  const executable = queen!.validateTaskExecutable(params.type as TaskType, targetDomains);
  if (!executable.success) {
    return { success: false, error: executable.error.message };
  }

  // #1096: reject a malformed index path list here rather than deep inside
  // indexing. Same order of checks as `aqe task submit`.
  const payloadError = validateIndexTaskPayload(params.type, params.payload);
  if (payloadError) {
    return { success: false, error: payloadError.message };
  }

  try {
    const result = await queen!.submitTask({
      type: params.type as TaskType,
      priority: params.priority || 'p1',
      targetDomains,
      payload: params.payload || {},
      timeout: params.timeout || 300000,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    // Get task status for response
    const taskStatus = queen!.getTaskStatus(result.value);
    if (!taskStatus) {
      return { success: false, error: `Task ${result.value} was accepted but its execution status is unavailable.` };
    }

    return {
      success: true,
      data: {
        taskId: result.value,
        type: params.type,
        priority: params.priority || 'p1',
        status: taskStatus.status,
        error: taskStatus.error,
        assignedDomain: taskStatus.assignedDomain,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to submit task: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// Task List Handler
// ============================================================================

export async function handleTaskList(
  params: TaskListParams
): Promise<ToolResult<TaskStatusResult[]>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  // A priority outside the allowed set is an error, not an empty list.
  // Parity with `aqe task list --priority`.
  if (params.priority !== undefined && !isPriority(params.priority)) {
    return { success: false, error: invalidPriorityMessage(params.priority) };
  }

  const { queen } = getFleetState();

  try {
    const tasks = queen!.listTasks({
      status: params.status,
      priority: params.priority,
      domain: params.domain,
    });

    // Apply limit if specified (use typeof check to handle limit: 0)
    const limitedTasks = typeof params.limit === 'number' ? tasks.slice(0, params.limit) : tasks;

    const results: TaskStatusResult[] = limitedTasks.map((execution) => ({
      taskId: execution.taskId,
      type: execution.task.type,
      status: execution.status,
      cancellationResultPending: execution.cancellationResultPending,
      priority: execution.task.priority,
      assignedDomain: execution.assignedDomain,
      assignedAgents: execution.assignedAgents,
      result: execution.result,
      error: execution.error,
      createdAt: execution.task.createdAt.toISOString(),
      startedAt: execution.startedAt?.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      duration: execution.completedAt && execution.startedAt
        ? execution.completedAt.getTime() - execution.startedAt.getTime()
        : undefined,
    }));

    return {
      success: true,
      data: results,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list tasks: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// Task Status Handler
// ============================================================================

export async function handleTaskStatus(
  params: TaskStatusParams
): Promise<ToolResult<TaskStatusResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const execution = queen!.getTaskStatus(params.taskId);

    if (!execution) {
      return {
        success: false,
        error: `Task not found: ${params.taskId}`,
      };
    }

    const result: TaskStatusResult = {
      taskId: execution.taskId,
      type: execution.task.type,
      status: execution.status,
      cancellationResultPending: execution.cancellationResultPending,
      priority: execution.task.priority,
      assignedDomain: execution.assignedDomain,
      assignedAgents: execution.assignedAgents,
      result: params.detailed ? execution.result : undefined,
      error: execution.error,
      createdAt: execution.task.createdAt.toISOString(),
      startedAt: execution.startedAt?.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      duration: execution.completedAt && execution.startedAt
        ? execution.completedAt.getTime() - execution.startedAt.getTime()
        : undefined,
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get task status: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// Task Cancel Handler
// ============================================================================

export async function handleTaskCancel(
  params: TaskCancelParams
): Promise<ToolResult<{ taskId: string; cancelled: boolean; cancellationResultPending: boolean }>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const result = await queen!.cancelTask(params.taskId);

    if (!result.success) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      data: {
        taskId: params.taskId,
        cancelled: true,
        cancellationResultPending: queen!.getTaskStatus(params.taskId)?.cancellationResultPending ?? false,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to cancel task: ${toErrorMessage(error)}`,
    };
  }
}
