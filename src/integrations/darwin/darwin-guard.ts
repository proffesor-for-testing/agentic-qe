/**
 * Darwin-Guard — Goodhart-resistance rigor layer for self-evolving / eval loops.
 *
 * Pattern ported (NOT a dependency) from RuVector's `crates/sona/src/darwin_guard.rs`
 * (#615, ADR-271 §4). Reproduced as a pure, deterministic, dependency-free module
 * so it composes with AQE's existing oracle-eval + promotion machinery
 * (qe-fitness.ts / applyQePromotionGate, ADR-113/114) without pulling the Rust crate.
 *
 * It hardens a candidate-selection loop against three Goodhart failure modes:
 *
 *  (i) IMMUTABLE VERIFIER BOUNDARY — selection is gated by a deterministic,
 *      non-evolvable scorer. AQE already has this: {@link applyQePromotionGate}
 *      is a pure mirror of Darwin's frozen gate. This module never replaces it;
 *      it only feeds it a cleaned population and constrains the judge.
 *
 *  (ii) EXCLUDE, DON'T ZERO — a gamed / NaN / out-of-bounds candidate must be
 *      REMOVED from the population statistics, not scored 0. A zero-scored hack
 *      still shifts the mean/advantage baseline and biases selection; only
 *      exclusion is neutral. {@link screenCandidates} + {@link populationStats}.
 *
 *  (iii) JUDGE IS VETO-ONLY — a (frozen) LLM-as-judge may only REJECT a candidate,
 *      never raise its reward or promote it. {@link applyJudgeVeto}. This encodes
 *      the writer≠evaluator discipline (ADR-178/182/183): a model that scores its
 *      own outputs is a worse selector than the deterministic gate.
 *
 * Plus a contamination guard: train/eval instance-ID overlap inflates apparent
 * lift, so {@link assertTrainEvalDisjoint} / {@link filterHoldout} make the split
 * explicit and fail-loud.
 *
 * @module integrations/darwin/darwin-guard
 */

import type { DarwinScoreCard } from './types.js';
import { SAFETY_GATE } from './qe-fitness.js';

// ---------------------------------------------------------------------------
// Layer (ii): deterministic candidate screen — exclude, don't zero
// ---------------------------------------------------------------------------

/** Positive weighted terms — contractually in [0,1]. */
const POSITIVE_TERMS = [
  'taskSuccess',
  'testPassRate',
  'traceQuality',
  'costEfficiency',
  'latencyEfficiency',
  'safetyScore',
] as const satisfies readonly (keyof DarwinScoreCard)[];

/** Hard-penalty terms — contractually in [0,1]. */
const PENALTY_TERMS = [
  'secretExposure',
  'destructiveAction',
  'hallucinatedFile',
  'toolLoop',
  'costOverrun',
] as const satisfies readonly (keyof DarwinScoreCard)[];

const inUnit = (n: number): boolean => Number.isFinite(n) && n >= 0 && n <= 1;

/**
 * Return the reason a score card must be EXCLUDED from population statistics,
 * or `null` if it is a structurally valid, non-gamed candidate.
 *
 * A card is excluded when it is:
 *  - non-finite / out-of-bounds: any term NaN/Infinity, a positive term or
 *    penalty outside [0,1], baseScore outside [0,1], or finalScore outside [-1,1];
 *  - GAMED: it reports a tripped hard signal (failed the safety gate, or a
 *    secret/destructive penalty fully tripped) yet still claims a positive
 *    finalScore — reward that contradicts its own penalty layer. Honest scoring
 *    (qe-fitness) forces such a variant negative, so a positive value here is a
 *    reward-hack signature, not a real win.
 */
export function candidateExclusionReason(card: DarwinScoreCard): string | null {
  if (!Number.isFinite(card.finalScore)) return 'non-finite finalScore';
  if (card.finalScore < -1 || card.finalScore > 1) return `finalScore ${card.finalScore} out of [-1,1]`;
  if (!inUnit(card.baseScore)) return `baseScore ${card.baseScore} out of [0,1]`;

  for (const term of POSITIVE_TERMS) {
    const v = card[term] as number;
    if (!inUnit(v)) return `term ${term}=${v} out of [0,1]`;
  }
  for (const term of PENALTY_TERMS) {
    const v = card[term] as number;
    if (!inUnit(v)) return `penalty ${term}=${v} out of [0,1]`;
  }

  // Gamed: a tripped hard signal must not coexist with positive reward.
  const trippedHardSignal =
    card.safetyScore < SAFETY_GATE ||
    card.secretExposure >= 1 ||
    card.destructiveAction >= 1;
  if (trippedHardSignal && card.finalScore > 0) {
    return `gamed: tripped hard signal (safety=${card.safetyScore}, secret=${card.secretExposure}, destructive=${card.destructiveAction}) but finalScore ${card.finalScore} > 0`;
  }

  return null;
}

