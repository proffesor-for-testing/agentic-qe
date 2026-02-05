/**
 * Agentic QE v3 - Pattern Lifecycle Management
 * Phase 7: Continuous Learning Loop
 *
 * Manages the full lifecycle of QE patterns including:
 * - Pattern promotion from short-term to long-term
 * - Pattern deprecation after failures
 * - Quality feedback loops
 * - Confidence decay over time
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import type { QEPattern, QEDomain, QEPatternType } from './qe-patterns.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Pattern lifecycle configuration
 */
export interface PatternLifecycleConfig {
  /** Minimum reward threshold for pattern promotion (0-1) */
  promotionRewardThreshold: number;

  /** Minimum occurrence count for pattern promotion */
  promotionMinOccurrences: number;

  /** Minimum success rate for pattern promotion (0-1) */
  promotionMinSuccessRate: number;

  /** Number of consecutive failures before deprecation */
  deprecationFailureThreshold: number;

  /** Days without use before pattern becomes stale */
  staleDaysThreshold: number;

  /** Daily confidence decay rate (0-1) */
  confidenceDecayRate: number;

  /** Minimum confidence to keep pattern active */
  minActiveConfidence: number;

  /** Maximum age in days before automatic deprecation review */
  maxAgeForActivePatterns: number;
}

/**
 * Default lifecycle configuration
 */
export const DEFAULT_LIFECYCLE_CONFIG: PatternLifecycleConfig = {
  promotionRewardThreshold: 0.7,
  promotionMinOccurrences: 2,
  promotionMinSuccessRate: 0.7,
  deprecationFailureThreshold: 3,
  staleDaysThreshold: 30,
  confidenceDecayRate: 0.01, // 1% per day
  minActiveConfidence: 0.3,
  maxAgeForActivePatterns: 90,
};

// ============================================================================
// Pattern Candidate Types
// ============================================================================

/**
 * Experience aggregation for pattern candidate identification
 */
export interface ExperienceAggregate {
  taskType: string;
  domain: QEDomain | null;
  count: number;
  avgReward: number;
  maxReward: number;
  minReward: number;
  actions: string[];
  successCount: number;
  latestAt: Date;
}

/**
 * Pattern candidate identified from experiences
 */
export interface PatternCandidate {
  name: string;
  domain: QEDomain;
  patternType: QEPatternType;
  confidence: number;
  sourceExperiences: number;
  avgReward: number;
  successRate: number;
  actions: string[];
  templateContent: string;
}

/**
 * Result of pattern promotion check
 */
export interface PromotionCheckResult {
  shouldPromote: boolean;
  meetsRewardThreshold: boolean;
  meetsOccurrenceThreshold: boolean;
  meetsSuccessRateThreshold: boolean;
  currentReward: number;
  currentOccurrences: number;
  currentSuccessRate: number;
}

/**
 * Result of deprecation check
 */
export interface DeprecationCheckResult {
  shouldDeprecate: boolean;
  reason: 'failures' | 'stale' | 'low_confidence' | 'age' | null;
  consecutiveFailures?: number;
  daysSinceLastUse?: number;
  currentConfidence?: number;
  ageInDays?: number;
}

/**
 * Pattern lifecycle statistics
 */
export interface PatternLifecycleStats {
  totalPatterns: number;
  activePatterns: number;
  deprecatedPatterns: number;
  promotedPatterns: number;
  shortTermPatterns: number;
  longTermPatterns: number;
  avgConfidence: number;
  avgSuccessRate: number;
  patternsNearDeprecation: number;
}

// ============================================================================
// Pattern Lifecycle Manager
// ============================================================================

/**
 * Pattern Lifecycle Manager
 *
 * Handles pattern promotion, deprecation, and quality tracking
 * as part of the continuous learning loop.
 */
export class PatternLifecycleManager {
  private readonly config: PatternLifecycleConfig;

  constructor(
    private readonly db: DatabaseType,
    config: Partial<PatternLifecycleConfig> = {}
  ) {
    this.config = { ...DEFAULT_LIFECYCLE_CONFIG, ...config };
    this.ensureSchema();
  }

