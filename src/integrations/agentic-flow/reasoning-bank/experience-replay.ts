/**
 * ExperienceReplay - Store and retrieve successful experiences for learning
 * ADR-051: ReasoningBank enhancement for 46% faster recurring tasks
 *
 * ExperienceReplay enables agents to learn from past successes by storing
 * high-quality trajectories and retrieving similar experiences when facing
 * new tasks.
 *
 * Key Features:
 * - Stores successful trajectories with quality scoring
 * - Vector similarity search for finding relevant past experiences
 * - Quality-weighted retrieval prioritizes proven solutions
 * - Automatic experience curation (pruning low-quality entries)
 */

import { v4 as uuidv4 } from 'uuid';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../../../kernel/unified-memory.js';
import type { QEDomain } from '../../../learning/qe-patterns.js';
import {
  computeRealEmbedding,
  type EmbeddingConfig,
} from '../../../learning/real-embeddings.js';
import type { Trajectory, TrajectoryMetrics } from './trajectory-tracker.js';
import { CircularBuffer } from '../../../shared/utils/circular-buffer.js';
import { HNSWEmbeddingIndex } from '../../embeddings/index/HNSWIndex.js';
import type { IEmbedding } from '../../embeddings/base/types.js';
import { safeJsonParse } from '../../../shared/safe-json.js';

// ============================================================================
// Types
// ============================================================================

/**
 * An experience is a distilled, reusable version of a successful trajectory
 */
export interface Experience {
  /** Unique experience identifier */
  readonly id: string;

  /** Original trajectory ID */
  readonly trajectoryId: string;

  /** Task description */
  readonly task: string;

  /** Domain this experience applies to */
  readonly domain: QEDomain;

  /** Distilled strategy (what worked) */
  readonly strategy: string;

  /** Key actions that led to success */
  readonly keyActions: string[];

  /** Quality score (0-1) */
  readonly qualityScore: number;

  /** Number of times this experience has been applied */
  readonly applicationCount: number;

  /** Success rate when applied */
  readonly successRate: number;

  /** Average token savings when reused */
  readonly avgTokenSavings: number;

  /** Embedding for similarity search */
  readonly embedding?: number[];

  /** Creation timestamp */
  readonly createdAt: Date;

  /** Last applied timestamp */
  readonly lastAppliedAt?: Date;

  /** Original metrics from trajectory */
  readonly originalMetrics: TrajectoryMetrics;

  /** Tags for filtering */
  readonly tags: string[];
}

/**
 * Guidance generated from relevant experiences
 */
export interface ExperienceGuidance {
  /** Recommended strategy based on similar experiences */
  readonly recommendedStrategy: string;

  /** Actions to consider */
  readonly suggestedActions: string[];

  /** Potential pitfalls to avoid */
  readonly pitfallsToAvoid: string[];

  /** Confidence level (0-1) */
  readonly confidence: number;

  /** Source experiences */
  readonly sourceExperiences: Array<{
    id: string;
    similarity: number;
    qualityScore: number;
  }>;

  /** Estimated token savings */
  readonly estimatedTokenSavings: number;
}

/**
 * Configuration for ExperienceReplay
 */
export interface ExperienceReplayConfig {
  /** Minimum quality score to store experience */
  minQualityThreshold: number;

  /** Maximum experiences to store per domain */
  maxExperiencesPerDomain: number;

  /** Similarity threshold for retrieval */
  similarityThreshold: number;

  /** Number of experiences to consider for guidance */
  topK: number;

  /** Embedding configuration */
  embedding: Partial<EmbeddingConfig>;

  /** Auto-prune low-quality experiences */
  autoPrune: boolean;

  /** Prune threshold (quality below this is removed) */
  pruneThreshold: number;
}

const DEFAULT_CONFIG: ExperienceReplayConfig = {
  minQualityThreshold: 0.6,
  maxExperiencesPerDomain: 500,
  similarityThreshold: 0.7,
  topK: 5,
  embedding: {
    modelName: 'Xenova/all-MiniLM-L6-v2',
    quantized: true,
  },
  autoPrune: true,
  pruneThreshold: 0.3,
};

/**
 * Database row structure for captured_experiences table queries.
 * Maps to the canonical captured_experiences table written by the middleware.
 */
