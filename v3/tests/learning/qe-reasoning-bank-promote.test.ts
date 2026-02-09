/**
 * Unit tests for QEReasoningBank.promotePattern()
 * ADR-064 Phase 3: Learning & Observability
 *
 * Tests that recordOutcome() → promotePattern() → patternStore.promote()
 * fires correctly, publishes events, and handles errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QEReasoningBank } from '../../src/learning/qe-reasoning-bank.js';
import type { QEPattern } from '../../src/learning/qe-patterns.js';
import type { MemoryBackend, EventBus } from '../../src/kernel/interfaces.js';
import type { IPatternStore } from '../../src/learning/pattern-store.js';
import type { Result } from '../../src/shared/types/index.js';

// ============================================================================
// Mocks
// ============================================================================

function createMockMemory(): MemoryBackend {
  return {
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    has: vi.fn(async () => false),
    keys: vi.fn(async () => []),
    search: vi.fn(async () => []),
    stats: vi.fn(async () => ({ totalEntries: 0, namespaces: {} })),
    clear: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  } as unknown as MemoryBackend;
}

function createMockEventBus(): EventBus & { publish: ReturnType<typeof vi.fn> } {
  return {
    publish: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
    unsubscribe: vi.fn(),
    emit: vi.fn(async () => {}),
  } as unknown as EventBus & { publish: ReturnType<typeof vi.fn> };
}

/**
 * Build a QEPattern that meets promotion criteria:
 * - tier: 'short-term'
 * - successfulUses >= 3
 * - successRate >= 0.7
 * - confidence >= 0.6
 */
function makePromotablePattern(id: string): QEPattern {
  return {
    id,
    patternType: 'test-template',
    name: 'Promotable Pattern',
    qeDomain: 'test-generation',
    domain: 'test-generation',
    description: 'A pattern that meets all promotion criteria',
    confidence: 0.8,
    usageCount: 5,
    successRate: 0.8,
    qualityScore: 0.75,
    context: { tags: ['test'] },
    template: { type: 'prompt', content: 'test content', variables: [] },
    tier: 'short-term',
    createdAt: new Date(),
    lastUsedAt: new Date(),
    successfulUses: 4,
    reusable: true,
    reuseCount: 3,
    averageTokenSavings: 100,
  } as QEPattern;
}

/** Build a pattern that does NOT meet promotion criteria */
function makeNonPromotablePattern(id: string): QEPattern {
  return {
    ...makePromotablePattern(id),
    successfulUses: 1, // Below threshold of 3
    successRate: 0.3,  // Below threshold of 0.7
  } as QEPattern;
}

