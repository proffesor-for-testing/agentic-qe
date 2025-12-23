/**
 * Output Formatter Implementation
 *
 * Complete implementation of OutputFormatter interface with AI mode detection,
 * JSON schema compliance, and streaming support.
 *
 * @module output/OutputFormatterImpl
 * @version 1.0.0
 */

import crypto from 'crypto';
import {
  OutputFormatter,
  OutputMode,
  OutputType,
  ExecutionStatus,
  ExecutionMetadata,
  BaseAIOutput,
  TestResultsOutput,
  TestResultsData,
  CoverageReportOutput,
  CoverageReportData,
  AgentStatusOutput,
  AgentStatusData,
  QualityMetricsOutput,
  QualityMetricsData,
  ActionSuggestion,
  OutputWarning,
  OutputError,
  OutputModeDetector,
  SCHEMA_VERSION
} from './OutputFormatter';
import { AIActionSuggester } from './AIActionSuggester';

/**
 * Concrete implementation of OutputFormatter
 */
export class OutputFormatterImpl implements OutputFormatter {
  private schemaVersion: string;
  private actionSuggester: AIActionSuggester;

  constructor(schemaVersion: string = SCHEMA_VERSION) {
    this.schemaVersion = schemaVersion;
    this.actionSuggester = new AIActionSuggester();
  }

  /**
   * Format data for output
   */
  format(data: unknown, outputType: OutputType, mode: OutputMode = OutputMode.AUTO): string {
    const actualMode = mode === OutputMode.AUTO ? this.detectMode() : mode;

    if (actualMode === OutputMode.AI) {
      return this.formatAI(data, outputType);
    } else {
      return this.formatHuman(data, outputType);
    }
  }

  /**
   * Detect output mode based on environment
   */
  detectMode(): OutputMode {
    return OutputModeDetector.detectMode();
  }

  /**
   * Generate test results output
   */
  formatTestResults(results: TestResultsData, metadata: ExecutionMetadata): TestResultsOutput {
    const status = this.determineTestResultsStatus(results);
    const actionSuggestions = this.actionSuggester.generateTestResultActions(results);
    const warnings = this.extractTestWarnings(results);
    const errors = this.extractTestErrors(results);

    return {
      schemaVersion: this.schemaVersion,
      outputType: 'test_results',
      timestamp: new Date().toISOString(),
      executionId: this.generateExecutionId('test'),
      status,
      metadata,
      data: results,
      actionSuggestions,
      warnings,
      errors
    };
  }

  /**
   * Generate coverage report output
   */
  formatCoverageReport(
    coverage: CoverageReportData,
    metadata: ExecutionMetadata
  ): CoverageReportOutput {
    const status = this.determineCoverageStatus(coverage);
    const actionSuggestions = this.actionSuggester.generateCoverageReportActions(coverage);
    const warnings = this.extractCoverageWarnings(coverage);

    return {
      schemaVersion: this.schemaVersion,
      outputType: 'coverage_report',
      timestamp: new Date().toISOString(),
      executionId: this.generateExecutionId('coverage'),
      status,
      metadata,
      data: coverage,
      actionSuggestions,
      warnings,
      errors: []
    };
  }

  /**
   * Generate agent status output
   */
  formatAgentStatus(status: AgentStatusData, metadata: ExecutionMetadata): AgentStatusOutput {
    const executionStatus = this.determineAgentStatus(status);
    const actionSuggestions = this.generateAgentActionSuggestions(status);
    const warnings = this.extractAgentWarnings(status);
    const errors = this.extractAgentErrors(status);

    return {
      schemaVersion: this.schemaVersion,
      outputType: 'agent_status',
      timestamp: new Date().toISOString(),
      executionId: this.generateExecutionId('status'),
      status: executionStatus,
      metadata,
      data: status,
      actionSuggestions,
      warnings,
      errors
    };
  }

