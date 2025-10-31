/**
 * QEReasoningBank - Intelligent Test Pattern Storage and Retrieval System
 *
 * @module reasoning/QEReasoningBank
 * @version 1.1.0
 *
 * @description
 * The QEReasoningBank provides a centralized system for storing, retrieving,
 * and sharing test patterns across projects and frameworks. It uses in-memory
 * storage with indexing for high-performance pattern matching.
 *
 * @example
 * ```typescript
 * import { QEReasoningBank } from './reasoning/QEReasoningBank';
 * import { TestPattern, PatternQuery } from './reasoning/types';
 *
 * // Initialize ReasoningBank
 * const reasoningBank = new QEReasoningBank();
 *
 * // Store a pattern
 * await reasoningBank.storePattern(pattern);
 *
 * // Find similar patterns
 * const matches = await reasoningBank.findMatchingPatterns({
 *   codeType: 'test',
 *   framework: 'jest',
 *   keywords: ['api', 'controller']
 * });
 * ```
 */

import { createHash } from 'crypto';
import { VectorSimilarity } from './VectorSimilarity';
import { PatternQualityScorer, QualityComponents } from './PatternQualityScorer';
import { Database } from '../utils/Database';
import { PatternDatabaseAdapter } from '../core/PatternDatabaseAdapter';

// ===========================================================================
// Test Interfaces (Phase 2 spec)
// ===========================================================================

export interface TestPattern {
  id: string;
  name: string;
  description: string;
  category: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  framework: 'jest' | 'mocha' | 'vitest' | 'playwright' | 'cypress' | 'jasmine' | 'ava';
  language: 'typescript' | 'javascript' | 'python';
  template: string;
  examples: string[];
  confidence: number;
  usageCount: number;
  successRate: number;
  quality?: number; // Overall quality score (0-1)
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version: string;
    tags: string[];
  };
}

export interface PatternMatch {
  pattern: TestPattern;
  confidence: number;
  similarity: number; // Vector similarity score (0-1)
  reasoning: string;
  applicability: number;
}

/**
 * QEReasoningBank - Main class for pattern storage and retrieval
 *
 * **Key Features:**
 * - In-memory pattern storage with indexing
 * - Fast pattern matching (< 50ms p95)
 * - Pattern versioning and history tracking
 * - Usage tracking and analytics
 * - Pattern quality scoring
 *
 * **Performance Characteristics:**
 * - Pattern lookup: < 50ms (p95)
 * - Pattern storage: < 25ms (p95)
 * - Supports 100+ patterns per project
 *
 * @public
 */
export class QEReasoningBank {
  private patterns: Map<string, TestPattern> = new Map();
  private patternIndex: Map<string, Set<string>> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map(); // NEW: keyword-based fast lookup
  private frameworkIndex: Map<string, Set<string>> = new Map(); // NEW: framework-based index
  private versionHistory: Map<string, TestPattern[]> = new Map();
  private vectorSimilarity: VectorSimilarity;
  private qualityScorer: PatternQualityScorer;
  private vectorCache: Map<string, number[]> = new Map();
  private similarityCache: Map<string, PatternMatch[]> = new Map(); // NEW: cache for similar patterns
  private cacheExpiryTime: number = 5 * 60 * 1000; // 5 minutes cache TTL
  private lastCacheCleanup: number = Date.now();
  private minQuality: number;
  private database?: Database; // NEW: Database for persistence
  private dbAdapter?: PatternDatabaseAdapter; // NEW: Database adapter for pattern operations
  private performanceMetrics: {
    lookupTimes: number[];
    cachehits: number;
    cacheMisses: number;
  };

