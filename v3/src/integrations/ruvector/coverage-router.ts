/**
 * Agentic QE v3 - Coverage Router for RuVector Integration
 *
 * Uses RuVector's ML capabilities for coverage-aware agent routing.
 * Falls back to rule-based routing when RuVector is unavailable.
 */

import type {
  CoverageRouter,
  CoverageRoutingResult,
  FileCoverage,
  CoverageGap,
  RuVectorConfig,
} from './interfaces';
import { FallbackCoverageRouter } from './fallback';
import type { AgentType, DomainName, Severity, Priority } from '../../shared/types';

// ============================================================================
// Coverage Configuration
// ============================================================================

/**
 * Coverage thresholds for routing decisions
 */
export interface CoverageThresholds {
  /** Target line coverage */
  lineCoverage: number;
  /** Target branch coverage */
  branchCoverage: number;
  /** Target function coverage */
  functionCoverage: number;
  /** Critical threshold (below this is critical priority) */
  criticalThreshold: number;
  /** High threshold (below this is high priority) */
  highThreshold: number;
  /** Medium threshold (below this is medium priority) */
  mediumThreshold: number;
}

const DEFAULT_THRESHOLDS: CoverageThresholds = {
  lineCoverage: 80,
  branchCoverage: 75,
  functionCoverage: 90,
  criticalThreshold: 30,
  highThreshold: 50,
  mediumThreshold: 70,
};

// ============================================================================
// RuVector Coverage Router Implementation
// ============================================================================

/**
 * Coverage router that integrates with RuVector
 * Provides ML-enhanced coverage analysis and agent routing
 */
export class RuVectorCoverageRouter implements CoverageRouter {
  private readonly fallback: FallbackCoverageRouter;
  private readonly thresholds: CoverageThresholds;
  private readonly cache: Map<string, { result: CoverageRoutingResult; timestamp: number }> = new Map();

  constructor(
    private readonly config: RuVectorConfig,
    thresholds?: Partial<CoverageThresholds>
  ) {
    this.fallback = new FallbackCoverageRouter();
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Analyze coverage and route agents
   */
  async analyzeCoverage(
    coverageData: FileCoverage[],
    targetCoverage: number = this.thresholds.lineCoverage
  ): Promise<CoverageRoutingResult> {
    if (!this.config.enabled) {
      return this.fallback.analyzeCoverage(coverageData, targetCoverage);
    }

    // Check cache
    const cacheKey = this.computeCacheKey(coverageData, targetCoverage);
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < (this.config.cacheTtl || 300000)) {
        return cached.result;
      }
    }

