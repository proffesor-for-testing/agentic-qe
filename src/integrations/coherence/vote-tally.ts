/**
 * Agentic QE v3 - Consensus vote tally
 *
 * Counts verdicts once so that every consensus flag and every
 * recommendation string is derived from the same numbers (issue #535).
 */

/** Minimal vote shape needed to tally verdicts */
export interface TallyableVote {
  verdict: string | number | boolean;
}

/** Verdict counts for a set of votes */
export interface VoteTally {
  /** Total number of votes */
  total: number;
  /** Verdicts with counts, most votes first (ties ordered by verdict) */
  counts: Array<{ verdict: string; count: number }>;
  /** Verdict with the most votes (first in `counts`) */
  topVerdict: string;
  /** Number of votes for `topVerdict` */
  topCount: number;
  /** topCount / total (0 when there are no votes) */
  majorityRatio: number;
  /** True when every vote has the same verdict */
  isUnanimous: boolean;
}

/**
 * Tally votes by verdict. Verdicts are compared by their string form,
 * matching how consensus has always grouped them.
 */
export function tallyVotes(votes: readonly TallyableVote[]): VoteTally {
  const byVerdict = new Map<string, number>();
  for (const vote of votes) {
    const key = String(vote.verdict);
    byVerdict.set(key, (byVerdict.get(key) ?? 0) + 1);
  }

  const counts = [...byVerdict.entries()]
    .map(([verdict, count]) => ({ verdict, count }))
    .sort((a, b) => b.count - a.count || a.verdict.localeCompare(b.verdict));

  const top = counts[0] ?? { verdict: '', count: 0 };
  const total = votes.length;

  return {
    total,
    counts,
    topVerdict: top.verdict,
    topCount: top.count,
    majorityRatio: total > 0 ? top.count / total : 0,
    isUnanimous: counts.length === 1,
  };
}

/** e.g. "2 of 3 votes 'pass'" */
export function describeLeader(tally: VoteTally): string {
  return `${tally.topCount} of ${tally.total} votes '${tally.topVerdict}'`;
}

/** e.g. "2 'pass' / 1 'fail'" */
export function describeBreakdown(tally: VoteTally): string {
  return tally.counts.map(({ verdict, count }) => `${count} '${verdict}'`).join(' / ');
}
