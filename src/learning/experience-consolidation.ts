/**
 * Experience Consolidation System
 *
 * Replaces destructive pruning with smart consolidation that:
 * - Phase 1: Clusters & merges similar experiences via HNSW
 * - Phase 2: Reinforces quality based on reuse success
 * - Phase 3: Archives truly valueless entries (soft-delete only)
 * - Phase 4 (safety valve): Soft-archives oldest/lowest-quality rows when a
 *   domain exceeds `hardThreshold`. Previously did `DELETE FROM` which
 *   permanently destroyed ~16K rows in production (see release notes for
 *   v3.9.22). Now strictly non-destructive: rows stay queryable and counted
 *   by the statusline formula, only `consolidated_into` changes to
 *   'archived'.
 *
 * Ensures the Exp counter is monotonically non-decreasing.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Database as DatabaseType } from 'better-sqlite3';
import { getUnifiedMemory } from '../kernel/unified-memory.js';
import { HNSWEmbeddingIndex } from '../integrations/embeddings/index/HNSWIndex.js';
import type { IEmbedding } from '../integrations/embeddings/base/types.js';

// ============================================================================
// Types
// ============================================================================

export interface ConsolidationResult {
  /** Experiences merged into survivors */
  merged: number;
  /**
   * Experiences suppressed from retrieval because they CONTRADICT a
   * higher-quality near-duplicate (similar context, opposite outcome).
   * Soft-suppressed (consolidated_into = 'contradicted'), not deleted.
   */
  contradicted: number;
  /** Experiences with quality recalculated */
  qualityUpdated: number;
  /** Experiences soft-archived (Phase 3 valueless + Phase 4 safety valve) */
  archived: number;
  /**
   * Deprecated: previously the count of physically-deleted rows when a
   * domain exceeded `hardThreshold`. Always 0 since v3.9.22 — the safety
   * valve is now non-destructive (soft-archive only). Kept for callers that
   * still read the field; new code should treat it as a permanent zero.
   */
  hardDeleted: number;
  /** Total active experiences remaining */
  activeRemaining: number;
  /** Domains processed */
  domainsProcessed: string[];
}

export interface ConsolidationConfig {
  /** Similarity threshold for merging (0-1) */
  mergeSimilarityThreshold: number;
  /** Max merges per consolidation run */
  maxMergesPerRun: number;
  /** Soft threshold: start consolidating when domain exceeds this */
  softThreshold: number;
  /**
   * Hard threshold: safety valve. When a domain still exceeds this after
   * Phases 1-3, the oldest/lowest-quality un-applied rows are
   * soft-archived (consolidated_into = 'archived'). NOT hard-deleted —
   * archived rows still count toward the statusline Exp formula.
   */
  hardThreshold: number;
  /** Min age in days for archival eligibility */
  archiveMinAgeDays: number;
  /** Quality floor for archival */
  archiveQualityThreshold: number;
  /** Quality boost per merged experience */
  mergeQualityBoost: number;
  /**
   * Contradiction detection (#510 item 7). Two experiences with cosine
   * similarity >= this threshold but a quality delta >= contradictionQualityDelta
   * are treated as "same context, opposite outcome" — a conflict, not a
   * duplicate. The lower-quality loser is suppressed from retrieval instead of
   * merged, so it can't poison recall.
   */
  contradictionSimilarityThreshold: number;
  /** Min quality gap that turns a near-duplicate into a contradiction (0-1). */
  contradictionQualityDelta: number;
}

const DEFAULT_CONFIG: ConsolidationConfig = {
  mergeSimilarityThreshold: 0.85,
  maxMergesPerRun: 50,
  softThreshold: 400,
  hardThreshold: 2000,
  archiveMinAgeDays: 30,
  archiveQualityThreshold: 0.15,
  mergeQualityBoost: 0.02,
  contradictionSimilarityThreshold: 0.85,
  contradictionQualityDelta: 0.4,
};

interface ActiveExperienceRow {
  id: string;
  task: string;
  domain: string;
  quality: number;
  success: number;
  application_count: number;
  consolidation_count: number;
  reuse_success_count: number;
  reuse_failure_count: number;
  embedding: Buffer | null;
  embedding_dimension: number | null;
  started_at: string;
}

// ============================================================================
// ExperienceConsolidator
// ============================================================================

export class ExperienceConsolidator {
  private readonly config: ConsolidationConfig;
  private db: DatabaseType | null = null;
  private initialized = false;

