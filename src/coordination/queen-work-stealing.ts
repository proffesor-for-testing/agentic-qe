/**
 * Agentic QE v3 - Queen Work Stealing
 * Extracted from queen-coordinator.ts - Work stealing algorithm with
 * exponential backoff and automatic disable on repeated failures.
 */

import type { DomainName } from '../shared/types';
import { toErrorMessage } from '../shared/error-utils.js';
import type { TaskAuditLogger } from './services';
import type { QueenTask, QueenConfig } from './queen-types.js';
import { canDomainHandleTask } from './queen-task-management.js';

// ============================================================================
// Context interface for work stealing
// ============================================================================

export interface QueenWorkStealingContext {
  readonly config: QueenConfig;
  readonly domainQueues: Map<DomainName, QueenTask[]>;
  readonly auditLogger: TaskAuditLogger;

  // Mutable counters
  tasksStolen: number;

  // Callbacks into the coordinator
  getIdleDomains(): DomainName[];
  getBusyDomains(): DomainName[];
  getDomainLoad(domain: DomainName): number;
  removeFromQueues(task: QueenTask): void;
  assignTaskToDomain(task: QueenTask, domain: DomainName): Promise<void>;
  publishEvent(type: string, payload: Record<string, unknown>): Promise<void>;
}

// ============================================================================
// Work stealing algorithm
// ============================================================================

/**
 * Trigger one round of work stealing: move tasks from busy to idle domains.
 * Returns the number of tasks stolen.
 */
export async function triggerWorkStealing(ctx: QueenWorkStealingContext): Promise<number> {
  let stolenCount = 0;
  const idleDomains = ctx.getIdleDomains();
  const busyDomains = ctx.getBusyDomains();

  if (idleDomains.length === 0 || busyDomains.length === 0) {
    return 0;
  }

  // Sort busy domains by load (highest first)
  busyDomains.sort((a, b) => ctx.getDomainLoad(b) - ctx.getDomainLoad(a));

  for (const busyDomain of busyDomains) {
    if (idleDomains.length === 0) break;

    const queue = ctx.domainQueues.get(busyDomain) || [];
    const stealCount = Math.min(queue.length, ctx.config.workStealing.stealBatchSize);

    for (let i = 0; i < stealCount && idleDomains.length > 0; i++) {
      const task = queue.find(t => canDomainHandleTask(idleDomains[0], t));

      if (task) {
        const stealerDomain = idleDomains.shift()!;
        ctx.removeFromQueues(task);

        // SEC-003 Simplified: Log work stealing for observability
        ctx.auditLogger.logSteal(task.id, busyDomain, stealerDomain);

        await ctx.assignTaskToDomain(task, stealerDomain);

        stolenCount++;
        ctx.tasksStolen++;

        await ctx.publishEvent('TaskStolen', {
          taskId: task.id,
          fromDomain: busyDomain,
          toDomain: stealerDomain,
        });
      }
    }
  }

  return stolenCount;
}

/**
 * Start the work-stealing interval timer with exponential backoff on failures
 * and automatic disable after too many consecutive failures.
 *
 * @returns The created interval timer
 */
export function startWorkStealingTimer(
  config: QueenConfig,
  doStealing: () => Promise<void>,
): NodeJS.Timeout {
  let workStealingFailures = 0;
  const maxConsecutiveFailures = 10;
  let timer: NodeJS.Timeout;

  timer = setInterval(async () => {
    try {
      await doStealing();
      workStealingFailures = 0;
    } catch (error) {
      workStealingFailures++;
      const backoffMs = Math.min(1000 * Math.pow(2, workStealingFailures), 30000);
      console.warn(
        `[QueenCoordinator] Work-stealing failed (attempt ${workStealingFailures}), backing off ${backoffMs}ms`,
        toErrorMessage(error),
      );

      if (workStealingFailures > maxConsecutiveFailures) {
        console.error(
          `[QueenCoordinator] Work-stealing exceeded ${maxConsecutiveFailures} consecutive failures, stopping interval`,
        );
        clearInterval(timer);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }, config.workStealing.checkInterval);

  return timer;
}
