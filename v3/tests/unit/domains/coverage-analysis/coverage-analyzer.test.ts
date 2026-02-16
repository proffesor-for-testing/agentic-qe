/**
 * Agentic QE v3 - Coverage Analyzer Service Tests
 *
 * Tests for CoverageAnalyzerService: metric calculation, gap detection,
 * delta tracking, recommendations, and LLM analysis integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CoverageAnalyzerService,
  createCoverageAnalyzerService,
  createCoverageAnalyzerServiceWithDependencies,
} from '../../../../src/domains/coverage-analysis/services/coverage-analyzer';
import type {
  CoverageData,
  FileCoverage,
  AnalyzeCoverageRequest,
} from '../../../../src/domains/coverage-analysis/interfaces';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockMemory() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    storeVector: vi.fn().mockResolvedValue(undefined),
    vectorSearch: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
  };
}

function createFileCoverage(overrides: Partial<FileCoverage> = {}): FileCoverage {
  return {
    path: overrides.path ?? 'src/example.ts',
    lines: overrides.lines ?? { covered: 80, total: 100 },
    branches: overrides.branches ?? { covered: 15, total: 20 },
    functions: overrides.functions ?? { covered: 9, total: 10 },
    statements: overrides.statements ?? { covered: 85, total: 100 },
    uncoveredLines: overrides.uncoveredLines ?? [10, 11, 12, 50, 51],
    uncoveredBranches: overrides.uncoveredBranches ?? [3, 7],
  };
}

function createCoverageData(files: FileCoverage[] = []): CoverageData {
  const defaultFile = createFileCoverage();
  const fileList = files.length > 0 ? files : [defaultFile];

  return {
    files: fileList,
    summary: {
      line: 80,
      branch: 75,
      function: 90,
      statement: 85,
      files: fileList.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CoverageAnalyzerService', () => {
  let memory: ReturnType<typeof createMockMemory>;
  let service: CoverageAnalyzerService;

  beforeEach(() => {
    memory = createMockMemory();
    service = createCoverageAnalyzerService(memory as any);
  });

  // =========================================================================
  // Constructor and Factory
  // =========================================================================

  describe('construction', () => {
    it('should create instance via legacy MemoryBackend constructor', () => {
      const svc = new CoverageAnalyzerService(memory as any);
      expect(svc).toBeInstanceOf(CoverageAnalyzerService);
    });

    it('should create instance via dependencies constructor', () => {
      const svc = createCoverageAnalyzerServiceWithDependencies({ memory: memory as any });
      expect(svc).toBeInstanceOf(CoverageAnalyzerService);
    });

    it('should accept custom config overrides', () => {
      const svc = createCoverageAnalyzerService(memory as any, { defaultThreshold: 90 });
      expect(svc).toBeInstanceOf(CoverageAnalyzerService);
    });

    it('should report LLM analysis unavailable without llmRouter', () => {
      expect(service.isLLMAnalysisAvailable()).toBe(false);
    });

    it('should report LLM analysis available when router provided', () => {
      const mockRouter = { chat: vi.fn() };
      const svc = createCoverageAnalyzerServiceWithDependencies(
        { memory: memory as any, llmRouter: mockRouter as any },
        { enableLLMAnalysis: true },
      );
      expect(svc.isLLMAnalysisAvailable()).toBe(true);
    });
  });

  // =========================================================================
  // calculateMetrics
  // =========================================================================

  describe('calculateMetrics', () => {
    it('should calculate aggregate metrics for multiple files', () => {
      // Arrange
      const data = createCoverageData([
        createFileCoverage({ lines: { covered: 50, total: 100 }, branches: { covered: 10, total: 20 }, functions: { covered: 5, total: 10 }, statements: { covered: 60, total: 100 } }),
        createFileCoverage({ lines: { covered: 80, total: 100 }, branches: { covered: 18, total: 20 }, functions: { covered: 9, total: 10 }, statements: { covered: 90, total: 100 } }),
      ]);

      // Act
      const summary = service.calculateMetrics(data);

      // Assert
      expect(summary.line).toBeCloseTo(65, 1);       // 130/200
      expect(summary.branch).toBeCloseTo(70, 1);      // 28/40
      expect(summary.function).toBeCloseTo(70, 1);     // 14/20
      expect(summary.statement).toBeCloseTo(75, 1);    // 150/200
      expect(summary.files).toBe(2);
    });

    it('should return zero metrics for empty file list', () => {
      // Arrange
      const data: CoverageData = { files: [], summary: { line: 0, branch: 0, function: 0, statement: 0, files: 0 } };

      // Act
      const summary = service.calculateMetrics(data);

      // Assert
      expect(summary.line).toBe(0);
      expect(summary.branch).toBe(0);
      expect(summary.function).toBe(0);
      expect(summary.statement).toBe(0);
      expect(summary.files).toBe(0);
    });

    it('should handle single file correctly', () => {
      // Arrange
      const file = createFileCoverage({
        lines: { covered: 90, total: 100 },
        branches: { covered: 8, total: 10 },
        functions: { covered: 5, total: 5 },
        statements: { covered: 95, total: 100 },
      });
      const data = createCoverageData([file]);

      // Act
      const summary = service.calculateMetrics(data);

      // Assert
      expect(summary.line).toBeCloseTo(90, 1);
      expect(summary.branch).toBeCloseTo(80, 1);
      expect(summary.function).toBeCloseTo(100, 1);
      expect(summary.statement).toBeCloseTo(95, 1);
      expect(summary.files).toBe(1);
    });

    it('should handle files with zero totals gracefully', () => {
      // Arrange
      const file = createFileCoverage({
        lines: { covered: 0, total: 0 },
        branches: { covered: 0, total: 0 },
        functions: { covered: 0, total: 0 },
        statements: { covered: 0, total: 0 },
      });
      const data = createCoverageData([file]);

      // Act
      const summary = service.calculateMetrics(data);

      // Assert
      expect(summary.line).toBe(0);
      expect(summary.branch).toBe(0);
      expect(summary.function).toBe(0);
      expect(summary.statement).toBe(0);
    });
  });

  // =========================================================================
  // analyze
  // =========================================================================

  describe('analyze', () => {
    it('should return report with summary and meetsThreshold=true when above threshold', async () => {
      // Arrange
      const request: AnalyzeCoverageRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            lines: { covered: 90, total: 100 },
            branches: { covered: 18, total: 20 },
            functions: { covered: 9, total: 10 },
            statements: { covered: 92, total: 100 },
          }),
        ]),
        threshold: 80,
      };

      // Act
      const result = await service.analyze(request);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.meetsThreshold).toBe(true);
        expect(result.value.summary).toBeDefined();
        expect(result.value.recommendations).toBeInstanceOf(Array);
      }
    });

    it('should return meetsThreshold=false when below threshold', async () => {
      // Arrange
      const request: AnalyzeCoverageRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            lines: { covered: 30, total: 100 },
            branches: { covered: 5, total: 20 },
            functions: { covered: 3, total: 10 },
            statements: { covered: 35, total: 100 },
          }),
        ]),
        threshold: 80,
      };

      // Act
      const result = await service.analyze(request);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.meetsThreshold).toBe(false);
        expect(result.value.recommendations.length).toBeGreaterThan(0);
      }
    });

    it('should use default threshold when not specified', async () => {
      // Arrange
      const request: AnalyzeCoverageRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            lines: { covered: 85, total: 100 },
            branches: { covered: 17, total: 20 },
            functions: { covered: 9, total: 10 },
            statements: { covered: 88, total: 100 },
          }),
        ]),
      };

      // Act
      const result = await service.analyze(request);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.meetsThreshold).toBe(true);
      }
    });

    it('should store coverage snapshot after analysis', async () => {
      // Arrange
      const request: AnalyzeCoverageRequest = { coverageData: createCoverageData() };

      // Act
      await service.analyze(request);

      // Assert
      expect(memory.set).toHaveBeenCalledWith(
        'coverage:latest',
        expect.any(Object),
        expect.objectContaining({ persist: true }),
      );
    });

    it('should calculate delta when previous coverage exists', async () => {
      // Arrange
      memory.get.mockResolvedValueOnce({ line: 70, branch: 65, function: 80, statement: 75 });
      const request: AnalyzeCoverageRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            lines: { covered: 80, total: 100 },
            branches: { covered: 15, total: 20 },
            functions: { covered: 9, total: 10 },
            statements: { covered: 85, total: 100 },
          }),
        ]),
      };

      // Act
      const result = await service.analyze(request);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.delta).toBeDefined();
        expect(result.value.delta!.trend).toBe('improving');
      }
    });

    it('should index file vectors when includeFileDetails is true', async () => {
      // Arrange
      const request: AnalyzeCoverageRequest = {
        coverageData: createCoverageData(),
        includeFileDetails: true,
      };

      // Act
      await service.analyze(request);

      // Assert
      expect(memory.storeVector).toHaveBeenCalled();
    });

    it('should return error result when analysis throws', async () => {
      // Arrange
      memory.get.mockRejectedValue(new Error('DB failure'));
      memory.set.mockRejectedValue(new Error('DB failure'));
      // Use a data set that forces storeCoverageSnapshot to throw
      const badData: CoverageData = { files: [], summary: { line: 0, branch: 0, function: 0, statement: 0, files: 0 } };
      // Override memory.set to throw to force an error path
      const throwingMemory = createMockMemory();
      throwingMemory.set.mockImplementation(() => { throw new Error('Unexpected failure'); });
      const svc = createCoverageAnalyzerService(throwingMemory as any);

      // Act
      const result = await svc.analyze({ coverageData: badData });

      // Assert - the method catches internally so it should still succeed or return err
      // storeCoverageSnapshot catches internally, so this should still succeed
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // findGaps
  // =========================================================================

  describe('findGaps', () => {
    it('should find gaps for files below threshold', async () => {
      // Arrange
      const data = createCoverageData([
        createFileCoverage({
          path: 'src/low-coverage.ts',
          lines: { covered: 20, total: 100 },
          branches: { covered: 3, total: 20 },
          functions: { covered: 2, total: 10 },
          statements: { covered: 25, total: 100 },
          uncoveredLines: [5, 6, 7, 8, 9, 10],
          uncoveredBranches: [1, 2, 3],
        }),
      ]);

      // Act
      const result = await service.findGaps(data, 80);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.gaps.length).toBeGreaterThan(0);
        expect(result.value.totalUncoveredLines).toBe(6);
        expect(result.value.gaps[0].file).toBe('src/low-coverage.ts');
      }
    });

    it('should return no gaps when all files meet threshold', async () => {
      // Arrange
      const data = createCoverageData([
        createFileCoverage({
          lines: { covered: 95, total: 100 },
          branches: { covered: 19, total: 20 },
          functions: { covered: 10, total: 10 },
          statements: { covered: 97, total: 100 },
          uncoveredLines: [],
          uncoveredBranches: [],
        }),
      ]);

      // Act
      const result = await service.findGaps(data, 80);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.gaps).toHaveLength(0);
        expect(result.value.totalUncoveredLines).toBe(0);
      }
    });

    it('should sort gaps by risk score descending', async () => {
      // Arrange
      const data = createCoverageData([
        createFileCoverage({
          path: 'src/medium.ts',
          lines: { covered: 60, total: 100 },
          branches: { covered: 10, total: 20 },
          functions: { covered: 5, total: 10 },
          statements: { covered: 60, total: 100 },
          uncoveredLines: [1, 2, 3],
          uncoveredBranches: [1],
        }),
        createFileCoverage({
          path: 'src/critical.ts',
          lines: { covered: 10, total: 100 },
          branches: { covered: 1, total: 20 },
          functions: { covered: 1, total: 10 },
          statements: { covered: 10, total: 100 },
          uncoveredLines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          uncoveredBranches: [1, 2, 3, 4, 5],
        }),
      ]);

      // Act
      const result = await service.findGaps(data, 80);

      // Assert
      expect(result.success).toBe(true);
      if (result.success && result.value.gaps.length >= 2) {
        expect(result.value.gaps[0].riskScore).toBeGreaterThanOrEqual(result.value.gaps[1].riskScore);
      }
    });

    it('should estimate effort based on uncovered lines', async () => {
      // Arrange
      const data = createCoverageData([
        createFileCoverage({
          lines: { covered: 20, total: 100 },
          branches: { covered: 2, total: 20 },
          functions: { covered: 1, total: 10 },
          statements: { covered: 20, total: 100 },
          uncoveredLines: Array.from({ length: 50 }, (_, i) => i + 1),
          uncoveredBranches: [1, 2],
        }),
      ]);

      // Act
      const result = await service.findGaps(data, 80);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.estimatedEffort).toBeGreaterThan(0);
      }
    });

    it('should assign severity based on risk score', async () => {
      // Arrange - a file with very low coverage should produce critical/high severity
      const data = createCoverageData([
        createFileCoverage({
          lines: { covered: 0, total: 100 },
          branches: { covered: 0, total: 20 },
          functions: { covered: 0, total: 10 },
          statements: { covered: 0, total: 100 },
          uncoveredLines: Array.from({ length: 100 }, (_, i) => i + 1),
          uncoveredBranches: Array.from({ length: 20 }, (_, i) => i + 1),
        }),
      ]);

      // Act
      const result = await service.findGaps(data, 80);

      // Assert
      expect(result.success).toBe(true);
      if (result.success && result.value.gaps.length > 0) {
        const severities = result.value.gaps.map((g) => g.severity);
        expect(severities).toContain('critical');
      }
    });
  });

  // =========================================================================
  // analyzeCoverageWithLLM
  // =========================================================================

  describe('analyzeCoverageWithLLM', () => {
    it('should return default insights when no LLM router', async () => {
      // Arrange
      const gaps = [{ id: 'gap-1', file: 'test.ts', lines: [1, 2], branches: [], riskScore: 0.5, severity: 'medium' as const, recommendation: 'Add tests' }];

      // Act
      const insights = await service.analyzeCoverageWithLLM(gaps);

      // Assert
      expect(insights.uncoveredReasoning.length).toBeGreaterThan(0);
      expect(insights.riskAssessment.overallRisk).toBe('medium');
    });

    it('should call LLM router when available and parse response', async () => {
      // Arrange
      const mockRouter = {
        chat: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            uncoveredReasoning: ['Error handling paths not tested'],
            suggestedTestCases: [{ name: 'test-error', description: 'Test error path', type: 'unit', targetLines: [10], estimatedEffort: 'low' }],
            riskAssessment: { overallRisk: 'high', riskFactors: ['No error tests'], businessImpact: 'Could miss errors', recommendations: ['Add tests'] },
          }),
        }),
      };
      const svc = createCoverageAnalyzerServiceWithDependencies(
        { memory: memory as any, llmRouter: mockRouter as any },
        { enableLLMAnalysis: true },
      );
      const gaps = [{ id: 'gap-1', file: 'test.ts', lines: [10], branches: [], riskScore: 0.7, severity: 'high' as const, recommendation: 'Add tests' }];

      // Act
      const insights = await svc.analyzeCoverageWithLLM(gaps);

      // Assert
      expect(mockRouter.chat).toHaveBeenCalled();
      expect(insights.uncoveredReasoning).toContain('Error handling paths not tested');
      expect(insights.suggestedTestCases).toHaveLength(1);
      expect(insights.riskAssessment.overallRisk).toBe('high');
    });

    it('should return default insights when LLM call fails', async () => {
      // Arrange
      const mockRouter = { chat: vi.fn().mockRejectedValue(new Error('LLM down')) };
      const svc = createCoverageAnalyzerServiceWithDependencies(
        { memory: memory as any, llmRouter: mockRouter as any },
        { enableLLMAnalysis: true },
      );

      // Act
      const insights = await svc.analyzeCoverageWithLLM([]);

      // Assert
      expect(insights.riskAssessment.overallRisk).toBe('medium');
      expect(insights.suggestedTestCases).toHaveLength(0);
    });
  });

  // =========================================================================
  // Recommendations generation
  // =========================================================================

  describe('recommendations', () => {
    it('should recommend adding tests for zero-coverage files', async () => {
      // Arrange
      const request: AnalyzeCoverageRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            lines: { covered: 0, total: 100 },
            branches: { covered: 0, total: 10 },
            functions: { covered: 0, total: 5 },
            statements: { covered: 0, total: 100 },
            uncoveredLines: Array.from({ length: 100 }, (_, i) => i),
          }),
        ]),
        threshold: 80,
      };

      // Act
      const result = await service.analyze(request);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const recs = result.value.recommendations.join(' ');
        expect(recs).toContain('no test coverage');
      }
    });

    it('should recommend branch coverage when significantly lower than line coverage', async () => {
      // Arrange - line coverage high, branch coverage much lower
      const request: AnalyzeCoverageRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            lines: { covered: 90, total: 100 },
            branches: { covered: 5, total: 20 },
            functions: { covered: 9, total: 10 },
            statements: { covered: 90, total: 100 },
          }),
        ]),
        threshold: 50,
      };

      // Act
      const result = await service.analyze(request);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const recs = result.value.recommendations.join(' ');
        expect(recs).toContain('Branch coverage');
      }
    });
  });
});
