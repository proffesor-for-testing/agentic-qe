/**
 * Unit Tests for Performance Report Generation Tool
 */

import { describe, it, expect } from '@jest/globals';
import {
  generatePerformanceReport,
  type PerformanceReportParams,
  type BenchmarkData
} from '../../../../../../src/mcp/tools/qe/performance/generate-report.js';
import type { PerformanceMetrics } from '../../../../../../src/mcp/tools/qe/shared/types.js';

describe('Performance Report Generation', () => {
  const createMockBenchmark = (name: string, overrides?: Partial<PerformanceMetrics>): BenchmarkData => ({
    name,
    timestamp: new Date().toISOString(),
    metrics: {
      responseTime: {
        p50: 100,
        p95: 200,
        p99: 300,
        max: 500
      },
      throughput: 150,
      errorRate: 0.005,
      resourceUsage: {
        cpu: 60,
        memory: 512,
        disk: 100
      },
      ...overrides
    },
    config: {
      iterations: 100,
      concurrency: 10,
      duration: 60
    },
    environment: {
      os: 'Linux',
      cpu: 'Intel i7',
      memory: '16GB',
      runtime: 'Node.js 18'
    }
  });

  describe('generatePerformanceReport', () => {
    it('should generate HTML report successfully', async () => {
      const params: PerformanceReportParams = {
        benchmarkResults: [
          createMockBenchmark('API Load Test'),
          createMockBenchmark('Database Query Test')
        ],
        format: 'html',
        title: 'Performance Test Report'
      };

      const report = await generatePerformanceReport(params);

      expect(report.format).toBe('html');
      expect(report.content).toContain('<!DOCTYPE html>');
      expect(report.content).toContain('Performance Test Report');
      expect(report.summary.totalBenchmarks).toBe(2);
      expect(report.id).toMatch(/^perf-/);
      expect(report.size).toBeGreaterThan(0);
    });

    it('should generate JSON report successfully', async () => {
      const params: PerformanceReportParams = {
        benchmarkResults: [createMockBenchmark('Test 1')],
        format: 'json'
      };

      const report = await generatePerformanceReport(params);

      expect(report.format).toBe('json');
      expect(typeof report.content).toBe('object');
      const content = report.content as { benchmarkResults: unknown[] };
      expect(content.benchmarkResults).toHaveLength(1);
    });

    it('should generate PDF placeholder report', async () => {
      const params: PerformanceReportParams = {
        benchmarkResults: [createMockBenchmark('Test 1')],
        format: 'pdf'
      };

      const report = await generatePerformanceReport(params);

      expect(report.format).toBe('pdf');
      expect(typeof report.content).toBe('string');
      expect(report.content).toContain('PDF_PLACEHOLDER');
    });

    it('should calculate overall score correctly', async () => {
      const params: PerformanceReportParams = {
        benchmarkResults: [
          createMockBenchmark('Test 1', {
            errorRate: 0.001,
            responseTime: { p50: 50, p95: 100, p99: 150, max: 200 }
          })
        ],
        format: 'json'
      };

      const report = await generatePerformanceReport(params);

      expect(report.summary.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.summary.overallScore).toBeLessThanOrEqual(100);
      expect(report.summary.overallScore).toBeGreaterThan(80); // Good performance
    });

    it('should compare against baseline correctly', async () => {
      const baselineData = createMockBenchmark('Baseline', {
        responseTime: { p50: 150, p95: 300, p99: 450, max: 600 }
      });

      const params: PerformanceReportParams = {
        benchmarkResults: [
          createMockBenchmark('Current', {
            responseTime: { p50: 100, p95: 200, p99: 300, max: 400 }
          })
        ],
        format: 'json',
        compareBaseline: baselineData
      };

      const report = await generatePerformanceReport(params);

      expect(report.summary.baselineComparison).toBeDefined();
      expect(report.summary.baselineComparison!.improvement).toBeGreaterThan(0);
      expect(report.summary.baselineComparison!.direction).toBe('better');
    });

    it('should detect performance degradation vs baseline', async () => {
      const baselineData = createMockBenchmark('Baseline', {
        responseTime: { p50: 50, p95: 100, p99: 150, max: 200 }
      });

      const params: PerformanceReportParams = {
        benchmarkResults: [
          createMockBenchmark('Current', {
            responseTime: { p50: 150, p95: 300, p99: 450, max: 600 }
          })
        ],
        format: 'json',
        compareBaseline: baselineData
      };

      const report = await generatePerformanceReport(params);

      expect(report.summary.baselineComparison).toBeDefined();
      expect(report.summary.baselineComparison!.improvement).toBeLessThan(0);
      expect(report.summary.baselineComparison!.direction).toBe('worse');
    });

    it('should include bottleneck analysis when provided', async () => {
      const bottleneckAnalysis = {
        bottlenecks: [
          {
            type: 'cpu' as const,
            severity: 'critical' as const,
            currentValue: 95,
            thresholdValue: 80,
            percentageAboveThreshold: 18.75,
            description: 'CPU usage exceeds threshold'
          }
        ],
        overallSeverity: 'critical' as const,
        performanceScore: 45,
        resourceUtilization: {
          cpu: { current: 95, average: 90, peak: 98, status: 'critical' as const },
          memory: { current: 512, average: 500, peak: 600, status: 'normal' as const }
        }
      };

      const params: PerformanceReportParams = {
        benchmarkResults: [createMockBenchmark('Test 1')],
        format: 'html',
        includeBottleneckAnalysis: true,
        bottleneckAnalysis
      };

      const report = await generatePerformanceReport(params);

      expect(report.content).toContain('Detected Bottlenecks');
      expect(report.content).toContain('CPU');
      expect(report.summary.criticalIssues).toBe(1);
    });

    it('should extract key findings correctly', async () => {
      const params: PerformanceReportParams = {
        benchmarkResults: [
          createMockBenchmark('Test 1', {
            errorRate: 0.02
          })
        ],
        format: 'json'
      };

      const report = await generatePerformanceReport(params);

      expect(report.summary.keyFindings.length).toBeGreaterThan(0);
      expect(report.summary.keyFindings.some(f => f.includes('error rate'))).toBe(true);
    });

    it('should include metadata in report', async () => {
      const metadata = {
        projectName: 'My Project',
        version: '1.0.0',
        author: 'QE Team',
        tags: ['performance', 'load-test']
      };

      const params: PerformanceReportParams = {
        benchmarkResults: [createMockBenchmark('Test 1')],
        format: 'json',
        metadata
      };

      const report = await generatePerformanceReport(params);

      expect(report.metadata).toEqual(metadata);
    });

    it('should handle empty benchmark results', async () => {
      const params: PerformanceReportParams = {
        benchmarkResults: [],
        format: 'json'
      };

      const report = await generatePerformanceReport(params);

      expect(report.summary.totalBenchmarks).toBe(0);
      expect(report.summary.keyFindings).toContain('No benchmark data available');
    });

    it('should generate unique report IDs', async () => {
      const params: PerformanceReportParams = {
        benchmarkResults: [createMockBenchmark('Test 1')],
        format: 'json'
      };

      const report1 = await generatePerformanceReport(params);
      const report2 = await generatePerformanceReport(params);

      expect(report1.id).not.toBe(report2.id);
    });

    it('should include file path in report', async () => {
      const params: PerformanceReportParams = {
        benchmarkResults: [createMockBenchmark('Test 1')],
        format: 'html'
      };

      const report = await generatePerformanceReport(params);

      expect(report.filePath).toBeDefined();
      expect(report.filePath).toMatch(/^\.\/reports\/performance-.*\.html$/);
    });

    it('should calculate warnings count correctly', async () => {
      const bottleneckAnalysis = {
        bottlenecks: [
          {
            type: 'cpu' as const,
            severity: 'medium' as const,
            currentValue: 85,
            thresholdValue: 80,
            percentageAboveThreshold: 6.25,
            description: 'CPU usage slightly high'
          },
          {
            type: 'memory' as const,
            severity: 'high' as const,
            currentValue: 1200,
            thresholdValue: 1024,
            percentageAboveThreshold: 17.2,
            description: 'Memory usage high'
          }
        ],
        overallSeverity: 'high' as const,
        performanceScore: 65,
        resourceUtilization: {
          cpu: { current: 85, average: 82, peak: 90, status: 'warning' as const },
          memory: { current: 1200, average: 1100, peak: 1300, status: 'warning' as const }
        }
      };

      const params: PerformanceReportParams = {
        benchmarkResults: [createMockBenchmark('Test 1')],
        format: 'json',
        includeBottleneckAnalysis: true,
        bottleneckAnalysis
      };

      const report = await generatePerformanceReport(params);

      expect(report.summary.warnings).toBe(2);
      expect(report.summary.criticalIssues).toBe(0);
    });
  });

  describe('Report Format Validation', () => {
    it('should throw error for unsupported format', async () => {
      const params = {
        benchmarkResults: [createMockBenchmark('Test 1')],
        format: 'xml' as 'html' // Force invalid type
      };

      await expect(generatePerformanceReport(params)).rejects.toThrow('Unsupported format');
    });
  });
});
