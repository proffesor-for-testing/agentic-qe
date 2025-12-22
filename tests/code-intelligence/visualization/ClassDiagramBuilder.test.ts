/**
 * Tests for ClassDiagramBuilder
 */

import { describe, it, expect } from '@jest/globals';
import { ClassDiagramBuilder } from '../../../src/code-intelligence/visualization/ClassDiagramBuilder.js';
import { GraphNode, GraphEdge } from '../../../src/code-intelligence/graph/types.js';

describe('ClassDiagramBuilder', () => {
  const createNode = (
    id: string,
    type: GraphNode['type'],
    label: string,
    filePath = '/test/file.ts',
    startLine = 1,
    endLine = 10
  ): GraphNode => ({
    id,
    type,
    label,
    filePath,
    startLine,
    endLine,
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
    it('should build class diagram with methods and properties', () => {
      const nodes: GraphNode[] = [
        createNode('class1', 'class', 'UserService', '/test/UserService.ts', 1, 50),
        createNode('method1', 'method', 'login', '/test/UserService.ts', 10, 15),
        createNode('method2', 'method', 'logout', '/test/UserService.ts', 20, 25),
        createNode('prop1', 'variable', '_tokenStore', '/test/UserService.ts', 5, 5),
      ];

      const edges: GraphEdge[] = [];

      const diagram = ClassDiagramBuilder.build(nodes, edges, {
        includeMethods: true,
        includeProperties: true,
      });

      expect(diagram).toContain('classDiagram');
      expect(diagram).toContain('class UserService');
      expect(diagram).toContain('login');
      expect(diagram).toContain('logout');
      expect(diagram).toContain('_tokenStore');
    });

    it('should show inheritance relationships', () => {
      const nodes: GraphNode[] = [
        createNode('class1', 'class', 'UserService'),
        createNode('class2', 'class', 'BaseService'),
      ];

      const edges: GraphEdge[] = [
        createEdge('class1', 'class2', 'extends'),
      ];

      const diagram = ClassDiagramBuilder.build(nodes, edges);

      expect(diagram).toContain('UserService --|> BaseService');
    });

    it('should show interface implementations', () => {
      const nodes: GraphNode[] = [
        createNode('class1', 'class', 'UserService'),
        createNode('interface1', 'interface', 'IAuthService'),
      ];

      const edges: GraphEdge[] = [
        createEdge('class1', 'interface1', 'implements'),
      ];

      const diagram = ClassDiagramBuilder.build(nodes, edges);

      expect(diagram).toContain('UserService ..|> IAuthService');
    });

    it('should infer visibility from naming convention', () => {
      const nodes: GraphNode[] = [
        createNode('class1', 'class', 'MyClass', '/test/MyClass.ts', 1, 30),
        createNode('method1', 'method', 'publicMethod', '/test/MyClass.ts', 10, 15),
        createNode('method2', 'method', '_privateMethod', '/test/MyClass.ts', 20, 25),
      ];

      const diagram = ClassDiagramBuilder.build(nodes, [], {
        includeMethods: true,
      });

      expect(diagram).toContain('+publicMethod');
      expect(diagram).toContain('-_privateMethod');
    });

    it('should limit nodes when exceeding maxNodes', () => {
      const nodes: GraphNode[] = Array.from({ length: 50 }, (_, i) =>
        createNode(`class${i}`, 'class', `Class${i}`)
      );

      const diagram = ClassDiagramBuilder.build(nodes, [], { maxNodes: 10 });

      const classCount = (diagram.match(/class Class/g) || []).length;
      expect(classCount).toBeLessThanOrEqual(10);
    });
  });

  describe('buildHierarchy', () => {
    it('should build complete inheritance hierarchy', () => {
      const nodes: GraphNode[] = [
        createNode('class1', 'class', 'GrandParent'),
        createNode('class2', 'class', 'Parent'),
        createNode('class3', 'class', 'Child'),
      ];

      const edges: GraphEdge[] = [
        createEdge('class2', 'class1', 'extends'),
        createEdge('class3', 'class2', 'extends'),
      ];

      const diagram = ClassDiagramBuilder.buildHierarchy('class2', nodes, edges);

      expect(diagram).toContain('GrandParent');
      expect(diagram).toContain('Parent');
      expect(diagram).toContain('Child');
      expect(diagram).toContain('Parent --|> GrandParent');
      expect(diagram).toContain('Child --|> Parent');
    });

    it('should throw error for non-existent class', () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      expect(() => {
        ClassDiagramBuilder.buildHierarchy('nonexistent', nodes, edges);
      }).toThrow('Class not found');
    });
  });

  describe('buildInterfaceOverview', () => {
    it('should show interfaces and implementing classes', () => {
      const nodes: GraphNode[] = [
        createNode('interface1', 'interface', 'IService'),
        createNode('class1', 'class', 'ServiceA'),
        createNode('class2', 'class', 'ServiceB'),
      ];

      const edges: GraphEdge[] = [
        createEdge('class1', 'interface1', 'implements'),
        createEdge('class2', 'interface1', 'implements'),
      ];

      const diagram = ClassDiagramBuilder.buildInterfaceOverview(nodes, edges);

      expect(diagram).toContain('IService');
      expect(diagram).toContain('ServiceA');
      expect(diagram).toContain('ServiceB');
      expect(diagram).toContain('..|>');
    });

    it('should filter to interfaces only', () => {
      const nodes: GraphNode[] = [
        createNode('interface1', 'interface', 'IService'),
        createNode('class1', 'class', 'UnrelatedClass'),
      ];

      const edges: GraphEdge[] = [];

      const diagram = ClassDiagramBuilder.buildInterfaceOverview(nodes, edges);

      expect(diagram).toContain('IService');
      expect(diagram).not.toContain('UnrelatedClass');
    });
  });

  describe('options', () => {
    it('should exclude methods when includeMethods is false', () => {
      const nodes: GraphNode[] = [
        createNode('class1', 'class', 'MyClass', '/test/MyClass.ts', 1, 30),
        createNode('method1', 'method', 'myMethod', '/test/MyClass.ts', 10, 15),
      ];

      const diagram = ClassDiagramBuilder.build(nodes, [], {
        includeMethods: false,
      });

      expect(diagram).not.toContain('myMethod');
    });

    it('should exclude properties when includeProperties is false', () => {
      const nodes: GraphNode[] = [
        createNode('class1', 'class', 'MyClass', '/test/MyClass.ts', 1, 30),
        createNode('prop1', 'variable', 'myProp', '/test/MyClass.ts', 5, 5),
      ];

      const diagram = ClassDiagramBuilder.build(nodes, [], {
        includeProperties: false,
      });

      expect(diagram).not.toContain('myProp');
    });
  });

  describe('namespace grouping', () => {
    it('should group classes by namespace when enabled', () => {
      const nodes: GraphNode[] = [
        createNode('class1', 'class', 'ServiceA', '/src/services/ServiceA.ts'),
        createNode('class2', 'class', 'ServiceB', '/src/services/ServiceB.ts'),
        createNode('class3', 'class', 'ModelA', '/src/models/ModelA.ts'),
      ];

      const diagram = ClassDiagramBuilder.build(nodes, [], {
        groupByNamespace: true,
      });

      expect(diagram).toContain('namespace');
    });
  });
});
