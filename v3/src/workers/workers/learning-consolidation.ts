/**
 * Agentic QE v3 - Learning Consolidation Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Consolidates learning patterns across domains including:
 * - Cross-domain pattern aggregation
 * - Strategy optimization
 * - Knowledge distillation
 * - Pattern pruning and deduplication
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';
import { DomainName, ALL_DOMAINS } from '../../shared/types';

const CONFIG: WorkerConfig = {
  id: 'learning-consolidation',
  name: 'Learning Consolidation',
  description: 'Consolidates learning patterns across domains and optimizes strategies',
  intervalMs: 30 * 60 * 1000, // 30 minutes
  priority: 'normal',
  targetDomains: ['learning-optimization'],
  enabled: true,
  timeoutMs: 300000,
  retryCount: 2,
  retryDelayMs: 30000,
};

interface LearningPattern {
  id: string;
  domain: DomainName;
  type: string;
  pattern: string;
  confidence: number;
  occurrences: number;
  lastSeen: Date;
  effectiveness: number;
}

interface ConsolidationResult {
  patternsAnalyzed: number;
  patternsPruned: number;
  patternsConsolidated: number;
  newInsights: number;
  strategyUpdates: number;
  crossDomainPatterns: number;
}

export class LearningConsolidationWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting learning consolidation');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    // Collect patterns from all domains
    const patterns = await this.collectPatterns(context);

    // Consolidate and analyze
    const result = await this.consolidatePatterns(context, patterns);

    // Identify cross-domain patterns
    this.identifyCrossDomainPatterns(patterns, findings, recommendations);

    // Prune ineffective patterns
    this.pruneIneffectivePatterns(patterns, findings, recommendations);

    // Generate optimization recommendations
    this.generateOptimizations(patterns, findings, recommendations);

    // Store consolidated results
    await context.memory.set('learning:lastConsolidation', result);
    await context.memory.set('learning:consolidatedPatterns', patterns);

    const healthScore = this.calculateHealthScore(result, patterns);

    context.logger.info('Learning consolidation complete', {
      healthScore,
      patternsAnalyzed: result.patternsAnalyzed,
      newInsights: result.newInsights,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: result.patternsAnalyzed,
        issuesFound: result.patternsPruned,
        healthScore,
        trend: 'stable',
        domainMetrics: {
          patternsAnalyzed: result.patternsAnalyzed,
          patternsPruned: result.patternsPruned,
          patternsConsolidated: result.patternsConsolidated,
          newInsights: result.newInsights,
          crossDomainPatterns: result.crossDomainPatterns,
        },
      },
      findings,
      recommendations
    );
  }

  private async collectPatterns(context: WorkerContext): Promise<LearningPattern[]> {
    const patterns: LearningPattern[] = [];

    // In a real implementation, this would query each domain's learning store
    // Simulated patterns for demonstration
    for (const domain of ALL_DOMAINS) {
      const domainPatterns = await this.getDomainPatterns(context, domain);
      patterns.push(...domainPatterns);
    }

    return patterns;
  }

  private async getDomainPatterns(_context: WorkerContext, domain: DomainName): Promise<LearningPattern[]> {
    // Simulated patterns for each domain
    const now = new Date();
    const patterns: LearningPattern[] = [];

    // Generate some sample patterns
    const patternTypes = ['test-pattern', 'failure-pattern', 'optimization-pattern'];
    for (let i = 0; i < 3; i++) {
      patterns.push({
        id: `${domain}-pattern-${i}`,
        domain,
        type: patternTypes[i % patternTypes.length],
        pattern: `Pattern ${i} for ${domain}`,
        confidence: 0.7 + Math.random() * 0.3,
        occurrences: Math.floor(Math.random() * 100) + 1,
        lastSeen: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        effectiveness: 0.5 + Math.random() * 0.5,
      });
    }

    return patterns;
  }

  private async consolidatePatterns(
    context: WorkerContext,
    patterns: LearningPattern[]
  ): Promise<ConsolidationResult> {
    let patternsPruned = 0;
    let patternsConsolidated = 0;
    let newInsights = 0;

    // Identify duplicates and merge
    const patternMap = new Map<string, LearningPattern[]>();
    for (const pattern of patterns) {
      const key = `${pattern.type}:${pattern.pattern}`;
      const existing = patternMap.get(key) || [];
      existing.push(pattern);
      patternMap.set(key, existing);
    }

    // Count consolidated patterns
    for (const [, group] of Array.from(patternMap.entries())) {
      if (group.length > 1) {
        patternsConsolidated += group.length - 1;
      }
    }

    // Prune low-confidence patterns
    const lowConfidencePatterns = patterns.filter(p => p.confidence < 0.5);
    patternsPruned = lowConfidencePatterns.length;

    // Identify new insights (patterns with high effectiveness and recency)
    const recentHighPerformers = patterns.filter(p => {
      const daysSinceLastSeen = (Date.now() - p.lastSeen.getTime()) / (24 * 60 * 60 * 1000);
      return p.effectiveness > 0.8 && daysSinceLastSeen < 7;
    });
    newInsights = recentHighPerformers.length;

    // Identify cross-domain patterns
    const crossDomain = this.findCrossDomainPatterns(patterns);

    // Store insights
    await context.memory.set('learning:insights', {
      recentHighPerformers,
      crossDomainPatterns: crossDomain,
      timestamp: new Date().toISOString(),
    });

    return {
      patternsAnalyzed: patterns.length,
      patternsPruned,
      patternsConsolidated,
      newInsights,
      strategyUpdates: 0,
      crossDomainPatterns: crossDomain.length,
    };
  }

  private findCrossDomainPatterns(patterns: LearningPattern[]): Array<{
    pattern: string;
    domains: DomainName[];
    avgEffectiveness: number;
  }> {
    const patternGroups = new Map<string, LearningPattern[]>();

    for (const pattern of patterns) {
      const existing = patternGroups.get(pattern.type) || [];
      existing.push(pattern);
      patternGroups.set(pattern.type, existing);
    }

    const crossDomain: Array<{
      pattern: string;
      domains: DomainName[];
      avgEffectiveness: number;
    }> = [];

    for (const [type, group] of Array.from(patternGroups.entries())) {
      const domains = Array.from(new Set(group.map(p => p.domain)));
      if (domains.length >= 3) {
        crossDomain.push({
          pattern: type,
          domains,
          avgEffectiveness: group.reduce((sum, p) => sum + p.effectiveness, 0) / group.length,
        });
      }
    }

    return crossDomain;
  }

  private identifyCrossDomainPatterns(
    patterns: LearningPattern[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const crossDomain = this.findCrossDomainPatterns(patterns);

    if (crossDomain.length > 0) {
      findings.push({
        type: 'cross-domain-patterns',
        severity: 'info',
        domain: 'learning-optimization',
        title: 'Cross-Domain Patterns Identified',
        description: `${crossDomain.length} patterns are effective across multiple domains`,
        context: {
          patterns: crossDomain.map(p => ({
            type: p.pattern,
            domains: p.domains.length,
            effectiveness: p.avgEffectiveness.toFixed(2),
          })),
        },
      });

      recommendations.push({
        priority: 'p2',
        domain: 'learning-optimization',
        action: 'Leverage Cross-Domain Patterns',
        description: 'Apply successful cross-domain patterns to domains where they are not yet used.',
        estimatedImpact: 'medium',
        effort: 'low',
        autoFixable: true,
      });
    }
  }

  private pruneIneffectivePatterns(
    patterns: LearningPattern[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const ineffective = patterns.filter(p => p.effectiveness < 0.3 && p.occurrences > 10);
    const stale = patterns.filter(p => {
      const daysSinceLastSeen = (Date.now() - p.lastSeen.getTime()) / (24 * 60 * 60 * 1000);
      return daysSinceLastSeen > 30;
    });

    if (ineffective.length > 0) {
      findings.push({
        type: 'ineffective-patterns',
        severity: 'low',
        domain: 'learning-optimization',
        title: 'Ineffective Patterns Detected',
        description: `${ineffective.length} patterns have low effectiveness despite many occurrences`,
        context: {
          count: ineffective.length,
          domains: Array.from(new Set(ineffective.map(p => p.domain))),
        },
      });

      recommendations.push({
        priority: 'p3',
        domain: 'learning-optimization',
        action: 'Review Ineffective Patterns',
        description: 'Consider removing or refining patterns that consistently underperform.',
        estimatedImpact: 'low',
        effort: 'low',
        autoFixable: true,
      });
    }

    if (stale.length > 0) {
      findings.push({
        type: 'stale-patterns',
        severity: 'info',
        domain: 'learning-optimization',
        title: 'Stale Patterns Identified',
        description: `${stale.length} patterns have not been seen in over 30 days`,
        context: {
          count: stale.length,
        },
      });
    }
  }

  private generateOptimizations(
    patterns: LearningPattern[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    // Find domains with few patterns
    const patternsByDomain = new Map<DomainName, number>();
    for (const pattern of patterns) {
      patternsByDomain.set(pattern.domain, (patternsByDomain.get(pattern.domain) || 0) + 1);
    }

    const lowPatternDomains = ALL_DOMAINS.filter(d => (patternsByDomain.get(d) || 0) < 3);

    if (lowPatternDomains.length > 0) {
      findings.push({
        type: 'learning-gaps',
        severity: 'medium',
        domain: 'learning-optimization',
        title: 'Learning Gaps Identified',
        description: `${lowPatternDomains.length} domains have few learned patterns`,
        context: {
          domains: lowPatternDomains,
        },
      });

      recommendations.push({
        priority: 'p2',
        domain: 'learning-optimization',
        action: 'Improve Learning Coverage',
        description: `Focus learning efforts on domains with few patterns: ${lowPatternDomains.join(', ')}`,
        estimatedImpact: 'medium',
        effort: 'medium',
        autoFixable: false,
      });
    }

    // High-performing patterns to replicate
    const topPerformers = patterns
      .filter(p => p.effectiveness > 0.9 && p.occurrences > 20)
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 5);

    if (topPerformers.length > 0) {
      findings.push({
        type: 'top-patterns',
        severity: 'info',
        domain: 'learning-optimization',
        title: 'Top Performing Patterns',
        description: `${topPerformers.length} patterns show exceptional effectiveness`,
        context: {
          patterns: topPerformers.map(p => ({
            domain: p.domain,
            type: p.type,
            effectiveness: p.effectiveness.toFixed(2),
          })),
        },
      });
    }
  }

  private calculateHealthScore(result: ConsolidationResult, patterns: LearningPattern[]): number {
    if (patterns.length === 0) return 50;

    // Base score from average pattern effectiveness
    const avgEffectiveness = patterns.reduce((sum, p) => sum + p.effectiveness, 0) / patterns.length;
    let score = avgEffectiveness * 50;

    // Bonus for new insights
    score += Math.min(20, result.newInsights * 4);

    // Bonus for cross-domain patterns
    score += Math.min(15, result.crossDomainPatterns * 3);

    // Penalty for pruned patterns (indicates churn)
    const pruneRate = result.patternsPruned / result.patternsAnalyzed;
    score -= pruneRate * 15;

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
