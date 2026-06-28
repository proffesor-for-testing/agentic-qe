/**
 * Regenerability Gate (ADR-113)
 *
 * Answers the Deletion Test per module: "if I deleted this module and
 * regenerated it, how confident am I that a wrong rebuild would be caught?"
 * Confidence comes from the oracle tier backing the module (durable > live >
 * ephemeral > none) scaled by its mutation kill rate. The gate is warn-by-default
 * and opt-in blocking so it never breaks an existing pipeline on adoption.
 *
 * Pure functions only — no I/O. Inputs (tier presence + mutation score) are
 * produced upstream by the oracle eval runner and test-tier tagging.
 */

/** Which durability tier of test backs a module (see qe-test-generation SKILL.md). */
export type RegenerabilityTier = 'durable' | 'live' | 'ephemeral' | 'none';

export interface ModuleTestProfile {
  module: string;
  /** Mutation kill rate of the module's tests, 0..1. */
  mutationScore: number;
  /** Has >=1 durable test (invariant / contract / property at the boundary). */
  hasDurable: boolean;
  /** Has live checks (monitoring / drift / cost assertions). */
  hasLive?: boolean;
  /** Has ephemeral tests (example-based / mock-call). */
  hasEphemeral?: boolean;
}

export interface RegenerabilityResult {
  module: string;
  tier: RegenerabilityTier;
  /** 0..1 confidence that deleting + regenerating this module is safe. */
  score: number;
  reason: string;
}

export interface RegenerabilityGateConfig {
  /** Minimum mutation kill rate per module. */
  mutationScoreMin: number;
  /** Minimum regenerability score per module. */
  regenerabilityMin: number;
  /** 'warn' reports but never fails CI; 'block' fails CI when thresholds are unmet. */
  mode: 'warn' | 'block';
}

/** Non-blocking by default — adoption must not break existing pipelines. */
export const DEFAULT_REGENERABILITY_GATE: RegenerabilityGateConfig = {
  mutationScoreMin: 0.6,
  regenerabilityMin: 0.5,
  mode: 'warn',
};

export interface RegenerabilityGateVerdict {
  /** True when every module meets both thresholds. */
  passed: boolean;
  /** True only when the gate should fail CI: mode === 'block' AND not passed. */
  blocking: boolean;
  mode: 'warn' | 'block';
  results: RegenerabilityResult[];
  failures: Array<{ module: string; reasons: string[] }>;
  summary: string;
}

const round = (n: number): number => Math.round(n * 10000) / 10000;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Highest tier of test present on the module. Durable wins because it survives a rewrite. */
export function classifyTier(profile: ModuleTestProfile): RegenerabilityTier {
  if (profile.hasDurable) return 'durable';
  if (profile.hasLive) return 'live';
  if (profile.hasEphemeral) return 'ephemeral';
  return 'none';
}

/**
 * Regenerability = fault-detection (mutation score) discounted by how well the
 * backing tests survive a reimplementation. Ephemeral tests are coupled to the
 * current code, so even a high mutation score earns limited regeneration
 * confidence; durable tests earn full confidence for their kill rate.
 */
export function regenerabilityScore(profile: ModuleTestProfile): RegenerabilityResult {
  const tier = classifyTier(profile);
  const mutation = clamp01(profile.mutationScore);
  let score: number;
  let reason: string;
  switch (tier) {
    case 'durable':
      score = mutation;
      reason = `durable tests kill ${(mutation * 100).toFixed(0)}% of mutants and survive a reimplementation`;
      break;
    case 'live':
      score = mutation * 0.7;
      reason = `live checks only; ${(mutation * 100).toFixed(0)}% mutation — add durable boundary tests for full confidence`;
      break;
    case 'ephemeral':
      score = mutation * 0.4;
      reason = `only ephemeral (example/mock) tests — coupled to the current implementation, would not survive a rewrite`;
      break;
    case 'none':
    default:
      score = 0;
      reason = `no tests — deleting this module is unrecoverable (fails the Deletion Test)`;
      break;
  }
  return { module: profile.module, tier, score: round(score), reason };
}

/**
 * Evaluate the regenerability gate over a set of modules.
 * `passed` reflects thresholds; `blocking` reflects whether CI should fail.
 */
export function evaluateRegenerabilityGate(
  profiles: ModuleTestProfile[],
  config: RegenerabilityGateConfig = DEFAULT_REGENERABILITY_GATE,
): RegenerabilityGateVerdict {
  const results = profiles.map(regenerabilityScore);
  const failures: Array<{ module: string; reasons: string[] }> = [];

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const r = results[i];
    const reasons: string[] = [];
    if (clamp01(p.mutationScore) < config.mutationScoreMin) {
      reasons.push(
        `mutation score ${(clamp01(p.mutationScore) * 100).toFixed(0)}% < ${(config.mutationScoreMin * 100).toFixed(0)}%`,
      );
    }
    if (r.score < config.regenerabilityMin) {
      reasons.push(
        `regenerability ${(r.score * 100).toFixed(0)}% < ${(config.regenerabilityMin * 100).toFixed(0)}% (${r.tier})`,
      );
    }
    if (reasons.length > 0) failures.push({ module: p.module, reasons });
  }

  const passed = failures.length === 0;
  const blocking = config.mode === 'block' && !passed;
  const verb = passed ? 'PASS' : config.mode === 'block' ? 'FAIL (blocking)' : 'WARN (non-blocking)';
  const summary =
    profiles.length === 0
      ? 'regenerability gate: no modules evaluated'
      : `regenerability gate: ${verb} — ${profiles.length - failures.length}/${profiles.length} modules meet thresholds`;

  return { passed, blocking, mode: config.mode, results, failures, summary };
}
