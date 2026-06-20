/**
 * Free-tier escalating executor (cross-pollination plan 06, D7-wire).
 *
 * Turns the dormant ladder + tracker into a running loop that implements Ruv's
 * SWE-bench economics for a QE task:
 *
 *   1. run the task on the CHEAP/free local tier
 *   2. verify the output with an objective QE oracle (pass/fail)
 *   3. on failure, escalate THIS task up the ladder (free → haiku → … → opus)
 *      until it passes or the top is reached  (per-task escalation)
 *   4. record the start-tier outcome in the tracker so the BASE tier adapts over
 *      time (cross-task escalation — the existing AutoEscalationTracker behaviour)
 *
 * Decoupled by injection: free tiers are served by `freeTierChat`; Claude tiers
 * are served by an injected `ClaudeTierRunner` (so this module has NO hard
 * dependency on HybridRouter / the Anthropic SDK and is fully unit-testable). A
 * coordinator wires it by passing a runner that delegates to its existing
 * `HybridRouter`. If no runner is supplied, Claude tiers are reported as
 * unavailable (local-only mode) rather than throwing.
 */

import { freeTierChat, type ChatMessage } from './provider.js';
import { resolveTier, type ResolvedTier } from './ladder.js';
import { AutoEscalationTracker } from '../escalation/auto-escalation-tracker.js';
import type { QeRoutingLadder } from './types.js';
import type { AgentTier } from '../routing-config.js';

/** Serves a Claude tier. Injected by the host (e.g. delegates to HybridRouter). */
export type ClaudeTierRunner = (
  claudeTier: AgentTier,
  messages: ChatMessage[],
) => Promise<{ content: string }>;

/** The objective QE oracle: did the tier's output satisfy the task? */
export type QeVerifier = (output: string) => boolean | Promise<boolean>;

export interface QeTaskRequest {
  /** Tracker key — usually `${agentRole}:${repo}` so adaptation is per-context. */
  agentId: string;
  /** The QE prompt sent to whichever tier handles it. */
  messages: ChatMessage[];
  /** Objective pass/fail check on the produced output (coverage run, arena, schema, …). */
  verify: QeVerifier;
  /** Cap on tiers tried for one task (default: full ladder). */
  maxEscalations?: number;
}

export interface TierAttempt {
  tier: string;
  provider: 'free-tier' | 'claude';
  ok: boolean;
  passed: boolean;
  latencyMs: number;
  error?: string;
}

export interface QeExecutionResult {
  /** True iff some tier produced output that passed `verify`. */
  ok: boolean;
  /** The passing output (or the last output tried). */
  content: string;
  /** The tier that produced the passing output, or the last tier tried. */
  tierUsed: string;
  /** True iff the task needed more than the starting tier. */
  escalated: boolean;
  /** Per-tier trace, cheapest → most capable. */
  attempts: TierAttempt[];
}

export interface FreeTierExecutorOptions {
  ladder: QeRoutingLadder;
  /** Serves Claude tiers; omit for local-only operation. */
  claudeRunner?: ClaudeTierRunner;
  /** Reuse an existing tracker (e.g. the coordinator's) or create one. */
  tracker?: AutoEscalationTracker<string>;
  /** Read env for free-tier keys (injectable for tests). */
  env?: NodeJS.ProcessEnv;
  /** Optional sink for D9: record each completed task outcome (routing-feedback). */
  onOutcome?: (o: { agentId: string; startTier: string; tierUsed: string; passed: boolean; escalated: boolean }) => void;
}

/**
 * Executes QE tasks cheap-first with verify-and-escalate. Holds the per-agent
 * adaptive base tier in an `AutoEscalationTracker`.
 */
export class FreeTierEscalatingExecutor {
  private readonly ladder: QeRoutingLadder;
  private readonly claudeRunner?: ClaudeTierRunner;
  private readonly tracker: AutoEscalationTracker<string>;
  private readonly env: NodeJS.ProcessEnv;
  private readonly baseTier: string;
  private readonly onOutcome?: FreeTierExecutorOptions['onOutcome'];

