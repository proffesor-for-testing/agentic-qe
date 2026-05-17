/**
 * Agentic QE v3 - Learning Consolidation Worker
 * ADR-014: Background Workers for QE Monitoring
 * Phase 7: Continuous Learning Loop
 *
 * Consolidates learning patterns across domains including:
 * - Cross-domain pattern aggregation
 * - Strategy optimization
 * - Knowledge distillation
 * - Pattern pruning and deduplication
 * - Experience-based pattern extraction (Phase 7)
 * - Pattern promotion/deprecation lifecycle (Phase 7)
 * - Quality feedback loops (Phase 7)
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';
import { DomainName, ALL_DOMAINS } from '../../shared/types';
import {
  LearningOptimizationAPI,
  LearningOptimizationExtendedAPI,
} from '../../domains/learning-optimization/plugin';
import { TimeRange } from '../../shared/value-objects/index.js';
import { DreamEngine, type EngineResult as DreamCycleResult, type PatternImportData } from '../../learning/dream/index.js';
import {
  PatternLifecycleManager,
  createPatternLifecycleManager,
  type PatternCandidate,
  type PatternLifecycleStats,
} from '../../learning/pattern-lifecycle.js';
import { getUnifiedMemory } from '../../kernel/unified-memory.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { ExperienceConsolidator } from '../../learning/experience-consolidation.js';
import { recordLoopHealth } from '../../learning/loop-health.js';
import { pruneStaleDreamInsights } from '../../learning/dream/dream-insights-pruner.js';

const CONFIG: WorkerConfig = {
  id: 'learning-consolidation',
  name: 'Learning Consolidation',
  description: 'Consolidates learning patterns across domains and optimizes strategies',
  intervalMs: 30 * 60 * 1000, // 30 minutes
  priority: 'normal',
  targetDomains: ['learning-optimization'],
  enabled: true,
  timeoutMs: 300000,
  retryCount: 2,
  retryDelayMs: 30000,
};

interface LearningPattern {
  id: string;
  domain: DomainName;
  type: string;
  pattern: string;
  confidence: number;
  occurrences: number;
  lastSeen: Date;
  effectiveness: number;
}

interface ConsolidationResult {
  patternsAnalyzed: number;
  patternsPruned: number;
  patternsConsolidated: number;
  newInsights: number;
  strategyUpdates: number;
  crossDomainPatterns: number;
  /** ADR-046: Dream cycle insights */
  dreamInsights: number;
  dreamPatternsCreated: number;
  /** Phase 7: Continuous Learning Loop metrics */
  experiencesProcessed: number;
  patternCandidatesFound: number;
  patternsPromoted: number;
  patternsDeprecated: number;
  confidenceDecayApplied: number;
  /** Experience consolidation metrics */
  experiencesMerged: number;
  experiencesArchived: number;
  /**
   * #486 Gap A: experiences mined into learning:pattern:* kv via
   * LearningCoordinatorService.mineExperiences. Without this step, the
   * `learning:pattern:*` kv stays empty even after the bridge feeds
   * captured_experiences → learning:experience:* kv, because nothing
   * else auto-triggers `mineExperiences` in default deployments.
   */
  patternsMined: number;
  /** Number of domains that successfully advanced their cursor this tick. */
  domainsMined: number;
  /**
   * #488 C.2: count of stale unapplied dream_insights rows deleted on
   * this tick. Zero on most ticks once steady-state is reached.
   */
  dreamInsightsPruned: number;
}

/**
 * #486 Gap A: per-domain watermark for the mineExperiences sweep.
 * Stored at `learning:consolidation-cursor:{domain}` as an ISO timestamp.
 * Advances only on successful mining with non-zero experiences — failures
 * leave the cursor untouched so the next tick retries the same window.
 */
const CONSOLIDATION_CURSOR_PREFIX = 'learning:consolidation-cursor:';
const DEFAULT_LOOKBACK_DAYS = 1;

/**
 * #488 C.2: retention window for `applied = 0` dream insights. Matches the
 * `staleDaysThreshold` used by `pattern-lifecycle.ts` for consistency.
 */
const DREAM_INSIGHTS_RETENTION_DAYS = 30;

export class LearningConsolidationWorker extends BaseWorker {
  private lifecycleManager: PatternLifecycleManager | null = null;
  private lastRunTimestamp: number = 0;

  constructor() {
    super(CONFIG);
  }