  /**
   * Generate quality metrics output
   */
  formatQualityMetrics(
    metrics: QualityMetricsData,
    metadata: ExecutionMetadata
  ): QualityMetricsOutput {
    const status = this.determineQualityStatus(metrics);
    const actionSuggestions = this.actionSuggester.generateQualityMetricsActions(metrics);
    const warnings = this.extractQualityWarnings(metrics);

    return {
      schemaVersion: this.schemaVersion,
      outputType: 'quality_metrics',
      timestamp: new Date().toISOString(),
      executionId: this.generateExecutionId('quality'),
      status,
      metadata,
      data: metrics,
      actionSuggestions,
      warnings,
      errors: []
    };
  }

  /**
   * Generate action suggestions
   */
  generateActionSuggestions(data: unknown, outputType: OutputType): ActionSuggestion[] {
    switch (outputType) {
      case 'test_results':
        return this.actionSuggester.generateTestResultActions(data as TestResultsData);
      case 'coverage_report':
        return this.actionSuggester.generateCoverageReportActions(data as CoverageReportData);
      case 'quality_metrics':
        return this.actionSuggester.generateQualityMetricsActions(data as QualityMetricsData);
      default:
        return [];
    }
  }

  /**
   * Check schema version compatibility
   */
  isCompatibleVersion(outputVersion: string, requiredVersion: string): boolean {
    const [outMajor] = outputVersion.split('.').map(Number);
    const [reqMajor] = requiredVersion.split('.').map(Number);

    // Only major version must match
    return outMajor === reqMajor;
  }

  // ==================== Private Formatting Methods ====================

  /**
   * Format data as AI-friendly JSON
   */
  private formatAI(data: unknown, outputType: OutputType): string {
    const aiOutput = this.generateAIOutput(data, outputType);

    // Pretty-print for debugging if requested
    if (OutputModeDetector.isPrettyPrintEnabled()) {
      return JSON.stringify(aiOutput, null, 2);
    }

    // Compact JSON for production
    return JSON.stringify(aiOutput);
  }

  /**
   * Format data as human-readable text
   */
  private formatHuman(data: unknown, outputType: OutputType): string {
    switch (outputType) {
      case 'test_results':
        return this.formatTestResultsHuman(data as TestResultsData);
      case 'coverage_report':
        return this.formatCoverageReportHuman(data as CoverageReportData);
      case 'agent_status':
        return this.formatAgentStatusHuman(data as AgentStatusData);
      case 'quality_metrics':
        return this.formatQualityMetricsHuman(data as QualityMetricsData);
      default:
        return String(data);
    }
  }

  /**
   * Generate AI output structure
   */
  private generateAIOutput(data: unknown, outputType: OutputType): BaseAIOutput {
    const metadata: ExecutionMetadata = {
      agentId: 'agentic-qe',
      agentVersion: '2.3.5',
      duration: 0,
      environment: (process.env.NODE_ENV as any) || 'development'
    };

    switch (outputType) {
      case 'test_results':
        return this.formatTestResults(data as TestResultsData, metadata);
      case 'coverage_report':
        return this.formatCoverageReport(data as CoverageReportData, metadata);
      case 'agent_status':
        return this.formatAgentStatus(data as AgentStatusData, metadata);
      case 'quality_metrics':
        return this.formatQualityMetrics(data as QualityMetricsData, metadata);
      default:
        throw new Error(`Unsupported output type: ${outputType}`);
    }
  }

  // ==================== Human-Readable Formatters ====================

