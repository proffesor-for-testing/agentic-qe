/**
 * Batch Coverage Analysis Example
 *
 * Demonstrates using the BatchOperationManager to analyze coverage
 * for multiple modules/packages in parallel.
 *
 * Performance Improvement:
 * - Sequential: 10 modules × 1s = 10s
 * - Batched: max(1s) with 5 concurrent = ~2s
 * - Speedup: 5x faster
 *
 * @module agents/examples/batchAnalyze
 */

import { BatchOperationManager, type BatchResult } from '../../utils/batch-operations';
import type { CoverageReport } from '../../types';

/**
 * Configuration for batch coverage analysis
 */
export interface BatchAnalyzeConfig {
  /**
   * Coverage threshold percentage
   */
  threshold?: number;

  /**
   * Maximum concurrent analysis operations
   * @default 5
   */
  maxConcurrent?: number;

  /**
   * Timeout per module in milliseconds
   * @default 60000 (60 seconds)
   */
  timeout?: number;

  /**
   * Enable retry on failure
   * @default true
   */
  retryOnError?: boolean;

  /**
   * Include detailed file-level coverage
   */
  includeDetails?: boolean;

  /**
   * Progress callback
   */
  onProgress?: (completed: number, total: number, module: string) => void;
}

/**
 * Input for a single module analysis
 */
export interface ModuleAnalysisInput {
  /**
   * Module name or path
   */
  moduleName: string;

  /**
   * Path to coverage data file (lcov, json, etc.)
   */
  coverageDataPath?: string;

  /**
   * Module-specific configuration
   */
  config?: {
    threshold?: number;
    includeSubmodules?: boolean;
  };
}

/**
 * Coverage gap information
 */
export interface CoverageGap {
  /**
   * File path
   */
  filePath: string;

  /**
   * Current coverage percentage
   */
  coverage: number;

  /**
   * Uncovered lines
   */
  uncoveredLines: number[];

  /**
   * Uncovered branches
   */
  uncoveredBranches?: Array<{
    line: number;
    branch: number;
  }>;

  /**
   * Priority (high/medium/low)
   */
  priority: 'high' | 'medium' | 'low';

  /**
   * Complexity metrics
   */
  complexity?: {
    cyclomatic: number;
    cognitive: number;
  };
}

/**
 * Result for a single module analysis
 */
export interface ModuleAnalysisResult {
  /**
   * Module name
   */
  moduleName: string;

  /**
   * Overall coverage metrics
   */
  coverage: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };

  /**
   * Coverage gaps found
   */
  gaps: CoverageGap[];

  /**
   * Number of files analyzed
   */
  filesAnalyzed: number;

  /**
   * Analysis time in milliseconds
   */
  analysisTime: number;

  /**
   * Recommendations for improvement
   */
  recommendations?: string[];
}

/**
 * Batch analyze coverage for multiple modules
 *
 * @example
 * ```typescript
 * const modules = [
 *   { moduleName: 'auth', coverageDataPath: 'coverage/auth/lcov.info' },
 *   { moduleName: 'api', coverageDataPath: 'coverage/api/lcov.info' },
 *   { moduleName: 'ui', coverageDataPath: 'coverage/ui/lcov.info' }
 * ];
 *
 * const result = await analyzeCoverageForModules(modules, {
 *   threshold: 80,
 *   maxConcurrent: 5,
 *   includeDetails: true,
 *   onProgress: (completed, total, module) => {
 *     console.log(`Analyzed ${completed}/${total}: ${module}`);
 *   }
 * });
 *
 * console.log(`Analyzed ${result.results.length} modules`);
 * console.log(`Success rate: ${result.successRate * 100}%`);
 * ```
 */
