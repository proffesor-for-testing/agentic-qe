/**
 * Issue #1022: ExperienceReplay embedded every stored experience and every
 * guidance query, so without an embedding runtime it threw and failed the
 * MCP learning path (trajectory end, experience guidance for task_orchestrate).
 *
 * Without an embedder an experience is stored with no vector (backfilled at a
 * later start that has one) and similarity search returns no matches. It must
 * never invent a similarity.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const embeddingMocks = vi.hoisted(() => ({ available: false }));

vi.mock('../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: () => ({
    initialize: async () => undefined,
    getDatabase: () => ({ prepare: () => ({ all: () => [], run: () => undefined }) }),
  }),
}));

vi.mock('../../../src/learning/real-embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/learning/real-embeddings.js')>();
  return {
    ...actual,
    computeRealEmbedding: vi.fn(async () => {
      if (!embeddingMocks.available) throw new Error('In-process embeddings require the optional package');
      return new Array(384).fill(1 / Math.sqrt(384));
    }),
  };
});

import { ExperienceReplay } from '../../../src/integrations/agentic-flow/reasoning-bank/experience-replay.js';
import type { Trajectory } from '../../../src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.js';
import { resetRuVectorFeatureFlags, setRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';

const TRAJECTORY = {
  id: 'traj-1',
  task: 'generate unit tests for src/a.ts',
  domain: 'test-generation',
  steps: [{ action: 'analyze', result: { outcome: 'success' } }],
  outcome: 'success',
  metrics: { efficiencyScore: 0.9, totalDurationMs: 10, successfulSteps: 1, failedSteps: 0, averageQuality: 0.9 },
} as unknown as Trajectory;

function initializedReplay() {
  const insertExperience = { run: vi.fn() };
  const replay = new ExperienceReplay({ autoPrune: false });
  Object.assign(replay as unknown as Record<string, unknown>, {
    initialized: true,
    prepared: new Map([['insertExperience', insertExperience]]),
  });
  return { replay, insertExperience };
}

describe('ExperienceReplay without an embedding runtime (#1022)', () => {
  afterEach(() => {
    embeddingMocks.available = false;
    resetRuVectorFeatureFlags();
    vi.restoreAllMocks();
  });

  it('gives no guidance from the reservoir buffer when the query cannot be embedded', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    setRuVectorFeatureFlags({ useReservoirReplay: true });
    const replay = new ExperienceReplay({ autoPrune: false });
    vi.spyOn(replay as never, 'ensureSchema').mockImplementation(() => undefined);
    vi.spyOn(replay as never, 'prepareStatements').mockImplementation(() => undefined);
    vi.spyOn(replay as never, 'loadEmbeddingIndex').mockResolvedValue(undefined);
    await replay.initialize();
    // A high-quality experience is admitted to the reservoir buffer.
    await replay.storeExperience(TRAJECTORY, 'analyze then generate');

    // An unrelated task: without a query embedding nothing measures relevance,
    // so the reservoir must not supply guidance with a made-up similarity.
    const guidance = await replay.getGuidance('audit the billing service for SQL injection');

    expect(guidance).toBeNull();
  });

  it('stores the experience without a vector instead of throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { replay, insertExperience } = initializedReplay();

    const experience = await replay.storeExperience(TRAJECTORY, 'analyze then generate');

    expect(experience).not.toBeNull();
    expect(experience!.embedding).toBeUndefined();
    expect(insertExperience.run).toHaveBeenCalledTimes(1);
    const args = insertExperience.run.mock.calls[0];
    // embedding BLOB and dimension columns are NULL (pending backfill)
    expect(args.slice(7, 9)).toEqual([null, null]);
  });

  it('returns no similar experiences rather than inventing a similarity', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { replay } = initializedReplay();
    // An index loaded from an earlier run that had an embedder.
    (replay as unknown as { idToExperienceId: Map<number, string> }).idToExperienceId.set(0, 'exp-old');

    await expect(replay.findSimilarExperiences('generate unit tests')).resolves.toEqual([]);
    await expect(replay.getGuidance('generate unit tests')).resolves.toBeNull();
  });

  it('stores the vector when an embedder is available (unchanged)', async () => {
    embeddingMocks.available = true;
    const { replay, insertExperience } = initializedReplay();

    const experience = await replay.storeExperience(TRAJECTORY, 'analyze then generate');

    expect(experience!.embedding).toHaveLength(384);
    const args = insertExperience.run.mock.calls[0];
    expect(Buffer.isBuffer(args[7])).toBe(true);
    expect(args[8]).toBe(384);
  });
});
