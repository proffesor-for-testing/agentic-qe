/**
 * Jest Configuration for Webapp Tests
 *
 * Separate configuration for React component and hook tests
 * that require jsdom environment and React Testing Library.
 *
 * Usage:
 *   npm run test:webapp
 *   jest --config jest.config.webapp.js
 *
 * Dependencies (install if not present):
 *   npm install -D @testing-library/react @testing-library/jest-dom jest-environment-jsdom
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',

  roots: ['<rootDir>/tests/edge/webapp', '<rootDir>/src/edge/webapp'],
  testMatch: [
    '**/tests/**/*.(test|spec).+(ts|tsx)',
  ],

  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        skipLibCheck: true,
        skipDefaultLibCheck: true,
      },
      isolatedModules: true,
    }],
  },

  setupFilesAfterEnv: ['<rootDir>/tests/edge/webapp/setup.ts'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // CSS modules mock
    '\\.css$': 'identity-obj-proxy',
    // Map .js imports to .ts source files
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Force P2PService to use mock - works for both relative and absolute imports
    '^(.*/)?services/P2PService(\\.ts)?$': '<rootDir>/src/edge/webapp/services/__mocks__/P2PService.ts',
  },

  // Transform ESM modules
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)',
  ],

  // Test configuration
  testTimeout: 10000,
  // Don't auto-reset mocks as it breaks our mock implementations
  clearMocks: false,
  resetMocks: false,
  restoreMocks: false,

  // Coverage for webapp
  collectCoverageFrom: [
    'src/edge/webapp/**/*.{ts,tsx}',
    '!src/edge/webapp/**/*.d.ts',
    '!src/edge/webapp/**/index.ts',
  ],

  // Reporter settings
  reporters: ['default'],
};
