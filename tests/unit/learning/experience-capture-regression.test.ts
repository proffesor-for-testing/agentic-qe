/**
 * Regression tests for ExperienceCaptureService — witness chain & witnessHash
 *
 * Validates the setWitnessChain() method and witnessHash field
 * added in the march-fixes-and-improvements branch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ExperienceCaptureService,
  createExperienceCaptureService,
} from '../../../src/learning/experience-capture.js';
import type { PatternStore } from '../../../src/learning/pattern-store.js';
import type { MemoryBackend, EventBus } from '../../../src/kernel/interfaces.js';
import type { WitnessChain } from '../../../src/governance/witness-chain.js';
import { ok } from '../../../src/shared/types/index.js';

// ============================================================================
// Mock Factory
// ============================================================================

function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    set: vi.fn((key: string, value: unknown) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => { storage.delete(key); return Promise.resolve(); }),
    has: vi.fn((key: string) => Promise.resolve(storage.has(key))),
    keys: vi.fn(() => Promise.resolve(Array.from(storage.keys()))),
    search: vi.fn((pattern: string) => {
      const re = new RegExp(pattern.replace(/\*/g, '.*'));
      return Promise.resolve(Array.from(storage.keys()).filter(k => re.test(k)));
    }),
    clear: vi.fn(() => { storage.clear(); return Promise.resolve(); }),
    size: vi.fn(() => Promise.resolve(storage.size)),
    close: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ type: 'memory', ready: true })),
  } as unknown as MemoryBackend;
}

function createMockPatternStore(): PatternStore {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(ok({ id: 'pat-1', patternType: 'test-template', name: 'P' })),
    get: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue(ok([])),
    recordUsage: vi.fn().mockResolvedValue(ok(undefined)),
    promote: vi.fn().mockResolvedValue(ok(undefined)),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    getStats: vi.fn().mockResolvedValue({ totalPatterns: 0 }),
    cleanup: vi.fn().mockResolvedValue({ removed: 0 }),
    store: vi.fn().mockResolvedValue(ok('id')),
  } as unknown as PatternStore;
}

function createMockEventBus(): EventBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: () => {}, active: true }),
    subscribeToChannel: vi.fn().mockReturnValue({ unsubscribe: () => {}, active: true }),
    getHistory: vi.fn().mockResolvedValue([]),
    dispose: vi.fn(),
  } as unknown as EventBus;
}

function createMockWitnessChain(): WitnessChain {
  return {
    appendWitness: vi.fn().mockReturnValue({ hash: 'witness-hash-abc123', index: 0 }),
    getChain: vi.fn().mockReturnValue([]),
    verify: vi.fn().mockReturnValue(true),
    length: 0,
  } as unknown as WitnessChain;
}

// ============================================================================
// Tests
// ============================================================================

describe('ExperienceCaptureService — Regression: witness chain integration', () => {
  let memory: MemoryBackend;
  let patternStore: PatternStore;
  let eventBus: EventBus;
  let service: ExperienceCaptureService;

  beforeEach(async () => {
    memory = createMockMemoryBackend();
    patternStore = createMockPatternStore();
    eventBus = createMockEventBus();
    service = createExperienceCaptureService(memory, patternStore, eventBus, {
      autoCleanup: false,
    });
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  it('should work without witness chain (default)', async () => {
    const id = service.startCapture('test task', { domain: 'test-generation' });
    service.recordStep(id, { action: 'analyze code', quality: 0.8 });
    const result = await service.completeCapture(id, { success: true, quality: 0.9 });

    expect(result.success).toBe(true);
    expect(result.value.witnessHash).toBeUndefined();
  });

  it('should accept setWitnessChain without error', () => {
    const chain = createMockWitnessChain();
    expect(() => service.setWitnessChain(chain)).not.toThrow();
  });

  it('should attach witnessHash when witness chain is set and feature flag is on', async () => {
    // Mock the feature flag to enable witness chain
    const featureFlags = await import('../../../src/integrations/ruvector/feature-flags.js');
    const originalFlags = featureFlags.getRuVectorFeatureFlags();
    const mockFlags = { ...originalFlags, useWitnessChain: true };
    vi.spyOn(featureFlags, 'getRuVectorFeatureFlags').mockReturnValue(mockFlags);

    const chain = createMockWitnessChain();
    service.setWitnessChain(chain);

    const id = service.startCapture('witness test', { domain: 'test-generation' });
    service.recordStep(id, { action: 'step1', quality: 0.9 });
    const result = await service.completeCapture(id, { success: true, quality: 0.9 });

    expect(result.success).toBe(true);
    expect(result.value.witnessHash).toBe('witness-hash-abc123');
    expect(chain.appendWitness).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'experience-capture',
        decision: 'PASS',
      })
    );

    vi.restoreAllMocks();
  });

  it('should handle witness chain errors gracefully', async () => {
    const featureFlags = await import('../../../src/integrations/ruvector/feature-flags.js');
    const originalFlags = featureFlags.getRuVectorFeatureFlags();
    const mockFlags = { ...originalFlags, useWitnessChain: true };
    vi.spyOn(featureFlags, 'getRuVectorFeatureFlags').mockReturnValue(mockFlags);

    const chain = createMockWitnessChain();
    (chain.appendWitness as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Witness chain failure');
    });
    service.setWitnessChain(chain);

    const id = service.startCapture('failing witness', { domain: 'test-generation' });
    const result = await service.completeCapture(id, { success: true, quality: 0.8 });

    // Should succeed despite witness chain error
    expect(result.success).toBe(true);
    expect(result.value.witnessHash).toBeUndefined();

    vi.restoreAllMocks();
  });
});
