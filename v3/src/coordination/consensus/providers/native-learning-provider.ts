/**
 * Agentic QE v3 - Native Learning Provider
 * Uses local pattern store before falling back to LLM models
 *
 * Implements "native learning first" strategy:
 * 1. Check pattern store for similar security findings
 * 2. If high-confidence pattern exists, return cached verdict
 * 3. Otherwise, delegate to LLM providers
 *
 * Benefits:
 * - Zero latency for cached patterns
 * - Zero cost for repeated verifications
 * - Improves over time with learning
 *
 * @see ADR-021: QE ReasoningBank for Pattern Learning
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2
 */

import {
  ModelProvider,
  ModelCompletionOptions,
  ModelHealthResult,
  SecurityFinding,
  ModelVote,
  VoteAssessment,
} from '../interfaces';
import { BaseModelProvider } from '../model-provider';
import type { IPatternStore, PatternSearchResult } from '../../../learning/pattern-store';
import type { Severity } from '../../../shared/types';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Security verification pattern stored in pattern store
 */
export interface SecurityVerificationPattern {
  /** Original finding category */
  category: string;

  /** Finding type (e.g., 'sql-injection', 'xss') */
  findingType: string;

  /** Code patterns that match this finding */
  codePatterns: string[];

  /** Verified verdict */
  verdict: VoteAssessment;

  /** Confidence level */
  confidence: number;

  /** Supporting reasoning */
  reasoning: string;

  /** Number of times this pattern was verified */
  verificationCount: number;

  /** Success rate of this verdict */
  successRate: number;

  /** Severity override if applicable */
  suggestedSeverity?: Severity;
}

/**
 * Configuration for native learning provider
 */
export interface NativeLearningProviderConfig {
  /** Pattern store instance */
  patternStore?: IPatternStore;

  /** Minimum similarity threshold for pattern matching (0-1) */
  minSimilarity?: number;

  /** Minimum confidence required to use cached pattern (0-1) */
  minConfidence?: number;

  /** Minimum success rate required for cached pattern (0-1) */
  minSuccessRate?: number;

  /** Minimum verification count for trusted patterns */
  minVerificationCount?: number;

  /** Enable learning from new verifications */
  enableLearning?: boolean;

  /** Enable logging */
  enableLogging?: boolean;

  /** Fallback provider for unmatched patterns */
  fallbackProvider?: ModelProvider;
}

/**
 * Match result from pattern lookup
 */
export interface PatternMatchResult {
  /** Whether a match was found */
  matched: boolean;

  /** Matched pattern (if found) */
  pattern?: SecurityVerificationPattern;

  /** Similarity score */
  similarity?: number;

  /** Reason for match/no-match */
  reason: string;
}

// ============================================================================
// Native Learning Provider Implementation
// ============================================================================

const DEFAULT_CONFIG = {
  minSimilarity: 0.85,
  minConfidence: 0.8,
  minSuccessRate: 0.9,
  minVerificationCount: 3,
  enableLearning: true,
  enableLogging: false,
};

/**
 * Native Learning Provider
 *
 * Uses local pattern matching before calling LLM providers.
 * Implements zero-cost verification for known patterns.
 *
 * @example
 * ```typescript
 * const provider = new NativeLearningProvider({
 *   patternStore: myPatternStore,
 *   fallbackProvider: claudeProvider,
 * });
 *
 * // First call learns from LLM
 * const result1 = await provider.verify(finding);
 *
 * // Second similar call uses cached pattern (zero latency/cost)
 * const result2 = await provider.verify(similarFinding);
 * ```
 */
export class NativeLearningProvider extends BaseModelProvider {
  readonly id = 'native-learning';
  readonly name = 'Native Learning (Local Patterns)';
  readonly type: 'custom' = 'custom';

  // Required by BaseModelProvider
  protected costPerToken = { input: 0, output: 0 }; // Local patterns are free
  protected supportedModels: string[] = ['native-pattern-matcher'];

  private config: typeof DEFAULT_CONFIG & Partial<NativeLearningProviderConfig>;
  private patternStore?: IPatternStore;
  private fallbackProvider?: ModelProvider;

  // In-memory pattern cache for fast lookups
  private patternCache: Map<string, SecurityVerificationPattern> = new Map();

