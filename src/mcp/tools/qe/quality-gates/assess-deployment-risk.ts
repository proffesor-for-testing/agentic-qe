/**
 * Deployment Risk Assessment Tool
 *
 * Comprehensive risk assessment for deployments using multi-factor analysis.
 * Evaluates deployment readiness based on quality metrics, environment context,
 * historical data, and change complexity.
 *
 * @module tools/qe/quality-gates/assess-deployment-risk
 * @version 1.0.0
 * @author Agentic QE Team - Phase 3
 * @date 2025-11-09
 */

import {
  QualityMetrics,
  Environment,
  Priority,
  QEToolResponse,
  ResponseMetadata
} from '../shared/types.js';
import { seededRandom } from '../../../../utils/SeededRandom.js';

// ==================== Types ====================

/**
 * Parameters for deployment risk assessment
 */
export interface AssessDeploymentRiskParams {
  /** Project identifier */
  projectId: string;

  /** Deployment identifier */
  deploymentId: string;

  /** Target environment */
  environment: Environment;

  /** Current quality metrics */
  metrics: QualityMetrics;

  /** Deployment configuration */
  deploymentConfig: DeploymentConfig;

  /** Historical deployments */
  historicalDeployments?: HistoricalDeployment[];

  /** Code changes */
  changes?: CodeChangeInfo[];
}

/**
 * Deployment configuration
 */
export interface DeploymentConfig {
  /** Deployment strategy */
  strategy: 'rolling' | 'blue-green' | 'canary' | 'recreate';

  /** Target instances */
  targetInstances: number;

  /** Rollback enabled */
  rollbackEnabled: boolean;

  /** Health checks configured */
  healthChecks: boolean;

  /** Monitoring enabled */
  monitoringEnabled: boolean;

  /** Deployment criticality */
  criticality: Priority;

  /** Deployment window */
  window?: {
    start: string;
    end: string;
  };
}

/**
 * Historical deployment record
 */
export interface HistoricalDeployment {
  /** Deployment ID */
  id: string;

  /** Environment */
  environment: Environment;

  /** Success status */
  success: boolean;

  /** Quality score at deployment */
  qualityScore: number;

  /** Deployment duration (minutes) */
  duration: number;

  /** Incidents count */
  incidents: number;

  /** Rollback performed */
  rolledBack: boolean;

  /** Timestamp */
  timestamp: string;
}

/**
 * Code change information
 */
export interface CodeChangeInfo {
  /** File path */
  file: string;

  /** Change type */
  type: 'added' | 'modified' | 'deleted';

  /** Lines changed */
  linesChanged: number;

  /** Cyclomatic complexity delta */
  complexityDelta: number;

  /** Test coverage */
  coverage: number;

  /** Author */
  author: string;

  /** Commit hash */
  commit: string;

  /** Change timestamp */
  timestamp: string;
}

/**
 * Deployment risk assessment result
 */
export interface DeploymentRiskAssessment {
  /** Overall risk level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  /** Risk score (0-100) */
  riskScore: number;

  /** Deployment recommendation */
  recommendation: 'proceed' | 'proceed-with-caution' | 'delay' | 'block';

  /** Risk factors identified */
  riskFactors: RiskFactor[];

  /** Risk categories */
  categories: RiskCategories;

  /** Mitigation strategies */
  mitigationStrategies: MitigationStrategy[];

  /** Readiness indicators */
  readinessIndicators: ReadinessIndicators;

  /** Prediction analysis */
  prediction: PredictionAnalysis;

  /** Confidence in assessment */
  confidence: number;
}

/**
 * Individual risk factor
 */
export interface RiskFactor {
  /** Risk category */
  category: string;

  /** Risk type */
  type: string;

  /** Severity */
  severity: Priority;

  /** Probability (0-1) */
  probability: number;

  /** Impact score (0-10) */
  impact: number;

  /** Description */
  description: string;

  /** Evidence */
  evidence: string[];
}

/**
 * Risk categories breakdown
 */
export interface RiskCategories {
  /** Quality risk */
  quality: CategoryRisk;

  /** Security risk */
  security: CategoryRisk;

  /** Performance risk */
  performance: CategoryRisk;

  /** Infrastructure risk */
  infrastructure: CategoryRisk;

  /** Change risk */
  change: CategoryRisk;
}

/**
 * Category-specific risk assessment
 */
