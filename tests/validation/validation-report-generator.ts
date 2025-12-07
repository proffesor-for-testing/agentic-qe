/**
 * Validation Report Generator for Learning Quality Validation Tests
 *
 * Generates comprehensive validation reports comparing current metrics
 * against issue #118 targets and baseline values.
 *
 * @module tests/validation/validation-report-generator
 */

import type {
  ValidationMetrics,
  ValidationReport,
  ValidationResult,
  ValidationSummary,
  ValidationImprovements
} from './validation-types';
import { formatPercentage, formatMultiplier, calculateImprovement, meetsTarget } from './validation-utils';

/**
 * Issue #118 target metrics
 */
export const ISSUE_118_TARGETS = {
  patternReuseRate: 0.70,        // 70%
  crossAgentTransfer: 0.60,     // 60%
  testGenAccuracy: 0.90,        // 90%
  cicdSpeedMultiplier: 4.0      // 4x baseline
} as const;

/**
 * Issue #118 baseline metrics (before implementation)
 */
export const ISSUE_118_BASELINE = {
  patternReuseRate: 0.20,       // 20%
  crossAgentTransfer: 0.00,     // 0%
  testGenAccuracy: 0.75,        // 75%
  cicdSpeedMultiplier: 1.0      // 1x baseline
} as const;

/**
 * Metric descriptions for reporting
 */
const METRIC_DESCRIPTIONS: Record<string, string> = {
  patternReuseRate: 'Percentage of learned patterns that are reused across test generation sessions',
  crossAgentTransfer: 'Success rate of knowledge transfer between QE agents via gossip protocol',
  testGenAccuracy: 'Accuracy of AI-generated tests (passing without false positives)',
  cicdSpeedMultiplier: 'Speed improvement in CI/CD pipeline compared to baseline'
};

/**
 * Generate a validation result for a single metric
 *
 * @param metric - Metric name
 * @param value - Current value
 * @param target - Target value
 * @param baseline - Baseline value
 * @returns Validation result
 */
function createValidationResult(
  metric: string,
  value: number,
  target: number,
  baseline: number
): ValidationResult {
  const isSpeedMetric = metric === 'cicdSpeedMultiplier';
  const passed = meetsTarget(value, target, 'higher');
  const improvement = calculateImprovement(baseline, value);

  return {
    metric,
    value,
    target,
    baseline,
    passed,
    improvement,
    description: METRIC_DESCRIPTIONS[metric] || metric
  };
}

/**
 * Generate a comprehensive validation report
 *
 * @param metrics - Current validation metrics
 * @param targets - Target metrics (defaults to issue #118 targets)
 * @param baseline - Baseline metrics (defaults to issue #118 baseline)
 * @returns Validation report with toMarkdown method
 */
export function generateValidationReport(
  metrics: ValidationMetrics,
  targets: Record<string, number> = ISSUE_118_TARGETS,
  baseline: Record<string, number> = ISSUE_118_BASELINE
): ValidationReport {
  // Generate results for each metric
  const results: ValidationResult[] = [
    createValidationResult(
      'patternReuseRate',
      metrics.patternReuseRate,
      targets.patternReuseRate,
      baseline.patternReuseRate
    ),
    createValidationResult(
      'crossAgentTransfer',
      metrics.crossAgentTransfer,
      targets.crossAgentTransfer,
      baseline.crossAgentTransfer
    ),
    createValidationResult(
      'testGenAccuracy',
      metrics.testGenAccuracy,
      targets.testGenAccuracy,
      baseline.testGenAccuracy
    ),
    createValidationResult(
      'cicdSpeedMultiplier',
      metrics.cicdSpeedMultiplier,
      targets.cicdSpeedMultiplier,
      baseline.cicdSpeedMultiplier
    )
  ];

  // Calculate summary
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.length - passedCount;
  const score = (passedCount / results.length) * 100;

  const summary: ValidationSummary = {
    passed: failedCount === 0,
    passedCount,
    failedCount,
    score,
    generatedAt: new Date()
  };

  // Calculate improvements
  const improvements: ValidationImprovements = {
    patternReuseRate: calculateImprovement(baseline.patternReuseRate, metrics.patternReuseRate),
    crossAgentTransfer: metrics.crossAgentTransfer > 0 ? 100 : 0, // From 0, any positive is infinite improvement
    testGenAccuracy: calculateImprovement(baseline.testGenAccuracy, metrics.testGenAccuracy),
    cicdSpeedMultiplier: calculateImprovement(baseline.cicdSpeedMultiplier, metrics.cicdSpeedMultiplier)
  };

  // Create report object with toMarkdown method
  const report: ValidationReport = {
    summary,
    results,
    improvements,
    metrics,
    targets,
    baseline,
    toMarkdown(): string {
      return generateMarkdownReport(this);
    }
  };

  return report;
}

