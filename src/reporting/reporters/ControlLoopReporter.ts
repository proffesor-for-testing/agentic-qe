/**
 * Control Loop Reporter
 *
 * Generates machine-readable feedback for automated control systems,
 * CI/CD pipelines, and decision-making engines. Provides actionable
 * signals, threshold violations, and recommended actions.
 *
 * @module reporting/reporters/ControlLoopReporter
 * @version 1.0.0
 */

import {
  Reporter,
  ReporterConfig,
  ReportFormat,
  ReporterOutput,
  AggregatedResults,
  ControlLoopFeedback,
  ControlLoopAction,
  ThresholdViolation
} from '../types';

/**
 * Control loop configuration
 */
export interface ControlLoopConfig extends Partial<ReporterConfig> {
  /** Deployment threshold - minimum test pass rate */
  minPassRate?: number;

  /** Coverage threshold */
  minCoverage?: number;

  /** Quality score threshold */
  minQualityScore?: number;

  /** Security score threshold */
  minSecurityScore?: number;

  /** Maximum allowed critical vulnerabilities */
  maxCriticalVulnerabilities?: number;

  /** Maximum allowed high vulnerabilities */
  maxHighVulnerabilities?: number;

  /** Performance P95 threshold (ms) */
  maxP95ResponseTime?: number;

  /** Error rate threshold (0-1) */
  maxErrorRate?: number;

  /** Flaky test threshold */
  maxFlakyTests?: number;
}

/**
 * Control Loop Reporter
 *
 * Designed for automated systems to consume test results and make
 * deployment decisions based on quality gates and thresholds.
 *
 * @example
 * ```typescript
 * const reporter = new ControlLoopReporter({
 *   minPassRate: 0.95,
 *   minCoverage: 80,
 *   maxCriticalVulnerabilities: 0
 * });
 *
 * const output = reporter.report(aggregatedResults);
 * const feedback = JSON.parse(output.content) as ControlLoopFeedback;
 *
 * if (!feedback.signals.canDeploy) {
 *   // Block deployment
 *   process.exit(1);
 * }
 * ```
 */
export class ControlLoopReporter implements Reporter {
  private config: ReporterConfig;
  private thresholds: {
    minPassRate: number;
    minCoverage: number;
    minQualityScore: number;
    minSecurityScore: number;
    maxCriticalVulnerabilities: number;
    maxHighVulnerabilities: number;
    maxP95ResponseTime: number;
    maxErrorRate: number;
    maxFlakyTests: number;
  };

  constructor(config: ControlLoopConfig = {}) {
    this.config = {
      format: 'control-loop',
      detailLevel: config.detailLevel || 'detailed',
      prettyPrint: config.prettyPrint !== undefined ? config.prettyPrint : false,
      includeTimestamps: config.includeTimestamps !== undefined ? config.includeTimestamps : true,
      includeMetadata: config.includeMetadata !== undefined ? config.includeMetadata : true
    };

    // Set default thresholds
    this.thresholds = {
      minPassRate: config.minPassRate ?? 0.95,
      minCoverage: config.minCoverage ?? 80,
      minQualityScore: config.minQualityScore ?? 70,
      minSecurityScore: config.minSecurityScore ?? 80,
      maxCriticalVulnerabilities: config.maxCriticalVulnerabilities ?? 0,
      maxHighVulnerabilities: config.maxHighVulnerabilities ?? 2,
      maxP95ResponseTime: config.maxP95ResponseTime ?? 1000,
      maxErrorRate: config.maxErrorRate ?? 0.01,
      maxFlakyTests: config.maxFlakyTests ?? 5
    };
  }

  /**
   * Generate control loop feedback
   */
  report(results: AggregatedResults): ReporterOutput {
    const startTime = Date.now();

    // Build control loop feedback
    const feedback = this.buildFeedback(results);

    // Serialize to JSON
    const content = this.config.prettyPrint
      ? JSON.stringify(feedback, null, 2)
      : JSON.stringify(feedback);

    const generationDuration = Date.now() - startTime;

    return {
      format: 'control-loop',
      content,
      timestamp: new Date().toISOString(),
      size: Buffer.byteLength(content, 'utf8'),
      generationDuration
    };
  }

