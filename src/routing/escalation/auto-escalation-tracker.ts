/**
 * Auto-Escalation Tracker
 * Inspired by loki-mode model selection with automatic escalation
 *
 * Tracks consecutive failures/successes per agent and recommends
 * tier escalation (after N failures) or de-escalation (after M successes).
 * Uses existing AgentTier and FallbackConfig.chain for tier ordering.
 *
 * D7 (cross-pollination plan 06): the class is generic over the tier-name type
 * and the ladder is configurable via `EscalationConfig.tierOrder`. This lets a
 * caller insert a FREE local tier BELOW haiku (e.g.
 * `['local','haiku','sonnet','opus']`) so cheap/local models handle the bulk and
 * only failures escalate up the chain (Ruv's SWE-bench Round-3 economics).
 * Default behaviour is byte-identical to before: with no `tierOrder`, the ladder
 * is the original `['booster','haiku','sonnet','opus']` over `AgentTier`.
 */

import type { AgentTier } from '../routing-config.js';

// ============================================================================
// Types
// ============================================================================

export interface EscalationConfig<Tier extends string = AgentTier> {
  /** Consecutive failures before escalation (default: 2) */
  escalateAfterFailures: number;
  /** Consecutive successes before de-escalation (default: 5) */
  deEscalateAfterSuccesses: number;
  /** Maximum tier to escalate to (default: 'opus') */
  maxTier: Tier;
  /** Minimum tier to de-escalate to (default: 'haiku') */
  minTier: Tier;
  /**
   * Tier ladder in ascending order of capability/cost. Optional — when omitted,
   * resolves to the default Claude ladder `['booster','haiku','sonnet','opus']`.
   * Supply a custom ladder to prepend a free local tier, e.g.
   * `['local','haiku','sonnet','opus']`.
   */
  tierOrder?: Tier[];
}

export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
  escalateAfterFailures: 2,
  deEscalateAfterSuccesses: 5,
  maxTier: 'opus',
  minTier: 'haiku',
};

/** The default Claude ladder (kept out of DEFAULT_ESCALATION_CONFIG for back-compat). */
export const DEFAULT_TIER_ORDER: AgentTier[] = ['booster', 'haiku', 'sonnet', 'opus'];

export interface EscalationState<Tier extends string = AgentTier> {
  agentId: string;
  currentTier: Tier;
  baseTier: Tier;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  escalationCount: number;
  deEscalationCount: number;
  lastAction: 'escalate' | 'de-escalate' | 'none';
  lastActionTimestamp: Date;
}

export type EscalationAction<Tier extends string = AgentTier> = {
  action: 'escalate' | 'de-escalate' | 'none';
  previousTier: Tier;
  newTier: Tier;
};

// ============================================================================
// Auto-Escalation Tracker
// ============================================================================

export class AutoEscalationTracker<Tier extends string = AgentTier> {
  private readonly config: EscalationConfig<Tier>;
  private readonly tierOrder: Tier[];
  private states: Map<string, EscalationState<Tier>> = new Map();

  constructor(config?: Partial<EscalationConfig<Tier>>) {
    this.config = { ...(DEFAULT_ESCALATION_CONFIG as EscalationConfig<Tier>), ...config };
    // Resolve the ladder here (not in DEFAULT_ESCALATION_CONFIG) so the exported
    // default object stays a pure {failures, successes, maxTier, minTier}.
    this.tierOrder = this.config.tierOrder ?? (DEFAULT_TIER_ORDER as unknown as Tier[]);
  }

  private tierIndex(tier: Tier): number {
    return this.tierOrder.indexOf(tier);
  }

  /**
   * Record an outcome for an agent and determine escalation action.
   */
  recordOutcome(agentId: string, success: boolean, baseTier: Tier): EscalationAction<Tier> {
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
        const currentIdx = this.tierIndex(state.currentTier);
        const maxIdx = this.tierIndex(this.config.maxTier);

        if (currentIdx >= 0 && currentIdx < maxIdx) {
          state.currentTier = this.tierOrder[currentIdx + 1];
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
        const currentIdx = this.tierIndex(state.currentTier);
        const minIdx = this.tierIndex(this.config.minTier);

        if (currentIdx > minIdx) {
          state.currentTier = this.tierOrder[currentIdx - 1];
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
  getCurrentTier(agentId: string): Tier | null {
    return this.states.get(agentId)?.currentTier ?? null;
  }

  /**
   * Get full escalation state for an agent, or null if not tracked.
   */
  getState(agentId: string): EscalationState<Tier> | null {
    return this.states.get(agentId) ?? null;
  }

  /**
   * Get all tracked escalation states.
   */
  getAllStates(): EscalationState<Tier>[] {
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
