/**
 * analysis/coverage-analyze-sublinear-handler Test Suite
 *
 * Tests for O(log n) coverage analysis with sublinear algorithms.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CoverageAnalyzeSublinearHandler } from '@mcp/handlers/analysis/coverage-analyze-sublinear-handler';
import type { CoverageAnalyzeSublinearParams } from '@mcp/handlers/analysis/coverageAnalyzeSublinear';

describe('CoverageAnalyzeSublinearHandler', () => {
  let handler: CoverageAnalyzeSublinearHandler;

  beforeEach(() => {
    handler = new CoverageAnalyzeSublinearHandler();
  });

  describe('Happy Path', () => {
    it('should handle valid input successfully', async () => {
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: ['src/auth/login.ts', 'src/utils/validation.ts', 'src/api/users.ts'],
        coverageThreshold: 0.8,
        useJohnsonLindenstrauss: false,
        includeUncoveredLines: true
      };

      const response = await handler.handle(params);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.overallCoverage).toBeGreaterThanOrEqual(0);
      expect(response.data.overallCoverage).toBeLessThanOrEqual(1);
      expect(response.data.fileCoverage).toBeDefined();
      expect(response.data.sublinearMetrics).toBeDefined();
    });

    it('should return expected data structure', async () => {
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: ['src/components/Button.tsx', 'src/components/Input.tsx']
      };

      const response = await handler.handle(params);

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
      expect(response.data).toHaveProperty('overallCoverage');
      expect(response.data).toHaveProperty('fileCoverage');
      expect(response.data).toHaveProperty('sublinearMetrics');
      expect(response.data.sublinearMetrics).toHaveProperty('algorithmUsed');
      expect(response.data.sublinearMetrics).toHaveProperty('originalDimension');
      expect(response.data.sublinearMetrics).toHaveProperty('reducedDimension');
      expect(response.data.sublinearMetrics).toHaveProperty('distortion');
      expect(response.data.sublinearMetrics).toHaveProperty('computationTime');
    });

    it('should use Johnson-Lindenstrauss for large codebases', async () => {
      const largeSourceFiles = Array.from({ length: 150 }, (_, i) => `src/file${i}.ts`);
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: largeSourceFiles,
        useJohnsonLindenstrauss: true,
        targetDimension: 20
      };

      const response = await handler.handle(params);

      expect(response.success).toBe(true);
      expect(response.data.sublinearMetrics.algorithmUsed).toBe('johnson-lindenstrauss');
      expect(response.data.sublinearMetrics.originalDimension).toBe(150);
      expect(response.data.sublinearMetrics.reducedDimension).toBe(20);
    });

    it('should use spectral sparsification for medium codebases', async () => {
      const mediumSourceFiles = Array.from({ length: 75 }, (_, i) => `src/module${i}.ts`);
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: mediumSourceFiles,
        useJohnsonLindenstrauss: false
      };

      const response = await handler.handle(params);

      expect(response.success).toBe(true);
      expect(response.data.sublinearMetrics.algorithmUsed).toBe('spectral-sparsification');
    });

    it('should use adaptive sampling for small codebases', async () => {
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: ['src/main.ts', 'src/config.ts'],
        useJohnsonLindenstrauss: false
      };

      const response = await handler.handle(params);

      expect(response.success).toBe(true);
      expect(response.data.sublinearMetrics.algorithmUsed).toBe('adaptive-sampling');
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid input', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await handler.handle({ invalid: 'data' } as any);

      expect(response.success).toBe(false);
    });

    it('should handle empty source files array', async () => {
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: []
      };

      const response = await handler.handle(params);

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      const response = await handler.handle({ sourceFiles: null } as any);

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle single file analysis', async () => {
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: ['src/single.ts']
      };

      const response = await handler.handle(params);

      expect(response).toHaveProperty('success');
      if (response.success) {
        expect(Object.keys(response.data.fileCoverage).length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle concurrent requests', async () => {
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: ['src/auth.ts', 'src/users.ts']
      };

      const promises = Array.from({ length: 10 }, () =>
        handler.handle(params)
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('metadata');
        expect(result.metadata).toHaveProperty('requestId');
      });
    });

    it('should handle very high coverage threshold', async () => {
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: ['src/test.ts'],
        coverageThreshold: 0.99
      };

      const response = await handler.handle(params);

      expect(response).toHaveProperty('success');
      if (response.success) {
        expect(response.data.recommendations).toBeDefined();
      }
    });

    it('should optionally exclude uncovered lines', async () => {
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: ['src/main.ts'],
        includeUncoveredLines: false
      };

      const response = await handler.handle(params);

      expect(response).toHaveProperty('success');
      if (response.success) {
        expect(response.data.uncoveredRegions).toBeUndefined();
      }
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`)
      };

      const startTime = Date.now();
      await handler.handle(params);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should track computation time in metrics', async () => {
      const params: CoverageAnalyzeSublinearParams = {
        sourceFiles: ['src/a.ts', 'src/b.ts']
      };

      const response = await handler.handle(params);

      if (response.success) {
        expect(response.data.sublinearMetrics.computationTime).toBeGreaterThan(0);
      }
    });
  });
});