  constructor(config: { minQuality?: number; database?: Database } = {}) {
    this.vectorSimilarity = new VectorSimilarity({ useIDF: true });
    this.qualityScorer = new PatternQualityScorer();
    this.minQuality = config.minQuality ?? 0.7;
    this.database = config.database;

    // Initialize database adapter if database is provided
    if (this.database) {
      this.dbAdapter = new PatternDatabaseAdapter(this.database);
    }

    this.performanceMetrics = {
      lookupTimes: [],
      cachehits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Initialize QEReasoningBank and load patterns from database
   * Uses PatternDatabaseAdapter for clean separation of concerns
   */
  public async initialize(): Promise<void> {
    if (!this.dbAdapter) {
      console.log('[QEReasoningBank] No database configured, running in memory-only mode');
      return;
    }

    try {
      // Initialize database adapter
      await this.dbAdapter.initialize();

      // Load existing patterns from database
      const patterns = await this.dbAdapter.loadPatterns({
        minQuality: this.minQuality
      });

      for (const pattern of patterns) {
        // Load into memory for fast access
        this.patterns.set(pattern.id, pattern);

        // Generate and cache vector embedding
        const patternText = this.getPatternText(pattern);
        this.vectorSimilarity.indexDocument(patternText);
        const vector = this.vectorSimilarity.generateEmbedding(patternText);
        this.vectorCache.set(pattern.id, vector);

        // Update indexes
        this.updateIndex(pattern);
      }

      console.log(`[QEReasoningBank] ✅ Loaded ${patterns.length} patterns from database`);
    } catch (error) {
      console.error('[QEReasoningBank] ❌ Failed to initialize:', error);
      throw new Error(`QEReasoningBank initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Store a new test pattern with quality scoring and vector indexing
   * NOW WITH DATABASE PERSISTENCE
   */
  public async storePattern(pattern: TestPattern): Promise<void> {
    // Validate pattern
    if (!pattern.id || !pattern.name || !pattern.template) {
      throw new Error('Invalid pattern: id, name, and template are required');
    }

    if (pattern.confidence < 0 || pattern.confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }

    // Calculate pattern quality if not provided
    if (pattern.quality === undefined) {
      const qualityScore = this.qualityScorer.calculateQuality({
        id: pattern.id,
        name: pattern.name,
        code: pattern.examples[0] || pattern.template,
        template: pattern.template,
        description: pattern.description,
        tags: pattern.metadata.tags,
        usageCount: pattern.usageCount,
        metadata: {
          successRate: pattern.successRate
        }
      });
      pattern.quality = qualityScore.overall;
    }

    // Only store patterns above minimum quality threshold
    if (pattern.quality < this.minQuality) {
      console.log(`[QEReasoningBank] Skipping low-quality pattern ${pattern.id} (quality: ${pattern.quality.toFixed(2)})`);
      return;
    }

    // Version existing pattern
    if (this.patterns.has(pattern.id)) {
      const existing = this.patterns.get(pattern.id)!;
      const history = this.versionHistory.get(pattern.id) || [];
      history.push({ ...existing });
      this.versionHistory.set(pattern.id, history);
    }

    // Store pattern in memory
    this.patterns.set(pattern.id, { ...pattern });

    // Generate and cache vector embedding
    const patternText = this.getPatternText(pattern);
    this.vectorSimilarity.indexDocument(patternText);
    const vector = this.vectorSimilarity.generateEmbedding(patternText);
    this.vectorCache.set(pattern.id, vector);

    // Update index for fast lookup
    this.updateIndex(pattern);

    // NEW: Persist to database using adapter
    if (this.dbAdapter) {
      try {
        await this.dbAdapter.storePattern(pattern);
        console.log(`[QEReasoningBank] ✅ Persisted pattern ${pattern.id} to database (quality: ${pattern.quality.toFixed(2)})`);
      } catch (error) {
        console.error(`[QEReasoningBank] ❌ Failed to persist pattern ${pattern.id}:`, error);
        // Don't throw - pattern is still in memory and functional
      }
    }
  }

  /**
   * Retrieve pattern by ID
   */
  public async getPattern(id: string): Promise<TestPattern | null> {
    return this.patterns.get(id) || null;
  }

  /**
   * Find matching patterns using vector similarity with performance optimizations
   * Target: 85%+ matching accuracy, <50ms p95 latency
   *
   * **Optimizations:**
   * - Caching: Frequently accessed patterns cached for 5 minutes
   * - Indexing: Multi-level indexes (keyword, framework, tag) for fast lookup
   * - Early termination: Stop processing when enough high-quality matches found
   * - Batch processing: Process multiple candidates in batches
   */
  public async findMatchingPatterns(
    context: {
      codeType: string;
      framework?: string;
      language?: string;
      keywords?: string[];
      sourceCode?: string; // Optional source code for better matching
    },
    limit: number = 10
  ): Promise<PatternMatch[]> {
    const startTime = performance.now();

    // Check cache first
    const cacheKey = this.getCacheKey(context);
    if (this.similarityCache.has(cacheKey)) {
      this.performanceMetrics.cachehits++;
      const cached = this.similarityCache.get(cacheKey)!;
      this.recordLookupTime(performance.now() - startTime);
      return cached.slice(0, limit);
    }

    this.performanceMetrics.cacheMisses++;

    // Use indexed lookup for fast candidate selection
    const candidates = this.getIndexedCandidates(context);

    // If we have indexed candidates, use them; otherwise fall back to full scan
    const vectorMatches = candidates.length > 0
      ? this.scoreIndexedCandidates(candidates, context, limit * 2)
      : await this.vectorSimilaritySearch(context, limit * 2);

    const matches: PatternMatch[] = [];
    let highQualityCount = 0;

    // Process candidates with early termination
    for (const vectorMatch of vectorMatches) {
      const pattern = this.patterns.get(vectorMatch.id);
      if (!pattern) continue;

      // Calculate hybrid confidence (vector similarity + rule-based)
      const ruleBased = this.calculateMatchConfidence(pattern, context);
      const vectorSim = vectorMatch.similarity;

      // Hybrid scoring: 60% vector similarity, 40% rule-based
      const confidence = vectorSim * 0.6 + ruleBased * 0.4;

      // Apply quality filter
      const meetsQuality = (pattern.quality ?? 1.0) >= this.minQuality;

      if (confidence > 0.3 && meetsQuality) {
        const applicability = confidence * pattern.successRate * (pattern.quality ?? 1.0);

        matches.push({
          pattern,
          confidence,
          similarity: vectorSim,
          reasoning: this.generateReasoning(pattern, context, vectorSim),
          applicability
        });

        // Early termination: if we have enough high-quality matches, stop
        if (applicability > 0.85) {
          highQualityCount++;
          if (highQualityCount >= limit && matches.length >= limit * 1.5) {
            break;
          }
        }
      }
    }

    // Sort by applicability (confidence × success rate × quality)
    matches.sort((a, b) => b.applicability - a.applicability);

    const result = matches.slice(0, limit);

    // Cache the result
    this.similarityCache.set(cacheKey, result);
    this.cleanupCacheIfNeeded();

    const lookupTime = performance.now() - startTime;
    this.recordLookupTime(lookupTime);

    return result;
  }

  /**
   * Get cache key for context
   */
  private getCacheKey(context: any): string {
    return JSON.stringify({
      codeType: context.codeType,
      framework: context.framework,
      language: context.language,
      keywords: context.keywords?.sort()
    });
  }

  /**
   * Get indexed candidates for fast lookup
   * Uses multi-level indexes (framework, keywords, tags)
   */
  private getIndexedCandidates(context: any): string[] {
    const candidateIds = new Set<string>();

    // Framework index lookup (most specific)
    if (context.framework && this.frameworkIndex.has(context.framework)) {
      this.frameworkIndex.get(context.framework)!.forEach(id => candidateIds.add(id));
    }

    // Keyword index lookup
    if (context.keywords && context.keywords.length > 0) {
      for (const keyword of context.keywords) {
        if (this.keywordIndex.has(keyword.toLowerCase())) {
          this.keywordIndex.get(keyword.toLowerCase())!.forEach(id => candidateIds.add(id));
        }
      }
    }

    return Array.from(candidateIds);
  }

  /**
   * Score indexed candidates efficiently
   */
  private scoreIndexedCandidates(
    candidateIds: string[],
    context: any,
    limit: number
  ): Array<{ id: string; similarity: number }> {
    const queryText = this.buildQueryText(context);
    const queryVector = this.vectorSimilarity.generateEmbedding(queryText);

    const scored = candidateIds
      .map(id => {
        const vector = this.vectorCache.get(id);
        if (!vector) return null;

        const similarity = this.vectorSimilarity.cosineSimilarity(queryVector, vector);
        return { id, similarity };
      })
      .filter((item): item is { id: string; similarity: number } => item !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return scored;
  }

  /**
   * Fallback vector similarity search
   */
  private async vectorSimilaritySearch(
    context: any,
    limit: number
  ): Promise<Array<{ id: string; similarity: number }>> {
    const queryText = this.buildQueryText(context);
    const queryVector = this.vectorSimilarity.generateEmbedding(queryText);

    return this.vectorSimilarity.findTopK(queryVector, this.vectorCache, limit);
  }

  /**
   * Record lookup time for performance monitoring
   */
  private recordLookupTime(timeMs: number): void {
    this.performanceMetrics.lookupTimes.push(timeMs);

    // Keep only last 1000 measurements
    if (this.performanceMetrics.lookupTimes.length > 1000) {
      this.performanceMetrics.lookupTimes.shift();
    }
  }

  /**
   * Cleanup cache if needed (every 5 minutes)
   */
  private cleanupCacheIfNeeded(): void {
    const now = Date.now();
    if (now - this.lastCacheCleanup > this.cacheExpiryTime) {
      this.similarityCache.clear();
      this.lastCacheCleanup = now;
    }
  }

  /**
   * Find similar patterns by example code
   * Uses vector similarity for code-based matching
   */
  public async findSimilarPatterns(
    exampleCode: string,
    framework?: string,
    limit: number = 5
  ): Promise<PatternMatch[]> {
    return this.findMatchingPatterns({
      codeType: 'test',
      framework,
      sourceCode: exampleCode,
      keywords: this.extractKeywords(exampleCode)
    }, limit);
  }

  /**
   * Update pattern success metrics with usage tracking
   * NOW WITH DATABASE PERSISTENCE VIA ADAPTER
   */
  public async updatePatternMetrics(
    patternId: string,
    success: boolean,
    context?: {
      executionTimeMs?: number;
      projectId?: string;
      agentId?: string;
      errorMessage?: string;
    }
  ): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern not found: ${patternId}`);
    }

    // Update usage count
    pattern.usageCount++;

    // Update success rate using exponential moving average
    const alpha = 0.3;
    pattern.successRate =
      pattern.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;

    // Update timestamp
    pattern.metadata.updatedAt = new Date();

    // NEW: Persist updated metrics to database using adapter
    if (this.dbAdapter) {
      try {
        // Update pattern metrics
        await this.dbAdapter.updatePatternMetrics(
          patternId,
          pattern.usageCount,
          pattern.successRate
        );

        // Track this usage
        await this.dbAdapter.trackUsage(
          patternId,
          success,
          context?.executionTimeMs,
          context
        );

        console.log(`[QEReasoningBank] ✅ Updated metrics for pattern ${patternId}: usage=${pattern.usageCount}, success=${(pattern.successRate * 100).toFixed(1)}%`);
      } catch (error) {
        console.error(`[QEReasoningBank] ❌ Failed to update pattern metrics:`, error);
        // Don't throw - metrics are updated in memory
      }
    }
  }

  /**
   * Get pattern statistics (alias for getStats for backward compatibility)
   */
  public async getStatistics(): Promise<{
    totalPatterns: number;
    averageConfidence: number;
    averageSuccessRate: number;
    averageQuality: number;
    byCategory: Record<string, number>;
    byFramework: Record<string, number>;
  }> {
    const patterns = Array.from(this.patterns.values());

    const stats = {
      totalPatterns: patterns.length,
      averageConfidence:
        patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length || 0,
      averageSuccessRate:
        patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length || 0,
      averageQuality:
        patterns.reduce((sum, p) => sum + (p.quality ?? 0), 0) / patterns.length || 0,
      byCategory: {} as Record<string, number>,
      byFramework: {} as Record<string, number>
    };

    for (const pattern of patterns) {
      stats.byCategory[pattern.category] = (stats.byCategory[pattern.category] || 0) + 1;
      stats.byFramework[pattern.framework] = (stats.byFramework[pattern.framework] || 0) + 1;
    }

    return stats;
  }

  /**
   * Get version history for a pattern
   */
  public async getVersionHistory(patternId: string): Promise<TestPattern[]> {
    return this.versionHistory.get(patternId) || [];
  }

  /**
   * Search patterns by tags
   */
  public async searchByTags(tags: string[]): Promise<TestPattern[]> {
    const results: TestPattern[] = [];

    for (const pattern of Array.from(this.patterns.values())) {
      const matchCount = pattern.metadata.tags.filter(tag =>
        tags.includes(tag)
      ).length;

      if (matchCount > 0) {
        results.push(pattern);
      }
    }

    // Sort by tag match count and success rate
    results.sort((a, b) => {
      const aMatches = a.metadata.tags.filter(t => tags.includes(t)).length;
      const bMatches = b.metadata.tags.filter(t => tags.includes(t)).length;

      if (aMatches !== bMatches) {
        return bMatches - aMatches;
      }

      return b.successRate - a.successRate;
    });

    return results;
  }

  // Private helper methods

  private updateIndex(pattern: TestPattern): void {
    // Index by category
    if (!this.patternIndex.has(pattern.category)) {
      this.patternIndex.set(pattern.category, new Set());
    }
    this.patternIndex.get(pattern.category)!.add(pattern.id);

    // Index by framework (NEW: fast framework lookup)
    if (!this.frameworkIndex.has(pattern.framework)) {
      this.frameworkIndex.set(pattern.framework, new Set());
    }
    this.frameworkIndex.get(pattern.framework)!.add(pattern.id);

    // Index by tags
    for (const tag of pattern.metadata.tags) {
      if (!this.patternIndex.has(`tag:${tag}`)) {
        this.patternIndex.set(`tag:${tag}`, new Set());
      }
      this.patternIndex.get(`tag:${tag}`)!.add(pattern.id);

      // Index by keyword (NEW: fast keyword lookup)
      const keyword = tag.toLowerCase();
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, new Set());
      }
      this.keywordIndex.get(keyword)!.add(pattern.id);
    }

    // Index name keywords (NEW)
    const nameWords = pattern.name.toLowerCase().split(/\s+/);
    for (const word of nameWords) {
      if (word.length > 2) { // Skip very short words
        if (!this.keywordIndex.has(word)) {
          this.keywordIndex.set(word, new Set());
        }
        this.keywordIndex.get(word)!.add(pattern.id);
      }
    }
  }

