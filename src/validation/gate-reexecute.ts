/**
 * gateReExecutes — re-execute a frozen acceptance rule from sealed inputs
 * on every promotion path (ADR-120).
 *
 * The July 2026 remediation exposed the A8-EXT fake-`applied`-counter: a
 * promotion path that logged success without doing the work — a logged verdict
 * that lied. The fix (from MetaHarness `verifyReplayBundle`): trust the re-run,
 * not the log. At verification time, re-execute a VERSIONED FROZEN acceptance
 * rule against the decision's SEALED inputs; a recorded PROMOTE the frozen rule
 * would not grant is a forgery.
 *
 * Two checks, both required (mirrors MetaHarness `replay.ts:66-90`):
 *   - gateUnchanged   — the recorded rule fingerprint matches the current rule
 *                       version's fingerprint (a swapped rule is caught).
 *   - gateReExecutes  — re-running the frozen rule on the sealed inputs
 *                       reproduces the recorded verdict.
 * Plus sealIntact (ADR-116 composition) — the sealed inputs were not mutated
 * after the decision. Re-execution on tampered inputs is meaningless.
 *
 * The acceptance rule is a PURE function of sealed inputs. `accept/v1` composes
 * the cluster: ADR-121 provenance tier gate + ADR-118 held-out-beats-baseline +
 * ADR-117 anchor no-regression. Changing a rule is a new VERSION, never an
 * in-place edit (which gateUnchanged flags).
 */

import { createHash } from 'node:crypto';
import { meetsNoRegression } from './anchor-set.js';
import { tierAllowsPromotion } from '../learning/provenance-tier.js';
import { bootstrapDeltaCILow, pairedDeltas } from './paired-bootstrap.js';

/** The inputs a promotion decision was made on — sealed at decision time. */
export interface SealedInputs {
  /** Candidate policy's held-out score (ADR-118). */
  candidateHeldOut: number;
  /** Baseline (current champion) held-out score. */
  baselineHeldOut: number;
  /** Candidate anchor mean (ADR-117). */
  candidateAnchorMean: number;
  /** Baseline anchor mean. */
  baselineAnchorMean: number;
  /** Content hash of the ADR-117 anchor used (which frozen anchor this was graded on). */
  anchorHash: string;
  /** No-regression tolerance the anchor was gated at. */
  anchorTol: number;
  /** ADR-121 evidence tier of the candidate. */
  provenanceTier: string;
  /** Whether judge-tier promotion was explicitly budgeted (ADR-121). */
  allowJudgeTier?: boolean;
  /**
   * accept/v1+sig only: the candidate's PER-HELD-OUT-TASK scores, matched by
   * index to `baselineHeldOutSamples`. Optional and omitted from the sealed hash
   * when undefined (so `accept/v1` receipts are byte-identical). The paired
   * bootstrap significance gate needs these; `accept/v1` ignores them.
   */
  candidateHeldOutSamples?: number[];
  /** accept/v1+sig only: the baseline's per-held-out-task scores (paired by index). */
  baselineHeldOutSamples?: number[];
}

export interface RuleResult {
  promote: boolean;
  reason: string;
}

/** A versioned, frozen acceptance rule — a pure function of sealed inputs. */
export type AcceptanceRule = (sealed: SealedInputs) => RuleResult;

/** Tag domain-separating the rule fingerprint hash. */
const RULE_TAG = 'aqe:accept-rule:v1+sig';

/**
 * accept/v1 — the conjunctive frozen gate. Promotes only when ALL hold:
 *   1. provenance tier is strong enough (ADR-121),
 *   2. held-out strictly beats baseline (ADR-118),
 *   3. the anchor mean does not regress (ADR-117).
 */
const acceptV1: AcceptanceRule = (s) => {
  if (!tierAllowsPromotion(s.provenanceTier, { allowJudgeTier: s.allowJudgeTier })) {
    return { promote: false, reason: `provenance tier '${s.provenanceTier}' not allowed to promote` };
  }
  if (!(s.candidateHeldOut > s.baselineHeldOut)) {
    return { promote: false, reason: `held-out ${s.candidateHeldOut} did not beat baseline ${s.baselineHeldOut}` };
  }
  if (!meetsNoRegression(s.candidateAnchorMean, s.baselineAnchorMean, s.anchorTol)) {
    return { promote: false, reason: `anchor regression: ${s.candidateAnchorMean} < ${s.baselineAnchorMean} - ${s.anchorTol}` };
  }
  return { promote: true, reason: 'held-out gain, no anchor regression, oracle-tier evidence' };
};

