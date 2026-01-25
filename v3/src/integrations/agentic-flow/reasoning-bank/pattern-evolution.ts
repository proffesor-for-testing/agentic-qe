/**
 * PatternEvolution - Track and manage pattern versions over time
 * ADR-051: ReasoningBank enhancement for 46% faster recurring tasks
 *
 * PatternEvolution enables adaptive learning by:
 * - Tracking pattern versions and changes
 * - Detecting semantic drift in patterns
 * - Merging similar patterns to reduce redundancy
 * - Pruning low-quality or obsolete patterns
 *
 * This creates a self-improving knowledge base that adapts to changing needs.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../../../kernel/unified-memory.js';
import type { QEPattern, QEDomain } from '../../../learning/qe-patterns.js';
import {
  computeRealEmbedding,
  cosineSimilarity,
  type EmbeddingConfig,
} from '../../../learning/real-embeddings.js';
import { CircularBuffer } from '../../../shared/utils/circular-buffer.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A version of a pattern at a point in time
 */
export interface PatternVersion {
  /** Version identifier */
  readonly id: string;

  /** Pattern ID this version belongs to */
  readonly patternId: string;

  /** Version number (1, 2, 3, ...) */
  readonly version: number;

  /** Embedding at this version */
  readonly embedding: number[];

  /** Key changes from previous version */
  readonly changes: string[];

  /** Quality score at this version */
  readonly qualityScore: number;

  /** Success rate at this version */
  readonly successRate: number;

  /** Timestamp */
  readonly timestamp: Date;

  /** Trigger for this version (manual, drift-detection, merge) */
  readonly trigger: 'initial' | 'manual' | 'drift' | 'merge' | 'feedback';
}

/**
 * Drift detection result
 */
export interface DriftDetectionResult {
  /** Pattern that has drifted */
  readonly patternId: string;

  /** Current embedding */
  readonly currentEmbedding: number[];

  /** Original embedding */
  readonly originalEmbedding: number[];

  /** Drift score (0 = no drift, 1 = complete drift) */
  readonly driftScore: number;

  /** Has significant drift */
  readonly hasSignificantDrift: boolean;

  /** Recommended action */
  readonly recommendation: 'keep' | 'update' | 'archive' | 'split';

  /** Reason for recommendation */
  readonly reason: string;
}

/**
 * Merge candidate - two patterns that could be merged
 */
export interface MergeCandidate {
  /** First pattern ID */
  readonly patternId1: string;

  /** Second pattern ID */
  readonly patternId2: string;

  /** Similarity between patterns */
  readonly similarity: number;

  /** Merge benefit score */
  readonly mergeBenefit: number;

  /** Suggested merged name */
  readonly suggestedName: string;
}

/**
 * Prune candidate - pattern that could be removed
 */
export interface PruneCandidate {
  /** Pattern ID */
  readonly patternId: string;

  /** Pattern name */
  readonly name: string;

  /** Reason for pruning */
  readonly reason: 'low-quality' | 'obsolete' | 'redundant' | 'unused';

  /** Quality score */
  readonly qualityScore: number;

  /** Days since last used */
  readonly daysSinceLastUse: number;

  /** Similar patterns that make this redundant */
  readonly similarPatterns?: string[];
}

/**
 * Evolution event - significant change in pattern lifecycle
 */
export interface EvolutionEvent {
  /** Event ID */
  readonly id: string;

  /** Pattern ID */
  readonly patternId: string;

  /** Event type */
  readonly eventType: 'created' | 'updated' | 'merged' | 'archived' | 'pruned' | 'split';

  /** Event details */
  readonly details: Record<string, unknown>;

  /** Timestamp */
  readonly timestamp: Date;
}

/**
 * Configuration for PatternEvolution
 */
export interface PatternEvolutionConfig {
  /** Threshold for detecting significant drift (0-1) */
  driftThreshold: number;

  /** Threshold for considering patterns as similar for merge (0-1) */
  mergeSimilarityThreshold: number;

  /** Minimum quality score to avoid pruning */
  minQualityForRetention: number;

  /** Days without use before considering pattern obsolete */
  obsoleteDaysThreshold: number;

  /** Maximum patterns per domain before triggering consolidation */
  maxPatternsPerDomain: number;

