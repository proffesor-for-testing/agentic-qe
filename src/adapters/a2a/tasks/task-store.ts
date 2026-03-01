/**
 * A2A Task Store
 *
 * Provides persistence layer for A2A tasks with in-memory storage
 * and support for context-based grouping and pagination.
 *
 * @module adapters/a2a/tasks/task-store
 * @see https://a2a-protocol.org/latest/specification/
 */

import type { A2AMessage, TaskStatus, A2AArtifact, MessagePart } from '../jsonrpc/methods.js';

// ============================================================================
// Task Types
// ============================================================================

/**
 * Task history entry for state transitions
 */
export interface TaskHistoryEntry {
  /** Previous status */
  readonly fromStatus: TaskStatus | null;
  /** New status */
  readonly toStatus: TaskStatus;
  /** Timestamp of transition */
  readonly timestamp: Date;
  /** Reason for transition (optional) */
  readonly reason?: string;
  /** User or system that triggered the transition */
  readonly triggeredBy?: string;
}

/**
 * Task error with detailed information
 */
export interface TaskError {
  /** Error message */
  readonly message: string;
  /** Error code */
  readonly code?: string;
  /** Stack trace (for debugging) */
  readonly stack?: string;
  /** Timestamp when error occurred */
  readonly timestamp?: Date;
  /** Whether the error is retryable */
  readonly retryable?: boolean;
}

/**
 * Task metadata
 */
export interface TaskMetadata {
  /** Creation timestamp */
  readonly createdAt: Date;
  /** Last update timestamp */
  readonly updatedAt: Date;
  /** Agent ID handling this task */
  readonly agentId: string;
  /** Parent task ID (for subtasks) */
  readonly parentTaskId?: string;
  /** Priority (higher = more urgent) */
  readonly priority?: number;
  /** Tags for categorization */
  readonly tags?: string[];
  /** Custom user metadata */
  readonly custom?: Record<string, unknown>;
}

/**
 * Full A2A Task structure with extended properties
 */
export interface A2ATask {
  /** Unique task identifier */
  readonly id: string;
  /** Context ID for multi-turn conversations */
  readonly contextId?: string;
  /** Current task status */
  status: TaskStatus;
  /** Input message that created this task */
  readonly message: A2AMessage;
  /** Output artifacts */
  artifacts: A2AArtifact[];
  /** State transition history */
  history: TaskHistoryEntry[];
  /** Error information (when status is 'failed') */
  error?: TaskError;
  /** Task metadata */
  readonly metadata: TaskMetadata;
}

/**
 * Query options for listing tasks
 */
export interface TaskQueryOptions {
  /** Filter by context ID */
  readonly contextId?: string;
  /** Filter by status(es) */
  readonly status?: TaskStatus | TaskStatus[];
  /** Filter by agent ID */
  readonly agentId?: string;
  /** Filter by parent task ID */
  readonly parentTaskId?: string;
  /** Maximum number of results */
  readonly limit?: number;
  /** Offset for pagination */
  readonly offset?: number;
  /** Sort order */
  readonly order?: 'asc' | 'desc';
  /** Sort field */
  readonly sortBy?: 'createdAt' | 'updatedAt' | 'priority';
  /** Include tasks created after this date */
  readonly createdAfter?: Date;
  /** Include tasks created before this date */
  readonly createdBefore?: Date;
}

/**
 * Paginated query result
 */
export interface TaskQueryResult {
  /** List of tasks matching the query */
  readonly tasks: A2ATask[];
  /** Total count of matching tasks */
  readonly total: number;
  /** Current offset */
  readonly offset: number;
  /** Limit used */
  readonly limit: number;
  /** Whether there are more results */
  readonly hasMore: boolean;
  /** Next cursor for pagination */
  readonly nextCursor?: string;
}

// ============================================================================
// Task Store Configuration
// ============================================================================

/**
 * Task store configuration
 */
