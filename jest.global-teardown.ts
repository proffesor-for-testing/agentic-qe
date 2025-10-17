/**
 * Jest Global Teardown
 *
 * Runs ONCE after ALL test suites complete execution.
 * Performs final cleanup of test environment.
 */

module.exports = async () => {
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  console.log('✅ Global test teardown completed');
};
