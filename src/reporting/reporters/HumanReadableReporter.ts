/**
 * Human-Readable Reporter
 *
 * Generates human-friendly console output with colors, formatting,
 * and clear visual hierarchy for quality check results.
 *
 * @module reporting/reporters/HumanReadableReporter
 * @version 1.0.0
 */

import chalk from 'chalk';
import {
  Reporter,
  ReporterConfig,
  ReportFormat,
  ReporterOutput,
  AggregatedResults,
  ExecutionStatus
} from '../types';

/**
 * ANSI color utilities (fallback if chalk is not available)
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

/**
 * Human-Readable Reporter
 *
 * @example
 * ```typescript
 * const reporter = new HumanReadableReporter({ useColors: true });
 * const output = reporter.report(aggregatedResults);
 * console.log(output.content);
 * ```
 */
export class HumanReadableReporter implements Reporter {
  private config: ReporterConfig;
  private useColors: boolean;

  constructor(config: Partial<ReporterConfig> = {}) {
    this.config = {
      format: 'human',
      detailLevel: config.detailLevel || 'detailed',
      useColors: config.useColors !== undefined ? config.useColors : true,
      includeTimestamps: config.includeTimestamps !== undefined ? config.includeTimestamps : true,
      includeMetadata: config.includeMetadata !== undefined ? config.includeMetadata : true
    };
    this.useColors = (this.config.useColors ?? true) && this.supportsColor();
  }

  /**
   * Generate human-readable report
   */
  report(results: AggregatedResults): ReporterOutput {
    const startTime = Date.now();
    const lines: string[] = [];

    // Header
    lines.push(...this.generateHeader(results));
    lines.push('');

    // Summary
    lines.push(...this.generateSummary(results));
    lines.push('');

    // Test Results
    lines.push(...this.generateTestResults(results));
    lines.push('');

    // Coverage (if available)
    if (results.coverage) {
      lines.push(...this.generateCoverage(results));
      lines.push('');
    }

    // Quality Metrics (if available)
    if (results.qualityMetrics) {
      lines.push(...this.generateQualityMetrics(results));
      lines.push('');
    }

    // Security (if available)
    if (results.security) {
      lines.push(...this.generateSecurity(results));
      lines.push('');
    }

    // Performance (if available)
    if (results.performance && this.config.detailLevel !== 'summary') {
      lines.push(...this.generatePerformance(results));
      lines.push('');
    }

    // Recommendations
    if (results.summary.recommendations.length > 0) {
      lines.push(...this.generateRecommendations(results));
      lines.push('');
    }

    // Footer
    lines.push(...this.generateFooter(results));

    const content = lines.join('\n');
    const generationDuration = Date.now() - startTime;

    return {
      format: 'human',
      content,
      timestamp: new Date().toISOString(),
      size: Buffer.byteLength(content, 'utf8'),
      generationDuration
    };
  }

  /**
   * Generate header
   */
  private generateHeader(results: AggregatedResults): string[] {
    const lines: string[] = [];
    const width = 80;

    lines.push(this.hr('=', width));
    lines.push(this.center('QUALITY CHECK REPORT', width));

    if (results.project.name) {
      lines.push(this.center(results.project.name, width));
    }

    if (this.config.includeTimestamps) {
      lines.push(this.center(new Date(results.timestamp).toLocaleString(), width));
    }

    lines.push(this.hr('=', width));

    return lines;
  }

