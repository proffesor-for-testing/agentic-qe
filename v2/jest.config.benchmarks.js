/**
 * Separate Jest config for benchmark tests
 *
 * These tests corrupt tree-sitter native module state and must run
 * in complete isolation from other tests.
 */
process.env.NODE_ENV = 'test';

module.exports = {
  displayName: 'benchmarks',
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Only run benchmark tests (both in benchmarks/ folder and files named benchmarks.test.ts)
  testMatch: [
    '**/benchmarks/**/*.test.ts',
    '**/*benchmarks.test.ts'
  ],

  roots: ['<rootDir>/tests'],

  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        skipLibCheck: true,
        skipDefaultLibCheck: true
      },
      isolatedModules: true
    }]
  },

  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts', '<rootDir>/tests/setup.ts'],

  globalSetup: '<rootDir>/jest.global-setup.ts',
  globalTeardown: '<rootDir>/jest.global-teardown.ts',

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@agents/(.*)$': '<rootDir>/src/agents/$1',
    '^@types$': '<rootDir>/src/types/index.ts',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    // Mock agentdb ESM module
    '^agentdb$': '<rootDir>/__mocks__/agentdb.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },

  // Run in isolation
  maxWorkers: 1,
  testTimeout: 30000,
  cache: false, // Don't cache to avoid state pollution

  transformIgnorePatterns: [
    'node_modules/(?!(@faker-js|uuid|agentdb)/)'
  ]
};
