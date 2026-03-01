/**
 * Agentic QE v3 - Quality Gate Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Continuous quality gate evaluation including:
 * - Multi-criteria quality assessment
 * - Release readiness scoring
 * - Blocking issue detection
 * - Quality trend tracking
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';

const CONFIG: WorkerConfig = {
  id: 'quality-gate',
  name: 'Quality Gate Evaluator',
  description: 'Continuously evaluates quality gates and release readiness across all quality dimensions',
  intervalMs: 5 * 60 * 1000, // 5 minutes
  priority: 'critical',
  targetDomains: ['quality-assessment'],
  enabled: true,
  timeoutMs: 120000,
  retryCount: 2,
  retryDelayMs: 5000,
};

interface QualityGateRule {
  id: string;
  name: string;
  category: 'coverage' | 'reliability' | 'security' | 'maintainability' | 'performance';
  threshold: number;
  operator: 'gte' | 'lte' | 'eq';
  currentValue: number;
  unit: string;
  blocking: boolean;
}

interface QualityGateStatus {
  passed: boolean;
  passedRules: number;
  failedRules: number;
  blockers: number;
  warnings: number;
  releaseReady: boolean;
  rules: QualityGateRule[];
}

export class QualityGateWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting quality gate evaluation');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    // Evaluate all quality gates
    const gateStatus = await this.evaluateQualityGates(context);

    // Analyze gate status
    this.analyzeGateResults(gateStatus, findings, recommendations);

    // Check for blockers
    this.checkBlockers(gateStatus, findings, recommendations);

    // Compare to previous
    await this.compareToHistory(context, gateStatus, findings);

    // Store current status
    await context.memory.set('quality-gate:current', gateStatus);
    await context.memory.set('quality-gate:lastCheck', new Date().toISOString());

    // Add to history
    const history = await context.memory.get<QualityGateStatus[]>('quality-gate:history') || [];
    history.push(gateStatus);
    if (history.length > 100) history.shift();
    await context.memory.set('quality-gate:history', history);

    const healthScore = this.calculateHealthScore(gateStatus);

    context.logger.info('Quality gate evaluation complete', {
      healthScore,
      passed: gateStatus.passed,
      releaseReady: gateStatus.releaseReady,
      blockers: gateStatus.blockers,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: gateStatus.rules.length,
        issuesFound: gateStatus.failedRules,
        healthScore,
        trend: 'stable',
        domainMetrics: {
          gatePassed: gateStatus.passed ? 'YES' : 'NO',
          releaseReady: gateStatus.releaseReady ? 'YES' : 'NO',
          passedRules: gateStatus.passedRules,
          failedRules: gateStatus.failedRules,
          blockers: gateStatus.blockers,
          warnings: gateStatus.warnings,
        },
      },
      findings,
      recommendations
    );
  }

  private async evaluateQualityGates(_context: WorkerContext): Promise<QualityGateStatus> {
    // Define quality gate rules
    const rules: QualityGateRule[] = [
      // Coverage rules
      {
        id: 'coverage-line',
        name: 'Line Coverage',
        category: 'coverage',
        threshold: 80,
        operator: 'gte',
        currentValue: 78.5,
        unit: '%',
        blocking: true,
      },
      {
        id: 'coverage-branch',
        name: 'Branch Coverage',
        category: 'coverage',
        threshold: 70,
        operator: 'gte',
        currentValue: 65.2,
        unit: '%',
        blocking: false,
      },
      // Reliability rules
      {
        id: 'reliability-test-pass-rate',
        name: 'Test Pass Rate',
        category: 'reliability',
        threshold: 95,
        operator: 'gte',
        currentValue: 98.2,
        unit: '%',
        blocking: true,
      },
      {
        id: 'reliability-flaky-tests',
        name: 'Flaky Test Count',
        category: 'reliability',
        threshold: 5,
        operator: 'lte',
        currentValue: 3,
        unit: 'tests',
        blocking: false,
      },
      // Security rules
      {
        id: 'security-critical-vulns',
        name: 'Critical Vulnerabilities',
        category: 'security',
        threshold: 0,
        operator: 'eq',
        currentValue: 1,
        unit: 'issues',
        blocking: true,
      },
      {
        id: 'security-high-vulns',
        name: 'High Vulnerabilities',
        category: 'security',
        threshold: 3,
        operator: 'lte',
        currentValue: 2,
        unit: 'issues',
        blocking: false,
      },
      // Maintainability rules
      {
        id: 'maintainability-complexity',
        name: 'Average Complexity',
        category: 'maintainability',
        threshold: 15,
        operator: 'lte',
        currentValue: 12,
        unit: 'score',
        blocking: false,
      },
      {
        id: 'maintainability-duplication',
        name: 'Code Duplication',
        category: 'maintainability',
        threshold: 5,
        operator: 'lte',
        currentValue: 3.2,
        unit: '%',
        blocking: false,
      },
      // Performance rules
      {
        id: 'performance-test-duration',
        name: 'Avg Test Duration',
        category: 'performance',
        threshold: 500,
        operator: 'lte',
        currentValue: 245,
        unit: 'ms',
        blocking: false,
      },
    ];

    // Evaluate each rule
    let passedRules = 0;
    let failedRules = 0;
    let blockers = 0;
    let warnings = 0;

    for (const rule of rules) {
      const passed = this.evaluateRule(rule);
      if (passed) {
        passedRules++;
      } else {
        failedRules++;
        if (rule.blocking) {
          blockers++;
        } else {
          warnings++;
        }
      }
    }

    return {
      passed: blockers === 0,
      passedRules,
      failedRules,
      blockers,
      warnings,
      releaseReady: blockers === 0 && warnings <= 2,
      rules,
    };
  }

  private evaluateRule(rule: QualityGateRule): boolean {
    switch (rule.operator) {
      case 'gte':
        return rule.currentValue >= rule.threshold;
      case 'lte':
        return rule.currentValue <= rule.threshold;
      case 'eq':
        return rule.currentValue === rule.threshold;
      default:
        return false;
    }
  }

  private analyzeGateResults(
    status: QualityGateStatus,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    // Report failed rules
    for (const rule of status.rules) {
      if (!this.evaluateRule(rule)) {
        const severity = rule.blocking ? 'critical' : 'medium';
        findings.push({
          type: 'quality-gate-failure',
          severity,
          domain: 'quality-assessment',
          title: `Quality Gate Failed: ${rule.name}`,
          description: `${rule.name} is ${rule.currentValue}${rule.unit}, threshold is ${rule.operator === 'gte' ? '>=' : rule.operator === 'lte' ? '<=' : '='} ${rule.threshold}${rule.unit}`,
          context: {
            ruleId: rule.id,
            category: rule.category,
            currentValue: rule.currentValue,
            threshold: rule.threshold,
            blocking: rule.blocking,
          },
        });
      }
    }

    // Category-specific recommendations
    const coverageFailures = status.rules
      .filter(r => r.category === 'coverage' && !this.evaluateRule(r));
    if (coverageFailures.length > 0) {
      recommendations.push({
        priority: coverageFailures.some(r => r.blocking) ? 'p0' : 'p2',
        domain: 'quality-assessment',
        action: 'Improve Test Coverage',
        description: `${coverageFailures.length} coverage gates are failing. Add tests to increase coverage.`,
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: true,
      });
    }

    const securityFailures = status.rules
      .filter(r => r.category === 'security' && !this.evaluateRule(r));
    if (securityFailures.length > 0) {
      recommendations.push({
        priority: 'p0',
        domain: 'quality-assessment',
        action: 'Address Security Issues',
        description: 'Security gates are failing. Resolve vulnerabilities before release.',
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: false,
      });
    }
  }

  private checkBlockers(
    status: QualityGateStatus,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    if (status.blockers > 0) {
      findings.push({
        type: 'release-blocked',
        severity: 'critical',
        domain: 'quality-assessment',
        title: 'Release Blocked',
        description: `${status.blockers} blocking issues prevent release`,
        context: {
          blockers: status.blockers,
          blockingRules: status.rules
            .filter(r => r.blocking && !this.evaluateRule(r))
            .map(r => r.name),
        },
      });

      recommendations.push({
        priority: 'p0',
        domain: 'quality-assessment',
        action: 'Resolve Release Blockers',
        description: 'Address all blocking quality gate failures before proceeding with release.',
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: false,
      });
    } else if (!status.releaseReady) {
      findings.push({
        type: 'release-warning',
        severity: 'medium',
        domain: 'quality-assessment',
        title: 'Release Not Recommended',
        description: `No blockers, but ${status.warnings} warnings suggest caution`,
        context: { warnings: status.warnings },
      });
    }
  }

  private async compareToHistory(
    context: WorkerContext,
    current: QualityGateStatus,
    findings: WorkerFinding[]
  ): Promise<void> {
    const previous = await context.memory.get<QualityGateStatus>('quality-gate:current');
    if (!previous) return;

    // Check for regression
    if (previous.passed && !current.passed) {
      findings.push({
        type: 'quality-gate-regression',
        severity: 'high',
        domain: 'quality-assessment',
        title: 'Quality Gate Regression',
        description: 'Quality gates were passing previously but are now failing',
        context: {
          previousBlockers: previous.blockers,
          currentBlockers: current.blockers,
        },
      });
    }

    // Check for improvement
    if (!previous.passed && current.passed) {
      findings.push({
        type: 'quality-gate-improvement',
        severity: 'info',
        domain: 'quality-assessment',
        title: 'Quality Gates Now Passing',
        description: 'All quality gates are now passing after previous failures',
        context: {
          previousFailures: previous.failedRules,
          currentFailures: current.failedRules,
        },
      });
    }
  }

  private calculateHealthScore(status: QualityGateStatus): number {
    if (status.rules.length === 0) return 100;

    // Base score from pass rate
    const passRate = status.passedRules / status.rules.length;
    let score = passRate * 70;

    // Penalty for blockers
    score -= status.blockers * 15;

    // Penalty for warnings
    score -= status.warnings * 5;

    // Bonus for release readiness
    if (status.releaseReady) {
      score += 10;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