export interface CategoryRisk {
  /** Risk level */
  level: Priority;

  /** Risk score (0-100) */
  score: number;

  /** Contributing factors */
  factors: string[];

  /** Indicators */
  indicators: {
    positive: string[];
    negative: string[];
  };
}

/**
 * Mitigation strategy
 */
export interface MitigationStrategy {
  /** Risk being mitigated */
  riskType: string;

  /** Strategy description */
  strategy: string;

  /** Implementation steps */
  steps: string[];

  /** Expected impact */
  expectedImpact: string;

  /** Effort required */
  effort: 'low' | 'medium' | 'high';

  /** Priority */
  priority: Priority;
}

/**
 * Readiness indicators
 */
export interface ReadinessIndicators {
  /** Overall readiness percentage */
  overall: number;

  /** Individual indicators */
  indicators: {
    qualityMetrics: boolean;
    testCoverage: boolean;
    securityScan: boolean;
    performanceBaseline: boolean;
    rollbackPlan: boolean;
    monitoring: boolean;
    documentation: boolean;
  };

  /** Missing requirements */
  missing: string[];
}

/**
 * Prediction analysis
 */
export interface PredictionAnalysis {
  /** Predicted success probability */
  successProbability: number;

  /** Predicted incident count */
  predictedIncidents: number;

  /** Predicted rollback probability */
  rollbackProbability: number;

  /** Confidence in prediction */
  confidence: number;

  /** Based on historical data */
  basedOn: {
    deploymentCount: number;
    timeRange: string;
  };
}

// ==================== Main Assessment Function ====================

/**
 * Assess deployment risk using multi-factor analysis
 *
 * Evaluates:
 * - Quality metrics
 * - Security vulnerabilities
 * - Performance indicators
 * - Infrastructure readiness
 * - Change complexity
 * - Historical patterns
 *
 * @param params - Assessment parameters
 * @returns Comprehensive risk assessment
 */
export async function assessDeploymentRisk(
  params: AssessDeploymentRiskParams
): Promise<QEToolResponse<DeploymentRiskAssessment>> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    // Validate parameters
    validateParameters(params);

    // Assess individual risk categories
    const qualityRisk = assessQualityRisk(params.metrics);
    const securityRisk = assessSecurityRisk(params.metrics);
    const performanceRisk = assessPerformanceRisk(params.metrics);
    const infrastructureRisk = assessInfrastructureRisk(params.deploymentConfig);
    const changeRisk = assessChangeRisk(params.changes || []);

    const categories: RiskCategories = {
      quality: qualityRisk,
      security: securityRisk,
      performance: performanceRisk,
      infrastructure: infrastructureRisk,
      change: changeRisk
    };

    // Identify individual risk factors
    const riskFactors = identifyRiskFactors(params);

    // Calculate overall risk score
    const riskScore = calculateOverallRiskScore(categories);

    // Determine risk level
    const riskLevel = determineRiskLevel(riskScore);

    // Assess readiness
    const readinessIndicators = assessReadiness(params);

    // Generate prediction
    const prediction = generatePrediction(
      params.metrics,
      params.historicalDeployments || [],
      riskScore
    );

    // Generate mitigation strategies
    const mitigationStrategies = generateMitigationStrategies(riskFactors, categories);

    // Calculate confidence
    const confidence = calculateConfidence(params, riskFactors);

    // Make recommendation
    const recommendation = makeRecommendation(
      riskLevel,
      readinessIndicators,
      params.deploymentConfig
    );

    const assessment: DeploymentRiskAssessment = {
      riskLevel,
      riskScore,
      recommendation,
      riskFactors,
      categories,
      mitigationStrategies,
      readinessIndicators,
      prediction,
      confidence
    };

    return createSuccessResponse(assessment, requestId, Date.now() - startTime);
  } catch (error) {
    return createErrorResponse(error as Error, requestId, Date.now() - startTime);
  }
}

// ==================== Risk Category Assessments ====================

/**
 * Assess quality risk
 */
