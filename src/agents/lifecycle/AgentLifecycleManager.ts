/**
 * AgentLifecycleManager - Manages agent lifecycle state transitions
 *
 * Responsibilities:
 * - Status management (INITIALIZING, ACTIVE, IDLE, TERMINATING, TERMINATED, ERROR)
 * - Lifecycle state transitions with validation
 * - Hook coordination during lifecycle events
 * - State transition auditing
 *
 * Part of BaseAgent refactoring (Phase 1)
 * Reduces BaseAgent complexity by ~150 LOC
 */

import { AgentStatus, AgentId } from '../../types';

export interface LifecycleHooks {
  onPreInitialization?: () => Promise<void>;
  onPostInitialization?: () => Promise<void>;
  onPreTermination?: () => Promise<void>;
  onPostTermination?: () => Promise<void>;
}

export interface StateTransition {
  from: AgentStatus;
  to: AgentStatus;
  timestamp: Date;
  reason?: string;
}

export class AgentLifecycleManager {
  private status: AgentStatus = AgentStatus.INITIALIZING;
  private readonly agentId: AgentId;
  private readonly transitionHistory: StateTransition[] = [];
  private readonly validTransitions: Map<AgentStatus, Set<AgentStatus>>;
  private statusChangeCallback?: (status: AgentStatus) => void;

  constructor(agentId: AgentId) {
    this.agentId = agentId;
    this.validTransitions = this.buildTransitionMap();
  }

  /**
   * Set callback for status change events (for event-driven coordination)
   */
  public setStatusChangeCallback(callback: (status: AgentStatus) => void): void {
    this.statusChangeCallback = callback;
  }

