/**
 * PatternQualityScorer - Pattern Quality Scoring and Garbage Collection
 *
 * Features:
 * - Score patterns based on usage success rate
 * - Track comprehensive usage statistics
 * - Garbage collection for low-quality patterns
 * - Pattern ranking and recommendations
 * - Adaptive quality thresholds
 *
 * @module memory/PatternQualityScorer
 * @version 1.0.0
 */

import { TestPattern } from '../core/memory/IPatternStore';
import { DistributedPatternLibrary } from './DistributedPatternLibrary';

/**
 * Pattern usage record
 */
export interface PatternUsage {
  patternId: string;
  timestamp: number;
  success: boolean;
  executionTime?: number;
  context?: Record<string, any>;
}

/**
 * Pattern quality metrics
 */
export interface PatternQualityMetrics {
  patternId: string;
  qualityScore: number;
  successRate: number;
  totalUsage: number;
  successCount: number;
  failureCount: number;
  averageExecutionTime: number;
  lastUsedTimestamp: number;
  createdTimestamp: number;
  ageInDays: number;
  trendScore: number; // Positive = improving, negative = degrading
}

/**
 * Quality scorer configuration
 */
export interface QualityScorerConfig {
  /** Minimum success rate (0-1) */
  minSuccessRate?: number;
  /** Minimum usage count before scoring */
  minUsageCount?: number;
  /** Maximum age in days before GC consideration */
  maxAgeInDays?: number;
  /** Minimum quality score to keep */
  minQualityScore?: number;
  /** Weight for success rate in quality score */
  successRateWeight?: number;
  /** Weight for usage frequency in quality score */
  usageWeight?: number;
  /** Weight for recency in quality score */
  recencyWeight?: number;
  /** Enable automatic garbage collection */
  enableAutoGC?: boolean;
  /** GC interval in milliseconds */
  gcInterval?: number;
}

/**
 * Garbage collection result
 */
export interface GarbageCollectionResult {
  totalPatterns: number;
  patternsRemoved: number;
  removedPatternIds: string[];
  bytesReclaimed: number;
  duration: number;
  timestamp: number;
}

/**
 * Pattern ranking entry
 */
export interface RankedPattern {
  pattern: TestPattern;
  metrics: PatternQualityMetrics;
  rank: number;
}

/**
 * PatternQualityScorer - Tracks and scores pattern quality for optimization
 *
 * This class provides:
 * - Real-time quality scoring based on success rate and usage
 * - Comprehensive usage statistics tracking
 * - Automatic garbage collection of low-quality patterns
 * - Pattern ranking for recommendations
 * - Trend analysis for quality improvement/degradation
 */
export class PatternQualityScorer {
  private library: DistributedPatternLibrary;
  private config: QualityScorerConfig;
  private usageHistory: Map<string, PatternUsage[]>;
  private metricsCache: Map<string, PatternQualityMetrics>;
  private gcTimer?: NodeJS.Timeout;
  private readonly DEFAULT_MIN_SUCCESS_RATE = 0.7;
  private readonly DEFAULT_MIN_USAGE_COUNT = 5;
  private readonly DEFAULT_MAX_AGE_DAYS = 90;
  private readonly DEFAULT_MIN_QUALITY_SCORE = 0.5;
  private readonly DEFAULT_GC_INTERVAL = 3600000; // 1 hour

  constructor(library: DistributedPatternLibrary, config: QualityScorerConfig = {}) {
    this.library = library;
    this.config = {
      minSuccessRate: config.minSuccessRate || this.DEFAULT_MIN_SUCCESS_RATE,
      minUsageCount: config.minUsageCount || this.DEFAULT_MIN_USAGE_COUNT,
      maxAgeInDays: config.maxAgeInDays || this.DEFAULT_MAX_AGE_DAYS,
      minQualityScore: config.minQualityScore || this.DEFAULT_MIN_QUALITY_SCORE,
      successRateWeight: config.successRateWeight || 0.5,
      usageWeight: config.usageWeight || 0.3,
      recencyWeight: config.recencyWeight || 0.2,
      enableAutoGC: config.enableAutoGC !== false,
      gcInterval: config.gcInterval || this.DEFAULT_GC_INTERVAL
    };
    this.usageHistory = new Map();
    this.metricsCache = new Map();
  }

  /**
   * Start automatic garbage collection
   */
  startAutoGC(): void {
    if (!this.config.enableAutoGC) {
      return;
    }

    this.gcTimer = setInterval(async () => {
      await this.garbageCollect();
    }, this.config.gcInterval!);
  }

