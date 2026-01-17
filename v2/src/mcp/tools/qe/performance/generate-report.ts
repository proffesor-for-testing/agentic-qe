/**
 * Performance Report Generation Tool
 *
 * Generates performance reports in HTML, PDF, or JSON format
 * with baseline comparison and trend visualization.
 *
 * @module performance/generate-report
 * @version 1.0.0
 */

import type { PerformanceMetrics } from '../shared/types.js';
import type { BottleneckAnalysis } from './analyze-bottlenecks.js';
import { seededRandom } from '../../../../utils/SeededRandom.js';

/**
 * Parameters for performance report generation
 */
export interface PerformanceReportParams {
  /** Benchmark results to include in report */
  benchmarkResults: BenchmarkData[];

  /** Report output format */
  format: 'html' | 'pdf' | 'json';

  /** Baseline data for comparison (optional) */
  compareBaseline?: BenchmarkData;

  /** Include trend charts */
  includeTrends?: boolean;

  /** Include bottleneck analysis */
  includeBottleneckAnalysis?: boolean;

  /** Bottleneck analysis data (if includeBottleneckAnalysis is true) */
  bottleneckAnalysis?: BottleneckAnalysis;

  /** Report title */
  title?: string;

  /** Additional metadata */
  metadata?: ReportMetadata;
}

/**
 * Benchmark data structure
 */
export interface BenchmarkData {
  /** Benchmark name */
  name: string;

  /** Timestamp */
  timestamp: string;

  /** Performance metrics */
  metrics: PerformanceMetrics;

  /** Test configuration */
  config?: {
    iterations: number;
    concurrency: number;
    duration?: number;
  };

  /** Environment information */
  environment?: {
    os: string;
    cpu: string;
    memory: string;
    runtime?: string;
  };
}

/**
 * Report metadata
 */
export interface ReportMetadata {
  /** Project name */
  projectName?: string;

  /** Version/build number */
  version?: string;

  /** Author/team */
  author?: string;

  /** Additional tags */
  tags?: string[];
}

/**
 * Performance report structure
 */
export interface PerformanceReport {
  /** Report ID */
  id: string;

  /** Report title */
  title: string;

  /** Generation timestamp */
  generatedAt: string;

  /** Report format */
  format: 'html' | 'pdf' | 'json';

  /** Report content (format-dependent) */
  content: string | object;

  /** File size (bytes) */
  size: number;

  /** Output file path (if saved to disk) */
  filePath?: string;

  /** Report summary */
  summary: ReportSummary;

  /** Metadata */
  metadata?: ReportMetadata;
}

/**
 * Report summary
 */
export interface ReportSummary {
  /** Total benchmarks included */
  totalBenchmarks: number;

  /** Overall performance score (0-100) */
  overallScore: number;

  /** Performance vs baseline */
  baselineComparison?: {
    improvement: number; // Percentage
    direction: 'better' | 'same' | 'worse';
  };

  /** Key findings */
  keyFindings: string[];

  /** Critical issues count */
  criticalIssues: number;

  /** Warnings count */
  warnings: number;
}

/**
 * Generate performance report
 *
 * Creates a comprehensive performance report with metrics, trends, and recommendations.
 *
 * @param params - Report generation parameters
 * @returns Promise resolving to performance report
 *
 * @example
 * ```typescript
 * const report = await generatePerformanceReport({
 *   benchmarkResults: [
 *     {
 *       name: 'API Load Test',
 *       timestamp: '2025-01-08T10:00:00Z',
 *       metrics: {
 *         responseTime: { p50: 100, p95: 200, p99: 300, max: 500 },
 *         throughput: 1000,
 *         errorRate: 0.001,
 *         resourceUsage: { cpu: 60, memory: 512, disk: 100 }
 *       }
 *     }
 *   ],
 *   format: 'html',
 *   compareBaseline: baselineData,
 *   includeTrends: true
 * });
 *
 * console.log(`Report generated: ${report.filePath}`);
 * console.log(`Overall score: ${report.summary.overallScore}/100`);
 * ```
 */