  /**
   * Initialize or get the pattern lifecycle manager
   */
  private async getLifecycleManager(): Promise<PatternLifecycleManager | null> {
    if (this.lifecycleManager) {
      return this.lifecycleManager;
    }

    try {
      const unifiedMemory = getUnifiedMemory();
      await unifiedMemory.initialize();
      const db = unifiedMemory.getDatabase();
      this.lifecycleManager = createPatternLifecycleManager(db, {
        promotionRewardThreshold: 0.7,
        promotionMinOccurrences: 2,
        promotionMinSuccessRate: 0.7,
        deprecationFailureThreshold: 3,
        staleDaysThreshold: 30,
        confidenceDecayRate: 0.01,
        minActiveConfidence: 0.3,
      });
      return this.lifecycleManager;
    } catch (error) {
      console.warn('[LearningConsolidation] Failed to initialize lifecycle manager:', error);
      return null;
    }
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting learning consolidation (Phase 7: Continuous Learning Loop)');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    // #491 Bug 4a: liveness must be reported on every tick, including the
    // failure path. Before this fix, `recordLoopHealth(success:true)` sat
    // *after* `collectPatterns()`, which throws on installs with nothing
    // to consolidate — so loop-health permanently showed `never-ran`
    // even when the worker executed every cycle. Track success in a flag
    // and emit the ping in `finally` (matches the
    // CapturedExperienceBridge.drainSafe pattern that ships correctly).
    let liveness: { success: boolean; error?: string } = { success: false };
    try {
      // Initialize Phase 7 metrics
      let experiencesProcessed = 0;
      let patternCandidatesFound = 0;
      let patternsPromoted = 0;
      let patternsDeprecated = 0;
      let confidenceDecayApplied = 0;
      let patternsMined = 0;
      let domainsMined = 0;
      let dreamInsightsPruned = 0;

      // Phase 7: Run continuous learning loop
      const lifecycleManager = await this.getLifecycleManager();
      if (lifecycleManager) {
        const lifecycleResult = await this.runContinuousLearningLoop(
          context,
          lifecycleManager,
          findings,
          recommendations
        );
        experiencesProcessed = lifecycleResult.experiencesProcessed;
        patternCandidatesFound = lifecycleResult.patternCandidatesFound;
        patternsPromoted = lifecycleResult.patternsPromoted;
        patternsDeprecated = lifecycleResult.patternsDeprecated;
        confidenceDecayApplied = lifecycleResult.confidenceDecayApplied;
        patternsMined = lifecycleResult.patternsMined;
        domainsMined = lifecycleResult.domainsMined;
        dreamInsightsPruned = lifecycleResult.dreamInsightsPruned;
      }

      // Collect patterns from all domains
      const patterns = await this.collectPatterns(context);

      // Consolidate and analyze
      const result = await this.consolidatePatterns(context, patterns);

      // Add Phase 7 metrics to result
      result.experiencesProcessed = experiencesProcessed;
      result.patternCandidatesFound = patternCandidatesFound;
      result.patternsPromoted = patternsPromoted;
      result.patternsDeprecated = patternsDeprecated;
      result.confidenceDecayApplied = confidenceDecayApplied;
      result.patternsMined = patternsMined;
      result.domainsMined = domainsMined;
      result.dreamInsightsPruned = dreamInsightsPruned;

      // Identify cross-domain patterns
      this.identifyCrossDomainPatterns(patterns, findings, recommendations);

      // Prune ineffective patterns
      this.pruneIneffectivePatterns(patterns, findings, recommendations);

      // Generate optimization recommendations
      this.generateOptimizations(patterns, findings, recommendations);

      // ADR-046: Run dream cycle for pattern discovery
      const dreamResult = await this.runDreamCycle(context, patterns, findings, recommendations);
      result.dreamInsights = dreamResult.insights;
      result.dreamPatternsCreated = dreamResult.patternsCreated;

      // Store consolidated results
      await context.memory.set('learning:lastConsolidation', result);
      await context.memory.set('learning:consolidatedPatterns', patterns);

      // Reached the end without throwing — this tick is a real success.
      liveness = { success: true };

      // Update last run timestamp for decay calculation
      this.lastRunTimestamp = Date.now();

      const healthScore = this.calculateHealthScore(result, patterns);

      context.logger.info('Learning consolidation complete', {
        healthScore,
        patternsAnalyzed: result.patternsAnalyzed,
        newInsights: result.newInsights,
        // Phase 7 metrics
        experiencesProcessed,
        patternsPromoted,
        patternsDeprecated,
      });

      return this.createResult(
        Date.now() - startTime,
        {
          itemsAnalyzed: result.patternsAnalyzed,
          issuesFound: result.patternsPruned + result.patternsDeprecated,
          healthScore,
          trend: this.determineTrend(result),
          domainMetrics: {
            patternsAnalyzed: result.patternsAnalyzed,
            patternsPruned: result.patternsPruned,
            patternsConsolidated: result.patternsConsolidated,
            newInsights: result.newInsights,
            crossDomainPatterns: result.crossDomainPatterns,
            // ADR-046: Dream cycle metrics
            dreamInsights: result.dreamInsights,
            dreamPatternsCreated: result.dreamPatternsCreated,
            // Phase 7: Continuous Learning Loop metrics
            experiencesProcessed: result.experiencesProcessed,
            patternCandidatesFound: result.patternCandidatesFound,
            patternsPromoted: result.patternsPromoted,
            patternsDeprecated: result.patternsDeprecated,
            confidenceDecayApplied: result.confidenceDecayApplied,
            // #486 Gap A: mineExperiences auto-trigger
            patternsMined: result.patternsMined,
            domainsMined: result.domainsMined,
            // #488 C.2: dream_insights retention pruning
            dreamInsightsPruned: result.dreamInsightsPruned,
          },
        },
        findings,
        recommendations
      );
    } catch (error) {
      // Record the failure shape and rethrow — BaseWorker handles
      // worker-level retry/error tracking via this throw.
      liveness = { success: false, error: error instanceof Error ? error.message : String(error) };
      throw error;
    } finally {
      // #491 Bug 4a: liveness must always reach the dashboard, even when
      // collectPatterns throws on empty installs. Best-effort — must not
      // throw or it would shadow the original error.
      try {
        await recordLoopHealth(context.memory, 'learningWorker', liveness);
      } catch (recordErr) {
        context.logger.warn('recordLoopHealth failed (non-fatal)', {
          error: recordErr instanceof Error ? recordErr.message : String(recordErr),
        });
      }
    }
  }

