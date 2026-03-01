/**
 * Agentic QE v3 - DAG-Aware Task Scheduler
 * ADR-064 Phase 1E: Scheduler that respects dependency ordering
 *
 * Wraps the TaskDAG to provide scheduling decisions: which tasks to
 * run next given concurrency limits and priority ordering. Prioritizes
 * by priority level first (p0 > p1 > p2 > p3), then by number of
 * downstream dependents (most blocking tasks first).
 */

import type { DAGTask, DAGSchedulerConfig } from './types.js';
import type { TaskDAG } from './dag.js';

// ============================================================================
// Priority Weights
// ============================================================================

/** Numeric weights for priority levels (lower value = higher priority) */
const PRIORITY_WEIGHT: Record<string, number> = {
  p0: 0,
  p1: 1,
  p2: 2,
  p3: 3,
};

/**
 * Get the numeric weight for a priority string.
 * Unknown priorities are treated as lowest (weight 99).
 */
function getPriorityWeight(priority: string): number {
  return PRIORITY_WEIGHT[priority] ?? 99;
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Default scheduler configuration */
const DEFAULT_CONFIG: DAGSchedulerConfig = {
  maxConcurrent: 4,
  prioritizeBlockers: true,
};

// ============================================================================
// DAGScheduler Class
// ============================================================================

/**
 * DAG-aware task scheduler with priority and dependency ordering.
 *
 * The scheduler selects tasks from the DAG's ready queue, respecting
 * concurrency limits and ordering tasks by priority level and downstream
 * impact (number of tasks blocked).
 *
 * @example
 * ```typescript
 * const dag = new TaskDAG();
 * const scheduler = new DAGScheduler(dag, { maxConcurrent: 2 });
 *
 * // Add tasks
 * dag.addTask({ id: 'a', name: 'A', domain: 'ci', priority: 'p1' });
 * dag.addTask({ id: 'b', name: 'B', domain: 'ci', priority: 'p0' });
 * dag.addTask({ id: 'c', name: 'C', domain: 'ci', blockedBy: ['a', 'b'] });
 *
 * // Schedule up to maxConcurrent tasks
 * const batch = scheduler.schedule(); // [b, a] (p0 first, then p1)
 *
 * // Process completions
 * const newTasks = scheduler.onTaskComplete('a');
 * const moreTasks = scheduler.onTaskComplete('b'); // [c] now unblocked
 * ```
 */
export class DAGScheduler {
  /** Reference to the underlying DAG */
  private readonly dag: TaskDAG;

  /** Scheduler configuration */
  private readonly config: DAGSchedulerConfig;

  /**
   * Create a new DAG scheduler.
   *
   * @param dag - The TaskDAG instance to schedule from
   * @param config - Optional scheduler configuration
   */
  constructor(dag: TaskDAG, config?: Partial<DAGSchedulerConfig>) {
    this.dag = dag;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Select the next batch of tasks to execute.
   *
   * Gets all ready tasks from the DAG, sorts them by priority
   * and blocker count, and returns up to maxConcurrent tasks
   * (accounting for tasks already in progress).
   *
   * @param maxConcurrent - Override for max concurrent tasks (uses config default if omitted)
   * @returns Array of tasks to schedule, in priority order
   */
  schedule(maxConcurrent?: number): DAGTask[] {
    const limit = maxConcurrent ?? this.config.maxConcurrent;
    const ready = this.dag.getReady();

    if (ready.length === 0) {
      return [];
    }

    // Count currently in-progress tasks
    const stats = this.dag.getStats();
    const available = Math.max(0, limit - stats.inProgress);

    if (available === 0) {
      return [];
    }

    // Sort by priority (ascending weight = higher priority first),
    // then by number of dependents (descending = most blocking first)
    const sorted = this.sortByPriority(ready);

    return sorted.slice(0, available);
  }

  /**
   * Handle task completion and return newly schedulable tasks.
   *
   * Delegates to the DAG's complete() method to update status and
   * unblock dependents, then returns the newly ready tasks.
   *
   * @param taskId - ID of the completed task
   * @param result - Optional result data from the task
   * @returns Array of newly schedulable tasks
   */
  onTaskComplete(taskId: string, result?: unknown): DAGTask[] {
    const unblockedIds = this.dag.complete(taskId, result);
    const tasks: DAGTask[] = [];

    for (const id of unblockedIds) {
      const task = this.dag.getTask(id);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Handle task failure and cascade cancellations.
   *
   * Delegates to the DAG's fail() method which marks the task
   * as failed and cancels dependent tasks that cannot proceed.
   *
   * @param taskId - ID of the failed task
   * @param error - Error message describing the failure
   */
  onTaskFail(taskId: string, error: string): void {
    this.dag.fail(taskId, error);
  }

  /**
   * Get the full execution order respecting dependencies and priorities.
   *
   * Performs a topological sort and then stable-sorts by priority
   * within each topological level.
   *
   * @returns Array of all tasks in recommended execution order
   */
  getScheduleOrder(): DAGTask[] {
    let sorted: DAGTask[];
    try {
      sorted = this.dag.topologicalSort();
    } catch {
      // If cycles exist, return empty array
      return [];
    }

    // Group tasks by topological level for priority ordering within levels
    const levels = this.computeTopologicalLevels(sorted);
    const result: DAGTask[] = [];

    for (const level of levels) {
      const prioritized = this.sortByPriority(level);
      result.push(...prioritized);
    }

    return result;
  }

  /**
   * Get progress information for the DAG execution.
   *
   * @returns Object with completed count, total count, and percentage
   */
  getProgress(): { completed: number; total: number; percentage: number } {
    const stats = this.dag.getStats();
    const total = stats.totalTasks;

    if (total === 0) {
      return { completed: 0, total: 0, percentage: 100 };
    }

    const completed = stats.completed;
    const percentage = Math.round((completed / total) * 100);

    return { completed, total, percentage };
  }

  /**
   * Check whether all tasks have reached a terminal state.
   *
   * A DAG execution is complete when every task is either
   * 'completed', 'failed', or 'cancelled'.
   *
   * @returns true if all tasks are in a terminal state
   */
  isComplete(): boolean {
    const stats = this.dag.getStats();

    if (stats.totalTasks === 0) {
      return true;
    }

    const terminal = stats.completed + stats.failed + stats.cancelled;
    return terminal === stats.totalTasks;
  }

  // --------------------------------------------------------------------------
  // Internal Helpers
  // --------------------------------------------------------------------------

  /**
   * Sort tasks by priority (highest first) then by downstream
   * dependent count (most blocking first).
   */
  private sortByPriority(tasks: DAGTask[]): DAGTask[] {
    return [...tasks].sort((a, b) => {
      // Primary: priority weight (lower = higher priority)
      const weightA = getPriorityWeight(a.priority);
      const weightB = getPriorityWeight(b.priority);

      if (weightA !== weightB) {
        return weightA - weightB;
      }

      // Secondary: number of tasks blocked (more blockers = schedule first)
      if (this.config.prioritizeBlockers) {
        const blocksA = a.blocks.length;
        const blocksB = b.blocks.length;
        if (blocksA !== blocksB) {
          return blocksB - blocksA; // Descending
        }
      }

      // Tertiary: creation time (earlier = first, FIFO)
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * Group topologically sorted tasks into levels.
   *
   * Tasks at the same level have no dependencies on each other and
   * can theoretically execute in parallel. Level 0 contains source
   * nodes, level 1 contains their immediate dependents, etc.
   */
  private computeTopologicalLevels(sorted: DAGTask[]): DAGTask[][] {
    const level = new Map<string, number>();

    for (const task of sorted) {
      let maxDepLevel = -1;

      for (const blockerId of task.blockedBy) {
        const blockerLevel = level.get(blockerId);
        if (blockerLevel !== undefined && blockerLevel > maxDepLevel) {
          maxDepLevel = blockerLevel;
        }
      }

      level.set(task.id, maxDepLevel + 1);
    }

    // Group by level
    const groups = new Map<number, DAGTask[]>();
    for (const task of sorted) {
      const lvl = level.get(task.id) ?? 0;
      if (!groups.has(lvl)) {
        groups.set(lvl, []);
      }
      groups.get(lvl)!.push(task);
    }

    // Return levels in order
    const maxLevel = Math.max(...Array.from(groups.keys()), -1);
    const result: DAGTask[][] = [];
    for (let i = 0; i <= maxLevel; i++) {
      const group = groups.get(i);
      if (group) {
        result.push(group);
      }
    }

    return result;
  }
}
