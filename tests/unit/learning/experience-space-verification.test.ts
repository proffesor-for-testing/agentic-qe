/**
 * #1217: legacy captured_experiences vectors (no embedding_space_id) are
 * attributed to the active space only when the active embedder reproduces
 * them. Vectors are never rewritten.
 */
import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  legacyExperienceEmbeddingTexts,
  verifyLegacyExperienceSpaces,
} from '../../../src/learning/experience-space-verification.js';

function vectorOf(text: string): number[] {
  const v = new Array(8).fill(0);
  for (let i = 0; i < text.length; i++) v[text.charCodeAt(i) % 8] += 1;
  const n = Math.hypot(...v) || 1;
  return v.map(x => x / n);
}

function legacyDb(rows: Array<{ id: string; task: string; vector: number[] }>): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE captured_experiences (
      id TEXT PRIMARY KEY, task TEXT NOT NULL, agent TEXT, domain TEXT NOT NULL DEFAULT '',
      steps_json TEXT, source TEXT, embedding BLOB, embedding_dimension INTEGER,
      embedding_space_id TEXT, consolidated_into TEXT
    );
    CREATE TABLE kv_store (key TEXT NOT NULL, namespace TEXT NOT NULL, value TEXT NOT NULL,
      expires_at INTEGER, created_at INTEGER, PRIMARY KEY (namespace, key));
  `);
  for (const r of rows) {
    db.prepare(`INSERT INTO captured_experiences (id, task, agent, domain, source, embedding, embedding_dimension)
      VALUES (?, ?, 'agent', 'd', 'middleware', ?, ?)`)
      .run(r.id, r.task, Buffer.from(new Float32Array(r.vector).buffer), r.vector.length);
  }
  return db;
}

const spaceOf = (db: Database.Database, id: string) =>
  (db.prepare('SELECT embedding_space_id AS s FROM captured_experiences WHERE id = ?').get(id) as { s: string | null }).s;

describe('verifyLegacyExperienceSpaces (#1217)', () => {
  it('builds the storeExperience recipe only for its own rows', () => {
    const row = {
      rowid: 1, id: 'x', task: 'task', agent: 'strategy', domain: 'd', steps_json: '["a","b"]',
      embedding: Buffer.alloc(0), embedding_dimension: 0,
    };
    expect(legacyExperienceEmbeddingTexts({ ...row, source: 'middleware' })).toEqual(['d: task']);
    expect(legacyExperienceEmbeddingTexts({ ...row, source: 'experience-replay' }))
      .toEqual(['d: task', 'task strategy a b']);
  });

  it('stamps matching rows only, and does not check the same rows again in that space', async () => {
    const db = legacyDb([
      { id: 'same', task: 'alpha', vector: vectorOf('d: alpha') },
      { id: 'other', task: 'beta', vector: vectorOf('another model: beta!!') },
    ]);
    const embed = vi.fn(async (t: string) => vectorOf(t));

    const first = await verifyLegacyExperienceSpaces(db, { embed, activeSpaceId: () => 'space-a' });
    embed.mockClear();
    const second = await verifyLegacyExperienceSpaces(db, { embed, activeSpaceId: () => 'space-a' });
    const otherSpace = await verifyLegacyExperienceSpaces(db, { embed, activeSpaceId: () => 'space-b' });

    expect(first).toMatchObject({ spaceId: 'space-a', checked: 2, stamped: ['same'], left: 1 });
    expect(spaceOf(db, 'same')).toBe('space-a');
    expect(spaceOf(db, 'other')).toBeNull();
    expect(second.checked).toBe(0);
    // A different active space checks the still-unattributed row again.
    expect(otherSpace).toMatchObject({ spaceId: 'space-b', checked: 1, stamped: [] });
  });

  it('keeps the progress made before an embedder failure', async () => {
    const db = legacyDb([
      { id: 'r1', task: 'alpha', vector: vectorOf('d: alpha') },
      { id: 'r2', task: 'beta', vector: vectorOf('d: beta') },
    ]);
    let calls = 0;
    const embed = async (t: string) => {
      if (++calls > 1) throw new Error('embedder down');
      return vectorOf(t);
    };

    await expect(verifyLegacyExperienceSpaces(db, { embed, activeSpaceId: () => 'space-a' }))
      .rejects.toThrow('embedder down');
    const next = await verifyLegacyExperienceSpaces(db, {
      embed: async (t) => vectorOf(t), activeSpaceId: () => 'space-a',
    });

    expect(spaceOf(db, 'r1')).toBe('space-a');
    expect(next).toMatchObject({ checked: 1, stamped: ['r2'] });
  });

  it('does not stamp a row whose vector changed while it was being checked', async () => {
    const db = legacyDb([{ id: 'r1', task: 'alpha', vector: vectorOf('d: alpha') }]);
    const embed = async (t: string) => {
      db.prepare('UPDATE captured_experiences SET embedding = ? WHERE id = ?')
        .run(Buffer.from(new Float32Array(vectorOf('changed')).buffer), 'r1');
      return vectorOf(t);
    };

    const result = await verifyLegacyExperienceSpaces(db, { embed, activeSpaceId: () => 'space-a' });

    expect(result).toMatchObject({ stamped: [], left: 1 });
    expect(spaceOf(db, 'r1')).toBeNull();
  });
});