  /** Embedding configuration */
  embedding: Partial<EmbeddingConfig>;

  /** History buffer size */
  historyBufferSize: number;
}

const DEFAULT_CONFIG: PatternEvolutionConfig = {
  driftThreshold: 0.3,
  mergeSimilarityThreshold: 0.85,
  minQualityForRetention: 0.3,
  obsoleteDaysThreshold: 60,
  maxPatternsPerDomain: 200,
  embedding: {
    modelName: 'Xenova/all-MiniLM-L6-v2',
    quantized: true,
  },
  historyBufferSize: 500,
};

// ============================================================================
// PatternEvolution Implementation
// ============================================================================

/**
 * PatternEvolution manages pattern versioning, drift detection, and consolidation.
 *
 * Usage:
 * ```typescript
 * const evolution = new PatternEvolution();
 * await evolution.initialize();
 *
 * // Track pattern version
 * await evolution.trackVersion(patternId, embedding, ['Added retry logic']);
 *
 * // Detect drift
 * const drift = await evolution.detectDrift(patternId);
 * if (drift.hasSignificantDrift) {
 *   console.log('Pattern has drifted:', drift.recommendation);
 * }
 *
 * // Find merge candidates
 * const candidates = await evolution.findMergeCandidates('test-generation');
 *
 * // Prune low-quality patterns
 * const pruned = await evolution.autoConsolidate('test-generation');
 * ```
 */
export class PatternEvolution {
  private readonly config: PatternEvolutionConfig;
  private unifiedMemory: UnifiedMemoryManager | null = null;
  private db: DatabaseType | null = null;
  private prepared: Map<string, Statement> = new Map();
  private initialized = false;

  // Cache for pattern embeddings (patternId -> latest embedding)
  private embeddingCache: Map<string, number[]> = new Map();

  // Recent evolution events buffer
  private recentEvents: CircularBuffer<EvolutionEvent>;

  // Statistics
  private stats = {
    versionsTracked: 0,
    driftDetections: 0,
    significantDrifts: 0,
    patternsMerged: 0,
    patternsPruned: 0,
    consolidationRuns: 0,
  };

  constructor(config: Partial<PatternEvolutionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.recentEvents = new CircularBuffer(this.config.historyBufferSize);
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

    // Load embedding cache
    await this.loadEmbeddingCache();

    this.initialized = true;
    console.log('[PatternEvolution] Initialized');
  }

  /**
   * Ensure required schema exists
   */
  private ensureSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Pattern versions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_versions (
        id TEXT PRIMARY KEY,
        pattern_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        embedding_dimension INTEGER NOT NULL,
        changes TEXT,
        quality_score REAL DEFAULT 0.5,
        success_rate REAL DEFAULT 0.5,
        trigger TEXT DEFAULT 'manual',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_pattern_versions_pattern ON pattern_versions(pattern_id);
      CREATE INDEX IF NOT EXISTS idx_pattern_versions_version ON pattern_versions(pattern_id, version DESC);
    `);

    // Evolution events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_evolution_events (
        id TEXT PRIMARY KEY,
        pattern_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        details TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_evolution_events_pattern ON pattern_evolution_events(pattern_id);
      CREATE INDEX IF NOT EXISTS idx_evolution_events_type ON pattern_evolution_events(event_type);
    `);

    // Pattern relationships table (for tracking merges, splits)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_relationships (
        id TEXT PRIMARY KEY,
        source_pattern_id TEXT NOT NULL,
        target_pattern_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        similarity_score REAL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (source_pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_pattern_rel_source ON pattern_relationships(source_pattern_id);
      CREATE INDEX IF NOT EXISTS idx_pattern_rel_target ON pattern_relationships(target_pattern_id);
    `);
  }

  /**
   * Prepare commonly used statements
   */
  private prepareStatements(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.prepared.set('insertVersion', this.db.prepare(`
      INSERT INTO pattern_versions (
        id, pattern_id, version, embedding, embedding_dimension, changes, quality_score, success_rate, trigger
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));

    this.prepared.set('getLatestVersion', this.db.prepare(`
      SELECT * FROM pattern_versions WHERE pattern_id = ? ORDER BY version DESC LIMIT 1
    `));

