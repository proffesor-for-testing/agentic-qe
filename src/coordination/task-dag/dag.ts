/**
 * Agentic QE v3 - Task Dependency DAG
 * ADR-064 Phase 1E: Core DAG data structure for task dependency tracking
 *
 * Directed acyclic graph where nodes are tasks and edges represent
 * "blocked-by" dependencies. Topological sort via Kahn's algorithm,
 * cycle detection via DFS coloring, critical path via longest-path DP.
 */

import type {
  DAGTask,
  DAGTaskStatus,
  AddTaskInput,
  DAGStats,
  DAGEvent,
  DAGEventHandler,
} from './types.js';

/** DFS node coloring for cycle detection */
const enum NodeColor { White = 0, Gray = 1, Black = 2 }

/**
 * Directed acyclic graph for task dependency management.
 *
 * Tasks are nodes with forward edges (blockedBy) and reverse edges (blocks).
 * Acyclicity is enforced through detection, allowing batch insertions.
 */
export class TaskDAG {
  private readonly nodes: Map<string, DAGTask> = new Map();
  private readonly forwardEdges: Map<string, Set<string>> = new Map();
  private readonly reverseEdges: Map<string, Set<string>> = new Map();
  private readonly eventHandlers: DAGEventHandler[] = [];

  /**
   * Add a task to the DAG. Status is 'ready' if no incomplete blockers,
   * otherwise 'blocked'. Reverse edges are computed automatically.
   * @throws Error if a task with the same ID already exists
   */
  addTask(input: AddTaskInput): DAGTask {
    if (this.nodes.has(input.id)) {
      throw new Error(`Task '${input.id}' already exists in the DAG`);
    }

    const blockedBy = input.blockedBy ?? [];
    this.forwardEdges.set(input.id, new Set(blockedBy));
    if (!this.reverseEdges.has(input.id)) {
      this.reverseEdges.set(input.id, new Set());
    }

    for (const blockerId of blockedBy) {
      if (!this.reverseEdges.has(blockerId)) {
        this.reverseEdges.set(blockerId, new Set());
      }
      this.reverseEdges.get(blockerId)!.add(input.id);
    }

    // Blocks array: tasks already in graph that depend on this one
    const blocks: string[] = [];
    const existingDeps = this.reverseEdges.get(input.id);
    if (existingDeps) {
      for (const depId of existingDeps) blocks.push(depId);
    }

    const status = this.computeStatus(blockedBy);
    const task: DAGTask = {
      id: input.id,
      name: input.name,
      domain: input.domain,
      priority: input.priority ?? 'p2',
      status,
      blockedBy: [...blockedBy],
      blocks: [...blocks],
      metadata: input.metadata,
      createdAt: Date.now(),
    };
    this.nodes.set(input.id, task);

    // Update blocker tasks' blocks arrays
    for (const blockerId of blockedBy) {
      const blocker = this.nodes.get(blockerId);
      if (blocker && !blocker.blocks.includes(input.id)) {
        this.nodes.set(blockerId, { ...blocker, blocks: [...blocker.blocks, input.id] });
      }
    }

    if (status === 'ready') {
      this.emit({ type: 'task-ready', taskId: input.id, timestamp: Date.now() });
    }
    return task;
  }

