/**
 * Coordinator free-tier support (cross-pollination plan 06 — broadening the
 * opt-in beyond test generation; ADR-111 escalation lane).
 *
 * Extracts the generic "build a FreeTierEscalatingExecutor from a coordinator's
 * config + router" wiring that was inline in the test-generation coordinator, so
 * ANY domain coordinator can opt in with a few lines instead of duplicating it.
 *
 * The opt-in lane is justified only for tasks that match the D3 criterion:
 * BOUNDED generation graded by an OBJECTIVE oracle (a test+assertion, valid
 * Gherkin, a schema). Do NOT wire it into analysis/judgement coordinators — the
 * §11 "coder binds" finding means a cheap model can't carry open-ended reasoning.
 */

import { FreeTierEscalatingExecutor, type QeExecutionResult, type QeVerifier } from './executor.js';
import { defaultFreeTierLadder } from './ladder.js';
import { createRoutingFeedbackSink, type RoutingFeedbackLike } from './feedback-sink.js';
import type { ChatMessage } from './provider.js';
import type { AgentTier } from '../routing-config.js';

/** Default cheap tier. qwen3:30b-a3b, NOT qwen3:8b — D3 (2026-06-23) measured the
 *  8B below the QE generation floor (0/3 baseline-valid); the 30B MoE clears it. */
export const DEFAULT_FREE_TIER_MODEL = 'qwen3:30b-a3b';

/** Per-coordinator config knobs (mix into a coordinator's CoordinatorConfig). */
export interface FreeTierCoordinatorConfig {
  /** Opt-in the cheap-first free local tier. Also via env `AQE_FREE_TIER=1`. */
  enableFreeTier?: boolean;
  /** Local model id (default {@link DEFAULT_FREE_TIER_MODEL} or env AQE_FREE_TIER_MODEL). */
  freeTierModel?: string;
  /** Default same-tier D8 repair retries before escalating. Benchmarked at 2 (D3). */
  freeTierRepairAttempts?: number;
  /**
   * Best-of-k diverse attempts per tier's first round (06 §12). D3 validated k=2
   * (lifted cheap composite +16.7, baseline-valid 50%→70%). Costs an extra local
   * call ONLY when variant 0 fails (the loop breaks on first pass). Default 2.
   */
  freeTierBestOfK?: number;
}

/** Structural view of the HybridRouter — avoids a hard import (decoupling). */
export interface FreeTierLlmRouter {
  chat(args: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    agentType: string;
    complexity: 'low' | 'medium' | 'high';
  }): Promise<{ content: string }>;
}

export interface BuildFreeTierExecutorOptions {
  config: FreeTierCoordinatorConfig;
  /** Router agentType hint for escalated (paid) tiers, e.g. 'qe-test-architect'. */
  agentType: string;
  /** D9 sink label, e.g. 'test-generation'. */
  taskKind: string;
  /** Delegate Claude tiers to the host router; omit → local-only (no escalation). */
  llmRouter?: FreeTierLlmRouter | null;
  /** D9: feed cheap-vs-escalated outcomes into routing-feedback. */
  routingFeedback?: RoutingFeedbackLike | null;
  env?: NodeJS.ProcessEnv;
  logger?: { info: (m: string) => void };
}

/**
 * Build a cheap-first escalating executor from coordinator config + (optional)
 * router. Returns `null` when the free tier is not opted in — callers store the
 * result and fall through to their normal path when it is null.
 */
export function buildFreeTierExecutor(opts: BuildFreeTierExecutorOptions): FreeTierEscalatingExecutor | null {
  const env = opts.env ?? process.env;
  const on = opts.config.enableFreeTier === true || env.AQE_FREE_TIER === '1';
  if (!on) return null;

  const model = opts.config.freeTierModel || env.AQE_FREE_TIER_MODEL || DEFAULT_FREE_TIER_MODEL;

  // Paid escalation: map the ladder tier to a complexity hint so the host router
  // picks that tier. No router → executor stays local-only (Claude tiers unavailable).
  const claudeRunner = opts.llmRouter
    ? async (tier: AgentTier, msgs: ChatMessage[]): Promise<{ content: string }> => {
        const complexity = tier === 'opus' ? 'high' : tier === 'sonnet' ? 'medium' : 'low';
        const resp = await opts.llmRouter!.chat({
          messages: msgs.map((m) => ({ role: m.role, content: m.content })),
          agentType: opts.agentType,
          complexity,
        });
        return { content: resp.content };
      }
    : undefined;

  const exec = new FreeTierEscalatingExecutor({
    ladder: defaultFreeTierLadder(model),
    claudeRunner,
    defaultRepairAttempts: opts.config.freeTierRepairAttempts ?? 1,
    onOutcome: opts.routingFeedback
      ? createRoutingFeedbackSink(opts.routingFeedback, { taskKind: opts.taskKind })
      : undefined,
  });
  opts.logger?.info(
    `Free-tier enabled for ${opts.taskKind} (model=${model}, ` +
      `${claudeRunner ? 'escalation→router' : 'local-only'})`,
  );
  return exec;
}

/**
 * Run one bounded generation task cheap-first: best-of-k diverse attempts +
 * D8 repair on the local tier, escalating the hard tail. Returns `null` when no
 * executor (not opted in). The `verify` MUST be an objective oracle (06 §10).
 */
export async function runFreeTierTextTask(
  executor: FreeTierEscalatingExecutor | null,
  args: {
    agentId: string;
    system: string;
    user: string;
    verify: QeVerifier;
    repairAttempts?: number;
    escalate?: boolean;
    bestOfK?: number;
  },
): Promise<QeExecutionResult | null> {
  if (!executor) return null;
  return executor.execute({
    agentId: args.agentId,
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
    verify: args.verify,
    repairAttempts: args.repairAttempts,
    escalate: args.escalate ?? true,
    bestOfK: args.bestOfK,
    oracleKind: 'objective',
  });
}
