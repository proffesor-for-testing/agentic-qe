/**
 * Agentic QE v3 - Hypergraph Engine Unit Tests
 *
 * Tests for the hypergraph query engine used in the RuVector Neural Backbone.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  HypergraphEngine,
  createHypergraphEngine,
  createHypergraphEngineSync,
} from '../../../../src/integrations/ruvector/hypergraph-engine';
import type {
  NodeCriteria,
  EdgeCriteria,
  CodeIndexResult,
  HypergraphStats,
} from '../../../../src/integrations/ruvector/hypergraph-engine';
import type { HypergraphNode, HypergraphEdge, NodeType, EdgeType } from '../../../../src/integrations/ruvector/hypergraph-schema';

describe('HypergraphEngine', () => {
  let db: Database.Database;
  let engine: HypergraphEngine;

  beforeEach(async () => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    engine = await createHypergraphEngine({ db });
  });

  afterEach(() => {
    db.close();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const freshDb = new Database(':memory:');
      const freshEngine = createHypergraphEngineSync({ db: freshDb });

      expect(freshEngine.isInitialized()).toBe(false);
      await freshEngine.initialize();
      expect(freshEngine.isInitialized()).toBe(true);

      freshDb.close();
    });

    it('should be idempotent (safe to call multiple times)', async () => {
      await engine.initialize();
      await engine.initialize();
      expect(engine.isInitialized()).toBe(true);
    });

    it('should create schema on initialization', async () => {
      // Verify tables exist
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name LIKE 'hypergraph%'
      `).all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('hypergraph_nodes');
      expect(tableNames).toContain('hypergraph_edges');
    });
  });

  describe('CRUD Operations - Nodes', () => {
    describe('addNode', () => {
      it('should add a minimal node', async () => {
        const id = await engine.addNode({
          type: 'function',
          name: 'testFunc',
        });

        expect(id).toBeDefined();
        expect(typeof id).toBe('string');

        const node = await engine.getNode(id);
        expect(node).not.toBeNull();
        expect(node!.type).toBe('function');
        expect(node!.name).toBe('testFunc');
      });

      it('should add a full node with all properties', async () => {
        const id = await engine.addNode({
          type: 'function',
          name: 'calculateSum',
          filePath: '/src/math.ts',
          lineStart: 10,
          lineEnd: 25,
          complexity: 5.5,
          coverage: 85.0,
          metadata: { params: ['a', 'b'], returns: 'number' },
          embedding: [0.1, 0.2, 0.3, 0.4],
        });

        const node = await engine.getNode(id);
        expect(node).not.toBeNull();
        expect(node!.filePath).toBe('/src/math.ts');
        expect(node!.lineStart).toBe(10);
        expect(node!.lineEnd).toBe(25);
        expect(node!.complexity).toBe(5.5);
        expect(node!.coverage).toBe(85.0);
        expect(node!.metadata).toEqual({ params: ['a', 'b'], returns: 'number' });
        expect(node!.embedding).toHaveLength(4);
      });

      it('should generate unique IDs', async () => {
        const id1 = await engine.addNode({ type: 'function', name: 'func1' });
        const id2 = await engine.addNode({ type: 'function', name: 'func2' });
        expect(id1).not.toBe(id2);
      });
    });

    describe('getNode', () => {
      it('should return null for non-existent node', async () => {
        const node = await engine.getNode('non-existent');
        expect(node).toBeNull();
      });

      it('should return node with timestamps', async () => {
        const id = await engine.addNode({ type: 'function', name: 'test' });
        const node = await engine.getNode(id);

        expect(node!.createdAt).toBeDefined();
        expect(node!.updatedAt).toBeDefined();
      });
    });

    describe('updateNode', () => {
      it('should update node properties', async () => {
        const id = await engine.addNode({
          type: 'function',
          name: 'originalName',
          complexity: 1.0,
        });

        await engine.updateNode(id, {
          name: 'updatedName',
          complexity: 5.0,
          coverage: 75.0,
        });

        const node = await engine.getNode(id);
        expect(node!.name).toBe('updatedName');
        expect(node!.complexity).toBe(5.0);
        expect(node!.coverage).toBe(75.0);
      });

      it('should throw for non-existent node', async () => {
        await expect(engine.updateNode('non-existent', { name: 'test' })).rejects.toThrow(
          'Node not found'
        );
      });

      it('should preserve unmodified properties', async () => {
        const id = await engine.addNode({
          type: 'function',
          name: 'test',
          filePath: '/src/test.ts',
          complexity: 3.0,
        });

        await engine.updateNode(id, { coverage: 50.0 });

        const node = await engine.getNode(id);
        expect(node!.name).toBe('test');
        expect(node!.filePath).toBe('/src/test.ts');
        expect(node!.complexity).toBe(3.0);
        expect(node!.coverage).toBe(50.0);
      });
    });

    describe('deleteNode', () => {
      it('should delete an existing node', async () => {
        const id = await engine.addNode({ type: 'function', name: 'toDelete' });
        expect(await engine.getNode(id)).not.toBeNull();

        await engine.deleteNode(id);
        expect(await engine.getNode(id)).toBeNull();
      });

      it('should delete connected edges when deleting node', async () => {
        const id1 = await engine.addNode({ type: 'function', name: 'func1' });
        const id2 = await engine.addNode({ type: 'function', name: 'func2' });
        const edgeId = await engine.addEdge({
          sourceId: id1,
          targetId: id2,
          type: 'calls',
        });

        await engine.deleteNode(id1);

        expect(await engine.getEdge(edgeId)).toBeNull();
      });
    });
  });

  describe('CRUD Operations - Edges', () => {
    let node1Id: string;
    let node2Id: string;

    beforeEach(async () => {
      node1Id = await engine.addNode({ type: 'function', name: 'func1' });
      node2Id = await engine.addNode({ type: 'function', name: 'func2' });
    });

    describe('addEdge', () => {
      it('should add an edge between nodes', async () => {
        const edgeId = await engine.addEdge({
          sourceId: node1Id,
          targetId: node2Id,
          type: 'calls',
        });

        expect(edgeId).toBeDefined();

        const edge = await engine.getEdge(edgeId);
        expect(edge).not.toBeNull();
        expect(edge!.sourceId).toBe(node1Id);
        expect(edge!.targetId).toBe(node2Id);
        expect(edge!.type).toBe('calls');
      });

      it('should add edge with weight and properties', async () => {
        const edgeId = await engine.addEdge({
          sourceId: node1Id,
          targetId: node2Id,
          type: 'calls',
          weight: 0.75,
          properties: { async: true, count: 5 },
        });

        const edge = await engine.getEdge(edgeId);
        expect(edge!.weight).toBe(0.75);
        expect(edge!.properties).toEqual({ async: true, count: 5 });
      });

      it('should generate deterministic edge IDs', async () => {
        const edgeId1 = await engine.addEdge({
          sourceId: node1Id,
          targetId: node2Id,
          type: 'calls',
        });

        // Same edge should have same ID
        const edgeId2 = await engine.addEdge({
          sourceId: node1Id,
          targetId: node2Id,
          type: 'calls',
          weight: 2.0, // Different weight, but same source/target/type
        });

        expect(edgeId1).toBe(edgeId2);
      });
    });

    describe('getEdge', () => {
      it('should return null for non-existent edge', async () => {
        const edge = await engine.getEdge('non-existent');
        expect(edge).toBeNull();
      });
    });

    describe('deleteEdge', () => {
      it('should delete an existing edge', async () => {
        const edgeId = await engine.addEdge({
          sourceId: node1Id,
          targetId: node2Id,
          type: 'calls',
        });

        expect(await engine.getEdge(edgeId)).not.toBeNull();
        await engine.deleteEdge(edgeId);
        expect(await engine.getEdge(edgeId)).toBeNull();
      });
    });
  });

  describe('Query Methods', () => {
    beforeEach(async () => {
      // Set up test data
      await engine.addNode({ type: 'function', name: 'func1', filePath: '/src/a.ts', complexity: 3, coverage: 80 });
      await engine.addNode({ type: 'function', name: 'func2', filePath: '/src/a.ts', complexity: 7, coverage: 40 });
      await engine.addNode({ type: 'function', name: 'func3', filePath: '/src/b.ts', complexity: 5, coverage: 60 });
      await engine.addNode({ type: 'class', name: 'TestClass', filePath: '/src/a.ts', complexity: 10, coverage: 90 });
      await engine.addNode({ type: 'test', name: 'testFunc1', filePath: '/tests/a.test.ts' });
      await engine.addNode({ type: 'module', name: 'utils', filePath: '/src/utils.ts' });
    });

    describe('findNodes', () => {
      it('should find nodes by type', async () => {
        const functions = await engine.findNodes({ type: 'function' });
        expect(functions).toHaveLength(3);
        expect(functions.every((n) => n.type === 'function')).toBe(true);
      });

      it('should find nodes by multiple types', async () => {
        const nodes = await engine.findNodes({ type: ['function', 'class'] });
        expect(nodes).toHaveLength(4);
      });

      it('should find nodes by file path', async () => {
        const nodes = await engine.findNodes({ filePath: '/src/a.ts' });
        expect(nodes).toHaveLength(3);
      });

      it('should find nodes by file path pattern', async () => {
        // Test data has: 3 funcs in /src/a.ts + /src/b.ts, 1 class in /src/a.ts, 1 module in /src/utils.ts = 5 in /src/
        const nodes = await engine.findNodes({ filePath: '/src/%' });
        expect(nodes).toHaveLength(5);
      });

      it('should find nodes by name', async () => {
        const nodes = await engine.findNodes({ name: 'func1' });
        expect(nodes).toHaveLength(1);
        expect(nodes[0].name).toBe('func1');
      });

      it('should find nodes by name regex', async () => {
        const nodes = await engine.findNodes({ name: /^func\d$/ });
        expect(nodes).toHaveLength(3);
      });

      it('should find nodes by complexity range', async () => {
        const nodes = await engine.findNodes({ minComplexity: 5, maxComplexity: 8 });
        expect(nodes).toHaveLength(2);
      });

      it('should find nodes by coverage range', async () => {
        const nodes = await engine.findNodes({ minCoverage: 50, maxCoverage: 85 });
        expect(nodes).toHaveLength(2);
      });

      it('should respect limit', async () => {
        const nodes = await engine.findNodes({ type: 'function', limit: 2 });
        expect(nodes).toHaveLength(2);
      });

      it('should combine multiple criteria', async () => {
        const nodes = await engine.findNodes({
          type: 'function',
          filePath: '/src/a.ts',
          minComplexity: 5,
        });
        expect(nodes).toHaveLength(1);
        expect(nodes[0].name).toBe('func2');
      });

      it('should return empty array when no matches', async () => {
        const nodes = await engine.findNodes({ type: 'function', minCoverage: 100 });
        expect(nodes).toHaveLength(0);
      });
    });

    describe('findEdges', () => {
      let funcId1: string;
      let funcId2: string;
      let funcId3: string;

      beforeEach(async () => {
        const funcs = await engine.findNodes({ type: 'function' });
        funcId1 = funcs[0].id;
        funcId2 = funcs[1].id;
        funcId3 = funcs[2].id;

        await engine.addEdge({ sourceId: funcId1, targetId: funcId2, type: 'calls', weight: 1.0 });
        await engine.addEdge({ sourceId: funcId1, targetId: funcId3, type: 'calls', weight: 0.5 });
        await engine.addEdge({ sourceId: funcId2, targetId: funcId3, type: 'imports' });
      });

      it('should find edges by type', async () => {
        const edges = await engine.findEdges({ type: 'calls' });
        expect(edges).toHaveLength(2);
      });

      it('should find edges by multiple types', async () => {
        const edges = await engine.findEdges({ type: ['calls', 'imports'] });
        expect(edges).toHaveLength(3);
      });

      it('should find edges by source', async () => {
        const edges = await engine.findEdges({ sourceId: funcId1 });
        expect(edges).toHaveLength(2);
      });

      it('should find edges by target', async () => {
        const edges = await engine.findEdges({ targetId: funcId3 });
        expect(edges).toHaveLength(2);
      });

      it('should find edges by minimum weight', async () => {
        const edges = await engine.findEdges({ minWeight: 0.8 });
        expect(edges).toHaveLength(2); // 1.0 from calls and default 1.0 from imports
      });

      it('should combine criteria', async () => {
        const edges = await engine.findEdges({
          type: 'calls',
          sourceId: funcId1,
        });
        expect(edges).toHaveLength(2);
      });
    });
  });

  describe('Traversal', () => {
    let nodeA: string;
    let nodeB: string;
    let nodeC: string;
    let nodeD: string;

    beforeEach(async () => {
      // Create a simple graph: A -> B -> C -> D
      nodeA = await engine.addNode({ type: 'function', name: 'A' });
      nodeB = await engine.addNode({ type: 'function', name: 'B' });
      nodeC = await engine.addNode({ type: 'function', name: 'C' });
      nodeD = await engine.addNode({ type: 'function', name: 'D' });

      await engine.addEdge({ sourceId: nodeA, targetId: nodeB, type: 'calls' });
      await engine.addEdge({ sourceId: nodeB, targetId: nodeC, type: 'calls' });
      await engine.addEdge({ sourceId: nodeC, targetId: nodeD, type: 'calls' });
    });

    it('should traverse from start node', async () => {
      const result = await engine.traverse(nodeA, ['calls'], 5);

      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(3);
      expect(result.maxDepthReached).toBe(3);
    });

    it('should respect max depth', async () => {
      const result = await engine.traverse(nodeA, ['calls'], 2);

      expect(result.nodes).toHaveLength(3); // A, B, C
      expect(result.maxDepthReached).toBe(2);
    });

    it('should filter by edge type', async () => {
      // Add an imports edge
      await engine.addEdge({ sourceId: nodeA, targetId: nodeD, type: 'imports' });

      const callsOnly = await engine.traverse(nodeA, ['calls'], 5);
      expect(callsOnly.edges.every((e) => e.type === 'calls')).toBe(true);

      const allTypes = await engine.traverse(nodeA, [], 5);
      expect(allTypes.edges.length).toBeGreaterThan(callsOnly.edges.length);
    });

    it('should return paths', async () => {
      const result = await engine.traverse(nodeA, ['calls'], 5);

      expect(result.paths.length).toBeGreaterThan(0);
      expect(result.paths[0].nodes[0]).toBe(nodeA);
    });

    it('should handle no outgoing edges', async () => {
      const result = await engine.traverse(nodeD, ['calls'], 5);

      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(0);
      expect(result.maxDepthReached).toBe(0);
    });
  });

  describe('QE-Specific Methods', () => {
    describe('findUntestedFunctions', () => {
      it('should find functions without test coverage', async () => {
        // Create functions
        const func1 = await engine.addNode({ type: 'function', name: 'testedFunc', complexity: 3 });
        const func2 = await engine.addNode({ type: 'function', name: 'untestedFunc', complexity: 7 });
        const func3 = await engine.addNode({ type: 'function', name: 'anotherUntested', complexity: 5 });

        // Create test that covers func1
        const test1 = await engine.addNode({ type: 'test', name: 'test1' });
        await engine.addEdge({ sourceId: test1, targetId: func1, type: 'covers' });

        const untested = await engine.findUntestedFunctions();

        expect(untested).toHaveLength(2);
        expect(untested.map((n) => n.name)).toContain('untestedFunc');
        expect(untested.map((n) => n.name)).toContain('anotherUntested');
        expect(untested.map((n) => n.name)).not.toContain('testedFunc');
      });

      it('should order by complexity descending', async () => {
        await engine.addNode({ type: 'function', name: 'lowComplex', complexity: 2 });
        await engine.addNode({ type: 'function', name: 'highComplex', complexity: 10 });
        await engine.addNode({ type: 'function', name: 'medComplex', complexity: 5 });

        const untested = await engine.findUntestedFunctions();

        expect(untested[0].name).toBe('highComplex');
        expect(untested[1].name).toBe('medComplex');
        expect(untested[2].name).toBe('lowComplex');
      });

      it('should return empty when all functions are tested', async () => {
        const func1 = await engine.addNode({ type: 'function', name: 'tested' });
        const test1 = await engine.addNode({ type: 'test', name: 'test1' });
        await engine.addEdge({ sourceId: test1, targetId: func1, type: 'covers' });

        const untested = await engine.findUntestedFunctions();
        expect(untested).toHaveLength(0);
      });
    });

    describe('findImpactedTests', () => {
      it('should find tests that cover functions in changed files', async () => {
        // Create structure
        const func1 = await engine.addNode({ type: 'function', name: 'func1', filePath: '/src/a.ts' });
        const func2 = await engine.addNode({ type: 'function', name: 'func2', filePath: '/src/b.ts' });
        const test1 = await engine.addNode({ type: 'test', name: 'test1', filePath: '/tests/a.test.ts' });
        const test2 = await engine.addNode({ type: 'test', name: 'test2', filePath: '/tests/b.test.ts' });

        await engine.addEdge({ sourceId: test1, targetId: func1, type: 'covers' });
        await engine.addEdge({ sourceId: test2, targetId: func2, type: 'covers' });

        const impacted = await engine.findImpactedTests(['/src/a.ts']);

        expect(impacted).toHaveLength(1);
        expect(impacted[0].name).toBe('test1');
      });

      it('should find all tests for multiple changed files', async () => {
        const func1 = await engine.addNode({ type: 'function', name: 'func1', filePath: '/src/a.ts' });
        const func2 = await engine.addNode({ type: 'function', name: 'func2', filePath: '/src/b.ts' });
        const test1 = await engine.addNode({ type: 'test', name: 'test1' });
        const test2 = await engine.addNode({ type: 'test', name: 'test2' });

        await engine.addEdge({ sourceId: test1, targetId: func1, type: 'covers' });
        await engine.addEdge({ sourceId: test2, targetId: func2, type: 'covers' });

        const impacted = await engine.findImpactedTests(['/src/a.ts', '/src/b.ts']);

        expect(impacted).toHaveLength(2);
      });

      it('should return unique tests even if multiple functions covered', async () => {
        const func1 = await engine.addNode({ type: 'function', name: 'func1', filePath: '/src/a.ts' });
        const func2 = await engine.addNode({ type: 'function', name: 'func2', filePath: '/src/a.ts' });
        const test1 = await engine.addNode({ type: 'test', name: 'test1' });

        await engine.addEdge({ sourceId: test1, targetId: func1, type: 'covers' });
        await engine.addEdge({ sourceId: test1, targetId: func2, type: 'covers' });

        const impacted = await engine.findImpactedTests(['/src/a.ts']);

        expect(impacted).toHaveLength(1);
      });

      it('should return empty array for no changed files', async () => {
        const impacted = await engine.findImpactedTests([]);
        expect(impacted).toHaveLength(0);
      });
    });

    describe('findCoverageGaps', () => {
      it('should find functions with low coverage', async () => {
        await engine.addNode({ type: 'function', name: 'highCov', coverage: 90 });
        await engine.addNode({ type: 'function', name: 'medCov', coverage: 60 });
        await engine.addNode({ type: 'function', name: 'lowCov', coverage: 30 });
        await engine.addNode({ type: 'function', name: 'zeroCov', coverage: 0 });

        const gaps = await engine.findCoverageGaps(50);

        expect(gaps).toHaveLength(2);
        expect(gaps.map((n) => n.name)).toContain('lowCov');
        expect(gaps.map((n) => n.name)).toContain('zeroCov');
      });

      it('should order by coverage ascending', async () => {
        await engine.addNode({ type: 'function', name: 'cov40', coverage: 40 });
        await engine.addNode({ type: 'function', name: 'cov10', coverage: 10 });
        await engine.addNode({ type: 'function', name: 'cov25', coverage: 25 });

        const gaps = await engine.findCoverageGaps(50);

        expect(gaps[0].name).toBe('cov10');
        expect(gaps[1].name).toBe('cov25');
        expect(gaps[2].name).toBe('cov40');
      });

      it('should use default threshold of 50', async () => {
        await engine.addNode({ type: 'function', name: 'below', coverage: 49 });
        await engine.addNode({ type: 'function', name: 'at', coverage: 50 });
        await engine.addNode({ type: 'function', name: 'above', coverage: 51 });

        const gaps = await engine.findCoverageGaps();

        expect(gaps).toHaveLength(2);
        expect(gaps.map((n) => n.name)).toContain('below');
        expect(gaps.map((n) => n.name)).toContain('at');
      });

      it('should ignore nodes without coverage', async () => {
        await engine.addNode({ type: 'function', name: 'noCoverage' }); // coverage undefined
        await engine.addNode({ type: 'function', name: 'hasCoverage', coverage: 30 });

        const gaps = await engine.findCoverageGaps(50);

        expect(gaps).toHaveLength(1);
        expect(gaps[0].name).toBe('hasCoverage');
      });
    });

    describe('findModuleDependencies', () => {
      it('should find direct dependencies', async () => {
        const moduleA = await engine.addNode({ type: 'module', name: 'moduleA', filePath: '/src/a.ts' });
        const moduleB = await engine.addNode({ type: 'module', name: 'moduleB', filePath: '/src/b.ts' });
        const moduleC = await engine.addNode({ type: 'module', name: 'moduleC', filePath: '/src/c.ts' });

        await engine.addEdge({ sourceId: moduleA, targetId: moduleB, type: 'imports' });
        await engine.addEdge({ sourceId: moduleA, targetId: moduleC, type: 'imports' });

        const result = await engine.findModuleDependencies('/src/a.ts');

        expect(result.module.name).toBe('moduleA');
        expect(result.directDependencies).toHaveLength(2);
      });

      it('should find dependents', async () => {
        const moduleA = await engine.addNode({ type: 'module', name: 'moduleA', filePath: '/src/a.ts' });
        const moduleB = await engine.addNode({ type: 'module', name: 'moduleB', filePath: '/src/b.ts' });

        await engine.addEdge({ sourceId: moduleB, targetId: moduleA, type: 'imports' });

        const result = await engine.findModuleDependencies('/src/a.ts');

        expect(result.dependents).toHaveLength(1);
        expect(result.dependents[0].name).toBe('moduleB');
      });

      it('should find transitive dependencies', async () => {
        const moduleA = await engine.addNode({ type: 'module', name: 'A', filePath: '/src/a.ts' });
        const moduleB = await engine.addNode({ type: 'module', name: 'B', filePath: '/src/b.ts' });
        const moduleC = await engine.addNode({ type: 'module', name: 'C', filePath: '/src/c.ts' });

        await engine.addEdge({ sourceId: moduleA, targetId: moduleB, type: 'imports' });
        await engine.addEdge({ sourceId: moduleB, targetId: moduleC, type: 'imports' });

        const result = await engine.findModuleDependencies('/src/a.ts');

        expect(result.transitiveDependencies.length).toBeGreaterThanOrEqual(2);
        expect(result.maxDependencyDepth).toBeGreaterThanOrEqual(2);
      });

      it('should throw for non-existent module', async () => {
        await expect(engine.findModuleDependencies('/non/existent.ts')).rejects.toThrow(
          'Module not found'
        );
      });

      it('should work with file nodes if no module node exists', async () => {
        const fileA = await engine.addNode({ type: 'file', name: 'a.ts', filePath: '/src/a.ts' });
        const fileB = await engine.addNode({ type: 'file', name: 'b.ts', filePath: '/src/b.ts' });

        await engine.addEdge({ sourceId: fileA, targetId: fileB, type: 'imports' });

        const result = await engine.findModuleDependencies('/src/a.ts');

        expect(result.module.type).toBe('file');
        expect(result.directDependencies).toHaveLength(1);
      });
    });
  });

  describe('Graph Building', () => {
    describe('buildFromIndexResult', () => {
      it('should build graph from index result', async () => {
        const indexResult: CodeIndexResult = {
          files: [
            {
              path: '/src/math.ts',
              entities: [
                { type: 'function', name: 'add', lineStart: 1, lineEnd: 5, complexity: 2 },
                { type: 'function', name: 'subtract', lineStart: 7, lineEnd: 11, complexity: 2 },
                { type: 'class', name: 'Calculator', lineStart: 13, lineEnd: 50, complexity: 8 },
              ],
              imports: ['/src/utils.ts'],
            },
            {
              path: '/src/utils.ts',
              entities: [
                { type: 'function', name: 'validate', lineStart: 1, lineEnd: 10, complexity: 3 },
              ],
              imports: [],
            },
          ],
        };

        const result = await engine.buildFromIndexResult(indexResult);

        // Should create nodes: 2 file nodes + 4 entity nodes = 6 nodes
        expect(result.nodesCreated).toBe(6);
        // Should create edges: 1 import edge from math.ts -> utils.ts
        expect(result.edgesCreated).toBe(1);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.errors).toHaveLength(0);

        // Verify nodes were created
        const stats = await engine.getStats();
        expect(stats.totalNodes).toBe(6);
        expect(stats.totalEdges).toBe(1);
      });

      it('should update existing nodes on rebuild', async () => {
        const indexResult1: CodeIndexResult = {
          files: [
            {
              path: '/src/a.ts',
              entities: [{ type: 'function', name: 'func', lineStart: 1 }],
              imports: [],
            },
          ],
        };

        const result1 = await engine.buildFromIndexResult(indexResult1);
        expect(result1.nodesCreated).toBeGreaterThan(0);

        // Rebuild with same files
        const result2 = await engine.buildFromIndexResult(indexResult1);
        expect(result2.nodesUpdated).toBeGreaterThan(0);
      });

      it('should handle build errors gracefully', async () => {
        const indexResult: CodeIndexResult = {
          files: [
            {
              path: '/src/valid.ts',
              entities: [{ type: 'function', name: 'valid', lineStart: 1 }],
              imports: [],
            },
          ],
        };

        const result = await engine.buildFromIndexResult(indexResult);

        // Even with some errors, valid files should be processed
        expect(result.nodesCreated).toBeGreaterThan(0);
      });
    });
  });

  describe('Statistics', () => {
    it('should return correct stats for empty graph', async () => {
      const stats = await engine.getStats();

      expect(stats.totalNodes).toBe(0);
      expect(stats.totalEdges).toBe(0);
      expect(stats.avgComplexity).toBe(0);
      expect(stats.avgCoverage).toBe(0);
    });

    it('should return correct stats for populated graph', async () => {
      await engine.addNode({ type: 'function', name: 'f1', complexity: 5, coverage: 80 });
      await engine.addNode({ type: 'function', name: 'f2', complexity: 10, coverage: 60 });
      await engine.addNode({ type: 'class', name: 'c1', complexity: 15 });
      await engine.addNode({ type: 'test', name: 't1' });

      const f1 = (await engine.findNodes({ name: 'f1' }))[0];
      const f2 = (await engine.findNodes({ name: 'f2' }))[0];
      await engine.addEdge({ sourceId: f1.id, targetId: f2.id, type: 'calls' });
      await engine.addEdge({ sourceId: f1.id, targetId: f2.id, type: 'imports' });

      const stats = await engine.getStats();

      expect(stats.totalNodes).toBe(4);
      expect(stats.totalEdges).toBe(2);
      expect(stats.nodesByType.function).toBe(2);
      expect(stats.nodesByType.class).toBe(1);
      expect(stats.nodesByType.test).toBe(1);
      expect(stats.edgesByType.calls).toBe(1);
      expect(stats.edgesByType.imports).toBe(1);
      expect(stats.avgComplexity).toBe(10); // (5 + 10 + 15) / 3
      expect(stats.avgCoverage).toBe(70); // (80 + 60) / 2
    });

    it('should track nodes with embeddings', async () => {
      await engine.addNode({ type: 'function', name: 'withEmb', embedding: [0.1, 0.2] });
      await engine.addNode({ type: 'function', name: 'withoutEmb' });

      const stats = await engine.getStats();

      expect(stats.nodesWithEmbeddings).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should throw if not initialized', async () => {
      const freshDb = new Database(':memory:');
      const uninitEngine = createHypergraphEngineSync({ db: freshDb });

      await expect(uninitEngine.addNode({ type: 'function', name: 'test' })).rejects.toThrow(
        'not initialized'
      );

      freshDb.close();
    });
  });

  describe('Factory Functions', () => {
    it('createHypergraphEngine should return initialized engine', async () => {
      const freshDb = new Database(':memory:');
      const createdEngine = await createHypergraphEngine({ db: freshDb });

      expect(createdEngine.isInitialized()).toBe(true);

      freshDb.close();
    });

    it('createHypergraphEngineSync should return uninitialized engine', () => {
      const freshDb = new Database(':memory:');
      const createdEngine = createHypergraphEngineSync({ db: freshDb });

      expect(createdEngine.isInitialized()).toBe(false);

      freshDb.close();
    });
  });
});
