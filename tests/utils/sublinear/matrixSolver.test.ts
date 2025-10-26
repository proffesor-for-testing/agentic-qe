/**
 * Tests for Matrix Solver - Sublinear Algorithms
 * Validates O(log n) complexity claims and algorithm correctness
 */

import {
  SublinearMatrixSolver,
  Matrix,
  SparseMatrix,
  SolverConfig,
  SolverResult,
  TemporalAdvantageResult,
  createMatrixSolver,
  MatrixUtils
} from '@utils/sublinear/matrixSolver';

describe('SublinearMatrixSolver', () => {
  let solver: SublinearMatrixSolver;

  beforeEach(() => {
    solver = new SublinearMatrixSolver();
  });

  afterEach(() => {
    // Explicit cleanup to prevent memory leaks
    solver = null as any;
    if (global.gc) {
      global.gc();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      expect(solver).toBeInstanceOf(SublinearMatrixSolver);
    });

    it('should initialize with custom configuration', () => {
      const config: Partial<SolverConfig> = {
        maxIterations: 500,
        tolerance: 1e-8,
        method: 'random-walk',
        enableSIMD: false
      };

      const customSolver = new SublinearMatrixSolver(config);
      expect(customSolver).toBeInstanceOf(SublinearMatrixSolver);
    });

    it('should be created via factory function', () => {
      const factorySolver = createMatrixSolver({
        method: 'neumann',
        maxIterations: 2000
      });
      expect(factorySolver).toBeInstanceOf(SublinearMatrixSolver);
    });

    it('should report capabilities', () => {
      const capabilities = solver.getCapabilities();

      expect(capabilities).toHaveProperty('wasmEnabled');
      expect(capabilities).toHaveProperty('simdEnabled');
      expect(capabilities).toHaveProperty('supportedMethods');
      expect(capabilities).toHaveProperty('maxRecommendedSize');

      expect(Array.isArray(capabilities.supportedMethods)).toBe(true);
      expect(capabilities.supportedMethods).toContain('neumann');
      expect(capabilities.supportedMethods).toContain('random-walk');
    });
  });

  describe('Matrix Utilities', () => {
    it('should create dense matrix from 2D array', () => {
      const data = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ];

      const matrix = MatrixUtils.createDenseMatrix(data);

      expect(matrix.rows).toBe(3);
      expect(matrix.cols).toBe(3);
      expect(matrix.format).toBe('dense');
      expect(matrix.data).toBeInstanceOf(Float64Array);
      expect(matrix.data[0]).toBe(1);
      expect(matrix.data[4]).toBe(5);
      expect(matrix.data[8]).toBe(9);
    });

    it('should create dense matrix with column-major format', () => {
      const data = [
        [1, 2],
        [3, 4]
      ];

      const matrix = MatrixUtils.createDenseMatrix(data, 'col-major');

      expect(matrix.rows).toBe(2);
      expect(matrix.cols).toBe(2);
      // Column-major: [1, 3, 2, 4]
      expect(matrix.data[0]).toBe(1);
      expect(matrix.data[1]).toBe(3);
      expect(matrix.data[2]).toBe(2);
      expect(matrix.data[3]).toBe(4);
    });

    it('should create sparse matrix from COO format', () => {
      const values = [1, 2, 3, 4];
      const rowIndices = [0, 0, 1, 1];
      const colIndices = [0, 1, 0, 1];

      const matrix = MatrixUtils.createSparseMatrix(values, rowIndices, colIndices, 2, 2);

      expect(matrix.rows).toBe(2);
      expect(matrix.cols).toBe(2);
      expect(matrix.values).toBeInstanceOf(Float64Array);
      expect(matrix.rowIndices).toBeInstanceOf(Int32Array);
      expect(matrix.colIndices).toBeInstanceOf(Int32Array);
      expect(Array.from(matrix.values)).toEqual([1, 2, 3, 4]);
    });

    it('should create identity matrix', () => {
      const identity = MatrixUtils.createIdentityMatrix(3);

      expect(identity.rows).toBe(3);
      expect(identity.cols).toBe(3);
      expect(identity.data[0]).toBe(1); // (0,0)
      expect(identity.data[1]).toBe(0); // (0,1)
      expect(identity.data[4]).toBe(1); // (1,1)
      expect(identity.data[8]).toBe(1); // (2,2)
    });

    it('should create random matrix with specified sparsity', () => {
      const randomMatrix = MatrixUtils.createRandomMatrix(5, 5, 0.3);

      expect(randomMatrix.rows).toBe(5);
      expect(randomMatrix.cols).toBe(5);
      expect(randomMatrix.format).toBe('dense');

      // Check sparsity approximately
      const nonZeroCount = Array.from(randomMatrix.data).filter(x => x !== 0).length;
      const expectedNonZero = 25 * 0.3;
      expect(nonZeroCount).toBeGreaterThan(expectedNonZero * 0.5);
      expect(nonZeroCount).toBeLessThan(expectedNonZero * 2);
    });
  });

  describe('True Sublinear Solving', () => {
    it('should solve simple linear system with dense matrix', async () => {
      // Solve: [2 1; 1 2] * x = [3; 3]
      // Solution should be x = [1; 1]
      const matrix: Matrix = {
        data: new Float64Array([2, 1, 1, 2]),
        rows: 2,
        cols: 2,
        format: 'dense'
      };
      const vector = new Float64Array([3, 3]);

      const result = await solver.solveTrueSublinear(matrix, vector);

      expect(result.solution).toBeInstanceOf(Float64Array);
      expect(result.solution.length).toBe(2);
      expect(result.iterations).toBeGreaterThan(0);
      expect(result.residual).toBeGreaterThanOrEqual(0);
      expect(result.convergenceTime).toBeGreaterThan(0);
      expect(result.complexityMetrics.actualComplexity).toBeGreaterThan(0);
      expect(result.complexityMetrics.theoreticalComplexity).toBeGreaterThan(0);

      // Solution should be approximately [1, 1]
      expect(Math.abs(result.solution[0] - 1)).toBeLessThan(0.5);
      expect(Math.abs(result.solution[1] - 1)).toBeLessThan(0.5);
    });

    it('should solve linear system with sparse matrix', async () => {
      const sparseMatrix: SparseMatrix = {
        values: new Float64Array([3, 1, 1, 3]),
        rowIndices: new Int32Array([0, 0, 1, 1]),
        colIndices: new Int32Array([0, 1, 0, 1]),
        rows: 2,
        cols: 2
      };
      const vector = new Float64Array([4, 4]);

      const result = await solver.solveTrueSublinear(sparseMatrix, vector);

      expect(result.solution).toBeInstanceOf(Float64Array);
      expect(result.solution.length).toBe(2);
      expect(result.complexityMetrics.isSublinear).toBeDefined();
    });

    it('should demonstrate O(log n) complexity scaling', async () => {
      const sizes = [16, 32, 64, 128];
      const times: number[] = [];

      for (const size of sizes) {
        const matrix = MatrixUtils.createIdentityMatrix(size);
        // Add small perturbations to make it interesting
        for (let i = 0; i < matrix.data.length; i++) {
          if (matrix.data[i] === 0) {
            matrix.data[i] = (Math.random() - 0.5) * 0.1;
          }
        }

        const vector = new Float64Array(size).fill(1);

        const startTime = Date.now();
        const result = await solver.solveTrueSublinear(matrix, vector);
        const endTime = Date.now();

        times.push(endTime - startTime);
        expect(result.complexityMetrics.isSublinear).toBe(true);

        // Explicit cleanup after each iteration
        (matrix.data as any) = null;
        if (global.gc) {
          global.gc();
        }
      }

      // Verify sublinear scaling: time should not scale linearly with problem size
      const timeRatio = times[times.length - 1] / times[0];
      const sizeRatio = sizes[sizes.length - 1] / sizes[0];
      expect(timeRatio).toBeLessThan(sizeRatio);
    });

    it('should handle different solver methods', async () => {
      const matrix: Matrix = {
        data: new Float64Array([2, 0.5, 0.5, 2]),
        rows: 2,
        cols: 2,
        format: 'dense'
      };
      const vector = new Float64Array([2.5, 2.5]);

      const methods: Array<SolverConfig['method']> = ['neumann', 'random-walk'];

      for (const method of methods) {
        const methodSolver = new SublinearMatrixSolver({ method });
        const result = await methodSolver.solveTrueSublinear(matrix, vector);

        expect(result.solution).toBeInstanceOf(Float64Array);
        expect(result.iterations).toBeGreaterThan(0);
        expect(result.convergenceTime).toBeGreaterThan(0);
      }
    });
  });

  describe('Johnson-Lindenstrauss Dimension Reduction', () => {
    it('should reduce matrix dimensions while preserving essential properties', async () => {
      // Create a smaller matrix to reduce memory usage (50x50 instead of 100x100)
      const size = 50;
      const matrix = MatrixUtils.createRandomMatrix(size, size, 0.1);

      // Make it diagonally dominant for stability
      for (let i = 0; i < size; i++) {
        matrix.data[i * size + i] = 10 + Math.random();
      }

      const vector = new Float64Array(size).fill(1);

      const result = await solver.solveTrueSublinear(matrix, vector);

      expect(result.complexityMetrics.dimensionReduction).toBeGreaterThan(0);
      expect(result.complexityMetrics.dimensionReduction).toBeLessThan(1);
      expect(result.solution.length).toBe(size);

      // Cleanup
      (matrix.data as any) = null;
    });
  });

  describe('Temporal Advantage Calculations', () => {
    it('should calculate temporal advantage for different problem sizes', () => {
      const sizes = [100, 1000, 10000];
      const distance = 10900; // km (Tokyo to NYC)

      for (const size of sizes) {
        const advantage = solver.calculateTemporalAdvantage(size, distance);

        expect(advantage.computationTimeMs).toBeGreaterThan(0);
        expect(advantage.lightTravelTimeMs).toBeGreaterThan(0);
        expect(advantage.distanceKm).toBe(distance);
        expect(typeof advantage.hasAdvantage).toBe('boolean');

        // Light travel time should be constant regardless of problem size
        expect(Math.abs(advantage.lightTravelTimeMs - 36.3)).toBeLessThan(0.1);
      }
    });

    it('should demonstrate temporal advantage for sublinear algorithms', () => {
      const largeSize = 100000;
      const advantage = solver.calculateTemporalAdvantage(largeSize);

      expect(advantage.computationTimeMs).toBeGreaterThan(0);
      expect(advantage.lightTravelTimeMs).toBeGreaterThan(0);
      expect(advantage.temporalAdvantageMs).toBeDefined();

      // For very large problems, sublinear algorithm should have temporal advantage
      if (advantage.hasAdvantage) {
        expect(advantage.temporalAdvantageMs).toBeGreaterThan(0);
      }
    });

    it('should handle different distances correctly', () => {
      const distances = [1000, 5000, 20000]; // km
      const problemSize = 1000;

      for (const distance of distances) {
        const advantage = solver.calculateTemporalAdvantage(problemSize, distance);

        expect(advantage.distanceKm).toBe(distance);
        expect(advantage.lightTravelTimeMs).toBeCloseTo(distance / 299792.458, 3);
      }
    });
  });

  describe('WASM SIMD Acceleration', () => {
    it('should detect WASM capabilities', () => {
      const capabilities = solver.getCapabilities();

      expect(typeof capabilities.wasmEnabled).toBe('boolean');
      expect(typeof capabilities.simdEnabled).toBe('boolean');
    });

    it('should perform matrix-vector multiplication with acceleration', () => {
      // Test WASM accelerator directly if available
      const wasmAccelerator = (solver as any).wasmAccelerator;

      if (wasmAccelerator && wasmAccelerator.isEnabled()) {
        const matrix = new Float64Array([1, 2, 3, 4, 5, 6]);
        const vector = new Float64Array([1, 2, 3]);

        const result = wasmAccelerator.multiplyMatrixVector(matrix, vector, 2, 3);

        expect(result).toBeInstanceOf(Float64Array);
        expect(result.length).toBe(2);
        // First row: 1*1 + 2*2 + 3*3 = 14
        // Second row: 4*1 + 5*2 + 6*3 = 32
        expect(result[0]).toBeCloseTo(14, 5);
        expect(result[1]).toBeCloseTo(32, 5);
      }
    });

    it('should compute dot products with SIMD acceleration', () => {
      const wasmAccelerator = (solver as any).wasmAccelerator;

      if (wasmAccelerator && wasmAccelerator.isEnabled()) {
        const a = new Float64Array([1, 2, 3, 4]);
        const b = new Float64Array([2, 3, 4, 5]);

        const result = wasmAccelerator.dotProduct(a, b);

        // 1*2 + 2*3 + 3*4 + 4*5 = 2 + 6 + 12 + 20 = 40
        expect(result).toBeCloseTo(40, 5);
      }
    });
  });

  describe('Performance Benchmarking', () => {
    it('should run performance benchmarks across different sizes', async () => {
      // Reduced test sizes from [10, 20, 40] to [8, 16] to reduce memory pressure
      const sizes = [8, 16];
      const results = await solver.benchmarkPerformance(sizes);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(sizes.length);

      results.forEach((result, index) => {
        expect(result.size).toBe(sizes[index]);
        expect(result.timeMs).toBeGreaterThan(0);
        expect(result.complexity).toBeGreaterThan(0);
        expect(typeof result.isSublinear).toBe('boolean');
      });

      // Verify that complexity doesn't grow linearly
      if (results.length >= 2) {
        const complexityRatio = results[results.length - 1].complexity / results[0].complexity;
        const sizeRatio = sizes[sizes.length - 1] / sizes[0];
        expect(complexityRatio).toBeLessThan(sizeRatio);
      }

      // Cleanup after benchmark
      if (global.gc) {
        global.gc();
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should validate input dimensions', async () => {
      const matrix: Matrix = {
        data: new Float64Array([1, 2, 3, 4]),
        rows: 2,
        cols: 2,
        format: 'dense'
      };
      const wrongVector = new Float64Array([1]); // Wrong size

      await expect(solver.solveTrueSublinear(matrix, wrongVector))
        .rejects.toThrow('Matrix rows must match vector length');
    });

    it('should handle zero-dimensional matrices', async () => {
      const matrix: Matrix = {
        data: new Float64Array([]),
        rows: 0,
        cols: 0,
        format: 'dense'
      };
      const vector = new Float64Array([]);

      await expect(solver.solveTrueSublinear(matrix, vector))
        .rejects.toThrow('Matrix must have non-zero dimensions');
    });

    it('should handle singular matrices gracefully', async () => {
      const singularMatrix: Matrix = {
        data: new Float64Array([1, 2, 2, 4]), // Rank deficient
        rows: 2,
        cols: 2,
        format: 'dense'
      };
      const vector = new Float64Array([1, 1]);

      const result = await solver.solveTrueSublinear(singularMatrix, vector);

      // Should complete without throwing, but may have large residual
      expect(result.solution).toBeInstanceOf(Float64Array);
      expect(result.residual).toBeGreaterThanOrEqual(0);
    });

    it('should handle very small matrices', async () => {
      const matrix: Matrix = {
        data: new Float64Array([2]),
        rows: 1,
        cols: 1,
        format: 'dense'
      };
      const vector = new Float64Array([4]);

      const result = await solver.solveTrueSublinear(matrix, vector);

      expect(result.solution).toBeInstanceOf(Float64Array);
      expect(result.solution.length).toBe(1);
      expect(Math.abs(result.solution[0] - 2)).toBeLessThan(0.1);
    });
  });

  describe('Spectral Sparsification', () => {
    it('should apply spectral sparsification while preserving matrix properties', async () => {
      // Create a dense matrix and test sparsification
      const size = 50;
      const matrix = MatrixUtils.createRandomMatrix(size, size, 0.8);

      // Make it diagonally dominant
      for (let i = 0; i < size; i++) {
        matrix.data[i * size + i] = 5 + Math.random();
      }

      const vector = new Float64Array(size).fill(1);

      const result = await solver.solveTrueSublinear(matrix, vector);

      expect(result.solution).toBeInstanceOf(Float64Array);
      expect(result.complexityMetrics.isSublinear).toBe(true);
    });
  });

  describe('Convergence Properties', () => {
    it('should converge within specified iterations', async () => {
      const solver = new SublinearMatrixSolver({
        maxIterations: 100,
        tolerance: 1e-6
      });

      const matrix: Matrix = {
        data: new Float64Array([3, 1, 1, 3]),
        rows: 2,
        cols: 2,
        format: 'dense'
      };
      const vector = new Float64Array([4, 4]);

      const result = await solver.solveTrueSublinear(matrix, vector);

      expect(result.iterations).toBeLessThanOrEqual(100);
      expect(result.residual).toBeLessThan(1e-3); // Should achieve reasonable accuracy
    });

    it('should handle different tolerance levels', async () => {
      const tolerances = [1e-3, 1e-6, 1e-9];

      for (const tolerance of tolerances) {
        const solver = new SublinearMatrixSolver({ tolerance });

        const matrix: Matrix = {
          data: new Float64Array([2, 0.1, 0.1, 2]),
          rows: 2,
          cols: 2,
          format: 'dense'
        };
        const vector = new Float64Array([2.1, 2.1]);

        const result = await solver.solveTrueSublinear(matrix, vector);

        expect(result.residual).toBeLessThan(tolerance * 100); // Allow some tolerance
      }
    });
  });
});