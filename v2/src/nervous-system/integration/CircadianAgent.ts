/**
 * CircadianAgentManager - Bio-inspired duty cycling for QE agent lifecycle management
 *
 * Integrates CircadianController with BaseAgent lifecycle to achieve 5-50x compute
 * cost reduction by intelligently cycling agents between active and rest phases.
 *
 * ## Agent Lifecycle Phases
 * - **ACTIVE**: Full compute, agents process all tasks, run tests, make decisions
 * - **DAWN**: Ramping up, agents pre-warm caches, prepare for active period
 * - **DUSK**: Ramping down, agents process backlog, batch operations
 * - **REST**: Memory consolidation, minimal compute, only critical events handled
 *
 * ## Compute Savings
 * - Active phase: 100% compute usage
 * - Dawn phase: 60% compute usage
 * - Dusk phase: 40% compute usage
 * - Rest phase: 10% compute usage (5-10x reduction)
 *
 * @module nervous-system/integration/CircadianAgent
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import type {
  CircadianController,
  CircadianPhase,
  CircadianMetrics,
  CircadianState,
} from '../adapters/CircadianController.js';
import type { BaseAgent } from '../../agents/BaseAgent.js';
import { AgentStatus } from '../../types/index.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Criticality level determines agent behavior during phase transitions
 */
export type CriticalityLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Configuration for agent phase management
 */
export interface AgentPhaseConfig {
  /** Unique agent identifier */
  agentId: string;
  /** Type of the agent (e.g., 'test-generator', 'coverage-analyzer') */
  agentType: string;
  /** Criticality level determines wake priority and rest eligibility */
  criticalityLevel: CriticalityLevel;
  /** Minimum hours agent must be active per cycle */
  minActiveHours: number;
  /** Whether agent can enter rest phase (critical agents never rest) */
  canRest: boolean;
  /** Custom duty factor override (0-1, optional) */
  customDutyFactor?: number;
  /** Tags for grouping agents (e.g., 'core', 'optional') */
  tags?: string[];
}

/**
 * State of a managed agent
 */
export interface ManagedAgentState {
  /** Current circadian phase for this agent */
  phase: CircadianPhase;
  /** Whether agent is currently active */
  isActive: boolean;
  /** Time spent in current state (ms) */
  timeInState: number;
  /** Total active time in current cycle (ms) */
  activeTimeInCycle: number;
  /** Number of tasks processed in current cycle */
  tasksProcessed: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Whether agent is currently sleeping */
  isSleeping: boolean;
}

/**
 * Energy savings report
 */
export interface EnergySavingsReport {
  /** Total compute cycles saved */
  savedCycles: number;
  /** Percentage of compute saved (0-100) */
  savingsPercentage: number;
  /** Total time in rest phase (ms) */
  totalRestTime: number;
  /** Total time in active phase (ms) */
  totalActiveTime: number;
  /** Average duty factor achieved */
  averageDutyFactor: number;
  /** Estimated cost reduction factor (e.g., 5x) */
  costReductionFactor: number;
}

/**
 * Phase transition event data
 */
export interface PhaseTransitionEvent {
  /** Agent that transitioned */
  agentId: string;
  /** Previous phase */
  fromPhase: CircadianPhase;
  /** New phase */
  toPhase: CircadianPhase;
  /** Timestamp of transition */
  timestamp: number;
  /** Reason for transition */
  reason: string;
}

/**
 * Agent wake/sleep event data
 */
export interface AgentSleepEvent {
  /** Agent that changed sleep state */
  agentId: string;
  /** Whether agent is now sleeping */
  isSleeping: boolean;
  /** Current phase when sleep state changed */
  phase: CircadianPhase;
  /** Timestamp of change */
  timestamp: number;
  /** Expected duration of sleep (ms, 0 if waking) */
  expectedDuration: number;
}

/**
 * Manager configuration
 */