  private calculateMatchConfidence(
    pattern: TestPattern,
    context: { codeType: string; framework?: string; language?: string; keywords?: string[] }
  ): number {
    let score = 0;
    let factors = 0;

    // Framework match (35% weight)
    if (context.framework) {
      factors++;
      if (pattern.framework === context.framework) {
        score += 0.35;
      }
    }

    // Language match (25% weight)
    if (context.language) {
      factors++;
      if (pattern.language === context.language) {
        score += 0.25;
      }
    }

    // Keyword match (30% weight)
    if (context.keywords && context.keywords.length > 0) {
      factors++;
      const matchingKeywords = context.keywords.filter(kw =>
        pattern.metadata.tags.includes(kw) ||
        pattern.name.toLowerCase().includes(kw.toLowerCase()) ||
        pattern.description.toLowerCase().includes(kw.toLowerCase())
      );

      score += (matchingKeywords.length / context.keywords.length) * 0.30;
    }

    // Pattern confidence (10% weight)
    factors++;
    score += pattern.confidence * 0.10;

    return factors > 0 ? Math.min(score, 1.0) : 0;
  }

  private generateReasoning(
    pattern: TestPattern,
    context: { codeType: string; framework?: string; language?: string; keywords?: string[]; sourceCode?: string },
    similarity?: number
  ): string {
    const reasons: string[] = [];

    // Vector similarity score
    if (similarity !== undefined) {
      reasons.push(`Similarity: ${(similarity * 100).toFixed(1)}%`);
    }

    if (context.framework && pattern.framework === context.framework) {
      reasons.push(`Framework match: ${pattern.framework}`);
    }

    if (context.language && pattern.language === context.language) {
      reasons.push(`Language match: ${pattern.language}`);
    }

    if (context.keywords) {
      const matchingKeywords = context.keywords.filter(kw =>
        pattern.metadata.tags.includes(kw)
      );

      if (matchingKeywords.length > 0) {
        reasons.push(`Tag matches: ${matchingKeywords.join(', ')}`);
      }
    }

    if (pattern.quality !== undefined) {
      reasons.push(`Quality: ${(pattern.quality * 100).toFixed(1)}%`);
    }

    reasons.push(`Success rate: ${(pattern.successRate * 100).toFixed(1)}%`);
    reasons.push(`Used ${pattern.usageCount} times`);

    return reasons.join('; ');
  }

