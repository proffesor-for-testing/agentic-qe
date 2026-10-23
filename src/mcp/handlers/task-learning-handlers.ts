/**
 * Agentic QE v3 - Task learning MCP handlers (ADR-051)
 * Task outcome recording, ReasoningBank stats, task status with learning and
 * the trajectory event subscriptions.
 */

import { getFleetState, isFleetInitialized } from './core-handlers';
import type { ToolResult, TaskStatusParams, TaskStatusResult } from '../types';
import {
  getReasoningBankService,
  endTaskTrajectory,
  type TaskOutcome,
} from '../services/reasoning-bank-service';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// ReasoningBank Integration (ADR-051)
// Record task outcomes for learning and pattern discovery
// ============================================================================

export interface TaskOutcomeRecordParams {
  /** Task ID */
  taskId: string;
  /** Task description */
  task: string;
  /** Task type */
  taskType: string;
  /** Whether the task succeeded */
  success: boolean;
  /** Execution time in ms */
  executionTimeMs: number;
  /** Agent that executed the task */
  agentId?: string;
  /** Domain */
  domain?: string;
  /** Model tier used */
  modelTier?: number;
  /** Quality score (0-1) */
  qualityScore?: number;
  /** Error message if failed */
  error?: string;
  /** Additional metrics */
  metrics?: {
    tokensUsed?: number;
    testsGenerated?: number;
    testsPassed?: number;
    coverageImprovement?: number;
  };
}

export interface TaskOutcomeRecordResult {
  recorded: boolean;
  patternStored: boolean;
  message: string;
}

/**
 * Record a task outcome for ReasoningBank learning
 * ADR-051: Enables cross-session learning from task execution
 */
