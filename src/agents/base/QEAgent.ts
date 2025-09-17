/**
 * Base QE Agent class - Foundation for all Quality Engineering agents
 * Provides core functionality, lifecycle management, and standardized interfaces
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  QEAgentConfig,
  AgentType,
  AgentCapability,
  TestCase,
  TestResult,
  TestStatus,
  QEHookEvent,
  HookEventType,
  QEAgentConfigSchema
} from '../../types';
import { QEMemory } from '../../memory/QEMemory';
import { HookManager } from '../../hooks';
import { Logger } from '../../utils/Logger';

/**
 * Agent execution context containing environment and runtime information
 */
export interface AgentContext {
  sessionId: string;
  testSuiteId?: string;
  testCaseId?: string;
  environment: string;
  configuration: Record<string, unknown>;
  startTime: Date;
  metadata: Record<string, unknown>;
}

/**
 * Agent execution result with status and artifacts
 */
export interface AgentExecutionResult {
  success: boolean;
  status: TestStatus;
  message?: string;
  error?: Error;
  artifacts: string[];
  metrics: Record<string, number>;
  duration: number;
  metadata: Record<string, unknown>;
}

/**
 * Agent state for lifecycle management
 */
export type AgentState = 
  | 'initializing'
  | 'idle'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'destroyed';

/**
 * Base abstract class for all QE agents
 * Implements common functionality and defines the agent contract
 */
export abstract class QEAgent extends EventEmitter {
  protected readonly config: QEAgentConfig;
  protected readonly memory: QEMemory;
  protected readonly hooks: HookManager;
  protected readonly logger: Logger;
  
  private _state: AgentState = 'initializing';
  private _context: AgentContext | null = null;
  private _currentExecution: Promise<AgentExecutionResult> | null = null;
  private _metrics: Map<string, number> = new Map();
  private _artifacts: string[] = [];
  private _lastHeartbeat: Date = new Date();
  
  public readonly createdAt: Date;
  public readonly id: string;
  public readonly name: string;
  public readonly type: AgentType;
  public readonly capabilities: AgentCapability[];

