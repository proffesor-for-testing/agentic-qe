/**
 * Free-tier escalating executor (cross-pollination plan 06, D7-wire + D8).
 *
 * Implements Ruv's SWE-bench economics for a QE task:
 *   1. run on the CHEAP/free local tier
 *   2. verify with an objective QE oracle (pass/fail [+ feedback])
 *   3. D8 REPAIR LOOP: on failure, feed the failure back to the SAME tier and
 *      retry (Round-2 lever: 7.7% -> 15.3% on a fixed model), up to `repairAttempts`
 *   4. only then escalate up the ladder (when `escalate` is true)
 *   5. record the start-tier outcome so the base tier adapts across tasks
 *
 * Decoupled by injection: free tiers via `freeTierChat`; Claude tiers via an
 * injected `ClaudeTierRunner` (no Anthropic SDK dep; coordinator delegates to
 * its HybridRouter). No runner → local-only. `escalate:false` = repair-only,
 * never leaves the start tier (the "no escalation yet" mode).
 */

import { freeTierChat, resolveFreeTierProvider, type ChatMessage } from './provider.js';
import { resolveTier, type ResolvedTier } from './ladder.js';
import { AutoEscalationTracker } from '../escalation/auto-escalation-tracker.js';
import type { QeRoutingLadder, FreeTierProviderConfig, ResolvedFreeTierProvider } from './types.js';
import type { AgentTier } from '../routing-config.js';

/** Serves a Claude tier. Injected by the host (e.g. delegates to HybridRouter). */
export type ClaudeTierRunner = (
  claudeTier: AgentTier,
  messages: ChatMessage[],
) => Promise<{ content: string }>;

/** Rich verdict — lets the repair loop feed *why* it failed back to the model. */
export interface QeVerdict {
  passed: boolean;
  /** Human/model-readable reason a failed output was rejected (drives repair). */
  feedback?: string;
}

/** The objective QE oracle: did the tier's output satisfy the task? */
export type QeVerifier = (output: string) => boolean | QeVerdict | Promise<boolean | QeVerdict>;

export interface QeTaskRequest {
  /** Tracker key — usually `${agentRole}:${repo}` so adaptation is per-context. */
  agentId: string;
  /** The QE prompt sent to whichever tier handles it. */
  messages: ChatMessage[];
  /** Objective pass/fail check on the produced output (coverage run, arena, schema, …). */
  verify: QeVerifier;
  /** D8: same-tier repair retries after a failure, before escalating. Default 0. */
  repairAttempts?: number;
  /** Climb the ladder on failure. Default true; set false for repair-only (local). */
  escalate?: boolean;
  /** Cap on tiers tried for one task (default: full ladder). */
  maxEscalations?: number;
  /**
   * Best-of-k diverse attempts at each tier's first round (06 §12 correction).
   * Ruv's ablation: a single repro-gated shot Goodharts the oracle (0 gold); k>1
   * diverse attempts picked by the objective verifier are what convert. Default 1.
   */
  bestOfK?: number;
  /**
   * Goodhart guard (06 §10). `objective` = the verifier is a deterministic
   * ground-truth oracle (arena/coverage/schema). `self-authored` = the verifier
   * is the model's own test — an unreliable selection target, so its outcomes are
   * NOT recorded into routing-feedback (they must not lift confidence). Default
   * `objective` (existing callers inject real oracles, e.g. a coverage/test run).
   */
  oracleKind?: 'objective' | 'self-authored';
}

export interface TierAttempt {
  tier: string;
  provider: 'free-tier' | 'claude';
  /** 0 = first try at this tier; 1.. = repair rounds (D8). */
  repairRound: number;
  /** Best-of-k variant index within round 0 (0 = primary, 1.. = diversified). */
  variant?: number;
  /** Generator model that produced this candidate (set for cross-model best-of-k). */
  model?: string;
  ok: boolean;
  passed: boolean;
  latencyMs: number;
  feedback?: string;
  error?: string;
}

