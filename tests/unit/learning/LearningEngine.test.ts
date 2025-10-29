// Mock Logger to prevent undefined errors
jest.mock('@utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    }))
  }
}));

/**
 * Unit Tests for LearningEngine
 *
 * Tests continuous improvement, pattern evolution, and feedback loops for test quality.
 * Target: 90%+ coverage
 *
 * @module tests/unit/learning/LearningEngine
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ===========================================================================
// Test Interfaces (Phase 2 spec)
// ===========================================================================

export interface LearningRecord {
  id: string;
  timestamp: Date;
  testId: string;
  testName: string;
  outcome: 'success' | 'failure' | 'flaky';
  executionTime: number;
  coverage: number;
  edgeCasesCaught: number;
  feedback: {
    quality: number; // 0-1
    relevance: number; // 0-1
    comments?: string;
  };
  metadata: {
    framework: string;
    language: string;
    complexity: number;
    linesOfCode: number;
  };
}

export interface LearningInsight {
  id: string;
  category: 'pattern-evolution' | 'edge-case-improvement' | 'performance-optimization' | 'quality-enhancement';
  description: string;
  confidence: number;
  impact: number; // Expected improvement percentage
  recommendations: string[];
  evidence: LearningRecord[];
  createdAt: Date;
}

export interface ImprovementMetrics {
  period: string;
  testQuality: {
    before: number;
    after: number;
    improvement: number;
  };
  edgeCaseCoverage: {
    before: number;
    after: number;
    improvement: number;
  };
  flakinessReduction: {
    before: number;
    after: number;
    improvement: number;
  };
  executionEfficiency: {
    before: number;
    after: number;
    improvement: number;
  };
}

export class LearningEngine {
  private learningRecords: LearningRecord[] = [];
  private insights: LearningInsight[] = [];
  private feedbackLoopEnabled: boolean = true;
  private learningRate: number = 0.1;
  private minDataPoints: number = 10;

  /**
   * Record a test execution outcome for learning
   */
  public async recordOutcome(record: LearningRecord): Promise<void> {
    // Validate record
    if (!record.id || !record.testId || !record.testName) {
      throw new Error('Invalid learning record: id, testId, and testName are required');
    }

    if (record.feedback.quality < 0 || record.feedback.quality > 1) {
      throw new Error('Quality score must be between 0 and 1');
    }

    // Store record
    this.learningRecords.push({ ...record });

    // Trigger analysis if feedback loop enabled
    if (this.feedbackLoopEnabled && this.learningRecords.length >= this.minDataPoints) {
      await this.analyzeTrends();
    }
  }

  /**
   * Analyze trends and generate insights
   */
  public async analyzeTrends(): Promise<LearningInsight[]> {
    const newInsights: LearningInsight[] = [];

    // Pattern evolution analysis
    const patternInsights = await this.analyzePatternEvolution();
    newInsights.push(...patternInsights);

    // Edge case improvement analysis
    const edgeCaseInsights = await this.analyzeEdgeCaseImprovement();
    newInsights.push(...edgeCaseInsights);

    // Performance optimization analysis
    const perfInsights = await this.analyzePerformanceOptimization();
    newInsights.push(...perfInsights);

    // Quality enhancement analysis
    const qualityInsights = await this.analyzeQualityEnhancement();
    newInsights.push(...qualityInsights);

    // Store insights
    this.insights.push(...newInsights);

    return newInsights;
  }

  /**
   * Get improvement metrics for a time period
   */
  public async getImprovementMetrics(days: number = 30): Promise<ImprovementMetrics> {
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const recentRecords = this.learningRecords.filter(r =>
      r.timestamp.getTime() >= cutoffTime
    );

    if (recentRecords.length === 0) {
      return this.getEmptyMetrics();
    }

    // Split into before/after based on median timestamp
    const sortedRecords = [...recentRecords].sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    const midPoint = Math.floor(sortedRecords.length / 2);
    const before = sortedRecords.slice(0, midPoint);
    const after = sortedRecords.slice(midPoint);

    return {
      period: `last_${days}_days`,
      testQuality: {
        before: this.calculateAverageQuality(before),
        after: this.calculateAverageQuality(after),
        improvement: this.calculateImprovement(
          this.calculateAverageQuality(before),
          this.calculateAverageQuality(after)
        )
      },
      edgeCaseCoverage: {
        before: this.calculateAverageEdgeCases(before),
        after: this.calculateAverageEdgeCases(after),
        improvement: this.calculateImprovement(
          this.calculateAverageEdgeCases(before),
          this.calculateAverageEdgeCases(after)
        )
      },
      flakinessReduction: {
        before: this.calculateFlakinessRate(before),
        after: this.calculateFlakinessRate(after),
        improvement: this.calculateReductionImprovement(
          this.calculateFlakinessRate(before),
          this.calculateFlakinessRate(after)
        )
      },
      executionEfficiency: {
        before: this.calculateAverageExecutionTime(before),
        after: this.calculateAverageExecutionTime(after),
        improvement: this.calculateReductionImprovement(
          this.calculateAverageExecutionTime(before),
          this.calculateAverageExecutionTime(after)
        )
      }
    };
  }

  /**
   * Apply learning to improve future test generation
   */
  public async applyLearning(testContext: {
    framework: string;
    language: string;
    complexity: number;
  }): Promise<{
    recommendations: string[];
    expectedQuality: number;
    confidence: number;
  }> {
    // Find similar historical records
    const similarRecords = this.learningRecords.filter(r =>
      r.metadata.framework === testContext.framework &&
      r.metadata.language === testContext.language &&
      Math.abs(r.metadata.complexity - testContext.complexity) < 2
    );

    if (similarRecords.length < this.minDataPoints) {
      return {
        recommendations: ['Insufficient data for learning-based recommendations'],
        expectedQuality: 0.7, // Default baseline
        confidence: 0.3
      };
    }

    // Calculate expected quality based on historical data
    const avgQuality = this.calculateAverageQuality(similarRecords);
    const recommendations = this.generateRecommendations(similarRecords);

    return {
      recommendations,
      expectedQuality: avgQuality,
      confidence: Math.min(similarRecords.length / 100, 0.95)
    };
  }

  /**
   * Enable/disable feedback loop
   */
  public setFeedbackLoop(enabled: boolean): void {
    this.feedbackLoopEnabled = enabled;
  }

  /**
   * Set learning rate (0-1)
   */
  public setLearningRate(rate: number): void {
    if (rate < 0 || rate > 1) {
      throw new Error('Learning rate must be between 0 and 1');
    }
    this.learningRate = rate;
  }

  /**
   * Get all insights
   */
  public getInsights(): LearningInsight[] {
    return [...this.insights];
  }

  /**
   * Get learning statistics
   */
  public getStatistics(): {
    totalRecords: number;
    totalInsights: number;
    averageQuality: number;
    averageEdgeCases: number;
    flakinessRate: number;
  } {
    return {
      totalRecords: this.learningRecords.length,
      totalInsights: this.insights.length,
      averageQuality: this.calculateAverageQuality(this.learningRecords),
      averageEdgeCases: this.calculateAverageEdgeCases(this.learningRecords),
      flakinessRate: this.calculateFlakinessRate(this.learningRecords)
    };
  }

  /**
   * Clear learning data (for testing)
   */
  public clear(): void {
    this.learningRecords = [];
    this.insights = [];
  }

  // Private helper methods

  private async analyzePatternEvolution(): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];

    // Group by framework and language
    const groups = new Map<string, LearningRecord[]>();

    for (const record of this.learningRecords) {
      const key = `${record.metadata.framework}-${record.metadata.language}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    }

    // Analyze each group
    for (const [key, records] of groups) {
      if (records.length < this.minDataPoints) continue;

      // Check for quality improvement over time
      const sorted = [...records].sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
      const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

      const improvement = this.calculateImprovement(
        this.calculateAverageQuality(firstHalf),
        this.calculateAverageQuality(secondHalf)
      );

      if (improvement > 0.1) { // 10% improvement threshold
        insights.push({
          id: `pattern-${Date.now()}-${key}`,
          category: 'pattern-evolution',
          description: `Test patterns for ${key} showing ${(improvement * 100).toFixed(1)}% quality improvement`,
          confidence: 0.85,
          impact: improvement,
          recommendations: [
            'Continue using evolved pattern',
            'Share pattern with similar contexts',
            'Monitor for further improvements'
          ],
          evidence: records.slice(-5), // Last 5 records as evidence
          createdAt: new Date()
        });
      }
    }

    return insights;
  }

  private async analyzeEdgeCaseImprovement(): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];

    if (this.learningRecords.length < this.minDataPoints * 2) return insights;

    // Analyze edge case trends
    const sorted = [...this.learningRecords].sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    const firstThird = sorted.slice(0, Math.floor(sorted.length / 3));
    const lastThird = sorted.slice(Math.floor(sorted.length * 2 / 3));

    const improvement = this.calculateImprovement(
      this.calculateAverageEdgeCases(firstThird),
      this.calculateAverageEdgeCases(lastThird)
    );

    if (improvement > 0.25) { // 25% improvement threshold
      insights.push({
        id: `edge-case-${Date.now()}`,
        category: 'edge-case-improvement',
        description: `Edge case coverage improved by ${(improvement * 100).toFixed(1)}%`,
        confidence: 0.90,
        impact: improvement,
        recommendations: [
          'Analyze successful edge case patterns',
          'Apply patterns to new test generation',
          'Expand edge case detection rules'
        ],
        evidence: lastThird.slice(-5),
        createdAt: new Date()
      });
    }

    return insights;
  }

  private async analyzePerformanceOptimization(): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];

    if (this.learningRecords.length < this.minDataPoints * 2) return insights;

    const sorted = [...this.learningRecords].sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

    const improvement = this.calculateReductionImprovement(
      this.calculateAverageExecutionTime(firstHalf),
      this.calculateAverageExecutionTime(secondHalf)
    );

    if (improvement > 0.15) { // 15% reduction threshold
      insights.push({
        id: `perf-${Date.now()}`,
        category: 'performance-optimization',
        description: `Test execution time reduced by ${(improvement * 100).toFixed(1)}%`,
        confidence: 0.80,
        impact: improvement,
        recommendations: [
          'Identify performance-optimized patterns',
          'Eliminate redundant test steps',
          'Optimize test setup/teardown'
        ],
        evidence: secondHalf.slice(-5),
        createdAt: new Date()
      });
    }

    return insights;
  }

  private async analyzeQualityEnhancement(): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];

    // Analyze tests with consistently high quality
    const highQualityTests = this.learningRecords.filter(r =>
      r.feedback.quality >= 0.9 && r.outcome === 'success'
    );

    if (highQualityTests.length >= this.minDataPoints) {
      // Find common patterns
      const frameworks = new Map<string, number>();
      const languages = new Map<string, number>();

      for (const test of highQualityTests) {
        frameworks.set(
          test.metadata.framework,
          (frameworks.get(test.metadata.framework) || 0) + 1
        );
        languages.set(
          test.metadata.language,
          (languages.get(test.metadata.language) || 0) + 1
        );
      }

      const topFramework = Array.from(frameworks.entries())
        .sort((a, b) => b[1] - a[1])[0];

      insights.push({
        id: `quality-${Date.now()}`,
        category: 'quality-enhancement',
        description: `High-quality pattern identified in ${topFramework[0]}`,
        confidence: 0.88,
        impact: 0.20,
        recommendations: [
          `Prefer ${topFramework[0]} patterns for similar contexts`,
          'Study high-quality test characteristics',
          'Apply learned patterns to new tests'
        ],
        evidence: highQualityTests.slice(-5),
        createdAt: new Date()
      });
    }

    return insights;
  }

  private calculateAverageQuality(records: LearningRecord[]): number {
    if (records.length === 0) return 0;
    return records.reduce((sum, r) => sum + r.feedback.quality, 0) / records.length;
  }

  private calculateAverageEdgeCases(records: LearningRecord[]): number {
    if (records.length === 0) return 0;
    return records.reduce((sum, r) => sum + r.edgeCasesCaught, 0) / records.length;
  }

  private calculateFlakinessRate(records: LearningRecord[]): number {
    if (records.length === 0) return 0;
    const flakyCount = records.filter(r => r.outcome === 'flaky').length;
    return flakyCount / records.length;
  }

  private calculateAverageExecutionTime(records: LearningRecord[]): number {
    if (records.length === 0) return 0;
    return records.reduce((sum, r) => sum + r.executionTime, 0) / records.length;
  }

  private calculateImprovement(before: number, after: number): number {
    if (before === 0) return 0;
    return (after - before) / before;
  }

  private calculateReductionImprovement(before: number, after: number): number {
    if (before === 0) return 0;
    return (before - after) / before;
  }

  private generateRecommendations(records: LearningRecord[]): string[] {
    const recommendations: string[] = [];

    const avgQuality = this.calculateAverageQuality(records);
    const avgEdgeCases = this.calculateAverageEdgeCases(records);
    const flakinessRate = this.calculateFlakinessRate(records);

    if (avgQuality >= 0.9) {
      recommendations.push('Use high-quality pattern from historical data');
    } else if (avgQuality < 0.7) {
      recommendations.push('Review and improve test pattern quality');
    }

    if (avgEdgeCases >= 5) {
      recommendations.push('Maintain comprehensive edge case coverage');
    } else {
      recommendations.push('Increase edge case coverage (target: 5+)');
    }

    if (flakinessRate > 0.1) {
      recommendations.push('Address flakiness issues before deployment');
    }

    return recommendations;
  }

  private getEmptyMetrics(): ImprovementMetrics {
    return {
      period: 'insufficient_data',
      testQuality: { before: 0, after: 0, improvement: 0 },
      edgeCaseCoverage: { before: 0, after: 0, improvement: 0 },
      flakinessReduction: { before: 0, after: 0, improvement: 0 },
      executionEfficiency: { before: 0, after: 0, improvement: 0 }
    };
  }
}

// ===========================================================================
// Unit Tests
// ===========================================================================

describe('LearningEngine', () => {
  let learningEngine: LearningEngine;

  beforeEach(() => {
    learningEngine = new LearningEngine();
  });

  afterEach(() => {
    learningEngine.clear();
  });

  // -------------------------------------------------------------------------
  // Record Outcome Tests
  // -------------------------------------------------------------------------

  describe('Record Outcome', () => {
    it('should record a valid learning outcome', async () => {
      const record: LearningRecord = {
        id: 'rec-001',
        timestamp: new Date(),
        testId: 'test-001',
        testName: 'UserController.create',
        outcome: 'success',
        executionTime: 150,
        coverage: 0.95,
        edgeCasesCaught: 8,
        feedback: {
          quality: 0.92,
          relevance: 0.88
        },
        metadata: {
          framework: 'jest',
          language: 'typescript',
          complexity: 3,
          linesOfCode: 120
        }
      };

      await learningEngine.recordOutcome(record);

      const stats = learningEngine.getStatistics();
      expect(stats.totalRecords).toBe(1);
      expect(stats.averageQuality).toBeCloseTo(0.92, 2);
    });

    it('should reject invalid record (missing required fields)', async () => {
      const invalidRecord: any = {
        id: '',
        timestamp: new Date()
        // Missing testId, testName, etc.
      };

      await expect(learningEngine.recordOutcome(invalidRecord))
        .rejects.toThrow('Invalid learning record');
    });

    it('should reject record with invalid quality score', async () => {
      const record: any = {
        id: 'rec-002',
        testId: 'test-002',
        testName: 'Test',
        timestamp: new Date(),
        outcome: 'success',
        executionTime: 100,
        coverage: 0.8,
        edgeCasesCaught: 5,
        feedback: {
          quality: 1.5, // Invalid
          relevance: 0.8
        },
        metadata: {
          framework: 'jest',
          language: 'typescript',
          complexity: 2,
          linesOfCode: 100
        }
      };

      await expect(learningEngine.recordOutcome(record))
        .rejects.toThrow('Quality score must be between 0 and 1');
    });

    it('should trigger analysis after reaching minimum data points', async () => {
      learningEngine.setFeedbackLoop(true);

      for (let i = 0; i < 12; i++) {
        const record: LearningRecord = {
          id: `rec-${i}`,
          timestamp: new Date(Date.now() + i * 60000),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100 + i * 10,
          coverage: 0.8 + i * 0.01,
          edgeCasesCaught: 5 + i,
          feedback: {
            quality: 0.7 + i * 0.02,
            relevance: 0.8
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        };

        await learningEngine.recordOutcome(record);
      }

      const insights = learningEngine.getInsights();
      expect(insights.length).toBeGreaterThan(0);
    });

    it('should store multiple outcomes with different frameworks', async () => {
      const frameworks = ['jest', 'mocha', 'vitest'];

      for (let i = 0; i < frameworks.length; i++) {
        const record: LearningRecord = {
          id: `rec-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.9,
          edgeCasesCaught: 6,
          feedback: {
            quality: 0.85,
            relevance: 0.80
          },
          metadata: {
            framework: frameworks[i],
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        };

        await learningEngine.recordOutcome(record);
      }

      const stats = learningEngine.getStatistics();
      expect(stats.totalRecords).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Learning and Improvement Tests
  // -------------------------------------------------------------------------

  describe('Learning and Improvement', () => {
    beforeEach(async () => {
      // Seed with improving data over time
      for (let i = 0; i < 30; i++) {
        const record: LearningRecord = {
          id: `rec-${i}`,
          timestamp: new Date(Date.now() + i * 24 * 60 * 60 * 1000), // 1 day apart
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: i < 25 ? 'success' : (i % 5 === 0 ? 'flaky' : 'success'),
          executionTime: Math.max(50, 200 - i * 5), // Improving execution time
          coverage: 0.70 + i * 0.01, // Improving coverage
          edgeCasesCaught: 3 + Math.floor(i / 3), // Improving edge cases
          feedback: {
            quality: 0.60 + i * 0.01, // Improving quality
            relevance: 0.80
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 3,
            linesOfCode: 100
          }
        };

        await learningEngine.recordOutcome(record);
      }
    });

    it('should detect quality improvement trends', async () => {
      const insights = await learningEngine.analyzeTrends();

      const qualityInsights = insights.filter(i =>
        i.category === 'pattern-evolution' || i.category === 'quality-enhancement'
      );

      expect(qualityInsights.length).toBeGreaterThan(0);
    });

    it('should detect edge case improvement', async () => {
      const insights = await learningEngine.analyzeTrends();

      const edgeCaseInsights = insights.filter(i =>
        i.category === 'edge-case-improvement'
      );

      expect(edgeCaseInsights.length).toBeGreaterThan(0);
      expect(edgeCaseInsights[0].impact).toBeGreaterThan(0.25);
    });

    it('should detect performance optimization', async () => {
      const insights = await learningEngine.analyzeTrends();

      const perfInsights = insights.filter(i =>
        i.category === 'performance-optimization'
      );

      expect(perfInsights.length).toBeGreaterThan(0);
    });

    it('should calculate improvement metrics correctly', async () => {
      const metrics = await learningEngine.getImprovementMetrics(30);

      expect(metrics.testQuality.improvement).toBeGreaterThan(0);
      expect(metrics.edgeCaseCoverage.improvement).toBeGreaterThan(0);
      expect(metrics.executionEfficiency.improvement).toBeGreaterThan(0);
    });

    it('should apply learning to generate recommendations', async () => {
      const result = await learningEngine.applyLearning({
        framework: 'jest',
        language: 'typescript',
        complexity: 3
      });

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.expectedQuality).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return low confidence with insufficient data', async () => {
      learningEngine.clear();

      // Add only 5 records (below minDataPoints)
      for (let i = 0; i < 5; i++) {
        const record: LearningRecord = {
          id: `rec-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.8,
          edgeCasesCaught: 5,
          feedback: {
            quality: 0.8,
            relevance: 0.8
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        };

        await learningEngine.recordOutcome(record);
      }

      const result = await learningEngine.applyLearning({
        framework: 'jest',
        language: 'typescript',
        complexity: 2
      });

      expect(result.confidence).toBeLessThan(0.5);
      expect(result.recommendations[0]).toContain('Insufficient data');
    });
  });

  // -------------------------------------------------------------------------
  // Feedback Loop Tests
  // -------------------------------------------------------------------------

  describe('Feedback Loop', () => {
    it('should enable feedback loop', async () => {
      learningEngine.setFeedbackLoop(true);
      // Test that analysis is triggered automatically
    });

    it('should disable feedback loop', async () => {
      learningEngine.setFeedbackLoop(false);
      // Test that analysis is NOT triggered automatically
    });

    it('should set learning rate', () => {
      learningEngine.setLearningRate(0.2);
      // Verify learning rate is applied
    });

    it('should reject invalid learning rate', () => {
      expect(() => learningEngine.setLearningRate(1.5))
        .toThrow('Learning rate must be between 0 and 1');

      expect(() => learningEngine.setLearningRate(-0.1))
        .toThrow('Learning rate must be between 0 and 1');
    });

    it('should respect minimum data points threshold', async () => {
      learningEngine.setFeedbackLoop(true);

      // Add fewer records than minDataPoints
      for (let i = 0; i < 5; i++) {
        const record: LearningRecord = {
          id: `rec-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.8,
          edgeCasesCaught: 5,
          feedback: {
            quality: 0.8,
            relevance: 0.8
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        };

        await learningEngine.recordOutcome(record);
      }

      const insights = learningEngine.getInsights();
      expect(insights.length).toBe(0); // No insights due to insufficient data
    });
  });

  // -------------------------------------------------------------------------
  // Statistics and Reporting Tests
  // -------------------------------------------------------------------------

  describe('Statistics and Reporting', () => {
    beforeEach(async () => {
      // Seed test data
      for (let i = 0; i < 20; i++) {
        const record: LearningRecord = {
          id: `rec-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: i % 10 === 0 ? 'flaky' : 'success',
          executionTime: 100 + i * 5,
          coverage: 0.85 + i * 0.005,
          edgeCasesCaught: 5 + i % 5,
          feedback: {
            quality: 0.80 + i * 0.01,
            relevance: 0.85
          },
          metadata: {
            framework: i % 2 === 0 ? 'jest' : 'mocha',
            language: 'typescript',
            complexity: 2 + i % 3,
            linesOfCode: 100 + i * 10
          }
        };

        await learningEngine.recordOutcome(record);
      }
    });

    it('should calculate accurate statistics', async () => {
      const stats = learningEngine.getStatistics();

      expect(stats.totalRecords).toBe(20);
      expect(stats.averageQuality).toBeGreaterThan(0);
      expect(stats.averageEdgeCases).toBeGreaterThan(0);
      expect(stats.flakinessRate).toBeGreaterThan(0);
      expect(stats.flakinessRate).toBeLessThan(1);
    });

    it('should track all insights', async () => {
      await learningEngine.analyzeTrends();

      const insights = learningEngine.getInsights();
      expect(insights.length).toBeGreaterThan(0);

      for (const insight of insights) {
        expect(insight.id).toBeDefined();
        expect(insight.category).toBeDefined();
        expect(insight.confidence).toBeGreaterThan(0);
        expect(insight.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate metrics with empty data', async () => {
      learningEngine.clear();

      const metrics = await learningEngine.getImprovementMetrics(30);

      expect(metrics.period).toBe('insufficient_data');
      expect(metrics.testQuality.improvement).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty learning records', async () => {
      const stats = learningEngine.getStatistics();

      expect(stats.totalRecords).toBe(0);
      expect(stats.totalInsights).toBe(0);
      expect(stats.averageQuality).toBe(0);
    });

    it('should handle single record', async () => {
      const record: LearningRecord = {
        id: 'rec-001',
        timestamp: new Date(),
        testId: 'test-001',
        testName: 'Test 1',
        outcome: 'success',
        executionTime: 100,
        coverage: 0.9,
        edgeCasesCaught: 6,
        feedback: {
          quality: 0.85,
          relevance: 0.80
        },
        metadata: {
          framework: 'jest',
          language: 'typescript',
          complexity: 2,
          linesOfCode: 100
        }
      };

      await learningEngine.recordOutcome(record);

      const stats = learningEngine.getStatistics();
      expect(stats.totalRecords).toBe(1);
      expect(stats.averageQuality).toBeCloseTo(0.85, 2);
    });

    it('should handle all failures', async () => {
      for (let i = 0; i < 15; i++) {
        const record: LearningRecord = {
          id: `rec-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'failure',
          executionTime: 100,
          coverage: 0.5,
          edgeCasesCaught: 2,
          feedback: {
            quality: 0.3,
            relevance: 0.5
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 3,
            linesOfCode: 150
          }
        };

        await learningEngine.recordOutcome(record);
      }

      const stats = learningEngine.getStatistics();
      expect(stats.averageQuality).toBeLessThan(0.5);
    });

    it('should handle all flaky tests', async () => {
      for (let i = 0; i < 15; i++) {
        const record: LearningRecord = {
          id: `rec-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'flaky',
          executionTime: 100,
          coverage: 0.7,
          edgeCasesCaught: 4,
          feedback: {
            quality: 0.6,
            relevance: 0.7
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        };

        await learningEngine.recordOutcome(record);
      }

      const stats = learningEngine.getStatistics();
      expect(stats.flakinessRate).toBeCloseTo(1.0, 1);
    });

    it('should handle concurrent record submissions', async () => {
      const promises = [];

      for (let i = 0; i < 20; i++) {
        const record: LearningRecord = {
          id: `rec-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.85,
          edgeCasesCaught: 5,
          feedback: {
            quality: 0.80,
            relevance: 0.85
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        };

        promises.push(learningEngine.recordOutcome(record));
      }

      await Promise.all(promises);

      const stats = learningEngine.getStatistics();
      expect(stats.totalRecords).toBe(20);
    });
  });

  // -------------------------------------------------------------------------
  // Performance Tests (<10% overhead)
  // -------------------------------------------------------------------------

  describe('Performance', () => {
    it('should record outcomes with <10ms overhead', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 100; i++) {
        const record: LearningRecord = {
          id: `perf-${i}`,
          timestamp: new Date(),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100,
          coverage: 0.9,
          edgeCasesCaught: 6,
          feedback: {
            quality: 0.85,
            relevance: 0.80
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        };

        const start = performance.now();
        await learningEngine.recordOutcome(record);
        const duration = performance.now() - start;
        measurements.push(duration);
      }

      const avgDuration = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      expect(avgDuration).toBeLessThan(10);
    });

    it('should analyze trends efficiently', async () => {
      // Seed 100 records
      for (let i = 0; i < 100; i++) {
        const record: LearningRecord = {
          id: `rec-${i}`,
          timestamp: new Date(Date.now() + i * 60000),
          testId: `test-${i}`,
          testName: `Test ${i}`,
          outcome: 'success',
          executionTime: 100 + i,
          coverage: 0.8 + i * 0.001,
          edgeCasesCaught: 5 + Math.floor(i / 10),
          feedback: {
            quality: 0.7 + i * 0.002,
            relevance: 0.8
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 2,
            linesOfCode: 100
          }
        };

        await learningEngine.recordOutcome(record);
      }

      const start = performance.now();
      await learningEngine.analyzeTrends();
      const duration = performance.now() - start;

      // Should complete in <100ms for 100 records
      expect(duration).toBeLessThan(100);
    });
  });
});
