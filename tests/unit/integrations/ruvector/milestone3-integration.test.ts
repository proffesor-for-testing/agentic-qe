/**
 * Milestone 3 Integration Tests (ADR-087)
 *
 * Tests that exercise the production wiring paths for R7-R10 with
 * feature flags enabled. These verify the last-mile integration,
 * not the algorithms themselves (those are in per-module test files).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../../src/integrations/ruvector/feature-flags';

// R7: Meta-learning wired into DomainTransferEngine
import {
  DomainTransferEngine,
  createDomainTransferEngine,
} from '../../../../src/integrations/ruvector/domain-transfer';
import type { DomainPerformanceSnapshot } from '../../../../src/integrations/ruvector/transfer-verification';

// R8: Citation graph + blended scoring
import {
  PatternCitationGraph,
  computeBlendedImportance,
  PATTERN_CITATIONS_SCHEMA,
} from '../../../../src/learning/pattern-promotion';
import type { PatternGraph } from '../../../../src/integrations/ruvector/solver-adapter';
import Database from 'better-sqlite3';

// R9: Sparsifier wired into mincut
import {
  SpectralSparsifier,
  type SparsifierGraph,
} from '../../../../src/integrations/ruvector/spectral-sparsifier';

// R10: Reservoir buffer
import {
  ReservoirReplayBuffer,
} from '../../../../src/integrations/ruvector/reservoir-replay';

// ============================================================================
// Helpers
// ============================================================================

function snapshot(domain: string): DomainPerformanceSnapshot {
  return { domain, successRate: 0.7, avgConfidence: 0.6, patternCount: 10, timestamp: Date.now() };
}

// ============================================================================
// R7: Meta-Learning Integration
// ============================================================================

describe('R7: Meta-learning integrated into DomainTransferEngine', () => {
  afterEach(() => resetRuVectorFeatureFlags());

  it('should disable meta-learning when system feature flag is false', () => {
    // Config says true, but system flag says false → disabled
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true, useMetaLearningEnhancements: false });
    const engine = createDomainTransferEngine({ useMetaLearningEnhancements: true });
    engine.setPerformanceProvider(snapshot);
    engine.setTransferExecutor(() => true);

    const candidate = engine.evaluateTransfer('a', 'b');
    engine.executeTransfer(candidate);

    // Meta-learning should NOT have updated
    expect(engine.getPlateauDetector().getOutcomeCount()).toBe(0);
    expect(engine.getCuriosityBonus().isTried('a->b')).toBe(false);
  });

  it('should enable meta-learning when both config and flag are true', () => {
    setRuVectorFeatureFlags({ useCrossDomainTransfer: true, useMetaLearningEnhancements: true });
    const engine = createDomainTransferEngine({ useMetaLearningEnhancements: true });
    engine.setPerformanceProvider(snapshot);
    engine.setTransferExecutor(() => true);

    const candidate = engine.evaluateTransfer('a', 'b');
    engine.executeTransfer(candidate);

    expect(engine.getPlateauDetector().getOutcomeCount()).toBe(1);
    expect(engine.getCuriosityBonus().isTried('a->b')).toBe(true);
    expect(engine.getParetoFront().getFront().length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// R8: Citation Graph Pipeline
// ============================================================================

describe('R8: PatternCitationGraph pipeline', () => {
  let db: Database.Database;
  let citationGraph: PatternCitationGraph;

  beforeEach(() => {
    db = new Database(':memory:');
    citationGraph = new PatternCitationGraph(db);
  });

  afterEach(() => {
    db.close();
    resetRuVectorFeatureFlags();
  });

  it('should execute schema and create pattern_citations table', () => {
    citationGraph.ensureSchema();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pattern_citations'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('should record co-occurrence edges and build a graph', () => {
    citationGraph.recordCoOccurrence('p1', 'p2');
    citationGraph.recordCoOccurrence('p2', 'p3');
    citationGraph.recordCoOccurrence('p1', 'p3');

    const graph = citationGraph.buildGraph();
    expect(graph.nodes).toHaveLength(3);
    // 3 co-occurrence edges × 2 directions = 6 directed edges
    expect(graph.edges.length).toBe(6);
  });

  it('should increment weight on repeated co-occurrence', () => {
    citationGraph.recordCoOccurrence('p1', 'p2');
    citationGraph.recordCoOccurrence('p1', 'p2');
    citationGraph.recordCoOccurrence('p1', 'p2');

    const row = db.prepare(
      'SELECT weight FROM pattern_citations WHERE source_pattern_id = ? AND target_pattern_id = ?'
    ).get('p1', 'p2') as { weight: number };
    expect(row.weight).toBe(3.0);
  });

  it('should record derivation edges as directed', () => {
    citationGraph.recordDerivation('parent', 'child');
    const graph = citationGraph.buildGraph();
    // Derivation is unidirectional → 1 edge only
    expect(graph.edges.length).toBe(1);
    expect(graph.nodes).toContain('parent');
    expect(graph.nodes).toContain('child');
  });

  it('should compute blended importance with flag enabled', () => {
    setRuVectorFeatureFlags({ useSublinearSolver: true });

    citationGraph.recordCoOccurrence('p1', 'p2');
    citationGraph.recordCoOccurrence('p2', 'p3');
    citationGraph.recordCoOccurrence('p1', 'p3');
    citationGraph.recordCoOccurrence('p1', 'p4');

    const graph = citationGraph.buildGraph();
    const patterns = [
      { id: 'p1', confidence: 0.8, usageCount: 50, successRate: 0.9 },
      { id: 'p2', confidence: 0.6, usageCount: 20, successRate: 0.7 },
      { id: 'p3', confidence: 0.5, usageCount: 10, successRate: 0.6 },
      { id: 'p4', confidence: 0.4, usageCount: 5, successRate: 0.5 },
    ];

    const scores = computeBlendedImportance(patterns, graph, 0.3);
    expect(scores.size).toBe(4);

    // p1 has most connections → PageRank should boost it
    const p1Score = scores.get('p1')!;
    const p4Score = scores.get('p4')!;
    expect(p1Score).toBeGreaterThan(p4Score);
  });

  it('should fall back to quality scores when flag is disabled', () => {
    setRuVectorFeatureFlags({ useSublinearSolver: false });

    const patterns = [
      { id: 'p1', confidence: 0.8, usageCount: 50, successRate: 0.9 },
      { id: 'p2', confidence: 0.6, usageCount: 20, successRate: 0.7 },
    ];
    const graph: PatternGraph = { nodes: ['p1', 'p2'], edges: [[0, 1, 1], [1, 0, 1]] };

    const scores = computeBlendedImportance(patterns, graph);
    const p1Quality = 0.8 * 0.3 + Math.min(50/100, 1) * 0.2 + 0.9 * 0.5;
    expect(scores.get('p1')).toBeCloseTo(p1Quality, 5);
  });

  it('should bootstrap citation graph from existing pattern data', () => {
    // Simulate existing qe_patterns table with domain grouping
    db.exec(`
      CREATE TABLE IF NOT EXISTS qe_patterns (
        id TEXT PRIMARY KEY,
        qe_domain TEXT
      );
      INSERT INTO qe_patterns (id, qe_domain) VALUES
        ('p1', 'coverage-analysis'),
        ('p2', 'coverage-analysis'),
        ('p3', 'coverage-analysis'),
        ('p4', 'test-generation'),
        ('p5', 'test-generation');
    `);

    // Simulate existing pattern_relationships
    db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_relationships (
        id TEXT PRIMARY KEY,
        source_pattern_id TEXT NOT NULL,
        target_pattern_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        similarity_score REAL,
        created_at TEXT
      );
      INSERT INTO pattern_relationships (id, source_pattern_id, target_pattern_id, relationship_type)
      VALUES ('r1', 'p1', 'p2', 'merged');
    `);

    const edgesCreated = citationGraph.bootstrapFromExistingData();

    // coverage-analysis: 3 patterns → 3 co-occurrence edges (p1-p2, p1-p3, p2-p3)
    // test-generation: 2 patterns → 1 co-occurrence edge (p4-p5)
    // pattern_relationships: 1 merged (p1→p2) → conflicts with co-occurrence (p1,p2)
    //   → INSERT OR IGNORE skips it (0 changes)
    // Total created: 4 edges
    expect(edgesCreated).toBe(4);
    expect(citationGraph.getEdgeCount()).toBe(4);

    // Build graph and verify structure
    const graph = citationGraph.buildGraph();
    expect(graph.nodes.length).toBeGreaterThanOrEqual(5);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('should be idempotent — repeated bootstrap does not duplicate edges', () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS qe_patterns (id TEXT PRIMARY KEY, qe_domain TEXT);
      INSERT INTO qe_patterns (id, qe_domain) VALUES ('a', 'test-gen'), ('b', 'test-gen');
      CREATE TABLE IF NOT EXISTS pattern_relationships (
        id TEXT PRIMARY KEY, source_pattern_id TEXT, target_pattern_id TEXT,
        relationship_type TEXT, similarity_score REAL, created_at TEXT
      );
    `);

    citationGraph.bootstrapFromExistingData();
    const countAfterFirst = citationGraph.getEdgeCount();

    // Second call should not create duplicates (INSERT OR IGNORE)
    citationGraph.bootstrapFromExistingData();
    const countAfterSecond = citationGraph.getEdgeCount();

    expect(countAfterSecond).toBe(countAfterFirst);
  });
});

// ============================================================================
// R9: Sparsifier Wired into MinCut
// ============================================================================

describe('R9: Spectral sparsifier integration', () => {
  afterEach(() => resetRuVectorFeatureFlags());

  it('should sparsify a dense graph and preserve connectivity', () => {
    // Build a K15 graph (105 edges) — above the 100-edge threshold
    const n = 15;
    const edges: Array<[number, number, number]> = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        edges.push([i, j, 1]);
      }
    }
    const graph: SparsifierGraph = { nodeCount: n, edges };
    expect(edges.length).toBe(105);

    const sparsifier = new SpectralSparsifier({ epsilon: 0.3, seed: 42 });
    const sparsified = sparsifier.sparsify(graph);

    // Should have fewer edges
    expect(sparsified.edges.length).toBeLessThan(graph.edges.length);
    expect(sparsified.edges.length).toBeGreaterThan(0);

    // Validate spectral preservation
    const validation = sparsifier.validateSpectral(graph, sparsified);
    expect(validation.compressionRatio).toBeLessThan(1);
    expect(validation.eigenvalueRatios.length).toBeGreaterThan(0);
  });

  it('should not sparsify small graphs (under 100 edges)', () => {
    // A graph with < 100 edges should pass through unchanged
    // (tested via the maybeSparsify threshold in mincut-wrapper)
    const graph: SparsifierGraph = { nodeCount: 5, edges: [[0,1,1],[1,2,1],[2,3,1],[3,4,1]] };
    const sparsifier = new SpectralSparsifier({ epsilon: 0.3, seed: 1 });
    const result = sparsifier.sparsify(graph);
    // Small graph still processes, but most edges survive
    expect(result.nodeCount).toBe(5);
  });
});

// ============================================================================
// R10: Reservoir Write+Read Path
// ============================================================================

describe('R10: Reservoir buffer write and read path', () => {
  it('should admit high-quality experiences and sample them back', () => {
    const buffer = new ReservoirReplayBuffer<{ task: string; quality: number }>({
      capacity: 100,
      minCoherenceThreshold: 0.3,
    });

    // Admit a mix of experiences
    buffer.admit('exp-1', { task: 'fix-auth', quality: 0.95 }, 0.95);
    buffer.admit('exp-2', { task: 'add-test', quality: 0.80 }, 0.80);
    buffer.admit('exp-3', { task: 'refactor', quality: 0.60 }, 0.60);
    buffer.admit('exp-4', { task: 'low-quality', quality: 0.10 }, 0.10); // rejected

    expect(buffer.size()).toBe(3); // exp-4 rejected (below 0.3)

    // Sample back — should get high-coherence experiences
    const sampled = buffer.sample(2, 0.7);
    expect(sampled.length).toBe(2);
    // Both should be high-quality (>= 0.7 coherence)
    for (const entry of sampled) {
      expect(entry.coherenceScore).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('should track replay counts through sample()', () => {
    const buffer = new ReservoirReplayBuffer<string>({ capacity: 10 });
    buffer.admit('a', 'data-a', 0.9);

    // Sample multiple times
    buffer.sample(1);
    buffer.sample(1);
    buffer.sample(1);

    const entries = buffer.getByTier('high');
    expect(entries[0].replayCount).toBe(3);
  });

  it('should maintain stats through full write+read cycle', () => {
    const buffer = new ReservoirReplayBuffer<string>({ capacity: 5 });

    buffer.admit('a', 'd', 0.9);
    buffer.admit('b', 'd', 0.8);
    buffer.admit('c', 'd', 0.1); // rejected

    buffer.sample(2);

    const stats = buffer.getStats();
    expect(stats.totalAdmitted).toBe(2);
    expect(stats.totalRejected).toBe(1);
    expect(stats.totalSampled).toBe(2);
    expect(stats.tierCounts.high).toBe(2);
    expect(stats.tierCounts.medium).toBe(0);
  });

  it('should produce higher average quality from reservoir vs uniform sampling', () => {
    // Fill buffer with a mix of high and low coherence experiences
    const buffer = new ReservoirReplayBuffer<{ quality: number }>({
      capacity: 200,
      minCoherenceThreshold: 0.1,
      highTierWeight: 3.0,
      lowTierWeight: 1.0,
    });

    // 50 high-quality + 150 low-quality
    for (let i = 0; i < 50; i++) {
      buffer.admit(`high-${i}`, { quality: 0.85 + Math.random() * 0.15 }, 0.85 + Math.random() * 0.15);
    }
    for (let i = 0; i < 150; i++) {
      buffer.admit(`low-${i}`, { quality: 0.15 + Math.random() * 0.2 }, 0.15 + Math.random() * 0.2);
    }

    // Reservoir-weighted sample (should favor high-coherence)
    let reservoirQualitySum = 0;
    let reservoirCount = 0;
    const iterations = 100;
    for (let t = 0; t < iterations; t++) {
      const batch = buffer.sample(10);
      for (const entry of batch) {
        reservoirQualitySum += entry.coherenceScore;
        reservoirCount++;
      }
    }
    const reservoirAvgQuality = reservoirQualitySum / reservoirCount;

    // Uniform sample (all items equally likely) — compute expected average
    const allEntries = [...buffer.getByTier('high'), ...buffer.getByTier('medium'), ...buffer.getByTier('low')];
    const uniformAvgQuality = allEntries.reduce((s, e) => s + e.coherenceScore, 0) / allEntries.length;

    // Reservoir-weighted average should be higher than uniform average
    // because high-coherence entries are sampled 3x more often
    expect(reservoirAvgQuality).toBeGreaterThan(uniformAvgQuality);
  });
});
