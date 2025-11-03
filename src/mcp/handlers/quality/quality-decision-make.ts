/**
 * Quality Decision Make Handler
 *
 * Makes intelligent go/no-go deployment decisions based on quality metrics,
 * risk assessment, and policy compliance.
 *
 * @version 1.0.0
 * @author Agentic QE Team - Agent 2
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import { HookExecutor } from '../../services/HookExecutor.js';

export interface DecisionContext {
  projectId: string;
  buildId: string;
  environment: 'development' | 'staging' | 'production';
  deploymentType: 'standard' | 'hotfix' | 'rollback' | 'canary';
  requestedBy: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface DecisionInputs {
  qualityGateResult: {
    decision: 'PASS' | 'FAIL' | 'ESCALATE';
    score: number;
    threshold: number;
  };
  riskAssessment: {
    overallRisk: 'critical' | 'high' | 'medium' | 'low';
    riskScore: number;
  };
  policyCompliance: {
    compliant: boolean;
    violations: number;
    criticalViolations: number;
  };
  historicalPerformance?: {
    recentDeploymentSuccessRate: number;
    averageIncidentCount: number;
    timesSinceLastIncident: number;
  };
}

export interface QualityDecisionMakeArgs {
  context: DecisionContext;
  inputs: DecisionInputs;
  overrides?: {
    allowPolicyOverride?: boolean;
    overrideReason?: string;
    approvedBy?: string;
  };
  decisionCriteria?: {
    minQualityScore?: number;
    maxRiskLevel?: 'critical' | 'high' | 'medium' | 'low';
    requireCompliance?: boolean;
  };
}

export interface DeploymentDecision {
  decisionId: string;
  decision: 'GO' | 'NO_GO' | 'CONDITIONAL_GO' | 'ESCALATE';
  confidence: number; // 0-1
  reasoning: string;
  factors: DecisionFactor[];
  conditions?: DeploymentCondition[];
  recommendations: string[];
  approvalRequired: boolean;
  metadata: {
    decidedAt: string;
    executionTime: number;
    decisionModel: string;
    confidence: number;
  };
}

export interface DecisionFactor {
  name: string;
  category: 'quality' | 'risk' | 'compliance' | 'process' | 'historical';
  weight: number;
  value: number;
  threshold: number;
  passed: boolean;
  impact: 'blocking' | 'warning' | 'informational';
  description: string;
}

export interface DeploymentCondition {
  id: string;
  condition: string;
  required: boolean;
  verifiable: boolean;
  verificationMethod?: string;
}

export class QualityDecisionMakeHandler extends BaseHandler {
  private hookExecutor: HookExecutor;
  private decisionWeights = {
    qualityGate: 0.35,
    riskLevel: 0.30,
    policyCompliance: 0.25,
    historicalPerformance: 0.10
  };

  constructor(hookExecutor: HookExecutor) {
    super();
    this.hookExecutor = hookExecutor;
  }

  async handle(args: QualityDecisionMakeArgs): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      const startTime = Date.now();
      this.log('info', 'Making deployment decision', {
        requestId,
        projectId: args.context.projectId,
        environment: args.context.environment
      });

      // Validate required parameters
      this.validateRequired(args, ['context', 'inputs']);

      // Execute pre-task hook
      await this.hookExecutor.executePreTask({
        description: `Making deployment decision for ${args.context.projectId}`,
        agentType: 'quality-gate',
        sessionId: requestId
      });

      // Make deployment decision
      const { result: decision, executionTime } = await this.measureExecutionTime(
        async () => {
          // Evaluate decision factors
          const factors = await this.evaluateDecisionFactors(args);

          // Calculate composite decision score
          const compositeScore = this.calculateCompositeScore(factors);

          // Apply decision logic
          const preliminaryDecision = await this.applyDecisionLogic(
            factors,
            compositeScore,
            args
          );

          // Check for overrides
          const finalDecision = this.applyOverrides(preliminaryDecision, args.overrides);

          // Determine if approval is required
          const approvalRequired = this.requiresApproval(finalDecision, factors, args);

          // Generate conditions for conditional go
          const conditions = finalDecision === 'CONDITIONAL_GO'
            ? await this.generateConditions(factors, args)
            : undefined;

          // Generate reasoning
          const reasoning = this.generateReasoning(finalDecision, factors, args);

          // Generate recommendations
          const recommendations = this.generateRecommendations(finalDecision, factors, args);

          // Calculate confidence
          const confidence = this.calculateDecisionConfidence(factors, args);

          const result: DeploymentDecision = {
            decisionId: requestId,
            decision: finalDecision,
            confidence,
            reasoning,
            factors,
            conditions,
            recommendations,
            approvalRequired,
            metadata: {
              decidedAt: new Date().toISOString(),
              executionTime: Date.now() - startTime,
              decisionModel: 'intelligent-decision-v1',
              confidence
            }
          };

          return result;
        }
      );

      this.log('info', `Decision made in ${executionTime.toFixed(2)}ms`, {
        decisionId: decision.decisionId,
        decision: decision.decision,
        confidence: decision.confidence
      });

      // Store decision in memory
      await this.hookExecutor.executePostEdit({
        file: `decision-${requestId}`,
        memoryKey: `aqe/swarm/quality-mcp-tools/decisions/${requestId}`
      });

      // Execute post-task hook
      await this.hookExecutor.executePostTask({
        taskId: requestId,
        agentType: 'quality-gate',
        sessionId: requestId,
        results: {
          decisionId: decision.decisionId,
          decision: decision.decision,
          confidence: decision.confidence,
          approvalRequired: decision.approvalRequired
        }
      });

      return this.createSuccessResponse(decision, requestId);
    });
  }

  private async evaluateDecisionFactors(args: QualityDecisionMakeArgs): Promise<DecisionFactor[]> {
    const factors: DecisionFactor[] = [];

    // Quality gate factor
    factors.push({
      name: 'Quality Gate',
      category: 'quality',
      weight: this.decisionWeights.qualityGate,
      value: args.inputs.qualityGateResult.score,
      threshold: args.inputs.qualityGateResult.threshold,
      passed: args.inputs.qualityGateResult.decision === 'PASS',
      impact: args.inputs.qualityGateResult.decision === 'FAIL' ? 'blocking' : 'informational',
      description: `Quality gate ${args.inputs.qualityGateResult.decision.toLowerCase()} with score ${args.inputs.qualityGateResult.score.toFixed(1)}`
    });

    // Risk assessment factor
    const riskScore = 100 - args.inputs.riskAssessment.riskScore; // Invert for scoring
    const riskPassed = ['low', 'medium'].includes(args.inputs.riskAssessment.overallRisk);
    factors.push({
      name: 'Risk Assessment',
      category: 'risk',
      weight: this.decisionWeights.riskLevel,
      value: riskScore,
      threshold: 50,
      passed: riskPassed,
      impact: args.inputs.riskAssessment.overallRisk === 'critical' ? 'blocking' : 'warning',
      description: `Risk level: ${args.inputs.riskAssessment.overallRisk} (score: ${args.inputs.riskAssessment.riskScore})`
    });

    // Policy compliance factor
    factors.push({
      name: 'Policy Compliance',
      category: 'compliance',
      weight: this.decisionWeights.policyCompliance,
      value: args.inputs.policyCompliance.compliant ? 100 : 0,
      threshold: 100,
      passed: args.inputs.policyCompliance.compliant,
      impact: args.inputs.policyCompliance.criticalViolations > 0 ? 'blocking' : 'warning',
      description: `${args.inputs.policyCompliance.compliant ? 'Compliant' : 'Non-compliant'} with ${args.inputs.policyCompliance.violations} violation(s)`
    });

    // Historical performance factor (if available)
    if (args.inputs.historicalPerformance) {
      const historicalScore = args.inputs.historicalPerformance.recentDeploymentSuccessRate * 100;
      factors.push({
        name: 'Historical Performance',
        category: 'historical',
        weight: this.decisionWeights.historicalPerformance,
        value: historicalScore,
        threshold: 85,
        passed: historicalScore >= 85,
        impact: 'informational',
        description: `Recent deployment success rate: ${historicalScore.toFixed(1)}%`
      });
    }

    // Environment-specific factors
    if (args.context.environment === 'production') {
      factors.push({
        name: 'Production Readiness',
        category: 'process',
        weight: 0.15,
        value: this.assessProductionReadiness(args),
        threshold: 90,
        passed: this.assessProductionReadiness(args) >= 90,
        impact: 'blocking',
        description: 'Production deployment requires higher quality standards'
      });
    }

    // Urgency factor
    if (args.context.urgency === 'critical' && args.context.deploymentType === 'hotfix') {
      factors.push({
        name: 'Critical Hotfix',
        category: 'process',
        weight: 0.10,
        value: 80, // Slightly lower threshold for critical hotfixes
        threshold: 70,
        passed: true,
        impact: 'informational',
        description: 'Critical hotfix deployment with adjusted criteria'
      });
    }

    return factors;
  }

  private calculateCompositeScore(factors: DecisionFactor[]): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const factor of factors) {
      totalScore += factor.value * factor.weight;
      totalWeight += factor.weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private async applyDecisionLogic(
    factors: DecisionFactor[],
    compositeScore: number,
    args: QualityDecisionMakeArgs
  ): Promise<DeploymentDecision['decision']> {
    // Check for blocking factors
    const blockingFactors = factors.filter(f => f.impact === 'blocking' && !f.passed);
    if (blockingFactors.length > 0) {
      return 'NO_GO';
    }

    // Check decision criteria if provided
    const criteria = args.decisionCriteria;
    if (criteria) {
      if (criteria.minQualityScore && args.inputs.qualityGateResult.score < criteria.minQualityScore) {
        return 'NO_GO';
      }

      if (criteria.requireCompliance && !args.inputs.policyCompliance.compliant) {
        return 'NO_GO';
      }

      if (criteria.maxRiskLevel) {
        const riskLevels = ['low', 'medium', 'high', 'critical'];
        const currentLevel = riskLevels.indexOf(args.inputs.riskAssessment.overallRisk);
        const maxLevel = riskLevels.indexOf(criteria.maxRiskLevel);
        if (currentLevel > maxLevel) {
          return 'NO_GO';
        }
      }
    }

    // Check for escalation conditions
    if (args.inputs.qualityGateResult.decision === 'ESCALATE') {
      return 'ESCALATE';
    }

    // Check for warning factors
    const warningFactors = factors.filter(f => f.impact === 'warning' && !f.passed);
    if (warningFactors.length > 0) {
      // If composite score is still acceptable, allow conditional go
      if (compositeScore >= 75) {
        return 'CONDITIONAL_GO';
      } else {
        return 'NO_GO';
      }
    }

    // All checks passed
    if (compositeScore >= 85) {
      return 'GO';
    } else if (compositeScore >= 75) {
      return 'CONDITIONAL_GO';
    } else {
      return 'NO_GO';
    }
  }

  private applyOverrides(
    decision: DeploymentDecision['decision'],
    overrides?: QualityDecisionMakeArgs['overrides']
  ): DeploymentDecision['decision'] {
    if (!overrides || !overrides.allowPolicyOverride) {
      return decision;
    }

    // Only allow override for CONDITIONAL_GO or NO_GO with proper authorization
    if (decision === 'NO_GO' && overrides.approvedBy) {
      this.log('warn', 'Policy override applied', {
        reason: overrides.overrideReason,
        approvedBy: overrides.approvedBy
      });
      return 'CONDITIONAL_GO';
    }

    return decision;
  }

  private requiresApproval(
    decision: DeploymentDecision['decision'],
    factors: DecisionFactor[],
    args: QualityDecisionMakeArgs
  ): boolean {
    // Always require approval for escalations
    if (decision === 'ESCALATE') {
      return true;
    }

    // Require approval for conditional go in production
    if (decision === 'CONDITIONAL_GO' && args.context.environment === 'production') {
      return true;
    }

    // Require approval if there are critical violations
    if (args.inputs.policyCompliance.criticalViolations > 0) {
      return true;
    }

    // Require approval for high risk deployments
    if (args.inputs.riskAssessment.overallRisk === 'high') {
      return true;
    }

    return false;
  }

  private async generateConditions(
    factors: DecisionFactor[],
    args: QualityDecisionMakeArgs
  ): Promise<DeploymentCondition[]> {
    const conditions: DeploymentCondition[] = [];

    // Add conditions for failed warning factors
    const warningFactors = factors.filter(f => f.impact === 'warning' && !f.passed);
    for (const factor of warningFactors) {
      conditions.push({
        id: `cond-${factor.name.toLowerCase().replace(/\s+/g, '-')}`,
        condition: `Monitor ${factor.name.toLowerCase()} closely during deployment`,
        required: true,
        verifiable: true,
        verificationMethod: 'Real-time monitoring and alerting'
      });
    }

    // Add environment-specific conditions
    if (args.context.environment === 'production') {
      conditions.push({
        id: 'cond-rollback-plan',
        condition: 'Rollback plan must be prepared and tested',
        required: true,
        verifiable: true,
        verificationMethod: 'Document rollback procedure'
      });

      conditions.push({
        id: 'cond-monitoring',
        condition: 'Enhanced monitoring must be active during deployment',
        required: true,
        verifiable: true,
        verificationMethod: 'Confirm monitoring dashboards are operational'
      });
    }

    // Add risk-specific conditions
    if (args.inputs.riskAssessment.overallRisk === 'medium' || args.inputs.riskAssessment.overallRisk === 'high') {
      conditions.push({
        id: 'cond-staged-rollout',
        condition: 'Deploy using staged rollout (canary or blue-green)',
        required: true,
        verifiable: true,
        verificationMethod: 'Verify deployment strategy configuration'
      });
    }

    return conditions;
  }

  private generateReasoning(
    decision: DeploymentDecision['decision'],
    factors: DecisionFactor[],
    args: QualityDecisionMakeArgs
  ): string {
    const passedFactors = factors.filter(f => f.passed);
    const failedFactors = factors.filter(f => !f.passed);

    let reasoning = `Deployment decision: ${decision}. `;

    reasoning += `${passedFactors.length} of ${factors.length} factors passed. `;

    if (decision === 'GO') {
      reasoning += 'All quality criteria met with acceptable risk levels. Deployment approved without conditions.';
    } else if (decision === 'CONDITIONAL_GO') {
      reasoning += `Some concerns identified (${failedFactors.map(f => f.name).join(', ')}), but overall quality acceptable. `;
      reasoning += 'Deployment approved with monitoring conditions.';
    } else if (decision === 'NO_GO') {
      const blockingFactors = failedFactors.filter(f => f.impact === 'blocking');
      reasoning += `Blocking issues prevent deployment: ${blockingFactors.map(f => f.name).join(', ')}. `;
      reasoning += 'Address these issues before retrying deployment.';
    } else if (decision === 'ESCALATE') {
      reasoning += 'Complex quality state requires human judgment. Manual review and approval required.';
    }

    return reasoning;
  }

  private generateRecommendations(
    decision: DeploymentDecision['decision'],
    factors: DecisionFactor[],
    args: QualityDecisionMakeArgs
  ): string[] {
    const recommendations: string[] = [];

    if (decision === 'GO') {
      recommendations.push('Proceed with deployment');
      recommendations.push('Monitor key metrics during rollout');
    } else if (decision === 'CONDITIONAL_GO') {
      recommendations.push('Proceed with caution and enhanced monitoring');
      recommendations.push('Prepare rollback plan');
      recommendations.push('Consider staged rollout approach');
    } else if (decision === 'NO_GO') {
      const failedFactors = factors.filter(f => !f.passed);
      for (const factor of failedFactors) {
        recommendations.push(`Address ${factor.name.toLowerCase()}: ${factor.description}`);
      }
      recommendations.push('Rerun quality gates after fixes');
    } else if (decision === 'ESCALATE') {
      recommendations.push('Request manual review from deployment authority');
      recommendations.push('Provide additional context about the deployment');
      recommendations.push('Consider splitting deployment into smaller changes');
    }

    return recommendations;
  }

  private calculateDecisionConfidence(
    factors: DecisionFactor[],
    args: QualityDecisionMakeArgs
  ): number {
    let confidence = 1.0;

    // Reduce confidence if factors are close to thresholds
    for (const factor of factors) {
      const distance = Math.abs(factor.value - factor.threshold) / factor.threshold;
      if (distance < 0.1) {
        confidence -= 0.05; // Close to threshold reduces confidence
      }
    }

    // Reduce confidence if no historical data
    if (!args.inputs.historicalPerformance) {
      confidence -= 0.1;
    }

    // Reduce confidence for hotfixes
    if (args.context.deploymentType === 'hotfix') {
      confidence -= 0.05;
    }

    return Math.max(0.5, Math.min(1.0, confidence));
  }

  private assessProductionReadiness(args: QualityDecisionMakeArgs): number {
    let readiness = 100;

    // Deduct points for various issues
    if (args.inputs.qualityGateResult.decision === 'FAIL') {
      readiness -= 30;
    } else if (args.inputs.qualityGateResult.decision === 'ESCALATE') {
      readiness -= 15;
    }

    if (!args.inputs.policyCompliance.compliant) {
      readiness -= 20;
    }

    if (args.inputs.riskAssessment.overallRisk === 'high') {
      readiness -= 15;
    } else if (args.inputs.riskAssessment.overallRisk === 'critical') {
      readiness -= 40;
    }

    return Math.max(0, readiness);
  }
}
