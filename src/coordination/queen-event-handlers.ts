/**
 * Agentic QE v3 - Queen Coordinator Event Handlers
 * Extracted from queen-coordinator.ts - Domain event handling, task completion/failure,
 * pattern training, governance tracking, tracing, and cross-phase hooks.
 */

import type {
  DomainName,
  DomainEvent,
  AgentStatus,
} from '../shared/types';
import type { DomainHealth, AgentCoordinator, DomainPlugin } from '../kernel/interfaces';
import type { CrossDomainRouter } from './interfaces';

// Cross-phase hooks
import { getCrossPhaseHookExecutor } from '../hooks/cross-phase-hooks.js';

// Governance
import { queenGovernanceAdapter } from '../governance/index.js';

// ADR-064 Phase 3: Pattern training
import type { TaskCompletedHook } from '../hooks/task-completed-hook.js';
import type { TaskResult, TaskMetrics } from '../hooks/quality-gate-enforcer.js';

// ADR-064 Phase 3: Distributed Tracing
import type { TraceCollector, TraceContext } from './agent-teams/tracing.js';

// ADR-064 Phase 4: Competing Hypotheses
import type { HypothesisManager } from './competing-hypotheses/index.js';

// Circuit breakers
import type { DomainBreakerRegistry } from './circuit-breaker/index.js';

// Audit logging
import type { TaskAuditLogger } from './services';

import type { TaskExecution, QueenConfig, QueenTask } from './queen-types.js';

// ============================================================================
// Shared state interface for event handlers
// ============================================================================

/**
 * Interface exposing the QueenCoordinator internals needed by event handlers.
 * This avoids circular dependencies while allowing extracted functions to
 * operate on the coordinator's mutable state.
 */
export interface QueenEventHandlerContext {
  readonly config: QueenConfig;
  readonly tasks: Map<string, TaskExecution>;
  readonly domainLastActivity: Map<DomainName, Date>;
  readonly auditLogger: TaskAuditLogger;
  readonly router: CrossDomainRouter;
  readonly agentCoordinator: AgentCoordinator;

  // Mutable counters (modified by handlers)
  runningTaskCounter: number;
  tasksCompleted: number;
  tasksFailed: number;
  taskDurations: { push(v: number): void; average(): number };

  // Optional subsystems
  readonly domainBreakerRegistry: DomainBreakerRegistry | null;
  readonly traceCollector: TraceCollector | null;
  readonly taskTraceContexts: Map<string, TraceContext>;
  readonly taskCompletedHook: TaskCompletedHook | null;
  readonly hypothesisManager: HypothesisManager | null;

  // Callbacks into the coordinator
  processQueue(): Promise<void>;
  enqueueTask(task: QueenTask): void;
}

// ============================================================================
// Event subscription
// ============================================================================

/**
 * Subscribe to domain events and coordination events.
 * Returns subscription IDs for cleanup during dispose().
 * PAP-003: Store subscription IDs for proper cleanup.
 */
export function subscribeToEvents(
  ctx: QueenEventHandlerContext,
  allDomains: readonly DomainName[],
): string[] {
  const subscriptionIds: string[] = [];

  // Listen for task completion events from domains
  for (const domain of allDomains) {
    const subscriptionId = ctx.router.subscribeToDoamin(domain, async (event) => {
      await handleDomainEvent(ctx, event);
    });
    subscriptionIds.push(subscriptionId);
  }

  // Listen for specific coordination events
  const taskCompletedSubId = ctx.router.subscribeToEventType('TaskCompleted', async (event) => {
    await handleTaskCompleted(ctx, event);
  });
  subscriptionIds.push(taskCompletedSubId);

  const taskFailedSubId = ctx.router.subscribeToEventType('TaskFailed', async (event) => {
    await handleTaskFailed(ctx, event);
  });
  subscriptionIds.push(taskFailedSubId);

  const agentStatusSubId = ctx.router.subscribeToEventType('AgentStatusChanged', async (event) => {
    await handleAgentStatusChanged(ctx, event);
  });
  subscriptionIds.push(agentStatusSubId);

  return subscriptionIds;
}

