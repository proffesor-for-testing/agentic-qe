/**
 * #1251: the richness comparison behind the #629 guard. `strict` is the manual
 * `aqe brain export`; `checkpoint` is what the Stop-hook checkpoint uses, so
 * routine retention between turns passes and a collapsed table refuses.
 */

import { describe, expect, it } from 'vitest';

import Database from 'better-sqlite3';

import {
  assertNotPoorerThanMirror,
  CHECKPOINT_MIN_LOST_ROWS,
  CODE_INDEX_VECTOR_ID_PREFIX,
  evaluateShrinkAck,
  mirroredTableCounts,
  RvfMirrorGuardError,
  isRichnessPolicy,
} from '../../../../src/integrations/ruvector/brain-rvf-richness.js';
import { ensureAllBrainTables } from '../../../../src/integrations/ruvector/brain-table-ddl.js';

const TABLES = ['qe_patterns', 'captured_experiences', 'routing_outcomes', 'concept_edges'];
const RICH = { qe_patterns: 100, captured_experiences: 50, routing_outcomes: 1000, concept_edges: 400 };

function refusal(fn: () => void): RvfMirrorGuardError | undefined {
  try { fn(); return undefined; } catch (e) { return e as RvfMirrorGuardError; }
}

describe('assertNotPoorerThanMirror strict (manual export, ADR-128)', () => {
  it('should_refuse_when_anyTableLostOneRow', () => {
    const error = refusal(() => assertNotPoorerThanMirror(TABLES, RICH, { ...RICH, routing_outcomes: 999 }));

    expect(error).toBeInstanceOf(RvfMirrorGuardError);
    expect(error?.code).toBe('RVF_MIRROR_RICHER');
    expect(error?.message).toMatch(/^RVF_MIRROR_RICHER: .*routing_outcomes 1000 -> 999/);
  });

  it('should_refuseAsAmbiguous_when_theMirrorLacksATable', () => {
    const { concept_edges: _dropped, ...older } = RICH;

    const error = refusal(() => assertNotPoorerThanMirror(TABLES, older, RICH));

    expect(error?.code).toBe('RVF_MIRROR_INSPECTION_AMBIGUOUS');
    expect(error?.message).toContain('concept_edges');
  });
});

describe('assertNotPoorerThanMirror checkpoint (Stop hook, #1251)', () => {
  it('should_pass_when_retentionTrimsLessThanHalfOfATable', () => {
    expect(() => assertNotPoorerThanMirror(
      TABLES, RICH, { ...RICH, routing_outcomes: 600, concept_edges: 250 }, 'checkpoint',
    )).not.toThrow();
  });

  it('should_refuse_when_aTableLostMoreThanHalf', () => {
    const error = refusal(() => assertNotPoorerThanMirror(TABLES, RICH, { ...RICH, routing_outcomes: 0 }, 'checkpoint'));

    expect(error?.code).toBe('RVF_MIRROR_RICHER');
    expect(error?.message).toContain('routing_outcomes 1000 -> 0');
  });

  it('should_pass_when_routineRetentionTrimsTenPercent', () => {
    const mirror = { ...RICH, routing_outcomes: 500 };

    expect(() => assertNotPoorerThanMirror(TABLES, mirror, { ...mirror, routing_outcomes: 450 }, 'checkpoint')).not.toThrow();
  });

  it('should_pass_when_aSmallTableLosesFewerThanTheMinimumRowsWithoutEmptying', () => {
    const tiny = { ...RICH, routing_outcomes: CHECKPOINT_MIN_LOST_ROWS - 1 };

    expect(() => assertNotPoorerThanMirror(TABLES, tiny, { ...tiny, routing_outcomes: 3 }, 'checkpoint')).not.toThrow();
  });

  it('should_refuse_when_aSmallTableIsEmptied', () => {
    // The other #629 regression: equal patterns, captured experiences 7 -> 0.
    const mirror = { qe_patterns: 25, captured_experiences: 7, routing_outcomes: 3, concept_edges: 0 };

    const error = refusal(() => assertNotPoorerThanMirror(
      TABLES, mirror, { ...mirror, captured_experiences: 0, routing_outcomes: 0 }, 'checkpoint',
    ));

    expect(error?.message).toContain('captured_experiences 7 -> 0, routing_outcomes 3 -> 0');
  });

  it('should_pass_when_aTableOfTwoRowsIsEmptied', () => {
    const mirror = { ...RICH, routing_outcomes: 2 };

    expect(() => assertNotPoorerThanMirror(TABLES, mirror, { ...mirror, routing_outcomes: 0 }, 'checkpoint')).not.toThrow();
  });

  it('should_refuse_when_learnedPatternsLoseMoreThanTenPercent', () => {
    const error = refusal(() => assertNotPoorerThanMirror(TABLES, RICH, { ...RICH, qe_patterns: 75 }, 'checkpoint'));

    expect(error?.message).toContain('qe_patterns 100 -> 75');
  });

  it('should_pass_when_patternDedupRemovesAtMostTenPercent', () => {
    expect(() => assertNotPoorerThanMirror(TABLES, RICH, { ...RICH, qe_patterns: 90 }, 'checkpoint')).not.toThrow();
  });

  it('should_refuse_when_theDatabaseWasRecreatedFromSeed', () => {
    // The #629 regression: 25 patterns in the mirror, 5 in the recreated DB.
    const mirror = { qe_patterns: 25, captured_experiences: 0, routing_outcomes: 0, concept_edges: 0 };

    const error = refusal(() => assertNotPoorerThanMirror(TABLES, mirror, { ...mirror, qe_patterns: 5 }, 'checkpoint'));

    expect(error?.message).toContain('qe_patterns 25 -> 5');
  });

  it('should_countATableTheOlderMirrorLacksAsEmpty', () => {
    const { concept_edges: _dropped, ...older } = RICH;

    expect(() => assertNotPoorerThanMirror(TABLES, older, RICH, 'checkpoint')).not.toThrow();
  });

  it('should_refuseAsAmbiguous_when_theMirrorHasNoTableInventory', () => {
    const error = refusal(() => assertNotPoorerThanMirror(TABLES, undefined, RICH, 'checkpoint'));

    expect(error?.code).toBe('RVF_MIRROR_INSPECTION_AMBIGUOUS');
  });
});