  constructor(
    config: QEAgentConfig,
    memory: QEMemory,
    hooks: HookManager,
    logger?: Logger
  ) {
    super();
    
    // Validate configuration
    const validationResult = QEAgentConfigSchema.safeParse(config);
    if (!validationResult.success) {
      throw new Error(`Invalid agent configuration: ${validationResult.error.message}`);
    }
    
    this.config = config;
    this.memory = memory;
    this.hooks = hooks;
    this.logger = logger || new Logger(`QEAgent:${config.name}`);
    
    this.createdAt = new Date();
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.capabilities = config.capabilities;
    
    this.setupEventHandlers();
    this.initialize();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get current agent state
   */
  public get state(): AgentState {
    return this._state;
  }

  /**
   * Get current execution context
   */
  public get context(): AgentContext | null {
    return this._context;
  }

  /**
   * Get agent metrics
   */
  public get metrics(): ReadonlyMap<string, number> {
    return new Map(this._metrics);
  }

  /**
   * Get agent artifacts
   */
  public get artifacts(): readonly string[] {
    return [...this._artifacts];
  }

  /**
   * Check if agent is currently running
   */
  public get isRunning(): boolean {
    return this._state === 'running';
  }

  /**
   * Check if agent is available for new tasks
   */
  public get isAvailable(): boolean {
    return this._state === 'idle' && this._currentExecution === null;
  }

  /**
   * Get agent health status
   */
  public getHealth(): {
    state: AgentState;
    uptime: number;
    lastHeartbeat: Date;
    memoryUsage: number;
    executionCount: number;
  } {
    return {
      state: this._state,
      uptime: Date.now() - this.createdAt.getTime(),
      lastHeartbeat: this._lastHeartbeat,
      memoryUsage: process.memoryUsage().heapUsed,
      executionCount: this._metrics.get('execution_count') || 0
    };
  }

  /**
   * Execute agent with given context
   */
  public async execute(context: AgentContext): Promise<AgentExecutionResult> {
    if (!this.isAvailable) {
      throw new Error(`Agent ${this.name} is not available (state: ${this._state})`);
    }

    this._context = context;
    this._state = 'running';
    
    const startTime = Date.now();
    this.incrementMetric('execution_count');
    
    try {
      // Emit pre-execution hook
      await this.emitHook('test-start', {
        agentId: this.id,
        testId: context.testCaseId,
        context: context
      });

      this.logger.info(`Starting execution for agent ${this.name}`, { context });
      
      // Execute the agent-specific logic
      this._currentExecution = this.doExecute(context);
      const result = await this._currentExecution;
      
      // Update metrics and artifacts
      result.duration = Date.now() - startTime;
      this._artifacts.push(...result.artifacts);
      Object.entries(result.metrics).forEach(([key, value]) => {
        this.setMetric(key, value);
      });
      
      this.logger.info(`Completed execution for agent ${this.name}`, { 
        duration: result.duration,
        status: result.status,
        artifacts: result.artifacts.length
      });
      
      // Emit post-execution hook
      await this.emitHook('test-end', {
        agentId: this.id,
        testId: context.testCaseId,
        result: result
      });
      
      this._state = 'idle';
      return result;
      
    } catch (error) {
      this._state = 'error';
      this.logger.error(`Execution failed for agent ${this.name}`, { error });
      
      const errorResult: AgentExecutionResult = {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
        artifacts: [...this._artifacts],
        metrics: Object.fromEntries(this._metrics),
        duration: Date.now() - startTime,
        metadata: { error: true }
      };
      
      await this.emitHook('error', {
        agentId: this.id,
        testId: context.testCaseId,
        error: errorResult.error
      });
      
      return errorResult;
      
    } finally {
      this._currentExecution = null;
      this._context = null;
      this.updateHeartbeat();
    }
  }

  /**
   * Pause agent execution
   */
  public async pause(): Promise<void> {
    if (this._state !== 'running') {
      throw new Error(`Cannot pause agent in state: ${this._state}`);
    }
    
    this._state = 'paused';
    this.logger.info(`Agent ${this.name} paused`);
    await this.onPause();
  }

  /**
   * Resume agent execution
   */
  public async resume(): Promise<void> {
    if (this._state !== 'paused') {
      throw new Error(`Cannot resume agent in state: ${this._state}`);
    }
    
    this._state = 'running';
    this.logger.info(`Agent ${this.name} resumed`);
    await this.onResume();
  }

  /**
   * Stop agent execution
   */
  public async stop(): Promise<void> {
    if (this._state === 'stopped' || this._state === 'destroyed') {
      return;
    }
    
    this._state = 'stopping';
    this.logger.info(`Stopping agent ${this.name}`);
    
    try {
      await this.onStop();
      this._state = 'stopped';
      
      await this.emitHook('agent-destroy', {
        agentId: this.id,
        metadata: { stopped: true }
      });
      
    } catch (error) {
      this.logger.error(`Error stopping agent ${this.name}`, { error });
      this._state = 'error';
    }
  }

  /**
   * Destroy agent and cleanup resources
   */
  public async destroy(): Promise<void> {
    if (this._state === 'destroyed') {
      return;
    }
    
    await this.stop();
    this._state = 'destroyed';
    
    await this.cleanup();
    this.removeAllListeners();
    
    this.logger.info(`Agent ${this.name} destroyed`);
  }

  /**
   * Check if agent has specific capability
   */
  public hasCapability(capability: AgentCapability): boolean {
    return this.capabilities.includes(capability);
  }

  /**
   * Update agent configuration
   */
  public updateConfig(updates: Partial<QEAgentConfig>): void {
    Object.assign(this.config, updates);
    this.logger.info(`Agent ${this.name} configuration updated`, { updates });
  }

  // ============================================================================
  // Protected Methods (for subclasses)
  // ============================================================================

  /**
   * Abstract method that subclasses must implement
   * Contains the core agent execution logic
   */
  protected abstract doExecute(context: AgentContext): Promise<AgentExecutionResult>;

  /**
   * Initialize agent (called during construction)
   */
  protected async initialize(): Promise<void> {
    this.logger.info(`Initializing agent ${this.name}`);
    
    await this.onInitialize();
    
    this._state = 'idle';
    this.updateHeartbeat();
    
    await this.emitHook('agent-spawn', {
      agentId: this.id,
      metadata: {
        type: this.type,
        capabilities: this.capabilities,
        config: this.config
      }
    });
    
    this.logger.info(`Agent ${this.name} initialized successfully`);
  }

  /**
   * Hook for subclass initialization
   */
  protected async onInitialize(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Hook for pause handling
   */
  protected async onPause(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Hook for resume handling
   */
  protected async onResume(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Hook for stop handling
   */
  protected async onStop(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Store data in agent memory
   */
  protected async storeMemory(
    key: string,
    value: unknown,
    tags: string[] = []
  ): Promise<void> {
    await this.memory.store({
      key: `agent:${this.id}:${key}`,
      value,
      type: 'agent-state',
      sessionId: this._context?.sessionId || 'default',
      agentId: this.id,
      timestamp: new Date(),
      tags: [...tags, this.type, this.name]
    });
  }

  /**
   * Retrieve data from agent memory
   */
  protected async getMemory<T = unknown>(key: string): Promise<T | null> {
    const entry = await this.memory.get(`agent:${this.id}:${key}`);
    return entry ? (entry.value as T) : null;
  }

  /**
   * Set a metric value
   */
  protected setMetric(key: string, value: number): void {
    this._metrics.set(key, value);
    this.emit('metric-updated', { key, value });
  }

  /**
   * Increment a metric value
   */
  protected incrementMetric(key: string, increment: number = 1): void {
    const current = this._metrics.get(key) || 0;
    this.setMetric(key, current + increment);
  }

  /**
   * Add an artifact to the agent
   */
  protected addArtifact(artifactPath: string): void {
    this._artifacts.push(artifactPath);
    this.emit('artifact-created', { path: artifactPath });
  }

  /**
   * Emit a hook event
   */
  protected async emitHook(
    type: HookEventType,
    data: Record<string, unknown>
  ): Promise<void> {
    const event: QEHookEvent = {
      type,
      timestamp: new Date(),
      sessionId: this._context?.sessionId || 'default',
      agentId: this.id,
      testId: this._context?.testCaseId,
      data,
      metadata: {
        agentType: this.type,
        agentName: this.name
      }
    };
    
    await this.hooks.emitHook(event);
  }

  /**
   * Wait for a specified duration
   */
  protected async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute with timeout
   */
  protected async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number = this.config.timeout
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setupEventHandlers(): void {
    this.on('error', (error) => {
      this.logger.error(`Agent ${this.name} encountered an error`, { error });
      this._state = 'error';
    });
    
    // Heartbeat mechanism
    setInterval(() => {
      this.updateHeartbeat();
    }, 30000); // Every 30 seconds
  }

  private updateHeartbeat(): void {
    this._lastHeartbeat = new Date();
    this.emit('heartbeat', {
      agentId: this.id,
      timestamp: this._lastHeartbeat,
      state: this._state,
      metrics: Object.fromEntries(this._metrics)
    });
  }

  private async cleanup(): Promise<void> {
    // Clear any intervals/timeouts
    // Close connections
    // Release resources
    this.logger.info(`Cleaning up resources for agent ${this.name}`);
  }
}

/**
 * Factory function to create agent instances
 */
export interface AgentFactory {
  create(config: QEAgentConfig, memory: QEMemory, hooks: HookManager): QEAgent;
}

/**
 * Agent registry for managing agent types and factories
 */
export class AgentRegistry {
  private static factories: Map<AgentType, AgentFactory> = new Map();
  
  public static register(type: AgentType, factory: AgentFactory): void {
    this.factories.set(type, factory);
  }
  
  public static create(
    config: QEAgentConfig,
    memory: QEMemory,
    hooks: HookManager
  ): QEAgent {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(`No factory registered for agent type: ${config.type}`);
    }
    
    return factory.create(config, memory, hooks);
  }
  
  public static getRegisteredTypes(): AgentType[] {
    return Array.from(this.factories.keys());
  }
}