  /**
   * Build query text from context for vector matching
   */
  private buildQueryText(context: {
    codeType: string;
    framework?: string;
    language?: string;
    keywords?: string[];
    sourceCode?: string;
  }): string {
    const parts: string[] = [];

    parts.push(context.codeType);

    if (context.framework) {
      parts.push(context.framework);
    }

    if (context.language) {
      parts.push(context.language);
    }

    if (context.keywords) {
      parts.push(...context.keywords);
    }

    if (context.sourceCode) {
      // Extract meaningful tokens from source code
      parts.push(...this.extractKeywords(context.sourceCode));
    }

    return parts.join(' ');
  }

  /**
   * Get pattern text for vector embedding
   */
  private getPatternText(pattern: TestPattern): string {
    const parts: string[] = [];

    parts.push(pattern.name);
    parts.push(pattern.description);
    parts.push(pattern.category);
    parts.push(pattern.framework);
    parts.push(...pattern.metadata.tags);

    if (pattern.examples.length > 0) {
      parts.push(...this.extractKeywords(pattern.examples[0]));
    }

    return parts.join(' ');
  }

  /**
   * Extract keywords from code
   */
  private extractKeywords(code: string): string[] {
    // Simple keyword extraction (can be enhanced with AST analysis)
    const keywords: string[] = [];

    // Extract function/method names
    const functionMatches = code.match(/function\s+(\w+)|const\s+(\w+)\s*=/g);
    if (functionMatches) {
      keywords.push(...functionMatches.map(m => m.replace(/function|const|=|\s/g, '')));
    }

    // Extract identifiers (camelCase, snake_case)
    const identifiers = code.match(/\b[a-z_][a-zA-Z0-9_]{2,}\b/g);
    if (identifiers) {
      keywords.push(...identifiers.slice(0, 20)); // Limit to avoid noise
    }

    return keywords.filter(k => k.length > 2);
  }

