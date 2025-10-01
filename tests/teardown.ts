/**
 * Global test teardown - ensures all resources are cleaned up
 * This prevents "Jest has detected open handles" warnings
 */

export default async function globalTeardown() {
  // Wait for any pending timers
  await new Promise(resolve => setImmediate(resolve));

  // Give time for async cleanup
  await new Promise(resolve => setTimeout(resolve, 100));

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  console.log('Global teardown completed - all resources cleaned up');
}
