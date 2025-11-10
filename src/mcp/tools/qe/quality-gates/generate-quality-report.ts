/**
 * Quality Report Generation Tool
 *
 * Generates comprehensive quality reports with metrics, trends, insights,
 * and actionable recommendations for stakeholders.
 *
 * @module tools/qe/quality-gates/generate-quality-report
 * @version 1.0.0
 * @author Agentic QE Team - Phase 3
 * @date 2025-11-09
 */

import {
  QualityMetrics,
  Environment,
  Priority,
  TestResult,
  QEToolResponse,
  ResponseMetadata
} from '../shared/types.js';

// ==================== Types ====================

/**
 * Parameters for quality report generation
 */
export interface GenerateQualityReportParams {
  /** Project identifier */
  projectId: string;

  /** Report identifier */
  reportId?: string;

  /** Current quality metrics */
  metrics: QualityMetrics;

  /** Test results */
  testResults?: TestResult[];

  /** Historical metrics for comparison */
  historicalMetrics?: QualityMetrics[];

  /** Environment */
  environment?: Environment;

  /** Report configuration */
  config?: ReportConfiguration;

  /** Additional metadata */
  metadata?: ReportInputMetadata;
}

/**
 * Report configuration
 */
export interface ReportConfiguration {
  /** Report format */
  format: 'json' | 'html' | 'markdown' | 'pdf';

  /** Include sections */
  includeSections: {
    executive: boolean;
    metrics: boolean;
    trends: boolean;
    risks: boolean;
    recommendations: boolean;
    details: boolean;
  };

  /** Detail level */
  detailLevel: 'summary' | 'detailed' | 'comprehensive';

  /** Include charts */
  includeCharts: boolean;

  /** Chart format */
  chartFormat?: 'svg' | 'png';
}

/**
 * Report input metadata
 */
export interface ReportInputMetadata {
  /** Build number */
  buildNumber?: string;

  /** Git commit */
  commit?: string;

  /** Branch */
  branch?: string;

  /** Author */
  author?: string;

  /** Deployment target */
  deploymentTarget?: string;
}

/**
 * Comprehensive quality report
 */
export interface QualityReport {
  /** Report metadata */
  metadata: ReportMetadata;

  /** Executive summary */
  executiveSummary: ExecutiveSummary;

  /** Quality metrics section */
  metricsSection: MetricsSection;

  /** Trend analysis section */
  trendsSection?: TrendsSection;

  /** Risk assessment section */
  risksSection: RisksSection;

  /** Recommendations section */
  recommendationsSection: RecommendationsSection;

  /** Detailed findings */
  detailedFindings?: DetailedFindings;

  /** Report score */
  overallScore: number;

  /** Report conclusion */
  conclusion: string;
}

/**
 * Report metadata
 */
export interface ReportMetadata {
  /** Report ID */
  reportId: string;

  /** Project ID */
  projectId: string;

  /** Generated at */
  generatedAt: string;

  /** Report version */
  version: string;

  /** Environment */
  environment: string;

  /** Build information */
  build?: {
    number: string;
    commit: string;
    branch: string;
  };
}

/**
 * Executive summary
 */
export interface ExecutiveSummary {
  /** Overall status */
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

  /** Overall score (0-100) */
  overallScore: number;

  /** Quality grade */
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

  /** Key highlights */
  highlights: string[];

  /** Critical issues */
  criticalIssues: string[];

  /** Top recommendations */
  topRecommendations: string[];

  /** Deployment readiness */
  deploymentReady: boolean;

  /** Readiness explanation */
  readinessExplanation: string;
}

/**
 * Metrics section
 */
export interface MetricsSection {
  /** Coverage metrics */
  coverage: MetricsSummary;

  /** Test quality metrics */
  testQuality: MetricsSummary;

  /** Security metrics */
  security: MetricsSummary;

  /** Performance metrics */
  performance: MetricsSummary;

  /** Code quality metrics */
  codeQuality: MetricsSummary;

  /** Comparison with previous */
  comparison?: MetricsComparison;
}

/**
 * Metrics summary for a category
 */
export interface MetricsSummary {
  /** Category name */
  category: string;

  /** Status */
  status: 'pass' | 'warning' | 'fail';

