/**
 * Agentic QE v3 - Coverage Analysis Coordinator
 * Orchestrates coverage analysis workflow and domain events
 */

import { Result, ok, err, DomainName, Severity } from '../../shared/types';
import { EventBus, MemoryBackend } from '../../kernel/interfaces';
import {
  createEvent,
  CoverageAnalysisEvents,
  CoverageReportPayload,
  CoverageGapPayload,
} from '../../shared/events';
import {
  CoverageAnalysisAPI,
  AnalyzeCoverageRequest,
  CoverageReport,
  GapDetectionRequest,
  CoverageGaps,
  RiskCalculationRequest,
  RiskReport,
  TrendRequest,
  CoverageTrend,
  SimilarityRequest,
  SimilarPatterns,
  CoverageGap,
  TrendPoint,
} from './interfaces';
import {
  CoverageAnalyzerService,
  GapDetectorService,
  RiskScorerService,
} from './services';

// ============================================================================
// Coordinator Interface
// ============================================================================

export interface ICoverageAnalysisCoordinator extends CoverageAnalysisAPI {
  /** Initialize the coordinator */
  initialize(): Promise<void>;

  /** Dispose resources */
  dispose(): Promise<void>;

  /** Check if coordinator is ready */
  isReady(): boolean;
}

// ============================================================================
// Coordinator Implementation
// ============================================================================

