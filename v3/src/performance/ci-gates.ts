/**
 * Agentic QE v3 - CI Performance Gates
 * Performance gates for continuous integration
 *
 * Issue #177 Targets:
 * - AG-UI streaming: <100ms p95
 * - A2A task submission: <200ms p95
 * - A2UI surface generation: <150ms p95
 */

import { BenchmarkResults, BenchmarkResult, PERFORMANCE_TARGETS } from './benchmarks.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Gate check result
 */
export interface GateCheckResult {
  /** Whether the gate passed */
  readonly passed: boolean;
  /** Gate name */
  readonly gate: string;
  /** Actual measured value */
  readonly actual: number;
  /** Target value */
  readonly target: number;
  /** Margin percentage above/below target (positive = under, negative = over) */
  readonly margin: number;
  /** Human-readable message */
  readonly message: string;
  /** Severity level */
  readonly severity: 'pass' | 'warn' | 'fail';
}

/**
 * CI Report
 */
export interface CIReport {
  /** Summary text */
  readonly summary: string;
  /** All gate check results */
  readonly gates: GateCheckResult[];
  /** Prioritized recommendations */
  readonly recommendations: string[];
  /** Exit code (0 = success, 1 = failure, 2 = warning) */
  readonly exitCode: number;
  /** Timestamp */
  readonly timestamp: number;
  /** Environment info */
  readonly environment: {
    readonly nodeVersion: string;
    readonly platform: string;
    readonly ci: boolean;
  };
  /** Performance summary */
  readonly performance: {
    readonly totalTests: number;
    readonly passed: number;
    readonly failed: number;
    readonly warnings: number;
  };
}

/**
 * Gate configuration
 */
export interface GateConfig {
  /** AG-UI latency target in ms */
  readonly aguiLatencyTarget: number;
  /** A2A latency target in ms */
  readonly a2aLatencyTarget: number;
  /** A2UI latency target in ms */
  readonly a2uiLatencyTarget: number;
  /** Memory usage target in bytes */
  readonly memoryTarget: number;
  /** Throughput target in ops/sec */
  readonly throughputTarget: number;
  /** Warning threshold percentage (below target) */
  readonly warningThreshold: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_GATE_CONFIG: GateConfig = {
  aguiLatencyTarget: PERFORMANCE_TARGETS.aguiSSEStreaming.p95, // 100ms
  a2aLatencyTarget: PERFORMANCE_TARGETS.a2aTaskSubmission.p95, // 200ms
  a2uiLatencyTarget: PERFORMANCE_TARGETS.a2uiSurfaceGeneration.p95, // 150ms
  memoryTarget: PERFORMANCE_TARGETS.memoryPeak, // 4GB
  throughputTarget: PERFORMANCE_TARGETS.throughput, // 1000 ops/sec
  warningThreshold: 0.8, // Warn if > 80% of target
};

// ============================================================================
// CI Performance Gates Implementation
// ============================================================================

/**
 * CIPerformanceGates - Validates benchmark results against targets
 *
 * Features:
 * - Individual gate checks for each protocol
 * - Memory and throughput validation
 * - Warning thresholds
 * - CI report generation
 * - Exit code determination
 */
export class CIPerformanceGates {
  private readonly config: GateConfig;

  constructor(config: Partial<GateConfig> = {}) {
    this.config = { ...DEFAULT_GATE_CONFIG, ...config };
  }

  // ============================================================================
  // Main Check Methods
  // ============================================================================

  /**
   * Check all gates against benchmark results
   */
  checkAll(results: BenchmarkResults): GateCheckResult[] {
    const gates: GateCheckResult[] = [];

    // Find relevant benchmark results
    const aguiResult = this.findResult(results, 'AGUI SSE Streaming');
    const a2aResult = this.findResult(results, 'A2A Task Submission');
    const a2uiResult = this.findResult(results, 'A2UI Surface Generation');
    const memoryResult = this.findResult(results, 'Memory Under Load');
    const e2eResult = this.findResult(results, 'End-to-End Flow');

    // Check AG-UI latency
    if (aguiResult) {
      gates.push(this.checkAGUILatency(aguiResult.p95));
    }

    // Check A2A latency
    if (a2aResult) {
      gates.push(this.checkA2ALatency(a2aResult.p95));
    }

    // Check A2UI latency
    if (a2uiResult) {
      gates.push(this.checkA2UILatency(a2uiResult.p95));
    }

    // Check memory usage
    if (memoryResult && memoryResult.metadata?.memoryUsed) {
      gates.push(this.checkMemoryUsage(memoryResult.metadata.memoryUsed as number));
    }

    // Check throughput
    if (e2eResult) {
      gates.push(this.checkThroughput(e2eResult.opsPerSecond));
    }

    // Add individual benchmark checks
    for (const result of results.results) {
      if (result.target !== undefined) {
        gates.push(this.checkBenchmark(result));
      }
    }

    return gates;
  }

