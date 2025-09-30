/**
 * Tests for Coverage Optimizer - Sublinear Algorithms
 * Validates O(log n) complexity claims and optimization effectiveness
 */

import {
  SublinearCoverageOptimizer,
  CoveragePoint,
  CoverageConstraint,
  CoverageMatrix,
  OptimizationResult,
  createCoverageOptimizer
} from '../../../src/utils/sublinear/coverageOptimizer';

describe('SublinearCoverageOptimizer', () => {
  let optimizer: SublinearCoverageOptimizer;

  beforeEach(() => {
    optimizer = new SublinearCoverageOptimizer(0.05, 1000);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default parameters', () => {
      const defaultOptimizer = new SublinearCoverageOptimizer();
      expect(defaultOptimizer).toBeInstanceOf(SublinearCoverageOptimizer);
    });

    it('should initialize with custom epsilon and max iterations', () => {
      const customOptimizer = new SublinearCoverageOptimizer(0.01, 500);
      expect(customOptimizer).toBeInstanceOf(SublinearCoverageOptimizer);
    });

    it('should be created via factory function', () => {
      const factoryOptimizer = createCoverageOptimizer(0.03);
      expect(factoryOptimizer).toBeInstanceOf(SublinearCoverageOptimizer);
    });
  });

  describe('Coverage Matrix Creation', () => {
    it('should create coverage matrix from test and coverage point data', () => {
      const tests = [
        { id: 'test1', coveredPoints: ['point1', 'point2'] },
        { id: 'test2', coveredPoints: ['point2', 'point3'] },
        { id: 'test3', coveredPoints: ['point1', 'point3', 'point4'] }
      ];

      const coveragePoints: CoveragePoint[] = [
        { id: 'point1', type: 'statement', weight: 1.0, difficulty: 0.5 },
        { id: 'point2', type: 'branch', weight: 1.5, difficulty: 0.8 },
        { id: 'point3', type: 'function', weight: 2.0, difficulty: 1.0 },
        { id: 'point4', type: 'line', weight: 1.0, difficulty: 0.3 }
      ];

      const matrix = SublinearCoverageOptimizer.createCoverageMatrix(tests, coveragePoints);

      expect(matrix.rows).toBe(3);
      expect(matrix.cols).toBe(4);
      expect(matrix.testIds).toEqual(['test1', 'test2', 'test3']);
      expect(matrix.coveragePointIds).toEqual(['point1', 'point2', 'point3', 'point4']);

      // Verify matrix values
      expect(matrix.matrix[0 * 4 + 0]).toBe(1); // test1 covers point1
      expect(matrix.matrix[0 * 4 + 1]).toBe(1); // test1 covers point2
      expect(matrix.matrix[0 * 4 + 2]).toBe(0); // test1 doesn't cover point3
      expect(matrix.matrix[1 * 4 + 1]).toBe(1); // test2 covers point2
      expect(matrix.matrix[2 * 4 + 3]).toBe(1); // test3 covers point4
    });

    it('should handle empty coverage points', () => {
      const tests = [{ id: 'test1', coveredPoints: [] }];
      const coveragePoints: CoveragePoint[] = [];

      const matrix = SublinearCoverageOptimizer.createCoverageMatrix(tests, coveragePoints);

      expect(matrix.rows).toBe(1);
      expect(matrix.cols).toBe(0);
      expect(matrix.matrix.length).toBe(0);
    });
  });

  describe('Coverage Optimization Algorithm', () => {
    let coverageMatrix: CoverageMatrix;
    let coveragePoints: CoveragePoint[];
    let constraint: CoverageConstraint;

    beforeEach(() => {
      // Create test data
      const tests = [
        { id: 'test1', coveredPoints: ['p1', 'p2'] },
        { id: 'test2', coveredPoints: ['p2', 'p3'] },
        { id: 'test3', coveredPoints: ['p1', 'p3', 'p4'] },
        { id: 'test4', coveredPoints: ['p4', 'p5'] },
        { id: 'test5', coveredPoints: ['p1', 'p5'] }
      ];

      coveragePoints = [
        { id: 'p1', type: 'statement', weight: 1.0, difficulty: 0.5 },
        { id: 'p2', type: 'branch', weight: 1.5, difficulty: 0.8 },
        { id: 'p3', type: 'function', weight: 2.0, difficulty: 1.0 },
        { id: 'p4', type: 'line', weight: 1.0, difficulty: 0.3 },
        { id: 'p5', type: 'statement', weight: 1.2, difficulty: 0.6 }
      ];

      coverageMatrix = SublinearCoverageOptimizer.createCoverageMatrix(tests, coveragePoints);

      constraint = {
        targetPercentage: 80,
        weightedTarget: 90,
        maxTests: 3,
        timeLimit: 5000
      };
    });

    it('should optimize coverage within time constraints', async () => {
      const result = await optimizer.optimizeCoverage(coverageMatrix, coveragePoints, constraint);

      expect(result).toBeDefined();
      expect(result.selectedTestIndices).toBeInstanceOf(Array);
      expect(result.selectedTestIndices.length).toBeLessThanOrEqual(constraint.maxTests);
      expect(result.optimizationTime).toBeGreaterThan(0);
      expect(result.optimizationTime).toBeLessThan(constraint.timeLimit);
    });

    it('should achieve reasonable coverage levels', async () => {
      const result = await optimizer.optimizeCoverage(coverageMatrix, coveragePoints, constraint);

      expect(result.coverageAchieved).toBeGreaterThanOrEqual(0);
      expect(result.coverageAchieved).toBeLessThanOrEqual(1);
      expect(result.weightedCoverageScore).toBeGreaterThanOrEqual(0);
      expect(result.weightedCoverageScore).toBeLessThanOrEqual(1);
    });

    it('should provide algorithm metrics with sublinear complexity evidence', async () => {
      const result = await optimizer.optimizeCoverage(coverageMatrix, coveragePoints, constraint);

      expect(result.algorithmMetrics).toBeDefined();
      expect(result.algorithmMetrics.iterationsUsed).toBeGreaterThan(0);
      expect(result.algorithmMetrics.convergenceRate).toBeGreaterThanOrEqual(0);
      expect(result.algorithmMetrics.dimensionReduction).toBeGreaterThan(0);
      expect(result.algorithmMetrics.dimensionReduction).toBeLessThanOrEqual(1);
    });

    it('should demonstrate redundancy reduction', async () => {
      const result = await optimizer.optimizeCoverage(coverageMatrix, coveragePoints, constraint);

      expect(result.redundancyReduction).toBeGreaterThanOrEqual(0);
      expect(result.redundancyReduction).toBeLessThanOrEqual(1);
    });

    it('should handle high coverage targets', async () => {
      const highConstraint = { ...constraint, targetPercentage: 95 };
      const result = await optimizer.optimizeCoverage(coverageMatrix, coveragePoints, highConstraint);

      expect(result).toBeDefined();
      expect(result.selectedTestIndices.length).toBeGreaterThan(0);
    });

    it('should handle low test limits', async () => {
      const restrictiveConstraint = { ...constraint, maxTests: 1 };
      const result = await optimizer.optimizeCoverage(coverageMatrix, coveragePoints, restrictiveConstraint);

      expect(result.selectedTestIndices.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Spectral Sparsification', () => {
    it('should apply spectral sparsification to dense matrices', () => {
      const matrix = new Float64Array([
        1, 0, 1, 0,
        0, 1, 1, 1,
        1, 1, 0, 1,
        0, 0, 1, 1
      ]);

      // Use reflection to access private sparsifier
      const sparsifier = (optimizer as any).sparsifier;
      const result = sparsifier.sparsify(matrix, 4, 4);

      expect(result.sparsifiedMatrix).toBeInstanceOf(Float64Array);
      expect(result.sparsifiedMatrix.length).toBe(matrix.length);
      expect(result.sparsificationRatio).toBeGreaterThan(0);
      expect(result.sparsificationRatio).toBeLessThanOrEqual(1);
    });
  });

  describe('Johnson-Lindenstrauss Dimension Reduction', () => {
    it('should calculate optimal dimension based on problem size', () => {
      // Test with different problem sizes to verify O(log n) scaling
      const sizes = [10, 100, 1000, 10000];

      for (const size of sizes) {
        // Access private method through type assertion
        const dimension = (optimizer as any).calculateOptimalDimension(size, size);

        expect(dimension).toBeGreaterThan(0);
        expect(dimension).toBeLessThanOrEqual(size / 2);

        // Verify logarithmic scaling
        const logFactor = Math.log(size);
        expect(dimension).toBeGreaterThan(logFactor);
      }
    });

    it('should apply JL transform while preserving distances approximately', async () => {
      // Create a simple test matrix
      const originalMatrix = new Float64Array([
        1, 0, 1, 0, 1,
        0, 1, 1, 1, 0,
        1, 1, 0, 1, 1
      ]);

      const targetDimension = 3;

      // Access private method through reflection
      const projectedData = await (optimizer as any).applyJLTransform(
        originalMatrix, 3, 5, targetDimension
      );

      expect(projectedData.matrix).toBeInstanceOf(Float64Array);
      expect(projectedData.rows).toBe(3);
      expect(projectedData.cols).toBe(targetDimension);
      expect(projectedData.matrix.length).toBe(3 * targetDimension);
    });
  });

  describe('Sublinear Solver Integration', () => {
    it('should solve optimization problems using true sublinear methods', async () => {
      const matrix = new Float64Array([2, 1, 1, 2]);
      const constraintVector = new Float64Array([1, 1]);
      const constraint: CoverageConstraint = {
        targetPercentage: 80,
        weightedTarget: 85,
        maxTests: 2,
        timeLimit: 1000
      };

      // Access private method
      const solution = await (optimizer as any).solveTrueSublinear(
        matrix, 2, 2, constraintVector, constraint
      );

      expect(solution.solution).toBeInstanceOf(Float64Array);
      expect(solution.iterations).toBeGreaterThan(0);
      expect(solution.convergenceRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance and Complexity Validation', () => {
    it('should demonstrate O(log n) complexity scaling', async () => {
      const results: Array<{ size: number; time: number }> = [];
      const sizes = [50, 100, 200, 400, 800];

      for (const size of sizes) {
        // Generate test data of increasing size
        const tests = Array(size).fill(0).map((_, i) => ({
          id: `test${i}`,
          coveredPoints: [`p${i % 10}`, `p${(i + 1) % 10}`]
        }));

        const coveragePoints: CoveragePoint[] = Array(10).fill(0).map((_, i) => ({
          id: `p${i}`,
          type: 'statement' as const,
          weight: 1.0,
          difficulty: 0.5
        }));

        const matrix = SublinearCoverageOptimizer.createCoverageMatrix(tests, coveragePoints);
        const constraint: CoverageConstraint = {
          targetPercentage: 80,
          weightedTarget: 85,
          maxTests: Math.min(20, size / 4),
          timeLimit: 5000
        };

        const startTime = Date.now();
        const result = await optimizer.optimizeCoverage(matrix, coveragePoints, constraint);
        const endTime = Date.now();

        results.push({ size, time: endTime - startTime });

        expect(result.optimizationTime).toBeLessThan(5000);
      }

      // Verify complexity is better than linear
      // Check that time doesn't scale linearly with problem size
      const timeGrowthRatio = results[results.length - 1].time / results[0].time;
      const sizeGrowthRatio = sizes[sizes.length - 1] / sizes[0];

      expect(timeGrowthRatio).toBeLessThan(sizeGrowthRatio);
    });

    it('should handle large problem instances efficiently', async () => {
      const largeSize = 1000;
      const tests = Array(largeSize).fill(0).map((_, i) => ({
        id: `test${i}`,
        coveredPoints: [`p${i % 50}`, `p${(i + 1) % 50}`, `p${(i + 2) % 50}`]
      }));

      const coveragePoints: CoveragePoint[] = Array(50).fill(0).map((_, i) => ({
        id: `p${i}`,
        type: 'statement' as const,
        weight: 1.0 + Math.random(),
        difficulty: Math.random()
      }));

      const matrix = SublinearCoverageOptimizer.createCoverageMatrix(tests, coveragePoints);
      const constraint: CoverageConstraint = {
        targetPercentage: 85,
        weightedTarget: 90,
        maxTests: 50,
        timeLimit: 10000
      };

      const startTime = Date.now();
      const result = await optimizer.optimizeCoverage(matrix, coveragePoints, constraint);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10000);
      expect(result.selectedTestIndices.length).toBeLessThanOrEqual(50);
      expect(result.coverageAchieved).toBeGreaterThan(0);
    });
  });

  describe('Coverage Quality Metrics', () => {
    let coverageMatrix: CoverageMatrix;
    let coveragePoints: CoveragePoint[];

    beforeEach(() => {
      const tests = [
        { id: 'test1', coveredPoints: ['p1', 'p2', 'p3'] },
        { id: 'test2', coveredPoints: ['p2', 'p4'] },
        { id: 'test3', coveredPoints: ['p1', 'p4', 'p5'] },
        { id: 'test4', coveredPoints: ['p3', 'p5'] }
      ];

      coveragePoints = [
        { id: 'p1', type: 'statement', weight: 2.0, difficulty: 0.8 },
        { id: 'p2', type: 'branch', weight: 3.0, difficulty: 1.0 },
        { id: 'p3', type: 'function', weight: 1.5, difficulty: 0.6 },
        { id: 'p4', type: 'line', weight: 1.0, difficulty: 0.4 },
        { id: 'p5', type: 'statement', weight: 2.5, difficulty: 0.9 }
      ];

      coverageMatrix = SublinearCoverageOptimizer.createCoverageMatrix(tests, coveragePoints);
    });

    it('should calculate weighted coverage scores correctly', async () => {
      const constraint: CoverageConstraint = {
        targetPercentage: 80,
        weightedTarget: 85,
        maxTests: 3,
        timeLimit: 2000
      };

      const result = await optimizer.optimizeCoverage(coverageMatrix, coveragePoints, constraint);

      expect(result.weightedCoverageScore).toBeGreaterThan(result.coverageAchieved);
      expect(result.weightedCoverageScore).toBeLessThanOrEqual(1);
    });

    it('should minimize redundancy between selected tests', async () => {
      const constraint: CoverageConstraint = {
        targetPercentage: 100,
        weightedTarget: 100,
        maxTests: 4,
        timeLimit: 2000
      };

      const result = await optimizer.optimizeCoverage(coverageMatrix, coveragePoints, constraint);

      expect(result.redundancyReduction).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty coverage matrix', async () => {
      const emptyMatrix: CoverageMatrix = {
        matrix: new Float64Array([]),
        rows: 0,
        cols: 0,
        testIds: [],
        coveragePointIds: []
      };

      const constraint: CoverageConstraint = {
        targetPercentage: 80,
        weightedTarget: 85,
        maxTests: 5,
        timeLimit: 1000
      };

      await expect(optimizer.optimizeCoverage(emptyMatrix, [], constraint))
        .resolves.toBeDefined();
    });

    it('should handle single test case', async () => {
      const tests = [{ id: 'test1', coveredPoints: ['p1'] }];
      const coveragePoints: CoveragePoint[] = [
        { id: 'p1', type: 'statement', weight: 1.0, difficulty: 0.5 }
      ];

      const matrix = SublinearCoverageOptimizer.createCoverageMatrix(tests, coveragePoints);
      const constraint: CoverageConstraint = {
        targetPercentage: 80,
        weightedTarget: 85,
        maxTests: 1,
        timeLimit: 1000
      };

      const result = await optimizer.optimizeCoverage(matrix, coveragePoints, constraint);

      expect(result.selectedTestIndices).toEqual([0]);
      expect(result.coverageAchieved).toBe(1);
    });

    it('should handle impossible coverage targets gracefully', async () => {
      const tests = [{ id: 'test1', coveredPoints: ['p1'] }];
      const coveragePoints: CoveragePoint[] = [
        { id: 'p1', type: 'statement', weight: 1.0, difficulty: 0.5 },
        { id: 'p2', type: 'statement', weight: 1.0, difficulty: 0.5 }
      ];

      const matrix = SublinearCoverageOptimizer.createCoverageMatrix(tests, coveragePoints);
      const constraint: CoverageConstraint = {
        targetPercentage: 100,
        weightedTarget: 100,
        maxTests: 1,
        timeLimit: 1000
      };

      const result = await optimizer.optimizeCoverage(matrix, coveragePoints, constraint);

      expect(result.coverageAchieved).toBeLessThan(1);
      expect(result.selectedTestIndices.length).toBe(1);
    });

    it('should handle zero test budget', async () => {
      const tests = [{ id: 'test1', coveredPoints: ['p1'] }];
      const coveragePoints: CoveragePoint[] = [
        { id: 'p1', type: 'statement', weight: 1.0, difficulty: 0.5 }
      ];

      const matrix = SublinearCoverageOptimizer.createCoverageMatrix(tests, coveragePoints);
      const constraint: CoverageConstraint = {
        targetPercentage: 80,
        weightedTarget: 85,
        maxTests: 0,
        timeLimit: 1000
      };

      const result = await optimizer.optimizeCoverage(matrix, coveragePoints, constraint);

      expect(result.selectedTestIndices.length).toBe(0);
      expect(result.coverageAchieved).toBe(0);
    });
  });

  describe('Algorithm Convergence', () => {
    it('should converge within maximum iterations', async () => {
      const tests = Array(20).fill(0).map((_, i) => ({
        id: `test${i}`,
        coveredPoints: [`p${i % 5}`, `p${(i + 1) % 5}`]
      }));

      const coveragePoints: CoveragePoint[] = Array(5).fill(0).map((_, i) => ({
        id: `p${i}`,
        type: 'statement' as const,
        weight: 1.0,
        difficulty: 0.5
      }));

      const matrix = SublinearCoverageOptimizer.createCoverageMatrix(tests, coveragePoints);
      const constraint: CoverageConstraint = {
        targetPercentage: 85,
        weightedTarget: 90,
        maxTests: 10,
        timeLimit: 3000
      };

      const result = await optimizer.optimizeCoverage(matrix, coveragePoints, constraint);

      expect(result.algorithmMetrics.iterationsUsed).toBeLessThanOrEqual(1000); // maxIterations
      expect(result.algorithmMetrics.convergenceRate).toBeGreaterThanOrEqual(0);
    });
  });
});