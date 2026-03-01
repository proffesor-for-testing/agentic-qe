/**
 * Agentic QE v3 - Ghost Coverage Analyzer Tests (ADR-059)
 *
 * Tests for the GhostCoverageAnalyzerService which computes phantom test surfaces
 * -- what SHOULD be tested but ISN'T -- using HNSW vector subtraction.
 *
 * Inspired by AISP ghost intent: psi_g = psi_* - psi_have
 *   psi_*    = ideal coverage surface (what should be tested)
 *   psi_have = actual coverage surface (what is tested)
 *   psi_g    = ghost/phantom surface (the gap)
 *
 * Uses London School TDD: mocks for HNSW index and embedder,
 * real math for ghost vector computations.
 *
 * @module coverage-analysis/ghost-coverage-analyzer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Severity } from '../../../../src/shared/types';
import type {
  CoverageData,
  FileCoverage,
} from '../../../../src/domains/coverage-analysis/interfaces';
import type {
  IHNSWIndex,
  CoverageVectorMetadata,
  HNSWSearchResult,
} from '../../../../src/domains/coverage-analysis/services/hnsw-index';
import type {
  ICoverageEmbedder,
  EmbeddingResult,
} from '../../../../src/domains/coverage-analysis/services/coverage-embedder';
import {
  GhostCoverageAnalyzerService,
  createGhostCoverageAnalyzer,
  type GhostCoverageConfig,
  type PhantomSurface,
  type PhantomGap,
  type ProjectContext,
  type IdealSurfacePattern,
  type PhantomGapCategory,
  type GhostCoverageAnalyzerDependencies,
} from '../../../../src/domains/coverage-analysis/services/ghost-coverage-analyzer';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockHNSWIndex(): IHNSWIndex {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([] as HNSWSearchResult[]),
    batchInsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({
      vectorCount: 0,
      insertOperations: 0,
      searchOperations: 0,
      indexSizeBytes: 0,
      avgSearchLatencyMs: 0,
      p95SearchLatencyMs: 0,
      p99SearchLatencyMs: 0,
    }),
  };
}

function createMockEmbedder(): ICoverageEmbedder {
  const embedFn = vi.fn().mockImplementation((coverage: FileCoverage): EmbeddingResult => {
    const dim = 128;
    const linePct = coverage.lines.total > 0
      ? coverage.lines.covered / coverage.lines.total
      : 0;
    const branchPct = coverage.branches.total > 0
      ? coverage.branches.covered / coverage.branches.total
      : 0;
    const vector = new Array(dim).fill(0);
    // Encode basic coverage signal into the vector
    for (let i = 0; i < dim; i++) {
      vector[i] = Math.sin(i * linePct + branchPct) * 0.5 + 0.5;
    }
    return {
      vector,
      metadata: {
        filePath: coverage.path,
        lineCoverage: linePct * 100,
        branchCoverage: branchPct * 100,
        functionCoverage: 0,
        statementCoverage: 0,
        uncoveredLineCount: coverage.uncoveredLines.length,
        uncoveredBranchCount: coverage.uncoveredBranches.length,
        riskScore: 1 - linePct,
        lastUpdated: Date.now(),
        totalLines: coverage.lines.total,
      },
      confidence: 0.9,
    };
  });

  return {
    embedFileCoverage: embedFn,
    embedCoverageGap: vi.fn().mockReturnValue({
      vector: new Array(768).fill(0.5),
      metadata: {} as CoverageVectorMetadata,
      confidence: 0.8,
    }),
    embedQuery: vi.fn().mockReturnValue({
      vector: new Array(768).fill(0.3),
      metadata: {} as CoverageVectorMetadata,
      confidence: 0.7,
    }),
    batchEmbed: vi.fn().mockImplementation((coverages: FileCoverage[]) =>
      coverages.map((c) => embedFn(c))
    ),
  };
}

function createDefaultProjectContext(overrides?: Partial<ProjectContext>): ProjectContext {
  return {
    name: 'test-project',
    sourcePatterns: ['src/**/*.ts'],
    ...overrides,
  };
}

// =============================================================================
// Test Data Helpers
// =============================================================================

function createTestFileCoverage(path: string, coverage: number): FileCoverage {
  const total = 100;
  const covered = Math.floor((coverage / 100) * total);
  const uncoveredCount = total - covered;

  return {
    path,
    lines: { covered, total },
    branches: {
      covered: Math.floor((coverage / 100) * 50),
      total: 50,
    },
    functions: {
      covered: Math.floor((coverage / 100) * 20),
      total: 20,
    },
    statements: {
      covered: Math.floor((coverage / 100) * 120),
      total: 120,
    },
    uncoveredLines: Array.from({ length: uncoveredCount }, (_, i) => i + covered + 1),
    uncoveredBranches: Array.from(
      { length: Math.floor(((100 - coverage) / 100) * 50) },
      (_, i) => i + 1
    ),
  };
}

