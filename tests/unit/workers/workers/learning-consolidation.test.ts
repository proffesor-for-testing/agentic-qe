/**
 * Agentic QE v3 - Learning Consolidation Worker Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 *
 * TDD Tests for LearningConsolidationWorker
 * Tests learning pattern consolidation and optimization
 *
 * NOTE: This worker has complex dependencies on DreamEngine and database
 * connections that require integration tests for full coverage.
 * Unit tests focus on instantiation and lifecycle methods.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LearningConsolidationWorker } from '../../../../src/workers/workers/learning-consolidation';

describe('LearningConsolidationWorker', () => {
  let worker: LearningConsolidationWorker;

  beforeEach(() => {
    worker = new LearningConsolidationWorker();
  });

  describe('instantiation', () => {
    it('should be instantiated with correct config', () => {
      expect(worker.config.id).toBe('learning-consolidation');
      expect(worker.config.name).toBe('Learning Consolidation');
      expect(worker.config.priority).toBe('normal');
      expect(worker.config.targetDomains).toContain('learning-optimization');
    });

    it('should have 30 minute interval', () => {
      expect(worker.config.intervalMs).toBe(30 * 60 * 1000);
    });

    it('should have correct timeout and retry settings', () => {
      expect(worker.config.timeoutMs).toBe(300000);
      expect(worker.config.retryCount).toBe(2);
      expect(worker.config.retryDelayMs).toBe(30000);
    });

    it('should start in idle status', () => {
      expect(worker.status).toBe('idle');
    });

    it('should be enabled by default', () => {
      expect(worker.config.enabled).toBe(true);
    });

    it('should have description', () => {
      expect(worker.config.description).toContain('Consolidates learning patterns');
    });
  });

  describe('lifecycle methods', () => {
    it('should initialize correctly', async () => {
      await worker.initialize();
      expect(worker.status).toBe('idle');
      expect(worker.nextRunAt).toBeDefined();
    });

    it('should set nextRunAt based on interval', async () => {
      const before = Date.now();
      await worker.initialize();
      const expectedMinTime = before + worker.config.intervalMs;

      expect(worker.nextRunAt).toBeDefined();
      expect(worker.nextRunAt!.getTime()).toBeGreaterThanOrEqual(before + worker.config.intervalMs - 100);
      expect(worker.nextRunAt!.getTime()).toBeLessThanOrEqual(expectedMinTime + 100);
    });

    it('should pause worker', () => {
      worker.pause();
      expect(worker.status).toBe('paused');
    });

    it('should resume worker from paused state', () => {
      worker.pause();
      expect(worker.status).toBe('paused');

      worker.resume();
      expect(worker.status).toBe('idle');
    });

    it('should not resume if not paused', () => {
      // Worker starts as idle
      expect(worker.status).toBe('idle');

      // Resume does nothing since not paused
      worker.resume();
      expect(worker.status).toBe('idle');
    });

    it('should not pause if stopped', async () => {
      await worker.stop();
      expect(worker.status).toBe('stopped');

      worker.pause();
      expect(worker.status).toBe('stopped'); // Still stopped
    });

    it('should stop worker', async () => {
      await worker.stop();
      expect(worker.status).toBe('stopped');
    });
  });

  describe('health tracking - initial state', () => {
    it('should return initial health state', () => {
      const health = worker.getHealth();

      expect(health.status).toBe('idle');
      expect(health.totalExecutions).toBe(0);
      expect(health.successfulExecutions).toBe(0);
      expect(health.failedExecutions).toBe(0);
      expect(health.avgDurationMs).toBe(0);
      expect(health.recentResults).toEqual([]);
    });

    it('should calculate initial health score as 100%', () => {
      const health = worker.getHealth();

      // No executions = 100% success rate (1 default)
      expect(health.healthScore).toBe(100);
    });
  });

  describe('configuration validation', () => {
    it('should have valid priority', () => {
      expect(['low', 'normal', 'high', 'critical']).toContain(worker.config.priority);
    });

    it('should have positive intervalMs', () => {
      expect(worker.config.intervalMs).toBeGreaterThan(0);
    });

    it('should have positive timeoutMs', () => {
      expect(worker.config.timeoutMs).toBeGreaterThan(0);
    });

    it('should have non-negative retryCount', () => {
      expect(worker.config.retryCount).toBeGreaterThanOrEqual(0);
    });

    it('should have non-negative retryDelayMs', () => {
      expect(worker.config.retryDelayMs).toBeGreaterThanOrEqual(0);
    });

    it('should have at least one target domain', () => {
      expect(worker.config.targetDomains.length).toBeGreaterThan(0);
    });
  });
});
