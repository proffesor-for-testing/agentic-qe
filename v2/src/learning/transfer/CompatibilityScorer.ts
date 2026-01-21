/**
 * CompatibilityScorer - Score pattern compatibility between agents
 *
 * Provides detailed compatibility analysis for cross-agent pattern transfer.
 *
 * Part of the Nightly-Learner Phase 2 implementation.
 *
 * @version 1.0.0
 * @module src/learning/transfer/CompatibilityScorer
 */

import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';

export interface CompatibilityReport {
  sourceAgent: string;
  targetAgent: string;
  overallScore: number;
  breakdown: CompatibilityBreakdown;
  recommendation: 'transfer' | 'adapt' | 'reject';
  adaptations?: string[];
  warnings?: string[];
}

export interface CompatibilityBreakdown {
  capabilityScore: number;
  frameworkScore: number;
  taskTypeScore: number;
  domainScore: number;
  qualityScore: number;
}

export interface AgentProfile {
  type: string;
  capabilities: string[];
  frameworks: string[];
  taskTypes: string[];
  domain: string;
  specializations?: string[];
}

export interface PatternProfile {
  id: string;
  type: string;
  requiredCapabilities: string[];
  requiredFrameworks: string[];
  applicableTaskTypes: string[];
  domain: string;
  complexity: 'low' | 'medium' | 'high';
  confidence: number;
}

/**
 * CompatibilityScorer provides detailed compatibility analysis
 *
 * @example
 * ```typescript
 * const scorer = new CompatibilityScorer();
 *
 * const report = await scorer.scoreCompatibility(
 *   patternProfile,
 *   sourceProfile,
 *   targetProfile
 * );
 *
 * if (report.recommendation === 'transfer') {
 *   // Proceed with transfer
 * }
 * ```
 */
export class CompatibilityScorer extends EventEmitter {
  private logger: Logger;

  // Semantic concept mappings
  private conceptSimilarities: Map<string, string[]> = new Map([
    ['test-generation', ['code-analysis', 'pattern-matching', 'assertion-generation']],
    ['coverage-analysis', ['gap-detection', 'branch-analysis', 'code-analysis']],
    ['security-scan', ['vulnerability-scan', 'dependency-audit', 'compliance']],
    ['performance-test', ['load-testing', 'benchmark', 'profiling']],
    ['quality-check', ['threshold-validation', 'gate-evaluation', 'metric-aggregation']],
    ['flaky-detection', ['test-analysis', 'stability-scoring', 'retry-optimization']],
  ]);

  // Domain relationships
  private domainRelationships: Map<string, string[]> = new Map([
    ['testing', ['quality', 'coverage', 'stability']],
    ['quality', ['testing', 'security', 'performance']],
    ['security', ['quality', 'compliance']],
    ['performance', ['quality', 'testing']],
    ['coverage', ['testing', 'quality']],
    ['stability', ['testing', 'quality']],
  ]);

  constructor() {
    super();
    this.logger = Logger.getInstance();
  }

