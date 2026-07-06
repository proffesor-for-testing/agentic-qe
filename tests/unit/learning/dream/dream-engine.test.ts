/**
 * DreamEngine Unit Tests
 * ADR-046: V2 Feature Integration - Dream Cycles
 *
 * Tests for the DreamEngine, ConceptGraph, SpreadingActivation,
 * and InsightGenerator components.
 *
 * Updated for unified persistence - uses shared database
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DreamEngine,
  createDreamEngine,
  ConceptGraph,
  createConceptGraph,
  SpreadingActivation,
  InsightGenerator,
  DEFAULT_DREAM_CONFIG,
  DEFAULT_ACTIVATION_CONFIG,
  DEFAULT_INSIGHT_CONFIG,
  type DreamConfig,
  type PatternImportData,
  type FailureImportData,
  type SuccessImportData,
} from '../../../../src/learning/dream/index.js';
import { resetUnifiedPersistence, initializeUnifiedPersistence, getUnifiedPersistence } from '../../../../src/kernel/unified-persistence.js';
import { vi } from 'vitest';

// A8: applyInsight creates a real ReasoningBank pattern. getSharedMemoryBackend
// resolves via findProjectRoot() to the REAL project's .agentic-qe/memory.db —
// NOT this file's isolated temp DB — so it must be mocked here to avoid
// polluting the real project database during test runs.
const { storePatternMock, setRvfDualWriterMock } = vi.hoisted(() => ({
  storePatternMock: vi.fn(),
  setRvfDualWriterMock: vi.fn(),
}));

vi.mock('../../../../src/mcp/tools/base.js', () => ({
  getSharedMemoryBackend: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../../src/learning/qe-reasoning-bank.js', () => ({
  createQEReasoningBank: () => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    setRvfDualWriter: setRvfDualWriterMock,
    storePattern: storePatternMock,
  }),
}));

vi.mock('../../../../src/integrations/ruvector/shared-rvf-dual-writer.js', () => ({
  getSharedRvfDualWriter: vi.fn().mockResolvedValue(null),
}));

// Use system temp directory for test isolation (auto-cleaned by OS)
const UNIFIED_DB_DIR = path.join(os.tmpdir(), `agentic-qe-test-dream-${process.pid}`);
const UNIFIED_DB_PATH = path.join(UNIFIED_DB_DIR, 'memory.db');

// Helper to clean up test databases
function cleanupUnifiedDb(): void {
  if (fs.existsSync(UNIFIED_DB_PATH)) {
    fs.unlinkSync(UNIFIED_DB_PATH);
  }
  if (fs.existsSync(`${UNIFIED_DB_PATH}-wal`)) {
    fs.unlinkSync(`${UNIFIED_DB_PATH}-wal`);
  }
  if (fs.existsSync(`${UNIFIED_DB_PATH}-shm`)) {
    fs.unlinkSync(`${UNIFIED_DB_PATH}-shm`);
  }
}

// Sample patterns for testing (using correct PatternImportData interface)
const SAMPLE_PATTERNS: PatternImportData[] = [
  {
    id: 'pattern-1',
    name: 'Mock Heavy Testing',
    description: 'Use mocks extensively for external dependencies',
    domain: 'test-generation',
    patternType: 'testing',
    confidence: 0.85,
    successRate: 0.8,
  },
  {
    id: 'pattern-2',
    name: 'Property-Based Testing',
    description: 'Use property-based tests to find edge cases',
    domain: 'test-generation',
    patternType: 'testing',
    confidence: 0.9,
    successRate: 0.9,
  },
  {
    id: 'pattern-3',
    name: 'Branch Coverage Focus',
    description: 'Prioritize branch coverage over line coverage',
    domain: 'coverage-analysis',
    patternType: 'coverage',
    confidence: 0.75,
    successRate: 0.7,
  },
  {
    id: 'pattern-4',
    name: 'Input Validation First',
    description: 'Always validate inputs before processing',
    domain: 'security-compliance',
    patternType: 'security',
    confidence: 0.95,
    successRate: 0.95,
  },
  {
    id: 'pattern-5',
    name: 'Early Performance Testing',
    description: 'Test performance early in the development cycle',
    domain: 'chaos-resilience',
    patternType: 'performance',
    confidence: 0.65,
    successRate: 0.6,
  },
];

// Generate more patterns to meet minimum requirements
function generatePatterns(count: number): PatternImportData[] {
  const types = ['testing', 'coverage', 'security', 'performance', 'quality'];
  const domains = ['test-generation', 'coverage-analysis', 'security-compliance', 'chaos-resilience', 'quality-assessment'];

  const patterns: PatternImportData[] = [...SAMPLE_PATTERNS];

  for (let i = patterns.length; i < count; i++) {
    patterns.push({
      id: `pattern-${i + 1}`,
      name: `Generated Pattern ${i + 1}`,
      description: `Description for generated pattern ${i + 1}`,
      domain: domains[i % domains.length],
      patternType: types[i % types.length],
      confidence: 0.5 + Math.random() * 0.5,
      successRate: 0.5 + Math.random() * 0.5,
    });
  }

  return patterns;
}

describe('DreamEngine', () => {
  let engine: DreamEngine;

  beforeEach(async () => {
    // Reset unified persistence for test isolation
    resetUnifiedPersistence();
    cleanupUnifiedDb();

    // Initialize unified persistence with custom test path
    await initializeUnifiedPersistence({ dbPath: UNIFIED_DB_PATH });

    engine = createDreamEngine();
    await engine.initialize();
  });

  afterEach(async () => {
    if (engine) {
      await engine.close();
    }
    resetUnifiedPersistence();
    cleanupUnifiedDb();
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(UNIFIED_DB_DIR)) {
      fs.rmSync(UNIFIED_DB_DIR, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      // Reset and create fresh engine
      resetUnifiedPersistence();
      const newEngine = createDreamEngine();
      await newEngine.initialize();

      // Check we can run operations after initialization
      const history = await newEngine.getDreamHistory();
      expect(Array.isArray(history)).toBe(true);

      await newEngine.close();
    });

    it('should create database file on initialization', async () => {
      expect(fs.existsSync(UNIFIED_DB_PATH)).toBe(true);
    });

    it('should use default config when not provided', () => {
      expect(DEFAULT_DREAM_CONFIG.maxDurationMs).toBe(30000);
      expect(DEFAULT_DREAM_CONFIG.minConceptsRequired).toBe(10);
    });

    it('should accept custom configuration', async () => {
      const customConfig: Partial<DreamConfig> = {
        maxDurationMs: 5000,
        minConceptsRequired: 5,
      };

      // Reset for fresh start
      await engine.close();
      resetUnifiedPersistence();

      const customEngine = new DreamEngine(customConfig);
      await customEngine.initialize();
      await customEngine.close();
    });
  });

  describe('pattern import', () => {
    it('should import patterns as concepts', async () => {
      const loaded = await engine.loadPatternsAsConcepts(SAMPLE_PATTERNS);
      expect(loaded).toBeGreaterThan(0);
    });

    it('should import multiple patterns at once', async () => {
      const loaded = await engine.loadPatternsAsConcepts(generatePatterns(10));
      expect(loaded).toBeGreaterThanOrEqual(10);
    });
  });

  describe('dream cycle', () => {
    it('should require minimum concepts to dream', async () => {
      // Import fewer than minimum required patterns
      await engine.loadPatternsAsConcepts(SAMPLE_PATTERNS.slice(0, 2));

      // Dream with insufficient concepts should handle gracefully
      await expect(engine.dream(1000)).rejects.toThrow();
    });

    it('should complete a dream cycle with sufficient patterns', async () => {
      const patterns = generatePatterns(15);
      await engine.loadPatternsAsConcepts(patterns);

      // Short dream cycle for testing
      const result = await engine.dream(2000);

      expect(result.cycle).toBeDefined();
      expect(result.cycle.status).toBe('completed');
      expect(result.cycle.durationMs).toBeLessThanOrEqual(3000);
      expect(result.activationStats).toBeDefined();
      expect(result.activationStats.totalIterations).toBeGreaterThan(0);
    });

    it('should generate insights during dream cycle', async () => {
      const patterns = generatePatterns(20);
      await engine.loadPatternsAsConcepts(patterns);

      const result = await engine.dream(3000);

      // Insights may or may not be generated depending on activation
      expect(result.insights).toBeDefined();
      expect(Array.isArray(result.insights)).toBe(true);
    });

    it('should support cancelDream method', async () => {
      // Test that cancelDream method exists and can be called
      expect(typeof engine.cancelDream).toBe('function');

      // Calling cancel when no dream is running should not throw
      await engine.cancelDream();
    });
  });

  // A8-EXT follow-up: ensureConceptsLoaded()'s "do we have enough concepts to
  // dream at all" gate previously sat in front of the failure/success concept
  // refresh, so on any project that's dreamed more than a handful of times
  // (concept_nodes permanently above minConceptsRequired) the refresh was
  // unreachable via the real automatic path (dream-scheduler.ts calls only
  // this method, never the loadFailuresAsConcepts/loadSuccessesAsConcepts
  // test wrappers). This proves the refresh now runs regardless of the gate.
  describe('ensureConceptsLoaded gate bypass (A8-EXT follow-up)', () => {
    it('loads real error/outcome concepts even when the graph already has >= minConceptsRequired nodes', async () => {
      // Push the graph comfortably above DEFAULT_DREAM_CONFIG.minConceptsRequired (10).
      await engine.loadPatternsAsConcepts(generatePatterns(15));

      const db = getUnifiedPersistence().getDatabase();
      db.prepare(`
        INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, success_rate, quality_score)
        VALUES ('p-gate-test', 'testing', 'test-generation', 'test-generation', 'Gate Test Pattern', 'd', 0.8, 0.8, 0.8)
      `).run();
      db.prepare(`
        INSERT INTO qe_pattern_nulls (id, pattern_id, context_fingerprint, failure_mode)
        VALUES ('null-gate-test', 'p-gate-test', 'ctx-1', 'gate-bypass-flake')
      `).run();
      db.prepare(`
        INSERT INTO qe_pattern_usage (pattern_id, success)
        VALUES ('p-gate-test', 1)
      `).run();

      const existingBefore = db.prepare(
        `SELECT COUNT(*) as n FROM concept_nodes`
      ).get() as { n: number };
      expect(existingBefore.n).toBeGreaterThanOrEqual(DEFAULT_DREAM_CONFIG.minConceptsRequired);

      const loaded = await engine.ensureConceptsLoaded();

      // Return value reflects only freshly-imported PATTERNS (0 here, since the
      // graph is already above threshold) -- the real assertion is that the
      // error/outcome nodes were loaded despite that, which the pre-fix gate
      // would have prevented (it returned 0 before ever reaching this logic).
      expect(loaded).toBe(0);

      const errorNode = db.prepare(
        `SELECT * FROM concept_nodes WHERE concept_type = 'error' AND pattern_id = 'error:null-gate-test'`
      ).get() as { content: string } | undefined;
      expect(errorNode).toBeDefined();
      expect(errorNode!.content).toBe('gate-bypass-flake');

      const outcomeNode = db.prepare(
        `SELECT * FROM concept_nodes WHERE concept_type = 'outcome'`
      ).get() as { content: string } | undefined;
      expect(outcomeNode).toBeDefined();
    });
  });

  // A8: applyInsight previously minted a fake `dream-pattern-<uuid>` that never
  // resolved to a real qe_patterns row. These tests insert a deterministic
  // insight row directly (dream-cycle insight generation is probabilistic —
  // "may or may not be generated" per the tests above) and verify a real
  // pattern gets created and dream_insights.pattern_id points at it.
  describe('applyInsight (A8)', () => {
    async function insertTestInsight(overrides: Partial<{
      actionable: number;
      applied: number;
      pattern_id: string | null;
    }> = {}): Promise<string> {
      // Real cycle_id is required by the FOREIGN KEY on dream_insights.
      await engine.loadPatternsAsConcepts(generatePatterns(15));
      const result = await engine.dream(1000);
      const cycleId = result.cycle.id;

      const db = getUnifiedPersistence().getDatabase();
      const insightId = `test-insight-${Math.random().toString(36).slice(2)}`;
      db.prepare(`
        INSERT INTO dream_insights
          (id, cycle_id, insight_type, source_concepts, description,
           confidence_score, actionable, applied, suggested_action, pattern_id)
        VALUES (?, ?, 'cross-domain', '["concept-a","concept-b"]', 'Test insight description',
                0.85, ?, ?, 'Do the thing', ?)
      `).run(
        insightId,
        cycleId,
        overrides.actionable ?? 1,
        overrides.applied ?? 0,
        overrides.pattern_id ?? null,
      );
      return insightId;
    }

    beforeEach(() => {
      storePatternMock.mockReset();
      setRvfDualWriterMock.mockReset();
    });

    it('creates a real pattern and points dream_insights.pattern_id at it', async () => {
      storePatternMock.mockResolvedValue({ success: true, value: { id: 'real-pattern-uuid-123' } });
      const insightId = await insertTestInsight();

      const result = await engine.applyInsight(insightId);

      expect(result.success).toBe(true);
      expect(result.patternId).toBe('real-pattern-uuid-123');
      expect(result.patternId).not.toMatch(/^dream-pattern-/);

      expect(storePatternMock).toHaveBeenCalledWith(
        expect.objectContaining({
          patternType: 'coverage-strategy', // 'cross-domain' maps here
          name: 'Dream Insight: cross-domain',
        })
      );

      const db = getUnifiedPersistence().getDatabase();
      const row = db.prepare('SELECT applied, pattern_id FROM dream_insights WHERE id = ?').get(insightId) as
        { applied: number; pattern_id: string };
      expect(row.applied).toBe(1);
      expect(row.pattern_id).toBe('real-pattern-uuid-123');
    });

    it('does NOT mark applied when pattern creation fails — stays retryable', async () => {
      storePatternMock.mockResolvedValue({ success: false, error: { message: 'db busy' } });
      const insightId = await insertTestInsight();

      const result = await engine.applyInsight(insightId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('db busy');

      const db = getUnifiedPersistence().getDatabase();
      const row = db.prepare('SELECT applied, pattern_id FROM dream_insights WHERE id = ?').get(insightId) as
        { applied: number; pattern_id: string | null };
      expect(row.applied).toBe(0);
      expect(row.pattern_id).toBeNull();
    });

    it('rejects a non-actionable insight without creating a pattern', async () => {
      const insightId = await insertTestInsight({ actionable: 0 });

      const result = await engine.applyInsight(insightId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not actionable');
      expect(storePatternMock).not.toHaveBeenCalled();
    });

    it('returns the existing patternId for an already-applied insight without re-creating it', async () => {
      const insightId = await insertTestInsight({ applied: 1, pattern_id: 'already-real-id' });

      const result = await engine.applyInsight(insightId);

      expect(result.success).toBe(true);
      expect(result.patternId).toBe('already-real-id');
      expect(storePatternMock).not.toHaveBeenCalled();
    });
  });

  describe('insights', () => {
    it('should retrieve pending insights', async () => {
      const patterns = generatePatterns(15);
      await engine.loadPatternsAsConcepts(patterns);

      await engine.dream(2000);

      const pending = await engine.getPendingInsights();
      expect(Array.isArray(pending)).toBe(true);
    });
  });

  describe('dream history', () => {
    it('should track dream cycle history', async () => {
      const patterns = generatePatterns(15);
      await engine.loadPatternsAsConcepts(patterns);

      await engine.dream(1000);
      await engine.dream(1000);

      const history = await engine.getDreamHistory();
      expect(history.length).toBe(2);
    });

    it('should limit history results', async () => {
      const patterns = generatePatterns(15);
      await engine.loadPatternsAsConcepts(patterns);

      await engine.dream(500);
      await engine.dream(500);
      await engine.dream(500);

      const history = await engine.getDreamHistory(2);
      expect(history.length).toBe(2);
    });
  });

  describe('lifecycle', () => {
    it('should close cleanly', async () => {
      await engine.loadPatternsAsConcepts(SAMPLE_PATTERNS);

      await engine.close();

      // Reset and reopen should work
      resetUnifiedPersistence();
      const newEngine = createDreamEngine();
      await newEngine.initialize();

      // Data should persist
      const history = await newEngine.getDreamHistory();
      expect(Array.isArray(history)).toBe(true);

      await newEngine.close();
    });
  });
});

describe('ConceptGraph', () => {
  let graph: ConceptGraph;

  beforeEach(async () => {
    // Reset unified persistence for test isolation
    resetUnifiedPersistence();
    cleanupUnifiedDb();

    // Initialize unified persistence with custom test path
    await initializeUnifiedPersistence({ dbPath: UNIFIED_DB_PATH });

    graph = createConceptGraph();
    await graph.initialize();
  });

  afterEach(async () => {
    if (graph) {
      await graph.close();
    }
    resetUnifiedPersistence();
    cleanupUnifiedDb();
  });

  describe('nodes', () => {
    it('should add concept nodes', async () => {
      const nodeId = await graph.addNode({
        conceptType: 'pattern',
        content: 'Test Concept',
        metadata: { source: 'test' },
      });

      expect(nodeId).toBeDefined();
      expect(typeof nodeId).toBe('string');
    });

    it('should retrieve nodes by ID', async () => {
      const nodeId = await graph.addNode({
        conceptType: 'pattern',
        content: 'Test Concept',
      });

      const node = await graph.getNode(nodeId);

      expect(node).not.toBeNull();
      expect(node!.content).toBe('Test Concept');
      expect(node!.conceptType).toBe('pattern');
    });

    it('should return null for non-existent nodes', async () => {
      const node = await graph.getNode('non-existent-id');
      expect(node).toBeNull();
    });

    it('should update node activation', async () => {
      const nodeId = await graph.addNode({
        conceptType: 'pattern',
        content: 'Test Concept',
      });

      await graph.updateActivation(nodeId, 0.9);

      const node = await graph.getNode(nodeId);
      expect(node!.activationLevel).toBe(0.9);
    });
  });

  describe('edges', () => {
    it('should add edges between nodes', async () => {
      const node1 = await graph.addNode({ conceptType: 'pattern', content: 'Node 1' });
      const node2 = await graph.addNode({ conceptType: 'pattern', content: 'Node 2' });

      const edgeId = await graph.addEdge(node1, node2, 'related', 0.7);

      expect(edgeId).toBeDefined();
    });

    it('should retrieve neighbors', async () => {
      const node1 = await graph.addNode({ conceptType: 'pattern', content: 'Node 1' });
      const node2 = await graph.addNode({ conceptType: 'pattern', content: 'Node 2' });
      const node3 = await graph.addNode({ conceptType: 'pattern', content: 'Node 3' });

      await graph.addEdge(node1, node2, 'related', 0.7);
      await graph.addEdge(node1, node3, 'related', 0.6);

      const neighbors = await graph.getNeighbors(node1);

      expect(neighbors.length).toBe(2);
    });
  });

  describe('statistics', () => {
    it('should return graph statistics', async () => {
      const node1 = await graph.addNode({ conceptType: 'pattern', content: 'Node 1' });
      const node2 = await graph.addNode({ conceptType: 'pattern', content: 'Node 2' });
      await graph.addEdge(node1, node2, 'related', 0.7);

      const stats = await graph.getStats();

      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);
    });
  });

  // A8-EXT: pattern/technique split, error/outcome import — real data sources
  // for the 3 previously-dead insight detectors.
  describe('pattern/technique classification (A8-EXT)', () => {
    it('loads a methodology-type pattern as conceptType "technique"', async () => {
      await graph.loadFromPatterns([{
        id: 'p-technique-1',
        name: 'Coverage Strategy',
        description: 'Risk-based coverage',
        domain: 'test-generation',
        patternType: 'coverage-strategy',
        confidence: 0.8,
        successRate: 0.8,
      }]);

      const techniqueNodes = await graph.getNodesByType('technique');
      const created = techniqueNodes.find((n) => n.patternId === 'p-technique-1');
      expect(created).toBeDefined();
    });

    it('loads a structural-type pattern as conceptType "pattern"', async () => {
      await graph.loadFromPatterns([{
        id: 'p-pattern-1',
        name: 'AAA Unit Test',
        description: 'Arrange-Act-Assert',
        domain: 'test-generation',
        patternType: 'test-template',
        confidence: 0.8,
        successRate: 0.8,
      }]);

      const active = await graph.getActiveNodes(-1);
      const created = active.find((n) => n.patternId === 'p-pattern-1');
      expect(created?.conceptType).toBe('pattern');
    });

    it('connects new technique nodes to same-domain pattern/technique mates via discoverSameDomainEdges', async () => {
      await graph.loadFromPatterns([
        { id: 'p-1', name: 'AAA', description: 'd', domain: 'test-generation', patternType: 'test-template', confidence: 0.8, successRate: 0.8 },
      ]);
      await graph.loadFromPatterns([
        { id: 'p-2', name: 'Coverage', description: 'd', domain: 'test-generation', patternType: 'coverage-strategy', confidence: 0.8, successRate: 0.8 },
      ]);

      const active = await graph.getActiveNodes(-1);
      const patternNode = active.find((n) => n.patternId === 'p-1')!;
      const techniqueNode = active.find((n) => n.patternId === 'p-2')!;
      expect(techniqueNode.conceptType).toBe('technique');

      const neighbors = await graph.getNeighbors(techniqueNode.id);
      expect(neighbors.some((n) => n.node.id === patternNode.id)).toBe(true);
    });
  });

  describe('error/outcome import (A8-EXT)', () => {
    it('loads a real pattern-null as an "error" concept node, idempotently', async () => {
      const failures: FailureImportData[] = [
        { id: 'null-1', sourcePatternId: 'p-x', domain: 'test-generation', failureMode: 'flaky-timeout' },
      ];
      const loaded1 = await graph.loadFailuresAsErrors(failures);
      const loaded2 = await graph.loadFailuresAsErrors(failures); // re-load: should no-op

      expect(loaded1).toBe(1);
      expect(loaded2).toBe(0);

      const active = await graph.getActiveNodes(-1);
      const errorNode = active.find((n) => n.conceptType === 'error');
      expect(errorNode?.content).toBe('flaky-timeout');
    });

    it('loads a real pattern-usage success as an "outcome" concept node, idempotently', async () => {
      const successes: SuccessImportData[] = [
        { id: 42, sourcePatternId: 'p-x', domain: 'test-generation', description: 'Pattern "X" applied successfully' },
      ];
      const loaded1 = await graph.loadSuccessesAsOutcomes(successes);
      const loaded2 = await graph.loadSuccessesAsOutcomes(successes);

      expect(loaded1).toBe(1);
      expect(loaded2).toBe(0);

      const active = await graph.getActiveNodes(-1);
      const outcomeNode = active.find((n) => n.conceptType === 'outcome');
      expect(outcomeNode?.content).toBe('Pattern "X" applied successfully');
    });

    it('connects a new error node to same-domain pattern/technique mates, not its own source pattern', async () => {
      await graph.loadFromPatterns([
        { id: 'p-mate', name: 'Retry Pattern', description: 'd', domain: 'test-generation', patternType: 'flaky-fix', confidence: 0.8, successRate: 0.9 },
      ]);
      const loaded = await graph.loadFailuresAsErrors([
        { id: 'null-2', sourcePatternId: 'p-mate', domain: 'test-generation', failureMode: 'still-flaky' },
      ]);
      expect(loaded).toBe(1);

      const active = await graph.getActiveNodes(-1);
      const errorNode = active.find((n) => n.conceptType === 'error')!;
      const mateNode = active.find((n) => n.patternId === 'p-mate')!;

      const neighbors = await graph.getNeighbors(errorNode.id);
      // Real regression check: the domain-mate query excludes pattern_id = sourcePatternId,
      // so connecting an error to its OWN causing pattern must never happen (that would
      // trivially satisfy detectGaps' "hasResolution" check and defeat its purpose).
      expect(neighbors.some((n) => n.node.id === mateNode.id)).toBe(false);
    });
  });
});

describe('SpreadingActivation', () => {
  let graph: ConceptGraph;

  beforeEach(async () => {
    resetUnifiedPersistence();
    cleanupUnifiedDb();

    // Initialize unified persistence with custom test path
    await initializeUnifiedPersistence({ dbPath: UNIFIED_DB_PATH });

    graph = createConceptGraph();
    await graph.initialize();
  });

  afterEach(async () => {
    if (graph) {
      await graph.close();
    }
    resetUnifiedPersistence();
    cleanupUnifiedDb();
  });

  it('should create with default config', () => {
    expect(DEFAULT_ACTIVATION_CONFIG.decayRate).toBeDefined();
    expect(DEFAULT_ACTIVATION_CONFIG.spreadFactor).toBeDefined();
    expect(DEFAULT_ACTIVATION_CONFIG.threshold).toBeDefined();
  });
});

describe('InsightGenerator', () => {
  let graph: ConceptGraph;

  beforeEach(async () => {
    resetUnifiedPersistence();
    cleanupUnifiedDb();

    // Initialize unified persistence with custom test path
    await initializeUnifiedPersistence({ dbPath: UNIFIED_DB_PATH });

    graph = createConceptGraph();
    await graph.initialize();
  });

  afterEach(async () => {
    if (graph) {
      await graph.close();
    }
    resetUnifiedPersistence();
    cleanupUnifiedDb();
  });

  it('should create with default config', () => {
    expect(DEFAULT_INSIGHT_CONFIG.minNoveltyScore).toBeDefined();
    expect(DEFAULT_INSIGHT_CONFIG.minConfidence).toBeDefined();
    expect(DEFAULT_INSIGHT_CONFIG.maxInsightsPerCycle).toBeDefined();
  });

  it('should respect max insights configuration', () => {
    expect(DEFAULT_INSIGHT_CONFIG.maxInsightsPerCycle).toBe(10);
  });

  // A8-EXT: proves the fix actually pays off — these detectors previously
  // NEVER fired in production (only novel_association ever did, per the
  // system audit) because their required node types/data never existed.
  describe('detectGaps / detectOptimizations / detectPatternMerges (A8-EXT)', () => {
    // detectGaps/detectPatternMerges both call this.graph.getEdge(s)(...) —
    // in PRODUCTION, InsightGenerator is always constructed with dream-engine's
    // private ConceptGraphAdapter (in-memory edge cache built from
    // getNeighbors()), never the raw ConceptGraph (which has no
    // getEdge/getEdges methods at all — calling InsightGenerator directly
    // against it throws). A *real* random dream() cycle is the wrong tool to
    // verify detector logic deterministically: final co-activation depends on
    // which nodes the random walk happens to hit last before the clock runs
    // out (the existing test suite's own "may or may not be generated"
    // comment on `dream cycle > should generate insights` is exactly this).
    // This local adapter wraps the REAL, persisted ConceptGraph data (created
    // by the actual production loadFromPatterns/loadFailuresAsErrors code —
    // not fabricated) but exposes the same sync interface the real adapter
    // does, with activation levels under direct test control.
    async function buildTestAdapter(g: ConceptGraph): Promise<{
      getConcept(id: string): ConceptNode | undefined;
      getAllConcepts(minActivation?: number): ConceptNode[];
      getActiveNodes(threshold: number): ConceptNode[];
      getEdges(nodeId: string): ConceptEdge[];
      getEdge(source: string, target: string): ConceptEdge | undefined;
      setActivation(id: string, level: number): void;
    }> {
      const nodes = await g.getActiveNodes(-1);
      const nodeMap = new Map(nodes.map((n) => [n.id, { ...n }]));
      const edgesBySource = new Map<string, ConceptEdge[]>();
      for (const node of nodes) {
        const neighbors = await g.getNeighbors(node.id);
        edgesBySource.set(node.id, neighbors.map((n) => n.edge));
      }
      return {
        getConcept: (id) => nodeMap.get(id),
        getAllConcepts: (minActivation = 0) =>
          Array.from(nodeMap.values()).filter((n) => n.activationLevel >= minActivation),
        getActiveNodes: (threshold) =>
          Array.from(nodeMap.values()).filter((n) => n.activationLevel >= threshold),
        getEdges: (nodeId) => edgesBySource.get(nodeId) ?? [],
        getEdge: (source, target) => (edgesBySource.get(source) ?? []).find((e) => e.target === target),
        setActivation: (id, level) => {
          const n = nodeMap.get(id);
          if (n) n.activationLevel = level;
        },
      };
    }

    it('detectGaps fires for an error node with no domain-mate resolution', async () => {
      // No patterns loaded in this domain — the error is genuinely isolated.
      await graph.loadFailuresAsErrors([
        { id: 'null-iso', sourcePatternId: 'p-none', domain: 'isolated-domain', failureMode: 'unresolved-flake' },
      ]);
      const adapter = await buildTestAdapter(graph);
      const activeNodes = adapter.getAllConcepts(-1);
      const generator = new InsightGenerator(adapter);

      const gaps = await generator.detectGaps(activeNodes);

      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps[0].type).toBe('gap_detection');
      expect(gaps[0].description).toContain('unresolved-flake');
    });

    it('detectGaps does NOT fire when a domain-mate pattern resolves the error', async () => {
      await graph.loadFromPatterns([
        { id: 'p-resolved', name: 'Retry Pattern', description: 'd', domain: 'resolved-domain', patternType: 'flaky-fix', confidence: 0.9, successRate: 0.9 },
      ]);
      await graph.loadFailuresAsErrors([
        { id: 'null-resolved', sourcePatternId: 'p-other', domain: 'resolved-domain', failureMode: 'flake' },
      ]);
      const adapter = await buildTestAdapter(graph);
      const activeNodes = adapter.getAllConcepts(-1);
      const generator = new InsightGenerator(adapter);

      const gaps = await generator.detectGaps(activeNodes);

      const errorGaps = gaps.filter((g) => g.description.includes('flake'));
      expect(errorGaps.length).toBe(0);
    });

    it('detectPatternMerges fires for a co-activated, content-similar pattern/technique pair', async () => {
      await graph.loadFromPatterns([
        { id: 'p-merge-1', name: 'Coverage Boost', description: 'Increase branch coverage for risky code', domain: 'coverage-analysis', patternType: 'coverage-strategy', confidence: 0.85, successRate: 0.85 },
        { id: 'p-merge-2', name: 'Coverage Boost Alt', description: 'Increase branch coverage for risky code', domain: 'coverage-analysis', patternType: 'test-template', confidence: 0.85, successRate: 0.85 },
      ]);
      const adapter = await buildTestAdapter(graph);
      const nodes = adapter.getAllConcepts(-1);
      // Deterministic co-activation — no reliance on random spreading timing.
      for (const n of nodes) adapter.setActivation(n.id, 0.9);
      const boosted = adapter.getAllConcepts(-1);
      const generator = new InsightGenerator(adapter);

      const merges = await generator.detectPatternMerges(boosted);

      expect(merges.length).toBeGreaterThan(0);
      expect(merges[0].type).toBe('pattern_merge');
    });

    it('detectOptimizations fires for a real low-success-rate pattern', async () => {
      await graph.loadFromPatterns([{
        id: 'p-low-success',
        name: 'Struggling Pattern',
        description: 'Frequently fails',
        domain: 'test-generation',
        patternType: 'test-template',
        confidence: 0.8,
        successRate: 0.4, // below the 0.7 "room for improvement" threshold
      }]);
      const activeNodes = await graph.getActiveNodes(-1);
      const generator = new InsightGenerator(graph);

      const optimizations = await generator.detectOptimizations(activeNodes);

      expect(optimizations.length).toBeGreaterThan(0);
      expect(optimizations[0].type).toBe('optimization');
    });
  });
});
