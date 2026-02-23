/**
 * Tests for RvfNativeAdapter — exercises the real @ruvector/rvf-node binding.
 *
 * All RVF files are created under /tmp and cleaned up in afterAll.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import {
  createRvfStore,
  openRvfStore,
  isRvfNativeAvailable,
  type RvfNativeAdapter,
} from '../../../../src/integrations/ruvector/rvf-native-adapter';

const DIM = 8;
const PREFIX = `/tmp/rvf-adapter-test-${process.pid}`;

/** Generate a random Float32Array of given dimension */
function randomVec(dim: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.random();
  return v;
}

/** Deterministic unit vector with 1.0 at position `axis` */
function basisVec(dim: number, axis: number): Float32Array {
  const v = new Float32Array(dim);
  v[axis % dim] = 1.0;
  return v;
}

// Track all paths for cleanup
const filesToClean: string[] = [];
function trackPath(p: string): string {
  filesToClean.push(p);
  filesToClean.push(`${p}.idmap.json`);
  return p;
}

afterAll(() => {
  for (const f of filesToClean) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      // best-effort cleanup
    }
  }
});

// ---------------------------------------------------------------------------
// Skip entire suite if the native binding is not available on this platform
// ---------------------------------------------------------------------------

const available = isRvfNativeAvailable();

describe.skipIf(!available)('RvfNativeAdapter', () => {
  // ---- 1. Create, ingest, verify status -----------------------------------
  it('should ingest 10 vectors and report correct totalVectors', () => {
    const storePath = trackPath(`${PREFIX}-ingest.rvf`);
    const store = createRvfStore(storePath, DIM);

    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `pattern-${i}`,
      vector: randomVec(DIM),
    }));

    const result = store.ingest(entries);
    expect(result.accepted).toBe(10);
    expect(result.rejected).toBe(0);

    const s = store.status();
    expect(s.totalVectors).toBe(10);

    store.close();
  });

  // ---- 2. Search returns string IDs (not numeric labels) ------------------
  it('should return string IDs in search results', () => {
    const storePath = trackPath(`${PREFIX}-search.rvf`);
    const store = createRvfStore(storePath, DIM);

    store.ingest([
      { id: 'alpha', vector: basisVec(DIM, 0) },
      { id: 'beta', vector: basisVec(DIM, 1) },
      { id: 'gamma', vector: basisVec(DIM, 2) },
    ]);

    const results = store.search(basisVec(DIM, 0), 2);
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Closest to basis-0 should be 'alpha'
    expect(results[0].id).toBe('alpha');
    expect(results[0].distance).toBe(0);
    expect(results[0].score).toBe(1); // 1 / (1 + 0)
    // All IDs should be strings
    for (const r of results) {
      expect(typeof r.id).toBe('string');
      expect(typeof r.distance).toBe('number');
      expect(typeof r.score).toBe('number');
    }

    store.close();
  });

  // ---- 3. ID mapping persists across close/reopen -------------------------
  it('should persist ID mapping across close and reopen', () => {
    const storePath = trackPath(`${PREFIX}-persist.rvf`);
    const store1 = createRvfStore(storePath, DIM);

    store1.ingest([
      { id: 'persist-a', vector: basisVec(DIM, 0) },
      { id: 'persist-b', vector: basisVec(DIM, 1) },
    ]);
    store1.close();

    // Reopen
    const store2 = openRvfStore(storePath);
    const results = store2.search(basisVec(DIM, 0), 2);
    expect(results[0].id).toBe('persist-a');

    // Insert more — labels should not collide
    store2.ingest([{ id: 'persist-c', vector: basisVec(DIM, 2) }]);
    expect(store2.size()).toBe(3);

    const all = store2.search(basisVec(DIM, 2), 1);
    expect(all[0].id).toBe('persist-c');

    store2.close();
  });

  // ---- 4. Fork creates independent copy -----------------------------------
  it('should fork into an independent copy', () => {
    const parentPath = trackPath(`${PREFIX}-fork-parent.rvf`);
    const childPath = trackPath(`${PREFIX}-fork-child.rvf`);

    const parent = createRvfStore(parentPath, DIM);
    parent.ingest([
      { id: 'shared-1', vector: basisVec(DIM, 0) },
      { id: 'shared-2', vector: basisVec(DIM, 1) },
    ]);

    const child = parent.fork(childPath);

    // Child has same data
    expect(child.size()).toBe(2);
    const childResults = child.search(basisVec(DIM, 0), 1);
    expect(childResults[0].id).toBe('shared-1');

    // Add to child only
    child.ingest([{ id: 'child-only', vector: basisVec(DIM, 3) }]);
    expect(child.size()).toBe(3);
    // Parent unchanged
    expect(parent.size()).toBe(2);

    // Add to parent only
    parent.ingest([{ id: 'parent-only', vector: basisVec(DIM, 4) }]);
    expect(parent.size()).toBe(3);
    // Child unchanged
    expect(child.size()).toBe(3);

    child.close();
    parent.close();
  });

  // ---- 5. Delete removes vectors -----------------------------------------
  it('should delete vectors so they no longer appear in search', () => {
    const storePath = trackPath(`${PREFIX}-delete.rvf`);
    const store = createRvfStore(storePath, DIM);

    store.ingest([
      { id: 'keep', vector: basisVec(DIM, 0) },
      { id: 'remove', vector: basisVec(DIM, 1) },
      { id: 'also-keep', vector: basisVec(DIM, 2) },
    ]);
    expect(store.size()).toBe(3);

    const deleted = store.delete(['remove']);
    expect(deleted).toBe(1);

    // 'remove' should no longer appear
    const results = store.search(basisVec(DIM, 1), 3);
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain('remove');

    store.close();
  });

  // ---- 6. Witness chain is valid ------------------------------------------
  it('should have a valid witness chain after operations', () => {
    const storePath = trackPath(`${PREFIX}-witness.rvf`);
    const store = createRvfStore(storePath, DIM);

    store.ingest([
      { id: 'w1', vector: randomVec(DIM) },
      { id: 'w2', vector: randomVec(DIM) },
    ]);
    store.delete(['w1']);
    store.ingest([{ id: 'w3', vector: randomVec(DIM) }]);

    const s = store.status();
    expect(s.witnessValid).toBe(true);
    expect(s.witnessEntries).toBeGreaterThan(0);

    store.close();
  });

  // ---- 7. isRvfNativeAvailable returns true -------------------------------
  it('should report native binding as available', () => {
    expect(isRvfNativeAvailable()).toBe(true);
  });

  // ---- 8. Dimension and size accessors ------------------------------------
  it('should expose dimension() and size() correctly', () => {
    const storePath = trackPath(`${PREFIX}-accessors.rvf`);
    const store = createRvfStore(storePath, DIM);

    expect(store.dimension()).toBe(DIM);
    expect(store.size()).toBe(0);
    expect(store.isOpen()).toBe(true);
    expect(store.path()).toBe(storePath);

    store.ingest([{ id: 'x', vector: randomVec(DIM) }]);
    expect(store.size()).toBe(1);

    store.close();
    expect(store.isOpen()).toBe(false);

    // Operations on closed store should throw
    expect(() => store.size()).toThrow('closed');
  });
});
