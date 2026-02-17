/**
 * Agentic QE v3 - Hypergraph Schema Manager
 *
 * Provides TypeScript interfaces and schema management for the persistent
 * code knowledge graph (hypergraph). Part of the RuVector Neural Backbone.
 *
 * Features:
 * - Type-safe node and edge definitions
 * - Schema creation and validation
 * - Database integration with unified-memory.ts
 *
 * @see /docs/plans/GOAP-V3-RUVECTOR-NEURAL-BACKBONE.md
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import {
  HYPERGRAPH_NODES_SCHEMA,
  HYPERGRAPH_EDGES_SCHEMA,
  HYPERGRAPH_INDEXES_SCHEMA,
  isMigrationApplied,
} from '../../migrations/20260120_add_hypergraph_tables.js';
import { safeJsonParse } from '../../shared/safe-json.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Valid node types in the hypergraph
 */
export type NodeType = 'function' | 'module' | 'test' | 'file' | 'class';

/**
 * Valid edge types in the hypergraph
 */
export type EdgeType = 'calls' | 'imports' | 'tests' | 'depends_on' | 'covers';

/**
 * Represents a node in the hypergraph (code entity)
 */
export interface HypergraphNode {
  /** Unique identifier for the node */
  id: string;
  /** Type of the code entity */
  type: NodeType;
  /** Name of the entity */
  name: string;
  /** File path where the entity is defined */
  filePath?: string;
  /** Starting line number in the file */
  lineStart?: number;
  /** Ending line number in the file */
  lineEnd?: number;
  /** Cyclomatic complexity score */
  complexity?: number;
  /** Code coverage percentage (0-100) */
  coverage?: number;
  /** Additional metadata as JSON */
  metadata?: Record<string, unknown>;
  /** Vector embedding for semantic search */
  embedding?: number[];
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
}

/**
 * Represents an edge in the hypergraph (relationship)
 */
export interface HypergraphEdge {
  /** Unique identifier for the edge */
  id: string;
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Type of relationship */
  type: EdgeType;
  /** Edge weight (strength of relationship) */
  weight?: number;
  /** Additional properties as JSON */
  properties?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt?: string;
}

/**
 * Database row representation for nodes
 */
export interface HypergraphNodeRow {
  id: string;
  type: string;
  name: string;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  complexity: number | null;
  coverage: number | null;
  metadata: string | null;
  embedding: Buffer | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database row representation for edges
 */
export interface HypergraphEdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  weight: number;
  properties: string | null;
  created_at: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * All valid node types
 */
export const NODE_TYPES: readonly NodeType[] = [
  'function',
  'module',
  'test',
  'file',
  'class',
] as const;

/**
 * All valid edge types
 */
export const EDGE_TYPES: readonly EdgeType[] = [
  'calls',
  'imports',
  'tests',
  'depends_on',
  'covers',
] as const;

// ============================================================================
// HypergraphSchemaManager
// ============================================================================

/**
 * Manages the hypergraph schema in SQLite
 *
 * Responsibilities:
 * - Ensure schema exists on initialization
 * - Validate node and edge types
 * - Provide schema information
 *
 * @example
 * ```typescript
 * import { HypergraphSchemaManager } from './hypergraph-schema';
 * import Database from 'better-sqlite3';
 *
 * const db = new Database(':memory:');
 * const manager = new HypergraphSchemaManager();
 *
 * // Create schema
 * manager.ensureSchema(db);
 *
 * // Check if schema exists
 * const exists = manager.schemaExists(db);
 * console.log(exists); // true
 *
 * // Get valid types
 * console.log(manager.getNodeTypes()); // ['function', 'module', 'test', 'file', 'class']
 * console.log(manager.getEdgeTypes()); // ['calls', 'imports', 'tests', 'depends_on', 'covers']
 * ```
 */
export class HypergraphSchemaManager {
  /**
   * Ensure the hypergraph schema exists in the database
   *
   * Creates tables and indexes if they don't exist.
   * Safe to call multiple times (idempotent).
   *
   * @param db - better-sqlite3 database instance
   * @throws Error if schema creation fails
   */
  ensureSchema(db: DatabaseType): void {
    // Use transaction for atomicity
    const transaction = db.transaction(() => {
      db.exec(HYPERGRAPH_NODES_SCHEMA);
      db.exec(HYPERGRAPH_EDGES_SCHEMA);
      db.exec(HYPERGRAPH_INDEXES_SCHEMA);
    });

    transaction();
  }

  /**
   * Check if the hypergraph schema exists
   *
   * @param db - better-sqlite3 database instance
   * @returns true if both tables exist
   */
  schemaExists(db: DatabaseType): boolean {
    return isMigrationApplied(db);
  }

  /**
   * Get all valid node types
   *
   * @returns Array of valid node type strings
   */
  getNodeTypes(): readonly NodeType[] {
    return NODE_TYPES;
  }

  /**
   * Get all valid edge types
   *
   * @returns Array of valid edge type strings
   */
  getEdgeTypes(): readonly EdgeType[] {
    return EDGE_TYPES;
  }

