/**
 * FixRecommendationEngine - Automated fix recommendations for flaky tests
 *
 * Generates actionable fix recommendations with code examples based on root cause analysis
 *
 * @module learning/FixRecommendationEngine
 * @version 1.0.0
 */

import { FlakyFixRecommendation } from './types';

/**
 * Root cause categories for flaky tests
 */
export type RootCause = 'timing' | 'race_condition' | 'dependency' | 'isolation' | 'environment';

/**
 * Root cause analysis result
 */
export interface RootCauseAnalysis {
  cause: RootCause;
  mlConfidence: number; // 0-1 ML model confidence
  evidence: string[];
  patterns: string[];
}

/**
 * FixRecommendationEngine for generating automated fix recommendations
 */
export class FixRecommendationEngine {
  /**
   * Generate fix recommendations based on root cause
   *
   * @param rootCause - Root cause analysis result
   * @returns Array of fix recommendations with code examples
   */
  generateRecommendations(rootCause: RootCauseAnalysis): FlakyFixRecommendation[] {
    switch (rootCause.cause) {
      case 'timing':
        return this.timingFixes(rootCause);
      case 'race_condition':
        return this.raceFixes(rootCause);
      case 'dependency':
        return this.dependencyFixes(rootCause);
      case 'isolation':
        return this.isolationFixes(rootCause);
      case 'environment':
        return this.environmentFixes(rootCause);
      default:
        return this.genericFixes(rootCause);
    }
  }

  /**
   * Timing-related fixes
   */
  private timingFixes(rootCause: RootCauseAnalysis): FlakyFixRecommendation[] {
    const fixes: FlakyFixRecommendation[] = [];

    // Fix 1: Add explicit wait with retry logic
    fixes.push({
      priority: 'high',
      category: 'timing',
      recommendation: 'Add explicit wait with retry logic to handle asynchronous operations',
      codeExample: `// Before
expect(element).toBeVisible();

// After - Using waitFor with retry
import { waitFor } from '@testing-library/react';

await waitFor(
  () => expect(element).toBeVisible(),
  {
    timeout: 5000,
    interval: 100
  }
);

// Or with retry wrapper
async function withRetry(fn: () => void, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await fn();
      return;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
    }
  }
}

await withRetry(() => expect(element).toBeVisible());`,
      estimatedEffort: 'low'
    });

    // Fix 2: Use proper async/await patterns
    fixes.push({
      priority: 'high',
      category: 'timing',
      recommendation: 'Ensure proper async/await usage for asynchronous operations',
      codeExample: `// Before - Missing await
it('should fetch data', () => {
  const data = fetchData(); // Returns Promise
  expect(data).toEqual({ id: 1 });
});

// After - Proper async/await
it('should fetch data', async () => {
  const data = await fetchData();
  expect(data).toEqual({ id: 1 });
});

// Or with .resolves
it('should fetch data', () => {
  return expect(fetchData()).resolves.toEqual({ id: 1 });
});`,
      estimatedEffort: 'low'
    });

    // Fix 3: Add timeout configuration
    fixes.push({
      priority: 'medium',
      category: 'timing',
      recommendation: 'Configure appropriate timeouts for slow operations',
      codeExample: `// Test-specific timeout
it('should handle slow operation', async () => {
  await slowOperation();
  expect(result).toBeDefined();
}, 10000); // 10 second timeout

// Or using Jest setTimeout
beforeEach(() => {
  jest.setTimeout(10000);
});`,
      estimatedEffort: 'low'
    });

    return fixes;
  }

