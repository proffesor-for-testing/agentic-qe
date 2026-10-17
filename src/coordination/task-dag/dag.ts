/**
 * Agentic QE v3 - Task Dependency DAG
 * ADR-064 Phase 1E: Core DAG data structure for task dependency tracking
 *
 * Directed acyclic graph where nodes are tasks and edges represent
 * "blocked-by" dependencies. Topological sort via Kahn's algorithm,
 * cycle detection via DFS coloring, critical path via longest-path DP.
 *
 * Issue #1069: every prerequisite edge carries a typed disposition backed
 * by an immutable PrerequisiteReceiptV1. A dependent becomes ready only
 * when every edge is SATISFIED or WAIVED. Removing an unfinished
 * prerequisite leaves a REMOVED tombstone and keeps dependents blocked.
 */

import { randomUUID } from 'node:crypto';
import type {
  DAGTask,
  DAGTaskStatus,
  AddTaskInput,
  DAGStats,
  DAGSnapshot,
  DAGEvent,
  DAGEventHandler,
  CompleteTaskOptions,
  ObligationSummary,
  PrerequisiteDisposition,
  PrerequisiteEdgeState,
  PrerequisiteReceiptV1,
  RemovedTaskRecord,
  RemoveTaskOptions,
  TaskDAGOptions,
  WaivePrerequisiteInput,
  WaiverPolicy,
} from './types.js';
import { criticalPath, findCycles, topologicalSort, type DAGGraphView } from './dag-algorithms.js';
import { PrerequisiteLedger, TERMINAL_STATUSES as TERMINAL, validateWaiverInput } from './prerequisite-ledger.js';
import { authorizeWaiver, countStatuses, initialDisposition } from './dag-obligations.js';

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
  private readonly ledger: PrerequisiteLedger;
  private readonly waiverPolicy?: WaiverPolicy;

  constructor(options: TaskDAGOptions = {}) {
    this.ledger = new PrerequisiteLedger(options.graphId ?? `dag-${randomUUID()}`);
    this.waiverPolicy = options.waiverPolicy;
  }

  /** Stable identity of this graph, stamped on every receipt. */
  get graphId(): string {
    return this.ledger.graphId;
  }

  /** Monotonically increasing revision; advances on every mutation. */
  get graphRevision(): number {
    return this.ledger.graphRevision;
  }

  /**
   * Add a task to the DAG. Status is 'ready' if every prerequisite is
   * SATISFIED, otherwise 'blocked'. Prerequisites not yet in the graph are
   * recorded as MISSING until they are added.
   * @throws Error if a task with the same ID already exists
   */
  addTask(input: AddTaskInput): DAGTask {
    if (this.nodes.has(input.id)) {
      throw new Error(`Task '${input.id}' already exists in the DAG`);
    }
    this.ledger.bump();

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

    this.ledger.addObligation(input.id);
    for (const blockerId of new Set(blockedBy)) {
      const blocker = this.nodes.get(blockerId);
      this.ledger.record(input.id, blockerId, initialDisposition(blocker, this.ledger.isTombstoned(blockerId)), {
        completionEvidenceRef: blocker?.status === 'completed' ? blocker.evidenceRef : undefined,
      });
    }

    // Blocks array: tasks already in graph that depend on this one.
    // Their MISSING/REMOVED edges are now materialized as UNRESOLVED.
    const blocks: string[] = [];
    for (const depId of this.reverseEdges.get(input.id) ?? []) {
      blocks.push(depId);
      const d = this.ledger.disposition(depId, input.id);
      if (d === 'MISSING' || d === 'REMOVED') this.ledger.record(depId, input.id, 'UNRESOLVED');
    }

    const status = this.computeStatus(input.id);
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
   * Remove a task. A lifecycle operation, not an obligation resolution:
   * dependents keep the edge. An unfinished task's unresolved dependent
   * edges become REMOVED and dependents stay blocked until it is re-added
   * and completed, or the edge is waived. SATISFIED edges survive removal,
   * and the task stays in the obligation denominator as a tombstone.
   * @returns true if removed, false if not found
   * @throws GraphRevisionConflictError if options.expectedRevision is stale
   */
  removeTask(taskId: string, options: RemoveTaskOptions = {}): boolean {
    const task = this.nodes.get(taskId);
    if (!task) return false;
    this.ledger.checkRevision(options.expectedRevision);
    const revision = this.ledger.bump();

    // Detach the removed node's own edges to its blockers
    for (const blockerId of this.forwardEdges.get(taskId) ?? []) {
      this.reverseEdges.get(blockerId)?.delete(taskId);
      const blocker = this.nodes.get(blockerId);
      if (blocker) this.nodes.set(blockerId, { ...blocker, blocks: blocker.blocks.filter((id) => id !== taskId) });
    }
    this.ledger.dropEdgesOf(taskId);

    // Fail closed: dependents keep the edge; unfinished work becomes REMOVED
    const affected: string[] = [];
    if (task.status !== 'completed') {
      for (const depId of this.reverseEdges.get(taskId) ?? []) {
        if (this.nodes.has(depId) && this.ledger.disposition(depId, taskId) === 'UNRESOLVED') {
          this.ledger.record(depId, taskId, 'REMOVED');
          affected.push(depId);
        }
      }
    }

    this.ledger.tombstone(taskId, task.status);
    this.forwardEdges.delete(taskId);
    this.nodes.delete(taskId);
    // reverseEdges[taskId] is kept so dependents stay linked to the tombstone

    this.emit({ type: 'task-removed', taskId, affectedTaskIds: affected, graphRevision: revision, timestamp: Date.now() });
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
    this.ledger.bump();
    this.nodes.set(taskId, {
      ...task,
      status: 'in_progress' as DAGTaskStatus,
      assignedTo: agentId,
      startedAt: Date.now(),
    });
  }

  /**
   * Mark a task completed, record SATISFIED on its dependent edges, and
   * unblock dependents whose edges are all SATISFIED or WAIVED.
   * @returns Array of newly unblocked task IDs
   * @throws Error if task not found or not 'in_progress'
   * @throws GraphRevisionConflictError if options.expectedRevision is stale
   */
  complete(taskId: string, result?: unknown, options: CompleteTaskOptions = {}): string[] {
    const task = this.requireTask(taskId);
    if (task.status !== 'in_progress') {
      throw new Error(`Cannot complete '${taskId}': status '${task.status}', expected 'in_progress'`);
    }
    const evidenceRef = options.evidenceRef;
    if (evidenceRef !== undefined && (typeof evidenceRef !== 'string' || evidenceRef.trim() === '')) {
      throw new Error(`Cannot complete '${taskId}': evidenceRef must be a non-empty string`);
    }
    this.ledger.checkRevision(options.expectedRevision);
    this.ledger.bump();

    const now = Date.now();
    this.nodes.set(taskId, { ...task, status: 'completed' as DAGTaskStatus, completedAt: now, result, evidenceRef });
    this.emit({ type: 'task-completed', taskId, timestamp: now });

    this.recordOnDependents(taskId, 'SATISFIED', ['UNRESOLVED', 'WAIVED'], evidenceRef);
    const unblockedIds = this.unblockDependents(taskId);
    if (unblockedIds.length > 0) {
      this.emit({ type: 'tasks-unblocked', unblockedTaskIds: unblockedIds, timestamp: Date.now() });
    }
    return unblockedIds;
  }

  /**
   * Mark a task failed, record FAILED on its unresolved dependent edges,
   * and cascade cancellation to dependents.
   * @throws Error if task not found or not in 'in_progress'/'ready'
   */
  fail(taskId: string, error: string): void {
    const task = this.requireTask(taskId);
    if (task.status !== 'in_progress' && task.status !== 'ready') {
      throw new Error(`Cannot fail '${taskId}': status '${task.status}', expected 'in_progress' or 'ready'`);
    }
    this.terminate(task, 'failed', error);
  }

  /**
   * Cancel a non-terminal task, record CANCELLED on its unresolved
   * dependent edges, and cascade cancellation to dependents.
   * @throws Error if task not found or already terminal
   */
  cancel(taskId: string, reason: string): void {
    const task = this.requireTask(taskId);
    if (TERMINAL.has(task.status)) {
      throw new Error(`Cannot cancel '${taskId}': status '${task.status}' is terminal`);
    }
    this.terminate(task, 'cancelled', reason);
  }

  /**
   * Explicitly waive one prerequisite edge. This is the only way a
   * dependent becomes ready without a SATISFIED receipt. The original edge
   * is kept and a WAIVED receipt carries actor, reason, authority and time.
   * @returns The WAIVED receipt
   * @throws PrerequisiteWaiverError on invalid input, unknown edge,
   *   already-resolved edge, terminal dependent, or policy rejection
   * @throws GraphRevisionConflictError if expectedRevision is stale
   */
  waivePrerequisite(input: WaivePrerequisiteInput): PrerequisiteReceiptV1 {
    const req = validateWaiverInput(input);
    const task = this.nodes.get(req.taskId);
    const baseRevision = this.ledger.graphRevision;
    authorizeWaiver(this.ledger, this.waiverPolicy, req, task, this.forwardEdges.get(req.taskId));
    // A policy that mutated the graph invalidates the decision it just made
    this.ledger.checkRevision(baseRevision);
    const revision = this.ledger.bump();
    const receipt = this.ledger.record(req.taskId, req.prerequisiteId, 'WAIVED', {
      waiver: {
        actor: req.actor,
        reason: req.reason,
        ...(req.authorityRef !== undefined ? { authorityRef: req.authorityRef } : {}),
        issuedAt: new Date().toISOString(),
      },
    });
    const { taskId, prerequisiteId } = req;
    this.emit({ type: 'prerequisite-waived', taskId, prerequisiteId, graphRevision: revision, timestamp: Date.now() });

    // Re-read: an event handler may have changed the task (e.g. cancelled it)
    const latest = this.nodes.get(taskId);
    if ((latest?.status === 'blocked' || latest?.status === 'pending') && this.computeStatus(taskId) === 'ready') {
      this.setStatus(taskId, 'ready');
      this.emit({ type: 'tasks-unblocked', unblockedTaskIds: [taskId], timestamp: Date.now() });
    }
    return receipt;
  }

  /** Current disposition of every prerequisite edge of a task. */
  getPrerequisiteDispositions(taskId: string): PrerequisiteEdgeState[] {
    return this.ledger.edgesOf(taskId, this.forwardEdges.get(taskId) ?? []);
  }

  /** Prerequisite edges that currently prevent a task from being ready. */
  getBlockers(taskId: string): PrerequisiteEdgeState[] {
    return this.getPrerequisiteDispositions(taskId).filter(
      (e) => e.disposition !== 'SATISFIED' && e.disposition !== 'WAIVED'
    );
  }

  /** Append-only receipt log, optionally filtered by dependent or prerequisite. */
  getReceipts(filter?: { taskId?: string; prerequisiteId?: string }): PrerequisiteReceiptV1[] {
    return this.ledger.receipts(filter);
  }

  /** Tombstones for tasks removed from the graph. */
  getRemovedTasks(): RemovedTaskRecord[] {
    return this.ledger.removedTasks();
  }

  /** Obligation accounting against the original task denominator. */
  getObligationSummary(): ObligationSummary {
    return this.ledger.summarize(this.nodes.values());
  }

  /**
   * Topological sort using Kahn's algorithm.
   * @throws Error if cycles exist
   */
  topologicalSort(): DAGTask[] {
    return topologicalSort(this.graphView());
  }

  /**
   * Detect cycles using DFS with white/gray/black coloring.
   * @returns Array of cycles, or null if acyclic
   */
  detectCycles(): string[][] | null {
    const cycles = findCycles(this.graphView());
    if (cycles.length === 0) return null;
    this.emit({ type: 'cycle-detected', cycleNodes: cycles.flat(), timestamp: Date.now() });
    return cycles;
  }

  /**
   * Find the critical path (longest path through the DAG).
   * @returns Tasks on the critical path in execution order
   */
  getCriticalPath(): DAGTask[] {
    return criticalPath(this.graphView());
  }

  /** Get aggregate statistics about the DAG. */
  getStats(): DAGStats {
    return {
      totalTasks: this.nodes.size,
      ...countStatuses(this.nodes.values()),
      longestPath: this.getCriticalPath().length,
      hasCycles: this.detectCycles() !== null,
    };
  }

  /**
   * Remove all tasks, receipts and tombstones from the DAG. The graph
   * revision keeps increasing so stale expectedRevision guards still fail.
   */
  clear(): void {
    this.ledger.bump();
    this.nodes.clear();
    this.forwardEdges.clear();
    this.reverseEdges.clear();
    this.ledger.reset();
  }

  /** Serialize the DAG, its receipt log and tombstones. */
  toJSON(): DAGSnapshot {
    const tasks = Array.from(this.nodes.values());
    const edges: Array<{ from: string; to: string }> = [];
    for (const [taskId, deps] of this.forwardEdges) {
      for (const depId of deps) edges.push({ from: depId, to: taskId });
    }
    return {
      graphId: this.graphId,
      graphRevision: this.graphRevision,
      tasks,
      edges,
      receipts: this.ledger.receipts(),
      removedTasks: this.ledger.removedTasks(),
      stats: this.getStats(),
    };
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

  private graphView(): DAGGraphView {
    return { nodes: this.nodes, forwardEdges: this.forwardEdges, reverseEdges: this.reverseEdges };
  }

  private requireTask(taskId: string): DAGTask {
    const task = this.nodes.get(taskId);
    if (!task) throw new Error(`Task '${taskId}' not found in the DAG`);
    return task;
  }

  private computeStatus(taskId: string): DAGTaskStatus {
    const blockers = this.forwardEdges.get(taskId);
    if (!blockers || blockers.size === 0) return 'ready';
    return this.ledger.allResolved(taskId, blockers) ? 'ready' : 'blocked';
  }

  private setStatus(taskId: string, status: DAGTaskStatus): void {
    const task = this.nodes.get(taskId);
    if (!task) return;
    this.nodes.set(taskId, { ...task, status });
    if (status === 'ready') {
      this.emit({ type: 'task-ready', taskId, timestamp: Date.now() });
    }
  }

  /** Commit a failed/cancelled outcome and propagate it to dependent edges. */
  private terminate(task: DAGTask, status: 'failed' | 'cancelled', error: string): void {
    this.ledger.bump();
    const now = Date.now();
    this.nodes.set(task.id, { ...task, status, completedAt: now, error });
    this.emit({ type: status === 'failed' ? 'task-failed' : 'task-cancelled', taskId: task.id, timestamp: now });
    this.recordOnDependents(task.id, status === 'failed' ? 'FAILED' : 'CANCELLED', ['UNRESOLVED']);
    this.cascadeCancellation(task.id, status);
  }

  /** Record a disposition on every live dependent edge currently in `from`. */
  private recordOnDependents(
    prerequisiteId: string,
    disposition: PrerequisiteDisposition,
    from: readonly PrerequisiteDisposition[],
    completionEvidenceRef?: string
  ): void {
    for (const depId of this.reverseEdges.get(prerequisiteId) ?? []) {
      if (!this.nodes.has(depId)) continue;
      const current = this.ledger.disposition(depId, prerequisiteId);
      if (current && from.includes(current)) {
        this.ledger.record(depId, prerequisiteId, disposition, { completionEvidenceRef });
      }
    }
  }

  private unblockDependents(completedId: string): string[] {
    const unblockedIds: string[] = [];
    for (const depId of this.reverseEdges.get(completedId) ?? []) {
      const dep = this.nodes.get(depId);
      if (!dep || dep.status !== 'blocked') continue;
      if (this.computeStatus(depId) === 'ready') {
        this.setStatus(depId, 'ready');
        unblockedIds.push(depId);
      }
    }
    return unblockedIds;
  }

  private cascadeCancellation(sourceId: string, outcome: 'failed' | 'cancelled'): void {
    for (const depId of this.reverseEdges.get(sourceId) ?? []) {
      const dep = this.nodes.get(depId);
      if (!dep || TERMINAL.has(dep.status)) continue;
      if (!this.ledger.hasAny(depId, ['FAILED', 'CANCELLED'])) continue;

      this.nodes.set(depId, {
        ...dep,
        status: 'cancelled',
        completedAt: Date.now(),
        error: `Cancelled: upstream task '${sourceId}' ${outcome}`,
      });
      this.recordOnDependents(depId, 'CANCELLED', ['UNRESOLVED']);
      this.cascadeCancellation(depId, 'cancelled');
    }
  }

  private emit(event: DAGEvent): void {
    for (const handler of this.eventHandlers) {
      try { handler(event); } catch { /* handler errors are silently ignored */ }
    }
  }
}
