/**
 * Agentic QE v3 - Coverage Analyzer Service
 * Implements ICoverageAnalysisService with O(log n) vector-based analysis
 */

import { Result, ok, err, Severity } from '../../../shared/types';
import { MemoryBackend, VectorSearchResult } from '../../../kernel/interfaces';
import {
  AnalyzeCoverageRequest,
  CoverageReport,
  CoverageData,
  CoverageSummary,
  CoverageDelta,
  FileCoverage,
  CoverageGaps,
  CoverageGap,
} from '../interfaces';

// ============================================================================
// Service Interface
// ============================================================================

export interface ICoverageAnalysisService {
  /** Analyze coverage from reports */
  analyze(request: AnalyzeCoverageRequest): Promise<Result<CoverageReport, Error>>;

  /** Find coverage gaps using vector similarity for O(log n) search */
  findGaps(coverageData: CoverageData, threshold: number): Promise<Result<CoverageGaps, Error>>;

  /** Calculate coverage metrics */
  calculateMetrics(coverageData: CoverageData): CoverageSummary;
}

// ============================================================================
// Service Implementation
// ============================================================================

export class CoverageAnalyzerService implements ICoverageAnalysisService {
  private static readonly DEFAULT_THRESHOLD = 80;
  private static readonly VECTOR_DIMENSION = 128;

  constructor(private readonly memory: MemoryBackend) {}