// ============================================================================
// Domain event handler
// ============================================================================

async function handleDomainEvent(
  ctx: QueenEventHandlerContext,
  event: DomainEvent,
): Promise<void> {
  ctx.domainLastActivity.set(event.source, new Date());
  await ctx.processQueue();
}

// ============================================================================
// Task completed handler
// ============================================================================

export async function handleTaskCompleted(
  ctx: QueenEventHandlerContext,
  event: DomainEvent,
): Promise<void> {
  const { taskId, result } = event.payload as { taskId: string; result: unknown };
  const execution = ctx.tasks.get(taskId);

  if (execution) {
    // CC-002 FIX: Decrement the atomic counter when task completes
    if (execution.status === 'running' || execution.status === 'assigned') {
      ctx.runningTaskCounter = Math.max(0, ctx.runningTaskCounter - 1);
    }

    const duration = execution.startedAt
      ? Date.now() - execution.startedAt.getTime()
      : 0;

    ctx.tasks.set(taskId, {
      ...execution,
      status: 'completed',
      completedAt: new Date(),
      result,
    });

    ctx.tasksCompleted++;
    ctx.taskDurations.push(duration);

    // SEC-003 Simplified: Log task completion
    ctx.auditLogger.logComplete(taskId, execution.assignedAgents[0]);

    // QCSD: Invoke cross-phase hooks on agent completion
    try {
      const hookExecutor = getCrossPhaseHookExecutor();
      const agentName = execution.assignedAgents[0];
      if (agentName) {
        await hookExecutor.onAgentComplete(agentName, {
          taskId,
          taskType: execution.task.type,
          domain: execution.assignedDomain,
          result,
          duration,
        });
      }
    } catch (hookError) {
      console.warn('[QueenCoordinator] Cross-phase hook error:', hookError);
    }

    // ADR-058: Record successful task outcome with governance
    try {
      await queenGovernanceAdapter.afterTaskExecution(
        {
          taskId,
          taskType: execution.task.type,
          agentId: execution.assignedAgents[0] || 'unknown',
          domain: execution.assignedDomain || 'test-generation',
          priority: execution.task.priority,
        },
        true,
        0,
        0,
      );
    } catch (govError) {
      console.warn('[QueenCoordinator] Governance tracking error:', govError);
    }

    // ADR-064: Record success in domain circuit breaker
    if (ctx.domainBreakerRegistry && execution.assignedDomain) {
      ctx.domainBreakerRegistry.getBreaker(execution.assignedDomain).recordSuccess();
    }

    // ADR-064 Phase 3: Complete the trace span for this task
    if (ctx.traceCollector) {
      const traceCtx = ctx.taskTraceContexts.get(taskId);
      if (traceCtx) {
        ctx.traceCollector.completeSpan(traceCtx.spanId);
        ctx.taskTraceContexts.delete(taskId);
      }
    }

    // ADR-064 Phase 3: Train patterns from completed tasks
    if (ctx.taskCompletedHook) {
      try {
        const resultObj = (typeof result === 'object' && result !== null)
          ? result as Record<string, unknown>
          : null;

        if (resultObj === null) {
          console.error(
            `[QueenCoordinator] Pattern training skipped for task ${taskId}: ` +
            `result is not an object (got ${typeof result})`,
          );
        } else {
          const metrics = extractTaskMetrics(resultObj, taskId);
          if (metrics) {
            const taskResult: TaskResult = {
              taskId,
              agentId: execution.assignedAgents[0] || 'unknown',
              domain: execution.assignedDomain || 'test-generation',
              type: execution.task.type,
              status: 'completed',
              output: resultObj,
              metrics,
              duration,
              timestamp: Date.now(),
            };
            ctx.taskCompletedHook.onTaskCompleted(taskResult).catch(hookErr => {
              console.warn('[QueenCoordinator] Pattern training error:', hookErr);
            });
          }
        }
      } catch (hookError) {
        console.warn('[QueenCoordinator] Pattern training setup error:', hookError);
      }
    }
  }

  await ctx.processQueue();
}

