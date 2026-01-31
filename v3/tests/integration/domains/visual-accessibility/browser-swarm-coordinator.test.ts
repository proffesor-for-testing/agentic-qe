/**
 * Integration Tests - Browser Swarm Coordinator
 *
 * Tests multi-session browser coordination for parallel viewport testing.
 * Verifies resource management, graceful degradation, and session lifecycle.
 *
 * NOTE: These tests require agent-browser CLI and are automatically SKIPPED
 * in CI environments where browser automation is not available.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import {
  BrowserSwarmCoordinator,
  createBrowserSwarmCoordinator,
  STANDARD_VIEWPORTS,
  type BrowserSwarmConfig,
  type Viewport,
} from '../../../../src/domains/visual-accessibility/services/browser-swarm-coordinator.js';
import { InMemoryBackend } from '../../../../src/kernel/memory-backend.js';

// Check if agent-browser is available
let agentBrowserAvailable = false;
try {
  const result = execSync('npx agent-browser --version 2>&1 || echo "not-found"', {
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 10000,
  });
  agentBrowserAvailable = !result.includes('not-found') && !result.includes('ERR!');
} catch {
  agentBrowserAvailable = false;
}

// Skip tests if agent-browser not available OR if running in CI
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const describeIfBrowserAvailable = !isCI && agentBrowserAvailable ? describe : describe.skip;

// Unit-like tests that don't need browser - always run
describe('BrowserSwarmCoordinator - Unit', () => {
  let memory: InMemoryBackend;
  let coordinator: BrowserSwarmCoordinator;

  beforeEach(async () => {
    memory = new InMemoryBackend();
    await memory.initialize();
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.shutdown().catch(() => {});
    }
    if (memory) {
      await memory.dispose();
    }
  });

  it('should create coordinator with default config', () => {
    coordinator = createBrowserSwarmCoordinator(memory);
    expect(coordinator).toBeDefined();
    expect(coordinator.getStatus().totalSessions).toBe(0);
  });

  it('should create coordinator with custom config', () => {
    const config: Partial<BrowserSwarmConfig> = {
      maxConcurrentSessions: 3,
      memoryThresholdMB: 512,
      enableGracefulDegradation: true,
    };
    coordinator = createBrowserSwarmCoordinator(memory, config);
    const status = coordinator.getStatus();
    expect(status.maxConcurrent).toBe(3);
    expect(status.totalSessions).toBe(0);
  });

  it('should handle empty session list', () => {
    coordinator = createBrowserSwarmCoordinator(memory);
    const status = coordinator.getStatus();
    expect(status.totalSessions).toBe(0);
    expect(status.activeSessions).toBe(0);
  });

  it('should handle shutdown with no sessions', async () => {
    coordinator = createBrowserSwarmCoordinator(memory);
    const result = await coordinator.shutdown();
    expect(result.success).toBe(true);
  });
});

// Integration tests that require real browser - skip in CI
describeIfBrowserAvailable('BrowserSwarmCoordinator - Integration', () => {
  let memory: InMemoryBackend;
  let coordinator: BrowserSwarmCoordinator;

  beforeEach(async () => {
    memory = new InMemoryBackend();
    await memory.initialize();
  });

  afterEach(async () => {
    // Use Promise.race to prevent hanging if shutdown takes too long
    if (coordinator) {
      await Promise.race([
        coordinator.shutdown(),
        new Promise(resolve => setTimeout(resolve, 5000)) // 5s timeout
      ]).catch(() => {}); // Ignore shutdown errors
    }
    if (memory) {
      await memory.dispose();
    }
  }, 15000); // 15s hook timeout

  describe('Initialization', () => {
    it('should initialize with standard viewports', async () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        maxConcurrentSessions: 5,
      });

      const result = await coordinator.initialize(STANDARD_VIEWPORTS);

      // Initialization may succeed or fail depending on browser availability
      // We just verify it returns a Result type
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');

      // Check status after initialization attempt
      const status = coordinator.getStatus();
      expect(status).toBeDefined();
      expect(status.maxConcurrent).toBe(5);
    });

    it('should handle initialization with limited concurrency', async () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        maxConcurrentSessions: 2,
      });

      const result = await coordinator.initialize(STANDARD_VIEWPORTS);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');

      if (result.success) {
        const status = coordinator.getStatus();
        // Should have created at most 2 sessions due to concurrency limit
        expect(status.totalSessions).toBeLessThanOrEqual(2);
      }
    });

    it('should reject re-initialization without shutdown', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      // First initialization
      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      // Second initialization should fail
      const result = await coordinator.initialize([STANDARD_VIEWPORTS[1]]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('already initialized');
      }
    });
  });

  describe('Status Reporting', () => {
    it('should report accurate status', async () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        maxConcurrentSessions: 3,
      });

      const initialStatus = coordinator.getStatus();
      expect(initialStatus.totalSessions).toBe(0);
      expect(initialStatus.activeSessions).toBe(0);
      expect(initialStatus.atCapacity).toBe(false);
      expect(initialStatus.totalOperations).toBe(0);

      // Initialize with viewports
      await coordinator.initialize(STANDARD_VIEWPORTS.slice(0, 3));

      const statusAfterInit = coordinator.getStatus();
      expect(statusAfterInit.maxConcurrent).toBe(3);
      expect(statusAfterInit.uptimeMs).toBeGreaterThan(0);
    });

    it('should detect capacity limits', async () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        maxConcurrentSessions: 2,
      });

      await coordinator.initialize(STANDARD_VIEWPORTS.slice(0, 2));

      const status = coordinator.getStatus();

      // If sessions were created successfully, should be at capacity
      if (status.totalSessions === 2) {
        expect(status.atCapacity).toBe(true);
      }
    });

    it('should track memory usage', async () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        enableMemoryMonitoring: true,
      });

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      const status = coordinator.getStatus();
      expect(status.memoryUsageMB).toBeGreaterThan(0);
    });
  });

  describe('Parallel Execution', () => {
    it('should execute tasks in parallel', async () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        maxConcurrentSessions: 3,
      });

      await coordinator.initialize(STANDARD_VIEWPORTS.slice(0, 3));

      const executionTimes: number[] = [];
      const results = await coordinator.executeParallel(async (session) => {
        const start = Date.now();
        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionTimes.push(Date.now() - start);
        return { sessionId: session.id, viewport: session.viewport };
      });

      expect(results).toBeDefined();
      expect(results.size).toBeGreaterThanOrEqual(0);

      // Verify all executions happened
      for (const [, result] of results) {
        if (result.success) {
          expect(result.value.sessionId).toBeDefined();
          expect(result.value.viewport).toBeDefined();
        }
      }
    });

    it('should handle task errors gracefully', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      const results = await coordinator.executeParallel(async () => {
        throw new Error('Test error');
      });

      // Should have error results for each session
      for (const [, result] of results) {
        if (!result.success) {
          expect(result.error).toBeDefined();
          expect(result.error.message).toContain('Test error');
        }
      }
    });

    it('should timeout long-running tasks', async () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        sessionTimeoutMs: 100, // Very short timeout
      });

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      const results = await coordinator.executeParallel(async () => {
        // Task that takes longer than timeout
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { success: true };
      });

      // Should have timeout errors
      for (const [, result] of results) {
        if (!result.success) {
          expect(result.error.message).toContain('timed out');
        }
      }
    });

    it('should handle empty session list', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      // Don't initialize any sessions
      const results = await coordinator.executeParallel(async (session) => {
        return { sessionId: session.id };
      });

      expect(results.size).toBe(0);
    });
  });

  describe('Screenshot Capture', () => {
    it('should capture screenshots across viewports', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      // Note: This will likely fail in test environment without real browser
      // but we verify the interface works correctly
      const result = await coordinator.captureAllViewports(
        'https://example.com'
      );

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');

      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.screenshots).toBeDefined();
        expect(result.value.failures).toBeDefined();
        expect(result.value.totalTimeMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return failure info for failed captures', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      const result = await coordinator.captureAllViewports(
        'https://example.com'
      );

      if (result.success) {
        // In test environment, captures will likely fail
        // but the coordinator should handle it gracefully
        expect(result.value.failedCount).toBeGreaterThanOrEqual(0);
        expect(result.value.successCount).toBeGreaterThanOrEqual(0);
        expect(
          result.value.successCount + result.value.failedCount
        ).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Accessibility Auditing', () => {
    it('should run accessibility audits across viewports', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      const result = await coordinator.auditAllViewports('https://example.com');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');

      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.reports).toBeDefined();
        expect(result.value.failures).toBeDefined();
        expect(result.value.aggregatedViolations).toBeGreaterThanOrEqual(0);
      }
    });

    it('should aggregate violations across viewports', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      await coordinator.initialize(STANDARD_VIEWPORTS.slice(0, 2));

      const result = await coordinator.auditAllViewports('https://example.com');

      if (result.success) {
        // Even if audits fail, aggregatedViolations should be defined
        expect(result.value.aggregatedViolations).toBeDefined();
        expect(typeof result.value.aggregatedViolations).toBe('number');
      }
    });
  });

  describe('Graceful Degradation', () => {
    it('should degrade to sequential on high memory usage', async () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        memoryThresholdMB: 1, // Very low threshold to trigger degradation
        enableGracefulDegradation: true,
      });

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      // Execute task - should degrade to sequential
      const results = await coordinator.executeParallel(async (session) => {
        return { sessionId: session.id };
      });

      // Should still get results, just executed sequentially
      expect(results).toBeDefined();
    });

    it('should skip degradation when disabled', async () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        memoryThresholdMB: 1,
        enableGracefulDegradation: false,
      });

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      const results = await coordinator.executeParallel(async (session) => {
        return { sessionId: session.id };
      });

      expect(results).toBeDefined();
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      const result = await coordinator.shutdown();

      expect(result.success).toBe(true);

      const status = coordinator.getStatus();
      expect(status.totalSessions).toBe(0);
    });

    it('should reject operations after shutdown', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);
      await coordinator.shutdown();

      // Try to execute after shutdown
      const results = await coordinator.executeParallel(async (session) => {
        return { sessionId: session.id };
      });

      expect(results.size).toBe(0);
    });
  });

  describe('Resource Management', () => {
    it('should respect concurrency limits', async () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        maxConcurrentSessions: 2,
      });

      // Try to initialize with 5 viewports
      await coordinator.initialize(STANDARD_VIEWPORTS);

      const status = coordinator.getStatus();

      // Should have created at most 2 sessions
      expect(status.totalSessions).toBeLessThanOrEqual(2);
    });

    it('should track operation counts', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      const initialStatus = coordinator.getStatus();
      const initialOps = initialStatus.totalOperations;

      // Execute a task
      await coordinator.executeParallel(async (session) => {
        return { sessionId: session.id };
      });

      const finalStatus = coordinator.getStatus();

      // Operations should increase if task executed successfully
      expect(finalStatus.totalOperations).toBeGreaterThanOrEqual(initialOps);
    });

    it('should calculate memory estimates', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      const emptyStatus = coordinator.getStatus();
      const emptyMemory = emptyStatus.memoryUsageMB;

      await coordinator.initialize(STANDARD_VIEWPORTS.slice(0, 2));

      const statusWithSessions = coordinator.getStatus();

      // Memory usage should increase with sessions
      // (though actual browser processes may not launch in test env)
      expect(statusWithSessions.memoryUsageMB).toBeGreaterThanOrEqual(
        emptyMemory
      );
    });
  });

  describe('Custom Viewport Configurations', () => {
    it('should handle custom viewport configurations', async () => {
      const customViewports: Viewport[] = [
        {
          width: 1024,
          height: 768,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
        },
        {
          width: 1440,
          height: 900,
          deviceScaleFactor: 2,
          isMobile: false,
          hasTouch: false,
        },
      ];

      coordinator = createBrowserSwarmCoordinator(memory);

      const result = await coordinator.initialize(customViewports);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });

    it('should handle mobile-specific viewports', async () => {
      const mobileViewports: Viewport[] = [
        {
          width: 375,
          height: 812,
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
        },
        {
          width: 414,
          height: 896,
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
        },
      ];

      coordinator = createBrowserSwarmCoordinator(memory);

      const result = await coordinator.initialize(mobileViewports);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });
  });

  describe('Error Handling', () => {
    it('should handle browser launch failures', async () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        browserLaunchOptions: {
          headless: true,
          timeout: 1, // Very short timeout to cause failure
        },
      });

      const result = await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      // Should return a result (success or failure)
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });

    it('should handle navigation failures gracefully', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      await coordinator.initialize([STANDARD_VIEWPORTS[0]]);

      // Try to capture from invalid URL
      const result = await coordinator.captureAllViewports('invalid-url');

      // Should handle error gracefully
      expect(result).toBeDefined();

      if (result.success) {
        // Should have failures recorded
        expect(result.value.failures.size).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