  /**
   * Phase 7: Run the continuous learning loop
   *
   * Architecture:
   * Task Execution -> Experience Capture -> Pattern Extraction -> Pattern Promotion -> Pattern Utilization -> Improved Routing
   */
  private async runContinuousLearningLoop(
    context: WorkerContext,
    lifecycleManager: PatternLifecycleManager,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): Promise<{
    experiencesProcessed: number;
    patternCandidatesFound: number;
    patternsPromoted: number;
    patternsDeprecated: number;
    confidenceDecayApplied: number;
    patternsMined: number;
    domainsMined: number;
    dreamInsightsPruned: number;
  }> {
    context.logger.info('Running continuous learning loop (Phase 7)');

    let experiencesProcessed = 0;
    let patternCandidatesFound = 0;
    let patternsPromoted = 0;
    let patternsDeprecated = 0;
    let confidenceDecayApplied = 0;
    let patternsMined = 0;
    let domainsMined = 0;
    let dreamInsightsPruned = 0;

    try {
      // Step 1: Extract patterns from recent experiences
      const experiences = lifecycleManager.getRecentExperiences({
        minReward: 0.7,
        limit: 100,
        sinceDays: 7,
      });
      experiencesProcessed = experiences.length;

      if (experiences.length > 0) {
        context.logger.debug('Processing recent experiences', { count: experiences.length });

        // Step 2: Identify pattern candidates
        const candidates = lifecycleManager.findPatternCandidates(experiences);
        patternCandidatesFound = candidates.length;

        if (candidates.length > 0) {
          // Create patterns from candidates
          const createdCount = await this.createPatternsFromCandidates(candidates);

          findings.push({
            type: 'pattern-extraction',
            severity: 'info',
            domain: 'learning-optimization',
            title: 'New Patterns Extracted from Experiences',
            description: `${createdCount} new patterns extracted from ${experiencesProcessed} high-reward experiences`,
            context: {
              candidatesFound: patternCandidatesFound,
              patternsCreated: createdCount,
              topCandidate: candidates[0]?.name,
            },
          });
        }
      }

      // Step 3: Promote eligible patterns
      const promotionResult = lifecycleManager.promoteEligiblePatterns();
      patternsPromoted = promotionResult.promoted;

      if (patternsPromoted > 0) {
        findings.push({
          type: 'pattern-promotion',
          severity: 'info',
          domain: 'learning-optimization',
          title: 'Patterns Promoted to Long-Term',
          description: `${patternsPromoted} patterns promoted after meeting quality thresholds`,
          context: {
            checked: promotionResult.checked,
            promoted: patternsPromoted,
          },
        });
      }

      // Step 4: Deprecate underperforming patterns
      const deprecationResult = lifecycleManager.deprecateStalePatterns();
      patternsDeprecated = deprecationResult.deprecated;

      if (patternsDeprecated > 0) {
        findings.push({
          type: 'pattern-deprecation',
          severity: 'low',
          domain: 'learning-optimization',
          title: 'Underperforming Patterns Deprecated',
          description: `${patternsDeprecated} patterns deprecated due to failures, staleness, or low confidence`,
          context: {
            checked: deprecationResult.checked,
            deprecated: patternsDeprecated,
          },
        });

        recommendations.push({
          priority: 'p3',
          domain: 'learning-optimization',
          action: 'Review Deprecated Patterns',
          description: `${patternsDeprecated} patterns were deprecated. Review for potential recovery or permanent removal.`,
          estimatedImpact: 'low',
          effort: 'low',
          autoFixable: false,
        });
      }

      // Step 4.5: Consolidate experiences (merge similar, reinforce quality, archive valueless)
      try {
        const unifiedMemory = getUnifiedMemory();
        const db = unifiedMemory.getDatabase();
        const consolidator = new ExperienceConsolidator();
        await consolidator.initialize(db);

        const consolidationResult = await consolidator.consolidateAll();

        if (consolidationResult.merged > 0 || consolidationResult.archived > 0) {
          findings.push({
            type: 'experience-consolidation',
            severity: 'info',
            domain: 'learning-optimization',
            title: 'Experiences Consolidated',
            description: `${consolidationResult.merged} merged, ${consolidationResult.archived} archived across ${consolidationResult.domainsProcessed.length} domains`,
            context: {
              merged: consolidationResult.merged,
              archived: consolidationResult.archived,
              activeRemaining: consolidationResult.activeRemaining,
              domains: consolidationResult.domainsProcessed,
            },
          });
        }
      } catch (consolidationError) {
        context.logger.warn('Experience consolidation failed', {
          error: toErrorMessage(consolidationError),
        });
      }

      // Step 5: Apply confidence decay
      const daysSinceLastRun = this.lastRunTimestamp > 0
        ? (Date.now() - this.lastRunTimestamp) / (1000 * 60 * 60 * 24)
        : 1;

      if (daysSinceLastRun >= 0.5) { // Apply decay at least twice per day
        const decayResult = lifecycleManager.applyConfidenceDecay(Math.min(daysSinceLastRun, 7));
        confidenceDecayApplied = decayResult.decayed;
      }

      // Step 6: Generate lifecycle statistics finding
      const stats = lifecycleManager.getStats();
      this.addLifecycleStatsFinding(stats, findings, recommendations);

      // Step 7 (#486 Gap A): mine experiences per domain so `learning:pattern:*`
      // kv stays current. Without this, the kv stays empty even after the
      // bridge has populated `learning:experience:*` — no other code path
      // auto-fires `mineExperiences` in default deployments.
      try {
        const miningResult = await this.mineExperiencesPerDomain(context, findings);
        patternsMined = miningResult.patternsMined;
        domainsMined = miningResult.domainsMined;
      } catch (miningError) {
        context.logger.warn('Pattern mining sweep failed', {
          error: toErrorMessage(miningError),
        });
      }

      // Step 8 (#488 C.2): prune stale unapplied dream_insights so the
      // table doesn't grow unbounded. Applied insights are part of the
      // pattern-change audit trail and stay forever.
      try {
        const unifiedMemory = getUnifiedMemory();
        const db = unifiedMemory.getDatabase();
        const pruneResult = pruneStaleDreamInsights(db, {
          retentionDays: DREAM_INSIGHTS_RETENTION_DAYS,
        });
        dreamInsightsPruned = pruneResult.pruned;
        if (dreamInsightsPruned > 0) {
          findings.push({
            type: 'dream-insights-pruned',
            severity: 'info',
            domain: 'learning-optimization',
            title: 'Stale Dream Insights Pruned',
            description: `${dreamInsightsPruned} unapplied dream insights older than ${DREAM_INSIGHTS_RETENTION_DAYS} days deleted`,
            context: {
              pruned: dreamInsightsPruned,
              retentionDays: DREAM_INSIGHTS_RETENTION_DAYS,
            },
          });
        }
      } catch (pruneError) {
        context.logger.warn('Dream insights pruning failed', {
          error: toErrorMessage(pruneError),
        });
      }

      context.logger.info('Continuous learning loop complete', {
        experiencesProcessed,
        patternCandidatesFound,
        patternsPromoted,
        patternsDeprecated,
        confidenceDecayApplied,
        patternsMined,
        domainsMined,
        dreamInsightsPruned,
      });
    } catch (error) {
      context.logger.warn('Continuous learning loop partially failed', {
        error: toErrorMessage(error),
      });
    }

    return {
      experiencesProcessed,
      patternCandidatesFound,
      patternsPromoted,
      patternsDeprecated,
      confidenceDecayApplied,
      patternsMined,
      domainsMined,
      dreamInsightsPruned,
    };
  }

