/**
 * Quality Validate Metrics Handler
 *
 * Validates quality metrics against configurable thresholds.
 * Provides detailed pass/fail analysis with recommendations.
 *
 * @version 1.0.0
 * @author Agentic QE Team - Agent 2
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import { HookExecutor } from '../../services/HookExecutor.js';

export interface QualityMetricsThresholds {
  coverage?: {
    line?: number;
    branch?: number;
    function?: number;
    statement?: number;
  };
  testResults?: {
    minSuccessRate?: number;
    maxFailureRate?: number;
    maxSkippedRate?: number;
  };
  security?: {
    maxCritical?: number;
    maxHigh?: number;
    maxMedium?: number;
    maxTotal?: number;
  };
  performance?: {
    maxResponseTime?: number;
    minThroughput?: number;
    maxErrorRate?: number;
  };
  codeQuality?: {
    maxComplexity?: number;
    minMaintainability?: number;
    maxDuplication?: number;
  };
}

export interface MetricValidation {
  name: string;
  category: string;
  value: number;
  threshold: number;
  passed: boolean;
  deviation: number; // Percentage deviation from threshold
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
}

export interface QualityValidateMetricsArgs {
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
  thresholds?: QualityMetricsThresholds;
  strictMode?: boolean;
}

export interface QualityValidateMetricsResult {
  validationId: string;
  passed: boolean;
  overallScore: number;
  validations: MetricValidation[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    critical: number;
    warnings: number;
  };
  recommendations: string[];
  timestamp: string;
}

export class QualityValidateMetricsHandler extends BaseHandler {
  private hookExecutor: HookExecutor;
  private defaultThresholds: QualityMetricsThresholds;

  constructor(hookExecutor: HookExecutor) {
    super();
    this.hookExecutor = hookExecutor;
    this.defaultThresholds = this.createDefaultThresholds();
  }

  async handle(args: QualityValidateMetricsArgs): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();
    this.log('info', 'Validating quality metrics', { requestId });

    try {
      // Validate required parameters
      this.validateRequired(args, ['metrics']);

      // Use provided thresholds or defaults
      const thresholds = args.thresholds || this.defaultThresholds;
      const strictMode = args.strictMode ?? false;

      // Execute pre-task hook
      await this.hookExecutor.executePreTask({
        description: 'Validating quality metrics against thresholds',
        agentType: 'quality-analyzer',
        sessionId: requestId
      });

      // Perform validation
      const { result: validationResult, executionTime } = await this.measureExecutionTime(
        async () => {
          const validations: MetricValidation[] = [];

          // Validate coverage metrics
          if (thresholds.coverage) {
            validations.push(...this.validateCoverage(args.metrics.coverage, thresholds.coverage));
          }

          // Validate test results
          if (thresholds.testResults) {
            validations.push(...this.validateTestResults(args.metrics.testResults, thresholds.testResults));
          }

          // Validate security metrics
          if (thresholds.security) {
            validations.push(...this.validateSecurity(args.metrics.security, thresholds.security));
          }

          // Validate performance metrics
          if (thresholds.performance) {
            validations.push(...this.validatePerformance(args.metrics.performance, thresholds.performance));
          }

          // Validate code quality metrics
          if (thresholds.codeQuality) {
            validations.push(...this.validateCodeQuality(args.metrics.codeQuality, thresholds.codeQuality));
          }

          // Calculate summary
          const summary = this.calculateSummary(validations);

          // Determine overall pass/fail
          const passed = strictMode
            ? validations.every(v => v.passed)
            : summary.critical === 0;

          // Calculate overall score
          const overallScore = this.calculateOverallScore(validations);

          // Generate recommendations
          const recommendations = this.generateRecommendations(validations, strictMode);

          const result: QualityValidateMetricsResult = {
            validationId: requestId,
            passed,
            overallScore,
            validations,
            summary,
            recommendations,
            timestamp: new Date().toISOString()
          };

          return result;
        }
      );

      this.log('info', `Metrics validated in ${executionTime.toFixed(2)}ms`, {
        validationId: validationResult.validationId,
        passed: validationResult.passed,
        score: validationResult.overallScore
      });

      // Store result in memory
      await this.hookExecutor.executePostEdit({
        file: `validation-${requestId}`,
        memoryKey: `aqe/swarm/quality-mcp-tools/validations/${requestId}`
      });

      // Execute post-task hook
      await this.hookExecutor.executePostTask({
        taskId: requestId,
        agentType: 'quality-analyzer',
        sessionId: requestId,
        results: {
          validationId: validationResult.validationId,
          passed: validationResult.passed,
          score: validationResult.overallScore
        }
      });

      return this.createSuccessResponse(validationResult, requestId);

    } catch (error) {
      this.log('error', 'Metrics validation failed', {
        error: error instanceof Error ? error.message : String(error)
      });

      await this.hookExecutor.notify({
        message: `Metrics validation failed: ${error instanceof Error ? error.message : String(error)}`,
        level: 'error'
      });

      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Metrics validation failed',
        requestId
      );
    }
  }

  private createDefaultThresholds(): QualityMetricsThresholds {
    return {
      coverage: {
        line: 80,
        branch: 75,
        function: 85,
        statement: 80
      },
      testResults: {
        minSuccessRate: 95,
        maxFailureRate: 5,
        maxSkippedRate: 2
      },
      security: {
        maxCritical: 0,
        maxHigh: 2,
        maxMedium: 10,
        maxTotal: 20
      },
      performance: {
        maxResponseTime: 1000,
        minThroughput: 100,
        maxErrorRate: 0.05
      },
      codeQuality: {
        maxComplexity: 15,
        minMaintainability: 70,
        maxDuplication: 5
      }
    };
  }

  private validateCoverage(
    coverage: QualityValidateMetricsArgs['metrics']['coverage'],
    thresholds: NonNullable<QualityMetricsThresholds['coverage']>
  ): MetricValidation[] {
    const validations: MetricValidation[] = [];

    if (thresholds.line !== undefined) {
      validations.push(this.createValidation(
        'Line Coverage',
        'coverage',
        coverage.line,
        thresholds.line,
        coverage.line >= thresholds.line,
        'minimum'
      ));
    }

    if (thresholds.branch !== undefined) {
      validations.push(this.createValidation(
        'Branch Coverage',
        'coverage',
        coverage.branch,
        thresholds.branch,
        coverage.branch >= thresholds.branch,
        'minimum'
      ));
    }

    if (thresholds.function !== undefined) {
      validations.push(this.createValidation(
        'Function Coverage',
        'coverage',
        coverage.function,
        thresholds.function,
        coverage.function >= thresholds.function,
        'minimum'
      ));
    }

    if (thresholds.statement !== undefined) {
      validations.push(this.createValidation(
        'Statement Coverage',
        'coverage',
        coverage.statement,
        thresholds.statement,
        coverage.statement >= thresholds.statement,
        'minimum'
      ));
    }

    return validations;
  }

  private validateTestResults(
    testResults: QualityValidateMetricsArgs['metrics']['testResults'],
    thresholds: NonNullable<QualityMetricsThresholds['testResults']>
  ): MetricValidation[] {
    const validations: MetricValidation[] = [];
    const successRate = (testResults.passed / testResults.total) * 100;
    const failureRate = (testResults.failed / testResults.total) * 100;
    const skippedRate = (testResults.skipped / testResults.total) * 100;

    if (thresholds.minSuccessRate !== undefined) {
      validations.push(this.createValidation(
        'Test Success Rate',
        'test-results',
        successRate,
        thresholds.minSuccessRate,
        successRate >= thresholds.minSuccessRate,
        'minimum'
      ));
    }

    if (thresholds.maxFailureRate !== undefined) {
      validations.push(this.createValidation(
        'Test Failure Rate',
        'test-results',
        failureRate,
        thresholds.maxFailureRate,
        failureRate <= thresholds.maxFailureRate,
        'maximum'
      ));
    }

    if (thresholds.maxSkippedRate !== undefined) {
      validations.push(this.createValidation(
        'Test Skipped Rate',
        'test-results',
        skippedRate,
        thresholds.maxSkippedRate,
        skippedRate <= thresholds.maxSkippedRate,
        'maximum'
      ));
    }

    return validations;
  }

  private validateSecurity(
    security: QualityValidateMetricsArgs['metrics']['security'],
    thresholds: NonNullable<QualityMetricsThresholds['security']>
  ): MetricValidation[] {
    const validations: MetricValidation[] = [];
    const total = security.critical + security.high + security.medium + security.low;

    if (thresholds.maxCritical !== undefined) {
      validations.push(this.createValidation(
        'Critical Vulnerabilities',
        'security',
        security.critical,
        thresholds.maxCritical,
        security.critical <= thresholds.maxCritical,
        'maximum',
        'critical'
      ));
    }

    if (thresholds.maxHigh !== undefined) {
      validations.push(this.createValidation(
        'High Vulnerabilities',
        'security',
        security.high,
        thresholds.maxHigh,
        security.high <= thresholds.maxHigh,
        'maximum',
        'high'
      ));
    }

    if (thresholds.maxMedium !== undefined) {
      validations.push(this.createValidation(
        'Medium Vulnerabilities',
        'security',
        security.medium,
        thresholds.maxMedium,
        security.medium <= thresholds.maxMedium,
        'maximum',
        'medium'
      ));
    }

    if (thresholds.maxTotal !== undefined) {
      validations.push(this.createValidation(
        'Total Vulnerabilities',
        'security',
        total,
        thresholds.maxTotal,
        total <= thresholds.maxTotal,
        'maximum'
      ));
    }

    return validations;
  }

  private validatePerformance(
    performance: QualityValidateMetricsArgs['metrics']['performance'],
    thresholds: NonNullable<QualityMetricsThresholds['performance']>
  ): MetricValidation[] {
    const validations: MetricValidation[] = [];

    if (thresholds.maxResponseTime !== undefined) {
      validations.push(this.createValidation(
        'Response Time',
        'performance',
        performance.averageResponseTime,
        thresholds.maxResponseTime,
        performance.averageResponseTime <= thresholds.maxResponseTime,
        'maximum'
      ));
    }

    if (thresholds.minThroughput !== undefined) {
      validations.push(this.createValidation(
        'Throughput',
        'performance',
        performance.throughput,
        thresholds.minThroughput,
        performance.throughput >= thresholds.minThroughput,
        'minimum'
      ));
    }

    if (thresholds.maxErrorRate !== undefined) {
      const errorRatePercent = performance.errorRate * 100;
      const thresholdPercent = thresholds.maxErrorRate * 100;
      validations.push(this.createValidation(
        'Error Rate',
        'performance',
        errorRatePercent,
        thresholdPercent,
        performance.errorRate <= thresholds.maxErrorRate,
        'maximum'
      ));
    }

    return validations;
  }

  private validateCodeQuality(
    codeQuality: QualityValidateMetricsArgs['metrics']['codeQuality'],
    thresholds: NonNullable<QualityMetricsThresholds['codeQuality']>
  ): MetricValidation[] {
    const validations: MetricValidation[] = [];

    if (thresholds.maxComplexity !== undefined) {
      validations.push(this.createValidation(
        'Code Complexity',
        'code-quality',
        codeQuality.complexity,
        thresholds.maxComplexity,
        codeQuality.complexity <= thresholds.maxComplexity,
        'maximum'
      ));
    }

    if (thresholds.minMaintainability !== undefined) {
      validations.push(this.createValidation(
        'Maintainability Index',
        'code-quality',
        codeQuality.maintainability,
        thresholds.minMaintainability,
        codeQuality.maintainability >= thresholds.minMaintainability,
        'minimum'
      ));
    }

    if (thresholds.maxDuplication !== undefined) {
      validations.push(this.createValidation(
        'Code Duplication',
        'code-quality',
        codeQuality.duplication,
        thresholds.maxDuplication,
        codeQuality.duplication <= thresholds.maxDuplication,
        'maximum'
      ));
    }

    return validations;
  }

  private createValidation(
    name: string,
    category: string,
    value: number,
    threshold: number,
    passed: boolean,
    type: 'minimum' | 'maximum',
    overrideSeverity?: 'critical' | 'high' | 'medium' | 'low'
  ): MetricValidation {
    const deviation = type === 'minimum'
      ? ((value - threshold) / threshold) * 100
      : ((threshold - value) / threshold) * 100;

    const severity = overrideSeverity || this.determineSeverity(deviation, passed);

    const message = passed
      ? `${name} meets threshold (${value.toFixed(2)} ${type === 'minimum' ? '≥' : '≤'} ${threshold})`
      : `${name} below threshold (${value.toFixed(2)} ${type === 'minimum' ? '<' : '>'} ${threshold})`;

    return {
      name,
      category,
      value,
      threshold,
      passed,
      deviation,
      severity,
      message
    };
  }

  private determineSeverity(deviation: number, passed: boolean): 'critical' | 'high' | 'medium' | 'low' {
    if (passed) return 'low';

    if (deviation < -50) return 'critical';
    if (deviation < -25) return 'high';
    if (deviation < -10) return 'medium';
    return 'low';
  }

  private calculateSummary(validations: MetricValidation[]) {
    return {
      total: validations.length,
      passed: validations.filter(v => v.passed).length,
      failed: validations.filter(v => !v.passed).length,
      critical: validations.filter(v => !v.passed && v.severity === 'critical').length,
      warnings: validations.filter(v => !v.passed && v.severity !== 'critical').length
    };
  }

  private calculateOverallScore(validations: MetricValidation[]): number {
    if (validations.length === 0) return 0;

    const passedCount = validations.filter(v => v.passed).length;
    return Math.round((passedCount / validations.length) * 100 * 100) / 100;
  }

  private generateRecommendations(validations: MetricValidation[], strictMode: boolean): string[] {
    const recommendations: string[] = [];
    const failedValidations = validations.filter(v => !v.passed);

    for (const validation of failedValidations) {
      switch (validation.category) {
        case 'coverage':
          recommendations.push(`Increase ${validation.name.toLowerCase()} to at least ${validation.threshold}%`);
          break;
        case 'test-results':
          recommendations.push(`Improve ${validation.name.toLowerCase()} to meet ${validation.threshold}% threshold`);
          break;
        case 'security':
          recommendations.push(`Address security vulnerabilities: ${validation.name.toLowerCase()}`);
          break;
        case 'performance':
          recommendations.push(`Optimize ${validation.name.toLowerCase()} to meet performance requirements`);
          break;
        case 'code-quality':
          recommendations.push(`Refactor code to improve ${validation.name.toLowerCase()}`);
          break;
      }
    }

    if (failedValidations.length === 0) {
      recommendations.push('All quality metrics meet or exceed thresholds');
    } else if (strictMode) {
      recommendations.push('Strict mode enabled: all metrics must pass before deployment');
    }

    return recommendations;
  }
}
