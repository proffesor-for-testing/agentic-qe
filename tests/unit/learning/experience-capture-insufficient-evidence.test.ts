/**
 * #1002: a tool result with status "insufficient-evidence" carries no verdict.
 * The capture middleware must not persist it as a success (or failure)
 * experience, nor promote it into sona_patterns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prepared: string[] = [];
vi.mock('../../../src/kernel/unified-memory.js', () => {
  const mockDb = {
    exec: vi.fn(),
    prepare: vi.fn((sql: string) => {
      prepared.push(sql);
      return { run: vi.fn(), get: vi.fn(() => ({ count: 0, avg: 0 })), all: vi.fn(() => []) };
    }),
    pragma: vi.fn(),
  };
  return {
    getUnifiedMemory: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      getDatabase: vi.fn(() => mockDb),
    })),
  };
});

import {
  getCaptureStats,
  initializeExperienceCapture,
  isInsufficientEvidenceResult,
  stopCleanupTimer,
  wrapWithExperienceCapture,
} from '../../../src/learning/experience-capture-middleware.js';

const inserts = () => prepared.filter((sql) => /INSERT[\s\S]*INTO\s+(captured_experiences|sona_patterns)/i.test(sql));

describe('experience capture skips insufficient-evidence results (#1002)', () => {
  beforeEach(async () => {
    await initializeExperienceCapture();
    prepared.length = 0;
  });
  afterEach(() => stopCleanupTimer());

  it.each([
    [{ status: 'insufficient-evidence' }],
    [{ evidenceStatus: 'insufficient-evidence' }],
  ])('recognises %o as insufficient evidence', (data) => {
    expect(isInsufficientEvidenceResult({ success: true, data })).toBe(true);
  });

  it('does not treat a measured result as insufficient', () => {
    expect(isInsufficientEvidenceResult({ success: true, data: { status: 'completed', evidenceStatus: 'measured' } }))
      .toBe(false);
  });

  it('records no experience or pattern for an insufficient-evidence run', async () => {
    const handler = vi.fn(async () => ({
      success: true,
      data: { status: 'insufficient-evidence', passed: false, unmeasured: ['complexity'] },
    }));
    const wrapped = wrapWithExperienceCapture(handler, 'quality-assessment', 'qe-quality-gate');

    const result = await wrapped({});

    expect(result.success).toBe(true);
    expect(inserts()).toEqual([]);
    expect((await getCaptureStats()).activeExperiences).toBe(0);
  });

  // #1014: a coverage estimate or unmeasured target is not a measurement either.
  it.each([
    ['a static estimate', { measured: false, estimated: true, lineCoverage: 10 }],
    ['an unmeasured target', { measured: false, unmeasured: true }],
    ['a result without provenance', { lineCoverage: 80 }],
  ])('records no coverage-analysis experience for %s', async (_label, data) => {
    const handler = vi.fn(async () => ({ success: true, data }));
    const wrapped = wrapWithExperienceCapture(handler, 'coverage-analysis', 'qe-coverage-specialist');

    await wrapped({});

    expect(inserts()).toEqual([]);
    expect((await getCaptureStats()).activeExperiences).toBe(0);
  });

  it('still records measured coverage', async () => {
    const handler = vi.fn(async () => ({ success: true, data: { measured: true, lineCoverage: 82 } }));
    const wrapped = wrapWithExperienceCapture(handler, 'coverage-analysis', 'qe-coverage-specialist');

    await wrapped({});

    expect(inserts().length).toBeGreaterThan(0);
  });

  it('records no failure experience for a caller-input error (#1021 round 2b)', async () => {
    const handler = vi.fn(async () => ({
      success: false, error: 'target "../" is outside the project root (/p).', data: { callerError: true },
    }));
    const wrapped = wrapWithExperienceCapture(handler, 'quality-assessment', 'qe-quality-gate');

    const result = await wrapped({});

    expect(result.success).toBe(false);
    expect(inserts()).toEqual([]);
    expect((await getCaptureStats()).activeExperiences).toBe(0);
  });

  it('still records a genuine handler failure', async () => {
    const handler = vi.fn(async () => ({ success: false, error: 'analyzer crashed' }));
    const wrapped = wrapWithExperienceCapture(handler, 'quality-assessment', 'qe-quality-gate');

    await wrapped({});

    expect(inserts().length).toBeGreaterThan(0);
  });

  it('still records a measured run', async () => {
    const handler = vi.fn(async () => ({ success: true, data: { status: 'completed', evidenceStatus: 'measured' } }));
    const wrapped = wrapWithExperienceCapture(handler, 'quality-assessment', 'qe-quality-gate');

    await wrapped({});

    expect(inserts().length).toBeGreaterThan(0);
  });
});
