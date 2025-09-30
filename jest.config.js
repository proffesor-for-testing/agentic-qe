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
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@agents/(.*)$': '<rootDir>/src/agents/$1',
    '^@cli/(.*)$': '<rootDir>/src/cli/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1'
  },
  // Memory optimization settings - Enhanced for DevPod
  maxWorkers: 1, // Reduced from 2 to 1 for maximum safety
  workerIdleMemoryLimit: '384MB', // More aggressive: 512MB → 384MB
  testTimeout: 20000, // Increased: 15s → 20s for better cleanup time
  cache: true, // Enable caching to reduce compilation overhead
  cacheDirectory: '/tmp/jest-cache', // Explicit cache location
  maxConcurrency: 2, // Limit concurrent test suites
  bail: false, // Continue on test failures to complete cleanup
  clearMocks: true, // Auto-clear mocks between tests
  resetMocks: true, // Reset mock state between tests
  restoreMocks: true, // Restore original implementations

  // Advanced leak detection - CRITICAL for catching memory issues
  detectLeaks: true, // Enable memory leak detection
  detectOpenHandles: true, // Find unclosed resources
  forceExit: true, // Force exit to prevent hanging

  // Module handling - reduce loading overhead
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/coverage/',
    '<rootDir>/node_modules/.cache/'
  ],

  // Test path ignoring to reduce discovery overhead
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '\\.skip\\.(test|spec)\\.(ts|js)$'
  ],

  // Custom reporters for memory tracking
  reporters: [
    'default',
    ['<rootDir>/tests/utils/memory-reporter.js', {
      enabled: process.env.TRACK_MEMORY === 'true'
    }]
  ],

  globals: {
    'ts-jest': {
      isolatedModules: true, // Faster compilation, less memory
      maxWorkers: 1, // Ensure ts-jest also respects worker limit
      tsconfig: {
        skipLibCheck: true, // Skip library type checking
        skipDefaultLibCheck: true // Skip default library checks
      }
    }
  },

  // Force garbage collection between test files
  testSequencer: '<rootDir>/tests/sequencers/MemorySafeSequencer.js',

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};