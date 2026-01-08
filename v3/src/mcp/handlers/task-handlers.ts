/**
 * Agentic QE v3 - Task MCP Handlers
 * Task submission, status, and management handlers
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

  const { queen } = getFleetState();

  try {
    const result = await queen!.submitTask({
      type: params.type as TaskType,
      priority: params.priority || 'p1',
      targetDomains: params.targetDomains || [],
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

    return {
      success: true,
      data: {
        taskId: result.value,
        type: params.type,
        priority: params.priority || 'p1',
        status: taskStatus?.status === 'running' ? 'pending' : 'queued',
        assignedDomain: taskStatus?.assignedDomain,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to submit task: ${error instanceof Error ? error.message : String(error)}`,
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

  const { queen } = getFleetState();

  try {
    const tasks = queen!.listTasks({
      status: params.status,
      priority: params.priority,
      domain: params.domain,
    });

    // Apply limit if specified
    const limitedTasks = params.limit ? tasks.slice(0, params.limit) : tasks;

    const results: TaskStatusResult[] = limitedTasks.map((execution) => ({
      taskId: execution.taskId,
      type: execution.task.type,
      status: execution.status,
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
      error: `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
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
      error: `Failed to get task status: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Task Cancel Handler
// ============================================================================

export async function handleTaskCancel(
  params: TaskCancelParams
): Promise<ToolResult<{ taskId: string; cancelled: boolean }>> {
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
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to cancel task: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Task Orchestrate Handler (High-level)
// ============================================================================

export interface TaskOrchestrateParams {
  task: string;
  strategy?: 'parallel' | 'sequential' | 'adaptive';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  maxAgents?: number;
  context?: {
    project?: string;
    branch?: string;
    environment?: string;
    requirements?: string[];
  };
}

export async function handleTaskOrchestrate(
  params: TaskOrchestrateParams
): Promise<ToolResult<Record<string, unknown>>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    // Parse task description to determine task type
    const taskType = inferTaskType(params.task);
    const priority = mapPriority(params.priority || 'medium');

    // Submit the task
    const result = await queen!.submitTask({
      type: taskType,
      priority,
      targetDomains: [],
      payload: {
        description: params.task,
        strategy: params.strategy || 'adaptive',
        maxAgents: params.maxAgents,
        context: params.context,
      },
      timeout: 600000, // 10 minutes for orchestrated tasks
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      data: {
        taskId: result.value,
        type: taskType,
        priority,
        strategy: params.strategy || 'adaptive',
        status: 'submitted',
        message: `Task orchestrated: ${params.task}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to orchestrate task: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Infer task type from description
 */
function inferTaskType(description: string): TaskType {
  const lower = description.toLowerCase();

  if (lower.includes('generate test') || lower.includes('create test') || lower.includes('write test')) {
    return 'generate-tests';
  }
  if (lower.includes('run test') || lower.includes('execute test')) {
    return 'execute-tests';
  }
  if (lower.includes('coverage') || lower.includes('uncovered')) {
    return 'analyze-coverage';
  }
  if (lower.includes('quality') || lower.includes('code quality')) {
    return 'assess-quality';
  }
  if (lower.includes('defect') || lower.includes('bug') || lower.includes('predict')) {
    return 'predict-defects';
  }
  if (lower.includes('requirement') || lower.includes('bdd') || lower.includes('acceptance')) {
    return 'validate-requirements';
  }
  if (lower.includes('index') || lower.includes('knowledge graph') || lower.includes('semantic')) {
    return 'index-code';
  }
  if (lower.includes('security') || lower.includes('vulnerability') || lower.includes('owasp')) {
    return 'scan-security';
  }
  if (lower.includes('contract') || lower.includes('api contract') || lower.includes('pact')) {
    return 'validate-contracts';
  }
  if (lower.includes('accessibility') || lower.includes('a11y') || lower.includes('wcag')) {
    return 'test-accessibility';
  }
  if (lower.includes('chaos') || lower.includes('resilience') || lower.includes('fault')) {
    return 'run-chaos';
  }
  if (lower.includes('learn') || lower.includes('optimize') || lower.includes('improve')) {
    return 'optimize-learning';
  }

  // Default to test generation
  return 'generate-tests';
}

/**
 * Map priority string to Priority type
 */
function mapPriority(priority: string): 'p0' | 'p1' | 'p2' | 'p3' {
  switch (priority) {
    case 'critical':
      return 'p0';
    case 'high':
      return 'p1';
    case 'medium':
      return 'p2';
    case 'low':
      return 'p3';
    default:
      return 'p1';
  }
}
