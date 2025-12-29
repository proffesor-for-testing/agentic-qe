/**
 * Quality Gate Evaluation Tool
 *
 * Implements intelligent quality gate evaluation using multi-factor decision trees
 * with risk-based logic and dynamic threshold adjustment.
 *
 * Based on SPARC Phase 2 Section 7.1 - Intelligent Quality Gate Algorithm
 *
 * @module tools/qe/quality-gates/evaluate-quality-gate
 * @version 1.0.0
 * @author Agentic QE Team - Phase 3
 * @date 2025-11-09
 */

import {
  QualityMetrics,
  QualityPolicy,
  QualityRule,
  Environment,
  Priority,
  TestResult,
  QEToolResponse,
  ResponseMetadata,
  TestStatus
} from '../shared/types.js';
import { seededRandom } from '../../../../utils/SeededRandom.js';

// ==================== Types ====================

/**
 * Parameters for quality gate evaluation
 */
export interface EvaluateQualityGateParams {
  /** Project identifier */
  projectId: string;

  /** Build identifier */
  buildId: string;

  /** Target environment */
  environment: Environment;

  /** Quality metrics to evaluate */
  metrics: QualityMetrics;

  /** Quality policy to enforce (optional, uses default if not provided) */
  policy?: QualityPolicy;

  /** Test results for detailed analysis */
  testResults?: TestResult[];

  /** Deployment context */
  context?: DeploymentContext;
}

/**
 * Deployment context for risk assessment
 */
export interface DeploymentContext {
  /** Deployment target (e.g., canary, blue-green) */
  deploymentTarget?: string;

  /** Criticality level */
  criticality?: Priority;

  /** Code changes */
  changes?: CodeChange[];

  /** Previous deployment history */
  previousDeployments?: PreviousDeployment[];
}

/**
 * Code change information
 */
export interface CodeChange {
  /** File path */
  file: string;

  /** Change type */
  type: 'added' | 'modified' | 'deleted';

  /** Complexity score (1-10) */
  complexity: number;

  /** Lines changed */
  linesChanged?: number;
}

/**
 * Previous deployment information
 */
export interface PreviousDeployment {
  /** Deployment ID */
  id: string;

  /** Success status */
  success: boolean;

  /** Quality score */
  qualityScore: number;

  /** Timestamp */
  timestamp: string;
}

/**
 * Quality gate evaluation result
 */
export interface QualityGateEvaluation {
  /** Final decision */
  decision: 'PASS' | 'FAIL' | 'ESCALATE';

  /** Composite quality score (0-100) */
  score: number;

  /** Dynamic threshold used */
  threshold: number;

  /** Individual criterion evaluations */
  criteriaEvaluations: CriterionEvaluation[];

  /** Risk factors identified */
  riskFactors: RiskFactor[];

  /** Detailed explanation */
  explanation: string;

  /** Actionable recommendations */
  recommendations: string[];

  /** Decision confidence (0-1) */
  confidence: number;

  /** Policy compliance status */
  policyCompliance: PolicyCompliance;

  /** Metadata */
  metadata: EvaluationMetadata;
}

/**
 * Individual criterion evaluation
 */
export interface CriterionEvaluation {
  /** Criterion name */
  name: string;

  /** Rule that was evaluated */
  rule: QualityRule;

  /** Actual metric value */
  value: number;

  /** Whether criterion passed */
  passed: boolean;

  /** Normalized score (0-1) */
  score: number;

  /** Impact assessment */
  impact: string;

  /** Weight in final score */
  weight: number;
}

/**
 * Risk factor identified during evaluation
 */
export interface RiskFactor {
  /** Risk type */
  type: string;

  /** Severity level */
  severity: Priority;

  /** Probability of occurrence (0-1) */
  probability: number;

  /** Impact description */
  impact: string;

  /** Mitigation strategies */
  mitigation: string[];
}

/**
 * Policy compliance details
 */
export interface PolicyCompliance {
  /** Overall compliance status */
  compliant: boolean;

  /** Policy violations */
  violations: PolicyViolation[];

  /** Policy warnings */
  warnings: PolicyWarning[];

  /** Applied policy */
  policyId: string;

  /** Policy version */
  policyVersion: string;
}

/**
 * Policy violation
 */
export interface PolicyViolation {
  /** Rule ID */
  ruleId: string;

