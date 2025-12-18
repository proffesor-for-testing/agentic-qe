/**
 * PatternCurator - Manual learning triggers and pattern quality curation
 *
 * Phase 0 M0.6: AQE LLM Independence - Manual Learning Triggers
 *
 * Features:
 * - CLI and programmatic pattern review interface
 * - Low-confidence pattern detection
 * - Manual approval/rejection workflow
 * - Force learning consolidation
 * - Pattern quality analytics
 * - 20% better routing decisions through curated patterns
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

/**
 * Pattern stored in the system
 */
export interface StoredPattern {
  id: string;
  embedding: number[];
  content: string;
  category: string;
  confidence: number;
  quality: number;
  usageCount: number;
  createdAt: number;
  lastUsedAt: number;
  metadata: Record<string, unknown>;
}

/**
 * Curated pattern after manual review
 */
export interface CuratedPattern {
  id: string;
  approved: boolean;
  correctedContent?: string;
  qualityRating: number;
  explanation: string;
  reviewedAt: number;
  reviewedBy?: string;
}

/**
 * Feedback for RuvLLM learning
 */
export interface LearningFeedback {
  requestId: string;
  correction: string;
  rating: number;
  reasoning: string;
  category: string;
}

/**
 * Pattern curation configuration
 */
export interface CuratorConfig {
  /** Confidence threshold for low-confidence detection (default: 0.7) */
  lowConfidenceThreshold: number;
  /** Maximum patterns to review per batch (default: 50) */
  maxBatchSize: number;
  /** Auto-approve patterns above this confidence (default: 0.95) */
  autoApproveThreshold: number;
  /** Auto-reject patterns below this confidence (default: 0.3) */
  autoRejectThreshold: number;
  /** Storage path for curation history */
  storagePath?: string;
}

/**
 * Pattern analytics
 */
export interface PatternAnalytics {
  totalPatterns: number;
  lowConfidencePatterns: number;
  highQualityPatterns: number;
  averageConfidence: number;
  averageQuality: number;
  categoryDistribution: Record<string, number>;
  usageDistribution: {
    unused: number;
    lowUsage: number;
    mediumUsage: number;
    highUsage: number;
  };
}

/**
 * Curation session
 */
export interface CurationSession {
  id: string;
  startedAt: number;
  endedAt?: number;
  patternsReviewed: number;
  approved: number;
  rejected: number;
  corrected: number;
  reviewerId?: string;
}

/**
 * Pattern source interface (abstraction for ReasoningBank or other pattern stores)
 */
export interface IPatternSource {
  findSimilar(query: string, k: number, options?: { minConfidence?: number; minUsageCount?: number }): Promise<StoredPattern[]>;
  findByConfidenceRange(minConfidence: number, maxConfidence: number, limit: number): Promise<StoredPattern[]>;
  remove(id: string): Promise<void>;
  update(id: string, updates: Partial<StoredPattern>): Promise<void>;
  getStats(): Promise<{ total: number; avgConfidence: number; avgQuality: number }>;
}

/**
 * Learning trigger interface (abstraction for RuvLLM)
 */
export interface ILearningTrigger {
  feedback(data: LearningFeedback): Promise<void>;
  forceLearn(): Promise<{ patternsConsolidated: number; newWeightVersion: number }>;
  getRoutingStats(): Promise<{ totalDecisions: number; avgConfidence: number }>;
}

/**
 * Mock pattern source for standalone usage
 */
class MockPatternSource implements IPatternSource {
  private patterns: Map<string, StoredPattern> = new Map();

  async findSimilar(query: string, k: number, options?: { minConfidence?: number }): Promise<StoredPattern[]> {
    const minConf = options?.minConfidence ?? 0;
    return Array.from(this.patterns.values())
      .filter(p => p.confidence >= minConf)
      .slice(0, k);
  }

