/**
 * Ultra-Safe Jest Configuration
 * For environments with severe memory constraints (< 1GB available)
 */

module.exports = {
  ...require('./jest.config.js'),

  // Override with ultra-conservative settings
  maxWorkers: 1,
  workerIdleMemoryLimit: '256MB',

  // Force serial execution
  bail: true,
  detectLeaks: true,
  detectOpenHandles: true,
  forceExit: true,

  // Minimal coverage
  collectCoverage: false,

  // Disable caching to prevent memory buildup
  cache: false,

  // Only test critical paths
  testMatch: [
    '**/tests/unit/**/*.test.ts',
    '!**/tests/integration/**',
    '!**/tests/performance/**'
  ]
};