  /**
   * Generate summary section
   */
  private generateSummary(results: AggregatedResults): string[] {
    const lines: string[] = [];

    lines.push(this.sectionTitle('SUMMARY'));
    lines.push('');

    // Overall Status
    const statusIcon = this.getStatusIcon(results.status);
    const statusColor = this.getStatusColor(results.status);
    lines.push(
      `  ${statusIcon} Overall Status: ${this.colorize(
        results.status.toUpperCase(),
        statusColor
      )}`
    );
    lines.push(`  ${this.dim(results.summary.message)}`);
    lines.push('');

    // Key Metrics
    const metrics = [
      ['Tests Passed', `${results.testResults.passed}/${results.testResults.total}`, this.getTestStatusColor(results.testResults.passRate)],
      ['Pass Rate', `${(results.testResults.passRate * 100).toFixed(1)}%`, this.getTestStatusColor(results.testResults.passRate)],
      ['Coverage', results.coverage ? `${results.coverage.overall.toFixed(1)}%` : 'N/A', results.coverage ? this.getCoverageColor(results.coverage.overall) : 'gray'],
      ['Quality Score', results.qualityMetrics ? `${results.qualityMetrics.score} (${results.qualityMetrics.grade})` : 'N/A', results.qualityMetrics ? this.getQualityColor(results.qualityMetrics.score) : 'gray'],
      ['Security Score', results.security ? `${results.security.score}` : 'N/A', results.security ? this.getSecurityColor(results.security.score) : 'gray']
    ];

    const maxLabelWidth = Math.max(...metrics.map(m => m[0].length));

    for (const [label, value, color] of metrics) {
      const paddedLabel = label.padEnd(maxLabelWidth);
      lines.push(`  ${this.dim(paddedLabel)} : ${this.colorize(value, color)}`);
    }

    // Deployment Ready
    lines.push('');
    const deployIcon = results.summary.deploymentReady ? '✓' : '✗';
    const deployColor = results.summary.deploymentReady ? 'green' : 'red';
    const deployText = results.summary.deploymentReady ? 'READY' : 'BLOCKED';
    lines.push(
      `  ${deployIcon} Deployment: ${this.colorize(deployText, deployColor)}`
    );

    return lines;
  }

  /**
   * Generate test results section
   */
  private generateTestResults(results: AggregatedResults): string[] {
    const lines: string[] = [];

    lines.push(this.sectionTitle('TEST RESULTS'));
    lines.push('');

    const { testResults } = results;

    // Test counts
    const data = [
      ['Total', testResults.total.toString()],
      ['Passed', this.colorize(testResults.passed.toString(), 'green')],
      ['Failed', testResults.failed > 0 ? this.colorize(testResults.failed.toString(), 'red') : '0'],
      ['Skipped', testResults.skipped.toString()],
    ];

    if (testResults.flaky !== undefined && testResults.flaky > 0) {
      data.push(['Flaky', this.colorize(testResults.flaky.toString(), 'yellow')]);
    }

    data.push(['Duration', `${(testResults.duration / 1000).toFixed(2)}s`]);

    lines.push(...this.formatKeyValue(data));

    // Progress bar
    if (testResults.total > 0) {
      lines.push('');
      lines.push('  ' + this.progressBar(testResults.passRate, 40));
    }

    // Failed tests detail
    if (this.config.detailLevel !== 'summary' && testResults.failed > 0) {
      lines.push('');
      lines.push(this.bold('  Failed Tests:'));
      const failedTests = testResults.tests
        .filter(t => t.status === 'failed')
        .slice(0, 10);

      for (const test of failedTests) {
        lines.push(`    ${this.colorize('✗', 'red')} ${test.name}`);
        if (test.error) {
          lines.push(`      ${this.dim(this.truncate(test.error, 80))}`);
        }
      }

      if (testResults.failed > 10) {
        lines.push(`    ${this.dim(`... and ${testResults.failed - 10} more`)}`);
      }
    }

    return lines;
  }

  /**
   * Generate coverage section
   */
  private generateCoverage(results: AggregatedResults): string[] {
    const lines: string[] = [];

    if (!results.coverage) {
      return lines;
    }

    lines.push(this.sectionTitle('CODE COVERAGE'));
    lines.push('');

    const { coverage } = results;

    const data = [
      ['Overall', `${coverage.overall.toFixed(1)}%`, this.getCoverageBar(coverage.overall)],
      ['Lines', `${coverage.lines.percentage.toFixed(1)}%`, this.getCoverageBar(coverage.lines.percentage)],
      ['Branches', `${coverage.branches.percentage.toFixed(1)}%`, this.getCoverageBar(coverage.branches.percentage)],
      ['Functions', `${coverage.functions.percentage.toFixed(1)}%`, this.getCoverageBar(coverage.functions.percentage)],
      ['Statements', `${coverage.statements.percentage.toFixed(1)}%`, this.getCoverageBar(coverage.statements.percentage)]
    ];

    for (const [label, value, bar] of data) {
      lines.push(`  ${label.padEnd(12)} ${value.padStart(7)} ${bar}`);
    }

    // Coverage trend
    if (coverage.trend) {
      lines.push('');
      const trendIcon = coverage.trend === 'improving' ? '↗' : coverage.trend === 'degrading' ? '↘' : '→';
      const trendColor = coverage.trend === 'improving' ? 'green' : coverage.trend === 'degrading' ? 'red' : 'gray';
      lines.push(`  Trend: ${this.colorize(trendIcon + ' ' + coverage.trend, trendColor)}`);
    }

    return lines;
  }

