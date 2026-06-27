/**
 * ADR-112 — C4 confidence gate unit tests.
 *
 * Deterministic gate that turns the detector's known limits into a surfaced
 * signal. Covers the boundary conditions that flip the level.
 */

import { describe, it, expect } from 'vitest';
import {
  assessC4Confidence,
  C4_LOC_DEGRADE_THRESHOLD,
} from '../../../src/shared/c4-model/confidence';

describe('assessC4Confidence', () => {
  it('should_return_low_with_a_verify_reason_when_no_components_detected', () => {
    const a = assessC4Confidence({ componentsDetected: 0, relationshipsDetected: 0, externalSystemsDetected: 0, filesAnalyzed: 0 });
    expect(a.level).toBe('low');
    expect(a.score).toBe(0);
    expect(a.reasons.join(' ')).toMatch(/empty|verify/i);
  });

  it('should_be_deterministic_for_identical_inputs', () => {
    const inputs = { componentsDetected: 6, relationshipsDetected: 5, externalSystemsDetected: 2, filesAnalyzed: 40 };
    expect(assessC4Confidence(inputs)).toEqual(assessC4Confidence(inputs));
  });

  it('should_rate_high_when_components_relationships_and_external_systems_are_rich', () => {
    const a = assessC4Confidence({ componentsDetected: 8, relationshipsDetected: 8, externalSystemsDetected: 2, filesAnalyzed: 60 });
    expect(a.level).toBe('high');
    expect(a.score).toBeGreaterThanOrEqual(0.7);
  });

  it('should_penalize_missing_relationships_as_unverified_structure', () => {
    const withRels = assessC4Confidence({ componentsDetected: 6, relationshipsDetected: 6, externalSystemsDetected: 0, filesAnalyzed: 30 });
    const noRels = assessC4Confidence({ componentsDetected: 6, relationshipsDetected: 0, externalSystemsDetected: 0, filesAnalyzed: 30 });
    expect(noRels.score).toBeLessThan(withRels.score);
    expect(noRels.reasons.join(' ')).toMatch(/no relationships/i);
  });

  it('should_downgrade_large_repos_past_the_LOC_degrade_threshold', () => {
    const small = assessC4Confidence({ componentsDetected: 8, relationshipsDetected: 8, externalSystemsDetected: 2, filesAnalyzed: 60, totalLoc: 5_000 });
    const large = assessC4Confidence({ componentsDetected: 8, relationshipsDetected: 8, externalSystemsDetected: 2, filesAnalyzed: 60, totalLoc: C4_LOC_DEGRADE_THRESHOLD + 1 });
    expect(large.score).toBeLessThan(small.score);
    expect(large.reasons.join(' ')).toMatch(/large|draft/i);
  });

  it('should_always_append_a_draft_warning_when_not_high', () => {
    const a = assessC4Confidence({ componentsDetected: 2, relationshipsDetected: 0, externalSystemsDetected: 0, filesAnalyzed: 4 });
    expect(a.level).not.toBe('high');
    expect(a.reasons.join(' ')).toMatch(/draft|verify/i);
  });
});