  /**
   * Format test results as human-readable text
   */
  private formatTestResultsHuman(data: TestResultsData): string {
    const { summary, failures, flaky } = data;
    const lines: string[] = [];

    lines.push('================================================================================');
    lines.push('Test Results');
    lines.push('================================================================================\n');

    lines.push('Summary:');
    lines.push(`  Total:   ${summary.total}`);
    lines.push(`  Passed:  ${summary.passed} (${summary.passRate.toFixed(2)}%)`);
    lines.push(`  Failed:  ${summary.failed} (${summary.failureRate.toFixed(2)}%)`);
    lines.push(`  Skipped: ${summary.skipped}`);
    if (summary.flaky) {
      lines.push(`  Flaky:   ${summary.flaky} (${summary.flakyRate?.toFixed(2)}%)`);
    }
    lines.push(`  Duration: ${summary.duration}ms\n`);

    if (failures.length > 0) {
      lines.push('Failures:');
      failures.forEach((failure, idx) => {
        lines.push(`  ${idx + 1}. ${failure.suiteName}: ${failure.testName}`);
        lines.push(`     File: ${failure.file}:${failure.line}`);
        lines.push(`     Error: ${failure.error.message}`);
        lines.push('');
      });
    }

    if (flaky.length > 0) {
      lines.push('Flaky Tests:');
      flaky.forEach((test, idx) => {
        lines.push(`  ${idx + 1}. ${test.suiteName}: ${test.testName}`);
        lines.push(`     File: ${test.file}:${test.line}`);
        lines.push(`     Flakiness: ${(test.flakinessScore * 100).toFixed(2)}%`);
        lines.push('');
      });
    }

    lines.push('================================================================================');

    return lines.join('\n');
  }

  /**
   * Format coverage report as human-readable text
   */
  private formatCoverageReportHuman(data: CoverageReportData): string {
    const { summary, gaps } = data;
    const lines: string[] = [];

    lines.push('================================================================================');
    lines.push('Coverage Report');
    lines.push('================================================================================\n');

    lines.push('Summary:');
    lines.push(`  Overall:    ${summary.overall.toFixed(2)}%`);
    lines.push(`  Lines:      ${summary.lines.percentage.toFixed(2)}% (${summary.lines.covered}/${summary.lines.total})`);
    lines.push(`  Branches:   ${summary.branches.percentage.toFixed(2)}% (${summary.branches.covered}/${summary.branches.total})`);
    lines.push(`  Functions:  ${summary.functions.percentage.toFixed(2)}% (${summary.functions.covered}/${summary.functions.total})`);
    lines.push(`  Statements: ${summary.statements.percentage.toFixed(2)}% (${summary.statements.covered}/${summary.statements.total})\n`);

    if (gaps.length > 0) {
      lines.push('Critical Gaps:');
      gaps.slice(0, 5).forEach((gap, idx) => {
        lines.push(`  ${idx + 1}. ${gap.file}`);
        lines.push(`     Priority: ${gap.priority.toUpperCase()}`);
        lines.push(`     Coverage: ${gap.coverage.lines.toFixed(2)}%`);
        lines.push(`     Reason: ${gap.reason}`);
        lines.push('');
      });
    }

    lines.push('================================================================================');

    return lines.join('\n');
  }

  /**
   * Format agent status as human-readable text
   */
  private formatAgentStatusHuman(data: AgentStatusData): string {
    const { agent } = data;
    const lines: string[] = [];

    lines.push('================================================================================');
    lines.push(`Agent Status: ${agent.name}`);
    lines.push('================================================================================\n');

    lines.push('Information:');
    lines.push(`  ID:      ${agent.id}`);
    lines.push(`  Version: ${agent.version}`);
    lines.push(`  Status:  ${agent.status}`);
    lines.push(`  Health:  ${agent.health}\n`);

    lines.push('Statistics:');
    lines.push(`  Total Executions: ${agent.stats.totalExecutions}`);
    lines.push(`  Success Rate:     ${agent.stats.successRate.toFixed(2)}%`);
    lines.push(`  Avg Duration:     ${agent.stats.averageDuration}ms`);
    if (agent.stats.testsGenerated) {
      lines.push(`  Tests Generated:  ${agent.stats.testsGenerated}`);
    }

    lines.push('\n================================================================================');

    return lines.join('\n');
  }

