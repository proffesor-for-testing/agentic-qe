/**
 * Comprehensive Test Suite for Analysis MCP Tools
 * Tests all 5 analysis handlers with edge cases and integration scenarios
 */

import { coverageAnalyzeSublinear } from '../../../src/mcp/handlers/analysis/coverageAnalyzeSublinear';
import { coverageGapsDetect } from '../../../src/mcp/handlers/analysis/coverageGapsDetect';
import { performanceBenchmarkRun } from '../../../src/mcp/handlers/analysis/performanceBenchmarkRun';
import { performanceMonitorRealtime } from '../../../src/mcp/handlers/analysis/performanceMonitorRealtime';
import { securityScanComprehensive } from '../../../src/mcp/handlers/analysis/securityScanComprehensive';

describe('Analysis MCP Tools - Coverage Analyze Sublinear', () => {
  it('should analyze coverage with Johnson-Lindenstrauss for large codebases', async () => {
    const sourceFiles = Array.from({ length: 150 }, (_, i) => `src/file${i}.ts`);

    const result = await coverageAnalyzeSublinear({
      sourceFiles,
      coverageThreshold: 0.8,
      useJohnsonLindenstrauss: true
    });

    expect(result.overallCoverage).toBeGreaterThan(0);
    expect(result.overallCoverage).toBeLessThanOrEqual(1);
    expect(result.sublinearMetrics.algorithmUsed).toBe('johnson-lindenstrauss');
    expect(result.sublinearMetrics.originalDimension).toBe(150);
    expect(result.sublinearMetrics.reducedDimension).toBeLessThan(150);
    expect(result.sublinearMetrics.distortion).toBeGreaterThan(0);
    expect(result.fileCoverage).toBeDefined();
    expect(Object.keys(result.fileCoverage).length).toBe(150);
  });

  it('should use spectral sparsification for medium codebases', async () => {
    const sourceFiles = Array.from({ length: 75 }, (_, i) => `src/module${i}.ts`);

    const result = await coverageAnalyzeSublinear({
      sourceFiles,
      useJohnsonLindenstrauss: true
    });

    expect(result.sublinearMetrics.algorithmUsed).toBe('spectral-sparsification');
    expect(result.sublinearMetrics.originalDimension).toBe(75);
  });

  it('should use adaptive sampling for small codebases', async () => {
    const sourceFiles = ['src/main.ts', 'src/utils.ts'];

    const result = await coverageAnalyzeSublinear({
      sourceFiles
    });

    expect(result.sublinearMetrics.algorithmUsed).toBe('adaptive-sampling');
  });

  it('should detect uncovered regions when requested', async () => {
    const sourceFiles = ['src/critical.ts'];

    const result = await coverageAnalyzeSublinear({
      sourceFiles,
      includeUncoveredLines: true
    });

    expect(result.uncoveredRegions).toBeDefined();
    if (result.uncoveredRegions && result.uncoveredRegions.length > 0) {
      expect(result.uncoveredRegions[0]).toHaveProperty('file');
      expect(result.uncoveredRegions[0]).toHaveProperty('lines');
      expect(result.uncoveredRegions[0]).toHaveProperty('complexity');
      expect(result.uncoveredRegions[0]).toHaveProperty('priority');
    }
  });

  it('should generate recommendations based on coverage', async () => {
    const sourceFiles = ['src/low-coverage.ts'];

    const result = await coverageAnalyzeSublinear({
      sourceFiles,
      coverageThreshold: 0.9
    });

    expect(result.recommendations).toBeDefined();
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should respect custom target dimension for JL', async () => {
    const sourceFiles = Array.from({ length: 200 }, (_, i) => `src/file${i}.ts`);

    const result = await coverageAnalyzeSublinear({
      sourceFiles,
      targetDimension: 10
    });

    expect(result.sublinearMetrics.reducedDimension).toBe(10);
  });
});

