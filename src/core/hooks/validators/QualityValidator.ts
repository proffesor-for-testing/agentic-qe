/**
 * QualityValidator - Validates code quality metrics and standards
 */

export interface QualityValidationOptions {
  metrics: {
    complexity?: number;
    maintainability?: number;
    duplicatedLines?: number;
    testCoverage?: number;
    [key: string]: any;
  };
  thresholds: {
    maxComplexity?: number;
    minMaintainability?: number;
    maxDuplication?: number;
    minCoverage?: number;
  };
}

export interface QualityValidationResult {
  valid: boolean;
  score: number;
  validations: string[];
  violations: string[];
  details: {
    scores: Record<string, number>;
    passed: Record<string, boolean>;
  };
}

export class QualityValidator {
  async validate(options: QualityValidationOptions): Promise<QualityValidationResult> {
    const validations: string[] = ['quality-metrics'];
    const violations: string[] = [];
    const scores: Record<string, number> = {};
    const passed: Record<string, boolean> = {};

    let valid = true;

    // Complexity check
    if (options.thresholds.maxComplexity !== undefined && options.metrics.complexity !== undefined) {
      const complexityScore = Math.max(0, 1 - (options.metrics.complexity / (options.thresholds.maxComplexity * 2)));
      scores.complexity = complexityScore;
      passed.complexity = options.metrics.complexity <= options.thresholds.maxComplexity;

      if (!passed.complexity) {
        violations.push(`Complexity too high: ${options.metrics.complexity} > ${options.thresholds.maxComplexity}`);
        valid = false;
      }
    }

    // Maintainability check
    if (options.thresholds.minMaintainability !== undefined && options.metrics.maintainability !== undefined) {
      const maintainabilityScore = options.metrics.maintainability / 100;
      scores.maintainability = maintainabilityScore;
      passed.maintainability = options.metrics.maintainability >= options.thresholds.minMaintainability;

      if (!passed.maintainability) {
        violations.push(`Maintainability too low: ${options.metrics.maintainability} < ${options.thresholds.minMaintainability}`);
        valid = false;
      }
    }

    // Duplication check
    if (options.thresholds.maxDuplication !== undefined && options.metrics.duplicatedLines !== undefined) {
      const duplicationScore = Math.max(0, 1 - (options.metrics.duplicatedLines / (options.thresholds.maxDuplication * 2)));
      scores.duplication = duplicationScore;
      passed.duplication = options.metrics.duplicatedLines <= options.thresholds.maxDuplication;

      if (!passed.duplication) {
        violations.push(`Too many duplicated lines: ${options.metrics.duplicatedLines} > ${options.thresholds.maxDuplication}`);
        valid = false;
      }
    }

    // Coverage check
    if (options.thresholds.minCoverage !== undefined && options.metrics.testCoverage !== undefined) {
      scores.coverage = options.metrics.testCoverage;
      passed.coverage = options.metrics.testCoverage >= options.thresholds.minCoverage;

      if (!passed.coverage) {
        violations.push(`Coverage too low: ${options.metrics.testCoverage} < ${options.thresholds.minCoverage}`);
        valid = false;
      }
    }

    // Calculate overall score
    const scoreValues = Object.values(scores);
    const overallScore = scoreValues.length > 0
      ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
      : 0;

    return {
      valid,
      score: overallScore,
      validations,
      violations,
      details: {
        scores,
        passed
      }
    };
  }
}
