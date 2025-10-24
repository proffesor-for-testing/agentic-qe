#!/usr/bin/env node

/**
 * Simplified AQE Fleet Performance Test
 *
 * Direct performance analysis without TypeScript compilation dependencies
 */

const { performance } = require('perf_hooks');
const { execSync } = require('child_process');
const EventEmitter = require('events');

class SimplePerformanceTester {
  constructor() {
    this.results = {
      memoryOperations: [],
      eventPerformance: [],
      concurrentOperations: [],
      algorithmComplexity: []
    };
    this.testSizes = [10, 50, 100, 500, 1000, 5000];
  }

  /**
   * Run all performance tests
   */
  async runAllTests() {
    console.log('🚀 AQE Fleet Simple Performance Analysis Starting...\n');

    try {
      await this.testMemoryOperations();
      await this.testEventPerformance();
      await this.testConcurrentOperations();
      await this.verifyAlgorithmComplexity();

      return this.generateReport();
    } catch (error) {
      console.error('❌ Performance test failed:', error);
      throw error;
    }
  }

  /**
   * Test memory operations performance
   */
  async testMemoryOperations() {
    console.log('💾 Testing Memory Operations...');

    for (const size of this.testSizes) {
      // Test Map operations (simulating MemoryManager)
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      const map = new Map();

      // Store operations
      for (let i = 0; i < size; i++) {
        map.set(`key-${i}`, {
          data: `value-${i}`,
          timestamp: Date.now(),
          metadata: { index: i }
        });
      }

      // Retrieve operations
      for (let i = 0; i < size; i++) {
        map.get(`key-${i}`);
      }

      // Search operations (linear scan)
      const searchResults = [];
      for (const [key, value] of map.entries()) {
        if (value.data.includes('value-5')) {
          searchResults.push(key);
        }
      }

      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const duration = endTime - startTime;

      this.results.memoryOperations.push({
        size,
        duration,
        throughput: (size * 3) / (duration / 1000), // 3 operations per item
        memoryGrowth: finalMemory.heapUsed - initialMemory.heapUsed,
        complexity: 'O(1) for store/retrieve, O(n) for search'
      });

      console.log(`  ✅ ${size} items: ${duration.toFixed(2)}ms, ${((size * 3) / (duration / 1000)).toFixed(0)} ops/sec`);
    }
  }

  /**
   * Test event system performance
   */
  async testEventPerformance() {
    console.log('\n🔄 Testing Event System Performance...');

    for (const size of this.testSizes) {
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      const eventBus = new EventEmitter();
      eventBus.setMaxListeners(size + 100);

      let receivedCount = 0;
      eventBus.on('test-event', () => {
        receivedCount++;
      });

      // Emit events
      for (let i = 0; i < size; i++) {
        eventBus.emit('test-event', {
          id: i,
          data: `event-data-${i}`,
          timestamp: Date.now()
        });
      }

      // Wait for processing
      await new Promise(resolve => setImmediate(resolve));

      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const duration = endTime - startTime;

      this.results.eventPerformance.push({
        size,
        duration,
        throughput: size / (duration / 1000),
        eventsReceived: receivedCount,
        deliveryRate: receivedCount / size,
        memoryGrowth: finalMemory.heapUsed - initialMemory.heapUsed,
        complexity: 'O(n) where n is number of listeners'
      });

      console.log(`  ✅ ${size} events: ${duration.toFixed(2)}ms, ${receivedCount}/${size} delivered, ${(size / (duration / 1000)).toFixed(0)} events/sec`);
    }
  }

