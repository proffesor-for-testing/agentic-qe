/**
 * Agentic QE v3 - Queen Task Management
 * Extracted from queen-coordinator.ts - Task assignment, domain routing,
 * TinyDancer integration, queue operations, and domain plugin execution.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  DomainName,
  Priority,
  Result,
} from '../shared/types';
import { ok, err } from '../shared/types';
import { binaryInsert, createdAtComparator } from '../shared/utils/index.js';
import type {
  AgentCoordinator,
  DomainPlugin,
  DomainTaskRequest,
  DomainTaskResult,
} from '../kernel/interfaces';
import type { CrossDomainRouter } from './interfaces';
import type { TaskAuditLogger } from './services';

// TinyDancer routing
import type { QueenRouterAdapter, QueenRouteDecision } from '../routing/queen-integration.js';
import type { ClassifiableTask } from '../routing/task-classifier.js';

// ADR-064 subsystems
import type { DomainBreakerRegistry } from './circuit-breaker/index.js';
import type { DomainTeamManager } from './agent-teams/domain-team-manager.js';
import type { TierSelector, FleetTier, TierSelectionContext } from './fleet-tiers/index.js';
import type { TraceCollector, TraceContext } from './agent-teams/tracing.js';

import type {
  QueenTask,
  TaskExecution,
  QueenConfig,
  TaskFilter,
} from './queen-types.js';
import { TASK_DOMAIN_MAP } from './queen-types.js';

// ============================================================================
// Task comparator for priority queue binary insertion
// ============================================================================

/**
 * PERF-001 FIX: Comparator for tasks - sorted by createdAt ascending (oldest first / FIFO within priority)
 */
export const taskComparator = createdAtComparator<QueenTask>();

// ============================================================================
// Context interface for task management functions
// ============================================================================

/**
 * Interface exposing QueenCoordinator internals needed by task management functions.
 */
export interface QueenTaskContext {
  readonly config: QueenConfig;
  readonly tasks: Map<string, TaskExecution>;
  readonly taskQueue: Map<Priority, QueenTask[]>;
  readonly domainQueues: Map<DomainName, QueenTask[]>;
  readonly domainLastActivity: Map<DomainName, Date>;
  readonly auditLogger: TaskAuditLogger;
  readonly agentCoordinator: AgentCoordinator;
  readonly domainPlugins?: Map<DomainName, DomainPlugin>;

  // Mutable counters
  runningTaskCounter: number;
  tasksReceived: number;
  tasksCompleted: number;
  tasksFailed: number;
  taskDurations: { push(v: number): void };

  // Optional subsystems
  readonly tinyDancerRouter: QueenRouterAdapter | null;
  readonly domainBreakerRegistry: DomainBreakerRegistry | null;
  readonly domainTeamManager: DomainTeamManager | null;
  readonly tierSelector: TierSelector | null;
  readonly traceCollector: TraceCollector | null;
  readonly taskTraceContexts: Map<string, TraceContext>;

  // Callbacks into the coordinator
  requestAgentSpawn(domain: DomainName, type: string, capabilities: string[]): Promise<Result<string, Error>>;
  publishEvent(type: string, payload: Record<string, unknown>): Promise<void>;
  getDomainLoad(domain: DomainName): number;
  getDomainHealth(domain: DomainName): import('../kernel/interfaces').DomainHealth | undefined;
}

// ============================================================================
// Queue operations
// ============================================================================

/**
 * PERF-001 FIX: Use binary insertion O(log n) instead of sort O(n log n)
 */
export function enqueueTask(
  taskQueue: Map<Priority, QueenTask[]>,
  domainQueues: Map<DomainName, QueenTask[]>,
  task: QueenTask,
): void {
  const priorityQueue = taskQueue.get(task.priority);
  if (priorityQueue) {
    binaryInsert(priorityQueue, task, taskComparator);
  }

  // Also add to domain-specific queues (unsorted - just for load tracking)
  for (const domain of task.targetDomains) {
    const domainQueue = domainQueues.get(domain);
    if (domainQueue) {
      domainQueue.push(task);
    }
  }
}

/**
 * Remove a task from all queues.
 * PERF-008: Only iterate the task's targetDomains instead of ALL_DOMAINS.
 */
export function removeFromQueues(
  taskQueue: Map<Priority, QueenTask[]>,
  domainQueues: Map<DomainName, QueenTask[]>,
  task: QueenTask,
): void {
  const priorityQueue = taskQueue.get(task.priority);
  if (priorityQueue) {
    const idx = priorityQueue.findIndex(t => t.id === task.id);
    if (idx !== -1) {
      priorityQueue.splice(idx, 1);
    }
  }

  for (const domain of task.targetDomains) {
    const domainQueue = domainQueues.get(domain);
    if (domainQueue) {
      const idx = domainQueue.findIndex(t => t.id === task.id);
      if (idx !== -1) {
        domainQueue.splice(idx, 1);
      }
    }
  }
}

/**
 * Get the position of a task within the priority queues.
 */
