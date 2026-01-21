/**
 * Agentic QE v3 - Coverage Analysis MCP Tools
 *
 * qe/coverage/analyze - Analyze code coverage using REAL parsers
 * qe/coverage/gaps - Find coverage gaps using O(log n) HNSW search
 *
 * This module wraps the REAL coverage-analysis domain services.
 * Uses actual LCOV/JSON parsing and vector-based gap detection.
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema, getSharedMemoryBackend } from '../base';
import { ToolResult } from '../../types';
import { CoverageAnalyzerService } from '../../../domains/coverage-analysis/services/coverage-analyzer';
import { GapDetectorService } from '../../../domains/coverage-analysis/services/gap-detector';
import {
  findAndParseCoverage,
  parseCoverage,
  CoverageReport as ParsedCoverageReport,
} from '../../../domains/coverage-analysis/services/coverage-parser';
import { MemoryBackend, VectorSearchResult } from '../../../kernel/interfaces';
import { FileCoverage as DomainFileCoverage, CoverageSummary as DomainCoverageSummary } from '../../../domains/coverage-analysis/interfaces';

// ============================================================================
// Types
// ============================================================================

export interface CoverageAnalyzeParams {
  target?: string;
  coverageFile?: string;
  thresholds?: CoverageThresholds;
  includeRisk?: boolean;
  includeRiskScoring?: boolean; // Alias for includeRisk
  mlPowered?: boolean;
  dryRun?: boolean; // Return sample data without real parsing
  [key: string]: unknown;
}

export interface CoverageThresholds {
  lines?: number;
  branches?: number;
  functions?: number;
  statements?: number;
}

export interface CoverageAnalyzeResult {
  summary: CoverageSummary;
  byFile: FileCoverage[];
  thresholdsPassed: boolean;
  riskScore?: number;
  trends?: CoverageTrend;
}

export interface CoverageSummary {
  lines: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
  statements: CoverageMetric;
}

export interface CoverageMetric {
  covered: number;
  total: number;
  percentage: number;
}

export interface FileCoverage {
  file: string;
  lines: number;
  branches: number;
  functions: number;
  uncoveredLines: number[];
}

export interface CoverageTrend {
  direction: 'improving' | 'declining' | 'stable';
  delta: number;
  history: { date: string; coverage: number }[];
}

export interface CoverageGapsParams {
  target?: string;
  coverageFile?: string;
  minRisk?: number;
  limit?: number;
  prioritization?: 'complexity' | 'criticality' | 'change-frequency' | 'ml-confidence';
  [key: string]: unknown;
}

export interface CoverageGapsResult {
  gaps: CoverageGap[];
  totalGaps: number;
  criticalGaps: number;
  suggestedTests: TestSuggestion[];
}

export interface CoverageGap {
  file: string;
  lines: number[];
  type: 'uncovered-line' | 'uncovered-branch' | 'uncovered-function';
  severity: 'critical' | 'high' | 'medium' | 'low';
  riskScore: number;
  reason: string;
}

export interface TestSuggestion {
  file: string;
  description: string;
  estimatedCoverageGain: number;
  priority: number;
}

// ============================================================================
// Helper: Calculate Coverage Summary from Files
// ============================================================================

function calculateSummary(files: DomainFileCoverage[]): DomainCoverageSummary {
  let totalLines = 0, coveredLines = 0;
  let totalBranches = 0, coveredBranches = 0;
  let totalFunctions = 0, coveredFunctions = 0;
  let totalStatements = 0, coveredStatements = 0;

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
// Helper: Convert Parsed Coverage to Domain Format
// ============================================================================

function convertParsedToDomainFormat(parsed: ParsedCoverageReport): DomainFileCoverage[] {
  const files: DomainFileCoverage[] = [];

  for (const [filePath, coverage] of parsed.files.entries()) {
    files.push({
      path: coverage.relativePath || filePath,
      lines: {
        covered: coverage.lines.covered,
        total: coverage.lines.total,
      },
      branches: {
        covered: coverage.branches.covered,
        total: coverage.branches.total,
      },
      functions: {
        covered: coverage.functions.covered,
        total: coverage.functions.total,
      },
      statements: {
        covered: coverage.statements.covered,
        total: coverage.statements.total,
      },
      uncoveredLines: coverage.lines.uncoveredLines,
      uncoveredBranches: coverage.branches.uncoveredBranches.map((b) => b.line),
    });
  }

  return files;
}

// ============================================================================
// Coverage Analyze Tool
// ============================================================================

export class CoverageAnalyzeTool extends MCPToolBase<CoverageAnalyzeParams, CoverageAnalyzeResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/coverage/analyze',
    description: 'Analyze code coverage using real LCOV/JSON parsing and compare against thresholds. Includes risk scoring and trend analysis.',
    domain: 'coverage-analysis',
    schema: COVERAGE_ANALYZE_SCHEMA,
    streaming: true,
    timeout: 180000,
  };

  private analyzerService: CoverageAnalyzerService | null = null;

  private async getService(context: MCPToolContext): Promise<CoverageAnalyzerService> {
    if (!this.analyzerService) {
      const memory = (context as any).memory as MemoryBackend | undefined;
      this.analyzerService = new CoverageAnalyzerService(
        memory || await getSharedMemoryBackend()
      );
    }
    return this.analyzerService;
  }

  async execute(
    params: CoverageAnalyzeParams,
    context: MCPToolContext
  ): Promise<ToolResult<CoverageAnalyzeResult>> {
    const {
      target = '.',
      coverageFile,
      thresholds = { lines: 80, branches: 70, functions: 80, statements: 80 },
      includeRisk = false,
      includeRiskScoring = false,
      dryRun = false,
    } = params;

    const shouldIncludeRisk = includeRisk || includeRiskScoring;

    try {
      this.emitStream(context, {
        status: 'analyzing',
        message: `Analyzing coverage for ${target}`,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      // Check if demo mode is EXPLICITLY requested (only for testing/docs)
      if (this.isDemoMode(context) || dryRun) {
        this.markAsDemoData(context, 'Demo mode explicitly requested');
        return this.getDemoResult(target, thresholds, shouldIncludeRisk, context);
      }

      // Parse real coverage data - NO FALLBACKS
      let parsedReport: ParsedCoverageReport | null = null;

      if (coverageFile) {
        try {
          parsedReport = await parseCoverage(coverageFile, target);
        } catch (parseError) {
          // Return error - don't silently fall back to fake data
          return {
            success: false,
            error: `Failed to parse coverage file '${coverageFile}': ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          };
        }
      } else {
        // Try to find coverage in target directory
        parsedReport = await findAndParseCoverage(target);
      }

      // If no coverage data found, return error with actionable guidance
      if (!parsedReport || parsedReport.files.size === 0) {
        return {
          success: false,
          error: `No coverage data found in '${target}'. Run your test suite with coverage enabled (e.g., 'npm test -- --coverage') and ensure coverage reports are generated (lcov.info, coverage-final.json, etc.)`,
        };
      }

      // Mark as real data - we have actual coverage
      this.markAsRealData();

      // Convert to domain format
      const domainFiles = convertParsedToDomainFormat(parsedReport);

      // Use real analyzer service
      const service = await this.getService(context);
      const analyzeResult = await service.analyze({
        coverageData: { files: domainFiles, summary: calculateSummary(domainFiles) },
        threshold: thresholds.lines || 80,
        includeFileDetails: true,
      });

      if (!analyzeResult.success) {
        return {
          success: false,
          error: `Analysis failed: ${analyzeResult.error?.message || 'Unknown error'}`,
        };
      }

      const report = analyzeResult.value;

      // Build output summary from parsed data
      const summary: CoverageSummary = {
        lines: {
          covered: parsedReport.summary.lines.covered,
          total: parsedReport.summary.lines.total,
          percentage: Math.round(parsedReport.summary.lines.percentage * 100) / 100,
        },
        branches: {
          covered: parsedReport.summary.branches.covered,
          total: parsedReport.summary.branches.total,
          percentage: Math.round(parsedReport.summary.branches.percentage * 100) / 100,
        },
        functions: {
          covered: parsedReport.summary.functions.covered,
          total: parsedReport.summary.functions.total,
          percentage: Math.round(parsedReport.summary.functions.percentage * 100) / 100,
        },
        statements: {
          covered: parsedReport.summary.statements.covered,
          total: parsedReport.summary.statements.total,
          percentage: Math.round(parsedReport.summary.statements.percentage * 100) / 100,
        },
      };

      // Build file-level coverage
      const byFile: FileCoverage[] = domainFiles.map((f) => ({
        file: f.path,
        lines: Math.round((f.lines.covered / (f.lines.total || 1)) * 100),
        branches: Math.round((f.branches.covered / (f.branches.total || 1)) * 100),
        functions: Math.round((f.functions.covered / (f.functions.total || 1)) * 100),
        uncoveredLines: f.uncoveredLines.slice(0, 20), // Limit for output
      }));

      // Check thresholds
      const thresholdsPassed =
        summary.lines.percentage >= (thresholds.lines || 0) &&
        summary.branches.percentage >= (thresholds.branches || 0) &&
        summary.functions.percentage >= (thresholds.functions || 0) &&
        summary.statements.percentage >= (thresholds.statements || 0);

      // Calculate risk score if requested
      let riskScore: number | undefined;
      if (shouldIncludeRisk) {
        const totalUncovered = domainFiles.reduce((sum, f) => sum + f.uncoveredLines.length, 0);
        const avgCoverage = (summary.lines.percentage + summary.branches.percentage + summary.functions.percentage) / 3;
        riskScore = Math.round((1 - avgCoverage / 100 + Math.min(totalUncovered / 1000, 0.5)) * 100) / 100;
      }

      // Build trend from delta if available
      let trends: CoverageTrend | undefined;
      if (report.delta) {
        trends = {
          direction: report.delta.trend,
          delta: Math.round((report.delta.line + report.delta.branch + report.delta.function) / 3 * 100) / 100,
          history: [
            { date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], coverage: summary.lines.percentage - (report.delta.line || 0) },
            { date: new Date().toISOString().split('T')[0], coverage: summary.lines.percentage },
          ],
        };
      }

      this.emitStream(context, {
        status: 'complete',
        message: `Coverage analysis complete: ${summary.lines.percentage}% lines covered`,
        progress: 100,
      });

      return {
        success: true,
        data: {
          summary,
          byFile,
          thresholdsPassed,
          riskScore,
          trends,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Coverage analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Returns demo coverage data when no real data is available.
   * Only used when demoMode is explicitly requested or as fallback with warning.
   */
  private getDemoResult(
    target: string,
    thresholds: CoverageThresholds,
    includeRisk: boolean,
    context: MCPToolContext
  ): ToolResult<CoverageAnalyzeResult> {
    const summary: CoverageSummary = {
      lines: { covered: 850, total: 1000, percentage: 85.0 },
      branches: { covered: 120, total: 150, percentage: 80.0 },
      functions: { covered: 90, total: 100, percentage: 90.0 },
      statements: { covered: 900, total: 1050, percentage: 85.71 },
    };

    const byFile: FileCoverage[] = [
      { file: `${target}/service.ts`, lines: 92, branches: 85, functions: 95, uncoveredLines: [45, 67, 89] },
      { file: `${target}/utils.ts`, lines: 78, branches: 70, functions: 85, uncoveredLines: [12, 34, 56, 78, 90] },
      { file: `${target}/handler.ts`, lines: 88, branches: 82, functions: 90, uncoveredLines: [23, 45] },
    ];

    const thresholdsPassed =
      summary.lines.percentage >= (thresholds.lines || 0) &&
      summary.branches.percentage >= (thresholds.branches || 0) &&
      summary.functions.percentage >= (thresholds.functions || 0) &&
      summary.statements.percentage >= (thresholds.statements || 0);

    this.emitStream(context, {
      status: 'complete',
      message: `Coverage analysis complete (sample data): ${summary.lines.percentage}% lines covered`,
      progress: 100,
    });

    return {
      success: true,
      data: {
        summary,
        byFile,
        thresholdsPassed,
        riskScore: includeRisk ? 0.25 : undefined,
        trends: {
          direction: 'improving',
          delta: 2.5,
          history: [
            { date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], coverage: 82.5 },
            { date: new Date().toISOString().split('T')[0], coverage: 85.0 },
          ],
        },
      },
    };
  }

  /**
   * Reset instance-level service cache.
   * Called when fleet is disposed to prevent stale backend references.
   */
  override resetInstanceCache(): void {
    this.analyzerService = null;
  }
}