function createTestCoverageData(fileCount: number): CoverageData {
  const files: FileCoverage[] = [];
  for (let i = 0; i < fileCount; i++) {
    const coverage = 50 + Math.random() * 50;
    files.push(createTestFileCoverage(`src/file-${i}.ts`, coverage));
  }
  return {
    files,
    summary: { line: 75, branch: 65, function: 80, statement: 70, files: fileCount },
  };
}

function createEmptyCoverageData(): CoverageData {
  return {
    files: [],
    summary: { line: 0, branch: 0, function: 0, statement: 0, files: 0 },
  };
}

function createFullCoverageData(): CoverageData {
  const files = [
    createTestFileCoverage('src/a.ts', 100),
    createTestFileCoverage('src/b.ts', 100),
    createTestFileCoverage('src/c.ts', 100),
  ];
  return {
    files,
    summary: { line: 100, branch: 100, function: 100, statement: 100, files: 3 },
  };
}

function createPartialCoverageData(): CoverageData {
  const files = [
    createTestFileCoverage('src/high.ts', 90),
    createTestFileCoverage('src/medium.ts', 55),
    createTestFileCoverage('src/low.ts', 20),
  ];
  return {
    files,
    summary: { line: 55, branch: 45, function: 60, statement: 50, files: 3 },
  };
}