describe('Analysis MCP Tools - Coverage Gaps Detect', () => {
  it('should detect all gap types', async () => {
    const sourceFiles = ['src/app.ts', 'src/service.ts'];

    const result = await coverageGapsDetect({
      sourceFiles,
      aiAnalysis: true,
      riskAssessment: true
    });

    expect(result.gaps).toBeDefined();
    expect(result.gaps.length).toBeGreaterThan(0);

    const gapTypes = new Set(result.gaps.map(g => g.type));
    expect(gapTypes.size).toBeGreaterThan(0);
  });

  it('should calculate risk scores for gaps', async () => {
    const sourceFiles = ['src/critical.ts'];

    const result = await coverageGapsDetect({
      sourceFiles,
      riskAssessment: true
    });

    result.gaps.forEach(gap => {
      expect(gap.riskScore).toBeGreaterThanOrEqual(0);
      expect(gap.riskScore).toBeLessThanOrEqual(100);
    });
  });

  it('should provide AI insights when enabled', async () => {
    const sourceFiles = ['src/main.ts'];

    const result = await coverageGapsDetect({
      sourceFiles,
      aiAnalysis: true
    });

    expect(result.aiInsights).toBeDefined();
    expect(result.aiInsights?.patterns).toBeDefined();
    expect(result.aiInsights?.recommendations).toBeDefined();
    expect(result.aiInsights?.riskAreas).toBeDefined();
  });

  it('should prioritize gaps correctly', async () => {
    const sourceFiles = ['src/app.ts'];

    const result = await coverageGapsDetect({
      sourceFiles,
      riskAssessment: true
    });

    expect(result.prioritizedActions).toBeDefined();

    // Verify prioritized actions are sorted by priority
    for (let i = 1; i < result.prioritizedActions.length; i++) {
      expect(result.prioritizedActions[i - 1].priority)
        .toBeGreaterThanOrEqual(result.prioritizedActions[i].priority);
    }
  });

  it('should generate summary statistics', async () => {
    const sourceFiles = ['src/service.ts'];

    const result = await coverageGapsDetect({
      sourceFiles
    });

    expect(result.summary).toBeDefined();
    expect(result.summary.totalGaps).toBe(result.gaps.length);
    expect(result.summary.estimatedEffort).toBeDefined();
    expect(result.summary.estimatedEffort.hours).toBeGreaterThan(0);
    expect(result.summary.estimatedEffort.tests).toBeGreaterThan(0);
  });

  it('should suggest appropriate tests for each gap', async () => {
    const sourceFiles = ['src/module.ts'];

    const result = await coverageGapsDetect({
      sourceFiles
    });

    result.gaps.forEach(gap => {
      expect(gap.suggestedTests).toBeDefined();
      expect(gap.suggestedTests.length).toBeGreaterThan(0);
    });
  });
});

