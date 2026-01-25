/**
 * Tests for MermaidGenerator
 */

import { describe, it, expect } from '@jest/globals';
import { MermaidGenerator } from '../../../src/code-intelligence/visualization/MermaidGenerator.js';
import { GraphNode, GraphEdge } from '../../../src/code-intelligence/graph/types.js';

describe('MermaidGenerator', () => {
  const createNode = (
    id: string,
    type: GraphNode['type'],
    label: string
  ): GraphNode => ({
    id,
    type,
    label,
    filePath: '/test/file.ts',
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

  describe('generate', () => {
    it('should generate class diagram', () => {
      const nodes: GraphNode[] = [
        {
          ...createNode('class1', 'class', 'UserService'),
          properties: {
            methods: [
              { name: 'login', visibility: 'public', returnType: 'Promise<string>', params: ['username', 'password'] },
              { name: 'logout', visibility: 'public', returnType: 'Promise<void>', params: ['username'] },
            ],
            properties: [
              { name: 'tokenStore', visibility: 'private', type: 'Map<string, string>' },
            ],
          },
        },
        createNode('class2', 'class', 'BaseService'),
      ];

      const edges: GraphEdge[] = [
        createEdge('class1', 'class2', 'extends'),
      ];

      const diagram = MermaidGenerator.generate(nodes, edges, 'classDiagram');

      expect(diagram).toContain('classDiagram');
      expect(diagram).toContain('class UserService');
      expect(diagram).toContain('class BaseService');
      expect(diagram).toContain('+login(username, password) Promise<string>');
      expect(diagram).toContain('-tokenStore Map<string, string>');
      expect(diagram).toContain('UserService --|> BaseService');
    });

    it('should generate flowchart diagram', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'index.ts'),
        createNode('file2', 'file', 'utils.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
      ];

      const diagram = MermaidGenerator.generate(nodes, edges, 'graph', {
        direction: 'LR',
      });

      expect(diagram).toContain('graph LR');
      expect(diagram).toContain('file1');
      expect(diagram).toContain('file2');
      expect(diagram).toContain('==>');
    });

    it('should limit nodes to maxNodes', () => {
      const nodes: GraphNode[] = Array.from({ length: 100 }, (_, i) =>
        createNode(`node${i}`, 'class', `Class${i}`)
      );

      const diagram = MermaidGenerator.generate(nodes, [], 'classDiagram', {
        maxNodes: 10,
      });

      const nodeCount = (diagram.match(/class Class/g) || []).length;
      expect(nodeCount).toBeLessThanOrEqual(10);
    });

    it('should filter by node type', () => {
      const nodes: GraphNode[] = [
        createNode('class1', 'class', 'MyClass'),
        createNode('func1', 'function', 'myFunction'),
        createNode('file1', 'file', 'index.ts'),
      ];

      const diagram = MermaidGenerator.generate(nodes, [], 'graph', {
        nodeTypeFilter: ['class', 'function'],
      });

      expect(diagram).toContain('MyClass');
      expect(diagram).toContain('myFunction');
      expect(diagram).not.toContain('index.ts');
    });

    it('should include legend when requested', () => {
      const nodes: GraphNode[] = [createNode('class1', 'class', 'MyClass')];

      const diagram = MermaidGenerator.generate(nodes, [], 'classDiagram', {
        includeLegend: true,
      });

      expect(diagram).toContain('Legend:');
      expect(diagram).toContain('Inheritance');
    });
  });

  describe('findCircularDependencies', () => {
    it('should detect simple circular dependency', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'a.ts'),
        createNode('file2', 'file', 'b.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
        createEdge('file2', 'file1', 'imports'),
      ];

      const cycles = MermaidGenerator.findCircularDependencies(nodes, edges);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain('file1');
      expect(cycles[0]).toContain('file2');
    });

    it('should detect complex circular dependency', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'a.ts'),
        createNode('file2', 'file', 'b.ts'),
        createNode('file3', 'file', 'c.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
        createEdge('file2', 'file3', 'imports'),
        createEdge('file3', 'file1', 'imports'),
      ];

      const cycles = MermaidGenerator.findCircularDependencies(nodes, edges);

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain('file1');
      expect(cycles[0]).toContain('file2');
      expect(cycles[0]).toContain('file3');
    });

    it('should not detect cycles in acyclic graph', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'a.ts'),
        createNode('file2', 'file', 'b.ts'),
        createNode('file3', 'file', 'c.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
        createEdge('file2', 'file3', 'imports'),
      ];

      const cycles = MermaidGenerator.findCircularDependencies(nodes, edges);

      expect(cycles.length).toBe(0);
    });
  });

  describe('generateDependencyGraphWithCycles', () => {
    it('should highlight circular dependencies', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'a.ts'),
        createNode('file2', 'file', 'b.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('file1', 'file2', 'imports'),
        createEdge('file2', 'file1', 'imports'),
      ];

      const diagram = MermaidGenerator.generateDependencyGraphWithCycles(
        nodes,
        edges
      );

      expect(diagram).toContain('style file1');
      expect(diagram).toContain('style file2');
      expect(diagram).toContain('Circular dependencies detected');
    });
  });

  describe('sanitization', () => {
    it('should sanitize special characters in IDs', () => {
      const nodes: GraphNode[] = [
        createNode('my-id-123', 'file', 'My.File'),
      ];

      const diagram = MermaidGenerator.generate(nodes, [], 'graph');

      // In flowcharts, IDs are sanitized
      expect(diagram).toContain('my_id_123');
    });

    it('should escape special characters in labels', () => {
      const nodes: GraphNode[] = [
        createNode('class1', 'class', 'Class<T>'),
      ];

      const diagram = MermaidGenerator.generate(nodes, [], 'classDiagram');

      // In class diagrams, labels are sanitized for class names
      expect(diagram).toContain('Class_T_');
    });
  });

  describe('node styling', () => {
    it('should apply different shapes for different node types', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'index.ts'),
        createNode('class1', 'class', 'MyClass'),
        createNode('func1', 'function', 'myFunc'),
      ];

      const diagram = MermaidGenerator.generate(nodes, [], 'graph');

      expect(diagram).toContain('((');  // Circle for file
      expect(diagram).toContain('[');   // Rectangle for function
      expect(diagram).toContain('(');   // Rounded for class
    });

    it('should apply colors for different node types', () => {
      const nodes: GraphNode[] = [
        createNode('file1', 'file', 'index.ts'),
        createNode('class1', 'class', 'MyClass'),
      ];

      const diagram = MermaidGenerator.generate(nodes, [], 'graph');

      expect(diagram).toContain('style file1');
      expect(diagram).toContain('style class1');
      expect(diagram).toContain('fill:');
    });
  });

  describe('edge types', () => {
    it('should use different arrows for different edge types', () => {
      const nodes: GraphNode[] = [
        createNode('node1', 'class', 'A'),
        createNode('node2', 'class', 'B'),
      ];

      const edges: GraphEdge[] = [
        createEdge('node1', 'node2', 'extends'),
        createEdge('node1', 'node2', 'calls'),
      ];

      const diagram = MermaidGenerator.generate(nodes, edges, 'graph');

      expect(diagram).toContain('-->');
      expect(diagram).toContain('-.->');
    });

    it('should add labels to edges', () => {
      const nodes: GraphNode[] = [
        createNode('node1', 'file', 'a.ts'),
        createNode('node2', 'file', 'b.ts'),
      ];

      const edges: GraphEdge[] = [
        createEdge('node1', 'node2', 'imports'),
      ];

      const diagram = MermaidGenerator.generate(nodes, edges, 'graph');

      expect(diagram).toContain('|imports|');
    });
  });
});
