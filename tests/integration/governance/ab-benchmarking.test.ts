/**
 * Integration tests for A/B Benchmarking Framework
 *
 * Tests verify:
 * - Benchmark creation and management
 * - Metric recording and tracking
 * - Statistical significance calculation (chi-square, t-test)
 * - Effect size calculation (Cohen's d)
 * - Winner selection with configurable confidence
 * - Variant comparison
 * - Integration with Evolution Pipeline
 * - Feature flag integration
 *
 * @see ADR-058-guidance-governance-integration.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  governanceFlags,
  DEFAULT_GOVERNANCE_FLAGS,
} from '../../../src/governance/feature-flags.js';
import {
  ABBenchmarkingFramework,
  abBenchmarkingFramework,
  createBenchmarkConfig,
  runQuickBenchmark,
  isABBenchmarkingEnabled,
  type BenchmarkConfig,
  type VariantConfig,
  type MetricConfig,
} from '../../../src/governance/ab-benchmarking.js';
import {
  evolutionPipelineIntegration,
} from '../../../src/governance/evolution-pipeline-integration.js';

describe('A/B Benchmarking Framework - ADR-058 Phase 3', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    governanceFlags.reset();
    abBenchmarkingFramework.reset();
    evolutionPipelineIntegration.reset();
  });

  describe('Benchmark Creation', () => {
    it('should create a benchmark with valid config', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config: BenchmarkConfig = {
        testId: 'test-benchmark-1',
        variants: [
          { id: 'control', name: 'Control', rules: { maxRetries: 3 } },
          { id: 'treatment', name: 'Treatment', rules: { maxRetries: 5 } },
        ],
        metrics: [
          { name: 'success_rate', type: 'success_rate', weight: 0.5, higherIsBetter: true },
          { name: 'latency', type: 'latency', weight: 0.3, higherIsBetter: false },
          { name: 'quality', type: 'quality_score', weight: 0.2, higherIsBetter: true },
        ],
        minSampleSize: 50,
        confidenceLevel: 0.95,
        maxDurationMs: 3600000,
      };

      const benchmarkId = framework.createBenchmark(config);

      expect(benchmarkId).toBe('test-benchmark-1');

      const active = framework.getActiveBenchmarks();
      expect(active).toHaveLength(1);
      expect(active[0].benchmarkId).toBe('test-benchmark-1');
      expect(active[0].status).toBe('pending');
    });

    it('should reject benchmarks with less than 2 variants', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      expect(() => {
        framework.createBenchmark({
          testId: 'invalid-1',
          variants: [{ id: 'only-one', name: 'Only One', rules: {} }],
          metrics: [{ name: 'success_rate', type: 'success_rate', weight: 1, higherIsBetter: true }],
          minSampleSize: 50,
          confidenceLevel: 0.95,
          maxDurationMs: 3600000,
        });
      }).toThrow('at least 2 variants');
    });

    it('should reject benchmarks with no metrics', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      expect(() => {
        framework.createBenchmark({
          testId: 'invalid-2',
          variants: [
            { id: 'a', name: 'A', rules: {} },
            { id: 'b', name: 'B', rules: {} },
          ],
          metrics: [],
          minSampleSize: 50,
          confidenceLevel: 0.95,
          maxDurationMs: 3600000,
        });
      }).toThrow('at least 1 metric');
    });

    it('should reject benchmarks with invalid metric weights', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      expect(() => {
        framework.createBenchmark({
          testId: 'invalid-3',
          variants: [
            { id: 'a', name: 'A', rules: {} },
            { id: 'b', name: 'B', rules: {} },
          ],
          metrics: [
            { name: 'metric1', type: 'success_rate', weight: 0.3, higherIsBetter: true },
            { name: 'metric2', type: 'latency', weight: 0.3, higherIsBetter: false },
          ],
          minSampleSize: 50,
          confidenceLevel: 0.95,
          maxDurationMs: 3600000,
        });
      }).toThrow('weights must sum to 1.0');
    });

    it('should respect max concurrent benchmarks limit', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      // Set low limit for testing
      governanceFlags.updateFlags({
        abBenchmarking: {
          ...DEFAULT_GOVERNANCE_FLAGS.abBenchmarking,
          enabled: true,
          maxConcurrentBenchmarks: 2,
        },
      });

      // Create 2 benchmarks (at limit)
      framework.createBenchmark(createBenchmarkConfig('test-1', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ]));
      framework.createBenchmark(createBenchmarkConfig('test-2', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ]));

      // Third should fail
      expect(() => {
        framework.createBenchmark(createBenchmarkConfig('test-3', [
          { id: 'a', name: 'A', rules: {} },
          { id: 'b', name: 'B', rules: {} },
        ]));
      }).toThrow('Maximum concurrent benchmarks');
    });

    it('should use helper function to create config with defaults', () => {
      const config = createBenchmarkConfig('my-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ]);

      expect(config.testId).toBe('my-test');
      expect(config.variants).toHaveLength(2);
      expect(config.metrics).toHaveLength(3); // Default metrics
      expect(config.minSampleSize).toBe(100); // Default from flags
      expect(config.confidenceLevel).toBe(0.95); // Default from flags
    });
  });

  describe('Benchmark Lifecycle', () => {
    it('should start and stop benchmarks', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('lifecycle-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ]);

      const benchmarkId = framework.createBenchmark(config);

      // Should be pending
      let active = framework.getActiveBenchmarks();
      expect(active[0].status).toBe('pending');

      // Start
      framework.startBenchmark(benchmarkId);
      active = framework.getActiveBenchmarks();
      expect(active[0].status).toBe('running');
      expect(active[0].startTime).toBeDefined();

      // Stop
      framework.stopBenchmark(benchmarkId);
      active = framework.getActiveBenchmarks();
      expect(active).toHaveLength(0); // Stopped benchmarks not in active list

      const history = framework.getBenchmarkHistory();
      expect(history[0].status).toBe('stopped');
    });

    it('should prevent starting completed benchmarks', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('complete-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], { minSampleSize: 5 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Record enough samples to get a winner
      for (let i = 0; i < 10; i++) {
        framework.recordOutcome(benchmarkId, 'a', true);
        framework.recordOutcome(benchmarkId, 'b', i < 3);
      }

      // Apply winner to complete
      framework.applyWinner(benchmarkId);

      // Should throw on restart attempt
      expect(() => {
        framework.startBenchmark(benchmarkId);
      }).toThrow('already completed');
    });
  });

  describe('Metric Recording', () => {
    it('should record individual metrics', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('metric-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ]);

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Record latency metrics
      framework.recordMetric(benchmarkId, 'a', 'latency', 150);
      framework.recordMetric(benchmarkId, 'a', 'latency', 160);
      framework.recordMetric(benchmarkId, 'b', 'latency', 120);
      framework.recordMetric(benchmarkId, 'b', 'latency', 110);

      const results = framework.getBenchmarkResults(benchmarkId);
      const variantA = results.variants.find(v => v.id === 'a');
      const variantB = results.variants.find(v => v.id === 'b');

      expect(variantA?.metrics.latency.mean).toBe(155);
      expect(variantB?.metrics.latency.mean).toBe(115);
    });

    it('should record outcomes with multiple metrics', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('outcome-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ]);

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Record outcomes with metrics
      for (let i = 0; i < 10; i++) {
        framework.recordOutcome(benchmarkId, 'a', i < 8, {
          latency: 100 + Math.random() * 50,
          quality: 0.8 + Math.random() * 0.1,
        });
        framework.recordOutcome(benchmarkId, 'b', i < 6, {
          latency: 80 + Math.random() * 30,
          quality: 0.85 + Math.random() * 0.1,
        });
      }

      const results = framework.getBenchmarkResults(benchmarkId);
      expect(results.variants[0].successRate).toBe(0.8); // 8/10
      expect(results.variants[1].successRate).toBe(0.6); // 6/10
    });

    it('should not record for non-running benchmarks', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('not-running-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ]);

      const benchmarkId = framework.createBenchmark(config);
      // Don't start the benchmark

      // Should silently fail (logged but not throw)
      framework.recordOutcome(benchmarkId, 'a', true);

      const results = framework.getBenchmarkResults(benchmarkId);
      expect(results.variants[0].sampleSize).toBe(0);
    });
  });

  describe('Statistical Analysis', () => {
    it('should calculate chi-square test for success rates', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('chi-square-test', [
        { id: 'control', name: 'Control', rules: {} },
        { id: 'treatment', name: 'Treatment', rules: {} },
      ], { minSampleSize: 20 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Control: 50% success rate
      for (let i = 0; i < 30; i++) {
        framework.recordOutcome(benchmarkId, 'control', i < 15);
      }

      // Treatment: 80% success rate
      for (let i = 0; i < 30; i++) {
        framework.recordOutcome(benchmarkId, 'treatment', i < 24);
      }

      const significance = framework.calculateStatisticalSignificance(benchmarkId);

      expect(significance.chiSquareTest).toBeDefined();
      expect(significance.chiSquareTest!.statistic).toBeGreaterThan(0);
      expect(significance.chiSquareTest!.degreesOfFreedom).toBe(1); // 2 variants - 1
    });

    it('should calculate t-test for continuous metrics', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('t-test-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], { minSampleSize: 10 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Variant A: Higher latency (mean ~200)
      for (let i = 0; i < 20; i++) {
        framework.recordOutcome(benchmarkId, 'a', true, {
          latency: 180 + Math.random() * 40,
          quality: 0.7 + Math.random() * 0.1,
        });
      }

      // Variant B: Lower latency (mean ~100)
      for (let i = 0; i < 20; i++) {
        framework.recordOutcome(benchmarkId, 'b', true, {
          latency: 80 + Math.random() * 40,
          quality: 0.8 + Math.random() * 0.1,
        });
      }

      const significance = framework.calculateStatisticalSignificance(benchmarkId);

      expect(significance.metricStatistics).toBeDefined();
      expect(significance.metricStatistics.length).toBeGreaterThan(0);

      const latencyStats = significance.metricStatistics.find(m => m.metric === 'latency');
      expect(latencyStats).toBeDefined();
      expect(latencyStats!.tStatistic).not.toBe(0);
    });

    it('should calculate effect size (Cohens d)', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('effect-size-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], { minSampleSize: 10 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Create large effect in quality metric
      for (let i = 0; i < 20; i++) {
        framework.recordOutcome(benchmarkId, 'a', true, { quality: 0.5 + Math.random() * 0.1 });
        framework.recordOutcome(benchmarkId, 'b', true, { quality: 0.9 + Math.random() * 0.05 });
      }

      const significance = framework.calculateStatisticalSignificance(benchmarkId);
      const qualityStats = significance.metricStatistics.find(m => m.metric === 'quality');

      expect(qualityStats).toBeDefined();
      expect(qualityStats!.effectSize).toBeGreaterThan(0.5); // At least medium effect
      expect(['small', 'medium', 'large']).toContain(qualityStats!.effectSizeInterpretation);
    });

    it('should apply Bonferroni correction for multiple comparisons', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('bonferroni-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], {
        minSampleSize: 10,
        confidenceLevel: 0.95,
        metrics: [
          { name: 'm1', type: 'quality_score', weight: 0.25, higherIsBetter: true },
          { name: 'm2', type: 'quality_score', weight: 0.25, higherIsBetter: true },
          { name: 'm3', type: 'quality_score', weight: 0.25, higherIsBetter: true },
          { name: 'm4', type: 'quality_score', weight: 0.25, higherIsBetter: true },
        ],
      });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      for (let i = 0; i < 20; i++) {
        framework.recordOutcome(benchmarkId, 'a', true, { m1: 0.5, m2: 0.5, m3: 0.5, m4: 0.5 });
        framework.recordOutcome(benchmarkId, 'b', true, { m1: 0.6, m2: 0.6, m3: 0.6, m4: 0.6 });
      }

      const significance = framework.calculateStatisticalSignificance(benchmarkId);

      // With 4 metrics and alpha=0.05, Bonferroni alpha should be ~0.0125
      expect(significance.bonferroniAlpha).toBeCloseTo(0.0125, 2);
    });

    it('should provide power analysis', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('power-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], { minSampleSize: 10 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Small sample size
      for (let i = 0; i < 15; i++) {
        framework.recordOutcome(benchmarkId, 'a', true, { latency: 100 });
        framework.recordOutcome(benchmarkId, 'b', true, { latency: 110 });
      }

      const significance = framework.calculateStatisticalSignificance(benchmarkId);

      expect(significance.powerAnalysis).toBeDefined();
      expect(significance.powerAnalysis.currentPower).toBeGreaterThanOrEqual(0);
      expect(significance.powerAnalysis.currentPower).toBeLessThanOrEqual(1);
      expect(significance.powerAnalysis.targetPower).toBe(0.8);
      expect(significance.powerAnalysis.recommendedSampleSize).toBeGreaterThan(0);
    });
  });

  describe('Winner Selection', () => {
    it('should determine winner based on combined scores', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('winner-test', [
        { id: 'control', name: 'Control', rules: {} },
        { id: 'treatment', name: 'Treatment', rules: {} },
      ], { minSampleSize: 20 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Control: 60% success, higher latency, lower quality
      for (let i = 0; i < 30; i++) {
        framework.recordOutcome(benchmarkId, 'control', i < 18, {
          latency: 200 + Math.random() * 50,
          quality: 0.6 + Math.random() * 0.1,
        });
      }

      // Treatment: 90% success, lower latency, higher quality
      for (let i = 0; i < 30; i++) {
        framework.recordOutcome(benchmarkId, 'treatment', i < 27, {
          latency: 100 + Math.random() * 30,
          quality: 0.85 + Math.random() * 0.1,
        });
      }

      const winner = framework.getWinner(benchmarkId);

      expect(winner).toBeDefined();
      expect(winner!.winnerId).toBe('treatment');
      expect(winner!.confidence).toBeGreaterThan(0);
      expect(winner!.recommendation).toContain('treatment');
    });

    it('should return null when not enough samples', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('insufficient-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], { minSampleSize: 100 }); // High requirement

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Only 10 samples each
      for (let i = 0; i < 10; i++) {
        framework.recordOutcome(benchmarkId, 'a', true);
        framework.recordOutcome(benchmarkId, 'b', false);
      }

      const winner = framework.getWinner(benchmarkId);
      expect(winner).toBeNull();
    });

    it('should generate appropriate recommendations based on confidence', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('recommendation-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], { minSampleSize: 20 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Clear winner with good margin
      for (let i = 0; i < 50; i++) {
        framework.recordOutcome(benchmarkId, 'a', true, { latency: 100, quality: 0.95 });
        framework.recordOutcome(benchmarkId, 'b', i < 20, { latency: 200, quality: 0.5 });
      }

      const winner = framework.getWinner(benchmarkId);

      expect(winner).toBeDefined();
      expect(winner!.recommendation).toBeDefined();
      expect(winner!.recommendation.length).toBeGreaterThan(0);
    });
  });

  describe('Variant Comparison', () => {
    it('should compare two specific variants', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('compare-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
        { id: 'c', name: 'C', rules: {} },
      ], { minSampleSize: 10 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      for (let i = 0; i < 20; i++) {
        framework.recordOutcome(benchmarkId, 'a', i < 12, { latency: 150, quality: 0.7 });
        framework.recordOutcome(benchmarkId, 'b', i < 16, { latency: 100, quality: 0.8 });
        framework.recordOutcome(benchmarkId, 'c', i < 10, { latency: 200, quality: 0.6 });
      }

      const comparison = framework.compareVariants(benchmarkId, 'a', 'b');

      expect(comparison.benchmarkId).toBe(benchmarkId);
      expect(comparison.variantA).toBe('a');
      expect(comparison.variantB).toBe('b');
      expect(comparison.winner).toBe('b'); // Better on most metrics
      expect(comparison.metricComparisons.length).toBeGreaterThan(0);
      expect(comparison.combinedScores.variantA).toBeDefined();
      expect(comparison.combinedScores.variantB).toBeDefined();
    });

    it('should throw for non-existent variants', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('missing-variant-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ]);

      const benchmarkId = framework.createBenchmark(config);

      expect(() => {
        framework.compareVariants(benchmarkId, 'a', 'nonexistent');
      }).toThrow('not found');
    });
  });

  describe('Winner Suggestion', () => {
    it('should suggest winner with reasoning', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('suggestion-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], { minSampleSize: 20 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Clear winner
      for (let i = 0; i < 30; i++) {
        framework.recordOutcome(benchmarkId, 'a', true, { latency: 100, quality: 0.9 });
        framework.recordOutcome(benchmarkId, 'b', i < 10, { latency: 200, quality: 0.5 });
      }

      const suggestion = framework.suggestWinner(benchmarkId);

      expect(suggestion.benchmarkId).toBe(benchmarkId);
      expect(suggestion.suggestedWinnerId).toBe('a');
      expect(suggestion.reasoning.length).toBeGreaterThan(0);
      expect(suggestion.confidence).toBeGreaterThan(0);
    });

    it('should include caveats when appropriate', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('caveats-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], { minSampleSize: 100 }); // High requirement

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Not enough samples
      for (let i = 0; i < 20; i++) {
        framework.recordOutcome(benchmarkId, 'a', true);
        framework.recordOutcome(benchmarkId, 'b', false);
      }

      const suggestion = framework.suggestWinner(benchmarkId);

      expect(suggestion.caveats.length).toBeGreaterThan(0);
      expect(suggestion.caveats.some(c => c.toLowerCase().includes('sample'))).toBe(true);
      expect(suggestion.readyToApply).toBe(false);
    });
  });

  describe('Apply Winner', () => {
    it('should apply winning variant', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('apply-test', [
        { id: 'winner-variant', name: 'Winner', rules: { mode: 'winner' } },
        { id: 'loser-variant', name: 'Loser', rules: { mode: 'loser' } },
      ], { minSampleSize: 20 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Clear winner
      for (let i = 0; i < 30; i++) {
        framework.recordOutcome(benchmarkId, 'winner-variant', true, { latency: 50, quality: 0.95 });
        framework.recordOutcome(benchmarkId, 'loser-variant', i < 5, { latency: 300, quality: 0.3 });
      }

      framework.applyWinner(benchmarkId);

      const history = framework.getBenchmarkHistory();
      const benchmark = history.find(b => b.benchmarkId === benchmarkId);

      expect(benchmark?.status).toBe('completed');
      expect(benchmark?.winnerId).toBe('winner-variant');

      // Check Evolution Pipeline integration
      const effectiveness = evolutionPipelineIntegration.getRuleEffectiveness('winner-variant');
      expect(effectiveness.promotionStatus).toBe('promoted');
    });

    it('should throw when no winner determined', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('no-winner-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], { minSampleSize: 100 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Not enough samples for winner
      framework.recordOutcome(benchmarkId, 'a', true);
      framework.recordOutcome(benchmarkId, 'b', true);

      expect(() => {
        framework.applyWinner(benchmarkId);
      }).toThrow('No winner determined');
    });
  });

  describe('Benchmark Results', () => {
    it('should return comprehensive results', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('results-test', [
        { id: 'a', name: 'Variant A', rules: {} },
        { id: 'b', name: 'Variant B', rules: {} },
      ], { minSampleSize: 20 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      for (let i = 0; i < 30; i++) {
        framework.recordOutcome(benchmarkId, 'a', i < 20, { latency: 100 + i, quality: 0.8 });
        framework.recordOutcome(benchmarkId, 'b', i < 25, { latency: 80 + i, quality: 0.85 });
      }

      const results = framework.getBenchmarkResults(benchmarkId);

      expect(results.benchmark).toBeDefined();
      expect(results.benchmark.benchmarkId).toBe(benchmarkId);
      expect(results.benchmark.totalSamples).toBe(60);

      expect(results.variants).toHaveLength(2);
      expect(results.variants[0].successRate).toBeCloseTo(20 / 30, 2);
      expect(results.variants[1].successRate).toBeCloseTo(25 / 30, 2);

      expect(results.significance).toBeDefined();
      expect(results.winner).toBeDefined();
    });
  });

  describe('Integration with Evolution Pipeline', () => {
    it('should register variant test with Evolution Pipeline', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('evolution-integration-test', [
        { id: 'variant-x', name: 'X', rules: {} },
        { id: 'variant-y', name: 'Y', rules: {} },
      ]);

      framework.createBenchmark(config);

      const activeTests = evolutionPipelineIntegration.getActiveTests();
      const test = activeTests.find(t => t.testId === 'evolution-integration-test');

      expect(test).toBeDefined();
      expect(test!.variants).toContain('variant-x');
      expect(test!.variants).toContain('variant-y');
    });

    it('should record outcomes in Evolution Pipeline', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('evolution-record-test', [
        { id: 'ev-a', name: 'A', rules: {} },
        { id: 'ev-b', name: 'B', rules: {} },
      ], { minSampleSize: 5 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      for (let i = 0; i < 10; i++) {
        framework.recordOutcome(benchmarkId, 'ev-a', true);
        framework.recordOutcome(benchmarkId, 'ev-b', i < 5);
      }

      // Check Evolution Pipeline has the test results
      const test = evolutionPipelineIntegration.getActiveTests()
        .find(t => t.testId === benchmarkId);

      if (test) {
        const resultA = test.results.get('ev-a');
        const resultB = test.results.get('ev-b');

        expect(resultA?.applications).toBe(10);
        expect(resultB?.applications).toBe(10);
      }
    });
  });

  describe('Feature Flag Integration', () => {
    it('should bypass operations when disabled', async () => {
      governanceFlags.updateFlags({
        abBenchmarking: {
          ...DEFAULT_GOVERNANCE_FLAGS.abBenchmarking,
          enabled: false,
        },
      });

      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const benchmarkId = framework.createBenchmark(createBenchmarkConfig('disabled-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ]));

      expect(benchmarkId).toContain('disabled');

      // Operations should be no-ops
      framework.startBenchmark(benchmarkId);
      framework.recordOutcome(benchmarkId, 'a', true);

      expect(framework.getActiveBenchmarks()).toHaveLength(0);
    });

    it('should respect global gate disable', async () => {
      governanceFlags.disableAllGates();

      expect(isABBenchmarkingEnabled()).toBe(false);
    });

    it('should use configurable defaults from flags', async () => {
      governanceFlags.updateFlags({
        abBenchmarking: {
          enabled: true,
          defaultConfidenceLevel: 0.99,
          defaultMinSampleSize: 200,
          autoApplyWinners: false,
          maxConcurrentBenchmarks: 10,
        },
      });

      const config = createBenchmarkConfig('flag-defaults-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ]);

      expect(config.minSampleSize).toBe(200);
      expect(config.confidenceLevel).toBe(0.99);
    });
  });

  describe('Quick Benchmark Helper', () => {
    it('should create and start benchmark quickly', async () => {
      const benchmarkId = await runQuickBenchmark(
        'quick-test',
        { rule1: 'value1' },
        { rule1: 'value2' },
        { minSampleSize: 50 }
      );

      expect(benchmarkId).toBe('quick-test');

      const active = abBenchmarkingFramework.getActiveBenchmarks();
      expect(active).toHaveLength(1);
      expect(active[0].status).toBe('running');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty metric data gracefully', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('empty-metrics-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], { minSampleSize: 5 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Record only success/failure, no metrics
      for (let i = 0; i < 10; i++) {
        framework.recordOutcome(benchmarkId, 'a', true);
        framework.recordOutcome(benchmarkId, 'b', i < 5);
      }

      const results = framework.getBenchmarkResults(benchmarkId);
      expect(results.variants[0].successRate).toBe(1.0);
      expect(results.variants[1].successRate).toBe(0.5);
    });

    it('should handle identical performance gracefully', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      const config = createBenchmarkConfig('identical-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ], { minSampleSize: 10 });

      const benchmarkId = framework.createBenchmark(config);
      framework.startBenchmark(benchmarkId);

      // Identical results
      for (let i = 0; i < 20; i++) {
        framework.recordOutcome(benchmarkId, 'a', i % 2 === 0, { latency: 100, quality: 0.8 });
        framework.recordOutcome(benchmarkId, 'b', i % 2 === 0, { latency: 100, quality: 0.8 });
      }

      const comparison = framework.compareVariants(benchmarkId, 'a', 'b');
      // Winner should be null or have very low confidence when identical
      expect(comparison.confidence).toBeLessThan(0.5);
    });

    it('should handle non-existent benchmark', () => {
      const framework = new ABBenchmarkingFramework();

      expect(() => {
        framework.getBenchmarkResults('nonexistent');
      }).toThrow('not found');

      expect(() => {
        framework.calculateStatisticalSignificance('nonexistent');
      }).toThrow('not found');

      expect(() => {
        framework.suggestWinner('nonexistent');
      }).toThrow('not found');
    });

    it('should initialize idempotently', async () => {
      const framework = new ABBenchmarkingFramework();

      await framework.initialize();
      await framework.initialize();
      await framework.initialize();

      // Should not throw or cause issues
      const active = framework.getActiveBenchmarks();
      expect(active).toHaveLength(0);
    });

    it('should reset state properly', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      framework.createBenchmark(createBenchmarkConfig('reset-test', [
        { id: 'a', name: 'A', rules: {} },
        { id: 'b', name: 'B', rules: {} },
      ]));

      expect(framework.getBenchmarkHistory()).toHaveLength(1);

      framework.reset();

      expect(framework.getBenchmarkHistory()).toHaveLength(0);
    });
  });

  describe('Benchmark History', () => {
    it('should track benchmark history sorted by start time', async () => {
      const framework = new ABBenchmarkingFramework();
      await framework.initialize();

      // Create multiple benchmarks
      const ids = ['history-1', 'history-2', 'history-3'];
      for (const id of ids) {
        framework.createBenchmark(createBenchmarkConfig(id, [
          { id: 'a', name: 'A', rules: {} },
          { id: 'b', name: 'B', rules: {} },
        ]));
        framework.startBenchmark(id);
        // Small delay to ensure different start times
        await new Promise(r => setTimeout(r, 10));
      }

      const history = framework.getBenchmarkHistory();

      expect(history).toHaveLength(3);
      // Should be sorted by start time descending (most recent first)
      expect(history[0].benchmarkId).toBe('history-3');
      expect(history[2].benchmarkId).toBe('history-1');
    });
  });

  describe('Singleton Instance', () => {
    it('should provide singleton instance', () => {
      expect(abBenchmarkingFramework).toBeDefined();
      expect(abBenchmarkingFramework).toBeInstanceOf(ABBenchmarkingFramework);
    });
  });
});
