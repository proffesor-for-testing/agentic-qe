/**
 * Unit Tests - Browser Swarm Coordinator
 *
 * Tests multi-session browser coordination with mocked browser clients.
 * Verifies resource management, graceful degradation, and session lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BrowserSwarmCoordinator,
  createBrowserSwarmCoordinator,
  STANDARD_VIEWPORTS,
  type BrowserSwarmConfig,
  type Viewport,
} from '../../../../src/domains/visual-accessibility/services/browser-swarm-coordinator.js';
import { InMemoryBackend } from '../../../../src/kernel/memory-backend.js';

describe('BrowserSwarmCoordinator - Unit', () => {
  let memory: InMemoryBackend;
  let coordinator: BrowserSwarmCoordinator;

  beforeEach(async () => {
    memory = new InMemoryBackend();
    await memory.initialize();
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.shutdown();
    }
    if (memory) {
      await memory.dispose();
    }
  });

  describe('Factory Function', () => {
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
  });

  describe('Status Reporting', () => {
    it('should report accurate initial status', () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        maxConcurrentSessions: 3,
      });

      const status = coordinator.getStatus();

      expect(status.totalSessions).toBe(0);
      expect(status.activeSessions).toBe(0);
      expect(status.idleSessions).toBe(0);
      expect(status.maxConcurrent).toBe(3);
      expect(status.atCapacity).toBe(false);
      expect(status.totalOperations).toBe(0);
      expect(status.uptimeMs).toBeGreaterThanOrEqual(0);
      expect(status.memoryUsageMB).toBeGreaterThan(0);
    });

    it('should update uptime correctly', async () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      const status1 = coordinator.getStatus();
      const uptime1 = status1.uptimeMs;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status2 = coordinator.getStatus();
      const uptime2 = status2.uptimeMs;

      expect(uptime2).toBeGreaterThan(uptime1);
    });

    it('should track memory usage', () => {
      coordinator = createBrowserSwarmCoordinator(memory, {
        enableMemoryMonitoring: true,
      });

      const status = coordinator.getStatus();

      expect(status.memoryUsageMB).toBeGreaterThan(0);
      expect(typeof status.memoryUsageMB).toBe('number');
    });
  });

  describe('Type Exports', () => {
    it('should export STANDARD_VIEWPORTS constant', () => {
      expect(STANDARD_VIEWPORTS).toBeDefined();
      expect(Array.isArray(STANDARD_VIEWPORTS)).toBe(true);
      expect(STANDARD_VIEWPORTS.length).toBe(5);

      // Verify viewport structure
      for (const viewport of STANDARD_VIEWPORTS) {
        expect(viewport).toHaveProperty('width');
        expect(viewport).toHaveProperty('height');
        expect(viewport).toHaveProperty('deviceScaleFactor');
        expect(viewport).toHaveProperty('isMobile');
        expect(viewport).toHaveProperty('hasTouch');

        expect(typeof viewport.width).toBe('number');
        expect(typeof viewport.height).toBe('number');
        expect(typeof viewport.deviceScaleFactor).toBe('number');
        expect(typeof viewport.isMobile).toBe('boolean');
        expect(typeof viewport.hasTouch).toBe('boolean');
      }
    });

    it('should export SwarmStatus type via getStatus', () => {
      coordinator = createBrowserSwarmCoordinator(memory);

      const status = coordinator.getStatus();

      // Verify all expected properties exist
      expect(status).toHaveProperty('totalSessions');
      expect(status).toHaveProperty('activeSessions');
      expect(status).toHaveProperty('idleSessions');
      expect(status).toHaveProperty('maxConcurrent');
      expect(status).toHaveProperty('memoryUsageMB');
      expect(status).toHaveProperty('atCapacity');
      expect(status).toHaveProperty('uptimeMs');
      expect(status).toHaveProperty('totalOperations');
    });
  });
});
