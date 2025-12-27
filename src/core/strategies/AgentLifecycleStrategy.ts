/**
 * AgentLifecycleStrategy - Strategy interface for agent lifecycle management
 *
 * Handles initialization, state transitions, hooks, and cleanup.
 * Part of Phase 2 (B1.3a) layered architecture refactoring.
 *
 * @module core/strategies/AgentLifecycleStrategy
 * @version 1.0.0
 */

import type { AgentStatus, PreTaskData, PostTaskData, TaskErrorData } from '../../types';

/**
 * Agent configuration subset needed for lifecycle
 */
export interface LifecycleConfig {
  agentId: string;
  agentType: string;
  enableHooks?: boolean;
  initializationTimeout?: number;
  shutdownTimeout?: number;
}

/**
 * Lifecycle state change event
 */
export interface LifecycleEvent {
  previousStatus: AgentStatus;
  newStatus: AgentStatus;
  timestamp: Date;
  reason?: string;
}

/**
 * AgentLifecycleStrategy interface
 *
 * Implementations:
 * - DefaultLifecycleStrategy: Standard initialization flow
 * - PooledLifecycleStrategy: For agent pooling (reusable agents)
 * - DistributedLifecycleStrategy: For distributed deployments
 */
export interface AgentLifecycleStrategy {
  /**
   * Initialize the agent lifecycle
   * @param config - Lifecycle configuration
   */
  initialize(config: LifecycleConfig): Promise<void>;

  /**
   * Get current agent status
   */
  getStatus(): AgentStatus;

  /**
   * Transition to a new status
   * @param status - Target status
   * @param reason - Optional reason for transition
   */
  transitionTo(status: AgentStatus, reason?: string): Promise<void>;

  /**
   * Wait for agent to reach a specific status
   * @param status - Target status to wait for
   * @param timeout - Timeout in milliseconds
   */
  waitForStatus(status: AgentStatus, timeout: number): Promise<void>;

  /**
   * Wait for agent to be ready (initialized)
   * @param timeout - Timeout in milliseconds
   */
  waitForReady(timeout: number): Promise<void>;

  /**
   * Shutdown the agent
   */
  shutdown(): Promise<void>;

  /**
   * Reset agent state for reuse (pooled lifecycle only)
   */
  reset?(): Promise<void>;

  // === Lifecycle Hooks ===

  /**
   * Called before task execution
   * @param data - Pre-task data
   */
  onPreTask?(data: PreTaskData): Promise<void>;

  /**
   * Called after successful task execution
   * @param data - Post-task data
   */
  onPostTask?(data: PostTaskData): Promise<void>;

  /**
   * Called when task execution fails
   * @param data - Error data
   */
  onTaskError?(data: TaskErrorData): Promise<void>;

  /**
   * Subscribe to lifecycle events
   * @param handler - Event handler
   */
  onLifecycleChange?(handler: (event: LifecycleEvent) => void): void;

  /**
   * Check if agent can accept new tasks
   */
  canAcceptTask(): boolean;

  /**
   * Get lifecycle metrics
   */
  getMetrics?(): LifecycleMetrics;
}

/**
 * Lifecycle metrics
 */
export interface LifecycleMetrics {
  initializationTime: number;
  uptime: number;
  stateTransitions: number;
  tasksExecuted: number;
  lastActivity: Date;
}

/**
 * Factory function type for creating lifecycle strategies
 */
export type LifecycleStrategyFactory = (config?: Partial<LifecycleConfig>) => AgentLifecycleStrategy;
