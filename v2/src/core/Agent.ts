/**
 * Agent - Base class for all autonomous agents in the AQE Fleet
 *
 * @remarks
 * The Agent class provides the foundational capabilities for autonomous agents
 * including lifecycle management, task execution, capability advertisement,
 * and performance metrics tracking.
 *
 * All concrete agent implementations must extend this class and implement
 * the abstract methods for agent-specific behavior.
 *
 * @example
 * ```typescript
 * class CustomAgent extends Agent {
 *   protected async onInitialize(): Promise<void> {
 *     // Custom initialization logic
 *   }
 *
 *   protected async executeTaskLogic(task: Task): Promise<any> {
 *     // Custom task execution logic
 *     return { success: true };
 *   }
 * }
 * ```
 *
 * @public
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus } from './Task';
import { EventBus } from './EventBus';
import { Logger } from '../utils/Logger';

/**
 * Operational status of an agent
 *
 * @public
 */
export enum AgentStatus {
  /** Agent is being initialized */
  INITIALIZING = 'initializing',
  /** Agent is idle and ready to accept tasks */
  IDLE = 'idle',
  /** Agent is active and monitoring for tasks */
  ACTIVE = 'active',
  /** Agent is currently executing a task */
  BUSY = 'busy',
  /** Agent encountered an error */
  ERROR = 'error',
  /** Agent is in the process of stopping */
  STOPPING = 'stopping',
  /** Agent has been stopped */
  STOPPED = 'stopped'
}

/**
 * Describes a capability that an agent can perform
 *
 * @public
 */
export interface AgentCapability {
  /** Name of the capability */
  name: string;
  /** Version of the capability implementation */
  version: string;
  /** Human-readable description */
  description: string;
  /** Types of tasks this capability can handle */
  taskTypes: string[];
}

/**
 * Performance metrics for an agent
 *
 * @public
 */
export interface AgentMetrics {
  /** Total number of tasks completed successfully */
  tasksCompleted: number;
  /** Total number of failed tasks */
  tasksFailured: number;
  /** Average task execution time in milliseconds */
  averageExecutionTime: number;
  /** Agent uptime in milliseconds */
  uptime: number;
  /** Timestamp of last activity */
  lastActivity: Date;
}

export abstract class Agent extends EventEmitter {
  protected readonly id: string;
  protected readonly type: string;
  protected readonly config: any;
  protected readonly eventBus: EventBus;
  protected readonly logger: Logger;
  protected status: AgentStatus;
  protected currentTask: Task | null = null;
  protected capabilities: AgentCapability[] = [];
  protected metrics: AgentMetrics;
  protected startTime: Date | null = null;

  constructor(id: string, type: string, config: any, eventBus: EventBus, logger?: Logger) {
    super();
    this.id = id;
    this.type = type;
    this.config = config;
    this.eventBus = eventBus;
    this.logger = logger || Logger.getInstance();
    this.status = AgentStatus.INITIALIZING;
    this.metrics = {
      tasksCompleted: 0,
      tasksFailured: 0,
      averageExecutionTime: 0,
      uptime: 0,
      lastActivity: new Date()
    };

    this.setupEventHandlers();
  }

  /**
   * Initialize the agent and its capabilities
   *
   * @remarks
   * Performs initialization sequence including capability setup and
   * agent-specific initialization logic.
   *
   * @returns A promise that resolves when initialization is complete
   * @throws {Error} If initialization fails
   * @fires agent:initialized
   *
   * @public
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing agent ${this.type} (${this.id})`);

    try {
      // Initialize agent-specific capabilities
      await this.initializeCapabilities();

      // Run agent-specific initialization
      await this.onInitialize();

      this.status = AgentStatus.IDLE;
      this.startTime = new Date();

      this.logger.info(`Agent ${this.type} (${this.id}) initialized successfully`);
      this.emit('agent:initialized', { agentId: this.id, type: this.type });

    } catch (error) {
      this.status = AgentStatus.ERROR;
      this.logger.error(`Failed to initialize agent ${this.id}:`, error);
      this.emit('agent:error', { agentId: this.id, error });
      throw error;
    }
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    if (this.status !== AgentStatus.IDLE) {
      throw new Error(`Agent ${this.id} must be idle to start`);
    }

    this.status = AgentStatus.ACTIVE;
    await this.onStart();

    this.logger.info(`Agent ${this.type} (${this.id}) started`);
    this.emit('agent:started', { agentId: this.id });
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    this.status = AgentStatus.STOPPING;

    // Wait for current task to complete if any
    if (this.currentTask && this.currentTask.getStatus() === TaskStatus.RUNNING) {
      await this.currentTask.waitForCompletion();
    }

    await this.onStop();
    this.status = AgentStatus.STOPPED;

    this.logger.info(`Agent ${this.type} (${this.id}) stopped`);
    this.emit('agent:stopped', { agentId: this.id });
  }

  /**
   * Assign a task to this agent for execution
   *
   * @param task - The task to assign
   * @returns A promise that resolves when the task is assigned
   * @throws {Error} If agent is not available or cannot handle the task type
   * @fires task:assigned
   *
   * @public
   */
  async assignTask(task: Task): Promise<void> {
    // Check if agent already has a task first (more specific error)
    if (this.currentTask) {
      throw new Error(`Agent ${this.id} already has an assigned task`);
    }

    // Then check if agent is in correct status
    if (this.status !== AgentStatus.ACTIVE && this.status !== AgentStatus.IDLE && this.status !== AgentStatus.BUSY) {
      throw new Error(`Agent ${this.id} is not available for task assignment`);
    }

    if (!this.canHandleTaskType(task.getType())) {
      throw new Error(`Agent ${this.id} cannot handle task type ${task.getType()}`);
    }

    this.currentTask = task;
    this.status = AgentStatus.BUSY; // Set BUSY immediately to prevent race conditions
    this.metrics.lastActivity = new Date();

    this.logger.info(`Task ${task.getId()} assigned to agent ${this.id}`);
    this.emit('task:assigned', { agentId: this.id, taskId: task.getId() });

    // Execute the task asynchronously but don't await it
    this.executeTask(task).catch(error => {
      this.logger.error(`Unhandled error in task execution for ${task.getId()}:`, error);
    });
  }