  /** Score (0-100) */
  score: number;

  /** Key metrics */
  keyMetrics: KeyMetric[];

  /** Summary text */
  summary: string;
}

/**
 * Key metric
 */
export interface KeyMetric {
  /** Metric name */
  name: string;

  /** Value */
  value: string;

  /** Status */
  status: 'pass' | 'warning' | 'fail';

  /** Trend */
  trend?: 'up' | 'down' | 'stable';
}

/**
 * Metrics comparison
 */
export interface MetricsComparison {
  /** Comparison period */
  period: string;

  /** Overall change */
  overallChange: number;

  /** Category changes */
  changes: {
    coverage: number;
    testQuality: number;
    security: number;
    performance: number;
    codeQuality: number;
  };

  /** Improvement summary */
  improvementSummary: string;
}

/**
 * Trends section
 */
export interface TrendsSection {
  /** Overall trend */
  overallTrend: 'improving' | 'stable' | 'degrading';

  /** Trend confidence */
  confidence: number;

  /** Category trends */
  categoryTrends: CategoryTrendInfo[];

  /** Key insights */
  insights: string[];

  /** Predictions */
  predictions?: TrendPredictions;
}

/**
 * Category trend information
 */
export interface CategoryTrendInfo {
  /** Category name */
  category: string;

  /** Trend direction */
  direction: 'improving' | 'stable' | 'degrading';

  /** Change percentage */
  change: number;

  /** Data points */
  dataPoints: number;

  /** Description */
  description: string;
}

/**
 * Trend predictions
 */
export interface TrendPredictions {
  /** Predicted score for next period */
  nextScore: number;

  /** Predicted risk level */
  riskLevel: Priority;

  /** Confidence in prediction */
  confidence: number;

  /** Recommendation */
  recommendation: string;
}

/**
 * Risks section
 */
export interface RisksSection {
  /** Overall risk level */
  overallRiskLevel: Priority;

  /** Risk score (0-100) */
  riskScore: number;

  /** Identified risks */
  risks: RiskInfo[];

  /** Risk matrix */
  riskMatrix: RiskMatrix;

  /** Mitigation summary */
  mitigationSummary: string;
}

/**
 * Risk information
 */
export interface RiskInfo {
  /** Risk ID */
  id: string;

  /** Risk category */
  category: string;

  /** Risk type */
  type: string;

  /** Severity */
  severity: Priority;

  /** Probability (0-1) */
  probability: number;

  /** Impact (0-10) */
  impact: number;

  /** Description */
  description: string;

  /** Mitigation steps */
  mitigation: string[];
}

/**
 * Risk matrix
 */
export interface RiskMatrix {
  /** Critical risks */
  critical: number;

  /** High risks */
  high: number;

  /** Medium risks */
  medium: number;

  /** Low risks */
  low: number;

  /** Total risks */
  total: number;
}

/**
 * Recommendations section
 */
export interface RecommendationsSection {
  /** Priority recommendations */
  priorityRecommendations: PriorityRecommendation[];

  /** Quick wins */
  quickWins: string[];

  /** Long-term improvements */
  longTermImprovements: string[];

  /** Action plan */
  actionPlan: ActionItem[];
}

/**
 * Priority recommendation
 */
export interface PriorityRecommendation {
  /** Priority */
  priority: Priority;

  /** Recommendation */
  recommendation: string;

  /** Category */
  category: string;

  /** Expected impact */
  expectedImpact: string;

  /** Effort */
  effort: 'low' | 'medium' | 'high';

  /** Timeline */
  timeline: string;
}

/**
 * Action item
 */
export interface ActionItem {
  /** Action ID */
  id: string;

  /** Action description */
  action: string;

  /** Owner */
  owner?: string;

  /** Due date */
  dueDate?: string;

  /** Status */
  status: 'pending' | 'in-progress' | 'completed';

  /** Priority */
  priority: Priority;
}

/**
 * Detailed findings
 */
export interface DetailedFindings {
  /** Test results breakdown */
  testResultsBreakdown?: TestResultsBreakdown;

  /** Coverage gaps */
  coverageGaps?: CoverageGap[];

  /** Security vulnerabilities */
  securityVulnerabilities?: SecurityVulnerability[];

