/**
 * Agentic QE v3 - Base Domain Interface
 * Template for all domain implementations
 *
 * Extended with optional integration support for:
 * - MinCut topology awareness (ADR-047)
 * - Multi-model consensus verification (MM-006)
 */

import { DomainName, DomainEvent, Result, ok, err } from '../shared/types';
import {
  DomainPlugin,
  DomainHealth,
  EventBus,
  MemoryBackend,
  DomainTaskRequest,
  DomainTaskResult,
  TaskCompletionCallback,
} from '../kernel/interfaces';
import type { QueenMinCutBridge } from '../coordination/mincut';
import type { ConsensusEngineConfig } from '../coordination/consensus';

/**
 * Task handler function type
 * Handlers receive the task payload and return a result
 */
export type TaskHandler = (
  payload: Record<string, unknown>
) => Promise<Result<unknown, Error>>;

// ============================================================================
// Integration Configuration Types (ADR-047, MM-006)
// ============================================================================

/**
 * Simplified consensus configuration for domain plugin injection
 * This provides a lightweight way to enable consensus verification via DI
 * without requiring the full ConsensusEnabledConfig from mixins
 *
 * For full mixin-based consensus support, use ConsensusEnabledDomain from
 * coordination/mixins/consensus-enabled-domain.ts
 *
 * @see MM-006: Multi-Model Consensus Integration
 */
export interface DomainConsensusConfig {
  /** Whether consensus verification is enabled for this domain */
  readonly enabled: boolean;

  /** Consensus engine configuration overrides */
  readonly engineConfig?: Partial<ConsensusEngineConfig>;

  /** Severity levels that require consensus verification */
  readonly verifySeverities?: Array<'critical' | 'high' | 'medium' | 'low'>;

  /** Minimum confidence threshold for auto-approval (0-1) */
  readonly autoApprovalThreshold?: number;
}

/**
 * Extended domain plugin configuration with integration support
 * All properties are optional to maintain backward compatibility
 *
 * @example
 * ```typescript
 * const config: DomainPluginIntegrationConfig = {
 *   minCutBridge: existingBridge,
 *   consensusConfig: { enabled: true, verifySeverities: ['critical', 'high'] }
 * };
 * plugin.setIntegrationConfig(config);
 * ```
 */
export interface DomainPluginIntegrationConfig {
  /**
   * Optional MinCut bridge for topology awareness (ADR-047)
   * When provided, the domain can report its topology health and participate
   * in self-healing coordination with other domains
   */
  minCutBridge?: QueenMinCutBridge;

  /**
   * Optional consensus configuration for multi-model verification (MM-006)
   * When provided, the domain can use consensus-based verification for
   * critical findings and operations
   */
  consensusConfig?: DomainConsensusConfig;
}

/**
 * Abstract base class for domain plugins
 *
 * Provides common functionality for all domain implementations including:
 * - Lifecycle management (initialize/dispose)
 * - Health tracking
 * - Event handling
 * - Task execution (Queen-Domain integration)
 * - Optional MinCut and Consensus integration (ADR-047, MM-006)
 */
export abstract class BaseDomainPlugin implements DomainPlugin {
  protected _initialized = false;
  // Issue #205 fix: Default to 'idle' status for fresh installs (0 agents)
  // Domains transition to 'healthy' when they have active agents
  protected _health: DomainHealth = {
    status: 'idle',
    agents: { total: 0, active: 0, idle: 0, failed: 0 },
    errors: [],
  };

  // ============================================================================
  // Optional Integration Support (ADR-047, MM-006)
  // ============================================================================

  /**
   * MinCut bridge for topology awareness
   * @internal Set via setMinCutBridge() or setIntegrationConfig()
   */
  protected _minCutBridge?: QueenMinCutBridge;

  /**
   * Consensus configuration for multi-model verification
   * @internal Set via setConsensusConfig() or setIntegrationConfig()
   */
  protected _consensusConfig?: DomainConsensusConfig;

  constructor(
    protected readonly eventBus: EventBus,
    protected readonly memory: MemoryBackend
  ) {}

