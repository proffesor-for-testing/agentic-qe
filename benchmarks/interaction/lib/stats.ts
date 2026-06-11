/**
 * ADR-109 interaction benchmark — deterministic aggregation & statistics.
 *
 * Encodes the three fixes for the failure modes found in the Pattern Space
 * harness review (issue #522):
 *  1. Aggregation enforces row cleanliness IN CODE (their `_agg` trusted a
 *     scrub it couldn't guarantee).
 *  2. X/Y counterbalance is seeded per item id (their one null cell was 72%
 *     position-skewed from unseeded shuffling).
 *  3. The reported statistic is scenario-clustered (their pooled n=317
 *     treated correlated rows as independent).
 */

export interface ResultRow {
  scenarioId: string;
  itemId: string;
  rubricHash: string;
  /** 'A' | 'B' | 'tie' | null — null means judging incomplete */
  winnerArm: 'A' | 'B' | 'tie' | null;
  /** Ground truth: did the interactor's post-conversation fix pass the hidden test? */
  fixPassesHiddenTest?: boolean;
  /** Raw transcript; rows containing harness errors are excluded by isGoodRow */
  transcript: string;
  turnsCompleted: number;
  turnsExpected: number;
}

/** Row cleanliness — enforced by aggregate(), not by manual scrubbing. */
export function isGoodRow(row: ResultRow): boolean {
  return (
    !row.transcript.includes('__ERROR__') &&
    !row.transcript.includes('(no reply)') &&
    row.turnsCompleted === row.turnsExpected &&
    row.winnerArm !== null
  );
}

/** Deterministic X/Y assignment from the item id — same item, same blinding, every run. */
export function counterbalance(itemId: string): { x: 'A' | 'B'; y: 'A' | 'B' } {
  let hash = 0;
  for (let i = 0; i < itemId.length; i++) {
    hash = (hash * 31 + itemId.charCodeAt(i)) | 0;
  }
  return (hash & 1) === 0 ? { x: 'A', y: 'B' } : { x: 'B', y: 'A' };
}

function binomialCoefficient(n: number, k: number): number {
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return result;
}

/** Exact two-sided binomial sign test against p=0.5; ties excluded by caller. */
export function exactSignTest(wins: number, losses: number): number {
  const n = wins + losses;
  if (n === 0) return 1;
  const k = Math.min(wins, losses);
  let tail = 0;
  for (let i = 0; i <= k; i++) {
    tail += binomialCoefficient(n, i) * Math.pow(0.5, n);
  }
  return Math.min(1, 2 * tail);
}

export interface ClusteredResult {
  scenarioCount: number;
  scenarioWinsA: number;
  scenarioWinsB: number;
  scenarioTies: number;
  pValue: number;
  /** Pooled counts — reportable ONLY alongside the clustered result (rubric rule) */
  pooled: { rows: number; winsA: number; winsB: number; ties: number };
  excludedRows: number;
  groundTruth: { aFixRate: number | null; bFixRate: number | null };
}

/**
 * Scenario-clustered aggregation: majority winner per scenario, exact sign
 * test over scenarios. Dirty rows are excluded HERE — there is no code path
 * to a number that skips isGoodRow.
 */
export function aggregate(rows: ResultRow[]): ClusteredResult {
  const good = rows.filter(isGoodRow);
  const excludedRows = rows.length - good.length;

  const byScenario = new Map<string, ResultRow[]>();
  for (const row of good) {
    const list = byScenario.get(row.scenarioId) ?? [];
    list.push(row);
    byScenario.set(row.scenarioId, list);
  }

  let scenarioWinsA = 0;
  let scenarioWinsB = 0;
  let scenarioTies = 0;
  for (const scenarioRows of byScenario.values()) {
    const a = scenarioRows.filter(r => r.winnerArm === 'A').length;
    const b = scenarioRows.filter(r => r.winnerArm === 'B').length;
    if (a > b) scenarioWinsA++;
    else if (b > a) scenarioWinsB++;
    else scenarioTies++;
  }

  const fixRate = (arm: 'A' | 'B'): number | null => {
    const armRows = good.filter(r => r.winnerArm !== null && r.fixPassesHiddenTest !== undefined);
    // Ground truth is per-conversation, not per-winner: rate over rows where this arm ran.
    const relevant = armRows.filter(r => r.itemId.endsWith(`:${arm}`));
    if (relevant.length === 0) return null;
    return relevant.filter(r => r.fixPassesHiddenTest).length / relevant.length;
  };

  return {
    scenarioCount: byScenario.size,
    scenarioWinsA,
    scenarioWinsB,
    scenarioTies,
    pValue: exactSignTest(scenarioWinsA, scenarioWinsB),
    pooled: {
      rows: good.length,
      winsA: good.filter(r => r.winnerArm === 'A').length,
      winsB: good.filter(r => r.winnerArm === 'B').length,
      ties: good.filter(r => r.winnerArm === 'tie').length,
    },
    excludedRows,
    groundTruth: { aFixRate: fixRate('A'), bFixRate: fixRate('B') },
  };
}
