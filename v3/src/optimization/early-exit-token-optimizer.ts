/**
 * Agentic QE v3 - Early Exit Token Optimizer
 * ADR-042: Token Optimization via Pattern Reuse
 *
 * Enables LLM call skipping by reusing high-confidence patterns from
 * the PatternStore. Uses HNSW similarity search for O(log n) pattern
 * matching and tracks token savings statistics.
 */

import type {
  PatternStore,
  PatternSearchResult,
  PatternSearchOptions,
} from '../learning/pattern-store.js';
import type { QEPattern, QEDomain } from '../learning/qe-patterns.js';
import { detectQEDomain } from '../learning/qe-patterns.js';
import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for early exit token optimization
 */
export interface EarlyExitConfig {
  /**
   * Minimum confidence required to skip LLM call and reuse pattern
   * Range: 0-1, default: 0.85
   * Higher values mean fewer early exits but higher reliability
   */
  minConfidenceForExit: number;

  /**
   * Minimum success rate required for pattern reuse
   * Range: 0-1, default: 0.90
   * Patterns with lower success rates are not eligible for reuse
   */
  minSuccessRate: number;

  /**
   * Maximum pattern age for eligibility (in milliseconds)
   * Default: 7 days (604800000ms)
   * Older patterns are ignored to prevent stale pattern reuse
   */
  maxPatternAge: number;

  /**
   * Minimum quality score for pattern reuse
   * Range: 0-1, default: 0.7
   */
  minQualityScore: number;

  /**
   * Minimum number of successful uses before pattern is eligible
   * Default: 2
   */
  minSuccessfulUses: number;

  /**
   * Maximum number of patterns to search
   * Default: 5
   */
  maxSearchResults: number;

  /**
   * Similarity threshold for HNSW search
   * Range: 0-1, default: 0.8
   */
  similarityThreshold: number;

  /**
   * Enable verbose logging
   */
  verbose: boolean;
}

/**
 * Default early exit configuration
 */
export const DEFAULT_EARLY_EXIT_CONFIG: EarlyExitConfig = {
  minConfidenceForExit: 0.85,
  minSuccessRate: 0.90,
  maxPatternAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  minQualityScore: 0.7,
  minSuccessfulUses: 2,
  maxSearchResults: 5,
  similarityThreshold: 0.8,
  verbose: false,
};

/**
 * Aggressive early exit configuration for development
 */
export const AGGRESSIVE_EARLY_EXIT_CONFIG: EarlyExitConfig = {
  minConfidenceForExit: 0.75,
  minSuccessRate: 0.80,
  maxPatternAge: 14 * 24 * 60 * 60 * 1000, // 14 days
  minQualityScore: 0.6,
  minSuccessfulUses: 1,
  maxSearchResults: 10,
  similarityThreshold: 0.7,
  verbose: false,
};

/**
 * Conservative early exit configuration for production
 */