  /**
   * Build control loop feedback structure
   */
  private buildFeedback(results: AggregatedResults): ControlLoopFeedback {
    // Calculate metrics
    const metrics = this.calculateMetrics(results);

    // Detect signals
    const signals = this.detectSignals(results, metrics);

    // Generate actions
    const actions = this.generateActions(results, signals);

    // Detect violations
    const violations = this.detectViolations(results, metrics);

    // Generate next steps
    const nextSteps = this.generateNextSteps(signals, violations);

    return {
      executionId: results.executionId,
      timestamp: results.timestamp,
      status: results.status,
      success: results.status === 'success',
      qualityScore: results.qualityMetrics?.score || 0,
      metrics,
      signals,
      actions,
      violations,
      nextSteps
    };
  }

  /**
   * Calculate key metrics for decision making
   */
  private calculateMetrics(results: AggregatedResults) {
    return {
      testPassRate: results.testResults.passRate,
      coveragePercentage: results.coverage?.overall || 0,
      securityScore: results.security?.score || 100,
      performanceScore: this.calculatePerformanceScore(results.performance),
      qualityGatesPassed: results.qualityMetrics?.gatesPassed || 0,
      qualityGatesFailed: results.qualityMetrics?.gatesFailed || 0
    };
  }

  /**
   * Calculate performance score (0-100)
   */
  private calculatePerformanceScore(performance?: any): number {
    if (!performance) return 100;

    let score = 100;

    // Penalize high P95 response time
    if (performance.responseTime.p95 > this.thresholds.maxP95ResponseTime) {
      const excess = performance.responseTime.p95 - this.thresholds.maxP95ResponseTime;
      score -= Math.min(50, (excess / this.thresholds.maxP95ResponseTime) * 50);
    }

    // Penalize high error rate
    if (performance.errorRate > this.thresholds.maxErrorRate) {
      const excess = performance.errorRate - this.thresholds.maxErrorRate;
      score -= Math.min(30, (excess / this.thresholds.maxErrorRate) * 30);
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * Detect actionable signals
   */
  private detectSignals(results: AggregatedResults, metrics: any) {
    const { testResults, coverage, security, qualityMetrics, performance } = results;

    // Can deploy
    const canDeploy =
      metrics.testPassRate >= this.thresholds.minPassRate &&
      metrics.coveragePercentage >= this.thresholds.minCoverage &&
      (!security || security.summary.critical <= this.thresholds.maxCriticalVulnerabilities) &&
      (!security || security.summary.high <= this.thresholds.maxHighVulnerabilities) &&
      (!qualityMetrics || qualityMetrics.score >= this.thresholds.minQualityScore) &&
      testResults.failed === 0;

    // Critical issues found
    const criticalIssuesFound =
      testResults.failed > 0 ||
      (security?.summary.critical || 0) > 0 ||
      (qualityMetrics?.score || 100) < this.thresholds.minQualityScore;

    // Coverage decreased (comparing against threshold)
    const coverageDecreased = (coverage?.overall || 0) < this.thresholds.minCoverage;

    // Performance degraded
    const performanceDegraded =
      performance?.responseTime.p95 && performance.responseTime.p95 > this.thresholds.maxP95ResponseTime ||
      performance?.errorRate && performance.errorRate > this.thresholds.maxErrorRate;

    // Security risks
    const securityRisks =
      (security?.summary.critical || 0) > this.thresholds.maxCriticalVulnerabilities ||
      (security?.summary.high || 0) > this.thresholds.maxHighVulnerabilities;

    // Tests unstable (flaky or inconsistent)
    const testsUnstable =
      (testResults.flaky || 0) > this.thresholds.maxFlakyTests;

    return {
      canDeploy,
      criticalIssuesFound,
      coverageDecreased,
      performanceDegraded: performanceDegraded || false,
      securityRisks,
      testsUnstable
    };
  }

  /**
   * Generate recommended actions
   */
  private generateActions(
    results: AggregatedResults,
    signals: any
  ): ControlLoopAction[] {
    const actions: ControlLoopAction[] = [];

    // Block deployment if critical issues
    if (!signals.canDeploy) {
      actions.push({
        type: 'block_deployment',
        priority: 'critical',
        reason: 'Quality gates not met - deployment blocked',
        resolution: 'Fix failing tests, address security vulnerabilities, and improve coverage'
      });
    }

    // Require review for security risks
    if (signals.securityRisks) {
      actions.push({
        type: 'require_review',
        priority: 'critical',
        reason: `Critical or high severity vulnerabilities detected: ${results.security?.summary.critical || 0} critical, ${results.security?.summary.high || 0} high`,
        resolution: 'Security team review required before deployment'
      });
    }

    // Alert on performance degradation
    if (signals.performanceDegraded) {
      actions.push({
        type: 'alert',
        priority: 'high',
        reason: 'Performance metrics degraded beyond acceptable thresholds',
        resolution: 'Investigate performance issues and optimize before deployment'
      });
    }

    // Alert on coverage decrease
    if (signals.coverageDecreased) {
      actions.push({
        type: 'alert',
        priority: 'medium',
        reason: `Code coverage below threshold: ${results.coverage?.overall.toFixed(1)}% < ${this.thresholds.minCoverage}%`,
        resolution: 'Add tests to increase coverage'
      });
    }

    // Retry for flaky tests
    if (signals.testsUnstable) {
      actions.push({
        type: 'retry',
        priority: 'medium',
        reason: `Flaky tests detected: ${results.testResults.flaky || 0} tests`,
        resolution: 'Retry test execution or investigate test stability'
      });
    }

    // Approve if all checks passed
    if (signals.canDeploy && !signals.criticalIssuesFound) {
      actions.push({
        type: 'approve',
        priority: 'low',
        reason: 'All quality gates passed',
        resolution: 'Ready for deployment'
      });
    }

    return actions;
  }

  /**
   * Detect threshold violations
   */
  private detectViolations(
    results: AggregatedResults,
    metrics: any
  ): ThresholdViolation[] {
    const violations: ThresholdViolation[] = [];

    // Test pass rate violation
    if (metrics.testPassRate < this.thresholds.minPassRate) {
      violations.push({
        metric: 'testPassRate',
        threshold: this.thresholds.minPassRate,
        actualValue: metrics.testPassRate,
        operator: 'gte',
        severity: 'critical',
        impact: 'Deployment blocked due to test failures'
      });
    }

    // Coverage violation
    if (metrics.coveragePercentage < this.thresholds.minCoverage) {
      violations.push({
        metric: 'coverage',
        threshold: this.thresholds.minCoverage,
        actualValue: metrics.coveragePercentage,
        operator: 'gte',
        severity: 'high',
        impact: 'Insufficient test coverage may lead to undetected bugs'
      });
    }

    // Quality score violation
    if (metrics.qualityScore < this.thresholds.minQualityScore) {
      violations.push({
        metric: 'qualityScore',
        threshold: this.thresholds.minQualityScore,
        actualValue: metrics.qualityScore,
        operator: 'gte',
        severity: 'high',
        impact: 'Code quality below acceptable standards'
      });
    }

    // Security score violation
    if (metrics.securityScore < this.thresholds.minSecurityScore) {
      violations.push({
        metric: 'securityScore',
        threshold: this.thresholds.minSecurityScore,
        actualValue: metrics.securityScore,
        operator: 'gte',
        severity: 'critical',
        impact: 'Security vulnerabilities pose risk to production'
      });
    }

    // Critical vulnerabilities violation
    const criticalVulns = results.security?.summary.critical || 0;
    if (criticalVulns > this.thresholds.maxCriticalVulnerabilities) {
      violations.push({
        metric: 'criticalVulnerabilities',
        threshold: this.thresholds.maxCriticalVulnerabilities,
        actualValue: criticalVulns,
        operator: 'lte',
        severity: 'critical',
        impact: 'Critical security vulnerabilities must be addressed immediately'
      });
    }

    // Performance violation (P95)
    if (results.performance?.responseTime.p95 &&
        results.performance.responseTime.p95 > this.thresholds.maxP95ResponseTime) {
      violations.push({
        metric: 'p95ResponseTime',
        threshold: this.thresholds.maxP95ResponseTime,
        actualValue: results.performance.responseTime.p95,
        operator: 'lte',
        severity: 'medium',
        impact: 'Performance degradation may affect user experience'
      });
    }

    // Error rate violation
    if (results.performance?.errorRate &&
        results.performance.errorRate > this.thresholds.maxErrorRate) {
      violations.push({
        metric: 'errorRate',
        threshold: this.thresholds.maxErrorRate,
        actualValue: results.performance.errorRate,
        operator: 'lte',
        severity: 'high',
        impact: 'High error rate indicates system instability'
      });
    }

    return violations;
  }

  /**
   * Generate next steps based on signals and violations
   */
  private generateNextSteps(signals: any, violations: ThresholdViolation[]): string[] {
    const steps: string[] = [];

    // Deployment decision
    if (signals.canDeploy) {
      steps.push('✓ Quality gates passed - proceed with deployment');
    } else {
      steps.push('✗ Quality gates failed - deployment blocked');
    }

    // Critical violations
    const criticalViolations = violations.filter(v => v.severity === 'critical');
    if (criticalViolations.length > 0) {
      steps.push(`→ Address ${criticalViolations.length} critical violation(s) immediately`);
      criticalViolations.forEach(v => {
        steps.push(`  - Fix ${v.metric}: ${v.actualValue} (threshold: ${v.threshold})`);
      });
    }

    // High priority violations
    const highViolations = violations.filter(v => v.severity === 'high');
    if (highViolations.length > 0) {
      steps.push(`→ Resolve ${highViolations.length} high priority violation(s) before deployment`);
    }

    // Security issues
    if (signals.securityRisks) {
      steps.push('→ Security review required - vulnerabilities detected');
    }

    // Performance issues
    if (signals.performanceDegraded) {
      steps.push('→ Performance optimization recommended');
    }

    // Coverage issues
    if (signals.coverageDecreased) {
      steps.push('→ Increase test coverage to meet threshold');
    }

    // Test stability
    if (signals.testsUnstable) {
      steps.push('→ Investigate and fix flaky tests');
    }

    // Final step
    if (signals.canDeploy && violations.length === 0) {
      steps.push('→ All checks passed - ready for automated deployment');
    } else if (!signals.canDeploy) {
      steps.push('→ Fix violations and re-run quality checks');
    }

    return steps;
  }

  getFormat(): ReportFormat {
    return 'control-loop';
  }

  validateConfig(config: ReporterConfig): boolean {
    return config.format === 'control-loop';
  }

  /**
   * Get current thresholds
   */
  getThresholds() {
    return { ...this.thresholds };
  }

  /**
   * Update thresholds
   */
  updateThresholds(thresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...thresholds
    };
  }

  /**
   * Check if results pass all gates
   */
  static passesGates(
    results: AggregatedResults,
    config: ControlLoopConfig = {}
  ): boolean {
    const reporter = new ControlLoopReporter(config);
    const output = reporter.report(results);
    const feedback = JSON.parse(output.content) as ControlLoopFeedback;
    return feedback.signals.canDeploy;
  }

  /**
   * Get deployment decision
   */
  static getDeploymentDecision(
    results: AggregatedResults,
    config: ControlLoopConfig = {}
  ): {
    canDeploy: boolean;
    reason: string;
    actions: ControlLoopAction[];
    violations: ThresholdViolation[];
  } {
    const reporter = new ControlLoopReporter(config);
    const output = reporter.report(results);
    const feedback = JSON.parse(output.content) as ControlLoopFeedback;

    return {
      canDeploy: feedback.signals.canDeploy,
      reason: feedback.actions.find(a => a.priority === 'critical')?.reason || 'All checks passed',
      actions: feedback.actions,
      violations: feedback.violations
    };
  }
}
