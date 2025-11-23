/**
 * Metric Evaluator
 *
 * Calculates and evaluates quantitative quality metrics.
 * Supports metrics like test coverage, maintainability index, technical debt ratio.
 * Can work with pre-calculated metrics or compute them on demand.
 *
 * @module constitution/evaluators/metric-evaluator
 * @version 1.0.0
 */

import type { RuleCondition } from '../schema';
import { BaseEvaluator, type CheckResult, type EvaluationContext } from './base';

/**
 * Computed quality metrics
 */
interface QualityMetrics {
  /** Overall quality score (0-100) */
  qualityScore?: number;
  /** Test coverage percentage */
  coverage?: number;
  /** Maintainability index (0-100) */
  maintainabilityIndex?: number;
  /** Technical debt ratio */
  technicalDebtRatio?: number;
  /** Security score (0-100) */
  securityScore?: number;
  /** Documentation coverage percentage */
  docCoverage?: number;
  /** Code duplication percentage */
  duplicationPercentage?: number;
  /** Automation percentage */
  automationPercentage?: number;
  /** Defect detection rate */
  defectDetectionRate?: number;
  /** Mean time to detection (hours) */
  meanTimeToDetection?: number;
  /** Result variance percentage */
  resultVariance?: number;
  /** Execution time (seconds) */
  executionTime?: number;
  /** Vulnerability count */
  vulnerabilityCount?: number;
  /** Code smell count */
  codeSmellCount?: number;
}

/**
 * Fields that metric evaluator can check
 */
const METRIC_FIELDS = new Set([
  'quality_score',
  'coverage',
  'maintainability_index',
  'technical_debt_ratio',
  'security_score',
  'doc_coverage',
  'duplication_percentage',
  'automation_percentage',
  'defect_detection_rate',
  'mean_time_to_detection',
  'result_variance',
  'execution_time',
  'vulnerability_count',
  'code_smell_count',
]);

/**
 * Metric Evaluator for quantitative quality metrics
 */
export class MetricEvaluator extends BaseEvaluator {
  readonly type = 'metric' as const;

  canHandle(condition: RuleCondition): boolean {
    return METRIC_FIELDS.has(condition.field);
  }

