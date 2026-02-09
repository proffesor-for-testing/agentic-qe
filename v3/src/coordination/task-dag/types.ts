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

// ============================================================================
// Events
// ============================================================================

/** Event types emitted by the DAG */
export type DAGEventType =
  | 'task-ready'
  | 'task-completed'
  | 'task-failed'
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