/**
 * Generate markdown report from validation report
 *
 * @param report - Validation report
 * @returns Markdown string
 */
function generateMarkdownReport(report: ValidationReport): string {
  const { summary, results, improvements, metrics } = report;

  const statusEmoji = summary.passed ? '✅' : '❌';
  const lines: string[] = [
    '# Issue #118 Quality Validation Report',
    '',
    `**Generated**: ${summary.generatedAt.toISOString()}`,
    `**Environment**: ${metrics.environment}`,
    `**Overall Status**: ${statusEmoji} ${summary.passed ? 'PASSED' : 'FAILED'}`,
    `**Score**: ${summary.score.toFixed(1)}% (${summary.passedCount}/${summary.passedCount + summary.failedCount} metrics passing)`,
    '',
    '---',
    '',
    '## Metric Results',
    '',
    '| Metric | Baseline | Target | Current | Status | Improvement |',
    '|--------|----------|--------|---------|--------|-------------|'
  ];

  for (const result of results) {
    const isSpeedMetric = result.metric === 'cicdSpeedMultiplier';
    const formatValue = isSpeedMetric ? formatMultiplier : formatPercentage;
    const statusEmoji = result.passed ? '✅' : '❌';

    lines.push(
      `| ${result.metric} | ${formatValue(result.baseline)} | ${formatValue(result.target)} | ${formatValue(result.value)} | ${statusEmoji} | ${result.improvement >= 0 ? '+' : ''}${result.improvement.toFixed(1)}% |`
    );
  }

  lines.push('', '---', '', '## Metric Details', '');

  for (const result of results) {
    const statusEmoji = result.passed ? '✅' : '❌';
    lines.push(
      `### ${statusEmoji} ${result.metric}`,
      '',
      result.description,
      '',
      `- **Current**: ${result.metric === 'cicdSpeedMultiplier' ? formatMultiplier(result.value) : formatPercentage(result.value)}`,
      `- **Target**: ${result.metric === 'cicdSpeedMultiplier' ? formatMultiplier(result.target) : formatPercentage(result.target)}`,
      `- **Baseline**: ${result.metric === 'cicdSpeedMultiplier' ? formatMultiplier(result.baseline) : formatPercentage(result.baseline)}`,
      `- **Improvement**: ${result.improvement >= 0 ? '+' : ''}${result.improvement.toFixed(1)}%`,
      ''
    );
  }

  lines.push('---', '', '## Summary', '');

  if (summary.passed) {
    lines.push(
      '🎉 **All metrics meet or exceed issue #118 targets!**',
      '',
      'The self-learning AQE fleet upgrade is performing as expected.'
    );
  } else {
    lines.push(
      '⚠️ **Some metrics are below target:**',
      ''
    );

    for (const result of results.filter(r => !r.passed)) {
      const gap = result.target - result.value;
      const isSpeedMetric = result.metric === 'cicdSpeedMultiplier';
      const formatValue = isSpeedMetric ? formatMultiplier : formatPercentage;
      lines.push(`- **${result.metric}**: ${formatValue(result.value)} (${formatValue(gap)} below target)`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate JSON report for programmatic consumption
 *
 * @param report - Validation report
 * @returns JSON string
 */
export function generateJsonReport(report: ValidationReport): string {
  return JSON.stringify({
    summary: report.summary,
    results: report.results,
    improvements: report.improvements,
    metrics: report.metrics,
    targets: report.targets,
    baseline: report.baseline
  }, null, 2);
}

/**
 * Generate JUnit XML report for CI/CD integration
 *
 * @param report - Validation report
 * @returns JUnit XML string
 */
export function generateJUnitReport(report: ValidationReport): string {
  const { summary, results } = report;

  const testCases = results.map(result => {
    const passed = result.passed;
    const testName = `test_${result.metric}_meets_target`;
    const className = 'LearningQualityValidation';

    if (passed) {
      return `    <testcase name="${testName}" classname="${className}" time="0.001"/>`;
    } else {
      const message = `Expected ${result.metric} to be at least ${result.target}, but got ${result.value}`;
      return `    <testcase name="${testName}" classname="${className}" time="0.001">
      <failure message="${message}" type="AssertionError">${message}</failure>
    </testcase>`;
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="Issue118QualityValidation" tests="${results.length}" failures="${summary.failedCount}" errors="0" time="0.001">
${testCases.join('\n')}
</testsuite>`;
}