  /**
   * Generate quality metrics section
   */
  private generateQualityMetrics(results: AggregatedResults): string[] {
    const lines: string[] = [];

    if (!results.qualityMetrics) {
      return lines;
    }

    lines.push(this.sectionTitle('QUALITY METRICS'));
    lines.push('');

    const { qualityMetrics } = results;

    lines.push(`  Overall Score: ${this.colorize(qualityMetrics.score.toString(), this.getQualityColor(qualityMetrics.score))} / 100 (Grade ${this.bold(qualityMetrics.grade)})`);
    lines.push('');

    const data = [
      ['Maintainability', qualityMetrics.codeQuality.maintainabilityIndex.toString()],
      ['Complexity', qualityMetrics.codeQuality.cyclomaticComplexity.toString()],
      ['Technical Debt', `${qualityMetrics.codeQuality.technicalDebt}h`],
      ['Code Smells', qualityMetrics.codeQuality.codeSmells.toString()],
      ['Duplications', `${qualityMetrics.codeQuality.duplications.toFixed(1)}%`]
    ];

    lines.push(...this.formatKeyValue(data));

    if (qualityMetrics.gates) {
      lines.push('');
      lines.push(this.bold('  Quality Gates:'));
      for (const gate of qualityMetrics.gates.slice(0, 5)) {
        const icon = gate.status === 'passed' ? '✓' : '✗';
        const color = gate.status === 'passed' ? 'green' : 'red';
        lines.push(`    ${this.colorize(icon, color)} ${gate.name}: ${gate.message}`);
      }
    }

    return lines;
  }

  /**
   * Generate security section
   */
  private generateSecurity(results: AggregatedResults): string[] {
    const lines: string[] = [];

    if (!results.security) {
      return lines;
    }

    lines.push(this.sectionTitle('SECURITY'));
    lines.push('');

    const { security } = results;

    lines.push(`  Security Score: ${this.colorize(security.score.toString(), this.getSecurityColor(security.score))} / 100`);
    lines.push('');

    const data = [
      ['Critical', security.summary.critical > 0 ? this.colorize(security.summary.critical.toString(), 'red') : '0'],
      ['High', security.summary.high > 0 ? this.colorize(security.summary.high.toString(), 'yellow') : '0'],
      ['Medium', security.summary.medium.toString()],
      ['Low', security.summary.low.toString()],
      ['Info', security.summary.info.toString()],
      ['Total', security.total.toString()]
    ];

    lines.push(...this.formatKeyValue(data));

    // Show critical vulnerabilities
    if (security.summary.critical > 0 && security.vulnerabilities) {
      lines.push('');
      lines.push(this.colorize('  CRITICAL VULNERABILITIES:', 'red'));
      const critical = security.vulnerabilities.filter(v => v.severity === 'critical').slice(0, 5);
      for (const vuln of critical) {
        lines.push(`    • ${this.bold(vuln.title)}`);
        lines.push(`      ${this.dim(this.truncate(vuln.description, 80))}`);
        if (vuln.file) {
          lines.push(`      ${this.dim(`File: ${vuln.file}`)}`);
        }
      }
    }

    return lines;
  }

  /**
   * Generate performance section
   */
  private generatePerformance(results: AggregatedResults): string[] {
    const lines: string[] = [];

    if (!results.performance) {
      return lines;
    }

    lines.push(this.sectionTitle('PERFORMANCE'));
    lines.push('');

    const { performance } = results;

    const data = [
      ['Response Time (P50)', `${performance.responseTime.median.toFixed(2)}ms`],
      ['Response Time (P95)', `${performance.responseTime.p95.toFixed(2)}ms`],
      ['Response Time (P99)', `${performance.responseTime.p99.toFixed(2)}ms`],
      ['Throughput', `${performance.throughput.toFixed(2)} req/s`],
      ['Error Rate', `${(performance.errorRate * 100).toFixed(2)}%`],
      ['CPU Usage', `${performance.resources.cpu.toFixed(1)}%`],
      ['Memory Usage', `${performance.resources.memory.toFixed(1)}MB`]
    ];

    lines.push(...this.formatKeyValue(data));

    return lines;
  }

  /**
   * Generate recommendations section
   */
  private generateRecommendations(results: AggregatedResults): string[] {
    const lines: string[] = [];

    lines.push(this.sectionTitle('RECOMMENDATIONS'));
    lines.push('');

    for (let i = 0; i < results.summary.recommendations.length; i++) {
      lines.push(`  ${i + 1}. ${results.summary.recommendations[i]}`);
    }

    return lines;
  }