  /**
   * #486 Gap A: mine experiences into `learning:pattern:*` kv per domain.
   *
   * The producer side of the learning-optimization domain pipeline:
   *
   *   captured_experiences (SQLite)
   *     → bridge drain → learning.ExperienceCaptured event
   *       → handleExperienceCaptured → recordExperience
   *         → learning:experience:* kv (✓ working post-v3.9.29)
   *           → mineExperiences (THIS STEP)
   *             → extractPatternsFromExperiences → learnPattern → storePattern
   *               → learning:pattern:* kv
   *
   * Without this step the chain ends at the experience kv, so `getPatternStats`
   * reports zero patterns and the `LearningConsolidationWorker.collectPatterns`
   * step a few lines above throws "No learning patterns to consolidate yet".
   *
   * Per-domain cursor avoids re-processing the same experiences (which would
   * duplicate-write since `learnPattern` uses uuidv4 for pattern IDs). Cursor
   * is stored in WorkerMemory under `learning:consolidation-cursor:{domain}`
   * as an ISO timestamp. On first run, the cursor defaults to `now - 1 day`
   * to match the lookback used elsewhere by `runLearningCycle`.
   *
   * Failures are isolated per domain — one bad domain doesn't block others.
   * On failure or empty mining the cursor stays put so the next tick retries
   * the same window with new experiences.
   */
  private async mineExperiencesPerDomain(
    context: WorkerContext,
    findings: WorkerFinding[]
  ): Promise<{ patternsMined: number; domainsMined: number }> {
    const learningAPI = context.domains.getDomainAPI<LearningOptimizationExtendedAPI>(
      'learning-optimization'
    );
    if (!learningAPI || typeof learningAPI.getLearningService !== 'function') {
      // The learning-optimization domain isn't available in this fleet config;
      // the worker still has lifecycle work to do, so this is non-fatal.
      context.logger.debug('mineExperiencesPerDomain: learning-optimization API unavailable');
      return { patternsMined: 0, domainsMined: 0 };
    }

    const learningService = learningAPI.getLearningService();
    if (!learningService) {
      context.logger.debug('mineExperiencesPerDomain: learning service not initialized');
      return { patternsMined: 0, domainsMined: 0 };
    }

    const now = new Date();
    let patternsMined = 0;
    let domainsMined = 0;

    for (const domain of ALL_DOMAINS) {
      const cursorKey = `${CONSOLIDATION_CURSOR_PREFIX}${domain}`;
      let start: Date;
      try {
        const cursorIso = await context.memory.get<string>(cursorKey);
        if (cursorIso) {
          const parsed = new Date(cursorIso);
          // Guard against corrupted cursor or clock skew: never look back further
          // than DEFAULT_LOOKBACK_DAYS, never look ahead.
          if (!isNaN(parsed.getTime()) && parsed < now) {
            const earliest = new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
            start = parsed > earliest ? parsed : earliest;
          } else {
            start = new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
          }
        } else {
          start = new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        }
      } catch {
        // Cursor read failure is non-fatal — fall back to the default window.
        start = new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      }

      try {
        const timeRange = TimeRange.create(start, now);
        const result = await learningService.mineExperiences(domain, timeRange);
        if (!result.success) {
          context.logger.debug(`mineExperiences failed for ${domain}`, {
            error: toErrorMessage(result.error),
          });
          continue;
        }

        const { experienceCount, patterns } = result.value;
        if (experienceCount > 0) {
          patternsMined += patterns.length;
          domainsMined++;
          // Only advance the cursor when we actually processed experiences —
          // otherwise an empty window would falsely consume a fresh experience
          // arriving milliseconds later. Cursor advances to `now`, not to
          // `last experience timestamp`, because the kv index uses
          // `learning:experience:index:domain:{d}:*` keys without a per-key
          // timestamp we can read here.
          await context.memory.set(cursorKey, now.toISOString());
        }
      } catch (domainError) {
        context.logger.debug(`mineExperiences threw for ${domain}`, {
          error: toErrorMessage(domainError),
        });
        // Cursor untouched on throw — retry next tick.
      }
    }

    if (patternsMined > 0) {
      findings.push({
        type: 'pattern-mining',
        severity: 'info',
        domain: 'learning-optimization',
        title: 'Patterns Mined from Experience Replay',
        description: `${patternsMined} patterns mined into learning:pattern:* kv across ${domainsMined} domain(s) since their last consolidation tick`,
        context: {
          patternsMined,
          domainsMined,
          lookbackDays: DEFAULT_LOOKBACK_DAYS,
        },
      });
    }

    return { patternsMined, domainsMined };
  }

