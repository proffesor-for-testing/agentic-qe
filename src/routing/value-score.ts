/**
 * Cost-Pareto Value Score (plan 05 / A13).
 *
 * Ruv's leaderboard lesson (ADR-179): rank by quality-PER-DOLLAR, not absolute
 * quality. This operationalizes ADR-111's "competitive QE quality cheaper than
 * frontier" — pure functions to (a) compute a tunable value score, (b) rank a
 * candidate pool, and (c) extract the cost-Pareto frontier (the non-dominated set
 * a router should choose from). Pure + dependency-free.
 *
 * Companion: model→QE-role fit must be MEASURED, not assumed (the qwen3-coder
 * leaderboard-rank-did-not-transfer lesson). {@link MEASURED_QE_TEST_GEN} is a
 * dated snapshot from D3/A12; the router should refresh it from routing-feedback.
 */

export interface ModelEconomics {
  model: string;
  /** Measured QE quality on the role, 0..1 (e.g. ADR-104 composite). NOT a vendor claim. */
  quality: number;
  /** USD per instance (0 for free/local tiers). */
  costPerInstance: number;
}

export interface ValueScoreOptions {
  /** 0 = rank by pure quality, 1 = pure cost-efficiency. Default 0.5 (the slider). */
  costWeight?: number;
  /** USD ceiling to normalize cost into [0,1]. Default = max cost in the set (or the value's own cost). */
  costCap?: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Value score in [0,1]: a `costWeight`-weighted blend of quality and cost-
 * efficiency (1 − normalizedCost). A $0 tier has perfect cost-efficiency, so its
 * value is dominated by its quality.
 */
export function valueScore(m: ModelEconomics, opts: ValueScoreOptions = {}): number {
  const costWeight = clamp01(opts.costWeight ?? 0.5);
  const cap = opts.costCap && opts.costCap > 0 ? opts.costCap : Math.max(m.costPerInstance, 1e-9);
  const costEfficiency = clamp01(1 - m.costPerInstance / cap);
  return clamp01((1 - costWeight) * clamp01(m.quality) + costWeight * costEfficiency);
}

/** Rank a candidate pool by value score (desc). Cost is normalized across the pool. */
export function rankByValue<T extends ModelEconomics>(
  models: T[],
  opts: ValueScoreOptions = {},
): Array<T & { value: number }> {
  const cap = opts.costCap && opts.costCap > 0 ? opts.costCap : Math.max(...models.map((m) => m.costPerInstance), 1e-9);
  return models
    .map((m) => ({ ...m, value: valueScore(m, { ...opts, costCap: cap }) }))
    .sort((a, b) => b.value - a.value);
}

/**
 * The cost-Pareto frontier: models NOT dominated by another (none is both
 * cheaper AND ≥ quality). These are the only rational router choices — everything
 * else is strictly worse on both axes. Sorted cheapest → most expensive.
 */
export function paretoFrontier<T extends ModelEconomics>(models: T[]): T[] {
  const dominated = (m: T) =>
    models.some((o) => o !== m && o.costPerInstance <= m.costPerInstance && o.quality >= m.quality &&
      (o.costPerInstance < m.costPerInstance || o.quality > m.quality));
  return models.filter((m) => !dominated(m)).sort((a, b) => a.costPerInstance - b.costPerInstance);
}

/**
 * MEASURED QE test-generation economics (snapshot 2026-06-24, D3/A12). Quality =
 * composite (0.6·killRate + 0.3·coverage) on the 5-module corpus; cost is the
 * per-instance estimate. NOT vendor claims — refresh from routing-feedback.
 */
export const MEASURED_QE_TEST_GEN: readonly ModelEconomics[] = [
  { model: 'qwen3:8b', quality: 0.0, costPerInstance: 0 },         // D3: below the generation floor (0/3 valid)
  { model: 'qwen3:30b-a3b', quality: 0.62, costPerInstance: 0 },   // D3: clears the floor (best-of-k ~0.673 on judged)
  { model: 'qwen3-coder:30b', quality: 0.62, costPerInstance: 0 }, // 2026-06-29 oracle bench: ties 30b-a3b (both 6/8, 75% mut) but ~14× faster wall-clock; default local test-gen model
  { model: 'qwen2.5-coder:7b', quality: 0.50, costPerInstance: 0 },  // 2026-06-29: stock 7B coder = 4/8 (50%) — beats general qwen3:8b (38%), 16× faster; ~25pp below 30B (PEFT-tune target)
  { model: 'qwen2.5-coder:1.5b', quality: 0.08, costPerInstance: 0 }, // 2026-06-29: stock 1.5B coder = 1/8 (8%); below floor, size dominates coder-tuning at tiny scale
  { model: 'z-ai/glm-5.2', quality: 0.71, costPerInstance: 0.0065 }, // A12: diverse, higher per-model best
  { model: 'claude-sonnet-4-6', quality: 0.83, costPerInstance: 0.045 }, // D3: frontier ceiling
];