  /**
   * Generate footer
   */
  private generateFooter(results: AggregatedResults): string[] {
    const lines: string[] = [];
    const width = 80;

    lines.push(this.hr('-', width));

    if (this.config.includeMetadata) {
      const duration = (results.metadata.duration / 1000).toFixed(2);
      lines.push(this.dim(this.center(`Execution ID: ${results.executionId}`, width)));
      lines.push(this.dim(this.center(`Completed in ${duration}s`, width)));
    }

    lines.push(this.hr('=', width));

    return lines;
  }

  // ==================== Utility Methods ====================

  getFormat(): ReportFormat {
    return 'human';
  }

  validateConfig(config: ReporterConfig): boolean {
    return config.format === 'human';
  }

  /**
   * Horizontal rule
   */
  private hr(char: string, width: number): string {
    return char.repeat(width);
  }

  /**
   * Center text
   */
  private center(text: string, width: number): string {
    const padding = Math.max(0, width - text.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
  }

  /**
   * Section title
   */
  private sectionTitle(title: string): string {
    return this.bold(this.colorize(`── ${title} `, 'cyan')) + this.dim('─'.repeat(80 - title.length - 4));
  }

  /**
   * Format key-value pairs
   */
  private formatKeyValue(data: string[][]): string[] {
    const maxKeyWidth = Math.max(...data.map(([key]) => key.length));
    return data.map(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyWidth);
      return `  ${this.dim(paddedKey)} : ${value}`;
    });
  }

  /**
   * Progress bar
   */
  private progressBar(progress: number, width: number): string {
    const filled = Math.round(progress * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percentage = (progress * 100).toFixed(1);
    const color = this.getProgressColor(progress);
    return `${this.colorize(bar, color)} ${percentage}%`;
  }

  /**
   * Coverage bar
   */
  private getCoverageBar(percentage: number): string {
    return this.progressBar(percentage / 100, 20);
  }

  /**
   * Truncate text
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Colorize text
   */
  private colorize(text: string, color: string): string {
    if (!this.useColors) return text;

    const colorCode = (colors as any)[color] || colors.reset;
    return `${colorCode}${text}${colors.reset}`;
  }

  /**
   * Bold text
   */
  private bold(text: string): string {
    if (!this.useColors) return text;
    return `${colors.bold}${text}${colors.reset}`;
  }

  /**
   * Dim text
   */
  private dim(text: string): string {
    if (!this.useColors) return text;
    return `${colors.dim}${text}${colors.reset}`;
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: ExecutionStatus): string {
    const icons = {
      success: '✓',
      warning: '⚠',
      failure: '✗',
      error: '⚠'
    };
    return icons[status];
  }

  /**
   * Get status color
   */
  private getStatusColor(status: ExecutionStatus): string {
    const colors = {
      success: 'green',
      warning: 'yellow',
      failure: 'red',
      error: 'red'
    };
    return colors[status];
  }

  /**
   * Get test status color
   */
  private getTestStatusColor(passRate: number): string {
    if (passRate >= 0.95) return 'green';
    if (passRate >= 0.85) return 'yellow';
    return 'red';
  }

  /**
   * Get coverage color
   */
  private getCoverageColor(percentage: number): string {
    if (percentage >= 80) return 'green';
    if (percentage >= 60) return 'yellow';
    return 'red';
  }

  /**
   * Get quality color
   */
  private getQualityColor(score: number): string {
    if (score >= 85) return 'green';
    if (score >= 70) return 'yellow';
    return 'red';
  }

  /**
   * Get security color
   */
  private getSecurityColor(score: number): string {
    if (score >= 90) return 'green';
    if (score >= 70) return 'yellow';
    return 'red';
  }

  /**
   * Get progress color
   */
  private getProgressColor(progress: number): string {
    if (progress >= 0.8) return 'green';
    if (progress >= 0.6) return 'yellow';
    return 'red';
  }

  /**
   * Check if terminal supports color
   */
  private supportsColor(): boolean {
    if (typeof process === 'undefined') return false;
    if (process.env.NO_COLOR) return false;
    if (process.env.FORCE_COLOR) return true;
    if (process.platform === 'win32') return true;
    if (process.stdout && !process.stdout.isTTY) return false;
    return true;
  }
}
