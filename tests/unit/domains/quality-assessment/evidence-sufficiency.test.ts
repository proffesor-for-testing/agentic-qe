/**
 * #996: static quality analysis must never approve on unmeasured metrics.
 * The -1 sentinel (and any missing/non-finite value) means "not measured".
 */
import { describe, expect, it } from 'vitest';
import {
  assessEvidenceSufficiency,
  describeMeasuredFailure,
  findMeasuredFailures,
  isMeasuredMetricValue,
  validateRequestedMetrics,
} from '../../../../src/domains/quality-assessment/evidence-sufficiency.js';

describe('isMeasuredMetricValue', () => {
  it.each([0, 1, 80.5, 100])('treats %s as measured', (value) => {
    expect(isMeasuredMetricValue(value)).toBe(true);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, undefined, null, '80'])(
    'treats %s as unmeasured', (value) => {
      expect(isMeasuredMetricValue(value)).toBe(false);
    },
  );
});

describe('assessEvidenceSufficiency', () => {
  it('reports coverage -1 as unmeasured and lowers confidence', () => {
    const result = assessEvidenceSufficiency(
      ['coverage', 'complexity', 'maintainability'],
      { coverage: -1, complexity: 1, maintainability: 80 },
    );

    expect(result).toEqual({
      evidenceStatus: 'insufficient-evidence',
      measured: ['complexity', 'maintainability'],
      unmeasured: ['coverage'],
      confidence: 0.67,
    });
  });

  it('is measured with full confidence when every requested metric is present', () => {
    const result = assessEvidenceSufficiency(
      ['coverage', 'complexity', 'maintainability'],
      { coverage: 85, complexity: 3, maintainability: 70 },
    );

    expect(result).toEqual({
      evidenceStatus: 'measured',
      measured: ['coverage', 'complexity', 'maintainability'],
      unmeasured: [],
      confidence: 1,
    });
  });

  it('only judges requested metrics, ignoring unrequested sentinels', () => {
    const result = assessEvidenceSufficiency(
      ['complexity', 'maintainability'],
      { coverage: -1, security: -1, complexity: 2, maintainability: 75 },
    );

    expect(result.evidenceStatus).toBe('measured');
    expect(result.unmeasured).toEqual([]);
  });

  it('lists every missing metric when several are partial or absent', () => {
    const result = assessEvidenceSufficiency(
      ['coverage', 'complexity', 'maintainability', 'security'],
      { complexity: 2 },
    );

    expect(result.evidenceStatus).toBe('insufficient-evidence');
    expect(result.unmeasured).toEqual(['coverage', 'maintainability', 'security']);
    expect(result.confidence).toBe(0.25);
  });

  it('de-duplicates requested metric names', () => {
    const result = assessEvidenceSufficiency(['coverage', 'coverage'], {});

    expect(result.unmeasured).toEqual(['coverage']);
    expect(result.confidence).toBe(0);
  });

  it('is insufficient when nothing was requested and nothing was measured', () => {
    const result = assessEvidenceSufficiency([], { coverage: -1 });

    expect(result.evidenceStatus).toBe('insufficient-evidence');
    expect(result.confidence).toBe(0);
  });

  it('falls back to the measured values when no metrics were requested', () => {
    const result = assessEvidenceSufficiency([], { complexity: 2, coverage: -1 });

    expect(result.evidenceStatus).toBe('measured');
    expect(result.measured).toEqual(['complexity']);
  });
});

describe('validateRequestedMetrics (#996 N3)', () => {
  it('accepts and de-duplicates known metric names', () => {
    expect(validateRequestedMetrics(['coverage', 'complexity', 'coverage'])).toEqual(['coverage', 'complexity']);
  });

  it.each([
    ['a bare string', 'coverage'],
    ['an empty array', []],
    ['a non-string entry', ['coverage', 3]],
    ['an unknown name', ['coverage', 'vibes']],
    ['null', null],
  ])('rejects %s instead of spreading it into characters', (_label, metrics) => {
    expect(() => validateRequestedMetrics(metrics)).toThrow(/metrics must be a non-empty array of metric names/);
  });

  it('names the unknown entries', () => {
    expect(() => validateRequestedMetrics(['vibes'])).toThrow(/Unknown: "vibes"/);
  });
});

describe('findMeasuredFailures (#996 N2)', () => {
  it('reports measured coverage below the canonical 80% floor', () => {
    expect(findMeasuredFailures(['coverage', 'complexity'], { coverage: 0, complexity: 2 })).toEqual([
      { metric: 'coverage', value: 0, threshold: 80, direction: 'min' },
    ]);
  });

  it('reports measured duplication above the canonical 5% ceiling', () => {
    expect(findMeasuredFailures(['duplication'], { duplication: 9 })[0]).toMatchObject({
      metric: 'duplication', direction: 'max', threshold: 5,
    });
  });

  it('ignores unmeasured metrics and metrics without their own limit', () => {
    expect(findMeasuredFailures(['coverage', 'maintainability'], { coverage: -1, maintainability: 10 })).toEqual([]);
  });

  it('describes a failure in plain words', () => {
    expect(describeMeasuredFailure({ metric: 'coverage', value: 0, threshold: 80, direction: 'min' }))
      .toBe('coverage measured at 0 fails its threshold (at least 80).');
  });
});
