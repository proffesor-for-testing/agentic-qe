/**
 * Contradiction detection in consolidation (#510 item 7).
 *
 * AQE's Phase-1 consolidation MERGES near-duplicate experiences (high cosine
 * similarity), but two experiences with the same context and OPPOSITE outcomes
 * (large quality delta) are a conflict, not a duplicate. Merging silently
 * absorbs the conflict; worse, a *used* low-quality contradictory experience
 * was never merged (merge requires application_count===0) and stayed in
 * retrieval, poisoning recall.
 *
 * These tests verify the lower-quality loser of a contradictory pair is
 * SUPPRESSED from retrieval (consolidated_into = 'contradicted') — even when it
 * was applied — while genuine near-duplicates still merge and dissimilar pairs
 * are left untouched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ExperienceConsolidator } from '../../../src/learning/experience-consolidation.js';

const DIM = 384;

function bootstrapSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE captured_experiences (
      id TEXT PRIMARY KEY, task TEXT, agent TEXT, domain TEXT NOT NULL,
      success INTEGER DEFAULT 0, quality REAL DEFAULT 0, duration_ms INTEGER DEFAULT 0,
      model_tier TEXT, routing_json TEXT, steps_json TEXT, result_json TEXT, error TEXT,
      started_at TEXT, completed_at TEXT, source TEXT,
      application_count INTEGER DEFAULT 0, avg_token_savings REAL DEFAULT 0,
      embedding BLOB, embedding_dimension INTEGER, tags TEXT, last_applied_at TEXT,
      consolidated_into TEXT DEFAULT NULL, consolidation_count INTEGER DEFAULT 1,
      quality_updated_at TEXT, reuse_success_count INTEGER DEFAULT 0,
      reuse_failure_count INTEGER DEFAULT 0
    );
    CREATE TABLE experience_consolidation_log (
      id TEXT PRIMARY KEY, domain TEXT NOT NULL, action TEXT NOT NULL,
      source_ids TEXT NOT NULL, target_id TEXT, details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE experience_applications (
      id TEXT PRIMARY KEY, experience_id TEXT NOT NULL, task TEXT,
      success INTEGER DEFAULT 0, tokens_saved INTEGER DEFAULT 0, feedback TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

/** A unit one-hot embedding at index `i` as a Float32LE buffer. */
function oneHot(i: number): Buffer {
  const buf = Buffer.alloc(DIM * 4);
  buf.writeFloatLE(1, i * 4);
  return buf;
}

interface SeedOpts {
  id: string;
  quality: number;
  embedding: Buffer;
  applicationCount?: number;
}

describe('ExperienceConsolidator — contradiction detection (#510 item 7)', () => {
  let db: Database.Database;
  let consolidator: ExperienceConsolidator;

  function seed(o: SeedOpts): void {
    db.prepare(`
      INSERT INTO captured_experiences
        (id, task, domain, quality, success, application_count, embedding,
         embedding_dimension, started_at, source)
      VALUES (?, ?, 'core', ?, 1, ?, ?, ?, '2026-02-01 00:00:00', 'test')
    `).run(o.id, o.id, o.quality, o.applicationCount ?? 0, o.embedding, DIM);
  }

  function consolidatedInto(id: string): string | null {
    return (db.prepare('SELECT consolidated_into AS c FROM captured_experiences WHERE id = ?').get(id) as { c: string | null }).c;
  }
  function qualityOf(id: string): number {
    return (db.prepare('SELECT quality AS q FROM captured_experiences WHERE id = ?').get(id) as { q: number }).q;
  }

  beforeEach(async () => {
    db = new Database(':memory:');
    bootstrapSchema(db);
    consolidator = new ExperienceConsolidator({ softThreshold: 0, maxMergesPerRun: 50 });
    await consolidator.initialize(db);
  });

  afterEach(() => db.close());

  it('suppresses the lower-quality loser of a contradictory pair from retrieval', async () => {
    // Same context (identical embedding), opposite outcome (0.9 vs 0.2 = delta 0.7).
    seed({ id: 'good', quality: 0.9, embedding: oneHot(0) });
    seed({ id: 'bad', quality: 0.2, embedding: oneHot(0), applicationCount: 3 });

    const result = await consolidator.consolidateDomain('core');

    expect(result.contradicted).toBe(1);
    expect(result.merged).toBe(0); // a contradiction is NOT a merge
    expect(consolidatedInto('bad')).toBe('contradicted'); // excluded from retrieval
    expect(consolidatedInto('good')).toBeNull(); // survivor stays active
  });

  it('suppresses a contradictory loser EVEN WHEN it was applied (the poisoning case)', async () => {
    // The normal merge path requires application_count===0, so this used loser
    // would otherwise have stayed in retrieval forever.
    seed({ id: 'good', quality: 0.95, embedding: oneHot(1) });
    seed({ id: 'used-bad', quality: 0.3, embedding: oneHot(1), applicationCount: 7 });

    const result = await consolidator.consolidateDomain('core');

    expect(result.contradicted).toBe(1);
    expect(consolidatedInto('used-bad')).toBe('contradicted');
  });

  it('does NOT boost the survivor of a contradiction (conflict, not duplicate)', async () => {
    seed({ id: 'good', quality: 0.9, embedding: oneHot(2) });
    seed({ id: 'bad', quality: 0.2, embedding: oneHot(2) });

    await consolidator.consolidateDomain('core');

    expect(qualityOf('good')).toBeCloseTo(0.9, 6); // unchanged (merge would boost)
  });

  it('still MERGES a genuine near-duplicate (small quality delta), not contradiction', async () => {
    seed({ id: 'survivor', quality: 0.9, embedding: oneHot(3) });
    seed({ id: 'dup', quality: 0.88, embedding: oneHot(3), applicationCount: 0 });

    const result = await consolidator.consolidateDomain('core');

    expect(result.contradicted).toBe(0);
    expect(result.merged).toBe(1);
    expect(consolidatedInto('dup')).toBe('survivor'); // merged into survivor, not 'contradicted'
  });

  it('leaves a DISSIMILAR pair untouched even with a large quality delta', async () => {
    // Orthogonal embeddings (cosine 0) => below similarity threshold, no action.
    seed({ id: 'a', quality: 0.9, embedding: oneHot(10) });
    seed({ id: 'b', quality: 0.2, embedding: oneHot(20) });

    const result = await consolidator.consolidateDomain('core');

    expect(result.contradicted).toBe(0);
    expect(result.merged).toBe(0);
    expect(consolidatedInto('a')).toBeNull();
    expect(consolidatedInto('b')).toBeNull();
  });

  it('logs the contradiction action distinctly from merge', async () => {
    seed({ id: 'good', quality: 0.9, embedding: oneHot(4) });
    seed({ id: 'bad', quality: 0.2, embedding: oneHot(4) });

    await consolidator.consolidateDomain('core');

    const log = db.prepare("SELECT action, source_ids, target_id FROM experience_consolidation_log WHERE action = 'contradiction'").get() as
      { action: string; source_ids: string; target_id: string } | undefined;
    expect(log?.action).toBe('contradiction');
    expect(JSON.parse(log!.source_ids)).toContain('bad');
    expect(log!.target_id).toBe('good');
  });
});
