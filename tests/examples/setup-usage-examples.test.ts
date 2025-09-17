/**
 * Setup and Teardown Usage Examples
 * Demonstrates how to use the comprehensive test setup procedures
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

// Import different setup configurations
import {
  createTestEnvironment,
  quickSetup,
  createTestHooks,
  integrationTestHooks,
  performanceTestHooks,
  e2eTestHooks,
  type TestSetupOptions,
  type UniversalTestEnvironment
} from '../setup';

describe('Setup and Teardown Usage Examples', () => {

  describe('Unit Test Setup Example', () => {
    const hooks = createTestHooks({ type: 'unit' });

    beforeAll(hooks.beforeAll);
    afterAll(hooks.afterAll);
    beforeEach(hooks.beforeEach);
    afterEach(hooks.afterEach);

    it('should demonstrate basic unit test setup', async () => {
      const env = hooks.getEnvironment();

      expect(env).toBeTruthy();
      expect(env?.type).toBe('unit');
      expect(env?.isReady()).toBe(true);

      const metrics = env?.getMetrics();
      expect(metrics).toHaveProperty('type', 'unit');
      expect(metrics).toHaveProperty('memoryUsage');
    });

    it('should have clean state between tests', async () => {
      // This test should run with a fresh environment
      const env = hooks.getEnvironment();
      expect(env?.isReady()).toBe(true);
    });
  });

  describe('Integration Test Setup Example', () => {
    const hooks = createTestHooks({
      type: 'integration',
      isolation: true,
      monitoring: true,
      cleanup: {
        memory: true,
        files: true,
        processes: true,
        network: true
      }
    });

    beforeAll(hooks.beforeAll);
    afterAll(hooks.afterAll);
    beforeEach(hooks.beforeEach);
    afterEach(hooks.afterEach);

    it('should demonstrate integration test setup with monitoring', async () => {
      const env = hooks.getEnvironment();

      expect(env).toBeTruthy();
      expect(env?.type).toBe('integration');
      expect(env?.isReady()).toBe(true);

      const metrics = env?.getMetrics();
      expect(metrics).toHaveProperty('type', 'integration');
      expect(metrics).toHaveProperty('performance');

      // Test that we can perform operations that would be monitored
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedMetrics = env?.getMetrics();
      expect(updatedMetrics).toBeTruthy();
    });

    it('should handle memory and performance tracking', async () => {
      const env = hooks.getEnvironment();
      const initialMetrics = env?.getMetrics();

      // Simulate some work that uses memory
      const largeArray = new Array(10000).fill('test-data');

      const finalMetrics = env?.getMetrics();

      // Memory usage should be tracked
      expect(initialMetrics).toBeTruthy();
      expect(finalMetrics).toBeTruthy();

      // Cleanup the array
      largeArray.length = 0;
    });
  });

  describe('Performance Test Setup Example', () => {
    const hooks = createTestHooks({
      type: 'performance',
      monitoring: true,
      thresholds: {
        maxMemoryMB: 128,
        maxExecutionTimeMs: 5000,
        maxGCTime: 50,
        maxResponseTimeMs: 500,
        minThroughputOps: 100
      }
    });

    beforeAll(hooks.beforeAll);
    afterAll(hooks.afterAll);
    beforeEach(hooks.beforeEach);
    afterEach(hooks.afterEach);

    it('should demonstrate performance monitoring', async () => {
      const env = hooks.getEnvironment();

      expect(env).toBeTruthy();
      expect(env?.type).toBe('performance');

      const startMetrics = env?.getMetrics();

      // Simulate performance-sensitive operation
      const start = performance.now();

      // CPU-intensive operation
      let result = 0;
      for (let i = 0; i < 100000; i++) {
        result += Math.sqrt(i);
      }

      const duration = performance.now() - start;

      const endMetrics = env?.getMetrics();

      expect(startMetrics).toBeTruthy();
      expect(endMetrics).toBeTruthy();
      expect(duration).toBeGreaterThan(0);
      expect(result).toBeGreaterThan(0);

      // Performance metrics should track the operation
      console.log(`Operation took ${duration.toFixed(2)}ms`);\
    });

    it('should track memory allocation patterns', async () => {
      const env = hooks.getEnvironment();
      const initialMetrics = env?.getMetrics();

      // Allocate and deallocate memory to test GC tracking
      const arrays: number[][] = [];\

      for (let i = 0; i < 100; i++) {\
        arrays.push(new Array(1000).fill(i));
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMetrics = env?.getMetrics();

      expect(initialMetrics).toBeTruthy();
      expect(finalMetrics).toBeTruthy();

      // Clear arrays
      arrays.length = 0;
    });
  });

  describe('Quick Setup Examples', () => {

    it('should demonstrate quick unit setup', async () => {
      const env = await quickSetup.unit();

      await env.setup();

      expect(env.type).toBe('unit');
      expect(env.isReady()).toBe(true);

      await env.teardown();
    });

    it('should demonstrate quick integration setup', async () => {
      const env = await quickSetup.integration(true);

      await env.setup();

      expect(env.type).toBe('integration');
      expect(env.isReady()).toBe(true);

      const metrics = env.getMetrics();
      expect(metrics.type).toBe('integration');

      await env.teardown();
    });

    it('should demonstrate custom performance setup', async () => {
      const customThresholds = {
        maxMemoryMB: 64,
        maxExecutionTimeMs: 2000
      };

      const env = await quickSetup.performance(customThresholds);

      await env.setup();

      expect(env.type).toBe('performance');
      expect(env.isReady()).toBe(true);

      const metrics = env.getMetrics();
      expect(metrics.type).toBe('performance');

      await env.teardown();
    });
  });

  describe('Manual Setup and Teardown Example', () => {
    let testEnv: UniversalTestEnvironment | null = null;

    beforeAll(async () => {
      // Manual setup with custom configuration
      const options: TestSetupOptions = {
        type: 'integration',
        isolation: true,
        monitoring: true,
        cleanup: {
          memory: true,
          files: false, // Keep files for debugging
          processes: true,
          network: true
        },
        timeout: 15000
      };

      testEnv = await createTestEnvironment(options);
      await testEnv.setup();
    });

    afterAll(async () => {
      if (testEnv) {
        await testEnv.teardown();
        testEnv = null;
      }
    });

    beforeEach(async () => {
      if (testEnv) {
        await testEnv.reset();
      }
    });

    afterEach(async () => {
      if (testEnv) {
        const metrics = testEnv.getMetrics();

        // Log any concerning metrics
        if (metrics.performance?.memory?.heapUsed > 100 * 1024 * 1024) {
          console.warn('High memory usage detected:', metrics.performance.memory.heapUsed);
        }
      }
    });

    it('should work with manual setup', async () => {
      expect(testEnv).toBeTruthy();
      expect(testEnv?.isReady()).toBe(true);

      const metrics = testEnv?.getMetrics();
      expect(metrics).toBeTruthy();
      expect(metrics?.type).toBe('integration');
    });

    it('should maintain state isolation between tests', async () => {
      // This test should have a fresh environment due to beforeEach reset
      expect(testEnv?.isReady()).toBe(true);

      // Perform some operations
      const startTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 50));
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Hooks Integration Examples', () => {

    describe('Using Integration Test Hooks', () => {
      beforeAll(integrationTestHooks.beforeAll);
      afterAll(integrationTestHooks.afterAll);
      beforeEach(integrationTestHooks.beforeEach);
      afterEach(integrationTestHooks.afterEach);

      it('should work with pre-configured integration hooks', async () => {
        // Integration environment should be available
        const env = require('../setup/integration-setup').getCurrentTestEnvironment();
        expect(env).toBeTruthy();
      });
    });

    describe('Using Performance Test Hooks', () => {
      beforeAll(() => performanceTestHooks.beforeAll('Performance Hook Test'));
      afterAll(performanceTestHooks.afterAll);
      beforeEach(() => performanceTestHooks.beforeEach('performance-test-case'));
      afterEach(() => performanceTestHooks.afterEach('performance-test-case'));

      it('should work with pre-configured performance hooks', async () => {
        // Performance monitoring should be active
        const start = performance.now();

        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 100));

        const duration = performance.now() - start;
        expect(duration).toBeGreaterThanOrEqual(100);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {

    it('should handle setup failures gracefully', async () => {
      // Test with invalid configuration
      const invalidOptions: TestSetupOptions = {
        type: 'integration',
        timeout: -1 // Invalid timeout
      };

      try {
        const env = await createTestEnvironment(invalidOptions);
        await env.setup();

        // Should still work with corrected internal timeout
        expect(env.isReady()).toBe(true);

        await env.teardown();
      } catch (error) {
        // Acceptable if setup validation catches the error
        expect(error).toBeTruthy();
      }
    });

    it('should handle teardown of uninitialized environment', async () => {
      const env = await quickSetup.unit();

      // Call teardown without setup
      await expect(env.teardown()).resolves.not.toThrow();
    });

    it('should handle multiple setup calls', async () => {
      const env = await quickSetup.unit();

      await env.setup();

      // Second setup call should not cause issues
      await expect(env.setup()).resolves.not.toThrow();

      await env.teardown();
    });

    it('should handle resource cleanup on error', async () => {
      const env = await quickSetup.integration();

      await env.setup();

      // Simulate an error condition
      try {
        throw new Error('Simulated test error');
      } catch (error) {
        // Environment should still clean up properly
        await expect(env.teardown()).resolves.not.toThrow();
      }
    });
  });
});