  /**
   * Create patterns from pattern candidates
   */
  private async createPatternsFromCandidates(candidates: PatternCandidate[]): Promise<number> {
    let created = 0;

    try {
      const unifiedMemory = getUnifiedMemory();
      const db = unifiedMemory.getDatabase();

      for (const candidate of candidates) {
        try {
          const { v4: uuidv4 } = await import('uuid');
          const patternId = uuidv4();
          const description = `Auto-extracted pattern from ${candidate.sourceExperiences} experiences. Avg reward: ${candidate.avgReward.toFixed(3)}`;

          db.prepare(`
            INSERT INTO qe_patterns (
              id, pattern_type, qe_domain, domain, name, description,
              confidence, usage_count, success_rate, quality_score, tier,
              template_json, context_json, created_at, successful_uses
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
          `).run(
            patternId,
            candidate.patternType,
            candidate.domain,
            candidate.domain, // AQE domain same as QE domain
            candidate.name,
            description,
            candidate.confidence,
            candidate.sourceExperiences,
            candidate.successRate,
            candidate.confidence * 0.3 + (Math.min(candidate.sourceExperiences, 100) / 100) * 0.2 + candidate.successRate * 0.5,
            'short-term',
            JSON.stringify({
              type: 'workflow',
              content: candidate.templateContent,
              variables: [],
            }),
            JSON.stringify({
              tags: candidate.actions,
              sourceType: 'experience-extraction',
              extractedAt: new Date().toISOString(),
            }),
            Math.round(candidate.sourceExperiences * candidate.successRate)
          );

          // Pair the qe_patterns row with an embedding so HNSW pattern recall
          // doesn't see this as a "ghost" (ADR-058 embedding-locality). Fail-soft.
          const { ensurePatternEmbedding } = await import('../../learning/embed-and-insert-pattern.js');
          await ensurePatternEmbedding(db, patternId, candidate.name, description, candidate.actions);

          created++;
        } catch (error) {
          // Skip duplicates or other errors
          console.debug('[LearningConsolidation] Failed to create pattern:', error);
        }
      }
    } catch (error) {
      console.warn('[LearningConsolidation] Pattern creation batch failed:', error);
    }

    return created;
  }

  /**
   * Add lifecycle statistics finding
   */
  private addLifecycleStatsFinding(
    stats: PatternLifecycleStats,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    findings.push({
      type: 'lifecycle-stats',
      severity: 'info',
      domain: 'learning-optimization',
      title: 'Pattern Lifecycle Statistics',
      description: `Active: ${stats.activePatterns}, Promoted: ${stats.promotedPatterns}, Deprecated: ${stats.deprecatedPatterns}`,
      context: {
        total: stats.totalPatterns,
        active: stats.activePatterns,
        shortTerm: stats.shortTermPatterns,
        longTerm: stats.longTermPatterns,
        deprecated: stats.deprecatedPatterns,
        avgConfidence: stats.avgConfidence.toFixed(3),
        avgSuccessRate: stats.avgSuccessRate.toFixed(3),
        nearDeprecation: stats.patternsNearDeprecation,
      },
    });

    if (stats.patternsNearDeprecation > 0) {
      recommendations.push({
        priority: 'p2',
        domain: 'learning-optimization',
        action: 'Review At-Risk Patterns',
        description: `${stats.patternsNearDeprecation} patterns are near deprecation threshold. Consider improving their usage or archiving them.`,
        estimatedImpact: 'medium',
        effort: 'low',
        autoFixable: false,
      });
    }

    if (stats.avgSuccessRate < 0.6) {
      recommendations.push({
        priority: 'p2',
        domain: 'learning-optimization',
        action: 'Improve Pattern Quality',
        description: `Average success rate (${(stats.avgSuccessRate * 100).toFixed(1)}%) is below target. Focus on quality over quantity.`,
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: false,
      });
    }
  }

