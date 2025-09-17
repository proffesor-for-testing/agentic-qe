/**
 * Deployment Guardian Agent
 * Ensures safe deployments through progressive validation
 */

import { QEAgent, AgentContext, AgentExecutionResult } from '../base/QEAgent';
import { QEAgentConfig } from '../../types';
import { QEMemory } from '../../memory/QEMemory';
import { HookManager } from '../../hooks';
import { Logger } from '../../utils/Logger';

/**
 * Deployment strategy types
 */
export type DeploymentStrategy = 'blue_green' | 'canary' | 'rolling' | 'feature_flags';

/**
 * Smoke test configuration
 */
export interface SmokeTest {
  id: string;
  name: string;
  description: string;
  endpoint?: string;
  method?: string;
  expectedStatus?: number;
  expectedResponse?: any;
  timeout: number;
  critical: boolean;
  dependencies: string[];
}

/**
 * Critical path definition
 */
export interface CriticalPath {
  id: string;
  name: string;
  description: string;
  steps: {
    action: string;
    endpoint: string;
    method: string;
    payload?: any;
    expectedOutcome: string;
  }[];
  businessImpact: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Canary analysis configuration
 */
export interface CanaryConfig {
  trafficPercentage: number;
  duration: number; // minutes
  metrics: string[];
  thresholds: Record<string, { min?: number; max?: number; }>;
  statisticalSignificance: number; // 0-1 scale
  minSampleSize: number;
}

/**
 * Deployment metrics comparison
 */
export interface MetricsComparison {
  metric: string;
  baseline: {
    value: number;
    sampleSize: number;
    variance: number;
  };
  canary: {
    value: number;
    sampleSize: number;
    variance: number;
  };
  analysis: {
    difference: number;
    percentageChange: number;
    pValue: number;
    significant: boolean;
    recommendation: 'proceed' | 'caution' | 'rollback';
  };
}

/**
 * Rollback criteria
 */
export interface RollbackCriteria {
  errorRateThreshold: number;
  responseTimeThreshold: number; // ms
  successRateThreshold: number;
  customMetrics: Record<string, { threshold: number; operator: '>' | '<' | '='; }>;
  timeWindow: number; // minutes
  consecutiveFailures: number;
}

/**
 * Deployment validation result
 */
export interface DeploymentValidation {
  id: string;
  timestamp: Date;
  strategy: DeploymentStrategy;
  phase: 'smoke' | 'canary' | 'full';
  success: boolean;
  smokeTestResults: {
    testId: string;
    success: boolean;
    duration: number;
    error?: string;
    response?: any;
  }[];
  canaryAnalysis?: {
    metricsComparison: MetricsComparison[];
    recommendation: 'proceed' | 'caution' | 'rollback';
    confidence: number;
  };
  recommendation: {
    action: 'proceed' | 'rollback' | 'pause' | 'investigate';
    reasoning: string;
    confidence: number;
    nextSteps: string[];
  };
  metrics: Record<string, number>;
}

/**
 * Deployment change information
 */
export interface DeploymentChange {
  id: string;
  type: 'feature' | 'bugfix' | 'performance' | 'security' | 'configuration';
  component: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  affectedAreas: string[];
  dependencies: string[];
  rollbackPlan: string;
}

/**
 * Deployment Guardian Agent
 * Provides safety validation for deployments
 */
export class DeploymentGuardian extends QEAgent {
  private activeDeployments: Map<string, DeploymentValidation> = new Map();
  private deploymentHistory: DeploymentValidation[] = [];
  private smokeTests: Map<string, SmokeTest> = new Map();
  private criticalPaths: Map<string, CriticalPath> = new Map();

  constructor(
    config: QEAgentConfig,
    memory: QEMemory,
    hooks: HookManager,
    logger?: Logger
  ) {
    super(config, memory, hooks, logger);
  }

  protected async doExecute(context: AgentContext): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const artifacts: string[] = [];
    const metrics: Record<string, number> = {};

