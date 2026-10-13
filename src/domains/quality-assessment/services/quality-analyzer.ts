/**
 * Agentic QE v3 - Quality Analyzer Service
 * Comprehensive quality metrics analysis with trends and recommendations
 */

import { LoggerFactory } from '../../../logging/index.js';
import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, QualityScore } from '../../../shared/types';
import { CodeMetricsAnalyzer, getCodeMetricsAnalyzer } from '../../../shared/metrics';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  QualityAnalysisRequest,
  QualityReport,
  QualityMetricDetail,
  QualityTrend,
  Recommendation,
  ComplexityRequest,
  ComplexityReport,
  FileComplexity,
  ComplexitySummary,
  ComplexityHotspot,
  LLMQualityInsights,
  UnmeasuredQualityMetric,
} from '../interfaces';

// ADR-051: LLM Router for AI-enhanced quality insights
import type { HybridRouter, ChatResponse } from '../../../shared/llm';
import { toError } from '../../../shared/error-utils.js';
import { safeJsonParse } from '../../../shared/safe-json.js';
import { getClaudeModelForTier } from '../../../shared/llm/model-registry.js';

/**
 * Interface for the quality analyzer service
 */
export interface IQualityAnalyzerService {
  analyzeQuality(request: QualityAnalysisRequest): Promise<Result<QualityReport, Error>>;
  analyzeComplexity(request: ComplexityRequest): Promise<Result<ComplexityReport, Error>>;
  getQualityTrend(metric: string, days: number): Promise<Result<QualityTrend, Error>>;
}

/**
 * Configuration for quality analysis
 */
export interface QualityAnalyzerConfig {
  enableTrendAnalysis: boolean;
  trendDataPointsMin: number;
  complexityThresholds: {
    cyclomatic: { warning: number; critical: number };
    cognitive: { warning: number; critical: number };
    maintainability: { warning: number; critical: number };
  };
  /** ADR-051: Enable LLM-powered quality insights */
  enableLLMInsights?: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier?: number;
  /** ADR-051: Max tokens for LLM responses */
  llmMaxTokens?: number;
}

/**
 * Dependencies for QualityAnalyzerService
 * Enables dependency injection and testing
 */
export interface QualityAnalyzerDependencies {
  memory: MemoryBackend;
  /** ADR-051: Optional LLM router for AI-enhanced quality insights */
  llmRouter?: HybridRouter;
  /** Code metrics analyzer (defaults to the shared instance). */
  metricsAnalyzer?: CodeMetricsAnalyzer;
}

/** Metrics the static analyzer produces when the caller asks for all of them. */
const ANALYZER_METRICS = ['coverage', 'complexity', 'maintainability', 'duplication', 'testability'] as const;
/** Metrics computed from parsing each source file. */
const PARSED_METRICS = new Set(['complexity', 'maintainability', 'testability', 'duplication']);
/** #1011: the sentinel for "not measured" in score and complexity fields. */
const UNMEASURED = -1;

/** Per-file metric values plus the requested metrics that could not be measured. */
interface CollectedMetrics {
  fileMetrics: Map<string, Record<string, number>>;
  unmeasured: UnmeasuredQualityMetric[];
}

const DEFAULT_CONFIG: QualityAnalyzerConfig = {
  enableTrendAnalysis: true,
  trendDataPointsMin: 3,
  complexityThresholds: {
    cyclomatic: { warning: 10, critical: 20 },
    cognitive: { warning: 15, critical: 30 },
    maintainability: { warning: 50, critical: 30 }, // Lower is worse
  },
  enableLLMInsights: true, // On by default - opt-out
  llmModelTier: 2, // Sonnet by default
  llmMaxTokens: 2048,
};

/**
 * Metric rating thresholds
 */
const RATING_THRESHOLDS = {
  A: 90,
  B: 80,
  C: 70,
  D: 50,
  E: 0,
} as const;

/**
 * Quality Analyzer Service Implementation
 * Analyzes code quality metrics and provides actionable insights
 *
 * ADR-051: Added LLM enhancement for AI-powered quality insights
 */
const logger = LoggerFactory.create('quality-assessment/quality-analyzer');

export class QualityAnalyzerService implements IQualityAnalyzerService {
  private readonly config: QualityAnalyzerConfig;
  private readonly metricsAnalyzer: CodeMetricsAnalyzer;
  private readonly memory: MemoryBackend;
  private readonly llmRouter?: HybridRouter;

