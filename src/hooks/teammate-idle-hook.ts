/**
 * TeammateIdle Hook - ADR-064, Phase 1B
 *
 * Monitors agents for idle state and auto-assigns pending tasks
 * from the task queue when an agent exceeds its idle threshold.
 * Uses dependency injection for the task queue to avoid circular
 * dependencies with the claim system.
 *
 * @module teammate-idle-hook
 * @version 1.0.0
 */

// =============================================================================
// Interfaces
// =============================================================================

/** A pending task that can be assigned to an idle agent. */
export interface PendingTask {
  /** Unique task identifier */
  readonly id: string;
  /** Domain the task belongs to */
  readonly domain: string;
  /** Priority level (p0 = highest) */
  readonly priority: string;
  /** Human-readable title */
  readonly title: string;
  /** When the task was created (epoch ms) */
  readonly createdAt: number;
}

/**
 * Abstraction over the claim/task system for dependency injection.
 * Allows the hook to query and claim tasks without importing ClaimService directly.
 */
export interface TaskQueue {
  /** Retrieve pending tasks filtered by domains and limited in count */
  getPendingTasks(filter: { readonly domains?: string[]; readonly limit?: number }): Promise<PendingTask[]>;
  /** Attempt to claim a task for an agent. Returns true on success. */
  claimTask(taskId: string, agentId: string): Promise<boolean>;
}

/** Configuration for the TeammateIdle hook. */
export interface TeammateIdleHookConfig {
  /** Idle threshold before hook fires (default: 5000ms) */
  readonly idleThresholdMs: number;
  /** Auto-assign from pending task queue */
  readonly autoAssign: boolean;
  /** Domains this agent can claim from */
  readonly claimableDomains: string[];
  /** Maximum tasks to assign per idle cycle */
  readonly maxAssignPerCycle: number;
  /** Whether to prefer same-domain tasks */
  readonly preferSameDomain: boolean;
  /** Priority threshold - only assign tasks at or above this priority (e.g. 'p1') */
  readonly minPriority?: string;
}

/** Result of an idle check. Describes the action taken when an agent becomes idle. */
export type IdleAction =
  | { readonly action: 'assigned'; readonly taskId: string; readonly domain: string }
  | { readonly action: 'wait'; readonly reason: string }
  | { readonly action: 'shutdown'; readonly reason: string };

// =============================================================================
// Internal Types
// =============================================================================

/** Tracked state for a single monitored agent */
interface AgentState {
  lastActivity: number;
  domain: string;
  monitoring: boolean;
}

/** Statistics snapshot returned by getStats() */
export interface TeammateIdleStats {
  readonly monitoredAgents: number;
  readonly idleAgents: number;
  readonly totalIdleEvents: number;
  readonly totalAssigned: number;
  readonly totalWaits: number;
}

/** Priority ordering map -- lower index = higher priority */
const PRIORITY_ORDER: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };

const DEFAULT_CONFIG: TeammateIdleHookConfig = {
  idleThresholdMs: 5000,
  autoAssign: true,
  claimableDomains: [],
  maxAssignPerCycle: 1,
  preferSameDomain: true,
  minPriority: undefined,
};

/** Default interval for periodic idle checking (ms) */
const DEFAULT_CHECK_INTERVAL_MS = 2000;

// =============================================================================
// TeammateIdleHook
// =============================================================================

/**
 * Hook that monitors agents for idle state and auto-assigns pending tasks.
 *
 * When an agent exceeds its configured idle threshold, the hook queries the
 * injected TaskQueue for pending work, applies domain and priority filters,
 * and attempts to claim a task on the agent's behalf.
 */
export class TeammateIdleHook {
  private readonly config: TeammateIdleHookConfig;
  private readonly taskQueue: TaskQueue | null;
  private readonly agents: Map<string, AgentState> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private checkIntervalMs: number;
  private idleCb: ((agentId: string, action: IdleAction) => void) | null = null;
  private assignCb: ((agentId: string, taskId: string, domain: string) => void) | null = null;
  private stats = { totalIdleEvents: 0, totalAssigned: 0, totalWaits: 0 };

