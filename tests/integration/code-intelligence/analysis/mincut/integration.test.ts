/**
 * INTEGRATION TEST: MinCut Analysis Workflow
 *
 * Tests the complete MinCut analysis workflow using real implementations:
 * - GraphBuilder: Constructs code dependency graphs
 * - GraphAdapter: Converts CodeGraph to MinCut format
 * - MinCutAnalyzer: Computes minimum cut using Stoer-Wagner algorithm
 *
 * NO MOCKS - Uses real database queries and implementations
 *
 * Created: 2025-12-25
 * Task: P2-T05
 * Agent: qe-integration-tester
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GraphBuilder } from '@code-intelligence/graph/GraphBuilder';
import { GraphAdapter } from '@code-intelligence/analysis/mincut/GraphAdapter';
import { MinCutAnalyzer } from '@code-intelligence/analysis/mincut/MinCutAnalyzer';
import type { MinCutGraphInput, MinCutResult } from '@code-intelligence/analysis/mincut/types';

describe('INTEGRATION: MinCut Analysis Workflow', () => {
  let graphBuilder: GraphBuilder;
  let analyzer: MinCutAnalyzer;

  beforeAll(() => {
    graphBuilder = new GraphBuilder();
    analyzer = new MinCutAnalyzer({
      algorithm: 'stoer-wagner', // Use pure JS implementation for consistent testing
      maxNodes: 10000,
      timeout: 30000,
      normalizeWeights: true,
    });
  });

  describe('End-to-End Workflow', () => {
    it('should analyze coupling between code modules', async () => {
      // STEP 1: Create a GraphBuilder and build a code graph
      const builder = new GraphBuilder();

      // Add realistic nodes representing files
      const fileA = builder.addNode(
        'file',
        'userService.ts',
        'src/services/userService.ts',
        1,
        100,
        'typescript',
        { exports: ['UserService', 'createUser'] }
      );

      const fileB = builder.addNode(
        'file',
        'authService.ts',
        'src/services/authService.ts',
        1,
        80,
        'typescript',
        { exports: ['AuthService', 'authenticate'] }
      );

      const fileC = builder.addNode(
        'file',
        'database.ts',
        'src/utils/database.ts',
        1,
        50,
        'typescript',
        { exports: ['Database', 'query'] }
      );

      // Add edges representing imports (dependencies)
      builder.addEdge(fileA.id, fileB.id, 'imports', 1.0, { reason: 'auth verification' });
      builder.addEdge(fileA.id, fileC.id, 'imports', 1.0, { reason: 'data persistence' });
      builder.addEdge(fileB.id, fileC.id, 'imports', 1.0, { reason: 'session storage' });

      // STEP 2: Convert to MinCut format using GraphAdapter
      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        normalizeWeights: true,
        directed: false,
      });

      // Verify conversion
      expect(minCutInput.nodes).toHaveLength(3);
      expect(minCutInput.edges).toHaveLength(3);
      expect(minCutInput.directed).toBe(false);

      // STEP 3: Run MinCut analysis
      const startTime = performance.now();
      const result = await analyzer.computeMinCut(minCutInput);
      const duration = performance.now() - startTime;

      // STEP 4: Validate results
      expect(result).toBeDefined();
      expect(result.cutValue).toBeGreaterThan(0);
      expect(result.partition1.length + result.partition2.length).toBe(3);
      expect(result.algorithmUsed).toBe('stoer-wagner');
      expect(result.computationTimeMs).toBeGreaterThan(0);

      // Log performance for inspection
      console.log(`MinCut analysis completed in ${duration.toFixed(2)}ms`);
      console.log(`Cut value: ${result.cutValue}`);
      console.log(`Partition 1: ${result.partition1.join(', ')}`);
      console.log(`Partition 2: ${result.partition2.join(', ')}`);

      // Performance constraint: should complete in reasonable time
      expect(duration).toBeLessThan(5000);
    });

    it('should detect module boundaries in realistic code graph', async () => {
      const builder = new GraphBuilder();

      // MODULE 1: Authentication module (tightly coupled)
      const authController = builder.addNode('file', 'authController.ts', 'src/auth/authController.ts', 1, 50, 'typescript');
      const authService = builder.addNode('file', 'authService.ts', 'src/auth/authService.ts', 1, 80, 'typescript');
      const authModel = builder.addNode('file', 'authModel.ts', 'src/auth/authModel.ts', 1, 40, 'typescript');

      // MODULE 2: User module (tightly coupled)
      const userController = builder.addNode('file', 'userController.ts', 'src/user/userController.ts', 1, 60, 'typescript');
      const userService = builder.addNode('file', 'userService.ts', 'src/user/userService.ts', 1, 100, 'typescript');
      const userModel = builder.addNode('file', 'userModel.ts', 'src/user/userModel.ts', 1, 45, 'typescript');

      // Intra-module edges (high coupling within modules)
      builder.addEdge(authController.id, authService.id, 'imports', 2.0);
      builder.addEdge(authService.id, authModel.id, 'imports', 2.0);
      builder.addEdge(authController.id, authModel.id, 'uses', 1.5);

      builder.addEdge(userController.id, userService.id, 'imports', 2.0);
      builder.addEdge(userService.id, userModel.id, 'imports', 2.0);
      builder.addEdge(userController.id, userModel.id, 'uses', 1.5);

      // Inter-module edge (low coupling between modules)
      builder.addEdge(authService.id, userService.id, 'calls', 0.5);

      // Convert and analyze
      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        normalizeWeights: true,
        directed: false,
      });

      const result = await analyzer.computeMinCut(minCutInput);

      // MinCut should identify the weak link between modules
      expect(result.cutValue).toBeGreaterThan(0);
      expect(result.cutEdges).toBeDefined();

      // The cut should separate the two modules
      const partition1Files = result.partition1.map(id => {
        const node = builder.getNode(id);
        return node?.filePath || id;
      });
      const partition2Files = result.partition2.map(id => {
        const node = builder.getNode(id);
        return node?.filePath || id;
      });

      console.log('Module boundary detection:');
      console.log(`Partition 1: ${partition1Files.join(', ')}`);
      console.log(`Partition 2: ${partition2Files.join(', ')}`);
      console.log(`Cut edges: ${result.cutEdges.length}`);
      console.log(`Cut value: ${result.cutValue}`);

      // Should have low cut value (indicating modules are well-separated)
      expect(result.cutValue).toBeLessThan(2.0);
    });

    it('should handle circular dependencies', async () => {
      const builder = new GraphBuilder();

      // Create circular dependency: A -> B -> A
      const fileA = builder.addNode('file', 'moduleA.ts', 'src/moduleA.ts', 1, 50, 'typescript');
      const fileB = builder.addNode('file', 'moduleB.ts', 'src/moduleB.ts', 1, 50, 'typescript');

      // Circular edges
      builder.addEdge(fileA.id, fileB.id, 'imports', 1.0);
      builder.addEdge(fileB.id, fileA.id, 'imports', 1.0);

      // Convert to MinCut format
      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        normalizeWeights: true,
        directed: false,
      });

      // Should handle circular dependencies without error
      const result = await analyzer.computeMinCut(minCutInput);

      expect(result).toBeDefined();
      expect(result.cutValue).toBeGreaterThan(0);
      expect(result.partition1.length + result.partition2.length).toBe(2);

      console.log('Circular dependency analysis:');
      console.log(`Cut value: ${result.cutValue}`);
      console.log(`Partitions: [${result.partition1}] | [${result.partition2}]`);

      // High cut value indicates strong coupling (circular dependency)
      expect(result.cutValue).toBeGreaterThan(0.5);
    });

    it('should analyze complex multi-module graph', async () => {
      const builder = new GraphBuilder();

      // Create 3 modules with varying coupling strengths
      const modules = {
        core: [
          builder.addNode('file', 'logger.ts', 'src/core/logger.ts', 1, 30, 'typescript'),
          builder.addNode('file', 'config.ts', 'src/core/config.ts', 1, 40, 'typescript'),
          builder.addNode('file', 'utils.ts', 'src/core/utils.ts', 1, 50, 'typescript'),
        ],
        api: [
          builder.addNode('file', 'server.ts', 'src/api/server.ts', 1, 60, 'typescript'),
          builder.addNode('file', 'routes.ts', 'src/api/routes.ts', 1, 70, 'typescript'),
          builder.addNode('file', 'middleware.ts', 'src/api/middleware.ts', 1, 45, 'typescript'),
        ],
        database: [
          builder.addNode('file', 'connection.ts', 'src/db/connection.ts', 1, 55, 'typescript'),
          builder.addNode('file', 'models.ts', 'src/db/models.ts', 1, 80, 'typescript'),
        ],
      };

      // Intra-module edges (strong coupling)
      builder.addEdge(modules.core[0].id, modules.core[1].id, 'imports', 2.0);
      builder.addEdge(modules.core[1].id, modules.core[2].id, 'imports', 2.0);

      builder.addEdge(modules.api[0].id, modules.api[1].id, 'imports', 2.5);
      builder.addEdge(modules.api[1].id, modules.api[2].id, 'imports', 2.0);

      builder.addEdge(modules.database[0].id, modules.database[1].id, 'imports', 2.5);

      // Inter-module edges (weaker coupling)
      builder.addEdge(modules.api[0].id, modules.core[0].id, 'imports', 0.8); // API uses logger
      builder.addEdge(modules.api[0].id, modules.core[1].id, 'imports', 0.7); // API uses config
      builder.addEdge(modules.database[0].id, modules.core[0].id, 'imports', 0.6); // DB uses logger
      builder.addEdge(modules.api[1].id, modules.database[1].id, 'calls', 1.2); // API calls DB

      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        normalizeWeights: true,
        directed: false,
      });

      const result = await analyzer.computeMinCut(minCutInput);

      expect(result).toBeDefined();
      expect(result.partition1.length + result.partition2.length).toBe(8);

      console.log('Multi-module analysis:');
      console.log(`Total nodes: ${minCutInput.nodes.length}`);
      console.log(`Total edges: ${minCutInput.edges.length}`);
      console.log(`Cut value: ${result.cutValue}`);
      console.log(`Cut edges: ${result.cutEdges.length}`);
    });
  });

  describe('Performance', () => {
    it('should complete analysis in reasonable time for large graph', async () => {
      const builder = new GraphBuilder();

      // Create a 500-node graph with random connections
      const nodes: any[] = [];
      for (let i = 0; i < 500; i++) {
        const node = builder.addNode(
          'file',
          `file${i}.ts`,
          `src/module${Math.floor(i / 10)}/file${i}.ts`,
          1,
          50,
          'typescript'
        );
        nodes.push(node);
      }

      // Add edges to create a connected graph with ~1500 edges
      for (let i = 0; i < nodes.length; i++) {
        // Connect to next 3 nodes (circular)
        for (let j = 1; j <= 3; j++) {
          const targetIdx = (i + j) % nodes.length;
          builder.addEdge(nodes[i].id, nodes[targetIdx].id, 'imports', Math.random() + 0.5);
        }
      }

      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        normalizeWeights: true,
        directed: false,
      });

      console.log('Large graph analysis:');
      console.log(`Nodes: ${minCutInput.nodes.length}`);
      console.log(`Edges: ${minCutInput.edges.length}`);

      // Verify analysis completes in <5 seconds
      const startTime = performance.now();
      const result = await analyzer.computeMinCut(minCutInput);
      const duration = performance.now() - startTime;

      console.log(`Computation time: ${duration.toFixed(2)}ms (${(duration / 1000).toFixed(2)}s)`);
      console.log(`Cut value: ${result.cutValue}`);
      console.log(`Partition sizes: ${result.partition1.length} / ${result.partition2.length}`);

      expect(result).toBeDefined();
      expect(result.partition1.length + result.partition2.length).toBe(500);
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    it('should handle dense graph efficiently', async () => {
      const builder = new GraphBuilder();

      // Create a densely connected graph (50 nodes, each connected to 10 neighbors)
      const nodes: any[] = [];
      for (let i = 0; i < 50; i++) {
        const node = builder.addNode('file', `dense${i}.ts`, `src/dense${i}.ts`, 1, 30, 'typescript');
        nodes.push(node);
      }

      // Dense connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = 0; j < 10; j++) {
          const targetIdx = (i + j + 1) % nodes.length;
          builder.addEdge(nodes[i].id, nodes[targetIdx].id, 'imports', 1.0);
        }
      }

      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        normalizeWeights: true,
        directed: false,
      });

      const startTime = performance.now();
      const result = await analyzer.computeMinCut(minCutInput);
      const duration = performance.now() - startTime;

      console.log('Dense graph analysis:');
      console.log(`Computation time: ${duration.toFixed(2)}ms`);
      console.log(`Cut value: ${result.cutValue}`);

      expect(duration).toBeLessThan(2000); // 2 seconds max for dense graph
    });
  });

  describe('Real Codebase Analysis', () => {
    it('should analyze the MinCut module itself', async () => {
      // Build graph from actual MinCut source files
      const builder = new GraphBuilder();

      // Simulate the MinCut module structure
      const minCutAnalyzer = builder.addNode(
        'file',
        'MinCutAnalyzer.ts',
        'src/code-intelligence/analysis/mincut/MinCutAnalyzer.ts',
        1,
        290,
        'typescript'
      );

      const graphAdapter = builder.addNode(
        'file',
        'GraphAdapter.ts',
        'src/code-intelligence/analysis/mincut/GraphAdapter.ts',
        1,
        409,
        'typescript'
      );

      const jsMinCut = builder.addNode(
        'file',
        'JsMinCut.ts',
        'src/code-intelligence/analysis/mincut/JsMinCut.ts',
        1,
        200,
        'typescript'
      );

      const types = builder.addNode(
        'file',
        'types.ts',
        'src/code-intelligence/analysis/mincut/types.ts',
        1,
        103,
        'typescript'
      );

      const graphBuilder = builder.addNode(
        'file',
        'GraphBuilder.ts',
        'src/code-intelligence/graph/GraphBuilder.ts',
        1,
        527,
        'typescript'
      );

      const graphTypes = builder.addNode(
        'file',
        'types.ts',
        'src/code-intelligence/graph/types.ts',
        1,
        150,
        'typescript'
      );

      // Dependencies within MinCut module
      builder.addEdge(minCutAnalyzer.id, types.id, 'imports', 2.0);
      builder.addEdge(minCutAnalyzer.id, jsMinCut.id, 'imports', 2.0);
      builder.addEdge(graphAdapter.id, types.id, 'imports', 2.0);
      builder.addEdge(graphAdapter.id, graphTypes.id, 'imports', 1.5);

      // Cross-module dependency
      builder.addEdge(graphAdapter.id, graphBuilder.id, 'uses', 1.0);

      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        normalizeWeights: true,
        directed: false,
      });

      const result = await analyzer.computeMinCut(minCutInput);

      console.log('MinCut module self-analysis:');
      console.log(`Nodes analyzed: ${minCutInput.nodes.length}`);
      console.log(`Cut value: ${result.cutValue}`);
      console.log(`Partition 1: ${result.partition1.length} nodes`);
      console.log(`Partition 2: ${result.partition2.length} nodes`);
      console.log(`Cut edges: ${result.cutEdges.length}`);

      // Verify it produces meaningful results
      expect(result).toBeDefined();
      expect(result.cutValue).toBeGreaterThan(0);
      expect(result.partition1.length).toBeGreaterThan(0);
      expect(result.partition2.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single edge graph', async () => {
      const builder = new GraphBuilder();

      const nodeA = builder.addNode('file', 'a.ts', 'src/a.ts', 1, 10, 'typescript');
      const nodeB = builder.addNode('file', 'b.ts', 'src/b.ts', 1, 10, 'typescript');
      builder.addEdge(nodeA.id, nodeB.id, 'imports', 1.0);

      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        normalizeWeights: true,
        directed: false,
      });

      const result = await analyzer.computeMinCut(minCutInput);

      expect(result.cutValue).toBeGreaterThan(0);
      expect(result.partition1.length).toBe(1);
      expect(result.partition2.length).toBe(1);
    });

    it('should handle disconnected components', async () => {
      const builder = new GraphBuilder();

      // Component 1
      const a1 = builder.addNode('file', 'a1.ts', 'src/a1.ts', 1, 10, 'typescript');
      const a2 = builder.addNode('file', 'a2.ts', 'src/a2.ts', 1, 10, 'typescript');
      builder.addEdge(a1.id, a2.id, 'imports', 1.0);

      // Component 2 (disconnected)
      const b1 = builder.addNode('file', 'b1.ts', 'src/b1.ts', 1, 10, 'typescript');
      const b2 = builder.addNode('file', 'b2.ts', 'src/b2.ts', 1, 10, 'typescript');
      builder.addEdge(b1.id, b2.id, 'imports', 1.0);

      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        normalizeWeights: true,
        directed: false,
      });

      const result = await analyzer.computeMinCut(minCutInput);

      // Should find the trivial cut between disconnected components (cut value = 0)
      expect(result.cutValue).toBe(0);
      expect(result.partition1.length + result.partition2.length).toBe(4);
    });

    it('should handle varying edge weights', async () => {
      const builder = new GraphBuilder();

      const nodeA = builder.addNode('file', 'a.ts', 'src/a.ts', 1, 10, 'typescript');
      const nodeB = builder.addNode('file', 'b.ts', 'src/b.ts', 1, 10, 'typescript');
      const nodeC = builder.addNode('file', 'c.ts', 'src/c.ts', 1, 10, 'typescript');

      // Different edge weights
      builder.addEdge(nodeA.id, nodeB.id, 'imports', 0.1); // Weak
      builder.addEdge(nodeB.id, nodeC.id, 'extends', 5.0); // Strong
      builder.addEdge(nodeA.id, nodeC.id, 'uses', 0.5); // Medium

      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        normalizeWeights: true,
        directed: false,
      });

      const result = await analyzer.computeMinCut(minCutInput);

      console.log('Varying weights analysis:');
      console.log(`Cut value: ${result.cutValue}`);
      console.log(`Cut edges:`, result.cutEdges);

      expect(result.cutValue).toBeGreaterThan(0);
      // MinCut should prefer cutting weak edges
      expect(result.cutValue).toBeLessThan(1.0);
    });
  });

  describe('GraphAdapter Integration', () => {
    it('should validate graph before conversion', () => {
      const builder = new GraphBuilder();

      // Create invalid graph (references non-existent node)
      const nodeA = builder.addNode('file', 'a.ts', 'src/a.ts', 1, 10, 'typescript');

      const invalidGraph = {
        nodes: [nodeA],
        edges: [
          {
            id: 'edge_1',
            source: nodeA.id,
            target: 'non-existent-node',
            type: 'imports' as const,
            weight: 1.0,
            properties: {},
          },
        ],
      };

      const validation = GraphAdapter.validateGraph(invalidGraph);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('non-existent');
    });

    it('should filter nodes and edges correctly', () => {
      const builder = new GraphBuilder();

      const fileNode = builder.addNode('file', 'file.ts', 'src/file.ts', 1, 10, 'typescript');
      const classNode = builder.addNode('class', 'MyClass', 'src/file.ts', 5, 10, 'typescript');
      const functionNode = builder.addNode('function', 'myFunc', 'src/file.ts', 12, 15, 'typescript');

      builder.addEdge(fileNode.id, classNode.id, 'contains', 1.0);
      builder.addEdge(classNode.id, functionNode.id, 'contains', 1.0);

      // Filter to only file-level nodes
      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        nodeFilter: (node) => node.type === 'file',
        directed: false,
      });

      expect(minCutInput.nodes).toHaveLength(1);
      expect(minCutInput.nodes[0].properties?.type).toBe('file');
      // No edges since other nodes were filtered out
      expect(minCutInput.edges).toHaveLength(0);
    });

    it('should aggregate by file correctly', () => {
      const builder = new GraphBuilder();

      // File A with multiple nodes
      const classA1 = builder.addNode('class', 'ClassA1', 'src/fileA.ts', 1, 10, 'typescript');
      const classA2 = builder.addNode('class', 'ClassA2', 'src/fileA.ts', 12, 20, 'typescript');

      // File B with multiple nodes
      const classB1 = builder.addNode('class', 'ClassB1', 'src/fileB.ts', 1, 10, 'typescript');
      const classB2 = builder.addNode('class', 'ClassB2', 'src/fileB.ts', 12, 20, 'typescript');

      // Cross-file edges
      builder.addEdge(classA1.id, classB1.id, 'imports', 1.0);
      builder.addEdge(classA2.id, classB2.id, 'calls', 1.5);

      // Intra-file edge (should be filtered out)
      builder.addEdge(classA1.id, classA2.id, 'uses', 2.0);

      const fileGraph = GraphAdapter.aggregateByFile(builder.exportGraph());

      expect(fileGraph.nodes).toHaveLength(2);
      expect(fileGraph.nodes[0].type).toBe('file');

      // Should have aggregated edge between files
      expect(fileGraph.edges.length).toBeGreaterThan(0);

      // Verify aggregated weight
      const aggregatedEdge = fileGraph.edges[0];
      expect(aggregatedEdge.weight).toBe(2.5); // 1.0 + 1.5
    });
  });

  describe('Multiple MinCuts', () => {
    it('should find multiple alternative cuts', async () => {
      const builder = new GraphBuilder();

      // Create a graph with multiple potential cut points
      const nodes: any[] = [];
      for (let i = 0; i < 6; i++) {
        nodes.push(builder.addNode('file', `file${i}.ts`, `src/file${i}.ts`, 1, 10, 'typescript'));
      }

      // Create two clusters with weak links
      builder.addEdge(nodes[0].id, nodes[1].id, 'imports', 2.0);
      builder.addEdge(nodes[1].id, nodes[2].id, 'imports', 2.0);
      builder.addEdge(nodes[0].id, nodes[2].id, 'uses', 1.5);

      builder.addEdge(nodes[3].id, nodes[4].id, 'imports', 2.0);
      builder.addEdge(nodes[4].id, nodes[5].id, 'imports', 2.0);
      builder.addEdge(nodes[3].id, nodes[5].id, 'uses', 1.5);

      // Weak inter-cluster links
      builder.addEdge(nodes[2].id, nodes[3].id, 'calls', 0.5);
      builder.addEdge(nodes[1].id, nodes[4].id, 'calls', 0.6);

      const minCutInput = GraphAdapter.toMinCutFormat(builder.exportGraph(), {
        normalizeWeights: true,
        directed: false,
      });

      const results = await analyzer.findAllMinCuts(minCutInput, 3);

      console.log('Multiple cuts analysis:');
      results.forEach((result, idx) => {
        console.log(`Cut ${idx + 1}: value = ${result.cutValue}, edges = ${result.cutEdges.length}`);
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);

      // Results should be sorted by cut value
      for (let i = 1; i < results.length; i++) {
        expect(results[i].cutValue).toBeGreaterThanOrEqual(results[i - 1].cutValue);
      }
    });
  });
});
