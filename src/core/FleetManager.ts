/**
 * FleetManager - Central coordination hub for the AQE Fleet
 *
 * @remarks
 * The FleetManager is the primary interface for managing the Agentic QE Fleet.
 * It provides comprehensive lifecycle management for autonomous agents, task
 * coordination, and fleet-wide monitoring through an event-driven architecture.
 *
 * @example
 * ```typescript
 * // Initialize a fleet with multiple agent types
 * const config = {
 *   agents: [
 *     { type: 'test-generator', count: 2, config: { aiModel: 'claude-sonnet-4.5' } },
 *     { type: 'test-executor', count: 4, config: { maxParallelTests: 8 } },
 *     { type: 'coverage-analyzer', count: 1 }
 *   ]
 * };
 *
 * const fleet = new FleetManager(config);
 * await fleet.initialize();
 * await fleet.start();
 *
 * // Submit tasks
 * const task = new Task('test-generation', 'Generate API tests', {
 *   targetFiles: ['./src/api/*.ts']
 * });
 * await fleet.submitTask(task);
 *
 * // Monitor fleet status
 * const status = fleet.getStatus();
 * console.log(`Active agents: ${status.activeAgents}/${status.totalAgents}`);
 * ```
 *
 * @public
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Agent, AgentStatus } from './Agent';
import { Task, TaskStatus } from './Task';
import { EventBus } from './EventBus';
import { Database } from '../utils/Database';
import { Logger } from '../utils/Logger';
import { Config, FleetConfig } from '../utils/Config';
import { createAgent } from '../agents';

/**
 * Status information about the fleet
 *
 * @public
 */
export interface FleetStatus {
  /** Unique identifier for the fleet instance */
  id: string;
  /** Number of agents currently active and ready for work */
  activeAgents: number;
  /** Total number of agents in the fleet */
  totalAgents: number;
  /** Number of tasks currently being executed */
  runningTasks: number;
  /** Total number of tasks completed successfully */
  completedTasks: number;
  /** Total number of tasks that failed */
  failedTasks: number;
  /** Fleet uptime in milliseconds */
  uptime: number;
  /** Current operational status of the fleet */
  status: 'initializing' | 'running' | 'paused' | 'stopping' | 'stopped';
}

export class FleetManager extends EventEmitter {
  private readonly id: string;
  private readonly agents: Map<string, Agent>;
  private readonly tasks: Map<string, Task>;
  private readonly eventBus: EventBus;
  private readonly database: Database;
  private readonly logger: Logger;
  private readonly config: FleetConfig;
  private startTime: Date | null = null;
  private status: FleetStatus['status'] = 'initializing';

  constructor(config: FleetConfig) {
    super();
    this.id = uuidv4();
    this.agents = new Map();
    this.tasks = new Map();
    this.eventBus = new EventBus();
    this.database = new Database();
    this.logger = Logger.getInstance();
    this.config = config;

    this.setupEventHandlers();
  }

  /**
   * Initialize the fleet manager and its components
   *
   * @remarks
   * This method performs the following operations:
   * - Initializes the database connection
   * - Starts the event bus
   * - Creates the initial pool of agents based on configuration
   *
   * @returns A promise that resolves when initialization is complete
   * @throws {Error} If database initialization fails or agents cannot be created
   *
   * @example
   * ```typescript
   * const fleet = new FleetManager(config);
   * await fleet.initialize();
   * ```
   *
   * @public
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing Fleet Manager ${this.id}`);

    try {
      // Initialize database
      await this.database.initialize();

      // Initialize event bus
      await this.eventBus.initialize();

      // Create initial agent pool
      await this.createInitialAgents();

      this.status = 'running';
      this.logger.info('Fleet Manager initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Fleet Manager:', error);
      throw error;
    }
  }

  /**
   * Start the fleet operations and activate all agents
   *
   * @remarks
   * Starts all agents in the fleet and begins accepting tasks. The fleet must be
   * initialized before calling this method.
   *
   * @returns A promise that resolves when all agents have started
   * @throws {Error} If fleet is not initialized or agents fail to start
   * @fires fleet:started
   *
   * @public
   */
  async start(): Promise<void> {
    if (this.status !== 'running') {
      throw new Error('Fleet must be initialized before starting');
    }

    this.startTime = new Date();
    this.logger.info('Fleet Manager started');

    // Start all agents
    for (const agent of this.agents.values()) {
      await agent.start();
    }

    this.emit('fleet:started', this.getStatus());
  }

  /**
   * Stop the fleet operations gracefully
   *
   * @remarks
   * Performs graceful shutdown:
   * - Stops accepting new tasks
   * - Waits for running tasks to complete
   * - Stops all agents
   * - Closes database connections
   *
   * @returns A promise that resolves when shutdown is complete
   * @fires fleet:stopped
   *
   * @public
   */
  async stop(): Promise<void> {
    this.status = 'stopping';
    this.logger.info('Stopping Fleet Manager');

    // Stop all agents gracefully
    const stopPromises = Array.from(this.agents.values()).map(agent =>
      agent.stop()
    );

    await Promise.all(stopPromises);

    // Close database connection
    await this.database.close();

    this.status = 'stopped';
    this.emit('fleet:stopped', this.getStatus());
    this.logger.info('Fleet Manager stopped');
  }

