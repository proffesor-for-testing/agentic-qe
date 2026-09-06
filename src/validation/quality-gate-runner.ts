/**
 * Quality-gate orchestrator (ADR-119 / ADR-120).
 *
 * The ONE code path both the `aqe quality-gate` CLI subcommand and the
 * `qe/quality/gate` MCP tool call, so the two surfaces stay in exact parity
 * (the CLI/MCP divergence CLAUDE.md warns about). It:
 *
 *   1. loads the pinned, hash-checked ADR-117 anchor via `loadAnchorSet` (which
 *      throws on drift — the frozen checklist can't be silently edited),
 *   2. selects the constant-denominator checklist for `checklistId`,
 *   3. evaluates the revision-bound failure-mode reach manifest before any
 *      judge call (missing legacy manifests remain explicitly inconclusive),
 *   4. runs the two-gate, three-valued `computeQualityVerdict` with the injected
 *      frontier judge and combines the independent verdicts fail-closed.
 *
 * The oracle result and the judge are injected — this module owns no LLM and no
 * mutation runner, so it is deterministic and unit-testable with a fake judge.
 */

import path from 'node:path';
import { loadAnchorSet } from './anchor-set.js';
import {
  computeQualityVerdict,
  type Judge,
  type QualityVerdictResult,
  type RequirementChecklist,
} from './quality-verdict.js';
import type { OracleResult } from './oracle-eval.js';
import { findProjectRoot } from '../kernel/unified-memory.js';
import {
  computeVerificationArtifactDigest,
  evaluateVerificationReach,
  type VerificationCoverageVerdict,
  type VerificationReachManifest,
  type VerificationReachResult,
} from './verification-reach.js';

/** Default frozen anchor location, relative to the project root (ADR-117). */
export const DEFAULT_ANCHOR_RELATIVE_PATH = 'verification/anchors/qe-anchor-v1.json';

export interface QualityGateRequest {
  /**
   * Mechanical-gate result from the ADR-113 oracle. `null` ⇒ the oracle did not
   * run at all — treated as a non-executed test ⇒ mechanical fail.
   */
  oracleResult: Pick<OracleResult, 'passed' | 'baselinePassed'> | null;
  /** The artifact under judgement (produced test source / spec output). */
  artifact: string;
  /** Anchor item id whose pinned checklist to grade against (e.g. "A1-inRange"). */
  checklistId: string;
  /** The frontier judge (injected — ALWAYS frontier-tier, ADR-111). */
  judge: Judge;
  /** Override the frozen anchor path (absolute, or relative to project root). */
  anchorPath?: string;
  /** Revision-bound failure-mode reach evidence. Omit only for legacy migration. */
  verificationManifest?: VerificationReachManifest;
}

export interface LegacyUnknownVerificationCoverage {
  kind: 'legacy-unknown';
  coverageVerdict: 'inconclusive';
  reason: string;
}

export interface VerifiedVerificationCoverage extends VerificationReachResult {
  kind: 'verified';
}

export type QualityGateVerificationCoverage =
  | LegacyUnknownVerificationCoverage
  | VerifiedVerificationCoverage;

export interface ReachAwareQualityGateResult extends QualityVerdictResult {
  /** Threshold/oracle/judge verdict before verification-reach preflight. */
  qualityVerdict: QualityVerdictResult['verdict'];
  /** Independent verdict for required failure-mode observation coverage. */
  coverageVerdict: VerificationCoverageVerdict;
  /** Overall fail-closed verdict. A pass requires both independent gates to pass. */
  verdict: QualityVerdictResult['verdict'];
  verification: QualityGateVerificationCoverage;
}

/**
 * Run the two-gate quality gate for one artifact against one pinned checklist.
 * Throws only for caller error (unknown checklist id, unloadable/drifted anchor);
 * every judgement outcome is returned as a three-valued reach-aware result.
 */
export async function runQualityGate(req: QualityGateRequest): Promise<ReachAwareQualityGateResult> {
  const checklist = loadChecklist(req.checklistId, req.anchorPath);
  if (
    req.verificationManifest
    && req.verificationManifest.artifact.digest !== computeVerificationArtifactDigest(req.artifact)
  ) {
    throw new Error('Verification reach manifest artifact digest does not match the judged artifact');
  }
  const verification: QualityGateVerificationCoverage = req.verificationManifest
    ? { kind: 'verified', ...evaluateVerificationReach(req.verificationManifest) }
    : {
        kind: 'legacy-unknown',
        coverageVerdict: 'inconclusive',
        reason: 'legacy quality-gate request has no verification reach manifest',
      };
  const coverageVerdict = verification.coverageVerdict;
  const quality = await computeQualityVerdict({
    oracle: req.oracleResult,
    artifact: req.artifact,
    checklist,
    judge: req.judge,
  });

  return {
    ...quality,
    qualityVerdict: quality.verdict,
    coverageVerdict,
    verdict: combineVerdicts(quality.verdict, coverageVerdict),
    verification,
  };
}

function combineVerdicts(
  quality: QualityVerdictResult['verdict'],
  coverage: VerificationCoverageVerdict,
): QualityVerdictResult['verdict'] {
  if (quality === 'fail' || coverage === 'fail') return 'fail';
  if (quality === 'pass' && coverage === 'pass') return 'pass';
  return 'inconclusive';
}

/**
 * Load the pinned checklist for `checklistId` from the frozen anchor. Exposed so
 * callers (CLI/MCP) can list valid ids or pre-validate before building a judge.
 */
export function loadChecklist(checklistId: string, anchorPath?: string): RequirementChecklist {
  const resolved = resolveAnchorPath(anchorPath);
  const anchor = loadAnchorSet(resolved); // throws on hash drift (ADR-117 §2)
  const item = anchor.items.find((it) => it.id === checklistId);
  if (!item) {
    const available = anchor.items.map((it) => it.id).join(', ');
    throw new Error(
      `Unknown checklist id "${checklistId}" in anchor ${resolved}. Available: ${available}`,
    );
  }
  return { id: item.id, requirements: item.requirements };
}

/** List every checklist id in the frozen anchor (for CLI/MCP discoverability). */
export function listChecklistIds(anchorPath?: string): string[] {
  const anchor = loadAnchorSet(resolveAnchorPath(anchorPath));
  return anchor.items.map((it) => it.id);
}

function resolveAnchorPath(anchorPath?: string): string {
  if (anchorPath && path.isAbsolute(anchorPath)) return anchorPath;
  const root = findProjectRoot();
  return path.resolve(root, anchorPath ?? DEFAULT_ANCHOR_RELATIVE_PATH);
}