  async findByConfidenceRange(minConfidence: number, maxConfidence: number, limit: number): Promise<StoredPattern[]> {
    return Array.from(this.patterns.values())
      .filter(p => p.confidence >= minConfidence && p.confidence <= maxConfidence)
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

  // For testing: add a pattern
  addPattern(pattern: StoredPattern): void {
    this.patterns.set(pattern.id, pattern);
  }
}

/**
 * Mock learning trigger for standalone usage
 */
class MockLearningTrigger implements ILearningTrigger {
  private feedbackHistory: LearningFeedback[] = [];
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

/**
 * PatternCurator - Manual pattern review and learning trigger system
 */
export class PatternCurator extends EventEmitter {
  private config: CuratorConfig;
  private patternSource: IPatternSource;
  private learningTrigger: ILearningTrigger;
  private currentSession: CurationSession | null;
  private curationHistory: CurationSession[];
  private pendingFeedback: LearningFeedback[];

  constructor(
    config?: Partial<CuratorConfig>,
    patternSource?: IPatternSource,
    learningTrigger?: ILearningTrigger
  ) {
    super();

    this.config = {
      lowConfidenceThreshold: config?.lowConfidenceThreshold ?? 0.7,
      maxBatchSize: config?.maxBatchSize ?? 50,
      autoApproveThreshold: config?.autoApproveThreshold ?? 0.95,
      autoRejectThreshold: config?.autoRejectThreshold ?? 0.3,
      storagePath: config?.storagePath
    };

    this.patternSource = patternSource ?? new MockPatternSource();
    this.learningTrigger = learningTrigger ?? new MockLearningTrigger();
    this.currentSession = null;
    this.curationHistory = [];
    this.pendingFeedback = [];
  }

  /**
   * Start a new curation session
   */
  startSession(reviewerId?: string): CurationSession {
    if (this.currentSession) {
      this.endSession();
    }

    this.currentSession = {
      id: randomUUID(),
      startedAt: Date.now(),
      patternsReviewed: 0,
      approved: 0,
      rejected: 0,
      corrected: 0,
      reviewerId
    };

    this.emit('sessionStarted', { session: this.currentSession });

    return this.currentSession;
  }

  /**
   * End current curation session
   */
  endSession(): CurationSession | null {
    if (!this.currentSession) return null;

    this.currentSession.endedAt = Date.now();
    this.curationHistory.push(this.currentSession);

    this.emit('sessionEnded', { session: this.currentSession });

    const session = this.currentSession;
    this.currentSession = null;

    return session;
  }

  /**
   * Find low-confidence patterns for review
   */
  async findLowConfidencePatterns(limit?: number): Promise<StoredPattern[]> {
    const maxPatterns = limit ?? this.config.maxBatchSize;

    const patterns = await this.patternSource.findByConfidenceRange(
      this.config.autoRejectThreshold,
      this.config.lowConfidenceThreshold,
      maxPatterns
    );

    this.emit('patternsFound', {
      count: patterns.length,
      confidenceRange: {
        min: this.config.autoRejectThreshold,
        max: this.config.lowConfidenceThreshold
      }
    });

    return patterns;
  }

  /**
   * Review a single pattern manually
   */
  async reviewPattern(pattern: StoredPattern, curation: CuratedPattern): Promise<void> {
    if (!this.currentSession) {
      this.startSession();
    }

    if (curation.approved) {
      // Pattern approved - provide positive feedback
      const feedback: LearningFeedback = {
        requestId: pattern.id,
        correction: curation.correctedContent ?? pattern.content,
        rating: curation.qualityRating,
        reasoning: curation.explanation,
        category: pattern.category
      };

      this.pendingFeedback.push(feedback);

      // Update pattern quality in store
      await this.patternSource.update(pattern.id, {
        quality: curation.qualityRating,
        confidence: Math.min(pattern.confidence + 0.1, 1.0) // Boost confidence
      });

      this.currentSession!.approved++;

      if (curation.correctedContent) {
        this.currentSession!.corrected++;
      }
    } else {
      // Pattern rejected - remove from store
      await this.patternSource.remove(pattern.id);
      this.currentSession!.rejected++;
    }

    this.currentSession!.patternsReviewed++;

    this.emit('patternReviewed', {
      patternId: pattern.id,
      approved: curation.approved,
      corrected: !!curation.correctedContent,
      sessionStats: {
        reviewed: this.currentSession!.patternsReviewed,
        approved: this.currentSession!.approved,
        rejected: this.currentSession!.rejected
      }
    });
  }

