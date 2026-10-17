/**
 * Agentic QE v3 - Task Dependency DAG Types
 * ADR-064 Phase 1E: Type definitions for DAG-based task scheduling
 *
 * Defines the core types for representing tasks as nodes in a directed
 * acyclic graph, with dependency edges controlling execution order.
 */

// ============================================================================
// Task Status
// ============================================================================

/** Status of a task in the DAG */
export type DAGTaskStatus =
  | 'pending'       // Added but dependencies not yet resolved
  | 'ready'         // All dependencies met, can be scheduled
  | 'in_progress'   // Currently being executed by an agent
  | 'completed'     // Successfully finished
  | 'failed'        // Execution failed
  | 'blocked'       // Blocked by incomplete dependencies
  | 'cancelled';    // Cancelled due to upstream failure

// ============================================================================
// Task Node
// ============================================================================

/** A task node in the dependency graph */
export interface DAGTask {
  /** Unique task identifier */
  readonly id: string;

  /** Human-readable task name */
  readonly name: string;

  /** Domain this task belongs to */
  readonly domain: string;

  /** Task priority (p0 highest, p3 lowest) */
  readonly priority: string;

  /** Current execution status */
  status: DAGTaskStatus;

  /** Task IDs that must complete before this task can start */
  readonly blockedBy: string[];

  /** Task IDs that this task blocks (reverse edges) */
  readonly blocks: string[];

  /** Agent ID assigned to execute this task */
  assignedTo?: string;

  /** Arbitrary metadata attached to the task */
  readonly metadata?: Record<string, unknown>;

  /** Timestamp when the task was added to the DAG (epoch ms) */
  readonly createdAt: number;

  /** Timestamp when execution started (epoch ms) */
  startedAt?: number;

  /** Timestamp when execution completed or failed (epoch ms) */
  completedAt?: number;

  /** Result data from successful execution */
  result?: unknown;

  /** Error message from failed execution */
  error?: string;

  /** Caller-supplied completion evidence reference (set by complete()) */
  evidenceRef?: string;
}

// ============================================================================
// Input Types
// ============================================================================

/** Input for adding a task to the DAG */
export interface AddTaskInput {
  /** Unique task identifier */
  readonly id: string;

  /** Human-readable task name */
  readonly name: string;

  /** Domain this task belongs to */
  readonly domain: string;

  /** Task priority (defaults to 'p2' if omitted) */
  readonly priority?: string;

  /** Task IDs that must complete before this task can start */
  readonly blockedBy?: string[];

  /** Arbitrary metadata attached to the task */
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Statistics
// ============================================================================

/** Aggregate statistics about the DAG */
export interface DAGStats {
  /** Total number of tasks in the DAG */
  readonly totalTasks: number;

  /** Count of tasks in 'pending' status */
  readonly pending: number;

  /** Count of tasks in 'ready' status */
  readonly ready: number;

  /** Count of tasks in 'in_progress' status */
  readonly inProgress: number;

  /** Count of tasks in 'completed' status */
  readonly completed: number;

  /** Count of tasks in 'failed' status */
  readonly failed: number;

  /** Count of tasks in 'blocked' status */
  readonly blocked: number;

  /** Count of tasks in 'cancelled' status */
  readonly cancelled: number;

  /** Length of the longest path through the DAG (critical path) */
  readonly longestPath: number;

  /** Whether the graph contains cycles (should always be false for a valid DAG) */
  readonly hasCycles: boolean;
}

/** Serialized view of a TaskDAG returned by toJSON() */
export interface DAGSnapshot {
  readonly graphId: string;
  readonly graphRevision: number;
  readonly tasks: DAGTask[];
  readonly edges: Array<{ from: string; to: string }>;
  readonly receipts: PrerequisiteReceiptV1[];
  readonly removedTasks: RemovedTaskRecord[];
  readonly stats: DAGStats;
}

// ============================================================================
// Events
// ============================================================================

/** Event types emitted by the DAG */
export type DAGEventType =
  | 'task-ready'
  | 'task-completed'
  | 'task-failed'
  | 'task-cancelled'
  | 'task-removed'
  | 'prerequisite-waived'
  | 'tasks-unblocked'
  | 'cycle-detected';

/** Event emitted by the DAG when state changes occur */
export interface DAGEvent {
  /** Type of event that occurred */
  readonly type: DAGEventType;

  /** Task ID associated with the event (if applicable) */
  readonly taskId?: string;

  /** Task IDs that became unblocked (for 'tasks-unblocked' events) */
  readonly unblockedTaskIds?: string[];

  /** Node IDs involved in detected cycles (for 'cycle-detected' events) */
  readonly cycleNodes?: string[];

  /** Prerequisite ID (for 'prerequisite-waived' events) */
  readonly prerequisiteId?: string;

  /** Dependents whose edge was tombstoned (for 'task-removed' events) */
  readonly affectedTaskIds?: string[];

  /** Graph revision at which the change was committed */
  readonly graphRevision?: number;

  /** Timestamp when the event occurred (epoch ms) */
  readonly timestamp: number;
}

// ============================================================================
// Scheduler Configuration
// ============================================================================

/** Configuration for the DAG scheduler */
export interface DAGSchedulerConfig {
  /** Maximum number of tasks that can run concurrently */
  readonly maxConcurrent: number;

