/**
 * Agentic QE v3 - Flaky Test Detector Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Detects flaky test patterns including:
 * - Tests with inconsistent results
 * - Time-sensitive tests
 * - Order-dependent tests
 * - Resource contention issues
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

const CONFIG: WorkerConfig = {
  id: 'flaky-detector',
  name: 'Flaky Test Detector',
  description: 'Detects flaky test patterns through statistical analysis of test execution history',
  intervalMs: 15 * 60 * 1000, // 15 minutes
  priority: 'high',
  targetDomains: ['test-execution'],
  enabled: true,
  timeoutMs: 180000,
  retryCount: 2,
  retryDelayMs: 10000,
};

interface TestExecutionHistory {
  testId: string;
  testName: string;
  file: string;
  executions: Array<{
    timestamp: Date;
    passed: boolean;
    durationMs: number;
    error?: string;
  }>;
}

interface FlakyTestResult {
  testId: string;
  testName: string;
  file: string;
  flakinessScore: number; // 0-100, higher = more flaky
  pattern: 'intermittent' | 'timing' | 'order-dependent' | 'resource' | 'unknown';
  passRate: number;
  avgDuration: number;
  durationVariance: number;
  recentFailures: number;
  suggestedFix?: string;
}

export class FlakyDetectorWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting flaky test detection');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    // Collect test execution history
    const history = await this.collectTestHistory(context);

    // Analyze for flakiness
    const flakyTests = this.detectFlakyTests(history);

    // Generate findings
    this.generateFindings(flakyTests, findings, recommendations);

    // Store results
    await context.memory.set('flaky:detected', flakyTests);
    await context.memory.set('flaky:lastAnalysis', new Date().toISOString());

    const healthScore = this.calculateHealthScore(history.length, flakyTests);

    context.logger.info('Flaky test detection complete', {
      healthScore,
      testsAnalyzed: history.length,
      flakyTestsFound: flakyTests.length,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: history.length,
        issuesFound: flakyTests.length,
        healthScore,
        trend: 'stable',
        domainMetrics: {
          testsAnalyzed: history.length,
          flakyTests: flakyTests.length,
          flakinessRate: `${((flakyTests.length / history.length) * 100).toFixed(1)}%`,
          avgFlakinessScore: flakyTests.length > 0
            ? (flakyTests.reduce((sum, t) => sum + t.flakinessScore, 0) / flakyTests.length).toFixed(1)
            : '0',
        },
      },
      findings,
      recommendations
    );
  }

  private async collectTestHistory(context: WorkerContext): Promise<TestExecutionHistory[]> {
    // Try to get test execution data from the test-execution domain service
    const testAPI = context.domains.getDomainAPI<TestExecutionAPI>('test-execution');

    if (!testAPI) {
      throw new Error(
        'Test-execution domain not available - cannot detect flaky tests. ' +
        'Ensure the test-execution domain is properly initialized before running this worker.'
      );
    }

    // Query stored test execution history from memory
    const historyKeys = await context.memory.search('flaky:history:*');

    if (historyKeys.length === 0) {
      throw new Error(
        'No test execution history found in memory - cannot detect flaky tests. ' +
        'Run tests multiple times and ensure history is stored with keys matching "flaky:history:*" before running this worker.'
      );
    }

    const results: TestExecutionHistory[] = [];
    const failedKeys: string[] = [];

    for (const key of historyKeys) {
      try {
        const data = await context.memory.get<TestExecutionHistory>(key);
        if (data) {
          results.push(data);
        }
      } catch (error) {
        failedKeys.push(key);
      }
    }

    if (results.length === 0) {
      throw new Error(
        `Found ${historyKeys.length} test history keys but failed to retrieve any data. ` +
        `Failed keys: ${failedKeys.slice(0, 5).join(', ')}${failedKeys.length > 5 ? '...' : ''}. ` +
        'Check memory service connectivity and data format.'
      );
    }

    return results;
  }

  private detectFlakyTests(history: TestExecutionHistory[]): FlakyTestResult[] {
    const flakyTests: FlakyTestResult[] = [];

    for (const test of history) {
      const result = this.analyzeTestFlakiness(test);
      if (result.flakinessScore > 20) {
        flakyTests.push(result);
      }
    }

    // Sort by flakiness score descending
    return flakyTests.sort((a, b) => b.flakinessScore - a.flakinessScore);
  }

  private analyzeTestFlakiness(test: TestExecutionHistory): FlakyTestResult {
    const executions = test.executions;
    const passCount = executions.filter((e) => e.passed).length;
    const passRate = passCount / executions.length;

    // Calculate duration statistics
    const durations = executions.map((e) => e.durationMs);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);
    const durationVariance = stdDev / avgDuration; // Coefficient of variation

    // Recent failures (last 5 executions)
    const recentFailures = executions.slice(-5).filter((e) => !e.passed).length;

    // Determine pattern
    const pattern = this.determinePattern(test, durationVariance);

    // Calculate flakiness score
    let flakinessScore = 0;

    // If not 100% pass and not 0% pass, it's potentially flaky
    if (passRate > 0 && passRate < 1) {
      flakinessScore += (1 - passRate) * 50; // Up to 50 points for failure rate
    }

    // High duration variance indicates timing issues
    if (durationVariance > 0.5) {
      flakinessScore += Math.min(25, durationVariance * 10);
    }

    // Recent failures are more concerning
    flakinessScore += recentFailures * 5;

    // Suggest fix based on pattern
    const suggestedFix = this.suggestFix(pattern);

    return {
      testId: test.testId,
      testName: test.testName,
      file: test.file,
      flakinessScore: Math.min(100, Math.round(flakinessScore)),
      pattern,
      passRate: passRate * 100,
      avgDuration,
      durationVariance,
      recentFailures,
      suggestedFix,
    };
  }

  private determinePattern(
    test: TestExecutionHistory,
    durationVariance: number
  ): 'intermittent' | 'timing' | 'order-dependent' | 'resource' | 'unknown' {
    const failures = test.executions.filter((e) => !e.passed);

    // Check for timing issues (high variance, timeout errors)
    if (durationVariance > 1 || failures.some((f) => f.error?.includes('Timeout'))) {
      return 'timing';
    }

    // Check for resource contention
    if (failures.some((f) => f.error?.includes('Resource') || f.error?.includes('connection'))) {
      return 'resource';
    }

    // Check for race conditions
    if (failures.some((f) => f.error?.includes('Race') || f.error?.includes('async'))) {
      return 'intermittent';
    }

    // Check for order dependency (consistent pattern)
    const results = test.executions.map((e) => e.passed);
    if (this.hasOrderPattern(results)) {
      return 'order-dependent';
    }

    return 'intermittent';
  }

  private hasOrderPattern(results: boolean[]): boolean {
    // Check if failures tend to occur at specific positions
    // Simple heuristic: if all failures are at even or odd indices
    const failureIndices = results
      .map((r, i) => (r ? -1 : i))
      .filter((i) => i >= 0);

    if (failureIndices.length < 2) return false;

    const allEven = failureIndices.every((i) => i % 2 === 0);
    const allOdd = failureIndices.every((i) => i % 2 === 1);

    return allEven || allOdd;
  }

  private suggestFix(pattern: FlakyTestResult['pattern']): string {
    switch (pattern) {
      case 'timing':
        return 'Add explicit waits, increase timeouts, or use async utilities like waitFor';
      case 'resource':
        return 'Ensure proper resource cleanup, use test isolation, or implement connection pooling';
      case 'order-dependent':
        return 'Make tests independent, reset state in beforeEach, avoid shared mutable state';
      case 'intermittent':
        return 'Add retry logic, investigate race conditions, or use proper synchronization';
      default:
        return 'Review test for potential issues with async operations or shared state';
    }
  }

  private generateFindings(
    flakyTests: FlakyTestResult[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    // Group by severity
    const critical = flakyTests.filter((t) => t.flakinessScore >= 70);
    const high = flakyTests.filter((t) => t.flakinessScore >= 50 && t.flakinessScore < 70);
    const medium = flakyTests.filter((t) => t.flakinessScore >= 20 && t.flakinessScore < 50);

    for (const test of critical) {
      findings.push({
        type: 'critical-flaky-test',
        severity: 'critical',
        domain: 'test-execution',
        title: `Critical Flaky Test: ${test.testName}`,
        description: `Test has ${test.flakinessScore}% flakiness score with ${test.passRate.toFixed(0)}% pass rate`,
        resource: test.file,
        context: {
          testId: test.testId,
          pattern: test.pattern,
          recentFailures: test.recentFailures,
          suggestedFix: test.suggestedFix,
        },
      });
    }

    for (const test of high) {
      findings.push({
        type: 'high-flaky-test',
        severity: 'high',
        domain: 'test-execution',
        title: `Flaky Test: ${test.testName}`,
        description: `Test has ${test.flakinessScore}% flakiness score (${test.pattern} pattern)`,
        resource: test.file,
        context: {
          testId: test.testId,
          pattern: test.pattern,
          suggestedFix: test.suggestedFix,
        },
      });
    }

    for (const test of medium) {
      findings.push({
        type: 'medium-flaky-test',
        severity: 'medium',
        domain: 'test-execution',
        title: `Potentially Flaky Test: ${test.testName}`,
        description: `Test shows flakiness indicators (score: ${test.flakinessScore}%)`,
        resource: test.file,
        context: {
          testId: test.testId,
          pattern: test.pattern,
        },
      });
    }

    // Generate recommendations
    if (critical.length > 0) {
      recommendations.push({
        priority: 'p0',
        domain: 'test-execution',
        action: 'Fix Critical Flaky Tests',
        description: `${critical.length} tests have critical flakiness. These severely impact CI reliability.`,
        estimatedImpact: 'high',
        effort: 'high',
        autoFixable: false,
      });
    }

    // Pattern-specific recommendations
    const timingTests = flakyTests.filter((t) => t.pattern === 'timing');
    if (timingTests.length > 0) {
      recommendations.push({
        priority: 'p1',
        domain: 'test-execution',
        action: 'Address Timing-Related Flakiness',
        description: `${timingTests.length} tests have timing issues. Consider using proper async utilities.`,
        estimatedImpact: 'medium',
        effort: 'medium',
        autoFixable: false,
      });
    }
  }

  private calculateHealthScore(totalTests: number, flakyTests: FlakyTestResult[]): number {
    if (totalTests === 0) return 100;

    const flakyRate = flakyTests.length / totalTests;
    const avgFlakiness = flakyTests.length > 0
      ? flakyTests.reduce((sum, t) => sum + t.flakinessScore, 0) / flakyTests.length
      : 0;

    // Penalize based on flaky rate and average flakiness
    let score = 100;
    score -= flakyRate * 50; // Up to 50 points for flaky rate
    score -= (avgFlakiness / 100) * 30; // Up to 30 points for severity

    // Critical flaky tests have extra penalty
    const criticalCount = flakyTests.filter((t) => t.flakinessScore >= 70).length;
    score -= criticalCount * 5;

    return Math.max(0, Math.round(score));
  }
}
