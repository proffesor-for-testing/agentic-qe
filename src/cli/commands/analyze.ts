import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { AnalyzeOptions } from '../../types';
import { ProcessExit } from '../../utils/ProcessExit';

// ============================================================================
// Type Definitions for Analysis Command
// ============================================================================

/** Valid analysis target types */
type AnalysisTarget = 'coverage' | 'quality' | 'trends' | 'gaps';

/** Valid report format types */
type ReportFormat = 'json' | 'html' | 'csv' | 'all';

/** Severity levels for issues and gaps */
type Severity = 'low' | 'medium' | 'high';

/** Priority levels for recommendations */
type Priority = 'low' | 'medium' | 'high';

/** Trend direction indicators */
type TrendDirection = 'improving' | 'declining' | 'stable';

/** Coverage details by file path */
interface CoverageDetails {
  [filePath: string]: number;
}

/** Test execution summary */
interface ExecutionSummary {
  total: number;
  passed: number;
  failed: number;
  skipped?: number;
  duration?: number;
}

/** Coverage data structure */
interface CoverageData {
  overall: number;
  details?: CoverageDetails;
}

/** Individual test execution report loaded from JSON files */
interface ExecutionReport {
  timestamp: string;
  summary?: ExecutionSummary;
  coverage?: CoverageData;
  errors?: string[];
}

/** Loaded test data from reports directory */
interface TestData {
  latest: ExecutionReport | null;
  history: ExecutionReport[];
  coverage: CoverageData[];
  quality: QualityMetricsData[];
}

/** Quality metrics data structure */
interface QualityMetricsData {
  passRate: number;
  testReliability: number;
  flakyTests: number;
  testMaintainability: number;
  qualityScore: number;
  coverage?: number;
}

/** Trend data point with timestamp and value */
interface TrendDataPoint {
  timestamp: string;
  value: number;
}

/** Trends collection for different metrics */
interface TrendsCollection {
  coverage: TrendDataPoint[];
  passRate: TrendDataPoint[];
  testCount: TrendDataPoint[];
  executionTime: TrendDataPoint[];
}

/** Trend calculation result */
interface TrendResult {
  direction: TrendDirection;
  change: number;
}

/** Current coverage state */
interface CurrentCoverage {
  overall: number;
  details: CoverageDetails;
}

/** Coverage trends information */
interface CoverageTrends {
  direction: TrendDirection;
  change: number;
  period: string;
}

/** Coverage analysis result */
interface CoverageAnalysis {
  type: 'coverage';
  timestamp: string;
  current: CurrentCoverage;
  trends: CoverageTrends;
  gaps: Gap[];
  recommendations: Recommendation[];
}

/** Quality metrics for analysis */
interface QualityMetrics {
  testReliability: number;
  passRate: number;
  flakyTests: number;
  testMaintainability: number;
  qualityScore: number;
}

/** Quality trends information */
interface QualityTrends {
  direction: TrendDirection;
  period: string;
  changes: Record<string, number>;
}

/** Quality analysis result */
interface QualityAnalysis {
  type: 'quality';
  timestamp: string;
  metrics: QualityMetrics;
  trends: QualityTrends;
  issues: QualityIssue[];
  recommendations: Recommendation[];
}

/** Trends analysis result */
interface TrendsAnalysis {
  type: 'trends';
  timestamp: string;
  period: string;
  trends: TrendsCollection;
  insights: Insight[];
  predictions: Prediction[];
}

/** Gaps analysis result */
interface GapsAnalysis {
  type: 'gaps';
  timestamp: string;
  coverageGaps: Gap[];
  testingGaps: Gap[];
  qualityGaps: Gap[];
  recommendations: Recommendation[];
}

/** Comprehensive analysis summary */
interface ComprehensiveSummary {
  overallScore: number;
  criticalIssues: Array<QualityIssue | Gap>;
  topRecommendations: Recommendation[];
}

/** Comprehensive analysis result (all analysis types combined) */
interface ComprehensiveAnalysis {
  type: 'comprehensive';
  timestamp: string;
  coverage: CoverageAnalysis;
  quality: QualityAnalysis;
  trends: TrendsAnalysis;
  gaps: GapsAnalysis;
  summary: ComprehensiveSummary;
}

/** Union type for all analysis results */
type AnalysisResult = CoverageAnalysis | QualityAnalysis | TrendsAnalysis | GapsAnalysis | ComprehensiveAnalysis;

/** Gap identified in coverage, testing, or quality */
interface Gap {
  type: string;
  category?: string;
  file?: string;
  count?: number;
  coverage?: number;
  severity: Severity;
  description: string;
  suggestion: string;
}

/** Quality issue detected during analysis */
interface QualityIssue {
  type: string;
  severity: Severity;
  value: number;
  description: string;
  impact: string;
}

/** Recommendation for improvement */
interface Recommendation {
  type: string;
  priority: Priority;
  title?: string;
  message?: string;
  description?: string;
  actions: string[];
  estimatedImpact?: string;
}

