/**
 * A2A Task Manager
 *
 * Manages the A2A task lifecycle with a complete state machine implementation.
 * Provides task creation, state transitions, artifact management, and history tracking.
 *
 * @module adapters/a2a/tasks/task-manager
 * @see https://a2a-protocol.org/latest/specification/
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { A2AMessage, TaskStatus, A2AArtifact, MessagePart, TextPart, DataPart, FilePart } from '../jsonrpc/methods.js';
import { isTerminalStatus } from '../jsonrpc/methods.js';
import {
  TaskStore,
  createTaskStore,
  type A2ATask,
  type TaskHistoryEntry,
  type TaskError,
  type TaskMetadata,
  type TaskStoreConfig,
} from './task-store.js';

// ============================================================================
// State Machine Definition
// ============================================================================

/**
 * Valid state transitions for the A2A task state machine.
 *
 * State Machine Diagram:
 * ```
 *                     +-------------+
 *                     |  submitted  |
 *                     +------+------+
 *                            |
 *               +------------+------------+
 *               v            v            v
 *         +----------+ +----------+ +----------+
 *         | rejected | | working  | | canceled |
 *         +----------+ +----+-----+ +----------+
 *                           |
 *            +--------------+-------------+
 *            v              v             v
 *     +-------------+ +----------+ +----------+
 *     |input_required| | completed| |  failed  |
 *     +------+------+ +----------+ +----------+
 *            |
 *            v
 *     +-------------+
 *     |auth_required|
 *     +-------------+
 * ```
 */
export const VALID_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  submitted: ['working', 'rejected', 'canceled'],
  working: ['completed', 'failed', 'input_required', 'auth_required', 'canceled'],
  input_required: ['working', 'canceled', 'auth_required', 'failed'],
  auth_required: ['working', 'canceled', 'failed'],
  completed: [], // Terminal state
  failed: [], // Terminal state
  canceled: [], // Terminal state
  rejected: [], // Terminal state
} as const;

/**
 * Terminal states where no further transitions are allowed
 */
export const TERMINAL_STATES: readonly TaskStatus[] = ['completed', 'failed', 'canceled', 'rejected'];

/**
 * Check if a status is terminal (no further transitions possible)
 */
export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ============================================================================
// Task Manager Configuration
// ============================================================================

/**
 * Task manager configuration
 */
export interface TaskManagerConfig {
  /** Task store configuration */
  readonly storeConfig?: TaskStoreConfig;
  /** Default agent ID for tasks without explicit agent */
  readonly defaultAgentId?: string;
  /** Whether to generate context IDs for tasks without one */
  readonly autoGenerateContextId?: boolean;
  /** ID generator function */
  readonly idGenerator?: () => string;
  /** Context ID generator function */
  readonly contextIdGenerator?: () => string;
  /** Timestamp generator function */
  readonly timestampGenerator?: () => Date;
}

/**
 * Default task manager configuration
 */
export const DEFAULT_TASK_MANAGER_CONFIG: Required<TaskManagerConfig> = {
  storeConfig: {},
  defaultAgentId: 'default-agent',
  autoGenerateContextId: true,
  idGenerator: () => `task-${Date.now()}-${randomUUID().split('-')[0]}`,
  contextIdGenerator: () => `ctx-${Date.now()}-${randomUUID().split('-')[0]}`,
  timestampGenerator: () => new Date(),
};

// ============================================================================
// Task Creation Options
// ============================================================================

/**
 * Options for creating a new task
 */
export interface CreateTaskOptions {
  /** Explicit task ID (auto-generated if not provided) */
  readonly id?: string;
  /** Context ID for multi-turn conversations */
  readonly contextId?: string;
  /** Agent ID to handle this task */
  readonly agentId?: string;
  /** Parent task ID for subtasks */
  readonly parentTaskId?: string;
  /** Task priority */
  readonly priority?: number;
  /** Custom tags */
  readonly tags?: string[];
  /** Custom metadata */
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Task Manager Events
// ============================================================================

/**
 * Task state change event
 */
export interface TaskStateChangeEvent {
  /** Task ID */
  readonly taskId: string;
  /** Task instance */
  readonly task: A2ATask;
  /** Previous status */
  readonly previousStatus: TaskStatus;
  /** New status */
  readonly newStatus: TaskStatus;
  /** Transition timestamp */
  readonly timestamp: Date;
  /** Optional reason for transition */
  readonly reason?: string;
}

/**
 * Task artifact event
 */
export interface TaskArtifactEvent {
  /** Task ID */
  readonly taskId: string;
  /** Artifact */
  readonly artifact: A2AArtifact;
  /** Whether this is an update to an existing artifact */
  readonly isUpdate: boolean;
  /** Timestamp */
  readonly timestamp: Date;
}

/**
 * Task error event
 */
export interface TaskErrorEvent {
  /** Task ID */
  readonly taskId: string;
  /** Error details */
  readonly error: TaskError;
  /** Timestamp */
  readonly timestamp: Date;
}

// ============================================================================
// Task Manager Implementation
// ============================================================================

/**
 * A2A Task Manager
 *
 * Manages the complete lifecycle of A2A tasks including:
 * - Task creation from messages
 * - State machine transitions with validation
 * - Artifact management
 * - History tracking
 * - Event emission for SSE streaming
 */
export class TaskManager extends EventEmitter {
  private readonly config: Required<TaskManagerConfig>;
  private readonly store: TaskStore;

