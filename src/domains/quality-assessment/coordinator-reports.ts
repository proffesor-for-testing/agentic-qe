/**
 * Quality Assessment - Report Generation & Dashboard
 * Extracted from coordinator.ts for CQ-004 (file size reduction)
 *
 * Contains: report generation, dashboard, risk analysis, technical debt analysis
 */

import { Result, ok, err } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';
import type { MemoryBackend } from '../../kernel/interfaces';
import type {
  QualityMetrics,
  GateEvaluationRequest,
} from './interfaces';
import { isMeasuredMetricValue, type StaticEvidenceStatus } from './evidence-sufficiency.js';
import {
  INSUFFICIENT_EVIDENCE,
  QUALITY_METRICS,
  describeMissingMetrics,
  inspectQualityEvidence,
  type QualityMetricName,
} from './quality-evidence.js';

/** #996: the sentinel for a metric with no measured value. */
const UNMEASURED = -1;

/**
 * #1020: the canonical quality metrics as measured. A metric without fresh,
 * well-formed evidence is `-1` and listed in `unmeasured`; it is never
 * replaced by a passing default.
 */
export interface MeasuredQualityMetrics {
  metrics: QualityMetrics;
  unmeasured: QualityMetricName[];
}

/** Evidence state of the metrics one result was computed from. */
export interface MetricEvidence {
  evidenceStatus: StaticEvidenceStatus;
  /** Metrics this result needed but has no measured value for. */
  unmeasured: QualityMetricName[];
}

/**
 * #1020: read the measured quality evidence (the same records the measured
 * gate uses). Unmeasured metrics are `-1`, never a default.
 */
export async function getMeasuredMetrics(memory: MemoryBackend): Promise<MeasuredQualityMetrics> {
  const { values } = await inspectQualityEvidence(memory);
  const metrics = {} as QualityMetrics;
  const unmeasured: QualityMetricName[] = [];
  for (const metric of QUALITY_METRICS) {
    const value = values[metric];
    if (isMeasuredMetricValue(value)) {
      metrics[metric] = value;
    } else {
      metrics[metric] = UNMEASURED;
      unmeasured.push(metric);
    }
  }
  return { metrics, unmeasured };
}

/** Evidence state of `inputs` within `metrics`. */
function evidenceFor(metrics: QualityMetrics, inputs: readonly QualityMetricName[]): MetricEvidence {
  const unmeasured = inputs.filter((metric) => !isMeasuredMetricValue(metrics[metric]));
  return {
    evidenceStatus: unmeasured.length === 0 ? 'measured' : INSUFFICIENT_EVIDENCE,
    unmeasured,
  };
}

/** True when `metric` has a measured value. */
function measured(metrics: QualityMetrics, metric: QualityMetricName): boolean {
  return isMeasuredMetricValue(metrics[metric]);
}

/**
 * Generate a quality report
 */
export async function generateReport(
  memory: MemoryBackend,
  options: {
    format: 'json' | 'html' | 'markdown';
    includeRecommendations?: boolean;
  }
): Promise<Result<{ content: string; format: string } & MetricEvidence, Error>> {
  try {
    const { metrics } = await getMeasuredMetrics(memory);
    const evidence = evidenceFor(metrics, QUALITY_METRICS);

    const reportData = {
      timestamp: new Date().toISOString(),
      ...evidence,
      metrics,
      recommendations: options.includeRecommendations
        ? [...generateRecommendations(metrics), ...describeMissingMetrics(evidence.unmeasured)]
        : undefined,
    };

    let content: string;
    switch (options.format) {
      case 'json':
        content = JSON.stringify(reportData, null, 2);
        break;
      case 'html':
        content = formatAsHtml(reportData);
        break;
      case 'markdown':
        content = formatAsMarkdown(reportData);
        break;
      default:
        content = JSON.stringify(reportData, null, 2);
    }

    return ok({ content, format: options.format, ...evidence });
  } catch (error) {
    return err(toError(error));
  }
}

/**
 * Get quality dashboard overview
 */
export async function getQualityDashboard(memory: MemoryBackend): Promise<Result<{
  /** 0-100; -1 when any metric is unmeasured (#1020). */
  overallScore: number;
  metrics: QualityMetrics;
  trends: Record<string, number>;
} & MetricEvidence, Error>> {
  try {
    const { metrics } = await getMeasuredMetrics(memory);
    const evidence = evidenceFor(metrics, QUALITY_METRICS);

    const overallScore = evidence.unmeasured.length > 0 ? UNMEASURED : Math.round(
      (metrics.coverage * 0.3) +
      (metrics.testsPassing * 0.3) +
      ((100 - Math.min(100, metrics.codeSmells)) * 0.2) +
      ((100 - Math.min(100, metrics.securityVulnerabilities * 10)) * 0.2)
    );

    return ok({
      overallScore,
      metrics,
      ...evidence,
      trends: {
        coverage: 0,
        quality: 0,
        security: 0,
      },
    });
  } catch (error) {
    return err(toError(error));
  }
}

