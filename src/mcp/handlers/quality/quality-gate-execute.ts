/**
 * Quality Gate Execute Handler
 *
 * Executes quality gates with policy enforcement and decision making.
 * Integrates with QualityGateAgent for intelligent evaluation.
 *
 * @version 1.0.0
 * @author Agentic QE Team - Agent 2
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import { AgentRegistry } from '../../services/AgentRegistry.js';
import { HookExecutor } from '../../services/HookExecutor.js';

export interface QualityGatePolicy {
  name: string;
  version: string;
  thresholds: {
    coverage: number;
    testSuccess: number;
    securityVulns: number;
    performanceRegression: number;
    codeQuality: number;
  };
  rules: PolicyRule[];
  enforcement: 'strict' | 'advisory' | 'blocking';
  exceptions?: PolicyException[];
}

export interface PolicyRule {
  id: string;
  name: string;
  condition: string;
  action: 'block' | 'warn' | 'notify';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface PolicyException {
  ruleId: string;
  reason: string;
  approvedBy: string;
  expiresAt?: string;
}

export interface QualityGateExecuteArgs {
  projectId: string;
  buildId: string;
  environment: 'development' | 'staging' | 'production';
  policy?: QualityGatePolicy;
  metrics: {
    coverage: {
      line: number;
      branch: number;
      function: number;
      statement: number;
    };
    testResults: {
      total: number;
      passed: number;
      failed: number;
      skipped: number;
    };
    security: {
      vulnerabilities: number;
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    performance: {
      averageResponseTime: number;
      throughput: number;
      errorRate: number;
    };
    codeQuality: {
      complexity: number;
      maintainability: number;
      duplication: number;
    };
  };
  context?: {
    deploymentTarget?: string;
    criticality?: 'low' | 'medium' | 'high' | 'critical';
    changes?: Array<{
      file: string;
      type: 'added' | 'modified' | 'deleted';
      complexity: number;
    }>;
  };
}

export interface QualityGateExecuteResult {
  executionId: string;
  decision: 'PASS' | 'FAIL' | 'ESCALATE';
  score: number;
  threshold: number;
  policyCompliance: {
    compliant: boolean;
    violations: PolicyViolation[];
    warnings: PolicyWarning[];
  };
  evaluations: {
    coverage: EvaluationResult;
    testSuccess: EvaluationResult;
    security: EvaluationResult;
    performance: EvaluationResult;
    codeQuality: EvaluationResult;
  };
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    mitigation: string[];
  };
  recommendations: string[];
  metadata: {
    executedAt: string;
    executionTime: number;
    policyVersion: string;
    agentId: string;
  };
}

export interface PolicyViolation {
  ruleId: string;
  ruleName: string;
  severity: string;
  message: string;
  actualValue: number;
  expectedValue: number;
}

export interface PolicyWarning {
  ruleId: string;
  message: string;
  recommendation: string;
}

export interface EvaluationResult {
  passed: boolean;
  value: number;
  threshold: number;
  score: number;
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
}

export class QualityGateExecuteHandler extends BaseHandler {
  private registry: AgentRegistry;
  private hookExecutor: HookExecutor;
  private defaultPolicy: QualityGatePolicy;

  constructor(registry: AgentRegistry, hookExecutor: HookExecutor) {
    super();
    this.registry = registry;
    this.hookExecutor = hookExecutor;
    this.defaultPolicy = this.createDefaultPolicy();
  }

  async handle(args: QualityGateExecuteArgs): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      const startTime = Date.now();
      this.log('info', 'Executing quality gate', {
        requestId,
        projectId: args.projectId,
        environment: args.environment
      });

      let agentId: string | undefined;

      // Validate required parameters
      this.validateRequired(args, ['projectId', 'buildId', 'environment', 'metrics']);

      // Use provided policy or default
      const policy = args.policy || this.defaultPolicy;

      // Spawn quality-gate agent
      const spawnResult = await this.registry.spawnAgent('quality-gate', {
        name: `quality-gate-${args.buildId}`,
        description: `Quality gate evaluation for ${args.projectId} (${args.environment})`
      });
      agentId = spawnResult.id;

      this.log('info', 'Quality-gate agent spawned', { agentId });

      // Execute pre-task hook
      await this.hookExecutor.executePreTask({
        description: `Executing quality gate for ${args.projectId} in ${args.environment}`,
        agentType: 'quality-gate',
        agentId,
        sessionId: requestId
      });

      // Execute quality gate evaluation
      const { result: gateResult, executionTime } = await this.measureExecutionTime(
        async () => {
          // Validate metrics against policy
          const policyCompliance = await this.validatePolicyCompliance(args.metrics, policy);

          // Perform comprehensive evaluations
          const evaluations = await this.performEvaluations(args.metrics, policy);

          // Assess risk
          const riskAssessment = await this.assessRisk(args.metrics, args.context, policyCompliance);

          // Make final decision
          const decision = await this.makeDecision(
            evaluations,
            policyCompliance,
            riskAssessment,
            policy
          );

          // Generate recommendations
          const recommendations = await this.generateRecommendations(
            evaluations,
            policyCompliance,
            riskAssessment
          );

          // Calculate composite score
          const score = this.calculateCompositeScore(evaluations);
          const threshold = this.determineThreshold(policy, args.context);

          const result: QualityGateExecuteResult = {
            executionId: requestId,
            decision,
            score,
            threshold,
            policyCompliance,
            evaluations,
            riskAssessment,
            recommendations,
            metadata: {
              executedAt: new Date().toISOString(),
              executionTime: Date.now() - startTime,
              policyVersion: policy.version,
              agentId: agentId || 'unknown'
            }
          };

          return result;
        }
      );

      this.log('info', `Quality gate executed in ${executionTime.toFixed(2)}ms`, {
        executionId: gateResult.executionId,
        decision: gateResult.decision,
        score: gateResult.score
      });

      // Store result in memory for swarm coordination
      await this.hookExecutor.executePostEdit({
        file: `quality-gate-${args.buildId}`,
        memoryKey: `aqe/swarm/quality-mcp-tools/executions/${args.buildId}`
      });

      // Execute post-task hook with results
      await this.hookExecutor.executePostTask({
        taskId: agentId,
        agentType: 'quality-gate',
        agentId,
        sessionId: requestId,
        results: {
          executionId: gateResult.executionId,
          decision: gateResult.decision,
          score: gateResult.score,
          compliant: gateResult.policyCompliance.compliant
        }
      });

      return this.createSuccessResponse(gateResult, requestId);
    });
  }

  private createDefaultPolicy(): QualityGatePolicy {
    return {
      name: 'default-quality-policy',
      version: '1.0.0',
      thresholds: {
        coverage: 0.80,
        testSuccess: 0.95,
        securityVulns: 0,
        performanceRegression: 0.10,
        codeQuality: 0.75
      },
      rules: [
        {
          id: 'rule-critical-coverage',
          name: 'Critical Coverage Requirement',
          condition: 'coverage.line >= 80',
          action: 'block',
          severity: 'critical',
          description: 'Line coverage must be at least 80%'
        },
        {
          id: 'rule-test-success',
          name: 'Test Success Rate',
          condition: 'testSuccess >= 95',
          action: 'block',
          severity: 'high',
          description: 'Test success rate must be at least 95%'
        },
        {
          id: 'rule-no-critical-vulns',
          name: 'No Critical Vulnerabilities',
          condition: 'security.critical === 0',
          action: 'block',
          severity: 'critical',
          description: 'No critical security vulnerabilities allowed'
        },
        {
          id: 'rule-performance-regression',
          name: 'Performance Regression Check',
          condition: 'performanceRegression <= 10',
          action: 'warn',
          severity: 'medium',
          description: 'Performance regression should not exceed 10%'
        }
      ],
      enforcement: 'strict'
    };
  }

  private async validatePolicyCompliance(
    metrics: QualityGateExecuteArgs['metrics'],
    policy: QualityGatePolicy
  ): Promise<QualityGateExecuteResult['policyCompliance']> {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyWarning[] = [];

    for (const rule of policy.rules) {
      const evaluation = await this.evaluateRule(rule, metrics, policy);

      if (!evaluation.passed) {
        if (rule.action === 'block') {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            message: rule.description,
            actualValue: evaluation.actualValue,
            expectedValue: evaluation.expectedValue
          });
        } else if (rule.action === 'warn') {
          warnings.push({
            ruleId: rule.id,
            message: rule.description,
            recommendation: `Consider improving ${rule.name.toLowerCase()}`
          });
        }
      }
    }

    return {
      compliant: violations.length === 0,
      violations,
      warnings
    };
  }

  private async evaluateRule(
    rule: PolicyRule,
    metrics: QualityGateExecuteArgs['metrics'],
    policy: QualityGatePolicy
  ): Promise<{ passed: boolean; actualValue: number; expectedValue: number }> {
    // Simple rule evaluation based on rule condition
    const ruleMap: Record<string, { passed: boolean; actualValue: number; expectedValue: number }> = {
      'rule-critical-coverage': {
        passed: metrics.coverage.line >= policy.thresholds.coverage * 100,
        actualValue: metrics.coverage.line,
        expectedValue: policy.thresholds.coverage * 100
      },
      'rule-test-success': {
        passed: (metrics.testResults.passed / metrics.testResults.total) >= policy.thresholds.testSuccess,
        actualValue: (metrics.testResults.passed / metrics.testResults.total) * 100,
        expectedValue: policy.thresholds.testSuccess * 100
      },
      'rule-no-critical-vulns': {
        passed: metrics.security.critical === 0,
        actualValue: metrics.security.critical,
        expectedValue: 0
      },
      'rule-performance-regression': {
        passed: metrics.performance.errorRate <= policy.thresholds.performanceRegression,
        actualValue: metrics.performance.errorRate * 100,
        expectedValue: policy.thresholds.performanceRegression * 100
      }
    };

    return ruleMap[rule.id] || { passed: true, actualValue: 0, expectedValue: 0 };
  }

  private async performEvaluations(
    metrics: QualityGateExecuteArgs['metrics'],
    policy: QualityGatePolicy
  ): Promise<QualityGateExecuteResult['evaluations']> {
    return {
      coverage: this.evaluateCoverage(metrics.coverage, policy.thresholds.coverage),
      testSuccess: this.evaluateTestSuccess(metrics.testResults, policy.thresholds.testSuccess),
      security: this.evaluateSecurity(metrics.security, policy.thresholds.securityVulns),
      performance: this.evaluatePerformance(metrics.performance, policy.thresholds.performanceRegression),
      codeQuality: this.evaluateCodeQuality(metrics.codeQuality, policy.thresholds.codeQuality)
    };
  }

  private evaluateCoverage(coverage: any, threshold: number): EvaluationResult {
    const avgCoverage = (coverage.line + coverage.branch + coverage.function + coverage.statement) / 4 / 100;
    const passed = avgCoverage >= threshold;
    const score = Math.min(1, avgCoverage / threshold);

    return {
      passed,
      value: avgCoverage * 100,
      threshold: threshold * 100,
      score,
      status: this.determineStatus(score)
    };
  }

  private evaluateTestSuccess(testResults: any, threshold: number): EvaluationResult {
    const successRate = testResults.passed / testResults.total;
    const passed = successRate >= threshold;
    const score = Math.min(1, successRate / threshold);

    return {
      passed,
      value: successRate * 100,
      threshold: threshold * 100,
      score,
      status: this.determineStatus(score)
    };
  }

  private evaluateSecurity(security: any, threshold: number): EvaluationResult {
    const criticalScore = security.critical === 0 ? 1.0 : 0.0;
    const highScore = security.high <= 2 ? 0.8 : 0.5;
    const score = (criticalScore + highScore) / 2;
    const passed = security.critical === 0 && security.high <= threshold;

    return {
      passed,
      value: security.vulnerabilities,
      threshold,
      score,
      status: this.determineStatus(score)
    };
  }

  private evaluatePerformance(performance: any, threshold: number): EvaluationResult {
    const passed = performance.errorRate <= threshold;
    const score = passed ? 1.0 - performance.errorRate : 0.5;

    return {
      passed,
      value: performance.errorRate * 100,
      threshold: threshold * 100,
      score,
      status: this.determineStatus(score)
    };
  }

  private evaluateCodeQuality(codeQuality: any, threshold: number): EvaluationResult {
    const qualityScore = (100 - codeQuality.complexity + codeQuality.maintainability + (100 - codeQuality.duplication)) / 300;
    const passed = qualityScore >= threshold;
    const score = Math.min(1, qualityScore / threshold);

    return {
      passed,
      value: qualityScore * 100,
      threshold: threshold * 100,
      score,
      status: this.determineStatus(score)
    };
  }

  private determineStatus(score: number): EvaluationResult['status'] {
    if (score >= 0.95) return 'excellent';
    if (score >= 0.85) return 'good';
    if (score >= 0.70) return 'fair';
    if (score >= 0.50) return 'poor';
    return 'critical';
  }

  private async assessRisk(
    metrics: QualityGateExecuteArgs['metrics'],
    context: QualityGateExecuteArgs['context'],
    policyCompliance: QualityGateExecuteResult['policyCompliance']
  ): Promise<QualityGateExecuteResult['riskAssessment']> {
    const factors: string[] = [];
    let riskScore = 0;

    // Check for critical violations
    if (policyCompliance.violations.some(v => v.severity === 'critical')) {
      factors.push('Critical policy violations detected');
      riskScore += 40;
    }

    // Check security vulnerabilities
    if (metrics.security.critical > 0) {
      factors.push(`${metrics.security.critical} critical security vulnerabilities`);
      riskScore += 30;
    }

    // Check test failure rate
    const failureRate = metrics.testResults.failed / metrics.testResults.total;
    if (failureRate > 0.05) {
      factors.push(`High test failure rate: ${(failureRate * 100).toFixed(1)}%`);
      riskScore += 20;
    }

    // Check deployment target
    if (context?.deploymentTarget === 'production' && context?.criticality === 'critical') {
      factors.push('Critical production deployment');
      riskScore += 10;
    }

    const level = riskScore >= 50 ? 'critical' :
                  riskScore >= 30 ? 'high' :
                  riskScore >= 15 ? 'medium' : 'low';

    return {
      level,
      factors,
      mitigation: this.generateMitigationStrategies(factors, level)
    };
  }

  private generateMitigationStrategies(factors: string[], level: string): string[] {
    const strategies: string[] = [];

    if (level === 'critical' || level === 'high') {
      strategies.push('Block deployment until critical issues are resolved');
      strategies.push('Conduct thorough manual review');
      strategies.push('Implement rollback plan');
    }

    if (factors.some(f => f.includes('security'))) {
      strategies.push('Address security vulnerabilities immediately');
      strategies.push('Run additional security scans');
    }

    if (factors.some(f => f.includes('test failure'))) {
      strategies.push('Fix failing tests before proceeding');
      strategies.push('Investigate root cause of test failures');
    }

    return strategies;
  }

  private async makeDecision(
    evaluations: QualityGateExecuteResult['evaluations'],
    policyCompliance: QualityGateExecuteResult['policyCompliance'],
    riskAssessment: QualityGateExecuteResult['riskAssessment'],
    policy: QualityGatePolicy
  ): Promise<'PASS' | 'FAIL' | 'ESCALATE'> {
    // Critical failures always block
    if (!policyCompliance.compliant && policy.enforcement === 'blocking') {
      return 'FAIL';
    }

    // High/critical risk requires escalation or blocking
    if (riskAssessment.level === 'critical') {
      return 'FAIL';
    }

    if (riskAssessment.level === 'high') {
      return 'ESCALATE';
    }

    // Check if all critical evaluations passed
    const criticalEvaluations = [evaluations.coverage, evaluations.testSuccess, evaluations.security];
    const allCriticalPassed = criticalEvaluations.every(e => e.passed);

    if (!allCriticalPassed) {
      return policy.enforcement === 'strict' ? 'FAIL' : 'ESCALATE';
    }

    return 'PASS';
  }

  private async generateRecommendations(
    evaluations: QualityGateExecuteResult['evaluations'],
    policyCompliance: QualityGateExecuteResult['policyCompliance'],
    riskAssessment: QualityGateExecuteResult['riskAssessment']
  ): Promise<string[]> {
    const recommendations: string[] = [];

    if (!evaluations.coverage.passed) {
      recommendations.push('Increase test coverage to meet minimum threshold');
    }

    if (!evaluations.testSuccess.passed) {
      recommendations.push('Fix failing tests to improve success rate');
    }

    if (!evaluations.security.passed) {
      recommendations.push('Address security vulnerabilities before deployment');
    }

    if (!evaluations.performance.passed) {
      recommendations.push('Optimize performance to reduce error rate');
    }

    if (!evaluations.codeQuality.passed) {
      recommendations.push('Improve code quality through refactoring');
    }

    // Add risk-specific recommendations
    recommendations.push(...riskAssessment.mitigation);

    return recommendations;
  }

  private calculateCompositeScore(evaluations: QualityGateExecuteResult['evaluations']): number {
    const weights = {
      coverage: 0.25,
      testSuccess: 0.30,
      security: 0.25,
      performance: 0.10,
      codeQuality: 0.10
    };

    const weightedScore =
      evaluations.coverage.score * weights.coverage +
      evaluations.testSuccess.score * weights.testSuccess +
      evaluations.security.score * weights.security +
      evaluations.performance.score * weights.performance +
      evaluations.codeQuality.score * weights.codeQuality;

    return Math.round(weightedScore * 100 * 100) / 100; // Round to 2 decimal places
  }

  private determineThreshold(policy: QualityGatePolicy, context?: QualityGateExecuteArgs['context']): number {
    let baseThreshold = 80; // Default 80%

    // Adjust based on environment and criticality
    if (context?.deploymentTarget === 'production') {
      baseThreshold += 5;
    }

    if (context?.criticality === 'critical') {
      baseThreshold += 5;
    }

    return Math.min(95, baseThreshold);
  }
}