  // ============================================================================
  // Individual Gate Checks
  // ============================================================================

  /**
   * Check AG-UI latency gate
   */
  checkAGUILatency(p95: number): GateCheckResult {
    const target = this.config.aguiLatencyTarget;
    const margin = this.calculateMargin(p95, target);
    const passed = p95 <= target;
    const warn = p95 > target * this.config.warningThreshold && p95 <= target;

    return {
      passed,
      gate: 'AG-UI Streaming Latency',
      actual: p95,
      target,
      margin,
      message: this.formatMessage('AG-UI streaming', p95, target, 'ms'),
      severity: this.getSeverity(passed, warn),
    };
  }

  /**
   * Check A2A latency gate
   */
  checkA2ALatency(p95: number): GateCheckResult {
    const target = this.config.a2aLatencyTarget;
    const margin = this.calculateMargin(p95, target);
    const passed = p95 <= target;
    const warn = p95 > target * this.config.warningThreshold && p95 <= target;

    return {
      passed,
      gate: 'A2A Task Submission Latency',
      actual: p95,
      target,
      margin,
      message: this.formatMessage('A2A task submission', p95, target, 'ms'),
      severity: this.getSeverity(passed, warn),
    };
  }

  /**
   * Check A2UI latency gate
   */
  checkA2UILatency(p95: number): GateCheckResult {
    const target = this.config.a2uiLatencyTarget;
    const margin = this.calculateMargin(p95, target);
    const passed = p95 <= target;
    const warn = p95 > target * this.config.warningThreshold && p95 <= target;

    return {
      passed,
      gate: 'A2UI Surface Generation Latency',
      actual: p95,
      target,
      margin,
      message: this.formatMessage('A2UI surface generation', p95, target, 'ms'),
      severity: this.getSeverity(passed, warn),
    };
  }

  /**
   * Check memory usage gate
   */
  checkMemoryUsage(peak: number): GateCheckResult {
    const target = this.config.memoryTarget;
    const margin = this.calculateMargin(peak, target);
    const passed = peak < target;
    const warn = peak > target * this.config.warningThreshold && peak < target;

    const peakMB = peak / 1024 / 1024;
    const targetMB = target / 1024 / 1024;

    return {
      passed,
      gate: 'Memory Usage',
      actual: peak,
      target,
      margin,
      message: this.formatMessage('Memory usage', peakMB, targetMB, 'MB'),
      severity: this.getSeverity(passed, warn),
    };
  }

  /**
   * Check throughput gate
   */
  checkThroughput(opsPerSec: number): GateCheckResult {
    const target = this.config.throughputTarget;
    const margin = this.calculateMargin(target, opsPerSec); // Inverted for "higher is better"
    const passed = opsPerSec >= target;
    const warn = opsPerSec < target && opsPerSec >= target * this.config.warningThreshold;

    return {
      passed,
      gate: 'Throughput',
      actual: opsPerSec,
      target,
      margin: -margin, // Negate for consistency
      message: `Throughput: ${opsPerSec.toFixed(1)} ops/sec (target: >=${target} ops/sec) - ${passed ? 'PASS' : 'FAIL'}`,
      severity: this.getSeverity(passed, warn),
    };
  }

  /**
   * Check a specific benchmark result
   */
  checkBenchmark(result: BenchmarkResult): GateCheckResult {
    const target = result.target!;
    const p95 = result.p95;
    const margin = this.calculateMargin(p95, target);
    const passed = p95 <= target;
    const warn = p95 > target * this.config.warningThreshold && p95 <= target;

    return {
      passed,
      gate: result.name,
      actual: p95,
      target,
      margin,
      message: this.formatMessage(result.name, p95, target, 'ms'),
      severity: this.getSeverity(passed, warn),
    };
  }