  /**
   * Creates a QualityAnalyzerService instance
   *
   * Supports two constructor signatures for backward compatibility:
   * 1. Old: (memory: MemoryBackend, config?: Partial<QualityAnalyzerConfig>)
   * 2. New: (dependencies: QualityAnalyzerDependencies, config?: Partial<QualityAnalyzerConfig>)
   */
  constructor(
    memoryOrDependencies: MemoryBackend | QualityAnalyzerDependencies,
    config: Partial<QualityAnalyzerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Support both old and new constructor signatures
    if ('memory' in memoryOrDependencies) {
      // New signature: dependencies object
      this.memory = memoryOrDependencies.memory;
      this.llmRouter = memoryOrDependencies.llmRouter;
      this.metricsAnalyzer = memoryOrDependencies.metricsAnalyzer ?? getCodeMetricsAnalyzer();
    } else {
      this.metricsAnalyzer = getCodeMetricsAnalyzer();
      // Old signature: direct MemoryBackend
      this.memory = memoryOrDependencies;
      this.llmRouter = undefined;
    }
  }

  // ============================================================================
  // ADR-051: LLM Enhancement Methods
  // ============================================================================

  /**
   * Check if LLM insights are available and enabled
   */
  private isLLMInsightsAvailable(): boolean {
    return this.config.enableLLMInsights === true && this.llmRouter !== undefined;
  }

  /**
   * Get model ID for the configured tier
   */
  private getModelForTier(tier: number): string {
    return getClaudeModelForTier(tier);
  }

  /**
   * Generate quality insights using LLM
   * Provides AI-powered explanation and prioritized recommendations
   */
  async generateQualityInsightsWithLLM(
    metrics: QualityMetricDetail[],
    score: QualityScore,
    codeContext?: string,
    unmeasured: UnmeasuredQualityMetric[] = []
  ): Promise<LLMQualityInsights | null> {
    if (!this.llmRouter) return null;

    try {
      const prompt = this.buildQualityInsightsPrompt(metrics, score, codeContext, unmeasured);
      const modelId = this.getModelForTier(this.config.llmModelTier ?? 2);

      const response: ChatResponse = await this.llmRouter.chat({
        messages: [
          {
            role: 'system',
            content: `You are an expert software quality engineer. Analyze quality metrics and provide actionable insights.

Your response MUST be valid JSON with this exact structure:
{
  "explanation": "string - natural language explanation of quality issues",
  "prioritizedRecommendations": [
    {
      "priority": number (1 is highest),
      "title": "string",
      "description": "string",
      "estimatedImpact": "high" | "medium" | "low",
      "estimatedEffort": "high" | "medium" | "low"
    }
  ],
  "estimatedImpactOnScore": number (points improvement if recommendations followed),
  "keySummary": "string - brief summary of key findings"
}

Focus on:
1. Root cause analysis of quality issues
2. Prioritized, actionable recommendations
3. Realistic impact estimates
4. Practical effort assessments`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: modelId,
        maxTokens: this.config.llmMaxTokens ?? 2048,
        temperature: 0.3, // Low temperature for consistent analysis
        // Issue #568: per-agent routing rules (including the user's on-disk
        // `agentOverrides`) match on `agentType`; without it an override for
        // this agent never fires.
        agentType: 'qe-quality-gate',
      });

      if (response.content && response.content.length > 0) {
        return this.parseQualityInsightsResponse(response.content);
      }

      return null;
    } catch (error) {
      logger.warn('LLM insights generation failed:');
      return null;
    }
  }

  /**
   * Build prompt for quality insights generation
   */
  private buildQualityInsightsPrompt(
    metrics: QualityMetricDetail[],
    score: QualityScore,
    codeContext?: string,
    unmeasured: UnmeasuredQualityMetric[] = []
  ): string {
    let prompt = `## Quality Analysis Results\n\n`;
    prompt += score.overall >= 0
      ? `### Overall Score: ${score.overall}/100\n\n`
      : `### Overall Score: not measured\n\n`;

    prompt += `### Detailed Metrics:\n`;
    for (const metric of metrics) {
      prompt += `- **${metric.name}**: ${metric.value} (Rating: ${metric.rating}, Trend: ${metric.trend})\n`;
    }
    for (const missing of unmeasured) {
      prompt += `- **${missing.metric}**: not measured (${missing.reason})\n`;
    }
    prompt += `\n`;

    // #996: -1 means "not measured"; never present it to the model as a value.
    const show = (value: number, unit = ''): string => (value >= 0 ? `${value}${unit}` : 'not measured');
    prompt += `### Score Breakdown:\n`;
    prompt += `- Coverage: ${show(score.coverage, '%')}\n`;
    prompt += `- Complexity: ${show(score.complexity)}\n`;
    prompt += `- Maintainability: ${show(score.maintainability)}\n`;
    prompt += `- Security: ${show(score.security)}\n\n`;

    if (codeContext) {
      prompt += `### Code Context:\n\`\`\`\n${codeContext.slice(0, 2000)}\n\`\`\`\n\n`;
    }

    prompt += `## Task\n`;
    prompt += `Analyze these quality metrics and provide:\n`;
    prompt += `1. A clear explanation of the quality issues identified\n`;
    prompt += `2. Prioritized recommendations for improvement (most impactful first)\n`;
    prompt += `3. Estimated impact on quality score if recommendations are followed\n`;
    prompt += `4. A brief summary of key findings\n`;

    return prompt;
  }

  /**
   * Parse LLM response into structured insights
   */
  private parseQualityInsightsResponse(content: string): LLMQualityInsights | null {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = safeJsonParse(jsonMatch[0]);

        // Validate required fields
        if (
          typeof parsed.explanation === 'string' &&
          Array.isArray(parsed.prioritizedRecommendations) &&
          typeof parsed.estimatedImpactOnScore === 'number' &&
          typeof parsed.keySummary === 'string'
        ) {
          return {
            explanation: parsed.explanation,
            prioritizedRecommendations: parsed.prioritizedRecommendations.map(
              (rec: {
                priority?: number;
                title?: string;
                description?: string;
                estimatedImpact?: string;
                estimatedEffort?: string;
              }, index: number) => ({
                priority: rec.priority ?? index + 1,
                title: rec.title ?? 'Recommendation',
                description: rec.description ?? '',
                estimatedImpact: this.normalizeImpact(rec.estimatedImpact),
                estimatedEffort: this.normalizeEffort(rec.estimatedEffort),
              })
            ),
            estimatedImpactOnScore: parsed.estimatedImpactOnScore,
            keySummary: parsed.keySummary,
          };
        }
      }
      return null;
    } catch (error) {
      logger.warn('Failed to parse LLM insights response:');
      return null;
    }
  }

