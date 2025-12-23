/**
 * ConceptGraph - Graph-based concept storage for Dream Engine
 *
 * Stores concepts (patterns, techniques, domains, outcomes) as nodes
 * with weighted edges representing associations between them.
 *
 * Part of the Nightly-Learner Phase 2 implementation.
 *
 * @version 1.0.0
 * @module src/learning/dream/ConceptGraph
 */

import { EventEmitter } from 'events';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';

export type ConceptType = 'pattern' | 'technique' | 'domain' | 'outcome' | 'error';
export type EdgeType = 'similarity' | 'causation' | 'co_occurrence' | 'sequence' | 'uses_pattern' | 'made_decision' | 'encountered_error';

export interface ConceptNode {
  id: string;
  type: ConceptType;
  content: string;
  embedding?: number[];
  activationLevel: number;     // 0-1, decays over time
  lastActivated: Date;
  metadata: Record<string, unknown>;
}

export interface ConceptEdge {
  id: string;
  source: string;
  target: string;
  weight: number;              // 0-1, strength of association
  type: EdgeType;
  evidence: number;            // Number of observations supporting this edge
  createdAt: Date;
  updatedAt: Date;
}

export interface ConceptGraphConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Similarity threshold for auto edge discovery. Default: 0.5 */
  similarityThreshold?: number;
  /** Maximum edges per node. Default: 20 */
  maxEdgesPerNode?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  byType: Record<ConceptType, number>;
  avgEdgesPerNode: number;
  avgActivation: number;
}

/**
 * ConceptGraph stores and manages concept associations
 *
 * @example
 * ```typescript
 * const graph = new ConceptGraph();
 * await graph.initialize();
 *
 * await graph.addConcept({
 *   id: 'pattern-1',
 *   type: 'pattern',
 *   content: 'Use mocks for external dependencies',
 *   metadata: { framework: 'jest' },
 * });
 *
 * graph.addEdge({
 *   source: 'pattern-1',
 *   target: 'technique-2',
 *   weight: 0.8,
 *   type: 'causation',
 * });
 * ```
 */
export class ConceptGraph extends EventEmitter {
  private config: Required<ConceptGraphConfig>;
  private db: BetterSqlite3.Database;
  private logger: Logger;
  private nodes: Map<string, ConceptNode> = new Map();
  private edges: Map<string, ConceptEdge[]> = new Map();
  private initialized: boolean = false;

  constructor(config?: ConceptGraphConfig) {
    super();
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
      similarityThreshold: config?.similarityThreshold ?? 0.5,
      maxEdgesPerNode: config?.maxEdgesPerNode ?? 20,
      debug: config?.debug ?? false,
    };

