/**
 * Agentic QE v3 - Security Auditor Report Generation
 * Extracted from security-auditor.ts - Risk calculation, posture, recommendations
 */

import type { RiskScore } from '../../../shared/value-objects/index.js';
import type {
  Vulnerability,
  DependencyScanResult,
  ScanSummary,
  SASTResult,
  DASTResult,
  SecretScanResult,
  SecurityAuditReport,
} from '../interfaces.js';
import type { TriagedVulnerabilities } from './security-auditor-types.js';

// ============================================================================
// Risk Calculation
// ============================================================================

/**
 * Calculate overall risk score from scan results
 */
export function calculateOverallRisk(
  sast?: SASTResult,
  dast?: DASTResult,
  deps?: DependencyScanResult,
  secrets?: SecretScanResult
): RiskScore {
  let riskValue = 0;
  let weights = 0;

  if (sast) {
    riskValue +=
      calculateScanRisk(sast.summary) * 0.35;
    weights += 0.35;
  }

  if (dast) {
    riskValue +=
      calculateScanRisk(dast.summary) * 0.25;
    weights += 0.25;
  }

  if (deps) {
    riskValue +=
      calculateScanRisk(deps.summary) * 0.25;
    weights += 0.25;
  }

  if (secrets) {
    const secretRisk = secrets.secretsFound.length > 0 ? 0.9 : 0.1;
    riskValue += secretRisk * 0.15;
    weights += 0.15;
  }

  const normalizedRisk = weights > 0 ? riskValue / weights : 0;

  return {
    value: Math.min(1, normalizedRisk),
    percentage: normalizedRisk * 100,
    level: normalizedRisk >= 0.8 ? 'critical' :
           normalizedRisk >= 0.6 ? 'high' :
           normalizedRisk >= 0.3 ? 'medium' : 'low',
  } as unknown as RiskScore;
}

/**
 * Calculate risk from a scan summary
 */
export function calculateScanRisk(summary: ScanSummary): number {
  const weights = {
    critical: 1.0,
    high: 0.7,
    medium: 0.4,
    low: 0.1,
    informational: 0.02,
  };

  const totalIssues =
    summary.critical +
    summary.high +
    summary.medium +
    summary.low +
    summary.informational;

  if (totalIssues === 0) return 0;

  const weightedSum =
    summary.critical * weights.critical +
    summary.high * weights.high +
    summary.medium * weights.medium +
    summary.low * weights.low +
    summary.informational * weights.informational;

  return Math.min(1, weightedSum / 10);
}

// ============================================================================
// Recommendations
// ============================================================================

/**
 * Generate recommendations based on scan results
 */
export function generateRecommendations(
  sast?: SASTResult,
  dast?: DASTResult,
  deps?: DependencyScanResult,
  secrets?: SecretScanResult
): string[] {
  const recommendations: string[] = [];

  if (sast && sast.summary.critical > 0) {
    recommendations.push(
      `Address ${sast.summary.critical} critical vulnerabilities found in static analysis`
    );
  }

  if (dast && dast.summary.high > 0) {
    recommendations.push(
      `Fix ${dast.summary.high} high-severity issues found in dynamic testing`
    );
  }

  if (deps && deps.outdatedPackages.length > 5) {
    recommendations.push(
      `Update ${deps.outdatedPackages.length} outdated dependencies`
    );
  }

  if (secrets && secrets.secretsFound.length > 0) {
    recommendations.push(
      `Remove ${secrets.secretsFound.length} exposed secrets and rotate credentials`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('Security posture is good. Continue regular scanning.');
  }

  return recommendations;
}

// ============================================================================
// Posture Calculations
// ============================================================================

/**
 * Count vulnerabilities by severity in an audit report
 */
export function countBySeverity(
  audit: SecurityAuditReport | undefined,
  severity: 'critical' | 'high'
): number {
  if (!audit) return 0;

  let count = 0;
  if (audit.sastResults) count += audit.sastResults.summary[severity];
  if (audit.dastResults) count += audit.dastResults.summary[severity];
  if (audit.dependencyResults) count += audit.dependencyResults.summary[severity];

  return count;
}

/**
 * Count total open vulnerabilities in an audit
 */
export function countOpenVulnerabilities(audit: SecurityAuditReport | undefined): number {
  if (!audit) return 0;

  let count = 0;
  if (audit.sastResults) count += audit.sastResults.vulnerabilities.length;
  if (audit.dastResults) count += audit.dastResults.vulnerabilities.length;
  if (audit.dependencyResults) count += audit.dependencyResults.vulnerabilities.length;

  return count;
}

/**
 * Calculate security trend between two audits
 */
export function calculateTrend(
  latest: SecurityAuditReport | undefined,
  previous: SecurityAuditReport | undefined
): 'improving' | 'stable' | 'declining' {
  if (!latest || !previous) return 'stable';

  const latestScore = countOpenVulnerabilities(latest);
  const previousScore = countOpenVulnerabilities(previous);

  if (latestScore < previousScore * 0.9) return 'improving';
  if (latestScore > previousScore * 1.1) return 'declining';
  return 'stable';
}

/**
 * Calculate posture score (0-100)
 */
export function calculatePostureScore(
  critical: number,
  high: number,
  open: number
): number {
  let score = 100;
  score -= critical * 20;
  score -= high * 10;
  score -= open * 2;
  return Math.max(0, Math.min(100, score));
}

/**
 * Generate posture recommendations
 */
export function generatePostureRecommendations(
  critical: number,
  high: number,
  score: number
): string[] {
  const recommendations: string[] = [];

  if (critical > 0) {
    recommendations.push('Immediately address all critical vulnerabilities');
  }

  if (high > 3) {
    recommendations.push('Prioritize fixing high-severity issues');
  }

  if (score < 50) {
    recommendations.push('Consider a comprehensive security review');
    recommendations.push('Implement automated security scanning in CI/CD');
  }

  if (score >= 80) {
    recommendations.push('Maintain current security practices');
    recommendations.push('Consider penetration testing for deeper analysis');
  }

  return recommendations;
}

// ============================================================================
// Triage
// ============================================================================

/**
 * Determine priority bucket for a vulnerability
 */
export function determinePriorityBucket(
  vuln: Vulnerability
): keyof TriagedVulnerabilities {
  const effort = vuln.remediation.estimatedEffort;

  if (vuln.severity === 'critical') {
    return 'immediate';
  }

  if (vuln.severity === 'high') {
    return effort === 'trivial' || effort === 'minor' ? 'immediate' : 'shortTerm';
  }

  if (vuln.severity === 'medium') {
    return effort === 'major' ? 'longTerm' : 'mediumTerm';
  }

  if (vuln.severity === 'low' || vuln.severity === 'informational') {
    return 'longTerm';
  }

  return 'accepted';
}
