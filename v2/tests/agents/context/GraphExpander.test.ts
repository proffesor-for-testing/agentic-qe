/**
 * Tests for GraphExpander
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { GraphBuilder } from '../../../src/code-intelligence/graph/GraphBuilder.js';
import { GraphExpander } from '../../../src/agents/context/GraphExpander.js';

describe('GraphExpander', () => {
  let graphBuilder: GraphBuilder;
  let expander: GraphExpander;

  beforeEach(() => {
    graphBuilder = new GraphBuilder();
    expander = new GraphExpander(graphBuilder);

    // Build a test graph
    setupTestGraph();
  });

  function setupTestGraph() {
    // Files
    const fileA = graphBuilder.addNode('file', 'fileA.ts', '/src/fileA.ts', 1, 100, 'typescript');
    const fileB = graphBuilder.addNode('file', 'fileB.ts', '/src/fileB.ts', 1, 80, 'typescript');
    const fileC = graphBuilder.addNode('file', 'fileC.ts', '/src/fileC.ts', 1, 60, 'typescript');
    const testFile = graphBuilder.addNode('file', 'fileA.test.ts', '/tests/fileA.test.ts', 1, 50, 'typescript');

    // Functions
    const funcA1 = graphBuilder.addNode('function', 'functionA1', '/src/fileA.ts', 10, 30, 'typescript');
    const funcA2 = graphBuilder.addNode('function', 'functionA2', '/src/fileA.ts', 40, 60, 'typescript');
    const funcB1 = graphBuilder.addNode('function', 'functionB1', '/src/fileB.ts', 10, 25, 'typescript');
    const funcC1 = graphBuilder.addNode('function', 'functionC1', '/src/fileC.ts', 10, 20, 'typescript');

    // Classes
    const classA = graphBuilder.addNode('class', 'ClassA', '/src/fileA.ts', 70, 90, 'typescript');
    const classB = graphBuilder.addNode('class', 'ClassB', '/src/fileB.ts', 40, 70, 'typescript');

    // Relationships
    graphBuilder.addEdge(fileA.id, fileB.id, 'imports'); // A imports B
    graphBuilder.addEdge(fileB.id, fileC.id, 'imports'); // B imports C
    graphBuilder.addEdge(testFile.id, fileA.id, 'tests'); // Test -> A
    graphBuilder.addEdge(funcA1.id, funcB1.id, 'calls'); // A1 calls B1
    graphBuilder.addEdge(funcA2.id, funcC1.id, 'calls'); // A2 calls C1
    graphBuilder.addEdge(classB.id, classA.id, 'extends'); // B extends A
  }

  describe('Basic Expansion', () => {
    it('should expand from a starting node', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');
      expect(fileA).toBeDefined();

      const result = expander.expand(fileA!.id, {
        maxDepth: 1,
        maxNodes: 10,
      });

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.totalNodesVisited).toBeGreaterThan(0);
      expect(result.maxDepthReached).toBe(1);
    });

    it('should respect max depth limit', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');

      const result = expander.expand(fileA!.id, {
        maxDepth: 2,
        maxNodes: 20,
      });

      expect(result.maxDepthReached).toBeLessThanOrEqual(2);
      result.nodes.forEach(node => {
        expect(node.depth).toBeLessThanOrEqual(2);
      });
    });

    it('should respect max nodes limit', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');

      const result = expander.expand(fileA!.id, {
        maxDepth: 3,
        maxNodes: 3,
      });

      expect(result.nodes.length).toBeLessThanOrEqual(3);
      expect(result.truncated).toBe(true);
    });

    it('should return empty result for invalid node', () => {
      const result = expander.expand('nonexistent-id');

      expect(result.nodes.length).toBe(0);
      expect(result.totalNodesVisited).toBe(0);
      expect(result.maxDepthReached).toBe(0);
    });
  });

  describe('Relationship Filtering', () => {
    it('should filter by edge type', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');

      const result = expander.expand(fileA!.id, {
        maxDepth: 2,
        maxNodes: 10,
        edgeTypes: ['imports'],
      });

      // Should only follow import edges
      result.nodes.forEach(node => {
        expect(node.relationshipPath.every(r => r === 'imports')).toBe(true);
      });
    });

    it('should filter by direction', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');

      const outgoingResult = expander.expand(fileA!.id, {
        maxDepth: 1,
        maxNodes: 10,
        direction: 'outgoing',
      });

      const incomingResult = expander.expand(fileA!.id, {
        maxDepth: 1,
        maxNodes: 10,
        direction: 'incoming',
      });

      // Results should differ based on direction
      expect(outgoingResult.nodes.length).toBeGreaterThan(0);
      expect(incomingResult.nodes.length).toBeGreaterThan(0);
    });

    it('should filter by edge weight', () => {
      // Add weighted edges
      const nodeX = graphBuilder.addNode('function', 'funcX', '/src/x.ts', 1, 10, 'typescript');
      const nodeY = graphBuilder.addNode('function', 'funcY', '/src/y.ts', 1, 10, 'typescript');
      const nodeZ = graphBuilder.addNode('function', 'funcZ', '/src/z.ts', 1, 10, 'typescript');

      graphBuilder.addEdge(nodeX.id, nodeY.id, 'calls', 0.9);
      graphBuilder.addEdge(nodeX.id, nodeZ.id, 'calls', 0.3);

      const result = expander.expand(nodeX.id, {
        maxDepth: 1,
        maxNodes: 10,
        minWeight: 0.5,
      });

      // Should only include high-weight edge
      expect(result.nodes.length).toBe(1);
      expect(result.nodes[0].node.label).toBe('funcY');
    });
  });

  describe('2-Hop Expansion', () => {
    it('should expand 2 hops for imports', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');

      const result = expander.expand(fileA!.id, {
        maxDepth: 2,
        maxNodes: 20,
        edgeTypes: ['imports'],
      });

      // Should find fileB (1-hop) and fileC (2-hop)
      const labels = result.nodes.map(n => n.node.label);
      expect(labels).toContain('fileB.ts');
      expect(labels).toContain('fileC.ts');

      // Check depth
      const fileC = result.nodes.find(n => n.node.label === 'fileC.ts');
      expect(fileC?.depth).toBe(2);
    });

    it('should build relationship paths', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');

      const result = expander.expand(fileA!.id, {
        maxDepth: 2,
        maxNodes: 20,
        edgeTypes: ['imports'],
      });

      const fileC = result.nodes.find(n => n.node.label === 'fileC.ts');
      expect(fileC?.relationshipPath).toEqual(['imports', 'imports']);
      expect(fileC?.path.length).toBe(3); // fileA -> fileB -> fileC
    });
  });

  describe('Multiple Starting Nodes', () => {
    it('should expand from multiple nodes', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');
      const fileB = graphBuilder.findNode('fileB.ts', '/src/fileB.ts', 'file');

      const result = expander.expandMultiple([fileA!.id, fileB!.id], {
        maxDepth: 1,
        maxNodes: 20,
      });

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.totalNodesVisited).toBeGreaterThan(0);
    });

    it('should deduplicate nodes from multiple starts', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');
      const fileB = graphBuilder.findNode('fileB.ts', '/src/fileB.ts', 'file');

      const result = expander.expandMultiple([fileA!.id, fileB!.id], {
        maxDepth: 2,
        maxNodes: 20,
        edgeTypes: ['imports'],
      });

      // fileC should appear only once even though reachable from both A and B
      const labels = result.nodes.map(n => n.node.label);
      const fileCCount = labels.filter(l => l === 'fileC.ts').length;
      expect(fileCCount).toBe(1);
    });
  });

  describe('Relationship-Specific Methods', () => {
    it('should get imports', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');

      const imports = expander.getImports(fileA!.id);

      expect(imports.length).toBeGreaterThan(0);
      expect(imports.every(n => n.relationship === 'imports')).toBe(true);
    });

    it('should get tests', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');

      const tests = expander.getTests(fileA!.id);

      expect(tests.length).toBe(1);
      expect(tests[0].node.label).toBe('fileA.test.ts');
      expect(tests[0].relationship).toBe('tests');
    });

    it('should get callers', () => {
      const funcB1 = graphBuilder.findNode('functionB1', '/src/fileB.ts', 'function');

      const callers = expander.getCallers(funcB1!.id);

      expect(callers.length).toBeGreaterThan(0);
      expect(callers.some(n => n.node.label === 'functionA1')).toBe(true);
    });

    it('should get inheritance chain', () => {
      const classA = graphBuilder.findNode('ClassA', '/src/fileA.ts', 'class');

      const chain = expander.getInheritanceChain(classA!.id);

      expect(chain.length).toBeGreaterThan(0);
      expect(chain.some(n => n.node.label === 'ClassB')).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete expansion quickly', () => {
      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');

      const result = expander.expand(fileA!.id, {
        maxDepth: 3,
        maxNodes: 50,
      });

      expect(result.executionTimeMs).toBeLessThan(100); // Should be < 100ms
    });

    it('should handle large expansion efficiently', () => {
      // Add more nodes for stress test
      for (let i = 0; i < 50; i++) {
        const node = graphBuilder.addNode(
          'function',
          `func${i}`,
          `/src/file${i}.ts`,
          1,
          10,
          'typescript'
        );

        // Connect to existing nodes
        const existing = graphBuilder.getAllNodes();
        if (existing.length > 1) {
          const target = existing[i % (existing.length - 1)];
          graphBuilder.addEdge(node.id, target.id, 'calls');
        }
      }

      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');

      const result = expander.expand(fileA!.id, {
        maxDepth: 4,
        maxNodes: 100,
      });

      expect(result.executionTimeMs).toBeLessThan(500); // Should be < 500ms
      expect(result.nodes.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      expander.updateConfig({
        maxDepth: 5,
        maxNodes: 50,
      });

      const config = expander.getConfig();
      expect(config.maxDepth).toBe(5);
      expect(config.maxNodes).toBe(50);
    });

    it('should use default configuration', () => {
      const config = expander.getConfig();
      expect(config.maxDepth).toBe(2);
      expect(config.maxNodes).toBe(20);
    });

    it('should merge configs on expand', () => {
      expander.updateConfig({ maxDepth: 1 });

      const fileA = graphBuilder.findNode('fileA.ts', '/src/fileA.ts', 'file');

      const result = expander.expand(fileA!.id, {
        maxDepth: 3, // Override default
      });

      expect(result.maxDepthReached).toBeLessThanOrEqual(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle circular references', () => {
      const nodeA = graphBuilder.addNode('class', 'CircularA', '/src/circular.ts', 1, 10, 'typescript');
      const nodeB = graphBuilder.addNode('class', 'CircularB', '/src/circular.ts', 20, 30, 'typescript');

      graphBuilder.addEdge(nodeA.id, nodeB.id, 'calls');
      graphBuilder.addEdge(nodeB.id, nodeA.id, 'calls');

      const result = expander.expand(nodeA.id, {
        maxDepth: 5,
        maxNodes: 20,
      });

      // Should not infinite loop
      expect(result.nodes.length).toBeLessThanOrEqual(20);
      expect(result.executionTimeMs).toBeLessThan(100);
    });

    it('should handle disconnected graph', () => {
      const isolated = graphBuilder.addNode('function', 'isolated', '/src/isolated.ts', 1, 10, 'typescript');

      const result = expander.expand(isolated.id, {
        maxDepth: 2,
        maxNodes: 10,
      });

      expect(result.nodes.length).toBe(0);
      expect(result.totalNodesVisited).toBe(1); // Just the start node
    });
  });
});
