/**
 * ADR-118 semantic retriever: retrieval is POLICY-SENSITIVE (fixes the lexical
 * honest-null). Deterministic — injected query embedding + in-memory embeddings,
 * no model. The key lever proven here is mmrLambda: a relevance-heavy policy and
 * a diversity-heavy policy select different examples from the same corpus.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createSemanticRetriever } from '../../../src/learning/qe-flywheel/coupled-anchor.js';
import { DEFAULT_POLICY } from '../../../src/learning/qe-flywheel/policy.js';

const SCHEMA = `
  CREATE TABLE qe_patterns (id TEXT PRIMARY KEY, name TEXT, description TEXT, deprecated_at TEXT DEFAULT NULL);
  CREATE TABLE qe_pattern_embeddings (pattern_id TEXT PRIMARY KEY, embedding BLOB NOT NULL, dimension INTEGER NOT NULL);
`;

function blob(v: number[]): Buffer {
  return Buffer.from(new Float32Array(v).buffer);
}

describe('createSemanticRetriever', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
    // query embeds to [1,0,0,0]. A = identical (most relevant); B = near-A AND
    // near-query (relevant but redundant with A); C = orthogonal to query but
    // diverse from A.
    const rows: [string, number[]][] = [
      ['A', [1, 0, 0, 0]],
      ['B', [0.94, 0.34, 0, 0]],
      ['C', [0, 1, 0, 0]],
    ];
    const ins = db.prepare('INSERT INTO qe_patterns (id, name, description) VALUES (?, ?, ?)');
    const insE = db.prepare('INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension) VALUES (?, ?, 4)');
    for (const [id, vec] of rows) { ins.run(id, `name-${id}`, `body-${id}`); insE.run(id, blob(vec)); }
  });
  afterEach(() => db.close());

  const embed = async () => [1, 0, 0, 0]; // fixed query vector

  it('should_rank_the_most_similar_pattern_first', async () => {
    const r = createSemanticRetriever({ db, embed, topK: 1 });
    const top = await r('q', DEFAULT_POLICY);
    expect(top[0].id).toBe('A');
  });

  it('should_select_the_redundant_neighbor_when_mmrLambda_favors_relevance', async () => {
    const r = createSemanticRetriever({ db, embed, topK: 2 });
    const top = await r('q', { ...DEFAULT_POLICY, mmrLambda: 1.0 }); // pure relevance
    expect(top.map((e) => e.id)).toEqual(['A', 'B']);
  });

  it('should_select_the_diverse_pattern_when_mmrLambda_favors_diversity', async () => {
    const r = createSemanticRetriever({ db, embed, topK: 2 });
    const top = await r('q', { ...DEFAULT_POLICY, mmrLambda: 0.0 }); // pure diversity
    // A is still picked first (highest relevance); the second slot flips to the
    // pattern most DIVERSE from A — C, not the A-redundant B.
    expect(top.map((e) => e.id)).toEqual(['A', 'C']);
  });

  it('should_return_empty_for_an_empty_corpus', async () => {
    const empty = new Database(':memory:');
    empty.exec(SCHEMA);
    const r = createSemanticRetriever({ db: empty, embed, topK: 3 });
    expect(await r('q', DEFAULT_POLICY)).toEqual([]);
    empty.close();
  });
});