export async function generatePerformanceReport(
  params: PerformanceReportParams
): Promise<PerformanceReport> {
  const {
    benchmarkResults,
    format,
    compareBaseline,
    includeTrends = true,
    includeBottleneckAnalysis = false,
    bottleneckAnalysis,
    title = 'Performance Test Report',
    metadata
  } = params;

  // Generate report ID
  const reportId = generateReportId();

  // Calculate summary
  const summary = calculateReportSummary(
    benchmarkResults,
    compareBaseline,
    bottleneckAnalysis
  );

  // Generate report content based on format
  let content: string | object;
  let size: number;

  switch (format) {
    case 'html':
      content = generateHtmlReport(
        benchmarkResults,
        compareBaseline,
        includeTrends,
        includeBottleneckAnalysis,
        bottleneckAnalysis,
        title,
        summary
      );
      size = content.length;
      break;

    case 'pdf':
      content = generatePdfReport(
        benchmarkResults,
        compareBaseline,
        includeTrends,
        includeBottleneckAnalysis,
        bottleneckAnalysis,
        title,
        summary
      );
      size = content.length;
      break;

    case 'json':
      content = generateJsonReport(
        benchmarkResults,
        compareBaseline,
        includeTrends,
        includeBottleneckAnalysis,
        bottleneckAnalysis,
        title,
        summary
      );
      size = JSON.stringify(content).length;
      break;

    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  return {
    id: reportId,
    title,
    generatedAt: new Date().toISOString(),
    format,
    content,
    size,
    filePath: `./reports/performance-${reportId}.${format}`,
    summary,
    metadata
  };
}

/**
 * Generate unique report ID
 */
function generateReportId(): string {
  const timestamp = Date.now();
  const random = seededRandom.random().toString(36).substring(2, 8);
  return `perf-${timestamp}-${random}`;
}

/**
 * Calculate report summary
 */
function calculateReportSummary(
  benchmarkResults: BenchmarkData[],
  compareBaseline?: BenchmarkData,
  bottleneckAnalysis?: BottleneckAnalysis
): ReportSummary {
  // Calculate overall performance score
  const overallScore = calculateOverallScore(benchmarkResults, bottleneckAnalysis);

  // Calculate baseline comparison
  let baselineComparison: ReportSummary['baselineComparison'];
  if (compareBaseline && benchmarkResults.length > 0) {
    const currentAvgP95 = benchmarkResults.reduce((sum, b) => sum + b.metrics.responseTime.p95, 0) / benchmarkResults.length;
    const baselineP95 = compareBaseline.metrics.responseTime.p95;
    const improvement = ((baselineP95 - currentAvgP95) / baselineP95) * 100;

    baselineComparison = {
      improvement,
      direction: improvement > 5 ? 'better' : improvement < -5 ? 'worse' : 'same'
    };
  }

  // Extract key findings
  const keyFindings = extractKeyFindings(
    benchmarkResults,
    compareBaseline,
    bottleneckAnalysis
  );

  // Count critical issues and warnings
  const criticalIssues = bottleneckAnalysis
    ? bottleneckAnalysis.bottlenecks.filter(b => b.severity === 'critical').length
    : 0;

  const warnings = bottleneckAnalysis
    ? bottleneckAnalysis.bottlenecks.filter(b => b.severity === 'medium' || b.severity === 'high').length
    : 0;

  return {
    totalBenchmarks: benchmarkResults.length,
    overallScore,
    baselineComparison,
    keyFindings,
    criticalIssues,
    warnings
  };
}

/**
 * Calculate overall performance score
 */
function calculateOverallScore(
  benchmarkResults: BenchmarkData[],
  bottleneckAnalysis?: BottleneckAnalysis
): number {
  if (bottleneckAnalysis) {
    return bottleneckAnalysis.performanceScore;
  }

  // Fallback: calculate based on error rate and response times
  const avgErrorRate = benchmarkResults.reduce((sum, b) => sum + b.metrics.errorRate, 0) / benchmarkResults.length;
  const avgP95 = benchmarkResults.reduce((sum, b) => sum + b.metrics.responseTime.p95, 0) / benchmarkResults.length;

  let score = 100;

  // Deduct for error rate
  score -= avgErrorRate * 100 * 50; // High penalty for errors

  // Deduct for slow response times (assuming 200ms is ideal)
  if (avgP95 > 200) {
    score -= Math.min(30, ((avgP95 - 200) / 200) * 30);
  }

  return Math.max(0, Math.round(score));
}

/**
 * Extract key findings from benchmark data
 */
function extractKeyFindings(
  benchmarkResults: BenchmarkData[],
  compareBaseline?: BenchmarkData,
  bottleneckAnalysis?: BottleneckAnalysis
): string[] {
  const findings: string[] = [];

  if (benchmarkResults.length === 0) {
    findings.push('No benchmark data available');
    return findings;
  }

  // Response time findings
  const avgP95 = benchmarkResults.reduce((sum, b) => sum + b.metrics.responseTime.p95, 0) / benchmarkResults.length;
  findings.push(`Average p95 response time: ${avgP95.toFixed(0)}ms`);

  // Throughput findings
  const avgThroughput = benchmarkResults.reduce((sum, b) => sum + b.metrics.throughput, 0) / benchmarkResults.length;
  findings.push(`Average throughput: ${avgThroughput.toFixed(1)} requests/sec`);

  // Error rate findings
  const avgErrorRate = benchmarkResults.reduce((sum, b) => sum + b.metrics.errorRate, 0) / benchmarkResults.length;
  if (avgErrorRate > 0.01) {
    findings.push(`⚠️ High error rate detected: ${(avgErrorRate * 100).toFixed(2)}%`);
  }

  // Baseline comparison findings
  if (compareBaseline) {
    const improvement = ((compareBaseline.metrics.responseTime.p95 - avgP95) / compareBaseline.metrics.responseTime.p95) * 100;
    if (improvement > 5) {
      findings.push(`✅ Performance improved by ${improvement.toFixed(1)}% vs baseline`);
    } else if (improvement < -5) {
      findings.push(`⚠️ Performance degraded by ${Math.abs(improvement).toFixed(1)}% vs baseline`);
    }
  }

  // Bottleneck findings
  if (bottleneckAnalysis && bottleneckAnalysis.bottlenecks.length > 0) {
    const criticalBottlenecks = bottleneckAnalysis.bottlenecks.filter(b => b.severity === 'critical');
    if (criticalBottlenecks.length > 0) {
      findings.push(`🚨 ${criticalBottlenecks.length} critical bottleneck(s) detected`);
    }
  }

  return findings;
}

/**
 * Generate HTML report
 */
function generateHtmlReport(
  benchmarkResults: BenchmarkData[],
  compareBaseline: BenchmarkData | undefined,
  includeTrends: boolean,
  includeBottleneckAnalysis: boolean,
  bottleneckAnalysis: BottleneckAnalysis | undefined,
  title: string,
  summary: ReportSummary
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
    }
    .header h1 { margin: 0 0 10px 0; }
    .header .meta { opacity: 0.9; font-size: 14px; }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .summary h2 { margin-top: 0; }
    .score {
      font-size: 48px;
      font-weight: bold;
      color: ${summary.overallScore >= 80 ? '#10b981' : summary.overallScore >= 60 ? '#f59e0b' : '#ef4444'};
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .metric-card {
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metric-card h3 { margin-top: 0; font-size: 14px; color: #666; }
    .metric-value { font-size: 32px; font-weight: bold; color: #333; }
    .metric-label { font-size: 12px; color: #999; margin-top: 5px; }
    .findings {
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .findings ul { padding-left: 20px; }
    .findings li { margin: 10px 0; }
    .bottlenecks {
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .bottleneck-item {
      padding: 15px;
      margin: 10px 0;
      border-left: 4px solid;
      background: #f9f9f9;
    }
    .bottleneck-item.critical { border-color: #ef4444; }
    .bottleneck-item.high { border-color: #f59e0b; }
    .bottleneck-item.medium { border-color: #eab308; }
    .bottleneck-item.low { border-color: #10b981; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="meta">Generated: ${new Date().toISOString()}</div>
  </div>

  <div class="summary">
    <h2>Performance Summary</h2>
    <div class="score">${summary.overallScore}/100</div>
    <p><strong>Total Benchmarks:</strong> ${summary.totalBenchmarks}</p>
    ${summary.baselineComparison ? `
      <p><strong>vs Baseline:</strong> ${summary.baselineComparison.improvement > 0 ? '+' : ''}${summary.baselineComparison.improvement.toFixed(1)}% (${summary.baselineComparison.direction})</p>
    ` : ''}
    <p><strong>Critical Issues:</strong> ${summary.criticalIssues}</p>
    <p><strong>Warnings:</strong> ${summary.warnings}</p>
  </div>

  <div class="findings">
    <h2>Key Findings</h2>
    <ul>
      ${summary.keyFindings.map(f => `<li>${f}</li>`).join('')}
    </ul>
  </div>

  <h2>Performance Metrics</h2>
  <div class="metrics">
    ${benchmarkResults.map(benchmark => `
      <div class="metric-card">
        <h3>${benchmark.name}</h3>
        <div class="metric-value">${benchmark.metrics.responseTime.p95.toFixed(0)}ms</div>
        <div class="metric-label">p95 Response Time</div>
        <div style="margin-top: 15px;">
          <div><strong>Throughput:</strong> ${benchmark.metrics.throughput.toFixed(1)} req/s</div>
          <div><strong>Error Rate:</strong> ${(benchmark.metrics.errorRate * 100).toFixed(2)}%</div>
          <div><strong>CPU:</strong> ${benchmark.metrics.resourceUsage.cpu.toFixed(1)}%</div>
          <div><strong>Memory:</strong> ${benchmark.metrics.resourceUsage.memory.toFixed(0)}MB</div>
        </div>
      </div>
    `).join('')}
  </div>

  ${includeBottleneckAnalysis && bottleneckAnalysis && bottleneckAnalysis.bottlenecks.length > 0 ? `
    <div class="bottlenecks">
      <h2>Detected Bottlenecks</h2>
      ${bottleneckAnalysis.bottlenecks.map(b => `
        <div class="bottleneck-item ${b.severity}">
          <strong>${b.type.toUpperCase()}</strong> - ${b.severity.toUpperCase()}<br>
          ${b.description}<br>
          <small>Current: ${b.currentValue.toFixed(1)} | Threshold: ${b.thresholdValue.toFixed(1)} | Over by: ${b.percentageAboveThreshold.toFixed(1)}%</small>
        </div>
      `).join('')}
    </div>
  ` : ''}
</body>
</html>`;
}

/**
 * Generate PDF report (placeholder - would use library like puppeteer/pdfkit in production)
 */
function generatePdfReport(
  benchmarkResults: BenchmarkData[],
  compareBaseline: BenchmarkData | undefined,
  includeTrends: boolean,
  includeBottleneckAnalysis: boolean,
  bottleneckAnalysis: BottleneckAnalysis | undefined,
  title: string,
  summary: ReportSummary
): string {
  // In production, this would generate actual PDF binary
  // For now, return HTML that could be converted to PDF
  const html = generateHtmlReport(
    benchmarkResults,
    compareBaseline,
    includeTrends,
    includeBottleneckAnalysis,
    bottleneckAnalysis,
    title,
    summary
  );

  return `PDF_PLACEHOLDER: ${html.substring(0, 100)}... (would be converted to PDF in production)`;
}

/**
 * Generate JSON report
 */
function generateJsonReport(
  benchmarkResults: BenchmarkData[],
  compareBaseline: BenchmarkData | undefined,
  includeTrends: boolean,
  includeBottleneckAnalysis: boolean,
  bottleneckAnalysis: BottleneckAnalysis | undefined,
  title: string,
  summary: ReportSummary
): object {
  return {
    title,
    generatedAt: new Date().toISOString(),
    summary,
    benchmarkResults: benchmarkResults.map(b => ({
      name: b.name,
      timestamp: b.timestamp,
      metrics: b.metrics,
      config: b.config,
      environment: b.environment
    })),
    baseline: compareBaseline ? {
      name: compareBaseline.name,
      timestamp: compareBaseline.timestamp,
      metrics: compareBaseline.metrics
    } : undefined,
    bottleneckAnalysis: includeBottleneckAnalysis ? bottleneckAnalysis : undefined
  };
}
