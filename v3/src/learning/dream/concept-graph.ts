/**
 * ConceptGraph - Graph-based concept storage for Dream Engine
 * ADR-021: QE ReasoningBank - Dream Cycle Integration
 *
 * Stores concepts (patterns, techniques, domains, outcomes, errors) as nodes
 * with weighted edges representing associations between them.
 *
 * Features:
 * - SQLite persistence with better-sqlite3
 * - BLOB storage for embeddings
 * - Automatic edge discovery based on similarity
 * - Spreading activation support
 * - Path finding and clustering
 *
 * @module v3/learning/dream/concept-graph
 */

import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

import { getUnifiedPersistence, type UnifiedPersistenceManager } from '../../kernel/unified-persistence.js';
import type {
  ConceptNode,
  ConceptEdge,
  ConceptGraphConfig,
  ConceptGraphStats,
  ConceptType,
  EdgeType,
  CreateConceptNodeInput,
  PatternImportData,
  NeighborResult,
} from './types.js';

import { DEFAULT_CONCEPT_GRAPH_CONFIG } from './types.js';

// ============================================================================
// ConceptGraph Class
// ============================================================================

/**
 * Graph-based concept storage for dream-based pattern discovery
 *
 * @example
 * ```typescript
 * const graph = new ConceptGraph({ dbPath: '.aqe/dream.db' });
 * await graph.initialize();
 *
 * // Add a concept
 * const nodeId = await graph.addNode({
 *   conceptType: 'pattern',
 *   content: 'Use mocks for external dependencies',
 *   metadata: { framework: 'jest' },
 * });
 *
 * // Find neighbors
 * const neighbors = await graph.getNeighbors(nodeId);
 *
 * await graph.close();
 * ```
 */
export class ConceptGraph {
  private readonly config: Required<ConceptGraphConfig>;
  private db: DatabaseType | null = null;
  private persistence: UnifiedPersistenceManager | null = null;
  private prepared: Map<string, Statement> = new Map();
  private initialized = false;