  /**
   * Match a pattern by exact ID
   * Alias for getPattern for consistency with pattern matching API
   */
  public async matchPattern(patternId: string): Promise<TestPattern | null> {
    return this.getPattern(patternId);
  }

  /**
   * Find patterns using flexible search criteria
   * Supports multiple search strategies: vector similarity, tag matching, keyword search
   */
  public async findPattern(
    criteria: {
      query?: string;
      category?: TestPattern['category'];
      framework?: TestPattern['framework'];
      language?: TestPattern['language'];
      tags?: string[];
      minConfidence?: number;
      minQuality?: number;
    },
    limit: number = 10
  ): Promise<PatternMatch[]> {
    // If query provided, use vector similarity search
    if (criteria.query) {
      return this.findMatchingPatterns({
        codeType: 'test',
        framework: criteria.framework,
        language: criteria.language,
        keywords: criteria.tags,
        sourceCode: criteria.query
      }, limit);
    }

    // Otherwise, use filter-based search
    let patterns = Array.from(this.patterns.values());

    // Apply filters
    if (criteria.category) {
      patterns = patterns.filter(p => p.category === criteria.category);
    }
    if (criteria.framework) {
      patterns = patterns.filter(p => p.framework === criteria.framework);
    }
    if (criteria.language) {
      patterns = patterns.filter(p => p.language === criteria.language);
    }
    if (criteria.tags && criteria.tags.length > 0) {
      patterns = patterns.filter(p =>
        criteria.tags!.some(tag => p.metadata.tags.includes(tag))
      );
    }
    if (criteria.minConfidence !== undefined) {
      patterns = patterns.filter(p => p.confidence >= criteria.minConfidence!);
    }
    if (criteria.minQuality !== undefined) {
      patterns = patterns.filter(p => (p.quality ?? 0) >= criteria.minQuality!);
    }

    // Sort by quality and success rate
    patterns.sort((a, b) => {
      const scoreA = (a.quality ?? 0.5) * a.successRate * a.confidence;
      const scoreB = (b.quality ?? 0.5) * b.successRate * b.confidence;
      return scoreB - scoreA;
    });

    // Convert to PatternMatch format
    return patterns.slice(0, limit).map(pattern => ({
      pattern,
      confidence: pattern.confidence,
      similarity: 1.0, // Filter-based match is exact
      reasoning: this.generateReasoning(pattern, {
        codeType: 'test',
        framework: criteria.framework,
        language: criteria.language,
        keywords: criteria.tags
      }),
      applicability: pattern.confidence * pattern.successRate * (pattern.quality ?? 1.0)
    }));
  }