export interface CandidateScreen {
  /** Structurally valid, non-gamed candidates — the only ones that feed stats. */
  valid: DarwinScoreCard[];
  /** Excluded candidates with the reason each was removed (for audit/logging). */
  excluded: Array<{ card: DarwinScoreCard; reason: string }>;
}

/**
 * Partition a candidate population into valid vs. excluded.
 * Excluded candidates are REMOVED (not zero-scored) so they cannot bias the
 * advantage baseline computed by {@link populationStats}.
 */
export function screenCandidates(cards: readonly DarwinScoreCard[]): CandidateScreen {
  const valid: DarwinScoreCard[] = [];
  const excluded: Array<{ card: DarwinScoreCard; reason: string }> = [];
  for (const card of cards) {
    const reason = candidateExclusionReason(card);
    if (reason === null) valid.push(card);
    else excluded.push({ card, reason });
  }
  return { valid, excluded };
}

// ---------------------------------------------------------------------------
// Population statistics over VALID candidates only (the advantage baseline)
// ---------------------------------------------------------------------------

export interface PopulationStats {
  /** Number of valid candidates the stats are computed over. */
  count: number;
  /** Mean finalScore over valid candidates (the advantage baseline). */
  mean: number;
  /** Max finalScore over valid candidates. */
  max: number;
  /** Population standard deviation of finalScore over valid candidates. */
  std: number;
}

const EMPTY_STATS: PopulationStats = { count: 0, mean: 0, max: 0, std: 0 };

/**
 * Compute selection statistics over the VALID subset only. Pass the result of
 * {@link screenCandidates}.valid — never the raw population — so a gamed or
 * out-of-bounds candidate cannot shift the baseline the loop selects against.
 */
export function populationStats(valid: readonly DarwinScoreCard[]): PopulationStats {
  const n = valid.length;
  if (n === 0) return { ...EMPTY_STATS };

  let sum = 0;
  let max = -Infinity;
  for (const c of valid) {
    sum += c.finalScore;
    if (c.finalScore > max) max = c.finalScore;
  }
  const mean = sum / n;

  let varSum = 0;
  for (const c of valid) {
    const d = c.finalScore - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / n);

  return { count: n, mean, max, std };
}

// ---------------------------------------------------------------------------
// Layer (iii): judge is veto-only
// ---------------------------------------------------------------------------

export interface JudgeVerdict {
  /** True = the judge rejects this candidate. A judge can ONLY reject. */
  veto: boolean;
  /** Optional human-readable justification, folded into the card reason. */
  reason?: string;
}

/**
 * Apply a (frozen) LLM-as-judge verdict to a score card. The judge is
 * VETO-ONLY: it may flip `promoted` true→false, but can NEVER promote, raise
 * finalScore, or otherwise increase reward. A `veto: false` verdict is a no-op
 * (the deterministic gate's decision stands). This is the structural guarantee
 * that the model never sets reward — it only removes candidates.
 */
export function applyJudgeVeto(card: DarwinScoreCard, verdict: JudgeVerdict): DarwinScoreCard {
  if (!verdict.veto) return card; // judge cannot upgrade — no-op
  if (!card.promoted) return card; // already not promoted — nothing to veto
  return {
    ...card,
    promoted: false,
    reason: `vetoed by judge${verdict.reason ? `: ${verdict.reason}` : ''} (was: ${card.reason})`,
  };
}

// ---------------------------------------------------------------------------
// Contamination guard: train/eval must be disjoint
// ---------------------------------------------------------------------------

/**
 * Throw if any train instance ID also appears in the eval set. Train/eval
 * overlap inflates apparent lift (the loop "learns" the eval answers), so this
 * must fail loud rather than silently report a fake gain.
 */
export function assertTrainEvalDisjoint(
  trainIds: Iterable<string>,
  evalIds: Iterable<string>,
): void {
  const train = new Set(trainIds);
  const overlap: string[] = [];
  for (const id of evalIds) {
    if (train.has(id)) overlap.push(id);
  }
  if (overlap.length > 0) {
    const shown = overlap.slice(0, 10).join(', ');
    const more = overlap.length > 10 ? ` (+${overlap.length - 10} more)` : '';
    throw new Error(
      `Train/eval contamination: ${overlap.length} instance ID(s) appear in both sets: ${shown}${more}`,
    );
  }
}

/**
 * Return the subset of `cases` whose `id` was NOT already seen in training,
 * i.e. a clean held-out set. Use when you cannot guarantee disjointness up front
 * and want to drop the contaminated cases instead of throwing.
 */
export function filterHoldout<T extends { id: string }>(
  cases: readonly T[],
  seenIds: Iterable<string>,
): T[] {
  const seen = new Set(seenIds);
  return cases.filter((c) => !seen.has(c.id));
}
