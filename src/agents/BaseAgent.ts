/**
 * BaseAgent - Abstract base class for all QE agents
 * Implements core lifecycle hooks, event handling, and memory access
 * Based on SPARC Phase 2 Pseudocode and Phase 3 Architecture
 */

import { EventEmitter } from 'events';
import {
  AgentId,
  QEAgentType as AgentType,
  AgentStatus,
  AgentContext,
  AgentCapability,
  QEEvent,
  EventHandler,
  MemoryStore,
  QETask,
  TaskAssignment,
  AgentMessage,
  MessageType
} from '../types';

export interface BaseAgentConfig {
  id?: string;
  type: AgentType;
  capabilities: AgentCapability[];
  context: AgentContext;
  memoryStore: MemoryStore;
  eventBus: EventEmitter;
}

export abstract class BaseAgent extends EventEmitter {
  protected readonly agentId: AgentId;
  protected status: AgentStatus = AgentStatus.INITIALIZING;
  protected readonly capabilities: Map<string, AgentCapability>;
  protected readonly context: AgentContext;
  protected readonly memoryStore: MemoryStore;
  protected readonly eventBus: EventEmitter;
  protected readonly eventHandlers: Map<string, EventHandler[]> = new Map();
  protected currentTask?: TaskAssignment;
  protected performanceMetrics: {
    tasksCompleted: number;
    averageExecutionTime: number;
    errorCount: number;
    lastActivity: Date;
  } = {
    tasksCompleted: 0,
    averageExecutionTime: 0,
    errorCount: 0,
    lastActivity: new Date()
  };

  constructor(config: BaseAgentConfig) {
    super();

    this.agentId = {
      id: config.id || this.generateAgentId(config.type),
      type: config.type,
      created: new Date()
    };

    this.capabilities = new Map(
      config.capabilities.map(cap => [cap.name, cap])
    );

    this.context = config.context;
    this.memoryStore = config.memoryStore;
    this.eventBus = config.eventBus;

    this.setupEventHandlers();
    this.setupLifecycleHooks();
  }

  // ============================================================================
  // Public Interface
  // ============================================================================

  /**
   * Initialize the agent - must be called after construction
   */
  public async initialize(): Promise<void> {
    try {
      this.status = AgentStatus.INITIALIZING;

      // Execute pre-initialization hooks
      await this.executeHook('pre-initialization');

      // Load agent knowledge and state
      await this.loadKnowledge();
      await this.restoreState();

      // Initialize agent-specific components
      await this.initializeComponents();

      // Execute post-initialization hooks
      await this.executeHook('post-initialization');

      this.status = AgentStatus.ACTIVE;
      this.emitEvent('agent.initialized', { agentId: this.agentId });

      // Report initialization to coordination system
      await this.reportStatus('initialized');

    } catch (error) {
      this.status = AgentStatus.ERROR;
      this.emitEvent('agent.error', { agentId: this.agentId, error });
      throw error;
    }
  }

  /**
   * Execute a task assignment
   */
  public async executeTask(assignment: TaskAssignment): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate task assignment
      this.validateTaskAssignment(assignment);

      this.currentTask = assignment;
      this.status = AgentStatus.ACTIVE;

      // Execute pre-task hooks
      await this.executeHook('pre-task', { assignment });

      // Broadcast task start
      await this.broadcastMessage('task-start', assignment);

      // Execute the actual task
      const result = await this.performTask(assignment.task);

      // Execute post-task hooks
      await this.executeHook('post-task', { assignment, result });

      // Update performance metrics
      this.updatePerformanceMetrics(startTime, true);

      // Store task completion in memory
      await this.storeTaskResult(assignment.id, result);

      this.currentTask = undefined;
      this.status = AgentStatus.IDLE;

