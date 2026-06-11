/**
 * ADR-109 aggregation/statistics tests — each test targets one of the three
 * Pattern Space harness failure modes the lib exists to prevent.
 */
import { describe, it, expect } from 'vitest';
import {
  isGoodRow,
  counterbalance,
  exactSignTest,
  aggregate,
  type ResultRow,
} from '../../../benchmarks/interaction/lib/stats.js';

function row(over: Partial<ResultRow>): ResultRow {
  return {
    scenarioId: 's1',
    itemId: 'item-1:A',
    rubricHash: 'abc123',
    winnerArm: 'A',
    transcript: 'clean transcript',
    turnsCompleted: 4,
    turnsExpected: 4,
    ...over,
  };
}

describe('isGoodRow (fix 1: cleanliness enforced in code)', () => {
  it('should_accept_when_rowCleanAndComplete', () => {
    expect(isGoodRow(row({}))).toBe(true);
  });

  it('should_reject_when_transcriptContainsHarnessError', () => {
    expect(isGoodRow(row({ transcript: 'turn 2 __ERROR__ rate limit' }))).toBe(false);
  });

  it('should_reject_when_interactorWentMute', () => {
    // The "(no reply)" masking bug from the reviewed harness.
    expect(isGoodRow(row({ transcript: 'Developer: (no reply)' }))).toBe(false);
  });

  it('should_reject_when_turnsIncomplete', () => {
    expect(isGoodRow(row({ turnsCompleted: 3 }))).toBe(false);
  });

  it('should_reject_when_judgingIncomplete', () => {
    expect(isGoodRow(row({ winnerArm: null }))).toBe(false);
  });
});

describe('counterbalance (fix 2: seeded, deterministic)', () => {
  it('should_returnSameAssignment_when_calledTwiceWithSameId', () => {
    expect(counterbalance('item-42')).toEqual(counterbalance('item-42'));
  });

  it('should_balanceCloseToHalf_when_manyIds', () => {
    const xa = Array.from({ length: 1000 }, (_, i) => counterbalance(`item-${i}`))
      .filter(c => c.x === 'A').length;
    // Deterministic hash, not RNG — bound is generous but catches gross skew
    // (the reviewed harness had a 72%-skewed cell).
    expect(xa).toBeGreaterThan(400);
    expect(xa).toBeLessThan(600);
  });
});

describe('exactSignTest', () => {
  it('should_returnOne_when_noDecisiveScenarios', () => {
    expect(exactSignTest(0, 0)).toBe(1);
  });

  it('should_matchKnownValue_when_27of38', () => {
    // The Pattern Space clustered re-analysis: 27 wins / 11 losses → p ≈ 0.014
    expect(exactSignTest(27, 11)).toBeCloseTo(0.0136, 3);
  });

  it('should_beInsignificant_when_nearEvenSplit', () => {
    expect(exactSignTest(5, 4)).toBeGreaterThan(0.5);
  });
});

describe('aggregate (fix 3: scenario-clustered, no pooled-only path)', () => {
  it('should_excludeDirtyRows_when_aggregating', () => {
    const rows = [
      row({}),
      row({ itemId: 'item-2:A', transcript: '__ERROR__ timeout', winnerArm: 'B' }),
    ];
    const result = aggregate(rows);
    expect({ pooledRows: result.pooled.rows, excluded: result.excludedRows })
      .toEqual({ pooledRows: 1, excluded: 1 });
  });

  it('should_clusterByScenario_when_rowCountsAreLopsided', () => {
    // Scenario s1: 3 rows for A; scenario s2: 1 row for B.
    // Pooled says 3-1 A; clustered says 1-1 — the honest read.
    const rows = [
      row({ itemId: 'i1:A' }),
      row({ itemId: 'i2:A' }),
      row({ itemId: 'i3:A' }),
      row({ scenarioId: 's2', itemId: 'i4:B', winnerArm: 'B' }),
    ];
    const result = aggregate(rows);
    expect({ a: result.scenarioWinsA, b: result.scenarioWinsB })
      .toEqual({ a: 1, b: 1 });
  });

  it('should_countScenarioTie_when_armsSplitEvenly', () => {
    const rows = [
      row({ itemId: 'i1:A', winnerArm: 'A' }),
      row({ itemId: 'i2:B', winnerArm: 'B' }),
    ];
    expect(aggregate(rows).scenarioTies).toBe(1);
  });

  it('should_reportPooledAlongsideClustered_neverInsteadOf', () => {
    const result = aggregate([row({})]);
    expect(result.pooled).toBeDefined();
    expect(result.pValue).toBeDefined();
  });
});
