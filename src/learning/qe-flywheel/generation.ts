/**
 * QE-policy flywheel — the generational loop (ADR-118).
 *
 * One generation: score the baseline champion and a candidate, seal the decision
 * inputs, re-execute the FROZEN accept() rule (ADR-120 `accept/v1`: held-out
 * beats baseline ∧ anchor no-regression (ADR-117) ∧ oracle tier (ADR-121)),
 * and emit an Ed25519-signed receipt into an append-only lineage. Promotions
 * compound: each generation re-bases on the previous promoted champion.
 *
 * The corpus SCORER is injected — harvesting `qe_patterns` and running retrieval
 * + grading the anchor is the DB/model-touching part, wired separately. This
 * keeps the loop, gate, receipts, and lineage fully testable and deterministic.
 *
 * Honest-null (ADR-234): a generation — or a whole run — that promotes NOTHING
 * is a correct, valid, replayable outcome, not a failure.
 */

import { DEFAULT_PROVENANCE_TIER } from '../provenance-tier.js';
import {
  reExecuteGate,
  gateFingerprint,
  sealedHash,
  verifyPromotion,
  type SealedInputs,
} from '../../validation/gate-reexecute.js';
import type { RetrievalPolicy } from './policy.js';
import { policyId } from './policy.js';
import {
  signReceipt,
  verifyReceiptSignature,
  toPromotionReceipt,
  type EvolveReceipt,
  type Signer,
} from './receipt.js';

/** Scores for a policy on the harvested corpus + the frozen anchor. */
export interface PolicyScores {
  /** Self-retrieval on the held-out split (the train/serve signal — never the accept signal alone). */
  heldOut: number;
  /** Mean over the ADR-117 frozen anchor items (the no-regression signal). */
  anchorMean: number;
  /**
   * Per-held-out-task scores whose mean is `heldOut`. Optional — when present and
   * paired index-for-index with the baseline's, they enable the accept/v1+sig
   * paired-bootstrap significance gate (ADR-118). Scorers that don't provide them
   * simply can't use accept/v1+sig (it fail-closes).
   */
  heldOutSamples?: number[];
}

/** Injected: evaluate a policy → its held-out + anchor scores. */
export type PolicyScorer = (policy: RetrievalPolicy) => PolicyScores | Promise<PolicyScores>;

export interface HeadroomResult {
  hasHeadroom: boolean;
  baselineHeldOut: number;
  baselineAnchorMean: number;
  reason: string;
}

/**
 * ADR-118 §1 headroom precondition. If the baseline already saturates the
 * held-out signal, the loop must NOT run — it would spend compute for
 * structurally-zero promotions (the MetaHarness SWE-bench null).
 */
export async function checkHeadroom(
  baseline: RetrievalPolicy,
  scorer: PolicyScorer,
  saturation = 0.999,
): Promise<HeadroomResult> {
  const s = await scorer(baseline);
  const hasHeadroom = s.heldOut < saturation;
  return {
    hasHeadroom,
    baselineHeldOut: s.heldOut,
    baselineAnchorMean: s.anchorMean,
    reason: hasHeadroom
      ? `baseline held-out ${s.heldOut.toFixed(4)} < saturation ${saturation} — headroom exists`
      : `baseline held-out ${s.heldOut.toFixed(4)} >= saturation ${saturation} — no headroom, loop must not run`,
  };
}

export interface GenerationInput {
  generation: number;
  baseline: RetrievalPolicy;
  candidate: RetrievalPolicy;
  scorer: PolicyScorer;
  /** ADR-117 frozen anchor content hash (which anchor was graded). */
  anchorHash: string;
  /** No-regression tolerance (ADR-117 sign-off: 0.0). */
  anchorTol: number;
  /** Provenance tier of the corpus evidence (ADR-121). Only oracle-tier promotes. */
  provenanceTier?: string;
  /** Whether judge-tier promotion is explicitly budgeted (ADR-121). */
  allowJudgeTier?: boolean;
  signer: Signer;
  /** Frozen rule version (default 'accept/v1'). */
  ruleVersion?: string;
}

export interface GenerationResult {
  generation: number;
  verdict: 'promote' | 'reject';
  baselinePolicyId: string;
  candidatePolicyId: string;
  scores: { baseline: PolicyScores; candidate: PolicyScores };
  receipt: EvolveReceipt;
  /** The champion AFTER this generation: candidate if promoted, else baseline unchanged. */
  champion: RetrievalPolicy;
}

/**
 * Run one flywheel generation. Deterministic given the scorer and signer seed.
 * Never mutates fleet state — it returns the verdict + a signed receipt; serving
 * the champion is a separate, reversible step (serveChampion / rollback).
 */
