/**
 * Agentic QE v3 - Test Health Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Monitors test suite health metrics including:
 * - Test pass rates
 * - Test execution times
 * - Test reliability trends
 * - Test suite growth
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';
import { TestExecutionAPI } from '../../domains/test-execution/interfaces';
import { toErrorMessage } from '../../shared/error-utils.js';

const CONFIG: WorkerConfig = {
  id: 'test-health',
  name: 'Test Health Monitor',
  description: 'Monitors test suite health metrics including pass rates, execution times, and reliability',
  intervalMs: 5 * 60 * 1000, // 5 minutes
  priority: 'high',
  targetDomains: ['test-execution', 'test-generation'],
  enabled: true,
  timeoutMs: 60000,
  retryCount: 2,
  retryDelayMs: 5000,
};

interface TestHealthMetrics {
  totalTests: number;
  passingTests: number;
  failingTests: number;
  skippedTests: number;
  avgExecutionTimeMs: number;
  reliability: number; // 0-100
  growth: {
    testsAddedLast7Days: number;
    testsRemovedLast7Days: number;
  };
}

export class TestHealthWorker extends BaseWorker {
  private previousMetrics?: TestHealthMetrics;

  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting test health analysis');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    // Collect current metrics
    const metrics = await this.collectMetrics(context);

    // Analyze metrics
    this.analyzePassRate(metrics, findings, recommendations);
    this.analyzeExecutionTime(metrics, findings, recommendations);
    this.analyzeReliability(metrics, findings, recommendations);
    this.analyzeGrowth(metrics, findings, recommendations);
    this.compareToPrevious(metrics, findings, recommendations);

    // Store current metrics for next comparison
    await context.memory.set('test-health:previous-metrics', metrics);
    this.previousMetrics = metrics;

    const healthScore = this.calculateHealthScore(metrics);
    const trend = this.determineTrend(metrics);

    context.logger.info('Test health analysis complete', {
      healthScore,
      findingsCount: findings.length,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: metrics.totalTests,
        issuesFound: findings.length,
        healthScore,
        trend,
        domainMetrics: {
          passRate: `${((metrics.passingTests / metrics.totalTests) * 100).toFixed(1)}%`,
          avgExecutionTime: `${metrics.avgExecutionTimeMs}ms`,
          reliability: `${metrics.reliability}%`,
          totalTests: metrics.totalTests,
        },
      },
      findings,
      recommendations
    );
  }

  private async collectMetrics(context: WorkerContext): Promise<TestHealthMetrics> {
    // Try to get previous metrics
    const previous = await context.memory.get<TestHealthMetrics>('test-health:previous-metrics');
    if (previous) {
      this.previousMetrics = previous;
    }

    // Try to get metrics from the test-execution domain service
    const testAPI = context.domains.getDomainAPI<TestExecutionAPI>('test-execution');

    if (!testAPI) {
      throw new Error(
        'Test-execution domain not available - cannot compute health metrics. ' +
        'Ensure the test-execution domain is properly initialized before running this worker.'
      );
    }

    try {
      // Query stored test run results from memory
      const recentRunKeys = await context.memory.search('test-health:run-result:*');

      if (recentRunKeys.length === 0) {
        throw new Error(
          'No test run data found in memory - cannot compute health metrics. ' +
          'Run some tests first or ensure test results are being stored with keys matching "test-health:run-result:*".'
        );
      }

      let totalTests = 0;
      let passingTests = 0;
      let failingTests = 0;
      let skippedTests = 0;
      let totalDuration = 0;
      let runCount = 0;

      for (const key of recentRunKeys.slice(0, 50)) {
        const runResult = await context.memory.get<{
          total: number;
          passed: number;
          failed: number;
          skipped: number;
          duration: number;
        }>(key);

        if (runResult) {
          totalTests += runResult.total;
          passingTests += runResult.passed;
          failingTests += runResult.failed;
          skippedTests += runResult.skipped;
          totalDuration += runResult.duration;
          runCount++;
        }
      }

      // Calculate averages
      const avgExecutionTimeMs = runCount > 0 ? Math.round(totalDuration / runCount) : 0;

      // Calculate reliability based on pass rate
      const reliability = totalTests > 0
        ? Math.round((passingTests / totalTests) * 100)
        : 0;

      // Get growth data from stored metrics
      const growthData = await context.memory.get<{
        testsAddedLast7Days: number;
        testsRemovedLast7Days: number;
      }>('test-health:growth-metrics');

      return {
        totalTests: totalTests || 0,
        passingTests: passingTests || 0,
        failingTests: failingTests || 0,
        skippedTests: skippedTests || 0,
        avgExecutionTimeMs,
        reliability,
        growth: {
          testsAddedLast7Days: growthData?.testsAddedLast7Days || 0,
          testsRemovedLast7Days: growthData?.testsRemovedLast7Days || 0,
        },
      };
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      throw new Error(
        `Failed to collect test health metrics: ${errorMessage}. ` +
        'Check memory service connectivity and test result data availability.'
      );
    }
  }

  private analyzePassRate(
    metrics: TestHealthMetrics,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const passRate = (metrics.passingTests / metrics.totalTests) * 100;

    if (passRate < 95) {
      findings.push({
        type: 'low-pass-rate',
        severity: passRate < 90 ? 'high' : 'medium',
        domain: 'test-execution',
        title: 'Low Test Pass Rate',
        description: `Test pass rate is ${passRate.toFixed(1)}%, below the 95% target`,
        context: {
          passing: metrics.passingTests,
          failing: metrics.failingTests,
          total: metrics.totalTests,
        },
      });

      recommendations.push({
        priority: 'p1',
        domain: 'test-execution',
        action: 'Investigate Failing Tests',
        description: `${metrics.failingTests} tests are currently failing. Review and fix to improve pass rate.`,
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: false,
      });
    }
  }

  private analyzeExecutionTime(
    metrics: TestHealthMetrics,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    if (metrics.avgExecutionTimeMs > 500) {
      findings.push({
        type: 'slow-tests',
        severity: metrics.avgExecutionTimeMs > 1000 ? 'high' : 'medium',
        domain: 'test-execution',
        title: 'Slow Test Execution',
        description: `Average test execution time is ${metrics.avgExecutionTimeMs}ms, consider optimization`,
        context: { avgExecutionTimeMs: metrics.avgExecutionTimeMs },
      });

      recommendations.push({
        priority: 'p2',
        domain: 'test-execution',
        action: 'Optimize Test Execution Time',
        description: 'Review and optimize slow-running tests. Consider parallelization or mocking slow dependencies.',
        estimatedImpact: 'medium',
        effort: 'medium',
        autoFixable: false,
      });
    }
  }

  private analyzeReliability(
    metrics: TestHealthMetrics,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    if (metrics.reliability < 95) {
      findings.push({
        type: 'reliability-issue',
        severity: metrics.reliability < 85 ? 'high' : 'medium',
        domain: 'test-execution',
        title: 'Test Reliability Concern',
        description: `Test reliability score is ${metrics.reliability}%, indicating potential flaky tests`,
        context: { reliability: metrics.reliability },
      });

      recommendations.push({
        priority: 'p1',
        domain: 'test-execution',
        action: 'Address Flaky Tests',
        description: 'Identify and fix flaky tests to improve overall test reliability.',
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: false,
      });
    }
  }

  private analyzeGrowth(
    metrics: TestHealthMetrics,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const netGrowth = metrics.growth.testsAddedLast7Days - metrics.growth.testsRemovedLast7Days;

    if (netGrowth < 0) {
      findings.push({
        type: 'test-coverage-decline',
        severity: 'medium',
        domain: 'test-generation',
        title: 'Test Coverage Declining',
        description: `Net loss of ${Math.abs(netGrowth)} tests in the last 7 days`,
        context: {
          added: metrics.growth.testsAddedLast7Days,
          removed: metrics.growth.testsRemovedLast7Days,
        },
      });

      recommendations.push({
        priority: 'p2',
        domain: 'test-generation',
        action: 'Review Test Coverage Strategy',
        description: 'More tests are being removed than added. Ensure adequate test coverage is maintained.',
        estimatedImpact: 'medium',
        effort: 'low',
        autoFixable: false,
      });
    }
  }

  private compareToPrevious(
    current: TestHealthMetrics,
    findings: WorkerFinding[],
    _recommendations: WorkerRecommendation[]
  ): void {
    if (!this.previousMetrics) return;

    const passRateChange =
      (current.passingTests / current.totalTests) -
      (this.previousMetrics.passingTests / this.previousMetrics.totalTests);

    if (passRateChange < -0.05) {
      findings.push({
        type: 'pass-rate-regression',
        severity: 'high',
        domain: 'test-execution',
        title: 'Pass Rate Regression Detected',
        description: `Pass rate dropped by ${(Math.abs(passRateChange) * 100).toFixed(1)}% since last check`,
        context: {
          previousPassRate: `${((this.previousMetrics.passingTests / this.previousMetrics.totalTests) * 100).toFixed(1)}%`,
          currentPassRate: `${((current.passingTests / current.totalTests) * 100).toFixed(1)}%`,
        },
      });
    }
  }

  private calculateHealthScore(metrics: TestHealthMetrics): number {
    const passRateScore = (metrics.passingTests / metrics.totalTests) * 40;
    const reliabilityScore = (metrics.reliability / 100) * 30;
    const executionTimeScore = Math.max(0, 20 - (metrics.avgExecutionTimeMs / 100));
    const growthScore = Math.min(10, (metrics.growth.testsAddedLast7Days / 10) * 10);

    return Math.round(passRateScore + reliabilityScore + executionTimeScore + growthScore);
  }

  private determineTrend(
    current: TestHealthMetrics
  ): 'improving' | 'stable' | 'degrading' {
    if (!this.previousMetrics) return 'stable';

    const currentPassRate = current.passingTests / current.totalTests;
    const previousPassRate =
      this.previousMetrics.passingTests / this.previousMetrics.totalTests;

    if (currentPassRate > previousPassRate + 0.02) return 'improving';
    if (currentPassRate < previousPassRate - 0.02) return 'degrading';
    return 'stable';
  }
}
