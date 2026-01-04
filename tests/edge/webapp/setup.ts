/**
 * Webapp Test Setup
 *
 * Setup file for React component and hook tests.
 * Configures testing-library and mocks browser APIs.
 *
 * @module tests/edge/webapp/setup
 */

import '@testing-library/jest-dom';

// Re-export mock helpers from the __mocks__ folder for test convenience
export {
  mockServiceInstance,
  __test__,
  resetP2PService
} from '../../../src/edge/webapp/services/__mocks__/P2PService';

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

global.IntersectionObserver = MockIntersectionObserver as any;

// Mock ResizeObserver
class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

global.ResizeObserver = MockResizeObserver as any;

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock crypto for generateAgentId
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  },
});

// Mock performance.memory (Chrome-specific)
Object.defineProperty(performance, 'memory', {
  value: {
    usedJSHeapSize: 50 * 1024 * 1024,
    totalJSHeapSize: 100 * 1024 * 1024,
    jsHeapSizeLimit: 2 * 1024 * 1024 * 1024,
  },
  writable: true,
});

// Suppress console.log during tests
// Uncomment if you want to suppress logs
// jest.spyOn(console, 'log').mockImplementation(() => {});
// jest.spyOn(console, 'error').mockImplementation(() => {});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