// ============================================================================
// Task failed handler
// ============================================================================

export async function handleTaskFailed(
  ctx: QueenEventHandlerContext,
  event: DomainEvent,
): Promise<void> {
  const { taskId, error } = event.payload as { taskId: string; error: string };
  const execution = ctx.tasks.get(taskId);

  if (execution) {
    // CC-002 FIX: Decrement the atomic counter when task fails
    if (execution.status === 'running' || execution.status === 'assigned') {
      ctx.runningTaskCounter = Math.max(0, ctx.runningTaskCounter - 1);
    }

    // ADR-064: Record failure in domain circuit breaker
    if (ctx.domainBreakerRegistry && execution.assignedDomain) {
      ctx.domainBreakerRegistry.getBreaker(execution.assignedDomain).recordFailure(
        new Error(error || 'Task failed'),
      );
    }

    // ADR-064 Phase 3: Fail the trace span for this task
    if (ctx.traceCollector) {
      const traceCtx = ctx.taskTraceContexts.get(taskId);
      if (traceCtx) {
        ctx.traceCollector.failSpan(traceCtx.spanId, error || 'Task failed');
        ctx.taskTraceContexts.delete(taskId);
      }
    }

    // Check if we should retry
    if (execution.retryCount < ctx.config.taskRetryLimit) {
      ctx.auditLogger.logFail(taskId, execution.assignedAgents[0], error);

      const retried: TaskExecution = {
        ...execution,
        status: 'queued',
        retryCount: execution.retryCount + 1,
        error,
      };
      ctx.tasks.set(taskId, retried);
      ctx.enqueueTask(execution.task);

      // Note: publishEvent is handled by the caller via the event bus
    } else {
      // Mark as permanently failed
      ctx.tasks.set(taskId, {
        ...execution,
        status: 'failed',
        completedAt: new Date(),
        error,
      });
      ctx.tasksFailed++;

      ctx.auditLogger.logFail(taskId, execution.assignedAgents[0], error);

      // ADR-058: Record failed task outcome with governance
      try {
        await queenGovernanceAdapter.afterTaskExecution(
          {
            taskId,
            taskType: execution.task.type,
            agentId: execution.assignedAgents[0] || 'unknown',
            domain: execution.assignedDomain || 'test-generation',
            priority: execution.task.priority,
          },
          false,
          0,
          0,
        );
      } catch (govError) {
        console.warn('[QueenCoordinator] Governance tracking error:', govError);
      }

      // ADR-064 Phase 4A: Create competing hypotheses investigation for
      // permanent failures in critical domains (p0/p1 priority)
      if (ctx.hypothesisManager && (execution.task.priority === 'p0' || execution.task.priority === 'p1')) {
        try {
          const domain = execution.assignedDomain || 'test-generation';
          const investigation = ctx.hypothesisManager.createInvestigation(
            taskId,
            domain,
            `Root cause analysis for ${execution.task.type} failure: ${error}`,
          );
          ctx.hypothesisManager.addHypothesis(
            investigation.id,
            `Infrastructure failure in domain '${domain}' caused task ${taskId} to fail`,
            'log-analysis',
            `${domain}-lead`,
          );
          ctx.hypothesisManager.addHypothesis(
            investigation.id,
            `Logic/configuration error in task payload caused ${execution.task.type} to fail: ${error}`,
            'code-analysis',
            execution.assignedAgents[0] || 'unknown',
          );
          console.log(`[QueenCoordinator] Competing hypotheses investigation created: ${investigation.id}`);
        } catch (hypothesisError) {
          console.warn('[QueenCoordinator] Hypothesis creation error:', hypothesisError);
        }
      }
    }
  }

  await ctx.processQueue();
}

