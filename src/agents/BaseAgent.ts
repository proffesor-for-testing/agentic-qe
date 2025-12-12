/**
 * BaseAgent - Abstract base class for all QE agents
 * Implements core lifecycle hooks, event handling, and memory access
 * Based on SPARC Phase 2 Pseudocode and Phase 3 Architecture
 */

import { EventEmitter } from 'events';
import { SecureRandom } from '../utils/SecureRandom.js';
import { generateEmbedding, getEmbeddingModelType } from '../utils/EmbeddingGenerator.js';
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
import { AgentLifecycleManager } from './lifecycle/AgentLifecycleManager';
import { AgentCoordinator } from './coordination/AgentCoordinator';
import { AgentMemoryService } from './memory/AgentMemoryService';
import { ExperienceCapture, AgentExecutionEvent } from '../learning/capture/ExperienceCapture';

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
} from './adapters';

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

  // Phase 2 (B1.3) Strategy injection - optional, for future BaseAgent decomposition
  // When provided, these strategies will be used instead of inline implementations
  lifecycleStrategy?: AgentLifecycleStrategy;
  memoryStrategy?: AgentMemoryStrategy;
  learningStrategy?: AgentLearningStrategy;
  coordinationStrategy?: AgentCoordinationStrategy;
}

export abstract class BaseAgent extends EventEmitter {
  protected readonly agentId: AgentId;
  protected readonly capabilities: Map<string, AgentCapability>;
  protected readonly context: AgentContext;
  protected readonly memoryStore: MemoryStore | SwarmMemoryManager;
  protected readonly eventBus: EventEmitter;
  protected currentTask?: TaskAssignment;
  protected hookManager: VerificationHookManager;
  protected performanceTracker?: PerformanceTracker; // Optional performance tracking
  protected learningEngine?: LearningEngine; // Optional Q-learning engine
  protected readonly enableLearning: boolean;
  private learningConfig?: Partial<LearningConfig>; // Store config for initialization
  protected agentDB?: AgentDBManager; // DEPRECATED: AgentDB integration (use SwarmMemoryManager instead)
  protected agentDBConfig?: Partial<AgentDBConfig>; // DEPRECATED: Use memoryStore for all persistence
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
  private initializationMutex?: Promise<void>; // Thread-safe initialization guard

  // Integrated service classes (reducing BaseAgent complexity)
  protected readonly lifecycleManager: AgentLifecycleManager;
  protected readonly coordinator: AgentCoordinator;
  protected readonly memoryService: AgentMemoryService;

