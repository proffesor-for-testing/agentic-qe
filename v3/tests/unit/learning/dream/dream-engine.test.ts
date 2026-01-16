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
} from '../../../../src/learning/dream/index.js';
import { resetUnifiedPersistence, initializeUnifiedPersistence } from '../../../../src/kernel/unified-persistence.js';

// Unique test database path to avoid parallel test conflicts
const UNIFIED_DB_DIR = `.agentic-qe-test-dream-${process.pid}`;
const UNIFIED_DB_PATH = `${UNIFIED_DB_DIR}/memory.db`;

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
});