  /**
   * Format quality metrics as human-readable text
   */
  private formatQualityMetricsHuman(data: QualityMetricsData): string {
    const lines: string[] = [];

    lines.push('================================================================================');
    lines.push('Quality Metrics Report');
    lines.push('================================================================================\n');

    lines.push(`Overall Score: ${data.overallScore.toFixed(2)} (Grade: ${data.grade})\n`);

    lines.push('Dimensions:');
    Object.entries(data.dimensions).forEach(([name, dimension]) => {
      lines.push(`  ${name}: ${dimension.score.toFixed(2)} (${dimension.status})`);
    });

    lines.push(`\nQuality Gates: ${data.qualityGates.passed}/${data.qualityGates.total} passed`);

    if (data.qualityGates.failed > 0) {
      lines.push('\nFailed Gates:');
      data.qualityGates.gates
        .filter(gate => gate.status === 'failed')
        .forEach(gate => {
          lines.push(`  - ${gate.name}: ${gate.actualValue} (threshold: ${gate.threshold})`);
        });
    }

    lines.push('\n================================================================================');

    return lines.join('\n');
  }

  // ==================== Status Determination ====================

  /**
   * Determine test results status
   */
  private determineTestResultsStatus(results: TestResultsData): ExecutionStatus {
    if (results.failures.length > 0) {
      return 'failure';
    }
    if (results.flaky && results.flaky.length > 0) {
      return 'warning';
    }
    if (results.summary.skipped > 0) {
      return 'warning';
    }
    return 'success';
  }

  /**
   * Determine coverage status
   */
  private determineCoverageStatus(coverage: CoverageReportData): ExecutionStatus {
    if (coverage.summary.overall < 60) {
      return 'failure';
    }
    if (coverage.summary.overall < 80) {
      return 'warning';
    }
    if (coverage.gaps.some(gap => gap.priority === 'critical')) {
      return 'warning';
    }
    return 'success';
  }

  /**
   * Determine agent status
   */
  private determineAgentStatus(status: AgentStatusData): ExecutionStatus {
    if (status.agent.health === 'unhealthy') {
      return 'error';
    }
    if (status.agent.health === 'degraded') {
      return 'warning';
    }
    if (status.dependencies.required.some(dep => dep.status === 'unhealthy')) {
      return 'error';
    }
    return 'success';
  }

  /**
   * Determine quality status
   */
  private determineQualityStatus(metrics: QualityMetricsData): ExecutionStatus {
    if (metrics.overallScore < 60) {
      return 'failure';
    }
    if (metrics.qualityGates.failed > 0) {
      return 'warning';
    }
    if (metrics.overallScore < 80) {
      return 'warning';
    }
    return 'success';
  }

  // ==================== Warning & Error Extraction ====================

  /**
   * Extract test warnings
   */
  private extractTestWarnings(results: TestResultsData): OutputWarning[] {
    const warnings: OutputWarning[] = [];

    if (results.summary.skipped > 0) {
      warnings.push({
        code: 'SKIPPED_TESTS',
        message: `${results.summary.skipped} test${results.summary.skipped > 1 ? 's are' : ' is'} skipped`,
        severity: 'warning',
        details: 'Skipped tests may hide regressions. Review and enable them.'
      });
    }

    if (results.flaky && results.flaky.length > 0) {
      warnings.push({
        code: 'FLAKY_TESTS',
        message: `${results.flaky.length} flaky test${results.flaky.length > 1 ? 's' : ''} detected`,
        severity: 'warning',
        details: 'Flaky tests reduce confidence in test suite. Stabilize them.'
      });
    }

    return warnings;
  }

  /**
   * Extract test errors
   */
  private extractTestErrors(results: TestResultsData): OutputError[] {
    return results.failures.map(failure => ({
      code: 'TEST_FAILURE',
      message: `${failure.suiteName}: ${failure.testName}`,
      stack: failure.error.stack,
      context: {
        file: failure.file,
        line: failure.line,
        duration: failure.duration,
        errorType: failure.error.type
      }
    }));
  }

  /**
   * Extract coverage warnings
   */
  private extractCoverageWarnings(coverage: CoverageReportData): OutputWarning[] {
    const warnings: OutputWarning[] = [];

    if (coverage.summary.overall < 80) {
      warnings.push({
        code: 'COVERAGE_BELOW_THRESHOLD',
        message: `Coverage (${coverage.summary.overall.toFixed(2)}%) is below project target (80%)`,
        severity: 'warning',
        details: `Need ${(80 - coverage.summary.overall).toFixed(2)}% improvement to reach target`
      });
    }

    if (coverage.gaps.some(gap => gap.priority === 'critical')) {
      const criticalCount = coverage.gaps.filter(gap => gap.priority === 'critical').length;
      warnings.push({
        code: 'CRITICAL_COVERAGE_GAPS',
        message: `${criticalCount} critical coverage gap${criticalCount > 1 ? 's' : ''} detected`,
        severity: 'warning',
        details: 'Critical paths lack sufficient test coverage'
      });
    }

    return warnings;
  }

