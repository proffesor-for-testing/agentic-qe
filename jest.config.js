module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/*.(test|spec).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  globalSetup: '<rootDir>/tests/setup/global-setup.ts',
  globalTeardown: '<rootDir>/tests/setup/global-setup.ts',
  testTimeout: 30000,
  maxWorkers: 4,
  // Enhanced configuration for comprehensive testing
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  // Fail tests on console errors/warnings in CI
  ...(process.env.CI && {
    verbose: true,
    bail: 1,
    detectOpenHandles: true,
    detectLeaks: true,
    forceExit: true
  }),
  // Test environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  // Coverage thresholds for quality gates
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Stricter thresholds for core modules
    './src/memory/': {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85
    },
    './src/advanced/': {
      branches: 80,
      functions: 85,
      lines: 80,
      statements: 80
    }
  }
};