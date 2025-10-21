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
  MessageType,
  PreTaskData,
  PostTaskData,
  TaskErrorData
} from '../types';
import { VerificationHookManager } from '../core/hooks';
import { MemoryStoreAdapter } from '../adapters/MemoryStoreAdapter';
import { PerformanceTracker } from '../learning/PerformanceTracker';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import { LearningEngine } from '../learning/LearningEngine';
import { LearningConfig, StrategyRecommendation } from '../learning/types';
import { AgentDBManager, AgentDBConfig, createAgentDBManager } from '../core/memory/AgentDBManager';

export interface BaseAgentConfig {
  id?: string;
  type: AgentType;
  capabilities: AgentCapability[];
  context: AgentContext;
  memoryStore: MemoryStore;
  eventBus: EventEmitter;
  enableLearning?: boolean; // Enable PerformanceTracker integration
  learningConfig?: Partial<LearningConfig>; // Q-learning configuration
  agentDBConfig?: Partial<AgentDBConfig>; // Optional AgentDB configuration for distributed coordination

  // AgentDB shorthand properties (alternative to agentDBConfig)
  agentDBPath?: string;
  enableQUICSync?: boolean;
  syncPort?: number;
  syncPeers?: string[];
  quantizationType?: 'scalar' | 'binary' | 'product' | 'none';
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
  protected hookManager: VerificationHookManager;
  protected performanceTracker?: PerformanceTracker; // Optional performance tracking
  protected learningEngine?: LearningEngine; // Optional Q-learning engine
  protected readonly enableLearning: boolean;
  private learningConfig?: Partial<LearningConfig>; // Store config for initialization
  protected agentDB?: AgentDBManager; // AgentDB integration for distributed coordination
  private agentDBConfig?: Partial<AgentDBConfig>; // Store AgentDB config for initialization
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
  private taskStartTime?: number; // Track task execution start time

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
    this.enableLearning = config.enableLearning ?? false;
    this.learningConfig = config.learningConfig;

    // Build AgentDB config from either agentDBConfig or shorthand properties
    if (config.agentDBConfig) {
      this.agentDBConfig = config.agentDBConfig;
    } else if (config.agentDBPath || config.enableQUICSync) {
      this.agentDBConfig = {
        dbPath: config.agentDBPath || '.agentdb/reasoningbank.db',
        enableQUICSync: config.enableQUICSync || false,
        syncPort: config.syncPort || 4433,
        syncPeers: config.syncPeers || [],
        enableLearning: config.enableLearning || false,
        enableReasoning: true,
        cacheSize: 1000,
        quantizationType: config.quantizationType || 'scalar',
      };
    }

    // Initialize verification hook manager with type-safe adapter
    // MemoryStoreAdapter bridges MemoryStore interface to SwarmMemoryManager
    // Provides runtime validation and clear error messages for incompatible implementations
    const memoryAdapter = new MemoryStoreAdapter(this.memoryStore);
    this.hookManager = new VerificationHookManager(memoryAdapter);

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

      // Initialize PerformanceTracker if learning is enabled
      if (this.enableLearning && this.memoryStore instanceof SwarmMemoryManager) {
        this.performanceTracker = new PerformanceTracker(
          this.agentId.id,
          this.memoryStore as SwarmMemoryManager
        );
        await this.performanceTracker.initialize();

        // Initialize learning engine for Q-learning
        this.learningEngine = new LearningEngine(
          this.agentId.id,
          this.memoryStore as SwarmMemoryManager,
          this.learningConfig
        );
        await this.learningEngine.initialize();
      }

      // Initialize AgentDB if configured
      if (this.agentDBConfig) {
        await this.initializeAgentDB(this.agentDBConfig);
      }

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
   * Execute a task assignment with integrated verification hooks
   */
  public async executeTask(assignment: TaskAssignment): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate task assignment
      this.validateTaskAssignment(assignment);

      this.currentTask = assignment;
      this.status = AgentStatus.ACTIVE;

      // Execute pre-task hooks with verification
      const preTaskData: PreTaskData = { assignment };
      await this.onPreTask(preTaskData);
      await this.executeHook('pre-task', preTaskData);

      // Broadcast task start
      await this.broadcastMessage('task-start', assignment);

      // Execute the actual task
      const result = await this.performTask(assignment.task);