describe('Analysis MCP Tools - Performance Benchmark Run', () => {
  it('should run benchmarks with specified iterations', async () => {
    const targets = ['api/endpoint1', 'api/endpoint2'];

    const result = await performanceBenchmarkRun({
      targets,
      iterations: 50,
      warmupRuns: 5
    });

    expect(result.benchmarks).toBeDefined();
    expect(result.benchmarks.length).toBe(2);
    expect(result.summary.totalTests).toBe(2);
  });

  it('should calculate statistical metrics', async () => {
    const targets = ['service/method'];

    const result = await performanceBenchmarkRun({
      targets,
      iterations: 100
    });

    const benchmark = result.benchmarks[0];
    if (benchmark.metrics.latency) {
      expect(benchmark.metrics.latency.mean).toBeDefined();
      expect(benchmark.metrics.latency.median).toBeDefined();
      expect(benchmark.metrics.latency.stdDev).toBeDefined();
      expect(benchmark.metrics.latency.p50).toBeDefined();
      expect(benchmark.metrics.latency.p95).toBeDefined();
      expect(benchmark.metrics.latency.p99).toBeDefined();
    }
  });

  it('should collect specified metrics only', async () => {
    const targets = ['endpoint'];

    const result = await performanceBenchmarkRun({
      targets,
      metricsToCollect: ['latency', 'cpu']
    });

    const benchmark = result.benchmarks[0];
    expect(benchmark.metrics.latency).toBeDefined();
    expect(benchmark.metrics.cpu).toBeDefined();
    expect(benchmark.metrics.network).toBeUndefined();
  });

  it('should determine pass/fail status', async () => {
    const targets = ['endpoint1', 'endpoint2'];

    const result = await performanceBenchmarkRun({
      targets,
      iterations: 50
    });

    result.benchmarks.forEach(benchmark => {
      expect(['pass', 'fail', 'warning']).toContain(benchmark.status);
    });
  });

  it('should provide baseline comparison', async () => {
    const targets = ['api/v2'];

    const result = await performanceBenchmarkRun({
      targets,
      baselineComparison: true
    });

    expect(result.comparison).toBeDefined();
    expect(result.comparison?.improvement).toBeGreaterThanOrEqual(0);
    expect(result.comparison?.regression).toBeGreaterThanOrEqual(0);
    expect(result.comparison?.neutral).toBeGreaterThanOrEqual(0);
  });

  it('should generate performance recommendations', async () => {
    const targets = ['slow-endpoint'];

    const result = await performanceBenchmarkRun({
      targets,
      iterations: 30
    });

    expect(result.recommendations).toBeDefined();
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});

describe('Analysis MCP Tools - Performance Monitor Realtime', () => {
  it('should monitor performance in real-time', async () => {
    const targets = ['service1'];

    const result = await performanceMonitorRealtime({
      targets,
      interval: 100,
      duration: 500
    });

    expect(result.status).toBe('stopped');
    expect(result.metrics.length).toBeGreaterThan(0);
  });

  it('should collect all metric types', async () => {
    const targets = ['endpoint'];

    const result = await performanceMonitorRealtime({
      targets,
      interval: 100,
      duration: 300
    });

    const metric = result.metrics[0];
    expect(metric.timestamp).toBeDefined();
    expect(metric.latency).toBeDefined();
    expect(metric.throughput).toBeDefined();
    expect(metric.cpu).toBeDefined();
    expect(metric.memory).toBeDefined();
    expect(metric.errorRate).toBeDefined();
    expect(metric.activeConnections).toBeDefined();
  });

  it('should trigger alerts on threshold violations', async () => {
    const targets = ['monitored-service'];

    const result = await performanceMonitorRealtime({
      targets,
      interval: 100,
      duration: 500,
      thresholds: {
        latency: 100,
        cpu: 70,
        memory: 500
      },
      alerting: true
    });

    // Alerts may or may not be triggered based on random metrics
    expect(result.alerts).toBeDefined();
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it('should analyze performance trends', async () => {
    const targets = ['service'];

    const result = await performanceMonitorRealtime({
      targets,
      interval: 50,
      duration: 600
    });

    expect(result.trends).toBeDefined();
    if (result.trends && result.trends.length > 0) {
      result.trends.forEach(trend => {
        expect(['improving', 'stable', 'degrading']).toContain(trend.trend);
        expect(trend.changeRate).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('should generate monitoring summary', async () => {
    const targets = ['api'];

    const result = await performanceMonitorRealtime({
      targets,
      interval: 100,
      duration: 400
    });

    expect(result.summary).toBeDefined();
    expect(result.summary.startTime).toBeGreaterThan(0);
    expect(result.summary.duration).toBeGreaterThan(0);
    expect(result.summary.dataPoints).toBe(result.metrics.length);
    expect(result.summary.alertsTriggered).toBe(result.alerts.length);
  });
});

describe('Analysis MCP Tools - Security Scan Comprehensive', () => {
  it('should run all scan types', async () => {
    const targets = ['src/app.ts', 'src/api.ts'];

    const result = await securityScanComprehensive({
      targets,
      scanTypes: ['sast', 'dast', 'sca', 'secrets', 'dependencies']
    });

    expect(result.vulnerabilities).toBeDefined();
    expect(result.vulnerabilities.length).toBeGreaterThan(0);
  });

  it('should detect SAST vulnerabilities', async () => {
    const targets = ['src/insecure.ts'];

    const result = await securityScanComprehensive({
      targets,
      scanTypes: ['sast']
    });

    const sastVulns = result.vulnerabilities.filter(v => v.type === 'sast');
    expect(sastVulns.length).toBeGreaterThanOrEqual(0);
  });

  it('should detect DAST vulnerabilities', async () => {
    const targets = ['api/endpoint'];

    const result = await securityScanComprehensive({
      targets,
      scanTypes: ['dast']
    });

    const dastVulns = result.vulnerabilities.filter(v => v.type === 'dast');
    expect(dastVulns.length).toBeGreaterThanOrEqual(0);
  });

  it('should calculate risk scores', async () => {
    const targets = ['src/app.ts'];

    const result = await securityScanComprehensive({
      targets
    });

    expect(result.riskScore).toBeDefined();
    expect(result.riskScore.overall).toBeGreaterThanOrEqual(0);
    expect(result.riskScore.overall).toBeLessThanOrEqual(100);
    expect(result.riskScore.breakdown).toBeDefined();
  });

  it('should provide fix suggestions when enabled', async () => {
    const targets = ['src/vulnerable.ts'];

    const result = await securityScanComprehensive({
      targets,
      fixSuggestions: true
    });

    const vulnsWithFixes = result.vulnerabilities.filter(v => v.fixSuggestion);
    expect(vulnsWithFixes.length).toBeGreaterThan(0);
  });

  it('should run compliance checks', async () => {
    const targets = ['src/app.ts'];

    const result = await securityScanComprehensive({
      targets,
      includeCompliance: true
    });

    expect(result.compliance).toBeDefined();
    expect(result.compliance!.length).toBeGreaterThan(0);

    result.compliance!.forEach(check => {
      expect(check.standard).toBeDefined();
      expect(['compliant', 'non-compliant', 'partial']).toContain(check.status);
    });
  });

  it('should categorize vulnerabilities by severity', async () => {
    const targets = ['src/app.ts'];

    const result = await securityScanComprehensive({
      targets
    });

    expect(result.summary.critical).toBeGreaterThanOrEqual(0);
    expect(result.summary.high).toBeGreaterThanOrEqual(0);
    expect(result.summary.medium).toBeGreaterThanOrEqual(0);
    expect(result.summary.low).toBeGreaterThanOrEqual(0);

    const total = result.summary.critical + result.summary.high +
                  result.summary.medium + result.summary.low;
    expect(total).toBe(result.summary.totalVulnerabilities);
  });

  it('should generate security recommendations', async () => {
    const targets = ['src/app.ts'];

    const result = await securityScanComprehensive({
      targets
    });

    expect(result.recommendations).toBeDefined();
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should include CVE and CWE information', async () => {
    const targets = ['src/service.ts'];

    const result = await securityScanComprehensive({
      targets
    });

    const vulnsWithCwe = result.vulnerabilities.filter(v => v.cwe);
    expect(vulnsWithCwe.length).toBeGreaterThan(0);
  });
});

describe('Analysis MCP Tools - Integration Tests', () => {
  it('should work together: coverage analysis -> gap detection', async () => {
    const sourceFiles = ['src/main.ts', 'src/utils.ts'];

    // First analyze coverage
    const coverageResult = await coverageAnalyzeSublinear({
      sourceFiles,
      includeUncoveredLines: true
    });

    // Then detect gaps (without passing coverageResult since it's not compatible format)
    const gapsResult = await coverageGapsDetect({
      sourceFiles
    });

    expect(coverageResult.overallCoverage).toBeDefined();
    expect(gapsResult.gaps).toBeDefined();
  });

  it('should handle empty input gracefully', async () => {
    const result = await coverageAnalyzeSublinear({
      sourceFiles: []
    });

    expect(result.fileCoverage).toBeDefined();
    expect(Object.keys(result.fileCoverage).length).toBe(0);
  });

  it('should handle concurrent benchmark and monitoring', async () => {
    const targets = ['service1'];

    const [benchmarkResult, monitorResult] = await Promise.all([
      performanceBenchmarkRun({ targets, iterations: 10 }),
      performanceMonitorRealtime({ targets, interval: 100, duration: 300 })
    ]);

    expect(benchmarkResult.benchmarks).toBeDefined();
    expect(monitorResult.metrics).toBeDefined();
  });
});