export function getQueuePosition(
  taskQueue: Map<Priority, QueenTask[]>,
  task: QueenTask,
): number {
  let position = 0;

  for (const p of ['p0', 'p1', 'p2', 'p3'] as Priority[]) {
    const queue = taskQueue.get(p);
    if (queue) {
      if (p === task.priority) {
        position += queue.findIndex(t => t.id === task.id);
        break;
      }
      position += queue.length;
    }
  }

  return position;
}

/**
 * Process the queue: dequeue highest-priority tasks and assign them.
 * CC-002 FIX: Uses atomic counter for capacity check.
 */
export async function processQueue(ctx: QueenTaskContext): Promise<void> {
  if (ctx.runningTaskCounter >= ctx.config.maxConcurrentTasks) {
    return;
  }

  for (const priority of ['p0', 'p1', 'p2', 'p3'] as Priority[]) {
    const queue = ctx.taskQueue.get(priority);
    if (!queue || queue.length === 0) continue;

    const task = queue.shift();
    if (task) {
      removeFromQueues(ctx.taskQueue, ctx.domainQueues, task);

      // CC-002 FIX: Increment counter before assigning queued task
      ctx.runningTaskCounter++;

      try {
        await assignTask(ctx, task);
      } catch (error) {
        ctx.runningTaskCounter--;
        throw error;
      }

      if (ctx.runningTaskCounter >= ctx.config.maxConcurrentTasks) {
        return;
      }
    }
  }
}

// ============================================================================
// Task filtering
// ============================================================================

/**
 * List tasks with optional filtering.
 */
export function listTasks(
  tasks: Map<string, TaskExecution>,
  filter?: TaskFilter,
): TaskExecution[] {
  let result = Array.from(tasks.values());

  if (filter) {
    if (filter.status) {
      result = result.filter(t => t.status === filter.status);
    }
    if (filter.domain) {
      result = result.filter(t => t.assignedDomain === filter.domain);
    }
    if (filter.priority) {
      result = result.filter(t => t.task.priority === filter.priority);
    }
    if (filter.type) {
      result = result.filter(t => t.task.type === filter.type);
    }
    if (filter.fromDate) {
      result = result.filter(t => t.task.createdAt >= filter.fromDate!);
    }
    if (filter.toDate) {
      result = result.filter(t => t.task.createdAt <= filter.toDate!);
    }
  }

  return result;
}

// ============================================================================
// Task assignment
// ============================================================================

/**
 * Assign a task to the least-loaded healthy domain.
 */
export async function assignTask(
  ctx: QueenTaskContext,
  task: QueenTask,
): Promise<Result<string, Error>> {
  const targetDomains = task.targetDomains.length > 0
    ? task.targetDomains
    : TASK_DOMAIN_MAP[task.type] || [];

  if (targetDomains.length === 0) {
    return err(new Error(`No domains configured for task type: ${task.type}`));
  }

  let bestDomain: DomainName | undefined;
  let lowestLoad = Infinity;

  for (const domain of targetDomains) {
    const load = ctx.getDomainLoad(domain);
    const health = ctx.getDomainHealth(domain);

    if (health?.status !== 'unhealthy' && load < lowestLoad) {
      lowestLoad = load;
      bestDomain = domain;
    }
  }

  if (!bestDomain) {
    return err(new Error('No healthy domain available for task'));
  }

  return assignTaskToDomain(ctx, task, bestDomain);
}

/**
 * Assign a task to a specific domain, including TinyDancer routing,
 * circuit breaker checks, team management, and domain plugin execution.
 */