  /** Whether to prioritize tasks that block the most downstream tasks */
  readonly prioritizeBlockers: boolean;
}

/** Event handler callback for DAG events */
export type DAGEventHandler = (event: DAGEvent) => void;

// ============================================================================
// Prerequisite Dispositions & Receipts (issue #1069)
// ============================================================================

/**
 * Typed state of one prerequisite edge (dependent -> prerequisite).
 * Only SATISFIED and WAIVED allow a dependent to become ready.
 */
export type PrerequisiteDisposition =
  | 'UNRESOLVED'  // Prerequisite exists but has not reached a terminal state
  | 'SATISFIED'   // Prerequisite completed
  | 'FAILED'      // Prerequisite failed
  | 'CANCELLED'   // Prerequisite was cancelled (directly or by cascade)
  | 'WAIVED'      // Explicitly waived through waivePrerequisite()
  | 'MISSING'     // Referenced prerequisite was never added to the graph
  | 'REMOVED';    // Prerequisite was removed before it finished (tombstone)

/** Schema identifier for PrerequisiteReceiptV1 */
export const PREREQUISITE_RECEIPT_SCHEMA = 'aqe.task-prerequisite@1' as const;

/** Waiver attached to a WAIVED receipt */
export interface PrerequisiteWaiver {
  /** Who issued the waiver */
  readonly actor: string;
  /** Why the prerequisite is waived */
  readonly reason: string;
  /** Reference to the authority (ticket, policy, approval) backing the waiver */
  readonly authorityRef?: string;
  /** ISO-8601 time the waiver was issued */
  readonly issuedAt: string;
}

/** Immutable record of a prerequisite edge changing disposition */
export interface PrerequisiteReceiptV1 {
  readonly schema: typeof PREREQUISITE_RECEIPT_SCHEMA;
  readonly graphId: string;
  /** Graph revision at which this disposition was committed */
  readonly graphRevision: number;
  /** Dependent task */
  readonly taskId: string;
  /** Prerequisite task */
  readonly prerequisiteId: string;
  readonly disposition: PrerequisiteDisposition;
  /** Evidence bound to a SATISFIED disposition (from complete()) */
  readonly completionEvidenceRef?: string;
  /** Present only on WAIVED receipts */
  readonly waiver?: PrerequisiteWaiver;
  /** ISO-8601 time the disposition was observed */
  readonly observedAt: string;
}

/** Current disposition of one prerequisite edge, with its latest receipt */
export interface PrerequisiteEdgeState {
  readonly prerequisiteId: string;
  readonly disposition: PrerequisiteDisposition;
  readonly receipt: PrerequisiteReceiptV1;
}

/** Input for TaskDAG.waivePrerequisite() */
export interface WaivePrerequisiteInput {
  /** Dependent task whose prerequisite is waived */
  readonly taskId: string;
  /** Prerequisite being waived */
  readonly prerequisiteId: string;
  /** Who is waiving (required, non-empty) */
  readonly actor: string;
  /** Why it is waived (required, non-empty) */
  readonly reason: string;
  /** Optional reference to the authority backing the waiver */
  readonly authorityRef?: string;
  /** Compare-and-swap guard: reject if the graph revision has moved */
  readonly expectedRevision?: number;
}

/** Context passed to a waiver policy */
export interface WaiverRequest {
  readonly graphId: string;
  readonly graphRevision: number;
  readonly taskId: string;
  readonly prerequisiteId: string;
  readonly actor: string;
  readonly reason: string;
  readonly authorityRef?: string;
  readonly currentDisposition: PrerequisiteDisposition;
}

/** Policy deciding whether a waiver is authorized; return false to reject */
export type WaiverPolicy = (request: WaiverRequest) => boolean;

/** Options for constructing a TaskDAG */
export interface TaskDAGOptions {
  /** Stable graph identity (defaults to a random UUID-based ID) */
  readonly graphId?: string;
  /** Optional authorization policy applied to every waiver */
  readonly waiverPolicy?: WaiverPolicy;
}

/** Options for TaskDAG.complete() */
export interface CompleteTaskOptions {
  /** Evidence reference bound to the SATISFIED receipts this completion emits */
  readonly evidenceRef?: string;
  /** Compare-and-swap guard: reject if the graph revision has moved */
  readonly expectedRevision?: number;
}

/** Options for TaskDAG.removeTask() */
export interface RemoveTaskOptions {
  /** Compare-and-swap guard: reject if the graph revision has moved */
  readonly expectedRevision?: number;
}

/** A task that was removed from the graph, kept as a tombstone */
export interface RemovedTaskRecord {
  readonly taskId: string;
  /** Status the task had when it was removed */
  readonly statusAtRemoval: DAGTaskStatus;
  readonly graphRevision: number;
}

/**
 * Obligation accounting over the original graph. Removed tasks stay in
 * the denominator; completed-then-removed tasks still count as completed.
 */
export interface ObligationSummary {
  readonly graphId: string;
  readonly graphRevision: number;
  /** Every task ever added since construction or clear() */
  readonly originalTotal: number;
  /** Tasks currently present in the graph */
  readonly currentTotal: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  /** Tasks removed before completing */
  readonly removed: number;
  /** Live tasks not yet terminal (pending, blocked, ready, in_progress) */
  readonly notRun: number;
  /** Live edges whose current disposition is WAIVED */
  readonly waivedEdges: number;
  /** Live edges whose current disposition is MISSING */
  readonly missingEdges: number;
  /** Live edges whose current disposition is REMOVED */
  readonly removedEdges: number;
}

/** Progress report from DAGScheduler.getProgress() */
export interface DAGProgress {
  /** Completed obligations (including completed tasks later removed) */
  readonly completed: number;
  /** Original obligation denominator; does not shrink when tasks are removed */
  readonly total: number;
  /** completed / total, rounded */
  readonly percentage: number;
  /** Tasks currently present in the graph */
  readonly currentTotal: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly removed: number;
  readonly notRun: number;
  readonly waivedEdges: number;
  readonly graphRevision: number;
}