/**
 * accept/v1+sig — accept/v1 PLUS a paired-bootstrap significance gate on the
 * held-out delta (adopted from ruflo's flywheel gate). A NEW frozen version:
 * `accept/v1` is untouched. Promotes only when accept/v1 passes AND the paired
 * per-task held-out gain is significant (one-sided 95% CI lower bound > 0) —
 * closing accept/v1's "promote any positive mean-beat, even within noise" gap.
 *
 * Fail-closed: if the paired sample vectors are absent or mismatched, it does
 * NOT promote (a significance claim it cannot verify is a rejection).
 */
const acceptV1Sig: AcceptanceRule = (s) => {
  const base = acceptV1(s);
  if (!base.promote) return base;

  const cand = s.candidateHeldOutSamples;
  const bl = s.baselineHeldOutSamples;
  if (!cand || !bl || cand.length === 0 || cand.length !== bl.length) {
    return {
      promote: false,
      reason: `significance gate: missing/mismatched paired held-out samples ` +
        `(need equal-length candidate & baseline per-task vectors)`,
    };
  }
  const ciLow = bootstrapDeltaCILow(pairedDeltas(cand, bl));
  if (!(ciLow > 0)) {
    return {
      promote: false,
      reason: `significance gate: paired held-out gain not significant ` +
        `(95% CI lower bound ${ciLow.toFixed(4)} ≤ 0)`,
    };
  }
  return { promote: true, reason: `${base.reason}; paired gain significant (CI low ${ciLow.toFixed(4)} > 0)` };
};

/** Registry of versioned frozen rules. Add a NEW key to change a rule; never edit in place. */
export const ACCEPTANCE_RULES: Readonly<Record<string, AcceptanceRule>> = Object.freeze({
  'accept/v1': acceptV1,
  'accept/v1+sig': acceptV1Sig,
});

/**
 * Canonical (sorted-key) JSON — same discipline as ADR-116 proof-gate. Keys
 * whose value is `undefined` are OMITTED, matching JSON.stringify, so a sealed
 * input's hash is stable across a JSON serialize/parse roundtrip (e.g. persisting
 * a receipt to the DB and reloading it — an optional field like `allowJudgeTier`
 * that is undefined must not change the hash).
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).filter((k) => rec[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(',')}}`;
}

/** SHA-256 content hash of the sealed inputs (ADR-116 canonical form). */
export function sealedHash(sealed: SealedInputs): string {
  return createHash('sha256').update(canonicalJson(sealed)).digest('hex');
}

/**
 * Fingerprint of a rule VERSION. Because a rule change is a version bump
 * (ADR-120 §5), fingerprinting the version string is the contract — an edited
 * rule ships under a new version and thus a new fingerprint. Throws for an
 * unknown version so a missing rule can never silently pass verification.
 */
export function gateFingerprint(ruleVersion: string): string {
  if (!(ruleVersion in ACCEPTANCE_RULES)) {
    throw new Error(`Unknown acceptance rule version '${ruleVersion}' — cannot fingerprint an unregistered rule.`);
  }
  return createHash('sha256').update(RULE_TAG).update('\0').update(ruleVersion).digest('hex');
}

/** Re-execute a frozen rule on sealed inputs. Throws for an unknown version. */
export function reExecuteGate(ruleVersion: string, sealed: SealedInputs): RuleResult {
  const rule = ACCEPTANCE_RULES[ruleVersion];
  if (!rule) {
    throw new Error(`Unknown acceptance rule version '${ruleVersion}' — refusing to re-execute an unregistered rule.`);
  }
  return rule(sealed);
}