// ============================================================================
// Agent status changed handler
// ============================================================================

async function handleAgentStatusChanged(
  ctx: QueenEventHandlerContext,
  event: DomainEvent,
): Promise<void> {
  const { agentId: _agentId, status, domain } = event.payload as {
    agentId: string;
    status: AgentStatus;
    domain: DomainName;
  };

  ctx.domainLastActivity.set(domain, new Date());

  if (status === 'completed' || status === 'failed') {
    await ctx.processQueue();
  }
}

// ============================================================================
// Task metrics extraction (for pattern training)
// ============================================================================

/**
 * Extract TaskMetrics from a task result object.
 * Returns null and logs an error if the result shape is unrecognized.
 */
export function extractTaskMetrics(
  resultObj: Record<string, unknown>,
  taskId: string,
): TaskMetrics | null {
  // Check for metrics at the top level
  if ('metrics' in resultObj && typeof resultObj.metrics === 'object' && resultObj.metrics !== null) {
    const m = resultObj.metrics as Record<string, unknown>;
    return {
      testsPassed: typeof m.testsPassed === 'number' ? m.testsPassed : undefined,
      testsFailed: typeof m.testsFailed === 'number' ? m.testsFailed : undefined,
      coverageChange: typeof m.coverageChange === 'number' ? m.coverageChange : undefined,
      securityIssues: typeof m.securityIssues === 'number' ? m.securityIssues : undefined,
      performanceMs: typeof m.performanceMs === 'number' ? m.performanceMs : undefined,
      linesChanged: typeof m.linesChanged === 'number' ? m.linesChanged : undefined,
    };
  }

  // Check for flat metric fields directly on the result
  if ('testsPassed' in resultObj || 'testsFailed' in resultObj) {
    return {
      testsPassed: typeof resultObj.testsPassed === 'number' ? resultObj.testsPassed : undefined,
      testsFailed: typeof resultObj.testsFailed === 'number' ? resultObj.testsFailed : undefined,
      coverageChange: typeof resultObj.coverageChange === 'number' ? resultObj.coverageChange : undefined,
      securityIssues: typeof resultObj.securityIssues === 'number' ? resultObj.securityIssues : undefined,
      performanceMs: typeof resultObj.performanceMs === 'number' ? resultObj.performanceMs : undefined,
      linesChanged: typeof resultObj.linesChanged === 'number' ? resultObj.linesChanged : undefined,
    };
  }

  console.error(
    `[QueenCoordinator] Pattern training skipped for task ${taskId}: ` +
    `result object has no recognizable metrics shape (keys: ${Object.keys(resultObj).join(', ')})`,
  );
  return null;
}

// ============================================================================
// Domain health computation (fallback when no plugin available)
// ============================================================================

/**
 * Compute domain health from agent coordinator when no plugin is available.
 * Issue #205 fix: 'idle' is normal for ephemeral agent model.
 */
export function computeDomainHealthFromAgents(
  agentCoordinator: AgentCoordinator,
  domain: DomainName,
  lastActivity: Date | undefined,
): DomainHealth {
  const agents = agentCoordinator.listAgents({ domain });
  const activeAgents = agents.filter(a => a.status === 'running').length;
  const idleAgents = agents.filter(a => a.status === 'idle').length;
  const failedAgents = agents.filter(a => a.status === 'failed').length;

  let status: DomainHealth['status'];
  if (failedAgents > 0 && failedAgents >= agents.length / 2) {
    status = 'unhealthy';
  } else if (failedAgents > 0) {
    status = 'degraded';
  } else if (activeAgents > 0) {
    status = 'healthy';
  } else {
    status = 'idle';
  }

  return {
    status,
    agents: {
      total: agents.length,
      active: activeAgents,
      idle: idleAgents,
      failed: failedAgents,
    },
    lastActivity,
    errors: [],
  };
}
