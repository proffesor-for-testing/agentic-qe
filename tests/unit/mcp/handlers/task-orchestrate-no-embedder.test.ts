/**
 * Issue #1022: on a plain `npm install agentic-qe` (no embedding runtime),
 * task_orchestrate failed with "Failed to orchestrate task: Transformer
 * initialization previously failed ..." because the ReasoningBank service
 * could not start. Learned guidance is optional: orchestration must succeed
 * and say how (or whether) learned patterns were matched.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serviceError: null as Error | null,
  status: { mode: 'vector' } as { mode: 'vector' | 'lexical-only'; reason?: string },
  experienceStatus: null as null | { mode: 'vector' | 'unavailable'; reason?: string },
  submitTask: vi.fn(),
  startTaskTrajectory: vi.fn(),
  searchPatternMatches: vi.fn(),
}));

vi.mock('../../../../src/mcp/handlers/core-handlers', () => ({
  isFleetInitialized: () => true,
  getFleetState: () => ({
    queen: {
      submitTask: mocks.submitTask,
      validateTaskExecutable: () => ({ success: true, value: undefined }),
    },
    workflowOrchestrator: null,
  }),
}));

vi.mock('../../../../src/mcp/services/task-router', () => ({
  getTaskRouter: async () => ({
    routeTask: async () => ({
      decision: {
        tier: 2,
        confidence: 0.8,
        rationale: 'test',
        complexityAnalysis: { overall: 0.3 },
        metadata: { decisionTimeMs: 1 },
      },
      tierInfo: { name: 'Haiku' },
      modelId: 'test-model',
      executionStrategy: 'direct',
      useAgentBooster: false,
    }),
  }),
}));

vi.mock('../../../../src/mcp/services/reasoning-bank-service', () => ({
  getReasoningBankService: async () => {
    if (mocks.serviceError) throw mocks.serviceError;
    return {
      getExperienceGuidance: async () => null,
      searchPatternMatches: mocks.searchPatternMatches,
      getPatternSearchStatus: () => mocks.status,
      getExperienceGuidanceStatus: () => mocks.experienceStatus,
    };
  },
  startTaskTrajectory: mocks.startTaskTrajectory,
  endTaskTrajectory: vi.fn(),
}));

import { handleTaskOrchestrate } from '../../../../src/mcp/handlers/task-handlers';

const TASK = { task: 'Generate unit tests for the authentication module' };
const NO_EMBEDDER = 'In-process embeddings require the optional package "@huggingface/transformers"';

describe('task_orchestrate without an embedding runtime (#1022)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serviceError = null;
    mocks.status = { mode: 'vector' };
    mocks.experienceStatus = null;
    mocks.submitTask.mockResolvedValue({ success: true, value: 'task-1' });
    mocks.searchPatternMatches.mockResolvedValue([]);
  });

  it('orchestrates with lexical-only pattern hints and reports why', async () => {
    mocks.status = { mode: 'lexical-only', reason: NO_EMBEDDER };
    mocks.searchPatternMatches.mockResolvedValue([{
      pattern: { id: 'p1', name: 'AAA Unit Test', description: 'd', confidence: 0.5 },
      score: 0.4, similarity: 0, matchType: 'lexical', canReuse: false,
    }]);

    const result = await handleTaskOrchestrate(TASK);

    expect(result.success, result.error).toBe(true);
    expect(result.data!.status).toBe('submitted');
    expect(result.data!.learning).toEqual({ patternSearch: 'lexical-only', reason: NO_EMBEDDER });
    const hints = mocks.submitTask.mock.calls[0][0].payload.patternHints;
    expect(hints).toEqual([expect.objectContaining({ patternId: 'p1', matchType: 'lexical', similarity: 0 })]);
    expect(mocks.startTaskTrajectory).toHaveBeenCalledTimes(1);
  });

  it('orchestrates without learned guidance when the ReasoningBank cannot start', async () => {
    mocks.serviceError = new Error(`Transformer initialization previously failed: ${NO_EMBEDDER}`);

    const result = await handleTaskOrchestrate(TASK);

    expect(result.success, result.error).toBe(true);
    expect(result.data!.learning.patternSearch).toBe('unavailable');
    expect(result.data!.learning.reason).toContain(NO_EMBEDDER);
    const payload = mocks.submitTask.mock.calls[0][0].payload;
    expect(payload.patternHints).toBeUndefined();
    expect(payload.experienceGuidance).toBeUndefined();
    expect(mocks.startTaskTrajectory).not.toHaveBeenCalled();
  });

  it('reports lexical-only when the embedder fails during this search (#1187)', async () => {
    const reason = 'Embedder failed at runtime: connect ECONNREFUSED 127.0.0.1:8099';
    mocks.searchPatternMatches.mockImplementation(async () => {
      mocks.status = { mode: 'lexical-only', reason };
      return [{
        pattern: { id: 'p1', name: 'AAA Unit Test', description: 'd', confidence: 0.5 },
        score: 0.4, similarity: 0, matchType: 'lexical', canReuse: false,
      }];
    });

    const result = await handleTaskOrchestrate(TASK);

    expect(result.success, result.error).toBe(true);
    expect(result.data!.learning).toEqual({ patternSearch: 'lexical-only', reason });
    const hints = mocks.submitTask.mock.calls[0][0].payload.patternHints;
    expect(hints).toEqual([expect.objectContaining({ patternId: 'p1', matchType: 'lexical' })]);
  });

  it('reports vector pattern search when an embedder is available (unchanged)', async () => {
    const result = await handleTaskOrchestrate(TASK);

    expect(result.success, result.error).toBe(true);
    expect(result.data!.learning).toEqual({ patternSearch: 'vector' });
    expect(mocks.startTaskTrajectory).toHaveBeenCalledTimes(1);
  });

  it('#1204: reports that experience guidance is unavailable because its embedder failed', async () => {
    const reason = 'Embedder failed at runtime: connect ECONNREFUSED 127.0.0.1:8099';
    mocks.experienceStatus = { mode: 'unavailable', reason };

    const result = await handleTaskOrchestrate(TASK);

    expect(result.success, result.error).toBe(true);
    expect(result.data!.learning).toEqual({
      patternSearch: 'vector',
      experienceGuidance: { mode: 'unavailable', reason },
    });
  });

  it('#1204: reports vector experience guidance when its embedder works', async () => {
    mocks.experienceStatus = { mode: 'vector' };

    const result = await handleTaskOrchestrate(TASK);

    expect(result.data!.learning).toEqual({ patternSearch: 'vector', experienceGuidance: { mode: 'vector' } });
  });

  it('#1204: does not label a text-only search vector when the embedder recovers during the call', async () => {
    const reason = 'Embedder failed at runtime: connect ECONNREFUSED 127.0.0.1:8099';
    mocks.status = { mode: 'lexical-only', reason };
    mocks.experienceStatus = { mode: 'unavailable', reason };
    mocks.searchPatternMatches.mockImplementation(async () => {
      // A background retry succeeds while this (text-only) search runs.
      mocks.status = { mode: 'vector' };
      mocks.experienceStatus = { mode: 'vector' };
      return [];
    });

    const result = await handleTaskOrchestrate(TASK);

    expect(result.data!.learning).toEqual({
      patternSearch: 'lexical-only',
      reason,
      experienceGuidance: { mode: 'unavailable', reason },
    });
  });
});