/** A recorded promotion decision. The logged verdict is advisory; the re-run is authoritative. */
export interface PromotionReceipt {
  ruleVersion: string;
  /** Fingerprint recorded at decision time. */
  ruleFingerprint: string;
  /** Content hash of the sealed inputs recorded at decision time. */
  sealedHash: string;
  sealed: SealedInputs;
  /** What was logged. NOT trusted — re-execution decides. */
  recordedVerdict: 'promote' | 'reject';
}

export interface ReplayChecks {
  /** Sealed inputs were not mutated after the decision (ADR-116). */
  sealIntact: boolean;
  /** Recorded rule fingerprint matches the current (and pinned) rule version. */
  gateUnchanged: boolean;
  /** Re-running the frozen rule on the sealed inputs reproduces the recorded verdict. */
  gateReExecutes: boolean;
}

export interface ReplayVerdict {
  /** All three checks passed — the promotion is valid. */
  valid: boolean;
  checks: ReplayChecks;
  failures: string[];
  reason: string;
}

/**
 * Verify a promotion by re-executing its frozen rule on its sealed inputs.
 * The logged verdict is trusted only insofar as the re-run reproduces it.
 *
 * @param opts.pinnedRuleFingerprint - if supplied, the receipt's fingerprint
 *   must also equal this pinned value (an externally-anchored rule identity).
 */
export function verifyPromotion(
  receipt: PromotionReceipt,
  opts: { pinnedRuleFingerprint?: string } = {},
): ReplayVerdict {
  const failures: string[] = [];

  // sealIntact — recompute the sealed content hash (ADR-116).
  const sealIntact = sealedHash(receipt.sealed) === receipt.sealedHash;
  if (!sealIntact) failures.push('sealIntact');

  // gateUnchanged — recorded fingerprint matches the current rule version, and
  // the pinned fingerprint if one was supplied. Unknown version ⇒ not unchanged.
  let gateUnchanged = false;
  try {
    const currentFp = gateFingerprint(receipt.ruleVersion);
    gateUnchanged =
      receipt.ruleFingerprint === currentFp &&
      (opts.pinnedRuleFingerprint === undefined || receipt.ruleFingerprint === opts.pinnedRuleFingerprint);
  } catch {
    gateUnchanged = false; // unregistered rule version
  }
  if (!gateUnchanged) failures.push('gateUnchanged');

  // gateReExecutes — only meaningful if the inputs are intact and the rule is
  // the same one. Re-run must reproduce the recorded verdict; a logged PROMOTE
  // the frozen rule would reject (the A8-EXT forgery class) fails here.
  let gateReExecutes = false;
  if (sealIntact && gateUnchanged) {
    const rerun = reExecuteGate(receipt.ruleVersion, receipt.sealed);
    const rerunVerdict: 'promote' | 'reject' = rerun.promote ? 'promote' : 'reject';
    gateReExecutes = rerunVerdict === receipt.recordedVerdict;
  }
  if (!gateReExecutes) failures.push('gateReExecutes');

  const valid = failures.length === 0;
  return {
    valid,
    checks: { sealIntact, gateUnchanged, gateReExecutes },
    failures,
    reason: valid
      ? 'promotion verified: sealed inputs intact, rule unchanged, frozen rule re-execution reproduces the recorded verdict'
      : `promotion INVALID (failed: ${failures.join(', ')}) — the recorded verdict is not reproducible under the frozen rule`,
  };
}

// ============================================================================
// ADR-120 promotion-path retrofit rules (P1 pattern-promote, P2 dream-apply)
// ============================================================================
//
// The `accept/v1` cluster above is flywheel-shaped (held-out + anchor). The
// two highest-value in-fleet promotion paths (PROMOTION-PATH-INVENTORY P1/P2)
// carry a different sealed shape: pattern-promotion thresholds, and dream
// insight confidence. Rather than pollute `SealedInputs` (which would force a
// change to the frozen `accept/v1` rule and break its locked test), the path
// rules live in their own frozen registry with a superset sealed type. The
// verification semantics are IDENTICAL to `verifyPromotion` — sealIntact +
// gateUnchanged + gateReExecutes — so a forged/stale apply on either path is
// caught the same way the flywheel path catches it.

