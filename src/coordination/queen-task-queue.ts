/**
 * Agentic QE v3 - Queen Task Queue
 * Extracted from queen-task-management.ts - priority queue operations, the
 * queue drain, and handing a released slot back to the queue.
 */

import type { DomainName, Priority, Result } from '../shared/types';
import { binaryInsert, createdAtComparator } from '../shared/utils/index.js';
import { toErrorMessage } from '../shared/error-utils.js';
import type { QueenTask, TaskExecution } from './queen-types.js';
import { assignTask, type QueenTaskContext } from './queen-task-management.js';

// ============================================================================
// Task comparator for priority queue binary insertion
// ============================================================================

/**
 * PERF-001 FIX: Comparator for tasks - sorted by createdAt ascending (oldest first / FIFO within priority)
 */
export const taskComparator = createdAtComparator<QueenTask>();

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

  // #1081: while this drain runs, a task failed at dispatch frees its slot
  // here instead of starting a nested drain (one stack frame per failed task).
  drainDepth.set(ctx.tasks, (drainDepth.get(ctx.tasks) ?? 0) + 1);
  try {
    // #1127: a slot released elsewhere while this drain awaits marks it dirty,
    // so it scans again from p0 rather than leaving the slot unused.
    do {
      drainDirty.delete(ctx.tasks);
      for (const priority of ['p0', 'p1', 'p2', 'p3'] as Priority[]) {
        const queue = ctx.taskQueue.get(priority);
        if (!queue || queue.length === 0) continue;

        let task = shiftDispatchableTask(ctx, queue);
        while (task) {
          removeFromQueues(ctx.taskQueue, ctx.domainQueues, task);

          // CC-002 FIX: Increment counter before assigning queued task
          ctx.runningTaskCounter++;

          let assigned: Result<string, Error>;
          try {
            assigned = await assignTask(ctx, task);
          } catch (error) {
            ctx.runningTaskCounter = Math.max(0, ctx.runningTaskCounter - 1);
            throw error;
          }
          // #1081: a queued task that cannot be assigned (no healthy domain, open
          // breaker) has no caller waiting on the result. Fail it with the reason
          // rather than leave it queued forever on a held slot.
          if (!assigned.success && (ctx.tasks.get(task.id)?.status ?? 'queued') === 'queued') {
            await settleFailedBeforeRun(ctx, task, undefined, assigned.error.message);
          }

          if (ctx.runningTaskCounter >= ctx.config.maxConcurrentTasks) {
            return;
          }
          // #1127: fill every free slot, whether this task started, failed
          // before running or was cancelled while it was being assigned.
          task = shiftDispatchableTask(ctx, queue);
        }
      }
    } while (drainDirty.has(ctx.tasks) && ctx.runningTaskCounter < ctx.config.maxConcurrentTasks);
  } finally {
    const depth = (drainDepth.get(ctx.tasks) ?? 1) - 1;
    if (depth > 0) drainDepth.set(ctx.tasks, depth);
    else {
      drainDepth.delete(ctx.tasks);
      drainDirty.delete(ctx.tasks);
    }
  }
}

/**
 * Drains in progress per Queen, keyed by its task map (the task context
 * object is rebuilt for every call).
 */
const drainDepth = new WeakMap<Map<string, TaskExecution>, number>();

/** #1127: Queens with a slot released while a drain was running. */
const drainDirty = new WeakSet<Map<string, TaskExecution>>();

/**
 * Give back the slot a task held and hand it to the queue: a running drain
 * picks it up on its next scan, otherwise a new drain starts.
 */
export async function releaseSlot(ctx: QueenTaskContext): Promise<void> {
  ctx.runningTaskCounter = Math.max(0, ctx.runningTaskCounter - 1);
  if (drainDepth.has(ctx.tasks)) {
    drainDirty.add(ctx.tasks);
    return;
  }
  // The drain dispatches other tasks. The caller whose task released this
  // slot does not wait for it (#1140), and its failure belongs to none of
  // them, so it must not reach that caller.
  void processQueue(ctx).catch(error => {
    console.warn('[Queen] Queue drain after a released slot failed:', toErrorMessage(error));
  });
}

/**
 * Take the next task that is still waiting to run. A queued task can reach a
 * terminal state without being dequeued, e.g. when its caller executes it
 * directly (#1070). Dispatching it again would flip it back to running and
 * leak a capacity slot, so such entries are dropped from the queues instead.
 */
function shiftDispatchableTask(ctx: QueenTaskContext, queue: QueenTask[]): QueenTask | undefined {
  let task = queue.shift();
  while (task) {
    const status = ctx.tasks.get(task.id)?.status;
    if (status === undefined || status === 'queued') return task;
    removeFromQueues(ctx.taskQueue, ctx.domainQueues, task);
    task = queue.shift();
  }
  return undefined;
}

/**
 * Mark a task that never started as failed, publish QueenTaskFailed (#1124)
 * and hand the slot it held to the queue.
 */
export async function settleFailedBeforeRun(
  ctx: QueenTaskContext,
  task: QueenTask,
  domain: DomainName | undefined,
  reason: string,
): Promise<void> {
  ctx.tasks.set(task.id, {
    taskId: task.id,
    task,
    status: 'failed',
    assignedDomain: domain,
    assignedAgents: [],
    retryCount: ctx.tasks.get(task.id)?.retryCount ?? 0,
    error: reason,
    completedAt: new Date(),
  });
  ctx.tasksFailed++;
  ctx.auditLogger.logFail(task.id, undefined, reason);
  await ctx.publishEvent('TaskFailed', { taskId: task.id, domain, error: reason });
  await releaseSlot(ctx);
}
