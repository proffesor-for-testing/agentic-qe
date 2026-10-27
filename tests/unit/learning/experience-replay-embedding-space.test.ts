/**
 * Issue #1217: ExperienceReplay compared vectors by length only. An experience
 * embedded in another embedding space of the same dimension (another endpoint
 * model, or the in-process transformer) got a cosine similarity computed
 * across spaces and reported as measured. Only vectors of the active
 * embedding space (ADR-097 spaceId) are compared now; others have no
 * comparable vector, as in the pattern banks.
 *
 * Both "spaces" here produce the same vector for the same text, so a
 * length-only check would find a near-perfect match across them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

const space = vi.hoisted(() => ({ active: 'space-a' as string | null, db: null as unknown }));

// One bucket per word, so texts that share words are close and others are not.
const wordVector = vi.hoisted(() => (text: string): number[] => {
  const v = new Array(384).fill(0);
  for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 0;
    for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % 384] += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map(x => x / norm);
});

vi.mock('../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: () => ({
    initialize: async () => undefined,
    getDatabase: () => space.db,
    writeWhenUnlocked: async <T>(fn: () => T) => fn(),
  }),
}));

vi.mock('../../../src/learning/real-embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/learning/real-embeddings.js')>();
  return {
    ...actual,
    computeRealEmbedding: vi.fn(async (text: string) => wordVector(text)),
    getActiveEmbeddingSpaceIdentity: vi.fn(() => (space.active ? { spaceId: space.active } : null)),
  };
});

import { ExperienceReplay } from '../../../src/integrations/agentic-flow/reasoning-bank/experience-replay.js';
import type { Trajectory } from '../../../src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.js';
import { resetRuVectorFeatureFlags, setRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';
import { recordExperienceEmbeddingSpace } from '../../../src/learning/embedding-space.js';

const TASK = 'generate unit tests for src/a.ts';
const STRATEGY = 'analyze then generate';

const TRAJECTORY = {
  id: 'traj-1',
  task: TASK,
  domain: 'test-generation',
  steps: [{ action: 'analyze', result: { outcome: 'success' } }],
  outcome: 'success',
  metrics: { efficiencyScore: 0.9, totalDurationMs: 10, successfulSteps: 1, failedSteps: 0, averageQuality: 0.9 },
} as unknown as Trajectory;

/** Insert a captured experience whose vector was embedded in `spaceId`. */
function insertExperience(db: Database.Database, id: string, spaceId: string | null): void {
  const vector = wordVector(`${TASK} ${STRATEGY} analyze`);
  db.prepare(`
    INSERT INTO captured_experiences
      (id, task, agent, domain, success, quality, steps_json, embedding, embedding_dimension, embedding_space_id)
    VALUES (?, ?, ?, 'test-generation', 1, 0.9, '["analyze"]', ?, ?, ?)
  `).run(id, TASK, STRATEGY, Buffer.from(new Float32Array(vector).buffer), vector.length, spaceId);
}

async function initializedReplay(): Promise<{ replay: ExperienceReplay; db: Database.Database }> {
  const db = new Database(':memory:');
  space.db = db;
  const replay = new ExperienceReplay({ autoPrune: false, similarityThreshold: 0.5 });
  await replay.initialize();
  return { replay, db };
}