      return result;

    } catch (error) {
      this.updatePerformanceMetrics(startTime, false);
      this.currentTask = undefined;
      this.status = AgentStatus.ERROR;

      // Execute error hooks
      await this.executeHook('task-error', { assignment, error });

      throw error;
    }
  }

  /**
   * Terminate the agent gracefully
   */
  public async terminate(): Promise<void> {
    try {
      this.status = AgentStatus.TERMINATING;

      // Execute pre-termination hooks
      await this.executeHook('pre-termination');

      // Save current state
      await this.saveState();

      // Clean up resources
      await this.cleanup();

      // Remove all event handlers from EventBus
      for (const [eventType, handlers] of this.eventHandlers.entries()) {
        for (const handler of handlers) {
          this.eventBus.off(eventType, handler.handler);
        }
      }
      this.eventHandlers.clear();

      // Execute post-termination hooks
      await this.executeHook('post-termination');

      this.status = AgentStatus.TERMINATED;
      this.emitEvent('agent.terminated', { agentId: this.agentId });

      // Remove all listeners from this agent (EventEmitter)
      this.removeAllListeners();

    } catch (error) {
      this.status = AgentStatus.ERROR;
      throw error;
    }
  }

  /**
   * Get current agent status and metrics
   */
  public getStatus(): {
    agentId: AgentId;
    status: AgentStatus;
    currentTask?: string;
    capabilities: string[];
    performanceMetrics: {
      tasksCompleted: number;
      averageExecutionTime: number;
      errorCount: number;
      lastActivity: Date;
    };
  } {
    return {
      agentId: this.agentId,
      status: this.status,
      currentTask: this.currentTask?.id,
      capabilities: Array.from(this.capabilities.keys()),
      performanceMetrics: { ...this.performanceMetrics }
    };
  }

  /**
   * Check if agent has a specific capability
   */
  public hasCapability(capabilityName: string): boolean {
    return this.capabilities.has(capabilityName);
  }

  /**
   * Get capability details
   */
  public getCapability(capabilityName: string): AgentCapability | undefined {
    return this.capabilities.get(capabilityName);
  }

  /**
   * Get all capabilities
   */
  public getCapabilities(): AgentCapability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Start the agent (alias for initialize)
   */
  public async start(): Promise<void> {
    await this.initialize();
  }

  /**
   * Assign a task to the agent
   */
  public async assignTask(task: QETask): Promise<void> {
    const assignment: TaskAssignment = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      task,
      agentId: this.agentId.id,
      assignedAt: new Date(),
      status: 'assigned'
    };

    await this.executeTask(assignment);
  }

  // ============================================================================
  // Abstract Methods - Must be implemented by subclasses
  // ============================================================================

  /**
   * Initialize agent-specific components
   */
  protected abstract initializeComponents(): Promise<void>;

  /**
   * Perform the actual task work
   */
  protected abstract performTask(task: QETask): Promise<any>;

  /**
   * Load agent-specific knowledge
   */
  protected abstract loadKnowledge(): Promise<void>;

  /**
   * Clean up agent-specific resources
   */
  protected abstract cleanup(): Promise<void>;

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Register an event handler
   */
  protected registerEventHandler<T = any>(handler: EventHandler<T>): void {
    const handlers = this.eventHandlers.get(handler.eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(handler.eventType, handlers);

    this.eventBus.on(handler.eventType, handler.handler);
  }

  /**
   * Emit an event
   */
  protected emitEvent(type: string, data: any, priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'): void {
    const event: QEEvent = {
      id: this.generateEventId(),
      type,
      source: this.agentId,
      data,
      timestamp: new Date(),
      priority,
      scope: 'global'
    };

    this.eventBus.emit(type, event);
  }

  /**
   * Broadcast message to other agents
   */
  protected async broadcastMessage(type: string, payload: any): Promise<void> {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.agentId,
      to: { id: 'broadcast', type: 'all' as AgentType, created: new Date() },
      type: type as MessageType,
      payload,
      timestamp: new Date(),
      priority: 'medium'
    };

    this.eventBus.emit('agent.message', message);
  }

  // ============================================================================
  // Memory Operations
  // ============================================================================

  /**
   * Store data in memory with automatic namespacing
   */
  protected async storeMemory(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.memoryStore) {
      console.warn(`[WARN] Memory store not available for ${this.agentId.id}`);
      return;
    }
    const namespacedKey = `agent:${this.agentId.id}:${key}`;
    await this.memoryStore.store(namespacedKey, value, ttl);
  }

  /**
   * Retrieve data from memory
   */
  protected async retrieveMemory(key: string): Promise<any> {
    if (!this.memoryStore) {
      console.warn(`[WARN] Memory store not available for ${this.agentId.id}`);
      return null;
    }
    const namespacedKey = `agent:${this.agentId.id}:${key}`;
    return await this.memoryStore.retrieve(namespacedKey);
  }

  /**
   * Store shared data accessible by other agents
   */
  protected async storeSharedMemory(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.memoryStore) {
      console.warn(`[WARN] Memory store not available for ${this.agentId.id}`);
      return;
    }
    const sharedKey = `shared:${this.agentId.type}:${key}`;
    await this.memoryStore.store(sharedKey, value, ttl);
  }

  /**
   * Retrieve shared data from other agents
   */
  protected async retrieveSharedMemory(agentType: AgentType, key: string): Promise<any> {
    if (!this.memoryStore) {
      console.warn(`[WARN] Memory store not available for ${this.agentId.id}`);
      return null;
    }
    const sharedKey = `shared:${agentType}:${key}`;
    return await this.memoryStore.retrieve(sharedKey);
  }

  // ============================================================================
  // Lifecycle Hooks
  // ============================================================================

  private async executeHook(hookName: string, data?: any): Promise<void> {
    try {
      const method = `on${hookName.charAt(0).toUpperCase()}${hookName.slice(1).replace(/-/g, '')}`;
      if (typeof (this as any)[method] === 'function') {
        await (this as any)[method](data);
      }
    } catch (error) {
      console.error(`Hook ${hookName} failed for agent ${this.agentId.id}:`, error);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private setupEventHandlers(): void {
    // Set up base event handlers that all agents should have
    this.registerEventHandler({
      eventType: 'fleet.shutdown',
      handler: async () => {
        await this.terminate();
      }
    });

    this.registerEventHandler({
      eventType: 'agent.ping',
      handler: async (event: QEEvent) => {
        if (event.target?.id === this.agentId.id) {
          this.emitEvent('agent.pong', { agentId: this.agentId });
        }
      }
    });
  }

  private setupLifecycleHooks(): void {
    // Setup default lifecycle behavior
    this.on('error', (error) => {
      this.status = AgentStatus.ERROR;
      this.emitEvent('agent.error', { agentId: this.agentId, error });
    });
  }

  private validateTaskAssignment(assignment: TaskAssignment): void {
    if (!assignment || !assignment.task) {
      throw new Error('Invalid task assignment');
    }

    // Check if agent has required capabilities
    const requiredCapabilities = assignment.task.requirements?.capabilities || [];
    for (const capability of requiredCapabilities) {
      if (!this.hasCapability(capability)) {
        throw new Error(`Agent ${this.agentId.id} missing required capability: ${capability}`);
      }
    }
  }

  private updatePerformanceMetrics(startTime: number, success: boolean): void {
    const executionTime = Date.now() - startTime;

    if (success) {
      this.performanceMetrics.tasksCompleted++;
      this.performanceMetrics.averageExecutionTime =
        (this.performanceMetrics.averageExecutionTime * (this.performanceMetrics.tasksCompleted - 1) + executionTime) /
        this.performanceMetrics.tasksCompleted;
    } else {
      this.performanceMetrics.errorCount++;
    }

    this.performanceMetrics.lastActivity = new Date();
  }

  private async storeTaskResult(taskId: string, result: any): Promise<void> {
    await this.storeMemory(`task:${taskId}:result`, {
      result,
      timestamp: new Date(),
      agentId: this.agentId.id
    });
  }

  private async restoreState(): Promise<void> {
    try {
      const state = await this.retrieveMemory('state');
      if (state) {
        this.performanceMetrics = { ...this.performanceMetrics, ...state.performanceMetrics };
      }
    } catch (error) {
      // State restoration is optional
      console.warn(`Could not restore state for agent ${this.agentId.id}:`, error);
    }
  }

  private async saveState(): Promise<void> {
    try {
      await this.storeMemory('state', {
        performanceMetrics: this.performanceMetrics,
        timestamp: new Date()
      });
    } catch (error) {
      console.error(`Could not save state for agent ${this.agentId.id}:`, error);
    }
  }

  private async reportStatus(status: string): Promise<void> {
    try {
      await this.storeSharedMemory('status', {
        agentId: this.agentId.id,
        status,
        timestamp: new Date(),
        metrics: this.performanceMetrics
      });
    } catch (error) {
      console.warn(`Could not report status for agent ${this.agentId.id}:`, error);
    }
  }

  private generateAgentId(type: AgentType): string {
    return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Agent Factory
// ============================================================================

export interface AgentFactory {
  createAgent(type: AgentType, config: BaseAgentConfig): Promise<BaseAgent>;
  getSupportedTypes(): AgentType[];
  getCapabilities(type: AgentType): AgentCapability[];
}

export abstract class BaseAgentFactory implements AgentFactory {
  abstract createAgent(type: AgentType, config: BaseAgentConfig): Promise<BaseAgent>;
  abstract getSupportedTypes(): AgentType[];
  abstract getCapabilities(type: AgentType): AgentCapability[];
}