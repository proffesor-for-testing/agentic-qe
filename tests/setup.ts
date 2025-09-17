/**
 * Jest test setup file for Agentic QE framework
 * Configures global test environment and utilities
 */

import { configureLogger } from '../src/utils/Logger';

// Configure logger for tests
configureLogger({
  level: 'error', // Reduce noise in tests
  console: false,
  file: { enabled: false }
});

// Global test timeout
jest.setTimeout(30000);

// Mock console methods in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toHaveValidTimestamp(): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false
      };
    }
  },

  toHaveValidTimestamp(received: any) {
    const timestamp = received instanceof Date ? received : new Date(received);
    const pass = !isNaN(timestamp.getTime());

    if (pass) {
      return {
        message: () => `expected ${received} not to have a valid timestamp`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to have a valid timestamp`,
        pass: false
      };
    }
  }
});

// Setup and teardown helpers
export const createMockAgent = () => ({
  id: 'test-agent-123',
  name: 'Test Agent',
  type: 'test-executor' as const,
  capabilities: ['test-execution'],
  state: 'idle' as const,
  isAvailable: true,
  execute: jest.fn(),
  destroy: jest.fn(),
  stop: jest.fn()
});

export const createMockSession = () => ({
  id: 'test-session-123',
  name: 'Test Session',
  status: 'active' as const,
  startTime: new Date(),
  testSuites: [],
  agents: [],
  configuration: {
    environment: {
      name: 'test',
      baseUrl: 'http://localhost:3000',
      variables: {}
    }
  },
  results: {
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      passRate: 0,
      duration: 0,
      startTime: new Date(),
      endTime: new Date()
    },
    suites: [],
    artifacts: [],
    metrics: {
      assertions: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    },
    reports: []
  }
});

export const createMockTestCase = () => ({
  id: 'test-case-123',
  name: 'Test Case',
  type: 'unit' as const,
  priority: 'medium' as const,
  steps: [],
  expectedResults: [],
  status: 'pending' as const,
  retryCount: 0,
  tags: ['test']
});

// Cleanup helpers
afterEach(() => {
  jest.clearAllMocks();
});

beforeEach(() => {
  // Reset environment
  process.env.NODE_ENV = 'test';
});