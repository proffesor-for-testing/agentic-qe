import type { TaskExecution } from './queen-types.js';

/**
 * A late domain result closes the callback boundary after cancellation, but
 * must not replace the terminal decision or count as a normal task outcome.
 * A settled callback does not prove that arbitrary external effects stopped.
 */
export function settleCancelledTask(
  tasks: Map<string, TaskExecution>,
  taskId: string,
): { ignored: boolean; settledNow: boolean } {
  const execution = tasks.get(taskId);
  if (execution?.status !== 'cancelled') return { ignored: false, settledNow: false };
  if (!execution.cancellationResultPending) return { ignored: true, settledNow: false };
  tasks.set(taskId, { ...execution, cancellationResultPending: false });
  return { ignored: true, settledNow: true };
}
