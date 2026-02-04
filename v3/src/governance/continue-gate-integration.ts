/**
 * ContinueGate Integration for Agentic QE Fleet
 *
 * Wires @claude-flow/guidance ContinueGate to the AQE agent coordination loop.
 * Provides loop detection, throttling, and automatic escalation.
 *
 * @module governance/continue-gate-integration
 * @see ADR-058-guidance-governance-integration.md
 */

import { governanceFlags, isContinueGateEnabled, isStrictMode } from './feature-flags.js';

/**
 * Agent action record for loop detection
 */
export interface AgentAction {
  agentId: string;
  actionType: string;
  actionHash: string;
  timestamp: number;
  success: boolean;
}

/**
 * ContinueGate decision result
 */
export interface ContinueGateDecision {
  shouldContinue: boolean;
  reason?: string;
  throttleMs?: number;
  escalate?: boolean;
  reworkRatio?: number;
  consecutiveCount?: number;
}

/**
 * ContinueGate integration for AQE agent coordination
 */
export class ContinueGateIntegration {
  private actionHistory: Map<string, AgentAction[]> = new Map();
  private throttledAgents: Map<string, number> = new Map();
  private guidanceContinueGate: any = null;
  private initialized = false;

  /**
   * Initialize the ContinueGate integration
   *
   * Note: The @claude-flow/guidance ContinueGate has a different API
   * designed for step-level evaluation with coherence/uncertainty scores.
   * Our local implementation is better suited for AQE agent coordination
   * which tracks action-level loop detection and rework ratios.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Use local implementation optimized for AQE agent coordination
    // The guidance ContinueGate is designed for different metrics (coherence, tokens, etc.)
    this.initialized = true;
  }

  /**
   * Record an agent action for loop detection
   */
  recordAction(action: AgentAction): void {
    if (!isContinueGateEnabled()) return;

    const history = this.actionHistory.get(action.agentId) || [];
    history.push(action);

    // Keep only recent actions (last 100)
    if (history.length > 100) {
      history.shift();
    }

    this.actionHistory.set(action.agentId, history);
  }

  /**
   * Evaluate whether an agent should continue
   * Returns decision with optional throttling or escalation
   */
  async evaluate(agentId: string): Promise<ContinueGateDecision> {
    if (!isContinueGateEnabled()) {
      return { shouldContinue: true };
    }

    await this.initialize();

    const flags = governanceFlags.getFlags().continueGate;
    const history = this.actionHistory.get(agentId) || [];

    // Check if agent is currently throttled
    const throttleUntil = this.throttledAgents.get(agentId);
    if (throttleUntil && Date.now() < throttleUntil) {
      const remainingMs = throttleUntil - Date.now();
      return {
        shouldContinue: !isStrictMode(),
        reason: `Agent throttled for ${Math.ceil(remainingMs / 1000)}s`,
        throttleMs: remainingMs,
        escalate: false,
      };
    }

    // Local loop detection optimized for AQE agent coordination
    return this.localEvaluation(agentId, history, flags);
  }

  /**
   * Local loop detection implementation
   */
  private localEvaluation(
    agentId: string,
    history: AgentAction[],
    flags: typeof governanceFlags extends { getFlags(): { continueGate: infer T } } ? T : never
  ): ContinueGateDecision {
    if (history.length < 2) {
      return { shouldContinue: true };
    }

    // Check for consecutive identical actions
    const recentActions = history.slice(-10);
    const consecutiveCount = this.countConsecutiveIdentical(recentActions);

    if (consecutiveCount >= flags.maxConsecutiveRetries) {
      const throttleMs = Math.min(consecutiveCount * 1000, 30000); // Max 30s throttle

      if (flags.throttleOnExceed) {
        this.throttledAgents.set(agentId, Date.now() + throttleMs);
      }

      this.logViolation(agentId, 'consecutive_identical_actions', consecutiveCount);

      return {
        shouldContinue: !isStrictMode(),
        reason: `Agent exceeded max consecutive retries (${consecutiveCount}/${flags.maxConsecutiveRetries})`,
        throttleMs,
        escalate: consecutiveCount >= flags.maxConsecutiveRetries * 2,
        consecutiveCount,
      };
    }

    // Check rework ratio (failed/total actions)
    const reworkRatio = this.calculateReworkRatio(recentActions);

    if (reworkRatio > flags.reworkRatioThreshold) {
      const throttleMs = 5000; // 5s throttle for high rework

      if (flags.throttleOnExceed) {
        this.throttledAgents.set(agentId, Date.now() + throttleMs);
      }

      this.logViolation(agentId, 'high_rework_ratio', reworkRatio);

      return {
        shouldContinue: !isStrictMode(),
        reason: `Agent rework ratio too high (${(reworkRatio * 100).toFixed(1)}% > ${flags.reworkRatioThreshold * 100}%)`,
        throttleMs,
        escalate: reworkRatio > 0.8,
        reworkRatio,
      };
    }

    // Check for idle timeout
    const lastAction = history[history.length - 1];
    const idleMs = Date.now() - lastAction.timestamp;

    if (idleMs > flags.idleTimeoutMs) {
      this.logViolation(agentId, 'idle_timeout', idleMs);

      return {
        shouldContinue: !isStrictMode(),
        reason: `Agent idle for ${Math.ceil(idleMs / 1000)}s (limit: ${flags.idleTimeoutMs / 1000}s)`,
        escalate: true,
      };
    }

    return { shouldContinue: true };
  }

