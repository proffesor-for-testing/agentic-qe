/**
 * Agentic QE v3 - Coverage Router Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCoverageRouter,
  RuVectorCoverageRouter,
  FallbackCoverageRouter,
} from '../../../../src/integrations/ruvector';
import type {
  RuVectorConfig,
  FileCoverage,
} from '../../../../src/integrations/ruvector';

// Test fixtures
function createFileCoverage(overrides: Partial<FileCoverage> = {}): FileCoverage {
  return {
    filePath: 'src/services/user-service.ts',
    lineCoverage: 75,
    branchCoverage: 60,
    functionCoverage: 80,
    statementCoverage: 70,
    uncoveredLines: [10, 11, 12, 25, 30],
    uncoveredBranches: [
      { line: 15, branch: 1 },
      { line: 20, branch: 0 },
    ],
    uncoveredFunctions: ['validateUser', 'processPayment'],
    ...overrides,
  };
}

function createConfig(overrides: Partial<RuVectorConfig> = {}): RuVectorConfig {
  return {
    enabled: true,
    endpoint: 'http://localhost:8080',
    fallbackEnabled: true,
    cacheEnabled: false,
    ...overrides,
  };
}

describe('Coverage Router', () => {
  describe('Factory Function', () => {
    it('should create RuVectorCoverageRouter when enabled', () => {
      const router = createCoverageRouter(createConfig({ enabled: true }));
      expect(router).toBeInstanceOf(RuVectorCoverageRouter);
    });

    it('should create FallbackCoverageRouter when disabled', () => {
      const router = createCoverageRouter(createConfig({ enabled: false }));
      expect(router).toBeInstanceOf(FallbackCoverageRouter);
    });
  });

  describe('RuVectorCoverageRouter', () => {
    let router: RuVectorCoverageRouter;

    beforeEach(() => {
      router = new RuVectorCoverageRouter(createConfig());
    });

    describe('analyzeCoverage', () => {
      it('should analyze coverage data', async () => {
        const coverageData = [
          createFileCoverage({ filePath: 'src/a.ts', lineCoverage: 50 }),
          createFileCoverage({ filePath: 'src/b.ts', lineCoverage: 90 }),
        ];

        const result = await router.analyzeCoverage(coverageData, 80);

        expect(result).toHaveProperty('prioritizedFiles');
        expect(result).toHaveProperty('testGenerationTargets');
        expect(result).toHaveProperty('agentAssignments');
        expect(result.usedFallback).toBe(false);
      });

      it('should prioritize files below target coverage', async () => {
        const coverageData = [
          createFileCoverage({ filePath: 'src/low.ts', lineCoverage: 30 }),
          createFileCoverage({ filePath: 'src/medium.ts', lineCoverage: 60 }),
          createFileCoverage({ filePath: 'src/high.ts', lineCoverage: 90 }),
        ];

        const result = await router.analyzeCoverage(coverageData, 80);

        // Only files below 80% should be prioritized
        const prioritizedPaths = result.prioritizedFiles.map((f) => f.filePath);
        expect(prioritizedPaths).toContain('src/low.ts');
        expect(prioritizedPaths).toContain('src/medium.ts');
        expect(prioritizedPaths).not.toContain('src/high.ts');
      });

      it('should assign higher priority to lower coverage files', async () => {
        const coverageData = [
          createFileCoverage({ filePath: 'src/a.ts', lineCoverage: 20 }),
          createFileCoverage({ filePath: 'src/b.ts', lineCoverage: 60 }),
        ];

        const result = await router.analyzeCoverage(coverageData, 80);

        const priorities = result.prioritizedFiles.map((f) => f.priority);
        expect(['p0', 'p1']).toContain(priorities[0]);
      });

      it('should include gaps for each prioritized file', async () => {
        const coverageData = [
          createFileCoverage({
            filePath: 'src/test.ts',
            lineCoverage: 50,
            uncoveredLines: [1, 2, 3],
          }),
        ];

        const result = await router.analyzeCoverage(coverageData, 80);

        expect(result.prioritizedFiles[0].gaps.length).toBeGreaterThan(0);
      });

      it('should identify test generation targets', async () => {
        const coverageData = [
          createFileCoverage({
            uncoveredFunctions: ['func1', 'func2'],
          }),
        ];

        const result = await router.analyzeCoverage(coverageData, 80);

        expect(result.testGenerationTargets.length).toBeGreaterThan(0);
        expect(result.testGenerationTargets[0].functions).toContain('func1');
      });

      it('should assign agents for coverage improvement', async () => {
        const coverageData = [
          createFileCoverage({ filePath: 'src/critical.ts', lineCoverage: 20 }),
          createFileCoverage({ filePath: 'src/high.ts', lineCoverage: 45 }),
          createFileCoverage({ filePath: 'src/medium.ts', lineCoverage: 65 }),
        ];

        const result = await router.analyzeCoverage(coverageData, 80);

        expect(result.agentAssignments.length).toBeGreaterThan(0);

        for (const assignment of result.agentAssignments) {
          expect(assignment).toHaveProperty('agentType');
          expect(assignment).toHaveProperty('domain');
          expect(assignment).toHaveProperty('files');
        }
      });
    });

    describe('getCoverageGaps', () => {
      it('should identify line coverage gaps', async () => {
        const coverageData = [
          createFileCoverage({
            lineCoverage: 50,
            uncoveredLines: [1, 2, 3, 10, 11],
          }),
        ];

        const gaps = await router.getCoverageGaps(coverageData);

        const lineGaps = gaps.filter((g) => g.gapType === 'line');
        expect(lineGaps.length).toBeGreaterThan(0);
      });

      it('should identify branch coverage gaps', async () => {
        const coverageData = [
          createFileCoverage({
            branchCoverage: 40,
            uncoveredBranches: [{ line: 5, branch: 0 }],
          }),
        ];

        const gaps = await router.getCoverageGaps(coverageData);

        const branchGaps = gaps.filter((g) => g.gapType === 'branch');
        expect(branchGaps.length).toBeGreaterThan(0);
      });

      it('should identify function coverage gaps', async () => {
        const coverageData = [
          createFileCoverage({
            functionCoverage: 60,
            uncoveredFunctions: ['myFunction'],
          }),
        ];

        const gaps = await router.getCoverageGaps(coverageData);

        const functionGaps = gaps.filter((g) => g.gapType === 'function');
        expect(functionGaps.length).toBeGreaterThan(0);
        expect(functionGaps[0].functions).toContain('myFunction');
      });

      it('should detect integration test gaps', async () => {
        const coverageData = [
          createFileCoverage({
            functionCoverage: 85,
            lineCoverage: 45,
            branchCoverage: 30,
          }),
        ];

        const gaps = await router.getCoverageGaps(coverageData);

        const integrationGaps = gaps.filter((g) => g.gapType === 'integration');
        expect(integrationGaps.length).toBeGreaterThan(0);
      });

      it('should assign severity based on coverage level', async () => {
        const coverageData = [
          createFileCoverage({
            lineCoverage: 20, // Critical
            uncoveredLines: [1, 2, 3],
          }),
        ];

        const gaps = await router.getCoverageGaps(coverageData);

        expect(gaps.some((g) => g.severity === 'critical')).toBe(true);
      });
    });

    describe('prioritizeForCoverage', () => {
      it('should sort files by coverage ascending', async () => {
        const files = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
        const coverageData = [
          createFileCoverage({ filePath: 'src/a.ts', lineCoverage: 80 }),
          createFileCoverage({ filePath: 'src/b.ts', lineCoverage: 40 }),
          createFileCoverage({ filePath: 'src/c.ts', lineCoverage: 60 }),
        ];

        const prioritized = await router.prioritizeForCoverage(files, coverageData);

        expect(prioritized[0]).toBe('src/b.ts'); // Lowest coverage
        expect(prioritized[1]).toBe('src/c.ts');
        expect(prioritized[2]).toBe('src/a.ts'); // Highest coverage
      });

      it('should handle files not in coverage data', async () => {
        const files = ['src/a.ts', 'src/missing.ts'];
        const coverageData = [
          createFileCoverage({ filePath: 'src/a.ts', lineCoverage: 50 }),
        ];

        const prioritized = await router.prioritizeForCoverage(files, coverageData);

        expect(prioritized).toContain('src/a.ts');
        expect(prioritized).toContain('src/missing.ts');
      });
    });

    describe('suggestTestsForCoverage', () => {
      it('should suggest unit tests for uncovered functions', async () => {
        const coverage = createFileCoverage({
          uncoveredFunctions: ['funcA', 'funcB'],
        });

        const suggestions = await router.suggestTestsForCoverage(
          'src/test.ts',
          coverage
        );

        const unitTests = suggestions.filter((s) => s.testType === 'unit');
        expect(unitTests.length).toBeGreaterThanOrEqual(2);
      });

      it('should suggest branch tests for uncovered branches', async () => {
        const coverage = createFileCoverage({
          branchCoverage: 50,
          uncoveredBranches: [{ line: 10, branch: 0 }],
        });

        const suggestions = await router.suggestTestsForCoverage(
          'src/test.ts',
          coverage
        );

        const branchTests = suggestions.filter((s) => s.testType === 'branch');
        expect(branchTests.length).toBeGreaterThan(0);
      });

      it('should suggest line coverage tests for large gaps', async () => {
        const coverage = createFileCoverage({
          lineCoverage: 40,
          uncoveredLines: Array.from({ length: 20 }, (_, i) => i + 1),
        });

        const suggestions = await router.suggestTestsForCoverage(
          'src/test.ts',
          coverage
        );

        const lineTests = suggestions.filter((s) => s.testType === 'line');
        expect(lineTests.length).toBeGreaterThan(0);
      });

      it('should include expected coverage gain', async () => {
        const coverage = createFileCoverage({
          functionCoverage: 50,
          uncoveredFunctions: ['func'],
        });

        const suggestions = await router.suggestTestsForCoverage(
          'src/test.ts',
          coverage
        );

        expect(suggestions[0]).toHaveProperty('expectedCoverageGain');
        expect(suggestions[0].expectedCoverageGain).toBeGreaterThan(0);
      });
    });
  });

  describe('FallbackCoverageRouter', () => {
    let router: FallbackCoverageRouter;

    beforeEach(() => {
      router = new FallbackCoverageRouter();
    });

    it('should analyze coverage using rules', async () => {
      const coverageData = [createFileCoverage()];
      const result = await router.analyzeCoverage(coverageData, 80);

      expect(result.usedFallback).toBe(true);
      expect(result).toHaveProperty('prioritizedFiles');
    });

    it('should identify coverage gaps', async () => {
      const coverageData = [
        createFileCoverage({
          uncoveredLines: [1, 2, 3],
          uncoveredFunctions: ['test'],
        }),
      ];

      const gaps = await router.getCoverageGaps(coverageData);

      expect(gaps.length).toBeGreaterThan(0);
    });
  });

  describe('Integration', () => {
    it('should fallback when RuVector disabled', async () => {
      const router = createCoverageRouter(createConfig({ enabled: false }));
      const result = await router.analyzeCoverage([createFileCoverage()], 80);

      expect(result.usedFallback).toBe(true);
    });

    it('should cache results when enabled', async () => {
      const router = new RuVectorCoverageRouter(
        createConfig({ cacheEnabled: true, cacheTtl: 60000 })
      );
      const coverageData = [createFileCoverage()];

      const result1 = await router.analyzeCoverage(coverageData, 80);
      const result2 = await router.analyzeCoverage(coverageData, 80);

      expect(result1.prioritizedFiles.length).toBe(result2.prioritizedFiles.length);
    });
  });
});