  // ============================================================================
  // Report Generation
  // ============================================================================

  /**
   * Generate CI report from benchmark results
   */
  generateReport(results: BenchmarkResults): CIReport {
    const gates = this.checkAll(results);
    const passed = gates.filter((g) => g.severity === 'pass').length;
    const failed = gates.filter((g) => g.severity === 'fail').length;
    const warnings = gates.filter((g) => g.severity === 'warn').length;

    const exitCode = this.getExitCode(results);
    const recommendations = this.generateRecommendations(gates);

    const summary = this.generateSummary(gates, exitCode);

    return {
      summary,
      gates,
      recommendations,
      exitCode,
      timestamp: Date.now(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        ci: !!process.env.CI,
      },
      performance: {
        totalTests: gates.length,
        passed,
        failed,
        warnings,
      },
    };
  }

  /**
   * Get exit code based on results
   */
  getExitCode(results: BenchmarkResults): number {
    const gates = this.checkAll(results);
    const hasFail = gates.some((g) => g.severity === 'fail');
    const hasWarn = gates.some((g) => g.severity === 'warn');

    if (hasFail) return 1;
    if (hasWarn) return 2;
    return 0;
  }

  // ============================================================================
  // Report Formatting
  // ============================================================================

  /**
   * Format report as text
   */
  formatReportText(report: CIReport): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('AGENTIC QE v3 - PERFORMANCE REPORT');
    lines.push('='.repeat(60));
    lines.push('');

    // Summary
    lines.push('SUMMARY');
    lines.push('-'.repeat(40));
    lines.push(report.summary);
    lines.push('');

    // Results table
    lines.push('GATE RESULTS');
    lines.push('-'.repeat(40));

    for (const gate of report.gates) {
      const status = gate.severity === 'pass' ? '[PASS]' : gate.severity === 'warn' ? '[WARN]' : '[FAIL]';
      const margin = gate.margin >= 0 ? `+${gate.margin.toFixed(1)}%` : `${gate.margin.toFixed(1)}%`;
      lines.push(`${status} ${gate.gate}`);
      lines.push(`       Actual: ${gate.actual.toFixed(2)}, Target: ${gate.target}, Margin: ${margin}`);
    }
    lines.push('');

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('RECOMMENDATIONS');
      lines.push('-'.repeat(40));
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }

    // Environment
    lines.push('ENVIRONMENT');
    lines.push('-'.repeat(40));
    lines.push(`Node: ${report.environment.nodeVersion}`);
    lines.push(`Platform: ${report.environment.platform}`);
    lines.push(`CI: ${report.environment.ci}`);
    lines.push('');

    // Exit code
    lines.push('='.repeat(60));
    lines.push(`EXIT CODE: ${report.exitCode}`);
    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * Format report as markdown
   */
  formatReportMarkdown(report: CIReport): string {
    const lines: string[] = [];

    lines.push('# Agentic QE v3 - Performance Report');
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(report.summary);
    lines.push('');

    // Results table
    lines.push('## Gate Results');
    lines.push('');
    lines.push('| Status | Gate | Actual | Target | Margin |');
    lines.push('|--------|------|--------|--------|--------|');

    for (const gate of report.gates) {
      const status = gate.severity === 'pass' ? 'PASS' : gate.severity === 'warn' ? 'WARN' : 'FAIL';
      const emoji = gate.severity === 'pass' ? '`+`' : gate.severity === 'warn' ? '`~`' : '`-`';
      const margin = gate.margin >= 0 ? `+${gate.margin.toFixed(1)}%` : `${gate.margin.toFixed(1)}%`;
      lines.push(`| ${emoji} ${status} | ${gate.gate} | ${gate.actual.toFixed(2)} | ${gate.target} | ${margin} |`);
    }
    lines.push('');

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }

    // Environment
    lines.push('## Environment');
    lines.push('');
    lines.push(`- **Node:** ${report.environment.nodeVersion}`);
    lines.push(`- **Platform:** ${report.environment.platform}`);
    lines.push(`- **CI:** ${report.environment.ci}`);
    lines.push('');

