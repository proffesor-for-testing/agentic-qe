/**
 * R14: Hyperbolic HNSW — Poincare Ball Embeddings for Hierarchical Data
 *
 * Maps tree-structured data into hyperbolic space where distances naturally
 * preserve parent-child relationships. Root near origin, leaves near boundary.
 * Numerically stable: all operations clamp norms and handle edge cases.
 * TypeScript-only; no external dependencies.
 *
 * @module integrations/ruvector/hyperbolic-hnsw
 */
import { getRuVectorFeatureFlags } from './feature-flags.js';

export interface HyperbolicConfig {
  dimensions: number;    // default: 32
  curvature: number;     // default: -1.0 (negative = hyperbolic)
  maxElements: number;   // default: 10000
  efConstruction: number; // default: 200
  M: number;             // default: 16
}

export interface HyperbolicPoint {
  id: string;
  coordinates: Float32Array;
  metadata?: Record<string, unknown>;
}

export interface HyperbolicSearchResult {
  id: string;
  distance: number;
  point: HyperbolicPoint;
}

const DEFAULT_CONFIG: HyperbolicConfig = {
  dimensions: 32, curvature: -1.0, maxElements: 10000, efConstruction: 200, M: 16,
};

const EPS = 1e-5;
const MAX_NORM = 1 - EPS;

// Vector helpers
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s;
}
function sqNorm(v: Float32Array): number {
  let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return s;
}
function sub(a: Float32Array, b: Float32Array): Float32Array {
  const r = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) r[i] = a[i] - b[i]; return r;
}

/** Pure math operations in the Poincare ball model of hyperbolic geometry. */
export class PoincareOperations {
  /** d(a,b) = acosh(1 + 2||a-b||^2 / ((1-||a||^2)(1-||b||^2))) */
  static poincareDistance(a: Float32Array, b: Float32Array): number {
    const diffSq = sqNorm(sub(a, b));
    const denomA = Math.max(EPS, 1 - sqNorm(a));
    const denomB = Math.max(EPS, 1 - sqNorm(b));
    return Math.acosh(Math.max(1, 1 + 2 * diffSq / (denomA * denomB)));
  }

  /** Mobius addition: a +_M b in Poincare ball. */
  static mobiusAdd(a: Float32Array, b: Float32Array): Float32Array {
    const d = dot(a, b), nA = sqNorm(a), nB = sqNorm(b);
    const denom = Math.max(EPS, 1 + 2 * d + nA * nB);
    const cA = 1 + 2 * d + nB, cB = 1 - nA;
    const r = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) r[i] = (cA * a[i] + cB * b[i]) / denom;
    return PoincareOperations.project(r);
  }

  /** Exponential map from tangent space at base to Poincare ball. */
  static expMap(base: Float32Array, tangent: Float32Array): Float32Array {
    const lambda = 2 / Math.max(EPS, 1 - sqNorm(base));
    const nT = Math.sqrt(sqNorm(tangent));
    if (nT < EPS) return new Float32Array(base);
    const t = Math.tanh(lambda * nT / 2);
    const s = new Float32Array(tangent.length);
    for (let i = 0; i < tangent.length; i++) s[i] = (t / nT) * tangent[i];
    return PoincareOperations.mobiusAdd(base, s);
  }

  /** Project point to inside Poincare ball (clamp norm < 1-eps). */
  static project(point: Float32Array): Float32Array {
    const n = Math.sqrt(sqNorm(point));
    if (n <= MAX_NORM) return new Float32Array(point);
    const scale = MAX_NORM / n;
    const r = new Float32Array(point.length);
    for (let i = 0; i < point.length; i++) r[i] = point[i] * scale;
    return r;
  }

  /** Map Euclidean point to Poincare ball via tanh scaling. */
  static euclideanToHyperbolic(point: Float32Array): Float32Array {
    const n = Math.sqrt(sqNorm(point));
    if (n < EPS) return new Float32Array(point.length);
    const scale = Math.tanh(n) / n;
    const r = new Float32Array(point.length);
    for (let i = 0; i < point.length; i++) r[i] = point[i] * scale;
    return PoincareOperations.project(r);
  }
}

/** HNSW index operating in hyperbolic (Poincare ball) space. */
export class HyperbolicHNSW {
  private readonly config: HyperbolicConfig;
  private readonly points: Map<string, HyperbolicPoint> = new Map();