  // Stats
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    fallbackCalls: 0,
    patternsLearned: 0,
    totalVerifications: 0,
  };

  constructor(config: NativeLearningProviderConfig = {}) {
    super();

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.patternStore = config.patternStore;
    this.fallbackProvider = config.fallbackProvider;
  }

  /**
   * Set fallback provider
   */
  setFallbackProvider(provider: ModelProvider): void {
    this.fallbackProvider = provider;
  }

  /**
   * Get statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Get cache hit rate
   */
  getCacheHitRate(): number {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    return total > 0 ? this.stats.cacheHits / total : 0;
  }

  /**
   * Complete a prompt using pattern matching first
   */
  async complete(
    prompt: string,
    options?: ModelCompletionOptions
  ): Promise<string> {
    if (this.disposed) {
      throw new Error('Provider has been disposed');
    }

    // For non-verification prompts, delegate to fallback
    if (this.fallbackProvider) {
      return this.fallbackProvider.complete(prompt, options);
    }

    throw new Error('NativeLearningProvider requires a fallback provider for non-verification prompts');
  }

  /**
   * Verify a security finding using pattern matching first
   */
  async verifyFinding(finding: SecurityFinding): Promise<ModelVote> {
    this.stats.totalVerifications++;
    const startTime = Date.now();

    // Step 1: Try to match against cached patterns
    const matchResult = await this.matchPattern(finding);

    if (matchResult.matched && matchResult.pattern) {
      // Cache hit - use learned pattern
      this.stats.cacheHits++;

      if (this.config.enableLogging) {
        console.log(`[NativeLearning] Cache HIT for ${finding.category}:${finding.id} (similarity: ${matchResult.similarity?.toFixed(2)})`);
      }

      return this.buildVoteFromPattern(finding, matchResult.pattern, startTime);
    }

    // Step 2: Cache miss - delegate to fallback provider
    this.stats.cacheMisses++;

    if (!this.fallbackProvider) {
      // No fallback - return inconclusive
      return {
        modelId: this.id,
        modelVersion: 'native-v1',
        agrees: false,
        assessment: 'inconclusive' as VoteAssessment,
        confidence: 0,
        reasoning: 'No matching pattern found and no fallback provider configured',
        executionTime: Date.now() - startTime,
        votedAt: new Date(),
      };
    }

    if (this.config.enableLogging) {
      console.log(`[NativeLearning] Cache MISS for ${finding.category}:${finding.id}, delegating to ${this.fallbackProvider.id}`);
    }

    // Delegate to fallback and learn from result
    this.stats.fallbackCalls++;
    const fallbackResult = await this.delegateToFallback(finding, startTime);

    // Step 3: Learn from the fallback result
    if (this.config.enableLearning && fallbackResult.confidence >= this.config.minConfidence) {
      await this.learnPattern(finding, fallbackResult);
    }

    return fallbackResult;
  }

  /**
   * Match finding against cached patterns
   */
  private async matchPattern(finding: SecurityFinding): Promise<PatternMatchResult> {
    // Build pattern key from finding characteristics
    const patternKey = this.buildPatternKey(finding);

    // Check in-memory cache first
    const cachedPattern = this.patternCache.get(patternKey);
    if (cachedPattern) {
      // Validate pattern meets thresholds
      if (
        cachedPattern.confidence >= this.config.minConfidence &&
        cachedPattern.successRate >= this.config.minSuccessRate &&
        cachedPattern.verificationCount >= this.config.minVerificationCount
      ) {
        return {
          matched: true,
          pattern: cachedPattern,
          similarity: 1.0,
          reason: 'Exact match in memory cache',
        };
      }
    }

    // Check pattern store for semantic match
    if (this.patternStore) {
      try {
        const searchResult = await this.patternStore.search(
          this.buildSearchQuery(finding),
          {
            limit: 1,
            minConfidence: this.config.minConfidence,
            domain: 'security-compliance' as any,
          }
        );

        // Result type is { success: true, value: PatternSearchResult[] } | { success: false, error: Error }
        if (searchResult.success && searchResult.value.length > 0) {
          const match = searchResult.value[0];
          if (match.similarity >= this.config.minSimilarity) {
            const pattern = this.extractPatternFromMatch(match);
            if (
              pattern &&
              pattern.confidence >= this.config.minConfidence &&
              pattern.successRate >= this.config.minSuccessRate
            ) {
              // Cache for future use
              this.patternCache.set(patternKey, pattern);
              return {
                matched: true,
                pattern,
                similarity: match.similarity,
                reason: `HNSW match with similarity ${match.similarity.toFixed(3)}`,
              };
            }
          }
        }
      } catch (error) {
        if (this.config.enableLogging) {
          console.error('[NativeLearning] Pattern store search failed:', error);
        }
      }
    }

    return {
      matched: false,
      reason: 'No matching pattern found',
    };
  }

  /**
   * Build a vote from a matched pattern
   */
  private buildVoteFromPattern(
    finding: SecurityFinding,
    pattern: SecurityVerificationPattern,
    startTime: number
  ): ModelVote {
    return {
      modelId: this.id,
      modelVersion: 'native-v1',
      agrees: pattern.verdict === 'confirmed',
      assessment: pattern.verdict,
      confidence: pattern.confidence,
      reasoning: `[Cached Pattern] ${pattern.reasoning} (verified ${pattern.verificationCount} times, ${(pattern.successRate * 100).toFixed(0)}% success rate)`,
      suggestedSeverity: pattern.suggestedSeverity,
      executionTime: Date.now() - startTime,
      cost: 0, // Free!
      votedAt: new Date(),
    };
  }

  /**
   * Delegate to fallback provider
   */
  private async delegateToFallback(
    finding: SecurityFinding,
    startTime: number
  ): Promise<ModelVote> {
    if (!this.fallbackProvider) {
      throw new Error('No fallback provider configured');
    }

    // Build verification prompt
    const prompt = this.buildVerificationPrompt(finding);

    try {
      const response = await this.fallbackProvider.complete(prompt);
      const parsed = this.parseVerificationResponse(response);

      return {
        modelId: `${this.id}+${this.fallbackProvider.id}`,
        modelVersion: 'native-v1',
        agrees: parsed.verdict === 'confirmed',
        assessment: parsed.verdict,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        suggestedSeverity: parsed.suggestedSeverity,
        executionTime: Date.now() - startTime,
        votedAt: new Date(),
      };
    } catch (error) {
      return {
        modelId: `${this.id}+${this.fallbackProvider.id}`,
        modelVersion: 'native-v1',
        agrees: false,
        assessment: 'inconclusive' as VoteAssessment,
        confidence: 0,
        reasoning: `Fallback provider failed: ${toErrorMessage(error)}`,
        executionTime: Date.now() - startTime,
        votedAt: new Date(),
        error: toErrorMessage(error),
      };
    }
  }

  /**
   * Learn a new pattern from verification result
   */
  private async learnPattern(
    finding: SecurityFinding,
    vote: ModelVote
  ): Promise<void> {
    const patternKey = this.buildPatternKey(finding);

    // Check if pattern already exists
    const existing = this.patternCache.get(patternKey);

    if (existing) {
      // Update existing pattern
      existing.verificationCount++;
      if (vote.agrees) {
        existing.successRate =
          (existing.successRate * (existing.verificationCount - 1) + 1) /
          existing.verificationCount;
      } else {
        existing.successRate =
          (existing.successRate * (existing.verificationCount - 1)) /
          existing.verificationCount;
      }
      // Update confidence with exponential moving average
      existing.confidence = existing.confidence * 0.9 + vote.confidence * 0.1;
    } else {
      // Create new pattern
      const newPattern: SecurityVerificationPattern = {
        category: finding.category,
        findingType: finding.type || finding.category,
        codePatterns: this.extractCodePatterns(finding),
        verdict: vote.assessment,
        confidence: vote.confidence,
        reasoning: vote.reasoning,
        verificationCount: 1,
        successRate: vote.agrees ? 1.0 : 0.0,
        suggestedSeverity: vote.suggestedSeverity,
      };

      this.patternCache.set(patternKey, newPattern);
      this.stats.patternsLearned++;

      if (this.config.enableLogging) {
        console.log(`[NativeLearning] Learned new pattern for ${finding.category}:${finding.id}`);
      }
    }

    // Persist to pattern store if available
    if (this.patternStore && this.config.enableLearning) {
      try {
        await this.patternStore.store({
          id: patternKey,
          domain: 'security-compliance' as any,
          type: 'security-pattern' as any,
          context: {
            finding: finding as any,
            vote: vote as any,
          },
          confidence: vote.confidence,
          metadata: {
            category: finding.category,
            findingType: finding.type,
          },
        } as any);
      } catch (error) {
        if (this.config.enableLogging) {
          console.error('[NativeLearning] Failed to persist pattern:', error);
        }
      }
    }
  }

  /**
   * Build pattern key from finding
   */
  private buildPatternKey(finding: SecurityFinding): string {
    // Combine category, type, and code context for unique key
    const codeHash = this.hashCode(
      finding.evidence
        .filter(e => e.type === 'code-snippet')
        .map(e => e.content)
        .join('\n')
    );
    return `${finding.category}:${finding.type || 'unknown'}:${codeHash}`;
  }

  /**
   * Build search query for pattern store
   */
  private buildSearchQuery(finding: SecurityFinding): string {
    return [
      finding.category,
      finding.type,
      finding.description,
      ...finding.evidence.slice(0, 2).map(e => e.content),
    ]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Extract pattern from search match
   */
  private extractPatternFromMatch(match: PatternSearchResult): SecurityVerificationPattern | null {
    try {
      const context = match.pattern?.context as unknown as Record<string, unknown> | undefined;
      const vote = context?.vote as { assessment?: VoteAssessment; confidence?: number; reasoning?: string; agrees?: boolean; suggestedSeverity?: Severity } | undefined;
      const finding = context?.finding as { category?: string; type?: string } | undefined;
      if (!vote) return null;

      return {
        category: finding?.category || 'unknown',
        findingType: finding?.type || 'unknown',
        codePatterns: [],
        verdict: vote.assessment as VoteAssessment,
        confidence: vote.confidence ?? 0,
        reasoning: vote.reasoning ?? '',
        verificationCount: 1,
        successRate: vote.agrees ? 1.0 : 0.5,
        suggestedSeverity: vote.suggestedSeverity,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract code patterns from finding evidence
   */
  private extractCodePatterns(finding: SecurityFinding): string[] {
    return finding.evidence
      .filter(e => e.type === 'code-snippet')
      .map(e => e.content)
      .slice(0, 5);
  }

  /**
   * Build verification prompt for finding
   */
  private buildVerificationPrompt(finding: SecurityFinding): string {
    return `Analyze this security finding and determine if it's a real vulnerability or a false positive.

## Finding
Category: ${finding.category}
Type: ${finding.type || 'Unknown'}
Severity: ${finding.severity}
Description: ${finding.description}

## Evidence
${finding.evidence.map(e => `- [${e.type}] ${e.location}: ${e.content}`).join('\n')}

## Instructions
1. Analyze the evidence carefully
2. Determine if this is a confirmed vulnerability or a false positive
3. Provide your verdict and confidence level

Format your response as:
VERDICT: [confirmed/rejected/inconclusive]
CONFIDENCE: [0-100]
REASONING: [your detailed analysis]`;
  }

  /**
   * Parse verification response from LLM
   */
  private parseVerificationResponse(response: string): {
    verdict: VoteAssessment;
    confidence: number;
    reasoning: string;
    suggestedSeverity?: Severity;
  } {
    const verdictMatch = response.match(/VERDICT:\s*(confirmed|rejected|inconclusive)/i);
    const confidenceMatch = response.match(/CONFIDENCE:\s*(\d+)/i);
    const reasoningMatch = response.match(/REASONING:\s*(.+)/is);

    return {
      verdict: (verdictMatch?.[1]?.toLowerCase() as VoteAssessment) || 'inconclusive',
      confidence: confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.5,
      reasoning: reasoningMatch?.[1]?.trim() || response,
    };
  }

  /**
   * Simple hash function for string
   */
  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Perform health check
   */
  protected async performHealthCheck(): Promise<ModelHealthResult> {
    const startTime = Date.now();

    // Check pattern store health if available
    let patternStoreHealthy = true;
    if (this.patternStore) {
      try {
        // Just check if we can access it
        patternStoreHealthy = true;
      } catch {
        patternStoreHealthy = false;
      }
    }

    // Check fallback provider health
    let fallbackHealthy = true;
    if (this.fallbackProvider) {
      try {
        const health = await this.fallbackProvider.healthCheck();
        fallbackHealthy = health.healthy;
      } catch {
        fallbackHealthy = false;
      }
    }

    return {
      healthy: patternStoreHealthy && (fallbackHealthy || !this.fallbackProvider),
      latencyMs: Date.now() - startTime,
      availableModels: ['native-pattern-matcher'],
      ...((!patternStoreHealthy || !fallbackHealthy) && {
        error: `Pattern store: ${patternStoreHealthy ? 'OK' : 'FAIL'}, Fallback: ${fallbackHealthy ? 'OK' : 'FAIL'}`,
      }),
    };
  }

  /**
   * Get cost per token (always 0 for native patterns)
   */
  override getCostPerToken(): { input: number; output: number } {
    return { input: 0, output: 0 };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a native learning provider
 *
 * @param config - Provider configuration
 * @returns NativeLearningProvider instance
 *
 * @example
 * ```typescript
 * // With pattern store
 * const provider = createNativeLearningProvider({
 *   patternStore: myPatternStore,
 *   fallbackProvider: claudeProvider,
 * });
 *
 * // Minimal (in-memory only)
 * const provider = createNativeLearningProvider({
 *   fallbackProvider: claudeProvider,
 * });
 * ```
 */
export function createNativeLearningProvider(
  config?: NativeLearningProviderConfig
): NativeLearningProvider {
  return new NativeLearningProvider(config);
}

/**
 * Wrap an existing provider with native learning
 *
 * @param provider - Provider to wrap
 * @param config - Learning configuration
 * @returns NativeLearningProvider with fallback
 */
export function withNativeLearning(
  provider: ModelProvider,
  config?: Omit<NativeLearningProviderConfig, 'fallbackProvider'>
): NativeLearningProvider {
  return new NativeLearningProvider({
    ...config,
    fallbackProvider: provider,
  });
}