export interface TaskStoreConfig {
  /** Maximum tasks to retain (0 = unlimited) */
  readonly maxTasks?: number;
  /** TTL for completed tasks in milliseconds (0 = no expiry) */
  readonly completedTaskTtl?: number;
  /** Whether to enable automatic cleanup */
  readonly enableAutoCleanup?: boolean;
  /** Cleanup interval in milliseconds */
  readonly cleanupInterval?: number;
}

/**
 * Default task store configuration
 */
export const DEFAULT_TASK_STORE_CONFIG: Required<TaskStoreConfig> = {
  maxTasks: 10000,
  completedTaskTtl: 86400000, // 24 hours
  enableAutoCleanup: true,
  cleanupInterval: 3600000, // 1 hour
};

// ============================================================================
// Task Store Implementation
// ============================================================================

/**
 * A2A Task Store
 *
 * In-memory storage for A2A tasks with query and pagination support.
 */
export class TaskStore {
  private readonly config: Required<TaskStoreConfig>;
  private readonly tasks: Map<string, A2ATask> = new Map();
  private readonly contextIndex: Map<string, Set<string>> = new Map();
  private readonly statusIndex: Map<TaskStatus, Set<string>> = new Map();
  private readonly agentIndex: Map<string, Set<string>> = new Map();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config: TaskStoreConfig = {}) {
    this.config = { ...DEFAULT_TASK_STORE_CONFIG, ...config };

    // Initialize status index
    const statuses: TaskStatus[] = [
      'submitted',
      'working',
      'input_required',
      'auth_required',
      'completed',
      'failed',
      'canceled',
      'rejected',
    ];
    for (const status of statuses) {
      this.statusIndex.set(status, new Set());
    }

    // Start cleanup timer if enabled
    if (this.config.enableAutoCleanup && this.config.cleanupInterval > 0) {
      this.startCleanupTimer();
    }
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Store a new task
   */
  create(task: A2ATask): A2ATask {
    if (this.tasks.has(task.id)) {
      throw new Error(`Task with ID ${task.id} already exists`);
    }

    // Check capacity
    if (this.config.maxTasks > 0 && this.tasks.size >= this.config.maxTasks) {
      this.evictOldestTasks(1);
    }

    // Store task
    this.tasks.set(task.id, task);

    // Update indices
    this.addToIndex(task);

    return task;
  }

  /**
   * Get a task by ID
   */
  get(taskId: string): A2ATask | null {
    return this.tasks.get(taskId) ?? null;
  }

  /**
   * Check if a task exists
   */
  has(taskId: string): boolean {
    return this.tasks.has(taskId);
  }

  /**
   * Update an existing task
   */
  update(taskId: string, updates: Partial<Pick<A2ATask, 'status' | 'artifacts' | 'history' | 'error'>>): A2ATask | null {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    const oldStatus = task.status;

    // Apply updates
    if (updates.status !== undefined) {
      task.status = updates.status;
    }
    if (updates.artifacts !== undefined) {
      task.artifacts = updates.artifacts;
    }
    if (updates.history !== undefined) {
      task.history = updates.history;
    }
    if (updates.error !== undefined) {
      task.error = updates.error;
    }

    // Update metadata timestamp (create new metadata object since it's readonly)
    const updatedTask: A2ATask = {
      ...task,
      metadata: {
        ...task.metadata,
        updatedAt: new Date(),
      },
    };
    this.tasks.set(taskId, updatedTask);

    // Update status index if status changed
    if (updates.status !== undefined && oldStatus !== updates.status) {
      this.statusIndex.get(oldStatus)?.delete(taskId);
      this.statusIndex.get(updates.status)?.add(taskId);
    }

    return updatedTask;
  }

  /**
   * Delete a task
   */
  delete(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // Remove from indices
    this.removeFromIndex(task);

    // Remove task
    this.tasks.delete(taskId);

    return true;
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Query tasks with filtering and pagination
   */
  query(options: TaskQueryOptions = {}): TaskQueryResult {
    let taskIds: Set<string> | undefined;

    // Apply index-based filters for optimization
    if (options.contextId) {
      taskIds = new Set(this.contextIndex.get(options.contextId) ?? []);
    }

    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      const statusTaskIds = new Set<string>();
      for (const status of statuses) {
        const ids = this.statusIndex.get(status);
        if (ids) {
          for (const id of ids) {
            statusTaskIds.add(id);
          }
        }
      }

      if (taskIds) {
        // Intersect with existing filter
        taskIds = new Set([...taskIds].filter((id) => statusTaskIds.has(id)));
      } else {
        taskIds = statusTaskIds;
      }
    }

    if (options.agentId) {
      const agentTaskIds = this.agentIndex.get(options.agentId);
      if (taskIds) {
        taskIds = new Set([...taskIds].filter((id) => agentTaskIds?.has(id)));
      } else {
        taskIds = new Set(agentTaskIds ?? []);
      }
    }

    // Get tasks from IDs or all tasks
    let tasks: A2ATask[] = taskIds
      ? [...taskIds].map((id) => this.tasks.get(id)!).filter(Boolean)
      : [...this.tasks.values()];

    // Apply additional filters
    if (options.parentTaskId) {
      tasks = tasks.filter((t) => t.metadata.parentTaskId === options.parentTaskId);
    }

    if (options.createdAfter) {
      tasks = tasks.filter((t) => t.metadata.createdAt >= options.createdAfter!);
    }

    if (options.createdBefore) {
      tasks = tasks.filter((t) => t.metadata.createdAt <= options.createdBefore!);
    }

    // Sort
    const sortBy = options.sortBy ?? 'createdAt';
    const order = options.order ?? 'desc';
    tasks.sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortBy) {
        case 'createdAt':
          aVal = a.metadata.createdAt.getTime();
          bVal = b.metadata.createdAt.getTime();
          break;
        case 'updatedAt':
          aVal = a.metadata.updatedAt.getTime();
          bVal = b.metadata.updatedAt.getTime();
          break;
        case 'priority':
          aVal = a.metadata.priority ?? 0;
          bVal = b.metadata.priority ?? 0;
          break;
        default:
          aVal = a.metadata.createdAt.getTime();
          bVal = b.metadata.createdAt.getTime();
      }

      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Get total before pagination
    const total = tasks.length;

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    const paginatedTasks = tasks.slice(offset, offset + limit);

    const hasMore = offset + paginatedTasks.length < total;
    const nextCursor = hasMore ? String(offset + limit) : undefined;

    return {
      tasks: paginatedTasks,
      total,
      offset,
      limit,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Get tasks by context ID
   */
  getByContext(contextId: string): A2ATask[] {
    const taskIds = this.contextIndex.get(contextId);
    if (!taskIds) {
      return [];
    }
    return [...taskIds].map((id) => this.tasks.get(id)!).filter(Boolean);
  }

  /**
   * Get tasks by status
   */
  getByStatus(status: TaskStatus): A2ATask[] {
    const taskIds = this.statusIndex.get(status);
    if (!taskIds) {
      return [];
    }
    return [...taskIds].map((id) => this.tasks.get(id)!).filter(Boolean);
  }

  /**
   * Get tasks by agent ID
   */
  getByAgent(agentId: string): A2ATask[] {
    const taskIds = this.agentIndex.get(agentId);
    if (!taskIds) {
      return [];
    }
    return [...taskIds].map((id) => this.tasks.get(id)!).filter(Boolean);
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Get multiple tasks by IDs
   */
  getMany(taskIds: string[]): Map<string, A2ATask | null> {
    const result = new Map<string, A2ATask | null>();
    for (const id of taskIds) {
      result.set(id, this.tasks.get(id) ?? null);
    }
    return result;
  }

  /**
   * Delete multiple tasks
   */
  deleteMany(taskIds: string[]): number {
    let deleted = 0;
    for (const id of taskIds) {
      if (this.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Delete all tasks in a context
   */
  deleteByContext(contextId: string): number {
    const taskIds = this.contextIndex.get(contextId);
    if (!taskIds) {
      return 0;
    }
    return this.deleteMany([...taskIds]);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get store statistics
   */
  getStats(): {
    totalTasks: number;
    tasksByStatus: Record<TaskStatus, number>;
    contextCount: number;
    agentCount: number;
  } {
    const tasksByStatus: Record<TaskStatus, number> = {
      submitted: 0,
      working: 0,
      input_required: 0,
      auth_required: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
      rejected: 0,
    };

    for (const [status, ids] of this.statusIndex) {
      tasksByStatus[status] = ids.size;
    }

    return {
      totalTasks: this.tasks.size,
      tasksByStatus,
      contextCount: this.contextIndex.size,
      agentCount: this.agentIndex.size,
    };
  }

  /**
   * Get total task count
   */
  get size(): number {
    return this.tasks.size;
  }

  // ============================================================================
  // Cleanup Operations
  // ============================================================================

  /**
   * Clean up expired completed tasks
   */
  cleanupExpired(): number {
    if (this.config.completedTaskTtl <= 0) {
      return 0;
    }

    const now = Date.now();
    const expiredIds: string[] = [];

    const completedIds = this.statusIndex.get('completed');
    if (completedIds) {
      for (const id of completedIds) {
        const task = this.tasks.get(id);
        if (task && now - task.metadata.updatedAt.getTime() > this.config.completedTaskTtl) {
          expiredIds.push(id);
        }
      }
    }

    return this.deleteMany(expiredIds);
  }

  /**
   * Evict oldest tasks to make room
   */
  private evictOldestTasks(count: number): void {
    const tasks = [...this.tasks.values()]
      .filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'canceled')
      .sort((a, b) => a.metadata.updatedAt.getTime() - b.metadata.updatedAt.getTime())
      .slice(0, count);

    for (const task of tasks) {
      this.delete(task.id);
    }
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupInterval);

    // Don't prevent process exit
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clear all tasks and reset store
   */
  clear(): void {
    this.tasks.clear();
    this.contextIndex.clear();
    this.agentIndex.clear();
    for (const ids of this.statusIndex.values()) {
      ids.clear();
    }
  }

  /**
   * Destroy the store and stop cleanup
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }

  // ============================================================================
  // Index Management
  // ============================================================================

  /**
   * Add a task to all indices
   */
  private addToIndex(task: A2ATask): void {
    // Context index
    if (task.contextId) {
      let contextTasks = this.contextIndex.get(task.contextId);
      if (!contextTasks) {
        contextTasks = new Set();
        this.contextIndex.set(task.contextId, contextTasks);
      }
      contextTasks.add(task.id);
    }

    // Status index
    this.statusIndex.get(task.status)?.add(task.id);

    // Agent index
    let agentTasks = this.agentIndex.get(task.metadata.agentId);
    if (!agentTasks) {
      agentTasks = new Set();
      this.agentIndex.set(task.metadata.agentId, agentTasks);
    }
    agentTasks.add(task.id);
  }

  /**
   * Remove a task from all indices
   */
  private removeFromIndex(task: A2ATask): void {
    // Context index
    if (task.contextId) {
      const contextTasks = this.contextIndex.get(task.contextId);
      if (contextTasks) {
        contextTasks.delete(task.id);
        if (contextTasks.size === 0) {
          this.contextIndex.delete(task.contextId);
        }
      }
    }

    // Status index
    this.statusIndex.get(task.status)?.delete(task.id);

    // Agent index
    const agentTasks = this.agentIndex.get(task.metadata.agentId);
    if (agentTasks) {
      agentTasks.delete(task.id);
      if (agentTasks.size === 0) {
        this.agentIndex.delete(task.metadata.agentId);
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TaskStore instance
 */
export function createTaskStore(config: TaskStoreConfig = {}): TaskStore {
  return new TaskStore(config);
}
