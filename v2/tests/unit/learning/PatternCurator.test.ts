/**
 * PatternCurator Tests
 *
 * Phase 0 M0.6: AQE LLM Independence - Manual Learning Triggers
 *
 * Tests for:
 * - Pattern curation sessions
 * - Low-confidence pattern detection
 * - Manual approval/rejection workflow
 * - Auto-curation based on thresholds
 * - Force learning consolidation
 */

import {
  PatternCurator,
  createPatternCurator,
  StoredPattern,
  CuratedPattern,
  IPatternSource,
  ILearningTrigger,
  LearningFeedback
} from '../../../src/learning/PatternCurator';
import { createSeededRandom } from '../../../src/utils/SeededRandom';

// Seeded RNG for deterministic test pattern IDs
const patternIdRng = createSeededRandom(22004);

/**
 * In-memory pattern source for testing
 */
class TestPatternSource implements IPatternSource {
  private patterns: Map<string, StoredPattern> = new Map();

  addPattern(pattern: StoredPattern): void {
    this.patterns.set(pattern.id, pattern);
  }

  async findSimilar(query: string, k: number, options?: { minConfidence?: number }): Promise<StoredPattern[]> {
    const minConf = options?.minConfidence ?? 0;
    return Array.from(this.patterns.values())
      .filter(p => p.confidence >= minConf)
      .slice(0, k);
  }

  async findByConfidenceRange(min: number, max: number, limit: number): Promise<StoredPattern[]> {
    return Array.from(this.patterns.values())
      .filter(p => p.confidence >= min && p.confidence <= max)
      .slice(0, limit);
  }

  async remove(id: string): Promise<void> {
    this.patterns.delete(id);
  }

  async update(id: string, updates: Partial<StoredPattern>): Promise<void> {
    const existing = this.patterns.get(id);
    if (existing) {
      this.patterns.set(id, { ...existing, ...updates });
    }
  }

  async getStats(): Promise<{ total: number; avgConfidence: number; avgQuality: number }> {
    const patterns = Array.from(this.patterns.values());
    if (patterns.length === 0) {
      return { total: 0, avgConfidence: 0, avgQuality: 0 };
    }
    return {
      total: patterns.length,
      avgConfidence: patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length,
      avgQuality: patterns.reduce((sum, p) => sum + p.quality, 0) / patterns.length
    };
  }

  getPattern(id: string): StoredPattern | undefined {
    return this.patterns.get(id);
  }

  getAllPatterns(): StoredPattern[] {
    return Array.from(this.patterns.values());
  }
}

/**
 * Test learning trigger
 */
class TestLearningTrigger implements ILearningTrigger {
  public feedbackHistory: LearningFeedback[] = [];
  private learnCount = 0;

  async feedback(data: LearningFeedback): Promise<void> {
    this.feedbackHistory.push(data);
  }

  async forceLearn(): Promise<{ patternsConsolidated: number; newWeightVersion: number }> {
    this.learnCount++;
    const consolidated = this.feedbackHistory.length;
    this.feedbackHistory = [];
    return {
      patternsConsolidated: consolidated,
      newWeightVersion: this.learnCount
    };
  }

  async getRoutingStats(): Promise<{ totalDecisions: number; avgConfidence: number }> {
    return {
      totalDecisions: 100,
      avgConfidence: 0.75
    };
  }
}

function createTestPattern(overrides: Partial<StoredPattern> = {}): StoredPattern {
  return {
    id: `pattern-${patternIdRng.random().toString(36).slice(2, 8)}`,
    embedding: new Array(64).fill(0.1),
    content: 'Test pattern content',
    category: 'test-generation',
    confidence: 0.5,
    quality: 0.6,
    usageCount: 0,
    createdAt: Date.now() - 86400000, // 1 day ago
    lastUsedAt: Date.now(),
    metadata: {},
    ...overrides
  };
}

