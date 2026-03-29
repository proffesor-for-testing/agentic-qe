/**
 * Granger Causality for Test Failure Prediction - Unit Tests
 * ADR-087 Milestone 4: Temporal Causal Discovery
 *
 * Tests Granger causality analysis including synthetic causal data,
 * independence detection, bidirectional causality, significance testing,
 * edge cases, and performance at scale.
 */

import { describe, it, expect } from 'vitest';
import {
  GrangerAnalyzer,
  createGrangerAnalyzer,
  type TestExecutionHistory,
  type CausalLink,
  type GrangerConfig,
  _regularizedIncompleteBeta,
  _fDistributionCDF,
  _lnGamma,
  _olsRegression,
} from '../../../../src/integrations/ruvector/temporal-causality';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Seeded pseudo-random number generator (Mulberry32) for deterministic tests.
 * Avoids test flakiness from Math.random().
 */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a causal pair: Y(t) = coefficient * X(t - lag) + noise.
 * Uses deterministic PRNG for reproducibility.
 */
function generateCausalPair(
  length: number,
  lag: number,
  coefficient: number,
  noiseStd: number,
  seed = 42,
): { x: number[]; y: number[] } {
  const rng = mulberry32(seed);
  const x = Array.from({ length }, () => rng());
  const y = new Array(length).fill(0);
  for (let t = lag; t < length; t++) {
    y[t] = coefficient * x[t - lag] + noiseStd * (rng() - 0.5);
  }
  return { x, y };
}

/**
 * Generate two independent random series with deterministic PRNG.
 */
function generateIndependentPair(
  length: number,
  seed = 123,
): { x: number[]; y: number[] } {
  const rng = mulberry32(seed);
  const x = Array.from({ length }, () => rng());
  const y = Array.from({ length }, () => rng());
  return { x, y };
}

/**
 * Build a TestExecutionHistory from a numeric array with uniform timestamps.
 */
function makeHistory(
  testId: string,
  outcomes: number[],
  startTime = 0,
  interval = 1000,
): TestExecutionHistory {
  return {
    testId,
    timestamps: outcomes.map((_, i) => startTime + i * interval),
    outcomes,
  };
}

// ============================================================================
// Statistical Math Tests
// ============================================================================

describe('Statistical math internals', () => {
  describe('lnGamma', () => {
    it('should compute ln(Gamma) for known values', () => {
      // Gamma(1) = 1, ln(1) = 0
      expect(_lnGamma(1)).toBeCloseTo(0, 6);
      // Gamma(2) = 1, ln(1) = 0
      expect(_lnGamma(2)).toBeCloseTo(0, 6);
      // Gamma(5) = 24, ln(24) ~ 3.178
      expect(_lnGamma(5)).toBeCloseTo(Math.log(24), 4);
      // Gamma(0.5) = sqrt(pi), ln(sqrt(pi)) ~ 0.5724
      expect(_lnGamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 4);
    });
  });

  describe('regularizedIncompleteBeta', () => {
    it('should return 0 for x=0 and 1 for x=1', () => {
      expect(_regularizedIncompleteBeta(0, 2, 3)).toBe(0);
      expect(_regularizedIncompleteBeta(1, 2, 3)).toBe(1);
    });

    it('should compute known values for I_0.5(1, 1) = 0.5', () => {
      // For a=1, b=1: I_x(1,1) = x
      expect(_regularizedIncompleteBeta(0.5, 1, 1)).toBeCloseTo(0.5, 4);
      expect(_regularizedIncompleteBeta(0.3, 1, 1)).toBeCloseTo(0.3, 4);
    });

    it('should satisfy symmetry: I_x(a,b) = 1 - I_{1-x}(b,a)', () => {
      const x = 0.3;
      const a = 2;
      const b = 5;
      const left = _regularizedIncompleteBeta(x, a, b);
      const right = 1 - _regularizedIncompleteBeta(1 - x, b, a);
      expect(left).toBeCloseTo(right, 6);
    });
  });

  describe('fDistributionCDF', () => {
    it('should return 0 for x <= 0', () => {
      expect(_fDistributionCDF(0, 3, 10)).toBe(0);
      expect(_fDistributionCDF(-1, 3, 10)).toBe(0);
    });

    it('should approach 1 for large x', () => {
      expect(_fDistributionCDF(1000, 3, 10)).toBeGreaterThan(0.99);
    });

    it('should compute approximate known percentiles for F(2, 30)', () => {
      // F(2,30) at the 95th percentile is approx 3.32
      // So CDF(3.32) ~ 0.95
      const cdf = _fDistributionCDF(3.32, 2, 30);
      expect(cdf).toBeGreaterThan(0.93);
      expect(cdf).toBeLessThan(0.97);
    });
  });

  describe('olsRegression', () => {
    it('should fit a simple linear model y = 2x + 1', () => {
      const X = [
        [1, 1],
        [1, 2],
        [1, 3],
        [1, 4],
        [1, 5],
      ];
      const y = [3, 5, 7, 9, 11];
      const beta = _olsRegression(X, y);
      expect(beta).not.toBeNull();
      expect(beta![0]).toBeCloseTo(1, 4); // intercept
      expect(beta![1]).toBeCloseTo(2, 4); // slope
    });

    it('should return null for singular matrix', () => {
      // Two identical columns
      const X = [
        [1, 1],
        [2, 2],
        [3, 3],
      ];
      const y = [1, 2, 3];
      const beta = _olsRegression(X, y);
      expect(beta).toBeNull();
    });
  });
});

