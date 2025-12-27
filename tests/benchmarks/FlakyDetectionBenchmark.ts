/**
 * Performance Benchmarks for Flaky Test Detection
 * Validates < 10 second processing time for 1000+ test results
 */

import { FlakyTestDetector } from '../../src/learning/FlakyTestDetector';
import type { TestResult } from '../../src/learning';
import { createSeededRandom, SeededRandom } from '../../src/utils/SeededRandom';

interface BenchmarkResult {
  name: string;
  testResultCount: number;
  duration: number;
  flakyDetected: number;
  throughput: number; // results/second
  memoryUsage: {
    before: number;
    after: number;
    delta: number;
  };
}

export class FlakyDetectionBenchmark {
  private detector: FlakyTestDetector;
  private rng: SeededRandom;

  constructor(seed: number = 12345) {
    this.rng = createSeededRandom(seed);
    this.detector = new FlakyTestDetector({
      minRuns: 5,
      passRateThreshold: 0.8,
      confidenceThreshold: 0.7,
      useMLModel: true
    });
  }

  /**
   * Run all benchmarks
   */
  async runAll(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    console.log('🚀 Starting Flaky Detection Benchmarks\n');

    // Small dataset (100 results)
    results.push(await this.runBenchmark('Small Dataset (100 results)', 100, 10));

    // Medium dataset (1,000 results)
    results.push(await this.runBenchmark('Medium Dataset (1,000 results)', 1000, 100));

    // Large dataset (10,000 results)
    results.push(await this.runBenchmark('Large Dataset (10,000 results)', 10000, 1000));

    // Extra large dataset (100,000 results)
    results.push(await this.runBenchmark('Extra Large Dataset (100,000 results)', 100000, 5000));

    console.log('\n📊 Benchmark Summary:');
    this.printSummary(results);

    return results;
  }

  /**
   * Run single benchmark
   */
  private async runBenchmark(
    name: string,
    totalResults: number,
    testsCount: number
  ): Promise<BenchmarkResult> {
    console.log(`\n⏱️  Running: ${name}`);

    // Generate test data
    const history = this.generateLargeDataset(totalResults, testsCount);

    // Measure memory before
    const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;

    // Run detection and measure time
    const startTime = Date.now();
    const flakyTests = await this.detector.detectFlakyTests(history);
    const duration = Date.now() - startTime;

    // Measure memory after
    const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;

    const result: BenchmarkResult = {
      name,
      testResultCount: totalResults,
      duration,
      flakyDetected: flakyTests.length,
      throughput: totalResults / (duration / 1000),
      memoryUsage: {
        before: memBefore,
        after: memAfter,
        delta: memAfter - memBefore
      }
    };

    console.log(`  ✅ Completed in ${duration}ms`);
    console.log(`  📊 Throughput: ${Math.round(result.throughput)} results/sec`);
    console.log(`  🔍 Flaky tests detected: ${flakyTests.length}`);
    console.log(`  💾 Memory delta: ${result.memoryUsage.delta.toFixed(2)} MB`);

    return result;
  }

  /**
   * Benchmark accuracy on known dataset
   */
  async benchmarkAccuracy(): Promise<{
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    falsePositiveRate: number;
  }> {
    console.log('\n🎯 Benchmarking Accuracy...');

    // Generate labeled dataset
    const { trainingData, labels, testData, testLabels } = this.generateLabeledDataset();

    // Train model
    console.log('  Training model...');
    await this.detector.trainModel(trainingData, labels);

    // Test on hold-out set
    console.log('  Testing on hold-out set...');
    const allTestResults: TestResult[] = [];
    for (const results of testData.values()) {
      allTestResults.push(...results);
    }

    const detected = await this.detector.detectFlakyTests(allTestResults);
    const detectedNames = new Set(detected.map(d => d.name));

    // Calculate metrics
    let tp = 0, tn = 0, fp = 0, fn = 0;

    for (const [testName, isFlaky] of testLabels) {
      const wasDetected = detectedNames.has(testName);

      if (wasDetected && isFlaky) tp++;
      else if (!wasDetected && !isFlaky) tn++;
      else if (wasDetected && !isFlaky) fp++;
      else fn++;
    }

    const accuracy = (tp + tn) / testLabels.size;
    const precision = tp / Math.max(tp + fp, 1);
    const recall = tp / Math.max(tp + fn, 1);
    const f1Score = 2 * (precision * recall) / Math.max(precision + recall, 0.001);
    const falsePositiveRate = fp / Math.max(fp + tn, 1);

    const metrics = {
      accuracy,
      precision,
      recall,
      f1Score,
      falsePositiveRate
    };

    console.log(`  Accuracy: ${(accuracy * 100).toFixed(2)}%`);
    console.log(`  Precision: ${(precision * 100).toFixed(2)}%`);
    console.log(`  Recall: ${(recall * 100).toFixed(2)}%`);
    console.log(`  F1 Score: ${(f1Score * 100).toFixed(2)}%`);
    console.log(`  False Positive Rate: ${(falsePositiveRate * 100).toFixed(2)}%`);

    return metrics;
  }

