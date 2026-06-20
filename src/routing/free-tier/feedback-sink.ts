/**
 * D9 — route free-tier executor outcomes into the existing routing-feedback
 * machinery so the stuck-at-40% routing confidence starts moving from REAL
 * cheap-vs-escalated results.
 *
 * `RoutingFeedbackCollector.recordOutcome` already updates the calibrator, the
 * auto-escalation tracker, the economic model, and the confidence metrics. This
 * adapter maps a `FreeTierEscalatingExecutor.onOutcome` event onto that call,
 * constructing a minimal-but-valid QETask + synthetic QERoutingDecision.
 *
 * Decoupled by a structural interface (`RoutingFeedbackLike`) so this module has
 * no hard dependency on the concrete collector's constructor/DB — the coordinator
 * passes whatever it already holds, and tests pass a stub.
 */

import type { QETask, QERoutingDecision, RoutingOutcome } from '../types.js';

/** The slice of RoutingFeedbackCollector this adapter needs. */
export interface RoutingFeedbackLike {
  recordOutcome(
    task: QETask,
    decision: QERoutingDecision,
    usedAgent: string,
    outcome: { success: boolean; qualityScore: number; durationMs: number; error?: string },
  ): RoutingOutcome;
}

/** The executor's onOutcome payload (kept structural to avoid a circular import). */
export interface FreeTierOutcomeEvent {
  agentId: string;
  startTier: string;
  tierUsed: string;
  passed: boolean;
  escalated: boolean;
  repaired: boolean;
  durationMs: number;
  attempts: number;
}

export interface RoutingFeedbackSinkOptions {
  /** Short label for the task description (e.g. 'test-generation'). */
  taskKind?: string;
  /** Confidence to attribute to the cheap-first decision (0..1). Default 0.5. */
  decisionConfidence?: number;
}

/**
 * Build an `onOutcome` handler that records each free-tier task result into the
 * routing-feedback collector. `usedAgent` is set to the TIER that produced the
 * result so the calibrator/escalation tracker learn per-tier reliability — i.e.
 * sustained cheap-tier wins raise its confidence and keep work cheap.
 */
export function createRoutingFeedbackSink(
  collector: RoutingFeedbackLike,
  opts: RoutingFeedbackSinkOptions = {},
): (o: FreeTierOutcomeEvent) => void {
  const kind = opts.taskKind ?? 'free-tier-qe';
  const confidence = opts.decisionConfidence ?? 0.5;

  return (o: FreeTierOutcomeEvent): void => {
    const task: QETask = {
      description: `${kind} task for ${o.agentId} (start=${o.startTier}${o.repaired ? ', repaired' : ''}${o.escalated ? ', escalated' : ''})`,
    };
    const decision: QERoutingDecision = {
      recommended: o.startTier, // cheap-first recommended the bottom tier
      confidence,
      alternatives: [],
      reasoning: `free-tier cheap-first; resolved at ${o.tierUsed} after ${o.attempts} attempt(s)`,
      scores: { similarity: 0, performance: o.passed ? 1 : 0, capabilities: 0, combined: o.passed ? 1 : 0 },
      latencyMs: o.durationMs,
      timestamp: new Date(),
    };
    // qualityScore: full marks on a clean cheap win; reduced when repair/escalation
    // was needed (still a success, but it cost more) so the calibrator learns nuance.
    const qualityScore = o.passed ? (o.escalated ? 0.6 : o.repaired ? 0.8 : 1.0) : 0;
    try {
      collector.recordOutcome(task, decision, o.tierUsed, {
        success: o.passed,
        qualityScore,
        durationMs: o.durationMs,
      });
    } catch {
      // Feedback recording is best-effort — never break the QE task on a sink error.
    }
  };
}