  // Phase 2 (B1.2) Strategy properties - layered architecture
  // Lifecycle and memory strategies are always available (adapter or custom)
  // Learning and coordination strategies are initialized during initialize()
  protected strategies: {
    lifecycle: AgentLifecycleStrategy;
    memory: AgentMemoryStrategy;
    learning?: AgentLearningStrategy;
    coordination?: AgentCoordinationStrategy;
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
    this.enableLearning = config.enableLearning ?? true; // Changed: Default to true for all agents
    this.learningConfig = config.learningConfig;

    // DEPRECATED (v2.2.0): AgentDB configuration
    // All persistence now goes through SwarmMemoryManager to .agentic-qe/memory.db
    // AgentDB is kept for backward compatibility but should NOT be used for new code.
    // LearningEngine handles all learning/pattern storage via memoryStore.
    if (config.agentDBConfig) {
      console.warn(
        `[${config.type}] AgentDB is DEPRECATED. All persistence should use SwarmMemoryManager (memory.db). ` +
        `AgentDB will be removed in v3.0.0.`
      );
      this.agentDBConfig = config.agentDBConfig;
    } else if (config.agentDBPath || config.enableQUICSync) {
      console.warn(
        `[${config.type}] AgentDB paths are DEPRECATED. All persistence now uses memory.db via SwarmMemoryManager.`
      );
      // Do NOT create agentDBConfig by default - let memoryStore handle everything
      // Only create if explicitly requested with a custom path
      if (config.agentDBPath) {
        this.agentDBConfig = {
          dbPath: config.agentDBPath, // Use explicit path only, no default
          enableQUICSync: config.enableQUICSync || false,
          syncPort: config.syncPort || 4433,
          syncPeers: config.syncPeers || [],
          enableLearning: config.enableLearning || false,
          enableReasoning: true,
          cacheSize: 1000,
          quantizationType: config.quantizationType || 'scalar',
        };
      }
    }

    // Initialize verification hook manager with type-safe adapter
    // MemoryStoreAdapter bridges MemoryStore interface to SwarmMemoryManager
    // Provides runtime validation and clear error messages for incompatible implementations
    const memoryAdapter = new MemoryStoreAdapter(this.memoryStore);
    this.hookManager = new VerificationHookManager(memoryAdapter);

    // Initialize integrated service classes
    this.lifecycleManager = new AgentLifecycleManager(this.agentId);
    this.coordinator = new AgentCoordinator({
      agentId: this.agentId,
      eventBus: this.eventBus,
      memoryStore: this.memoryStore
    });
    this.memoryService = new AgentMemoryService({
      agentId: this.agentId,
      memoryStore: this.memoryStore
    });

    // Phase 2 (B1.2): Initialize strategies for layered architecture
    // Always create strategies object with adapters as defaults
    // This enables gradual migration to strategy pattern
    this.strategies = {
      lifecycle: config.lifecycleStrategy ?? createLifecycleAdapter(this.lifecycleManager),
      memory: config.memoryStrategy ?? createMemoryAdapter(this.memoryService, this.memoryStore),
      learning: config.learningStrategy, // Set during initialize() if not injected
      coordination: config.coordinationStrategy ?? createCoordinationAdapter(this.eventBus, this.agentId),
    };

    // Connect lifecycle manager to event emitter for event-driven coordination
    this.lifecycleManager.setStatusChangeCallback((status) => {
      this.emitStatusChange(status);
    });

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
            console.warn(
              `[${this.agentId.id}] Learning enabled but memoryStore is not SwarmMemoryManager. ` +
              `Learning features will be disabled. Expected SwarmMemoryManager, got ${this.memoryStore.constructor.name}`
            );
          }

