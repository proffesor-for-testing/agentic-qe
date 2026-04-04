/**
 * Agentic QE v3 - Pattern Promotion & Cross-Domain Seeding
 * Extracted from qe-reasoning-bank.ts for file size discipline
 *
 * Handles pattern promotion (short-term → long-term) with coherence gating (ADR-052),
 * and cross-domain pattern seeding/transfer.
 */

import { LoggerFactory } from '../logging/index.js';
import type { Logger } from '../logging/index.js';
import type { EventBus } from '../kernel/interfaces.js';
import { toErrorMessage } from '../shared/error-utils.js';
import type { QEPattern, QEDomain } from './qe-patterns.js';
import { shouldPromotePattern, calculateQualityScore } from './qe-patterns.js';
import type { IPatternStore, PatternSearchResult } from './pattern-store.js';
import type { SQLitePatternStore } from './sqlite-persistence.js';
import { getWitnessChain } from '../audit/witness-chain.js';
import type { RvfDualWriter } from '../integrations/ruvector/rvf-dual-writer.js';
import type { PromotionBlockedEvent } from './qe-reasoning-bank-types.js';
import { RELATED_DOMAINS } from './agent-routing.js';
import type { Result } from '../shared/types/index.js';
import { getRuVectorFeatureFlags } from '../integrations/ruvector/feature-flags.js';
import { PageRankSolver, type PatternGraph } from '../integrations/ruvector/solver-adapter.js';
import type { Database as DatabaseType } from 'better-sqlite3';

const logger: Logger = LoggerFactory.create('PatternPromotion');

// ============================================================================
// Promotion Logic (ADR-052)
// ============================================================================

/**
 * Dependencies needed for promotion checks
 */
export interface PromotionDeps {
  patternStore: IPatternStore;
  coherenceService?: {
    isInitialized(): boolean;
    checkCoherence(nodes: unknown[]): Promise<{
      energy: number;
      contradictions?: { nodeIds: string[] }[];
    }>;
  };
  eventBus?: EventBus;
  coherenceThreshold: number;
  getSqliteStore: () => SQLitePatternStore;
  rvfDualWriter: RvfDualWriter | null;
  searchPatterns: (
    query: string | number[],
    options?: Record<string, unknown>,
  ) => Promise<Result<PatternSearchResult[]>>;
  getPattern: (id: string) => Promise<QEPattern | null>;
}

/**
 * Check if a pattern should be promoted with coherence gate (ADR-052)
 *
 * Two-stage check:
 * 1. Basic criteria (usage and quality) - cheap
 * 2. Coherence criteria (only if basic passes) - expensive
 */
export async function checkPatternPromotionWithCoherence(
  pattern: QEPattern,
  deps: PromotionDeps,
): Promise<boolean> {
  const basicCheck = shouldPromotePattern(pattern);
  if (!basicCheck.meetsUsageCriteria || !basicCheck.meetsQualityCriteria) {
    return false;
  }

  if (deps.coherenceService && deps.coherenceService.isInitialized()) {
    const longTermResult = await deps.searchPatterns('', {
      tier: 'long-term',
      limit: 1000,
    });
    const longTermPatterns = longTermResult.success
      ? longTermResult.value.map((r) => r.pattern)
      : [];

    const allPatterns = [...longTermPatterns, pattern];
    const coherenceNodes = allPatterns.map((p) => ({
      id: p.id,
      embedding: p.embedding || [],
      weight: p.confidence,
      metadata: { name: p.name, domain: p.qeDomain },
    }));

    const coherenceResult =
      await deps.coherenceService.checkCoherence(coherenceNodes);

    if (coherenceResult.energy >= deps.coherenceThreshold) {
      const event: PromotionBlockedEvent = {
        patternId: pattern.id,
        patternName: pattern.name,
        reason: 'coherence_violation',
        energy: coherenceResult.energy,
        existingPatternConflicts: coherenceResult.contradictions
          ?.map((c) => c.nodeIds)
          .flat(),
      };

      if (deps.eventBus) {
        await deps.eventBus.publish({
          id: `pattern-promotion-blocked-${pattern.id}`,
          type: 'pattern:promotion_blocked',
          timestamp: new Date(),
          source: 'learning-optimization',
          payload: event,
        });
      }

      logger.info('Pattern promotion blocked due to coherence violation', {
        name: pattern.name,
        energy: coherenceResult.energy,
      });

      return false;
    }
  }

  return true;
}

/**
 * Promote a pattern to long-term storage
 */