export async function runFlywheelGeneration(input: GenerationInput): Promise<GenerationResult> {
  const ruleVersion = input.ruleVersion ?? 'accept/v1';
  const provenanceTier = input.provenanceTier ?? DEFAULT_PROVENANCE_TIER;

  const baselineScores = await input.scorer(input.baseline);
  const candidateScores = await input.scorer(input.candidate);

  const sealed: SealedInputs = {
    candidateHeldOut: candidateScores.heldOut,
    baselineHeldOut: baselineScores.heldOut,
    candidateAnchorMean: candidateScores.anchorMean,
    baselineAnchorMean: baselineScores.anchorMean,
    anchorHash: input.anchorHash,
    anchorTol: input.anchorTol,
    provenanceTier,
    allowJudgeTier: input.allowJudgeTier,
    // ADR-118 accept/v1+sig: seal the paired per-task samples ONLY when the sig
    // rule is in use. Left undefined for accept/v1 (and thus absent from the
    // sealed hash), so accept/v1 receipts remain byte-identical to before.
    candidateHeldOutSamples: ruleVersion === 'accept/v1+sig' ? candidateScores.heldOutSamples : undefined,
    baselineHeldOutSamples: ruleVersion === 'accept/v1+sig' ? baselineScores.heldOutSamples : undefined,
  };

  const ruleResult = reExecuteGate(ruleVersion, sealed);
  const verdict: 'promote' | 'reject' = ruleResult.promote ? 'promote' : 'reject';

  const baselinePolicyId = policyId(input.baseline);
  const candidatePolicyId = policyId(input.candidate);

  const receipt = signReceipt({
    generation: input.generation,
    ruleVersion,
    ruleFingerprint: gateFingerprint(ruleVersion),
    sealed,
    sealedHash: sealedHash(sealed),
    verdict,
    baselinePolicyId,
    candidatePolicyId,
    signerKeyId: input.signer.keyId,
    publicKeyPem: input.signer.publicKeyPem,
  }, input.signer);

  return {
    generation: input.generation,
    verdict,
    baselinePolicyId,
    candidatePolicyId,
    scores: { baseline: baselineScores, candidate: candidateScores },
    receipt,
    champion: verdict === 'promote' ? input.candidate : input.baseline,
  };
}

export interface LineageResult {
  /** Number of PROMOTED generations. */
  promotions: number;
  /** Every promoted child re-based on its parent's promoted candidate (compounding). */
  lineageIntact: boolean;
  /** Every receipt's signature verifies AND its frozen gate re-executes to the recorded verdict. */
  allReplayable: boolean;
  reason: string;
}

/**
 * Reconstruct + validate a lineage from an ordered receipt list (ADR-118 §4).
 * Proves the chain compounds and every step is replayable — the property that
 * makes a stub unable to launder a regression (a forged promote fails
 * verifyPromotion; a broken chain fails lineageIntact).
 */
export function reconstructLineage(receipts: EvolveReceipt[]): LineageResult {
  let promotions = 0;
  let lineageIntact = true;
  let allReplayable = true;

  let lastPromotedCandidate: string | null = null;
  for (const r of receipts) {
    // Replayability: signature + frozen-rule re-execution (ADR-120).
    if (!verifyReceiptSignature(r)) allReplayable = false;
    const replay = verifyPromotion(toPromotionReceipt(r));
    if (!replay.valid) allReplayable = false;

    if (r.verdict === 'promote') {
      // A promoted generation must re-base on the previous promoted champion.
      if (lastPromotedCandidate !== null && r.baselinePolicyId !== lastPromotedCandidate) {
        lineageIntact = false;
      }
      lastPromotedCandidate = r.candidatePolicyId;
      promotions++;
    }
  }

  return {
    promotions,
    lineageIntact,
    allReplayable,
    reason: `${promotions} promotion(s); lineage ${lineageIntact ? 'intact' : 'BROKEN'}; `
      + `${allReplayable ? 'all replayable' : 'NOT all replayable'}`,
  };
}

// ---------------------------------------------------------------------------
// Reversible active-policy pointer + serve-then-shadow + drift canary (§5)
// ---------------------------------------------------------------------------

export interface ActivePolicy {
  current: RetrievalPolicy;
  currentId: string;
  /** Rollback target — the policy served before `current`. */
  previous: RetrievalPolicy | null;
  previousId: string | null;
  generation: number;
}

/** Initialize the active pointer at the gen-0 root policy. */
export function initActivePolicy(root: RetrievalPolicy): ActivePolicy {
  return { current: root, currentId: policyId(root), previous: null, previousId: null, generation: 0 };
}

/**
 * Serve a newly-promoted champion, shifting the old current into `previous` as
 * the rollback target (serve-then-shadow: the new policy is served, the old is
 * retained one generation for the canary to fall back to).
 */
export function serveChampion(active: ActivePolicy, champion: RetrievalPolicy, generation: number): ActivePolicy {
  return {
    current: champion,
    currentId: policyId(champion),
    previous: active.current,
    previousId: active.currentId,
    generation,
  };
}

/** Roll the active pointer back to its previous policy (drift-canary auto-rollback). */
export function rollback(active: ActivePolicy): ActivePolicy {
  if (active.previous === null) return active; // nothing to roll back to
  return {
    current: active.previous,
    currentId: active.previousId!,
    previous: null,
    previousId: null,
    generation: active.generation,
  };
}

export interface DriftCanaryResult {
  drifted: boolean;
  reason: string;
}

/**
 * Drift canary (ADR-118 §5, ruflo `:259-302`): re-score the served champion
 * against its predecessor on a FRESH harvest; if EITHER the held-out or the
 * anchor score drops below the predecessor, the promotion regressed in
 * production and must be rolled back.
 */
export function checkDriftCanary(served: PolicyScores, predecessor: PolicyScores, tol = 0): DriftCanaryResult {
  const heldOutDrift = served.heldOut < predecessor.heldOut - tol;
  const anchorDrift = served.anchorMean < predecessor.anchorMean - tol;
  const drifted = heldOutDrift || anchorDrift;
  return {
    drifted,
    reason: drifted
      ? `drift detected: ${heldOutDrift ? `held-out ${served.heldOut.toFixed(4)}<${predecessor.heldOut.toFixed(4)} ` : ''}`
        + `${anchorDrift ? `anchor ${served.anchorMean.toFixed(4)}<${predecessor.anchorMean.toFixed(4)}` : ''}`.trim()
      : 'served champion holds vs predecessor — no rollback',
  };
}
