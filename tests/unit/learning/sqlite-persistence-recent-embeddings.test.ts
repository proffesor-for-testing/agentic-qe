/**
 * Test for SQLitePatternStore.getRecentEmbeddings() — the bounded backfill
 * helper introduced to prevent runaway patterns.rvf regrowth after a manual
 * truncation. Exercises:
 *   - the LIMIT is respected
 *   - ordering is most-recently-used first
 *   - degraded inputs (limit <= 0 or NaN) fall back to a safe default
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { createSQLitePatternStore } from '../../../src/learning/sqlite-persistence.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';

function makePattern(id: string, lastUsedDaysAgo: number): QEPattern {
  return {
    id,
    patternType: 'test-template',
    qeDomain: 'test-generation',
    domain: 'test-generation',
    name: `Pattern ${id}`,
    description: 'fixture pattern',
    confidence: 0.7,
    usageCount: 1,
    successRate: 1,
    qualityScore: 0.7,
    context: { tags: [] },
    template: { type: 'code', content: 'noop', variables: [] },
    embedding: Array.from({ length: 8 }, (_, i) => i / 10),
    tier: 'short-term',
    createdAt: new Date(Date.now() - lastUsedDaysAgo * 24 * 3600 * 1000),
    lastUsedAt: new Date(Date.now() - lastUsedDaysAgo * 24 * 3600 * 1000),
    successfulUses: 0,
    reusable: false,
    reuseCount: 0,
    averageTokenSavings: 0,
  } as QEPattern;
}

describe('SQLitePatternStore.getRecentEmbeddings()', () => {
  let tmp: string;
  let dbPath: string;

  beforeEach(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), 'aqe-recent-emb-'));
    dbPath = path.join(tmp, 'memory.db');
    // Pre-warm so the file exists and is openable
    new Database(dbPath).close();
  });

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch { /* best-effort cleanup */ }
  });

  it('respects the limit when more rows exist', async () => {
    const store = createSQLitePatternStore({ dbPath, useUnified: false });
    await store.initialize();

    for (let i = 0; i < 25; i++) {
      const p = makePattern(`p-${i}`, i);
      store.storePattern(p, p.embedding);
    }

    const recent = store.getRecentEmbeddings(10);
    expect(recent).toHaveLength(10);
    expect(recent.every((r) => Array.isArray(r.embedding) && r.embedding.length === 8)).toBe(true);
  });

  it('orders by most-recently-used first', async () => {
    const store = createSQLitePatternStore({ dbPath, useUnified: false });
    await store.initialize();

    // Insert in arbitrary order
    store.storePattern(makePattern('p-2', 2), makePattern('p-2', 2).embedding);
    store.storePattern(makePattern('p-0', 0), makePattern('p-0', 0).embedding);
    store.storePattern(makePattern('p-1', 1), makePattern('p-1', 1).embedding);

    // storePattern() does not populate last_used_at (that column tracks usage,
    // not creation). Set it explicitly here so the ORDER BY has deterministic
    // input. In production, recordUsage() bumps this column on every hit, so
    // the ordering reflects real activity.
    const raw = new Database(dbPath);
    raw.prepare(`UPDATE qe_patterns SET last_used_at = ? WHERE id = ?`).run('2026-05-18T12:00:00Z', 'p-0');
    raw.prepare(`UPDATE qe_patterns SET last_used_at = ? WHERE id = ?`).run('2026-05-17T12:00:00Z', 'p-1');
    raw.prepare(`UPDATE qe_patterns SET last_used_at = ? WHERE id = ?`).run('2026-05-16T12:00:00Z', 'p-2');
    raw.close();

    const recent = store.getRecentEmbeddings(3);
    expect(recent.map((r) => r.patternId)).toEqual(['p-0', 'p-1', 'p-2']);
  });

  it('caps to a safe default when limit is non-positive or NaN', async () => {
    const store = createSQLitePatternStore({ dbPath, useUnified: false });
    await store.initialize();

    for (let i = 0; i < 5; i++) {
      const p = makePattern(`p-${i}`, i);
      store.storePattern(p, p.embedding);
    }

    // Negative / NaN should fall back to the 1000 default — i.e. return all 5.
    expect(store.getRecentEmbeddings(-1)).toHaveLength(5);
    expect(store.getRecentEmbeddings(Number.NaN)).toHaveLength(5);
  });

  it('returns an empty array when the table has no embeddings', async () => {
    const store = createSQLitePatternStore({ dbPath, useUnified: false });
    await store.initialize();

    expect(store.getRecentEmbeddings(10)).toEqual([]);
  });
});
