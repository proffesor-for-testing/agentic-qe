/**
 * Agentic QE v3 - Gap Detector Service Tests
 *
 * Tests for GapDetectorService: gap detection, prioritization strategies,
 * test suggestion generation, and risk scoring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GapDetectorService,
  createGapDetectorService,
  createGapDetectorServiceWithDependencies,
} from '../../../../src/domains/coverage-analysis/services/gap-detector';
import type {
  CoverageData,
  FileCoverage,
  CoverageGap,
  GapDetectionRequest,
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
    path: overrides.path ?? 'src/service.ts',
    lines: overrides.lines ?? { covered: 50, total: 100 },
    branches: overrides.branches ?? { covered: 5, total: 20 },
    functions: overrides.functions ?? { covered: 3, total: 10 },
    statements: overrides.statements ?? { covered: 55, total: 100 },
    uncoveredLines: overrides.uncoveredLines ?? [10, 11, 12, 30, 31, 50],
    uncoveredBranches: overrides.uncoveredBranches ?? [5, 15],
  };
}

function createCoverageData(files: FileCoverage[] = []): CoverageData {
  const fileList = files.length > 0 ? files : [createFileCoverage()];
  return {
    files: fileList,
    summary: { line: 50, branch: 25, function: 30, statement: 55, files: fileList.length },
  };
}

function makeGap(overrides: Partial<CoverageGap> = {}): CoverageGap {
  return {
    id: overrides.id ?? 'gap-abc',
    file: overrides.file ?? 'src/test.ts',
    lines: overrides.lines ?? [10, 11, 12],
    branches: overrides.branches ?? [5],
    riskScore: overrides.riskScore ?? 0.5,
    severity: overrides.severity ?? 'medium',
    recommendation: overrides.recommendation ?? 'Add tests',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GapDetectorService', () => {
  let memory: ReturnType<typeof createMockMemory>;
  let service: GapDetectorService;

  beforeEach(() => {
    memory = createMockMemory();
    service = createGapDetectorService(memory as any);
  });

  // =========================================================================
  // Constructor
  // =========================================================================

  describe('construction', () => {
    it('should create instance via legacy memory backend', () => {
      const svc = new GapDetectorService(memory as any);
      expect(svc).toBeInstanceOf(GapDetectorService);
    });

    it('should create instance via dependencies object', () => {
      const svc = createGapDetectorServiceWithDependencies({ memory: memory as any });
      expect(svc).toBeInstanceOf(GapDetectorService);
    });

    it('should accept optional LLM router in dependencies', () => {
      const mockRouter = { chat: vi.fn() };
      const svc = createGapDetectorServiceWithDependencies({
        memory: memory as any,
        llmRouter: mockRouter as any,
      });
      expect(svc).toBeInstanceOf(GapDetectorService);
    });
  });

  // =========================================================================
  // detectGaps
  // =========================================================================

  describe('detectGaps', () => {
    it('should detect gaps for files below minCoverage', async () => {
      // Arrange
      const request: GapDetectionRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            lines: { covered: 20, total: 100 },
            branches: { covered: 2, total: 20 },
            functions: { covered: 1, total: 10 },
            statements: { covered: 20, total: 100 },
            uncoveredLines: [5, 6, 7, 8, 9, 10, 20, 21],
            uncoveredBranches: [3, 7],
          }),
        ]),
        minCoverage: 80,
      };

      // Act
      const result = await service.detectGaps(request);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.gaps.length).toBeGreaterThan(0);
        expect(result.value.totalUncoveredLines).toBe(8);
      }
    });

    it('should return empty gaps when all files meet threshold', async () => {
      // Arrange
      const request: GapDetectionRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            lines: { covered: 95, total: 100 },
            branches: { covered: 19, total: 20 },
            functions: { covered: 10, total: 10 },
            statements: { covered: 97, total: 100 },
            uncoveredLines: [],
            uncoveredBranches: [],
          }),
        ]),
        minCoverage: 80,
      };

      // Act
      const result = await service.detectGaps(request);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.gaps).toHaveLength(0);
      }
    });

    it('should group contiguous uncovered lines into regions', async () => {
      // Arrange
      const request: GapDetectionRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            lines: { covered: 40, total: 100 },
            branches: { covered: 5, total: 20 },
            functions: { covered: 3, total: 10 },
            statements: { covered: 40, total: 100 },
            uncoveredLines: [10, 11, 12, 50, 51, 52],
            uncoveredBranches: [],
          }),
        ]),
        minCoverage: 80,
      };

      // Act
      const result = await service.detectGaps(request);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        // Two regions: [10,11,12] and [50,51,52]
        expect(result.value.gaps.length).toBe(2);
      }
    });

    it('should use default minCoverage of 80 when not specified', async () => {
      // Arrange
      const request: GapDetectionRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            lines: { covered: 75, total: 100 },
            branches: { covered: 14, total: 20 },
            functions: { covered: 7, total: 10 },
            statements: { covered: 75, total: 100 },
            uncoveredLines: [1, 2, 3],
            uncoveredBranches: [],
          }),
        ]),
      };

      // Act
      const result = await service.detectGaps(request);

      // Assert - file coverage < 80, so gaps should be found
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.gaps.length).toBeGreaterThan(0);
      }
    });

    it('should store gap patterns as vectors', async () => {
      // Arrange
      const request: GapDetectionRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            uncoveredLines: [1, 2, 3],
            lines: { covered: 20, total: 100 },
            branches: { covered: 2, total: 20 },
            functions: { covered: 1, total: 10 },
            statements: { covered: 20, total: 100 },
          }),
        ]),
      };

      // Act
      await service.detectGaps(request);

      // Assert
      expect(memory.storeVector).toHaveBeenCalled();
    });

    it('should calculate estimated effort based on gap sizes', async () => {
      // Arrange
      const request: GapDetectionRequest = {
        coverageData: createCoverageData([
          createFileCoverage({
            uncoveredLines: Array.from({ length: 40 }, (_, i) => i + 1),
            lines: { covered: 10, total: 100 },
            branches: { covered: 1, total: 20 },
            functions: { covered: 1, total: 10 },
            statements: { covered: 10, total: 100 },
          }),
        ]),
      };

      // Act
      const result = await service.detectGaps(request);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.estimatedEffort).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // prioritizeGaps
  // =========================================================================

  describe('prioritizeGaps', () => {
    const gaps: CoverageGap[] = [
      makeGap({ id: 'low', riskScore: 0.2, severity: 'low', lines: [1, 2] }),
      makeGap({ id: 'high', riskScore: 0.8, severity: 'high', lines: [10, 11, 12, 13, 14] }),
      makeGap({ id: 'med', riskScore: 0.5, severity: 'medium', lines: [20, 21, 22] }),
    ];

    it('should sort by risk score descending with risk strategy', () => {
      // Act
      const sorted = service.prioritizeGaps(gaps, 'risk');

      // Assert
      expect(sorted[0].id).toBe('high');
      expect(sorted[1].id).toBe('med');
      expect(sorted[2].id).toBe('low');
    });

    it('should sort by lines count descending with size strategy', () => {
      // Act
      const sorted = service.prioritizeGaps(gaps, 'size');

      // Assert
      expect(sorted[0].lines.length).toBeGreaterThanOrEqual(sorted[1].lines.length);
      expect(sorted[1].lines.length).toBeGreaterThanOrEqual(sorted[2].lines.length);
    });

    it('should prioritize domain files with recent-changes strategy', () => {
      // Arrange
      const domainGaps: CoverageGap[] = [
        makeGap({ id: 'lib', file: 'lib/util.ts', riskScore: 0.9 }),
        makeGap({ id: 'domain', file: 'src/domains/auth/service.ts', riskScore: 0.3 }),
        makeGap({ id: 'kernel', file: 'src/kernel/core.ts', riskScore: 0.5 }),
      ];

      // Act
      const sorted = service.prioritizeGaps(domainGaps, 'recent-changes');

      // Assert
      expect(sorted[0].file).toContain('src/domains/');
      expect(sorted[sorted.length - 1].file).toContain('lib/');
    });

    it('should not mutate the original array', () => {
      // Arrange
      const original = [...gaps];

      // Act
      service.prioritizeGaps(gaps, 'risk');

      // Assert
      expect(gaps.map((g) => g.id)).toEqual(original.map((g) => g.id));
    });
  });

  // =========================================================================
  // suggestTests
  // =========================================================================

  describe('suggestTests', () => {
    it('should suggest unit tests for any gap with uncovered lines', async () => {
      // Arrange
      const gap = makeGap({ lines: [10, 11, 12], branches: [], severity: 'medium' });

      // Act
      const result = await service.suggestTests(gap);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const unitSuggestions = result.value.filter((s) => s.type === 'unit');
        expect(unitSuggestions.length).toBeGreaterThan(0);
      }
    });

    it('should suggest integration tests for large gaps with branches', async () => {
      // Arrange
      const gap = makeGap({
        lines: Array.from({ length: 25 }, (_, i) => i + 1),
        branches: [5, 10, 15],
        severity: 'high',
      });

      // Act
      const result = await service.suggestTests(gap);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const integrationSuggestions = result.value.filter((s) => s.type === 'integration');
        expect(integrationSuggestions.length).toBeGreaterThan(0);
      }
    });

    it('should suggest e2e tests for critical large gaps', async () => {
      // Arrange
      const gap = makeGap({
        lines: Array.from({ length: 30 }, (_, i) => i + 1),
        branches: [5, 10],
        severity: 'critical',
      });

      // Act
      const result = await service.suggestTests(gap);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const e2eSuggestions = result.value.filter((s) => s.type === 'e2e');
        expect(e2eSuggestions.length).toBeGreaterThan(0);
      }
    });

    it('should include test templates in suggestions', async () => {
      // Arrange
      const gap = makeGap({
        file: 'src/domains/auth/service.ts',
        lines: Array.from({ length: 25 }, (_, i) => i + 1),
        branches: [5],
        severity: 'high',
      });

      // Act
      const result = await service.suggestTests(gap);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const withTemplate = result.value.filter((s) => s.testTemplate);
        expect(withTemplate.length).toBeGreaterThan(0);
        expect(withTemplate[0].testTemplate).toContain('describe');
      }
    });

    it('should estimate effort proportional to gap size', async () => {
      // Arrange
      const smallGap = makeGap({ lines: [1, 2], severity: 'low' });
      const largeGap = makeGap({
        lines: Array.from({ length: 50 }, (_, i) => i + 1),
        branches: Array.from({ length: 10 }, (_, i) => i + 1),
        severity: 'critical',
      });

      // Act
      const smallResult = await service.suggestTests(smallGap);
      const largeResult = await service.suggestTests(largeGap);

      // Assert
      expect(smallResult.success).toBe(true);
      expect(largeResult.success).toBe(true);
      if (smallResult.success && largeResult.success) {
        const smallEffort = smallResult.value.reduce((s, v) => s + v.estimatedEffort, 0);
        const largeEffort = largeResult.value.reduce((s, v) => s + v.estimatedEffort, 0);
        expect(largeEffort).toBeGreaterThan(smallEffort);
      }
    });
  });

  // =========================================================================
  // analyzeGapsWithLLM
  // =========================================================================

  describe('analyzeGapsWithLLM', () => {
    it('should return error when LLM router is not available', async () => {
      // Act
      const result = await service.analyzeGapsWithLLM([makeGap()]);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not available');
      }
    });

    it('should return empty analysis for zero gaps', async () => {
      // Arrange
      const mockRouter = { chat: vi.fn() };
      const svc = createGapDetectorServiceWithDependencies({
        memory: memory as any,
        llmRouter: mockRouter as any,
      });

      // Act
      const result = await svc.analyzeGapsWithLLM([]);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.prioritizedGaps).toHaveLength(0);
        expect(result.value.summary).toContain('No coverage gaps');
      }
    });

    it('should call LLM router and parse valid JSON response', async () => {
      // Arrange
      const mockResponse = {
        content: JSON.stringify({
          prioritizedGaps: [{ gapId: 'gap-1', riskWeight: 0.9, explanation: 'Critical path', businessImpact: 'high' }],
          suggestedTests: [{ gapId: 'gap-1', testDescription: 'Test login', testType: 'unit', estimatedEffort: 2 }],
          effortEstimate: { totalHours: 5, confidence: 0.8, breakdown: { 'auth.ts': 5 } },
          summary: 'One critical gap found.',
        }),
      };
      const mockRouter = { chat: vi.fn().mockResolvedValue(mockResponse) };
      const svc = createGapDetectorServiceWithDependencies({
        memory: memory as any,
        llmRouter: mockRouter as any,
      });

      // Act
      const result = await svc.analyzeGapsWithLLM([makeGap({ id: 'gap-1' })]);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.prioritizedGaps).toHaveLength(1);
        expect(result.value.summary).toContain('critical');
      }
    });

    it('should fall back to heuristic analysis when LLM response is not valid JSON', async () => {
      // Arrange
      const mockRouter = { chat: vi.fn().mockResolvedValue({ content: 'Not valid JSON at all' }) };
      const svc = createGapDetectorServiceWithDependencies({
        memory: memory as any,
        llmRouter: mockRouter as any,
      });
      const gaps = [makeGap({ id: 'gap-fb' })];

      // Act
      const result = await svc.analyzeGapsWithLLM(gaps);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.summary).toContain('heuristic');
      }
    });
  });
});
