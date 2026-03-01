/**
 * Quality Assessment - Gate Evaluation Logic
 * Extracted from coordinator.ts for CQ-004 (file size reduction)
 *
 * Contains: borderline detection, consensus verification for gates and deployments
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  GateEvaluationRequest,
  GateResult,
  DeploymentRequest,
  DeploymentAdvice,
  QualityMetrics,
  GateThresholds,
} from './interfaces';
import {
  createDomainFinding,
} from '../../coordination/consensus/domain-findings';
import type { ConsensusEnabledMixin } from '../../coordination/mixins/consensus-enabled-domain';

/**
 * Check if a gate result is a borderline case.
 * A borderline case is when any metric is within the configured margin of its threshold.
 */
export function isBorderlineGateResult(
  metrics: QualityMetrics,
  thresholds: GateThresholds,
  _result: GateResult,
  borderlineMargin: number
): boolean {
  const margin = borderlineMargin;

  const metricsToCheck: Array<{ metricKey: keyof QualityMetrics; thresholdKey: keyof GateThresholds; isMin: boolean }> = [
    { metricKey: 'coverage', thresholdKey: 'coverage', isMin: true },
    { metricKey: 'testsPassing', thresholdKey: 'testsPassing', isMin: true },
    { metricKey: 'criticalBugs', thresholdKey: 'criticalBugs', isMin: false },
    { metricKey: 'codeSmells', thresholdKey: 'codeSmells', isMin: false },
    { metricKey: 'securityVulnerabilities', thresholdKey: 'securityVulnerabilities', isMin: false },
    { metricKey: 'technicalDebt', thresholdKey: 'technicalDebt', isMin: false },
    { metricKey: 'duplications', thresholdKey: 'duplications', isMin: false },
  ];

  for (const { metricKey, thresholdKey, isMin } of metricsToCheck) {
    const metricValue = metrics[metricKey];
    const thresholdConfig = thresholds[thresholdKey];

    if (thresholdConfig === undefined) continue;

    const threshold = isMin
      ? (thresholdConfig as { min: number }).min
      : (thresholdConfig as { max: number }).max;

    if (threshold === undefined || threshold === 0) continue;

    const relativeDistance = Math.abs(metricValue - threshold) / threshold;

    if (relativeDistance < margin) {
      console.log(`[quality-assessment] Borderline detected: ${metricKey}=${metricValue} (threshold=${threshold}, distance=${(relativeDistance * 100).toFixed(1)}%)`);
      return true;
    }
  }

  return false;
}

/**
 * Verify a gate verdict with multi-model consensus.
 */
export async function verifyGateVerdictWithConsensus(
  request: GateEvaluationRequest,
  initialResult: GateResult,
  consensusMixin: ConsensusEnabledMixin
): Promise<GateResult | null> {
  const finding = createDomainFinding<{
    metrics: QualityMetrics;
    thresholds: GateThresholds;
    initialResult: GateResult;
  }>({
    id: `gate-verdict-${uuidv4()}`,
    type: 'gate-verdict',
    confidence: initialResult.overallScore / 100,
    description: `Quality gate '${request.gateName}' verdict: ${initialResult.passed ? 'PASSED' : 'FAILED'} (borderline case)`,
    payload: {
      metrics: request.metrics,
      thresholds: request.thresholds,
      initialResult,
    },
    detectedBy: 'quality-assessment-coordinator',
    severity: initialResult.passed ? 'medium' : 'high',
  });

  if (!consensusMixin.requiresConsensus(finding)) {
    return null;
  }

  try {
    const consensusResult = await consensusMixin.verifyFinding(finding);

    if (!consensusResult.success) {
      console.warn('[quality-assessment] Consensus verification failed:', (consensusResult as { success: false; error: Error }).error);
      return null;
    }

    const consensus = consensusResult.value;
    console.log(
      `[quality-assessment] Consensus for gate '${request.gateName}': ` +
      `verdict=${consensus.verdict}, confidence=${(consensus.confidence * 100).toFixed(1)}%`
    );

    return {
      ...initialResult,
      consensusVerified: true,
      consensusConfidence: consensus.confidence,
      consensusVerdict: consensus.verdict,
    } as GateResult & {
      consensusVerified: boolean;
      consensusConfidence: number;
      consensusVerdict: string;
    };
  } catch (error) {
    console.error('[quality-assessment] Consensus verification error:', error);
    return null;
  }
}

/**
 * Check if a deployment is high-risk.
 */
export function isHighRiskDeployment(request: DeploymentRequest, advice: DeploymentAdvice): boolean {
  if (advice.decision === 'blocked') {
    return true;
  }
  if (advice.decision === 'warning' && request.riskTolerance === 'low') {
    return true;
  }
  if (advice.riskScore > 0.7) {
    return true;
  }
  return false;
}

/**
 * Verify deployment advice with multi-model consensus.
 */
export async function verifyDeploymentAdviceWithConsensus(
  request: DeploymentRequest,
  initialAdvice: DeploymentAdvice,
  consensusMixin: ConsensusEnabledMixin
): Promise<DeploymentAdvice | null> {
  const finding = createDomainFinding<{
    request: DeploymentRequest;
    initialAdvice: DeploymentAdvice;
  }>({
    id: `release-readiness-${uuidv4()}`,
    type: 'release-readiness',
    confidence: initialAdvice.confidence,
    description: `Release readiness for '${request.releaseCandidate}': ${initialAdvice.decision} (risk: ${(initialAdvice.riskScore * 100).toFixed(0)}%)`,
    payload: { request, initialAdvice },
    detectedBy: 'quality-assessment-coordinator',
    severity: initialAdvice.decision === 'blocked' ? 'critical' : 'high',
  });

  if (!consensusMixin.requiresConsensus(finding)) {
    return null;
  }

  try {
    const consensusResult = await consensusMixin.verifyFinding(finding);

    if (!consensusResult.success) {
      console.warn('[quality-assessment] Consensus verification for deployment failed:', (consensusResult as { success: false; error: Error }).error);
      return null;
    }

    const consensus = consensusResult.value;
    console.log(
      `[quality-assessment] Consensus for deployment '${request.releaseCandidate}': ` +
      `verdict=${consensus.verdict}, confidence=${(consensus.confidence * 100).toFixed(1)}%`
    );

    return {
      ...initialAdvice,
      consensusVerified: true,
      consensusConfidence: consensus.confidence,
      consensusVerdict: consensus.verdict,
    } as DeploymentAdvice & {
      consensusVerified: boolean;
      consensusConfidence: number;
      consensusVerdict: string;
    };
  } catch (error) {
    console.error('[quality-assessment] Consensus verification error:', error);
    return null;
  }
}