export async function handleTaskOutcomeRecord(
  params: TaskOutcomeRecordParams
): Promise<ToolResult<TaskOutcomeRecordResult>> {
  try {
    const service = await getReasoningBankService();

    const outcome: TaskOutcome = {
      taskId: params.taskId,
      task: params.task,
      taskType: params.taskType,
      success: params.success,
      executionTimeMs: params.executionTimeMs,
      agentId: params.agentId,
      domain: params.domain,
      modelTier: params.modelTier,
      qualityScore: params.qualityScore,
      error: params.error,
      metrics: params.metrics,
    };

    await service.recordTaskOutcome(outcome);

    const patternStored = params.success && (params.qualityScore || 0.5) >= 0.6;

    return {
      success: true,
      data: {
        recorded: true,
        patternStored,
        message: patternStored
          ? `Outcome recorded and pattern stored for task ${params.taskId}`
          : `Outcome recorded for task ${params.taskId}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to record task outcome: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// ReasoningBank Stats Handler
// ============================================================================

export interface ReasoningBankStatsResult {
  service: {
    tasksRecorded: number;
    successfulTasks: number;
    failedTasks: number;
    successRate: number;
    patternsStored: number;
    routingRequests: number;
  };
  patterns: {
    totalPatterns: number;
    byDomain: Record<string, number>;
    byTier: Record<string, number>;
    learningOutcomes: number;
    patternSuccessRate: number;
  };
  embeddings: {
    cacheSize: number;
    dimension: number;
    transformerAvailable: boolean;
  };
  performance: {
    avgRoutingLatencyMs: number;
    p95RoutingLatencyMs: number;
  };
}

/**
 * Get ReasoningBank statistics
 * ADR-051: Provides visibility into learning system
 */
export async function handleReasoningBankStats(): Promise<ToolResult<ReasoningBankStatsResult>> {
  try {
    const service = await getReasoningBankService();
    const stats = await service.getStats();

    return {
      success: true,
      data: {
        service: stats.service,
        patterns: {
          totalPatterns: stats.reasoningBank.totalPatterns,
          byDomain: stats.reasoningBank.byDomain,
          byTier: stats.reasoningBank.byTier,
          learningOutcomes: stats.reasoningBank.learningOutcomes,
          patternSuccessRate: stats.reasoningBank.patternSuccessRate,
        },
        embeddings: {
          cacheSize: stats.reasoningBank.embeddingCacheSize,
          dimension: stats.reasoningBank.embeddingDimension,
          transformerAvailable: stats.reasoningBank.transformerAvailable,
        },
        performance: {
          avgRoutingLatencyMs: stats.reasoningBank.avgRoutingLatencyMs,
          p95RoutingLatencyMs: stats.reasoningBank.p95RoutingLatencyMs,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get ReasoningBank stats: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// Task Complete Handler with Learning
// Records outcome when task status is queried and complete
// ============================================================================

// Track tasks we've already recorded to avoid duplicates
const recordedTasks = new Set<string>();

/**
 * Enhanced task status that records outcomes for learning
 * ADR-051: Automatically records completed task outcomes
 * INTEGRATION FIX: Now synchronous to ensure learning occurs
 */
export async function handleTaskStatusWithLearning(
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

    // INTEGRATION FIX: Record outcome for completed tasks synchronously (only once)
    if (
      (execution.status === 'completed' || execution.status === 'failed') &&
      !recordedTasks.has(params.taskId)
    ) {
      recordedTasks.add(params.taskId);

      try {
        const service = await getReasoningBankService();
        const duration = result.duration || 0;
        const success = execution.status === 'completed';

        // Safely extract payload properties (typed as Record<string, unknown>)
        const payload = execution.task.payload || {};
        const taskDescription = typeof payload.description === 'string'
          ? payload.description
          : execution.task.type;
        const routing = payload.routing as { tier?: number } | undefined;

        // INTEGRATION FIX: End trajectory tracking first
        const trajectory = await endTaskTrajectory(
          params.taskId,
          success,
          execution.error
        );

        // Calculate quality score from trajectory if available
        const qualityScore = trajectory?.metrics.averageQuality ?? (success ? 0.7 : 0.3);

        // INTEGRATION FIX: Record outcome synchronously (await to ensure learning)
        await service.recordTaskOutcome({
          taskId: params.taskId,
          task: taskDescription,
          taskType: execution.task.type,
          success,
          executionTimeMs: duration,
          agentId: execution.assignedAgents?.[0],
          domain: execution.assignedDomain,
          modelTier: routing?.tier,
          qualityScore,
          error: execution.error,
          metrics: {
            // Extract any metrics from result if available
            testsGenerated: typeof execution.result === 'object' && execution.result
              ? (execution.result as Record<string, unknown>).testsGenerated as number | undefined
              : undefined,
            testsPassed: typeof execution.result === 'object' && execution.result
              ? (execution.result as Record<string, unknown>).testsPassed as number | undefined
              : undefined,
          },
        });

        console.error(
          `[TaskHandler] Recorded learning outcome: task=${params.taskId} ` +
          `success=${success} quality=${qualityScore.toFixed(2)} ` +
          `trajectorySteps=${trajectory?.steps.length ?? 0}`
        );
      } catch (err) {
        // Log but don't fail the response - learning is important but not blocking
        console.error('[TaskHandler] Failed to record outcome:', err);
      }
    }

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
// Issue N1: Event-driven trajectory auto-close
// Subscribe to TaskCompleted/TaskFailed events so trajectories are closed
// by the event system, not by per-task polling loops.
// Called once during fleet init.
// ============================================================================

/** Subscription IDs for cleanup on fleet dispose */
let trajectorySubscriptionIds: string[] = [];

/**
 * Subscribe to task lifecycle events to auto-close trajectories.
 * Must be called after the CrossDomainEventRouter is initialized.
 */
export function subscribeTrajectoryEvents(router: import('../../coordination/cross-domain-router').CrossDomainEventRouter): void {
  // Unsubscribe any previous subscriptions (idempotent)
  unsubscribeTrajectoryEvents(router);

  const completedId = router.subscribeToEventType('TaskCompleted', async (event) => {
    const { taskId } = event.payload as { taskId: string };
    if (taskId && getFleetState().queen?.getTaskStatus(taskId)?.status !== 'cancelled') {
      await endTaskTrajectory(taskId, true).catch(() => {});
    }
  });

  const failedId = router.subscribeToEventType('TaskFailed', async (event) => {
    const { taskId, error: errorMsg } = event.payload as { taskId: string; error?: string };
    if (taskId && getFleetState().queen?.getTaskStatus(taskId)?.status !== 'cancelled') {
      await endTaskTrajectory(taskId, false, errorMsg).catch(() => {});
    }
  });

  trajectorySubscriptionIds = [completedId, failedId];
}

/**
 * Unsubscribe trajectory event listeners. Called during fleet dispose.
 */
export function unsubscribeTrajectoryEvents(router: import('../../coordination/cross-domain-router').CrossDomainEventRouter): void {
  for (const id of trajectorySubscriptionIds) {
    router.unsubscribe(id);
  }
  trajectorySubscriptionIds = [];
}