  /** Rule name */
  ruleName: string;

  /** Severity */
  severity: Priority;

  /** Violation message */
  message: string;

  /** Actual value */
  actualValue: number;

  /** Expected value */
  expectedValue: number;
}

/**
 * Policy warning
 */
export interface PolicyWarning {
  /** Rule ID */
  ruleId: string;

  /** Warning message */
  message: string;

  /** Recommendation */
  recommendation: string;
}

/**
 * Evaluation metadata
 */
export interface EvaluationMetadata {
  /** Evaluation timestamp */
  evaluatedAt: string;

  /** Evaluation duration (ms) */
  evaluationDuration: number;

  /** Decision tree version */
  decisionTreeVersion: string;

  /** Applied thresholds */
  appliedThresholds: Record<string, number>;

  /** Complexity indicators */
  complexityIndicators?: ComplexityIndicators;
}

/**
 * Complexity indicators for evaluation
 */
export interface ComplexityIndicators {
  /** Overall complexity score */
  overallComplexity: number;

  /** Is highly complex */
  highComplexity: boolean;

  /** Contributing factors */
  factors: {
    highFailureRate: boolean;
    securityVulnerabilities: boolean;
    performanceIssues: boolean;
    codeComplexity: boolean;
  };
}

// ==================== Default Quality Policy ====================

/**
 * Default quality policy based on industry standards
 */
const DEFAULT_QUALITY_POLICY: QualityPolicy = {
  id: 'default-quality-policy',
  name: 'Default Quality Policy',
  rules: [
    {
      metric: 'coverage.overallPercentage',
      operator: 'gte',
      threshold: 80,
      severity: 'critical',
      description: 'Code coverage must be at least 80%'
    },
    {
      metric: 'testResults.failureRate',
      operator: 'lte',
      threshold: 0.05,
      severity: 'critical',
      description: 'Test failure rate must not exceed 5%'
    },
    {
      metric: 'security.summary.critical',
      operator: 'eq',
      threshold: 0,
      severity: 'critical',
      description: 'No critical security vulnerabilities allowed'
    },
    {
      metric: 'security.summary.high',
      operator: 'lte',
      threshold: 2,
      severity: 'high',
      description: 'High severity vulnerabilities must not exceed 2'
    },
    {
      metric: 'performance.errorRate',
      operator: 'lte',
      threshold: 0.10,
      severity: 'medium',
      description: 'Performance error rate must not exceed 10%'
    },
    {
      metric: 'codeQuality.maintainabilityIndex',
      operator: 'gte',
      threshold: 70,
      severity: 'medium',
      description: 'Maintainability index must be at least 70'
    }
  ],
  enforcement: 'blocking',
  environments: ['development', 'staging', 'production']
};

// ==================== Main Evaluation Function ====================

/**
 * Evaluate quality gate using intelligent decision tree
 *
 * Implements multi-factor evaluation with:
 * - Dynamic threshold adjustment
 * - Risk-based decision overrides
 * - Complexity detection
 * - Policy compliance validation
 *
 * @param params - Evaluation parameters
 * @returns Quality gate evaluation result
 */
