/**
 * CI-Optimized Jest Configuration
 * For continuous integration environments with predictable resources
 */

module.exports = {
  ...require('./jest.config.js'),

  // CI-specific settings
  ci: true,
  maxWorkers: 1,
  bail: true,
  forceExit: true,
  detectLeaks: true,

  // Coverage requirements for CI
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // Fail fast in CI
  testTimeout: 10000,

  // Clear output for CI logs
  verbose: true
};