/**
 * RVF Native Wiring Integration Test
 *
 * Verifies that the RVF native adapter and dual-writer are properly wired
 * into the AQE integration points:
 *   1. isRvfNativeAvailable() returns true
 *   2. createRvfStore() creates a real .rvf file
 *   3. Ingest + search with string IDs works correctly
 *   4. Fork creates an independent copy
 *   5. Exports are accessible from the ruvector index
 *   6. Cleanup /tmp files
 */

import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, unlinkSync } from 'fs';

// Import from the ruvector barrel to verify wiring
import {
  isRvfNativeAvailable,
  createRvfStore,
  openRvfStore,
  RvfDualWriter,
  createDualWriter,
} from '../../src/integrations/ruvector/index.js';

// Also import the adapter directly to verify module works standalone
import {
  isRvfNativeAvailable as isAvailableDirect,
  createRvfStore as createStoreDirect,
} from '../../src/integrations/ruvector/rvf-native-adapter.js';

// ============================================================================
// Cleanup tracking
// ============================================================================

const tmpFiles: string[] = [];

function tmpPath(name: string): string {
  const p = `/tmp/rvf-wiring-test-${name}-${Date.now()}.rvf`;
  tmpFiles.push(p);
  return p;
}

afterAll(() => {
  for (const p of tmpFiles) {
    try { if (existsSync(p)) unlinkSync(p); } catch { /* best effort */ }
    // Also clean up the sidecar .idmap.json files
    try { if (existsSync(p + '.idmap.json')) unlinkSync(p + '.idmap.json'); } catch { /* best effort */ }
  }
});

// ============================================================================
// Tests
// ============================================================================

describe('RVF Native Wiring Integration', () => {
  // --------------------------------------------------------------------------
  // 1. Availability
  // --------------------------------------------------------------------------

  it('isRvfNativeAvailable() returns true when @ruvector/rvf-node is installed', () => {
    expect(isRvfNativeAvailable()).toBe(true);
    // Verify direct import matches barrel export
    expect(isAvailableDirect()).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 2. Create store
  // --------------------------------------------------------------------------

  it('createRvfStore() creates a real .rvf file on disk', () => {
    const path = tmpPath('create');
    const store = createRvfStore(path, 8);

    expect(existsSync(path)).toBe(true);
    expect(store.dimension()).toBe(8);
    expect(store.size()).toBe(0);

    store.close();
  });

  // --------------------------------------------------------------------------
  // 3. Ingest and search with string IDs
  // --------------------------------------------------------------------------

  it('ingest 5 vectors with string IDs and search returns correct results', () => {
    const path = tmpPath('ingest-search');
    const dim = 4;
    const store = createStoreDirect(path, dim);

    // Ingest 5 vectors with string IDs
    const vectors = [
      { id: 'alpha',   vector: [1, 0, 0, 0] },
      { id: 'beta',    vector: [0, 1, 0, 0] },
      { id: 'gamma',   vector: [0, 0, 1, 0] },
      { id: 'delta',   vector: [0, 0, 0, 1] },
      { id: 'epsilon', vector: [1, 1, 0, 0] },
    ];

    for (const v of vectors) {
      const result = store.ingest([{ id: v.id, vector: new Float32Array(v.vector) }]);
      expect(result.accepted).toBe(1);
      expect(result.rejected).toBe(0);
    }

    expect(store.size()).toBe(5);

    // Search for vector closest to [1, 0, 0, 0] -- should return 'alpha' first
    const results = store.search(new Float32Array([1, 0, 0, 0]), 3);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('alpha');
    expect(results[0].distance).toBe(0); // exact match = distance 0

    // All returned IDs should be strings from our input set
    const validIds = new Set(vectors.map(v => v.id));
    for (const r of results) {
      expect(validIds.has(r.id)).toBe(true);
    }

    store.close();
  });

  // --------------------------------------------------------------------------
  // 4. Fork creates independent copy
  // --------------------------------------------------------------------------

  it('fork() creates an independent copy that can be modified independently', () => {
    const parentPath = tmpPath('fork-parent');
    const childPath = tmpPath('fork-child');

    const parent = createStoreDirect(parentPath, 4);

    // Add a vector to parent
    parent.ingest([{ id: 'parent-vec', vector: new Float32Array([1, 0, 0, 0]) }]);
    expect(parent.size()).toBe(1);

    // Fork
    const child = parent.fork(childPath);

    expect(existsSync(childPath)).toBe(true);
    // Child should have the parent's data (file copy includes vectors)
    expect(child.size()).toBe(1);

    // Add a vector to child only
    child.ingest([{ id: 'child-vec', vector: new Float32Array([0, 1, 0, 0]) }]);
    expect(child.size()).toBe(2);

    // Parent should still have only 1 vector (independent stores)
    expect(parent.size()).toBe(1);

    // Search in child should find both vectors
    const childResults = child.search(new Float32Array([0, 1, 0, 0]), 2);
    expect(childResults.length).toBe(2);
    expect(childResults[0].id).toBe('child-vec');

    parent.close();
    child.close();
  });

  // --------------------------------------------------------------------------
  // 5. Exports accessible from ruvector index
  // --------------------------------------------------------------------------

  it('all RVF exports are accessible from the ruvector barrel index', () => {
    // Factory functions
    expect(typeof isRvfNativeAvailable).toBe('function');
    expect(typeof createRvfStore).toBe('function');
    expect(typeof openRvfStore).toBe('function');

    // Dual-writer
    expect(typeof RvfDualWriter).toBe('function');
    expect(typeof createDualWriter).toBe('function');
  });

  // --------------------------------------------------------------------------
  // 6. Store status includes witness info
  // --------------------------------------------------------------------------

  it('store status reports witness segments and file metadata', () => {
    const path = tmpPath('status');
    const store = createStoreDirect(path, 4);

    store.ingest([{ id: 'status-vec', vector: new Float32Array([1, 0, 0, 0]) }]);

    const s = store.status();
    expect(s.totalVectors).toBe(1);
    expect(s.totalSegments).toBeGreaterThan(0);
    expect(s.fileSizeBytes).toBeGreaterThan(0);
    expect(s.epoch).toBeGreaterThanOrEqual(0);
    expect(typeof s.witnessValid).toBe('boolean');
    expect(typeof s.witnessEntries).toBe('number');

    store.close();
  });
});
