/**
 * Jest Global Teardown
 *
 * Runs ONCE after ALL test suites complete execution.
 * Performs final cleanup of test environment to prevent memory leaks.
 */

module.exports = async () => {
  console.log('🧹 Global teardown: Cleaning up resources...');

  // Dynamic import to avoid issues with module resolution
  const { MemoryManager } = require('./src/core/MemoryManager');

  try {
    // Get count of active MemoryManager instances before cleanup
    const instanceCount = MemoryManager.getInstanceCount();
    if (instanceCount > 0) {
      console.log(`Found ${instanceCount} active MemoryManager instances`);

      // Cleanup all MemoryManager instances with timeout
      await Promise.race([
        MemoryManager.shutdownAll(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('MemoryManager cleanup timeout')), 5000)
        )
      ]);

      console.log('✅ All MemoryManager instances cleaned up');
    } else {
      console.log('✅ No active MemoryManager instances found');
    }
  } catch (error: any) {
    console.warn('⚠️  MemoryManager cleanup failed:', error.message);
  }

  // Wait for pending handles to close
  await new Promise(resolve => setTimeout(resolve, 100));

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    console.log('♻️  Forced garbage collection');
  }

  console.log('✅ Global teardown complete');
};
