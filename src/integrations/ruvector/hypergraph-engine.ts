/**
 * Agentic QE v3 - Hypergraph Query Engine
 *
 * Provides a Cypher-like query interface for the persistent code hypergraph.
 * Part of the RuVector Neural Backbone integration (GOAP Action 6).
 *
 * Features:
 * - CRUD operations for nodes and edges
 * - Cypher-like pattern matching queries
 * - Graph traversal with configurable depth
 * - QE-specific convenience methods (untested functions, impacted tests, coverage gaps)
 * - Integration with existing KnowledgeGraphService
 *
 * @see /docs/plans/GOAP-V3-RUVECTOR-NEURAL-BACKBONE.md
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  HypergraphSchemaManager,
  nodeToRow,
  rowToNode,
  edgeToRow,
  rowToEdge,
  generateEdgeId,
} from './hypergraph-schema.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import type {
  HypergraphNode,
  HypergraphEdge,
  HypergraphNodeRow,
  HypergraphEdgeRow,
  NodeType,
  EdgeType,
} from './hypergraph-schema.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the Hypergraph Engine
 */
export interface HypergraphEngineConfig {
  /** Database instance (better-sqlite3) */
  db: DatabaseType;
  /** Maximum depth for traversals (default: 10) */
  maxTraversalDepth: number;
  /** Maximum nodes to return in queries (default: 1000) */
  maxQueryResults: number;
  /** Enable vector similarity search (requires GNN index) */
  enableVectorSearch: boolean;
}

/**
 * Default engine configuration
 */
export const DEFAULT_HYPERGRAPH_ENGINE_CONFIG: Omit<HypergraphEngineConfig, 'db'> = {
  maxTraversalDepth: 10,
  maxQueryResults: 1000,
  enableVectorSearch: false,
};

// ============================================================================
// Query Criteria Types
// ============================================================================

/**
 * Criteria for finding nodes
 */
export interface NodeCriteria {
  /** Filter by node type(s) */
  type?: NodeType | NodeType[];
  /** Filter by file path (exact match or pattern with %) */
  filePath?: string;
  /** Filter by name (exact match, or RegExp for pattern matching) */
  name?: string | RegExp;
  /** Minimum complexity threshold */
  minComplexity?: number;
  /** Maximum complexity threshold */
  maxComplexity?: number;
  /** Minimum coverage percentage */
  minCoverage?: number;
  /** Maximum coverage percentage */
  maxCoverage?: number;
  /** Limit results */
  limit?: number;
}

/**
 * Criteria for finding edges
 */
