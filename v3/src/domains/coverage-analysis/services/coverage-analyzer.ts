/**
 * Agentic QE v3 - Coverage Analyzer Service
 * Implements ICoverageAnalysisService with O(log n) vector-based analysis
 *
 * ADR-051: LLM-powered coverage analysis for intelligent gap detection
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

// ADR-051: LLM Router for AI-enhanced coverage analysis
import type { HybridRouter, ChatResponse } from '../../../shared/llm';

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
// Configuration and Dependencies
// ============================================================================

/**
 * Configuration for the coverage analyzer
 */
export interface CoverageAnalyzerConfig {
  /** Default coverage threshold percentage */
  defaultThreshold: number;
  /** ADR-051: Enable LLM-powered coverage analysis */
  enableLLMAnalysis?: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier?: number;
  /** ADR-051: Max tokens for LLM responses */
  llmMaxTokens?: number;
}

const DEFAULT_CONFIG: CoverageAnalyzerConfig = {
  defaultThreshold: 80,
  enableLLMAnalysis: true, // On by default - opt-out
  llmModelTier: 2, // Sonnet by default
  llmMaxTokens: 2048,
};

/**
 * Dependencies for CoverageAnalyzerService
 * Enables dependency injection and testing
 */
export interface CoverageAnalyzerDependencies {
  memory: MemoryBackend;
  /** ADR-051: Optional LLM router for AI-enhanced coverage analysis */
  llmRouter?: HybridRouter;
}

/**
 * LLM-generated coverage insights
 * ADR-051: Structured analysis results from LLM
 */
export interface CoverageInsights {
  /** Explanation of why code is uncovered */
  uncoveredReasoning: string[];
  /** Suggested test cases to cover gaps */
  suggestedTestCases: SuggestedTestCase[];
  /** Risk assessment for uncovered paths */
  riskAssessment: RiskAssessment;
}

export interface SuggestedTestCase {
  name: string;
  description: string;
  type: 'unit' | 'integration' | 'edge-case';
  targetLines: number[];
  estimatedEffort: 'low' | 'medium' | 'high';
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  businessImpact: string;
  recommendations: string[];
}

// ============================================================================
// Service Implementation
// ============================================================================

export class CoverageAnalyzerService implements ICoverageAnalysisService {
  private static readonly DEFAULT_THRESHOLD = 80;
  private static readonly VECTOR_DIMENSION = 128;

  private readonly memory: MemoryBackend;
  private readonly config: CoverageAnalyzerConfig;
  private readonly llmRouter?: HybridRouter;

  /**
   * Constructor with backward compatibility support
   * @param memoryOrDependencies - Either a MemoryBackend (legacy) or CoverageAnalyzerDependencies
   * @param config - Optional configuration overrides
   */
  constructor(
    memoryOrDependencies: MemoryBackend | CoverageAnalyzerDependencies,
    config: Partial<CoverageAnalyzerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Support both old (MemoryBackend) and new (Dependencies) signatures
    if (this.isMemoryBackend(memoryOrDependencies)) {
      // Legacy: direct MemoryBackend parameter
      this.memory = memoryOrDependencies;
      this.llmRouter = undefined;
    } else {
      // New: dependencies object
      this.memory = memoryOrDependencies.memory;
      this.llmRouter = memoryOrDependencies.llmRouter;
    }
  }

  /**
   * Type guard to check if input is a MemoryBackend
   */
  private isMemoryBackend(
    input: MemoryBackend | CoverageAnalyzerDependencies
  ): input is MemoryBackend {
    // MemoryBackend has 'get', 'set', 'delete' methods directly
    // CoverageAnalyzerDependencies has a 'memory' property
    return (
      typeof (input as MemoryBackend).get === 'function' &&
      typeof (input as MemoryBackend).set === 'function' &&
      !('memory' in input)
    );
  }