  /**
   * Print benchmark summary
   */
  private printSummary(results: BenchmarkResult[]): void {
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│                   BENCHMARK RESULTS                         │');
    console.log('├─────────────────────────────────────────────────────────────┤');

    results.forEach(r => {
      console.log(`│ ${r.name.padEnd(40)} │`);
      console.log(`│   Results: ${r.testResultCount.toLocaleString().padEnd(10)} Duration: ${r.duration}ms ${' '.repeat(14)}│`);
      console.log(`│   Throughput: ${Math.round(r.throughput).toLocaleString()} results/sec ${' '.repeat(18)}│`);
      console.log(`│   Memory: ${r.memoryUsage.delta.toFixed(2)}MB ${' '.repeat(28)}│`);
      console.log('├─────────────────────────────────────────────────────────────┤');
    });

    // Performance validation
    const largeDatasetResult = results.find(r => r.testResultCount >= 1000);
    if (largeDatasetResult && largeDatasetResult.duration < 10000) {
      console.log('│ ✅ PERFORMANCE TARGET MET: < 10s for 1000+ results         │');
    } else {
      console.log('│ ⚠️  PERFORMANCE TARGET MISSED: > 10s for 1000+ results     │');
    }

    console.log('└─────────────────────────────────────────────────────────────┘\n');
  }

  // Helper methods

  private generateLargeDataset(totalResults: number, testsCount: number): TestResult[] {
    const results: TestResult[] = [];
    const resultsPerTest = Math.floor(totalResults / testsCount);
    const baseTime = Date.now();

    for (let i = 0; i < testsCount; i++) {
      const testName = `test${i}`;
      const isFlaky = this.rng.random() < 0.3; // 30% flaky

      for (let j = 0; j < resultsPerTest; j++) {
        const passed = isFlaky
          ? this.rng.random() < (0.4 + this.rng.random() * 0.3) // Flaky: 40-70% pass rate
          : this.rng.random() < 0.98; // Stable: 98% pass rate

        results.push({
          name: testName,
          status: passed ? 'passed' : 'failed',
          duration: isFlaky
            ? 100 + this.rng.random() * 500 // High variance
            : 100 + this.rng.random() * 20,  // Low variance
          timestamp: baseTime + (i * resultsPerTest + j) * 1000,
          error: passed ? undefined : 'Test failure'
        });
      }
    }

    return results;
  }

  private generateLabeledDataset(): {
    trainingData: Map<string, TestResult[]>;
    labels: Map<string, boolean>;
    testData: Map<string, TestResult[]>;
    testLabels: Map<string, boolean>;
  } {
    const trainingData = new Map<string, TestResult[]>();
    const labels = new Map<string, boolean>();
    const testData = new Map<string, TestResult[]>();
    const testLabels = new Map<string, boolean>();

    // Generate training set (80 tests)
    for (let i = 0; i < 80; i++) {
      const testName = `train${i}`;
      const isFlaky = i < 40;
      const results = isFlaky
        ? this.generateFlakyResults(testName, 20, 0.4 + this.rng.random() * 0.3)
        : this.generateStableResults(testName, 20);

      trainingData.set(testName, results);
      labels.set(testName, isFlaky);
    }

    // Generate test set (20 tests)
    for (let i = 0; i < 20; i++) {
      const testName = `test${i}`;
      const isFlaky = i < 10;
      const results = isFlaky
        ? this.generateFlakyResults(testName, 20, 0.4 + this.rng.random() * 0.3)
        : this.generateStableResults(testName, 20);

      testData.set(testName, results);
      testLabels.set(testName, isFlaky);
    }

    return { trainingData, labels, testData, testLabels };
  }

  private generateFlakyResults(testName: string, count: number, passRate: number): TestResult[] {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < count; i++) {
      const passed = this.rng.random() < passRate;
      results.push({
        name: testName,
        status: passed ? 'passed' : 'failed',
        duration: 100 + this.rng.random() * 500,
        timestamp: baseTime + i * 60000,
        error: passed ? undefined : 'Flaky failure'
      });
    }

    return results;
  }

  private generateStableResults(testName: string, count: number): TestResult[] {
    const results: TestResult[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < count; i++) {
      results.push({
        name: testName,
        status: 'passed',
        duration: 100 + this.rng.random() * 10,
        timestamp: baseTime + i * 60000
      });
    }

    return results;
  }
}

// Run benchmarks if executed directly
if (require.main === module) {
  (async () => {
    const benchmark = new FlakyDetectionBenchmark();

    // Run performance benchmarks
    await benchmark.runAll();

    // Run accuracy benchmark
    await benchmark.benchmarkAccuracy();

    console.log('\n✅ All benchmarks completed!\n');
  })();
}