  /**
   * Race condition fixes
   */
  private raceFixes(rootCause: RootCauseAnalysis): FlakyFixRecommendation[] {
    const fixes: FlakyFixRecommendation[] = [];

    // Fix 1: Add proper synchronization
    fixes.push({
      priority: 'critical',
      category: 'concurrency',
      recommendation: 'Add synchronization mechanisms to prevent race conditions',
      codeExample: `// Before - Race condition
let sharedState = 0;
Promise.all([
  updateState(),
  checkState()
]);

// After - Using mutex/lock pattern
import { Mutex } from 'async-mutex';

const mutex = new Mutex();
let sharedState = 0;

async function updateState() {
  const release = await mutex.acquire();
  try {
    sharedState++;
  } finally {
    release();
  }
}

// Or using atomic operations
import { Atomics } from 'atomics';

const sharedBuffer = new SharedArrayBuffer(4);
const sharedArray = new Int32Array(sharedBuffer);
Atomics.add(sharedArray, 0, 1); // Atomic increment`,
      estimatedEffort: 'medium'
    });

    // Fix 2: Use test isolation
    fixes.push({
      priority: 'high',
      category: 'concurrency',
      recommendation: 'Isolate concurrent tests using proper setup/teardown',
      codeExample: `// Before - Shared state across tests
let counter = 0;

it('test 1', () => {
  counter++;
  expect(counter).toBe(1);
});

it('test 2', () => {
  counter++;
  expect(counter).toBe(1); // Fails due to shared state
});

// After - Isolated state
describe('Counter tests', () => {
  let counter: number;

  beforeEach(() => {
    counter = 0; // Reset for each test
  });

  it('test 1', () => {
    counter++;
    expect(counter).toBe(1);
  });

  it('test 2', () => {
    counter++;
    expect(counter).toBe(1); // Now passes
  });
});`,
      estimatedEffort: 'low'
    });

    return fixes;
  }

  /**
   * Dependency-related fixes
   */
  private dependencyFixes(rootCause: RootCauseAnalysis): FlakyFixRecommendation[] {
    const fixes: FlakyFixRecommendation[] = [];

    // Fix 1: Mock external dependencies
    fixes.push({
      priority: 'high',
      category: 'external',
      recommendation: 'Mock external dependencies to eliminate external variability',
      codeExample: `// Before - Real API calls
it('should fetch user data', async () => {
  const user = await api.getUser(123);
  expect(user.name).toBe('John');
});

// After - Mocked dependencies
import { jest } from '@jest/globals';

jest.mock('./api', () => ({
  getUser: jest.fn().mockResolvedValue({
    id: 123,
    name: 'John'
  })
}));

it('should fetch user data', async () => {
  const user = await api.getUser(123);
  expect(user.name).toBe('John');
});

// With MSW for HTTP mocking
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  rest.get('/api/user/:id', (req, res, ctx) => {
    return res(ctx.json({ id: 123, name: 'John' }));
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());`,
      estimatedEffort: 'medium'
    });

    // Fix 2: Stub time-dependent functions
    fixes.push({
      priority: 'medium',
      category: 'external',
      recommendation: 'Stub time-dependent functions for deterministic results',
      codeExample: `// Before - Real date/time
it('should check expiry', () => {
  const token = { expiresAt: Date.now() + 1000 };
  expect(isExpired(token)).toBe(false);
});

// After - Mocked time
jest.useFakeTimers();
jest.setSystemTime(new Date('2024-01-01'));

it('should check expiry', () => {
  const token = { expiresAt: new Date('2024-01-02').getTime() };
  expect(isExpired(token)).toBe(false);

  // Advance time
  jest.advanceTimersByTime(24 * 60 * 60 * 1000);
  expect(isExpired(token)).toBe(true);
});

jest.useRealTimers(); // Cleanup`,
      estimatedEffort: 'low'
    });

    return fixes;
  }

  /**
   * Isolation-related fixes
   */
  private isolationFixes(rootCause: RootCauseAnalysis): FlakyFixRecommendation[] {
    const fixes: FlakyFixRecommendation[] = [];

    // Fix 1: Proper test cleanup
    fixes.push({
      priority: 'high',
      category: 'data',
      recommendation: 'Add proper cleanup in afterEach to ensure test isolation',
      codeExample: `// Before - No cleanup
it('test 1', () => {
  localStorage.setItem('key', 'value1');
  // ... test logic
});

it('test 2', () => {
  // Fails due to leftover state
  expect(localStorage.getItem('key')).toBeNull();
});

// After - Proper cleanup
describe('LocalStorage tests', () => {
  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  it('test 1', () => {
    localStorage.setItem('key', 'value1');
    expect(localStorage.getItem('key')).toBe('value1');
  });

  it('test 2', () => {
    expect(localStorage.getItem('key')).toBeNull();
  });
});`,
      estimatedEffort: 'low'
    });

    // Fix 2: Reset global state
    fixes.push({
      priority: 'high',
      category: 'data',
      recommendation: 'Reset global state and singletons between tests',
      codeExample: `// Before - Singleton with state
class ConfigManager {
  private static instance: ConfigManager;
  private config: any = {};

  static getInstance() {
    if (!this.instance) {
      this.instance = new ConfigManager();
    }
    return this.instance;
  }
}

// After - Add reset method
class ConfigManager {
  private static instance: ConfigManager;
  private config: any = {};

  static getInstance() {
    if (!this.instance) {
      this.instance = new ConfigManager();
    }
    return this.instance;
  }

  static resetInstance() {
    this.instance = null as any;
  }
}

// In tests
afterEach(() => {
  ConfigManager.resetInstance();
});`,
      estimatedEffort: 'medium'
    });

    return fixes;
  }