  /**
   * Execute a task
   */
  private async executeTask(task: Task): Promise<void> {
    const startTime = Date.now();

    try {
      // Status already set to BUSY in assignTask
      task.setStatus(TaskStatus.RUNNING);
      this.eventBus.emit('task:started', { agentId: this.id, taskId: task.getId() });

      // Execute agent-specific task logic
      const result = await this.executeTaskLogic(task);

      task.setResult(result);
      task.setStatus(TaskStatus.COMPLETED);

      // Update metrics
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime, true);

      this.logger.info(`Task ${task.getId()} completed by agent ${this.id}`);
      this.eventBus.emit('task:completed', {
        agentId: this.id,
        taskId: task.getId(),
        result,
        executionTime
      });

    } catch (error) {
      task.setError(error as Error);
      task.setStatus(TaskStatus.FAILED);

      // Update metrics
      const executionTime = Date.now() - startTime;
      this.updateMetrics(executionTime, false);

      this.logger.error(`Task ${task.getId()} failed in agent ${this.id}:`, error);
      this.eventBus.emit('task:failed', {
        agentId: this.id,
        taskId: task.getId(),
        error,
        executionTime
      });

    } finally {
      this.currentTask = null;
      this.status = AgentStatus.ACTIVE;
    }
  }

  /**
   * Check if agent can handle a specific task type
   *
   * @param taskType - The task type to check
   * @returns True if the agent has a capability for this task type
   *
   * @public
   */
  canHandleTaskType(taskType: string): boolean {
    return this.capabilities.some(capability =>
      capability.taskTypes.includes(taskType)
    );
  }

  /**
   * Get agent ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get agent type
   */
  getType(): string {
    return this.type;
  }

  /**
   * Get agent status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Get agent capabilities
   */
  getCapabilities(): AgentCapability[] {
    return this.capabilities;
  }

  /**
   * Get agent performance metrics
   *
   * @returns Current metrics including task counts and execution times
   *
   * @public
   */
  getMetrics(): AgentMetrics {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    return {
      ...this.metrics,
      uptime
    };
  }

  /**
   * Get current task
   */
  getCurrentTask(): Task | null {
    return this.currentTask;
  }

  /**
   * Abstract methods to be implemented by specific agent types
   */
  protected abstract onInitialize(): Promise<void>;
  protected abstract onStart(): Promise<void>;
  protected abstract onStop(): Promise<void>;
  protected abstract executeTaskLogic(task: Task): Promise<any>;
  protected abstract initializeCapabilities(): Promise<void>;

  /**
   * Update agent metrics
   */
  private updateMetrics(executionTime: number, success: boolean): void {
    if (success) {
      this.metrics.tasksCompleted++;
    } else {
      this.metrics.tasksFailured++;
    }

    // Update average execution time
    const totalTasks = this.metrics.tasksCompleted + this.metrics.tasksFailured;
    if (totalTasks > 0) {
      this.metrics.averageExecutionTime =
        (this.metrics.averageExecutionTime * (totalTasks - 1) + executionTime) / totalTasks;
    } else {
      this.metrics.averageExecutionTime = executionTime;
    }

    this.metrics.lastActivity = new Date();
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('error', (error) => {
      this.status = AgentStatus.ERROR;
      this.logger.error(`Agent ${this.id} encountered an error:`, error);
      this.eventBus.emit('agent:error', { agentId: this.id, error });
    });
  }
}