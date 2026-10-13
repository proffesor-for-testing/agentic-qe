/**
 * #981 review B2: `aqe learning backfill-embeddings` writes vectors only to
 * SQLite (qe_pattern_embeddings). The RVF re-ingest ran only while
 * patterns.rvf was EMPTY, so once one pattern had been learned with an
 * embedder, every backfilled pattern stayed lexical-only.
 *
 * reconcileRvfWithSqlite ingests exactly the SQLite vectors in the active
 * embedding space that the RVF index does not hold yet.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconcileRvfWithSqlite } from '../../../src/learning/rvf-reconcile.js';
import {
  createRvfStore,
  isRvfNativeAvailable,
} from '../../../src/integrations/ruvector/rvf-native-adapter.js';

const vec = (seed: number, dim = 8) => Array.from({ length: dim }, (_, i) => Math.sin(seed + i));

function fakeSqlite(rows: Array<{ patternId: string; spaceId: string | null; embedding: number[] }>) {
  return {
    getEmbeddingIdsInSpace: vi.fn((space: string) => rows.filter((r) => r.spaceId === space).map((r) => r.patternId)),
    getEmbeddingsByIds: vi.fn((ids: string[]) =>
      rows.filter((r) => ids.includes(r.patternId)).map(({ patternId, embedding }) => ({ patternId, embedding })),
    ),
  };
}

describe('reconcileRvfWithSqlite (#981 review B2)', () => {
  it('ingests only the active-space vectors the RVF index is missing', () => {
    const held = new Set(['already']);
    const adapter = {
      has: vi.fn((id: string) => held.has(id)),
      ingest: vi.fn((entries: Array<{ id: string }>) => ({ accepted: entries.length, rejected: 0 })),
    };
    const sqlite = fakeSqlite([
      { patternId: 'already', spaceId: 'space-a', embedding: vec(1) },
      { patternId: 'backfilled-1', spaceId: 'space-a', embedding: vec(2) },
      { patternId: 'backfilled-2', spaceId: 'space-a', embedding: vec(3) },
      { patternId: 'other-space', spaceId: 'space-b', embedding: vec(4) },
    ]);

    const result = reconcileRvfWithSqlite(adapter, sqlite, 'space-a', 1000);

    expect(result).toEqual({ missing: 2, ingested: 2, rejected: 0, capped: false });
    const ingested = adapter.ingest.mock.calls[0][0] as Array<{ id: string; vector: Float32Array }>;
    expect(ingested.map((e) => e.id)).toEqual(['backfilled-1', 'backfilled-2']);
    expect(ingested[0].vector).toBeInstanceOf(Float32Array);
  });

  it('is a no-op when the index already holds every vector (idempotent)', () => {
    const adapter = { has: () => true, ingest: vi.fn() };
    const sqlite = fakeSqlite([{ patternId: 'a', spaceId: 's', embedding: vec(1) }]);
    expect(reconcileRvfWithSqlite(adapter, sqlite, 's', 1000)).toEqual({ missing: 0, ingested: 0, rejected: 0, capped: false });
    expect(adapter.ingest).not.toHaveBeenCalled();
  });

  it('caps one pass to `limit` vectors', () => {
    const adapter = { has: () => false, ingest: vi.fn((e: unknown[]) => ({ accepted: e.length, rejected: 0 })) };
    const rows = Array.from({ length: 5 }, (_, i) => ({ patternId: `p${i}`, spaceId: 's', embedding: vec(i) }));
    const result = reconcileRvfWithSqlite(adapter, fakeSqlite(rows), 's', 2);
    expect(result).toEqual({ missing: 5, ingested: 2, rejected: 0, capped: true });
  });

  it('does nothing without a has() probe (cannot tell what the index holds)', () => {
    const adapter = { ingest: vi.fn() };
    const result = reconcileRvfWithSqlite(adapter, fakeSqlite([{ patternId: 'a', spaceId: 's', embedding: vec(1) }]), 's', 1000);
    expect(result).toEqual({ missing: 0, ingested: 0, rejected: 0, capped: false });
    expect(adapter.ingest).not.toHaveBeenCalled();
  });

  describe.runIf(isRvfNativeAvailable())('against a real RVF file', () => {
    const dirs: string[] = [];
    afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

    it('a non-empty index gains the backfilled vectors, and a second pass adds nothing', () => {
      const dir = mkdtempSync(join(tmpdir(), 'aqe-b2-rvf-'));
      dirs.push(dir);
      const adapter = createRvfStore(join(dir, 'patterns.rvf'), 8);
      try {
        adapter.ingest([{ id: 'learned-with-embedder', vector: new Float32Array(vec(9)) }]);
        expect(adapter.status().totalVectors).toBe(1);
        const sqlite = fakeSqlite([
          { patternId: 'learned-with-embedder', spaceId: 's', embedding: vec(9) },
          ...Array.from({ length: 4 }, (_, i) => ({ patternId: `text-only-${i}`, spaceId: 's', embedding: vec(i) })),
        ]);

        expect(reconcileRvfWithSqlite(adapter, sqlite, 's', 1000)).toMatchObject({ missing: 4, ingested: 4 });
        expect(adapter.status().totalVectors).toBe(5);
        expect(adapter.search(vec(2), 1)[0]?.id).toBe('text-only-2');

        expect(reconcileRvfWithSqlite(adapter, sqlite, 's', 1000)).toMatchObject({ missing: 0, ingested: 0 });
        expect(adapter.status().totalVectors).toBe(5);
      } finally {
        adapter.close();
      }
      expect(existsSync(join(dir, 'patterns.rvf'))).toBe(true);
    });
  });
});
