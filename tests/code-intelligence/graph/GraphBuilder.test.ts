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
});