  constructor(config: TaskManagerConfig = {}) {
    super();
    this.config = { ...DEFAULT_TASK_MANAGER_CONFIG, ...config };
    this.store = createTaskStore(this.config.storeConfig);
  }

  // ============================================================================
  // Task Creation
  // ============================================================================

  /**
   * Create a new task from an A2A message
   */
  createTask(message: A2AMessage, options: CreateTaskOptions = {}): A2ATask {
    const now = this.config.timestampGenerator();
    const taskId = options.id ?? this.config.idGenerator();

    // Generate context ID if needed
    let contextId = options.contextId ?? message.contextId;
    if (!contextId && this.config.autoGenerateContextId) {
      contextId = this.config.contextIdGenerator();
    }

    // Determine agent ID
    const agentId = options.agentId ?? this.config.defaultAgentId;

    // Create initial history entry
    const initialHistory: TaskHistoryEntry = {
      fromStatus: null,
      toStatus: 'submitted',
      timestamp: now,
      reason: 'Task created',
    };

    // Create metadata
    const metadata: TaskMetadata = {
      createdAt: now,
      updatedAt: now,
      agentId,
      parentTaskId: options.parentTaskId,
      priority: options.priority,
      tags: options.tags,
      custom: options.metadata,
    };

    // Create task
    const task: A2ATask = {
      id: taskId,
      contextId,
      status: 'submitted',
      message,
      artifacts: [],
      history: [initialHistory],
      metadata,
    };

    // Store task
    this.store.create(task);

    // Emit creation event
    this.emit('taskCreated', { task, timestamp: now });

    return task;
  }

  /**
   * Create a subtask under a parent task
   */
  createSubtask(parentTaskId: string, message: A2AMessage, options: Omit<CreateTaskOptions, 'parentTaskId'> = {}): A2ATask | null {
    const parentTask = this.store.get(parentTaskId);
    if (!parentTask) {
      return null;
    }

    return this.createTask(message, {
      ...options,
      contextId: options.contextId ?? parentTask.contextId,
      agentId: options.agentId ?? parentTask.metadata.agentId,
      parentTaskId,
    });
  }

  // ============================================================================
  // Task Retrieval
  // ============================================================================

  /**
   * Get a task by ID
   */
  getTask(taskId: string): A2ATask | null {
    return this.store.get(taskId);
  }

  /**
   * Check if a task exists
   */
  hasTask(taskId: string): boolean {
    return this.store.has(taskId);
  }

  /**
   * Get tasks by context ID
   */
  getTasksByContext(contextId: string): A2ATask[] {
    return this.store.getByContext(contextId);
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatus): A2ATask[] {
    return this.store.getByStatus(status);
  }

  /**
   * Get tasks by agent ID
   */
  getTasksByAgent(agentId: string): A2ATask[] {
    return this.store.getByAgent(agentId);
  }

  /**
   * Get subtasks of a parent task
   */
  getSubtasks(parentTaskId: string): A2ATask[] {
    return this.store.query({ parentTaskId }).tasks;
  }

  // ============================================================================
  // State Transitions
  // ============================================================================

  /**
   * Transition a task to a new status
   *
   * @throws Error if the transition is invalid
   */
  transition(taskId: string, newStatus: TaskStatus, reason?: string, triggeredBy?: string): A2ATask {
    const task = this.store.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const currentStatus = task.status;

    // Validate transition
    if (!isValidTransition(currentStatus, newStatus)) {
      throw new Error(
        `Invalid state transition: ${currentStatus} -> ${newStatus}. ` +
        `Valid transitions from ${currentStatus}: [${VALID_TRANSITIONS[currentStatus].join(', ')}]`
      );
    }

    const now = this.config.timestampGenerator();

    // Add history entry
    const historyEntry: TaskHistoryEntry = {
      fromStatus: currentStatus,
      toStatus: newStatus,
      timestamp: now,
      reason,
      triggeredBy,
    };

    // Update task
    const updatedTask = this.store.update(taskId, {
      status: newStatus,
      history: [...task.history, historyEntry],
    });

    if (!updatedTask) {
      throw new Error(`Failed to update task ${taskId}`);
    }

    // Emit state change event
    const event: TaskStateChangeEvent = {
      taskId,
      task: updatedTask,
      previousStatus: currentStatus,
      newStatus,
      timestamp: now,
      reason,
    };
    this.emit('stateChange', event);
    this.emit(`status:${newStatus}`, event);

    return updatedTask;
  }