describe('PatternCurator', () => {
  let curator: PatternCurator;
  let patternSource: TestPatternSource;
  let learningTrigger: TestLearningTrigger;

  beforeEach(() => {
    patternSource = new TestPatternSource();
    learningTrigger = new TestLearningTrigger();
    curator = createPatternCurator(
      {
        lowConfidenceThreshold: 0.7,
        autoApproveThreshold: 0.95,
        autoRejectThreshold: 0.3,
        maxBatchSize: 50
      },
      patternSource,
      learningTrigger
    );
  });

  describe('Session Management', () => {
    it('should start a new curation session', () => {
      const session = curator.startSession('test-reviewer');

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.reviewerId).toBe('test-reviewer');
      expect(session.patternsReviewed).toBe(0);
    });

    it('should end current session and return it', () => {
      curator.startSession();
      const session = curator.endSession();

      expect(session).toBeDefined();
      expect(session?.endedAt).toBeDefined();
    });

    it('should end previous session when starting new one', () => {
      const session1 = curator.startSession();
      const session2 = curator.startSession();

      expect(session1.id).not.toBe(session2.id);

      const history = curator.getCurationHistory();
      expect(history).toHaveLength(1);
      expect(history[0].endedAt).toBeDefined();
    });

    it('should track session in history', () => {
      curator.startSession('reviewer-1');
      curator.endSession();

      curator.startSession('reviewer-2');
      curator.endSession();

      const history = curator.getCurationHistory();
      expect(history).toHaveLength(2);
    });
  });

  describe('Pattern Finding', () => {
    it('should find low-confidence patterns', async () => {
      // Add patterns with various confidences
      patternSource.addPattern(createTestPattern({ id: 'low', confidence: 0.4 }));
      patternSource.addPattern(createTestPattern({ id: 'medium', confidence: 0.6 }));
      patternSource.addPattern(createTestPattern({ id: 'high', confidence: 0.9 }));

      const lowConfidence = await curator.findLowConfidencePatterns();

      expect(lowConfidence.length).toBe(2); // 0.4 and 0.6 are below 0.7
      expect(lowConfidence.map(p => p.id)).toContain('low');
      expect(lowConfidence.map(p => p.id)).toContain('medium');
    });

    it('should respect limit parameter', async () => {
      // Add many low-confidence patterns
      for (let i = 0; i < 10; i++) {
        patternSource.addPattern(createTestPattern({ id: `p${i}`, confidence: 0.5 }));
      }

      const patterns = await curator.findLowConfidencePatterns(3);

      expect(patterns.length).toBe(3);
    });

    it('should emit event when patterns found', (done) => {
      patternSource.addPattern(createTestPattern({ confidence: 0.5 }));

      curator.on('patternsFound', (data) => {
        expect(data.count).toBe(1);
        done();
      });

      curator.findLowConfidencePatterns();
    });
  });

  describe('Pattern Review', () => {
    it('should approve patterns and queue feedback', async () => {
      const pattern = createTestPattern({ id: 'approve-me', confidence: 0.5 });
      patternSource.addPattern(pattern);

      curator.startSession();

      await curator.reviewPattern(pattern, {
        id: pattern.id,
        approved: true,
        qualityRating: 0.8,
        explanation: 'Good pattern',
        reviewedAt: Date.now()
      });

      const session = curator.getCurrentSession();
      expect(session?.approved).toBe(1);
      expect(session?.patternsReviewed).toBe(1);
      expect(curator.getPendingFeedbackCount()).toBe(1);
    });

    it('should reject patterns and remove them', async () => {
      const pattern = createTestPattern({ id: 'reject-me', confidence: 0.5 });
      patternSource.addPattern(pattern);

      curator.startSession();

      await curator.reviewPattern(pattern, {
        id: pattern.id,
        approved: false,
        qualityRating: 0,
        explanation: 'Bad pattern',
        reviewedAt: Date.now()
      });

      const session = curator.getCurrentSession();
      expect(session?.rejected).toBe(1);

      // Pattern should be removed
      expect(patternSource.getPattern('reject-me')).toBeUndefined();
    });

    it('should track corrected patterns', async () => {
      const pattern = createTestPattern({ id: 'correct-me' });
      patternSource.addPattern(pattern);

      curator.startSession();

      await curator.reviewPattern(pattern, {
        id: pattern.id,
        approved: true,
        correctedContent: 'Better content',
        qualityRating: 0.9,
        explanation: 'Corrected and improved',
        reviewedAt: Date.now()
      });

      const session = curator.getCurrentSession();
      expect(session?.corrected).toBe(1);
    });

    it('should boost confidence on approval', async () => {
      const pattern = createTestPattern({ id: 'boost-me', confidence: 0.5 });
      patternSource.addPattern(pattern);

      curator.startSession();

      await curator.reviewPattern(pattern, {
        id: pattern.id,
        approved: true,
        qualityRating: 0.8,
        explanation: 'Approved',
        reviewedAt: Date.now()
      });

      const updated = patternSource.getPattern('boost-me');
      expect(updated?.confidence).toBeGreaterThan(0.5);
    });

    it('should emit events during review', (done) => {
      const pattern = createTestPattern();
      patternSource.addPattern(pattern);

      curator.on('patternReviewed', (data) => {
        expect(data.patternId).toBe(pattern.id);
        expect(data.approved).toBe(true);
        done();
      });

      curator.startSession();
      curator.reviewPattern(pattern, {
        id: pattern.id,
        approved: true,
        qualityRating: 0.8,
        explanation: 'Good',
        reviewedAt: Date.now()
      });
    });
  });

  describe('Auto-Curation', () => {
    it('should auto-reject very low confidence patterns', async () => {
      // Add patterns below auto-reject threshold (0.3)
      patternSource.addPattern(createTestPattern({ id: 'auto-reject-1', confidence: 0.1 }));
      patternSource.addPattern(createTestPattern({ id: 'auto-reject-2', confidence: 0.2 }));

      const result = await curator.autoCurate();

      expect(result.autoRejected).toBe(2);
      expect(patternSource.getPattern('auto-reject-1')).toBeUndefined();
      expect(patternSource.getPattern('auto-reject-2')).toBeUndefined();
    });

    it('should auto-approve very high confidence patterns', async () => {
      // Add patterns above auto-approve threshold (0.95)
      patternSource.addPattern(createTestPattern({ id: 'auto-approve-1', confidence: 0.96 }));
      patternSource.addPattern(createTestPattern({ id: 'auto-approve-2', confidence: 0.98 }));

      const result = await curator.autoCurate();

      expect(result.autoApproved).toBe(2);
      expect(curator.getPendingFeedbackCount()).toBe(2);
    });

    it('should identify patterns needing review', async () => {
      // Add patterns in the review range (0.3-0.95)
      patternSource.addPattern(createTestPattern({ id: 'review-1', confidence: 0.5 }));
      patternSource.addPattern(createTestPattern({ id: 'review-2', confidence: 0.7 }));
      patternSource.addPattern(createTestPattern({ id: 'review-3', confidence: 0.8 }));

      const result = await curator.autoCurate();

      expect(result.needsReview).toBe(3);
    });

    it('should emit event on auto-curation completion', (done) => {
      patternSource.addPattern(createTestPattern({ confidence: 0.1 }));

      curator.on('autoCurateComplete', (data) => {
        expect(data.autoRejected).toBe(1);
        done();
      });

      curator.autoCurate();
    });
  });

  describe('Force Learning', () => {
    it('should submit pending feedback and trigger learning', async () => {
      // Queue some feedback
      const pattern = createTestPattern();
      patternSource.addPattern(pattern);

      curator.startSession();
      await curator.reviewPattern(pattern, {
        id: pattern.id,
        approved: true,
        qualityRating: 0.8,
        explanation: 'Good',
        reviewedAt: Date.now()
      });

      expect(curator.getPendingFeedbackCount()).toBe(1);

      const result = await curator.forceLearning();

      expect(result.feedbackSubmitted).toBe(1);
      expect(result.patternsConsolidated).toBe(1);
      expect(result.newWeightVersion).toBe(1);
      expect(curator.getPendingFeedbackCount()).toBe(0);
    });

    it('should emit event on force learning', (done) => {
      curator.on('learningForced', (data) => {
        expect(data.feedbackSubmitted).toBe(0);
        done();
      });

      curator.forceLearning();
    });
  });

  describe('Analytics', () => {
    it('should calculate pattern analytics', async () => {
      // Add patterns with various properties
      patternSource.addPattern(createTestPattern({
        id: 'p1',
        confidence: 0.2,
        quality: 0.3,
        category: 'test-generation',
        usageCount: 0
      }));
      patternSource.addPattern(createTestPattern({
        id: 'p2',
        confidence: 0.5,
        quality: 0.6,
        category: 'coverage-analysis',
        usageCount: 5
      }));
      patternSource.addPattern(createTestPattern({
        id: 'p3',
        confidence: 0.9,
        quality: 0.9,
        category: 'test-generation',
        usageCount: 15
      }));

      const analytics = await curator.getAnalytics();

      expect(analytics.totalPatterns).toBe(3);
      expect(analytics.categoryDistribution['test-generation']).toBe(2);
      expect(analytics.categoryDistribution['coverage-analysis']).toBe(1);
      expect(analytics.usageDistribution.unused).toBe(1);
      expect(analytics.usageDistribution.highUsage).toBe(1);
    });

    it('should calculate routing improvement', async () => {
      // Do some curation
      patternSource.addPattern(createTestPattern({ id: 'p1', confidence: 0.5 }));

      curator.startSession();
      await curator.reviewPattern(patternSource.getPattern('p1')!, {
        id: 'p1',
        approved: true,
        qualityRating: 0.8,
        explanation: 'Good',
        reviewedAt: Date.now()
      });
      curator.endSession();

      const improvement = await curator.getRoutingImprovement();

      expect(improvement.beforeCuration.avgConfidence).toBe(0.75);
      expect(improvement.afterCuration.avgConfidence).toBeGreaterThan(0.75);
      expect(improvement.improvement).toBeGreaterThan(0);
    });
  });

  describe('Interactive Curation', () => {
    it('should yield patterns for interactive review', async () => {
      patternSource.addPattern(createTestPattern({ id: 'p1', confidence: 0.5 }));
      patternSource.addPattern(createTestPattern({ id: 'p2', confidence: 0.6 }));

      const reviewed: string[] = [];

      for await (const { pattern, submit } of curator.interactiveCuration(10)) {
        reviewed.push(pattern.id);
        await submit({
          id: pattern.id,
          approved: true,
          qualityRating: 0.8,
          explanation: 'Approved via interactive',
          reviewedAt: Date.now()
        });
      }

      expect(reviewed).toHaveLength(2);
    });

    it('should support skipping patterns', async () => {
      patternSource.addPattern(createTestPattern({ id: 'skip-me', confidence: 0.5 }));

      for await (const { pattern, skip } of curator.interactiveCuration(10)) {
        skip();
      }

      // Pattern should still exist (not removed)
      expect(patternSource.getPattern('skip-me')).toBeDefined();
    });
  });
});

describe('createPatternCurator', () => {
  it('should create curator with default config', () => {
    const curator = createPatternCurator();

    expect(curator).toBeInstanceOf(PatternCurator);
    expect(curator.getCurrentSession()).toBeNull();
  });

  it('should create curator with custom config', () => {
    const curator = createPatternCurator({
      lowConfidenceThreshold: 0.8,
      maxBatchSize: 100
    });

    expect(curator).toBeInstanceOf(PatternCurator);
  });
});