export interface QeExecutionResult {
  /** True iff some attempt produced output that passed `verify`. */
  ok: boolean;
  /** The passing output (or the last output tried). */
  content: string;
  /** The tier that produced the passing output, or the last tier tried. */
  tierUsed: string;
  /** True iff the task needed a tier above the starting one. */
  escalated: boolean;
  /** True iff a same-tier repair round produced the passing output. */
  repaired: boolean;
  /** True iff best-of-k (k>1) diversity at a round produced the passing output. */
  bestOf: boolean;
  /**
   * True iff the outcome was withheld from routing-feedback because the gate was
   * a self-authored oracle (06 §10 Goodhart guard) — it cannot lift confidence.
   */
  goodhartGuarded: boolean;
  /** Per-attempt trace, cheapest → most capable. */
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
  /** Default same-tier repair retries when a request omits `repairAttempts`. */
  defaultRepairAttempts?: number;
  /**
   * Cross-model best-of-k (A12, measured +6 composite over single-model). When set
   * AND the START tier is free-tier, round-0 best-of-k draws each candidate from a
   * DIFFERENT provider in this pool (e.g. local qwen + an OpenRouter model) instead
   * of one model's temperature/prompt variants — diverse models cover each other's
   * failures and raise the union. Selection stays the objective verifier (first-pass).
   * Omit ⇒ single-model best-of-k (unchanged).
   */
  candidateProviders?: FreeTierProviderConfig[];
  /** D9 sink: record each completed task outcome (→ routing-feedback). */
  onOutcome?: (o: {
    agentId: string;
    startTier: string;
    tierUsed: string;
    passed: boolean;
    escalated: boolean;
    repaired: boolean;
    durationMs: number;
    attempts: number;
  }) => void;
}

function normalizeVerdict(v: boolean | QeVerdict): QeVerdict {
  return typeof v === 'boolean' ? { passed: v } : v;
}

/**
 * Executes QE tasks cheap-first with repair-then-escalate. Holds the per-agent
 * adaptive base tier in an `AutoEscalationTracker`.
 */
export class FreeTierEscalatingExecutor {
  private readonly ladder: QeRoutingLadder;
  private readonly claudeRunner?: ClaudeTierRunner;
  private readonly tracker: AutoEscalationTracker<string>;
  private readonly env: NodeJS.ProcessEnv;
  private readonly baseTier: string;
  private readonly defaultRepairAttempts: number;
  private readonly onOutcome?: FreeTierExecutorOptions['onOutcome'];
  /** Resolved cross-model generator pool (A12); undefined ⇒ single-model best-of-k. */
  private readonly candidateProviders?: ResolvedFreeTierProvider[];