describe('isRichnessPolicy', () => {
  it('should_acceptOnlyTheKnownPolicies', () => {
    expect(['strict', 'checkpoint', 'lax', undefined].map(isRichnessPolicy)).toEqual([true, true, false, false]);
  });
});

describe('evaluateShrinkAck (#1251)', () => {
  const NOW = Date.parse('2026-10-29T12:00:00Z');
  const PRUNED = { ...RICH, routing_outcomes: 100 };
  const ack = (hoursAgo: number, tableCounts: Record<string, number> = PRUNED) => ({
    at: new Date(NOW - hoursAgo * 3600_000).toISOString(), producer: 'prune', tableCounts,
  });

  it('should_honour_when_freshAndTheExportHoldsTheCountsTheShrinkLeft', () => {
    expect(evaluateShrinkAck(ack(1), TABLES, { ...PRUNED, routing_outcomes: 130 }, NOW))
      .toEqual({ honoured: true, producer: 'prune' });
  });

  it('should_ignore_when_olderThan24h', () => {
    expect(evaluateShrinkAck(ack(25), TABLES, PRUNED, NOW))
      .toMatchObject({ honoured: false, reason: expect.stringContaining('older than 24h') });
  });

  it('should_ignore_when_theDatabaseWasRecreatedAfterTheShrink', () => {
    const seed = { qe_patterns: 70, captured_experiences: 0, routing_outcomes: 0, concept_edges: 0 };

    const verdict = evaluateShrinkAck(ack(1), TABLES, seed, NOW);

    expect(verdict).toMatchObject({ honoured: false, reason: expect.stringContaining('qe_patterns 100 -> 70') });
  });

  it('should_ignore_when_malformedOrDatedInTheFuture', () => {
    expect([
      evaluateShrinkAck(null, TABLES, PRUNED, NOW).honoured,
      evaluateShrinkAck({ ...ack(1), producer: 'other' }, TABLES, PRUNED, NOW).honoured,
      evaluateShrinkAck({ ...ack(1), tableCounts: undefined }, TABLES, PRUNED, NOW).honoured,
      evaluateShrinkAck(ack(-1), TABLES, PRUNED, NOW).honoured,
    ]).toEqual([false, false, false, false]);
  });
});

describe('mirroredTableCounts', () => {
  it('should_countEveryMirroredTable_withoutCodeIndexVectors', () => {
    const db = new Database(':memory:');
    try {
      ensureAllBrainTables(db);
      const vector = db.prepare(`INSERT INTO vectors (id, namespace, embedding, dimensions) VALUES (?, 'n', ?, 1)`);
      vector.run('keep-1', Buffer.alloc(4));
      vector.run(`${CODE_INDEX_VECTOR_ID_PREFIX}file.ts`, Buffer.alloc(4));

      const counts = mirroredTableCounts(db);

      expect(counts.vectors).toBe(1);
      expect(counts.qe_patterns).toBe(0);
      expect(Object.keys(counts)).toContain('pattern_segment_lineage');
    } finally {
      db.close();
    }
  });
});
