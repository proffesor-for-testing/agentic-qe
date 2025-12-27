/**
 * Task Status Handler
 *
 * Retrieves status and progress information for orchestrated tasks.
 * Provides real-time updates on workflow execution.
 *
 * @version 1.0.0
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager.js';

/**
 * Internal interface representing a task stored in memory.
 * Used for type-safe access to retrieved task data.
 */
interface StoredTaskData {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  timeline?: TimelineEvent[];
  type?: string;
  priority?: string;
  strategy?: string;
  startedAt?: string;
  completedAt?: string;
  assignments?: AgentAssignment[];
  workflow?: WorkflowStep[];
  steps?: WorkflowStep[];
  completedSteps?: string[];
  results?: {
    metrics?: {
      resourceUtilization?: number;
      parallelismEfficiency?: number;
      coordinationOverhead?: number;
    };
  };
}

/**
 * Internal interface for workflow steps stored in memory
 */
interface WorkflowStep {
  id: string;
  name: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  estimatedDuration?: number;
}

/**
 * Type guard to check if a value is a valid stored task object
 */
function isStoredTaskData(value: unknown): value is StoredTaskData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  // Check for at least one expected property to confirm it's a task object
  const obj = value as Record<string, unknown>;
  return (
    'status' in obj ||
    'type' in obj ||
    'workflow' in obj ||
    'steps' in obj ||
    'startedAt' in obj
  );
}

export interface TaskStatusArgs {
  taskId: string;
  includeDetails?: boolean;
  includeTimeline?: boolean;
}

export interface TaskStatus {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    overall: number;
    byStep: Record<string, number>;
    completedSteps: number;
    totalSteps: number;
    estimatedCompletion?: string;
  };
  timeline?: TimelineEvent[];
  details?: {
    type: string;
    priority: string;
    strategy: string;
    startedAt?: string;
    completedAt?: string;
    duration?: number;
    assignments?: AgentAssignment[];
    workflow?: WorkflowStepStatus[];
  };
  metrics?: {
    resourceUtilization: number;
    parallelismEfficiency: number;
    coordinationOverhead: number;
  };
}

export interface TimelineEvent {
  timestamp: string;
  type: string;
  description: string;
  stepId?: string;
  agentId?: string;
}

export interface AgentAssignment {
  agentId: string;
  agentType: string;
  status: string;
  tasks: string[];
}

export interface WorkflowStepStatus {
  id: string;
  name: string;
  status: string;
  progress: number;
  startedAt?: string;
  completedAt?: string;
}

export class TaskStatusHandler extends BaseHandler {
  constructor(private memory: SwarmMemoryManager) {
    super();
  }

  async handle(args: TaskStatusArgs): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      this.log('info', 'Retrieving task status', { requestId, taskId: args.taskId });

      // Validate required fields
      this.validateRequired(args, ['taskId']);

      const { result: status, executionTime } = await this.measureExecutionTime(
        () => this.getTaskStatus(args)
      );

      this.log('info', `Task status retrieved in ${executionTime.toFixed(2)}ms`, {
        taskId: args.taskId,
        status: status.status
      });

      return this.createSuccessResponse(status, requestId);
    });
  }

  private async getTaskStatus(args: TaskStatusArgs): Promise<TaskStatus> {
    // Try to retrieve as orchestration first
    let rawTask = await this.memory.retrieve(`orchestration:${args.taskId}`, {
      partition: 'orchestrations'
    });

    // Try as workflow execution
    if (!rawTask) {
      rawTask = await this.memory.retrieve(`workflow:execution:${args.taskId}`, {
        partition: 'workflow_executions'
      });
    }

    if (!rawTask) {
      throw new Error(`Task not found: ${args.taskId}`);
    }

    // Type guard validation: ensure we have a valid task object
    if (!isStoredTaskData(rawTask)) {
      throw new Error(`Invalid task data format for: ${args.taskId}`);
    }

    // Now TypeScript knows rawTask is StoredTaskData
    const task: StoredTaskData = rawTask;

    // Build status response
    const status: TaskStatus = {
      taskId: args.taskId,
      status: task.status ?? 'running',
      progress: this.calculateProgress(task),
      // Always include timeline if available (it's useful for debugging/monitoring)
      timeline: task.timeline ?? []
    };

    // Add details if requested
    if (args.includeDetails) {
      status.details = {
        type: task.type ?? 'unknown',
        priority: task.priority ?? 'medium',
        strategy: task.strategy ?? 'adaptive',
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        duration: this.calculateDuration(task),
        assignments: task.assignments ?? [],
        workflow: this.mapWorkflowSteps(task.workflow ?? task.steps ?? [])
      };

      // Add metrics
      status.metrics = this.calculateMetrics(task);
    }

    return status;
  }

  private calculateProgress(task: StoredTaskData): TaskStatus['progress'] {
    const completedSteps = task.completedSteps?.length ?? 0;
    const totalSteps = task.workflow?.length ?? task.steps?.length ?? 1;
    const overall = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    const byStep: Record<string, number> = {};
    const steps = task.workflow ?? task.steps ?? [];
    for (const step of steps) {
      byStep[step.id] = step.status === 'completed' ? 100 :
                         step.status === 'running' ? 50 : 0;
    }

    return {
      overall: Math.round(overall * 100) / 100,
      byStep,
      completedSteps,
      totalSteps,
      estimatedCompletion: this.estimateCompletion(task)
    };
  }

  private calculateDuration(task: StoredTaskData): number | undefined {
    if (!task.startedAt) return undefined;

    const endTime = task.completedAt ? new Date(task.completedAt) : new Date();
    const startTime = new Date(task.startedAt);

    return endTime.getTime() - startTime.getTime();
  }

  private estimateCompletion(task: StoredTaskData): string | undefined {
    if (task.status === 'completed' || task.status === 'failed') {
      return undefined;
    }

    if (!task.startedAt || !task.workflow) {
      return undefined;
    }

    const totalDuration = task.workflow.reduce(
      (sum: number, step: WorkflowStep) => sum + (step.estimatedDuration ?? 0),
      0
    );

    const completionTime = new Date(new Date(task.startedAt).getTime() + totalDuration * 1000);
    return completionTime.toISOString();
  }

  private mapWorkflowSteps(steps: WorkflowStep[]): WorkflowStepStatus[] {
    return steps.map(step => ({
      id: step.id,
      name: step.name,
      status: step.status,
      progress: step.status === 'completed' ? 100 :
                step.status === 'running' ? 50 : 0,
      startedAt: step.startedAt,
      completedAt: step.completedAt
    }));
  }

  private calculateMetrics(task: StoredTaskData): TaskStatus['metrics'] {
    return {
      resourceUtilization: task.results?.metrics?.resourceUtilization ?? 0,
      parallelismEfficiency: task.results?.metrics?.parallelismEfficiency ?? 1.0,
      coordinationOverhead: task.results?.metrics?.coordinationOverhead ?? 0
    };
  }
}
