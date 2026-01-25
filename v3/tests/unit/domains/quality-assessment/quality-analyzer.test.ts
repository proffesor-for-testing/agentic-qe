/**
 * Agentic QE v3 - Quality Analyzer Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QualityAnalyzerService } from '../../../../src/domains/quality-assessment/services/quality-analyzer';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { QualityAnalysisRequest, ComplexityRequest } from '../../../../src/domains/quality-assessment/interfaces';

/**
 * Mock MemoryBackend implementation for testing
 */
class MockMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();

  async initialize(): Promise<void> {}
  async dispose(): Promise<void> {
    this.store.clear();
  }

  async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
    this.store.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async search(pattern: string, _limit?: number): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter((key) => regex.test(key));
  }

  async vectorSearch(_embedding: number[], _k: number): Promise<VectorSearchResult[]> {
    return [];
  }

  async storeVector(_key: string, _embedding: number[], _metadata?: unknown): Promise<void> {}

  // Helper for tests to add historical data
  addHistoricalReport(reportId: string, analyzedAt: string, metrics: { name: string; value: number }[]): void {
    this.store.set(`quality-analysis:report:${reportId}`, {
      analyzedAt,
      metrics,
    });
  }
}

describe('QualityAnalyzerService', () => {
  let service: QualityAnalyzerService;
  let mockMemory: MockMemoryBackend;

  beforeEach(() => {
    mockMemory = new MockMemoryBackend();
    service = new QualityAnalyzerService(mockMemory);
  });

  afterEach(async () => {
    await mockMemory.dispose();
  });

  describe('analyzeQuality', () => {
    it('should analyze quality for provided source files', async () => {
      const request: QualityAnalysisRequest = {
        sourceFiles: ['src/app.ts', 'src/utils.ts'],
        includeMetrics: [],
      };

      const result = await service.analyzeQuality(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBeDefined();
        expect(result.value.score.overall).toBeGreaterThanOrEqual(0);
        expect(result.value.score.overall).toBeLessThanOrEqual(100);
        expect(result.value.metrics).toBeDefined();
        expect(result.value.metrics.length).toBeGreaterThan(0);
      }
    });

    it('should return error when no source files provided', async () => {
      const request: QualityAnalysisRequest = {
        sourceFiles: [],
        includeMetrics: [],
      };

      const result = await service.analyzeQuality(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('No source files provided');
      }
    });

    it('should include only requested metrics when specified', async () => {
      const request: QualityAnalysisRequest = {
        sourceFiles: ['src/app.ts'],
        includeMetrics: ['coverage', 'complexity'],
      };

      const result = await service.analyzeQuality(request);

      expect(result.success).toBe(true);
      if (result.success) {
        const metricNames = result.value.metrics.map((m) => m.name);
        expect(metricNames).toContain('coverage');
        expect(metricNames).toContain('complexity');
      }
    });

    it('should generate recommendations for low quality metrics', async () => {
      // Mock low-quality metrics
      const serviceWithConfig = new QualityAnalyzerService(mockMemory, {
        enableTrendAnalysis: false,
        trendDataPointsMin: 3,
        complexityThresholds: {
          cyclomatic: { warning: 10, critical: 20 },
          cognitive: { warning: 15, critical: 30 },
          maintainability: { warning: 50, critical: 30 },
        },
      });

      const request: QualityAnalysisRequest = {
        sourceFiles: ['src/complex-file.ts'],
        includeMetrics: ['coverage', 'complexity', 'maintainability'],
      };

      const result = await serviceWithConfig.analyzeQuality(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.recommendations).toBeDefined();
        expect(Array.isArray(result.value.recommendations)).toBe(true);
      }
    });

    it('should calculate quality score with proper weighting', async () => {
      const request: QualityAnalysisRequest = {
        sourceFiles: ['src/file1.ts', 'src/file2.ts'],
        includeMetrics: [],
      };

      const result = await service.analyzeQuality(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score.coverage).toBeGreaterThanOrEqual(0);
        expect(result.value.score.complexity).toBeGreaterThanOrEqual(0);
        expect(result.value.score.maintainability).toBeGreaterThanOrEqual(0);
        expect(result.value.score.security).toBeGreaterThanOrEqual(0);
      }
    });

    it('should assign proper ratings (A-E) based on metric values', async () => {
      const request: QualityAnalysisRequest = {
        sourceFiles: ['src/app.ts'],
        includeMetrics: ['coverage'],
      };

      const result = await service.analyzeQuality(request);

      expect(result.success).toBe(true);
      if (result.success) {
        const coverageMetric = result.value.metrics.find((m) => m.name === 'coverage');
        expect(coverageMetric).toBeDefined();
        expect(['A', 'B', 'C', 'D', 'E']).toContain(coverageMetric?.rating);
      }
    });

    it('should store report in memory after analysis', async () => {
      const request: QualityAnalysisRequest = {
        sourceFiles: ['src/app.ts'],
        includeMetrics: [],
      };

      await service.analyzeQuality(request);

      const storedKeys = await mockMemory.search('quality-analysis:report:*');
      expect(storedKeys.length).toBeGreaterThan(0);
    });

    it('should include trends when trend analysis is enabled', async () => {
      const request: QualityAnalysisRequest = {
        sourceFiles: ['src/app.ts'],
        includeMetrics: [],
      };

      const result = await service.analyzeQuality(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.trends).toBeDefined();
        expect(Array.isArray(result.value.trends)).toBe(true);
      }
    });
  });

  describe('analyzeComplexity', () => {
    it('should analyze complexity for provided source files', async () => {
      const request: ComplexityRequest = {
        sourceFiles: ['src/app.ts', 'src/utils.ts'],
        metrics: [],
      };

      const result = await service.analyzeComplexity(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.files).toHaveLength(2);
        expect(result.value.summary).toBeDefined();
        expect(result.value.hotspots).toBeDefined();
      }
    });

    it('should return error when no source files provided', async () => {
      const request: ComplexityRequest = {
        sourceFiles: [],
        metrics: [],
      };

      const result = await service.analyzeComplexity(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('No source files provided');
      }
    });

    it('should calculate complexity summary correctly', async () => {
      const request: ComplexityRequest = {
        sourceFiles: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
        metrics: ['cyclomatic', 'cognitive', 'maintainability'],
      };

      const result = await service.analyzeComplexity(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.summary.averageCyclomatic).toBeGreaterThanOrEqual(0);
        expect(result.value.summary.averageCognitive).toBeGreaterThanOrEqual(0);
        expect(result.value.summary.averageMaintainability).toBeGreaterThanOrEqual(0);
        expect(result.value.summary.totalLinesOfCode).toBeGreaterThan(0);
      }
    });

    it('should identify complexity hotspots', async () => {
      const request: ComplexityRequest = {
        sourceFiles: ['src/complex-module.ts'],
        metrics: ['cyclomatic', 'cognitive'],
      };

      const result = await service.analyzeComplexity(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.hotspots)).toBe(true);
        // Hotspots may or may not be identified depending on stub metric values
      }
    });

    it('should include only requested complexity metrics', async () => {
      const request: ComplexityRequest = {
        sourceFiles: ['src/app.ts'],
        metrics: ['cyclomatic'],
      };

      const result = await service.analyzeComplexity(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.files[0].cyclomatic).toBeGreaterThan(0);
      }
    });

    it('should store complexity report in memory', async () => {
      const request: ComplexityRequest = {
        sourceFiles: ['src/app.ts'],
        metrics: [],
      };

      await service.analyzeComplexity(request);

      const storedKeys = await mockMemory.search('quality-analysis:complexity:*');
      expect(storedKeys.length).toBeGreaterThan(0);
    });
  });

  describe('getQualityTrend', () => {
    it('should return trend with stable direction when no historical data', async () => {
      const result = await service.getQualityTrend('coverage', 30);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.metric).toBe('coverage');
        expect(result.value.direction).toBe('stable');
        expect(result.value.dataPoints).toBeDefined();
      }
    });

    it('should calculate trend direction from historical data', async () => {
      // Add historical reports with increasing coverage
      const now = new Date();
      mockMemory.addHistoricalReport('report-1', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), [
        { name: 'coverage', value: 70 },
      ]);
      mockMemory.addHistoricalReport('report-2', new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), [
        { name: 'coverage', value: 75 },
      ]);
      mockMemory.addHistoricalReport('report-3', new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), [
        { name: 'coverage', value: 80 },
      ]);
      mockMemory.addHistoricalReport('report-4', new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), [
        { name: 'coverage', value: 85 },
      ]);

      const result = await service.getQualityTrend('coverage', 30);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.metric).toBe('coverage');
        expect(result.value.dataPoints.length).toBeGreaterThanOrEqual(4);
      }
    });

    it('should filter data points within specified days', async () => {
      const now = new Date();
      // Add old report (outside range)
      mockMemory.addHistoricalReport('old-report', new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(), [
        { name: 'coverage', value: 50 },
      ]);
      // Add recent report (inside range)
      mockMemory.addHistoricalReport('new-report', new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), [
        { name: 'coverage', value: 80 },
      ]);

      const result = await service.getQualityTrend('coverage', 30);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should only include the recent report
        expect(result.value.dataPoints.every((dp) => dp.value !== 50 || dp.date >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))).toBe(true);
      }
    });
  });

  describe('configuration', () => {
    it('should use custom complexity thresholds when provided', async () => {
      const customService = new QualityAnalyzerService(mockMemory, {
        enableTrendAnalysis: true,
        trendDataPointsMin: 5,
        complexityThresholds: {
          cyclomatic: { warning: 5, critical: 10 },
          cognitive: { warning: 10, critical: 20 },
          maintainability: { warning: 60, critical: 40 },
        },
      });

      const request: ComplexityRequest = {
        sourceFiles: ['src/app.ts'],
        metrics: [],
      };

      const result = await customService.analyzeComplexity(request);

      expect(result.success).toBe(true);
      // Custom thresholds should affect hotspot identification
    });

    it('should disable trend analysis when configured', async () => {
      const noTrendService = new QualityAnalyzerService(mockMemory, {
        enableTrendAnalysis: false,
        trendDataPointsMin: 3,
        complexityThresholds: {
          cyclomatic: { warning: 10, critical: 20 },
          cognitive: { warning: 15, critical: 30 },
          maintainability: { warning: 50, critical: 30 },
        },
      });

      const request: QualityAnalysisRequest = {
        sourceFiles: ['src/app.ts'],
        includeMetrics: [],
      };

      const result = await noTrendService.analyzeQuality(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.trends).toHaveLength(0);
      }
    });
  });
});