      // Execute post-task hooks with validation
      const postTaskData: PostTaskData = { assignment, result };
      await this.onPostTask(postTaskData);
      await this.executeHook('post-task', postTaskData);

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
      const errorData: TaskErrorData = {
        assignment,
        error: error as Error
      };
      await this.onTaskError(errorData);
      await this.executeHook('task-error', errorData);

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

      // Close AgentDB if enabled
      if (this.agentDB) {
        await this.agentDB.close();
        this.agentDB = undefined;
      }

      // Save current state
      await this.saveState();

      // Clean up agent-specific resources
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
   * Get Q-learning strategy recommendation
   */
  public async recommendStrategy(taskState: any): Promise<StrategyRecommendation | null> {
    if (!this.learningEngine?.isEnabled()) return null;
    try {
      return await this.learningEngine.recommendStrategy(taskState);
    } catch (error) {
      console.error(`Strategy recommendation failed:`, error);
      return null;
    }
  }

  /**
   * Get learned patterns from Q-learning
   */
  public getLearnedPatterns() {
    return this.learningEngine?.getPatterns() || [];
  }

  /**
   * Get learning engine status
   */
  public getLearningStatus() {
    if (!this.learningEngine) return null;
    return {
      enabled: this.learningEngine.isEnabled(),
      totalExperiences: this.learningEngine.getTotalExperiences(),
      explorationRate: this.learningEngine.getExplorationRate(),
      patterns: this.learningEngine.getPatterns().length
    };
  }

  /**
   * Initialize AgentDB integration for distributed coordination
   * Replaces custom QUIC and Neural code with production-ready AgentDB
   * @param config AgentDB configuration
   */
  public async initializeAgentDB(config: Partial<AgentDBConfig>): Promise<void> {
    if (this.agentDB) {
      console.warn(`[${this.agentId.id}] AgentDB already initialized`);
      return;
    }

    try {
      this.agentDB = createAgentDBManager(config);
      await this.agentDB.initialize();

      this.emitEvent('agent.agentdb.enabled', {
        agentId: this.agentId,
        config,
      });

      console.info(`[${this.agentId.id}] AgentDB integration enabled`, {
        quicSync: config.enableQUICSync || false,
        learning: config.enableLearning || false,
        reasoning: config.enableReasoning || false,
      });
    } catch (error: any) {
      console.error(`[${this.agentId.id}] Failed to initialize AgentDB:`, error);
      throw error;
    }
  }

