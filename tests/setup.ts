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