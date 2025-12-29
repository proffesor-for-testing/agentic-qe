/**
 * Task - Represents a unit of work to be executed by agents
 *
 * @remarks
 * The Task class encapsulates all information needed to execute a unit of work
 * in the AQE Fleet, including data, requirements, status tracking, and results.
 *
 * Tasks are automatically assigned to capable agents by the FleetManager and
 * provide event-based progress tracking.
 *
 * @example
 * ```typescript
 * // Create a test generation task
 * const task = new Task(
 *   'test-generation',
 *   'Generate unit tests for UserService',
 *   {
 *     filePath: './src/services/UserService.ts',
 *     framework: 'jest',
 *     coverageTarget: 95
 *   },
 *   {
 *     capabilities: ['ai-test-generation'],
 *     agentTypes: ['test-generator']
 *   },
 *   TaskPriority.HIGH
 * );
 *
 * // Monitor task progress
 * task.on('status:changed', (data) => {
 *   console.log(`Task ${data.taskId} status: ${data.newStatus}`);
 * });
 *
 * await fleet.submitTask(task);
 * const result = await task.waitForCompletion();
 * ```
 *
 * @public
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

/**
 * Current execution status of a task
 *
 * @public
 */
export enum TaskStatus {
  /** Task has been created but not submitted */
  CREATED = 'created',
  /** Task is queued waiting for an available agent */
  QUEUED = 'queued',
  /** Task has been assigned to an agent */
  ASSIGNED = 'assigned',
  /** Task is currently being executed */
  RUNNING = 'running',
  /** Task completed successfully */
  COMPLETED = 'completed',
  /** Task execution failed */
  FAILED = 'failed',
  /** Task was cancelled before completion */
  CANCELLED = 'cancelled'
}

/**
 * Priority level for task execution
 *
 * @public
 */
export enum TaskPriority {
  /** Low priority task */
  LOW = 0,
  /** Medium priority task (default) */
  MEDIUM = 1,
  /** High priority task */
  HIGH = 2,
  /** Critical priority task (executed first) */
  CRITICAL = 3
}

/**
 * Metadata about task execution
 *
 * @public
 */
export interface TaskMetadata {
  /** When the task was created */
  createdAt: Date;
  /** When the task started executing */
  startedAt?: Date;
  /** When the task completed or failed */
  completedAt?: Date;
  /** ID of the agent assigned to this task */
  assignedAgent?: string;
  /** Number of times this task has been retried */
  retryCount: number;
  /** Maximum number of retry attempts allowed */
  maxRetries: number;
  /** Timeout in milliseconds for task execution */
  timeout?: number;
}

/**
 * Requirements that must be met for task execution
 *
 * @public
 */
export interface TaskRequirements {
  /** Specific agent types that can handle this task */
  agentTypes?: string[];
  /** Required capabilities an agent must have */
  capabilities?: string[];
  /** Required resources (memory, CPU, etc.) */
  resources?: Record<string, unknown>;
  /** Task IDs that must complete before this task */
  dependencies?: string[];
}

/**
 * Status change event data
 */
export interface StatusChangeEvent {
  taskId: string;
  previousStatus: TaskStatus;
  newStatus: TaskStatus;
  timestamp: Date;
}

/**
 * JSON representation of a Task
 */
export interface TaskJSON<TData = unknown, TResult = unknown> {
  id: string;
  type: string;
  name: string;
  data: TData;
  requirements: TaskRequirements;
  status: TaskStatus;
  priority: TaskPriority;
  result: TResult | null;
  error?: string;
  metadata: TaskMetadata;
}

export class Task<TData = unknown, TResult = unknown> extends EventEmitter {
  private readonly id: string;
  private readonly type: string;
  private readonly name: string;
  private readonly data: TData;
  private readonly requirements: TaskRequirements;
  private status: TaskStatus;
  private priority: TaskPriority;
  private result: TResult | null = null;
  private error: Error | null = null;
  private metadata: TaskMetadata;

  constructor(
    type: string,
    name: string,
    data: TData = {} as TData,
    requirements: TaskRequirements = {},
    priority: TaskPriority = TaskPriority.MEDIUM
  ) {
    super();
    this.id = uuidv4();
    this.type = type;
    this.name = name;
    this.data = data;
    this.requirements = requirements;
    this.status = TaskStatus.CREATED;
    this.priority = priority;
    this.metadata = {
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3
    };
  }

  /**
   * Get task ID
   *
   * @returns Unique identifier for this task
   * @public
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get task type
   *
   * @returns The type of task (e.g., 'test-generation', 'coverage-analysis')
   * @public
   */
  getType(): string {
    return this.type;
  }

  /**
   * Get task name
   *
   * @returns Human-readable name for this task
   * @public
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get task data
   *
   * @returns The data payload for task execution
   * @public
   */
  getData(): TData {
    return this.data;
  }

  /**
   * Get task requirements
   */
  getRequirements(): TaskRequirements {
    return this.requirements;
  }

  /**
   * Get task status
   */
  getStatus(): TaskStatus {
    return this.status;
  }

  /**
   * Set task status and update metadata
   *
   * @param status - The new status for the task
   * @fires status:changed
   * @public
   */
  setStatus(status: TaskStatus): void {
    const previousStatus = this.status;
    this.status = status;

    // Update metadata based on status
    switch (status) {
      case TaskStatus.RUNNING:
        this.metadata.startedAt = new Date();
        break;
      case TaskStatus.COMPLETED:
      case TaskStatus.FAILED:
      case TaskStatus.CANCELLED:
        this.metadata.completedAt = new Date();
        break;
    }

    this.emit('status:changed', {
      taskId: this.id,
      previousStatus,
      newStatus: status,
      timestamp: new Date()
    });
  }

