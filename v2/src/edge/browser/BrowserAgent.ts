/**
 * BrowserAgent - Browser-Compatible Base Agent for WASM Environments
 *
 * This is the browser-compatible version of BaseAgent that can run in:
 * - Modern browsers (Chrome 87+, Firefox 89+, Safari 15+)
 * - Web Workers
 * - Service Workers
 * - WASM-based environments
 *
 * Key differences from Node.js BaseAgent:
 * - No EventEmitter inheritance (uses custom BrowserEventEmitter)
 * - No Node.js crypto (uses Web Crypto API via shims)
 * - No fs/path dependencies
 * - IndexedDB for storage instead of SQLite
 * - BroadcastChannel for cross-tab coordination
 *
 * Phase 0: @ruvector/edge integration
 * Target bundle size contribution: <100KB
 *
 * @module edge/browser/BrowserAgent
 */

import type {
  BrowserAgentId,
  BrowserAgentCapability,
  BrowserAgentContext,
  BrowserAgentMetrics,
  BrowserAgentStatusResponse,
  BrowserTask,
  BrowserTaskAssignment,
  BrowserTaskResult,
  BrowserPreTaskData,
  BrowserPostTaskData,
  BrowserTaskErrorData,
  BrowserMemoryStore,
  BrowserEventEmitter,
  BrowserAgentEvent,
  BrowserEventHandler,
  BrowserAgentMessage,
  BrowserLifecycleStrategy,
  BrowserMemoryStrategy,
  BrowserLearningStrategy,
  BrowserCoordinationStrategy,
  IBrowserLLMProvider,
  BrowserLLMCompletionOptions,
  IBrowserCrypto,
} from '../types/browser-agent.types';

import {
  BrowserAgentType,
  BrowserAgentStatus,
  BrowserMessageType,
  BrowserAgentError,
  generateBrowserAgentId,
  generateBrowserEventId,
  generateBrowserMessageId,
  generateBrowserTaskId,
} from '../types/browser-agent.types';

import {
  createBrowserCrypto,
  createBrowserEventEmitter,
  createBrowserLogger,
  hrtime,
  elapsed,
  BrowserLogger,
} from '../wasm/shims';

import { getEdgeCapabilities, type EdgeCapabilities } from '../index';

// Re-export for convenience
export { BrowserAgentType, BrowserAgentStatus } from '../types/browser-agent.types';

// ============================================
// Legacy Config Types (backward compatibility)
// ============================================

/**
 * Legacy browser agent config (for simple agents)
 */
export interface BrowserAgentConfig {
  id: string;
  type: string;
  maxMemoryMB?: number;
  debug?: boolean;
  memory?: BrowserMemoryAdapter;
}

/**
 * Legacy browser agent state
 */
export interface BrowserAgentState {
  status: 'idle' | 'running' | 'error';
  lastActivity: number;
  tasksCompleted: number;
  memoryUsage: MemoryUsage;
  capabilities: EdgeCapabilities;
}

/**
 * Memory usage statistics
 */
export interface MemoryUsage {
  usedBytes: number;
  maxBytes: number;
  vectorCount: number;
  indexSizeBytes: number;
}

/**
 * Browser memory adapter interface
 */
export interface BrowserMemoryAdapter {
  initialize(): Promise<void>;
  store(key: string, vector: Float32Array, metadata?: Record<string, unknown>): Promise<void>;
  search(query: Float32Array, k: number): Promise<Array<{ key: string; score: number; metadata?: Record<string, unknown> }>>;
  getMemoryUsage(): MemoryUsage;
  close(): Promise<void>;
}

/**
 * Browser agent event types
 */
export type BrowserAgentEventType =
  | { type: 'started'; agentId: string }
  | { type: 'stopped'; agentId: string }
  | { type: 'task_completed'; agentId: string; taskId: string; duration: number }
  | { type: 'memory_updated'; agentId: string; usage: MemoryUsage }
  | { type: 'error'; agentId: string; error: string };