export async function promotePattern(
  patternId: string,
  deps: PromotionDeps,
): Promise<void> {
  const result = await deps.patternStore.promote(patternId);
  if (result.success) {
    try {
      deps.getSqliteStore().promotePattern(patternId);
    } catch (e) {
      logger.warn('SQLite pattern promotion persist failed', {
        error: toErrorMessage(e),
      });
    }

    // Record citation co-occurrence: promoted pattern cites existing long-term patterns
    // in the same domain (R8, ADR-087)
    if (getRuVectorFeatureFlags().useSublinearSolver) {
      try {
        const db = deps.getSqliteStore().getDatabase?.();
        if (db) {
          const citationGraph = new PatternCitationGraph(db);
          const promoted = await deps.getPattern(patternId);
          if (promoted) {
            const peers = await deps.searchPatterns('', {
              domain: promoted.qeDomain, tier: 'long-term', limit: 20,
            });
            if (peers.success) {
              for (const { pattern: peer } of peers.value) {
                if (peer.id !== patternId) {
                  citationGraph.recordCoOccurrence(patternId, peer.id);
                }
              }
            }
          }
        }
      } catch (e) {
        logger.warn('Citation graph update failed (non-fatal)', {
          error: toErrorMessage(e),
        });
      }
    }

    if (deps.rvfDualWriter) {
      try {
        const promoted = await deps.getPattern(patternId);
        if (promoted?.embedding && promoted.embedding.length > 0) {
          deps.rvfDualWriter.writePattern(patternId, promoted.embedding);
        }
      } catch (rvfErr) {
        logger.warn('RVF dual-write on promote failed (non-fatal)', {
          patternId,
          error: toErrorMessage(rvfErr),
        });
      }
    }

    getWitnessChain()
      .then((wc) =>
        wc.append('PATTERN_PROMOTE', { patternId }, 'reasoning-bank'),
      )
      .catch((e) => {
        logger.warn('Witness chain PATTERN_PROMOTE failed', {
          error: toErrorMessage(e),
        });
      });
    logger.info('Promoted pattern to long-term', { patternId });
    if (deps.eventBus) {
      await deps.eventBus.publish({
        id: `pattern-promoted-${patternId}`,
        type: 'pattern:promoted',
        timestamp: new Date(),
        source: 'learning-optimization',
        payload: { patternId, newTier: 'long-term' },
      });
    }
  } else {
    logger.error('Failed to promote pattern', result.error, { patternId });
  }
}

// ============================================================================
// Cross-Domain Seeding
// ============================================================================

/**
 * Dependencies for cross-domain seeding
 */
export interface SeedingDeps {
  searchPatterns: (
    query: string | number[],
    options?: Record<string, unknown>,
  ) => Promise<Result<PatternSearchResult[]>>;
  storePattern: (
    options: Record<string, unknown>,
  ) => Promise<Result<QEPattern>>;
  patternStore: IPatternStore;
}

/**
 * Seed cross-domain patterns by transferring generalizable patterns
 * from populated domains to their related domains.
 */
export async function seedCrossDomainPatterns(
  deps: SeedingDeps,
): Promise<{ transferred: number; skipped: number }> {
  const stats = await deps.patternStore.getStats();
  let transferred = 0;
  let skipped = 0;

  for (const [sourceDomainStr, targetDomains] of Object.entries(
    RELATED_DOMAINS,
  )) {
    const sourceDomain = sourceDomainStr as QEDomain;
    const sourceCount = stats.byDomain[sourceDomain] || 0;
    if (sourceCount === 0) continue;

    const sourceResult = await deps.searchPatterns('', {
      domain: sourceDomain,
      limit: 50,
    });

    if (!sourceResult.success) continue;

    for (const targetDomain of targetDomains) {
      const targetCount = stats.byDomain[targetDomain] || 0;
      if (targetCount >= sourceCount) {
        skipped++;
        continue;
      }

      for (const { pattern: sourcePattern } of sourceResult.value) {
        const existingCheck = await deps.searchPatterns(sourcePattern.name, {
          domain: targetDomain,
          limit: 1,
        });

        if (existingCheck.success && existingCheck.value.length > 0) {
          const bestMatch = existingCheck.value[0];
          if (bestMatch.score > 0.8) {
            skipped++;
            continue;
          }
        }

        const transferredConfidence = Math.max(
          0.3,
          (sourcePattern.confidence || 0.5) * 0.8,
        );
        const transferResult = await deps.storePattern({
          patternType: sourcePattern.patternType,
          qeDomain: targetDomain,
          name: `${sourcePattern.name} (from ${sourceDomain})`,
          description: `${sourcePattern.description} [Transferred from ${sourceDomain} domain]`,
          template: sourcePattern.template,
          context: {
            ...sourcePattern.context,
            relatedDomains: [sourceDomain, targetDomain],
            tags: [
              ...sourcePattern.context.tags,
              'cross-domain-transfer',
              `source:${sourceDomain}`,
            ],
          },
          confidence: transferredConfidence,
        });

        if (transferResult.success) {
          transferred++;
        } else {
          skipped++;
        }
      }
    }
  }

  logger.info('Cross-domain transfer complete', { transferred, skipped });
  return { transferred, skipped };
}

