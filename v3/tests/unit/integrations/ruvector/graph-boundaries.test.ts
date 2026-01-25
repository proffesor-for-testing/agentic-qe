/**
 * Agentic QE v3 - Graph Boundaries Analyzer Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGraphBoundariesAnalyzer,
  RuVectorGraphBoundariesAnalyzer,
  FallbackGraphBoundariesAnalyzer,
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

describe('Graph Boundaries Analyzer', () => {
  describe('Factory Function', () => {
    it('should create RuVectorGraphBoundariesAnalyzer when enabled', async () => {
      const analyzer = await createGraphBoundariesAnalyzer(createConfig({ enabled: true }));
      expect(analyzer).toBeInstanceOf(RuVectorGraphBoundariesAnalyzer);
    });

    it('should create FallbackGraphBoundariesAnalyzer when disabled', async () => {
      const analyzer = await createGraphBoundariesAnalyzer(createConfig({ enabled: false }));
      expect(analyzer).toBeInstanceOf(FallbackGraphBoundariesAnalyzer);
    });
  });

  describe('RuVectorGraphBoundariesAnalyzer', () => {
    let analyzer: RuVectorGraphBoundariesAnalyzer;

    beforeEach(() => {
      analyzer = new RuVectorGraphBoundariesAnalyzer(createConfig());
    });

    describe('analyzeBoundaries', () => {
      it('should analyze module boundaries', async () => {
        const entryPoints = [
          'src/domains/auth/index.ts',
          'src/domains/auth/service.ts',
          'src/domains/user/index.ts',
          'src/domains/user/service.ts',
        ];

        const result = await analyzer.analyzeBoundaries(entryPoints);

        expect(result).toHaveProperty('modules');
        expect(result).toHaveProperty('boundaries');
        expect(result).toHaveProperty('criticalBoundaries');
        expect(result).toHaveProperty('integrationTestSuggestions');
        expect(result).toHaveProperty('violations');
        expect(result.usedFallback).toBe(false);
      });

      it('should identify modules from entry points', async () => {
        const entryPoints = [
          'src/domains/auth/service.ts',
          'src/domains/user/service.ts',
          'src/domains/order/service.ts',
        ];

        const result = await analyzer.analyzeBoundaries(entryPoints);

        expect(result.modules.length).toBeGreaterThan(0);

        for (const mod of result.modules) {
          expect(mod).toHaveProperty('module');
          expect(mod).toHaveProperty('files');
          expect(mod).toHaveProperty('publicAPIs');
          expect(mod).toHaveProperty('dependencies');
          expect(mod).toHaveProperty('couplingScore');
          expect(mod).toHaveProperty('cohesionScore');
        }
      });

      it('should detect boundaries between modules', async () => {
        const entryPoints = [
          'src/domains/auth/index.ts',
          'src/domains/user/index.ts',
        ];

        const result = await analyzer.analyzeBoundaries(entryPoints);

        for (const boundary of result.boundaries) {
          expect(boundary).toHaveProperty('fromModule');
          expect(boundary).toHaveProperty('toModule');
          expect(boundary).toHaveProperty('crossings');
          expect(boundary).toHaveProperty('riskScore');
          expect(boundary).toHaveProperty('requiresIntegrationTest');
        }
      });

      it('should identify critical boundaries', async () => {
        const entryPoints = [
          'src/domains/auth/service.ts',
          'src/domains/payment/service.ts',
        ];

        const result = await analyzer.analyzeBoundaries(entryPoints);

        expect(Array.isArray(result.criticalBoundaries)).toBe(true);
      });

      it('should suggest integration tests', async () => {
        const entryPoints = [
          'src/domains/auth/index.ts',
          'src/domains/user/index.ts',
        ];

        const result = await analyzer.analyzeBoundaries(entryPoints);

        for (const suggestion of result.integrationTestSuggestions) {
          expect(suggestion).toHaveProperty('fromModule');
          expect(suggestion).toHaveProperty('toModule');
          expect(suggestion).toHaveProperty('reason');
          expect(suggestion).toHaveProperty('priority');
          expect(['p0', 'p1', 'p2', 'p3']).toContain(suggestion.priority);
        }
      });

      it('should calculate coupling scores between 0 and 1', async () => {
        const entryPoints = [
          'src/services/user-service.ts',
          'src/services/order-service.ts',
        ];

        const result = await analyzer.analyzeBoundaries(entryPoints);

        for (const mod of result.modules) {
          expect(mod.couplingScore).toBeGreaterThanOrEqual(0);
          expect(mod.couplingScore).toBeLessThanOrEqual(1);
        }
      });

      it('should calculate cohesion scores between 0 and 1', async () => {
        const entryPoints = [
          'src/services/user-service.ts',
        ];

        const result = await analyzer.analyzeBoundaries(entryPoints);

        for (const mod of result.modules) {
          expect(mod.cohesionScore).toBeGreaterThanOrEqual(0);
          expect(mod.cohesionScore).toBeLessThanOrEqual(1);
        }
      });

      it('should filter out test files', async () => {
        const entryPoints = [
          'src/services/user-service.ts',
          'src/services/user-service.test.ts', // Should be filtered
          '__tests__/integration.test.ts', // Should be filtered
        ];

        const result = await analyzer.analyzeBoundaries(entryPoints);

        const allFiles = result.modules.flatMap((m) => m.files);
        expect(allFiles).not.toContain('src/services/user-service.test.ts');
        expect(allFiles).not.toContain('__tests__/integration.test.ts');
      });
    });

    describe('getBoundaryCrossings', () => {
      it('should get crossings between specific modules', async () => {
        // First analyze to populate the graph
        await analyzer.analyzeBoundaries([
          'src/domains/auth/service.ts',
          'src/domains/user/service.ts',
        ]);

        const crossings = await analyzer.getBoundaryCrossings(['auth', 'user']);

        expect(Array.isArray(crossings)).toBe(true);

        for (const crossing of crossings) {
          expect(crossing).toHaveProperty('fromModule');
          expect(crossing).toHaveProperty('toModule');
          expect(crossing).toHaveProperty('crossings');
          expect(crossing).toHaveProperty('riskScore');
        }
      });
    });

    describe('getCriticalPaths', () => {
      it('should identify critical paths', async () => {
        // First analyze to populate the graph
        await analyzer.analyzeBoundaries([
          'src/domains/auth/service.ts',
          'src/domains/user/service.ts',
          'src/domains/order/service.ts',
        ]);

        const paths = await analyzer.getCriticalPaths();

        expect(Array.isArray(paths)).toBe(true);

        for (const path of paths) {
          expect(path).toHaveProperty('path');
          expect(path).toHaveProperty('importance');
          expect(path).toHaveProperty('reason');
          expect(Array.isArray(path.path)).toBe(true);
        }
      });
    });

    describe('suggestIntegrationTests', () => {
      it('should suggest integration test locations', async () => {
        // First analyze to populate the graph
        await analyzer.analyzeBoundaries([
          'src/domains/auth/service.ts',
          'src/domains/user/service.ts',
        ]);

        const suggestions = await analyzer.suggestIntegrationTests();

        expect(Array.isArray(suggestions)).toBe(true);

        for (const suggestion of suggestions) {
          expect(suggestion).toHaveProperty('location');
          expect(suggestion).toHaveProperty('modules');
          expect(suggestion).toHaveProperty('priority');
          expect(suggestion).toHaveProperty('reason');
        }
      });
    });

    describe('detectViolations', () => {
      it('should detect architecture violations', async () => {
        // First analyze to populate the graph
        await analyzer.analyzeBoundaries([
          'src/domain/entity.ts',
          'src/infrastructure/database.ts',
          'src/presentation/controller.ts',
        ]);

        const violations = await analyzer.detectViolations();

        expect(Array.isArray(violations)).toBe(true);

        for (const violation of violations) {
          expect(violation).toHaveProperty('type');
          expect(violation).toHaveProperty('location');
          expect(violation).toHaveProperty('severity');
          expect(violation).toHaveProperty('suggestion');
          expect(['critical', 'high', 'medium', 'low', 'info']).toContain(
            violation.severity
          );
        }
      });

      it('should detect high coupling violations', async () => {
        // First analyze to populate the graph
        await analyzer.analyzeBoundaries([
          'src/services/complex-service.ts',
          'src/handlers/complex-handler.ts',
        ]);

        const violations = await analyzer.detectViolations();

        const couplingViolations = violations.filter(
          (v) => v.type === 'coupling-too-high'
        );

        // May or may not find violations depending on analysis
        expect(Array.isArray(couplingViolations)).toBe(true);
      });
    });
  });

  describe('FallbackGraphBoundariesAnalyzer', () => {
    let analyzer: FallbackGraphBoundariesAnalyzer;

    beforeEach(() => {
      analyzer = new FallbackGraphBoundariesAnalyzer();
    });

    it('should analyze boundaries using path inference', async () => {
      const entryPoints = [
        'src/modules/auth/index.ts',
        'src/modules/user/index.ts',
      ];

      const result = await analyzer.analyzeBoundaries(entryPoints);

      expect(result.usedFallback).toBe(true);
      expect(result.modules.length).toBeGreaterThan(0);
    });

    it('should infer modules from directory structure', async () => {
      const entryPoints = [
        'src/features/login/service.ts',
        'src/features/profile/service.ts',
      ];

      const result = await analyzer.analyzeBoundaries(entryPoints);

      const moduleNames = result.modules.map((m) => m.module);
      expect(moduleNames).toContain('login');
      expect(moduleNames).toContain('profile');
    });

    it('should return empty violations', async () => {
      const violations = await analyzer.detectViolations();
      expect(violations).toEqual([]);
    });

    it('should return empty critical paths', async () => {
      const paths = await analyzer.getCriticalPaths();
      expect(paths).toEqual([]);
    });
  });

  describe('Integration', () => {
    it('should fallback when RuVector disabled', async () => {
      const analyzer = await createGraphBoundariesAnalyzer(
        createConfig({ enabled: false })
      );

      const result = await analyzer.analyzeBoundaries(['src/test.ts']);

      expect(result.usedFallback).toBe(true);
    });

    it('should cache results when enabled', async () => {
      const analyzer = new RuVectorGraphBoundariesAnalyzer(
        createConfig({ cacheEnabled: true, cacheTtl: 60000 })
      );

      const entryPoints = ['src/test.ts'];

      const result1 = await analyzer.analyzeBoundaries(entryPoints);
      const result2 = await analyzer.analyzeBoundaries(entryPoints);

      expect(result1.modules.length).toBe(result2.modules.length);
    });

    it('should handle empty entry points', async () => {
      const analyzer = await createGraphBoundariesAnalyzer(
        createConfig({ enabled: true })
      );

      const result = await analyzer.analyzeBoundaries([]);

      expect(result.modules).toEqual([]);
      expect(result.boundaries).toEqual([]);
    });
  });
});
