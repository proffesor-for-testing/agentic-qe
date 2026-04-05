/**
 * Agentic QE v3 — Hyperbolic HNSW Unit Tests (ADR-087 Milestone 5, R14)
 *
 * Tests for HyperbolicHNSW + PoincareOperations: distance symmetry,
 * non-negativity, ball projection, k-NN search, embedHierarchy properties,
 * and feature flags.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HyperbolicHNSW,
  PoincareOperations,
  createHyperbolicHNSW,
} from '../../../../src/integrations/ruvector/hyperbolic-hnsw';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../../src/integrations/ruvector/feature-flags';

/** Create a random Float32Array with values in [-scale, scale]. */
function randomVec(dim: number, scale = 0.5): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    v[i] = (Math.random() * 2 - 1) * scale;
  }
  return v;
}

/** Compute L2 norm of a Float32Array. */
function norm(v: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

describe('PoincareOperations', () => {
  const DIM = 8;

  // 1. Poincare distance is symmetric
  it('should compute symmetric Poincare distance', () => {
    const a = randomVec(DIM, 0.4);
    const b = randomVec(DIM, 0.4);

    const dAB = PoincareOperations.poincareDistance(a, b);
    const dBA = PoincareOperations.poincareDistance(b, a);

    expect(dAB).toBeCloseTo(dBA, 10);
  });

  // 2. Poincare distance is non-negative
  it('should compute non-negative Poincare distance', () => {
    const a = randomVec(DIM, 0.3);
    const b = randomVec(DIM, 0.3);

    const d = PoincareOperations.poincareDistance(a, b);
    expect(d).toBeGreaterThanOrEqual(0);
  });

  // 3. Distance from a point to itself is zero
  it('should return zero distance for identical points', () => {
    const a = randomVec(DIM, 0.3);
    const d = PoincareOperations.poincareDistance(a, a);
    expect(d).toBeCloseTo(0, 8);
  });

  // 4. Project keeps points inside ball (norm < 1)
  it('should project points to inside the Poincare ball', () => {
    // Point outside the ball
    const outside = new Float32Array(DIM);
    for (let i = 0; i < DIM; i++) outside[i] = 2.0;

    const projected = PoincareOperations.project(outside);
    expect(norm(projected)).toBeLessThan(1);
  });

  it('should not modify points already inside the ball', () => {
    const inside = randomVec(DIM, 0.3);
    const projected = PoincareOperations.project(inside);

    for (let i = 0; i < DIM; i++) {
      expect(projected[i]).toBeCloseTo(inside[i], 8);
    }
  });

  // 5. euclideanToHyperbolic maps to inside ball
  it('should map Euclidean points into the ball', () => {
    const euclidean = new Float32Array(DIM);
    for (let i = 0; i < DIM; i++) euclidean[i] = 10.0;

    const hyp = PoincareOperations.euclideanToHyperbolic(euclidean);
    expect(norm(hyp)).toBeLessThan(1);
  });

  // 6. Mobius addition stays in ball
  it('should keep Mobius addition result inside the ball', () => {
    const a = randomVec(DIM, 0.4);
    const b = randomVec(DIM, 0.4);

    const result = PoincareOperations.mobiusAdd(a, b);
    expect(norm(result)).toBeLessThan(1);
  });

  // 7. expMap stays in ball
  it('should keep expMap result inside the ball', () => {
    const base = randomVec(DIM, 0.3);
    const tangent = randomVec(DIM, 0.5);

    const result = PoincareOperations.expMap(base, tangent);
    expect(norm(result)).toBeLessThan(1);
  });

  // 8. Zero vector maps to zero
  it('should handle zero vector in euclideanToHyperbolic', () => {
    const zero = new Float32Array(DIM);
    const result = PoincareOperations.euclideanToHyperbolic(zero);
    expect(norm(result)).toBeCloseTo(0, 8);
  });
});

describe('HyperbolicHNSW', () => {
  const DIM = 8;
  let hnsw: HyperbolicHNSW;

  beforeEach(() => {
    setRuVectorFeatureFlags({ useHyperbolicHnsw: true });
    hnsw = new HyperbolicHNSW({ dimensions: DIM });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  // 9. Insert and search returns correct nearest neighbors
  it('should return correct nearest neighbors', () => {
    // Insert three points: one near origin, two near boundary
    const nearOrigin = new Float32Array(DIM);
    nearOrigin[0] = 0.1;

    const farA = new Float32Array(DIM);
    farA[0] = 0.9;

    const farB = new Float32Array(DIM);
    farB[1] = 0.9;

    hnsw.insert('near', nearOrigin);
    hnsw.insert('farA', farA);
    hnsw.insert('farB', farB);

    // Query near the origin — should find 'near' first
    const query = new Float32Array(DIM);
    query[0] = 0.05;

    const results = hnsw.search(query, 2);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('near');
  });

  // 10. Search returns k results sorted by distance
  it('should return k results sorted by ascending distance', () => {
    for (let i = 0; i < 10; i++) {
      const coords = new Float32Array(DIM);
      coords[0] = i * 0.08;
      hnsw.insert(`p${i}`, coords);
    }

    const query = new Float32Array(DIM);
    const results = hnsw.search(query, 5);

    expect(results.length).toBe(5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
    }
  });

  // 11. embedHierarchy: parent-child distance < sibling distance
  it('should produce parent-child distance < sibling distance in hierarchy', () => {
    const nodes = [
      { id: 'root', features: new Float32Array(DIM) },
      { id: 'child1', parentId: 'root', features: new Float32Array(DIM) },
      { id: 'child2', parentId: 'root', features: new Float32Array(DIM) },
    ];

    const embeddings = hnsw.embedHierarchy(nodes);
    expect(embeddings.size).toBe(3);

    const rootCoords = embeddings.get('root')!;
    const child1Coords = embeddings.get('child1')!;
    const child2Coords = embeddings.get('child2')!;

    const parentChildDist = PoincareOperations.poincareDistance(rootCoords, child1Coords);
    const siblingDist = PoincareOperations.poincareDistance(child1Coords, child2Coords);

    expect(parentChildDist).toBeLessThan(siblingDist);
  });

  // 12. embedHierarchy: root is near origin
  it('should place root near the origin in hierarchy embedding', () => {
    const nodes = [
      { id: 'root', features: new Float32Array(DIM) },
      { id: 'child', parentId: 'root', features: new Float32Array(DIM) },
      { id: 'grandchild', parentId: 'child', features: new Float32Array(DIM) },
    ];

    const embeddings = hnsw.embedHierarchy(nodes);
    const rootCoords = embeddings.get('root')!;
    const grandchildCoords = embeddings.get('grandchild')!;

    // Root should be closer to origin than grandchild
    expect(norm(rootCoords)).toBeLessThan(norm(grandchildCoords));
  });

  // 13. Feature flag disabled -> factory returns null
  it('should return null from factory when feature flag is disabled', () => {
    setRuVectorFeatureFlags({ useHyperbolicHnsw: false });
    const result = createHyperbolicHNSW();
    expect(result).toBeNull();
  });

  // 14. Feature flag enabled -> factory returns instance
  it('should return HyperbolicHNSW from factory when feature flag is enabled', () => {
    setRuVectorFeatureFlags({ useHyperbolicHnsw: true });
    const result = createHyperbolicHNSW({ dimensions: DIM });
    expect(result).toBeInstanceOf(HyperbolicHNSW);
  });

  // 15. Single point search
  it('should handle single-point search', () => {
    const coords = new Float32Array(DIM);
    coords[0] = 0.5;
    hnsw.insert('only', coords);

    const results = hnsw.search(coords, 5);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('only');
    expect(results[0].distance).toBeCloseTo(0, 5);
  });

  // 16. Duplicate IDs overwrite
  it('should overwrite point with duplicate ID', () => {
    const coords1 = new Float32Array(DIM);
    coords1[0] = 0.1;
    hnsw.insert('dup', coords1);

    const coords2 = new Float32Array(DIM);
    coords2[0] = 0.9;
    hnsw.insert('dup', coords2);

    const stats = hnsw.getStats();
    expect(stats.elementCount).toBe(1);

    // Search should find the updated coordinates
    const query = new Float32Array(DIM);
    query[0] = 0.85;
    const results = hnsw.search(query, 1);
    expect(results[0].id).toBe('dup');
  });

  // 17. Dimension mismatch errors
  it('should throw on insert dimension mismatch', () => {
    expect(() => {
      hnsw.insert('bad', new Float32Array(DIM + 5));
    }).toThrow('Dimension mismatch');
  });

  it('should throw on search dimension mismatch', () => {
    expect(() => {
      hnsw.search(new Float32Array(DIM + 5), 1);
    }).toThrow('Query dimension mismatch');
  });

  // 18. Config validation
  it('should reject non-positive dimensions', () => {
    expect(() => new HyperbolicHNSW({ dimensions: 0 })).toThrow('dimensions must be positive');
  });

  it('should reject non-negative curvature', () => {
    expect(() => new HyperbolicHNSW({ curvature: 0 })).toThrow('curvature must be negative');
    expect(() => new HyperbolicHNSW({ curvature: 1 })).toThrow('curvature must be negative');
  });

  // 19. getStats returns correct values
  it('should report correct stats', () => {
    const stats0 = hnsw.getStats();
    expect(stats0.elementCount).toBe(0);
    expect(stats0.dimensions).toBe(DIM);
    expect(stats0.curvature).toBe(-1.0);

    hnsw.insert('a', randomVec(DIM, 0.3));
    hnsw.insert('b', randomVec(DIM, 0.3));

    const stats1 = hnsw.getStats();
    expect(stats1.elementCount).toBe(2);
  });

  // 20. embedHierarchy with empty input
  it('should return empty map for empty hierarchy', () => {
    const result = hnsw.embedHierarchy([]);
    expect(result.size).toBe(0);
  });
});