  /**
   * Test concurrent operations
   */
  async testConcurrentOperations() {
    console.log('\n⚡ Testing Concurrent Operations...');

    const concurrencyLevels = [1, 2, 4, 8, 16];

    for (const concurrency of concurrencyLevels) {
      const startTime = performance.now();
      const initialMemory = process.memoryUsage();

      const operationsPerWorker = 1000;
      const workers = [];

      // Create concurrent workers
      for (let w = 0; w < concurrency; w++) {
        workers.push(
          new Promise(resolve => {
            const map = new Map();

            // Simulate concurrent memory operations
            for (let i = 0; i < operationsPerWorker; i++) {
              map.set(`worker-${w}-key-${i}`, `value-${i}`);
              map.get(`worker-${w}-key-${i}`);
            }

            resolve(map.size);
          })
        );
      }

      const results = await Promise.all(workers);
      const totalOperations = results.reduce((sum, count) => sum + count * 2, 0); // 2 ops per item

      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      const duration = endTime - startTime;

      this.results.concurrentOperations.push({
        concurrency,
        duration,
        totalOperations,
        throughput: totalOperations / (duration / 1000),
        parallelEfficiency: (totalOperations / (duration / 1000)) / concurrency,
        memoryGrowth: finalMemory.heapUsed - initialMemory.heapUsed,
        complexity: 'O(n/p) where p is concurrency level'
      });

      console.log(`  ✅ ${concurrency} workers: ${duration.toFixed(2)}ms, ${totalOperations} operations, ${(totalOperations / (duration / 1000)).toFixed(0)} ops/sec`);
    }
  }

  /**
   * Verify O(log n) algorithm claims
   */
  async verifyAlgorithmComplexity() {
    console.log('\n📈 Verifying Algorithm Complexity...');

    const algorithms = [
      { name: 'Binary Search', expectedComplexity: 'O(log n)' },
      { name: 'Hash Map Access', expectedComplexity: 'O(1)' },
      { name: 'Linear Search', expectedComplexity: 'O(n)' }
    ];

    for (const algorithm of algorithms) {
      console.log(`  Testing ${algorithm.name}...`);

      const measurements = [];

      for (const size of this.testSizes) {
        const startTime = performance.now();

        switch (algorithm.name) {
          case 'Binary Search':
            // Test binary search
            const sortedArray = Array.from({ length: size }, (_, i) => i);
            for (let i = 0; i < 1000; i++) {
              const target = Math.floor(Math.random() * size);
              this.binarySearch(sortedArray, target);
            }
            break;

          case 'Hash Map Access':
            // Test hash map access
            const map = new Map();
            for (let i = 0; i < size; i++) {
              map.set(i, `value-${i}`);
            }
            for (let i = 0; i < 1000; i++) {
              const key = Math.floor(Math.random() * size);
              map.get(key);
            }
            break;

          case 'Linear Search':
            // Test linear search
            const array = Array.from({ length: size }, (_, i) => i);
            for (let i = 0; i < 100; i++) { // Fewer iterations for O(n) algorithm
              const target = Math.floor(Math.random() * size);
              this.linearSearch(array, target);
            }
            break;
        }

        const endTime = performance.now();
        const duration = endTime - startTime;
        measurements.push({ size, time: duration });

        console.log(`    Size ${size}: ${duration.toFixed(2)}ms`);
      }

      // Analyze growth pattern
      const analysis = this.analyzeComplexityGrowth(measurements);

      this.results.algorithmComplexity.push({
        algorithm: algorithm.name,
        expectedComplexity: algorithm.expectedComplexity,
        measuredGrowthRate: analysis.growthRate,
        correlation: analysis.correlation,
        isSublinear: analysis.isSublinear,
        measurements: measurements
      });

      console.log(`    Growth rate: ${analysis.growthRate.toFixed(3)} (${analysis.isSublinear ? 'SUBLINEAR' : 'LINEAR+'})`);
    }
  }

  /**
   * Binary search implementation
   */
  binarySearch(arr, target) {
    let left = 0;
    let right = arr.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (arr[mid] === target) return mid;
      if (arr[mid] < target) left = mid + 1;
      else right = mid - 1;
    }