  /**
   * Start working on a task (submitted -> working)
   */
  startTask(taskId: string, reason?: string): A2ATask {
    return this.transition(taskId, 'working', reason ?? 'Agent started processing');
  }

  /**
   * Complete a task (working -> completed)
   */
  completeTask(taskId: string, artifacts?: A2AArtifact[], reason?: string): A2ATask {
    const task = this.store.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Add artifacts if provided
    if (artifacts && artifacts.length > 0) {
      this.addArtifacts(taskId, artifacts);
    }

    return this.transition(taskId, 'completed', reason ?? 'Task completed successfully');
  }

  /**
   * Fail a task (working -> failed)
   */
  failTask(taskId: string, error: TaskError, reason?: string): A2ATask {
    const task = this.store.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Set error
    this.store.update(taskId, {
      error: {
        ...error,
        timestamp: this.config.timestampGenerator(),
      },
    });

    // Emit error event
    const errorEvent: TaskErrorEvent = {
      taskId,
      error,
      timestamp: this.config.timestampGenerator(),
    };
    this.emit('taskError', errorEvent);

    return this.transition(taskId, 'failed', reason ?? error.message);
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string, reason?: string): A2ATask {
    return this.transition(taskId, 'canceled', reason ?? 'Task canceled by user');
  }

  /**
   * Reject a task (submitted -> rejected)
   */
  rejectTask(taskId: string, reason: string): A2ATask {
    return this.transition(taskId, 'rejected', reason);
  }

  /**
   * Request input from user (working -> input_required)
   */
  requestInput(taskId: string, prompt?: string): A2ATask {
    const reason = prompt ? `Input required: ${prompt}` : 'Additional input required from user';
    return this.transition(taskId, 'input_required', reason);
  }

  /**
   * Request authentication (working/input_required -> auth_required)
   */
  requestAuth(taskId: string, authType?: string): A2ATask {
    const reason = authType ? `Authentication required: ${authType}` : 'Authentication required';
    return this.transition(taskId, 'auth_required', reason);
  }

  /**
   * Resume task after input or auth (input_required/auth_required -> working)
   */
  resumeTask(taskId: string, reason?: string): A2ATask {
    return this.transition(taskId, 'working', reason ?? 'Task resumed');
  }

  /**
   * Provide input to a task and resume
   */
  provideInput(taskId: string, input: A2AMessage): A2ATask {
    const task = this.store.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== 'input_required' && task.status !== 'auth_required') {
      throw new Error(`Task ${taskId} is not waiting for input (status: ${task.status})`);
    }

    // Create an artifact from the input
    const inputArtifact = this.createArtifactFromMessage(input, 'User Input');
    this.addArtifact(taskId, inputArtifact);

    return this.resumeTask(taskId, 'User provided input');
  }

  // ============================================================================
  // Artifact Management
  // ============================================================================

  /**
   * Add an artifact to a task
   */
  addArtifact(taskId: string, artifact: A2AArtifact): A2ATask {
    const task = this.store.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const now = this.config.timestampGenerator();

    // Check if updating existing artifact
    const existingIndex = task.artifacts.findIndex((a) => a.id === artifact.id);
    const isUpdate = existingIndex >= 0;

    let updatedArtifacts: A2AArtifact[];
    if (isUpdate && artifact.append) {
      // Append to existing artifact
      const existing = task.artifacts[existingIndex];
      const appendedArtifact: A2AArtifact = {
        ...existing,
        parts: [...existing.parts, ...artifact.parts],
        lastChunk: artifact.lastChunk,
      };
      updatedArtifacts = [...task.artifacts];
      updatedArtifacts[existingIndex] = appendedArtifact;
    } else if (isUpdate) {
      // Replace existing artifact
      updatedArtifacts = [...task.artifacts];
      updatedArtifacts[existingIndex] = artifact;
    } else {
      // Add new artifact
      updatedArtifacts = [...task.artifacts, artifact];
    }

    const updatedTask = this.store.update(taskId, { artifacts: updatedArtifacts });
    if (!updatedTask) {
      throw new Error(`Failed to update task ${taskId}`);
    }

    // Emit artifact event
    const event: TaskArtifactEvent = {
      taskId,
      artifact,
      isUpdate,
      timestamp: now,
    };
    this.emit('artifactAdded', event);

    return updatedTask;
  }