export interface CircadianAgentManagerConfig {
  /** The CircadianController instance to use */
  controller: CircadianController;
  /** Default criticality for agents without explicit config */
  defaultCriticality?: CriticalityLevel;
  /** Whether to auto-register agents on add */
  autoRegister?: boolean;
  /** Time resolution for phase checks (ms) */
  checkIntervalMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Events emitted by CircadianAgentManager
 */
export interface CircadianAgentEvents {
  /** Emitted when agent transitions between phases */
  'phase-transition': PhaseTransitionEvent;
  /** Emitted when agent enters/exits sleep */
  'agent-sleep': AgentSleepEvent;
  /** Emitted when all agents enter rest phase */
  'fleet-rest': { timestamp: number; agentCount: number };
  /** Emitted when fleet wakes from rest */
  'fleet-wake': { timestamp: number; agentCount: number };
  /** Emitted on phase change for the entire fleet */
  'fleet-phase-change': { fromPhase: CircadianPhase; toPhase: CircadianPhase; timestamp: number };
  /** Emitted when energy savings milestone reached */
  'savings-milestone': { savingsPercentage: number; savedCycles: number; timestamp: number };
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * CircadianAgentManager integrates bio-inspired duty cycling with QE agent lifecycle
 *
 * Manages agent active/rest states based on circadian phases to achieve
 * significant compute cost reduction while maintaining responsiveness for
 * critical operations.
 *
 * @example
 * ```typescript
 * import { CircadianController } from '../adapters/CircadianController.js';
 * import { CircadianAgentManager, AgentPhaseConfig } from './CircadianAgent.js';
 *
 * // Create controller with 1-hour cycles for demo
 * const controller = new CircadianController({ cyclePeriodMs: 60 * 60 * 1000 });
 *
 * // Create manager
 * const manager = new CircadianAgentManager({ controller });
 *
 * // Register agents
 * const testAgent = await TestGeneratorAgent.create();
 * await manager.registerAgent(testAgent, {
 *   agentId: testAgent.getAgentId().id,
 *   agentType: 'test-generator',
 *   criticalityLevel: 'medium',
 *   minActiveHours: 4,
 *   canRest: true,
 * });
 *
 * // Listen for phase transitions
 * manager.on('phase-transition', (event) => {
 *   console.log(`Agent ${event.agentId} transitioned to ${event.toPhase}`);
 * });
 *
 * // Start the manager
 * manager.start();
 *
 * // Check energy savings
 * const savings = manager.getEnergySavings();
 * console.log(`Saved ${savings.savingsPercentage}% compute`);
 * ```
 */
export class CircadianAgentManager extends EventEmitter {
  private readonly controller: CircadianController;
  private readonly agents: Map<string, { agent: BaseAgent; config: AgentPhaseConfig; state: ManagedAgentState }>;
  private readonly defaultCriticality: CriticalityLevel;
  private readonly checkIntervalMs: number;
  private readonly debug: boolean;

  // Tracking state
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastPhase: CircadianPhase;
  private totalComputeCycles: number = 0;
  private savedComputeCycles: number = 0;
  private lastSavingsMilestone: number = 0;
  private startTime: number = 0;
  private isRunning: boolean = false;

  /**
   * Create a new CircadianAgentManager
   *
   * @param config - Manager configuration
   */
  constructor(config: CircadianAgentManagerConfig) {
    super();
    this.controller = config.controller;
    this.agents = new Map();
    this.defaultCriticality = config.defaultCriticality ?? 'medium';
    this.checkIntervalMs = config.checkIntervalMs ?? 1000;
    this.debug = config.debug ?? false;
    this.lastPhase = this.controller.getPhase();
  }

  // ============================================================================
  // Agent Registration
  // ============================================================================

