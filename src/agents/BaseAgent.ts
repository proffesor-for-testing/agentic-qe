/**
 * BaseAgent - Abstract base class for all QE agents
 * Implements core lifecycle hooks, event handling, and memory access
 * Based on SPARC Phase 2 Pseudocode and Phase 3 Architecture
 */

import { EventEmitter } from 'events';
import { SecureRandom } from '../utils/SecureRandom.js';
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
import { AgentDBConfig } from '../core/memory/AgentDBManager';
import { AgentLifecycleManager } from './lifecycle/AgentLifecycleManager';
import { AgentCoordinator } from './coordination/AgentCoordinator';
import { AgentMemoryService } from './memory/AgentMemoryService';

// Strategy interfaces for Phase 2 (B1.3) layered architecture
import type {
  AgentLifecycleStrategy,
  AgentMemoryStrategy,
  AgentLearningStrategy,
  AgentCoordinationStrategy,
} from '../core/strategies';
import {
  createLifecycleAdapter,
  createMemoryAdapter,
  createLearningAdapter,
  createCoordinationAdapter,
  MemoryServiceAdapter,
} from './adapters';

/**
 * Configuration for BaseAgent
 *
 * @remarks
 * IMPORTANT: If `enableLearning` is true (default), `memoryStore` MUST be a
 * `SwarmMemoryManager` instance. Using `MemoryManager` or other implementations
 * will cause learning features to be silently disabled.
 *
 * Issue #137: This was a recurring bug where FleetManager passed MemoryManager
 * instead of SwarmMemoryManager, causing all learning features to be disabled.
 *
 * @see SwarmMemoryManager
 */
export interface BaseAgentConfig {
  id?: string;
  type: AgentType;
  capabilities: AgentCapability[];
  context: AgentContext;
  /**
   * Memory store for agent state and learning
   *
   * @remarks
   * For learning features (Q-learning, pattern recognition, performance tracking),
   * this MUST be a SwarmMemoryManager instance. Using MemoryManager or other
   * basic implementations will disable learning features.
   *
   * At compile time, this accepts any MemoryStore. Runtime validation is done
   * via isSwarmMemoryManager() type guard. Issue #137 added early warning
   * in constructor if learning is enabled but SwarmMemoryManager is not provided.
   *
   * @see SwarmMemoryManager
   * @see isSwarmMemoryManager
   */
  memoryStore: MemoryStore;
  eventBus: EventEmitter;
  /**
   * Enable learning features (Q-learning, pattern recognition, performance tracking)
   *
   * @remarks
   * When true (default), requires memoryStore to be SwarmMemoryManager.
   * A warning is logged if memoryStore doesn't support learning features.
   *
   * @default true
   */
  enableLearning?: boolean;
  learningConfig?: Partial<LearningConfig>;
  /** @deprecated v2.2.0 - Use memoryStore instead */
  agentDBConfig?: Partial<AgentDBConfig>;
  // Strategy injection (B1.3)
  lifecycleStrategy?: AgentLifecycleStrategy;
  memoryStrategy?: AgentMemoryStrategy;
  learningStrategy?: AgentLearningStrategy;
  coordinationStrategy?: AgentCoordinationStrategy;
}

/**
 * Check if a memory store is SwarmMemoryManager
 *
 * @remarks
 * This is a runtime check using instanceof. Use this to verify if learning
 * features are available before attempting to use them.
 *
 * Note: This is NOT a TypeScript type guard because MemoryStore and
 * SwarmMemoryManager have incompatible method signatures. After checking
 * with this function, use a type assertion: `store as SwarmMemoryManager`
 *
 * @example
 * ```typescript
 * if (isSwarmMemoryManager(config.memoryStore)) {
 *   const swarm = config.memoryStore as SwarmMemoryManager;
 *   // Use swarm's learning features
 * }
 * ```
 */
export function isSwarmMemoryManager(store: MemoryStore): boolean {
  return store instanceof SwarmMemoryManager;
}

