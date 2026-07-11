/**
 * Retrieval policy — the hyperparameters the QE-policy flywheel tunes (ADR-118).
 *
 * The flywheel optimizes AQE's hybrid retrieval/selection policy over
 * `qe_patterns` (the ruflo RetrievalConfig shape), one generation at a time,
 * behind the frozen accept() gate. This module defines the policy and the
 * candidate proposal; it does NOT touch the DB or evaluate anything (the scorer
 * is injected in generation.ts).
 */

import { createHash } from 'node:crypto';

/** The tunable hybrid-retrieval hyperparameters. */
export interface RetrievalPolicy {
  /** Dense/sparse blend weight [0,1]. */
  alpha: number;
  /** Weight on subject/title token match. */
  subjectWeight: number;
  /** Weight on body/content token match. */
  bodyWeight: number;
  /** MMR diversity vs relevance tradeoff [0,1]. */
  mmrLambda: number;
  /** Penalty factor for pattern-type mismatch [0,1]. */
  typePenaltyFactor: number;
}

/** ADR-082 defaults — the gen-0 root policy. */
export const DEFAULT_POLICY: RetrievalPolicy = {
  alpha: 0.5,
  subjectWeight: 1.0,
  bodyWeight: 1.0,
  mmrLambda: 0.5,
  typePenaltyFactor: 0.1,
};

const AXES: (keyof RetrievalPolicy)[] = ['alpha', 'subjectWeight', 'bodyWeight', 'mmrLambda', 'typePenaltyFactor'];

/** Clamp helper — keep weights in sane bounds so candidates stay well-formed. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

const BOUNDS: Record<keyof RetrievalPolicy, [number, number]> = {
  alpha: [0, 1],
  subjectWeight: [0, 4],
  bodyWeight: [0, 4],
  mmrLambda: [0, 1],
  typePenaltyFactor: [0, 1],
};

/**
 * Stable id of a policy — canonical (sorted-key, fixed-precision) hash. Two
 * numerically-equal policies get the same id, so lineage links are exact.
 */
export function policyId(p: RetrievalPolicy): string {
  const canon = AXES.map((k) => `${k}:${p[k].toFixed(6)}`).join('|');
  return createHash('sha256').update(canon).digest('hex').slice(0, 16);
}

/**
 * Propose candidate policies around a baseline — a coarse ±step grid, one axis
 * moved at a time (plus a floor of exploration on every axis). Later generations
 * can bias this toward historically-effective axes (ruflo `biasedGrid`), but the
 * gate is what makes any proposal safe, so a simple grid is a fine start.
 */
export function proposeCandidates(baseline: RetrievalPolicy, step = 0.1): RetrievalPolicy[] {
  const out: RetrievalPolicy[] = [];
  for (const axis of AXES) {
    for (const dir of [-1, 1]) {
      const [lo, hi] = BOUNDS[axis];
      const moved = clamp(baseline[axis] + dir * step, lo, hi);
      if (moved === baseline[axis]) continue; // no-op at a bound
      out.push({ ...baseline, [axis]: moved });
    }
  }
  // de-dup by id (a bound can collapse two moves)
  const seen = new Set<string>();
  return out.filter((p) => {
    const id = policyId(p);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
