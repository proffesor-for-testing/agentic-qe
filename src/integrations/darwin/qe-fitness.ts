/**
 * QE → Darwin fitness adapter (cross-pollination plan 05, action D1).
 *
 * Darwin Mode evolves a harness against a frozen, pure-function scorer
 * (`@metaharness/darwin` ADR-072). Its default substrates (`mock`/`agent`) score
 * by whether synthetic surface params solve toy tasks — there is NO QE signal.
 * This adapter folds AQE's OBJECTIVE QE metrics (mutation kill-rate, coverage,
 * suite cost — the ADR-104 arena's validated fitness) into Darwin's `ScoreCard`
 * contract, so Darwin's promotion gate promotes genuine QE improvements.
 *
 * QE-native finalScore: like Darwin's `benchSuite` path (which overrides the
 * single-run promote flag), we set `finalScore` to the QE fitness rather than
 * Darwin's generic weighted fold — QE has its own validated objective. The
 * positive terms are still populated (for transparency + Darwin's gate clauses:
 * `testPassRate` drives noRegression, `safetyScore` drives the safety clauses).
 *
 * Pure + deterministic + dependency-free: no model calls, no I/O. Unit-testable.
 */

import type { DarwinScoreCard, QeFitness } from './types.js';

/** ADR-104 arena weights — kept in sync with src/arena/arena.ts. */
export const QE_FITNESS_WEIGHTS = { kill: 0.6, coverage: 0.3, runtimePenalty: 0.1 } as const;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/** Recompute the ADR-104 blended fitness from its parts (used when not supplied). */
export function computeQeFitness(killRate: number, coveragePct: number | null, suiteCostRatio: number): number {
  const coverageTerm = coveragePct === null ? 0 : coveragePct / 100;
  return round4(
    QE_FITNESS_WEIGHTS.kill * killRate +
      QE_FITNESS_WEIGHTS.coverage * coverageTerm -
      QE_FITNESS_WEIGHTS.runtimePenalty * suiteCostRatio,
  );
}

export interface QeScoreOptions {
  /**
   * Whether the variant cleared Darwin's safety gate (inspectVariant /
   * validateGeneratedCode). Defaults to true — set false to model a blocked
   * variant (collapses the score, exactly like a Darwin safety violation).
   */
  safe?: boolean;
  /** Darwin's frozen positive-term weights (for the transparency baseScore). */
  weights?: { taskSuccess: number; testPassRate: number; traceQuality: number; costEfficiency: number; latencyEfficiency: number; safetyScore: number };
}

const DARWIN_WEIGHTS = {
  taskSuccess: 0.35,
  testPassRate: 0.2,
  traceQuality: 0.15,
  costEfficiency: 0.1,
  latencyEfficiency: 0.1,
  safetyScore: 0.1,
} as const;

/**
 * Map one QE outcome to a Darwin `ScoreCard`.
 *
 * Term mapping (QE semantics):
 *  - taskSuccess     = killRate when the baseline suite passes, else 0
 *    (the QE "task" is catching injected faults; quality scales with kill-rate)
 *  - testPassRate    = 1 if baseline passed, else 0   → Darwin's noRegression gate
 *  - traceQuality    = coverage fraction               (how thoroughly code ran)
 *  - costEfficiency  = 1 − suiteCostRatio
 *  - latencyEfficiency = 1 (arena folds runtime into the cost proxy; no separate signal)
 *  - safetyScore     = 1 if safe, else 0               → Darwin's safety clauses
 *  - hallucinatedFile penalty = falseFindingRate       (a QE false positive is a hallucination)
 *
 * finalScore (QE-native): the ADR-104 fitness when safe AND baseline passed;
 * −1 when unsafe (hard fail, mirrors Darwin "a single violation drives it
 * negative"); 0 when safe but the baseline regressed.
 */
