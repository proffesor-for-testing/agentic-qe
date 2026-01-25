/**
 * Flaky Test Fix Recommendation Engine
 * Analyzes flaky test patterns and generates actionable fix recommendations
 */

import { TestResult, FlakyFixRecommendation } from './types';
import { StatisticalAnalysis } from './StatisticalAnalysis';

export class FlakyFixRecommendations {
  /**
   * Generate fix recommendation based on test result patterns
   */
  static generateRecommendation(
    testName: string,
    results: TestResult[]
  ): FlakyFixRecommendation {
    const pattern = this.identifyFailurePattern(results);

    switch (pattern) {
      case 'timing':
        return this.timingRecommendation(results);
      case 'environmental':
        return this.environmentalRecommendation(results);
      case 'resource':
        return this.resourceRecommendation(results);
      case 'isolation':
        return this.isolationRecommendation(results);
      default:
        return this.genericRecommendation(results);
    }
  }

  /**
   * Identify the primary failure pattern
   */
  private static identifyFailurePattern(
    results: TestResult[]
  ): 'timing' | 'environmental' | 'resource' | 'isolation' {
    // Check for timing issues (high variance in duration)
    const variance = StatisticalAnalysis.calculateVariance(results);
    const metrics = StatisticalAnalysis.calculateMetrics(results.map(r => r.duration));

    if (metrics.coefficientOfVariation > 0.5) {
      return 'timing';
    }

    // Check for environmental issues
    const envChanges = this.detectEnvironmentChanges(results);
    if (envChanges > 0.3) {
      return 'environmental';
    }

    // Check for resource contention (outliers in execution time)
    const hasOutliers = metrics.outliers.length > results.length * 0.1;
    if (hasOutliers) {
      return 'resource';
    }

    // Default to isolation issues
    return 'isolation';
  }

  /**
   * Generate timing-related recommendation
   */
  private static timingRecommendation(results: TestResult[]): FlakyFixRecommendation {
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const maxDuration = Math.max(...results.map(r => r.duration));

    return {
      priority: 'high',
      category: 'timing',
      recommendation: 'Add explicit waits or increase timeout thresholds',
      codeExample: `
// Instead of fixed delays:
// await sleep(1000);

// Use explicit waits with conditions:
await waitFor(() => element.isVisible(), {
  timeout: ${Math.ceil(maxDuration * 1.5)},
  interval: 100
});

// Or increase test timeout:
test('flaky test', async () => {
  // ...
}, ${Math.ceil(maxDuration * 2)});
      `.trim(),
      estimatedEffort: 'medium' as const
    };
  }

  /**
   * Generate environment-related recommendation
   */
  private static environmentalRecommendation(results: TestResult[]): FlakyFixRecommendation {
    return {
      priority: 'high',
      category: 'environmental',
      recommendation: 'Mock external dependencies and isolate test environment',
      codeExample: `
// Mock external services:
jest.mock('./externalService', () => ({
  fetchData: jest.fn().mockResolvedValue({ data: 'mocked' })
}));

// Use test containers for databases:
const container = await new PostgreSqlContainer().start();
const connection = await createConnection({
  host: container.getHost(),
  port: container.getPort(),
  // ...
});

// Clean environment before each test:
beforeEach(() => {
  process.env.NODE_ENV = 'test';
  jest.clearAllMocks();
});
      `.trim(),
      estimatedEffort: 'high'
    };
  }

  /**
   * Generate resource contention recommendation
   */
  private static resourceRecommendation(results: TestResult[]): FlakyFixRecommendation {
    return {
      priority: 'medium',
      category: 'resource',
      recommendation: 'Reduce resource usage or run test in isolation',
      codeExample: `
// Run resource-intensive tests serially:
// In jest.config.js:
module.exports = {
  maxWorkers: 1, // For specific test files
  // or use test.concurrent sparingly
};

// Add resource cleanup:
afterEach(async () => {
  // Clear caches
  cache.clear();

  // Close connections
  await db.disconnect();

  // Free memory
  global.gc && global.gc();
});

// Use resource pooling:
const pool = new Pool({ max: 5, min: 1 });
const resource = await pool.acquire();
try {
  // use resource
} finally {
  await pool.release(resource);
}
      `.trim(),
      estimatedEffort: 'medium'
    };
  }

  /**
   * Generate test isolation recommendation
   */
  private static isolationRecommendation(results: TestResult[]): FlakyFixRecommendation {
    return {
      priority: 'high',
      category: 'concurrency',
      recommendation: 'Improve test isolation and cleanup',
      codeExample: `
// Reset global state before each test:
beforeEach(() => {
  // Reset singletons
  ServiceLocator.reset();

  // Clear module cache
  jest.resetModules();

  // Reset database to known state
  await db.migrate.latest();
  await db.seed.run();
});

// Avoid shared state:
// BAD:
const sharedData = [];
test('test 1', () => sharedData.push(1));
test('test 2', () => expect(sharedData).toHaveLength(0)); // Flaky!

// GOOD:
test('test 1', () => {
  const data = [];
  data.push(1);
  expect(data).toHaveLength(1);
});

// Use test fixtures:
const fixture = await loadFixture('user.json');
      `.trim(),
      estimatedEffort: 'high'
    };
  }

  /**
   * Generate generic recommendation
   */
  private static genericRecommendation(results: TestResult[]): FlakyFixRecommendation {
    const passRate = StatisticalAnalysis.calculatePassRate(results);

    return {
      priority: passRate < 0.5 ? 'high' : 'medium',
      category: 'data',
      recommendation: 'Review test for race conditions, shared state, and external dependencies',
      codeExample: `
// Common flaky test fixes:

// 1. Add deterministic delays
await waitForCondition(() => element.exists(), 5000);

// 2. Mock time-dependent code
jest.useFakeTimers();
jest.setSystemTime(new Date('2024-01-01'));

// 3. Disable animations
await page.addStyleTag({ content: '* { animation: none !important; }' });

// 4. Increase retry attempts
jest.retryTimes(3);

// 5. Add debug logging
test('flaky test', async () => {
  const result = await operation();
  console.log('Operation result:', result); // Debug flaky failures
  expect(result).toBe(expected);
});
      `.trim(),
      estimatedEffort: 'low'
    };
  }

  /**
   * Detect environment changes across test runs
   */
  private static detectEnvironmentChanges(results: TestResult[]): number {
    const withEnv = results.filter(r => r.environment);
    if (withEnv.length < 2) return 0;

    let changes = 0;
    const keys = new Set<string>();

    withEnv.forEach(r => {
      Object.keys(r.environment || {}).forEach(k => keys.add(k));
    });

    keys.forEach(key => {
      const values = new Set(withEnv.map(r => r.environment?.[key]));
      if (values.size > 1) changes++;
    });

    return changes / keys.size;
  }
}
