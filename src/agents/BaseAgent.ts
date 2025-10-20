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
import { QUICConfig, IQUICTransport, QUICMessage, QUICMessageType } from '../types/quic';
import { VerificationHookManager } from '../core/hooks';
import { MemoryStoreAdapter } from '../adapters/MemoryStoreAdapter';
import { PerformanceTracker } from '../learning/PerformanceTracker';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import { LearningEngine } from '../learning/LearningEngine';
import { LearningConfig, StrategyRecommendation } from '../learning/types';
import { QUICTransport } from '../core/transport/QUICTransport';
import {
  NeuralMatcher,
  NeuralConfig,
  createNeuralMatcher,
  DEFAULT_NEURAL_CONFIG
} from './mixins/NeuralCapableMixin';

export interface BaseAgentConfig {
  id?: string;
  type: AgentType;
  capabilities: AgentCapability[];
  context: AgentContext;
  memoryStore: MemoryStore;
  eventBus: EventEmitter;
  enableLearning?: boolean; // Enable PerformanceTracker integration
  learningConfig?: Partial<LearningConfig>; // Q-learning configuration
  neuralConfig?: Partial<NeuralConfig>; // Neural pattern matching configuration
  quicConfig?: QUICConfig; // Optional QUIC configuration for distributed coordination
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
  protected neuralMatcher?: NeuralMatcher | null; // Optional neural pattern matching
  private neuralConfig: Partial<NeuralConfig>; // Neural configuration
  protected quicTransport?: IQUICTransport; // Optional QUIC transport for distributed coordination
  private quicConfig?: QUICConfig; // Store QUIC config for initialization
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
    this.neuralConfig = config.neuralConfig ?? { enabled: false };
    this.quicConfig = config.quicConfig;

    // Initialize neural matcher if enabled
    this.neuralMatcher = createNeuralMatcher(this.neuralConfig);

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

