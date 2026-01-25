/**
 * LifecycleManagerAdapter - Adapts AgentLifecycleManager to AgentLifecycleStrategy
 *
 * Provides backward compatibility during the B1.2 migration.
 * Wraps the existing AgentLifecycleManager to implement the strategy interface.
 *
 * @module agents/adapters/LifecycleManagerAdapter
 * @version 1.0.0
 */

import type {
  AgentLifecycleStrategy,
  LifecycleConfig,
  LifecycleEvent,
  LifecycleMetrics,
} from '../../core/strategies';
import type { AgentStatus, PreTaskData, PostTaskData, TaskErrorData } from '../../types';
import { AgentLifecycleManager } from '../lifecycle/AgentLifecycleManager';
import { AgentStatus as Status } from '../../types';

/**
 * Adapts AgentLifecycleManager to AgentLifecycleStrategy interface
 *
 * This adapter allows BaseAgent to use the strategy interface while
 * maintaining backward compatibility with existing AgentLifecycleManager.
 */
export class LifecycleManagerAdapter implements AgentLifecycleStrategy {
  private readonly manager: AgentLifecycleManager;
  private config?: LifecycleConfig;
  private lifecycleHandler?: (event: LifecycleEvent) => void;
  private tasksExecuted = 0;
  private initTime = 0;
  private startTime = Date.now();

  constructor(manager: AgentLifecycleManager) {
    this.manager = manager;
  }

  async initialize(config: LifecycleConfig): Promise<void> {
    this.config = config;
    this.initTime = Date.now();
    // Manager is already initialized by BaseAgent constructor
    // This is called when using the strategy pattern
  }

  getStatus(): AgentStatus {
    return this.manager.getStatus();
  }

  async transitionTo(status: AgentStatus, reason?: string): Promise<void> {
    const previousStatus = this.getStatus();

    // Map to manager methods
    switch (status) {
      case Status.ACTIVE:
        this.manager.markActive();
        break;
      case Status.IDLE:
        this.manager.markIdle();
        break;
      case Status.ERROR:
        this.manager.markError(reason || 'Unknown error');
        break;
      default:
        // Use the manager's transitionTo for other statuses
        this.manager.transitionTo(status, reason);
    }

    // Emit lifecycle event if handler registered
    if (this.lifecycleHandler) {
      this.lifecycleHandler({
        previousStatus,
        newStatus: status,
        timestamp: new Date(),
        reason,
      });
    }
  }

  async waitForStatus(status: AgentStatus, timeout: number): Promise<void> {
    // Poll for status change
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this.getStatus() === status) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timeout waiting for status ${status} after ${timeout}ms`);
  }

  async waitForReady(timeout: number): Promise<void> {
    // Wait for ACTIVE or IDLE status
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const current = this.getStatus();
      if (current === Status.ACTIVE || current === Status.IDLE) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timeout waiting for ready state after ${timeout}ms`);
  }

  async shutdown(): Promise<void> {
    await this.manager.terminate({});
  }

  async reset(): Promise<void> {
    this.manager.reset(false);
    this.tasksExecuted = 0;
  }

  // Lifecycle hooks - these can be overridden by subclasses
  async onPreTask(_data: PreTaskData): Promise<void> {
    // Default: no-op, can be overridden
  }

  async onPostTask(_data: PostTaskData): Promise<void> {
    this.tasksExecuted++;
  }

  async onTaskError(_data: TaskErrorData): Promise<void> {
    // Default: no-op, can be overridden
  }

  onLifecycleChange(handler: (event: LifecycleEvent) => void): void {
    this.lifecycleHandler = handler;
  }

  canAcceptTask(): boolean {
    const status = this.getStatus();
    return status === Status.ACTIVE || status === Status.IDLE;
  }

  getMetrics(): LifecycleMetrics {
    return {
      initializationTime: this.initTime ? Date.now() - this.initTime : 0,
      uptime: Date.now() - this.startTime,
      stateTransitions: 0, // Would need manager to expose this
      tasksExecuted: this.tasksExecuted,
      lastActivity: new Date(),
    };
  }
}

/**
 * Create a lifecycle strategy adapter from an existing manager
 */
export function createLifecycleAdapter(
  manager: AgentLifecycleManager
): AgentLifecycleStrategy {
  return new LifecycleManagerAdapter(manager);
}
