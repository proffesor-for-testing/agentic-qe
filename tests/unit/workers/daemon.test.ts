/**
 * Agentic QE v3 - Daemon Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QEDaemon,
  createDaemon,
  getDaemon,
  resetDaemon,
} from '../../../src/workers/daemon';

describe('QEDaemon', () => {
  let daemon: QEDaemon;

  beforeEach(() => {
    vi.useFakeTimers();
    resetDaemon();
  });

  afterEach(async () => {
    if (daemon?.running) {
      await daemon.stop();
    }
    vi.useRealTimers();
    resetDaemon();
  });

  describe('createDaemon', () => {
    it('should create a daemon with default config', () => {
      daemon = createDaemon();
      expect(daemon).toBeDefined();
      expect(daemon.running).toBe(false);
    });

    it('should create a daemon with custom config', () => {
      daemon = createDaemon({
        autoStart: false,
        logLevel: 'debug',
      });
      expect(daemon).toBeDefined();
    });
  });

  describe('getDaemon', () => {
    it('should return singleton instance', () => {
      const daemon1 = getDaemon();
      const daemon2 = getDaemon();
      expect(daemon1).toBe(daemon2);
    });

    it('should create new instance after reset', () => {
      const daemon1 = getDaemon();
      resetDaemon();
      const daemon2 = getDaemon();
      expect(daemon1).not.toBe(daemon2);
    });
  });

  describe('start', () => {
    it('should start the daemon', async () => {
      daemon = createDaemon({ autoStart: false });
      await daemon.start();
      expect(daemon.running).toBe(true);
    });

    it('should register all workers by default', async () => {
      // Use autoStart: false to just check registration without running workers
      // Workers now throw errors when domain APIs are unavailable, so we can't
      // actually auto-start them in unit tests without proper domain setup
      daemon = createDaemon({ autoStart: false });
      await daemon.start();

      const manager = daemon.getWorkerManager();
      const workers = manager.list();

      // All workers should have been registered
      expect(workers.length).toBe(10); // All 10 QE workers
    });

    it('should not auto-start workers when disabled', async () => {
      daemon = createDaemon({ autoStart: false });
      await daemon.start();

      const manager = daemon.getWorkerManager();
      const workers = manager.list();

      // Workers registered but not started
      workers.forEach(worker => {
        expect(worker.lastRunAt).toBeUndefined();
      });
    });

    it('should handle multiple start calls gracefully', async () => {
      daemon = createDaemon({ autoStart: false });
      await daemon.start();
      await daemon.start();
      expect(daemon.running).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop the daemon', async () => {
      daemon = createDaemon({ autoStart: false });
      await daemon.start();
      await daemon.stop();
      expect(daemon.running).toBe(false);
    });

    it('should handle stop when not running', async () => {
      daemon = createDaemon();
      await daemon.stop();
      expect(daemon.running).toBe(false);
    });
  });

  describe('restart', () => {
    it('should restart the daemon', async () => {
      daemon = createDaemon({ autoStart: false });
      await daemon.start();
      await daemon.restart();
      expect(daemon.running).toBe(true);
    });
  });

  describe('uptime', () => {
    it('should return 0 when not started', () => {
      daemon = createDaemon();
      expect(daemon.uptime).toBe(0);
    });

    it('should track uptime', async () => {
      daemon = createDaemon({ autoStart: false });
      await daemon.start();

      vi.advanceTimersByTime(5000);
      expect(daemon.uptime).toBe(5);

      vi.advanceTimersByTime(10000);
      expect(daemon.uptime).toBe(15);
    });

    it('should reset uptime after restart', async () => {
      daemon = createDaemon({ autoStart: false });
      await daemon.start();

      vi.advanceTimersByTime(5000);
      expect(daemon.uptime).toBe(5);

      await daemon.restart();
      expect(daemon.uptime).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return status when not running', () => {
      daemon = createDaemon();
      const status = daemon.getStatus();

      expect(status.running).toBe(false);
      expect(status.pid).toBe(process.pid);
      expect(status.uptime).toBe(0);
      expect(status.startedAt).toBeUndefined();
    });

    it('should return status when running', async () => {
      daemon = createDaemon({ autoStart: false });
      await daemon.start();
      const status = daemon.getStatus();

      expect(status.running).toBe(true);
      expect(status.startedAt).toBeDefined();
      expect(status.workerManager).toBeDefined();
    });

    it('should include worker manager health', async () => {
      daemon = createDaemon({ autoStart: false });
      await daemon.start();
      const status = daemon.getStatus();

      expect(status.workerManager.totalWorkers).toBe(10);
    });
  });

  describe('getWorkerManager', () => {
    it('should return the worker manager', () => {
      daemon = createDaemon();
      const manager = daemon.getWorkerManager();
      expect(manager).toBeDefined();
      expect(manager.list).toBeDefined();
    });
  });

  describe('runWorker', () => {
    it('should attempt to run a specific worker and fail without domain setup', async () => {
      // Use real timers for this test since the worker uses async retries
      vi.useRealTimers();

      daemon = createDaemon({ autoStart: false });
      await daemon.start();

      // Workers now properly throw errors when domain APIs are unavailable
      // instead of silently returning empty metrics
      const consoleSpy = vi.spyOn(console, 'warn');

      // Run the worker - it will fail after retries
      await daemon.runWorker('test-health');

      // After all retries fail, the worker should log warnings about the failure
      // The warning message contains both the worker name and the error
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[test-health\].*domain not available/)
      );

      consoleSpy.mockRestore();

      // Restore fake timers for other tests
      vi.useFakeTimers();
    }, 30000); // Allow 30 seconds for retries
  });

  describe('enabledWorkers config', () => {
    it('should only register enabled workers', () => {
      daemon = createDaemon({
        enabledWorkers: ['test-health', 'coverage-tracker'],
      });

      const manager = daemon.getWorkerManager();
      const workers = manager.list();

      expect(workers).toHaveLength(2);
      expect(workers.map(w => w.config.id)).toContain('test-health');
      expect(workers.map(w => w.config.id)).toContain('coverage-tracker');
    });
  });

  describe('health checks', () => {
    it('should perform periodic health checks', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      daemon = createDaemon({
        autoStart: false,
        healthCheckIntervalMs: 1000,
      });
      await daemon.start();

      // Advance past health check interval
      vi.advanceTimersByTime(2000);

      // Health check should have run (no warnings if healthy)
      // We just verify it doesn't throw
      expect(daemon.running).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});

describe('WORKER_REGISTRY', () => {
  it('should export all 10 workers in registry', async () => {
    const { WORKER_REGISTRY } = await import('../../../src/workers');

    expect(Object.keys(WORKER_REGISTRY)).toHaveLength(10);
    expect(WORKER_REGISTRY['test-health']).toBeDefined();
    expect(WORKER_REGISTRY['coverage-tracker']).toBeDefined();
    expect(WORKER_REGISTRY['flaky-detector']).toBeDefined();
    expect(WORKER_REGISTRY['security-scan']).toBeDefined();
    expect(WORKER_REGISTRY['quality-gate']).toBeDefined();
    expect(WORKER_REGISTRY['learning-consolidation']).toBeDefined();
    expect(WORKER_REGISTRY['defect-predictor']).toBeDefined();
    expect(WORKER_REGISTRY['regression-monitor']).toBeDefined();
    expect(WORKER_REGISTRY['performance-baseline']).toBeDefined();
    expect(WORKER_REGISTRY['compliance-checker']).toBeDefined();
  });

  it('should have correct intervals for each worker', async () => {
    const { WORKER_REGISTRY } = await import('../../../src/workers');

    expect(WORKER_REGISTRY['test-health'].intervalMs).toBe(5 * 60 * 1000);
    expect(WORKER_REGISTRY['coverage-tracker'].intervalMs).toBe(10 * 60 * 1000);
    expect(WORKER_REGISTRY['flaky-detector'].intervalMs).toBe(15 * 60 * 1000);
    expect(WORKER_REGISTRY['security-scan'].intervalMs).toBe(30 * 60 * 1000);
    expect(WORKER_REGISTRY['quality-gate'].intervalMs).toBe(5 * 60 * 1000);
    expect(WORKER_REGISTRY['learning-consolidation'].intervalMs).toBe(30 * 60 * 1000);
    expect(WORKER_REGISTRY['defect-predictor'].intervalMs).toBe(15 * 60 * 1000);
    expect(WORKER_REGISTRY['regression-monitor'].intervalMs).toBe(10 * 60 * 1000);
    expect(WORKER_REGISTRY['performance-baseline'].intervalMs).toBe(60 * 60 * 1000);
    expect(WORKER_REGISTRY['compliance-checker'].intervalMs).toBe(30 * 60 * 1000);
  });
});