export async function analyzeCoverageForModules(
  modules: ModuleAnalysisInput[],
  config: BatchAnalyzeConfig
): Promise<BatchResult<ModuleAnalysisResult>> {
  const batchManager = new BatchOperationManager();

  const {
    threshold = 80,
    maxConcurrent = 5,
    timeout = 60000,
    retryOnError = true,
    includeDetails = false,
    onProgress,
  } = config;

  // Handler function for single module analysis
  const analyzeModule = async (
    input: ModuleAnalysisInput
  ): Promise<ModuleAnalysisResult> => {
    const startTime = Date.now();

    // This would call your actual coverage analysis service
    const coverage = await analyzeCoverageData({
      moduleName: input.moduleName,
      coverageDataPath: input.coverageDataPath,
      threshold: input.config?.threshold || threshold,
      includeDetails,
    });

    // Find gaps (files below threshold)
    const gaps = findCoverageGaps(coverage, threshold);

    // Generate recommendations
    const recommendations = includeDetails
      ? generateRecommendations(gaps)
      : undefined;

    const analysisTime = Date.now() - startTime;

    return {
      moduleName: input.moduleName,
      coverage: coverage.summary,
      gaps,
      filesAnalyzed: coverage.files.length,
      analysisTime,
      recommendations,
    };
  };

  // Execute batch analysis
  return batchManager.batchExecute(modules, analyzeModule, {
    maxConcurrent,
    timeout,
    retryOnError,
    maxRetries: 3,
    failFast: false,
    onProgress: (completed, total) => {
      const currentModule = modules[completed - 1]?.moduleName || 'unknown';
      onProgress?.(completed, total, currentModule);
    },
  });
}

/**
 * Placeholder for actual coverage analysis implementation
 */
async function analyzeCoverageData(params: {
  moduleName: string;
  coverageDataPath?: string;
  threshold: number;
  includeDetails: boolean;
}): Promise<{
  summary: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
  };
  files: Array<{
    path: string;
    coverage: number;
    lines: { total: number; covered: number };
    branches: { total: number; covered: number };
  }>;
}> {
  // This would integrate with your CoverageAnalyzerAgent
  throw new Error('Not implemented - integrate with CoverageAnalyzerAgent');
}

/**
 * Find coverage gaps below threshold
 */
function findCoverageGaps(
  coverage: {
    files: Array<{
      path: string;
      coverage: number;
      lines: { total: number; covered: number };
    }>;
  },
  threshold: number
): CoverageGap[] {
  return coverage.files
    .filter((file) => file.coverage < threshold)
    .map((file) => {
      const priority: 'low' | 'medium' | 'high' =
        file.coverage < threshold - 20
          ? 'high'
          : file.coverage < threshold - 10
          ? 'medium'
          : 'low';

      return {
        filePath: file.path,
        coverage: file.coverage,
        uncoveredLines: [], // Would be populated from actual coverage data
        priority,
      };
    })
    .sort((a, b) => a.coverage - b.coverage); // Worst coverage first
}

/**
 * Generate improvement recommendations
 */
function generateRecommendations(gaps: CoverageGap[]): string[] {
  const recommendations: string[] = [];

  if (gaps.length === 0) {
    return ['All files meet coverage threshold'];
  }

  const highPriorityGaps = gaps.filter((g) => g.priority === 'high');
  if (highPriorityGaps.length > 0) {
    recommendations.push(
      `Focus on ${highPriorityGaps.length} high-priority files with <60% coverage`
    );
  }

  const avgCoverage =
    gaps.reduce((sum, g) => sum + g.coverage, 0) / gaps.length;
  if (avgCoverage < 50) {
    recommendations.push(
      'Consider implementing integration tests to improve overall coverage'
    );
  }

  if (gaps.length > 10) {
    recommendations.push(
      'Use batch test generation to address multiple gaps simultaneously'
    );
  }

  return recommendations;
}

/**
 * Batch analyze coverage with gap prioritization
 *
 * Analyzes all modules and returns a prioritized list of files to test.
 *
 * @example
 * ```typescript
 * const result = await analyzeCoverageWithPriority(modules, {
 *   threshold: 80,
 *   topN: 20 // Return top 20 gaps
 * });
 *
 * console.log('Top coverage gaps to address:');
 * result.prioritizedGaps.forEach((gap, idx) => {
 *   console.log(`${idx + 1}. ${gap.filePath} (${gap.coverage}%)`);
 * });
 * ```
 */