export type BrowserAgentEventHandler = (event: BrowserAgentEventType) => void;

// ============================================
// Extended Config Types (for abstract base agent)
// ============================================

/**
 * Full configuration for abstract browser agent
 */
export interface BrowserAgentFullConfig {
  id?: string;
  type: BrowserAgentType;
  capabilities?: BrowserAgentCapability[];
  context?: BrowserAgentContext;
  memoryStore: BrowserMemoryStore;
  eventBus?: BrowserEventEmitter;
  enableLearning?: boolean;
  llm?: {
    enabled?: boolean;
    provider?: IBrowserLLMProvider;
    defaultModel?: string;
    enableCache?: boolean;
  };
  lifecycleStrategy?: BrowserLifecycleStrategy;
  memoryStrategy?: BrowserMemoryStrategy;
  learningStrategy?: BrowserLearningStrategy;
  coordinationStrategy?: BrowserCoordinationStrategy;
}

// ============================================
// Default Strategy Implementations
// ============================================

/**
 * Default lifecycle strategy for browser agents
 */
class DefaultBrowserLifecycleStrategy implements BrowserLifecycleStrategy {
  private status: BrowserAgentStatus = BrowserAgentStatus.INITIALIZING;
  private statusListeners: Map<BrowserAgentStatus, Array<() => void>> = new Map();

  getStatus(): BrowserAgentStatus {
    return this.status;
  }

  async transitionTo(status: BrowserAgentStatus, _reason?: string): Promise<void> {
    this.status = status;
    const listeners = this.statusListeners.get(status);
    if (listeners) {
      listeners.forEach((resolve) => resolve());
      this.statusListeners.delete(status);
    }
  }

