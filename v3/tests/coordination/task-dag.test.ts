/**
 * Unit tests for Task Dependency DAG & DAG Scheduler
 * ADR-064 Phase 1E: DAG-based task scheduling with dependency tracking
 *
 * Tests TaskDAG core operations (add, complete, fail, cycles, critical path)
 * and DAGScheduler (priority ordering, concurrency limits, progress tracking).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskDAG } from '../../src/coordination/task-dag/dag.js';
import { DAGScheduler } from '../../src/coordination/task-dag/scheduler.js';
import type { AddTaskInput, DAGEvent } from '../../src/coordination/task-dag/types.js';

// ============================================================================
// Helpers
// ============================================================================

/** Create a minimal AddTaskInput with sensible defaults */
function task(id: string, overrides: Partial<AddTaskInput> = {}): AddTaskInput {
  return {
    id,
    name: overrides.name ?? `Task ${id}`,
    domain: overrides.domain ?? 'ci',
    priority: overrides.priority,
    blockedBy: overrides.blockedBy,
    metadata: overrides.metadata,
  };
}

// ============================================================================
// TaskDAG Core Operations
// ============================================================================

describe('TaskDAG - Core Operations', () => {
  let dag: TaskDAG;

  beforeEach(() => {
    dag = new TaskDAG();
  });

  it('add single task with no dependencies starts as ready', () => {
    const t = dag.addTask(task('a'));
    expect(t.status).toBe('ready');
    expect(t.blockedBy).toEqual([]);
    expect(t.id).toBe('a');
  });

  it('add task with blockedBy starts as blocked', () => {
    dag.addTask(task('a'));
    const b = dag.addTask(task('b', { blockedBy: ['a'] }));
    expect(b.status).toBe('blocked');
    expect(b.blockedBy).toEqual(['a']);
  });

  it('getReady returns only unblocked tasks', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b'));
    dag.addTask(task('c', { blockedBy: ['a'] }));

    const ready = dag.getReady();
    const readyIds = ready.map((t) => t.id).sort();
    expect(readyIds).toEqual(['a', 'b']);
  });

  it('complete task unblocks dependents', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));

    dag.start('a', 'agent-1');
    const unblocked = dag.complete('a');

    expect(unblocked).toContain('b');
    const bTask = dag.getTask('b');
    expect(bTask?.status).toBe('ready');
  });

  it('complete returns newly unblocked task IDs', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));
    dag.addTask(task('c', { blockedBy: ['a'] }));

    dag.start('a', 'agent-1');
    const unblocked = dag.complete('a');

    expect(unblocked).toHaveLength(2);
    expect(unblocked.sort()).toEqual(['b', 'c']);
  });

  it('fail task cascades cancellation to dependents', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));
    dag.addTask(task('c', { blockedBy: ['b'] }));

    dag.start('a', 'agent-1');
    dag.fail('a', 'timeout');

    expect(dag.getTask('a')?.status).toBe('failed');
    expect(dag.getTask('b')?.status).toBe('cancelled');
    expect(dag.getTask('c')?.status).toBe('cancelled');
  });

  it('start task marks in_progress with agentId', () => {
    dag.addTask(task('a'));
    dag.start('a', 'agent-42');

    const t = dag.getTask('a');
    expect(t?.status).toBe('in_progress');
    expect(t?.assignedTo).toBe('agent-42');
    expect(t?.startedAt).toBeDefined();
  });

  it('removeTask cleans up edges and unblocks dependents', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));

    const removed = dag.removeTask('a');
    expect(removed).toBe(true);
    expect(dag.getTask('a')).toBeUndefined();

    // b should be unblocked after a is removed
    const bTask = dag.getTask('b');
    expect(bTask?.status).toBe('ready');
  });

  it('clear removes all tasks', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b'));
    dag.addTask(task('c', { blockedBy: ['a', 'b'] }));

    dag.clear();

    expect(dag.getReady()).toHaveLength(0);
    expect(dag.getTask('a')).toBeUndefined();
  });
});

// ============================================================================
// TaskDAG - Topological Sort & Cycle Detection
// ============================================================================

describe('TaskDAG - Topological Sort & Cycles', () => {
  let dag: TaskDAG;

  beforeEach(() => {
    dag = new TaskDAG();
  });

  it('topological sort returns valid ordering for acyclic graph', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));
    dag.addTask(task('c', { blockedBy: ['b'] }));

    const sorted = dag.topologicalSort();
    const ids = sorted.map((t) => t.id);

    // a must come before b, and b before c
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'));
  });

  it('topological sort throws on cycle', () => {
    // Create a cycle: a -> b -> c -> a
    // We add forward edges manually since addTask uses blockedBy
    dag.addTask(task('a', { blockedBy: ['c'] }));
    dag.addTask(task('b', { blockedBy: ['a'] }));
    dag.addTask(task('c', { blockedBy: ['b'] }));

    expect(() => dag.topologicalSort()).toThrow(/[Cc]ycle/);
  });

  it('detectCycles finds circular dependencies', () => {
    dag.addTask(task('a', { blockedBy: ['c'] }));
    dag.addTask(task('b', { blockedBy: ['a'] }));
    dag.addTask(task('c', { blockedBy: ['b'] }));

    const cycles = dag.detectCycles();
    expect(cycles).not.toBeNull();
    expect(cycles!.length).toBeGreaterThan(0);
  });

  it('detectCycles returns null for acyclic graph', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));
    dag.addTask(task('c', { blockedBy: ['a'] }));

    const cycles = dag.detectCycles();
    expect(cycles).toBeNull();
  });
});