  /**
   * Determine trend based on results
   */
  private determineTrend(result: ConsolidationResult): 'improving' | 'stable' | 'degrading' {
    const promotionRatio = result.patternsPromoted / Math.max(1, result.patternsAnalyzed);
    const deprecationRatio = result.patternsDeprecated / Math.max(1, result.patternsAnalyzed);
    const extractionRatio = result.patternCandidatesFound / Math.max(1, result.experiencesProcessed);

    if (promotionRatio > 0.1 && extractionRatio > 0.2) {
      return 'improving';
    }
    if (deprecationRatio > 0.2 || result.patternsPruned > result.newInsights) {
      return 'degrading';
    }
    return 'stable';
  }

  private async collectPatterns(context: WorkerContext): Promise<LearningPattern[]> {
    const patterns: LearningPattern[] = [];
    const errors: string[] = [];

    // Query each domain for patterns via the learning-optimization domain API
    for (const domain of ALL_DOMAINS) {
      try {
        const domainPatterns = await this.getDomainPatterns(context, domain);
        patterns.push(...domainPatterns);
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        errors.push(`${domain}: ${errorMessage}`);
        context.logger.warn(`Failed to collect patterns from ${domain}`, { error });
      }
    }

    // If we got no patterns and encountered errors, that's a failure
    if (patterns.length === 0 && errors.length > 0) {
      throw new Error(
        `Failed to collect any learning patterns. Errors from domains: ${errors.join('; ')}. ` +
        'Ensure at least one domain is available and has pattern data.'
      );
    }

    // No patterns yet — common on fresh installs. The CapturedExperienceBridge
    // (issue #479) drains hook-fired captures into domain events, so patterns
    // accumulate as users do work. This worker has nothing to consolidate
    // until that pipeline produces stored patterns.
    if (patterns.length === 0) {
      throw new Error(
        'No learning patterns to consolidate yet. ' +
        'Patterns accumulate as the captured-experience bridge feeds hook ' +
        'activity into the learning-optimization domain — first runs may ' +
        'be empty until a kernel-owning process (CLI/MCP) has been alive ' +
        'long enough to drain the captured_experiences table.'
      );
    }

    return patterns;
  }

  private async getDomainPatterns(context: WorkerContext, domain: DomainName): Promise<LearningPattern[]> {
    // Try to get patterns from the learning-optimization domain service
    const learningAPI = context.domains.getDomainAPI<LearningOptimizationAPI>('learning-optimization');

    if (!learningAPI) {
      throw new Error(
        `Learning-optimization domain not available for ${domain} - cannot retrieve patterns. ` +
        'Ensure the learning-optimization domain is properly initialized.'
      );
    }

    const result = await learningAPI.getPatternStats(domain);

    if (!result.success) {
      throw new Error(
        `Failed to get pattern stats for ${domain}: Unknown error. ` +
        'Check domain service health and data availability.'
      );
    }

    if (!result.value || !result.value.topPatterns || result.value.topPatterns.length === 0) {
      // This is a warning case - domain exists but has no patterns yet
      // We'll let the parent method aggregate and decide if this is fatal
      context.logger.debug(`No patterns found for domain ${domain}`);
      return [];
    }

    // Convert PatternStats.topPatterns to LearningPattern format
    const stats = result.value;
    return stats.topPatterns.map(p => ({
      id: p.id,
      domain: p.domain,
      type: p.type,
      pattern: p.name,
      confidence: p.confidence,
      occurrences: p.usageCount,
      lastSeen: p.lastUsedAt,
      effectiveness: p.successRate,
    }));
  }

