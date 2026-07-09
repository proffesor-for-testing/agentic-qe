/**
 * Two-gate, three-valued quality verdict (ADR-119).
 *
 * A single, two-valued quality verdict lies in three ways: it can pass tests
 * that never executed, a single LLM judge is noisy (retort measured Haiku
 * swinging 0.33↔1.0 on identical code), and pass/fail can't tell a genuine gap
 * from an inconclusive run. This composes retort's design:
 *
 *   1. Mechanical gate — reuse the ADR-113 oracle. Tests that did not execute
 *      ⇒ `fail`. No judge is consulted until the mechanical gate is satisfied.
 *   2. Spec gate — a FRONTIER-tier judge (never the cheap writer lane, ADR-111)
 *      scores the artifact against the ADR-117 pinned, constant-denominator
 *      checklist; two-attempt second opinion; pass only at coverage 1.0.
 *   3. Judge preflight — refuse to report success if the judge never ran.
 *
 * Verdict ∈ {pass, fail, inconclusive}. `inconclusive` (retort's `None`) keeps
 * an infra hiccup from masquerading as a spec failure — ADR-118's accept()
 * records neither a promotion nor a rejection on `inconclusive`.
 *
 * The judge and checklist are injected so this logic is testable without a live
 * frontier model or the frozen anchor file (which is authored under ADR-117).
 */

import type { OracleResult } from './oracle-eval.js';

export type QualityVerdict = 'pass' | 'fail' | 'inconclusive';

/**
 * A pinned, constant-denominator requirement checklist (ADR-117 anchor).
 * The denominator (requirement count) is authored ONCE per artifact type so
 * coverage scores are comparable across runs — retort's fix for non-comparable
 * per-run extraction.
 */
export interface RequirementChecklist {
  /** Stable id of the pinned checklist (e.g. the ADR-117 anchor id). */
  id: string;
  /** The requirements — the constant denominator. Must be non-empty. */
  requirements: string[];
}

/** One judge attempt's opinion. */
export interface JudgeOpinion {
  /**
   * Whether the judge tooling actually ran and produced a real grade. `false`
   * means usage-limit / timeout / tooling failure — NOT a real opinion, so it
   * can never contribute to a `fail`.
   */
  ran: boolean;
  /** Fraction of checklist requirements satisfied, in [0, 1]. */
  coverage: number;
  /** Requirements judged unmet (for reporting; empty when coverage is 1.0). */
  unmet: string[];
}

/**
 * The frontier judge. ALWAYS top-tier (ADR-111 — the oracle is the one place
 * you never economize). Implementations wrap the frontier model + credentials.
 */
export interface Judge {
  /** ADR-119 §4: verify the judge tooling/credentials before grading. */
  preflight(): Promise<boolean> | boolean;
  /** Grade the artifact against the pinned checklist. */
  grade(artifact: string, checklist: RequirementChecklist): Promise<JudgeOpinion> | JudgeOpinion;
}

export interface QualityVerdictInput {
  /**
   * Mechanical-gate result from the ADR-113 oracle. `null` means the oracle did
   * not run at all — treated as a non-executed test ⇒ mechanical fail.
   */
  oracle: Pick<OracleResult, 'passed' | 'baselinePassed'> | null;
  /** The artifact under judgement (e.g. produced test source / spec output). */
  artifact: string;
  /** The pinned checklist to grade against. */
  checklist: RequirementChecklist;
  /** The frontier judge (injected). */
  judge: Judge;
}

export interface QualityVerdictResult {
  verdict: QualityVerdict;
  /** Mechanical gate outcome (execution). */
  mechanical: 'pass' | 'fail';
  /** Best spec-gate coverage observed across attempts (null if judge never ran). */
  specCoverage: number | null;
  /** Unmet requirements from the best real attempt (empty on pass). */
  unmet: string[];
  /** Number of spec-gate attempts actually made. */
  attempts: number;
  reason: string;
}

