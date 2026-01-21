/**
 * Agentic QE v3 - Deployment Advisor Service
 * ML-based deployment readiness and risk scoring
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  DeploymentRequest,
  DeploymentAdvice,
  QualityMetrics,
} from '../interfaces';

/**
 * Interface for the deployment advisor service
 */
export interface IDeploymentAdvisorService {
  getDeploymentAdvice(request: DeploymentRequest): Promise<Result<DeploymentAdvice, Error>>;
  recordDeploymentOutcome(adviceId: string, successful: boolean): Promise<void>;
  getHistoricalAccuracy(): Promise<Result<DeploymentAccuracy, Error>>;
}

/**
 * Deployment accuracy metrics
 */
export interface DeploymentAccuracy {
  totalPredictions: number;
  correctPredictions: number;
  accuracyRate: number;
  falsePositives: number;
  falseNegatives: number;
}

/**
 * Configuration for deployment advisor
 */
export interface DeploymentAdvisorConfig {
  riskWeights: RiskWeights;
  decisionThresholds: DecisionThresholds;
  enableMLPrediction: boolean;
  learningRate: number;
}

interface RiskWeights {
  coverage: number;
  testsPassing: number;
  criticalBugs: number;
  codeSmells: number;
  securityVulnerabilities: number;
  technicalDebt: number;
  duplications: number;
}

interface DecisionThresholds {
  approved: number;
  warning: number;
  blocked: number;
}

const DEFAULT_CONFIG: DeploymentAdvisorConfig = {
  riskWeights: {
    coverage: 0.15,
    testsPassing: 0.20,
    criticalBugs: 0.25,
    codeSmells: 0.05,
    securityVulnerabilities: 0.25,
    technicalDebt: 0.05,
    duplications: 0.05,
  },
  decisionThresholds: {
    approved: 0.3,  // Risk score below this = approved
    warning: 0.6,   // Risk score between approved and this = warning
    blocked: 0.6,   // Risk score above this = blocked
  },
  enableMLPrediction: true,
  learningRate: 0.1,
};

/**
 * Historical deployment record for ML training
 */
interface DeploymentRecord {
  id: string;
  metrics: QualityMetrics;
  riskScore: number;
  decision: DeploymentAdvice['decision'];
  outcome?: boolean; // true = successful deployment
  createdAt: string;
}

/**
 * Deployment Advisor Service Implementation
 * Uses ML-based risk scoring to provide deployment recommendations
 */