function assessQualityRisk(metrics: QualityMetrics): CategoryRisk {
  const factors: string[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;

  // Coverage analysis
  if (metrics.coverage.overallPercentage >= 80) {
    positive.push(`Strong test coverage: ${metrics.coverage.overallPercentage}%`);
    score += 20;
  } else {
    negative.push(`Low test coverage: ${metrics.coverage.overallPercentage}%`);
    factors.push('Insufficient test coverage');
    score += 60;
  }

  // Test results analysis
  const failureRate = metrics.testResults.failureRate;
  if (failureRate <= 0.02) {
    positive.push(`Low test failure rate: ${(failureRate * 100).toFixed(1)}%`);
    score += 10;
  } else {
    negative.push(`High test failure rate: ${(failureRate * 100).toFixed(1)}%`);
    factors.push('High test failure rate');
    score += 40;
  }

  // Code quality
  if (metrics.codeQuality.maintainabilityIndex >= 70) {
    positive.push(`Good maintainability: ${metrics.codeQuality.maintainabilityIndex}`);
    score += 10;
  } else {
    negative.push(`Low maintainability: ${metrics.codeQuality.maintainabilityIndex}`);
    factors.push('Low code maintainability');
    score += 30;
  }

  const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

  return {
    level: level as Priority,
    score,
    factors,
    indicators: { positive, negative }
  };
}

/**
 * Assess security risk
 */
function assessSecurityRisk(metrics: QualityMetrics): CategoryRisk {
  const factors: string[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;

  const { critical, high, medium } = metrics.security.summary;

  if (critical > 0) {
    negative.push(`${critical} critical vulnerabilities`);
    factors.push('Critical security vulnerabilities present');
    score += 80;
  }

  if (high > 0) {
    negative.push(`${high} high severity vulnerabilities`);
    factors.push('High severity vulnerabilities present');
    score += 50;
  }

  if (medium > 5) {
    negative.push(`${medium} medium severity vulnerabilities`);
    factors.push('Multiple medium severity vulnerabilities');
    score += 20;
  }

  if (critical === 0 && high === 0) {
    positive.push('No critical or high severity vulnerabilities');
    score = Math.max(0, score - 30);
  }

  const level = score >= 60 ? 'critical' : score >= 40 ? 'high' : score >= 20 ? 'medium' : 'low';

  return {
    level: level as Priority,
    score,
    factors,
    indicators: { positive, negative }
  };
}

/**
 * Assess performance risk
 */
function assessPerformanceRisk(metrics: QualityMetrics): CategoryRisk {
  const factors: string[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;

  const { errorRate, responseTime } = metrics.performance;

  if (errorRate > 0.05) {
    negative.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
    factors.push('Elevated error rate');
    score += 40;
  } else {
    positive.push(`Low error rate: ${(errorRate * 100).toFixed(1)}%`);
  }

  if (responseTime.p99 > 5000) {
    negative.push(`Slow p99 response time: ${responseTime.p99}ms`);
    factors.push('High latency detected');
    score += 30;
  } else if (responseTime.p99 < 1000) {
    positive.push(`Fast p99 response time: ${responseTime.p99}ms`);
  }

  const level = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

  return {
    level: level as Priority,
    score,
    factors,
    indicators: { positive, negative }
  };
}

/**
 * Assess infrastructure risk
 */
function assessInfrastructureRisk(config: DeploymentConfig): CategoryRisk {
  const factors: string[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;

  if (!config.rollbackEnabled) {
    negative.push('Rollback not enabled');
    factors.push('No rollback capability');
    score += 40;
  } else {
    positive.push('Rollback enabled');
  }

  if (!config.healthChecks) {
    negative.push('Health checks not configured');
    factors.push('Missing health checks');
    score += 30;
  } else {
    positive.push('Health checks configured');
  }

  if (!config.monitoringEnabled) {
    negative.push('Monitoring not enabled');
    factors.push('Insufficient monitoring');
    score += 25;
  } else {
    positive.push('Monitoring enabled');
  }

  if (config.strategy === 'recreate') {
    negative.push('High-risk deployment strategy (recreate)');
    factors.push('Non-rolling deployment strategy');
    score += 20;
  } else if (config.strategy === 'canary' || config.strategy === 'blue-green') {
    positive.push(`Safe deployment strategy: ${config.strategy}`);
    score = Math.max(0, score - 15);
  }

  const level = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

  return {
    level: level as Priority,
    score,
    factors,
    indicators: { positive, negative }
  };
}

/**
 * Assess change risk
 */
function assessChangeRisk(changes: CodeChangeInfo[]): CategoryRisk {
  const factors: string[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;

  if (changes.length === 0) {
    positive.push('No code changes');
    return {
      level: 'low',
      score: 0,
      factors: [],
      indicators: { positive, negative }
    };
  }

  const totalLines = changes.reduce((sum, c) => sum + c.linesChanged, 0);
  const avgComplexity =
    changes.reduce((sum, c) => sum + Math.abs(c.complexityDelta), 0) / changes.length;
  const avgCoverage = changes.reduce((sum, c) => sum + c.coverage, 0) / changes.length;

  if (totalLines > 1000) {
    negative.push(`Large changeset: ${totalLines} lines`);
    factors.push('Large volume of changes');
    score += 40;
  } else if (totalLines < 100) {
    positive.push(`Small changeset: ${totalLines} lines`);
  }

  if (avgComplexity > 5) {
    negative.push(`High complexity changes: avg ${avgComplexity.toFixed(1)}`);
    factors.push('High complexity modifications');
    score += 35;
  }

  if (avgCoverage < 0.7) {
    negative.push(`Low test coverage for changes: ${(avgCoverage * 100).toFixed(1)}%`);
    factors.push('Insufficient test coverage for changes');
    score += 30;
  } else {
    positive.push(`Good test coverage for changes: ${(avgCoverage * 100).toFixed(1)}%`);
  }

  const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

  return {
    level: level as Priority,
    score,
    factors,
    indicators: { positive, negative }
  };
}

// ==================== Risk Factor Identification ====================

/**
 * Identify individual risk factors
 */
function identifyRiskFactors(params: AssessDeploymentRiskParams): RiskFactor[] {
  const factors: RiskFactor[] = [];

  // Quality factors
  if (params.metrics.testResults.failureRate > 0.05) {
    factors.push({
      category: 'quality',
      type: 'test-failures',
      severity: 'high',
      probability: params.metrics.testResults.failureRate,
      impact: 8,
      description: 'High test failure rate indicates potential quality issues',
      evidence: [
        `${params.metrics.testResults.failed} of ${params.metrics.testResults.total} tests failing`,
        `Failure rate: ${(params.metrics.testResults.failureRate * 100).toFixed(1)}%`
      ]
    });
  }

  // Security factors
  if (params.metrics.security.summary.critical > 0) {
    factors.push({
      category: 'security',
      type: 'critical-vulnerabilities',
      severity: 'critical',
      probability: 0.9,
      impact: 10,
      description: 'Critical security vulnerabilities present',
      evidence: [
        `${params.metrics.security.summary.critical} critical vulnerabilities`,
        'Immediate security risk to production environment'
      ]
    });
  }

  // Performance factors
  if (params.metrics.performance.errorRate > 0.05) {
    factors.push({
      category: 'performance',
      type: 'error-rate',
      severity: 'medium',
      probability: 0.6,
      impact: 7,
      description: 'Elevated error rate may impact user experience',
      evidence: [
        `Error rate: ${(params.metrics.performance.errorRate * 100).toFixed(1)}%`,
        'Potential stability issues'
      ]
    });
  }

  // Infrastructure factors
  if (!params.deploymentConfig.rollbackEnabled) {
    factors.push({
      category: 'infrastructure',
      type: 'no-rollback',
      severity: 'high',
      probability: 0.3,
      impact: 9,
      description: 'No rollback capability increases deployment risk',
      evidence: ['Rollback not configured', 'Manual intervention required for failures']
    });
  }

  // Change factors
  const changes = params.changes || [];
  const highComplexityChanges = changes.filter((c) => Math.abs(c.complexityDelta) > 5);
  if (highComplexityChanges.length > 0) {
    factors.push({
      category: 'change',
      type: 'high-complexity',
      severity: 'medium',
      probability: 0.5,
      impact: 6,
      description: 'High complexity changes increase defect probability',
      evidence: [
        `${highComplexityChanges.length} high-complexity changes`,
        `Files affected: ${highComplexityChanges.map((c) => c.file).join(', ')}`
      ]
    });
  }

  return factors;
}

// ==================== Risk Calculation ====================

/**
 * Calculate overall risk score
 */
function calculateOverallRiskScore(categories: RiskCategories): number {
  const weights = {
    quality: 0.25,
    security: 0.30,
    performance: 0.15,
    infrastructure: 0.15,
    change: 0.15
  };

  const weightedScore =
    categories.quality.score * weights.quality +
    categories.security.score * weights.security +
    categories.performance.score * weights.performance +
    categories.infrastructure.score * weights.infrastructure +
    categories.change.score * weights.change;

  return Math.round(weightedScore * 100) / 100;
}

/**
 * Determine risk level from score
 */
function determineRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 70) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

// ==================== Readiness Assessment ====================

/**
 * Assess deployment readiness
 */
function assessReadiness(params: AssessDeploymentRiskParams): ReadinessIndicators {
  const indicators = {
    qualityMetrics: params.metrics.coverage.overallPercentage >= 70,
    testCoverage: params.metrics.coverage.overallPercentage >= 80,
    securityScan: params.metrics.security.summary.critical === 0,
    performanceBaseline: params.metrics.performance.errorRate <= 0.05,
    rollbackPlan: params.deploymentConfig.rollbackEnabled,
    monitoring: params.deploymentConfig.monitoringEnabled,
    documentation: true // Assume true for now
  };

  const missing: string[] = [];
  const indicatorCount = Object.keys(indicators).length;
  let readyCount = 0;

  for (const [key, value] of Object.entries(indicators)) {
    if (value) {
      readyCount++;
    } else {
      missing.push(key.replace(/([A-Z])/g, ' $1').toLowerCase());
    }
  }

  const overall = Math.round((readyCount / indicatorCount) * 100);

  return {
    overall,
    indicators,
    missing
  };
}

// ==================== Prediction Analysis ====================

/**
 * Generate deployment prediction
 */
function generatePrediction(
  metrics: QualityMetrics,
  historical: HistoricalDeployment[],
  riskScore: number
): PredictionAnalysis {
  const recentDeployments = historical.slice(0, 10);
  const successCount = recentDeployments.filter((d) => d.success).length;
  const rollbackCount = recentDeployments.filter((d) => d.rolledBack).length;

  // Base success probability on historical data
  let successProbability = historical.length > 0 ? successCount / recentDeployments.length : 0.7;

  // Adjust based on current risk score
  successProbability *= 1 - riskScore / 200;

  // Predict incidents based on risk and historical data
  const avgIncidents =
    historical.length > 0
      ? recentDeployments.reduce((sum, d) => sum + d.incidents, 0) / recentDeployments.length
      : 0;
  const predictedIncidents = Math.max(0, Math.round(avgIncidents * (riskScore / 50)));

  // Predict rollback probability
  const historicalRollbackRate =
    historical.length > 0 ? rollbackCount / recentDeployments.length : 0.05;
  const rollbackProbability = Math.min(0.9, historicalRollbackRate + riskScore / 200);

  // Confidence based on historical data availability
  const confidence = Math.min(0.9, 0.5 + (historical.length / 20) * 0.4);

  return {
    successProbability: Math.max(0.1, Math.min(0.99, successProbability)),
    predictedIncidents,
    rollbackProbability: Math.max(0.01, rollbackProbability),
    confidence,
    basedOn: {
      deploymentCount: historical.length,
      timeRange: historical.length > 0 ? `Last ${recentDeployments.length} deployments` : 'N/A'
    }
  };
}

// ==================== Mitigation Strategies ====================

/**
 * Generate mitigation strategies
 */
function generateMitigationStrategies(
  riskFactors: RiskFactor[],
  categories: RiskCategories
): MitigationStrategy[] {
  const strategies: MitigationStrategy[] = [];

  // Critical and high severity risks
  const criticalRisks = riskFactors.filter((rf) => rf.severity === 'critical' || rf.severity === 'high');

  for (const risk of criticalRisks) {
    if (risk.type === 'critical-vulnerabilities') {
      strategies.push({
        riskType: risk.type,
        strategy: 'Address critical security vulnerabilities before deployment',
        steps: [
          'Run comprehensive security scan',
          'Patch all critical vulnerabilities',
          'Re-scan to verify fixes',
          'Update security dependencies'
        ],
        expectedImpact: 'Eliminates critical security risk',
        effort: 'high',
        priority: 'critical'
      });
    } else if (risk.type === 'test-failures') {
      strategies.push({
        riskType: risk.type,
        strategy: 'Fix failing tests to ensure quality',
        steps: [
          'Investigate root cause of test failures',
          'Fix failing tests',
          'Run full test suite',
          'Verify test stability'
        ],
        expectedImpact: 'Improves quality confidence',
        effort: 'medium',
        priority: 'high'
      });
    } else if (risk.type === 'no-rollback') {
      strategies.push({
        riskType: risk.type,
        strategy: 'Enable rollback capability',
        steps: [
          'Configure deployment rollback',
          'Test rollback procedure',
          'Document rollback process',
          'Train team on rollback'
        ],
        expectedImpact: 'Reduces deployment risk',
        effort: 'medium',
        priority: 'high'
      });
    }
  }

  // Category-specific strategies
  if (categories.quality.level === 'high') {
    strategies.push({
      riskType: 'quality-risk',
      strategy: 'Improve overall quality metrics',
      steps: [
        'Increase test coverage to 80%+',
        'Fix failing tests',
        'Address code quality issues',
        'Run quality gate validation'
      ],
      expectedImpact: 'Reduces quality-related deployment failures',
      effort: 'high',
      priority: 'medium'
    });
  }

  if (categories.performance.level === 'high') {
    strategies.push({
      riskType: 'performance-risk',
      strategy: 'Optimize performance before deployment',
      steps: [
        'Profile application performance',
        'Optimize slow endpoints',
        'Run load testing',
        'Establish performance baselines'
      ],
      expectedImpact: 'Prevents performance degradation',
      effort: 'medium',
      priority: 'medium'
    });
  }

  return strategies;
}

// ==================== Recommendations ====================

/**
 * Make deployment recommendation
 */
function makeRecommendation(
  riskLevel: string,
  readiness: ReadinessIndicators,
  config: DeploymentConfig
): 'proceed' | 'proceed-with-caution' | 'delay' | 'block' {
  // Block for critical risk
  if (riskLevel === 'critical') {
    return 'block';
  }

  // Block for critical deployments with high risk
  if (config.criticality === 'critical' && riskLevel === 'high') {
    return 'block';
  }

  // Delay for high risk with low readiness
  if (riskLevel === 'high' && readiness.overall < 70) {
    return 'delay';
  }

  // Proceed with caution for medium-high risk
  if (riskLevel === 'high' || riskLevel === 'medium') {
    return 'proceed-with-caution';
  }

  // Proceed for low risk with good readiness
  if (riskLevel === 'low' && readiness.overall >= 80) {
    return 'proceed';
  }

  return 'proceed-with-caution';
}

// ==================== Confidence Calculation ====================

/**
 * Calculate assessment confidence
 */
function calculateConfidence(
  params: AssessDeploymentRiskParams,
  riskFactors: RiskFactor[]
): number {
  let confidence = 0.7; // Base confidence

  // Increase confidence with historical data
  if (params.historicalDeployments && params.historicalDeployments.length > 10) {
    confidence += 0.2;
  } else if (params.historicalDeployments && params.historicalDeployments.length > 5) {
    confidence += 0.1;
  }

  // Increase confidence with change data
  if (params.changes && params.changes.length > 0) {
    confidence += 0.1;
  }

  // Decrease confidence with many uncertain factors
  const uncertainRisks = riskFactors.filter((rf) => rf.probability < 0.5);
  confidence -= uncertainRisks.length * 0.05;

  return Math.max(0.3, Math.min(0.95, confidence));
}

// ==================== Utility Functions ====================

/**
 * Validate parameters
 */
function validateParameters(params: AssessDeploymentRiskParams): void {
  if (!params.projectId) throw new Error('projectId is required');
  if (!params.deploymentId) throw new Error('deploymentId is required');
  if (!params.environment) throw new Error('environment is required');
  if (!params.metrics) throw new Error('metrics are required');
  if (!params.deploymentConfig) throw new Error('deploymentConfig is required');
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `risk-assess-${Date.now()}-${seededRandom.random().toString(36).substr(2, 9)}`;
}

/**
 * Create success response
 */
function createSuccessResponse(
  data: DeploymentRiskAssessment,
  requestId: string,
  executionTime: number
): QEToolResponse<DeploymentRiskAssessment> {
  return {
    success: true,
    data,
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'deployment-risk-assessor',
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
): QEToolResponse<DeploymentRiskAssessment> {
  return {
    success: false,
    error: {
      code: 'RISK_ASSESSMENT_ERROR',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    },
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'deployment-risk-assessor',
      version: '1.0.0'
    }
  };
}
