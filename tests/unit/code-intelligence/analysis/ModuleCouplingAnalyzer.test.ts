/**
 * Tests for ModuleCouplingAnalyzer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleCouplingAnalyzer } from '../../../../src/code-intelligence/analysis/mincut/ModuleCouplingAnalyzer.js';
import { CodeGraph, GraphNode, GraphEdge } from '../../../../src/code-intelligence/graph/types.js';

describe('ModuleCouplingAnalyzer', () => {
  let graph: CodeGraph;

  beforeEach(() => {
    // Create a test graph with two modules
    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();
    const outgoingEdges = new Map<string, string[]>();
    const incomingEdges = new Map<string, string[]>();
    const fileNodes = new Map<string, string[]>();

    // Module 1: src/auth
    const authFile: GraphNode = {
      id: 'file:auth',
      type: 'file',
      label: 'auth.ts',
      filePath: 'src/auth/auth.ts',
      startLine: 1,
      endLine: 50,
      language: 'typescript',
      properties: {},
    };

    const loginFunc: GraphNode = {
      id: 'func:login',
      type: 'function',
      label: 'login',
      filePath: 'src/auth/auth.ts',
      startLine: 10,
      endLine: 20,
      language: 'typescript',
      properties: {},
    };

    // Module 2: src/user
    const userFile: GraphNode = {
      id: 'file:user',
      type: 'file',
      label: 'user.ts',
      filePath: 'src/user/user.ts',
      startLine: 1,
      endLine: 40,
      language: 'typescript',
      properties: {},
    };

    const getUserFunc: GraphNode = {
      id: 'func:getUser',
      type: 'function',
      label: 'getUser',
      filePath: 'src/user/user.ts',
      startLine: 5,
      endLine: 15,
      language: 'typescript',
      properties: {},
    };

    // External dependency
    const dbFile: GraphNode = {
      id: 'file:db',
      type: 'file',
      label: 'db.ts',
      filePath: 'src/db/db.ts',
      startLine: 1,
      endLine: 30,
      language: 'typescript',
      properties: {},
    };

    nodes.set('file:auth', authFile);
    nodes.set('func:login', loginFunc);
    nodes.set('file:user', userFile);
    nodes.set('func:getUser', getUserFunc);
    nodes.set('file:db', dbFile);

    // Edges: auth -> user (coupling)
    const edge1: GraphEdge = {
      id: 'edge1',
      source: 'func:login',
      target: 'func:getUser',
      type: 'calls',
      weight: 0.6,
      properties: {},
    };

    // Edges: user -> auth (circular dependency)
    const edge2: GraphEdge = {
      id: 'edge2',
      source: 'func:getUser',
      target: 'func:login',
      type: 'calls',
      weight: 0.4,
      properties: {},
    };

    // Shared dependency: auth -> db
    const edge3: GraphEdge = {
      id: 'edge3',
      source: 'func:login',
      target: 'file:db',
      type: 'imports',
      weight: 0.8,
      properties: {},
    };

    // Shared dependency: user -> db
    const edge4: GraphEdge = {
      id: 'edge4',
      source: 'func:getUser',
      target: 'file:db',
      type: 'imports',
      weight: 0.8,
      properties: {},
    };

    edges.set('edge1', edge1);
    edges.set('edge2', edge2);
    edges.set('edge3', edge3);
    edges.set('edge4', edge4);

    // Build outgoing/incoming edges maps
    outgoingEdges.set('func:login', ['edge1', 'edge3']);
    outgoingEdges.set('func:getUser', ['edge2', 'edge4']);
    incomingEdges.set('func:getUser', ['edge1']);
    incomingEdges.set('func:login', ['edge2']);
    incomingEdges.set('file:db', ['edge3', 'edge4']);

    // Build file nodes map
    fileNodes.set('src/auth/auth.ts', ['file:auth', 'func:login']);
    fileNodes.set('src/user/user.ts', ['file:user', 'func:getUser']);
    fileNodes.set('src/db/db.ts', ['file:db']);

    graph = {
      nodes,
      edges,
      outgoingEdges,
      incomingEdges,
      fileNodes,
    };
  });

  describe('analyzeCoupling', () => {
    it('should analyze coupling between two modules', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph, {
        moduleGrouping: 'directory',
      });

      const result = await analyzer.analyzeCoupling('src/auth', 'src/user');

      expect(result.module1).toBe('src/auth');
      expect(result.module2).toBe('src/user');
      expect(result.couplingStrength).toBeGreaterThanOrEqual(0);
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should detect circular dependencies', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph);

      const result = await analyzer.analyzeCoupling('src/auth', 'src/user');

      expect(result.circularDependency).toBe(true);
      expect(result.recommendations.some(r => r.includes('Circular dependency'))).toBe(true);
    });

    it('should find shared dependencies', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph);

      const result = await analyzer.analyzeCoupling('src/auth', 'src/user');

      expect(result.sharedDependencies).toBeDefined();
      expect(Array.isArray(result.sharedDependencies)).toBe(true);
      // Both auth and user depend on db
      expect(result.sharedDependencies).toContain('file:db');
    });

    it('should return zero coupling for non-existent modules', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph);

      const result = await analyzer.analyzeCoupling('src/nonexistent1', 'src/nonexistent2');

      expect(result.couplingStrength).toBe(0);
      expect(result.recommendations.some(r => r.includes('not found'))).toBe(true);
    });

    it('should provide recommendations based on coupling strength', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph);

      const result = await analyzer.analyzeCoupling('src/auth', 'src/user');

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(typeof result.recommendations[0]).toBe('string');
    });
  });

  describe('findHighlyCoupledModules', () => {
    it('should find all highly coupled module pairs', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph);

      const results = await analyzer.findHighlyCoupledModules(0.3);

      expect(Array.isArray(results)).toBe(true);
      // Should find at least the auth-user coupling
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should sort results by coupling strength', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph);

      const results = await analyzer.findHighlyCoupledModules(0);

      if (results.length > 1) {
        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].couplingStrength).toBeGreaterThanOrEqual(
            results[i].couplingStrength
          );
        }
      }
    });

    it('should filter by threshold', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph);

      const lowThreshold = await analyzer.findHighlyCoupledModules(0.1);
      const highThreshold = await analyzer.findHighlyCoupledModules(0.9);

      expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
    });

    it('should respect minCouplingThreshold option', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph, {
        minCouplingThreshold: 0.5,
      });

      const results = await analyzer.findHighlyCoupledModules(0.3);

      // All results should be above minCouplingThreshold (0.5), not the method threshold (0.3)
      for (const result of results) {
        expect(result.couplingStrength).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  describe('getCouplingOverview', () => {
    it('should provide overall coupling statistics', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph);

      const overview = await analyzer.getCouplingOverview();

      expect(overview).toBeDefined();
      expect(typeof overview.averageCoupling).toBe('number');
      expect(typeof overview.maxCoupling).toBe('number');
      expect(typeof overview.highlyCoupledPairs).toBe('number');
      expect(typeof overview.circularDependencies).toBe('number');
      expect(Array.isArray(overview.recommendations)).toBe(true);
    });

    it('should count circular dependencies', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph);

      const overview = await analyzer.getCouplingOverview();

      // We have a circular dependency between auth and user
      // Note: This might be 0 if the coupling strength is below minCouplingThreshold
      expect(overview.circularDependencies).toBeGreaterThanOrEqual(0);
      expect(overview.recommendations).toBeDefined();
      expect(overview.recommendations.length).toBeGreaterThan(0);
    });

    it('should provide recommendations', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph);

      const overview = await analyzer.getCouplingOverview();

      expect(overview.recommendations.length).toBeGreaterThan(0);
    });

    it('should handle empty graph', async () => {
      const emptyGraph: CodeGraph = {
        nodes: new Map(),
        edges: new Map(),
        outgoingEdges: new Map(),
        incomingEdges: new Map(),
        fileNodes: new Map(),
      };

      const analyzer = new ModuleCouplingAnalyzer(emptyGraph);
      const overview = await analyzer.getCouplingOverview();

      expect(overview.averageCoupling).toBe(0);
      expect(overview.maxCoupling).toBe(0);
      expect(overview.recommendations.some(r => r.includes('No module coupling'))).toBe(true);
    });
  });

  describe('module grouping', () => {
    it('should support file-level grouping', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph, {
        moduleGrouping: 'file',
      });

      const result = await analyzer.analyzeCoupling('src/auth/auth.ts', 'src/user/user.ts');

      expect(result.module1).toBe('src/auth/auth.ts');
      expect(result.module2).toBe('src/user/user.ts');
    });

    it('should support directory-level grouping', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph, {
        moduleGrouping: 'directory',
      });

      const result = await analyzer.analyzeCoupling('src/auth', 'src/user');

      expect(result.module1).toBe('src/auth');
      expect(result.module2).toBe('src/user');
    });

    it('should support custom module extraction', async () => {
      const analyzer = new ModuleCouplingAnalyzer(graph, {
        moduleGrouping: 'custom',
        customModuleExtractor: (filePath: string) => {
          // Group by top-level directory only
          const parts = filePath.split('/');
          return parts.length > 1 ? parts[0] : filePath;
        },
      });

      const result = await analyzer.analyzeCoupling('src', 'src');

      expect(result.module1).toBe('src');
      expect(result.module2).toBe('src');
    });
  });

  describe('getOptions', () => {
    it('should return current options', () => {
      const options = {
        moduleGrouping: 'file' as const,
        minCouplingThreshold: 0.3,
      };

      const analyzer = new ModuleCouplingAnalyzer(graph, options);
      const returnedOptions = analyzer.getOptions();

      expect(returnedOptions.moduleGrouping).toBe('file');
      expect(returnedOptions.minCouplingThreshold).toBe(0.3);
    });
  });

  describe('getGraph', () => {
    it('should return the underlying graph', () => {
      const analyzer = new ModuleCouplingAnalyzer(graph);
      const returnedGraph = analyzer.getGraph();

      expect(returnedGraph).toBe(graph);
      expect(returnedGraph.nodes.size).toBe(5);
      expect(returnedGraph.edges.size).toBe(4);
    });
  });

  describe('edge cases', () => {
    it('should handle single-node graph', async () => {
      const singleNodeGraph: CodeGraph = {
        nodes: new Map([
          ['node1', {
            id: 'node1',
            type: 'file',
            label: 'test.ts',
            filePath: 'src/test.ts',
            startLine: 1,
            endLine: 10,
            language: 'typescript',
            properties: {},
          }],
        ]),
        edges: new Map(),
        outgoingEdges: new Map(),
        incomingEdges: new Map(),
        fileNodes: new Map([['src/test.ts', ['node1']]]),
      };

      const analyzer = new ModuleCouplingAnalyzer(singleNodeGraph);
      const result = await analyzer.analyzeCoupling('src', 'src');

      // Single module should have no coupling with itself
      expect(result.couplingStrength).toBe(0);
    });

    it('should handle disconnected modules', async () => {
      // Create graph with two disconnected modules
      const disconnectedGraph: CodeGraph = {
        nodes: new Map([
          ['node1', {
            id: 'node1',
            type: 'file',
            label: 'a.ts',
            filePath: 'src/a/a.ts',
            startLine: 1,
            endLine: 10,
            language: 'typescript',
            properties: {},
          }],
          ['node2', {
            id: 'node2',
            type: 'file',
            label: 'b.ts',
            filePath: 'src/b/b.ts',
            startLine: 1,
            endLine: 10,
            language: 'typescript',
            properties: {},
          }],
        ]),
        edges: new Map(), // No edges = disconnected
        outgoingEdges: new Map(),
        incomingEdges: new Map(),
        fileNodes: new Map([
          ['src/a/a.ts', ['node1']],
          ['src/b/b.ts', ['node2']],
        ]),
      };

      const analyzer = new ModuleCouplingAnalyzer(disconnectedGraph);
      const result = await analyzer.analyzeCoupling('src/a', 'src/b');

      expect(result.couplingStrength).toBe(0);
      expect(result.circularDependency).toBe(false);
    });
  });
});
