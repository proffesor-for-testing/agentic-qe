/**
 * Tests for DependencyGraphBuilder
 */

import { describe, it, expect } from '@jest/globals';
import { DependencyGraphBuilder } from '../../../src/code-intelligence/visualization/DependencyGraphBuilder.js';
import { GraphNode, GraphEdge } from '../../../src/code-intelligence/graph/types.js';

describe('DependencyGraphBuilder', () => {
  const createNode = (
    id: string,
    type: GraphNode['type'],
    label: string,
    filePath = '/test/file.ts'
  ): GraphNode => ({
    id,
    type,
    label,
    filePath,
    startLine: 1,
    endLine: 10,
    language: 'typescript',
    properties: {},
  });

  const createEdge = (
    source: string,
    target: string,
    type: GraphEdge['type']
  ): GraphEdge => ({
    id: `${source}_${target}`,
    source,
    target,
    type,
    weight: 1.0,
    properties: {},
  });

  describe('build', () => {
    it('should build dependency graph from file nodes', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'index.ts', '/src/index.ts'),
        createNode('file2', 'file', 'utils.ts', '/src/utils.ts'),
        createNode('file3', 'file', 'types.ts', '/src/types.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
        createEdge('file1', 'file3', 'imports'),
      ];

      const diagram = DependencyGraphBuilder.build(nodes, edges);

      expect(diagram).toContain('graph');
      expect(diagram).toContain('index.ts');
      expect(diagram).toContain('utils.ts');
      expect(diagram).toContain('types.ts');
      expect(diagram).toContain('==>');
    });

    it('should filter out node_modules by default', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'index.ts', '/src/index.ts'),
        createNode('file2', 'file', 'lodash', '/node_modules/lodash/index.js'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
      ];

      const diagram = DependencyGraphBuilder.build(nodes, edges, {
        showExternal: false,
      });

      expect(diagram).toContain('index.ts');
      expect(diagram).not.toContain('lodash');
    });

    it('should include node_modules when showExternal is true', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'index.ts', '/src/index.ts'),
        createNode('file2', 'file', 'lodash', '/node_modules/lodash/index.js'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
      ];

      const diagram = DependencyGraphBuilder.build(nodes, edges, {
        showExternal: true,
      });

      expect(diagram).toContain('index.ts');
      expect(diagram).toContain('lodash');
    });

    it('should highlight circular dependencies when enabled', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'a.ts', '/src/a.ts'),
        createNode('file2', 'file', 'b.ts', '/src/b.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
        createEdge('file2', 'file1', 'imports'),
      ];

      const diagram = DependencyGraphBuilder.build(nodes, edges, {
        highlightCycles: true,
      });

      expect(diagram).toContain('Circular dependencies detected');
      expect(diagram).toContain('fill:#ffcdd2');
    });
  });

  describe('buildDependencyTree', () => {
    it('should build dependency tree from root file', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'index.ts'),
        createNode('file2', 'file', 'utils.ts'),
        createNode('file3', 'file', 'helpers.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
        createEdge('file2', 'file3', 'imports'),
      ];

      const diagram = DependencyGraphBuilder.buildDependencyTree(
        'file1',
        nodes,
        edges
      );

      expect(diagram).toContain('index.ts');
      expect(diagram).toContain('utils.ts');
      expect(diagram).toContain('helpers.ts');
    });

    it('should respect maxDepth option', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'a.ts'),
        createNode('file2', 'file', 'b.ts'),
        createNode('file3', 'file', 'c.ts'),
        createNode('file4', 'file', 'd.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
        createEdge('file2', 'file3', 'imports'),
        createEdge('file3', 'file4', 'imports'),
      ];

      const diagram = DependencyGraphBuilder.buildDependencyTree(
        'file1',
        nodes,
        edges,
        { maxDepth: 2 }
      );

      expect(diagram).toContain('a.ts');
      expect(diagram).toContain('b.ts');
      expect(diagram).toContain('c.ts');
      expect(diagram).not.toContain('d.ts');
    });

    it('should throw error for non-existent file', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      expect(() => {
        DependencyGraphBuilder.buildDependencyTree('nonexistent', nodes, edges);
      }).toThrow('File not found');
    });
  });

  describe('buildReverseDependencies', () => {
    it('should build reverse dependency graph', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'utils.ts'),
        createNode('file2', 'file', 'a.ts'),
        createNode('file3', 'file', 'b.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file2', 'file1', 'imports'),
        createEdge('file3', 'file1', 'imports'),
      ];

      const diagram = DependencyGraphBuilder.buildReverseDependencies(
        'file1',
        nodes,
        edges
      );

      expect(diagram).toContain('utils.ts');
      expect(diagram).toContain('a.ts');
      expect(diagram).toContain('b.ts');
    });

    it('should throw error for non-existent file', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      expect(() => {
        DependencyGraphBuilder.buildReverseDependencies('nonexistent', nodes, edges);
      }).toThrow('File not found');
    });
  });

  describe('analyzeDependencies', () => {
    it('should calculate dependency metrics', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'a.ts'),
        createNode('file2', 'file', 'b.ts'),
        createNode('file3', 'file', 'c.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
        createEdge('file1', 'file3', 'imports'),
        createEdge('file2', 'file3', 'imports'),
      ];

      const metrics = DependencyGraphBuilder.analyzeDependencies(nodes, edges);

      expect(metrics.totalFiles).toBe(3);
      expect(metrics.totalDependencies).toBe(3);
      expect(metrics.avgDependenciesPerFile).toBe(1);
      expect(metrics.mostImported).toBeDefined();
      expect(metrics.mostImporting).toBeDefined();
    });

    it('should detect circular dependencies', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'a.ts'),
        createNode('file2', 'file', 'b.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
        createEdge('file2', 'file1', 'imports'),
      ];

      const metrics = DependencyGraphBuilder.analyzeDependencies(nodes, edges);

      expect(metrics.circularDependencies).toBeGreaterThan(0);
      expect(metrics.circularDependencyPaths.length).toBeGreaterThan(0);
    });

    it('should identify most imported files', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'utils.ts'),
        createNode('file2', 'file', 'a.ts'),
        createNode('file3', 'file', 'b.ts'),
        createNode('file4', 'file', 'c.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file2', 'file1', 'imports'),
        createEdge('file3', 'file1', 'imports'),
        createEdge('file4', 'file1', 'imports'),
      ];

      const metrics = DependencyGraphBuilder.analyzeDependencies(nodes, edges);

      expect(metrics.mostImported[0].file).toBe('utils.ts');
      expect(metrics.mostImported[0].imports).toBe(3);
    });
  });

  describe('generateDependencyMatrix', () => {
    it('should generate markdown table', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'a.ts'),
        createNode('file2', 'file', 'b.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
      ];

      const matrix = DependencyGraphBuilder.generateDependencyMatrix(nodes, edges);

      expect(matrix).toContain('## Dependency Matrix');
      expect(matrix).toContain('|');
      expect(matrix).toContain('---');
      expect(matrix).toContain('a.ts');
      expect(matrix).toContain('b.ts');
      expect(matrix).toContain('X');
    });
  });
});