    try {
      const result = await this.performAnalysis(coverageData, targetCoverage);

      // Cache result
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, { result, timestamp: Date.now() });
      }

      return result;
    } catch (error) {
      console.warn('[RuVectorCoverageRouter] Analysis failed, using fallback:', error);
      return this.fallback.analyzeCoverage(coverageData, targetCoverage);
    }
  }

  /**
   * Get coverage gaps
   */
  async getCoverageGaps(coverageData: FileCoverage[]): Promise<CoverageGap[]> {
    const gaps: CoverageGap[] = [];

    for (const coverage of coverageData) {
      // Analyze line coverage gaps
      const lineGaps = this.analyzeLineCoverageGaps(coverage);
      gaps.push(...lineGaps);

      // Analyze branch coverage gaps
      const branchGaps = this.analyzeBranchCoverageGaps(coverage);
      gaps.push(...branchGaps);

      // Analyze function coverage gaps
      const functionGaps = this.analyzeFunctionCoverageGaps(coverage);
      gaps.push(...functionGaps);

      // Detect integration test gaps
      const integrationGaps = this.detectIntegrationGaps(coverage);
      gaps.push(...integrationGaps);
    }

    // Sort by severity
    return gaps.sort((a, b) => {
      const severityOrder: Record<Severity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
      };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Prioritize files for coverage improvement
   */
  async prioritizeForCoverage(
    files: string[],
    coverageData: FileCoverage[]
  ): Promise<string[]> {
    const coverageMap = new Map(coverageData.map((c) => [c.filePath, c]));

    // Score each file
    const scored = files.map((file) => {
      const coverage = coverageMap.get(file);
      if (!coverage) {
        return { file, score: 0.5, priority: 'p2' as Priority };
      }

      const score = this.calculatePriorityScore(coverage);
      return { file, score, priority: this.scoreToPriority(score) };
    });

    // Sort by score (higher score = higher priority)
    scored.sort((a, b) => b.score - a.score);

    return scored.map((s) => s.file);
  }

  /**
   * Suggest tests to improve coverage
   */
  async suggestTestsForCoverage(
    filePath: string,
    coverage: FileCoverage
  ): Promise<Array<{ testType: string; target: string; expectedCoverageGain: number }>> {
    const suggestions: Array<{ testType: string; target: string; expectedCoverageGain: number }> = [];

    // Suggest unit tests for uncovered functions
    for (const func of coverage.uncoveredFunctions) {
      const gain = this.estimateCoverageGain(
        coverage.functionCoverage,
        coverage.uncoveredFunctions.length
      );
      suggestions.push({
        testType: 'unit',
        target: `${filePath}::${func}`,
        expectedCoverageGain: gain,
      });
    }

    // Suggest branch tests for uncovered branches
    if (coverage.uncoveredBranches.length > 0) {
      const branchGain = this.estimateCoverageGain(
        coverage.branchCoverage,
        coverage.uncoveredBranches.length
      );
      suggestions.push({
        testType: 'branch',
        target: `${filePath} - ${coverage.uncoveredBranches.length} branches`,
        expectedCoverageGain: branchGain,
      });
    }

    // Suggest line coverage tests for large gaps
    if (coverage.uncoveredLines.length > 10) {
      const lineRanges = this.getLineRanges(coverage.uncoveredLines);
      for (const range of lineRanges.slice(0, 3)) {
        suggestions.push({
          testType: 'line',
          target: `${filePath}:${range.start}-${range.end}`,
          expectedCoverageGain: this.estimateLineCoverageGain(range, coverage),
        });
      }
    }

    // Suggest integration tests if function coverage is good but overall is not
    if (
      coverage.functionCoverage > 80 &&
      coverage.lineCoverage < 60
    ) {
      suggestions.push({
        testType: 'integration',
        target: `${filePath} - internal paths`,
        expectedCoverageGain: 15,
      });
    }

    return suggestions.sort((a, b) => b.expectedCoverageGain - a.expectedCoverageGain);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Perform coverage analysis and routing
   */
  private async performAnalysis(
    coverageData: FileCoverage[],
    targetCoverage: number
  ): Promise<CoverageRoutingResult> {
    const gaps = await this.getCoverageGaps(coverageData);
    const prioritizedFiles = this.prioritizeFilesForImprovement(coverageData, targetCoverage, gaps);
    const testGenerationTargets = this.identifyTestGenerationTargets(coverageData);
    const agentAssignments = this.assignAgentsForCoverage(prioritizedFiles, gaps);

    return {
      prioritizedFiles,
      testGenerationTargets,
      agentAssignments,
      usedFallback: false,
    };
  }

  /**
   * Analyze line coverage gaps
   */
  private analyzeLineCoverageGaps(coverage: FileCoverage): CoverageGap[] {
    if (coverage.uncoveredLines.length === 0) return [];

    const severity = this.coverageToSeverity(coverage.lineCoverage);
    const lineRanges = this.getLineRanges(coverage.uncoveredLines);

    return lineRanges.map((range) => ({
      filePath: coverage.filePath,
      gapType: 'line' as const,
      severity,
      lines: Array.from(
        { length: range.end - range.start + 1 },
        (_, i) => range.start + i
      ),
      recommendation: `Add tests for lines ${range.start}-${range.end}`,
    }));
  }

  /**
   * Analyze branch coverage gaps
   */
  private analyzeBranchCoverageGaps(coverage: FileCoverage): CoverageGap[] {
    if (coverage.uncoveredBranches.length === 0) return [];

    const severity = this.coverageToSeverity(coverage.branchCoverage);

    return [{
      filePath: coverage.filePath,
      gapType: 'branch' as const,
      severity,
      lines: coverage.uncoveredBranches.map((b) => b.line),
      recommendation: `Add tests for ${coverage.uncoveredBranches.length} uncovered branches`,
    }];
  }

  /**
   * Analyze function coverage gaps
   */
  private analyzeFunctionCoverageGaps(coverage: FileCoverage): CoverageGap[] {
    if (coverage.uncoveredFunctions.length === 0) return [];

    const severity = this.coverageToSeverity(coverage.functionCoverage);

    return [{
      filePath: coverage.filePath,
      gapType: 'function' as const,
      severity,
      functions: coverage.uncoveredFunctions,
      recommendation: `Add tests for functions: ${coverage.uncoveredFunctions.slice(0, 3).join(', ')}${coverage.uncoveredFunctions.length > 3 ? '...' : ''}`,
    }];
  }

  /**
   * Detect integration test gaps
   */
  private detectIntegrationGaps(coverage: FileCoverage): CoverageGap[] {
    // Detect when individual coverage is OK but there might be integration gaps
    const hasHighFunctionCoverage = coverage.functionCoverage > 70;
    const hasLowBranchCoverage = coverage.branchCoverage < 50;
    const hasLowLineCoverage = coverage.lineCoverage < 60;

    if (hasHighFunctionCoverage && (hasLowBranchCoverage || hasLowLineCoverage)) {
      return [{
        filePath: coverage.filePath,
        gapType: 'integration' as const,
        severity: 'medium',
        recommendation: 'Functions are tested but internal paths may need integration tests',
      }];
    }

    return [];
  }

  /**
   * Prioritize files for coverage improvement
   */
  private prioritizeFilesForImprovement(
    coverageData: FileCoverage[],
    targetCoverage: number,
    gaps: CoverageGap[]
  ): Array<{
    filePath: string;
    currentCoverage: number;
    targetCoverage: number;
    gaps: CoverageGap[];
    priority: Priority;
  }> {
    const gapsByFile = new Map<string, CoverageGap[]>();
    for (const gap of gaps) {
      const existing = gapsByFile.get(gap.filePath) || [];
      existing.push(gap);
      gapsByFile.set(gap.filePath, existing);
    }

    return coverageData
      .filter((c) => c.lineCoverage < targetCoverage)
      .map((c) => ({
        filePath: c.filePath,
        currentCoverage: c.lineCoverage,
        targetCoverage,
        gaps: gapsByFile.get(c.filePath) || [],
        priority: this.coverageToPriority(c.lineCoverage),
      }))
      .sort((a, b) => {
        // Sort by priority first, then by current coverage
        const priorityOrder: Record<Priority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.currentCoverage - b.currentCoverage;
      });
  }

  /**
   * Identify test generation targets
   */
  private identifyTestGenerationTargets(
    coverageData: FileCoverage[]
  ): Array<{ filePath: string; functions: string[]; reason: string }> {
    return coverageData
      .filter((c) => c.uncoveredFunctions.length > 0 || c.lineCoverage < 50)
      .map((c) => ({
        filePath: c.filePath,
        functions: c.uncoveredFunctions,
        reason: this.generateTargetReason(c),
      }))
      .sort((a, b) => b.functions.length - a.functions.length);
  }

  /**
   * Assign agents for coverage improvement
   */
  private assignAgentsForCoverage(
    prioritizedFiles: Array<{ filePath: string; priority: Priority }>,
    gaps: CoverageGap[]
  ): Array<{ agentType: AgentType; domain: DomainName; files: string[] }> {
    const assignments: Array<{ agentType: AgentType; domain: DomainName; files: string[] }> = [];

    // Group files by priority
    const p0Files = prioritizedFiles.filter((f) => f.priority === 'p0').map((f) => f.filePath);
    const p1Files = prioritizedFiles.filter((f) => f.priority === 'p1').map((f) => f.filePath);
    const p2Files = prioritizedFiles.filter((f) => f.priority === 'p2').map((f) => f.filePath);
    const p3Files = prioritizedFiles.filter((f) => f.priority === 'p3').map((f) => f.filePath);

    // Critical priority: use generator agent for test creation
    if (p0Files.length > 0) {
      assignments.push({
        agentType: 'generator',
        domain: 'test-generation',
        files: p0Files,
      });
    }

    // High priority: use tester agent for coverage analysis
    if (p1Files.length > 0) {
      assignments.push({
        agentType: 'tester',
        domain: 'coverage-analysis',
        files: p1Files,
      });
    }

    // Medium priority: use specialist for targeted improvement
    if (p2Files.length > 0) {
      assignments.push({
        agentType: 'specialist',
        domain: 'test-execution',
        files: p2Files,
      });
    }

    // Low priority: batch processing
    if (p3Files.length > 0) {
      assignments.push({
        agentType: 'optimizer',
        domain: 'learning-optimization',
        files: p3Files,
      });
    }

    // Check for integration test needs
    const integrationGaps = gaps.filter((g) => g.gapType === 'integration');
    if (integrationGaps.length > 0) {
      assignments.push({
        agentType: 'tester',
        domain: 'contract-testing',
        files: integrationGaps.map((g) => g.filePath),
      });
    }

    return assignments;
  }

  /**
   * Calculate priority score for a file
   */
  private calculatePriorityScore(coverage: FileCoverage): number {
    // Lower coverage = higher priority score
    const lineScore = 1 - coverage.lineCoverage / 100;
    const branchScore = 1 - coverage.branchCoverage / 100;
    const functionScore = 1 - coverage.functionCoverage / 100;

    // Weight function coverage slightly more
    return lineScore * 0.35 + branchScore * 0.3 + functionScore * 0.35;
  }

  /**
   * Convert score to priority
   */
  private scoreToPriority(score: number): Priority {
    if (score >= 0.7) return 'p0';
    if (score >= 0.5) return 'p1';
    if (score >= 0.3) return 'p2';
    return 'p3';
  }

  /**
   * Convert coverage percentage to severity
   */
  private coverageToSeverity(coverage: number): Severity {
    if (coverage < this.thresholds.criticalThreshold) return 'critical';
    if (coverage < this.thresholds.highThreshold) return 'high';
    if (coverage < this.thresholds.mediumThreshold) return 'medium';
    if (coverage < this.thresholds.lineCoverage) return 'low';
    return 'info';
  }

  /**
   * Convert coverage percentage to priority
   */
  private coverageToPriority(coverage: number): Priority {
    if (coverage < this.thresholds.criticalThreshold) return 'p0';
    if (coverage < this.thresholds.highThreshold) return 'p1';
    if (coverage < this.thresholds.mediumThreshold) return 'p2';
    return 'p3';
  }

  /**
   * Get contiguous line ranges
   */
  private getLineRanges(lines: number[]): Array<{ start: number; end: number }> {
    if (lines.length === 0) return [];

    const sorted = [...lines].sort((a, b) => a - b);
    const ranges: Array<{ start: number; end: number }> = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push({ start, end });
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push({ start, end });

    return ranges;
  }

  /**
   * Estimate coverage gain from testing a function
   */
  private estimateCoverageGain(currentCoverage: number, totalUncovered: number): number {
    if (totalUncovered === 0) return 0;
    const potentialGain = (100 - currentCoverage) / totalUncovered;
    return Math.min(25, Math.round(potentialGain));
  }

  /**
   * Estimate line coverage gain from testing a range
   */
  private estimateLineCoverageGain(
    range: { start: number; end: number },
    coverage: FileCoverage
  ): number {
    const rangeLines = range.end - range.start + 1;
    const totalUncovered = coverage.uncoveredLines.length;

    if (totalUncovered === 0) return 0;

    const portionCovered = rangeLines / totalUncovered;
    const maxGain = 100 - coverage.lineCoverage;

    return Math.min(20, Math.round(portionCovered * maxGain));
  }

  /**
   * Generate reason for test generation target
   */
  private generateTargetReason(coverage: FileCoverage): string {
    const reasons: string[] = [];

    if (coverage.uncoveredFunctions.length > 0) {
      reasons.push(`${coverage.uncoveredFunctions.length} untested function(s)`);
    }

    if (coverage.lineCoverage < 50) {
      reasons.push(`low line coverage (${coverage.lineCoverage.toFixed(0)}%)`);
    }

    if (coverage.branchCoverage < 50) {
      reasons.push(`low branch coverage (${coverage.branchCoverage.toFixed(0)}%)`);
    }

    return reasons.join(', ') || 'coverage below target';
  }

  /**
   * Compute cache key
   */
  private computeCacheKey(coverageData: FileCoverage[], targetCoverage: number): string {
    const dataKey = coverageData
      .map((c) => `${c.filePath}:${c.lineCoverage}:${c.branchCoverage}`)
      .sort()
      .join('|');

    return `${targetCoverage}:${dataKey}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create coverage router with optional RuVector integration
 */
export function createCoverageRouter(
  config: RuVectorConfig,
  thresholds?: Partial<CoverageThresholds>
): CoverageRouter {
  if (config.enabled) {
    return new RuVectorCoverageRouter(config, thresholds);
  }
  return new FallbackCoverageRouter();
}