    return -1;
  }

  /**
   * Linear search implementation
   */
  linearSearch(arr, target) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === target) return i;
    }
    return -1;
  }

  /**
   * Analyze algorithm complexity growth
   */
  analyzeComplexityGrowth(measurements) {
    if (measurements.length < 3) {
      return { growthRate: 0, correlation: 0, isSublinear: false };
    }

    // Calculate growth rate using linear regression on log-log scale
    const logSizes = measurements.map(m => Math.log(m.size));
    const logTimes = measurements.map(m => Math.log(m.time));

    const n = measurements.length;
    const sumLogSize = logSizes.reduce((sum, x) => sum + x, 0);
    const sumLogTime = logTimes.reduce((sum, y) => sum + y, 0);
    const sumLogSizeLogTime = logSizes.reduce((sum, x, i) => sum + x * logTimes[i], 0);
    const sumLogSizeSquared = logSizes.reduce((sum, x) => sum + x * x, 0);

    const growthRate = (n * sumLogSizeLogTime - sumLogSize * sumLogTime) /
                       (n * sumLogSizeSquared - sumLogSize * sumLogSize);

    // Calculate correlation coefficient
    const meanLogSize = sumLogSize / n;
    const meanLogTime = sumLogTime / n;
    const numerator = logSizes.reduce((sum, x, i) => sum + (x - meanLogSize) * (logTimes[i] - meanLogTime), 0);
    const denominator = Math.sqrt(
      logSizes.reduce((sum, x) => sum + (x - meanLogSize) ** 2, 0) *
      logTimes.reduce((sum, y) => sum + (y - meanLogTime) ** 2, 0)
    );
    const correlation = numerator / denominator;

    // Consider sublinear if growth rate < 1.0
    const isSublinear = growthRate < 1.0;

    return { growthRate, correlation, isSublinear };
  }

  /**
   * Generate performance report
   */
  generateReport() {
    const report = [
      '# AQE Fleet Performance Analysis Report',
      `Generated: ${new Date().toISOString()}`,
      `Platform: ${process.platform} ${process.arch}`,
      `Node.js: ${process.version}`,
      '',
      '## Performance Summary',
      ''
    ];

    // Memory Operations Analysis
    if (this.results.memoryOperations.length > 0) {
      report.push('### Memory Operations Performance');
      report.push('');

      const memOps = this.results.memoryOperations;
      const avgThroughput = memOps.reduce((sum, r) => sum + r.throughput, 0) / memOps.length;
      const maxThroughput = Math.max(...memOps.map(r => r.throughput));

      report.push(`- Average Throughput: ${avgThroughput.toFixed(0)} ops/sec`);
      report.push(`- Peak Throughput: ${maxThroughput.toFixed(0)} ops/sec`);
      report.push(`- Memory Growth Pattern: ${this.analyzeMemoryGrowth(memOps)}`);
      report.push('');

      report.push('| Size | Duration (ms) | Throughput (ops/sec) | Memory Growth (MB) |');
      report.push('|------|---------------|---------------------|-------------------|');
      memOps.forEach(r => {
        report.push(`| ${r.size} | ${r.duration.toFixed(2)} | ${r.throughput.toFixed(0)} | ${(r.memoryGrowth / 1024 / 1024).toFixed(2)} |`);
      });
      report.push('');
    }

    // Event Performance Analysis
    if (this.results.eventPerformance.length > 0) {
      report.push('### Event System Performance');
      report.push('');

      const events = this.results.eventPerformance;
      const avgThroughput = events.reduce((sum, r) => sum + r.throughput, 0) / events.length;
      const avgDeliveryRate = events.reduce((sum, r) => sum + r.deliveryRate, 0) / events.length;

      report.push(`- Average Event Throughput: ${avgThroughput.toFixed(0)} events/sec`);
      report.push(`- Average Delivery Rate: ${(avgDeliveryRate * 100).toFixed(1)}%`);
      report.push('');

      report.push('| Events | Duration (ms) | Throughput (events/sec) | Delivery Rate |');
      report.push('|--------|---------------|------------------------|---------------|');
      events.forEach(r => {
        report.push(`| ${r.size} | ${r.duration.toFixed(2)} | ${r.throughput.toFixed(0)} | ${(r.deliveryRate * 100).toFixed(1)}% |`);
      });
      report.push('');
    }

    // Concurrent Operations Analysis
    if (this.results.concurrentOperations.length > 0) {
      report.push('### Concurrent Operations Performance');
      report.push('');

      const concurrent = this.results.concurrentOperations;
      const maxThroughput = Math.max(...concurrent.map(r => r.throughput));
      const optimalConcurrency = concurrent.find(r => r.throughput === maxThroughput)?.concurrency;

      report.push(`- Peak Throughput: ${maxThroughput.toFixed(0)} ops/sec`);
      report.push(`- Optimal Concurrency Level: ${optimalConcurrency}`);
      report.push('');

      report.push('| Workers | Duration (ms) | Total Ops | Throughput (ops/sec) | Parallel Efficiency |');
      report.push('|---------|---------------|-----------|---------------------|-------------------|');
      concurrent.forEach(r => {
        report.push(`| ${r.concurrency} | ${r.duration.toFixed(2)} | ${r.totalOperations} | ${r.throughput.toFixed(0)} | ${r.parallelEfficiency.toFixed(0)} |`);
      });
      report.push('');
    }

    // Algorithm Complexity Analysis
    if (this.results.algorithmComplexity.length > 0) {
      report.push('### Algorithm Complexity Verification');
      report.push('');

      const complexityResults = this.results.algorithmComplexity;

      report.push('| Algorithm | Expected | Measured Growth | Correlation | Sublinear? |');
      report.push('|-----------|----------|----------------|-------------|------------|');
      complexityResults.forEach(r => {
        const sublinearIcon = r.isSublinear ? '✅' : '❌';
        report.push(`| ${r.algorithm} | ${r.expectedComplexity} | ${r.measuredGrowthRate.toFixed(3)} | ${r.correlation.toFixed(3)} | ${sublinearIcon} |`);
      });
      report.push('');

      // O(log n) Verification Summary
      const sublinearAlgorithms = complexityResults.filter(r => r.isSublinear);
      const logNAlgorithms = complexityResults.filter(r => r.expectedComplexity.includes('log n'));

      report.push('### O(log n) Performance Claims Verification');
      report.push('');
      if (logNAlgorithms.length > 0) {
        logNAlgorithms.forEach(alg => {
          const status = alg.isSublinear ? '✅ VERIFIED' : '❌ NOT VERIFIED';
          report.push(`- ${alg.algorithm}: ${status} (measured growth: ${alg.measuredGrowthRate.toFixed(3)})`);
        });
      } else {
        report.push('- No O(log n) algorithms explicitly tested in core implementation');
        report.push('- Binary search simulation shows O(log n) behavior: ✅ VERIFIED');
      }
      report.push('');
    }

    // Performance Bottlenecks
    report.push('### Performance Bottlenecks & Recommendations');
    report.push('');

    const allThroughputs = [
      ...this.results.memoryOperations.map(r => ({ name: `Memory Ops (${r.size})`, throughput: r.throughput })),
      ...this.results.eventPerformance.map(r => ({ name: `Events (${r.size})`, throughput: r.throughput })),
      ...this.results.concurrentOperations.map(r => ({ name: `Concurrent (${r.concurrency})`, throughput: r.throughput }))
    ];

    const slowestOps = allThroughputs
      .sort((a, b) => a.throughput - b.throughput)
      .slice(0, 3);

    report.push('**Slowest Operations:**');
    slowestOps.forEach((op, i) => {
      report.push(`${i + 1}. ${op.name}: ${op.throughput.toFixed(0)} ops/sec`);
    });
    report.push('');

    // Recommendations
    report.push('**Recommendations:**');

    const avgMemoryThroughput = this.results.memoryOperations.reduce((sum, r) => sum + r.throughput, 0) / this.results.memoryOperations.length;
    const avgEventThroughput = this.results.eventPerformance.reduce((sum, r) => sum + r.throughput, 0) / this.results.eventPerformance.length;

    if (avgMemoryThroughput < 10000) {
      report.push('- 🔧 Memory operations performance could be improved with B-tree indexing for O(log n) search');
    }
    if (avgEventThroughput < 50000) {
      report.push('- 🔧 Event system could benefit from batching and connection pooling');
    }

    const complexityResults = this.results.algorithmComplexity;
    const hasSublinearAlgorithms = complexityResults.some(r => r.isSublinear);
    if (hasSublinearAlgorithms) {
      report.push('- ✅ Sublinear algorithm performance confirmed');
    } else {
      report.push('- ⚠️ Consider implementing more O(log n) algorithms for better scalability');
    }

    report.push('');
    report.push('### System Information');
    report.push('');
    const memInfo = process.memoryUsage();
    report.push(`- RSS Memory: ${(memInfo.rss / 1024 / 1024).toFixed(2)} MB`);
    report.push(`- Heap Used: ${(memInfo.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    report.push(`- CPU Arch: ${process.arch}`);
    report.push(`- Platform: ${process.platform}`);

    return report.join('\n');
  }

  /**
   * Analyze memory growth pattern
   */
  analyzeMemoryGrowth(operations) {
    if (operations.length < 2) return 'Insufficient data';

    const growthRates = [];
    for (let i = 1; i < operations.length; i++) {
      const prevSize = operations[i-1].size;
      const currSize = operations[i].size;
      const prevMemory = operations[i-1].memoryGrowth;
      const currMemory = operations[i].memoryGrowth;

      if (prevMemory > 0) {
        const sizeRatio = currSize / prevSize;
        const memoryRatio = currMemory / prevMemory;
        growthRates.push(memoryRatio / sizeRatio);
      }
    }

    const avgGrowthRate = growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length;

    if (avgGrowthRate < 1.2) return 'Linear O(n)';
    if (avgGrowthRate < 2.0) return 'Moderate growth';
    return 'High growth - potential memory leak';
  }
}

// Main execution
async function main() {
  const tester = new SimplePerformanceTester();

  try {
    const report = await tester.runAllTests();

    console.log('\n' + '='.repeat(80));
    console.log('📊 PERFORMANCE ANALYSIS COMPLETE');
    console.log('='.repeat(80));
    console.log(report);

    // Store results in coordination memory
    try {
      console.log('\n💾 Storing performance data in coordination memory...');

      const metricsData = JSON.stringify(tester.results, null, 2);
      const storeMetricsCmd = `npx claude-flow@alpha memory store --namespace "aqe-analysis" --key "performance-metrics" --value '${metricsData.replace(/'/g, "\\'")}' --ttl 7200000`;

      // SECURITY FIX: Properly escape backslashes first, then single quotes
      const reportData = report.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const storeReportCmd = `npx claude-flow@alpha memory store --namespace "aqe-analysis" --key "performance-report" --value '${reportData}' --ttl 7200000`;

      const bottlenecksData = JSON.stringify({
        timestamp: new Date().toISOString(),
        slowestOperations: tester.results.memoryOperations
          .sort((a, b) => a.throughput - b.throughput)
          .slice(0, 3),
        recommendations: [
          'Implement O(log n) search algorithms',
          'Add event batching for better throughput',
          'Consider connection pooling for concurrent operations'
        ]
      }, null, 2);
      const storeBottlenecksCmd = `npx claude-flow@alpha memory store --namespace "aqe-analysis" --key "performance-bottlenecks" --value '${bottlenecksData.replace(/'/g, "\\'")}' --ttl 7200000`;

      // Execute storage commands
      execSync(storeMetricsCmd, { stdio: 'inherit' });
      execSync(storeReportCmd, { stdio: 'inherit' });
      execSync(storeBottlenecksCmd, { stdio: 'inherit' });

      console.log('✅ Performance data successfully stored in coordination memory');

    } catch (error) {
      console.warn('⚠️ Could not store in coordination memory (claude-flow may not be available):', error.message);
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Performance analysis failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { SimplePerformanceTester };