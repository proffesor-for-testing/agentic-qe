/**
 * Test setup configuration
 */

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock database for tests
jest.mock('../src/utils/Database', () => {
  return {
    Database: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
      get: jest.fn().mockResolvedValue({}),
      all: jest.fn().mockResolvedValue([])
    }))
  };
});

// Global test timeout
jest.setTimeout(10000);

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