/**
 * Analyze project risks
 */
export async function analyzeRisks(
  memory: MemoryBackend,
  options: {
    scope: 'project' | 'module' | 'file';
    includeSecurityRisks?: boolean;
  }
): Promise<Result<{
  risks: Array<{ id: string; severity: string; description: string; category: string }>;
  /** #1020: `insufficient-evidence` unless a measured risk is already critical. */
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical' | typeof INSUFFICIENT_EVIDENCE;
} & MetricEvidence, Error>> {
  try {
    const { metrics } = await getMeasuredMetrics(memory);
    const inputs: QualityMetricName[] = ['coverage', 'technicalDebt'];
    if (options.includeSecurityRisks) inputs.push('securityVulnerabilities');
    const evidence = evidenceFor(metrics, inputs);

    const risks: Array<{ id: string; severity: string; description: string; category: string }> = [];

    if (measured(metrics, 'coverage') && metrics.coverage < 50) {
      risks.push({
        id: 'risk-coverage-critical',
        severity: 'critical',
        description: 'Code coverage is critically low',
        category: 'quality',
      });
    } else if (measured(metrics, 'coverage') && metrics.coverage < 70) {
      risks.push({
        id: 'risk-coverage-high',
        severity: 'high',
        description: 'Code coverage is below recommended threshold',
        category: 'quality',
      });
    }

    if (options.includeSecurityRisks && measured(metrics, 'securityVulnerabilities') && metrics.securityVulnerabilities > 0) {
      risks.push({
        id: 'risk-security',
        severity: metrics.securityVulnerabilities > 5 ? 'critical' : 'high',
        description: `${metrics.securityVulnerabilities} security vulnerabilities detected`,
        category: 'security',
      });
    }

    if (measured(metrics, 'technicalDebt') && metrics.technicalDebt > 40) {
      risks.push({
        id: 'risk-debt-critical',
        severity: 'high',
        description: 'Technical debt is critically high',
        category: 'maintainability',
      });
    }

    const criticalCount = risks.filter((r) => r.severity === 'critical').length;
    const highCount = risks.filter((r) => r.severity === 'high').length;

    let overallRiskLevel: 'low' | 'medium' | 'high' | 'critical' | typeof INSUFFICIENT_EVIDENCE = 'low';
    if (criticalCount > 0) {
      overallRiskLevel = 'critical';
    } else if (evidence.unmeasured.length > 0) {
      // An unmeasured input could hide any risk: no level below critical is known.
      overallRiskLevel = INSUFFICIENT_EVIDENCE;
    } else if (highCount > 1) {
      overallRiskLevel = 'high';
    } else if (highCount > 0 || risks.length > 2) {
      overallRiskLevel = 'medium';
    }

    return ok({ risks, overallRiskLevel, ...evidence });
  } catch (error) {
    return err(toError(error));
  }
}

/**
 * Evaluate a quality gate (simplified API)
 */
export function buildFullGateRequest(options: {
  gateId: string;
  metrics: Partial<QualityMetrics>;
}): GateEvaluationRequest {
  // #1020: a metric the caller did not supply is unmeasured (-1), never a
  // passing default; the gate reports it as insufficient evidence.
  const fullMetrics = {} as QualityMetrics;
  for (const metric of QUALITY_METRICS) {
    fullMetrics[metric] = options.metrics[metric] ?? UNMEASURED;
  }

  return {
    gateName: options.gateId,
    metrics: fullMetrics,
    thresholds: {
      coverage: { min: 70 },
      testsPassing: { min: 90 },
      criticalBugs: { max: 0 },
      codeSmells: { max: 20 },
      securityVulnerabilities: { max: 0 },
    },
  };
}

/**
 * Assess deployment readiness
 */