  abstract get name(): DomainName;
  abstract get version(): string;
  abstract get dependencies(): DomainName[];

  isReady(): boolean {
    return this._initialized;
  }

  getHealth(): DomainHealth {
    return { ...this._health };
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;

    await this.onInitialize();
    this.subscribeToEvents();
    this._initialized = true;
  }

  async dispose(): Promise<void> {
    await this.onDispose();
    this._initialized = false;
  }

  async handleEvent(event: DomainEvent): Promise<void> {
    await this.onEvent(event);
  }

  abstract getAPI<T>(): T;

  // Override in subclasses
  protected async onInitialize(): Promise<void> {}
  protected async onDispose(): Promise<void> {}
  protected async onEvent(_event: DomainEvent): Promise<void> {}
  protected subscribeToEvents(): void {}

  // Helper methods
  protected async publishEvent<T>(type: string, payload: T): Promise<void> {
    const event: DomainEvent<T> = {
      id: crypto.randomUUID(),
      type,
      timestamp: new Date(),
      source: this.name,
      payload,
    };
    await this.eventBus.publish(event);
  }

  protected updateHealth(updates: Partial<DomainHealth>): void {
    this._health = { ...this._health, ...updates };
  }

  // ============================================================================
  // Integration Configuration (ADR-047, MM-006)
  // ============================================================================

  /**
   * Set MinCut bridge for topology awareness after construction
   * Alternative to constructor injection for domains that need late binding
   *
   * @param bridge - The QueenMinCutBridge instance to use
   *
   * @example
   * ```typescript
   * const plugin = new MyDomainPlugin(eventBus, memory, coordinator);
   * await plugin.initialize();
   *
   * // Later, when MinCut bridge is available:
   * plugin.setMinCutBridge(minCutBridge);
   * ```
   */
  setMinCutBridge(bridge: QueenMinCutBridge): void {
    this._minCutBridge = bridge;
    this.onMinCutBridgeSet(bridge);
  }

  /**
   * Get the current MinCut bridge (if set)
   * @returns The MinCut bridge or undefined if not configured
   */
  getMinCutBridge(): QueenMinCutBridge | undefined {
    return this._minCutBridge;
  }

  /**
   * Set consensus configuration for multi-model verification after construction
   * Alternative to constructor injection for domains that need late binding
   *
   * @param config - The consensus configuration to use
   *
   * @example
   * ```typescript
   * const plugin = new SecurityCompliancePlugin(eventBus, memory, coordinator);
   * plugin.setConsensusConfig({
   *   enabled: true,
   *   verifySeverities: ['critical', 'high'],
   *   autoApprovalThreshold: 0.9,
   * });
   * ```
   */
  setConsensusConfig(config: DomainConsensusConfig): void {
    this._consensusConfig = config;
    this.onConsensusConfigSet(config);
  }

  /**
   * Get the current consensus configuration (if set)
   * @returns The consensus configuration or undefined if not configured
   */
  getConsensusConfig(): DomainConsensusConfig | undefined {
    return this._consensusConfig;
  }

  /**
   * Set both MinCut and Consensus configuration at once
   * Convenience method for full integration setup
   *
   * @param config - Integration configuration containing optional MinCut and Consensus settings
   *
   * @example
   * ```typescript
   * plugin.setIntegrationConfig({
   *   minCutBridge: queenMinCutBridge,
   *   consensusConfig: {
   *     enabled: true,
   *     verifySeverities: ['critical', 'high'],
   *   },
   * });
   * ```
   */
  setIntegrationConfig(config: DomainPluginIntegrationConfig): void {
    if (config.minCutBridge) {
      this.setMinCutBridge(config.minCutBridge);
    }
    if (config.consensusConfig) {
      this.setConsensusConfig(config.consensusConfig);
    }
  }

  /**
   * Check if MinCut integration is configured and active
   * @returns true if MinCut bridge is set
   */
  hasMinCutIntegration(): boolean {
    return this._minCutBridge !== undefined;
  }

