/**
 * Filtered Coverage Analyzer Handler (QW-1)
 *
 * Applies client-side filtering to coverage analysis results to reduce output tokens by 99%.
 *
 * **Token Reduction:**
 * - Before: 50,000 tokens (full coverage report for 1000+ files)
 * - After: 500 tokens (top 10 gaps + summary)
 * - Reduction: 99%
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { filterLargeDataset, calculateCoveragePriority, createFilterSummary, FilterResult } from '../../../utils/filtering.js';

export interface CoverageFile {
  file: string;
  coverage: number;
  lines: number;
  functions: number;
  branches: number;
  uncoveredLines?: number[];
}

export interface CoverageAnalysisParams {
  projectPath: string;
  threshold?: number;
  topN?: number;
  priorities?: ('critical' | 'high' | 'medium' | 'low')[];
}

export interface FilteredCoverageResult {
  overall: {
    totalFiles: number;
    totalLines: number;
    totalFunctions: number;
    totalBranches: number;
    averageCoverage: number;
  };
  gaps: {
    summary: string;
    count: number;
    topGaps: CoverageFile[];
    distribution: Record<string, number>;
    metrics: {
      avgCoverage: number;
      worstCoverage: number;
      stdDev: number;
    };
  };
  recommendations: string[];
  filterInfo: {
    totalAnalyzed: number;
    returned: number;
    tokenReduction: number;
  };
}

/**
 * Analyze coverage gaps with client-side filtering
 *
 * Processes full coverage data locally and returns only the most critical gaps,
 * reducing output tokens from 50,000 to ~500 (99% reduction).
 *
 * @param params - Analysis parameters
 * @param fullCoverageData - Complete coverage dataset
 * @returns Filtered coverage analysis result
 *
 * @example
 * ```typescript
 * const result = await analyzeCoverageGapsFiltered({
 *   projectPath: '/workspace/project',
 *   threshold: 80,
 *   topN: 10,
 *   priorities: ['critical', 'high']
 * }, fullCoverageData);
 *
 * console.log(result.gaps.summary);
 * // "Analyzed 1247 files, returned top 10 critical gaps"
 * ```
 */
export async function analyzeCoverageGapsFiltered(
  params: CoverageAnalysisParams,
  fullCoverageData: CoverageFile[]
): Promise<FilteredCoverageResult> {
  const threshold = params.threshold ?? 80;
  const topN = params.topN ?? 10;
  const priorities = params.priorities ?? ['critical', 'high', 'medium'];

  // Calculate overall statistics from full dataset
  const overall = {
    totalFiles: fullCoverageData.length,
    totalLines: fullCoverageData.reduce((sum, f) => sum + f.lines, 0),
    totalFunctions: fullCoverageData.reduce((sum, f) => sum + f.functions, 0),
    totalBranches: fullCoverageData.reduce((sum, f) => sum + f.branches, 0),
    averageCoverage: fullCoverageData.length > 0
      ? fullCoverageData.reduce((sum, f) => sum + f.coverage, 0) / fullCoverageData.length
      : 0
  };

  // Filter to only files below threshold (gaps)
  const gaps = fullCoverageData.filter(file => file.coverage < threshold);

  // Apply client-side filtering
  const filtered = filterLargeDataset(
    gaps,
    { threshold, topN, priorities, includeMetrics: true },
    (file) => calculateCoveragePriority(file.coverage, threshold),
    (a, b) => a.coverage - b.coverage, // Sort by worst coverage first
    (file) => file.coverage
  );

  // Generate summary
  const summary = createFilterSummary(filtered, 'files');

  // Generate recommendations based on top gaps
  const recommendations = generateCoverageRecommendations(filtered.topItems, threshold);

  return {
    overall: {
      ...overall,
      averageCoverage: Math.round(overall.averageCoverage * 100) / 100
    },
    gaps: {
      summary,
      count: filtered.summary.filtered,
      topGaps: filtered.topItems,
      distribution: filtered.metrics.priorityDistribution,
      metrics: {
        avgCoverage: filtered.metrics.avgValue ?? 0,
        worstCoverage: filtered.metrics.min ?? 0,
        stdDev: filtered.metrics.stdDev ?? 0
      }
    },
    recommendations,
    filterInfo: {
      totalAnalyzed: filtered.summary.total,
      returned: filtered.summary.returned,
      tokenReduction: filtered.summary.reductionPercent
    }
  };
}

/**
 * Generate actionable recommendations based on coverage gaps
 */
function generateCoverageRecommendations(topGaps: CoverageFile[], threshold: number): string[] {
  const recommendations: string[] = [];

  if (topGaps.length === 0) {
    return ['All files meet coverage threshold. Consider increasing threshold or adding edge case tests.'];
  }

  const criticalGaps = topGaps.filter(f => f.coverage < threshold * 0.5);
  const highGaps = topGaps.filter(f => f.coverage >= threshold * 0.5 && f.coverage < threshold * 0.75);

  if (criticalGaps.length > 0) {
    recommendations.push(
      `🔴 CRITICAL: ${criticalGaps.length} file(s) have < ${threshold * 0.5}% coverage. Prioritize adding tests immediately.`
    );

    // List specific files
    criticalGaps.slice(0, 3).forEach(file => {
      recommendations.push(`  - ${file.file}: ${file.coverage.toFixed(1)}% coverage (${file.lines} lines)`);
    });
  }

  if (highGaps.length > 0) {
    recommendations.push(
      `🟠 HIGH: ${highGaps.length} file(s) have ${threshold * 0.5}-${threshold * 0.75}% coverage. Add tests for uncovered branches.`
    );
  }

  // Add general recommendations
  const avgCoverage = topGaps.reduce((sum, f) => sum + f.coverage, 0) / topGaps.length;
  if (avgCoverage < threshold * 0.6) {
    recommendations.push(
      `Recommendation: Use automated test generation to quickly improve coverage for low-coverage files.`
    );
  }

  // Suggest focusing on files with most uncovered lines
  const fileWithMostLines = topGaps.reduce((max, f) =>
    (f.uncoveredLines?.length ?? 0) > (max.uncoveredLines?.length ?? 0) ? f : max
  , topGaps[0]);

  if (fileWithMostLines.uncoveredLines && fileWithMostLines.uncoveredLines.length > 50) {
    recommendations.push(
      `Focus area: ${fileWithMostLines.file} has ${fileWithMostLines.uncoveredLines.length} uncovered lines. Break into smaller, testable functions.`
    );
  }

  return recommendations;
}

/**
 * Mock function to load coverage data
 * In real implementation, this would parse lcov.info or other coverage reports
 */
export async function loadCoverageData(projectPath: string): Promise<CoverageFile[]> {
  // This is a placeholder - in real implementation would read from coverage/lcov.info
  // For now, return empty array to indicate implementation needed
  return [];
}