interface ExperienceRow {
  id: string;
  task: string;
  agent: string;
  domain: string;
  success: number;
  quality: number;
  duration_ms: number;
  model_tier: number | null;
  routing_json: string | null;
  steps_json: string | null;
  result_json: string | null;
  error: string | null;
  started_at: string;
  completed_at: string;
  source: string | null;
  // ExperienceReplay-specific columns (added by ensureSchema)
  application_count: number;
  avg_token_savings: number;
  embedding: Buffer | null;
  embedding_dimension: number | null;
  tags: string | null;
  last_applied_at: string | null;
}

// ============================================================================
// ExperienceReplay Implementation
// ============================================================================

/**
 * ExperienceReplay stores and retrieves successful experiences for learning.
 *
 * Usage:
 * ```typescript
 * const replay = new ExperienceReplay();
 * await replay.initialize();
 *
 * // Store a successful trajectory as experience
 * await replay.storeExperience(trajectory, 'Used AAA pattern with mocking');
 *
 * // Get guidance for a new task
 * const guidance = await replay.getGuidance('Fix authentication timeout bug');
 * console.log(guidance.recommendedStrategy);
 * ```
 */
export class ExperienceReplay {
  private readonly config: ExperienceReplayConfig;
  private unifiedMemory: UnifiedMemoryManager | null = null;
  private db: DatabaseType | null = null;
  private prepared: Map<string, Statement> = new Map();
  private initialized = false;

  // Real HNSW index for O(log n) similarity search (150x-12,500x faster than linear scan)
  private hnswIndex: HNSWEmbeddingIndex;

  // Mapping from HNSW numeric IDs to experience string IDs
  private idToExperienceId: Map<number, string> = new Map();
  private experienceIdToHnswId: Map<string, number> = new Map();
  private nextHnswId = 0;

  // Recent experiences buffer
  private recentExperiences: CircularBuffer<Experience>;

  // Statistics
  private stats = {
    experiencesStored: 0,
    experiencesApplied: 0,
    totalTokensSaved: 0,
    avgSimilarityOnRetrieval: 0,
    totalRetrievals: 0,
  };

  constructor(config: Partial<ExperienceReplayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.recentExperiences = new CircularBuffer(100);

    // Initialize real HNSW index with optimal parameters for experience search
    this.hnswIndex = new HNSWEmbeddingIndex({
      dimension: 384, // all-MiniLM-L6-v2 dimension
      M: 16, // Connectivity parameter (higher = more accurate, more memory)
      efConstruction: 200, // Construction time accuracy (higher = better index quality)
      efSearch: 100, // Search time accuracy (higher = more accurate, slower)
      metric: 'cosine',
    });
  }