/** Insight derived from trend analysis */
interface Insight {
  type: string;
  direction: TrendDirection | 'increasing' | 'decreasing';
  change: number;
  description: string;
}

/** Prediction based on trend analysis */
interface Prediction {
  type: string;
  timeframe: string;
  predicted: number;
  confidence: 'low' | 'medium' | 'high';
  description: string;
}

/** Data for test reliability calculation */
interface ReliabilityDataPoint {
  total: number;
  passed: number;
  failed: number;
}

/** Report data structure for generation */
interface ReportData {
  analysis: AnalysisResult;
  recommendations: Recommendation[];
  metadata: {
    generated: string;
    format: string;
    options: AnalyzeOptions;
  };
}

/** Type guard for ExecutionReport */
function isExecutionReport(data: unknown): data is ExecutionReport {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.timestamp === 'string' || obj.timestamp === undefined;
}

/** Type guard for CoverageData */
function isCoverageData(data: unknown): data is CoverageData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.overall === 'number' || obj.overall === undefined;
}

export class AnalyzeCommand {
  static async execute(target: string, options: AnalyzeOptions): Promise<void> {
    console.log(chalk.blue.bold('\n📊 Analyzing Test Results and Quality Metrics\n'));

    try {
      const spinner = ora('Initializing analysis...').start();

      // Validate inputs
      await this.validateInputs(target, options);

      spinner.text = 'Loading test data...';

      // Load test execution data
      const testData = await this.loadTestData();

      spinner.text = 'Performing analysis...';

      // Perform specific analysis based on target
      let analysisResults;
      switch (target) {
        case 'coverage':
          analysisResults = await this.analyzeCoverage(testData, options);
          break;
        case 'quality':
          analysisResults = await this.analyzeQuality(testData, options);
          break;
        case 'trends':
          analysisResults = await this.analyzeTrends(testData, options);
          break;
        case 'gaps':
          analysisResults = await this.analyzeGaps(testData, options);
          break;
        default:
          analysisResults = await this.analyzeAll(testData, options);
      }

      spinner.text = 'Generating recommendations...';

      // Generate recommendations
      const recommendations = await this.generateRecommendations(analysisResults, options);

      spinner.text = 'Creating reports...';

      // Generate reports
      await this.generateReports(analysisResults, recommendations, options);

      spinner.succeed(chalk.green('Analysis completed successfully!'));

      // Display analysis summary
      this.displayAnalysisSummary(analysisResults, recommendations, options);

      // Store analysis results in coordination
      await this.storeAnalysisResults(analysisResults, recommendations);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(chalk.red('❌ Analysis failed:'), errorMessage);
      if (options.verbose && errorStack) {
        console.error(chalk.gray(errorStack));
      }
      ProcessExit.exitIfNotTest(1);
    }
  }

  private static async validateInputs(target: string, options: AnalyzeOptions): Promise<void> {
    const validTargets = ['coverage', 'quality', 'trends', 'gaps'];
    if (!validTargets.includes(target)) {
      throw new Error(`Invalid target '${target}'. Must be one of: ${validTargets.join(', ')}`);
    }

    const validFormats = ['json', 'html', 'csv'];
    if (!validFormats.includes(options.format)) {
      throw new Error(`Invalid format '${options.format}'. Must be one of: ${validFormats.join(', ')}`);
    }

    const threshold = parseInt(options.threshold);
    if (threshold < 0 || threshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }

    // Check if reports directory exists
    if (!await fs.pathExists('.agentic-qe/reports')) {
      throw new Error('No test execution reports found. Run tests first: agentic-qe run tests');
    }
  }