    try {
      this.logger.info('Starting deployment validation', { context });

      // Store execution context in memory
      await this.storeMemory('execution_context', context, ['deployment', 'validation']);

      // Perform default deployment validation
      const changes = [this.createDefaultChange()];
      const criticalPaths = [this.createDefaultCriticalPath()];

      const smokeTests = await this.generateSmokeTests(changes, criticalPaths);
      artifacts.push(`smoke-tests:${smokeTests.length}`);

      // Execute smoke tests
      const validation = await this.executeDeploymentValidation('canary', smokeTests);
      artifacts.push(`validation:${validation.id}`);
      metrics.smoke_tests_executed = smokeTests.length;
      metrics.validation_success = validation.success ? 1 : 0;

      return {
        success: true,
        status: validation.success ? 'passed' : 'failed',
        message: `Deployment validation ${validation.success ? 'passed' : 'failed'}. Recommendation: ${validation.recommendation.action}`,
        artifacts,
        metrics,
        duration: Date.now() - startTime,
        metadata: {
          validationId: validation.id,
          recommendation: validation.recommendation.action,
          smokeTestCount: smokeTests.length
        }
      };

    } catch (error) {
      this.logger.error('Failed to execute deployment validation', { error });

      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
        artifacts,
        metrics,
        duration: Date.now() - startTime,
        metadata: { error: true }
      };
    }
  }

  /**
   * Generate smoke tests for deployment
   */
  public async generateSmokeTests(
    changes: DeploymentChange[],
    criticalPaths: CriticalPath[]
  ): Promise<SmokeTest[]> {
    const smokeTests: SmokeTest[] = [];

    // Generate tests for each critical path
    for (const path of criticalPaths) {
      const pathTests = this.generateCriticalPathTests(path);
      smokeTests.push(...pathTests);
    }

    // Generate tests for changed components
    for (const change of changes) {
      const changeTests = this.generateChangeSpecificTests(change);
      smokeTests.push(...changeTests);
    }

    // Add standard health checks
    smokeTests.push(...this.generateStandardHealthChecks());

    // Store smoke tests
    for (const test of smokeTests) {
      this.smokeTests.set(test.id, test);
      await this.storeMemory(`smoke-test:${test.id}`, test, ['deployment', 'smoke-test']);
    }

    this.logger.info('Generated smoke tests', {
      count: smokeTests.length,
      criticalCount: smokeTests.filter(t => t.critical).length
    });

    return smokeTests;
  }

  /**
   * Analyze canary deployment metrics
   */
  public async analyzeCanary(
    baselineMetrics: Record<string, number>,
    canaryMetrics: Record<string, number>,
    confidenceLevel: number = 0.95
  ): Promise<MetricsComparison[]> {
    const comparisons: MetricsComparison[] = [];

    const commonMetrics = Object.keys(baselineMetrics).filter(key =>
      key in canaryMetrics
    );

    for (const metric of commonMetrics) {
      const comparison = await this.compareMetric(
        metric,
        baselineMetrics[metric],
        canaryMetrics[metric],
        confidenceLevel
      );
      comparisons.push(comparison);
    }

    this.logger.info('Canary analysis completed', {
      metricsAnalyzed: comparisons.length,
      significantChanges: comparisons.filter(c => c.analysis.significant).length,
      rollbackRecommendations: comparisons.filter(c => c.analysis.recommendation === 'rollback').length
    });

    return comparisons;
  }

  /**
   * Make rollback decision based on metrics
   */
  public async rollbackDecision(
    metrics: Record<string, number>,
    thresholds: RollbackCriteria
  ): Promise<{
    shouldRollback: boolean;
    triggeredCriteria: string[];
    reasoning: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
  }> {
    const triggeredCriteria: string[] = [];

    // Check error rate
    if (metrics.errorRate > thresholds.errorRateThreshold) {
      triggeredCriteria.push(`Error rate (${metrics.errorRate}) exceeds threshold (${thresholds.errorRateThreshold})`);
    }

    // Check response time
    if (metrics.responseTime > thresholds.responseTimeThreshold) {
      triggeredCriteria.push(`Response time (${metrics.responseTime}ms) exceeds threshold (${thresholds.responseTimeThreshold}ms)`);
    }

    // Check success rate
    if (metrics.successRate < thresholds.successRateThreshold) {
      triggeredCriteria.push(`Success rate (${metrics.successRate}) below threshold (${thresholds.successRateThreshold})`);
    }

    // Check custom metrics
    for (const [metricName, criteria] of Object.entries(thresholds.customMetrics)) {
      const value = metrics[metricName];
      if (value !== undefined) {
        const violated = this.evaluateThreshold(value, criteria.threshold, criteria.operator);
        if (violated) {
          triggeredCriteria.push(`${metricName} (${value}) violates threshold (${criteria.operator} ${criteria.threshold})`);
        }
      }
    }

    const shouldRollback = triggeredCriteria.length >= thresholds.consecutiveFailures;
    const urgency = this.calculateUrgency(triggeredCriteria, metrics);

    const result = {
      shouldRollback,
      triggeredCriteria,
      reasoning: shouldRollback
        ? `${triggeredCriteria.length} criteria triggered, exceeding threshold of ${thresholds.consecutiveFailures}`
        : 'All metrics within acceptable thresholds',
      urgency
    };

    this.logger.info('Rollback decision evaluated', result);

    return result;
  }

  /**
   * Execute full deployment validation
   */
  private async executeDeploymentValidation(
    strategy: DeploymentStrategy,
    smokeTests: SmokeTest[]
  ): Promise<DeploymentValidation> {
    const validationId = `validation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Execute smoke tests
    const smokeTestResults = await this.executeSmokeTests(smokeTests);

    // Analyze results
    const smokeTestSuccess = smokeTestResults.every(result => result.success);

    // Create validation result
    const validation: DeploymentValidation = {
      id: validationId,
      timestamp: new Date(),
      strategy,
      phase: 'smoke',
      success: smokeTestSuccess,
      smokeTestResults,
      recommendation: this.generateRecommendation(smokeTestResults),
      metrics: this.calculateValidationMetrics(smokeTestResults)
    };

    this.activeDeployments.set(validationId, validation);
    this.deploymentHistory.push(validation);

    // Store validation
    await this.storeMemory(`validation:${validationId}`, validation, ['deployment', 'validation']);

    this.logger.info('Deployment validation completed', {
      validationId,
      success: smokeTestSuccess,
      testCount: smokeTests.length
    });

    return validation;
  }

  /**
   * Execute smoke tests
   */
  private async executeSmokeTests(smokeTests: SmokeTest[]): Promise<DeploymentValidation['smokeTestResults']> {
    const results: DeploymentValidation['smokeTestResults'] = [];

    for (const test of smokeTests) {
      const startTime = Date.now();

      try {
        const result = await this.executeSmokeTest(test);
        results.push({
          testId: test.id,
          success: result.success,
          duration: Date.now() - startTime,
          error: result.error,
          response: result.response
        });
      } catch (error) {
        results.push({
          testId: test.id,
          success: false,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  /**
   * Execute individual smoke test
   */
  private async executeSmokeTest(test: SmokeTest): Promise<{ success: boolean; error?: string; response?: any }> {
    this.logger.debug('Executing smoke test', { testId: test.id, name: test.name });

    // Simulate test execution (in real implementation, make actual HTTP requests)
    if (test.endpoint) {
      // Simulate HTTP request
      const success = Math.random() > 0.05; // 95% success rate
      if (success) {
        return {
          success: true,
          response: { status: test.expectedStatus || 200, data: 'OK' }
        };
      } else {
        return {
          success: false,
          error: 'Simulated test failure'
        };
      }
    }

    // For non-HTTP tests, simulate success
    return { success: true };
  }

  /**
   * Generate critical path tests
   */
  private generateCriticalPathTests(path: CriticalPath): SmokeTest[] {
    const tests: SmokeTest[] = [];

    for (let i = 0; i < path.steps.length; i++) {
      const step = path.steps[i];
      const test: SmokeTest = {
        id: `${path.id}-step-${i}`,
        name: `${path.name} - ${step.action}`,
        description: `Validate ${step.action} in ${path.name}`,
        endpoint: step.endpoint,
        method: step.method,
        timeout: 30000,
        critical: path.businessImpact === 'critical' || path.businessImpact === 'high',
        dependencies: i > 0 ? [`${path.id}-step-${i - 1}`] : []
      };
      tests.push(test);
    }

    return tests;
  }

  /**
   * Generate change-specific tests
   */
  private generateChangeSpecificTests(change: DeploymentChange): SmokeTest[] {
    const tests: SmokeTest[] = [];

    // Generate test based on change type
    switch (change.type) {
      case 'feature':
        tests.push({
          id: `feature-${change.id}`,
          name: `Feature validation - ${change.component}`,
          description: `Validate new feature in ${change.component}`,
          endpoint: `/api/${change.component}/health`,
          method: 'GET',
          expectedStatus: 200,
          timeout: 15000,
          critical: change.riskLevel === 'critical' || change.riskLevel === 'high',
          dependencies: []
        });
        break;

      case 'performance':
        tests.push({
          id: `perf-${change.id}`,
          name: `Performance validation - ${change.component}`,
          description: `Validate performance changes in ${change.component}`,
          timeout: 5000, // Stricter timeout for performance changes
          critical: true,
          dependencies: []
        });
        break;

      case 'security':
        tests.push({
          id: `security-${change.id}`,
          name: `Security validation - ${change.component}`,
          description: `Validate security changes in ${change.component}`,
          endpoint: `/api/${change.component}/auth/status`,
          method: 'GET',
          timeout: 10000,
          critical: true,
          dependencies: []
        });
        break;

      default:
        tests.push({
          id: `change-${change.id}`,
          name: `Change validation - ${change.component}`,
          description: `Basic validation for ${change.type} in ${change.component}`,
          timeout: 15000,
          critical: change.riskLevel === 'critical',
          dependencies: []
        });
    }

    return tests;
  }

  /**
   * Generate standard health checks
   */
  private generateStandardHealthChecks(): SmokeTest[] {
    return [
      {
        id: 'health-check',
        name: 'System Health Check',
        description: 'Basic system health validation',
        endpoint: '/health',
        method: 'GET',
        expectedStatus: 200,
        timeout: 10000,
        critical: true,
        dependencies: []
      },
      {
        id: 'api-status',
        name: 'API Status Check',
        description: 'API availability validation',
        endpoint: '/api/status',
        method: 'GET',
        expectedStatus: 200,
        timeout: 15000,
        critical: true,
        dependencies: ['health-check']
      }
    ];
  }

  /**
   * Compare metrics statistically
   */
  private async compareMetric(
    metricName: string,
    baselineValue: number,
    canaryValue: number,
    confidenceLevel: number
  ): Promise<MetricsComparison> {
    // Simplified statistical comparison (in real implementation, use proper statistical tests)
    const difference = canaryValue - baselineValue;
    const percentageChange = baselineValue !== 0 ? (difference / baselineValue) * 100 : 0;

    // Simulate statistical analysis
    const sampleSize = 100; // Assumed sample size
    const variance = Math.abs(difference) * 0.1; // Simplified variance calculation
    const pValue = Math.abs(percentageChange) > 5 ? 0.01 : 0.5; // Simplified p-value
    const significant = pValue < (1 - confidenceLevel);

    let recommendation: 'proceed' | 'caution' | 'rollback' = 'proceed';
    if (significant) {
      if (this.isNegativeChange(metricName, percentageChange)) {
        recommendation = Math.abs(percentageChange) > 20 ? 'rollback' : 'caution';
      }
    }

    return {
      metric: metricName,
      baseline: {
        value: baselineValue,
        sampleSize,
        variance
      },
      canary: {
        value: canaryValue,
        sampleSize,
        variance
      },
      analysis: {
        difference,
        percentageChange,
        pValue,
        significant,
        recommendation
      }
    };
  }

  /**
   * Determine if a change is negative for a given metric
   */
  private isNegativeChange(metricName: string, percentageChange: number): boolean {
    const positiveMetrics = ['throughput', 'success_rate', 'availability'];
    const negativeMetrics = ['error_rate', 'response_time', 'cpu_usage', 'memory_usage'];

    if (positiveMetrics.some(metric => metricName.includes(metric))) {
      return percentageChange < 0; // Decrease is bad for positive metrics
    }

    if (negativeMetrics.some(metric => metricName.includes(metric))) {
      return percentageChange > 0; // Increase is bad for negative metrics
    }

    // Default: assume increase is potentially problematic
    return percentageChange > 0;
  }

  /**
   * Evaluate threshold condition
   */
  private evaluateThreshold(value: number, threshold: number, operator: '>' | '<' | '='): boolean {
    switch (operator) {
      case '>':
        return value > threshold;
      case '<':
        return value < threshold;
      case '=':
        return Math.abs(value - threshold) < 0.001; // Handle floating point comparison
      default:
        return false;
    }
  }

  /**
   * Calculate urgency level
   */
  private calculateUrgency(triggeredCriteria: string[], metrics: Record<string, number>): 'low' | 'medium' | 'high' | 'critical' {
    if (triggeredCriteria.length === 0) return 'low';

    // Check for critical metrics
    if (metrics.errorRate > 0.1 || metrics.successRate < 0.5) {
      return 'critical';
    }

    if (triggeredCriteria.length >= 3) return 'high';
    if (triggeredCriteria.length >= 2) return 'medium';
    return 'low';
  }

  /**
   * Generate deployment recommendation
   */
  private generateRecommendation(smokeTestResults: DeploymentValidation['smokeTestResults']): DeploymentValidation['recommendation'] {
    const totalTests = smokeTestResults.length;
    const passedTests = smokeTestResults.filter(r => r.success).length;
    const criticalFailures = smokeTestResults.filter(r => !r.success && r.testId.includes('critical')).length;

    const successRate = passedTests / totalTests;

    if (criticalFailures > 0) {
      return {
        action: 'rollback',
        reasoning: `${criticalFailures} critical test failures detected`,
        confidence: 0.9,
        nextSteps: [
          'Investigate critical test failures',
          'Execute rollback procedure',
          'Review deployment changes'
        ]
      };
    }

    if (successRate < 0.8) {
      return {
        action: 'investigate',
        reasoning: `Low success rate: ${(successRate * 100).toFixed(1)}%`,
        confidence: 0.8,
        nextSteps: [
          'Investigate test failures',
          'Consider partial rollback',
          'Monitor metrics closely'
        ]
      };
    }

    if (successRate < 0.95) {
      return {
        action: 'pause',
        reasoning: `Some test failures detected, success rate: ${(successRate * 100).toFixed(1)}%`,
        confidence: 0.7,
        nextSteps: [
          'Review failed tests',
          'Monitor for 10 minutes',
          'Proceed with caution if stable'
        ]
      };
    }

    return {
      action: 'proceed',
      reasoning: `All tests passed, success rate: ${(successRate * 100).toFixed(1)}%`,
      confidence: 0.95,
      nextSteps: [
        'Continue with deployment',
        'Monitor canary metrics',
        'Prepare for full rollout'
      ]
    };
  }

  /**
   * Calculate validation metrics
   */
  private calculateValidationMetrics(smokeTestResults: DeploymentValidation['smokeTestResults']): Record<string, number> {
    const totalTests = smokeTestResults.length;
    const passedTests = smokeTestResults.filter(r => r.success).length;
    const totalDuration = smokeTestResults.reduce((sum, r) => sum + r.duration, 0);

    return {
      total_tests: totalTests,
      passed_tests: passedTests,
      failed_tests: totalTests - passedTests,
      success_rate: passedTests / totalTests,
      total_duration: totalDuration,
      average_test_duration: totalDuration / totalTests
    };
  }

  /**
   * Create default deployment change for testing
   */
  private createDefaultChange(): DeploymentChange {
    return {
      id: `change-${Date.now()}`,
      type: 'feature',
      component: 'api',
      description: 'Default feature deployment',
      riskLevel: 'medium',
      affectedAreas: ['api', 'database'],
      dependencies: [],
      rollbackPlan: 'Revert to previous version'
    };
  }

  /**
   * Create default critical path for testing
   */
  private createDefaultCriticalPath(): CriticalPath {
    return {
      id: `path-${Date.now()}`,
      name: 'Core API Journey',
      description: 'Critical API functionality validation',
      steps: [
        {
          action: 'Health Check',
          endpoint: '/health',
          method: 'GET',
          expectedOutcome: '200 OK response'
        },
        {
          action: 'API Status',
          endpoint: '/api/status',
          method: 'GET',
          expectedOutcome: 'API status response'
        }
      ],
      businessImpact: 'high'
    };
  }

  protected async onInitialize(): Promise<void> {
    this.logger.info('Initializing Deployment Guardian');
    // Load deployment configuration and historical data
  }

  public getActiveDeployments(): DeploymentValidation[] {
    return Array.from(this.activeDeployments.values());
  }

  public async getValidation(validationId: string): Promise<DeploymentValidation | null> {
    return this.activeDeployments.get(validationId) ||
           await this.getMemory<DeploymentValidation>(`validation:${validationId}`);
  }

  public getSmokeTests(): SmokeTest[] {
    return Array.from(this.smokeTests.values());
  }
}