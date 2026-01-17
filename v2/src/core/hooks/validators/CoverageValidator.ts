/**
 * CoverageValidator - Validates test coverage metrics and identifies gaps
 */

export interface CoverageValidationOptions {
  coverage: {
    lines?: number;
    branches?: number;
    functions?: number;
    statements?: number;
    uncovered?: number[];
  };
  thresholds?: {
    lines?: number;
    branches?: number;
    functions?: number;
    statements?: number;
  };
  baseline?: {
    lines?: number;
    branches?: number;
    functions?: number;
    statements?: number;
  };
}

export interface CoverageValidationResult {
  valid: boolean;
  validations: string[];
  gaps: string[];
  details: {
    uncoveredLines?: number[];
    delta?: Record<string, number>;
    percentages?: Record<string, number>;
  };
}

export class CoverageValidator {
  async validate(options: CoverageValidationOptions): Promise<CoverageValidationResult> {
    const validations: string[] = [];
    const gaps: string[] = [];
    const details: CoverageValidationResult['details'] = {};

    let valid = true;

    // Validate coverage thresholds
    if (options.thresholds) {
      validations.push('coverage-thresholds');

      const metrics = ['lines', 'branches', 'functions', 'statements'] as const;

      for (const metric of metrics) {
        const threshold = options.thresholds[metric];
        const actual = options.coverage[metric];

        if (threshold !== undefined && actual !== undefined) {
          if (actual < threshold) {
            gaps.push(`${metric} coverage below threshold: ${actual}% < ${threshold}%`);
            valid = false;
          }
        }
      }
    }

    // Identify uncovered lines
    if (options.coverage.uncovered && options.coverage.uncovered.length > 0) {
      validations.push('uncovered-lines');
      details.uncoveredLines = options.coverage.uncovered;

      if (options.thresholds?.lines && options.coverage.lines !== undefined) {
        if (options.coverage.lines < options.thresholds.lines) {
          gaps.push(`${details.uncoveredLines.length} lines not covered`);
          valid = false;
        }
      }
    }

    // Calculate delta from baseline
    if (options.baseline) {
      validations.push('baseline-comparison');
      details.delta = {};

      const metrics = ['lines', 'branches', 'functions', 'statements'] as const;

      for (const metric of metrics) {
        const baseline = options.baseline[metric];
        const actual = options.coverage[metric];

        if (baseline !== undefined && actual !== undefined) {
          details.delta[metric] = actual - baseline;
        }
      }
    }

    // Store percentages
    details.percentages = {
      lines: options.coverage.lines || 0,
      branches: options.coverage.branches || 0,
      functions: options.coverage.functions || 0,
      statements: options.coverage.statements || 0
    };

    return {
      valid,
      validations,
      gaps,
      details
    };
  }
}
