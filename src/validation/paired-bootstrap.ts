/**
 * Paired-delta bootstrap significance (ADR-118 accept/v1+sig).
 *
 * Adopted from ruflo's flywheel promotion gate (`accept/v1+sig`,
 * `bootstrapDeltaCILow`), reimplemented dependency-free (technique adoption, not
 * an import — AQE does not depend on the ruflo package). ruflo's gate closes a
 * real gap in AQE's `accept/v1`, which promotes a candidate whose held-out MEAN
 * merely beats baseline by any amount — i.e. it can promote a within-noise gain.
 *
 * This computes a one-sided lower confidence bound on the MEAN of the PAIRED
 * per-task deltas (candidate − baseline, matched by task). If that bound is > 0
 * the gain is significant. The pairing is what makes it stronger than an
 * unpaired 2-group ANOVA (for 2 groups ANOVA F = t², and it discards the
 * pairing this exploits).
 *
 * MUST be DETERMINISTIC — the promotion decision is replay-verified (ADR-120):
 * a fixed-seed LCG resampler makes the same deltas always yield the same bound,
 * so an independent re-run reproduces the exact promote/reject decision.
 */

export interface BootstrapOptions {
  /** Resample count (default 2000, matching ruflo). */
  iters?: number;
  /** One-sided significance level (default 0.05 → 95% lower bound). */
  alpha?: number;
  /** LCG seed. Fixed by default so the bound is reproducible for replay. */
  seed?: number;
}

/**
 * One-sided lower confidence bound on the mean of `deltas`. Returns -Infinity
 * for an empty sample (no evidence ⇒ never significant), so callers can gate on
 * `bootstrapDeltaCILow(deltas) > 0` and fail closed.
 */
export function bootstrapDeltaCILow(deltas: number[], opts?: BootstrapOptions): number {
  const n = deltas.length;
  if (n === 0) return -Infinity;

  const iters = opts?.iters ?? 2000;
  const alpha = opts?.alpha ?? 0.05;
  // Deterministic LCG (Numerical Recipes constants). Seed is fixed by default so
  // the bound is byte-stable across independent replays of the same deltas.
  let state = (opts?.seed ?? 0x9e3779b1) >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };

  const resampleMeans = new Array<number>(iters);
  for (let b = 0; b < iters; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += deltas[Math.floor(next() * n)];
    }
    resampleMeans[b] = sum / n;
  }
  resampleMeans.sort((a, b) => a - b);

  const idx = Math.min(Math.floor(alpha * iters), iters - 1);
  return resampleMeans[idx];
}

/** Convenience: paired deltas from matched candidate/baseline sample vectors. */
export function pairedDeltas(candidate: number[], baseline: number[]): number[] {
  const n = Math.min(candidate.length, baseline.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = candidate[i] - baseline[i];
  return out;
}
