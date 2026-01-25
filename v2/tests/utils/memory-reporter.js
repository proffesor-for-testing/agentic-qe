/**
 * Custom Jest Reporter for Memory Tracking
 * Monitors memory usage during test execution
 */

class MemoryReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options || {};
    this._enabled = this._options.enabled !== false;
    this._memorySnapshots = [];
  }

  onRunStart() {
    if (!this._enabled) return;

    this._memorySnapshots = [];
    console.log('\n🔍 Memory Reporter: Starting memory tracking...\n');
    this._recordMemorySnapshot('Test Run Start');
  }

  onTestStart(test) {
    if (!this._enabled) return;

    const testName = test.path.split('/').pop();
    this._recordMemorySnapshot(`Test Start: ${testName}`);
  }

  onTestResult(test, testResult) {
    if (!this._enabled) return;

    const testName = test.path.split('/').pop();
    this._recordMemorySnapshot(`Test End: ${testName}`);

    // Check for potential memory leaks in this test
    if (this._memorySnapshots.length >= 2) {
      const previous = this._memorySnapshots[this._memorySnapshots.length - 2];
      const current = this._memorySnapshots[this._memorySnapshots.length - 1];
      const growth = current.heapUsed - previous.heapUsed;
      const growthMB = (growth / 1024 / 1024).toFixed(2);

      if (growth > 50 * 1024 * 1024) { // 50MB growth
        console.warn(`⚠️  High memory growth detected in ${testName}: +${growthMB}MB`);
      }
    }
  }

  onRunComplete() {
    if (!this._enabled) return;

    this._recordMemorySnapshot('Test Run Complete');
    this._printMemorySummary();
  }

  _recordMemorySnapshot(label) {
    const usage = process.memoryUsage();
    this._memorySnapshots.push({
      label,
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss
    });
  }

  _printMemorySummary() {
    console.log('\n📊 Memory Usage Summary:\n');

    const first = this._memorySnapshots[0];
    const last = this._memorySnapshots[this._memorySnapshots.length - 1];

    const heapGrowth = last.heapUsed - first.heapUsed;
    const heapGrowthMB = (heapGrowth / 1024 / 1024).toFixed(2);
    const peakHeap = Math.max(...this._memorySnapshots.map(s => s.heapUsed));
    const peakHeapMB = (peakHeap / 1024 / 1024).toFixed(2);

    console.log(`  Start Heap: ${(first.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  End Heap:   ${(last.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Growth:     ${heapGrowthMB}MB`);
    console.log(`  Peak Heap:  ${peakHeapMB}MB`);
    console.log(`  Peak RSS:   ${(Math.max(...this._memorySnapshots.map(s => s.rss)) / 1024 / 1024).toFixed(2)}MB`);

    if (heapGrowth > 100 * 1024 * 1024) { // 100MB total growth
      console.warn('\n⚠️  WARNING: Significant memory growth detected during test run!');
      console.warn('   Consider reviewing tests for memory leaks.\n');
    } else {
      console.log('\n✅ Memory usage within acceptable limits.\n');
    }
  }
}

module.exports = MemoryReporter;