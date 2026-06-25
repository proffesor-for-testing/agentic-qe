/**
 * Darwin Mode integration — local type mirror (Phase-0, zero-coupling).
 *
 * These interfaces STRUCTURALLY mirror `@metaharness/darwin`'s
 * `packages/darwin-mode/src/types.ts` (ADR-072 ScoreCard) so AQE can produce
 * Darwin-compatible scores WITHOUT a build-time dependency on the pre-1.0
 * MetaHarness package (per cross-pollination plan 05: Phase-0 actions stay
 * decoupled).
 *
 * VERSION CONTRACT (plan A8, verified 2026-06-25): `DarwinScoreCard` is byte-for-
 * byte structurally identical to upstream `ScoreCard` from @metaharness/darwin@0.2.1
 * THROUGH @0.7.0 (no drift across 5 minors). The mirror is INTENTIONALLY KEPT, not
 * replaced by a real import: the upstream is a fast-moving pre-1.0 package whose
 * tarball pulls napi/wasm transitive deps, so the zero-coupling mirror is the lower-
 * risk substrate (see plan 05 "A8 — status"). `tests/.../darwin-version-contract.test.ts`
 * pins the mirror's field set so any divergence is caught.
 *
 * Pinned upstream contract: @metaharness/darwin ScoreCard @ 0.2.1–0.7.0.
 */

/** The seven mutation surfaces (mirror of Darwin's MutationSurface). */
export type MutationSurface =
  | 'planner'
  | 'contextBuilder'
  | 'reviewer'
  | 'retryPolicy'
  | 'toolPolicy'
  | 'memoryPolicy'
  | 'scorePolicy';

/**
 * Mirror of Darwin's `ScoreCard` (ADR-072). All terms/penalties ∈ [0,1].
 * Darwin's frozen scorer folds the positive terms with fixed weights:
 *   baseScore = 0.35·taskSuccess + 0.20·testPassRate + 0.15·traceQuality
 *             + 0.10·costEfficiency + 0.10·latencyEfficiency + 0.10·safetyScore
 * then subtracts the penalty layer to get finalScore.
 */
export interface DarwinScoreCard {
  variantId: string;
  // positive weighted terms
  taskSuccess: number;
  testPassRate: number;
  traceQuality: number;
  costEfficiency: number;
  latencyEfficiency: number;
  safetyScore: number;
  // hard penalties
  secretExposure: number;
  destructiveAction: number;
  hallucinatedFile: number;
  toolLoop: number;
  costOverrun: number;
  // result
  baseScore: number;
  finalScore: number;
  promoted: boolean;
  reason: string;
}

/**
 * The objective QE outcome of evaluating one harness variant on a QE task.
 * Shaped to AQE's ADR-104 arena `EvaluatedStrategy`, but generic enough for any
 * QE scorer (mutation, coverage, false-finding).
 */
export interface QeFitness {
  /** Did the suite pass on un-mutated code? A regression here disqualifies. */
  baselinePassed: boolean;
  /** Mutation kill-rate ∈ [0,1] — the headline QE quality signal. */
  killRate: number;
  /** Line coverage percentage ∈ [0,100], or null when uncollected. */
  coveragePct: number | null;
  /** Deterministic cost proxy ∈ [0,1] (selected groups / total). */
  suiteCostRatio: number;
  /**
   * Blended QE fitness (ADR-104): 0.6·killRate + 0.3·(coverage/100) − 0.1·cost.
   * Optional — recomputed from the parts when omitted.
   */
  fitness?: number;
  /** False-finding rate ∈ [0,1] — drives a hallucination penalty when > 0. */
  falseFindingRate?: number;
}