  constructor(opts: FreeTierExecutorOptions) {
    this.ladder = opts.ladder;
    this.claudeRunner = opts.claudeRunner;
    this.env = opts.env ?? process.env;
    this.onOutcome = opts.onOutcome;
    this.baseTier = opts.ladder.tierOrder[0];
    this.tracker =
      opts.tracker ??
      new AutoEscalationTracker<string>({
        tierOrder: opts.ladder.tierOrder,
        minTier: opts.ladder.minTier ?? opts.ladder.tierOrder[0],
        maxTier: opts.ladder.maxTier ?? opts.ladder.tierOrder[opts.ladder.tierOrder.length - 1],
        escalateAfterFailures: opts.ladder.escalateAfterFailures ?? 2,
        deEscalateAfterSuccesses: opts.ladder.deEscalateAfterSuccesses ?? 5,
      });
  }

  /** Expose the tracker so a coordinator can inspect/share adaptation state. */
  getTracker(): AutoEscalationTracker<string> {
    return this.tracker;
  }

  /** Run ONE tier; never throws — failure becomes `{ok:false}` so we escalate. */
  private async runTier(resolved: ResolvedTier, messages: ChatMessage[]): Promise<{ ok: boolean; content: string; latencyMs: number; error?: string }> {
    const started = Date.now();
    if (resolved.provider === 'free-tier') {
      const r = await freeTierChat(resolved.resolved, messages);
      return { ok: r.ok, content: r.content, latencyMs: r.latencyMs, error: r.error };
    }
    // Claude tier
    if (!this.claudeRunner) {
      return { ok: false, content: '', latencyMs: Date.now() - started, error: 'no claudeRunner (local-only mode)' };
    }
    try {
      const r = await this.claudeRunner(resolved.claudeTier, messages);
      return { ok: (r.content ?? '').trim().length > 0, content: r.content ?? '', latencyMs: Date.now() - started };
    } catch (e) {
      return { ok: false, content: '', latencyMs: Date.now() - started, error: (e as Error).message };
    }
  }

  /**
   * Execute a QE task cheap-first, escalating up the ladder until `verify`
   * passes or the (bounded) top tier is reached.
   */
  async execute(req: QeTaskRequest): Promise<QeExecutionResult> {
    const order = this.ladder.tierOrder;
    const startTier = this.tracker.getCurrentTier(req.agentId) ?? this.baseTier;
    const startIdx = Math.max(0, order.indexOf(startTier));
    const maxIdx = order.indexOf(this.ladder.maxTier ?? order[order.length - 1]);
    const cap = req.maxEscalations != null ? Math.min(startIdx + req.maxEscalations, maxIdx) : maxIdx;

    const attempts: TierAttempt[] = [];
    let passedAtStart = false;
    let result: QeExecutionResult = { ok: false, content: '', tierUsed: startTier, escalated: false, attempts };

    for (let idx = startIdx; idx <= cap; idx++) {
      const tier = order[idx];
      const resolved = resolveTier(this.ladder, tier, this.env);
      const run = await this.runTier(resolved, req.messages);
      const passed = run.ok ? await Promise.resolve(req.verify(run.content)) : false;
      attempts.push({ tier, provider: resolved.provider, ok: run.ok, passed, latencyMs: run.latencyMs, error: run.error });

      if (idx === startIdx) passedAtStart = passed;
      if (passed) {
        result = { ok: true, content: run.content, tierUsed: tier, escalated: idx > startIdx, attempts };
        break;
      }
      result = { ok: false, content: run.content, tierUsed: tier, escalated: idx > startIdx, attempts };
    }

    // Cross-task adaptation: feed the START-tier verdict to the tracker so the
    // base tier drifts up when the cheap tier keeps failing, down when it wins.
    this.tracker.recordOutcome(req.agentId, passedAtStart, this.baseTier);
    this.onOutcome?.({ agentId: req.agentId, startTier, tierUsed: result.tierUsed, passed: result.ok, escalated: result.escalated });

    return result;
  }
}