  /**
   * Get AgentDB integration status
   */
  public async getAgentDBStatus() {
    if (!this.agentDB) return null;

    try {
      const stats = await this.agentDB.getStats();
      return {
        enabled: true,
        stats,
      };
    } catch (error) {
      return {
        enabled: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if AgentDB integration is available
   */
  public hasAgentDB(): boolean {
    return this.agentDB !== undefined;
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
   * Uses AgentDB if enabled, falls back to EventBus
   */
  protected async broadcastMessage(type: string, payload: any): Promise<void> {
    // Use EventBus for now (AgentDB sync handles distributed state)
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

  /**
   * Pre-task hook - called before task execution
   * Runs verification checks using VerificationHookManager
   * @param data Pre-task hook data including task assignment
   */
  protected async onPreTask(data: PreTaskData): Promise<void> {
    try {
      // Track task start time for PerformanceTracker
      this.taskStartTime = Date.now();

      const verificationResult = await this.hookManager.executePreTaskVerification({
        task: data.assignment.task.type,
        context: data.context
      });

      if (!verificationResult.passed) {
        throw new Error(
          `Pre-task verification failed with score ${verificationResult.score}. ` +
          `Checks: ${verificationResult.checks.join(', ')}`
        );
      }

      this.emitEvent('hook.pre-task.completed', {
        agentId: this.agentId,
        result: verificationResult
      });
    } catch (error) {
      console.error(`Pre-task hook failed for agent ${this.agentId.id}:`, error);
      throw error;
    }
  }

  /**
   * Post-task hook - called after task execution
   * Runs validation checks using VerificationHookManager
   * @param data Post-task hook data including result
   */
  protected async onPostTask(data: PostTaskData): Promise<void> {
    try {
      const validationResult = await this.hookManager.executePostTaskValidation({
        task: data.assignment.task.type,
        result: data.result
      });

      if (!validationResult.valid) {
        console.warn(
          `Post-task validation warning with accuracy ${validationResult.accuracy}. ` +
          `Validations: ${validationResult.validations.join(', ')}`
        );
      }

      // Q-learning integration: Learn from task execution
      if (this.learningEngine && this.learningEngine.isEnabled()) {
        try {
          const learningOutcome = await this.learningEngine.learnFromExecution(
            data.assignment.task,
            data.result
          );

          // Log learning progress
          if (learningOutcome.improved) {
            console.info(
              `[Learning] Agent ${this.agentId.id} improved by ${learningOutcome.improvementRate.toFixed(2)}%`
            );
          }
        } catch (learningError) {
          console.error(`Learning engine error:`, learningError);
          // Don't fail task due to learning errors
        }
      }

      // Record performance snapshot if PerformanceTracker is enabled
      if (this.performanceTracker && this.taskStartTime) {
        const executionTime = Date.now() - this.taskStartTime;
        const successRate = this.performanceMetrics.tasksCompleted /
          Math.max(1, this.performanceMetrics.tasksCompleted + this.performanceMetrics.errorCount);

        await this.performanceTracker.recordSnapshot({
          metrics: {
            tasksCompleted: this.performanceMetrics.tasksCompleted,
            successRate: Math.min(1.0, Math.max(0.0, successRate || 1.0)),
            averageExecutionTime: this.performanceMetrics.averageExecutionTime,
            errorRate: this.performanceMetrics.errorCount /
              Math.max(1, this.performanceMetrics.tasksCompleted + this.performanceMetrics.errorCount),
            userSatisfaction: validationResult.valid ? 0.9 : 0.5,
            resourceEfficiency: executionTime < 10000 ? 0.9 : 0.7 // Simple heuristic
          },
          trends: [] // Empty trends array for new snapshot
        });
      }

      this.emitEvent('hook.post-task.completed', {
        agentId: this.agentId,
        result: validationResult
      });
    } catch (error) {
      console.error(`Post-task hook failed for agent ${this.agentId.id}:`, error);
      // Don't throw - allow task to complete even if validation has issues
    }
  }

  /**
   * Task error hook - called when task execution fails
   * Handles error recovery and reporting
   * @param data Error hook data including error details
   */
  protected async onTaskError(data: TaskErrorData): Promise<void> {
    try {
      // Log error details
      console.error(
        `Task error for agent ${this.agentId.id}:`,
        {
          taskId: data.assignment.id,
          taskType: data.assignment.task.type,
          error: data.error.message,
          stack: data.error.stack
        }
      );

      // Store error in memory for analysis
      await this.storeMemory(`error:${data.assignment.id}`, {
        error: {
          message: data.error.message,
          stack: data.error.stack,
          name: data.error.name
        },
        assignment: {
          id: data.assignment.id,
          taskType: data.assignment.task.type
        },
        timestamp: new Date(),
        agentId: this.agentId.id
      });

      // Record failure in PerformanceTracker if enabled
      if (this.performanceTracker && this.taskStartTime) {
        const _executionTime = Date.now() - this.taskStartTime;
        const successRate = this.performanceMetrics.tasksCompleted /
          Math.max(1, this.performanceMetrics.tasksCompleted + this.performanceMetrics.errorCount);

        await this.performanceTracker.recordSnapshot({
          metrics: {
            tasksCompleted: this.performanceMetrics.tasksCompleted,
            successRate: Math.min(1.0, Math.max(0.0, successRate)),
            averageExecutionTime: this.performanceMetrics.averageExecutionTime,
            errorRate: (this.performanceMetrics.errorCount + 1) /
              Math.max(1, this.performanceMetrics.tasksCompleted + this.performanceMetrics.errorCount + 1),
            userSatisfaction: 0.3, // Low satisfaction on error
            resourceEfficiency: 0.5
          },
          trends: [] // Empty trends array for error snapshot
        });
      }

      this.emitEvent('hook.task-error.completed', {
        agentId: this.agentId,
        error: data.error
      }, 'high');
    } catch (error) {
      console.error(`Task error hook failed for agent ${this.agentId.id}:`, error);
      // Swallow this error to prevent recursive error handling
    }
  }

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