function createMockPatternStore(): IPatternStore & {
  promote: ReturnType<typeof vi.fn>;
  recordUsage: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
  getStats: ReturnType<typeof vi.fn>;
} {
  return {
    initialize: vi.fn(async () => {}),
    store: vi.fn(async () => ({ success: true, value: 'p-1' } as Result<string>)),
    create: vi.fn(async () => ({ success: true, value: {} } as Result<unknown>)),
    get: vi.fn(async () => null),
    search: vi.fn(async () => ({ success: true, value: [] } as Result<unknown[]>)),
    recordUsage: vi.fn(async () => ({ success: true, value: undefined } as Result<void>)),
    promote: vi.fn(async () => ({ success: true, value: undefined } as Result<void>)),
    delete: vi.fn(async () => ({ success: true, value: undefined } as Result<void>)),
    getStats: vi.fn(async () => ({
      totalPatterns: 0,
      byDomain: {},
      byType: {},
      avgConfidence: 0.8,
      avgUsageCount: 1,
      recentlyUsed: [],
    })),
    dispose: vi.fn(async () => {}),
  } as unknown as IPatternStore & {
    promote: ReturnType<typeof vi.fn>;
    recordUsage: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('QEReasoningBank promotePattern (ADR-064 Phase 3)', () => {
  let memory: MemoryBackend;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let mockStore: ReturnType<typeof createMockPatternStore>;
  let bank: QEReasoningBank;

  beforeEach(async () => {
    memory = createMockMemory();
    eventBus = createMockEventBus();

    bank = new QEReasoningBank(memory, eventBus, {
      enableLearning: true,
      enableGuidance: false,
      enableRouting: false,
    });

    // Replace the internal patternStore with our mock
    mockStore = createMockPatternStore();
    (bank as unknown as { patternStore: IPatternStore }).patternStore = mockStore;

    // Initialize (skips pretrained patterns since store has 0 patterns)
    await bank.initialize();
  });

  // ---------- Successful promotion ----------

  it('should call patternStore.promote() when pattern meets criteria', async () => {
    const pattern = makePromotablePattern('pattern-promote-1');
    mockStore.get.mockResolvedValue(pattern);
    mockStore.recordUsage.mockResolvedValue({ success: true, value: undefined });
    // search returns empty so no coherence issues
    mockStore.search.mockResolvedValue({ success: true, value: [] });

    await bank.recordOutcome({ patternId: 'pattern-promote-1', success: true });

    expect(mockStore.promote).toHaveBeenCalledWith('pattern-promote-1');
  });

  it('should publish pattern:promoted event on successful promotion', async () => {
    const pattern = makePromotablePattern('pattern-promote-2');
    mockStore.get.mockResolvedValue(pattern);
    mockStore.recordUsage.mockResolvedValue({ success: true, value: undefined });
    mockStore.search.mockResolvedValue({ success: true, value: [] });

    await bank.recordOutcome({ patternId: 'pattern-promote-2', success: true });

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pattern:promoted',
        payload: expect.objectContaining({
          patternId: 'pattern-promote-2',
          newTier: 'long-term',
        }),
      }),
    );
  });

  // ---------- Non-promotable pattern ----------

  it('should NOT call promote() when pattern does not meet criteria', async () => {
    const pattern = makeNonPromotablePattern('pattern-no-promote');
    mockStore.get.mockResolvedValue(pattern);
    mockStore.recordUsage.mockResolvedValue({ success: true, value: undefined });

    await bank.recordOutcome({ patternId: 'pattern-no-promote', success: true });

    expect(mockStore.promote).not.toHaveBeenCalled();
  });

  it('should NOT publish event when pattern does not meet criteria', async () => {
    const pattern = makeNonPromotablePattern('pattern-no-event');
    mockStore.get.mockResolvedValue(pattern);
    mockStore.recordUsage.mockResolvedValue({ success: true, value: undefined });

    await bank.recordOutcome({ patternId: 'pattern-no-event', success: true });

    expect(eventBus.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pattern:promoted' }),
    );
  });

  // ---------- Promotion failure ----------

  it('should log error when patternStore.promote() fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pattern = makePromotablePattern('pattern-fail-promote');
    mockStore.get.mockResolvedValue(pattern);
    mockStore.recordUsage.mockResolvedValue({ success: true, value: undefined });
    mockStore.search.mockResolvedValue({ success: true, value: [] });
    mockStore.promote.mockResolvedValue({
      success: false,
      error: new Error('Disk full'),
    });

    await bank.recordOutcome({ patternId: 'pattern-fail-promote', success: true });

    expect(mockStore.promote).toHaveBeenCalledWith('pattern-fail-promote');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to promote pattern pattern-fail-promote'),
    );
    // Event should NOT be published on failure
    expect(eventBus.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pattern:promoted' }),
    );

    errorSpy.mockRestore();
  });

  // ---------- No event bus ----------

  it('should promote without crashing when no event bus is provided', async () => {
    const bankNoEvents = new QEReasoningBank(memory, undefined, {
      enableLearning: true,
      enableGuidance: false,
      enableRouting: false,
    });
    const store = createMockPatternStore();
    (bankNoEvents as unknown as { patternStore: IPatternStore }).patternStore = store;
    await bankNoEvents.initialize();

    const pattern = makePromotablePattern('pattern-no-bus');
    store.get.mockResolvedValue(pattern);
    store.recordUsage.mockResolvedValue({ success: true, value: undefined });
    store.search.mockResolvedValue({ success: true, value: [] });

    // Should not throw
    await bankNoEvents.recordOutcome({ patternId: 'pattern-no-bus', success: true });

    expect(store.promote).toHaveBeenCalledWith('pattern-no-bus');
  });

  // ---------- Pattern not found ----------

  it('should not promote when pattern is not found', async () => {
    mockStore.get.mockResolvedValue(null);
    mockStore.recordUsage.mockResolvedValue({ success: true, value: undefined });

    await bank.recordOutcome({ patternId: 'missing-pattern', success: true });

    expect(mockStore.promote).not.toHaveBeenCalled();
  });
});
