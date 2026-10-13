/**
 * Issue #1014.2 — gaps derived from a STATIC ESTIMATE are hypotheses: they are
 * returned to the caller but never stored as `gap-pattern:*` HNSW vectors, and
 * `CoverageGapDetected` carries provenance so consumers can refuse the rest.
 */
import { describe, it, expect, vi } from 'vitest';
import { createGapDetectorService } from '../../../../src/domains/coverage-analysis/services/gap-detector';
import type { CoverageData } from '../../../../src/domains/coverage-analysis/interfaces';
import { isMeasuredGapPayload } from '../../../../src/shared/events/domain-events';

function memory() {
  return {
    get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(), storeVector: vi.fn().mockResolvedValue(undefined),
    vectorSearch: vi.fn().mockResolvedValue([]), list: vi.fn().mockResolvedValue([]), search: vi.fn().mockResolvedValue([]),
  };
}

function data(instrumented?: boolean): CoverageData {
  const uncoveredLines = Array.from({ length: 40 }, (_, i) => i + 10);
  return {
    files: [{
      path: 'src/auth/payment-core.ts',
      lines: { covered: 10, total: 100 }, branches: { covered: 1, total: 10 },
      functions: { covered: 1, total: 10 }, statements: { covered: 10, total: 100 },
      uncoveredLines, uncoveredBranches: [12, 14],
    }],
    summary: { line: 10, branch: 10, function: 10, statement: 10, files: 1 },
    ...(instrumented === undefined ? {} : { instrumented }),
  } as CoverageData;
}

const gapVectors = (m: ReturnType<typeof memory>) =>
  m.storeVector.mock.calls.filter(([key]) => String(key).startsWith('gap-pattern:'));

describe('#1014.2 — gap-pattern learning only from measured coverage', () => {
  it.each([
    ['an estimate (measured:false)', { measured: false }, data()],
    ['data without provenance (fail-closed)', {}, data()],
    ['data marked instrumented:false', {}, data(false)],
  ])('%s: gaps are returned but no gap-pattern vector is stored', async (_label, extra, coverageData) => {
    const m = memory();
    const result = await createGapDetectorService(m as never).detectGaps({ coverageData, minCoverage: 80, ...extra });

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.gaps.length).toBeGreaterThan(0);
    expect(gapVectors(m)).toEqual([]);
  });

  it.each([
    ['measured:true', { measured: true }, data()],
    ['instrumented data', {}, data(true)],
  ])('%s: gap patterns are stored', async (_label, extra, coverageData) => {
    const m = memory();
    await createGapDetectorService(m as never).detectGaps({ coverageData, minCoverage: 80, ...extra });
    expect(gapVectors(m).length).toBeGreaterThan(0);
  });
});

describe('#1014.2 — CoverageGapDetected provenance', () => {
  it.each([
    [{ gapId: 'g', file: 'f', uncoveredLines: [], uncoveredBranches: [], riskScore: 0.9, measured: true }, true],
    [{ gapId: 'g', file: 'f', uncoveredLines: [], uncoveredBranches: [], riskScore: 0.9, measured: false }, false],
    [{ gapId: 'g', file: 'f', uncoveredLines: [], uncoveredBranches: [], riskScore: 0.9 }, false],
    [undefined, false],
  ])('isMeasuredGapPayload(%j) → %s', (payload, expected) => {
    expect(isMeasuredGapPayload(payload)).toBe(expected);
  });
});
