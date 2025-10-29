/**
 * Test setup configuration
 */

// CRITICAL FIX: Cache working directory before graceful-fs patches it
// This prevents ENOENT: uv_cwd errors during parallel test loading
const CACHED_CWD = (() => {
  try {
    // Get original process.cwd before any patching
    const originalCwd = process.cwd.bind(process);
    const cwd = originalCwd();

    if (!cwd || cwd === '') {
      throw new Error('Working directory is not accessible');
    }

    // Cache it and create a stable wrapper
    const cachedCwd = cwd;

    // Override process.cwd with cached version to prevent race conditions
    const originalProcessCwd = process.cwd;
    process.cwd = function() {
      try {
        return originalProcessCwd.call(this);
      } catch (err) {
        // Fallback to cached value if graceful-fs fails
        return cachedCwd;
      }
    };

    return cachedCwd;
  } catch (error) {
    console.error('CRITICAL: Cannot access working directory:', error);
    process.exit(1);
  }
})();

// Verify working directory is accessible
if (!CACHED_CWD || CACHED_CWD === '') {
  console.error('CRITICAL: Working directory cache failed');
  process.exit(1);
}

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock database for tests
jest.mock('../src/utils/Database', () => {
  return {
    Database: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      exec: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
      get: jest.fn().mockResolvedValue({}),
      all: jest.fn().mockResolvedValue([]),
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn().mockReturnValue([])
      }),
      stats: jest.fn().mockResolvedValue({
        total: 0,
        active: 0,
        size: 1024,
        tables: 15,
        lastModified: new Date()
      }),
      compact: jest.fn().mockResolvedValue(undefined),
      upsertFleet: jest.fn().mockResolvedValue(undefined),
      upsertAgent: jest.fn().mockResolvedValue(undefined),
      upsertTask: jest.fn().mockResolvedValue(undefined),
      insertEvent: jest.fn().mockResolvedValue(undefined),
      insertMetric: jest.fn().mockResolvedValue(undefined)
    }))
  };
});

// Logger is mocked via manual mock in src/utils/__mocks__/Logger.ts
// This is automatically used when jest.mock('@utils/Logger') is called in test files

// Global test timeout
jest.setTimeout(30000);

// Global teardown - clear all timers and async operations
afterEach(() => {
  // Clear all timers
  jest.clearAllTimers();
  // Clear all mocks
  jest.clearAllMocks();
});

// Force cleanup at the end of all tests
afterAll(async () => {
  // Wait for pending promises
  await new Promise(resolve => setImmediate(resolve));

  // Clear all timers
  jest.clearAllTimers();

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});