/**
 * Superset sealed inputs for the retrofit promotion paths. Every field is
 * optional; each frozen path rule reads only the fields it needs and rejects
 * (never throws) when a field it requires is absent — a missing input can
 * never silently promote.
 */
export interface PathSealedInputs {
  /** ADR-121 evidence tier of the artifact being promoted/applied. */
  provenanceTier: string;
  /** Whether judge-tier evidence was explicitly budgeted (ADR-121 / ADR-119). */
  allowJudgeTier?: boolean;

  // --- pattern-promote/v1 (P1) ---
  /** Pattern average reward (quality score). */
  reward?: number;
  /** Reward promotion threshold the decision was gated at. */
  rewardThreshold?: number;
  /** Pattern usage/occurrence count. */
  occurrences?: number;
  /** Minimum occurrence threshold. */
  occurrenceThreshold?: number;
  /** Pattern success rate. */
  successRate?: number;
  /** Minimum success-rate threshold. */
  successRateThreshold?: number;
  /** Whether the pattern was active within the promotion window (anti-stale). */
  withinActivityWindow?: boolean;

  // --- dream-apply/v1 (P2) ---
  /** Dream insight confidence score. */
  insightConfidence?: number;
  /** Confidence threshold the apply was gated at. */
  insightConfidenceThreshold?: number;
  /** Whether the insight produced a real (non-`no_action`) reorganization. */
  insightActionable?: boolean;
}

/** A versioned, frozen promotion-path rule — a pure function of sealed inputs. */
export type PathRule = (sealed: PathSealedInputs) => RuleResult;

/** Tag domain-separating the path-rule fingerprint (distinct from the accept tag). */
const PATH_RULE_TAG = 'aqe:promotion-path-rule:v1+sig';

/**
 * pattern-promote/v1 — the P1 conjunctive gate (short-term → long-term).
 * Promotes only when ALL hold: evidence tier allows promotion (ADR-121),
 * reward / occurrences / success-rate clear their sealed thresholds, and the
 * pattern was active within the promotion window (anti-stale).
 */
const patternPromoteV1: PathRule = (s) => {
  if (!tierAllowsPromotion(s.provenanceTier, { allowJudgeTier: s.allowJudgeTier })) {
    return { promote: false, reason: `provenance tier '${s.provenanceTier}' not allowed to promote` };
  }
  if (s.reward === undefined || s.rewardThreshold === undefined || !(s.reward >= s.rewardThreshold)) {
    return { promote: false, reason: `reward ${s.reward} below threshold ${s.rewardThreshold}` };
  }
  if (s.occurrences === undefined || s.occurrenceThreshold === undefined || !(s.occurrences >= s.occurrenceThreshold)) {
    return { promote: false, reason: `occurrences ${s.occurrences} below threshold ${s.occurrenceThreshold}` };
  }
  if (s.successRate === undefined || s.successRateThreshold === undefined || !(s.successRate >= s.successRateThreshold)) {
    return { promote: false, reason: `success rate ${s.successRate} below threshold ${s.successRateThreshold}` };
  }
  if (s.withinActivityWindow !== true) {
    return { promote: false, reason: 'pattern outside promotion activity window (stale)' };
  }
  return { promote: true, reason: 'tier allowed; reward/occurrence/success-rate thresholds met; within activity window' };
};

/**
 * dream-apply/v1 — the P2 gate (the A8-EXT fake-`applied`-counter home).
 * An insight is countable as applied only when: its evidence tier allows a
 * fleet-changing apply (ADR-121), its confidence clears the sealed threshold,
 * and it produced a real reorganization action (not `no_action`).
 */
const dreamApplyV1: PathRule = (s) => {
  if (!tierAllowsPromotion(s.provenanceTier, { allowJudgeTier: s.allowJudgeTier })) {
    return { promote: false, reason: `provenance tier '${s.provenanceTier}' not allowed to apply` };
  }
  if (
    s.insightConfidence === undefined ||
    s.insightConfidenceThreshold === undefined ||
    !(s.insightConfidence >= s.insightConfidenceThreshold)
  ) {
    return { promote: false, reason: `insight confidence ${s.insightConfidence} below threshold ${s.insightConfidenceThreshold}` };
  }
  if (s.insightActionable !== true) {
    return { promote: false, reason: 'insight produced no actionable reorganization' };
  }
  return { promote: true, reason: 'tier allowed; insight confidence meets threshold; actionable' };
};

