/**
 * @ruvector/adversarial-verify — the orchestrator.
 *
 * For each finding, run N BLIND refuters in parallel (each gets only the bare
 * claim + evidence + a distinct lens), then deterministically synthesize the
 * finding-verdict@1. The LLM is injected (`Judge`) — no host dependency.
 */
import type { AdversarialVerifyOptions, Finding, FindingVerdict, RefuterVote } from './types.js';
import { DEFAULT_LENSES, refuterPrompt } from './prompts.js';
import { majorityKill, synthesizeVerdict } from './synthesize.js';

/** Call one refuter; a thrown/`null` result is a failed vote (excluded). */
async function castVote(judge: AdversarialVerifyOptions['judge'], finding: Finding, lens: string): Promise<RefuterVote | null> {
  try {
    const v = await judge(refuterPrompt(finding, lens));
    return v && typeof v.refuted === 'boolean' ? { refuted: v.refuted, reasoning: String(v.reasoning ?? '') } : null;
  } catch {
    return null;
  }
}

/**
 * Adversarially verify findings: N blind refuters per finding → majority-kill →
 * finding-verdict@1 envelopes (one per finding, in input order).
 */
export async function adversarialVerify(
  findings: Finding[],
  opts: AdversarialVerifyOptions,
): Promise<FindingVerdict[]> {
  const lenses = opts.lenses ?? DEFAULT_LENSES;
  const refuters = Math.max(1, Math.min(opts.refuters ?? 3, lenses.length));
  const threshold = opts.killThreshold ?? majorityKill;

  return Promise.all(
    findings.map(async (finding) => {
      const votes = (
        await Promise.all(lenses.slice(0, refuters).map((lens) => castVote(opts.judge, finding, lens)))
      ).filter((v): v is RefuterVote => v != null);
      return synthesizeVerdict(finding, votes, threshold);
    }),
  );
}

/** Convenience: split verdicts into confirmed (upheld) / killed (refuted) / uncertain. */
export function partitionVerdicts(verdicts: FindingVerdict[]): {
  confirmed: FindingVerdict[];
  killed: FindingVerdict[];
  uncertain: FindingVerdict[];
} {
  return {
    confirmed: verdicts.filter((v) => v.verdict === 'upheld'),
    killed: verdicts.filter((v) => v.verdict === 'refuted'),
    uncertain: verdicts.filter((v) => v.verdict === 'uncertain'),
  };
}
