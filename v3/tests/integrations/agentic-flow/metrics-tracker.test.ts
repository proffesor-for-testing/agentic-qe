/**
 * Agentic QE v3 - MetricsTracker Tests
 *
 * Tests that metrics are properly recorded to SQLite and
 * success rates are calculated from real data, not hardcoded values.
 *
 * These tests verify the fix for the brutal honesty review finding
 * that "91.5% success rate" was a hardcoded constant.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  MetricsTracker,
  createMetricsTracker,
  resetMetricsTracker,
} from '../../../src/integrations/agentic-flow/metrics/metrics-tracker';
import type {
  MetricComponent,
  SuccessRateStats,
} from '../../../src/integrations/agentic-flow/metrics/types';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';

describe('MetricsTracker', () => {
  const testDbDir = '.agentic-qe-test';
  const testDbPath = `${testDbDir}/metrics-test.db`;

  beforeEach(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDbPath + '-wal')) {
      fs.unlinkSync(testDbPath + '-wal');
    }
    if (fs.existsSync(testDbPath + '-shm')) {
      fs.unlinkSync(testDbPath + '-shm');
    }

    // Reset singletons
    resetUnifiedMemory();
    resetMetricsTracker();
  });

  afterEach(async () => {
    // Reset singletons
    resetUnifiedMemory();
    resetMetricsTracker();

    // Clean up test database
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      if (fs.existsSync(testDbPath + '-wal')) {
        fs.unlinkSync(testDbPath + '-wal');
      }
      if (fs.existsSync(testDbPath + '-shm')) {
        fs.unlinkSync(testDbPath + '-shm');
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create and initialize successfully', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      expect(tracker).toBeDefined();
      expect(tracker.isInitialized()).toBe(true);

      await tracker.dispose();
    });

    it('should create metrics_outcomes table in database', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      // Record a test outcome to verify table exists
      await tracker.recordOutcome('booster', 'test-1', true, 5);

      const stats = await tracker.getSuccessRate('booster', 'all');
      expect(stats.total).toBe(1);

      await tracker.dispose();
    });
  });

  describe('recordOutcome', () => {
    it('should record successful outcomes', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      await tracker.recordOutcome('booster', 'task-1', true, 10, {
        subType: 'var-to-const',
        confidence: 0.95,
      });

      const stats = await tracker.getSuccessRate('booster', 'all');
      expect(stats.total).toBe(1);
      expect(stats.successes).toBe(1);
      expect(stats.rate).toBe(1.0);

      await tracker.dispose();
    });

    it('should record failed outcomes', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      await tracker.recordOutcome('booster', 'task-1', false, 10, {
        subType: 'var-to-const',
        errorMessage: 'Transform failed',
      });

      const stats = await tracker.getSuccessRate('booster', 'all');
      expect(stats.total).toBe(1);
      expect(stats.failures).toBe(1);
      expect(stats.rate).toBe(0.0);

      await tracker.dispose();
    });

    it('should record metadata correctly', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      await tracker.recordOutcome('booster', 'task-1', true, 15, {
        subType: 'add-types',
        confidence: 0.85,
        usedFallback: true,
        implementationUsed: 'typescript',
        itemCount: 5,
      });

      const stats = await tracker.getSuccessRate('booster', 'all');
      expect(stats.total).toBe(1);
      expect(stats.avgDurationMs).toBe(15);

      await tracker.dispose();
    });

    it('should record outcomes for all component types', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      const components: MetricComponent[] = ['booster', 'router', 'embeddings', 'reasoning'];

      for (const component of components) {
        await tracker.recordOutcome(component, `task-${component}`, true, 10);
      }

      for (const component of components) {
        const stats = await tracker.getSuccessRate(component, 'all');
        expect(stats.total).toBe(1);
      }

      await tracker.dispose();
    });
  });

  describe('getSuccessRate', () => {
    it('should calculate success rate from real data', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      // Record 7 successes and 3 failures (70% success rate)
      for (let i = 0; i < 7; i++) {
        await tracker.recordOutcome('booster', `success-${i}`, true, 5);
      }
      for (let i = 0; i < 3; i++) {
        await tracker.recordOutcome('booster', `failure-${i}`, false, 10);
      }

      const stats = await tracker.getSuccessRate('booster', 'all');

      // This is the key test: success rate is CALCULATED, not hardcoded
      expect(stats.rate).toBe(0.7);
      expect(stats.total).toBe(10);
      expect(stats.successes).toBe(7);
      expect(stats.failures).toBe(3);

      await tracker.dispose();
    });

    it('should return 0 rate when no data exists', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      const stats = await tracker.getSuccessRate('booster', 'all');

      expect(stats.rate).toBe(0);
      expect(stats.total).toBe(0);

      await tracker.dispose();
    });

    it('should calculate average duration correctly', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      await tracker.recordOutcome('booster', 'task-1', true, 10);
      await tracker.recordOutcome('booster', 'task-2', true, 20);
      await tracker.recordOutcome('booster', 'task-3', true, 30);

      const stats = await tracker.getSuccessRate('booster', 'all');

      expect(stats.avgDurationMs).toBe(20); // (10 + 20 + 30) / 3

      await tracker.dispose();
    });

    it('should isolate metrics by component', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      // Booster: 100% success
      await tracker.recordOutcome('booster', 'b-1', true, 5);
      await tracker.recordOutcome('booster', 'b-2', true, 5);

      // Router: 50% success
      await tracker.recordOutcome('router', 'r-1', true, 10);
      await tracker.recordOutcome('router', 'r-2', false, 10);

      const boosterStats = await tracker.getSuccessRate('booster', 'all');
      const routerStats = await tracker.getSuccessRate('router', 'all');

      expect(boosterStats.rate).toBe(1.0);
      expect(routerStats.rate).toBe(0.5);

      await tracker.dispose();
    });
  });

  describe('getMetricsSummary', () => {
    it('should provide comprehensive metrics across all components', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      await tracker.recordOutcome('booster', 'b-1', true, 5);
      await tracker.recordOutcome('router', 'r-1', true, 10);
      await tracker.recordOutcome('embeddings', 'e-1', true, 15);
      await tracker.recordOutcome('reasoning', 'rz-1', false, 20);

      const summary = await tracker.getMetricsSummary('all');

      expect(summary.overall.totalOperations).toBe(4);
      expect(summary.overall.successRate).toBe(0.75); // 3/4

      expect(summary.components.booster.totalOperations).toBe(1);
      expect(summary.components.router.totalOperations).toBe(1);
      expect(summary.components.embeddings.totalOperations).toBe(1);
      expect(summary.components.reasoning.totalOperations).toBe(1);

      await tracker.dispose();
    });

    it('should include per-subtype breakdown', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      // Multiple transform types for booster
      await tracker.recordOutcome('booster', 'b-1', true, 5, { subType: 'var-to-const' });
      await tracker.recordOutcome('booster', 'b-2', true, 5, { subType: 'var-to-const' });
      await tracker.recordOutcome('booster', 'b-3', false, 5, { subType: 'var-to-const' });
      await tracker.recordOutcome('booster', 'b-4', true, 10, { subType: 'add-types' });
      await tracker.recordOutcome('booster', 'b-5', true, 10, { subType: 'add-types' });

      const summary = await tracker.getMetricsSummary('all');
      const boosterSummary = summary.components.booster;

      expect(boosterSummary.bySubType.length).toBe(2);

      const varToConst = boosterSummary.bySubType.find(s => s.subType === 'var-to-const');
      const addTypes = boosterSummary.bySubType.find(s => s.subType === 'add-types');

      expect(varToConst?.total).toBe(3);
      expect(varToConst?.successRate).toBeCloseTo(0.667, 2);

      expect(addTypes?.total).toBe(2);
      expect(addTypes?.successRate).toBe(1.0);

      await tracker.dispose();
    });
  });

  describe('getPatternMetrics', () => {
    it('should return metrics suitable for pattern file updates', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      await tracker.recordOutcome('booster', 'b-1', true, 5, { subType: 'var-to-const' });
      await tracker.recordOutcome('booster', 'b-2', true, 5, { subType: 'var-to-const' });
      await tracker.recordOutcome('booster', 'b-3', false, 5, { subType: 'var-to-const' });

      const patternMetrics = await tracker.getPatternMetrics('booster', 'all');

      expect(patternMetrics.length).toBe(1);
      expect(patternMetrics[0].patternKey).toBe('booster-var-to-const');
      expect(patternMetrics[0].totalOperations).toBe(3);
      expect(patternMetrics[0].successRate).toBeCloseTo(0.667, 2);

      await tracker.dispose();
    });
  });

  describe('cleanup', () => {
    it('should remove old metrics based on retention policy', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
        retentionDays: 1, // Very short retention for testing
      });

      // Record some metrics
      await tracker.recordOutcome('booster', 'task-1', true, 5);
      await tracker.recordOutcome('booster', 'task-2', true, 5);

      // Manually trigger cleanup (won't delete anything since data is fresh)
      const deleted = await tracker.cleanup();
      expect(deleted).toBe(0);

      // Verify data still exists
      const stats = await tracker.getSuccessRate('booster', 'all');
      expect(stats.total).toBe(2);

      await tracker.dispose();
    });
  });

  describe('real vs hardcoded values', () => {
    it('should NOT return 0.915 (the old hardcoded value)', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      // Record data that would NOT naturally result in 91.5%
      // 8 successes and 2 failures = 80%
      for (let i = 0; i < 8; i++) {
        await tracker.recordOutcome('booster', `s-${i}`, true, 5);
      }
      for (let i = 0; i < 2; i++) {
        await tracker.recordOutcome('booster', `f-${i}`, false, 5);
      }

      const stats = await tracker.getSuccessRate('booster', 'all');

      // The key assertion: rate is calculated from real data
      expect(stats.rate).toBe(0.8); // 8/10 = 0.8
      expect(stats.rate).not.toBe(0.915); // NOT the old hardcoded value

      await tracker.dispose();
    });

    it('should return different rates for different data', async () => {
      const tracker = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      // First set: 90% success
      for (let i = 0; i < 9; i++) {
        await tracker.recordOutcome('booster', `s1-${i}`, true, 5);
      }
      await tracker.recordOutcome('booster', 'f1-0', false, 5);

      const stats1 = await tracker.getSuccessRate('booster', 'all');
      expect(stats1.rate).toBe(0.9);

      // Second component: 60% success
      for (let i = 0; i < 6; i++) {
        await tracker.recordOutcome('router', `s2-${i}`, true, 10);
      }
      for (let i = 0; i < 4; i++) {
        await tracker.recordOutcome('router', `f2-${i}`, false, 10);
      }

      const stats2 = await tracker.getSuccessRate('router', 'all');
      expect(stats2.rate).toBe(0.6);

      // Rates are different - calculated from real data!
      expect(stats1.rate).not.toBe(stats2.rate);

      await tracker.dispose();
    });
  });

  describe('persistence', () => {
    it('should persist metrics across tracker instances', async () => {
      // First instance: record data
      const tracker1 = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      await tracker1.recordOutcome('booster', 'task-1', true, 5);
      await tracker1.recordOutcome('booster', 'task-2', false, 5);

      await tracker1.dispose();

      // Reset singleton so we get a new instance
      resetUnifiedMemory();

      // Second instance: verify data persisted
      const tracker2 = await createMetricsTracker({
        dbPath: testDbPath,
        autoCleanup: false,
      });

      const stats = await tracker2.getSuccessRate('booster', 'all');

      // Data should be persisted
      expect(stats.total).toBe(2);
      expect(stats.rate).toBe(0.5);

      await tracker2.dispose();
    });
  });
});
