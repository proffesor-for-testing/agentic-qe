/**
 * Types for Code Knowledge Graph
 *
 * Represents relationships between code entities
 * for enhanced context retrieval.
 */

export interface GraphNode {
  /** Unique node identifier */
  id: string;

  /** Node type */
  type: NodeType;

  /** Node label (entity name) */
  label: string;

  /** File containing this entity */
  filePath: string;

  /** Start line in file */
  startLine: number;

  /** End line in file */
  endLine: number;

  /** Programming language */
  language: string;

  /** Additional properties */
  properties: Record<string, unknown>;
}

export type NodeType =
  | 'file'
  | 'class'
  | 'interface'
  | 'function'
  | 'method'
  | 'variable'
  | 'import'
  | 'export'
  | 'type'
  | 'enum';

export interface GraphEdge {
  /** Unique edge identifier */
  id: string;

  /** Source node ID */
  source: string;

  /** Target node ID */
  target: string;

  /** Relationship type */
  type: EdgeType;

  /** Edge weight (relationship strength) */
  weight: number;

  /** Additional properties */
  properties: Record<string, unknown>;
}

export type EdgeType =
  | 'imports'        // A imports B
  | 'exports'        // A exports B
  | 'extends'        // A extends B (class inheritance)
  | 'implements'     // A implements B (interface)
  | 'calls'          // A calls B (function call)
  | 'uses'           // A uses B (variable/type usage)
  | 'contains'       // A contains B (file contains class)
  | 'returns'        // A returns B (return type)
  | 'parameter'      // A has parameter of type B
  | 'overrides'      // A overrides B (method override)
  | 'defines'        // A defines B (file defines entity)
  | 'tests';         // A tests B (test file tests source file)

export interface CodeGraph {
  /** All nodes in the graph */
  nodes: Map<string, GraphNode>;

  /** All edges in the graph */
  edges: Map<string, GraphEdge>;

  /** Index: node ID -> outgoing edge IDs */
  outgoingEdges: Map<string, string[]>;

  /** Index: node ID -> incoming edge IDs */
  incomingEdges: Map<string, string[]>;

  /** Index: file path -> node IDs in that file */
  fileNodes: Map<string, string[]>;
}

export interface GraphBuilderConfig {
  /**
   * Whether to extract import relationships.
   * Default: true
   */
  extractImports: boolean;

  /**
   * Whether to extract inheritance relationships.
   * Default: true
   */
  extractInheritance: boolean;

  /**
   * Whether to extract function calls.
   * Default: true
   */
  extractCalls: boolean;

  /**
   * Whether to extract type usage.
   * Default: true
   */
  extractTypeUsage: boolean;

  /**
   * Maximum depth for call graph analysis.
   * Default: 3
   */
  maxCallDepth: number;

  /**
   * Whether to resolve cross-file references.
   * Default: true
   */
  resolveCrossFile: boolean;
}

export interface GraphStats {
  /** Total nodes */
  nodeCount: number;

  /** Total edges */
  edgeCount: number;

  /** Nodes by type */
  nodesByType: Record<NodeType, number>;

  /** Edges by type */
  edgesByType: Record<EdgeType, number>;

  /** Files in graph */
  fileCount: number;

  /** Average edges per node */
  avgEdgesPerNode: number;

  /** Most connected nodes (top 10) */
  mostConnected: Array<{ nodeId: string; edgeCount: number }>;
}

export interface RelationshipMatch {
  /** Source entity */
  source: GraphNode;

  /** Target entity */
  target: GraphNode;

  /** Relationship type */
  relationship: EdgeType;

  /** Confidence score (0-1) */
  confidence: number;

  /** Evidence (e.g., line of code) */
  evidence?: string;
}

export interface GraphQuery {
  /** Starting node ID or pattern */
  startNode?: string;

  /** Node type filter */
  nodeType?: NodeType;

  /** Edge type filter */
  edgeType?: EdgeType;

  /** Maximum traversal depth */
  maxDepth: number;

  /** Direction of traversal */
  direction: 'outgoing' | 'incoming' | 'both';

  /** Limit results */
  limit: number;
}

export interface GraphQueryResult {
  /** Matched nodes */
  nodes: GraphNode[];

  /** Edges connecting matched nodes */
  edges: GraphEdge[];

  /** Paths found (for path queries) */
  paths?: GraphNode[][];

  /** Query execution time (ms) */
  executionTimeMs: number;
}

export const DEFAULT_GRAPH_BUILDER_CONFIG: GraphBuilderConfig = {
  extractImports: true,
  extractInheritance: true,
  extractCalls: true,
  extractTypeUsage: true,
  maxCallDepth: 3,
  resolveCrossFile: true,
};