export async function assessDeploymentReadiness(
  memory: MemoryBackend,
  options: {
    environment: 'development' | 'staging' | 'production';
    changeSet: string[];
  }
): Promise<Result<{
  /** #1020: never true while an input is unmeasured. */
  ready: boolean;
  risks: Array<{ id: string; severity: string; description: string }>;
  /** 0-100; -1 when a score input is unmeasured (#1020). */
  score: number;
} & MetricEvidence, Error>> {
  try {
    const { metrics } = await getMeasuredMetrics(memory);
    const scoreInputs: QualityMetricName[] = ['coverage', 'testsPassing', 'securityVulnerabilities'];
    const evidence = evidenceFor(
      metrics,
      options.environment === 'production' ? [...scoreInputs, 'criticalBugs'] : scoreInputs,
    );

    const risks: Array<{ id: string; severity: string; description: string }> = [];

    if (options.environment === 'production') {
      if (measured(metrics, 'coverage') && metrics.coverage < 70) {
        risks.push({
          id: 'risk-coverage',
          severity: 'high',
          description: 'Coverage below recommended threshold for production',
        });
      }
      if (measured(metrics, 'securityVulnerabilities') && metrics.securityVulnerabilities > 0) {
        risks.push({
          id: 'risk-security',
          severity: 'critical',
          description: 'Security vulnerabilities must be resolved before production deployment',
        });
      }
      if (measured(metrics, 'criticalBugs') && metrics.criticalBugs > 0) {
        risks.push({
          id: 'risk-bugs',
          severity: 'critical',
          description: 'Critical bugs must be resolved before production deployment',
        });
      }
    }

    const score = scoreInputs.every((metric) => measured(metrics, metric))
      ? Math.round(
        (metrics.coverage * 0.4) +
        (metrics.testsPassing * 0.3) +
        ((100 - Math.min(100, metrics.securityVulnerabilities * 20)) * 0.3)
      )
      : UNMEASURED;

    const ready = evidence.unmeasured.length === 0
      && risks.filter((r) => r.severity === 'critical').length === 0 && score >= 70;

    return ok({ ready, risks, score, ...evidence });
  } catch (error) {
    return err(toError(error));
  }
}

/**
 * Analyze technical debt
 */
export async function analyzeTechnicalDebt(
  memory: MemoryBackend,
  options: {
    projectPath: string;
    includeCodeSmells?: boolean;
  }
): Promise<Result<{
  /** -1 when technical debt is unmeasured (#1020). */
  totalDebt: number;
  items: Array<{ file: string; type: string; effort: number; description: string }>;
  /** -1 when technical debt is unmeasured (#1020). */
  debtRatio: number;
} & MetricEvidence, Error>> {
  try {
    const { metrics } = await getMeasuredMetrics(memory);
    const inputs: QualityMetricName[] = ['technicalDebt', 'duplications'];
    if (options.includeCodeSmells) inputs.push('codeSmells');
    const evidence = evidenceFor(metrics, inputs);

    // #1020: the metrics are project-wide counts, so the items name the
    // project, not invented file paths.
    const items: Array<{ file: string; type: string; effort: number; description: string }> = [];

    if (measured(metrics, 'duplications') && metrics.duplications > 0) {
      items.push({
        file: options.projectPath,
        type: 'duplication',
        effort: metrics.duplications * 30,
        description: `Measured duplication of ${metrics.duplications}% across the project should be refactored`,
      });
    }

    if (options.includeCodeSmells && measured(metrics, 'codeSmells') && metrics.codeSmells > 0) {
      items.push({
        file: options.projectPath,
        type: 'code-smell',
        effort: metrics.codeSmells * 15,
        description: `${metrics.codeSmells} measured code smells impact maintainability`,
      });
    }

    const totalDebt = metrics.technicalDebt;
    const debtRatio = measured(metrics, 'technicalDebt') ? totalDebt / 100 : UNMEASURED;

    return ok({ totalDebt, items, debtRatio, ...evidence });
  } catch (error) {
    return err(toError(error));
  }
}

// ============================================================================
// Private Helpers
// ============================================================================

export function generateRecommendations(metrics: QualityMetrics): string[] {
  const recommendations: string[] = [];

  // #1020: only measured values support a recommendation; -1 is not "low".
  if (measured(metrics, 'coverage') && metrics.coverage < 80) {
    recommendations.push('Increase test coverage to at least 80%');
  }
  if (measured(metrics, 'codeSmells') && metrics.codeSmells > 10) {
    recommendations.push('Refactor complex code to improve maintainability');
  }
  if (measured(metrics, 'technicalDebt') && metrics.technicalDebt > 20) {
    recommendations.push('Allocate time to reduce technical debt');
  }
  if (measured(metrics, 'securityVulnerabilities') && metrics.securityVulnerabilities > 0) {
    recommendations.push('Address security vulnerabilities urgently');
  }

  return recommendations;
}

function formatAsHtml(data: Record<string, unknown>): string {
  return `<html><body><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`;
}

function formatAsMarkdown(data: Record<string, unknown>): string {
  return `# Quality Report\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}