  /** Performance bottlenecks */
  performanceBottlenecks?: PerformanceBottleneck[];

  /** Code quality issues */
  codeQualityIssues?: CodeQualityIssue[];
}

/**
 * Test results breakdown
 */
export interface TestResultsBreakdown {
  /** Total tests */
  total: number;

  /** Passed */
  passed: number;

  /** Failed */
  failed: number;

  /** Skipped */
  skipped: number;

  /** Flaky */
  flaky?: number;

  /** Test suites */
  suites: TestSuiteInfo[];
}

/**
 * Test suite information
 */
export interface TestSuiteInfo {
  /** Suite name */
  name: string;

  /** Test count */
  testCount: number;

  /** Pass rate */
  passRate: number;

  /** Status */
  status: 'pass' | 'fail';
}

/**
 * Coverage gap
 */
export interface CoverageGap {
  /** File path */
  file: string;

  /** Coverage percentage */
  coverage: number;

  /** Uncovered lines */
  uncoveredLines: number;

  /** Priority */
  priority: Priority;
}

/**
 * Security vulnerability
 */
export interface SecurityVulnerability {
  /** Vulnerability ID */
  id: string;

  /** Severity */
  severity: Priority;

  /** Title */
  title: string;

  /** Description */
  description: string;

  /** Affected file */
  file?: string;
}

/**
 * Performance bottleneck
 */
export interface PerformanceBottleneck {
  /** Bottleneck type */
  type: string;

  /** Location */
  location: string;

  /** Impact */
  impact: string;

  /** Recommendation */
  recommendation: string;
}

/**
 * Code quality issue
 */
export interface CodeQualityIssue {
  /** Issue type */
  type: string;

  /** File */
  file: string;

  /** Description */
  description: string;

  /** Severity */
  severity: Priority;
}

// ==================== Default Configuration ====================

const DEFAULT_CONFIG: ReportConfiguration = {
  format: 'json',
  includeSections: {
    executive: true,
    metrics: true,
    trends: true,
    risks: true,
    recommendations: true,
    details: true
  },
  detailLevel: 'detailed',
  includeCharts: false
};

// ==================== Main Report Generation ====================

/**
 * Generate comprehensive quality report
 *
 * @param params - Report generation parameters
 * @returns Comprehensive quality report
 */
export async function generateQualityReport(
  params: GenerateQualityReportParams
): Promise<QEToolResponse<QualityReport>> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    // Validate parameters
    validateParameters(params);

    // Use default config if not provided
    const config = { ...DEFAULT_CONFIG, ...params.config };

    // Generate report ID
    const reportId = params.reportId || `qr-${Date.now()}`;

    // Build report metadata
    const metadata = buildReportMetadata(params, reportId);

    // Calculate overall score
    const overallScore = calculateOverallScore(params.metrics);

    // Generate executive summary
    const executiveSummary = generateExecutiveSummary(params.metrics, overallScore);

    // Generate metrics section
    const metricsSection = generateMetricsSection(params.metrics, params.historicalMetrics);

    // Generate trends section (if historical data available)
    const trendsSection = params.historicalMetrics
      ? generateTrendsSection(params.metrics, params.historicalMetrics)
      : undefined;

    // Generate risks section
    const risksSection = generateRisksSection(params.metrics, params.testResults);

    // Generate recommendations section
    const recommendationsSection = generateRecommendationsSection(
      params.metrics,
      risksSection
    );

    // Generate detailed findings (if requested)
    const detailedFindings = config.includeSections.details
      ? generateDetailedFindings(params.metrics, params.testResults)
      : undefined;

    // Generate conclusion
    const conclusion = generateConclusion(executiveSummary, overallScore);

    const report: QualityReport = {
      metadata,
      executiveSummary,
      metricsSection,
      trendsSection,
      risksSection,
      recommendationsSection,
      detailedFindings,
      overallScore,
      conclusion
    };

    return createSuccessResponse(report, requestId, Date.now() - startTime);
  } catch (error) {
    return createErrorResponse(error as Error, requestId, Date.now() - startTime);
  }
}

// ==================== Report Building Functions ====================

/**
 * Build report metadata
 */