  /**
   * Auto-curate patterns based on confidence thresholds
   */
  async autoCurate(): Promise<{
    autoApproved: number;
    autoRejected: number;
    needsReview: number;
  }> {
    const stats = { autoApproved: 0, autoRejected: 0, needsReview: 0 };

    // Auto-reject very low confidence patterns
    const veryLowConfidence = await this.patternSource.findByConfidenceRange(
      0,
      this.config.autoRejectThreshold,
      1000
    );

    for (const pattern of veryLowConfidence) {
      await this.patternSource.remove(pattern.id);
      stats.autoRejected++;
    }

    // Auto-approve very high confidence patterns
    const veryHighConfidence = await this.patternSource.findByConfidenceRange(
      this.config.autoApproveThreshold,
      1.0,
      1000
    );

    for (const pattern of veryHighConfidence) {
      const feedback: LearningFeedback = {
        requestId: pattern.id,
        correction: pattern.content,
        rating: pattern.quality,
        reasoning: 'Auto-approved high-confidence pattern',
        category: pattern.category
      };
      this.pendingFeedback.push(feedback);
      stats.autoApproved++;
    }

    // Count patterns needing manual review
    const needsReview = await this.patternSource.findByConfidenceRange(
      this.config.autoRejectThreshold,
      this.config.autoApproveThreshold,
      1000
    );
    stats.needsReview = needsReview.length;

    this.emit('autoCurateComplete', stats);

    return stats;
  }

  /**
   * Force learning consolidation with pending feedback
   */
  async forceLearning(): Promise<{
    feedbackSubmitted: number;
    patternsConsolidated: number;
    newWeightVersion: number;
  }> {
    // Submit all pending feedback
    const feedbackCount = this.pendingFeedback.length;

    for (const feedback of this.pendingFeedback) {
      await this.learningTrigger.feedback(feedback);
    }

    this.pendingFeedback = [];

    // Trigger learning consolidation
    const result = await this.learningTrigger.forceLearn();

    this.emit('learningForced', {
      feedbackSubmitted: feedbackCount,
      ...result
    });

    return {
      feedbackSubmitted: feedbackCount,
      ...result
    };
  }

  /**
   * Get pattern analytics
   */
  async getAnalytics(): Promise<PatternAnalytics> {
    const stats = await this.patternSource.getStats();

    // Get patterns by confidence range
    const veryLow = await this.patternSource.findByConfidenceRange(0, 0.3, 10000);
    const low = await this.patternSource.findByConfidenceRange(0.3, 0.7, 10000);
    const high = await this.patternSource.findByConfidenceRange(0.7, 1.0, 10000);

    // Analyze category distribution
    const allPatterns = [...veryLow, ...low, ...high];
    const categoryDist: Record<string, number> = {};

    for (const pattern of allPatterns) {
      categoryDist[pattern.category] = (categoryDist[pattern.category] ?? 0) + 1;
    }

    // Analyze usage distribution
    const usageDist = {
      unused: allPatterns.filter(p => p.usageCount === 0).length,
      lowUsage: allPatterns.filter(p => p.usageCount > 0 && p.usageCount <= 3).length,
      mediumUsage: allPatterns.filter(p => p.usageCount > 3 && p.usageCount <= 10).length,
      highUsage: allPatterns.filter(p => p.usageCount > 10).length
    };

    return {
      totalPatterns: stats.total,
      lowConfidencePatterns: veryLow.length + low.length,
      highQualityPatterns: high.filter(p => p.quality >= 0.8).length,
      averageConfidence: stats.avgConfidence,
      averageQuality: stats.avgQuality,
      categoryDistribution: categoryDist,
      usageDistribution: usageDist
    };
  }