// ============================================================================
// Coverage Gaps Tool
// ============================================================================

export class CoverageGapsTool extends MCPToolBase<CoverageGapsParams, CoverageGapsResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/coverage/gaps',
    description: 'Find coverage gaps using O(log n) HNSW vector search. Prioritizes by risk, complexity, or ML confidence using real coverage data.',
    domain: 'coverage-analysis',
    schema: COVERAGE_GAPS_SCHEMA,
    streaming: true,
    timeout: 120000,
  };

  private gapService: GapDetectorService | null = null;

  private async getService(context: MCPToolContext): Promise<GapDetectorService> {
    if (!this.gapService) {
      const memory = (context as any).memory as MemoryBackend | undefined;
      this.gapService = new GapDetectorService(memory || await getSharedMemoryBackend());
    }
    return this.gapService;
  }

  async execute(
    params: CoverageGapsParams,
    context: MCPToolContext
  ): Promise<ToolResult<CoverageGapsResult>> {
    const {
      target = '.',
      coverageFile,
      minRisk = 0.3,
      limit = 20,
      prioritization = 'complexity',
    } = params;

    try {
      this.emitStream(context, {
        status: 'detecting',
        message: `Detecting coverage gaps in ${target} (O(log n) search)`,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      // Parse real coverage data
      let parsedReport: ParsedCoverageReport | null = null;

      if (coverageFile) {
        try {
          parsedReport = await parseCoverage(coverageFile, target);
        } catch (parseError) {
          return {
            success: false,
            error: `Failed to parse coverage file: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          };
        }
      } else {
        parsedReport = await findAndParseCoverage(target);
      }

      // Check if demo mode is EXPLICITLY requested (only for testing/docs)
      if (this.isDemoMode(context)) {
        this.markAsDemoData(context, 'Demo mode explicitly requested');
        return this.getDemoGapsResult(target, minRisk, limit, context);
      }

      // If no coverage data found, return error with actionable guidance
      if (!parsedReport || parsedReport.files.size === 0) {
        return {
          success: false,
          error: `No coverage data found in '${target}'. Run your test suite with coverage enabled to generate coverage reports before detecting gaps.`,
        };
      }

      // Mark as real data - we have actual coverage
      this.markAsRealData();

      // Convert to domain format
      const domainFiles = convertParsedToDomainFormat(parsedReport);

      // Use real gap detector service
      const service = await this.getService(context);

      // Map prioritization to service strategy
      const prioritizeStrategy = prioritization === 'change-frequency' ? 'recent-changes' : 'risk';

      const gapResult = await service.detectGaps({
        coverageData: { files: domainFiles, summary: calculateSummary(domainFiles) },
        minCoverage: 80,
        prioritize: prioritizeStrategy,
      });

      if (!gapResult.success) {
        return {
          success: false,
          error: `Gap detection failed: ${gapResult.error?.message || 'Unknown error'}`,
        };
      }

      const detectedGaps = gapResult.value;

      // Filter by minimum risk and convert to output format
      const gaps: CoverageGap[] = detectedGaps.gaps
        .filter((g) => g.riskScore >= minRisk)
        .slice(0, limit)
        .map((g) => ({
          file: g.file,
          lines: g.lines,
          type: g.branches.length > 0 ? 'uncovered-branch' as const : 'uncovered-line' as const,
          severity: g.severity as 'critical' | 'high' | 'medium' | 'low',
          riskScore: Math.round(g.riskScore * 100) / 100,
          reason: g.recommendation,
        }));

      // Generate test suggestions based on gaps
      const suggestedTests: TestSuggestion[] = gaps.slice(0, 5).map((gap, idx) => ({
        file: gap.file.replace(/\.ts$/, '.test.ts'),
        description: `Add tests for ${gap.lines.length} uncovered lines in ${gap.file}`,
        estimatedCoverageGain: Math.round((gap.lines.length / (detectedGaps.totalUncoveredLines || 1)) * 100 * 100) / 100,
        priority: idx + 1,
      }));

      this.emitStream(context, {
        status: 'complete',
        message: `Found ${gaps.length} coverage gaps (${detectedGaps.totalUncoveredLines} uncovered lines)`,
        progress: 100,
      });

      return {
        success: true,
        data: {
          gaps,
          totalGaps: detectedGaps.gaps.length,
          criticalGaps: gaps.filter((g) => g.severity === 'critical').length,
          suggestedTests,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Gap detection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Returns demo gap data when no real coverage data is available.
   * Only used when demoMode is explicitly requested or as fallback with warning.
   */
  private getDemoGapsResult(
    target: string,
    minRisk: number,
    limit: number,
    context: MCPToolContext
  ): ToolResult<CoverageGapsResult> {
    const allGaps: CoverageGap[] = [
      {
        file: `${target}/service.ts`,
        lines: [45, 67, 89, 102, 115],
        type: 'uncovered-line',
        severity: 'high',
        riskScore: 0.85,
        reason: 'Core business logic with no test coverage',
      },
      {
        file: `${target}/utils.ts`,
        lines: [12, 34, 56],
        type: 'uncovered-branch',
        severity: 'medium',
        riskScore: 0.65,
        reason: 'Utility functions missing edge case tests',
      },
      {
        file: `${target}/handler.ts`,
        lines: [23, 45, 67, 89],
        type: 'uncovered-function',
        severity: 'critical',
        riskScore: 0.92,
        reason: 'Error handling paths untested',
      },
      {
        file: `${target}/validator.ts`,
        lines: [10, 20, 30],
        type: 'uncovered-line',
        severity: 'low',
        riskScore: 0.35,
        reason: 'Simple validation logic',
      },
    ];

    // Filter by minimum risk score
    const gaps = allGaps
      .filter((g) => g.riskScore >= minRisk)
      .slice(0, limit);

    const suggestedTests: TestSuggestion[] = gaps.slice(0, 5).map((gap, idx) => ({
      file: gap.file.replace(/\.ts$/, '.test.ts'),
      description: `Add tests for ${gap.lines.length} uncovered lines in ${gap.file}`,
      estimatedCoverageGain: Math.round((gap.lines.length / 50) * 100 * 100) / 100,
      priority: idx + 1,
    }));

    this.emitStream(context, {
      status: 'complete',
      message: `Found ${gaps.length} coverage gaps (sample data)`,
      progress: 100,
    });

    return {
      success: true,
      data: {
        gaps,
        totalGaps: gaps.length,
        criticalGaps: gaps.filter((g) => g.severity === 'critical').length,
        suggestedTests,
      },
    };
  }

  /**
   * Reset instance-level service cache.
   * Called when fleet is disposed to prevent stale backend references.
   */
  override resetInstanceCache(): void {
    this.gapService = null;
  }
}

// ============================================================================
// Schemas
// ============================================================================

const COVERAGE_ANALYZE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    target: {
      type: 'string',
      description: 'Target directory to analyze (searches for coverage files)',
      default: '.',
    },
    coverageFile: {
      type: 'string',
      description: 'Path to coverage report file (lcov.info, coverage-final.json, etc.)',
    },
    thresholds: {
      type: 'object',
      description: 'Coverage thresholds',
      properties: {
        lines: { type: 'number', description: 'Line coverage threshold' },
        branches: { type: 'number', description: 'Branch coverage threshold' },
        functions: { type: 'number', description: 'Function coverage threshold' },
        statements: { type: 'number', description: 'Statement coverage threshold' },
      },
    },
    includeRisk: {
      type: 'boolean',
      description: 'Include risk score analysis',
      default: false,
    },
    mlPowered: {
      type: 'boolean',
      description: 'Use ML-powered analysis (vector similarity)',
      default: false,
    },
  },
};

const COVERAGE_GAPS_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    target: {
      type: 'string',
      description: 'Target directory to analyze',
      default: '.',
    },
    coverageFile: {
      type: 'string',
      description: 'Path to coverage report file',
    },
    minRisk: {
      type: 'number',
      description: 'Minimum risk score to include (0-1)',
      minimum: 0,
      maximum: 1,
      default: 0.3,
    },
    limit: {
      type: 'number',
      description: 'Maximum number of gaps to return',
      minimum: 1,
      maximum: 100,
      default: 20,
    },
    prioritization: {
      type: 'string',
      description: 'Gap prioritization strategy',
      enum: ['complexity', 'criticality', 'change-frequency', 'ml-confidence'],
      default: 'complexity',
    },
  },
};
