/**
 * Agentic QE v3 - Learning Consolidation Protocol
 *
 * Schedule: Friday 6pm (weekly)
 * Participants: Learning Coordinator, Transfer Specialist, Pattern Learner
 * Actions: Gather patterns, consolidate, update knowledge base
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Result,
  ok,
  err,
  DomainName,
  ALL_DOMAINS,
  DomainEvent,
} from '../../shared/types/index.js';
import { TimeRange } from '../../shared/value-objects/index.js';
import { EventBus, MemoryBackend } from '../../kernel/interfaces.js';
import {
  LearnedPattern,
  PatternType,
  Knowledge,
  IPatternLearningService,
  IKnowledgeSynthesisService,
} from '../../domains/learning-optimization/interfaces.js';

// ============================================================================
// Protocol Configuration
// ============================================================================

export interface LearningConsolidationConfig {
  /** Minimum patterns per domain to trigger consolidation */
  minPatternsForConsolidation: number;
  /** Pattern similarity threshold for merging (0-1) */
  similarityThreshold: number;
  /** Maximum patterns to keep per domain after consolidation */
  maxPatternsPerDomain: number;
  /** Minimum confidence to retain pattern */
  minConfidenceThreshold: number;
  /** Number of weeks of data to analyze */
  analysisWindowWeeks: number;
  /** Enable cross-project transfer */
  enableCrossProjectTransfer: boolean;
}

const DEFAULT_CONFIG: LearningConsolidationConfig = {
  minPatternsForConsolidation: 5,
  similarityThreshold: 0.85,
  maxPatternsPerDomain: 100,
  minConfidenceThreshold: 0.5,
  analysisWindowWeeks: 4,
  enableCrossProjectTransfer: true,
};

// ============================================================================
// Protocol Events
// ============================================================================

export interface LearningConsolidationStartedEvent extends DomainEvent {
  readonly type: 'LearningConsolidationStarted';
  readonly payload: {
    consolidationId: string;
    timestamp: Date;
    domainsToProcess: DomainName[];
  };
}

export interface PatternConsolidatedEvent extends DomainEvent {
  readonly type: 'PatternConsolidated';
  readonly payload: {
    consolidationId: string;
    domain: DomainName;
    patternsBeforeCount: number;
    patternsAfterCount: number;
    mergedPatternIds: string[];
    removedPatternIds: string[];
  };
}

export interface LearningConsolidationCompletedEvent extends DomainEvent {
  readonly type: 'LearningConsolidationCompleted';
  readonly payload: {
    consolidationId: string;
    stats: ConsolidationStats;
    insights: WeeklyInsight[];
    duration: number;
  };
}

export interface TransferReadyEvent extends DomainEvent {
  readonly type: 'TransferReady';
  readonly payload: {
    consolidationId: string;
    transferablePatterns: TransferablePattern[];
    targetProjects: string[];
  };
}

// ============================================================================
// Protocol Data Types
// ============================================================================

export interface DomainPatternGroup {
  domain: DomainName;
  patterns: LearnedPattern[];
  stats: DomainPatternStats;
}

export interface DomainPatternStats {
  totalPatterns: number;
  avgConfidence: number;
  avgSuccessRate: number;
  avgUsageCount: number;
  topPatternType: PatternType;
  newPatternsThisWeek: number;
}

export interface ConsolidationStats {
  domainsProcessed: number;
  totalPatternsAnalyzed: number;
  patternsMerged: number;
  patternsRemoved: number;
  patternsRetained: number;
  knowledgeItemsUpdated: number;
  improvementOpportunities: number;
  crossDomainTransfers: number;
}

export interface WeeklyInsight {
  type: 'improvement' | 'trend' | 'anomaly' | 'recommendation';
  domain: DomainName;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  actionItems: string[];
}

export interface TransferablePattern {
  patternId: string;
  domain: DomainName;
  name: string;
  applicableDomains: DomainName[];
  transferConfidence: number;
  reason: string;
}

export interface ConsolidationResult {
  consolidationId: string;
  startedAt: Date;
  completedAt: Date;
  stats: ConsolidationStats;
  insights: WeeklyInsight[];
  transferablePatterns: TransferablePattern[];
  domainReports: DomainConsolidationReport[];
}

