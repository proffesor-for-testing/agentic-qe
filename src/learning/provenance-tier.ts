/**
 * Provenance tiers for learning writes (ADR-121).
 *
 * Every learning write carries an explicit evidence tier. Authority tracks
 * evidence strength: an execution-observed outcome is ground truth, an LLM
 * judgment is a noisy opinion (ADR-119), a structural/co-occurrence inference
 * is a weak guess. Only `oracle:test-exec` (or an explicitly-budgeted
 * `judge:llm`) may change fleet behavior; `proxy:structural` is written and
 * searchable but never auto-promoted.
 *
 * Mirrors ruflo ADR-174's in-code tier gate (not prose). Shared across every
 * promotion path (pattern promotion, dream apply, flywheel accept) so the gate
 * is defined once.
 */

/** Evidence tiers, strongest first. */
export type ProvenanceTier = 'oracle:test-exec' | 'judge:llm' | 'proxy:structural';

/** Ordered strongest → weakest. Index is the rank (0 = strongest). */
export const PROVENANCE_TIERS: readonly ProvenanceTier[] = [
  'oracle:test-exec',
  'judge:llm',
  'proxy:structural',
] as const;

/**
 * Conservative default for undifferentiated / legacy / unknown writes.
 * The backfill (ADR-121 §4) tags all pre-existing rows with this — it can
 * never over-credit, only under-credit until a row is re-derived from
 * execution evidence through the normal write path.
 */
export const DEFAULT_PROVENANCE_TIER: ProvenanceTier = 'proxy:structural';

/** Rank of a tier (0 = strongest). Unknown tiers rank as the weakest. */
export function tierRank(tier: string | null | undefined): number {
  const idx = PROVENANCE_TIERS.indexOf(coerceTier(tier));
  return idx < 0 ? PROVENANCE_TIERS.length - 1 : idx;
}

/**
 * Normalize any raw value read from storage into a known tier.
 * Null / undefined / unrecognized → the conservative default. Never throws —
 * a bad tier must degrade to "weak", never crash the promotion path.
 */
export function coerceTier(raw: string | null | undefined): ProvenanceTier {
  if (raw && (PROVENANCE_TIERS as readonly string[]).includes(raw)) {
    return raw as ProvenanceTier;
  }
  return DEFAULT_PROVENANCE_TIER;
}

export interface PromotionTierOptions {
  /**
   * When true, `judge:llm`-tier evidence may promote. This is an explicit,
   * cost-bearing budget decision (ADR-121 §2 / ADR-119): a single LLM judgment
   * is noisy, so judge-tier promotion is opt-in, never the default.
   */
  allowJudgeTier?: boolean;
}

/**
 * The in-code promotion gate (ADR-121 §2). `oracle:test-exec` may always
 * promote; `judge:llm` promotes only under an explicit budget flag;
 * `proxy:structural` is NEVER auto-promoted.
 *
 * This is the single authority consulted by every promotion path. It does not
 * decide whether the *metrics* clear threshold — only whether the *evidence
 * tier* is strong enough to be allowed to change fleet behavior at all.
 */
export function tierAllowsPromotion(
  tier: string | null | undefined,
  options: PromotionTierOptions = {},
): boolean {
  switch (coerceTier(tier)) {
    case 'oracle:test-exec':
      return true;
    case 'judge:llm':
      return options.allowJudgeTier === true;
    case 'proxy:structural':
    default:
      return false;
  }
}