export async function evaluateQualityGate(
  params: EvaluateQualityGateParams
): Promise<QEToolResponse<QualityGateEvaluation>> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    // Validate parameters
    validateParameters(params);

    // Use provided policy or default
    const policy = params.policy || DEFAULT_QUALITY_POLICY;

    // Detect complexity indicators
    const complexityIndicators = detectComplexityIndicators(
      params.metrics,
      params.testResults || []
    );

    // If highly complex, may require escalation
    if (complexityIndicators.highComplexity && complexityIndicators.overallComplexity > 0.7) {
      const escalationReason = buildComplexityExplanation(complexityIndicators);

      return createSuccessResponse(
        {
          decision: 'ESCALATE',
          score: complexityIndicators.overallComplexity * 100,
          threshold: 70,
          criteriaEvaluations: [],
          riskFactors: buildComplexityRiskFactors(complexityIndicators),
          explanation: escalationReason,
          recommendations: ['Human review required due to complex quality state'],
          confidence: 1 - complexityIndicators.overallComplexity,
          policyCompliance: {
            compliant: false,
            violations: [],
            warnings: [],
            policyId: policy.id,
            policyVersion: '1.0.0'
          },
          metadata: {
            evaluatedAt: new Date().toISOString(),
            evaluationDuration: Date.now() - startTime,
            decisionTreeVersion: '1.0.0',
            appliedThresholds: {},
            complexityIndicators
          }
        },
        requestId,
        Date.now() - startTime
      );
    }

    // Evaluate all policy rules
    const criteriaEvaluations = await evaluatePolicyCriteria(
      params.metrics,
      policy,
      params.context
    );

    // Calculate composite score
    const score = calculateCompositeScore(criteriaEvaluations);

    // Calculate dynamic threshold
    const threshold = calculateDynamicThreshold(
      params.environment,
      params.context,
      params.metrics
    );

    // Validate policy compliance
    const policyCompliance = validatePolicyCompliance(
      criteriaEvaluations,
      policy
    );

    // Analyze risk factors
    const riskFactors = analyzeRiskFactors(
      params.metrics,
      params.context,
      criteriaEvaluations,
      params.testResults || []
    );

    // Make base decision
    const baseDecision = score >= threshold ? 'PASS' : 'FAIL';

    // Apply risk-based overrides
    const finalDecision = applyRiskBasedLogic(
      baseDecision,
      riskFactors,
      policyCompliance
    );

    // Generate explanation
    const explanation = generateDecisionExplanation(
      finalDecision,
      criteriaEvaluations,
      score,
      threshold,
      policyCompliance
    );

    // Generate recommendations
    const recommendations = generateRecommendations(
      criteriaEvaluations,
      riskFactors,
      params.context
    );

    // Calculate decision confidence
    const confidence = calculateDecisionConfidence(
      criteriaEvaluations,
      riskFactors
    );

    const evaluation: QualityGateEvaluation = {
      decision: finalDecision,
      score,
      threshold,
      criteriaEvaluations,
      riskFactors,
      explanation,
      recommendations,
      confidence,
      policyCompliance,
      metadata: {
        evaluatedAt: new Date().toISOString(),
        evaluationDuration: Date.now() - startTime,
        decisionTreeVersion: '1.0.0',
        appliedThresholds: buildAppliedThresholds(criteriaEvaluations),
        complexityIndicators
      }
    };

    return createSuccessResponse(evaluation, requestId, Date.now() - startTime);
  } catch (error) {
    return createErrorResponse(error as Error, requestId, Date.now() - startTime);
  }
}

// ==================== Core Evaluation Functions ====================

/**
 * Evaluate all policy criteria
 */
async function evaluatePolicyCriteria(
  metrics: QualityMetrics,
  policy: QualityPolicy,
  context?: DeploymentContext
): Promise<CriterionEvaluation[]> {
  const evaluations: CriterionEvaluation[] = [];

  // Weights for each criterion type
  const weights: Record<string, number> = {
    coverage: 0.25,
    testResults: 0.30,
    security: 0.25,
    performance: 0.10,
    codeQuality: 0.10
  };

  for (const rule of policy.rules) {
    const value = getMetricValue(metrics, rule.metric);
    const passed = evaluateRule(rule, value);
    const score = calculateRuleScore(rule, value);
    const impact = calculateImpact(rule, value, passed, context);
    const weight = determineWeight(rule.metric, weights);

    evaluations.push({
      name: rule.metric,
      rule,
      value,
      passed,
      score,
      impact,
      weight
    });
  }

  return evaluations;
}

/**
 * Get metric value by path
 */
function getMetricValue(metrics: QualityMetrics, path: string): number {
  const parts = path.split('.');
  let value: any = metrics;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return 0;
    }
  }

  return typeof value === 'number' ? value : 0;
}

/**
 * Evaluate a single rule
 */
function evaluateRule(rule: QualityRule, value: number): boolean {
  switch (rule.operator) {
    case 'gt':
      return value > rule.threshold;
    case 'lt':
      return value < rule.threshold;
    case 'eq':
      return value === rule.threshold;
    case 'gte':
      return value >= rule.threshold;
    case 'lte':
      return value <= rule.threshold;
    case 'ne':
      return value !== rule.threshold;
    default:
      return false;
  }
}

/**
 * Calculate normalized score for a rule
 */