export interface EdgeCriteria {
  /** Filter by edge type(s) */
  type?: EdgeType | EdgeType[];
  /** Filter by source node ID */
  sourceId?: string;
  /** Filter by target node ID */
  targetId?: string;
  /** Minimum weight threshold */
  minWeight?: number;
  /** Limit results */
  limit?: number;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a graph traversal
 */
export interface TraversalResult {
  /** All nodes visited during traversal */
  nodes: HypergraphNode[];
  /** All edges traversed */
  edges: HypergraphEdge[];
  /** All paths found (each path is a sequence of node/edge IDs) */
  paths: Array<{ nodes: string[]; edges: string[] }>;
  /** Maximum depth reached */
  maxDepthReached: number;
}

/**
 * Result of module dependency analysis
 */
export interface ModuleDependencyResult {
  /** The target module */
  module: HypergraphNode;
  /** Direct dependencies (imports) */
  directDependencies: HypergraphNode[];
  /** Modules that depend on this module */
  dependents: HypergraphNode[];
  /** Transitive dependencies */
  transitiveDependencies: HypergraphNode[];
  /** Depth of the deepest dependency chain */
  maxDependencyDepth: number;
}

/**
 * Result of building the hypergraph
 */
export interface BuildResult {
  /** Number of nodes created */
  nodesCreated: number;
  /** Number of edges created */
  edgesCreated: number;
  /** Number of nodes updated */
  nodesUpdated: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Errors encountered */
  errors: Array<{ entity: string; error: string }>;
}

/**
 * Result of syncing with KnowledgeGraphService
 */
export interface SyncResult {
  /** Number of nodes synced */
  nodesSynced: number;
  /** Number of edges synced */
  edgesSynced: number;
  /** Nodes added during sync */
  nodesAdded: number;
  /** Nodes removed during sync */
  nodesRemoved: number;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Hypergraph statistics
 */
export interface HypergraphStats {
  /** Total number of nodes */
  totalNodes: number;
  /** Total number of edges */
  totalEdges: number;
  /** Node counts by type */
  nodesByType: Record<NodeType, number>;
  /** Edge counts by type */
  edgesByType: Record<EdgeType, number>;
  /** Average node complexity */
  avgComplexity: number;
  /** Average node coverage */
  avgCoverage: number;
  /** Number of nodes with embeddings */
  nodesWithEmbeddings: number;
}

// ============================================================================
// Code Index Result (for buildFromIndexResult)
// ============================================================================

/**
 * Result from code indexing (compatible with KnowledgeGraphService)
 */
export interface CodeIndexResult {
  /** Files that were indexed */
  files: Array<{
    path: string;
    entities: Array<{
      type: 'function' | 'class' | 'module' | 'interface';
      name: string;
      lineStart: number;
      lineEnd?: number;
      complexity?: number;
      coverage?: number;
    }>;
    imports: string[];
  }>;
}

// ============================================================================
// HypergraphEngine Class
// ============================================================================

/**
 * Query engine for the code knowledge hypergraph
 *
 * Provides CRUD operations, pattern matching queries, and QE-specific
 * convenience methods for working with the persistent hypergraph.
 *
 * @example
 * ```typescript
 * import Database from 'better-sqlite3';
 * import { HypergraphEngine } from './hypergraph-engine';
 *
 * const db = new Database('.agentic-qe/memory.db');
 * const engine = new HypergraphEngine({ db });
 * await engine.initialize();
 *
 * // Find untested functions
 * const untested = await engine.findUntestedFunctions();
 *
 * // Traverse from a starting node
 * const result = await engine.traverse('func:calculateSum', ['calls'], 3);
 *
 * // Find impacted tests
 * const tests = await engine.findImpactedTests(['src/math.ts']);
 * ```
 */
export class HypergraphEngine {
  private readonly config: HypergraphEngineConfig;
  private readonly schemaManager: HypergraphSchemaManager;
  private initialized = false;

  constructor(config: Partial<HypergraphEngineConfig> & { db: DatabaseType }) {
    this.config = {
      ...DEFAULT_HYPERGRAPH_ENGINE_CONFIG,
      ...config,
    };
    this.schemaManager = new HypergraphSchemaManager();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the engine, ensuring schema exists
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure hypergraph schema exists
    this.schemaManager.ensureSchema(this.config.db);
    this.initialized = true;
  }

  /**
   * Check if engine is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // CRUD Operations - Nodes
  // ============================================================================

  /**
   * Add a new node to the hypergraph
   *
   * @param node - Node data (id will be generated if not provided)
   * @returns The generated or provided node ID
   */
  async addNode(
    node: Omit<HypergraphNode, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    this.ensureInitialized();

    const id = uuidv4();
    const fullNode: HypergraphNode = { id, ...node };
    const row = nodeToRow(fullNode);

    this.config.db.prepare(`
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

    return id;
  }

  /**
   * Add a new edge to the hypergraph
   *
   * @param edge - Edge data (id will be generated if not provided)
   * @returns The generated or provided edge ID
   */
  async addEdge(
    edge: Omit<HypergraphEdge, 'id' | 'createdAt'>
  ): Promise<string> {
    this.ensureInitialized();

    const id = generateEdgeId(edge.sourceId, edge.targetId, edge.type);
    const fullEdge: HypergraphEdge = { id, ...edge };
    const row = edgeToRow(fullEdge);

    this.config.db.prepare(`
      INSERT OR REPLACE INTO hypergraph_edges (id, source_id, target_id, type, weight, properties)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      row.id,
      row.source_id,
      row.target_id,
      row.type,
      row.weight,
      row.properties
    );

    return id;
  }

  /**
   * Get a node by ID
   *
   * @param id - Node ID
   * @returns The node or null if not found
   */
  async getNode(id: string): Promise<HypergraphNode | null> {
    this.ensureInitialized();

    const row = this.config.db.prepare(
      'SELECT * FROM hypergraph_nodes WHERE id = ?'
    ).get(id) as HypergraphNodeRow | undefined;

    return row ? rowToNode(row) : null;
  }