/**
 * Registry of versioned frozen promotion-path rules. Add a NEW key to change a
 * rule; never edit in place (a rule change is a version bump — ADR-120 §5).
 * Kept separate from `ACCEPTANCE_RULES` so the flywheel accept gate and its
 * locked test are untouched.
 */
export const PROMOTION_PATH_RULES: Readonly<Record<string, PathRule>> = Object.freeze({
  'pattern-promote/v1': patternPromoteV1,
  'dream-apply/v1': dreamApplyV1,
});

/** SHA-256 content hash of path sealed inputs (ADR-116 canonical form). */
export function pathSealedHash(sealed: PathSealedInputs): string {
  return createHash('sha256').update(canonicalJson(sealed)).digest('hex');
}

/** Fingerprint of a path-rule VERSION. Throws for an unregistered rule. */
export function pathGateFingerprint(ruleVersion: string): string {
  if (!(ruleVersion in PROMOTION_PATH_RULES)) {
    throw new Error(`Unknown promotion-path rule version '${ruleVersion}' — cannot fingerprint an unregistered rule.`);
  }
  return createHash('sha256').update(PATH_RULE_TAG).update('\0').update(ruleVersion).digest('hex');
}

/** Re-execute a frozen path rule on sealed inputs. Throws for an unknown version. */
export function reExecutePathGate(ruleVersion: string, sealed: PathSealedInputs): RuleResult {
  const rule = PROMOTION_PATH_RULES[ruleVersion];
  if (!rule) {
    throw new Error(`Unknown promotion-path rule version '${ruleVersion}' — refusing to re-execute an unregistered rule.`);
  }
  return rule(sealed);
}

/** A recorded promotion/apply decision on a retrofit path. */
export interface PathPromotionReceipt {
  ruleVersion: string;
  /** Fingerprint recorded at decision time. */
  ruleFingerprint: string;
  /** Content hash of the sealed inputs recorded at decision time. */
  sealedHash: string;
  sealed: PathSealedInputs;
  /** What was logged. NOT trusted — re-execution decides. */
  recordedVerdict: 'promote' | 'reject';
}

/**
 * Verify a promotion-path decision by re-executing its frozen rule on its
 * sealed inputs. Identical semantics to {@link verifyPromotion}: the logged
 * verdict is trusted only insofar as the re-run reproduces it on intact inputs.
 */
export function verifyPathPromotion(
  receipt: PathPromotionReceipt,
  opts: { pinnedRuleFingerprint?: string } = {},
): ReplayVerdict {
  const failures: string[] = [];

  const sealIntact = pathSealedHash(receipt.sealed) === receipt.sealedHash;
  if (!sealIntact) failures.push('sealIntact');

  let gateUnchanged = false;
  try {
    const currentFp = pathGateFingerprint(receipt.ruleVersion);
    gateUnchanged =
      receipt.ruleFingerprint === currentFp &&
      (opts.pinnedRuleFingerprint === undefined || receipt.ruleFingerprint === opts.pinnedRuleFingerprint);
  } catch {
    gateUnchanged = false; // unregistered rule version
  }
  if (!gateUnchanged) failures.push('gateUnchanged');

  let gateReExecutes = false;
  if (sealIntact && gateUnchanged) {
    const rerun = reExecutePathGate(receipt.ruleVersion, receipt.sealed);
    const rerunVerdict: 'promote' | 'reject' = rerun.promote ? 'promote' : 'reject';
    gateReExecutes = rerunVerdict === receipt.recordedVerdict;
  }
  if (!gateReExecutes) failures.push('gateReExecutes');

  const valid = failures.length === 0;
  return {
    valid,
    checks: { sealIntact, gateUnchanged, gateReExecutes },
    failures,
    reason: valid
      ? 'promotion verified: sealed inputs intact, rule unchanged, frozen rule re-execution reproduces the recorded verdict'
      : `promotion INVALID (failed: ${failures.join(', ')}) — the recorded verdict is not reproducible under the frozen rule`,
  };
}