/**
 * Validate agent config for learning features
 *
 * @remarks
 * Call this early in agent initialization to fail fast with clear error message.
 * This helps developers identify configuration issues immediately rather than
 * discovering disabled learning features at runtime.
 *
 * Issue #137: FleetManager was passing MemoryManager instead of SwarmMemoryManager,
 * causing learning features to be silently disabled for all agents.
 *
 * @param config - Agent configuration to validate
 * @param options - Validation options
 * @param options.throwOnMismatch - If true, throws an error instead of returning warning
 * @returns Validation result with valid flag and optional warning message
 *
 * @example
 * ```typescript
 * // In agent constructor:
 * const validation = validateLearningConfig(config);
 * if (!validation.valid) {
 *   console.warn(validation.warning);
 * }
 * ```
 */
export function validateLearningConfig(
  config: BaseAgentConfig,
  options: { throwOnMismatch?: boolean } = {}
): { valid: boolean; warning?: string } {
  const enableLearning = config.enableLearning ?? true;

  if (enableLearning && !isSwarmMemoryManager(config.memoryStore)) {
    const warning =
      `Learning is enabled but memoryStore is not SwarmMemoryManager. ` +
      `Got ${config.memoryStore.constructor.name}. ` +
      `Learning features (Q-learning, patterns, metrics) will be DISABLED. ` +
      `To fix: Use SwarmMemoryManager or set enableLearning: false.`;

    if (options.throwOnMismatch) {
      throw new Error(warning);
    }

    return { valid: false, warning };
  }

  return { valid: true };
}

export abstract class BaseAgent extends EventEmitter {
  protected readonly agentId: AgentId;
  protected readonly capabilities: Map<string, AgentCapability>;
  protected readonly context: AgentContext;
  protected readonly memoryStore: MemoryStore | SwarmMemoryManager;
  protected readonly eventBus: EventEmitter;
  protected currentTask?: TaskAssignment;
  protected hookManager: VerificationHookManager;
  protected performanceTracker?: PerformanceTracker;
  protected learningEngine?: LearningEngine;
  protected readonly enableLearning: boolean;
  private learningConfig?: Partial<LearningConfig>;
  protected performanceMetrics = { tasksCompleted: 0, averageExecutionTime: 0, errorCount: 0, lastActivity: new Date() };
  private taskStartTime?: number;
  private initializationMutex?: Promise<void>;

  // Service classes
  protected readonly lifecycleManager: AgentLifecycleManager;
  protected readonly coordinator: AgentCoordinator;
  protected readonly memoryService: AgentMemoryService;

  // Strategy properties (B1.2)
  protected strategies: {
    lifecycle: AgentLifecycleStrategy;
    memory: AgentMemoryStrategy;
    learning?: AgentLearningStrategy;
    coordination?: AgentCoordinationStrategy;
  };

  constructor(config: BaseAgentConfig) {
    super();
    this.agentId = { id: config.id || this.generateAgentId(config.type), type: config.type, created: new Date() };
    this.capabilities = new Map(config.capabilities.map(cap => [cap.name, cap]));
    this.context = config.context;
    this.memoryStore = config.memoryStore;
    this.eventBus = config.eventBus;
    this.enableLearning = config.enableLearning ?? true;
    this.learningConfig = config.learningConfig;

    // Early validation: Warn immediately if learning config is invalid
    // Issue #137: Fail-fast pattern to catch configuration issues at construction time
    const validation = validateLearningConfig(config);
    if (!validation.valid && validation.warning) {
      console.warn(`[${this.agentId.id}] CONFIG WARNING: ${validation.warning}`);
    }

    // Initialize service classes
    const memoryAdapter = new MemoryStoreAdapter(this.memoryStore);
    this.hookManager = new VerificationHookManager(memoryAdapter);
    this.lifecycleManager = new AgentLifecycleManager(this.agentId);
    this.coordinator = new AgentCoordinator({ agentId: this.agentId, eventBus: this.eventBus, memoryStore: this.memoryStore });
    this.memoryService = new AgentMemoryService({ agentId: this.agentId, memoryStore: this.memoryStore });

    // Initialize strategies (B1.2)
    this.strategies = {
      lifecycle: config.lifecycleStrategy ?? createLifecycleAdapter(this.lifecycleManager),
      memory: config.memoryStrategy ?? createMemoryAdapter(this.memoryService, this.memoryStore, this.agentId),
      learning: config.learningStrategy,
      coordination: config.coordinationStrategy ?? createCoordinationAdapter(this.eventBus, this.agentId),
    };

    this.lifecycleManager.setStatusChangeCallback((status) => this.emitStatusChange(status));
    this.setupEventHandlers();
    this.setupLifecycleHooks();
  }

