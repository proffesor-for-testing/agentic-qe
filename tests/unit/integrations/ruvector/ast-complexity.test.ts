/**
 * Agentic QE v3 - AST Complexity Analyzer Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createASTComplexityAnalyzer,
  RuVectorASTComplexityAnalyzer,
  FallbackASTComplexityAnalyzer,
} from '../../../../src/integrations/ruvector';
import type { RuVectorConfig } from '../../../../src/integrations/ruvector';

function createConfig(overrides: Partial<RuVectorConfig> = {}): RuVectorConfig {
  return {
    enabled: true,
    endpoint: 'http://localhost:8080',
    fallbackEnabled: true,
    cacheEnabled: false,
    ...overrides,
  };
}

describe('AST Complexity Analyzer', () => {
  describe('Factory Function', () => {
    it('should create RuVectorASTComplexityAnalyzer when enabled', async () => {
      const analyzer = await createASTComplexityAnalyzer(createConfig({ enabled: true }));
      expect(analyzer).toBeInstanceOf(RuVectorASTComplexityAnalyzer);
    });

    it('should create FallbackASTComplexityAnalyzer when disabled', async () => {
      const analyzer = await createASTComplexityAnalyzer(createConfig({ enabled: false }));
      expect(analyzer).toBeInstanceOf(FallbackASTComplexityAnalyzer);
    });
  });

  describe('RuVectorASTComplexityAnalyzer', () => {
    let analyzer: RuVectorASTComplexityAnalyzer;

    beforeEach(() => {
      analyzer = new RuVectorASTComplexityAnalyzer(createConfig());
    });

    describe('analyzeFile', () => {
      it('should analyze a TypeScript file', async () => {
        const result = await analyzer.analyzeFile('src/services/user-service.ts');

        expect(result).toHaveProperty('filePath', 'src/services/user-service.ts');
        expect(result).toHaveProperty('metrics');
        expect(result).toHaveProperty('overallScore');
        expect(result).toHaveProperty('riskLevel');
        expect(result).toHaveProperty('hotspots');
        expect(result).toHaveProperty('recommendations');
        expect(result).toHaveProperty('analyzedAt');
        expect(result.usedFallback).toBe(false);
      });

      it('should return valid complexity metrics', async () => {
        const result = await analyzer.analyzeFile('src/handlers/complex-handler.ts');

        expect(result.metrics).toHaveProperty('cyclomatic');
        expect(result.metrics).toHaveProperty('cognitive');
        expect(result.metrics).toHaveProperty('linesOfCode');
        expect(result.metrics).toHaveProperty('dependencies');
        expect(result.metrics).toHaveProperty('inheritanceDepth');
        expect(result.metrics).toHaveProperty('coupling');
        expect(result.metrics).toHaveProperty('cohesion');
        expect(result.metrics).toHaveProperty('maintainabilityIndex');

        // Validate ranges
        expect(result.metrics.cyclomatic).toBeGreaterThanOrEqual(1);
        expect(result.metrics.coupling).toBeGreaterThanOrEqual(0);
        expect(result.metrics.coupling).toBeLessThanOrEqual(1);
        expect(result.metrics.cohesion).toBeGreaterThanOrEqual(0);
        expect(result.metrics.cohesion).toBeLessThanOrEqual(1);
        expect(result.metrics.maintainabilityIndex).toBeGreaterThanOrEqual(0);
        expect(result.metrics.maintainabilityIndex).toBeLessThanOrEqual(100);
      });

      it('should return overall score between 0 and 1', async () => {
        const result = await analyzer.analyzeFile('src/utils/helper.ts');

        expect(result.overallScore).toBeGreaterThanOrEqual(0);
        expect(result.overallScore).toBeLessThanOrEqual(1);
      });

      it('should return valid risk level', async () => {
        const result = await analyzer.analyzeFile('src/engine/core-engine.ts');

        expect(['critical', 'high', 'medium', 'low', 'info']).toContain(result.riskLevel);
      });

      it('should identify hotspots for complex files', async () => {
        const result = await analyzer.analyzeFile('src/coordinator/main-coordinator.ts');

        expect(Array.isArray(result.hotspots)).toBe(true);
        for (const hotspot of result.hotspots) {
          expect(hotspot).toHaveProperty('name');
          expect(hotspot).toHaveProperty('line');
          expect(hotspot).toHaveProperty('complexity');
        }
      });

      it('should generate recommendations', async () => {
        const result = await analyzer.analyzeFile('src/services/complex-service.ts');

        expect(Array.isArray(result.recommendations)).toBe(true);
      });

      it('should cache results when enabled', async () => {
        const cachingAnalyzer = new RuVectorASTComplexityAnalyzer(
          createConfig({ cacheEnabled: true, cacheTtl: 60000 })
        );

        const result1 = await cachingAnalyzer.analyzeFile('src/test.ts');
        const result2 = await cachingAnalyzer.analyzeFile('src/test.ts');

        // Results should be identical (cached)
        expect(result1.overallScore).toBe(result2.overallScore);
      });
    });

    describe('analyzeFiles', () => {
      it('should analyze multiple files', async () => {
        const files = [
          'src/services/user-service.ts',
          'src/services/order-service.ts',
          'src/utils/helper.ts',
        ];

        const results = await analyzer.analyzeFiles(files);

        expect(results).toHaveLength(3);
        results.forEach((result, i) => {
          expect(result.filePath).toBe(files[i]);
        });
      });
    });

    describe('getComplexityRanking', () => {
      it('should rank files by complexity', async () => {
        const files = [
          'src/utils/simple.ts',
          'src/engine/complex-engine.ts',
          'src/services/medium-service.ts',
        ];

        const ranking = await analyzer.getComplexityRanking(files);

        expect(ranking).toHaveLength(3);
        ranking.forEach((item) => {
          expect(item).toHaveProperty('filePath');
          expect(item).toHaveProperty('score');
          expect(item).toHaveProperty('priority');
          expect(['p0', 'p1', 'p2', 'p3']).toContain(item.priority);
        });

        // Should be sorted by score descending
        for (let i = 1; i < ranking.length; i++) {
          expect(ranking[i - 1].score).toBeGreaterThanOrEqual(ranking[i].score);
        }
      });
    });

    describe('suggestTestFocus', () => {
      it('should suggest test focus areas', async () => {
        const files = [
          'src/services/complex-service.ts',
          'src/utils/simple.ts',
        ];

        const suggestions = await analyzer.suggestTestFocus(files);

        expect(Array.isArray(suggestions)).toBe(true);
        for (const suggestion of suggestions) {
          expect(suggestion).toHaveProperty('filePath');
          expect(suggestion).toHaveProperty('functions');
          expect(suggestion).toHaveProperty('reason');
        }
      });
    });
  });

  describe('FallbackASTComplexityAnalyzer', () => {
    let analyzer: FallbackASTComplexityAnalyzer;

    beforeEach(() => {
      analyzer = new FallbackASTComplexityAnalyzer();
    });

    it('should analyze files using estimation', async () => {
      const result = await analyzer.analyzeFile('src/services/user-service.ts');

      expect(result.usedFallback).toBe(true);
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('overallScore');
    });

    it('should estimate higher complexity for service files', async () => {
      const serviceResult = await analyzer.analyzeFile('src/services/complex-service.ts');
      const utilResult = await analyzer.analyzeFile('src/utils/helper.ts');

      // Services typically have higher complexity
      expect(serviceResult.metrics.cyclomatic).toBeGreaterThan(utilResult.metrics.cyclomatic);
    });

    it('should estimate lower complexity for type files', async () => {
      const typeResult = await analyzer.analyzeFile('src/types/interfaces.ts');
      const serviceResult = await analyzer.analyzeFile('src/services/service.ts');

      expect(typeResult.metrics.cyclomatic).toBeLessThan(serviceResult.metrics.cyclomatic);
    });

    it('should estimate lower complexity for test files', async () => {
      const testResult = await analyzer.analyzeFile('src/services/service.test.ts');
      const serviceResult = await analyzer.analyzeFile('src/services/service.ts');

      expect(testResult.metrics.cyclomatic).toBeLessThan(serviceResult.metrics.cyclomatic);
    });
  });

  describe('Integration', () => {
    it('should fallback when RuVector disabled', async () => {
      const analyzer = await createASTComplexityAnalyzer(createConfig({ enabled: false }));
      const result = await analyzer.analyzeFile('src/test.ts');

      expect(result.usedFallback).toBe(true);
    });

    it('should provide consistent results for same file', async () => {
      const analyzer = await createASTComplexityAnalyzer(createConfig({ enabled: true }));

      const result1 = await analyzer.analyzeFile('src/test.ts');
      const result2 = await analyzer.analyzeFile('src/test.ts');

      // Results should be consistent
      expect(result1.overallScore).toBeCloseTo(result2.overallScore, 2);
      expect(result1.riskLevel).toBe(result2.riskLevel);
    });
  });
});