  /**
   * Create and register a new agent in the fleet
   *
   * @param type - The type of agent to create (e.g., 'test-generator', 'test-executor')
   * @param config - Optional configuration for the agent
   * @returns A promise that resolves to the created agent instance
   * @throws {Error} If agent type is unknown or creation fails
   * @fires agent:spawned
   *
   * @example
   * ```typescript
   * const testGen = await fleet.spawnAgent('test-generator', {
   *   aiModel: 'claude-sonnet-4.5',
   *   frameworks: ['jest', 'vitest']
   * });
   * ```
   *
   * @public
   */
  async spawnAgent(type: string, config: any = {}): Promise<Agent> {
    const agentId = uuidv4();

    // Create agent using static import (enables proper mocking in tests)
    const agent = await createAgent(type, agentId, config, this.eventBus);

    this.agents.set(agentId, agent as any);
    await agent.initialize();

    this.logger.info(`Agent spawned: ${type} (${agentId})`);
    this.emit('agent:spawned', { agentId, type });

    return agent as any;
  }

  /**
   * Remove an agent from the fleet
   */
  async removeAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    await agent.stop();
    this.agents.delete(agentId);

    this.logger.info(`Agent removed: ${agentId}`);
    this.emit('agent:removed', { agentId });
  }

  /**
   * Submit a task for execution by an available agent
   *
   * @remarks
   * The fleet will automatically assign the task to an available agent that can
   * handle the task type. If no agent is available, the task will be queued.
   *
   * @param task - The task to submit
   * @returns A promise that resolves when the task is submitted
   * @fires task:submitted
   *
   * @example
   * ```typescript
   * const task = new Task(
   *   'coverage-analysis',
   *   'Analyze test coverage',
   *   { coverageReport: './coverage/coverage-final.json' }
   * );
   * await fleet.submitTask(task);
   * ```
   *
   * @public
   */
  async submitTask(task: Task): Promise<void> {
    this.tasks.set(task.getId(), task);

    // Find available agent for the task
    const agent = this.findAvailableAgent(task.getType());
    if (agent) {
      await agent.assignTask(task);
      this.logger.info(`Task ${task.getId()} assigned to agent ${agent.getId()}`);
    } else {
      task.setStatus(TaskStatus.QUEUED);
      this.logger.warn(`No available agent for task ${task.getId()}, queuing`);
    }

    this.emit('task:submitted', { taskId: task.getId() });
  }

  /**
   * Get current fleet status and metrics
   *
   * @returns Fleet status including agent counts, task metrics, and uptime
   *
   * @example
   * ```typescript
   * const status = fleet.getStatus();
   * console.log(`Fleet ${status.id}: ${status.activeAgents}/${status.totalAgents} agents active`);
   * console.log(`Tasks: ${status.runningTasks} running, ${status.completedTasks} completed`);
   * ```
   *
   * @public
   */
  getStatus(): FleetStatus {
    const activeAgents = Array.from(this.agents.values())
      .filter(agent => agent.getStatus() === AgentStatus.ACTIVE).length;

    const runningTasks = Array.from(this.tasks.values())
      .filter(task => task.getStatus() === TaskStatus.RUNNING).length;

    const completedTasks = Array.from(this.tasks.values())
      .filter(task => task.getStatus() === TaskStatus.COMPLETED).length;

    const failedTasks = Array.from(this.tasks.values())
      .filter(task => task.getStatus() === TaskStatus.FAILED).length;

    return {
      id: this.id,
      activeAgents,
      totalAgents: this.agents.size,
      runningTasks,
      completedTasks,
      failedTasks,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      status: this.status
    };
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Find an available agent for a specific task type
   */
  private findAvailableAgent(taskType: string): Agent | undefined {
    return Array.from(this.agents.values()).find(agent =>
      agent.getStatus() === AgentStatus.IDLE &&
      agent.canHandleTaskType(taskType)
    );
  }

  /**
   * Create initial agent pool based on configuration
   */
  private async createInitialAgents(): Promise<void> {
    const { agents: agentConfigs } = this.config;

    for (const agentConfig of agentConfigs) {
      for (let i = 0; i < agentConfig.count; i++) {
        await this.spawnAgent(agentConfig.type, agentConfig.config);
      }
    }
  }

  /**
   * Setup event handlers for fleet coordination
   */
  private setupEventHandlers(): void {
    this.eventBus.on('task:completed', (data) => {
      const task = this.tasks.get(data.taskId);
      if (task) {
        this.logger.info(`Task completed: ${data.taskId}`);
        this.emit('task:completed', data);
      }
    });

    this.eventBus.on('task:failed', (data) => {
      const task = this.tasks.get(data.taskId);
      if (task) {
        this.logger.error(`Task failed: ${data.taskId}`, data.error);
        this.emit('task:failed', data);
      }
    });

    this.eventBus.on('agent:error', (data) => {
      this.logger.error(`Agent error: ${data.agentId}`, data.error);
      this.emit('agent:error', data);
    });
  }
}