export const CONSERVATIVE_EARLY_EXIT_CONFIG: EarlyExitConfig = {
  minConfidenceForExit: 0.92,
  minSuccessRate: 0.95,
  maxPatternAge: 3 * 24 * 60 * 60 * 1000, // 3 days
  minQualityScore: 0.85,
  minSuccessfulUses: 3,
  maxSearchResults: 3,
  similarityThreshold: 0.9,
  verbose: false,
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result from checking early exit eligibility
 */
export interface EarlyExitResult {
  /**
   * Whether we can skip the LLM call and reuse a pattern
   */
  canExit: boolean;

  /**
   * The pattern that can be reused (if canExit is true)
   */
  reusedPattern?: QEPattern;

  /**
   * Estimated tokens saved by reusing the pattern
   */
  estimatedTokensSaved?: number;

  /**
   * Confidence in the pattern reuse (0-1)
   */
  confidence?: number;

  /**
   * Similarity score from HNSW search (0-1)
   */
  similarityScore?: number;

  /**
   * Reason for the decision
   */
  reason: EarlyExitReason;

  /**
   * Detailed explanation
   */
  explanation: string;

  /**
   * Search latency in milliseconds
   */
  searchLatencyMs: number;
}

/**
 * Reasons for early exit decisions
 */
export type EarlyExitReason =
  | 'pattern_reused'
  | 'no_matching_pattern'
  | 'confidence_too_low'
  | 'success_rate_too_low'
  | 'pattern_too_old'
  | 'quality_score_too_low'
  | 'insufficient_uses'
  | 'similarity_too_low'
  | 'search_error';

/**
 * Statistics about pattern reuse
 */
export interface ReuseStats {
  /**
   * Total number of successful pattern reuses
   */
  totalReuses: number;

  /**
   * Total estimated tokens saved
   */
  tokensSaved: number;

  /**
   * Average confidence across all reuses
   */
  avgConfidence: number;

  /**
   * Average similarity score across all reuses
   */
  avgSimilarity: number;

  /**
   * Average search latency in milliseconds
   */
  avgSearchLatencyMs: number;

  /**
   * Number of early exit attempts
   */
  totalAttempts: number;

  /**
   * Early exit success rate (reuses / attempts)
   */
  exitRate: number;

  /**
   * Breakdown by exit reason
   */
  reasonBreakdown: Record<EarlyExitReason, number>;

  /**
   * Breakdown by domain
   */
  domainBreakdown: Record<string, { reuses: number; tokens: number }>;
}

/**
 * Task input for early exit check
 */
export interface EarlyExitTask {
  /**
   * Task description for similarity matching
   */
  description: string;

  /**
   * Optional QE domain to narrow search
   */
  domain?: QEDomain;

  /**
   * Optional embedding for vector search
   */
  embedding?: number[];

  /**
   * Optional context for matching
   */
  context?: {
    language?: string;
    framework?: string;
    testType?: string;
  };
}

// ============================================================================
// Early Exit Token Optimizer Implementation
// ============================================================================

/**
 * Early Exit Token Optimizer
 *
 * Enables LLM call skipping by reusing high-confidence patterns.
 * Uses HNSW-indexed PatternStore for O(log n) similarity search.
 *
 * @example
 * ```typescript
 * const optimizer = new EarlyExitTokenOptimizer(patternStore);
 *
 * const result = await optimizer.checkEarlyExit({
 *   description: 'Generate unit tests for UserService',
 *   domain: 'test-generation',
 * });
 *
 * if (result.canExit) {
 *   console.log(`Skipping LLM call, reusing pattern: ${result.reusedPattern?.name}`);
 *   console.log(`Tokens saved: ${result.estimatedTokensSaved}`);
 * }
 * ```
 */
export class EarlyExitTokenOptimizer {
  private readonly patternStore: PatternStore;
  private readonly config: EarlyExitConfig;

  // Statistics tracking
  private reuseHistory: Array<{
    patternId: string;
    tokensSaved: number;
    confidence: number;
    similarity: number;
    latencyMs: number;
    domain?: string;
    timestamp: Date;
  }> = [];

  private attemptHistory: Array<{
    reason: EarlyExitReason;
    domain?: string;
    timestamp: Date;
  }> = [];

  constructor(patternStore: PatternStore, config?: Partial<EarlyExitConfig>) {
    this.patternStore = patternStore;
    this.config = { ...DEFAULT_EARLY_EXIT_CONFIG, ...config };
  }

  /**
   * Check if we can skip LLM call by reusing a pattern
   *
   * @param task - The task to check for pattern reuse
   * @returns Early exit result with pattern and savings information
   */
  async checkEarlyExit(task: EarlyExitTask): Promise<EarlyExitResult> {
    const startTime = performance.now();
    const now = new Date();

    try {
      // Detect domain if not provided
      const domain = task.domain ?? detectQEDomain(task.description) ?? undefined;

      // Build search options
      // Note: We don't pass minConfidence/minQualityScore to the PatternStore
      // because we want to evaluate patterns ourselves to provide proper rejection reasons
      const searchOptions: PatternSearchOptions = {
        limit: this.config.maxSearchResults * 2, // Get extra candidates for filtering
        useVectorSearch: !!task.embedding,
      };

      if (domain) {
        searchOptions.domain = domain;
      }

      if (task.context) {
        searchOptions.context = {
          language: task.context.language as any,
          framework: task.context.framework as any,
          testType: task.context.testType as any,
        };
      }

      // Search for matching patterns
      const searchQuery = task.embedding ?? task.description;
      const searchResult = await this.patternStore.search(searchQuery, searchOptions);

      const latencyMs = performance.now() - startTime;

      if (!searchResult.success) {
        const errorMessage = 'error' in searchResult
          ? (searchResult.error as Error).message
          : 'Unknown error';
        const result = this.createResult(
          false,
          'search_error',
          `Pattern search failed: ${errorMessage}`,
          latencyMs
        );
        this.recordAttempt('search_error', domain);
        return result;
      }

      const patterns = searchResult.value;

      if (patterns.length === 0) {
        const result = this.createResult(
          false,
          'no_matching_pattern',
          'No matching patterns found in store',
          latencyMs
        );
        this.recordAttempt('no_matching_pattern', domain);
        return result;
      }

      // Evaluate each pattern for eligibility
      // Track the first rejection reason to report if no patterns are eligible
      let firstRejection: { reason: EarlyExitReason; explanation: string } | null = null;

      for (const { pattern, score } of patterns) {
        const eligibility = this.evaluatePatternEligibility(pattern, score, now);

        if (eligibility.eligible) {
          // Calculate estimated tokens saved
          const tokensSaved = this.estimateTokensSaved(pattern);

          const result: EarlyExitResult = {
            canExit: true,
            reusedPattern: pattern,
            estimatedTokensSaved: tokensSaved,
            confidence: pattern.confidence,
            similarityScore: score,
            reason: 'pattern_reused',
            explanation: `Reusing pattern "${pattern.name}" with ${(pattern.confidence * 100).toFixed(1)}% confidence`,
            searchLatencyMs: latencyMs,
          };

          this.recordReuse(pattern.id, tokensSaved, pattern.confidence, score, latencyMs, domain);

          if (this.config.verbose) {
            console.log(
              `[EarlyExitTokenOptimizer] Pattern reuse: ${pattern.name} ` +
              `(confidence: ${pattern.confidence.toFixed(2)}, similarity: ${score.toFixed(2)}, tokens saved: ${tokensSaved})`
            );
          }

          return result;
        }

        // Record the first rejection reason for explanation
        if (firstRejection === null) {
          firstRejection = {
            reason: eligibility.reason,
            explanation: eligibility.explanation,
          };
        }
      }

      // No eligible patterns found - return the first rejection reason
      if (firstRejection) {
        const result = this.createResult(
          false,
          firstRejection.reason,
          firstRejection.explanation,
          latencyMs
        );
        this.recordAttempt(firstRejection.reason, domain);
        return result;
      }

      // All patterns were rejected
      const result = this.createResult(
        false,
        'no_matching_pattern',
        `Found ${patterns.length} patterns but none met eligibility criteria`,
        latencyMs
      );
      this.recordAttempt('no_matching_pattern', domain);
      return result;

    } catch (error) {
      const latencyMs = performance.now() - startTime;
      const result = this.createResult(
        false,
        'search_error',
        `Error during pattern search: ${toErrorMessage(error)}`,
        latencyMs
      );
      this.recordAttempt('search_error');
      return result;
    }
  }

  /**
   * Evaluate whether a pattern is eligible for reuse
   */
  private evaluatePatternEligibility(
    pattern: QEPattern,
    similarityScore: number,
    now: Date
  ): { eligible: boolean; reason: EarlyExitReason; explanation: string } {
    // Check similarity threshold
    if (similarityScore < this.config.similarityThreshold) {
      return {
        eligible: false,
        reason: 'similarity_too_low',
        explanation: `Similarity ${(similarityScore * 100).toFixed(1)}% < threshold ${(this.config.similarityThreshold * 100).toFixed(1)}%`,
      };
    }

    // Check confidence
    if (pattern.confidence < this.config.minConfidenceForExit) {
      return {
        eligible: false,
        reason: 'confidence_too_low',
        explanation: `Confidence ${(pattern.confidence * 100).toFixed(1)}% < threshold ${(this.config.minConfidenceForExit * 100).toFixed(1)}%`,
      };
    }

    // Check success rate
    if (pattern.successRate < this.config.minSuccessRate) {
      return {
        eligible: false,
        reason: 'success_rate_too_low',
        explanation: `Success rate ${(pattern.successRate * 100).toFixed(1)}% < threshold ${(this.config.minSuccessRate * 100).toFixed(1)}%`,
      };
    }

    // Check pattern age
    const patternAge = now.getTime() - pattern.lastUsedAt.getTime();
    if (patternAge > this.config.maxPatternAge) {
      const ageInDays = Math.floor(patternAge / (24 * 60 * 60 * 1000));
      const maxAgeInDays = Math.floor(this.config.maxPatternAge / (24 * 60 * 60 * 1000));
      return {
        eligible: false,
        reason: 'pattern_too_old',
        explanation: `Pattern age ${ageInDays} days > max ${maxAgeInDays} days`,
      };
    }

    // Check quality score
    if (pattern.qualityScore < this.config.minQualityScore) {
      return {
        eligible: false,
        reason: 'quality_score_too_low',
        explanation: `Quality score ${(pattern.qualityScore * 100).toFixed(1)}% < threshold ${(this.config.minQualityScore * 100).toFixed(1)}%`,
      };
    }

    // Check successful uses
    if (pattern.successfulUses < this.config.minSuccessfulUses) {
      return {
        eligible: false,
        reason: 'insufficient_uses',
        explanation: `Successful uses ${pattern.successfulUses} < minimum ${this.config.minSuccessfulUses}`,
      };
    }

    return {
      eligible: true,
      reason: 'pattern_reused',
      explanation: 'Pattern meets all eligibility criteria',
    };
  }

  /**
   * Estimate tokens saved by reusing a pattern
   *
   * Estimation based on pattern template size and typical LLM response overhead
   */
  private estimateTokensSaved(pattern: QEPattern): number {
    // Base estimate: ~100 tokens for a simple request/response
    let baseTokens = 100;

    // Add tokens based on template content length
    // Approximate: 4 characters per token
    const templateTokens = Math.ceil(pattern.template.content.length / 4);
    baseTokens += templateTokens;

    // Add overhead for typical LLM interaction
    // (prompt construction, context, response formatting)
    const overheadTokens = 50;
    baseTokens += overheadTokens;

    // Add complexity factor based on pattern type
    const complexityMultipliers: Record<string, number> = {
      'test-template': 1.5,
      'assertion-pattern': 1.0,
      'mock-pattern': 1.2,
      'coverage-strategy': 1.3,
      'api-contract': 1.4,
      'visual-baseline': 1.1,
      'perf-benchmark': 1.4,
      'flaky-fix': 1.3,
      'error-handling': 1.2,
    };

    const multiplier = complexityMultipliers[pattern.patternType] ?? 1.0;
    return Math.ceil(baseTokens * multiplier);
  }

  /**
   * Create an early exit result
   */
  private createResult(
    canExit: boolean,
    reason: EarlyExitReason,
    explanation: string,
    latencyMs: number
  ): EarlyExitResult {
    return {
      canExit,
      reason,
      explanation,
      searchLatencyMs: latencyMs,
    };
  }

  /**
   * Record a successful pattern reuse
   */
  private recordReuse(
    patternId: string,
    tokensSaved: number,
    confidence: number,
    similarity: number,
    latencyMs: number,
    domain?: string
  ): void {
    this.reuseHistory.push({
      patternId,
      tokensSaved,
      confidence,
      similarity,
      latencyMs,
      domain,
      timestamp: new Date(),
    });

    this.attemptHistory.push({
      reason: 'pattern_reused',
      domain,
      timestamp: new Date(),
    });

    // Keep history bounded (last 10000 entries)
    if (this.reuseHistory.length > 10000) {
      this.reuseHistory = this.reuseHistory.slice(-10000);
    }
  }

  /**
   * Record an early exit attempt (successful or not)
   */
  private recordAttempt(reason: EarlyExitReason, domain?: string): void {
    this.attemptHistory.push({
      reason,
      domain,
      timestamp: new Date(),
    });

    // Keep history bounded
    if (this.attemptHistory.length > 10000) {
      this.attemptHistory = this.attemptHistory.slice(-10000);
    }
  }

  /**
   * Record that a pattern was successfully reused (post-verification)
   *
   * Call this after verifying the reused pattern worked correctly
   */
  recordSuccessfulReuse(patternId: string): void {
    // Update the pattern in the store
    this.patternStore.recordUsage(patternId, true).catch((error) => {
      console.warn(
        `[EarlyExitTokenOptimizer] Failed to record successful reuse for ${patternId}:`,
        error
      );
    });
  }

  /**
   * Record that a pattern reuse failed (post-verification)
   *
   * Call this when a reused pattern didn't work as expected
   */
  recordFailedReuse(patternId: string): void {
    // Update the pattern in the store
    this.patternStore.recordUsage(patternId, false).catch((error) => {
      console.warn(
        `[EarlyExitTokenOptimizer] Failed to record failed reuse for ${patternId}:`,
        error
      );
    });
  }

  /**
   * Get reuse statistics
   */
  getReuseStats(): ReuseStats {
    const totalReuses = this.reuseHistory.length;
    const totalAttempts = this.attemptHistory.length;

    // Calculate averages
    let totalTokens = 0;
    let totalConfidence = 0;
    let totalSimilarity = 0;
    let totalLatency = 0;

    for (const reuse of this.reuseHistory) {
      totalTokens += reuse.tokensSaved;
      totalConfidence += reuse.confidence;
      totalSimilarity += reuse.similarity;
      totalLatency += reuse.latencyMs;
    }

    // Calculate reason breakdown
    const reasonBreakdown: Record<EarlyExitReason, number> = {
      pattern_reused: 0,
      no_matching_pattern: 0,
      confidence_too_low: 0,
      success_rate_too_low: 0,
      pattern_too_old: 0,
      quality_score_too_low: 0,
      insufficient_uses: 0,
      similarity_too_low: 0,
      search_error: 0,
    };

    for (const attempt of this.attemptHistory) {
      reasonBreakdown[attempt.reason]++;
    }

    // Calculate domain breakdown
    const domainBreakdown: Record<string, { reuses: number; tokens: number }> = {};

    for (const reuse of this.reuseHistory) {
      const domain = reuse.domain ?? 'unknown';
      if (!domainBreakdown[domain]) {
        domainBreakdown[domain] = { reuses: 0, tokens: 0 };
      }
      domainBreakdown[domain].reuses++;
      domainBreakdown[domain].tokens += reuse.tokensSaved;
    }

    return {
      totalReuses,
      tokensSaved: totalTokens,
      avgConfidence: totalReuses > 0 ? totalConfidence / totalReuses : 0,
      avgSimilarity: totalReuses > 0 ? totalSimilarity / totalReuses : 0,
      avgSearchLatencyMs: totalReuses > 0 ? totalLatency / totalReuses : 0,
      totalAttempts,
      exitRate: totalAttempts > 0 ? totalReuses / totalAttempts : 0,
      reasonBreakdown,
      domainBreakdown,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.reuseHistory = [];
    this.attemptHistory = [];
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<EarlyExitConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(updates: Partial<EarlyExitConfig>): void {
    Object.assign(this.config, updates);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an EarlyExitTokenOptimizer with default configuration
 */
export function createEarlyExitTokenOptimizer(
  patternStore: PatternStore,
  config?: Partial<EarlyExitConfig>
): EarlyExitTokenOptimizer {
  return new EarlyExitTokenOptimizer(patternStore, config);
}

/**
 * Create an EarlyExitTokenOptimizer with aggressive configuration
 */
export function createAggressiveTokenOptimizer(
  patternStore: PatternStore
): EarlyExitTokenOptimizer {
  return new EarlyExitTokenOptimizer(patternStore, AGGRESSIVE_EARLY_EXIT_CONFIG);
}

/**
 * Create an EarlyExitTokenOptimizer with conservative configuration
 */
export function createConservativeTokenOptimizer(
  patternStore: PatternStore
): EarlyExitTokenOptimizer {
  return new EarlyExitTokenOptimizer(patternStore, CONSERVATIVE_EARLY_EXIT_CONFIG);
}
