/**
 * Unit Tests for RelationshipExtractor
 *
 * Tests extraction of code relationships from parsed entities.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { GraphBuilder } from '../../../src/code-intelligence/graph/GraphBuilder.js';
import { RelationshipExtractor, ParsedEntity } from '../../../src/code-intelligence/graph/RelationshipExtractor.js';

describe('RelationshipExtractor', () => {
  let graphBuilder: GraphBuilder;
  let extractor: RelationshipExtractor;

  beforeEach(() => {
    graphBuilder = new GraphBuilder();
    extractor = new RelationshipExtractor(graphBuilder);
  });

  describe('basic extraction', () => {
    it('should create nodes from entities', () => {
      const entities: ParsedEntity[] = [
        {
          type: 'function',
          name: 'processData',
          filePath: '/src/utils.ts',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          type: 'class',
          name: 'UserService',
          filePath: '/src/service.ts',
          startLine: 1,
          endLine: 50,
          language: 'typescript',
        },
      ];

      const result = extractor.extractFromEntities(entities);

      expect(result.nodesCreated).toBe(2);
      expect(graphBuilder.findNode('processData')).toBeDefined();
      expect(graphBuilder.findNode('UserService')).toBeDefined();
    });

    it('should extract containment relationships', () => {
      const entities: ParsedEntity[] = [
        {
          type: 'class',
          name: 'UserService',
          filePath: '/src/service.ts',
          startLine: 1,
          endLine: 50,
          language: 'typescript',
        },
        {
          type: 'method',
          name: 'getUser',
          filePath: '/src/service.ts',
          startLine: 5,
          endLine: 15,
          language: 'typescript',
          parent: 'UserService',
        },
        {
          type: 'method',
          name: 'createUser',
          filePath: '/src/service.ts',
          startLine: 20,
          endLine: 35,
          language: 'typescript',
          parent: 'UserService',
        },
      ];

      const result = extractor.extractFromEntities(entities);

      expect(result.nodesCreated).toBe(3);
      expect(result.edgesCreated).toBe(2); // UserService contains 2 methods

      const classNode = graphBuilder.findNode('UserService')!;
      const outgoing = graphBuilder.getOutgoingEdges(classNode.id);
      expect(outgoing.length).toBe(2);
      expect(outgoing.every(e => e.type === 'contains')).toBe(true);
    });
  });

  describe('inheritance extraction', () => {
    it('should extract extends relationships', () => {
      const entities: ParsedEntity[] = [
        {
          type: 'class',
          name: 'BaseService',
          filePath: '/src/base.ts',
          startLine: 1,
          endLine: 30,
          language: 'typescript',
        },
        {
          type: 'class',
          name: 'UserService',
          filePath: '/src/user.ts',
          startLine: 1,
          endLine: 50,
          language: 'typescript',
          extends: 'BaseService',
        },
      ];

      const result = extractor.extractFromEntities(entities);

      expect(result.edgesCreated).toBeGreaterThanOrEqual(1);

      const userNode = graphBuilder.findNode('UserService')!;
      const outgoing = graphBuilder.getOutgoingEdges(userNode.id);
      const extendsEdge = outgoing.find(e => e.type === 'extends');

      expect(extendsEdge).toBeDefined();
    });

    it('should extract implements relationships', () => {
      const entities: ParsedEntity[] = [
        {
          type: 'interface',
          name: 'IUserService',
          filePath: '/src/interfaces.ts',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          type: 'interface',
          name: 'ILoggable',
          filePath: '/src/interfaces.ts',
          startLine: 15,
          endLine: 20,
          language: 'typescript',
        },
        {
          type: 'class',
          name: 'UserService',
          filePath: '/src/service.ts',
          startLine: 1,
          endLine: 50,
          language: 'typescript',
          implements: ['IUserService', 'ILoggable'],
        },
      ];

      const result = extractor.extractFromEntities(entities);

      const userNode = graphBuilder.findNode('UserService')!;
      const outgoing = graphBuilder.getOutgoingEdges(userNode.id);
      const implementsEdges = outgoing.filter(e => e.type === 'implements');

      expect(implementsEdges.length).toBe(2);
    });
  });

  describe('type reference extraction', () => {
    it('should extract return type references', () => {
      const entities: ParsedEntity[] = [
        {
          type: 'interface',
          name: 'User',
          filePath: '/src/types.ts',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          type: 'function',
          name: 'getUser',
          filePath: '/src/service.ts',
          startLine: 1,
          endLine: 15,
          language: 'typescript',
          returnType: 'User',
        },
      ];

      const result = extractor.extractFromEntities(entities);

      const fnNode = graphBuilder.findNode('getUser')!;
      const outgoing = graphBuilder.getOutgoingEdges(fnNode.id);
      const returnsEdge = outgoing.find(e => e.type === 'returns');

      expect(returnsEdge).toBeDefined();
    });

    it('should extract parameter type references', () => {
      const entities: ParsedEntity[] = [
        {
          type: 'interface',
          name: 'UserData',
          filePath: '/src/types.ts',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          type: 'function',
          name: 'createUser',
          filePath: '/src/service.ts',
          startLine: 1,
          endLine: 15,
          language: 'typescript',
          parameters: [
            { name: 'data', type: 'UserData' },
          ],
        },
      ];

      const result = extractor.extractFromEntities(entities);

      const fnNode = graphBuilder.findNode('createUser')!;
      const outgoing = graphBuilder.getOutgoingEdges(fnNode.id);
      const paramEdge = outgoing.find(e => e.type === 'parameter');

      expect(paramEdge).toBeDefined();
    });
  });

  describe('reference extraction', () => {
    it('should extract uses relationships', () => {
      const entities: ParsedEntity[] = [
        {
          type: 'variable',
          name: 'config',
          filePath: '/src/config.ts',
          startLine: 1,
          endLine: 5,
          language: 'typescript',
        },
        {
          type: 'function',
          name: 'initialize',
          filePath: '/src/app.ts',
          startLine: 1,
          endLine: 20,
          language: 'typescript',
          references: ['config'],
        },
      ];

      const result = extractor.extractFromEntities(entities);

      const fnNode = graphBuilder.findNode('initialize')!;
      const outgoing = graphBuilder.getOutgoingEdges(fnNode.id);
      const usesEdge = outgoing.find(e => e.type === 'uses');

      expect(usesEdge).toBeDefined();
    });
  });

  describe('file containment', () => {
    it('should create file node and containment edges', () => {
      const entities: ParsedEntity[] = [
        {
          type: 'function',
          name: 'fn1',
          filePath: '/src/utils.ts',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          type: 'function',
          name: 'fn2',
          filePath: '/src/utils.ts',
          startLine: 15,
          endLine: 25,
          language: 'typescript',
        },
      ];

      // First create entity nodes
      extractor.extractFromEntities(entities);

      // Then create file containment
      const result = extractor.extractFileContainment('/src/utils.ts', entities);

      expect(result.nodesCreated).toBe(1); // File node
      expect(result.edgesCreated).toBe(2); // 2 containment edges

      const fileNode = graphBuilder.findNode('utils.ts', '/src/utils.ts', 'file');
      expect(fileNode).toBeDefined();
      expect(fileNode?.type).toBe('file');
    });
  });

  describe('call extraction', () => {
    it('should extract call relationships', () => {
      const entities: ParsedEntity[] = [
        {
          type: 'function',
          name: 'main',
          filePath: '/src/app.ts',
          startLine: 1,
          endLine: 20,
          language: 'typescript',
        },
        {
          type: 'function',
          name: 'helper1',
          filePath: '/src/utils.ts',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        {
          type: 'function',
          name: 'helper2',
          filePath: '/src/utils.ts',
          startLine: 15,
          endLine: 25,
          language: 'typescript',
        },
      ];

      // First create nodes
      extractor.extractFromEntities(entities);

      // Then extract calls
      const result = extractor.extractCalls(
        entities[0], // main
        ['helper1', 'helper2'],
        entities
      );

      expect(result.edgesCreated).toBe(2);
      expect(result.relationships.every(r => r.relationship === 'calls')).toBe(true);
    });
  });

  describe('complex scenario', () => {
    it('should handle complete module extraction', () => {
      const entities: ParsedEntity[] = [
        // Interface
        {
          type: 'interface',
          name: 'IRepository',
          filePath: '/src/interfaces.ts',
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        },
        // Base class
        {
          type: 'class',
          name: 'BaseRepository',
          filePath: '/src/base.ts',
          startLine: 1,
          endLine: 50,
          language: 'typescript',
          implements: ['IRepository'],
        },
        // Derived class with methods
        {
          type: 'class',
          name: 'UserRepository',
          filePath: '/src/user.ts',
          startLine: 1,
          endLine: 100,
          language: 'typescript',
          extends: 'BaseRepository',
        },
        {
          type: 'method',
          name: 'findById',
          filePath: '/src/user.ts',
          startLine: 10,
          endLine: 25,
          language: 'typescript',
          parent: 'UserRepository',
          returnType: 'User',
        },
        // User type
        {
          type: 'interface',
          name: 'User',
          filePath: '/src/types.ts',
          startLine: 1,
          endLine: 15,
          language: 'typescript',
        },
      ];

      const result = extractor.extractFromEntities(entities);

      expect(result.nodesCreated).toBe(5);
      expect(result.edgesCreated).toBeGreaterThanOrEqual(3); // contains, extends, implements, returns

      const stats = graphBuilder.getStats();
      expect(stats.nodesByType['class']).toBe(2);
      expect(stats.nodesByType['interface']).toBe(2);
      expect(stats.nodesByType['method']).toBe(1);
    });
  });
});
