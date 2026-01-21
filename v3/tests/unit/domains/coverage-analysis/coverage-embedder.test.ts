/**
 * Agentic QE v3 - Coverage Embedder Tests
 *
 * Tests for the coverage embedder that converts coverage data into
 * dense vector embeddings for HNSW-based similarity search.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CoverageEmbedder,
  createCoverageEmbedder,
  DEFAULT_EMBEDDER_CONFIG,
  type CoverageQuery,
} from '../../../../src/domains/coverage-analysis/services/coverage-embedder';
import type { FileCoverage, CoverageGap } from '../../../../src/domains/coverage-analysis/interfaces';

describe('CoverageEmbedder', () => {
  let embedder: CoverageEmbedder;

  beforeEach(() => {
    embedder = createCoverageEmbedder();
  });

  describe('embedFileCoverage', () => {
    it('should create embedding with correct dimensions', () => {
      const coverage = createTestFileCoverage('src/test.ts', 80, 70, 90, 85);
      const result = embedder.embedFileCoverage(coverage);

      expect(result.vector).toHaveLength(DEFAULT_EMBEDDER_CONFIG.dimensions);
    });

    it('should create normalized embedding', () => {
      const coverage = createTestFileCoverage('src/test.ts', 80, 70, 90, 85);
      const result = embedder.embedFileCoverage(coverage);

      // L2 normalized vector should have magnitude close to 1
      const magnitude = Math.sqrt(
        result.vector.reduce((sum, v) => sum + v * v, 0)
      );
      expect(magnitude).toBeCloseTo(1, 1);
    });

    it('should include accurate metadata', () => {
      const coverage = createTestFileCoverage('src/test.ts', 80, 70, 90, 85);
      coverage.uncoveredLines = [10, 11, 12, 13, 14];
      coverage.uncoveredBranches = [20, 21];

      const result = embedder.embedFileCoverage(coverage);

      expect(result.metadata.filePath).toBe('src/test.ts');
      expect(result.metadata.lineCoverage).toBeCloseTo(80, 1);
      expect(result.metadata.branchCoverage).toBeCloseTo(70, 1);
      expect(result.metadata.functionCoverage).toBeCloseTo(90, 1);
      expect(result.metadata.statementCoverage).toBeCloseTo(85, 1);
      expect(result.metadata.uncoveredLineCount).toBe(5);
      expect(result.metadata.uncoveredBranchCount).toBe(2);
    });

    it('should calculate risk score based on coverage gaps', () => {
      // Low coverage = high risk
      const lowCoverage = createTestFileCoverage('src/low.ts', 30, 20, 40, 35);
      const lowResult = embedder.embedFileCoverage(lowCoverage);

      // High coverage = low risk
      const highCoverage = createTestFileCoverage('src/high.ts', 95, 90, 98, 96);
      const highResult = embedder.embedFileCoverage(highCoverage);

      expect(lowResult.metadata.riskScore).toBeGreaterThan(highResult.metadata.riskScore);
    });

    it('should have higher confidence for files with more data', () => {
      // File with all coverage types
      const fullCoverage = createTestFileCoverage('src/full.ts', 80, 70, 90, 85);
      fullCoverage.lines.total = 100;
      fullCoverage.branches.total = 50;
      fullCoverage.functions.total = 20;
      fullCoverage.statements.total = 120;

      const fullResult = embedder.embedFileCoverage(fullCoverage);

      // File with minimal data
      const minCoverage = createTestFileCoverage('src/min.ts', 80, 70, 90, 85);
      minCoverage.lines.total = 0;
      minCoverage.branches.total = 0;
      minCoverage.functions.total = 0;
      minCoverage.statements.total = 0;

      const minResult = embedder.embedFileCoverage(minCoverage);

      expect(fullResult.confidence).toBeGreaterThan(minResult.confidence);
    });

    it('should create similar embeddings for similar coverage', () => {
      const coverage1 = createTestFileCoverage('src/a.ts', 75, 65, 80, 70);
      const coverage2 = createTestFileCoverage('src/b.ts', 76, 66, 81, 71);
      const coverage3 = createTestFileCoverage('src/c.ts', 20, 15, 25, 18);

      const result1 = embedder.embedFileCoverage(coverage1);
      const result2 = embedder.embedFileCoverage(coverage2);
      const result3 = embedder.embedFileCoverage(coverage3);

      // Coverage1 and coverage2 should be more similar than coverage1 and coverage3
      const similarity12 = cosineSimilarity(result1.vector, result2.vector);
      const similarity13 = cosineSimilarity(result1.vector, result3.vector);

      expect(similarity12).toBeGreaterThan(similarity13);
    });
  });

  describe('embedCoverageGap', () => {
    it('should create embedding from coverage gap', () => {
      const gap: CoverageGap = {
        id: 'gap-123',
        file: 'src/test.ts',
        lines: [10, 11, 12, 13, 14],
        branches: [20, 21],
        riskScore: 0.7,
        severity: 'high',
        recommendation: 'Add tests',
      };

      const result = embedder.embedCoverageGap(gap);

      expect(result.vector).toHaveLength(DEFAULT_EMBEDDER_CONFIG.dimensions);
      expect(result.metadata.filePath).toBe('src/test.ts');
      expect(result.metadata.uncoveredLineCount).toBe(5);
      expect(result.metadata.uncoveredBranchCount).toBe(2);
      expect(result.metadata.riskScore).toBe(0.7);
    });

    it('should encode gap severity in embedding', () => {
      const criticalGap: CoverageGap = {
        id: 'gap-critical',
        file: 'src/critical.ts',
        lines: Array.from({ length: 50 }, (_, i) => i + 1),
        branches: Array.from({ length: 10 }, (_, i) => i + 1),
        riskScore: 0.9,
        severity: 'critical',
        recommendation: 'Critical',
      };

      const lowGap: CoverageGap = {
        id: 'gap-low',
        file: 'src/low.ts',
        lines: [1, 2],
        branches: [],
        riskScore: 0.2,
        severity: 'low',
        recommendation: 'Low priority',
      };

      const criticalResult = embedder.embedCoverageGap(criticalGap);
      const lowResult = embedder.embedCoverageGap(lowGap);

      // Embeddings should encode risk score differently
      // The risk score is captured in the embedding
      expect(criticalResult.metadata.riskScore).toBeGreaterThan(lowResult.metadata.riskScore);

      // The embeddings may be similar due to normalization, but risk scores differ
      expect(criticalResult.vector[0]).not.toBe(lowResult.vector[0]);
    });
  });

  describe('embedQuery', () => {
    it('should create query embedding from coverage criteria', () => {
      const query: CoverageQuery = {
        minLineCoverage: 60,
        maxLineCoverage: 80,
        minRiskScore: 0.5,
      };

      const result = embedder.embedQuery(query);

      expect(result.vector).toHaveLength(DEFAULT_EMBEDDER_CONFIG.dimensions);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should create different embeddings for different queries', () => {
      const lowCoverageQuery: CoverageQuery = {
        maxLineCoverage: 40,
        minRiskScore: 0.7,
      };

      const highCoverageQuery: CoverageQuery = {
        minLineCoverage: 80,
        maxRiskScore: 0.3,
      };

      const lowResult = embedder.embedQuery(lowCoverageQuery);
      const highResult = embedder.embedQuery(highCoverageQuery);

      // Queries should have different metadata
      expect(lowResult.metadata.lineCoverage).not.toBe(highResult.metadata.lineCoverage);

      // The first few dimensions should differ based on query parameters
      expect(lowResult.vector[0]).not.toBe(highResult.vector[0]);
      expect(lowResult.vector[4]).not.toBe(highResult.vector[4]);
    });
  });

  describe('batchEmbed', () => {
    it('should embed multiple files efficiently', () => {
      const coverages = [
        createTestFileCoverage('src/a.ts', 80, 70, 90, 85),
        createTestFileCoverage('src/b.ts', 60, 50, 70, 65),
        createTestFileCoverage('src/c.ts', 40, 30, 50, 45),
      ];

      const results = embedder.batchEmbed(coverages);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.vector).toHaveLength(DEFAULT_EMBEDDER_CONFIG.dimensions);
        expect(result.metadata).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      });
    });
  });

  describe('DEFAULT_EMBEDDER_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_EMBEDDER_CONFIG.dimensions).toBe(128);
      expect(DEFAULT_EMBEDDER_CONFIG.includePathFeatures).toBe(true);
      expect(DEFAULT_EMBEDDER_CONFIG.includeTemporalFeatures).toBe(true);
      expect(DEFAULT_EMBEDDER_CONFIG.normalization).toBe('l2');
    });
  });

  describe('custom configuration', () => {
    it('should respect custom dimensions', () => {
      const customEmbedder = createCoverageEmbedder({ dimensions: 64 });
      const coverage = createTestFileCoverage('src/test.ts', 80, 70, 90, 85);
      const result = customEmbedder.embedFileCoverage(coverage);

      expect(result.vector).toHaveLength(64);
    });

    it('should respect custom normalization', () => {
      const minmaxEmbedder = createCoverageEmbedder({ normalization: 'minmax' });
      const coverage = createTestFileCoverage('src/test.ts', 80, 70, 90, 85);
      const result = minmaxEmbedder.embedFileCoverage(coverage);

      // MinMax normalized values should be between 0 and 1
      result.vector.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    });
  });
});

// ============================================================================
// Test Helpers
// ============================================================================

function createTestFileCoverage(
  path: string,
  lineCoverage: number,
  branchCoverage: number,
  functionCoverage: number,
  statementCoverage: number
): FileCoverage {
  const total = 100;
  const linesCovered = Math.floor((lineCoverage / 100) * total);
  const branchesCovered = Math.floor((branchCoverage / 100) * 50);
  const functionsCovered = Math.floor((functionCoverage / 100) * 20);
  const statementsCovered = Math.floor((statementCoverage / 100) * 120);

  return {
    path,
    lines: { covered: linesCovered, total },
    branches: { covered: branchesCovered, total: 50 },
    functions: { covered: functionsCovered, total: 20 },
    statements: { covered: statementsCovered, total: 120 },
    uncoveredLines: Array.from({ length: total - linesCovered }, (_, i) => i + linesCovered + 1),
    uncoveredBranches: Array.from(
      { length: 50 - branchesCovered },
      (_, i) => i + branchesCovered + 1
    ),
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vector length mismatch');

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