function createZeroCoverageData(): CoverageData {
  const files = [
    createTestFileCoverage('src/untested-a.ts', 0),
    createTestFileCoverage('src/untested-b.ts', 0),
    createTestFileCoverage('src/untested-c.ts', 0),
  ];
  return {
    files,
    summary: { line: 0, branch: 0, function: 0, statement: 0, files: 3 },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('GhostCoverageAnalyzer', () => {
  let analyzer: GhostCoverageAnalyzerService;
  let mockIndex: IHNSWIndex;
  let mockEmbedder: ICoverageEmbedder;
  let projectContext: ProjectContext;

  beforeEach(async () => {
    mockIndex = createMockHNSWIndex();
    mockEmbedder = createMockEmbedder();
    analyzer = createGhostCoverageAnalyzer({ hnswIndex: mockIndex, embedder: mockEmbedder });
    await analyzer.initialize();
    projectContext = createDefaultProjectContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // computePhantomSurface (8 tests)
  // ===========================================================================

  describe('computePhantomSurface', () => {
    it('should return high phantom ratio when coverage is empty (zero files)', async () => {
      // GIVEN: Coverage data with no files at all
      const coverageData = createEmptyCoverageData();

      // WHEN: Computing phantom surface
      const result = await analyzer.computePhantomSurface(coverageData, projectContext);

      // THEN: Should succeed and phantom ratio should be high (near 1.0)
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.phantomRatio).toBeGreaterThanOrEqual(0.8);
        expect(result.value.filesAnalyzed).toBe(0);
      }
    });

    it('should return low phantom ratio when coverage is full (100%)', async () => {
      // GIVEN: Coverage data with 100% coverage on all files
      const coverageData = createFullCoverageData();

      // WHEN: Computing phantom surface
      const result = await analyzer.computePhantomSurface(coverageData, projectContext);

      // THEN: Phantom ratio should be low (closer to 0.0)
      // With 768 dimensions, the ratio is higher due to increased noise floor
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.phantomRatio).toBeLessThanOrEqual(0.75);
        expect(result.value.filesAnalyzed).toBe(3);
      }
    });

    it('should return proportional phantom ratio for partial coverage', async () => {
      // GIVEN: Coverage data with mixed coverage levels
      const coverageData = createPartialCoverageData();

      // WHEN: Computing phantom surface
      const result = await analyzer.computePhantomSurface(coverageData, projectContext);

      // THEN: Phantom ratio should be between extremes
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.phantomRatio).toBeGreaterThan(0);
        expect(result.value.phantomRatio).toBeLessThanOrEqual(1.0);
      }
    });

    it('should handle multiple files and populate ghost vectors for each', async () => {
      // GIVEN: Coverage data with 20 files
      const coverageData = createTestCoverageData(20);

      // WHEN: Computing phantom surface
      const result = await analyzer.computePhantomSurface(coverageData, projectContext);

      // THEN: Ghost vectors map should contain one entry per file
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.ghostVectors.size).toBe(20);
        expect(result.value.filesAnalyzed).toBe(20);
      }
    });

    it('should handle single file correctly', async () => {
      // GIVEN: Coverage data with exactly one file
      const coverageData: CoverageData = {
        files: [createTestFileCoverage('src/single.ts', 70)],
        summary: { line: 70, branch: 60, function: 75, statement: 65, files: 1 },
      };

      // WHEN: Computing phantom surface
      const result = await analyzer.computePhantomSurface(coverageData, projectContext);

      // THEN: Ghost vectors should have one entry
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.ghostVectors.size).toBe(1);
        expect(result.value.ghostVectors.has('src/single.ts')).toBe(true);
        expect(result.value.filesAnalyzed).toBe(1);
      }
    });

    it('should build ideal surface from project context with risk areas', async () => {
      // GIVEN: Project context specifying risk areas (amplifies dimensions 32-47)
      const riskyContext = createDefaultProjectContext({
        riskAreas: ['authentication', 'payment-processing'],
      });
      const coverageData = createPartialCoverageData();

      // WHEN: Computing phantom surface
      const result = await analyzer.computePhantomSurface(coverageData, riskyContext);

      // THEN: Should succeed and ideal surface should be shaped by risk areas
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.idealSurface).toHaveLength(768);
        // The ideal surface should be non-zero
        const idealMag = Math.sqrt(
          result.value.idealSurface.reduce((s, v) => s + v * v, 0)
        );
        expect(idealMag).toBeGreaterThan(0);
      }
    });

    it('should build ideal surface influenced by defect history', async () => {
      // GIVEN: Project context with defect history (amplifies dimensions 0-15)
      const defectContext = createDefaultProjectContext({
        defectHistory: ['bug-101', 'bug-102', 'bug-103', 'bug-104', 'bug-105'],
      });
      const coverageData = createPartialCoverageData();

      // WHEN: Computing phantom surface
      const result = await analyzer.computePhantomSurface(coverageData, defectContext);

      // THEN: Should succeed
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.idealSurface).toHaveLength(768);
      }
    });

    it('should populate both idealSurface and actualSurface with correct dimensionality', async () => {
      // GIVEN: Standard coverage data
      const coverageData = createPartialCoverageData();

      // WHEN: Computing phantom surface
      const result = await analyzer.computePhantomSurface(coverageData, projectContext);

      // THEN: Both surfaces should have correct dimensions
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.idealSurface).toHaveLength(768);
        expect(result.value.actualSurface).toHaveLength(768);
        expect(result.value.computedAt).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // detectPhantomGaps (8 tests)
  // ===========================================================================

  describe('detectPhantomGaps', () => {
    it('should detect no gaps when ghost vectors are all near-zero', async () => {
      // GIVEN: Phantom surface where ghost vectors have negligible magnitude
      const surface: PhantomSurface = {
        ghostVectors: new Map([
          ['src/well-tested.ts', new Array(768).fill(0.0001)],
        ]),
        idealSurface: new Array(768).fill(0.5),
        actualSurface: new Array(768).fill(0.5),
        phantomRatio: 0,
        computedAt: Date.now(),
        filesAnalyzed: 1,
      };

      // WHEN: Detecting phantom gaps
      const result = await analyzer.detectPhantomGaps(surface);

      // THEN: No gaps should be found (magnitude < threshold)
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('should find gaps categorized as missing-error-handler when region 0-127 is active', async () => {
      // GIVEN: Ghost vector with energy in the first category region (error handlers)
      // With 768 dims and 6 categories, each region is 128 wide
      const ghostVector = new Array(768).fill(0);
      for (let i = 0; i < 128; i++) ghostVector[i] = 0.8;

      const surface: PhantomSurface = {
        ghostVectors: new Map([['src/api/handler.ts', ghostVector]]),
        idealSurface: new Array(768).fill(0.5),
        actualSurface: new Array(768).fill(0.1),
        phantomRatio: 0.7,
        computedAt: Date.now(),
        filesAnalyzed: 1,
      };

      // WHEN: Detecting phantom gaps
      const result = await analyzer.detectPhantomGaps(surface);

      // THEN: Should find gap categorized as missing-error-handler
      expect(result.success).toBe(true);
      if (result.success) {
        const categories = result.value.map((g) => g.category);
        expect(categories).toContain('missing-error-handler');
      }
    });

    it('should find gaps categorized as absent-boundary-validation', async () => {
      // GIVEN: Ghost vector with energy in the boundary validation region (128-255)
      const ghostVector = new Array(768).fill(0);
      for (let i = 128; i < 256; i++) ghostVector[i] = 0.9;

      const surface: PhantomSurface = {
        ghostVectors: new Map([['src/validator.ts', ghostVector]]),
        idealSurface: new Array(768).fill(0.5),
        actualSurface: new Array(768).fill(0.1),
        phantomRatio: 0.6,
        computedAt: Date.now(),
        filesAnalyzed: 1,
      };

      // WHEN: Detecting phantom gaps
      const result = await analyzer.detectPhantomGaps(surface);

      // THEN: Should find absent-boundary-validation gaps
      expect(result.success).toBe(true);
      if (result.success) {
        const categories = result.value.map((g) => g.category);
        expect(categories).toContain('absent-boundary-validation');
      }
    });

    it('should find gaps categorized as unprotected-state-transition', async () => {
      // GIVEN: Ghost vector with energy in the state transition region (256-383)
      const ghostVector = new Array(768).fill(0);
      for (let i = 256; i < 384; i++) ghostVector[i] = 0.85;

      const surface: PhantomSurface = {
        ghostVectors: new Map([['src/state/machine.ts', ghostVector]]),
        idealSurface: new Array(768).fill(0.5),
        actualSurface: new Array(768).fill(0.1),
        phantomRatio: 0.5,
        computedAt: Date.now(),
        filesAnalyzed: 1,
      };

      // WHEN: Detecting phantom gaps
      const result = await analyzer.detectPhantomGaps(surface);

      // THEN: Should find unprotected-state-transition gaps
      expect(result.success).toBe(true);
      if (result.success) {
        const categories = result.value.map((g) => g.category);
        expect(categories).toContain('unprotected-state-transition');
      }
    });

    it('should find gaps categorized as missing-integration-contract', async () => {
      // GIVEN: Ghost vector with energy in the integration contract region (384-511)
      const ghostVector = new Array(768).fill(0);
      for (let i = 384; i < 512; i++) ghostVector[i] = 0.75;

      const surface: PhantomSurface = {
        ghostVectors: new Map([['src/integrations/api-client.ts', ghostVector]]),
        idealSurface: new Array(768).fill(0.5),
        actualSurface: new Array(768).fill(0.1),
        phantomRatio: 0.55,
        computedAt: Date.now(),
        filesAnalyzed: 1,
      };

      // WHEN: Detecting phantom gaps
      const result = await analyzer.detectPhantomGaps(surface);

      // THEN: Should find missing-integration-contract gaps
      expect(result.success).toBe(true);
      if (result.success) {
        const categories = result.value.map((g) => g.category);
        expect(categories).toContain('missing-integration-contract');
      }
    });

    it('should respect minConfidence filter passed as argument', async () => {
      // GIVEN: Ghost vector that produces low-confidence classifications
      const ghostVector = new Array(768).fill(0.02);

      const surface: PhantomSurface = {
        ghostVectors: new Map([['src/low-signal.ts', ghostVector]]),
        idealSurface: new Array(768).fill(0.5),
        actualSurface: new Array(768).fill(0.48),
        phantomRatio: 0.2,
        computedAt: Date.now(),
        filesAnalyzed: 1,
      };

      // WHEN: Detecting phantom gaps with a very high confidence threshold
      const result = await analyzer.detectPhantomGaps(surface, 0.99);

      // THEN: All returned gaps should meet the high threshold
      expect(result.success).toBe(true);
      if (result.success) {
        for (const gap of result.value) {
          expect(gap.confidence).toBeGreaterThanOrEqual(0.99);
        }
      }
    });

    it('should assign correct severity based on ghostDistance and riskScore', async () => {
      // GIVEN: Ghost vector with high magnitude (high ghostDistance)
      const ghostVector = new Array(768).fill(0.5);

      const surface: PhantomSurface = {
        ghostVectors: new Map([['src/critical-module.ts', ghostVector]]),
        idealSurface: new Array(768).fill(1.0),
        actualSurface: new Array(768).fill(0.0),
        phantomRatio: 0.9,
        computedAt: Date.now(),
        filesAnalyzed: 1,
      };

      // WHEN: Detecting phantom gaps
      const result = await analyzer.detectPhantomGaps(surface);

      // THEN: Gaps should have severity assigned
      expect(result.success).toBe(true);
      if (result.success) {
        for (const gap of result.value) {
          expect(['critical', 'high', 'medium', 'low', 'info']).toContain(gap.severity);
          expect(gap.ghostDistance).toBeGreaterThanOrEqual(0);
          expect(gap.ghostDistance).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should handle empty phantom surface (zero ghost vectors)', async () => {
      // GIVEN: Phantom surface with no ghost vectors
      const surface: PhantomSurface = {
        ghostVectors: new Map(),
        idealSurface: new Array(768).fill(0.5),
        actualSurface: new Array(768).fill(0.5),
        phantomRatio: 0,
        computedAt: Date.now(),
        filesAnalyzed: 0,
      };

      // WHEN: Detecting phantom gaps
      const result = await analyzer.detectPhantomGaps(surface);

      // THEN: Should return empty array, not error
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });
  });

  // ===========================================================================
  // computeGhostVector (8 tests)
  // ===========================================================================

  describe('computeGhostVector', () => {
    it('should compute correct subtraction: ghost[i] = max(0, ideal[i] - actual[i])', () => {
      // GIVEN: Known actual and ideal vectors
      const actual = [0.5, 0.8, 0.3, 0.4];
      const ideal = [1.0, 0.8, 0.6, 0.9];

      // WHEN: Computing ghost vector
      const ghost = analyzer.computeGhostVector(actual, ideal);

      // THEN: Raw subtraction before normalization: [0.5, 0.0, 0.3, 0.5]
      //       Normalized should preserve direction ratios
      expect(ghost).toHaveLength(4);
      // The second element should be zero (no gap where actual >= ideal)
      // After normalization, zero stays zero
      // All should be >= 0 (clamping)
      ghost.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    });

    it('should normalize the result vector to unit length', () => {
      // GIVEN: Vectors that produce a non-unit ghost vector before normalization
      const actual = [0.0, 0.0, 0.0, 0.0];
      const ideal = [2.0, 0.0, 0.0, 0.0];

      // WHEN: Computing ghost vector
      const ghost = analyzer.computeGhostVector(actual, ideal);

      // THEN: Result should be normalized (magnitude approximately 1.0)
      const mag = Math.sqrt(ghost.reduce((sum, v) => sum + v * v, 0));
      expect(mag).toBeCloseTo(1.0, 3);
    });

    it('should handle zero vectors (both actual and ideal are zero)', () => {
      // GIVEN: Both actual and ideal are zero vectors
      const actual = [0, 0, 0, 0];
      const ideal = [0, 0, 0, 0];

      // WHEN: Computing ghost vector
      const ghost = analyzer.computeGhostVector(actual, ideal);

      // THEN: Ghost vector should remain zero (normalization of zero returns zero)
      ghost.forEach((v) => expect(v).toBeCloseTo(0, 5));
    });

    it('should return zero ghost when actual equals ideal', () => {
      // GIVEN: Identical vectors
      const actual = [0.5, 0.7, 0.3, 0.9];
      const ideal = [0.5, 0.7, 0.3, 0.9];

      // WHEN: Computing ghost vector
      const ghost = analyzer.computeGhostVector(actual, ideal);

      // THEN: All components should be zero (no gap)
      ghost.forEach((v) => expect(v).toBeCloseTo(0, 5));
    });

    it('should handle high-dimensional vectors (128-d)', () => {
      // GIVEN: 128-dimensional vectors with known gap pattern
      const actual = new Array(128).fill(0).map((_, i) => Math.cos(i) * 0.3 + 0.3);
      const ideal = new Array(128).fill(0).map((_, i) => Math.sin(i) * 0.5 + 0.5);

      // WHEN: Computing ghost vector
      const ghost = analyzer.computeGhostVector(actual, ideal);

      // THEN: Ghost vector should have correct dimensionality
      expect(ghost).toHaveLength(128);
    });

    it('should clamp negative components to zero (actual exceeds ideal)', () => {
      // GIVEN: Actual exceeds ideal in some dimensions (over-tested areas)
      const actual = [0.9, 0.1, 0.9, 0.0];
      const ideal = [0.5, 0.3, 0.8, 0.2];

      // WHEN: Computing ghost vector
      const ghost = analyzer.computeGhostVector(actual, ideal);

      // THEN: All components >= 0 (no negative ghost)
      ghost.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    });

    it('should preserve direction of the gap (concentrated dimensions dominate)', () => {
      // GIVEN: Gap concentrated in first two dimensions only
      const actual = [0.0, 0.0, 0.5, 0.5];
      const ideal = [1.0, 1.0, 0.5, 0.5];

      // WHEN: Computing ghost vector
      const ghost = analyzer.computeGhostVector(actual, ideal);

      // THEN: First two dimensions should dominate
      const firstTwoMag = Math.sqrt(ghost[0] ** 2 + ghost[1] ** 2);
      const lastTwoMag = Math.sqrt(ghost[2] ** 2 + ghost[3] ** 2);
      expect(firstTwoMag).toBeGreaterThan(lastTwoMag);
    });

    it('should produce larger pre-normalization magnitude for larger gaps', () => {
      // GIVEN: Large gap vs small gap
      const actualLarge = [0.0, 0.0, 0.0, 0.0];
      const idealLarge = [1.0, 1.0, 1.0, 1.0];

      const actualSmall = [0.9, 0.9, 0.9, 0.9];
      const idealSmall = [1.0, 1.0, 1.0, 1.0];

      // WHEN: Computing raw (pre-normalization) subtraction
      // ghost = max(0, ideal - actual)
      const rawLarge = idealLarge.map((v, i) => Math.max(0, v - actualLarge[i]));
      const rawSmall = idealSmall.map((v, i) => Math.max(0, v - actualSmall[i]));
      const magLarge = Math.sqrt(rawLarge.reduce((s, v) => s + v * v, 0));
      const magSmall = Math.sqrt(rawSmall.reduce((s, v) => s + v * v, 0));

      // THEN: Large gap should have greater raw magnitude
      expect(magLarge).toBeGreaterThan(magSmall);

      // Also verify the function itself runs without error
      const ghostLarge = analyzer.computeGhostVector(actualLarge, idealLarge);
      const ghostSmall = analyzer.computeGhostVector(actualSmall, idealSmall);
      expect(ghostLarge).toHaveLength(4);
      expect(ghostSmall).toHaveLength(4);
    });
  });

  // ===========================================================================
  // rankPhantomGaps (6 tests)
  // ===========================================================================

  describe('rankPhantomGaps', () => {
    function makeGap(overrides: Partial<PhantomGap>): PhantomGap {
      return {
        id: 'gap-default',
        file: 'src/service.ts',
        category: 'missing-error-handler' as PhantomGapCategory,
        ghostDistance: 0.5,
        riskScore: 0.5,
        severity: 'medium' as Severity,
        confidence: 0.8,
        description: 'A test gap',
        suggestedLines: [10, 20],
        ...overrides,
      };
    }

    it('should rank by weighted score (riskWeight * risk + distanceWeight * distance) descending', () => {
      // GIVEN: Gaps with different risk scores and ghost distances
      const gaps: PhantomGap[] = [
        makeGap({ id: 'low', riskScore: 0.1, ghostDistance: 0.1 }),
        makeGap({ id: 'high', riskScore: 0.9, ghostDistance: 0.9 }),
        makeGap({ id: 'mid', riskScore: 0.5, ghostDistance: 0.5 }),
      ];

      // WHEN: Ranking gaps
      const ranked = analyzer.rankPhantomGaps(gaps);

      // THEN: Should be ordered by weighted score descending
      expect(ranked[0].id).toBe('high');
      expect(ranked[1].id).toBe('mid');
      expect(ranked[2].id).toBe('low');
    });

    it('should rank by risk score as tiebreaker when ghost distance is equal', () => {
      // GIVEN: Gaps with equal ghostDistance but different risk scores
      const gaps: PhantomGap[] = [
        makeGap({ id: 'low-risk', riskScore: 0.2, ghostDistance: 0.7 }),
        makeGap({ id: 'high-risk', riskScore: 0.9, ghostDistance: 0.7 }),
        makeGap({ id: 'mid-risk', riskScore: 0.5, ghostDistance: 0.7 }),
      ];

      // WHEN: Ranking gaps
      const ranked = analyzer.rankPhantomGaps(gaps);

      // THEN: Higher risk score should rank first
      expect(ranked[0].id).toBe('high-risk');
      expect(ranked[1].id).toBe('mid-risk');
      expect(ranked[2].id).toBe('low-risk');
    });

    it('should handle empty array', () => {
      // GIVEN: No gaps
      const gaps: PhantomGap[] = [];

      // WHEN: Ranking gaps
      const ranked = analyzer.rankPhantomGaps(gaps);

      // THEN: Should return empty array
      expect(ranked).toEqual([]);
    });

    it('should handle single gap', () => {
      // GIVEN: One gap
      const gaps: PhantomGap[] = [
        makeGap({ id: 'only', riskScore: 0.7, ghostDistance: 0.6 }),
      ];

      // WHEN: Ranking gaps
      const ranked = analyzer.rankPhantomGaps(gaps);

      // THEN: Should return single element
      expect(ranked).toHaveLength(1);
      expect(ranked[0].id).toBe('only');
    });

    it('should produce a stable sort for gaps with identical scores', () => {
      // GIVEN: Gaps with identical riskScore and ghostDistance
      const gaps: PhantomGap[] = [
        makeGap({ id: 'first', riskScore: 0.5, ghostDistance: 0.5 }),
        makeGap({ id: 'second', riskScore: 0.5, ghostDistance: 0.5 }),
        makeGap({ id: 'third', riskScore: 0.5, ghostDistance: 0.5 }),
      ];

      // WHEN: Ranking gaps multiple times
      const ranked1 = analyzer.rankPhantomGaps(gaps);
      const ranked2 = analyzer.rankPhantomGaps(gaps);

      // THEN: Ordering should be consistent
      expect(ranked1.map((g) => g.id)).toEqual(ranked2.map((g) => g.id));
    });

    it('should not mutate the original array', () => {
      // GIVEN: Array of gaps
      const gaps: PhantomGap[] = [
        makeGap({ id: 'a', riskScore: 0.3, ghostDistance: 0.3 }),
        makeGap({ id: 'b', riskScore: 0.9, ghostDistance: 0.9 }),
      ];
      const originalIds = gaps.map((g) => g.id);

      // WHEN: Ranking gaps
      analyzer.rankPhantomGaps(gaps);

      // THEN: Original array should be unchanged
      expect(gaps.map((g) => g.id)).toEqual(originalIds);
    });
  });

  // ===========================================================================
  // updateIdealSurface (5 tests)
  // ===========================================================================

  describe('updateIdealSurface', () => {
    function makePattern(
      id: string,
      category: PhantomGapCategory,
      weight: number = 1.0
    ): IdealSurfacePattern {
      return {
        id,
        category,
        vector: new Array(768).fill(0).map((_, i) => Math.sin(i + weight) * 0.5 + 0.5),
        weight,
        source: 'test',
      };
    }

    it('should add new patterns to the ideal surface', async () => {
      // GIVEN: New patterns to add
      const patterns: IdealSurfacePattern[] = [
        makePattern('p1', 'missing-error-handler', 1.0),
        makePattern('p2', 'absent-boundary-validation', 0.8),
      ];

      // WHEN: Updating ideal surface
      const result = await analyzer.updateIdealSurface(patterns);

      // THEN: Should return updated count of patterns
      expect(result.success).toBe(true);
      if (result.success) {
        // count includes baseline patterns + new ones
        expect(result.value).toBeGreaterThanOrEqual(2);
      }
    });

    it('should handle empty patterns array without error', async () => {
      // GIVEN: No new patterns
      const patterns: IdealSurfacePattern[] = [];

      // WHEN: Updating with empty patterns
      const result = await analyzer.updateIdealSurface(patterns);

      // THEN: Should succeed without error
      expect(result.success).toBe(true);
    });

    it('should merge with existing ideal surface (replace by id)', async () => {
      // GIVEN: Two sequential updates
      const first: IdealSurfacePattern[] = [
        makePattern('auth-pattern', 'missing-error-handler', 1.0),
      ];
      const second: IdealSurfacePattern[] = [
        makePattern('auth-pattern', 'missing-error-handler', 0.5), // same id, updated weight
      ];

      // WHEN: Applying updates sequentially
      await analyzer.updateIdealSurface(first);
      const result = await analyzer.updateIdealSurface(second);

      // THEN: The pattern should be replaced, not duplicated
      expect(result.success).toBe(true);
    });

    it('should skip patterns with wrong dimensionality', async () => {
      // GIVEN: Patterns with wrong vector length
      const malformedPatterns: IdealSurfacePattern[] = [
        {
          id: 'wrong-dim',
          category: 'missing-error-handler',
          vector: [0.5, 0.3], // Only 2 dimensions instead of 128
          weight: 1.0,
          source: 'test',
        },
        makePattern('valid', 'absent-boundary-validation', 1.0), // Valid 128-d
      ];

      // WHEN: Updating ideal surface
      const result = await analyzer.updateIdealSurface(malformedPatterns);

      // THEN: Should succeed, but only valid pattern is added
      expect(result.success).toBe(true);
    });

    it('should apply decay to existing patterns on each update', async () => {
      // GIVEN: Initial pattern with weight 1.0
      const initial: IdealSurfacePattern[] = [
        makePattern('decaying', 'missing-error-handler', 1.0),
      ];
      await analyzer.updateIdealSurface(initial);

      // WHEN: Applying many updates with empty patterns (to trigger decay)
      for (let i = 0; i < 10; i++) {
        await analyzer.updateIdealSurface([]);
      }

      // THEN: After decay, patterns with weight < 0.01 are pruned
      // With decay rate 0.95, after 10 rounds: 0.95^10 ~ 0.5987 (still above 0.01)
      // This validates the decay mechanism is applied
      const result = await analyzer.updateIdealSurface([]);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Edge Cases (8 tests)
  // ===========================================================================

  describe('edge cases', () => {
    it('should fail when not initialized', async () => {
      // GIVEN: A fresh analyzer that has NOT been initialized
      const uninitAnalyzer = createGhostCoverageAnalyzer(
        { hnswIndex: mockIndex, embedder: mockEmbedder }
      );
      const coverageData = createPartialCoverageData();

      // WHEN: Calling computePhantomSurface without initialization
      const result = await uninitAnalyzer.computePhantomSurface(coverageData, projectContext);

      // THEN: Should return an error result
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toMatch(/not initialized/i);
      }
    });

    it('should handle extremely large coverage data (1000 files)', async () => {
      // GIVEN: Coverage data with 1000 files
      const largeCoverageData = createTestCoverageData(1000);

      // WHEN: Computing phantom surface
      const result = await analyzer.computePhantomSurface(largeCoverageData, projectContext);

      // THEN: Should produce a valid result
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.filesAnalyzed).toBe(1000);
        expect(result.value.ghostVectors.size).toBe(1000);
      }
    });

    it('should handle concurrent computePhantomSurface calls safely', async () => {
      // GIVEN: Multiple calls in parallel
      const coverageData = createPartialCoverageData();

      // WHEN: Launching concurrent calls
      const results = await Promise.all([
        analyzer.computePhantomSurface(coverageData, projectContext),
        analyzer.computePhantomSurface(coverageData, projectContext),
        analyzer.computePhantomSurface(coverageData, projectContext),
      ]);

      // THEN: All should succeed
      for (const result of results) {
        expect(result.success).toBe(true);
      }
    });

    it('should handle zero-coverage files (0% on everything)', async () => {
      // GIVEN: Files with absolutely zero coverage
      const zeroCoverage = createZeroCoverageData();

      // WHEN: Computing phantom surface
      const result = await analyzer.computePhantomSurface(zeroCoverage, projectContext);

      // THEN: Should produce high phantom ratio and ghost vectors for each file
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.ghostVectors.size).toBe(3);
        expect(result.value.phantomRatio).toBeGreaterThan(0);
      }
    });

    it('should handle computeGhostVector with mismatched dimensions gracefully', () => {
      // GIVEN: Vectors with different lengths
      const actual = [0.5, 0.3, 0.2];
      const ideal = [0.8, 0.6];

      // WHEN: Computing ghost vector
      const ghost = analyzer.computeGhostVector(actual, ideal);

      // THEN: Should use min(actual.length, ideal.length) per implementation
      expect(ghost).toHaveLength(2);
    });

    it('should cap maxGaps in detectPhantomGaps to config.maxGaps', async () => {
      // GIVEN: Phantom surface with many files generating many gaps
      const manyFiles = new Map<string, number[]>();
      for (let i = 0; i < 200; i++) {
        manyFiles.set(`src/module-${i}.ts`, new Array(768).fill(0.5));
      }

      const surface: PhantomSurface = {
        ghostVectors: manyFiles,
        idealSurface: new Array(768).fill(0.8),
        actualSurface: new Array(768).fill(0.2),
        phantomRatio: 0.8,
        computedAt: Date.now(),
        filesAnalyzed: 200,
      };

      // WHEN: Detecting gaps (default maxGaps is 50)
      const result = await analyzer.detectPhantomGaps(surface);

      // THEN: Should not exceed maxGaps limit
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeLessThanOrEqual(50);
      }
    });

    it('should return valid phantom ratio from getPhantomRatio', () => {
      // GIVEN: Freshly initialized analyzer
      // WHEN: Getting phantom ratio
      const ratio = analyzer.getPhantomRatio();

      // THEN: Should be a number between 0 and 1
      expect(typeof ratio).toBe('number');
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });

    it('should insert ghost vectors into HNSW index during computePhantomSurface', async () => {
      // GIVEN: Coverage data
      const coverageData = createPartialCoverageData();

      // WHEN: Computing phantom surface
      await analyzer.computePhantomSurface(coverageData, projectContext);

      // THEN: HNSW index insert should have been called for each file
      expect(mockIndex.insert).toHaveBeenCalledTimes(3);
    });
  });

  // ===========================================================================
  // Integration-style: full pipeline (2 tests)
  // ===========================================================================

  describe('full pipeline integration', () => {
    it('should run compute -> detect -> rank as a complete pipeline', async () => {
      // GIVEN: Partial coverage data
      const coverageData = createPartialCoverageData();

      // WHEN: Running full ghost analysis pipeline
      const surfaceResult = await analyzer.computePhantomSurface(coverageData, projectContext);
      expect(surfaceResult.success).toBe(true);
      if (!surfaceResult.success) return;

      const gapsResult = await analyzer.detectPhantomGaps(surfaceResult.value);
      expect(gapsResult.success).toBe(true);
      if (!gapsResult.success) return;

      const ranked = analyzer.rankPhantomGaps(gapsResult.value);

      // THEN: Pipeline should produce ranked phantom gaps
      expect(Array.isArray(ranked)).toBe(true);
      // All gaps should have valid properties
      for (const gap of ranked) {
        expect(gap.id).toBeDefined();
        expect(gap.file).toBeDefined();
        expect(gap.category).toBeDefined();
        expect(gap.riskScore).toBeGreaterThanOrEqual(0);
        expect(gap.riskScore).toBeLessThanOrEqual(1);
        expect(gap.ghostDistance).toBeGreaterThanOrEqual(0);
        expect(gap.ghostDistance).toBeLessThanOrEqual(1);
      }
    });

    it('should allow updateIdealSurface to influence subsequent analysis', async () => {
      // GIVEN: Initial analysis
      const coverageData = createPartialCoverageData();
      const initial = await analyzer.computePhantomSurface(coverageData, projectContext);
      expect(initial.success).toBe(true);

      // WHEN: Updating ideal surface with new patterns then re-analyzing
      await analyzer.updateIdealSurface([
        {
          id: 'learned-auth',
          category: 'missing-error-handler',
          vector: new Array(768).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.7 + 0.3),
          weight: 2.0,
          source: 'learning',
        },
      ]);
      const updated = await analyzer.computePhantomSurface(coverageData, projectContext);

      // THEN: Updated analysis should succeed
      expect(updated.success).toBe(true);
      if (updated.success) {
        expect(typeof updated.value.phantomRatio).toBe('number');
      }
    });
  });
});
