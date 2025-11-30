/**
 * Result Aggregator
 *
 * Collects and aggregates test results, coverage data, quality metrics,
 * and other execution data from multiple sources into a unified structure.
 *
 * @module reporting/ResultAggregator
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AggregatedResults,
  TestExecutionResults,
  CoverageData,
  QualityMetricsData,
  PerformanceData,
  SecurityData,
  ExecutionMetadata,
  ExecutionStatus,
  ExecutionSummary,
  ProjectInfo,
  TestSuiteResult
} from './types';
import {
  TestResult,
  QualityMetrics,
  CoverageReport,
  TestResultsSummary,
  SecurityScanResults,
  PerformanceMetrics
} from '../mcp/tools/qe/shared/types';

/**
 * Input data for aggregation
 */
export interface AggregatorInput {
  /** Project information */
  project: ProjectInfo;

  /** Test results */
  testResults?: {
    tests: TestResult[];
    suites?: TestSuiteResult[];
    summary?: TestResultsSummary;
  };

  /** Coverage data */
  coverage?: CoverageReport;

  /** Quality metrics */
  qualityMetrics?: QualityMetrics;

  /** Performance metrics */
  performance?: PerformanceMetrics;

  /** Security scan results */
  security?: SecurityScanResults;

  /** Execution metadata */
  metadata?: Partial<ExecutionMetadata>;
}

/**
 * Result Aggregator
 *
 * @example
 * ```typescript
 * const aggregator = new ResultAggregator();
 *
 * const results = aggregator.aggregate({
 *   project: { name: 'my-project', version: '1.0.0' },
 *   testResults: { tests: [...], summary: {...} },
 *   coverage: coverageData,
 *   qualityMetrics: metrics
 * });
 * ```
 */
export class ResultAggregator {
  private executionId: string;
  private startTime: number;

  constructor() {
    this.executionId = uuidv4();
    this.startTime = Date.now();
  }

  /**
   * Aggregate results from multiple sources
   */
  aggregate(input: AggregatorInput): AggregatedResults {
    const now = new Date().toISOString();
    const executionDuration = Date.now() - this.startTime;

    // Aggregate test results
    const testResults = this.aggregateTestResults(input.testResults);

    // Aggregate coverage data
    const coverage = this.aggregateCoverage(input.coverage);

    // Aggregate quality metrics
    const qualityMetrics = this.aggregateQualityMetrics(input.qualityMetrics);

    // Aggregate performance data
    const performance = this.aggregatePerformance(input.performance);

    // Aggregate security data
    const security = this.aggregateSecurity(input.security);

    // Build execution metadata
    const metadata = this.buildMetadata(input.metadata, executionDuration);

    // Calculate overall status
    const status = this.calculateStatus(testResults, coverage, qualityMetrics, security);

    // Generate summary
    const summary = this.generateSummary(
      testResults,
      coverage,
      qualityMetrics,
      security,
      status
    );

    return {
      executionId: this.executionId,
      timestamp: now,
      project: input.project,
      testResults,
      coverage,
      qualityMetrics,
      performance,
      security,
      metadata,
      status,
      summary
    };
  }

  /**
   * Aggregate test results
   */
  private aggregateTestResults(
    input?: AggregatorInput['testResults']
  ): TestExecutionResults {
    if (!input || !input.tests) {
      return {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        tests: [],
        passRate: 0,
        failureRate: 0
      };
    }

    const tests = input.tests;
    const summary = input.summary;

    // Calculate totals
    const total = summary?.total || tests.length;
    const passed = summary?.passed || tests.filter(t => t.status === 'passed').length;
    const failed = summary?.failed || tests.filter(t => t.status === 'failed').length;
    const skipped = summary?.skipped || tests.filter(t => t.status === 'skipped').length;
    const flaky = summary?.flakyTests;
    const duration = summary?.duration || tests.reduce((sum, t) => sum + t.duration, 0);

    const passRate = total > 0 ? passed / total : 0;
    const failureRate = total > 0 ? failed / total : 0;

    return {
      total,
      passed,
      failed,
      skipped,
      flaky,
      duration,
      tests,
      suites: input.suites,
      passRate,
      failureRate
    };
  }