    this.prepared.set('getVersionHistory', this.db.prepare(`
      SELECT * FROM pattern_versions WHERE pattern_id = ? ORDER BY version DESC LIMIT ?
    `));

    this.prepared.set('getVersionCount', this.db.prepare(`
      SELECT COUNT(*) as count FROM pattern_versions WHERE pattern_id = ?
    `));

    this.prepared.set('insertEvent', this.db.prepare(`
      INSERT INTO pattern_evolution_events (id, pattern_id, event_type, details)
      VALUES (?, ?, ?, ?)
    `));

    this.prepared.set('getEvents', this.db.prepare(`
      SELECT * FROM pattern_evolution_events WHERE pattern_id = ? ORDER BY created_at DESC LIMIT ?
    `));

    this.prepared.set('insertRelationship', this.db.prepare(`
      INSERT INTO pattern_relationships (id, source_pattern_id, target_pattern_id, relationship_type, similarity_score)
      VALUES (?, ?, ?, ?, ?)
    `));

    this.prepared.set('getPatternEmbeddings', this.db.prepare(`
      SELECT pe.pattern_id, pe.embedding, pe.dimension
      FROM qe_pattern_embeddings pe
      JOIN qe_patterns p ON pe.pattern_id = p.id
      WHERE p.qe_domain = ?
    `));

    this.prepared.set('getAllPatternEmbeddings', this.db.prepare(`
      SELECT pe.pattern_id, pe.embedding, pe.dimension
      FROM qe_pattern_embeddings pe
    `));

    this.prepared.set('getPattern', this.db.prepare(`
      SELECT * FROM qe_patterns WHERE id = ?
    `));

