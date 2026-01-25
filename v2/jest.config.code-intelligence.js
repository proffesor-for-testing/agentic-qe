/**
 * Separate Jest config for code-intelligence tests
 *
 * Tree-sitter native module state gets corrupted when multiple test files
 * load it in the same process. These tests MUST run in complete isolation.
 */
process.env.NODE_ENV = 'test';

module.exports = {
  displayName: 'code-intelligence',
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Run code-intelligence tests
  testMatch: [
    '**/tests/code-intelligence/**/*.test.ts'
  ],

  // Exclude benchmarks (they run separately)
  testPathIgnorePatterns: [
    '/benchmarks/',
    'benchmarks\\.test\\.(ts|js)$'
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

  globalSetup: '<rootDir>/jest.global-setup.ts',
  globalTeardown: '<rootDir>/jest.global-teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts', '<rootDir>/tests/setup.ts'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@agents/(.*)$': '<rootDir>/src/agents/$1',
    '^@types$': '<rootDir>/src/types/index.ts',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^agentdb$': '<rootDir>/__mocks__/agentdb.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },

  // CRITICAL: Run each test file in its own worker to avoid native module corruption
  maxWorkers: 1,
  workerIdleMemoryLimit: '1MB', // Force worker restart after each test file
  testTimeout: 60000,

  transformIgnorePatterns: [
    'node_modules/(?!(@faker-js|uuid|agentdb)/)'
  ]
};