  /**
   * Aggregate coverage data
   */
  private aggregateCoverage(input?: CoverageReport): CoverageData | undefined {
    if (!input) {
      return undefined;
    }

    const { summary, files } = input;

    return {
      overall: summary.overallPercentage,
      lines: {
        total: summary.totalLines,
        covered: summary.coveredLines,
        uncovered: summary.totalLines - summary.coveredLines,
        percentage: summary.totalLines > 0
          ? (summary.coveredLines / summary.totalLines) * 100
          : 0
      },
      branches: {
        total: summary.totalBranches,
        covered: summary.coveredBranches,
        uncovered: summary.totalBranches - summary.coveredBranches,
        percentage: summary.totalBranches > 0
          ? (summary.coveredBranches / summary.totalBranches) * 100
          : 0
      },
      functions: {
        total: summary.totalFunctions,
        covered: summary.coveredFunctions,
        uncovered: summary.totalFunctions - summary.coveredFunctions,
        percentage: summary.totalFunctions > 0
          ? (summary.coveredFunctions / summary.totalFunctions) * 100
          : 0
      },
      statements: {
        total: summary.totalLines, // Approximation
        covered: summary.coveredLines,
        uncovered: summary.totalLines - summary.coveredLines,
        percentage: summary.totalLines > 0
          ? (summary.coveredLines / summary.totalLines) * 100
          : 0
      },
      files: files.map(file => ({
        path: file.path,
        lines: {
          total: file.lines.total,
          covered: file.lines.covered,
          uncovered: file.lines.uncovered.length,
          percentage: file.lines.percentage
        },
        branches: {
          total: file.branches.total,
          covered: file.branches.covered,
          uncovered: file.branches.uncovered.length,
          percentage: file.branches.percentage
        },
        functions: {
          total: file.functions.total,
          covered: file.functions.covered,
          uncovered: file.functions.uncovered.length,
          percentage: file.functions.percentage
        },
        uncoveredLines: file.lines.uncovered
      }))
    };
  }

  /**
   * Aggregate quality metrics
   */
  private aggregateQualityMetrics(
    input?: QualityMetrics
  ): QualityMetricsData | undefined {
    if (!input) {
      return undefined;
    }

    // Calculate overall quality score (weighted)
    const weights = {
      coverage: 0.3,
      testQuality: 0.25,
      security: 0.25,
      codeQuality: 0.2
    };

    const coverageScore = input.coverage.overallPercentage;
    const testQualityScore = (1 - input.testResults.failureRate) * 100;
    const securityScore = Math.max(
      0,
      100 - input.security.summary.critical * 50 - input.security.summary.high * 10
    );
    const codeQualityScore = input.codeQuality.maintainabilityIndex;

    const score = Math.round(
      coverageScore * weights.coverage +
      testQualityScore * weights.testQuality +
      securityScore * weights.security +
      codeQualityScore * weights.codeQuality
    );

    // Calculate grade
    const grade = this.calculateGrade(score);

    return {
      score,
      grade,
      codeQuality: {
        maintainabilityIndex: input.codeQuality.maintainabilityIndex,
        cyclomaticComplexity: input.codeQuality.cyclomaticComplexity,
        technicalDebt: input.codeQuality.technicalDebt,
        codeSmells: input.codeQuality.codeSmells,
        duplications: input.codeQuality.duplications
      },
      gatesPassed: 0, // Will be calculated by quality gate evaluation
      gatesFailed: 0
    };
  }

  /**
   * Aggregate performance data
   */
  private aggregatePerformance(
    input?: PerformanceMetrics
  ): PerformanceData | undefined {
    if (!input) {
      return undefined;
    }

    return {
      responseTime: {
        min: 0, // Not provided in input
        max: input.responseTime.max,
        mean: (input.responseTime.p50 + input.responseTime.p95 + input.responseTime.p99) / 3,
        median: input.responseTime.p50,
        p95: input.responseTime.p95,
        p99: input.responseTime.p99
      },
      throughput: input.throughput,
      errorRate: input.errorRate,
      resources: {
        cpu: input.resourceUsage.cpu,
        memory: input.resourceUsage.memory,
        disk: input.resourceUsage.disk
      }
    };
  }

  /**
   * Aggregate security data
   */
  private aggregateSecurity(
    input?: SecurityScanResults
  ): SecurityData | undefined {
    if (!input) {
      return undefined;
    }

    const total =
      input.summary.critical +
      input.summary.high +
      input.summary.medium +
      input.summary.low;

    // Calculate security score
    const score = Math.max(
      0,
      100 -
      input.summary.critical * 50 -
      input.summary.high * 15 -
      input.summary.medium * 5 -
      input.summary.low * 1
    );

    return {
      total,
      summary: {
        critical: input.summary.critical,
        high: input.summary.high,
        medium: input.summary.medium,
        low: input.summary.low,
        info: 0 // Default to 0 if not provided
      },
      score,
      vulnerabilities: input.vulnerabilities.map(v => ({
        id: v.id,
        severity: v.severity,
        title: v.title,
        description: v.description,
        file: v.file,
        cwe: v.cwe,
        cvss: v.cvss
      }))
    };
  }