function calculateRuleScore(rule: QualityRule, value: number): number {
  const { operator, threshold } = rule;

  if (operator === 'gte' || operator === 'gt') {
    // Higher is better
    return threshold > 0 ? Math.min(1.0, value / threshold) : 1.0;
  } else if (operator === 'lte' || operator === 'lt') {
    // Lower is better
    return value <= threshold ? 1.0 : Math.max(0.0, 1.0 - (value - threshold) / threshold);
  } else if (operator === 'eq') {
    // Exact match
    return value === threshold ? 1.0 : 0.0;
  }

  return 0.0;
}

/**
 * Calculate impact description
 */
function calculateImpact(
  rule: QualityRule,
  value: number,
  passed: boolean,
  context?: DeploymentContext
): string {
  if (passed) {
    return `${rule.description} - Criterion satisfied`;
  }

  const criticalityBoost =
    context?.criticality === 'critical' ? ' (CRITICAL DEPLOYMENT)' : '';

  if (rule.severity === 'critical') {
    return `High impact - ${rule.description} - Blocking issue${criticalityBoost}`;
  } else if (rule.severity === 'high') {
    return `Medium-high impact - ${rule.description}${criticalityBoost}`;
  } else {
    return `Medium impact - ${rule.description}`;
  }
}

/**
 * Determine weight for a metric
 */
function determineWeight(metricPath: string, weights: Record<string, number>): number {
  if (metricPath.startsWith('coverage')) return weights.coverage;
  if (metricPath.startsWith('testResults')) return weights.testResults;
  if (metricPath.startsWith('security')) return weights.security;
  if (metricPath.startsWith('performance')) return weights.performance;
  if (metricPath.startsWith('codeQuality')) return weights.codeQuality;
  return 0.1;
}

// ==================== Decision Logic ====================

/**
 * Calculate composite quality score
 */
function calculateCompositeScore(evaluations: CriterionEvaluation[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const evaluation of evaluations) {
    weightedSum += evaluation.score * evaluation.weight;
    totalWeight += evaluation.weight;
  }

  const score = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
  return Math.round(score * 100) / 100;
}

/**
 * Calculate dynamic threshold based on context
 */
function calculateDynamicThreshold(
  environment: Environment,
  context?: DeploymentContext,
  metrics?: QualityMetrics
): number {
  let baseThreshold = 80; // Default 80%

  // Adjust for environment
  if (environment === 'production') {
    baseThreshold += 5;
  } else if (environment === 'development') {
    baseThreshold -= 5;
  }

  // Adjust for criticality
  if (context?.criticality === 'critical') {
    baseThreshold += 5;
  } else if (context?.criticality === 'low') {
    baseThreshold -= 3;
  }

  // Adjust for change magnitude
  const changeMagnitude = calculateChangeMagnitude(context?.changes || []);
  if (changeMagnitude > 0.5) {
    baseThreshold += 3;
  }

  // Adjust for historical performance
  if (context?.previousDeployments && context.previousDeployments.length > 0) {
    const avgHistoricalScore =
      context.previousDeployments.reduce((sum, d) => sum + d.qualityScore, 0) /
      context.previousDeployments.length;

    if (avgHistoricalScore > 90) {
      baseThreshold -= 2; // Slight relaxation for stable systems
    }
  }

  // Ensure threshold stays within bounds
  return Math.max(50, Math.min(95, baseThreshold));
}

/**
 * Calculate change magnitude
 */
function calculateChangeMagnitude(changes: CodeChange[]): number {
  if (changes.length === 0) return 0;

  const totalComplexity = changes.reduce((sum, c) => sum + c.complexity, 0);
  const avgComplexity = totalComplexity / changes.length;

  return Math.min(1.0, avgComplexity / 10);
}

/**
 * Apply risk-based decision overrides
 */
function applyRiskBasedLogic(
  baseDecision: string,
  riskFactors: RiskFactor[],
  policyCompliance: PolicyCompliance
): 'PASS' | 'FAIL' | 'ESCALATE' {
  // Critical policy violations always fail
  if (!policyCompliance.compliant) {
    const criticalViolations = policyCompliance.violations.filter(
      (v) => v.severity === 'critical'
    );
    if (criticalViolations.length > 0) {
      return 'FAIL';
    }
  }

  // Critical risks override positive decisions
  const criticalRisks = riskFactors.filter((rf) => rf.severity === 'critical');
  if (criticalRisks.length > 0) {
    return 'FAIL';
  }

  // Multiple high risks require escalation
  const highRisks = riskFactors.filter((rf) => rf.severity === 'high');
  if (highRisks.length > 1 && baseDecision === 'PASS') {
    return 'ESCALATE';
  }

  return baseDecision as 'PASS' | 'FAIL' | 'ESCALATE';
}