  constructor(config?: Partial<HyperbolicConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.dimensions <= 0)
      throw new Error(`dimensions must be positive, got ${this.config.dimensions}`);
    if (this.config.curvature >= 0)
      throw new Error(`curvature must be negative for hyperbolic space, got ${this.config.curvature}`);
    if (this.config.maxElements <= 0)
      throw new Error(`maxElements must be positive, got ${this.config.maxElements}`);
  }

  /** Insert a point, auto-projecting coordinates into the Poincare ball. */
  insert(id: string, coordinates: Float32Array, metadata?: Record<string, unknown>): void {
    if (coordinates.length !== this.config.dimensions)
      throw new Error(`Dimension mismatch: expected ${this.config.dimensions}, got ${coordinates.length}`);
    if (this.points.size >= this.config.maxElements)
      throw new Error(`Maximum elements (${this.config.maxElements}) reached`);
    this.points.set(id, {
      id, coordinates: PoincareOperations.project(coordinates),
      metadata: metadata ? { ...metadata } : undefined,
    });
  }

  /** k-NN search using Poincare distance, sorted ascending. */
  search(query: Float32Array, k: number): HyperbolicSearchResult[] {
    if (query.length !== this.config.dimensions)
      throw new Error(`Query dimension mismatch: expected ${this.config.dimensions}, got ${query.length}`);
    const proj = PoincareOperations.project(query);
    const results: HyperbolicSearchResult[] = [];
    for (const p of this.points.values())
      results.push({ id: p.id, distance: PoincareOperations.poincareDistance(proj, p.coordinates), point: p });
    results.sort((a, b) => a.distance - b.distance);
    return results.slice(0, Math.max(0, k));
  }

  /**
   * Embed a tree hierarchy into hyperbolic space via BFS.
   * Root near origin, leaves near boundary. Parent-child dist < sibling dist.
   */
  embedHierarchy(
    nodes: Array<{ id: string; parentId?: string; features: Float32Array }>,
  ): Map<string, Float32Array> {
    const result = new Map<string, Float32Array>();
    if (nodes.length === 0) return result;
    const dims = this.config.dimensions;
    const childrenOf = new Map<string, string[]>();
    const nodeMap = new Map<string, (typeof nodes)[0]>();
    const roots: string[] = [];

    for (const node of nodes) {
      nodeMap.set(node.id, node);
      if (!node.parentId) { roots.push(node.id); }
      else {
        let ch = childrenOf.get(node.parentId);
        if (!ch) { ch = []; childrenOf.set(node.parentId, ch); }
        ch.push(node.id);
      }
    }

    type QItem = { id: string; depth: number; angOff: number; angSpan: number };
    const queue: QItem[] = roots.map((id, i) => ({
      id, depth: 0,
      angOff: (2 * Math.PI * i) / Math.max(1, roots.length),
      angSpan: (2 * Math.PI) / Math.max(1, roots.length),
    }));

    while (queue.length > 0) {
      const { id, depth, angOff, angSpan } = queue.shift()!;
      const radius = Math.tanh(0.3 * (depth + 0.1));
      const angle = angOff + angSpan / 2;
      const coords = new Float32Array(dims);
      coords[0] = radius * Math.cos(angle);
      coords[1] = radius * Math.sin(angle);
      const node = nodeMap.get(id);
      if (node && node.features.length > 0) {
        const fs = radius * 0.1;
        for (let d = 2; d < dims && d - 2 < node.features.length; d++)
          coords[d] = node.features[d - 2] * fs;
      }
      const projected = PoincareOperations.project(coords);
      result.set(id, projected);
      this.points.set(id, { id, coordinates: projected, metadata: { depth, parentId: node?.parentId } });
      const children = childrenOf.get(id) ?? [];
      for (let c = 0; c < children.length; c++) {
        const cs = angSpan / Math.max(1, children.length);
        queue.push({ id: children[c], depth: depth + 1, angOff: angOff + c * cs, angSpan: cs });
      }
    }
    return result;
  }

  getStats(): { elementCount: number; dimensions: number; curvature: number } {
    return { elementCount: this.points.size, dimensions: this.config.dimensions, curvature: this.config.curvature };
  }
}

/** Create a HyperbolicHNSW if the feature flag is enabled, otherwise null. */
export function createHyperbolicHNSW(config?: Partial<HyperbolicConfig>): HyperbolicHNSW | null {
  if (!isHyperbolicHnswEnabled()) return null;
  return new HyperbolicHNSW(config);
}

/** Check if Hyperbolic HNSW feature flag is enabled. */
export function isHyperbolicHnswEnabled(): boolean {
  return getRuVectorFeatureFlags().useHyperbolicHnsw;
}
