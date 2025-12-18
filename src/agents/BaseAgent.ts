/**
 * BaseAgent - Abstract base class for all QE agents
 * Phase 2 B1.2: Decomposed with strategy pattern (~500 LOC target)
 * Phase 0: LLM Provider integration with RuvLLM support
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
import { AgentDBConfig } from '../core/memory/AgentDBManager';
// Federated Learning (Phase 0 M0.5 - Team-wide pattern sharing)
import {
  FederatedManager,
  FederatedConfig,
  LearnedPattern,
  EphemeralAgent,
} from '../learning/FederatedManager';
import { AgentLifecycleManager } from './lifecycle/AgentLifecycleManager';
import { AgentCoordinator } from './coordination/AgentCoordinator';
import { AgentMemoryService } from './memory/AgentMemoryService';

// LLM Provider imports (Phase 0 - RuvLLM Integration)
import type {
  ILLMProvider,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMEmbeddingOptions,
  LLMEmbeddingResponse,
} from '../providers/ILLMProvider';
import { RuvllmProvider, RuvllmProviderConfig } from '../providers/RuvllmProvider';
import { LLMProviderFactory, LLMProviderFactoryConfig, ProviderType } from '../providers/LLMProviderFactory';
// HybridRouter with RuVector cache (Phase 0.5 - GNN Self-Learning)
import {
  HybridRouter,
  HybridRouterConfig,
  RuVectorCacheConfig,
  RoutingStrategy,
  TaskComplexity,
} from '../providers/HybridRouter';

// Strategy interfaces
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

// Extracted utilities (B1.2)
import {
  isSwarmMemoryManager,
  validateLearningConfig,
  generateAgentId,
  generateEventId,
  generateMessageId,
  generateTaskId,
} from './utils';

// Re-export utilities for backward compatibility
export { isSwarmMemoryManager, validateLearningConfig };

/**
 * LLM configuration for agents
 */
export interface AgentLLMConfig {
  /** Enable LLM capabilities for this agent */
  enabled?: boolean;
  /** Preferred provider type (auto, ruvllm, claude, openrouter, hybrid) */
  preferredProvider?: ProviderType | 'hybrid';
  /** RuvLLM specific configuration */
  ruvllm?: Partial<RuvllmProviderConfig>;
  /** Full factory configuration for advanced setups */
  factoryConfig?: LLMProviderFactoryConfig;
  /** Pre-configured LLM provider instance (for injection) */
  provider?: ILLMProvider;
  /** Enable session management for multi-turn conversations */
  enableSessions?: boolean;
  /** Enable batch processing for parallel requests */
  enableBatch?: boolean;
  /**
   * Enable federated learning for team-wide pattern sharing
   * Phase 0 M0.5 - Reduces Claude Code dependency through collective learning
   */
  enableFederated?: boolean;
  /** Shared FederatedManager instance (for fleet-wide coordination) */
  federatedManager?: FederatedManager;
  /** Federated learning configuration */
  federatedConfig?: Partial<FederatedConfig>;
  /**
   * Enable HybridRouter with RuVector cache (Phase 0.5)
   * Provides GNN-enhanced pattern matching for 150x faster search
   */
  enableHybridRouter?: boolean;
  /** RuVector cache configuration for GNN self-learning */
  ruvectorCache?: Partial<RuVectorCacheConfig>;
  /** HybridRouter configuration */
  hybridRouterConfig?: Partial<HybridRouterConfig>;
}

/**
 * Configuration for BaseAgent
 */
export interface BaseAgentConfig {
  id?: string;
  type: AgentType;
  capabilities?: AgentCapability[];  // Made optional with default []
  context?: AgentContext;
  memoryStore: MemoryStore;
  eventBus?: EventEmitter;
  enableLearning?: boolean;
  learningConfig?: Partial<LearningConfig>;
  /** @deprecated v2.2.0 - Use memoryStore instead */
  agentDBConfig?: Partial<AgentDBConfig>;
  // Strategy injection (B1.3)
  lifecycleStrategy?: AgentLifecycleStrategy;
  memoryStrategy?: AgentMemoryStrategy;
  learningStrategy?: AgentLearningStrategy;
  coordinationStrategy?: AgentCoordinationStrategy;
  // LLM Provider configuration (Phase 0)
  /** LLM configuration - enables agents to make LLM calls via RuvLLM */
  llm?: AgentLLMConfig;
}

export abstract class BaseAgent extends EventEmitter {
  protected readonly agentId: AgentId;
  protected readonly capabilities: Map<string, AgentCapability>;
  protected readonly context?: AgentContext;
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

  // LLM Provider (Phase 0 - RuvLLM Integration)
  protected llmProvider?: ILLMProvider;
  protected llmFactory?: LLMProviderFactory;
  protected readonly llmConfig: AgentLLMConfig;
  private llmSessionId?: string;
  // HybridRouter with RuVector cache (Phase 0.5 - GNN Self-Learning)
  protected hybridRouter?: HybridRouter;

