/**
 * Test Re-Run Manager Tests
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * Tests for the in-memory queue that tracks which tests were affected by
 * infrastructure failures and should be re-run after recovery.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TestRerunManager,
  createTestRerunManager,
} from '../../../../src/strange-loop/infra-healing/test-rerun-manager.js';

// ============================================================================
// Test Re-Run Manager Tests
// ============================================================================

describe('TestRerunManager', () => {
  let manager: TestRerunManager;

  beforeEach(() => {
    manager = createTestRerunManager();
  });

  // ==========================================================================
  // Factory
  // ==========================================================================

  describe('createTestRerunManager factory', () => {
    it('creates an instance', () => {
      expect(createTestRerunManager()).toBeInstanceOf(TestRerunManager);
    });
  });

  // ==========================================================================
  // recordAffectedTests
  // ==========================================================================

  describe('recordAffectedTests()', () => {
    it('records test IDs for a service', () => {
      manager.recordAffectedTests('postgres', ['test-1', 'test-2']);
      const tests = manager.getTestsToRerun('postgres');
      expect(tests).toContain('test-1');
      expect(tests).toContain('test-2');
      expect(tests).toHaveLength(2);
    });

    it('ignores empty arrays', () => {
      manager.recordAffectedTests('postgres', []);
      expect(manager.hasPendingReruns()).toBe(false);
    });

    it('deduplicates test IDs', () => {
      manager.recordAffectedTests('postgres', ['test-1']);
      manager.recordAffectedTests('postgres', ['test-1']);
      const tests = manager.getTestsToRerun('postgres');
      expect(tests).toEqual(['test-1']);
    });

    it('handles multiple services', () => {
      manager.recordAffectedTests('postgres', ['pg-test-1']);
      manager.recordAffectedTests('redis', ['redis-test-1']);

      const pgTests = manager.getTestsToRerun('postgres');
      const redisTests = manager.getTestsToRerun('redis');

      expect(pgTests).toEqual(['pg-test-1']);
      expect(redisTests).toEqual(['redis-test-1']);
    });
  });

  // ==========================================================================
  // getTestsToRerun
  // ==========================================================================

  describe('getTestsToRerun()', () => {
    it('returns empty for unknown service', () => {
      expect(manager.getTestsToRerun('nonexistent')).toEqual([]);
    });

    it('returns tests in order recorded', () => {
      manager.recordAffectedTests('postgres', ['a', 'b', 'c']);
      const tests = manager.getTestsToRerun('postgres');
      expect(tests).toEqual(['a', 'b', 'c']);
    });
  });

  // ==========================================================================
  // clearRerunQueue
  // ==========================================================================

  describe('clearRerunQueue()', () => {
    it('clears queue for specific service', () => {
      manager.recordAffectedTests('postgres', ['test-1', 'test-2']);
      manager.clearRerunQueue('postgres');
      expect(manager.getTestsToRerun('postgres')).toEqual([]);
    });

    it('does not affect other services', () => {
      manager.recordAffectedTests('postgres', ['pg-test-1']);
      manager.recordAffectedTests('redis', ['redis-test-1']);

      manager.clearRerunQueue('postgres');

      expect(manager.getTestsToRerun('postgres')).toEqual([]);
      expect(manager.getTestsToRerun('redis')).toEqual(['redis-test-1']);
    });
  });

  // ==========================================================================
  // hasPendingReruns
  // ==========================================================================

  describe('hasPendingReruns()', () => {
    it('returns false initially', () => {
      expect(manager.hasPendingReruns()).toBe(false);
    });

    it('returns true after recording tests', () => {
      manager.recordAffectedTests('postgres', ['test-1']);
      expect(manager.hasPendingReruns()).toBe(true);
    });

    it('returns false after clearing all queues', () => {
      manager.recordAffectedTests('postgres', ['test-1']);
      manager.recordAffectedTests('redis', ['test-2']);

      manager.clearRerunQueue('postgres');
      manager.clearRerunQueue('redis');

      expect(manager.hasPendingReruns()).toBe(false);
    });
  });

  // ==========================================================================
  // getServicesWithPendingReruns
  // ==========================================================================

  describe('getServicesWithPendingReruns()', () => {
    it('returns empty initially', () => {
      expect(manager.getServicesWithPendingReruns()).toEqual([]);
    });

    it('returns services that have pending tests', () => {
      manager.recordAffectedTests('postgres', ['test-1']);
      manager.recordAffectedTests('redis', ['test-2']);

      const services = manager.getServicesWithPendingReruns();
      expect(services).toContain('postgres');
      expect(services).toContain('redis');
      expect(services).toHaveLength(2);
    });

    it('excludes services that have been cleared', () => {
      manager.recordAffectedTests('postgres', ['test-1']);
      manager.recordAffectedTests('redis', ['test-2']);

      manager.clearRerunQueue('postgres');

      const services = manager.getServicesWithPendingReruns();
      expect(services).toEqual(['redis']);
    });
  });

  // ==========================================================================
  // getPendingRerunCount
  // ==========================================================================

  describe('getPendingRerunCount()', () => {
    it('returns 0 initially', () => {
      expect(manager.getPendingRerunCount()).toBe(0);
    });

    it('returns total count across all services', () => {
      manager.recordAffectedTests('postgres', ['pg-1', 'pg-2']);
      manager.recordAffectedTests('redis', ['redis-1']);

      expect(manager.getPendingRerunCount()).toBe(3);
    });

    it('decreases after clearing a service', () => {
      manager.recordAffectedTests('postgres', ['pg-1', 'pg-2']);
      manager.recordAffectedTests('redis', ['redis-1']);

      manager.clearRerunQueue('postgres');

      expect(manager.getPendingRerunCount()).toBe(1);
    });
  });
});
