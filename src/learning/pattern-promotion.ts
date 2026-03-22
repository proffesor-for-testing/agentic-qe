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
import { shouldPromotePattern } from './qe-patterns.js';
import type { PatternStore, PatternSearchResult } from './pattern-store.js';
import type { SQLitePatternStore } from './sqlite-persistence.js';
import { getWitnessChain } from '../audit/witness-chain.js';
import type { RvfDualWriter } from '../integrations/ruvector/rvf-dual-writer.js';
import type { PromotionBlockedEvent } from './qe-reasoning-bank-types.js';
import { RELATED_DOMAINS } from './agent-routing.js';
import type { Result } from '../shared/types/index.js';

const logger: Logger = LoggerFactory.create('PatternPromotion');

// ============================================================================
// Promotion Logic (ADR-052)
// ============================================================================

/**
 * Dependencies needed for promotion checks
 */
export interface PromotionDeps {
  patternStore: PatternStore;
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
  patternStore: PatternStore;
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
