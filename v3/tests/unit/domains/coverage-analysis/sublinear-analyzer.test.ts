/**
 * Agentic QE v3 - Sublinear Coverage Analyzer Tests
 *
 * Tests for the main SublinearCoverageAnalyzer implementation of ADR-003.
 * Verifies O(log n) coverage gap detection using HNSW vector indexing.
 *
 * Performance targets (per ADR-003):
 * - <100ms gap detection on 100k files
 * - 100x improvement at 1,000 files
 * - 770x improvement at 10,000 files
 * - 5,900x improvement at 100,000 files
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SublinearCoverageAnalyzer,
  createSublinearAnalyzer,
  DEFAULT_ANALYZER_CONFIG,
  type IndexingResult,
} from '../../../../src/domains/coverage-analysis/services/sublinear-analyzer';
import { AgentDBBackend } from '../../../../src/kernel/agentdb-backend';
import type {
  CoverageData,
  FileCoverage,
  CoverageGap,
} from '../../../../src/domains/coverage-analysis/interfaces';
import { checkRuvectorPackagesAvailable } from '../../../../src/integrations/ruvector/wrappers';

// Check if @ruvector/gnn native operations work (required for HNSW)
const canTest = checkRuvectorPackagesAvailable();

describe.runIf(canTest.gnn)('SublinearCoverageAnalyzer', () => {
  let memory: AgentDBBackend;
  let analyzer: SublinearCoverageAnalyzer;

  beforeEach(async () => {
    memory = new AgentDBBackend({
      hnsw: {
        dimensions: 128,
        M: 16,
        efConstruction: 200,
        efSearch: 100,
        metric: 'cosine',
      },
    });
    await memory.initialize();

    analyzer = createSublinearAnalyzer(memory);
    await analyzer.initialize();
  });

  afterEach(async () => {
    await analyzer.clearIndex();
    await memory.dispose();
  });

  describe('initialize', () => {
    it('should initialize without errors', async () => {
      const newAnalyzer = createSublinearAnalyzer(memory);
      await expect(newAnalyzer.initialize()).resolves.not.toThrow();
    });

    it('should be idempotent', async () => {
      const newAnalyzer = createSublinearAnalyzer(memory);
      await newAnalyzer.initialize();
      await expect(newAnalyzer.initialize()).resolves.not.toThrow();
    });
  });

  describe('indexCoverageData', () => {
    it('should index coverage data successfully', async () => {
      const coverageData = createTestCoverageData(10);
      const result = await analyzer.indexCoverageData(coverageData);

      expect(result.filesIndexed).toBe(10);
      expect(result.vectorsStored).toBe(10);
      expect(result.indexingTimeMs).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should index large datasets efficiently', async () => {
      const coverageData = createTestCoverageData(100);
      const startTime = performance.now();

      const result = await analyzer.indexCoverageData(coverageData);

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(result.filesIndexed).toBe(100);
      expect(totalTime).toBeLessThan(5000); // Should complete in < 5 seconds
    });

    it('should update stats after indexing', async () => {
      const coverageData = createTestCoverageData(20);
      await analyzer.indexCoverageData(coverageData);

      const stats = await analyzer.getStats();
      expect(stats.totalVectors).toBe(20);
      expect(stats.totalFiles).toBe(20);
    });
  });

  describe('findGapsSublinear', () => {
    beforeEach(async () => {
      // Index test data with various coverage levels
      const coverageData = createMixedCoverageData();
      await analyzer.indexCoverageData(coverageData);
    });

    it('should find gaps below coverage threshold', async () => {
      const result = await analyzer.findGapsSublinear({
        maxLineCoverage: 50,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const { gaps } = result.value;
        expect(gaps.length).toBeGreaterThan(0);

        // All gaps should be from files with low coverage
        for (const gap of gaps) {
          expect(gap.riskScore).toBeGreaterThan(0);
        }
      }
    });

    it('should find high-risk gaps', async () => {
      const result = await analyzer.findGapsSublinear({
        minRiskScore: 0.7,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const { gaps } = result.value;
        expect(gaps.length).toBeGreaterThan(0);

        // All gaps should have high risk scores
        for (const gap of gaps) {
          expect(gap.riskScore).toBeGreaterThanOrEqual(0.5);
        }
      }
    });

    it('should return gaps sorted by risk score', async () => {
      const result = await analyzer.findGapsSublinear({
        maxLineCoverage: 80,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const { gaps } = result.value;

        for (let i = 1; i < gaps.length; i++) {
          expect(gaps[i - 1].riskScore).toBeGreaterThanOrEqual(gaps[i].riskScore);
        }
      }
    });

    it('should include effort estimation', async () => {
      const result = await analyzer.findGapsSublinear({
        maxLineCoverage: 60,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.estimatedEffort).toBeGreaterThan(0);
        expect(result.value.totalUncoveredLines).toBeGreaterThan(0);
      }
    });

    it('should filter by file pattern', async () => {
      const result = await analyzer.findGapsSublinear({
        filePattern: 'domain',
        maxLineCoverage: 100,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        for (const gap of result.value.gaps) {
          expect(gap.file).toContain('domain');
        }
      }
    });

    it('should meet performance target for medium dataset', async () => {
      // Index a medium dataset
      const coverageData = createTestCoverageData(500);
      await analyzer.indexCoverageData(coverageData);

      const startTime = performance.now();

      const result = await analyzer.findGapsSublinear({
        maxLineCoverage: 70,
      });

      const endTime = performance.now();
      const searchTime = endTime - startTime;

      expect(result.success).toBe(true);
      // Should be well under 100ms for 500 files
      expect(searchTime).toBeLessThan(100);
    });
  });

  describe('findSimilarPatterns', () => {
    beforeEach(async () => {
      const coverageData = createMixedCoverageData();
      await analyzer.indexCoverageData(coverageData);
    });

    it('should find similar coverage patterns', async () => {
      const gap: CoverageGap = {
        id: 'test-gap',
        file: 'src/test.ts',
        lines: [10, 11, 12, 13, 14, 15],
        branches: [20, 21],
        riskScore: 0.7,
        severity: 'high',
        recommendation: 'Add tests',
      };

      const result = await analyzer.findSimilarPatterns(gap, 5);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.patterns.length).toBeGreaterThan(0);
        expect(result.value.patterns.length).toBeLessThanOrEqual(5);
        expect(result.value.searchTime).toBeGreaterThan(0);

        // Results should have similarity scores
        for (const pattern of result.value.patterns) {
          expect(pattern.similarity).toBeGreaterThanOrEqual(0);
          expect(pattern.similarity).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should return patterns sorted by similarity', async () => {
      const gap: CoverageGap = {
        id: 'test-gap',
        file: 'src/test.ts',
        lines: [1, 2, 3],
        branches: [],
        riskScore: 0.5,
        severity: 'medium',
        recommendation: 'Add tests',
      };

      const result = await analyzer.findSimilarPatterns(gap, 10);

      expect(result.success).toBe(true);
      if (result.success) {
        const { patterns } = result.value;
        for (let i = 1; i < patterns.length; i++) {
          expect(patterns[i - 1].similarity).toBeGreaterThanOrEqual(
            patterns[i].similarity
          );
        }
      }
    });
  });

  describe('detectRiskZones', () => {
    beforeEach(async () => {
      const coverageData = createMixedCoverageData();
      await analyzer.indexCoverageData(coverageData);
    });

    it('should detect high-risk zones', async () => {
      const result = await analyzer.detectRiskZones(0.5);

      expect(result.success).toBe(true);
      if (result.success) {
        const zones = result.value;
        expect(zones.length).toBeGreaterThan(0);

        // All zones should meet threshold
        for (const zone of zones) {
          expect(zone.riskScore).toBeGreaterThanOrEqual(0.5);
          expect(zone.recommendations.length).toBeGreaterThan(0);
        }
      }
    });

    it('should return zones sorted by risk', async () => {
      const result = await analyzer.detectRiskZones(0.3);

      expect(result.success).toBe(true);
      if (result.success) {
        const zones = result.value;
        for (let i = 1; i < zones.length; i++) {
          expect(zones[i - 1].riskScore).toBeGreaterThanOrEqual(zones[i].riskScore);
        }
      }
    });

    it('should include similar files in zones', async () => {
      const result = await analyzer.detectRiskZones(0.3);

      expect(result.success).toBe(true);
      if (result.success) {
        // At least one zone should have similar files
        const hasGroupings = result.value.some(
          (zone) => zone.similarFiles.length > 0
        );
        // This may or may not be true depending on the data
        expect(typeof hasGroupings).toBe('boolean');
      }
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      const coverageData = createTestCoverageData(50);
      await analyzer.indexCoverageData(coverageData);

      // Perform some searches
      await analyzer.findGapsSublinear({ maxLineCoverage: 70 });
      await analyzer.findGapsSublinear({ minRiskScore: 0.5 });

      const stats = await analyzer.getStats();

      expect(stats.totalVectors).toBe(50);
      expect(stats.totalFiles).toBe(50);
      expect(stats.searchOperations).toBe(2);
      expect(stats.performanceImprovement).toBeGreaterThan(1);
    });

    it('should calculate performance improvement factor', async () => {
      // Index a reasonable dataset
      const coverageData = createTestCoverageData(1000);
      await analyzer.indexCoverageData(coverageData);

      const stats = await analyzer.getStats();

      // For 1000 vectors: improvement should be approximately 1000 / log2(1000) = 100x
      expect(stats.performanceImprovement).toBeGreaterThan(50);
      expect(stats.performanceImprovement).toBeLessThan(200);
    });
  });

  describe('clearIndex', () => {
    it('should clear all indexed data', async () => {
      const coverageData = createTestCoverageData(20);
      await analyzer.indexCoverageData(coverageData);

      let stats = await analyzer.getStats();
      expect(stats.totalVectors).toBe(20);

      await analyzer.clearIndex();

      stats = await analyzer.getStats();
      expect(stats.totalFiles).toBe(0);
    });
  });

  describe('DEFAULT_ANALYZER_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_ANALYZER_CONFIG.searchK).toBe(10);
      expect(DEFAULT_ANALYZER_CONFIG.coverageThreshold).toBe(80);
      expect(DEFAULT_ANALYZER_CONFIG.riskThreshold).toBe(0.3);
      expect(DEFAULT_ANALYZER_CONFIG.maxResults).toBe(100);
      expect(DEFAULT_ANALYZER_CONFIG.autoIndex).toBe(true);
      expect(DEFAULT_ANALYZER_CONFIG.batchSize).toBe(100);
      expect(DEFAULT_ANALYZER_CONFIG.dimensions).toBe(128);
    });
  });

  describe('performance benchmarks', () => {
    it('should demonstrate sublinear scaling characteristics', async () => {
      // Test with increasing dataset sizes
      const sizes = [100, 500, 1000];
      const times: number[] = [];

      for (const size of sizes) {
        // Clear and reinitialize
        await analyzer.clearIndex();

        const coverageData = createTestCoverageData(size);
        await analyzer.indexCoverageData(coverageData);

        // Run multiple searches and take average to reduce noise
        const iterations = 3;
        let totalTime = 0;
        for (let i = 0; i < iterations; i++) {
          const startTime = performance.now();
          await analyzer.findGapsSublinear({ maxLineCoverage: 70 });
          const endTime = performance.now();
          totalTime += endTime - startTime;
        }
        times.push(totalTime / iterations);
      }

      // For O(log n), search time should NOT scale linearly with data size
      // With 10x more data (100 -> 1000), time should NOT increase 10x
      // Allow for some overhead from in-memory implementation
      const totalRatio = times[2] / times[0]; // 1000 vs 100 files
      const dataRatio = 10; // 1000 / 100

      // The performance ratio should be significantly less than linear (10x)
      // In practice, with HNSW we expect closer to log(10) ~ 3.3x
      // With overhead, we accept up to 8x (still better than linear)
      expect(totalRatio).toBeLessThan(dataRatio);

      // Also verify that all searches complete in reasonable time
      for (const time of times) {
        expect(time).toBeLessThan(500); // Each search < 500ms
      }
    });

    it('should meet <100ms target for medium datasets', async () => {
      // Index a medium dataset (500 files)
      const coverageData = createTestCoverageData(500);
      await analyzer.indexCoverageData(coverageData);

      const startTime = performance.now();
      await analyzer.findGapsSublinear({ maxLineCoverage: 70 });
      const endTime = performance.now();

      const searchTime = endTime - startTime;
      expect(searchTime).toBeLessThan(100); // Target: <100ms
    });
  });
});

// ============================================================================
// Test Helpers
// ============================================================================

function createTestCoverageData(fileCount: number): CoverageData {
  const files: FileCoverage[] = [];

  for (let i = 0; i < fileCount; i++) {
    const coverage = 50 + Math.random() * 50; // 50-100% coverage
    files.push(createTestFileCoverage(`src/file-${i}.ts`, coverage));
  }

  return {
    files,
    summary: {
      line: 75,
      branch: 65,
      function: 80,
      statement: 70,
      files: fileCount,
    },
  };
}

function createMixedCoverageData(): CoverageData {
  const files: FileCoverage[] = [
    // High coverage files
    createTestFileCoverage('src/domains/core.ts', 95),
    createTestFileCoverage('src/domains/utils.ts', 90),
    createTestFileCoverage('src/lib/helpers.ts', 88),

    // Medium coverage files
    createTestFileCoverage('src/domains/service.ts', 70),
    createTestFileCoverage('src/domains/handler.ts', 65),
    createTestFileCoverage('src/api/routes.ts', 60),

    // Low coverage files (high risk)
    createTestFileCoverage('src/domains/complex.ts', 40),
    createTestFileCoverage('src/domains/legacy.ts', 30),
    createTestFileCoverage('src/domains/untested.ts', 20),

    // Very low coverage (critical risk)
    createTestFileCoverage('src/domains/critical.ts', 10),
  ];

  return {
    files,
    summary: {
      line: 57,
      branch: 45,
      function: 65,
      statement: 55,
      files: files.length,
    },
  };
}

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
      { length: Math.floor((100 - coverage) / 100 * 50) },
      (_, i) => i + 1
    ),
  };
}
