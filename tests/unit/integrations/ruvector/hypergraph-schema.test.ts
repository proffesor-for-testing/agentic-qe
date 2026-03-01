/**
 * Agentic QE v3 - Hypergraph Schema Unit Tests
 *
 * Tests for the hypergraph schema and manager used in the RuVector Neural Backbone.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  HypergraphSchemaManager,
  nodeToRow,
  rowToNode,
  edgeToRow,
  rowToEdge,
  generateEdgeId,
  NODE_TYPES,
  EDGE_TYPES,
} from '../../../../src/integrations/ruvector/hypergraph-schema';
import type {
  HypergraphNode,
  HypergraphEdge,
  HypergraphNodeRow,
  HypergraphEdgeRow,
  NodeType,
  EdgeType,
} from '../../../../src/integrations/ruvector/hypergraph-schema';
import {
  applyMigration,
  isMigrationApplied,
  rollbackMigration,
  MIGRATION_VERSION,
} from '../../../../src/migrations/20260120_add_hypergraph_tables';

describe('Hypergraph Schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    db.close();
  });

  describe('Migration', () => {
    it('should have correct migration version', () => {
      expect(MIGRATION_VERSION).toBe('20260120_add_hypergraph_tables');
    });

    it('should report migration not applied on fresh database', () => {
      expect(isMigrationApplied(db)).toBe(false);
    });

    it('should apply migration successfully', () => {
      applyMigration(db);
      expect(isMigrationApplied(db)).toBe(true);
    });

    it('should be idempotent (safe to apply multiple times)', () => {
      applyMigration(db);
      applyMigration(db);
      expect(isMigrationApplied(db)).toBe(true);
    });

    it('should create hypergraph_nodes table with correct columns', () => {
      applyMigration(db);

      const columns = db.prepare('PRAGMA table_info(hypergraph_nodes)').all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('type');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('file_path');
      expect(columnNames).toContain('line_start');
      expect(columnNames).toContain('line_end');
      expect(columnNames).toContain('complexity');
      expect(columnNames).toContain('coverage');
      expect(columnNames).toContain('metadata');
      expect(columnNames).toContain('embedding');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should create hypergraph_edges table with correct columns', () => {
      applyMigration(db);

      const columns = db.prepare('PRAGMA table_info(hypergraph_edges)').all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('source_id');
      expect(columnNames).toContain('target_id');
      expect(columnNames).toContain('type');
      expect(columnNames).toContain('weight');
      expect(columnNames).toContain('properties');
      expect(columnNames).toContain('created_at');
    });

    it('should create indexes', () => {
      applyMigration(db);

      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name LIKE 'idx_hg_%'
      `).all() as Array<{ name: string }>;

      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_hg_nodes_type');
      expect(indexNames).toContain('idx_hg_nodes_file');
      expect(indexNames).toContain('idx_hg_edges_source');
      expect(indexNames).toContain('idx_hg_edges_target');
      expect(indexNames).toContain('idx_hg_edges_type');
    });

    it('should rollback migration', () => {
      applyMigration(db);
      expect(isMigrationApplied(db)).toBe(true);

      rollbackMigration(db);
      expect(isMigrationApplied(db)).toBe(false);
    });
  });

  describe('HypergraphSchemaManager', () => {
    let manager: HypergraphSchemaManager;

    beforeEach(() => {
      manager = new HypergraphSchemaManager();
    });

    describe('ensureSchema', () => {
      it('should create schema on fresh database', () => {
        expect(manager.schemaExists(db)).toBe(false);
        manager.ensureSchema(db);
        expect(manager.schemaExists(db)).toBe(true);
      });

      it('should be idempotent', () => {
        manager.ensureSchema(db);
        manager.ensureSchema(db);
        expect(manager.schemaExists(db)).toBe(true);
      });
    });

    describe('getNodeTypes', () => {
      it('should return all valid node types', () => {
        const types = manager.getNodeTypes();
        expect(types).toEqual(['function', 'module', 'test', 'file', 'class']);
      });

      it('should be readonly', () => {
        const types = manager.getNodeTypes();
        expect(Object.isFrozen(types) || types === NODE_TYPES).toBe(true);
      });
    });

    describe('getEdgeTypes', () => {
      it('should return all valid edge types', () => {
        const types = manager.getEdgeTypes();
        expect(types).toEqual(['calls', 'imports', 'tests', 'depends_on', 'covers']);
      });

      it('should be readonly', () => {
        const types = manager.getEdgeTypes();
        expect(Object.isFrozen(types) || types === EDGE_TYPES).toBe(true);
      });
    });

    describe('isValidNodeType', () => {
      it('should return true for valid node types', () => {
        expect(manager.isValidNodeType('function')).toBe(true);
        expect(manager.isValidNodeType('module')).toBe(true);
        expect(manager.isValidNodeType('test')).toBe(true);
        expect(manager.isValidNodeType('file')).toBe(true);
        expect(manager.isValidNodeType('class')).toBe(true);
      });

      it('should return false for invalid node types', () => {
        expect(manager.isValidNodeType('invalid')).toBe(false);
        expect(manager.isValidNodeType('')).toBe(false);
        expect(manager.isValidNodeType('Function')).toBe(false);
      });
    });

    describe('isValidEdgeType', () => {
      it('should return true for valid edge types', () => {
        expect(manager.isValidEdgeType('calls')).toBe(true);
        expect(manager.isValidEdgeType('imports')).toBe(true);
        expect(manager.isValidEdgeType('tests')).toBe(true);
        expect(manager.isValidEdgeType('depends_on')).toBe(true);
        expect(manager.isValidEdgeType('covers')).toBe(true);
      });

      it('should return false for invalid edge types', () => {
        expect(manager.isValidEdgeType('invalid')).toBe(false);
        expect(manager.isValidEdgeType('')).toBe(false);
        expect(manager.isValidEdgeType('Calls')).toBe(false);
      });
    });

    describe('getStats', () => {
      it('should return zero counts when schema does not exist', () => {
        const stats = manager.getStats(db);
        expect(stats.nodeCount).toBe(0);
        expect(stats.edgeCount).toBe(0);
      });

      it('should return zero counts on empty schema', () => {
        manager.ensureSchema(db);
        const stats = manager.getStats(db);
        expect(stats.nodeCount).toBe(0);
        expect(stats.edgeCount).toBe(0);
      });

      it('should return correct counts with data', () => {
        manager.ensureSchema(db);

        // Insert test nodes
        db.prepare(`
          INSERT INTO hypergraph_nodes (id, type, name)
          VALUES ('node1', 'function', 'testFunc')
        `).run();
        db.prepare(`
          INSERT INTO hypergraph_nodes (id, type, name)
          VALUES ('node2', 'class', 'TestClass')
        `).run();

        // Insert test edge
        db.prepare(`
          INSERT INTO hypergraph_edges (id, source_id, target_id, type)
          VALUES ('edge1', 'node1', 'node2', 'calls')
        `).run();

        const stats = manager.getStats(db);
        expect(stats.nodeCount).toBe(2);
        expect(stats.edgeCount).toBe(1);
      });
    });

    describe('dropSchema', () => {
      it('should drop all hypergraph tables', () => {
        manager.ensureSchema(db);
        expect(manager.schemaExists(db)).toBe(true);

        manager.dropSchema(db);
        expect(manager.schemaExists(db)).toBe(false);
      });
    });
  });

  describe('Conversion Functions', () => {
    describe('nodeToRow', () => {
      it('should convert minimal node to row', () => {
        const node: HypergraphNode = {
          id: 'node1',
          type: 'function',
          name: 'testFunc',
        };

        const row = nodeToRow(node);

        expect(row.id).toBe('node1');
        expect(row.type).toBe('function');
        expect(row.name).toBe('testFunc');
        expect(row.file_path).toBeNull();
        expect(row.line_start).toBeNull();
        expect(row.line_end).toBeNull();
        expect(row.complexity).toBeNull();
        expect(row.coverage).toBeNull();
        expect(row.metadata).toBeNull();
        expect(row.embedding).toBeNull();
      });

      it('should convert full node to row', () => {
        const node: HypergraphNode = {
          id: 'node1',
          type: 'function',
          name: 'testFunc',
          filePath: '/src/test.ts',
          lineStart: 10,
          lineEnd: 20,
          complexity: 5.5,
          coverage: 80.0,
          metadata: { author: 'test' },
          embedding: [0.1, 0.2, 0.3],
        };

        const row = nodeToRow(node);

        expect(row.id).toBe('node1');
        expect(row.type).toBe('function');
        expect(row.name).toBe('testFunc');
        expect(row.file_path).toBe('/src/test.ts');
        expect(row.line_start).toBe(10);
        expect(row.line_end).toBe(20);
        expect(row.complexity).toBe(5.5);
        expect(row.coverage).toBe(80.0);
        expect(row.metadata).toBe('{"author":"test"}');
        expect(row.embedding).toBeInstanceOf(Buffer);
        expect(row.embedding!.length).toBe(12); // 3 floats * 4 bytes
      });
    });

    describe('rowToNode', () => {
      it('should convert row with nulls to node', () => {
        const row: HypergraphNodeRow = {
          id: 'node1',
          type: 'function',
          name: 'testFunc',
          file_path: null,
          line_start: null,
          line_end: null,
          complexity: null,
          coverage: null,
          metadata: null,
          embedding: null,
          created_at: '2026-01-20T00:00:00.000Z',
          updated_at: '2026-01-20T00:00:00.000Z',
        };

        const node = rowToNode(row);

        expect(node.id).toBe('node1');
        expect(node.type).toBe('function');
        expect(node.name).toBe('testFunc');
        expect(node.filePath).toBeUndefined();
        expect(node.lineStart).toBeUndefined();
        expect(node.lineEnd).toBeUndefined();
        expect(node.complexity).toBeUndefined();
        expect(node.coverage).toBeUndefined();
        expect(node.metadata).toBeUndefined();
        expect(node.embedding).toBeUndefined();
        expect(node.createdAt).toBe('2026-01-20T00:00:00.000Z');
        expect(node.updatedAt).toBe('2026-01-20T00:00:00.000Z');
      });

      it('should convert full row to node', () => {
        // Create embedding buffer
        const embeddingBuffer = Buffer.alloc(12);
        embeddingBuffer.writeFloatLE(0.1, 0);
        embeddingBuffer.writeFloatLE(0.2, 4);
        embeddingBuffer.writeFloatLE(0.3, 8);

        const row: HypergraphNodeRow = {
          id: 'node1',
          type: 'function',
          name: 'testFunc',
          file_path: '/src/test.ts',
          line_start: 10,
          line_end: 20,
          complexity: 5.5,
          coverage: 80.0,
          metadata: '{"author":"test"}',
          embedding: embeddingBuffer,
          created_at: '2026-01-20T00:00:00.000Z',
          updated_at: '2026-01-20T00:00:00.000Z',
        };

        const node = rowToNode(row);

        expect(node.id).toBe('node1');
        expect(node.type).toBe('function');
        expect(node.name).toBe('testFunc');
        expect(node.filePath).toBe('/src/test.ts');
        expect(node.lineStart).toBe(10);
        expect(node.lineEnd).toBe(20);
        expect(node.complexity).toBe(5.5);
        expect(node.coverage).toBe(80.0);
        expect(node.metadata).toEqual({ author: 'test' });
        expect(node.embedding).toHaveLength(3);
        expect(node.embedding![0]).toBeCloseTo(0.1);
        expect(node.embedding![1]).toBeCloseTo(0.2);
        expect(node.embedding![2]).toBeCloseTo(0.3);
      });
    });

    describe('edgeToRow', () => {
      it('should convert minimal edge to row', () => {
        const edge: HypergraphEdge = {
          id: 'edge1',
          sourceId: 'node1',
          targetId: 'node2',
          type: 'calls',
        };

        const row = edgeToRow(edge);

        expect(row.id).toBe('edge1');
        expect(row.source_id).toBe('node1');
        expect(row.target_id).toBe('node2');
        expect(row.type).toBe('calls');
        expect(row.weight).toBe(1.0);
        expect(row.properties).toBeNull();
      });

      it('should convert full edge to row', () => {
        const edge: HypergraphEdge = {
          id: 'edge1',
          sourceId: 'node1',
          targetId: 'node2',
          type: 'calls',
          weight: 0.75,
          properties: { count: 5 },
        };

        const row = edgeToRow(edge);

        expect(row.id).toBe('edge1');
        expect(row.source_id).toBe('node1');
        expect(row.target_id).toBe('node2');
        expect(row.type).toBe('calls');
        expect(row.weight).toBe(0.75);
        expect(row.properties).toBe('{"count":5}');
      });
    });

    describe('rowToEdge', () => {
      it('should convert row with null properties to edge', () => {
        const row: HypergraphEdgeRow = {
          id: 'edge1',
          source_id: 'node1',
          target_id: 'node2',
          type: 'calls',
          weight: 1.0,
          properties: null,
          created_at: '2026-01-20T00:00:00.000Z',
        };

        const edge = rowToEdge(row);

        expect(edge.id).toBe('edge1');
        expect(edge.sourceId).toBe('node1');
        expect(edge.targetId).toBe('node2');
        expect(edge.type).toBe('calls');
        expect(edge.weight).toBe(1.0);
        expect(edge.properties).toBeUndefined();
        expect(edge.createdAt).toBe('2026-01-20T00:00:00.000Z');
      });

      it('should convert full row to edge', () => {
        const row: HypergraphEdgeRow = {
          id: 'edge1',
          source_id: 'node1',
          target_id: 'node2',
          type: 'imports',
          weight: 0.5,
          properties: '{"async":true}',
          created_at: '2026-01-20T00:00:00.000Z',
        };

        const edge = rowToEdge(row);

        expect(edge.id).toBe('edge1');
        expect(edge.sourceId).toBe('node1');
        expect(edge.targetId).toBe('node2');
        expect(edge.type).toBe('imports');
        expect(edge.weight).toBe(0.5);
        expect(edge.properties).toEqual({ async: true });
      });
    });

    describe('generateEdgeId', () => {
      it('should generate consistent edge IDs', () => {
        const id1 = generateEdgeId('node1', 'node2', 'calls');
        const id2 = generateEdgeId('node1', 'node2', 'calls');
        expect(id1).toBe(id2);
        expect(id1).toBe('node1--calls-->node2');
      });

      it('should generate different IDs for different edges', () => {
        const id1 = generateEdgeId('node1', 'node2', 'calls');
        const id2 = generateEdgeId('node1', 'node2', 'imports');
        const id3 = generateEdgeId('node2', 'node1', 'calls');
        expect(id1).not.toBe(id2);
        expect(id1).not.toBe(id3);
      });
    });
  });

  describe('Database Operations', () => {
    let manager: HypergraphSchemaManager;

    beforeEach(() => {
      manager = new HypergraphSchemaManager();
      manager.ensureSchema(db);
    });

    it('should insert and retrieve nodes', () => {
      const node: HypergraphNode = {
        id: 'func_test_1',
        type: 'function',
        name: 'calculateSum',
        filePath: '/src/math.ts',
        lineStart: 10,
        lineEnd: 20,
        complexity: 3.5,
        coverage: 85.0,
        metadata: { params: ['a', 'b'] },
      };

      const row = nodeToRow(node);

      db.prepare(`
        INSERT INTO hypergraph_nodes (id, type, name, file_path, line_start, line_end, complexity, coverage, metadata, embedding)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.type,
        row.name,
        row.file_path,
        row.line_start,
        row.line_end,
        row.complexity,
        row.coverage,
        row.metadata,
        row.embedding
      );

      const retrieved = db.prepare('SELECT * FROM hypergraph_nodes WHERE id = ?').get('func_test_1') as HypergraphNodeRow;
      const retrievedNode = rowToNode(retrieved);

      expect(retrievedNode.id).toBe(node.id);
      expect(retrievedNode.type).toBe(node.type);
      expect(retrievedNode.name).toBe(node.name);
      expect(retrievedNode.filePath).toBe(node.filePath);
      expect(retrievedNode.complexity).toBe(node.complexity);
      expect(retrievedNode.metadata).toEqual(node.metadata);
    });

    it('should insert and retrieve edges', () => {
      // First insert nodes (foreign key constraint)
      db.prepare(`INSERT INTO hypergraph_nodes (id, type, name) VALUES (?, ?, ?)`).run('node1', 'function', 'func1');
      db.prepare(`INSERT INTO hypergraph_nodes (id, type, name) VALUES (?, ?, ?)`).run('node2', 'function', 'func2');

      const edge: HypergraphEdge = {
        id: generateEdgeId('node1', 'node2', 'calls'),
        sourceId: 'node1',
        targetId: 'node2',
        type: 'calls',
        weight: 0.8,
        properties: { async: true },
      };

      const row = edgeToRow(edge);

      db.prepare(`
        INSERT INTO hypergraph_edges (id, source_id, target_id, type, weight, properties)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(row.id, row.source_id, row.target_id, row.type, row.weight, row.properties);

      const retrieved = db.prepare('SELECT * FROM hypergraph_edges WHERE id = ?').get(edge.id) as HypergraphEdgeRow;
      const retrievedEdge = rowToEdge(retrieved);

      expect(retrievedEdge.id).toBe(edge.id);
      expect(retrievedEdge.sourceId).toBe(edge.sourceId);
      expect(retrievedEdge.targetId).toBe(edge.targetId);
      expect(retrievedEdge.type).toBe(edge.type);
      expect(retrievedEdge.weight).toBe(edge.weight);
      expect(retrievedEdge.properties).toEqual(edge.properties);
    });

    it('should enforce unique constraint on edges', () => {
      // Insert nodes
      db.prepare(`INSERT INTO hypergraph_nodes (id, type, name) VALUES (?, ?, ?)`).run('node1', 'function', 'func1');
      db.prepare(`INSERT INTO hypergraph_nodes (id, type, name) VALUES (?, ?, ?)`).run('node2', 'function', 'func2');

      // Insert first edge
      db.prepare(`
        INSERT INTO hypergraph_edges (id, source_id, target_id, type)
        VALUES ('edge1', 'node1', 'node2', 'calls')
      `).run();

      // Try to insert duplicate (same source, target, type)
      expect(() => {
        db.prepare(`
          INSERT INTO hypergraph_edges (id, source_id, target_id, type)
          VALUES ('edge2', 'node1', 'node2', 'calls')
        `).run();
      }).toThrow();
    });

    it('should query nodes by type using index', () => {
      db.prepare(`INSERT INTO hypergraph_nodes (id, type, name) VALUES (?, ?, ?)`).run('func1', 'function', 'testFunc');
      db.prepare(`INSERT INTO hypergraph_nodes (id, type, name) VALUES (?, ?, ?)`).run('func2', 'function', 'anotherFunc');
      db.prepare(`INSERT INTO hypergraph_nodes (id, type, name) VALUES (?, ?, ?)`).run('class1', 'class', 'TestClass');

      const functions = db.prepare('SELECT * FROM hypergraph_nodes WHERE type = ?').all('function') as HypergraphNodeRow[];
      const classes = db.prepare('SELECT * FROM hypergraph_nodes WHERE type = ?').all('class') as HypergraphNodeRow[];

      expect(functions.length).toBe(2);
      expect(classes.length).toBe(1);
    });

    it('should query edges by source or target using indexes', () => {
      // Insert nodes
      db.prepare(`INSERT INTO hypergraph_nodes (id, type, name) VALUES (?, ?, ?)`).run('node1', 'function', 'func1');
      db.prepare(`INSERT INTO hypergraph_nodes (id, type, name) VALUES (?, ?, ?)`).run('node2', 'function', 'func2');
      db.prepare(`INSERT INTO hypergraph_nodes (id, type, name) VALUES (?, ?, ?)`).run('node3', 'function', 'func3');

      // Insert edges
      db.prepare(`INSERT INTO hypergraph_edges (id, source_id, target_id, type) VALUES (?, ?, ?, ?)`).run('e1', 'node1', 'node2', 'calls');
      db.prepare(`INSERT INTO hypergraph_edges (id, source_id, target_id, type) VALUES (?, ?, ?, ?)`).run('e2', 'node1', 'node3', 'calls');
      db.prepare(`INSERT INTO hypergraph_edges (id, source_id, target_id, type) VALUES (?, ?, ?, ?)`).run('e3', 'node2', 'node3', 'calls');

      const outgoing = db.prepare('SELECT * FROM hypergraph_edges WHERE source_id = ?').all('node1');
      const incoming = db.prepare('SELECT * FROM hypergraph_edges WHERE target_id = ?').all('node3');

      expect(outgoing.length).toBe(2);
      expect(incoming.length).toBe(2);
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety for NodeType', () => {
      const validTypes: NodeType[] = ['function', 'module', 'test', 'file', 'class'];

      for (const type of validTypes) {
        const node: HypergraphNode = { id: 'test', type, name: 'test' };
        expect(node.type).toBe(type);
      }
    });

    it('should maintain type safety for EdgeType', () => {
      const validTypes: EdgeType[] = ['calls', 'imports', 'tests', 'depends_on', 'covers'];

      for (const type of validTypes) {
        const edge: HypergraphEdge = { id: 'test', sourceId: 'a', targetId: 'b', type };
        expect(edge.type).toBe(type);
      }
    });
  });
});
