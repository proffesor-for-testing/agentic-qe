/**
 * Quality Assessment - Claim Verifier Integration
 * Extracted from coordinator.ts for CQ-004 (file size reduction)
 *
 * Contains: ClaimVerifier initialization, report/gate result verification
 */

import { toErrorMessage } from '../../shared/error-utils.js';
import {
  ClaimVerifierService,
  createClaimVerifierService,
  type QEReport,
  type Claim,
  type ClaimType,
} from '../../agents/claim-verifier/index.js';
import type { GateResult, QualityReport } from './interfaces';

/**
 * Initialize ClaimVerifier for report verification
 */
export async function initializeClaimVerifier(
  claimVerifierRootDir?: string
): Promise<ClaimVerifierService> {
  try {
    const rootDir = claimVerifierRootDir || process.cwd();
    return createClaimVerifierService({
      rootDir,
      verifier: {
        enableStatistics: true,
        enableMultiModel: false,
        defaultConfidenceThreshold: 0.7,
      },
    }) as ClaimVerifierService;
  } catch (error) {
    throw new Error(`Failed to initialize ClaimVerifier: ${toErrorMessage(error)}`);
  }
}

/**
 * Verify a quality report's claims before returning
 */
export async function verifyQualityReportClaims(
  report: QualityReport,
  claimVerifier: ClaimVerifierService
): Promise<QualityReport & { claimVerification?: { verified: boolean; confidence: number; unverifiedClaims: number } }> {
  try {
    const qeReport = convertToQEReport(report, 'quality-analysis');

    if (qeReport.claims.length === 0) {
      return report;
    }

    const verification = await claimVerifier.verifyReport(qeReport);

    if (!verification.success) {
      console.warn('[QualityAssessment] Claim verification failed:', verification.error);
      return report;
    }

    return {
      ...report,
      claimVerification: {
        verified: verification.value.passed,
        confidence: verification.value.overallConfidence,
        unverifiedClaims: verification.value.flaggedClaims.length,
      },
    };
  } catch (error) {
    console.error('[QualityAssessment] Failed to verify report claims:', error);
    return report;
  }
}

/**
 * Verify a gate result's claims before returning
 */
export async function verifyGateResultClaims(
  result: GateResult,
  claimVerifier: ClaimVerifierService
): Promise<GateResult & { claimVerification?: { verified: boolean; confidence: number; unverifiedClaims: number } }> {
  try {
    const qeReport = convertGateResultToQEReport(result);

    if (qeReport.claims.length === 0) {
      return result;
    }

    const verification = await claimVerifier.verifyReport(qeReport);

    if (!verification.success) {
      console.warn('[QualityAssessment] Gate claim verification failed:', verification.error);
      return result;
    }

    return {
      ...result,
      claimVerification: {
        verified: verification.value.passed,
        confidence: verification.value.overallConfidence,
        unverifiedClaims: verification.value.flaggedClaims.length,
      },
    };
  } catch (error) {
    console.error('[QualityAssessment] Failed to verify gate claims:', error);
    return result;
  }
}

/**
 * Convert QualityReport to QEReport format for claim verification
 */
export function convertToQEReport(report: QualityReport, type: string): QEReport {
  const claims: Claim[] = [];

  for (const metric of report.metrics) {
    claims.push({
      id: `metric-${metric.name}-${Date.now()}`,
      type: 'metric-count' as ClaimType,
      statement: `Metric ${metric.name} = ${metric.value}`,
      evidence: [],
      sourceAgent: 'quality-analyzer',
      sourceAgentType: 'analyzer',
      severity: metric.value < 50 ? 'high' : metric.value < 70 ? 'medium' : 'low',
      timestamp: new Date(),
      metadata: {
        name: metric.name,
        value: metric.value,
      },
    });
  }

  if (report.score.coverage < 80) {
    claims.push({
      id: `coverage-${Date.now()}`,
      type: 'coverage-claim' as ClaimType,
      statement: `Code coverage is ${report.score.coverage}%`,
      evidence: [],
      sourceAgent: 'quality-analyzer',
      sourceAgentType: 'analyzer',
      severity: report.score.coverage < 50 ? 'critical' : 'high',
      timestamp: new Date(),
      metadata: { coverage: report.score.coverage },
    });
  }

  return {
    id: `quality-report-${Date.now()}`,
    type,
    claims,
    generatedAt: new Date(),
    sourceAgent: 'quality-assessment-coordinator',
  };
}

/**
 * Convert GateResult to QEReport format for claim verification
 */
export function convertGateResultToQEReport(result: GateResult): QEReport {
  const claims: Claim[] = [];

  for (const check of result.checks) {
    claims.push({
      id: `gate-check-${check.name}-${Date.now()}`,
      type: 'metric-count' as ClaimType,
      statement: `Gate check '${check.name}': ${check.value} (threshold: ${check.threshold})`,
      evidence: [],
      sourceAgent: 'quality-gate',
      sourceAgentType: 'validator',
      severity: check.passed ? 'low' : (check.severity as 'critical' | 'high' | 'medium' | 'low') || 'medium',
      timestamp: new Date(),
      metadata: {
        checkName: check.name,
        value: check.value,
        threshold: check.threshold,
        passed: check.passed,
      },
    });
  }

  return {
    id: `gate-result-${Date.now()}`,
    type: 'gate-evaluation',
    claims,
    generatedAt: new Date(),
    sourceAgent: 'quality-assessment-coordinator',
  };
}