  /**
   * Ensure required schema extensions exist
   */
  private ensureSchema(): void {
    // Add deprecated_at column if not exists
    try {
      this.db.prepare(`
        SELECT deprecated_at FROM qe_patterns LIMIT 1
      `).get();
    } catch {
      // Column doesn't exist, add it
      this.db.exec(`
        ALTER TABLE qe_patterns ADD COLUMN deprecated_at TEXT DEFAULT NULL
      `);
      console.log('[PatternLifecycle] Added deprecated_at column to qe_patterns');
    }

    // Add consecutive_failures column if not exists
    try {
      this.db.prepare(`
        SELECT consecutive_failures FROM qe_patterns LIMIT 1
      `).get();
    } catch {
      this.db.exec(`
        ALTER TABLE qe_patterns ADD COLUMN consecutive_failures INTEGER DEFAULT 0
      `);
      console.log('[PatternLifecycle] Added consecutive_failures column to qe_patterns');
    }

    // Add promotion_date column if not exists
    try {
      this.db.prepare(`
        SELECT promotion_date FROM qe_patterns LIMIT 1
      `).get();
    } catch {
      this.db.exec(`
        ALTER TABLE qe_patterns ADD COLUMN promotion_date TEXT DEFAULT NULL
      `);
      console.log('[PatternLifecycle] Added promotion_date column to qe_patterns');
    }
  }

  // ============================================================================
  // Experience Extraction
  // ============================================================================