export async function analyzeCoverageWithPriority(
  modules: ModuleAnalysisInput[],
  config: BatchAnalyzeConfig & {
    topN?: number;
  }
): Promise<
  BatchResult<ModuleAnalysisResult> & {
    prioritizedGaps: CoverageGap[];
    overallCoverage: {
      lines: number;
      branches: number;
      functions: number;
      statements: number;
    };
  }
> {
  const result = await analyzeCoverageForModules(modules, config);

  // Aggregate all gaps
  const allGaps = result.results.flatMap((r) => r.gaps);

  // Sort by priority and coverage
  const prioritizedGaps = allGaps
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      return priorityDiff !== 0 ? priorityDiff : a.coverage - b.coverage;
    })
    .slice(0, config.topN || 50);

  // Calculate overall coverage
  const totalCoverage = result.results.reduce(
    (sum, r) => ({
      lines: sum.lines + r.coverage.lines,
      branches: sum.branches + r.coverage.branches,
      functions: sum.functions + r.coverage.functions,
      statements: sum.statements + r.coverage.statements,
    }),
    { lines: 0, branches: 0, functions: 0, statements: 0 }
  );

  const count = result.results.length || 1;
  const overallCoverage = {
    lines: totalCoverage.lines / count,
    branches: totalCoverage.branches / count,
    functions: totalCoverage.functions / count,
    statements: totalCoverage.statements / count,
  };

  return {
    ...result,
    prioritizedGaps,
    overallCoverage,
  };
}

/**
 * Continuous coverage monitoring with batch analysis
 *
 * Runs coverage analysis at intervals and tracks trends over time.
 *
 * @example
 * ```typescript
 * const monitor = new CoverageMonitor(modules, {
 *   interval: 60000, // 1 minute
 *   threshold: 80,
 *   onCoverageChange: (current, previous) => {
 *     console.log(`Coverage changed: ${previous}% -> ${current}%`);
 *   }
 * });
 *
 * await monitor.start();
 * ```
 */
export class CoverageMonitor {
  private intervalId?: NodeJS.Timeout;
  private previousCoverage?: number;

  constructor(
    private modules: ModuleAnalysisInput[],
    private config: BatchAnalyzeConfig & {
      interval?: number;
      onCoverageChange?: (current: number, previous: number) => void;
    }
  ) {}

  async start(): Promise<void> {
    const interval = this.config.interval || 60000;

    // Initial analysis
    await this.runAnalysis();

    // Schedule periodic analysis
    this.intervalId = setInterval(() => {
      this.runAnalysis();
    }, interval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private async runAnalysis(): Promise<void> {
    const result = await analyzeCoverageWithPriority(this.modules, this.config);

    const currentCoverage = result.overallCoverage.lines;

    if (
      this.previousCoverage !== undefined &&
      this.config.onCoverageChange
    ) {
      this.config.onCoverageChange(currentCoverage, this.previousCoverage);
    }

    this.previousCoverage = currentCoverage;
  }
}

/**
 * Analyze coverage delta between two points in time
 *
 * Useful for PR validation to ensure coverage doesn't decrease.
 *
 * @example
 * ```typescript
 * const delta = await analyzeCoverageDelta(
 *   modules,
 *   'baseline-coverage.json',
 *   'current-coverage.json',
 *   { threshold: 80 }
 * );
 *
 * if (delta.overallChange < 0) {
 *   console.error('Coverage decreased!');
 *   process.exit(1);
 * }
 * ```
 */
export async function analyzeCoverageDelta(
  modules: ModuleAnalysisInput[],
  baselinePath: string,
  currentPath: string,
  config: BatchAnalyzeConfig
): Promise<{
  overallChange: number;
  moduleChanges: Array<{
    module: string;
    before: number;
    after: number;
    change: number;
  }>;
  newGaps: CoverageGap[];
  fixedGaps: CoverageGap[];
}> {
  // This would load baseline and current coverage, then compare
  throw new Error('Not implemented - integrate with coverage comparison logic');
}
