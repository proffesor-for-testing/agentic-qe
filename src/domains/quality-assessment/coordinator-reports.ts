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

/**
 * Default quality metrics used when no stored metrics are available
 */
export function getDefaultMetrics(): QualityMetrics {
  return {
    coverage: 80,
    testsPassing: 95,
    criticalBugs: 0,
    codeSmells: 5,
    securityVulnerabilities: 0,
    technicalDebt: 10,
    duplications: 3,
  };
}

/**
 * Get stored quality metrics or defaults
 */
export async function getStoredOrDefaultMetrics(memory: MemoryBackend): Promise<QualityMetrics> {
  const storedMetrics = await memory.get<QualityMetrics>('quality-assessment:current-metrics');
  return storedMetrics ?? getDefaultMetrics();
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
): Promise<Result<{ content: string; format: string }, Error>> {
  try {
    const metrics = await getStoredOrDefaultMetrics(memory);

    const reportData = {
      timestamp: new Date().toISOString(),
      metrics,
      recommendations: options.includeRecommendations
        ? generateRecommendations(metrics)
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

    return ok({ content, format: options.format });
  } catch (error) {
    return err(toError(error));
  }
}

/**
 * Get quality dashboard overview
 */
export async function getQualityDashboard(memory: MemoryBackend): Promise<Result<{
  overallScore: number;
  metrics: QualityMetrics;
  trends: Record<string, number>;
}, Error>> {
  try {
    const metrics = await getStoredOrDefaultMetrics(memory);

    const overallScore = Math.round(
      (metrics.coverage * 0.3) +
      (metrics.testsPassing * 0.3) +
      ((100 - Math.min(100, metrics.codeSmells)) * 0.2) +
      ((100 - Math.min(100, metrics.securityVulnerabilities * 10)) * 0.2)
    );

    return ok({
      overallScore,
      metrics,
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
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
}, Error>> {
  try {
    const metrics = await getStoredOrDefaultMetrics(memory);

    const risks: Array<{ id: string; severity: string; description: string; category: string }> = [];

    if (metrics.coverage < 50) {
      risks.push({
        id: 'risk-coverage-critical',
        severity: 'critical',
        description: 'Code coverage is critically low',
        category: 'quality',
      });
    } else if (metrics.coverage < 70) {
      risks.push({
        id: 'risk-coverage-high',
        severity: 'high',
        description: 'Code coverage is below recommended threshold',
        category: 'quality',
      });
    }

    if (options.includeSecurityRisks && metrics.securityVulnerabilities > 0) {
      risks.push({
        id: 'risk-security',
        severity: metrics.securityVulnerabilities > 5 ? 'critical' : 'high',
        description: `${metrics.securityVulnerabilities} security vulnerabilities detected`,
        category: 'security',
      });
    }

    if (metrics.technicalDebt > 40) {
      risks.push({
        id: 'risk-debt-critical',
        severity: 'high',
        description: 'Technical debt is critically high',
        category: 'maintainability',
      });
    }

    const criticalCount = risks.filter((r) => r.severity === 'critical').length;
    const highCount = risks.filter((r) => r.severity === 'high').length;

    let overallRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (criticalCount > 0) {
      overallRiskLevel = 'critical';
    } else if (highCount > 1) {
      overallRiskLevel = 'high';
    } else if (highCount > 0 || risks.length > 2) {
      overallRiskLevel = 'medium';
    }

    return ok({ risks, overallRiskLevel });
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
  const fullMetrics: QualityMetrics = {
    coverage: options.metrics.coverage ?? 80,
    testsPassing: options.metrics.testsPassing ?? 95,
    criticalBugs: options.metrics.criticalBugs ?? 0,
    codeSmells: options.metrics.codeSmells ?? 5,
    securityVulnerabilities: options.metrics.securityVulnerabilities ?? 0,
    technicalDebt: options.metrics.technicalDebt ?? 10,
    duplications: options.metrics.duplications ?? 3,
  };

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
  ready: boolean;
  risks: Array<{ id: string; severity: string; description: string }>;
  score: number;
}, Error>> {
  try {
    const metrics = await getStoredOrDefaultMetrics(memory);

    const risks: Array<{ id: string; severity: string; description: string }> = [];

    if (options.environment === 'production') {
      if (metrics.coverage < 70) {
        risks.push({
          id: 'risk-coverage',
          severity: 'high',
          description: 'Coverage below recommended threshold for production',
        });
      }
      if (metrics.securityVulnerabilities > 0) {
        risks.push({
          id: 'risk-security',
          severity: 'critical',
          description: 'Security vulnerabilities must be resolved before production deployment',
        });
      }
      if (metrics.criticalBugs > 0) {
        risks.push({
          id: 'risk-bugs',
          severity: 'critical',
          description: 'Critical bugs must be resolved before production deployment',
        });
      }
    }

    const score = Math.round(
      (metrics.coverage * 0.4) +
      (metrics.testsPassing * 0.3) +
      ((100 - Math.min(100, metrics.securityVulnerabilities * 20)) * 0.3)
    );

    const ready = risks.filter((r) => r.severity === 'critical').length === 0 && score >= 70;

    return ok({ ready, risks, score });
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
  totalDebt: number;
  items: Array<{ file: string; type: string; effort: number; description: string }>;
  debtRatio: number;
}, Error>> {
  try {
    const metrics = await getStoredOrDefaultMetrics(memory);

    const items: Array<{ file: string; type: string; effort: number; description: string }> = [];

    if (metrics.duplications > 0) {
      items.push({
        file: `${options.projectPath}/src/utils/helpers.ts`,
        type: 'duplication',
        effort: metrics.duplications * 30,
        description: 'Duplicated code blocks that should be refactored',
      });
    }

    if (options.includeCodeSmells && metrics.codeSmells > 0) {
      items.push({
        file: `${options.projectPath}/src/services/legacy.ts`,
        type: 'code-smell',
        effort: metrics.codeSmells * 15,
        description: 'Code smells that impact maintainability',
      });
    }

    const totalDebt = metrics.technicalDebt;
    const debtRatio = totalDebt / 100;

    return ok({ totalDebt, items, debtRatio });
  } catch (error) {
    return err(toError(error));
  }
}

// ============================================================================
// Private Helpers
// ============================================================================

export function generateRecommendations(metrics: QualityMetrics): string[] {
  const recommendations: string[] = [];

  if (metrics.coverage < 80) {
    recommendations.push('Increase test coverage to at least 80%');
  }
  if (metrics.codeSmells > 10) {
    recommendations.push('Refactor complex code to improve maintainability');
  }
  if (metrics.technicalDebt > 20) {
    recommendations.push('Allocate time to reduce technical debt');
  }
  if (metrics.securityVulnerabilities > 0) {
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