  /**
   * Get recent experiences from learning_experiences table
   */
  getRecentExperiences(options: {
    minReward?: number;
    limit?: number;
    sinceDays?: number;
  } = {}): ExperienceAggregate[] {
    const minReward = options.minReward ?? this.config.promotionRewardThreshold;
    const limit = options.limit ?? 100;
    const sinceDays = options.sinceDays ?? 7;
    const sinceTimestamp = Date.now() - (sinceDays * 24 * 60 * 60 * 1000);

    // Check if learning_experiences table exists
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='learning_experiences'
    `).get();

    if (!tableExists) {
      console.log('[PatternLifecycle] learning_experiences table not found');
      return [];
    }

    const aggregates = this.db.prepare(`
      SELECT
        task_type,
        COUNT(*) as count,
        AVG(reward) as avg_reward,
        MAX(reward) as max_reward,
        MIN(reward) as min_reward,
        SUM(CASE WHEN reward >= ? THEN 1 ELSE 0 END) as success_count,
        GROUP_CONCAT(DISTINCT action) as actions,
        MAX(created_at) as latest_at
      FROM learning_experiences
      WHERE created_at >= ? AND reward >= ?
      GROUP BY task_type
      HAVING COUNT(*) >= ?
      ORDER BY avg_reward DESC
      LIMIT ?
    `).all(
      minReward,
      sinceTimestamp,
      minReward * 0.5, // Include experiences above half threshold for context
      this.config.promotionMinOccurrences,
      limit
    ) as Array<{
      task_type: string;
      count: number;
      avg_reward: number;
      max_reward: number;
      min_reward: number;
      success_count: number;
      actions: string | null;
      latest_at: number;
    }>;

    return aggregates.map(agg => ({
      taskType: agg.task_type,
      domain: this.taskTypeToQEDomain(agg.task_type),
      count: agg.count,
      avgReward: agg.avg_reward,
      maxReward: agg.max_reward,
      minReward: agg.min_reward,
      actions: agg.actions ? agg.actions.split(',').filter(Boolean) : [],
      successCount: agg.success_count,
      latestAt: new Date(agg.latest_at),
    }));
  }

  /**
   * Map task type to QE domain
   */
  private taskTypeToQEDomain(taskType: string): QEDomain | null {
    const mapping: Record<string, QEDomain> = {
      'generate': 'test-generation',
      'test-generation': 'test-generation',
      'test': 'test-generation',
      'analyze': 'coverage-analysis',
      'coverage': 'coverage-analysis',
      'coverage-analysis': 'coverage-analysis',
      'run': 'test-execution',
      'execute': 'test-execution',
      'test-execution': 'test-execution',
      'report': 'quality-assessment',
      'quality': 'quality-assessment',
      'assessment': 'quality-assessment',
      'security': 'security-compliance',
      'sast': 'security-compliance',
      'audit': 'security-compliance',
      'defect': 'defect-intelligence',
      'predict': 'defect-intelligence',
      'bug': 'defect-intelligence',
      'requirements': 'requirements-validation',
      'validation': 'requirements-validation',
      'code': 'code-intelligence',
      'complexity': 'code-intelligence',
      'contract': 'contract-testing',
      'api': 'contract-testing',
      'visual': 'visual-accessibility',
      'a11y': 'visual-accessibility',
      'accessibility': 'visual-accessibility',
      'chaos': 'chaos-resilience',
      'resilience': 'chaos-resilience',
      'flaky': 'chaos-resilience',
      'learning': 'learning-optimization',
      'optimize': 'learning-optimization',
    };

    const lowerType = taskType.toLowerCase();
    for (const [key, domain] of Object.entries(mapping)) {
      if (lowerType.includes(key)) {
        return domain;
      }
    }
    return null;
  }

  /**
   * Map task type to pattern type
   */
  private taskTypeToPatternType(taskType: string): QEPatternType {
    const mapping: Record<string, QEPatternType> = {
      'generate': 'test-template',
      'test': 'test-template',
      'coverage': 'coverage-strategy',
      'analyze': 'coverage-strategy',
      'mock': 'mock-pattern',
      'stub': 'mock-pattern',
      'assert': 'assertion-pattern',
      'expect': 'assertion-pattern',
      'security': 'assertion-pattern',
      'contract': 'api-contract',
      'api': 'api-contract',
      'visual': 'visual-baseline',
      'screenshot': 'visual-baseline',
      'a11y': 'a11y-check',
      'accessibility': 'a11y-check',
      'perf': 'perf-benchmark',
      'load': 'perf-benchmark',
      'stress': 'perf-benchmark',
      'flaky': 'flaky-fix',
      'retry': 'flaky-fix',
      'refactor': 'refactor-safe',
      'error': 'error-handling',
      'exception': 'error-handling',
    };

    const lowerType = taskType.toLowerCase();
    for (const [key, patternType] of Object.entries(mapping)) {
      if (lowerType.includes(key)) {
        return patternType;
      }
    }
    return 'test-template';
  }

  // ============================================================================
  // Pattern Candidate Identification
  // ============================================================================

  /**
   * Find pattern candidates from experience aggregates
   */
  findPatternCandidates(experiences: ExperienceAggregate[]): PatternCandidate[] {
    const candidates: PatternCandidate[] = [];

    for (const exp of experiences) {
      // Check if meets promotion thresholds
      const meetsReward = exp.avgReward >= this.config.promotionRewardThreshold;
      const meetsOccurrences = exp.count >= this.config.promotionMinOccurrences;
      const successRate = exp.successCount / exp.count;
      const meetsSuccessRate = successRate >= this.config.promotionMinSuccessRate;

      if (meetsReward && meetsOccurrences && meetsSuccessRate) {
        const domain = exp.domain || 'code-intelligence';
        const patternType = this.taskTypeToPatternType(exp.taskType);

        // Check if pattern already exists
        const existingPattern = this.findExistingPattern(exp.taskType, domain);
        if (existingPattern) {
          // Pattern exists, will be reinforced instead
          continue;
        }

        candidates.push({
          name: `${exp.taskType}-success-pattern`,
          domain,
          patternType,
          confidence: Math.min(0.95, exp.avgReward * 0.9),
          sourceExperiences: exp.count,
          avgReward: exp.avgReward,
          successRate,
          actions: exp.actions.slice(0, 5),
          templateContent: this.generateTemplateContent(exp),
        });
      }
    }

    return candidates;
  }

  /**
   * Find existing pattern by task type and domain
   */
  private findExistingPattern(taskType: string, domain: QEDomain): QEPattern | null {
    const pattern = this.db.prepare(`
      SELECT * FROM qe_patterns
      WHERE name LIKE ? AND qe_domain = ? AND deprecated_at IS NULL
      LIMIT 1
    `).get(`%${taskType}%`, domain) as PatternRow | undefined;

    return pattern ? this.rowToPattern(pattern) : null;
  }

  /**
   * Generate template content from experience aggregate
   */
  private generateTemplateContent(exp: ExperienceAggregate): string {
    const actionSteps = exp.actions
      .map((a, i) => `${i + 1}. ${a}`)
      .join('\n');

    return `Task Type: ${exp.taskType}
Domain: ${exp.domain || 'general'}
Average Reward: ${exp.avgReward.toFixed(3)}
Success Rate: ${(exp.successCount / exp.count * 100).toFixed(1)}%

Typical Actions:
${actionSteps || 'N/A'}

Pattern extracted from ${exp.count} successful experiences.`;
  }

  // ============================================================================
  // Pattern Promotion
  // ============================================================================

  /**
   * Check if a pattern should be promoted
   */
  checkPromotion(patternId: string): PromotionCheckResult {
    const pattern = this.getPattern(patternId);
    if (!pattern) {
      return {
        shouldPromote: false,
        meetsRewardThreshold: false,
        meetsOccurrenceThreshold: false,
        meetsSuccessRateThreshold: false,
        currentReward: 0,
        currentOccurrences: 0,
        currentSuccessRate: 0,
      };
    }

    const avgReward = pattern.qualityScore;
    const meetsReward = avgReward >= this.config.promotionRewardThreshold;
    const meetsOccurrences = pattern.usageCount >= this.config.promotionMinOccurrences;
    const meetsSuccessRate = pattern.successRate >= this.config.promotionMinSuccessRate;

    return {
      shouldPromote: pattern.tier === 'short-term' && meetsReward && meetsOccurrences && meetsSuccessRate,
      meetsRewardThreshold: meetsReward,
      meetsOccurrenceThreshold: meetsOccurrences,
      meetsSuccessRateThreshold: meetsSuccessRate,
      currentReward: avgReward,
      currentOccurrences: pattern.usageCount,
      currentSuccessRate: pattern.successRate,
    };
  }

  /**
   * Promote pattern to long-term tier
   */
  promotePattern(patternId: string): boolean {
    const check = this.checkPromotion(patternId);
    if (!check.shouldPromote) {
      return false;
    }

    this.db.prepare(`
      UPDATE qe_patterns
      SET tier = 'long-term',
          promotion_date = datetime('now'),
          confidence = MIN(1.0, confidence + 0.1),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(patternId);

    console.log(`[PatternLifecycle] Promoted pattern ${patternId} to long-term`);
    return true;
  }