// ============================================================================
// TaskDAG - Critical Path & Stats
// ============================================================================

describe('TaskDAG - Critical Path & Stats', () => {
  let dag: TaskDAG;

  beforeEach(() => {
    dag = new TaskDAG();
  });

  it('getCriticalPath returns longest path', () => {
    // a -> b -> c (length 3)
    // d (length 1, independent)
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));
    dag.addTask(task('c', { blockedBy: ['b'] }));
    dag.addTask(task('d'));

    const critical = dag.getCriticalPath();
    expect(critical.length).toBe(3);
    const ids = critical.map((t) => t.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('getStats returns correct counts', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));
    dag.addTask(task('c', { blockedBy: ['a'] }));
    dag.addTask(task('d'));

    const stats = dag.getStats();
    expect(stats.totalTasks).toBe(4);
    expect(stats.ready).toBe(2);       // a and d
    expect(stats.blocked).toBe(2);     // b and c
    expect(stats.completed).toBe(0);
    expect(stats.hasCycles).toBe(false);
    expect(stats.longestPath).toBe(2); // a -> b or a -> c
  });

  it('getStats reflects in_progress and completed states', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b'));

    dag.start('a', 'agent-1');
    dag.start('b', 'agent-2');
    dag.complete('a');

    const stats = dag.getStats();
    expect(stats.inProgress).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.ready).toBe(0);
  });
});

// ============================================================================
// TaskDAG - Complex Dependency Patterns
// ============================================================================

describe('TaskDAG - Complex Dependency Patterns', () => {
  let dag: TaskDAG;

  beforeEach(() => {
    dag = new TaskDAG();
  });

  it('diamond dependency graph: A -> B,C -> D', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));
    dag.addTask(task('c', { blockedBy: ['a'] }));
    dag.addTask(task('d', { blockedBy: ['b', 'c'] }));

    // Start: a ready, b/c/d blocked
    expect(dag.getReady().map((t) => t.id)).toEqual(['a']);

    // Complete a -> b,c unblocked
    dag.start('a', 'agent-1');
    const unblockedAfterA = dag.complete('a');
    expect(unblockedAfterA.sort()).toEqual(['b', 'c']);
    expect(dag.getTask('d')?.status).toBe('blocked');

    // Complete b -> d still blocked (c not done)
    dag.start('b', 'agent-2');
    const unblockedAfterB = dag.complete('b');
    expect(unblockedAfterB).toEqual([]);
    expect(dag.getTask('d')?.status).toBe('blocked');

    // Complete c -> d unblocked
    dag.start('c', 'agent-3');
    const unblockedAfterC = dag.complete('c');
    expect(unblockedAfterC).toContain('d');
    expect(dag.getTask('d')?.status).toBe('ready');
  });

  it('deep chain dependency: A -> B -> C -> D', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));
    dag.addTask(task('c', { blockedBy: ['b'] }));
    dag.addTask(task('d', { blockedBy: ['c'] }));

    // Only a is ready initially
    expect(dag.getReady().map((t) => t.id)).toEqual(['a']);

    // Walk through the chain
    dag.start('a', 'agent-1');
    let unblocked = dag.complete('a');
    expect(unblocked).toEqual(['b']);

    dag.start('b', 'agent-1');
    unblocked = dag.complete('b');
    expect(unblocked).toEqual(['c']);

    dag.start('c', 'agent-1');
    unblocked = dag.complete('c');
    expect(unblocked).toEqual(['d']);

    dag.start('d', 'agent-1');
    unblocked = dag.complete('d');
    expect(unblocked).toEqual([]);

    const stats = dag.getStats();
    expect(stats.completed).toBe(4);
  });

  it('parallel independent tasks are all ready', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b'));
    dag.addTask(task('c'));
    dag.addTask(task('d'));

    const ready = dag.getReady();
    expect(ready).toHaveLength(4);
    expect(ready.every((t) => t.status === 'ready')).toBe(true);
  });
});

// ============================================================================
// TaskDAG - Event Handling
// ============================================================================

