/**
 * Unit Tests for GraphBuilder
 *
 * Tests node/edge management, queries, and traversal.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { GraphBuilder } from '../../../src/code-intelligence/graph/GraphBuilder.js';

describe('GraphBuilder', () => {
  let builder: GraphBuilder;

  beforeEach(() => {
    builder = new GraphBuilder();
  });

  describe('node operations', () => {
    it('should add a node', () => {
      const node = builder.addNode(
        'function',
        'processData',
        '/src/utils.ts',
        10,
        25,
        'typescript'
      );

      expect(node.id).toBeDefined();
      expect(node.type).toBe('function');
      expect(node.label).toBe('processData');
      expect(node.filePath).toBe('/src/utils.ts');
      expect(node.startLine).toBe(10);
      expect(node.endLine).toBe(25);
    });

    it('should add node with properties', () => {
      const node = builder.addNode(
        'class',
        'UserService',
        '/src/services.ts',
        1,
        100,
        'typescript',
        { visibility: 'public', abstract: false }
      );

      expect(node.properties.visibility).toBe('public');
      expect(node.properties.abstract).toBe(false);
    });

    it('should find node by label', () => {
      builder.addNode('function', 'helper', '/a.ts', 1, 10, 'typescript');

      const found = builder.findNode('helper');

      expect(found).toBeDefined();
      expect(found?.label).toBe('helper');
    });

    it('should find node by label and file', () => {
      builder.addNode('function', 'helper', '/a.ts', 1, 10, 'typescript');
      builder.addNode('function', 'helper', '/b.ts', 1, 10, 'typescript');

      const found = builder.findNode('helper', '/b.ts');

      expect(found?.filePath).toBe('/b.ts');
    });

    it('should find nodes by type', () => {
      builder.addNode('function', 'fn1', '/a.ts', 1, 10, 'typescript');
      builder.addNode('class', 'Class1', '/a.ts', 20, 50, 'typescript');
      builder.addNode('function', 'fn2', '/b.ts', 1, 10, 'typescript');

      const functions = builder.findNodesByType('function');

      expect(functions.length).toBe(2);
      expect(functions.every(n => n.type === 'function')).toBe(true);
    });

    it('should find nodes in file', () => {
      builder.addNode('function', 'fn1', '/a.ts', 1, 10, 'typescript');
      builder.addNode('class', 'Class1', '/a.ts', 20, 50, 'typescript');
      builder.addNode('function', 'fn2', '/b.ts', 1, 10, 'typescript');

      const nodesInA = builder.findNodesInFile('/a.ts');

      expect(nodesInA.length).toBe(2);
      expect(nodesInA.every(n => n.filePath === '/a.ts')).toBe(true);
    });

    it('should find or create node', () => {
      const created = builder.findOrCreateNode('function', 'test', '/a.ts', 1, 10, 'ts');
      const found = builder.findOrCreateNode('function', 'test', '/a.ts', 1, 10, 'ts');

      expect(created.id).toBe(found.id);
      expect(builder.getAllNodes().length).toBe(1);
    });

    it('should remove node', () => {
      const node = builder.addNode('function', 'toRemove', '/a.ts', 1, 10, 'ts');

      const removed = builder.removeNode(node.id);

      expect(removed).toBe(true);
      expect(builder.getNode(node.id)).toBeUndefined();
    });

    it('should remove all nodes in file', () => {
      builder.addNode('function', 'fn1', '/a.ts', 1, 10, 'typescript');
      builder.addNode('class', 'Class1', '/a.ts', 20, 50, 'typescript');
      builder.addNode('function', 'fn2', '/b.ts', 1, 10, 'typescript');

      const removed = builder.removeFile('/a.ts');

      expect(removed).toBe(2);
      expect(builder.findNodesInFile('/a.ts').length).toBe(0);
      expect(builder.getAllNodes().length).toBe(1);
    });
  });

  describe('edge operations', () => {
    it('should add an edge', () => {
      const fn = builder.addNode('function', 'caller', '/a.ts', 1, 10, 'ts');
      const cls = builder.addNode('class', 'Service', '/a.ts', 20, 50, 'ts');

      const edge = builder.addEdge(fn.id, cls.id, 'calls');

      expect(edge).toBeDefined();
      expect(edge?.source).toBe(fn.id);
      expect(edge?.target).toBe(cls.id);
      expect(edge?.type).toBe('calls');
    });

    it('should not add edge for non-existent nodes', () => {
      const fn = builder.addNode('function', 'fn', '/a.ts', 1, 10, 'ts');

      const edge = builder.addEdge(fn.id, 'non-existent', 'calls');

      expect(edge).toBeNull();
    });

    it('should add edge with weight', () => {
      const a = builder.addNode('function', 'a', '/a.ts', 1, 10, 'ts');
      const b = builder.addNode('function', 'b', '/a.ts', 20, 30, 'ts');

      const edge = builder.addEdge(a.id, b.id, 'calls', 0.8);

      expect(edge?.weight).toBe(0.8);
    });

    it('should get outgoing edges', () => {
      const a = builder.addNode('function', 'a', '/a.ts', 1, 10, 'ts');
      const b = builder.addNode('function', 'b', '/a.ts', 20, 30, 'ts');
      const c = builder.addNode('function', 'c', '/a.ts', 40, 50, 'ts');

      builder.addEdge(a.id, b.id, 'calls');
      builder.addEdge(a.id, c.id, 'calls');

      const outgoing = builder.getOutgoingEdges(a.id);

      expect(outgoing.length).toBe(2);
    });

    it('should get incoming edges', () => {
      const a = builder.addNode('function', 'a', '/a.ts', 1, 10, 'ts');
      const b = builder.addNode('function', 'b', '/a.ts', 20, 30, 'ts');
      const c = builder.addNode('function', 'c', '/a.ts', 40, 50, 'ts');

      builder.addEdge(a.id, c.id, 'calls');
      builder.addEdge(b.id, c.id, 'calls');

      const incoming = builder.getIncomingEdges(c.id);

      expect(incoming.length).toBe(2);
    });
  });

  describe('graph traversal', () => {
    beforeEach(() => {
      // Build a simple call graph
      //   main -> processData -> validate
      //        -> formatOutput
      const main = builder.addNode('function', 'main', '/app.ts', 1, 10, 'ts');
      const process = builder.addNode('function', 'processData', '/app.ts', 20, 40, 'ts');
      const validate = builder.addNode('function', 'validate', '/utils.ts', 1, 15, 'ts');
      const format = builder.addNode('function', 'formatOutput', '/utils.ts', 20, 35, 'ts');

      builder.addEdge(main.id, process.id, 'calls');
      builder.addEdge(main.id, format.id, 'calls');
      builder.addEdge(process.id, validate.id, 'calls');
    });

    it('should get outgoing neighbors', () => {
      const main = builder.findNode('main')!;

      const neighbors = builder.getNeighbors(main.id, 'outgoing');

      expect(neighbors.length).toBe(2);
      expect(neighbors.map(n => n.label).sort()).toEqual(['formatOutput', 'processData']);
    });

    it('should get incoming neighbors', () => {
      const validate = builder.findNode('validate')!;

      const neighbors = builder.getNeighbors(validate.id, 'incoming');

      expect(neighbors.length).toBe(1);
      expect(neighbors[0].label).toBe('processData');
    });

    it('should query with depth limit', () => {
      const main = builder.findNode('main')!;

      const result = builder.query({
        startNode: main.id,
        maxDepth: 1,
        direction: 'outgoing',
        limit: 10,
      });

      // Should find main, processData, formatOutput (depth 1)
      // Should NOT find validate (depth 2)
      expect(result.nodes.some(n => n.label === 'main')).toBe(true);
      expect(result.nodes.some(n => n.label === 'processData')).toBe(true);
      expect(result.nodes.some(n => n.label === 'formatOutput')).toBe(true);
      expect(result.nodes.some(n => n.label === 'validate')).toBe(false);
    });

    it('should query with depth 2', () => {
      const main = builder.findNode('main')!;

      const result = builder.query({
        startNode: main.id,
        maxDepth: 2,
        direction: 'outgoing',
        limit: 10,
      });

      // Now should find validate too
      expect(result.nodes.some(n => n.label === 'validate')).toBe(true);
    });

    it('should find path between nodes', () => {
      const main = builder.findNode('main')!;
      const validate = builder.findNode('validate')!;

      const path = builder.findPath(main.id, validate.id);

      expect(path).not.toBeNull();
      expect(path!.length).toBe(3);
      expect(path![0].label).toBe('main');
      expect(path![1].label).toBe('processData');
      expect(path![2].label).toBe('validate');
    });

    it('should return null for no path', () => {
      const main = builder.findNode('main')!;
      const isolated = builder.addNode('function', 'isolated', '/other.ts', 1, 10, 'ts');

      const path = builder.findPath(main.id, isolated.id);

      expect(path).toBeNull();
    });
  });

  describe('statistics', () => {
    it('should calculate correct stats', () => {
      builder.addNode('function', 'fn1', '/a.ts', 1, 10, 'ts');
      builder.addNode('function', 'fn2', '/a.ts', 20, 30, 'ts');
      builder.addNode('class', 'Class1', '/b.ts', 1, 50, 'ts');

      const fn1 = builder.findNode('fn1')!;
      const fn2 = builder.findNode('fn2')!;
      builder.addEdge(fn1.id, fn2.id, 'calls');

      const stats = builder.getStats();

      expect(stats.nodeCount).toBe(3);
      expect(stats.edgeCount).toBe(1);
      expect(stats.fileCount).toBe(2);
      expect(stats.nodesByType['function']).toBe(2);
      expect(stats.nodesByType['class']).toBe(1);
      expect(stats.edgesByType['calls']).toBe(1);
    });
  });

  describe('persistence', () => {
    it('should export and import graph', () => {
      const fn = builder.addNode('function', 'fn', '/a.ts', 1, 10, 'ts');
      const cls = builder.addNode('class', 'Service', '/a.ts', 20, 50, 'ts');
      builder.addEdge(fn.id, cls.id, 'calls');

      const exported = builder.exportGraph();

      const newBuilder = new GraphBuilder();
      newBuilder.importGraph(exported);

      expect(newBuilder.getAllNodes().length).toBe(2);
      expect(newBuilder.getAllEdges().length).toBe(1);
      expect(newBuilder.findNode('fn')).toBeDefined();
    });
  });

  describe('clear', () => {
    it('should clear entire graph', () => {
      builder.addNode('function', 'fn', '/a.ts', 1, 10, 'ts');
      builder.addNode('class', 'Service', '/a.ts', 20, 50, 'ts');

      builder.clear();

      expect(builder.getAllNodes().length).toBe(0);
      expect(builder.getAllEdges().length).toBe(0);
    });
  });

  describe('MinCut analysis methods', () => {
    describe('analyzeModuleCoupling', () => {
      it('should analyze coupling between modules', async () => {
        // Create two modules with coupling
        const authService = builder.addNode('class', 'AuthService', '/src/auth/service.ts', 1, 50, 'ts');
        const userService = builder.addNode('class', 'UserService', '/src/user/service.ts', 1, 50, 'ts');
        const authController = builder.addNode('class', 'AuthController', '/src/auth/controller.ts', 1, 30, 'ts');
        const userController = builder.addNode('class', 'UserController', '/src/user/controller.ts', 1, 30, 'ts');

        // Add coupling edges
        builder.addEdge(authService.id, userService.id, 'calls', 1.0);
        builder.addEdge(authController.id, authService.id, 'calls', 1.0);
        builder.addEdge(userController.id, userService.id, 'calls', 1.0);

        const results = await builder.analyzeModuleCoupling();

        expect(results).toBeInstanceOf(Array);
        // Should find coupling between auth and user modules
        const coupling = results.find(
          r =>
            (r.module1.includes('auth') && r.module2.includes('user')) ||
            (r.module1.includes('user') && r.module2.includes('auth'))
        );

        if (coupling) {
          expect(coupling.couplingStrength).toBeGreaterThanOrEqual(0);
          expect(coupling.couplingStrength).toBeLessThanOrEqual(1);
          expect(coupling.recommendations).toBeInstanceOf(Array);
          expect(coupling.cutEdges).toBeInstanceOf(Array);
        }
      });

      it('should respect threshold parameter', async () => {
        const a = builder.addNode('class', 'A', '/src/module1/a.ts', 1, 10, 'ts');
        const b = builder.addNode('class', 'B', '/src/module2/b.ts', 1, 10, 'ts');
        builder.addEdge(a.id, b.id, 'calls', 0.1);

        // Get results with default threshold
        const allResults = await builder.analyzeModuleCoupling();

        // Get results with high threshold
        const filteredResults = await builder.analyzeModuleCoupling({ threshold: 0.9 });

        // High threshold should reduce the number of results
        expect(filteredResults.length).toBeLessThanOrEqual(allResults.length);
      });
    });

    describe('detectCircularDependencies', () => {
      it('should detect simple circular dependency', async () => {
        // Create circular dependency: A -> B -> C -> A
        const nodeA = builder.addNode('class', 'A', '/src/a.ts', 1, 10, 'ts');
        const nodeB = builder.addNode('class', 'B', '/src/b.ts', 1, 10, 'ts');
        const nodeC = builder.addNode('class', 'C', '/src/c.ts', 1, 10, 'ts');

        builder.addEdge(nodeA.id, nodeB.id, 'imports', 1.0);
        builder.addEdge(nodeB.id, nodeC.id, 'imports', 1.0);
        builder.addEdge(nodeC.id, nodeA.id, 'imports', 1.0);

        const cycles = await builder.detectCircularDependencies();

        expect(cycles.length).toBeGreaterThan(0);
        const cycle = cycles[0];
        expect(cycle.cycle.length).toBeGreaterThanOrEqual(3);
        expect(cycle.severity).toMatch(/^(low|medium|high)$/);
        expect(cycle.breakPoints).toBeInstanceOf(Array);
        expect(cycle.breakPoints.length).toBeGreaterThan(0);
        expect(cycle.recommendations).toBeInstanceOf(Array);
      });

      it('should return empty array for acyclic graph', async () => {
        // Create acyclic dependency: A -> B -> C
        const nodeA = builder.addNode('class', 'A', '/src/a.ts', 1, 10, 'ts');
        const nodeB = builder.addNode('class', 'B', '/src/b.ts', 1, 10, 'ts');
        const nodeC = builder.addNode('class', 'C', '/src/c.ts', 1, 10, 'ts');

        builder.addEdge(nodeA.id, nodeB.id, 'imports', 1.0);
        builder.addEdge(nodeB.id, nodeC.id, 'imports', 1.0);

        const cycles = await builder.detectCircularDependencies();

        expect(cycles.length).toBe(0);
      });
    });

    describe('suggestModuleBoundaries', () => {
      it('should partition graph into target number of modules', async () => {
        // Create a graph with 6 files
        for (let i = 1; i <= 6; i++) {
          builder.addNode('class', `Class${i}`, `/src/file${i}.ts`, 1, 10, 'ts');
        }

        // Add some edges
        const nodes = builder.getAllNodes();
        for (let i = 0; i < nodes.length - 1; i++) {
          builder.addEdge(nodes[i].id, nodes[i + 1].id, 'imports', 1.0);
        }

        const result = await builder.suggestModuleBoundaries(3);

        expect(result.modules.length).toBeGreaterThanOrEqual(2);
        expect(result.modules.length).toBeLessThanOrEqual(3);
        expect(result.cutValues).toBeInstanceOf(Array);

        // Check all files are assigned
        const allFiles = result.modules.flat();
        expect(allFiles.length).toBe(6);
      });

      it('should throw error for invalid target count', async () => {
        builder.addNode('class', 'A', '/src/a.ts', 1, 10, 'ts');

        await expect(builder.suggestModuleBoundaries(1)).rejects.toThrow(
          'Target module count must be at least 2'
        );
      });
    });

    describe('calculateTestIsolation', () => {
      it('should calculate test isolation score', async () => {
        // Create test and production files
        const prodClass = builder.addNode('class', 'Service', '/src/service.ts', 1, 50, 'ts');
        const testClass = builder.addNode('class', 'ServiceTest', '/src/service.test.ts', 1, 30, 'ts');

        builder.addEdge(testClass.id, prodClass.id, 'imports', 1.0);

        const result = await builder.calculateTestIsolation();

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(result.testFiles.length).toBeGreaterThan(0);
        expect(result.productionFiles.length).toBeGreaterThan(0);
        expect(result.crossingDependencies).toBeGreaterThanOrEqual(0);
      });

      it('should support custom test file pattern', async () => {
        const prodClass = builder.addNode('class', 'Service', '/src/service.ts', 1, 50, 'ts');
        const specClass = builder.addNode('class', 'ServiceSpec', '/src/service.spec.ts', 1, 30, 'ts');

        builder.addEdge(specClass.id, prodClass.id, 'imports', 1.0);

        const result = await builder.calculateTestIsolation(/\.spec\.ts$/);

        expect(result.testFiles.length).toBe(1);
        expect(result.testFiles[0]).toContain('.spec.ts');
      });

      it('should return perfect isolation when no test files exist', async () => {
        builder.addNode('class', 'Service', '/src/service.ts', 1, 50, 'ts');

        const result = await builder.calculateTestIsolation();

        expect(result.score).toBe(1.0);
        expect(result.testFiles.length).toBe(0);
        expect(result.crossingDependencies).toBe(0);
      });
    });
  });
});
