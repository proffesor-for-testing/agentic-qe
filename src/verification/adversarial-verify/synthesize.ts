/**
 * @ruvector/adversarial-verify — deterministic verdict synthesis (pure).
 *
 * The k-of-n majority-kill math (ADR-074): a finding is `refuted` when at least
 * ⌈n/2⌉ of the CAST votes refute it; `uncertain` when no votes were cast (all
 * refuters failed); else `upheld`. No LLM, no I/O — byte-identical across runs.
 */
import type { Finding, FindingVerdict, RefuterVote } from './types.js';

/** Default kill threshold: simple majority of cast votes (2-of-3, 1-of-1, 2-of-2). */
export const majorityKill = (castVotes: number): number => Math.ceil(castVotes / 2);

/**
 * Fold a finding + its refuter votes into a finding-verdict@1 envelope.
 * `votes` must already exclude failed refuters (null/throw → omitted upstream).
 */
export function synthesizeVerdict(
  finding: Finding,
  votes: RefuterVote[],
  killThreshold: (castVotes: number) => number = majorityKill,
): FindingVerdict {
  const refutations = votes.filter((v) => v.refuted).map((v) => v.reasoning);
  const killed = votes.length > 0 && refutations.length >= killThreshold(votes.length);
  return {
    contract: 'finding-verdict@1',
    id: finding.id,
    title: finding.title,
    ...(finding.file !== undefined ? { file: finding.file } : {}),
    severity: finding.severity,
    confidence: finding.confidence,
    evidence: finding.evidence,
    verdict: votes.length === 0 ? 'uncertain' : killed ? 'refuted' : 'upheld',
    refutations,
  };
}

/** Runtime guard: does `x` conform to finding-verdict@1 at the boundary? */
export function isFindingVerdict(x: unknown): x is FindingVerdict {
  if (!x || typeof x !== 'object') return false;
  const v = x as Record<string, unknown>;
  return (
    v.contract === 'finding-verdict@1' &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.confidence === 'number' &&
    Array.isArray(v.evidence) &&
    Array.isArray(v.refutations) &&
    (v.verdict === 'upheld' || v.verdict === 'refuted' || v.verdict === 'uncertain')
  );
}