  /**
   * Promote all eligible patterns
   */
  promoteEligiblePatterns(): { promoted: number; checked: number } {
    const shortTermPatterns = this.db.prepare(`
      SELECT id FROM qe_patterns
      WHERE tier = 'short-term' AND deprecated_at IS NULL
    `).all() as Array<{ id: string }>;

    let promoted = 0;
    for (const { id } of shortTermPatterns) {
      if (this.promotePattern(id)) {
        promoted++;
      }
    }

    return { promoted, checked: shortTermPatterns.length };
  }

  // ============================================================================
  // Pattern Deprecation
  // ============================================================================

  /**
   * Check if a pattern should be deprecated
   */
  checkDeprecation(patternId: string): DeprecationCheckResult {
    const pattern = this.getPattern(patternId);
    if (!pattern) {
      return { shouldDeprecate: false, reason: null };
    }

    // Already deprecated
    if ((pattern as PatternWithDeprecation).deprecated_at) {
      return { shouldDeprecate: false, reason: null };
    }

    // Check consecutive failures
    const consecutiveFailures = (pattern as PatternWithDeprecation).consecutive_failures || 0;
    if (consecutiveFailures >= this.config.deprecationFailureThreshold) {
      return {
        shouldDeprecate: true,
        reason: 'failures',
        consecutiveFailures,
      };
    }

    // Check staleness
    const lastUsedTime = pattern.lastUsedAt instanceof Date
      ? pattern.lastUsedAt.getTime()
      : new Date(pattern.lastUsedAt).getTime();
    const daysSinceLastUse = (Date.now() - lastUsedTime) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUse >= this.config.staleDaysThreshold) {
      return {
        shouldDeprecate: true,
        reason: 'stale',
        daysSinceLastUse,
      };
    }

    // Check low confidence
    if (pattern.confidence < this.config.minActiveConfidence) {
      return {
        shouldDeprecate: true,
        reason: 'low_confidence',
        currentConfidence: pattern.confidence,
      };
    }