  constructor(opts: FreeTierExecutorOptions) {
    this.ladder = opts.ladder;
    this.claudeRunner = opts.claudeRunner;
    this.env = opts.env ?? process.env;
    this.onOutcome = opts.onOutcome;
    this.defaultRepairAttempts = opts.defaultRepairAttempts ?? 0;
    this.baseTier = opts.ladder.tierOrder[0];
    this.candidateProviders = opts.candidateProviders?.length
      ? opts.candidateProviders.map((c) => resolveFreeTierProvider(c, this.env))
      : undefined;
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

  /** Run ONE tier once; never throws — failure becomes `{ok:false}` so we repair/escalate. */
  private async runTier(resolved: ResolvedTier, messages: ChatMessage[]): Promise<{ ok: boolean; content: string; latencyMs: number; error?: string }> {
    const started = Date.now();
    if (resolved.provider === 'free-tier') {
      const r = await freeTierChat(resolved.resolved, messages);
      return { ok: r.ok, content: r.content, latencyMs: r.latencyMs, error: r.error };
    }
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
   * Best-of-k diversity turn (06 §12): nudge the model toward a structurally
   * different valid solution. Deterministic by `variant` index (no RNG) so runs
   * replay identically.
   */
  private diversify(base: ChatMessage[], variant: number): ChatMessage[] {
    return [
      ...base,
      {
        role: 'user',
        content:
          `Alternative approach #${variant}: produce a different valid solution from any ` +
          `previous attempt — vary the structure/strategy, not just naming. Return the full output only.`,
      },
    ];
  }

  /** Build the D8 repair turn: show the model its rejected output + why. */
  private repairMessages(base: ChatMessage[], lastOutput: string, feedback?: string): ChatMessage[] {
    return [
      ...base,
      { role: 'assistant', content: lastOutput },
      {
        role: 'user',
        content:
          'That output did not pass verification' +
          (feedback ? `: ${feedback}` : '.') +
          ' Fix it and return the corrected full output only.',
      },
    ];
  }

  /**
   * Execute a QE task cheap-first: try a tier, repair in place on failure, then
   * (optionally) escalate to the next tier; repeat until pass or top.
   */
  async execute(req: QeTaskRequest): Promise<QeExecutionResult> {
    const order = this.ladder.tierOrder;
    const escalate = req.escalate ?? true;
    const repairAttempts = req.repairAttempts ?? this.defaultRepairAttempts;
    const bestOfK = Math.max(1, req.bestOfK ?? 1);
    const objectiveOracle = (req.oracleKind ?? 'objective') === 'objective';
    const startTier = this.tracker.getCurrentTier(req.agentId) ?? this.baseTier;
    const startIdx = Math.max(0, order.indexOf(startTier));
    const maxIdx = order.indexOf(this.ladder.maxTier ?? order[order.length - 1]);
    const topIdx = escalate
      ? (req.maxEscalations != null ? Math.min(startIdx + req.maxEscalations, maxIdx) : maxIdx)
      : startIdx; // repair-only: never leave the start tier

    const attempts: TierAttempt[] = [];
    let passedAtStart = false;
    const t0 = Date.now();
    let result: QeExecutionResult = { ok: false, content: '', tierUsed: startTier, escalated: false, repaired: false, bestOf: false, goodhartGuarded: false, attempts };

    outer: for (let idx = startIdx; idx <= topIdx; idx++) {
      const tier = order[idx];
      const resolved = resolveTier(this.ladder, tier, this.env);

      // round 0 = best-of-k diverse attempts (06 §12); rounds 1..repairAttempts = single repair turns (D8)
      // A12: at the START free tier, round-0 candidates draw from a CROSS-MODEL pool
      // (diverse models cover each other's failures) instead of one model's variants.
      const pool = this.candidateProviders;
      const xModelHere = !!pool && idx === startIdx && resolved.provider === 'free-tier';
      for (let round = 0; round <= repairAttempts; round++) {
        const attemptsThisRound = round === 0 ? bestOfK : 1;
        for (let k = 0; k < attemptsThisRound; k++) {
          const candProvider = round === 0 && xModelHere && pool ? pool[k % pool.length] : undefined;
          const candResolved: ResolvedTier = candProvider ? { provider: 'free-tier', resolved: candProvider } : resolved;
          const messages =
            round !== 0
              ? this.repairMessages(req.messages, result.content, attempts[attempts.length - 1]?.feedback)
              : candProvider
                // model difference IS the diversity; only nudge when k wraps past the pool
                ? (pool && k < pool.length ? req.messages : this.diversify(req.messages, k))
                : (k === 0 ? req.messages : this.diversify(req.messages, k));
          const run = await this.runTier(candResolved, messages);
          const verdict = run.ok ? normalizeVerdict(await Promise.resolve(req.verify(run.content))) : { passed: false, feedback: run.error };
          attempts.push({ tier, provider: candResolved.provider, repairRound: round, variant: round === 0 ? k : undefined, model: candProvider?.model, ok: run.ok, passed: verdict.passed, latencyMs: run.latencyMs, feedback: verdict.feedback, error: run.error });

          // start-tier capability for adaptation: did ANY round-0 attempt pass?
          if (idx === startIdx && round === 0 && verdict.passed) passedAtStart = true;

          if (verdict.passed) {
            result = { ok: true, content: run.content, tierUsed: tier, escalated: idx > startIdx, repaired: round > 0, bestOf: round === 0 && k > 0, goodhartGuarded: false, attempts };
            break outer;
          }
          result = { ok: false, content: run.content || result.content, tierUsed: tier, escalated: idx > startIdx, repaired: round > 0, bestOf: false, goodhartGuarded: false, attempts };
        }
      }
    }

    // Goodhart guard (06 §10): only an OBJECTIVE ground-truth oracle may move
    // routing-feedback. A self-authored gate is an unreliable selection target —
    // record nothing, so a Goodharted self-test pass can never lift confidence.
    result.goodhartGuarded = !objectiveOracle;
    if (objectiveOracle) {
      // Cross-task adaptation: feed the START-tier verdict to the tracker so the
      // base tier drifts up when the cheap tier keeps failing, down when it wins.
      this.tracker.recordOutcome(req.agentId, passedAtStart, this.baseTier);
      this.onOutcome?.({
        agentId: req.agentId,
        startTier,
        tierUsed: result.tierUsed,
        passed: result.ok,
        escalated: result.escalated,
        repaired: result.repaired,
        durationMs: Date.now() - t0,
        attempts: attempts.length,
      });
    }

    return result;
  }
}