  /**
   * Stop automatic garbage collection
   */
  stopAutoGC(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = undefined;
    }
  }

  /**
   * Record pattern usage
   */
  async recordUsage(usage: PatternUsage): Promise<void> {
    const history = this.usageHistory.get(usage.patternId) || [];
    history.push(usage);
    this.usageHistory.set(usage.patternId, history);

    // Invalidate metrics cache
    this.metricsCache.delete(usage.patternId);

    // Update pattern lastUsed and usageCount
    const pattern = await this.library.getPattern(usage.patternId);
    if (pattern) {
      pattern.lastUsed = usage.timestamp;
      pattern.usageCount = (pattern.usageCount || 0) + 1;
      await this.library.updatePattern(pattern);
    }
  }

  /**
   * Calculate quality metrics for a pattern
   */
  async calculateMetrics(patternId: string): Promise<PatternQualityMetrics | null> {
    // Check cache first
    const cached = this.metricsCache.get(patternId);
    if (cached) {
      return cached;
    }

    const pattern = await this.library.getPattern(patternId);
    if (!pattern) {
      return null;
    }

    const history = this.usageHistory.get(patternId) || [];
    const now = Date.now();

    // Calculate basic stats
    const totalUsage = history.length;
    const successCount = history.filter(u => u.success).length;
    const failureCount = totalUsage - successCount;
    const successRate = totalUsage > 0 ? successCount / totalUsage : 0;

    // Calculate average execution time
    const executionTimes = history
      .filter(u => u.executionTime !== undefined)
      .map(u => u.executionTime!);
    const averageExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      : 0;

    // Calculate age
    const createdTimestamp = pattern.createdAt || now;
    const ageInDays = (now - createdTimestamp) / (1000 * 60 * 60 * 24);

    // Calculate trend score (recent vs old performance)
    const trendScore = this.calculateTrend(history);

    // Calculate quality score
    const qualityScore = this.calculateQualityScore({
      successRate,
      totalUsage,
      ageInDays,
      averageExecutionTime
    });

    const metrics: PatternQualityMetrics = {
      patternId,
      qualityScore,
      successRate,
      totalUsage,
      successCount,
      failureCount,
      averageExecutionTime,
      lastUsedTimestamp: pattern.lastUsed || createdTimestamp,
      createdTimestamp,
      ageInDays,
      trendScore
    };

    // Cache metrics
    this.metricsCache.set(patternId, metrics);

    return metrics;
  }

  /**
   * Calculate overall quality score (0-1)
   */
  private calculateQualityScore(params: {
    successRate: number;
    totalUsage: number;
    ageInDays: number;
    averageExecutionTime: number;
  }): number {
    const { successRate, totalUsage, ageInDays, averageExecutionTime } = params;

    // Success rate component (0-1)
    const successComponent = successRate * this.config.successRateWeight!;

    // Usage frequency component (0-1, normalized)
    // More usage = higher score, with diminishing returns
    const usageComponent = Math.min(totalUsage / 100, 1) * this.config.usageWeight!;

    // Recency component (0-1, inverse of age)
    // Newer patterns score higher
    const recencyComponent = Math.max(0, 1 - ageInDays / this.config.maxAgeInDays!) * this.config.recencyWeight!;

    // Combine components
    const rawScore = successComponent + usageComponent + recencyComponent;

    // Normalize to 0-1
    const totalWeight = this.config.successRateWeight! + this.config.usageWeight! + this.config.recencyWeight!;
    return Math.min(rawScore / totalWeight, 1);
  }

  /**
   * Calculate trend score (recent performance vs historical)
   */
  private calculateTrend(history: PatternUsage[]): number {
    if (history.length < 10) {
      return 0; // Not enough data
    }

    const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const midpoint = Math.floor(sortedHistory.length / 2);

    const oldHalf = sortedHistory.slice(0, midpoint);
    const newHalf = sortedHistory.slice(midpoint);

    const oldSuccessRate = oldHalf.filter(u => u.success).length / oldHalf.length;
    const newSuccessRate = newHalf.filter(u => u.success).length / newHalf.length;

    // Positive = improving, negative = degrading
    return newSuccessRate - oldSuccessRate;
  }

  /**
   * Get ranked patterns by quality
   */
  async getRankedPatterns(options?: {
    minQualityScore?: number;
    limit?: number;
    sortBy?: 'quality' | 'usage' | 'recency';
  }): Promise<RankedPattern[]> {
    const patterns = await this.library.getPatterns();
    const rankedPatterns: RankedPattern[] = [];

    for (const pattern of patterns) {
      const metrics = await this.calculateMetrics(pattern.id);
      if (!metrics) continue;

      // Apply quality filter
      if (options?.minQualityScore && metrics.qualityScore < options.minQualityScore) {
        continue;
      }

      rankedPatterns.push({
        pattern,
        metrics,
        rank: 0 // Will be set after sorting
      });
    }

    // Sort patterns
    const sortBy = options?.sortBy || 'quality';
    rankedPatterns.sort((a, b) => {
      switch (sortBy) {
        case 'usage':
          return b.metrics.totalUsage - a.metrics.totalUsage;
        case 'recency':
          return b.metrics.lastUsedTimestamp - a.metrics.lastUsedTimestamp;
        case 'quality':
        default:
          return b.metrics.qualityScore - a.metrics.qualityScore;
      }
    });

    // Assign ranks
    rankedPatterns.forEach((rp, index) => {
      rp.rank = index + 1;
    });

    // Apply limit
    if (options?.limit) {
      return rankedPatterns.slice(0, options.limit);
    }

    return rankedPatterns;
  }

  /**
   * Get patterns eligible for garbage collection
   */
  async getGarbageCandidates(): Promise<PatternQualityMetrics[]> {
    const patterns = await this.library.getPatterns();
    const candidates: PatternQualityMetrics[] = [];

    for (const pattern of patterns) {
      const metrics = await this.calculateMetrics(pattern.id);
      if (!metrics) continue;

      // Check if pattern should be garbage collected
      const shouldGC =
        (metrics.qualityScore < this.config.minQualityScore! &&
          metrics.totalUsage >= this.config.minUsageCount!) ||
        (metrics.successRate < this.config.minSuccessRate! &&
          metrics.totalUsage >= this.config.minUsageCount!) ||
        (metrics.ageInDays > this.config.maxAgeInDays! &&
          metrics.totalUsage === 0);

      if (shouldGC) {
        candidates.push(metrics);
      }
    }

    return candidates;
  }

  /**
   * Perform garbage collection
   */
  async garbageCollect(): Promise<GarbageCollectionResult> {
    const startTime = Date.now();
    const stats = await this.library.getStats();
    const totalPatterns = stats.totalPatterns;

    const candidates = await this.getGarbageCandidates();
    const removedPatternIds: string[] = [];
    let bytesReclaimed = 0;

    for (const metrics of candidates) {
      const pattern = await this.library.getPattern(metrics.patternId);
      if (!pattern) continue;

      // Estimate bytes
      const patternSize = JSON.stringify(pattern).length;

      // Delete pattern
      const deleted = await this.library.deletePattern(metrics.patternId);
      if (deleted) {
        removedPatternIds.push(metrics.patternId);
        bytesReclaimed += patternSize;

        // Remove from caches
        this.usageHistory.delete(metrics.patternId);
        this.metricsCache.delete(metrics.patternId);
      }
    }

    const duration = Date.now() - startTime;

    return {
      totalPatterns,
      patternsRemoved: removedPatternIds.length,
      removedPatternIds,
      bytesReclaimed,
      duration,
      timestamp: Date.now()
    };
  }

  /**
   * Get scorer statistics
   */
  async getStats(): Promise<{
    totalPatterns: number;
    trackedPatterns: number;
    averageQualityScore: number;
    lowQualityPatterns: number;
    garbageCandidates: number;
  }> {
    const libraryStats = await this.library.getStats();
    const patterns = await this.library.getPatterns();

    let totalQualityScore = 0;
    let lowQualityCount = 0;

    for (const pattern of patterns) {
      const metrics = await this.calculateMetrics(pattern.id);
      if (metrics) {
        totalQualityScore += metrics.qualityScore;
        if (metrics.qualityScore < this.config.minQualityScore!) {
          lowQualityCount++;
        }
      }
    }

    const candidates = await this.getGarbageCandidates();

    return {
      totalPatterns: libraryStats.totalPatterns,
      trackedPatterns: patterns.length,
      averageQualityScore: patterns.length > 0 ? totalQualityScore / patterns.length : 0,
      lowQualityPatterns: lowQualityCount,
      garbageCandidates: candidates.length
    };
  }

  /**
   * Clear all usage history
   */
  clearHistory(): void {
    this.usageHistory.clear();
    this.metricsCache.clear();
  }

  /**
   * Export usage history for analysis
   */
  exportHistory(): Map<string, PatternUsage[]> {
    return new Map(this.usageHistory);
  }

  /**
   * Import usage history from external source
   */
  importHistory(history: Map<string, PatternUsage[]>): void {
    this.usageHistory = new Map(history);
    this.metricsCache.clear(); // Invalidate cache
  }
}