    // Check age
    const createdTime = pattern.createdAt instanceof Date
      ? pattern.createdAt.getTime()
      : new Date(pattern.createdAt).getTime();
    const ageInDays = (Date.now() - createdTime) / (1000 * 60 * 60 * 24);
    if (ageInDays >= this.config.maxAgeForActivePatterns && pattern.usageCount < 5) {
      return {
        shouldDeprecate: true,
        reason: 'age',
        ageInDays,
      };
    }

    return { shouldDeprecate: false, reason: null };
  }

  /**
   * Deprecate a pattern (soft delete)
   */
  deprecatePattern(patternId: string, reason?: string): boolean {
    const check = this.checkDeprecation(patternId);
    if (!check.shouldDeprecate && !reason) {
      return false;
    }

    const actualReason = reason || check.reason || 'manual';

    // Move to deprecated state (soft delete)
    this.db.prepare(`
      UPDATE qe_patterns
      SET deprecated_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(patternId);

    // Store deprecation reason in metadata
    const pattern = this.getPattern(patternId);
    if (pattern) {
      const metadata = {
        deprecation_reason: actualReason,
        deprecated_at: new Date().toISOString(),
        final_confidence: pattern.confidence,
        final_success_rate: pattern.successRate,
        total_usage: pattern.usageCount,
      };

      this.db.prepare(`
        UPDATE qe_patterns
        SET context_json = json_patch(COALESCE(context_json, '{}'), ?)
        WHERE id = ?
      `).run(JSON.stringify({ deprecation_metadata: metadata }), patternId);
    }

    console.log(`[PatternLifecycle] Deprecated pattern ${patternId}: ${actualReason}`);
    return true;
  }

  /**
   * Deprecate all patterns that meet deprecation criteria
   */
  deprecateStalePatterns(): { deprecated: number; checked: number } {
    const activePatterns = this.db.prepare(`
      SELECT id FROM qe_patterns
      WHERE deprecated_at IS NULL
    `).all() as Array<{ id: string }>;

    let deprecated = 0;
    for (const { id } of activePatterns) {
      const check = this.checkDeprecation(id);
      if (check.shouldDeprecate) {
        this.deprecatePattern(id, check.reason || undefined);
        deprecated++;
      }
    }

    return { deprecated, checked: activePatterns.length };
  }

  // ============================================================================
  // Confidence Decay
  // ============================================================================

  /**
   * Apply confidence decay to patterns that haven't been used recently
   */
  applyConfidenceDecay(daysSinceLastRun: number = 1): { updated: number; decayed: number } {
    const decayFactor = 1 - (this.config.confidenceDecayRate * daysSinceLastRun);

    // Get patterns that haven't been used in the decay period
    const cutoffTime = Date.now() - (daysSinceLastRun * 24 * 60 * 60 * 1000);

    const result = this.db.prepare(`
      UPDATE qe_patterns
      SET confidence = MAX(?, confidence * ?),
          updated_at = datetime('now')
      WHERE deprecated_at IS NULL
        AND (last_used_at IS NULL OR datetime(last_used_at) < datetime(?, 'unixepoch'))
    `).run(
      this.config.minActiveConfidence,
      decayFactor,
      cutoffTime / 1000
    );

    return {
      updated: result.changes,
      decayed: result.changes,
    };
  }

  // ============================================================================
  // Pattern Usage Feedback
  // ============================================================================

  /**
   * Record pattern usage success/failure
   */
  recordUsage(patternId: string, success: boolean): void {
    if (success) {
      // Reset consecutive failures on success
      this.db.prepare(`
        UPDATE qe_patterns
        SET usage_count = usage_count + 1,
            successful_uses = successful_uses + 1,
            consecutive_failures = 0,
            confidence = MIN(1.0, confidence + 0.02),
            success_rate = CAST(successful_uses + 1 AS REAL) / CAST(usage_count + 1 AS REAL),
            last_used_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(patternId);
    } else {
      // Increment consecutive failures
      this.db.prepare(`
        UPDATE qe_patterns
        SET usage_count = usage_count + 1,
            consecutive_failures = consecutive_failures + 1,
            confidence = MAX(0.1, confidence - 0.05),
            success_rate = CAST(successful_uses AS REAL) / CAST(usage_count + 1 AS REAL),
            last_used_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(patternId);
    }

    // Recalculate quality score
    this.db.prepare(`
      UPDATE qe_patterns
      SET quality_score = confidence * 0.3 + (MIN(usage_count, 100) / 100.0) * 0.2 + success_rate * 0.5
      WHERE id = ?
    `).run(patternId);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get pattern lifecycle statistics
   */
  getStats(): PatternLifecycleStats {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN deprecated_at IS NULL THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN deprecated_at IS NOT NULL THEN 1 ELSE 0 END) as deprecated,
        SUM(CASE WHEN tier = 'long-term' AND deprecated_at IS NULL THEN 1 ELSE 0 END) as promoted,
        SUM(CASE WHEN tier = 'short-term' AND deprecated_at IS NULL THEN 1 ELSE 0 END) as short_term,
        SUM(CASE WHEN tier = 'long-term' THEN 1 ELSE 0 END) as long_term,
        AVG(CASE WHEN deprecated_at IS NULL THEN confidence ELSE NULL END) as avg_confidence,
        AVG(CASE WHEN deprecated_at IS NULL THEN success_rate ELSE NULL END) as avg_success_rate
      FROM qe_patterns
    `).get() as {
      total: number;
      active: number;
      deprecated: number;
      promoted: number;
      short_term: number;
      long_term: number;
      avg_confidence: number | null;
      avg_success_rate: number | null;
    };

    // Count patterns near deprecation threshold
    const nearDeprecation = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM qe_patterns
      WHERE deprecated_at IS NULL
        AND (
          consecutive_failures >= ?
          OR confidence < ?
          OR (julianday('now') - julianday(COALESCE(last_used_at, created_at))) >= ?
        )
    `).get(
      this.config.deprecationFailureThreshold - 1,
      this.config.minActiveConfidence + 0.1,
      this.config.staleDaysThreshold - 7
    ) as { count: number };

    return {
      totalPatterns: stats.total || 0,
      activePatterns: stats.active || 0,
      deprecatedPatterns: stats.deprecated || 0,
      promotedPatterns: stats.promoted || 0,
      shortTermPatterns: stats.short_term || 0,
      longTermPatterns: stats.long_term || 0,
      avgConfidence: stats.avg_confidence || 0,
      avgSuccessRate: stats.avg_success_rate || 0,
      patternsNearDeprecation: nearDeprecation.count || 0,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get a pattern by ID
   */
  private getPattern(id: string): QEPattern | null {
    const row = this.db.prepare(`
      SELECT * FROM qe_patterns WHERE id = ?
    `).get(id) as PatternRow | undefined;

    return row ? this.rowToPattern(row) : null;
  }

  /**
   * Convert database row to QEPattern
   */
  private rowToPattern(row: PatternRow): QEPattern {
    return {
      id: row.id,
      patternType: row.pattern_type as QEPatternType,
      qeDomain: row.qe_domain as QEDomain,
      domain: row.domain as import('../shared/types/index.js').DomainName,
      name: row.name,
      description: row.description || '',
      confidence: row.confidence,
      usageCount: row.usage_count,
      successRate: row.success_rate,
      qualityScore: row.quality_score,
      tier: row.tier as 'short-term' | 'long-term',
      template: JSON.parse(row.template_json || '{}'),
      context: JSON.parse(row.context_json || '{}'),
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : new Date(row.created_at),
      successfulUses: row.successful_uses,
      reusable: row.reusable === 1,
      reuseCount: row.reuse_count || 0,
      averageTokenSavings: row.average_token_savings || 0,
    };
  }
}

// ============================================================================
// Types
// ============================================================================

interface PatternRow {
  id: string;
  pattern_type: string;
  qe_domain: string;
  domain: string;
  name: string;
  description: string | null;
  confidence: number;
  usage_count: number;
  success_rate: number;
  quality_score: number;
  tier: string;
  template_json: string | null;
  context_json: string | null;
  created_at: string;
  last_used_at: string | null;
  successful_uses: number;
  reusable: number;
  reuse_count: number;
  average_token_savings: number;
}

interface PatternWithDeprecation extends QEPattern {
  deprecated_at?: string | null;
  consecutive_failures?: number;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a pattern lifecycle manager
 */
export function createPatternLifecycleManager(
  db: DatabaseType,
  config?: Partial<PatternLifecycleConfig>
): PatternLifecycleManager {
  return new PatternLifecycleManager(db, config);
}