  // Federated Learning (Phase 0 M0.5 - Team-wide pattern sharing)
  protected federatedManager?: FederatedManager;
  protected ephemeralAgent?: EphemeralAgent;
  private federatedInitialized: boolean = false;

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
    this.agentId = { id: config.id || generateAgentId(config.type), type: config.type, created: new Date() };
    this.capabilities = new Map((config.capabilities || []).map(cap => [cap.name, cap]));
    this.context = config.context;
    this.memoryStore = config.memoryStore;
    this.eventBus = config.eventBus || new EventEmitter();
    this.enableLearning = config.enableLearning ?? true;
    this.learningConfig = config.learningConfig;

    // LLM configuration (Phase 0 - default enabled with RuvLLM)
    this.llmConfig = config.llm ?? { enabled: true, preferredProvider: 'ruvllm' };

    // Early validation (Issue #137)
    const validation = validateLearningConfig(config);
    if (!validation.valid && validation.warning) {
      console.warn(`[${this.agentId.id}] CONFIG WARNING: ${validation.warning}`);
    }

    // Initialize services
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

  // === Public Interface ===

  public async initialize(): Promise<void> {
    if (this.initializationMutex) {
      await this.initializationMutex;
      if (this.lifecycleManager.getStatus() === AgentStatus.ERROR) {
        throw new Error(`Initialization failed`);
      }
      return;
    }

    const currentStatus = this.lifecycleManager.getStatus();
    if (currentStatus === AgentStatus.ACTIVE || currentStatus === AgentStatus.IDLE) return;

    let resolveMutex: () => void;
    this.initializationMutex = new Promise<void>((resolve) => { resolveMutex = resolve; });

    try {
      if (currentStatus === AgentStatus.ERROR) this.lifecycleManager.reset(false);

      await this.lifecycleManager.initialize({
        onPreInitialization: () => this.executeHook('pre-initialization'),
        onPostInitialization: async () => {
          await this.loadKnowledge();
          const savedState = await this.memoryService.restoreState();
          if (savedState?.performanceMetrics) {
            this.performanceMetrics = { ...this.performanceMetrics, ...savedState.performanceMetrics };
          }

          // Initialize learning if SwarmMemoryManager
          if (this.enableLearning && this.memoryStore instanceof SwarmMemoryManager) {
            this.performanceTracker = new PerformanceTracker(this.agentId.id, this.memoryStore);
            await this.performanceTracker.initialize();
            this.learningEngine = new LearningEngine(this.agentId.id, this.memoryStore, this.learningConfig);
            await this.learningEngine.initialize();
            if (!this.strategies.learning) {
              this.strategies.learning = createLearningAdapter(this.learningEngine);
            }
          } else if (this.enableLearning) {
            console.warn(`[${this.agentId.id}] Learning disabled: memoryStore is ${this.memoryStore.constructor.name}`);
          }

          // Initialize LLM Provider (Phase 0 - RuvLLM Integration)
          await this.initializeLLMProvider();

          // Initialize Federated Learning (Phase 0 M0.5)
          await this.initializeFederatedLearning();

          await this.initializeComponents();
          await this.executeHook('post-initialization');
          this.coordinator.emitEvent('agent.initialized', { agentId: this.agentId });
          await this.coordinator.reportStatus('initialized', this.performanceMetrics);
        }
      });
    } catch (error) {
      this.lifecycleManager.markError(`Initialization failed: ${error}`);
      this.coordinator.emitEvent('agent.error', { agentId: this.agentId, error });
      throw error;
    } finally {
      resolveMutex!();
      this.initializationMutex = undefined;
    }
  }

  public async executeTask(assignment: TaskAssignment): Promise<any> {
    const startTime = Date.now();
    try {
      this.validateTaskAssignment(assignment);
      this.currentTask = assignment;
      await this.strategies.lifecycle.transitionTo(AgentStatus.ACTIVE);

      const preTaskData: PreTaskData = { assignment };
      await this.onPreTask(preTaskData);
      await this.executeHook('pre-task', preTaskData);
      await this.coordinator.broadcastMessage('task-start', assignment);

      const result = await this.performTask(assignment.task);

      const postTaskData: PostTaskData = { assignment, result };
      await this.onPostTask(postTaskData);
      await this.executeHook('post-task', postTaskData);

      this.updatePerformanceMetrics(startTime, true);
      await this.memoryService.storeTaskResult(assignment.id, result);
      this.currentTask = undefined;
      await this.strategies.lifecycle.transitionTo(AgentStatus.IDLE);
      return result;
    } catch (error) {
      this.updatePerformanceMetrics(startTime, false);
      this.currentTask = undefined;
      await this.strategies.lifecycle.transitionTo(AgentStatus.ERROR, `Task failed: ${error}`);
      await this.onTaskError({ assignment, error: error as Error });
      await this.executeHook('task-error', { assignment, error });
      throw error;
    }
  }