    this.db = new BetterSqlite3(this.config.dbPath);
  }

  /**
   * Initialize the concept graph
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initializeSchema();
    await this.loadFromDatabase();
    this.initialized = true;

    this.logger.info('[ConceptGraph] Initialized', {
      nodes: this.nodes.size,
      edges: Array.from(this.edges.values()).flat().length,
    });
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS concept_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        activation_level REAL DEFAULT 0,
        last_activated INTEGER,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS concept_edges (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        weight REAL NOT NULL,
        type TEXT NOT NULL,
        evidence INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (source) REFERENCES concept_nodes(id),
        FOREIGN KEY (target) REFERENCES concept_nodes(id)
      );

      CREATE INDEX IF NOT EXISTS idx_concept_type ON concept_nodes(type);
      CREATE INDEX IF NOT EXISTS idx_concept_activation ON concept_nodes(activation_level);
      CREATE INDEX IF NOT EXISTS idx_edge_source ON concept_edges(source);
      CREATE INDEX IF NOT EXISTS idx_edge_target ON concept_edges(target);
      CREATE INDEX IF NOT EXISTS idx_edge_weight ON concept_edges(weight);
    `);
  }

  /**
   * Load graph from database
   */
  private async loadFromDatabase(): Promise<void> {
    // Load nodes
    const nodeRows = this.db.prepare('SELECT * FROM concept_nodes').all() as any[];
    for (const row of nodeRows) {
      const node: ConceptNode = {
        id: row.id,
        type: row.type as ConceptType,
        content: row.content,
        embedding: row.embedding ? Array.from(new Float32Array(row.embedding)) : undefined,
        activationLevel: row.activation_level || 0,
        lastActivated: new Date(row.last_activated || Date.now()),
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
      };
      this.nodes.set(node.id, node);
    }

    // Load edges
    const edgeRows = this.db.prepare('SELECT * FROM concept_edges').all() as any[];
    for (const row of edgeRows) {
      const edge: ConceptEdge = {
        id: row.id,
        source: row.source,
        target: row.target,
        weight: row.weight,
        type: row.type as EdgeType,
        evidence: row.evidence,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };

      const sourceEdges = this.edges.get(edge.source) || [];
      sourceEdges.push(edge);
      this.edges.set(edge.source, sourceEdges);
    }
  }

  /**
   * Add a concept node to the graph
   */
  async addConcept(concept: Omit<ConceptNode, 'activationLevel' | 'lastActivated'>): Promise<ConceptNode> {
    const now = new Date();
    const node: ConceptNode = {
      ...concept,
      activationLevel: 0,
      lastActivated: now,
    };

    // Store in memory
    this.nodes.set(concept.id, node);

    // Persist to database
    this.db.prepare(`
      INSERT OR REPLACE INTO concept_nodes
      (id, type, content, embedding, activation_level, last_activated, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      node.id,
      node.type,
      node.content,
      node.embedding ? Buffer.from(new Float32Array(node.embedding).buffer) : null,
      node.activationLevel,
      now.getTime(),
      JSON.stringify(node.metadata),
      now.getTime()
    );

    // Auto-discover edges based on similarity
    await this.discoverEdges(concept.id);

    this.emit('concept:added', node);

    if (this.config.debug) {
      this.logger.debug('[ConceptGraph] Added concept', { id: node.id, type: node.type });
    }

    return node;
  }

  /**
   * Get a concept by ID
   */
  getConcept(id: string): ConceptNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all concepts of a specific type
   */
  getConceptsByType(type: ConceptType): ConceptNode[] {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }

  /**
   * Get all concepts (optionally filtered by activation threshold)
   */
  getAllConcepts(minActivation: number = 0): ConceptNode[] {
    return Array.from(this.nodes.values())
      .filter(n => n.activationLevel >= minActivation);
  }

  /**
   * Get nodes above activation threshold
   */
  getActiveNodes(threshold: number = 0.3): ConceptNode[] {
    return Array.from(this.nodes.values())
      .filter(n => n.activationLevel >= threshold);
  }

  /**
   * Discover edges by finding similar concepts
   */
  private async discoverEdges(conceptId: string): Promise<void> {
    const concept = this.nodes.get(conceptId);
    if (!concept || !concept.embedding) return;

    // Find similar concepts based on content/type
    for (const [otherId, other] of this.nodes) {
      if (otherId === conceptId) continue;

      // Calculate similarity
      const similarity = this.calculateSimilarity(concept, other);

      if (similarity >= this.config.similarityThreshold) {
        this.addEdge({
          source: conceptId,
          target: otherId,
          weight: similarity,
          type: 'similarity',
        });
      }
    }
  }

  /**
   * Calculate similarity between two concepts
   */
  private calculateSimilarity(a: ConceptNode, b: ConceptNode): number {
    let similarity = 0;

    // Type similarity (same type = bonus)
    if (a.type === b.type) {
      similarity += 0.3;
    }

    // Content similarity (simple word overlap)
    const wordsA = new Set(a.content.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.content.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    const jaccardSimilarity = intersection.length / union.size;
    similarity += jaccardSimilarity * 0.4;

    // Embedding similarity (if both have embeddings)
    if (a.embedding && b.embedding) {
      const cosineSim = this.cosineSimilarity(a.embedding, b.embedding);
      similarity += cosineSim * 0.3;
    } else {
      // No embeddings, add base similarity
      similarity += 0.15;
    }

    return Math.min(1, similarity);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Add or strengthen an edge
   */
  addEdge(edge: Omit<ConceptEdge, 'id' | 'evidence' | 'createdAt' | 'updatedAt'>): ConceptEdge {
    const existing = this.getEdge(edge.source, edge.target);
    const now = new Date();

    if (existing) {
      // Strengthen existing edge
      existing.weight = Math.min(1, existing.weight + 0.1);
      existing.evidence++;
      existing.updatedAt = now;

      // Update in database
      this.db.prepare(`
        UPDATE concept_edges
        SET weight = ?, evidence = ?, updated_at = ?
        WHERE id = ?
      `).run(existing.weight, existing.evidence, now.getTime(), existing.id);

      this.emit('edge:strengthened', existing);
      return existing;
    }

    // Create new edge
    const newEdge: ConceptEdge = {
      id: `edge-${Date.now()}-${SecureRandom.randomString(6, 'alphanumeric')}`,
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      type: edge.type,
      evidence: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Store in memory
    const sourceEdges = this.edges.get(edge.source) || [];

    // Enforce max edges limit
    if (sourceEdges.length >= this.config.maxEdgesPerNode) {
      // Remove weakest edge
      sourceEdges.sort((a, b) => a.weight - b.weight);
      const removed = sourceEdges.shift();
      if (removed) {
        this.db.prepare('DELETE FROM concept_edges WHERE id = ?').run(removed.id);
      }
    }

    sourceEdges.push(newEdge);
    this.edges.set(edge.source, sourceEdges);

    // Persist to database
    this.db.prepare(`
      INSERT INTO concept_edges
      (id, source, target, weight, type, evidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newEdge.id,
      newEdge.source,
      newEdge.target,
      newEdge.weight,
      newEdge.type,
      newEdge.evidence,
      now.getTime(),
      now.getTime()
    );

    this.emit('edge:added', newEdge);
    return newEdge;
  }

  /**
   * Get all edges from a node
   */
  getEdges(nodeId: string): ConceptEdge[] {
    return this.edges.get(nodeId) || [];
  }

  /**
   * Get specific edge between two nodes
   */
  getEdge(source: string, target: string): ConceptEdge | undefined {
    return this.getEdges(source).find(e => e.target === target);
  }

  /**
   * Set activation level for a concept
   */
  setActivation(nodeId: string, level: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.activationLevel = Math.max(0, Math.min(1, level));
    node.lastActivated = new Date();

    // Update in database
    this.db.prepare(`
      UPDATE concept_nodes
      SET activation_level = ?, last_activated = ?
      WHERE id = ?
    `).run(node.activationLevel, node.lastActivated.getTime(), nodeId);
  }

  /**
   * Decay activation levels over time
   */
  decayActivations(factor: number = 0.9): void {
    for (const node of this.nodes.values()) {
      node.activationLevel *= factor;
    }

    // Batch update in database
    this.db.prepare(`
      UPDATE concept_nodes
      SET activation_level = activation_level * ?
    `).run(factor);
  }

  /**
   * Get graph statistics
   */
  getStats(): GraphStats {
    const nodes = Array.from(this.nodes.values());
    const allEdges = Array.from(this.edges.values()).flat();

    const byType: Record<ConceptType, number> = {
      pattern: 0,
      technique: 0,
      domain: 0,
      outcome: 0,
      error: 0,
    };

    for (const node of nodes) {
      byType[node.type]++;
    }

    const avgActivation = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.activationLevel, 0) / nodes.length
      : 0;

    return {
      nodeCount: nodes.length,
      edgeCount: allEdges.length,
      byType,
      avgEdgesPerNode: nodes.length > 0 ? allEdges.length / nodes.length : 0,
      avgActivation,
    };
  }

  /**
   * Remove a concept and its edges
   */
  removeConcept(id: string): void {
    this.nodes.delete(id);
    this.edges.delete(id);

    // Remove edges pointing to this node
    for (const [source, edges] of this.edges) {
      const filtered = edges.filter(e => e.target !== id);
      this.edges.set(source, filtered);
    }

    // Remove from database
    this.db.prepare('DELETE FROM concept_nodes WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM concept_edges WHERE source = ? OR target = ?').run(id, id);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

export default ConceptGraph;