function buildReportMetadata(
  params: GenerateQualityReportParams,
  reportId: string
): ReportMetadata {
  return {
    reportId,
    projectId: params.projectId,
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    environment: params.environment || 'development',
    build: params.metadata
      ? {
          number: params.metadata.buildNumber || 'N/A',
          commit: params.metadata.commit || 'N/A',
          branch: params.metadata.branch || 'main'
        }
      : undefined
  };
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(
  metrics: QualityMetrics,
  overallScore: number
): ExecutiveSummary {
  const grade = calculateGrade(overallScore);
  const status = calculateStatus(overallScore);

  const highlights: string[] = [];
  const criticalIssues: string[] = [];
  const topRecommendations: string[] = [];

  // Coverage highlights
  if (metrics.coverage.overallPercentage >= 85) {
    highlights.push(`Strong test coverage: ${metrics.coverage.overallPercentage.toFixed(1)}%`);
  } else if (metrics.coverage.overallPercentage < 70) {
    criticalIssues.push(`Low test coverage: ${metrics.coverage.overallPercentage.toFixed(1)}%`);
    topRecommendations.push('Increase test coverage to minimum 80%');
  }

  // Security highlights
  if (metrics.security.summary.critical > 0) {
    criticalIssues.push(`${metrics.security.summary.critical} critical security vulnerabilities`);
    topRecommendations.push('Address critical security vulnerabilities immediately');
  } else if (metrics.security.summary.high === 0) {
    highlights.push('No critical or high security vulnerabilities');
  }

  // Test quality
  if (metrics.testResults.failureRate > 0.05) {
    criticalIssues.push(`High test failure rate: ${(metrics.testResults.failureRate * 100).toFixed(1)}%`);
    topRecommendations.push('Fix failing tests before deployment');
  } else {
    highlights.push(`Good test pass rate: ${((1 - metrics.testResults.failureRate) * 100).toFixed(1)}%`);
  }

  // Deployment readiness
  const deploymentReady = overallScore >= 80 && metrics.security.summary.critical === 0 && metrics.testResults.failureRate <= 0.05;
  const readinessExplanation = deploymentReady
    ? 'All critical quality criteria met. Deployment approved.'
    : `Quality score of ${overallScore.toFixed(1)} below deployment threshold. ${criticalIssues.length} critical issues must be resolved.`;

  return {
    status,
    overallScore,
    grade,
    highlights,
    criticalIssues,
    topRecommendations: topRecommendations.slice(0, 3),
    deploymentReady,
    readinessExplanation
  };
}

/**
 * Generate metrics section
 */
function generateMetricsSection(
  metrics: QualityMetrics,
  historical?: QualityMetrics[]
): MetricsSection {
  const coverage = generateCoverageMetrics(metrics);
  const testQuality = generateTestQualityMetrics(metrics);
  const security = generateSecurityMetrics(metrics);
  const performance = generatePerformanceMetrics(metrics);
  const codeQuality = generateCodeQualityMetrics(metrics);

  const comparison = historical && historical.length > 0
    ? generateMetricsComparison(metrics, historical[historical.length - 1])
    : undefined;

  return {
    coverage,
    testQuality,
    security,
    performance,
    codeQuality,
    comparison
  };
}

/**
 * Generate coverage metrics summary
 */
function generateCoverageMetrics(metrics: QualityMetrics): MetricsSummary {
  const score = metrics.coverage.overallPercentage;
  const status = score >= 80 ? 'pass' : score >= 60 ? 'warning' : 'fail';

  return {
    category: 'Coverage',
    status,
    score,
    keyMetrics: [
      { name: 'Overall', value: `${metrics.coverage.overallPercentage.toFixed(1)}%`, status },
      {
        name: 'Lines',
        value: `${((metrics.coverage.coveredLines / Math.max(1, metrics.coverage.totalLines)) * 100).toFixed(1)}%`,
        status: (metrics.coverage.coveredLines / Math.max(1, metrics.coverage.totalLines)) >= 0.8 ? 'pass' : 'warning'
      },
      {
        name: 'Branches',
        value: `${((metrics.coverage.coveredBranches / Math.max(1, metrics.coverage.totalBranches)) * 100).toFixed(1)}%`,
        status: (metrics.coverage.coveredBranches / Math.max(1, metrics.coverage.totalBranches)) >= 0.75 ? 'pass' : 'warning'
      }
    ],
    summary: `Overall coverage is ${score.toFixed(1)}%. ${status === 'pass' ? 'Meets standards.' : 'Improvement needed.'}`
  };
}

/**
 * Generate test quality metrics summary
 */
function generateTestQualityMetrics(metrics: QualityMetrics): MetricsSummary {
  const successRate = (1 - metrics.testResults.failureRate) * 100;
  const score = successRate;
  const status = successRate >= 95 ? 'pass' : successRate >= 90 ? 'warning' : 'fail';

  return {
    category: 'Test Quality',
    status,
    score,
    keyMetrics: [
      { name: 'Total Tests', value: `${metrics.testResults.total}`, status: 'pass' },
      { name: 'Passed', value: `${metrics.testResults.passed}`, status: 'pass' },
      { name: 'Failed', value: `${metrics.testResults.failed}`, status: metrics.testResults.failed === 0 ? 'pass' : 'fail' },
      { name: 'Success Rate', value: `${successRate.toFixed(1)}%`, status }
    ],
    summary: `${metrics.testResults.passed} of ${metrics.testResults.total} tests passing. ${status === 'pass' ? 'Good quality.' : 'Needs attention.'}`
  };
}

/**
 * Generate security metrics summary
 */
function generateSecurityMetrics(metrics: QualityMetrics): MetricsSummary {
  const { critical, high, medium } = metrics.security.summary;
  const score = Math.max(0, 100 - critical * 50 - high * 10 - medium * 2);
  const status = critical === 0 && high === 0 ? 'pass' : critical > 0 ? 'fail' : 'warning';

  return {
    category: 'Security',
    status,
    score,
    keyMetrics: [
      { name: 'Critical', value: `${critical}`, status: critical === 0 ? 'pass' : 'fail' },
      { name: 'High', value: `${high}`, status: high === 0 ? 'pass' : 'warning' },
      { name: 'Medium', value: `${medium}`, status: medium < 5 ? 'pass' : 'warning' }
    ],
    summary: critical > 0
      ? `${critical} critical vulnerabilities must be addressed immediately.`
      : high > 0
        ? `${high} high severity vulnerabilities require attention.`
        : 'No critical or high security issues.'
  };
}

/**
 * Generate performance metrics summary
 */
function generatePerformanceMetrics(metrics: QualityMetrics): MetricsSummary {
  const score = Math.max(0, (1 - metrics.performance.errorRate) * 100);
  const status = metrics.performance.errorRate <= 0.05 ? 'pass' : metrics.performance.errorRate <= 0.10 ? 'warning' : 'fail';

  return {
    category: 'Performance',
    status,
    score,
    keyMetrics: [
      { name: 'Error Rate', value: `${(metrics.performance.errorRate * 100).toFixed(2)}%`, status },
      { name: 'P99 Latency', value: `${metrics.performance.responseTime.p99}ms`, status: metrics.performance.responseTime.p99 < 2000 ? 'pass' : 'warning' },
      { name: 'Throughput', value: `${metrics.performance.throughput} req/s`, status: 'pass' }
    ],
    summary: status === 'pass'
      ? 'Performance metrics within acceptable range.'
      : 'Performance optimization recommended.'
  };
}

/**
 * Generate code quality metrics summary
 */
function generateCodeQualityMetrics(metrics: QualityMetrics): MetricsSummary {
  const score = metrics.codeQuality.maintainabilityIndex;
  const status = score >= 70 ? 'pass' : score >= 50 ? 'warning' : 'fail';

  return {
    category: 'Code Quality',
    status,
    score,
    keyMetrics: [
      { name: 'Maintainability', value: `${metrics.codeQuality.maintainabilityIndex}`, status },
      { name: 'Complexity', value: `${metrics.codeQuality.cyclomaticComplexity}`, status: metrics.codeQuality.cyclomaticComplexity <= 15 ? 'pass' : 'warning' },
      { name: 'Duplication', value: `${metrics.codeQuality.duplications}%`, status: metrics.codeQuality.duplications <= 5 ? 'pass' : 'warning' }
    ],
    summary: status === 'pass'
      ? 'Code quality is good.'
      : 'Code quality improvements recommended.'
  };
}

/**
 * Generate metrics comparison
 */
function generateMetricsComparison(
  current: QualityMetrics,
  previous: QualityMetrics
): MetricsComparison {
  const currentScore = calculateOverallScore(current);
  const previousScore = calculateOverallScore(previous);
  const overallChange = ((currentScore - previousScore) / previousScore) * 100;

  return {
    period: 'Previous Build',
    overallChange,
    changes: {
      coverage: current.coverage.overallPercentage - previous.coverage.overallPercentage,
      testQuality: (1 - current.testResults.failureRate) * 100 - (1 - previous.testResults.failureRate) * 100,
      security: 0,
      performance: (1 - current.performance.errorRate) * 100 - (1 - previous.performance.errorRate) * 100,
      codeQuality: current.codeQuality.maintainabilityIndex - previous.codeQuality.maintainabilityIndex
    },
    improvementSummary: overallChange > 0
      ? `Quality improved by ${overallChange.toFixed(1)}%`
      : overallChange < 0
        ? `Quality decreased by ${Math.abs(overallChange).toFixed(1)}%`
        : 'Quality remains stable'
  };
}

/**
 * Generate trends section
 */
function generateTrendsSection(
  current: QualityMetrics,
  historical: QualityMetrics[]
): TrendsSection {
  const allMetrics = [...historical, current];

  // Placeholder for trend analysis
  return {
    overallTrend: 'stable',
    confidence: 0.75,
    categoryTrends: [],
    insights: ['Trend analysis requires historical data']
  };
}

/**
 * Generate risks section
 */
function generateRisksSection(
  metrics: QualityMetrics,
  testResults?: TestResult[]
): RisksSection {
  const risks: RiskInfo[] = [];

  // Security risks
  if (metrics.security.summary.critical > 0) {
    risks.push({
      id: 'risk-security-critical',
      category: 'security',
      type: 'critical-vulnerabilities',
      severity: 'critical',
      probability: 0.9,
      impact: 10,
      description: `${metrics.security.summary.critical} critical security vulnerabilities`,
      mitigation: ['Address vulnerabilities immediately', 'Run security scan', 'Update dependencies']
    });
  }

  // Test quality risks
  if (metrics.testResults.failureRate > 0.05) {
    risks.push({
      id: 'risk-test-failures',
      category: 'quality',
      type: 'test-failures',
      severity: 'high',
      probability: metrics.testResults.failureRate,
      impact: 8,
      description: `High test failure rate: ${(metrics.testResults.failureRate * 100).toFixed(1)}%`,
      mitigation: ['Fix failing tests', 'Investigate root causes', 'Improve test stability']
    });
  }

  const riskMatrix: RiskMatrix = {
    critical: risks.filter((r) => r.severity === 'critical').length,
    high: risks.filter((r) => r.severity === 'high').length,
    medium: risks.filter((r) => r.severity === 'medium').length,
    low: risks.filter((r) => r.severity === 'low').length,
    total: risks.length
  };

  const overallRiskLevel: Priority =
    riskMatrix.critical > 0 ? 'critical' :
    riskMatrix.high > 0 ? 'high' :
    riskMatrix.medium > 0 ? 'medium' : 'low';

  const riskScore = riskMatrix.critical * 25 + riskMatrix.high * 15 + riskMatrix.medium * 5 + riskMatrix.low * 2;

  return {
    overallRiskLevel,
    riskScore,
    risks,
    riskMatrix,
    mitigationSummary: `${risks.length} risks identified. ${riskMatrix.critical + riskMatrix.high} require immediate attention.`
  };
}

/**
 * Generate recommendations section
 */
function generateRecommendationsSection(
  metrics: QualityMetrics,
  risksSection: RisksSection
): RecommendationsSection {
  const priorityRecommendations: PriorityRecommendation[] = [];
  const quickWins: string[] = [];
  const longTermImprovements: string[] = [];

  // Coverage recommendations
  if (metrics.coverage.overallPercentage < 80) {
    priorityRecommendations.push({
      priority: 'high',
      recommendation: 'Increase test coverage to 80%',
      category: 'coverage',
      expectedImpact: 'Improved code quality and defect detection',
      effort: 'high',
      timeline: '2-3 weeks'
    });
  }

  // Security recommendations
  if (metrics.security.summary.critical > 0) {
    priorityRecommendations.push({
      priority: 'critical',
      recommendation: 'Address critical security vulnerabilities',
      category: 'security',
      expectedImpact: 'Eliminates critical security risks',
      effort: 'medium',
      timeline: 'Immediate'
    });
  }

  // Quick wins
  if (metrics.testResults.failed > 0 && metrics.testResults.failed < 5) {
    quickWins.push('Fix remaining failing tests');
  }
  if (metrics.codeQuality.duplications > 5) {
    quickWins.push('Reduce code duplication');
  }

  // Long-term improvements
  longTermImprovements.push('Establish quality gates for all deployments');
  longTermImprovements.push('Implement continuous monitoring');

  return {
    priorityRecommendations,
    quickWins,
    longTermImprovements,
    actionPlan: []
  };
}

/**
 * Generate detailed findings
 */
function generateDetailedFindings(
  metrics: QualityMetrics,
  testResults?: TestResult[]
): DetailedFindings {
  return {
    testResultsBreakdown: testResults
      ? {
          total: metrics.testResults.total,
          passed: metrics.testResults.passed,
          failed: metrics.testResults.failed,
          skipped: metrics.testResults.skipped,
          flaky: metrics.testResults.flakyTests,
          suites: []
        }
      : undefined
  };
}

/**
 * Generate conclusion
 */
function generateConclusion(summary: ExecutiveSummary, score: number): string {
  if (summary.deploymentReady) {
    return `Quality assessment completed with a score of ${score.toFixed(1)}/100 (Grade: ${summary.grade}). All critical quality criteria are met. The project is ready for deployment. Continue maintaining high quality standards and address the ${summary.topRecommendations.length} recommendations for further improvement.`;
  } else {
    return `Quality assessment completed with a score of ${score.toFixed(1)}/100 (Grade: ${summary.grade}). ${summary.criticalIssues.length} critical issues must be resolved before deployment. Priority should be given to: ${summary.topRecommendations.join(', ')}. Rerun quality assessment after addressing these issues.`;
  }
}

// ==================== Scoring Functions ====================

/**
 * Calculate overall quality score
 */
function calculateOverallScore(metrics: QualityMetrics): number {
  const weights = {
    coverage: 0.25,
    testQuality: 0.30,
    security: 0.25,
    performance: 0.10,
    codeQuality: 0.10
  };

  const coverageScore = metrics.coverage.overallPercentage;
  const testQualityScore = (1 - metrics.testResults.failureRate) * 100;
  const securityScore = Math.max(0, 100 - metrics.security.summary.critical * 50 - metrics.security.summary.high * 10);
  const performanceScore = (1 - metrics.performance.errorRate) * 100;
  const codeQualityScore = metrics.codeQuality.maintainabilityIndex;

  const weightedScore =
    coverageScore * weights.coverage +
    testQualityScore * weights.testQuality +
    securityScore * weights.security +
    performanceScore * weights.performance +
    codeQualityScore * weights.codeQuality;

  return Math.round(weightedScore * 100) / 100;
}

/**
 * Calculate grade from score
 */
function calculateGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 65) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

/**
 * Calculate status from score
 */
function calculateStatus(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'poor';
  return 'critical';
}

// ==================== Utility Functions ====================

/**
 * Validate parameters
 */
function validateParameters(params: GenerateQualityReportParams): void {
  if (!params.projectId) throw new Error('projectId is required');
  if (!params.metrics) throw new Error('metrics are required');
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `qr-gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create success response
 */
function createSuccessResponse(
  data: QualityReport,
  requestId: string,
  executionTime: number
): QEToolResponse<QualityReport> {
  return {
    success: true,
    data,
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'quality-report-generator',
      version: '1.0.0'
    }
  };
}

/**
 * Create error response
 */
function createErrorResponse(
  error: Error,
  requestId: string,
  executionTime: number
): QEToolResponse<QualityReport> {
  return {
    success: false,
    error: {
      code: 'REPORT_GENERATION_ERROR',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    },
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'quality-report-generator',
      version: '1.0.0'
    }
  };
}