  /**
   * Score compatibility between pattern and target agent
   */
  async scoreCompatibility(
    pattern: PatternProfile,
    sourceAgent: AgentProfile,
    targetAgent: AgentProfile
  ): Promise<CompatibilityReport> {
    // Calculate individual scores
    const capabilityScore = this.scoreCapabilityOverlap(
      pattern.requiredCapabilities,
      targetAgent.capabilities
    );

    const frameworkScore = this.scoreFrameworkCompatibility(
      pattern.requiredFrameworks,
      targetAgent.frameworks
    );

    const taskTypeScore = this.scoreTaskTypeRelevance(
      pattern.applicableTaskTypes,
      targetAgent.taskTypes
    );

    const domainScore = this.scoreDomainRelationship(
      pattern.domain,
      targetAgent.domain
    );

    const qualityScore = pattern.confidence;

    // Calculate weighted overall score
    const overallScore = this.calculateOverallScore({
      capabilityScore,
      frameworkScore,
      taskTypeScore,
      domainScore,
      qualityScore,
    });

    // Determine recommendation
    const recommendation = this.determineRecommendation(overallScore, {
      capabilityScore,
      frameworkScore,
      taskTypeScore,
      domainScore,
      qualityScore,
    });

    // Generate adaptations if needed
    const adaptations = recommendation === 'adapt'
      ? this.suggestAdaptations(pattern, targetAgent)
      : undefined;

    // Generate warnings
    const warnings = this.generateWarnings({
      capabilityScore,
      frameworkScore,
      taskTypeScore,
      domainScore,
      qualityScore,
    });

    const report: CompatibilityReport = {
      sourceAgent: sourceAgent.type,
      targetAgent: targetAgent.type,
      overallScore,
      breakdown: {
        capabilityScore,
        frameworkScore,
        taskTypeScore,
        domainScore,
        qualityScore,
      },
      recommendation,
      adaptations,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    this.emit('score:calculated', report);
    return report;
  }

  /**
   * Score capability overlap
   */
  private scoreCapabilityOverlap(required: string[], available: string[]): number {
    if (required.length === 0) return 1.0;

    let matched = 0;

    for (const req of required) {
      // Direct match
      if (available.includes(req)) {
        matched += 1.0;
        continue;
      }

      // Semantic match
      const similar = this.conceptSimilarities.get(req) || [];
      const semanticMatch = similar.some(s => available.includes(s));
      if (semanticMatch) {
        matched += 0.7; // Partial credit for semantic match
        continue;
      }

      // Partial string match
      const partialMatch = available.some(a =>
        a.includes(req) || req.includes(a) ||
        this.levenshteinSimilarity(a, req) > 0.7
      );
      if (partialMatch) {
        matched += 0.5;
      }
    }

    return Math.min(1, matched / required.length);
  }

  /**
   * Score framework compatibility
   */
  private scoreFrameworkCompatibility(required: string[], available: string[]): number {
    if (required.length === 0) return 1.0;

    // Framework families
    const families: Record<string, string[]> = {
      'js-testing': ['jest', 'mocha', 'vitest', 'ava', 'jasmine'],
      'e2e': ['playwright', 'cypress', 'puppeteer', 'selenium'],
      'coverage': ['istanbul', 'c8', 'nyc', 'jest-coverage'],
      'security': ['snyk', 'owasp', 'trivy', 'eslint-security'],
      'performance': ['k6', 'artillery', 'autocannon', 'lighthouse'],
    };

    let matched = 0;

    for (const req of required) {
      if (available.includes(req)) {
        matched += 1.0;
        continue;
      }

      // Family match
      for (const family of Object.values(families)) {
        if (family.includes(req) && family.some(f => available.includes(f))) {
          matched += 0.8;
          break;
        }
      }
    }

    return Math.min(1, matched / required.length);
  }

  /**
   * Score task type relevance
   */
  private scoreTaskTypeRelevance(applicable: string[], supported: string[]): number {
    if (applicable.length === 0) return 1.0;

    const overlap = applicable.filter(t => supported.includes(t)).length;
    const directScore = overlap / applicable.length;

    // Bonus for related task types
    const taskGroups: Record<string, string[]> = {
      'testing': ['unit-test', 'integration-test', 'e2e-test', 'component-test'],
      'analysis': ['coverage-analysis', 'gap-detection', 'security-scan', 'code-review'],
      'validation': ['quality-gate', 'deployment-check', 'release-validation'],
      'detection': ['flaky-detection', 'vulnerability-scan', 'bottleneck-detection'],
    };

    let groupBonus = 0;
    for (const group of Object.values(taskGroups)) {
      const hasApplicable = applicable.some(t => group.includes(t));
      const hasSupported = supported.some(t => group.includes(t));
      if (hasApplicable && hasSupported) {
        groupBonus += 0.1;
      }
    }

    return Math.min(1, directScore + groupBonus);
  }

  /**
   * Score domain relationship
   */
  private scoreDomainRelationship(patternDomain: string, agentDomain: string): number {
    if (patternDomain === agentDomain) return 1.0;

    const related = this.domainRelationships.get(patternDomain) || [];
    if (related.includes(agentDomain)) return 0.8;

    // Check reverse relationship
    const reverseRelated = this.domainRelationships.get(agentDomain) || [];
    if (reverseRelated.includes(patternDomain)) return 0.7;

    // Check for any shared relationships
    const patternRelated = new Set(this.domainRelationships.get(patternDomain) || []);
    const agentRelated = new Set(this.domainRelationships.get(agentDomain) || []);
    const sharedRelations = [...patternRelated].filter(r => agentRelated.has(r));

    if (sharedRelations.length > 0) return 0.5;

    return 0.3; // Base compatibility
  }

  /**
   * Calculate overall weighted score
   */
  private calculateOverallScore(breakdown: CompatibilityBreakdown): number {
    return (
      breakdown.capabilityScore * 0.30 +
      breakdown.frameworkScore * 0.20 +
      breakdown.taskTypeScore * 0.25 +
      breakdown.domainScore * 0.15 +
      breakdown.qualityScore * 0.10
    );
  }

  /**
   * Determine recommendation based on scores
   */
  private determineRecommendation(
    overall: number,
    breakdown: CompatibilityBreakdown
  ): 'transfer' | 'adapt' | 'reject' {
    if (overall >= 0.7 && breakdown.capabilityScore >= 0.5) {
      return 'transfer';
    }

    if (overall >= 0.5 && breakdown.domainScore >= 0.5) {
      return 'adapt';
    }

    return 'reject';
  }

  /**
   * Suggest adaptations for pattern transfer
   */
  private suggestAdaptations(pattern: PatternProfile, target: AgentProfile): string[] {
    const adaptations: string[] = [];

    // Check for missing capabilities
    const missingCaps = pattern.requiredCapabilities.filter(c =>
      !target.capabilities.includes(c)
    );
    if (missingCaps.length > 0) {
      adaptations.push(`Adapt pattern to work without: ${missingCaps.join(', ')}`);
    }

    // Check for framework differences
    const missingFrameworks = pattern.requiredFrameworks.filter(f =>
      !target.frameworks.includes(f)
    );
    if (missingFrameworks.length > 0) {
      const alternatives = target.frameworks.slice(0, 2).join(' or ');
      adaptations.push(`Consider using ${alternatives} instead of ${missingFrameworks[0]}`);
    }

    // Complexity adaptation
    if (pattern.complexity === 'high' && target.specializations?.length === 0) {
      adaptations.push('Simplify pattern for target agent without specializations');
    }

    return adaptations;
  }

  /**
   * Generate warnings for low scores
   */
  private generateWarnings(breakdown: CompatibilityBreakdown): string[] {
    const warnings: string[] = [];

    if (breakdown.capabilityScore < 0.4) {
      warnings.push('Low capability overlap - pattern may not function correctly');
    }

    if (breakdown.frameworkScore < 0.3) {
      warnings.push('Framework mismatch - may require significant adaptation');
    }

    if (breakdown.taskTypeScore < 0.3) {
      warnings.push('Task types not aligned - pattern may not be applicable');
    }

    if (breakdown.qualityScore < 0.5) {
      warnings.push('Low pattern confidence - results may be unreliable');
    }

    return warnings;
  }

  /**
   * Calculate Levenshtein similarity between two strings
   */
  private levenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const maxLength = Math.max(a.length, b.length);
    return 1 - matrix[b.length][a.length] / maxLength;
  }

  /**
   * Batch score multiple patterns
   */
  async batchScore(
    patterns: PatternProfile[],
    sourceAgent: AgentProfile,
    targetAgent: AgentProfile
  ): Promise<Map<string, CompatibilityReport>> {
    const results = new Map<string, CompatibilityReport>();

    for (const pattern of patterns) {
      const report = await this.scoreCompatibility(pattern, sourceAgent, targetAgent);
      results.set(pattern.id, report);
    }

    return results;
  }
}

export default CompatibilityScorer;