  constructor(config?: Partial<ConceptGraphConfig>) {
    this.config = { ...DEFAULT_CONCEPT_GRAPH_CONFIG, ...config };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize using unified persistence
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.persistence = getUnifiedPersistence();
      if (!this.persistence.isInitialized()) {
        await this.persistence.initialize();
      }
      this.db = this.persistence.getDatabase();
      this.prepareStatements();
      this.initialized = true;

      if (this.config.debug) {
        const stats = await this.getStats();
        console.log(`[ConceptGraph] Initialized: ${this.persistence.getDbPath()}`, stats);
      }
    } catch (error) {
      throw new Error(
        `Failed to initialize ConceptGraph: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Prepare commonly used SQL statements
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Node operations
    this.prepared.set(
      'insertNode',
      this.db.prepare(`
      INSERT INTO concept_nodes
      (id, concept_type, content, embedding, activation_level, last_activated, pattern_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    );

    this.prepared.set(
      'getNode',
      this.db.prepare(`
      SELECT * FROM concept_nodes WHERE id = ?
    `)
    );

    this.prepared.set(
      'updateActivation',
      this.db.prepare(`
      UPDATE concept_nodes
      SET activation_level = ?, last_activated = datetime('now')
      WHERE id = ?
    `)
    );

    this.prepared.set(
      'getActiveNodes',
      this.db.prepare(`
      SELECT * FROM concept_nodes
      WHERE activation_level >= ?
      ORDER BY activation_level DESC
    `)
    );

    this.prepared.set(
      'getNodesByType',
      this.db.prepare(`
      SELECT * FROM concept_nodes WHERE concept_type = ?
    `)
    );

    this.prepared.set(
      'getAllNodes',
      this.db.prepare(`
      SELECT * FROM concept_nodes
    `)
    );

    // Edge operations
    this.prepared.set(
      'insertEdge',
      this.db.prepare(`
      INSERT INTO concept_edges
      (id, source, target, edge_type, weight, evidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    );

    this.prepared.set(
      'getEdge',
      this.db.prepare(`
      SELECT * FROM concept_edges WHERE source = ? AND target = ?
    `)
    );

    this.prepared.set(
      'updateEdge',
      this.db.prepare(`
      UPDATE concept_edges
      SET weight = ?, evidence = evidence + 1, updated_at = datetime('now')
      WHERE source = ? AND target = ?
    `)
    );

    this.prepared.set(
      'getOutgoingEdges',
      this.db.prepare(`
      SELECT * FROM concept_edges WHERE source = ?
    `)
    );

    this.prepared.set(
      'getIncomingEdges',
      this.db.prepare(`
      SELECT * FROM concept_edges WHERE target = ?
    `)
    );

    // Stats
    this.prepared.set(
      'countNodes',
      this.db.prepare(`
      SELECT COUNT(*) as count FROM concept_nodes
    `)
    );

    this.prepared.set(
      'countEdges',
      this.db.prepare(`
      SELECT COUNT(*) as count FROM concept_edges
    `)
    );

    this.prepared.set(
      'countByType',
      this.db.prepare(`
      SELECT concept_type, COUNT(*) as count FROM concept_nodes GROUP BY concept_type
    `)
    );
  }

  // ==========================================================================
  // Node Operations
  // ==========================================================================

  /**
   * Add a new concept node to the graph
   * @returns The ID of the created node
   */
  async addNode(node: CreateConceptNodeInput): Promise<string> {
    this.ensureInitialized();

    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.prepared.get('insertNode');
    if (!stmt) throw new Error('Prepared statement not found: insertNode');

    // Convert embedding to Buffer if present
    const embeddingBlob = node.embedding
      ? Buffer.from(new Float32Array(node.embedding).buffer)
      : null;

    stmt.run(
      id,
      node.conceptType,
      node.content,
      embeddingBlob,
      0.0, // Initial activation level
      now,
      node.patternId || null,
      node.metadata ? JSON.stringify(node.metadata) : null
    );

    if (this.config.debug) {
      console.log(`[ConceptGraph] Added node: ${id} (${node.conceptType})`);
    }

    return id;
  }

  /**
   * Get a concept node by ID
   */
  async getNode(id: string): Promise<ConceptNode | null> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getNode');
    if (!stmt) throw new Error('Prepared statement not found: getNode');

    const row = stmt.get(id) as NodeRow | undefined;
    if (!row) return null;

    return this.rowToNode(row);
  }

  /**
   * Update the activation level of a node
   */
  async updateActivation(id: string, level: number): Promise<void> {
    this.ensureInitialized();

    const stmt = this.prepared.get('updateActivation');
    if (!stmt) throw new Error('Prepared statement not found: updateActivation');

    // Clamp level to [0, 1]
    const clampedLevel = Math.max(0, Math.min(1, level));
    stmt.run(clampedLevel, id);
  }

  /**
   * Get all nodes with activation level at or above threshold
   */
  async getActiveNodes(minActivation: number = 0.1): Promise<ConceptNode[]> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getActiveNodes');
    if (!stmt) throw new Error('Prepared statement not found: getActiveNodes');

    const rows = stmt.all(minActivation) as NodeRow[];
    return rows.map((row) => this.rowToNode(row));
  }

  /**
   * Get all nodes of a specific type
   */
  async getNodesByType(type: ConceptType): Promise<ConceptNode[]> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getNodesByType');
    if (!stmt) throw new Error('Prepared statement not found: getNodesByType');

    const rows = stmt.all(type) as NodeRow[];
    return rows.map((row) => this.rowToNode(row));
  }

  // ==========================================================================
  // Edge Operations
  // ==========================================================================

  /**
   * Add an edge between two nodes
   * @returns The ID of the created edge
   */
  async addEdge(
    source: string,
    target: string,
    type: EdgeType,
    weight: number = 1.0
  ): Promise<string> {
    this.ensureInitialized();

    // Check if edge already exists
    const existing = await this.getEdgeBetween(source, target);
    if (existing) {
      // Strengthen existing edge
      await this.strengthenEdge(source, target, 0.1);
      return existing.id;
    }

    const id = uuidv4();

    const stmt = this.prepared.get('insertEdge');
    if (!stmt) throw new Error('Prepared statement not found: insertEdge');

    stmt.run(id, source, target, type, Math.max(0, Math.min(1, weight)), 1);

    if (this.config.debug) {
      console.log(`[ConceptGraph] Added edge: ${source} -> ${target} (${type})`);
    }

    return id;
  }

  /**
   * Strengthen an existing edge between two nodes
   */
  async strengthenEdge(source: string, target: string, delta: number = 0.1): Promise<void> {
    this.ensureInitialized();

    const existing = await this.getEdgeBetween(source, target);
    if (!existing) return;

    const newWeight = Math.min(1, existing.weight + delta);

    const stmt = this.prepared.get('updateEdge');
    if (!stmt) throw new Error('Prepared statement not found: updateEdge');

    stmt.run(newWeight, source, target);
  }

  /**
   * Get neighbors of a node (both outgoing and incoming edges)
   */
  async getNeighbors(nodeId: string): Promise<NeighborResult[]> {
    this.ensureInitialized();

    const results: NeighborResult[] = [];

    // Get outgoing edges
    const outStmt = this.prepared.get('getOutgoingEdges');
    if (!outStmt) throw new Error('Prepared statement not found: getOutgoingEdges');

    const outEdges = outStmt.all(nodeId) as EdgeRow[];
    for (const edgeRow of outEdges) {
      const node = await this.getNode(edgeRow.target);
      if (node) {
        results.push({
          node,
          edge: this.rowToEdge(edgeRow),
        });
      }
    }

    // Get incoming edges
    const inStmt = this.prepared.get('getIncomingEdges');
    if (!inStmt) throw new Error('Prepared statement not found: getIncomingEdges');

    const inEdges = inStmt.all(nodeId) as EdgeRow[];
    for (const edgeRow of inEdges) {
      const node = await this.getNode(edgeRow.source);
      if (node) {
        results.push({
          node,
          edge: this.rowToEdge(edgeRow),
        });
      }
    }

    return results;
  }

  // ==========================================================================
  // Graph Queries
  // ==========================================================================

  /**
   * Find a path between two nodes using BFS
   * @param maxHops Maximum number of hops (default: 5)
   */
  async findPath(from: string, to: string, maxHops: number = 5): Promise<ConceptNode[]> {
    this.ensureInitialized();

    // BFS to find shortest path
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: from, path: [from] }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.nodeId === to) {
        // Found path - convert IDs to nodes
        const nodes: ConceptNode[] = [];
        for (const nodeId of current.path) {
          const node = await this.getNode(nodeId);
          if (node) nodes.push(node);
        }
        return nodes;
      }

      if (current.path.length > maxHops) continue;
      if (visited.has(current.nodeId)) continue;

      visited.add(current.nodeId);

      const neighbors = await this.getNeighbors(current.nodeId);
      for (const { node } of neighbors) {
        if (!visited.has(node.id)) {
          queue.push({
            nodeId: node.id,
            path: [...current.path, node.id],
          });
        }
      }
    }

    return []; // No path found
  }

  /**
   * Get a cluster of nodes around a central node
   * @param depth How many hops to traverse (default: 2)
   */
  async getCluster(nodeId: string, depth: number = 2): Promise<ConceptNode[]> {
    this.ensureInitialized();

    const visited = new Set<string>();
    const result: ConceptNode[] = [];

    const traverse = async (id: string, currentDepth: number): Promise<void> => {
      if (visited.has(id) || currentDepth > depth) return;

      visited.add(id);

      const node = await this.getNode(id);
      if (node) {
        result.push(node);

        if (currentDepth < depth) {
          const neighbors = await this.getNeighbors(id);
          for (const { node: neighbor } of neighbors) {
            await traverse(neighbor.id, currentDepth + 1);
          }
        }
      }
    };

    await traverse(nodeId, 0);
    return result;
  }

  // ==========================================================================
  // Pattern Import
  // ==========================================================================

  /**
   * Load patterns into the concept graph as nodes with edge discovery.
   * Idempotent — skips patterns whose pattern_id already has a node.
   * After loading, discovers co_occurrence and similarity edges.
   * @returns Number of new patterns loaded
   */
  async loadFromPatterns(patterns: PatternImportData[]): Promise<number> {
    this.ensureInitialized();

    let loaded = 0;

    for (const pattern of patterns) {
      try {
        // Skip if a node for this pattern already exists (idempotent)
        const existing = await this.findNodeByPatternId(pattern.id);
        if (existing) continue;

        const patternNodeId = await this.addNode({
          conceptType: 'pattern',
          content: `${pattern.name}: ${pattern.description}`,
          patternId: pattern.id,
          metadata: {
            domain: pattern.domain,
            patternType: pattern.patternType,
            confidence: pattern.confidence,
            successRate: pattern.successRate,
          },
        });
        loaded++;

        // Also add domain as a concept if not seen
        let domainNode = await this.findDomainNode(pattern.domain);
        if (!domainNode) {
          const domainNodeId = await this.addNode({
            conceptType: 'domain',
            content: pattern.domain,
            metadata: { patternCount: 1 },
          });
          domainNode = await this.getNode(domainNodeId);
        }

        // Edge: pattern belongs to its domain
        if (domainNode) {
          await this.addEdge(patternNodeId, domainNode.id, 'co_occurrence', 0.8);
        }
      } catch (error) {
        if (this.config.debug) {
          console.error(`[ConceptGraph] Failed to load pattern: ${pattern.id}`, error);
        }
      }
    }

    // Discover similarity edges between patterns in the same domain
    if (loaded > 0) {
      const edgesCreated = await this.discoverSameDomainEdges();
      if (this.config.debug) {
        console.log(`[ConceptGraph] Discovered ${edgesCreated} same-domain edges`);
      }
    }

    console.log(`[ConceptGraph] Loaded ${loaded} new patterns (${patterns.length - loaded} already existed)`);

    return loaded;
  }

  /**
   * Discover similarity edges between pattern nodes in the same domain.
   * Uses metadata.domain to group patterns, then creates bidirectional
   * similarity edges between siblings. Idempotent (addEdge strengthens
   * existing edges rather than duplicating).
   * @returns Number of new edges created
   */
  async discoverSameDomainEdges(): Promise<number> {
    this.ensureInitialized();
    if (!this.db) return 0;

    const patternNodes = this.db.prepare(
      "SELECT * FROM concept_nodes WHERE concept_type = 'pattern'"
    ).all() as NodeRow[];

    // Group by domain
    const domainGroups = new Map<string, NodeRow[]>();
    for (const node of patternNodes) {
      const metadata = node.metadata ? JSON.parse(node.metadata) : {};
      const domain = metadata.domain || 'unknown';
      if (!domainGroups.has(domain)) {
        domainGroups.set(domain, []);
      }
      domainGroups.get(domain)!.push(node);
    }

    let edgesCreated = 0;

    // Create similarity edges between patterns sharing a domain
    for (const [, nodes] of domainGroups) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const existingEdge = await this.getEdgeBetween(nodes[i].id, nodes[j].id);
          if (!existingEdge) {
            await this.addEdge(nodes[i].id, nodes[j].id, 'similarity', 0.6);
            edgesCreated++;
          }
        }
      }
    }

    return edgesCreated;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get graph statistics
   */
  async getStats(): Promise<ConceptGraphStats> {
    this.ensureInitialized();

    const countNodesStmt = this.prepared.get('countNodes');
    const countEdgesStmt = this.prepared.get('countEdges');
    const countByTypeStmt = this.prepared.get('countByType');

    if (!countNodesStmt || !countEdgesStmt || !countByTypeStmt) {
      throw new Error('Prepared statements not found');
    }

    const nodeCount = (countNodesStmt.get() as { count: number }).count;
    const edgeCount = (countEdgesStmt.get() as { count: number }).count;

    const byType: Record<ConceptType, number> = {
      pattern: 0,
      technique: 0,
      domain: 0,
      outcome: 0,
      error: 0,
    };

    const typeRows = countByTypeStmt.all() as Array<{ concept_type: ConceptType; count: number }>;
    for (const row of typeRows) {
      byType[row.concept_type] = row.count;
    }

    // Calculate average activation
    let avgActivation = 0;
    if (nodeCount > 0) {
      const avgStmt = this.db!.prepare(
        'SELECT AVG(activation_level) as avg FROM concept_nodes'
      );
      const result = avgStmt.get() as { avg: number | null };
      avgActivation = result.avg || 0;
    }

    return {
      nodeCount,
      edgeCount,
      byType,
      avgEdgesPerNode: nodeCount > 0 ? edgeCount / nodeCount : 0,
      avgActivation,
    };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Release resources (does NOT close the shared database)
   */
  async close(): Promise<void> {
    this.prepared.clear();
    this.db = null;
    this.persistence = null;
    this.initialized = false;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('ConceptGraph not initialized. Call initialize() first.');
    }
  }

  private async getEdgeBetween(source: string, target: string): Promise<ConceptEdge | null> {
    const stmt = this.prepared.get('getEdge');
    if (!stmt) throw new Error('Prepared statement not found: getEdge');

    const row = stmt.get(source, target) as EdgeRow | undefined;
    if (!row) return null;

    return this.rowToEdge(row);
  }

  private async findDomainNode(domain: string): Promise<ConceptNode | null> {
    if (!this.db) return null;

    const stmt = this.db.prepare(
      "SELECT * FROM concept_nodes WHERE concept_type = 'domain' AND content = ?"
    );
    const row = stmt.get(domain) as NodeRow | undefined;
    if (!row) return null;

    return this.rowToNode(row);
  }

  private async findNodeByPatternId(patternId: string): Promise<ConceptNode | null> {
    if (!this.db) return null;

    const stmt = this.db.prepare(
      'SELECT * FROM concept_nodes WHERE pattern_id = ? LIMIT 1'
    );
    const row = stmt.get(patternId) as NodeRow | undefined;
    if (!row) return null;

    return this.rowToNode(row);
  }

  private rowToNode(row: NodeRow): ConceptNode {
    let embedding: number[] | undefined;
    if (row.embedding) {
      const buffer = row.embedding as Buffer;
      const float32 = new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / 4
      );
      embedding = Array.from(float32);
    }

    return {
      id: row.id,
      conceptType: row.concept_type as ConceptType,
      content: row.content,
      embedding,
      activationLevel: row.activation_level || 0,
      lastActivated: row.last_activated ? new Date(row.last_activated) : undefined,
      patternId: row.pattern_id || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
    };
  }

  private rowToEdge(row: EdgeRow): ConceptEdge {
    return {
      id: row.id,
      source: row.source,
      target: row.target,
      weight: row.weight,
      edgeType: row.edge_type as EdgeType,
      evidence: row.evidence,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }
}

// ============================================================================
// Row Types (internal)
// ============================================================================

interface NodeRow {
  id: string;
  concept_type: string;
  content: string;
  embedding: Buffer | null;
  activation_level: number;
  last_activated: string | null;
  pattern_id: string | null;
  metadata: string | null;
  created_at: string | null;
}

interface EdgeRow {
  id: string;
  source: string;
  target: string;
  weight: number;
  edge_type: string;
  evidence: number;
  created_at: string | null;
  updated_at: string | null;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ConceptGraph instance
 */
export function createConceptGraph(config?: ConceptGraphConfig): ConceptGraph {
  return new ConceptGraph(config);
}

export default ConceptGraph;