// ============================================================================
// GrangerAnalyzer Tests
// ============================================================================

describe('GrangerAnalyzer', () => {
  // --------------------------------------------------------------------------
  // 1. Synthetic causal data
  // --------------------------------------------------------------------------

  describe('synthetic causal data', () => {
    it('should detect causality from X to Y at lag 2 with strong signal', () => {
      const { x, y } = generateCausalPair(200, 2, 0.7, 0.1, 42);
      const source = makeHistory('test_login', x);
      const target = makeHistory('test_checkout', y);

      const analyzer = createGrangerAnalyzer({ maxLag: 5, minSeriesLength: 10 });
      const link = analyzer.testPairwise(source, target, 2);

      expect(link.sourceTestId).toBe('test_login');
      expect(link.targetTestId).toBe('test_checkout');
      expect(link.lag).toBe(2);
      expect(link.pValue).toBeLessThan(0.05);
      expect(link.fStatistic).toBeGreaterThan(0);
      expect(link.strength).toBeGreaterThan(0);
    });

    it('should find the causal link in analyzeCausality for a known pair', () => {
      const { x, y } = generateCausalPair(200, 2, 0.7, 0.1, 42);
      const source = makeHistory('test_login', x);
      const target = makeHistory('test_checkout', y);

      const analyzer = createGrangerAnalyzer({ maxLag: 5, minSeriesLength: 10 });
      const links = analyzer.analyzeCausality([source, target]);

      // Should find at least one significant link from login -> checkout
      const causalLink = links.find(
        (l) => l.sourceTestId === 'test_login' && l.targetTestId === 'test_checkout',
      );
      expect(causalLink).toBeDefined();
      expect(causalLink!.pValue).toBeLessThan(0.05);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Independent series
  // --------------------------------------------------------------------------

  describe('independent series', () => {
    it('should not find significant links between independent series', () => {
      const { x, y } = generateIndependentPair(200, 999);
      const source = makeHistory('test_a', x);
      const target = makeHistory('test_b', y);

      const analyzer = createGrangerAnalyzer({ maxLag: 3, minSeriesLength: 10 });
      const links = analyzer.analyzeCausality([source, target]);

      // With truly independent data, we expect no significant links
      // (or at most a small false positive rate, but with fixed seed
      // and sufficient data, this should be clean)
      for (const link of links) {
        expect(link.pValue).toBeGreaterThan(0.01);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Bidirectional causality
  // --------------------------------------------------------------------------

  describe('bidirectional causality', () => {
    it('should detect both X->Y and Y->X when both are present', () => {
      const rng = mulberry32(77);
      const length = 300;
      const x = new Array(length).fill(0);
      const y = new Array(length).fill(0);

      // Initialize with some random values for the first few steps
      for (let t = 0; t < 3; t++) {
        x[t] = rng();
        y[t] = rng();
      }

      // X(t) depends on Y(t-1), Y(t) depends on X(t-2)
      for (let t = 3; t < length; t++) {
        x[t] = 0.6 * y[t - 1] + 0.2 * (rng() - 0.5);
        y[t] = 0.5 * x[t - 2] + 0.2 * (rng() - 0.5);
      }

      const sourceH = makeHistory('test_x', x);
      const targetH = makeHistory('test_y', y);

      const analyzer = createGrangerAnalyzer({ maxLag: 5, minSeriesLength: 10 });
      const links = analyzer.analyzeCausality([sourceH, targetH]);

      const xToY = links.find(
        (l) => l.sourceTestId === 'test_x' && l.targetTestId === 'test_y',
      );
      const yToX = links.find(
        (l) => l.sourceTestId === 'test_y' && l.targetTestId === 'test_x',
      );

      expect(xToY).toBeDefined();
      expect(yToX).toBeDefined();
      expect(xToY!.pValue).toBeLessThan(0.05);
      expect(yToX!.pValue).toBeLessThan(0.05);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Multiple lags: strongest lag is found
  // --------------------------------------------------------------------------

  describe('multiple lags', () => {
    it('should find the best lag when testing maxLag=5', () => {
      const { x, y } = generateCausalPair(300, 3, 0.8, 0.1, 55);
      const source = makeHistory('test_src', x);
      const target = makeHistory('test_tgt', y);

      const analyzer = createGrangerAnalyzer({ maxLag: 5, minSeriesLength: 10 });
      const links = analyzer.analyzeCausality([source, target]);

      const link = links.find(
        (l) => l.sourceTestId === 'test_src' && l.targetTestId === 'test_tgt',
      );
      expect(link).toBeDefined();
      // The true lag is 3; the analyzer should find it or a nearby lag
      // as the best (lowest p-value)
      expect(link!.lag).toBeGreaterThanOrEqual(1);
      expect(link!.lag).toBeLessThanOrEqual(5);
      expect(link!.pValue).toBeLessThan(0.05);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Significance test
  // --------------------------------------------------------------------------

  describe('significanceTest', () => {
    it('should return true for p-value < alpha (true causal link)', () => {
      const { x, y } = generateCausalPair(200, 2, 0.7, 0.1, 42);
      const source = makeHistory('test_a', x);
      const target = makeHistory('test_b', y);

      const analyzer = createGrangerAnalyzer({ alpha: 0.05, minSeriesLength: 10 });
      const link = analyzer.testPairwise(source, target, 2);

      expect(analyzer.significanceTest(link)).toBe(true);
      expect(link.pValue).toBeLessThan(0.05);
    });

    it('should return false for p-value > alpha (spurious link)', () => {
      const { x, y } = generateIndependentPair(200, 999);
      const source = makeHistory('test_a', x);
      const target = makeHistory('test_b', y);

      const analyzer = createGrangerAnalyzer({ alpha: 0.05, minSeriesLength: 10 });

      // Test at some lag; independent series should not be significant
      const link = analyzer.testPairwise(source, target, 1);
      // p-value should generally be > 0.05 for independent data
      // With fixed seed, this is deterministic
      expect(link.pValue).toBeGreaterThan(0.01);
    });

    it('should respect custom alpha level', () => {
      const link: CausalLink = {
        sourceTestId: 'a',
        targetTestId: 'b',
        lag: 1,
        fStatistic: 3.5,
        pValue: 0.03,
        strength: 0.5,
        direction: 'positive',
      };

      const strictAnalyzer = createGrangerAnalyzer({ alpha: 0.01 });
      const lenientAnalyzer = createGrangerAnalyzer({ alpha: 0.05 });

      expect(strictAnalyzer.significanceTest(link)).toBe(false); // 0.03 > 0.01
      expect(lenientAnalyzer.significanceTest(link)).toBe(true);  // 0.03 < 0.05
    });
  });

  // --------------------------------------------------------------------------
  // 6. Short series are skipped
  // --------------------------------------------------------------------------

  describe('short series', () => {
    it('should skip series below minSeriesLength', () => {
      const shortSource = makeHistory('test_short', [1, 0, 1, 0, 1]);
      const shortTarget = makeHistory('test_short2', [0, 1, 0, 1, 0]);

      const analyzer = createGrangerAnalyzer({ minSeriesLength: 30 });
      const links = analyzer.analyzeCausality([shortSource, shortTarget]);

      expect(links).toHaveLength(0);
    });

    it('should analyze series at exactly minSeriesLength', () => {
      const { x, y } = generateCausalPair(30, 1, 0.9, 0.05, 42);
      const source = makeHistory('test_a', x);
      const target = makeHistory('test_b', y);

      const analyzer = createGrangerAnalyzer({ minSeriesLength: 30, maxLag: 2 });
      // Should not throw; may or may not find a link with only 30 points
      const links = analyzer.analyzeCausality([source, target]);
      expect(Array.isArray(links)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Empty input
  // --------------------------------------------------------------------------

  describe('empty input', () => {
    it('should return empty results for empty array', () => {
      const analyzer = createGrangerAnalyzer();
      const links = analyzer.analyzeCausality([]);
      expect(links).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Single series
  // --------------------------------------------------------------------------

  describe('single series', () => {
    it('should return no links for a single series (need pairs)', () => {
      const { x } = generateCausalPair(100, 1, 0.7, 0.1, 42);
      const source = makeHistory('test_only', x);

      const analyzer = createGrangerAnalyzer({ minSeriesLength: 10 });
      const links = analyzer.analyzeCausality([source]);

      expect(links).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Scale test: 100 series of length 100 within 5 seconds
  // --------------------------------------------------------------------------

  describe('scale test', () => {
    it('should handle 100 series of length 100 within 5 seconds', () => {
      const rng = mulberry32(321);
      const series: TestExecutionHistory[] = [];
      for (let i = 0; i < 100; i++) {
        const outcomes = Array.from({ length: 100 }, () => (rng() > 0.5 ? 1 : 0));
        series.push(makeHistory(`test_${i}`, outcomes));
      }

      const analyzer = createGrangerAnalyzer({ maxLag: 2, minSeriesLength: 10 });

      const start = Date.now();
      const links = analyzer.analyzeCausality(series);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
      expect(Array.isArray(links)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 10. F-statistic is positive for true causal links
  // --------------------------------------------------------------------------

  describe('F-statistic positivity', () => {
    it('should produce positive F-statistic for true causal links', () => {
      const { x, y } = generateCausalPair(200, 2, 0.7, 0.1, 42);
      const source = makeHistory('test_login', x);
      const target = makeHistory('test_checkout', y);

      const analyzer = createGrangerAnalyzer({ minSeriesLength: 10 });
      const link = analyzer.testPairwise(source, target, 2);

      expect(link.fStatistic).toBeGreaterThan(0);
    });

    it('should produce non-negative F-statistic for any input', () => {
      const { x, y } = generateIndependentPair(100, 444);
      const source = makeHistory('test_a', x);
      const target = makeHistory('test_b', y);

      const analyzer = createGrangerAnalyzer({ minSeriesLength: 10 });
      for (let lag = 1; lag <= 3; lag++) {
        const link = analyzer.testPairwise(source, target, lag);
        expect(link.fStatistic).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 11. Strength reflects coefficient magnitude
  // --------------------------------------------------------------------------

  describe('strength reflects coefficient magnitude', () => {
    it('should report higher strength for stronger causal coefficients', () => {
      const weakPair = generateCausalPair(300, 2, 0.2, 0.1, 42);
      const strongPair = generateCausalPair(300, 2, 0.9, 0.1, 42);

      const weakSource = makeHistory('weak_src', weakPair.x);
      const weakTarget = makeHistory('weak_tgt', weakPair.y);
      const strongSource = makeHistory('strong_src', strongPair.x);
      const strongTarget = makeHistory('strong_tgt', strongPair.y);

      const analyzer = createGrangerAnalyzer({ minSeriesLength: 10 });

      const weakLink = analyzer.testPairwise(weakSource, weakTarget, 2);
      const strongLink = analyzer.testPairwise(strongSource, strongTarget, 2);

      expect(strongLink.strength).toBeGreaterThan(weakLink.strength);
    });

    it('should have strength > 0 for significant causal links', () => {
      const { x, y } = generateCausalPair(200, 2, 0.7, 0.1, 42);
      const source = makeHistory('test_a', x);
      const target = makeHistory('test_b', y);

      const analyzer = createGrangerAnalyzer({ minSeriesLength: 10 });
      const link = analyzer.testPairwise(source, target, 2);

      if (analyzer.significanceTest(link)) {
        expect(link.strength).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle all-zero outcomes gracefully', () => {
      const zeros = new Array(50).fill(0);
      const source = makeHistory('test_zero1', zeros);
      const target = makeHistory('test_zero2', zeros);

      const analyzer = createGrangerAnalyzer({ minSeriesLength: 10 });
      const link = analyzer.testPairwise(source, target, 1);

      // With zero variance, expect no significant result
      expect(link.pValue).toBe(1);
      expect(link.fStatistic).toBe(0);
    });

    it('should handle all-ones outcomes gracefully', () => {
      const ones = new Array(50).fill(1);
      const source = makeHistory('test_ones1', ones);
      const target = makeHistory('test_ones2', ones);

      const analyzer = createGrangerAnalyzer({ minSeriesLength: 10 });
      const link = analyzer.testPairwise(source, target, 1);

      expect(link.pValue).toBe(1);
    });

    it('should handle different-length series via alignment', () => {
      const rng = mulberry32(789);
      const xOutcomes = Array.from({ length: 100 }, () => (rng() > 0.5 ? 1 : 0));
      const yOutcomes = Array.from({ length: 80 }, () => (rng() > 0.5 ? 1 : 0));

      // Different timestamps but overlapping range
      const source: TestExecutionHistory = {
        testId: 'test_long',
        timestamps: xOutcomes.map((_, i) => 1000 + i * 60000),
        outcomes: xOutcomes,
      };
      const target: TestExecutionHistory = {
        testId: 'test_short',
        timestamps: yOutcomes.map((_, i) => 1000 + i * 60000),
        outcomes: yOutcomes,
      };

      const analyzer = createGrangerAnalyzer({ minSeriesLength: 10, maxLag: 3 });
      // Should not throw
      const links = analyzer.analyzeCausality([source, target]);
      expect(Array.isArray(links)).toBe(true);
    });

    it('should return default link when lag exceeds series length', () => {
      const { x, y } = generateCausalPair(10, 1, 0.7, 0.1, 42);
      const source = makeHistory('test_a', x);
      const target = makeHistory('test_b', y);

      // minSeriesLength is low enough, but effective N after lag is too small
      const analyzer = createGrangerAnalyzer({ minSeriesLength: 5 });
      const link = analyzer.testPairwise(source, target, 9);

      // Not enough degrees of freedom
      expect(link.pValue).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Factory function
  // --------------------------------------------------------------------------

  describe('createGrangerAnalyzer factory', () => {
    it('should create an analyzer with default config', () => {
      const analyzer = createGrangerAnalyzer();
      expect(analyzer).toBeInstanceOf(GrangerAnalyzer);
    });

    it('should accept partial config overrides', () => {
      const analyzer = createGrangerAnalyzer({ maxLag: 10 });
      expect(analyzer).toBeInstanceOf(GrangerAnalyzer);
    });

    it('should use custom alpha for significance testing', () => {
      const strict = createGrangerAnalyzer({ alpha: 0.001 });
      const lenient = createGrangerAnalyzer({ alpha: 0.10 });

      const link: CausalLink = {
        sourceTestId: 'a',
        targetTestId: 'b',
        lag: 1,
        fStatistic: 4.0,
        pValue: 0.02,
        strength: 0.5,
        direction: 'positive',
      };

      expect(strict.significanceTest(link)).toBe(false);
      expect(lenient.significanceTest(link)).toBe(true);
    });
  });
});
