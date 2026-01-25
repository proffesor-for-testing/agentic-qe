/**
 * Unit Tests for Performance Bottleneck Analysis Tool
 */

import { describe, it, expect } from '@jest/globals';
import {
  analyzePerformanceBottlenecks,
  type BottleneckAnalysisParams,
  type BottleneckThresholds
} from '../../../../../../src/mcp/tools/qe/performance/analyze-bottlenecks.js';
import type { PerformanceMetrics } from '../../../../../../src/mcp/tools/qe/shared/types.js';

describe('Performance Bottleneck Analysis', () => {
  const mockThresholds: BottleneckThresholds = {
    cpu: 80,
    memory: 1024,
    responseTime: 200,
    errorRate: 0.01,
    throughputMin: 100
  };

  const createMockMetrics = (overrides?: Partial<PerformanceMetrics>): PerformanceMetrics => ({
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
  });

  describe('analyzePerformanceBottlenecks', () => {
    it('should detect no bottlenecks when all metrics are within thresholds', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics(),
        thresholds: mockThresholds,
        includeRecommendations: false
      };

      const result = await analyzePerformanceBottlenecks(params);

      expect(result.bottlenecks).toHaveLength(0);
      expect(result.overallSeverity).toBe('none');
      expect(result.performanceScore).toBeGreaterThan(80);
    });

    it('should detect CPU bottleneck when CPU exceeds threshold', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics({
          resourceUsage: {
            cpu: 95,
            memory: 512,
            disk: 100
          }
        }),
        thresholds: mockThresholds,
        includeRecommendations: false
      };

      const result = await analyzePerformanceBottlenecks(params);

      expect(result.bottlenecks.length).toBeGreaterThan(0);
      const cpuBottleneck = result.bottlenecks.find(b => b.type === 'cpu');
      expect(cpuBottleneck).toBeDefined();
      expect(cpuBottleneck?.currentValue).toBe(95);
      expect(cpuBottleneck?.thresholdValue).toBe(80);
    });

    it('should detect memory bottleneck when memory exceeds threshold', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics({
          resourceUsage: {
            cpu: 60,
            memory: 1500,
            disk: 100
          }
        }),
        thresholds: mockThresholds,
        includeRecommendations: false
      };

      const result = await analyzePerformanceBottlenecks(params);

      const memoryBottleneck = result.bottlenecks.find(b => b.type === 'memory');
      expect(memoryBottleneck).toBeDefined();
      expect(memoryBottleneck?.currentValue).toBe(1500);
      expect(memoryBottleneck?.severity).toBeDefined();
    });

    it('should detect response time bottleneck when p95 exceeds threshold', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics({
          responseTime: {
            p50: 150,
            p95: 500,
            p99: 800,
            max: 1000
          }
        }),
        thresholds: mockThresholds,
        includeRecommendations: false
      };

      const result = await analyzePerformanceBottlenecks(params);

      const responseTimeBottleneck = result.bottlenecks.find(b => b.type === 'response-time');
      expect(responseTimeBottleneck).toBeDefined();
      expect(responseTimeBottleneck?.currentValue).toBe(500);
    });

    it('should calculate correct overall severity for critical bottlenecks', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics({
          resourceUsage: {
            cpu: 95,
            memory: 2048,
            disk: 100
          },
          responseTime: {
            p50: 300,
            p95: 600,
            p99: 900,
            max: 1200
          }
        }),
        thresholds: mockThresholds,
        includeRecommendations: false
      };

      const result = await analyzePerformanceBottlenecks(params);

      expect(result.overallSeverity).toMatch(/high|critical/);
      expect(result.bottlenecks.length).toBeGreaterThan(0);
    });

    it('should calculate performance score correctly', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics(),
        thresholds: mockThresholds,
        includeRecommendations: false
      };

      const result = await analyzePerformanceBottlenecks(params);

      expect(result.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.performanceScore).toBeLessThanOrEqual(100);
    });

    it('should generate recommendations when requested', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics({
          resourceUsage: {
            cpu: 95,
            memory: 512,
            disk: 100
          }
        }),
        thresholds: mockThresholds,
        includeRecommendations: true
      };

      const result = await analyzePerformanceBottlenecks(params);

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations!.length).toBeGreaterThan(0);
      expect(result.recommendations![0]).toHaveProperty('title');
      expect(result.recommendations![0]).toHaveProperty('description');
      expect(result.recommendations![0]).toHaveProperty('expectedImpact');
    });

    it('should analyze resource utilization correctly', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics({
          resourceUsage: {
            cpu: 85,
            memory: 1100,
            disk: 200
          }
        }),
        thresholds: mockThresholds,
        includeRecommendations: false
      };

      const result = await analyzePerformanceBottlenecks(params);

      expect(result.resourceUtilization.cpu.current).toBe(85);
      expect(result.resourceUtilization.cpu.status).toMatch(/warning|critical/);
      expect(result.resourceUtilization.memory.current).toBe(1100);
      expect(result.resourceUtilization.memory.status).toMatch(/warning|critical/);
    });

    it('should perform trend analysis when historical data provided', async () => {
      const historicalMetrics: PerformanceMetrics[] = [
        createMockMetrics({ responseTime: { p50: 80, p95: 150, p99: 250, max: 400 } }),
        createMockMetrics({ responseTime: { p50: 90, p95: 160, p99: 260, max: 420 } }),
        createMockMetrics({ responseTime: { p50: 95, p95: 170, p99: 270, max: 450 } })
      ];

      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics({
          responseTime: { p50: 100, p95: 200, p99: 300, max: 500 }
        }),
        thresholds: mockThresholds,
        includeRecommendations: false,
        historicalData: historicalMetrics
      };

      const result = await analyzePerformanceBottlenecks(params);

      expect(result.trends).toBeDefined();
      expect(result.trends!.direction).toMatch(/improving|stable|degrading/);
      expect(result.trends!.percentageChange).toBeDefined();
    });

    it('should detect throughput bottleneck when below minimum', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics({
          throughput: 50
        }),
        thresholds: mockThresholds,
        includeRecommendations: false
      };

      const result = await analyzePerformanceBottlenecks(params);

      const throughputBottleneck = result.bottlenecks.find(b => b.type === 'throughput');
      expect(throughputBottleneck).toBeDefined();
      expect(throughputBottleneck?.currentValue).toBe(50);
    });

    it('should detect error rate bottleneck when above threshold', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics({
          errorRate: 0.05
        }),
        thresholds: mockThresholds,
        includeRecommendations: false
      };

      const result = await analyzePerformanceBottlenecks(params);

      const errorRateBottleneck = result.bottlenecks.find(b => b.type === 'io');
      expect(errorRateBottleneck).toBeDefined();
    });
  });

  describe('BottleneckAnalysis Edge Cases', () => {
    it('should handle zero thresholds gracefully', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics(),
        thresholds: {
          cpu: 0,
          memory: 0,
          responseTime: 0
        },
        includeRecommendations: false
      };

      const result = await analyzePerformanceBottlenecks(params);

      expect(result).toBeDefined();
      expect(result.bottlenecks).toBeDefined();
    });

    it('should handle missing optional threshold fields', async () => {
      const params: BottleneckAnalysisParams = {
        performanceData: createMockMetrics(),
        thresholds: {
          cpu: 80,
          memory: 1024,
          responseTime: 200
          // errorRate and throughputMin not provided
        },
        includeRecommendations: false
      };

      const result = await analyzePerformanceBottlenecks(params);

      expect(result).toBeDefined();
      expect(result.bottlenecks.every(b => b.type !== 'io')).toBe(true);
    });
  });
});
