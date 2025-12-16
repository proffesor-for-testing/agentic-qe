/**
 * BaseAgent - Abstract base class for all QE agents
 * Phase 2 B1.2: Decomposed with strategy pattern (~500 LOC target)
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
import { AgentLifecycleManager } from './lifecycle/AgentLifecycleManager';
import { AgentCoordinator } from './coordination/AgentCoordinator';
import { AgentMemoryService } from './memory/AgentMemoryService';

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
 * Configuration for BaseAgent
 */
export interface BaseAgentConfig {
  id?: string;
  type: AgentType;
  capabilities: AgentCapability[];
  context: AgentContext;
  memoryStore: MemoryStore;
  eventBus: EventEmitter;
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
    this.agentId = { id: config.id || generateAgentId(config.type), type: config.type, created: new Date() };
    this.capabilities = new Map(config.capabilities.map(cap => [cap.name, cap]));
    this.context = config.context;
    this.memoryStore = config.memoryStore;
    this.eventBus = config.eventBus;
    this.enableLearning = config.enableLearning ?? true;
    this.learningConfig = config.learningConfig;

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
    this.emitEvent('hook.post-task.completed', { agentId: this.agentId, result });
  }

  protected async onTaskError(data: TaskErrorData): Promise<void> {
    const executionTime = this.taskStartTime ? Date.now() - this.taskStartTime : 0;
    await this.storeMemory(`error:${data.assignment.id}`, {
      error: { message: data.error.message, name: data.error.name },
      assignment: { id: data.assignment.id, taskType: data.assignment.task.type },
      timestamp: new Date(), agentId: this.agentId.id
    });

    if (this.strategies.lifecycle.onTaskError) await this.strategies.lifecycle.onTaskError(data);

    if (this.strategies.learning?.recordExecution) {
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
      console.error(`Hook ${hookName} failed:`, error);
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