  /**
   * Check if consensus verification is enabled
   * @returns true if consensus is configured and enabled
   */
  hasConsensusEnabled(): boolean {
    return this._consensusConfig?.enabled === true;
  }

  // ============================================================================
  // Integration Hooks (Override in subclasses for custom behavior)
  // ============================================================================

  /**
   * Called when MinCut bridge is set
   * Override in subclasses to perform domain-specific setup
   *
   * @param _bridge - The MinCut bridge that was set
   */
  protected onMinCutBridgeSet(_bridge: QueenMinCutBridge): void {
    // Default: no-op - subclasses can override to register with the bridge
  }

  /**
   * Called when consensus configuration is set
   * Override in subclasses to perform domain-specific setup
   *
   * @param _config - The consensus configuration that was set
   */
  protected onConsensusConfigSet(_config: DomainConsensusConfig): void {
    // Default: no-op - subclasses can override to configure consensus verification
  }

  // ============================================================================
  // Task Execution (Queen-Domain Integration)
  // ============================================================================

  /**
   * Get task type to handler mapping
   * Override in subclasses to register domain-specific task handlers
   *
   * @example
   * protected override getTaskHandlers(): Map<string, TaskHandler> {
   *   return new Map([
   *     ['execute-tests', async (payload) => this.coordinator.execute(payload)],
   *     ['detect-flaky', async (payload) => this.coordinator.detectFlaky(payload)],
   *   ]);
   * }
   */
  protected getTaskHandlers(): Map<string, TaskHandler> {
    // Default: no handlers - subclasses override to provide domain-specific handlers
    return new Map();
  }

  /**
   * Check if domain can handle a task type
   * Based on registered task handlers
   */
  canHandleTask(taskType: string): boolean {
    return this.getTaskHandlers().has(taskType);
  }

  /**
   * Execute a task assigned by Queen Coordinator
   * Routes to the appropriate handler based on task type
   *
   * @param request - Task execution request from Queen
   * @param onComplete - Callback to report task completion
   * @returns Success if task was accepted, Error if no handler exists
   */
  async executeTask(
    request: DomainTaskRequest,
    onComplete: TaskCompletionCallback
  ): Promise<Result<void, Error>> {
    const handlers = this.getTaskHandlers();
    const handler = handlers.get(request.taskType);

    if (!handler) {
      return err(
        new Error(`Domain ${this.name} has no handler for task type: ${request.taskType}`)
      );
    }

    // Execute asynchronously, report via callback
    // Don't await - task runs in background and reports via callback
    this.runTaskAsync(request, handler, onComplete);

    // Return immediately - task was accepted
    return ok(undefined);
  }

  /**
   * Run task asynchronously and report completion via callback
   * Handles timing, success/failure, and error capture
   */
  private async runTaskAsync(
    request: DomainTaskRequest,
    handler: TaskHandler,
    onComplete: TaskCompletionCallback
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Execute the handler
      const result = await handler(request.payload);
      const duration = Date.now() - startTime;

      // Build result based on handler outcome
      const taskResult: DomainTaskResult = {
        taskId: request.taskId,
        success: result.success,
        data: result.success ? result.value : undefined,
        error: !result.success ? result.error?.message : undefined,
        duration,
      };

      // Report completion via callback
      await onComplete(taskResult);

      // Update health tracking
      this.updateHealth({
        lastActivity: new Date(),
        agents: {
          ...this._health.agents,
          active: Math.max(0, this._health.agents.active - 1),
          idle: this._health.agents.idle + 1,
        },
      });
    } catch (error) {
      // Handler threw an exception
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await onComplete({
        taskId: request.taskId,
        success: false,
        error: errorMessage,
        duration,
      });

      // Track error in health
      this.updateHealth({
        lastActivity: new Date(),
        errors: [...this._health.errors.slice(-9), errorMessage],
        agents: {
          ...this._health.agents,
          active: Math.max(0, this._health.agents.active - 1),
          failed: this._health.agents.failed + 1,
        },
      });
    }
  }
}
