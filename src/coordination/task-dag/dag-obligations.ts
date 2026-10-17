/**
 * Agentic QE v3 - Task DAG Obligation Helpers
 * Issue #1069: pure helpers for initial edge dispositions, waiver
 * authorization and status counting, kept out of dag.ts for size.
 */

import type {
  DAGStats,
  DAGTask,
  PrerequisiteDisposition,
  WaivePrerequisiteInput,
  WaiverPolicy,
} from './types.js';
import {
  PrerequisiteWaiverError,
  TERMINAL_STATUSES,
  type PrerequisiteLedger,
} from './prerequisite-ledger.js';

/** Disposition of a new edge given the prerequisite's current state. */
export function initialDisposition(
  blocker: DAGTask | undefined,
  tombstoned: boolean
): PrerequisiteDisposition {
  if (!blocker) return tombstoned ? 'REMOVED' : 'MISSING';
  switch (blocker.status) {
    case 'completed': return 'SATISFIED';
    case 'failed':    return 'FAILED';
    case 'cancelled': return 'CANCELLED';
    default:          return 'UNRESOLVED';
  }
}

/**
 * Check that a validated waiver may be applied: the revision guard holds,
 * the dependent exists and is not terminal, the edge exists and is
 * unresolved, and the optional policy approves.
 * @throws PrerequisiteWaiverError or GraphRevisionConflictError
 */
export function authorizeWaiver(
  ledger: PrerequisiteLedger,
  policy: WaiverPolicy | undefined,
  req: WaivePrerequisiteInput,
  task: DAGTask | undefined,
  prerequisites: ReadonlySet<string> | undefined
): asserts task is DAGTask {
  ledger.checkRevision(req.expectedRevision);
  if (!task) throw new PrerequisiteWaiverError(`Task '${req.taskId}' not found in the DAG`);
  if (!prerequisites?.has(req.prerequisiteId)) {
    throw new PrerequisiteWaiverError(`Task '${req.taskId}' has no prerequisite '${req.prerequisiteId}'`);
  }
  if (TERMINAL_STATUSES.has(task.status)) {
    throw new PrerequisiteWaiverError(`Cannot waive for '${req.taskId}': status '${task.status}' is terminal`);
  }
  const current = ledger.disposition(req.taskId, req.prerequisiteId) ?? 'UNRESOLVED';
  if (current === 'SATISFIED' || current === 'WAIVED') {
    throw new PrerequisiteWaiverError(
      `Prerequisite '${req.prerequisiteId}' of '${req.taskId}' is already ${current}`
    );
  }
  if (policy && !policy({
    graphId: ledger.graphId,
    graphRevision: ledger.graphRevision,
    taskId: req.taskId,
    prerequisiteId: req.prerequisiteId,
    actor: req.actor,
    reason: req.reason,
    authorityRef: req.authorityRef,
    currentDisposition: current,
  })) {
    throw new PrerequisiteWaiverError(
      `Waiver of '${req.prerequisiteId}' for '${req.taskId}' by '${req.actor}' rejected by policy`
    );
  }
}

type StatusCounts = Pick<
  DAGStats,
  'pending' | 'ready' | 'inProgress' | 'completed' | 'failed' | 'blocked' | 'cancelled'
>;

/** Count tasks by execution status. */
export function countStatuses(tasks: Iterable<DAGTask>): StatusCounts {
  let pending = 0, ready = 0, inProgress = 0, completed = 0;
  let failed = 0, blocked = 0, cancelled = 0;
  for (const task of tasks) {
    switch (task.status) {
      case 'pending':     pending++;    break;
      case 'ready':       ready++;      break;
      case 'in_progress': inProgress++; break;
      case 'completed':   completed++;  break;
      case 'failed':      failed++;     break;
      case 'blocked':     blocked++;    break;
      case 'cancelled':   cancelled++;  break;
    }
  }
  return { pending, ready, inProgress, completed, failed, blocked, cancelled };
}