  /**
   * Validate if a string is a valid node type
   *
   * @param type - Type string to validate
   * @returns true if valid node type
   */
  isValidNodeType(type: string): type is NodeType {
    return NODE_TYPES.includes(type as NodeType);
  }

  /**
   * Validate if a string is a valid edge type
   *
   * @param type - Type string to validate
   * @returns true if valid edge type
   */
  isValidEdgeType(type: string): type is EdgeType {
    return EDGE_TYPES.includes(type as EdgeType);
  }

  /**
   * Get table statistics
   *
   * @param db - better-sqlite3 database instance
   * @returns Object with node and edge counts
   */
  getStats(db: DatabaseType): { nodeCount: number; edgeCount: number } {
    if (!this.schemaExists(db)) {
      return { nodeCount: 0, edgeCount: 0 };
    }

    const nodeCount = (
      db.prepare('SELECT COUNT(*) as count FROM hypergraph_nodes').get() as { count: number }
    ).count;

    const edgeCount = (
      db.prepare('SELECT COUNT(*) as count FROM hypergraph_edges').get() as { count: number }
    ).count;

    return { nodeCount, edgeCount };
  }

  /**
   * Drop the hypergraph schema (for testing)
   *
   * @param db - better-sqlite3 database instance
   */
  dropSchema(db: DatabaseType): void {
    const transaction = db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS hypergraph_edges');
      db.exec('DROP TABLE IF EXISTS hypergraph_nodes');
    });

    transaction();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert a HypergraphNode to database row format
 *
 * @param node - Node to convert
 * @returns Database row object
 */
export function nodeToRow(node: HypergraphNode): Omit<HypergraphNodeRow, 'created_at' | 'updated_at'> {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    file_path: node.filePath ?? null,
    line_start: node.lineStart ?? null,
    line_end: node.lineEnd ?? null,
    complexity: node.complexity ?? null,
    coverage: node.coverage ?? null,
    metadata: node.metadata ? JSON.stringify(node.metadata) : null,
    embedding: node.embedding ? floatArrayToBuffer(node.embedding) : null,
  };
}

/**
 * Convert a database row to HypergraphNode
 *
 * @param row - Database row to convert
 * @returns HypergraphNode object
 */
export function rowToNode(row: HypergraphNodeRow): HypergraphNode {
  return {
    id: row.id,
    type: row.type as NodeType,
    name: row.name,
    filePath: row.file_path ?? undefined,
    lineStart: row.line_start ?? undefined,
    lineEnd: row.line_end ?? undefined,
    complexity: row.complexity ?? undefined,
    coverage: row.coverage ?? undefined,
    metadata: row.metadata ? safeJsonParse(row.metadata) : undefined,
    embedding: row.embedding ? bufferToFloatArray(row.embedding) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert a HypergraphEdge to database row format
 *
 * @param edge - Edge to convert
 * @returns Database row object
 */
export function edgeToRow(edge: HypergraphEdge): Omit<HypergraphEdgeRow, 'created_at'> {
  return {
    id: edge.id,
    source_id: edge.sourceId,
    target_id: edge.targetId,
    type: edge.type,
    weight: edge.weight ?? 1.0,
    properties: edge.properties ? JSON.stringify(edge.properties) : null,
  };
}

/**
 * Convert a database row to HypergraphEdge
 *
 * @param row - Database row to convert
 * @returns HypergraphEdge object
 */
export function rowToEdge(row: HypergraphEdgeRow): HypergraphEdge {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    type: row.type as EdgeType,
    weight: row.weight,
    properties: row.properties ? safeJsonParse(row.properties) : undefined,
    createdAt: row.created_at,
  };
}

/**
 * Generate a unique edge ID from source, target, and type
 *
 * @param sourceId - Source node ID
 * @param targetId - Target node ID
 * @param type - Edge type
 * @returns Unique edge ID
 */
export function generateEdgeId(sourceId: string, targetId: string, type: EdgeType): string {
  return `${sourceId}--${type}-->${targetId}`;
}

// ============================================================================
// Buffer Conversion Helpers
// ============================================================================

/**
 * Convert Float32Array to Buffer for SQLite storage
 *
 * @param arr - Array of floats
 * @returns Buffer containing float data
 */
function floatArrayToBuffer(arr: number[]): Buffer {
  const buffer = Buffer.alloc(arr.length * 4);
  for (let i = 0; i < arr.length; i++) {
    buffer.writeFloatLE(arr[i], i * 4);
  }
  return buffer;
}

/**
 * Convert Buffer from SQLite to Float32Array
 *
 * @param buffer - Buffer containing float data
 * @returns Array of floats
 */
function bufferToFloatArray(buffer: Buffer): number[] {
  const arr: number[] = [];
  const dimensions = buffer.length / 4;
  for (let i = 0; i < dimensions; i++) {
    arr.push(buffer.readFloatLE(i * 4));
  }
  return arr;
}

// ============================================================================
// Default Export
// ============================================================================

export default HypergraphSchemaManager;