  /**
   * Calculate similarity score between two patterns
   * Returns a score between 0-1 indicating how similar the patterns are
   */
  public calculateSimilarity(pattern1: TestPattern, pattern2: TestPattern): number {
    let score = 0;
    let weights = 0;

    // Framework match (25% weight)
    weights += 0.25;
    if (pattern1.framework === pattern2.framework) {
      score += 0.25;
    }

    // Language match (20% weight)
    weights += 0.20;
    if (pattern1.language === pattern2.language) {
      score += 0.20;
    }

    // Category match (20% weight)
    weights += 0.20;
    if (pattern1.category === pattern2.category) {
      score += 0.20;
    }

    // Tag overlap (35% weight)
    weights += 0.35;
    const tags1 = new Set(pattern1.metadata.tags);
    const tags2 = new Set(pattern2.metadata.tags);
    const intersection = new Set([...tags1].filter(t => tags2.has(t)));
    const union = new Set([...tags1, ...tags2]);
    const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;
    score += jaccardSimilarity * 0.35;

    return score / weights;
  }

  /**
   * Search patterns by similarity to a reference pattern
   */
  public async searchSimilarPatterns(
    referencePattern: TestPattern,
    limit: number = 5
  ): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];

    for (const pattern of Array.from(this.patterns.values())) {
      if (pattern.id === referencePattern.id) continue;

      const similarity = this.calculateSimilarity(referencePattern, pattern);

      if (similarity > 0.3) {
        matches.push({
          pattern,
          confidence: pattern.confidence,
          similarity,
          reasoning: `Similar pattern: ${(similarity * 100).toFixed(1)}% match`,
          applicability: similarity * pattern.successRate * (pattern.quality ?? 1.0)
        });
      }
    }

    // Sort by similarity and quality
    matches.sort((a, b) => b.applicability - a.applicability);

    return matches.slice(0, limit);
  }

  /**
   * Load patterns from registry file
   */
  public async loadFromRegistry(registryPath: string): Promise<number> {
    try {
      const fs = await import('fs/promises');
      const registryData = await fs.readFile(registryPath, 'utf-8');
      const registry = JSON.parse(registryData);

      if (!registry.patterns || !Array.isArray(registry.patterns)) {
        throw new Error('Invalid registry format: patterns array not found');
      }

      let loadedCount = 0;
      for (const pattern of registry.patterns) {
        // Convert date strings to Date objects
        if (pattern.metadata?.createdAt) {
          pattern.metadata.createdAt = new Date(pattern.metadata.createdAt);
        }
        if (pattern.metadata?.updatedAt) {
          pattern.metadata.updatedAt = new Date(pattern.metadata.updatedAt);
        }

        await this.storePattern(pattern);
        loadedCount++;
      }

      return loadedCount;
    } catch (error) {
      throw new Error(`Failed to load patterns from registry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save patterns to registry file
   */
  public async saveToRegistry(registryPath: string, filter?: Partial<TestPattern>): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const patterns = this.exportPatterns(filter);
      const stats = this.getStats();

      const registry = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        patterns,
        statistics: stats
      };

      // Ensure directory exists
      const dir = path.dirname(registryPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save patterns to registry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Export patterns for cross-project sharing
   */
  public exportPatterns(filter?: Partial<TestPattern>): TestPattern[] {
    let patterns = Array.from(this.patterns.values());

    if (filter) {
      patterns = patterns.filter(p => {
        if (filter.framework && p.framework !== filter.framework) return false;
        if (filter.category && p.category !== filter.category) return false;
        if (filter.language && p.language !== filter.language) return false;
        return true;
      });
    }

    return patterns;
  }

  /**
   * Import patterns from another project
   */
  public async importPatterns(patterns: TestPattern[]): Promise<void> {
    for (const pattern of patterns) {
      await this.storePattern(pattern);
    }
  }

  /**
   * Get pattern statistics including quality metrics
   */
  public getStats(): {
    totalPatterns: number;
    byFramework: Record<string, number>;
    byCategory: Record<string, number>;
    averageQuality: number;
    averageSuccessRate: number;
  } {
    const patterns = Array.from(this.patterns.values());

    const stats = {
      totalPatterns: patterns.length,
      byFramework: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      averageQuality: patterns.reduce((sum, p) => sum + (p.quality ?? 0), 0) / patterns.length || 0,
      averageSuccessRate: patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length || 0
    };

    for (const pattern of patterns) {
      stats.byFramework[pattern.framework] = (stats.byFramework[pattern.framework] || 0) + 1;
      stats.byCategory[pattern.category] = (stats.byCategory[pattern.category] || 0) + 1;
    }

    return stats;
  }

  /**
   * Get performance metrics (NEW)
   * Returns timing statistics for pattern matching operations
   */
  public getPerformanceMetrics(): {
    avgLookupTime: number;
    p95LookupTime: number;
    p99LookupTime: number;
    cacheHitRate: number;
    totalLookups: number;
  } {
    const times = this.performanceMetrics.lookupTimes;
    if (times.length === 0) {
      return {
        avgLookupTime: 0,
        p95LookupTime: 0,
        p99LookupTime: 0,
        cacheHitRate: 0,
        totalLookups: 0
      };
    }

    const sorted = [...times].sort((a, b) => a - b);
    const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    const totalRequests = this.performanceMetrics.cachehits + this.performanceMetrics.cacheMisses;
    const cacheHitRate = totalRequests > 0
      ? (this.performanceMetrics.cachehits / totalRequests) * 100
      : 0;

    return {
      avgLookupTime: parseFloat(avg.toFixed(2)),
      p95LookupTime: parseFloat(sorted[p95Index].toFixed(2)),
      p99LookupTime: parseFloat(sorted[p99Index].toFixed(2)),
      cacheHitRate: parseFloat(cacheHitRate.toFixed(2)),
      totalLookups: times.length
    };
  }

  /**
   * Reset performance metrics (for testing)
   */
  public resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      lookupTimes: [],
      cachehits: 0,
      cacheMisses: 0
    };
  }
}

export default QEReasoningBank;