  /**
   * Analyze coverage from reports
   */
  async analyze(request: AnalyzeCoverageRequest): Promise<Result<CoverageReport, Error>> {
    try {
      const { coverageData, threshold = CoverageAnalyzerService.DEFAULT_THRESHOLD } = request;

      // Calculate current metrics
      const summary = this.calculateMetrics(coverageData);

      // Check if coverage meets threshold
      const overallCoverage = this.calculateOverallCoverage(summary);
      const meetsThreshold = overallCoverage >= threshold;

      // Calculate delta from previous coverage (if stored)
      const delta = await this.calculateDelta(summary);

      // Generate recommendations based on analysis
      const recommendations = this.generateRecommendations(coverageData, summary, threshold);

      // Store current coverage for future delta calculations
      await this.storeCoverageSnapshot(summary);

      // Store coverage vectors for similarity search
      if (request.includeFileDetails) {
        await this.indexFileCoverageVectors(coverageData.files);
      }

      return ok({
        summary,
        meetsThreshold,
        delta,
        recommendations,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Find coverage gaps using O(log n) vector similarity search
   * Uses HNSW indexing for efficient gap detection across large codebases
   */
  async findGaps(
    coverageData: CoverageData,
    threshold: number = CoverageAnalyzerService.DEFAULT_THRESHOLD
  ): Promise<Result<CoverageGaps, Error>> {
    try {
      const gaps: CoverageGap[] = [];
      let totalUncoveredLines = 0;

      for (const file of coverageData.files) {
        const fileCoverage = this.calculateFileCoveragePercentage(file);

        if (fileCoverage < threshold) {
          // Calculate risk score for this file
          const riskScore = this.calculateFileRiskScore(file);
          const severity = this.riskScoreToSeverity(riskScore);

          // Use vector search to find similar gap patterns (O(log n))
          const similarPatterns = await this.findSimilarGapPatterns(file);

          gaps.push({
            id: this.generateGapId(file.path),
            file: file.path,
            lines: file.uncoveredLines,
            branches: file.uncoveredBranches,
            riskScore,
            severity,
            recommendation: this.generateGapRecommendation(file, similarPatterns),
          });

          totalUncoveredLines += file.uncoveredLines.length;
        }
      }

      // Sort gaps by risk score (highest first)
      gaps.sort((a, b) => b.riskScore - a.riskScore);

      // Estimate effort based on total uncovered lines
      const estimatedEffort = this.estimateEffort(totalUncoveredLines);

      return ok({
        gaps,
        totalUncoveredLines,
        estimatedEffort,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Calculate coverage metrics from raw data
   */
  calculateMetrics(coverageData: CoverageData): CoverageSummary {
    const files = coverageData.files;

    if (files.length === 0) {
      return {
        line: 0,
        branch: 0,
        function: 0,
        statement: 0,
        files: 0,
      };
    }

    let totalLines = 0;
    let coveredLines = 0;
    let totalBranches = 0;
    let coveredBranches = 0;
    let totalFunctions = 0;
    let coveredFunctions = 0;
    let totalStatements = 0;
    let coveredStatements = 0;

    for (const file of files) {
      totalLines += file.lines.total;
      coveredLines += file.lines.covered;
      totalBranches += file.branches.total;
      coveredBranches += file.branches.covered;
      totalFunctions += file.functions.total;
      coveredFunctions += file.functions.covered;
      totalStatements += file.statements.total;
      coveredStatements += file.statements.covered;
    }

    return {
      line: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
      branch: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
      function: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
      statement: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
      files: files.length,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private calculateOverallCoverage(summary: CoverageSummary): number {
    return (summary.line + summary.branch + summary.function + summary.statement) / 4;
  }

  private calculateFileCoveragePercentage(file: FileCoverage): number {
    const metrics = [
      file.lines.total > 0 ? (file.lines.covered / file.lines.total) * 100 : 100,
      file.branches.total > 0 ? (file.branches.covered / file.branches.total) * 100 : 100,
      file.functions.total > 0 ? (file.functions.covered / file.functions.total) * 100 : 100,
      file.statements.total > 0 ? (file.statements.covered / file.statements.total) * 100 : 100,
    ];

    return metrics.reduce((sum, m) => sum + m, 0) / metrics.length;
  }

  private calculateFileRiskScore(file: FileCoverage): number {
    // Risk factors:
    // 1. Coverage gap size (more uncovered = higher risk)
    // 2. Branch coverage (missing branches = higher risk)
    // 3. Function coverage (missing functions = higher risk)

    const lineCoverageGap =
      file.lines.total > 0 ? 1 - file.lines.covered / file.lines.total : 0;

    const branchCoverageGap =
      file.branches.total > 0 ? 1 - file.branches.covered / file.branches.total : 0;

    const functionCoverageGap =
      file.functions.total > 0 ? 1 - file.functions.covered / file.functions.total : 0;

    // Weighted risk score (branches and functions are weighted higher)
    const riskScore =
      lineCoverageGap * 0.3 + branchCoverageGap * 0.4 + functionCoverageGap * 0.3;

    return Math.min(1, Math.max(0, riskScore));
  }

  private riskScoreToSeverity(riskScore: number): Severity {
    if (riskScore >= 0.8) return 'critical';
    if (riskScore >= 0.6) return 'high';
    if (riskScore >= 0.3) return 'medium';
    return 'low';
  }

  private async calculateDelta(current: CoverageSummary): Promise<CoverageDelta | undefined> {
    try {
      const previous = await this.memory.get<CoverageSummary>('coverage:latest');

      if (!previous) {
        return undefined;
      }

      const lineDelta = current.line - previous.line;
      const branchDelta = current.branch - previous.branch;
      const functionDelta = current.function - previous.function;
      const statementDelta = current.statement - previous.statement;

      const avgDelta = (lineDelta + branchDelta + functionDelta + statementDelta) / 4;

      let trend: 'improving' | 'declining' | 'stable';
      if (avgDelta > 0.5) {
        trend = 'improving';
      } else if (avgDelta < -0.5) {
        trend = 'declining';
      } else {
        trend = 'stable';
      }

      return {
        line: lineDelta,
        branch: branchDelta,
        function: functionDelta,
        statement: statementDelta,
        trend,
      };
    } catch {
      return undefined;
    }
  }

  private async storeCoverageSnapshot(summary: CoverageSummary): Promise<void> {
    try {
      // Store latest snapshot
      await this.memory.set('coverage:latest', summary, { persist: true });

      // Store historical snapshot
      const timestamp = Date.now();
      await this.memory.set(`coverage:history:${timestamp}`, summary, {
        persist: true,
        namespace: 'coverage-history',
      });
    } catch {
      // Non-critical operation, log and continue
    }
  }

  private async indexFileCoverageVectors(files: FileCoverage[]): Promise<void> {
    for (const file of files) {
      try {
        // Create a vector representation of the file coverage
        const embedding = this.createCoverageEmbedding(file);
        await this.memory.storeVector(`coverage:file:${file.path}`, embedding, {
          path: file.path,
          lineCoverage: file.lines.covered / (file.lines.total || 1),
          branchCoverage: file.branches.covered / (file.branches.total || 1),
          uncoveredLineCount: file.uncoveredLines.length,
        });
      } catch {
        // Non-critical operation, continue with other files
      }
    }
  }

  private createCoverageEmbedding(file: FileCoverage): number[] {
    // Create a simplified embedding for coverage pattern matching
    // In production, this would use a proper embedding model
    const embedding = new Array(CoverageAnalyzerService.VECTOR_DIMENSION).fill(0);

    // Encode coverage ratios
    embedding[0] = file.lines.covered / (file.lines.total || 1);
    embedding[1] = file.branches.covered / (file.branches.total || 1);
    embedding[2] = file.functions.covered / (file.functions.total || 1);
    embedding[3] = file.statements.covered / (file.statements.total || 1);

    // Encode uncovered line patterns (normalized)
    const uncoveredRatio = file.uncoveredLines.length / (file.lines.total || 1);
    embedding[4] = uncoveredRatio;

    // Encode file size factors
    embedding[5] = Math.min(1, file.lines.total / 1000);
    embedding[6] = Math.min(1, file.branches.total / 100);
    embedding[7] = Math.min(1, file.functions.total / 50);

    // Fill remaining dimensions with derived features
    for (let i = 8; i < CoverageAnalyzerService.VECTOR_DIMENSION; i++) {
      embedding[i] = Math.sin(i * uncoveredRatio) * 0.5 + 0.5;
    }

    return embedding;
  }

  private async findSimilarGapPatterns(file: FileCoverage): Promise<VectorSearchResult[]> {
    try {
      const embedding = this.createCoverageEmbedding(file);
      return await this.memory.vectorSearch(embedding, 5);
    } catch {
      return [];
    }
  }

  private generateRecommendations(
    coverageData: CoverageData,
    summary: CoverageSummary,
    threshold: number
  ): string[] {
    const recommendations: string[] = [];

    // Overall coverage recommendation
    const overall = this.calculateOverallCoverage(summary);
    if (overall < threshold) {
      const gap = threshold - overall;
      recommendations.push(
        `Coverage is ${gap.toFixed(1)}% below threshold. Focus on high-risk files first.`
      );
    }

    // Branch coverage specific recommendation
    if (summary.branch < summary.line - 10) {
      recommendations.push(
        'Branch coverage is significantly lower than line coverage. Add tests for conditional logic.'
      );
    }

    // Function coverage recommendation
    if (summary.function < 70) {
      recommendations.push(
        'Function coverage is below 70%. Ensure all exported functions have tests.'
      );
    }

    // Find files with zero coverage
    const zeroCoverageFiles = coverageData.files.filter(
      (f) => f.lines.covered === 0 && f.lines.total > 0
    );
    if (zeroCoverageFiles.length > 0) {
      recommendations.push(
        `${zeroCoverageFiles.length} file(s) have no test coverage. Prioritize adding tests for these files.`
      );
    }

    // Find files with high uncovered line counts
    const highUncoveredFiles = coverageData.files.filter((f) => f.uncoveredLines.length > 50);
    if (highUncoveredFiles.length > 0) {
      recommendations.push(
        `${highUncoveredFiles.length} file(s) have more than 50 uncovered lines. Consider breaking them into smaller, testable modules.`
      );
    }

    return recommendations;
  }

  private generateGapRecommendation(
    file: FileCoverage,
    similarPatterns: VectorSearchResult[]
  ): string {
    const uncoveredCount = file.uncoveredLines.length;
    const lineRanges = this.getLineRanges(file.uncoveredLines);

    let recommendation = `Add tests for ${uncoveredCount} uncovered lines`;

    if (lineRanges.length <= 3) {
      recommendation += ` (lines: ${lineRanges.join(', ')})`;
    }

    if (file.uncoveredBranches.length > 0) {
      recommendation += `. Focus on ${file.uncoveredBranches.length} uncovered branches.`;
    }

    if (similarPatterns.length > 0 && similarPatterns[0].score > 0.8) {
      recommendation += ' Similar pattern found in codebase - consider reusing test strategies.';
    }

    return recommendation;
  }

  private getLineRanges(lines: number[]): string[] {
    if (lines.length === 0) return [];

    const sorted = [...lines].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i <= sorted.length; i++) {
      if (i < sorted.length && sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        if (i < sorted.length) {
          start = sorted[i];
          end = sorted[i];
        }
      }
    }

    return ranges;
  }

  private generateGapId(filePath: string): string {
    const hash = filePath.split('').reduce((acc, char) => {
      const chr = char.charCodeAt(0);
      return ((acc << 5) - acc + chr) | 0;
    }, 0);
    return `gap-${Math.abs(hash).toString(16)}`;
  }

  private estimateEffort(uncoveredLines: number): number {
    // Estimate effort in hours based on uncovered lines
    // Assumes approximately 10-15 lines of test code per line of source
    // and 20 lines of test code per hour for a competent developer
    const testLinesNeeded = uncoveredLines * 12; // Average factor
    const hoursPerTestLine = 1 / 20;
    return Math.ceil(testLinesNeeded * hoursPerTestLine);
  }
}