  constructor(config: Partial<ConsolidationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize with database handle
   */
  async initialize(db?: DatabaseType): Promise<void> {
    if (this.initialized) return;

    if (db) {
      this.db = db;
    } else {
      const um = getUnifiedMemory();
      await um.initialize();
      this.db = um.getDatabase();
    }

    this.initialized = true;
  }

  /**
   * Consolidate all domains that exceed the soft threshold
   */
  async consolidateAll(domains?: string[]): Promise<ConsolidationResult> {
    this.ensureInitialized();

    const totalResult: ConsolidationResult = {
      merged: 0,
      contradicted: 0,
      qualityUpdated: 0,
      archived: 0,
      hardDeleted: 0,
      activeRemaining: 0,
      domainsProcessed: [],
    };

    // Get domain counts
    const domainCounts = this.db!.prepare(
      "SELECT domain, COUNT(*) as cnt FROM captured_experiences WHERE consolidated_into IS NULL GROUP BY domain"
    ).all() as Array<{ domain: string; cnt: number }>;

    const targetDomains = domains
      ? domainCounts.filter(d => domains.includes(d.domain))
      : domainCounts.filter(d => d.cnt > this.config.softThreshold);

    for (const { domain, cnt } of targetDomains) {
      const result = await this.consolidateDomain(domain, cnt);
      totalResult.merged += result.merged;
      totalResult.contradicted += result.contradicted;
      totalResult.qualityUpdated += result.qualityUpdated;
      totalResult.archived += result.archived;
      totalResult.hardDeleted += result.hardDeleted;
      totalResult.domainsProcessed.push(domain);
    }

    // Count total active remaining
    const activeCount = this.db!.prepare(
      "SELECT COUNT(*) as cnt FROM captured_experiences WHERE consolidated_into IS NULL"
    ).get() as { cnt: number };
    totalResult.activeRemaining = activeCount.cnt;

    if (totalResult.merged > 0 || totalResult.archived > 0 || totalResult.contradicted > 0) {
      console.log(
        `[ExperienceConsolidator] Consolidated: ${totalResult.merged} merged, ` +
        `${totalResult.contradicted} contradicted, ` +
        `${totalResult.archived} archived, ${totalResult.activeRemaining} active`
      );
    }

    return totalResult;
  }

  /**
   * Consolidate a single domain
   */
  async consolidateDomain(domain: string, _currentCount?: number): Promise<ConsolidationResult> {
    this.ensureInitialized();

    const result: ConsolidationResult = {
      merged: 0,
      contradicted: 0,
      qualityUpdated: 0,
      archived: 0,
      hardDeleted: 0,
      activeRemaining: 0,
      domainsProcessed: [domain],
    };

    // Phase 1: Cluster & Merge (+ contradiction suppression)
    const clusterResult = await this.clusterAndMerge(domain);
    result.merged = clusterResult.merged;
    result.contradicted = clusterResult.contradicted;

    // Phase 2: Quality Reinforcement
    result.qualityUpdated = this.reinforceQuality(domain);

    // Phase 3: Archive Valueless
    result.archived = this.archiveValueless(domain);

    // Safety valve: when the domain still exceeds hardThreshold after the
    // soft phases, archive (not delete) the oldest low-quality excess.
    // Result is attributed to `archived` — `hardDeleted` stays 0 since
    // v3.9.22 (see ConsolidationResult docstring).
    const afterCount = (this.db!.prepare(
      "SELECT COUNT(*) as cnt FROM captured_experiences WHERE domain = ? AND consolidated_into IS NULL"
    ).get(domain) as { cnt: number }).cnt;

    let safetyValveArchived = 0;
    if (afterCount > this.config.hardThreshold) {
      safetyValveArchived = this.hardDeleteExcess(domain, afterCount);
      result.archived += safetyValveArchived;
    }

    result.activeRemaining = afterCount - safetyValveArchived;
    return result;
  }

  /**
   * One-time bootstrap for domains with large backlogs
   */
  async bootstrapDomain(domain: string): Promise<ConsolidationResult> {
    this.ensureInitialized();

    // Check if already bootstrapped
    const flag = this.db!.prepare(
      "SELECT value FROM kv_store WHERE key = ?"
    ).get(`consolidation_bootstrap_${domain}`) as { value: string } | undefined;

    if (flag) {
      console.log(`[ExperienceConsolidator] Domain ${domain} already bootstrapped`);
      return {
        merged: 0, contradicted: 0, qualityUpdated: 0, archived: 0,
        hardDeleted: 0, activeRemaining: 0, domainsProcessed: [domain],
      };
    }

    // Use relaxed settings for bootstrap
    const savedConfig = { ...this.config };
    this.config.mergeSimilarityThreshold = 0.80;
    this.config.maxMergesPerRun = 200;

    const result = await this.consolidateDomain(domain);

    // Restore config
    Object.assign(this.config, savedConfig);

    // Set bootstrap flag
    try {
      this.db!.prepare(
        "INSERT OR REPLACE INTO kv_store (key, value, namespace) VALUES (?, ?, 'system')"
      ).run(`consolidation_bootstrap_${domain}`, new Date().toISOString());
    } catch {
      // kv_store may not exist in all setups
    }

    console.log(
      `[ExperienceConsolidator] Bootstrap ${domain}: ` +
      `${result.merged} merged, ${result.archived} archived`
    );

    return result;
  }

  // ============================================================================
  // Phase 1: Cluster & Merge
  // ============================================================================

  private async clusterAndMerge(domain: string): Promise<{ merged: number; contradicted: number }> {
    // Get active experiences with embeddings, sorted by quality DESC
    const candidates = this.db!.prepare(`
      SELECT id, task, domain, quality, success, application_count,
             consolidation_count, reuse_success_count, reuse_failure_count,
             embedding, embedding_dimension, started_at
      FROM captured_experiences
      WHERE domain = ? AND consolidated_into IS NULL AND embedding IS NOT NULL
      ORDER BY quality DESC
    `).all(domain) as ActiveExperienceRow[];

    if (candidates.length < 2) return { merged: 0, contradicted: 0 };

    // Build a temporary HNSW index for this domain
    const hnswIndex = new HNSWEmbeddingIndex({
      dimension: 384,
      M: 16,
      efConstruction: 200,
      efSearch: 100,
      metric: 'cosine',
    });

    const idMap = new Map<number, string>();
    let nextId = 0;

    for (const row of candidates) {
      if (row.embedding && row.embedding_dimension) {
        const vector = this.bufferToFloatArray(row.embedding, row.embedding_dimension);
        const hnswId = nextId++;
        idMap.set(hnswId, row.id);

        const iEmb: IEmbedding = {
          vector,
          dimension: 384,
          namespace: 'experiences',
          text: row.id,
          timestamp: Date.now(),
          quantization: 'none',
          metadata: {},
        };
        hnswIndex.addEmbedding(iEmb, hnswId);
      }
    }

    // Track which IDs have been absorbed
    const absorbed = new Set<string>();
    let mergeCount = 0;
    let contradictionCount = 0;

    const markConsolidated = this.db!.prepare(
      "UPDATE captured_experiences SET consolidated_into = ? WHERE id = ?"
    );
    const markContradicted = this.db!.prepare(
      "UPDATE captured_experiences SET consolidated_into = 'contradicted' WHERE id = ?"
    );
    const boostSurvivor = this.db!.prepare(`
      UPDATE captured_experiences
      SET consolidation_count = consolidation_count + ?,
          quality = MIN(1.0, quality + ?),
          quality_updated_at = datetime('now')
      WHERE id = ?
    `);
    const logConsolidation = this.db!.prepare(`
      INSERT INTO experience_consolidation_log (id, domain, action, source_ids, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    // Iterate experiences by quality DESC
    for (const row of candidates) {
      if (mergeCount + contradictionCount >= this.config.maxMergesPerRun) break;
      if (absorbed.has(row.id)) continue;
      if (!row.embedding || !row.embedding_dimension) continue;

      const queryVector = this.bufferToFloatArray(row.embedding, row.embedding_dimension);
      const queryEmb: IEmbedding = {
        vector: queryVector,
        dimension: 384,
        namespace: 'experiences',
        text: row.id,
        timestamp: Date.now(),
        quantization: 'none',
        metadata: {},
      };

      // Find 5 nearest neighbors
      const neighbors = hnswIndex.search(queryEmb, {
        limit: 6, // extra because self will be included
        namespace: 'experiences',
      });

      const mergedIds: string[] = [];
      const contradictedIds: string[] = [];

      for (const { id: hnswId, distance } of neighbors) {
        if (mergeCount + contradictionCount >= this.config.maxMergesPerRun) break;

        const neighborId = idMap.get(hnswId);
        if (!neighborId || neighborId === row.id || absorbed.has(neighborId)) continue;

        const similarity = 1 - distance;
        // Gate on the lower of the two thresholds so neither merge nor
        // contradiction detection is starved if they are configured differently.
        if (similarity < Math.min(
          this.config.mergeSimilarityThreshold,
          this.config.contradictionSimilarityThreshold,
        )) continue;

        // Find the neighbor in candidates
        const neighbor = candidates.find(c => c.id === neighborId);
        if (!neighbor) continue;

        // Contradiction (#510 item 7): same context (high similarity) but
        // opposite outcome (large quality delta) => a conflict, not a duplicate.
        // Suppress the lower-quality loser from retrieval even if it was applied
        // (a used-but-low-quality contradictory experience is exactly the
        // recall-poisoning case). Candidates are sorted quality DESC and absorbed
        // ones are skipped, so when a gap exists `neighbor` is the strict loser.
        const qualityDelta = Math.abs(row.quality - neighbor.quality);
        if (similarity >= this.config.contradictionSimilarityThreshold
            && qualityDelta >= this.config.contradictionQualityDelta) {
          if (neighbor.quality < row.quality) {
            absorbed.add(neighborId);
            contradictedIds.push(neighborId);
            contradictionCount++;
          }
          continue; // never merge a contradictory pair
        }

        // Only merge lower-quality, unused neighbors into the survivor (requires
        // the normal merge similarity threshold).
        if (similarity >= this.config.mergeSimilarityThreshold
            && neighbor.quality <= row.quality && neighbor.application_count === 0) {
          absorbed.add(neighborId);
          mergedIds.push(neighborId);
          mergeCount++;
        }
      }

      // Apply merges in a transaction
      if (mergedIds.length > 0) {
        const transaction = this.db!.transaction(() => {
          for (const absorbedId of mergedIds) {
            markConsolidated.run(row.id, absorbedId);
          }
          const boost = this.config.mergeQualityBoost * mergedIds.length;
          boostSurvivor.run(mergedIds.length, boost, row.id);

          logConsolidation.run(
            uuidv4(), domain, 'merge',
            JSON.stringify(mergedIds), row.id,
            JSON.stringify({ count: mergedIds.length, boost }),
          );
        });
        transaction();
      }

      // Apply contradiction suppressions in a transaction. The loser is
      // soft-suppressed (consolidated_into = 'contradicted'), so it is excluded
      // from retrieval (WHERE consolidated_into IS NULL) but not deleted. The
      // survivor is NOT boosted — a contradiction is a conflict, not a duplicate.
      if (contradictedIds.length > 0) {
        const tx = this.db!.transaction(() => {
          for (const loserId of contradictedIds) {
            markContradicted.run(loserId);
          }
          logConsolidation.run(
            uuidv4(), domain, 'contradiction',
            JSON.stringify(contradictedIds), row.id,
            JSON.stringify({ count: contradictedIds.length, survivorQuality: row.quality }),
          );
        });
        tx();
      }
    }

    // Clean up HNSW index
    hnswIndex.clearIndex('experiences');

    return { merged: mergeCount, contradicted: contradictionCount };
  }

  // ============================================================================
  // Phase 2: Quality Reinforcement
  // ============================================================================

  private reinforceQuality(domain: string): number {
    // Get experiences with application history
    const experiences = this.db!.prepare(`
      SELECT ce.id, ce.quality, ce.consolidation_count,
             ce.reuse_success_count, ce.reuse_failure_count,
             COALESCE(app.total, 0) as app_total,
             COALESCE(app.successes, 0) as app_successes
      FROM captured_experiences ce
      LEFT JOIN (
        SELECT experience_id,
               COUNT(*) as total,
               SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
        FROM experience_applications
        GROUP BY experience_id
      ) app ON app.experience_id = ce.id
      WHERE ce.domain = ? AND ce.consolidated_into IS NULL
        AND (app.total > 0 OR ce.reuse_success_count > 0 OR ce.reuse_failure_count > 0)
    `).all(domain) as Array<{
      id: string;
      quality: number;
      consolidation_count: number;
      reuse_success_count: number;
      reuse_failure_count: number;
      app_total: number;
      app_successes: number;
    }>;

    if (experiences.length === 0) return 0;

    const updateQuality = this.db!.prepare(`
      UPDATE captured_experiences
      SET quality = ?, quality_updated_at = datetime('now')
      WHERE id = ?
    `);

    let updated = 0;
    const transaction = this.db!.transaction(() => {
      for (const exp of experiences) {
        // Calculate success rate from applications + direct tracking
        const totalReuses = exp.app_total + exp.reuse_success_count + exp.reuse_failure_count;
        const totalSuccesses = exp.app_successes + exp.reuse_success_count;
        const successRate = totalReuses > 0 ? totalSuccesses / totalReuses : 0;

        // Consolidation bonus (capped at 10)
        const consolidationBonus = Math.min(exp.consolidation_count, 10) / 10;

        // New quality: 40% original + 40% success rate + 20% consolidation
        const newQuality = Math.min(1.0,
          0.4 * exp.quality + 0.4 * successRate + 0.2 * consolidationBonus
        );

        // Only update if quality changed meaningfully
        if (Math.abs(newQuality - exp.quality) > 0.01) {
          updateQuality.run(newQuality, exp.id);
          updated++;
        }
      }
    });
    transaction();

    return updated;
  }

  // ============================================================================
  // Phase 3: Archive Valueless
  // ============================================================================

  private archiveValueless(domain: string): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.archiveMinAgeDays);
    const cutoffStr = cutoffDate.toISOString().replace('T', ' ').slice(0, 19);

    // Archive when ALL conditions met:
    // quality < threshold, no applications, no success, single (not consolidated), old enough
    const result = this.db!.prepare(`
      UPDATE captured_experiences
      SET consolidated_into = 'archived'
      WHERE domain = ?
        AND consolidated_into IS NULL
        AND quality < ?
        AND application_count = 0
        AND success = 0
        AND consolidation_count = 1
        AND started_at < ?
    `).run(domain, this.config.archiveQualityThreshold, cutoffStr);

    if (result.changes > 0) {
      // Log the archive action
      try {
        this.db!.prepare(`
          INSERT INTO experience_consolidation_log (id, domain, action, source_ids, details, created_at)
          VALUES (?, ?, 'archive', '[]', ?, datetime('now'))
        `).run(uuidv4(), domain, JSON.stringify({ count: result.changes }));
      } catch {
        // Logging is best-effort
      }
    }

    return result.changes;
  }

  // ============================================================================
  // Safety Valve: Soft Archive (formerly Hard Delete)
  // ============================================================================
  //
  // Pre-v3.9.22 this method ran `DELETE FROM captured_experiences`, which
  // permanently destroyed ~16K rows in production once `code-intelligence`
  // exceeded the threshold. The replacement keeps the same trigger condition
  // (domain still over `hardThreshold` after Phases 1-3) but soft-archives
  // the excess instead. Archived rows remain in the table and continue to
  // contribute to the statusline Exp formula
  // (`consolidated_into IS NULL OR consolidated_into = 'archived'`), so the
  // counter stays monotonic.
  //
  // Method name and signature are preserved so the existing caller
  // (`consolidateDomain`) keeps working unchanged. The returned number now
  // represents rows transitioned active → archived, not rows deleted.
  // ConsolidationResult.hardDeleted is kept zero for that reason; the
  // archive count is rolled into Phase 3's `archived` total.

  private hardDeleteExcess(domain: string, currentCount: number): number {
    const excess = currentCount - this.config.hardThreshold;
    if (excess <= 0) return 0;

    // Soft-archive oldest low-quality un-applied active rows.
    // Same selection criteria as the previous hard-delete path so the
    // memory pressure relief behavior is unchanged — only the operation
    // (UPDATE vs DELETE) changes.
    const result = this.db!.prepare(`
      UPDATE captured_experiences
      SET consolidated_into = 'archived'
      WHERE id IN (
        SELECT id FROM captured_experiences
        WHERE domain = ? AND consolidated_into IS NULL AND application_count = 0
        ORDER BY quality ASC, started_at ASC
        LIMIT ?
      )
    `).run(domain, excess);

    const archived = result.changes;

    if (archived > 0) {
      try {
        this.db!.prepare(`
          INSERT INTO experience_consolidation_log (id, domain, action, source_ids, details, created_at)
          VALUES (?, ?, 'safety-valve-archive', '[]', ?, datetime('now'))
        `).run(
          uuidv4(),
          domain,
          JSON.stringify({
            count: archived,
            currentCount,
            hardThreshold: this.config.hardThreshold,
            note: 'soft-archive replacement for legacy hard-delete safety valve',
          }),
        );
      } catch {
        // Logging is best-effort; safety-valve effect is in the UPDATE above.
      }

      console.warn(
        `[ExperienceConsolidator] Safety valve: soft-archived ${archived} from ${domain} (was ${currentCount}, threshold ${this.config.hardThreshold})`
      );
    }

    return archived;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('ExperienceConsolidator not initialized. Call initialize() first.');
    }
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
 * Create an ExperienceConsolidator instance
 */
export function createExperienceConsolidator(
  config: Partial<ConsolidationConfig> = {}
): ExperienceConsolidator {
  return new ExperienceConsolidator(config);
}
