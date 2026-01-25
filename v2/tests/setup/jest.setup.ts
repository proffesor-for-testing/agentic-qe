import { jest } from '@jest/globals';

// Global Jest setup for Agentic QE test suite
// This file configures Jest environment and global mocks

// Extend Jest matchers
import 'jest-extended';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

beforeAll(() => {
  // Mock console methods but preserve important ones
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: originalConsole.error // Keep errors visible
  };
});

afterAll(() => {
  // Restore original console
  global.console = originalConsole;
});

// Global test utilities
global.testUtils = {
  // Create mock with London School patterns
  createMock: <T>(implementation?: Partial<T>): jest.Mocked<T> => {
    return {
      ...implementation
    } as jest.Mocked<T>;
  },
  
  // Wait for async operations
  waitFor: (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  // Create test data factories
  createTestData: {
    agent: (overrides = {}) => ({
      id: 'test-agent-123',
      type: 'unit-test-generator',
      status: 'ready',
      capabilities: ['jest', 'typescript'],
      ...overrides
    }),
    
    testSuite: (overrides = {}) => ({
      id: 'test-suite-456',
      tests: [
        { id: 'test-1', file: 'user.test.ts', estimatedDuration: 1000 },
        { id: 'test-2', file: 'auth.test.ts', estimatedDuration: 1500 }
      ],
      totalTests: 2,
      ...overrides
    }),
    
    qualityMetrics: (overrides = {}) => ({
      coverage: {
        line: 85.5,
        branch: 78.2,
        function: 92.0
      },
      testCount: 147,
      passingTests: 145,
      failingTests: 2,
      codeQuality: {
        complexity: 3.2,
        maintainability: 87.5
      },
      ...overrides
    })
  }
};

// Mock external services that are commonly used
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  rm: jest.fn()
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn()
}));

// Mock external APIs
jest.mock('axios', () => ({
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  }
}));

// Environment variable defaults for testing
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.QE_TEST_MODE = 'true';

// Global error handling for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests
});

// Increase memory limit for large test suites
if (process.env.NODE_OPTIONS?.includes('--max-old-space-size') === false) {
  process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '') + ' --max-old-space-size=4096';
}

// Enhanced cleanup after each test
afterEach(async () => {
  // Wait for async operations to complete
  await new Promise(resolve => setImmediate(resolve));

  // Clear all mocks
  jest.clearAllMocks();

  // Run registered cleanups (supports async)
  if (global.testCleanup) {
    await Promise.all(
      global.testCleanup.map(cleanup =>
        Promise.resolve(cleanup()).catch(err => {
          console.warn('Cleanup error:', err);
        })
      )
    );
    global.testCleanup = [];
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});

// Global test cleanup registry
global.testCleanup = [];
global.addTestCleanup = (cleanup: () => void) => {
  global.testCleanup.push(cleanup);
};

// Performance monitoring for tests
const testPerformance = {
  slowTests: new Map<string, number>(),
  testStartTimes: new Map<string, number>()
};

beforeEach(() => {
  const testName = expect.getState().currentTestName;
  if (testName) {
    testPerformance.testStartTimes.set(testName, Date.now());
  }
});

afterEach(() => {
  const testName = expect.getState().currentTestName;
  if (testName) {
    const startTime = testPerformance.testStartTimes.get(testName);
    if (startTime) {
      const duration = Date.now() - startTime;
      
      // Flag slow tests (> 5 seconds)
      if (duration > 5000) {
        testPerformance.slowTests.set(testName, duration);
        console.warn(`Slow test detected: ${testName} took ${duration}ms`);
      }
      
      testPerformance.testStartTimes.delete(testName);
    }
  }
});

afterAll(() => {
  // Report slow tests
  if (testPerformance.slowTests.size > 0) {
    console.log('\n⚠️  Slow tests detected:');
    testPerformance.slowTests.forEach((duration, testName) => {
      console.log(`  ${testName}: ${duration}ms`);
    });
  }
});

// Declare global types for TypeScript
declare global {
  var testUtils: {
    createMock: <T>(implementation?: Partial<T>) => jest.Mocked<T>;
    waitFor: (ms: number) => Promise<void>;
    createTestData: {
      agent: (overrides?: any) => any;
      testSuite: (overrides?: any) => any;
      qualityMetrics: (overrides?: any) => any;
    };
  };
  
  var testCleanup: Array<() => void>;
  var addTestCleanup: (cleanup: () => void) => void;
}