  /**
   * Initialize the agent lifecycle
   * @param hooks Optional lifecycle hooks to execute
   */
  public async initialize(hooks?: LifecycleHooks): Promise<void> {
    this.validateTransition(this.status, AgentStatus.INITIALIZING);

    try {
      // Execute pre-initialization hook
      if (hooks?.onPreInitialization) {
        await hooks.onPreInitialization();
      }

      // Transition to IDLE (ready for tasks, not actively working)
      // ACTIVE is used when agent is processing a task
      this.transitionTo(AgentStatus.IDLE, 'Initialization complete');

      // Execute post-initialization hook
      if (hooks?.onPostInitialization) {
        await hooks.onPostInitialization();
      }

    } catch (error) {
      this.transitionTo(AgentStatus.ERROR, `Initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Terminate the agent lifecycle
   * @param hooks Optional lifecycle hooks to execute
   */
  public async terminate(hooks?: LifecycleHooks): Promise<void> {
    this.validateTransition(this.status, AgentStatus.TERMINATING);

    try {
      // Transition to TERMINATING
      this.transitionTo(AgentStatus.TERMINATING, 'Termination initiated');

      // Execute pre-termination hook
      if (hooks?.onPreTermination) {
        await hooks.onPreTermination();
      }

      // Transition to TERMINATED
      this.transitionTo(AgentStatus.TERMINATED, 'Termination complete');

      // Execute post-termination hook
      if (hooks?.onPostTermination) {
        await hooks.onPostTermination();
      }

    } catch (error) {
      this.transitionTo(AgentStatus.ERROR, `Termination failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get current agent status
   */
  public getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Check if agent is in a specific status
   */
  public isInStatus(status: AgentStatus): boolean {
    return this.status === status;
  }

  /**
   * Check if agent is active and can accept tasks
   */
  public canAcceptTasks(): boolean {
    return this.status === AgentStatus.ACTIVE || this.status === AgentStatus.IDLE;
  }

  /**
   * Mark agent as active (processing task)
   */
  public markActive(): void {
    this.validateTransition(this.status, AgentStatus.ACTIVE);
    this.transitionTo(AgentStatus.ACTIVE, 'Task execution started');
  }

  /**
   * Mark agent as idle (ready for next task)
   */
  public markIdle(): void {
    this.validateTransition(this.status, AgentStatus.IDLE);
    this.transitionTo(AgentStatus.IDLE, 'Task execution completed');
  }

  /**
   * Mark agent as errored
   */
  public markError(reason: string): void {
    this.transitionTo(AgentStatus.ERROR, reason);
  }

  /**
   * Get transition history
   */
  public getTransitionHistory(): StateTransition[] {
    return [...this.transitionHistory];
  }

  /**
   * Get time in current status
   */
  public getTimeInCurrentStatus(): number {
    const lastTransition = this.transitionHistory[this.transitionHistory.length - 1];
    if (!lastTransition) return 0;
    return Date.now() - lastTransition.timestamp.getTime();
  }

  /**
   * Validate if a state transition is allowed
   * @throws Error if transition is invalid
   */
  public validateTransition(from: AgentStatus, to: AgentStatus): void {
    // Allow same-state transitions
    if (from === to) return;

    // Check if transition is valid
    const validNextStates = this.validTransitions.get(from);
    if (!validNextStates || !validNextStates.has(to)) {
      throw new Error(
        `Invalid lifecycle transition for agent ${this.agentId.id}: ` +
        `Cannot transition from ${from} to ${to}`
      );
    }
  }

  /**
   * Internal method to perform state transition
   */
  public transitionTo(newStatus: AgentStatus, reason?: string): void {
    const transition: StateTransition = {
      from: this.status,
      to: newStatus,
      timestamp: new Date(),
      reason
    };

    this.status = newStatus;
    this.transitionHistory.push(transition);

    // Emit status change event for event-driven coordination
    if (this.statusChangeCallback) {
      this.statusChangeCallback(newStatus);
    }
  }

  /**
   * Build valid state transition map
   * Defines the finite state machine for agent lifecycle
   */
  private buildTransitionMap(): Map<AgentStatus, Set<AgentStatus>> {
    const map = new Map<AgentStatus, Set<AgentStatus>>();

    // INITIALIZING can transition to IDLE, ACTIVE, ERROR, or TERMINATING (for cleanup)
    // After initialization, agent should be IDLE (ready for tasks)
    map.set(AgentStatus.INITIALIZING, new Set<AgentStatus>([
      AgentStatus.IDLE,       // Normal completion: ready for tasks
      AgentStatus.ACTIVE,     // Legacy: some code may transition to ACTIVE
      AgentStatus.ERROR,
      AgentStatus.TERMINATING // Allow cleanup during initialization
    ]));

    // ACTIVE can transition to IDLE, TERMINATING, or ERROR
    map.set(AgentStatus.ACTIVE, new Set<AgentStatus>([
      AgentStatus.IDLE,
      AgentStatus.TERMINATING,
      AgentStatus.ERROR,
      AgentStatus.ACTIVE // Allow re-entry for task processing
    ]));

    // IDLE can transition to ACTIVE, TERMINATING, or ERROR
    map.set(AgentStatus.IDLE, new Set<AgentStatus>([
      AgentStatus.ACTIVE,
      AgentStatus.TERMINATING,
      AgentStatus.ERROR
    ]));

    // TERMINATING can transition to TERMINATED or ERROR
    map.set(AgentStatus.TERMINATING, new Set<AgentStatus>([
      AgentStatus.TERMINATED,
      AgentStatus.ERROR
    ]));

    // TERMINATED is typically a final state, but allow:
    // - TERMINATING for idempotent cleanup
    // - INITIALIZING for agent re-use after termination (via reset())
    map.set(AgentStatus.TERMINATED, new Set<AgentStatus>([
      AgentStatus.TERMINATING,  // Allow idempotent terminate() calls
      AgentStatus.INITIALIZING  // Allow re-initialization (reset)
    ]));

    // ERROR can transition to TERMINATING (for cleanup) or IDLE/ACTIVE (for recovery/retry)
    // Recovery path allows agents to be reused after non-fatal task errors
    map.set(AgentStatus.ERROR, new Set<AgentStatus>([
      AgentStatus.TERMINATING,
      AgentStatus.IDLE,   // Recovery: allow re-use after error
      AgentStatus.ACTIVE  // Direct recovery: allow immediate re-execution
    ]));

    return map;
  }

  /**
   * Get status statistics
   */
  public getStatusStatistics(): {
    currentStatus: AgentStatus;
    totalTransitions: number;
    timeInCurrentStatus: number;
    statusBreakdown: Map<AgentStatus, number>;
  } {
    const statusBreakdown = new Map<AgentStatus, number>();

    for (const transition of this.transitionHistory) {
      statusBreakdown.set(
        transition.to,
        (statusBreakdown.get(transition.to) || 0) + 1
      );
    }

    return {
      currentStatus: this.status,
      totalTransitions: this.transitionHistory.length,
      timeInCurrentStatus: this.getTimeInCurrentStatus(),
      statusBreakdown
    };
  }

  /**
   * Check if agent is terminating
   */
  public isTerminating(): boolean {
    return this.status === AgentStatus.TERMINATING || this.status === AgentStatus.TERMINATED;
  }

  /**
   * Reset agent lifecycle to INITIALIZING state
   * Useful for test scenarios and agent recovery
   * @param clearHistory Optional flag to clear transition history (default: false)
   */
  public reset(clearHistory: boolean = false): void {
    const previousStatus = this.status;

    // Allow reset from any state
    this.transitionTo(AgentStatus.INITIALIZING, `Reset from ${previousStatus}`);

    // Optionally clear history (useful for tests)
    if (clearHistory) {
      this.transitionHistory.length = 0;
    }
  }
}