export class DeploymentAdvisorService implements IDeploymentAdvisorService {
  private config: DeploymentAdvisorConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<DeploymentAdvisorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get deployment advice based on quality metrics and risk analysis
   */
  async getDeploymentAdvice(
    request: DeploymentRequest
  ): Promise<Result<DeploymentAdvice, Error>> {
    try {
      const { releaseCandidate, metrics, riskTolerance } = request;

      // Calculate base risk score
      const baseRiskScore = this.calculateBaseRiskScore(metrics);

      // Apply ML-based adjustment if enabled
      const adjustedRiskScore = this.config.enableMLPrediction
        ? await this.applyMLAdjustment(baseRiskScore, metrics)
        : baseRiskScore;

      // Adjust thresholds based on risk tolerance
      const adjustedThresholds = this.adjustThresholdsForTolerance(riskTolerance);

      // Determine decision
      const decision = this.determineDecision(adjustedRiskScore, adjustedThresholds);

      // Generate reasons
      const reasons = this.generateReasons(metrics, adjustedRiskScore);

      // Generate conditions for conditional approval
      const conditions = decision === 'warning'
        ? this.generateConditions(metrics)
        : undefined;

      // Generate rollback plan for non-blocked deployments
      const rollbackPlan = decision !== 'blocked'
        ? this.generateRollbackPlan(releaseCandidate)
        : undefined;

      // Calculate confidence based on historical accuracy
      const confidence = await this.calculateConfidence(metrics);

      const advice: DeploymentAdvice = {
        decision,
        confidence,
        riskScore: adjustedRiskScore,
        reasons,
        conditions,
        rollbackPlan,
      };

      // Store prediction for learning
      await this.storePrediction(releaseCandidate, metrics, advice);

      return ok(advice);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Record the outcome of a deployment for ML training
   */
  async recordDeploymentOutcome(
    adviceId: string,
    successful: boolean
  ): Promise<void> {
    const key = `deployment-advice:prediction:${adviceId}`;
    const record = await this.memory.get<DeploymentRecord>(key);

    if (record) {
      record.outcome = successful;

      // Update in memory
      await this.memory.set(key, record, {
        namespace: 'quality-assessment',
        persist: true,
      });

      // Update weights based on outcome
      if (this.config.enableMLPrediction) {
        await this.updateWeightsFromOutcome(record, successful);
      }
    }
  }

  /**
   * Get historical prediction accuracy
   */
  async getHistoricalAccuracy(): Promise<Result<DeploymentAccuracy, Error>> {
    try {
      const keys = await this.memory.search('deployment-advice:prediction:*', 1000);

      let totalPredictions = 0;
      let correctPredictions = 0;
      let falsePositives = 0; // Approved but failed
      let falseNegatives = 0; // Blocked but would have succeeded

      for (const key of keys) {
        const record = await this.memory.get<DeploymentRecord>(key);

        if (record && record.outcome !== undefined) {
          totalPredictions++;

          const predictedSuccess = record.decision !== 'blocked';
          const actualSuccess = record.outcome;

          if (predictedSuccess === actualSuccess) {
            correctPredictions++;
          } else if (predictedSuccess && !actualSuccess) {
            falsePositives++;
          } else if (!predictedSuccess && actualSuccess) {
            falseNegatives++;
          }
        }
      }

      const accuracyRate = totalPredictions > 0
        ? correctPredictions / totalPredictions
        : 0;

      return ok({
        totalPredictions,
        correctPredictions,
        accuracyRate: Math.round(accuracyRate * 100) / 100,
        falsePositives,
        falseNegatives,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private calculateBaseRiskScore(metrics: QualityMetrics): number {
    const weights = this.config.riskWeights;
    let riskScore = 0;

    // Coverage risk (lower coverage = higher risk)
    const coverageRisk = Math.max(0, 1 - metrics.coverage / 100);
    riskScore += coverageRisk * weights.coverage;

    // Tests passing risk (lower pass rate = higher risk)
    const testsRisk = Math.max(0, 1 - metrics.testsPassing / 100);
    riskScore += testsRisk * weights.testsPassing;

    // Critical bugs risk (more bugs = higher risk)
    const bugRisk = Math.min(1, metrics.criticalBugs / 5);
    riskScore += bugRisk * weights.criticalBugs;

    // Code smells risk
    const smellRisk = Math.min(1, metrics.codeSmells / 100);
    riskScore += smellRisk * weights.codeSmells;

    // Security vulnerabilities risk (exponential penalty)
    const securityRisk = Math.min(1, metrics.securityVulnerabilities / 3);
    riskScore += securityRisk * weights.securityVulnerabilities;

    // Technical debt risk
    const debtRisk = Math.min(1, metrics.technicalDebt / 20);
    riskScore += debtRisk * weights.technicalDebt;

    // Duplications risk
    const dupRisk = Math.min(1, metrics.duplications / 20);
    riskScore += dupRisk * weights.duplications;

    return Math.round(riskScore * 100) / 100;
  }

  private async applyMLAdjustment(
    baseScore: number,
    metrics: QualityMetrics
  ): Promise<number> {
    // Load historical patterns
    const similarDeployments = await this.findSimilarDeployments(metrics);

    if (similarDeployments.length < 5) {
      // Not enough data for ML adjustment
      return baseScore;
    }

    // Calculate adjustment based on historical outcomes
    let adjustment = 0;
    let weightsSum = 0;

    for (const deployment of similarDeployments) {
      if (deployment.outcome !== undefined) {
        const similarity = this.calculateSimilarity(metrics, deployment.metrics);
        const outcomeValue = deployment.outcome ? -0.1 : 0.1; // Success reduces risk

        adjustment += outcomeValue * similarity;
        weightsSum += similarity;
      }
    }

    if (weightsSum > 0) {
      adjustment /= weightsSum;
    }

    // Clamp to reasonable bounds
    return Math.max(0, Math.min(1, baseScore + adjustment * this.config.learningRate));
  }

  private adjustThresholdsForTolerance(
    tolerance: DeploymentRequest['riskTolerance']
  ): DecisionThresholds {
    const base = this.config.decisionThresholds;

    switch (tolerance) {
      case 'low':
        // More conservative - block earlier
        return {
          approved: base.approved * 0.7,
          warning: base.warning * 0.8,
          blocked: base.blocked * 0.8,
        };
      case 'high':
        // More lenient - allow more risk
        return {
          approved: base.approved * 1.3,
          warning: base.warning * 1.2,
          blocked: base.blocked * 1.2,
        };
      default:
        return base;
    }
  }

  private determineDecision(
    riskScore: number,
    thresholds: DecisionThresholds
  ): DeploymentAdvice['decision'] {
    if (riskScore <= thresholds.approved) {
      return 'approved';
    } else if (riskScore <= thresholds.warning) {
      return 'warning';
    } else {
      return 'blocked';
    }
  }

  private generateReasons(metrics: QualityMetrics, riskScore: number): string[] {
    const reasons: string[] = [];

    // Always include overall risk
    reasons.push(
      `Overall deployment risk score: ${Math.round(riskScore * 100)}%`
    );

    // Add specific concerns
    if (metrics.coverage < 70) {
      reasons.push(`Low test coverage (${metrics.coverage}%) increases deployment risk`);
    }

    if (metrics.testsPassing < 100) {
      reasons.push(`${100 - metrics.testsPassing}% of tests are failing`);
    }

    if (metrics.criticalBugs > 0) {
      reasons.push(`${metrics.criticalBugs} critical bug(s) detected`);
    }

    if (metrics.securityVulnerabilities > 0) {
      reasons.push(
        `${metrics.securityVulnerabilities} security vulnerability(ies) found`
      );
    }

    if (metrics.technicalDebt > 10) {
      reasons.push(`High technical debt (${metrics.technicalDebt}h estimated)`);
    }

    if (metrics.duplications > 10) {
      reasons.push(`${metrics.duplications}% code duplication detected`);
    }

    // Add positive reasons if applicable
    if (metrics.coverage >= 80 && metrics.testsPassing === 100) {
      reasons.push('Good test coverage and all tests passing');
    }

    if (metrics.securityVulnerabilities === 0) {
      reasons.push('No security vulnerabilities detected');
    }

    return reasons;
  }

  private generateConditions(metrics: QualityMetrics): string[] {
    const conditions: string[] = [];

    if (metrics.testsPassing < 100) {
      conditions.push('Ensure all failing tests are addressed before deployment');
    }

    if (metrics.criticalBugs > 0) {
      conditions.push('Critical bugs must be fixed or have documented workarounds');
    }

    if (metrics.securityVulnerabilities > 0) {
      conditions.push('Security vulnerabilities must be reviewed and accepted by security team');
    }

    conditions.push('Deployment should be during low-traffic period');
    conditions.push('On-call team must be available for 2 hours post-deployment');

    return conditions;
  }

  private generateRollbackPlan(releaseCandidate: string): string {
    return `Rollback procedure for ${releaseCandidate}:
1. Monitor deployment health dashboards for 15 minutes
2. If issues detected, trigger rollback using: \`deploy rollback ${releaseCandidate}\`
3. Verify rollback completion and service health
4. Notify stakeholders of rollback
5. Create incident ticket for post-mortem`;
  }

  private async calculateConfidence(metrics: QualityMetrics): Promise<number> {
    // Base confidence from data quality
    let confidence = 0.7;

    // Increase confidence if we have historical data
    const similarDeployments = await this.findSimilarDeployments(metrics);
    if (similarDeployments.length >= 10) {
      confidence += 0.15;
    } else if (similarDeployments.length >= 5) {
      confidence += 0.1;
    }

    // Increase confidence if all metrics are present
    const metricCount = Object.values(metrics).filter((v) => v !== undefined).length;
    confidence += Math.min(0.1, metricCount / 70);

    // Get historical accuracy
    const accuracy = await this.getHistoricalAccuracy();
    if (accuracy.success && accuracy.value.totalPredictions > 20) {
      // Weight by historical accuracy
      confidence = confidence * 0.6 + accuracy.value.accuracyRate * 0.4;
    }

    return Math.round(Math.min(0.95, confidence) * 100) / 100;
  }

  private async findSimilarDeployments(
    metrics: QualityMetrics
  ): Promise<DeploymentRecord[]> {
    const keys = await this.memory.search('deployment-advice:prediction:*', 100);
    const similar: DeploymentRecord[] = [];

    for (const key of keys) {
      const record = await this.memory.get<DeploymentRecord>(key);
      if (record) {
        const similarity = this.calculateSimilarity(metrics, record.metrics);
        if (similarity > 0.7) {
          similar.push(record);
        }
      }
    }

    return similar;
  }

  private calculateSimilarity(a: QualityMetrics, b: QualityMetrics): number {
    // Euclidean distance-based similarity
    const weights = this.config.riskWeights;
    let sumSquaredDiff = 0;
    let totalWeight = 0;

    // Coverage
    sumSquaredDiff += Math.pow((a.coverage - b.coverage) / 100, 2) * weights.coverage;
    totalWeight += weights.coverage;

    // Tests passing
    sumSquaredDiff += Math.pow((a.testsPassing - b.testsPassing) / 100, 2) * weights.testsPassing;
    totalWeight += weights.testsPassing;

    // Critical bugs (normalize to 0-1)
    sumSquaredDiff += Math.pow((a.criticalBugs - b.criticalBugs) / 10, 2) * weights.criticalBugs;
    totalWeight += weights.criticalBugs;

    // Security vulns
    sumSquaredDiff += Math.pow((a.securityVulnerabilities - b.securityVulnerabilities) / 5, 2) * weights.securityVulnerabilities;
    totalWeight += weights.securityVulnerabilities;

    // Distance to similarity (1 - normalized distance)
    const normalizedDistance = Math.sqrt(sumSquaredDiff / totalWeight);
    return Math.max(0, 1 - normalizedDistance);
  }

  private async storePrediction(
    releaseCandidate: string,
    metrics: QualityMetrics,
    advice: DeploymentAdvice
  ): Promise<void> {
    const id = uuidv4();
    const record: DeploymentRecord = {
      id,
      metrics,
      riskScore: advice.riskScore,
      decision: advice.decision,
      createdAt: new Date().toISOString(),
    };

    await this.memory.set(
      `deployment-advice:prediction:${id}`,
      record,
      { namespace: 'quality-assessment', persist: true }
    );

    // Also store by release candidate for lookup
    await this.memory.set(
      `deployment-advice:release:${releaseCandidate}`,
      { adviceId: id, ...advice },
      { namespace: 'quality-assessment', ttl: 86400 * 30 }
    );
  }

  private async updateWeightsFromOutcome(
    record: DeploymentRecord,
    successful: boolean
  ): Promise<void> {
    // Simple gradient-based weight update
    const metrics = record.metrics;
    const expectedSuccess = record.decision !== 'blocked';
    const error = expectedSuccess !== successful ? 1 : 0;

    if (error === 0) return; // No update needed

    const learningRate = this.config.learningRate;
    const direction = successful ? -1 : 1; // If successful but blocked, decrease weights

    // Update weights based on which metrics contributed most to the error
    const newWeights = { ...this.config.riskWeights };

    // Coverage impact
    if (metrics.coverage < 80) {
      newWeights.coverage += direction * learningRate * 0.1;
    }

    // Tests impact
    if (metrics.testsPassing < 100) {
      newWeights.testsPassing += direction * learningRate * 0.1;
    }

    // Security impact (high weight for security issues)
    if (metrics.securityVulnerabilities > 0) {
      newWeights.securityVulnerabilities += direction * learningRate * 0.15;
    }

    // Normalize weights
    const totalWeight = Object.values(newWeights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(newWeights) as (keyof RiskWeights)[]) {
      newWeights[key] = Math.max(0.01, newWeights[key] / totalWeight);
    }

    // Store updated weights
    this.config.riskWeights = newWeights;

    await this.memory.set(
      'deployment-advice:ml:weights',
      newWeights,
      { namespace: 'quality-assessment', persist: true }
    );
  }
}