  private static async loadTestData(): Promise<TestData> {
    const reportsDir = '.agentic-qe/reports';
    const reportFiles = await fs.readdir(reportsDir);

    const executionFiles = reportFiles
      .filter(file => file.startsWith('execution-') && file.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first

    if (executionFiles.length === 0) {
      throw new Error('No test execution reports found');
    }

    const testData: TestData = {
      latest: null,
      history: [],
      coverage: [],
      quality: []
    };

    // Load latest execution
    const latestFile = path.join(reportsDir, executionFiles[0]);
    const latestData: unknown = await fs.readJson(latestFile);
    if (isExecutionReport(latestData)) {
      testData.latest = latestData;
    }

    // Load historical data (up to 30 most recent)
    for (const file of executionFiles.slice(0, 30)) {
      const filePath = path.join(reportsDir, file);
      const data: unknown = await fs.readJson(filePath);
      if (isExecutionReport(data)) {
        testData.history.push(data);
      }
    }

    // Load coverage data if available
    const coverageFiles = reportFiles.filter(file => file.startsWith('coverage-'));
    for (const file of coverageFiles.slice(0, 10)) {
      const filePath = path.join(reportsDir, file);
      if (await fs.pathExists(filePath)) {
        const coverage: unknown = await fs.readJson(filePath);
        if (isCoverageData(coverage)) {
          testData.coverage.push(coverage);
        }
      }
    }

    return testData;
  }

  private static async analyzeCoverage(testData: TestData, options: AnalyzeOptions): Promise<CoverageAnalysis> {
    const analysis: CoverageAnalysis = {
      type: 'coverage',
      timestamp: new Date().toISOString(),
      current: {
        overall: testData.latest?.coverage?.overall || 0,
        details: testData.latest?.coverage?.details || {}
      },
      trends: {
        direction: 'stable',
        change: 0,
        period: options.period
      },
      gaps: [],
      recommendations: []
    };

    // Calculate coverage trends
    if (testData.history.length > 1) {
      const recentCoverage = testData.history.slice(0, 5).map((h: ExecutionReport) => h.coverage?.overall || 0);
      const avgRecent = recentCoverage.reduce((sum: number, c: number) => sum + c, 0) / recentCoverage.length;
      const olderCoverage = testData.history.slice(5, 10).map((h: ExecutionReport) => h.coverage?.overall || 0);
      const avgOlder = olderCoverage.length > 0
        ? olderCoverage.reduce((sum: number, c: number) => sum + c, 0) / olderCoverage.length
        : avgRecent;

      analysis.trends.change = avgRecent - avgOlder;
      analysis.trends.direction = analysis.trends.change > 1 ? 'improving' :
                                  analysis.trends.change < -1 ? 'declining' : 'stable';
    }

    // Identify coverage gaps if requested
    if (options.gaps) {
      analysis.gaps = await this.identifyCoverageGaps(testData);
    }

    // Add threshold-based alerts
    const threshold = parseInt(options.threshold);
    if (analysis.current.overall < threshold) {
      analysis.recommendations.push({
        type: 'coverage_below_threshold',
        priority: 'high',
        message: `Coverage ${analysis.current.overall.toFixed(1)}% is below threshold ${threshold}%`,
        actions: ['Generate additional tests', 'Review uncovered code paths']
      });
    }

    return analysis;
  }

  private static async analyzeQuality(testData: TestData, options: AnalyzeOptions): Promise<QualityAnalysis> {
    const analysis: QualityAnalysis = {
      type: 'quality',
      timestamp: new Date().toISOString(),
      metrics: {
        testReliability: 0,
        passRate: 0,
        flakyTests: 0,
        testMaintainability: 0,
        qualityScore: 0
      },
      trends: {
        direction: 'stable',
        period: options.period,
        changes: {}
      },
      issues: [],
      recommendations: []
    };

    // Calculate quality metrics from latest data
    const latest = testData.latest;
    if (latest?.summary) {
      analysis.metrics.passRate = latest.summary.total > 0
        ? (latest.summary.passed / latest.summary.total) * 100
        : 0;

      // Analyze test reliability over time
      const reliabilityData: ReliabilityDataPoint[] = testData.history.slice(0, 10).map((h: ExecutionReport) => ({
        total: h.summary?.total || 0,
        passed: h.summary?.passed || 0,
        failed: h.summary?.failed || 0
      }));

      analysis.metrics.testReliability = this.calculateTestReliability(reliabilityData);
      analysis.metrics.flakyTests = this.identifyFlakyTests(reliabilityData);
    }

    // Calculate composite quality score
    analysis.metrics.qualityScore = this.calculateQualityScore(analysis.metrics);

    // Identify quality issues
    analysis.issues = await this.identifyQualityIssues(testData, analysis.metrics);

    return analysis;
  }

  private static async analyzeTrends(testData: TestData, options: AnalyzeOptions): Promise<TrendsAnalysis> {
    const analysis: TrendsAnalysis = {
      type: 'trends',
      timestamp: new Date().toISOString(),
      period: options.period,
      trends: {
        coverage: [],
        passRate: [],
        testCount: [],
        executionTime: []
      },
      insights: [],
      predictions: []
    };

    // Analyze trends over time
    const historicalData = testData.history.slice(0, 20); // Last 20 executions

    for (const data of historicalData) {
      const timestamp = data.timestamp;

      analysis.trends.coverage.push({
        timestamp,
        value: data.coverage?.overall || 0
      });

      analysis.trends.passRate.push({
        timestamp,
        value: data.summary?.total ? (data.summary.passed / data.summary.total) * 100 : 0
      });

      analysis.trends.testCount.push({
        timestamp,
        value: data.summary?.total || 0
      });

      analysis.trends.executionTime.push({
        timestamp,
        value: data.summary?.duration || 0
      });
    }

    // Generate insights
    analysis.insights = this.generateTrendInsights(analysis.trends);

    // Simple predictions based on trends
    analysis.predictions = this.generatePredictions(analysis.trends);

    return analysis;
  }

  private static async analyzeGaps(testData: TestData, _options: AnalyzeOptions): Promise<GapsAnalysis> {
    const analysis: GapsAnalysis = {
      type: 'gaps',
      timestamp: new Date().toISOString(),
      coverageGaps: [],
      testingGaps: [],
      qualityGaps: [],
      recommendations: []
    };

    // Identify coverage gaps
    analysis.coverageGaps = await this.identifyCoverageGaps(testData);

    // Identify testing gaps
    analysis.testingGaps = await this.identifyTestingGaps();

    // Identify quality gaps
    analysis.qualityGaps = await this.identifyQualityGaps(testData);

    return analysis;
  }

  private static async analyzeAll(testData: TestData, options: AnalyzeOptions): Promise<ComprehensiveAnalysis> {
    const coverage = await this.analyzeCoverage(testData, options);
    const quality = await this.analyzeQuality(testData, options);
    const trends = await this.analyzeTrends(testData, options);
    const gaps = await this.analyzeGaps(testData, options);

    const analyses: AnalysisResult[] = [coverage, quality, trends, gaps];

    return {
      type: 'comprehensive',
      timestamp: new Date().toISOString(),
      coverage,
      quality,
      trends,
      gaps,
      summary: {
        overallScore: this.calculateOverallScore(analyses),
        criticalIssues: this.identifyCriticalIssues(analyses),
        topRecommendations: this.prioritizeRecommendations(analyses)
      }
    };
  }

  private static async identifyCoverageGaps(testData: TestData): Promise<Gap[]> {
    const gaps: Gap[] = [];

    // Check for missing test types
    const testTypes = ['unit', 'integration', 'e2e', 'performance', 'security'];
    const testDirs = await Promise.all(
      testTypes.map(async type => ({
        type,
        exists: await fs.pathExists(`tests/${type}`)
      }))
    );

    for (const { type, exists } of testDirs) {
      if (!exists) {
        gaps.push({
          type: 'missing_test_type',
          category: type,
          severity: type === 'unit' ? 'high' : 'medium',
          description: `No ${type} tests found`,
          suggestion: `Create ${type} test directory and generate tests`
        });
      }
    }

    // Check coverage by file (if coverage details available)
    const coverageDetails: CoverageDetails = testData.latest?.coverage?.details || {};
    Object.entries(coverageDetails).forEach(([file, coverage]: [string, number]) => {
      if (coverage < 80) {
        gaps.push({
          type: 'low_file_coverage',
          file,
          coverage,
          severity: coverage < 50 ? 'high' : 'medium',
          description: `Low coverage in ${file}: ${coverage}%`,
          suggestion: 'Add more comprehensive tests for this file'
        });
      }
    });

    return gaps;
  }

  private static async identifyTestingGaps(): Promise<Gap[]> {
    const gaps: Gap[] = [];

    // Check for test configuration files
    const configFiles = [
      { file: 'jest.config.js', type: 'Jest configuration' },
      { file: '.agentic-qe/config/jest.config.json', type: 'QE Jest configuration' },
      { file: 'cypress.json', type: 'Cypress configuration' },
      { file: 'playwright.config.js', type: 'Playwright configuration' }
    ];

    for (const { file, type } of configFiles) {
      if (!await fs.pathExists(file)) {
        gaps.push({
          type: 'missing_config',
          file,
          severity: 'low',
          description: `Missing ${type}`,
          suggestion: `Consider adding ${file} for better test configuration`
        });
      }
    }

    return gaps;
  }

  private static async identifyQualityGaps(testData: TestData): Promise<Gap[]> {
    const gaps: Gap[] = [];
    const latest = testData.latest;

    if (!latest) return gaps;

    // Check for quality issues
    if (latest.summary?.failed && latest.summary.failed > 0) {
      gaps.push({
        type: 'failing_tests',
        count: latest.summary.failed,
        severity: 'high',
        description: `${latest.summary.failed} tests are failing`,
        suggestion: 'Fix failing tests to improve quality'
      });
    }

    if (latest.errors && latest.errors.length > 0) {
      gaps.push({
        type: 'test_errors',
        count: latest.errors.length,
        severity: 'medium',
        description: `${latest.errors.length} test execution errors`,
        suggestion: 'Review and fix test execution errors'
      });
    }

    return gaps;
  }

  private static calculateTestReliability(reliabilityData: ReliabilityDataPoint[]): number {
    if (reliabilityData.length === 0) return 0;

    const consistentResults = reliabilityData.filter((data, index) => {
      if (index === 0) return true;
      const prev = reliabilityData[index - 1];
      const currentPassRate = data.total > 0 ? data.passed / data.total : 0;
      const prevPassRate = prev.total > 0 ? prev.passed / prev.total : 0;
      const passRateDiff = Math.abs(currentPassRate - prevPassRate);
      return passRateDiff < 0.1; // Less than 10% variation
    });

    return (consistentResults.length / reliabilityData.length) * 100;
  }

  private static identifyFlakyTests(reliabilityData: ReliabilityDataPoint[]): number {
    // Simple heuristic: if pass rate varies significantly, there might be flaky tests
    const passRates = reliabilityData.map(d => d.total > 0 ? d.passed / d.total : 0);
    const variance = this.calculateVariance(passRates);
    return variance > 0.05 ? Math.floor(variance * 100) : 0;
  }

  private static calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }

  private static calculateQualityScore(metrics: QualityMetrics): number {
    const weights = {
      passRate: 0.4,
      testReliability: 0.3,
      coverage: 0.2,
      flakyTests: 0.1
    };

    const score =
      metrics.passRate * weights.passRate +
      metrics.testReliability * weights.testReliability +
      0 * weights.coverage + // coverage is not part of QualityMetrics
      (100 - metrics.flakyTests) * weights.flakyTests;

    return Math.max(0, Math.min(100, score));
  }

  private static async identifyQualityIssues(_testData: TestData, metrics: QualityMetrics): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];

    if (metrics.passRate < 90) {
      issues.push({
        type: 'low_pass_rate',
        severity: metrics.passRate < 80 ? 'high' : 'medium',
        value: metrics.passRate,
        description: `Test pass rate is ${metrics.passRate.toFixed(1)}%`,
        impact: 'Quality confidence reduced'
      });
    }

    if (metrics.testReliability < 95) {
      issues.push({
        type: 'unreliable_tests',
        severity: 'medium',
        value: metrics.testReliability,
        description: `Test reliability is ${metrics.testReliability.toFixed(1)}%`,
        impact: 'Inconsistent test results'
      });
    }

    if (metrics.flakyTests > 5) {
      issues.push({
        type: 'flaky_tests',
        severity: 'high',
        value: metrics.flakyTests,
        description: `${metrics.flakyTests} potentially flaky tests detected`,
        impact: 'Reduced confidence in test results'
      });
    }

    return issues;
  }

  private static generateTrendInsights(trends: TrendsCollection): Insight[] {
    const insights: Insight[] = [];

    // Coverage trend
    const coverageTrend = this.calculateTrend(trends.coverage);
    if (coverageTrend.direction !== 'stable') {
      insights.push({
        type: 'coverage_trend',
        direction: coverageTrend.direction,
        change: coverageTrend.change,
        description: `Coverage is ${coverageTrend.direction} by ${Math.abs(coverageTrend.change).toFixed(1)}%`
      });
    }

    // Pass rate trend
    const passRateTrend = this.calculateTrend(trends.passRate);
    if (passRateTrend.direction !== 'stable') {
      insights.push({
        type: 'pass_rate_trend',
        direction: passRateTrend.direction,
        change: passRateTrend.change,
        description: `Pass rate is ${passRateTrend.direction} by ${Math.abs(passRateTrend.change).toFixed(1)}%`
      });
    }

    // Execution time trend
    const timeTrend = this.calculateTrend(trends.executionTime);
    if (timeTrend.direction !== 'stable' && Math.abs(timeTrend.change) > 1000) {
      insights.push({
        type: 'execution_time_trend',
        direction: timeTrend.direction === 'improving' ? 'decreasing' : 'increasing',
        change: timeTrend.change,
        description: `Test execution time is ${timeTrend.direction === 'improving' ? 'decreasing' : 'increasing'}`
      });
    }

    return insights;
  }

  private static calculateTrend(dataPoints: TrendDataPoint[]): TrendResult {
    if (dataPoints.length < 3) {
      return { direction: 'stable', change: 0 };
    }

    const values = dataPoints.map(point => point.value);
    const halfLength = Math.floor(values.length / 2);
    const recentAvg = values.slice(0, halfLength).reduce((sum, val) => sum + val, 0) / halfLength;
    const olderAvg = values.slice(halfLength).reduce((sum, val) => sum + val, 0) / (values.length - halfLength);

    const change = recentAvg - olderAvg;
    const direction: TrendDirection = Math.abs(change) < 1 ? 'stable' : change > 0 ? 'improving' : 'declining';

    return { direction, change };
  }

  private static generatePredictions(trends: TrendsCollection): Prediction[] {
    const predictions: Prediction[] = [];

    // Simple linear prediction for coverage
    const coverageTrend = this.calculateTrend(trends.coverage);
    if (coverageTrend.direction !== 'stable') {
      const currentValue = trends.coverage[0]?.value ?? 0;
      const predicted = currentValue + (coverageTrend.change * 2);
      predictions.push({
        type: 'coverage',
        timeframe: '2 cycles',
        predicted: Math.max(0, Math.min(100, predicted)),
        confidence: 'medium',
        description: `Coverage predicted to be ${predicted.toFixed(1)}% in 2 execution cycles`
      });
    }

    return predictions;
  }

  private static calculateOverallScore(analyses: AnalysisResult[]): number {
    const scores: number[] = [];

    for (const analysis of analyses) {
      if ('metrics' in analysis && analysis.metrics && 'qualityScore' in analysis.metrics) {
        scores.push(analysis.metrics.qualityScore);
      }
    }

    return scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;
  }

  private static identifyCriticalIssues(analyses: AnalysisResult[]): Array<QualityIssue | Gap> {
    const criticalIssues: Array<QualityIssue | Gap> = [];

    for (const analysis of analyses) {
      // Handle QualityAnalysis issues
      if (analysis.type === 'quality' && analysis.issues) {
        const critical = analysis.issues.filter((issue: QualityIssue) => issue.severity === 'high');
        criticalIssues.push(...critical);
      }

      // Handle CoverageAnalysis gaps
      if (analysis.type === 'coverage' && analysis.gaps) {
        const critical = analysis.gaps.filter((gap: Gap) => gap.severity === 'high');
        criticalIssues.push(...critical);
      }

      // Handle GapsAnalysis - all gap types
      if (analysis.type === 'gaps') {
        const coverageCritical = analysis.coverageGaps.filter((gap: Gap) => gap.severity === 'high');
        const testingCritical = analysis.testingGaps.filter((gap: Gap) => gap.severity === 'high');
        const qualityCritical = analysis.qualityGaps.filter((gap: Gap) => gap.severity === 'high');
        criticalIssues.push(...coverageCritical, ...testingCritical, ...qualityCritical);
      }

      // Handle ComprehensiveAnalysis - nested issues and gaps
      if (analysis.type === 'comprehensive') {
        if (analysis.quality?.issues) {
          const critical = analysis.quality.issues.filter((issue: QualityIssue) => issue.severity === 'high');
          criticalIssues.push(...critical);
        }
        if (analysis.coverage?.gaps) {
          const critical = analysis.coverage.gaps.filter((gap: Gap) => gap.severity === 'high');
          criticalIssues.push(...critical);
        }
        if (analysis.gaps) {
          const coverageCritical = analysis.gaps.coverageGaps.filter((gap: Gap) => gap.severity === 'high');
          const qualityCritical = analysis.gaps.qualityGaps.filter((gap: Gap) => gap.severity === 'high');
          criticalIssues.push(...coverageCritical, ...qualityCritical);
        }
      }
    }

    return criticalIssues;
  }

  private static prioritizeRecommendations(analyses: AnalysisResult[]): Recommendation[] {
    const allRecommendations: Recommendation[] = [];

    for (const analysis of analyses) {
      if ('recommendations' in analysis && analysis.recommendations) {
        allRecommendations.push(...analysis.recommendations);
      }
    }

    // Sort by priority
    const priorityOrder: Record<Priority, number> = { 'high': 3, 'medium': 2, 'low': 1 };
    return allRecommendations
      .sort((a, b) => {
        return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
      })
      .slice(0, 5); // Top 5 recommendations
  }

  private static async generateRecommendations(analysis: AnalysisResult, _options: AnalyzeOptions): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Coverage-specific recommendations
    if (analysis.type === 'coverage') {
      const coverageData = analysis.current;

      if (coverageData.overall < 80) {
        recommendations.push({
          type: 'improve_coverage',
          priority: 'high',
          title: 'Improve Test Coverage',
          description: `Current coverage (${coverageData.overall.toFixed(1)}%) is below recommended 80%`,
          actions: [
            'Run: agentic-qe generate tests --coverage-target 85',
            'Focus on uncovered code paths',
            'Add integration tests for complex flows'
          ],
          estimatedImpact: 'High'
        });
      }
    } else if (analysis.type === 'comprehensive' && analysis.coverage) {
      const coverageData = analysis.coverage.current;

      if (coverageData.overall < 80) {
        recommendations.push({
          type: 'improve_coverage',
          priority: 'high',
          title: 'Improve Test Coverage',
          description: `Current coverage (${coverageData.overall.toFixed(1)}%) is below recommended 80%`,
          actions: [
            'Run: agentic-qe generate tests --coverage-target 85',
            'Focus on uncovered code paths',
            'Add integration tests for complex flows'
          ],
          estimatedImpact: 'High'
        });
      }
    }

    // Quality-specific recommendations
    if (analysis.type === 'quality') {
      if (analysis.metrics.flakyTests > 0) {
        recommendations.push({
          type: 'fix_flaky_tests',
          priority: 'medium',
          title: 'Address Flaky Tests',
          description: `${analysis.metrics.flakyTests} potentially flaky tests detected`,
          actions: [
            'Review test execution logs',
            'Add proper test isolation',
            'Check for timing dependencies'
          ],
          estimatedImpact: 'Medium'
        });
      }
    } else if (analysis.type === 'comprehensive' && analysis.quality) {
      if (analysis.quality.metrics.flakyTests > 0) {
        recommendations.push({
          type: 'fix_flaky_tests',
          priority: 'medium',
          title: 'Address Flaky Tests',
          description: `${analysis.quality.metrics.flakyTests} potentially flaky tests detected`,
          actions: [
            'Review test execution logs',
            'Add proper test isolation',
            'Check for timing dependencies'
          ],
          estimatedImpact: 'Medium'
        });
      }
    }

    // Gap-specific recommendations
    if (analysis.type === 'coverage' && analysis.gaps) {
      for (const gap of analysis.gaps) {
        if (gap.severity === 'high') {
          recommendations.push({
            type: 'address_gap',
            priority: 'high',
            title: `Address ${gap.type}`,
            description: gap.description,
            actions: [gap.suggestion],
            estimatedImpact: 'High'
          });
        }
      }
    } else if (analysis.type === 'gaps') {
      const allGaps = [...analysis.coverageGaps, ...analysis.testingGaps, ...analysis.qualityGaps];
      for (const gap of allGaps) {
        if (gap.severity === 'high') {
          recommendations.push({
            type: 'address_gap',
            priority: 'high',
            title: `Address ${gap.type}`,
            description: gap.description,
            actions: [gap.suggestion],
            estimatedImpact: 'High'
          });
        }
      }
    }

    return recommendations;
  }

  private static async generateReports(analysis: AnalysisResult, recommendations: Recommendation[], options: AnalyzeOptions): Promise<void> {
    const reportsDir = '.agentic-qe/reports';
    await fs.ensureDir(reportsDir);

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const reportData: ReportData = {
      analysis,
      recommendations,
      metadata: {
        generated: new Date().toISOString(),
        format: options.format,
        options
      }
    };

    // Generate JSON report
    if (options.format === 'json' || options.format === 'all') {
      const jsonFile = `${reportsDir}/analysis-${analysis.type}-${timestamp}.json`;
      await fs.writeJson(jsonFile, reportData, { spaces: 2 });
    }

    // Generate HTML report
    if (options.format === 'html' || options.format === 'all') {
      const htmlContent = this.generateHtmlReport(reportData);
      const htmlFile = `${reportsDir}/analysis-${analysis.type}-${timestamp}.html`;
      await fs.writeFile(htmlFile, htmlContent);
    }

    // Generate CSV for trends
    if (options.format === 'csv' && 'trends' in analysis && analysis.trends) {
      const trendsData = analysis.type === 'trends' ? analysis.trends : undefined;
      if (trendsData) {
        const csvContent = this.generateCsvReport(trendsData);
        const csvFile = `${reportsDir}/trends-${timestamp}.csv`;
        await fs.writeFile(csvFile, csvContent);
      }
    }
  }

  private static generateHtmlReport(reportData: ReportData): string {
    const { analysis, recommendations } = reportData;

    // Extract current metrics if available
    const hasCurrent = analysis.type === 'coverage' || (analysis.type === 'comprehensive' && analysis.coverage);
    const currentOverall = analysis.type === 'coverage'
      ? analysis.current.overall
      : analysis.type === 'comprehensive' && analysis.coverage
        ? analysis.coverage.current.overall
        : 0;

    // Extract metrics if available
    const hasMetrics = analysis.type === 'quality' || (analysis.type === 'comprehensive' && analysis.quality);
    const metricsData = analysis.type === 'quality'
      ? analysis.metrics
      : analysis.type === 'comprehensive' && analysis.quality
        ? analysis.quality.metrics
        : null;

    return `<!DOCTYPE html>
<html>
<head>
    <title>Agentic QE Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f8ff; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f9f9f9; border-radius: 3px; }
        .high { color: #d9534f; }
        .medium { color: #f0ad4e; }
        .low { color: #5bc0de; }
        .recommendation { margin: 10px 0; padding: 10px; background: #dff0d8; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Agentic QE Analysis Report</h1>
        <p>Generated: ${reportData.metadata.generated}</p>
        <p>Type: ${analysis.type}</p>
    </div>

    ${hasCurrent ? `
    <div class="section">
        <h2>Current Metrics</h2>
        <div class="metric">Coverage: ${currentOverall.toFixed(1)}%</div>
        ${hasMetrics && metricsData ? `
        <div class="metric">Pass Rate: ${metricsData.passRate.toFixed(1)}%</div>
        <div class="metric">Quality Score: ${metricsData.qualityScore.toFixed(1)}</div>
        ` : ''}
    </div>
    ` : ''}

    ${recommendations.length > 0 ? `
    <div class="section">
        <h2>Recommendations</h2>
        ${recommendations.map((rec: Recommendation) => `
        <div class="recommendation">
            <h3 class="${rec.priority}">${rec.title || rec.type}</h3>
            <p>${rec.description || rec.message || ''}</p>
            <ul>
                ${rec.actions.map((action: string) => `<li>${action}</li>`).join('')}
            </ul>
        </div>
        `).join('')}
    </div>
    ` : ''}

    <div class="section">
        <h2>Raw Data</h2>
        <pre>${JSON.stringify(analysis, null, 2)}</pre>
    </div>
</body>
</html>`;
  }

  private static generateCsvReport(trends: TrendsCollection): string {
    let csv = 'Timestamp,Coverage,PassRate,TestCount,ExecutionTime\n';

    const maxLength = Math.max(
      trends.coverage.length,
      trends.passRate.length,
      trends.testCount.length,
      trends.executionTime.length
    );

    for (let i = 0; i < maxLength; i++) {
      const timestamp = trends.coverage[i]?.timestamp || '';
      const coverage = trends.coverage[i]?.value ?? '';
      const passRate = trends.passRate[i]?.value ?? '';
      const testCount = trends.testCount[i]?.value ?? '';
      const executionTime = trends.executionTime[i]?.value ?? '';

      csv += `${timestamp},${coverage},${passRate},${testCount},${executionTime}\n`;
    }

    return csv;
  }

  private static displayAnalysisSummary(analysis: AnalysisResult, recommendations: Recommendation[], options: AnalyzeOptions): void {
    console.log(chalk.yellow('\n📊 Analysis Summary:'));
    console.log(chalk.gray(`  Type: ${analysis.type}`));
    console.log(chalk.gray(`  Timestamp: ${analysis.timestamp}`));

    // Display key metrics based on analysis type
    if (analysis.type === 'coverage') {
      console.log(chalk.gray(`  Coverage: ${analysis.current.overall.toFixed(1)}%`));
      if (analysis.trends.direction) {
        console.log(chalk.gray(`  Trend: ${analysis.trends.direction}`));
      }
    } else if (analysis.type === 'quality') {
      console.log(chalk.gray(`  Pass Rate: ${analysis.metrics.passRate.toFixed(1)}%`));
      console.log(chalk.gray(`  Quality Score: ${analysis.metrics.qualityScore.toFixed(1)}`));
      if (analysis.trends.direction) {
        console.log(chalk.gray(`  Trend: ${analysis.trends.direction}`));
      }
    } else if (analysis.type === 'comprehensive') {
      if (analysis.coverage) {
        console.log(chalk.gray(`  Coverage: ${analysis.coverage.current.overall.toFixed(1)}%`));
      }
      if (analysis.quality) {
        console.log(chalk.gray(`  Pass Rate: ${analysis.quality.metrics.passRate.toFixed(1)}%`));
        console.log(chalk.gray(`  Quality Score: ${analysis.quality.metrics.qualityScore.toFixed(1)}`));
      }
    }

    // Display critical issues
    let criticalIssues: QualityIssue[] = [];
    if (analysis.type === 'quality' && analysis.issues) {
      criticalIssues = analysis.issues.filter((issue: QualityIssue) => issue.severity === 'high');
    } else if (analysis.type === 'comprehensive' && analysis.quality?.issues) {
      criticalIssues = analysis.quality.issues.filter((issue: QualityIssue) => issue.severity === 'high');
    }

    if (criticalIssues.length > 0) {
      console.log(chalk.red('\n🚨 Critical Issues:'));
      criticalIssues.forEach((issue: QualityIssue) => {
        console.log(chalk.red(`  • ${issue.description}`));
      });
    }

    // Display top recommendations
    if (recommendations.length > 0) {
      console.log(chalk.yellow('\n💡 Top Recommendations:'));
      recommendations.slice(0, 3).forEach((rec, index) => {
        console.log(chalk.gray(`  ${index + 1}. ${rec.title || rec.type}`));
        console.log(chalk.gray(`     ${rec.description || rec.message || ''}`));
      });
    }

    console.log(chalk.yellow('\n📁 Reports Generated:'));
    console.log(chalk.gray(`  Format: ${options.format}`));
    console.log(chalk.gray(`  Location: .agentic-qe/reports/`));

    console.log(chalk.yellow('\n💡 Next Steps:'));
    if (recommendations.length > 0) {
      console.log(chalk.gray('  1. Review and implement top recommendations'));
      console.log(chalk.gray('  2. Re-run analysis after improvements'));
    }
    console.log(chalk.gray('  3. Monitor trends over time for continuous improvement'));
  }

  private static async storeAnalysisResults(analysis: AnalysisResult, recommendations: Recommendation[]): Promise<void> {
    // Extract metrics or current values depending on analysis type
    let metricsOrCurrent: CurrentCoverage | QualityMetrics | null = null;
    let issuesCount = 0;

    if (analysis.type === 'coverage') {
      metricsOrCurrent = analysis.current;
    } else if (analysis.type === 'quality') {
      metricsOrCurrent = analysis.metrics;
      issuesCount = analysis.issues.length;
    } else if (analysis.type === 'comprehensive') {
      metricsOrCurrent = analysis.quality?.metrics || analysis.coverage?.current || null;
      issuesCount = analysis.quality?.issues?.length || 0;
    }

    const summary = {
      type: analysis.type,
      timestamp: analysis.timestamp,
      metrics: metricsOrCurrent,
      issues: issuesCount,
      recommendations: recommendations.length,
      status: 'completed'
    };

    // Store in coordination memory
    const coordinationScript = `
npx claude-flow@alpha memory store --key "agentic-qe/analysis/latest" --value '${JSON.stringify(summary)}'
npx claude-flow@alpha hooks notify --message "Analysis completed: ${analysis.type} analysis with ${recommendations.length} recommendations"
`;

    await fs.ensureDir('.agentic-qe/scripts');
    await fs.writeFile('.agentic-qe/scripts/store-analysis-results.sh', coordinationScript);
    await fs.chmod('.agentic-qe/scripts/store-analysis-results.sh', '755');
  }
}