  async evaluate(condition: RuleCondition, context: EvaluationContext): Promise<CheckResult> {
    try {
      // Get metrics from context or calculate them
      const metrics = await this.getMetrics(context);

      // Get the requested metric value
      const actualValue = this.getMetricValue(condition.field, metrics);

      // Handle missing metrics
      if (actualValue === undefined || actualValue === null) {
        return this.createResult(
          false,
          condition.field,
          null,
          condition.value,
          condition.operator,
          `Metric '${condition.field}' not available in context`
        );
      }

      // Compare against expected value
      const passed = this.compareValues(actualValue, condition.operator, condition.value);

      return this.createResult(
        passed,
        condition.field,
        actualValue,
        condition.value,
        condition.operator
      );
    } catch (error) {
      return this.createResult(
        false,
        condition.field,
        null,
        condition.value,
        condition.operator,
        `Metric evaluation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get metrics from context or calculate them
   * @param context - Evaluation context
   * @returns Quality metrics
   */
  private async getMetrics(context: EvaluationContext): Promise<QualityMetrics> {
    // If metrics are pre-calculated in context, use them
    if (context.metrics) {
      return this.convertMetrics(context.metrics);
    }

    // Otherwise, calculate metrics from source code
    if (context.sourceCode) {
      return this.calculateMetrics(context.sourceCode, context.data || {});
    }

    // If neither is available, return empty metrics
    return {};
  }

  /**
   * Convert context metrics to quality metrics
   * @param metrics - Context metrics
   * @returns Quality metrics
   */
  private convertMetrics(metrics: Record<string, number>): QualityMetrics {
    return {
      qualityScore: metrics.quality_score ?? metrics.qualityScore,
      coverage: metrics.coverage,
      maintainabilityIndex: metrics.maintainability_index ?? metrics.maintainabilityIndex,
      technicalDebtRatio: metrics.technical_debt_ratio ?? metrics.technicalDebtRatio,
      securityScore: metrics.security_score ?? metrics.securityScore,
      docCoverage: metrics.doc_coverage ?? metrics.docCoverage,
      duplicationPercentage: metrics.duplication_percentage ?? metrics.duplicationPercentage,
      automationPercentage: metrics.automation_percentage ?? metrics.automationPercentage,
      defectDetectionRate: metrics.defect_detection_rate ?? metrics.defectDetectionRate,
      meanTimeToDetection: metrics.mean_time_to_detection ?? metrics.meanTimeToDetection,
      resultVariance: metrics.result_variance ?? metrics.resultVariance,
      executionTime: metrics.execution_time ?? metrics.executionTime,
      vulnerabilityCount: metrics.vulnerability_count ?? metrics.vulnerabilityCount,
      codeSmellCount: metrics.code_smell_count ?? metrics.codeSmellCount,
    };
  }

  /**
   * Calculate metrics from source code
   * @param sourceCode - Source code to analyze
   * @param data - Additional context data
   * @returns Calculated metrics
   */
  private calculateMetrics(sourceCode: string, data: Record<string, unknown>): QualityMetrics {
    const metrics: QualityMetrics = {};

    // Calculate maintainability index
    // Formula: MI = 171 - 5.2 * ln(HV) - 0.23 * CC - 16.2 * ln(LOC)
    // Where: HV = Halstead Volume, CC = Cyclomatic Complexity, LOC = Lines of Code
    const lines = sourceCode.split('\n').length;
    const estimatedComplexity = this.estimateComplexity(sourceCode);

    // Simplified maintainability index calculation
    metrics.maintainabilityIndex = Math.max(
      0,
      Math.min(100, 171 - 5.2 * Math.log(lines * 10) - 0.23 * estimatedComplexity - 16.2 * Math.log(lines))
    );

    // Calculate documentation coverage (simple heuristic: comment ratio)
    const commentLines = (sourceCode.match(/\/\/.+|\/\*[\s\S]*?\*\//g) || []).length;
    metrics.docCoverage = Math.min(100, (commentLines / lines) * 300); // 1 comment per 3 lines = 100%

    // Calculate duplication (simple heuristic: repeated lines)
    metrics.duplicationPercentage = this.estimateDuplication(sourceCode);

    // Use data from context if available
    if (data.coverage !== undefined) metrics.coverage = Number(data.coverage);
    if (data.securityScore !== undefined) metrics.securityScore = Number(data.securityScore);
    if (data.vulnerabilityCount !== undefined) metrics.vulnerabilityCount = Number(data.vulnerabilityCount);

    return metrics;
  }

  /**
   * Estimate cyclomatic complexity (simple heuristic)
   * @param code - Source code
   * @returns Estimated complexity
   */
  private estimateComplexity(code: string): number {
    const controlFlowKeywords = /\b(if|else|switch|case|for|while|do|catch|&&|\|\||\?)\b/g;
    const matches = code.match(controlFlowKeywords);
    return (matches?.length || 0) + 1;
  }

  /**
   * Estimate code duplication (simple heuristic)
   * @param code - Source code
   * @returns Estimated duplication percentage
   */
  private estimateDuplication(code: string): number {
    const lines = code.split('\n').filter(line => line.trim().length > 0);
    const uniqueLines = new Set(lines);
    const duplicatedLines = lines.length - uniqueLines.size;
    return lines.length > 0 ? (duplicatedLines / lines.length) * 100 : 0;
  }

  /**
   * Get metric value by field name
   * @param field - Field name
   * @param metrics - Calculated metrics
   * @returns Metric value
   */
  private getMetricValue(field: string, metrics: QualityMetrics): number | undefined {
    switch (field) {
      case 'quality_score':
        return metrics.qualityScore;
      case 'coverage':
        return metrics.coverage;
      case 'maintainability_index':
        return metrics.maintainabilityIndex;
      case 'technical_debt_ratio':
        return metrics.technicalDebtRatio;
      case 'security_score':
        return metrics.securityScore;
      case 'doc_coverage':
        return metrics.docCoverage;
      case 'duplication_percentage':
        return metrics.duplicationPercentage;
      case 'automation_percentage':
        return metrics.automationPercentage;
      case 'defect_detection_rate':
        return metrics.defectDetectionRate;
      case 'mean_time_to_detection':
        return metrics.meanTimeToDetection;
      case 'result_variance':
        return metrics.resultVariance;
      case 'execution_time':
        return metrics.executionTime;
      case 'vulnerability_count':
        return metrics.vulnerabilityCount;
      case 'code_smell_count':
        return metrics.codeSmellCount;
      default:
        return undefined;
    }
  }
}