// ==================== Risk Analysis ====================

/**
 * Analyze risk factors
 */
function analyzeRiskFactors(
  metrics: QualityMetrics,
  context: DeploymentContext | undefined,
  evaluations: CriterionEvaluation[],
  testResults: TestResult[]
): RiskFactor[] {
  const risks: RiskFactor[] = [];

  // Deployment risk
  if (context?.deploymentTarget === 'production' && context?.criticality === 'critical') {
    risks.push({
      type: 'deployment-risk',
      severity: 'high',
      probability: 0.3,
      impact: 'Critical production deployment with potential for service disruption',
      mitigation: [
        'Implement staged rollout',
        'Prepare rollback plan',
        'Enable comprehensive monitoring',
        'Conduct final manual review'
      ]
    });
  }

  // Change complexity risk
  const changes = context?.changes || [];
  const highComplexityChanges = changes.filter((c) => c.complexity > 8);
  if (highComplexityChanges.length > 0) {
    risks.push({
      type: 'complexity-risk',
      severity: 'medium',
      probability: 0.4,
      impact: `${highComplexityChanges.length} high-complexity changes increase defect probability`,
      mitigation: [
        'Conduct thorough code review',
        'Add additional test coverage',
        'Implement gradual rollout',
        'Monitor error rates closely'
      ]
    });
  }

  // Security risk
  if (metrics.security.summary.critical > 0) {
    risks.push({
      type: 'security-risk',
      severity: 'critical',
      probability: 0.8,
      impact: `${metrics.security.summary.critical} critical security vulnerabilities detected`,
      mitigation: [
        'Block deployment immediately',
        'Address critical vulnerabilities',
        'Conduct security audit',
        'Implement security hardening'
      ]
    });
  }

  // Test quality risk
  const failedCritical = evaluations.filter(
    (e) => !e.passed && e.rule.severity === 'critical'
  );
  if (failedCritical.length > 0) {
    risks.push({
      type: 'test-quality-risk',
      severity: 'high',
      probability: 0.7,
      impact: 'Critical quality criteria not met',
      mitigation: [
        'Fix failing tests',
        'Increase test coverage',
        'Review test strategy',
        'Conduct root cause analysis'
      ]
    });
  }

  // Performance degradation risk
  if (metrics.performance.errorRate > 0.05) {
    risks.push({
      type: 'performance-risk',
      severity: 'medium',
      probability: 0.5,
      impact: `Error rate of ${(metrics.performance.errorRate * 100).toFixed(1)}% exceeds threshold`,
      mitigation: [
        'Optimize critical paths',
        'Implement caching',
        'Scale resources',
        'Conduct load testing'
      ]
    });
  }

  // Flaky test risk
  if (metrics.testResults.flakyTests && metrics.testResults.flakyTests > 0) {
    risks.push({
      type: 'flaky-test-risk',
      severity: 'medium',
      probability: 0.6,
      impact: `${metrics.testResults.flakyTests} flaky tests detected - reliability concerns`,
      mitigation: [
        'Stabilize flaky tests',
        'Investigate timing issues',
        'Fix race conditions',
        'Improve test isolation'
      ]
    });
  }

  return risks;
}

// ==================== Policy Compliance ====================

/**
 * Validate policy compliance
 */