  async waitForStatus(status: BrowserAgentStatus, timeout: number = 10000): Promise<void> {
    if (this.status === status) return;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Agent did not reach status '${status}' within ${timeout}ms`));
      }, timeout);

      const listener = () => {
        clearTimeout(timer);
        resolve();
      };

      if (!this.statusListeners.has(status)) {
        this.statusListeners.set(status, []);
      }
      this.statusListeners.get(status)!.push(listener);
    });
  }

  async waitForReady(timeout: number = 10000): Promise<void> {
    const status = this.getStatus();
    if (status === BrowserAgentStatus.IDLE || status === BrowserAgentStatus.ACTIVE) {
      return;
    }
    return this.waitForStatus(BrowserAgentStatus.IDLE, timeout);
  }
}

/**
 * Default memory strategy for browser agents
 */
class DefaultBrowserMemoryStrategy implements BrowserMemoryStrategy {
  constructor(
    private memoryStore: BrowserMemoryStore,
    private agentId: BrowserAgentId
  ) {}

  async store(key: string, value: unknown, options?: { ttl?: number; namespace?: string }): Promise<void> {
    const fullKey = `aqe/${this.agentId.type}/${key}`;
    await this.memoryStore.store(fullKey, value, options?.ttl);
  }

  async retrieve(key: string): Promise<unknown> {
    const fullKey = `aqe/${this.agentId.type}/${key}`;
    return this.memoryStore.retrieve(fullKey);
  }

  async storeShared(agentType: string, key: string, value: unknown, options?: { ttl?: number }): Promise<void> {
    const fullKey = `aqe/shared/${agentType}/${key}`;
    await this.memoryStore.store(fullKey, value, options?.ttl);
  }

  async retrieveShared(agentType: string, key: string): Promise<unknown> {
    const fullKey = `aqe/shared/${agentType}/${key}`;
    return this.memoryStore.retrieve(fullKey);
  }
}

/**
 * Default coordination strategy for browser agents
 */
class DefaultBrowserCoordinationStrategy implements BrowserCoordinationStrategy {
  private broadcastChannel?: BroadcastChannel;
  private crypto: IBrowserCrypto;

  constructor(
    private eventBus: BrowserEventEmitter,
    private agentId: BrowserAgentId
  ) {
    this.crypto = createBrowserCrypto();

    // Initialize BroadcastChannel for cross-tab coordination
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('agentic-qe-coordination');
        this.broadcastChannel.onmessage = (event) => {
          const message = event.data as BrowserAgentEvent;
          if (message.target?.id !== this.agentId.id && message.source?.id !== this.agentId.id) {
            this.eventBus.emit(message.type, message);
          }
        };
      } catch {
        // BroadcastChannel not available
      }
    }
  }

  emitEvent(type: string, data: unknown): void {
    const event: BrowserAgentEvent = {
      id: generateBrowserEventId(this.crypto),
      type,
      source: this.agentId,
      data,
      timestamp: Date.now(),
      priority: 'medium',
      scope: 'global',
    };

    this.eventBus.emit(type, event);
    this.broadcastChannel?.postMessage(event);
  }

  registerHandler(type: string, handler: BrowserEventHandler): void {
    this.eventBus.on(type, handler);
  }

  unregisterHandler(type: string, handler: BrowserEventHandler): void {
    this.eventBus.off(type, handler);
  }

  async broadcast(message: BrowserAgentMessage): Promise<void> {
    this.eventBus.emit('agent.message', message);
    this.broadcastChannel?.postMessage(message);
  }

  destroy(): void {
    this.broadcastChannel?.close();
  }
}

// ============================================
// Simple BrowserAgent (Legacy Compatibility)
// ============================================

/**
 * Simple browser agent for basic WASM operations
 * Use BrowserAgentBase for full BaseAgent compatibility
 */
export class BrowserAgent {
  private readonly config: BrowserAgentConfig;
  private state: BrowserAgentState;
  private eventHandlers: Set<BrowserAgentEventHandler>;
  private memory: BrowserMemoryAdapter | null;

  constructor(config: BrowserAgentConfig) {
    this.config = {
      maxMemoryMB: 50,
      debug: false,
      ...config
    };

    this.eventHandlers = new Set();
    this.memory = config.memory ?? null;

    this.state = {
      status: 'idle',
      lastActivity: Date.now(),
      tasksCompleted: 0,
      memoryUsage: {
        usedBytes: 0,
        maxBytes: (this.config.maxMemoryMB ?? 50) * 1024 * 1024,
        vectorCount: 0,
        indexSizeBytes: 0
      },
      capabilities: getEdgeCapabilities()
    };
  }

  get id(): string {
    return this.config.id;
  }

  get type(): string {
    return this.config.type;
  }

  getState(): BrowserAgentState {
    return { ...this.state };
  }

  getCapabilities(): EdgeCapabilities {
    return this.state.capabilities;
  }

  async start(): Promise<void> {
    if (this.state.status === 'running') {
      this.log('Agent already running');
      return;
    }

    this.log('Starting agent...');

    if (!this.state.capabilities.hasWASM) {
      throw new Error('WebAssembly not supported in this environment');
    }

    if (this.memory) {
      await this.memory.initialize();
      this.updateMemoryUsage();
    }

    this.state.status = 'running';
    this.state.lastActivity = Date.now();

    this.emit({ type: 'started', agentId: this.id });
    this.log('Agent started successfully');
  }

  async stop(): Promise<void> {
    if (this.state.status !== 'running') {
      this.log('Agent not running');
      return;
    }

    this.log('Stopping agent...');

    if (this.memory) {
      await this.memory.close();
    }

    this.state.status = 'idle';
    this.state.lastActivity = Date.now();

    this.emit({ type: 'stopped', agentId: this.id });
    this.log('Agent stopped');
  }

  async storeVector(key: string, vector: Float32Array, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.memory) {
      throw new Error('No memory adapter configured');
    }
    if (this.state.status !== 'running') {
      throw new Error('Agent not running');
    }

    await this.memory.store(key, vector, metadata);
    this.updateMemoryUsage();
    this.state.lastActivity = Date.now();
  }

  async searchVectors(query: Float32Array, k: number = 10): Promise<Array<{ key: string; score: number; metadata?: Record<string, unknown> }>> {
    if (!this.memory) {
      throw new Error('No memory adapter configured');
    }
    if (this.state.status !== 'running') {
      throw new Error('Agent not running');
    }

    const results = await this.memory.search(query, k);
    this.state.lastActivity = Date.now();
    return results;
  }

  on(handler: BrowserAgentEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  recordTaskCompletion(taskId: string, duration: number): void {
    this.state.tasksCompleted++;
    this.state.lastActivity = Date.now();
    this.emit({ type: 'task_completed', agentId: this.id, taskId, duration });
  }

  private updateMemoryUsage(): void {
    if (this.memory) {
      this.state.memoryUsage = this.memory.getMemoryUsage();
      this.emit({ type: 'memory_updated', agentId: this.id, usage: this.state.memoryUsage });
    }
  }

  private emit(event: BrowserAgentEventType): void {
    this.eventHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        this.log(`Event handler error: ${error}`);
      }
    });
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[BrowserAgent:${this.id}] ${message}`);
    }
  }
}