  /**
   * Remove a task, clean up edges, and unblock dependents if appropriate.
   * @returns true if removed, false if not found
   */
  removeTask(taskId: string): boolean {
    if (!this.nodes.has(taskId)) return false;

    // Detach from blockers
    const forward = this.forwardEdges.get(taskId);
    if (forward) {
      for (const blockerId of forward) {
        this.reverseEdges.get(blockerId)?.delete(taskId);
        const blocker = this.nodes.get(blockerId);
        if (blocker) {
          this.nodes.set(blockerId, {
            ...blocker,
            blocks: blocker.blocks.filter((id) => id !== taskId),
          });
        }
      }
    }

    // Detach from dependents and check for unblocking
    const reverse = this.reverseEdges.get(taskId);
    const unblockedIds: string[] = [];
    if (reverse) {
      for (const depId of reverse) {
        this.forwardEdges.get(depId)?.delete(taskId);
        const dep = this.nodes.get(depId);
        if (dep) {
          this.nodes.set(depId, {
            ...dep,
            blockedBy: dep.blockedBy.filter((id) => id !== taskId),
          });
        }
        const updated = this.nodes.get(depId);
        if (updated && (updated.status === 'blocked' || updated.status === 'pending')) {
          if (this.computeStatus(Array.from(this.forwardEdges.get(depId) ?? [])) === 'ready') {
            this.setStatus(depId, 'ready');
            unblockedIds.push(depId);
          }
        }
      }
    }

    this.forwardEdges.delete(taskId);
    this.reverseEdges.delete(taskId);
    this.nodes.delete(taskId);

    if (unblockedIds.length > 0) {
      this.emit({ type: 'tasks-unblocked', unblockedTaskIds: unblockedIds, timestamp: Date.now() });
    }
    return true;
  }

  /** Get a task by ID. */
  getTask(taskId: string): DAGTask | undefined {
    return this.nodes.get(taskId);
  }

  /** Get all tasks with 'ready' status. */
  getReady(): DAGTask[] {
    const ready: DAGTask[] = [];
    for (const task of this.nodes.values()) {
      if (task.status === 'ready') ready.push(task);
    }
    return ready;
  }

  /**
   * Mark a task as in_progress.
   * @throws Error if task not found or not in 'ready' status
   */
  start(taskId: string, agentId: string): void {
    const task = this.requireTask(taskId);
    if (task.status !== 'ready') {
      throw new Error(`Cannot start '${taskId}': status '${task.status}', expected 'ready'`);
    }
    this.nodes.set(taskId, {
      ...task,
      status: 'in_progress' as DAGTaskStatus,
      assignedTo: agentId,
      startedAt: Date.now(),
    });
  }

  /**
   * Mark a task completed and unblock downstream tasks.
   * @returns Array of newly unblocked task IDs
   * @throws Error if task not found or not 'in_progress'
   */
  complete(taskId: string, result?: unknown): string[] {
    const task = this.requireTask(taskId);
    if (task.status !== 'in_progress') {
      throw new Error(`Cannot complete '${taskId}': status '${task.status}', expected 'in_progress'`);
    }
    const now = Date.now();
    this.nodes.set(taskId, { ...task, status: 'completed' as DAGTaskStatus, completedAt: now, result });
    this.emit({ type: 'task-completed', taskId, timestamp: now });

    const unblockedIds = this.unblockDependents(taskId);
    if (unblockedIds.length > 0) {
      this.emit({ type: 'tasks-unblocked', unblockedTaskIds: unblockedIds, timestamp: Date.now() });
    }
    return unblockedIds;
  }

  /**
   * Mark a task failed and cascade cancellation to dependents.
   * @throws Error if task not found or not in 'in_progress'/'ready'
   */
  fail(taskId: string, error: string): void {
    const task = this.requireTask(taskId);
    if (task.status !== 'in_progress' && task.status !== 'ready') {
      throw new Error(`Cannot fail '${taskId}': status '${task.status}', expected 'in_progress' or 'ready'`);
    }
    const now = Date.now();
    this.nodes.set(taskId, { ...task, status: 'failed' as DAGTaskStatus, completedAt: now, error });
    this.emit({ type: 'task-failed', taskId, timestamp: now });
    this.cascadeCancellation(taskId);
  }