export function qeFitnessToScoreCard(variantId: string, qe: QeFitness, opts: QeScoreOptions = {}): DarwinScoreCard {
  const safe = opts.safe ?? true;
  const w = opts.weights ?? DARWIN_WEIGHTS;
  const passed = qe.baselinePassed;
  const fitness = qe.fitness ?? computeQeFitness(qe.killRate, qe.coveragePct, qe.suiteCostRatio);

  const coverageFraction = qe.coveragePct === null ? 0 : clamp01(qe.coveragePct / 100);
  const falseFindingRate = clamp01(qe.falseFindingRate ?? 0);

  const taskSuccess = passed ? clamp01(qe.killRate) : 0;
  const testPassRate = passed ? 1 : 0;
  const traceQuality = coverageFraction;
  const costEfficiency = clamp01(1 - qe.suiteCostRatio);
  const latencyEfficiency = 1;
  const safetyScore = safe ? 1 : 0;

  const baseScore = round4(
    w.taskSuccess * taskSuccess +
      w.testPassRate * testPassRate +
      w.traceQuality * traceQuality +
      w.costEfficiency * costEfficiency +
      w.latencyEfficiency * latencyEfficiency +
      w.safetyScore * safetyScore,
  );

  // QE-native verdict (overrides the generic fold — QE owns its objective).
  const finalScore = !safe ? -1 : passed ? round4(fitness - falseFindingRate * 0.15) : 0;

  const reason = !safe
    ? 'unsafe: variant failed the safety gate (finalScore forced negative)'
    : !passed
      ? 'regression: baseline suite did not pass (finalScore 0)'
      : `QE fitness ${fitness} (kill=${qe.killRate}, cov=${qe.coveragePct ?? 'n/a'}, cost=${qe.suiteCostRatio})`;

  return {
    variantId,
    taskSuccess,
    testPassRate,
    traceQuality,
    costEfficiency,
    latencyEfficiency,
    safetyScore,
    secretExposure: 0,
    destructiveAction: 0,
    hallucinatedFile: falseFindingRate,
    toolLoop: 0,
    costOverrun: 0,
    baseScore,
    finalScore,
    promoted: false, // set by Darwin's gate against the parent, not here
    reason,
  };
}

/** Darwin's ADR-072 safety-gate floor (mirror of scorer.ts SAFETY_GATE). */
export const SAFETY_GATE = 0.95;

/**
 * Apply Darwin's 4-clause promotion gate (ADR-072 / scorer.ts:149-154) to a
 * QE-native score card, returning a copy with `promoted` + `reason` set. Kept a
 * byte-faithful mirror so a host-scored variant promotes under the SAME rules
 * Darwin uses internally: beatsParent ∧ safetyOk ∧ noRegression ∧ noBlocked.
 */
export function applyQePromotionGate(
  card: DarwinScoreCard,
  parentScore: DarwinScoreCard | null,
  promotionDelta: number,
): DarwinScoreCard {
  const parentFinal = parentScore?.finalScore ?? 0;
  const parentTestPassRate = parentScore?.testPassRate ?? 0;

  const beatsParent = card.finalScore > parentFinal + promotionDelta;
  const safetyOk = card.safetyScore >= SAFETY_GATE;
  const noRegression = card.testPassRate >= parentTestPassRate;
  const noBlockedActions = card.safetyScore === 1.0;
  const promoted = beatsParent && safetyOk && noRegression && noBlockedActions;

  const fails: string[] = [];
  if (!beatsParent) fails.push(`finalScore ${card.finalScore} ≤ parent ${parentFinal} + delta ${promotionDelta}`);
  if (!safetyOk) fails.push(`safetyScore ${card.safetyScore} < ${SAFETY_GATE}`);
  if (!noRegression) fails.push(`testPassRate regression ${card.testPassRate} < ${parentTestPassRate}`);
  if (!noBlockedActions) fails.push('blocked actions present');

  return {
    ...card,
    promoted,
    reason: promoted
      ? `promoted: QE finalScore ${card.finalScore} > parent ${parentFinal} + delta ${promotionDelta}`
      : `not promoted: ${fails.join('; ')}`,
  };
}

/** Minimal shape of an ADR-104 `EvaluatedStrategy` (decoupled from src/arena). */
export interface EvaluatedStrategyLike {
  id: string;
  baselinePassed: boolean;
  killRate: number;
  coveragePct: number | null;
  suiteCostRatio: number;
  fitness: number;
}

/** Convert a whole ADR-104 arena result into per-strategy Darwin score cards. */
export function arenaStrategiesToScoreCards(
  strategies: readonly EvaluatedStrategyLike[],
  opts: QeScoreOptions = {},
): Record<string, DarwinScoreCard> {
  const out: Record<string, DarwinScoreCard> = {};
  for (const s of strategies) {
    out[s.id] = qeFitnessToScoreCard(
      s.id,
      {
        baselinePassed: s.baselinePassed,
        killRate: s.killRate,
        coveragePct: s.coveragePct,
        suiteCostRatio: s.suiteCostRatio,
        fitness: s.fitness,
      },
      opts,
    );
  }
  return out;
}
