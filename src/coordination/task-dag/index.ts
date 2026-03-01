/**
 * Agentic QE v3 - Task Dependency DAG
 * ADR-064 Phase 1E: DAG-based task scheduler with dependency tracking
 *
 * Provides a directed acyclic graph for managing task dependencies,
 * with topological sorting, cycle detection, critical path analysis,
 * and priority-aware scheduling.
 *
 * @example
 * ```typescript
 * import { createTaskDAG, createDAGScheduler } from './coordination/task-dag';
 *
 * const dag = createTaskDAG();
 * const scheduler = createDAGScheduler(dag, { maxConcurrent: 4 });
 *
 * // Build a dependency graph
 * dag.addTask({ id: 'lint', name: 'Lint', domain: 'ci', priority: 'p2' });
 * dag.addTask({ id: 'build', name: 'Build', domain: 'ci', priority: 'p1' });
 * dag.addTask({ id: 'test', name: 'Test', domain: 'ci', priority: 'p0', blockedBy: ['build'] });
 * dag.addTask({ id: 'deploy', name: 'Deploy', domain: 'ci', priority: 'p0', blockedBy: ['test', 'lint'] });
 *
 * // Schedule ready tasks
 * const batch = scheduler.schedule(); // [build, lint] (ready, sorted by priority)
 *
 * // Execute and process completions
 * dag.start('build', 'agent-1');
 * dag.start('lint', 'agent-2');
 * const unblocked = scheduler.onTaskComplete('build'); // test may now be ready
 *
 * // Check progress
 * const progress = scheduler.getProgress(); // { completed: 1, total: 4, percentage: 25 }
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  DAGTaskStatus,
  DAGTask,
  AddTaskInput,
  DAGStats,
  DAGEventType,
  DAGEvent,
  DAGSchedulerConfig,
  DAGEventHandler,
} from './types.js';

// ============================================================================
// Class Exports
// ============================================================================

export { TaskDAG } from './dag.js';
export { DAGScheduler } from './scheduler.js';

// ============================================================================
// Factory Functions
// ============================================================================

import { TaskDAG } from './dag.js';
import { DAGScheduler } from './scheduler.js';
import type { DAGSchedulerConfig } from './types.js';

/**
 * Create a new empty TaskDAG instance.
 *
 * @returns A fresh TaskDAG with no tasks
 */
export function createTaskDAG(): TaskDAG {
  return new TaskDAG();
}

/**
 * Create a new DAGScheduler wrapping a TaskDAG.
 *
 * @param dag - The TaskDAG to schedule from
 * @param config - Optional scheduler configuration
 * @returns A configured DAGScheduler instance
 */
export function createDAGScheduler(
  dag: TaskDAG,
  config?: Partial<DAGSchedulerConfig>
): DAGScheduler {
  return new DAGScheduler(dag, config);
}