  /**
   * Environment-related fixes
   */
  private environmentFixes(rootCause: RootCauseAnalysis): FlakyFixRecommendation[] {
    const fixes: FlakyFixRecommendation[] = [];

    // Fix 1: Use test doubles for environment
    fixes.push({
      priority: 'medium',
      category: 'environmental',
      recommendation: 'Use test doubles to eliminate environment variability',
      codeExample: `// Before - Relying on environment
it('should use correct API URL', () => {
  const url = process.env.API_URL;
  expect(url).toBeDefined();
});

// After - Mock environment
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    API_URL: 'https://test.api.com',
    NODE_ENV: 'test'
  };
});

afterEach(() => {
  process.env = originalEnv;
});

it('should use correct API URL', () => {
  const url = process.env.API_URL;
  expect(url).toBe('https://test.api.com');
});`,
      estimatedEffort: 'low'
    });

    // Fix 2: Use test containers
    fixes.push({
      priority: 'medium',
      category: 'environmental',
      recommendation: 'Use test containers for consistent database/service environments',
      codeExample: `// Using Testcontainers
import { GenericContainer } from 'testcontainers';

describe('Database tests', () => {
  let container: any;
  let database: any;

  beforeAll(async () => {
    container = await new GenericContainer('postgres:14')
      .withExposedPorts(5432)
      .withEnv('POSTGRES_PASSWORD', 'test')
      .start();

    const port = container.getMappedPort(5432);
    database = await connectToDatabase({
      host: 'localhost',
      port,
      password: 'test'
    });
  });

  afterAll(async () => {
    await database.close();
    await container.stop();
  });

  it('should query database', async () => {
    const result = await database.query('SELECT 1');
    expect(result).toBeDefined();
  });
});`,
      estimatedEffort: 'high'
    });

    return fixes;
  }

  /**
   * Generic fixes for unknown root causes
   */
  private genericFixes(rootCause: RootCauseAnalysis): FlakyFixRecommendation[] {
    return [{
      priority: 'medium',
      category: 'data',
      recommendation: 'Add retry logic and better error handling',
      codeExample: `// Generic retry wrapper
async function retryTest(testFn: () => Promise<void>, maxRetries = 3) {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await testFn();
      return; // Success
    } catch (error) {
      lastError = error as Error;
      await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
    }
  }

  throw lastError!;
}

// Usage
it('flaky test', async () => {
  await retryTest(async () => {
    // Test logic here
    expect(await someAsyncOperation()).toBe(expected);
  });
});`,
      estimatedEffort: 'low'
    }];
  }

  /**
   * Get priority order for recommendations
   */
  getPriorityOrder(recommendations: FlakyFixRecommendation[]): FlakyFixRecommendation[] {
    const priorityMap: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    };

    return recommendations.sort((a, b) => {
      return priorityMap[b.priority] - priorityMap[a.priority];
    });
  }

  /**
   * Filter recommendations by effort
   */
  filterByEffort(
    recommendations: FlakyFixRecommendation[],
    maxEffort: 'low' | 'medium' | 'high'
  ): FlakyFixRecommendation[] {
    const effortMap: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3
    };

    const threshold = effortMap[maxEffort];

    return recommendations.filter(rec => effortMap[rec.estimatedEffort] <= threshold);
  }
}

export default FixRecommendationEngine;
