/**
 * Unit Tests for QEReasoningBank
 *
 * Tests pattern storage, retrieval, matching, and versioning for test generation patterns.
 * Target: 90%+ coverage
 *
 * @module tests/unit/reasoning/QEReasoningBank
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ===========================================================================
// Test Interfaces (Phase 2 spec)
// ===========================================================================

export interface TestPattern {
  id: string;
  name: string;
  description: string;
  category: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  framework: 'jest' | 'mocha' | 'vitest' | 'playwright';
  language: 'typescript' | 'javascript' | 'python';
  template: string;
  examples: string[];
  confidence: number;
  usageCount: number;
  successRate: number;
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
  reasoning: string;
  applicability: number;
}

export class QEReasoningBank {
  private patterns: Map<string, TestPattern> = new Map();
  private patternIndex: Map<string, Set<string>> = new Map();
  private versionHistory: Map<string, TestPattern[]> = new Map();

  /**
   * Store a new test pattern
   */
  public async storePattern(pattern: TestPattern): Promise<void> {
    // Validate pattern
    if (!pattern.id || !pattern.name || !pattern.template) {
      throw new Error('Invalid pattern: id, name, and template are required');
    }

    if (pattern.confidence < 0 || pattern.confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
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
   * Find matching patterns for a code context
   */
  public async findMatchingPatterns(
    context: {
      codeType: string;
      framework?: string;
      language?: string;
      keywords?: string[];
    },
    limit: number = 10
  ): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];

    for (const pattern of this.patterns.values()) {
      const confidence = this.calculateMatchConfidence(pattern, context);

      if (confidence > 0.3) { // Threshold
        matches.push({
          pattern,
          confidence,
          reasoning: this.generateReasoning(pattern, context),
          applicability: confidence * pattern.successRate
        });
      }
    }

    // Sort by applicability
    matches.sort((a, b) => b.applicability - a.applicability);

    return matches.slice(0, limit);
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
   * Get pattern statistics
   */
  public async getStatistics(): Promise<{
    totalPatterns: number;
    averageConfidence: number;
    averageSuccessRate: number;
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

    for (const pattern of this.patterns.values()) {
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
    context: { codeType: string; framework?: string; language?: string; keywords?: string[] }
  ): string {
    const reasons: string[] = [];

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

    reasons.push(`Success rate: ${(pattern.successRate * 100).toFixed(1)}%`);
    reasons.push(`Used ${pattern.usageCount} times`);

    return reasons.join('; ');
  }
}

// ===========================================================================
// Unit Tests
// ===========================================================================

describe('QEReasoningBank', () => {
  let reasoningBank: QEReasoningBank;

  beforeEach(() => {
    reasoningBank = new QEReasoningBank();
  });

  afterEach(() => {
    // Cleanup if needed
  });

  // -------------------------------------------------------------------------
  // Pattern Storage Tests
  // -------------------------------------------------------------------------

  describe('Pattern Storage', () => {
    it('should store a valid pattern', async () => {
      const pattern: TestPattern = {
        id: 'pattern-001',
        name: 'API Controller Test',
        description: 'Pattern for testing Express.js controllers',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'describe("{{controllerName}}", () => { ... })',
        examples: ['describe("UserController", () => {})'],
        confidence: 0.95,
        usageCount: 0,
        successRate: 0.90,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['api', 'controller', 'express']
        }
      };

      await reasoningBank.storePattern(pattern);
      const retrieved = await reasoningBank.getPattern('pattern-001');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('API Controller Test');
      expect(retrieved?.framework).toBe('jest');
    });

    it('should reject invalid pattern (missing required fields)', async () => {
      const invalidPattern: any = {
        id: '',
        name: 'Test',
        // Missing template
      };

      await expect(reasoningBank.storePattern(invalidPattern))
        .rejects.toThrow('Invalid pattern');
    });

    it('should reject pattern with invalid confidence', async () => {
      const pattern: any = {
        id: 'pattern-002',
        name: 'Test',
        template: 'test()',
        confidence: 1.5 // Invalid
      };

      await expect(reasoningBank.storePattern(pattern))
        .rejects.toThrow('Confidence must be between 0 and 1');
    });

    it('should version existing patterns on update', async () => {
      const v1: TestPattern = {
        id: 'pattern-003',
        name: 'Test V1',
        description: 'Version 1',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'v1 template',
        examples: [],
        confidence: 0.8,
        usageCount: 0,
        successRate: 0.7,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: []
        }
      };

      await reasoningBank.storePattern(v1);

      const v2: TestPattern = {
        ...v1,
        template: 'v2 template',
        metadata: { ...v1.metadata, version: '2.0.0' }
      };

      await reasoningBank.storePattern(v2);

      const history = await reasoningBank.getVersionHistory('pattern-003');
      expect(history).toHaveLength(1);
      expect(history[0].template).toBe('v1 template');

      const current = await reasoningBank.getPattern('pattern-003');
      expect(current?.template).toBe('v2 template');
    });

    it('should store multiple patterns with different categories', async () => {
      const patterns: TestPattern[] = [
        {
          id: 'p1',
          name: 'Unit Test',
          description: 'Unit test pattern',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'test1',
          examples: [],
          confidence: 0.9,
          usageCount: 0,
          successRate: 0.85,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: []
          }
        },
        {
          id: 'p2',
          name: 'Integration Test',
          description: 'Integration test pattern',
          category: 'integration',
          framework: 'jest',
          language: 'typescript',
          template: 'test2',
          examples: [],
          confidence: 0.85,
          usageCount: 0,
          successRate: 0.80,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: []
          }
        }
      ];

      for (const p of patterns) {
        await reasoningBank.storePattern(p);
      }

      const stats = await reasoningBank.getStatistics();
      expect(stats.totalPatterns).toBe(2);
      expect(stats.byCategory['unit']).toBe(1);
      expect(stats.byCategory['integration']).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Pattern Retrieval Tests
  // -------------------------------------------------------------------------

  describe('Pattern Retrieval', () => {
    beforeEach(async () => {
      // Seed test patterns
      const patterns: TestPattern[] = [
        {
          id: 'jest-unit-1',
          name: 'Jest Unit Test',
          description: 'Standard Jest unit test',
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          template: 'describe("{{name}}", () => { it("should {{action}}", () => { }) })',
          examples: [],
          confidence: 0.95,
          usageCount: 100,
          successRate: 0.92,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['jest', 'unit', 'typescript']
          }
        },
        {
          id: 'playwright-e2e-1',
          name: 'Playwright E2E Test',
          description: 'Playwright end-to-end test',
          category: 'e2e',
          framework: 'playwright',
          language: 'typescript',
          template: 'test("{{scenario}}", async ({ page }) => { })',
          examples: [],
          confidence: 0.88,
          usageCount: 50,
          successRate: 0.85,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['playwright', 'e2e', 'browser']
          }
        },
        {
          id: 'jest-integration-1',
          name: 'Jest Integration Test',
          description: 'Integration test with database',
          category: 'integration',
          framework: 'jest',
          language: 'typescript',
          template: 'describe("Integration: {{module}}", () => { })',
          examples: [],
          confidence: 0.90,
          usageCount: 75,
          successRate: 0.88,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: ['jest', 'integration', 'database']
          }
        }
      ];

      for (const p of patterns) {
        await reasoningBank.storePattern(p);
      }
    });

    it('should retrieve pattern by ID', async () => {
      const pattern = await reasoningBank.getPattern('jest-unit-1');
      expect(pattern).not.toBeNull();
      expect(pattern?.name).toBe('Jest Unit Test');
    });

    it('should return null for non-existent pattern', async () => {
      const pattern = await reasoningBank.getPattern('non-existent');
      expect(pattern).toBeNull();
    });

    it('should find matching patterns by framework', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest'
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(m => m.pattern.framework === 'jest')).toBe(true);
    });

    it('should find matching patterns by language', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        language: 'typescript'
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(m => m.pattern.language === 'typescript')).toBe(true);
    });

    it('should find matching patterns by keywords', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        keywords: ['jest', 'unit']
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.id).toBe('jest-unit-1');
    });

    it('should sort matches by applicability (confidence × success rate)', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        keywords: ['integration']
      });

      expect(matches.length).toBeGreaterThan(0);

      // Check sorted order
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].applicability).toBeGreaterThanOrEqual(matches[i].applicability);
      }
    });

    it('should limit results to specified count', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test'
      }, 2);

      expect(matches.length).toBeLessThanOrEqual(2);
    });

    it('should include reasoning for matches', async () => {
      const matches = await reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: 'jest',
        keywords: ['unit']
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].reasoning).toContain('Framework match');
      expect(matches[0].reasoning).toContain('Tag matches');
      expect(matches[0].reasoning).toContain('Success rate');
    });

    it('should search patterns by tags', async () => {
      const results = await reasoningBank.searchByTags(['jest', 'unit']);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].metadata.tags).toContain('jest');
    });

    it('should return empty array for non-matching tags', async () => {
      const results = await reasoningBank.searchByTags(['non-existent-tag']);

      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Pattern Metrics Tests
  // -------------------------------------------------------------------------

  describe('Pattern Metrics', () => {
    beforeEach(async () => {
      const pattern: TestPattern = {
        id: 'metrics-test',
        name: 'Metrics Test Pattern',
        description: 'For testing metrics',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test',
        examples: [],
        confidence: 0.8,
        usageCount: 10,
        successRate: 0.7,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: []
        }
      };

      await reasoningBank.storePattern(pattern);
    });

    it('should update usage count on success', async () => {
      const before = await reasoningBank.getPattern('metrics-test');
      const initialCount = before!.usageCount;

      await reasoningBank.updatePatternMetrics('metrics-test', true);

      const after = await reasoningBank.getPattern('metrics-test');
      expect(after!.usageCount).toBe(initialCount + 1);
    });

    it('should update success rate using exponential moving average', async () => {
      const before = await reasoningBank.getPattern('metrics-test');
      const initialRate = before!.successRate;

      await reasoningBank.updatePatternMetrics('metrics-test', true);

      const after = await reasoningBank.getPattern('metrics-test');
      expect(after!.successRate).toBeGreaterThan(initialRate);
      expect(after!.successRate).toBeLessThanOrEqual(1.0);
    });

    it('should decrease success rate on failure', async () => {
      const before = await reasoningBank.getPattern('metrics-test');
      const initialRate = before!.successRate;

      await reasoningBank.updatePatternMetrics('metrics-test', false);

      const after = await reasoningBank.getPattern('metrics-test');
      expect(after!.successRate).toBeLessThan(initialRate);
    });

    it('should update timestamp on metrics update', async () => {
      const before = await reasoningBank.getPattern('metrics-test');
      const initialTime = before!.metadata.updatedAt.getTime();

      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

      await reasoningBank.updatePatternMetrics('metrics-test', true);

      const after = await reasoningBank.getPattern('metrics-test');
      expect(after!.metadata.updatedAt.getTime()).toBeGreaterThan(initialTime);
    });

    it('should throw error when updating non-existent pattern', async () => {
      await expect(reasoningBank.updatePatternMetrics('non-existent', true))
        .rejects.toThrow('Pattern not found');
    });

    it('should calculate accurate statistics', async () => {
      const stats = await reasoningBank.getStatistics();

      expect(stats.totalPatterns).toBeGreaterThan(0);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.averageSuccessRate).toBeGreaterThan(0);
      expect(stats.byCategory).toBeDefined();
      expect(stats.byFramework).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Performance Tests (<50ms p95 for lookups)
  // -------------------------------------------------------------------------

  describe('Performance', () => {
    beforeEach(async () => {
      // Seed 100 patterns
      for (let i = 0; i < 100; i++) {
        const pattern: TestPattern = {
          id: `perf-${i}`,
          name: `Pattern ${i}`,
          description: `Performance test pattern ${i}`,
          category: i % 2 === 0 ? 'unit' : 'integration',
          framework: 'jest',
          language: 'typescript',
          template: `template-${i}`,
          examples: [],
          confidence: 0.8 + Math.random() * 0.2,
          usageCount: Math.floor(Math.random() * 100),
          successRate: 0.7 + Math.random() * 0.3,
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0',
            tags: [`tag-${i % 10}`]
          }
        };

        await reasoningBank.storePattern(pattern);
      }
    });

    it('should retrieve pattern by ID in <50ms (p95)', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await reasoningBank.getPattern(`perf-${i % 100}`);
        const duration = performance.now() - start;
        measurements.push(duration);
      }

      measurements.sort((a, b) => a - b);
      const p95 = measurements[Math.floor(measurements.length * 0.95)];

      expect(p95).toBeLessThan(50);
    });

    it('should find matching patterns in <50ms (p95)', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        await reasoningBank.findMatchingPatterns({
          codeType: 'test',
          framework: 'jest',
          keywords: ['tag-0']
        });
        const duration = performance.now() - start;
        measurements.push(duration);
      }

      measurements.sort((a, b) => a - b);
      const p95 = measurements[Math.floor(measurements.length * 0.95)];

      expect(p95).toBeLessThan(50);
    });

    it('should search by tags in <50ms (p95)', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        await reasoningBank.searchByTags(['tag-0', 'tag-1']);
        const duration = performance.now() - start;
        measurements.push(duration);
      }

      measurements.sort((a, b) => a - b);
      const p95 = measurements[Math.floor(measurements.length * 0.95)];

      expect(p95).toBeLessThan(50);
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty pattern bank', async () => {
      const stats = await reasoningBank.getStatistics();

      expect(stats.totalPatterns).toBe(0);
      expect(stats.averageConfidence).toBe(0);
    });

    it('should handle pattern with empty tags', async () => {
      const pattern: TestPattern = {
        id: 'empty-tags',
        name: 'No Tags',
        description: 'Pattern without tags',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test',
        examples: [],
        confidence: 0.9,
        usageCount: 0,
        successRate: 0.8,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: []
        }
      };

      await reasoningBank.storePattern(pattern);
      const retrieved = await reasoningBank.getPattern('empty-tags');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.metadata.tags).toEqual([]);
    });

    it('should handle pattern with maximum confidence (1.0)', async () => {
      const pattern: TestPattern = {
        id: 'max-confidence',
        name: 'Max Confidence',
        description: 'Pattern with max confidence',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test',
        examples: [],
        confidence: 1.0,
        usageCount: 0,
        successRate: 1.0,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: []
        }
      };

      await expect(reasoningBank.storePattern(pattern)).resolves.not.toThrow();
    });

    it('should handle pattern with minimum confidence (0.0)', async () => {
      const pattern: TestPattern = {
        id: 'min-confidence',
        name: 'Min Confidence',
        description: 'Pattern with min confidence',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test',
        examples: [],
        confidence: 0.0,
        usageCount: 0,
        successRate: 0.0,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: []
        }
      };

      await expect(reasoningBank.storePattern(pattern)).resolves.not.toThrow();
    });

    it('should handle concurrent pattern updates', async () => {
      const pattern: TestPattern = {
        id: 'concurrent-test',
        name: 'Concurrent Test',
        description: 'For concurrent updates',
        category: 'unit',
        framework: 'jest',
        language: 'typescript',
        template: 'test',
        examples: [],
        confidence: 0.8,
        usageCount: 0,
        successRate: 0.7,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: []
        }
      };

      await reasoningBank.storePattern(pattern);

      // Simulate concurrent metric updates
      const updates = [];
      for (let i = 0; i < 10; i++) {
        updates.push(reasoningBank.updatePatternMetrics('concurrent-test', i % 2 === 0));
      }

      await Promise.all(updates);

      const result = await reasoningBank.getPattern('concurrent-test');
      expect(result!.usageCount).toBe(10);
    });
  });
});