  /**
   * Get task priority
   */
  getPriority(): TaskPriority {
    return this.priority;
  }

  /**
   * Set task priority
   */
  setPriority(priority: TaskPriority): void {
    this.priority = priority;
    this.emit('priority:changed', {
      taskId: this.id,
      priority,
      timestamp: new Date()
    });
  }

  /**
   * Get task result
   */
  getResult(): TResult | null {
    return this.result;
  }

  /**
   * Set task result
   */
  setResult(result: TResult): void {
    this.result = result;
    this.emit('result:set', {
      taskId: this.id,
      result,
      timestamp: new Date()
    });
  }

  /**
   * Get task error
   */
  getError(): Error | null {
    return this.error;
  }

  /**
   * Set task error
   */
  setError(error: Error): void {
    this.error = error;
    this.emit('error:set', {
      taskId: this.id,
      error,
      timestamp: new Date()
    });
  }

  /**
   * Get task metadata
   */
  getMetadata(): TaskMetadata {
    return this.metadata;
  }

  /**
   * Assign agent to task
   */
  assignAgent(agentId: string): void {
    this.metadata.assignedAgent = agentId;
    this.setStatus(TaskStatus.ASSIGNED);
    this.emit('agent:assigned', {
      taskId: this.id,
      agentId,
      timestamp: new Date()
    });
  }

  /**
   * Check if task can be retried
   */
  canRetry(): boolean {
    return this.metadata.retryCount < this.metadata.maxRetries;
  }

  /**
   * Increment retry count
   */
  incrementRetry(): void {
    this.metadata.retryCount++;
    this.emit('retry:attempted', {
      taskId: this.id,
      retryCount: this.metadata.retryCount,
      timestamp: new Date()
    });
  }

  /**
   * Set maximum retries
   */
  setMaxRetries(maxRetries: number): void {
    this.metadata.maxRetries = maxRetries;
  }

  /**
   * Set timeout for task execution
   */
  setTimeout(timeout: number): void {
    this.metadata.timeout = timeout;
  }

  /**
   * Check if task has timed out
   */
  hasTimedOut(): boolean {
    if (!this.metadata.timeout || !this.metadata.startedAt) {
      return false;
    }

    const elapsed = Date.now() - this.metadata.startedAt.getTime();
    return elapsed > this.metadata.timeout;
  }

  /**
   * Get task execution duration
   */
  getExecutionDuration(): number | null {
    if (!this.metadata.startedAt) {
      return null;
    }

    const endTime = this.metadata.completedAt || new Date();
    return endTime.getTime() - this.metadata.startedAt.getTime();
  }

  /**
   * Check if task is complete (either completed or failed)
   */
  isComplete(): boolean {
    return this.status === TaskStatus.COMPLETED ||
           this.status === TaskStatus.FAILED ||
           this.status === TaskStatus.CANCELLED;
  }

  /**
   * Wait for task completion
   *
   * @remarks
   * Returns a promise that resolves when the task completes successfully
   * or rejects if the task fails or is cancelled.
   *
   * @returns A promise that resolves to the task result
   * @throws {Error} If the task fails or is cancelled
   *
   * @example
   * ```typescript
   * const task = new Task('test-generation', 'Generate tests', data);
   * await fleet.submitTask(task);
   * const result = await task.waitForCompletion();
   * console.log('Tests generated:', result);
   * ```
   *
   * @public
   */
  async waitForCompletion(): Promise<TResult | null> {
    return new Promise((resolve, reject) => {
      if (this.isComplete()) {
        if (this.status === TaskStatus.COMPLETED) {
          resolve(this.result);
        } else {
          reject(this.error || new Error(`Task ${this.id} was ${this.status}`));
        }
        return;
      }

      const onStatusChange = (data: StatusChangeEvent) => {
        if (data.taskId === this.id && this.isComplete()) {
          this.removeListener('status:changed', onStatusChange);

          if (this.status === TaskStatus.COMPLETED) {
            resolve(this.result);
          } else {
            reject(this.error || new Error(`Task ${this.id} was ${this.status}`));
          }
        }
      };

      this.on('status:changed', onStatusChange);
    });
  }

  /**
   * Cancel the task
   */
  cancel(): void {
    if (!this.isComplete()) {
      this.setStatus(TaskStatus.CANCELLED);
      this.emit('task:cancelled', {
        taskId: this.id,
        timestamp: new Date()
      });
    }
  }

  /**
   * Convert task to JSON representation
   */
  toJSON(): TaskJSON<TData, TResult> {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      data: this.data,
      requirements: this.requirements,
      status: this.status,
      priority: this.priority,
      result: this.result,
      error: this.error?.message,
      metadata: this.metadata
    };
  }

  /**
   * Create task from JSON representation
   */
  static fromJSON<TData = unknown, TResult = unknown>(json: TaskJSON<TData, TResult>): Task<TData, TResult> {
    const task = new Task<TData, TResult>(
      json.type,
      json.name,
      json.data,
      json.requirements,
      json.priority
    );

    task.status = json.status;
    task.result = json.result;
    if (json.error) {
      task.error = new Error(json.error);
    }
    task.metadata = {
      ...json.metadata,
      createdAt: new Date(json.metadata.createdAt),
      startedAt: json.metadata.startedAt ? new Date(json.metadata.startedAt) : undefined,
      completedAt: json.metadata.completedAt ? new Date(json.metadata.completedAt) : undefined
    };

    return task;
  }
}