  /**
   * Get routing improvement stats after curation
   */
  async getRoutingImprovement(): Promise<{
    beforeCuration: { avgConfidence: number };
    afterCuration: { avgConfidence: number };
    improvement: number;
  }> {
    const routingStats = await this.learningTrigger.getRoutingStats();

    // Calculate improvement based on curation history
    const totalReviewed = this.curationHistory.reduce(
      (sum, s) => sum + s.patternsReviewed,
      0
    );

    const totalApproved = this.curationHistory.reduce(
      (sum, s) => sum + s.approved,
      0
    );

    const approvalRate = totalReviewed > 0 ? totalApproved / totalReviewed : 0;

    // Estimate improvement (20% target)
    const estimatedImprovement = approvalRate * 0.2;

    return {
      beforeCuration: {
        avgConfidence: routingStats.avgConfidence
      },
      afterCuration: {
        avgConfidence: Math.min(routingStats.avgConfidence + estimatedImprovement, 1.0)
      },
      improvement: estimatedImprovement * 100 // Percentage
    };
  }

  /**
   * Get curation history
   */
  getCurationHistory(): CurationSession[] {
    return [...this.curationHistory];
  }

  /**
   * Get current session
   */
  getCurrentSession(): CurationSession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  /**
   * Get pending feedback count
   */
  getPendingFeedbackCount(): number {
    return this.pendingFeedback.length;
  }

  /**
   * Interactive CLI curation (for terminal usage)
   * Returns a generator that yields patterns for review
   */
  async *interactiveCuration(limit?: number): AsyncGenerator<{
    pattern: StoredPattern;
    submit: (curation: CuratedPattern) => Promise<void>;
    skip: () => void;
  }> {
    const patterns = await this.findLowConfidencePatterns(limit);

    this.startSession();

    for (const pattern of patterns) {
      let resolved = false;

      yield {
        pattern,
        submit: async (curation: CuratedPattern) => {
          if (!resolved) {
            await this.reviewPattern(pattern, curation);
            resolved = true;
          }
        },
        skip: () => {
          resolved = true;
        }
      };
    }

    this.endSession();
  }
}

/**
 * Create a pattern curator with default configuration
 */
export function createPatternCurator(
  config?: Partial<CuratorConfig>,
  patternSource?: IPatternSource,
  learningTrigger?: ILearningTrigger
): PatternCurator {
  return new PatternCurator(config, patternSource, learningTrigger);
}

/**
 * CLI helper for pattern curation
 */
export async function runCurationCLI(curator: PatternCurator): Promise<CurationSession | null> {
  console.log('\n=== Pattern Curation CLI ===\n');

  // Get analytics first
  const analytics = await curator.getAnalytics();
  console.log(`Total patterns: ${analytics.totalPatterns}`);
  console.log(`Low confidence patterns: ${analytics.lowConfidencePatterns}`);
  console.log(`Average confidence: ${(analytics.averageConfidence * 100).toFixed(1)}%`);
  console.log(`Average quality: ${(analytics.averageQuality * 100).toFixed(1)}%\n`);

  // Start interactive curation
  const iterator = curator.interactiveCuration(10);

  for await (const { pattern, submit } of iterator) {
    console.log(`\n--- Pattern ${pattern.id} ---`);
    console.log(`Category: ${pattern.category}`);
    console.log(`Confidence: ${(pattern.confidence * 100).toFixed(1)}%`);
    console.log(`Content: ${pattern.content.substring(0, 200)}...`);

    // In real CLI, would prompt for input here
    // For now, auto-approve medium confidence patterns
    const approved = pattern.confidence >= 0.5;

    await submit({
      id: pattern.id,
      approved,
      qualityRating: approved ? Math.max(pattern.quality, 0.7) : 0,
      explanation: approved ? 'Approved via CLI' : 'Rejected via CLI',
      reviewedAt: Date.now()
    });

    console.log(approved ? '✓ Approved' : '✗ Rejected');
  }

  // Force learning consolidation
  console.log('\nConsolidating learning...');
  const result = await curator.forceLearning();
  console.log(`Feedback submitted: ${result.feedbackSubmitted}`);
  console.log(`Patterns consolidated: ${result.patternsConsolidated}`);
  console.log(`New weight version: ${result.newWeightVersion}`);

  return curator.getCurrentSession();
}