  /**
   * Analyze coverage from reports
   */
  async analyze(request: AnalyzeCoverageRequest): Promise<Result<CoverageReport, Error>> {
    try {
      const { coverageData, threshold = this.config.defaultThreshold } = request;

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
    threshold: number = this.config.defaultThreshold
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
  // ADR-051: LLM Enhancement Methods
  // ============================================================================

  /**
   * Check if LLM analysis is available and enabled
   */
  isLLMAnalysisAvailable(): boolean {
    return this.config.enableLLMAnalysis === true && this.llmRouter !== undefined;
  }

  /**
   * Get model ID for the configured tier
   */
  private getModelForTier(tier: number): string {
    switch (tier) {
      case 1:
        return 'claude-3-5-haiku-20241022';
      case 2:
        return 'claude-sonnet-4-20250514';
      case 3:
        return 'claude-sonnet-4-20250514';
      case 4:
        return 'claude-opus-4-5-20251101';
      default:
        return 'claude-sonnet-4-20250514';
    }
  }

  /**
   * Analyze coverage gaps using LLM for intelligent insights
   * ADR-051: Provides explanations, test suggestions, and risk assessment
   *
   * @param gaps - Coverage gaps to analyze
   * @param sourceCode - Source code content (optional, for deeper analysis)
   * @returns LLM-generated coverage insights
   */
  async analyzeCoverageWithLLM(
    gaps: CoverageGap[],
    sourceCode?: string
  ): Promise<CoverageInsights> {
    if (!this.llmRouter) {
      return this.getDefaultInsights();
    }

    try {
      const prompt = this.buildCoverageAnalysisPrompt(gaps, sourceCode);
      const modelId = this.getModelForTier(this.config.llmModelTier ?? 2);

      const response: ChatResponse = await this.llmRouter.chat({
        messages: [
          {
            role: 'system',
            content: `You are an expert code coverage analyst and test engineer. Analyze coverage gaps and provide actionable insights.

Your response MUST be valid JSON with this exact structure:
{
  "uncoveredReasoning": ["reason1", "reason2", ...],
  "suggestedTestCases": [
    {
      "name": "test name",
      "description": "what this test covers",
      "type": "unit" | "integration" | "edge-case",
      "targetLines": [1, 2, 3],
      "estimatedEffort": "low" | "medium" | "high"
    }
  ],
  "riskAssessment": {
    "overallRisk": "low" | "medium" | "high" | "critical",
    "riskFactors": ["factor1", "factor2"],
    "businessImpact": "description of potential business impact",
    "recommendations": ["recommendation1", "recommendation2"]
  }
}

Provide thoughtful, specific analysis based on the coverage data. Do not include any text outside the JSON.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: modelId,
        maxTokens: this.config.llmMaxTokens ?? 2048,
        temperature: 0.3, // Low temperature for consistent analysis
      });

      if (response.content && response.content.length > 0) {
        return this.parseInsightsResponse(response.content);
      }

      return this.getDefaultInsights();
    } catch (error) {
      console.warn('[CoverageAnalyzer] LLM analysis failed, using defaults:', error);
      return this.getDefaultInsights();
    }
  }

  /**
   * Build the prompt for LLM coverage analysis
   */
  private buildCoverageAnalysisPrompt(gaps: CoverageGap[], sourceCode?: string): string {
    let prompt = '## Coverage Gaps to Analyze\n\n';

    for (const gap of gaps.slice(0, 10)) {
      // Limit to top 10 gaps to avoid token limits
      prompt += `### File: ${gap.file}\n`;
      prompt += `- Uncovered lines: ${gap.lines.slice(0, 20).join(', ')}${gap.lines.length > 20 ? '...' : ''}\n`;
      prompt += `- Uncovered branches: ${gap.branches.length}\n`;
      prompt += `- Risk score: ${(gap.riskScore * 100).toFixed(1)}%\n`;
      prompt += `- Severity: ${gap.severity}\n`;
      prompt += `- Current recommendation: ${gap.recommendation}\n\n`;
    }

    if (sourceCode) {
      // Truncate source code to avoid token limits
      const truncatedSource =
        sourceCode.length > 3000 ? sourceCode.substring(0, 3000) + '\n... (truncated)' : sourceCode;
      prompt += `## Source Code Context\n\`\`\`typescript\n${truncatedSource}\n\`\`\`\n\n`;
    }

    prompt += `## Analysis Request\n`;
    prompt += `1. Explain why these code sections might be uncovered (common patterns, complexity, etc.)\n`;
    prompt += `2. Suggest specific test cases to cover the gaps, with effort estimates\n`;
    prompt += `3. Assess the risk of leaving this code uncovered\n`;
    prompt += `4. Provide actionable recommendations prioritized by impact\n`;

    return prompt;
  }

  /**
   * Parse LLM response into CoverageInsights structure
   */
  private parseInsightsResponse(content: string): CoverageInsights {
    try {
      // Try to extract JSON from response (handling potential markdown fences)
      let jsonContent = content;
      const jsonMatch = content.match(/```(?:json)?\n?([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonContent);

      // Validate and normalize the response structure
      return {
        uncoveredReasoning: Array.isArray(parsed.uncoveredReasoning)
          ? parsed.uncoveredReasoning
          : [],
        suggestedTestCases: Array.isArray(parsed.suggestedTestCases)
          ? parsed.suggestedTestCases.map(this.normalizeTestCase)
          : [],
        riskAssessment: this.normalizeRiskAssessment(parsed.riskAssessment),
      };
    } catch {
      console.warn('[CoverageAnalyzer] Failed to parse LLM response as JSON');
      return this.getDefaultInsights();
    }
  }

  /**
   * Normalize a suggested test case to ensure valid structure
   */
  private normalizeTestCase(testCase: Partial<SuggestedTestCase>): SuggestedTestCase {
    return {
      name: testCase.name || 'Unnamed test',
      description: testCase.description || 'No description provided',
      type: ['unit', 'integration', 'edge-case'].includes(testCase.type as string)
        ? (testCase.type as 'unit' | 'integration' | 'edge-case')
        : 'unit',
      targetLines: Array.isArray(testCase.targetLines) ? testCase.targetLines : [],
      estimatedEffort: ['low', 'medium', 'high'].includes(testCase.estimatedEffort as string)
        ? (testCase.estimatedEffort as 'low' | 'medium' | 'high')
        : 'medium',
    };
  }

  /**
   * Normalize risk assessment to ensure valid structure
   */
  private normalizeRiskAssessment(assessment: Partial<RiskAssessment> | undefined): RiskAssessment {
    if (!assessment) {
      return {
        overallRisk: 'medium',
        riskFactors: ['Unable to determine specific risk factors'],
        businessImpact: 'Unknown - manual review recommended',
        recommendations: ['Review uncovered code paths manually'],
      };
    }

    return {
      overallRisk: ['low', 'medium', 'high', 'critical'].includes(assessment.overallRisk as string)
        ? (assessment.overallRisk as 'low' | 'medium' | 'high' | 'critical')
        : 'medium',
      riskFactors: Array.isArray(assessment.riskFactors) ? assessment.riskFactors : [],
      businessImpact: assessment.businessImpact || 'Unknown',
      recommendations: Array.isArray(assessment.recommendations) ? assessment.recommendations : [],
    };
  }

  /**
   * Get default insights when LLM is unavailable
   */
  private getDefaultInsights(): CoverageInsights {
    return {
      uncoveredReasoning: [
        'LLM analysis not available - using rule-based analysis',
        'Consider enabling LLM analysis for deeper insights',
      ],
      suggestedTestCases: [],
      riskAssessment: {
        overallRisk: 'medium',
        riskFactors: ['Unable to perform automated risk analysis'],
        businessImpact: 'Unknown - manual review recommended',
        recommendations: [
          'Enable LLM analysis for intelligent gap detection',
          'Review high-risk files manually',
          'Prioritize branch coverage for conditional logic',
        ],
      },
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

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a CoverageAnalyzerService instance with default dependencies
 * Maintains backward compatibility with existing code
 *
 * @param memory - Memory backend for vector storage and caching
 * @param config - Optional configuration overrides
 * @returns Configured CoverageAnalyzerService instance
 */
export function createCoverageAnalyzerService(
  memory: MemoryBackend,
  config: Partial<CoverageAnalyzerConfig> = {}
): CoverageAnalyzerService {
  return new CoverageAnalyzerService(memory, config);
}

/**
 * Create a CoverageAnalyzerService instance with custom dependencies
 * Used for testing or when LLM integration is needed
 *
 * @param dependencies - All service dependencies including optional LLM router
 * @param config - Optional configuration overrides
 * @returns Configured CoverageAnalyzerService instance
 */
export function createCoverageAnalyzerServiceWithDependencies(
  dependencies: CoverageAnalyzerDependencies,
  config: Partial<CoverageAnalyzerConfig> = {}
): CoverageAnalyzerService {
  return new CoverageAnalyzerService(dependencies, config);
}