/** Coverage at or above this is a spec-gate pass (pinned checklist ⇒ pass only at 1.0). */
const PASS_COVERAGE = 1.0;
/** ADR-119 §3: at most two attempts (second opinion). */
const MAX_ATTEMPTS = 2;

/**
 * Compute the two-gate, three-valued quality verdict.
 *
 * Order is strict: mechanical gate first (a non-executing test is `fail`
 * regardless of judge opinion), then judge preflight, then the two-attempt spec
 * gate. `fail` requires TWO real short opinions; fewer than two real opinions ⇒
 * `inconclusive` (never a silent pass, never a spec-fail from infra).
 */
export async function computeQualityVerdict(
  input: QualityVerdictInput,
): Promise<QualityVerdictResult> {
  if (input.checklist.requirements.length === 0) {
    throw new Error('RequirementChecklist must have a non-empty, constant denominator (ADR-117).');
  }

  // 1. Mechanical gate (ADR-113). Non-execution ⇒ fail, no judge consulted.
  const mechanicalPass = input.oracle != null && input.oracle.baselinePassed && input.oracle.passed;
  if (!mechanicalPass) {
    const why = input.oracle == null
      ? 'oracle did not run'
      : !input.oracle.baselinePassed
        ? 'tests did not execute against the reference implementation'
        : 'mutation score below threshold';
    return {
      verdict: 'fail',
      mechanical: 'fail',
      specCoverage: null,
      unmet: [],
      attempts: 0,
      reason: `mechanical gate failed: ${why}`,
    };
  }

  // 2. Judge preflight (ADR-119 §4). If the judge tooling can't run, the verdict
  // is inconclusive — never a silent pass.
  const ready = await input.judge.preflight();
  if (!ready) {
    return {
      verdict: 'inconclusive',
      mechanical: 'pass',
      specCoverage: null,
      unmet: [],
      attempts: 0,
      reason: 'judge preflight failed: judge tooling did not run — refusing to report success',
    };
  }

  // 3. Two-attempt spec gate (retort protocol). Pass on the first attempt that
  // reaches 1.0; otherwise collect real opinions.
  const realOpinions: JudgeOpinion[] = [];
  let bestCoverage: number | null = null;
  let bestUnmet: string[] = [];
  let attempts = 0;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    attempts++;
    const op = await input.judge.grade(input.artifact, input.checklist);
    if (!op.ran) {
      continue; // not a real opinion — cannot contribute to a fail
    }
    realOpinions.push(op);
    if (bestCoverage == null || op.coverage > bestCoverage) {
      bestCoverage = op.coverage;
      bestUnmet = op.unmet;
    }
    if (op.coverage >= PASS_COVERAGE) {
      return {
        verdict: 'pass',
        mechanical: 'pass',
        specCoverage: op.coverage,
        unmet: [],
        attempts,
        reason: `spec gate passed at coverage ${op.coverage.toFixed(3)} on attempt ${attempts}`,
      };
    }
  }

  // No attempt reached 1.0. Fail ONLY on two real short opinions; otherwise
  // inconclusive (fewer than two real opinions = usage limit / timeout).
  if (realOpinions.length >= 2) {
    return {
      verdict: 'fail',
      mechanical: 'pass',
      specCoverage: bestCoverage,
      unmet: bestUnmet,
      attempts,
      reason: `spec gate failed: ${realOpinions.length} real opinions, best coverage `
        + `${(bestCoverage ?? 0).toFixed(3)} < ${PASS_COVERAGE} (${bestUnmet.length} unmet)`,
    };
  }

  return {
    verdict: 'inconclusive',
    mechanical: 'pass',
    specCoverage: bestCoverage,
    unmet: bestUnmet,
    attempts,
    reason: `spec gate inconclusive: only ${realOpinions.length} real opinion(s) obtainable `
      + `(need 2 to fail) — retry later, record neither pass nor fail`,
  };
}