// ============================================================================
// Pattern Citation Graph & PageRank Scoring (R8, ADR-087)
// ============================================================================

/** SQLite schema for pattern citation graph edges */
export const PATTERN_CITATIONS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS pattern_citations (
    source_pattern_id TEXT NOT NULL,
    target_pattern_id TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    relationship TEXT NOT NULL DEFAULT 'co-occurrence',
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (source_pattern_id, target_pattern_id)
  );
  CREATE INDEX IF NOT EXISTS idx_citations_source ON pattern_citations(source_pattern_id);
  CREATE INDEX IF NOT EXISTS idx_citations_target ON pattern_citations(target_pattern_id);
`;

/**
 * Manages the pattern citation graph in SQLite. Handles schema initialization,
 * recording co-occurrence edges, and building PatternGraph for PageRank.
 */
export class PatternCitationGraph {
  private initialized = false;

  constructor(private readonly db: DatabaseType) {}

  /** Ensure the pattern_citations table exists */
  ensureSchema(): void {
    if (this.initialized) return;
    this.db.exec(PATTERN_CITATIONS_SCHEMA);
    this.initialized = true;
  }

  /**
   * Record that two patterns co-occurred in the same assessment/session.
   * Increments weight if the edge already exists (stronger co-occurrence).
   */
  recordCoOccurrence(patternIdA: string, patternIdB: string): void {
    this.ensureSchema();
    // Canonical ordering so (A,B) and (B,A) map to the same edge
    const [src, tgt] = patternIdA < patternIdB
      ? [patternIdA, patternIdB]
      : [patternIdB, patternIdA];

    this.db.prepare(`
      INSERT INTO pattern_citations (source_pattern_id, target_pattern_id, weight, relationship)
      VALUES (?, ?, 1.0, 'co-occurrence')
      ON CONFLICT(source_pattern_id, target_pattern_id)
      DO UPDATE SET weight = weight + 1.0
    `).run(src, tgt);
  }

  /**
   * Record that pattern B was derived from or supersedes pattern A.
   */
  recordDerivation(sourcePatternId: string, derivedPatternId: string): void {
    this.ensureSchema();
    this.db.prepare(`
      INSERT INTO pattern_citations (source_pattern_id, target_pattern_id, weight, relationship)
      VALUES (?, ?, 2.0, 'derivation')
      ON CONFLICT(source_pattern_id, target_pattern_id)
      DO UPDATE SET weight = MAX(weight, 2.0), relationship = 'derivation'
    `).run(sourcePatternId, derivedPatternId);
  }

  /**
   * Build a PatternGraph from all citation edges in the database.
   * Returns the graph ready for PageRank computation.
   */
  buildGraph(): PatternGraph {
    this.ensureSchema();
    const rows = this.db.prepare(
      `SELECT source_pattern_id, target_pattern_id, weight, relationship FROM pattern_citations`
    ).all() as Array<{ source_pattern_id: string; target_pattern_id: string; weight: number; relationship: string }>;

    // Collect unique node IDs
    const nodeSet = new Set<string>();
    for (const row of rows) {
      nodeSet.add(row.source_pattern_id);
      nodeSet.add(row.target_pattern_id);
    }
    const nodes = Array.from(nodeSet);
    const nodeIndex = new Map<string, number>();
    nodes.forEach((id, i) => nodeIndex.set(id, i));

    // Build directed edges (both directions for undirected co-occurrence)
    const edges: Array<[number, number, number]> = [];
    for (const row of rows) {
      const si = nodeIndex.get(row.source_pattern_id)!;
      const ti = nodeIndex.get(row.target_pattern_id)!;
      edges.push([si, ti, row.weight]);
      if (row.relationship === 'co-occurrence') {
        edges.push([ti, si, row.weight]); // bidirectional for co-occurrence
      }
    }

    return { nodes, edges };
  }

  /**
   * Bootstrap the citation graph from existing pattern data.
   *
   * Sources:
   * 1. Same-domain co-occurrence: patterns in the same qe_domain are linked
   *    (weight = 1.0 per shared domain, reflecting that they co-occur in
   *    assessments for that domain).
   * 2. Existing pattern_relationships: "merged" relationships become derivation
   *    edges (weight = 2.0).
   *
   * This is idempotent — uses INSERT OR IGNORE so repeated calls don't
   * create duplicate edges (but also don't increment weights).
   *
   * @returns Number of edges created
   */
  bootstrapFromExistingData(): number {
    this.ensureSchema();
    let edgesCreated = 0;

    // 1. Same-domain co-occurrence from qe_patterns
    // Group patterns by domain, then create pairwise edges within each domain
    const domainGroups = this.db.prepare(`
      SELECT id, qe_domain FROM qe_patterns WHERE qe_domain IS NOT NULL ORDER BY qe_domain
    `).all() as Array<{ id: string; qe_domain: string }>;

    const byDomain = new Map<string, string[]>();
    for (const row of domainGroups) {
      const group = byDomain.get(row.qe_domain) ?? [];
      group.push(row.id);
      byDomain.set(row.qe_domain, group);
    }

    const insertCoOccurrence = this.db.prepare(`
      INSERT OR IGNORE INTO pattern_citations (source_pattern_id, target_pattern_id, weight, relationship)
      VALUES (?, ?, 1.0, 'co-occurrence')
    `);

    const insertBatch = this.db.transaction((pairs: Array<[string, string]>) => {
      for (const [a, b] of pairs) {
        const result = insertCoOccurrence.run(a, b);
        if (result.changes > 0) edgesCreated++;
      }
    });

    const pairs: Array<[string, string]> = [];
    for (const [, ids] of byDomain) {
      // Create pairwise edges (canonical ordering, cap at 50 patterns per domain
      // to avoid O(n^2) blowup for large domains)
      const capped = ids.slice(0, 50);
      for (let i = 0; i < capped.length; i++) {
        for (let j = i + 1; j < capped.length; j++) {
          const [src, tgt] = capped[i] < capped[j]
            ? [capped[i], capped[j]]
            : [capped[j], capped[i]];
          pairs.push([src, tgt]);
        }
      }
    }
    insertBatch(pairs);

    // 2. Existing pattern_relationships → derivation edges
    const relationships = this.db.prepare(`
      SELECT source_pattern_id, target_pattern_id, relationship_type
      FROM pattern_relationships
      WHERE relationship_type IN ('merged', 'derived', 'superseded')
    `).all() as Array<{ source_pattern_id: string; target_pattern_id: string; relationship_type: string }>;

    const insertDerivation = this.db.prepare(`
      INSERT OR IGNORE INTO pattern_citations (source_pattern_id, target_pattern_id, weight, relationship)
      VALUES (?, ?, 2.0, 'derivation')
    `);

    for (const rel of relationships) {
      const result = insertDerivation.run(rel.source_pattern_id, rel.target_pattern_id);
      if (result.changes > 0) edgesCreated++;
    }

    return edgesCreated;
  }

  /** Get the number of citation edges */
  getEdgeCount(): number {
    this.ensureSchema();
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM pattern_citations').get() as { cnt: number };
    return row.cnt;
  }
}

/**
 * Compute blended importance scores using PageRank over the citation graph
 * combined with the existing weighted quality formula.
 *
 * Blending: final = (1 - alpha) * qualityScore + alpha * pageRankScore
 *
 * @param patterns - Patterns to score
 * @param citationGraph - The pattern citation graph (from PatternCitationGraph.buildGraph())
 * @param alpha - Blend weight for PageRank (0 = ignore, 1 = only PageRank)
 */
export function computeBlendedImportance(
  patterns: Array<{ id: string; confidence: number; usageCount: number; successRate: number }>,
  citationGraph: PatternGraph,
  alpha = 0.3,
): Map<string, number> {
  const result = new Map<string, number>();

  if (!getRuVectorFeatureFlags().useSublinearSolver) {
    for (const p of patterns) {
      result.set(p.id, calculateQualityScore(p));
    }
    return result;
  }

  const qualityScores = new Map<string, number>();
  for (const p of patterns) {
    qualityScores.set(p.id, calculateQualityScore(p));
  }

  if (citationGraph.nodes.length < 3 || citationGraph.edges.length < 2) {
    return qualityScores;
  }

  const solver = new PageRankSolver();
  const pageRankScores = solver.computeImportance(citationGraph);

  for (const p of patterns) {
    const quality = qualityScores.get(p.id) ?? 0;
    const pageRank = pageRankScores.get(p.id) ?? 0;
    const normalizedPR = pageRank * citationGraph.nodes.length;
    result.set(p.id, (1 - alpha) * quality + alpha * Math.min(normalizedPR, 1));
  }

  return result;
}