// ============================================
// Abstract BrowserAgentBase (Full BaseAgent Compatibility)
// ============================================

/**
 * Abstract base class for browser-compatible QE agents
 * Mirrors the interface of Node.js BaseAgent
 *
 * @example
 * ```typescript
 * class BrowserTestGeneratorAgent extends BrowserAgentBase {
 *   protected async initializeComponents(): Promise<void> {
 *     // Initialize test generation components
 *   }
 *
 *   protected async performTask(task: BrowserTask): Promise<any> {
 *     // Generate tests in browser
 *   }
 *
 *   protected async loadKnowledge(): Promise<void> {
 *     // Load cached patterns from IndexedDB
 *   }
 *
 *   protected async cleanup(): Promise<void> {
 *     // Cleanup resources
 *   }
 * }
 * ```
 */
export abstract class BrowserAgentBase {
  protected readonly logger: BrowserLogger;
  protected readonly crypto: IBrowserCrypto;
  protected readonly agentId: BrowserAgentId;
  protected readonly capabilities: Map<string, BrowserAgentCapability>;
  protected readonly context?: BrowserAgentContext;
  protected readonly memoryStore: BrowserMemoryStore;
  protected readonly eventBus: BrowserEventEmitter;
  protected currentTask?: BrowserTaskAssignment;

  protected llmProvider?: IBrowserLLMProvider;
  protected readonly llmConfig?: BrowserAgentFullConfig['llm'];

  protected performanceMetrics: BrowserAgentMetrics = {
    tasksCompleted: 0,
    averageExecutionTime: 0,
    errorCount: 0,
    lastActivity: Date.now(),
  };

  private taskStartTime?: number;
  private initializationPromise?: Promise<void>;
  private statusChangeCallbacks: Array<(status: BrowserAgentStatus) => void> = [];

  protected strategies: {
    lifecycle: BrowserLifecycleStrategy;
    memory: BrowserMemoryStrategy;
    learning?: BrowserLearningStrategy;
    coordination: BrowserCoordinationStrategy;
  };

  constructor(config: BrowserAgentFullConfig) {
    this.crypto = createBrowserCrypto();
    this.logger = createBrowserLogger();

    this.agentId = config.id
      ? { id: config.id, type: config.type, created: Date.now() }
      : generateBrowserAgentId(config.type, this.crypto);

    this.capabilities = new Map((config.capabilities || []).map((cap) => [cap.name, cap]));
    this.context = config.context;
    this.memoryStore = config.memoryStore;
    this.eventBus = config.eventBus || createBrowserEventEmitter();
    this.llmConfig = config.llm;

    this.strategies = {
      lifecycle: config.lifecycleStrategy ?? new DefaultBrowserLifecycleStrategy(),
      memory: config.memoryStrategy ?? new DefaultBrowserMemoryStrategy(this.memoryStore, this.agentId),
      learning: config.learningStrategy,
      coordination: config.coordinationStrategy ?? new DefaultBrowserCoordinationStrategy(this.eventBus, this.agentId),
    };

    this.setupEventHandlers();
  }