  /**
   * Initialize with SQLite persistence
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.unifiedMemory = getUnifiedMemory();
    await this.unifiedMemory.initialize();
    this.db = this.unifiedMemory.getDatabase();

    // Ensure schema
    this.ensureSchema();

    // Prepare statements
    this.prepareStatements();

    // Load embeddings into memory index
    await this.loadEmbeddingIndex();

    this.initialized = true;
    console.log('[ExperienceReplay] Initialized');
  }

  /**
   * Ensure required schema exists.
   * Uses captured_experiences as the canonical table (written by experience-capture-middleware).
   * Adds ExperienceReplay-specific columns if missing.
   */
  private ensureSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Ensure captured_experiences table exists (middleware normally creates it,
    // but ExperienceReplay may initialize first)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS captured_experiences (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        agent TEXT NOT NULL,
        domain TEXT NOT NULL DEFAULT '',
        success INTEGER NOT NULL DEFAULT 0,
        quality REAL NOT NULL DEFAULT 0.5,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        model_tier INTEGER,
        routing_json TEXT,
        steps_json TEXT,
        result_json TEXT,
        error TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT NOT NULL DEFAULT (datetime('now')),
        source TEXT DEFAULT 'middleware',
        application_count INTEGER DEFAULT 0,
        avg_token_savings REAL DEFAULT 0,
        embedding BLOB,
        embedding_dimension INTEGER,
        tags TEXT,
        last_applied_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_captured_exp_domain ON captured_experiences(domain);
      CREATE INDEX IF NOT EXISTS idx_captured_exp_quality ON captured_experiences(quality DESC);
      CREATE INDEX IF NOT EXISTS idx_captured_exp_task ON captured_experiences(task);
    `);

    // Add ExperienceReplay-specific columns if missing (for pre-existing tables)
    const columns = this.db.prepare('PRAGMA table_info(captured_experiences)').all() as Array<{ name: string }>;
    const colNames = new Set(columns.map(c => c.name));
    const additions: Array<[string, string]> = [
      ['application_count', 'INTEGER DEFAULT 0'],
      ['avg_token_savings', 'REAL DEFAULT 0'],
      ['embedding', 'BLOB'],
      ['embedding_dimension', 'INTEGER'],
      ['tags', 'TEXT'],
      ['last_applied_at', 'TEXT'],
    ];
    for (const [col, def] of additions) {
      if (!colNames.has(col)) {
        this.db.exec(`ALTER TABLE captured_experiences ADD COLUMN ${col} ${def}`);
      }
    }

    // Create experience_applications table for tracking reuse
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS experience_applications (
        id TEXT PRIMARY KEY,
        experience_id TEXT NOT NULL,
        task TEXT NOT NULL,
        success INTEGER NOT NULL,
        tokens_saved INTEGER DEFAULT 0,
        feedback TEXT,
        applied_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (experience_id) REFERENCES captured_experiences(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_exp_apps_experience ON experience_applications(experience_id);
    `);
  }

  /**
   * Prepare commonly used statements against captured_experiences table
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.prepared.set('insertExperience', this.db.prepare(`
      INSERT INTO captured_experiences (
        id, task, agent, domain, success, quality, duration_ms,
        steps_json, routing_json, embedding, embedding_dimension, tags, source
      ) VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?, ?, 'experience-replay')
    `));

    this.prepared.set('getExperience', this.db.prepare(`
      SELECT * FROM captured_experiences WHERE id = ?
    `));

    this.prepared.set('getExperiencesByDomain', this.db.prepare(`
      SELECT * FROM captured_experiences WHERE domain = ? ORDER BY quality DESC LIMIT ?
    `));

    this.prepared.set('getAllExperiences', this.db.prepare(`
      SELECT * FROM captured_experiences ORDER BY quality DESC LIMIT ?
    `));

    this.prepared.set('getAllEmbeddings', this.db.prepare(`
      SELECT id, embedding, embedding_dimension FROM captured_experiences WHERE embedding IS NOT NULL
    `));

    this.prepared.set('updateApplication', this.db.prepare(`
      UPDATE captured_experiences SET
        application_count = application_count + 1,
        avg_token_savings = (avg_token_savings * application_count + ?) / (application_count + 1),
        last_applied_at = datetime('now')
      WHERE id = ?
    `));

    this.prepared.set('insertApplication', this.db.prepare(`
      INSERT INTO experience_applications (id, experience_id, task, success, tokens_saved, feedback)
      VALUES (?, ?, ?, ?, ?, ?)
    `));

    this.prepared.set('deleteExperience', this.db.prepare(`
      DELETE FROM captured_experiences WHERE id = ?
    `));

    this.prepared.set('getLowQualityExperiences', this.db.prepare(`
      SELECT id FROM captured_experiences WHERE quality < ? AND application_count < 3
    `));

    this.prepared.set('countByDomain', this.db.prepare(`
      SELECT domain, COUNT(*) as count FROM captured_experiences GROUP BY domain
    `));
  }

  /**
   * Load embeddings into HNSW index for O(log n) similarity search
   * Performance: 150x-12,500x faster than linear scan
   */
  private async loadEmbeddingIndex(): Promise<void> {
    const stmt = this.prepared.get('getAllEmbeddings');
    if (!stmt) return;

    const rows = stmt.all() as Array<{
      id: string;
      embedding: Buffer;
      embedding_dimension: number;
    }>;

    // Clear existing mappings
    this.idToExperienceId.clear();
    this.experienceIdToHnswId.clear();
    this.hnswIndex.clearIndex('experiences');
    this.nextHnswId = 0;

    // Build HNSW index with all embeddings
    for (const row of rows) {
      if (row.embedding && row.embedding_dimension) {
        const embedding = this.bufferToFloatArray(row.embedding, row.embedding_dimension);
        const hnswId = this.nextHnswId++;

        // Create IEmbedding for HNSW index
        const iEmbedding: IEmbedding = {
          vector: embedding,
          dimension: 384,
          namespace: 'experiences',
          text: row.id, // Use ID as text identifier
          timestamp: Date.now(),
          quantization: 'none',
          metadata: {},
        };

        this.hnswIndex.addEmbedding(iEmbedding, hnswId);

        // Track ID mappings
        this.idToExperienceId.set(hnswId, row.id);
        this.experienceIdToHnswId.set(row.id, hnswId);
      }
    }

    console.log(`[ExperienceReplay] Loaded ${this.idToExperienceId.size} embeddings into HNSW index`);
  }

  /**
   * Store a successful trajectory as a reusable experience
   *
   * @param trajectory - The successful trajectory
   * @param strategy - Distilled strategy description
   * @param tags - Optional tags for filtering
   * @returns The stored experience
   */
  async storeExperience(
    trajectory: Trajectory,
    strategy: string,
    tags: string[] = []
  ): Promise<Experience | null> {
    this.ensureInitialized();

    // Check quality threshold
    if (trajectory.metrics.efficiencyScore < this.config.minQualityThreshold) {
      console.log(`[ExperienceReplay] Trajectory quality too low: ${trajectory.metrics.efficiencyScore}`);
      return null;
    }

    // Extract key actions
    const keyActions = trajectory.steps
      .filter(s => s.result.outcome === 'success')
      .map(s => s.action);

    // Generate embedding for similarity search
    const embeddingText = `${trajectory.task} ${strategy} ${keyActions.join(' ')}`;
    const embedding = await computeRealEmbedding(embeddingText, this.config.embedding);

    const id = uuidv4();
    const domain = trajectory.domain || 'test-generation';

    const experience: Experience = {
      id,
      trajectoryId: trajectory.id,
      task: trajectory.task,
      domain,
      strategy,
      keyActions,
      qualityScore: trajectory.metrics.efficiencyScore,
      applicationCount: 0,
      successRate: 1.0,
      avgTokenSavings: 0,
      embedding,
      createdAt: new Date(),
      originalMetrics: trajectory.metrics,
      tags,
    };

    // Store in captured_experiences table
    const insertStmt = this.prepared.get('insertExperience');
    if (insertStmt) {
      const embeddingBuffer = embedding ? this.floatArrayToBuffer(embedding) : null;
      insertStmt.run(
        id,
        trajectory.task,
        strategy, // agent column stores strategy
        domain,
        trajectory.metrics.efficiencyScore,
        JSON.stringify(keyActions), // steps_json stores key actions
        JSON.stringify(trajectory.metrics), // routing_json stores original metrics
        embeddingBuffer,
        embedding?.length ?? null,
        JSON.stringify(tags),
      );
    }

    // Add to HNSW index for fast similarity search
    if (embedding) {
      const hnswId = this.nextHnswId++;

      const iEmbedding: IEmbedding = {
        vector: embedding,
        dimension: 384,
        namespace: 'experiences',
        text: id, // Use ID as text identifier
        timestamp: Date.now(),
        quantization: 'none',
        metadata: {},
      };

      this.hnswIndex.addEmbedding(iEmbedding, hnswId);
      this.idToExperienceId.set(hnswId, id);
      this.experienceIdToHnswId.set(id, hnswId);
    }

    // Add to recent buffer
    this.recentExperiences.push(experience);

    this.stats.experiencesStored++;

    // Auto-prune if enabled
    if (this.config.autoPrune) {
      await this.autoPrune(domain);
    }

    return experience;
  }

  /**
   * Get guidance for a new task based on similar experiences
   *
   * @param task - The new task description
   * @param domain - Optional domain filter
   * @returns Guidance based on similar experiences
   */
  async getGuidance(
    task: string,
    domain?: QEDomain
  ): Promise<ExperienceGuidance | null> {
    this.ensureInitialized();

    // Find similar experiences
    const similar = await this.findSimilarExperiences(task, domain);

    if (similar.length === 0) {
      return null;
    }

    this.stats.totalRetrievals++;

    // Calculate average similarity
    const avgSimilarity = similar.reduce((sum, s) => sum + s.similarity, 0) / similar.length;
    this.stats.avgSimilarityOnRetrieval =
      (this.stats.avgSimilarityOnRetrieval * (this.stats.totalRetrievals - 1) + avgSimilarity) /
      this.stats.totalRetrievals;

    // Weight experiences by quality and similarity
    const weighted = similar.map(s => ({
      ...s,
      weight: s.similarity * s.experience.qualityScore,
    }));

    // Sort by weight
    weighted.sort((a, b) => b.weight - a.weight);

    // Generate recommended strategy
    const topExperience = weighted[0].experience;
    const recommendedStrategy = topExperience.strategy;

    // Collect suggested actions (union of all key actions)
    const actionCounts = new Map<string, number>();
    for (const w of weighted) {
      for (const action of w.experience.keyActions) {
        actionCounts.set(action, (actionCounts.get(action) || 0) + w.weight);
      }
    }
    const suggestedActions = Array.from(actionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([action]) => action);

    // Identify potential pitfalls (actions that commonly led to failure in similar tasks)
    // For now, we don't have failure tracking, so return empty
    const pitfallsToAvoid: string[] = [];

    // Calculate confidence
    const confidence = weighted.reduce((sum, w) => sum + w.weight, 0) / weighted.length;

    // Estimate token savings
    const estimatedTokenSavings = weighted.reduce(
      (sum, w) => sum + w.experience.avgTokenSavings * w.similarity,
      0
    ) / weighted.length;

    return {
      recommendedStrategy,
      suggestedActions,
      pitfallsToAvoid,
      confidence: Math.min(confidence, 1),
      sourceExperiences: weighted.slice(0, 3).map(w => ({
        id: w.experience.id,
        similarity: w.similarity,
        qualityScore: w.experience.qualityScore,
      })),
      estimatedTokenSavings,
    };
  }

  /**
   * Find experiences similar to a task using HNSW index
   * Performance: O(log n) instead of O(n) - 150x-12,500x faster for large collections
   */
  async findSimilarExperiences(
    task: string,
    domain?: QEDomain,
    limit?: number
  ): Promise<Array<{ experience: Experience; similarity: number }>> {
    this.ensureInitialized();

    const k = limit ?? this.config.topK;

    // Check if index is empty
    if (this.idToExperienceId.size === 0) {
      return [];
    }

    // Generate embedding for the task
    const taskEmbedding = await computeRealEmbedding(task, this.config.embedding);

    // Create query embedding for HNSW search
    const queryEmbedding: IEmbedding = {
      vector: taskEmbedding,
      dimension: 384,
      namespace: 'experiences',
      text: task, // Query text
      timestamp: Date.now(),
      quantization: 'none',
      metadata: {},
    };

    // Use HNSW O(log n) search instead of linear scan
    // Request more results to account for domain filtering and similarity threshold
    const searchLimit = domain ? k * 4 : k * 2;
    const hnswResults = this.hnswIndex.search(queryEmbedding, {
      limit: searchLimit,
      namespace: 'experiences',
    });

    // Convert HNSW results to experiences
    const results: Array<{ experience: Experience; similarity: number }> = [];
    const getStmt = this.prepared.get('getExperience');

    for (const { id: hnswId, distance } of hnswResults) {
      // Convert HNSW distance to similarity (cosine distance to similarity)
      // For cosine metric: similarity = 1 - distance (hnswlib returns distance in [0, 2])
      const similarity = 1 - distance;

      // Apply similarity threshold
      if (similarity < this.config.similarityThreshold) {
        continue;
      }

      // Map HNSW ID back to experience ID
      const experienceId = this.idToExperienceId.get(hnswId);
      if (!experienceId) continue;

      if (getStmt) {
        const row = getStmt.get(experienceId) as ExperienceRow | undefined;
        if (row) {
          // Filter by domain if specified
          if (domain && row.domain !== domain) continue;

          const experience = this.rowToExperience(row);
          if (experience) {
            results.push({ experience, similarity });
            if (results.length >= k) break;
          }
        }
      }
    }

    return results;
  }

  /**
   * Record an application of an experience
   */
  async recordApplication(
    experienceId: string,
    task: string,
    success: boolean,
    tokensSaved: number = 0,
    feedback?: string
  ): Promise<void> {
    this.ensureInitialized();

    // Update experience stats
    const updateStmt = this.prepared.get('updateApplication');
    if (updateStmt) {
      updateStmt.run(tokensSaved, experienceId);
    }

    // Record application
    const insertStmt = this.prepared.get('insertApplication');
    if (insertStmt) {
      insertStmt.run(
        uuidv4(),
        experienceId,
        task,
        success ? 1 : 0,
        tokensSaved,
        feedback ?? null
      );
    }

    this.stats.experiencesApplied++;
    this.stats.totalTokensSaved += tokensSaved;
  }

  /**
   * Get an experience by ID
   */
  async getExperience(id: string): Promise<Experience | null> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getExperience');
    if (!stmt) return null;

    const row = stmt.get(id) as ExperienceRow | undefined;
    return row ? this.rowToExperience(row) : null;
  }

  /**
   * Get experiences by domain
   */
  async getExperiencesByDomain(domain: QEDomain, limit: number = 10): Promise<Experience[]> {
    this.ensureInitialized();

    const stmt = this.prepared.get('getExperiencesByDomain');
    if (!stmt) return [];

    const rows = stmt.all(domain, limit) as ExperienceRow[];
    return rows.map(r => this.rowToExperience(r)).filter((e): e is Experience => e !== null);
  }

  /**
   * Auto-prune low-quality experiences
   */
  private async autoPrune(domain: QEDomain): Promise<number> {
    if (!this.db) return 0;

    // Count experiences in domain
    const countStmt = this.prepared.get('countByDomain');
    if (!countStmt) return 0;

    const counts = countStmt.all() as Array<{ domain: string; count: number }>;
    const domainCount = counts.find(c => c.domain === domain)?.count ?? 0;

    // If over limit, remove low-quality experiences
    if (domainCount > this.config.maxExperiencesPerDomain) {
      const lowQualityStmt = this.prepared.get('getLowQualityExperiences');
      if (lowQualityStmt) {
        const toRemove = lowQualityStmt.all(this.config.pruneThreshold) as Array<{ id: string }>;
        const deleteStmt = this.prepared.get('deleteExperience');

        let removed = 0;
        for (const { id } of toRemove) {
          if (deleteStmt) {
            deleteStmt.run(id);
            // Note: HNSW doesn't support deletion, but we remove from ID mappings
            // The orphaned entry will be ignored during search
            const hnswId = this.experienceIdToHnswId.get(id);
            if (hnswId !== undefined) {
              this.idToExperienceId.delete(hnswId);
              this.experienceIdToHnswId.delete(id);
            }
            removed++;
          }
          if (domainCount - removed <= this.config.maxExperiencesPerDomain) break;
        }

        console.log(`[ExperienceReplay] Auto-pruned ${removed} low-quality experiences`);
        return removed;
      }
    }

    return 0;
  }

  /**
   * Get statistics
   */
  getStats(): {
    experiencesStored: number;
    experiencesApplied: number;
    totalTokensSaved: number;
    avgSimilarityOnRetrieval: number;
    embeddingIndexSize: number;
    hnswIndexSize: number;
    recentBufferSize: number;
  } {
    return {
      ...this.stats,
      embeddingIndexSize: this.idToExperienceId.size, // For backward compatibility
      hnswIndexSize: this.hnswIndex.getSize('experiences'),
      recentBufferSize: this.recentExperiences.length,
    };
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    this.hnswIndex.clearIndex('experiences');
    this.idToExperienceId.clear();
    this.experienceIdToHnswId.clear();
    this.recentExperiences.clear();
    this.prepared.clear();
    this.db = null;
    this.unifiedMemory = null;
    this.initialized = false;
    console.log('[ExperienceReplay] Disposed');
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ExperienceReplay not initialized. Call initialize() first.');
    }
  }

  private rowToExperience(row: ExperienceRow | undefined): Experience | null {
    if (!row) return null;

    return {
      id: row.id,
      trajectoryId: row.id, // captured_experiences doesn't have trajectory_id
      task: row.task,
      domain: row.domain as QEDomain,
      strategy: row.agent, // agent column stores strategy/agent name
      keyActions: safeJsonParse(row.steps_json || '[]'),
      qualityScore: row.quality,
      applicationCount: row.application_count ?? 0,
      successRate: row.success ? 1.0 : 0.0,
      avgTokenSavings: row.avg_token_savings ?? 0,
      embedding: row.embedding && row.embedding_dimension
        ? this.bufferToFloatArray(row.embedding, row.embedding_dimension)
        : undefined,
      createdAt: new Date(row.started_at),
      lastAppliedAt: row.last_applied_at ? new Date(row.last_applied_at) : undefined,
      originalMetrics: safeJsonParse(row.routing_json || '{}'),
      tags: safeJsonParse(row.tags || '[]'),
    };
  }

  private floatArrayToBuffer(arr: number[]): Buffer {
    const buffer = Buffer.alloc(arr.length * 4);
    for (let i = 0; i < arr.length; i++) {
      buffer.writeFloatLE(arr[i], i * 4);
    }
    return buffer;
  }

  private bufferToFloatArray(buffer: Buffer, dimension: number): number[] {
    const arr: number[] = [];
    for (let i = 0; i < dimension; i++) {
      arr.push(buffer.readFloatLE(i * 4));
    }
    return arr;
  }
}

/**
 * Create an ExperienceReplay instance
 */
export function createExperienceReplay(
  config: Partial<ExperienceReplayConfig> = {}
): ExperienceReplay {
  return new ExperienceReplay(config);
}
