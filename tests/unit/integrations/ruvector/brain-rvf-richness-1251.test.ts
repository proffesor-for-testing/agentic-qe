/**
 * #1251: the richness comparison behind the #629 guard. `strict` is the manual
 * `aqe brain export`; `checkpoint` is what the Stop-hook checkpoint uses, so
 * routine retention between turns passes and a collapsed table refuses.
 */

import { describe, expect, it } from 'vitest';

import {
  assertNotPoorerThanMirror,
  CHECKPOINT_MIN_LOST_ROWS,
  RvfMirrorGuardError,
  isRichnessPolicy,
} from '../../../../src/integrations/ruvector/brain-rvf-richness.js';

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

  it('should_pass_when_theLossIsUnderTheMinimumRowCount', () => {
    const tiny = { ...RICH, routing_outcomes: CHECKPOINT_MIN_LOST_ROWS - 1 };

    expect(() => assertNotPoorerThanMirror(TABLES, tiny, { ...tiny, routing_outcomes: 0 }, 'checkpoint')).not.toThrow();
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