  /**
   * Add multiple artifacts to a task
   */
  addArtifacts(taskId: string, artifacts: A2AArtifact[]): A2ATask {
    let task: A2ATask | null = this.store.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    for (const artifact of artifacts) {
      task = this.addArtifact(taskId, artifact);
    }

    return task;
  }

  /**
   * Create an artifact from a message
   */
  createArtifactFromMessage(message: A2AMessage, name: string = 'Message', description?: string): A2AArtifact {
    return {
      id: `artifact-${Date.now()}-${randomUUID().split('-')[0]}`,
      name,
      description,
      parts: message.parts,
    };
  }

  /**
   * Create a text artifact
   */
  createTextArtifact(id: string, name: string, text: string, metadata?: Record<string, unknown>): A2AArtifact {
    const part: TextPart = { type: 'text', text };
    return {
      id,
      name,
      parts: [part],
      metadata,
    };
  }

  /**
   * Create a data artifact
   */
  createDataArtifact(id: string, name: string, data: Record<string, unknown>, metadata?: Record<string, unknown>): A2AArtifact {
    const part: DataPart = { type: 'data', data };
    return {
      id,
      name,
      parts: [part],
      metadata,
    };
  }

  /**
   * Create a file artifact
   */
  createFileArtifact(
    id: string,
    name: string,
    file: { name: string; mimeType: string; bytes?: string; uri?: string },
    metadata?: Record<string, unknown>
  ): A2AArtifact {
    const part: FilePart = { type: 'file', file };
    return {
      id,
      name,
      parts: [part],
      metadata,
    };
  }

  // ============================================================================
  // Task History
  // ============================================================================

  /**
   * Get task history
   */
  getTaskHistory(taskId: string): TaskHistoryEntry[] | null {
    const task = this.store.get(taskId);
    return task ? [...task.history] : null;
  }

  /**
   * Get the duration a task has been in its current status
   */
  getStatusDuration(taskId: string): number | null {
    const task = this.store.get(taskId);
    if (!task || task.history.length === 0) {
      return null;
    }

    const lastEntry = task.history[task.history.length - 1];
    return Date.now() - lastEntry.timestamp.getTime();
  }

  /**
   * Get the total duration of a task (from creation to now or completion)
   */
  getTotalDuration(taskId: string): number | null {
    const task = this.store.get(taskId);
    if (!task) {
      return null;
    }

    const start = task.metadata.createdAt.getTime();
    const end = isTerminal(task.status)
      ? task.metadata.updatedAt.getTime()
      : Date.now();

    return end - start;
  }

  // ============================================================================
  // Task Queries
  // ============================================================================

  /**
   * Query tasks with filtering and pagination
   */
  queryTasks(options: Parameters<TaskStore['query']>[0] = {}) {
    return this.store.query(options);
  }

  /**
   * Get store statistics
   */
  getStats() {
    return this.store.getStats();
  }

  /**
   * Get total task count
   */
  get taskCount(): number {
    return this.store.size;
  }

  // ============================================================================
  // Task Cleanup
  // ============================================================================

  /**
   * Delete a task
   */
  deleteTask(taskId: string): boolean {
    const deleted = this.store.delete(taskId);
    if (deleted) {
      this.emit('taskDeleted', { taskId, timestamp: this.config.timestampGenerator() });
    }
    return deleted;
  }

  /**
   * Clean up expired tasks
   */
  cleanupExpiredTasks(): number {
    return this.store.cleanupExpired();
  }

  /**
   * Clear all tasks
   */
  clearAllTasks(): void {
    this.store.clear();
    this.emit('allTasksCleared', { timestamp: this.config.timestampGenerator() });
  }

  /**
   * Destroy the task manager
   */
  destroy(): void {
    this.store.destroy();
    this.removeAllListeners();
  }

  // ============================================================================
  // Direct Store Access (for advanced use cases)
  // ============================================================================

  /**
   * Get the underlying task store
   */
  getStore(): TaskStore {
    return this.store;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TaskManager instance
 */
export function createTaskManager(config: TaskManagerConfig = {}): TaskManager {
  return new TaskManager(config);
}

// ============================================================================
// Type Exports
// ============================================================================

export type {
  A2ATask,
  TaskHistoryEntry,
  TaskError,
  TaskMetadata,
} from './task-store.js';