  /**
   * Normalize impact value to valid type
   */
  private normalizeImpact(value?: string): 'high' | 'medium' | 'low' {
    const normalized = value?.toLowerCase();
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
      return normalized;
    }
    return 'medium';
  }

  /**
   * Normalize effort value to valid type
   */
  private normalizeEffort(value?: string): 'high' | 'medium' | 'low' {
    const normalized = value?.toLowerCase();
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
      return normalized;
    }
    return 'medium';
  }

  /**
   * Analyze quality metrics for source files
   */
  async analyzeQuality(
    request: QualityAnalysisRequest
  ): Promise<Result<QualityReport, Error>> {
    try {
      const { sourceFiles, includeMetrics, compareBaseline } = request;

      if (sourceFiles.length === 0) {
        return err(new Error('No source files provided for analysis'));
      }

      // Analyze metrics for each file; failures become unmeasured (#1011)
      const { fileMetrics, unmeasured } = await this.collectFileMetrics(sourceFiles, includeMetrics);

      // Calculate aggregated metrics
      const metricDetails = this.aggregateMetrics(fileMetrics);

      // Calculate overall quality score
      const score = this.calculateQualityScore(metricDetails);

      // Generate trends if enabled
      const trends = this.config.enableTrendAnalysis
        ? await this.generateTrends(metricDetails, compareBaseline)
        : [];

      // Generate recommendations based on metrics
      const recommendations = this.generateRecommendations(metricDetails, score);

      // ADR-051: Generate LLM insights if enabled
      let llmInsights: LLMQualityInsights | undefined;
      if (this.isLLMInsightsAvailable()) {
        const insights = await this.generateQualityInsightsWithLLM(metricDetails, score, undefined, unmeasured);
        if (insights) {
          llmInsights = insights;
        }
      }

      const report: QualityReport = {
        score,
        metrics: metricDetails,
        trends,
        recommendations,
        llmInsights,
        unmeasured,
      };

      // Store the report
      await this.storeReport(report, sourceFiles);

      return ok(report);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Analyze code complexity
   */
  async analyzeComplexity(
    request: ComplexityRequest
  ): Promise<Result<ComplexityReport, Error>> {
    try {
      const { sourceFiles, metrics: requestedMetrics } = request;

      if (sourceFiles.length === 0) {
        return err(new Error('No source files provided for complexity analysis'));
      }

      // Analyze each file
      const files: FileComplexity[] = [];
      for (const file of sourceFiles) {
        const complexity = await this.analyzeFileComplexity(file, requestedMetrics);
        files.push(complexity);
      }

      // Calculate summary
      const summary = this.calculateComplexitySummary(files);

      // Identify hotspots
      const hotspots = this.identifyHotspots(files);

      const report: ComplexityReport = {
        files,
        summary,
        hotspots,
      };

      // Store complexity report
      await this.storeComplexityReport(report);

      return ok(report);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get quality trend for a specific metric
   */
  async getQualityTrend(
    metric: string,
    days: number
  ): Promise<Result<QualityTrend, Error>> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Fetch historical data points
      const keys = await this.memory.search(
        `quality-analysis:report:*`,
        days * 10 // Assume multiple reports per day max
      );

      const dataPoints: { date: Date; value: number }[] = [];

      for (const key of keys) {
        const report = await this.memory.get<{
          analyzedAt: string;
          metrics: QualityMetricDetail[];
        }>(key);

        if (report) {
          const reportDate = new Date(report.analyzedAt);
          if (reportDate >= startDate) {
            const metricDetail = report.metrics.find((m) => m.name === metric);
            if (metricDetail) {
              dataPoints.push({
                date: reportDate,
                value: metricDetail.value,
              });
            }
          }
        }
      }

      // Sort by date
      dataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Determine direction
      const direction = this.calculateTrendDirection(dataPoints);

      return ok({
        metric,
        dataPoints,
        direction,
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Collect per-file metric values. #1011: a file that cannot be read or parsed,
   * a failed duplication detection, or missing coverage data makes the affected
   * metric UNMEASURED (omitted, with a reason) — never a fixed fallback value.
   * A parsed metric is measured only when every file in scope was analysed.
   */
  private async collectFileMetrics(
    files: string[],
    includeMetrics: string[]
  ): Promise<CollectedMetrics> {
    const requested: string[] = includeMetrics.length === 0 ? [...ANALYZER_METRICS] : includeMetrics;
    const wants = (metric: string): boolean => requested.includes(metric);
    const fileMetrics = new Map<string, Record<string, number>>();
    const unmeasured: UnmeasuredQualityMetric[] = [];
    const failures: Array<{ file: string; reason: string }> = [];
    const missingCoverage: string[] = [];

    for (const file of files) {
      const metrics: Record<string, number> = {};
      fileMetrics.set(file, metrics);

      if (wants('coverage')) {
        // Coverage requires external data (from test runners) — never fabricate a number
        const storedCoverage = await this.getStoredCoverage(file);
        if (storedCoverage !== null) {
          metrics.coverage = storedCoverage;
        } else {
          missingCoverage.push(file);
        }
      }

      if (!requested.some((m) => PARSED_METRICS.has(m))) continue;
      const { metrics: analysis, unmeasuredReason } = await this.metricsAnalyzer.analyzeFileDetailed(file);
      if (!analysis || unmeasuredReason) {
        failures.push({ file, reason: unmeasuredReason ?? `${file} could not be analysed` });
        continue;
      }
      if (wants('complexity')) metrics.complexity = analysis.cyclomaticComplexity;
      if (wants('maintainability')) metrics.maintainability = analysis.maintainabilityIndex;
      if (wants('testability')) {
        // Testability is derived from complexity and maintainability
        // Lower complexity and higher maintainability = higher testability
        const complexityFactor = Math.max(0, 100 - analysis.cyclomaticComplexity * 3);
        const maintainabilityFactor = analysis.maintainabilityIndex;
        metrics.testability = Math.round((complexityFactor * 0.4 + maintainabilityFactor * 0.6) * 100) / 100;
      }
    }

    if (missingCoverage.length > 0) {
      for (const metrics of fileMetrics.values()) delete metrics.coverage;
      unmeasured.push({
        metric: 'coverage',
        reason: `no measured coverage recorded for ${missingCoverage.length} of ${files.length} file(s)`,
      });
    }

    if (failures.length > 0) {
      // A partial average would claim to describe files it never saw.
      const reason = `${failures.length} of ${files.length} file(s) could not be analysed: `
        + failures.slice(0, 3).map((f) => f.reason).join('; ')
        + (failures.length > 3 ? `; and ${failures.length - 3} more` : '');
      for (const metric of requested.filter((m) => PARSED_METRICS.has(m))) {
        for (const metrics of fileMetrics.values()) delete metrics[metric];
        unmeasured.push({ metric, reason, files: failures.map((f) => f.file) });
      }
    } else if (wants('duplication')) {
      try {
        const { percentage } = await this.metricsAnalyzer.detectDuplication(files);
        for (const metrics of fileMetrics.values()) metrics.duplication = percentage;
      } catch (error) {
        unmeasured.push({ metric: 'duplication', reason: `duplication detection failed: ${toError(error).message}` });
      }
    }

    return { fileMetrics, unmeasured };
  }

  private async getStoredCoverage(file: string): Promise<number | null> {
    try {
      // 1. Try per-file coverage stored by test executor
      const fileCoverage = await this.memory.get<{ line: number }>(
        `coverage:file:${file}`
      );
      if (fileCoverage && typeof fileCoverage.line === 'number') {
        return fileCoverage.line;
      }

      // 2. Fall back to project-wide summary from coverage-analyzer
      const summary = await this.memory.get<{ line: number }>(
        'coverage:latest'
      );
      if (summary && typeof summary.line === 'number') {
        return summary.line;
      }

      // No coverage data available — return null (never fabricate)
      return null;
    } catch {
      return null;
    }
  }

  private aggregateMetrics(
    fileMetrics: Map<string, Record<string, number>>
  ): QualityMetricDetail[] {
    const aggregated: Map<string, number[]> = new Map();

    // Collect all values per metric
    for (const metrics of fileMetrics.values()) {
      for (const [name, value] of Object.entries(metrics)) {
        const existing = aggregated.get(name) || [];
        existing.push(value);
        aggregated.set(name, existing);
      }
    }

    // Calculate averages and generate details
    const details: QualityMetricDetail[] = [];

    for (const [name, values] of aggregated.entries()) {
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      const rating = this.getMetricRating(average, name);
      const trend = this.estimateTrend(values);

      details.push({
        name,
        value: Math.round(average * 100) / 100,
        rating,
        trend,
      });
    }

    return details;
  }

  private calculateQualityScore(metrics: QualityMetricDetail[]): QualityScore {
    // Weight different metrics for overall score
    const weights: Record<string, number> = {
      coverage: 0.25,
      complexity: 0.20,
      maintainability: 0.25,
      duplication: 0.15,
      testability: 0.15,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const metric of metrics) {
      const weight = weights[metric.name] || 0.1;
      // Normalize value to 0-100 scale (complexity needs inversion)
      const normalizedValue = metric.name === 'complexity' || metric.name === 'duplication'
        ? Math.max(0, 100 - metric.value * 2)
        : metric.value;

      weightedSum += normalizedValue * weight;
      totalWeight += weight;
    }

    // #1011: no measured metric means no score — -1, never 0.
    const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : UNMEASURED;

    // Use -1 to signal "no data available" rather than 0 which implies "0% coverage"
    // (#996: the same holds for every score field — never fabricate a value).
    const valueOf = (name: string): number => metrics.find((m) => m.name === name)?.value ?? UNMEASURED;
    return {
      overall,
      coverage: valueOf('coverage'),
      complexity: valueOf('complexity'),
      maintainability: valueOf('maintainability'),
      // No security analysis runs here; -1 = not measured (was a fixed 85 placeholder).
      security: UNMEASURED,
    };
  }

  private async generateTrends(
    currentMetrics: QualityMetricDetail[],
    _compareBaseline?: string
  ): Promise<QualityTrend[]> {
    const trends: QualityTrend[] = [];

    for (const metric of currentMetrics) {
      // Fetch historical data
      const historicalResult = await this.getQualityTrend(metric.name, 30);

      if (historicalResult.success) {
        trends.push(historicalResult.value);
      } else {
        // Create a trend with just current data
        trends.push({
          metric: metric.name,
          dataPoints: [{ date: new Date(), value: metric.value }],
          direction: 'stable',
        });
      }
    }

    return trends;
  }

  private generateRecommendations(
    metrics: QualityMetricDetail[],
    score: QualityScore
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Check coverage
    const coverage = metrics.find((m) => m.name === 'coverage');
    if (coverage && coverage.value < 80) {
      recommendations.push({
        type: coverage.value < 60 ? 'critical' : 'improvement',
        title: 'Increase Test Coverage',
        description: `Current coverage is ${coverage.value}%. Aim for at least 80% coverage to ensure code reliability.`,
        impact: 'high',
        effort: coverage.value < 60 ? 'high' : 'medium',
      });
    }

    // Check complexity
    const complexity = metrics.find((m) => m.name === 'complexity');
    if (complexity && complexity.value > this.config.complexityThresholds.cyclomatic.warning) {
      recommendations.push({
        type: complexity.value > this.config.complexityThresholds.cyclomatic.critical ? 'critical' : 'warning',
        title: 'Reduce Code Complexity',
        description: `Average cyclomatic complexity is ${complexity.value}. Consider refactoring complex functions.`,
        impact: 'high',
        effort: 'medium',
      });
    }

    // Check maintainability
    const maintainability = metrics.find((m) => m.name === 'maintainability');
    if (maintainability && maintainability.value < this.config.complexityThresholds.maintainability.warning) {
      recommendations.push({
        type: maintainability.value < this.config.complexityThresholds.maintainability.critical ? 'critical' : 'warning',
        title: 'Improve Maintainability',
        description: `Maintainability index is ${maintainability.value}. Consider improving code structure and documentation.`,
        impact: 'medium',
        effort: 'medium',
      });
    }

    // Check duplication
    const duplication = metrics.find((m) => m.name === 'duplication');
    if (duplication && duplication.value > 5) {
      recommendations.push({
        type: duplication.value > 10 ? 'warning' : 'improvement',
        title: 'Reduce Code Duplication',
        description: `${duplication.value}% of code is duplicated. Extract common patterns into reusable functions.`,
        impact: 'medium',
        effort: 'low',
      });
    }

    // Overall score recommendation
    if (score.overall >= 0 && score.overall < 70) {
      recommendations.push({
        type: 'critical',
        title: 'Overall Quality Improvement Needed',
        description: `Overall quality score is ${score.overall}. Multiple areas need attention to bring code quality to acceptable levels.`,
        impact: 'high',
        effort: 'high',
      });
    }

    return recommendations.sort((a, b) => {
      const typePriority = { critical: 0, warning: 1, improvement: 2 };
      return typePriority[a.type] - typePriority[b.type];
    });
  }

  private async analyzeFileComplexity(
    file: string,
    requestedMetrics: ComplexityRequest['metrics']
  ): Promise<FileComplexity> {
    const includesAll = requestedMetrics.length === 0;
    const wants = (metric: ComplexityRequest['metrics'][number]): boolean =>
      includesAll || requestedMetrics.includes(metric);

    // Use real CodeMetricsAnalyzer for file analysis
    const { metrics: analysis, unmeasuredReason } = await this.metricsAnalyzer.analyzeFileDetailed(file);

    if (!analysis || unmeasuredReason) {
      // #1011: never invent values for a file that could not be analysed
      return {
        path: file,
        cyclomatic: UNMEASURED,
        cognitive: UNMEASURED,
        maintainability: UNMEASURED,
        linesOfCode: UNMEASURED,
        unmeasuredReason: unmeasuredReason ?? `${file} could not be analysed`,
      };
    }

    // A metric that was not requested is not measured (-1), not 0 — a 0
    // maintainability would otherwise be reported as a critical hotspot.
    return {
      path: file,
      cyclomatic: wants('cyclomatic') ? analysis.cyclomaticComplexity : UNMEASURED,
      cognitive: wants('cognitive') ? analysis.cognitiveComplexity : UNMEASURED,
      maintainability: wants('maintainability') ? analysis.maintainabilityIndex : UNMEASURED,
      linesOfCode: analysis.linesOfCode,
    };
  }

  private calculateComplexitySummary(files: FileComplexity[]): ComplexitySummary {
    // #1011: average measured values only; -1 when nothing was measured.
    const average = (values: number[]): number => {
      const measured = values.filter((v) => v >= 0);
      if (measured.length === 0) return UNMEASURED;
      return Math.round((measured.reduce((sum, v) => sum + v, 0) / measured.length) * 100) / 100;
    };

    return {
      averageCyclomatic: average(files.map((f) => f.cyclomatic)),
      averageCognitive: average(files.map((f) => f.cognitive)),
      averageMaintainability: average(files.map((f) => f.maintainability)),
      totalLinesOfCode: files.reduce((sum, f) => sum + Math.max(0, f.linesOfCode), 0),
    };
  }

  private identifyHotspots(files: FileComplexity[]): ComplexityHotspot[] {
    const hotspots: ComplexityHotspot[] = [];
    const thresholds = this.config.complexityThresholds;

    for (const file of files) {
      // Check cyclomatic complexity
      if (file.cyclomatic >= thresholds.cyclomatic.warning) {
        hotspots.push({
          file: file.path,
          function: 'unknown', // Would be identified via AST analysis
          complexity: file.cyclomatic,
          recommendation: file.cyclomatic >= thresholds.cyclomatic.critical
            ? 'Critical: Refactor this function immediately. Consider splitting into smaller functions.'
            : 'Consider refactoring to reduce complexity.',
        });
      }

      // Check cognitive complexity
      if (file.cognitive >= thresholds.cognitive.warning) {
        hotspots.push({
          file: file.path,
          function: 'unknown',
          complexity: file.cognitive,
          recommendation: file.cognitive >= thresholds.cognitive.critical
            ? 'Critical: High cognitive complexity makes this code hard to understand and maintain.'
            : 'Simplify control flow and reduce nesting depth.',
        });
      }

      // Check maintainability (lower is worse); -1 = not measured, never a hotspot
      if (file.maintainability >= 0 && file.maintainability <= thresholds.maintainability.warning) {
        hotspots.push({
          file: file.path,
          function: 'unknown',
          complexity: 100 - file.maintainability, // Invert for hotspot (higher = worse)
          recommendation: file.maintainability <= thresholds.maintainability.critical
            ? 'Critical: Very low maintainability. Consider a major refactoring effort.'
            : 'Improve code documentation and reduce complexity.',
        });
      }
    }

    // Sort by complexity descending
    return hotspots.sort((a, b) => b.complexity - a.complexity).slice(0, 10);
  }

  private getMetricRating(
    value: number,
    metricName: string
  ): 'A' | 'B' | 'C' | 'D' | 'E' {
    // For metrics where lower is better, invert the value
    const invertedMetrics = ['complexity', 'duplication'];
    const normalizedValue = invertedMetrics.includes(metricName)
      ? Math.max(0, 100 - value * 2)
      : value;

    if (normalizedValue >= RATING_THRESHOLDS.A) return 'A';
    if (normalizedValue >= RATING_THRESHOLDS.B) return 'B';
    if (normalizedValue >= RATING_THRESHOLDS.C) return 'C';
    if (normalizedValue >= RATING_THRESHOLDS.D) return 'D';
    return 'E';
  }

  private estimateTrend(values: number[]): 'improving' | 'declining' | 'stable' {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;
    const threshold = firstAvg * 0.05; // 5% change threshold

    if (diff > threshold) return 'improving';
    if (diff < -threshold) return 'declining';
    return 'stable';
  }

  private calculateTrendDirection(
    dataPoints: { date: Date; value: number }[]
  ): 'up' | 'down' | 'stable' {
    if (dataPoints.length < this.config.trendDataPointsMin) {
      return 'stable';
    }

    const values = dataPoints.map((dp) => dp.value);
    const trend = this.estimateTrend(values);

    switch (trend) {
      case 'improving': return 'up';
      case 'declining': return 'down';
      default: return 'stable';
    }
  }

  private async storeReport(
    report: QualityReport,
    sourceFiles: string[]
  ): Promise<void> {
    const reportId = uuidv4();
    const key = `quality-analysis:report:${reportId}`;

    await this.memory.set(
      key,
      {
        id: reportId,
        ...report,
        sourceFiles,
        analyzedAt: new Date().toISOString(),
      },
      { namespace: 'quality-assessment', ttl: 86400 * 90 } // 90 days
    );
  }

  private async storeComplexityReport(report: ComplexityReport): Promise<void> {
    const reportId = uuidv4();
    const key = `quality-analysis:complexity:${reportId}`;

    await this.memory.set(
      key,
      {
        id: reportId,
        ...report,
        analyzedAt: new Date().toISOString(),
      },
      { namespace: 'quality-assessment', ttl: 86400 * 30 } // 30 days
    );
  }
}