  // ============================================================================
  // Public Interface
  // ============================================================================

  /**
   * Initialize the agent - must be called after construction
   * Thread-safe: Multiple concurrent calls will wait for the first to complete
   */
  public async initialize(): Promise<void> {
    // Thread-safety: If initialization is in progress, wait for it
    if (this.initializationMutex) {
      console.info(`[${this.agentId.id}] Initialization already in progress, waiting for completion`);
      await this.initializationMutex;
      // Check if initialization succeeded or failed
      const statusAfterWait = this.lifecycleManager.getStatus();
      if (statusAfterWait === AgentStatus.ERROR) {
        throw new Error(`Initialization failed (status: ${statusAfterWait})`);
      }
      return;
    }

    // Guard: Skip if already initialized (ACTIVE or IDLE)
    const currentStatus = this.lifecycleManager.getStatus();
    if (currentStatus === AgentStatus.ACTIVE || currentStatus === AgentStatus.IDLE) {
      console.warn(`[${this.agentId.id}] Agent already initialized (status: ${currentStatus}), skipping`);
      return;
    }

    // Create initialization mutex - lock acquired
    let resolveMutex: () => void;
    this.initializationMutex = new Promise<void>((resolve) => {
      resolveMutex = resolve;
    });

    try {
      // Guard: Reset from ERROR state before initializing
      if (currentStatus === AgentStatus.ERROR) {
        console.info(`[${this.agentId.id}] Resetting agent from ERROR state before initialization`);
        this.lifecycleManager.reset(false);
      }

      // Delegate lifecycle initialization to lifecycleManager
      await this.lifecycleManager.initialize({
        onPreInitialization: async () => {
          await this.executeHook('pre-initialization');
        },
        onPostInitialization: async () => {
          // Load agent knowledge and state
          await this.loadKnowledge();
          const savedState = await this.memoryService.restoreState();
          if (savedState && savedState.performanceMetrics) {
            this.performanceMetrics = { ...this.performanceMetrics, ...savedState.performanceMetrics };
          }

          // Initialize PerformanceTracker if learning is enabled
          // Issue #137: FleetManager now provides SwarmMemoryManager to enable learning
          if (this.enableLearning && this.memoryStore instanceof SwarmMemoryManager) {
            this.performanceTracker = new PerformanceTracker(
              this.agentId.id,
              this.memoryStore as SwarmMemoryManager
            );
            await this.performanceTracker.initialize();

            // Initialize learning engine for Q-learning
            // ARCHITECTURE (v2.2.0): LearningEngine uses SwarmMemoryManager for ALL persistence
            // All data (experiences, patterns, Q-values) goes to unified .agentic-qe/memory.db
            // No direct database dependency - memoryStore handles all coordination
            this.learningEngine = new LearningEngine(
              this.agentId.id,
              this.memoryStore as SwarmMemoryManager,
              this.learningConfig
            );
            await this.learningEngine.initialize();

            // Phase 2 (B1.2): Create learning strategy adapter
            // Only set if not already injected via config
            if (!this.strategies.learning) {
              this.strategies.learning = createLearningAdapter(this.learningEngine);
            }
          } else if (this.enableLearning && !(this.memoryStore instanceof SwarmMemoryManager)) {
            // Runtime check: Warn if learning is enabled but memoryStore doesn't support it
            // Note: Early warning was already emitted in constructor (Issue #137)
            console.warn(
              `[${this.agentId.id}] Learning enabled but memoryStore is not SwarmMemoryManager. ` +
              `Learning features will be disabled. Expected SwarmMemoryManager, got ${this.memoryStore.constructor.name}`
            );
          }

          // Initialize agent-specific components
          await this.initializeComponents();

          // Execute post-initialization hooks
          await this.executeHook('post-initialization');

          this.coordinator.emitEvent('agent.initialized', { agentId: this.agentId });

          // Report initialization to coordination system
          await this.coordinator.reportStatus('initialized', this.performanceMetrics);
        }
      });

    } catch (error) {
      this.lifecycleManager.markError(`Initialization failed: ${error}`);
      this.coordinator.emitEvent('agent.error', { agentId: this.agentId, error });
      throw error;
    } finally {
      // Release mutex lock - allow future initializations
      resolveMutex!();
      this.initializationMutex = undefined;
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
      // Phase 2 (B1.2): Use lifecycle strategy for status transitions
      await this.strategies.lifecycle.transitionTo(AgentStatus.ACTIVE);

      // Execute pre-task hooks with verification
      const preTaskData: PreTaskData = { assignment };
      await this.onPreTask(preTaskData);
      await this.executeHook('pre-task', preTaskData);

      // Broadcast task start
      await this.coordinator.broadcastMessage('task-start', assignment);

      // Execute the actual task
      const result = await this.performTask(assignment.task);

      // Execute post-task hooks with validation
      const postTaskData: PostTaskData = { assignment, result };
      await this.onPostTask(postTaskData);
      await this.executeHook('post-task', postTaskData);

      // Update performance metrics and store result
      this.updatePerformanceMetrics(startTime, true);
      await this.memoryService.storeTaskResult(assignment.id, result);

      this.currentTask = undefined;
      // Phase 2 (B1.2): Use lifecycle strategy for status transitions
      await this.strategies.lifecycle.transitionTo(AgentStatus.IDLE);

      return result;

    } catch (error) {
      this.updatePerformanceMetrics(startTime, false);
      this.currentTask = undefined;
      // Phase 2 (B1.2): Use lifecycle strategy for error transition
      await this.strategies.lifecycle.transitionTo(AgentStatus.ERROR, `Task execution failed: ${error}`);

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
      await this.lifecycleManager.terminate({
        onPreTermination: async () => {
          await this.executeHook('pre-termination');
          await this.saveState();
          await this.cleanup();
          this.coordinator.clearAllHandlers();
        },
        onPostTermination: async () => {
          await this.executeHook('post-termination');
          this.emitEvent('agent.terminated', { agentId: this.agentId });
          this.removeAllListeners();
        }
      });
    } catch (error) {
      await this.strategies.lifecycle.transitionTo(AgentStatus.ERROR, `Termination failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get agent ID
   */
  public getAgentId(): AgentId {
    return this.agentId;
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
    // Phase 2 (B1.2): Use lifecycle strategy instead of direct manager call
    return {
      agentId: this.agentId,
      status: this.strategies.lifecycle.getStatus(),
      currentTask: this.currentTask?.id,
      capabilities: Array.from(this.capabilities.keys()),
      performanceMetrics: { ...this.performanceMetrics }
    };
  }

  // ============================================================================
  // Event-Driven Coordination (Race Condition Elimination)
  // ============================================================================

  /**
   * Wait for agent to reach a specific status with timeout
   * Replaces: setTimeout(() => { expect(agent.status).toBe('ready') }, 5000)
   * Use: await agent.waitForStatus('ready')
   */
  public async waitForStatus(status: AgentStatus, timeout: number = 10000): Promise<void> {
    // Phase 2 (B1.2): Use lifecycle strategy for status waiting
    // Strategy provides waitForStatus implementation
    if (typeof this.strategies.lifecycle.waitForStatus === 'function') {
      return this.strategies.lifecycle.waitForStatus(status, timeout);
    }

    // Fallback to event-based implementation
    return new Promise((resolve, reject) => {
      // Already at target status
      if (this.strategies.lifecycle.getStatus() === status) {
        return resolve();
      }

      const timer = setTimeout(() => {
        this.removeListener('status-changed', listener);
        reject(new Error(`Agent ${this.agentId.id} did not reach status '${status}' within ${timeout}ms`));
      }, timeout);

      const listener = (newStatus: AgentStatus) => {
        if (newStatus === status) {
          clearTimeout(timer);
          this.removeListener('status-changed', listener);
          resolve();
        }
      };

      this.on('status-changed', listener);
    });
  }

  /**
   * Wait for agent to be ready (initialized and idle)
   * Replaces: await new Promise(resolve => setTimeout(resolve, 5000))
   * Use: await agent.waitForReady()
   */
  public async waitForReady(timeout: number = 10000): Promise<void> {
    // Phase 2 (B1.2): Use lifecycle strategy
    // Strategy provides waitForReady implementation
    if (typeof this.strategies.lifecycle.waitForReady === 'function') {
      return this.strategies.lifecycle.waitForReady(timeout);
    }

    // Fallback to waitForStatus-based implementation
    const currentStatus = this.strategies.lifecycle.getStatus();
    if (currentStatus === AgentStatus.IDLE || currentStatus === AgentStatus.ACTIVE) {
      return; // Already ready
    }
    return this.waitForStatus(AgentStatus.IDLE, timeout);
  }

  /**
   * Wait for a specific event to be emitted
   * Generic event waiter for custom coordination
   */
  public async waitForEvent<T = any>(eventName: string, timeout: number = 10000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener(eventName, listener);
        reject(new Error(`Event '${eventName}' not received within ${timeout}ms`));
      }, timeout);

      const listener = (data: T) => {
        clearTimeout(timer);
        this.removeListener(eventName, listener);
        resolve(data);
      };

      this.once(eventName, listener);
    });
  }

  /**
   * Emit status change events for event-driven coordination
   * Called by lifecycle manager when status changes
   */
  protected emitStatusChange(newStatus: AgentStatus): void {
    this.emit('status-changed', newStatus);
    this.coordinator.emitEvent('agent.status-changed', {
      agentId: this.agentId,
      status: newStatus,
      timestamp: Date.now()
    });
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
   * Get strategies (Phase 2 B1.2)
   * Lifecycle and memory strategies are always available (adapter or custom)
   */
  public getStrategies(): {
    lifecycle: AgentLifecycleStrategy;
    memory: AgentMemoryStrategy;
    learning?: AgentLearningStrategy;
    coordination?: AgentCoordinationStrategy;
  } {
    return this.strategies;
  }

  /**
   * Get the lifecycle strategy
   */
  public getLifecycleStrategy(): AgentLifecycleStrategy {
    return this.strategies.lifecycle;
  }

  /**
   * Get the memory strategy
   */
  public getMemoryStrategy(): AgentMemoryStrategy {
    return this.strategies.memory;
  }

  /**
   * Get the learning strategy (if enabled)
   */
  public getLearningStrategy(): AgentLearningStrategy | undefined {
    return this.strategies.learning;
  }

  /**
   * Get the coordination strategy
   */
  public getCoordinationStrategy(): AgentCoordinationStrategy | undefined {
    return this.strategies.coordination;
  }

  /**
   * Register a new capability dynamically
   */
  protected registerCapability(capability: AgentCapability): void {
    this.capabilities.set(capability.name, capability);
    this.emitEvent('capability.registered', {
      agentId: this.agentId,
      capability: capability.name
    });
  }

  /**
   * Register multiple capabilities at once
   */
  protected registerCapabilities(capabilities: AgentCapability[]): void {
    for (const capability of capabilities) {
      this.registerCapability(capability);
    }
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
  public async getLearnedPatterns() {
    if (!this.learningEngine) return [];
    return await this.learningEngine.getPatterns();
  }

  /**
   * Get learning engine status
   */
  public async getLearningStatus() {
    if (!this.learningEngine) return null;
    const patterns = await this.learningEngine.getPatterns();
    return {
      enabled: this.learningEngine.isEnabled(),
      totalExperiences: this.learningEngine.getTotalExperiences(),
      explorationRate: this.learningEngine.getExplorationRate(),
      patterns: Array.isArray(patterns) ? patterns.length : 0
    };
  }

  /**
   * @deprecated v2.2.0 - AgentDB is deprecated. Use SwarmMemoryManager instead.
   * Stub method for backward compatibility - will be removed in v3.0.0.
   */
  public async initializeAgentDB(_config: Partial<AgentDBConfig>): Promise<void> {
    console.warn(`[${this.agentId.id}] AgentDB is DEPRECATED and will be removed in v3.0.0`);
  }

  /**
   * @deprecated v2.2.0 - Use learning strategy instead.
   */
  public async getAgentDBStatus(): Promise<null> {
    return null;
  }

  /**
   * @deprecated v2.2.0 - Returns false, AgentDB removed.
   */
  public hasAgentDB(): boolean {
    return false;
  }

  /**
   * Start the agent (idempotent - safe to call multiple times)
   */
  public async start(): Promise<void> {
    const currentStatus = this.lifecycleManager.getStatus();

    // If already active or idle, no need to initialize again
    if (currentStatus === AgentStatus.ACTIVE || currentStatus === AgentStatus.IDLE) {
      console.info(`[${this.agentId.id}] Agent already started (status: ${currentStatus})`);
      return;
    }

    // Otherwise, initialize the agent
    await this.initialize();
  }

  /**
   * Stop the agent (alias for terminate)
   * Added for FleetManager compatibility
   */
  public async stop(): Promise<void> {
    await this.terminate();
  }

  /**
   * Assign a task to the agent
   */
  public async assignTask(task: QETask): Promise<void> {
    const assignment: TaskAssignment = {
      id: `task-${Date.now()}-${SecureRandom.generateId(5)}`,
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
    this.coordinator.registerEventHandler(handler);
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
  // Memory Operations (Phase 2 B1.2 - delegated to strategy)
  // ============================================================================

  /**
   * Store data in memory with automatic namespacing
   * Phase 2 (B1.2): Delegates to memory strategy with aqe/{agentType}/{key} namespace
   */
  protected async storeMemory(key: string, value: any, ttl?: number): Promise<void> {
    // Phase 2 (B1.2): Use memory strategy with local namespace
    const memoryStrategy = this.strategies.memory;
    if (memoryStrategy instanceof MemoryServiceAdapter) {
      await memoryStrategy.storeLocal(key, value, ttl);
    } else {
      // Fallback for custom strategies
      await memoryStrategy.store(key, value, { ttl, namespace: this.agentId.type });
    }
  }

  /**
   * Retrieve data from memory
   * Phase 2 (B1.2): Delegates to memory strategy with aqe/{agentType}/{key} namespace
   */
  protected async retrieveMemory(key: string): Promise<any> {
    // Phase 2 (B1.2): Use memory strategy with local namespace
    const memoryStrategy = this.strategies.memory;
    if (memoryStrategy instanceof MemoryServiceAdapter) {
      return await memoryStrategy.retrieveLocal(key);
    } else {
      // Fallback for custom strategies - must handle namespace manually
      return await memoryStrategy.retrieve(`aqe/${this.agentId.type}/${key}`);
    }
  }

  /**
   * Store shared data accessible by other agents
   * Phase 2 (B1.2): Delegates to memory strategy with aqe/shared/{agentType}/{key} namespace
   */
  protected async storeSharedMemory(key: string, value: any, ttl?: number): Promise<void> {
    // Phase 2 (B1.2): Use memory strategy with shared namespace
    const memoryStrategy = this.strategies.memory;
    if (memoryStrategy instanceof MemoryServiceAdapter) {
      await memoryStrategy.storeSharedLocal(key, value, ttl);
    } else {
      // Fallback for custom strategies
      await memoryStrategy.storeShared(this.agentId.type, key, value, { ttl });
    }
  }

  /**
   * Retrieve shared data from other agents
   * Phase 2 (B1.2): Delegates to memory strategy with aqe/shared/{agentType}/{key} namespace
   */
  protected async retrieveSharedMemory(agentType: AgentType, key: string): Promise<any> {
    // Phase 2 (B1.2): Use memory strategy for shared retrieval
    return await this.strategies.memory.retrieveShared(agentType, key);
  }

  // ============================================================================
  // Lifecycle Hooks
  // ============================================================================

  /**
   * Pre-task hook - called before task execution
   * Delegates to lifecycle strategy for pre-task processing
   */
  protected async onPreTask(data: PreTaskData): Promise<void> {
    this.taskStartTime = Date.now();

    // Delegate to lifecycle strategy if available
    if (this.strategies.lifecycle.onPreTask) {
      await this.strategies.lifecycle.onPreTask(data);
    }

    // Run verification checks
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
  }

  /**
   * Post-task hook - called after task execution
   * Delegates to lifecycle and learning strategies
   */
  protected async onPostTask(data: PostTaskData): Promise<void> {
    const executionTime = this.taskStartTime ? Date.now() - this.taskStartTime : 0;

    // Run validation checks
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

    // Delegate to lifecycle strategy
    if (this.strategies.lifecycle.onPostTask) {
      await this.strategies.lifecycle.onPostTask(data);
    }

    // Delegate learning to learning strategy (handles Q-learning, performance tracking)
    if (this.strategies.learning?.recordExecution) {
      await this.strategies.learning.recordExecution({
        task: data.assignment.task,
        result: data.result,
        success: validationResult.valid,
        duration: executionTime,
        metadata: {
          taskId: data.assignment.id,
          accuracy: validationResult.accuracy,
          metrics: this.extractTaskMetrics(data.result)
        }
      });
    }

    this.emitEvent('hook.post-task.completed', {
      agentId: this.agentId,
      result: validationResult
    });
  }

  /**
   * Task error hook - called when task execution fails
   * Delegates to lifecycle and learning strategies
   */
  protected async onTaskError(data: TaskErrorData): Promise<void> {
    const executionTime = this.taskStartTime ? Date.now() - this.taskStartTime : 0;

    // Store error in memory for analysis
    await this.storeMemory(`error:${data.assignment.id}`, {
      error: { message: data.error.message, name: data.error.name },
      assignment: { id: data.assignment.id, taskType: data.assignment.task.type },
      timestamp: new Date(),
      agentId: this.agentId.id
    });

    // Delegate to lifecycle strategy
    if (this.strategies.lifecycle.onTaskError) {
      await this.strategies.lifecycle.onTaskError(data);
    }

    // Delegate error recording to learning strategy
    if (this.strategies.learning?.recordExecution) {
      await this.strategies.learning.recordExecution({
        task: data.assignment.task,
        error: data.error,
        success: false,
        duration: executionTime,
        metadata: {
          taskId: data.assignment.id
        }
      });
    }

    this.emitEvent('hook.task-error.completed', {
      agentId: this.agentId,
      error: data.error
    }, 'high');
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
    // Phase 2 (B1.2): Use lifecycle strategy for error transition
    this.on('error', async (error) => {
      await this.strategies.lifecycle.transitionTo(AgentStatus.ERROR, `Error event: ${error}`);
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

  /**
   * Extract metrics from task result for learning
   * Override in subclasses to provide agent-specific metrics
   */
  protected extractTaskMetrics(result: any): Record<string, number> {
    const metrics: Record<string, number> = {};

    // Extract common metrics if available
    if (result && typeof result === 'object') {
      if (typeof result.coverage === 'number') {
        metrics.coverage = result.coverage;
      }
      if (typeof result.testsGenerated === 'number') {
        metrics.testsGenerated = result.testsGenerated;
      }
      if (typeof result.issuesFound === 'number') {
        metrics.issuesFound = result.issuesFound;
      }
      if (typeof result.confidenceScore === 'number') {
        metrics.confidenceScore = result.confidenceScore;
      }
      if (typeof result.qualityScore === 'number') {
        metrics.qualityScore = result.qualityScore;
      }
    }

    return metrics;
  }

  // State management delegated to memoryService (used in initialize/terminate)
  private async saveState(): Promise<void> {
    await this.memoryService.saveState({
      performanceMetrics: this.performanceMetrics,
      timestamp: new Date()
    });
  }

  private generateAgentId(type: AgentType): string {
    return `${type}-${Date.now()}-${SecureRandom.generateId(5)}`;
  }

  private generateEventId(): string {
    return `event-${Date.now()}-${SecureRandom.generateId(5)}`;
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${SecureRandom.generateId(5)}`;
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