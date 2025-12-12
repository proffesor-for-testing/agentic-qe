/**
 * DefaultLifecycleStrategy - Standard agent lifecycle implementation
 *
 * Provides the default initialization, state management, and cleanup behavior.
 * Wraps existing AgentLifecycleManager for backward compatibility.
 *
 * @module core/strategies/DefaultLifecycleStrategy
 * @version 1.0.0
 */

import { AgentStatus, PreTaskData, PostTaskData, TaskErrorData } from '../../types';
import type {
  AgentLifecycleStrategy,
  LifecycleConfig,
  LifecycleEvent,
  LifecycleMetrics,
} from './AgentLifecycleStrategy';

/**
 * DefaultLifecycleStrategy - Standard lifecycle management
 *
 * Uses a state machine for lifecycle transitions:
 * INITIALIZING → IDLE → ACTIVE → IDLE/ERROR → TERMINATED
 */
export class DefaultLifecycleStrategy implements AgentLifecycleStrategy {
  private status: AgentStatus = AgentStatus.INITIALIZING;
  private config?: LifecycleConfig;
  private initTime?: number;
  private startTime?: Date;
  private stateTransitions = 0;
  private tasksExecuted = 0;
  private lastActivity: Date = new Date();
  private lifecycleHandlers: Array<(event: LifecycleEvent) => void> = [];

  // Valid state transitions
  private readonly validTransitions: Record<AgentStatus, AgentStatus[]> = {
    [AgentStatus.INITIALIZING]: [AgentStatus.IDLE, AgentStatus.ERROR, AgentStatus.TERMINATED],
    [AgentStatus.IDLE]: [AgentStatus.ACTIVE, AgentStatus.TERMINATED, AgentStatus.ERROR, AgentStatus.STOPPING],
    [AgentStatus.ACTIVE]: [AgentStatus.IDLE, AgentStatus.ERROR, AgentStatus.TERMINATED, AgentStatus.BUSY],
    [AgentStatus.BUSY]: [AgentStatus.ACTIVE, AgentStatus.IDLE, AgentStatus.ERROR],
    [AgentStatus.ERROR]: [AgentStatus.IDLE, AgentStatus.TERMINATED, AgentStatus.STOPPING],
    [AgentStatus.STOPPING]: [AgentStatus.STOPPED, AgentStatus.TERMINATED],
    [AgentStatus.STOPPED]: [AgentStatus.TERMINATED, AgentStatus.IDLE],
    [AgentStatus.TERMINATING]: [AgentStatus.TERMINATED],
    [AgentStatus.TERMINATED]: [],
  };

  /**
   * Initialize the lifecycle strategy
   */
  async initialize(config: LifecycleConfig): Promise<void> {
    const startTime = performance.now();
    this.config = config;
    this.startTime = new Date();

    // Simulate initialization work
    await this.performInitialization();

    this.initTime = performance.now() - startTime;
    await this.transitionTo(AgentStatus.IDLE, 'Initialization complete');
  }

  /**
   * Override this in subclasses to customize initialization
   */
  protected async performInitialization(): Promise<void> {
    // Default: no additional initialization
  }