  /**
   * @param config - Hook configuration (merged with defaults)
   * @param taskQueue - Optional task queue for auto-assignment
   * @param checkIntervalMs - Interval for periodic idle checking (default: 2000ms)
   */
  constructor(
    config?: Partial<TeammateIdleHookConfig>,
    taskQueue?: TaskQueue,
    checkIntervalMs?: number,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.taskQueue = taskQueue ?? null;
    this.checkIntervalMs = checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start monitoring an agent for idle state. Records current time as last
   * activity and begins periodic checking if not already running.
   * @param agentId - Unique identifier for the agent
   * @param domain - Domain the agent operates in
   */
  start(agentId: string, domain: string): void {
    if (this.agents.has(agentId)) {
      console.log(`[TeammateIdleHook] Agent ${agentId} already monitored, updating domain to ${domain}`);
    } else {
      console.log(`[TeammateIdleHook] Starting idle monitoring for agent ${agentId} in domain ${domain}`);
    }
    this.agents.set(agentId, { lastActivity: Date.now(), domain, monitoring: true });
    this.ensureCheckInterval();
  }

  /**
   * Stop monitoring an agent for idle state.
   * Clears the periodic interval if no agents remain.
   * @param agentId - Agent to stop monitoring
   */
  stop(agentId: string): void {
    if (!this.agents.has(agentId)) {
      console.log(`[TeammateIdleHook] Agent ${agentId} not found, nothing to stop`);
      return;
    }
    this.agents.delete(agentId);
    console.log(`[TeammateIdleHook] Stopped idle monitoring for agent ${agentId}`);
    if (this.agents.size === 0) this.clearCheckInterval();
  }

  /** Tear down the hook entirely, stopping all monitoring and clearing timers. */
  dispose(): void {
    console.log(`[TeammateIdleHook] Disposing — stopping all ${this.agents.size} monitored agents`);
    this.agents.clear();
    this.clearCheckInterval();
    this.idleCb = null;
    this.assignCb = null;
  }

  // ---------------------------------------------------------------------------
  // Activity Recording
  // ---------------------------------------------------------------------------

  /**
   * Record activity for an agent, resetting its idle timer.
   * Call this whenever the agent performs meaningful work.
   * @param agentId - Agent that performed activity
   */
  recordActivity(agentId: string): void {
    const state = this.agents.get(agentId);
    if (state) state.lastActivity = Date.now();
  }

  // ---------------------------------------------------------------------------
  // Idle Detection
  // ---------------------------------------------------------------------------

  /**
   * Manually check if an agent is idle and take action if so.
   * Also called automatically by the periodic checker.
   * @param agentId - Agent to check
   * @returns The idle action taken, or null if agent is not idle or not found
   */
  async checkIdle(agentId: string): Promise<IdleAction | null> {
    const state = this.agents.get(agentId);
    if (!state || !state.monitoring) return null;
    const elapsed = Date.now() - state.lastActivity;
    if (elapsed < this.config.idleThresholdMs) return null;
    return this.onIdle(agentId);
  }

  /**
   * Called when an agent exceeds the idle threshold.
   * Attempts to auto-assign a task if configured, otherwise returns a wait action.
   * @param agentId - The idle agent
   * @returns The action taken
   */
  async onIdle(agentId: string): Promise<IdleAction> {
    const state = this.agents.get(agentId);
    if (!state) {
      return { action: 'wait', reason: `agent ${agentId} not found` };
    }

    this.stats.totalIdleEvents++;
    console.log(`[TeammateIdleHook] Agent ${agentId} is idle (domain: ${state.domain})`);

    if (!this.config.autoAssign) {
      return this.waitResult(agentId, 'auto-assign disabled');
    }
    if (!this.taskQueue) {
      return this.waitResult(agentId, 'no task queue configured');
    }

    // Query pending tasks
    const domains = this.config.claimableDomains.length > 0
      ? this.config.claimableDomains
      : undefined;

    let tasks: PendingTask[];
    try {
      tasks = await this.taskQueue.getPendingTasks({
        domains,
        limit: this.config.maxAssignPerCycle * 3,
      });
    } catch (err) {
      console.log(`[TeammateIdleHook] Failed to fetch pending tasks: ${err}`);
      return this.waitResult(agentId, 'task queue error');
    }

    // Filter by minimum priority
    if (this.config.minPriority) {
      const threshold = PRIORITY_ORDER[this.config.minPriority];
      if (threshold !== undefined) {
        tasks = tasks.filter(t => {
          const taskPri = PRIORITY_ORDER[t.priority];
          return taskPri !== undefined && taskPri <= threshold;
        });
      }
    }

    if (tasks.length === 0) {
      return this.waitResult(agentId, 'no pending tasks');
    }

    // Sort: same-domain first if preferred, then by priority, then by creation time
    tasks = this.sortTasks(tasks, state.domain);

    // Try to claim the highest-priority task
    for (const task of tasks.slice(0, this.config.maxAssignPerCycle)) {
      try {
        const claimed = await this.taskQueue.claimTask(task.id, agentId);
        if (claimed) {
          state.lastActivity = Date.now();
          const result: IdleAction = { action: 'assigned', taskId: task.id, domain: task.domain };
          this.stats.totalAssigned++;
          this.notifyIdle(agentId, result);
          this.notifyAssign(agentId, task.id, task.domain);
          console.log(
            `[TeammateIdleHook] Assigned task ${task.id} (${task.domain}, ${task.priority}) to agent ${agentId}`,
          );
          return result;
        }
      } catch (err) {
        console.log(`[TeammateIdleHook] Failed to claim task ${task.id}: ${err}`);
      }
    }

    return this.waitResult(agentId, 'claim attempts failed');
  }

  // ---------------------------------------------------------------------------
  // Query Methods
  // ---------------------------------------------------------------------------

  /**
   * Get all agents currently past the idle threshold.
   * @returns Array of objects with agentId, domain, and idle duration
   */
  getIdleAgents(): Array<{ agentId: string; domain: string; idleSinceMs: number }> {
    const now = Date.now();
    const idle: Array<{ agentId: string; domain: string; idleSinceMs: number }> = [];
    for (const [agentId, state] of this.agents.entries()) {
      if (!state.monitoring) continue;
      const elapsed = now - state.lastActivity;
      if (elapsed >= this.config.idleThresholdMs) {
        idle.push({ agentId, domain: state.domain, idleSinceMs: elapsed });
      }
    }
    return idle;
  }

  /** Get monitoring statistics. */
  getStats(): TeammateIdleStats {
    return {
      monitoredAgents: this.agents.size,
      idleAgents: this.getIdleAgents().length,
      totalIdleEvents: this.stats.totalIdleEvents,
      totalAssigned: this.stats.totalAssigned,
      totalWaits: this.stats.totalWaits,
    };
  }

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

  /** Register a callback invoked when an agent becomes idle and an action is taken. */
  onIdleCallback(callback: (agentId: string, action: IdleAction) => void): void {
    this.idleCb = callback;
  }

  /** Register a callback invoked when a task is successfully assigned to an idle agent. */
  onAssignCallback(callback: (agentId: string, taskId: string, domain: string) => void): void {
    this.assignCb = callback;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /** Sort tasks by domain preference, priority, then creation time. */
  private sortTasks(tasks: PendingTask[], agentDomain: string): PendingTask[] {
    return [...tasks].sort((a, b) => {
      if (this.config.preferSameDomain) {
        const aSame = a.domain === agentDomain ? 0 : 1;
        const bSame = b.domain === agentDomain ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
      }
      const aPri = PRIORITY_ORDER[a.priority] ?? 999;
      const bPri = PRIORITY_ORDER[b.priority] ?? 999;
      if (aPri !== bPri) return aPri - bPri;
      return a.createdAt - b.createdAt;
    });
  }

  /** Build a wait result, notify callback, and bump stats. */
  private waitResult(agentId: string, reason: string): IdleAction {
    const result: IdleAction = { action: 'wait', reason };
    this.notifyIdle(agentId, result);
    this.stats.totalWaits++;
    return result;
  }

  /** Start the periodic idle check interval if not already running. */
  private ensureCheckInterval(): void {
    if (this.checkInterval !== null) return;
    this.checkInterval = setInterval(() => {
      void this.runIdleCheck();
    }, this.checkIntervalMs);
    // Allow the interval to not keep the process alive
    if (this.checkInterval && typeof this.checkInterval === 'object' && 'unref' in this.checkInterval) {
      (this.checkInterval as NodeJS.Timeout).unref();
    }
  }

  /** Clear the periodic idle check interval. */
  private clearCheckInterval(): void {
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /** Run idle check across all monitored agents. */
  private async runIdleCheck(): Promise<void> {
    const now = Date.now();
    for (const [agentId, state] of this.agents.entries()) {
      if (!state.monitoring) continue;
      if (now - state.lastActivity >= this.config.idleThresholdMs) {
        try {
          await this.onIdle(agentId);
        } catch (err) {
          console.log(`[TeammateIdleHook] Error during idle check for ${agentId}: ${err}`);
        }
      }
    }
  }

  /** Notify the idle callback if registered. */
  private notifyIdle(agentId: string, action: IdleAction): void {
    if (this.idleCb) {
      try { this.idleCb(agentId, action); } catch (err) {
        console.log(`[TeammateIdleHook] Idle callback error: ${err}`);
      }
    }
  }

  /** Notify the assign callback if registered. */
  private notifyAssign(agentId: string, taskId: string, domain: string): void {
    if (this.assignCb) {
      try { this.assignCb(agentId, taskId, domain); } catch (err) {
        console.log(`[TeammateIdleHook] Assign callback error: ${err}`);
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new TeammateIdleHook with the given configuration and task queue.
 * @param config - Partial configuration (merged with defaults)
 * @param taskQueue - Optional task queue for auto-assignment
 * @returns A new TeammateIdleHook instance
 */
export function createTeammateIdleHook(
  config?: Partial<TeammateIdleHookConfig>,
  taskQueue?: TaskQueue,
): TeammateIdleHook {
  return new TeammateIdleHook(config, taskQueue);
}
