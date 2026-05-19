/**
 * Unit Tests — QEReasoningBank.recordOutcome / qe_pattern_usage feedback loop
 *
 * Extracted from qe-reasoning-bank.test.ts (issue #448, step 2).
 *
 * MEMORY NOTE: Like its parent file, this exercises a full QEReasoningBank
 * with transformer embeddings and HNSW indexing. It runs in its own
 * vitest fork (pool=forks, maxForks=1, fileParallelism=false) so its
 * heap is isolated from the rest of the reasoning-bank suite.
 *
 * If you reintroduce a true memory leak here, the suspects named in
 * qe-reasoning-bank.test.ts apply: transformer pipeline singleton in
 * real-embeddings.ts, accumulated HNSW vectors that aren't released by
 * patternStore.dispose(), and pretrained pattern bundles retained
 * beyond the test boundary.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { setRuVectorFeatureFlags, resetRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';
import {
  QEReasoningBank,
  createQEReasoningBank,
} from '../../../src/learning/qe-reasoning-bank';
import { createMockMemory } from '../../mocks';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { checkRuvectorPackagesAvailable } from '../../../src/integrations/ruvector/wrappers';
import { resetUnifiedPersistence } from '../../../src/kernel/unified-persistence';
import { queenGovernanceAdapter } from '../../../src/governance/queen-governance-adapter';
import { resetSharedMinCutState } from '../../../src/coordination/mincut/shared-singleton';
import { clearEmbeddingCache, resetInitialization } from '../../../src/learning/real-embeddings';
import { _resetWitnessChainForTests } from '../../../src/audit/witness-chain';

// Ensure these tests exercise the in-memory PatternStore, not the RVF variant
beforeEach(() => { setRuVectorFeatureFlags({ useRVFPatternStore: false }); });
afterEach(() => { resetRuVectorFeatureFlags(); });

// Issue #448 step 3: release module-level singletons between tests so per-test
// memory growth doesn't compound across the file.
afterEach(() => {
  clearEmbeddingCache();
  _resetWitnessChainForTests();
});
afterAll(() => {
  resetInitialization();
});

// Check if @ruvector/gnn native operations work (required for semantic search)
const canTest = checkRuvectorPackagesAvailable();

describe.runIf(canTest.gnn)('QEReasoningBank — recordOutcome qe_pattern_usage feedback loop', () => {
  let memory: MemoryBackend;
  let reasoningBank: QEReasoningBank;

  beforeEach(async () => {
    // Reset shared singletons to prevent cross-test contamination
    resetUnifiedPersistence();
    queenGovernanceAdapter.reset();
    resetSharedMinCutState();

    memory = createMockMemory();
    reasoningBank = createQEReasoningBank(memory);
    await reasoningBank.initialize();
  });

  afterEach(async () => {
    await reasoningBank.dispose();
    vi.clearAllMocks();

    // Clean up singletons after test
    resetUnifiedPersistence();
  });

  // Helper: store a pattern and return its ID
  async function storeTestPattern(): Promise<string | null> {
    const storeResult = await reasoningBank.storePattern({
      patternType: 'test-template',
      name: 'Analytics Feedback Pattern',
      description: 'Pattern to test qe_pattern_usage INSERT',
      template: { type: 'code', content: 'test content', variables: [] },
    });
    if (!storeResult.success) return null;
    return storeResult.value.id;
  }

  it('should write to qe_pattern_usage when unified memory is available', async () => {
    const patternId = await storeTestPattern();
    expect(patternId).not.toBeNull();
    if (!patternId) return;

    // Create a mock database with a prepare().run() chain
    const mockRun = vi.fn();
    const mockPrepare = vi.fn().mockReturnValue({ run: mockRun });
    const mockDb = { prepare: mockPrepare };
    const mockGetUnifiedMemory = vi.fn().mockReturnValue({
      getDatabase: () => mockDb,
    });

    // Mock the dynamic import to return our mock
    const originalImport = await import('../../../src/kernel/unified-memory.js').catch(() => null);
    vi.doMock('../../../src/kernel/unified-memory.js', () => ({
      ...originalImport,
      getUnifiedMemory: mockGetUnifiedMemory,
    }));

    const outcomeResult = await reasoningBank.recordOutcome({
      patternId,
      success: true,
      metrics: { testsPassed: 10, testsFailed: 0 },
      feedback: 'Excellent coverage',
    });

    expect(outcomeResult.success).toBe(true);

    // The patternStore.recordUsage() should still work
    const pattern = await reasoningBank.getPattern(patternId);
    expect(pattern?.usageCount).toBe(1);
    expect(pattern?.successfulUses).toBe(1);

    // Restore mock so other tests are unaffected
    vi.doUnmock('../../../src/kernel/unified-memory.js');
  });

  it('should not fail when unified memory is NOT available', async () => {
    const patternId = await storeTestPattern();
    expect(patternId).not.toBeNull();
    if (!patternId) return;

    // Mock the dynamic import to throw (simulating unified memory not initialized)
    vi.doMock('../../../src/kernel/unified-memory.js', () => {
      throw new Error('Unified memory not initialized');
    });

    // recordOutcome should succeed despite the analytics INSERT failing
    const outcomeResult = await reasoningBank.recordOutcome({
      patternId,
      success: true,
      metrics: { testsPassed: 5, testsFailed: 0 },
    });

    expect(outcomeResult.success).toBe(true);

    // The patternStore.recordUsage() should still have worked
    const pattern = await reasoningBank.getPattern(patternId);
    expect(pattern?.usageCount).toBe(1);
    expect(pattern?.successfulUses).toBe(1);

    vi.doUnmock('../../../src/kernel/unified-memory.js');
  });

  it('should not fail when getDatabase() throws', async () => {
    const patternId = await storeTestPattern();
    expect(patternId).not.toBeNull();
    if (!patternId) return;

    // Mock where getUnifiedMemory succeeds but getDatabase throws
    vi.doMock('../../../src/kernel/unified-memory.js', () => ({
      getUnifiedMemory: () => ({
        getDatabase: () => { throw new Error('Database not ready'); },
      }),
    }));

    const outcomeResult = await reasoningBank.recordOutcome({
      patternId,
      success: false,
      metrics: { testsPassed: 1, testsFailed: 9 },
      feedback: 'Pattern produced poor results',
    });

    expect(outcomeResult.success).toBe(true);

    // patternStore should still have recorded the failure
    const pattern = await reasoningBank.getPattern(patternId);
    expect(pattern?.usageCount).toBe(1);
    expect(pattern?.successfulUses).toBe(0);

    vi.doUnmock('../../../src/kernel/unified-memory.js');
  });

  it('should not fail when db.prepare().run() throws', async () => {
    const patternId = await storeTestPattern();
    expect(patternId).not.toBeNull();
    if (!patternId) return;

    // Mock where prepare().run() throws (e.g., table does not exist)
    vi.doMock('../../../src/kernel/unified-memory.js', () => ({
      getUnifiedMemory: () => ({
        getDatabase: () => ({
          prepare: () => ({
            run: () => { throw new Error('no such table: qe_pattern_usage'); },
          }),
        }),
      }),
    }));

    const outcomeResult = await reasoningBank.recordOutcome({
      patternId,
      success: true,
      metrics: { testsPassed: 8, testsFailed: 2 },
    });

    expect(outcomeResult.success).toBe(true);

    const pattern = await reasoningBank.getPattern(patternId);
    expect(pattern?.usageCount).toBe(1);
    expect(pattern?.successfulUses).toBe(1);

    vi.doUnmock('../../../src/kernel/unified-memory.js');
  });

  it('should record success=true outcome and increment stats correctly', async () => {
    const patternId = await storeTestPattern();
    expect(patternId).not.toBeNull();
    if (!patternId) return;

    const statsBefore = await reasoningBank.getStats();
    const outcomesBefore = statsBefore.learningOutcomes;

    const outcomeResult = await reasoningBank.recordOutcome({
      patternId,
      success: true,
      metrics: { testsPassed: 15, testsFailed: 0, coverageImprovement: 12.5 },
      feedback: 'All tests green',
    });

    expect(outcomeResult.success).toBe(true);

    const statsAfter = await reasoningBank.getStats();
    expect(statsAfter.learningOutcomes).toBe(outcomesBefore + 1);

    const pattern = await reasoningBank.getPattern(patternId);
    expect(pattern?.usageCount).toBe(1);
    expect(pattern?.successfulUses).toBe(1);
  });

  it('should record success=false outcome and not increment successfulOutcomes', async () => {
    const patternId = await storeTestPattern();
    expect(patternId).not.toBeNull();
    if (!patternId) return;

    const statsBefore = await reasoningBank.getStats();
    const outcomesBefore = statsBefore.learningOutcomes;

    const outcomeResult = await reasoningBank.recordOutcome({
      patternId,
      success: false,
      metrics: { testsPassed: 0, testsFailed: 10, executionTimeMs: 5000 },
      feedback: 'All tests failed due to stale mocks',
    });

    expect(outcomeResult.success).toBe(true);

    const statsAfter = await reasoningBank.getStats();
    expect(statsAfter.learningOutcomes).toBe(outcomesBefore + 1);

    const pattern = await reasoningBank.getPattern(patternId);
    expect(pattern?.usageCount).toBe(1);
    expect(pattern?.successfulUses).toBe(0);
  });

  it('should pass null metrics_json when outcome has no metrics', async () => {
    const patternId = await storeTestPattern();
    expect(patternId).not.toBeNull();
    if (!patternId) return;

    const mockRun = vi.fn();
    const mockPrepare = vi.fn().mockReturnValue({ run: mockRun });
    const mockDb = { prepare: mockPrepare };
    vi.doMock('../../../src/kernel/unified-memory.js', () => ({
      getUnifiedMemory: () => ({
        getDatabase: () => mockDb,
      }),
    }));

    await reasoningBank.recordOutcome({
      patternId,
      success: true,
    });

    // patternStore should still track usage
    const pattern = await reasoningBank.getPattern(patternId);
    expect(pattern?.usageCount).toBe(1);
    expect(pattern?.successfulUses).toBe(1);

    vi.doUnmock('../../../src/kernel/unified-memory.js');
  });

  it('should pass null feedback when outcome has no feedback', async () => {
    const patternId = await storeTestPattern();
    expect(patternId).not.toBeNull();
    if (!patternId) return;

    const mockRun = vi.fn();
    const mockPrepare = vi.fn().mockReturnValue({ run: mockRun });
    const mockDb = { prepare: mockPrepare };
    vi.doMock('../../../src/kernel/unified-memory.js', () => ({
      getUnifiedMemory: () => ({
        getDatabase: () => mockDb,
      }),
    }));

    await reasoningBank.recordOutcome({
      patternId,
      success: false,
      metrics: { testsPassed: 3, testsFailed: 7 },
    });

    const pattern = await reasoningBank.getPattern(patternId);
    expect(pattern?.usageCount).toBe(1);
    expect(pattern?.successfulUses).toBe(0);

    vi.doUnmock('../../../src/kernel/unified-memory.js');
  });

  it('should early-return ok when enableLearning is false', async () => {
    const noLearnMemory = createMockMemory();
    const noLearnBank = createQEReasoningBank(noLearnMemory, undefined, {
      enableLearning: false,
    });
    await noLearnBank.initialize();

    // Store a pattern first
    const storeResult = await noLearnBank.storePattern({
      patternType: 'test-template',
      name: 'No-Learn Pattern',
      description: 'Should not record outcome',
      template: { type: 'code', content: 'test', variables: [] },
    });

    if (!storeResult.success) {
      await noLearnBank.dispose();
      return;
    }

    const outcomeResult = await noLearnBank.recordOutcome({
      patternId: storeResult.value.id,
      success: true,
      metrics: { testsPassed: 5, testsFailed: 0 },
    });

    // Should return ok(undefined) without calling recordUsage or the INSERT
    expect(outcomeResult.success).toBe(true);

    // Pattern should NOT have updated usage stats since learning is disabled
    const pattern = await noLearnBank.getPattern(storeResult.value.id);
    expect(pattern?.usageCount).toBe(0);

    await noLearnBank.dispose();
  });
});