  /**
   * Count consecutive identical actions
   */
  private countConsecutiveIdentical(actions: AgentAction[]): number {
    if (actions.length === 0) return 0;

    let count = 1;
    const lastHash = actions[actions.length - 1].actionHash;

    for (let i = actions.length - 2; i >= 0; i--) {
      if (actions[i].actionHash === lastHash) {
        count++;
      } else {
        break;
      }
    }

    return count;
  }

  /**
   * Calculate rework ratio (failed actions / total actions)
   */
  private calculateReworkRatio(actions: AgentAction[]): number {
    if (actions.length === 0) return 0;
    const failedCount = actions.filter(a => !a.success).length;
    return failedCount / actions.length;
  }

  /**
   * Map guidance package decision to our format
   */
  private mapGuidanceDecision(decision: any, agentId: string): ContinueGateDecision {
    const flags = governanceFlags.getFlags().continueGate;

    if (!decision.shouldContinue && flags.throttleOnExceed) {
      const throttleMs = decision.throttleMs || 5000;
      this.throttledAgents.set(agentId, Date.now() + throttleMs);
    }

    return {
      shouldContinue: decision.shouldContinue ?? true,
      reason: decision.reason,
      throttleMs: decision.throttleMs,
      escalate: decision.escalate,
      reworkRatio: decision.reworkRatio,
      consecutiveCount: decision.consecutiveCount,
    };
  }

  /**
   * Log governance violation
   */
  private logViolation(agentId: string, type: string, value: number): void {
    if (!governanceFlags.getFlags().global.logViolations) return;

    console.warn(`[ContinueGate] Violation detected:`, {
      agentId,
      violationType: type,
      value,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Clear throttle for an agent
   */
  clearThrottle(agentId: string): void {
    this.throttledAgents.delete(agentId);
  }

  /**
   * Clear all history for an agent
   */
  clearHistory(agentId: string): void {
    this.actionHistory.delete(agentId);
    this.throttledAgents.delete(agentId);
  }

  /**
   * Get agent stats
   */
  getAgentStats(agentId: string): {
    actionCount: number;
    reworkRatio: number;
    isThrottled: boolean;
    throttleRemainingMs: number;
  } {
    const history = this.actionHistory.get(agentId) || [];
    const throttleUntil = this.throttledAgents.get(agentId) || 0;
    const now = Date.now();

    return {
      actionCount: history.length,
      reworkRatio: this.calculateReworkRatio(history),
      isThrottled: throttleUntil > now,
      throttleRemainingMs: Math.max(0, throttleUntil - now),
    };
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.actionHistory.clear();
    this.throttledAgents.clear();
  }
}

/**
 * Singleton instance
 */
export const continueGateIntegration = new ContinueGateIntegration();

/**
 * Hash an action for comparison
 */
export function hashAction(actionType: string, target: string, params: Record<string, unknown>): string {
  const data = JSON.stringify({ actionType, target, params });
  // Simple hash for comparison (not cryptographic)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Create an action record
 */
export function createActionRecord(
  agentId: string,
  actionType: string,
  target: string,
  params: Record<string, unknown>,
  success: boolean
): AgentAction {
  return {
    agentId,
    actionType,
    actionHash: hashAction(actionType, target, params),
    timestamp: Date.now(),
    success,
  };
}