describe('ExperienceReplay compares only vectors of the active embedding space (#1217)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    space.active = 'space-a';
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
    vi.restoreAllMocks();
    (space.db as Database.Database | null)?.close();
    space.db = null;
  });

  it('finds no similar experience embedded in another space of the same dimension', async () => {
    const { replay } = await initializedReplay();
    await replay.storeExperience(TRAJECTORY, STRATEGY);

    space.active = 'space-b';
    const acrossSpaces = await replay.findSimilarExperiences(TASK);
    const guidance = await replay.getGuidance(TASK);

    expect(acrossSpaces).toEqual([]);
    expect(guidance).toBeNull();
  });

  it('still finds it in its own space (control)', async () => {
    const { replay } = await initializedReplay();
    const stored = await replay.storeExperience(TRAJECTORY, STRATEGY);

    space.active = 'space-b';
    await replay.findSimilarExperiences(TASK);
    space.active = 'space-a';
    const similar = await replay.findSimilarExperiences(TASK);

    expect(similar.map(s => s.experience.id)).toEqual([stored!.id]);
    expect(similar[0].experience.embeddingSpaceId).toBe('space-a');
  });

  it('does not load vectors of another space from the database into the index', async () => {
    const db = new Database(':memory:');
    space.db = db;
    // The schema comes from a first replay; rows from another run go in after.
    const first = new ExperienceReplay({ autoPrune: false });
    await first.initialize();
    insertExperience(db, 'exp-space-b', 'space-b');
    insertExperience(db, 'exp-space-a', 'space-a');

    const replay = new ExperienceReplay({ autoPrune: false, similarityThreshold: 0.5 });
    await replay.initialize();
    const similar = await replay.findSimilarExperiences(TASK);

    expect(similar.map(s => s.experience.id)).toEqual(['exp-space-a']);
  });

  it('skips a reservoir experience embedded in another space of the same dimension', async () => {
    setRuVectorFeatureFlags({ useReservoirReplay: true });
    const { replay } = await initializedReplay();
    // HNSW search finds nothing, so guidance can only come from the reservoir.
    vi.spyOn(replay, 'findSimilarExperiences').mockResolvedValue([]);
    const reservoir = (replay as unknown as {
      reservoirBuffer: { admit(id: string, data: unknown, coherence: number): void };
    }).reservoirBuffer;
    reservoir.admit('exp-b', {
      id: 'exp-b', task: TASK, domain: 'test-generation', strategy: STRATEGY, keyActions: ['analyze'],
      qualityScore: 0.9, avgTokenSavings: 0, embedding: wordVector(TASK), embeddingSpaceId: 'space-b',
    }, 0.9);

    const acrossSpaces = await replay.getGuidance(TASK);
    space.active = 'space-b';
    const sameSpace = await replay.getGuidance(TASK);

    expect(acrossSpaces).toBeNull();
    expect(sameSpace?.sourceExperiences.map(s => s.id)).toEqual(['exp-b']);
  });

  it('stores no vector it cannot attribute to an embedding space', async () => {
    const { replay, db } = await initializedReplay();
    space.active = null;

    const experience = await replay.storeExperience(TRAJECTORY, STRATEGY);

    expect(experience!.embedding).toBeUndefined();
    const row = db.prepare('SELECT embedding, embedding_space_id FROM captured_experiences WHERE id = ?')
      .get(experience!.id) as { embedding: Buffer | null; embedding_space_id: string | null };
    expect(row).toEqual({ embedding: null, embedding_space_id: null });
  });

  it('a writer on a table without the provenance column keeps the vector and does not throw', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE captured_experiences (id TEXT PRIMARY KEY, embedding BLOB, embedding_dimension INTEGER)');
    db.prepare("INSERT INTO captured_experiences VALUES ('exp-old-table', x'00', 1)").run();

    expect(() => recordExperienceEmbeddingSpace(db, 'exp-old-table', 'space-a')).not.toThrow();
    expect(db.prepare('SELECT embedding_dimension FROM captured_experiences').get()).toEqual({ embedding_dimension: 1 });
    db.close();
  });

  it('re-embeds a stored vector without provenance at start, in the active space', async () => {
    const db = new Database(':memory:');
    space.db = db;
    const first = new ExperienceReplay({ autoPrune: false });
    await first.initialize();
    insertExperience(db, 'exp-legacy', null);

    const replay = new ExperienceReplay({ autoPrune: false, similarityThreshold: 0.5 });
    await replay.initialize();

    await vi.waitFor(() => {
      const row = db.prepare('SELECT embedding_space_id FROM captured_experiences WHERE id = ?')
        .get('exp-legacy') as { embedding_space_id: string | null };
      expect(row.embedding_space_id).toBe('space-a');
    });
    const similar = await replay.findSimilarExperiences(TASK);
    expect(similar.map(s => s.experience.id)).toEqual(['exp-legacy']);
  });
});