function validatePolicyCompliance(
  evaluations: CriterionEvaluation[],
  policy: QualityPolicy
): PolicyCompliance {
  const violations: PolicyViolation[] = [];
  const warnings: PolicyWarning[] = [];

  for (const evaluation of evaluations) {
    if (!evaluation.passed) {
      const violation: PolicyViolation = {
        ruleId: `rule-${evaluation.name}`,
        ruleName: evaluation.rule.description || evaluation.name,
        severity: evaluation.rule.severity,
        message: evaluation.impact,
        actualValue: evaluation.value,
        expectedValue: evaluation.rule.threshold
      };

      if (evaluation.rule.severity === 'critical' || evaluation.rule.severity === 'high') {
        violations.push(violation);
      } else {
        warnings.push({
          ruleId: violation.ruleId,
          message: violation.message,
          recommendation: `Improve ${evaluation.name} to meet quality standards`
        });
      }
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    warnings,
    policyId: policy.id,
    policyVersion: '1.0.0'
  };
}

// ==================== Complexity Detection ====================

/**
 * Detect complexity indicators
 */
function detectComplexityIndicators(
  metrics: QualityMetrics,
  testResults: TestResult[]
): ComplexityIndicators {
  const failureRate = metrics.testResults.failureRate;
  const vulnerabilityCount = metrics.security.summary.critical + metrics.security.summary.high;
  const performanceIssues = metrics.performance.errorRate > 0.05;
  const codeComplexity = metrics.codeQuality.cyclomaticComplexity > 15;

  const complexityScore =
    failureRate * 0.3 +
    (vulnerabilityCount > 0 ? 0.25 : 0) +
    (performanceIssues ? 0.25 : 0) +
    (codeComplexity ? 0.20 : 0);

  return {
    overallComplexity: complexityScore,
    highComplexity: complexityScore > 0.6,
    factors: {
      highFailureRate: failureRate > 0.1,
      securityVulnerabilities: vulnerabilityCount > 0,
      performanceIssues,
      codeComplexity
    }
  };
}

/**
 * Build complexity explanation
 */
function buildComplexityExplanation(indicators: ComplexityIndicators): string {
  const factors: string[] = [];

  if (indicators.factors.highFailureRate) {
    factors.push('high test failure rate');
  }
  if (indicators.factors.securityVulnerabilities) {
    factors.push('security vulnerabilities detected');
  }
  if (indicators.factors.performanceIssues) {
    factors.push('performance degradation');
  }
  if (indicators.factors.codeComplexity) {
    factors.push('high code complexity');
  }

  return `Complex quality state detected (score: ${(indicators.overallComplexity * 100).toFixed(1)}%). Contributing factors: ${factors.join(', ')}. Human review recommended for final deployment decision.`;
}

/**
 * Build complexity risk factors
 */
function buildComplexityRiskFactors(indicators: ComplexityIndicators): RiskFactor[] {
  return [
    {
      type: 'complexity-risk',
      severity: 'high',
      probability: indicators.overallComplexity,
      impact: 'Quality state too complex for automated decision',
      mitigation: [
        'Manual review required',
        'Address identified complexity factors',
        'Consider additional testing',
        'Implement staged deployment'
      ]
    }
  ];
}

// ==================== Recommendations ====================

/**
 * Generate actionable recommendations
 */
function generateRecommendations(
  evaluations: CriterionEvaluation[],
  riskFactors: RiskFactor[],
  context?: DeploymentContext
): string[] {
  const recommendations: string[] = [];

  // Recommendation from failed evaluations
  const failedEvaluations = evaluations.filter((e) => !e.passed);
  for (const failed of failedEvaluations) {
    if (failed.name.includes('coverage')) {
      recommendations.push(
        `Increase test coverage to ${failed.rule.threshold}% (current: ${failed.value.toFixed(1)}%)`
      );
    } else if (failed.name.includes('failureRate')) {
      recommendations.push(
        `Reduce test failure rate to below ${(failed.rule.threshold * 100).toFixed(1)}% (current: ${(failed.value * 100).toFixed(1)}%)`
      );
    } else if (failed.name.includes('security')) {
      recommendations.push('Address critical security vulnerabilities before deployment');
    } else if (failed.name.includes('performance')) {
      recommendations.push('Optimize performance to reduce error rate');
    } else if (failed.name.includes('maintainability')) {
      recommendations.push('Refactor code to improve maintainability index');
    }
  }

  // Risk-specific recommendations
  for (const risk of riskFactors) {
    if (risk.severity === 'critical' || risk.severity === 'high') {
      recommendations.push(...risk.mitigation);
    }
  }

  // Context-specific recommendations
  if (context?.criticality === 'critical' && failedEvaluations.length > 0) {
    recommendations.push('CRITICAL DEPLOYMENT: Consider additional manual testing and staged rollout');
  }

  if (context?.changes && context.changes.length > 10) {
    recommendations.push(
      'Large changeset detected - consider breaking into smaller, incremental deployments'
    );
  }

  // Remove duplicates and limit to top 10
  return Array.from(new Set(recommendations)).slice(0, 10);
}

// ==================== Explanation Generation ====================

/**
 * Generate decision explanation
 */
function generateDecisionExplanation(
  decision: string,
  evaluations: CriterionEvaluation[],
  score: number,
  threshold: number,
  policyCompliance: PolicyCompliance
): string {
  const passedCount = evaluations.filter((e) => e.passed).length;
  const totalCount = evaluations.length;
  const criticalFailures = evaluations.filter(
    (e) => !e.passed && e.rule.severity === 'critical'
  );

  let explanation = `Quality gate evaluation completed. Score: ${score.toFixed(1)}/${threshold.toFixed(1)}. `;
  explanation += `${passedCount}/${totalCount} criteria passed. `;

  if (decision === 'PASS') {
    explanation += 'All critical quality criteria met. Deployment approved.';
  } else if (decision === 'FAIL') {
    if (criticalFailures.length > 0) {
      const failedCriteria = criticalFailures.map((cf) => cf.name).join(', ');
      explanation += `Critical failures in: ${failedCriteria}. `;
    }
    explanation += 'Quality standards not met. Deployment blocked.';

    if (policyCompliance.violations.length > 0) {
      explanation += ` (${policyCompliance.violations.length} policy violations)`;
    }
  } else if (decision === 'ESCALATE') {
    explanation += 'Multiple high-severity issues or complex quality state detected. Human review required before deployment.';
  }

  return explanation;
}

// ==================== Confidence Calculation ====================

/**
 * Calculate decision confidence
 */
function calculateDecisionConfidence(
  evaluations: CriterionEvaluation[],
  riskFactors: RiskFactor[]
): number {
  let confidenceSum = 0;
  let weightSum = 0;

  // Confidence from criteria evaluations
  for (const evaluation of evaluations) {
    const distance = Math.abs(evaluation.value - evaluation.rule.threshold);
    const normalizedDistance = Math.min(1, distance / Math.max(1, evaluation.rule.threshold));
    const criterionConfidence = 0.5 + normalizedDistance * 0.5;

    confidenceSum += criterionConfidence * evaluation.weight;
    weightSum += evaluation.weight;
  }

  let baseConfidence = weightSum > 0 ? confidenceSum / weightSum : 0.5;

  // Reduce confidence for risks
  const criticalRisks = riskFactors.filter((rf) => rf.severity === 'critical').length;
  const highRisks = riskFactors.filter((rf) => rf.severity === 'high').length;

  baseConfidence -= criticalRisks * 0.15;
  baseConfidence -= highRisks * 0.05;

  return Math.max(0.1, Math.min(1.0, baseConfidence));
}

// ==================== Utility Functions ====================

/**
 * Build applied thresholds summary
 */
function buildAppliedThresholds(evaluations: CriterionEvaluation[]): Record<string, number> {
  const thresholds: Record<string, number> = {};

  for (const evaluation of evaluations) {
    thresholds[evaluation.name] = evaluation.rule.threshold;
  }

  return thresholds;
}

/**
 * Validate parameters
 */
function validateParameters(params: EvaluateQualityGateParams): void {
  if (!params.projectId) {
    throw new Error('projectId is required');
  }
  if (!params.buildId) {
    throw new Error('buildId is required');
  }
  if (!params.environment) {
    throw new Error('environment is required');
  }
  if (!params.metrics) {
    throw new Error('metrics are required');
  }
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `qg-eval-${Date.now()}-${seededRandom.random().toString(36).substr(2, 9)}`;
}

/**
 * Create success response
 */
function createSuccessResponse(
  data: QualityGateEvaluation,
  requestId: string,
  executionTime: number
): QEToolResponse<QualityGateEvaluation> {
  return {
    success: true,
    data,
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'quality-gate-evaluator',
      version: '1.0.0'
    }
  };
}

/**
 * Create error response
 */
function createErrorResponse(
  error: Error,
  requestId: string,
  executionTime: number
): QEToolResponse<QualityGateEvaluation> {
  return {
    success: false,
    error: {
      code: 'EVALUATION_ERROR',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    },
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'quality-gate-evaluator',
      version: '1.0.0'
    }
  };
}
