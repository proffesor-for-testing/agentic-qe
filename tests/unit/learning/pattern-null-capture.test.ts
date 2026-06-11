/**
 * ADR-110 null capture in ExperienceCaptureService (London school — mocked
 * MemoryBackend + recorder; no native deps, runs locally and in CI) and the
 * pure applyNullDiscount ranking helper.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExperienceCaptureService } from '../../../src/learning/experience-capture.js';
import { PatternNullStore, type NullSummary } from '../../../src/learning/pattern-null-store.js';
import type { MemoryBackend } from '../../../src/kernel/interfaces.js';

function mockMemory(): MemoryBackend {
  return {
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
    set: vi.fn(async () => {}),
    get: vi.fn(async () => undefined),
    delete: vi.fn(async () => true),
    has: vi.fn(async () => false),
    search: vi.fn(async () => []),
    vectorSearch: vi.fn(async () => []),
    storeVector: vi.fn(async () => {}),
    count: vi.fn(async () => 0),
  } as unknown as MemoryBackend;
}

describe('ExperienceCaptureService null capture (ADR-110)', () => {
  let service: ExperienceCaptureService;
  let recorder: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new ExperienceCaptureService(mockMemory());
    recorder = vi.fn();
    service.setNullRecorder(recorder);
  });

  it('should_recordNull_when_patternGuidedTaskFails', async () => {
    const id = service.startCapture('apply learned pattern', {
      agent: 'qe-test-architect',
      appliedPatterns: ['pat-1'],
    });
    await service.completeCapture(id, { success: false });
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({ patternId: 'pat-1', evidenceClass: 'EXECUTED' }),
    );
  });

  it('should_recordOneNullPerAppliedPattern_when_multipleGuided', async () => {
    const id = service.startCapture('task', { appliedPatterns: ['pat-1', 'pat-2'] });
    await service.completeCapture(id, { success: false });
    expect(recorder).toHaveBeenCalledTimes(2);
  });

  it('should_notRecordNull_when_taskSucceeds', async () => {
    const id = service.startCapture('task', { appliedPatterns: ['pat-1'] });
    await service.completeCapture(id, { success: true, quality: 0.9 });
    expect(recorder).not.toHaveBeenCalled();
  });

  it('should_notRecordNull_when_failureWasNotPatternGuided', async () => {
    const id = service.startCapture('task without applied patterns');
    await service.completeCapture(id, { success: false });
    expect(recorder).not.toHaveBeenCalled();
  });

  it('should_useNegativeReward_when_rewardSignalPresent', async () => {
    // success=true but testOutcome maps to negative reward → reward wins
    const id = service.startCapture('task', { appliedPatterns: ['pat-1'] });
    await service.completeCapture(id, { success: true, testOutcome: 'false-positive' });
    expect(recorder).toHaveBeenCalledTimes(1);
  });

  it('should_buildContextFingerprintFromDomainAndAgent', async () => {
    const id = service.startCapture('task', {
      agent: 'qe-coverage-specialist',
      domain: 'coverage-analysis' as never,
      appliedPatterns: ['pat-1'],
    });
    await service.completeCapture(id, { success: false });
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({ contextFingerprint: 'coverage-analysis:qe-coverage-specialist' }),
    );
  });

  it('should_surviveRecorderThrow_when_recordingFails', async () => {
    recorder.mockImplementation(() => { throw new Error('db down'); });
    const id = service.startCapture('task', { appliedPatterns: ['pat-1'] });
    await expect(service.completeCapture(id, { success: false })).resolves.not.toThrow();
  });
});

describe('PatternNullStore.applyNullDiscount (pure)', () => {
  const summary: NullSummary = {
    patternId: 'p1',
    totalFailures: 3,
    byContext: { 'coverage:agent-a': 2, 'security:agent-b': 1 },
  };

  it('should_returnScoreUnchanged_when_noSummary', () => {
    expect(PatternNullStore.applyNullDiscount(0.8, undefined, 'ctx')).toBe(0.8);
  });

  it('should_discountHarder_when_nullsMatchCallersContext', () => {
    const matched = PatternNullStore.applyNullDiscount(1.0, summary, 'coverage:agent-a');
    const unmatched = PatternNullStore.applyNullDiscount(1.0, summary, 'totally:elsewhere');
    expect(matched).toBeLessThan(unmatched);
  });

  it('should_neverDiscountBelowFloor_when_manyNulls', () => {
    const heavy: NullSummary = { patternId: 'p1', totalFailures: 100, byContext: { ctx: 100 } };
    expect(PatternNullStore.applyNullDiscount(1.0, heavy, 'ctx')).toBeCloseTo(0.25);
  });

  it('should_applyMildDiscount_when_contextUnknown', () => {
    const result = PatternNullStore.applyNullDiscount(1.0, summary);
    expect(result).toBeCloseTo(1 - 3 * 0.03);
  });
});