  private async consolidatePatterns(
    context: WorkerContext,
    patterns: LearningPattern[]
  ): Promise<ConsolidationResult> {
    let patternsPruned = 0;
    let patternsConsolidated = 0;
    let newInsights = 0;

    // Identify duplicates and merge
    const patternMap = new Map<string, LearningPattern[]>();
    for (const pattern of patterns) {
      const key = `${pattern.type}:${pattern.pattern}`;
      const existing = patternMap.get(key) || [];
      existing.push(pattern);
      patternMap.set(key, existing);
    }

    // Count consolidated patterns
    for (const [, group] of Array.from(patternMap.entries())) {
      if (group.length > 1) {
        patternsConsolidated += group.length - 1;
      }
    }

    // Prune low-confidence patterns
    const lowConfidencePatterns = patterns.filter(p => p.confidence < 0.5);
    patternsPruned = lowConfidencePatterns.length;

    // Identify new insights (patterns with high effectiveness and recency)
    const recentHighPerformers = patterns.filter(p => {
      const daysSinceLastSeen = (Date.now() - p.lastSeen.getTime()) / (24 * 60 * 60 * 1000);
      return p.effectiveness > 0.8 && daysSinceLastSeen < 7;
    });
    newInsights = recentHighPerformers.length;

    // Identify cross-domain patterns
    const crossDomain = this.findCrossDomainPatterns(patterns);

    // Store insights
    await context.memory.set('learning:insights', {
      recentHighPerformers,
      crossDomainPatterns: crossDomain,
      timestamp: new Date().toISOString(),
    });

    return {
      patternsAnalyzed: patterns.length,
      patternsPruned,
      patternsConsolidated,
      newInsights,
      strategyUpdates: 0,
      crossDomainPatterns: crossDomain.length,
      dreamInsights: 0, // Will be updated by runDreamCycle
      dreamPatternsCreated: 0, // Will be updated by runDreamCycle
      // Phase 7 metrics - will be updated by runContinuousLearningLoop
      experiencesProcessed: 0,
      patternCandidatesFound: 0,
      patternsPromoted: 0,
      patternsDeprecated: 0,
      confidenceDecayApplied: 0,
      // Experience consolidation metrics
      experiencesMerged: 0,
      experiencesArchived: 0,
      // #486 Gap A: filled in by runContinuousLearningLoop
      patternsMined: 0,
      domainsMined: 0,
      // #488 C.2: filled in by runContinuousLearningLoop
      dreamInsightsPruned: 0,
    };
  }