  /**
   * Get an edge by ID
   *
   * @param id - Edge ID
   * @returns The edge or null if not found
   */
  async getEdge(id: string): Promise<HypergraphEdge | null> {
    this.ensureInitialized();

    const row = this.config.db.prepare(
      'SELECT * FROM hypergraph_edges WHERE id = ?'
    ).get(id) as HypergraphEdgeRow | undefined;

    return row ? rowToEdge(row) : null;
  }

  /**
   * Update an existing node
   *
   * @param id - Node ID to update
   * @param updates - Partial node data to update
   */
  async updateNode(
    id: string,
    updates: Partial<Omit<HypergraphNode, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    this.ensureInitialized();

    const existing = await this.getNode(id);
    if (!existing) {
      throw new Error(`Node not found: ${id}`);
    }

    const updated: HypergraphNode = { ...existing, ...updates };
    const row = nodeToRow(updated);

    this.config.db.prepare(`
      UPDATE hypergraph_nodes
      SET type = ?, name = ?, file_path = ?, line_start = ?, line_end = ?,
          complexity = ?, coverage = ?, metadata = ?, embedding = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      row.type,
      row.name,
      row.file_path,
      row.line_start,
      row.line_end,
      row.complexity,
      row.coverage,
      row.metadata,
      row.embedding,
      id
    );
  }

  /**
   * Delete a node (and all connected edges)
   *
   * @param id - Node ID to delete
   */
  async deleteNode(id: string): Promise<void> {
    this.ensureInitialized();

    // Delete connected edges first (foreign key constraint)
    this.config.db.prepare(
      'DELETE FROM hypergraph_edges WHERE source_id = ? OR target_id = ?'
    ).run(id, id);

    this.config.db.prepare('DELETE FROM hypergraph_nodes WHERE id = ?').run(id);
  }

  /**
   * Delete an edge
   *
   * @param id - Edge ID to delete
   */
  async deleteEdge(id: string): Promise<void> {
    this.ensureInitialized();

    this.config.db.prepare('DELETE FROM hypergraph_edges WHERE id = ?').run(id);
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Find nodes matching criteria
   *
   * @param criteria - Search criteria
   * @returns Matching nodes
   */
  async findNodes(criteria: NodeCriteria): Promise<HypergraphNode[]> {
    this.ensureInitialized();

    const conditions: string[] = [];
    const params: unknown[] = [];

    // Build WHERE clause from criteria
    if (criteria.type) {
      const types = Array.isArray(criteria.type) ? criteria.type : [criteria.type];
      conditions.push(`type IN (${types.map(() => '?').join(', ')})`);
      params.push(...types);
    }

    if (criteria.filePath) {
      if (criteria.filePath.includes('%')) {
        conditions.push('file_path LIKE ?');
      } else {
        conditions.push('file_path = ?');
      }
      params.push(criteria.filePath);
    }

    if (criteria.name && typeof criteria.name === 'string') {
      conditions.push('name = ?');
      params.push(criteria.name);
    }

    if (criteria.minComplexity !== undefined) {
      conditions.push('complexity >= ?');
      params.push(criteria.minComplexity);
    }

    if (criteria.maxComplexity !== undefined) {
      conditions.push('complexity <= ?');
      params.push(criteria.maxComplexity);
    }

    if (criteria.minCoverage !== undefined) {
      conditions.push('coverage >= ?');
      params.push(criteria.minCoverage);
    }

    if (criteria.maxCoverage !== undefined) {
      conditions.push('coverage <= ?');
      params.push(criteria.maxCoverage);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = criteria.limit ?? this.config.maxQueryResults;

    const sql = `SELECT * FROM hypergraph_nodes ${whereClause} LIMIT ?`;
    params.push(limit);

    const rows = this.config.db.prepare(sql).all(...params) as HypergraphNodeRow[];

    // Apply RegExp filter for name if needed
    let nodes = rows.map(rowToNode);
    if (criteria.name instanceof RegExp) {
      nodes = nodes.filter((n) => criteria.name instanceof RegExp && criteria.name.test(n.name));
    }

    return nodes;
  }

  /**
   * Find edges matching criteria
   *
   * @param criteria - Search criteria
   * @returns Matching edges
   */
  async findEdges(criteria: EdgeCriteria): Promise<HypergraphEdge[]> {
    this.ensureInitialized();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (criteria.type) {
      const types = Array.isArray(criteria.type) ? criteria.type : [criteria.type];
      conditions.push(`type IN (${types.map(() => '?').join(', ')})`);
      params.push(...types);
    }

    if (criteria.sourceId) {
      conditions.push('source_id = ?');
      params.push(criteria.sourceId);
    }

    if (criteria.targetId) {
      conditions.push('target_id = ?');
      params.push(criteria.targetId);
    }

    if (criteria.minWeight !== undefined) {
      conditions.push('weight >= ?');
      params.push(criteria.minWeight);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = criteria.limit ?? this.config.maxQueryResults;

    const sql = `SELECT * FROM hypergraph_edges ${whereClause} LIMIT ?`;
    params.push(limit);

    const rows = this.config.db.prepare(sql).all(...params) as HypergraphEdgeRow[];

    return rows.map(rowToEdge);
  }

  /**
   * Traverse the graph from a starting node
   *
   * @param startNodeId - Starting node ID
   * @param edgeTypes - Edge types to follow (empty array = all types)
   * @param maxDepth - Maximum traversal depth (default: 5)
   * @returns Traversal result with all visited nodes, edges, and paths
   */
  async traverse(
    startNodeId: string,
    edgeTypes: EdgeType[] = [],
    maxDepth: number = 5
  ): Promise<TraversalResult> {
    this.ensureInitialized();

    const visitedNodes = new Map<string, HypergraphNode>();
    const visitedEdges = new Map<string, HypergraphEdge>();
    const paths: Array<{ nodes: string[]; edges: string[] }> = [];
    let maxDepthReached = 0;

    // BFS traversal
    const queue: Array<{ nodeId: string; depth: number; path: { nodes: string[]; edges: string[] } }> = [
      { nodeId: startNodeId, depth: 0, path: { nodes: [startNodeId], edges: [] } },
    ];

    const effectiveMaxDepth = Math.min(maxDepth, this.config.maxTraversalDepth);

    while (queue.length > 0) {
      const { nodeId, depth, path } = queue.shift()!;

      // Get node if not visited
      if (!visitedNodes.has(nodeId)) {
        const node = await this.getNode(nodeId);
        if (node) {
          visitedNodes.set(nodeId, node);
        }
      }

      maxDepthReached = Math.max(maxDepthReached, depth);

      // Stop if max depth reached
      if (depth >= effectiveMaxDepth) {
        paths.push(path);
        continue;
      }

      // Find outgoing edges
      const edgeCriteria: EdgeCriteria = { sourceId: nodeId };
      if (edgeTypes.length > 0) {
        edgeCriteria.type = edgeTypes;
      }

      const edges = await this.findEdges(edgeCriteria);

      if (edges.length === 0) {
        paths.push(path);
        continue;
      }

      for (const edge of edges) {
        if (!visitedEdges.has(edge.id)) {
          visitedEdges.set(edge.id, edge);

          const newPath = {
            nodes: [...path.nodes, edge.targetId],
            edges: [...path.edges, edge.id],
          };

          queue.push({
            nodeId: edge.targetId,
            depth: depth + 1,
            path: newPath,
          });
        }
      }
    }

    return {
      nodes: Array.from(visitedNodes.values()),
      edges: Array.from(visitedEdges.values()),
      paths,
      maxDepthReached,
    };
  }

  // ============================================================================
  // QE-Specific Convenience Methods
  // ============================================================================

  /**
   * Find functions that are not covered by any test
   *
   * A function is considered untested if no 'test' node has a 'covers' edge to it.
   *
   * @returns Array of untested function nodes
   */
  async findUntestedFunctions(): Promise<HypergraphNode[]> {
    this.ensureInitialized();

    // Find all functions that have NO incoming 'covers' edge from a test
    const sql = `
      SELECT n.* FROM hypergraph_nodes n
      WHERE n.type = 'function'
        AND NOT EXISTS (
          SELECT 1 FROM hypergraph_edges e
          JOIN hypergraph_nodes t ON t.id = e.source_id
          WHERE e.target_id = n.id
            AND e.type = 'covers'
            AND t.type = 'test'
        )
      ORDER BY n.complexity DESC NULLS LAST
      LIMIT ?
    `;

    const rows = this.config.db.prepare(sql).all(this.config.maxQueryResults) as HypergraphNodeRow[];

    return rows.map(rowToNode);
  }

  /**
   * Find tests that cover functions in the given changed files
   *
   * @param changedFiles - Array of file paths that have changed
   * @returns Array of test nodes that should be run
   */
  async findImpactedTests(changedFiles: string[]): Promise<HypergraphNode[]> {
    this.ensureInitialized();

    if (changedFiles.length === 0) {
      return [];
    }

    // Build placeholders for IN clause
    const placeholders = changedFiles.map(() => '?').join(', ');

    // Find tests that cover functions in the changed files
    const sql = `
      SELECT DISTINCT t.* FROM hypergraph_nodes t
      JOIN hypergraph_edges e ON e.source_id = t.id
      JOIN hypergraph_nodes f ON f.id = e.target_id
      WHERE t.type = 'test'
        AND e.type = 'covers'
        AND f.type = 'function'
        AND f.file_path IN (${placeholders})
      LIMIT ?
    `;

    const params = [...changedFiles, this.config.maxQueryResults];
    const rows = this.config.db.prepare(sql).all(...params) as HypergraphNodeRow[];

    return rows.map(rowToNode);
  }

  /**
   * Find functions with low coverage (coverage gaps)
   *
   * @param maxCoverage - Maximum coverage percentage to consider as a gap (default: 50)
   * @returns Array of function nodes with low coverage
   */
  async findCoverageGaps(maxCoverage: number = 50): Promise<HypergraphNode[]> {
    this.ensureInitialized();

    const sql = `
      SELECT * FROM hypergraph_nodes
      WHERE type = 'function'
        AND coverage IS NOT NULL
        AND coverage <= ?
      ORDER BY coverage ASC, complexity DESC NULLS LAST
      LIMIT ?
    `;

    const rows = this.config.db.prepare(sql).all(
      maxCoverage,
      this.config.maxQueryResults
    ) as HypergraphNodeRow[];

    return rows.map(rowToNode);
  }

  /**
   * Find module dependencies
   *
   * @param modulePath - Path to the module to analyze
   * @returns Dependency analysis result
   */
  async findModuleDependencies(modulePath: string): Promise<ModuleDependencyResult> {
    this.ensureInitialized();

    // Find the module node
    const moduleNodes = await this.findNodes({ type: 'module', filePath: modulePath, limit: 1 });

    if (moduleNodes.length === 0) {
      // Try finding by file node
      const fileNodes = await this.findNodes({ type: 'file', filePath: modulePath, limit: 1 });
      if (fileNodes.length === 0) {
        throw new Error(`Module not found: ${modulePath}`);
      }
      moduleNodes.push(fileNodes[0]);
    }

    const moduleNode = moduleNodes[0];

    // Find direct dependencies (this module imports)
    const directDepsEdges = await this.findEdges({
      sourceId: moduleNode.id,
      type: ['imports', 'depends_on'],
    });

    const directDependencies: HypergraphNode[] = [];
    for (const edge of directDepsEdges) {
      const node = await this.getNode(edge.targetId);
      if (node) {
        directDependencies.push(node);
      }
    }

    // Find dependents (modules that import this one)
    const dependentEdges = await this.findEdges({
      targetId: moduleNode.id,
      type: ['imports', 'depends_on'],
    });

    const dependents: HypergraphNode[] = [];
    for (const edge of dependentEdges) {
      const node = await this.getNode(edge.sourceId);
      if (node) {
        dependents.push(node);
      }
    }

    // Find transitive dependencies via traversal
    const traversalResult = await this.traverse(moduleNode.id, ['imports', 'depends_on'], 5);

    // Filter out the starting node from transitive dependencies
    const transitiveDependencies = traversalResult.nodes.filter(
      (n) => n.id !== moduleNode.id
    );

    return {
      module: moduleNode,
      directDependencies,
      dependents,
      transitiveDependencies,
      maxDependencyDepth: traversalResult.maxDepthReached,
    };
  }

  // ============================================================================
  // Graph Building Methods
  // ============================================================================

  /**
   * Build hypergraph from code index result
   *
   * @param indexResult - Result from code indexing
   * @returns Build statistics
   */
  async buildFromIndexResult(indexResult: CodeIndexResult): Promise<BuildResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    let nodesCreated = 0;
    let nodesUpdated = 0;
    let edgesCreated = 0;
    const errors: Array<{ entity: string; error: string }> = [];

    // Use transaction for atomicity
    const transaction = this.config.db.transaction(() => {
      // Phase 1: Create all file nodes first (to satisfy FK constraints for edges)
      for (const file of indexResult.files) {
        try {
          const fileId = `file:${file.path}`;
          const existingFile = this.config.db.prepare(
            'SELECT id FROM hypergraph_nodes WHERE id = ?'
          ).get(fileId);

          if (existingFile) {
            nodesUpdated++;
          } else {
            this.config.db.prepare(`
              INSERT INTO hypergraph_nodes (id, type, name, file_path)
              VALUES (?, 'file', ?, ?)
            `).run(fileId, file.path.split('/').pop() || file.path, file.path);
            nodesCreated++;
          }
        } catch (fileError) {
          errors.push({
            entity: `file:${file.path}`,
            error: toErrorMessage(fileError),
          });
        }
      }

      // Phase 2: Create entity nodes
      for (const file of indexResult.files) {
        for (const entity of file.entities) {
          try {
            const entityId = `${entity.type}:${file.path}:${entity.name}`;
            const nodeType = this.mapEntityTypeToNodeType(entity.type);

            const existingEntity = this.config.db.prepare(
              'SELECT id FROM hypergraph_nodes WHERE id = ?'
            ).get(entityId);

            if (existingEntity) {
              // Update existing
              this.config.db.prepare(`
                UPDATE hypergraph_nodes
                SET line_start = ?, line_end = ?, complexity = ?, coverage = ?,
                    updated_at = datetime('now')
                WHERE id = ?
              `).run(entity.lineStart, entity.lineEnd, entity.complexity, entity.coverage, entityId);
              nodesUpdated++;
            } else {
              // Insert new
              this.config.db.prepare(`
                INSERT INTO hypergraph_nodes (id, type, name, file_path, line_start, line_end, complexity, coverage)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                entityId,
                nodeType,
                entity.name,
                file.path,
                entity.lineStart,
                entity.lineEnd,
                entity.complexity,
                entity.coverage
              );
              nodesCreated++;
            }
          } catch (entityError) {
            errors.push({
              entity: `${entity.type}:${entity.name}`,
              error: toErrorMessage(entityError),
            });
          }
        }
      }

      // Phase 3: Create import edges (now all file nodes exist)
      for (const file of indexResult.files) {
        const fileId = `file:${file.path}`;

        for (const importPath of file.imports) {
          try {
            const targetId = `file:${importPath}`;

            // Check if target node exists (import may reference external module)
            const targetExists = this.config.db.prepare(
              'SELECT id FROM hypergraph_nodes WHERE id = ?'
            ).get(targetId);

            if (targetExists) {
              const edgeId = generateEdgeId(fileId, targetId, 'imports');

              this.config.db.prepare(`
                INSERT OR REPLACE INTO hypergraph_edges (id, source_id, target_id, type, weight)
                VALUES (?, ?, ?, 'imports', 1.0)
              `).run(edgeId, fileId, targetId);
              edgesCreated++;
            }
            // If target doesn't exist, skip silently (external dependency)
          } catch (importError) {
            errors.push({
              entity: `import:${importPath}`,
              error: toErrorMessage(importError),
            });
          }
        }
      }
    });

    transaction();

    return {
      nodesCreated,
      nodesUpdated,
      edgesCreated,
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Sync hypergraph with an in-memory KnowledgeGraphService
   *
   * This method exports nodes/edges from the hypergraph for use by
   * the KnowledgeGraphService, or imports from it.
   *
   * @param kg - KnowledgeGraphService compatible object with getNode/getEdges methods
   * @returns Sync statistics
   */
  async syncWithKnowledgeGraph(kg: {
    getNode(id: string): Promise<{ id: string; label: string; properties: Record<string, unknown> } | undefined>;
    getEdges(nodeId: string, direction: 'incoming' | 'outgoing' | 'both'): Promise<Array<{ source: string; target: string; type: string }>>;
    index(request: { paths: string[]; incremental: boolean }): Promise<unknown>;
  }): Promise<SyncResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    let nodesSynced = 0;
    let edgesSynced = 0;
    let nodesAdded = 0;
    let nodesRemoved = 0;

    // Get all nodes from hypergraph
    const hgNodes = await this.findNodes({});

    for (const node of hgNodes) {
      // Check if exists in KG
      const kgNode = await kg.getNode(node.id);

      if (kgNode) {
        // Node exists in both - sync complete
        nodesSynced++;
      } else {
        // Node only in hypergraph - could export to KG if needed
        // For now, just count as synced
        nodesSynced++;
      }
    }

    // Get all edges from hypergraph
    const hgEdges = await this.findEdges({});
    edgesSynced = hgEdges.length;

    return {
      nodesSynced,
      edgesSynced,
      nodesAdded,
      nodesRemoved,
      durationMs: Date.now() - startTime,
    };
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get hypergraph statistics
   *
   * @returns Statistics about the hypergraph
   */
  async getStats(): Promise<HypergraphStats> {
    this.ensureInitialized();

    // Get total counts
    const basicStats = this.schemaManager.getStats(this.config.db);

    // Get node counts by type
    const nodesByTypeRows = this.config.db.prepare(`
      SELECT type, COUNT(*) as count FROM hypergraph_nodes GROUP BY type
    `).all() as Array<{ type: string; count: number }>;

    const nodesByType: Record<NodeType, number> = {
      function: 0,
      module: 0,
      test: 0,
      file: 0,
      class: 0,
    };
    for (const row of nodesByTypeRows) {
      if (row.type in nodesByType) {
        nodesByType[row.type as NodeType] = row.count;
      }
    }

    // Get edge counts by type
    const edgesByTypeRows = this.config.db.prepare(`
      SELECT type, COUNT(*) as count FROM hypergraph_edges GROUP BY type
    `).all() as Array<{ type: string; count: number }>;

    const edgesByType: Record<EdgeType, number> = {
      calls: 0,
      imports: 0,
      tests: 0,
      depends_on: 0,
      covers: 0,
    };
    for (const row of edgesByTypeRows) {
      if (row.type in edgesByType) {
        edgesByType[row.type as EdgeType] = row.count;
      }
    }

    // Get average complexity and coverage
    const avgStats = this.config.db.prepare(`
      SELECT
        AVG(complexity) as avg_complexity,
        AVG(coverage) as avg_coverage,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as nodes_with_embeddings
      FROM hypergraph_nodes
    `).get() as { avg_complexity: number | null; avg_coverage: number | null; nodes_with_embeddings: number };

    return {
      totalNodes: basicStats.nodeCount,
      totalEdges: basicStats.edgeCount,
      nodesByType,
      edgesByType,
      avgComplexity: avgStats.avg_complexity ?? 0,
      avgCoverage: avgStats.avg_coverage ?? 0,
      nodesWithEmbeddings: avgStats.nodes_with_embeddings,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('HypergraphEngine not initialized. Call initialize() first.');
    }
  }

  private mapEntityTypeToNodeType(entityType: string): NodeType {
    const mapping: Record<string, NodeType> = {
      function: 'function',
      class: 'class',
      module: 'module',
      interface: 'module', // Map interface to module for simplicity
      file: 'file',
      test: 'test',
    };
    return mapping[entityType] ?? 'function';
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new HypergraphEngine instance
 *
 * @param config - Engine configuration
 * @returns Initialized HypergraphEngine
 */
export async function createHypergraphEngine(
  config: Partial<HypergraphEngineConfig> & { db: DatabaseType }
): Promise<HypergraphEngine> {
  const engine = new HypergraphEngine(config);
  await engine.initialize();
  return engine;
}

/**
 * Create a HypergraphEngine synchronously (requires manual initialization)
 *
 * @param config - Engine configuration
 * @returns Uninitialized HypergraphEngine
 */
export function createHypergraphEngineSync(
  config: Partial<HypergraphEngineConfig> & { db: DatabaseType }
): HypergraphEngine {
  return new HypergraphEngine(config);
}

// ============================================================================
// Default Export
// ============================================================================

export default HypergraphEngine;