  public async terminate(): Promise<void> {
    try {
      await this.lifecycleManager.terminate({
        onPreTermination: async () => {
          await this.executeHook('pre-termination');
          await this.saveState();
          await this.cleanup();
          await this.cleanupLLM(); // Phase 0: Cleanup LLM resources
          await this.cleanupFederated(); // Phase 0 M0.5: Cleanup federated learning
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

  // === Getters ===

  public getAgentId(): AgentId { return this.agentId; }

  public getStatus() {
    return {
      agentId: this.agentId,
      status: this.strategies.lifecycle.getStatus(),
      currentTask: this.currentTask?.id,
      capabilities: Array.from(this.capabilities.keys()),
      performanceMetrics: { ...this.performanceMetrics }
    };
  }

  public hasCapability(name: string): boolean { return this.capabilities.has(name); }
  public getCapability(name: string): AgentCapability | undefined { return this.capabilities.get(name); }
  public getCapabilities(): AgentCapability[] { return Array.from(this.capabilities.values()); }
  public getStrategies() { return this.strategies; }
  public getLifecycleStrategy(): AgentLifecycleStrategy { return this.strategies.lifecycle; }
  public getMemoryStrategy(): AgentMemoryStrategy { return this.strategies.memory; }
  public getLearningStrategy(): AgentLearningStrategy | undefined { return this.strategies.learning; }
  public getCoordinationStrategy(): AgentCoordinationStrategy | undefined { return this.strategies.coordination; }

  // === Event-Driven Coordination ===

  public async waitForStatus(status: AgentStatus, timeout = 10000): Promise<void> {
    if (typeof this.strategies.lifecycle.waitForStatus === 'function') {
      return this.strategies.lifecycle.waitForStatus(status, timeout);
    }
    return new Promise((resolve, reject) => {
      if (this.strategies.lifecycle.getStatus() === status) return resolve();
      const timer = setTimeout(() => {
        this.removeListener('status-changed', listener);
        reject(new Error(`Agent did not reach status '${status}' within ${timeout}ms`));
      }, timeout);
      const listener = (newStatus: AgentStatus) => {
        if (newStatus === status) { clearTimeout(timer); this.removeListener('status-changed', listener); resolve(); }
      };
      this.on('status-changed', listener);
    });
  }

  public async waitForReady(timeout = 10000): Promise<void> {
    if (typeof this.strategies.lifecycle.waitForReady === 'function') {
      return this.strategies.lifecycle.waitForReady(timeout);
    }
    const status = this.strategies.lifecycle.getStatus();
    if (status === AgentStatus.IDLE || status === AgentStatus.ACTIVE) return;
    return this.waitForStatus(AgentStatus.IDLE, timeout);
  }

  public async waitForEvent<T = any>(eventName: string, timeout = 10000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener(eventName, listener);
        reject(new Error(`Event '${eventName}' not received within ${timeout}ms`));
      }, timeout);
      const listener = (data: T) => { clearTimeout(timer); this.removeListener(eventName, listener); resolve(data); };
      this.once(eventName, listener);
    });
  }

  // === Learning Interface ===

  public async recommendStrategy(taskState: any): Promise<StrategyRecommendation | null> {
    if (!this.learningEngine?.isEnabled()) return null;
    try { return await this.learningEngine.recommendStrategy(taskState); }
    catch { return null; }
  }

  public async getLearnedPatterns() {
    if (!this.learningEngine) return [];
    return await this.learningEngine.getPatterns();
  }

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

  // === Start/Stop (FleetManager compatibility) ===

  public async start(): Promise<void> {
    const status = this.lifecycleManager.getStatus();
    if (status === AgentStatus.ACTIVE || status === AgentStatus.IDLE) return;
    await this.initialize();
  }

  public async stop(): Promise<void> { await this.terminate(); }

  public async assignTask(task: QETask): Promise<void> {
    const assignment: TaskAssignment = {
      id: generateTaskId(),
      task,
      agentId: this.agentId.id,
      assignedAt: new Date(),
      status: 'assigned'
    };
    await this.executeTask(assignment);
  }

  // === Deprecated (Remove in v3.0.0) ===

  /** @deprecated v2.2.0 - AgentDB removed. Use SwarmMemoryManager. */
  public async initializeAgentDB(_config: Partial<AgentDBConfig>): Promise<void> {
    console.warn(`[${this.agentId.id}] AgentDB is DEPRECATED`);
  }
  /** @deprecated v2.2.0 */
  public async getAgentDBStatus(): Promise<null> { return null; }
  /** @deprecated v2.2.0 */
  public hasAgentDB(): boolean { return false; }

  // === Abstract Methods ===

  protected abstract initializeComponents(): Promise<void>;
  protected abstract performTask(task: QETask): Promise<any>;
  protected abstract loadKnowledge(): Promise<void>;
  protected abstract cleanup(): Promise<void>;

  // === Protected Methods ===

  protected registerCapability(capability: AgentCapability): void {
    this.capabilities.set(capability.name, capability);
    this.emitEvent('capability.registered', { agentId: this.agentId, capability: capability.name });
  }

  protected registerCapabilities(capabilities: AgentCapability[]): void {
    capabilities.forEach(cap => this.registerCapability(cap));
  }

  protected registerEventHandler<T = any>(handler: EventHandler<T>): void {
    this.coordinator.registerEventHandler(handler);
  }

  protected emitEvent(type: string, data: any, priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'): void {
    const event: QEEvent = {
      id: generateEventId(), type, source: this.agentId, data,
      timestamp: new Date(), priority, scope: 'global'
    };
    this.eventBus.emit(type, event);
  }

  protected emitStatusChange(newStatus: AgentStatus): void {
    this.emit('status-changed', newStatus);
    this.coordinator.emitEvent('agent.status-changed', { agentId: this.agentId, status: newStatus, timestamp: Date.now() });
  }

  protected async broadcastMessage(type: string, payload: any): Promise<void> {
    const message: AgentMessage = {
      id: generateMessageId(), from: this.agentId,
      to: { id: 'broadcast', type: 'all' as AgentType, created: new Date() },
      type: type as MessageType, payload, timestamp: new Date(), priority: 'medium'
    };
    this.eventBus.emit('agent.message', message);
  }

  // === Memory Operations (delegated to strategy) ===

  protected async storeMemory(key: string, value: any, ttl?: number): Promise<void> {
    const strategy = this.strategies.memory;
    if (strategy instanceof MemoryServiceAdapter) {
      await strategy.storeLocal(key, value, ttl);
    } else {
      await strategy.store(key, value, { ttl, namespace: this.agentId.type });
    }
  }

  protected async retrieveMemory(key: string): Promise<any> {
    const strategy = this.strategies.memory;
    if (strategy instanceof MemoryServiceAdapter) {
      return await strategy.retrieveLocal(key);
    }
    return await strategy.retrieve(`aqe/${this.agentId.type}/${key}`);
  }

  protected async storeSharedMemory(key: string, value: any, ttl?: number): Promise<void> {
    const strategy = this.strategies.memory;
    if (strategy instanceof MemoryServiceAdapter) {
      await strategy.storeSharedLocal(key, value, ttl);
    } else {
      await strategy.storeShared(this.agentId.type, key, value, { ttl });
    }
  }

  protected async retrieveSharedMemory(agentType: AgentType, key: string): Promise<any> {
    return await this.strategies.memory.retrieveShared(agentType, key);
  }

  // === Lifecycle Hooks ===

  protected async onPreTask(data: PreTaskData): Promise<void> {
    this.taskStartTime = Date.now();
    if (this.strategies.lifecycle.onPreTask) await this.strategies.lifecycle.onPreTask(data);

    const result = await this.hookManager.executePreTaskVerification({ task: data.assignment.task.type, context: data.context });
    if (!result.passed) {
      throw new Error(`Pre-task verification failed: score ${result.score}`);
    }
    this.emitEvent('hook.pre-task.completed', { agentId: this.agentId, result });
  }

  protected async onPostTask(data: PostTaskData): Promise<void> {
    const executionTime = this.taskStartTime ? Date.now() - this.taskStartTime : 0;
    const result = await this.hookManager.executePostTaskValidation({ task: data.assignment.task.type, result: data.result });

    if (!result.valid) {
      console.warn(`Post-task validation warning: accuracy ${result.accuracy}`);
    }

    if (this.strategies.lifecycle.onPostTask) await this.strategies.lifecycle.onPostTask(data);

    if (this.strategies.learning?.recordExecution) {
      await this.strategies.learning.recordExecution({
        task: data.assignment.task, result: data.result, success: result.valid,
        duration: executionTime, metadata: { taskId: data.assignment.id, accuracy: result.accuracy, metrics: this.extractTaskMetrics(data.result) }
      });
    }

    // Share successful patterns with team via federated learning (Phase 0 M0.5)
    if (result.valid && this.federatedInitialized && this.llmProvider) {
      try {
        // Generate embedding for the task pattern
        const taskDescription = `${data.assignment.task.type}: ${JSON.stringify(data.assignment.task.payload || {}).slice(0, 200)}`;
        const embedding = await this.llmEmbed(taskDescription);

        await this.shareLearnedPattern({
          embedding,
          quality: result.accuracy ?? 0.8,
          category: data.assignment.task.type,
        });
      } catch {
        // Pattern sharing failed - non-critical, continue
      }
    }

    this.emitEvent('hook.post-task.completed', { agentId: this.agentId, result });
  }

  protected async onTaskError(data: TaskErrorData): Promise<void> {
    const executionTime = this.taskStartTime ? Date.now() - this.taskStartTime : 0;
    await this.storeMemory(`error:${data.assignment.id}`, {
      error: { message: data.error.message, name: data.error.name },
      assignment: { id: data.assignment.id, taskType: data.assignment.task?.type ?? 'unknown' },
      timestamp: new Date(), agentId: this.agentId.id
    });

    if (this.strategies.lifecycle.onTaskError) await this.strategies.lifecycle.onTaskError(data);

    if (this.strategies.learning?.recordExecution && data.assignment.task) {
      await this.strategies.learning.recordExecution({
        task: data.assignment.task, error: data.error, success: false,
        duration: executionTime, metadata: { taskId: data.assignment.id }
      });
    }
    this.emitEvent('hook.task-error.completed', { agentId: this.agentId, error: data.error }, 'high');
  }

  // === Private Helpers ===

  private async executeHook(hookName: string, data?: any): Promise<void> {
    try {
      const method = `on${hookName.charAt(0).toUpperCase()}${hookName.slice(1).replace(/-/g, '')}`;
      if (typeof (this as any)[method] === 'function') await (this as any)[method](data);
    } catch (error) {
      // Use warn - hooks are optional and failures shouldn't break agent operation
      console.warn(`Hook ${hookName} failed:`, error);
    }
  }

  private setupEventHandlers(): void {
    this.registerEventHandler({ eventType: 'fleet.shutdown', handler: async () => { await this.terminate(); } });
    this.registerEventHandler({
      eventType: 'agent.ping',
      handler: async (event: QEEvent) => {
        if (event.target?.id === this.agentId.id) this.emitEvent('agent.pong', { agentId: this.agentId });
      }
    });
  }

  private setupLifecycleHooks(): void {
    this.on('error', async (error) => {
      await this.strategies.lifecycle.transitionTo(AgentStatus.ERROR, `Error: ${error}`);
      this.emitEvent('agent.error', { agentId: this.agentId, error });
    });
  }

  private validateTaskAssignment(assignment: TaskAssignment): void {
    if (!assignment?.task) throw new Error('Invalid task assignment');
    const required = assignment.task.requirements?.capabilities || [];
    for (const cap of required) {
      if (!this.hasCapability(cap)) throw new Error(`Missing capability: ${cap}`);
    }
  }

  private updatePerformanceMetrics(startTime: number, success: boolean): void {
    const time = Date.now() - startTime;
    if (success) {
      this.performanceMetrics.tasksCompleted++;
      this.performanceMetrics.averageExecutionTime =
        (this.performanceMetrics.averageExecutionTime * (this.performanceMetrics.tasksCompleted - 1) + time) /
        this.performanceMetrics.tasksCompleted;
    } else {
      this.performanceMetrics.errorCount++;
    }
    this.performanceMetrics.lastActivity = new Date();
  }

  protected extractTaskMetrics(result: any): Record<string, number> {
    const metrics: Record<string, number> = {};
    if (result && typeof result === 'object') {
      ['coverage', 'testsGenerated', 'issuesFound', 'confidenceScore', 'qualityScore'].forEach(key => {
        if (typeof result[key] === 'number') metrics[key] = result[key];
      });
    }
    return metrics;
  }

  private async saveState(): Promise<void> {
    await this.memoryService.saveState({ performanceMetrics: this.performanceMetrics, timestamp: new Date() });
  }

  // ============================================
  // LLM Provider Methods (Phase 0 - RuvLLM Integration)
  // ============================================

  /**
   * Initialize LLM provider for agent use
   * Supports RuvLLM (local), Claude, OpenRouter, and HybridRouter with RuVector cache
   */
  private async initializeLLMProvider(): Promise<void> {
    if (!this.llmConfig.enabled) {
      console.log(`[${this.agentId.id}] LLM disabled by configuration`);
      return;
    }

    try {
      // If a provider was injected, use it directly
      if (this.llmConfig.provider) {
        this.llmProvider = this.llmConfig.provider;
        console.log(`[${this.agentId.id}] Using injected LLM provider`);
        return;
      }

      // Phase 0.5: Create HybridRouter with RuVector GNN cache for intelligent routing
      if (this.llmConfig.enableHybridRouter || this.llmConfig.preferredProvider === 'hybrid') {
        const hybridConfig: HybridRouterConfig = {
          // RuVector cache configuration (GNN self-learning)
          ruvector: {
            enabled: true,
            baseUrl: this.llmConfig.ruvectorCache?.baseUrl || 'http://localhost:8080',
            cacheThreshold: this.llmConfig.ruvectorCache?.cacheThreshold ?? 0.85,
            learningEnabled: this.llmConfig.ruvectorCache?.learningEnabled ?? true,
            loraRank: this.llmConfig.ruvectorCache?.loraRank ?? 8,
            ewcEnabled: this.llmConfig.ruvectorCache?.ewcEnabled ?? true,
            ...this.llmConfig.ruvectorCache,
          },
          // Local LLM via ruvllm
          ruvllm: {
            name: `${this.agentId.id}-ruvllm`,
            enableSessions: this.llmConfig.enableSessions ?? true,
            enableTRM: true,
            enableSONA: true,
            ...this.llmConfig.ruvllm,
          },
          // Routing strategy
          defaultStrategy: this.llmConfig.hybridRouterConfig?.defaultStrategy || RoutingStrategy.BALANCED,
          ...this.llmConfig.hybridRouterConfig,
        };

        this.hybridRouter = new HybridRouter(hybridConfig);
        await this.hybridRouter.initialize();
        this.llmProvider = this.hybridRouter;

        console.log(`[${this.agentId.id}] HybridRouter initialized with RuVector GNN cache`);
        return;
      }

      // Create RuvLLM provider directly (preferred for local inference)
      if (this.llmConfig.preferredProvider === 'ruvllm' || !this.llmConfig.preferredProvider) {
        const ruvllmConfig: RuvllmProviderConfig = {
          name: `${this.agentId.id}-ruvllm`,
          enableSessions: this.llmConfig.enableSessions ?? true,
          enableTRM: true,
          enableSONA: true,
          debug: false,
          ...this.llmConfig.ruvllm
        };

        this.llmProvider = new RuvllmProvider(ruvllmConfig);
        await this.llmProvider.initialize();

        // Create session for this agent if sessions enabled
        if (this.llmConfig.enableSessions) {
          const ruvllm = this.llmProvider as RuvllmProvider;
          const session = ruvllm.createSession();
          this.llmSessionId = session.id;
          console.log(`[${this.agentId.id}] LLM session created: ${this.llmSessionId}`);
        }

        console.log(`[${this.agentId.id}] RuvLLM provider initialized`);
        return;
      }

      // Use factory for other providers (Claude, OpenRouter)
      this.llmFactory = new LLMProviderFactory(this.llmConfig.factoryConfig || {});
      await this.llmFactory.initialize();
      this.llmProvider = this.llmFactory.getProvider(this.llmConfig.preferredProvider as ProviderType);

      if (!this.llmProvider) {
        console.warn(`[${this.agentId.id}] Preferred provider ${this.llmConfig.preferredProvider} not available, trying auto-select`);
        this.llmProvider = this.llmFactory.selectBestProvider();
      }

      if (this.llmProvider) {
        console.log(`[${this.agentId.id}] LLM provider initialized: ${this.llmConfig.preferredProvider}`);
      } else {
        console.warn(`[${this.agentId.id}] No LLM provider available`);
      }
    } catch (error) {
      // Use warn instead of error - this is expected fallback behavior, not a failure
      console.warn(`[${this.agentId.id}] LLM initialization failed:`, (error as Error).message);
      // Don't throw - agent can still work without LLM (algorithmic fallback)
    }
  }

  /**
   * Initialize Federated Learning for team-wide pattern sharing
   * Phase 0 M0.5 - Reduces Claude Code dependency through collective learning
   */
  private async initializeFederatedLearning(): Promise<void> {
    if (!this.llmConfig.enableFederated) {
      return;
    }

    try {
      // Use shared FederatedManager or create new one
      if (this.llmConfig.federatedManager) {
        this.federatedManager = this.llmConfig.federatedManager;
      } else {
        this.federatedManager = new FederatedManager(this.llmConfig.federatedConfig);
        await this.federatedManager.initialize();
      }

      // Register this agent for federated learning
      this.ephemeralAgent = this.federatedManager.registerAgent(this.agentId.id);
      this.federatedInitialized = true;

      console.log(`[${this.agentId.id}] Federated learning initialized`);

      // Sync with existing team knowledge on startup
      try {
        await this.federatedManager.syncFromTeam(this.agentId.id);
        console.log(`[${this.agentId.id}] Synced with team knowledge`);
      } catch {
        // First agent or no prior knowledge - expected
      }
    } catch (error) {
      // Use warn instead of error - this is expected fallback behavior
      console.warn(`[${this.agentId.id}] Federated learning initialization failed:`, (error as Error).message);
      // Don't throw - agent can work without federated learning
    }
  }

  /**
   * Check if federated learning is available
   */
  public hasFederatedLearning(): boolean {
    return this.federatedInitialized && this.federatedManager !== undefined;
  }

  /**
   * Share a learned pattern with the team via federated learning
   * Call this when the agent learns something useful (e.g., after successful task)
   *
   * @param pattern - The pattern to share (embedding, quality score, category)
   */
  protected async shareLearnedPattern(pattern: Omit<LearnedPattern, 'id' | 'sourceAgent' | 'timestamp'>): Promise<void> {
    if (!this.federatedManager || !this.federatedInitialized) {
      return;
    }

    const fullPattern: LearnedPattern = {
      ...pattern,
      id: `pattern-${this.agentId.id}-${Date.now()}`,
      sourceAgent: this.agentId.id,
      timestamp: Date.now(),
    };

    await this.federatedManager.sharePattern(this.agentId.id, fullPattern);
  }

  /**
   * Sync this agent with team-wide learned knowledge
   * Call this periodically or before complex tasks
   */
  protected async syncWithTeam(): Promise<void> {
    if (!this.federatedManager || !this.federatedInitialized) {
      return;
    }

    await this.federatedManager.syncFromTeam(this.agentId.id);
  }

  /**
   * Submit this agent's learning updates to the team
   * Call after completing a batch of tasks
   */
  protected async submitLearningUpdate(): Promise<void> {
    if (!this.federatedManager || !this.federatedInitialized) {
      return;
    }

    await this.federatedManager.submitAgentUpdate(this.agentId.id);
  }

  /**
   * Get federated learning metrics
   */
  public getFederatedMetrics(): ReturnType<FederatedManager['getMetrics']> | null {
    if (!this.federatedManager) {
      return null;
    }
    return this.federatedManager.getMetrics();
  }

  /**
   * Check if LLM is available for this agent
   */
  public hasLLM(): boolean {
    return this.llmProvider !== undefined;
  }

  /**
   * Get LLM provider (for advanced usage)
   */
  public getLLMProvider(): ILLMProvider | undefined {
    return this.llmProvider;
  }

  /**
   * Make an LLM completion call
   * Uses RuvLLM's session management for 50% latency reduction on multi-turn
   *
   * @param prompt - The prompt to send to the LLM
   * @param options - Additional completion options
   * @returns The LLM response text
   * @throws Error if LLM is not available
   */
  protected async llmComplete(prompt: string, options?: Partial<LLMCompletionOptions>): Promise<string> {
    if (!this.llmProvider) {
      throw new Error(`[${this.agentId.id}] LLM not available - initialize agent first`);
    }

    const completionOptions: LLMCompletionOptions = {
      model: options?.model || this.llmConfig.ruvllm?.defaultModel || 'llama-3.2-3b-instruct',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      stream: options?.stream,
      metadata: {
        ...options?.metadata,
        sessionId: this.llmSessionId, // Use session for faster multi-turn
        agentId: this.agentId.id,
        agentType: this.agentId.type
      }
    };

    const response = await this.llmProvider.complete(completionOptions);

    // Extract text from response
    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return text;
  }

  /**
   * Make a batch LLM completion call (4x throughput)
   * Uses RuvLLM's native batch API for parallel processing
   *
   * @param prompts - Array of prompts to process in parallel
   * @param options - Shared completion options
   * @returns Array of response texts in same order as prompts
   */
  protected async llmBatchComplete(prompts: string[], options?: Partial<LLMCompletionOptions>): Promise<string[]> {
    if (!this.llmProvider) {
      throw new Error(`[${this.agentId.id}] LLM not available - initialize agent first`);
    }

    // Check if provider supports batch (RuvLLM does)
    const ruvllm = this.llmProvider as RuvllmProvider;
    if (typeof ruvllm.batchComplete === 'function') {
      const defaultModel = options?.model || this.llmConfig.ruvllm?.defaultModel || 'llama-3.2-3b-instruct';
      const requests: LLMCompletionOptions[] = prompts.map(prompt => ({
        model: defaultModel,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
        metadata: {
          ...options?.metadata,
          agentId: this.agentId.id,
          agentType: this.agentId.type
        }
      }));

      const responses = await ruvllm.batchComplete(requests);

      return responses.map(response =>
        response.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n')
      );
    }

    // Fallback: sequential processing for non-batch providers
    console.warn(`[${this.agentId.id}] Provider doesn't support batch, using sequential`);
    const results: string[] = [];
    for (const prompt of prompts) {
      results.push(await this.llmComplete(prompt, options));
    }
    return results;
  }

  /**
   * Generate embeddings for text
   * Uses RuvLLM's SIMD-optimized embedding generation
   *
   * @param text - Text to embed
   * @returns Embedding vector
   */
  protected async llmEmbed(text: string): Promise<number[]> {
    if (!this.llmProvider) {
      throw new Error(`[${this.agentId.id}] LLM not available - initialize agent first`);
    }

    const response = await this.llmProvider.embed({ text });
    return response.embedding || [];
  }

  /**
   * Chat within agent's session (50% faster for multi-turn)
   * Only works with RuvLLM provider with sessions enabled
   *
   * @param input - User input to chat
   * @returns Assistant response
   */
  protected async llmChat(input: string): Promise<string> {
    if (!this.llmProvider) {
      throw new Error(`[${this.agentId.id}] LLM not available`);
    }

    if (!this.llmSessionId) {
      // Fallback to regular complete if no session
      return this.llmComplete(input);
    }

    const ruvllm = this.llmProvider as RuvllmProvider;
    if (typeof ruvllm.sessionChat === 'function') {
      return ruvllm.sessionChat(this.llmSessionId, input);
    }

    // Fallback
    return this.llmComplete(input);
  }

  /**
   * Get routing decision for observability
   * Shows which model was selected and why
   */
  protected getLLMRoutingDecision(input: string): any {
    if (!this.llmProvider) {
      return null;
    }

    const ruvllm = this.llmProvider as RuvllmProvider;
    if (typeof ruvllm.getRoutingDecision === 'function') {
      return ruvllm.getRoutingDecision(input);
    }

    return null;
  }

  /**
   * Get LLM usage statistics for this agent
   */
  public getLLMStats(): { available: boolean; sessionId?: string; provider?: string; hasRuVectorCache?: boolean } {
    return {
      available: this.hasLLM(),
      sessionId: this.llmSessionId,
      provider: this.hybridRouter ? 'hybrid' : (this.llmProvider ? 'ruvllm' : undefined),
      hasRuVectorCache: this.hasRuVectorCache(),
    };
  }

  // ============================================
  // RuVector Cache Methods (Phase 0.5 - GNN Self-Learning)
  // ============================================

  /**
   * Check if RuVector GNN cache is available
   */
  public hasRuVectorCache(): boolean {
    return this.hybridRouter !== undefined;
  }

  /**
   * Get RuVector cache metrics
   * Returns cache hit rate, pattern count, and learning metrics
   */
  public async getRuVectorMetrics(): Promise<{
    enabled: boolean;
    healthy: boolean;
    cacheHitRate: number;
    patternCount: number;
    loraUpdates: number;
    memoryUsageMB?: number;
  } | null> {
    if (!this.hybridRouter) {
      return null;
    }

    try {
      return await this.hybridRouter.getRuVectorMetrics();
    } catch {
      return null;
    }
  }

  /**
   * Get cache hit rate for this agent's requests
   */
  public getCacheHitRate(): number {
    if (!this.hybridRouter) {
      return 0;
    }
    return this.hybridRouter.getCacheHitRate();
  }

  /**
   * Get routing statistics including cache savings
   */
  public getRoutingStats(): {
    totalDecisions: number;
    localDecisions: number;
    cloudDecisions: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    averageLocalLatency: number;
    averageCloudLatency: number;
    successRate: number;
  } {
    if (!this.hybridRouter) {
      return {
        totalDecisions: 0,
        localDecisions: 0,
        cloudDecisions: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheHitRate: 0,
        averageLocalLatency: 0,
        averageCloudLatency: 0,
        successRate: 0,
      };
    }
    return this.hybridRouter.getRoutingStats();
  }

  /**
   * Force learning consolidation in the RuVector cache
   * Triggers LoRA adaptation and EWC++ protection
   */
  public async forceRuVectorLearn(): Promise<{
    success: boolean;
    updatedParameters?: number;
    duration?: number;
    error?: string;
  }> {
    if (!this.hybridRouter) {
      return { success: false, error: 'RuVector not enabled' };
    }

    return await this.hybridRouter.forceRuVectorLearn();
  }

  /**
   * Get cost savings report from using RuVector cache
   */
  public getCostSavingsReport(): {
    totalRequests: number;
    localRequests: number;
    cloudRequests: number;
    totalCost: number;
    estimatedCloudCost: number;
    savings: number;
    savingsPercentage: number;
    cacheHits: number;
    cacheSavings: number;
  } {
    if (!this.hybridRouter) {
      return {
        totalRequests: 0,
        localRequests: 0,
        cloudRequests: 0,
        totalCost: 0,
        estimatedCloudCost: 0,
        savings: 0,
        savingsPercentage: 0,
        cacheHits: 0,
        cacheSavings: 0,
      };
    }
    return this.hybridRouter.getCostSavingsReport();
  }

  /**
   * Make an LLM call with automatic caching and learning
   * Uses RuVector GNN cache when available for sub-ms pattern matching
   *
   * @param prompt - The prompt to process
   * @param options - Additional options
   * @returns The response text
   */
  protected async llmCompleteWithLearning(
    prompt: string,
    options?: Partial<LLMCompletionOptions> & { complexity?: TaskComplexity }
  ): Promise<{ response: string; source: 'cache' | 'local' | 'cloud'; confidence?: number }> {
    if (!this.llmProvider) {
      throw new Error(`[${this.agentId.id}] LLM not available - initialize agent first`);
    }

    // If using HybridRouter, it automatically handles caching and learning
    if (this.hybridRouter) {
      const completionOptions: LLMCompletionOptions = {
        model: options?.model || 'auto',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
        metadata: {
          ...options?.metadata,
          agentId: this.agentId.id,
          agentType: this.agentId.type,
          complexity: options?.complexity,
        },
      };

      const response = await this.hybridRouter.complete(completionOptions);

      // Extract text from response
      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      return {
        response: text,
        source: response.metadata?.source as 'cache' | 'local' | 'cloud' || 'local',
        confidence: response.metadata?.confidence as number,
      };
    }

    // Fallback to regular completion
    const text = await this.llmComplete(prompt, options);
    return { response: text, source: 'local' };
  }

  /**
   * Cleanup LLM resources on agent termination
   */
  private async cleanupLLM(): Promise<void> {
    if (this.llmSessionId && this.llmProvider) {
      const ruvllm = this.llmProvider as RuvllmProvider;
      if (typeof ruvllm.endSession === 'function') {
        ruvllm.endSession(this.llmSessionId);
        console.log(`[${this.agentId.id}] LLM session ended: ${this.llmSessionId}`);
      }
    }

    if (this.llmProvider) {
      await this.llmProvider.shutdown();
    }

    if (this.llmFactory) {
      await this.llmFactory.shutdown();
    }
  }

  /**
   * Cleanup federated learning resources on agent termination
   * Submits final learning updates and unregisters from the coordinator
   */
  private async cleanupFederated(): Promise<void> {
    if (!this.federatedManager || !this.federatedInitialized) {
      return;
    }

    try {
      // Submit final learning updates before terminating
      await this.submitLearningUpdate();

      // Unregister this agent from federated learning
      this.federatedManager.unregisterAgent(this.agentId.id);
      console.log(`[${this.agentId.id}] Federated learning cleanup complete`);
    } catch (error) {
      console.warn(`[${this.agentId.id}] Federated cleanup error:`, (error as Error).message);
    }

    this.federatedInitialized = false;
    this.ephemeralAgent = undefined;

    // Only shutdown the manager if we created it (not if it was shared)
    if (!this.llmConfig.federatedManager && this.federatedManager) {
      await this.federatedManager.shutdown();
      this.federatedManager = undefined;
    }
  }
}

// === Agent Factory ===

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
