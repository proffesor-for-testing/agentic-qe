/**
 * Issue #1281: Phase-1 consolidation merged experiences by cosine without
 * checking their embedding space (ADR-097 spaceId). Two vectors from
 * different models of the same dimension got a meaningless similarity, and a
 * merge (or contradiction) writes consolidated_into, which removes an
 * experience from guidance. Only vectors recorded in the active space are
 * compared now; vectors of another space or without one are never merged.
 *
 * The vectors below are identical across spaces, so a check that ignores the
 * space finds a perfect match.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

const active = vi.hoisted(() => ({ spaceId: 'space-a' as string | null }));

vi.mock('../../../src/learning/real-embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/learning/real-embeddings.js')>();
  return {
    ...actual,
    getActiveEmbeddingSpaceIdentity: vi.fn(() => (active.spaceId ? { spaceId: active.spaceId } : null)),
    ensureEndpointEmbeddingSpaceIdentity: vi.fn(async () => null),
  };
});

import { ExperienceConsolidator } from '../../../src/learning/experience-consolidation.js';

const DIM = 384;

function schema(db: Database.Database, withSpaceColumn = true): void {
  db.exec(`
    CREATE TABLE captured_experiences (
      id TEXT PRIMARY KEY, task TEXT, agent TEXT, domain TEXT NOT NULL,
      success INTEGER DEFAULT 0, quality REAL DEFAULT 0, started_at TEXT,
      application_count INTEGER DEFAULT 0, embedding BLOB, embedding_dimension INTEGER,
      consolidated_into TEXT DEFAULT NULL, consolidation_count INTEGER DEFAULT 1,
      quality_updated_at TEXT, reuse_success_count INTEGER DEFAULT 0,
      reuse_failure_count INTEGER DEFAULT 0${withSpaceColumn ? ', embedding_space_id TEXT' : ''}
    );
    CREATE TABLE experience_consolidation_log (
      id TEXT PRIMARY KEY, domain TEXT NOT NULL, action TEXT NOT NULL,
      source_ids TEXT NOT NULL, target_id TEXT, details TEXT, created_at TEXT
    );
    CREATE TABLE experience_applications (
      id TEXT PRIMARY KEY, experience_id TEXT NOT NULL, success INTEGER DEFAULT 0
    );
  `);
}

const sameVector = (() => {
  const buf = Buffer.alloc(DIM * 4);
  buf.writeFloatLE(1, 0);
  return buf;
})();

describe('ExperienceConsolidator compares only vectors of the active embedding space (#1281)', () => {
  let db: Database.Database;

  function seed(id: string, quality: number, spaceId: string | null, applicationCount = 0): void {
    db.prepare(`
      INSERT INTO captured_experiences
        (id, task, domain, quality, success, application_count, embedding, embedding_dimension,
         started_at, embedding_space_id)
      VALUES (?, ?, 'core', ?, 1, ?, ?, ?, '2026-02-01 00:00:00', ?)
    `).run(id, id, quality, applicationCount, sameVector, DIM, spaceId);
  }
  const consolidatedInto = (id: string) =>
    (db.prepare('SELECT consolidated_into AS c FROM captured_experiences WHERE id = ?').get(id) as { c: string | null }).c;

  async function consolidate(config = {}) {
    const consolidator = new ExperienceConsolidator({ softThreshold: 0, ...config });
    await consolidator.initialize(db);
    return consolidator.consolidateDomain('core');
  }

  beforeEach(() => {
    active.spaceId = 'space-a';
    db = new Database(':memory:');
    schema(db);
  });

  afterEach(() => db.close());

  it('does not merge a near-duplicate from another space of the same dimension', async () => {
    seed('survivor-a', 0.9, 'space-a');
    seed('dup-b', 0.88, 'space-b');

    const result = await consolidate();

    expect(result.merged).toBe(0);
    expect(consolidatedInto('dup-b')).toBeNull();
    expect(consolidatedInto('survivor-a')).toBeNull();
  });

  it('does not merge a near-duplicate without a recorded space', async () => {
    seed('survivor-a', 0.9, 'space-a');
    seed('dup-none', 0.88, null);

    const result = await consolidate();

    expect(result.merged).toBe(0);
    expect(consolidatedInto('dup-none')).toBeNull();
  });

  it('does not suppress a "contradiction" across spaces', async () => {
    seed('good-a', 0.9, 'space-a');
    seed('bad-b', 0.2, 'space-b', 3);

    const result = await consolidate();

    expect(result.contradicted).toBe(0);
    expect(consolidatedInto('bad-b')).toBeNull();
  });

  it('still merges near-duplicates within the active space (control)', async () => {
    seed('survivor-a', 0.9, 'space-a');
    seed('dup-a', 0.88, 'space-a');
    seed('dup-b', 0.87, 'space-b');

    const result = await consolidate();

    expect(result.merged).toBe(1);
    expect(consolidatedInto('dup-a')).toBe('survivor-a');
    expect(consolidatedInto('dup-b')).toBeNull();
  });

  it('merges nothing when no embedding space is known', async () => {
    active.spaceId = null;
    seed('x', 0.9, 'space-a');
    seed('y', 0.88, 'space-a');

    const result = await consolidate();

    expect(result.merged).toBe(0);
    expect(consolidatedInto('y')).toBeNull();
  });

  it('uses a configured space over the active one', async () => {
    seed('survivor-b', 0.9, 'space-b');
    seed('dup-b', 0.88, 'space-b');
    seed('dup-a', 0.87, 'space-a');

    const result = await consolidate({ embeddingSpaceId: 'space-b' });

    expect(result.merged).toBe(1);
    expect(consolidatedInto('dup-b')).toBe('survivor-b');
    expect(consolidatedInto('dup-a')).toBeNull();
  });

  it('merges nothing on a table without the embedding-space column', async () => {
    db.close();
    db = new Database(':memory:');
    schema(db, false);
    for (const id of ['x', 'y']) {
      db.prepare(`INSERT INTO captured_experiences (id, task, domain, quality, success, embedding, embedding_dimension, started_at)
        VALUES (?, ?, 'core', 0.9, 1, ?, ?, '2026-02-01 00:00:00')`).run(id, id, sameVector, DIM);
    }

    const result = await consolidate();

    expect(result.merged).toBe(0);
    expect(consolidatedInto('y')).toBeNull();
  });
});