  /**
   * Get current agent status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Transition to a new status with validation
   */
  async transitionTo(newStatus: AgentStatus, reason?: string): Promise<void> {
    const validNextStates = this.validTransitions[this.status] || [];

    if (!validNextStates.includes(newStatus)) {
      throw new Error(
        `Invalid state transition: ${this.status} → ${newStatus}. ` +
          `Valid transitions: ${validNextStates.join(', ')}`
      );
    }

    const previousStatus = this.status;
    this.status = newStatus;
    this.stateTransitions++;
    this.lastActivity = new Date();

    // Notify lifecycle handlers
    const event: LifecycleEvent = {
      previousStatus,
      newStatus,
      timestamp: this.lastActivity,
      reason,
    };

    for (const handler of this.lifecycleHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('[DefaultLifecycleStrategy] Handler error:', error);
      }
    }
  }

  /**
   * Wait for agent to reach a specific status
   */
  async waitForStatus(targetStatus: AgentStatus, timeout: number): Promise<void> {
    if (this.status === targetStatus) {
      return;
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkStatus = () => {
        if (this.status === targetStatus) {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(
            new Error(
              `Timeout waiting for status '${targetStatus}'. Current: '${this.status}'`
            )
          );
          return;
        }

        setTimeout(checkStatus, 50);
      };

      checkStatus();
    });
  }

  /**
   * Wait for agent to be ready (idle)
   */
  async waitForReady(timeout: number): Promise<void> {
    return this.waitForStatus(AgentStatus.IDLE, timeout);
  }

  /**
   * Shutdown the agent
   */
  async shutdown(): Promise<void> {
    if (this.status === AgentStatus.TERMINATED) {
      return; // Already terminated
    }

    try {
      await this.performShutdown();
      await this.transitionTo(AgentStatus.TERMINATED, 'Shutdown complete');
    } catch (error) {
      await this.transitionTo(AgentStatus.ERROR, `Shutdown error: ${error}`);
      throw error;
    }
  }

  /**
   * Override this in subclasses to customize shutdown
   */
  protected async performShutdown(): Promise<void> {
    // Default: no additional shutdown
  }

  /**
   * Reset agent state for reuse (for PooledLifecycleStrategy)
   */
  async reset(): Promise<void> {
    if (this.status === AgentStatus.TERMINATED) {
      throw new Error('Cannot reset terminated agent');
    }

    this.tasksExecuted = 0;
    this.lastActivity = new Date();
    await this.transitionTo(AgentStatus.IDLE, 'Reset for reuse');
  }

  /**
   * Called before task execution
   */
  async onPreTask(data: PreTaskData): Promise<void> {
    if (this.status !== AgentStatus.IDLE && this.status !== AgentStatus.ACTIVE) {
      throw new Error(`Cannot execute task in status '${this.status}'`);
    }

    const taskId = data.assignment?.task?.id || 'unknown';
    await this.transitionTo(AgentStatus.ACTIVE, `Starting task: ${taskId}`);
    this.lastActivity = new Date();
  }

  /**
   * Called after successful task execution
   */
  async onPostTask(data: PostTaskData): Promise<void> {
    this.tasksExecuted++;
    this.lastActivity = new Date();
    const taskId = data.assignment?.task?.id || 'unknown';
    await this.transitionTo(AgentStatus.IDLE, `Completed task: ${taskId}`);
  }

  /**
   * Called when task execution fails
   */
  async onTaskError(data: TaskErrorData): Promise<void> {
    this.lastActivity = new Date();
    const canRetry = data.context?.canRetry !== false;
    // Don't transition to error for recoverable failures
    if (canRetry) {
      await this.transitionTo(AgentStatus.IDLE, `Recovered from error: ${data.error.message}`);
    } else {
      await this.transitionTo(AgentStatus.ERROR, `Task failed: ${data.error.message}`);
    }
  }

  /**
   * Subscribe to lifecycle events
   */
  onLifecycleChange(handler: (event: LifecycleEvent) => void): void {
    this.lifecycleHandlers.push(handler);
  }

  /**
   * Check if agent can accept new tasks
   */
  canAcceptTask(): boolean {
    return this.status === AgentStatus.IDLE || this.status === AgentStatus.ACTIVE;
  }

  /**
   * Get lifecycle metrics
   */
  getMetrics(): LifecycleMetrics {
    return {
      initializationTime: this.initTime ?? 0,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      stateTransitions: this.stateTransitions,
      tasksExecuted: this.tasksExecuted,
      lastActivity: this.lastActivity,
    };
  }
}

/**
 * PooledLifecycleStrategy - For agent pooling (reusable agents)
 *
 * Optimizes for fast reset and reuse instead of full initialization.
 */
export class PooledLifecycleStrategy extends DefaultLifecycleStrategy {
  private poolId?: string;
  private reuseCount = 0;

  /**
   * Faster reset for pooled agents
   */
  async reset(): Promise<void> {
    this.reuseCount++;
    await super.reset();
  }

  /**
   * Get pool-specific metrics
   */
  getPoolMetrics(): LifecycleMetrics & { reuseCount: number; poolId?: string } {
    return {
      ...this.getMetrics(),
      reuseCount: this.reuseCount,
      poolId: this.poolId,
    };
  }
}

/**
 * DisabledLifecycleStrategy - No-op for testing/benchmarks
 */
export class DisabledLifecycleStrategy implements AgentLifecycleStrategy {
  private status: AgentStatus = AgentStatus.IDLE;

  async initialize(): Promise<void> {
    this.status = AgentStatus.IDLE;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  async transitionTo(status: AgentStatus): Promise<void> {
    this.status = status;
  }

  async waitForStatus(): Promise<void> {
    // No-op
  }

  async waitForReady(): Promise<void> {
    // No-op
  }

  async shutdown(): Promise<void> {
    this.status = AgentStatus.TERMINATED;
  }

  async onPreTask(): Promise<void> {
    this.status = AgentStatus.ACTIVE;
  }

  async onPostTask(): Promise<void> {
    this.status = AgentStatus.IDLE;
  }

  async onTaskError(): Promise<void> {
    this.status = AgentStatus.IDLE;
  }

  canAcceptTask(): boolean {
    return this.status === AgentStatus.IDLE || this.status === AgentStatus.ACTIVE;
  }
}

/**
 * Factory function for creating lifecycle strategies
 */
export function createLifecycleStrategy(
  type: 'default' | 'pooled' | 'disabled' = 'default'
): AgentLifecycleStrategy {
  switch (type) {
    case 'pooled':
      return new PooledLifecycleStrategy();
    case 'disabled':
      return new DisabledLifecycleStrategy();
    default:
      return new DefaultLifecycleStrategy();
  }
}