  /**
   * Topological sort using Kahn's algorithm.
   * @throws Error if cycles exist
   */
  topologicalSort(): DAGTask[] {
    const inDegree = new Map<string, number>();
    for (const nodeId of this.nodes.keys()) {
      let count = 0;
      const fwd = this.forwardEdges.get(nodeId);
      if (fwd) {
        for (const dep of fwd) {
          if (this.nodes.has(dep)) count++;
        }
      }
      inDegree.set(nodeId, count);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: DAGTask[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const task = this.nodes.get(nodeId);
      if (task) sorted.push(task);

      const dependents = this.reverseEdges.get(nodeId);
      if (dependents) {
        for (const depId of dependents) {
          if (!this.nodes.has(depId)) continue;
          const newDeg = (inDegree.get(depId) ?? 0) - 1;
          inDegree.set(depId, newDeg);
          if (newDeg === 0) queue.push(depId);
        }
      }
    }

    if (sorted.length !== this.nodes.size) {
      throw new Error(
        `Cycle detected: sorted ${sorted.length} of ${this.nodes.size} tasks`
      );
    }
    return sorted;
  }

  /**
   * Detect cycles using DFS with white/gray/black coloring.
   * @returns Array of cycles, or null if acyclic
   */
  detectCycles(): string[][] | null {
    const color = new Map<string, NodeColor>();
    const parent = new Map<string, string | null>();
    const cycles: string[][] = [];

    for (const id of this.nodes.keys()) color.set(id, NodeColor.White);
    for (const id of this.nodes.keys()) {
      if (color.get(id) === NodeColor.White) {
        this.dfsCycles(id, color, parent, cycles);
      }
    }

    if (cycles.length === 0) return null;
    this.emit({ type: 'cycle-detected', cycleNodes: cycles.flat(), timestamp: Date.now() });
    return cycles;
  }

  /**
   * Find the critical path (longest path through the DAG).
   * @returns Tasks on the critical path in execution order
   */
  getCriticalPath(): DAGTask[] {
    if (this.nodes.size === 0) return [];

    let sorted: DAGTask[];
    try { sorted = this.topologicalSort(); } catch { return []; }

    const dist = new Map<string, number>();
    const pred = new Map<string, string | null>();
    for (const t of sorted) { dist.set(t.id, 1); pred.set(t.id, null); }

    for (const task of sorted) {
      const d = dist.get(task.id)!;
      const deps = this.reverseEdges.get(task.id);
      if (deps) {
        for (const depId of deps) {
          if (!this.nodes.has(depId)) continue;
          if (d + 1 > (dist.get(depId) ?? 1)) {
            dist.set(depId, d + 1);
            pred.set(depId, task.id);
          }
        }
      }
    }

    let maxDist = 0;
    let endNode: string | null = null;
    for (const [id, d] of dist) {
      if (d > maxDist) { maxDist = d; endNode = id; }
    }
    if (!endNode) return [];

    const path: DAGTask[] = [];
    let cur: string | null = endNode;
    while (cur !== null) {
      const t = this.nodes.get(cur);
      if (t) path.unshift(t);
      cur = pred.get(cur) ?? null;
    }
    return path;
  }

  /** Get aggregate statistics about the DAG. */
  getStats(): DAGStats {
    let pending = 0, ready = 0, inProgress = 0, completed = 0;
    let failed = 0, blocked = 0, cancelled = 0;
    for (const task of this.nodes.values()) {
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
    return {
      totalTasks: this.nodes.size,
      pending, ready, inProgress, completed, failed, blocked, cancelled,
      longestPath: this.getCriticalPath().length,
      hasCycles: this.detectCycles() !== null,
    };
  }

  /** Remove all tasks from the DAG. */
  clear(): void {
    this.nodes.clear();
    this.forwardEdges.clear();
    this.reverseEdges.clear();
  }

  /** Serialize the DAG for debugging. */
  toJSON(): { tasks: DAGTask[]; edges: Array<{ from: string; to: string }>; stats: DAGStats } {
    const tasks = Array.from(this.nodes.values());
    const edges: Array<{ from: string; to: string }> = [];
    for (const [taskId, deps] of this.forwardEdges) {
      for (const depId of deps) edges.push({ from: depId, to: taskId });
    }
    return { tasks, edges, stats: this.getStats() };
  }

  /**
   * Register a handler to receive DAG events.
   * @returns Unsubscribe function
   */
  onEvent(handler: DAGEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  // --- Internal helpers ---

  private requireTask(taskId: string): DAGTask {
    const task = this.nodes.get(taskId);
    if (!task) throw new Error(`Task '${taskId}' not found in the DAG`);
    return task;
  }

  private computeStatus(blockerIds: string[]): DAGTaskStatus {
    if (blockerIds.length === 0) return 'ready';
    for (const id of blockerIds) {
      const b = this.nodes.get(id);
      if (!b || b.status !== 'completed') return 'blocked';
    }
    return 'ready';
  }

  private setStatus(taskId: string, status: DAGTaskStatus): void {
    const task = this.nodes.get(taskId);
    if (!task) return;
    this.nodes.set(taskId, { ...task, status });
    if (status === 'ready') {
      this.emit({ type: 'task-ready', taskId, timestamp: Date.now() });
    }
  }

  private unblockDependents(completedId: string): string[] {
    const unblockedIds: string[] = [];
    const deps = this.reverseEdges.get(completedId);
    if (!deps) return unblockedIds;

    for (const depId of deps) {
      const dep = this.nodes.get(depId);
      if (!dep || dep.status !== 'blocked') continue;
      const fwd = this.forwardEdges.get(depId);
      if (!fwd) continue;

      let allDone = true;
      for (const bId of fwd) {
        const b = this.nodes.get(bId);
        if (!b || b.status !== 'completed') { allDone = false; break; }
      }
      if (allDone) {
        this.setStatus(depId, 'ready');
        unblockedIds.push(depId);
      }
    }
    return unblockedIds;
  }

  private cascadeCancellation(failedId: string): void {
    const deps = this.reverseEdges.get(failedId);
    if (!deps) return;

    for (const depId of deps) {
      const dep = this.nodes.get(depId);
      if (!dep || dep.status === 'completed' || dep.status === 'failed' || dep.status === 'cancelled') {
        continue;
      }
      const fwd = this.forwardEdges.get(depId);
      if (!fwd) continue;

      let unsatisfiable = false;
      for (const bId of fwd) {
        const b = this.nodes.get(bId);
        if (b && (b.status === 'failed' || b.status === 'cancelled')) {
          unsatisfiable = true;
          break;
        }
      }
      if (unsatisfiable) {
        this.nodes.set(depId, {
          ...dep,
          status: 'cancelled',
          completedAt: Date.now(),
          error: `Cancelled: upstream task '${failedId}' failed`,
        });
        this.cascadeCancellation(depId);
      }
    }
  }

  private dfsCycles(
    nodeId: string,
    color: Map<string, NodeColor>,
    parent: Map<string, string | null>,
    cycles: string[][]
  ): void {
    color.set(nodeId, NodeColor.Gray);
    const dependencies = this.forwardEdges.get(nodeId);
    if (dependencies) {
      for (const depId of dependencies) {
        if (!this.nodes.has(depId)) continue;
        const c = color.get(depId);
        if (c === NodeColor.White) {
          parent.set(depId, nodeId);
          this.dfsCycles(depId, color, parent, cycles);
        } else if (c === NodeColor.Gray) {
          const cycle: string[] = [depId, nodeId];
          let cur = nodeId;
          while (cur !== depId) {
            const p = parent.get(cur);
            if (p === null || p === undefined || p === depId) break;
            cycle.push(p);
            cur = p;
          }
          cycles.push(cycle);
        }
      }
    }
    color.set(nodeId, NodeColor.Black);
  }

  private emit(event: DAGEvent): void {
    for (const handler of this.eventHandlers) {
      try { handler(event); } catch { /* handler errors are silently ignored */ }
    }
  }
}