  /**
   * Extract agent warnings
   */
  private extractAgentWarnings(status: AgentStatusData): OutputWarning[] {
    const warnings: OutputWarning[] = [];

    if (status.agent.health === 'degraded') {
      warnings.push({
        code: 'AGENT_DEGRADED',
        message: 'Agent health is degraded',
        severity: 'warning',
        details: 'Agent may experience reduced performance or reliability'
      });
    }

    if (status.dependencies.required.some(dep => dep.status === 'degraded')) {
      warnings.push({
        code: 'DEPENDENCY_DEGRADED',
        message: 'One or more required dependencies are degraded',
        severity: 'warning'
      });
    }

    return warnings;
  }

  /**
   * Extract agent errors
   */
  private extractAgentErrors(status: AgentStatusData): OutputError[] {
    const errors: OutputError[] = [];

    if (status.agent.health === 'unhealthy') {
      errors.push({
        code: 'AGENT_UNHEALTHY',
        message: 'Agent is unhealthy and may not function correctly',
        context: { agentId: status.agent.id }
      });
    }

    status.dependencies.required
      .filter(dep => dep.status === 'unhealthy')
      .forEach(dep => {
        errors.push({
          code: 'DEPENDENCY_UNHEALTHY',
          message: `Required dependency ${dep.service} is unhealthy`,
          context: { service: dep.service, version: dep.version }
        });
      });

    return errors;
  }

  /**
   * Extract quality warnings
   */
  private extractQualityWarnings(metrics: QualityMetricsData): OutputWarning[] {
    const warnings: OutputWarning[] = [];

    if (metrics.qualityGates.failed > 0) {
      warnings.push({
        code: 'QUALITY_GATE_FAILURE',
        message: `${metrics.qualityGates.failed} quality gate${metrics.qualityGates.failed > 1 ? 's' : ''} failed`,
        severity: 'warning',
        details: metrics.qualityGates.gates
          .filter(gate => gate.status === 'failed')
          .map(gate => gate.name)
          .join(', ')
      });
    }

    if (metrics.technicalDebt.total > 40) {
      warnings.push({
        code: 'HIGH_TECHNICAL_DEBT',
        message: `Technical debt is high (${metrics.technicalDebt.total} ${metrics.technicalDebt.unit})`,
        severity: 'warning'
      });
    }

    return warnings;
  }

  // ==================== Agent Action Suggestions ====================

  /**
   * Generate agent action suggestions
   */
  private generateAgentActionSuggestions(status: AgentStatusData): ActionSuggestion[] {
    const actions: ActionSuggestion[] = [];

    if (status.agent.health === 'healthy') {
      actions.push({
        action: 'agent_ready',
        priority: 'info',
        reason: 'Agent is healthy and ready for tasks',
        steps: [
          `Use agent: aqe execute --agent=${status.agent.id}`,
          `Check capabilities: aqe agent info ${status.agent.id}`,
          `View recent activity: aqe agent logs ${status.agent.id}`
        ],
        automation: {
          command: `aqe agent info ${status.agent.id}`,
          canAutoFix: false,
          confidence: 1.0
        }
      });
    }

    return actions;
  }

  // ==================== Utility Methods ====================

  /**
   * Generate deterministic execution ID
   */
  private generateExecutionId(type: string): string {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const hash = crypto.createHash('md5').update(`${type}-${timestamp}-${Math.random()}`).digest('hex').slice(0, 8);
    return `exec_${type}_${timestamp}_${hash}`;
  }
}

/**
 * Default singleton instance
 */
export const outputFormatter = new OutputFormatterImpl();