  // ============================================
  // Public Interface
  // ============================================

  public async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    const currentStatus = this.strategies.lifecycle.getStatus();
    if (currentStatus === BrowserAgentStatus.ACTIVE || currentStatus === BrowserAgentStatus.IDLE) {
      return;
    }

    this.initializationPromise = this.doInitialize();

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = undefined;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      await this.loadKnowledge();

      const savedState = await this.memoryStore.retrieve(`state:${this.agentId.id}`);
      if (savedState && typeof savedState === 'object') {
        const state = savedState as { performanceMetrics?: Partial<BrowserAgentMetrics> };
        if (state.performanceMetrics) {
          this.performanceMetrics = { ...this.performanceMetrics, ...state.performanceMetrics };
        }
      }

      await this.initializeLLMProvider();
      await this.initializeComponents();

      await this.strategies.lifecycle.transitionTo(BrowserAgentStatus.IDLE);
      this.emitStatusChange(BrowserAgentStatus.IDLE);
      this.strategies.coordination.emitEvent('agent.initialized', { agentId: this.agentId });

      this.logger.info(`[${this.agentId.id}] Agent initialized successfully`);
    } catch (error) {
      await this.strategies.lifecycle.transitionTo(BrowserAgentStatus.ERROR, `Initialization failed: ${error}`);
      this.emitStatusChange(BrowserAgentStatus.ERROR);
      throw new BrowserAgentError(
        `Agent initialization failed: ${error}`,
        'INITIALIZATION_FAILED',
        true,
        error instanceof Error ? error : undefined
      );
    }
  }

  public async executeTask(assignment: BrowserTaskAssignment): Promise<BrowserTaskResult> {
    const startTime = hrtime();

    try {
      this.validateTaskAssignment(assignment);
      this.currentTask = assignment;

      await this.strategies.lifecycle.transitionTo(BrowserAgentStatus.ACTIVE);
      this.emitStatusChange(BrowserAgentStatus.ACTIVE);

      const preTaskData: BrowserPreTaskData = { assignment };
      await this.onPreTask(preTaskData);

      const result = await this.performTask(assignment.task);

      const duration = elapsed(startTime);
      const postTaskData: BrowserPostTaskData = { assignment, result, duration };
      await this.onPostTask(postTaskData);

      this.updatePerformanceMetrics(startTime, true);
      await this.memoryStore.store(`task-result:${assignment.id}`, result);

      this.currentTask = undefined;
      await this.strategies.lifecycle.transitionTo(BrowserAgentStatus.IDLE);
      this.emitStatusChange(BrowserAgentStatus.IDLE);

      return {
        success: true,
        data: result,
        duration: elapsed(startTime),
        metadata: { taskId: assignment.id },
      };
    } catch (error) {
      this.updatePerformanceMetrics(startTime, false);
      this.currentTask = undefined;

      const taskErrorData: BrowserTaskErrorData = {
        assignment,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
      await this.onTaskError(taskErrorData);

      await this.strategies.lifecycle.transitionTo(BrowserAgentStatus.ERROR, `Task failed: ${error}`);
      this.emitStatusChange(BrowserAgentStatus.ERROR);

      throw new BrowserAgentError(
        `Task execution failed: ${error}`,
        'TASK_FAILED',
        true,
        error instanceof Error ? error : undefined
      );
    }
  }

  public async terminate(): Promise<void> {
    try {
      await this.strategies.lifecycle.transitionTo(BrowserAgentStatus.STOPPING);
      this.emitStatusChange(BrowserAgentStatus.STOPPING);

      await this.saveState();
      await this.cleanup();
      await this.cleanupLLM();

      if (this.strategies.coordination instanceof DefaultBrowserCoordinationStrategy) {
        (this.strategies.coordination as DefaultBrowserCoordinationStrategy).destroy();
      }

      await this.strategies.lifecycle.transitionTo(BrowserAgentStatus.TERMINATED);
      this.emitStatusChange(BrowserAgentStatus.TERMINATED);
      this.strategies.coordination.emitEvent('agent.terminated', { agentId: this.agentId });

      this.eventBus.removeAllListeners();
      this.statusChangeCallbacks = [];

      this.logger.info(`[${this.agentId.id}] Agent terminated successfully`);
    } catch (error) {
      await this.strategies.lifecycle.transitionTo(BrowserAgentStatus.ERROR, `Termination failed: ${error}`);
      throw error;
    }
  }

  // ============================================
  // Getters
  // ============================================

  public getAgentId(): BrowserAgentId {
    return this.agentId;
  }

  public getStatus(): BrowserAgentStatusResponse {
    return {
      agentId: this.agentId,
      status: this.strategies.lifecycle.getStatus(),
      currentTask: this.currentTask?.id,
      capabilities: Array.from(this.capabilities.keys()),
      performanceMetrics: { ...this.performanceMetrics },
    };
  }

  public hasCapability(name: string): boolean {
    return this.capabilities.has(name);
  }

  public getCapability(name: string): BrowserAgentCapability | undefined {
    return this.capabilities.get(name);
  }

  public getCapabilities(): BrowserAgentCapability[] {
    return Array.from(this.capabilities.values());
  }

  public getStrategies() {
    return this.strategies;
  }

  // ============================================
  // Event-Driven Coordination
  // ============================================

  public async waitForStatus(status: BrowserAgentStatus, timeout = 10000): Promise<void> {
    if (this.strategies.lifecycle.waitForStatus) {
      return this.strategies.lifecycle.waitForStatus(status, timeout);
    }

    return new Promise((resolve, reject) => {
      if (this.strategies.lifecycle.getStatus() === status) {
        return resolve();
      }

      const timer = setTimeout(() => {
        reject(new Error(`Agent did not reach status '${status}' within ${timeout}ms`));
      }, timeout);

      const callback = (newStatus: BrowserAgentStatus) => {
        if (newStatus === status) {
          clearTimeout(timer);
          this.removeStatusChangeCallback(callback);
          resolve();
        }
      };

      this.addStatusChangeCallback(callback);
    });
  }

  public async waitForReady(timeout = 10000): Promise<void> {
    if (this.strategies.lifecycle.waitForReady) {
      return this.strategies.lifecycle.waitForReady(timeout);
    }

    const status = this.strategies.lifecycle.getStatus();
    if (status === BrowserAgentStatus.IDLE || status === BrowserAgentStatus.ACTIVE) {
      return;
    }

    return this.waitForStatus(BrowserAgentStatus.IDLE, timeout);
  }

  public addStatusChangeCallback(callback: (status: BrowserAgentStatus) => void): void {
    this.statusChangeCallbacks.push(callback);
  }

  public removeStatusChangeCallback(callback: (status: BrowserAgentStatus) => void): void {
    const index = this.statusChangeCallbacks.indexOf(callback);
    if (index !== -1) {
      this.statusChangeCallbacks.splice(index, 1);
    }
  }

  // ============================================
  // LLM Integration
  // ============================================

  public hasLLM(): boolean {
    return this.llmProvider !== undefined;
  }

  public getLLMProvider(): IBrowserLLMProvider | undefined {
    return this.llmProvider;
  }

  protected async llmComplete(prompt: string, options?: Partial<BrowserLLMCompletionOptions>): Promise<string> {
    if (!this.llmProvider) {
      throw new BrowserAgentError('LLM not available - initialize agent first', 'LLM_ERROR', false);
    }

    const completionOptions: BrowserLLMCompletionOptions = {
      model: options?.model || this.llmConfig?.defaultModel || 'default',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      metadata: {
        ...options?.metadata,
        agentId: this.agentId.id,
        agentType: this.agentId.type,
      },
    };

    const response = await this.llmProvider.complete(completionOptions);
    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }

  protected async llmEmbed(text: string): Promise<number[]> {
    if (!this.llmProvider?.embed) {
      throw new BrowserAgentError('Embeddings not supported by LLM provider', 'LLM_ERROR', false);
    }
    const response = await this.llmProvider.embed({ text });
    return response.embedding || [];
  }

  // ============================================
  // FleetManager Compatibility
  // ============================================

  public async start(): Promise<void> {
    const status = this.strategies.lifecycle.getStatus();
    if (status === BrowserAgentStatus.ACTIVE || status === BrowserAgentStatus.IDLE) {
      return;
    }
    await this.initialize();
  }

  public async stop(): Promise<void> {
    await this.terminate();
  }

  public async assignTask(task: BrowserTask): Promise<void> {
    const assignment: BrowserTaskAssignment = {
      id: generateBrowserTaskId(this.crypto),
      task,
      agentId: this.agentId.id,
      assignedAt: Date.now(),
      status: 'assigned',
    };
    await this.executeTask(assignment);
  }

  // ============================================
  // Abstract Methods
  // ============================================

  protected abstract initializeComponents(): Promise<void>;
  protected abstract performTask(task: BrowserTask): Promise<unknown>;
  protected abstract loadKnowledge(): Promise<void>;
  protected abstract cleanup(): Promise<void>;

  // ============================================
  // Protected Methods
  // ============================================

  protected registerCapability(capability: BrowserAgentCapability): void {
    this.capabilities.set(capability.name, capability);
    this.strategies.coordination.emitEvent('capability.registered', {
      agentId: this.agentId,
      capability: capability.name,
    });
  }

  protected registerCapabilities(capabilities: BrowserAgentCapability[]): void {
    capabilities.forEach((cap) => this.registerCapability(cap));
  }

  protected emitEvent(type: string, data: unknown): void {
    this.strategies.coordination.emitEvent(type, data);
  }

  protected emitStatusChange(status: BrowserAgentStatus): void {
    this.statusChangeCallbacks.forEach((callback) => {
      try {
        callback(status);
      } catch (error) {
        this.logger.error(`Status change callback error:`, error);
      }
    });
    this.strategies.coordination.emitEvent('agent.status-changed', {
      agentId: this.agentId,
      status,
      timestamp: Date.now(),
    });
  }

  protected async broadcastMessage(type: string, payload: unknown): Promise<void> {
    const message: BrowserAgentMessage = {
      id: generateBrowserMessageId(this.crypto),
      from: this.agentId,
      to: { id: 'broadcast', type: BrowserAgentType.TEST_GENERATOR, created: Date.now() },
      type: type as BrowserMessageType,
      payload,
      timestamp: Date.now(),
      priority: 'medium',
    };
    await this.strategies.coordination.broadcast(message);
  }

  protected async storeMemory(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.strategies.memory.store(key, value, { ttl });
  }

  protected async retrieveMemory(key: string): Promise<unknown> {
    return this.strategies.memory.retrieve(key);
  }

  protected async storeSharedMemory(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.strategies.memory.storeShared(this.agentId.type, key, value, { ttl });
  }

  protected async retrieveSharedMemory(agentType: string, key: string): Promise<unknown> {
    return this.strategies.memory.retrieveShared(agentType, key);
  }

  // ============================================
  // Lifecycle Hooks
  // ============================================

  protected async onPreTask(data: BrowserPreTaskData): Promise<void> {
    this.taskStartTime = hrtime();
    if (this.strategies.lifecycle.onPreTask) {
      await this.strategies.lifecycle.onPreTask(data);
    }
    this.emitEvent('hook.pre-task', { agentId: this.agentId, taskId: data.assignment.id });
  }

  protected async onPostTask(data: BrowserPostTaskData): Promise<void> {
    if (this.strategies.lifecycle.onPostTask) {
      await this.strategies.lifecycle.onPostTask(data);
    }
    if (this.strategies.learning?.recordExecution) {
      await this.strategies.learning.recordExecution({
        task: data.assignment.task,
        result: data.result,
        success: true,
        duration: data.duration,
        metadata: { taskId: data.assignment.id },
      });
    }
    this.emitEvent('hook.post-task', { agentId: this.agentId, taskId: data.assignment.id, duration: data.duration });
  }

  protected async onTaskError(data: BrowserTaskErrorData): Promise<void> {
    const executionTime = this.taskStartTime ? elapsed(this.taskStartTime) : 0;

    await this.storeMemory(`error:${data.assignment.id}`, {
      error: data.error,
      stack: data.stack,
      assignment: { id: data.assignment.id, taskType: data.assignment.task?.type ?? 'unknown' },
      timestamp: Date.now(),
      agentId: this.agentId.id,
    });

    if (this.strategies.lifecycle.onTaskError) {
      await this.strategies.lifecycle.onTaskError(data);
    }

    if (this.strategies.learning?.recordExecution) {
      await this.strategies.learning.recordExecution({
        task: data.assignment.task,
        error: data.error,
        success: false,
        duration: executionTime,
        metadata: { taskId: data.assignment.id },
      });
    }

    this.emitEvent('hook.task-error', { agentId: this.agentId, error: data.error });
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async initializeLLMProvider(): Promise<void> {
    if (!this.llmConfig?.enabled || !this.llmConfig?.provider) {
      return;
    }

    try {
      this.llmProvider = this.llmConfig.provider;
      await this.llmProvider.initialize();
      this.logger.info(`[${this.agentId.id}] LLM provider initialized`);
    } catch (error) {
      this.logger.warn(`[${this.agentId.id}] LLM initialization failed:`, error);
    }
  }

  private async cleanupLLM(): Promise<void> {
    if (this.llmProvider) {
      try {
        await this.llmProvider.shutdown();
        this.logger.info(`[${this.agentId.id}] LLM provider shutdown complete`);
      } catch (error) {
        this.logger.warn(`[${this.agentId.id}] LLM shutdown error:`, error);
      }
    }
  }

  private setupEventHandlers(): void {
    this.strategies.coordination.registerHandler('fleet.shutdown', async () => {
      await this.terminate();
    });

    this.strategies.coordination.registerHandler('agent.ping', (event) => {
      if (event.target?.id === this.agentId.id) {
        this.emitEvent('agent.pong', { agentId: this.agentId });
      }
    });
  }

  private validateTaskAssignment(assignment: BrowserTaskAssignment): void {
    if (!assignment?.task) {
      throw new BrowserAgentError('Invalid task assignment', 'VALIDATION_ERROR', false);
    }

    const requiredCapabilities = assignment.task.requirements?.capabilities || [];
    for (const cap of requiredCapabilities) {
      if (!this.hasCapability(cap)) {
        throw new BrowserAgentError(`Missing required capability: ${cap}`, 'VALIDATION_ERROR', false);
      }
    }
  }

  private updatePerformanceMetrics(startTime: number, success: boolean): void {
    const duration = elapsed(startTime);

    if (success) {
      this.performanceMetrics.tasksCompleted++;
      this.performanceMetrics.averageExecutionTime =
        (this.performanceMetrics.averageExecutionTime * (this.performanceMetrics.tasksCompleted - 1) + duration) /
        this.performanceMetrics.tasksCompleted;
    } else {
      this.performanceMetrics.errorCount++;
    }

    this.performanceMetrics.lastActivity = Date.now();
  }

  private async saveState(): Promise<void> {
    await this.memoryStore.store(`state:${this.agentId.id}`, {
      performanceMetrics: this.performanceMetrics,
      timestamp: Date.now(),
    });
  }
}

export default BrowserAgent;