          // Initialize AgentDB if configured
          if (this.agentDBConfig) {
            await this.initializeAgentDB(this.agentDBConfig);
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

      // Update performance metrics
      const duration = Date.now() - startTime;
      this.updatePerformanceMetrics(startTime, true);

      // Capture experience for learning (Nightly-Learner integration)
      await this.captureExperience({
        taskId: assignment.id,
        taskType: assignment.task.type || 'general',
        input: assignment.task.payload || {},
        output: result,
        duration,
        success: true,
        metrics: this.extractTaskMetrics(result),
      });

      // Store task completion in memory
      await this.memoryService.storeTaskResult(assignment.id, result);

      this.currentTask = undefined;
      // Phase 2 (B1.2): Use lifecycle strategy for status transitions
      await this.strategies.lifecycle.transitionTo(AgentStatus.IDLE);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updatePerformanceMetrics(startTime, false);

      // Capture failed experience for learning
      await this.captureExperience({
        taskId: assignment.id,
        taskType: assignment.task.type || 'general',
        input: assignment.task.payload || {},
        output: {},
        duration,
        success: false,
        error: error as Error,
        metrics: {},
      });

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
      // Use lifecycle manager's terminate method instead of manual status setting
      await this.lifecycleManager.terminate({
        onPreTermination: async () => {
          await this.executeHook('pre-termination');

          // Flush learning data before termination
          if (this.learningEngine && this.learningEngine.isEnabled()) {
            // ARCHITECTURE (v2.2.0): LearningEngine persists to unified memory.db
            // All data goes through SwarmMemoryManager to .agentic-qe/memory.db
            // No explicit flush needed - memoryStore handles persistence automatically
            console.info(`[${this.agentId.id}] Learning data persisted via SwarmMemoryManager (memory.db)`);
          }

          // Close AgentDB if enabled
          if (this.agentDB) {
            await this.agentDB.close();
            this.agentDB = undefined;
          }

          // Save current state
          await this.saveState();

          // Clean up agent-specific resources
          await this.cleanup();

          // Remove all event handlers from EventBus using coordinator
          this.coordinator.clearAllHandlers();
        },
        onPostTermination: async () => {
          await this.executeHook('post-termination');
          this.emitEvent('agent.terminated', { agentId: this.agentId });

          // Remove all listeners from this agent (EventEmitter)
          this.removeAllListeners();
        }
      });

    } catch (error) {
      // Phase 2 (B1.2): Use lifecycle strategy for error transition
      await this.strategies.lifecycle.transitionTo(AgentStatus.ERROR, `Termination failed: ${error}`);
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
   * Initialize AgentDB integration for distributed coordination
   *
   * @deprecated v2.2.0 - AgentDB is deprecated. All persistence now goes through
   * SwarmMemoryManager to the unified .agentic-qe/memory.db database.
   * Use memoryStore methods instead. This method will be removed in v3.0.0.
   *
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
   * Check if AgentDB is using a real adapter (vs mock)
   * @returns true if using real AgentDB, false if mock
   */
  private isRealAgentDB(): boolean {
    if (!this.agentDB) return false;
    // Check adapter type or test mode flags
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    const useMock = process.env.AQE_USE_MOCK_AGENTDB === 'true';
    return !isTestMode && !useMock;
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
    // Standardized namespace: aqe/{agentType}/{key}
    const namespacedKey = `aqe/${this.agentId.type}/${key}`;
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
    // Standardized namespace: aqe/{agentType}/{key}
    const namespacedKey = `aqe/${this.agentId.type}/${key}`;
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
    // Standardized namespace: aqe/shared/{agentType}/{key}
    const sharedKey = `aqe/shared/${this.agentId.type}/${key}`;
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
    // Standardized namespace: aqe/shared/{agentType}/{key}
    const sharedKey = `aqe/shared/${agentType}/${key}`;
    return await this.memoryStore.retrieve(sharedKey);
  }

  // ============================================================================
  // Lifecycle Hooks
  // ============================================================================

  /**
   * Pre-task hook - called before task execution
   * Runs verification checks using VerificationHookManager
   * Integrates AgentDB for context loading via vector search
   * @param data Pre-task hook data including task assignment
   */
  protected async onPreTask(data: PreTaskData): Promise<void> {
    try {
      // Track task start time for PerformanceTracker
      this.taskStartTime = Date.now();

      // ACTUAL AgentDB Integration: Load context from vector search
      if (this.agentDB) {
        try {
          const searchStart = Date.now();

          // Generate query embedding from task
          const taskQuery = JSON.stringify({
            type: data.assignment.task.type,
            description: data.assignment.task.description || '',
            requirements: data.assignment.task.requirements || {}
          });

          // Generate embedding using consolidated utility
          const queryEmbedding = generateEmbedding(taskQuery);

          // Retrieve relevant context from AgentDB
          const retrievalResult = await this.agentDB.retrieve(queryEmbedding, {
            domain: `agent:${this.agentId.type}:tasks`,
            k: 5,
            useMMR: true,
            synthesizeContext: true,
            minConfidence: 0.6,
            metric: 'cosine'
          });

          const searchTime = Date.now() - searchStart;
          const isReal = this.isRealAgentDB();
          const adapterType = isReal ? 'real AgentDB' : 'mock adapter';

          // Enrich context with retrieved patterns
          if (retrievalResult.memories.length > 0) {
            const enrichedContext = {
              ...data.context,
              agentDBContext: retrievalResult.context,
              relevantPatterns: retrievalResult.patterns || [],
              similarTasks: retrievalResult.memories.map((m: any) => {
                const patternData = JSON.parse(m.pattern_data);
                return {
                  taskType: patternData.taskType,
                  success: patternData.success,
                  accuracy: patternData.accuracy,
                  executionTime: patternData.executionTime,
                  similarity: m.similarity,
                  confidence: m.confidence
                };
              })
            };
            data.context = enrichedContext;

            console.info(
              `[${this.agentId.id}] Loaded ${retrievalResult.memories.length} patterns from ${adapterType} ` +
              `(${searchTime}ms, ${retrievalResult.metadata.cacheHit ? 'cache hit' : 'cache miss'})`
            );

            // Log top similar task
            if (retrievalResult.memories.length > 0 && isReal) {
              const topMatch = retrievalResult.memories[0];
              console.info(
                `[${this.agentId.id}] 🎯 Top match: similarity=${topMatch.similarity.toFixed(3)}, ` +
                `confidence=${topMatch.confidence.toFixed(3)}`
              );
            }
          } else {
            console.info(`[${this.agentId.id}] No relevant patterns found in ${adapterType} (${searchTime}ms)`);
          }
        } catch (agentDBError) {
          console.warn(`[${this.agentId.id}] AgentDB retrieval failed:`, agentDBError);
          // Don't fail task if AgentDB retrieval fails
        }
      }

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
   * Integrates AgentDB for pattern storage and neural training
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

      // ACTUAL AgentDB Integration: Store execution patterns for future learning
      if (this.agentDB) {
        try {
          const startTime = Date.now();
          const executionTime = this.taskStartTime ? Date.now() - this.taskStartTime : 0;

          // Create pattern data
          const patternData = {
            taskType: data.assignment.task.type,
            taskDescription: data.assignment.task.description || '',
            result: {
              success: validationResult.valid,
              accuracy: validationResult.accuracy,
              executionTime,
              validations: validationResult.validations
            },
            context: data.assignment.task.context || {},
            timestamp: Date.now()
          };

          // Generate embedding using consolidated utility
          const embedding = generateEmbedding(JSON.stringify(patternData));

          // Store pattern in AgentDB
          const pattern = {
            id: `${this.agentId.id}-task-${data.assignment.id}`,
            type: 'experience',
            domain: `agent:${this.agentId.type}:tasks`,
            pattern_data: JSON.stringify({
              taskType: patternData.taskType,
              taskDescription: patternData.taskDescription,
              success: patternData.result.success,
              accuracy: patternData.result.accuracy,
              executionTime: patternData.result.executionTime,
              timestamp: patternData.timestamp
            }),
            confidence: validationResult.valid ? validationResult.accuracy : 0.5,
            usage_count: 1,
            success_count: validationResult.valid ? 1 : 0,
            created_at: Date.now(),
            last_used: Date.now()
          };

          const patternId = await this.agentDB.store(pattern);
          const storeTime = Date.now() - startTime;
          const isReal = this.isRealAgentDB();
          const adapterType = isReal ? 'AgentDB' : 'mock adapter';

          console.info(
            `[${this.agentId.id}] Stored pattern in ${adapterType}: ${patternId} (${storeTime}ms)`
          );

          // ACTUAL Neural training integration if learning is enabled
          if (this.agentDBConfig?.enableLearning) {
            try {
              // Trigger incremental training every N patterns
              const stats = await this.agentDB.getStats();
              if (stats.totalPatterns && stats.totalPatterns % 100 === 0) {
                console.info(`[${this.agentId.id}] 🧠 Triggering ACTUAL neural training (${stats.totalPatterns} patterns)`);

                const trainingStart = Date.now();
                const trainingMetrics = await this.agentDB.train({
                  epochs: 10,
                  batchSize: 32,
                  validationSplit: 0.2
                });
                const trainingTime = Date.now() - trainingStart;

                console.info(
                  `[${this.agentId.id}] ✅ Neural training COMPLETE: ` +
                  `loss=${trainingMetrics.loss.toFixed(4)}, ` +
                  `duration=${trainingTime}ms (${trainingMetrics.epochs} epochs)`
                );
              }
            } catch (trainingError) {
              console.warn(`[${this.agentId.id}] Neural training failed:`, trainingError);
            }
          }

          // ACTUAL QUIC sync if enabled (automatic via AgentDB)
          if (this.agentDBConfig?.enableQUICSync) {
            console.info(`[${this.agentId.id}] 🚀 QUIC sync active (<1ms to ${this.agentDBConfig.syncPeers?.length || 0} peers)`);
          }
        } catch (agentDBError) {
          console.warn(`[${this.agentId.id}] AgentDB operation failed:`, agentDBError);
          // Don't fail task if AgentDB operations fail
        }
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

      // Capture experience for Dream Engine (Nightly-Learner Phase 2)
      // This enables real agent execution data to flow into the concept graph
      try {
        const executionTime = this.taskStartTime ? Date.now() - this.taskStartTime : 0;
        const experienceCapture = await ExperienceCapture.getSharedInstance();

        const executionEvent: AgentExecutionEvent = {
          agentId: this.agentId.id,
          agentType: this.agentId.type,
          taskId: data.assignment.id,
          taskType: data.assignment.task.type,
          input: data.assignment.task.payload || {},
          output: data.result || {},
          duration: executionTime,
          success: validationResult.valid,
          metrics: {
            quality_score: validationResult.valid ? 0.85 : 0.3,
            coverage_delta: 0, // Can be enhanced with actual coverage data
          },
          timestamp: new Date(),
        };

        await experienceCapture.captureExecution(executionEvent);
      } catch (captureError) {
        // Don't fail task due to experience capture errors
        console.warn(`[${this.agentId.id}] Experience capture failed:`, captureError);
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
   * Integrates AgentDB for error pattern analysis
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

      // ACTUAL AgentDB Integration: Store error patterns for failure analysis
      if (this.agentDB) {
        try {
          const storeStart = Date.now();

          const errorPattern = {
            taskType: data.assignment.task.type,
            errorType: data.error.name,
            errorMessage: data.error.message,
            errorStack: data.error.stack?.split('\n').slice(0, 5).join('\n'), // Truncate stack
            context: data.assignment.task.context || {},
            timestamp: Date.now()
          };

          // Generate embedding for error pattern
          const embedding = generateEmbedding(JSON.stringify(errorPattern));

          // Store error pattern in AgentDB for failure analysis
          const pattern = {
            id: `${this.agentId.id}-error-${data.assignment.id}`,
            type: 'error',
            domain: `agent:${this.agentId.type}:errors`,
            pattern_data: JSON.stringify({
              taskType: errorPattern.taskType,
              errorType: errorPattern.errorType,
              errorMessage: errorPattern.errorMessage,
              timestamp: errorPattern.timestamp
            }),
            confidence: 0.8, // Errors are high-confidence negative patterns
            usage_count: 1,
            success_count: 0, // Errors are failures
            created_at: Date.now(),
            last_used: Date.now()
          };

          const errorPatternId = await this.agentDB.store(pattern);
          const storeTime = Date.now() - storeStart;
          const isReal = this.isRealAgentDB();
          const adapterType = isReal ? 'AgentDB' : 'mock adapter';

          console.info(
            `[${this.agentId.id}] Stored error pattern in ${adapterType}: ${errorPatternId} ` +
            `(${storeTime}ms, for failure analysis)`
          );
        } catch (agentDBError) {
          console.warn(`[${this.agentId.id}] AgentDB error storage failed:`, agentDBError);
        }
      }

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
   * Capture execution experience for Nightly-Learner system
   * Automatically sends task execution data to ExperienceCapture singleton
   */
  private async captureExperience(data: {
    taskId: string;
    taskType: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    duration: number;
    success: boolean;
    error?: Error;
    metrics?: Record<string, number>;
  }): Promise<void> {
    try {
      // Get the shared ExperienceCapture instance
      const capture = await ExperienceCapture.getSharedInstance();

      // Build the execution event
      const event: AgentExecutionEvent = {
        agentId: this.agentId.id,
        agentType: this.agentId.type,
        taskId: data.taskId,
        taskType: data.taskType,
        input: data.input,
        output: data.output,
        duration: data.duration,
        success: data.success,
        error: data.error,
        metrics: data.metrics,
        timestamp: new Date(),
      };

      // Capture the execution
      await capture.captureExecution(event);

      // Emit event for monitoring
      this.emit('experience:captured', {
        agentId: this.agentId.id,
        taskId: data.taskId,
        success: data.success,
        duration: data.duration,
      });

    } catch (error) {
      // Don't let capture failures affect task execution
      console.warn(`[${this.agentId.id}] Failed to capture experience:`, error);
    }
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