describe('TaskDAG - Events', () => {
  let dag: TaskDAG;

  beforeEach(() => {
    dag = new TaskDAG();
  });

  it('emits task-ready event when task is added without blockers', () => {
    const events: DAGEvent[] = [];
    dag.onEvent((e) => events.push(e));

    dag.addTask(task('a'));

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('task-ready');
    expect(events[0].taskId).toBe('a');
  });

  it('emits tasks-unblocked when completing a blocker', () => {
    const events: DAGEvent[] = [];

    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));

    dag.onEvent((e) => events.push(e));

    dag.start('a', 'agent-1');
    dag.complete('a');

    const unblockedEvent = events.find((e) => e.type === 'tasks-unblocked');
    expect(unblockedEvent).toBeDefined();
    expect(unblockedEvent!.unblockedTaskIds).toContain('b');
  });

  it('unsubscribe removes event handler', () => {
    const events: DAGEvent[] = [];
    const unsub = dag.onEvent((e) => events.push(e));

    dag.addTask(task('a'));
    expect(events.length).toBe(1);

    unsub();
    dag.addTask(task('b'));
    // Should still be 1 since we unsubscribed
    expect(events.length).toBe(1);
  });
});

// ============================================================================
// DAGScheduler
// ============================================================================

describe('DAGScheduler', () => {
  let dag: TaskDAG;
  let scheduler: DAGScheduler;

  beforeEach(() => {
    dag = new TaskDAG();
    scheduler = new DAGScheduler(dag, { maxConcurrent: 2 });
  });

  it('schedule respects maxConcurrent limit', () => {
    dag.addTask(task('a', { priority: 'p0' }));
    dag.addTask(task('b', { priority: 'p1' }));
    dag.addTask(task('c', { priority: 'p2' }));

    const batch = scheduler.schedule();
    expect(batch).toHaveLength(2);
  });

  it('schedule returns empty when no ready tasks', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));

    dag.start('a', 'agent-1');

    // a is in_progress (not ready), b is blocked => nothing to schedule
    // But maxConcurrent is 2 and 1 in progress, so 1 slot, but b is blocked
    const batch = scheduler.schedule();
    expect(batch).toHaveLength(0);
  });

  it('prioritizes by priority level (p0 before p1)', () => {
    dag.addTask(task('low', { priority: 'p2' }));
    dag.addTask(task('high', { priority: 'p0' }));
    dag.addTask(task('mid', { priority: 'p1' }));

    const batch = scheduler.schedule();
    expect(batch[0].id).toBe('high');
    expect(batch[1].id).toBe('mid');
  });

  it('prioritizes by number of dependents when priorities equal', () => {
    // 'blocker' blocks 2 tasks, 'solo' blocks none
    dag.addTask(task('blocker', { priority: 'p1' }));
    dag.addTask(task('solo', { priority: 'p1' }));
    dag.addTask(task('dep1', { blockedBy: ['blocker'] }));
    dag.addTask(task('dep2', { blockedBy: ['blocker'] }));

    const batch = scheduler.schedule();
    // blocker should come first because it blocks more downstream tasks
    expect(batch[0].id).toBe('blocker');
  });

  it('onTaskComplete returns newly schedulable tasks', () => {
    dag.addTask(task('a', { priority: 'p0' }));
    dag.addTask(task('b', { blockedBy: ['a'] }));

    dag.start('a', 'agent-1');
    const newTasks = scheduler.onTaskComplete('a');

    expect(newTasks).toHaveLength(1);
    expect(newTasks[0].id).toBe('b');
    expect(newTasks[0].status).toBe('ready');
  });

  it('onTaskFail handles cascading cancellation', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));
    dag.addTask(task('c', { blockedBy: ['b'] }));

    dag.start('a', 'agent-1');
    scheduler.onTaskFail('a', 'crash');

    expect(dag.getTask('a')?.status).toBe('failed');
    expect(dag.getTask('b')?.status).toBe('cancelled');
    expect(dag.getTask('c')?.status).toBe('cancelled');
  });

  it('getProgress returns correct percentage', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b'));
    dag.addTask(task('c'));
    dag.addTask(task('d'));

    dag.start('a', 'agent-1');
    dag.complete('a');
    dag.start('b', 'agent-2');
    dag.complete('b');

    const progress = scheduler.getProgress();
    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(4);
    expect(progress.percentage).toBe(50);
  });

  it('getProgress returns 100% for empty DAG', () => {
    const progress = scheduler.getProgress();
    expect(progress.percentage).toBe(100);
    expect(progress.total).toBe(0);
  });

  it('isComplete returns true when all tasks are done', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b'));

    expect(scheduler.isComplete()).toBe(false);

    dag.start('a', 'agent-1');
    dag.complete('a');
    dag.start('b', 'agent-2');
    dag.complete('b');

    expect(scheduler.isComplete()).toBe(true);
  });

  it('isComplete returns true for empty DAG', () => {
    expect(scheduler.isComplete()).toBe(true);
  });

  it('isComplete is true when all tasks are failed or cancelled', () => {
    dag.addTask(task('a'));
    dag.addTask(task('b', { blockedBy: ['a'] }));

    dag.start('a', 'agent-1');
    dag.fail('a', 'error');

    // a failed, b cancelled
    expect(scheduler.isComplete()).toBe(true);
  });
});
