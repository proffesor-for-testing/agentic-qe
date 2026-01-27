/**
 * Agentic QE v3 - Base Domain Interface
 * Template for all domain implementations
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

/**
 * Task handler function type
 * Handlers receive the task payload and return a result
 */
export type TaskHandler = (
  payload: Record<string, unknown>
) => Promise<Result<unknown, Error>>;

/**
 * Abstract base class for domain plugins
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
