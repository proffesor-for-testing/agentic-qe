/**
 * Jest Global Setup
 *
 * Runs ONCE before ALL test suites begin execution.
 * Sets up the test environment to prevent process.cwd() errors.
 */

const path = require('path');

module.exports = async () => {
  // Set working directory explicitly
  const WORKSPACE_ROOT = '/workspaces/agentic-qe-cf';

  try {
    process.chdir(WORKSPACE_ROOT);
    console.log('✅ Global test environment initialized');
    console.log(`   Working directory: ${process.cwd()}`);
  } catch (error) {
    console.error('❌ Failed to set working directory:', error);
    throw error;
  }

  // Set environment variables
  process.env.INIT_CWD = WORKSPACE_ROOT;
  process.env.PWD = WORKSPACE_ROOT;
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';

  // Mock process.cwd globally before any modules load
  const originalCwd = process.cwd.bind(process);
  process.cwd = function() {
    try {
      const cwd = originalCwd();
      return cwd && cwd !== '' ? cwd : WORKSPACE_ROOT;
    } catch (error) {
      // Fallback to workspace root if cwd fails
      return WORKSPACE_ROOT;
    }
  };
};