export class CoverageAnalysisCoordinator implements ICoverageAnalysisCoordinator {
  private readonly coverageAnalyzer: CoverageAnalyzerService;
  private readonly gapDetector: GapDetectorService;
  private readonly riskScorer: RiskScorerService;
  private _initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend
  ) {
    this.coverageAnalyzer = new CoverageAnalyzerService(memory);
    this.gapDetector = new GapDetectorService(memory);
    this.riskScorer = new RiskScorerService(memory);
  }

  /**
   * Initialize the coordinator and its services
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Services are stateless, no initialization needed
    this._initialized = true;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    this._initialized = false;
  }

  /**
   * Check if coordinator is ready
   */
  isReady(): boolean {
    return this._initialized;
  }

  // ============================================================================
  // CoverageAnalysisAPI Implementation
  // ============================================================================

  /**
   * Analyze coverage report and publish results
   */
  async analyze(request: AnalyzeCoverageRequest): Promise<Result<CoverageReport, Error>> {
    try {
      const result = await this.coverageAnalyzer.analyze(request);

      if (result.success) {
        // Publish coverage report event
        await this.publishCoverageReport(result.value);
      }

      return result;
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Detect coverage gaps using O(log n) vector search
   */
  async detectGaps(request: GapDetectionRequest): Promise<Result<CoverageGaps, Error>> {
    try {
      const result = await this.gapDetector.detectGaps(request);

      if (result.success) {
        // Publish gap detection events for high-risk gaps
        await this.publishGapEvents(result.value.gaps);
      }

      return result;
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Calculate risk score for uncovered code
   */
  async calculateRisk(request: RiskCalculationRequest): Promise<Result<RiskReport, Error>> {
    try {
      const result = await this.riskScorer.calculateRisk(request);

      if (result.success && result.value.riskLevel === 'critical') {
        // Publish risk zone identified event for critical risks
        await this.publishRiskZoneEvent(result.value);
      }

      return result;
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get coverage trend over time
   */
  async getTrend(request: TrendRequest): Promise<Result<CoverageTrend, Error>> {
    try {
      const { timeRange, granularity } = request;

      // Fetch historical coverage data from memory
      const historyKeys = await this.memory.search('coverage:history:*', 100);

      if (historyKeys.length === 0) {
        return ok({
          dataPoints: [],
          trend: 'stable',
          forecast: 0,
        });
      }

      // Load and filter data points
      const dataPoints: TrendPoint[] = [];

      for (const key of historyKeys) {
        const timestamp = parseInt(key.split(':').pop() || '0', 10);
        const date = new Date(timestamp);

        if (date >= timeRange.start && date <= timeRange.end) {
          const summary = await this.memory.get<{
            line: number;
            branch: number;
            function: number;
            statement: number;
            files: number;
          }>(key);

          if (summary) {
            dataPoints.push({ date, coverage: summary });
          }
        }
      }

      // Sort by date
      dataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Aggregate by granularity
      const aggregated = this.aggregateByGranularity(dataPoints, granularity);

      // Analyze trend
      const trend = this.analyzeCoverageTrend(aggregated);

      // Forecast next coverage value
      const forecast = this.forecastCoverage(aggregated);

      return ok({
        dataPoints: aggregated,
        trend,
        forecast,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Find similar coverage patterns using vector search
   */
  async findSimilar(request: SimilarityRequest): Promise<Result<SimilarPatterns, Error>> {
    try {
      const { pattern, k } = request;
      const startTime = Date.now();

      // Create embedding for the pattern
      const embedding = this.createGapEmbedding(pattern);

      // Perform O(log n) vector search
      const results = await this.memory.vectorSearch(embedding, k);

      // Map results to gap patterns
      const patterns: Array<{ gap: CoverageGap; similarity: number }> = [];

      for (const result of results) {
        const metadata = result.metadata as {
          file?: string;
          riskScore?: number;
          severity?: Severity;
          lineCount?: number;
        } | undefined;

        if (metadata) {
          patterns.push({
            gap: {
              id: result.key,
              file: metadata.file || 'unknown',
              lines: [],
              branches: [],
              riskScore: metadata.riskScore || 0,
              severity: metadata.severity || 'low',
              recommendation: 'Similar pattern found in codebase',
            },
            similarity: result.score,
          });
        }
      }

      const searchTime = Date.now() - startTime;

      return ok({
        patterns,
        searchTime,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Event Publishing Methods
  // ============================================================================

  private async publishCoverageReport(report: CoverageReport): Promise<void> {
    const payload: CoverageReportPayload = {
      reportId: crypto.randomUUID(),
      line: report.summary.line,
      branch: report.summary.branch,
      function: report.summary.function,
      statement: report.summary.statement,
      files: report.summary.files,
    };

    const event = createEvent(
      CoverageAnalysisEvents.CoverageReportCreated,
      'coverage-analysis' as DomainName,
      payload
    );

    await this.eventBus.publish(event);
  }

  private async publishGapEvents(gaps: CoverageGap[]): Promise<void> {
    // Publish events for high-risk gaps
    const highRiskGaps = gaps.filter(
      (g) => g.severity === 'critical' || g.severity === 'high'
    );

    for (const gap of highRiskGaps) {
      const payload: CoverageGapPayload = {
        gapId: gap.id,
        file: gap.file,
        uncoveredLines: gap.lines,
        uncoveredBranches: gap.branches,
        riskScore: gap.riskScore,
      };

      const event = createEvent(
        CoverageAnalysisEvents.CoverageGapDetected,
        'coverage-analysis' as DomainName,
        payload
      );

      await this.eventBus.publish(event);
    }
  }

  private async publishRiskZoneEvent(riskReport: RiskReport): Promise<void> {
    const event = createEvent(
      CoverageAnalysisEvents.RiskZoneIdentified,
      'coverage-analysis' as DomainName,
      {
        file: riskReport.file,
        overallRisk: riskReport.overallRisk,
        riskLevel: riskReport.riskLevel,
        topFactors: riskReport.factors.slice(0, 3).map((f) => f.name),
        recommendations: riskReport.recommendations,
      }
    );

    await this.eventBus.publish(event);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private aggregateByGranularity(
    dataPoints: TrendPoint[],
    granularity: 'daily' | 'weekly' | 'monthly'
  ): TrendPoint[] {
    if (dataPoints.length === 0) return [];

    const buckets = new Map<string, TrendPoint[]>();

    for (const point of dataPoints) {
      const key = this.getBucketKey(point.date, granularity);
      const existing = buckets.get(key) || [];
      existing.push(point);
      buckets.set(key, existing);
    }

    const aggregated: TrendPoint[] = [];

    for (const [, points] of buckets) {
      if (points.length > 0) {
        // Average the coverage metrics
        const avgCoverage = {
          line: points.reduce((sum, p) => sum + p.coverage.line, 0) / points.length,
          branch: points.reduce((sum, p) => sum + p.coverage.branch, 0) / points.length,
          function: points.reduce((sum, p) => sum + p.coverage.function, 0) / points.length,
          statement: points.reduce((sum, p) => sum + p.coverage.statement, 0) / points.length,
          files: Math.round(points.reduce((sum, p) => sum + p.coverage.files, 0) / points.length),
        };

        aggregated.push({
          date: points[0].date,
          coverage: avgCoverage,
        });
      }
    }

    return aggregated.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private getBucketKey(date: Date, granularity: 'daily' | 'weekly' | 'monthly'): string {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    switch (granularity) {
      case 'daily':
        return `${year}-${month}-${day}`;
      case 'weekly':
        const weekNum = Math.floor(day / 7);
        return `${year}-${month}-W${weekNum}`;
      case 'monthly':
        return `${year}-${month}`;
    }
  }

  private analyzeCoverageTrend(
    dataPoints: TrendPoint[]
  ): 'improving' | 'declining' | 'stable' {
    if (dataPoints.length < 2) return 'stable';

    // Calculate overall coverage for each point
    const coverages = dataPoints.map((p) => {
      const c = p.coverage;
      return (c.line + c.branch + c.function + c.statement) / 4;
    });

    // Simple linear regression
    const n = coverages.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += coverages[i];
      sumXY += i * coverages[i];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    if (slope > 0.5) return 'improving';
    if (slope < -0.5) return 'declining';
    return 'stable';
  }

  private forecastCoverage(dataPoints: TrendPoint[]): number {
    if (dataPoints.length === 0) return 0;

    // Calculate overall coverage for each point
    const coverages = dataPoints.map((p) => {
      const c = p.coverage;
      return (c.line + c.branch + c.function + c.statement) / 4;
    });

    if (coverages.length === 1) return coverages[0];

    // Exponential moving average forecast
    const alpha = 0.3;
    let forecast = coverages[0];

    for (let i = 1; i < coverages.length; i++) {
      forecast = alpha * coverages[i] + (1 - alpha) * forecast;
    }

    // Adjust based on trend
    const trend = this.analyzeCoverageTrend(dataPoints);
    if (trend === 'improving') {
      forecast = Math.min(100, forecast + 2);
    } else if (trend === 'declining') {
      forecast = Math.max(0, forecast - 2);
    }

    return forecast;
  }

  private createGapEmbedding(gap: CoverageGap): number[] {
    const VECTOR_DIMENSION = 128;
    const embedding = new Array(VECTOR_DIMENSION).fill(0);

    // Encode gap characteristics
    embedding[0] = gap.riskScore;
    embedding[1] = Math.min(1, gap.lines.length / 100);
    embedding[2] = Math.min(1, gap.branches.length / 20);
    embedding[3] = this.severityToNumber(gap.severity) / 4;

    // Encode file path characteristics
    const pathHash = gap.file.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    embedding[4] = (pathHash % 1000) / 1000;

    // Fill remaining with derived features
    for (let i = 5; i < VECTOR_DIMENSION; i++) {
      embedding[i] = Math.sin(i * gap.riskScore) * 0.5 + 0.5;
    }

    return embedding;
  }

  private severityToNumber(severity: Severity): number {
    switch (severity) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'medium':
        return 2;
      case 'low':
        return 1;
      default:
        return 0;
    }
  }
}
