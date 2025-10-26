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
  private versionHistory: Map<string, TestPattern[]> = new Map();
  private vectorSimilarity: VectorSimilarity;
  private qualityScorer: PatternQualityScorer;
  private vectorCache: Map<string, number[]> = new Map();
  private minQuality: number;

  constructor(config: { minQuality?: number } = {}) {
    this.vectorSimilarity = new VectorSimilarity({ useIDF: true });
    this.qualityScorer = new PatternQualityScorer();
    this.minQuality = config.minQuality ?? 0.7;
  }

  /**
   * Store a new test pattern with quality scoring and vector indexing
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

    // Version existing pattern
    if (this.patterns.has(pattern.id)) {
      const existing = this.patterns.get(pattern.id)!;
      const history = this.versionHistory.get(pattern.id) || [];
      history.push({ ...existing });
      this.versionHistory.set(pattern.id, history);
    }

    // Store pattern
    this.patterns.set(pattern.id, { ...pattern });

    // Generate and cache vector embedding
    const patternText = this.getPatternText(pattern);
    this.vectorSimilarity.indexDocument(patternText);
    const vector = this.vectorSimilarity.generateEmbedding(patternText);
    this.vectorCache.set(pattern.id, vector);

    // Update index for fast lookup
    this.updateIndex(pattern);
  }

  /**
   * Retrieve pattern by ID
   */
  public async getPattern(id: string): Promise<TestPattern | null> {
    return this.patterns.get(id) || null;
  }

  /**
   * Find matching patterns using vector similarity
   * Target: 85%+ matching accuracy
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
    // Build query text from context
    const queryText = this.buildQueryText(context);
    const queryVector = this.vectorSimilarity.generateEmbedding(queryText);

    // Find top-K similar patterns using vector similarity
    const vectorMatches = this.vectorSimilarity.findTopK(
      queryVector,
      this.vectorCache,
      limit * 2 // Get more candidates for filtering
    );

    const matches: PatternMatch[] = [];

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
        matches.push({
          pattern,
          confidence,
          similarity: vectorSim,
          reasoning: this.generateReasoning(pattern, context, vectorSim),
          applicability: confidence * pattern.successRate * (pattern.quality ?? 1.0)
        });
      }
    }

    // Sort by applicability (confidence × success rate × quality)
    matches.sort((a, b) => b.applicability - a.applicability);

    return matches.slice(0, limit);
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
   * Update pattern success metrics
   */
  public async updatePatternMetrics(
    patternId: string,
    success: boolean
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

    // Index by tags
    for (const tag of pattern.metadata.tags) {
      if (!this.patternIndex.has(`tag:${tag}`)) {
        this.patternIndex.set(`tag:${tag}`, new Set());
      }
      this.patternIndex.get(`tag:${tag}`)!.add(pattern.id);
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
}

export default QEReasoningBank;