  /**
   * Build execution metadata
   */
  private buildMetadata(
    input?: Partial<ExecutionMetadata>,
    duration?: number
  ): ExecutionMetadata {
    const now = new Date().toISOString();
    const startTime = new Date(this.startTime).toISOString();

    return {
      startedAt: input?.startedAt || startTime,
      completedAt: input?.completedAt || now,
      duration: duration || Date.now() - this.startTime,
      ci: input?.ci,
      agent: input?.agent,
      environment: input?.environment
    };
  }

  /**
   * Calculate overall execution status
   */
  private calculateStatus(
    testResults: TestExecutionResults,
    coverage?: CoverageData,
    qualityMetrics?: QualityMetricsData,
    security?: SecurityData
  ): ExecutionStatus {
    // Critical failure: tests failed
    if (testResults.failureRate > 0.05) {
      return 'failure';
    }

    // Critical failure: critical security vulnerabilities
    if (security && security.summary.critical > 0) {
      return 'failure';
    }

    // Warning: low coverage
    if (coverage && coverage.overall < 70) {
      return 'warning';
    }

    // Warning: high security vulnerabilities
    if (security && security.summary.high > 0) {
      return 'warning';
    }

    // Warning: low quality score
    if (qualityMetrics && qualityMetrics.score < 70) {
      return 'warning';
    }

    return 'success';
  }

  /**
   * Generate execution summary
   */
  private generateSummary(
    testResults: TestExecutionResults,
    coverage?: CoverageData,
    qualityMetrics?: QualityMetricsData,
    security?: SecurityData,
    status?: ExecutionStatus
  ): ExecutionSummary {
    const highlights: string[] = [];
    const recommendations: string[] = [];
    let criticalIssues = 0;
    let warnings = 0;

    // Test results analysis
    if (testResults.passRate >= 0.95) {
      highlights.push(`Excellent test pass rate: ${(testResults.passRate * 100).toFixed(1)}%`);
    } else if (testResults.failureRate > 0.05) {
      criticalIssues++;
      recommendations.push('Fix failing tests before deployment');
    }

    // Coverage analysis
    if (coverage) {
      if (coverage.overall >= 80) {
        highlights.push(`Good code coverage: ${coverage.overall.toFixed(1)}%`);
      } else if (coverage.overall < 70) {
        warnings++;
        recommendations.push(`Increase code coverage to minimum 80% (current: ${coverage.overall.toFixed(1)}%)`);
      }
    }

    // Security analysis
    if (security) {
      if (security.summary.critical > 0) {
        criticalIssues += security.summary.critical;
        recommendations.push(`Address ${security.summary.critical} critical security vulnerabilities immediately`);
      } else if (security.summary.high === 0 && security.summary.medium === 0) {
        highlights.push('No security vulnerabilities detected');
      }
    }

    // Quality analysis
    if (qualityMetrics) {
      if (qualityMetrics.score >= 85) {
        highlights.push(`High quality score: ${qualityMetrics.score} (${qualityMetrics.grade})`);
      } else if (qualityMetrics.score < 70) {
        warnings++;
        recommendations.push('Improve code quality metrics');
      }
    }

    // Deployment readiness
    const deploymentReady =
      status === 'success' &&
      criticalIssues === 0 &&
      testResults.failureRate <= 0.05;

    // Status message
    const message = this.generateStatusMessage(
      status || 'success',
      testResults,
      coverage,
      security
    );

    return {
      status: status || 'success',
      message,
      criticalIssues,
      warnings,
      recommendations: recommendations.slice(0, 5),
      deploymentReady,
      highlights: highlights.slice(0, 5)
    };
  }

  /**
   * Generate status message
   */
  private generateStatusMessage(
    status: ExecutionStatus,
    testResults: TestExecutionResults,
    coverage?: CoverageData,
    security?: SecurityData
  ): string {
    switch (status) {
      case 'success':
        return 'All quality checks passed. Ready for deployment.';

      case 'warning':
        return `Quality checks completed with warnings. ${testResults.passed}/${testResults.total} tests passed. Review warnings before deployment.`;

      case 'failure':
        const issues: string[] = [];
        if (testResults.failed > 0) {
          issues.push(`${testResults.failed} test(s) failed`);
        }
        if (security?.summary.critical && security.summary.critical > 0) {
          issues.push(`${security.summary.critical} critical security issue(s)`);
        }
        return `Quality checks failed: ${issues.join(', ')}. Deployment blocked.`;

      case 'error':
        return 'Quality check execution encountered errors.';

      default:
        return 'Quality check status unknown.';
    }
  }

  /**
   * Calculate quality grade
   */
  private calculateGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 95) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 75) return 'B';
    if (score >= 65) return 'C';
    if (score >= 55) return 'D';
    return 'F';
  }

  /**
   * Reset aggregator for new execution
   */
  reset(): void {
    this.executionId = uuidv4();
    this.startTime = Date.now();
  }

  /**
   * Get current execution ID
   */
  getExecutionId(): string {
    return this.executionId;
  }
}