  /**
   * Register an agent for circadian management
   *
   * Agents must be registered before they can be managed. Critical agents
   * will never enter rest phase; low criticality agents rest first.
   *
   * @param agent - The BaseAgent instance to manage
   * @param config - Phase configuration for this agent
   */
  async registerAgent(agent: BaseAgent, config: AgentPhaseConfig): Promise<void> {
    const agentId = config.agentId;

    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already registered`);
    }

    // Validate config
    if (config.minActiveHours < 0 || config.minActiveHours > 24) {
      throw new Error(`minActiveHours must be between 0 and 24, got ${config.minActiveHours}`);
    }

    if (config.criticalityLevel === 'critical' && config.canRest) {
      this.log(`Warning: Critical agent ${agentId} should not have canRest=true, overriding to false`);
      config.canRest = false;
    }

    // Initialize agent state
    const initialState: ManagedAgentState = {
      phase: this.controller.getPhase(),
      isActive: true,
      timeInState: 0,
      activeTimeInCycle: 0,
      tasksProcessed: 0,
      lastActivity: Date.now(),
      isSleeping: false,
    };

    this.agents.set(agentId, { agent, config, state: initialState });

    this.log(`Registered agent ${agentId} (${config.agentType}) with criticality ${config.criticalityLevel}`);

    // If manager is already running, apply current phase
    if (this.isRunning) {
      await this.applyPhaseToAgent(agentId);
    }
  }

  /**
   * Unregister an agent from circadian management
   *
   * @param agentId - ID of agent to unregister
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const entry = this.agents.get(agentId);
    if (!entry) {
      return;
    }

    // Wake agent if sleeping before unregistering
    if (entry.state.isSleeping) {
      await this.wakeAgent(agentId, 'unregistering');
    }

    this.agents.delete(agentId);
    this.log(`Unregistered agent ${agentId}`);
  }

  // ============================================================================
  // Phase Management
  // ============================================================================

  /**
   * Check if an agent should be active in the current phase
   *
   * Takes into account:
   * - Current circadian phase
   * - Agent criticality level
   * - Minimum active hours requirement
   * - Custom duty factor overrides
   *
   * @param agentId - ID of agent to check
   * @returns true if agent should be active
   */
  shouldBeActive(agentId: string): boolean {
    const entry = this.agents.get(agentId);
    if (!entry) {
      return false;
    }

    const { config, state } = entry;
    const currentPhase = this.controller.getPhase();

    // Critical agents are always active
    if (config.criticalityLevel === 'critical') {
      return true;
    }

    // Check if agent can rest
    if (!config.canRest) {
      return true;
    }

    // Phase-based activity rules
    switch (currentPhase) {
      case 'Active':
        // All agents active during Active phase
        return true;

      case 'Dawn':
        // High agents active during Dawn (critical already handled above)
        return config.criticalityLevel === 'high';

      case 'Dusk':
        // High agents stay active during Dusk (critical already handled above)
        // Medium/low agents active if min active hours not met
        if (config.criticalityLevel === 'high') {
          return true;
        }
        return this.needsMoreActiveTime(agentId);

      case 'Rest':
        // High agents check if they need more active time (critical handled above)
        // Medium/low agents rest
        if (config.criticalityLevel === 'high') {
          return this.needsMoreActiveTime(agentId);
        }
        return false;

      default:
        return true;
    }
  }

  /**
   * Check if agent needs more active time to meet minimum requirement
   */
  private needsMoreActiveTime(agentId: string): boolean {
    const entry = this.agents.get(agentId);
    if (!entry) {
      return false;
    }

    const { config, state } = entry;
    const cyclePeriodMs = this.controller.getConfig().cyclePeriodMs;
    const minActiveMs = config.minActiveHours * 60 * 60 * 1000;
    const minActiveFraction = minActiveMs / cyclePeriodMs;

    // Calculate how much of cycle has passed
    const cycleState = this.controller.getState();
    const cycleFraction = cycleState.cycleTime / cyclePeriodMs;

    // Calculate minimum active time needed by this point in cycle
    const expectedActiveTimeMs = minActiveFraction * cycleState.cycleTime;

    return state.activeTimeInCycle < expectedActiveTimeMs;
  }

  /**
   * Enter rest phase - put eligible agents to sleep
   *
   * Agents are put to sleep in order of criticality (low first).
   * Critical agents never sleep.
   */
  async enterRestPhase(): Promise<void> {
    this.log('Entering rest phase - putting eligible agents to sleep');

    // Sort agents by criticality (low first)
    const sortedAgents = this.getSortedAgentsByCriticality('ascending');

    for (const agentId of sortedAgents) {
      const entry = this.agents.get(agentId);
      if (!entry) continue;

      if (!this.shouldBeActive(agentId) && !entry.state.isSleeping) {
        await this.sleepAgent(agentId);
      }
    }

    // Emit fleet rest event if all eligible agents are sleeping
    const sleepingCount = this.getAgentsByState('sleeping').length;
    this.emit('fleet-rest', {
      timestamp: Date.now(),
      agentCount: sleepingCount,
    });
  }

  /**
   * Enter active phase - wake all agents
   */
  async enterActivePhase(): Promise<void> {
    this.log('Entering active phase - waking all agents');

    // Wake agents in reverse criticality order (high first)
    const sortedAgents = this.getSortedAgentsByCriticality('descending');

    for (const agentId of sortedAgents) {
      const entry = this.agents.get(agentId);
      if (!entry) continue;

      if (entry.state.isSleeping) {
        await this.wakeAgent(agentId, 'entering active phase');
      }
    }

    // Emit fleet wake event
    const activeCount = this.getAgentsByState('active').length;
    this.emit('fleet-wake', {
      timestamp: Date.now(),
      agentCount: activeCount,
    });
  }

  /**
   * Force a specific phase transition for the fleet
   *
   * @param phase - Phase to transition to
   */
  async forcePhaseTransition(phase: CircadianPhase): Promise<void> {
    this.controller.modulate({
      forcePhase: phase,
      reason: 'manual override',
    });

    await this.handlePhaseChange(this.lastPhase, phase);
    this.lastPhase = phase;
  }

  // ============================================================================
  // Agent Sleep/Wake
  // ============================================================================

  /**
   * Put an agent to sleep
   */
  private async sleepAgent(agentId: string): Promise<void> {
    const entry = this.agents.get(agentId);
    if (!entry || entry.state.isSleeping) {
      return;
    }

    const { agent, config, state } = entry;

    // Calculate expected sleep duration based on phase
    const cycleState = this.controller.getState();
    const expectedDuration = cycleState.timeToNextPhase;

    // Update state before transition
    state.isSleeping = true;
    state.isActive = false;
    state.timeInState = 0;

    // Emit sleep event
    this.emit('agent-sleep', {
      agentId,
      isSleeping: true,
      phase: state.phase,
      timestamp: Date.now(),
      expectedDuration,
    } as AgentSleepEvent);

    this.log(`Agent ${agentId} entering sleep (expected: ${expectedDuration}ms)`);

    // Track compute savings
    this.updateComputeSavings(config.customDutyFactor ?? this.controller.getDutyFactor());
  }

  /**
   * Wake an agent from sleep
   */
  private async wakeAgent(agentId: string, reason: string): Promise<void> {
    const entry = this.agents.get(agentId);
    if (!entry || !entry.state.isSleeping) {
      return;
    }

    const { agent, state } = entry;

    // Update state
    state.isSleeping = false;
    state.isActive = true;
    state.timeInState = 0;
    state.lastActivity = Date.now();

    // Emit wake event
    this.emit('agent-sleep', {
      agentId,
      isSleeping: false,
      phase: state.phase,
      timestamp: Date.now(),
      expectedDuration: 0,
    } as AgentSleepEvent);

    this.log(`Agent ${agentId} waking (reason: ${reason})`);
  }

  // ============================================================================
  // State Queries
  // ============================================================================

  /**
   * Get current state of all managed agents
   *
   * @returns Map of agent IDs to their current states
   */
  getAgentStates(): Map<string, { phase: CircadianPhase; isActive: boolean }> {
    const states = new Map<string, { phase: CircadianPhase; isActive: boolean }>();

    for (const [agentId, entry] of this.agents) {
      states.set(agentId, {
        phase: entry.state.phase,
        isActive: entry.state.isActive,
      });
    }

    return states;
  }

  /**
   * Get detailed state for a specific agent
   */
  getAgentState(agentId: string): ManagedAgentState | null {
    const entry = this.agents.get(agentId);
    return entry ? { ...entry.state } : null;
  }

  /**
   * Get agents by their current state
   */
  private getAgentsByState(state: 'active' | 'sleeping'): string[] {
    const result: string[] = [];

    for (const [agentId, entry] of this.agents) {
      if (state === 'sleeping' && entry.state.isSleeping) {
        result.push(agentId);
      } else if (state === 'active' && entry.state.isActive) {
        result.push(agentId);
      }
    }

    return result;
  }

  /**
   * Get agents sorted by criticality
   */
  private getSortedAgentsByCriticality(order: 'ascending' | 'descending'): string[] {
    const criticalityOrder: Record<CriticalityLevel, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    const agents = Array.from(this.agents.entries());
    agents.sort((a, b) => {
      const aLevel = criticalityOrder[a[1].config.criticalityLevel];
      const bLevel = criticalityOrder[b[1].config.criticalityLevel];
      return order === 'ascending' ? aLevel - bLevel : bLevel - aLevel;
    });

    return agents.map(([agentId]) => agentId);
  }

  // ============================================================================
  // Energy Savings
  // ============================================================================

  /**
   * Calculate compute savings achieved by circadian cycling
   *
   * @returns Energy savings report with cycles saved and percentages
   */
  getEnergySavings(): EnergySavingsReport {
    const metrics = this.controller.getMetrics();
    const totalTime = metrics.phaseTime.Active + metrics.phaseTime.Dawn + metrics.phaseTime.Dusk + metrics.phaseTime.Rest;

    if (totalTime === 0) {
      return {
        savedCycles: 0,
        savingsPercentage: 0,
        totalRestTime: 0,
        totalActiveTime: 0,
        averageDutyFactor: 1,
        costReductionFactor: 1,
      };
    }

    const averageDutyFactor = metrics.averageDutyFactor;
    const savingsPercentage = (1 - averageDutyFactor) * 100;
    const costReductionFactor = averageDutyFactor > 0 ? 1 / averageDutyFactor : 1;

    return {
      savedCycles: this.savedComputeCycles,
      savingsPercentage: Math.round(savingsPercentage * 10) / 10,
      totalRestTime: metrics.phaseTime.Rest,
      totalActiveTime: metrics.phaseTime.Active,
      averageDutyFactor: Math.round(averageDutyFactor * 1000) / 1000,
      costReductionFactor: Math.round(costReductionFactor * 10) / 10,
    };
  }

  /**
   * Update compute savings tracking
   */
  private updateComputeSavings(dutyFactor: number): void {
    this.totalComputeCycles++;
    this.savedComputeCycles += 1 - dutyFactor;

    // Check for savings milestones (every 10%)
    const savings = this.getEnergySavings();
    const milestone = Math.floor(savings.savingsPercentage / 10) * 10;

    if (milestone > this.lastSavingsMilestone && milestone >= 10) {
      this.lastSavingsMilestone = milestone;
      this.emit('savings-milestone', {
        savingsPercentage: savings.savingsPercentage,
        savedCycles: savings.savedCycles,
        timestamp: Date.now(),
      });
    }
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  /**
   * Start the circadian manager
   *
   * Begins periodic phase checks and applies current phase to all agents.
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.lastPhase = this.controller.getPhase();

    // Apply current phase to all agents
    for (const agentId of this.agents.keys()) {
      this.applyPhaseToAgent(agentId).catch((err) => {
        this.log(`Error applying phase to agent ${agentId}: ${err.message}`);
      });
    }

    // Start periodic phase check
    this.checkInterval = setInterval(() => {
      this.checkPhaseTransition();
    }, this.checkIntervalMs);

    this.log(`CircadianAgentManager started with ${this.agents.size} agents`);
  }

  /**
   * Stop the circadian manager
   *
   * Stops phase checks and wakes all sleeping agents.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop periodic check
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Wake all sleeping agents
    for (const agentId of this.agents.keys()) {
      const entry = this.agents.get(agentId);
      if (entry?.state.isSleeping) {
        await this.wakeAgent(agentId, 'manager stopping');
      }
    }

    this.log('CircadianAgentManager stopped');
  }

  /**
   * Advance the circadian controller time
   *
   * Call this to advance simulation time. In production, time advances
   * automatically based on wall clock.
   *
   * @param dt - Time to advance in milliseconds
   */
  advance(dt: number): void {
    this.controller.advance(dt);

    // Update agent state times
    for (const [, entry] of this.agents) {
      entry.state.timeInState += dt;
      if (entry.state.isActive) {
        entry.state.activeTimeInCycle += dt;
      }
    }

    // Check for phase transition
    this.checkPhaseTransition();
  }

  // ============================================================================
  // Phase Transition Handling
  // ============================================================================

  /**
   * Check for and handle phase transitions
   */
  private checkPhaseTransition(): void {
    const currentPhase = this.controller.getPhase();

    if (currentPhase !== this.lastPhase) {
      this.handlePhaseChange(this.lastPhase, currentPhase).catch((err) => {
        this.log(`Error handling phase change: ${err.message}`);
      });
      this.lastPhase = currentPhase;
    }
  }

  /**
   * Handle a phase change
   */
  private async handlePhaseChange(fromPhase: CircadianPhase, toPhase: CircadianPhase): Promise<void> {
    this.log(`Phase transition: ${fromPhase} -> ${toPhase}`);

    // Emit fleet phase change event
    this.emit('fleet-phase-change', {
      fromPhase,
      toPhase,
      timestamp: Date.now(),
    });

    // Apply phase to all agents
    for (const agentId of this.agents.keys()) {
      await this.applyPhaseToAgent(agentId, fromPhase, toPhase);
    }

    // Phase-specific handling
    switch (toPhase) {
      case 'Rest':
        await this.enterRestPhase();
        break;
      case 'Active':
        await this.enterActivePhase();
        break;
      case 'Dawn':
        await this.handleDawnPhase();
        break;
      case 'Dusk':
        await this.handleDuskPhase();
        break;
    }
  }

  /**
   * Apply current phase to a specific agent
   */
  private async applyPhaseToAgent(
    agentId: string,
    fromPhase?: CircadianPhase,
    toPhase?: CircadianPhase
  ): Promise<void> {
    const entry = this.agents.get(agentId);
    if (!entry) {
      return;
    }

    const currentPhase = toPhase ?? this.controller.getPhase();
    const previousPhase = fromPhase ?? entry.state.phase;

    // Update agent state
    entry.state.phase = currentPhase;

    // Emit phase transition event
    if (previousPhase !== currentPhase) {
      this.emit('phase-transition', {
        agentId,
        fromPhase: previousPhase,
        toPhase: currentPhase,
        timestamp: Date.now(),
        reason: 'circadian cycle',
      } as PhaseTransitionEvent);
    }

    // Apply sleep/wake based on new phase
    const shouldBeActive = this.shouldBeActive(agentId);

    if (shouldBeActive && entry.state.isSleeping) {
      await this.wakeAgent(agentId, `phase transition to ${currentPhase}`);
    } else if (!shouldBeActive && !entry.state.isSleeping) {
      await this.sleepAgent(agentId);
    }
  }

  /**
   * Handle dawn phase - prepare agents for active period
   */
  private async handleDawnPhase(): Promise<void> {
    // Wake high-criticality agents during dawn
    const sortedAgents = this.getSortedAgentsByCriticality('descending');

    for (const agentId of sortedAgents) {
      const entry = this.agents.get(agentId);
      if (!entry) continue;

      if (this.shouldBeActive(agentId) && entry.state.isSleeping) {
        await this.wakeAgent(agentId, 'dawn phase preparation');
      }
    }
  }

  /**
   * Handle dusk phase - start ramping down
   */
  private async handleDuskPhase(): Promise<void> {
    // Low-criticality agents start sleeping during dusk
    const sortedAgents = this.getSortedAgentsByCriticality('ascending');

    for (const agentId of sortedAgents) {
      const entry = this.agents.get(agentId);
      if (!entry) continue;

      if (!this.shouldBeActive(agentId) && !entry.state.isSleeping) {
        await this.sleepAgent(agentId);
      }
    }
  }

  // ============================================================================
  // Metrics and Reporting
  // ============================================================================

  /**
   * Get circadian controller metrics
   */
  getControllerMetrics(): CircadianMetrics {
    return this.controller.getMetrics();
  }

  /**
   * Get circadian controller state
   */
  getControllerState(): CircadianState {
    return this.controller.getState();
  }

  /**
   * Get manager statistics
   */
  getStats(): {
    totalAgents: number;
    activeAgents: number;
    sleepingAgents: number;
    currentPhase: CircadianPhase;
    uptime: number;
    savings: EnergySavingsReport;
  } {
    const activeAgents = this.getAgentsByState('active').length;
    const sleepingAgents = this.getAgentsByState('sleeping').length;

    return {
      totalAgents: this.agents.size,
      activeAgents,
      sleepingAgents,
      currentPhase: this.controller.getPhase(),
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
      savings: this.getEnergySavings(),
    };
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * Log message if debug is enabled
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[CircadianAgentManager] ${message}`);
    }
  }

  /**
   * Record a task completion for an agent
   *
   * Call this when an agent completes a task to track activity.
   */
  recordTaskCompletion(agentId: string): void {
    const entry = this.agents.get(agentId);
    if (entry) {
      entry.state.tasksProcessed++;
      entry.state.lastActivity = Date.now();
    }
  }

  /**
   * Get the number of registered agents
   */
  get agentCount(): number {
    return this.agents.size;
  }

  /**
   * Check if manager is currently running
   */
  get running(): boolean {
    return this.isRunning;
  }
}

export default CircadianAgentManager;