export async function assignTaskToDomain(
  ctx: QueenTaskContext,
  task: QueenTask,
  domain: DomainName,
): Promise<Result<string, Error>> {
  // V3 Integration: Use TinyDancer for intelligent model routing
  let routeDecision: QueenRouteDecision | undefined;
  if (ctx.tinyDancerRouter) {
    const priorityMap: Record<Priority, 'low' | 'normal' | 'high' | 'critical'> = {
      p0: 'critical',
      p1: 'high',
      p2: 'normal',
      p3: 'low',
    };
    const classifiableTask: ClassifiableTask = {
      description: `${task.type}: ${JSON.stringify(task.payload).slice(0, 200)}`,
      type: task.type,
      domain: domain as unknown as import('../learning/qe-patterns.js').QEDomain | undefined,
      priority: priorityMap[task.priority],
    };
    routeDecision = await ctx.tinyDancerRouter.route(classifiableTask);

    if (ctx.config.enableMetrics) {
      console.log(`[Queen] TinyDancer routing: ${task.type} → tier=${routeDecision.tier}, model=${routeDecision.model}, cost=$${routeDecision.estimatedCost.toFixed(4)}`);
    }
  }

  // ADR-064: Check domain circuit breaker before assigning task
  if (ctx.domainBreakerRegistry) {
    if (!ctx.domainBreakerRegistry.canExecuteInDomain(domain)) {
      return err(new Error(`Domain '${domain}' circuit breaker is open — too many recent failures`));
    }
  }

  // ADR-064: Ensure a domain team exists for this domain
  if (ctx.domainTeamManager) {
    try {
      const existingTeam = ctx.domainTeamManager.getDomainTeam(domain);
      if (!existingTeam) {
        const leadId = `${domain}-lead`;
        ctx.domainTeamManager.createDomainTeam(domain, leadId);
      }
    } catch (teamError) {
      console.warn(`[Queen] Domain team setup for '${domain}' failed (continuing):`, teamError);
    }
  }

  // Spawn an agent for this task if needed, using TinyDancer-recommended tier
  const agentType = routeDecision?.tier || 'task-worker';
  const spawnResult = await ctx.requestAgentSpawn(
    domain,
    agentType,
    ['task-execution', task.type, ...(routeDecision ? [`model:${routeDecision.model}`] : [])],
  );

  const agentIds: string[] = [];
  if (spawnResult.success) {
    agentIds.push(spawnResult.value);
  }

  const execution: TaskExecution = {
    taskId: task.id,
    task,
    status: 'running',
    assignedDomain: domain,
    assignedAgents: agentIds,
    startedAt: new Date(),
    retryCount: 0,
  };

  ctx.tasks.set(task.id, execution);
  ctx.domainLastActivity.set(domain, new Date());

  // SEC-003 Simplified: Log task assignment
  for (const agentId of agentIds) {
    ctx.auditLogger.logAssign(task.id, agentId, domain);
  }

  await ctx.publishEvent('TaskAssigned', {
    taskId: task.id,
    domain,
    agentIds,
  });

  // INTEGRATION FIX: Invoke domain plugin directly for task execution
  if (ctx.domainPlugins) {
    const plugin = ctx.domainPlugins.get(domain);

    if (plugin?.executeTask && plugin.canHandleTask?.(task.type)) {
      const request: DomainTaskRequest = {
        taskId: task.id,
        taskType: task.type,
        payload: task.payload,
        priority: task.priority,
        timeout: task.timeout,
        correlationId: task.correlationId,
      };

      const execResult = await plugin.executeTask(
        request,
        (result: DomainTaskResult) => handleTaskCompletionCallback(ctx, result),
      );

      if (!execResult.success) {
        ctx.tasks.set(task.id, {
          ...execution,
          status: 'failed',
          error: execResult.error.message,
          completedAt: new Date(),
        });
        ctx.runningTaskCounter = Math.max(0, ctx.runningTaskCounter - 1);
        ctx.tasksFailed++;

        ctx.auditLogger.logFail(task.id, agentIds[0], execResult.error.message);

        return err(execResult.error);
      }

      return ok(task.id);
    }

    // Fallback: Send event to plugin (for domains not yet updated)
    if (plugin) {
      try {
        await plugin.handleEvent({
          id: uuidv4(),
          type: 'TaskAssigned',
          timestamp: new Date(),
          source: 'queen-coordinator' as DomainName,
          correlationId: task.correlationId,
          payload: { task },
        });
        console.warn(`[Queen] Domain ${domain} has no executeTask handler, using event fallback`);
      } catch (error) {
        console.warn(`[Queen] Failed to invoke domain ${domain} event handler:`, error);
      }
    }
  }

  return ok(task.id);
}

// ============================================================================
// Task completion callback (from domain plugin)
// ============================================================================

/**
 * Handle task completion callback from domain plugin.
 * Queen-Domain Integration Fix: Direct task execution callback handler.
 */
async function handleTaskCompletionCallback(
  ctx: QueenTaskContext,
  result: DomainTaskResult,
): Promise<void> {
  const execution = ctx.tasks.get(result.taskId);
  if (!execution) {
    console.warn(`[Queen] Received completion for unknown task: ${result.taskId}`);
    return;
  }

  const updated: TaskExecution = {
    ...execution,
    status: result.success ? 'completed' : 'failed',
    completedAt: new Date(),
    result: result.data,
    error: result.error,
  };
  ctx.tasks.set(result.taskId, updated);

  if (result.success) {
    ctx.tasksCompleted++;
    ctx.taskDurations.push(result.duration);
    ctx.auditLogger.logComplete(result.taskId, execution.assignedAgents[0]);
  } else {
    ctx.tasksFailed++;
    ctx.auditLogger.logFail(result.taskId, execution.assignedAgents[0], result.error || 'Unknown error');
  }

  // CC-002: Decrement running task counter
  ctx.runningTaskCounter = Math.max(0, ctx.runningTaskCounter - 1);

  // Stop assigned agents
  for (const agentId of execution.assignedAgents) {
    await ctx.agentCoordinator.stop(agentId);
  }

  await ctx.publishEvent(result.success ? 'TaskCompleted' : 'TaskFailed', {
    taskId: result.taskId,
    domain: execution.assignedDomain,
    result: result.data,
    error: result.error,
    duration: result.duration,
  });

  await processQueue(ctx);
}

/**
 * Check if a domain can handle a given task type.
 */
export function canDomainHandleTask(domain: DomainName, task: QueenTask): boolean {
  const compatibleDomains = TASK_DOMAIN_MAP[task.type] || [];
  return compatibleDomains.includes(domain);
}
