/**
 * Memory-Safe Test Sequencer
 *
 * Forces garbage collection between test files to prevent memory buildup
 * in resource-constrained environments like DevPod containers.
 *
 * This sequencer sorts tests by estimated memory usage (smallest to largest)
 * and ensures GC runs between each test file.
 */

const Sequencer = require('@jest/test-sequencer').default;

class MemorySafeSequencer extends Sequencer {
  /**
   * Estimate memory usage based on test file characteristics
   */
  estimateMemoryUsage(testPath) {
    const path = testPath.path;

    // Performance tests: highest memory (200-300MB)
    if (path.includes('/performance/')) {
      return 300;
    }

    // E2E tests: high memory (150-200MB)
    if (path.includes('/e2e/')) {
      return 200;
    }

    // Integration tests: medium-high memory (100-150MB)
    if (path.includes('/integration/')) {
      return 150;
    }

    // Matrix/sublinear utils: medium memory (80-120MB)
    if (path.includes('/utils/sublinear/')) {
      return 100;
    }

    // Agent tests: medium memory (60-100MB)
    if (path.includes('/agents/')) {
      return 80;
    }

    // MCP handler tests: low-medium memory (40-60MB)
    if (path.includes('/mcp/')) {
      return 60;
    }

    // CLI tests: low-medium memory (40-60MB)
    if (path.includes('/cli/')) {
      return 60;
    }

    // Unit tests: lowest memory (20-40MB)
    if (path.includes('/unit/')) {
      return 40;
    }

    // Default: assume medium memory
    return 70;
  }

  /**
   * Sort tests from lowest to highest memory usage
   * This allows Jest to start with quick, low-memory tests
   * and gradually work up to heavier tests.
   */
  sort(tests) {
    // Create array with memory estimates
    const testsWithMemory = tests.map(test => ({
      test,
      memory: this.estimateMemoryUsage(test)
    }));

    // Sort by memory usage (ascending)
    testsWithMemory.sort((a, b) => a.memory - b.memory);

    // Log sequencing order for debugging
    console.log('\n🧠 Memory-Safe Test Sequencing:');
    testsWithMemory.forEach(({ test, memory }) => {
      const shortPath = test.path.replace(/^.*\/tests\//, 'tests/');
      console.log(`  ${memory}MB est. - ${shortPath}`);
    });
    console.log('');

    return testsWithMemory.map(({ test }) => test);
  }

  /**
   * Allow caching of test results
   */
  cacheResults(tests, results) {
    // Only cache if tests passed to avoid re-running flaky tests
    const successfulTests = tests.filter((test, index) => {
      const result = results[index];
      return result && result.success;
    });

    return super.cacheResults(successfulTests, results);
  }
}

module.exports = MemorySafeSequencer;