export interface DomainConsolidationReport {
  domain: DomainName;
  patternsBeforeCount: number;
  patternsAfterCount: number;
  mergedPatterns: MergedPatternInfo[];
  removedPatterns: RemovedPatternInfo[];
  topPerformingPatterns: LearnedPattern[];
  improvementAreas: string[];
}

export interface MergedPatternInfo {
  resultPatternId: string;
  sourcePatternIds: string[];
  mergeReason: string;
}

export interface RemovedPatternInfo {
  patternId: string;
  name: string;
  removalReason: string;
}

// ============================================================================
// Learning Consolidation Protocol Implementation
// ============================================================================

/**
 * Learning Consolidation Protocol
 *
 * Orchestrates weekly learning consolidation across all QE domains.
 * Gathers patterns, consolidates similar ones, removes underperformers,
 * and prepares high-value patterns for cross-project transfer.
 */
export class LearningConsolidationProtocol {
  private readonly config: LearningConsolidationConfig;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly patternService: IPatternLearningService,
    private readonly knowledgeService: IKnowledgeSynthesisService,
    config: Partial<LearningConsolidationConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Main Execution
  // ============================================================================

  /**
   * Execute the weekly learning consolidation protocol
   */
  async execute(): Promise<Result<ConsolidationResult>> {
    const consolidationId = uuidv4();
    const startedAt = new Date();

    try {
      // Publish start event
      await this.publishStartEvent(consolidationId);

      // Step 1: Gather patterns from all domains
      const gatheredPatterns = await this.gatherPatterns();
      if (!gatheredPatterns.success) {
        return err(gatheredPatterns.error);
      }

      // Step 2: Consolidate patterns per domain
      const domainReports: DomainConsolidationReport[] = [];
      let totalMerged = 0;
      let totalRemoved = 0;
      let totalRetained = 0;

      for (const domainGroup of gatheredPatterns.value) {
        const consolidationResult = await this.consolidatePatterns(
          consolidationId,
          domainGroup
        );
        if (consolidationResult.success) {
          domainReports.push(consolidationResult.value);
          totalMerged += consolidationResult.value.mergedPatterns.length;
          totalRemoved += consolidationResult.value.removedPatterns.length;
          totalRetained += consolidationResult.value.patternsAfterCount;
        }
      }

      // Step 3: Update knowledge base with consolidated patterns
      const knowledgeUpdateResult = await this.updateKnowledgeBase(domainReports);

      // Step 4: Prepare patterns for cross-project transfer
      const transferResult = await this.prepareTransfer(
        consolidationId,
        domainReports
      );

      // Step 5: Generate weekly insights
      const insights = await this.generateInsights(
        gatheredPatterns.value,
        domainReports
      );

      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      const stats: ConsolidationStats = {
        domainsProcessed: domainReports.length,
        totalPatternsAnalyzed: gatheredPatterns.value.reduce(
          (sum, g) => sum + g.patterns.length,
          0
        ),
        patternsMerged: totalMerged,
        patternsRemoved: totalRemoved,
        patternsRetained: totalRetained,
        knowledgeItemsUpdated: knowledgeUpdateResult.success
          ? knowledgeUpdateResult.value
          : 0,
        improvementOpportunities: insights.filter(
          (i) => i.type === 'improvement'
        ).length,
        crossDomainTransfers: transferResult.success
          ? transferResult.value.length
          : 0,
      };

      // Publish completion event
      await this.publishCompletedEvent(consolidationId, stats, insights, duration);

      const result: ConsolidationResult = {
        consolidationId,
        startedAt,
        completedAt,
        stats,
        insights,
        transferablePatterns: transferResult.success ? transferResult.value : [],
        domainReports,
      };

      // Store result for historical analysis
      await this.storeConsolidationResult(result);

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Pattern Gathering
  // ============================================================================

  /**
   * Gather patterns from all 12 domains
   */
  async gatherPatterns(): Promise<Result<DomainPatternGroup[]>> {
    try {
      const domainGroups: DomainPatternGroup[] = [];
      const timeRange = TimeRange.lastNDays(this.config.analysisWindowWeeks * 7);

      for (const domain of ALL_DOMAINS) {
        const patterns = await this.getPatternsForDomain(domain, timeRange);
        if (patterns.length > 0) {
          const stats = this.calculateDomainStats(patterns, timeRange);
          domainGroups.push({ domain, patterns, stats });
        }
      }

      return ok(domainGroups);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get patterns for a specific domain
   */
  private async getPatternsForDomain(
    domain: DomainName,
    timeRange: TimeRange
  ): Promise<LearnedPattern[]> {
    const keys = await this.memory.search(`learning:pattern:*`, 500);
    const patterns: LearnedPattern[] = [];

    for (const key of keys) {
      const pattern = await this.memory.get<LearnedPattern>(key);
      if (
        pattern &&
        pattern.domain === domain &&
        !key.includes(':archived:') &&
        (timeRange.contains(pattern.createdAt) || timeRange.contains(pattern.lastUsedAt))
      ) {
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  /**
   * Calculate statistics for a domain's patterns
   */
  private calculateDomainStats(
    patterns: LearnedPattern[],
    timeRange: TimeRange
  ): DomainPatternStats {
    if (patterns.length === 0) {
      return {
        totalPatterns: 0,
        avgConfidence: 0,
        avgSuccessRate: 0,
        avgUsageCount: 0,
        topPatternType: 'workflow-pattern',
        newPatternsThisWeek: 0,
      };
    }

    const typeCounts: Map<PatternType, number> = new Map();
    let totalConfidence = 0;
    let totalSuccessRate = 0;
    let totalUsageCount = 0;
    let newPatterns = 0;

    for (const pattern of patterns) {
      totalConfidence += pattern.confidence;
      totalSuccessRate += pattern.successRate;
      totalUsageCount += pattern.usageCount;
      typeCounts.set(pattern.type, (typeCounts.get(pattern.type) || 0) + 1);

      if (timeRange.contains(pattern.createdAt)) {
        newPatterns++;
      }
    }

    let topType: PatternType = 'workflow-pattern';
    let maxCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        topType = type;
      }
    }

    return {
      totalPatterns: patterns.length,
      avgConfidence: totalConfidence / patterns.length,
      avgSuccessRate: totalSuccessRate / patterns.length,
      avgUsageCount: totalUsageCount / patterns.length,
      topPatternType: topType,
      newPatternsThisWeek: newPatterns,
    };
  }

  // ============================================================================
  // Pattern Consolidation
  // ============================================================================

  /**
   * Consolidate patterns within a domain - merge similar, remove underperformers
   */
  async consolidatePatterns(
    consolidationId: string,
    domainGroup: DomainPatternGroup
  ): Promise<Result<DomainConsolidationReport>> {
    try {
      const { domain, patterns } = domainGroup;
      const mergedPatterns: MergedPatternInfo[] = [];
      const removedPatterns: RemovedPatternInfo[] = [];
      const retainedPatterns: LearnedPattern[] = [];

      // Group similar patterns for merging
      const similarGroups = this.groupSimilarPatterns(patterns);

      for (const group of similarGroups) {
        if (group.length >= 2) {
          // Merge similar patterns
          const mergeResult = await this.mergePatternGroup(group);
          if (mergeResult.success) {
            mergedPatterns.push({
              resultPatternId: mergeResult.value.id,
              sourcePatternIds: group.map((p) => p.id),
              mergeReason: 'Similar pattern context and template',
            });
            retainedPatterns.push(mergeResult.value);
          }
        } else {
          // Single pattern - check if it should be retained
          const pattern = group[0];
          if (this.shouldRetainPattern(pattern)) {
            retainedPatterns.push(pattern);
          } else {
            removedPatterns.push({
              patternId: pattern.id,
              name: pattern.name,
              removalReason: this.getRemovalReason(pattern),
            });
            await this.archivePattern(pattern);
          }
        }
      }

      // Trim to max patterns if needed
      const finalPatterns = this.trimToMaxPatterns(retainedPatterns, domain);
      const trimmedCount = retainedPatterns.length - finalPatterns.length;
      if (trimmedCount > 0) {
        const trimmed = retainedPatterns.slice(finalPatterns.length);
        for (const p of trimmed) {
          removedPatterns.push({
            patternId: p.id,
            name: p.name,
            removalReason: 'Exceeded max patterns per domain limit',
          });
          await this.archivePattern(p);
        }
      }

      // Publish domain consolidation event
      await this.publishPatternConsolidatedEvent(
        consolidationId,
        domain,
        patterns.length,
        finalPatterns.length,
        mergedPatterns.map((m) => m.resultPatternId),
        removedPatterns.map((r) => r.patternId)
      );

      const report: DomainConsolidationReport = {
        domain,
        patternsBeforeCount: patterns.length,
        patternsAfterCount: finalPatterns.length,
        mergedPatterns,
        removedPatterns,
        topPerformingPatterns: this.getTopPerformingPatterns(finalPatterns, 5),
        improvementAreas: this.identifyImprovementAreas(domainGroup),
      };

      return ok(report);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Group patterns by similarity
   */
  private groupSimilarPatterns(patterns: LearnedPattern[]): LearnedPattern[][] {
    const groups: LearnedPattern[][] = [];
    const assigned = new Set<string>();

    for (const pattern of patterns) {
      if (assigned.has(pattern.id)) continue;

      const group: LearnedPattern[] = [pattern];
      assigned.add(pattern.id);

      for (const other of patterns) {
        if (assigned.has(other.id)) continue;

        if (this.areSimilarPatterns(pattern, other)) {
          group.push(other);
          assigned.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Check if two patterns are similar enough to merge
   */
  private areSimilarPatterns(a: LearnedPattern, b: LearnedPattern): boolean {
    // Same type required
    if (a.type !== b.type) return false;

    // Check context similarity
    const contextSimilarity = this.calculateContextSimilarity(a.context, b.context);
    if (contextSimilarity < this.config.similarityThreshold) return false;

    // Check template type
    if (a.template.type !== b.template.type) return false;

    return true;
  }

  /**
   * Calculate similarity between two pattern contexts
   */
  private calculateContextSimilarity(
    a: { language?: string; framework?: string; testType?: string; tags: string[] },
    b: { language?: string; framework?: string; testType?: string; tags: string[] }
  ): number {
    let score = 0;
    let factors = 0;

    // Language match
    if (a.language && b.language) {
      factors++;
      if (a.language === b.language) score++;
    }

    // Framework match
    if (a.framework && b.framework) {
      factors++;
      if (a.framework === b.framework) score++;
    }

    // Test type match
    if (a.testType && b.testType) {
      factors++;
      if (a.testType === b.testType) score++;
    }

    // Tag overlap
    if (a.tags.length > 0 && b.tags.length > 0) {
      factors++;
      const overlap = a.tags.filter((t) => b.tags.includes(t)).length;
      const union = new Set([...a.tags, ...b.tags]).size;
      score += overlap / union;
    }

    return factors > 0 ? score / factors : 0;
  }

  /**
   * Merge a group of similar patterns into one
   */
  private async mergePatternGroup(
    group: LearnedPattern[]
  ): Promise<Result<LearnedPattern>> {
    const patternIds = group.map((p) => p.id);
    return this.patternService.consolidatePatterns(patternIds);
  }

  /**
   * Check if a pattern should be retained
   */
  private shouldRetainPattern(pattern: LearnedPattern): boolean {
    // Remove low confidence patterns
    if (pattern.confidence < this.config.minConfidenceThreshold) {
      return false;
    }

    // Remove patterns with poor success rate and low usage
    if (pattern.successRate < 0.3 && pattern.usageCount < 5) {
      return false;
    }

    // Check for staleness (not used in 30 days)
    const daysSinceLastUse =
      (Date.now() - pattern.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUse > 30 && pattern.usageCount < 10) {
      return false;
    }

    return true;
  }

  /**
   * Get reason for pattern removal
   */
  private getRemovalReason(pattern: LearnedPattern): string {
    if (pattern.confidence < this.config.minConfidenceThreshold) {
      return `Low confidence (${(pattern.confidence * 100).toFixed(1)}%)`;
    }
    if (pattern.successRate < 0.3) {
      return `Low success rate (${(pattern.successRate * 100).toFixed(1)}%)`;
    }
    const daysSinceLastUse =
      (Date.now() - pattern.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUse > 30) {
      return `Stale - not used in ${Math.round(daysSinceLastUse)} days`;
    }
    return 'Below retention threshold';
  }

  /**
   * Archive a pattern (soft delete)
   */
  private async archivePattern(pattern: LearnedPattern): Promise<void> {
    // Move to archived namespace
    await this.memory.set(`learning:pattern:archived:${pattern.id}`, {
      ...pattern,
      archivedAt: new Date(),
    }, { namespace: 'learning-optimization', persist: true });

    // Delete from active patterns
    await this.memory.delete(`learning:pattern:${pattern.id}`);
  }

  /**
   * Trim patterns to max allowed per domain
   */
  private trimToMaxPatterns(
    patterns: LearnedPattern[],
    _domain: DomainName
  ): LearnedPattern[] {
    if (patterns.length <= this.config.maxPatternsPerDomain) {
      return patterns;
    }

    // Sort by effectiveness score and keep top N
    return patterns
      .sort((a, b) => {
        const scoreA = a.confidence * 0.4 + a.successRate * 0.4 + Math.min(a.usageCount / 100, 0.2);
        const scoreB = b.confidence * 0.4 + b.successRate * 0.4 + Math.min(b.usageCount / 100, 0.2);
        return scoreB - scoreA;
      })
      .slice(0, this.config.maxPatternsPerDomain);
  }

  /**
   * Get top performing patterns
   */
  private getTopPerformingPatterns(
    patterns: LearnedPattern[],
    count: number
  ): LearnedPattern[] {
    return patterns
      .sort((a, b) => {
        const scoreA = a.successRate * 0.6 + a.confidence * 0.4;
        const scoreB = b.successRate * 0.6 + b.confidence * 0.4;
        return scoreB - scoreA;
      })
      .slice(0, count);
  }

  /**
   * Identify improvement areas for a domain
   */
  private identifyImprovementAreas(group: DomainPatternGroup): string[] {
    const areas: string[] = [];
    const { stats } = group;

    if (stats.avgSuccessRate < 0.7) {
      areas.push(`Improve pattern success rate (currently ${(stats.avgSuccessRate * 100).toFixed(1)}%)`);
    }

    if (stats.avgConfidence < 0.6) {
      areas.push(`Increase pattern confidence through more training data`);
    }

    if (stats.newPatternsThisWeek === 0) {
      areas.push(`No new patterns learned this week - consider gathering more experiences`);
    }

    if (stats.avgUsageCount < 5) {
      areas.push(`Low pattern utilization - promote pattern adoption`);
    }

    return areas;
  }

  // ============================================================================
  // Knowledge Base Update
  // ============================================================================

  /**
   * Update knowledge base with consolidated patterns
   */
  async updateKnowledgeBase(
    domainReports: DomainConsolidationReport[]
  ): Promise<Result<number>> {
    try {
      let updatedCount = 0;

      for (const report of domainReports) {
        // Create knowledge entries for top performing patterns
        for (const pattern of report.topPerformingPatterns) {
          const knowledgeResult = await this.createKnowledgeFromPattern(pattern);
          if (knowledgeResult.success) {
            updatedCount++;

            // Share high-performing pattern knowledge with related domains
            if (pattern.successRate >= 0.8) {
              const knowledge = await this.memory.get<Knowledge>(
                `learning:knowledge:pattern:${pattern.id}`
              );
              if (knowledge) {
                // Use knowledgeService to share across domains
                await this.knowledgeService.shareKnowledge(knowledge, [
                  {
                    value: `${pattern.domain}-coordinator`,
                    domain: pattern.domain,
                    type: 'coordinator',
                  },
                ]);
              }
            }
          }
        }

        // Store consolidation summary as knowledge
        await this.storeConsolidationSummary(report);
        updatedCount++;
      }

      return ok(updatedCount);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Create a knowledge entry from a high-performing pattern
   */
  private async createKnowledgeFromPattern(
    pattern: LearnedPattern
  ): Promise<Result<void>> {
    const knowledge: Knowledge = {
      id: uuidv4(),
      type: 'heuristic',
      domain: pattern.domain,
      content: {
        format: 'json',
        data: {
          patternId: pattern.id,
          patternType: pattern.type,
          template: pattern.template,
          context: pattern.context,
          effectiveness: {
            confidence: pattern.confidence,
            successRate: pattern.successRate,
            usageCount: pattern.usageCount,
          },
        },
        metadata: {
          sourceType: 'pattern-consolidation',
          consolidatedAt: new Date().toISOString(),
        },
      },
      sourceAgentId: {
        value: 'learning-consolidation-protocol',
        domain: 'learning-optimization',
        type: 'coordinator',
      },
      targetDomains: [pattern.domain],
      relevanceScore: pattern.confidence * 0.5 + pattern.successRate * 0.5,
      version: 1,
      createdAt: new Date(),
    };

    await this.memory.set(`learning:knowledge:pattern:${pattern.id}`, knowledge, {
      namespace: 'learning-optimization',
      persist: true,
    });

    return ok(undefined);
  }

  /**
   * Store consolidation summary as knowledge
   */
  private async storeConsolidationSummary(
    report: DomainConsolidationReport
  ): Promise<void> {
    await this.memory.set(
      `learning:consolidation:summary:${report.domain}:${Date.now()}`,
      {
        domain: report.domain,
        date: new Date(),
        patternsBefore: report.patternsBeforeCount,
        patternsAfter: report.patternsAfterCount,
        mergedCount: report.mergedPatterns.length,
        removedCount: report.removedPatterns.length,
        improvementAreas: report.improvementAreas,
      },
      { namespace: 'learning-optimization', persist: true }
    );
  }

  // ============================================================================
  // Cross-Project Transfer
  // ============================================================================

  /**
   * Prepare high-value patterns for cross-project transfer
   */
  async prepareTransfer(
    consolidationId: string,
    domainReports: DomainConsolidationReport[]
  ): Promise<Result<TransferablePattern[]>> {
    try {
      if (!this.config.enableCrossProjectTransfer) {
        return ok([]);
      }

      const transferablePatterns: TransferablePattern[] = [];

      for (const report of domainReports) {
        for (const pattern of report.topPerformingPatterns) {
          // Only transfer highly effective patterns
          if (pattern.successRate >= 0.8 && pattern.confidence >= 0.7) {
            const applicableDomains = this.findApplicableDomains(pattern);
            if (applicableDomains.length > 1) {
              transferablePatterns.push({
                patternId: pattern.id,
                domain: pattern.domain,
                name: pattern.name,
                applicableDomains,
                transferConfidence: Math.min(pattern.successRate, pattern.confidence),
                reason: `High success rate (${(pattern.successRate * 100).toFixed(0)}%) with ${pattern.usageCount} uses`,
              });
            }
          }
        }
      }

      // Publish transfer ready event if we have patterns to transfer
      if (transferablePatterns.length > 0) {
        await this.publishTransferReadyEvent(consolidationId, transferablePatterns);
      }

      return ok(transferablePatterns);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Find domains where a pattern could be applicable
   */
  private findApplicableDomains(pattern: LearnedPattern): DomainName[] {
    const relatedDomains: Record<DomainName, DomainName[]> = {
      'test-generation': ['test-execution', 'coverage-analysis'],
      'test-execution': ['test-generation', 'coverage-analysis', 'quality-assessment'],
      'coverage-analysis': ['test-generation', 'test-execution', 'quality-assessment'],
      'quality-assessment': ['test-execution', 'coverage-analysis', 'defect-intelligence'],
      'defect-intelligence': ['quality-assessment', 'code-intelligence'],
      'requirements-validation': ['test-generation', 'quality-assessment'],
      'code-intelligence': ['defect-intelligence', 'security-compliance'],
      'security-compliance': ['code-intelligence', 'quality-assessment'],
      'contract-testing': ['test-generation', 'test-execution'],
      'visual-accessibility': ['quality-assessment'],
      'chaos-resilience': ['test-execution', 'quality-assessment'],
      'learning-optimization': ALL_DOMAINS.filter((d) => d !== 'learning-optimization'),
      'coordination': ALL_DOMAINS.filter((d) => d !== 'coordination'),
    };

    return [pattern.domain, ...(relatedDomains[pattern.domain] || [])];
  }

  // ============================================================================
  // Insight Generation
  // ============================================================================

  /**
   * Generate weekly learning report with insights
   */
  async generateInsights(
    gatheredPatterns: DomainPatternGroup[],
    domainReports: DomainConsolidationReport[]
  ): Promise<WeeklyInsight[]> {
    const insights: WeeklyInsight[] = [];

    // Analyze each domain
    for (const group of gatheredPatterns) {
      const report = domainReports.find((r) => r.domain === group.domain);

      // Check for significant pattern growth
      if (group.stats.newPatternsThisWeek > 5) {
        insights.push({
          type: 'trend',
          domain: group.domain,
          title: `High pattern learning activity in ${group.domain}`,
          description: `${group.stats.newPatternsThisWeek} new patterns learned this week`,
          impact: 'medium',
          actionItems: ['Review new patterns for quality', 'Monitor success rates'],
        });
      }

      // Check for declining success rates
      if (group.stats.avgSuccessRate < 0.5) {
        insights.push({
          type: 'anomaly',
          domain: group.domain,
          title: `Low average success rate in ${group.domain}`,
          description: `Average success rate is ${(group.stats.avgSuccessRate * 100).toFixed(1)}%`,
          impact: 'high',
          actionItems: [
            'Review pattern selection criteria',
            'Gather more training experiences',
            'Consider retiring low-performing patterns',
          ],
        });
      }

      // Identify improvement opportunities
      if (report && report.improvementAreas.length > 0) {
        insights.push({
          type: 'improvement',
          domain: group.domain,
          title: `Improvement opportunities in ${group.domain}`,
          description: `${report.improvementAreas.length} areas identified for improvement`,
          impact: 'medium',
          actionItems: report.improvementAreas,
        });
      }

      // Recommend consolidation if many patterns
      if (group.patterns.length > this.config.maxPatternsPerDomain * 0.8) {
        insights.push({
          type: 'recommendation',
          domain: group.domain,
          title: `Pattern count nearing limit in ${group.domain}`,
          description: `${group.patterns.length} patterns (limit: ${this.config.maxPatternsPerDomain})`,
          impact: 'low',
          actionItems: [
            'Review pattern effectiveness',
            'Consider more aggressive consolidation',
          ],
        });
      }
    }

    // Cross-domain insights
    const topDomains = gatheredPatterns
      .sort((a, b) => b.stats.avgSuccessRate - a.stats.avgSuccessRate)
      .slice(0, 3);

    if (topDomains.length > 0) {
      insights.push({
        type: 'trend',
        domain: topDomains[0].domain,
        title: 'Top performing domains',
        description: `Best success rates: ${topDomains.map((d) => `${d.domain} (${(d.stats.avgSuccessRate * 100).toFixed(0)}%)`).join(', ')}`,
        impact: 'medium',
        actionItems: ['Analyze successful patterns for cross-domain application'],
      });
    }

    return insights;
  }

  // ============================================================================
  // Event Publishing
  // ============================================================================

  private async publishStartEvent(consolidationId: string): Promise<void> {
    const event: LearningConsolidationStartedEvent = {
      id: uuidv4(),
      type: 'LearningConsolidationStarted',
      timestamp: new Date(),
      source: 'learning-optimization',
      payload: {
        consolidationId,
        timestamp: new Date(),
        domainsToProcess: [...ALL_DOMAINS],
      },
    };
    await this.eventBus.publish(event);
  }

  private async publishPatternConsolidatedEvent(
    consolidationId: string,
    domain: DomainName,
    patternsBeforeCount: number,
    patternsAfterCount: number,
    mergedPatternIds: string[],
    removedPatternIds: string[]
  ): Promise<void> {
    const event: PatternConsolidatedEvent = {
      id: uuidv4(),
      type: 'PatternConsolidated',
      timestamp: new Date(),
      source: 'learning-optimization',
      payload: {
        consolidationId,
        domain,
        patternsBeforeCount,
        patternsAfterCount,
        mergedPatternIds,
        removedPatternIds,
      },
    };
    await this.eventBus.publish(event);
  }

  private async publishCompletedEvent(
    consolidationId: string,
    stats: ConsolidationStats,
    insights: WeeklyInsight[],
    duration: number
  ): Promise<void> {
    const event: LearningConsolidationCompletedEvent = {
      id: uuidv4(),
      type: 'LearningConsolidationCompleted',
      timestamp: new Date(),
      source: 'learning-optimization',
      payload: {
        consolidationId,
        stats,
        insights,
        duration,
      },
    };
    await this.eventBus.publish(event);
  }

  private async publishTransferReadyEvent(
    consolidationId: string,
    transferablePatterns: TransferablePattern[]
  ): Promise<void> {
    // Extract unique target projects (in this case, we derive from domains)
    const targetProjects = [...new Set(
      transferablePatterns.flatMap((p) => p.applicableDomains)
    )].map((d) => `project-${d}`);

    const event: TransferReadyEvent = {
      id: uuidv4(),
      type: 'TransferReady',
      timestamp: new Date(),
      source: 'learning-optimization',
      payload: {
        consolidationId,
        transferablePatterns,
        targetProjects,
      },
    };
    await this.eventBus.publish(event);
  }

  // ============================================================================
  // Storage
  // ============================================================================

  private async storeConsolidationResult(result: ConsolidationResult): Promise<void> {
    await this.memory.set(
      `learning:consolidation:result:${result.consolidationId}`,
      result,
      { namespace: 'learning-optimization', persist: true }
    );

    // Also store in historical timeline
    await this.memory.set(
      `learning:consolidation:history:${result.completedAt.getTime()}`,
      {
        consolidationId: result.consolidationId,
        completedAt: result.completedAt,
        stats: result.stats,
      },
      { namespace: 'learning-optimization', persist: true }
    );
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get previous consolidation results for trend analysis
   */
  async getPreviousConsolidations(count: number): Promise<ConsolidationResult[]> {
    const keys = await this.memory.search('learning:consolidation:result:*', count);
    const results: ConsolidationResult[] = [];

    for (const key of keys) {
      const result = await this.memory.get<ConsolidationResult>(key);
      if (result) {
        results.push(result);
      }
    }

    return results.sort(
      (a, b) => b.completedAt.getTime() - a.completedAt.getTime()
    );
  }

  /**
   * Get consolidation history summary
   */
  async getConsolidationHistory(weeks: number): Promise<{
    consolidations: number;
    totalPatternsMerged: number;
    totalPatternsRemoved: number;
    avgImprovementOpportunities: number;
  }> {
    const results = await this.getPreviousConsolidations(weeks);

    if (results.length === 0) {
      return {
        consolidations: 0,
        totalPatternsMerged: 0,
        totalPatternsRemoved: 0,
        avgImprovementOpportunities: 0,
      };
    }

    const totalMerged = results.reduce((sum, r) => sum + r.stats.patternsMerged, 0);
    const totalRemoved = results.reduce((sum, r) => sum + r.stats.patternsRemoved, 0);
    const avgOpportunities =
      results.reduce((sum, r) => sum + r.stats.improvementOpportunities, 0) /
      results.length;

    return {
      consolidations: results.length,
      totalPatternsMerged: totalMerged,
      totalPatternsRemoved: totalRemoved,
      avgImprovementOpportunities: avgOpportunities,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Learning Consolidation Protocol instance
 */
export function createLearningConsolidationProtocol(
  eventBus: EventBus,
  memory: MemoryBackend,
  patternService: IPatternLearningService,
  knowledgeService: IKnowledgeSynthesisService,
  config?: Partial<LearningConsolidationConfig>
): LearningConsolidationProtocol {
  return new LearningConsolidationProtocol(
    eventBus,
    memory,
    patternService,
    knowledgeService,
    config
  );
}
