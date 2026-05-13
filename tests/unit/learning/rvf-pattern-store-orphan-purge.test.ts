/**
 * Regression: issue #462
 *
 * patterns.rvf is a persistent HNSW binary that accumulates vectors across
 * upgrades. When an upgrade rewrites qe_patterns via INSERT OR REPLACE
 * without calling RvfPatternStore.delete() on the old IDs, orphan vectors
 * remain in the file forever. They win cosine-similarity matches and route
 * to non-existent pattern IDs, so getPattern() returns null and learning
 * writes fail silently.
 *
 * RvfPatternStore.initialize() now compares adapter.status().totalVectors
 * with sqliteStore.getStats().totalPatterns; if RVF > DB, it reads the
 * idmap.json sidecar, diffs the IDs, and deletes the orphans. This test
 * exercises that path against a tiny fake adapter + fake sqlite store.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RvfPatternStore } from '../../../src/learning/rvf-pattern-store.js';
import type { RvfNativeAdapter, RvfStatus } from '../../../src/integrations/ruvector/rvf-native-adapter.js';

function makeFakeAdapter(totalVectors: number): {
  adapter: RvfNativeAdapter;
  deleteSpy: ReturnType<typeof vi.fn>;
} {
  const deleteSpy = vi.fn((_ids: string[]) => _ids.length);
  const status: RvfStatus = {
    totalVectors,
    totalSegments: 1,
    fileSizeBytes: 0,
    epoch: 0,
    witnessValid: true,
    witnessEntries: 0,
  };
  const adapter: Partial<RvfNativeAdapter> = {
    status: () => status,
    delete: deleteSpy as RvfNativeAdapter['delete'],
    close: () => undefined,
    isOpen: () => true,
    path: () => '',
    dimension: () => 384,
    size: () => totalVectors,
    compact: () => undefined,
    fork: vi.fn() as unknown as RvfNativeAdapter['fork'],
    ingest: () => ({ accepted: 0, rejected: 0 }),
    search: () => [],
    embedKernel: () => 0,
    extractKernel: () => null,
    verifyWitness: () => ({ verified: true, supported: true, error: null }) as ReturnType<RvfNativeAdapter['verifyWitness']>,
    sign: () => null,
    fileId: () => null,
    parentId: () => null,
    lineageDepth: () => 0,
    indexStats: () => ({ layers: 1, nodes: totalVectors, avgConnections: 0, idMapSize: totalVectors }),
  };
  return { adapter: adapter as RvfNativeAdapter, deleteSpy };
}

function makeFakeSqliteStore(totalPatterns: number, ids: string[]) {
  return {
    initialize: async () => undefined,
    getStats: () => ({
      totalPatterns,
      byDomain: {} as Record<string, number>,
      byTier: {} as Record<string, number>,
    }),
    getPatterns: (_opts: { limit?: number } = {}) =>
      ids.map((id) => ({ id }) as unknown),
  };
}

describe('RvfPatternStore purges orphan vectors on init (#462)', () => {
  let tmpDir: string;
  let rvfPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-rvf-orphan-'));
    rvfPath = path.join(tmpDir, 'patterns.rvf');
    // A bare placeholder so any future fs check on the file passes.
    fs.writeFileSync(rvfPath, '');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  const writeIdmap = (ids: string[]): void => {
    fs.writeFileSync(
      `${rvfPath}.idmap.json`,
      JSON.stringify({
        nextLabel: ids.length + 1,
        entries: ids.map((id, i) => [id, i + 1]),
      }),
    );
  };

  it('deletes RVF IDs that have no matching qe_patterns row', async () => {
    // Idmap has 5 entries; DB only knows about 3 → 2 orphans expected
    writeIdmap(['keep-1', 'orphan-a', 'keep-2', 'orphan-b', 'keep-3']);

    const { adapter, deleteSpy } = makeFakeAdapter(5);
    const store = new RvfPatternStore(() => adapter, { rvfPath });
    // Inject a fake sqlite store so the init-time auto-attach is skipped.
    store.setSqliteStore(
      makeFakeSqliteStore(3, ['keep-1', 'keep-2', 'keep-3']) as unknown as Parameters<
        typeof store.setSqliteStore
      >[0],
    );

    await store.initialize();

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    const [args] = deleteSpy.mock.calls[0];
    expect((args as string[]).sort()).toEqual(['orphan-a', 'orphan-b']);
  });

  it('does NOT call delete when RVF and DB counts match', async () => {
    writeIdmap(['p1', 'p2', 'p3']);
    const { adapter, deleteSpy } = makeFakeAdapter(3);

    const store = new RvfPatternStore(() => adapter, { rvfPath });
    store.setSqliteStore(
      makeFakeSqliteStore(3, ['p1', 'p2', 'p3']) as unknown as Parameters<
        typeof store.setSqliteStore
      >[0],
    );

    await store.initialize();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('does NOT call delete when RVF has fewer rows than DB (under-indexed)', async () => {
    writeIdmap(['p1']);
    const { adapter, deleteSpy } = makeFakeAdapter(1);

    const store = new RvfPatternStore(() => adapter, { rvfPath });
    store.setSqliteStore(
      makeFakeSqliteStore(5, ['p1', 'p2', 'p3', 'p4', 'p5']) as unknown as Parameters<
        typeof store.setSqliteStore
      >[0],
    );

    await store.initialize();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('fails open when the idmap file is missing', async () => {
    // RVF has 5 vectors, DB has 3, but idmap.json doesn't exist.
    // Purge cannot compute orphans without idmap — skip silently.
    const { adapter, deleteSpy } = makeFakeAdapter(5);

    const store = new RvfPatternStore(() => adapter, { rvfPath });
    store.setSqliteStore(
      makeFakeSqliteStore(3, ['p1', 'p2', 'p3']) as unknown as Parameters<
        typeof store.setSqliteStore
      >[0],
    );

    await store.initialize();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('fails open when the idmap is corrupted JSON', async () => {
    fs.writeFileSync(`${rvfPath}.idmap.json`, '{not-valid-json');
    const { adapter, deleteSpy } = makeFakeAdapter(5);

    const store = new RvfPatternStore(() => adapter, { rvfPath });
    store.setSqliteStore(
      makeFakeSqliteStore(3, ['p1', 'p2', 'p3']) as unknown as Parameters<
        typeof store.setSqliteStore
      >[0],
    );

    await expect(store.initialize()).resolves.toBeUndefined();
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