      // Initialize QUIC transport if configured
      if (this.quicConfig && this.quicConfig.enabled) {
        await this.enableQUIC(this.quicConfig);
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

      // Disable QUIC transport if enabled
      if (this.quicTransport) {
        await this.disableQUIC();
      }

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
   * Enable neural capabilities at runtime
   * @param config Optional neural configuration overrides
   */
  public enableNeural(config: Partial<NeuralConfig> = {}): void {
    const finalConfig = {
      ...DEFAULT_NEURAL_CONFIG,
      ...this.neuralConfig,
      ...config,
      enabled: true
    };

    this.neuralConfig = finalConfig;
    this.neuralMatcher = createNeuralMatcher(finalConfig);

    if (this.neuralMatcher) {
      this.emitEvent('agent.neural.enabled', {
        agentId: this.agentId,
        config: finalConfig
      });
      console.info(`[${this.agentId.id}] Neural capabilities enabled`);
    }
  }

  /**
   * Disable neural capabilities at runtime
   */
  public disableNeural(): void {
    this.neuralMatcher = null;
    this.neuralConfig = { ...this.neuralConfig, enabled: false };

    this.emitEvent('agent.neural.disabled', {
      agentId: this.agentId
    });
    console.info(`[${this.agentId.id}] Neural capabilities disabled`);
  }

  /**
   * Get neural matcher status
   */
  public getNeuralStatus() {
    if (!this.neuralMatcher) return null;
    return this.neuralMatcher.getStatus();
  }

  /**
   * Check if neural capabilities are available
   */
  public hasNeuralCapabilities(): boolean {
    return this.neuralMatcher !== null && this.neuralMatcher !== undefined && this.neuralMatcher.isAvailable();
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
   * Uses QUIC if enabled, falls back to EventBus
   */
  protected async broadcastMessage(type: string, payload: any): Promise<void> {
    // Try QUIC first if enabled
    if (this.quicTransport) {
      try {
        const quicMessage: QUICMessage = {
          id: this.generateMessageId(),
          from: this.agentId.id,
          to: 'broadcast',
          channel: 'coordination',
          type: QUICMessageType.BROADCAST,
          payload: { type, payload },
          priority: 5,
          timestamp: new Date()
        };
        await this.quicTransport.broadcast(quicMessage);
        return;
      } catch (error) {
        console.warn('QUIC broadcast failed, falling back to EventBus:', error);
      }
    }

    // Fallback to EventBus
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
        const executionTime = Date.now() - this.taskStartTime;
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

  // ============================================================================
  // QUIC Coordination Methods
  // ============================================================================

  /**
   * Enable QUIC transport for distributed coordination
   */
  public async enableQUIC(config: QUICConfig): Promise<void> {
    if (this.quicTransport) {
      throw new Error('QUIC already enabled for this agent');
    }

    if (!config.enabled) {
      console.debug('QUIC config provided but not enabled');
      return;
    }

    console.info(`[${this.agentId.id}] Enabling QUIC transport`, {
      host: config.host,
      port: config.port,
      channels: config.channels.length
    });

    // Create QUIC transport
    this.quicTransport = new QUICTransport();
    this.quicConfig = config;

    // Initialize transport
    await this.quicTransport.initialize(config);

    // Setup message handlers
    this.setupQUICMessageHandlers();

    // Link transport with EventBus for fallback
    (this.quicTransport as QUICTransport).setEventBus(this.eventBus);

    this.emitEvent('agent.quic.enabled', { agentId: this.agentId, config });
    console.info(`[${this.agentId.id}] QUIC transport enabled successfully`);
  }

  /**
   * Disable QUIC transport
   */
  public async disableQUIC(): Promise<void> {
    if (!this.quicTransport) {
      return;
    }

    console.info(`[${this.agentId.id}] Disabling QUIC transport`);

    // Close transport
    await this.quicTransport.close();
    this.quicTransport = undefined;
    this.quicConfig = undefined;

    this.emitEvent('agent.quic.disabled', { agentId: this.agentId });
    console.info(`[${this.agentId.id}] QUIC transport disabled`);
  }

  /**
   * Check if QUIC is enabled
   */
  public isQUICEnabled(): boolean {
    return this.quicTransport !== undefined;
  }

  /**
   * Send direct message to another agent via QUIC
   */
  protected async sendToAgent(agentId: string, payload: any, channel: string = 'coordination'): Promise<void> {
    if (!this.quicTransport) {
      console.warn('QUIC not enabled, cannot send direct message');
      return;
    }

    const message: QUICMessage = {
      id: this.generateMessageId(),
      from: this.agentId.id,
      to: agentId,
      channel,
      type: QUICMessageType.DIRECT,
      payload,
      priority: 5,
      timestamp: new Date()
    };

    await this.quicTransport.send(agentId, message);

    console.debug(`[${this.agentId.id}] Sent message to agent ${agentId}`, {
      channel,
      payloadType: typeof payload
    });
  }

  /**
   * Request data from another agent via QUIC
   */
  protected async requestFromAgent(agentId: string, payload: any, timeout: number = 5000): Promise<any> {
    if (!this.quicTransport) {
      throw new Error('QUIC not enabled, cannot send request');
    }

    const message: QUICMessage = {
      id: this.generateMessageId(),
      from: this.agentId.id,
      to: agentId,
      channel: 'coordination',
      type: QUICMessageType.REQUEST,
      payload,
      priority: 7,
      timestamp: new Date()
    };

    const response = await this.quicTransport.request(agentId, message, {
      timeout,
      retries: 2,
      retryDelay: 100
    });

    console.debug(`[${this.agentId.id}] Received response from agent ${agentId}`);

    return response.payload;
  }

  /**
   * Broadcast to fleet via QUIC
   */
  protected async broadcastToFleet(payload: any, channel: string = 'coordination'): Promise<void> {
    if (!this.quicTransport) {
      console.warn('QUIC not enabled, falling back to EventBus broadcast');
      await this.broadcastMessage('fleet-broadcast', payload);
      return;
    }

    const message: QUICMessage = {
      id: this.generateMessageId(),
      from: this.agentId.id,
      to: 'broadcast',
      channel,
      type: QUICMessageType.BROADCAST,
      payload,
      priority: 5,
      timestamp: new Date()
    };

    await this.quicTransport.broadcast(message, { channel });

    const peers = this.quicTransport.getPeers();
    console.debug(`[${this.agentId.id}] Broadcast message to ${peers.length} peers`, {
      channel,
      payloadType: typeof payload
    });
  }

  /**
   * Get QUIC connection stats
   */
  public getQUICStats() {
    if (!this.quicTransport) {
      return null;
    }

    return this.quicTransport.getStats();
  }

  /**
   * Get QUIC health status
   */
  public getQUICHealth() {
    if (!this.quicTransport) {
      return null;
    }

    return this.quicTransport.getHealth();
  }

  /**
   * Setup QUIC message handlers
   */
  private setupQUICMessageHandlers(): void {
    if (!this.quicTransport) {
      return;
    }

    // Handle incoming messages
    this.quicTransport.on('message:received', (message: QUICMessage) => {
      this.handleQUICMessage(message);
    });

    // Handle connection events
    this.quicTransport.on('connection:established', (peer) => {
      this.emit('peer:connected', peer);
      console.info(`[${this.agentId.id}] Peer connected: ${peer.agentId}`);
    });

    this.quicTransport.on('connection:lost', (peer, reason) => {
      this.emit('peer:disconnected', peer);
      console.warn(`[${this.agentId.id}] Peer disconnected: ${peer.agentId}`, reason);
    });

    // Handle transport errors
    this.quicTransport.on('transport:error', (error: Error) => {
      this.emit('quic:error', error);
      console.error(`[${this.agentId.id}] QUIC transport error:`, error);
    });
  }

  /**
   * Handle incoming QUIC message
   */
  private handleQUICMessage(message: QUICMessage): void {
    console.debug(`[${this.agentId.id}] Received QUIC message from ${message.from}`, {
      type: message.type,
      channel: message.channel
    });

    // Handle response messages
    if (message.type === QUICMessageType.RESPONSE && this.quicTransport) {
      (this.quicTransport as QUICTransport).handleResponse(message);
      return;
    }

    // Emit message event for custom handling
    this.emit('quic:message', message);

    // Can be overridden by subclasses for custom message handling
    this.onQUICMessage(message);
  }

  /**
   * Override this method in subclasses to handle QUIC messages
   */
  protected onQUICMessage(message: QUICMessage): void {
    // Default implementation - subclasses can override
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