    this.prepared.set('getPatternsForPruning', this.db.prepare(`
      SELECT id, name, quality_score, last_used_at
      FROM qe_patterns
      WHERE qe_domain = ? AND quality_score < ?
      ORDER BY quality_score ASC
    `));
  }

  /**
   * Load embedding cache from database
   */
  private async loadEmbeddingCache(): Promise<void> {
    const stmt = this.prepared.get('getAllPatternEmbeddings');
    if (!stmt) return;

    const rows = stmt.all() as Array<{
      pattern_id: string;
      embedding: Buffer;
      dimension: number;
    }>;

    this.embeddingCache.clear();
    for (const row of rows) {
      const embedding = this.bufferToFloatArray(row.embedding, row.dimension);
      this.embeddingCache.set(row.pattern_id, embedding);
    }

    console.log(`[PatternEvolution] Loaded ${this.embeddingCache.size} pattern embeddings`);
  }

  /**
   * Track a new version of a pattern
   *
   * @param patternId - Pattern ID
   * @param embedding - Current embedding
   * @param changes - Description of changes
   * @param trigger - What triggered this version
   */
  async trackVersion(
    patternId: string,
    embedding: number[],
    changes: string[] = [],
    trigger: PatternVersion['trigger'] = 'manual'
  ): Promise<PatternVersion> {
    this.ensureInitialized();

    // Get current version count
    const countStmt = this.prepared.get('getVersionCount');
    const countResult = countStmt?.get(patternId) as { count: number } | undefined;
    const newVersion = (countResult?.count ?? 0) + 1;

    // Get pattern quality/success rate
    const patternStmt = this.prepared.get('getPattern');
    const pattern = patternStmt?.get(patternId) as any;

    const id = uuidv4();
    const version: PatternVersion = {
      id,
      patternId,
      version: newVersion,
      embedding,
      changes,
      qualityScore: pattern?.quality_score ?? 0.5,
      successRate: pattern?.success_rate ?? 0.5,
      timestamp: new Date(),
      trigger,
    };

    // Store in database
    const insertStmt = this.prepared.get('insertVersion');
    if (insertStmt) {
      const embeddingBuffer = this.floatArrayToBuffer(embedding);
      insertStmt.run(
        id,
        patternId,
        newVersion,
        embeddingBuffer,
        embedding.length,
        JSON.stringify(changes),
        version.qualityScore,
        version.successRate,
        trigger
      );
    }

    // Update embedding cache
    this.embeddingCache.set(patternId, embedding);

    // Record evolution event
    await this.recordEvent(patternId, 'updated', { version: newVersion, changes, trigger });

    this.stats.versionsTracked++;

    return version;
  }

  /**
   * Detect drift in a pattern
   *
   * @param patternId - Pattern ID to check
   * @returns Drift detection result
   */
  async detectDrift(patternId: string): Promise<DriftDetectionResult | null> {
    this.ensureInitialized();
    this.stats.driftDetections++;

    // Get version history
    const historyStmt = this.prepared.get('getVersionHistory');
    if (!historyStmt) return null;

    const versions = historyStmt.all(patternId, 10) as any[];
    if (versions.length < 2) return null;

    // Compare current (first) with original (last)
    const current = versions[0];
    const original = versions[versions.length - 1];

    const currentEmbedding = this.bufferToFloatArray(current.embedding, current.embedding_dimension);
    const originalEmbedding = this.bufferToFloatArray(original.embedding, original.embedding_dimension);

    // Calculate drift score (1 - cosine similarity)
    const similarity = cosineSimilarity(currentEmbedding, originalEmbedding);
    const driftScore = 1 - similarity;
    const hasSignificantDrift = driftScore > this.config.driftThreshold;

    if (hasSignificantDrift) {
      this.stats.significantDrifts++;
    }

    // Determine recommendation
    let recommendation: DriftDetectionResult['recommendation'];
    let reason: string;

    if (driftScore < 0.1) {
      recommendation = 'keep';
      reason = 'Pattern is stable with minimal drift';
    } else if (driftScore < this.config.driftThreshold) {
      recommendation = 'keep';
      reason = 'Drift is within acceptable range';
    } else if (driftScore < 0.6) {
      recommendation = 'update';
      reason = 'Moderate drift detected - consider versioning';
    } else if (driftScore < 0.8) {
      recommendation = 'split';
      reason = 'Significant drift - pattern may represent multiple concepts';
    } else {
      recommendation = 'archive';
      reason = 'Severe drift - pattern has fundamentally changed';
    }

    return {
      patternId,
      currentEmbedding,
      originalEmbedding,
      driftScore,
      hasSignificantDrift,
      recommendation,
      reason,
    };
  }

  /**
   * Find patterns that could be merged
   *
   * @param domain - Domain to search
   * @returns List of merge candidates
   */
  async findMergeCandidates(domain: QEDomain): Promise<MergeCandidate[]> {
    this.ensureInitialized();

    // Get all pattern embeddings for domain
    const embeddingsStmt = this.prepared.get('getPatternEmbeddings');
    if (!embeddingsStmt) return [];

    const rows = embeddingsStmt.all(domain) as Array<{
      pattern_id: string;
      embedding: Buffer;
      dimension: number;
    }>;

    // Compare all pairs
    const candidates: MergeCandidate[] = [];
    const patternStmt = this.prepared.get('getPattern');

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const emb1 = this.bufferToFloatArray(rows[i].embedding, rows[i].dimension);
        const emb2 = this.bufferToFloatArray(rows[j].embedding, rows[j].dimension);

        const similarity = cosineSimilarity(emb1, emb2);

        if (similarity >= this.config.mergeSimilarityThreshold) {
          // Get pattern names
          const p1 = patternStmt?.get(rows[i].pattern_id) as any;
          const p2 = patternStmt?.get(rows[j].pattern_id) as any;

          // Calculate merge benefit (higher if both have good quality)
          const avgQuality = ((p1?.quality_score ?? 0) + (p2?.quality_score ?? 0)) / 2;
          const mergeBenefit = similarity * avgQuality;

          candidates.push({
            patternId1: rows[i].pattern_id,
            patternId2: rows[j].pattern_id,
            similarity,
            mergeBenefit,
            suggestedName: `${p1?.name ?? 'Pattern'} + ${p2?.name ?? 'Pattern'}`,
          });
        }
      }
    }

    // Sort by merge benefit
    return candidates.sort((a, b) => b.mergeBenefit - a.mergeBenefit);
  }

  /**
   * Find patterns that should be pruned
   *
   * @param domain - Domain to search
   * @returns List of prune candidates
   */
  async findPruneCandidates(domain: QEDomain): Promise<PruneCandidate[]> {
    this.ensureInitialized();

    const candidates: PruneCandidate[] = [];

    // Get low-quality patterns
    const pruneStmt = this.prepared.get('getPatternsForPruning');
    if (pruneStmt) {
      const rows = pruneStmt.all(domain, this.config.minQualityForRetention) as any[];

      for (const row of rows) {
        const lastUsed = row.last_used_at ? new Date(row.last_used_at) : new Date(0);
        const daysSinceLastUse = Math.floor(
          (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24)
        );

        let reason: PruneCandidate['reason'];
        if (daysSinceLastUse > this.config.obsoleteDaysThreshold) {
          reason = 'obsolete';
        } else if (row.quality_score < 0.2) {
          reason = 'low-quality';
        } else {
          reason = 'unused';
        }

        candidates.push({
          patternId: row.id,
          name: row.name,
          reason,
          qualityScore: row.quality_score,
          daysSinceLastUse,
        });
      }
    }

    // Check for redundant patterns (very similar to better ones)
    const mergeCandidates = await this.findMergeCandidates(domain);
    for (const merge of mergeCandidates) {
      // If one pattern is significantly lower quality, mark it redundant
      const p1 = this.prepared.get('getPattern')?.get(merge.patternId1) as any;
      const p2 = this.prepared.get('getPattern')?.get(merge.patternId2) as any;

      if (p1 && p2) {
        const qualityDiff = Math.abs((p1.quality_score ?? 0) - (p2.quality_score ?? 0));
        if (qualityDiff > 0.3) {
          const lowerPattern = (p1.quality_score ?? 0) < (p2.quality_score ?? 0) ? p1 : p2;
          const higherPattern = (p1.quality_score ?? 0) >= (p2.quality_score ?? 0) ? p1 : p2;

          // Check if already in candidates
          if (!candidates.find(c => c.patternId === lowerPattern.id)) {
            candidates.push({
              patternId: lowerPattern.id,
              name: lowerPattern.name,
              reason: 'redundant',
              qualityScore: lowerPattern.quality_score,
              daysSinceLastUse: 0,
              similarPatterns: [higherPattern.id],
            });
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Merge two patterns into one
   *
   * @param patternId1 - First pattern ID
   * @param patternId2 - Second pattern ID
   * @param mergedName - Name for merged pattern
   * @returns ID of the retained pattern (higher quality one)
   */
  async mergePatterns(
    patternId1: string,
    patternId2: string,
    mergedName?: string
  ): Promise<string | null> {
    this.ensureInitialized();
    if (!this.db) return null;

    const patternStmt = this.prepared.get('getPattern');
    const p1 = patternStmt?.get(patternId1) as any;
    const p2 = patternStmt?.get(patternId2) as any;

    if (!p1 || !p2) return null;

    // Keep the higher quality pattern
    const [retained, archived] = (p1.quality_score ?? 0) >= (p2.quality_score ?? 0)
      ? [p1, p2]
      : [p2, p1];

    // Update retained pattern name if provided
    if (mergedName) {
      this.db.prepare(`UPDATE qe_patterns SET name = ? WHERE id = ?`).run(mergedName, retained.id);
    }

    // Combine usage counts and recalculate success rate
    const totalUsage = (retained.usage_count ?? 0) + (archived.usage_count ?? 0);
    const totalSuccess = (retained.successful_uses ?? 0) + (archived.successful_uses ?? 0);
    const newSuccessRate = totalUsage > 0 ? totalSuccess / totalUsage : 0;

    this.db.prepare(`
      UPDATE qe_patterns SET
        usage_count = ?,
        successful_uses = ?,
        success_rate = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(totalUsage, totalSuccess, newSuccessRate, retained.id);

    // Record merge relationship
    const relStmt = this.prepared.get('insertRelationship');
    if (relStmt) {
      relStmt.run(uuidv4(), archived.id, retained.id, 'merged', 1.0);
    }

    // Archive the lower quality pattern (mark as archived)
    this.db.prepare(`UPDATE qe_patterns SET tier = 'archived' WHERE id = ?`).run(archived.id);

    // Record events
    await this.recordEvent(retained.id, 'merged', { absorbedFrom: archived.id });
    await this.recordEvent(archived.id, 'archived', { mergedInto: retained.id });

    this.stats.patternsMerged++;

    return retained.id;
  }

  /**
   * Auto-consolidate patterns in a domain (merge + prune)
   *
   * @param domain - Domain to consolidate
   * @returns Summary of consolidation actions
   */
  async autoConsolidate(domain: QEDomain): Promise<{
    merged: number;
    pruned: number;
    retained: number;
  }> {
    this.ensureInitialized();
    this.stats.consolidationRuns++;

    let merged = 0;
    let pruned = 0;

    // Find and execute merges (up to 5 per run)
    const mergeCandidates = await this.findMergeCandidates(domain);
    for (const candidate of mergeCandidates.slice(0, 5)) {
      const result = await this.mergePatterns(candidate.patternId1, candidate.patternId2);
      if (result) merged++;
    }

    // Find and prune low-quality patterns
    const pruneCandidates = await this.findPruneCandidates(domain);
    for (const candidate of pruneCandidates) {
      if (candidate.reason === 'low-quality' || candidate.reason === 'obsolete') {
        // Actually delete the pattern
        if (this.db) {
          this.db.prepare(`DELETE FROM qe_patterns WHERE id = ?`).run(candidate.patternId);
          this.embeddingCache.delete(candidate.patternId);
          await this.recordEvent(candidate.patternId, 'pruned', { reason: candidate.reason });
          pruned++;
          this.stats.patternsPruned++;
        }
      }
    }

    // Count retained patterns
    const countResult = this.db?.prepare(`
      SELECT COUNT(*) as count FROM qe_patterns WHERE qe_domain = ? AND tier != 'archived'
    `).get(domain) as { count: number } | undefined;

    return {
      merged,
      pruned,
      retained: countResult?.count ?? 0,
    };
  }

  /**
   * Get pattern evolution history
   */
  async getEvolutionHistory(patternId: string, limit: number = 20): Promise<{
    versions: PatternVersion[];
    events: EvolutionEvent[];
  }> {
    this.ensureInitialized();

    // Get versions
    const versionsStmt = this.prepared.get('getVersionHistory');
    const versionRows = versionsStmt?.all(patternId, limit) as any[] ?? [];

    const versions: PatternVersion[] = versionRows.map(row => ({
      id: row.id,
      patternId: row.pattern_id,
      version: row.version,
      embedding: this.bufferToFloatArray(row.embedding, row.embedding_dimension),
      changes: JSON.parse(row.changes || '[]'),
      qualityScore: row.quality_score,
      successRate: row.success_rate,
      timestamp: new Date(row.created_at),
      trigger: row.trigger as PatternVersion['trigger'],
    }));

    // Get events
    const eventsStmt = this.prepared.get('getEvents');
    const eventRows = eventsStmt?.all(patternId, limit) as any[] ?? [];

    const events: EvolutionEvent[] = eventRows.map(row => ({
      id: row.id,
      patternId: row.pattern_id,
      eventType: row.event_type as EvolutionEvent['eventType'],
      details: JSON.parse(row.details || '{}'),
      timestamp: new Date(row.created_at),
    }));

    return { versions, events };
  }

  /**
   * Record an evolution event
   */
  private async recordEvent(
    patternId: string,
    eventType: EvolutionEvent['eventType'],
    details: Record<string, unknown>
  ): Promise<void> {
    const insertStmt = this.prepared.get('insertEvent');
    if (insertStmt) {
      const event: EvolutionEvent = {
        id: uuidv4(),
        patternId,
        eventType,
        details,
        timestamp: new Date(),
      };
      insertStmt.run(event.id, patternId, eventType, JSON.stringify(details));
      this.recentEvents.push(event);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    versionsTracked: number;
    driftDetections: number;
    significantDrifts: number;
    patternsMerged: number;
    patternsPruned: number;
    consolidationRuns: number;
    embeddingCacheSize: number;
    recentEventsSize: number;
  } {
    return {
      ...this.stats,
      embeddingCacheSize: this.embeddingCache.size,
      recentEventsSize: this.recentEvents.length,
    };
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    this.embeddingCache.clear();
    this.recentEvents.clear();
    this.prepared.clear();
    this.db = null;
    this.unifiedMemory = null;
    this.initialized = false;
    console.log('[PatternEvolution] Disposed');
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('PatternEvolution not initialized. Call initialize() first.');
    }
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
 * Create a PatternEvolution instance
 */
export function createPatternEvolution(
  config: Partial<PatternEvolutionConfig> = {}
): PatternEvolution {
  return new PatternEvolution(config);
}
