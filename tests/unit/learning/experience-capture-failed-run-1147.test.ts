/**
 * #1147 item 1: a measured outcome skipped the quality and reward gates and
 * created a new qe_pattern even when the run failed. A failed run now only
 * updates the usage of an existing matching pattern; only a run that passes
 * the gates creates one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createExperienceCaptureService,
  type ExperienceCaptureService,
} from '../../../src/learning/experience-capture.js';
import type { PatternStore } from '../../../src/learning/pattern-store.js';
import type { MemoryBackend } from '../../../src/kernel/interfaces.js';
import { ok } from '../../../src/shared/types/index.js';

function createMemory(): MemoryBackend {
  const storage = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => storage.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { storage.set(key, value); }),
    delete: vi.fn(async (key: string) => { storage.delete(key); }),
    has: vi.fn(async (key: string) => storage.has(key)),
    search: vi.fn(async (pattern: string) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return [...storage.keys()].filter((k) => regex.test(k));
    }),
  } as unknown as MemoryBackend;
}

function createPatternStore(): PatternStore {
  return {
    create: vi.fn().mockResolvedValue(ok({ id: 'new-pattern', patternType: 'test-template', name: 'New' })),
    get: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue(ok([])),
    recordUsage: vi.fn().mockResolvedValue(ok(undefined)),
    promote: vi.fn().mockResolvedValue(ok(undefined)),
  } as unknown as PatternStore;
}

const MEASURED = { outcome: 'measured', outcomeBasis: 'test-results' };

describe('#1147 a measured failure never creates a pattern', () => {
  let patternStore: PatternStore;
  let service: ExperienceCaptureService;

  beforeEach(async () => {
    patternStore = createPatternStore();
    service = createExperienceCaptureService(createMemory(), patternStore);
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  function existingPatternFor(task: string): void {
    vi.mocked(patternStore.search).mockResolvedValue(ok([{
      pattern: {
        id: 'existing-pattern', usageCount: 1, patternType: 'test-template', tier: 'short-term',
        context: { experienceOrigin: { task, domain: null, patternType: 'test-template' } },
      },
      similarity: 0, score: 1,
    }]) as never);
  }

  it('records nothing for a measured failure with no matching pattern', async () => {
    const id = service.startCapture('execute-tests: {"testFiles":["a.test.ts"]}');

    const result = await service.completeCapture(id, { success: false, quality: 0.3, outcomeBasis: 'test-results' });

    expect(patternStore.create).not.toHaveBeenCalled();
    expect(patternStore.recordUsage).not.toHaveBeenCalled();
    expect(result.success && result.value.patterns).toBeUndefined();
  });

  it('records a measured failure as a failed use of the existing matching pattern', async () => {
    const task = 'execute-tests: {"testFiles":["a.test.ts"]}';
    existingPatternFor(task);
    const id = service.startCapture(task);

    const result = await service.completeCapture(id, { success: false, quality: 0.3, outcomeBasis: 'test-results' });

    expect(patternStore.create).not.toHaveBeenCalled();
    expect(patternStore.recordUsage).toHaveBeenCalledWith('existing-pattern', false, MEASURED);
    expect(patternStore.promote).not.toHaveBeenCalled();
    expect(result.success && result.value.patterns).toEqual(['existing-pattern']);
  });

  it('does not create a pattern for a measured success below the quality gate', async () => {
    const id = service.startCapture('execute-tests: {"testFiles":["b.test.ts"]}');

    await service.completeCapture(id, { success: true, quality: 0.2, outcomeBasis: 'test-results' });

    expect(patternStore.create).not.toHaveBeenCalled();
    expect(patternStore.recordUsage).not.toHaveBeenCalled();
  });

  it('still creates a pattern for a measured success that passes the gates', async () => {
    const id = service.startCapture('execute-tests: {"testFiles":["c.test.ts"]}');

    const result = await service.completeCapture(id, { success: true, quality: 0.7, outcomeBasis: 'test-results' });

    expect(patternStore.create).toHaveBeenCalledTimes(1);
    expect(patternStore.recordUsage).toHaveBeenCalledWith('new-pattern', true, MEASURED);
    expect(result.success && result.value.patterns).toEqual(['new-pattern']);
  });

  it('does not create a pattern from a failed run whose test outcome has a negative reward', async () => {
    const id = service.startCapture('execute-tests: {"testFiles":["d.test.ts"]}');

    await service.completeCapture(id, {
      success: true, quality: 0.9, outcomeBasis: 'test-results', testOutcome: 'flaky',
    });

    expect(patternStore.create).not.toHaveBeenCalled();
  });
});