  /**
   * Run dream cycle for pattern discovery (ADR-046)
   *
   * The DreamEngine discovers novel associations between patterns
   * that may not be obvious from direct analysis.
   */
  private async runDreamCycle(
    context: WorkerContext,
    patterns: LearningPattern[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): Promise<{ insights: number; patternsCreated: number }> {
    // Skip dream cycle if we don't have enough patterns
    if (patterns.length < 10) {
      context.logger.debug('Skipping dream cycle - insufficient patterns', {
        patternCount: patterns.length,
        required: 10,
      });
      return { insights: 0, patternsCreated: 0 };
    }

    let engine: DreamEngine | null = null;

    try {
      // Initialize DreamEngine
      engine = new DreamEngine();
      await engine.initialize();

      // Import patterns as concepts
      const importData: PatternImportData[] = patterns.map(pattern => ({
        id: pattern.id,
        name: pattern.pattern,
        description: `${pattern.type} pattern from ${pattern.domain} (effectiveness: ${pattern.effectiveness})`,
        domain: pattern.domain,
        patternType: pattern.type,
        confidence: pattern.confidence,
        successRate: pattern.effectiveness,
      }));
      await engine.loadPatternsAsConcepts(importData);

      // Run the dream cycle
      context.logger.debug('Starting dream cycle', { patternCount: patterns.length });
      const dreamResult: DreamCycleResult = await engine.dream();

      // Process dream insights
      const actionableInsights = dreamResult.insights.filter(
        insight => insight.actionable && insight.confidenceScore > 0.7
      );

      if (actionableInsights.length > 0) {
        findings.push({
          type: 'dream-insights',
          severity: 'info',
          domain: 'learning-optimization',
          title: 'Dream Cycle Insights Generated',
          description: `${actionableInsights.length} actionable insights discovered through pattern association`,
          context: {
            totalInsights: dreamResult.insights.length,
            actionableInsights: actionableInsights.length,
            topInsight: actionableInsights[0]?.description,
            activationIterations: dreamResult.activationStats.totalIterations,
          },
        });

        recommendations.push({
          priority: 'p2',
          domain: 'learning-optimization',
          action: 'Apply Dream Insights',
          description: `${actionableInsights.length} insights from dream cycle can improve pattern effectiveness`,
          estimatedImpact: 'medium',
          effort: 'low',
          autoFixable: true,
        });
      }

      // Store dream insights in memory for later application
      await context.memory.set('learning:dreamInsights', {
        cycleId: dreamResult.cycle.id,
        insights: actionableInsights,
        timestamp: new Date().toISOString(),
      });

      context.logger.info('Dream cycle completed', {
        insights: dreamResult.insights.length,
        actionable: actionableInsights.length,
        duration: dreamResult.cycle.durationMs,
      });

      return {
        insights: dreamResult.insights.length,
        patternsCreated: dreamResult.patternsCreated,
      };
    } catch (error) {
      // Log but don't fail the consolidation on dream errors
      context.logger.warn('Dream cycle failed', {
        error: toErrorMessage(error),
      });
      return { insights: 0, patternsCreated: 0 };
    } finally {
      if (engine) {
        await engine.close();
      }
    }
  }

  private findCrossDomainPatterns(patterns: LearningPattern[]): Array<{
    pattern: string;
    domains: DomainName[];
    avgEffectiveness: number;
  }> {
    const patternGroups = new Map<string, LearningPattern[]>();

    for (const pattern of patterns) {
      const existing = patternGroups.get(pattern.type) || [];
      existing.push(pattern);
      patternGroups.set(pattern.type, existing);
    }

    const crossDomain: Array<{
      pattern: string;
      domains: DomainName[];
      avgEffectiveness: number;
    }> = [];

    for (const [type, group] of Array.from(patternGroups.entries())) {
      const domains = Array.from(new Set(group.map(p => p.domain)));
      if (domains.length >= 3) {
        crossDomain.push({
          pattern: type,
          domains,
          avgEffectiveness: group.reduce((sum, p) => sum + p.effectiveness, 0) / group.length,
        });
      }
    }

    return crossDomain;
  }

  private identifyCrossDomainPatterns(
    patterns: LearningPattern[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const crossDomain = this.findCrossDomainPatterns(patterns);

    if (crossDomain.length > 0) {
      findings.push({
        type: 'cross-domain-patterns',
        severity: 'info',
        domain: 'learning-optimization',
        title: 'Cross-Domain Patterns Identified',
        description: `${crossDomain.length} patterns are effective across multiple domains`,
        context: {
          patterns: crossDomain.map(p => ({
            type: p.pattern,
            domains: p.domains.length,
            effectiveness: p.avgEffectiveness.toFixed(2),
          })),
        },
      });

      recommendations.push({
        priority: 'p2',
        domain: 'learning-optimization',
        action: 'Leverage Cross-Domain Patterns',
        description: 'Apply successful cross-domain patterns to domains where they are not yet used.',
        estimatedImpact: 'medium',
        effort: 'low',
        autoFixable: true,
      });
    }
  }

  private pruneIneffectivePatterns(
    patterns: LearningPattern[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const ineffective = patterns.filter(p => p.effectiveness < 0.3 && p.occurrences > 10);
    const stale = patterns.filter(p => {
      const daysSinceLastSeen = (Date.now() - p.lastSeen.getTime()) / (24 * 60 * 60 * 1000);
      return daysSinceLastSeen > 30;
    });

    if (ineffective.length > 0) {
      findings.push({
        type: 'ineffective-patterns',
        severity: 'low',
        domain: 'learning-optimization',
        title: 'Ineffective Patterns Detected',
        description: `${ineffective.length} patterns have low effectiveness despite many occurrences`,
        context: {
          count: ineffective.length,
          domains: Array.from(new Set(ineffective.map(p => p.domain))),
        },
      });

      recommendations.push({
        priority: 'p3',
        domain: 'learning-optimization',
        action: 'Review Ineffective Patterns',
        description: 'Consider removing or refining patterns that consistently underperform.',
        estimatedImpact: 'low',
        effort: 'low',
        autoFixable: true,
      });
    }

    if (stale.length > 0) {
      findings.push({
        type: 'stale-patterns',
        severity: 'info',
        domain: 'learning-optimization',
        title: 'Stale Patterns Identified',
        description: `${stale.length} patterns have not been seen in over 30 days`,
        context: {
          count: stale.length,
        },
      });
    }
  }

  private generateOptimizations(
    patterns: LearningPattern[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    // Find domains with few patterns
    const patternsByDomain = new Map<DomainName, number>();
    for (const pattern of patterns) {
      patternsByDomain.set(pattern.domain, (patternsByDomain.get(pattern.domain) || 0) + 1);
    }

    const lowPatternDomains = ALL_DOMAINS.filter(d => (patternsByDomain.get(d) || 0) < 3);

    if (lowPatternDomains.length > 0) {
      findings.push({
        type: 'learning-gaps',
        severity: 'medium',
        domain: 'learning-optimization',
        title: 'Learning Gaps Identified',
        description: `${lowPatternDomains.length} domains have few learned patterns`,
        context: {
          domains: lowPatternDomains,
        },
      });

      recommendations.push({
        priority: 'p2',
        domain: 'learning-optimization',
        action: 'Improve Learning Coverage',
        description: `Focus learning efforts on domains with few patterns: ${lowPatternDomains.join(', ')}`,
        estimatedImpact: 'medium',
        effort: 'medium',
        autoFixable: false,
      });
    }

    // High-performing patterns to replicate
    const topPerformers = patterns
      .filter(p => p.effectiveness > 0.9 && p.occurrences > 20)
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 5);

    if (topPerformers.length > 0) {
      findings.push({
        type: 'top-patterns',
        severity: 'info',
        domain: 'learning-optimization',
        title: 'Top Performing Patterns',
        description: `${topPerformers.length} patterns show exceptional effectiveness`,
        context: {
          patterns: topPerformers.map(p => ({
            domain: p.domain,
            type: p.type,
            effectiveness: p.effectiveness.toFixed(2),
          })),
        },
      });
    }
  }

  private calculateHealthScore(result: ConsolidationResult, patterns: LearningPattern[]): number {
    if (patterns.length === 0) return 50;

    // Base score from average pattern effectiveness
    const avgEffectiveness = patterns.reduce((sum, p) => sum + p.effectiveness, 0) / patterns.length;
    let score = avgEffectiveness * 50;

    // Bonus for new insights
    score += Math.min(20, result.newInsights * 4);

    // Bonus for cross-domain patterns
    score += Math.min(15, result.crossDomainPatterns * 3);

    // ADR-046: Bonus for dream insights (novel pattern discovery)
    score += Math.min(10, result.dreamInsights * 2);

    // Penalty for pruned patterns (indicates churn)
    const pruneRate = result.patternsPruned / result.patternsAnalyzed;
    score -= pruneRate * 15;

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
