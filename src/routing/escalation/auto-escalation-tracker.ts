/**
 * Auto-Escalation Tracker
 * Inspired by loki-mode model selection with automatic escalation
 *
 * Tracks consecutive failures/successes per agent and recommends
 * tier escalation (after N failures) or de-escalation (after M successes).
 * Uses existing AgentTier and FallbackConfig.chain for tier ordering.
 */

import type { AgentTier } from '../routing-config.js';

// ============================================================================
// Types
// ============================================================================

export interface EscalationConfig {
  /** Consecutive failures before escalation (default: 2) */
  escalateAfterFailures: number;
  /** Consecutive successes before de-escalation (default: 5) */
  deEscalateAfterSuccesses: number;
  /** Maximum tier to escalate to (default: 'opus') */
  maxTier: AgentTier;
  /** Minimum tier to de-escalate to (default: 'haiku') */
  minTier: AgentTier;
}

export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
  escalateAfterFailures: 2,
  deEscalateAfterSuccesses: 5,
  maxTier: 'opus',
  minTier: 'haiku',
};

export interface EscalationState {
  agentId: string;
  currentTier: AgentTier;
  baseTier: AgentTier;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  escalationCount: number;
  deEscalationCount: number;
  lastAction: 'escalate' | 'de-escalate' | 'none';
  lastActionTimestamp: Date;
}

export type EscalationAction = {
  action: 'escalate' | 'de-escalate' | 'none';
  previousTier: AgentTier;
  newTier: AgentTier;
};

// ============================================================================
// Tier Ordering
// ============================================================================

/** Tiers in ascending order of capability/cost */
const TIER_ORDER: AgentTier[] = ['booster', 'haiku', 'sonnet', 'opus'];

function tierIndex(tier: AgentTier): number {
  return TIER_ORDER.indexOf(tier);
}

// ============================================================================
// Auto-Escalation Tracker
// ============================================================================

export class AutoEscalationTracker {
  private readonly config: EscalationConfig;
  private states: Map<string, EscalationState> = new Map();

  constructor(config?: Partial<EscalationConfig>) {
    this.config = { ...DEFAULT_ESCALATION_CONFIG, ...config };
  }

  /**
   * Record an outcome for an agent and determine escalation action.
   */
  recordOutcome(agentId: string, success: boolean, baseTier: AgentTier): EscalationAction {
    let state = this.states.get(agentId);
    if (!state) {
      state = {
        agentId,
        currentTier: baseTier,
        baseTier,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        escalationCount: 0,
        deEscalationCount: 0,
        lastAction: 'none',
        lastActionTimestamp: new Date(),
      };
      this.states.set(agentId, state);
    }

    const previousTier = state.currentTier;

    if (!success) {
      state.consecutiveFailures++;
      state.consecutiveSuccesses = 0;

      if (state.consecutiveFailures >= this.config.escalateAfterFailures) {
        const currentIdx = tierIndex(state.currentTier);
        const maxIdx = tierIndex(this.config.maxTier);

        if (currentIdx < maxIdx) {
          state.currentTier = TIER_ORDER[currentIdx + 1];
          state.escalationCount++;
          state.consecutiveFailures = 0;
          state.lastAction = 'escalate';
          state.lastActionTimestamp = new Date();
          return { action: 'escalate', previousTier, newTier: state.currentTier };
        }
      }
    } else {
      state.consecutiveSuccesses++;
      state.consecutiveFailures = 0;

      if (state.consecutiveSuccesses >= this.config.deEscalateAfterSuccesses) {
        const currentIdx = tierIndex(state.currentTier);
        const minIdx = tierIndex(this.config.minTier);

        if (currentIdx > minIdx) {
          state.currentTier = TIER_ORDER[currentIdx - 1];
          state.deEscalationCount++;
          state.consecutiveSuccesses = 0;
          state.lastAction = 'de-escalate';
          state.lastActionTimestamp = new Date();
          return { action: 'de-escalate', previousTier, newTier: state.currentTier };
        }
      }
    }

    return { action: 'none', previousTier, newTier: state.currentTier };
  }

  /**
   * Get the current tier for an agent, or null if not tracked.
   */
  getCurrentTier(agentId: string): AgentTier | null {
    return this.states.get(agentId)?.currentTier ?? null;
  }

  /**
   * Get full escalation state for an agent, or null if not tracked.
   */
  getState(agentId: string): EscalationState | null {
    return this.states.get(agentId) ?? null;
  }

  /**
   * Get all tracked escalation states.
   */
  getAllStates(): EscalationState[] {
    return Array.from(this.states.values());
  }

  /**
   * Reset state for a specific agent, or all agents if no ID provided.
   */
  reset(agentId?: string): void {
    if (agentId) {
      this.states.delete(agentId);
    } else {
      this.states.clear();
    }
  }
}