    lines.push(`---`);
    lines.push(`**Exit Code:** \`${report.exitCode}\``);

    return lines.join('\n');
  }

  /**
   * Format report as JSON
   */
  formatReportJSON(report: CIReport): string {
    return JSON.stringify(report, null, 2);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private findResult(results: BenchmarkResults, name: string): BenchmarkResult | undefined {
    return results.results.find((r) => r.name === name);
  }

  private calculateMargin(actual: number, target: number): number {
    if (target === 0) return 0;
    return ((target - actual) / target) * 100;
  }

  private getSeverity(passed: boolean, warn: boolean): 'pass' | 'warn' | 'fail' {
    if (!passed) return 'fail';
    if (warn) return 'warn';
    return 'pass';
  }

  private formatMessage(name: string, actual: number, target: number, unit: string): string {
    const passed = actual <= target;
    const status = passed ? 'PASS' : 'FAIL';
    return `${name}: ${actual.toFixed(2)}${unit} (target: <=${target}${unit}) - ${status}`;
  }

  private generateSummary(gates: GateCheckResult[], exitCode: number): string {
    const passed = gates.filter((g) => g.severity === 'pass').length;
    const failed = gates.filter((g) => g.severity === 'fail').length;
    const warnings = gates.filter((g) => g.severity === 'warn').length;

    let status: string;
    if (exitCode === 0) {
      status = 'All performance gates passed!';
    } else if (exitCode === 1) {
      status = `Performance regression detected: ${failed} gate(s) failed.`;
    } else {
      status = `Performance within limits but ${warnings} warning(s) detected.`;
    }

    return `${status}\n\nTotal: ${gates.length} | Passed: ${passed} | Failed: ${failed} | Warnings: ${warnings}`;
  }

  private generateRecommendations(gates: GateCheckResult[]): string[] {
    const recommendations: string[] = [];

    const failedGates = gates.filter((g) => g.severity === 'fail');
    const warnGates = gates.filter((g) => g.severity === 'warn');

    for (const gate of failedGates) {
      if (gate.gate.includes('AG-UI')) {
        recommendations.push(
          `CRITICAL: AG-UI streaming latency (${gate.actual.toFixed(1)}ms) exceeds target (${gate.target}ms). ` +
          'Consider: event batching, object pooling, or reducing payload size.'
        );
      } else if (gate.gate.includes('A2A')) {
        recommendations.push(
          `CRITICAL: A2A task submission latency (${gate.actual.toFixed(1)}ms) exceeds target (${gate.target}ms). ` +
          'Consider: caching agent cards, optimizing JSON-RPC parsing, or reducing task complexity.'
        );
      } else if (gate.gate.includes('A2UI')) {
        recommendations.push(
          `CRITICAL: A2UI surface generation latency (${gate.actual.toFixed(1)}ms) exceeds target (${gate.target}ms). ` +
          'Consider: component pooling, lazy evaluation, or reducing component tree depth.'
        );
      } else if (gate.gate.includes('Memory')) {
        recommendations.push(
          `CRITICAL: Memory usage (${(gate.actual / 1024 / 1024).toFixed(0)}MB) exceeds target. ` +
          'Consider: implementing object pools, reducing cache sizes, or optimizing data structures.'
        );
      } else if (gate.gate.includes('Throughput')) {
        recommendations.push(
          `CRITICAL: Throughput (${gate.actual.toFixed(0)} ops/sec) below target (${gate.target} ops/sec). ` +
          'Consider: parallel execution, async optimization, or reducing synchronous operations.'
        );
      }
    }

    for (const gate of warnGates) {
      recommendations.push(
        `WARNING: ${gate.gate} is approaching its limit (${gate.actual.toFixed(1)} vs ${gate.target}). ` +
        'Monitor closely and consider proactive optimization.'
      );
    }

    return recommendations;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new CIPerformanceGates instance
 */
export function createCIGates(config?: Partial<GateConfig>): CIPerformanceGates {
  return new CIPerformanceGates(config);
}

// ============================================================================
// Exports
// ============================================================================

export { DEFAULT_GATE_CONFIG };
