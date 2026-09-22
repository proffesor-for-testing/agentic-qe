/** The production adapter must send and decode the real WASM graph contract. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CoherenceService, CohomologyAdapter, IRawCohomologyEngine, WasmLoader } from '../../src/integrations/coherence/index.js';

describe('Connected coherence graphs with real WASM', () => {
  let fixture: string;
  let loader: WasmLoader;
  let service: CoherenceService;
  let adapter: CohomologyAdapter;
  let nativePrototype: IRawCohomologyEngine;
  const errors: Error[] = [];

  beforeAll(async () => {
    fixture = mkdtempSync(join(tmpdir(), 'aqe-coherence-connected-'));
    vi.stubEnv('AQE_PROJECT_ROOT', fixture);
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    const coherence = await import('../../src/integrations/coherence/index.js');
    loader = new coherence.WasmLoader();
    service = await coherence.createCoherenceService(loader, { fallbackEnabled: false }, {
      debug() {}, info() {}, warn() {},
      error(_message, error) { if (error) errors.push(error); },
    });
    adapter = new coherence.CohomologyAdapter(loader);
    await adapter.initialize();
    const native = new (loader.getModule().CohomologyEngine)();
    nativePrototype = Object.getPrototypeOf(native) as IRawCohomologyEngine;
    native.free();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    adapter.clear();
    errors.length = 0;
  });

  afterAll(async () => {
    await service?.dispose();
    adapter?.dispose();
    loader?.reset();
    vi.unstubAllEnvs();
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  });

  it('uses WASM for identical connected sections without inventing a contradiction', async () => {
    const result = await service.checkCoherence([
      { id: 'left', embedding: [1, 0] },
      { id: 'right', embedding: [1, 0] },
    ]);
    expect(result.usedFallback, errors.map(error => error.message).join('\n')).toBe(false);
    expect(result.energy).toBe(0);
    expect(result.isCoherent).toBe(true);
    expect(result.contradictions).toEqual([]);
  });

  it('preserves the native energy and obstruction node IDs for connected differing sections', async () => {
    const result = await service.checkCoherence([
      { id: 'source-belief', embedding: [1, 0] },
      { id: 'target-belief', embedding: [1, 0.5] },
    ]);
    expect(result.usedFallback).toBe(false);
    // Identity restriction: ||[1, 0] - [1, 0.5]||^2 = 0.25.
    expect(result.energy).toBeCloseTo(0.25);
    expect(result.contradictions).toEqual([
      expect.objectContaining({ nodeIds: ['source-belief', 'target-belief'], confidence: 0.5 }),
    ]);
  });

  it('keeps confidence within its contract when native obstruction magnitude exceeds one', async () => {
    const result = await service.checkCoherence([
      { id: 'source', embedding: [1, 0] },
      { id: 'target', embedding: [1, 2] },
    ]);
    expect(result.usedFallback).toBe(false);
    expect(result.energy).toBeCloseTo(4);
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0]).toMatchObject({ nodeIds: ['source', 'target'], severity: 'critical' });
    expect(result.contradictions[0].confidence).toBeGreaterThanOrEqual(0);
    expect(result.contradictions[0].confidence).toBeLessThanOrEqual(1);
  });

  it('handles the deterministic 10-by-128 input that exposed the integration failure', async () => {
    let seed = 67;
    const random = () => {
      let value = seed += 0x6D2B79F5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    const nodes = Array.from({ length: 10 }, (_, index) => ({
      id: `perf-pattern-${index}`,
      embedding: Array.from({ length: 128 }, () => random() - 0.5),
    }));
    const result = await service.checkCoherence(nodes);
    expect(result.usedFallback).toBe(false);
    const squaredDistance = nodes[2].embedding.reduce((sum, value, index) =>
      sum + (value - nodes[6].embedding[index]) ** 2, 0);
    expect(result.energy).toBeCloseTo(squaredDistance);
    expect(result.contradictions).toEqual([
      expect.objectContaining({ nodeIds: ['perf-pattern-2', 'perf-pattern-6'] }),
    ]);
  });

  it('preserves the edge-free orthogonal control', async () => {
    const result = await service.checkCoherence([
      { id: 'left', embedding: [1, 0] },
      { id: 'right', embedding: [0, 1] },
    ]);
    expect(result.usedFallback).toBe(false);
    expect(result.energy).toBe(0);
    expect(result.contradictions).toEqual([]);
  });

  it.each([
    { source: [1, 2], target: [1, 2, 3] },
    { source: [1, 2, 3], target: [1, 2] },
  ])('rejects incompatible dimensions rather than dropping or padding coordinates: $source -> $target', async ({ source, target }) => {
    const nativeCall = vi.spyOn(nativePrototype, 'consistencyEnergy');
    adapter.addNode({ id: 'source', embedding: source });
    adapter.addNode({ id: 'target', embedding: target });
    adapter.addEdge({ source: 'source', target: 'target', weight: 1 });
    expect(() => adapter.computeEnergy()).toThrow(/matching embedding dimensions/);
    expect(() => adapter.detectContradictions()).toThrow(/matching embedding dimensions/);
    // Reverse dimension order can prevent similarity edges from being built;
    // the full service must still reject the incompatible graph.
    const result = await service.checkCoherence([
      { id: 'source', embedding: source },
      { id: 'target', embedding: target },
    ]);
    expect(result).toMatchObject({ usedFallback: true, isCoherent: false, lane: 'human' });
    expect(nativeCall).not.toHaveBeenCalled();
  });

  it('rebuilds native array positions and obstruction IDs after removing a node', () => {
    adapter.addNode({ id: 'removed', embedding: [0, 1] });
    adapter.addNode({ id: 'source', embedding: [1, 0] });
    adapter.addNode({ id: 'target', embedding: [1, 0.5] });
    adapter.addEdge({ source: 'source', target: 'target', weight: 1 });
    adapter.removeNode('removed');
    expect(adapter.computeEnergy()).toBeCloseTo(0.25);
    expect(adapter.detectContradictions()).toEqual([
      expect.objectContaining({ nodeIds: ['source', 'target'] }),
    ]);
  });

  it('uses current node positions when edges were registered before nodes', () => {
    adapter.addEdge({ source: 'source', target: 'target', weight: 1 });
    adapter.addNode({ id: 'unrelated', embedding: [0, 1] });
    adapter.addNode({ id: 'target', embedding: [1, 0.5] });
    adapter.addNode({ id: 'source', embedding: [1, 0] });
    expect(adapter.computeEnergy()).toBeCloseTo(0.25);
    expect(adapter.detectContradictions()).toEqual([
      expect.objectContaining({ nodeIds: ['source', 'target'] }),
    ]);
  });

  it('rejects an edge whose endpoint is still absent before calling WASM', () => {
    const nativeCall = vi.spyOn(nativePrototype, 'consistencyEnergy');
    adapter.addNode({ id: 'source', embedding: [1, 0] });
    adapter.addEdge({ source: 'source', target: 'missing', weight: 1 });
    expect(() => adapter.computeEnergy()).toThrow(/unknown node/);
    expect(nativeCall).not.toHaveBeenCalled();
  });

  it.each([
    { count: 2, dimensions: 2049, message: /restriction map exceeds/ },
    { count: 5, dimensions: 2048, message: /graph exceeds/ },
  ])('returns manual-review fallback before native work for an oversized $count-by-$dimensions graph', async ({ count, dimensions, message }) => {
    const nativeCall = vi.spyOn(nativePrototype, 'consistencyEnergy');
    const result = await service.checkCoherence(Array.from({ length: count }, (_, i) => ({
      id: `large-${i}`, embedding: Array(dimensions).fill(1),
    })));
    expect(result).toMatchObject({ usedFallback: true, isCoherent: false, lane: 'human' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RangeError);
    expect(errors[0].message).toMatch(message);
    expect(nativeCall).not.toHaveBeenCalled();
  });

  it('matches an unbatched native graph while bounding each native batch', () => {
    const dimension = 384;
    const sections = Array.from({ length: 10 }, (_, i) => Array(dimension).fill(0.1 + i * 0.002));
    const identity = Array(dimension * dimension).fill(0);
    for (let i = 0; i < dimension; i++) identity[i * dimension + i] = 1;
    const nativeEdges = [];
    for (let i = 0; i < sections.length; i++) {
      adapter.addNode({ id: `node-${i}`, embedding: sections[i] });
      for (let j = 0; j < i; j++) {
        const weight = (i + j + 1) / 20;
        adapter.addEdge({ source: `node-${j}`, target: `node-${i}`, weight });
        nativeEdges.push({ source: j, target: i, weight, restriction_map: identity, source_dim: dimension, target_dim: dimension });
      }
    }
    const referenceGraph = {
      nodes: sections.map((section, id) => ({ id, label: `node-${id}`, section, weight: 1 })),
      edges: nativeEdges,
    };
    const native = new (loader.getModule().CohomologyEngine)();
    let expectedEnergy: number;
    let expectedObstructions: Array<{ source_node: number; target_node: number; magnitude: number }>;
    try {
      expectedEnergy = native.consistencyEnergy(referenceGraph);
      expectedObstructions = native.detectObstructions(referenceGraph) as typeof expectedObstructions;
    } finally {
      native.free();
    }
    const nativeEnergy = vi.spyOn(nativePrototype, 'consistencyEnergy');
    const nativeObstructions = vi.spyOn(nativePrototype, 'detectObstructions');
    expect(adapter.computeEnergy()).toBeCloseTo(expectedEnergy!);
    const contradictions = adapter.detectContradictions(0.1);
    expect(contradictions.map(item => item.nodeIds)).toEqual(expectedObstructions!
      .filter(item => item.magnitude > 0.1)
      .map(item => [`node-${item.source_node}`, `node-${item.target_node}`]));
    expect(nativeEnergy).toHaveBeenCalledTimes(2);
    expect(nativeObstructions).toHaveBeenCalledTimes(2);
    for (const [graph] of [...nativeEnergy.mock.calls, ...nativeObstructions.mock.calls]) {
      const { edges } = graph as { edges: Array<{ restriction_map: number[] }> };
      expect(edges.reduce((cells, edge) => cells + edge.restriction_map.length, 0)).toBeLessThanOrEqual(4 * 1024 * 1024);
      expect(new Set(edges.map(edge => edge.restriction_map)).size).toBe(1);
    }
  });
});
